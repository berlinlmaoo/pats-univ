import { requireCrew } from '@/lib/auth/roles';
import { searchCardMembers } from '@/lib/cards/crew';
import { ok, route } from '@/lib/http/respond';

/** Members of the admin's city by name or NIM, with their card (lost / damaged / re-encode). */
export const GET = route(async (req: Request) => {
  const admin = await requireCrew(req);
  return ok(await searchCardMembers(admin, new URL(req.url).searchParams.get('q') ?? ''));
});
