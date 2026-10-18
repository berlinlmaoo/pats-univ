/** Team-decision matrix against a dedicated database and real HTTP/Socket.IO servers. */
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import QRCode from 'qrcode';
import { io, type Socket } from 'socket.io-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { addMonths, leaderboardWindow } from '@pats/shared';
import { PrismaClient, type Role } from '../../src/generated/prisma';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_p5_tests')) throw new Error('Use a dedicated *_p5_tests database');
const base = process.env.BASE_URL ?? 'http://localhost:3015';
const prefix = `p5-${randomUUID().slice(0, 8)}`;
const cityIds: string[] = [], userIds: string[] = [], memberIds: string[] = [], eventIds: string[] = [];
const sockets: Socket[] = [];
const results: string[] = [];
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function check(name: string, value: unknown) { if (!value) throw new Error(`FAIL ${name}`); results.push(name); console.log(`PASS ${name}`); }
async function api(path: string, token = '', body?: unknown, method?: string) {
  const response = await fetch(`${base}/api/${path}`, { method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(() => ({})) as Json;
  return { status: response.status, json, code: json.error?.code };
}
async function actor(role: Role, cityId?: string) {
  const user = await db.user.create({ data: { name: `${prefix}-${userIds.length}`, email: `${prefix}-${userIds.length}@patsuniv.test`, phone: '+6281234567890', role, cityId: role === 'REGIONAL_ADMIN' ? cityId : undefined, locale: 'en' } });
  userIds.push(user.id);
  const member = role === 'MEMBER' ? await db.member.create({ data: { userId: user.id, cityId: cityId!, nim: `${prefix}-${memberIds.length}`, fullName: user.name, dateOfBirth: new Date('2000-01-01'), favoriteSong: 'Song', favoriteGenre: 'Pop', consentAt: new Date() } }) : null;
  if (member) memberIds.push(member.id);
  const secret = randomUUID();
  const session = await db.session.create({ data: { userId: user.id, client: 'APP', tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
  await db.session.create({ data: { userId: user.id, client: 'WEB', tokenHash: createHash('sha256').update(secret).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
  const token = await new SignJWT({ sid: session.id, role: role === 'REGIONAL_ADMIN' ? 'LOCAL_ADMIN' : role }).setProtectedHeader({ alg: 'HS256' }).setIssuer('pats-univ').setSubject(user.id).setExpirationTime('1h').sign(new TextEncoder().encode(`${process.env.AUTH_SECRET}:access`));
  return { user, member, token, cookie: `pats_session=${secret}` };
}
async function event(cityId: string, venueId: string, offset = 0) {
  const now = Date.now() + offset;
  const e = await db.event.create({ data: { cityId, venueId, title: `${prefix}-night-${eventIds.length}`, status: 'OPEN', startsAt: new Date(now - 3600000), endsAt: new Date(now + 3600000), checkInOpensAt: new Date(now - 3600000), checkInClosesAt: new Date(now + 3600000), peakStartsAt: new Date(now - 1800000), peakEndsAt: new Date(now + 1800000), drawPrize: 'Bottle prize' } });
  eventIds.push(e.id); return e;
}
async function earn(memberId: string, delta: number, createdAt = new Date(), expiresAt = addMonths(createdAt, 18)) {
  return db.xpLedger.create({ data: { memberId, delta, reason: 'ADJUST', createdAt, expiresAt } });
}
const xp = async (memberId: string) => (await db.xpLedger.aggregate({ where: { memberId }, _sum: { delta: true } }))._sum.delta ?? 0;
async function room(token: string, kind: string, id: string) {
  const socket = io(process.env.REALTIME_PUBLIC_URL!, { auth: { token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(new Error('Socket connect timeout')), 10000).unref(); });
  const joined = await socket.timeout(10000).emitWithAck('join', { kind, id });
  return { socket, joined };
}
async function main() {
  const cities = await Promise.all(['A', 'B'].map(async (suffix) => {
    const c = await db.city.create({ data: { code: `${prefix.slice(-2).replace(/[^a-z]/g, 'x').toUpperCase()}${suffix}`, name: `${prefix}-${suffix}` } }); cityIds.push(c.id); return c;
  }));
  const [a, b] = cities;
  const venue = await db.venue.create({ data: { cityId: a!.id, name: `${prefix}-venue`, minimumCharge: 200000, layout: { slots: [{ code: 'S1', kind: 'SOFA', x: 0, y: 0, w: 1, h: 1, pax: 6, minimumCharge: 300000 }, { code: 'T1', kind: 'TABLE', x: 1, y: 0, w: 1, h: 1, pax: 4 }] } } });
  const otherVenue = await db.venue.create({ data: { cityId: b!.id, name: `${prefix}-other` } });
  const hq = await actor('SUPER_ADMIN'), crew = await actor('REGIONAL_ADMIN', a!.id), otherCrew = await actor('REGIONAL_ADMIN', b!.id);
  const members = [];
  for (let i = 0; i < 9; i++) members.push(await actor('MEMBER', a!.id));
  const m = members[0]!, pr = members[1]!;
  const live = await event(a!.id, venue.id), next = await event(a!.id, venue.id, 86400000), past = await event(a!.id, venue.id, -86400000), elsewhere = await event(b!.id, otherVenue.id);
  const oldRole = await api('me', crew.token);
  check('legacy admin wire role and authoritative capabilities', oldRole.json.user.role === 'LOCAL_ADMIN' && oldRole.json.user.capabilities.includes('dashboard.access'));
  check('HQ wire role remains HQ', (await api('me', hq.token)).json.user.role === 'SUPER_ADMIN');
  const web = await fetch(`${base}/regional`, { headers: { Cookie: crew.cookie } });
  check('regional web dashboard opens', web.status === 200 && !(await web.text()).includes(otherCrew.user.email));
  check('foreign event API is forbidden', (await api(`admin/events/${elsewhere.id}`, crew.token)).status === 403);
  const foreignPage = await fetch(`${base}/events/${elsewhere.id}`, { headers: { Cookie: crew.cookie } });
  const foreignHtml = await foreignPage.text();
  check('foreign event page is hidden', !foreignHtml.includes(elsewhere.title) && (foreignPage.status === 404 || foreignHtml.includes('NEXT_HTTP_ERROR_FALLBACK;404')));
  const scoped = await api('admin/loyalty/operations', crew.token);
  check('regional operation list excludes other cities', scoped.json.events.every((e: Json) => e.id !== elsewhere.id));

  // The KTM photo step: any real 300 px PNG will do.
  const photoRes = await fetch(`${base}/api/join/photo`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(await QRCode.toBuffer(prefix, { width: 300 })) });
  const photo = (await photoRes.json()) as Json;
  check('join photo upload returns a pending key', photoRes.status === 201 && /^photos\/pending\//.test(photo.key));
  const signup = { fullName: `${prefix} Signup`, dateOfBirth: '2000-01-01', cityId: a!.id, favoriteSong: 'Song', favoriteGenre: 'Pop', favoriteDrink: 'Tequila', photoKey: photo.key, email: `${prefix}-signup@patsuniv.test`, phone: '+6281234567891', consent: true, locale: 'en' };
  const otp = await api('join/otp', '', signup);
  check('registration OTP available', otp.status === 200 && otp.json.demoCode);
  const signups = await Promise.all([api('join', '', { ...signup, code: otp.json.demoCode }), api('join', '', { ...signup, code: otp.json.demoCode })]);
  const signed = await db.user.findUniqueOrThrow({ where: { email: signup.email }, include: { member: true } }); userIds.push(signed.id); memberIds.push(signed.member!.id);
  check('concurrent signup awards welcome XP exactly once', signups.filter(r => r.status === 201).length === 1 && await xp(signed.member!.id) === 100 && await db.xpLedger.count({ where: { memberId: signed.member!.id, reason: 'WELCOME' } }) === 1);
  const tooYoung = await api('join/otp', '', { ...signup, email: `${prefix}-young@patsuniv.test`, dateOfBirth: `${new Date().getFullYear() - 17}-01-01` });
  check('minimum age remains 18', tooYoung.code === 'UNDERAGE');

  const pending = await api('social/reserve', m.token, { eventId: live.id, slotCode: 'S1', pax: 2 });
  check('reservation snapshots slot minimum charge', pending.status === 200 && (await db.reservation.findUnique({ where: { id: pending.json.id } }))?.minimumCharge === 300000);
  check('unpaid reservation blocks another event', (await api('social/reserve', m.token, { eventId: next.id, slotCode: 'T1', pax: 2 })).code === 'RESERVATION_LIMIT');
  check('other region cannot confirm', (await api('social/reservation-decision', otherCrew.token, { id: pending.json.id, status: 'CONFIRMED' })).status === 403);
  check('regional admin confirms', (await api('social/reservation-decision', crew.token, { id: pending.json.id, status: 'CONFIRMED' })).status === 200);
  const scan = (who: typeof m) => api('admin/check-in', crew.token, { method: 'MANUAL', eventId: live.id, memberId: who.member!.id, reason: 'Matrix door verification' });
  check('confirmed reservation check-in earns 50 + 25', (await scan(m)).status === 201 && await xp(m.member!.id) === 75);
  await api('social/reserve', pr.token, { eventId: live.id, slotCode: 'T1', pax: 2 });
  check('pending reservation check-in earns base XP only', (await scan(pr)).status === 201 && await xp(pr.member!.id) === 50);
  const dp = await Promise.all([api('admin/payments', crew.token, { kind: 'reservation', id: pending.json.id, amount: 100000 }), api('admin/payments', crew.token, { kind: 'reservation', id: pending.json.id, amount: 100000 })]);
  check('DP is recorded once under concurrent submissions', dp.filter(r => r.status === 200).length === 1 && (await db.reservation.findUniqueOrThrow({ where: { id: pending.json.id } })).downPaymentById === crew.user.id);
  check('recorded DP unblocks next reservation', (await api('social/reserve', m.token, { eventId: next.id, slotCode: 'S1', pax: 2 })).status === 200);
  const racingReservations = await Promise.all([api('social/reserve', members[2]!.token, { eventId: live.id, slotCode: 'T1', pax: 1 }), api('social/reserve', members[2]!.token, { eventId: next.id, slotCode: 'T1', pax: 1 })]);
  check('concurrent unpaid reservations allow exactly one', racingReservations.filter(r => r.status === 200).length === 1);

  await api(`admin/loyalty/promoters/${pr.member!.id}`, crew.token, { enabled: true });
  check('regional appointment sets PR flag', (await db.member.findUniqueOrThrow({ where: { id: pr.member!.id } })).isPromoter);
  check('other region cannot appoint PR', (await api(`admin/loyalty/promoters/${m.member!.id}`, otherCrew.token, { enabled: true })).status === 403);
  check('claims remain closed until event end', (await api('loyalty/claims', m.token, { eventId: live.id, formType: 'MEMBER', reservationCount: 1 })).code === 'CLAIM_NOT_OPEN');
  check('regular members cannot submit PR form', (await api('loyalty/claims', m.token, { eventId: past.id, formType: 'PR', reservationCount: 1 })).status === 403);
  check('regular member GL is disabled by default', (await api('loyalty/claims', m.token, { eventId: past.id, formType: 'MEMBER', guestCount: 1, reservationCount: 1 })).status === 422);
  const claims = await Promise.all([api('loyalty/claims', m.token, { eventId: past.id, formType: 'MEMBER', reservationCount: 2 }), api('loyalty/claims', m.token, { eventId: past.id, formType: 'MEMBER', reservationCount: 2 })]);
  check('duplicate concurrent member claim refused', claims.filter(r => r.status === 201).length === 1 && claims.some(r => r.code === 'CLAIM_EXISTS'));
  const claim = claims.find(r => r.status === 201)!.json;
  check('pending claim can be edited', (await api('loyalty/claims', m.token, { id: claim.id, eventId: past.id, formType: 'MEMBER', reservationCount: 3 }, 'PATCH')).status === 200);
  check('foreign regional queue hides claim', !(await api('admin/loyalty/claims', otherCrew.token)).json.claims.some((c: Json) => c.id === claim.id));
  check('foreign regional approval denied', (await api('admin/loyalty/claims', otherCrew.token, { id: claim.id, decision: 'APPROVED' })).status === 403);
  const personal = await room(m.token, 'wallet', m.member!.id);
  check('member joins own live XP room', personal.joined.ok);
  let updates = 0; personal.socket.on('changed', () => updates++);
  const before = await xp(m.member!.id);
  const approvals = await Promise.all([api('admin/loyalty/claims', crew.token, { id: claim.id, decision: 'APPROVED', reservationCount: 4 }), api('admin/loyalty/claims', hq.token, { id: claim.id, decision: 'APPROVED', reservationCount: 4 })]);
  check('two approvers credit adjusted member XP exactly once', approvals.filter(r => r.status === 200).length === 1 && await xp(m.member!.id) === before + 100 && await db.xpLedger.count({ where: { awardKey: `claim:${claim.id}` } }) === 1);
  check('claim approval sends real Socket.IO update', updates > 0);
  check('approved claim cannot be edited', (await api('loyalty/claims', m.token, { id: claim.id, eventId: past.id, formType: 'MEMBER', reservationCount: 9 }, 'PATCH')).status === 409);
  const prClaim = await api('loyalty/claims', pr.token, { eventId: past.id, formType: 'PR', guestCount: 10, reservationCount: 2 });
  const prBefore = await xp(pr.member!.id);
  check('PR optional proof form submits', prClaim.status === 201);
  await api('admin/loyalty/claims', crew.token, { id: prClaim.json.id, decision: 'APPROVED', guestCount: 3, reservationCount: 4 });
  check('PR adjusted formula is 5×GL + 25×reservations', await xp(pr.member!.id) === prBefore + 115);
  const audit = await db.auditLog.findFirst({ where: { targetId: prClaim.json.id, action: 'claim.decide' } });
  check('decision audit includes original and adjusted counts', (audit?.meta as Json)?.before.guestCount === 10 && (audit?.meta as Json)?.after.guestCount === 3);
  const rejected = await api('loyalty/claims', pr.token, { eventId: past.id, formType: 'MEMBER', reservationCount: 2 });
  const rejectBefore = await xp(pr.member!.id);
  await api('admin/loyalty/claims', crew.token, { id: rejected.json.id, decision: 'REJECTED', reason: 'No matching reservation' });
  const notice = await db.notification.findUnique({ where: { id: `claim:${rejected.json.id}` } });
  check('rejection stores notification and no XP', await xp(pr.member!.id) === rejectBefore && notice?.body.includes('No matching reservation'));
  const deniedRoom = await room(otherCrew.token, 'wallet', m.member!.id);
  check('other users cannot join private XP room', !deniedRoom.joined.ok);

  const earnDate = new Date(Date.now() - 86400000);
  for (const who of members) {
    await earn(who.member!.id, 1000, earnDate);
    if (!await db.checkIn.findUnique({ where: { eventId_memberId: { eventId: live.id, memberId: who.member!.id } } })) await scan(who);
  }
  const outOfPeak = await event(a!.id, venue.id);
  await db.event.update({ where: { id: outOfPeak.id }, data: { peakStartsAt: new Date(Date.now() + 600000), peakEndsAt: new Date(Date.now() + 1200000) } });
  check('outside peak entry refused', (await api('loyalty/spin', m.token, { eventId: outOfPeak.id })).code === 'EVENT_NOT_OPEN');
  const drawRoom = await room(m.token, 'draw', live.id); let drawUpdates = 0; drawRoom.socket.on('changed', () => drawUpdates++);
  check('room audience can join live draw', drawRoom.joined.ok);
  for (const who of members.slice(0, 4)) check(`paid draw entry ${who.member!.id}`, (await api('loyalty/spin', who.token, { eventId: live.id })).status === 201);
  check('same member second slot refused', (await api('loyalty/spin', m.token, { eventId: live.id })).code === 'SPIN_LIMIT');
  const last = await Promise.all(members.slice(4, 6).map(who => api('loyalty/spin', who.token, { eventId: live.id })));
  check('last slot race produces one winner', last.filter(r => r.status === 201).length === 1 && last.some(r => r.code === 'DRAW_FULL'));
  check('sixth slot refused', (await api('loyalty/spin', members[6]!.token, { eventId: live.id })).code === 'DRAW_FULL');
  check('other region cannot run draw', (await api('admin/draw', otherCrew.token, { action: 'run', eventId: live.id })).status === 403);
  const draws = await Promise.all([api('admin/draw', crew.token, { action: 'run', eventId: live.id }), api('admin/draw', hq.token, { action: 'run', eventId: live.id })]);
  const drawAudit = await db.auditLog.findMany({ where: { action: 'draw.run', targetId: live.id } });
  check('draw runs once with audited five entrants and winner', draws.filter(r => r.status === 200).length === 1 && drawAudit.length === 1 && (drawAudit[0]!.meta as Json).entrants.length === 5 && (drawAudit[0]!.meta as Json).winnerEntryId);
  check('draw updates broadcast through Socket.IO', drawUpdates > 0);
  check('every paid entrant keeps its XP debit including non-winners', await db.xpLedger.count({ where: { reason: 'SPIN', refType: 'DrawEntry', delta: -250, memberId: { in: memberIds } } }) === 5);

  const quarter = leaderboardWindow('QUARTERLY', new Date())!;
  const previous = leaderboardWindow('QUARTERLY', new Date(quarter.start.getTime() - 1))!;
  const winner = members[7]!;
  await earn(winner.member!.id, 5000, new Date(previous.start.getTime() + 10000));
  const freeNight = await event(a!.id, venue.id);
  await db.checkIn.create({ data: { memberId: winner.member!.id, eventId: freeNight.id, adminId: crew.user.id, method: 'MANUAL' } });
  await Promise.all([api('cron/loyalty', process.env.CRON_SECRET!, {}), api('cron/loyalty', process.env.CRON_SECRET!, {})]);
  const credits = await db.freeDrawCredit.findMany({ where: { cityId: a!.id, periodStart: previous.start } });
  check('quarterly per-city winner granted once across cron race', credits.length === 1 && credits[0]!.memberId === winner.member!.id && credits[0]!.expiresAt.getTime() === addMonths(previous.end, 3).getTime());
  check('HQ can assign winner to event night', (await api('admin/draw', hq.token, { action: 'assign', creditId: credits[0]!.id, eventId: freeNight.id })).status === 200);
  const freeBefore = await xp(winner.member!.id);
  const freeRace = await Promise.all([api('loyalty/spin', winner.token, { eventId: freeNight.id }), api('loyalty/spin', winner.token, { eventId: freeNight.id })]);
  check('free slot consumed once with no XP debit', freeRace.filter(r => r.status === 201).length === 1 && await xp(winner.member!.id) === freeBefore && (await db.freeDrawCredit.findUniqueOrThrow({ where: { id: credits[0]!.id } })).usedAt);

  const expiryMember = await actor('MEMBER', a!.id);
  const old = addMonths(new Date(), -18); old.setTime(old.getTime() - 60000);
  await earn(expiryMember.member!.id, 100, old);
  await db.xpLedger.create({ data: { memberId: expiryMember.member!.id, delta: -40, reason: 'REDEEM', createdAt: new Date(old.getTime() + 1) } });
  await earn(expiryMember.member!.id, 50);
  const wallets = await Promise.all([api('loyalty/wallet', expiryMember.token), api('loyalty/wallet', expiryMember.token)]);
  check('18-month expiry removes only unspent XP once', wallets.every(r => r.json.balance === 50) && await db.xpLedger.count({ where: { memberId: expiryMember.member!.id, reason: 'EXPIRE', delta: -60 } }) === 1);
  check('app wallet includes expiry schedule and expiry ledger', wallets[0]!.json.expiring.length === 1 && wallets[0]!.json.ledger.some((l: Json) => l.reason === 'EXPIRE'));

  const reward = await db.reward.create({ data: { cityId: a!.id, venueId: venue.id, type: 'DIRECT', name: prefix, xpCost: 100, stock: 2 } });
  const foreignReward = await db.reward.create({ data: { cityId: b!.id, venueId: otherVenue.id, type: 'DIRECT', name: prefix, xpCost: 100, stock: 2 } });
  check('cross-venue redemption denied', (await api('loyalty/redeem', m.token, { eventId: live.id, rewardId: foreignReward.id })).code === 'REWARD_UNAVAILABLE');
  const redeem = await api('loyalty/redeem', m.token, { eventId: live.id, rewardId: reward.id });
  check('venue reward is redeemable', redeem.status === 201);
  await db.redemption.update({ where: { id: redeem.json.redemption.id }, data: { expiresAt: new Date(0) } });
  const refundBefore = await xp(m.member!.id);
  await Promise.all([api('loyalty/wallet', m.token), api('loyalty/wallet', m.token)]);
  check('TTL refund is exact and once under race', await xp(m.member!.id) === refundBefore + 100 && (await db.reward.findUniqueOrThrow({ where: { id: reward.id } })).stock === 2);

  const channel = await db.channel.create({ data: { cityId: a!.id, name: prefix, kind: 'TIMELINE' } });
  check('member timeline posting refused', (await api('social/posts', m.token, { channelId: channel.id, body: 'Member post' })).status === 403);
  check('regional timeline posting refused', (await api('social/posts', crew.token, { channelId: channel.id, body: 'Crew post' })).status === 403);
  const post = await api('social/posts', hq.token, { channelId: channel.id, body: 'HQ timeline' });
  check('HQ timeline posting allowed', post.status === 200);
  const posted = await db.post.findFirstOrThrow({ where: { channelId: channel.id } });
  await Promise.all([api('social/react', m.token, { postId: posted.id, active: true }), api('social/react', m.token, { postId: posted.id, active: true })]);
  check('member timeline reactions are idempotent', await db.postReaction.count({ where: { postId: posted.id } }) === 1);

  const change = await api('me/region-change', m.token, { cityId: b!.id, reason: 'Moving city' });
  check('regional admin cannot approve home-region mutation', (await api('admin/region-change', crew.token, { id: change.json.id, decision: 'APPROVED' })).status === 403);
  const nim = m.member!.nim;
  const card = await db.card.create({ data: { memberId: m.member!.id, status: 'DELIVERED' } });
  await api('admin/region-change', hq.token, { id: change.json.id, decision: 'APPROVED' });
  const moved = await db.member.findUniqueOrThrow({ where: { id: m.member!.id } });
  check('HQ region approval keeps NIM and card', moved.cityId === b!.id && moved.nim === nim && (await db.card.findUniqueOrThrow({ where: { id: card.id } })).memberId === moved.id);
  const back = await api('me/region-change', m.token, { cityId: a!.id, reason: 'Maybe moving back' });
  await api('admin/region-change', hq.token, { id: back.json.id, decision: 'REJECTED', note: 'Not confirmed' });
  check('rejected region change does not mutate city', (await db.member.findUniqueOrThrow({ where: { id: moved.id } })).cityId === b!.id);
  const replacement = await api(`admin/cards/${card.id}/revoke`, otherCrew.token, { reason: 'Lost card' });
  check('replacement requested', replacement.status === 200);
  const newCard = await db.card.findUniqueOrThrow({ where: { replacesCardId: card.id } });
  check('replacement fee defaults to Rp100000 unpaid', newCard.replacementFee === 100000 && newCard.feePaidAt === null);
  await api('admin/payments', otherCrew.token, { kind: 'card', id: newCard.id });
  const paidCard = await db.card.findUniqueOrThrow({ where: { id: newCard.id } });
  check('card fee records who and when', paidCard.feeRecordedById === otherCrew.user.id && paidCard.feePaidAt);
  await db.card.update({ where: { id: newCard.id }, data: { status: 'DELIVERED' } });
  check('repeated replacement has no count limit', (await api(`admin/cards/${newCard.id}/revoke`, otherCrew.token, { reason: 'Damaged replacement' })).status === 200);

  for (let i = 0; i < 3; i++) await actor('REGIONAL_ADMIN', a!.id);
  const adminRace = await Promise.all([0, 1].map(i => api('admin/regional-admins', hq.token, { name: 'New regional crew', email: `${prefix}-new-admin-${i}@patsuniv.test`, phone: '+6281234567890', cityId: a!.id })));
  for (const r of adminRace) if (r.status === 200) userIds.push(r.json.id);
  check('last admin place locked; sixth admin refused', adminRace.filter(r => r.status === 200).length === 1 && adminRace.some(r => r.code === 'ADMIN_LIMIT') && await db.user.count({ where: { role: 'REGIONAL_ADMIN', cityId: a!.id, status: 'ACTIVE' } }) === 5);
  const disabled = await actor('REGIONAL_ADMIN', b!.id);
  await db.user.update({ where: { id: disabled.user.id }, data: { cityId: a!.id, status: 'DISABLED' } });
  check('reactivation cannot bypass admin limit', (await api('admin/regional-admins', hq.token, { id: disabled.user.id, active: true }, 'PATCH')).code === 'ADMIN_LIMIT');
  check('regional admin cannot invite admins', (await api('admin/regional-admins', crew.token, { name: 'Forbidden crew', email: `${prefix}-blocked@patsuniv.test`, phone: '+6281234567890', cityId: a!.id })).status === 403);

  const recap = await api('admin/loyalty/recaps', crew.token, { eventId: past.id, sofaCount: 1, tableCount: 2, fdcCount: 3, paxCount: 12, revenueSofa: 1000, revenueTable: 2000, revenueFdc: 3000, personInCharge: 'Night PIC', accountablePerson: 'Regional lead' });
  check('night recap stores both accountability fields', recap.status === 200 && (await db.trafficRecap.findUniqueOrThrow({ where: { eventId: past.id } })).accountablePerson === 'Regional lead');
  if (process.env.P5_VISUAL === '1') {
    const { chromium } = await import('playwright-core');
    const { mkdir } = await import('node:fs/promises');
    const output = '/tmp/pats-phase5-qa';
    await mkdir(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/Users/berlin/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
    try {
      const context = await browser.newContext();
      await context.addCookies([{ name: 'pats_session', value: crew.cookie.split('=')[1]!, url: base }]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const locale of ['id', 'en']) for (const colorScheme of ['light', 'dark'] as const) for (const width of [360, 1440]) {
        await context.addCookies([{ name: 'pats_locale', value: locale, url: base }]);
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme });
        for (const path of ['/regional', `/events/${live.id}`]) {
          await page.goto(`${base}${path}`);
          await page.waitForTimeout(500);
          const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, keys: /phase5\.[a-zA-Z]+/.test(document.body.innerText) }));
          await page.screenshot({ path: `${output}/${path.startsWith('/events') ? 'draw' : 'claims'}-${locale}-${colorScheme}-${width}.png`, fullPage: true });
          if (metrics.overflow || metrics.keys || errors.length) console.log({ metrics, errors });
          check(`web ${path.startsWith('/events') ? 'draw' : 'claims'} ${locale}/${colorScheme}/${width}`, !metrics.overflow && !metrics.keys && !errors.length);
        }
      }
    } finally { await browser.close(); }
  }
  const leaving = members[8]!;
  check('leaving anonymizes and revokes sessions', (await api('me/leave', leaving.token, {})).status === 200 && (await db.user.findUniqueOrThrow({ where: { id: leaving.user.id } })).email.endsWith('@pats.invalid') && (await api('me', leaving.token)).status === 401);
  check('leaving preserves attendance and ledger records', await db.checkIn.count({ where: { memberId: leaving.member!.id } }) > 0 && await db.xpLedger.count({ where: { memberId: leaving.member!.id } }) > 0);
  console.log(`PHASE5 MATRIX: ${results.length} passed`);
}
async function cleanup() {
  sockets.forEach(s => s.disconnect());
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { targetId: { in: eventIds } }, ...cityIds.map(cityId => ({ action: 'draw.quarterAward', meta: { path: ['cityId'], equals: cityId } }))] } });
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.regionChangeRequest.deleteMany({ where: { memberId: { in: memberIds } } });
  await db.xpClaim.deleteMany({ where: { memberId: { in: memberIds } } });
  await db.drawEntry.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.freeDrawCredit.deleteMany({ where: { cityId: { in: cityIds } } });
  await db.xpLedger.deleteMany({ where: { memberId: { in: memberIds } } });
  await db.redemption.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.reward.deleteMany({ where: { cityId: { in: cityIds } } });
  await db.post.deleteMany({ where: { channel: { cityId: { in: cityIds } } } });
  await db.message.deleteMany({ where: { conversation: { cityId: { in: cityIds } } } });
  await db.conversation.deleteMany({ where: { cityId: { in: cityIds } } });
  await db.reservation.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.checkIn.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.trafficRecap.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.event.deleteMany({ where: { id: { in: eventIds } } });
  await db.channel.deleteMany({ where: { cityId: { in: cityIds } } });
  await db.card.updateMany({ where: { memberId: { in: memberIds } }, data: { replacesCardId: null } });
  await db.card.deleteMany({ where: { memberId: { in: memberIds } } });
  await db.member.deleteMany({ where: { id: { in: memberIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.venue.deleteMany({ where: { cityId: { in: cityIds } } });
  await db.leaderboardSnapshot.deleteMany({ where: { cityId: { in: cityIds } } });
  await db.nimSequence.deleteMany({ where: { cityId: { in: cityIds } } });
  await db.city.deleteMany({ where: { id: { in: cityIds } } });
  await db.otpCode.deleteMany({ where: { email: { startsWith: prefix } } });
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => { await cleanup(); await db.$disconnect(); });
