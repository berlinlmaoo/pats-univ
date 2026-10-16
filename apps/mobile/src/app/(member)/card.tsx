import type { CardStatus } from '@pats/shared';
import { QrCode, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Badge, type BadgeTone } from '@/components/badge';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { KtmCard } from '@/features/ktm-card';
import { useT } from '@/i18n';
import { size, space, useColors } from '@/theme';

const CARD_TONE: Record<CardStatus, BadgeTone> = {
  NOT_PRINTED: 'neutral',
  IN_BATCH: 'accent',
  SENT_TO_VENDOR: 'accent',
  RECEIVED_HQ: 'accent',
  ENCODED: 'warning',
  DELIVERED: 'success',
  REVOKED: 'danger',
};

export default function CardScreen() {
  const { me, offline, reload } = useAuth();
  const t = useT();
  const c = useColors();
  const [refreshing, setRefreshing] = useState(false);
  const member = me?.member;
  const firstName = (member?.fullName ?? me?.user.name ?? '').split(' ')[0] ?? '';

  return (
    <Screen
      title={t('app.greeting', { name: firstName })}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await reload();
        setRefreshing(false);
      }}
    >
      {offline && <Notice tone="danger" text={t('app.offlineBody')} />}
      {!member ? (
        <EmptyState icon={UserRound} title={t('app.cardTitle')} body={t('app.noMemberProfile')} />
      ) : (
        <>
          <KtmCard member={member} />
          <Card style={styles.qr}>
            <View style={[styles.qrIcon, { backgroundColor: c.surfaceMuted }]}>
              <QrCode size={size.icon} color={c.textMuted} strokeWidth={1.75} />
            </View>
            <Text variant="bodySm" tone="textMuted" style={styles.flex}>
              {t('app.cardQrSoon')}
            </Text>
          </Card>
          <Card style={styles.status}>
            <Text variant="body" weight={500}>
              {t('app.physicalCard')}
            </Text>
            <Badge dot tone={CARD_TONE[member.cardStatus]} label={t(`cardStatusMember.${member.cardStatus}`)} />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] },
  qrIcon: { width: size.avatar, height: size.avatar, borderRadius: size.avatar / 2, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  status: { padding: space[4], gap: space[2] },
});
