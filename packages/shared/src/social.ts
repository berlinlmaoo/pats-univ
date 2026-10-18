import { z } from "zod";

const id = z.string().min(1).max(100);
const body = z.string().trim().max(4000, "validation.tooLong");
export const roomSchema = z.object({
  kind: z.enum(["channel", "conversation", "attendance", "draw", "wallet"]),
  id,
});
export type SocialRoom = z.infer<typeof roomSchema>;
export const channelSchema = z.object({
  id: id.optional(),
  cityId: id,
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["TIMELINE", "CHAT"]),
  visibility: z.enum(["MEMBERS", "ADMINS_ONLY"]).default("MEMBERS"),
  archived: z.boolean().default(false),
  memberPosting: z.boolean().nullable().default(null),
});
export const messageSchema = z
  .object({
    channelId: id.optional(),
    conversationId: id.optional(),
    body: body.default(""),
    mediaKey: z.string().max(250).optional(),
    mediaType: z.enum(["TEXT", "VOICE", "VIDEO", "IMAGE"]).default("TEXT"),
    /** Client-generated key; a retried send with the same key returns the first message. */
    clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  })
  .refine((v) => Boolean(v.channelId) !== Boolean(v.conversationId), {
    message: "validation.invalid",
  })
  .refine((v) => v.body.length > 0 || Boolean(v.mediaKey), {
    message: "validation.required",
  })
  .refine((v) => (v.mediaType === "TEXT" ? !v.mediaKey : Boolean(v.mediaKey)), {
    message: "validation.invalid",
  });
export const postSchema = z
  .object({
    channelId: id,
    body: body.default(""),
    mediaKey: z.string().max(250).optional(),
  })
  .refine((v) => v.body.length > 0 || Boolean(v.mediaKey), {
    message: "validation.required",
  });
export const slotSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,20}$/),
  kind: z.enum(["SOFA", "TABLE"]),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(11),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
  pax: z.number().int().min(1).max(100),
  minimumCharge: z.number().int().min(0).max(2_000_000_000).optional(),
  minimumSpend: z.string().trim().max(200).optional(),
});
export const layoutSchema = z
  .object({ slots: z.array(slotSchema).max(100) })
  .superRefine((v, ctx) => {
    const codes = new Set<string>();
    v.slots.forEach((s, i) => {
      if (
        codes.has(s.code) ||
        s.x + s.w > 12 ||
        s.y + s.h > 12 ||
        v.slots
          .slice(0, i)
          .some(
            (t) =>
              s.x < t.x + t.w &&
              s.x + s.w > t.x &&
              s.y < t.y + t.h &&
              s.y + s.h > t.y,
          )
      )
        ctx.addIssue({
          code: "custom",
          message: "validation.invalid",
          path: ["slots", i],
        });
      codes.add(s.code);
    });
  });
export type VenueSlot = z.infer<typeof slotSchema>;
export const reservationSchema = z.object({
  eventId: id,
  slotCode: z.string().min(1).max(20),
  pax: z.number().int().min(1).max(100),
  note: body.optional(),
});
export const roamingSchema = z.object({
  eventId: id,
  type: z.enum(["ATTENDANCE", "SOCIAL_HUB"]),
});
export const decisionSchema = z.object({
  id,
  decision: z.enum(["APPROVED", "REJECTED"]),
});
export const moderationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pin"), id, pinned: z.boolean() }),
  z.object({ action: z.literal("deletePost"), id }),
  z.object({ action: z.literal("deleteMessage"), id }),
  z.object({
    action: z.literal("mute"),
    cityId: id,
    userId: id,
    muted: z.boolean(),
  }),
]);
export function mentionsAdmin(body: string) {
  return /(^|\s)@ADMIN\b/i.test(body);
}
export function roamingExpiry(
  endsAt: Date,
  type: "ATTENDANCE" | "SOCIAL_HUB",
  hours: number,
) {
  return new Date(
    endsAt.getTime() + (type === "SOCIAL_HUB" ? hours * 3600000 : 0),
  );
}
export function validRoaming(
  r: { status: string; accessExpiresAt: Date | null },
  now = new Date(),
) {
  return (
    r.status === "APPROVED" &&
    r.accessExpiresAt !== null &&
    r.accessExpiresAt > now
  );
}
export interface HubChannel {
  canPostTimeline?: boolean;
  id: string;
  cityId: string;
  name: string;
  kind: "TIMELINE" | "CHAT";
  visibility: "MEMBERS" | "ADMINS_ONLY";
  archived: boolean;
  memberPosting: boolean | null;
}
export interface HubItem {
  reactionCount?: number;
  reacted?: boolean;
  id: string;
  body: string;
  author: { id: string; name: string };
  createdAt: string;
  pinned: boolean;
  mediaType: "TEXT" | "VOICE" | "VIDEO" | "IMAGE";
  mediaKey: string | null;
  mediaUrl: string | null;
}
export interface HubResponse {
  cities: { id: string; name: string }[];
  channels: HubChannel[];
  homeCityId: string | null;
  rules: {
    timelinePosting: string;
    mediaMaxSeconds: number;
    mediaMaxMb: number;
    historyDays: number;
  };
}
export interface FeedResponse {
  items: HubItem[];
  nextCursor: string | null;
}
export interface SocialReservation {
  canDecide: boolean;
  minimumCharge: number;
  downPaymentAmount: number | null;
  downPaymentAt: string | null;
  id: string;
  eventId: string;
  slotCode: string;
  pax: number;
  note: string | null;
  status: string;
  member: { fullName: string };
  event: { title: string };
  conversation: { id: string } | null;
}
export interface SocialRoaming {
  id: string;
  type: "ATTENDANCE" | "SOCIAL_HUB";
  status: string;
  accessExpiresAt: string | null;
  member: { fullName: string };
  event: { title: string };
  targetCityId: string;
}
export interface SocialOperations {
  reservations: SocialReservation[];
  roaming: SocialRoaming[];
  venues: {
    id: string;
    name: string;
    cityId: string;
    minimumCharge: number;
    layout: { slots: VenueSlot[] };
  }[];
  screenshots: { memberId: string; name: string; count: number }[];
  muted: { cityId: string; userId: string; name: string }[];
}
export interface ReservationOptions {
  slots: VenueSlot[];
  taken: string[];
  eventTitle: string;
  venueName: string;
}

/** Timeline pins precede recent posts; chat reads oldest to newest beside the composer. */
export function orderHubItems(
  items: readonly HubItem[],
  timeline: boolean,
): HubItem[] {
  return [...items].sort((a, b) => {
    if (timeline && a.pinned !== b.pinned)
      return Number(b.pinned) - Number(a.pinned);
    const order =
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    return timeline ? -order : order;
  });
}
