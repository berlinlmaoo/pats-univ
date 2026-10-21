import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const assets = path.join(root, 'app/src/main/assets');
const dictionaries = {};
for (const language of ['en', 'id']) {
  const dictionary = JSON.parse(fs.readFileSync(path.join(assets, `${language}.json`), 'utf8'));
  for (const name of fs.readdirSync(assets).filter(n => n.startsWith('ux-') && n.endsWith(`-${language}.json`)).sort()) {
    const additions = JSON.parse(fs.readFileSync(path.join(assets, name), 'utf8'));
    for (const namespace of Object.keys(additions)) {
      if (namespace in dictionary) throw Error(`Duplicate localization namespace: ${namespace}`);
      dictionary[namespace] = additions[namespace];
    }
  }
  dictionaries[language] = dictionary;
}
const keys = new Set();
for (const file of fs.readdirSync(path.join(root, 'app/src/main/java/id/znetworks/patsuniv'))) {
  if (!file.endsWith('.kt')) continue;
  const source = fs.readFileSync(path.join(root, 'app/src/main/java/id/znetworks/patsuniv', file), 'utf8');
  for (const match of source.matchAll(/"((?:ux|uxShell|uxMember|uxSocial|uxAdmin|app|social|loyalty|common|phase5|events|cardPage|nfc|errors|native|ktm|join|validation|auth|otp|ops)\.[A-Za-z][A-Za-z0-9_.]+)"/g)) keys.add(match[1]);
}
let failures = 0;
const get = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
for (const key of [...keys].filter(k => !k.endsWith('.'))) {
  for (const language of ['en', 'id']) if (typeof get(dictionaries[language], key) !== 'string') { console.error(`${language}: missing ${key}`); failures++; }
}
function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => typeof value === 'string' ? [[prefix + key, value]] : flatten(value, prefix + key + '.'));
}
const localized = {};
for (const language of ['en', 'id']) localized[language] = new Map(flatten(dictionaries[language]).filter(([key]) => /^ux(?:Shell|Member|Social|Admin)\./.test(key)));
const placeholders = value => [...value.matchAll(/\{([^}]+)\}/g)].map(m => m[1]).sort().join(',');
for (const key of new Set([...localized.en.keys(), ...localized.id.keys()])) {
  const en = localized.en.get(key), id = localized.id.get(key);
  if (!en || !id || placeholders(en) !== placeholders(id)) { console.error(`EN/ID parity: ${key}`); failures++; }
}
console.log(`${keys.size} literal keys and ${localized.en.size} redesign translations checked in EN and ID; ${failures} failures`);
process.exitCode = failures ? 1 : 0;
