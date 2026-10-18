import { account, request } from './api-demo.mjs';
import { adb, dump, nodes, sleep, screenshot, tap } from './device.mjs';
import { route } from './screenshots.mjs';
const admin = await account('admin.jkt@patsuniv.test');
const result = await request('GET', '/api/admin/cards/members?q=Bima', undefined, admin.accessToken);
const id = result.members[0].id;
const operations = await request('GET', '/api/admin/loyalty/operations', undefined, admin.accessToken);
const original = operations.members.find(member => member.id === id).isPromoter;
await route('claims');
try {
  await request('POST', `/api/admin/loyalty/promoters/${id}`, { enabled: true }, admin.accessToken);
  adb('shell', 'input', 'swipe', '640', '600', '640', '1600', '500'); await sleep(1500);
  const copy = nodes(dump()).filter(n => n.text).map(n => n.text);
  screenshot('4-pull-refreshed-pr'); console.log(copy);
  if (!copy.includes('Claim form') && !copy.includes('Form klaim')) throw Error('Pull refresh did not load PR form choices');
  await tap(copy.includes('Member form') ? 'Member form' : 'Form member'); await tap(copy.includes('Member form') ? 'PR form' : 'Form PR'); screenshot('4-pr-claim-form');
} finally {
  await request('POST', `/api/admin/loyalty/promoters/${id}`, { enabled: original }, admin.accessToken);
  adb('shell', 'input', 'swipe', '640', '600', '640', '1600', '500'); await sleep(700);
}
