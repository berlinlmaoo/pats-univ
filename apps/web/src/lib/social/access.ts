import "server-only";
import { can, type SocialRoom } from "@pats/shared";
import type { Prisma } from "@/generated/prisma";
import { db } from "../db";
import { requireCityAccess, type AuthUser } from "../auth/current-user";
import { AppError } from "../http/errors";
import { getSetting } from "../settings";

type Db = Prisma.TransactionClient;
export async function memberFor(user: AuthUser, tx: Db = db) {
  const m = await tx.member.findUnique({ where: { userId: user.id } });
  if (!m || m.status !== "ACTIVE") throw new AppError("FORBIDDEN", 403);
  return m;
}
export async function cityAccess(user: AuthUser, cityId: string, tx: Db = db) {
  if (user.role !== "MEMBER") {
    requireCityAccess(user, cityId);
    return null;
  }
  const member = await memberFor(user, tx);
  if (member.cityId === cityId) return null;
  const grant = await tx.roamingRequest.findFirst({
    where: {
      memberId: member.id,
      targetCityId: cityId,
      type: "SOCIAL_HUB",
      status: "APPROVED",
      accessExpiresAt: { gt: new Date() },
    },
    orderBy: { accessExpiresAt: "desc" },
  });
  if (!grant) throw new AppError("FORBIDDEN", 403);
  return grant.accessExpiresAt;
}
export const channelPolicyId = (id: string) => `hub:channel:${id}`;
export const muteId = (cityId: string) => `hub:muted:${cityId}`;
export async function memberPosting(
  channelId: string,
  tx: Db = db,
): Promise<boolean | null> {
  const row = await tx.setting.findUnique({
    where: { id: channelPolicyId(channelId) },
  });
  return typeof row?.value === "boolean" ? row.value : null;
}
export async function mutedUsers(
  cityId: string,
  tx: Db = db,
): Promise<string[]> {
  const row = await tx.setting.findUnique({ where: { id: muteId(cityId) } });
  return Array.isArray(row?.value)
    ? row.value.filter((v): v is string => typeof v === "string")
    : [];
}
export async function channelAccess(
  user: AuthUser,
  id: string,
  write = false,
  tx: Db = db,
) {
  const channel = await tx.channel.findUnique({ where: { id } });
  if (!channel) throw new AppError("NOT_FOUND", 404);
  const expiresAt = await cityAccess(user, channel.cityId, tx);
  if (
    user.role === "MEMBER" &&
    (channel.archived || channel.visibility === "ADMINS_ONLY")
  )
    throw new AppError("FORBIDDEN", 403);
  if (write) {
    if (channel.kind === "TIMELINE" && !can(user.role, "timeline.post")) throw new AppError("FORBIDDEN", 403);
    if (channel.archived) throw new AppError("FORBIDDEN", 403);
    if (user.role === "MEMBER") {
      if ((await mutedUsers(channel.cityId, tx)).includes(user.id))
        throw new AppError("HUB_MUTED", 403);
      if (
        channel.kind === "TIMELINE" &&
        !(
          (await memberPosting(id, tx)) ??
          (await getSetting(tx, "hubTimelinePosting", {
            cityId: channel.cityId,
          })) === "MEMBERS"
        )
      )
        throw new AppError("FORBIDDEN", 403);
    }
  }
  return { channel, expiresAt };
}
export async function conversationAccess(
  user: AuthUser,
  id: string,
  tx: Db = db,
) {
  const conversation = await tx.conversation.findUnique({
    where: { id },
    include: { member: { select: { userId: true, status: true } } },
  });
  if (!conversation) throw new AppError("NOT_FOUND", 404);
  if (user.role === "MEMBER") {
    if (
      conversation.member.userId !== user.id ||
      conversation.member.status !== "ACTIVE"
    )
      throw new AppError("FORBIDDEN", 403);
  } else requireCityAccess(user, conversation.cityId);
  return conversation;
}
export async function roomAccess(user: AuthUser, room: SocialRoom) {
  if (room.kind === "channel")
    return (await channelAccess(user, room.id)).expiresAt;
  if (room.kind === "conversation") {
    await conversationAccess(user, room.id);
    return null;
  }
  if (room.kind === "wallet") {
    const member = await memberFor(user);
    if (member.id !== room.id) throw new AppError("FORBIDDEN", 403);
    return null;
  }
  const event = await db.event.findUnique({ where: { id: room.id } });
  if (!event) throw new AppError("NOT_FOUND", 404);
  if (room.kind === "draw") await cityAccess(user, event.cityId);
  else requireCityAccess(user, event.cityId);
  return null;
}
