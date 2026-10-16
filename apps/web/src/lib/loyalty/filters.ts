import { parseIsoDate, parseZonedDateTime } from '@pats/shared';
import { AppError } from '../http/errors';

export function periodFilters(params: URLSearchParams) {
  const parse = (key: string, exclusive: boolean) => {
    const raw = params.get(key);
    if (!raw) return undefined;
    const p = parseIsoDate(raw);
    if (!p) throw new AppError('VALIDATION', 422);
    const start = parseZonedDateTime(raw, '00:00', 'Asia/Jakarta');
    if (!start) throw new AppError('VALIDATION', 422);
    return new Date(start.getTime() + (exclusive ? 86_400_000 : 0));
  };
  const from = parse('from', false),
    to = parse('to', true);
  if (from && to && from >= to) throw new AppError('VALIDATION', 422);
  return { cityId: params.get('cityId') || undefined, from, to };
}
