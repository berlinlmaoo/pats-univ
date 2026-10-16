/**
 * NTAG213 / 215 / 216 encode logic for phones (PLAN.md §2.2). The Mac Card Station implements the
 * same steps in Rust (tools/card-station/src/ntag.rs); both are tested against the same command
 * fixture (tools/card-station/tests/fixtures/encode.json) so the two can't drift apart.
 *
 * Everything here speaks raw NTAG21x commands (READ 30h, WRITE A2h, PWD_AUTH 1Bh, GET_VERSION
 * 60h). The caller supplies `transceive`: Android `NfcA.transceive`, iOS Core NFC
 * `sendMiFareCommand`, or a simulator in tests and dry runs.
 *
 * The chip is detected with GET_VERSION and cross-checked with the capability container; the
 * configuration pages (dynamic lock, CFG0, CFG1, PWD, PACK) sit at a different address on each.
 *
 * Safety rules (PRODUCT.md §10.1):
 *   - Static and dynamic lock bits and the capability container are never written: the chip is
 *     password-protected, not locked, so HQ can always re-encode it.
 *   - The factory TLVs before the NDEF message (the Lock Control TLV) are read and kept as is.
 *   - The password is written and proven (PWD_AUTH returns the expected PACK) while AUTH0 only
 *     covers the PACK page, before AUTH0 drops to the first NDEF page. If the proof fails, AUTH0
 *     goes back to FFh. At no point can the chip end up write-protected with a password the
 *     server can't derive.
 *   - AUTHLIM stays 0 (no attempt limit) so a botched session can never brick a card.
 */

export const CHIP_TYPES = ['NTAG213', 'NTAG215', 'NTAG216'] as const;
export type ChipType = (typeof CHIP_TYPES)[number];

export interface ChipProfile {
  type: ChipType;
  /** GET_VERSION byte 6. */
  storageSize: number;
  /** Capability container byte 2 (data area size / 8). */
  ccSize: number;
  userStartPage: number;
  userEndPage: number;
  userBytes: number;
  dynamicLockPage: number;
  cfg0Page: number;
  cfg1Page: number;
  pwdPage: number;
  packPage: number;
}

const profile = (type: ChipType, storageSize: number, ccSize: number, userEndPage: number): ChipProfile => ({
  type,
  storageSize,
  ccSize,
  userStartPage: 4,
  userEndPage,
  userBytes: (userEndPage - 3) * 4,
  dynamicLockPage: userEndPage + 1,
  cfg0Page: userEndPage + 2,
  cfg1Page: userEndPage + 3,
  pwdPage: userEndPage + 4,
  packPage: userEndPage + 5,
});

/** NTAG213/215/216 datasheet §8.5: CFG0 at 29h / 83h / E3h. */
export const CHIPS: Record<ChipType, ChipProfile> = {
  NTAG213: profile('NTAG213', 0x0f, 0x12, 0x27),
  NTAG215: profile('NTAG215', 0x11, 0x3e, 0x81),
  NTAG216: profile('NTAG216', 0x13, 0x6d, 0xe1),
};

/** Kept for code that only knows the 213 (and the Phase 0 tests). */
export const NTAG213 = CHIPS.NTAG213;

export function chipFromVersion(version: readonly number[]): ChipProfile | null {
  const [h, vendor, type, sub, major, minor, size, proto] = version;
  if (h !== 0x00 || vendor !== 0x04 || type !== 0x04 || sub !== 0x02 || major !== 0x01 || minor !== 0x00 || proto !== 0x03) return null;
  return Object.values(CHIPS).find((c) => c.storageSize === size) ?? null;
}

/** Write protection from the first NDEF page on (reads stay open: PROT = 0). */
export const AUTH0_PROTECTED = 0x04;
export const AUTH0_DISABLED = 0xff;

export type Bytes = readonly number[];

export const cmd = {
  getVersion: (): number[] => [0x60],
  read: (page: number): number[] => [0x30, page],
  write: (page: number, data: Bytes): number[] => {
    if (data.length !== 4) throw new Error('WRITE takes exactly 4 bytes');
    return [0xa2, page, ...data];
  },
  pwdAuth: (pwd: Bytes): number[] => {
    if (pwd.length !== 4) throw new Error('PWD_AUTH takes a 4-byte password');
    return [0x1b, ...pwd];
  },
};

export const hex = (bytes: Bytes): string => bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');

export function fromHex(value: string): number[] {
  const clean = value.replace(/[\s:]/g, '');
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) throw new Error(`Not hex: ${value}`);
  return clean.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? [];
}

const equal = (a: Bytes, b: Bytes) => a.length === b.length && a.every((v, i) => v === b[i]);

// ─── NDEF ─────────────────────────────────────────────────────────────────────

const URI_PREFIXES: readonly [string, number][] = [
  ['https://', 0x04],
  ['http://', 0x03],
];

/** One short URI record in an NDEF TLV (`03 len … FE`). */
export function ndefUriTlv(url: string): number[] {
  const match = URI_PREFIXES.find(([prefix]) => url.startsWith(prefix));
  const code = match?.[1] ?? 0x00;
  const body = match ? url.slice(match[0].length) : url;
  // Card URLs are ASCII; refusing anything else keeps this free of TextEncoder (not on every RN engine).
  if (!/^[\x21-\x7e]*$/.test(body)) throw new Error('Only printable ASCII URLs are supported');
  const rest = Array.from(body, (ch) => ch.charCodeAt(0));
  const payloadLength = 1 + rest.length;
  if (payloadLength > 255) throw new Error('URL too long for a short NDEF record');
  // MB=1 ME=1 SR=1 TNF=well-known -> D1, type length 1, type "U".
  const record = [0xd1, 0x01, payloadLength, 0x55, code, ...rest];
  if (record.length > 254) throw new Error('NDEF message too long for a 1-byte TLV length');
  return [0x03, record.length, ...record, 0xfe];
}

/** 4-byte pages from page 4, last one zero-padded. */
export function toPages(bytes: Bytes): { page: number; data: number[] }[] {
  const pages: { page: number; data: number[] }[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const data = [...bytes.slice(i, i + 4)];
    while (data.length < 4) data.push(0);
    pages.push({ page: 4 + i / 4, data });
  }
  return pages;
}

/** The URI of the first NDEF URI record in user memory (bytes from page 4), or null. */
export function parseNdefUri(user: Bytes): string | null {
  let i = 0;
  while (i < user.length) {
    const t = user[i];
    if (t === 0x00) {
      i += 1; // NULL TLV
      continue;
    }
    if (t === 0xfe || t === undefined) return null;
    let len = user[i + 1] ?? 0;
    let start = i + 2;
    if (len === 0xff) {
      len = ((user[i + 2] ?? 0) << 8) | (user[i + 3] ?? 0);
      start = i + 4;
    }
    if (t !== 0x03) {
      i = start + len;
      continue;
    }
    const msg = user.slice(start, start + len);
    const header = msg[0];
    if (header === undefined || len === 0) return null;
    const shortRecord = (header & 0x10) !== 0;
    const hasId = (header & 0x08) !== 0;
    const typeLength = msg[1] ?? 0;
    let p = 2;
    const payloadLength = shortRecord ? (msg[p] ?? 0) : ((msg[p]! << 24) | (msg[p + 1]! << 16) | (msg[p + 2]! << 8) | msg[p + 3]!);
    p += shortRecord ? 1 : 4;
    const idLength = hasId ? (msg[p++] ?? 0) : 0;
    const type = msg.slice(p, p + typeLength);
    p += typeLength + idLength;
    if ((header & 0x07) !== 0x01 || type.length !== 1 || type[0] !== 0x55) return null;
    const payload = msg.slice(p, p + payloadLength);
    if (payload.length < 1) return null;
    const prefix = URI_PREFIXES.find(([, c]) => c === payload[0])?.[0] ?? '';
    return prefix + String.fromCharCode(...payload.slice(1));
  }
  return null;
}

/**
 * Byte offset of the NDEF TLV in user memory: after any NULL, Lock Control and Memory Control
 * TLVs (NFC Forum Type 2 Tag §2.3), which are kept as the factory wrote them.
 */
export function ndefOffsetOf(user: Bytes): number {
  let i = 0;
  while (i < user.length) {
    const t = user[i];
    if (t === 0x00) {
      i += 1;
      continue;
    }
    if (t === 0x01 || t === 0x02) {
      const len = user[i + 1];
      if (len === undefined || len === 0xff) return 0;
      i += 2 + len;
      continue;
    }
    // The NDEF TLV, or junk / a terminator after the control TLVs: the message goes here.
    return i;
  }
  return 0;
}

/**
 * What the user memory should hold: the TLVs before the NDEF unchanged, then the URL message.
 * `empty` writes a zero-length message first, `body` the rest, `header` (the pages with the NDEF
 * type and length) last, so a cut-off write never leaves a half message phones would open.
 */
export function ndefLayout(url: string, prefix: Bytes, chip: ChipProfile = NTAG213) {
  const offset = prefix.length;
  const tlv = ndefUriTlv(url);
  if (offset + tlv.length > chip.userBytes) throw new Error(`NDEF needs ${offset + tlv.length} bytes; ${chip.type} has ${chip.userBytes}`);
  const firstPage = 4 + Math.floor(offset / 4);
  const pages = toPages([...prefix, ...tlv]).filter((p) => p.page >= firstPage);
  const headerPages = new Set([4 + Math.floor(offset / 4), 4 + Math.floor((offset + 1) / 4)]);
  const empty = toPages([...prefix, 0x03, 0x00, 0xfe]).filter((p) => p.page >= firstPage);
  return { offset, tlv, pages, empty, header: pages.filter((p) => headerPages.has(p.page)), body: pages.filter((p) => !headerPages.has(p.page)) };
}

// ─── Inspect & write ──────────────────────────────────────────────────────────

/** Sends one raw command and returns the response bytes; throws when the tag doesn't answer. */
export type Transceive = (command: number[]) => Promise<number[]>;

export type TagFailure =
  | 'NOT_NTAG'
  | 'NOT_NDEF_FORMATTED'
  | 'READ_ONLY'
  | 'LOCK_BITS_SET'
  | 'WRONG_PASSWORD'
  | 'WRITE_FAILED'
  | 'VERIFY_FAILED'
  | 'PROTECT_FAILED'
  | 'TAG_LOST';

export class TagError extends Error {
  constructor(
    readonly code: TagFailure,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface TagInspection {
  chip: ChipProfile;
  /** Upper-case hex, from pages 0–1 (same as the reader's GET UID). */
  uid: string;
  /** Write protection covers the NDEF area: writing needs PWD_AUTH first. */
  protected: boolean;
  auth0: number;
  access: number;
  /** Raw dynamic lock, CFG0, CFG1 and PWD pages (PWD reads as zero). */
  cfg: number[];
  /** URL in the chip's NDEF, if any. */
  url: string | null;
  /** Where the NDEF TLV starts, in bytes from page 4 (after the factory Lock Control TLV). */
  ndefOffset: number;
  /** User memory as read (up to the terminator). */
  user: number[];
}

async function send(io: Transceive, command: number[]): Promise<number[]> {
  try {
    return await io(command);
  } catch (err) {
    throw new TagError('TAG_LOST', err instanceof Error ? err.message : String(err));
  }
}

async function read16(io: Transceive, page: number): Promise<number[]> {
  const res = await send(io, cmd.read(page));
  if (res.length < 16) throw new TagError('TAG_LOST', `READ ${page} returned ${res.length} bytes`);
  return res.slice(0, 16);
}

/** WRITE is acknowledged with a 4-bit ACK (0Ah); some stacks return nothing on success. */
const isAck = (res: Bytes) => res.length === 0 || (res.length === 1 && (res[0]! & 0x0f) === 0x0a);

async function writePage(io: Transceive, page: number, data: Bytes, attempts = 3): Promise<void> {
  let last = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await io(cmd.write(page, data));
      if (isAck(res)) return;
      last = `NAK ${hex(res)}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new TagError('WRITE_FAILED', `page ${page}: ${last}`);
}

/** Reads everything needed before talking to the server. Writes nothing. */
export async function inspectTag(io: Transceive): Promise<TagInspection> {
  const version = await send(io, cmd.getVersion());
  const chip = chipFromVersion(version.slice(0, 8));
  if (!chip) throw new TagError('NOT_NTAG', `GET_VERSION ${hex(version)}`);
  const head = await read16(io, 0);
  const uid = hex([...head.slice(0, 3), ...head.slice(4, 8)]);
  const cc = head.slice(12, 16);
  if (cc[0] !== 0xe1 || cc[1] !== 0x10) throw new TagError('NOT_NDEF_FORMATTED', `CC ${hex(cc)}`);
  if (cc[2] !== chip.ccSize) throw new TagError('NOT_NTAG', `CC size ${hex([cc[2]!])} does not match ${chip.type}`);
  if (cc[3] !== 0x00) throw new TagError('READ_ONLY', `CC ${hex(cc)}`);
  const cfg = await read16(io, chip.dynamicLockPage);
  if (head[10] !== 0 || head[11] !== 0 || cfg[0] !== 0 || cfg[1] !== 0 || cfg[2] !== 0) {
    throw new TagError('LOCK_BITS_SET', `static ${hex(head.slice(10, 12))} dynamic ${hex(cfg.slice(0, 3))}`);
  }
  const auth0 = cfg[7]!;
  const access = cfg[8]!;
  const user: number[] = [];
  for (let page = chip.userStartPage; page <= chip.userEndPage; page += 4) {
    const chunk = await read16(io, page);
    const pagesLeft = chip.userEndPage - page + 1;
    user.push(...chunk.slice(0, Math.min(16, pagesLeft * 4)));
    if (chunk.includes(0xfe)) break;
  }
  // AUTH0 above the user area protects only config pages (staging, or a run cut short).
  return { chip, uid, protected: auth0 <= chip.userEndPage, auth0, access, cfg, url: parseNdefUri(user), ndefOffset: ndefOffsetOf(user), user };
}

export interface WriteResult {
  pagesWritten: number;
  /** Password protection was switched on in this session (first encode). */
  protectedNow: boolean;
}

/**
 * Writes the NDEF URL and protects the chip. `pwd`/`pack` come from the server for this UID and
 * this one write. Call right after `inspectTag` in the same NFC session.
 */
export async function writeTag(io: Transceive, tag: TagInspection, opts: { url: string; pwd: Bytes; pack: Bytes }): Promise<WriteResult> {
  const { pwd, pack } = opts;
  const chip = tag.chip;
  if (pwd.length !== 4 || pack.length !== 2) throw new Error('pwd must be 4 bytes and pack 2 bytes');

  if (tag.protected) {
    const res = await send(io, cmd.pwdAuth(pwd)).catch(() => [] as number[]);
    if (!equal(res.slice(0, 2), pack)) throw new TagError('WRONG_PASSWORD', `PACK ${hex(res)}`);
  }

  const layout = ndefLayout(opts.url, tag.user.slice(0, tag.ndefOffset), chip);
  const pages = layout.pages;
  for (const p of layout.empty) await writePage(io, p.page, p.data);
  for (const p of layout.body) await writePage(io, p.page, p.data);
  for (const p of layout.header) await writePage(io, p.page, p.data);
  let written = layout.empty.length + pages.length;

  // Read back; rewrite what differs once, then give up.
  for (let attempt = 0; ; attempt++) {
    const bad: { page: number; data: number[] }[] = [];
    for (let i = 0; i < pages.length; i += 4) {
      const chunk = await read16(io, pages[i]!.page);
      for (let j = 0; j < 4 && i + j < pages.length; j++) {
        const p = pages[i + j]!;
        if (!equal(chunk.slice(j * 4, j * 4 + 4), p.data)) bad.push(p);
      }
    }
    if (bad.length === 0) break;
    if (attempt >= 1) throw new TagError('VERIFY_FAILED', `pages ${bad.map((p) => p.page).join(',')}`);
    for (const p of bad) await writePage(io, p.page, p.data);
    written += bad.length;
  }

  const cfg0 = tag.cfg.slice(4, 8);
  const cfg1 = tag.cfg.slice(8, 12);
  // ACCESS = 00h: PROT = 0 (reads open), CFGLCK = 0, AUTHLIM = 0 (no attempt limit).
  const access = [0x00, cfg1[1]!, cfg1[2]!, cfg1[3]!];
  const withAuth0 = (auth0: number) => [cfg0[0]!, cfg0[1]!, cfg0[2]!, auth0];

  let protectedNow = false;
  if (!tag.protected) {
    // A run cut short after the staging step leaves AUTH0 on a config page. CFG0 is still
    // writable then (it sits below the PACK page), so switch protection off and start over.
    if (tag.auth0 !== AUTH0_DISABLED) {
      if (tag.auth0 > chip.cfg0Page) {
        await writePage(io, chip.cfg0Page, withAuth0(AUTH0_DISABLED));
        written += 1;
      } else {
        const res = await send(io, cmd.pwdAuth(pwd)).catch(() => [] as number[]);
        if (!equal(res.slice(0, 2), pack)) throw new TagError('WRONG_PASSWORD', `PACK ${hex(res)}`);
      }
    }
    await writePage(io, chip.pwdPage, pwd);
    await writePage(io, chip.packPage, [pack[0]!, pack[1]!, 0x00, 0x00]);
    await writePage(io, chip.cfg1Page, access);
    // Staging: only the PACK page is protected while the password is proven.
    await writePage(io, chip.cfg0Page, withAuth0(chip.packPage));
    written += 4;
    const proof = await send(io, cmd.pwdAuth(pwd)).catch(() => [] as number[]);
    if (!equal(proof.slice(0, 2), pack)) {
      // CFG0 is below the staging AUTH0, so this rollback needs no password.
      await writePage(io, chip.cfg0Page, withAuth0(AUTH0_DISABLED)).catch(() => undefined);
      throw new TagError('PROTECT_FAILED', `PACK ${hex(proof)}`);
    }
    await writePage(io, chip.cfg0Page, withAuth0(AUTH0_PROTECTED));
    written += 1;
    protectedNow = true;
  } else if (tag.auth0 !== AUTH0_PROTECTED || tag.access !== 0x00) {
    // Authenticated above: repair a config that drifted (e.g. AUTH0 set by an older encode).
    await writePage(io, chip.cfg1Page, access);
    await writePage(io, chip.cfg0Page, withAuth0(AUTH0_PROTECTED));
    written += 2;
  }

  const after = await read16(io, chip.dynamicLockPage);
  if (after[7] !== AUTH0_PROTECTED || after[8] !== 0x00) throw new TagError('VERIFY_FAILED', `config ${hex(after.slice(4, 12))}`);
  return { pagesWritten: written, protectedNow };
}

// ─── Simulator (tests, dry runs) ──────────────────────────────────────────────

/**
 * An in-memory NTAG21x that answers like the real chip: write protection from AUTH0, PWD_AUTH,
 * lock bits, PWD/PACK reading back as zeros. `failOn` injects a fault (tag pulled away) at the
 * Nth command, to test interrupted writes.
 */
export class SimulatedNtag {
  readonly memory: number[];
  readonly chip: ChipProfile;
  authenticated = false;
  commands: number[][] = [];
  failOn: number | null = null;

  constructor(type: ChipType = 'NTAG213', uid = '04A1B2C3D4E5F6', opts: { lockTlv?: number[] } = {}) {
    this.chip = CHIPS[type];
    const c = this.chip;
    const u = fromHex(uid);
    const bcc0 = 0x88 ^ u[0]! ^ u[1]! ^ u[2]!;
    const bcc1 = u[3]! ^ u[4]! ^ u[5]! ^ u[6]!;
    this.memory = new Array((c.packPage + 1) * 4).fill(0);
    this.memory.splice(0, 12, u[0]!, u[1]!, u[2]!, bcc0, u[3]!, u[4]!, u[5]!, u[6]!, bcc1, 0x48, 0x00, 0x00);
    this.memory.splice(12, 4, 0xe1, 0x10, c.ccSize, 0x00);
    // Factory layout: a Lock Control TLV (its values differ per chip), then an empty NDEF message.
    const lock = opts.lockTlv ?? (type === 'NTAG213' ? [0x01, 0x03, 0xa0, 0x0c, 0x34] : [0x01, 0x03, 0xa0, 0x10, 0x44]);
    this.memory.splice(16, lock.length + 3, ...lock, 0x03, 0x00, 0xfe);
    this.memory.splice(c.cfg0Page * 4, 4, 0x04, 0x00, 0x00, 0xff);
    this.memory.splice(c.pwdPage * 4, 4, 0xff, 0xff, 0xff, 0xff);
  }

  page(n: number): number[] {
    return this.memory.slice(n * 4, n * 4 + 4);
  }

  get auth0(): number {
    return this.memory[this.chip.cfg0Page * 4 + 3]!;
  }

  transceive: Transceive = async (c) => {
    this.commands.push(c);
    if (this.failOn !== null && this.commands.length >= this.failOn) throw new Error('Tag connection lost');
    const last = this.chip.packPage;
    switch (c[0]) {
      case 0x60:
        return [0x00, 0x04, 0x04, 0x02, 0x01, 0x00, this.chip.storageSize, 0x03];
      case 0x30: {
        const out: number[] = [];
        for (let i = 0; i < 4; i++) {
          const p = (c[1]! + i) % (last + 1);
          out.push(...(p === this.chip.pwdPage || p === this.chip.packPage ? [0, 0, 0, 0] : this.page(p)));
        }
        return out;
      }
      case 0xa2: {
        const p = c[1]!;
        if (p < 2 || p > last) return [0x00];
        if (p >= this.auth0 && !this.authenticated) return [0x00];
        if (p === 2 || p === 3 || p === this.chip.dynamicLockPage) throw new Error('simulator refuses lock/CC writes');
        this.memory.splice(p * 4, 4, ...c.slice(2, 6));
        return [0x0a];
      }
      case 0x1b: {
        if (equal(c.slice(1, 5), this.page(this.chip.pwdPage))) {
          this.authenticated = true;
          return this.page(this.chip.packPage).slice(0, 2);
        }
        throw new Error('NAK');
      }
      default:
        return [0x00];
    }
  };

  /** A new NFC session: authentication does not survive taking the card away. */
  reset() {
    this.authenticated = false;
    this.failOn = null;
  }
}
