'use client';

import { LOCALES, type Locale } from '@pats/shared';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/cn';
import { setLocaleAction } from './actions';
import { useT } from './provider';

/** Compact ID / EN segmented switch. */
export function LanguageSwitch({ className, onBand }: { className?: string; /** On the navy band (sidebar, auth header). */ onBand?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (locale: Locale) =>
    start(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn(
        'inline-flex h-control-sm items-center rounded-control border p-0.5',
        onBand ? 'border-white/15 bg-white/5' : 'border-border bg-surface',
        pending && 'opacity-60',
        className,
      )}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          aria-pressed={t.locale === locale}
          onClick={() => t.locale !== locale && choose(locale)}
          className={cn(
            'h-full rounded-[calc(var(--pats-radius-control)-3px)] px-2.5 text-caption font-extrabold uppercase transition-colors',
            onBand
              ? t.locale === locale
                ? 'bg-band-fg text-band'
                : 'text-band-muted hover:text-band-fg'
              : t.locale === locale
                ? 'bg-primary text-primary-fg'
                : 'text-muted hover:text-fg',
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
