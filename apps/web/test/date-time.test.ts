import { describe, expect, it } from 'vitest';
import { displayToIsoDate, displayToIsoTime, isoToDisplayDate } from '@/components/ui/date-time';

describe('date and time inputs (dd/mm/yyyy, 24-hour)', () => {
  it('round-trips dates and rejects impossible ones', () => {
    expect(isoToDisplayDate('2026-10-18')).toBe('18/10/2026');
    expect(displayToIsoDate('18/10/2026')).toBe('2026-10-18');
    expect(displayToIsoDate('1.2.2027')).toBe('2027-02-01');
    expect(displayToIsoDate('31/02/2026')).toBe('');
    expect(displayToIsoDate('18/10')).toBe('');
  });
  it('reads 24-hour times in either separator', () => {
    expect(displayToIsoTime('20.30')).toBe('20:30');
    expect(displayToIsoTime('2030')).toBe('20:30');
    expect(displayToIsoTime('9:05')).toBe('09:05');
    expect(displayToIsoTime('24:00')).toBe('');
    expect(displayToIsoTime('8 PM')).toBe('');
  });
});
