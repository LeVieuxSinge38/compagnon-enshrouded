// Génère public/data/provenance.js : où obtenir chaque pièce d'équipement (wikily.gg, jeu 1.0, avec l'autorisation de wikily).
// Fichiers d'entrée : <dossier>/{armor,weapons,rings}_<offset>.json, téléchargés depuis
//   https://wikily.gg/api/wikis/enshrouded/datasets/<armor|weapons|rings>/list?locale=fr&limit=120&offset=<0, 120, 240…>
//   node outils/equipement/provenance.js <dossier>
// PROV[nom anglais] = { c: artisan, rq: à poser avant, ch: [niveau min, niveau max, coffres sur la carte], rg: régions,
//   b: [boss], q: [[identifiant du coffre (data/carte.json), nom, région et niveau]], x: [autres provenances] }
'use strict';
const fs = require('fs'), path = require('path');
const SRC = process.argv[2], ROOT = path.join(__dirname, '..', '..');
const load = (f, v) => { const window = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'public', 'data', f), 'utf8'))(window); return window[v]; };
const slug = n => String(n).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const names = new Set([
  ...load('equip.js', 'WEAPONS').map(w => w.en), ...load('equip.js', 'SHIELDS').map(s => s.en), ...load('equip.js', 'RINGS').map(r => r.en),
  ...Object.keys(load('equip.js', 'ARMOR_STATS')), ...load('gear.js', 'GEAR').flatMap(s => (s.pieces || []).map(p => p[0]))]);
const rows = fs.readdirSync(SRC).filter(f => /^(armor|weapons|rings)_\d+\.json$/.test(f))
  .flatMap(f => { try { return JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')).rows || []; } catch { return []; } });
const byKey = new Map(rows.map(r => [r.key, r.data]));
const CHESTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'carte.json'), 'utf8')).cats.find(c => c.id === 'chests');
const chestLv = id => { const i = CHESTS.ids.indexOf(id); return i < 0 ? null : Number((CHESTS.subs[CHESTS.pts[i][3]] || '').replace(/\D/g, '')); };
function chestId(m, kind) {
  const want = Number((/niveau (\d+)/.exec(kind) || [])[1]), cands = [m[1], 'chests-chest-' + m[2], 'chests-chest-' + m[3]];
  return cands.find(id => chestLv(id) === want) || cands.find(id => chestLv(id) != null) || m[1];
}
const out = {}; let n = 0;
for (const en of names) {
  const d = byKey.get(slug(en)); if (!d) continue;
  const lead = d.lead || '', p = {};
  // (wikily met des espaces insécables avant « : » et dans les nombres : \s les accepte)
  const c = /Fabrication\s*:\s*([^,.]+)/.exec(lead); if (c) p.c = c[1].trim();
  if (d.requires) p.rq = d.requires;
  const ch = /coffres de niveau (\d+) à (\d+)(?:\s*:\s*([\d\s]+?) sur la carte)?/.exec(lead);
  if (ch) p.ch = [+ch[1], +ch[2], ch[3] ? Number(ch[3].replace(/\D/g, '')) : 0];
  const rg = /sur la carte, ([^.]+)\./.exec(lead); if (rg) p.rg = rg[1];
  const b = [], q = [], x = [];
  for (const s of d.sources || []) {
    if (/^Butin de boss/.test(s.kind)) { if (s.title && !b.includes(s.title)) b.push(s.title); }
    else if (/^Butin aléatoire, coffres/.test(s.kind)) continue;
    // coffre précis : « chests-chest-7059-7092 » ; on garde l'identifiant de data/carte.json dont le niveau correspond
    else if (/marker=(chests-chest-(\d+)-(\d+))/.test(s.href || '')) q.push([chestId(/marker=(chests-chest-(\d+)-(\d+))/.exec(s.href), s.kind), s.title, s.kind]);
    else if (s.kind || s.title) x.push([s.kind, s.title].filter(Boolean).join(' : '));
  }
  if (b.length) p.b = b; if (q.length) p.q = q; if (x.length) p.x = x.slice(0, 4);
  if (Object.keys(p).length) { out[en] = p; n++; }
}
fs.writeFileSync(path.join(ROOT, 'public', 'data', 'provenance.js'),
  '// Où obtenir chaque pièce d\'équipement (wikily.gg, jeu 1.0) — généré par outils/equipement/provenance.js\nwindow.PROV=' + JSON.stringify(out) + ';\n');
console.log(n, 'objets sur', names.size);
