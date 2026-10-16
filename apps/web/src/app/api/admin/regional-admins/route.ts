import { z } from 'zod';
import { emailSchema, phoneSchema } from '@pats/shared';
import { requireCrew } from '@/lib/auth/roles';
import { ok, route, readJson } from '@/lib/http/respond';
import { createRegionalAdmin, setRegionalAdminActive } from '@/lib/membership';
export const POST = route(async (req: Request) => {
  const admin = await requireCrew(req);
  const input = z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, phone: phoneSchema, cityId: z.string(), locale: z.enum(['id', 'en']).default('id') }).parse(await readJson(req));
  const user = await createRegionalAdmin(admin, input);
  return ok({ id: user.id });
});
export const PATCH = route(async (req: Request) => {
  const admin = await requireCrew(req);
  const input = z.object({ id: z.string(), active: z.boolean() }).parse(await readJson(req));
  await setRegionalAdminActive(admin, input.id, input.active);
  return ok({ saved: true });
});
