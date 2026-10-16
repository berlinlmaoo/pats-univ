/** Phase 3 API interaction matrix. Requires a dedicated *_p3 database and a running server. */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Workbook } from 'exceljs';
import { PrismaClient, type User } from '../../src/generated/prisma';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const BASE = process.env.BASE_URL ?? 'http://localhost:3013';
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_p3'))
  throw new Error('Use a dedicated *_p3 database');
const run = randomUUID().slice(0, 8);
const prefix = `matrix-${run}`;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const results: { name: string; pass: boolean }[] = [];
const settingBackups = new Map<string, unknown>();
async function setting(key: string, value: string | number) {
  if (!settingBackups.has(key))
    settingBackups.set(
      key,
      await db.setting.findUnique({ where: { id: `GLOBAL::${key}` } }),
    );
  await db.setting.upsert({
    where: { id: `GLOBAL::${key}` },
    create: { id: `GLOBAL::${key}`, key, scope: 'GLOBAL', value },
    update: { value },
  });
}
function check(name: string, pass: boolean) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
}
async function api(path: string, auth = '', body?: unknown, method?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(auth.startsWith('pats_session=')
        ? { Cookie: auth }
        : auth
          ? { Authorization: `Bearer ${auth}` }
          : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res
    .clone()
    .json()
    .catch(() => ({}))) as Json;
  return {
    status: res.status,
    json,
    code: json.error?.code as string | undefined,
    res,
  };
}
async function login(user: User) {
  const request = await api('/api/auth/otp/request', '', {
    email: user.email,
    audience: user.role === 'SUPER_ADMIN' ? 'hq' : 'app',
  });
  if (!request.json.demoCode) throw new Error(`OTP failed: ${request.status}`);
  const response = await api('/api/auth/otp/verify', '', {
    email: user.email,
    code: request.json.demoCode,
    client: user.role === 'SUPER_ADMIN' ? 'web' : 'app',
  });
  if (response.status !== 200)
    throw new Error(`Login failed: ${response.status}`);
  return user.role === 'SUPER_ADMIN'
    ? response.res.headers.get('set-cookie')!.split(';')[0]!
    : (response.json.accessToken as string);
}
const userIds: string[] = [];
const memberIds: string[] = [];
const eventIds: string[] = [];
const cityIds: string[] = [];
const rewardIds: string[] = [];
async function newUser(
  role: 'MEMBER' | 'REGIONAL_ADMIN' | 'SUPER_ADMIN',
  cityId?: string,
  number = 0,
) {
  const name = `${prefix}-${role}-${number}`;
  const user = await db.user.create({
    data: {
      email: `${name.toLowerCase()}@patsuniv.test`,
      phone: '+6281234567890',
      name,
      role,
      cityId: role === 'REGIONAL_ADMIN' ? cityId : null,
      ...(role === 'MEMBER'
        ? {
            member: {
              create: {
                fullName: name,
                nim: `${prefix}-${number}`,
                dateOfBirth: new Date('2000-01-01'),
                cityId: cityId!,
                favoriteSong: 'Music',
                favoriteGenre: 'House',
                consentAt: new Date(),
                isPromoter: true,
              },
            },
          }
        : {}),
    },
    include: { member: true },
  });
  userIds.push(user.id);
  if (user.member) memberIds.push(user.member.id);
  return user;
}
async function main() {
  const city = await db.city.create({
    data: { code: `A${run.slice(0, 2)}`, name: `${prefix} Jakarta` },
  });
  cityIds.push(city.id);
  const other = await db.city.create({
    data: { code: `B${run.slice(0, 2)}`, name: `${prefix} Bandung` },
  });
  cityIds.push(other.id);
  const hq = await newUser('SUPER_ADMIN');
  const crew = await newUser('REGIONAL_ADMIN', city.id);
  const outsider = await newUser('REGIONAL_ADMIN', other.id, 1);
  const a = await newUser('MEMBER', city.id, 1);
  const b = await newUser('MEMBER', city.id, 2);
  const c = await newUser('MEMBER', city.id, 3);
  const d = await newUser('MEMBER', city.id, 4);
  const [hqAuth, admin, otherAdmin, member, second] = await Promise.all(
    [hq, crew, outsider, a, b].map(login),
  );
  const now = new Date();
  const event = await db.event.create({
    data: {
      cityId: city.id,
      title: prefix,
      status: 'OPEN',
      startsAt: new Date(now.getTime() - 3600000),
      endsAt: new Date(now.getTime() + 3600000),
      checkInOpensAt: new Date(now.getTime() - 3600000),
      checkInClosesAt: new Date(now.getTime() + 3600000),
      maxSpinsPerMember: 5,
    },
  });
  eventIds.push(event.id);
  for (const m of [a.member!, b.member!])
    await db.checkIn.create({
      data: {
        eventId: event.id,
        memberId: m.id,
        adminId: crew.id,
        method: 'MANUAL',
        manualReason: 'Matrix setup',
      },
    });
  await db.xpLedger.createMany({
    data: [
      { memberId: a.member!.id, delta: 3800, reason: 'ADJUST' },
      { memberId: b.member!.id, delta: 100, reason: 'CHECK_IN' },
    ],
  });
  const reward = await db.reward.create({
    data: {
      name: prefix,
      type: 'DIRECT',
      cityId: city.id,
      xpCost: 100,
      stock: 10,
    },
  });
  rewardIds.push(reward.id);
  const prize = await db.reward.create({
    data: {
      name: `${prefix}-prize`,
      type: 'SPIN_PRIZE',
      cityId: city.id,
      xpCost: 0,
      stock: 20,
      spinWeight: 1,
    },
  });
  rewardIds.push(prize.id);
  // Restrict the spin pool to the test city: global showcase prizes remain valid outcomes.
  check(
    'anonymous wallet refused',
    (await api('/api/loyalty/wallet')).status === 401,
  );
  check(
    'member cannot reach crew operations',
    (await api('/api/admin/loyalty/operations', member)).status === 403,
  );
  const wallet = await api('/api/loyalty/wallet', member);
  check(
    'XP balance and milestone shown',
    wallet.json.balance === 3800 &&
      wallet.json.ledger.length === 1 &&
      wallet.json.milestone !== null,
  );
  const direct = await api('/api/loyalty/redeem', member, {
    eventId: event.id,
    rewardId: reward.id,
  });
  const code = direct.json.redemption?.code as string;
  check(
    'redeem creates six-character code and debits XP',
    direct.status === 201 &&
      /^[A-Z0-9]{6}$/.test(code) &&
      direct.json.balance === 3700,
  );
  check(
    'other-city crew cannot validate',
    (
      await api('/api/admin/loyalty/codes/fulfill', otherAdmin, {
        eventId: event.id,
        code,
      })
    ).status === 403,
  );
  check(
    'preview leaves code unfulfilled',
    (
      await api('/api/admin/loyalty/codes/preview', admin, {
        eventId: event.id,
        code,
      })
    ).json.redemption?.status === 'ISSUED',
  );
  const race = await Promise.all([
    api('/api/admin/loyalty/codes/fulfill', admin, { eventId: event.id, code }),
    api('/api/admin/loyalty/codes/fulfill', admin, { eventId: event.id, code }),
  ]);
  check(
    'concurrent fulfillment: exactly one success',
    race.filter((r) => r.status === 200).length === 1 &&
      race.filter((r) => r.code === 'REDEEM_USED').length === 1,
  );
  check(
    'code redeemed twice is refused',
    (
      await api('/api/admin/loyalty/codes/fulfill', admin, {
        eventId: event.id,
        code,
      })
    ).code === 'REDEEM_USED',
  );
  const exp = await api('/api/loyalty/redeem', member, {
    eventId: event.id,
    rewardId: reward.id,
  });
  await db.redemption.update({
    where: { id: exp.json.redemption.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await db.reward.update({ where: { id: reward.id }, data: { xpCost: 999 } });
  check(
    'expired code refused and refund commits',
    (
      await api('/api/admin/loyalty/codes/fulfill', admin, {
        eventId: event.id,
        code: exp.json.redemption.code,
      })
    ).code === 'REDEEM_EXPIRED',
  );
  await api('/api/loyalty/wallet', member);
  await api('/api/loyalty/wallet', member);
  const refunds = await db.xpLedger.findMany({
    where: { memberId: a.member!.id, reason: 'REFUND' },
  });
  check(
    'expiry refunds original 100 XP exactly once despite price change',
    refunds.length === 1 &&
      refunds[0]!.delta === 100 &&
      (await api('/api/loyalty/wallet', member)).json.balance === 3700,
  );
  const spins = [];
  for (let i = 0; i < 5; i++)
    spins.push(await api('/api/loyalty/spin', member, { eventId: event.id }));
  check(
    'five spins produce stored prizes',
    spins.every((r) => r.status === 201 && r.json.redemption.kind === 'SPIN'),
  );
  check(
    'sixth spin refused',
    (await api('/api/loyalty/spin', member, { eventId: event.id })).code ===
      'SPIN_LIMIT',
  );
  await db.redemption.updateMany({
    where: { memberId: a.member!.id, kind: 'SPIN' },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await api('/api/loyalty/wallet', member);
  check(
    'expired spins do not reset limit',
    (await api('/api/loyalty/spin', member, { eventId: event.id })).code ===
      'SPIN_LIMIT',
  );
  const cheap = await db.reward.create({
    data: {
      name: prefix + '-cheap',
      type: 'DIRECT',
      cityId: city.id,
      xpCost: 100,
      stock: null,
    },
  });
  rewardIds.push(cheap.id);
  const spending = await Promise.all([
    api('/api/loyalty/redeem', second, {
      eventId: event.id,
      rewardId: cheap.id,
    }),
    api('/api/loyalty/redeem', second, {
      eventId: event.id,
      rewardId: cheap.id,
    }),
  ]);
  check(
    'concurrent spending cannot overdraw XP',
    spending.filter((r) => r.status === 201).length === 1 &&
      spending.some((r) => r.code === 'INSUFFICIENT_XP'),
  );
  await db.xpLedger.create({
    data: { memberId: b.member!.id, delta: 100, reason: 'ADJUST' },
  });
  const limited = await db.reward.create({
    data: {
      name: prefix + '-limited',
      type: 'DIRECT',
      cityId: city.id,
      xpCost: 100,
      stock: 1,
    },
  });
  rewardIds.push(limited.id);
  const stockRace = await Promise.all([
    api('/api/loyalty/redeem', member, {
      eventId: event.id,
      rewardId: limited.id,
    }),
    api('/api/loyalty/redeem', second, {
      eventId: event.id,
      rewardId: limited.id,
    }),
  ]);
  check(
    'concurrent claims cannot oversell last stock',
    stockRace.filter((r) => r.status === 201).length === 1 &&
      (await db.reward.findUnique({ where: { id: limited.id } }))?.stock === 0,
  );
  // Upload through the same signed URL that the mobile form uses.
  const upload = await api('/api/loyalty/receipt-upload', member, {
    contentType: 'image/png',
  });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=',
    'base64',
  );
  const put = await fetch(upload.json.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  });
  check('private signed receipt upload works', put.status === 201);
  check(
    'upload URL cannot overwrite an existing receipt',
    (
      await fetch(upload.json.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: png,
      })
    ).status === 409,
  );
  const report = await api('/api/loyalty/reports', member, {
    eventId: event.id,
    guestCount: 12,
    receiptUrl: upload.json.key,
    receiptAmount: 6000000,
    guests: [{ name: 'Guest', phone: '08123' }],
  });
  const reportId = report.json.id;
  check(
    'PR submits 12 guests and receipt',
    report.status === 201 && report.json.status === 'SUBMITTED',
  );
  check(
    'another member cannot read receipt',
    (await api(`/api/loyalty/receipts/${reportId}?format=json`, second))
      .status === 403,
  );
  check(
    'another city cannot read receipt',
    (await api(`/api/loyalty/receipts/${reportId}?format=json`, otherAdmin))
      .status === 403,
  );
  const ownerUrl = await api(
    `/api/loyalty/receipts/${reportId}?format=json`,
    member,
  );
  check(
    'owner and HQ may read private receipt',
    ownerUrl.status === 200 &&
      (await api(`/api/loyalty/receipts/${reportId}?format=json`, hqAuth))
        .status === 200 &&
      (await fetch(ownerUrl.json.url)).status === 200,
  );
  const tamper = new URL(ownerUrl.json.url);
  tamper.searchParams.set('exp', String(Math.floor(Date.now() / 1000) + 30000));
  check('tampered receipt URL refused', (await fetch(tamper)).status === 403);
  check(
    'other-city crew cannot review PR',
    (
      await api(`/api/admin/loyalty/reports/${reportId}`, otherAdmin, {
        action: 'validate',
      })
    ).status === 403,
  );
  check(
    'PR rejected with reason',
    (
      await api(`/api/admin/loyalty/reports/${reportId}`, admin, {
        action: 'reject',
        reason: 'Please clarify receipt',
      })
    ).json.status === 'REJECTED',
  );
  const resubmit = await api('/api/loyalty/reports', member, {
    eventId: event.id,
    guestCount: 12,
    receiptUrl: upload.json.key,
    receiptAmount: 6000000,
  });
  check(
    'rejected PR resubmitted as same report',
    resubmit.json.id === reportId && resubmit.json.status === 'SUBMITTED',
  );
  const review = await Promise.all([
    api(`/api/admin/loyalty/reports/${reportId}`, admin, {
      action: 'validate',
    }),
    api(`/api/admin/loyalty/reports/${reportId}`, admin, {
      action: 'validate',
    }),
  ]);
  const bonus = await db.xpLedger.findMany({
    where: {
      memberId: a.member!.id,
      reason: 'PROMOTER_BONUS',
      refId: reportId,
    },
  });
  check(
    'concurrent PR validation credits 240 XP once',
    review.filter((r) => r.status === 200).length === 1 &&
      bonus.length === 1 &&
      bonus[0]!.delta === 240,
  );
  check(
    'validated PR cannot be edited',
    (
      await api('/api/loyalty/reports', member, {
        eventId: event.id,
        guestCount: 999,
        receiptUrl: upload.json.key,
      })
    ).code === 'REPORT_REVIEWED',
  );
  check(
    'validated XP bonus can be reversed',
    (
      await api(`/api/admin/loyalty/reports/${reportId}`, admin, {
        action: 'cancel',
        reason: 'Receipt correction',
      })
    ).status === 200 &&
      (await db.xpLedger.count({
        where: {
          memberId: a.member!.id,
          refType: 'PromoterReportReversal',
          delta: -240,
        },
      })) === 1,
  );
  await api('/api/loyalty/reports', member, {
    eventId: event.id,
    guestCount: 12,
    receiptUrl: upload.json.key,
    receiptAmount: 6000000,
  });
  await setting('promoterBonusKind', 'CASH');
  await setting('promoterCommissionPercent', 5);
  const cash = await api(`/api/admin/loyalty/reports/${reportId}`, admin, {
    action: 'validate',
  });
  const payout = await db.promoterPayout.findFirst({
    where: { promoterReportId: reportId },
  });
  check(
    'cash bonus creates pending payout without a second XP bonus',
    cash.status === 200 &&
      payout?.amount === 300000 &&
      payout.status === 'PENDING' &&
      (await db.xpLedger.count({
        where: { refId: reportId, reason: 'PROMOTER_BONUS' },
      })) === 1,
  );
  await db.promoterPayout.update({
    where: { id: payout!.id },
    data: { status: 'PAID', paidAt: new Date(), paidById: hq.id },
  });
  check(
    'paid cash bonus cannot be silently cancelled',
    (
      await api(`/api/admin/loyalty/reports/${reportId}`, admin, {
        action: 'cancel',
        reason: 'Too late',
      })
    ).code === 'REPORT_REVIEWED',
  );
  // Deterministic same-total, same-time tie resolved by NIM; live self stays outside top N.
  const same = new Date(Date.now() - 10000);
  await db.xpLedger.createMany({
    data: [
      {
        memberId: c.member!.id,
        delta: 50000,
        reason: 'CHECK_IN',
        createdAt: same,
      },
      {
        memberId: d.member!.id,
        delta: 50000,
        reason: 'CHECK_IN',
        createdAt: same,
      },
    ],
  });
  const e = await newUser('MEMBER', city.id, 5);
  await db.xpLedger.create({
    data: { memberId: e.member!.id, delta: 60000, reason: 'CHECK_IN' },
  });
  await setting('leaderboardTopN', 3);
  const board = await api(`/api/loyalty/leaderboard?cityId=${city.id}`, member);
  check(
    'leaderboard ties use NIM',
    board.json.entries[1]?.memberId === c.member!.id &&
      board.json.entries[2]?.memberId === d.member!.id,
  );
  check(
    'leaderboard returns own live position',
    board.json.self?.memberId === a.member!.id &&
      board.json.self.rank === 4 &&
      board.json.entries.length === 3 &&
      !board.json.entries.some((r: Json) => r.memberId === a.member!.id),
  );
  const recap = {
    eventId: event.id,
    sofaCount: 3800,
    tableCount: 0,
    fdcCount: 0,
    paxCount: 3800,
    revenueSofa: 6000000,
    revenueTable: 0,
    revenueFdc: 0,
    note: 'Traffic recap',
  };
  check(
    'other city cannot submit recap',
    (await api('/api/admin/loyalty/recaps', otherAdmin, recap)).status === 403,
  );
  check(
    'recap total calculated by server',
    (await api('/api/admin/loyalty/recaps', admin, { ...recap, total: 1 })).json
      .total === 6000000,
  );
  check(
    'only HQ locks recap',
    (
      await api(
        '/api/admin/loyalty/recaps',
        admin,
        { eventId: event.id },
        'PATCH',
      )
    ).status === 403 &&
      (
        await api(
          '/api/admin/loyalty/recaps',
          hqAuth,
          { eventId: event.id },
          'PATCH',
        )
      ).status === 200,
  );
  check(
    'locked recap refuses edits',
    (await api('/api/admin/loyalty/recaps', admin, recap)).code ===
      'RECAP_LOCKED',
  );
  check(
    'crew cannot export',
    (await api('/api/hq/export?dataset=recap', admin)).status === 403,
  );
  const csv = await api(
    `/api/hq/export?dataset=recap&cityId=${city.id}&format=csv&locale=id`,
    hqAuth,
  );
  const text = await csv.res.text();
  check(
    'CSV has 3.800 and Rp 6.000.000',
    text.includes('3.800') && text.includes('Rp 6.000.000'),
  );
  const xlsx = await api(
    `/api/hq/export?dataset=recap&cityId=${city.id}&format=xlsx&locale=en`,
    hqAuth,
  );
  const workbook = new Workbook();
  await workbook.xlsx.load(await xlsx.res.arrayBuffer());
  const values = JSON.stringify(workbook.worksheets[0]!.getSheetValues());
  check(
    'XLSX is readable and retains house number formats',
    values.includes('3.800') && values.includes('Rp 6.000.000'),
  );
  for (const dataset of [
    'member',
    'checkin',
    'ledger',
    'leaderboard',
    'redemption',
    'report',
  ])
    check(
      `${dataset} CSV export succeeds`,
      (
        await api(
          `/api/hq/export?dataset=${dataset}&cityId=${city.id}&format=csv`,
          hqAuth,
        )
      ).status === 200,
    );
  check(
    'export audit log written',
    (await db.auditLog.count({
      where: { actorId: hq.id, action: 'data.export' },
    })) >= 8,
  );
  check(
    'cron refuses missing credentials',
    (await api('/api/cron/loyalty', '', {})).status === 403,
  );
  const cron = await api('/api/cron/loyalty', process.env.CRON_SECRET!, {});
  const count = await db.leaderboardSnapshot.count();
  await api('/api/cron/loyalty', process.env.CRON_SECRET!, {});
  check(
    'hourly snapshots idempotent',
    cron.status === 200 && (await db.leaderboardSnapshot.count()) === count,
  );
}
async function clean() {
  for (const [key, original] of settingBackups) {
    if (original) {
      const row = original as { value: string | number };
      await db.setting.update({
        where: { id: `GLOBAL::${key}` },
        data: { value: row.value },
      });
    } else await db.setting.delete({ where: { id: `GLOBAL::${key}` } });
  }
  await db.promoterPayout.deleteMany({
    where: { memberId: { in: memberIds } },
  });
  await db.promoterReport.deleteMany({
    where: { memberId: { in: memberIds } },
  });
  await db.redemption.deleteMany({ where: { memberId: { in: memberIds } } });
  await db.xpLedger.deleteMany({ where: { memberId: { in: memberIds } } });
  await db.checkIn.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.trafficRecap.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.leaderboardSnapshot.deleteMany({
    where: { cityId: { in: cityIds } },
  });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.event.deleteMany({ where: { id: { in: eventIds } } });
  await db.reward.deleteMany({ where: { id: { in: rewardIds } } });
  await db.member.deleteMany({ where: { id: { in: memberIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.city.deleteMany({ where: { id: { in: cityIds } } });
}
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log(
      `\n${results.filter((r) => r.pass).length}/${results.length} passed`,
    );
    if (results.some((r) => !r.pass)) process.exitCode = 1;
    await clean();
    await db.$disconnect();
  });
