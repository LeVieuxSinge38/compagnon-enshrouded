// Remplace les stats d'armure de public/data/equip.js (window.ARMOR_STATS) par celles de wikily.gg, tirées du jeu 1.0
// (avec l'autorisation de wikily) : niveau de l'objet, armure physique / magique, bonus, et armure à chaque amélioration.
// Fichiers d'entrée : <dossier>/armor*.json, téléchargés depuis
//   https://wikily.gg/api/wikis/enshrouded/datasets/armor/list?locale=fr&limit=120&offset=<0, 120, 240…>
//   node outils/equipement/armure_wikily.js <dossier>
// Format : ARMOR_STATS[nom anglais] = [physique, magique, [bonus], niveau, [[niveau, physique, magique, amélioration], …]]
'use strict';
const fs = require('fs'), path = require('path');
const SRC = process.argv[2], ROOT = path.join(__dirname, '..', '..');
const EQUIP = path.join(ROOT, 'public', 'data', 'equip.js'), GEAR = path.join(ROOT, 'public', 'data', 'gear.js');
const load = (f, v) => { const window = {}; new Function('window', fs.readFileSync(f, 'utf8'))(window); return window[v]; };
const OLD = load(EQUIP, 'ARMOR_STATS'), SETS = load(GEAR, 'GEAR');
const slug = n => String(n).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const rows = fs.readdirSync(SRC).filter(f => /^armor\d*\.json$/.test(f)).flatMap(f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')).rows);
const byKey = new Map(rows.map(r => [r.key, r.data]));
const names = new Set([...Object.keys(OLD), ...SETS.flatMap(s => (s.pieces || []).map(p => p[0]))]);
const num = v => Number(String(v).replace(/[^\d.-]/g, '')) || 0;
const out = {}; let hit = 0, miss = [];
for (const en of names) {
  const d = byKey.get(slug(en));
  if (!d) { if (OLD[en]) out[en] = OLD[en]; miss.push(en); continue; }
  const st = d.stats || [], get = l => (st.find(s => s.label === l) || {}).value;
  const perks = st.filter(s => !/^(Armure (physique|magique)|Durabilité)/.test(s.label))
    .map(s => `${String(s.value).replace(/\s*%$/, ' %')} ${s.label}`.replace(/’/g, "'"));
  const ups = (d.upgrades || []).map(u => { const m = /Armure (\d+) \/ (\d+)/.exec(u.values || ''); return [num(u.level), m ? +m[1] : 0, m ? +m[2] : 0, u.enhancement || '']; });
  out[en] = [num(get('Armure physique')), num(get('Armure magique')), perks, num(d.level), ups];
  hit++;
}
let s = fs.readFileSync(EQUIP, 'utf8');
s = s.replace(/window\.ARMOR_STATS=\{[\s\S]*?\};\n/, 'window.ARMOR_STATS=' + JSON.stringify(out) + ';\n');
fs.writeFileSync(EQUIP, s);
console.log(hit, 'pièces mises à jour depuis wikily ·', miss.length, 'introuvables :', miss.slice(0, 20).join(', '));
