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
export async function tap(text) { tapNode(nodes(dump()).findLast(n => n.text === text || n['content-desc'] === text)); await sleep(400); }
export async function scrollTo(text) {
  for (let i = 0; i < 6; i++) {
    if (nodes(dump()).some(node => node.text === text)) return;
    adb('shell', 'input', 'swipe', '650', '2200', '650', '700', '400'); await sleep(300);
  }
  throw Error('Text not found while scrolling: ' + text);
}
export async function fill(label, value) {
  const list = nodes(dump());
  const labelIndex = list.findIndex(node => node.text === label || node.text === label.toUpperCase());
  let field = list.find(node => node.class === 'android.widget.EditText' && node['content-desc'] === label);
  if (!field) for (let i = labelIndex; i < list.length && i >= 0; i++) if (list[i].class === 'android.widget.EditText') { field = list[i]; break; }
  tapNode(field); await sleep(500);
  adb('shell', 'input', 'keyevent', '123');
  for (let i = 0; i < field.text.length; i++) adb('shell', 'input', 'keyevent', '67');
  if (value) adb('shell', 'input', 'text', value.replaceAll(' ', '%s'));
  await sleep(300); adb('shell', 'input', 'keyevent', '4'); await sleep(400);
}
export function screenshot(name) {
  const dir = process.env.PATS_SHOTS ?? 'C:/Users/Berlin/Documents/Dev/pats-shots'; fs.mkdirSync(dir, { recursive: true });
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
  tapNode(nodes(verify).find(n => n.class === 'android.widget.EditText')); await sleep(700); adb('shell', 'input', 'text', code); await sleep(600);
  if (nodes(dump()).some(n => n.class === 'android.widget.EditText')) adb('shell', 'input', 'keyevent', '4');
  await sleep(700);
  const after = nodes(dump());
  const verifyButton = after.find(n => n.text === (verify.includes('Verifikasi') ? 'Verifikasi' : 'Verify'));
  if (verifyButton) tapNode(verifyButton);
  await sleep(2200);
}
if (process.argv[2] === 'login') { await login(process.argv[3]); screenshot(process.argv[4] ?? '1-member'); console.log(nodes(dump()).filter(n => n.text).map(n => n.text).join(' | ')); }
