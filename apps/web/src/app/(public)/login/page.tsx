import { dashboardHome } from '@pats/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getWebUser } from '@/lib/auth/current-user';
import { isDemoOtp } from '@/lib/env';
import { getT } from '@/lib/i18n';
import { LoginFlow } from './login-flow';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('auth.hqTitle') };
}

function safeNext(next: string | string[] | undefined): string | null {
  const value = Array.isArray(next) ? next[0] : next;
  // Only same-site paths; never "//evil.com".
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  const user = await getWebUser();
  // Already signed in with dashboard access (HQ or city admin): straight to the right page.
  const home = user ? dashboardHome(user.role) : null;
  if (home) redirect(next ?? home);
  return <LoginFlow next={next ?? '/'} demo={isDemoOtp()} />;
}
