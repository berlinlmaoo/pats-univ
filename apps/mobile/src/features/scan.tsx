import { formatTime, type CheckInPreviewResponse, type CheckInResponse } from '@pats/shared';
import * as Haptics from 'expo-haptics';
import { CircleAlert, CircleCheck, Info, MapPin, Users, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { size, space, useColors } from '@/theme';

export type Subject = { method: 'NFC'; token: string; nfcUid: string } | { method: 'APP_QR'; token: string } | { method: 'MANUAL'; memberId: string };

export type ScanState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'preview'; preview: CheckInPreviewResponse; subject: Subject }
  | { kind: 'committing'; preview: CheckInPreviewResponse; subject: Subject }
  | { kind: 'done'; result: CheckInResponse }
  | { kind: 'error'; failure: ApiFailure };

function haptic(kind: 'success' | 'warning' | 'error') {
  if (Platform.OS === 'web') return;
  const type = { success: Haptics.NotificationFeedbackType.Success, warning: Haptics.NotificationFeedbackType.Warning, error: Haptics.NotificationFeedbackType.Error }[kind];
  void Haptics.notificationAsync(type).catch(() => null);
}

const asFailure = (err: unknown) => (err instanceof ApiFailure ? err : new ApiFailure('INTERNAL'));

/**
 * Two-step check-in (PLAN.md §2.1): preview identifies the member and records nothing; confirm
 * records it. The server re-checks everything on confirm, so a stale preview can't slip through.
 */
export function useCheckIn(eventId: string, onRecorded?: (r: CheckInResponse) => void) {
  const { call } = useAuth();
  const [state, setState] = useState<ScanState>({ kind: 'idle' });

  const preview = useCallback(
    async (subject: Subject) => {
      setState({ kind: 'checking' });
      try {
        const res = await call<CheckInPreviewResponse>('POST', '/api/admin/check-in/preview', { eventId, ...subject });
        haptic(res.issue ? 'warning' : 'success');
        setState({ kind: 'preview', preview: res, subject });
      } catch (err) {
        haptic('error');
        setState({ kind: 'error', failure: asFailure(err) });
      }
    },
    [call, eventId],
  );

  const confirm = useCallback(
    async (reason?: string) => {
      if (state.kind !== 'preview') return;
      const { preview: p, subject } = state;
      setState({ kind: 'committing', preview: p, subject });
      const body =
        subject.method === 'MANUAL'
          ? { method: 'MANUAL', eventId, memberId: subject.memberId, reason }
          : { method: subject.method, eventId, ticket: p.ticket };
      try {
        const res = await call<CheckInResponse>('POST', '/api/admin/check-in', body);
        haptic('success');
        setState({ kind: 'done', result: res });
        onRecorded?.(res);
      } catch (err) {
        const failure = asFailure(err);
        // A missing reason is a form problem: stay on the preview so it can be fixed.
        if (failure.code === 'VALIDATION') {
          setState({ kind: 'preview', preview: p, subject });
          throw failure;
        }
        haptic('error');
        setState({ kind: 'error', failure });
      }
    },
    [call, eventId, onRecorded, state],
  );

  const reset = useCallback(() => setState({ kind: 'idle' }), []);
  /** Show a failure that happened before the server was asked (e.g. a tag that isn't a PATS card). */
  const fail = useCallback((failure: ApiFailure) => {
    haptic('error');
    setState({ kind: 'error', failure });
  }, []);
  return { state, preview, confirm, reset, fail };
}

/** Seconds left on the preview's ticket, ticking. */
function useSecondsUntil(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);
  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : null;
}

function Line({ icon: Icon, tone, children }: { icon: typeof Info; tone: 'textMuted' | 'dangerText' | 'warningText' | 'successText'; children: string }) {
  const c = useColors();
  return (
    <View style={styles.line}>
      <Icon size={size.iconSm} color={c[tone]} strokeWidth={2} style={styles.lineIcon} />
      <Text variant="bodySm" tone={tone} style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

/**
 * What the crew sees after a scan: who it is (photo, name, NIM, city) and what to do next.
 * `extra` slots the manual reason field in above the confirm button.
 */
export function ScanResult({
  state,
  timeZone,
  onConfirm,
  onNext,
  nextLabel,
  extra,
  confirmDisabled,
}: {
  state: ScanState;
  timeZone: string;
  onConfirm: () => void;
  onNext: () => void;
  nextLabel: string;
  extra?: ReactNode;
  confirmDisabled?: boolean;
}) {
  const { t } = useI18n();
  const c = useColors();
  const ticketLeft = useSecondsUntil(state.kind === 'preview' ? state.preview.ticketExpiresAt : null);

  if (state.kind === 'idle') return null;

  if (state.kind === 'checking') {
    return (
      <Card style={styles.panel}>
        <Text variant="body" tone="textMuted" style={styles.center} accessibilityLiveRegion="polite">
          {t('app.scanChecking')}
        </Text>
      </Card>
    );
  }

  if (state.kind === 'error') {
    const offline = state.failure.code === 'NETWORK';
    const message = t.loose(errorKey(state.failure.code), state.failure.params);
    return (
      <Card style={styles.panel} accessibilityRole="alert">
        <View style={styles.statusRow}>
          {offline ? <WifiOff size={size.icon} color={c.dangerText} strokeWidth={2} /> : <CircleAlert size={size.icon} color={c.dangerText} strokeWidth={2} />}
          <Text variant="body" weight={600} tone="dangerText" style={styles.flex}>
            {message}
          </Text>
        </View>
        <Text variant="bodySm" tone="textMuted">
          {t('app.scanNotRecorded')}
        </Text>
        <Button label={nextLabel} variant="secondary" onPress={onNext} />
      </Card>
    );
  }

  if (state.kind === 'done') {
    const { checkIn } = state.result;
    return (
      <Card style={styles.panel} accessibilityLiveRegion="polite">
        <View style={styles.statusRow}>
          <CircleCheck size={size.icon} color={c.successText} strokeWidth={2} />
          <Text variant="title3" tone="successText">
            {t('app.resultCheckedIn')}
          </Text>
        </View>
        <View style={styles.who}>
          <Avatar name={checkIn.member.fullName} photoUrl={checkIn.member.photoUrl} large />
          <View style={styles.flex}>
            <Text variant="title3" numberOfLines={2}>
              {checkIn.member.fullName}
            </Text>
            <Text variant="bodySm" tone="textMuted" style={styles.tabular}>
              {`${checkIn.member.nim} · ${formatTime(new Date(checkIn.checkedInAt), { timeZone })}`}
            </Text>
          </View>
        </View>
        <Button label={nextLabel} onPress={onNext} />
      </Card>
    );
  }

  const { preview: p } = state;
  const issue = p.issue;
  const committing = state.kind === 'committing';
  return (
    <Card style={styles.panel}>
      <View style={styles.who}>
        <Avatar name={p.member.fullName} photoUrl={p.member.photoUrl} large />
        <View style={styles.flex}>
          <Text variant="title3" numberOfLines={2} accessibilityRole="header">
            {p.member.fullName}
          </Text>
          <Text variant="bodySm" tone="textMuted" style={styles.tabular}>
            {`${p.member.nim} · ${p.member.city.name}`}
          </Text>
        </View>
      </View>

      {issue?.code === 'ALREADY_CHECKED_IN' && (
        <Line icon={CircleAlert} tone="warningText">
          {t('app.resultAlready', { time: formatTime(new Date(issue.checkedInAt!), { timeZone }), admin: issue.byAdmin ?? '' })}
        </Line>
      )}
      {issue?.code === 'MEMBER_INACTIVE' && (
        <Line icon={CircleAlert} tone="dangerText">
          {t('app.resultInactive')}
        </Line>
      )}
      {issue?.code === 'MEMBER_OTHER_CITY' && (
        <Line icon={MapPin} tone="dangerText">
          {t('app.resultOtherCity', { city: p.member.city.name })}
        </Line>
      )}
      {!issue && p.roaming && (
        <Line icon={MapPin} tone="textMuted">
          {t('app.resultRoaming', { city: p.member.city.name })}
        </Line>
      )}
      {!issue && p.capacityReached && (
        <Line icon={Users} tone="warningText">
          {t('app.resultCapacity')}
        </Line>
      )}

      {issue ? (
        <Button label={nextLabel} variant="secondary" onPress={onNext} />
      ) : (
        <>
          {extra}
          <Button label={committing ? t('app.resultConfirming') : t('app.resultConfirm')} loading={committing} disabled={confirmDisabled} onPress={onConfirm} />
          <View style={styles.footer}>
            <Button variant="ghost" label={t('common.cancel')} onPress={onNext} disabled={committing} />
            {ticketLeft !== null && (
              <Text variant="caption" tone="textMuted" style={styles.tabular}>
                {t('app.resultExpiresIn', { seconds: ticketLeft })}
              </Text>
            )}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: { padding: space[4], gap: space[3] },
  center: { textAlign: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  line: { flexDirection: 'row', gap: space[2] },
  lineIcon: { marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -space[1] },
  tabular: { fontVariant: ['tabular-nums'] },
});
