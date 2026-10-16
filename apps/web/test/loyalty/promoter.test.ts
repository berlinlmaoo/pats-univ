import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../src/lib/auth/current-user';
vi.mock('../../src/lib/db', () => ({ db: {} }));
vi.mock('../../src/lib/social/realtime', () => ({ publish: vi.fn() }));
vi.mock('../../src/lib/push/notify', () => ({ deliverStoredNotification: vi.fn() }));
vi.mock('../../src/lib/loyalty/receipts', () => ({ assertReceiptExists: vi.fn() }));
const fixture = vi.hoisted(() => ({ status: 'PENDING', credits: [] as number[], notifications: [] as unknown[], tx: {} as Record<string, unknown> }));
vi.mock('../../src/lib/loyalty/transaction', () => ({ atomic: (fn: (tx: unknown) => Promise<unknown>) => fn(fixture.tx) }));
vi.mock('../../src/lib/settings', () => ({ getSetting: async (_: unknown, key: string) => key.includes('Reservation') ? 25 : key.includes('Guest') ? 5 : key === 'xpExpiryMonths' ? 18 : 0 }));
import { reviewClaim } from '../../src/lib/loyalty/claims';
const admin = { id: 'crew', role: 'REGIONAL_ADMIN', cityId: 'jakarta' } as AuthUser;
describe('post-event claim approval', () => {
  beforeEach(() => {
    fixture.status = 'PENDING'; fixture.credits = []; fixture.notifications = [];
    fixture.tx = {
      xpClaim: {
        findUnique: async () => ({ id: 'claim', memberId: 'member', formType: 'PR', guestCount: 12, reservationCount: 2,
          status: fixture.status, event: { cityId: 'jakarta', title: 'Night' }, member: { userId: 'user', user: { locale: 'en' } } }),
        updateMany: async ({ data }: { data: { status: string } }) => { if (fixture.status !== 'PENDING') return { count: 0 }; fixture.status = data.status; return { count: 1 }; },
      },
      xpLedger: { create: async ({ data }: { data: { delta: number } }) => { fixture.credits.push(data.delta); } },
      notification: { create: async ({ data }: { data: unknown }) => { fixture.notifications.push(data); } },
      auditLog: { create: vi.fn() },
    };
  });
  it('credits 5×GL + 25×reservations once', async () => {
    await reviewClaim(admin, { id: 'claim', decision: 'APPROVED' });
    await expect(reviewClaim(admin, { id: 'claim', decision: 'APPROVED' })).rejects.toMatchObject({ code: 'REQUEST_DECIDED' });
    expect(fixture.credits).toEqual([110]); expect(fixture.notifications).toHaveLength(1);
  });
  it('uses the adjusted numbers and audits before/after', async () => {
    await reviewClaim(admin, { id: 'claim', decision: 'APPROVED', guestCount: 3, reservationCount: 4 });
    expect(fixture.credits).toEqual([115]);
    const audit = fixture.tx.auditLog as { create: ReturnType<typeof vi.fn> };
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ meta: expect.objectContaining({ before: { guestCount: 12, reservationCount: 2 }, after: { guestCount: 3, reservationCount: 4 } }) }) }));
  });
  it('rejects without XP and stores the reason notification', async () => {
    await reviewClaim(admin, { id: 'claim', decision: 'REJECTED', reason: 'No matching reservation' });
    expect(fixture.credits).toEqual([]); expect(fixture.notifications[0]).toMatchObject({ body: expect.stringContaining('No matching reservation') });
  });
  it('refuses another region before any mutation', async () => {
    await expect(reviewClaim({ ...admin, cityId: 'jogja' }, { id: 'claim', decision: 'APPROVED' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fixture.credits).toEqual([]); expect(fixture.status).toBe('PENDING');
  });
});
