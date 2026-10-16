import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  newReceiptKey,
  readPrivateReceipt,
  receiptStorage,
  verifyReceiptUrl,
} from '../../src/lib/loyalty/storage/receipts';
let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'pats-receipts-'));
  process.env.PR_RECEIPT_STORAGE_DIR = folder;
  process.env.AUTH_SECRET = 'receipt-test-key-'.repeat(4);
  process.env.APP_URL = 'http://localhost:3013';
  process.env.DATABASE_URL = 'postgresql://localhost/test_p3';
});
afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});
describe('private receipt driver', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=',
    'base64',
  );
  it('writes a private image, signs read URLs and refuses overwrite', async () => {
    const key = newReceiptKey('member', 'image/png');
    await receiptStorage.putPrivate(key, png, 'image/png');
    expect(await readPrivateReceipt(key)).toEqual(new Uint8Array(png));
    const url = await receiptStorage.getSignedUrl(key, {
      operation: 'read',
      expiresInSeconds: 120,
    });
    expect(verifyReceiptUrl(new Request(url), 'read').key).toBe(key);
    await expect(
      receiptStorage.putPrivate(key, png, 'image/png'),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects traversal, false image contents and missing objects', async () => {
    await expect(readPrivateReceipt('../private')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      receiptStorage.putPrivate(
        newReceiptKey('member', 'image/png'),
        Buffer.from('<script>'),
        'image/png',
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      receiptStorage.getSignedUrl(newReceiptKey('member', 'image/png'), {
        operation: 'read',
        expiresInSeconds: 10,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('separates read/write signatures and rejects tampering and expired URLs', async () => {
    const key = newReceiptKey('member', 'image/jpeg');
    const url = await receiptStorage.getSignedUrl(key, {
      operation: 'write',
      expiresInSeconds: 300,
      contentType: 'image/jpeg',
    });
    expect(() => verifyReceiptUrl(new Request(url), 'read')).toThrow();
    const tampered = new URL(url);
    tampered.searchParams.set('key', newReceiptKey('other', 'image/jpeg'));
    expect(() => verifyReceiptUrl(new Request(tampered), 'write')).toThrow();
    tampered.searchParams.set('exp', '1');
    expect(() => verifyReceiptUrl(new Request(tampered), 'write')).toThrow();
  });
});
