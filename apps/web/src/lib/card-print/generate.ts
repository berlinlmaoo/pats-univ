import 'server-only';
import { cardUrl } from '@pats/shared';
import { batchLabel } from '../cards/service';
import { db } from '../db';
import { storage } from '../storage';
import { manifestCsv, mergePdfs, renderCardPdf, type ManifestRow } from './render';

export const batchFolder = (batchId: string) => `cards/batches/${batchId}`;

/**
 * Renders a batch's print files and stores them: one PDF per member, the batch PDF and the CSV
 * manifest. Safe to run again (same tokens, same files). A failure is kept on the batch so the
 * dashboard can show it with "Generate again" instead of losing the batch.
 */
export async function generateBatchFiles(batchId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const batch = await db.cardBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      city: { select: { code: true, name: true } },
      cards: {
        where: { status: { not: 'REVOKED' } },
        include: { member: { select: { nim: true, fullName: true, favoriteDrink: true, favoriteGenre: true, quotes: true } } },
        orderBy: { member: { nim: 'asc' } },
      },
    },
  });
  const label = batchLabel(batch.city.code, batch.number);
  const folder = batchFolder(batch.id);
  const store = storage();
  try {
    const files: Uint8Array[] = [];
    const rows: ManifestRow[] = [];
    for (const [i, card] of batch.cards.entries()) {
      if (!card.ndefToken) throw new Error(`Card ${card.id} has no token`);
      const url = cardUrl(card.ndefToken);
      const pdf = await renderCardPdf({ fullName: card.member.fullName, nim: card.member.nim, favoriteDrink: card.member.favoriteDrink, favoriteGenre: card.member.favoriteGenre, quote: card.member.quotes, url });
      const file = `${String(i + 1).padStart(3, '0')}-${card.member.nim}.pdf`;
      await store.put(`${folder}/members/${file}`, pdf, 'application/pdf');
      await db.card.update({ where: { id: card.id }, data: { printFileUrl: `${folder}/members/${file}` } });
      files.push(pdf);
      rows.push({ seq: i + 1, nim: card.member.nim, fullName: card.member.fullName, city: batch.city.name, file, url });
    }
    const batchPdf = await mergePdfs(files, `PATS University KTM batch ${label}`);
    await store.put(`${folder}/${label}-batch.pdf`, batchPdf, 'application/pdf');
    await store.put(`${folder}/${label}-manifest.csv`, manifestCsv(label, rows), 'text/csv; charset=utf-8');
    await db.cardBatch.update({
      where: { id: batch.id },
      data: { batchPdfUrl: `${folder}/${label}-batch.pdf`, manifestCsvUrl: `${folder}/${label}-manifest.csv`, filesGeneratedAt: new Date(), filesError: null },
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[card-print] batch files failed', batch.id, error);
    await db.cardBatch.update({ where: { id: batch.id }, data: { filesError: error.slice(0, 500) } });
    return { ok: false, error };
  }
}
