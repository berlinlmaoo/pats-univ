import { describe, expect, it } from 'vitest';
import { otpEmail, welcomeEmail } from '../src/lib/email/templates';
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
