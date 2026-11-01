// Test « Mon équipement : une seule poupée » : node tests/test-tuiles-equipement.js (state et DOM simulés)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const pub = path.join(__dirname, '..', 'public');
const store = {};
const el = () => new Proxy(function () {}, { get: (t, k) => k === 'innerHTML' || k === 'textContent' || k === 'value' ? '' : k === 'dataset' || k === 'style' || k === 'classList' ? el() : el(), apply: () => el(), set: () => true });
const ctx = { console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, navigator: {}, location: { hostname: 'x', hash: '', search: '' }, history: { replaceState() {} },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem() {} }, document: new Proxy({}, { get: (t, k) => k === 'querySelector' ? () => null : k === 'querySelectorAll' ? () => [] : () => el() }),
  fetch: () => new Promise(() => {}), addEventListener() {} };
ctx.window = ctx; vm.createContext(ctx);
const src = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const files = [...src.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].replace(/\?.*$/, '')).filter(f => f !== 'app.js');
for (const f of files) try { vm.runInContext(fs.readFileSync(path.join(pub, f), 'utf8'), ctx, { filename: f }); } catch (e) { /* données non indispensables */ }
vm.runInContext(fs.readFileSync(path.join(pub, 'app.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n'), ctx, { filename: 'app.js' });
const run = c => vm.runInContext(c, ctx), J = c => JSON.parse(run(`JSON.stringify(${c})`));
run(`state.mybuild = 'guardian'; state.level = 32; render = () => {};`);
const eq = () => J(`(() => { const lo = equipped(); return Object.fromEntries(Object.entries(lo.slots).map(([k, s]) => [k, { en: s.item && s.item.en, picked: !!s.picked, gem: s.kind === 'weapon' && s.item ? (gemsForWeapon(s.item, state.mybuild, 1)[0] || {}).key || null : null }])); })()`);
const tile = k => J(`(() => { const lo = equipped(), K = ${JSON.stringify(k)}, ts = tileState(K, lo.slots[K], lo), kd = lo.slots[K].kind; return { n: ts.list.length, shown: ts.shown && ts.shown.en, eq: ts.eq && ts.eq.en, better: ts.better && ts.better.en, lv: ts.list.map(x => itemLv(kd, x)), betterLv: ts.better ? itemLv(kd, ts.better) : null, eqLv: ts.eq ? itemLv(kd, ts.eq) : null }; })()`);
const q = s => s.replace(/'/g, "\\'");
const mainHtml = () => run(`(() => { const lo = equipped(); return tileHtml('main', lo.slots.main, lo); })()`);

// 1. défilement
let t = tile('main');
assert(t.n > 3, 'plusieurs armes possibles'); assert.deepStrictEqual(t.lv, [...t.lv].sort((a, b) => a - b), 'triées par niveau');
assert.strictEqual(t.shown, t.eq); const e0 = eq();
run(`ACTIONS.tileNav('main|1')`); t = tile('main'); assert.notStrictEqual(t.shown, t.eq, 'le défilement change la pièce affichée');
assert.strictEqual(eq().main.en, e0.main.en, 'défiler n\'équipe rien');
run(`ACTIONS.tileNav('main|-1')`); assert.strictEqual(tile('main').shown, e0.main.en);
console.log('OK défilement,', t.n, 'armes');

// 2. Je l'ai
run(`ACTIONS.tileOwn('main|${q(e0.main.en)}')`);
assert(J('state.gearowned').main.includes(e0.main.en)); assert(run(`isOwned('main', '${q(e0.main.en)}')`));
run(`ACTIONS.tileOwn('main|${q(e0.main.en)}')`); assert(!run(`isOwned('main', '${q(e0.main.en)}')`));
console.log('OK Je l\'ai');

// 3. « Mieux » puis équiper la pièce plus forte
t = tile('main'); assert(t.better && t.betterLv > t.eqLv, 'une pièce plus forte est proposée');
const html = mainHtml();
assert(/↑ Mieux/.test(html) && /★ Équipée/.test(html) && /tileNav/.test(html) && /tileOwn/.test(html) && /Niveau \d+/.test(html) && /zoomItem/.test(html));
const higher = t.better, hLv = t.betterLv;
run(`ACTIONS.tileEquip('main|${q(higher)}')`);
const e1 = eq(); assert.strictEqual(e1.main.en, higher); assert(e1.main.picked);
assert.strictEqual(tile('main').shown, higher);
const expGem = run(`(() => { const w = WEAPONS.find(x => x.en === '${q(higher)}'); return (gemsForWeapon(w, state.mybuild, 1)[0] || {}).key || null; })()`);
assert.strictEqual(e1.main.gem, expGem, 'pierre recalculée pour l\'arme équipée');
assert(!expGem || /gem-tile/.test(mainHtml()), 'tuile de pierre cliquable');
console.log('OK équipée :', higher, '(niv.', hLv + ') — pierre', expGem);

// 4. rien de mieux sur la dernière
run(`state.gearpick.main = (() => { const lo = equipped(); const l = slotList('main', lo.slots.main, lo); return l[l.length - 1].en; })()`);
assert.strictEqual(tile('main').better, null); assert(!/↑ Mieux/.test(mainHtml())); console.log('OK pas de Mieux sur la meilleure');

// 5. armure
run(`state.gearpick = {}`); assert(tile('head').n >= 2);
run(`ACTIONS.tileNav('head|1')`); const hs = tile('head').shown; run(`ACTIONS.tileEquip('head|${q(hs)}')`);
assert.strictEqual(eq().head.en, hs); console.log('OK armure équipée', hs);

// 6. migration : pièce >= niveau du joueur => équipée ; pièce en dessous => redevient la proposition par niveau
run(`state.gearpick = {}; state.owned = {}; state.level = 32`);
const altL = J(`(() => { const lo = equipped(); return slotList('alt', lo.slots.alt, lo).map(x => [x.en, itemLv('weapon', x)]); })()`);
const lvAlt = eq().alt.en, up = altL.find(x => x[1] >= 32 && x[0] !== lvAlt), low = altL.find(x => x[1] < 32);
assert(up && low, 'armes de secours au-dessus et en dessous du niveau 32');
run(`state.gearnext = { alt: '${q(up[0])}', main: 'inconnu' }; state.owned = { '${q(up[0])}': true }`);
assert.strictEqual(eq().alt.en, up[0], 'gearnext possédé au niveau du joueur ou plus => équipé'); assert.deepStrictEqual(J('state.gearnext'), {});
run(`state.gearpick = {}; state.gearnext = { alt: '${q(low[0])}' }; state.owned = { '${q(low[0])}': true }`);
assert(!J('state.gearpick').alt, 'gearnext sous le niveau : pas un choix explicite'); assert.strictEqual(eq().alt.en, lvAlt);
run(`state.gearpick = { alt: '${q(lvAlt)}' }; state.gearnext = { alt: '${q(up[0])}' }; state.owned = { '${q(up[0])}': true }`);
assert.strictEqual(eq().alt.en, lvAlt, 'gearpick prioritaire'); console.log('OK migration');

// 6b. départ au niveau du joueur
run(`state.gearpick = {}; state.gearnext = {}; state.owned = {}; state.level = 32`);
const lvOf = k => J(`(() => { const lo = equipped(), s = lo.slots['${k}']; return { lv: itemLv(s.kind, s.item), all: slotList('${k}', s, lo).map(x => itemLv(s.kind, x)), picked: !!s.picked }; })()`);
for (const k of ['main', 'alt', 'ring1', 'head', 'chest', 'feet']) {
  const r = lvOf(k), ok = r.all.filter(l => l <= 32);
  assert.strictEqual(r.lv, ok.length ? Math.max(...ok) : Math.min(...r.all), k + ' : pièce de niveau <= 32 (ou la plus basse)'); assert(!r.picked);
  const t = tile(k); assert.strictEqual(t.shown, t.eq, k + ' affichée = proposée');
}
assert(lvOf('main').all.some(l => l > 32), 'il existe des armes au-dessus du niveau 32');
const e32 = eq(); run(`ACTIONS.tileNav('main|1'); ACTIONS.tileNav('main|1')`);
assert.deepStrictEqual(eq().main, e32.main, 'défiler ne change pas l\'équipée');
assert(/◎ Mon niveau/.test(mainHtml()), 'bouton Mon niveau quand on a défilé');
run(`ACTIONS.tileLevel('main')`); assert.strictEqual(tile('main').shown, e32.main.en, 'Mon niveau recentre'); assert(!/◎ Mon niveau/.test(mainHtml()));
// équiper fixe, ligne « Ton niveau » si plus faible
const lowMain = J(`(() => { const lo = equipped(); return slotList('main', lo.slots.main, lo)[0].en; })()`);
run(`ACTIONS.tileEquip('main|${q(lowMain)}')`);
assert.strictEqual(eq().main.en, lowMain); assert(/↑ Ton niveau/.test(mainHtml()), 'Ton niveau si l\'équipée est plus faible');
run(`state.level = 36`); assert.strictEqual(eq().main.en, lowMain, 'choix explicite conservé au passage 32 → 36');
// sans choix : la tuile suit le niveau
run(`state.gearpick = {}; state.level = 32`); const before = lvOf('main').lv; run(`state.level = 50`);
const after = lvOf('main').lv; assert(after >= before); run(`state.level = 32`);
const w = J(`(() => { state.level = 32; const a = equipped().slots.main.item.en; state.level = 40; const b = equipped().slots.main.item.en; state.level = 32; return [a, b]; })()`);
assert.notStrictEqual(w[0], w[1], 'niveau 32 → 40 sans choix : la tuile suit');
console.log('OK départ au niveau, Mon niveau, suivi du niveau');

// 7. changement de build, vue, clés de synchro
run(`state.gearpick = { main: '${q(higher)}' }; state.mybuild = 'wizard'; pruneGearPicks();`);
assert(!run('state.gearpick.main')); run(`state.mybuild = 'guardian'`);
const v = run('VIEWS.char()'); assert(/tile-nav/.test(v)); assert(!/Prochain équipement|prochain équipement/.test(v));
assert(!/undefined|NaN|\[object/.test(v), "pas de undefined dans la vue");
assert(run('SYNC_KEYS.includes("gearowned") && "gearowned" in DEFAULTS'));
console.log('TOUT OK');
