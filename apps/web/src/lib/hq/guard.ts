import 'server-only';
import { redirect } from 'next/navigation';
import { getWebUser, type AuthUser } from '../auth/current-user';

/** Dashboard pages and actions: HQ only, otherwise back to /login. */
export async function requireHq(): Promise<AuthUser> {
  const user = await getWebUser();
  if (!user || user.role !== 'SUPER_ADMIN') redirect('/login');
  return user;
}
