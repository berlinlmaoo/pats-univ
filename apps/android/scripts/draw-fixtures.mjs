import fs from 'node:fs';
import { account, request } from './api-demo.mjs';
const fixture = JSON.parse(fs.readFileSync(new URL('../.qa/fixtures.json', import.meta.url)));
const admin = await account('admin.jkt@patsuniv.test');
const call = (method, url, payload) => request(method, url, payload, admin.accessToken);
for (const name of ['bima.pratama', 'citra.maharani', 'dimas.saputra', 'eka.wulandari']) {
  const member = await account(`${name}@patsuniv.test`);
  const user = (method, url, payload) => request(method, url, payload, member.accessToken);
  const me = await user('GET', '/api/me');
  const attendance = await call('GET', `/api/admin/events/${fixture.activeEventId}/attendance`);
  if (!attendance.entries.some(row => row.member.id === me.member.id)) await call('POST', '/api/admin/check-in', { eventId: fixture.activeEventId, method: 'MANUAL', memberId: me.member.id, reason: 'Native Android full draw demo fixture' });
  let draw = await user('GET', `/api/loyalty/draw?eventId=${fixture.activeEventId}`);
  if (draw.ownEntryId || draw.startedAt) continue;
  const wallet = await user('GET', '/api/loyalty/wallet');
  if (wallet.balance < draw.costXp && !draw.freeCredit) {
    const claims = await user('GET', '/api/loyalty/claims');
    let claim = claims.claims.find(row => row.eventId === fixture.pastEventId && row.formType === 'MEMBER');
    const reservations = Math.ceil((draw.costXp - wallet.balance) / 25);
    if (!claim) { await user('POST', '/api/loyalty/claims', { eventId: fixture.pastEventId, formType: 'MEMBER', guestCount: 0, reservationCount: reservations, notes: 'Native Android full draw demo fixture', receiptUrl: '' }); claim = (await user('GET', '/api/loyalty/claims')).claims.find(row => row.eventId === fixture.pastEventId && row.formType === 'MEMBER'); }
    if (claim.status === 'PENDING') await call('POST', '/api/admin/loyalty/claims', { id: claim.id, decision: 'APPROVED', guestCount: 0, reservationCount: reservations, reason: 'Native Android full draw demo fixture' });
  }
  await user('POST', '/api/loyalty/spin', { eventId: fixture.activeEventId });
  console.log(`${me.member.fullName}: server draw entry created`);
}
const draw = await call('GET', `/api/loyalty/draw?eventId=${fixture.activeEventId}`);
console.log(draw.entries.map(row => `${row.position}. ${row.name}`).join('\n'));
