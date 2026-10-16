import type { MeResponse } from '@pats/shared';
import { formatDate } from '@pats/shared';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { radius, space, useColors } from '@/theme';

/** Digital KTM (member card), CR80 proportions. The rotating QR joins in Phase 1. */
export function KtmCard({ member }: { member: NonNullable<MeResponse['member']> }) {
  const c = useColors();
  const { t, locale } = useI18n();
  return (
    <View
      style={[styles.card, { backgroundColor: c.primary }]}
      accessible
      accessibilityLabel={`${t('app.cardTitle')}: ${member.fullName}, NIM ${member.nim}, ${member.city.name}`}
    >
      <View style={styles.row}>
        <Text variant="label" weight={700} uppercase style={{ color: c.primaryText }}>
          PATS University
        </Text>
        <View style={[styles.chip, { backgroundColor: c.accent }]} />
      </View>
      <View style={styles.middle}>
        <Text variant="title2" style={{ color: c.primaryText }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
          {member.fullName}
        </Text>
        <Text variant="bodyLg" weight={600} style={[styles.nim, { color: c.primaryText }]} selectable>
          {member.nim}
        </Text>
      </View>
      <View style={styles.row}>
        <Text variant="caption" style={{ color: c.primaryText, opacity: 0.72 }} numberOfLines={1}>
          {member.city.name}
        </Text>
        <Text variant="caption" style={{ color: c.primaryText, opacity: 0.72 }} numberOfLines={1}>
          {t('app.memberSince', { date: formatDate(new Date(member.joinedAt), locale) })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 85.6 / 54,
    borderRadius: radius.card,
    padding: space[5],
    justifyContent: 'space-between',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  chip: { width: space[8], height: space[6], borderRadius: radius.sm, opacity: 0.9 },
  middle: { gap: space[1] },
  nim: { letterSpacing: 2, fontVariant: ['tabular-nums'] },
});
