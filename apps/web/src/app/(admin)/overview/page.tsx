import { DEFAULT_TIMEZONE, formatCount, formatDate, toZonedInput, zonedTimeToUtc } from '@pats/shared';
import { ChevronRight, UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyButton } from '@/components/dashboard/copy-button';
import { Stat } from '@/components/dashboard/stat';
import { CardStatusBadge } from '@/components/dashboard/status';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('overview.title') };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default async function OverviewPage() {
  await requireHq();
  const t = await getT();
  const weekAgo = daysAgo(7);

  // "Today" is the WIB calendar day; cities in other zones still count toward the HQ total.
  const today = toZonedInput(new Date(), DEFAULT_TIMEZONE).date.split('-').map(Number) as [number, number, number];
  const startOfToday = zonedTimeToUtc({ year: today[0], month: today[1], day: today[2], hour: 0, minute: 0 }, DEFAULT_TIMEZONE);

  const [cities, membersByCity, newByCity, toPrintByCity, recent, checkInsToday, cardsByCity] = await Promise.all([
    db.city.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, waGroupUrl: true } }),
    db.member.groupBy({ by: ['cityId'], _count: { _all: true } }),
    db.member.groupBy({ by: ['cityId'], where: { joinedAt: { gte: weekAgo } }, _count: { _all: true } }),
    db.$queryRaw<{ cityId: string; n: bigint }[]>`
      SELECT m."cityId", COUNT(*) AS n FROM "Card" c JOIN "Member" m ON m.id = c."memberId"
      WHERE c.status = 'NOT_PRINTED' AND m.status = 'ACTIVE' GROUP BY m."cityId"`.then((rows) =>
      rows.map((r) => ({ cityId: r.cityId, _count: { _all: Number(r.n) } })),
    ),
    db.member.findMany({
      orderBy: { joinedAt: 'desc' },
      take: 6,
      include: { city: { select: { name: true, timezone: true } }, cards: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
    db.checkIn.count({ where: { checkedInAt: { gte: startOfToday } } }),
    db.$queryRaw<{ cityId: string; status: string; n: bigint }[]>`
      SELECT m."cityId", c.status, COUNT(*) AS n FROM "Card" c JOIN "Member" m ON m.id = c."memberId"
      WHERE c.status IN ('ENCODED', 'DELIVERED') GROUP BY m."cityId", c.status`,
  ]);
  const cardsIn = (cityId: string, status: 'ENCODED' | 'DELIVERED') => Number(cardsByCity.find((r) => r.cityId === cityId && r.status === status)?.n ?? 0);

  const count = (rows: { cityId: string; _count: { _all: number } }[], cityId: string) =>
    rows.find((r) => r.cityId === cityId)?._count._all ?? 0;
  const sum = (rows: { _count: { _all: number } }[]) => rows.reduce((n, r) => n + r._count._all, 0);
  const total = sum(membersByCity);
  const joinUrl = `${env().APP_URL.replace(/\/$/, '')}/join`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('overview.title')}
        description={t('overview.subtitle')}
        actions={<CopyButton value={joinUrl} label={t('overview.copyJoinLink')} copiedLabel={t('join.copied')} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('overview.totalMembers')} value={total} />
        <Stat label={t('overview.newThisWeek')} value={sum(newByCity)} />
        <Stat label={t('overview.cardsToPrint')} value={sum(toPrintByCity)} />
        <Stat label={t('overview.checkInsToday')} value={checkInsToday} />
      </div>

      {total === 0 ? (
        <Card>
          <EmptyState
            icon={UserPlus}
            title={t('overview.emptyTitle')}
            body={t('overview.emptyBody')}
            action={<CopyButton value={joinUrl} label={t('overview.copyJoinLink')} copiedLabel={t('join.copied')} />}
          />
        </Card>
      ) : (
        <div className="grid gap-6 2xl:grid-cols-5">
          <Card className="min-w-0 2xl:col-span-3">
            <CardHeader title={t('overview.byCity')} className="pb-4" />
            {/* Phones: one block per city with the three numbers that matter (audit #20). */}
            <ul className="divide-y divide-border border-t border-border sm:hidden">
              {cities.map((c) => (
                <li key={c.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold text-fg">
                      {c.name} <span className="ml-1 text-caption font-normal text-muted">{c.code}</span>
                    </p>
                    {c.waGroupUrl ? (
                      <Badge tone="success" dot>{t('cities.waSet')}</Badge>
                    ) : (
                      <Badge tone="warning" dot>{t('cities.waMissing')}</Badge>
                    )}
                  </div>
                  <dl className="mt-2.5 grid grid-cols-3 gap-2">
                    {(
                      [
                        [t('overview.totalMembers'), count(membersByCity, c.id)],
                        [t('overview.newThisWeek'), count(newByCity, c.id)],
                        [t('overview.cardsToPrint'), count(toPrintByCity, c.id)],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="ktm-label line-clamp-2 text-muted">{label}</dt>
                        <dd className="mt-0.5 text-title3 tabular-nums text-fg">{formatCount(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <Table className="hidden sm:table">
              <thead>
                <tr>
                  <Th>{t('cities.colCity')}</Th>
                  <Th className="text-right">{t('overview.totalMembers')}</Th>
                  <Th className="text-right">{t('overview.newThisWeek')}</Th>
                  <Th className="text-right">{t('overview.cardsToPrint')}</Th>
                  <Th className="hidden text-right md:table-cell">{t('overview.cardsOnTheWay')}</Th>
                  <Th className="hidden text-right md:table-cell">{t('overview.cardsActive')}</Th>
                  <Th>{t('cities.colWa')}</Th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <span className="font-medium text-fg">{c.name}</span>
                      <span className="ml-2 text-caption text-muted">{c.code}</span>
                    </Td>
                    <Td className="text-right tabular-nums">{formatCount(count(membersByCity, c.id))}</Td>
                    <Td className="text-right tabular-nums">{formatCount(count(newByCity, c.id))}</Td>
                    <Td className="text-right tabular-nums">{formatCount(count(toPrintByCity, c.id))}</Td>
                    <Td className="hidden text-right tabular-nums md:table-cell">{formatCount(cardsIn(c.id, 'ENCODED'))}</Td>
                    <Td className="hidden text-right tabular-nums md:table-cell">{formatCount(cardsIn(c.id, 'DELIVERED'))}</Td>
                    <Td>
                      {c.waGroupUrl ? (
                        <Badge tone="success" dot>
                          {t('cities.waSet')}
                        </Badge>
                      ) : (
                        <Badge tone="warning" dot>
                          {t('cities.waMissing')}
                        </Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card className="min-w-0 2xl:col-span-2">
            <CardHeader
              title={t('overview.recent')}
              action={
                <Link href="/members" className="inline-flex h-7 items-center gap-0.5 rounded-sm text-body-sm font-medium text-accent-fg hover:underline">
                  {t('overview.viewAll')}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
            <ul className="mt-3 border-t border-border">
              {recent.map((m) => (
                <li key={m.id} className="border-b border-border last:border-b-0">
                  <Link href={`/members/${m.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-hover">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium text-fg">{m.fullName}</p>
                      <p className="truncate text-caption text-muted">
                        <span className="font-semibold text-fg">{formatDate(m.joinedAt, t.locale, { timeZone: m.city.timezone })}</span> · {m.city.name} ·{' '}
                        <span className="tabular-nums">{m.nim}</span>
                      </p>
                    </div>
                    <CardStatusBadge status={m.cards[0]?.status ?? 'NOT_PRINTED'} t={t} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
