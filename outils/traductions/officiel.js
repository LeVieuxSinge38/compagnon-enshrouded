// Noms officiels du jeu en français, appliqués à toutes les données de l'appli.
// Sources : wikily.gg (jeux de données en anglais et en français, mêmes clés : objets, ensembles, armes, anneaux,
// matériaux, lieux, régions, artisans) et le tableau « Traduction » du wiki officiel français (enshrouded.wiki.gg/fr).
// Usage : node outils/traductions/officiel.js <dossier>   (dossier : all_<jeu>_en.json / all_<jeu>_fr.json et map.json)
// Écrit outils/traductions/officiel.json (anglais → français) puis met à jour public/data/*.js.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2], ROOT = path.join(__dirname, '..', '..'), DATA = path.join(ROOT, 'public', 'data');

// ---------- Dictionnaire anglais → français officiel ----------
const T = {};
const wiki = path.join(dir, 'map.json');
if (fs.existsSync(wiki)) Object.assign(T, JSON.parse(fs.readFileSync(wiki, 'utf8')));
for (const d of ['armor-sets', 'armor', 'weapons', 'rings', 'materials', 'bosses', 'consumables', 'tools', 'npcs', 'regions', 'locations']) {
  const en = path.join(dir, `all_${d}_en.json`), fr = path.join(dir, `all_${d}_fr.json`);
  if (!fs.existsSync(en)) continue;
  const F = Object.fromEntries(JSON.parse(fs.readFileSync(fr, 'utf8')).map(r => [r.key, r.data.name]));
  for (const r of JSON.parse(fs.readFileSync(en, 'utf8'))) if (r.data.name && F[r.key]) T[r.data.name.trim()] = F[r.key].trim();
}
fs.writeFileSync(path.join(__dirname, 'officiel.json'), JSON.stringify(T, null, 1));
const off = en => T[en] || T[String(en).replace(/ Set$/, '')] || null;

// ---------- Vocabulaire du jeu dans les textes ----------
const VOCAB = [
  [/([Ll])'ensemble « (Ensemble [^»]+) »/g, "$1'« $2 »"], [/([Ll])'ensemble « /g, "$1'ensemble « "],
  [/ \(Hollow Halls\)/g, ''], [/ \(Scavengers\)/g, ''], [/ \(Sparks\)/g, ''],
  [/\b(de|du) Revelwood\b/g, 'des Bois envoûtés'], [/\bdans (le )?Revelwood\b/g, 'dans les Bois envoûtés'], [/\bà Revelwood\b/g, 'dans les Bois envoûtés'],
  [/\ble Revelwood\b/g, 'les Bois envoûtés'], [/\bRevelwood\b/g, 'Bois envoûtés'],
  [/Sommets d'Albaneve/g, "Sommets de l'Albaneve"],
  [/\b([Gg])rand(s)? sanctuaire(s)? de la Flamme/g, '$1rand$2 mausolée$3 de Flamme'], [/\bSanctuaire(s)? de la Flamme/g, 'Mausolée$1 de Flamme'], [/\bsanctuaire(s)? de la Flamme/g, 'mausolée$1 de Flamme'],
  [/\bFlèche(s)? ancienne(s)?/g, 'Tour$1 des Anciens'], [/\bflèche(s)? ancienne(s)?/g, 'tour$1 des Anciens'],
  [/\b([Pp])uits d'élixir/g, "$1uits de l'élixir"], [/\b([Rr])epaire(s)? de Brume/g, '$1epaire$2 de la Brume'],
  [/\b(les|des|aux|Les|Des|Aux) Fell\b/g, '$1 Déchus'],
  [/\b([A-Za-zÀ-ÿ'’-]+) Fell\b/g, (m, w) => ['par', 'de', 'et', 'contre', 'sur', 'un', 'une', 'en', 'ou', 'à'].includes(w.toLowerCase()) ? `${w} Déchus` : `${w} des Déchus`],
  [/\bFell\b/g, 'Déchus'],
  [/\b(les|des|aux|Les|Des|Aux) Hollow\b/g, '$1 Creux'], [/\b([A-Za-zÀ-ÿ-]+) Hollow\b/g, '$1 Creux'], [/\bHollow\b/g, 'Creux'],
  [/\bpillards\b/g, 'maraudeurs'], [/\bPillards\b/g, 'Maraudeurs'], [/\bpillarde\b/g, 'maraudeuse'], [/\bpillard\b/g, 'maraudeur'], [/\bPillard\b/g, 'Maraudeur'],
  [/\bchez le Chasseur\b/g, 'chez la Chasseresse'], [/\b(du|Du) Chasseur\b/g, (m, d) => d === 'Du' ? 'De la Chasseresse' : 'de la Chasseresse'], [/\bau Chasseur\b/g, 'à la Chasseresse'],
  [/\b(le|Le) Chasseur\b/g, (m, l) => l === 'Le' ? 'La Chasseresse' : 'la Chasseresse'], [/\bChasseur\b/g, 'Chasseresse'],
  [/\b(le|Le) Fermier\b/g, (m, l) => l === 'Le' ? 'La Fermière' : 'la Fermière'], [/\bFermier\b/g, 'Fermière']
];
const vocab = s => typeof s === 'string' ? VOCAB.reduce((t, [re, by]) => t.replace(re, by), s) : s;

// ---------- Lecture / écriture des fichiers « window.X = … ; » ----------
function load(file) { const c = { window: {} }; c.window = c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(DATA, file), 'utf8'), c); return c.window; }
function save(file, header, vars) {
  fs.writeFileSync(path.join(DATA, file), header + '\n' + Object.entries(vars).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('\n') + '\n');
}
const head = file => fs.readFileSync(path.join(DATA, file), 'utf8').split('\n')[0];
const stats = {};
const count = (k, n = 1) => { stats[k] = (stats[k] || 0) + n; };

// Matériaux et objets fabriqués
{
  const w = load('materials.js');
  for (const m of w.MATERIALS) { const o = off(m.n); if (o && o !== m.fr) { m.fr = o; count('matériaux'); } m.o = vocab(m.o); m.d = m.d; }
  save('materials.js', head('materials.js'), { MATERIALS: w.MATERIALS });
  const r = load('recipes.js');
  for (const k of Object.keys(r.PRODUCT_FR)) { const o = off(k); if (o && o !== r.PRODUCT_FR[k]) { r.PRODUCT_FR[k] = o; count('objets fabriqués'); } }
  for (const k of Object.keys(r.RECIPES)) if (!r.PRODUCT_FR[k] && off(k)) { r.PRODUCT_FR[k] = off(k); count('objets fabriqués (ajoutés)'); }
  save('recipes.js', head('recipes.js'), { RECIPES: r.RECIPES, PRODUCT_FR: r.PRODUCT_FR });
}
// Ensembles d'armure : nom officiel, noms officiels des pièces, textes
{
  const w = load('gear.js');
  const mine = Object.fromEntries(w.GEAR.map(g => [g.fr, off(g.en) || g.fr])); // mes anciens noms → officiels (cités dans les textes)
  const fixNames = s => s.replace(/« ([^»]+) »/g, (m, n) => mine[n] ? `« ${mine[n]} »` : m);
  for (const g of w.GEAR) {
    if (off(g.en)) { g.fr = off(g.en); count('ensembles'); }
    g.pieces = g.pieces.map(([p, c]) => [p, c, off(p) || p]);
    g.why = vocab(fixNames(g.why)); g.src = vocab(fixNames(g.src));
  }
  save('gear.js', head('gear.js'), { GEAR: w.GEAR });
}
// Armes, boucliers, anneaux
{
  const w = load('equip.js');
  for (const x of [...w.WEAPONS, ...w.SHIELDS, ...w.RINGS]) { const o = off(x.en); if (o && o !== x.fr) { x.fr = o; count('armes/boucliers/anneaux'); } if (x.src) x.src = vocab(x.src); }
  for (const k of Object.keys(w.PERKS)) w.PERKS[k] = w.PERKS[k].map(vocab);
  save('equip.js', head('equip.js'), { WEAPONS: w.WEAPONS, SHIELDS: w.SHIELDS, RINGS: w.RINGS, ARMOR_STATS: w.ARMOR_STATS, PERKS: w.PERKS, WEAPON_TYPE_FR: w.WEAPON_TYPE_FR });
}
// Créatures
{
  const w = load('drops.js');
  for (const [en, c] of Object.entries(w.CREATURES)) { const o = off(en); c.fr = o || vocab(c.fr); c.h = vocab(c.h); if (o) count('créatures (noms officiels)'); }
  save('drops.js', head('drops.js'), { DROPS: w.DROPS, CREATURES: w.CREATURES });
}
// Lieux de la carte
{
  const w = load('places_fr.js');
  for (const k of Object.keys(w.PLACES_FR.names)) w.PLACES_FR.names[k] = vocab(w.PLACES_FR.names[k]);
  for (const k of Object.keys(w.PLACES_FR.descs)) w.PLACES_FR.descs[k] = vocab(w.PLACES_FR.descs[k]);
  save('places_fr.js', head('places_fr.js'), { PLACES_FR: w.PLACES_FR });
  const m = load('map.js');
  const G = { Ancient_Spire: 'Tour des Anciens', Flame_Shrine: 'Mausolée de Flamme', Elixir_Well: "Puits de l'élixir", Shroud_Lair: 'Repaire de la Brume', Ancient_Vault: 'Crypte des Anciens',
    Gem_Forge: 'Forge de pierres précieuses', Ancient_Obelisk: 'Obélisque ancien', Balefire: 'Forteresse du Feu de joie' };
  Object.assign(m.MAP.groups, G);
  save('map.js', head('map.js'), { MAP: m.MAP });
}
// Guides (biomes, builds, flamme, astuces, artisans) : seulement les textes, jamais les identifiants
{
  const w = load('guides.js');
  const KEEP = new Set(['id', 'res', 'skills', 'attrs', 'tree', 'tags', 'icon', 'color', 'need', 'b']);
  const walk = (o, key) => Array.isArray(o) ? o.map(x => walk(x, key)) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, KEEP.has(k) ? v : walk(v, k)])) : vocab(o);
  const out = {};
  for (const k of Object.keys(w)) if (k !== 'window') out[k] = k === 'UNIVERSAL' ? w[k] : walk(w[k], k);
  out.STATIONS_FR.Hunter = 'Chasseresse'; out.STATIONS_FR.Farmer = 'Fermière';
  for (const b of out.BIOMES) if (b.id === 'Revelwood') b.fr = 'Bois envoûtés';
  save('guides.js', '// Guides : builds, biomes, Flamme, quiz, astuces (noms officiels du jeu appliqués par outils/traductions/officiel.js)', out);
}
console.log(Object.keys(T).length, 'noms officiels ;', JSON.stringify(stats));
module.exports = { vocab };
