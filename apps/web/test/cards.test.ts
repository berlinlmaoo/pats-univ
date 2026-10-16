import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CARD_TOKEN_PATTERN, errorMessageKey } from '@pats/shared';
import { describe, expect, it } from 'vitest';
import { manifestCsv } from '../src/lib/card-print/manifest';
import { isGenuineCardToken, newCardToken, signNfcTicket, tagPassword, verifyNfcTicket } from '../src/lib/cards/token';
import { duePushes, localDay } from '../src/lib/push/schedule';
import { assertKey, LocalStorage, type Storage } from '../src/lib/storage/drivers';

const KEY = 'test-card-key-0123456789abcdef0123456789';

describe('card tokens', () => {
  it('are 32 URL-safe characters and verify only with their key', () => {
    const token = newCardToken(KEY);
    expect(token).toMatch(CARD_TOKEN_PATTERN);
    expect(isGenuineCardToken(KEY, token)).toBe(true);
    expect(isGenuineCardToken('another-key-0123456789abcdef0123456789', token)).toBe(false);
    const flipped = token.slice(0, 5) + (token[5] === 'A' ? 'B' : 'A') + token.slice(6);
    expect(isGenuineCardToken(KEY, flipped)).toBe(false);
    expect(isGenuineCardToken(KEY, 'short')).toBe(false);
    expect(new Set(Array.from({ length: 200 }, () => newCardToken(KEY))).size).toBe(200);
  });
});

describe('tag password', () => {
  it('is derived from the key and the UID, the same every time', () => {
    const a = tagPassword(KEY, '04A1B2C3D4E5F6');
    expect(a).toEqual(tagPassword(KEY, '04a1b2c3d4e5f6'));
    expect(a.pwd).toMatch(/^[0-9A-F]{8}$/);
    expect(a.pack).toMatch(/^[0-9A-F]{4}$/);
    expect(tagPassword(KEY, '04A1B2C3D4E5F7')).not.toEqual(a);
    expect(tagPassword('other-key-0123456789abcdef0123456789', '04A1B2C3D4E5F6')).not.toEqual(a);
    for (let i = 0; i < 500; i++) expect(tagPassword(KEY, `04${i.toString(16).padStart(12, '0')}`).pwd).not.toBe('FFFFFFFF');
  });
});

describe('NFC scan ticket', () => {
  const claims = { adminId: 'admin00001', eventId: 'event00001', memberId: 'member0001', cardId: 'card000001', expiresAt: new Date(Date.now() + 60_000) };
  it('round-trips, expires and refuses tampering', () => {
    const ticket = signNfcTicket(KEY, claims);
    const ok = verifyNfcTicket(KEY, ticket);
    expect(ok.ok && ok.claims.cardId).toBe('card000001');
    expect(verifyNfcTicket(KEY, ticket, new Date(Date.now() + 120_000))).toEqual({ ok: false, reason: 'expired' });
    expect(verifyNfcTicket(KEY, ticket.replace('member0001', 'member0002')).ok).toBe(false);
    expect(verifyNfcTicket('another-key-0123456789abcdef0123456789', ticket).ok).toBe(false);
  });
});

describe('push schedule', () => {
  const tz = 'Asia/Jakarta';
  // 20 Oct 2026 21:00 WIB = 14:00 UTC.
  const event = { id: 'e1', startsAt: new Date('2026-10-20T14:00:00Z'), endsAt: new Date('2026-10-20T18:00:00Z') };
  const at = (iso: string) => duePushes([event], { timeZone: tz, reminderTime: '10:00', followUpTime: '12:00', now: new Date(iso) }).map((p) => p.kind);

  it('sends H-3, H-1 and day-of reminders at the city reminder time', () => {
    expect(at('2026-10-17T02:59:00Z')).toEqual([]); // 09.59 WIB, 3 days before
    expect(at('2026-10-17T03:00:00Z')).toEqual(['reminder3d']);
    expect(at('2026-10-19T03:30:00Z')).toEqual(['reminder1d']);
    expect(at('2026-10-20T03:00:00Z')).toEqual(['reminderToday']);
    expect(at('2026-10-20T14:30:00Z')).toEqual([]); // the event has started
  });

  it('sends thank-you and FOMO at noon the day after, in the city time zone', () => {
    expect(at('2026-10-21T04:59:00Z')).toEqual([]);
    expect(at('2026-10-21T05:00:00Z')).toEqual(['thankYou', 'fomo']);
    expect(localDay(new Date('2026-10-20T17:30:00Z'), tz)).toBe(localDay(new Date('2026-10-21T01:00:00Z'), tz));
  });
});

describe('vendor manifest', () => {
  it('quotes commas and neutralises formulas in names', () => {
    const csv = manifestCsv('JKT-3', [
      { seq: 1, nim: 'JKT2600001', fullName: 'Rara, Anindya', city: 'Jakarta', file: '001-JKT2600001.pdf', url: 'https://x/c/1' },
      { seq: 2, nim: 'JKT2600002', fullName: '=HYPERLINK("x")', city: 'Jakarta', file: '002-JKT2600002.pdf', url: 'https://x/c/2' },
    ]);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('batch,seq,nim,full_name,city,file,batch_pdf_pages,qr_url');
    expect(lines[1]).toContain('"Rara, Anindya"');
    expect(lines[1]).toContain(',1-2,');
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain(',3-4,');
  });
});

describe('local storage', () => {
  it('stores, reads, removes and refuses unsafe keys', async () => {
    const store: Storage = new LocalStorage(mkdtempSync(join(tmpdir(), 'pats-store-')));
    await store.put('cards/batches/b1/batch.pdf', new Uint8Array([1, 2, 3]), 'application/pdf');
    expect((await store.get('cards/batches/b1/batch.pdf'))?.contentType).toBe('application/pdf');
    expect(await store.get('cards/batches/b1/none.pdf')).toBeNull();
    await store.removePrefix('cards/batches/b1');
    expect(await store.get('cards/batches/b1/batch.pdf')).toBeNull();
    expect(() => assertKey('../etc/passwd')).toThrow();
    expect(() => assertKey('/abs')).toThrow();
  });
});

describe('error keys', () => {
  it('map API codes to i18n keys', () => {
    expect(errorMessageKey('CARD_UID_MISMATCH')).toBe('errors.cardUidMismatch');
    expect(errorMessageKey('OTP_TOO_MANY_ATTEMPTS')).toBe('errors.otpTooManyAttempts');
    expect(errorMessageKey('VALIDATION')).toBe('validation.invalid');
    expect(errorMessageKey('NETWORK')).toBe('errors.network');
    expect(errorMessageKey('SPIN_LIMIT')).toBe('loyalty.spinLimit');
    expect(errorMessageKey('REDEEM_USED')).toBe('loyalty.codeUsed');
  });
});
