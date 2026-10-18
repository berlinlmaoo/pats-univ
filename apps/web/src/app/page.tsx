import { dashboardHome } from '@pats/shared';
import { redirect } from 'next/navigation';
import { getWebUser } from '@/lib/auth/current-user';

/** Root: every dashboard role goes to its own home (HQ overview, city operations); members and visitors to registration. */
export default async function Home() {
  const user = await getWebUser();
  redirect((user && dashboardHome(user.role)) ?? '/join');
}
