import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { newReceiptKey, putReceipt, readReceipt, signReceiptUrl, verifyReceiptUrl } from '../../src/lib/loyalty/receipts';
let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'pats-receipts-'));
  process.env.STORAGE_DRIVER = 'local';
  process.env.STORAGE_DIR = folder;
  process.env.AUTH_SECRET = 'receipt-test-key-'.repeat(4);
  process.env.APP_URL = 'http://localhost:3013';
  process.env.DATABASE_URL = 'postgresql://localhost/test_p3';
});
afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});
describe('private receipts on the shared storage driver', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=',
    'base64',
  );
  it('writes a private image under STORAGE_DIR, signs read URLs and refuses overwrite', async () => {
    const key = newReceiptKey('member', 'image/png');
    await putReceipt(key, png, 'image/png');
    expect(await readReceipt(key)).toEqual(new Uint8Array(png));
    const url = await signReceiptUrl(key, { operation: 'read', expiresInSeconds: 120 });
    expect(verifyReceiptUrl(new Request(url), 'read').key).toBe(key);
    await expect(putReceipt(key, png, 'image/png')).rejects.toMatchObject({ status: 409 });
  });
  it('rejects traversal, false image contents and missing objects', async () => {
    await expect(readReceipt('../private')).rejects.toMatchObject({ status: 404 });
    await expect(putReceipt('receipts/../../x.png', png, 'image/png')).rejects.toMatchObject({ status: 404 });
    await expect(putReceipt(newReceiptKey('member', 'image/png'), Buffer.from('<script>'), 'image/png')).rejects.toMatchObject({ status: 422 });
    await expect(signReceiptUrl(newReceiptKey('member', 'image/png'), { operation: 'read', expiresInSeconds: 10 })).rejects.toMatchObject({ status: 404 });
  });
  it('separates read/write signatures and rejects tampering and expired URLs', async () => {
    const key = newReceiptKey('member', 'image/jpeg');
    const url = await signReceiptUrl(key, { operation: 'write', expiresInSeconds: 300, contentType: 'image/jpeg' });
    expect(() => verifyReceiptUrl(new Request(url), 'read')).toThrow();
    const tampered = new URL(url);
    tampered.searchParams.set('key', newReceiptKey('other', 'image/jpeg'));
    expect(() => verifyReceiptUrl(new Request(tampered), 'write')).toThrow();
    tampered.searchParams.set('exp', '1');
    expect(() => verifyReceiptUrl(new Request(tampered), 'write')).toThrow();
  });
});
