import { formatCount, type StationBatchesResponse } from '@pats/shared';
import { router } from 'expo-router';
import { Boxes, ScanLine } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { Text } from '@/components/text';
import { NfcUnavailable, useNfcSupport } from '@/features/card-nfc';
import { useI18n } from '@/i18n';
import { useApi } from '@/lib/use-api';
import { size, space, useColors } from '@/theme';

/**
 * HQ phone as an encode station (parallel encoding at HQ): pick a batch that is back from the
 * vendor, then scan printed cards and tap them. Several stations can work on one batch at once;
 * the server hands each card to one station at a time.
 */
export default function EncodeHome() {
  const { t } = useI18n();
  const c = useColors();
  const { support } = useNfcSupport();
  const batches = useApi<StationBatchesResponse>('/api/hq/batches', { pollMs: 10_000 });

  return (
    <Screen edges={['bottom']} refreshing={batches.refreshing} onRefresh={() => void batches.reload()}>
      <Text variant="bodySm" tone="textMuted">
        {t('app.encodeIntro')}
      </Text>
      {support && support !== 'ready' && <NfcUnavailable support={support} fallback={t('nfc.encodeFallback')} />}
      {batches.loading ? (
        <Loading />
      ) : batches.error ? (
        <LoadError error={batches.error} onRetry={() => void batches.reload()} />
      ) : batches.data!.batches.length === 0 ? (
        <Card>
          <EmptyState icon={Boxes} title={t('app.encodeNoBatchTitle')} body={t('app.encodeNoBatchBody')} />
        </Card>
      ) : (
        <>
          <SectionLabel>{t('app.encodeBatches')}</SectionLabel>
          <Card style={styles.clip}>
            {batches.data!.batches.map((b, i) => (
              <ListRow
                key={b.id}
                first={i === 0}
                icon={Boxes}
                title={`${b.label} · ${b.city.name}`}
                subtitle={`${t('cards.encodedOf', { done: formatCount(b.encodedCount), total: formatCount(b.cardCount) })}${b.claimedCount ? ` · ${t('cards.encodingNow', { count: formatCount(b.claimedCount) })}` : ''}`}
                trailing={b.encodedCount >= b.cardCount ? <Badge tone="success" label={t('app.encodeBatchDone')} /> : undefined}
                disabled={support !== 'ready'}
                onPress={() => router.push({ pathname: '/encode/run', params: { batchId: b.id, label: b.label } })}
              />
            ))}
          </Card>
        </>
      )}
      <View style={styles.any}>
        <Button
          variant="secondary"
          label={t('app.encodeAnyCard')}
          icon={<ScanLine size={size.iconSm} color={c.text} strokeWidth={2} />}
          disabled={support !== 'ready'}
          onPress={() => router.push('/encode/run')}
        />
        <Button variant="ghost" label={t('app.encodeReencode')} disabled={support !== 'ready'} onPress={() => router.push({ pathname: '/encode/run', params: { reencode: '1' } })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' }, any: { gap: space[2] } });
