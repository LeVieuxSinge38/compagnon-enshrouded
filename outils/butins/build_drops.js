// Génère public/data/drops.js : ce que lâche chaque créature, et où elle vit (wiki enshrouded.wiki.gg).
// Usage : node outils/butins/build_drops.js <dossier>, le dossier contenant drops.json (cargoquery de la table Drops)
// et npc/<Nom>.txt (wikitext de chaque page de créature). Noms et indices d'habitat en français : creatures_fr.json.
'use strict';
const fs = require('fs'), path = require('path');
const dir = process.argv[2], ROOT = path.join(__dirname, '..', '..');
const unent = s => String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const FR = JSON.parse(fs.readFileSync(path.join(__dirname, 'creatures_fr.json'), 'utf8'));
const REGIONS = ['Springlands', 'Low Meadows', 'Revelwood', 'Blackmire', 'Nomad Highlands', 'Kindlewastes', 'Albaneve Summits', 'Veilwater Basin'];

const drops = JSON.parse(fs.readFileSync(path.join(dir, 'drops.json'), 'utf8')).cargoquery.map(x => x.title);
const DROPS = {}, CREATURES = {};
for (const d of drops) {
  const item = unent(d.ItemDrop).trim(), who = unent(d.Source).trim();
  (DROPS[item] = DROPS[item] || []).push([who, d.Quantity || '']);
  if (CREATURES[who]) continue;
  const f = path.join(dir, 'npc', who.replace(/[^\w ]/g, '_') + '.txt');
  const t = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  // Champ « Region » de la fiche (parfois suivi d'autres champs sur la même ligne)
  const raw = ((/\|\s*Region\s*=\s*([^\n]*)/.exec(t) || [])[1] || '').split('|')[0].replace(/\}\}/g, '');
  const regions = REGIONS.filter(r => raw.includes(r));
  const [fr, hint] = FR[who] || [who, ''];
  CREATURES[who] = { fr, r: regions, h: hint, fell: /^(Fell|Shroud)\b/.test(who) ? 1 : 0, hollow: /^Hollow\b/.test(who) ? 1 : 0 };
}
fs.writeFileSync(path.join(ROOT, 'public/data/drops.js'),
  '// Butins des créatures — source : enshrouded.wiki.gg (18/10/2026). Généré par outils/butins/build_drops.js\n'
  + 'window.DROPS=' + JSON.stringify(DROPS) + ';\nwindow.CREATURES=' + JSON.stringify(CREATURES) + ';\n');
console.log(Object.keys(DROPS).length, 'objets,', Object.keys(CREATURES).length, 'créatures,', Object.keys(CREATURES).filter(k => !FR[k]).length, 'sans nom français');
