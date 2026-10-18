import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
export const serial = process.env.PATS_SERIAL ?? 'emulator-5554';
const adbPath = `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
export const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000 });
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function dump() { adb('shell', 'uiautomator', 'dump', '/sdcard/pats-ui.xml'); return adb('shell', 'cat', '/sdcard/pats-ui.xml'); }
export function nodes(xml) { return [...xml.matchAll(/<node\b([^>]+)>?/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))); }
export function tapNode(node) {
  if (!node) throw Error('UI element not found');
  const box = node.bounds.match(/\d+/g).map(Number);
  adb('shell', 'input', 'tap', String((box[0] + box[2]) / 2), String((box[1] + box[3]) / 2));
}
export async function tap(text) { tapNode(nodes(dump()).findLast(n => n.text === text)); await sleep(400); }
export function screenshot(name) {
  const dir = 'C:/Users/Berlin/Documents/Dev/pats-shots'; fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/${name}.png`, execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 20 * 1024 * 1024 }));
}
export async function login(email) {
  const field = nodes(dump()).find(n => n.class === 'android.widget.EditText');
  tapNode(field);
  await sleep(700);
  if (field.text !== email) { adb('shell', 'input', 'keyevent', '123'); for (let i = 0; i < field.text.length; i++) adb('shell', 'input', 'keyevent', '67'); adb('shell', 'input', 'text', email); }
  await sleep(500); adb('shell', 'input', 'keyevent', '4'); await sleep(700);
  const ui = dump(); await tap(ui.includes('Kirim kode') ? 'Kirim kode' : 'Send code'); await sleep(1800);
  const verify = dump(); const code = verify.match(/(?:kodemu|code is|kode)[^"\d]*([0-9]{6})/)?.[1];
  if (!code) throw Error('Demo code was not shown: ' + nodes(verify).filter(n => n.text).map(n => n.text).join(' | '));
  screenshot('1-otp');
  tapNode(nodes(verify).find(n => n.class === 'android.widget.EditText')); await sleep(700); adb('shell', 'input', 'text', code); await sleep(400); adb('shell', 'input', 'keyevent', '4'); await sleep(700);
  await tap(verify.includes('Verifikasi') ? 'Verifikasi' : 'Verify'); await sleep(2200);
}
if (process.argv[2] === 'login') { await login(process.argv[3]); screenshot(process.argv[4] ?? '1-member'); console.log(nodes(dump()).filter(n => n.text).map(n => n.text).join(' | ')); }
