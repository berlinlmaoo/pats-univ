import { toZonedInput, type EventDetailResponse, type EventFormMetaResponse } from '@pats/shared';
import { router, Stack } from 'expo-router';
import { useAuth } from '@/auth';
import { HeaderButton } from '@/components/header-button';
import { LoadError, Loading } from '@/components/load-state';
import { Screen } from '@/components/screen';
import { EventForm, toEventBody } from '@/features/event-form';
import { useT } from '@/i18n';
import { ApiFailure } from '@/lib/api';
import { useApi } from '@/lib/use-api';

export default function NewEventScreen() {
  const t = useT();
  const { call } = useAuth();
  const meta = useApi<EventFormMetaResponse>('/api/admin/event-form');

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerLeft: () => <HeaderButton label={t('common.cancel')} onPress={() => router.back()} /> }} />
      {meta.loading ? (
        <Loading />
      ) : !meta.data ? (
        <LoadError error={meta.error ?? new ApiFailure('INTERNAL')} onRetry={meta.reload} />
      ) : (
        <EventForm
          meta={meta.data}
          submitLabel={t('events.create')}
          initial={{
            title: '',
            description: '',
            venueId: meta.data.venues[0]?.id ?? '',
            date: toZonedInput(new Date(), meta.data.city.timezone).date,
            startTime: '20:00',
            endTime: '02:00',
            opensBeforeMinutes: String(meta.data.opensBeforeMinutes),
            capacity: '',
            publish: true,
          }}
          onSubmit={async (values) => {
            try {
              const res = await call<EventDetailResponse>('POST', '/api/admin/events', toEventBody(values));
              router.dismiss();
              router.push({ pathname: '/city-events/[id]', params: { id: res.event.id } });
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
