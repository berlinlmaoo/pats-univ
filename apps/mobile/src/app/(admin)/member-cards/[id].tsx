import { can, formatDate, formatTime, formatUid, REASON_MIN, type CrewMemberCardsResponse } from '@pats/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Clock, PenLine } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DetailList } from '@/components/detail-list';
import { Field, Input } from '@/components/field';
import { LoadError, Loading } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { Text } from '@/components/text';
import { CardStatusBadge } from '@/features/card-status';
import { useI18n } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { size, space, useColors } from '@/theme';

type Mode = 'none' | 'lost' | 'reencode';

/**
 * One member's card for the crew: report it lost or damaged (revoked, replacement queued), or,
 * when a delivered card is damaged but its chip still works, ask HQ for one re-encode. Once HQ
 * approves, the admin who asked can encode it here within 24 hours.
 */
export default function MemberCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const c = useColors();
  const { call, me } = useAuth();
  const data = useApi<CrewMemberCardsResponse>(`/api/admin/cards/members/${id}`);
  const [mode, setMode] = useState<Mode>('none');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const role = me?.user.role ?? 'MEMBER';

  if (data.loading) return <Loading />;
  if (data.error || !data.data) return <LoadError error={data.error ?? new ApiFailure('INTERNAL')} onRetry={() => void data.reload()} />;

  const { member, cards, reencode } = data.data;
  const card = cards[0] && cards[0].status !== 'REVOKED' ? cards[0] : null;
  const grantOpen = reencode?.status === 'APPROVED' && reencode.mine && reencode.grantExpiresAt && new Date(reencode.grantExpiresAt) > new Date();
  const canRequest = card?.status === 'DELIVERED' && can(role, 'card.requestReencode') && reencode?.status !== 'PENDING' && !grantOpen;
  const canReport = card && card.status !== 'NOT_PRINTED' && can(role, 'card.reportLost');

  const submit = async () => {
    if (!card) return;
    if (reason.trim().length < REASON_MIN) {
      setError(t('validation.reasonRequired'));
      return;
    }
    setError(undefined);
    const go = async () => {
      setBusy(true);
      try {
        if (mode === 'lost') {
          await call('POST', `/api/admin/cards/${card.id}/revoke`, { reason: reason.trim() });
          setNotice(t('app.cardsRevoked'));
        } else {
          await call('POST', `/api/admin/cards/${card.id}/reencode-requests`, { reason: reason.trim() });
          setNotice(t('app.cardsRequested'));
        }
        setMode('none');
        setReason('');
        await data.reload();
      } catch (err) {
        const f = err instanceof ApiFailure ? err : new ApiFailure('INTERNAL');
        setError(f.fields.reason ? t.loose(f.fields.reason) : t.loose(errorKey(f.code), f.params));
      } finally {
        setBusy(false);
      }
    };
    if (mode === 'lost') {
      Alert.alert(t('app.cardsLostConfirmTitle', { name: member.fullName }), t('app.cardsLostConfirmBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('app.cardsLostConfirm'), style: 'destructive', onPress: () => void go() },
      ]);
    } else {
      await go();
    }
  };

  return (
    <Screen edges={['bottom']} refreshing={data.refreshing} onRefresh={() => void data.reload()}>
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

      {notice && <Notice text={notice} />}

      {/* The form comes first, so it isn't under the keyboard. */}
      {mode !== 'none' && (
        <Card style={styles.panel}>
          <Text variant="title3">{mode === 'lost' ? t('app.cardsLostTitle') : t('app.cardsReencodeTitle')}</Text>
          <Text variant="bodySm" tone="textMuted">
            {mode === 'lost' ? t('app.cardsLostBody') : t('app.cardsReencodeBody')}
          </Text>
          <Field label={t('app.manualReason')} error={error} hint={t('app.manualReasonHint')}>
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder={mode === 'lost' ? t('app.cardsLostPlaceholder') : t('app.cardsReencodePlaceholder')}
              invalid={Boolean(error)}
              maxLength={200}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
            />
          </Field>
          <Button variant={mode === 'lost' ? 'danger' : 'primary'} label={mode === 'lost' ? t('app.cardsLostConfirm') : t('app.cardsReencodeSend')} loading={busy} onPress={() => void submit()} />
          <Button variant="ghost" label={t('common.cancel')} disabled={busy} onPress={() => (setMode('none'), setError(undefined))} />
        </Card>
      )}

      <Card style={styles.clip}>
        <View style={styles.cardHead}>
          <Text variant="body" weight={500}>
            {t('app.physicalCard')}
          </Text>
          <CardStatusBadge status={card?.status ?? 'NOT_PRINTED'} />
        </View>
        {card && (
          <DetailList
            items={[
              ...(card.nfcUid ? [{ label: t('app.cardsUid'), value: formatUid(card.nfcUid) }] : []),
              ...(card.chipType ? [{ label: t('app.cardsChip'), value: card.chipType }] : []),
              ...(card.batch ? [{ label: t('app.cardsBatch'), value: card.batch.label }] : []),
              ...(card.deliveredAt ? [{ label: t('app.cardsDelivered'), value: `${formatDate(new Date(card.deliveredAt), t.locale)} · ${card.deliveredBy ?? '—'}` }] : []),
            ]}
          />
        )}
      </Card>

      {reencode && (
        <Card style={styles.panel}>
          <View style={styles.row}>
            {reencode.status === 'APPROVED' || reencode.status === 'USED' ? (
              <CircleCheck size={size.iconSm} color={c.successText} strokeWidth={2} />
            ) : (
              <Clock size={size.iconSm} color={c.textMuted} strokeWidth={2} />
            )}
            <Text variant="bodySm" weight={600} style={styles.flex}>
              {t(`app.reencodeStatus.${reencode.status}`)}
            </Text>
          </View>
          <Text variant="bodySm" tone="textMuted">
            {t('app.reencodeAsked', { name: reencode.requestedBy, when: `${formatDate(new Date(reencode.createdAt), t.locale)}, ${formatTime(new Date(reencode.createdAt))}` })}
            {reencode.decisionNote ? ` · “${reencode.decisionNote}”` : ''}
          </Text>
          {grantOpen && (
            <>
              <Text variant="bodySm" tone="textMuted">
                {t('app.reencodeUntil', { time: `${formatDate(new Date(reencode.grantExpiresAt!), t.locale)}, ${formatTime(new Date(reencode.grantExpiresAt!))}` })}
              </Text>
              <Button
                label={t('app.reencodeNow')}
                icon={<PenLine size={size.iconSm} color={c.primaryText} strokeWidth={2} />}
                onPress={() => router.push({ pathname: '/encode/run', params: { lookup: member.nim, grantId: reencode.id } })}
              />
            </>
          )}
        </Card>
      )}

      {mode === 'none' &&
        (canRequest || canReport) && (
          <>
            <SectionLabel>{t('app.cardsActions')}</SectionLabel>
            {canRequest && <Button variant="secondary" label={t('app.cardsReencodeTitle')} onPress={() => setMode('reencode')} />}
            {canReport && <Button variant="secondary" label={t('app.cardsLostTitle')} onPress={() => setMode('lost')} />}
            {canRequest && (
              <Text variant="caption" tone="textMuted">
                {t('app.cardsWhich')}
              </Text>
            )}
          </>
        )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  clip: { overflow: 'hidden' },
  cardHead: { padding: space[4], gap: space[2] },
  panel: { padding: space[4], gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
