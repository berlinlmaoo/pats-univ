/**
 * Transactional emails (OTP, welcome) in EN/ID. Table layout and inline styles for email
 * clients; colours come from the shared light tokens.
 */
import { createTranslator, type Locale } from '@pats/shared';
import { colors, fonts } from '@pats/shared/tokens';
import type { MailMessage } from '../mail';

const c = colors.light;
const FONT = `${fonts.body}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(locale: Locale, preheader: string, inner: string): string {
  const t = createTranslator(locale);
  return `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(t('common.appName'))}</title></head>
<body style="margin:0;padding:0;background:${c.bg};">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:0 4px 20px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-0.01em;color:${c.text};">${escapeHtml(t('common.appName'))}</td></tr>
<tr><td style="background:${c.surface};border:1px solid ${c.border};border-radius:20px;padding:32px 28px;font-family:${FONT};color:${c.text};">
${inner}
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${c.textMuted};">${escapeHtml(t('email.footer'))}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const h1 = (text: string) =>
  `<h1 style="margin:0 0 8px;font-size:20px;line-height:28px;font-weight:700;letter-spacing:-0.01em;color:${c.text};">${escapeHtml(text)}</h1>`;
const p = (text: string, extra = '') =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:${c.textMuted};${extra}">${escapeHtml(text)}</p>`;
const button = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:${c.primary};color:${c.primaryText};text-decoration:none;font-size:15px;font-weight:600;line-height:20px;padding:12px 20px;border-radius:12px;">${escapeHtml(label)}</a>`;

export function otpEmail(input: {
  to: string;
  code: string;
  purpose: 'LOGIN' | 'REGISTER';
  locale: Locale;
  expiresInMinutes: number;
}): MailMessage {
  const t = createTranslator(input.locale);
  const body = input.purpose === 'LOGIN' ? t('email.otpBodyLogin') : t('email.otpBodyRegister');
  const expiry = t('email.otpExpiry', { minutes: input.expiresInMinutes });
  const html = layout(
    input.locale,
    body,
    `${h1(t('email.otpHeading'))}${p(body)}
<div style="margin:24px 0;padding:18px 0;background:${c.surfaceMuted};border-radius:12px;text-align:center;font-family:${FONT};font-size:32px;line-height:40px;font-weight:700;letter-spacing:0.3em;color:${c.text};">${escapeHtml(input.code)}</div>
${p(expiry, 'margin:0;font-size:13px;line-height:18px;')}`,
  );
  return {
    to: input.to,
    subject: t('email.otpSubject', { code: input.code }),
    html,
    text: `${t('email.otpHeading')}: ${input.code}\n\n${body}\n${expiry}\n\n${t('email.footer')}`,
  };
}

export function welcomeEmail(input: {
  to: string;
  locale: Locale;
  name: string;
  nim: string;
  cityName: string;
  waGroupUrl: string | null;
}): MailMessage {
  const t = createTranslator(input.locale);
  const firstName = input.name.split(' ')[0] ?? input.name;
  const wa = input.waGroupUrl
    ? `${p(t('email.welcomeWa', { city: input.cityName }))}<p style="margin:0 0 24px;">${button(input.waGroupUrl, t('email.welcomeWaButton'))}</p>`
    : p(t('email.welcomeWaMissing', { city: input.cityName }));
  const html = layout(
    input.locale,
    t('email.welcomeBody', { nim: input.nim }),
    `${h1(t('email.welcomeHeading', { name: firstName }))}
${p(t('email.welcomeBody', { nim: input.nim }))}
<div style="margin:20px 0 24px;padding:16px 18px;background:${c.surfaceMuted};border-radius:12px;">
<div style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${c.textMuted};">NIM</div>
<div style="font-size:22px;line-height:30px;font-weight:700;letter-spacing:0.04em;color:${c.text};">${escapeHtml(input.nim)}</div>
</div>
${wa}
${p(t('email.welcomeApp'))}
${p(t('email.welcomeCard', { city: input.cityName }), 'margin:0;')}`,
  );
  const waText = input.waGroupUrl
    ? `${t('email.welcomeWa', { city: input.cityName })}\n${input.waGroupUrl}`
    : t('email.welcomeWaMissing', { city: input.cityName });
  return {
    to: input.to,
    subject: t('email.welcomeSubject', { name: firstName }),
    html,
    text: [
      t('email.welcomeHeading', { name: firstName }),
      t('email.welcomeBody', { nim: input.nim }),
      waText,
      t('email.welcomeApp'),
      t('email.welcomeCard', { city: input.cityName }),
      t('email.footer'),
    ].join('\n\n'),
  };
}
