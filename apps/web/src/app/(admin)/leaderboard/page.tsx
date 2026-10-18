import type { Metadata } from 'next';
import { LeaderboardPage } from '@/components/loyalty/leaderboard';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('loyalty.leaderboard') };
}

/** HQ only, like the nav (regional admins see their city's numbers on /regional). */
export default async function Page() {
  await requireHq();
  return <LeaderboardPage />;
}
