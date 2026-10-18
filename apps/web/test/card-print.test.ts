import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { imageSize } from '../src/lib/members/photo';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('KTM print template', () => {
  it('embeds the same card value font as web and the apps', () => {
    const shared = readFileSync(path.join(web, '../../packages/shared/assets/fonts/card-value.ttf'));
    const copy = readFileSync(path.join(web, 'card-templates/ktm-2026/fonts/card-value.ttf'));
    expect(copy.equals(shared)).toBe(true);
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
