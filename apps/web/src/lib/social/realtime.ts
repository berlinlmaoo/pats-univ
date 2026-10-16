import "server-only";
import type { SocialRoom } from "@pats/shared";
import { env } from "../env";
/** Invalidations contain no member content. Clients re-read through the same access checks. */
export async function publish(room: SocialRoom) {
  const e = env();
  if (!e.REALTIME_INTERNAL_URL || !e.REALTIME_SECRET) return;
  try {
    const res = await fetch(`${e.REALTIME_INTERNAL_URL}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${e.REALTIME_SECRET}`,
      },
      body: JSON.stringify(room),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.warn("[realtime] publish failed", res.status);
  } catch {
    console.warn("[realtime] unavailable");
  }
}
