// Génère public/data/carte.json : les points de la carte interactive (wikily.gg, avec l'autorisation de wikily),
// à partir des fichiers téléchargés une catégorie à la fois :
//   https://wikily.gg/api/ext/tiled-maps/maps/69172511-5059-4a25-8516-a4d0bab25a90/embed-points?wiki=enshrouded&terms=mapterms&locale=fr&cats=<catégorie>
// enregistrés sous <dossier>/<catégorie>.json.
//   node outils/carte/build_carte.js <dossier>
// Coordonnées : wikily × 1,25 = coordonnées du wiki (0..10240, y vers le haut), comme la carte du Compagnon.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = process.argv[2];
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public', 'data', 'carte.json');

// Catégories : [identifiant wikily, nom, groupe, icône, affichée au départ, progression (« fait »)]
const CATS = [
  ['ancient-spires', 'Tours des Anciens', 'flamme', '🗼', true, true],
  ['flame-shrines', 'Mausolées de Flamme', 'flamme', '🔥', true, true],
  ['night-sanctums', 'Sanctuaires nocturnes', 'flamme', '🌙', false, true],
  ['gem-forges', 'Forges de pierres précieuses', 'flamme', '💎', false, true],
  ['ancient-obelisks', 'Obélisques anciens', 'flamme', '🗿', false, true],
  ['fast-travel-points', 'Voyage rapide', 'flamme', '🌀', false, false],
  ['return-beacons', 'Balises de retour', 'flamme', '📍', false, false],
  ['shroud-roots', 'Racines de Brume', 'brume', '🌿', true, true],
  ['elixir-wells', "Puits de l'élixir", 'brume', '⚗️', true, true],
  ['shroud-lairs', 'Repaires de la Brume', 'brume', '☠️', false, true],
  ['bosses', 'Boss', 'ennemis', '💀', false, true],
  ['enemy-camps', 'Camps ennemis', 'ennemis', '⛺', false, true],
  ['balefire', 'Forteresses du Feu de joie', 'ennemis', '🏰', false, true],
  ['dungeons', 'Donjons et temples', 'donjons', '🏛️', false, true],
  ['hollow-halls', 'Salles creuses', 'donjons', '🕳️', false, true],
  ['vaults', 'Cryptes et tombeaux', 'donjons', '⚱️', false, true],
  ['villages', 'Villages et villes', 'lieux', '🏘️', false, false],
  ['camps', 'Camps', 'lieux', '🏕️', false, false],
  ['farms', 'Fermes', 'lieux', '🌾', false, false],
  ['mines', 'Mines et carrières', 'lieux', '⛏️', false, false],
  ['caves', 'Grottes', 'lieux', '🦇', false, false],
  ['landmarks', 'Lieux notables', 'lieux', '⭐', false, false],
  ['upstreams', 'Courants ascendants', 'lieux', '🌬️', false, false],
  ['lost-villager-souls', 'Âmes perdues', 'lieux', '👻', false, true],
  ['chests', 'Coffres', 'butin', '📦', false, true],
  ['unique-gear', 'Équipement unique', 'butin', '⚔️', false, true],
  ['collectibles', 'Collectionnables', 'butin', '🏺', false, true],
  ['lore', 'Traditions', 'butin', '📜', false, true],
  ['ore-veins', 'Filons', 'res', '⛏️', false, false],
  ['ore-rocks', 'Rochers de minerai', 'res', '🪨', false, false],
  ['plants', 'Plantes et champignons', 'res', '🌱', false, false],
  ['fishing-spots', 'Coins de pêche', 'res', '🎣', false, false]
];
// Nom court d'un matériau, comme dans le jeu mais sans « Minerai de », « Pierre de »… (demande de l'utilisateur)
const SHORT = [[/^Minerai d'(.)/, (_, c) => c.toUpperCase()], [/^Minerai de (.)/, (_, c) => c.toUpperCase()], [/^Pierre de silex$/, () => 'Silex'],
  [/^Tas d'argile$/, () => 'Argile'], [/^Fragment de marbre rouge$/, () => 'Marbre rouge']];
const short = n => { for (const [re, f] of SHORT) if (re.test(n)) return n.replace(re, f); return n; };
const icons = new Set(fs.readdirSync(path.join(ROOT, 'public', 'img', 'res')).map(f => f.replace(/\.png$/, '')));
const num = s => Number(String(s).replace(/[^\d]/g, ''));
const tidy = s => String(s || '').replace(/<\/?lorename>/g, '').trim();

// Contenu d'un coffre en une ligne : « Garanti : … · Possible : … »
function chestText(json) {
  let d; try { d = JSON.parse(json); } catch { return ''; }
  const it = x => `${x.name}${x.quantityRange ? ` ${x.quantityRange[0]}–${x.quantityRange[1]}` : x.quantity ? ` ×${x.quantity}` : ''}${x.chancePercent != null ? ` (${x.chancePercent} %)` : ''}`;
  const parts = [];
  if (d.guaranteed && d.guaranteed.length) parts.push('Garanti : ' + d.guaranteed.map(it).join(', '));
  if (d.possible && d.possible.length) parts.push('Possible : ' + d.possible.map(it).join(', '));
  const n = (d.notes || []).find(x => /^Nombre d'objets|^Type de chaque/.test(x));
  if (n) parts.push(n);
  return parts.join(' · ');
}

const out = { source: 'wikily.gg (avec autorisation)', size: 10240, groups: {
  flamme: '🔥 Flamme', brume: '🌫️ Brume', ennemis: '⚔️ Ennemis', donjons: '🏛️ Donjons', lieux: '🏘️ Lieux', butin: '💰 Butin', res: '⛏️ Ressources' }, cats: [] };
let total = 0;
for (const [id, fr, g, ico, on, prog] of CATS) {
  const f = path.join(SRC, id + '.json');
  if (!fs.existsSync(f)) { console.warn('manque', id); continue; }
  const p = JSON.parse(fs.readFileSync(f, 'utf8')).points;
  const val = (k, i) => p[k] && p[k].values ? p[k].values[p[k].index[i]] : undefined;
  const names = [], nameIdx = new Map(), subs = [], subIdx = new Map(), descs = [], descIdx = new Map(), keys = [];
  const idx = (arr, map, v) => { if (v == null || v === '') return -1; if (!map.has(v)) { map.set(v, arr.length); arr.push(v); } return map.get(v); };
  const res = g === 'res' && id !== 'fishing-spots';
  const pts = [], ids = [];
  for (let i = 0; i < p.x.length; i++) {
    const x = Math.round(p.x[i] * 1.25), y = Math.round(p.y[i] * 1.25);
    let name = tidy(val('names', i));
    const href = val('hrefs', i) || '';
    if (res) name = short(name);
    if (id === 'ancient-spires') name = 'Tour des Anciens · ' + name;
    const ni = idx(names, nameIdx, name);
    if (res && keys[ni] === undefined) keys[ni] = href.split('/').pop() || '';
    let sub = val('sublabels', i);
    if (id === 'ore-rocks' && sub) sub = sub.split(', ').map(short).join(', ');
    if (res && id !== 'ore-rocks') sub = null; // le sous-titre répète le nom
    let desc = id === 'chests' ? chestText(val('popupData', i)) : tidy(val('descriptions', i));
    if (desc === fr || /^(Tour des Anciens\. Point de voyage rapide|Boss|Camp|Village|Grotte|Ferme|Mine|Donjon|Camp ennemi|Lieu notable|Traditions|Collectionnables|Équipement unique|Crypte des Anciens|Forteresse du Feu de joie|Point de voyage rapide)$/.test(desc)) desc = '';
    if (id === 'ore-rocks' && desc) desc = desc.split(/(?<=%)(?: par drop)?\. /).map(s => s.replace(/ par drop\.?$/, '')).map(s => s.replace(/Minerai d(?:e |')(\S)/g, (_, c) => c.toUpperCase())).join(' · ');
    if (id === 'ore-veins') {
      // « Filon (Ambre) de 3 441 m³, affleurant à la surface » → volume et profondeur (−1 = en surface)
      const m = /de ([\d\s  ]+) m³, (?:à ([\d\s  ]+) m sous la surface|affleurant)/.exec(desc);
      pts.push([x, y, ni, m ? num(m[1]) : 0, m && m[2] ? num(m[2]) : -1]);
    } else if (id === 'plants') pts.push([x, y, ni]);
    else pts.push([x, y, ni, idx(subs, subIdx, sub), idx(descs, descIdx, desc)]);
    if (prog) ids.push(val('ids', i));
  }
  const cat = { id, fr, g, ico, on, n: pts.length, names, pts };
  if (subs.length) cat.subs = subs;
  if (descs.length) cat.descs = descs;
  if (res) { cat.keys = names.map((_, i) => keys[i] || ''); cat.noIco = cat.keys.map((k, i) => icons.has(k) ? -1 : i).filter(i => i >= 0); }
  if (prog) cat.ids = ids;
  out.cats.push(cat);
  total += pts.length;
  console.log(id.padEnd(22), String(pts.length).padStart(6), 'points,', names.length, 'noms');
}
fs.writeFileSync(OUT, JSON.stringify(out));
// Petit index chargé avec la page : identifiant de la ressource (« copper-ore ») → [catégorie, n° du nom, nombre de points]
const idx = {};
for (const c of out.cats) if (c.keys && c.id !== 'ore-rocks') c.keys.forEach((k, ni) => { // les rochers mélangent plusieurs minerais
  const n = c.pts.filter(p => p[2] === ni).length;
  const slug = k || c.names[ni];
  if (!idx[slug] || idx[slug][2] < n) idx[slug] = [c.id, ni, n];
});
fs.writeFileSync(path.join(ROOT, 'public', 'data', 'carte_res.js'),
  '// Ressources présentes sur la carte interactive (généré par outils/carte/build_carte.js)\nwindow.CARTE_RES=' + JSON.stringify(idx) + ';\n');
console.log('total', total, 'points ·', (fs.statSync(OUT).size / 1024).toFixed(0), 'Ko →', path.relative(ROOT, OUT));
