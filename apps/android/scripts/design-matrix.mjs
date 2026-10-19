import fs from 'node:fs';
import path from 'node:path';
import { adb, dump, nodes, tapNode, sleep, screenshot } from './device.mjs';

// Only an authenticated debug session is navigated. Server permissions remain authoritative.
if (adb('emu','avd','name').split(/\r?\n/)[0].trim() !== 'Pixel_10_Pro') throw Error('Select Pixel_10_Pro');
const fixture = JSON.parse(fs.readFileSync(new URL('../.qa/fixtures.json',import.meta.url)));
const role = process.argv[2] ?? 'member';
const member = {
  home:'home', card:'card', events:'events', event:`event/${fixture.activeEventId}`, rewards:'wallet', leaderboard:'leaderboard', claims:'claims', draw:`draw/${fixture.activeEventId}`, history:'history', region:'region-change', roaming:'roaming', reservation:`reservation/${fixture.activeEventId}`, hub:'hub', chat:'channel/phase4-JKT-CHAT', timeline:'channel/phase4-JKT-TIMELINE', reservations:'social-operations', notifications:'notifications', preferences:'notification-settings', profile:'profile', promoter:'promoter',
};
const admin = {
  tools:'tools', scan:'scan', scanner:`scan/${fixture.activeEventId}`, manual:`manual/${fixture.activeEventId}`, events:'city-events', event:`city-event/${fixture.activeEventId}`, create:'event-new', edit:`event-edit/${fixture.activeEventId}`, handover:'handover', members:'member-cards', member:`member-card/${fixture.memberId}`, codes:'reward-validation', claims:'claims-review', operations:'operations', community:'social-operations', encode:'encode', station:'encode-run', crew:'crew', hub:'hub', profile:'profile',
};
const dir = process.env.PATS_SHOTS ?? 'C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct';
process.env.PATS_SHOTS = dir; fs.mkdirSync(dir,{recursive:true});
async function navigate(route) {
  adb('shell','am','start','-W','-n','id.znetworks.patsuniv/.MainActivity','--es','qaRoute',route,'--ez','qaCapture','true');
  await sleep(950);
}
async function save(name) {
  let xml = dump();
  for(let i=0;i<3 && nodes(xml).some(n=>n['content-desc'] === 'Loading…' || n['content-desc'] === 'Memuat…');i++) {await sleep(500); xml=dump();}
  if(!xml.includes('id.znetworks.patsuniv')) throw Error('App is not visible: '+name);
  if(!nodes(xml).some(n=>n.text === 'ADMIN' || n.text === 'BERANDA' || n.text === 'HOME')) throw Error('Authenticated shell is missing: '+name);
  const missing = nodes(xml).filter(n=>/^(?:native|app|social|loyalty|events|phase5|common|errors)\.[A-Za-z]/.test(n.text));
  if(missing.length) throw Error('Missing copy: '+missing.map(n=>n.text));
  fs.writeFileSync(path.join(dir,name+'.xml'),xml);
  screenshot(name);
  console.log(name);
}
const only = process.argv.slice(3);
for(const scheme of ['light','dark']) {
  adb('shell','cmd','uimode','night',scheme === 'dark' ? 'yes':'no'); await sleep(600);
  for(const language of ['en','id']) {
    await navigate(role === 'member' ? 'home':'tools');
    tapNode(nodes(dump()).find(n=>n.text === language.toUpperCase())); await sleep(500);
    for(const [name,route] of Object.entries(role === 'member' ? member:admin)) {
      if(only.length && !only.includes(name)) continue;
      await navigate(route); await save(`${role}-${language}-${scheme}-${name}`);
      if(name === 'card') {
        const list=nodes(dump()); tapNode(list.find(n=>n.text === (language === 'en' ? 'Show back':'Lihat belakang')) ?? list.find(n=>n.text.toLowerCase().includes('belakang')));
        await sleep(600); await save(`${role}-${language}-${scheme}-card-back`);
      }
    }
  }
}
