import { describe, expect, it } from 'vitest';
import {
  ageOn,
  dictionaries,
  en,
  formatCount,
  formatDate,
  formatNim,
  formatPhone,
  formatRupiah,
  formatTime,
  matchLocale,
  normalizePhone,
  parseIsoDate,
  parseNim,
  registrationSchema,
  translate,
} from '../src';
import { brand, colors, toCssVariables, type ColorTokens } from '../src/tokens';

describe('format', () => {
  it('formats counts and money in house style', () => {
    expect(formatCount(3800)).toBe('3.800');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234567)).toBe('1.234.567');
    expect(formatRupiah(6_000_000)).toBe('Rp 6.000.000');
    expect(formatRupiah(500)).toBe('Rp 500');
  });

  it('hides the current year and shows other years', () => {
    const now = new Date('2026-10-16T03:00:00Z');
    expect(formatDate(new Date('2026-10-14T12:00:00Z'), 'en', { now })).toBe('14 Oct');
    expect(formatDate(new Date('2026-10-14T12:00:00Z'), 'id', { now })).toBe('14 Okt');
    expect(formatDate(new Date('2025-05-01T12:00:00Z'), 'id', { now })).toBe('1 Mei 2025');
  });

  it('uses the city time zone for dates and times', () => {
    // 17:30 UTC is 00:30 the next day in Jakarta.
    const d = new Date('2026-10-14T17:30:00Z');
    expect(formatDate(d, 'en', { now: d })).toBe('15 Oct');
    expect(formatTime(d)).toBe('00.30 WIB');
    expect(formatTime(new Date('2026-10-14T12:30:00Z'))).toBe('19.30 WIB');
    expect(formatTime(new Date('2026-10-14T12:30:00Z'), { timeZone: 'Asia/Makassar' })).toBe('20.30 WITA');
  });

  it('computes age on the birthday boundary', () => {
    const dob = { year: 2008, month: 10, day: 16 };
    expect(ageOn(dob, new Date('2026-10-15T12:00:00Z'))).toBe(17);
    expect(ageOn(dob, new Date('2026-10-16T01:00:00Z'))).toBe(18);
  });

  it('rejects impossible dates', () => {
    expect(parseIsoDate('2001-02-29')).toBeNull();
    expect(parseIsoDate('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
  });
});

describe('nim', () => {
  it('formats and parses', () => {
    expect(formatNim('JKT', 2026, 42)).toBe('JKT2600042');
    expect(parseNim('jkt2600042')).toEqual({ cityCode: 'JKT', yy: 26, sequence: 42 });
    expect(() => formatNim('JKT', 2026, 100_000)).toThrow();
  });
});

describe('phone', () => {
  it('normalises Indonesian formats to E.164', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('+6281234567890');
    expect(normalizePhone('+62 812 3456 7890')).toBe('+6281234567890');
    expect(normalizePhone('6281234567890')).toBe('+6281234567890');
    expect(normalizePhone('81234567890')).toBe('+6281234567890');
    expect(normalizePhone('+65 9123 4567')).toBe('+6591234567');
    expect(normalizePhone('021 555 1234')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
    expect(formatPhone('+6281322223333')).toBe('+62 813-2222-3333');
    expect(formatPhone('+6591234567')).toBe('+6591234567');
  });
});

describe('registration schema', () => {
  const valid = {
    fullName: '  Rara Anindya ',
    dateOfBirth: '2000-01-31',
    cityId: 'city_1',
    favoriteSong: 'Midnight City — M83',
    favoriteGenre: 'Synthpop',
    email: ' Rara@Example.COM ',
    phone: '0812 3456 7890',
    consent: true as const,
  };

  it('normalises input', () => {
    const out = registrationSchema.parse(valid);
    expect(out.fullName).toBe('Rara Anindya');
    expect(out.email).toBe('rara@example.com');
    expect(out.phone).toBe('+6281234567890');
    expect(out.quotes).toBe('');
    expect(out.locale).toBe('id');
  });

  it('reports i18n keys', () => {
    const res = registrationSchema.safeParse({ ...valid, email: 'nope', phone: 'x', consent: false });
    expect(res.success).toBe(false);
    const messages = res.error!.issues.map((i) => i.message);
    expect(messages).toContain('validation.emailInvalid');
    expect(messages).toContain('validation.phoneInvalid');
    expect(messages).toContain('validation.consentRequired');
  });
});

describe('i18n', () => {
  it('has the same keys in every locale', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'string' ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`),
      );
    const base = keys(en).sort();
    for (const dict of Object.values(dictionaries)) expect(keys(dict).sort()).toEqual(base);
  });

  it('interpolates and matches locales', () => {
    expect(translate('id', 'join.successTitle', { name: 'Rara' })).toBe('Selamat datang, Rara');
    expect(matchLocale('en-US,en;q=0.9')).toBe('en');
    expect(matchLocale('id-ID')).toBe('id');
    expect(matchLocale('fr-FR')).toBe('id');
  });
});

describe('tokens', () => {
  it('emits light and dark variables', () => {
    const css = toCssVariables();
    expect(css).toContain('--pats-accent:#001836;');
    expect(css).toContain('prefers-color-scheme: dark');
  });

  it('uses the crest navy as the light primary and accent', () => {
    expect(colors.light.primary).toBe(brand.navy);
    expect(colors.light.accent).toBe(brand.navy);
    expect(colors.light.secondary).toBe(brand.maroon);
  });

  it('keeps errors a real red, not the brand maroon', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const c = colors[scheme];
      for (const key of ['danger', 'dangerText', 'dangerSolid'] as const) {
        expect(c[key]).not.toBe(c.secondary);
        expect(c[key]).not.toBe(brand.maroon);
      }
    }
  });

  // Every text/background pair the components use; DESIGN.md §2 lists the ratios.
  const TEXT_PAIRS: [keyof ColorTokens, keyof ColorTokens][] = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['text', 'surfaceMuted'],
    ['text', 'surfaceHover'],
    ['textMuted', 'bg'],
    ['textMuted', 'surface'],
    ['textMuted', 'surfaceMuted'],
    ['textMuted', 'surfaceHover'],
    ['placeholder', 'surface'],
    ['primaryText', 'primary'],
    ['accentText', 'bg'],
    ['accentText', 'surface'],
    ['accentSubtleText', 'accentSubtle'],
    ['secondaryText', 'secondary'],
    ['secondarySubtleText', 'secondarySubtle'],
    ['successText', 'successSubtle'],
    ['successText', 'surface'],
    ['warningText', 'warningSubtle'],
    ['warningText', 'surface'],
    ['dangerText', 'dangerSubtle'],
    ['dangerText', 'surface'],
    ['dangerText', 'bg'],
    ['onSolid', 'dangerSolid'],
  ];
  // Non-text UI that must stay visible (WCAG 1.4.11, 3:1): focus ring, primary button edge.
  const UI_PAIRS: [keyof ColorTokens, keyof ColorTokens][] = [
    ['accent', 'surface'],
    ['accent', 'bg'],
    ['primary', 'surface'],
    ['primary', 'bg'],
  ];

  for (const scheme of ['light', 'dark'] as const) {
    it(`passes WCAG AA for every text pair in ${scheme}`, () => {
      const c = colors[scheme];
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(contrast(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const [fg, bg] of UI_PAIRS) {
        expect(contrast(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
