import { MessagesSquare } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { useT } from '@/i18n';

export default function HubScreen() {
  const t = useT();
  const { me } = useAuth();
  const city = me?.member?.city.name ?? '';
  return (
    <Screen title={t('app.tabHub')}>
      <EmptyState icon={MessagesSquare} title={t('app.hubEmptyTitle')} body={t('app.hubEmptyBody', { city })} />
    </Screen>
  );
}
