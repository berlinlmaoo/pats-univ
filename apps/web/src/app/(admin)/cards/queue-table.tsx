'use client';

import { BATCH_MAX_CARDS, formatCount } from '@pats/shared';
import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { createBatchAction } from '@/lib/hq/cards';

export interface QueueRow {
  cardId: string;
  memberId: string;
  nim: string;
  fullName: string;
  since: string;
  replacement: boolean;
}

/** The city's print queue: pick members (all by default) and turn them into one batch. */
export function QueueTable({ city, rows }: { city: { id: string; name: string }; rows: QueueRow[] }) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.slice(0, BATCH_MAX_CARDS).map((r) => r.cardId)));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const allSelected = selected.size === Math.min(rows.length, BATCH_MAX_CARDS);
  const ids = useMemo(() => rows.filter((r) => selected.has(r.cardId)).map((r) => r.cardId), [rows, selected]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < BATCH_MAX_CARDS) next.add(id);
      return next;
    });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm text-muted">
          {t('cards.queueSelected', { selected: formatCount(selected.size), total: formatCount(rows.length) })}
          {rows.length > BATCH_MAX_CARDS && <span> · {t('cards.queueMax', { max: formatCount(BATCH_MAX_CARDS) })}</span>}
        </p>
        <Button onClick={() => (setError(null), setConfirming(true))} disabled={selected.size === 0}>
          <Printer aria-hidden="true" />
          {t('cards.createBatch', { count: formatCount(selected.size) })}
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Th className="w-12">
              <input
                type="checkbox"
                aria-label={t('cards.selectAll')}
                className="size-4 cursor-pointer accent-accent"
                checked={allSelected && rows.length > 0}
                onChange={() => setSelected(allSelected ? new Set() : new Set(rows.slice(0, BATCH_MAX_CARDS).map((r) => r.cardId)))}
              />
            </Th>
            <Th>{t('cards.colMember')}</Th>
            <Th className="hidden sm:table-cell">{t('cards.colWaiting')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.cardId}>
              <Td className="w-12">
                <input
                  type="checkbox"
                  aria-label={t('cards.selectMember', { name: r.fullName })}
                  className="size-4 cursor-pointer accent-accent"
                  checked={selected.has(r.cardId)}
                  onChange={() => toggle(r.cardId)}
                />
              </Td>
              <Td className="w-full max-w-0 sm:w-auto sm:max-w-80">
                <div className="flex min-w-0 items-center gap-2">
                  <Link href={`/members/${r.memberId}`} className="truncate font-medium text-fg hover:underline">
                    {r.fullName}
                  </Link>
                  {r.replacement && <Badge tone="warning">{t('cards.replacement')}</Badge>}
                </div>
                <span className="block truncate text-caption tabular-nums text-muted">
                  {r.nim}
                  <span className="sm:hidden"> · {r.since}</span>
                </span>
              </Td>
              <Td className="hidden whitespace-nowrap text-muted sm:table-cell">{r.since}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title={t('cards.createBatchTitle', { city: city.name })}
        description={t('cards.createBatchBody', { count: formatCount(ids.length) })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await createBatchAction({ cityId: city.id, cardIds: ids });
                  // Success redirects to the new batch; only failures come back here.
                  if (res && !res.ok) setError(t.loose(res.message ?? 'errors.generic', res.params));
                })
              }
            >
              {pending ? t('cards.creatingBatch') : t('cards.createBatchConfirm')}
            </Button>
          </>
        }
      >
        {error ? <Alert tone="danger">{error}</Alert> : <p className="text-body-sm text-muted">{t('cards.createBatchHint')}</p>}
      </Dialog>
    </Card>
  );
}
