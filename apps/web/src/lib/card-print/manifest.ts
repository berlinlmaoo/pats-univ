/** The vendor's CSV manifest (pure, so it can be unit tested). */

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote everything that needs it; neutralise spreadsheet formulas in member-entered names.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export interface ManifestRow {
  seq: number;
  nim: string;
  fullName: string;
  city: string;
  file: string;
  url: string;
}

/** What the vendor gets with the PDFs: one row per card, in batch order, with page numbers. */
export function manifestCsv(batch: string, rows: ManifestRow[]): string {
  const header = ['batch', 'seq', 'nim', 'full_name', 'city', 'file', 'batch_pdf_pages', 'qr_url'];
  const lines = rows.map((r) => [batch, r.seq, r.nim, r.fullName, r.city, r.file, `${r.seq * 2 - 1}-${r.seq * 2}`, r.url].map(csvCell).join(','));
  // BOM so Excel opens UTF-8 names correctly.
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
