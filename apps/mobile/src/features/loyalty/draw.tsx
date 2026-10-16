import { useState } from 'react';
import { Alert } from 'react-native';
import { can, formatCount, formatDateTime, type DrawDto } from '@pats/shared';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Loading, LoadError } from '@/components/load-state';
import { Notice } from '@/components/notice';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { space } from '@/theme';
import { useSocialRoom } from '../social/realtime';
import { PrizeWheel } from './wheel';
import { canEnterDraw } from '@pats/shared';
export function LiveDraw({ eventId, changed }: { eventId: string; changed?: () => void }) {
  const t = useT(); const { call, me } = useAuth();
  const state = useApi<DrawDto>(`/api/loyalty/draw?eventId=${encodeURIComponent(eventId)}`, { pollMs: 15000 });
  useSocialRoom({ kind: 'draw', id: eventId }, state.reload);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const admin = can(me?.user.role ?? 'MEMBER', 'draw.manage');
  const d = state.data;
  const winner = d?.entries.find(e => e.id === d.winnerEntryId) ?? null;
  function act() {
    Alert.alert(t('phase5.draw'), t(admin ? 'phase5.drawConfirm' : 'phase5.drawHint'), [
      { text: t('common.cancel'), style: 'cancel' }, { text: t('common.continue'), onPress: () => {
        setBusy(true); setError('');
        void call('POST', admin ? '/api/admin/draw' : '/api/loyalty/spin', { eventId, ...(admin ? { action: 'run' } : {}) })
          .then(async () => { await state.reload(); changed?.(); }).catch((err: unknown) => setError(errorKey(err instanceof ApiFailure ? err.code : 'INTERNAL'))).finally(() => setBusy(false));
      } },
    ]);
  }
  return <Card style={{ padding: space[4], gap: space[3] }}>
    <Text variant="title2">{t('phase5.draw')}</Text>
    {state.loading ? <Loading /> : state.error ? <LoadError error={state.error} onRetry={state.reload} /> : d && <>
      <Text variant="title3">{d.prize ?? t('phase5.notConfigured')}</Text>
      <Text variant="caption" tone="textMuted">{t('phase5.drawHint')}</Text>
      {d.peakStartsAt && <Text variant="caption">{formatDateTime(new Date(d.peakStartsAt), t.locale)} — {d.peakEndsAt && formatDateTime(new Date(d.peakEndsAt), t.locale)}</Text>}
      <Text>{formatCount(d.entries.length)} / {formatCount(d.capacity)} · {formatCount(d.costXp)} XP</Text>
      {d.freeCredit && <Notice text={t('phase5.drawFree')} />}
      <PrizeWheel rewards={d.entries} winner={winner} running={busy} />
      {!d.entries.length && <Text tone="textMuted">{t('phase5.drawEmpty')}</Text>}
      {d.entries.map(e => <Text key={e.id} weight={e.id === d.winnerEntryId ? 700 : 400}>{formatCount(e.position)}. {e.name}</Text>)}
      {winner && <Text variant="title2" accessibilityLiveRegion="polite">{t('phase5.drawWinner', { name: winner.name })}</Text>}
      {!d.startedAt && <Button label={t(admin ? 'phase5.drawRun' : 'phase5.drawEnter')} loading={busy} disabled={!d.prize || (admin ? d.entries.length !== d.capacity : !canEnterDraw(d, new Date()))} onPress={act} />}
    </>}
    {error && <Notice tone="danger" text={t.loose(error)} />}
  </Card>;
}
