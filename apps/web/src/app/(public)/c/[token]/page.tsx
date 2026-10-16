import { formatDate } from '@pats/shared';
import { SearchX, ShieldOff, Smartphone, UserX } from 'lucide-react';
import type { Metadata } from 'next';
import { DetailList } from '@/components/dashboard/detail-list';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Wordmark } from '@/components/ui/wordmark';
import { cardProfile } from '@/lib/cards/service';
import { db } from '@/lib/db';
import { getT } from '@/lib/i18n';
import { getSetting } from '@/lib/settings';

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // A card URL is personal: never in search results.
  return { title: { absolute: t('cardPage.metaTitle') }, robots: { index: false, follow: false } };
}

/**
 * Where a tapped or scanned card lands when the app isn't installed (PRODUCT.md §4.1): a short
 * profile and the app links. With the app installed, the OS opens the app instead (universal
 * link / app link). A revoked or unknown card shows nothing personal.
 */
export default async function CardPage({ params }: Params) {
  const t = await getT();
  const profile = await cardProfile((await params).token);
  const [ios, android] = await Promise.all([getSetting(db, 'appStoreUrl'), getSetting(db, 'playStoreUrl')]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-form flex-col px-4 pb-10 pt-4 sm:pt-8">
      <div className="flex h-control-md items-center justify-between">
        <Wordmark />
        <LanguageSwitch />
      </div>
      <main className="mt-8 flex-1 animate-fade-up sm:mt-12">
        {!profile ? (
          <Card>
            <EmptyState icon={SearchX} title={t('cardPage.notFoundTitle')} body={t('cardPage.notFoundBody')} />
          </Card>
        ) : profile.state === 'revoked' ? (
          <Card>
            <EmptyState icon={ShieldOff} title={t('cardPage.revokedTitle')} body={t('cardPage.revokedBody')} />
          </Card>
        ) : profile.state === 'inactive' || !profile.member ? (
          <Card>
            <EmptyState icon={UserX} title={t('cardPage.inactiveTitle')} body={t('cardPage.inactiveBody')} />
          </Card>
        ) : (
          <>
            <p className="text-label uppercase text-accent-fg">{t('cardPage.eyebrow')}</p>
            <h1 className="mt-2 break-words font-display text-title1 text-fg">{profile.member.fullName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-body text-muted">
              <span className="tabular-nums">{profile.member.nim}</span>
              <span aria-hidden="true">·</span>
              <span>{profile.member.city}</span>
              <Badge tone={profile.state === 'active' ? 'success' : 'accent'} dot>
                {profile.state === 'active' ? t('cardPage.active') : t('cardPage.pending')}
              </Badge>
            </div>

            <Card className="mt-6">
              <DetailList
                items={[
                  { label: t('members.song'), value: profile.member.favoriteSong },
                  { label: t('members.genre'), value: profile.member.favoriteGenre },
                  ...(profile.member.quotes ? [{ label: t('members.quotes'), value: <q className="italic">{profile.member.quotes}</q> }] : []),
                  { label: t('members.joined'), value: formatDate(new Date(profile.member.joinedAt), t.locale) },
                ]}
              />
            </Card>

            <Card className="mt-3 flex gap-3.5 px-5 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted [&_svg]:size-4.5">
                <Smartphone aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 break-words text-body-sm text-muted">
                <h2 className="pt-1.5 text-body font-semibold text-fg">{t('cardPage.appTitle')}</h2>
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
          </>
        )}
      </main>
    </div>
  );
}
