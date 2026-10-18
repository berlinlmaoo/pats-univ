import 'server-only';
import { can } from '@pats/shared';
import { redirect } from 'next/navigation';
import { getWebUser, type AuthUser } from '../auth/current-user';

export async function requireDashboard(): Promise<AuthUser> {
  const user = await getWebUser();
  if (!user || !can(user.role, 'dashboard.access')) redirect('/login');
  return user;
}
export async function requireHq(): Promise<AuthUser> {
  const user = await requireDashboard();
  if (!can(user.role, 'hq.manage')) redirect('/regional?notice=hq-only');
  return user;
}
