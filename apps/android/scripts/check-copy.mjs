import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const keys = new Set();
for (const file of fs.readdirSync(path.join(root, 'app/src/main/java/id/znetworks/patsuniv'))) {
  if (!file.endsWith('.kt')) continue;
  const source = fs.readFileSync(path.join(root, 'app/src/main/java/id/znetworks/patsuniv', file), 'utf8');
  for (const match of source.matchAll(/"((?:app|social|loyalty|common|phase5|events|cardPage|nfc|errors|native|ktm|join|validation|auth|otp|ops)\.[A-Za-z][A-Za-z0-9_.]+)"/g)) keys.add(match[1]);
}
let failed = false;
for (const language of ['en', 'id']) {
  const dictionary = JSON.parse(fs.readFileSync(path.join(root, `app/src/main/assets/${language}.json`), 'utf8'));
  const missing = [...keys].filter(key => !key.endsWith('.') && typeof key.split('.').reduce((obj, part) => obj?.[part], dictionary) !== 'string');
  console.log(missing.length ? `${language}: ${missing.join('\n')}` : `${language}: ${keys.size} literal copy keys verified`);
  failed ||= missing.length > 0;
}
process.exitCode = failed ? 1 : 0;
