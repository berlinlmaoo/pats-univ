import { can } from '@pats/shared';
import { cardUrl } from '@pats/shared';
import { getWebUser } from '@/lib/auth/current-user';
import { renderCardPdf } from '@/lib/card-print/render';
import { batchLabel } from '@/lib/cards/service';
import { db } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { route } from '@/lib/http/respond';
import { storage } from '@/lib/storage';

type Params = { params: Promise<{ id: string; file: string[] }> };

/**
 * Print files of a batch, HQ only (dashboard session):
 *   batch.pdf · manifest.csv · members/<cardId>.pdf · proof/<cardId>.pdf (rendered now, with
 *   trim and safe-area guides, never sent to the vendor)
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await getWebUser();
  if (!user || !can(user.role, 'hq.manage')) throw new AppError('UNAUTHENTICATED', 401);
  const { id, file } = await params;
  const batch = await db.cardBatch.findUnique({ where: { id }, include: { city: { select: { code: true } } } });
  if (!batch) throw new AppError('NOT_FOUND', 404);
  const label = batchLabel(batch.city.code, batch.number);
  const [kind, name] = file;

  let key: string | null = null;
  let download = '';
  if (kind === 'batch.pdf') [key, download] = [batch.batchPdfUrl, `${label}-batch.pdf`];
  else if (kind === 'manifest.csv') [key, download] = [batch.manifestCsvUrl, `${label}-manifest.csv`];
  else if ((kind === 'members' || kind === 'proof') && name?.endsWith('.pdf')) {
    const card = await db.card.findFirst({ where: { id: name.slice(0, -4), batchId: id }, include: { member: { select: { nim: true, fullName: true } } } });
    if (!card) throw new AppError('NOT_FOUND', 404);
    if (kind === 'proof') {
      if (!card.ndefToken) throw new AppError('NOT_FOUND', 404);
      const pdf = await renderCardPdf({ fullName: card.member.fullName, nim: card.member.nim, url: cardUrl(card.ndefToken) }, { proof: true });
      return new Response(pdf as BodyInit, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${label}-${card.member.nim}-proof.pdf"`, 'Cache-Control': 'private, no-store' },
      });
    }
    [key, download] = [card.printFileUrl, `${label}-${card.member.nim}.pdf`];
  }
  if (!key) throw new AppError('NOT_FOUND', 404);
  const stored = await storage().get(key);
  if (!stored) throw new AppError('NOT_FOUND', 404);
  const inline = download.endsWith('.pdf');
  return new Response(stored.body as BodyInit, {
    headers: {
      'Content-Type': stored.contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${download}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
