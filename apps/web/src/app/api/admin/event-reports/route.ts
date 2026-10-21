import { requireCrew } from '@/lib/auth/roles';
import { ok, route } from '@/lib/http/respond';
import { periodFilters } from '@/lib/loyalty/filters';
import { eventReportCsv, eventReportList } from '@/lib/ux/event-report';

/**
 * Event reports over time (HQ: every city; regional: own city). `?cityId=&from=YYYY-MM-DD&to=YYYY-MM-DD`
 * (WIB dates, inclusive). `&format=csv` downloads one row per event.
 */
export const GET = route(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const list = await eventReportList(await requireCrew(req), periodFilters(params));
  if (params.get('format') === 'csv') {
    return new Response(eventReportCsv(list), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pats-event-reports.csv"', 'Cache-Control': 'private, no-store' },
    });
  }
  return ok(list);
});
