import type { ClaimDto, DrawDto } from './loyalty';

/** Presentation guards complement the server's transactional checks. */
export function canEnterDraw(draw: DrawDto, now: Date) {
  return Boolean(draw.prize && !draw.startedAt && !draw.ownEntryId &&
    draw.entries.length < draw.capacity && draw.peakStartsAt && draw.peakEndsAt &&
    now >= new Date(draw.peakStartsAt) && now < new Date(draw.peakEndsAt));
}

export function claimFormVisible(existing: Pick<ClaimDto, 'id' | 'status'> | undefined, editingId?: string) {
  return !existing || (existing.status === 'PENDING' && existing.id === editingId);
}

export function wheelAngle(ids: readonly string[], winnerId: string) {
  const index = ids.indexOf(winnerId);
  return index < 0 ? 0 : 1440 + 360 - ((index + 0.5) * 360) / ids.length;
}
