import { ageOn, cardUrl, formatCount, formatDate, formatPhone, formatTime, formatUid } from '@pats/shared';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetailList } from '@/components/dashboard/detail-list';
import { ActiveBadge, CardStatusBadge, MethodBadge } from '@/components/dashboard/status';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { KtmCard } from '@/components/ktm/ktm-card';
import { photoReadUrl } from '@/lib/members/photo';
import { UserRound } from 'lucide-react';
import { batchLabel } from '@/lib/cards/service';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { RevokeCardButton } from '../../cards/revoke-button';
import { MemberActions } from './member-actions';

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  return db.member.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, phone: true } },
      city: { select: { id: true, name: true, code: true, timezone: true } },
      cards: {
        orderBy: { createdAt: 'desc' },
        include: { batch: { select: { id: true, number: true, city: { select: { code: true } } } }, deliveredBy: { select: { name: true } } },
      },
      checkIns: {
        orderBy: { checkedInAt: 'desc' },
        take: 20,
        select: {
          id: true,
          checkedInAt: true,
          method: true,
          event: { select: { id: true, title: true, city: { select: { timezone: true } } } },
        },
      },
      _count: { select: { checkIns: true } },
    },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const member = await load((await params).id);
  return { title: member?.fullName ?? (await getT())('members.title') };
}

export default async function MemberPage({ params }: Params) {
  await requireHq();
  const t = await getT();
  const member = await load((await params).id);
  if (!member) notFound();
  const cities = await db.city.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });

  const dob = member.dateOfBirth;
  const dobParts = { year: dob.getUTCFullYear(), month: dob.getUTCMonth() + 1, day: dob.getUTCDate() };
  const dobIso = dob.toISOString().slice(0, 10);
  const tz = member.city.timezone;
  const dash = <span className="text-muted">{t('common.notSet')}</span>;
  const liveCard = member.cards.find((c) => c.status !== 'REVOKED' && c.ndefToken);
  const photo = photoReadUrl(member.photoUrl);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/members"
          className="-ml-1 inline-flex h-7 items-center gap-0.5 rounded-sm pr-1.5 text-body-sm font-medium text-muted transition-colors hover:text-fg"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t('members.backToList')}
        </Link>
        <header className="mt-3 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="break-words font-display text-title1 text-fg">{member.fullName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm text-muted">
              <span className="tabular-nums text-fg">{member.nim}</span>
              <span aria-hidden="true">·</span>
              <span>{member.city.name}</span>
              <ActiveBadge status={member.status} t={t} />
              {member.isPromoter && <Badge tone="accent">PR</Badge>}
            </div>
          </div>
          <MemberActions
            member={{
              id: member.id,
              fullName: member.fullName,
              dateOfBirth: dobIso,
              cityId: member.cityId,
              phone: member.user.phone,
              favoriteDrink: member.favoriteDrink,
              favoriteGenre: member.favoriteGenre,
              active: member.status === 'ACTIVE',
            }}
            cities={cities}
          />
        </header>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <Card className="min-w-0">
            <CardHeader title={t('members.profile')} className="pb-3" />
            <div className="border-t border-border">
              <DetailList
                items={[
                  { label: t('members.fullName'), value: member.fullName },
                  {
                    label: t('members.dateOfBirth'),
                    value: `${formatDate(dob, t.locale, { timeZone: 'UTC', withYear: true })} · ${t('members.age', { age: ageOn(dobParts, new Date(), tz) })}`,
                  },
                  { label: t('members.city'), value: `${member.city.name} (${member.city.code})` },
                  { label: t('members.drink'), value: member.favoriteDrink || dash },
                  { label: t('members.genre'), value: member.favoriteGenre || dash },
                  { label: t('members.song'), value: member.favoriteSong || dash },
                  { label: t('members.quotes'), value: member.quotes ? `“${member.quotes}”` : dash },
                ]}
              />
            </div>
          </Card>

          <Card className="min-w-0">
            <CardHeader
              title={t('members.attendance')}
              action={<span className="font-display text-title3 tabular-nums text-fg">{formatCount(member._count.checkIns)}</span>}
              className="pb-3"
            />
            {member.checkIns.length === 0 ? (
              <p className="border-t border-border px-5 py-4 text-body-sm text-muted">{t('members.attendanceEmpty')}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {member.checkIns.map((c) => {
                  const ctz = c.event.city.timezone;
                  return (
                    <li key={c.id} className="relative flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-hover">
                      <div className="min-w-0 flex-1">
                        <Link href={`/events/${c.event.id}`} className="block truncate text-body-sm font-medium text-fg after:absolute after:inset-0">
                          {c.event.title}
                        </Link>
                        <p className="truncate text-caption tabular-nums text-muted">
                          {formatDate(c.checkedInAt, t.locale, { timeZone: ctz })}, {formatTime(c.checkedInAt, { timeZone: ctz })}
                        </p>
                      </div>
                      <MethodBadge method={c.method} t={t} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card className="min-w-0">
            <CardHeader title={t('members.ktmPreview')} className="pb-3" />
            <div className="flex flex-col gap-4 border-t border-border p-5">
              <KtmCard
                name={member.fullName}
                drink={member.favoriteDrink}
                quote={member.quotes}
                qrValue={liveCard?.ndefToken ? cardUrl(liveCard.ndefToken) : null}
              />
              <div className="flex items-center gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-muted text-muted">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed private URL
                    <img src={photo} alt={t('cardPage.photoAlt', { name: member.fullName })} className="size-full object-cover" />
                  ) : (
                    <UserRound className="size-7" strokeWidth={1.5} aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="ktm-label text-muted">{t('members.photo')}</p>
                  <p className="mt-0.5 text-body-sm text-fg">{photo ? member.fullName : t('members.noPhoto')}</p>
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title={t('members.contact')} className="pb-3" />
            <div className="border-t border-border">
              <DetailList
                items={[
                  {
                    label: t('members.email'),
                    value: (
                      <a href={`mailto:${member.user.email}`} className="text-accent-fg hover:underline">
                        {member.user.email}
                      </a>
                    ),
                  },
                  {
                    label: t('members.phone'),
                    value: (
                      <a href={`https://wa.me/${member.user.phone.replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="tabular-nums text-accent-fg hover:underline">
                        {formatPhone(member.user.phone)}
                      </a>
                    ),
                  },
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t('members.cards')} className="pb-3" />
            {member.cards.length === 0 ? (
              <p className="border-t border-border px-5 py-4 text-body-sm text-muted">{t('members.cardsEmpty')}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {member.cards.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardStatusBadge status={c.status} t={t} />
                        {c.batch && (
                          <Link href={`/cards/batches/${c.batch.id}`} className="text-caption tabular-nums text-accent-fg hover:underline">
                            {batchLabel(c.batch.city.code, c.batch.number)}
                          </Link>
                        )}
                      </div>
                      <p className="mt-1 text-caption text-muted">
                        {c.status === 'REVOKED' && c.revokedAt
                          ? t('members.cardRevoked', { date: formatDate(c.revokedAt, t.locale, { timeZone: tz }), reason: c.revokeReason ?? '—' })
                          : c.status === 'DELIVERED' && c.deliveredAt
                            ? t('members.cardDelivered', { date: formatDate(c.deliveredAt, t.locale, { timeZone: tz }), name: c.deliveredBy?.name ?? '—' })
                            : t('members.cardSince', { date: formatDate(c.createdAt, t.locale, { timeZone: tz }) })}
                      </p>
                      {c.nfcUid && <p className="mt-0.5 font-mono text-caption text-muted">{formatUid(c.nfcUid)}</p>}
                    </div>
                    {c.status !== 'REVOKED' && c.status !== 'NOT_PRINTED' && <RevokeCardButton cardId={c.id} memberName={member.fullName} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title={t('members.membership')} className="pb-3" />
            <div className="border-t border-border">
              <DetailList
                items={[
                  { label: t('members.joined'), value: formatDate(member.joinedAt, t.locale, { timeZone: tz }) },
                  { label: t('members.source'), value: member.signupSource ?? t('members.sourceDirect') },
                  { label: t('members.promoter'), value: member.isPromoter ? t('common.yes') : t('common.no') },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
