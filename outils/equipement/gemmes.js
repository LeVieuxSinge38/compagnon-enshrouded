'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const SRC = process.argv[2], ROOT = path.join(__dirname, '..', '..');
const GEMS_FR = path.join(SRC, 'gems_fr.json'), GEMS_EN = path.join(SRC, 'gems_en.json');
const DEST_IMG = path.join(ROOT, 'public', 'img', 'items'), DEST_JS = path.join(ROOT, 'public', 'data', 'item_icons.js');
const DEST_GEMS = path.join(ROOT, 'public', 'data', 'gems.js');

const load = (f, v) => { const window = {}; new Function('window', fs.readFileSync(f, 'utf8'))(window); return window[v]; };
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const fr = readJson(GEMS_FR).rows, en = readJson(GEMS_EN).rows;
const byKey = new Map(en.map(r => [r.key, r.data]));

const clean = s => String(s).replace(/\s+/g, ' ').trim();
const download = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);
  https.get(url, res => {
    if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
    res.pipe(file);
    file.on('finish', () => resolve());
    file.on('error', reject);
  }).on('error', reject);
});

const list = [];
for (const r of fr) {
  const d = byKey.get(r.key);
  if (!d) continue;
  const fx = (r.data.stats || []).map(s => `${s.label} : ${String(s.value).replace(/ \([^)]*\)/g, '')}`);
  const icon = r.data.icon;
  const key = r.key;
  list.push({
    key,
    fr: clean(r.data.name),
    en: clean(d.name),
    rar: r.data.rarity,
    lead: r.data.lead,
    fx,
    desc: clean(r.data.description)
  });
  const dest = path.join(DEST_IMG, `${key}.webp`);
  if (fs.existsSync(dest)) continue;
  setTimeout(() => {
    download(icon, dest).catch(console.error);
  }, list.length * 300);
}

let src = fs.readFileSync(DEST_JS, 'utf8');
const window = {};
new Function('window', src)(window);
const ICONS = window.ITEM_ICONS || {};
for (const r of list) ICONS[r.en] = `${r.key}.webp`;
src = src.replace(/window\.ITEM_ICONS=\{[\s\S]*?\};\n/, `window.ITEM_ICONS=${JSON.stringify(ICONS)};\n`);
fs.writeFileSync(DEST_JS, src);

const head = `// Gemmes (français + anglais)
// Format : {key,fr,en,rar,data.rarity,lead,data.lead,fx:[ 'label : value' ],desc}
// Les espaces insécables sont remplacés par des espaces simples
`;
fs.writeFileSync(DEST_GEMS, head + `window.GEMS=${JSON.stringify(list)};\n`);
