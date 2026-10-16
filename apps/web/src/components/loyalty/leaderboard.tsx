'use client';
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { formatCount, type LeaderboardDto } from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { DataState, useLoyalty } from './state';
export function LeaderboardPage() {
  const t = useT();
  const [city, setCity] = useState('');
  const [month, setMonth] = useState('');
  const [event, setEvent] = useState('');
  const query = new URLSearchParams({ cityId: city, month, eventId: event });
  const state = useLoyalty<LeaderboardDto>(`/api/loyalty/leaderboard?${query}`);
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('loyalty.leaderboard')}
        description={t('loyalty.earned')}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field htmlFor="board-city" label={t('loyalty.city')}>
          <Select
            id="board-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="">{t('loyalty.national')}</option>
            {state.data?.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {state.data?.mode === 'MONTHLY' && (
          <Field htmlFor="board-month" label={t('loyalty.month')}>
            <Input
              id="board-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>
        )}
        {state.data?.mode === 'EVENT' && (
          <Field htmlFor="board-event" label={t('loyalty.event')}>
            <Select
              id="board-event"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
            >
              <option value="">{t('loyalty.event')}</option>
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
        <Card>
          {state.data.entries.length ? (
            <Table>
              <thead>
                <tr>
                  {['rank', 'member', 'city', 'xp'].map((h) => (
                    <Th key={h}>{t.loose(`loyalty.${h}`)}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.entries.map((r) => (
                  <Tr key={r.memberId}>
                    <Td className="tabular-nums">{formatCount(r.rank)}</Td>
                    <Td>{r.name}</Td>
                    <Td>{r.city}</Td>
                    <Td className="tabular-nums font-semibold">
                      {formatCount(r.xp)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              icon={Trophy}
              title={t('loyalty.emptyRank')}
              body={t('loyalty.emptyRankBody')}
            />
          )}
        </Card>
      )}
    </div>
  );
}
