import fs from 'node:fs';
import { adb, dump, nodes, tap, fill, sleep, scrollTo, screenshot } from './device.mjs';
import { route } from './screenshots.mjs';
const fixture = JSON.parse(fs.readFileSync(new URL('../.qa/fixtures.json', import.meta.url)));
const texts = () => nodes(dump()).filter(n => n.text).map(n => n.text);
function expect(text) { const actual = texts(); if (!actual.some(t => t.includes(text))) throw Error(`Missing ${text}: ${actual.join(' | ')}`); }
async function confirm(label) { await tap(label); await tap(label); await sleep(1800); }
if (process.argv[2] === 'manual') {
  await route(`manual/${fixture.activeEventId}`);
  await fill('Name or NIM', 'Bima'); await sleep(1200); console.log(texts());
}
if (process.argv[2] === 'claim') {
  await route('claims-review'); await tap('Open private receipt'); await sleep(1500); screenshot('3-private-receipt');
  await scrollTo('Reservations brought'); await fill('Reservations brought', '3');
  await scrollTo('Approve'); await confirm('Approve'); screenshot('3-claim-approved'); expect('Approved');
}
if (process.argv[2] === 'reservation') {
  await route('social-operations'); await confirm('Confirm'); expect('Confirmed'); screenshot('3-reservation-confirmed');
  await tap('Chat with crew'); await sleep(1200); screenshot('3-reservation-chat'); console.log(texts());
}
if (process.argv[2] === 'inspect') console.log(texts());
