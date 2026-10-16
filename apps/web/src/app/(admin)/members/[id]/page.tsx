import { ageOn, formatCount, formatDate, formatPhone, formatTime } from '@pats/shared';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetailList } from '@/components/dashboard/detail-list';
import { ActiveBadge, CardStatusBadge, MethodBadge } from '@/components/dashboard/status';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { MemberActions } from './member-actions';

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  return db.member.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, phone: true } },
      city: { select: { id: true, name: true, code: true, timezone: true } },
      cards: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
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
                  { label: t('members.song'), value: member.favoriteSong || dash },
                  { label: t('members.genre'), value: member.favoriteGenre || dash },
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
            <CardHeader title={t('members.membership')} className="pb-3" />
            <div className="border-t border-border">
              <DetailList
                items={[
                  { label: t('members.joined'), value: formatDate(member.joinedAt, t.locale, { timeZone: tz }) },
                  { label: t('members.source'), value: member.signupSource ?? t('members.sourceDirect') },
                  { label: t('members.card'), value: <CardStatusBadge status={member.cards[0]?.status ?? 'NOT_PRINTED'} t={t} /> },
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
