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

function safeNext(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  // Only same-site paths; never "//evil.com".
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/overview';
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  const user = await getWebUser();
  if (user?.role === 'SUPER_ADMIN') redirect(next);
  return <LoginFlow next={next} demo={isDemoOtp()} />;
}
