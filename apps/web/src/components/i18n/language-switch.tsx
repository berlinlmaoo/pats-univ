'use client';

import { LOCALES, type Locale } from '@pats/shared';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/cn';
import { setLocaleAction } from './actions';
import { useT } from './provider';

/** Compact ID / EN segmented switch. */
export function LanguageSwitch({ className }: { className?: string }) {
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
      className={cn('inline-flex h-control-sm items-center rounded-control border border-border bg-surface p-0.5', pending && 'opacity-60', className)}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          aria-pressed={t.locale === locale}
          onClick={() => t.locale !== locale && choose(locale)}
          className={cn(
            'h-full rounded-[calc(var(--pats-radius-control)-3px)] px-2.5 text-caption font-semibold uppercase transition-colors',
            t.locale === locale ? 'bg-surface-muted text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
