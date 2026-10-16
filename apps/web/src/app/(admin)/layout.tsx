import { can } from '@pats/shared';
import { I18nProvider } from '@/components/i18n/provider';
import { Shell } from '@/components/dashboard/shell';
import { db } from '@/lib/db';
import { isDemoOtp } from '@/lib/env';
import { requireDashboard } from '@/lib/hq/guard';
import { getLocale } from '@/lib/i18n';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDashboard();
  const pendingRequests = can(user.role, 'hq.manage') ? await db.reencodeRequest.count({ where: { status: 'PENDING' } }) : 0;
  return (
    <I18nProvider locale={await getLocale()}>
      <Shell user={{ name: user.name, email: user.email, regional: !can(user.role, 'hq.manage') }} demo={isDemoOtp()} badges={{ '/cards': pendingRequests }}>
        {children}
      </Shell>
    </I18nProvider>
  );
}
