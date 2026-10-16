import Link from 'next/link';
import { can } from '@pats/shared';
import { requireDashboard } from '@/lib/hq/guard';
import { cityScope } from '@/lib/loyalty/operations';
import { db } from '@/lib/db';
import { getT } from '@/lib/i18n';
import { PageHeader } from '@/components/ui/page-header';
import { PaymentRecords, RegionRequests, FreeCredits } from '@/components/phase5/operations';
import { ClaimQueue } from '@/components/phase5/claims';
export default async function RegionalPage() {
  const admin = await requireDashboard();
  const t = await getT();
  const events = await db.event.findMany({ where: { cityId: cityScope(admin) }, select: { id: true, title: true, cityId: true }, orderBy: { startsAt: 'desc' } });
  const hq = can(admin.role, 'hq.manage');
  const credits = hq ? await db.freeDrawCredit.findMany({ include: { member: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } }) : [];
  return <div className="space-y-6">
    <PageHeader title={t('phase5.operations')} description={t('phase5.paymentHint')} />
    <nav className="flex flex-wrap gap-4"><Link className="text-accent-fg underline" href="/events">{t('nav.events')}</Link><Link className="text-accent-fg underline" href="/recaps">{t('loyalty.recap')}</Link><Link className="text-accent-fg underline" href="/hub">{t('social.title')}</Link></nav>
    <ClaimQueue /><PaymentRecords />
    {hq && <><RegionRequests /><FreeCredits credits={credits.map(c => ({ ...c, expiresAt: c.expiresAt.toISOString(), usedAt: c.usedAt?.toISOString() ?? null }))} events={events} /></>}
  </div>;
}
