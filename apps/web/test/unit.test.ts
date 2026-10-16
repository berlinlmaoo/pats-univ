import { describe, expect, it } from 'vitest';
import { otpEmail, welcomeEmail } from '../src/lib/email/templates';
import { newNonce, signQr, signTicket, verifyQr, verifyTicket } from '../src/lib/checkin/token';
import { hit } from '../src/lib/rate-limit';

describe('rate limit', () => {
  it('blocks after the limit and resets after the window', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hit('k', 3, 1000, now).ok).toBe(true);
    const blocked = hit('k', 3, 1000, now + 100);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(1);
    expect(hit('k', 3, 1000, now + 1000).ok).toBe(true);
  });
});

describe('emails', () => {
  it('renders the OTP in both languages', () => {
    const id = otpEmail({ to: 'a@b.id', code: '012345', purpose: 'REGISTER', locale: 'id', expiresInMinutes: 5 });
    expect(id.subject).toBe('012345 adalah kode PATS University kamu');
    expect(id.html).toContain('012345');
    expect(id.text).toContain('5 menit');
    const en = otpEmail({ to: 'a@b.id', code: '999999', purpose: 'LOGIN', locale: 'en', expiresInMinutes: 5 });
    expect(en.text).toContain('log in');
  });

  it('escapes member input and handles a missing WhatsApp link', () => {
    const mail = welcomeEmail({
      to: 'a@b.id',
      locale: 'en',
      name: '<script>x</script> Rara',
      nim: 'JKT2600001',
      cityName: 'Jakarta',
      waGroupUrl: null,
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain('will share the WhatsApp group link');
  });
});

describe('check-in tokens', () => {
  const key = 'k'.repeat(40);
  const now = new Date('2026-10-16T13:00:00Z');
  const in45s = new Date(now.getTime() + 45_000);
  const memberId = 'cmva7sbb5001wr3ufh6bi8en0';

  it('round-trips a QR and refuses it once expired', () => {
    const token = signQr(key, { memberId, nonce: newNonce(), expiresAt: in45s });
    const ok = verifyQr(key, token, now);
    expect(ok.ok && ok.claims.memberId).toBe(memberId);
    expect(verifyQr(key, token, new Date(now.getTime() + 46_000))).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects tampering, other keys and foreign codes', () => {
    const token = signQr(key, { memberId, nonce: newNonce(), expiresAt: in45s });
    const parts = token.split('.');
    // Pushing the expiry out breaks the signature.
    const forged = [parts[0], parts[1], parts[2], 'zzzzzz', parts[4]].join('.');
    expect(verifyQr(key, forged, now)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyQr('x'.repeat(40), token, now)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyQr(key, 'https://example.com', now)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyQr(key, '', now)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('binds a ticket to its admin and event, and a QR is not a ticket', () => {
    const nonce = newNonce();
    const ticket = signTicket(key, { adminId: 'cadmin00000000001', eventId: 'cevent00000000001', memberId, nonce, expiresAt: in45s });
    const ok = verifyTicket(key, ticket, now);
    expect(ok.ok && ok.claims).toMatchObject({ adminId: 'cadmin00000000001', eventId: 'cevent00000000001', nonce });
    expect(verifyTicket(key, signQr(key, { memberId, nonce, expiresAt: in45s }), now).ok).toBe(false);
    expect(verifyQr(key, ticket, now).ok).toBe(false);
  });
});
