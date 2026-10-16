import { formatCount, formatDate, formatTime, zonedParts, type EventPhase, type EventSummary } from '@pats/shared';
import { StyleSheet, View } from 'react-native';
import { Badge, type BadgeTone } from '@/components/badge';
import { ListRow } from '@/components/list-row';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { radius, size, space, useColors } from '@/theme';

const PHASE_TONE: Record<EventPhase, BadgeTone> = {
  draft: 'neutral',
  upcoming: 'accent',
  open: 'success',
  closed: 'warning',
  ended: 'neutral',
};

export function PhaseBadge({ phase }: { phase: EventPhase }) {
  const { t } = useI18n();
  return <Badge dot tone={PHASE_TONE[phase]} label={t(`eventPhase.${phase}`)} />;
}

/** Day + month leaf, like a tear-off calendar. */
function DateLeaf({ iso, timeZone }: { iso: string; timeZone: string }) {
  const c = useColors();
  const { locale } = useI18n();
  const d = new Date(iso);
  const month = formatDate(d, locale, { timeZone }).split(' ')[1] ?? '';
  return (
    <View style={[styles.leaf, { backgroundColor: c.surfaceMuted }]} accessible={false}>
      <Text variant="caption" weight={600} tone="textMuted" uppercase>
        {month}
      </Text>
      <Text variant="title3" style={styles.tabular}>
        {zonedParts(d, timeZone).day}
      </Text>
    </View>
  );
}

/** "Fri, 18 Oct · 20.00 WIB · PATS Senopati"-style meta line. */
export function eventMeta(e: EventSummary, locale: 'id' | 'en') {
  const tz = e.city.timezone;
  return [formatDate(new Date(e.startsAt), locale, { timeZone: tz }), formatTime(new Date(e.startsAt), { timeZone: tz }), e.venue?.name]
    .filter(Boolean)
    .join(' · ');
}

/** One event in a list. Members see "Attended"; crew see the phase and the head count. */
export function EventRow({ event, first, onPress, crew }: { event: EventSummary; first?: boolean; onPress: () => void; crew?: boolean }) {
  const { t, locale } = useI18n();
  const meta = eventMeta(event, locale);
  const trailing = event.myCheckIn ? (
    <Badge dot tone="success" label={t('app.eventAttended')} />
  ) : crew || event.phase === 'open' ? (
    <PhaseBadge phase={event.phase} />
  ) : null;
  return (
    <ListRow
      first={first}
      leading={<DateLeaf iso={event.startsAt} timeZone={event.city.timezone} />}
      title={event.title}
      subtitle={crew && event.checkInCount ? `${meta} · ${t('app.adminCheckedInCount', { count: formatCount(event.checkInCount) })}` : meta}
      trailing={trailing}
      onPress={onPress}
      accessibilityLabel={`${event.title}, ${meta}`}
    />
  );
}

const styles = StyleSheet.create({
  leaf: { width: size.controlLg, height: size.controlLg + space[2], borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
});
