import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { cn } from '@/lib/cn';
import { BrandLockup, Wordmark } from './wordmark';

/**
 * Sign-in and standalone pages, dressed as the KTM: the navy header band with its gold rule and
 * the full crest, then the paper body with the form. On wide screens the band becomes a panel
 * carrying the card-back lockup.
 */
export function AuthFrame({ children, aside, className }: { children: ReactNode; /** Short line under the lockup on wide screens. */ aside?: ReactNode; className?: string }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <header className="gold-rule relative flex items-center justify-between gap-4 bg-band px-4 py-3 text-band-fg lg:flex-col lg:items-start lg:justify-between lg:px-12 lg:py-10 lg:shadow-[inset_-3px_0_0_var(--pats-gold)]">
        <div className="flex items-center gap-3">
          <Wordmark px={44} className="lg:hidden" />
          <Wordmark px={72} className="hidden lg:block" />
        </div>
        <div className="hidden lg:block">
          <BrandLockup tone="cream" width={320} decorative />
          {aside && <p className="mt-6 max-w-sm text-body text-band-muted">{aside}</p>}
        </div>
        <LanguageSwitch onBand className="lg:hidden" />
        <p className="ktm-label hidden text-band-muted lg:block">PATS University · Est. 2026</p>
      </header>
      <div className="flex flex-col">
        <div className="hidden justify-end px-10 pt-8 lg:flex">
          <LanguageSwitch />
        </div>
        <main className={cn('mx-auto flex w-full max-w-form flex-1 flex-col justify-center px-4 py-10 lg:py-16', className)}>{children}</main>
      </div>
    </div>
  );
}
