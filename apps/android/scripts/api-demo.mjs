import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(import.meta.dirname, '../.qa');
fs.mkdirSync(dir, { recursive: true });
export const base = process.env.PATS_API_URL ?? (() => { throw Error('Set PATS_API_URL to the dev server origin.'); })();
export async function request(method, endpoint, payload, token) {
  const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  const result = await response.json();
  if (!response.ok) throw Error(`${method} ${endpoint}: ${response.status} ${result.error?.code}`);
  return result;
}
export async function account(email) {
  const file = path.join(dir, email + '.json');
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (new Date(saved.accessTokenExpiresAt).getTime() > Date.now() + 30000) return saved;
    try { const tokens = await request('POST', '/api/auth/refresh', { refreshToken: saved.refreshToken }); const refreshed = { ...saved, ...tokens }; fs.writeFileSync(file, JSON.stringify(refreshed)); return refreshed; } catch {}
  }
  const otp = await request('POST', '/api/auth/otp/request', { email, audience: 'app', locale: 'en' });
  if (!otp.demoCode) throw Error('The server must be in demo OTP mode.');
  const result = await request('POST', '/api/auth/otp/verify', { email, code: otp.demoCode, client: 'app' });
  fs.writeFileSync(file, JSON.stringify(result)); return result;
}
if (process.argv[2] === 'inspect') {
  const member = await account(process.argv[3] ?? 'bima.pratama@patsuniv.test');
  for (const endpoint of ['/api/events?scope=all', '/api/loyalty/claims', '/api/loyalty/wallet', '/api/social/hub']) {
    const result = await request('GET', endpoint, undefined, member.accessToken);
    fs.writeFileSync(path.join(dir, endpoint.split('?')[0].split('/').at(-1) + '-data.json'), JSON.stringify(result, null, 2));
    console.log(endpoint, JSON.stringify(result).slice(0, endpoint.includes('events') ? 2000 : 1400));
  }
}
