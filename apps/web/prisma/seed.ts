/**
 * Demo data (PLAN.md §4): 3 cities, 1 HQ account, 2 city admins, 20 members, 2 venues,
 * 3 upcoming events plus one live Jakarta event with check-in open, and every setting at its
 * default. Safe to re-run: existing rows are kept.
 * Launch cities are JKT/JOG. Production mode excludes all demo accounts, venues and events.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { SETTINGS, settingId, type SettingKey } from '@pats/shared';
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import { allocateNim } from '../src/lib/nim';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const CITIES = [
  { code: 'JKT', name: 'Jakarta', waGroupUrl: 'https://chat.whatsapp.com/PATSJakartaDemo' },
  { code: 'JOG', name: 'Jogja', waGroupUrl: null },
  { code: 'BDG', name: 'Bandung', waGroupUrl: 'https://chat.whatsapp.com/PATSBandungDemo' },
  { code: 'SBY', name: 'Surabaya', waGroupUrl: null },
];

const MEMBERS: [string, string, string, string, string][] = [
  // name, city, song, genre, quote
  ['Rara Anindya', 'JKT', 'Midnight City — M83', 'Synthpop', 'Dance like nobody’s filming.'],
  ['Bima Pratama', 'JKT', 'Strobe — deadmau5', 'Progressive House', ''],
  ['Citra Maharani', 'JKT', 'Location — Khalid', 'R&B', 'Good music, better people.'],
  ['Dimas Saputra', 'JKT', 'One More Time — Daft Punk', 'French House', ''],
  ['Eka Wulandari', 'JKT', 'Kill Bill — SZA', 'R&B', 'Main character energy.'],
  ['Fajar Nugroho', 'JKT', 'Losing It — FISHER', 'Tech House', ''],
  ['Gita Lestari', 'JKT', 'Levitating — Dua Lipa', 'Pop', 'Weekend starts Thursday.'],
  ['Hendra Wijaya', 'JKT', 'SICKO MODE — Travis Scott', 'Hip-hop', ''],
  ['Intan Permata', 'JKT', 'Cola — CamelPhat', 'Tech House', ''],
  ['Joko Santoso', 'BDG', 'Lose Control — MEDUZA', 'House', 'Bandung never sleeps.'],
  ['Kirana Putri', 'BDG', 'Blinding Lights — The Weeknd', 'Synthwave', ''],
  ['Lukman Hakim', 'BDG', 'Opus — Eric Prydz', 'Progressive House', ''],
  ['Maya Sari', 'BDG', 'Peaches — Justin Bieber', 'R&B', 'Coffee by day, bass by night.'],
  ['Nanda Kurniawan', 'BDG', 'Turn Down for What — DJ Snake', 'Trap', ''],
  ['Oki Firmansyah', 'BDG', 'Innerbloom — RÜFÜS DU SOL', 'Melodic House', ''],
  ['Putri Ayu', 'SBY', 'Titanium — David Guetta', 'EDM', 'Loud and proud.'],
  ['Rizky Ramadhan', 'SBY', 'HUMBLE. — Kendrick Lamar', 'Hip-hop', ''],
  ['Sinta Dewi', 'SBY', 'Ghosts ’n’ Stuff — deadmau5', 'Electro', ''],
  ['Taufik Hidayat', 'SBY', 'Gecko — Oliver Heldens', 'Future House', ''],
  ['Wulan Safitri', 'SBY', 'Good 4 U — Olivia Rodrigo', 'Pop', 'Here for the drops.'],
];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

async function main() {
  const production = process.env.SEED_MODE === 'production' || process.env.NODE_ENV === 'production';
  const cities = new Map<string, Awaited<ReturnType<typeof db.city.upsert>>>();
  for (const c of CITIES.filter(c => !production || ['JKT', 'JOG'].includes(c.code))) {
    cities.set(c.code, await db.city.upsert({ where: { code: c.code }, create: production ? { ...c, waGroupUrl: null } : c, update: {} }));
  }

  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    await db.setting.upsert({
      where: { id: settingId(key) },
      create: { id: settingId(key), key, scope: 'GLOBAL', value: SETTINGS[key].default },
      update: {},
    });
  }

  if (production) {
    await db.city.updateMany({ where: { code: { in: ['BDG', 'SBY'] } }, data: { active: false } });
    const email = process.env.SEED_SUPER_ADMIN_EMAIL?.toLowerCase();
    if (email) await db.user.upsert({ where: { email }, create: { email, phone: '', name: 'HQ PATS', role: 'SUPER_ADMIN' }, update: {} });
    console.log('Production cities and settings ready: JKT, JOG.');
    return;
  }
  const hqEmail = (process.env.SEED_SUPER_ADMIN_EMAIL || 'hq@patsuniv.test').toLowerCase();
  await db.user.upsert({
    where: { email: hqEmail },
    create: { email: hqEmail, phone: '+6281100000001', name: 'HQ PATS', role: 'SUPER_ADMIN' },
    update: {},
  });

  for (const [code, name, phone] of [
    ['JKT', 'Andi Crew Jakarta', '+6281100000002'],
    ['JOG', 'Crew Jogja', '+6281100000004'],
    ['BDG', 'Sari Crew Bandung', '+6281100000003'],
  ] as const) {
    const email = `admin.${code.toLowerCase()}@patsuniv.test`;
    await db.user.upsert({
      where: { email },
      create: { email, phone, name, role: 'REGIONAL_ADMIN', cityId: cities.get(code)!.id },
      update: {},
    });
  }

  const now = Date.now();
  for (const [i, [name, code, song, genre, quote]] of MEMBERS.entries()) {
    const email = `${slug(name)}@patsuniv.test`;
    if (await db.user.findUnique({ where: { email } })) continue;
    const city = cities.get(code)!;
    // Spread registrations over the last 30 days, oldest first, so NIMs follow join order.
    const joinedAt = new Date(now - (MEMBERS.length - i) * 36 * 60 * 60 * 1000);
    await db.$transaction(async (tx) => {
      const nim = await allocateNim(tx, city, joinedAt);
      await tx.user.create({
        data: {
          email,
          phone: `+62812${String(30000000 + i * 7919).padStart(8, '0')}`,
          name,
          role: 'MEMBER',
          createdAt: joinedAt,
          member: {
            create: {
              nim,
              fullName: name,
              dateOfBirth: new Date(Date.UTC(1995 + (i % 9), i % 12, 1 + ((i * 3) % 27))),
              cityId: city.id,
              favoriteSong: song,
              favoriteGenre: genre,
              quotes: quote,
              signupSource: i % 3 === 0 ? `${code.toLowerCase()}-venue` : null,
              consentAt: joinedAt,
              joinedAt,
              cards: { create: { status: 'NOT_PRINTED', createdAt: joinedAt } },
            },
          },
        },
      });
    });
  }

  const venues = [
    { cityCode: 'JKT', name: 'PATS Senopati', address: 'Jl. Senopati No. 8, Jakarta Selatan', lat: -6.2297, lng: 106.8091 },
    { cityCode: 'JOG', name: 'PATS Jogja', address: 'Jogja', lat: -7.7956, lng: 110.3695 },
    { cityCode: 'BDG', name: 'PATS Braga', address: 'Jl. Braga No. 21, Bandung', lat: -6.9175, lng: 107.6091 },
  ];
  for (const v of venues) {
    const cityId = cities.get(v.cityCode)!.id;
    const existing = await db.venue.findFirst({ where: { cityId, name: v.name } });
    if (existing) continue;
    await db.venue.create({
      data: {
        cityId,
        name: v.name,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
        layout: {
          slots: [
            { code: 'S1', kind: 'SOFA', x: 0, y: 0, w: 2, h: 1, pax: 6 },
            { code: 'S2', kind: 'SOFA', x: 2, y: 0, w: 2, h: 1, pax: 6 },
            { code: 'T1', kind: 'TABLE', x: 0, y: 2, w: 1, h: 1, pax: 4 },
            { code: 'T2', kind: 'TABLE', x: 1, y: 2, w: 1, h: 1, pax: 4 },
          ],
        },
      },
    });
  }

  // Three upcoming events, 20.00–02.00 WIB (13.00–19.00 UTC), check-in opens one hour early.
  const hour = 60 * 60 * 1000;
  const dayStartUtc = (daysFromNow: number) => {
    const d = new Date(now + daysFromNow * 24 * hour);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const events = [
    { cityCode: 'JKT', venue: 'PATS Senopati', title: 'PATS Friday Session', inDays: 2 },
    { cityCode: 'JKT', venue: 'PATS Senopati', title: 'PATS University Launch Night', inDays: 9 },
    { cityCode: 'JOG', venue: 'PATS Jogja', title: 'PATS Jogja Night', inDays: 4 },
    { cityCode: 'BDG', venue: 'PATS Braga', title: 'PATS Bandung Takeover', inDays: 5 },
  ];
  for (const e of events) {
    const cityId = cities.get(e.cityCode)!.id;
    if (await db.event.findFirst({ where: { cityId, title: e.title } })) continue;
    const venue = await db.venue.findFirst({ where: { cityId, name: e.venue } });
    const startsAt = new Date(dayStartUtc(e.inDays) + 13 * hour);
    await db.event.create({
      data: {
        cityId,
        venueId: venue?.id,
        title: e.title,
        description: 'Demo event for the PATS University showcase.',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 6 * hour),
        checkInOpensAt: new Date(startsAt.getTime() - hour),
        checkInClosesAt: new Date(startsAt.getTime() + 6 * hour),
        status: 'PUBLISHED',
      },
    });
  }

  // Phase 1 demo: one Jakarta event that is on right now, with check-in already open.
  const liveTitle = 'PATS Warm-up Night';
  const jktId = cities.get('JKT')!.id;
  if (!(await db.event.findFirst({ where: { cityId: jktId, title: liveTitle } }))) {
    const venue = await db.venue.findFirst({ where: { cityId: jktId, name: 'PATS Senopati' } });
    const startsAt = new Date(Math.floor((now - hour) / (30 * 60 * 1000)) * 30 * 60 * 1000);
    await db.event.create({
      data: {
        cityId: jktId,
        venueId: venue?.id,
        title: liveTitle,
        description: 'Live demo event: check-in is open, so the crew can scan right away.',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 6 * hour),
        checkInOpensAt: new Date(startsAt.getTime() - hour),
        checkInClosesAt: new Date(startsAt.getTime() + 6 * hour),
        status: 'OPEN',
      },
    });
  }

  const counts = await Promise.all([db.city.count(), db.user.count(), db.member.count(), db.venue.count(), db.event.count()]);
  console.log(`Seeded: ${counts[0]} cities, ${counts[1]} users, ${counts[2]} members, ${counts[3]} venues, ${counts[4]} events.`);
  console.log(`HQ login: ${hqEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
