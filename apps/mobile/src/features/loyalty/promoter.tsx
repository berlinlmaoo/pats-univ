import { useState } from 'react';
import { Linking } from 'react-native';
import { FileText } from 'lucide-react-native';
import {
  formatCount,
  formatRupiah,
  promoterInput,
  type ReportDto,
} from '@pats/shared';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field, Input } from '@/components/field';
import { Loading, LoadError } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { space } from '@/theme';
import { Choices } from './ui';
import { ReceiptCapture } from './receipt-capture';

export function PromoterScreen() {
  const t = useT();
  const { call } = useAuth();
  const state = useApi<{
    reports: ReportDto[];
    events: { id: string; title: string }[];
  }>('/api/loyalty/reports');
  const [eventId, setEventId] = useState('');
  const [editing, setEditing] = useState<ReportDto | null>(null);
  const [guestCount, setGuestCount] = useState('');
  const [guests, setGuests] = useState('');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const selected =
    state.data?.events.find((e) => e.id === eventId) ?? state.data?.events[0];
  const existing = state.data?.reports.find((r) => r.eventId === selected?.id);
  function edit(r: ReportDto) {
    setEditing(r);
    setEventId(r.eventId);
    setGuestCount(String(r.guestCount));
    setAmount(r.receiptAmount === null ? '' : String(r.receiptAmount));
    setReceipt(r.receiptUrl);
    setGuests(
      r.guests?.map((g) => `${g.name ?? ''}|${g.phone ?? ''}`).join('\n') ?? '',
    );
    setError('');
  }
  async function submit() {
    if (!selected) return;
    const parsed = promoterInput.safeParse({
      eventId: selected.id,
      guestCount: guestCount === '' ? undefined : Number(guestCount),
      receiptAmount: amount === '' ? null : Number(amount),
      receiptUrl: receipt,
      guests: guests.trim()
        ? guests
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const [name, phone] = line.split('|');
              return { name: name?.trim(), phone: phone?.trim() };
            })
        : [],
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues.some((i) => i.path[0] === 'receiptUrl')
          ? 'loyalty.invalidReceipt'
          : 'validation.invalid',
      );
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await call('POST', '/api/loyalty/reports', parsed.data);
      await state.reload();
      setEditing(null);
      setGuestCount('');
      setGuests('');
      setAmount('');
      setReceipt('');
      setMessage(t('loyalty.saved'));
    } catch (err) {
      setError(errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title={t('loyalty.promoter')}
      subtitle={t('loyalty.promoterBody')}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : (
        state.data && (
          <>
            {error && <Notice tone="danger" text={t.loose(error)} />}
            {message && <Notice tone="info" text={message} />}
            {!state.data.events.length ? (
              <Notice text={t('loyalty.noPastEvents')} />
            ) : (
              <>
                <Choices
                  label={t('loyalty.event')}
                  options={state.data.events.map((e) => ({
                    id: e.id,
                    name: e.title,
                  }))}
                  value={selected?.id ?? ''}
                  onChange={(id) => {
                    setEventId(id);
                    setEditing(null);
                    setReceipt('');
                    setGuestCount('');
                    setAmount('');
                    setGuests('');
                  }}
                />
                {(!existing || editing) && existing?.status !== 'VALIDATED' && (
                  <Card style={{ padding: space[4], gap: space[3] }}>
                    <Field label={t('loyalty.guestCount')}>
                      <Input
                        accessibilityLabel={t('loyalty.guestCount')}
                        keyboardType="number-pad"
                        value={guestCount}
                        onChangeText={setGuestCount}
                      />
                    </Field>
                    <Field label={t('loyalty.guests')}>
                      <Input
                        accessibilityLabel={t('loyalty.guests')}
                        value={guests}
                        onChangeText={setGuests}
                      />
                    </Field>
                    <Field label={t('loyalty.receiptAmount')}>
                      <Input
                        accessibilityLabel={t('loyalty.receiptAmount')}
                        keyboardType="number-pad"
                        value={amount}
                        onChangeText={setAmount}
                      />
                    </Field>
                    <ReceiptCapture value={receipt} onChange={setReceipt} />
                    <Text variant="caption" tone="textMuted">
                      {t('loyalty.receiptPrivate')}
                    </Text>
                    <Button
                      label={t(
                        editing ? 'loyalty.resubmit' : 'loyalty.submitReport',
                      )}
                      onPress={() => void submit()}
                      loading={busy}
                      disabled={!receipt}
                    />
                  </Card>
                )}
              </>
            )}
            <SectionLabel>{t('loyalty.promoter')}</SectionLabel>
            {!state.data.reports.length ? (
              <EmptyState
                icon={FileText}
                title={t('loyalty.emptyReports')}
                body={t('loyalty.promoterBody')}
              />
            ) : (
              state.data.reports.map((r) => (
                <Card key={r.id} style={{ padding: space[4], gap: space[3] }}>
                  <Text variant="title3">{r.event.title}</Text>
                  <Text>
                    {t.loose(`loyalty.${r.status}`)} ·{' '}
                    {formatCount(r.guestCount)}
                  </Text>
                  {r.rejectReason && (
                    <Text tone="dangerText">{r.rejectReason}</Text>
                  )}
                  {r.bonusKind && (
                    <Text>
                      {t('loyalty.bonus')}:{' '}
                      {r.bonusKind === 'CASH'
                        ? formatRupiah(r.bonusValue ?? 0)
                        : `${formatCount(r.bonusValue ?? 0)} XP`}
                    </Text>
                  )}
                  {r.payouts.map((p) => (
                    <Text key={p.id} variant="caption">
                      {formatRupiah(p.amount)} ·{' '}
                      {t.loose(`loyalty.${p.status}`)}
                    </Text>
                  ))}
                  <Button
                    label={t('loyalty.viewReceipt')}
                    variant="secondary"
                    onPress={() => {
                      void call<{ url: string }>(
                        'GET',
                        `/api/loyalty/receipts/${r.id}?format=json`,
                      )
                        .then((v) => Linking.openURL(v.url))
                        .catch((err: unknown) =>
                          setError(
                            errorKey(
                              err instanceof ApiFailure ? err.code : 'INTERNAL',
                            ),
                          ),
                        );
                    }}
                  />
                  {r.status !== 'VALIDATED' && (
                    <Button
                      label={t(
                        r.status === 'REJECTED'
                          ? 'loyalty.resubmit'
                          : 'loyalty.editReport',
                      )}
                      variant="secondary"
                      onPress={() => edit(r)}
                    />
                  )}
                </Card>
              ))
            )}
          </>
        )
      )}
    </Screen>
  );
}
