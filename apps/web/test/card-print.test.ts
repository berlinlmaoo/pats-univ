import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fonts, ktm } from '@pats/shared/tokens';
import { imageSize } from '../src/lib/members/photo';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const templateHtml = (dir: string) => readFileSync(path.join(web, `card-templates/${dir}/template.html`), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

describe('KTM print templates', () => {
  for (const dir of ['ktm-2026', 'ktm-2026-qotd']) {
    it(`${dir}: embeds the same card value font as web and the apps`, () => {
      const shared = readFileSync(path.join(web, '../../packages/shared/assets/fonts/card-value.ttf'));
      const copy = readFileSync(path.join(web, `card-templates/${dir}/fonts/card-value.ttf`));
      expect(copy.equals(shared)).toBe(true);
    });

    it(`${dir}: uses the same value size, origin and tracking as the app card (tokens.ts)`, () => {
      const html = templateHtml(dir);
      const css = html.match(/\.value \{([^}]*)\}/)?.[1] ?? '';
      const mm = (n: number) => n * 85.6;
      const sizePt = Number(css.match(/font-size: ([\d.]+)pt/)?.[1]);
      expect(Math.abs((sizePt * 25.4) / 72 - mm(ktm.valueCap / fonts.cardValue.capHeight))).toBeLessThan(0.01);
      expect(Math.abs(Number(css.match(/left: ([\d.]+)mm/)?.[1]) - mm(ktm.valueX))).toBeLessThan(0.01);
      expect(css).toContain(`letter-spacing: ${fonts.cardValue.tracking}em`);
      const third = dir === 'ktm-2026' ? (['genre', ktm.genreY] as const) : (['quote', ktm.quoteY] as const);
      for (const [k, y] of [['name', ktm.nameY], ['drink', ktm.drinkY], third] as const) {
        const top = html.match(new RegExp(`\\.${k} \\{ top: calc\\(([\\d.]+)mm - ([\\d.]+)em\\)`));
        expect(Math.abs(Number(top?.[1]) - y * 54)).toBeLessThan(0.01);
        expect(Number(top?.[2])).toBe(fonts.cardValue.capTop);
      }
    });
  }

  it('ktm-2026 prints name, drink, genre and the QR, never the NIM', () => {
    const html = templateHtml('ktm-2026');
    for (const slot of ['{{fullName}}', '{{favoriteDrink}}', '{{favoriteGenre}}', '{{qrInverse}}']) expect(html).toContain(slot);
    expect(html).not.toContain('{{nim}}');
  });

  it('ktm-2026-qotd (21 Oct design) prints name, drink, QOTD and the QR, never the NIM or genre', () => {
    const html = templateHtml('ktm-2026-qotd');
    for (const slot of ['{{fullName}}', '{{favoriteDrink}}', '{{quote}}', '{{qrInverse}}']) expect(html).toContain(slot);
    expect(html).not.toContain('{{nim}}');
    expect(html).not.toContain('{{favoriteGenre}}');
    // A long quote keeps the height of two full-size lines instead of running off the card.
    expect(html).toMatch(/class="value quote" data-fit="box:2;min:[\d.]+"/);
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
