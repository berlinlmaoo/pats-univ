import fs from 'node:fs';
import path from 'node:path';
import { adb, sleep, screenshot, dump, nodes } from './device.mjs';
const root = path.resolve(import.meta.dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, '.qa/fixtures.json'), 'utf8'));
const routes = {
  card: 'card', events: 'events', event: `event/${fixtures.activeEventId}`, wallet: 'wallet', leaderboard: 'leaderboard', claims: 'claims', draw: `draw/${fixtures.activeEventId}`, history: 'history', region: 'region-change', roaming: 'roaming', reservation: `reservation/${fixtures.activeEventId}`, hub: 'hub', channel: 'channel/phase4-JKT-CHAT', timeline: 'channel/phase4-JKT-TIMELINE', operations: 'social-operations', notifications: 'notifications', preferences: 'notification-settings', profile: 'profile', promoter: 'promoter',
};
export async function route(value) {
  adb('shell', 'am', 'start', '-W', '-n', 'id.znetworks.patsuniv/.MainActivity', '--es', 'qaRoute', value, '--ez', 'qaCapture', 'true');
  await sleep(1600);
}
export async function capture(name, value, phase = '2') {
  await route(value);
  const xml = dump(); fs.writeFileSync(path.join(root, '.qa', `${phase}-${name}.xml`), xml);
  screenshot(`${phase}-${name}`);
  const copy = nodes(xml).filter(n => n.text).map(n => n.text);
  const missing = copy.filter(text => /^(?:app|social|loyalty|events|phase5|common|errors)\.[A-Za-z]/.test(text));
  if (missing.length) throw Error('Untranslated: ' + missing.join(' | '));
  console.log(`${name}: ${copy.join(' | ').slice(0, 650)}`);
}
if (process.argv[2] === 'member') for (const name of process.argv.slice(3)) await capture(name, routes[name]);
