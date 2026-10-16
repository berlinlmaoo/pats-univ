import { describe, expect, it, vi } from 'vitest';
import { formatCount, formatRupiah } from '@pats/shared';
vi.mock('../../src/lib/db', () => ({ db: {} }));
import {
  csvText,
  safeExportText,
  xlsxBytes,
} from '../../src/lib/loyalty/export';

describe('exports', () => {
  it('quotes CSV correctly, keeps a UTF-8 BOM and formats counts and rupiah exactly', () => {
    const csv = csvText({
      headers: ['Pax', 'Revenue', 'Name'],
      rows: [[formatCount(3800), formatRupiah(6000000), 'A, "B"\nC']],
    });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"3.800","Rp 6.000.000","A, ""B""\nC"');
  });
  it('neutralises formula injection including leading whitespace', () => {
    for (const v of ['=1+1', '+SUM(A1)', '@test', '-cmd', ' \t=1+1', '\n=1+1'])
      expect(safeExportText(v)).toBe(`'${v}`);
    expect(safeExportText('Rara')).toBe('Rara');
  });
  it('writes an actual XLSX workbook with locale independent display strings', async () => {
    const { Workbook } = await import('exceljs');
    const bytes = await xlsxBytes({
      headers: ['Pax', 'Revenue'],
      rows: [[formatCount(3800), formatRupiah(6000000)]],
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(workbook.worksheets[0]!.getCell('A2').value).toBe('3.800');
    expect(workbook.worksheets[0]!.getCell('B2').value).toBe('Rp 6.000.000');
  });
});
