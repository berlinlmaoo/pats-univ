import type { CardTokenResponse } from '@pats/shared';
import { useFocusEffect } from 'expo-router';
import { WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { QrCode } from '@/components/qr-code';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { ApiFailure } from '@/lib/api';
import { keepAwake } from '@/lib/keep-awake';
import { colors, radius, size, space, useColors } from '@/theme';

interface Live {
  token: string;
  /** Local-clock times (corrected for a skewed phone clock). */
  expiresAt: number;
  refreshAt: number;
  ttlSeconds: number;
}

type QrState = { kind: 'loading' } | { kind: 'live'; qr: Live } | { kind: 'error'; offline: boolean; qr: Live | null };

/** Show a code for at least this share of its life before swapping in the next one. */
const SHOW_FRACTION = 2 / 3;
const RETRY_MS = 5000;

/**
 * The rotating check-in QR (PRODUCT.md §10.1). A new signed token is fetched before the current
 * one runs out, so the code on screen always has time left when the crew scans it. Offline, the
 * last code stays up until it expires, then the card says why there is none.
 */
export function useRotatingQr(): { state: QrState; secondsLeft: number; progress: number; retry: () => void } {
  const { call } = useAuth();
  const [state, setState] = useState<QrState>({ kind: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(false);
  const current = useRef<Live | null>(null);

  /** Latest fetchToken, so the timers it schedules can call it again. */
  const again = useRef<() => void>(() => {});

  const fetchToken = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (!focused.current) return;
    try {
      const res = await call<CardTokenResponse>('GET', '/api/me/card-token');
      const skew = new Date(res.serverTime).getTime() - Date.now();
      const expiresAt = new Date(res.expiresAt).getTime() - skew;
      const live: Live = {
        token: res.token,
        expiresAt,
        refreshAt: Date.now() + res.ttlSeconds * 1000 * SHOW_FRACTION,
        ttlSeconds: res.ttlSeconds,
      };
      current.current = live;
      setState({ kind: 'live', qr: live });
      timer.current = setTimeout(() => again.current(), live.refreshAt - Date.now());
    } catch (err) {
      const offline = err instanceof ApiFailure && err.code === 'NETWORK';
      const stillValid = current.current && current.current.expiresAt > Date.now() ? current.current : null;
      setState({ kind: 'error', offline, qr: stillValid });
      timer.current = setTimeout(() => again.current(), RETRY_MS);
    }
  }, [call]);

  useEffect(() => {
    again.current = () => void fetchToken();
  }, [fetchToken]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void fetchToken();
      const release = keepAwake('card-qr');
      const tick = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        focused.current = false;
        clearInterval(tick);
        if (timer.current) clearTimeout(timer.current);
        release();
      };
    }, [fetchToken]),
  );

  // Coming back from the background: the code on screen is probably stale.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && focused.current) void fetchToken();
    });
    return () => sub.remove();
  }, [fetchToken]);

  // An offline code that runs out disappears.
  const shown = state.kind === 'live' ? state.qr : state.kind === 'error' ? state.qr : null;
  const visible = shown && shown.expiresAt > now ? shown : null;
  const secondsLeft = visible ? Math.max(0, Math.ceil((visible.refreshAt - now) / 1000)) : 0;
  const window = visible ? visible.ttlSeconds * 1000 * SHOW_FRACTION : 1;
  const progress = visible ? Math.min(1, Math.max(0, (visible.refreshAt - now) / window)) : 0;
  const effective: QrState =
    state.kind === 'error' ? { ...state, qr: visible } : state.kind === 'live' && !visible ? { kind: 'loading' } : state;

  return { state: effective, secondsLeft, progress, retry: () => void fetchToken() };
}

export function CardQr() {
  const t = useT();
  const c = useColors();
  const { state, secondsLeft, progress, retry } = useRotatingQr();
  const qr = state.kind === 'live' ? state.qr : state.kind === 'error' ? state.qr : null;
  const ttl = qr?.ttlSeconds ?? 45;
  // Scanners need dark-on-white in both themes.
  const ink = colors.light.primary;
  const paper = colors.light.surface;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="title3">{t('app.cardQrTitle')}</Text>
        {qr && state.kind === 'live' ? (
          <Text variant="caption" tone="textMuted" style={styles.tabular} accessibilityLiveRegion="none">
            {t('app.cardQrRefreshIn', { seconds: secondsLeft })}
          </Text>
        ) : null}
      </View>

      <View style={[styles.qrBox, { backgroundColor: paper, borderColor: c.border }]} accessible accessibilityRole="image" accessibilityLabel={t('app.cardQrA11y')}>
        {qr ? (
          <QrCode value={qr.token} size={size.qr} color={ink} background={paper} />
        ) : state.kind === 'loading' ? (
          <ActivityIndicator color={ink} />
        ) : (
          <View style={styles.placeholder}>
            <WifiOff size={size.icon} color={colors.light.textMuted} strokeWidth={1.75} />
          </View>
        )}
      </View>

      {qr ? (
        <View style={[styles.track, { backgroundColor: c.surfaceMuted }]} accessible={false}>
          <View style={[styles.fill, { backgroundColor: c.accent, width: `${progress * 100}%` }]} />
        </View>
      ) : null}

      {state.kind === 'error' ? (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <Text variant="bodySm" tone={qr ? 'textMuted' : 'dangerText'} style={styles.center}>
            {state.offline ? t('app.cardQrOffline') : t('app.cardQrError')}
          </Text>
          {!qr ? <Button variant="secondary" label={t('common.retry')} onPress={retry} /> : null}
        </View>
      ) : (
        <Text variant="bodySm" tone="textMuted" style={styles.center}>
          {t('app.cardQrBody', { seconds: Math.round(ttl * SHOW_FRACTION) })}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: space[4], gap: space[4], alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3] },
  // Hugs the code: the QR's own quiet zone is the white margin.
  qrBox: {
    alignSelf: 'center',
    minWidth: size.qr,
    minHeight: size.qr,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  track: { height: space[1], borderRadius: radius.pill, overflow: 'hidden', marginTop: -space[1] },
  fill: { height: '100%', borderRadius: radius.pill },
  error: { alignItems: 'center', gap: space[3] },
  center: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
});
