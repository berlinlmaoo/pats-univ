import { redirect } from 'next/navigation';
import { getWebUser } from '@/lib/auth/current-user';

/** Root: HQ goes to the dashboard, everyone else to registration. */
export default async function Home() {
  const user = await getWebUser();
  redirect(user?.role === 'SUPER_ADMIN' ? '/overview' : '/join');
}
