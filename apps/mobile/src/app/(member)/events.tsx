import { CalendarDays } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { useT } from '@/i18n';

export default function EventsScreen() {
  const t = useT();
  const { me } = useAuth();
  const city = me?.member?.city.name ?? me?.user.city?.name ?? '';
  return (
    <Screen title={t('app.tabEvents')}>
      <EmptyState icon={CalendarDays} title={t('app.eventsEmptyTitle')} body={t('app.eventsEmptyBody', { city })} />
    </Screen>
  );
}
