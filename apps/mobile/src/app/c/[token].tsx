import { formatDate, type CardProfileResponse } from '@pats/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { SearchX, ShieldOff, UserX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DetailList } from '@/components/detail-list';
import { EmptyState } from '@/components/empty-state';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { api, ApiFailure } from '@/lib/api';
import { space } from '@/theme';

/**
 * A tapped card URL (universal link / app link, https://patsuniv.znetworks.id/c/<token>): the
 * member's own card opens their card, anyone else's shows the short public profile.
 */
export default function CardLinkScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useI18n();
  const { status, call, me } = useAuth();
  const [data, setData] = useState<CardProfileResponse | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    const path = `/api/c/${encodeURIComponent(token)}`;
    (status === 'signedIn' ? call<CardProfileResponse>('GET', path) : api.get<CardProfileResponse>(path))
      .then((res) => alive && (setData(res), setError(null)))
      .catch((err) => alive && setError(err instanceof ApiFailure ? err : new ApiFailure('INTERNAL')));
    return () => {
      alive = false;
    };
  }, [call, status, token, nonce]);

  if (error?.code === 'CARD_NOT_FOUND') {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon={SearchX} title={t('cardPage.notFoundTitle')} body={t('cardPage.notFoundBody')} />
      </Screen>
    );
  }
  if (error) return <LoadError error={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (!data) return <Loading />;
  if (data.state === 'revoked') {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon={ShieldOff} title={t('cardPage.revokedTitle')} body={t('cardPage.revokedBody')} />
      </Screen>
    );
  }
  if (data.state === 'inactive' || !data.member) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon={UserX} title={t('cardPage.inactiveTitle')} body={t('cardPage.inactiveBody')} />
      </Screen>
    );
  }
  const m = data.member;
  return (
    <Screen edges={['bottom']}>
      <View style={styles.head}>
        <Text variant="label" uppercase tone="textMuted">
          {data.isMine ? t('app.cardLinkMine') : t('cardPage.eyebrow')}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {m.fullName}
        </Text>
        <View style={styles.meta}>
          <Text variant="body" tone="textMuted" style={styles.tabular}>
            {`${m.nim} · ${m.city}`}
          </Text>
          <Badge dot tone={data.state === 'active' ? 'success' : 'accent'} label={data.state === 'active' ? t('cardPage.active') : t('cardPage.pending')} />
        </View>
      </View>
      <Card style={styles.clip}>
        <DetailList
          items={[
            { label: t('app.song'), value: m.favoriteSong },
            { label: t('app.genre'), value: m.favoriteGenre },
            ...(m.quotes ? [{ label: t('app.quotes'), value: `“${m.quotes}”` }] : []),
            { label: t('members.joined'), value: formatDate(new Date(m.joinedAt), t.locale) },
          ]}
        />
      </Card>
      {data.isMine && me?.user.role === 'MEMBER' && <Button label={t('app.cardLinkOpen')} onPress={() => router.replace('/card')} />}
      {status === 'signedOut' && <Button variant="secondary" label={t('auth.title')} onPress={() => router.replace('/login')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space[1] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  clip: { overflow: 'hidden' },
  tabular: { fontVariant: ['tabular-nums'] },
});
