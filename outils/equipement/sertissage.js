'use strict';
// Forges de pierres précieuses → public/data/sertissage.js
// Usage : node outils/equipement/sertissage.js <dossier avec locations_fr.json et materials_fr.json>
// Rien d'inventé : région, niveau, niveau max. de pierre et essence viennent de la fiche « Forges de pierres précieuses »,
// les positions du fichier carte (data/carte.json, catégorie gem-forges) en les rapprochant par coordonnées.
const fs = require('fs'), path = require('path');
const SRC = process.argv[2], ROOT = path.join(__dirname, '..', '..');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const clean = s => String(s).replace(/\s+/g, ' ').trim();
const loc = readJson(path.join(SRC, 'locations_fr.json')).rows.find(r => r.key === 'gem-forges').data;
const mats = readJson(path.join(SRC, 'materials_fr.json')).rows;
const carte = readJson(path.join(ROOT, 'public', 'data', 'carte.json'));
const cat = carte.cats.find(c => c.id === 'gem-forges');
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const ess = ROMAN.map((r, i) => {
  const m = mats.find(x => x.key === 'archaic-essence-' + r.toLowerCase());
  return m ? { tier: i + 1, fr: clean(m.data.name), en: null, hint: clean(m.data.hint || ''), key: m.key } : { tier: i + 1, fr: 'Essence archaïque ' + r, key: 'archaic-essence-' + r.toLowerCase() };
});

// Points de la fiche : marqueur « gem-forge-X-Y », Y de la carte = 10240 - Y du marqueur
const fiche = loc.places.map(p => {
  const [, x, y] = /gem-forge-(\d+)-(\d+)/.exec(p.href);
  const m = /^(.+?), niveau (\d+)\. Niveau max\. de la pierre précieuse (\d+), essence : (Essence archaïque ([IVX]+))/.exec(clean(p.sub));
  return { x: +x, y: carte.size - +y, region: m[1], lvl: +m[2], max: +m[3], tier: ROMAN.indexOf(m[5]) + 1 };
});
const forges = cat.pts.map((p, i) => {
  const f = fiche.find(q => Math.abs(q.x - p[0]) <= 2 && Math.abs(q.y - p[1]) <= 2);
  return f ? { i, x: p[0], y: p[1], region: f.region, lvl: f.lvl, max: f.max, tier: f.tier } : { i, x: p[0], y: p[1], region: null, lvl: null, max: null, tier: null };
});
const known = forges.filter(f => f.tier);
const tiers = ess.map(e => {
  const fs_ = known.filter(f => f.tier === e.tier);
  return { ...e, max: Math.max(...fs_.map(f => f.max)), min: Math.min(...fs_.map(f => f.max)), regions: [...new Set(fs_.map(f => f.region))] };
});
// Où obtenir chaque pierre (fiche de la pierre) : pêche, ennemis qui la lâchent, butin de boss / garanti / quête
const gems = {};
for (const r of readJson(path.join(SRC, 'gems_fr.json')).rows) {
  const src = r.data.sources || [];
  gems[r.key] = {
    fish: src.some(x => x.kind === 'Pêché'),
    enemies: clean(r.data.dropEnemies || ''),
    other: src.filter(x => x.kind !== 'Pêché' && !/^Butin d'ennemi/.test(x.kind)).map(x => clean(x.kind.split(',')[0] + ' : ' + x.title))
  };
}
const out = { forges, tiers, gems, lead: clean(loc.lead) };
fs.writeFileSync(path.join(ROOT, 'public', 'data', 'sertissage.js'),
  '// Forges de pierres précieuses : région, niveau, niveau max. de pierre, essence (généré par outils/equipement/sertissage.js)\nwindow.SERTISSAGE=' + JSON.stringify(out) + ';\n');
console.log(forges.length, 'forges,', known.length, 'identifiées,', tiers.map(t => `${t.tier}:≤${t.max}`).join(' '));
