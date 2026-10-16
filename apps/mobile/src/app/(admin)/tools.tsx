import { CalendarDays, CreditCard, Gift, ScanLine, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { size, space, useColors } from '@/theme';
import type { MessageKey } from '@pats/shared';

/** Crew tools, listed now and switched on as each phase ships (scan in Phase 1, handover in Phase 2). */
const TOOLS: { icon: LucideIcon; title: MessageKey; body: MessageKey }[] = [
  { icon: ScanLine, title: 'app.adminScan', body: 'app.adminScanBody' },
  { icon: CreditCard, title: 'app.adminHandover', body: 'app.adminHandoverBody' },
  { icon: CalendarDays, title: 'app.adminEvents', body: 'app.adminEventsBody' },
  { icon: Gift, title: 'app.adminRedeem', body: 'app.adminRedeemBody' },
];

export default function AdminToolsScreen() {
  const t = useT();
  const c = useColors();
  const { me, offline } = useAuth();
  const city = me?.user.city?.name ?? '';

  return (
    <Screen title={t('app.adminTitle')} subtitle={t('app.adminSubtitle', { city })}>
      {offline && <Notice tone="danger" text={t('app.offlineBody')} />}
      <Notice text={t('app.adminToolsBody')} />
      <Card>
        {TOOLS.map(({ icon: Icon, title, body }, i) => (
          <View
            key={title}
            style={[styles.row, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth * 2 }]}
            accessible
            accessibilityState={{ disabled: true }}
            accessibilityLabel={`${t(title)}. ${t(body)}. ${t('common.soon')}`}
          >
            <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
              <Icon size={size.icon} color={c.textMuted} strokeWidth={1.75} />
            </View>
            <View style={styles.text}>
              <Text variant="body" weight={600} numberOfLines={1}>
                {t(title)}
              </Text>
              <Text variant="bodySm" tone="textMuted">
                {t(body)}
              </Text>
            </View>
            <Badge label={t('common.soon')} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] },
  icon: { width: size.avatar, height: size.avatar, borderRadius: size.avatar / 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: space[0.5] },
});
