import {
  formatCount,
  formatDate,
  formatTime,
  type AttendanceResponse,
  type EventAction,
  type EventDetailResponse,
  type EventSummary,
} from '@pats/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CalendarX2, Pencil, ScanLine, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DetailList } from '@/components/detail-list';
import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { ListRow } from '@/components/list-row';
import { LoadError, Loading } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { Text } from '@/components/text';
import { PhaseBadge } from '@/features/event-ui';
import { useI18n } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { size, space, useColors } from '@/theme';

/** Live feed cadence while check-in is open (REST polling until realtime lands in Phase 4). */
const LIVE_POLL_MS = 5000;

export default function AdminEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { call } = useAuth();
  const detail = useApi<EventDetailResponse>(`/api/admin/events/${id}`);
  const e = detail.data?.event;
  const live = e?.phase === 'open';
  const attendance = useApi<AttendanceResponse>(e ? `/api/admin/events/${id}/attendance` : null, { pollMs: live ? LIVE_POLL_MS : undefined });
  const [busy, setBusy] = useState(false);

  if (detail.loading) return <Screen edges={[]}><Loading /></Screen>;
  if (!e) {
    return (
      <Screen edges={[]}>
        {detail.error && detail.error.code !== 'NOT_FOUND' ? (
          <LoadError error={detail.error} onRetry={detail.reload} />
        ) : (
          <EmptyState icon={CalendarX2} title={t('app.eventNotFoundTitle')} body={t('app.eventNotFoundBody')} />
        )}
      </Screen>
    );
  }

  const tz = e.city.timezone;
  const day = (iso: string) => formatDate(new Date(iso), locale, { timeZone: tz });
  const time = (iso: string, withZone = true) => formatTime(new Date(iso), { timeZone: tz, withZone });
  const when = `${day(e.startsAt)}, ${time(e.startsAt, false)} – ${day(e.endsAt) === day(e.startsAt) ? '' : `${day(e.endsAt)}, `}${time(e.endsAt)}`;
  const count = attendance.data?.count ?? e.checkInCount ?? 0;

  const run = async (action: EventAction) => {
    setBusy(true);
    try {
      const res = await call<EventDetailResponse>('POST', `/api/admin/events/${id}/actions`, { action });
      detail.setData(res);
      void attendance.reload();
    } catch (err) {
      Alert.alert(t('errors.generic'), t.loose(errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL')));
    } finally {
      setBusy(false);
    }
  };

  const confirm = (action: EventAction) => {
    const early = Date.now() < new Date(e.checkInOpensAt).getTime();
    const copy = {
      publish: { title: t('events.publishTitle'), body: t('events.publishBody', { city: e.city.name }), ok: t('app.eventPublishConfirm') },
      open: {
        title: t('events.openTitle'),
        body: early ? t('events.openEarlyBody', { time: time(e.checkInOpensAt) }) : t('events.openBody', { time: time(e.checkInClosesAt) }),
        ok: t('app.eventOpenConfirm'),
      },
      close: { title: t('events.closeTitle'), body: t('events.closeBody'), ok: t('app.eventCloseConfirm') },
    }[action];
    Alert.alert(copy.title, copy.body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: copy.ok, style: action === 'close' ? 'destructive' : 'default', onPress: () => void run(action) },
    ]);
  };

  return (
    <Screen
      edges={[]}
      refreshing={detail.refreshing}
      onRefresh={async () => {
        await Promise.all([detail.reload(), attendance.reload()]);
      }}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderButton icon={Pencil} label={t('common.edit')} onPress={() => router.push({ pathname: '/city-events/[id]/edit', params: { id } })} />
          ),
        }}
      />
      <View style={styles.head}>
        <PhaseBadge phase={e.phase} />
        <Text variant="title1" accessibilityRole="header">
          {e.title}
        </Text>
      </View>

      <Actions event={e} busy={busy} onAction={confirm} />

      <DetailList
        items={[
          { label: t('events.when'), value: when },
          { label: t('events.window'), value: `${day(e.checkInOpensAt)}, ${time(e.checkInOpensAt, false)} – ${time(e.checkInClosesAt)}` },
          { label: t('events.venue'), value: e.venue?.name ?? t('events.venueNone') },
        ]}
      />

      <View style={styles.liveHead}>
        <SectionLabel>{t('app.adminLive')}</SectionLabel>
        <Text variant="bodySm" tone="textMuted" style={styles.tabular}>
          {e.capacity
            ? t('app.adminCheckedInOf', { count: formatCount(count), capacity: formatCount(e.capacity) })
            : t('app.adminCheckedInCount', { count: formatCount(count) })}
        </Text>
      </View>
      {attendance.data && attendance.error?.code === 'NETWORK' && <Notice tone="danger" text={t('errors.network')} />}
      {attendance.loading ? (
        <Loading />
      ) : !attendance.data && attendance.error ? (
        <LoadError error={attendance.error} onRetry={attendance.reload} />
      ) : !attendance.data?.entries.length ? (
        <EmptyState icon={Users} title={t('events.attendanceEmptyTitle')} body={t('events.attendanceEmptyBody')} />
      ) : (
        <Card style={styles.clip}>
          {attendance.data.entries.map((a, i) => (
            <ListRow
              key={a.id}
              first={i === 0}
              leading={<Avatar name={a.member.fullName} photoUrl={a.member.photoUrl} />}
              title={a.member.fullName}
              subtitle={[a.member.nim, a.manualReason ? t('events.reason', { reason: a.manualReason }) : null].filter(Boolean).join(' · ')}
              trailing={
                <View style={styles.trailing}>
                  <Text variant="bodySm" style={styles.tabular}>
                    {time(a.checkedInAt, false)}
                  </Text>
                  <Badge tone={a.method === 'MANUAL' ? 'warning' : 'neutral'} label={t(`checkInMethod.${a.method}`)} />
                </View>
              }
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

/** The next step for this event, plus Scan while check-in is open. */
function Actions({ event: e, busy, onAction }: { event: EventSummary; busy: boolean; onAction: (a: EventAction) => void }) {
  const { t } = useI18n();
  const c = useColors();
  if (e.phase === 'open') {
    return (
      <View style={styles.actions}>
        <Button
          label={t('app.adminScanEvent')}
          icon={<ScanLine size={size.iconSm} color={c.primaryText} strokeWidth={2} />}
          onPress={() => router.push({ pathname: '/scan/[eventId]', params: { eventId: e.id } })}
        />
        <Button variant="secondary" label={t('events.actionClose')} loading={busy} onPress={() => onAction('close')} />
      </View>
    );
  }
  if (e.phase === 'draft') return <Button label={t('events.actionPublish')} loading={busy} onPress={() => onAction('publish')} />;
  if (e.phase === 'upcoming' || e.phase === 'closed') return <Button label={t('events.actionOpen')} loading={busy} onPress={() => onAction('open')} />;
  return null;
}

const styles = StyleSheet.create({
  head: { gap: space[2], marginBottom: space[1] },
  actions: { gap: space[2] },
  liveHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3], marginTop: space[2] },
  clip: { overflow: 'hidden' },
  trailing: { alignItems: 'flex-end', gap: space[1] },
  tabular: { fontVariant: ['tabular-nums'] },
});
