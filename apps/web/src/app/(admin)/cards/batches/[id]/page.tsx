import { CARD_BATCH_STATUSES, formatCount, formatDate, formatTime, formatUid, nextBatchAction, type CardBatchStatus } from '@pats/shared';
import { Check, ChevronLeft, FileSpreadsheet, FileText, ScanEye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BatchStatusBadge, CardStatusBadge } from '@/components/dashboard/status';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Alert } from '@/components/ui/alert';
import { buttonClass } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { batchLabel } from '@/lib/cards/service';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { LiveRefresh } from '../../../events/[id]/live-refresh';
import { RevokeCardButton } from '../../revoke-button';
import { Progress } from '../../progress';
import { BatchActions, RegenerateFiles, VendorNote } from './batch-actions';

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  return db.cardBatch.findUnique({
    where: { id },
    include: {
      city: { select: { code: true, name: true, timezone: true } },
      createdBy: { select: { name: true } },
      cards: {
        include: { member: { select: { id: true, nim: true, fullName: true } }, encodedBy: { select: { name: true } } },
        orderBy: { member: { nim: 'asc' } },
      },
    },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const b = await load((await params).id);
  return { title: b ? batchLabel(b.city.code, b.number) : (await getT())('cards.title') };
}

/** Steps the batch walks through, in order; ENCODING and DONE follow from the cards. */
const STEPS: CardBatchStatus[] = [...CARD_BATCH_STATUSES];

export default async function BatchPage({ params }: Params) {
  await requireHq();
  const t = await getT();
  const batch = await load((await params).id);
  if (!batch) notFound();
  const now = new Date();
  const tz = batch.city.timezone;
  const label = batchLabel(batch.city.code, batch.number);
  const live = batch.cards.filter((c) => c.status !== 'REVOKED');
  const encoded = live.filter((c) => c.status === 'ENCODED' || c.status === 'DELIVERED').length;
  const delivered = live.filter((c) => c.status === 'DELIVERED').length;
  const remaining = live.filter((c) => ['IN_BATCH', 'SENT_TO_VENDOR', 'RECEIVED_HQ'].includes(c.status)).length;
  const holding = live.filter((c) => c.leaseExpiresAt && c.leaseExpiresAt > now);
  const encoding = batch.status === 'RECEIVED_HQ' || batch.status === 'ENCODING';
  const step = STEPS.indexOf(batch.status);
  const when = (d: Date | null) => (d ? `${formatDate(d, t.locale, { timeZone: tz })}, ${formatTime(d, { timeZone: tz })}` : null);
  const files = `/api/hq/batches/${batch.id}/files`;
  const sample = live[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/cards?tab=batches"
          className="-ml-1 inline-flex h-7 items-center gap-0.5 rounded-sm pr-1.5 text-body-sm font-medium text-muted transition-colors hover:text-fg"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t('cards.backToBatches')}
        </Link>
        <header className="mt-3 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-title1 tabular-nums text-fg">{label}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm text-muted">
              <BatchStatusBadge status={batch.status} t={t} />
              <span>
                {batch.city.name} · {t('cards.cardCount', { count: formatCount(live.length) })}
              </span>
            </div>
          </div>
          <BatchActions
            batchId={batch.id}
            label={label}
            action={nextBatchAction(batch.status)}
            canCancel={batch.status === 'EXPORTED'}
            filesReady={Boolean(batch.batchPdfUrl)}
            remaining={remaining}
            cityName={batch.city.name}
          />
        </header>
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label={t('cards.steps')}>
        {STEPS.map((s, i) => {
          const done = i < step || batch.status === 'DONE';
          const current = i === step && batch.status !== 'DONE';
          const at = { EXPORTED: batch.exportedAt, SENT_TO_VENDOR: batch.sentToVendorAt, RECEIVED_HQ: batch.receivedHqAt, ENCODING: null, SHIPPED_TO_CITY: batch.shippedToCityAt, DONE: null }[s];
          return (
            <li
              key={s}
              aria-current={current ? 'step' : undefined}
              className={cn('rounded-control border px-3 py-2.5', current ? 'border-accent bg-accent-subtle' : 'border-border bg-surface')}
            >
              <div className="flex items-center gap-1.5">
                {done ? (
                  <Check className="size-3.5 shrink-0 text-success-fg" strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <span className={cn('size-1.5 shrink-0 rounded-full', current ? 'bg-accent' : 'bg-border-strong')} aria-hidden="true" />
                )}
                <span className={cn('truncate text-caption font-medium', current ? 'text-accent-subtle-fg' : done ? 'text-fg' : 'text-muted')}>
                  {t(`batchStatus.${s}`)}
                </span>
              </div>
              <p className="mt-0.5 truncate pl-5 text-caption tabular-nums text-muted">{at && (done || current) ? when(at) : ' '}</p>
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="min-w-0 overflow-hidden lg:col-span-2">
          <CardHeader
            title={t('cards.batchCards')}
            description={encoding ? <LiveRefresh /> : undefined}
            className="pb-4"
          />
          <Table>
            <thead>
              <tr>
                <Th>{t('cards.colMember')}</Th>
                <Th className="hidden sm:table-cell">{t('cards.colStatus')}</Th>
                <Th className="hidden lg:table-cell">{t('cards.colStation')}</Th>
                <Th className="text-right">
                  <span className="sr-only">{t('cards.colActions')}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {batch.cards.map((c) => {
                const held = c.leaseExpiresAt && c.leaseExpiresAt > now;
                return (
                  <Tr key={c.id}>
                    <Td className="w-full py-2.5">
                      <Link href={`/members/${c.member.id}`} className="block break-words font-medium text-fg hover:underline">
                        {c.member.fullName}
                      </Link>
                      <span className="block text-caption tabular-nums text-muted">{c.member.nim}</span>
                      <div className="mt-1.5 sm:hidden">
                        <CardStatusBadge status={c.status} t={t} />
                      </div>
                      {held && <p className="mt-1 text-caption text-accent-fg sm:hidden">{t('cards.heldBy', { station: c.leaseStation ?? '—' })}</p>}
                    </Td>
                    <Td className="hidden whitespace-nowrap py-2.5 sm:table-cell">
                      <CardStatusBadge status={c.status} t={t} />
                      {held && <p className="mt-1 text-caption text-accent-fg">{t('cards.heldBy', { station: c.leaseStation ?? '—' })}</p>}
                    </Td>
                    <Td className="hidden py-2.5 lg:table-cell">
                      {c.encodedStation ? (
                        <>
                          <span className="block whitespace-nowrap text-body-sm text-fg">{c.encodedStation}</span>
                          <span className="block whitespace-nowrap text-caption text-muted">
                            {[c.chipType, c.encodedAt && formatTime(c.encodedAt, { timeZone: tz })].filter(Boolean).join(' · ')}
                          </span>
                          {c.nfcUid && <span className="block whitespace-nowrap font-mono text-caption text-muted">{formatUid(c.nfcUid)}</span>}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="w-0 whitespace-nowrap text-right">
                      <div className="-mr-2 flex items-center justify-end">
                        {c.printFileUrl && (
                          <a href={`${files}/members/${c.id}.pdf`} target="_blank" rel="noopener" className={buttonClass('ghost', 'sm')} aria-label={t('cards.printFileFor', { name: c.member.fullName })}>
                            <FileText aria-hidden="true" />
                          </a>
                        )}
                        {c.status !== 'REVOKED' && c.status !== 'DELIVERED' && <RevokeCardButton cardId={c.id} memberName={c.member.fullName} compact />}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title={t('cards.progress')} className="pb-3" />
            <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
              <Progress done={encoded} total={live.length} label={t('cards.encodedOf', { done: formatCount(encoded), total: formatCount(live.length) })} />
              <Progress done={delivered} total={live.length} label={t('cards.deliveredOf', { done: formatCount(delivered), total: formatCount(live.length) })} />
              {holding.length > 0 && (
                <div>
                  <p className="text-caption font-medium text-fg">{t('cards.encodingNow', { count: formatCount(holding.length) })}</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {[...new Set(holding.map((c) => c.leaseStation ?? '—'))].map((s) => (
                      <li key={s} className="truncate text-caption text-muted">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('cards.files')} description={t('cards.filesBody')} className="pb-3" />
            <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
              {batch.filesError && <Alert tone="danger">{t('cards.filesError')}</Alert>}
              {batch.batchPdfUrl ? (
                <>
                  <a href={`${files}/batch.pdf`} target="_blank" rel="noopener" className={buttonClass('secondary', 'md', 'justify-start')}>
                    <FileText aria-hidden="true" />
                    {t('cards.batchPdf', { count: formatCount(live.length * 2) })}
                  </a>
                  <a href={`${files}/manifest.csv`} className={buttonClass('secondary', 'md', 'justify-start')}>
                    <FileSpreadsheet aria-hidden="true" />
                    {t('cards.manifest')}
                  </a>
                  {sample && (
                    <a href={`${files}/proof/${sample.id}.pdf`} target="_blank" rel="noopener" className={buttonClass('ghost', 'md', 'justify-start')}>
                      <ScanEye aria-hidden="true" />
                      {t('cards.proof')}
                    </a>
                  )}
                  <p className="text-caption text-muted">
                    {t('cards.filesGenerated', { when: when(batch.filesGeneratedAt) ?? '—' })} · {t('cards.filesSpec')}
                  </p>
                </>
              ) : (
                !batch.filesError && <p className="text-body-sm text-muted">{t('cards.filesMissing')}</p>
              )}
              <RegenerateFiles batchId={batch.id} hasFiles={Boolean(batch.batchPdfUrl)} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t('cards.vendorNote')} className="pb-3" />
            <div className="border-t border-border px-5 py-4">
              <VendorNote batchId={batch.id} initial={batch.vendorNote ?? ''} />
              {batch.createdBy && (
                <p className="mt-3 text-caption text-muted">{t('cards.createdBy', { name: batch.createdBy.name, when: when(batch.createdAt)! })}</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
