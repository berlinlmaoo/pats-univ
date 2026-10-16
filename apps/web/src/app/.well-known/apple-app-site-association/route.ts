import { env } from '@/lib/env';

const BUNDLE_ID = 'id.znetworks.patsuniv';

/**
 * iOS universal links for card URLs (PRODUCT.md §10.7): a tapped card opens /c/<token> in the
 * app when it is installed. Needs APPLE_TEAM_ID; until it is set there is nothing to associate.
 */
export function GET() {
  const team = env().APPLE_TEAM_ID;
  if (!team) return new Response('Not configured', { status: 404 });
  const body = {
    applinks: { details: [{ appIDs: [`${team}.${BUNDLE_ID}`], components: [{ '/': '/c/*', comment: 'Member card URLs' }] }] },
  };
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
