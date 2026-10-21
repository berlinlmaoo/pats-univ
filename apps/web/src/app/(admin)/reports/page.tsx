import type { Metadata } from 'next';
import { can } from '@pats/shared';
import { ReportsDashboard } from '@/components/events/reports-dashboard';
import { db } from '@/lib/db';
import { requireDashboard } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('ux.report.dashboardTitle') };
}

/** Event reports over time (22 Oct): HQ sees every city, a regional admin their own. */
export default async function ReportsPage() {
  const admin = await requireDashboard();
  const hq = can(admin.role, 'hq.manage');
  const cities = hq ? await db.city.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [];
  return <ReportsDashboard cities={cities} />;
}
