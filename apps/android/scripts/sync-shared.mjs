import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = path.resolve(import.meta.dirname, '../../..');
const assets = path.join(root, 'apps/android/app/src/main/assets');
fs.mkdirSync(assets, { recursive: true });
for (const language of ['en', 'id']) {
  const source = fs.readFileSync(path.join(root, `packages/shared/src/i18n/${language}.ts`), 'utf8');
  const object = source.slice(source.indexOf('{', source.indexOf(`export const ${language}`)), source.lastIndexOf('}') + 1);
  const strings = vm.runInNewContext(`(${object})`, Object.create(null));
  fs.writeFileSync(path.join(assets, `${language}.json`), JSON.stringify(strings, null, 2) + '\n');
}
fs.copyFileSync(path.join(root, 'packages/shared/src/colors.json'), path.join(assets, 'colors.json'));
// Read the same geometry and typography used by web; Android never maintains a second set.
const tokens = fs.readFileSync(path.join(root, 'packages/shared/src/tokens.ts'), 'utf8');
const design = {};
for (const name of ['ktm', 'varsity', 'type', 'radius', 'space', 'size']) {
  const block = tokens.match(new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\n\\}) as const`))[1];
  design[name] = vm.runInNewContext(`(${block})`, Object.create(null));
}
design.cardValueTracking = Number(tokens.match(/tracking: (-[\d.]+),\s*\n  \},\s*\n  mono/)[1]);
design.varsityStroke = Number(tokens.match(/export const varsityStroke = ([\d.]+)/)[1]);
fs.writeFileSync(path.join(assets, 'design.json'), JSON.stringify(design, null, 2) + '\n');
const res = path.join(root, 'apps/android/app/build/generated/patsRes');
for (const folder of ['font', 'drawable']) fs.mkdirSync(path.join(res, folder), { recursive: true });
for (const [source, target] of [
  ['packages/shared/assets/fonts/card-value.ttf', 'font/card_value.ttf'],
  ['apps/web/src/app/fonts/Figtree-var.ttf', 'font/figtree.ttf'],
  ['apps/web/src/app/fonts/Graduate-Regular.ttf', 'font/graduate.ttf'],
  ['apps/web/public/brand/crest-240.png', 'drawable/official_crest.png'],
  ['apps/web/public/brand/lockup-cream-720.png', 'drawable/lockup_cream.png'],
  ['apps/web/public/ktm/front-1600.webp', 'drawable/ktm_front.webp'],
  ['apps/web/public/ktm/back-1600.webp', 'drawable/ktm_back.webp'],
  ['apps/mobile/assets/icon.png', 'drawable/official_icon.png'],
  ['apps/mobile/assets/adaptive-icon.png', 'drawable/official_adaptive.png'],
]) fs.copyFileSync(path.join(root, source), path.join(res, target));
const palette = JSON.parse(fs.readFileSync(path.join(assets, 'colors.json'), 'utf8'));
for (const [mode, folder] of [['light', 'values'], ['dark', 'values-night']]) {
  const dir = path.join(root, 'apps/android/app/src/main/res', folder); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'colors.xml'), `<resources>\n    <color name="pats_primary">${palette[mode].primary}</color>\n    <color name="pats_accent">${palette[mode].accent}</color>\n    <color name="pats_on_primary">${palette[mode].primaryText}</color>\n    <color name="pats_background">${palette[mode].bg}</color>\n    <color name="pats_band">${palette[mode].band}</color>\n    <color name="pats_navy">${palette.brand.navy}</color>\n</resources>\n`);
}
