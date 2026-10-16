/**
 * Phase 2 interaction matrix, against a live server and the database (PLAN.md §4 Phase 2):
 *   pnpm --filter @pats/web e2e:cards            (BASE_URL defaults to http://localhost:3000)
 * Needs OTP_PROVIDER=demo, PUSH_PROVIDER=log, the seed data, and the same CARD_KEY_SECRET /
 * CRON_SECRET as the server. Each run creates its own matrix members, so it can be re-run.
 * No NFC hardware: stations are driven through the same HTTP calls the Card Station makes.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cardUrl, toZonedInput } from '@pats/shared';
import { PrismaClient } from '../../src/generated/prisma';
import { newCardToken } from '../../src/lib/cards/token';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const CACHE = join(tmpdir(), 'pats-checkin-matrix.json');
if (!process.env.CARD_KEY_SECRET || !process.env.CRON_SECRET) throw new Error('Set CARD_KEY_SECRET and CRON_SECRET (same as the server) in apps/web/.env');
const KEY = process.env.CARD_KEY_SECRET;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const results: { name: string; pass: boolean; detail: string }[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
}

async function api(path: string, opts: { token?: string; method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json, code: json?.error?.code as string | undefined };
}

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

const run = Date.now().toString(36).slice(-5).toUpperCase();
/** A 7-byte NTAG-style UID, unique per run and card. */
const uidOf = (n: number) => `04${((Date.now() % 2 ** 36) * 16 + n).toString(16).padStart(12, '0').slice(-12)}`.toUpperCase();
const RUN_UIDS = new Map<number, string>();
const uid = (n: number) => RUN_UIDS.get(n) ?? (RUN_UIDS.set(n, uidOf(n)), RUN_UIDS.get(n)!);

let made = 0;

/** Fresh members with a queued card, in a city (NIM year 99 so they never collide with real ones). */
async function makeMembers(cityCode: string, count: number) {
  const city = await db.city.findUniqueOrThrow({ where: { code: cityCode } });
  const out = [];
  for (let n = 0; n < count; n++) {
    const i = made++;
    const nim = `${cityCode}99${String(Math.floor(Math.random() * 99_999)).padStart(5, '0')}`;
    const user = await db.user.create({
      data: {
        email: `matrix.${run.toLowerCase()}.${cityCode.toLowerCase()}${i}@patsuniv.test`,
        phone: '+6281200000000',
        name: `Matrix ${cityCode} ${run} ${i}`,
        member: {
          create: {
            nim,
            fullName: `Matrix ${cityCode} ${run} ${i}`,
            dateOfBirth: new Date('1999-01-01'),
            cityId: city.id,
            favoriteSong: 'Song',
            favoriteGenre: 'House',
            consentAt: new Date(),
            cards: { create: { status: 'NOT_PRINTED' } },
          },
        },
      },
      include: { member: { include: { cards: true } } },
    });
    out.push({ userId: user.id, memberId: user.member!.id, nim, cardId: user.member!.cards[0]!.id, cityId: city.id });
  }
  return out;
}

async function main() {
  const hq = await login('hq@patsuniv.test');
  const admin = await login('admin.jkt@patsuniv.test');
  const adminBdg = await login('admin.bdg@patsuniv.test');
  const jkt = await db.city.findUniqueOrThrow({ where: { code: 'JKT' } });

  // ── Batches: 0 / 1 / many, duplicates, mixed cities, races ──
  const zero = await api('/api/hq/batches', { token: hq, body: { cityId: jkt.id, cardIds: [] } });
  check('batch of 0 is refused', zero.status === 422, `${zero.status} ${zero.code} ${JSON.stringify(zero.json.error?.fields)}`);

  const solo = await makeMembers('JKT', 1);
  const dupe = await api('/api/hq/batches', { token: hq, body: { cityId: jkt.id, cardIds: [solo[0]!.cardId, solo[0]!.cardId] } });
  check('duplicate NIM in a batch is refused', dupe.status === 422 && dupe.code === 'BATCH_DUPLICATE_MEMBER' && dupe.json.params?.nim === solo[0]!.nim, `${dupe.status} ${dupe.code} ${dupe.json.params?.nim}`);
  let dbLevel = 'no error';
  try {
    await db.card.create({ data: { memberId: solo[0]!.memberId, status: 'NOT_PRINTED' } });
  } catch (err) {
    dbLevel = (err as { code?: string }).code ?? String(err);
  }
  check('a second live card for one member is refused by the database', dbLevel === 'P2002', dbLevel);

  const one = await api('/api/hq/batches', { token: hq, body: { cityId: jkt.id, cardIds: [solo[0]!.cardId] } });
  const oneBatch = one.json.batch?.id as string;
  const oneFiles = oneBatch ? await db.cardBatch.findUnique({ where: { id: oneBatch } }) : null;
  check('batch of 1: token issued, files generated', one.status === 201 && one.json.files?.ok === true && Boolean(oneFiles?.batchPdfUrl), `${one.status} files=${JSON.stringify(one.json.files)}`);
  const pdfPath = oneFiles?.batchPdfUrl ? join(process.cwd(), '.data/storage', oneFiles.batchPdfUrl) : '';
  check('batch PDF stored on local storage', Boolean(pdfPath) && existsSync(pdfPath) && readFileSync(pdfPath).subarray(0, 5).toString() === '%PDF-', pdfPath);
  const again = await api('/api/hq/batches', { token: hq, body: { cityId: jkt.id, cardIds: [solo[0]!.cardId] } });
  check('a batched card cannot be batched again', again.status === 409 && again.code === 'NOT_IN_QUEUE', `${again.status} ${again.code}`);

  const many = await makeMembers('JKT', 6);
  const [bdgMember] = await makeMembers('BDG', 1);
  const mixed = await api('/api/hq/batches', { token: hq, body: { cityId: jkt.id, cardIds: [many[0]!.cardId, bdgMember!.cardId] } });
  check('a batch is one city', mixed.status === 422 && mixed.code === 'BATCH_MIXED_CITIES', `${mixed.status} ${mixed.code}`);
  const [raceA, raceB] = await Promise.all([
    api('/api/hq/batches', { token: hq, body: { cityId: jkt.id, cardIds: many.map((m) => m.cardId) } }),
    api('/api/hq/batches', { token: hq, body: { cityId: jkt.id, cardIds: many.map((m) => m.cardId) } }),
  ]);
  const winners = [raceA, raceB].filter((r) => r.status === 201);
  const loser = [raceA, raceB].find((r) => r.status !== 201);
  check('two HQ tabs batching the same members: exactly one wins', winners.length === 1 && loser?.code === 'NOT_IN_QUEUE', `${raceA.status}/${raceB.status} ${loser?.code}`);
  const batchId = winners[0]?.json.batch?.id as string;
  const cards = await db.card.findMany({ where: { batchId }, include: { member: true }, orderBy: { member: { nim: 'asc' } } });
  check('batch of many: every card IN_BATCH with a unique token', cards.length === 6 && cards.every((c) => c.status === 'IN_BATCH' && c.ndefToken) && new Set(cards.map((c) => c.ndefToken)).size === 6, `${cards.length} cards`);

  // ── Status transitions ──
  const early = await api('/api/hq/cards/prepare', { token: hq, body: { lookup: cardUrl(cards[0]!.ndefToken!), station: 'Matrix Mac' } });
  check('encode before the batch is back at HQ is refused', early.status === 409 && early.code === 'CARD_STATUS', `${early.status} ${early.code}`);
  const shipEarly = await api(`/api/hq/batches/${batchId}/actions`, { token: hq, body: { action: 'shipToCity' } });
  check('ship before vendor/HQ is refused', shipEarly.status === 409 && shipEarly.code === 'BATCH_STATUS', `${shipEarly.status} ${shipEarly.code}`);
  const sent = await api(`/api/hq/batches/${batchId}/actions`, { token: hq, body: { action: 'sendToVendor' } });
  const sentTwice = await api(`/api/hq/batches/${batchId}/actions`, { token: hq, body: { action: 'sendToVendor' } });
  check('to vendor once; twice is refused', sent.status === 200 && sentTwice.code === 'BATCH_STATUS', `${sent.status} then ${sentTwice.code}`);
  const received = await api(`/api/hq/batches/${batchId}/actions`, { token: hq, body: { action: 'receiveAtHq' } });
  const statuses = await db.card.findMany({ where: { batchId }, select: { status: true } });
  check('back at HQ: cards RECEIVED_HQ', received.status === 200 && statuses.every((s) => s.status === 'RECEIVED_HQ'), statuses.map((s) => s.status).join(','));
  const shipNotEncoded = await api(`/api/hq/batches/${batchId}/actions`, { token: hq, body: { action: 'shipToCity' } });
  check('ship with cards not encoded is refused', shipNotEncoded.status === 409 && shipNotEncoded.code === 'BATCH_NOT_ENCODED' && shipNotEncoded.json.params?.count === 6, `${shipNotEncoded.code} ${shipNotEncoded.json.params?.count}`);

  // ── Parallel stations: claims, leases, idempotency ──
  const c0 = cards[0]!;
  const [claimA, claimB] = await Promise.all([
    api('/api/hq/cards/prepare', { token: hq, body: { lookup: cardUrl(c0.ndefToken!), station: 'Matrix Mac' } }),
    api('/api/hq/cards/prepare', { token: hq, body: { lookup: c0.member.nim, station: 'Matrix iPhone' } }),
  ]);
  const holders = [claimA, claimB].filter((r) => r.status === 200 && r.json.lease);
  const blocked = [claimA, claimB].find((r) => r.status === 409);
  check('two stations claim the same card: one holds it', holders.length === 1 && blocked?.code === 'CARD_CLAIMED' && Boolean(blocked.json.params?.station), `${claimA.status}/${claimB.status} held by ${blocked?.json.params?.station}`);
  const held = holders[0]!.json;
  const lease = held.lease.id as string;
  const uid0 = uid(0);
  const key = await api(`/api/hq/cards/${c0.id}/key`, { token: hq, body: { leaseId: lease, nfcUid: uid0 } });
  check('key: per-chip PWD/PACK for the held card', key.status === 200 && /^[0-9A-F]{8}$/.test(key.json.pwd) && /^[0-9A-F]{4}$/.test(key.json.pack) && key.json.url === cardUrl(c0.ndefToken!), `${key.status} ${key.json.pwd?.length}`);
  const key2 = await api(`/api/hq/cards/${c0.id}/key`, { token: hq, body: { leaseId: lease, nfcUid: uid0 } });
  check('the same chip always gets the same password', key2.json.pwd === key.json.pwd, 'stable');
  const enc = await api(`/api/hq/cards/${c0.id}/encoded`, { token: hq, body: { leaseId: lease, nfcUid: uid0, protectedNow: true, chipType: 'NTAG215' } });
  const c0db = await db.card.findUniqueOrThrow({ where: { id: c0.id } });
  check('encoded: UID bound, chip type and station stored', enc.status === 200 && c0db.status === 'ENCODED' && c0db.nfcUid === uid0 && c0db.chipType === 'NTAG215' && Boolean(c0db.encodedStation), `${c0db.status} ${c0db.chipType} ${c0db.encodedStation}`);
  const batchNow = await db.cardBatch.findUniqueOrThrow({ where: { id: batchId } });
  check('first encode moves the batch to ENCODING', batchNow.status === 'ENCODING' && batchNow.encodedCount === 1, `${batchNow.status} ${batchNow.encodedCount}`);
  const dupScan = await api('/api/hq/cards/prepare', { token: hq, body: { lookup: c0.member.nim, station: 'Matrix iPhone' } });
  check('duplicate scan: already encoded, nothing to write', dupScan.status === 200 && dupScan.json.alreadyEncoded === true && dupScan.json.lease === null, `lease=${JSON.stringify(dupScan.json.lease)}`);

  // A lease that expires mid-write, then another station takes the card.
  const c1 = cards[1]!;
  const l1 = (await api('/api/hq/cards/prepare', { token: hq, body: { lookup: cardUrl(c1.ndefToken!), station: 'Matrix Mac' } })).json.lease.id as string;
  await api(`/api/hq/cards/${c1.id}/key`, { token: hq, body: { leaseId: l1, nfcUid: uid(1) } });
  await db.card.update({ where: { id: c1.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  const lateKey = await api(`/api/hq/cards/${c1.id}/key`, { token: hq, body: { leaseId: l1, nfcUid: uid(1) } });
  check('an expired lease gets no new key', lateKey.code === 'LEASE_LOST', `${lateKey.status} ${lateKey.code}`);
  const takeover = await api('/api/hq/cards/prepare', { token: hq, body: { lookup: c1.member.nim, station: 'Matrix iPhone' } });
  const lateReport = await api(`/api/hq/cards/${c1.id}/encoded`, { token: hq, body: { leaseId: l1, nfcUid: uid(1), protectedNow: true, chipType: 'NTAG213' } });
  check('lease expired mid-write and taken over: the late report is refused', takeover.status === 200 && Boolean(takeover.json.lease) && lateReport.code === 'LEASE_LOST', `${takeover.status} ${lateReport.code}`);
  const l1b = takeover.json.lease.id as string;
  await api(`/api/hq/cards/${c1.id}/encoded`, { token: hq, body: { leaseId: l1b, nfcUid: uid(1), protectedNow: true, chipType: 'NTAG213' } });

  // A lease that expired but nobody took: the write happened, the late report is accepted.
  const c2 = cards[2]!;
  const l2 = (await api('/api/hq/cards/prepare', { token: hq, body: { lookup: c2.member.nim, station: 'Matrix Mac' } })).json.lease.id as string;
  await api(`/api/hq/cards/${c2.id}/key`, { token: hq, body: { leaseId: l2, nfcUid: uid(2) } });
  await db.card.update({ where: { id: c2.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  const lateOk = await api(`/api/hq/cards/${c2.id}/encoded`, { token: hq, body: { leaseId: l2, nfcUid: uid(2), protectedNow: true, chipType: 'NTAG213' } });
  check('lease expired but untouched: the late report is accepted', lateOk.status === 200 && lateOk.json.card?.status === 'ENCODED', `${lateOk.status} ${lateOk.json.card?.status}`);

  // UID rules.
  const c3 = cards[3]!;
  const l3 = (await api('/api/hq/cards/prepare', { token: hq, body: { lookup: c3.member.nim, station: 'Matrix Mac' } })).json.lease.id as string;
  const stolenUid = await api(`/api/hq/cards/${c3.id}/key`, { token: hq, body: { leaseId: l3, nfcUid: uid0 } });
  check('a chip bound to another card is refused', stolenUid.code === 'UID_IN_USE' && stolenUid.json.params?.nim === c0.member.nim, `${stolenUid.code} ${stolenUid.json.params?.nim}`);
  const failed = await api(`/api/hq/cards/${c3.id}/release`, { token: hq, body: { leaseId: l3, failure: 'WRITE_FAILED', detail: 'matrix' } });
  const failAudit = await db.auditLog.findFirst({ where: { action: 'card.encode_failed', targetId: c3.id } });
  check('a failed write releases the card and is audited', failed.json.released === true && Boolean(failAudit), `${failed.json.released} audit=${Boolean(failAudit)}`);
  const l3b = (await api('/api/hq/cards/prepare', { token: hq, body: { lookup: c3.member.nim, station: 'Matrix Mac' } })).json.lease.id as string;
  await api(`/api/hq/cards/${c3.id}/encoded`, { token: hq, body: { leaseId: l3b, nfcUid: uid(3), protectedNow: true, chipType: 'NTAG216' } });

  // Re-encode by HQ (same chip), and moving a card to another chip.
  const re = await api('/api/hq/cards/prepare', { token: hq, body: { lookup: c0.member.nim, station: 'Matrix Mac', mode: 'reencode' } });
  const reKey = re.json.lease ? await api(`/api/hq/cards/${c0.id}/key`, { token: hq, body: { leaseId: re.json.lease.id, nfcUid: uid0 } }) : re;
  const reDone = re.json.lease ? await api(`/api/hq/cards/${c0.id}/encoded`, { token: hq, body: { leaseId: re.json.lease.id, nfcUid: uid0, protectedNow: false, chipType: 'NTAG215' } }) : re;
  check('re-encode (HQ, same chip): same password, card stays ENCODED', re.status === 200 && reKey.json.pwd === key.json.pwd && reDone.json.card?.status === 'ENCODED', `${re.status} ${reDone.json.card?.status}`);
  const plainMove = await api('/api/hq/cards/prepare', { token: hq, body: { lookup: c3.member.nim, station: 'Matrix Mac' } });
  check('encode mode never writes an encoded card again', plainMove.json.alreadyEncoded === true && plainMove.json.lease === null, 'lease null');

  // Encode the rest, ship, hand over.
  for (const c of cards.slice(4)) {
    const l = (await api('/api/hq/cards/prepare', { token: hq, body: { lookup: cardUrl(c.ndefToken!), station: 'Matrix Mac' } })).json.lease.id as string;
    await api(`/api/hq/cards/${c.id}/encoded`, { token: hq, body: { leaseId: l, nfcUid: uid(cards.indexOf(c)), protectedNow: true, chipType: 'NTAG213' } });
  }
  const shipped = await api(`/api/hq/batches/${batchId}/actions`, { token: hq, body: { action: 'shipToCity' } });
  const shippedPush = await db.notification.count({ where: { kind: 'cardShipped', userId: { in: cards.map((c) => c.member.userId) } } });
  check('all encoded → shipped, members notified', shipped.status === 200 && shippedPush === 6, `${shipped.status} pushes=${shippedPush}`);

  const hv = { token: c0.ndefToken!, nfcUid: uid0 };
  const wrongCity = await api('/api/admin/cards/handover/preview', { token: adminBdg, body: hv });
  check('hand-over by another city’s admin: flagged, not allowed', wrongCity.status === 200 && wrongCity.json.issue?.code === 'OTHER_CITY', `${wrongCity.status} ${wrongCity.json.issue?.code}`);
  const wrongCityDo = await api('/api/admin/cards/handover', { token: adminBdg, body: hv });
  check('… and the hand-over itself is refused', wrongCityDo.status === 403, `${wrongCityDo.status}`);
  const hvUid = await api('/api/admin/cards/handover/preview', { token: admin, body: { ...hv, nfcUid: uid(5) } });
  check('hand-over with the token on another chip (UID mismatch) is refused', hvUid.code === 'CARD_UID_MISMATCH', `${hvUid.status} ${hvUid.code}`);
  const hvPrev = await api('/api/admin/cards/handover/preview', { token: admin, body: hv });
  const hvDo = await api('/api/admin/cards/handover', { token: admin, body: hv });
  const hvTwice = await api('/api/admin/cards/handover', { token: admin, body: hv });
  check('hand-over: preview, deliver, second time refused', hvPrev.json.issue === null && hvDo.json.card?.status === 'DELIVERED' && hvTwice.code === 'CARD_ALREADY_DELIVERED', `${hvDo.json.card?.status} then ${hvTwice.code}`);
  const deliveredPush = await db.notification.count({ where: { kind: 'cardDelivered', userId: c0.member.userId } });
  check('the member is told their card is active', deliveredPush === 1, `${deliveredPush}`);

  // ── NFC check-in ──
  const now = new Date();
  const start = toZonedInput(new Date(now.getTime() - 30 * 60_000), 'Asia/Jakarta');
  const end = toZonedInput(new Date(now.getTime() + 3 * 3600_000), 'Asia/Jakarta');
  const ev = await api('/api/admin/events', { token: admin, body: { title: `Cards ${run}`, date: start.date, startTime: start.time, endTime: end.time, opensBeforeMinutes: 60, publish: true } });
  const eventId = ev.json.event.id as string;
  await api(`/api/admin/events/${eventId}/actions`, { token: admin, body: { action: 'open' } });

  const notDelivered = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'NFC', token: cards[1]!.ndefToken, nfcUid: uid(1) } });
  check('NFC check-in with a card not handed over yet is refused', notDelivered.code === 'CARD_NOT_DELIVERED', `${notDelivered.status} ${notDelivered.code}`);
  const mismatch = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'NFC', ...hv, nfcUid: uid(4) } });
  check('NFC check-in: token copied onto another chip (UID mismatch) is refused', mismatch.code === 'CARD_UID_MISMATCH', `${mismatch.status} ${mismatch.code}`);
  const noCard = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'NFC', token: newCardToken(KEY), nfcUid: uid0 } });
  check('NFC check-in: a genuine-looking token with no card', noCard.code === 'CARD_NOT_FOUND', `${noCard.status} ${noCard.code}`);
  const forged = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'NFC', token: 'A'.repeat(32), nfcUid: uid0 } });
  check('NFC check-in: a forged token', forged.code === 'CARD_INVALID', `${forged.status} ${forged.code}`);
  const nfcPrev = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'NFC', ...hv } });
  const nfcDo = await api('/api/admin/check-in', { token: admin, body: { eventId, method: 'NFC', ticket: nfcPrev.json.ticket } });
  const row = await db.checkIn.findFirst({ where: { eventId, memberId: c0.memberId } });
  check('NFC check-in recorded with the card', nfcPrev.status === 200 && nfcDo.status === 201 && row?.method === 'NFC' && row.cardId === c0.id, `${nfcDo.status} ${row?.method}`);
  const pushIn = await db.notification.count({ where: { kind: 'checkIn', userId: c0.member.userId } });
  check('check-in push stored for the member', pushIn === 1, `${pushIn}`);
  const nfcTwice = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'NFC', ...hv } });
  check('second tap: already checked in', nfcTwice.json.issue?.code === 'ALREADY_CHECKED_IN' && nfcTwice.json.ticket === null, `${nfcTwice.json.issue?.code}`);

  // ── Re-encode request → approval → one-time grant ──
  const own = await api(`/api/admin/cards/${c0.id}/reencode-requests`, { token: admin, body: { reason: 'Card bent' } });
  const ownTwice = await api(`/api/admin/cards/${c0.id}/reencode-requests`, { token: admin, body: { reason: 'Again' } });
  check('re-encode request; a second one while waiting is refused', own.status === 201 && ownTwice.code === 'REQUEST_PENDING', `${own.status} then ${ownTwice.code}`);
  const noGrant = await api('/api/hq/cards/prepare', { token: admin, body: { lookup: c0.member.nim, station: 'Matrix Android', mode: 'reencode' } });
  check('a city admin without a grant cannot encode', noGrant.status === 403, `${noGrant.status} ${noGrant.code}`);
  const decided = await api(`/api/hq/reencode-requests/${own.json.id}/decision`, { token: hq, body: { approve: true, note: 'ok' } });
  const decidedTwice = await api(`/api/hq/reencode-requests/${own.json.id}/decision`, { token: hq, body: { approve: false } });
  const approvedPush = await db.notification.count({ where: { kind: 'reencodeApproved' } });
  check('HQ approves once; the admin is told', decided.status === 200 && decidedTwice.code === 'REQUEST_DECIDED' && approvedPush > 0, `${decided.status} ${decidedTwice.code}`);
  const otherAdmin = await api('/api/hq/cards/prepare', { token: adminBdg, body: { lookup: c0.member.nim, station: 'x', grantId: own.json.id } });
  check('the grant only works for the admin who asked', otherAdmin.code === 'GRANT_INVALID', `${otherAdmin.status} ${otherAdmin.code}`);
  const g = await api('/api/hq/cards/prepare', { token: admin, body: { lookup: c0.member.nim, station: 'Matrix Android', grantId: own.json.id } });
  const gWrongChip = g.json.lease ? await api(`/api/hq/cards/${c0.id}/key`, { token: admin, body: { leaseId: g.json.lease.id, nfcUid: uid(9) } }) : g;
  check('grant: only the card’s own chip may be rewritten', gWrongChip.code === 'CARD_UID_MISMATCH', `${gWrongChip.status} ${gWrongChip.code}`);
  const gKey = await api(`/api/hq/cards/${c0.id}/key`, { token: admin, body: { leaseId: g.json.lease?.id, nfcUid: uid0 } });
  const gDone = await api(`/api/hq/cards/${c0.id}/encoded`, { token: admin, body: { leaseId: g.json.lease?.id, nfcUid: uid0, protectedNow: false, chipType: 'NTAG215' } });
  const used = await db.reencodeRequest.findUniqueOrThrow({ where: { id: own.json.id } });
  check('grant: re-encode on the admin phone, card stays DELIVERED, grant used', gKey.json.pwd === key.json.pwd && gDone.json.card?.status === 'DELIVERED' && used.status === 'USED', `${gDone.json.card?.status} ${used.status}`);
  const reuse = await api('/api/hq/cards/prepare', { token: admin, body: { lookup: c0.member.nim, station: 'Matrix Android', grantId: own.json.id } });
  check('grant is one-time', reuse.code === 'GRANT_INVALID', `${reuse.status} ${reuse.code}`);

  // ── Lost card: revoked, scanned, replaced ──
  const lost = await api(`/api/admin/cards/${c0.id}/revoke`, { token: admin, body: { reason: 'Lost at the venue' } });
  const replacement = await db.card.findFirst({ where: { replacesCardId: c0.id } });
  check('lost card: REVOKED, replacement queued', lost.status === 200 && replacement?.status === 'NOT_PRINTED', `${lost.status} ${replacement?.status}`);
  const revokedScan = await api('/api/admin/check-in/preview', { token: admin, body: { eventId, method: 'NFC', ...hv } });
  const revokedHandover = await api('/api/admin/cards/handover/preview', { token: admin, body: hv });
  const revokedPage = await api(`/api/c/${c0.ndefToken}`);
  check('a revoked card scanned: refused at the door and at hand-over, page shows nothing personal', revokedScan.code === 'CARD_REVOKED' && revokedHandover.code === 'CARD_REVOKED' && revokedPage.json.state === 'revoked' && revokedPage.json.member === null, `${revokedScan.code} ${revokedHandover.code} ${revokedPage.json.state}`);
  const revokeTwice = await api(`/api/admin/cards/${c0.id}/revoke`, { token: admin, body: { reason: 'Again' } });
  check('revoking twice is refused', revokeTwice.code === 'CARD_REVOKED', `${revokeTwice.code}`);
  const reuseChip = await api('/api/hq/cards/prepare', { token: hq, body: { lookup: cards[1]!.member.nim, station: 'Matrix Mac', mode: 'reencode' } });
  const reuseKey = await api(`/api/hq/cards/${cards[1]!.id}/key`, { token: hq, body: { leaseId: reuseChip.json.lease?.id, nfcUid: uid0 } });
  check('the revoked card’s chip can be reused in re-encode mode', reuseKey.status === 200, `${reuseKey.status} ${reuseKey.code}`);
  await api(`/api/hq/cards/${cards[1]!.id}/release`, { token: hq, body: { leaseId: reuseChip.json.lease?.id } });

  // ── Public card page, cron ──
  const page = await api(`/api/c/${cards[2]!.ndefToken}`);
  check('card page: profile without date of birth', page.status === 200 && page.json.member?.nim === cards[2]!.member.nim && !('dateOfBirth' in (page.json.member ?? {})), `${page.status} ${page.json.state}`);
  const cronNo = await api('/api/cron/notifications', { method: 'POST', body: {} });
  const cronYes = await fetch(`${BASE}/api/cron/notifications`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  check('cron: refused without the secret, runs with it', cronNo.status === 401 && cronYes.status === 200, `${cronNo.status} / ${cronYes.status}`);

  // Clean up the event so it doesn't linger as "open".
  await api(`/api/admin/events/${eventId}/actions`, { token: admin, body: { action: 'close' } });

  const failedCount = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failedCount}/${results.length} passed`);
  await db.$disconnect();
  process.exit(failedCount ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
