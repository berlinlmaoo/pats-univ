import { I18nProvider } from '@/components/i18n/provider';
import { Shell } from '@/components/dashboard/shell';
import { isDemoOtp } from '@/lib/env';
import { requireHq } from '@/lib/hq/guard';
import { getLocale } from '@/lib/i18n';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireHq();
  return (
    <I18nProvider locale={await getLocale()}>
      <Shell user={{ name: user.name, email: user.email }} demo={isDemoOtp()}>
        {children}
      </Shell>
    </I18nProvider>
  );
}
