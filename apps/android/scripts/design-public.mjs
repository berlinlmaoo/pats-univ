import fs from 'node:fs';
import { adb, dump, nodes, tap, sleep, screenshot } from './device.mjs';
import { route } from './screenshots.mjs';
const fixture = JSON.parse(fs.readFileSync(new URL('../.qa/design-public-card.json',import.meta.url)));
for(const scheme of ['light','dark']) {
  adb('shell','cmd','uimode','night',scheme === 'dark' ? 'yes':'no');
  for(const language of ['en','id']) {
    await route('home'); await tap(language.toUpperCase());
    adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d',fixture.url,'-n','id.znetworks.patsuniv/.MainActivity'); await sleep(1000);
    const xml=dump();
    if(xml.includes('JKT2600002') || xml.includes('bima.pratama@') || xml.includes('Strobe')) throw Error('Private field on digital ID');
    screenshot(`public-${language}-${scheme}-card`);
    await tap(language === 'en' ? 'Show back':'Lihat belakang'); await sleep(600);
    screenshot(`public-${language}-${scheme}-card-back`);
    console.log(`public-${language}-${scheme}: privacy passed`);
  }
}
