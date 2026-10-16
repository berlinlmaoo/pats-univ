import { formatCount, type EventDetailResponse } from '@pats/shared';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraOff, Flashlight, FlashlightOff, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { ScanResult, useCheckIn } from '@/features/scan';
import { useT } from '@/i18n';
import { keepAwake } from '@/lib/keep-awake';
import { useApi } from '@/lib/use-api';
import { colors, radius, size, space } from '@/theme';

/** The camera feed is dark whatever the system theme, so the overlay always uses dark tokens. */
const ink = colors.dark;
/** After a recorded check-in, go back to scanning on its own so the door keeps moving. */
const AUTO_NEXT_MS = 3000;
/** Primary buttons on the overlay use the dark palette too, or navy would sit on navy. */
const darkPrimary = { backgroundColor: ink.primary };
const RETRYABLE = new Set(['NETWORK', 'TICKET_EXPIRED', 'RATE_LIMITED', 'INTERNAL']);

export default function ScannerScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [available, setAvailable] = useState(Platform.OS !== 'web');
  const [torch, setTorch] = useState(false);
  const [focused, setFocused] = useState(true);
  const event = useApi<EventDetailResponse>(`/api/admin/events/${eventId}`);
  const [count, setCount] = useState<number | null>(null);
  const { state, preview, confirm, reset } = useCheckIn(eventId, (r) => setCount(r.count));
  /** The last code handled: the same QR stays in view after a scan and must not fire again. */
  const lastToken = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') void CameraView.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  // Camera and keep-awake only while this screen is in front (not under the manual sheet).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      const release = keepAwake('scanner');
      return () => {
        setFocused(false);
        release();
      };
    }, []),
  );

  useEffect(() => {
    if (state.kind !== 'done') return;
    const id = setTimeout(reset, AUTO_NEXT_MS);
    return () => clearTimeout(id);
  }, [state.kind, reset]);

  const onScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (!data || data === lastToken.current) return;
      lastToken.current = data;
      void preview({ method: 'APP_QR', token: data });
    },
    [preview],
  );

  const e = event.data?.event;
  // Counts only grow: take whichever is newer, our own confirmations or a refetch (manual check-ins).
  const shownCount = Math.max(count ?? 0, e?.checkInCount ?? 0);
  const granted = Boolean(permission?.granted) && available;
  const scanning = state.kind === 'idle' && focused;

  return (
    <View style={[styles.root, { backgroundColor: ink.bg }]}>
      <StatusBar style="light" />
      {granted && focused && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanning ? onScanned : undefined}
        />
      )}

      {/* Full-bleed camera: the overlay pads itself by the safe-area insets. */}
      <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.top}>
          <RoundButton label={t('common.close')} onPress={() => router.back()}>
            <X size={size.icon + 2} color={ink.text} strokeWidth={2} />
          </RoundButton>
          <View style={[styles.title, { backgroundColor: ink.scrim }]}>
            <Text variant="bodySm" weight={600} numberOfLines={1} style={{ color: ink.text }}>
              {e?.title ?? ' '}
            </Text>
            <Text variant="caption" numberOfLines={1} style={[styles.tabular, { color: ink.textMuted }]}>
              {t('app.adminCheckedInCount', { count: formatCount(shownCount) })}
            </Text>
          </View>
          {granted ? (
            <RoundButton label={t('app.scanTorch')} onPress={() => setTorch((v) => !v)} selected={torch}>
              {torch ? <FlashlightOff size={size.icon} color={ink.text} strokeWidth={2} /> : <Flashlight size={size.icon} color={ink.text} strokeWidth={2} />}
            </RoundButton>
          ) : (
            <View style={styles.round} />
          )}
        </View>

        <View style={styles.middle}>
          {!available ? (
            <Blocked icon title={t('app.scanUnavailableTitle')} body={t('app.scanUnavailableBody')} />
          ) : !permission ? null : !permission.granted ? (
            <Blocked
              title={t('app.scanPermissionTitle')}
              body={t('app.scanPermissionBody')}
              action={
                permission.canAskAgain ? (
                  <Button label={t('app.scanAllow')} style={darkPrimary} labelColor={ink.primaryText} onPress={() => void requestPermission()} />
                ) : (
                  <Button label={t('app.scanOpenSettings')} style={darkPrimary} labelColor={ink.primaryText} onPress={() => void Linking.openSettings()} />
                )
              }
            />
          ) : state.kind === 'idle' || state.kind === 'checking' ? (
            <>
              <Viewfinder />
              <Text variant="body" weight={500} style={[styles.hint, { color: ink.text }]}>
                {t('app.scanHint')}
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.bottom}>
          {state.kind === 'idle' ? (
            <Button
              variant="secondary"
              label={t('app.scanManual')}
              icon={<Search size={size.iconSm} color={ink.text} strokeWidth={2} />}
              style={{ backgroundColor: ink.surface, borderColor: ink.border }}
              labelColor={ink.text}
              onPress={() => router.push({ pathname: '/scan/[eventId]/manual', params: { eventId } })}
            />
          ) : (
            <ScanResult
              state={state}
              timeZone={e?.city.timezone ?? 'Asia/Jakarta'}
              nextLabel={state.kind === 'done' ? t('app.resultNext') : t('app.scanAgain')}
              onConfirm={() => void confirm()}
              onNext={() => {
                // The same code may be tried again only when it wasn't the code's fault. An expired,
                // used or foreign code stays ignored until the member shows a fresh one.
                if (state.kind === 'error' && RETRYABLE.has(state.failure.code)) lastToken.current = null;
                reset();
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function RoundButton({ label, onPress, children, selected }: { label: string; onPress: () => void; children: React.ReactNode; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.round, { backgroundColor: selected ? ink.accentSubtle : ink.scrim }, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

/** Four corner brackets: the target, without hiding the feed. */
function Viewfinder() {
  const corner = { borderColor: ink.text, width: space[8], height: space[8], position: 'absolute' as const };
  const w = 3;
  return (
    <View style={styles.frame} accessible={false}>
      <View style={[corner, { top: 0, left: 0, borderTopWidth: w, borderLeftWidth: w, borderTopLeftRadius: radius.control }]} />
      <View style={[corner, { top: 0, right: 0, borderTopWidth: w, borderRightWidth: w, borderTopRightRadius: radius.control }]} />
      <View style={[corner, { bottom: 0, left: 0, borderBottomWidth: w, borderLeftWidth: w, borderBottomLeftRadius: radius.control }]} />
      <View style={[corner, { bottom: 0, right: 0, borderBottomWidth: w, borderRightWidth: w, borderBottomRightRadius: radius.control }]} />
    </View>
  );
}

function Blocked({ title, body, action, icon }: { title: string; body: string; action?: React.ReactNode; icon?: boolean }) {
  return (
    <Card style={[styles.blocked, { backgroundColor: ink.surface, borderColor: ink.border }]}>
      {icon && <CameraOff size={size.icon} color={ink.textMuted} strokeWidth={1.75} />}
      <Text variant="title3" style={[styles.center, { color: ink.text }]}>
        {title}
      </Text>
      <Text variant="bodySm" style={[styles.center, { color: ink.textMuted }]}>
        {body}
      </Text>
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[2] },
  round: { width: size.touch, height: size.touch, borderRadius: size.touch / 2, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  title: { flex: 1, borderRadius: radius.control, paddingHorizontal: space[3], paddingVertical: space[1.5], alignItems: 'center' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[6], gap: space[5] },
  frame: { width: size.scanFrame, height: size.scanFrame },
  hint: { textAlign: 'center', textShadowColor: ink.scrim, textShadowRadius: 6 },
  bottom: { paddingHorizontal: space[4], paddingBottom: space[3] },
  blocked: { padding: space[5], gap: space[3], alignItems: 'center', maxWidth: size.formMax },
  center: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
});
