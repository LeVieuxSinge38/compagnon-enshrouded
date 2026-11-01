// Test « prochain équipement » : node tests/test-prochain-equipement.js (state et DOM simulés)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const pub = path.join(__dirname, '..', 'public');
const store = {};
const el = () => new Proxy(function () {}, { get: (t, k) => k === 'innerHTML' || k === 'textContent' || k === 'value' ? '' : k === 'dataset' || k === 'style' || k === 'classList' ? el() : el(), apply: () => el(), set: () => true });
const ctx = { console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, navigator: {}, location: { hostname: 'x', hash: '', search: '' }, history: { replaceState() {} },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem() {} }, document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: el, body: el(), documentElement: el() },
  fetch: () => new Promise(() => {}), addEventListener() {} };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/skills.js', 'data/materials.js', 'data/recipes.js', 'data/guides.js', 'data/gear.js', 'data/equip.js', 'data/item_icons.js', 'data/gems.js', 'data/drops.js', 'data/provenance.js', 'data/weapon_stats.js', 'data/tree.js', 'skilltree.js', 'data/map.js', 'data/places_fr.js'])
  try { vm.runInContext(fs.readFileSync(path.join(pub, f), 'utf8'), ctx, { filename: f }); } catch (e) { /* données non indispensables */ }
vm.runInContext(fs.readFileSync(path.join(pub, 'app.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n'), ctx, { filename: 'app.js' });
const run = c => vm.runInContext(c, ctx);
run(`state.mybuild = 'guardian'; state.level = 32; state.render = 0; render = () => {};`);

const P = () => JSON.parse(run(`(() => { const P = plans(); const f = lo => lo && Object.fromEntries(Object.entries(lo.slots).map(([k, s]) => [k, { en: s.item && s.item.en, picked: !!s.picked, gem: s.kind === 'weapon' && s.item ? (gemsForWeapon(s.item, state.mybuild, 1)[0] || {}).key || null : null, alts: (s.alts || []).map(a => a.en) }])); return JSON.stringify({ now: f(P.now), next: f(P.next), nextLv: P.next && P.next.lv, nowIsNext: P.next && P.next.isNext }); })()`));
let p = P();
assert(p.next, 'un prochain équipement existe'); assert(p.nowIsNext, 'le prochain est marqué isNext');
console.log('niveau prochain palier :', p.nextLv);

// 1. équiper maintenant une armure et une arme du prochain palier
const armorKeys = ['head', 'chest', 'hands', 'legs', 'feet'].filter(k => p.next[k].en && p.next[k].en !== p.now[k].en);
assert(armorKeys.length, 'au moins une pièce d\'armure diffère entre actuel et prochain');
const ak = armorKeys[0], armorEn = p.next[ak].en;
run(`ACTIONS.gearEquipNow(${JSON.stringify(ak + '|' + armorEn)})`);
p = P(); assert.strictEqual(p.now[ak].en, armorEn); assert(p.now[ak].picked, 'repère Mon choix (armure)');
console.log('OK armure équipée :', ak, armorEn);

const wEn = p.next.main.en;
assert(wEn && wEn !== p.now.main.en, 'arme principale différente dans le prochain');
run(`ACTIONS.gearEquipNow('main|${wEn.replace(/'/g, "\\'")}')`);
p = P(); assert.strictEqual(p.now.main.en, wEn); assert(p.now.main.picked);
const expGem = run(`(() => { const w = WEAPONS.find(x => x.en === ${JSON.stringify(wEn)}); return (gemsForWeapon(w, state.mybuild, 1)[0] || {}).key || null; })()`);
assert.strictEqual(p.now.main.gem, expGem, 'pierre recalculée pour l\'arme équipée');
console.log('OK arme équipée :', wEn, '— pierre', expGem);

// le HTML du détail propose les boutons
const html = run(`(() => { const P = plans(); return slotDetail('main', P.next.slots.main, P.next); })()`);
assert(/gearEquipNow/.test(html) && /gearPickNext/.test(html) && /Je l'ai déjà — l'équiper maintenant/.test(html) && /Choisir celui-ci/.test(html));
const htmlA = run(`(() => { const P = plans(); return slotDetail(${JSON.stringify(ak)}, P.next.slots[${JSON.stringify(ak)}], P.next); })()`);
assert(/gearEquipNow/.test(htmlA) && !/gearPickNext/.test(htmlA));
const htmlNow = run(`(() => { const P = plans(); return slotDetail('main', P.now.slots.main, P.now); })()`);
assert(/★ Mon choix/.test(htmlNow) && /gearUnpick"/.test(htmlNow) && !/gearEquipNow/.test(htmlNow));
console.log('OK boutons du détail');

// 2. choisir une alternative dans le prochain (séparé de l'actuel)
const alt = p.next.alt.alts[0]; assert(alt, 'une alternative pour l\'arme de secours du prochain');
const before = p.now.alt.en;
run(`ACTIONS.gearPickNext('alt|${alt.replace(/'/g, "\\'")}')`);
p = P(); assert.strictEqual(p.next.alt.en, alt); assert(p.next.alt.picked); assert.strictEqual(p.now.alt.en, before, 'l\'actuel n\'a pas bougé');
console.log('OK choix dans le prochain :', alt);

// 3. revenir à la recommandation
run(`ACTIONS.gearUnpickNext('alt')`); p = P(); assert(!p.next.alt.picked && p.next.alt.en !== alt);
run(`ACTIONS.gearUnpick('main'); ACTIONS.gearUnpick(${JSON.stringify(ak)})`); p = P();
assert(!p.now.main.picked && !p.now[ak].picked && p.now[ak].en !== armorEn && p.now.main.en !== wEn);
console.log('OK revenir à la recommandation');

// 4. changement de build : choix incompatibles oubliés
run(`ACTIONS.gearEquipNow('main|${wEn.replace(/'/g, "\\'")}'); state.mybuild = 'wizard'; pruneGearPicks();`);
assert(!run('state.gearpick.main'), 'choix d\'arme incompatible oublié');
console.log('TOUT OK');
