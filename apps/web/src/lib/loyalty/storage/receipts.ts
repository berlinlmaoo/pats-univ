import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../env';
import { AppError } from '../../http/errors';

export type ReceiptContentType = 'image/jpeg' | 'image/png' | 'image/webp';
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const receiptTypes: ReceiptContentType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
type SignedOptions = {
  operation: 'read' | 'write';
  expiresInSeconds: number;
  contentType?: ReceiptContentType;
};
/** Merge adapter: replace this instance with the shared private storage driver after Phase 2. */
export interface PrivateReceiptStorage {
  putPrivate(
    key: string,
    bytes: Uint8Array,
    contentType: ReceiptContentType,
  ): Promise<void>;
  getSignedUrl(key: string, options: SignedOptions): Promise<string>;
}
const keyPattern = /^receipts\/[a-z0-9]+\/[a-f0-9-]+\.(jpg|png|webp)$/;
function filePath(key: string) {
  if (!keyPattern.test(key)) throw new AppError('NOT_FOUND', 404);
  // Uploaded receipts are runtime data, never inputs to the deployment bundle.
  return path.join(/* turbopackIgnore: true */
    path.resolve(/* turbopackIgnore: true */ process.env.PR_RECEIPT_STORAGE_DIR || '.private-receipts'),
    key,
  );
}
function contentTypeOf(key: string): ReceiptContentType {
  return key.endsWith('.png')
    ? 'image/png'
    : key.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
}
function signature(
  key: string,
  operation: string,
  exp: string,
  contentType: string,
) {
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
      : b.toString('ascii', 0, 4) === 'RIFF' &&
        b.toString('ascii', 8, 12) === 'WEBP';
}
class LocalReceiptStorage implements PrivateReceiptStorage {
  async putPrivate(
    key: string,
    bytes: Uint8Array,
    contentType: ReceiptContentType,
  ) {
    if (
      !bytes.length ||
      bytes.length > MAX_RECEIPT_BYTES ||
      contentType !== contentTypeOf(key) ||
      !isImage(bytes, contentType)
    )
      throw new AppError('VALIDATION', 422);
    const target = filePath(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    try {
      await writeFile(target, bytes, { mode: 0o600, flag: 'wx' });
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === 'EEXIST'
      )
        throw new AppError('VALIDATION', 409);
      throw err;
    }
  }
  async getSignedUrl(key: string, options: SignedOptions) {
    const target = filePath(key);
    if (options.operation === 'read') {
      try {
        await stat(/* turbopackIgnore: true */ target);
      } catch {
        throw new AppError('NOT_FOUND', 404);
      }
    }
    const exp = String(
      Math.floor(Date.now() / 1000) +
        Math.min(300, Math.max(1, options.expiresInSeconds)),
    );
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
}
export const receiptStorage: PrivateReceiptStorage = new LocalReceiptStorage();
export function newReceiptKey(memberId: string, type: ReceiptContentType) {
  return `receipts/${memberId}/${randomUUID()}.${type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'}`;
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
  if (
    !/^[a-f0-9]{64}$/.test(sig) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  )
    throw new AppError('FORBIDDEN', 403);
  return { key, contentType: type as ReceiptContentType };
}
export async function readPrivateReceipt(key: string) {
  try {
    return new Uint8Array(await readFile(/* turbopackIgnore: true */ filePath(key)));
  } catch {
    throw new AppError('NOT_FOUND', 404);
  }
}
export async function limitedReceiptBody(req: Request) {
  if (Number(req.headers.get('content-length')) > MAX_RECEIPT_BYTES)
    throw new AppError('VALIDATION', 413);
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
