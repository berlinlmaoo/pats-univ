import { can, type Capability, type MessageKey } from '@pats/shared';
import { router, type Href } from 'expo-router';
import { Bell, CalendarDays, CreditCard, Gift, Nfc, PenLine, ScanLine, type LucideIcon } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { useT } from '@/i18n';

interface Tool {
  icon: LucideIcon;
  title: MessageKey;
  body: MessageKey;
  href: Href;
  /** Shown when the account has this capability (PRODUCT.md §3), not by role name. */
  needs: Capability;
}

const DOOR: Tool[] = [
  { icon: ScanLine, title: 'app.adminScan', body: 'app.adminScanBody', href: '/scan', needs: 'checkin.scan' },
  { icon: CalendarDays, title: 'app.adminEvents', body: 'app.adminEventsBody', href: '/city-events', needs: 'checkin.scan' },
];
const CARDS: Tool[] = [
  { icon: Nfc, title: 'app.adminEncode', body: 'app.adminEncodeBody', href: '/encode', needs: 'card.encode' },
  { icon: CreditCard, title: 'app.adminHandover', body: 'app.adminHandoverBody', href: '/handover', needs: 'card.handover' },
  { icon: PenLine, title: 'app.adminCards', body: 'app.adminCardsBody', href: '/member-cards', needs: 'card.reportLost' },
];
const CREW: Tool[] = [
  { icon: Gift, title: 'phase5.claimReview', body: 'phase5.claimAdjustHint', href: '/claims-review', needs: 'promoter.manage' },
  { icon: CalendarDays, title: 'social.operations', body: 'social.operationsBody', href: '/social-operations', needs: 'city.operations' },
  { icon: Gift, title: 'loyalty.validateReward', body: 'app.adminRedeemBody', href: '/reward-validation', needs: 'reward.validate' },
  { icon: CalendarDays, title: 'loyalty.operations', body: 'loyalty.operationsBody', href: '/operations', needs: 'city.operations' },
];

export default function AdminToolsScreen() {
  const t = useT();
  const { me, offline } = useAuth();
  const role = me?.user.role ?? 'MEMBER';
  const hq = role === 'SUPER_ADMIN';
  const city = me?.user.city?.name ?? '';
  const section = (tools: Tool[]) => tools.filter((x) => can(role, x.needs));

  const group = (tools: Tool[]) =>
    tools.length > 0 && (
      <Card style={styles.clip}>
        {tools.map(({ icon, title, body, href }, i) => (
          <ListRow key={title} first={i === 0} icon={icon} title={t(title)} subtitle={t(body)} onPress={() => router.push(href)} />
        ))}
      </Card>
    );

  return (
    <Screen title={t('app.adminTitle')} subtitle={hq ? t('app.adminSubtitleHq') : t('app.adminSubtitle', { city })}>
      {offline && <Notice tone="danger" text={t('app.offlineBody')} />}
      {group(section(DOOR))}
      {group(section(CREW))}
      <SectionLabel>{t('app.adminCardsSection')}</SectionLabel>
      {group(section(CARDS))}
      <Card style={styles.clip}>
        <ListRow first icon={Bell} title={t('app.notificationsTitle')} subtitle={t('app.adminNotificationsBody')} onPress={() => router.push('/notifications')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
