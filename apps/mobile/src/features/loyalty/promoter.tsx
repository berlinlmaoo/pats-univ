import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { claimInput, formatCount, type ClaimDto, type ClaimsDto } from '@pats/shared';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field, Input } from '@/components/field';
import { Loading, LoadError } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { space } from '@/theme';
import { Choices } from './ui';
import { ReceiptCapture } from './receipt-capture';
import { claimFormVisible } from '@pats/shared';
import { useSocialRoom } from '../social/realtime';

export function PromoterScreen() {
  const t = useT();
  const { call, me } = useAuth();
  const state = useApi<ClaimsDto>('/api/loyalty/claims');
  useSocialRoom(me?.member ? { kind: 'wallet', id: me.member.id } : null, state.reload);
  const [eventId, setEventId] = useState(''), [formType, setFormType] = useState<'MEMBER' | 'PR'>('MEMBER');
  const [editing, setEditing] = useState<ClaimDto | null>(null);
  const [pax, setPax] = useState('0'), [reservations, setReservations] = useState('0'), [receipt, setReceipt] = useState(''), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const event = state.data?.events.find(e => e.id === eventId) ?? state.data?.events[0];
  const existing = state.data?.claims.find(c => c.eventId === event?.id && c.formType === formType);
  const clear = () => { setEditing(null); setPax('0'); setReservations('0'); setReceipt(''); setNotes(''); };
  async function save() {
    const parsed = claimInput.safeParse({ eventId: event?.id, formType, guestCount: Number(pax), reservationCount: Number(reservations), receiptUrl: receipt, notes });
    if (!parsed.success || !pax || !reservations) { setError('validation.invalid'); return; }
    setBusy(true); setError(''); setMessage('');
    try { await call(editing ? 'PATCH' : 'POST', '/api/loyalty/claims', { ...parsed.data, ...(editing ? { id: editing.id } : {}) }); clear(); await state.reload(); setMessage(t('phase5.claimPending')); }
    catch (err) { setError(errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL')); }
    finally { setBusy(false); }
  }
  return <Screen title={t('phase5.claimTitle')} subtitle={t('phase5.claimBody')} refreshing={state.refreshing} onRefresh={state.reload}>
    {state.loading ? <Loading /> : state.error ? <LoadError error={state.error} onRetry={state.reload} /> : state.data && <>
      {error && <Notice tone="danger" text={t.loose(error)} />}{message && <Notice text={message} />}
      {state.data.events.length ? <>
        <Choices label={t('loyalty.event')} options={state.data.events.map(e => ({ id: e.id, name: e.title }))} value={event?.id ?? ''} onChange={id => { setEventId(id); clear(); }} />
        {state.data.isPromoter && <Choices label={t('phase5.claimForm')} options={[{ id: 'MEMBER', name: t('phase5.claimMember') }, { id: 'PR', name: t('phase5.claimPr') }]} value={formType} onChange={id => { setFormType(id as 'MEMBER' | 'PR'); clear(); }} />}
        {claimFormVisible(existing, editing?.id) && <Card style={{ padding: space[4], gap: space[3] }}>
          {(formType === 'PR' || state.data.allowMemberGl) && <Field label={t('phase5.guestCount')}><Input accessibilityLabel={t('phase5.guestCount')} value={pax} onChangeText={setPax} keyboardType="number-pad" /></Field>}
          <Field label={t('phase5.reservationCount')}><Input accessibilityLabel={t('phase5.reservationCount')} value={reservations} onChangeText={setReservations} keyboardType="number-pad" /></Field>
          <Field label={t('phase5.reason')}><Input accessibilityLabel={t('phase5.reason')} value={notes} onChangeText={setNotes} multiline /></Field>
          <Text variant="caption">{t('phase5.optionalReceipt')}</Text><ReceiptCapture value={receipt} onChange={setReceipt} />
          <Button label={t(editing ? 'common.save' : 'phase5.claimSubmit')} loading={busy} onPress={() => void save()} />
          {editing && <Button label={t('common.cancel')} variant="secondary" onPress={clear} />}
        </Card>}
      </> : <Notice text={t('loyalty.noPastEvents')} />}
      {!state.data.claims.length && <Notice text={t('phase5.claimEmpty')} />}
      {state.data.claims.map(c => <Card key={c.id} style={{ padding: space[4], gap: space[3] }}>
        <Text variant="title3">{c.event.title}</Text><Text>{t(c.formType === 'PR' ? 'phase5.claimPr' : 'phase5.claimMember')} · {t.loose(`social.${c.status}`)}</Text>
        <Text>{t('phase5.guestCount')}: {formatCount(c.guestCount)} · {t('phase5.reservationCount')}: {formatCount(c.reservationCount)}</Text>
        {c.bonusValue !== null && <Text>{formatCount(c.bonusValue)} XP</Text>}{c.rejectReason && <Text tone="dangerText">{c.rejectReason}</Text>}
        {c.status === 'PENDING' && <Button label={t('common.edit')} variant="secondary" onPress={() => { setEditing(c); setEventId(c.eventId); setFormType(c.formType); setPax(String(c.guestCount)); setReservations(String(c.reservationCount)); setReceipt(c.receiptUrl); setNotes(c.notes); }} />}
      </Card>)}
    </>}
  </Screen>;
}
export function CrewClaimsScreen() {
  const t = useT();
  const state = useApi<{ claims: ClaimDto[] }>('/api/admin/loyalty/claims', { pollMs: 15000 });
  return <Screen title={t('phase5.claimReview')} refreshing={state.refreshing} onRefresh={state.reload}>
    {state.loading ? <Loading /> : state.error ? <LoadError error={state.error} onRetry={state.reload} /> : !state.data?.claims.length ? <Notice text={t('phase5.claimEmpty')} /> : state.data.claims.map(c => <CrewClaim key={`${c.id}:${c.status}`} claim={c} reload={state.reload} />)}
  </Screen>;
}
function CrewClaim({ claim: c, reload }: { claim: ClaimDto; reload: () => Promise<void> }) {
  const t = useT(); const { call } = useAuth();
  const [pax, setPax] = useState(String(c.guestCount)), [reservations, setReservations] = useState(String(c.reservationCount)), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  function decide(decision: 'APPROVED' | 'REJECTED') {
    Alert.alert(t('phase5.claimReview'), decision === 'APPROVED' ? t('phase5.claimApproveConfirm') : reason, [
      { text: t('common.cancel'), style: 'cancel' }, { text: t(decision === 'APPROVED' ? 'phase5.approve' : 'phase5.reject'), onPress: () => {
        setBusy(true); setError(''); void call('POST', '/api/admin/loyalty/claims', { id: c.id, decision, guestCount: Number(pax), reservationCount: Number(reservations), reason })
          .then(reload).catch((err: unknown) => setError(errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL'))).finally(() => setBusy(false));
      } },
    ]);
  }
  return <Card style={{ padding: space[4], gap: space[3] }}>
    <Text variant="title3">{c.member.fullName} · {c.event.title}</Text><Text>{t(c.formType === 'PR' ? 'phase5.claimPr' : 'phase5.claimMember')} · {t.loose(`social.${c.status}`)}</Text>
    {c.notes && <Text>{c.notes}</Text>}
    {c.receiptUrl && <Button variant="secondary" label={t('loyalty.viewReceipt')} onPress={() => { void call<{ url: string }>('GET', `/api/loyalty/claims/${c.id}/receipt?format=json`).then(r => Linking.openURL(r.url)).catch((err: unknown) => setError(errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL'))); }} />}
    {c.status === 'PENDING' ? <>
      <Text variant="caption">{t('phase5.claimAdjustHint')}</Text>
      <Field label={t('phase5.guestCount')}><Input accessibilityLabel={t('phase5.guestCount')} value={pax} onChangeText={setPax} keyboardType="number-pad" /></Field>
      <Field label={t('phase5.reservationCount')}><Input accessibilityLabel={t('phase5.reservationCount')} value={reservations} onChangeText={setReservations} keyboardType="number-pad" /></Field>
      <Field label={t('phase5.reason')}><Input accessibilityLabel={t('phase5.reason')} value={reason} onChangeText={setReason} multiline /></Field>
      <Button loading={busy} disabled={!pax || !reservations} label={t('phase5.approve')} onPress={() => decide('APPROVED')} />
      <Button disabled={busy || reason.trim().length < 3} variant="danger" label={t('phase5.reject')} onPress={() => decide('REJECTED')} />
    </> : <Text>{formatCount(c.bonusValue ?? 0)} XP · {c.rejectReason ?? ''}</Text>}
    {error && <Notice tone="danger" text={t.loose(error)} />}
  </Card>;
}
