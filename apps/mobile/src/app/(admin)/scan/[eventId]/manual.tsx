import { formatTime, MANUAL_REASON_MIN, type EventDetailResponse, type ManualSearchResponse } from '@pats/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Search, UserX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field, Input } from '@/components/field';
import { HeaderButton } from '@/components/header-button';
import { ListRow } from '@/components/list-row';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { ScanResult, useCheckIn } from '@/features/scan';
import { useI18n } from '@/i18n';
import { ApiFailure } from '@/lib/api';
import { useApi } from '@/lib/use-api';

/** Fallback when there's no QR: find the member by name or NIM; a reason is mandatory and audited. */
export default function ManualCheckInScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { t } = useI18n();
  const { call, me } = useAuth();
  const event = useApi<EventDetailResponse>(`/api/admin/events/${eventId}`);
  const tz = event.data?.event.city.timezone ?? 'Asia/Jakarta';
  const city = event.data?.event.city.name ?? me?.user.city?.name ?? '';
  const { state, preview, confirm, reset } = useCheckIn(eventId);

  const [query, setQuery] = useState('');
  const term = query.trim();
  /** Last answer per search term, so stale responses never show for a newer term. */
  const [found, setFound] = useState<{ term: string; res: ManualSearchResponse } | null>(null);
  const [failed, setFailed] = useState<{ term: string; err: ApiFailure } | null>(null);
  const results = found?.term === term ? found.res : null;
  const searchError = failed?.term === term ? failed.err : null;
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);

  // Debounced search-as-you-type.
  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await call<ManualSearchResponse>('GET', `/api/admin/events/${eventId}/members?q=${encodeURIComponent(term)}`);
        if (!cancelled) setFound({ term, res });
      } catch (err) {
        if (!cancelled) setFailed({ term, err: err instanceof ApiFailure ? err : new ApiFailure('INTERNAL') });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [call, eventId, term, nonce]);

  const backToList = () => {
    reset();
    setReason('');
    setReasonError(undefined);
    setNonce((n) => n + 1);
  };

  const submit = async () => {
    if (reason.trim().length < MANUAL_REASON_MIN) {
      setReasonError(t('validation.reasonRequired'));
      return;
    }
    setReasonError(undefined);
    try {
      await confirm(reason.trim());
    } catch (err) {
      if (err instanceof ApiFailure && err.fields.reason) setReasonError(t.loose(err.fields.reason));
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerLeft: () => <HeaderButton label={t('common.close')} onPress={() => router.back()} /> }} />
      {state.kind !== 'idle' ? (
        <ScanResult
          state={state}
          timeZone={tz}
          nextLabel={state.kind === 'done' ? t('common.close') : t('common.back')}
          onNext={state.kind === 'done' ? () => router.back() : backToList}
          onConfirm={() => void submit()}
          extra={
            <Field label={t('app.manualReason')} error={reasonError} hint={t('app.manualReasonHint')}>
              <Input
                value={reason}
                onChangeText={setReason}
                placeholder={t('app.manualReasonPlaceholder')}
                invalid={Boolean(reasonError)}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
                maxLength={200}
              />
            </Field>
          }
        />
      ) : (
        <>
          <Field label={t('app.manualSearch')}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t('app.manualSearchPlaceholder', { city })}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              accessibilityLabel={t('app.manualSearch')}
            />
          </Field>
          {term.length < 2 ? (
            <EmptyState icon={Search} title={t('app.manualHintTitle')} body={t('app.manualHintBody')} />
          ) : searchError && !results ? (
            <LoadError
              error={searchError}
              onRetry={() => {
                setFailed(null);
                setNonce((n) => n + 1);
              }}
            />
          ) : !results ? (
            <Loading />
          ) : results.members.length === 0 ? (
            <EmptyState icon={UserX} title={t('app.manualEmptyTitle')} body={t('app.manualEmptyBody', { city })} />
          ) : (
            <Card style={styles.clip}>
              {results.members.map((m, i) => (
                <ListRow
                  key={m.id}
                  first={i === 0}
                  leading={<Avatar name={m.fullName} photoUrl={m.photoUrl} />}
                  title={m.fullName}
                  subtitle={m.nim}
                  trailing={
                    m.checkedInAt ? (
                      <Badge dot tone="success" label={t('app.manualCheckedIn', { time: formatTime(new Date(m.checkedInAt), { timeZone: tz, withZone: false }) })} />
                    ) : m.status !== 'ACTIVE' ? (
                      <Badge tone="neutral" label={t('common.inactive')} />
                    ) : undefined
                  }
                  onPress={() => void preview({ method: 'MANUAL', memberId: m.id })}
                />
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
