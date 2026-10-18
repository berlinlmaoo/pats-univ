import { can } from '@pats/shared';
import type { Metadata } from 'next';
import { RewardsPage } from '@/components/loyalty/rewards';
import { requireDashboard } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('loyalty.title') };
}

export default async function Page() {
  const user = await requireDashboard();
  return <RewardsPage hq={can(user.role, 'hq.manage')} />;
}
