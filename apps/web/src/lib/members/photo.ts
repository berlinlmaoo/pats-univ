import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { MEMBER_PHOTO_MAX_BYTES, MEMBER_PHOTO_MIN_PX, MEMBER_PHOTO_PENDING_KEY, MEMBER_PHOTO_TYPES } from '@pats/shared';
import { env } from '../env';
import { AppError } from '../http/errors';
import { storage } from '../storage';

/**
 * Member photos (so venue crew can match the face to the card). Private like PR receipts: stored
 * on the shared storage driver, read only through short-lived signed URLs that routes hand out
 * after their own access check. `Member.photoUrl` holds the storage key, never a public URL.
 *
 * Keys: `photos/pending/<uuid>.<ext>` while /join is in progress (no member yet), then
 * `photos/<memberId>/<uuid>.<ext>` for uploads from the profile.
 */
export type PhotoContentType = (typeof MEMBER_PHOTO_TYPES)[number];

const keyPattern = /^photos\/(pending|[a-z0-9-]+)\/[a-f0-9-]{36}\.(jpg|png|webp)$/;
const MAX_PX = 8000;

function checkedKey(key: string) {
  if (!keyPattern.test(key)) throw new AppError('NOT_FOUND', 404);
  return key;
}

export function isPhotoKey(value: string | null | undefined): value is string {
  return Boolean(value && keyPattern.test(value));
}

export function isPendingPhotoKey(value: string): boolean {
  return MEMBER_PHOTO_PENDING_KEY.test(value);
}

function extOf(type: PhotoContentType) {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp';
}

function contentTypeOf(key: string): PhotoContentType {
  return key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
}

export function parsePhotoType(value: string | null): PhotoContentType {
  const type = (value ?? '').split(';')[0]!.trim().toLowerCase();
  if (!(MEMBER_PHOTO_TYPES as readonly string[]).includes(type)) {
    throw new AppError('VALIDATION', 422, 'Unsupported photo type', { fields: { photo: 'validation.photoType' } });
  }
  return type as PhotoContentType;
}

/** Width and height from the file header (JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X), or null. */
export function imageSize(bytes: Uint8Array, type: PhotoContentType): { width: number; height: number } | null {
  const b = Buffer.from(bytes);
  if (type === 'image/png') {
    if (!b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || b.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (type === 'image/webp') {
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    return null;
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/** Throws a field error unless the bytes are a real image of the declared type and a usable size. */
export function assertPhoto(bytes: Uint8Array, type: PhotoContentType) {
  if (!bytes.length) throw new AppError('VALIDATION', 422, 'Empty photo', { fields: { photo: 'validation.photoRequired' } });
  if (bytes.length > MEMBER_PHOTO_MAX_BYTES) throw new AppError('VALIDATION', 413, 'Photo too large', { fields: { photo: 'validation.photoTooLarge' } });
  const size = imageSize(bytes, type);
  if (!size) throw new AppError('VALIDATION', 422, 'Not an image', { fields: { photo: 'validation.photoType' } });
  if (Math.min(size.width, size.height) < MEMBER_PHOTO_MIN_PX || Math.max(size.width, size.height) > MAX_PX) {
    throw new AppError('VALIDATION', 422, 'Photo size out of range', { fields: { photo: 'validation.photoDimensions' }, params: { px: MEMBER_PHOTO_MIN_PX } });
  }
}

/** Reads a request body up to the photo limit. */
export async function limitedPhotoBody(req: Request) {
  if (Number(req.headers.get('content-length')) > MEMBER_PHOTO_MAX_BYTES) {
    throw new AppError('VALIDATION', 413, 'Photo too large', { fields: { photo: 'validation.photoTooLarge' } });
  }
  const reader = req.body?.getReader();
  if (!reader) throw new AppError('VALIDATION', 422, 'Empty photo', { fields: { photo: 'validation.photoRequired' } });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > MEMBER_PHOTO_MAX_BYTES) {
      await reader.cancel();
      throw new AppError('VALIDATION', 413, 'Photo too large', { fields: { photo: 'validation.photoTooLarge' } });
    }
    chunks.push(chunk.value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** Stores a checked photo under a fresh key and returns the key. */
export async function putPhoto(owner: 'pending' | string, bytes: Uint8Array, type: PhotoContentType) {
  assertPhoto(bytes, type);
  const key = checkedKey(`photos/${owner}/${randomUUID()}.${extOf(type)}`);
  await storage().put(key, bytes, type);
  return key;
}

export async function photoExists(key: string) {
  return Boolean(await storage().get(checkedKey(key)));
}

export async function readPhoto(key: string) {
  const file = await storage().get(checkedKey(key));
  if (!file) throw new AppError('NOT_FOUND', 404);
  return { body: file.body, contentType: contentTypeOf(key) };
}

function signature(key: string, exp: string) {
  return createHmac('sha256', env().AUTH_SECRET).update(JSON.stringify(['member-photo-v1', key, 'read', exp])).digest('hex');
}

/**
 * Signed read URL for a photo key (relative to the site, so it works on any host serving the
 * page). Defaults to one hour: long enough for a crew scan screen or a profile visit, short
 * enough that a copied link dies. Returns null for an empty or legacy value.
 */
export function photoReadUrl(key: string | null | undefined, expiresInSeconds = 3600, absolute = false): string | null {
  if (!isPhotoKey(key)) return null;
  // Round the expiry to the hour so the same page renders the same URL (browser cache).
  const now = Math.floor(Date.now() / 1000);
  const exp = String(Math.ceil((now + Math.min(86400, Math.max(60, expiresInSeconds))) / 600) * 600);
  const params = new URLSearchParams({ key, exp, signature: signature(key, exp) });
  return `${absolute ? env().APP_URL : ''}/api/photos/file?${params}`;
}

export function verifyPhotoUrl(req: Request) {
  const p = new URL(req.url).searchParams;
  const key = p.get('key') ?? '';
  const exp = p.get('exp') ?? '';
  const sig = p.get('signature') ?? '';
  if (!keyPattern.test(key) || !/^\d+$/.test(exp) || Number(exp) <= Math.floor(Date.now() / 1000)) throw new AppError('FORBIDDEN', 403);
  const expected = signature(key, exp);
  if (!/^[a-f0-9]{64}$/.test(sig) || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new AppError('FORBIDDEN', 403);
  return key;
}
