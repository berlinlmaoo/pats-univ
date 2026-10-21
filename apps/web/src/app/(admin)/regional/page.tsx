import type { Metadata } from 'next';
import { can } from '@pats/shared';
import { requireDashboard } from '@/lib/hq/guard';
import { cityScope } from '@/lib/loyalty/operations';
import { db } from '@/lib/db';
import { getT } from '@/lib/i18n';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { PaymentRecords, RegionRequests, FreeCredits } from '@/components/phase5/operations';
import { ClaimQueue } from '@/components/phase5/claims';
import { ContentQueue } from '@/components/events/content-queue';
import { PosterProofQueue } from '@/components/events/poster-proof-queue';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('phase5.operations') };
}

type Tab = 'claims' | 'proofs' | 'payments' | 'posters' | 'region' | 'credits';

export default async function RegionalPage({ searchParams }: { searchParams: Promise<{ tab?: string; notice?: string }> }) {
  const admin = await requireDashboard();
  const t = await getT();
  const params = await searchParams;
  const hq = can(admin.role, 'hq.manage');
  const tabs: Tab[] = hq ? ['claims', 'proofs', 'payments', 'posters', 'region', 'credits'] : ['claims', 'proofs', 'payments'];
  const tab: Tab = tabs.includes(params.tab as Tab) ? (params.tab as Tab) : 'claims';
  const cityId = cityScope(admin);
  const [pending, postersPending, proofsPending, events, credits] = await Promise.all([
    db.xpClaim.count({ where: { status: 'PENDING', event: { cityId } } }),
    hq ? db.eventContentSubmission.count({ where: { status: 'PENDING' } }) : 0,
    db.posterProof.count({ where: { status: 'PENDING', event: { cityId } } }),
    tab === 'credits' ? db.event.findMany({ where: { cityId }, select: { id: true, title: true, cityId: true }, orderBy: { startsAt: 'desc' } }) : [],
    tab === 'credits' && hq ? db.freeDrawCredit.findMany({ include: { member: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } }) : [],
  ]);
  const labels: Record<Tab, string> = {
    claims: t('ops.tabClaims'),
    proofs: t('ux.posterProof.queueTitle'),
    payments: t('phase5.payments'),
    posters: t('ux.content.queueTitle'),
    region: t('phase5.regionChange'),
    credits: t('phase5.freeCredits'),
  };
  return (
    <div className="space-y-6">
      {params.notice === 'hq-only' && <Alert tone="info">{t('ops.hqOnly')}</Alert>}
      <PageHeader title={t('phase5.operations')} description={t(hq ? 'ops.regionalBodyHq' : 'ops.regionalBody')} />
      <Tabs
        label={t('phase5.operations')}
        active={tab}
        items={tabs.map((value) => ({ value, label: labels[value], href: `/regional?tab=${value}`, count: value === 'claims' ? pending : value === 'posters' ? postersPending : value === 'proofs' ? proofsPending : undefined }))}
      />
      {tab === 'claims' && <ClaimQueue />}
      {tab === 'proofs' && <PosterProofQueue />}
      {tab === 'payments' && <PaymentRecords />}
      {tab === 'posters' && hq && <ContentQueue />}
      {tab === 'region' && hq && <RegionRequests />}
      {tab === 'credits' && hq && (
        <FreeCredits credits={credits.map((c) => ({ ...c, expiresAt: c.expiresAt.toISOString(), usedAt: c.usedAt?.toISOString() ?? null }))} events={events} />
      )}
    </div>
  );
}
