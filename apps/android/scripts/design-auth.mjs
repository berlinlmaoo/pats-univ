import { adb, dump, nodes, tap, tapNode, fill, sleep, screenshot } from './device.mjs';

// Starts on the signed-out login screen and finishes with a real demo OTP session.
const email = process.argv[2] ?? 'admin.jkt@patsuniv.test';
for(const scheme of ['light','dark']) {
  adb('shell','cmd','uimode','night',scheme === 'dark' ? 'yes':'no');
  for(const language of ['en','id']) {
    await tap(language.toUpperCase()); await sleep(300);
    screenshot(`auth-${language}-${scheme}-login`);
  }
}
await fill('Email',email); await tap('Kirim kode'); await sleep(1000);
const code = dump().match(/(?:kodemu|code is|kode)[^"\d]*([0-9]{6})/)?.[1];
if(!code) throw Error('Demo OTP was not displayed');
for(const scheme of ['light','dark']) {
  adb('shell','cmd','uimode','night',scheme === 'dark' ? 'yes':'no');
  for(const language of ['en','id']) {
    await tap(language.toUpperCase()); await sleep(300);
    const current = nodes(dump());
    if(!current.some(n=>n.class === 'android.widget.EditText') || !current.some(n=>/Verification code|Kode verifikasi/i.test(n['content-desc'] || n.text))) throw Error('Pending OTP screen was lost during theme change');
    screenshot(`auth-${language}-${scheme}-verify`);
  }
}
tapNode(nodes(dump()).find(n=>n.class === 'android.widget.EditText'));
adb('shell','input','text',code); await sleep(1800);
const signedIn = nodes(dump());
if(signedIn.some(n=>n.class === 'android.widget.EditText') || !signedIn.some(n=>n.text === 'ADMIN' || n.text === 'BERANDA' || n.text === 'HOME')) throw Error('OTP did not reach the authenticated shell');
console.log('OTP auto-submit passed for the selected demo account');
