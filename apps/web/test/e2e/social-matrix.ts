/** Phase 4 integration matrix. Writes only to a dedicated phase-4 database. */
import "dotenv/config";
import { toZonedInput } from "@pats/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { io } from "socket.io-client";
import { PrismaClient, type User } from "../../src/generated/prisma";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
if (!new URL(process.env.DATABASE_URL!).pathname.includes("_p4"))
  throw new Error("Use a dedicated phase-4 database");
const base = process.env.BASE_URL ?? "http://localhost:3014";
const prefix = `p4-${randomUUID().slice(0, 8)}`;
const users: User[] = [],
  cityIds: string[] = [],
  memberIds: string[] = [];
const savedSettings = new Map<
  string,
  Awaited<ReturnType<typeof db.setting.findUnique>>
>();
async function setting(key: string, value: number | string, cityId?: string) {
  const id = `${cityId ? "CITY" : "GLOBAL"}:${cityId ?? ""}:${key}`;
  if (!savedSettings.has(id))
    savedSettings.set(id, await db.setting.findUnique({ where: { id } }));
  await db.setting.upsert({
    where: { id },
    create: { id, key, value, scope: cityId ? "CITY" : "GLOBAL", cityId },
    update: { value },
  });
}
const results: { name: string; pass: boolean }[] = [];
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function check(name: string, pass: boolean) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}
async function api(
  path: string,
  token: string,
  body?: unknown,
  method?: string,
) {
  const res = await fetch(`${base}/api/${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: Json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
async function actor(
  role: "MEMBER" | "REGIONAL_ADMIN" | "SUPER_ADMIN",
  cityId?: string,
) {
  const id = `${prefix}-${users.length}`;
  const user = await db.user.create({
    data: {
      id,
      email: `${id}@patsuniv.test`,
      phone: `+628111${Date.now()}${users.length}`,
      name: id,
      role,
      cityId: role === "REGIONAL_ADMIN" ? cityId : undefined,
    },
  });
  users.push(user);
  let memberId = "";
  if (role === "MEMBER") {
    const m = await db.member.create({
      data: {
        userId: user.id,
        cityId: cityId!,
        nim: id,
        fullName: id,
        dateOfBirth: new Date("2000-01-01"),
        favoriteSong: "Song",
        favoriteGenre: "Pop",
        consentAt: new Date(),
      },
    });
    memberId = m.id;
    memberIds.push(m.id);
  }
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: randomUUID(),
      client: "APP",
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const token = await new SignJWT({ sid: session.id, role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer("pats-univ")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(`${process.env.AUTH_SECRET}:access`));
  return { user, memberId, token, sessionId: session.id };
}
async function main() {
  const existing = await db.city.findMany({ take: 2 });
  cityIds.push(...existing.map((c) => c.id));
  const [cityA, cityB] = cityIds;
  const hq = await actor("SUPER_ADMIN"),
    adminA = await actor("REGIONAL_ADMIN", cityA),
    adminB = await actor("REGIONAL_ADMIN", cityB),
    a = await actor("MEMBER", cityA),
    a2 = await actor("MEMBER", cityA),
    b = await actor("MEMBER", cityB);
  const venue = await db.venue.create({
    data: { id: `${prefix}-venue`, cityId: cityA!, name: prefix },
  });
  const event = await db.event.create({
    data: {
      id: `${prefix}-event`,
      cityId: cityA!,
      venueId: venue.id,
      title: prefix,
      status: "OPEN",
      startsAt: new Date(Date.now() - 3600000),
      endsAt: new Date(Date.now() + 7200000),
      checkInOpensAt: new Date(Date.now() - 3600000),
      checkInClosesAt: new Date(Date.now() + 7200000),
    },
  });
  const channel = await api("social/channels", adminA.token, {
    cityId: cityA,
    name: prefix,
    kind: "CHAT",
  });
  const channelId = channel.json.id;
  check(
    "City crew creates a channel",
    channel.status === 200 && Boolean(channelId),
  );
  check(
    "Other city crew cannot create or edit channel",
    (
      await api("social/channels", adminB.token, {
        id: channelId,
        cityId: cityA,
        name: prefix,
        kind: "CHAT",
      })
    ).status === 403,
  );
  const timeline = await api("social/channels", adminA.token, {
    cityId: cityA,
    name: `${prefix}-timeline`,
    kind: "TIMELINE",
  });
  const timelineId = timeline.json.id;
  check(
    "Member sees home channels",
    (await api("social/hub", a.token)).json.channels.some(
      (c: Json) => c.id === channelId,
    ),
  );
  check(
    "Other city cannot read or join channel",
    (await api(`social/feed?kind=channel&id=${channelId}`, b.token)).status ===
      403 &&
      (await api("social/socket", b.token, { kind: "channel", id: channelId }))
        .status === 403,
  );
  const sent = await api("social/messages", a.token, {
    channelId,
    body: "Hello @ADMIN",
  });
  check(
    "Text saved and city admins notified",
    sent.status === 200 &&
      (await db.notification.count({
        where: { userId: adminA.user.id, kind: "hubMention" },
      })) === 1 &&
      (await db.notification.count({
        where: { userId: adminB.user.id, kind: "hubMention" },
      })) === 0,
  );
  const post = await api("social/posts", a.token, {
    channelId: timelineId,
    body: "Timeline story",
  });
  check("Members can post by default", post.status === 200);
  check(
    "Pin works for city crew",
    (
      await api("social/moderate", adminA.token, {
        action: "pin",
        id: post.json.id,
        pinned: true,
      })
    ).status === 200,
  );
  check(
    "Other city cannot moderate",
    (
      await api("social/moderate", adminB.token, {
        action: "deletePost",
        id: post.json.id,
      })
    ).status === 403,
  );
  await api("social/channels", adminA.token, {
    id: timelineId,
    cityId: cityA,
    name: prefix,
    kind: "TIMELINE",
    memberPosting: false,
  });
  check(
    "Per-channel admin-only posting enforced",
    (
      await api("social/posts", a.token, {
        channelId: timelineId,
        body: "blocked",
      })
    ).status === 403,
  );
  await api("social/moderate", adminA.token, {
    action: "mute",
    cityId: cityA,
    userId: a.user.id,
    muted: true,
  });
  check(
    "Mute stops member messages",
    (await api("social/messages", a.token, { channelId, body: "blocked" })).json
      .error?.code === "HUB_MUTED",
  );
  await api("social/moderate", adminA.token, {
    action: "mute",
    cityId: cityA,
    userId: a.user.id,
    muted: false,
  });
  const upload = await api("social/upload", a.token, {
    room: { kind: "channel", id: channelId },
    contentType: "image/png",
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG6kAAAAASUVORK5CYII=",
    "base64",
  );
  const put = await fetch(upload.json.url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png,
  });
  check("Presigned upload goes through private storage", put.status === 201);
  check(
    "Upload cannot overwrite",
    (
      await fetch(upload.json.url, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: png,
      })
    ).status === 409,
  );
  check(
    "Another user cannot attach uploaded media",
    (
      await api("social/messages", a2.token, {
        channelId,
        body: "",
        mediaType: "IMAGE",
        mediaKey: upload.json.key,
      })
    ).status === 403,
  );
  const mediaMessage = await api("social/messages", a.token, {
    channelId,
    body: "photo",
    mediaType: "IMAGE",
    mediaKey: upload.json.key,
  });
  check("Owner can attach uploaded media", mediaMessage.status === 200);
  const feed = await api(`social/feed?kind=channel&id=${channelId}`, a.token);
  const image = feed.json.items.find(
    (i: Json) => i.id === mediaMessage.json.id,
  );
  check(
    "Media URL is private and readable",
    (await fetch(image.mediaUrl)).status === 200,
  );
  check(
    "Tampered signature rejected",
    (await fetch(`${image.mediaUrl}x`)).status === 403,
  );
  await api("social/moderate", adminA.token, {
    action: "deleteMessage",
    id: mediaMessage.json.id,
  });
  check(
    "Deleted content invalidates existing media URL",
    (await fetch(image.mediaUrl)).status === 404,
  );
  check(
    "Screenshot recorded for owner",
    (await api("social/screenshot", a.token, { channelId, platform: "IOS" }))
      .status === 200 &&
      (await db.screenshotEvent.count({ where: { memberId: a.memberId } })) ===
        1,
  );
  check(
    "Screenshot cannot spoof another city",
    (await api("social/screenshot", b.token, { channelId, platform: "IOS" }))
      .status === 403,
  );
  const attendance = await api("social/roaming", b.token, {
    eventId: event.id,
    type: "ATTENDANCE",
  });
  const social = await api("social/roaming", b.token, {
    eventId: event.id,
    type: "SOCIAL_HUB",
  });
  check(
    "Both roaming types requested",
    attendance.status === 200 && social.status === 200,
  );
  check(
    "Duplicate request refused",
    (
      await api("social/roaming", b.token, {
        eventId: event.id,
        type: "SOCIAL_HUB",
      })
    ).json.error?.code === "REQUEST_PENDING",
  );
  check(
    "Attendance approval belongs to target city",
    (
      await api("social/roaming-decision", adminB.token, {
        id: attendance.json.id,
        decision: "APPROVED",
      })
    ).status === 403,
  );
  check(
    "Local crew cannot approve social hub",
    (
      await api("social/roaming-decision", adminA.token, {
        id: social.json.id,
        decision: "APPROVED",
      })
    ).status === 403,
  );
  check(
    "HQ does not replace target crew for attendance",
    (
      await api("social/roaming-decision", hq.token, {
        id: attendance.json.id,
        decision: "APPROVED",
      })
    ).status === 403,
  );
  check(
    "Target crew approves attendance",
    (
      await api("social/roaming-decision", adminA.token, {
        id: attendance.json.id,
        decision: "APPROVED",
      })
    ).status === 200,
  );
  check(
    "Attendance alone grants no hub access",
    (await api(`social/feed?kind=channel&id=${channelId}`, b.token)).status ===
      403,
  );
  const scan = await api("admin/check-in", adminA.token, {
    eventId: event.id,
    method: "MANUAL",
    memberId: b.memberId,
    reason: "Approved roaming matrix",
  });
  check(
    "Approved attendance allows target-city check-in",
    scan.status === 201 &&
      (await db.checkIn.count({
        where: { memberId: b.memberId, roamingRequestId: attendance.json.id },
      })) === 1,
  );
  check(
    "HQ approves social hub",
    (
      await api("social/roaming-decision", hq.token, {
        id: social.json.id,
        decision: "APPROVED",
      })
    ).status === 200,
  );
  const grant = await db.roamingRequest.findUniqueOrThrow({
    where: { id: social.json.id },
  });
  check(
    "Hub expiry is event end plus configured 48 hours",
    grant.accessExpiresAt!.getTime() - event.endsAt.getTime() === 48 * 3600000,
  );
  const detail = await api(`admin/events/${event.id}`, adminA.token);
  const targetCity = await db.city.findUniqueOrThrow({ where: { id: cityA } });
  const updatedEnd = toZonedInput(
    new Date(event.endsAt.getTime() + 3600000),
    targetCity.timezone,
  );
  const edited = await api(
    `admin/events/${event.id}`,
    adminA.token,
    { ...detail.json.form, endTime: updatedEnd.time },
    "PATCH",
  );
  const updatedGrant = await db.roamingRequest.findUniqueOrThrow({
    where: { id: social.json.id },
  });
  const updatedAttendance = await db.roamingRequest.findUniqueOrThrow({
    where: { id: attendance.json.id },
  });
  check(
    "Event end changes update both approved expiry types",
    edited.status === 200 &&
      updatedGrant.accessExpiresAt!.getTime() ===
        new Date(edited.json.event.endsAt).getTime() + 48 * 3600000 &&
      updatedAttendance.accessExpiresAt!.getTime() ===
        new Date(edited.json.event.endsAt).getTime(),
  );
  check(
    "Approved roaming opens target hub",
    (await api(`social/feed?kind=channel&id=${channelId}`, b.token)).status ===
      200,
  );
  const credentials = await api("social/token", b.token);
  const client = io(credentials.json.url, {
    auth: { token: credentials.json.token },
    transports: ["websocket"],
    reconnection: false,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    check(
      "Socket room accepts approved roamer",
      (
        await client
          .timeout(5000)
          .emitWithAck("join", { kind: "channel", id: channelId })
      ).ok,
    );
    const message = await client
      .timeout(10000)
      .emitWithAck("message", { channelId, body: "Socket message" });
    check(
      "Socket message persists",
      message.ok &&
        (await db.message.count({ where: { id: message.id } })) === 1,
    );
    await db.roamingRequest.update({
      where: { id: social.json.id },
      data: { accessExpiresAt: new Date(Date.now() - 1) },
    });
    check(
      "Expiry enforced without waiting for cron",
      (await api(`social/feed?kind=channel&id=${channelId}`, b.token))
        .status === 403 &&
        !(
          await client
            .timeout(10000)
            .emitWithAck("message", { channelId, body: "expired" })
        ).ok,
    );
  } finally {
    client.disconnect();
  }
  const layout = {
    slots: [
      {
        code: "S1",
        kind: "SOFA",
        x: 0,
        y: 0,
        w: 3,
        h: 3,
        pax: 4,
        minimumSpend: "Rp 500.000",
      },
      { code: "S2", kind: "TABLE", x: 4, y: 0, w: 2, h: 2, pax: 2 },
    ],
  };
  check(
    "Floor plan saved",
    (await api("social/layout", hq.token, { venueId: venue.id, layout }))
      .status === 200,
  );
  check(
    "Other city cannot edit floor plan",
    (await api("social/layout", adminB.token, { venueId: venue.id, layout }))
      .status === 403,
  );
  check(
    "Oversized party rejected",
    (
      await api("social/reserve", a.token, {
        eventId: event.id,
        slotCode: "S1",
        pax: 5,
      })
    ).status === 422,
  );
  const [r1, r2] = await Promise.all([
    api("social/reserve", a.token, {
      eventId: event.id,
      slotCode: "S1",
      pax: 2,
    }),
    api("social/reserve", a2.token, {
      eventId: event.id,
      slotCode: "S1",
      pax: 3,
    }),
  ]);
  check(
    "Reservation opens private conversation",
    r1.status === 200 && Boolean(r1.json.conversationId),
  );
  check(
    "Conversation private to member and city crew",
    (
      await api(
        `social/feed?kind=conversation&id=${r1.json.conversationId}`,
        a2.token,
      )
    ).status === 403 &&
      (
        await api(
          `social/feed?kind=conversation&id=${r1.json.conversationId}`,
          adminB.token,
        )
      ).status === 403,
  );
  check(
    "Crew can chat with reserving member",
    (
      await api("social/messages", adminA.token, {
        conversationId: r1.json.conversationId,
        body: "Welcome",
      })
    ).status === 200,
  );
  check(
    "One active reservation per member by default",
    (
      await api("social/reserve", a.token, {
        eventId: event.id,
        slotCode: "S2",
        pax: 2,
      })
    ).json.error?.code === "RESERVATION_LIMIT",
  );
  await setting("reservationMaxPerEvent", 2);
  const extra = await api("social/reserve", a.token, {
    eventId: event.id,
    slotCode: "S2",
    pax: 2,
  });
  check("Reservation limit follows dashboard setting", extra.status === 200);
  check(
    "Default reservation approver is city crew",
    (
      await api("social/reservation-decision", hq.token, {
        id: extra.json.id,
        status: "CONFIRMED",
      })
    ).status === 403,
  );
  await setting("reservationApprover", "SUPER_ADMIN", cityA);
  check(
    "HQ approver setting is enforced",
    (
      await api("social/reservation-decision", adminA.token, {
        id: extra.json.id,
        status: "CONFIRMED",
      })
    ).status === 403 &&
      (
        await api("social/reservation-decision", hq.token, {
          id: extra.json.id,
          status: "CONFIRMED",
        })
      ).status === 200,
  );
  await setting("reservationApprover", "REGIONAL_ADMIN", cityA);
  check(
    "Minimum spend reaches slot selection",
    (await api(`social/slots?eventId=${event.id}`, a.token)).json.slots.find(
      (s: Json) => s.code === "S1",
    ).minimumSpend === "Rp 500.000",
  );
  const confirmations = await Promise.all(
    [r1, r2].map((r) =>
      api("social/reservation-decision", adminA.token, {
        id: r.json.id,
        status: "CONFIRMED",
      }),
    ),
  );
  check(
    "Concurrent slot confirmations: exactly one winner",
    confirmations.filter((r) => r.status === 200).length === 1 &&
      confirmations.some((r) => r.json.error?.code === "SLOT_TAKEN"),
  );
  check(
    "Confirmed slot shown unavailable",
    (
      await api(`social/slots?eventId=${event.id}`, a.token)
    ).json.taken.includes("S1"),
  );
  check(
    "Layout cannot remove reserved slots",
    (
      await api("social/layout", hq.token, {
        venueId: venue.id,
        layout: { slots: [] },
      })
    ).status === 409,
  );
  const reservedDetail = await api(`admin/events/${event.id}`, adminA.token);
  check(
    "Reserved event cannot move venue",
    (
      await api(
        `admin/events/${event.id}`,
        adminA.token,
        { ...reservedDetail.json.form, venueId: "" },
        "PATCH",
      )
    ).json.error?.code === "SLOT_TAKEN",
  );
  await db.message.create({
    data: {
      channelId,
      senderId: a.user.id,
      body: "Old history",
      createdAt: new Date(Date.now() - 31 * 86400000),
    },
  });
  check(
    "History excludes messages older than 30 days",
    !(
      await api(`social/feed?kind=channel&id=${channelId}`, a.token)
    ).json.items.some((i: Json) => i.body === "Old history"),
  );
  const cron = await fetch(`${base}/api/cron/social`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  check(
    "Cron expires grants and deletes old history",
    cron.status === 200 &&
      (
        await db.roamingRequest.findUniqueOrThrow({
          where: { id: social.json.id },
        })
      ).status === "EXPIRED" &&
      (await db.message.count({
        where: { channelId, body: "Old history" },
      })) === 0,
  );
  await setting("roamingMaxPerMonth", 1);
  check(
    "Monthly roaming cap follows dashboard setting",
    (
      await api("social/roaming", b.token, {
        eventId: event.id,
        type: "SOCIAL_HUB",
      })
    ).json.error?.code === "ROAMING_LIMIT",
  );
  await setting("roamingMaxPerMonth", 0);
  check(
    "Zero monthly roaming cap is unlimited",
    (
      await api("social/roaming", b.token, {
        eventId: event.id,
        type: "SOCIAL_HUB",
      })
    ).status === 200,
  );
  check(
    "Cron refuses unauthorized requests",
    (await fetch(`${base}/api/cron/social`, { method: "POST" })).status === 403,
  );
  await api("social/channels", adminA.token, {
    id: channelId,
    cityId: cityA,
    name: prefix,
    kind: "CHAT",
    archived: true,
  });
  check(
    "Archived channel rejects member read and write",
    (await api(`social/feed?kind=channel&id=${channelId}`, a.token)).status ===
      403 &&
      (await api("social/messages", a.token, { channelId, body: "archived" }))
        .status === 403,
  );
  await db.session.update({
    where: { id: a.sessionId },
    data: { revokedAt: new Date() },
  });
  check(
    "Revoked app session cannot join",
    (await api("social/socket", a.token, { kind: "channel", id: timelineId }))
      .status === 401,
  );
}
async function run() {
  try {
    await main();
  } finally {
    for (const [id, original] of savedSettings) {
      if (original)
        await db.setting.update({
          where: { id },
          data: { value: original.value! },
        });
      else await db.setting.deleteMany({ where: { id } });
    }
    const ids = users.map((u) => u.id);
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.message.deleteMany({
      where: {
        OR: [
          { senderId: { in: ids } },
          { channel: { name: { startsWith: prefix } } },
        ],
      },
    });
    await db.post.deleteMany({ where: { authorId: { in: ids } } });
    await db.screenshotEvent.deleteMany({
      where: { memberId: { in: memberIds } },
    });
    await db.checkIn.deleteMany({ where: { memberId: { in: memberIds } } });
    await db.xpLedger.deleteMany({ where: { memberId: { in: memberIds } } });
    await db.conversation.deleteMany({
      where: { memberId: { in: memberIds } },
    });
    await db.reservation.deleteMany({ where: { memberId: { in: memberIds } } });
    await db.roamingRequest.deleteMany({
      where: { memberId: { in: memberIds } },
    });
    const channels = await db.channel.findMany({
      where: { name: { startsWith: prefix } },
      select: { id: true },
    });
    await db.setting.deleteMany({
      where: {
        OR: [
          { id: { in: channels.map((c) => `hub:channel:${c.id}`) } },
          { updatedById: { in: ids } },
        ],
      },
    });
    await db.channel.deleteMany({
      where: { id: { in: channels.map((c) => c.id) } },
    });
    await db.event.deleteMany({ where: { id: `${prefix}-event` } });
    await db.venue.deleteMany({ where: { id: `${prefix}-venue` } });
    await db.member.deleteMany({ where: { id: { in: memberIds } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
  console.log(
    `${results.filter((r) => r.pass).length}/${results.length} passed`,
  );
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
