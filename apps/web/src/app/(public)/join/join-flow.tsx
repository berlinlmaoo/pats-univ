'use client';

import {
  ageOn,
  fieldErrors,
  parseIsoDate,
  registrationSchema,
  type CitySummary,
  type OtpRequestResponse,
  type RegistrationInput,
  type RegistrationResponse,
} from '@pats/shared';
import { Check, Copy, CreditCard, MessageCircle, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { OtpInput } from '@/components/ui/otp-input';
import { Wordmark } from '@/components/ui/wordmark';
import { postJson, type ClientApiError } from '@/lib/client/api';
import { cn } from '@/lib/cn';

type Step = 'form' | 'verify' | 'done';

interface FormValues {
  fullName: string;
  dateOfBirth: string;
  cityId: string;
  favoriteSong: string;
  favoriteGenre: string;
  quotes: string;
  email: string;
  phone: string;
  consent: boolean;
}

/** Translated message for a field, keyed by field name. */
type Errors = Partial<Record<keyof FormValues | 'code', string>>;

const FIELD_ORDER: (keyof FormValues)[] = [
  'fullName',
  'dateOfBirth',
  'cityId',
  'favoriteSong',
  'favoriteGenre',
  'quotes',
  'email',
  'phone',
  'consent',
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function JoinFlow({
  cities,
  minAge,
  source,
  defaultCityId,
  demo,
}: {
  cities: CitySummary[];
  minAge: number;
  source?: string;
  defaultCityId: string;
  demo: boolean;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>('form');
  const [values, setValues] = useState<FormValues>({
    fullName: '',
    dateOfBirth: '',
    cityId: defaultCityId,
    favoriteSong: '',
    favoriteGenre: '',
    quotes: '',
    email: '',
    phone: '',
    consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<OtpRequestResponse | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<RegistrationResponse | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step !== 'form') headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const payload = (): RegistrationInput => ({
    ...values,
    consent: values.consent as true,
    locale: t.locale,
    source,
  });

  const apiMessage = (error: ClientApiError) => t.loose(error.messageKey, { age: minAge, ...error.params });

  /** Maps API field errors onto the form, focusing the first one. */
  const showFieldErrors = (fields: Record<string, string>, params?: Record<string, string | number>) => {
    const next: Errors = {};
    for (const [field, key] of Object.entries(fields)) {
      next[field as keyof Errors] = t.loose(key, { age: minAge, ...params });
    }
    setErrors(next);
    const first = FIELD_ORDER.find((f) => next[f]);
    if (first) document.getElementById(first)?.focus();
  };

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setBanner(null);
    const parsed = registrationSchema.safeParse(payload());
    const clientErrors: Record<string, string> = parsed.success ? {} : fieldErrors(parsed.error);
    const dob = parseIsoDate(values.dateOfBirth);
    if (dob && !clientErrors.dateOfBirth && ageOn(dob, new Date()) < minAge) clientErrors.dateOfBirth = 'errors.underage';
    if (Object.keys(clientErrors).length > 0) {
      showFieldErrors(clientErrors);
      return;
    }

    setBusy(true);
    const res = await postJson<OtpRequestResponse>('/api/join/otp', payload());
    setBusy(false);
    if (!res.ok) {
      if (Object.keys(res.error.fields).length > 0) showFieldErrors(res.error.fields, res.error.params);
      else setBanner(apiMessage(res.error));
      return;
    }
    setOtp(res.data);
    setResendAt(Date.now() + res.data.resendAfter * 1000);
    setCode('');
    setErrors({});
    if (step === 'verify') setNotice(t('otp.resent'));
    setStep('verify');
  }

  async function verify(submitted = code) {
    if (busy) return;
    if (submitted.length !== 6) {
      setErrors({ code: t('validation.otpInvalid') });
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await postJson<RegistrationResponse>('/api/join', { ...payload(), code: submitted });
    setBusy(false);
    if (res.ok) {
      setResult(res.data);
      setStep('done');
      return;
    }
    const { code: errorCode } = res.error;
    if (errorCode === 'OTP_INVALID') {
      setErrors({ code: apiMessage(res.error) });
    } else if (errorCode === 'OTP_EXPIRED' || errorCode === 'OTP_TOO_MANY_ATTEMPTS') {
      setCode('');
      setErrors({ code: apiMessage(res.error) });
      setResendAt(0);
    } else if (Object.keys(res.error.fields).length > 0) {
      // E.g. the email was registered meanwhile: back to the form, pointing at the field.
      setStep('form');
      showFieldErrors(res.error.fields, res.error.params);
    } else {
      setErrors({ code: apiMessage(res.error) });
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-form flex-col px-4 pb-10 pt-4 sm:pt-8">
      <div className="flex h-control-md items-center justify-between">
        <Wordmark />
        <LanguageSwitch />
      </div>

      <main className="mt-8 flex-1 sm:mt-12">
        {step === 'form' && (
          <JoinForm
            cities={cities}
            minAge={minAge}
            values={values}
            errors={errors}
            banner={banner}
            busy={busy}
            demo={demo}
            set={set}
            onSubmit={sendCode}
          />
        )}

        {step === 'verify' && otp && (
          <section className="animate-fade-up">
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-title1 text-fg outline-none">
              {t('otp.title')}
            </h1>
            <p className="mt-2 text-body text-muted">
              {t('otp.subtitle', { email: values.email.trim().toLowerCase() })} {t('otp.expiresIn')}
            </p>

            {otp.demoCode && (
              <Alert tone="info" className="mt-6">
                {t('otp.demoCode', { code: otp.demoCode })}
              </Alert>
            )}

            <form
              className="mt-6 flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <Field label={t('otp.codeLabel')} htmlFor="code" error={errors.code}>
                <OtpInput
                  id="code"
                  label={t('otp.codeLabel')}
                  value={code}
                  invalid={Boolean(errors.code)}
                  disabled={busy}
                  autoFocus
                  onChange={(v) => {
                    setCode(v);
                    if (errors.code) setErrors({});
                  }}
                  onComplete={(v) => void verify(v)}
                />
              </Field>
              {notice && <Alert tone="success">{notice}</Alert>}
              <Button type="submit" size="lg" loading={busy} className="w-full">
                {busy ? t('join.creating') : t('otp.verify')}
              </Button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setStep('form')}>
                {t('otp.changeEmail')}
              </Button>
              <ResendButton resendAt={resendAt} disabled={busy} onResend={() => void sendCode()} />
            </div>
          </section>
        )}

        {step === 'done' && result && (
          <Success result={result} email={values.email.trim().toLowerCase()} headingRef={headingRef} />
        )}
      </main>
    </div>
  );
}

function JoinForm({
  cities,
  minAge,
  values,
  errors,
  banner,
  busy,
  demo,
  set,
  onSubmit,
}: {
  cities: CitySummary[];
  minAge: number;
  values: FormValues;
  errors: Errors;
  banner: string | null;
  busy: boolean;
  demo: boolean;
  set: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const t = useT();
  const describedBy = (field: keyof FormValues, hasHint = false) =>
    errors[field] ? `${field}-error` : hasHint ? `${field}-hint` : undefined;

  return (
    <section>
      <p className="text-label uppercase text-accent-fg">{t('join.eyebrow')}</p>
      <h1 className="mt-2 font-display text-title1 text-fg">{t('join.title')}</h1>
      <p className="mt-2 text-body text-muted">{t('join.subtitle')}</p>

      {demo && (
        <Alert tone="info" className="mt-6">
          <span className="font-semibold">{t('common.demoMode')}.</span> {t('common.demoModeBody')}
        </Alert>
      )}

      {cities.length === 0 ? (
        <Card className="mt-6 px-5 py-8 text-center text-body-sm text-muted">{t('join.noCities')}</Card>
      ) : (
        <form noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-6">
          <Card className="divide-y divide-border">
            <FormSection title={t('join.sectionAbout')}>
              <Field label={t('join.fullName')} htmlFor="fullName" error={errors.fullName}>
                <Input
                  id="fullName"
                  name="name"
                  autoComplete="name"
                  autoCapitalize="words"
                  placeholder={t('join.fullNamePlaceholder')}
                  value={values.fullName}
                  aria-invalid={Boolean(errors.fullName)}
                  aria-describedby={describedBy('fullName')}
                  onChange={(e) => set('fullName', e.target.value)}
                />
              </Field>
              <Field
                label={t('join.dateOfBirth')}
                htmlFor="dateOfBirth"
                hint={t('join.dateOfBirthHint', { age: minAge })}
                error={errors.dateOfBirth}
              >
                <Input
                  id="dateOfBirth"
                  type="date"
                  autoComplete="bday"
                  max={todayIso()}
                  min="1900-01-01"
                  value={values.dateOfBirth}
                  aria-invalid={Boolean(errors.dateOfBirth)}
                  aria-describedby={describedBy('dateOfBirth', true)}
                  onChange={(e) => set('dateOfBirth', e.target.value)}
                  className={cn(
                    'block min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left',
                    !values.dateOfBirth && 'text-placeholder',
                  )}
                />
              </Field>
              <Field label={t('join.city')} htmlFor="cityId" error={errors.cityId}>
                <Select
                  id="cityId"
                  value={values.cityId}
                  aria-invalid={Boolean(errors.cityId)}
                  aria-describedby={describedBy('cityId')}
                  onChange={(e) => set('cityId', e.target.value)}
                  className={cn(!values.cityId && 'text-placeholder')}
                >
                  <option value="" disabled>
                    {t('join.cityPlaceholder')}
                  </option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormSection>

            <FormSection title={t('join.sectionTaste')}>
              <Field label={t('join.favoriteSong')} htmlFor="favoriteSong" error={errors.favoriteSong}>
                <Input
                  id="favoriteSong"
                  placeholder={t('join.favoriteSongPlaceholder')}
                  value={values.favoriteSong}
                  maxLength={100}
                  aria-invalid={Boolean(errors.favoriteSong)}
                  aria-describedby={describedBy('favoriteSong')}
                  onChange={(e) => set('favoriteSong', e.target.value)}
                />
              </Field>
              <Field label={t('join.favoriteGenre')} htmlFor="favoriteGenre" error={errors.favoriteGenre}>
                <Input
                  id="favoriteGenre"
                  placeholder={t('join.favoriteGenrePlaceholder')}
                  value={values.favoriteGenre}
                  maxLength={50}
                  aria-invalid={Boolean(errors.favoriteGenre)}
                  aria-describedby={describedBy('favoriteGenre')}
                  onChange={(e) => set('favoriteGenre', e.target.value)}
                />
              </Field>
              <Field label={t('join.quotes')} htmlFor="quotes" optionalLabel={t('common.optional')} error={errors.quotes}>
                <Textarea
                  id="quotes"
                  rows={2}
                  maxLength={140}
                  placeholder={t('join.quotesPlaceholder')}
                  value={values.quotes}
                  aria-invalid={Boolean(errors.quotes)}
                  aria-describedby={describedBy('quotes')}
                  onChange={(e) => set('quotes', e.target.value)}
                  className="min-h-20"
                />
              </Field>
            </FormSection>

            <FormSection title={t('join.sectionContact')}>
              <Field label={t('join.email')} htmlFor="email" hint={t('join.emailHint')} error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t('join.emailPlaceholder')}
                  value={values.email}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={describedBy('email', true)}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label={t('join.phone')} htmlFor="phone" hint={t('join.phoneHint')} error={errors.phone}>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={t('join.phonePlaceholder')}
                  value={values.phone}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={describedBy('phone', true)}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </Field>
            </FormSection>
          </Card>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="consent" className="flex cursor-pointer items-start gap-3 text-body-sm text-muted">
              <input
                id="consent"
                type="checkbox"
                checked={values.consent}
                aria-invalid={Boolean(errors.consent)}
                aria-describedby={describedBy('consent')}
                onChange={(e) => set('consent', e.target.checked)}
                className="mt-0.5 size-4.5 shrink-0 cursor-pointer accent-accent"
              />
              <span>{t('join.consent')}</span>
            </label>
            {errors.consent && (
              <p id="consent-error" role="alert" className="pl-7.5 text-caption text-danger-fg">
                {errors.consent}
              </p>
            )}
          </div>

          {banner && <Alert tone="danger">{banner}</Alert>}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            {busy ? t('join.sending') : t('join.submit')}
          </Button>
        </form>
      )}
    </section>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 px-5 py-5">
      <legend className="float-left mb-0.5 w-full text-label uppercase text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function ResendButton({ resendAt, disabled, onResend }: { resendAt: number; disabled: boolean; onResend: () => void }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [resendAt]);
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  return (
    <Button variant="ghost" size="sm" className="-mr-3 tabular-nums" disabled={disabled || seconds > 0} onClick={onResend}>
      {seconds > 0 ? t('otp.resendIn', { seconds }) : t('otp.resend')}
    </Button>
  );
}

function Success({
  result,
  email,
  headingRef,
}: {
  result: RegistrationResponse;
  email: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const firstName = result.fullName.split(' ')[0] ?? result.fullName;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.nim);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context); the NIM stays visible and selectable.
    }
  };

  return (
    <section className="animate-fade-up">
      <div className="flex size-12 items-center justify-center rounded-full bg-success-subtle text-success-fg">
        <Check className="size-6" strokeWidth={2.25} aria-hidden="true" />
      </div>
      <p className="mt-5 text-label uppercase text-success-fg">{t('join.successEyebrow')}</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-2 font-display text-title1 text-fg outline-none">
        {t('join.successTitle', { name: firstName })}
      </h1>
      <p className="mt-2 text-body text-muted">{t('join.successSubtitle')}</p>

      <Card className="mt-6 flex items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="text-label uppercase text-muted">{t('join.nimLabel')}</p>
          <p className="mt-1 select-all font-display text-title1 tabular-nums tracking-wide text-fg">{result.nim}</p>
          <p className="mt-0.5 text-caption text-muted">{t('join.nimHint')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={copy} aria-live="polite">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t('join.copied') : t('join.copyNim')}
        </Button>
      </Card>

      <div className="mt-3 flex flex-col gap-3">
        <InfoCard icon={<MessageCircle aria-hidden="true" />} title={t('join.waTitle', { city: result.city.name })}>
          {result.city.waGroupUrl ? (
            <>
              <p>{t('join.waBody')}</p>
              <a
                href={result.city.waGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('primary', 'lg', 'mt-4 w-full')}
              >
                {t('join.waButton')}
              </a>
            </>
          ) : (
            <p>{t('join.waMissing')}</p>
          )}
        </InfoCard>

        <InfoCard icon={<Smartphone aria-hidden="true" />} title={t('join.appTitle')}>
          <p>{t('join.appBody', { email })}</p>
          {result.appLinks.ios || result.appLinks.android ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {result.appLinks.ios && (
                <a href={result.appLinks.ios} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md')}>
                  {t('join.appStore')}
                </a>
              )}
              {result.appLinks.android && (
                <a href={result.appLinks.android} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md')}>
                  {t('join.playStore')}
                </a>
              )}
            </div>
          ) : (
            <p className="mt-2">{t('join.appSoon')}</p>
          )}
        </InfoCard>

        <InfoCard icon={<CreditCard aria-hidden="true" />} title={t('join.cardTitle')}>
          <p>{t('join.cardBody', { city: result.city.name })}</p>
        </InfoCard>
      </div>

      {result.emailSent && <p className="mt-6 text-center text-caption text-muted">{t('join.emailSent', { email })}</p>}
    </section>
  );
}

function InfoCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="flex gap-3.5 px-5 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted [&_svg]:size-4.5">
        {icon}
      </div>
      <div className="min-w-0 flex-1 break-words text-body-sm text-muted">
        <h2 className="pt-1.5 text-body font-semibold text-fg">{title}</h2>
        <div className="mt-1">{children}</div>
      </div>
    </Card>
  );
}
