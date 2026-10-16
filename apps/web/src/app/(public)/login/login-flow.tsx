'use client';

import { emailSchema, type OtpRequestResponse } from '@pats/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { OtpInput } from '@/components/ui/otp-input';
import { Wordmark } from '@/components/ui/wordmark';
import { postJson } from '@/lib/client/api';

/** HQ dashboard login: email -> 6-digit code -> session cookie. */
export function LoginFlow({ next, demo }: { next: string; demo: boolean }) {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<OtpRequestResponse | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [resendAt]);
  useEffect(() => {
    if (step === 'code') headingRef.current?.focus();
  }, [step]);

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(t('validation.emailInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson<OtpRequestResponse>('/api/auth/otp/request', {
      email: parsed.data,
      locale: t.locale,
      audience: 'hq',
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.code === 'FORBIDDEN' ? t('auth.hqOnly') : t.loose(res.error.messageKey, res.error.params));
      return;
    }
    setOtp(res.data);
    setResendAt(Date.now() + res.data.resendAfter * 1000);
    setNow(Date.now());
    setCode('');
    setStep('code');
  }

  async function verify(value = code) {
    if (busy) return;
    if (value.length !== 6) {
      setError(t('validation.otpInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson<{ ok: true }>('/api/auth/otp/verify', {
      email: email.trim().toLowerCase(),
      code: value,
      client: 'web',
    });
    if (!res.ok) {
      setBusy(false);
      if (res.error.code !== 'OTP_INVALID') setCode('');
      setError(t.loose(res.error.messageKey, res.error.params));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-6">
      <div className="flex w-full max-w-form items-center justify-between">
        <Wordmark />
        <LanguageSwitch />
      </div>
      <main className="flex w-full max-w-form flex-1 flex-col justify-center py-10">
        <Card className="px-6 py-7 sm:px-8 sm:py-9">
          {step === 'email' ? (
            <form noValidate onSubmit={requestCode} className="flex flex-col gap-5">
              <div>
                <h1 className="font-display text-title2 text-fg">{t('auth.hqTitle')}</h1>
                <p className="mt-1 text-body-sm text-muted">{t('auth.hqSubtitle')}</p>
              </div>
              {demo && <Alert tone="info">{t('common.demoModeBody')}</Alert>}
              <Field label={t('auth.emailLabel')} htmlFor="email" error={error ?? undefined}>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={email}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'email-error' : undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                />
              </Field>
              <Button type="submit" size="lg" loading={busy} className="w-full">
                {busy ? t('auth.sending') : t('auth.sendCode')}
              </Button>
            </form>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <div>
                <h1 ref={headingRef} tabIndex={-1} className="font-display text-title2 text-fg outline-none">
                  {t('otp.title')}
                </h1>
                <p className="mt-1 break-words text-body-sm text-muted">
                  {t('otp.subtitle', { email: email.trim().toLowerCase() })}
                </p>
              </div>
              {otp?.demoCode && <Alert tone="info">{t('otp.demoCode', { code: otp.demoCode })}</Alert>}
              <Field label={t('otp.codeLabel')} htmlFor="code" error={error ?? undefined}>
                <OtpInput
                  id="code"
                  label={t('otp.codeLabel')}
                  value={code}
                  invalid={Boolean(error)}
                  disabled={busy}
                  autoFocus
                  onChange={(v) => {
                    setCode(v);
                    setError(null);
                  }}
                  onComplete={(v) => void verify(v)}
                />
              </Field>
              <Button type="submit" size="lg" loading={busy} className="w-full">
                {busy ? t('otp.verifying') : t('otp.verify')}
              </Button>
              <div className="-mx-3 -mb-2 flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep('email');
                    setError(null);
                  }}
                >
                  {t('otp.changeEmail')}
                </Button>
                <Button variant="ghost" size="sm" className="tabular-nums" disabled={busy || cooldown > 0} onClick={() => void requestCode()}>
                  {cooldown > 0 ? t('otp.resendIn', { seconds: cooldown }) : t('otp.resend')}
                </Button>
              </div>
            </form>
          )}
        </Card>
        <p className="mt-5 text-center text-caption text-muted">{t('auth.hqOnly')}</p>
      </main>
    </div>
  );
}
