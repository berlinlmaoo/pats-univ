import { useState } from 'react';
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
import { Choices } from './loyalty/ui';
export function RegionChangeScreen() {
  const t = useT(); const { call } = useAuth();
  const state = useApi<{ cities: { id: string; name: string }[]; requests: { id: string; status: string; decisionNote: string | null; toCity: { name: string } }[] }>('/api/me/region-change');
  const [cityId, setCityId] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <Screen title={t('phase5.regionChange')} subtitle={t('phase5.regionHint')} refreshing={state.refreshing} onRefresh={state.reload}>
    {state.loading ? <Loading /> : state.error ? <LoadError error={state.error} onRetry={state.reload} /> : state.data && <>
      {error && <Notice tone="danger" text={t.loose(error)} />}
      <Choices label={t('app.city')} options={state.data.cities} value={cityId} onChange={setCityId} />
      <Field label={t('phase5.reason')}><Input accessibilityLabel={t('phase5.reason')} value={reason} onChangeText={setReason} multiline /></Field>
      <Button loading={busy} disabled={!cityId || reason.trim().length < 3 || state.data.requests.some(r => r.status === 'PENDING')} label={t('common.save')} onPress={() => {
        setBusy(true); setError(''); void call('POST', '/api/me/region-change', { cityId, reason }).then(state.reload).catch((err: unknown) => setError(errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL'))).finally(() => setBusy(false));
      }} />
      {!state.data.requests.length && <Notice text={t('phase5.regionEmpty')} />}
      {state.data.requests.map(r => <Card key={r.id} style={{ padding: space[4], gap: space[3] }}><Text>{r.toCity.name} · {t.loose(`social.${r.status}`)}</Text>{r.decisionNote && <Text>{r.decisionNote}</Text>}</Card>)}
    </>}
  </Screen>;
}
