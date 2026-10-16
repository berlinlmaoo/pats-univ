import type { MessageKey } from '@pats/shared';
import { router, type Href } from 'expo-router';
import { CalendarDays, CreditCard, Gift, ScanLine, type LucideIcon } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { useT } from '@/i18n';

/** Crew tools. Scan and events are live; card handover (Phase 2) and redeem (Phase 3) follow. */
const LIVE: { icon: LucideIcon; title: MessageKey; body: MessageKey; href: Href }[] = [
  { icon: ScanLine, title: 'app.adminScan', body: 'app.adminScanBody', href: '/scan' },
  { icon: CalendarDays, title: 'app.adminEvents', body: 'app.adminEventsBody', href: '/city-events' },
];
const SOON: { icon: LucideIcon; title: MessageKey; body: MessageKey }[] = [
  { icon: CreditCard, title: 'app.adminHandover', body: 'app.adminHandoverBody' },
  { icon: Gift, title: 'app.adminRedeem', body: 'app.adminRedeemBody' },
];

export default function AdminToolsScreen() {
  const t = useT();
  const { me, offline } = useAuth();
  const city = me?.user.city?.name ?? '';

  return (
    <Screen title={t('app.adminTitle')} subtitle={t('app.adminSubtitle', { city })}>
      {offline && <Notice tone="danger" text={t('app.offlineBody')} />}
      <Card style={styles.clip}>
        {LIVE.map(({ icon, title, body, href }, i) => (
          <ListRow key={title} first={i === 0} icon={icon} title={t(title)} subtitle={t(body)} onPress={() => router.push(href)} />
        ))}
      </Card>
      <SectionLabel>{t('common.soon')}</SectionLabel>
      <Card style={styles.clip}>
        {SOON.map(({ icon, title, body }, i) => (
          <ListRow
            key={title}
            first={i === 0}
            icon={icon}
            title={t(title)}
            subtitle={t(body)}
            accessibilityLabel={`${t(title)}. ${t(body)}. ${t('common.soon')}`}
          />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
