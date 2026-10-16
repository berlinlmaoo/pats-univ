/**
 * NIM (member number): <3-letter city code><2-digit year><5-digit sequence>, e.g. JKT2600042.
 * The sequence restarts per city per year; the NIM never changes when a member moves city.
 * Format is a proposal (PRODUCT.md §6.8, T6) and lives only here.
 */
export const NIM_PATTERN = /^[A-Z]{3}\d{2}\d{5}$/;
export const NIM_MAX_SEQUENCE = 99_999;

export function formatNim(cityCode: string, year: number, sequence: number): string {
  if (!/^[A-Z]{3}$/.test(cityCode)) throw new Error(`Invalid city code: ${cityCode}`);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > NIM_MAX_SEQUENCE) {
    throw new Error(`NIM sequence out of range: ${sequence}`);
  }
  const yy = String(year % 100).padStart(2, '0');
  return `${cityCode}${yy}${String(sequence).padStart(5, '0')}`;
}

export function parseNim(nim: string): { cityCode: string; yy: number; sequence: number } | null {
  const value = nim.trim().toUpperCase();
  if (!NIM_PATTERN.test(value)) return null;
  return { cityCode: value.slice(0, 3), yy: Number(value.slice(3, 5)), sequence: Number(value.slice(5)) };
}
