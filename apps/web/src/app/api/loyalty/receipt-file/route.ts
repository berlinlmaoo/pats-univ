import { AppError } from '@/lib/http/errors';
import { ok, route } from '@/lib/http/respond';
import {
  limitedReceiptBody,
  readPrivateReceipt,
  receiptStorage,
  verifyReceiptUrl,
} from '@/lib/loyalty/storage/receipts';
export const GET = route(async (req: Request) => {
  const { key, contentType } = verifyReceiptUrl(req, 'read');
  return new Response((await readPrivateReceipt(key)) as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
export const PUT = route(async (req: Request) => {
  const { key, contentType } = verifyReceiptUrl(req, 'write');
  if (req.headers.get('content-type')?.split(';')[0] !== contentType)
    throw new AppError('VALIDATION', 422);
  await receiptStorage.putPrivate(
    key,
    await limitedReceiptBody(req),
    contentType,
  );
  return ok({ key }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
