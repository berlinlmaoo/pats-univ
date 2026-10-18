import { cardUrl, formatDate } from '@pats/shared';
import { BadgeCheck, CircleSlash, SearchX, Smartphone, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { I18nProvider } from '@/components/i18n/provider';
import { KtmCard } from '@/components/ktm/ktm-card';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Wordmark } from '@/components/ui/wordmark';
import { cardProfile } from '@/lib/cards/service';
import { db } from '@/lib/db';
import { getLocale, getT } from '@/lib/i18n';
import { getSetting } from '@/lib/settings';
import { cn } from '@/lib/cn';

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // A card URL is personal: never in search results.
  return { title: { absolute: t('cardPage.metaTitle') }, robots: { index: false, follow: false } };
}

// Status is live: a revoked card must read "deactivated" the moment HQ revokes it.
export const dynamic = 'force-dynamic';

/**
 * The digital student ID behind a tapped or scanned card (PRODUCT.md §4.1): the KTM as printed,
 * its live status, city, member since and the member's photo, so venue staff can match the face.
 * Never NIM, email, phone, song or quote. With the app installed, the OS opens the app instead.
 */
export default async function CardPage({ params }: Params) {
  const t = await getT();
  const token = (await params).token;
  const profile = await cardProfile(token);
  const [ios, android] = await Promise.all([getSetting(db, 'appStoreUrl'), getSetting(db, 'playStoreUrl')]);
  const m = profile?.member ?? null;
  const live = profile && m && (profile.state === 'active' || profile.state === 'pending');

  return (
    <I18nProvider locale={await getLocale()}>
      <div className="flex min-h-dvh flex-col">
        <header className="gold-rule bg-band text-band-fg">
          <div className="mx-auto flex h-16 w-full max-w-xl items-center justify-between gap-3 px-4">
            <Wordmark px={44} />
            <LanguageSwitch onBand />
          </div>
        </header>

        <main className="mx-auto w-full max-w-xl flex-1 animate-fade-up px-4 pb-12 pt-8">
          {!profile ? (
            <Card>
              <EmptyState icon={SearchX} title={t('cardPage.notFoundTitle')} body={t('cardPage.notFoundBody')} />
            </Card>
          ) : !live || !m ? (
            <>
              <StatusBanner tone="danger" icon={<CircleSlash aria-hidden="true" />} title={t('cardPage.statusDeactivated')} />
              <Card className="mt-4">
                <EmptyState
                  icon={CircleSlash}
                  title={profile.state === 'revoked' ? t('cardPage.revokedTitle') : t('cardPage.inactiveTitle')}
                  body={profile.state === 'revoked' ? t('cardPage.revokedBody') : t('cardPage.inactiveBody')}
                />
              </Card>
            </>
          ) : (
            <>
              <h1 className="varsity text-fg">{t('cardPage.heading')}</h1>
              <StatusBanner
                tone={profile.state === 'active' ? 'success' : 'accent'}
                icon={<BadgeCheck aria-hidden="true" />}
                title={profile.state === 'active' ? t('cardPage.statusActive') : t('cardPage.statusPending')}
                className="mt-4"
              />

              <div className="mt-6">
                <KtmCard name={m.fullName} drink={m.favoriteDrink} genre={m.favoriteGenre} qrValue={cardUrl(token)} priority />
              </div>

              <Card className="mt-6 flex items-center gap-4 p-4">
                <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-muted text-muted">
                  {m.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed private URL
                    <img src={m.photoUrl} alt={t('cardPage.photoAlt', { name: m.fullName })} className="size-full object-cover" />
                  ) : (
                    <UserRound className="size-9" strokeWidth={1.5} aria-hidden="true" />
                  )}
                </div>
                <dl className="grid min-w-0 flex-1 gap-3">
                  <div className="min-w-0">
                    <dt className="ktm-label text-muted">{t('cardPage.city')}</dt>
                    <dd className="mt-0.5 truncate text-body font-bold text-fg">{m.city}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="ktm-label text-muted">{t('cardPage.memberSince')}</dt>
                    <dd className="mt-0.5 text-body font-bold tabular-nums text-fg">{formatDate(new Date(m.joinedAt), t.locale, { withYear: true })}</dd>
                  </div>
                </dl>
              </Card>
            </>
          )}

          <Card className="mt-4 flex gap-3.5 px-5 py-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-muted [&_svg]:size-4.5">
              <Smartphone aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 break-words text-body-sm text-muted">
              <h2 className="pt-1.5 text-body font-bold text-fg">{t('cardPage.appTitle')}</h2>
              <p className="mt-1">{t('cardPage.appBody')}</p>
              {ios || android ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {ios && (
                    <a href={ios} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md')}>
                      {t('join.appStore')}
                    </a>
                  )}
                  {android && (
                    <a href={android} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md')}>
                      {t('join.playStore')}
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-2">{t('join.appSoon')}</p>
              )}
            </div>
          </Card>
        </main>
      </div>
    </I18nProvider>
  );
}

function StatusBanner({ tone, icon, title, className }: { tone: 'success' | 'accent' | 'danger'; icon: ReactNode; title: string; className?: string }) {
  const tones = {
    success: 'bg-success-subtle text-success-fg',
    accent: 'bg-accent-subtle text-accent-subtle-fg',
    danger: 'bg-danger-subtle text-danger-fg',
  } as const;
  return (
    <div role="status" className={cn('flex items-center gap-2.5 rounded-control px-4 py-3 [&_svg]:size-5 [&_svg]:shrink-0', tones[tone], className)}>
      {icon}
      <p className="ktm-label !text-body-sm">{title}</p>
    </div>
  );
}
