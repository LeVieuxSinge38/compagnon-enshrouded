// Arbre de compétences de la 1.0 : index, règles du jeu, calcul des chemins de build, textes.
// Partagé par l'appli (vue Arbre) et l'overlay. Données : data/tree.js (window.TREE).
// Un plan = liste ordonnée [[idNœud, rang], ...] dans l'ordre où l'on prend les points.
'use strict';
(function () {
  const NODE = {}, ADJ = {}, BY_TYPE = {}, TYPE_BY_EN = {};
  const normEn = s => String(s).toLowerCase().replace(/^the /, '').replace(/[^a-z]/g, '');
  for (const [id, t, x, y, base, tier] of TREE.nodes) {
    NODE[id] = { id, t, x, y, base: !!base, tier };
    ADJ[id] = [];
    (BY_TYPE[t] = BY_TYPE[t] || []).push(id);
  }
  for (const [a, b] of TREE.edges) { if (NODE[a] && NODE[b]) { ADJ[a].push(b); ADJ[b].push(a); } }
  for (const [k, t] of Object.entries(TREE.types)) TYPE_BY_EN[normEn(t.en)] = k;

  const typeOf = id => TREE.types[NODE[id].t];
  const COLORS = { gold: '#e6c35c', blue: '#6ea8e6', red: '#e0656a', green: '#6cc28a' };
  const color = id => COLORS[typeOf(id).col] || '#e6c35c';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Description officielle (FR) avec les valeurs du rang demandé, ou de tous les rangs « 12% / 24% / 36% »
  function describe(type, rank) {
    const t = TREE.types[type];
    return t.d.map(line => esc(line).replace(/\n/g, '<br>').replace(/&lt;(\/?)b&gt;/g, '<$1b>').replace(/\{\{(\w+)\}\}/g, (m, k) => {
      const v = t.v[k];
      if (v === undefined) return '…';
      if (!Array.isArray(v)) return esc(v);
      if (rank) return esc(v[Math.min(rank, v.length) - 1]);
      return v.map(esc).join(' / ');
    })).join('<br>');
  }

  const planMap = plan => new Map(plan.map(([id, r]) => [id, r]));
  const spent = plan => plan.reduce((s, [id, r]) => s + (NODE[id] ? typeOf(id).c * r : 0), 0);

  // Règle du jeu : un nœud est prenable s'il est un point de départ ou voisin d'un nœud déjà pris
  function canTake(plan, id) {
    const m = planMap(plan);
    if (m.has(id)) return m.get(id) < typeOf(id).m;
    return NODE[id].base || ADJ[id].some(n => m.has(n));
  }
  // Retirer un nœud ne doit pas « décrocher » d'autres nœuds du reste de l'arbre
  function canRemove(plan, id) {
    const rest = new Set(plan.map(p => p[0]).filter(n => n !== id));
    const seen = new Set([...rest].filter(n => NODE[n].base));
    const stack = [...seen];
    while (stack.length) { const u = stack.pop(); for (const v of ADJ[u]) if (rest.has(v) && !seen.has(v)) { seen.add(v); stack.push(v); } }
    return seen.size === rest.size;
  }
  function add(plan, id) {
    if (!canTake(plan, id)) return plan;
    const i = plan.findIndex(p => p[0] === id);
    if (i >= 0) { const c = plan.slice(); c[i] = [id, c[i][1] + 1]; return c; }
    return [...plan, [id, 1]];
  }
  function remove(plan, id) {
    const i = plan.findIndex(p => p[0] === id);
    if (i < 0) return plan;
    if (plan[i][1] > 1) { const c = plan.slice(); c[i] = [id, c[i][1] - 1]; return c; }
    if (!canRemove(plan, id)) return null; // d'autres nœuds en dépendent
    return plan.filter(p => p[0] !== id);
  }

  // Chemin le plus court (en points) depuis le plan actuel jusqu'à un nœud du type voulu.
  // Les attributs « préférés » du build coûtent un peu moins cher, pour que le chemin passe par eux.
  function pathTo(plan, type, prefer) {
    const have = planMap(plan);
    const cost = id => {
      const t = NODE[id].t, c = typeOf(id).c;
      if (t.startsWith('ATTR_')) return prefer.has(t) ? c * 0.6 : c * 1.6;
      return c * 1.15; // éviter les compétences inutiles quand un attribut fait l'affaire
    };
    const dist = {}, prev = {}, done = new Set();
    for (const id in NODE) dist[id] = Infinity;
    for (const [id] of plan) dist[id] = 0;
    for (const id in NODE) if (NODE[id].base && !have.has(+id)) { dist[id] = Math.min(dist[id], cost(+id)); prev[id] = null; }
    const targets = new Set(BY_TYPE[type] || []);
    for (;;) {
      let u = null;
      for (const id in dist) if (!done.has(id) && dist[id] < Infinity && (u === null || dist[id] < dist[u])) u = id;
      if (u === null) return null;
      done.add(u);
      if (targets.has(+u)) {
        const path = [];
        for (let n = +u; n !== null && n !== undefined && !have.has(n); n = prev[n]) path.unshift(n);
        return path;
      }
      for (const v of ADJ[u]) {
        if (done.has(String(v)) || have.has(v)) continue;
        const d = dist[u] + cost(v);
        if (d < dist[v]) { dist[v] = d; prev[v] = +u; }
      }
    }
  }

  // Construit le plan complet d'un build : pour chaque compétence visée (dans l'ordre),
  // les nœuds de passage (1 rang) puis la compétence elle-même (tous ses rangs).
  function planBuild(skillsEn, preferAttrs, start) {
    let plan = (start || []).slice();
    const prefer = new Set(preferAttrs || []);
    const missing = [];
    for (const en of skillsEn) {
      const type = TYPE_BY_EN[normEn(en)];
      if (!type) { missing.push(en); continue; }
      const m = planMap(plan);
      const owned = (BY_TYPE[type] || []).find(id => m.has(id));
      if (owned) { const i = plan.findIndex(p => p[0] === owned); plan[i] = [owned, typeOf(owned).m]; continue; }
      const path = pathTo(plan, type, prefer);
      if (!path || !path.length) { missing.push(en); continue; }
      for (const id of path.slice(0, -1)) plan.push([id, 1]);
      const last = path[path.length - 1];
      plan.push([last, typeOf(last).m]);
    }
    return { plan, missing };
  }

  // Étapes numérotées avec le cumul des points
  function steps(plan) {
    let total = 0;
    return plan.filter(([id]) => NODE[id]).map(([id, r], i) => {
      const t = typeOf(id), pts = t.c * r;
      total += pts;
      return { n: i + 1, id, rank: r, max: t.m, type: NODE[id].t, name: t.n, pts, total };
    });
  }

  const typeByEn = en => TYPE_BY_EN[normEn(en)];
  window.SkillTree = { NODE, ADJ, BY_TYPE, COLORS, typeOf, color, describe, spent, canTake, canRemove, add, remove, planBuild, steps, typeByEn };
})();
