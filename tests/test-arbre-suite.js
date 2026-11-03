// Test « Arbre : suite » : node tests/test-arbre-suite.js (plan fini + points restants => suite conseillée qui clignote)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const pub = path.join(__dirname, '..', 'public');
const el = () => new Proxy(function () {}, { get: (t, k) => k === 'innerHTML' || k === 'textContent' || k === 'value' ? '' : el(), apply: () => el(), set: () => true });
const ctx = { console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, navigator: {}, location: { hostname: 'x', hash: '', search: '' }, history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: new Proxy({}, { get: (t, k) => k === 'querySelector' ? () => null : k === 'querySelectorAll' ? () => [] : () => el() }),
  fetch: () => new Promise(() => {}), addEventListener() {} };
ctx.window = ctx; vm.createContext(ctx);
const src = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
for (const f of [...src.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].replace(/\?.*$/, '')).filter(f => f !== 'app.js'))
  try { vm.runInContext(fs.readFileSync(path.join(pub, f), 'utf8'), ctx, { filename: f }); } catch (e) { /* données non indispensables */ }
vm.runInContext(fs.readFileSync(path.join(pub, 'app.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n'), ctx, { filename: 'app.js' });
const J = c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx));
// Plan du build guardian tronqué à ~87 points, entièrement débloqué en jeu, 141 points disponibles
const full = J(`SkillTree.planBuild([...BUILDS.find(b => b.id === 'guardian').skills, ...UNIVERSAL], BUILDS.find(b => b.id === 'guardian').attrs, []).plan`);
let plan = [], pts = 0;
for (const [id, r] of full) { const c = J(`SkillTree.typeOf(${id}).c`) * r; if (pts + c > 87) break; plan.push([id, r]); pts += c; }
console.log('plan', plan.length, 'nœuds', pts, 'points');
vm.runInContext(`state.mybuild = 'guardian'; state.level = 33; state.tree = ${JSON.stringify(plan)}; state.game = { level: 33, nodes: ${JSON.stringify(plan)} }; state.roots = 77;`, ctx); // 64 (niveau 33) + 77 = 141
assert.strictEqual(J(`availPoints()`), 141);
const sug = J(`[...treeSuite()]`);
assert(sug.length > 0, 'au moins un nœud à débloquer');
const total = J(`SkillTree.spent([...[...gameMap()].concat([...treeSuite()].map(([i, r]) => [i, r])).reduce((m, [i, r]) => m.set(i, Math.max(m.get(i) || 0, r)), new Map()).entries()].map(x => x))`);
assert(total <= 141, 'total prévu ≤ points dispo : ' + total);
assert(total > pts, 'les points restants sont utilisés');
// Reliés à l'arbre : chaque nœud conseillé touche un nœud débloqué/conseillé (ou est un départ)
const have = new Set([...plan.map(p => p[0]), ...sug.map(p => p[0])]);
for (const [id] of sug) assert(J(`SkillTree.NODE[${id}].base || SkillTree.ADJ[${id}].some(n => ${JSON.stringify([...have])}.includes(n))`), 'nœud ' + id + ' relié');
const svg = J(`treeSvg()`);
assert(/class="tn todo"/.test(svg), 'des nœuds clignotent (todo)');
// Plan non fini : pas de suite
vm.runInContext(`state.game.nodes = []`, ctx);
assert.strictEqual(J(`[...treeSuite()]`).length, 0);
console.log('ok —', sug.length, 'nœuds conseillés,', total, '/ 141 points');

// Constat réel : 141 points dépensés en jeu, niveau 33, racines = puits = 0, le jeu affiche 6 points disponibles
const full2 = J(`SkillTree.planBuild(BUILDS.flatMap(b => b.skills), BUILDS[0].attrs, []).plan`);
let plan141 = [], p141 = 0;
for (const [id, r] of full2) { const c = J(`SkillTree.typeOf(${id}).c`); let k = 0; while (k < r && p141 + c * (k + 1) <= 141) k++; if (k) { plan141.push([id, k]); p141 += c * k; } if (k < r) break; }
vm.runInContext(`state.level = 33; state.roots = 0; state.wells = 0; state.freepts = 0; state.tree = ${JSON.stringify(plan141)}; state.game = { level: 33, nodes: ${JSON.stringify(plan141)} };`, ctx);
assert.strictEqual(J(`gameSpent()`), p141);
console.log('dépensés', p141);
assert.strictEqual(J(`[...treeSuite()]`).length, 0, 'freepts=0 : rien ne clignote');
vm.runInContext(`state.freepts = 6`, ctx);
assert.strictEqual(J(`availPoints()`), p141 + 6, 'avail = dépensés + libres');
assert(J(`[...treeSuite()]`).length > 0, 'freepts=6 : suite conseillée');
assert(/class="tn todo"/.test(J(`treeSvg()`)), 'freepts=6 : ça clignote');
console.log('ok — freepts', p141, '+ 6 =', p141 + 6);
