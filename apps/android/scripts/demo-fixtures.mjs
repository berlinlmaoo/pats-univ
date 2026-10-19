import fs from 'node:fs';
import path from 'node:path';
import { account, request } from './api-demo.mjs';
const admin = await account('admin.jkt@patsuniv.test');
const call = (method, endpoint, payload) => request(method, endpoint, payload, admin.accessToken);
const meta = await call('GET', '/api/admin/event-form');
const list = await call('GET', '/api/admin/events');
const events = [...list.upcoming, ...list.past];
async function event(title, date, startTime, endTime) {
  return events.find(event => event.title === title) ?? (await call('POST', '/api/admin/events', { title, description: 'Native Android demo validation. Created through the existing API.', venueId: meta.venues[0].id, date, startTime, endTime, opensBeforeMinutes: 60, capacity: 100, publish: true })).event;
}
const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
const past = await event('Android QA · Claim XP', yesterday, '18:00', '19:00');
const active = await event('Android QA · Check-in and rewards', today, '10:00', '23:30');
if (active.status !== 'OPEN') await call('POST', `/api/admin/events/${active.id}/actions`, { action: 'open' });
await call('POST', '/api/admin/draw', { action: 'configure', eventId: active.id, prize: 'Android showcase prize', peakStartsAt: new Date(now.getTime() - 60000).toISOString(), peakEndsAt: new Date(now.getTime() + 6 * 3600000).toISOString(), capacity: 5 });
const rewards = await call('GET', '/api/admin/loyalty/rewards');
if (!rewards.rewards.some(reward => reward.name === 'Android QA · Welcome drink')) await call('POST', '/api/admin/loyalty/rewards', { type: 'DIRECT', name: 'Android QA · Welcome drink', description: 'Showcase reward for native validation.', xpCost: 0, cityId: meta.city.id, venueId: meta.venues[0].id, stock: 50, active: true, spinWeight: 0 });
const operations = await call('GET', '/api/admin/loyalty/operations');
const member = operations.members.find(member => member.fullName === 'Rara Anindya');
const attendance = await call('GET', `/api/admin/events/${active.id}/attendance`);
if (!attendance.entries.some(entry => entry.member.id === member.id)) await call('POST', '/api/admin/check-in', { method: 'MANUAL', eventId: active.id, memberId: member.id, reason: 'Native Android member-flow demo fixture' });
const fixture = { pastEventId: past.id, activeEventId: active.id, venueId: meta.venues[0].id, memberId: member.id, cityId: meta.city.id };
fs.writeFileSync(path.resolve(import.meta.dirname, '../.qa/fixtures.json'), JSON.stringify(fixture, null, 2));
console.log(JSON.stringify(fixture));
const token = await call('GET', '/api/social/token'); console.log('Realtime URL:', token.url);
