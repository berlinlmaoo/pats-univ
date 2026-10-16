import { Gift } from 'lucide-react-native';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { useT } from '@/i18n';

export default function RewardsScreen() {
  const t = useT();
  return (
    <Screen title={t('app.tabRewards')}>
      <EmptyState icon={Gift} title={t('app.rewardsEmptyTitle')} body={t('app.rewardsEmptyBody')} />
    </Screen>
  );
}
