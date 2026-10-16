import { formatDate, type HandoverPreviewResponse, type HandoverResponse } from '@pats/shared';
import * as Haptics from 'expo-haptics';
import { CircleAlert, CircleCheck, CreditCard, Nfc } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { nfcErrorKey, NfcUnavailable, useNfcSupport } from '@/features/card-nfc';
import { useI18n } from '@/i18n';
import { ApiFailure } from '@/lib/api';
import { NfcCancelled, readCard } from '@/lib/nfc';
import { size, space, useColors } from '@/theme';

type State =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'preview'; preview: HandoverPreviewResponse; input: { token: string; nfcUid: string } }
  | { kind: 'saving'; preview: HandoverPreviewResponse; input: { token: string; nfcUid: string } }
  | { kind: 'done'; result: HandoverResponse }
  | { kind: 'error'; message: string };

const buzz = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(type).catch(() => null);
};

/**
 * Hand-over (PRODUCT.md §4.1 step 8): the crew taps the member's encoded card, sees whose it is,
 * and confirms they handed it over: ENCODED → DELIVERED. The binding was done at HQ.
 */
export default function HandoverScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { call } = useAuth();
  const { support } = useNfcSupport();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const tap = async () => {
    setState({ kind: 'reading' });
    try {
      const card = await readCard(t('nfc.handoverPrompt'), t('nfc.readDone'));
      if (!card.token) throw new ApiFailure('CARD_INVALID');
      const input = { token: card.token, nfcUid: card.uid };
      const preview = await call<HandoverPreviewResponse>('POST', '/api/admin/cards/handover/preview', input);
      buzz(preview.issue ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
      setState({ kind: 'preview', preview, input });
    } catch (err) {
      if (err instanceof NfcCancelled) return setState({ kind: 'idle' });
      buzz(Haptics.NotificationFeedbackType.Error);
      setState({ kind: 'error', message: t.loose(nfcErrorKey(err), err instanceof ApiFailure ? err.params : undefined) });
    }
  };

  const confirm = async () => {
    if (state.kind !== 'preview') return;
    setState({ kind: 'saving', preview: state.preview, input: state.input });
    try {
      const result = await call<HandoverResponse>('POST', '/api/admin/cards/handover', state.input);
      buzz(Haptics.NotificationFeedbackType.Success);
      setState({ kind: 'done', result });
    } catch (err) {
      buzz(Haptics.NotificationFeedbackType.Error);
      setState({ kind: 'error', message: t.loose(nfcErrorKey(err), err instanceof ApiFailure ? err.params : undefined) });
    }
  };

  if (support && support !== 'ready') {
    return (
      <Screen edges={['bottom']}>
        <NfcUnavailable support={support} fallback={t('nfc.handoverFallback')} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      {state.kind === 'idle' || state.kind === 'reading' ? (
        <Card>
          <EmptyState
            icon={Nfc}
            title={t('app.handoverTitle')}
            body={t('app.handoverBody')}
            action={<Button label={t('app.handoverTap')} loading={state.kind === 'reading'} onPress={() => void tap()} />}
          />
        </Card>
      ) : state.kind === 'error' ? (
        <Card style={styles.panel} accessibilityRole="alert">
          <View style={styles.row}>
            <CircleAlert size={size.icon} color={c.dangerText} strokeWidth={2} />
            <Text variant="body" weight={600} tone="dangerText" style={styles.flex}>
              {state.message}
            </Text>
          </View>
          <Text variant="bodySm" tone="textMuted">
            {t('app.scanNotRecorded')}
          </Text>
          <Button variant="secondary" label={t('app.handoverAgain')} onPress={() => void tap()} />
        </Card>
      ) : state.kind === 'done' ? (
        <Card style={styles.panel} accessibilityLiveRegion="polite">
          <View style={styles.row}>
            <CircleCheck size={size.icon} color={c.successText} strokeWidth={2} />
            <Text variant="title3" tone="successText">
              {t('app.handoverDone')}
            </Text>
          </View>
          <Who member={state.result.member} />
          <Text variant="bodySm" tone="textMuted">
            {t('app.handoverDoneBody', { name: state.result.member.fullName.split(' ')[0] ?? '' })}
          </Text>
          <Button label={t('app.handoverNext')} onPress={() => void tap()} />
        </Card>
      ) : (
        <Card style={styles.panel}>
          <Who member={state.preview.member} />
          {state.preview.issue?.code === 'ALREADY_DELIVERED' && (
            <Line tone="warningText" text={t('app.handoverAlready', { date: state.preview.issue.at ? formatDate(new Date(state.preview.issue.at), t.locale) : '—', name: state.preview.issue.by ?? '—' })} />
          )}
          {state.preview.issue?.code === 'OTHER_CITY' && <Line tone="dangerText" text={t('app.handoverOtherCity', { city: state.preview.member.city.name })} />}
          {state.preview.issue?.code === 'MEMBER_INACTIVE' && <Line tone="dangerText" text={t('app.resultInactive')} />}
          {!state.preview.issue && (
            <Text variant="bodySm" tone="textMuted">
              {t('app.handoverCheck')}
            </Text>
          )}
          {state.preview.issue ? (
            <Button variant="secondary" label={t('app.handoverAgain')} onPress={() => void tap()} />
          ) : (
            <>
              <Button
                label={state.kind === 'saving' ? t('app.handoverSaving') : t('app.handoverConfirm')}
                icon={<CreditCard size={size.iconSm} color={c.primaryText} strokeWidth={2} />}
                loading={state.kind === 'saving'}
                onPress={() => void confirm()}
              />
              <Button variant="ghost" label={t('common.cancel')} disabled={state.kind === 'saving'} onPress={() => setState({ kind: 'idle' })} />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

function Who({ member }: { member: { fullName: string; nim: string; photoUrl: string | null; city: { name: string } } }) {
  return (
    <View style={styles.who}>
      <Avatar name={member.fullName} photoUrl={member.photoUrl} large />
      <View style={styles.flex}>
        <Text variant="title3" numberOfLines={2} accessibilityRole="header">
          {member.fullName}
        </Text>
        <Text variant="bodySm" tone="textMuted" style={styles.tabular}>
          {`${member.nim} · ${member.city.name}`}
        </Text>
      </View>
    </View>
  );
}

function Line({ text, tone }: { text: string; tone: 'warningText' | 'dangerText' }) {
  const c = useColors();
  return (
    <View style={styles.row}>
      <CircleAlert size={size.iconSm} color={c[tone]} strokeWidth={2} />
      <Text variant="bodySm" tone={tone} style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: space[4], gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  who: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
