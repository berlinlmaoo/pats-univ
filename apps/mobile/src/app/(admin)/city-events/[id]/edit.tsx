import type { EventFormMetaResponse, EventSummary } from '@pats/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth';
import { HeaderButton } from '@/components/header-button';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { EventForm, toEventBody } from '@/features/event-form';
import { useT } from '@/i18n';
import { ApiFailure } from '@/lib/api';
import { useApi } from '@/lib/use-api';

interface AdminEventResponse {
  event: EventSummary;
  form: {
    title: string;
    description: string;
    venueId: string;
    date: string;
    startTime: string;
    endTime: string;
    opensBeforeMinutes: number;
    capacity: number | null;
    publish: boolean;
  };
}

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { call } = useAuth();
  const meta = useApi<EventFormMetaResponse>('/api/admin/event-form');
  const current = useApi<AdminEventResponse>(`/api/admin/events/${id}`);
  const failed = meta.error ?? current.error;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerLeft: () => <HeaderButton label={t('common.cancel')} onPress={() => router.back()} /> }} />
      {meta.loading || current.loading ? (
        <Loading />
      ) : !meta.data || !current.data ? (
        <LoadError
          error={failed ?? new ApiFailure('INTERNAL')}
          onRetry={() => {
            void meta.reload();
            void current.reload();
          }}
        />
      ) : (
        <EventForm
          meta={meta.data}
          submitLabel={t('common.saveChanges')}
          initial={{
            ...current.data.form,
            opensBeforeMinutes: String(current.data.form.opensBeforeMinutes),
            capacity: current.data.form.capacity ? String(current.data.form.capacity) : '',
          }}
          onSubmit={async (values) => {
            try {
              await call('PATCH', `/api/admin/events/${id}`, toEventBody(values));
              router.back();
              return null;
            } catch (err) {
              return err instanceof ApiFailure ? err : new ApiFailure('INTERNAL');
            }
          }}
        />
      )}
    </Screen>
  );
}
