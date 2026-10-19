import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../env';
import { AppError } from '../http/errors';
import { storage } from '../storage';

/**
 * PR receipts on the shared storage driver (local disk or S3, see lib/storage). Receipts are
 * private: the app gets short-lived signed URLs from routes that have already checked who is
 * asking (the PR who owns the report, HQ, or crew of the report's city), and the file route
 * below only honours a valid, unexpired signature for one key and one operation.
 */
export type ReceiptContentType = 'image/jpeg' | 'image/png' | 'image/webp';
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const receiptTypes: ReceiptContentType[] = ['image/jpeg', 'image/png', 'image/webp'];

type SignOptions = {
  operation: 'read' | 'write';
  expiresInSeconds: number;
  contentType?: ReceiptContentType;
};

const keyPattern = /^receipts\/[a-z0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/;

function checkedKey(key: string) {
  if (!keyPattern.test(key)) throw new AppError('NOT_FOUND', 404);
  return key;
}

function contentTypeOf(key: string): ReceiptContentType {
  return key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
}

function signature(key: string, operation: string, exp: string, contentType: string) {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(JSON.stringify(['pr-receipt-v1', key, operation, exp, contentType]))
    .digest('hex');
}

function isImage(bytes: Uint8Array, type: ReceiptContentType) {
  const b = Buffer.from(bytes);
  return type === 'image/jpeg'
    ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    : type === 'image/png'
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
}

export function newReceiptKey(memberId: string, type: ReceiptContentType) {
  return `receipts/${memberId}/${randomUUID()}.${type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'}`;
}

/** Stores an uploaded receipt once: wrong type, fake image bytes or an existing key are refused. */
export async function putReceipt(key: string, bytes: Uint8Array, contentType: ReceiptContentType) {
  checkedKey(key);
  if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES || contentType !== contentTypeOf(key) || !isImage(bytes, contentType))
    throw new AppError('VALIDATION', 422);
  const store = storage();
  if (await store.get(key)) throw new AppError('VALIDATION', 409);
  await store.put(key, bytes, contentType);
}

/** Receipt bytes, or NOT_FOUND. */
export async function readReceipt(key: string) {
  const file = await storage().get(checkedKey(key));
  if (!file) throw new AppError('NOT_FOUND', 404);
  return file.body;
}

/** Throws NOT_FOUND unless the receipt has been uploaded. */
export async function assertReceiptExists(key: string) {
  await readReceipt(key);
}

/** Signed URL for one receipt operation, valid at most five minutes. Read URLs need the file. */
export async function signReceiptUrl(key: string, options: SignOptions) {
  checkedKey(key);
  if (options.operation === 'read') await assertReceiptExists(key);
  const exp = String(Math.floor(Date.now() / 1000) + Math.min(300, Math.max(1, options.expiresInSeconds)));
  const contentType = options.contentType ?? contentTypeOf(key);
  const params = new URLSearchParams({
    key,
    operation: options.operation,
    exp,
    contentType,
    signature: signature(key, options.operation, exp, contentType),
  });
  return `${env().APP_URL}/api/loyalty/receipt-file?${params}`;
}

export function verifyReceiptUrl(req: Request, operation: 'read' | 'write') {
  const p = new URL(req.url).searchParams;
  const key = p.get('key') ?? '',
    exp = p.get('exp') ?? '',
    type = p.get('contentType') ?? '',
    sig = p.get('signature') ?? '';
  if (
    p.get('operation') !== operation ||
    !/^\d+$/.test(exp) ||
    Number(exp) <= Math.floor(Date.now() / 1000) ||
    !receiptTypes.includes(type as ReceiptContentType) ||
    !keyPattern.test(key)
  )
    throw new AppError('FORBIDDEN', 403);
  const expected = signature(key, operation, exp, type);
  if (!/^[a-f0-9]{64}$/.test(sig) || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig)))
    throw new AppError('FORBIDDEN', 403);
  return { key, contentType: type as ReceiptContentType };
}

export async function limitedReceiptBody(req: Request) {
  if (Number(req.headers.get('content-length')) > MAX_RECEIPT_BYTES) throw new AppError('VALIDATION', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError('VALIDATION', 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > MAX_RECEIPT_BYTES) {
      await reader.cancel();
      throw new AppError('VALIDATION', 413);
    }
    chunks.push(chunk.value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
