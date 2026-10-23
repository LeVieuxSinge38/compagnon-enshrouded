// Génère public/data/gear.js : les ensembles d'armure (wiki enshrouded.wiki.gg), classés par style et niveau,
// avec leur source (artisan + déblocage, ou butin) et des étiquettes pour les relier aux builds.
// Usage : node outils/equipement/build_gear.js <dossier> ; le dossier contient Armor_Magic.txt, Armor_Ranged.txt,
// Armor_Melee.txt (wikitext des pages Armor/…) et pages/<Nom de l'ensemble>.txt (wikitext de chaque ensemble).
// Les textes sont traduits avec Google Traduction puis corrigés avec le vocabulaire du jeu.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2];
const ROOT = path.join(__dirname, '..', '..');

// Liste des ensembles : onglets par biome dans les pages Armor/Magic, Armor/Ranged, Armor/Melee
const sets = [];
for (const [style, f] of [['magic', 'Armor_Magic.txt'], ['ranged', 'Armor_Ranged.txt'], ['melee', 'Armor_Melee.txt']]) {
  const parts = fs.readFileSync(path.join(dir, f), 'utf8').split(/\n([A-Za-z ]+?) ?Armor ?=\s*\n/);
  for (let i = 1; i < parts.length; i += 2) {
    const re = /\n\[\[([^\]|]+?)\]\]\n((?:\|-\n)?(?:\| \{\{Item\+icon\| ?[^}]+\}\}\n(?:\|-\n)?)+)/g;
    let m;
    while ((m = re.exec(parts[i + 1]))) sets.push({ set: m[1].trim(), style, biome: parts[i].trim(), pieces: [...m[2].matchAll(/Item\+icon\| ?([^}]+)\}\}/g)].map(x => x[1].trim()) });
  }
}

const ctx = { window: {} }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/data/recipes.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/data/materials.js'), 'utf8'), ctx);
// Version précédente du fichier généré (si Google Traduction refuse, on reprend ses textes)
const PREV = (() => { try { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/data/gear.js'), 'utf8'), c); return c.window.GEAR || []; } catch { return []; } })();
const NOM_FR = JSON.parse(fs.readFileSync(path.join(__dirname, 'noms_fr.json'), 'utf8'));
// Noms protégés pendant la traduction (remplacés par des jetons) : ensembles, puis matériaux et objets déjà connus en français
const PROTECT = [...Object.entries(NOM_FR).map(([en, f]) => [en, `« ${f} »`]),
  ...Object.entries({ ...ctx.PRODUCT_FR, ...Object.fromEntries(ctx.MATERIALS.filter(m => m.fr).map(m => [m.n, m.fr])) }).filter(([en]) => en.length >= 4)]
  .sort((a, b) => b[0].length - a[0].length);
const protect = t => { PROTECT.forEach(([en], i) => { t = t.split(en).join(`ZQ${i}Q`); }); return t; };
const unprotect = t => t.replace(/ZQ\s?(\d+)\s?Q/g, (_, i) => PROTECT[+i][1]);
const clean = (t, name) => t.replace(/\{\{(?:SUBPAGENAME|PAGENAME)\}\}/g, name)
  .replace(/\{\{MapLink[^}]*?\|\s*([^|}=]+?)\s*\|\s*size=[^}]*\}\}/g, '$1')
  .replace(/\[\[File:[^\]]+\]\]/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
  .replace(/\{\{(?:item\+iconright|Item\+icon|quest\+the|quest)\|\s*([^}|]+)[^}]*\}\}/gi, '$1').replace(/:c:/g, '')
  .replace(/'''|''/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// Étiquettes : à quoi sert l'ensemble (tirées de la description du wiki)
function tagsOf(t, own) {
  // Seulement ce qui décrit CET ensemble : on retire « contrairement à l'ensemble X… » et les phrases qui parlent d'un autre ensemble
  const others = sets.map(x => x.set).filter(n => n !== own);
  const s = t.replace(/,?\s*unlike the [^.]*?\bSet\b/gi, '').split(/(?<=\.)\s+/)
    .filter(p => !others.some(n => p.includes(n))).join(' ').toLowerCase(), tags = [];
  const has = (...w) => w.some(x => s.includes(x));
  if (has('staff')) tags.push('staff');
  if (has('wand')) tags.push('wand');
  if (has('heal')) tags.push('heal');
  if (has('two-handed', 'barbarian', 'hammer')) tags.push('2h');
  if (has('one-handed', 'sword')) tags.push('1h');
  if (has('tank', 'block', 'shield')) tags.push('tank');
  if (has('dagger', 'backstab', 'stealth', 'assassin')) tags.push('dagger');
  if (has('bow', 'marksman', 'precision')) tags.push('bow');
  if (has('unarmed')) tags.push('unarmed');
  if (has('starter')) tags.push('starter');
  if (has('generalist', 'all ranged', 'all magic', 'all melee', 'suitable for all')) tags.push('general');
  if (has('not recommended')) tags.push('notrec');
  return tags;
}

// Traductions brutes gardées dans traductions_cache.json : relancer le script ne retraduit que les textes nouveaux
const CACHE_FILE = path.join(__dirname, 'traductions_cache.json');
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
async function gtx(text) {
  if (cache[text]) return cache[text];
  if (process.env.GEAR_OFFLINE) throw new Error('traduction désactivée'); // GEAR_OFFLINE=1 : réutilise les textes déjà générés
  for (let essai = 0; ; essai++) {
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t', { method: 'POST', body: new URLSearchParams({ q: text }) });
    if (r.status === 429 && essai < 5) { await new Promise(ok => setTimeout(ok, 20000 * (essai + 1))); continue; } // trop de demandes : on patiente
    if (!r.ok) throw new Error('traduction ' + r.status);
    cache[text] = ((await r.json())[0] || []).map(x => x[0] || '').join('');
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
    await new Promise(ok => setTimeout(ok, 1500));
    return cache[text];
  }
}
const GAME_FR = [[/\b(Les|les) (?:pièces de décor|pièces du décor|décors|éléments de décor|éléments du décor|pièces d'ensemble)/g, '$1 pièces'],
  [/\b(?:le|du) Hunter\b/g, m => m.startsWith('du') ? 'du Chasseur' : 'le Chasseur'], [/\bHunter\b/g, 'Chasseur'], [/\b(le|du) forgeron\b/g, '$1 Forgeron'],
  [/\bun set\b/g, 'un ensemble'], [/\bCe set\b/g, 'Cet ensemble'], [/\b(Le|L') ?« /g, 'L\'ensemble « '], [/\bensemble « ([^»]+) » (?:Set|ensemble)\b/g, 'ensemble « $1 »'],
  [/\bchars\b/g, 'tanks'], [/\bun char\b/g, 'un tank'], [/\bsont fabriqués\b/g, 'sont fabriquées'], [/\bobtenus aléatoirement\b/g, 'obtenues aléatoirement'],
  [/\bobtention (?:du|de la|des) ([A-ZÉÈ])/g, 'obtention de $1'], [/\bhautes terres nomades\b/gi, 'Plateaux nomades'], [/\b(?:le |du )?bassin de Veilwater\b/gi, 'Bassin des eaux voilées'],
  [/\bsommets d'Albaneve\b/g, 'Sommets d\'Albaneve'], [/\b(?:pillables|récupérables)\b/g, ''], [/\s+,/g, ','], [/\s{2,}/g, ' '],
  [/\bMerciless (?:Strike|Attack)s?\b/g, 'Attaque impitoyable'], [/\bBackstab\b/g, 'coup dans le dos'], [/\btirs de compétence\b/g, 'coups d\'adresse'],
  // Archétypes de l'arbre : noms officiels du jeu en français
  [/\bTrickster\b/g, 'Farceur'], [/\bWizard\b/g, 'Magicien'], [/\bHealer\b/g, 'Guérisseur'], [/\bBattlemage\b/g, 'Mage de combat'], [/\bBeastmaster\b/g, 'Maître de la bête'],
  [/\bSurvivor\b/g, 'Survivant'], [/\bRanger\b/g, 'Garde forestier'], [/\bAssassin\b/g, 'Assassin'], [/\bBarbarian\b/g, 'Barbare'], [/\bWarrior\b/g, 'Guerrier'], [/\bAthlete\b/g, 'Athlète'],
  [/\b(?:aux |les )?rangers\b/g, m => m.startsWith('aux') ? 'aux gardes forestiers' : 'les gardes forestiers'], [/\bLinceul\b/g, 'Brume'], [/\blinceul\b/g, 'Brume'], [/\bEmbervale\b/g, 'Valdebraise'], [/\bForgeron\b/g, 'Forgeron'],
  [/\bSpringlands\b/g, 'Hautes pâtures'], [/\bNomad Highlands\b/g, 'Plateaux nomades'], [/\bHauts plateaux nomades\b/gi, 'Plateaux nomades'], [/\bKindlewastes\b/g, 'Regs exaltés'],
  [/\bAlbaneve Summits\b/g, 'Sommets d\'Albaneve'], [/\bSommets d'Albaneve\b/g, 'Sommets d\'Albaneve'], [/\bVeilwater Basin\b/g, 'Bassin des eaux voilées'], [/\bBassin de Veilwater\b/g, 'Bassin des eaux voilées'],
  [/\bcoffres pillables\b/gi, 'coffres'], [/\bboss\b/g, 'boss']];
const fr = t => GAME_FR.reduce((s, [re, by]) => s.replace(re, by), t);

(async () => {
  const out = [];
  for (const s of sets) {
    const t = fs.readFileSync(path.join(dir, 'pages', s.set.replace(/[^\w ]/g, '_') + '.txt'), 'utf8');
    const intro = clean(t.split(/==\s*Source/i)[0], s.set);
    const src = clean((t.split(/==\s*Source\s*==/i)[1] || '').split(/\n==/)[0] || '', s.set);
    const lv = +((/level (\d+)/i.exec(intro) || [])[1] || 0);
    const station = (/crafted (?:at|by) the (Blacksmith|Hunter|Alchemist|Farmer|Carpenter|Bard)/.exec(src) || [])[1] || null;
    let introFr, srcFr;
    try { [introFr, srcFr] = (await gtx([protect(intro), protect(src)].join('\n'))).split('\n').map(unprotect); }
    catch (e) { const p = PREV.find(x => x.en === s.set); if (!p) throw e; introFr = p.why; srcFr = p.src; } // Google indisponible : traduction précédente
    out.push({ id: s.set.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-set$/, ''), en: s.set, fr: NOM_FR[s.set] || s.set,
      style: s.style, biome: s.biome, lv, station, pieces: s.pieces.map(p => [p, ctx.RECIPES[p] ? 1 : 0]), tags: tagsOf(intro, s.set),
      why: fr(introFr || intro), src: fr(srcFr || src) });

  }
  out.sort((a, b) => a.lv - b.lv || a.style.localeCompare(b.style));
  fs.writeFileSync(path.join(ROOT, 'public/data/gear.js'),
    '// Ensembles d\'armure — source : enshrouded.wiki.gg (18/10/2026), textes traduits automatiquement. Généré par outils/equipement/build_gear.js\n'
    + 'window.GEAR=' + JSON.stringify(out) + ';\n');
  console.log(out.length, 'ensembles');
})();
