// Génère public/data/equip.js : armes, boucliers, anneaux et stats des pièces d'armure (wiki enshrouded.wiki.gg),
// pour la page « Mon personnage ». Usage : node outils/equipement/build_equip.js <dossier>, le dossier contenant
// weapons.json, perks.json, armorstats.json (requêtes cargoquery du wiki), Rings.json et Shields.json (action=parse).
// Noms et descriptions traduits avec Google Traduction (cache commun traductions_cache.json), effets traduits ici.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2], ROOT = path.join(__dirname, '..', '..');
// Le wiki renvoie les textes de ses tables avec les caractères spéciaux encodés (« Arsonist&#39;s Bow »)
const unent = v => typeof v === 'string' ? v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : v;
const deep = o => Array.isArray(o) ? o.map(deep) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deep(v)])) : unent(o);
const J = f => deep(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const ctx = { window: {} }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['recipes.js', 'gear.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'), ctx);
const RECIPES = ctx.RECIPES, GEAR = ctx.GEAR;

// ---------- Traduction (Google, avec cache) ----------
const CACHE_FILE = path.join(__dirname, 'traductions_cache.json');
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
async function gtx(text) {
  if (cache[text] !== undefined) return cache[text];
  if (process.env.GEAR_OFFLINE) return text;
  for (let essai = 0; ; essai++) {
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t', { method: 'POST', body: new URLSearchParams({ q: text }) });
    if (r.status === 429 && essai < 4) { await new Promise(ok => setTimeout(ok, 30000 * (essai + 1))); continue; }
    if (!r.ok) { console.warn('traduction impossible', r.status); return text; }
    cache[text] = ((await r.json())[0] || []).map(x => x[0] || '').join('');
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
    await new Promise(ok => setTimeout(ok, 2000));
    return cache[text];
  }
}
// Traduit une liste de textes courts en peu de requêtes (une ligne par texte)
async function many(list) {
  const out = [];
  for (let i = 0; i < list.length;) {
    let j = i, len = 0;
    while (j < list.length && (j === i || len + list[j].length < 3000)) len += list[j++].length + 1;
    const part = list.slice(i, j), lines = (await gtx(part.join('\n'))).split('\n');
    out.push(...(lines.length === part.length ? lines : part).map(s => s.trim()));
    i = j;
  }
  return out;
}

// Traductions faites à la main (noms_equip_fr.json) d'abord ; Google seulement pour ce qui manque
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, 'noms_equip_fr.json'), 'utf8'));
async function tr(list, dict) {
  const miss = [...new Set(list.filter(x => !(x in dict) && x !== '-'))], got = miss.length ? await many(miss) : [];
  const m = new Map(miss.map((x, i) => [x, got[i]]));
  return list.map(x => x in dict ? dict[x] : x === '-' ? '' : m.get(x) || x);
}

// ---------- Vocabulaire du jeu ----------
const BIOME_LV = { 'Springlands': 8, 'Revelwood': 13, 'Nomad Highlands': 18, 'Kindlewastes': 23, 'Albaneve Summits': 33, 'Veilwater Basin': 43 };
const TYPE_FR = { 'Two-handed Axe': 'Hache à deux mains', 'Two-handed Hammer': 'Marteau à deux mains', 'One-handed Sword': 'Épée à une main', 'Daggers': 'Dagues',
  'Two-handed Club': 'Massue à deux mains', 'Wand': 'Baguette', 'Bow': 'Arc', 'Two-handed Greatsword': 'Espadon', 'One-handed Axe': 'Hache à une main', 'Staff': 'Bâton', 'One-handed Club': 'Massue à une main' };
const PERK_FR = { 'Blazing': 'Ardent', 'Blunt Damage': 'Dégâts contondants', 'Brutal': 'Brutal', 'Cleansing': 'Purifiant', 'Cutting Damage': 'Dégâts tranchants', "Dragon's Strength": 'Force du dragon',
  'Enduring': 'Endurant', 'Glacial': 'Glacial', 'Headseeker': 'Chercheur de tête', 'Health Leech': 'Vol de vie', 'Magic Fire Damage': 'Dégâts de feu', 'Magic Ice Damage': 'Dégâts de glace',
  'Magic Shock Damage': 'Dégâts de foudre', 'Magic Shroud Damage': 'Dégâts de Brume', 'Mana Leech': 'Vol de mana', 'Merciless': 'Impitoyable', 'Nebulous': 'Nébuleux', 'Ophidian': 'Ophidien',
  'Opportunistic': 'Opportuniste', 'Piercing Damage': 'Dégâts perforants', 'Poison Damage': 'Dégâts de poison', 'Precise': 'Précis', 'Primal': 'Primal', 'Reaping': 'Moissonneur', 'Renewal': 'Renouveau',
  'Retaliation': 'Riposte', 'Ruthless': 'Sans pitié', 'Sacred': 'Sacré', 'Scrounging': 'Fouineur', 'Sneaky': 'Sournois', 'Spiritual': 'Spirituel', 'Stalking': 'Traqueur', 'Stamina Leech': "Vol d'endurance",
  'Thundery': 'Orageux', 'Venomous Blades': 'Lames venimeuses', 'Vicious': 'Vicieux', 'Vital': 'Vital' };
// Effets des objets : « + 20 Health » → « + 20 vie »
const EFF = [[/Backstabbing [Dd]amage/, 'dégâts dans le dos'], [/Critical Strike Chance Vs Soaked Enemies/, 'chance de critique contre les ennemis trempés'],
  [/Critical Strike Damage Vs Soaked Enemies/, 'dégâts critiques contre les ennemis trempés'], [/Magical Critical Strike Chance/, 'chance de critique magique'],
  [/Melee Critical Strike Chance/, 'chance de critique en mêlée'], [/Ranged Critical Strike Chance/, 'chance de critique à distance'], [/Critical Strike Chance/, 'chance de coup critique'],
  [/Critical (?:Strike )?Damage/, 'dégâts critiques'], [/Damage [Aa]gainst Melee (?:enemies|Foes)/, 'dégâts contre les ennemis de mêlée'], [/Damage against Ranged (?:enemies|Foes)/, 'dégâts contre les ennemis à distance'],
  [/Damage against Magical (?:enemies|Foes)/, 'dégâts contre les ennemis magiques'], [/Damage against Flying enemies/, 'dégâts contre les ennemis volants'], [/Damage against Fell/, 'dégâts contre les Fell'],
  [/Damage against Drak/, 'dégâts contre les Drak'], [/Fire Magic Damage while Enshrouded/, 'dégâts de feu dans la Brume'], [/Ranged Damage while Enshrouded/, 'dégâts à distance dans la Brume'],
  [/Two-Handed Melee Damage while Enshrouded/, 'dégâts à deux mains dans la Brume'], [/Two-Handed Melee Damage/, 'dégâts à deux mains'], [/One-Handed Melee Damage/, 'dégâts à une main'],
  [/Unarmed Melee Damage/, 'dégâts à mains nues'], [/Magic Blunt Damage/, 'dégâts contondants magiques'], [/Melee Blunt Damage/, 'dégâts contondants en mêlée'], [/Ranged Blunt Damage/, 'dégâts contondants à distance'],
  [/Merciless (?:Attack|Strike) Damage/, "dégâts d'Attaque impitoyable"], [/Sneak Attack Damage/, 'dégâts en attaque furtive'], [/Skillshot Damage/, "dégâts de Coup d'adresse"],
  [/Increased Fire Damage/, 'dégâts de feu'], [/Increased Ice Damage/, 'dégâts de glace'], [/Increased Shock Damage/, 'dégâts de foudre'], [/Increased Shroud Damage/, 'dégâts de Brume'],
  [/Melee Damage/, 'dégâts de mêlée'], [/Magic Damage/, 'dégâts magiques'], [/Ranged Damage/, 'dégâts à distance'], [/Bow Damage/, "dégâts à l'arc"], [/Dagger Damage/, 'dégâts aux dagues'],
  [/Greatsword Damage/, "dégâts à l'espadon"], [/Staff Damage/, 'dégâts au bâton'], [/Wand Damage/, 'dégâts à la baguette'], [/Fire Resistance/, 'résistance au feu'], [/Frost Resistance/, 'résistance au froid'],
  [/Ice Resistance/, 'résistance à la glace'], [/Poison Resistance/, 'résistance au poison'], [/Shock Resistance/, 'résistance à la foudre'], [/Shroud Resistance/, 'résistance à la Brume'],
  [/Health Regeneration Delay/, 'délai de régénération de vie'], [/Mana Regeneration Delay/, 'délai de régénération de mana'], [/Stamina Regeneration Delay/, "délai de régénération d'endurance"],
  [/Health Regeneration/, 'régénération de vie'], [/Mana Regeneration/, 'régénération de mana'], [/Stamina Regeneration/, "régénération d'endurance"], [/Health Leech/, 'vol de vie'],
  [/Life Leech Chance/, 'chance de vol de vie'], [/Stamina Depletion Climbing/, "endurance dépensée en escalade"], [/Stamina Depletion Gliding/, 'endurance dépensée en planant'],
  [/Stamina Depletion Sprinting/, 'endurance dépensée en sprint'], [/Maximum time in the Shroud|Time In The Shroud/, 'temps dans la Brume'], [/Wet Duration Reduction/, 'de durée mouillé en moins'],
  [/Maximum Oxygen/, "oxygène maximum"], [/Revive Heal Percentage/, 'soin à la réanimation'], [/Revive Duration/, 'durée de réanimation'], [/Metal Mining Strength/, 'puissance de minage du métal'],
  [/Stone Mining Strength/, 'puissance de minage de la pierre'], [/Wood Chopping Strength/, 'puissance de coupe du bois'], [/Swim Sprint Speed/, 'vitesse de nage rapide'], [/Sprint Speed/, 'vitesse de sprint'],
  [/Sneak Speed/, 'vitesse en furtivité'], [/Parry Power/, 'puissance de parade'], [/Well Rested/, 'Bien reposé'], [/Inner Fires/, 'Feu intérieur'], [/\bRested\b/, 'Reposé'], [/Healing/, 'soins'],
  [/\bBlock\b/, 'blocage'], [/\bHealth\b/, 'vie'], [/\bMana\b/, 'mana'], [/\bStamina\b/, 'endurance']];
const effFr = e => EFF.reduce((s, [re, by]) => s.replace(re, by), String(e).replace(/\s+/g, ' ').trim()).replace(/(\d)\s?min\b/, '$1 min');
const effs = html => String(html || '').split(/<br\s*\/?>|\n+/).map(x => x.replace(/<[^>]+>/g, '').trim()).filter(x => /\d/.test(x)).map(effFr);
const clean = t => String(t || '').replace(/\{\{MapLink[^}]*?\|\s*([^|}=]+?)\s*(?:\|\s*size=[^}]*)?\}\}/g, '$1').replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
  .replace(/\{\{(?:item\+iconright|Item\+icon)\|\s*([^}|]+)[^}]*\}\}/gi, '$1').replace(/:Category:/g, '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const GAME_FR = [[/\bLinceul\b/g, 'Brume'], [/\blinceul\b/g, 'Brume'], [/\bSpringlands\b/g, 'Hautes pâtures'], [/\bNomad Highlands\b/g, 'Plateaux nomades'], [/\bKindlewastes\b/g, 'Regs exaltés'],
  [/\bAlbaneve Summits\b/g, "Sommets d'Albaneve"], [/\bVeilwater Basin\b/g, 'Bassin des eaux voilées'], [/\bhautes terres nomades\b/gi, 'Plateaux nomades']];
const fr = t => GAME_FR.reduce((s, [re, by]) => s.replace(re, by), t);

(async () => {
  // ---------- Armes ----------
  const weapons = J('weapons.json').cargoquery.map(x => x.title);
  const wNames = await tr(weapons.map(w => w.Weapon), MAN.weapons);
  const W = weapons.map((w, i) => {
    const src = (w.Source || '').split(',').map(s => s.trim()).filter(Boolean);
    const biome = src.find(s => BIOME_LV[s]) || null;
    return { en: w.Weapon, fr: fr(wNames[i] || w.Weapon), type: w.WeaponType, lv: biome ? BIOME_LV[biome] : null, biome,
      craft: src.includes('Craftable') || !!RECIPES[w.Weapon] ? 1 : 0, lore: src.includes('Lore Weapon') ? 1 : 0,
      other: src.filter(s => !BIOME_LV[s] && s !== 'Craftable' && s !== 'Lore Weapon'), perks: (w.Perks || '').split(',').map(p => p.trim()).filter(Boolean) };
  });

  // ---------- Boucliers et protections magiques ----------
  const ST = J('Shields.json').parse.wikitext;
  const wardsAt = ST.indexOf('==Wards');
  const SHIELD_LV = { 'Shield': 5, 'Wooden Shield': 3, "Pikemead's Bulwark": 13, 'Riptide': 13, 'Fell Shield': 18, 'Valiant Shield': 13, "Hero's Shield": 13, 'Shield of Light': 25,
    'Spectral Ward': 8, 'Ghostly Shield': 13, 'Transcendental Screen': 18, 'Ethereal Plane': 23, 'Invisible Barrier': 33, 'Prismatic Ward': 43 };
  const shieldRows = [];
  for (const [i, r] of ST.split('|-').entries()) {
    const m = /\[\[([^\]|]+)\]\]\s*\|\|\s*([^|]*)\|\|\s*([^|]*)\|\|\s*([^|]*)\|\|\s*([^|]*)\|\|\s*([\s\S]*)/.exec(r.replace(/\[\[File:[^\]]*\]\]/g, ''));
    if (!m) continue;
    const en = m[1].trim(), set = GEAR.find(g => en.startsWith(g.en.replace(/ Set$/, '')));
    shieldRows.push({ en, ward: ST.indexOf(r) > wardsAt ? 1 : 0, block: +m[2] || 0, parry: +m[3] || 0, eff: effs(m[5].split('|}')[0]),
      lv: SHIELD_LV[en] || (set ? set.lv : null), craft: RECIPES[en] || /DataQuery/.test(m[6]) ? 1 : 0, srcEn: /DataQuery/.test(m[6]) ? '' : clean(m[6].split('|}')[0]) });
  }
  const sNames = await tr(shieldRows.map(s => s.en), MAN.shields), sSrc = await tr(shieldRows.map(s => s.srcEn || '-'), MAN.sources);
  const SH = shieldRows.map((s, i) => ({ ...s, fr: fr(sNames[i]), src: s.srcEn ? fr(sSrc[i]) : '', srcEn: undefined }));

  // ---------- Anneaux ----------
  const RT = J('Rings.json').parse.wikitext, RINGS = [];
  const TIER = { Lesser: ' mineur', Greater: ' majeur', Superior: ' supérieur', Exceptional: ' exceptionnel', Ultimate: ' ultime' };
  const KIND = { Health: ['health', 'de vie'], Stamina: ['stamina', "d'endurance"], Mana: ['mana', 'de mana'] };
  for (const sec of RT.split(/\n=== /).slice(1)) {
    const rarity = sec.split(' ===')[0];
    for (const row of sec.split('|-').slice(1)) {
      const m = /Item\+icon\|\s*([^}]+)\}\}([\s\S]*)/.exec(row);
      if (!m) continue;
      const cells = m[2].split(/\n\||\|\|/).map(c => c.trim()).filter(Boolean);
      const en = m[1].trim(), effect = cells[0] || '', src = clean(cells.slice(1).join(' ').split('|}')[0]);
      const b = (/\(([^)]+)\)/.exec(src) || [])[1], biome = BIOME_LV[b] ? b : null;
      const std = /^(?:(Lesser|Greater|Superior|Exceptional|Ultimate) )?Ring of (Health|Stamina|Mana)$/.exec(en);
      RINGS.push({ en, fr: std ? `Anneau ${KIND[std[2]][1]}${TIER[std[1]] || ''}` : null, kind: std ? KIND[std[2]][0] : 'special', rarity,
        lv: biome ? BIOME_LV[biome] : null, biome, eff: effs(effect.replace(/\n\s*\+/g, '<br>+')), srcEn: /^World Drop/.test(src) ? '' : src });
    }
  }
  const special = RINGS.filter(r => !r.fr);
  const rNames = await tr(special.map(r => r.en), MAN.rings);
  special.forEach((r, i) => { r.fr = rNames[i].replace(/^Bague/, 'Anneau'); });
  const rSrc = await tr(RINGS.map(r => r.srcEn || '-'), MAN.sources);
  RINGS.forEach((r, i) => { r.src = r.srcEn ? fr(rSrc[i]) : (r.biome ? `Butin aléatoire (${fr(r.biome)})` : 'Butin aléatoire'); delete r.srcEn; });

  // ---------- Stats des pièces d'armure (seulement celles des ensembles connus) ----------
  const pieces = new Set(GEAR.flatMap(g => g.pieces.map(p => p[0])));
  const ARMOR = {};
  for (const a of J('armorstats.json').cargoquery.map(x => x.title))
    if (pieces.has(a.PieceName)) ARMOR[a.PieceName] = [+a.Physical || 0, +a.Magical || 0, [a.Effect1, a.Effect2, a.Effect3, a.Effect4].filter(Boolean).map(effFr)];

  // ---------- Effets des armes (descriptions) ----------
  const perks = J('perks.json').cargoquery.map(x => x.title);
  const pDesc = await tr(perks.map(p => p.Name), MAN.perks);
  const PERKS = Object.fromEntries(perks.map((p, i) => [p.Name, [PERK_FR[p.Name] || p.Name, fr(pDesc[i])]]));

  fs.writeFileSync(path.join(ROOT, 'public/data/equip.js'),
    '// Armes, boucliers, anneaux et stats d\'armure — source : enshrouded.wiki.gg (18/10/2026), noms traduits automatiquement. Généré par outils/equipement/build_equip.js\n'
    + 'window.WEAPONS=' + JSON.stringify(W) + ';\nwindow.SHIELDS=' + JSON.stringify(SH) + ';\nwindow.RINGS=' + JSON.stringify(RINGS)
    + ';\nwindow.ARMOR_STATS=' + JSON.stringify(ARMOR) + ';\nwindow.PERKS=' + JSON.stringify(PERKS) + ';\nwindow.WEAPON_TYPE_FR=' + JSON.stringify(TYPE_FR) + ';\n');
  console.log(W.length, 'armes,', SH.length, 'boucliers,', RINGS.length, 'anneaux,', Object.keys(ARMOR).length, 'pièces d\'armure');
})();
