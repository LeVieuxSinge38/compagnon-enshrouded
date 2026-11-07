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
assert(sug.length > 0, 'au moins un nœud conseillé (suite sans limite de points)');
// Plan non fini en jeu : plus de suite exigée, mais les cases prenables clignotent
const todoIds = svg => [...svg.matchAll(/class="tn todo" data-node="(\d+)"/g)].map(m => +m[1]);
const takeable = ids => ids.every(id => J(`SkillTree.canTake([...gameMap()], ${id})`));
let t = todoIds(J(`treeSvg()`));
assert(t.length >= 1 && takeable(t), 'des cases prenables clignotent');
// Constat réel : 141 points dépensés en jeu, niveau 33, racines = puits = 0, le jeu affiche 6 points disponibles
const full2 = J(`SkillTree.planBuild(BUILDS.flatMap(b => b.skills), BUILDS[0].attrs, []).plan`);
let plan141 = [], p141 = 0;
for (const [id, r] of full2) { const c = J(`SkillTree.typeOf(${id}).c`); let k = 0; while (k < r && p141 + c * (k + 1) <= 141) k++; if (k) { plan141.push([id, k]); p141 += c * k; } if (k < r) break; }
vm.runInContext(`state.level = 33; state.roots = 0; state.wells = 0; state.freepts = 0; state.tree = ${JSON.stringify(plan141)}; state.game = { level: 33, nodes: ${JSON.stringify(plan141)} };`, ctx);
assert.strictEqual(J(`gameSpent()`), p141);
console.log('dépensés', p141);
t = todoIds(J(`treeSvg()`));
assert(t.length >= 1, 'freepts=0 : des cases clignotent quand même');
assert(takeable(t), 'toutes les cases todo sont prenables avec les nœuds du jeu');
// Chaîne a→b : b non prenable tant que a n'est pas pris
const ch = J(`(() => { for (const id in SkillTree.NODE) { if (SkillTree.NODE[id].base) continue; const a = SkillTree.ADJ[id].filter(n => SkillTree.NODE[n].base); if (a.length) { const b = SkillTree.ADJ[id].find(n => n != a[0] && !SkillTree.NODE[n].base && !SkillTree.ADJ[n].some(m => SkillTree.NODE[m].base)); if (b) return [a[0], +id, b]; } } })()`);
assert(!J(`SkillTree.canTake([], ${ch[2]})`) && J(`SkillTree.canTake([[${ch[1]}, 1]], ${ch[2]})`), 'chaîne : le suivant n\'est prenable qu\'après le précédent');
console.log('ok — sans freepts', p141);
// Build guardian entièrement pris : la suite reste dans la couleur dominante (+ attributs du build)
{
  const g = J(`SkillTree.planBuild([...BUILDS.find(b => b.id === 'guardian').skills, ...UNIVERSAL], BUILDS.find(b => b.id === 'guardian').attrs, []).plan`);
  vm.runInContext(`state.mybuild = 'guardian'; state.level = 60; state.roots = 0; state.wells = 0; state.freepts = 0; state.tree = ${JSON.stringify(g)}; state.game = { level: 60, nodes: ${JSON.stringify(g)} };`, ctx);
  const w = {}; for (const [id, r] of g) { const c = J(`SkillTree.typeOf(${id})`); w[c.col] = (w[c.col] || 0) + c.c * r; }
  const dom = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
  const attrs = J(`BUILDS.find(b => b.id === 'guardian').attrs`);
  const tt = todoIds(J(`treeSvg()`));
  assert(tt.length >= 1 && takeable(tt), 'build fini : des cases prenables clignotent');
  for (const id of tt) assert(J(`SkillTree.typeOf(${id}).col`) === dom || attrs.includes(J(`SkillTree.NODE[${id}].t`)), 'case ' + id + ' hors couleur dominante');
  console.log('build fini ok', tt.length, 'cases,', dom);
}
