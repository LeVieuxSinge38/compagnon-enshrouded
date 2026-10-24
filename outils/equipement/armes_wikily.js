'use strict';

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://wikily.gg/api/wikis/enshrouded/datasets/weapons/list?locale=fr&limit=120&offset=';
const PAGE_SIZE = 120;
const DELAY_MS = 500;
const UA = 'CompagnonEnshrouded/1.0 (projet de fan)';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slug(en) {
  let s = en.toLowerCase();
  s = s.replace(/['\u2019]/g, '');
  s = s.replace(/[^a-z0-9]/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  return s;
}

async function fetchPage(offset) {
  const url = BASE_URL + offset;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} sur ${url}`);
  }
  return res.json();
}

async function fetchAllRows() {
  const allRows = [];
  let offset = 0;
  while (true) {
    const json = await fetchPage(offset);
    const rows = json.rows || [];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(DELAY_MS);
  }
  return allRows;
}

function extractStats(row) {
  const stats = row.data && Array.isArray(row.data.stats) ? row.data.stats : [];
  const out = {};

  for (const s of stats) {
    if (s.label === 'Dégâts') out.d = s.value;
    else if (s.label === 'Vitesse d\u2019attaque' || s.label === "Vitesse d'attaque") out.v = s.value;
    else if (s.label === 'Capacité de parade') out.p = s.value;
    else if (s.label.startsWith('Durabilité (')) {
      const m = s.label.match(/Durabilité \((.+)\)/);
      if (m) {
        if (!out.du) out.du = [];
        out.du.push([m[1], s.value]);
      }
    }
  }

  if (row.data && row.data.damage) out.t = row.data.damage;
  if (row.data && row.data.level) out.n = row.data.level;
  if (row.data && row.data.rarity) out.r = row.data.rarity;

  // Remove empty fields
  for (const k of Object.keys(out)) {
    if (out[k] === '' || out[k] === null || out[k] === undefined) delete out[k];
    if (k === 'du' && (!Array.isArray(out[k]) || out[k].length === 0)) delete out[k];
  }

  return out;
}

function main() {
  return (async () => {
    // 1. Fetch all rows
    const rows = await fetchAllRows();
    console.log(`Lignes wikily téléchargées : ${rows.length}`);

    // Build lookup by key
    const lookup = new Map();
    for (const row of rows) {
      if (row.key) lookup.set(row.key, row);
    }

    // 2. Load local equip data
    const equipPath = path.join(__dirname, '..', '..', 'public', 'data', 'equip.js');
    const code = fs.readFileSync(equipPath, 'utf8');
    const w = {};
    new Function('window', code)(w);

    const weapons = Array.isArray(w.WEAPONS) ? w.WEAPONS : [];
    const shields = Array.isArray(w.SHIELDS) ? w.SHIELDS : [];

    // 3. Match and build output
    const result = {};
    let matched = 0;
    const notFound = [];

    const processItem = (item) => {
      const en = item.en;
      if (!en) return;
      const s = slug(en);
      const row = lookup.get(s);
      if (row) {
        result[en] = extractStats(row);
        matched++;
      } else {
        notFound.push(en);
      }
    };

    for (const wpn of weapons) processItem(wpn);
    for (const shd of shields) processItem(shd);

    console.log(`Objets associés : ${matched}`);

    // 4. Write output
    const outDir = path.join(__dirname, '..', '..', 'public', 'data');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'weapon_stats.js');
    const header = '// Caractéristiques des armes et boucliers (wikily.gg, avec autorisation) — généré par outils/equipement/armes_wikily.js\n';
    const body = 'window.WEAPON_STATS=' + JSON.stringify(result) + ';\n';
    fs.writeFileSync(outPath, header + body, 'utf8');
    console.log(`Fichier écrit : ${outPath}`);

    // 5. Print not-found (first 20)
    if (notFound.length > 0) {
      console.log(`\nArmes/boucliers non trouvés (${notFound.length}) :`);
      for (const name of notFound.slice(0, 20)) {
        console.log(`  - ${name}`);
      }
      if (notFound.length > 20) console.log(`  … et ${notFound.length - 20} autres`);
    }
  })();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
