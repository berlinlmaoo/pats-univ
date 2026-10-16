import { useState, useRef } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ClipboardList, FileText } from 'lucide-react-native';
import {
  formatCount,
  formatRupiah,
  recapInput,
  type OperationsDto,
  type RecapDto,
  type RedemptionDto,
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
import { size, space } from '@/theme';
import { Choices } from './ui';

const failure = (err: unknown) =>
  errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL');
export function CrewCodesScreen() {
  const t = useT();
  const { call } = useAuth();
  const state = useApi<OperationsDto>('/api/admin/loyalty/operations');
  const [eventId, setEventId] = useState('');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<
    (RedemptionDto & { member: { fullName: string; nim: string } }) | null
  >(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanBusy = useRef(false);
  const event =
    state.data?.events.find((e) => e.id === eventId) ?? state.data?.events[0];
  async function lookup(value = code) {
    if (!event || busy || scanBusy.current) return;
    scanBusy.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setPreview(null);
    setCamera(false);
    try {
      const r = await call<{ redemption: typeof preview }>(
        'POST',
        '/api/admin/loyalty/codes/preview',
        { code: value, eventId: event.id },
      );
      setPreview(r.redemption);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
      scanBusy.current = false;
    }
  }
  async function fulfill() {
    if (!event || !preview) return;
    setBusy(true);
    setError('');
    try {
      await call('POST', '/api/admin/loyalty/codes/fulfill', {
        code: preview.code,
        eventId: event.id,
      });
      setPreview(null);
      setCode('');
      setMessage(t('loyalty.fulfilled'));
    } catch (err) {
      setPreview(null);
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title={t('loyalty.validateReward')}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : (
        <>
          {!state.data?.events.length ? (
            <EmptyState
              icon={ClipboardList}
              title={t('loyalty.emptyOperations')}
              body={t('loyalty.emptyOperationsBody')}
            />
          ) : (
            <Choices
              label={t('loyalty.event')}
              options={state.data.events.map((e) => ({
                id: e.id,
                name: e.title,
              }))}
              value={event?.id ?? ''}
              onChange={(id) => {
                setEventId(id);
                setPreview(null);
              }}
            />
          )}
          {error && <Notice tone="danger" text={t.loose(error)} />}
          {message && <Notice tone="info" text={message} />}
          <Field label={t('loyalty.code')}>
            <Input
              accessibilityLabel={t('loyalty.code')}
              value={code}
              onChangeText={(v) => {
                setCode(v.toUpperCase());
                setPreview(null);
              }}
              autoCapitalize="characters"
              maxLength={6}
            />
          </Field>
          <Button
            label={t('loyalty.lookup')}
            loading={busy}
            disabled={!event || code.length !== 6}
            onPress={() => void lookup()}
          />
          <Button
            label={t('loyalty.scanCode')}
            variant="secondary"
            disabled={!event}
            onPress={() => {
              setCamera(true);
              if (!permission?.granted) void requestPermission();
            }}
          />
          {camera &&
            (permission?.granted ? (
              <View style={styles.camera}>
                <CameraView
                  style={styles.fill}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    if (/^[A-Z0-9]{6}$/.test(data)) {
                      setCode(data);
                      void lookup(data);
                    }
                  }}
                />
              </View>
            ) : (
              <Notice text={t('loyalty.scanPermission')} />
            ))}
          {preview && (
            <Card style={styles.card}>
              <Text variant="title3">{preview.reward.name}</Text>
              <Text>
                {preview.member.fullName} · {preview.member.nim}
              </Text>
              <Text>{preview.code}</Text>
              <Button
                label={t('loyalty.fulfill')}
                loading={busy}
                onPress={() =>
                  Alert.alert(t('loyalty.fulfill'), preview.reward.name, [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.continue'),
                      onPress: () => void fulfill(),
                    },
                  ])
                }
              />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
export function CrewOperationsScreen() {
  const t = useT();
  const state = useApi<OperationsDto>('/api/admin/loyalty/operations');
  const { call } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [eventId, setEventId] = useState('');
  const event =
    state.data?.events.find((e) => e.id === eventId) ?? state.data?.events[0];
  const flag = (m: OperationsDto['members'][number]) =>
    Alert.alert(t('loyalty.promoterFlag'), m.fullName, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t(
          m.isPromoter ? 'loyalty.removePromoter' : 'loyalty.grantPromoter',
        ),
        onPress: () => {
          setBusy(true);
          void call('POST', `/api/admin/loyalty/promoters/${m.id}`, {
            enabled: !m.isPromoter,
          })
            .then(state.reload)
            .catch((err: unknown) => setError(failure(err)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  return (
    <Screen
      title={t('loyalty.operations')}
      subtitle={t('loyalty.operationsBody')}
      refreshing={state.refreshing}
      onRefresh={state.reload}
    >
      {state.loading ? (
        <Loading />
      ) : state.error && !state.data ? (
        <LoadError error={state.error} onRetry={state.reload} />
      ) : (
        state.data && (
          <>
            {error && <Notice tone="danger" text={t.loose(error)} />}
            <Card style={styles.card}>
              {(['members', 'checkIns', 'fulfilled', 'revenue'] as const).map(
                (k) => (
                  <Text key={k}>
                    {t.loose(
                      `loyalty.${k === 'fulfilled' ? 'fulfilledCount' : k}`,
                    )}
                    :{' '}
                    {k === 'revenue'
                      ? formatRupiah(state.data!.stats[k])
                      : formatCount(state.data!.stats[k])}
                  </Text>
                ),
              )}
            </Card>
            <SectionLabel>{t('loyalty.promoter')}</SectionLabel>
            {!state.data.reports.length ? (
              <EmptyState
                icon={FileText}
                title={t('loyalty.emptyReports')}
                body={t('loyalty.emptyReportsBody')}
              />
            ) : (
              state.data.reports.map((r) => (
                <CrewReport
                  key={`${r.id}-${r.status}`}
                  report={r}
                  reload={state.reload}
                />
              ))
            )}
            <SectionLabel>{t('loyalty.recap')}</SectionLabel>
            {state.data.events.length ? (
              <>
                <Choices
                  label={t('loyalty.event')}
                  options={state.data.events.map((e) => ({
                    id: e.id,
                    name: e.title,
                  }))}
                  value={event?.id ?? ''}
                  onChange={setEventId}
                />
                {event && (
                  <CrewRecap
                    key={`${event.id}-${event.recap?.lockedAt}`}
                    eventId={event.id}
                    recap={event.recap}
                    reload={state.reload}
                  />
                )}
              </>
            ) : (
              <EmptyState
                icon={ClipboardList}
                title={t('loyalty.emptyOperations')}
                body={t('loyalty.emptyOperationsBody')}
              />
            )}
            <SectionLabel>{t('loyalty.promoterFlag')}</SectionLabel>
            <Field label={t('loyalty.member')}>
              <Input
                value={memberSearch}
                onChangeText={setMemberSearch}
                accessibilityLabel={t('loyalty.member')}
              />
            </Field>
            {state.data.members
              .filter((m) =>
                `${m.fullName} ${m.nim}`
                  .toLowerCase()
                  .includes(memberSearch.toLowerCase()),
              )
              .slice(0, 20)
              .map((m) => (
                <Card key={m.id} style={styles.card}>
                  <Text>
                    {m.fullName} · {m.nim}
                  </Text>
                  <Button
                    variant="secondary"
                    label={t(
                      m.isPromoter
                        ? 'loyalty.removePromoter'
                        : 'loyalty.grantPromoter',
                    )}
                    onPress={() => flag(m)}
                    disabled={busy}
                  />
                </Card>
              ))}
          </>
        )
      )}
    </Screen>
  );
}
function CrewReport({
  report: r,
  reload,
}: {
  report: ReportDto;
  reload: () => Promise<void>;
}) {
  const t = useT();
  const { call } = useAuth();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function review(action: 'validate' | 'reject' | 'cancel') {
    setBusy(true);
    setError('');
    try {
      await call('POST', `/api/admin/loyalty/reports/${r.id}`, {
        action,
        reason,
      });
      await reload();
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }
  const confirm = (action: 'validate' | 'reject' | 'cancel') =>
    Alert.alert(
      t('loyalty.confirm'),
      action === 'cancel'
        ? t('loyalty.cancelBonusConfirm')
        : action === 'reject'
          ? reason
          : t('loyalty.reviewHint'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.continue'), onPress: () => void review(action) },
      ],
    );
  return (
    <Card style={styles.card}>
      <Text variant="title3">{r.member.fullName}</Text>
      <Text>{r.event.title}</Text>
      <Text tone="textMuted">
        {t.loose(`loyalty.${r.status}`)} · {formatCount(r.guestCount)}{' '}
        {t('loyalty.guestCount')}
      </Text>
      {r.receiptAmount !== null && <Text>{formatRupiah(r.receiptAmount)}</Text>}
      <Text variant="caption" tone="textMuted">
        {t('loyalty.checkIns')}: {formatCount(r.event._count?.checkIns ?? 0)} ·{' '}
        {t('loyalty.attendanceHint')}
      </Text>
      {r.guests?.map((g, i) => (
        <Text variant="caption" key={i}>
          {g.name} · {g.phone}
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
            .catch((err: unknown) => setError(failure(err)));
        }}
      />
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
          {formatRupiah(p.amount)} · {t.loose(`loyalty.${p.status}`)}
        </Text>
      ))}
      {r.rejectReason && <Text tone="dangerText">{r.rejectReason}</Text>}
      {error && <Notice tone="danger" text={t.loose(error)} />}
      {r.status !== 'REJECTED' && (
        <>
          <Field label={t('loyalty.reason')}>
            <Input
              value={reason}
              onChangeText={setReason}
              accessibilityLabel={t('loyalty.reason')}
            />
          </Field>
          {r.status === 'SUBMITTED' ? (
            <>
              <Button
                label={t('loyalty.validate')}
                loading={busy}
                onPress={() => confirm('validate')}
              />
              <Button
                label={t('loyalty.reject')}
                variant="danger"
                disabled={busy || reason.trim().length < 3}
                onPress={() => confirm('reject')}
              />
            </>
          ) : (
            <Button
              label={t('loyalty.cancelBonus')}
              variant="danger"
              disabled={
                busy ||
                reason.trim().length < 3 ||
                r.payouts.some((p) => p.status === 'PAID')
              }
              onPress={() => confirm('cancel')}
            />
          )}
        </>
      )}
    </Card>
  );
}
function CrewRecap({
  eventId,
  recap,
  reload,
}: {
  eventId: string;
  recap: RecapDto | null;
  reload: () => Promise<void>;
}) {
  const t = useT();
  const { call } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const keys = [
    'sofaCount',
    'tableCount',
    'fdcCount',
    'paxCount',
    'revenueSofa',
    'revenueTable',
    'revenueFdc',
  ] as const;
  return (
    <Card style={styles.card}>
      {recap && (
        <Text variant="title3">
          {t('loyalty.total')}: {formatRupiah(recap.total)}
        </Text>
      )}
      {recap?.lockedAt && <Notice text={t('loyalty.locked')} />}
      {keys.map((k) => (
        <Field key={k} label={t(`loyalty.${k}`)}>
          <Input
            accessibilityLabel={t(`loyalty.${k}`)}
            keyboardType="number-pad"
            editable={!recap?.lockedAt}
            value={values[k] ?? String(recap?.[k] ?? 0)}
            onChangeText={(v) => setValues({ ...values, [k]: v })}
          />
        </Field>
      ))}
      <Field label={t('loyalty.note')}>
        <Input
          accessibilityLabel={t('loyalty.note')}
          editable={!recap?.lockedAt}
          value={values.note ?? recap?.note ?? ''}
          onChangeText={(v) => setValues({ ...values, note: v })}
        />
      </Field>
      {error && <Notice tone="danger" text={t.loose(error)} />}
      {!recap?.lockedAt && (
        <Button
          label={t('common.save')}
          loading={busy}
          onPress={async () => {
            const parsed = recapInput.safeParse({
              eventId,
              ...Object.fromEntries(
                keys.map((k) => [k, Number(values[k] ?? recap?.[k] ?? 0)]),
              ),
              note: values.note ?? recap?.note ?? '',
            });
            if (!parsed.success) {
              setError('validation.numberInvalid');
              return;
            }
            setBusy(true);
            setError('');
            try {
              await call('POST', '/api/admin/loyalty/recaps', parsed.data);
              await reload();
            } catch (err) {
              setError(failure(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { padding: space[4], gap: space[3] },
  camera: { height: size.scanFrame, overflow: 'hidden' },
  fill: { flex: 1 },
});
