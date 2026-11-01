// Test « Sertissage » : node tests/test-sertissage.js (case Sertie mémorisée/décochée, essence selon le niveau de l'arme)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const pub = path.join(__dirname, '..', 'public');
const store = {};
const el = () => new Proxy(function () {}, { get: (t, k) => k === 'innerHTML' || k === 'textContent' || k === 'value' ? '' : k === 'dataset' || k === 'style' || k === 'classList' ? el() : el(), apply: () => el(), set: () => true });
const ctx = { console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, navigator: {}, location: { hostname: 'x', hash: '', search: '' }, history: { replaceState() {} },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem() {} }, document: new Proxy({}, { get: (t, k) => k === 'querySelector' ? () => null : k === 'querySelectorAll' ? () => [] : () => el() }),
  fetch: () => new Promise(() => {}), addEventListener() {} };
ctx.scrollTo = () => {}; ctx.window = ctx; vm.createContext(ctx);
const src = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
assert(/data\/sertissage\.js/.test(src), 'sertissage.js chargé par la page');
const files = [...src.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].replace(/\?.*$/, '')).filter(f => f !== 'app.js');
for (const f of files) try { vm.runInContext(fs.readFileSync(path.join(pub, f), 'utf8'), ctx, { filename: f }); } catch (e) { /* données non indispensables */ }
vm.runInContext(fs.readFileSync(path.join(pub, 'app.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n'), ctx, { filename: 'app.js' });
const run = c => vm.runInContext(c, ctx), J = c => JSON.parse(run(`JSON.stringify(${c})`));
run(`state.mybuild = 'guardian'; state.level = 32; render = () => {};`);
const q = s => s.replace(/'/g, "\\'");
const mainHtml = () => run(`(() => { const lo = equipped(); return tileHtml('main', lo.slots.main, lo); })()`);
const cur = () => J(`(() => { const w = equipped().slots.main.item; return { en: w.en, lv: w.lv, gem: gemsForWeapon(w, state.mybuild, 1)[0].key }; })()`);

// 1. données : 20 forges identifiées, essence I→VII croissante avec le niveau
assert(J('SERTISSAGE.forges.filter(f => f.tier).length') >= 20);
const tiers = J('SERTISSAGE.tiers'); assert.strictEqual(tiers.length, 7);
assert.deepStrictEqual(tiers.map(t => t.max), [...tiers.map(t => t.max)].sort((a, b) => a - b));
assert.strictEqual(run('sertiTier(5).fr'), 'Essence archaïque I'); assert.strictEqual(run('sertiTier(33).fr'), 'Essence archaïque V'); assert.strictEqual(run('sertiTier(50).fr'), 'Essence archaïque VI');
console.log('OK essence selon le niveau');

// 2. case Sertie : cochée, mémorisée, décochée au changement d'arme
let c = cur(); const slotArg = `main|${c.gem}|${q(c.en)}`;
assert(/☐ Sertie/.test(mainHtml()), 'case décochée au départ'); assert(/Essence archaïque [IVX]+/.test(mainHtml()), 'essence sous la tuile');
run(`ACTIONS.gemSet('${slotArg}')`);
assert(/✔ Sertie/.test(mainHtml())); assert(J('state.gemset').main.startsWith(c.gem), 'mémorisée dans gemset');
run(`ACTIONS.gemSet('${slotArg}')`); assert(/☐ Sertie/.test(mainHtml()), 'recocher/décocher');
run(`ACTIONS.gemSet('${slotArg}')`);
const better = J(`(() => { const lo = equipped(); return tileState('main', lo.slots.main, lo).better.en; })()`);
run(`ACTIONS.tileEquip('main|${q(better)}')`);
assert(!J('state.gemset').main, 'décochée quand l\'arme équipée change'); assert(/☐ Sertie/.test(mainHtml()));
console.log('OK case Sertie mémorisée puis décochée');

// 3. fiche : essence, forges avec carte, sources de la pierre ; synchro
c = cur(); const w = J(`WEAPONS.find(x => x.en === '${q(c.en)}')`);
const sb = run(`sertiBlock(WEAPONS.find(x => x.en === '${q(c.en)}'))`);
assert(sb.includes(run(`sertiTier(${w.lv}).fr`)) && /forgeMap/.test(sb) && /Voir sur la carte/.test(sb) && /à vérifier en jeu/.test(sb));
assert(J(`gemWhere(GEMS[0])`).length >= 1);
assert(J('SYNC_KEYS').includes('gemset') && J('DEFAULTS').gemset);
run(`go = v => { state.view = v; }; ACTIONS.forgeMap(0)`); assert.strictEqual(J('state.carteFocus.forge'), 0);
console.log('OK fiche : essence', run(`sertiTier(${w.lv}).fr`), 'pour une arme niv.', w.lv);
