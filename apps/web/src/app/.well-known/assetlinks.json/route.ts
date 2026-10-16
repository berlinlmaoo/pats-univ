import { env } from '@/lib/env';

const PACKAGE = 'id.znetworks.patsuniv';

/** Android App Links for card URLs. ANDROID_CERT_SHA256 lists the signing certificate fingerprints. */
export function GET() {
  const prints = (env().ANDROID_CERT_SHA256 ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (prints.length === 0) return new Response('Not configured', { status: 404 });
  const body = [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: prints } }];
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
