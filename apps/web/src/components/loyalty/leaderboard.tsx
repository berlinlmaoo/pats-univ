'use client';
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { formatCount, formatDate, formatMonth, zonedParts, type LeaderboardDto } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/cn';
import { DataState, useLoyalty } from './state';
import { LoyaltyTabs } from './tabs';

/** Last `count` periods (newest first) as "YYYY-MM" keys the API accepts; quarters use their first month. */
function recentPeriods(mode: string, count: number): { value: string; year: number; month: number }[] {
  const now = zonedParts(new Date());
  const step = mode === 'QUARTERLY' ? 3 : 1;
  let month = mode === 'QUARTERLY' ? Math.floor((now.month - 1) / 3) * 3 + 1 : now.month;
  let year = now.year;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ value: `${year}-${String(month).padStart(2, '0')}`, year, month });
    month -= step;
    if (month < 1) {
      month += 12;
      year -= 1;
    }
  }
  return out;
}

function periodLabel(mode: string, year: number, month: number, locale: 'id' | 'en'): string {
  if (mode === 'QUARTERLY') return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
  return formatMonth(year, month, locale);
}

/**
 * Top three: #1 is a navy band chip with cream numerals, #2 and #3 neutral chips; all three carry the
 * KTM gold rule underneath. Gold stays a rule/indicator (DESIGN.md §3), never a fill.
 */
const PODIUM = [
  'bg-band text-band-fg shadow-[inset_0_-3px_0_var(--pats-gold)]',
  'bg-surface-muted text-fg shadow-[inset_0_-3px_0_var(--pats-gold)]',
  'bg-surface-muted text-fg shadow-[inset_0_-3px_0_var(--pats-gold)]',
];

export function LeaderboardPage() {
  const t = useT();
  const [city, setCity] = useState('');
  const [month, setMonth] = useState('');
  const [event, setEvent] = useState('');
  const query = new URLSearchParams({ cityId: city, month, eventId: event });
  const state = useLoyalty<LeaderboardDto>(`/api/loyalty/leaderboard?${query}`);
  const mode = state.data?.mode;
  const periods = mode === 'QUARTERLY' ? recentPeriods(mode, 6) : mode === 'MONTHLY' ? recentPeriods(mode, 12) : [];

  // "Q4 2026 · resets 1 Jan 2027" for the period on screen.
  let periodText = '';
  if (state.data) {
    const { periodStart, periodEnd } = state.data;
    if (mode === 'ALL_TIME') periodText = t('settings.periodAllTime');
    else if (mode === 'EVENT') periodText = state.data.events.find((e) => e.id === (event || state.data!.events[0]?.id))?.title ?? '';
    else if (periodStart && periodEnd) {
      const p = zonedParts(new Date(periodStart));
      const label = periodLabel(mode ?? '', p.year, p.month, t.locale);
      const ended = new Date(periodEnd) <= new Date();
      periodText = `${label} · ${t(ended ? 'loyalty.periodClosed' : 'loyalty.periodResets', {
        date: formatDate(new Date(periodEnd), t.locale, { withYear: true }),
      })}`;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('loyalty.leaderboard')} description={t('loyalty.earned')} />
      <LoyaltyTabs active="/leaderboard" hq />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field htmlFor="board-city" label={t('loyalty.city')}>
          <Select id="board-city" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">{t('loyalty.national')}</option>
            {state.data?.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {periods.length > 0 && (
          <Field htmlFor="board-period" label={t('loyalty.period')}>
            <Select id="board-period" value={month || periods[0]!.value} onChange={(e) => setMonth(e.target.value === periods[0]!.value ? '' : e.target.value)}>
              {periods.map((p, i) => (
                <option key={p.value} value={p.value}>
                  {periodLabel(mode!, p.year, p.month, t.locale)}
                  {i === 0 ? ` · ${t('loyalty.periodCurrent')}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {mode === 'EVENT' && state.data && (
          <Field htmlFor="board-event" label={t('loyalty.event')}>
            <Select id="board-event" value={event} onChange={(e) => setEvent(e.target.value)}>
              {state.data.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {!state.data || state.error ? (
        <DataState error={state.error} reload={state.reload} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <h2 className="text-title3 text-fg">{city ? state.data.cities.find((c) => c.id === city)?.name : t('loyalty.national')}</h2>
            {periodText && <Badge tone="accent">{periodText}</Badge>}
          </div>
          {state.data.entries.length ? (
            <Table>
              <thead>
                <tr>
                  <Th className="w-20">{t('loyalty.rank')}</Th>
                  <Th>{t('loyalty.memberColumn')}</Th>
                  <Th>{t('loyalty.city')}</Th>
                  <Th className="text-right">{t('loyalty.xp')}</Th>
                </tr>
              </thead>
              <tbody>
                {state.data.entries.map((r) => {
                  const podium = r.rank <= 3 ? PODIUM[r.rank - 1] : undefined;
                  return (
                    <Tr key={r.memberId}>
                      <Td>
                        <span
                          className={cn(
                            'inline-flex size-8 items-center justify-center rounded-sm text-body-sm font-black tabular-nums',
                            podium ?? 'text-muted',
                          )}
                        >
                          {formatCount(r.rank)}
                        </span>
                      </Td>
                      <Td className={cn('break-words', r.rank <= 3 ? 'font-bold text-fg' : 'text-fg')}>{r.name}</Td>
                      <Td className="text-muted">{r.city}</Td>
                      <Td className="text-right font-bold tabular-nums text-fg">{formatCount(r.xp)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={Trophy} title={t('loyalty.emptyRank')} body={t('loyalty.emptyRankBody')} />
          )}
        </Card>
      )}
    </div>
  );
}
