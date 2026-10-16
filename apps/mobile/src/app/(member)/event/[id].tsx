import { formatDate, formatTime, type EventDetailResponse } from '@pats/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CalendarX2, CircleCheck, QrCode } from 'lucide-react-native';
import { Image, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DetailList } from '@/components/detail-list';
import { EmptyState } from '@/components/empty-state';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { Text } from '@/components/text';
import { PhaseBadge } from '@/features/event-ui';
import { useI18n } from '@/i18n';
import { API_URL } from '@/lib/config';
import { useApi } from '@/lib/use-api';
import { radius, size, space, useColors } from '@/theme';

export default function MemberEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const c = useColors();
  const { me } = useAuth();
  const { data, error, loading, refreshing, reload } = useApi<EventDetailResponse>(`/api/events/${id}`);
  const e = data?.event;

  if (loading) return <Screen edges={[]}><Loading /></Screen>;
  if (!e) {
    return (
      <Screen edges={[]}>
        {error && error.code !== 'NOT_FOUND' ? (
          <LoadError error={error} onRetry={reload} />
        ) : (
          <EmptyState icon={CalendarX2} title={t('app.eventNotFoundTitle')} body={t('app.eventNotFoundBody')} />
        )}
      </Screen>
    );
  }

  const tz = e.city.timezone;
  const start = new Date(e.startsAt);
  const end = new Date(e.endsAt);
  const day = (d: Date) => formatDate(d, locale, { timeZone: tz });
  const when = `${day(start)}, ${formatTime(start, { timeZone: tz, withZone: false })} – ${
    day(end) === day(start) ? '' : `${day(end)}, `
  }${formatTime(end, { timeZone: tz })}`;
  const window = t('app.eventCheckInWindow', {
    from: formatTime(new Date(e.checkInOpensAt), { timeZone: tz, withZone: false }),
    to: formatTime(new Date(e.checkInClosesAt), { timeZone: tz }),
  });

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={reload}>
      <Stack.Screen options={{ title: '' }} />
      {e.flyerUrl && (
        <Image
          source={{ uri: `${API_URL}${e.flyerUrl}` }}
          style={[styles.flyer, { backgroundColor: c.surfaceMuted }]}
          resizeMode="cover"
          accessibilityLabel={t('events.flyerAlt', { title: e.title })}
        />
      )}
      <View style={styles.head}>
        <PhaseBadge phase={e.phase} />
        <Text variant="title1" accessibilityRole="header">
          {e.title}
        </Text>
      </View>

      {e.myCheckIn ? (
        <Card style={styles.attended}>
          <CircleCheck size={size.icon} color={c.success} strokeWidth={2} />
          <Text variant="body" weight={500} style={styles.flex}>
            {t('app.eventCheckedInAt', { time: formatTime(new Date(e.myCheckIn.checkedInAt), { timeZone: tz }) })}
          </Text>
        </Card>
      ) : e.phase === 'open' ? (
        <Button
          label={t('app.eventShowQr')}
          icon={<QrCode size={size.iconSm} color={c.primaryText} strokeWidth={2} />}
          onPress={() => router.navigate('/card')}
        />
      ) : null}

      <Button variant="secondary" label={t('social.reserve')} onPress={() => router.push({ pathname: '/reservation', params: { eventId: id } })} />
      {e.city.id !== me?.member?.city.id && <Button variant="secondary" label={t('social.requestRoaming')} onPress={() => router.push({ pathname: '/roaming', params: { eventId: id } })} />}
      <DetailList
        items={[
          { label: t('app.eventWhen'), value: when },
          ...(e.venue ? [{ label: t('app.eventVenue'), value: [e.venue.name, e.venue.address].filter(Boolean).join('\n') }] : []),
          { label: t('app.eventCheckIn'), value: window },
        ]}
      />

      {e.description ? (
        <>
          <SectionLabel>{t('app.eventAbout')}</SectionLabel>
          <Card style={styles.about}>
            <Text variant="body">{e.description}</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space[2], marginBottom: space[1] },
  attended: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] },
  flex: { flex: 1 },
  about: { padding: space[4] },
  flyer: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.card },
});
