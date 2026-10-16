import { parseCardLookup } from '@pats/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CircleAlert, CircleCheck, Nfc, QrCode } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field, Input } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { NfcUnavailable, useEncode, useNfcSupport } from '@/features/card-nfc';
import { useI18n } from '@/i18n';
import { radius, size, space, useColors } from '@/theme';

const buzz = (ok: boolean) => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => null);
};

/**
 * Encode one printed card after another on this phone: identify it (printed QR or NIM) → check the
 * printed name → tap → written, verified, protected → reported. With `grantId` it is a city
 * admin's one approved re-encode of a delivered card.
 */
export default function EncodeRun() {
  const params = useLocalSearchParams<{ batchId?: string; label?: string; lookup?: string; grantId?: string; reencode?: string }>();
  const { t } = useI18n();
  const c = useColors();
  const { support } = useNfcSupport();
  const reencode = params.reencode === '1';
  const { state, identify, write, cancel, reset, reportAgain } = useEncode({ batchId: params.batchId, grantId: params.grantId, reencode });
  const [nim, setNim] = useState('');
  const [nimError, setNimError] = useState<string | undefined>();
  const [camera, setCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef<string | null>(null);

  // An approved re-encode arrives with the member's NIM: go straight to the check.
  useEffect(() => {
    if (params.lookup && state.kind === 'idle' && handled.current !== params.lookup) {
      handled.current = params.lookup;
      void identify(params.lookup);
    }
  }, [identify, params.lookup, state.kind]);

  useEffect(() => {
    if (state.kind === 'done') buzz(true);
    if (state.kind === 'error') buzz(false);
  }, [state.kind]);

  const submitNim = () => {
    const parsed = parseCardLookup(nim);
    if (!parsed) return setNimError(t('validation.nimInvalid'));
    setNimError(undefined);
    void identify(nim.trim());
  };

  const title = params.grantId ? t('app.reencodeNow') : params.label ? t('app.encodeBatchTitle', { label: params.label }) : reencode ? t('app.encodeReencode') : t('app.adminEncode');

  if (support && support !== 'ready') {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title }} />
        <NfcUnavailable support={support} fallback={t('nfc.encodeFallback')} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      {(state.kind === 'idle' || state.kind === 'claiming') && !params.lookup && (
        <>
          <Text variant="bodySm" tone="textMuted">
            {t('app.encodeIdentify')}
          </Text>
          {camera && permission?.granted ? (
            <View style={styles.cameraBox}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={
                  state.kind === 'idle'
                    ? ({ data }) => {
                        if (!data || data === handled.current) return;
                        handled.current = data;
                        setCamera(false);
                        void identify(data);
                      }
                    : undefined
                }
              />
            </View>
          ) : (
            <Button
              label={t('app.encodeScanQr')}
              icon={<QrCode size={size.iconSm} color={c.primaryText} strokeWidth={2} />}
              loading={state.kind === 'claiming'}
              onPress={async () => {
                handled.current = null;
                if (!permission?.granted) {
                  const res = await requestPermission();
                  if (!res.granted) return;
                }
                setCamera(true);
              }}
            />
          )}
          <Field label={t('app.encodeNim')} error={nimError}>
            <Input
              value={nim}
              onChangeText={setNim}
              placeholder="JKT2600042"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={submitNim}
              invalid={Boolean(nimError)}
            />
          </Field>
          <Button variant="secondary" label={t('app.encodeFind')} disabled={state.kind === 'claiming' || nim.trim().length < 3} onPress={submitNim} />
        </>
      )}

      {state.kind === 'claiming' && params.lookup && (
        <Text variant="body" tone="textMuted" style={styles.center}>
          {t('app.scanChecking')}
        </Text>
      )}

      {(state.kind === 'confirm' || state.kind === 'tapping') && (
        <Card style={styles.panel}>
          <Who name={state.claim.member.fullName} detail={`${state.claim.member.nim} · ${state.claim.member.city.name}`} />
          <Text variant="bodySm" tone="textMuted">
            {state.kind === 'confirm' ? t('app.encodeCheckName') : t('app.encodeHold')}
          </Text>
          {state.claim.card.batch && (
            <Text variant="caption" tone="textMuted">
              {t('app.encodeCardInfo', { batch: state.claim.card.batch.label, status: t(`cardStatus.${state.claim.card.status}`) })}
            </Text>
          )}
          <Button
            label={state.kind === 'tapping' ? t('app.encodeWriting') : t('app.encodeTap')}
            icon={<Nfc size={size.iconSm} color={c.primaryText} strokeWidth={2} />}
            loading={state.kind === 'tapping'}
            onPress={() => void write(state.claim)}
          />
          <Button variant="ghost" label={t('app.encodeNotThisCard')} disabled={state.kind === 'tapping'} onPress={() => void cancel()} />
        </Card>
      )}

      {state.kind === 'already' && (
        <Card style={styles.panel}>
          <Who name={state.claim.member.fullName} detail={`${state.claim.member.nim} · ${state.claim.member.city.name}`} />
          <Text variant="bodySm" tone="warningText">
            {t('app.encodeAlready', { station: state.claim.card.encodedStation ?? '—' })}
          </Text>
          <Button label={t('app.encodeNext')} onPress={reset} />
        </Card>
      )}

      {state.kind === 'done' && (
        <Card style={styles.panel} accessibilityLiveRegion="polite">
          <View style={styles.row}>
            <CircleCheck size={size.icon} color={c.successText} strokeWidth={2} />
            <Text variant="title3" tone="successText">
              {t('app.encodeDone')}
            </Text>
          </View>
          <Who name={state.claim.member.fullName} detail={`${state.claim.member.nim} · ${state.chip}`} />
          {state.result.batch && (
            <Text variant="bodySm" tone="textMuted">
              {t('app.encodeProgress', { label: state.result.batch.label, done: state.result.batch.encodedCount, total: state.result.batch.cardCount })}
            </Text>
          )}
          {params.grantId ? <Button label={t('common.close')} onPress={() => router.back()} /> : <Button label={t('app.encodeNext')} onPress={reset} />}
        </Card>
      )}

      {state.kind === 'error' && (
        <Card style={styles.panel} accessibilityRole="alert">
          <View style={styles.row}>
            <CircleAlert size={size.icon} color={c.dangerText} strokeWidth={2} />
            <Text variant="body" weight={600} tone="dangerText" style={styles.flex}>
              {t.loose(state.key, state.params)}
            </Text>
          </View>
          {state.claim && <Who name={state.claim.member.fullName} detail={state.claim.member.nim} />}
          {state.pending ? (
            <Button label={t('app.encodeReportAgain')} onPress={() => void reportAgain()} />
          ) : (
            <>
              <Text variant="bodySm" tone="textMuted">
                {params.grantId ? t('app.encodeBrokenHint') : t('app.encodeNothingChanged')}
              </Text>
              {state.claim?.lease && !state.pending && state.key !== 'nfc.cancelled' ? (
                <Button label={t('app.encodeRetry')} onPress={() => void identify(params.lookup ?? state.claim!.member.nim)} />
              ) : null}
              <Button variant="secondary" label={params.lookup ? t('common.back') : t('app.encodeNext')} onPress={reset} />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

function Who({ name, detail }: { name: string; detail: string }) {
  return (
    <View style={styles.who}>
      <Avatar name={name} photoUrl={null} large />
      <View style={styles.flex}>
        <Text variant="title3" numberOfLines={2} accessibilityRole="header">
          {name}
        </Text>
        <Text variant="bodySm" tone="textMuted" style={styles.tabular}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: space[4], gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  who: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
  cameraBox: { height: size.scanFrame + space[10], borderRadius: radius.card, overflow: 'hidden' },
});
