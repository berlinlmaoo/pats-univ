import { cookies } from "next/headers";
import { z } from "zod";
import { roomSchema } from "@pats/shared";
import { requireApiUser, SESSION_COOKIE } from "@/lib/auth/current-user";
import { signAccessToken, verifyAccessToken } from "@/lib/auth/tokens";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/http/errors";
import { ok, readJson, route } from "@/lib/http/respond";
import { hit } from "@/lib/rate-limit";
import * as social from "@/lib/social/service";
import { channelAccess, memberFor, roomAccess } from "@/lib/social/access";
import { issueUpload, readMedia, uploadFile } from "@/lib/social/media";

type Context = { params: Promise<{ action: string }> };
export const GET = route(async (req: Request, ctx: Context) => {
  const { action } = await ctx.params;
  if (action === "media-file") return readMedia(req);
  const user = await requireApiUser(req);
  const p = new URL(req.url).searchParams;
  if (action === "hub") return ok(await social.hub(user));
  if (action === "feed")
    return ok(
      await social.feed(
        user,
        roomSchema.parse({ kind: p.get("kind"), id: p.get("id") }),
        p.get("cursor"),
      ),
    );
  if (action === "operations") return ok(await social.operations(user));
  if (action === "slots")
    return ok(await social.reservationOptions(user, p.get("eventId") ?? ""));
  if (action === "token") {
    const bearer = req.headers.get("authorization")?.slice(7);
    const claims = bearer ? await verifyAccessToken(bearer) : null;
    const secret = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = claims
      ? await db.session.findUnique({ where: { id: claims.sid } })
      : secret
        ? await db.session.findUnique({ where: { tokenHash: sha256(secret) } })
        : null;
    if (
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new AppError("UNAUTHENTICATED", 401);
    const access = await signAccessToken({
      sub: user.id,
      sid: session.id,
      role: user.role,
    });
    return ok({
      token: access.token,
      expiresAt: access.expiresAt,
      url: env().REALTIME_PUBLIC_URL,
    });
  }
  throw new AppError("NOT_FOUND", 404);
});
export const POST = route(async (req: Request, ctx: Context) => {
  const user = await requireApiUser(req);
  const { action } = await ctx.params;
  const limit = hit(
    `social:${action}:${user.id}`,
    action === "socket" ? 240 : 60,
    60000,
  );
  if (!limit.ok)
    throw new AppError("RATE_LIMITED", 429, undefined, {
      retryAfter: limit.retryAfter,
    });
  const body = await readJson(req);
  if (action === "socket")
    return ok({ expiresAt: await roomAccess(user, roomSchema.parse(body)) });
  if (action === "channels") return ok(await social.saveChannel(user, body));
  if (action === "messages") return ok(await social.sendMessage(user, body));
  if (action === "react") return ok(await social.reactToPost(user, body));
  if (action === "posts") return ok(await social.createPost(user, body));
  if (action === "moderate") return ok(await social.moderate(user, body));
  if (action === "roaming") return ok(await social.requestRoaming(user, body));
  if (action === "roaming-decision")
    return ok(await social.decideRoaming(user, body));
  if (action === "reserve") return ok(await social.reserve(user, body));
  if (action === "reservation-decision")
    return ok(await social.decideReservation(user, body));
  if (action === "layout") return ok(await social.saveLayout(user, body));
  if (action === "upload") return ok(await issueUpload(user, body));
  if (action === "screenshot") {
    const input = z
      .object({ channelId: z.string(), platform: z.enum(["IOS", "ANDROID"]) })
      .parse(body);
    await channelAccess(user, input.channelId);
    const member = await memberFor(user);
    await db.screenshotEvent.create({
      data: { ...input, memberId: member.id },
    });
    return ok({ ok: true });
  }
  throw new AppError("NOT_FOUND", 404);
});
export const PUT = route(async (req: Request, ctx: Context) => {
  if ((await ctx.params).action !== "media-file")
    throw new AppError("NOT_FOUND", 404);
  return ok(await uploadFile(req), { status: 201 });
});
