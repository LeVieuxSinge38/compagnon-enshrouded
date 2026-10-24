'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'CompagnonEnshrouded/1.0 (projet de fan)';
const DELAY_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(en) {
  return en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extFromUrl(url) {
  const m = url.match(/\.(png|jpe?g|webp)(\?|$)/i);
  if (m) {
    const e = m[1].toLowerCase();
    return e === 'jpeg' ? 'jpg' : e;
  }
  return 'png';
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.arrayBuffer();
}

async function getThumbnail(en) {
  const base =
    'https://enshrouded.wiki.gg/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=256&redirects=1&titles=';

  const variants = [en];
  if (en.includes('Armored ')) variants.push(en.replace('Armored ', ''));
  if (en.includes('Fell Crimson ')) variants.push(en.replace('Fell Crimson ', 'Fell '));
  if (en.includes('Hollow ')) variants.push(en.replace('Hollow ', 'Fell '));

  for (const title of variants) {
    const data = await fetchJson(base + encodeURIComponent(title));
    const pages = data.query && data.query.pages;
    if (pages) {
      for (const key of Object.keys(pages)) {
        const page = pages[key];
        if (page && page.thumbnail && page.thumbnail.source) {
          return page.thumbnail.source;
        }
      }
    }
    await sleep(DELAY_MS);
  }
  return null;
}

/**
 * À partir d'une réponse API, construit la table id → nom.
 * Pour le point k : id = ids.values[ids.index[k]], nom = names.values[names.index[k]].
 */
function buildIdToName(data) {
  const ids = data.points.ids;
  const names = data.points.names;

  if (
    !ids || !Array.isArray(ids.values) || !Array.isArray(ids.index) ||
    !names || !Array.isArray(names.values) || !Array.isArray(names.index)
  ) {
    throw new Error('Réponse inattendue : points.ids / points.names incomplet.');
  }

  const map = new Map();
  for (let k = 0; k < ids.index.length; k++) {
    const id = ids.values[ids.index[k]];
    const name = names.values[names.index[k]];
    if (id != null && name != null) {
      map.set(id, name);
    }
  }
  return map;
}

async function main() {
  const nameUrl =
    'https://wikily.gg/api/ext/tiled-maps/maps/69172511-5059-4a25-8516-a4d0bab25a90/embed-points?wiki=enshrouded&terms=mapterms&cats=bosses&locale=';

  const frData = await fetchJson(nameUrl + 'fr');
  await sleep(DELAY_MS);
  const enData = await fetchJson(nameUrl + 'en');

  // Table id → nom pour chaque langue
  const frById = buildIdToName(frData);
  const enById = buildIdToName(enData);

  // Pour chaque id présent dans les deux langues : fr → en (premier rencontré)
  const bossEn = {};
  for (const [id, frName] of frById) {
    if (enById.has(id)) {
      const enName = enById.get(id);
      if (!(frName in bossEn)) {
        bossEn[frName] = enName;
      }
    }
  }

  // Paires supplémentaires (ajoutées si le nom français n'existe pas déjà)
  const extraPairs = [
    ['Cyclopes Creux', 'Hollow Cyclops'],
    ['Titan Creux', 'Hollow Titan'],
    ['Wispwyvern de Creux', 'Hollow Wispwyvern'],
  ];
  for (const [fr, en] of extraPairs) {
    if (!(fr in bossEn)) {
      bossEn[fr] = en;
    }
  }

  const uniqueFr = Object.keys(bossEn);

  if (uniqueFr.length === 0) {
    console.error('Erreur : aucun boss commun trouvé entre fr et en.');
    process.exit(1);
  }

  const imgDir = path.join('public', 'img', 'boss');
  const dataDir = path.join('public', 'data');
  fs.mkdirSync(imgDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const bossImg = {};
  const bilan = [];
  let okCount = 0;

  for (let i = 0; i < uniqueFr.length; i++) {
    const fr = uniqueFr[i];
    const en = bossEn[fr];

    const thumbUrl = await getThumbnail(en);

    if (thumbUrl) {
      const slug = slugify(en);
      const ext = extFromUrl(thumbUrl);
      const filename = `${slug}.${ext}`;
      const filepath = path.join(imgDir, filename);

      const buf = await fetchBuffer(thumbUrl);
      fs.writeFileSync(filepath, Buffer.from(buf));

      bossImg[fr] = `img/boss/${filename}`;
      bilan.push(`${fr} (${en}) : ok`);
      okCount++;
    } else {
      bilan.push(`${fr} (${en}) : pas d'image`);
    }

    if (i < uniqueFr.length - 1) await sleep(DELAY_MS);
  }

  const outFile = path.join(dataDir, 'boss_img.js');
  const lines = [
    '// Images des boss (enshrouded.wiki.gg), générées par outils/catalogue/boss_images.js',
    'window.BOSS_IMG=' + JSON.stringify(bossImg) + ';',
    'window.BOSS_EN=' + JSON.stringify(bossEn) + ';',
  ];
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');

  console.log('\n=== Bilan ===');
  for (const line of bilan) console.log(line);
  console.log(`\nTotal : ${okCount}/${uniqueFr.length} boss avec image.`);
}

main().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exit(1);
});
