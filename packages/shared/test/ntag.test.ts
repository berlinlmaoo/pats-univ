import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUTH0_PROTECTED,
  CHIPS,
  CHIP_TYPES,
  chipFromVersion,
  cityCopy,
  fillCopy,
  fromHex,
  hex,
  inspectTag,
  ndefOffsetOf,
  ndefUriTlv,
  parseCardLookup,
  parseNdefUri,
  SimulatedNtag,
  TagError,
  tokenFromCardUrl,
  writeTag,
  canTransitionCard,
  can,
  nextBatchAction,
  normalizeUid,
  type ChipType,
} from '../src';

const PWD = fromHex('12345678');
const PACK = fromHex('ABCD');
const URL = 'https://patsuniv.znetworks.id/c/AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const URL2 = 'https://patsuniv.znetworks.id/c/ZyXwVuTsRqPoNmLkJiHgFeDcBa987654';
const UID = '04A1B2C3D4E5F6';

async function encode(tag: SimulatedNtag, url = URL) {
  const t = await inspectTag(tag.transceive);
  return writeTag(tag.transceive, t, { url, pwd: PWD, pack: PACK });
}

const user = (tag: SimulatedNtag) => tag.memory.slice(16, (tag.chip.userEndPage + 1) * 4);

describe('chip detection', () => {
  it('maps GET_VERSION and the CC to the right chip', () => {
    expect(chipFromVersion([0, 4, 4, 2, 1, 0, 0x0f, 3])?.type).toBe('NTAG213');
    expect(chipFromVersion([0, 4, 4, 2, 1, 0, 0x11, 3])?.type).toBe('NTAG215');
    expect(chipFromVersion([0, 4, 4, 2, 1, 0, 0x13, 3])?.type).toBe('NTAG216');
    expect(chipFromVersion([0, 4, 4, 2, 1, 0, 0x0b, 3])).toBeNull(); // NTAG210
    expect([CHIPS.NTAG213.cfg0Page, CHIPS.NTAG215.cfg0Page, CHIPS.NTAG216.cfg0Page]).toEqual([0x29, 0x83, 0xe3]);
    expect([CHIPS.NTAG213.packPage, CHIPS.NTAG215.packPage, CHIPS.NTAG216.packPage]).toEqual([0x2c, 0x86, 0xe6]);
    expect([CHIPS.NTAG213.ccSize, CHIPS.NTAG215.ccSize, CHIPS.NTAG216.ccSize]).toEqual([0x12, 0x3e, 0x6d]);
  });

  it('refuses a CC that does not match the chip', async () => {
    const tag = new SimulatedNtag('NTAG215', UID);
    tag.memory[14] = 0x12;
    await expect(inspectTag(tag.transceive)).rejects.toMatchObject({ code: 'NOT_NTAG' });
  });
});

describe('NTAG encode', () => {
  it.each(CHIP_TYPES)('%s: writes the URL after the factory TLV, protects from the first NDEF page', async (type) => {
    const tag = new SimulatedNtag(type, UID);
    const lock = tag.memory.slice(16, 21);
    const res = await encode(tag);
    expect(res.protectedNow).toBe(true);
    expect(tag.memory.slice(16, 21)).toEqual(lock);
    expect(parseNdefUri(user(tag))).toBe(URL);
    expect(tag.auth0).toBe(AUTH0_PROTECTED);
    expect(tag.page(tag.chip.pwdPage)).toEqual(PWD);
    // Lock bytes and CC are never touched.
    expect(tag.memory.slice(10, 16)).toEqual([0, 0, 0xe1, 0x10, tag.chip.ccSize, 0]);
    expect(tag.commands.some((c) => c[0] === 0xa2 && (c[1] === 2 || c[1] === 3 || c[1] === tag.chip.dynamicLockPage))).toBe(false);
  });

  it('once protected, refuses writes without the password and re-encodes with it', async () => {
    const tag = new SimulatedNtag('NTAG213', UID);
    await encode(tag);
    tag.reset();
    expect(await tag.transceive([0xa2, 5, 1, 2, 3, 4])).toEqual([0x00]);
    const t = await inspectTag(tag.transceive);
    expect(t.protected).toBe(true);
    await expect(writeTag(tag.transceive, t, { url: URL2, pwd: [9, 9, 9, 9], pack: PACK })).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    tag.reset();
    const res = await encode(tag, URL2);
    expect(res.protectedNow).toBe(false);
    expect(parseNdefUri(user(tag))).toBe(URL2);
  });

  it.each(CHIP_TYPES)('%s: an interrupted write never leaves an unknown password and always recovers', async (type) => {
    const full = new SimulatedNtag(type, UID);
    await encode(full);
    for (let cut = 1; cut <= full.commands.length; cut++) {
      const tag = new SimulatedNtag(type, UID);
      tag.failOn = cut;
      await encode(tag).catch((e) => expect(e).toBeInstanceOf(TagError));
      tag.reset();
      const knownPassword = tag.auth0 > tag.chip.userEndPage || hex(tag.page(tag.chip.pwdPage)) === hex(PWD);
      expect(knownPassword, `cut at ${cut}`).toBe(true);
      await encode(tag);
      expect(parseNdefUri(user(tag))).toBe(URL);
    }
  });

  it('refuses locked chips and keeps a foreign URL readable before overwriting it', async () => {
    const locked = new SimulatedNtag('NTAG213', UID);
    locked.memory[10] = 0x08;
    await expect(inspectTag(locked.transceive)).rejects.toMatchObject({ code: 'LOCK_BITS_SET' });
    const rnd = new SimulatedNtag('NTAG213', UID);
    [0x01, 0x03, 0xa0, 0x0c, 0x34, ...ndefUriTlv('https://znetworks.id')].forEach((b, i) => (rnd.memory[16 + i] = b));
    const t = await inspectTag(rnd.transceive);
    expect(t.url).toBe('https://znetworks.id');
    expect(t.ndefOffset).toBe(5);
    expect(ndefOffsetOf([0x03, 0x00, 0xfe])).toBe(0);
  });
});

/**
 * The Mac Card Station (Rust) replays the same fixture, so both encoders send identical
 * commands. `UPDATE_FIXTURE=1 pnpm test` rewrites it after an intended change.
 */
describe('shared encode fixture', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '../../../tools/card-station/tests/fixtures/encode.json');
  const cases: { name: string; chip: ChipType; protected: boolean; url2?: string }[] = [
    { name: 'blank NTAG213', chip: 'NTAG213', protected: false },
    { name: 'blank NTAG215', chip: 'NTAG215', protected: false },
    { name: 'blank NTAG216', chip: 'NTAG216', protected: false },
    { name: 're-encode protected NTAG215', chip: 'NTAG215', protected: true, url2: URL2 },
  ];

  it('produces the committed command sequence', async () => {
    const out = [];
    for (const c of cases) {
      const tag = new SimulatedNtag(c.chip, UID);
      if (c.protected) {
        await encode(tag);
        tag.reset();
        tag.commands = [];
      }
      await encode(tag, c.url2 ?? URL);
      out.push({ ...c, uid: UID, pwd: hex(PWD), pack: hex(PACK), url: URL, commands: tag.commands.map(hex) });
    }
    if (process.env.UPDATE_FIXTURE || !existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(out)));
  });
});

describe('card helpers', () => {
  const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz01_-45';
  it('parses card URLs, bare tokens and NIMs', () => {
    expect(tokenFromCardUrl(`https://patsuniv.znetworks.id/c/${token}`)).toBe(token);
    expect(tokenFromCardUrl('https://patsuniv.znetworks.id/c/short')).toBeNull();
    expect(parseCardLookup(` https://x.test/c/${token}?a=1`)).toEqual({ kind: 'token', token });
    expect(parseCardLookup(token)).toEqual({ kind: 'token', token });
    expect(parseCardLookup('jkt 2600042')).toEqual({ kind: 'nim', nim: 'JKT2600042' });
    expect(parseCardLookup('hello')).toBeNull();
    expect(normalizeUid('04:a1:b2:c3:d4:e5:f6')).toBe('04A1B2C3D4E5F6');
    expect(normalizeUid('xyz')).toBeNull();
  });

  it('allows only the forward card flow, plus revoke', () => {
    expect(canTransitionCard('NOT_PRINTED', 'IN_BATCH')).toBe(true);
    expect(canTransitionCard('RECEIVED_HQ', 'ENCODED')).toBe(true);
    expect(canTransitionCard('IN_BATCH', 'ENCODED')).toBe(false);
    expect(canTransitionCard('DELIVERED', 'ENCODED')).toBe(false);
    expect(canTransitionCard('ENCODED', 'REVOKED')).toBe(true);
    expect(canTransitionCard('REVOKED', 'REVOKED')).toBe(false);
    expect(nextBatchAction('EXPORTED')).toBe('sendToVendor');
    expect(nextBatchAction('ENCODING')).toBe('shipToCity');
    expect(nextBatchAction('DONE')).toBeNull();
  });

  it('gates card work by capability, not role', () => {
    expect(can('REGIONAL_ADMIN', 'card.requestReencode')).toBe(true);
    expect(can('REGIONAL_ADMIN', 'card.encode')).toBe(false);
    expect(can('SUPER_ADMIN', 'card.encode')).toBe(true);
    expect(can('MEMBER', 'card.handover')).toBe(false);
  });
});

describe('push copy', () => {
  it('uses the city override per language, else the default', () => {
    const copy = { reminder1d: { id: 'Besok ya: {event}!', en: '' } };
    expect(cityCopy(copy, 'reminder1d', 'id')).toBe('Besok ya: {event}!');
    expect(cityCopy(copy, 'reminder1d', 'en')).toBeNull();
    expect(cityCopy({ bogus: 1 }, 'reminder1d', 'id')).toBeNull();
    expect(fillCopy('Hi {name}, {event} at {time} {oops}', { name: 'Rara', event: 'Night', time: '19.30 WIB' })).toBe('Hi Rara, Night at 19.30 WIB {oops}');
  });
});
