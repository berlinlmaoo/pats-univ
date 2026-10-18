import { adb, sleep, screenshot, dump, nodes } from './device.mjs';
import { route } from './screenshots.mjs';
const copy = () => nodes(dump()).filter(n => n.text).map(n => n.text);
await route('channel/phase4-JKT-CHAT');
try {
  adb('shell', 'svc', 'wifi', 'disable'); adb('shell', 'svc', 'data', 'disable'); await sleep(4500);
  screenshot('4-channel-offline'); console.log('Disconnected:', copy().slice(0, 5));
} finally { adb('shell', 'svc', 'wifi', 'enable'); adb('shell', 'svc', 'data', 'enable'); }
for (let attempt = 0; attempt < 8; attempt++) {
  await sleep(4000);
  if (copy().some(t => ['Connected live', 'Terhubung langsung'].includes(t))) { screenshot('4-channel-reconnected'); console.log('Room rejoined with renewed credentials'); process.exit(0); }
}
throw Error('Room did not reconnect after restoring the emulator network');
