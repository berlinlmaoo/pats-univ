import { formatCount, formatPhone, type WalletDto } from '@pats/shared';
import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { useApi } from '@/lib/use-api';
import { useSocialRoom } from '@/features/social/realtime';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DetailList } from '@/components/detail-list';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { LanguageToggle } from '@/components/language-toggle';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { APP_VERSION } from '@/lib/config';
import { radius, size, space, useColors } from '@/theme';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Shared by members and city admins. */
export function ProfileScreen() {
  const { me, signOut, reload, call } = useAuth();
  const { t } = useI18n();
  const c = useColors();
  const [refreshing, setRefreshing] = useState(false);
  if (!me) return null;
  const { user, member } = me;
  const dash = t('common.notSet');

  const details = member
    ? [
        { label: t('app.nim'), value: member.nim },
        { label: t('app.email'), value: user.email },
        { label: t('app.phone'), value: formatPhone(user.phone) },
        { label: t('app.city'), value: member.city.name },
        { label: t('app.song'), value: member.favoriteSong || dash },
        { label: t('app.genre'), value: member.favoriteGenre || dash },
        { label: t('app.quotes'), value: member.quotes ? `“${member.quotes}”` : dash },
      ]
    : [
        { label: t('app.role'), value: t(`role.${user.role}`) },
        { label: t('app.email'), value: user.email },
        { label: t('app.phone'), value: formatPhone(user.phone) },
        { label: t('app.city'), value: user.city?.name ?? dash },
      ];

  const confirmSignOut = () =>
    Alert.alert(t('app.signOutTitle'), t('app.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await reload();
        setRefreshing(false);
      }}
    >
      <View style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: c.accentSubtle }]}>
          <Text variant="title3" style={{ color: c.accentSubtleText }}>
            {initials(member?.fullName ?? user.name)}
          </Text>
        </View>
        <View style={styles.heroText}>
          <Text variant="title2" numberOfLines={2}>
            {member?.fullName ?? user.name}
          </Text>
          <Text variant="bodySm" tone="textMuted" numberOfLines={1}>
            {member ? `${member.nim} · ${member.city.name}` : t(`role.${user.role}`)}
          </Text>
        </View>
      </View>

      {member && <ProfileXp memberId={member.id} />}
      {member?.isPromoter && <Badge label={t('phase5.prBadge')} tone="accent" />}
      {member && <Button variant="secondary" label={t('phase5.claimTitle')} onPress={() => router.push('/claims')} />}
      {member && <Button variant="secondary" label={t('phase5.regionChange')} onPress={() => router.push('/region-change')} />}
      <SectionLabel>{t('app.details')}</SectionLabel>
      <DetailList items={details} />

      <SectionLabel>{t('app.preferences')}</SectionLabel>
      <Card style={styles.prefRow}>
        <Text variant="body">{t('common.language')}</Text>
        <LanguageToggle />
      </Card>
      <Card style={styles.clip}>
        <ListRow first icon={Bell} title={t('app.notificationSettingsTitle')} subtitle={t('app.notificationSettingsBody')} onPress={() => router.push('/notification-settings')} />
      </Card>

      {member && <Button variant="danger" label={t('phase5.leave')} onPress={() => Alert.alert(t('phase5.leave'), t('phase5.leaveConfirm'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('phase5.leave'), style: 'destructive', onPress: () => { void call('POST', '/api/me/leave').then(signOut).catch(() => Alert.alert(t('errors.generic'))); } }])} />}
      <Button variant="secondary" label={t('common.signOut')} onPress={confirmSignOut} style={styles.signOut} />
      <Text variant="caption" tone="textMuted" style={styles.version}>
        {t('app.version', { version: APP_VERSION })}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space[4], marginTop: space[4], marginBottom: space[2] },
  avatar: { width: size.controlLg + space[4], height: size.controlLg + space[4], borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: space[0.5] },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], paddingVertical: space[3] },
  signOut: { marginTop: space[4] },
  clip: { overflow: 'hidden' },
  version: { textAlign: 'center' },
});

function ProfileXp({ memberId }: { memberId: string }) {
  const { t } = useI18n();
  const state = useApi<WalletDto>('/api/loyalty/wallet');
  useSocialRoom({ kind: 'wallet', id: memberId }, state.reload);
  return state.data ? <Text variant="title2">{formatCount(state.data.balance)} XP</Text> : <Text tone="textMuted">{t('loyalty.balance')}</Text>;
}
