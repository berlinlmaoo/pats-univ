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
