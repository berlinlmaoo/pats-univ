import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { roomSchema, type SocialRoom } from "@pats/shared";
import { db } from "../db";
import { env } from "../env";
import { AppError } from "../http/errors";
import type { AuthUser } from "../auth/current-user";
import { storage } from "../storage";
import { getSetting } from "../settings";
import { channelAccess, conversationAccess, roomAccess } from "./access";

const types = {
  "image/jpeg": ["jpg", "IMAGE"],
  "image/png": ["png", "IMAGE"],
  "audio/mp4": ["m4a", "VOICE"],
  "video/mp4": ["mp4", "VIDEO"],
  "video/quicktime": ["mov", "VIDEO"],
} as const;
const uploadSchema = z.object({
  room: roomSchema,
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "audio/mp4",
    "video/mp4",
    "video/quicktime",
  ]),
});
const ticketSchema = z.object({
  key: z
    .string()
    .regex(/^hub\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.(jpg|png|m4a|mp4|mov)$/),
  userId: z.string(),
  room: roomSchema,
  contentType: uploadSchema.shape.contentType,
  operation: z.enum(["read", "write"]),
  exp: z.number().int(),
});
type Ticket = z.infer<typeof ticketSchema>;
function signature(data: string) {
  return createHmac("sha256", env().AUTH_SECRET)
    .update(`hub-media-v1:${data}`)
    .digest("hex");
}
function signed(ticket: Ticket) {
  const data = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${env().APP_URL}/api/social/media-file?data=${data}&sig=${signature(data)}`;
}
export function verifyMediaTicket(
  req: Request,
  operation: Ticket["operation"],
) {
  const p = new URL(req.url).searchParams,
    data = p.get("data") ?? "",
    sig = p.get("sig") ?? "";
  if (
    data.length > 3000 ||
    !/^[a-f0-9]{64}$/.test(sig) ||
    !timingSafeEqual(Buffer.from(signature(data)), Buffer.from(sig))
  )
    throw new AppError("FORBIDDEN", 403);
  let parsed;
  try {
    parsed = ticketSchema.safeParse(
      JSON.parse(Buffer.from(data, "base64url").toString()),
    );
  } catch {
    throw new AppError("FORBIDDEN", 403);
  }
  if (
    !parsed.success ||
    parsed.data.operation !== operation ||
    parsed.data.exp <= Date.now()
  )
    throw new AppError("FORBIDDEN", 403);
  return parsed.data;
}
async function ticketUser(ticket: Ticket) {
  const user = await db.user.findUnique({ where: { id: ticket.userId } });
  if (!user || user.status !== "ACTIVE") throw new AppError("FORBIDDEN", 403);
  await roomAccess(user, ticket.room);
  return user;
}
export async function issueUpload(user: AuthUser, raw: unknown) {
  const { room, contentType } = uploadSchema.parse(raw);
  if (room.kind === "attendance") throw new AppError("FORBIDDEN", 403);
  if (room.kind === "channel") {
    const { channel } = await channelAccess(user, room.id, true);
    if (channel.kind === "TIMELINE" && types[contentType][1] !== "IMAGE")
      throw new AppError("MEDIA_INVALID", 422);
  } else await conversationAccess(user, room.id);
  const key = `hub/${user.id}/${randomUUID()}.${types[contentType][0]}`;
  return {
    key,
    url: signed({
      key,
      userId: user.id,
      room,
      contentType,
      operation: "write",
      exp: Date.now() + 300000,
    }),
    maxBytes: (await getSetting(db, "hubMediaMaxMb")) * 1024 * 1024,
  };
}
/** Reads bounded ISO BMFF boxes; accepts the formats produced by native audio/video capture. */
export function mediaDuration(bytes: Uint8Array): number | null {
  const b = Buffer.from(bytes);
  function boxes(start: number, end: number, depth: number): number | null {
    if (depth > 3) return null;
    for (let at = start; at + 8 <= end; ) {
      const size = b.readUInt32BE(at),
        type = b.toString("ascii", at + 4, at + 8);
      if (size < 8 || at + size > end) return null;
      if (type === "mvhd") {
        const version = b[at + 8];
        const offset = at + (version === 1 ? 28 : 20);
        if (offset + (version === 1 ? 12 : 8) > at + size) return null;
        const scale = b.readUInt32BE(offset);
        const duration =
          version === 1
            ? Number(b.readBigUInt64BE(offset + 4))
            : b.readUInt32BE(offset + 4);
        return scale > 0 && Number.isSafeInteger(duration)
          ? duration / scale
          : null;
      }
      if (type === "moov") {
        const duration = boxes(at + 8, at + size, depth + 1);
        if (duration !== null) return duration;
      }
      at += size;
    }
    return null;
  }
  return boxes(0, b.length, 0);
}
export async function uploadFile(req: Request) {
  const ticket = verifyMediaTicket(req, "write");
  const user = await ticketUser(ticket);
  if (ticket.room.kind === "channel")
    await channelAccess(user, ticket.room.id, true);
  if (req.headers.get("content-type")?.split(";")[0] !== ticket.contentType)
    throw new AppError("MEDIA_INVALID", 422);
  const max = (await getSetting(db, "hubMediaMaxMb")) * 1024 * 1024;
  if (Number(req.headers.get("content-length")) > max)
    throw new AppError("MEDIA_INVALID", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("MEDIA_INVALID", 422);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > max) {
      await reader.cancel();
      throw new AppError("MEDIA_INVALID", 413);
    }
    chunks.push(part.value);
  }
  const bytes = Buffer.concat(chunks);
  let valid = false;
  if (ticket.contentType === "image/jpeg")
    valid = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  else if (ticket.contentType === "image/png")
    valid = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  else {
    const seconds = mediaDuration(bytes);
    valid =
      seconds !== null &&
      seconds > 0 &&
      seconds <= (await getSetting(db, "hubMediaMaxSeconds"));
  }
  if (!valid) throw new AppError("MEDIA_INVALID", 422);
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ticket.key}))`;
      if (await storage().get(ticket.key))
        throw new AppError("MEDIA_INVALID", 409);
      await storage().put(ticket.key, bytes, ticket.contentType);
      await storage().put(
        `${ticket.key}.json`,
        JSON.stringify(ticket),
        "application/json",
      );
    },
    { timeout: 30000 },
  );
  return { key: ticket.key };
}
export async function assertMedia(
  user: AuthUser,
  key: string,
  room: SocialRoom,
  type: string,
) {
  if (!key.startsWith(`hub/${user.id}/`) || key.includes(".."))
    throw new AppError("FORBIDDEN", 403);
  const meta = await storage().get(`${key}.json`);
  const parsed = meta
    ? ticketSchema.safeParse(JSON.parse(Buffer.from(meta.body).toString()))
    : null;
  if (
    !parsed?.success ||
    parsed.data.userId !== user.id ||
    parsed.data.room.kind !== room.kind ||
    parsed.data.room.id !== room.id ||
    types[parsed.data.contentType][1] !== type
  )
    throw new AppError("MEDIA_INVALID", 422);
}
export async function mediaReadUrl(
  user: AuthUser,
  key: string,
  room: SocialRoom,
) {
  const meta = await storage().get(`${key}.json`);
  if (!meta) return null;
  const ticket = ticketSchema.parse(
    JSON.parse(Buffer.from(meta.body).toString()),
  );
  return signed({
    ...ticket,
    userId: user.id,
    room,
    operation: "read",
    exp: Date.now() + 120000,
  });
}
export async function readMedia(req: Request) {
  const ticket = verifyMediaTicket(req, "read");
  await ticketUser(ticket);
  const since = new Date(
    Date.now() - (await getSetting(db, "hubHistoryDays")) * 86400000,
  );
  const room = ticket.room;
  const attached =
    (await db.message.findFirst({
      where: {
        mediaUrl: ticket.key,
        createdAt: { gte: since },
        ...(room.kind === "channel"
          ? { channelId: room.id }
          : { conversationId: room.id }),
      },
    })) ??
    (room.kind === "channel"
      ? await db.post.findFirst({
          where: {
            channelId: room.id,
            mediaUrls: { has: ticket.key },
            deletedAt: null,
            createdAt: { gte: since },
          },
        })
      : null);
  if (!attached) throw new AppError("NOT_FOUND", 404);
  const file = await storage().get(ticket.key);
  if (!file) throw new AppError("NOT_FOUND", 404);
  const headers = {
    "Content-Type": ticket.contentType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Accept-Ranges": "bytes",
  };
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416 });
    const start = Number(match[1]),
      end = Math.min(
        match[2] ? Number(match[2]) : file.body.length - 1,
        file.body.length - 1,
      );
    if (start > end || start >= file.body.length)
      return new Response(null, { status: 416 });
    return new Response(file.body.slice(start, end + 1) as BodyInit, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${file.body.length}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(file.body as BodyInit, {
    headers: { ...headers, "Content-Length": String(file.body.length) },
  });
}
