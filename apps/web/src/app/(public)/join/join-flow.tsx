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
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { useT } from '@/components/i18n/provider';
import { KtmCard } from '@/components/ktm/ktm-card';
import { PhotoPicker } from '@/components/ktm/photo-picker';
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
  favoriteDrink: string;
  quotes: string;
  photoKey: string;
  email: string;
  phone: string;
  consent: boolean;
}

/** Translated message for a field, keyed by field name. */
type Errors = Partial<Record<keyof FormValues | 'code', string>>;

const FIELD_ORDER: (keyof FormValues)[] = [
  'fullName',
  'photoKey',
  'dateOfBirth',
  'cityId',
  'favoriteDrink',
  'favoriteGenre',
  'favoriteSong',
  'quotes',
  'email',
  'phone',
  'consent',
];


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
    favoriteDrink: '',
    quotes: '',
    photoKey: '',
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
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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
    if (first) document.getElementById(first === 'dateOfBirth' ? 'dateOfBirth' : first)?.focus();
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
    <div className="flex min-h-dvh flex-col">
      <header className="gold-rule bg-band text-band-fg">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Wordmark px={44} />
          <LanguageSwitch onBand />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
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
            photoPreview={photoPreview}
            onPhoto={(key, preview) => {
              set('photoKey', key);
              setPhotoPreview(preview);
            }}
          />
        )}

        <div className="mx-auto w-full max-w-form">
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
        </div>
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
  photoPreview,
  onPhoto,
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
  photoPreview: string | null;
  onPhoto: (key: string, preview: string | null) => void;
}) {
  const t = useT();
  const describedBy = (field: keyof FormValues, hasHint = false) =>
    errors[field] ? `${field}-error` : hasHint ? `${field}-hint` : undefined;

  return (
    <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-14">
      {/* The card leads: hero + live KTM first (left on desktop, top on phones), the form follows. */}
      <div className="min-w-0 lg:sticky lg:top-8">
        <h1 className="varsity varsity-hero text-fg">{t('join.heroLine')}</h1>
        <p className="mt-3 max-w-md text-body text-muted">{t('join.subtitle')}</p>
        <div className="mt-6 max-w-md">
          <KtmCard name={values.fullName} drink={values.favoriteDrink} quote={values.quotes} qrValue={null} priority flippable />
          <p className="mt-1 text-center text-caption text-muted">{t('join.previewHint')}</p>
        </div>
      </div>

      <div className="min-w-0">
        {demo && (
          <Alert tone="info" className="mb-6">
            <span className="font-semibold">{t('common.demoMode')}.</span> {t('common.demoModeBody')}
          </Alert>
        )}

        {cities.length === 0 ? (
          <Card className="px-5 py-8 text-center text-body-sm text-muted">{t('join.noCities')}</Card>
        ) : (
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
            <Card className="divide-y divide-border">
              <FormSection title={t('join.sectionAbout')}>
                <Field label={t('join.fullName')} htmlFor="fullName" error={errors.fullName}>
                  <Input
                    id="fullName"
                    name="name"
                    autoComplete="name"
                    autoCapitalize="words"
                    maxLength={80}
                    placeholder={t('join.fullNamePlaceholder')}
                    value={values.fullName}
                    aria-invalid={Boolean(errors.fullName)}
                    aria-describedby={describedBy('fullName')}
                    onChange={(e) => set('fullName', e.target.value)}
                  />
                </Field>
                <Field label={t('join.photo')} htmlFor="photoKey" hint={t('join.photoHint')} error={errors.photoKey}>
                  <PhotoPicker
                    id="photoKey"
                    uploadUrl="/api/join/photo"
                    previewUrl={photoPreview}
                    invalid={Boolean(errors.photoKey)}
                    describedBy={describedBy('photoKey', true)}
                    onUploaded={({ key, previewUrl }) => key && onPhoto(key, previewUrl)}
                  />
                </Field>
                <Field
                  label={t('join.dateOfBirth')}
                  htmlFor="dateOfBirth"
                  hint={t('join.dateOfBirthHint', { age: minAge })}
                  error={errors.dateOfBirth}
                >
                  <DateOfBirthInput
                    value={values.dateOfBirth}
                    invalid={Boolean(errors.dateOfBirth)}
                    describedBy={describedBy('dateOfBirth', true)}
                    onChange={(v) => set('dateOfBirth', v)}
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

              <FormSection title={t('join.sectionCard')}>
                <Field label={t('join.favoriteDrink')} htmlFor="favoriteDrink" error={errors.favoriteDrink}>
                  <Input
                    id="favoriteDrink"
                    placeholder={t('join.favoriteDrinkPlaceholder')}
                    value={values.favoriteDrink}
                    maxLength={40}
                    aria-invalid={Boolean(errors.favoriteDrink)}
                    aria-describedby={describedBy('favoriteDrink')}
                    onChange={(e) => set('favoriteDrink', e.target.value)}
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
                <Field label={t('join.quotes')} htmlFor="quotes" optionalLabel={t('common.optional')} hint={t('ux.card.quoteHint')} error={errors.quotes}>
                  <Textarea
                    id="quotes"
                    rows={2}
                    maxLength={140}
                    placeholder={t('join.quotesPlaceholder')}
                    value={values.quotes}
                    aria-invalid={Boolean(errors.quotes)}
                    aria-describedby={describedBy('quotes', true)}
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
              <label
                htmlFor="consent"
                className="flex min-h-12 cursor-pointer items-start gap-3 rounded-control px-1 py-1.5 text-body-sm text-fg transition-colors hover:bg-surface-hover"
              >
                <input
                  id="consent"
                  type="checkbox"
                  checked={values.consent}
                  aria-invalid={Boolean(errors.consent)}
                  aria-describedby={describedBy('consent')}
                  onChange={(e) => set('consent', e.target.checked)}
                  className="mt-px size-6 shrink-0 cursor-pointer accent-primary"
                />
                <span className="pt-0.5">{t('join.consent')}</span>
              </label>
              {errors.consent && (
                <p id="consent-error" role="alert" className="pl-10 text-caption text-danger-fg">
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
      </div>
    </section>
  );
}

/**
 * Day / month / year selects instead of <input type="date">, whose format follows the browser's
 * locale (mm/dd/yyyy on an English phone) rather than the page's. Value is ISO yyyy-mm-dd or ''.
 */
function DateOfBirthInput({
  value,
  invalid,
  describedBy,
  onChange,
}: {
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (iso: string) => void;
}) {
  const t = useT();
  const [parts, setParts] = useState(() => {
    const [y = '', m = '', d = ''] = value ? value.split('-') : [];
    return { y, m, d };
  });
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(t.locale === 'id' ? 'id-ID' : 'en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1)))),
    [t.locale],
  );
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: thisYear - 1900 + 1 }, (_, i) => String(thisYear - i)), [thisYear]);

  const update = (next: Partial<typeof parts>) => {
    const p = { ...parts, ...next };
    setParts(p);
    if (p.y && p.m && p.d) {
      const max = new Date(Date.UTC(Number(p.y), Number(p.m), 0)).getUTCDate();
      const day = String(Math.min(Number(p.d), max)).padStart(2, '0');
      onChange(`${p.y}-${p.m}-${day}`);
    } else onChange('');
  };
  const common = { 'aria-invalid': invalid, 'aria-describedby': describedBy };

  return (
    <div className="grid grid-cols-[minmax(5.5rem,1fr)_minmax(0,1.7fr)_minmax(6rem,1.2fr)] gap-2">
      <Select id="dateOfBirth" aria-label={t('join.dobDay')} value={parts.d} onChange={(e) => update({ d: e.target.value })} className={cn(!parts.d && 'text-placeholder')} {...common}>
        <option value="" disabled>
          {t('join.dobDay')}
        </option>
        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
          <option key={d} value={d}>
            {Number(d)}
          </option>
        ))}
      </Select>
      <Select aria-label={t('join.dobMonth')} value={parts.m} onChange={(e) => update({ m: e.target.value })} className={cn(!parts.m && 'text-placeholder')} {...common}>
        <option value="" disabled>
          {t('join.dobMonth')}
        </option>
        {months.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, '0')}>
            {name}
          </option>
        ))}
      </Select>
      <Select aria-label={t('join.dobYear')} autoComplete="bday-year" value={parts.y} onChange={(e) => update({ y: e.target.value })} className={cn(!parts.y && 'text-placeholder')} {...common}>
        <option value="" disabled>
          {t('join.dobYear')}
        </option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 px-5 py-5">
      <legend className="ktm-label float-left mb-0.5 w-full text-gold-fg">{title}</legend>
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
      <h1 ref={headingRef} tabIndex={-1} className="mt-5 font-display text-title1 text-fg outline-none">
        {t('join.successTitle', { name: firstName })}
      </h1>
      <p className="mt-2 text-body text-muted">{t('join.successSubtitle')}</p>

      <div className="mt-6">
        <KtmCard name={result.fullName} drink={result.favoriteDrink} quote={result.quote ?? ''} qrValue={null} priority />
      </div>

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
