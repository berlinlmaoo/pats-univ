import { useMemo, useState, useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Gift, Trophy, FileText } from 'lucide-react-native';
import {
  formatCount,
  formatDateTime,
  type WalletDto,
  type RewardDto,
  type RedemptionDto,
} from '@pats/shared';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { Loading, LoadError } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { QrCode } from '@/components/qr-code';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { colors, radius, size, space, useColors } from '@/theme';
import { Choices, Group } from './ui';
import { PrizeWheel } from './wheel';

export function WalletScreen() {
  const t = useT();
  const c = useColors();
  const { call } = useAuth();
  const state = useApi<WalletDto>('/api/loyalty/wallet', { pollMs: 15_000 });
  const [eventId, setEventId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [winner, setWinner] = useState<RewardDto | null>(null);
  const [wheelPrizes, setWheelPrizes] = useState<RewardDto[] | null>(null);
  const event =
    state.data?.events.find((e) => e.id === eventId) ?? state.data?.events[0];
  const prizes = useMemo(
    () =>
      state.data?.rewards.filter(
        (r) =>
          r.type === 'SPIN_PRIZE' &&
          r.spinWeight > 0 &&
          (r.stock === null || r.stock > 0),
      ) ?? [],
    [state.data?.rewards],
  );
  async function issue(reward?: RewardDto) {
    if (!event || busy) return;
    setBusy(true);
    setError('');
    setWinner(null);
    if (!reward) setWheelPrizes(prizes);
    try {
      const result = await call<{ redemption: RedemptionDto }>(
        'POST',
        reward ? '/api/loyalty/redeem' : '/api/loyalty/spin',
        { eventId: event.id, ...(reward ? { rewardId: reward.id } : {}) },
      );
      if (!reward) setWinner(result.redemption.reward);
      await state.reload();
    } catch (err) {
      setError(errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL'));
    } finally {
      setBusy(false);
    }
  }
  const confirm = (reward?: RewardDto) =>
    Alert.alert(
      t(reward ? 'loyalty.redeem' : 'loyalty.spin'),
      t('loyalty.confirmRedeem'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.continue'), onPress: () => void issue(reward) },
      ],
    );
  return (
    <Screen
      title={t('loyalty.title')}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      {state.loading ? (
        <Loading />
      ) : state.error && !state.data ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : (
        state.data && (
          <>
            {state.error && (
              <Notice
                tone="danger"
                text={t.loose(errorKey(state.error.code))}
              />
            )}
            {error && <Notice tone="danger" text={t.loose(error)} />}
            <Card style={styles.card}>
              <Text tone="textMuted">{t('loyalty.balance')}</Text>
              <Text variant="display">
                {formatCount(state.data.balance)} XP
              </Text>
              {state.data.milestone && (
                <>
                  <Text variant="bodySm">
                    {state.data.milestone.remaining
                      ? t('loyalty.milestone', {
                          remaining: formatCount(
                            state.data.milestone.remaining,
                          ),
                          reward: state.data.milestone.reward.name,
                        })
                      : t('loyalty.ready')}
                  </Text>
                  <View
                    style={[styles.track, { backgroundColor: c.surfaceMuted }]}
                    accessibilityRole="progressbar"
                    accessibilityValue={{
                      min: 0,
                      max: 100,
                      now: Math.round(state.data.milestone.progress * 100),
                    }}
                  >
                    <View
                      style={[
                        styles.bar,
                        {
                          backgroundColor: c.accent,
                          width: `${state.data.milestone.progress * 100}%`,
                        },
                      ]}
                    />
                  </View>
                </>
              )}
            </Card>
            <Card>
              <ListRow
                first
                icon={Trophy}
                title={t('loyalty.leaderboard')}
                onPress={() => router.push('/leaderboard')}
              />
              {state.data.isPromoter && (
                <ListRow
                  icon={FileText}
                  title={t('loyalty.promoter')}
                  onPress={() => router.push('/promoter')}
                />
              )}
            </Card>
            {state.data.events.length ? (
              <Choices
                label={t('loyalty.selectEvent')}
                options={state.data.events.map((e) => ({
                  id: e.id,
                  name: e.title,
                }))}
                value={event?.id ?? ''}
                onChange={setEventId}
              />
            ) : (
              <EmptyState
                icon={Gift}
                title={t('loyalty.noEvents')}
                body={t('loyalty.noEventsBody')}
                action={
                  <Button
                    label={t('app.tabEvents')}
                    onPress={() => router.push('/events')}
                    variant="secondary"
                  />
                }
              />
            )}
            <SectionLabel>{t('loyalty.catalogue')}</SectionLabel>
            {!state.data.rewards.filter((r) => r.type === 'DIRECT').length ? (
              <EmptyState
                icon={Gift}
                title={t('loyalty.emptyRewards')}
                body={t('loyalty.emptyRewardsBody')}
                action={
                  <Button
                    label={t('common.retry')}
                    variant="secondary"
                    onPress={state.reload}
                  />
                }
              />
            ) : (
              state.data.rewards
                .filter((r) => r.type === 'DIRECT')
                .map((r) => (
                  <Card key={r.id} style={styles.card}>
                    <Text variant="title3">{r.name}</Text>
                    <Text tone="textMuted">{r.description}</Text>
                    <Text weight={600}>{formatCount(r.xpCost)} XP</Text>
                    <Text variant="caption" tone="textMuted">
                      {r.stock === null
                        ? t('loyalty.unlimited')
                        : t('loyalty.stockLeft', {
                            count: formatCount(r.stock),
                          })}
                    </Text>
                    <Button
                      label={t('loyalty.redeem')}
                      disabled={
                        !event ||
                        busy ||
                        r.stock === 0 ||
                        state.data!.balance < r.xpCost
                      }
                      onPress={() => confirm(r)}
                    />
                  </Card>
                ))
            )}
            {(!!prizes.length || !!winner) && (
              <Card style={styles.card}>
                <Text variant="title3">{t('loyalty.spin')}</Text>
                <Text variant="bodySm" tone="textMuted">
                  {t('loyalty.spinPrice', {
                    cost: formatCount(state.data.spinCostXp),
                    limit: formatCount(
                      event?.spinLimit ?? state.data.maxSpinsPerEvent,
                    ),
                  })}
                </Text>
                <PrizeWheel
                  rewards={wheelPrizes ?? prizes}
                  winner={winner}
                  running={busy}
                />
                {winner && (
                  <Text weight={600} accessibilityLiveRegion="polite">
                    {t('loyalty.spinResult', { reward: winner.name })}
                  </Text>
                )}
                {prizes.map((r) => (
                  <Text variant="caption" key={r.id}>
                    {r.name} · {t('loyalty.weight')}:{' '}
                    {formatCount(r.spinWeight)}
                  </Text>
                ))}
                <Text variant="caption" tone="textMuted">
                  {t('loyalty.spinHint')}
                </Text>
                {event && (
                  <Text variant="bodySm">
                    {t('loyalty.spinsUsed', {
                      used: formatCount(event.spinsUsed),
                      limit: formatCount(event.spinLimit),
                    })}
                  </Text>
                )}
                <Button
                  label={t('loyalty.spin')}
                  loading={busy}
                  disabled={
                    !event ||
                    event.spinsUsed >= event.spinLimit ||
                    state.data.balance < state.data.spinCostXp
                  }
                  onPress={() => confirm()}
                />
              </Card>
            )}
            <SectionLabel>{t('loyalty.codes')}</SectionLabel>
            {!state.data.redemptions.length ? (
              <EmptyState
                icon={Gift}
                title={t('loyalty.emptyCodes')}
                body={t('loyalty.emptyCodesBody')}
              />
            ) : (
              state.data.redemptions.map((r) => (
                <RedemptionCard
                  key={r.id}
                  redemption={r}
                  reload={state.reload}
                />
              ))
            )}
            <SectionLabel>{t('loyalty.ledger')}</SectionLabel>
            {!state.data.ledger.length ? (
              <EmptyState
                icon={Gift}
                title={t('loyalty.emptyLedger')}
                body={t('loyalty.emptyLedgerBody')}
              />
            ) : (
              <Card style={styles.card}>
                {state.data.ledger.map((row) => (
                  <Group key={row.id}>
                    <Text weight={600}>
                      {row.delta > 0 ? '+' : ''}
                      {formatCount(row.delta)} XP ·{' '}
                      {t.loose(`loyalty.${row.reason}`)}
                    </Text>
                    <Text variant="caption" tone="textMuted">
                      {formatDateTime(new Date(row.createdAt), t.locale)}
                    </Text>
                  </Group>
                ))}
              </Card>
            )}
          </>
        )
      )}
    </Screen>
  );
}
function RedemptionCard({
  redemption: r,
  reload,
}: {
  redemption: RedemptionDto;
  reload: () => void;
}) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(
    0,
    Math.ceil((new Date(r.expiresAt).getTime() - now) / 1000),
  );
  useEffect(() => {
    if (r.status !== 'ISSUED') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [r.status]);
  useEffect(() => {
    if (r.status === 'ISSUED' && !remaining) reload();
  }, [remaining, r.status, reload]);
  return (
    <Card style={styles.card}>
      <Text variant="title3">{r.reward.name}</Text>
      <Text tone="textMuted">{t.loose(`loyalty.${r.status}`)}</Text>
      {r.status === 'ISSUED' && remaining > 0 && (
        <>
          <View style={styles.qr}>
            <QrCode
              value={r.code}
              size={size.qr}
              color={colors.light.primary}
              background={colors.light.surface}
            />
          </View>
          <Text variant="display" style={styles.code}>
            {r.code}
          </Text>
          <Text>
            {t('loyalty.countdown', { seconds: formatCount(remaining) })}
          </Text>
          <Text variant="caption" tone="textMuted">
            {t('loyalty.codeHint')}
          </Text>
        </>
      )}
      <Text variant="caption" tone="textMuted">
        {t('loyalty.expires', {
          time: formatDateTime(new Date(r.expiresAt), t.locale),
        })}
      </Text>
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { padding: space[4], gap: space[3] },
  track: { height: space[2], borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: '100%' },
  qr: { alignItems: 'center' },
  code: { textAlign: 'center' },
});
