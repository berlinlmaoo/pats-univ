import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
for (const lang of ['en', 'id']) {
  const source = fs.readFileSync(`${root}/packages/shared/src/i18n/${lang}.ts`, 'utf8');
  const start = source.indexOf('= {');
  const end = source.lastIndexOf('}');
  const dictionary = vm.runInNewContext(`(${source.slice(start + 2, end + 1)})`, {}, { timeout: 1000 });
  const flat = {};
  function flatten(obj, prefix = '') {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix + k;
      if (typeof v === 'string') flat[key] = v;
      else flatten(v, key + '.');
    }
  }
  flatten(dictionary);
  Object.assign(flat, JSON.parse(fs.readFileSync(`${root}/apps/ios/scripts/${lang}-native.json`, 'utf8')));
  const dir = `${root}/apps/ios/Sources/Resources/${lang}.lproj`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/Localizable.strings`, Object.entries(flat).sort().map(([k,v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)};`).join('\n') + '\n');
}
fs.copyFileSync(`${root}/packages/shared/src/colors.json`, `${root}/apps/ios/Sources/Resources/colors.json`);
