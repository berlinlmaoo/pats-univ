import fs from 'node:fs';
import path from 'node:path';
import http2 from 'node:http2';
// Use only the selected emulator's advertised local controller; never print its credentials.
const directory = `${process.env.LOCALAPPDATA}/Temp/avd/running`;
const selected = fs.readdirSync(directory).filter(f => /^pid.*\.ini$/.test(f)).map(f => Object.fromEntries(fs.readFileSync(path.join(directory, f), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))).find(c => c['port.serial'] === '5554' && c['avd.id'] === 'Pixel_10_Pro');
if (!selected) throw Error('Pixel_10_Pro controller not found');
const target = process.argv[2] === 'position' ? 0 : 1;
const values = process.argv.slice(3).map(Number);
const floats = Buffer.alloc(12); values.forEach((v, i) => floats.writeFloatLE(v, i * 4));
const payload = values.length ? Buffer.concat([Buffer.from([8, target, 26, 14, 10, 12]), floats, Buffer.from([32, 1])]) : Buffer.from([8, target]);
const frame = Buffer.alloc(5); frame.writeUInt32BE(payload.length, 1);
const client = http2.connect(`http://127.0.0.1:${selected['grpc.port']}`);
const req = client.request({ ':method': 'POST', ':path': `/android.emulation.control.EmulatorController/${values.length ? 'set' : 'get'}PhysicalModel`, 'content-type': 'application/grpc', te: 'trailers', authorization: `Bearer ${selected['grpc.token']}` });
req.on('trailers', h => console.log('Controller result:', h['grpc-status'], h['grpc-message'] ?? ''));
req.on('data', chunk => { if (!values.length) console.log('Physical value bytes:', chunk.toString('hex')); });
req.on('end', () => client.close());
req.setTimeout(5000, () => { req.close(); client.close(); });
req.end(Buffer.concat([frame, payload]));
