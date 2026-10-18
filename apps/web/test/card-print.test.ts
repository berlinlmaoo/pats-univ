import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fonts, ktm } from '@pats/shared/tokens';
import { imageSize } from '../src/lib/members/photo';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('KTM print template', () => {
  it('embeds the same card value font as web and the apps', () => {
    const shared = readFileSync(path.join(web, '../../packages/shared/assets/fonts/card-value.ttf'));
    const copy = readFileSync(path.join(web, 'card-templates/ktm-2026/fonts/card-value.ttf'));
    expect(copy.equals(shared)).toBe(true);
  });

  it('uses the same value size, origin and tracking as the app card (tokens.ts)', () => {
    const html = readFileSync(path.join(web, 'card-templates/ktm-2026/template.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const css = html.match(/\.value \{([^}]*)\}/)?.[1] ?? '';
    const mm = (n: number) => n * 85.6;
    const sizePt = Number(css.match(/font-size: ([\d.]+)pt/)?.[1]);
    expect(Math.abs((sizePt * 25.4) / 72 - mm(ktm.valueCap / fonts.cardValue.capHeight))).toBeLessThan(0.01);
    expect(Math.abs(Number(css.match(/left: ([\d.]+)mm/)?.[1]) - mm(ktm.valueX))).toBeLessThan(0.01);
    expect(css).toContain(`letter-spacing: ${fonts.cardValue.tracking}em`);
    for (const k of ['name', 'drink', 'genre'] as const) {
      const top = html.match(new RegExp(`\\.${k} \\{ top: calc\\(([\\d.]+)mm - ([\\d.]+)em\\)`));
      expect(Math.abs(Number(top?.[1]) - ktm[`${k}Y`] * 54)).toBeLessThan(0.01);
      expect(Number(top?.[2])).toBe(fonts.cardValue.capTop);
    }
  });

  it('prints name, drink, genre and the QR, never the NIM', () => {
    const html = readFileSync(path.join(web, 'card-templates/ktm-2026/template.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const slot of ['{{fullName}}', '{{favoriteDrink}}', '{{favoriteGenre}}', '{{qrInverse}}']) expect(html).toContain(slot);
    expect(html).not.toContain('{{nim}}');
  });
});

describe('member photo header check', () => {
  it('reads PNG dimensions and refuses non-images', () => {
    const png = Buffer.alloc(33);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
    png.writeUInt32BE(13, 8);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(imageSize(png, 'image/png')).toEqual({ width: 640, height: 480 });
    expect(imageSize(Buffer.from('not an image at all, just text'), 'image/jpeg')).toBeNull();
  });
});
