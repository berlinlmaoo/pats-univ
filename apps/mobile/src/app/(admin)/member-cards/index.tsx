import type { CrewCardSearchResponse } from '@pats/shared';
import { router } from 'expo-router';
import { Search, UserX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field, Input } from '@/components/field';
import { ListRow } from '@/components/list-row';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { CardStatusBadge } from '@/features/card-status';
import { useI18n } from '@/i18n';
import { ApiFailure } from '@/lib/api';

/** Find a member to report their card lost or damaged, or to ask HQ for a re-encode. */
export default function MemberCardsSearch() {
  const { t } = useI18n();
  const { call, me } = useAuth();
  const [query, setQuery] = useState('');
  const term = query.trim();
  const [found, setFound] = useState<{ term: string; res: CrewCardSearchResponse } | null>(null);
  const [failed, setFailed] = useState<{ term: string; err: ApiFailure } | null>(null);
  const [nonce, setNonce] = useState(0);
  const results = found?.term === term ? found.res : null;
  const error = failed?.term === term ? failed.err : null;
  const city = me?.user.city?.name ?? '';

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await call<CrewCardSearchResponse>('GET', `/api/admin/cards/members?q=${encodeURIComponent(term)}`);
        if (!cancelled) setFound({ term, res });
      } catch (err) {
        if (!cancelled) setFailed({ term, err: err instanceof ApiFailure ? err : new ApiFailure('INTERNAL') });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [call, term, nonce]);

  return (
    <Screen edges={['bottom']}>
      <Field label={t('app.manualSearch')}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={city ? t('app.manualSearchPlaceholder', { city }) : t('app.cardsSearchPlaceholder')}
          autoFocus
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          accessibilityLabel={t('app.manualSearch')}
        />
      </Field>
      {term.length < 2 ? (
        <EmptyState icon={Search} title={t('app.manualHintTitle')} body={t('app.cardsSearchHint')} />
      ) : error ? (
        <LoadError error={error} onRetry={() => setNonce((n) => n + 1)} />
      ) : !results ? (
        <Loading />
      ) : results.members.length === 0 ? (
        <EmptyState icon={UserX} title={t('app.manualEmptyTitle')} body={t('app.cardsSearchEmpty')} />
      ) : (
        <Card style={styles.clip}>
          {results.members.map((m, i) => (
            <ListRow
              key={m.id}
              first={i === 0}
              leading={<Avatar name={m.fullName} photoUrl={m.photoUrl} />}
              title={m.fullName}
              subtitle={`${m.nim} · ${m.city.name}`}
              trailing={<CardStatusBadge status={m.card?.status ?? 'NOT_PRINTED'} />}
              onPress={() => router.push({ pathname: '/member-cards/[id]', params: { id: m.id } })}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
