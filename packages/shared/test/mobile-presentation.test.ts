import { describe, expect, it } from 'vitest';
import type { DrawDto } from '../src';
import { canEnterDraw, claimFormVisible, wheelAngle } from '../src/loyalty-presentation';

describe('mobile Claim XP and draw presentation', () => {
  const draw: DrawDto = { eventId: 'e', prize: 'Prize', peakStartsAt: '2026-10-16T16:00:00Z', peakEndsAt: '2026-10-16T18:00:00Z', capacity: 5, costXp: 250, startedAt: null, winnerEntryId: null, entries: [], freeCredit: null, ownEntryId: null };
  it('enables entry exactly inside the peak window', () => {
    expect(canEnterDraw(draw, new Date('2026-10-16T15:59:59Z'))).toBe(false);
    expect(canEnterDraw(draw, new Date(draw.peakStartsAt!))).toBe(true);
    expect(canEnterDraw(draw, new Date(draw.peakEndsAt!))).toBe(false);
  });
  it('disables a completed, full or already entered draw', () => {
    const now = new Date(draw.peakStartsAt!);
    expect(canEnterDraw({ ...draw, startedAt: now.toISOString() }, now)).toBe(false);
    expect(canEnterDraw({ ...draw, capacity: 0 }, now)).toBe(false);
    expect(canEnterDraw({ ...draw, ownEntryId: 'own' }, now)).toBe(false);
  });
  it('stops editing a claim when a live decision arrives', () => {
    expect(claimFormVisible(undefined)).toBe(true);
    expect(claimFormVisible({ id: 'c', status: 'PENDING' })).toBe(false);
    expect(claimFormVisible({ id: 'c', status: 'PENDING' }, 'c')).toBe(true);
    expect(claimFormVisible({ id: 'c', status: 'APPROVED' }, 'c')).toBe(false);
    expect(claimFormVisible({ id: 'c', status: 'REJECTED' }, 'c')).toBe(false);
  });
  it('points to the server winner at the top for every slot', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    ids.forEach((id, index) => expect((wheelAngle(ids, id) + (index + 0.5) * 72) % 360).toBe(0));
    expect(wheelAngle(ids, 'unknown')).toBe(0);
  });
});
