/**
 * Phase 1 interaction matrix, run against a live server (PLAN.md §4 Phase 1 demo):
 *   pnpm --filter @pats/web e2e:checkin            (BASE_URL defaults to http://localhost:3000)
 * Needs OTP_PROVIDER=demo and the seed data. Each run creates its own Jakarta event, so it can be
 * re-run; it takes about a minute because one case waits for a QR to expire for real.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toZonedInput } from '@pats/shared';
import { PrismaClient } from '../../src/generated/prisma';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const CACHE = join(tmpdir(), 'pats-checkin-matrix.json');

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const results: { name: string; pass: boolean; detail: string }[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
}

async function api(path: string, opts: { token?: string; method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json, code: json?.error?.code as string | undefined };
}

/** App login through the demo OTP, reusing refresh tokens between runs (the OTP has a resend cooldown). */
async function login(email: string): Promise<string> {
  const cache: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  if (cache[email]) {
    const r = await api('/api/auth/refresh', { body: { refreshToken: cache[email] } });
    if (r.status === 200) {
      cache[email] = r.json.refreshToken;
      writeFileSync(CACHE, JSON.stringify(cache));
      return r.json.accessToken;
    }
  }
  const req = await api('/api/auth/otp/request', { body: { email, audience: 'app' } });
  if (!req.json.demoCode) throw new Error(`No demo code for ${email}: ${JSON.stringify(req.json)}`);
  const ver = await api('/api/auth/otp/verify', { body: { email, code: req.json.demoCode } });
  if (ver.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(ver.json)}`);
  cache[email] = ver.json.refreshToken;
  writeFileSync(CACHE, JSON.stringify(cache));
  return ver.json.accessToken;
}

const qr = async (token: string) => (await api('/api/me/card-token', { token })).json.token as string;

async function main() {
  // One at a time: logins share the token cache file.
  const admin = await login('admin.jkt@patsuniv.test');
  const adminBdg = await login('admin.bdg@patsuniv.test');
  const rara = await login('rara.anindya@patsuniv.test');
  const bima = await login('bima.pratama@patsuniv.test');
  const joko = await login('joko.santoso@patsuniv.test');
  const citraEmail = 'citra.maharani@patsuniv.test';
  const citra = await login(citraEmail);

  // A fresh Jakarta event, on now, created and opened by the city admin through the app API.
  const now = new Date();
  const start = toZonedInput(new Date(now.getTime() - 30 * 60_000), 'Asia/Jakarta');
  const end = toZonedInput(new Date(now.getTime() + 3 * 60 * 60_000), 'Asia/Jakarta');
  const created = await api('/api/admin/events', {
    token: admin,
    body: { title: `Matrix ${now.toISOString().slice(11, 19)}`, date: start.date, startTime: start.time, endTime: end.time, opensBeforeMinutes: 60, publish: true },
  });
  check('admin creates an event', created.status === 201 && created.json.event.phase === 'upcoming', `${created.status} ${created.json.event?.phase}`);
  const eventId = created.json.event.id as string;

  const ttl = (await api('/api/me/card-token', { token: rara })).json.ttlSeconds as number;
  const early = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: await qr(rara) } });
  check('scan before check-in opens is refused', early.code === 'EVENT_NOT_OPEN', `${early.status} ${early.code}`);

  const opened = await api(`/api/admin/events/${eventId}/actions`, { token: admin, body: { action: 'open' } });
  check('admin opens check-in', opened.json.event?.phase === 'open', `${opened.status} ${opened.json.event?.phase}`);

  // Happy path: QR -> preview (nothing recorded) -> confirm.
  const raraQr = await qr(rara);
  const p1 = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: raraQr } });
  check('preview identifies the member', p1.status === 200 && p1.json.member?.nim?.startsWith('JKT') && p1.json.ticket && !p1.json.issue, `${p1.status} ${p1.json.member?.fullName}`);
  const before = await db.checkIn.count({ where: { eventId } });
  check('preview records nothing', before === 0, `${before} check-ins`);
  const c1 = await api('/api/admin/check-in', { token: admin, body: { eventId, method: 'APP_QR', ticket: p1.json.ticket } });
  check('confirm records the check-in', c1.status === 201 && c1.json.count === 1 && c1.json.checkIn.method === 'APP_QR', `${c1.status} count=${c1.json.count}`);
  const xp = await db.xpLedger.findFirst({ where: { refType: 'CheckIn', refId: c1.json.checkIn?.id } });
  check('XP ledger entry written (hidden until Phase 3)', xp?.delta === 50 && xp.reason === 'CHECK_IN', `delta=${xp?.delta}`);
  const history = await api('/api/me/check-ins', { token: rara });
  check('member history shows it', history.json.checkIns?.[0]?.event?.id === eventId, `${history.json.checkIns?.length} entries`);

  // Replay and double check-in.
  const replay = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: raraQr } });
  check('replay of a used QR is refused', replay.code === 'QR_USED', `${replay.status} ${replay.code}`);
  const ticketReplay = await api('/api/admin/check-in', { token: admin, body: { eventId, method: 'APP_QR', ticket: p1.json.ticket } });
  check('replay of a used confirm ticket is refused', ticketReplay.code === 'QR_USED', `${ticketReplay.status} ${ticketReplay.code}`);
  const again = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: await qr(rara) } });
  check('second scan with a fresh QR shows "already checked in"', again.json.issue?.code === 'ALREADY_CHECKED_IN' && !again.json.ticket, `${again.status} ${again.json.issue?.code} by ${again.json.issue?.byAdmin}`);
  const raraId = p1.json.member.id as string;
  const manualDouble = await api('/api/admin/check-in', { token: admin, body: { eventId, method: 'MANUAL', memberId: raraId, reason: 'test' } });
  check('second check-in by name is refused', manualDouble.code === 'ALREADY_CHECKED_IN', `${manualDouble.status} ${manualDouble.code}`);

  // Two crew phones confirming the same member at once: exactly one wins.
  const [qa, qb] = [await qr(bima), await qr(bima)];
  const [pa, pb] = await Promise.all([
    api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: qa } }),
    api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: qb } }),
  ]);
  const race = await Promise.all([
    api('/api/admin/check-in', { token: admin, body: { eventId, method: 'APP_QR', ticket: pa.json.ticket } }),
    api('/api/admin/check-in', { token: admin, body: { eventId, method: 'APP_QR', ticket: pb.json.ticket } }),
  ]);
  const statuses = race.map((r) => r.status).sort();
  check('simultaneous double check-in: one recorded, one refused', statuses[0] === 201 && statuses[1] === 409, race.map((r) => `${r.status} ${r.code ?? ''}`).join(', '));

  // Tampered and foreign codes.
  const parts = (await qr(rara)).split('.');
  const forged = [parts[0], parts[1], parts[2], 'zzzzzz', parts[4]].join('.');
  const bad = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: forged } });
  check('QR with a pushed-out expiry is refused', bad.code === 'QR_INVALID', `${bad.status} ${bad.code}`);
  const foreign = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: 'https://example.com/promo' } });
  check('a non-PATS QR is refused', foreign.code === 'QR_INVALID', `${foreign.status} ${foreign.code}`);

  // Wrong city: a Bandung admin on a Jakarta event, a Bandung member at a Jakarta event.
  const wrongAdmin = await api('/api/admin/check-in/preview', { token: adminBdg, body: { eventId, method: 'APP_QR', token: await qr(joko) } });
  check('wrong-city admin cannot scan', wrongAdmin.code === 'FORBIDDEN', `${wrongAdmin.status} ${wrongAdmin.code}`);
  const wrongEvent = await api(`/api/admin/events/${eventId}/attendance`, { token: adminBdg });
  check('wrong-city admin cannot read attendance', wrongEvent.code === 'FORBIDDEN', `${wrongEvent.status} ${wrongEvent.code}`);
  const stolenTicket = await api('/api/admin/check-in', { token: adminBdg, body: { eventId, method: 'APP_QR', ticket: pa.json.ticket } });
  check('a ticket only works for the admin it was issued to', stolenTicket.code === 'FORBIDDEN', `${stolenTicket.status} ${stolenTicket.code}`);
  const otherCity = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: await qr(joko) } });
  check('member from another city without roaming is refused', otherCity.json.issue?.code === 'MEMBER_OTHER_CITY', `${otherCity.status} ${otherCity.json.issue?.code}`);
  const memberAsAdmin = await api('/api/admin/check-in/preview', { token: rara, body: { eventId, method: 'APP_QR', token: await qr(bima) } });
  check('a member cannot use crew endpoints', memberAsAdmin.code === 'FORBIDDEN', `${memberAsAdmin.status} ${memberAsAdmin.code}`);

  // Deactivated member: same steps as the dashboard (status off + every session revoked).
  const citraQr = await qr(citra);
  const citraMember = await db.member.findFirstOrThrow({ where: { user: { email: citraEmail } } });
  await db.member.update({ where: { id: citraMember.id }, data: { status: 'INACTIVE', user: { update: { status: 'DISABLED' } } } });
  await db.session.updateMany({ where: { userId: citraMember.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  const inactive = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: citraQr } });
  check('deactivated member: a QR shown before is refused', inactive.json.issue?.code === 'MEMBER_INACTIVE' && !inactive.json.ticket, `${inactive.status} ${inactive.json.issue?.code}`);
  const inactiveManual = await api('/api/admin/check-in', { token: admin, body: { eventId, method: 'MANUAL', memberId: citraMember.id, reason: 'forgot phone' } });
  check('deactivated member: check-in by name is refused', inactiveManual.code === 'MEMBER_INACTIVE', `${inactiveManual.status} ${inactiveManual.code}`);
  const inactiveToken = await api('/api/me/card-token', { token: citra });
  check('deactivated member: app gets no new QR', inactiveToken.status === 401, `${inactiveToken.status} ${inactiveToken.code}`);
  await db.member.update({ where: { id: citraMember.id }, data: { status: 'ACTIVE', user: { update: { status: 'ACTIVE' } } } });

  // Manual check-in: reason required, audited.
  const noReason = await api('/api/admin/check-in', { token: admin, body: { eventId, method: 'MANUAL', memberId: citraMember.id, reason: ' ' } });
  check('manual check-in without a reason is refused', noReason.status === 422 && noReason.json.error?.fields?.reason === 'validation.reasonRequired', `${noReason.status} ${JSON.stringify(noReason.json.error?.fields)}`);
  const search = await api(`/api/admin/events/${eventId}/members?q=citra`, { token: admin });
  check('manual search finds the member', search.json.members?.[0]?.id === citraMember.id, `${search.json.members?.length} found`);
  const manual = await api('/api/admin/check-in', { token: admin, body: { eventId, method: 'MANUAL', memberId: citraMember.id, reason: 'Phone battery dead' } });
  const auditRow = await db.auditLog.findFirst({ where: { action: 'checkin.manual', targetId: manual.json.checkIn?.id } });
  check('manual check-in recorded with reason + audit log', manual.status === 201 && manual.json.checkIn.manualReason === 'Phone battery dead' && Boolean(auditRow), `${manual.status} audit=${Boolean(auditRow)}`);

  // Attendance feed.
  const feed = await api(`/api/admin/events/${eventId}/attendance`, { token: admin });
  check('attendance feed counts by method', feed.json.count === 3 && feed.json.byMethod.APP_QR === 2 && feed.json.byMethod.MANUAL === 1, JSON.stringify(feed.json.byMethod));

  // Closing stops scans; reopening resumes.
  await api(`/api/admin/events/${eventId}/actions`, { token: admin, body: { action: 'close' } });
  const closed = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: await qr(joko) } });
  check('scan after closing is refused', closed.code === 'EVENT_NOT_OPEN', `${closed.status} ${closed.code}`);
  await api(`/api/admin/events/${eventId}/actions`, { token: admin, body: { action: 'open' } });

  // Expiry: a screenshot of the QR is useless once its TTL has passed.
  const old = await qr(bima);
  console.log(`      waiting ${ttl + 1}s for a QR to expire…`);
  await new Promise((r) => setTimeout(r, (ttl + 1) * 1000));
  const expired = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'APP_QR', token: old } });
  check(`QR older than its ${ttl}s TTL is refused`, expired.code === 'QR_EXPIRED', `${expired.status} ${expired.code}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed. Event ${eventId}.`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
