import { useState } from 'react';
import { Trophy } from 'lucide-react-native';
import { formatCount, formatDate, zonedParts, type LeaderboardDto } from '@pats/shared';
import { Card } from '@/components/card';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field, Input } from '@/components/field';
import { Loading, LoadError } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';
import { space } from '@/theme';
import { Choices } from './ui';
export function LeaderboardScreen() {
  const t = useT();
  const [city, setCity] = useState('');
  const [month, setMonth] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [event, setEvent] = useState('');
  const params = new URLSearchParams({
    cityId: city,
    month: monthFilter,
    eventId: event,
  });
  const state = useApi<LeaderboardDto>(`/api/loyalty/leaderboard?${params}`);
  return (
    <Screen
      title={t('loyalty.leaderboard')}
      subtitle={t('loyalty.earned')}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : (
        state.data && (
          <>
            <Choices
              label={t('loyalty.city')}
              options={[
                { id: '', name: t('loyalty.national') },
                ...state.data.cities.map((c) => ({ id: c.id, name: c.name })),
              ]}
              value={city}
              onChange={setCity}
            />
            {state.data.periodStart && state.data.periodEnd && <Text variant="caption">{formatDate(new Date(state.data.periodStart), t.locale)} — {formatDate(new Date(new Date(state.data.periodEnd).getTime() - 1), t.locale)}</Text>}
            {['MONTHLY', 'QUARTERLY'].includes(state.data.mode) && (
              <>
                <Field label={t('loyalty.month')}>
                  <Input
                    value={month}
                    onChangeText={setMonth}
                    placeholder={`${zonedParts(new Date()).year}-${String(zonedParts(new Date()).month).padStart(2, '0')}`}
                    accessibilityLabel={t('loyalty.month')}
                  />
                </Field>
                <Button
                  variant="secondary"
                  label={t('loyalty.apply')}
                  onPress={() => setMonthFilter(month)}
                  disabled={!!month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)}
                />
              </>
            )}
            {state.data.mode === 'EVENT' && (
              <Choices
                label={t('loyalty.event')}
                options={state.data.events.map((e) => ({
                  id: e.id,
                  name: e.title,
                }))}
                value={event}
                onChange={setEvent}
              />
            )}
            {state.data.self && (
              <Card style={{ padding: space[4], gap: space[2] }}>
                <Text variant="title3">
                  {t('loyalty.self')}: {formatCount(state.data.self.rank)}
                </Text>
                <Text>{formatCount(state.data.self.xp)} XP</Text>
              </Card>
            )}
            {!state.data.entries.length ? (
              <EmptyState
                icon={Trophy}
                title={t('loyalty.emptyRank')}
                body={t('loyalty.emptyRankBody')}
                action={
                  <Button label={t('common.retry')} onPress={state.reload} />
                }
              />
            ) : (
              state.data.entries.map((r) => (
                <Card
                  key={r.memberId}
                  style={{ padding: space[4], gap: space[2] }}
                >
                  <Text weight={600}>
                    {formatCount(r.rank)} · {r.name}
                  </Text>
                  <Text variant="caption" tone="textMuted">
                    {r.city} · {formatCount(r.xp)} XP
                  </Text>
                </Card>
              ))
            )}
          </>
        )
      )}
    </Screen>
  );
}
