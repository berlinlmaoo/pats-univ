import { Segmented } from '@/components/ui/segmented';
import { formatCount, formatDate, formatTime, formatUid, type CardStatus } from '@pats/shared';
import { Boxes, CreditCard, Inbox, PackageCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BatchStatusBadge, CardStatusBadge } from '@/components/dashboard/status';
import { Stat } from '@/components/dashboard/stat';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { batchLabel } from '@/lib/cards/service';
import { toReencodeInfo } from '@/lib/cards/crew';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { CardTabs, type CardsTab } from './tabs';
import { QueueTable } from './queue-table';
import { RequestActions } from './request-actions';
import { Progress } from './progress';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('cards.title') };
}

type Search = { tab?: string; city?: string };
const TABS: CardsTab[] = ['queue', 'batches', 'open', 'requests'];
const IN_PRODUCTION: CardStatus[] = ['IN_BATCH', 'SENT_TO_VENDOR', 'RECEIVED_HQ'];

/**
 * HQ Kartu page (PRODUCT.md §5.3 #3): the print queue per city → batches with their files and
 * progress → cards not handed over yet, plus re-encode requests from the cities.
 */
export default async function CardsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireHq();
  const t = await getT();
  const sp = await searchParams;
  const tab: CardsTab = TABS.includes(sp.tab as CardsTab) ? (sp.tab as CardsTab) : 'queue';
  const now = new Date();

  const [grouped, queueByCity, cities, pendingRequests] = await Promise.all([
    db.card.groupBy({ by: ['status'], _count: { _all: true } }),
    db.card.findMany({ where: { status: 'NOT_PRINTED', member: { status: 'ACTIVE' } }, select: { member: { select: { cityId: true } } } }).then((rows) => {
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.member.cityId, (counts.get(r.member.cityId) ?? 0) + 1);
      return counts;
    }),
    db.city.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, timezone: true } }),
    db.reencodeRequest.count({ where: { status: 'PENDING' } }),
  ]);
  const byStatus = (statuses: CardStatus[]) => grouped.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  const queued = [...queueByCity.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('cards.title')} description={t('cards.subtitle')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('cards.statQueue')} value={queued} />
        <Stat label={t('cards.statProduction')} value={byStatus(IN_PRODUCTION)} />
        <Stat label={t('cards.statEncoded')} value={byStatus(['ENCODED'])} />
        <Stat label={t('cards.statDelivered')} value={byStatus(['DELIVERED'])} />
      </div>

      <CardTabs tab={tab} counts={{ queue: queued, requests: pendingRequests }} />

      {tab === 'queue' && <QueueTab cities={cities} counts={queueByCity} cityId={sp.city} />}
      {tab === 'batches' && <BatchesTab now={now} />}
      {tab === 'open' && <OpenTab />}
      {tab === 'requests' && <RequestsTab now={now} />}
    </div>
  );

  async function QueueTab({ cities, counts, cityId }: { cities: { id: string; name: string; code: string; timezone: string }[]; counts: Map<string, number>; cityId?: string }) {
    const withQueue = cities.filter((c) => (counts.get(c.id) ?? 0) > 0);
    const city = cities.find((c) => c.id === cityId) ?? withQueue[0] ?? null;
    if (!city || withQueue.length === 0) {
      return (
        <Card>
          <EmptyState icon={Inbox} title={t('cards.queueEmptyTitle')} body={t('cards.queueEmptyBody')} />
        </Card>
      );
    }
    const cards = await db.card.findMany({
      where: { status: 'NOT_PRINTED', member: { cityId: city.id, status: 'ACTIVE' } },
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: { member: { select: { id: true, nim: true, fullName: true } } },
    });
    return (
      <div className="flex flex-col gap-3">
        <Segmented
          label={t('cards.queueCities')}
          active={city.id}
          items={cities.map((c) => ({ value: c.id, label: `${c.name} · ${formatCount(counts.get(c.id) ?? 0)}`, href: `/cards?tab=queue&city=${c.id}` }))}
        />
        <QueueTable
          city={{ id: city.id, name: city.name }}
          rows={cards.map((c) => ({
            cardId: c.id,
            memberId: c.member.id,
            nim: c.member.nim,
            fullName: c.member.fullName,
            since: formatDate(c.createdAt, t.locale, { timeZone: city.timezone }),
            replacement: Boolean(c.replacesCardId),
          }))}
        />
      </div>
    );
  }

  async function BatchesTab({ now }: { now: Date }) {
    const batches = await db.cardBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { city: { select: { code: true, name: true, timezone: true } } } });
    const ids = batches.map((b) => b.id);
    const [done, live, claimed] = await Promise.all([
      db.card.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, status: { in: ['ENCODED', 'DELIVERED'] } }, _count: { _all: true } }),
      db.card.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, status: { not: 'REVOKED' } }, _count: { _all: true } }),
      db.card.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, leaseExpiresAt: { gt: now } }, _count: { _all: true } }),
    ]);
    const n = (rows: typeof done, id: string) => rows.find((r) => r.batchId === id)?._count._all ?? 0;
    if (batches.length === 0) {
      return (
        <Card>
          <EmptyState icon={Boxes} title={t('cards.batchesEmptyTitle')} body={t('cards.batchesEmptyBody')} />
        </Card>
      );
    }
    return (
      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr>
              <Th>{t('cards.colBatch')}</Th>
              <Th className="hidden sm:table-cell">{t('cards.colCreated')}</Th>
              <Th className="hidden md:table-cell">{t('cards.colProgress')}</Th>
              <Th>{t('cards.colStatus')}</Th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const total = n(live, b.id);
              const encoded = n(done, b.id);
              const holding = n(claimed, b.id);
              return (
                <Tr key={b.id} className="relative">
                  <Td className="w-full max-w-0 sm:w-auto sm:max-w-72">
                    <Link href={`/cards/batches/${b.id}`} className="block min-w-0 after:absolute after:inset-0 focus-visible:outline-none">
                      <span className="block truncate font-medium tabular-nums text-fg">{batchLabel(b.city.code, b.number)}</span>
                      <span className="block truncate text-caption text-muted">
                        {b.city.name} · {t('cards.cardCount', { count: formatCount(total) })}
                      </span>
                    </Link>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-muted sm:table-cell">{formatDate(b.createdAt, t.locale, { timeZone: b.city.timezone })}</Td>
                  <Td className="hidden w-56 md:table-cell">
                    <Progress done={encoded} total={total} label={t('cards.encodedOf', { done: formatCount(encoded), total: formatCount(total) })} />
                    {holding > 0 && <p className="mt-1 text-caption text-muted">{t('cards.encodingNow', { count: formatCount(holding) })}</p>}
                  </Td>
                  <Td>
                    <BatchStatusBadge status={b.status} t={t} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    );
  }

  async function OpenTab() {
    const cards = await db.card.findMany({
      where: { status: { in: ['IN_BATCH', 'SENT_TO_VENDOR', 'RECEIVED_HQ', 'ENCODED'] } },
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
      take: 300,
      include: { member: { select: { id: true, nim: true, fullName: true, city: { select: { name: true, timezone: true } } } }, batch: { select: { id: true, number: true, city: { select: { code: true } } } } },
    });
    if (cards.length === 0) {
      return (
        <Card>
          <EmptyState icon={PackageCheck} title={t('cards.openEmptyTitle')} body={t('cards.openEmptyBody')} />
        </Card>
      );
    }
    return (
      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr>
              <Th>{t('cards.colMember')}</Th>
              <Th className="hidden md:table-cell">{t('cards.colBatch')}</Th>
              <Th className="hidden lg:table-cell">{t('cards.colUid')}</Th>
              <Th>{t('cards.colStatus')}</Th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <Tr key={c.id} className="relative">
                <Td className="w-full max-w-0 sm:w-auto sm:max-w-72">
                  <Link href={`/members/${c.member.id}`} className="block min-w-0 after:absolute after:inset-0 focus-visible:outline-none">
                    <span className="block break-words font-medium text-fg">{c.member.fullName}</span>
                    <span className="block truncate text-caption tabular-nums text-muted">
                      {c.member.nim} · {c.member.city.name}
                    </span>
                  </Link>
                </Td>
                <Td className="hidden whitespace-nowrap tabular-nums text-muted md:table-cell">{c.batch ? batchLabel(c.batch.city.code, c.batch.number) : '—'}</Td>
                <Td className="hidden whitespace-nowrap font-mono text-caption text-muted lg:table-cell">{c.nfcUid ? formatUid(c.nfcUid) : '—'}</Td>
                <Td>
                  <CardStatusBadge status={c.status} t={t} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    );
  }

  async function RequestsTab({ now }: { now: Date }) {
    const requests = await db.reencodeRequest.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        requestedBy: { select: { name: true } },
        decidedBy: { select: { name: true } },
        card: { select: { nfcUid: true, member: { select: { id: true, nim: true, fullName: true, city: { select: { name: true, timezone: true } } } } } },
      },
    });
    if (requests.length === 0) {
      return (
        <Card>
          <EmptyState icon={CreditCard} title={t('cards.requestsEmptyTitle')} body={t('cards.requestsEmptyBody')} />
        </Card>
      );
    }
    const pendingFirst = [...requests].sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING'));
    return (
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {pendingFirst.map((r) => {
            const info = toReencodeInfo(r, now);
            const tz = r.card.member.city.timezone;
            return (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/members/${r.card.member.id}`} className="font-medium text-fg hover:underline">
                      {r.card.member.fullName}
                    </Link>
                    <span className="text-caption tabular-nums text-muted">
                      {r.card.member.nim} · {r.card.member.city.name}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-body-sm text-fg">“{r.reason}”</p>
                  <p className="mt-1 text-caption text-muted">
                    {t('cards.requestedBy', { name: r.requestedBy.name, when: `${formatDate(r.createdAt, t.locale, { timeZone: tz })}, ${formatTime(r.createdAt, { timeZone: tz })}` })}
                    {r.card.nfcUid && <span className="font-mono"> · {formatUid(r.card.nfcUid)}</span>}
                  </p>
                  {info.status !== 'PENDING' && (
                    <p className="mt-1 text-caption text-muted">
                      {t(`cards.requestStatus.${info.status}`, { name: info.decidedBy ?? '—' })}
                      {info.decisionNote && ` · “${info.decisionNote}”`}
                    </p>
                  )}
                </div>
                {info.status === 'PENDING' ? (
                  <RequestActions requestId={r.id} memberName={r.card.member.fullName} requester={r.requestedBy.name} />
                ) : (
                  <ReencodeBadge status={info.status} />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  function ReencodeBadge({ status }: { status: string }) {
    const tone = status === 'APPROVED' ? 'success' : status === 'USED' ? 'accent' : 'neutral';
    return (
      <Badge tone={tone} className="shrink-0 self-start">
        {t.loose(`cards.requestBadge.${status}`)}
      </Badge>
    );
  }
}
