import "server-only";
import {
  can,
  channelSchema,
  decisionSchema,
  layoutSchema,
  mentionsAdmin,
  messageSchema,
  moderationSchema,
  postSchema,
  reservationSchema,
  roamingExpiry,
  roamingSchema,
  type HubItem,
  type SocialRoom,
} from "@pats/shared";
import { z } from "zod";
import { db } from "../db";
import { requireCityAccess, type AuthUser } from "../auth/current-user";
import { AppError } from "../http/errors";
import { atomic } from "../loyalty/transaction";
import { storage } from "../storage";
import { getSetting } from "../settings";
import { notifyUsers } from "../push/notify";
import {
  channelAccess,
  channelPolicyId,
  cityAccess,
  conversationAccess,
  memberFor,
  memberPosting,
  muteId,
  mutedUsers,
} from "./access";
import { publish } from "./realtime";
import { assertMedia, mediaReadUrl } from "./media";

const authorSelect = { id: true, name: true } as const;
const memberSelect = { fullName: true } as const;
async function admins(cityId: string) {
  return (
    await db.user.findMany({
      where: { role: "REGIONAL_ADMIN", cityId, status: "ACTIVE" },
      select: { id: true },
    })
  ).map((u) => u.id);
}
export async function hub(user: AuthUser) {
  const member = user.role === "MEMBER" ? await memberFor(user) : null;
  const homeCityId = member?.cityId ?? user.cityId;
  const grants = member
    ? await db.roamingRequest.findMany({
        where: {
          memberId: member.id,
          type: "SOCIAL_HUB",
          status: "APPROVED",
          accessExpiresAt: { gt: new Date() },
        },
        select: { targetCityId: true },
      })
    : [];
  const cityIds = [homeCityId, ...grants.map((g) => g.targetCityId)].filter(
    (v): v is string => Boolean(v),
  );
  const cities = await db.city.findMany({
    where: {
      active: true,
      ...(can(user.role, 'hq.manage') ? {} : { id: { in: cityIds } }),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const channels = await db.channel.findMany({
    where: {
      cityId: { in: cities.map((c) => c.id) },
      ...(member ? { archived: false, visibility: "MEMBERS" } : {}),
    },
    orderBy: [{ cityId: "asc" }, { name: "asc" }],
  });
  return {
    cities,
    homeCityId,
    channels: await Promise.all(
      channels.map(async (c) => ({
        ...c,
        memberPosting: c.kind === "TIMELINE" ? false : await memberPosting(c.id),
        canPostTimeline: can(user.role, "timeline.post"),
      })),
    ),
    rules: {
      timelinePosting: await getSetting(db, "hubTimelinePosting"),
      mediaMaxSeconds: await getSetting(db, "hubMediaMaxSeconds"),
      mediaMaxMb: await getSetting(db, "hubMediaMaxMb"),
      historyDays: await getSetting(db, "hubHistoryDays"),
    },
  };
}
export async function saveChannel(user: AuthUser, raw: unknown) {
  const input = channelSchema.parse(raw);
  requireCityAccess(user, input.cityId);
  const row = await atomic(async (tx) => {
    if (input.id) {
      const old = await tx.channel.findUnique({ where: { id: input.id } });
      if (!old) throw new AppError("NOT_FOUND", 404);
      requireCityAccess(user, old.cityId);
      if (old.cityId !== input.cityId || old.kind !== input.kind)
        throw new AppError("VALIDATION", 422);
    }
    const { id, memberPosting: policy, ...data } = input;
    const c = id
      ? await tx.channel.update({ where: { id }, data })
      : await tx.channel.create({ data });
    await tx.setting.upsert({
      where: { id: channelPolicyId(c.id) },
      create: {
        id: channelPolicyId(c.id),
        key: "hubChannelPosting",
        scope: "CITY",
        cityId: c.cityId,
        value: policy === null ? "DEFAULT" : policy,
        updatedById: user.id,
      },
      update: {
        value: policy === null ? "DEFAULT" : policy,
        updatedById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "hub.channel.saved",
        targetType: "Channel",
        targetId: c.id,
      },
    });
    return c;
  });
  await publish({ kind: "channel", id: row.id });
  return row;
}
export async function feed(
  user: AuthUser,
  room: SocialRoom,
  cursor?: string | null,
) {
  const days = await getSetting(db, "hubHistoryDays");
  const since = new Date(Date.now() - days * 86400000);
  const paging: { cursor?: { id: string }; skip?: number } = cursor
    ? { cursor: { id: z.string().min(1).max(150).parse(cursor) }, skip: 1 }
    : {};
  const dateFilter = { gte: since };
  const channel =
    room.kind === "channel"
      ? (await channelAccess(user, room.id)).channel
      : null;
  if (room.kind === "conversation") await conversationAccess(user, room.id);
  if (room.kind !== "channel" && room.kind !== "conversation") throw new AppError("VALIDATION", 422);
  let items: HubItem[];
  if (channel?.kind === "TIMELINE") {
    const rows = await db.post.findMany({
      where: { channelId: room.id, deletedAt: null, createdAt: dateFilter },
      include: { author: { select: authorSelect }, _count: { select: { reactions: true } }, reactions: { where: { userId: user.id }, select: { userId: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      ...paging,
      take: 50,
    });
    items = await Promise.all(
      rows.map(async (p) => ({
        id: p.id,
        reactionCount: p._count.reactions,
        reacted: p.reactions.length > 0,
        body: p.body,
        author: p.author,
        createdAt: p.createdAt.toISOString(),
        pinned: p.pinned,
        mediaType: p.mediaUrls.length ? ("IMAGE" as const) : ("TEXT" as const),
        mediaKey: p.mediaUrls[0] ?? null,
        mediaUrl: p.mediaUrls[0]
          ? await mediaReadUrl(user, p.mediaUrls[0], room)
          : null,
      })),
    );
  } else {
    const rows = await db.message.findMany({
      where: {
        ...(channel ? { channelId: room.id } : { conversationId: room.id }),
        createdAt: dateFilter,
      },
      include: { sender: { select: authorSelect } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...paging,
      take: 50,
    });
    items = await Promise.all(
      rows.map(async (m) => ({
        id: m.id,
        body: m.body,
        author: m.sender,
        createdAt: m.createdAt.toISOString(),
        pinned: false,
        mediaType: m.mediaType,
        mediaKey: m.mediaUrl,
        mediaUrl: m.mediaUrl
          ? await mediaReadUrl(user, m.mediaUrl, room)
          : null,
      })),
    );
  }
  return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
}
export async function sendMessage(user: AuthUser, raw: unknown) {
  const input = messageSchema.parse(raw);
  const room: SocialRoom = input.channelId
    ? { kind: "channel", id: input.channelId }
    : { kind: "conversation", id: input.conversationId! };
  let cityId: string;
  if (input.channelId) {
    const { channel } = await channelAccess(user, input.channelId, true);
    if (channel.kind !== "CHAT") throw new AppError("VALIDATION", 422);
    cityId = channel.cityId;
  } else
    cityId = (await conversationAccess(user, input.conversationId!)).cityId;
  if (input.mediaKey)
    await assertMedia(user, input.mediaKey, room, input.mediaType);
  const row = await atomic(async (tx) => {
    if (input.channelId) await channelAccess(user, input.channelId, true, tx);
    else await conversationAccess(user, input.conversationId!, tx);
    if (input.clientId) {
      const existing = await tx.message.findUnique({
        where: { senderId_clientId: { senderId: user.id, clientId: input.clientId } },
      });
      if (existing) {
        const sameRoom = input.channelId
          ? existing.channelId === input.channelId
          : existing.conversationId === input.conversationId;
        if (!sameRoom) throw new AppError("VALIDATION", 422);
        return { ...existing, duplicate: true };
      }
    }
    const created = await tx.message.create({
      data: {
        channelId: input.channelId,
        conversationId: input.conversationId,
        senderId: user.id,
        clientId: input.clientId,
        body: input.body,
        mediaUrl: input.mediaKey,
        mediaType: input.mediaType,
        mentionsAdmin: mentionsAdmin(input.body),
      },
    });
    return { ...created, duplicate: false };
  });
  // A retried send that was already stored must not notify or publish twice.
  if (row.duplicate) return { id: row.id };
  if (row.mentionsAdmin)
    await notifyUsers(await admins(cityId), {
      kind: "hubMention",
      cityId,
      values: { sender: user.name, message: input.body.slice(0, 120) },
      data: {
        screen: "hub",
        channelId: input.channelId ?? "",
        conversationId: input.conversationId ?? "",
      },
    });
  await publish(room);
  return { id: row.id };
}
export async function createPost(user: AuthUser, raw: unknown) {
  const input = postSchema.parse(raw);
  const { channel } = await channelAccess(user, input.channelId, true);
  if (channel.kind !== "TIMELINE") throw new AppError("VALIDATION", 422);
  const room: SocialRoom = { kind: "channel", id: channel.id };
  if (input.mediaKey) await assertMedia(user, input.mediaKey, room, "IMAGE");
  const row = await atomic(async (tx) => {
    await channelAccess(user, input.channelId, true, tx);
    return tx.post.create({
      data: {
        channelId: channel.id,
        authorId: user.id,
        body: input.body,
        mediaUrls: input.mediaKey ? [input.mediaKey] : [],
      },
    });
  });
  await publish(room);
  return { id: row.id };
}
export async function moderate(user: AuthUser, raw: unknown) {
  const input = moderationSchema.parse(raw);
  let room: SocialRoom | null = null;
  await atomic(async (tx) => {
    if (input.action === "mute") {
      requireCityAccess(user, input.cityId);
      const target = await tx.user.findUnique({ where: { id: input.userId } });
      if (!target || target.role !== "MEMBER")
        throw new AppError("VALIDATION", 422);
      const ids = new Set(await mutedUsers(input.cityId, tx));
      if (input.muted) ids.add(input.userId);
      else ids.delete(input.userId);
      await tx.setting.upsert({
        where: { id: muteId(input.cityId) },
        create: {
          id: muteId(input.cityId),
          key: "hubMutedUsers",
          scope: "CITY",
          cityId: input.cityId,
          value: [...ids],
          updatedById: user.id,
        },
        update: { value: [...ids], updatedById: user.id },
      });
    } else if (input.action === "deleteMessage") {
      const m = await tx.message.findUnique({
        where: { id: input.id },
        include: { channel: true },
      });
      if (!m?.channel) throw new AppError("NOT_FOUND", 404);
      requireCityAccess(user, m.channel.cityId);
      await tx.message.delete({ where: { id: m.id } });
      room = { kind: "channel", id: m.channel.id };
    } else {
      const p = await tx.post.findUnique({
        where: { id: input.id },
        include: { channel: true },
      });
      if (!p || p.deletedAt) throw new AppError("NOT_FOUND", 404);
      requireCityAccess(user, p.channel.cityId);
      await tx.post.update({
        where: { id: p.id },
        data:
          input.action === "pin"
            ? { pinned: input.pinned }
            : { deletedAt: new Date() },
      });
      room = { kind: "channel", id: p.channelId };
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: `hub.${input.action}`,
        targetType: "Hub",
        meta: input,
      },
    });
  });
  if (room) await publish(room);
  return { ok: true };
}
export async function requestRoaming(user: AuthUser, raw: unknown) {
  const input = roamingSchema.parse(raw);
  const row = await atomic(async (tx) => {
    const m = await memberFor(user, tx);
    const event = await tx.event.findUnique({ where: { id: input.eventId } });
    if (!event || event.status === "DRAFT" || event.endsAt <= new Date())
      throw new AppError("EVENT_ENDED", 409);
    if (event.cityId === m.cityId) throw new AppError("VALIDATION", 422);
    const existing = await tx.roamingRequest.findFirst({
      where: {
        memberId: m.id,
        eventId: event.id,
        type: input.type,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    if (existing) throw new AppError("REQUEST_PENDING", 409);
    const limit = await getSetting(tx, "roamingMaxPerMonth");
    const now = new Date();
    const month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    if (
      limit &&
      (await tx.roamingRequest.count({
        where: {
          memberId: m.id,
          type: input.type,
          status: { not: "REJECTED" },
          createdAt: { gte: month },
        },
      })) > 0
    )
      throw new AppError("ROAMING_LIMIT", 409);
    return tx.roamingRequest.create({
      data: {
        memberId: m.id,
        eventId: event.id,
        targetCityId: event.cityId,
        type: input.type,
      },
      include: { event: true },
    });
  });
  const recipients =
    input.type === "ATTENDANCE"
      ? await admins(row.targetCityId)
      : (
          await db.user.findMany({
            where: { role: "SUPER_ADMIN", status: "ACTIVE" },
            select: { id: true },
          })
        ).map((u) => u.id);
  await notifyUsers(recipients, {
    kind: "roamingRequested",
    values: { sender: user.name, event: row.event.title },
    data: { screen: "social-operations" },
  });
  return { id: row.id };
}
export async function decideRoaming(user: AuthUser, raw: unknown) {
  const input = decisionSchema.parse(raw);
  const row = await atomic(async (tx) => {
    const r = await tx.roamingRequest.findUnique({
      where: { id: input.id },
      include: { event: true, member: { select: { userId: true } } },
    });
    if (!r) throw new AppError("NOT_FOUND", 404);
    if (r.type === "SOCIAL_HUB") {
      if (!can(user.role, 'hq.manage')) throw new AppError("FORBIDDEN", 403);
    } else {
      if (!can(user.role, 'city.operations')) throw new AppError("FORBIDDEN", 403);
      requireCityAccess(user, r.targetCityId);
    }
    if (r.status !== "PENDING") throw new AppError("REQUEST_DECIDED", 409);
    if (r.event.endsAt <= new Date()) throw new AppError("EVENT_ENDED", 409);
    const expiry = roamingExpiry(
      r.event.endsAt,
      r.type,
      await getSetting(tx, "roamingHubExpiryHours"),
    );
    await tx.roamingRequest.update({
      where: { id: r.id },
      data: {
        status: input.decision,
        decidedById: user.id,
        decidedAt: new Date(),
        accessExpiresAt: input.decision === "APPROVED" ? expiry : null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "roaming.decided",
        targetType: "RoamingRequest",
        targetId: r.id,
        meta: input,
      },
    });
    return r;
  });
  await notifyUsers([row.member.userId], {
    kind: "roamingDecided",
    values: {
      event: row.event.title,
      status: (locale) =>
        input.decision === "APPROVED"
          ? locale === "id"
            ? "disetujui"
            : "approved"
          : locale === "id"
            ? "ditolak"
            : "rejected",
    },
    data: { screen: "roaming" },
  });
  return { ok: true };
}
export async function reservationOptions(user: AuthUser, eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { venue: true },
  });
  if (!event?.venue || event.status === "DRAFT")
    throw new AppError("NOT_FOUND", 404);
  await cityAccess(user, event.cityId);
  const layout = layoutSchema.safeParse(event.venue.layout);
  const taken = await db.reservation.findMany({
    where: { eventId, status: "CONFIRMED" },
    select: { slotCode: true },
  });
  return {
    slots: layout.success ? layout.data.slots : [],
    taken: taken.map((r) => r.slotCode),
    eventTitle: event.title,
    venueName: event.venue.name,
  };
}
export async function reserve(user: AuthUser, raw: unknown) {
  const input = reservationSchema.parse(raw);
  const row = await atomic(async (tx) => {
    const m = await memberFor(user, tx);
    const e = await tx.event.findUnique({
      where: { id: input.eventId },
      include: { venue: true },
    });
    if (!e?.venue || e.status === "DRAFT" || e.endsAt <= new Date())
      throw new AppError("EVENT_ENDED", 409);
    await cityAccess(user, e.cityId, tx);
    const layout = layoutSchema.parse(e.venue.layout);
    const slot = layout.slots.find((s) => s.code === input.slotCode);
    if (!slot || input.pax > slot.pax) throw new AppError("VALIDATION", 422);
    if (
      await tx.reservation.findFirst({
        where: {
          eventId: e.id,
          slotCode: slot.code,
          OR: [{ status: "CONFIRMED" }, { status: "PENDING", memberId: m.id }],
        },
      })
    )
      throw new AppError("SLOT_TAKEN", 409);
    await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${m.id} FOR UPDATE`;
    if (
      (await tx.reservation.count({
        where: {
          memberId: m.id,
          downPaymentAt: null,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      })) > 0
    )
      throw new AppError("RESERVATION_LIMIT", 409);
    return tx.reservation.create({
      data: {
        ...input,
        venueId: e.venue.id,
        minimumCharge: slot.minimumCharge ?? e.venue.minimumCharge,
        memberId: m.id,
        conversation: {
          create: { kind: "RESERVATION", cityId: e.cityId, memberId: m.id },
        },
      },
      include: { conversation: true, event: true },
    });
  });
  const approver = await getSetting(db, "reservationApprover", {
    cityId: row.event.cityId,
  });
  const recipients =
    approver === "REGIONAL_ADMIN"
      ? await admins(row.event.cityId)
      : (
          await db.user.findMany({
            where: { role: "SUPER_ADMIN", status: "ACTIVE" },
            select: { id: true },
          })
        ).map((u) => u.id);
  await notifyUsers(recipients, {
    kind: "reservationRequested",
    values: { sender: user.name, event: row.event.title, slot: row.slotCode },
    data: { screen: "social-operations" },
  });
  return { id: row.id, conversationId: row.conversation!.id };
}
export async function decideReservation(user: AuthUser, raw: unknown) {
  const input = z
    .object({
      id: z.string(),
      status: z.enum(["CONFIRMED", "REJECTED", "CANCELLED"]),
    })
    .parse(raw);
  const row = await atomic(async (tx) => {
    const r = await tx.reservation.findUnique({
      where: { id: input.id },
      include: {
        event: true,
        member: { select: { userId: true } },
        conversation: true,
        venue: true,
      },
    });
    if (!r) throw new AppError("NOT_FOUND", 404);
    if (user.role === "MEMBER") {
      if (r.member.userId !== user.id || input.status !== "CANCELLED")
        throw new AppError("FORBIDDEN", 403);
    } else {
      requireCityAccess(user, r.event.cityId);
    }
    if (
      !["PENDING", "CONFIRMED"].includes(r.status) ||
      (r.status === "CONFIRMED" && input.status !== "CANCELLED")
    )
      throw new AppError("REQUEST_DECIDED", 409);
    if (input.status === "CONFIRMED") {
      if (r.event.endsAt <= new Date()) throw new AppError("EVENT_ENDED", 409);
      const slot = layoutSchema
        .parse(r.venue.layout)
        .slots.find((s) => s.code === r.slotCode);
      if (!slot || r.pax > slot.pax) throw new AppError("VALIDATION", 422);
      if (
        await tx.reservation.findFirst({
          where: {
            eventId: r.eventId,
            slotCode: r.slotCode,
            status: "CONFIRMED",
          },
        })
      )
        throw new AppError("SLOT_TAKEN", 409);
    }
    await tx.reservation.update({
      where: { id: r.id },
      data: { status: input.status },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "reservation.decided",
        targetType: "Reservation",
        targetId: r.id,
        meta: input,
      },
    });
    return r;
  });
  await notifyUsers([row.member.userId], {
    kind: "reservationDecided",
    values: {
      event: row.event.title,
      slot: row.slotCode,
      status: (locale) =>
        ({
          CONFIRMED: locale === "id" ? "dikonfirmasi" : "confirmed",
          REJECTED: locale === "id" ? "ditolak" : "rejected",
          CANCELLED: locale === "id" ? "dibatalkan" : "cancelled",
        })[input.status],
    },
    data: { screen: "reservations" },
  });
  if (row.conversation)
    await publish({ kind: "conversation", id: row.conversation.id });
  return { ok: true };
}
export async function saveLayout(user: AuthUser, raw: unknown) {
  const input = z
    .object({ venueId: z.string(), layout: layoutSchema, minimumCharge: z.number().int().min(0).max(2_000_000_000).optional() })
    .parse(raw);
  await atomic(async (tx) => {
    const v = await tx.venue.findUnique({ where: { id: input.venueId } });
    if (!v) throw new AppError("NOT_FOUND", 404);
    requireCityAccess(user, v.cityId);
    const active = await tx.reservation.findMany({
      where: {
        venueId: v.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        event: { endsAt: { gt: new Date() } },
      },
    });
    if (
      active.some(
        (r) =>
          !input.layout.slots.some(
            (s) => s.code === r.slotCode && s.pax >= r.pax,
          ),
      )
    )
      throw new AppError("SLOT_TAKEN", 409);
    await tx.venue.update({
      where: { id: v.id },
      data: { layout: input.layout, minimumCharge: input.minimumCharge },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "venue.layout.saved",
        targetType: "Venue",
        targetId: v.id,
      },
    });
  });
  return { ok: true };
}
export async function operations(user: AuthUser) {
  const member = user.role === "MEMBER" ? await memberFor(user) : null;
  const city = can(user.role, 'hq.manage') ? undefined : user.cityId!;
  const [reservations, roaming, venues, events] = await Promise.all([
    db.reservation.findMany({
      where: member ? { memberId: member.id } : { event: { cityId: city } },
      include: {
        member: { select: memberSelect },
        event: { select: { title: true, cityId: true } },
        conversation: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.roamingRequest.findMany({
      where: member ? { memberId: member.id } : { targetCityId: city },
      include: {
        member: { select: memberSelect },
        event: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    member
      ? []
      : db.venue.findMany({
          // Venues of deactivated cities stay out of the floor-plan editor.
          where: { cityId: city, city: { active: true } },
          select: { id: true, name: true, cityId: true, layout: true, minimumCharge: true, city: { select: { name: true } } },
          orderBy: [{ city: { name: "asc" } }, { name: "asc" }],
        }),
    member
      ? []
      : db.screenshotEvent.findMany({
          where: city ? { channel: { cityId: city } } : {},
          select: { memberId: true, member: { select: memberSelect } },
        }),
  ]);
  const counts = new Map<
    string,
    { memberId: string; name: string; count: number }
  >();
  for (const e of events) {
    const v = counts.get(e.memberId) ?? {
      memberId: e.memberId,
      name: e.member.fullName,
      count: 0,
    };
    v.count++;
    counts.set(e.memberId, v);
  }
  const mutes = member
    ? []
    : await db.setting.findMany({
        where: { key: "hubMutedUsers", cityId: city },
      });
  const muted = [];
  for (const row of mutes) {
    const ids = Array.isArray(row.value)
      ? row.value.filter((v): v is string => typeof v === "string")
      : [];
    const users = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    muted.push(
      ...users.map((u) => ({
        cityId: row.cityId!,
        userId: u.id,
        name: u.name,
      })),
    );
  }
  return {
    reservations: await Promise.all(
      reservations.map(async (r) => ({
        ...r,
        canDecide:
          !member &&
          user.role !== "MEMBER",
      })),
    ),
    roaming: roaming.map((r) => ({
      ...r,
      status:
        r.status === "APPROVED" &&
        (!r.accessExpiresAt || r.accessExpiresAt <= new Date())
          ? "EXPIRED"
          : r.status,
    })),
    venues: venues.map(({ city: venueCity, ...v }) => ({
      ...v,
      cityName: venueCity.name,
      layout: layoutSchema.safeParse(v.layout).success
        ? v.layout
        : { slots: [] },
    })),
    screenshots: [...counts.values()],
    muted,
  };
}
export async function cleanup() {
  const now = new Date();
  const days = await getSetting(db, "hubHistoryDays");
  const before = new Date(now.getTime() - days * 86400000);
  const expired = await db.roamingRequest.updateMany({
    where: {
      OR: [
        { status: "APPROVED", accessExpiresAt: { lte: now } },
        { status: "PENDING", event: { endsAt: { lte: now } } },
      ],
    },
    data: { status: "EXPIRED" },
  });
  const old = await db.message.findMany({
    where: { createdAt: { lt: before } },
    select: { id: true, mediaUrl: true },
    take: 500,
  });
  // Delete media before rows, so a storage outage leaves the work discoverable by the next run.
  for (const key of new Set(
    old.flatMap((m) => (m.mediaUrl ? [m.mediaUrl] : [])),
  )) {
    const inUse = await db.message.count({
      where: { mediaUrl: key, createdAt: { gte: before } },
    });
    const postUse = await db.post.count({
      where: { mediaUrls: { has: key }, deletedAt: null },
    });
    if (!inUse && !postUse) {
      await storage().remove(key);
      await storage().remove(`${key}.json`);
    }
  }
  const messages = await db.message.deleteMany({
    where: { id: { in: old.map((m) => m.id) } },
  });
  return { expired: expired.count, messages: messages.count };
}

export async function reactToPost(user: AuthUser, raw: unknown) {
  const input = z.object({ postId: z.string(), active: z.boolean() }).parse(raw);
  const channelId = await atomic(async tx => {
    const post = await tx.post.findUnique({ where: { id: input.postId } });
    if (!post || post.deletedAt) throw new AppError('NOT_FOUND', 404);
    await channelAccess(user, post.channelId, false, tx);
    if (input.active) await tx.postReaction.upsert({ where: { postId_userId: { postId: post.id, userId: user.id } }, create: { postId: post.id, userId: user.id }, update: {} });
    else await tx.postReaction.deleteMany({ where: { postId: post.id, userId: user.id } });
    return post.channelId;
  });
  await publish({ kind: 'channel', id: channelId });
  return { saved: true };
}
