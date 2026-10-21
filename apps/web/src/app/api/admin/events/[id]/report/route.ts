import { requireCrew } from '@/lib/auth/roles';
import { ok, readJson, route } from '@/lib/http/respond';
import { eventReport, saveEventReport } from '@/lib/ux/event-report';

type Ctx = { params: Promise<{ id: string }> };

/** The event report: { report | null, reference (system counts), history, canEdit }. */
export const GET = route(async (req: Request, { params }: Ctx) => ok(await eventReport(await requireCrew(req), (await params).id)));

/** Create or replace the report: all seven integers ≥ 0 required. Audited. */
export const PUT = route(async (req: Request, { params }: Ctx) =>
  ok(await saveEventReport(await requireCrew(req), (await params).id, await readJson(req))),
);
export const POST = PUT;
