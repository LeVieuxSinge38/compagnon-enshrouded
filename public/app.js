// Compagnon Enshrouded — fonctionne seul (fichier ouvert en local) ou servi par server/server.js avec des comptes.
'use strict';

// ---------- Utilitaires ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Comme esc, mais garde nos icônes (<i class="gi gi-nom"></i>) contenues dans le texte
// Appli autonome 2.0 : pages servies par l'appli Windows depuis le PC (pas de serveur, pas de compte)
const LOCAL = location.hostname === 'compagnon.local';
const escIco = s => esc(s).replace(/&lt;i class=&quot;gi (gi-[a-z0-9-]+)&quot;&gt;&lt;\/i&gt;/g, '<i class="gi $1"></i>');
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const store = {
  get(k, d) { try { const v = localStorage.getItem('ens.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ens.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } }
};
function copyText(txt, msg = 'Copié !') {
  const done = () => toast(msg);
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* copie refusée */ }
    ta.remove();
    if (ok) done(); else prompt('Copie ce texte (Ctrl+C) :', txt);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, fallback);
  else fallback();
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
}

// ---------- Index des données ----------
const MAT = {}; MATERIALS.forEach(m => MAT[m.n] = m);
const SK = {}; SKILLS.forEach(s => SK[s.n] = s);
const USED_IN = {}; // ingrédient -> produits
for (const [p, vs] of Object.entries(RECIPES)) for (const v of vs) for (const [i] of v[1]) { const u = (USED_IN[i] = USED_IN[i] || []); if (!u.includes(p)) u.push(p); }
// Variante de recette choisie (0 = la première, en général la plus accessible)
const recipe = n => RECIPES[n] ? RECIPES[n][Math.min((state.variant || {})[n] || 0, RECIPES[n].length - 1)] : null;
const BIOME = {}; BIOMES.forEach(b => BIOME[b.id] = b);
const biomeFr = id => BIOME[id] ? BIOME[id].fr : id;
const station = s => STATIONS_FR[s] || s;
const ANY_FR = { 'Any Sand': 'Sable (au choix)', 'Any Fishing Junk': 'Déchet de pêche (au choix)', 'Any Wood': 'Bois (au choix)', 'Any Ectoplasm': 'Ectoplasme (au choix)', 'Any Dirt': 'Terre (au choix)', 'Any Critter Parts': 'Morceaux de bestiole (au choix)', 'Any Gold Source': "Source d'or (au choix)", 'Any Rare Fish': 'Poisson rare (au choix)', 'Any Fiber': 'Fibre (au choix)', 'Any Fish Parts': 'Morceaux de poisson (au choix)', 'Any Milk': 'Lait (au choix)', 'Any Epic Fish': 'Poisson épique (au choix)', 'Any Blue Palette': 'Teinture bleue (au choix)', 'Any Paper': 'Papier (au choix)', 'Any Common Fish': 'Poisson commun (au choix)', 'Any Stone': 'Pierre (au choix)', 'Any Red Palette': 'Teinture rouge (au choix)', 'Any Uncommon Fish': 'Poisson peu commun (au choix)' };
const matName = n => (MAT[n] && MAT[n].fr) || PRODUCT_FR[n] || ANY_FR[n] || PRODUCT_FR[n + 's'] || n; // certaines recettes écrivent « Copper Bar » au singulier
// Par défaut on ne décompose pas les ressources qu'on récolte/looté (ex. fourrure), seulement celles qui se fabriquent
const defaultStop = n => !!(MAT[n] && MAT[n].o && !/^Se fabrique/.test(MAT[n].o));
const isStopped = n => (state.craftStop[n] !== undefined ? state.craftStop[n] : defaultStop(n));
const PRODUCTS = Object.keys(RECIPES);
const SEARCH_INDEX = [
  ...MATERIALS.map(m => ({ kind: 'mat', key: m.n, label: m.fr || m.n, en: m.n, n: norm((m.fr || '') + ' ' + m.n) })),
  ...PRODUCTS.filter(p => !MAT[p]).map(p => ({ kind: 'prod', key: p, label: PRODUCT_FR[p] || p, en: p, n: norm((PRODUCT_FR[p] || '') + ' ' + p) })),
  ...SKILLS.map(s => ({ kind: 'skill', key: s.n, label: s.fr, en: s.n, n: norm(s.fr + ' ' + s.n) }))
];
function find(q, kinds, limit = 30) {
  const nq = norm(q); if (!nq) return [];
  const words = nq.split(' ').filter(w => w.length > 1 || nq.length <= 2);
  const res = [];
  for (const it of SEARCH_INDEX) {
    if (kinds && !kinds.includes(it.kind)) continue;
    let sc = 0;
    if (it.n === nq || norm(it.label) === nq || norm(it.en) === nq) sc = 100;
    else if (norm(it.label).startsWith(nq) || norm(it.en).startsWith(nq)) sc = 70;
    else if ((' ' + it.n).includes(' ' + nq)) sc = 50;
    else if (nq.length > 3 && it.n.includes(nq)) sc = 20;
    else {
      const hit = words.filter(w => it.n.split(' ').some(t => t.startsWith(w.replace(/s$/, '')) || (w.length > 3 && t.includes(w))));
      if (hit.length === words.length) sc = 30; else if (hit.length) sc = 8 * hit.length;
    }
    if (sc) res.push({ ...it, sc: sc - it.label.length / 100 + (it.kind === 'mat' ? 2 : 0) });
  }
  return res.sort((a, b) => b.sc - a.sc).slice(0, limit);
}

// ---------- État persistant ----------
const state = {
  view: 'home',
  tree: store.get('tree', []),
  game: store.get('game', null),         // lu dans la sauvegarde du personnage : { name, level, xp, nodes, file, at }           // plan de l'arbre : [[idNœud, rang], ...] dans l'ordre des clics
  level: store.get('level', 1),
  roots: store.get('roots', 0),
  wells: store.get('wells', 0),
  list: store.get('list', {}),           // matériau -> {need, have}
  flame: store.get('flame', 1),
  mybuild: store.get('mybuild', null),
  owned: store.get('owned', {}),
  mapdone: store.get('mapdone', {}), // carte interactive : lieux faits (identifiant → 1), propres à chaque joueur
  locked: store.get('locked', {}), // tenues pas encore débloquées chez l'artisan (id → true) // objets d'équipement déjà obtenus (nom anglais → true)
  quiz: store.get('quiz', []),
  variant: store.get('variant', {}),     // produit -> index de variante
  chat: [],
  sel: { mat: null, prod: null }, craftQty: 1, craftStop: {}
};
// ---------- Sauvegarde : navigateur (mode local) ou serveur (mode comptes) ----------
const SYNC_KEYS = ['tree', 'game', 'level', 'roots', 'wells', 'list', 'flame', 'quiz', 'variant', 'mybuild', 'owned', 'locked', 'mapdone'];
const DEFAULTS = { tree: [], game: null, level: 1, roots: 0, wells: 0, list: {}, flame: 1, quiz: [], variant: {}, mybuild: null, owned: {}, locked: {}, mapdone: {} };
const srv = { on: false, user: null, last: '', timer: null, pending: null, inflight: false };
// « il y a 3 min »
const sinceFr = t => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'à l\'instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `le ${new Date(t).toLocaleDateString('fr-FR')}`; };
async function apiCall(method, url, body) {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'compagnon' },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  if (r.status === 401) { location.replace('/login.html'); throw new Error('Déconnecté.'); }
  const data = await r.json().catch(() => ({}));
  if (data.mustChange) { location.replace('/login.html'); throw new Error('Mot de passe à changer.'); }
  if (!r.ok) throw new Error(data.error || 'Erreur du serveur.');
  return data;
}
const syncPayload = () => JSON.stringify(Object.fromEntries(SYNC_KEYS.map(k => [k, state[k]])));
async function pushState() {
  const payload = srv.pending; srv.pending = null;
  if (!payload) return;
  srv.inflight = true;
  try { await apiCall('PUT', '/api/state', payload); srv.last = payload; }
  catch (e) { srv.pending = srv.pending || payload; toast('⚠️ Sauvegarde impossible : ' + e.message); }
  finally { srv.inflight = false; }
}
window.addEventListener('beforeunload', () => {
  if (srv.on && srv.pending) fetch('/api/state', { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'compagnon' }, body: srv.pending });
});
const save = () => {
  if (srv.on) {
    const payload = syncPayload();
    if (payload !== srv.last) { srv.pending = payload; clearTimeout(srv.timer); srv.timer = setTimeout(pushState, 700); }
  } else if (LOCAL) Local.saveState();
  else SYNC_KEYS.forEach(k => store.set(k, state[k]));
  const c = Object.keys(state.list).filter(k => (state.list[k].have || 0) < state.list[k].need).length;
  $('#listCount').textContent = c || '';
};

// ---------- Navigation ----------
// Le menu ne montre que des groupes ; chaque groupe a ses sous-onglets en haut de la page.
const GROUPS = {
  home: [['home', '<i class="gi gi-house"></i> Accueil'], ['assistant', '<i class="gi gi-talk"></i> Assistant']],
  char: [['char', '<i class="gi gi-visored-helm"></i> Mon équipement'], ['quiz', '<i class="gi gi-compass"></i> Trouver mon build'], ['builds', '<i class="gi gi-crossed-swords"></i> Builds'], ['planner', '<i class="gi gi-skills"></i> Arbre de compétences'], ['gear', '<i class="gi gi-checked-shield"></i> Ensembles d\'armure']],
  farm: [['resources', '<i class="gi gi-mining"></i> Ressources'], ['craft', '<i class="gi gi-hammer-drop"></i> Calculateur de craft'], ['list', '<i class="gi gi-scroll-unfurled"></i> Ma liste de farm']],
  prog: [['flame', '<i class="gi gi-fire-silhouette"></i> Niveaux de Flamme'], ['biomes', '<i class="gi gi-treasure-map"></i> Biomes'], ['tips', '<i class="gi gi-light-bulb"></i> Astuces débutant']]
};
const groupOf = v => Object.keys(GROUPS).find(g => GROUPS[g].some(([x]) => x === v)) || v;
state.lastIn = {};
const subnav = () => { const g = GROUPS[groupOf(state.view)]; return g && g.length > 1 ? `<nav class="subnav">${g.map(([v, l]) => `<a data-go="${v}" class="${v === state.view ? 'on' : ''}">${l}</a>`).join('')}</nav>` : ''; };
// La lueur du menu glisse jusqu'à la rubrique active
function moveNavHl() {
  const hl = document.querySelector('.nav-hl'), on = document.querySelector('#nav a.on');
  if (!hl) return;
  if (!on) { hl.style.opacity = 0; return; }
  hl.style.top = on.offsetTop + 'px'; hl.style.height = on.offsetHeight + 'px'; hl.style.opacity = 1;
}
window.addEventListener('resize', moveNavHl);
function go(view, arg) {
  if (GROUPS[view] && !VIEWS[view]) view = state.lastIn[view] || GROUPS[view][0][0]; // clic sur un groupe du menu
  state.view = view;
  state.lastIn[groupOf(view)] = view;
  if (view === 'resources' && arg) state.sel.mat = arg;
  if (view === 'craft' && arg) { state.sel.prod = arg; state.craftQty = 1; }
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.view === groupOf(view)));
  moveNavHl();
  render(); window.scrollTo(0, 0);
  const m = $('#main'); m.classList.remove('enter'); void m.offsetWidth; m.classList.add('enter'); // petite animation d'entrée
  try { history.replaceState(null, '', '#' + view); } catch { /* file:// */ }
}
document.addEventListener('click', e => {
  const n = e.target.closest('#nav a'); if (n) return go(GROUPS[n.dataset.view] ? (state.lastIn[n.dataset.view] || GROUPS[n.dataset.view][0][0]) : n.dataset.view);
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); const [v, ...a] = g.dataset.go.split('|'); return go(v, a.join('|') || undefined); }
  const act = e.target.closest('[data-act]');
  if (act && ACTIONS[act.dataset.act]) ACTIONS[act.dataset.act](act.dataset.arg, act, e);
});
const VIEWS = {};
function render() { document.body.dataset.view = state.view; $('#main').innerHTML = subnav() + VIEWS[state.view](); if (AFTER[state.view]) AFTER[state.view](); save(); }
const AFTER = {};
const ACTIONS = {};

// Icône de jeu de chaque build (game-icons.net)
const BUILD_ICO = { guardian: 'checked-shield', barbarian: 'battle-axe', ranger: 'bow-arrow', assassin: 'plain-dagger', battlemage: 'fairy-wand', wizard: 'wizard-staff', healer: 'healing', explorer: 'compass' };
const bIco = b => `<i class="gi gi-${BUILD_ICO[b.id] || 'crossed-swords'}"></i>`;
// Liens réutilisables
const matLink = n => `<a class="chip" data-go="resources|${esc(n)}">${MAP.icons[n] ? `<img class="res-ico" src="img/res/${esc(MAP.icons[n])}" alt="" width="18" height="18" loading="lazy"> ` : ''}${esc(matName(n))}</a>`;
const prodLink = n => `<a data-go="craft|${esc(n)}">${esc(matName(n))}</a>`;
const treeType = en => SkillTree.typeByEn(en);
const skName = en => { const t = treeType(en); return t ? TREE.types[t].n : en; };
const skChip = en => { const t = treeType(en); return t ? `<span class="chip"><span style="color:${SkillTree.COLORS[TREE.types[t].col]}">●</span> ${esc(TREE.types[t].n)}</span>` : ''; };

// Texte « où trouver » (FR rédigé, sinon généré)
function whereText(n) {
  const m = MAT[n]; const r = recipe(n);
  const parts = [];
  if (m && m.o) parts.push(esc(m.o));
  else if (r) parts.push(`Se fabrique : ${r[1].map(([i, q]) => `${q}× ${esc(matName(i))}`).join(', ')}${r[2].length ? ' — ' + r[2].map(station).map(esc).join(' / ') : ''}.`);
  if (m && m.b && m.b.length && !(m.o || '').includes(biomeFr(m.b[0]))) parts.push(`Biome : ${m.b.map(biomeFr).map(esc).join(', ')}.`);
  if (!parts.length) parts.push(m && m.oe ? `<span class="muted">(wiki, en anglais)</span> ${esc(m.oe)}` : '<span class="muted">Pas encore d\'information détaillée sur le wiki.</span>');
  return parts.join(' ');
}

// ---------- Accueil ----------
// Actualités officielles du jeu (annonces Steam : mises à jour, patch notes), récupérées par le serveur.
state.news = null; state.newsOpen = {}; state.newsEn = {};
async function loadNews() {
  state.news = 'loading';
  try {
    if (LOCAL) state.news = await News.load(Local.hostFetch);
    else {
      const r = await fetch('/api/news', { credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      state.news = (await r.json()).items || [];
    }
  } catch { state.news = 'error'; }
  if (state.view === 'home') render();
}
const newsDate = ts => new Date(ts * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
function newsBlocks(blocks) {
  let html = '', inList = false;
  for (const b of blocks) {
    if (b.t === 'li' && !inList) { html += '<ul>'; inList = true; }
    if (b.t !== 'li' && inList) { html += '</ul>'; inList = false; }
    if (b.t === 'h') html += `<h4>${esc(b.text)}</h4>`;
    else if (b.t === 'p') html += `<p>${esc(b.text)}</p>`;
    else if (b.t === 'li') html += `<li>${esc(b.text)}</li>`;
    else if (b.t === 'img') html += `<img class="news-img" src="${esc(b.src)}" alt="" loading="lazy">`;
  }
  return html + (inList ? '</ul>' : '');
}
function newsHtml() {
  if (!srv.on && !LOCAL) return '<div class="card muted">Les actualités du jeu s\'affichent quand le Compagnon est ouvert depuis le serveur de la maison.</div>';
  if (state.news === null) { loadNews(); return '<div class="card muted">Chargement des actualités…</div>'; }
  if (state.news === 'loading') return '<div class="card muted">Chargement des actualités…</div>';
  if (state.news === 'error' || !state.news.length) return '<div class="card muted">Impossible de récupérer les actualités pour le moment (le serveur n\'arrive pas à joindre Steam).</div>';
  return state.news.map(n => {
    const en = state.newsEn[n.gid] || !n.fr, title0 = n.title;
    if (!en) { // version française : chaque texte est remplacé par sa traduction (les images restent à leur place)
      let k = 0;
      n = { ...n, title: n.fr.title, blocks: n.blocks.map(b => b.t === 'img' ? b : { ...b, text: n.fr.texts[k++] || b.text, en: b.text }) };
    }
    n = { ...n, blocks: n.blocks.filter(b => !(b.t === 'h' && (b.en || b.text) === title0)) }; // le titre est déjà affiché
    const open = state.newsOpen[n.gid], blocks = n.blocks.filter(b => b.t !== 'img');
    const shown = open ? n.blocks : blocks.slice(0, 6);
    return `<article class="card news">
      ${n.image ? `<img class="news-cover" src="${esc(n.image)}" alt="" loading="lazy">` : ''}
      <div class="news-body">
        <div class="news-date">${esc(newsDate(n.date))}</div>
        <h3>${esc(n.title)}</h3>
        <div class="news-text">${newsBlocks(shown)}</div>
        <div class="row">
          ${blocks.length > 6 || n.blocks.length > blocks.length ? `<button class="btn sm" data-act="newsToggle" data-arg="${esc(n.gid)}">${open ? 'Réduire' : 'Lire la suite'}</button>` : ''}
          ${n.fr ? `<button class="btn sm ghost" data-act="newsLang" data-arg="${esc(n.gid)}">${en ? '🇫🇷 Traduction française' : '🇬🇧 Texte original'}</button>` : ''}
          <a class="small" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">Voir sur Steam ↗</a>
        </div>
      </div></article>`;
  }).join('') + '<p class="small muted">Annonces officielles de Keen Games sur Steam, traduites automatiquement en français (Google Traduction) : les noms d\'objets peuvent différer de ceux du jeu.</p>';
}
ACTIONS.newsLang = gid => { state.newsEn[gid] = !state.newsEn[gid]; const y = window.scrollY; render(); window.scrollTo(0, y); };
ACTIONS.newsToggle = gid => { state.newsOpen[gid] = !state.newsOpen[gid]; const y = window.scrollY; render(); window.scrollTo(0, y); };
VIEWS.home = () => `
  <div class="hero">
    <div class="row hero-head"><img class="emblem-lg" src="img/emblem.png" alt="">
      <div><h1>Bienvenue, ${esc(srv.user ? srv.user.username : LOCAL ? Local.playerName() : 'aventurier')} !</h1>
      <p class="sub" style="margin:2px 0 0">Pose une question, ou choisis une rubrique dans le menu à gauche.</p></div></div>
    <div class="row" style="margin-top:16px">
      <input id="homeQ" class="search" style="flex:1;min-width:240px" placeholder="Pose une question… ex : « où trouver du fer », « comment faire des barres de bronze », « build arc »">
      <button class="btn pri" data-act="homeAsk">Demander</button>
    </div>
  </div>
  <h2><i class="gi gi-newspaper"></i> Actualités d'Enshrouded</h2>
  <div class="stack">${newsHtml()}</div>`;
ACTIONS.homeAsk = () => { const q = $('#homeQ').value.trim(); if (!q) return; state.chat.push({ me: q }, { bot: answer(q) }); go('assistant'); };
AFTER.home = () => $('#homeQ').addEventListener('keydown', e => { if (e.key === 'Enter') ACTIONS.homeAsk(); });

// ---------- Questionnaire ----------
VIEWS.quiz = () => {
  const ans = state.quiz;
  const done = ans.filter(a => a != null).length === QUIZ.length;
  let html = `<h1><i class="gi gi-compass"></i> Trouver mon build</h1><p class="sub">Réponds honnêtement selon ce que TU aimes : il n'y a pas de mauvais choix, et tu pourras réinitialiser tes compétences plus tard (1 Rune par point).</p>`;
  html += `<div class="grid2"><div class="stack">`;
  QUIZ.forEach((q, i) => {
    html += `<div class="card"><h3>${i + 1}. ${esc(q.q)}</h3>${q.a.map((a, j) => `<button class="opt ${ans[i] === j ? 'on' : ''}" data-act="quiz" data-arg="${i},${j}">${esc(a.t)}</button>`).join('')}</div>`;
  });
  html += `</div><div><div class="card sticky">${quizResult(done)}</div></div></div>`;
  return html;
};
function quizScores() {
  const sc = {}; BUILDS.forEach(b => sc[b.id] = 0);
  state.quiz.forEach((j, i) => { if (j == null) return; const s = QUIZ[i].a[j].s; for (const k in s) sc[k] += s[k]; });
  return BUILDS.map(b => ({ b, s: sc[b.id] })).sort((a, b) => b.s - a.s);
}
function quizResult(done) {
  const n = state.quiz.filter(a => a != null).length;
  if (!n) return `<h3>Ton résultat</h3><p class="muted">Réponds aux questions à gauche : le résultat s'affiche ici au fur et à mesure.</p>`;
  const sc = quizScores(); const max = Math.max(1, sc[0].s);
  const top = sc[0].b, second = sc[1].b;
  return `<h3>${done ? 'Ton build idéal' : `Tendance actuelle (${n}/${QUIZ.length})`}</h3>
    <div style="font-size:22px;font-weight:700;margin:6px 0">${bIco(top)} ${esc(top.name)}</div>
    <p>${esc(top.pitch)}</p>
    <p class="small"><b>Stats :</b> ${esc(top.stats)}<br><b>Armes :</b> ${esc(top.weapons)}</p>
    <div class="row" style="margin:12px 0"><button class="btn pri" data-act="applyBuild" data-arg="${top.id}">Charger dans mon arbre</button><button class="btn" data-act="gearFor" data-arg="${top.id}"><i class="gi gi-visored-helm"></i> Choisir ce build : mon équipement</button><button class="btn" data-go="builds">Voir le détail</button></div>
    <p class="small muted">Alternative : ${bIco(second)} ${esc(second.name)}. Et quel que soit ton build, prends aussi : ${UNIVERSAL.slice(0, 4).map(skName).map(esc).join(', ')}.</p>
    <h3 style="margin-top:16px">Affinités</h3>
    ${sc.map(x => `<div class="score"><span style="width:28px">${bIco(x.b)}</span><span class="small" style="width:150px">${esc(x.b.name.split(' —')[0])}</span><div class="bar"><i style="width:${Math.max(0, x.s) / max * 100}%"></i></div></div>`).join('')}
    <button class="btn sm ghost" style="margin-top:10px" data-act="quizReset">Recommencer</button>`;
}
ACTIONS.quiz = arg => { const [i, j] = arg.split(',').map(Number); state.quiz[i] = j; render(); };
ACTIONS.quizReset = () => { state.quiz = []; render(); };

// ---------- Équipement ----------
// Ensembles d'armure (data/gear.js) : conseillés selon le build et le niveau, avec l'artisan qui les fabrique ou l'endroit où les trouver.
const GEAR_STYLE = { melee: 'Mêlée', ranged: 'Distance', magic: 'Magie' };
const GEAR_TAG = { staff: 'Bâton', wand: 'Baguette', heal: 'Soin', '2h': 'Deux mains', '1h': 'Une main', tank: 'Tank', dagger: 'Dagues', bow: 'Arc',
  unarmed: 'Mains nues', starter: 'Débutant', general: 'Polyvalent', notrec: 'Déconseillé' };
// Ce que chaque build recherche dans une armure
const BUILD_GEAR = { guardian: ['melee', ['tank', '1h']], barbarian: ['melee', ['2h']], ranger: ['ranged', ['bow']], assassin: ['ranged', ['dagger']],
  battlemage: ['magic', ['wand']], wizard: ['magic', ['staff']], healer: ['magic', ['heal']], explorer: [null, ['general']] };
const PIECE_FR = [[/\b(Hat|Helmet|Headwrap|Hood|Mask|Cap|Crown|Headgear|Headpiece)\b/, 'Tête'], [/\b(Chest|Tunic|Chestplate|Armor|Robe|Vest|Coat|Cuirass|Jacket)\b/, 'Torse'],
  [/\b(Gloves|Gauntlets|Bracers|Hands|Handwraps|Wraps)\b/, 'Mains'], [/\b(Trousers|Pants|Leggings|Greaves|Legs|Skirt)\b/, 'Jambes'], [/\b(Boots|Shoes|Sandals|Feet|Sabatons)\b/, 'Pieds']];
const pieceFr = p => { const m = PIECE_FR.find(([re]) => re.test(p)); return m ? m[1] : p; };
state.gear = { style: null, build: null };
const gearBuild = () => BUILDS.find(b => b.id === state.mybuild);
const gearStyle = () => state.gear.style || (gearBuild() && BUILD_GEAR[gearBuild().id] && BUILD_GEAR[gearBuild().id][0]) || 'melee';
// Note d'un ensemble pour le build choisi : étiquettes recherchées, puis polyvalent, et fabricable plutôt que butin aléatoire
function gearScore(g) {
  const want = (gearBuild() && BUILD_GEAR[gearBuild().id] || [null, []])[1];
  let s = 0;
  want.forEach((t, i) => { if (g.tags.includes(t)) s += i === 0 ? 12 : 8; }); // la première étiquette compte plus
  if (g.tags.includes('general')) s += 4;
  if (g.tags.includes('notrec')) s -= 30;
  if (g.station) s += 3;
  return s;
}
const isLocked = g => state.locked && state.locked[g.id] && !g.pieces.some(([p]) => state.owned[p]);
// Pour un niveau : le meilleur ensemble déjà portable, et le prochain à viser
function gearAdvice(lv, ignoreLocked) {
  const list = GEAR.filter(g => g.style === gearStyle() && (ignoreLocked || !isLocked(g)));
  // un peu de bonus au niveau le plus haut, sans préférer un ensemble mal adapté au build
  const best = arr => arr.slice().sort((a, b) => (gearScore(b) + b.lv * 0.3) - (gearScore(a) + a.lv * 0.3))[0];
  const tiers = [...new Set(list.map(g => g.lv))].sort((a, b) => a - b);
  const next = tiers.find(t => t > lv);
  const now = best(list.filter(g => g.lv <= lv && g.lv >= lv - 6)) || best(list.filter(g => g.lv <= lv));
  return { now, next: next ? best(list.filter(g => g.lv > lv && g.lv <= next + 2)) : null };
}
// Image du jeu d'un objet (img/items/), d'après son nom anglais
const itemIcon = (en, size = 40) => ITEM_ICONS[en] ? `<img class="item-ico" src="img/items/${esc(ITEM_ICONS[en])}" alt="" width="${size}" height="${size}" loading="lazy">` : '';
const chezArtisan = st => { const n = station(st); return /^[AEIOUÉ]/.test(n) ? `chez l'${n}` : st === 'Hunter' || st === 'Farmer' ? `chez la ${n}` : `chez le ${n}`; };
function gearCard(g, mark) {
  const src = g.station ? `<i class="gi gi-hammer-drop"></i> ${esc(station(g.station))}` : '<i class="gi gi-rolling-dices"></i> Butin';
  return `<div class="card gear ${mark ? 'gear-hl' : ''}" id="gear-${esc(g.id)}">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><b style="font-size:16px">${esc(g.fr)}</b> <span class="muted small">(${esc(g.en)})</span>${mark ? ` <span class="chip" style="color:var(--flame2)">${mark}</span>` : ''}</div>
      <span class="chip">Niveau ${g.lv}</span></div>
    <div style="margin:4px 0">${[src, esc(biomeFr(g.biome)), ...g.tags.map(t => esc(GEAR_TAG[t] || t))].map(c => `<span class="chip">${c}</span>`).join('')}</div>
    <p class="small" style="margin:6px 0">${esc(g.why)}</p>
    ${g.unlock ? `<p class="small unlock" style="margin:6px 0"><i class="gi gi-padlock-open"></i> <b>Pas encore ${esc(chezArtisan(g.station))} ?</b> ${esc(g.unlock)}</p>` : `<p class="small muted" style="margin:6px 0"><i class="gi gi-position-marker"></i> ${esc(g.src)}</p>`}
    <div class="small">${g.pieces.map(([p, c, f]) => { const t = esc(f || p), inner = `${itemIcon(p, 30)}${state.owned[p] ? '✓ ' : ''}${esc(pieceFr(p))}`;
      return c ? `<a class="chip chip-piece ${state.owned[p] ? 'chip-own' : ''}" data-go="craft|${esc(p)}" title="${t}">${inner}</a>` : `<span class="chip chip-piece ${state.owned[p] ? 'chip-own' : ''}" title="${t}">${inner}</span>`; }).join('')}
      ${g.pieces.some(p => p[1]) ? `<button class="btn sm" data-act="gearList" data-arg="${esc(g.id)}">+ Matériaux à ma liste de farm</button>` : ''}</div>
  </div>`;
}
VIEWS.gear = () => {
  const lv = state.level || 1, adv = gearAdvice(lv), style = gearStyle(), b = gearBuild();
  const shown = new Set([adv.now, adv.next].filter(Boolean));
  // Autres tenues de son niveau seulement (celles d'avant ou d'à peu près maintenant) : les plus hautes viendront plus tard
  const others = GEAR.filter(g => g.style === style && g.lv <= lv && !shown.has(g)).sort((a, c) => (c.lv - a.lv) || (gearScore(c) - gearScore(a)));
  const later = GEAR.filter(g => g.style === style && g.lv > lv && !shown.has(g)).length;
  return `<h1><i class="gi gi-checked-shield"></i> Ensembles d'armure</h1>
  <p class="sub">Ici, ce sont des <b>tenues</b> (casque, torse, gants, jambes, bottes), pas des builds. Ton build se choisit dans <a data-go="char">Mon équipement</a> ou avec le <a data-go="quiz">questionnaire</a>.</p>
  <div class="card row" style="margin-bottom:14px;gap:10px">
    <label class="row small">Mon build <select id="gBuild"><option value="">— choisir —</option>${BUILDS.map(x => `<option value="${x.id}" ${state.mybuild === x.id ? 'selected' : ''}>${esc(x.name.split(' —')[0])}</option>`).join('')}</select></label>
    ${b ? `<span class="small muted">Style : ${GEAR_STYLE[style]}</span>` : `<span class="row" style="gap:4px">${Object.entries(GEAR_STYLE).map(([k, v]) => `<button class="btn sm ${style === k ? 'pri' : ''}" data-act="gearStyle" data-arg="${k}">${v}</button>`).join('')}</span>`}
    <span class="small muted">Ton niveau : ${lv}${state.game ? ' (lu dans ta sauvegarde)' : ''}</span>
  </div>
  ${adv.now ? `<h2>1. À porter maintenant</h2><div style="margin-bottom:18px">${gearCard(adv.now, 'ta tenue actuelle')}</div>` : ''}
  ${adv.next ? `<h2>2. Ton prochain objectif — dès le niveau ${adv.next.lv}</h2><p class="small muted" style="margin-top:-6px">Tu peux déjà préparer les matériaux ; tu pourras la porter au niveau ${adv.next.lv}.</p><div style="margin-bottom:18px">${gearCard(adv.next, `niveau ${adv.next.lv}`)}</div>` : ''}
  ${others.length ? `<details class="card"><summary><b>Autres tenues possibles à ton niveau (${others.length})</b> <span class="muted small">— seulement si tu veux comparer</span></summary>
    <div class="grid2" style="margin-top:12px">${others.map(g => gearCard(g)).join('')}</div></details>` : ''}
  ${later ? `<p class="small muted" style="margin-top:12px"><i class="gi gi-padlock"></i> ${later} tenue(s) de niveau plus élevé s'afficheront quand ton personnage aura le niveau.</p>` : ''}
  <p class="small muted"><i class="gi gi-hammer-drop"></i> = se fabrique chez l'artisan une fois la recette débloquée · <i class="gi gi-rolling-dices"></i> = tombe au hasard dans les coffres et sur les boss. Clique une pièce pour voir sa recette. Noms officiels du jeu en français ; les descriptions viennent du wiki.</p>`;
};
AFTER.gear = () => { const s = $('#gBuild'); if (s) s.addEventListener('change', () => { state.mybuild = s.value || null; state.gear.style = null; render(); }); };
ACTIONS.gearStyle = s => { state.gear.style = s; render(); };
ACTIONS.gearFor = id => { state.mybuild = id; state.gear.style = null; state.charSlot = null; go('char'); };
// Ajoute les matériaux de toutes les pièces fabricables de l'ensemble à la liste de farm
ACTIONS.ownToggle = (en, el, e) => { if (e) e.stopPropagation(); state.owned = { ...state.owned }; if (state.owned[en]) delete state.owned[en]; else state.owned[en] = true; render(); };
ACTIONS.gearList = id => {
  const g = GEAR.find(x => x.id === id), need = {};
  const todo = g.pieces.filter(([p, c]) => c && !state.owned[p]);
  for (const [p] of todo) { const r = RECIPES[p] && RECIPES[p][0]; if (r) for (const [m, q] of r[1]) need[m] = (need[m] || 0) + q; }
  if (!todo.length) return toast(`Tu as déjà toutes les pièces fabricables de « ${g.fr} »`);
  for (const [n, q] of Object.entries(need)) { const e = state.list[n]; state.list[n] = { need: (e ? e.need : 0) + q, have: e ? e.have : 0 }; }
  toast(`Matériaux de ${todo.length} pièce(s) de « ${g.fr} » ajoutés à ta liste (${Object.keys(need).length} ressources)`); save();
};

// ---------- Mon personnage : l'équipement conseillé, présenté comme l'écran Personnage du jeu ----------
// Armure (data/gear.js) à droite ; armes, bouclier et anneaux (data/equip.js) à gauche ; choisis selon le build et le niveau.
const LOADOUT = { // armes de chaque build : principale, main gauche, arme de secours
  guardian: { main: ['One-handed Sword', 'One-handed Axe', 'One-handed Club'], off: 'shield', alt: ['Bow'] },
  barbarian: { main: ['Two-handed Greatsword', 'Two-handed Axe', 'Two-handed Hammer', 'Two-handed Club'], alt: ['Bow'] },
  ranger: { main: ['Bow'], alt: ['Daggers'] },
  assassin: { main: ['Daggers'], alt: ['Bow'] },
  battlemage: { main: ['Wand'], off: 'ward', alt: ['Staff'] },
  wizard: { main: ['Staff'], alt: ['Wand'] },
  healer: { main: ['Staff'], alt: ['Wand'] },
  explorer: { main: ['One-handed Sword', 'One-handed Axe'], off: 'shield', alt: ['Bow'] }
};
const PERK_PREF = { // effets d'arme recherchés par build
  guardian: ['Merciless', 'Retaliation', 'Enduring', 'Vital', 'Health Leech'], barbarian: ['Brutal', 'Vicious', 'Primal', "Dragon's Strength"],
  ranger: ['Precise', 'Headseeker', 'Piercing Damage', 'Stalking'], assassin: ['Precise', 'Sneaky', 'Merciless', 'Venomous Blades', 'Opportunistic'],
  battlemage: ['Ruthless', 'Mana Leech', 'Thundery', 'Blazing', 'Glacial'], wizard: ['Blazing', 'Glacial', 'Thundery', 'Ruthless', 'Mana Leech'],
  healer: ['Spiritual', 'Sacred', 'Renewal', 'Vital', 'Mana Leech'], explorer: ['Scrounging', 'Vital', 'Merciless']
};
const RING_PREF = { guardian: ['health', 'stamina'], barbarian: ['health', 'stamina'], ranger: ['stamina', 'health'], assassin: ['stamina', 'stamina'],
  battlemage: ['mana', 'mana'], wizard: ['mana', 'mana'], healer: ['mana', 'health'], explorer: ['stamina', 'health'] };
const WTYPE = t => WEAPON_TYPE_FR[t] || t;
state.charSlot = null;
// Meilleure arme d'une liste de types pour le niveau : la plus haute disponible, fabricable ou unique d'abord, puis les effets recherchés
function pickWeapons(types, lv, build) {
  const pref = PERK_PREF[build] || [];
  const ok = WEAPONS.filter(w => types.includes(w.type) && w.lv && w.lv <= lv);
  const score = w => w.lv * 10 + (w.craft ? 25 : 0) + (w.lore ? 15 : 0) + w.perks.filter(p => pref.includes(p)).length * 6;
  return ok.sort((a, b) => score(b) - score(a));
}
// Bouclier d'une tenue pas encore débloquée chez l'artisan : écarté aussi (même recette)
const shieldLocked = s => GEAR.some(g => isLocked(g) && s.en.startsWith(g.en.replace(/ Set$/, '')));
function pickShields(ward, lv, ignoreLocked) { return SHIELDS.filter(s => !!s.ward === ward && s.lv && s.lv <= lv && (ignoreLocked || !shieldLocked(s))).sort((a, b) => (b.lv - a.lv) || (b.craft - a.craft) || (b.block - a.block)); }
function pickRings(kind, lv) {
  const std = RINGS.filter(r => r.kind === kind && r.lv && r.lv <= lv).sort((a, b) => b.lv - a.lv);
  const special = RINGS.filter(r => r.kind === 'special' && (!r.lv || r.lv <= lv) && r.eff.some(e => kind === 'health' ? /vie/.test(e) : kind === 'mana' ? /mana/.test(e) : /endurance/.test(e)));
  return [...std, ...special];
}
// Tout l'équipement conseillé (chaque emplacement : l'objet choisi + des alternatives)
// Équipement complet pour un niveau donné (ou avec un ensemble imposé) : chaque emplacement = l'objet choisi + des alternatives
function loadout(lv = state.level || 1, forceSet) {
  const id = state.mybuild;
  if (!id) return null;
  const L = LOADOUT[id] || LOADOUT.explorer, set = forceSet || gearAdvice(lv).now, slots = {};
  const armorSlot = (k, label, re) => {
    const p = set && set.pieces.find(([n]) => pieceFr(n) === re);
    slots[k] = { label, kind: 'armor', item: p ? { en: p[0], fr: p[2] || `${set.fr} — ${re.toLowerCase()}`, craft: p[1], set, stats: ARMOR_STATS[p[0]] } : null };
  };
  armorSlot('head', 'Tête', 'Tête'); armorSlot('chest', 'Torse', 'Torse'); armorSlot('hands', 'Mains', 'Mains'); armorSlot('legs', 'Jambes', 'Jambes'); armorSlot('feet', 'Pieds', 'Pieds');
  const mains = pickWeapons(L.main, lv, id);
  slots.main = { label: 'Arme principale', kind: 'weapon', item: mains[0], alts: mains.slice(1, 6) };
  if (L.off) { const sh = pickShields(L.off === 'ward', lv, !!forceSet); slots.off = { label: L.off === 'ward' ? 'Protection magique' : 'Bouclier', kind: 'shield', item: sh[0], alts: sh.slice(1, 4) }; }
  const alts = pickWeapons(L.alt, lv, id);
  slots.alt = { label: 'Arme de secours', kind: 'weapon', item: alts[0], alts: alts.slice(1, 4) };
  const [k1, k2] = RING_PREF[id] || ['health', 'stamina'], r1 = pickRings(k1, lv), r2 = pickRings(k2, lv); // deux fois le même anneau, c'est permis
  slots.ring1 = { label: 'Anneau', kind: 'ring', item: r1[0], alts: r1.slice(1, 5) };
  slots.ring2 = { label: 'Anneau', kind: 'ring', item: r2[0], alts: r2.slice(1, 5) };
  return { set, slots, lv };
}
// Les deux équipements de la page : l'actuel (ce qu'on peut vraiment fabriquer) et le prochain (à préparer)
function plans() {
  const lv = state.level || 1, now = loadout(lv);
  if (!now) return null;
  const wanted = gearAdvice(lv, true).now; // le meilleur de ton niveau, même si sa recette n'est pas encore débloquée
  if (wanted && now.set && wanted !== now.set) return { now, next: loadout(lv, wanted), toUnlock: true };
  const nl = (gearAdvice(lv).next || {}).lv;
  return { now, next: nl ? loadout(nl) : null, toUnlock: false };
}
// Où obtenir un objet (data/provenance.js, wikily, jeu 1.0) : artisan, coffres, boss, coffre précis
const provOf = en => (window.PROV || {})[en] || null;
const craftAt = en => { const p = provOf(en); return p && p.c ? p.c : null; };
const lootShort = en => { const p = provOf(en); return p && p.ch ? `<i class="gi gi-rolling-dices"></i> coffres niv. ${p.ch[0]}–${p.ch[1]}` : p && p.q ? '<i class="gi gi-locked-chest"></i> coffre précis' : p && p.b ? '<i class="gi gi-death-skull"></i> boss' : null; };
function provHtml(en) {
  const p = provOf(en); if (!p) return '';
  const li = [];
  if (p.c) li.push(`<i class="gi gi-hammer-drop"></i> <b>Se fabrique chez : ${esc(p.c)}</b>${p.rq ? ` <span class="muted">(il faut d'abord poser : ${esc(p.rq)})</span>` : ''}`);
  (p.q || []).forEach(([id, t, k]) => li.push(`<i class="gi gi-locked-chest"></i> <b>${esc(t)}</b> <span class="muted">(${esc(k)})</span> <button class="btn sm" data-act="lootMap" data-arg="${esc(en)}|${esc(id)}"><i class="gi gi-treasure-map"></i> Voir ce coffre</button>`));
  if (p.ch) li.push(`<i class="gi gi-rolling-dices"></i> Au hasard dans les <b>coffres de niveau ${p.ch[0]} à ${p.ch[1]}</b>${p.ch[2] ? ` (${p.ch[2]} sur la carte${p.rg ? ', ' + esc(p.rg) : ''})` : ''}.`);
  if (p.b) li.push(`<i class="gi gi-death-skull"></i> Sur ${p.b.length} boss : ${p.b.map(esc).join(', ')}.`);
  (p.x || []).forEach(x => li.push(`• ${esc(x)}`));
  return `<div class="prov"><h3><i class="gi gi-position-marker"></i> Où l'obtenir</h3><ul>${li.map(l => `<li>${l}</li>`).join('')}</ul>
    ${p.ch || p.b ? `<button class="btn sm pri" data-act="lootMap" data-arg="${esc(en)}"><i class="gi gi-treasure-map"></i> Voir sur la carte les coffres${p.b ? ' et les boss' : ''} où il peut tomber</button>` : ''}</div>`;
}
// Nom français d'une pièce d'équipement (pour la carte)
function itemFr(en) {
  for (const l of [WEAPONS, SHIELDS, RINGS]) { const x = l.find(i => i.en === en); if (x) return x.fr; }
  for (const s of GEAR) { const p = (s.pieces || []).find(q => q[0] === en); if (p) return p[2] || en; }
  return en;
}
ACTIONS.lootMap = arg => {
  const [en, chest] = String(arg).split('|'), p = provOf(en); if (!p) return;
  state.carteFocus = { loot: { name: itemFr(en), ch: chest ? null : p.ch, rg: chest ? null : p.rg, b: chest ? null : p.b, chest: chest || null } };
  go('carte');
};
// Image d'un objet cliquable : clic = grande image au milieu de l'écran (images du jeu en 256 px)
const zoomIcon = (en, size, fr) => ITEM_ICONS[en] ? `<button class="zoom-ico" data-act="zoomItem" data-arg="${esc(en)}|${esc(fr || en)}" title="Voir en grand">${itemIcon(en, size)}</button>` : '';
ACTIONS.zoomItem = arg => {
  const [en, fr] = String(arg).split('|');
  const box = document.createElement('div');
  box.className = 'zoom-box';
  box.innerHTML = `<div class="zoom-in"><img src="img/items/${esc(ITEM_ICONS[en])}" alt=""><b>${esc(fr)}</b><span class="small muted">Clic ou Échap pour fermer</span></div>`;
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  box.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
};
const SLOT_ICON = { head: '<i class="gi gi-visored-helm"></i>', chest: '<i class="gi gi-breastplate"></i>', hands: '<i class="gi gi-gauntlet"></i>', legs: '<i class="gi gi-trousers"></i>', feet: '<i class="gi gi-boots"></i>', main: '<i class="gi gi-crossed-swords"></i>', off: '<i class="gi gi-checked-shield"></i>', alt: '<i class="gi gi-bow-arrow"></i>', ring1: '<i class="gi gi-ring"></i>', ring2: '<i class="gi gi-ring"></i>' };
function slotHtml(key, s, pre = 'a') {
  if (!s) return '';
  const it = s.item, made = it && (craftAt(it.en) || (s.kind === 'armor' && it.craft ? station(it.set.station) : null)), loot = it && lootShort(it.en);
  const src = !it ? '' : it.craft && made ? '<i class="gi gi-hammer-drop"></i> ' + made : s.kind === 'armor' ? (loot || '<i class="gi gi-rolling-dices"></i> butin') : s.kind === 'weapon' ? (it.craft ? '<i class="gi gi-hammer-drop"></i> ' + (made || 'fabricable') : it.lore ? '<i class="gi gi-scroll-quill"></i> arme unique' : loot || '<i class="gi gi-rolling-dices"></i> ' + biomeFr(it.biome || '')) : s.kind === 'shield' ? (it.craft ? '<i class="gi gi-hammer-drop"></i> ' + (made || 'fabricable') : loot || '<i class="gi gi-rolling-dices"></i> à trouver') : (loot || (it.biome ? '<i class="gi gi-rolling-dices"></i> ' + biomeFr(it.biome) : '<i class="gi gi-position-marker"></i> lieu précis'));
  const sub = !it ? '' : s.kind === 'armor' && it.stats ? `Armure physique ${it.stats[0]} · Armure magique ${it.stats[1]}` : s.kind === 'weapon' ? esc(WTYPE(it.type)) + (it.lv ? ` · niv. ${it.lv}` : '') : s.kind === 'shield' ? `blocage ${it.block}` : (it.eff[0] || '');
  const own = it && state.owned[it.en], k = `${pre}:${key}`;
  return `<button class="slot ${state.charSlot === k ? 'on' : ''} ${it ? (it.craft ? 'craft' : 'loot') : 'empty'} ${own ? 'owned' : ''}" data-act="charSlot" data-arg="${k}">
    ${it ? `<span class="slot-own" data-act="ownToggle" data-arg="${esc(it.en)}" title="${own ? 'Je l\'ai — clic pour décocher' : 'Je l\'ai déjà'}">${own ? '✓' : ''}</span>` : ''}
    <span class="slot-ico">${it && ITEM_ICONS[it.en] ? itemIcon(it.en, 38) : SLOT_ICON[key]}</span><span class="slot-t"><small>${esc(s.label)}</small><b>${it ? esc(it.fr) : '—'}</b><small>${sub}${src ? ' · ' + escIco(src) : ''}</small></span></button>`;
}
// Un écran d'équipement façon jeu (armes et anneaux à gauche, résumé au centre, armure à droite)
function dollHtml(lo, pre, center) {
  const S = lo.slots, armor = ['head', 'chest', 'hands', 'legs', 'feet'].map(k => S[k] && S[k].item && S[k].item.stats).filter(Boolean);
  const phys = armor.reduce((t, a) => t + a[0], 0), mag = armor.reduce((t, a) => t + a[1], 0);
  return `<div class="doll">
    <div class="doll-col">${slotHtml('main', S.main, pre)}${slotHtml('off', S.off, pre)}${slotHtml('alt', S.alt, pre)}<div class="doll-rings">${slotHtml('ring1', S.ring1, pre)}${slotHtml('ring2', S.ring2, pre)}</div></div>
    <div class="doll-mid">
      <div class="doll-stats"><div><small>Armure physique</small><b>${phys}</b></div><div><small>Armure magique</small><b>${mag}</b></div>${S.off && S.off.item ? `<div><small>Blocage</small><b>${S.off.item.block}</b></div>` : ''}</div>
      ${lo.set ? `<div class="small" style="text-align:center">Tenue : <b>${esc(lo.set.fr)}</b> (niveau ${lo.set.lv})<br><b style="color:var(--flame2)">${lo.set.pieces.filter(([p]) => state.owned[p]).length}/${lo.set.pieces.length}</b> <span class="muted">pièces obtenues</span></div>` : ''}
      ${center}
    </div>
    <div class="doll-col">${['head', 'chest', 'hands', 'legs', 'feet'].map(k => slotHtml(k, S[k], pre)).join('')}</div>
  </div>
  <div class="doll-detail" id="detail-${pre}">${(([p, k]) => p === pre && lo.slots[k] ? slotDetail(k, lo.slots[k], lo) : '')(String(state.charSlot || '').split(':'))}</div>`;
}

function slotDetail(key, s, lo) {
  const it = s && s.item;
  if (!it) return `<div class="card muted">Rien de conseillé pour cet emplacement à ton niveau.</div>`;
  const alts = (s.alts || []).map(a => `<li>${zoomIcon(a.en, 28, a.fr)}<b>${esc(a.fr)}</b> <span class="muted small">${a.en !== a.fr ? '(' + esc(a.en) + ') ' : ''}${a.lv ? 'niv. ' + a.lv + ' · ' : ''}${a.craft ? '<i class="gi gi-hammer-drop"></i> ' + (craftAt(a.en) || 'fabricable') : a.biome ? biomeFr(a.biome) : a.src || ''}</span>
    ${a.perks ? `<div class="small muted">${a.perks.map(p => esc((PERKS[p] || [p])[0])).join(' · ')}</div>` : a.eff ? `<div class="small muted">${a.eff.map(esc).join(' · ')}</div>` : ''}</li>`).join('');
  let body = '';
  if (s.kind === 'armor') {
    // Stats du jeu 1.0 (wikily) : au niveau de base de l'objet, puis à chaque amélioration chez l'artisan
    const [ph, mg, eff, ilv, ups] = it.stats || [0, 0, [], 0, []];
    body = `<p class="small">Pièce de l'ensemble <a data-act="gearGo" data-arg="${esc(it.set.id)}">« ${esc(it.set.fr)} »</a>${ilv ? ` · objet de <b>niveau ${ilv}</b>` : ` (niveau ${it.set.lv})`}</p>
      <div class="arm-stats"><div>Armure physique <b>${ph}</b></div><div>Armure magique <b>${mg}</b></div></div>
      ${eff.length ? `<ul class="arm-perks">${eff.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      ${ups && ups.length ? `<details class="arm-ups"><summary class="small">Améliorations (niveau ${ups[0][0]} à ${ups[ups.length - 1][0]})</summary><table class="small">
        <tr><th>Niveau</th><th>Armure physique</th><th>Armure magique</th><th>Amélioration</th></tr>
        ${ups.map(([l, p, m, e]) => `<tr><td>${l}</td><td>${p}</td><td>${m}</td><td>${esc(e)}</td></tr>`).join('')}</table></details>` : ''}
      ${it.set.unlock ? `<p class="small unlock"><i class="gi gi-padlock-open"></i> <b>Tu ne la vois pas ${esc(chezArtisan(it.set.station))} ?</b> ${esc(it.set.unlock)}${(p => p ? ` En attendant, garde l'ensemble <b>${esc(p.fr)}</b> (niveau ${p.lv}).` : '')(gearAdvice(it.set.lv - 1).now)}</p>` : `<p class="small muted"><i class="gi gi-position-marker"></i> ${esc(it.set.src)}</p>`}
      ${provHtml(it.en)}
      ${it.craft ? `<div class="row"><a class="btn sm" data-go="craft|${esc(it.en)}"><i class="gi gi-hammer-drop"></i> Voir la recette</a><button class="btn sm" data-act="gearList" data-arg="${esc(it.set.id)}">+ Matériaux de tout l'ensemble à ma liste</button></div>` : ''}`;
  } else if (s.kind === 'weapon') {
    body = `<p class="small">${esc(WTYPE(it.type))}${it.lv ? ` · niveau ${it.lv} environ` : ''} · ${it.craft ? '<i class="gi gi-hammer-drop"></i> se fabrique' + (craftAt(it.en) ? ' chez : ' + esc(craftAt(it.en)) : '') : it.lore ? '<i class="gi gi-scroll-quill"></i> arme unique (lore)' : `<i class="gi gi-rolling-dices"></i> tombe au hasard dans les coffres et sur les boss${it.biome ? ' (' + esc(biomeFr(it.biome)) + ')' : ''}`}${it.other.length ? ' · aussi : ' + it.other.map(esc).join(', ') : ''}</p>
      <ul class="small">${it.perks.map(p => `<li><b>${esc((PERKS[p] || [p])[0])}</b> <span class="muted">— ${esc((PERKS[p] || [, ''])[1])}</span></li>`).join('')}</ul>
      ${provHtml(it.en)}${RECIPES[it.en] ? `<a class="btn sm" data-go="craft|${esc(it.en)}"><i class="gi gi-hammer-drop"></i> Voir la recette</a>` : ''}`;
  } else if (s.kind === 'shield') {
    body = `<p class="small">Blocage ${it.block} · puissance de parade ${it.parry}${it.eff.length ? ' · ' + it.eff.map(esc).join(' · ') : ''}</p>
      ${provHtml(it.en) || `<p class="small muted">${it.craft ? '<i class="gi gi-hammer-drop"></i> Se fabrique (recette chez l\'artisan).' : '<i class="gi gi-position-marker"></i> ' + esc(it.src)}</p>`}${RECIPES[it.en] ? `<a class="btn sm" data-go="craft|${esc(it.en)}"><i class="gi gi-hammer-drop"></i> Voir la recette</a>` : ''}`;
  } else {
    body = `<p class="small">${it.eff.map(esc).join(' · ')}</p>${provHtml(it.en) || `<p class="small muted"><i class="gi gi-position-marker"></i> ${esc(it.src)}</p>`}`;
  }
  const own = state.owned[it.en];
  return `<div class="card stack"><div class="row" style="justify-content:space-between"><div class="row" style="flex-wrap:nowrap;gap:10px">${zoomIcon(it.en, 72, it.fr)}<div><b style="font-size:16px">${esc(it.fr)}</b>${it.en && it.en !== it.fr ? ` <span class="muted small">(${esc(it.en)})</span>` : ''} <span class="chip">${esc(s.label)}</span></div></div>
    <button class="btn sm ${own ? 'pri' : ''}" data-act="ownToggle" data-arg="${esc(it.en)}">${own ? '✓ Je l\'ai' : '☐ Je l\'ai déjà'}</button></div>
    ${body}${alts ? `<div><h3 style="margin:6px 0">Autres choix</h3><ul class="alts">${alts}</ul></div>` : ''}</div>`;
}
VIEWS.char = () => {
  const b = BUILDS.find(x => x.id === state.mybuild), lv = state.level || 1, P = plans();
  const pick = `<select id="cBuild"><option value="">— choisir mon build —</option>${BUILDS.map(x => `<option value="${x.id}" ${state.mybuild === x.id ? 'selected' : ''}>${esc(x.name.split(' —')[0])}</option>`).join('')}</select>`;
  if (!P) return `<h1><i class="gi gi-visored-helm"></i> Mon personnage</h1><div class="card stack" style="max-width:560px"><p>Choisis ton build : la page te propose alors l'armure, les armes et les anneaux à équiper pour ton niveau.</p>
    <div class="row">${pick}<a class="btn" data-go="quiz"><i class="gi gi-compass"></i> Je ne sais pas : faire le questionnaire</a></div></div>`;
  const now = P.now, next = P.next, set = now.set;
  const lockBtn = set && set.unlock ? `<div class="small muted" style="text-align:center">Tu ne vois pas cette tenue ${esc(chezArtisan(set.station))} ?</div><button class="btn sm" data-act="lockSet" data-arg="${esc(set.id)}"><i class="gi gi-padlock"></i> Pas encore débloquée</button>` : '';
  const unlockBox = next && next.set && next.set.unlock ? `<div class="small unlock" style="text-align:center"><i class="gi gi-padlock-open"></i> ${esc(next.set.unlock)}</div>` : '';
  return `<h1><i class="gi gi-visored-helm"></i> Mon personnage</h1>
  <div class="card row" style="margin-bottom:14px;gap:10px"><label class="row small">Mon build ${pick}</label><span class="small muted">${bIco(b)} Niveau ${lv}${state.game ? ' (lu dans ta sauvegarde)' : ''} · Flamme ${state.flame}</span>
    <a class="small" data-go="planner"><i class="gi gi-skills"></i> Mon arbre</a><a class="small" data-go="gear"><i class="gi gi-checked-shield"></i> Toutes les tenues</a></div>
  <h2><i class="gi gi-checked-shield"></i> Mon équipement actuel <span class="muted small">— ce que tu peux porter et fabriquer maintenant (niveau ${lv})</span></h2>
  ${dollHtml(now, 'a', `${lockBtn}<p class="small muted" style="text-align:center;margin:4px 0 0">Clique un emplacement pour le détail ; coche le rond quand tu as l'objet.</p>`)}
  ${next ? `<h2 style="margin-top:22px"><i class="gi gi-spyglass"></i> ${P.toUnlock ? `Mon prochain équipement — à débloquer (niveau ${next.set.lv})` : `Mon prochain équipement — dès le niveau ${next.lv}`}</h2>
  <p class="small muted" style="margin-top:-6px">${P.toUnlock ? 'Cette tenue est de ton niveau, mais sa recette n\'est pas encore chez ton artisan : voici comment la débloquer.' : 'Pour préparer la suite : tu peux déjà farmer les matériaux.'}</p>
  ${dollHtml(next, 'f', `${unlockBox}${P.toUnlock ? `<button class="btn sm pri" data-act="unlockSet" data-arg="${esc(next.set.id)}">✓ C'est débloqué</button>` : ''}${next.set && next.set.pieces.some(p => p[1]) ? `<button class="btn sm" data-act="gearList" data-arg="${esc(next.set.id)}">+ Matériaux à ma liste</button>` : ''}`)}` : ''}
  <p class="small muted">Armes et anneaux tombent souvent au hasard : la page te propose le meilleur type à viser, puis des alternatives. Noms officiels du jeu en français (le nom anglais est entre parenthèses).</p>`;
};
AFTER.char = () => { const s = $('#cBuild'); if (s) s.addEventListener('change', () => { state.mybuild = s.value || null; state.charSlot = null; render(); }); };
ACTIONS.charSlot = k => { state.charSlot = state.charSlot === k ? null : k; render(); const d = document.getElementById('detail-' + String(k).split(':')[0]); if (d && state.charSlot) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
// Tenue pas encore débloquée chez l'artisan : l'équipement actuel revient à la tenue précédente
ACTIONS.lockSet = id => { state.locked = { ...state.locked, [id]: true }; state.charSlot = null; render(); };
ACTIONS.unlockSet = id => { const l = { ...state.locked }; delete l[id]; state.locked = l; state.charSlot = null; render(); };

ACTIONS.gearGo = id => { go('gear'); setTimeout(() => { const el = document.getElementById('gear-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); };

// ---------- Builds ----------
VIEWS.builds = () => `<h1><i class="gi gi-crossed-swords"></i> Builds</h1><p class="sub">Chaque build liste les compétences à viser. Clique « Charger dans mon arbre » : l'arbre affiche le chemin exact et l'ordre des clics, numérotés.</p>
  <div class="stack">${BUILDS.map(b => `
  <details class="card bd-${b.tree}" ${state.openBuild === b.id ? 'open' : ''}>
    <summary class="row" style="justify-content:space-between">
      <div><span style="font-size:22px">${bIco(b)}</span> <b style="font-size:17px">${esc(b.name)}</b> <span class="chip">${esc(b.diff)}</span> <span class="chip">${esc(b.role)}</span></div>
      <span class="muted small">▼ détails</span>
    </summary>
    <p>${esc(b.pitch)}</p>
    <div class="grid2">
      <div class="small"><b>Priorité des stats :</b> ${esc(b.stats)}<br><b>Armes :</b> ${esc(b.weapons)}<br><b>Armure :</b> ${esc(b.armor)}
        <h3 style="margin-top:12px">Comment le jouer</h3><ul>${b.play.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      <div><h3>Compétences visées, dans l'ordre</h3><ol class="small">${b.skills.map(treeType).filter(Boolean).map(t => `<li><span style="color:${SkillTree.COLORS[TREE.types[t].col]}">●</span> <b>${esc(TREE.types[t].n)}</b> <span class="muted">— ${SkillTree.describe(t)}</span></li>`).join('')}</ol>
        <p class="small muted">« Charger dans mon arbre » calcule le chemin complet (avec les nœuds d'attributs à prendre pour y arriver) et numérote chaque clic.</p></div>
    </div>
    <div class="row"><button class="btn pri" data-act="applyBuild" data-arg="${b.id}">Charger dans mon arbre</button><button class="btn" data-act="gearFor" data-arg="${b.id}"><i class="gi gi-visored-helm"></i> Choisir ce build : mon équipement</button></div>
  </details>`).join('')}</div>`;
ACTIONS.applyBuild = id => {
  const b = BUILDS.find(x => x.id === id);
  if (state.tree.length && !confirm(`Remplacer ton plan actuel par le build « ${b.name.split(' —')[0]} » ?`)) return;
  // Si la sauvegarde a été lue, le build part de ce que le personnage a déjà en jeu
  const r = SkillTree.planBuild([...b.skills, ...UNIVERSAL], b.attrs, state.game ? state.game.nodes : []);
  state.tree = r.plan; state.treeSel = null; state.treeView = { ...FULL_VIEW };
  toast(`Build « ${b.name.split(' —')[0]} » chargé : suis les numéros dans l'arbre`);
  go('planner');
};

// ---------- Arbre de compétences (vue façon jeu) ----------
const ST = SkillTree;
const gameMap = () => new Map((state.game && state.game.nodes) || []);
const gameSpent = () => state.game ? ST.spent(state.game.nodes) : 0;
// Points de compétence (version 1.0) : 2 par niveau (jusqu'au 50), 1 par Racine de Brume, 3 par Puits de l'élixir.
// La sauvegarde du personnage donne le niveau et les points dépensés, pas les racines ni les puits : on en déduit
// au minimum ce qu'ils rapportent (on ne peut pas avoir dépensé plus que ce qu'on a gagné).
const levelPoints = () => Math.max(0, (Math.min(50, state.level) - 1) * 2);
const manualBonus = () => Number(state.roots || 0) + Number(state.wells || 0) * 3;
const bonusPoints = () => Math.max(manualBonus(), gameSpent() - levelPoints());
const availPoints = () => levelPoints() + bonusPoints();
const spentPoints = () => ST.spent(state.tree);
const FULL_VIEW = { x: -1130, y: -1130, w: 2260 }; // inclut les noms d'archétypes autour de l'anneau
state.treeView = { ...FULL_VIEW };
state.treeSel = null;
state.treeQ = '';

function treeSvg() {
  const plan = state.tree, have = new Map(plan.map(p => [p[0], p[1]])), avail = availPoints(), got = gameMap();
  const stepOf = {}; ST.steps(plan).forEach(s => { stepOf[s.id] = s; });
  const v = state.treeView, k = v.w / Math.max(400, state._svgW || 800); // unités SVG par pixel : numéros et textes gardent la même taille à l'écran
  const R = { small: 10, medium: 15, large: 21 };
  const nq = norm(state.treeQ);
  let edges = '', nodes = '', labels = '';
  for (const [a, b] of TREE.edges) {
    const A = ST.NODE[a], B = ST.NODE[b];
    if (!A || !B) continue;
    let cls = 'te', style = '';
    if (have.has(a) && have.has(b) && stepOf[a].total <= avail && stepOf[b].total <= avail) {
      cls += ' te-on';
      style = ` style="stroke:${ST.color(b)}"`;
    }
    edges += `<line class="${cls}"${style} x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
  }
  for (const id in ST.NODE) {
    const n = ST.NODE[id], t = ST.typeOf(id), r = R[n.tier] || 15, rank = have.get(+id) || 0, s = stepOf[id];
    const g = got.get(+id) || 0, done = g > 0 && (!s || g >= s.rank);
    // Deux couleurs seulement : vert = complet en jeu (ex. 3/3), jaune = à prendre ou à compléter (ex. 1/3)
    let cls = 'tn';
    if (g && g >= t.m) cls += ' got';
    else if (g || (rank && s.total <= avail)) cls += ' on';
    if (nq && norm(t.n + ' ' + t.en).includes(nq)) cls += ' hit';
    if (state.treeSel === +id) cls += ' sel';
    nodes += `<g class="${cls}" data-node="${id}" transform="translate(${n.x} ${n.y})" style="--c:${ST.color(id)}">`
      + (n.base ? `<circle class="tn-base" r="${r + 6}"/>` : '')
      + `<circle class="tn-c" r="${r}"/>`
      + (t.m > 1 && (g || (rank && s.total <= avail)) ? `<text class="tn-rank" y="${r + 14 * k}" style="font-size:${13 * k}px">${g || rank}/${t.m}</text>` : '')
      + ((s && s.total <= avail) || g ? `<g class="tn-step${done ? ' done' : ''}" transform="translate(${r * 0.8 + 4 * k} ${-r * 0.8 - 4 * k})"><circle r="${11 * k}"/><text y="${4.5 * k}" style="font-size:${12 * k}px">${done ? '✓' : s.n}</text></g>` : '')
      + '</g>';
  }
  // Noms d'archétypes à l'extérieur de l'anneau (au-delà du nœud le plus éloigné), comme dans le jeu
  for (const [name, ang] of TREE.labels) {
    const th = (ang + 90) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), d = 935;
    const anchor = c > 0.35 ? 'start' : c < -0.35 ? 'end' : 'middle';
    const base = sn > 0.35 ? 'hanging' : sn < -0.35 ? 'auto' : 'middle';
    labels += `<text class="tl" text-anchor="${anchor}" dominant-baseline="${base}" x="${(d * c).toFixed(0)}" y="${(d * sn).toFixed(0)}">${esc(name)}</text>`;
  }
  return `<svg id="treeSvg" viewBox="${v.x} ${v.y} ${v.w} ${v.w}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arbre de compétences">
    <defs><radialGradient id="tbg"><stop offset="0" stop-color="#2a2236"/><stop offset=".7" stop-color="#17131d"/><stop offset="1" stop-color="#120f17" stop-opacity="0"/></radialGradient></defs>
    <circle r="910" fill="url(#tbg)"/><circle class="t-ring" r="905"/><circle class="t-flame" r="46"/><path class="t-flame-t" d="M 0 -16 C -4 -10 -12 -2 -12 6 C -12 14 -6 20 0 20 C 6 20 12 14 12 6 C 12 -2 4 -10 0 -16 Z"/>
    ${labels}${edges}${nodes}</svg>`;
}

VIEWS.planner = () => {
  const avail = availPoints(), spent = spentPoints(), steps = ST.steps(state.tree), got = gameMap();
  const nowSteps = steps.filter(s => s.total <= avail).length;
  const isDone = s => (got.get(s.id) || 0) >= s.rank;
  const doneCount = steps.filter(isDone).length, next = steps.find(s => !isDone(s));
  return `<h1><i class="gi gi-skills"></i> Arbre de compétences</h1>
  <p class="sub">L'arbre du jeu (version 1.0). <b>Clic</b> sur un nœud pour l'ajouter, <b>clic droit</b> pour le retirer, <b>molette</b> pour zoomer, <b>glisser</b> pour te déplacer. Charge un build pour voir le chemin et l'ordre des clics.</p>
  <div class="tree-wrap">
    <div class="tree-box card">
      <div class="tree-tools">
        <input id="tQ" type="search" placeholder="Chercher un nœud…" value="${esc(state.treeQ)}">
        <button class="btn sm" data-act="treeZoom" data-arg="0.7" title="Zoomer">＋</button>
        <button class="btn sm" data-act="treeZoom" data-arg="1.4" title="Dézoomer">－</button>
        <button class="btn sm" data-act="treeFit" title="Tout voir">⤢</button>
      </div>
      ${treeSvg()}
      <div id="tTip" class="t-tip" hidden></div>
      <div class="tree-legend small">
        <span><i class="lg lg-got"></i> Complet (ex. 3/3)</span><span><i class="lg lg-on"></i> À prendre ou à compléter (ex. 1/3)</span>
        <span><b class="lg-num">3</b> Ordre des clics</span><span><b>2/3</b> Rangs débloqués / rangs max</span>
      </div>
    </div>
    <div class="tree-side stack">
      <div class="card stack">
        <h3><i class="gi gi-gamepad"></i> Mon personnage</h3>
        ${state.game ? `<div><b>${esc(state.game.name || 'Personnage')}</b> · niveau ${state.game.level || '?'} · ${gameSpent()} points dépensés · ${state.game.nodes.length} nœuds</div>
          <div class="small muted">Lu dans ${esc(state.game.file || 'la sauvegarde')} — ${esc(new Date(state.game.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</div>
          <div class="row"><button class="btn sm" data-act="planFromGame" title="Remplace ton plan par les compétences que tu as réellement en jeu">Mon arbre = mes compétences en jeu</button></div>`
        : '<p class="small muted" style="margin:0">Aucune sauvegarde lue pour l\'instant.</p>'}
        ${appHost ? '<p class="small muted" style="margin:0"><i class="gi gi-cycle"></i> L\'appli Windows lit ta sauvegarde toute seule à chaque enregistrement du jeu.</p>'
        : `<div class="row"><label class="btn sm"><i class="gi gi-open-folder"></i> Importer ma sauvegarde<input type="file" id="saveFile" accept=".ksd" hidden></label></div>
          <p class="small muted" style="margin:0">Fichier : <code>C:\\Program Files (x86)\\Steam\\userdata\\(ton n°)\\1203620\\remote\\character0.ksd</code></p>`}
      </div>
      <div class="card stack">
        <h3>Mes points</h3>
        ${state.game && state.game.level ? `<div class="pts-lines small">
          <div><span>Niveau ${state.level} <span class="muted">(lu dans ta sauvegarde)</span></span><b>${levelPoints()} pts</b></div>
          <div><span>Racines de Brume et puits de l'élixir${bonusPoints() > manualBonus() ? ' <span class="muted">(déduit : tu as dépensé ' + gameSpent() + ' points)</span>' : ''}</span><b>${bonusPoints()} pts</b></div>
        </div>
        <details class="small"><summary class="muted">Corriger à la main (points pas encore dépensés en jeu)</summary>
          <div class="row" style="margin-top:6px"><label>Racines <input type="number" min="0" max="60" id="pRoots" value="${state.roots}"></label>
          <label>Puits <input type="number" min="0" max="18" id="pWells" value="${state.wells}"></label></div>
          <p class="muted" style="margin:4px 0 0">Utile seulement si le jeu t'affiche des points « disponibles » non dépensés.</p></details>`
        : `<div class="row small">
          <label>Niveau <input type="number" min="1" max="50" id="pLevel" value="${state.level}"></label>
          <label>Racines <input type="number" min="0" max="60" id="pRoots" value="${state.roots}"></label>
          <label>Puits <input type="number" min="0" max="18" id="pWells" value="${state.wells}"></label>
        </div>`}
        <div class="row" style="align-items:baseline"><span class="pts">${spent}</span><span class="muted">/ ${avail} points disponibles</span></div>
        <div class="bar ${spent > avail ? 'over' : ''}"><i style="width:${Math.min(100, spent / Math.max(1, avail) * 100)}%"></i></div>
        <p class="small muted" style="margin:0">2 pts par niveau · 1 par Racine de Brume · 3 par Puits de l'élixir (max 212 au niveau 50).</p>
      </div>
      <div class="card stack">
        <h3>Build</h3>
        <select id="pBuild"><option value="">Charger un build…</option>${BUILDS.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
        <div class="row"><button class="btn sm" data-act="copyPlan" ${steps.length ? '' : 'disabled'}>Copier les étapes</button><button class="btn sm ghost" data-act="clearPlan" ${steps.length ? '' : 'disabled'}>Tout effacer</button></div>
      </div>
      <div class="card">
        <h3>Ordre des clics ${steps.length ? `<span class="muted small">— ${nowSteps}/${steps.length} faisables maintenant</span>` : ''}</h3>
        ${state.game && steps.length ? `<p class="small" style="margin:4px 0">✓ ${doneCount}/${steps.length} étapes déjà faites en jeu${next ? ` · <b>prochaine : ${esc(next.name)}</b>` : ' · build terminé 🎉'}</p>` : ''}
        ${steps.length ? `<ol class="t-steps">${steps.map(s => `<li class="${isDone(s) ? 'done' : s.total <= avail ? '' : 'later'}${next === s ? ' next' : ''}${state.treeSel === s.id ? ' sel' : ''}" data-act="treeFocus" data-arg="${s.id}">
            <b class="t-n" style="--c:${ST.color(s.id)}">${isDone(s) ? '✓' : s.n}</b><span class="t-name">${esc(s.name)}${s.max > 1 ? ` <span class="muted">×${s.rank}</span>` : ''}</span><span class="t-pts">+${s.pts}<small>${s.total}</small></span></li>`).join('')}</ol>`
          : '<p class="small muted">Aucun nœud. Charge un build ci-dessus, ou clique sur les nœuds près du centre (les points de départ ont un double cercle).</p>'}
      </div>
    </div>
  </div>`;
};

function treeTip(id) {
  const t = ST.typeOf(id), have = new Map(state.tree.map(p => [p[0], p[1]])), rank = have.get(id) || 0;
  const s = ST.steps(state.tree).find(x => x.id === id);
  let status;
  if (s) status = `Étape <b>${s.n}</b>${t.m > 1 ? ` · rang ${rank}/${t.m}` : ''} · total ${s.total} pts${rank < t.m ? ' · clic : rang suivant' : ''} · clic droit : retirer`;
  else if (ST.canTake(state.tree, id)) status = 'Clic : ajouter ce nœud';
  else status = 'Pas encore accessible : il faut d\'abord un nœud relié';
  return `<div class="t-tip-h" style="--c:${ST.color(id)}"><b>${esc(t.n)}</b><span class="muted small">${esc(t.en)}</span></div>
    <div class="small muted">${t.c} pt${t.c > 1 ? 's' : ''}${t.m > 1 ? ' par rang · ' + t.m + ' rangs' : ''}</div>
    <div class="small">${ST.describe(ST.NODE[id].t, t.m > 1 && rank ? rank : 0)}</div>
    <div class="small t-tip-s">${status}</div>`;
}

function treeSetView(v) {
  v.w = Math.max(240, Math.min(2400, v.w));
  state.treeView = v;
  const svg = $('#treeSvg'); if (svg) svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.w}`);
  clearTimeout(state._treeT);
  state._treeT = setTimeout(() => { if (state.view === 'planner') rerenderKeepScroll(); }, 180); // redessine les numéros à la bonne taille
}
function rerenderKeepScroll() { const y = window.scrollY; const side = $('.t-steps'); const sy = side ? side.scrollTop : 0; render(); window.scrollTo(0, y); const s2 = $('.t-steps'); if (s2) s2.scrollTop = sy; }

function treeClick(id, removing) {
  if (removing) {
    const p = ST.remove(state.tree, id);
    if (p === null) return toast('Impossible : d\'autres nœuds de ton plan passent par celui-ci');
    state.tree = p;
  } else {
    const t = ST.typeOf(id), r = (state.tree.find(p => p[0] === id) || [0, 0])[1];
    if (r >= t.m) return toast(`${t.n} : rang maximum atteint`);
    if (!ST.canTake(state.tree, id)) return toast('Pas encore accessible : prends d\'abord un nœud relié (contour en pointillés)');
    state.tree = ST.add(state.tree, id);
  }
  state.treeSel = id;
  rerenderKeepScroll();
}

ACTIONS.planFromGame = () => {
  if (state.tree.length && !confirm('Remplacer ton plan par les compétences que ton personnage a en jeu ?')) return;
  state.tree = state.game.nodes.slice(); state.treeSel = null; toast('Ton arbre reprend tes compétences en jeu'); render();
};
ACTIONS.treeZoom = f => { const v = state.treeView, c = { x: v.x + v.w / 2, y: v.y + v.w / 2 }, w = v.w * Number(f); treeSetView({ x: c.x - w / 2, y: c.y - w / 2, w }); };
ACTIONS.treeFit = () => treeSetView({ ...FULL_VIEW });
ACTIONS.treeFocus = id => {
  const n = ST.NODE[id]; state.treeSel = Number(id);
  state.treeView = { x: n.x - 300, y: n.y - 300, w: 600 };
  rerenderKeepScroll();
};
ACTIONS.clearPlan = () => { if (confirm('Effacer tout le plan de compétences ?')) { state.tree = []; state.treeSel = null; render(); } };
ACTIONS.copyPlan = () => {
  const lines = ST.steps(state.tree).map(s => `${s.n}. ${s.name}${s.max > 1 ? ` (rang ${s.rank}/${s.max})` : ''} : +${s.pts} pt${s.pts > 1 ? 's' : ''} → ${s.total}`);
  copyText(`Mon plan Enshrouded — ${spentPoints()} points (disponibles : ${availPoints()})\n` + lines.join('\n'), 'Étapes copiées');
};

AFTER.planner = () => {
  const num = (sel, key) => $(sel).addEventListener('change', e => { state[key] = Math.max(0, Number(e.target.value) || 0); render(); });
  if ($('#pLevel')) num('#pLevel', 'level');
  num('#pRoots', 'roots'); num('#pWells', 'wells');
  $('#pBuild').addEventListener('change', e => e.target.value && ACTIONS.applyBuild(e.target.value));
  const sf = $('#saveFile');
  if (sf) sf.addEventListener('change', async () => { const f = sf.files[0]; if (f) ingestSave(new Uint8Array(await f.arrayBuffer()), f.name, f.lastModified, true); });
  const q = $('#tQ');
  q.addEventListener('input', () => { state.treeQ = q.value; render(); const n = $('#tQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });

  const svg = $('#treeSvg'), tip = $('#tTip'), box = $('.tree-box');
  // Largeur réelle de l'arbre à l'écran : sert à garder les numéros lisibles
  const sw = svg.getBoundingClientRect().width;
  if (sw > 200 && Math.abs(sw - (state._svgW || 0)) > 30) { state._svgW = sw; return rerenderKeepScroll(); }
  const toSvg = (cx, cy) => { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const v = state.treeView, pt = toSvg(e.clientX, e.clientY), f = e.deltaY > 0 ? 1.18 : 1 / 1.18, w = Math.max(240, Math.min(2400, v.w * f));
    treeSetView({ x: pt.x - (pt.x - v.x) * (w / v.w), y: pt.y - (pt.y - v.y) * (w / v.w), w });
  }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, v: { ...state.treeView }, moved: false, node: e.target.closest('[data-node]') };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 5) { drag.moved = true; tip.hidden = true; svg.classList.add('dragging'); }
      if (drag.moved) {
        const s = drag.v.w / svg.getBoundingClientRect().width;
        state.treeView = { x: drag.v.x - dx * s, y: drag.v.y - dy * s, w: drag.v.w };
        svg.setAttribute('viewBox', `${state.treeView.x} ${state.treeView.y} ${state.treeView.w} ${state.treeView.w}`);
      }
      return;
    }
    const g = e.target.closest('[data-node]');
    if (!g) { tip.hidden = true; return; }
    tip.innerHTML = treeTip(Number(g.dataset.node)); tip.hidden = false;
    const b = box.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = e.clientX - b.left + 16, y = e.clientY - b.top + 16;
    if (x + tw > b.width - 8) x = e.clientX - b.left - tw - 16;
    if (y + th > b.height - 8) y = Math.max(8, e.clientY - b.top - th - 16);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  svg.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null; svg.classList.remove('dragging');
    if (!d.moved && d.node) treeClick(Number(d.node.dataset.node), e.shiftKey);
  });
  svg.addEventListener('pointerleave', () => { if (!drag) tip.hidden = true; });
  svg.addEventListener('contextmenu', e => {
    const g = e.target.closest('[data-node]');
    e.preventDefault();
    if (g) treeClick(Number(g.dataset.node), true);
  });
};

// Icône d'une ressource (images du wiki, dans img/res/)
const matIcon = (n, size = 24) => MAP.icons[n] ? `<img class="res-ico" src="img/res/${esc(MAP.icons[n])}" alt="" width="${size}" height="${size}" loading="lazy">` : '';
// Carte : les lieux où trouver la ressource (mines, grottes, fermes…). Coordonnées du wiki : 0..10240, y vers le haut.
// Pour se repérer : les mausolées de Flamme et les tours des Anciens (visibles aussi sur la carte du jeu),
// le nom des régions, et pour chaque lieu sa région et sa position par rapport au sanctuaire le plus proche.
const REGION_FR = { 'Springlands': 'Hautes pâtures', 'Low Meadows': 'Mornes plaines', 'Revelwood': 'Bois envoûtés', 'Blackmire': 'Blackmire',
  'Nomad Highlands': 'Plateaux nomades', 'Kindlewastes': 'Regs exaltés', 'Albaneve Summits': 'Sommets de l\'Albaneve', 'Veilwater Basin': 'Bassin des eaux voilées' };
const REGION_RE = 'Springlands|Low Meadows|Revelwood|Blackmire|Nomad Highlands|Kindlewastes|Albaneve Summits|Veilwater Basin';
const MAP_REF = (() => {
  const anchors = [], regions = {};
  for (const m of MAP.markers) {
    const r = new RegExp(`\\bin (?:the )?(${REGION_RE})\\b`).exec(m[5]) || new RegExp(` - (${REGION_RE})$`).exec(m[1]);
    if (!r) continue;
    anchors.push([m[3], m[4], r[1]]);
    (regions[r[1]] = regions[r[1]] || []).push([m[3], m[4]]);
  }
  const labels = Object.entries(regions).filter(([, p]) => p.length >= 2)
    .map(([r, p]) => [(REGION_FR[r] || r).replace(/ \(.*\)$/, ''), p.reduce((t, q) => t + q[0], 0) / p.length, p.reduce((t, q) => t + q[1], 0) / p.length]);
  return { anchors, labels, shrines: MAP.markers.filter(m => m[2] === 'Flame_Shrine'), spires: MAP.markers.filter(m => m[2] === 'Ancient_Spire') };
})();
function mapRegion(m) {
  let best = null, bd = Infinity;
  for (const a of MAP_REF.anchors) { const d = Math.hypot(a[0] - m[3], a[1] - m[4]); if (d < bd) { bd = d; best = a; } }
  return best ? REGION_FR[best[2]] || best[2] : '';
}
// « au nord-est du mausolée de Flamme le plus proche »
function mapWhere(m) {
  let s = null, sd = Infinity;
  for (const x of MAP_REF.shrines) { const d = Math.hypot(m[3] - x[3], m[4] - x[4]); if (d > 1 && d < sd) { sd = d; s = x; } }
  if (!s) return '';
  if (sd < 90) return 'juste à côté d\'un mausolée de Flamme';
  const dirs = ['à l\'est', 'au nord-est', 'au nord', 'au nord-ouest', 'à l\'ouest', 'au sud-ouest', 'au sud', 'au sud-est'];
  const dir = dirs[Math.round(Math.atan2(m[4] - s[4], m[3] - s[3]) / (Math.PI / 4) + 8) % 8];
  return `${sd < 300 ? 'un peu' : 'assez loin'} ${dir} du mausolée de Flamme le plus proche`;
}
// Traduction des descriptions du wiki (phrases toujours construites de la même façon)
const FOES_FR = { 'Bats': 'chauves-souris', 'Rats': 'rats', 'Spiders': 'araignées', 'Wolves': 'loups', 'Boars': 'sangliers', 'Scorpions': 'scorpions',
  'Dune Armadillos': 'tatous des dunes', 'Sabertooth Tigers': 'tigres à dents de sabre', 'Draconian Vultures': 'vautours draconiens', 'Whitewing Vultures': 'vautours à ailes blanches',
  'Vicious Vines': 'lianes vicieuses', 'Fell Critters': 'bestioles des Déchus', 'Scavengers': 'maraudeurs' };
const PLACE_FR = [[/^Abandoned Mine\b/, 'Mine abandonnée'], [/^Abandoned Farm\b/, 'Ferme abandonnée'], [/^Abandoned Village\b/, 'Village abandonné'], [/^Vukah Cave Passage\b/, 'Passage souterrain des Vukah'],
  [/^Cave Passage\b/, 'Passage souterrain'], [/^Passage to the ([^.]+?) inhabited/, 'Passage vers $1, occupé'], [/^Farm\b/, 'Ferme'], [/^City\b/, 'Ville'],
  [/^An Elixir Well\b/, 'Puits d\'élixir'], [/^A Shroud Root\b/, 'Racine de Brume'], [/^Entrance to /, 'Entrée de '], [/^An abandoned Camp belonging to (?:the )?/, 'Camp abandonné : '],
  [/^(.+) fields\b/, 'Champs de $1'], [/^Inhabited with (.+) at night\b/, '$1 la nuit'], [/^A hidden Tomb\b/, 'Tombeau caché'], [/^Ruins of /, 'Ruines de ']];
const listFr = (t, f) => t.split(/,? and |, /).map(x => f(x.trim())).join(', ');
const foeFr = x => FOES_FR[x] || x;
function descFr(d) {
  let s = String(d || '').replace(/\s*\(TODO[^)]*\)\.?/g, '').trim();
  if (!s) return '';
  if (PLACES_FR.descs[s]) return PLACES_FR.descs[s]; // traduction faite à la main (data/places_fr.js)
  for (const [re, fr] of PLACE_FR) if (re.test(s)) { s = s.replace(re, fr); break; }
  return s
    .replace(/ in Deadly Shroud/g, ' dans la Brume mortelle').replace(/ in the Shroud/g, ' dans la Brume')
    .replace(/ inhabited by ([^.]+)/g, (_, x) => ' occupé par : ' + listFr(x, foeFr)).replace(/ infested with ([^.]+)/g, (_, x) => ' infesté de ' + listFr(x, foeFr))
    .replace(/(?:Has|Contains?) ([^.]+?) veins(?: and ([^.]+))?\./g, (_, x, y) => `Filons : ${listFr(x, matName)}${y ? ', ' + listFr(y, matName) : ''}.`)
    .replace(/Grows ([^.]+)\./g, (_, x) => `Cultures : ${listFr(x, matName)}.`)
    .replace(/Guarded by (?:a |an )?(two )?([^.]+)\./g, (_, two, x) => `Gardé par ${two ? 'deux ' : 'un '}${x}.`)
    .replace(/Inside (?:the )?([^.]+)\./g, 'À l\'intérieur de $1.').replace(/Connects ([^.]+)\./g, 'Relie $1.')
    .replace(/Leads to a Flame Shrine\./g, 'Mène à un sanctuaire de la Flamme.')
    .replace(/ - entrance is to the north/g, ' (entrée au nord)').replace(/ - entrance is under the waterfall/g, ' (entrée sous la cascade)');
}
// Lieux d'une ressource, sans doublons (même nom au même endroit)
function mapPoints(n) {
  const seen = new Set();
  const pts = (MAP.byMat[n] || []).map(i => MAP.markers[i]).filter(m => { const k = m[1] + '|' + Math.round(m[3] / 20) + '|' + Math.round(m[4] / 20); if (seen.has(k)) return false; seen.add(k); return true; });
  // Repères seulement (ex. « entre le camp de chasseurs et le tombeau ») : si un repère existe en plusieurs exemplaires,
  // on garde celui qui est le plus proche des autres repères cités
  const names = [...new Set(pts.map(m => m[1]))];
  if (names.length < 2 || pts.some(m => isHere(m, n))) return pts;
  const near = m => pts.filter(o => o[1] !== m[1]).reduce((t, o) => t + Math.hypot(o[3] - m[3], o[4] - m[4]), 0);
  return names.map(nm => pts.filter(m => m[1] === nm).sort((a, b) => near(a) - near(b))[0]);
}
const mapPos = (x, y) => `left:${(x / MAP.size * 100).toFixed(2)}%;top:${((MAP.size - y) / MAP.size * 100).toFixed(2)}%`;
// Nom propre du lieu, quand il en a un (« Saline Quarry »), sinon rien
const placeTitle = m => /^(Cave|Cave Passage|Mine|Farm|Village|Camp|Flame .*|Elixir Well|Shroud Root)$/.test(m[1]) ? '' : ` « ${PLACES_FR.names[m[1]] || m[1]} »`;
// Intitulé d'un lieu : son nom propre s'il en a un, sinon le type de lieu (« Mine », « Grotte »…)
const placeLabel = m => { const t = placeTitle(m), g = MAP.groups[m[2]] || m[2]; return t ? (t.toLowerCase().includes(g.toLowerCase().split(' ')[0]) ? t.trim() : g + t) : g; };
// Le lieu contient-il vraiment la ressource (sa description la cite : « filons de… », « on y récolte… ») ?
// Sinon c'est un simple repère cité dans le texte « Où la trouver » (ex. « entre le camp et le tombeau »).
const isHere = (m, n) => m[5].includes(n.replace(/ \(\d+\)$/, '')) || (n === 'Spark' && /Flame (Shrine|Sanctum)/.test(m[2] + m[1]));
// Zone à fouiller autour des repères quand aucun lieu ne contient directement la ressource
function searchZone(n) {
  const pts = mapPoints(n);
  if (!pts.length || pts.length > 6 || pts.some(m => isHere(m, n))) return null;
  const cx = pts.reduce((t, m) => t + m[3], 0) / pts.length, cy = pts.reduce((t, m) => t + m[4], 0) / pts.length;
  const r = Math.max(260, ...pts.map(m => Math.hypot(m[3] - cx, m[4] - cy))) + 160;
  return { cx, cy, r };
}
function mapHtml(n, big) {
  const pts = mapPoints(n);
  if (!pts.length) return '';
  return `<div class="map ${big ? 'big' : ''}" ${big ? 'data-zoom' : `data-act="mapOpen" data-arg="${esc(n)}" title="Agrandir la carte"`}>
    <div class="map-in">
      <img src="img/map.jpg" alt="Carte de Valdebraise" draggable="false">
      ${MAP_REF.labels.map(([t, x, y]) => `<span class="map-reg" style="${mapPos(x, y)}">${esc(t)}</span>`).join('')}
      ${MAP_REF.shrines.map(s => `<span class="map-lm shrine" style="${mapPos(s[3], s[4])}" title="Mausolée de Flamme"></span>`).join('')}
      ${MAP_REF.spires.map(s => `<span class="map-lm spire" style="${mapPos(s[3], s[4])}" title="Tour des Anciens — ${esc(mapRegion(s))}"></span>`).join('')}
      ${(z => z ? `<svg class="map-zone" viewBox="0 0 ${MAP.size} ${MAP.size}" preserveAspectRatio="none"><circle cx="${z.cx.toFixed(0)}" cy="${(MAP.size - z.cy).toFixed(0)}" r="${z.r.toFixed(0)}"/></svg>
        <span class="map-reg zone-lbl" style="${mapPos(z.cx, z.cy - z.r * 0.75)}">Zone à fouiller</span>` : '')(searchZone(n))}
      ${pts.map((m, i) => `<span class="map-pt ${isHere(m, n) ? '' : 'rep'}" data-pt="${i}" style="${mapPos(m[3], m[4])}">${i + 1}<b>${esc(placeLabel(m))}</b></span>`).join('')}
    </div>
    ${big ? '<div class="map-zoom"><button class="btn sm" data-z="1.5" title="Zoomer">＋</button><button class="btn sm" data-z="0.667" title="Dézoomer">－</button><button class="btn sm" data-z="0" title="Voir tous les lieux">⤢</button></div>' : ''}
  </div>`;
}
function placesHtml(n) {
  const nm = matName(n);
  return `${searchZone(n) ? `<p class="small" style="margin:0 0 6px"><i class="gi gi-pin"></i> Ces lieux sont des <b>repères</b> cités par le wiki : ${esc(nm)} se trouve <b>dans la zone autour</b>, pas forcément dedans. Lis « Où la trouver » pour le détail.</p>` : ''}
    <ol class="map-legend">${mapPoints(n).map((m, i) => { const here = isHere(m, n);
    return `<li data-pt="${i}"><b class="map-n ${here ? '' : 'rep'}">${i + 1}</b><div><b>${esc(placeLabel(m))}</b><span class="muted"> · ${esc(mapRegion(m))}</span>
    <div class="small">${here ? `<span class="tag-here"><i class="gi gi-check-mark"></i> ${esc(nm)} ici</span>` : `<span class="tag-rep"><i class="gi gi-pin"></i> repère : ${esc(nm)} est dans les environs</span>`}</div>
    <div class="small muted">${esc(mapWhere(m))}${descFr(m[5]) ? '. ' + esc(descFr(m[5])) : ''}</div></div></li>`; }).join('')}</ol>
    <p class="small muted map-key"><i class="map-lm shrine"></i> mausolée de Flamme · <i class="map-lm spire"></i> tour des Anciens (aussi sur la carte du jeu)</p>`;
}
// Grande carte : zoom (molette, boutons) et déplacement (glisser) ; survol d'un lieu de la liste = point mis en évidence
function mapZoom(box, n, fitPts) {
  const map = box.querySelector('[data-zoom]'), inner = map.querySelector('.map-in'), pts = fitPts || mapPoints(n);
  let z = 1, tx = 0, ty = 0;
  const W = () => map.clientWidth;
  const apply = () => {
    z = Math.min(8, Math.max(1, z));
    tx = Math.min(0, Math.max(W() * (1 - z), tx)); ty = Math.min(0, Math.max(W() * (1 - z), ty));
    inner.style.transform = `translate(${tx}px,${ty}px) scale(${z})`; inner.style.setProperty('--z', z);
  };
  const zoomAt = (f, cx, cy) => { const nz = Math.min(8, Math.max(1, z * f)); tx = cx - (cx - tx) * nz / z; ty = cy - (cy - ty) * nz / z; z = nz; apply(); };
  const center = (x, y) => { tx = W() / 2 - x * W() * z; ty = W() / 2 - y * W() * z; apply(); };
  const fit = () => { // cadre tous les lieux de la ressource
    const xs = pts.map(m => m[3] / MAP.size), ys = pts.map(m => 1 - m[4] / MAP.size);
    z = Math.min(4, 1 / (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 0.15));
    center((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
  };
  map.addEventListener('wheel', e => { e.preventDefault(); const r = map.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null;
  map.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; drag = { x: e.clientX, y: e.clientY, tx, ty }; map.setPointerCapture(e.pointerId); map.classList.add('dragging'); });
  map.addEventListener('pointermove', e => { if (!drag) return; tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; apply(); });
  map.addEventListener('pointerup', () => { drag = null; map.classList.remove('dragging'); });
  map.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => { const f = Number(b.dataset.z); if (f) zoomAt(f, W() / 2, W() / 2); else fit(); }));
  const hl = (i, on) => box.querySelectorAll(`[data-pt="${i}"]`).forEach(x => x.classList.toggle('hl', on));
  box.querySelectorAll('.map-legend li').forEach(li => {
    li.addEventListener('mouseenter', () => hl(li.dataset.pt, true)); li.addEventListener('mouseleave', () => hl(li.dataset.pt, false));
    li.addEventListener('click', () => { const m = pts[li.dataset.pt]; z = Math.max(z, 4); center(m[3] / MAP.size, 1 - m[4] / MAP.size); });
  });
  requestAnimationFrame(fit);
}
// Fiche de la ressource avec sa grande carte ouverte (depuis l'overlay en jeu) ; la carte interactive si elle connaît la ressource
function openMapOf(n) {
  const cr = carteRes(n);
  if (cr) { state.carteFocus = cr.slug; return go('carte'); }
  if (!MAT[n]) return go('resources');
  go('resources', n);
  document.querySelectorAll('.map-modal').forEach(x => x.remove());
  if ((MAP.byMat[n] || []).length) ACTIONS.mapOpen(n);
}
ACTIONS.mapOpen = n => {
  const box = document.createElement('div');
  box.className = 'map-modal';
  box.innerHTML = `<div class="map-modal-in"><div class="row" style="justify-content:space-between;margin-bottom:8px"><b>${matIcon(n, 28)} ${esc(matName(n))} — sur la carte</b><span class="small muted">Molette : zoom · glisser : se déplacer · clic sur un lieu de la liste : y aller</span><button class="btn sm" data-close>Fermer ✕</button></div>
    <div class="map-wrap">${mapHtml(n, true)}<div class="map-side"><div class="card small" style="margin-bottom:8px"><i class="gi gi-position-marker"></i> ${whereText(n)}</div>${placesHtml(n)}</div></div></div>`;
  box.addEventListener('click', e => { if (e.target === box || e.target.closest('[data-close]')) box.remove(); });
  document.addEventListener('keydown', function esc2(e) { if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc2); } });
  document.body.appendChild(box);
  mapZoom(box, n);
};

// ---------- Carte interactive (carte.js) ----------
// Identifiant wikily d'une ressource (« Copper Ore » → « copper-ore ») et sa présence sur la carte (data/carte_res.js)
const slugOf = n => String(n).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CARTE_SLUG = Object.fromEntries(Object.keys(window.CARTE_RES || {}).map(s => [s.replace(/-/g, ''), s]));
const MAT_BY_SLUG = Object.fromEntries(Object.keys(MAT).flatMap(n => [[slugOf(n), n], [slugOf(n).replace(/-/g, ''), n]]));
function carteRes(n) {
  const s = slugOf(n), slug = CARTE_RES[s] ? s : CARTE_SLUG[s.replace(/-/g, '')];
  return slug ? { slug, n: CARTE_RES[slug][2], what: CARTE_RES[slug][0] === 'ore-veins' ? 'filons' : 'endroits' } : null;
}
state.carteFocus = null;
VIEWS.carte = () => `<div class="carte-wrap"><aside id="carteSide" class="carte-side"></aside><div id="carteMap" class="carte-map"></div></div>`;
AFTER.carte = () => {
  const focus = state.carteFocus; state.carteFocus = null;
  Carte.mount({ map: $('#carteMap'), side: $('#carteSide'), labels: MAP_REF.labels, focus,
    isDone: id => !!state.mapdone[id], matKey: s => MAT_BY_SLUG[s] || MAT_BY_SLUG[String(s).replace(/-/g, '')] || null });
};
ACTIONS.carteDone = id => {
  if (state.mapdone[id]) delete state.mapdone[id]; else state.mapdone[id] = 1;
  save(); Carte.setDone(id);
};
ACTIONS.carteOf = n => openMapOf(n);

// ---------- Ressources ----------
state.resFilter = { q: '', biome: '', type: '' };
const TYPE_FR = { 'Materials': 'Matériau', 'Material': 'Matériau', 'Consumables': 'Consommable', 'Terrain Materials': 'Terrain', 'Fishing Baits': 'Appât', 'Overgrowth Material': 'Végétation', 'Collectible': 'Collection', 'Tools': 'Outil' };
VIEWS.resources = () => {
  const f = state.resFilter; const nq = norm(f.q);
  const items = MATERIALS.filter(m => (!f.biome || m.b.includes(f.biome)) && (!f.type || TYPE_FR[m.ty] === f.type) && (!nq || norm((m.fr || '') + ' ' + m.n).includes(nq)));
  const sel = state.sel.mat && MAT[state.sel.mat] ? state.sel.mat : null;
  return `<h1><i class="gi gi-mining"></i> Ressources</h1><p class="sub">Où trouver chaque ressource, à quoi elle sert et comment la fabriquer.</p>
  <div class="split">
    <div class="card" style="padding:12px">
      <input id="rQ" type="search" class="search" placeholder="Fer, cuivre, résine…" value="${esc(f.q)}">
      <div class="row" style="margin:8px 0">
        <select id="rB"><option value="">Tous les biomes</option>${BIOMES.filter(b => b.res.length).map(b => `<option value="${b.id}" ${f.biome === b.id ? 'selected' : ''}>${esc(b.fr)}</option>`).join('')}</select>
        <select id="rT"><option value="">Tous les types</option>${[...new Set(Object.values(TYPE_FR))].map(t => `<option ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="muted small">${items.length} résultat(s)</div>
      <div class="list">${items.map(m => `<div class="li ${sel === m.n ? 'on' : ''}" data-act="selMat" data-arg="${esc(m.n)}"><span class="li-res">${matIcon(m.n, 28)}<span>${esc(m.fr || m.n)}${m.fr && m.fr !== m.n ? `<br><span class="en">${esc(m.n)}</span>` : ''}</span></span><span class="muted small">${m.b[0] ? esc(biomeFr(m.b[0])) : ''}</span></div>`).join('')}</div>
    </div>
    <div class="sticky">${sel ? matDetail(sel) : '<div class="card muted">Choisis une ressource dans la liste.</div>'}</div>
  </div>`;
};
// Ressources lâchées par des créatures (data/drops.js) : qui les lâche, où elles vivent, et la zone sur la carte
const REGION_EN_FR = r => REGION_FR[r] || biomeFr(r);
// Zone approximative d'une région : enveloppe des sanctuaires, flèches et repaires connus de la région, élargie
function regionZone(region) {
  const pts = MAP_REF.anchors.filter(a => a[2] === region).map(a => [a[0], a[1]]);
  if (!pts.length) return null;
  const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  if (pts.length < 3) return { circle: [cx, cy, 650], c: [cx, cy] };
  // enveloppe convexe (algorithme du ruban), puis chaque point écarté du centre de 350 unités
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1)).map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / d * 350, y + (y - cy) / d * 350]; });
  return { poly: hull, c: [cx, cy] };
}
function zoneMapHtml(regions, big) {
  const S = MAP.size, zones = regions.map(r => [r, regionZone(r)]).filter(z => z[1]);
  if (!zones.length) return '';
  const lm = MAP_REF.shrines.map(x => `<span class="map-lm shrine" style="${mapPos(x[3], x[4])}" title="Mausolée de Flamme"></span>`).join('')
    + MAP_REF.spires.map(x => `<span class="map-lm spire" style="${mapPos(x[3], x[4])}" title="Tour des Anciens — ${esc(mapRegion(x))}"></span>`).join('')
    + (big ? MAP_REF.labels.map(([t, x, y]) => `<span class="map-reg" style="${mapPos(x, y)}">${esc(t)}</span>`).join('') : '');
  const svg = zones.map(([r, z]) => (z.poly ? `<polygon points="${z.poly.map(([x, y]) => `${x.toFixed(0)},${(S - y).toFixed(0)}`).join(' ')}"/>`
    : `<circle cx="${z.circle[0].toFixed(0)}" cy="${(S - z.circle[1]).toFixed(0)}" r="${z.circle[2]}"/>`)).join('');
  return `<div class="map map-zones ${big ? 'big' : ''}" ${big ? 'data-zoom' : `data-act="zoneOpen" data-arg="${esc(regions.join('|'))}" title="Agrandir la carte"`}><div class="map-in"><img src="img/map.jpg" alt="Carte de Valdebraise" draggable="false">
    <svg class="map-zone" viewBox="0 0 ${S} ${S}" preserveAspectRatio="none">${svg}</svg>${lm}
    ${zones.map(([r, z]) => `<span class="map-reg zone-lbl" style="${mapPos(z.c[0], z.c[1])}">${esc(REGION_EN_FR(r).replace(/ \(.*\)$/, ''))}</span>`).join('')}</div>
    ${big ? '<div class="map-zoom"><button class="btn sm" data-z="1.5" title="Zoomer">＋</button><button class="btn sm" data-z="0.667" title="Dézoomer">－</button><button class="btn sm" data-z="0" title="Voir la zone">⤢</button></div>' : ''}</div>`;
}
// Grande carte d'une zone, avec zoom (molette) et déplacement, cadrée sur la zone
ACTIONS.zoneOpen = arg => {
  const regions = String(arg).split('|'), box = document.createElement('div');
  box.className = 'map-modal';
  box.innerHTML = `<div class="map-modal-in"><div class="row" style="justify-content:space-between;margin-bottom:8px"><b>Zone : ${regions.map(r => esc(REGION_EN_FR(r))).join(', ')}</b><span class="small muted">Molette : zoom · glisser : se déplacer</span><button class="btn sm" data-close>Fermer ✕</button></div>
    <div class="map-wrap">${zoneMapHtml(regions, true)}<div class="map-side small"><p class="map-key"><i class="map-lm shrine"></i> mausolée de Flamme · <i class="map-lm spire"></i> tour des Anciens (visibles aussi sur la carte du jeu)</p>
    <p class="muted">La zone bleue est approximative : elle regroupe les lieux connus de la région. Les créatures se promènent dedans, souvent près de l'eau, des grottes ou des camps selon leur espèce.</p></div></div></div>`;
  box.addEventListener('click', e => { if (e.target === box || e.target.closest('[data-close]')) box.remove(); });
  document.addEventListener('keydown', function esc2(e) { if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc2); } });
  document.body.appendChild(box);
  const fit = regions.flatMap(r => { const z = regionZone(r); return z ? (z.poly || [[z.circle[0] - z.circle[2], z.circle[1] - z.circle[2]], [z.circle[0] + z.circle[2], z.circle[1] + z.circle[2]]]) : []; }).map(([x, y]) => [0, 0, 0, x, y]);
  mapZoom(box, null, fit);
};
function dropsHtml(n, title = '<i class="gi gi-paw-print"></i> Lâché par') {
  const list = DROPS[n];
  if (!list) return '';
  const regions = [...new Set(list.flatMap(([w]) => (CREATURES[w] || { r: [] }).r))];
  return `<div><h3>${title}</h3>
    <ul class="drops">${list.map(([w, q]) => { const c = CREATURES[w] || { fr: w, r: [], h: '' };
      return `<li><b>${esc(c.fr)}</b> <span class="muted small">(${esc(w)}${q ? ` · ${esc(q)} par créature` : ''})</span>
        ${c.r.length ? `<div>${c.r.map(r => `<span class="chip">${esc(REGION_EN_FR(r))}</span>`).join('')}</div>` : ''}
        ${c.h ? `<div class="small muted">${esc(c.h)}</div>` : ''}</li>`; }).join('')}</ul>
    ${regions.length && regions.length <= 4 ? `<div class="small muted" style="margin:6px 0 4px">Zone où les trouver (approximative) — clic pour agrandir et zoomer :</div>${zoneMapHtml(regions)}<p class="small muted map-key"><i class="map-lm shrine"></i> mausolée de Flamme · <i class="map-lm spire"></i> tour des Anciens</p>` : ''}</div>`;
}

function matDetail(n) {
  const m = MAT[n]; const r = recipe(n); const used = (USED_IN[n] || []).slice().sort();
  const inList = state.list[n];
  return `<div class="card stack">
    <div class="row" style="justify-content:space-between"><div class="row" style="flex-wrap:nowrap">${matIcon(n, 64)}<div><h1 style="font-size:22px">${esc(m.fr || m.n)}</h1><div class="muted small">${esc(m.n)} · ${esc(TYPE_FR[m.ty] || m.ty)}${m.lv ? ' · niveau ' + m.lv : ''} · ${esc(m.ra)}</div></div></div>
      <div class="row"><input type="number" id="addQty" min="1" value="${inList ? inList.need : 10}"><button class="btn pri" data-act="addList" data-arg="${esc(n)}">${inList ? 'Mettre à jour' : 'Ajouter à ma liste'}</button></div></div>
    ${m.b.length ? `<div>${m.b.map(b => `<a class="chip b" style="background:${BIOME[b] ? BIOME[b].color : '#888'}" data-go="biomes">${esc(biomeFr(b))}</a>`).join('')}</div>` : ''}
    ${(cr => cr ? `<button class="btn pri carte-btn" data-act="carteOf" data-arg="${esc(n)}"><i class="gi gi-treasure-map"></i> Voir les ${cr.n} ${cr.what} sur la carte interactive</button>` : '')(carteRes(n))}
    <div><h3><i class="gi gi-position-marker"></i> Où la trouver</h3><p style="margin:0">${DROPS[n] && !m.o && !m.oe && !recipe(n) ? 'Sur des créatures : voir ci-dessous.' : whereText(n)}</p></div>
    ${DROPS[n] ? dropsHtml(n) : r ? r[1].filter(([i]) => DROPS[i] && !(MAP.byMat[i] || []).length && !RECIPES[i]).map(([i]) => dropsHtml(i, `<i class="gi gi-paw-print"></i> ${esc(matName(i))} : lâché par`)).join('') : ''}
    ${(MAP.byMat[n] || []).length ? `<div><h3><i class="gi gi-treasure-map"></i> ${mapPoints(n).some(m => isHere(m, n)) ? 'Sur la carte' : 'Repères sur la carte'} <span class="muted small">— clic pour agrandir et zoomer</span></h3>${mapHtml(n)}<div class="small" style="margin-top:6px">${placesHtml(n)}</div></div>`
      : DROPS[n] ? '' : `<p class="small muted" style="margin:0"><i class="gi gi-treasure-map"></i> Pas de lieu précis sur la carte pour cette ressource${m.b.length ? ' : cherche-la dans ' + m.b.map(biomeFr).map(esc).join(', ') : ''}.</p>`}
    ${m.d ? `<p class="muted small" style="margin:0"><i>« ${esc(m.d)} »</i></p>` : ''}
    ${m.oe && m.o ? `<details><summary class="small muted">▸ Texte original du wiki (anglais)</summary><p class="small muted" style="white-space:pre-line">${esc(m.oe)}</p></details>` : ''}
    ${r ? `<div><h3><i class="gi gi-hammer-drop"></i> Fabrication</h3>${RECIPES[n].map(v => `<div>${recipeLine(n, v)}</div>`).join('')} <a data-go="craft|${esc(n)}">→ calculateur</a></div>` : ''}
    ${used.length ? `<div><h3><i class="gi gi-jigsaw-piece"></i> Sert à fabriquer (${used.length})</h3><div class="small" style="max-height:260px;overflow:auto">${used.map(p => `<a class="chip" data-go="craft|${esc(p)}">${esc(matName(p))}</a>`).join('')}</div></div>` : ''}
  </div>`;
}
const recipeLine = (n, r = recipe(n)) => { return `<span>${r[0] > 1 ? `<b>${r[0]}×</b> ` : ''}= ${r[1].map(([i, q]) => `<span class="qty">${q}×</span> ${MAT[i] ? `<a data-go="resources|${esc(i)}">${esc(matName(i))}</a>` : RECIPES[i] ? `<a data-go="craft|${esc(i)}">${esc(matName(i))}</a>` : esc(matName(i))}`).join(' + ')} <span class="st">${r[2].length ? '— ' + r[2].map(station).map(esc).join(' / ') : ''}</span></span>`; };
ACTIONS.selMat = n => { state.sel.mat = n; render(); };
ACTIONS.addList = n => { const q = Math.max(1, Number($('#addQty').value) || 1); state.list[n] = { need: q, have: state.list[n] ? state.list[n].have : 0 }; toast(`${matName(n)} ×${q} ajouté à ta liste`); render(); };
AFTER.resources = () => {
  const q = $('#rQ'); q.addEventListener('input', () => { state.resFilter.q = q.value; render(); const n = $('#rQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
  $('#rB').addEventListener('change', e => { state.resFilter.biome = e.target.value; render(); });
  $('#rT').addEventListener('change', e => { state.resFilter.type = e.target.value; render(); });
  const on = $('.li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
};

// ---------- Calculateur de craft ----------
function breakdown(n, qty, stop, depth = 0, seen = new Set()) {
  const r = recipe(n);
  if (!r || (depth > 0 && stop(n)) || depth > 8 || seen.has(n) || /^Any /.test(n)) return { n, qty, raw: true };
  const crafts = Math.ceil(qty / r[0]);
  const s2 = new Set(seen); s2.add(n);
  return { n, qty, crafts, made: crafts * r[0], st: r[2], kids: r[1].map(([i, q]) => breakdown(i, q * crafts, stop, depth + 1, s2)) };
}
function collectRaw(node, acc = {}) {
  if (node.raw) acc[node.n] = (acc[node.n] || 0) + node.qty; else node.kids.forEach(k => collectRaw(k, acc));
  return acc;
}
function treeHtml(node, root) {
  const label = MAT[node.n] ? `<a data-go="resources|${esc(node.n)}">${esc(matName(node.n))}</a>` : esc(matName(node.n));
  if (node.raw) return `<li><span class="qty">${node.qty}×</span> ${label} ${RECIPES[node.n] && !/^Any /.test(node.n) ? `<button class="btn sm ghost" data-act="toggleStop" data-arg="${esc(node.n)}" title="Décomposer">＋ décomposer</button>` : ''}</li>`;
  return `<li><span class="qty">${node.qty}×</span> <b>${label}</b> <span class="st">(${node.crafts} fabrication${node.crafts > 1 ? 's' : ''}${node.made !== node.qty ? `, donne ${node.made}` : ''}${node.st.length ? ' · ' + node.st.map(station).map(esc).join(' / ') : ''})</span>
    ${!root ? `<button class="btn sm ghost" data-act="toggleStop" data-arg="${esc(node.n)}" title="Je l'ai déjà / ne pas décomposer">✓ je l'ai</button>` : ''}
    <ul>${node.kids.map(k => treeHtml(k)).join('')}</ul></li>`;
}
VIEWS.craft = () => {
  const p = state.sel.prod && RECIPES[state.sel.prod] ? state.sel.prod : null;
  let res = '';
  if (p) {
    const tree = breakdown(p, state.craftQty * recipe(p)[0], isStopped);
    const raw = collectRaw(tree);
    const rows = Object.entries(raw).sort((a, b) => b[1] - a[1]);
    res = `<div class="grid2">
      <div class="card"><h3>Arbre de fabrication</h3><div class="tree small"><ul>${treeHtml(tree, true)}</ul></div>
        <p class="small muted">« ✓ je l'ai » : n'est plus décomposé (tu as déjà ces intermédiaires). ${Object.keys(state.craftStop).length ? `<a data-act="resetStop">Tout redécomposer</a>` : ''}</p></div>
      <div class="card"><div class="row" style="justify-content:space-between"><h3>Ressources de base à récolter</h3><button class="btn pri sm" data-act="addAllRaw">Tout ajouter à ma liste</button></div>
        <table><tr><th>Qté</th><th>Ressource</th><th>Où</th></tr>${rows.map(([n, q]) => `<tr><td class="qty">${q}</td><td>${MAT[n] ? `<a data-go="resources|${esc(n)}">${esc(matName(n))}</a>` : esc(matName(n))}</td><td class="small muted">${MAT[n] ? whereText(n) : (/^Any /.test(n) ? 'Au choix (n\'importe quel type).' : '')}</td></tr>`).join('')}</table></div>
    </div>`;
    state._raw = raw;
  }
  return `<h1><i class="gi gi-hammer-drop"></i> Calculateur de craft</h1><p class="sub">Choisis un objet : je le décompose jusqu'aux ressources de base et je te dis où les farmer.</p>
  <div class="card" style="margin-bottom:14px">
    <div class="row"><input id="cQ" type="search" class="search" style="flex:1" placeholder="Rechercher un objet à fabriquer (ex : Bronze, Iron Bars, arc, potion…)"></div>
    <div id="cRes" class="small" style="margin-top:8px"></div>
    ${p ? `<div class="row" style="margin-top:12px"><span style="font-size:18px;font-weight:700">${esc(matName(p))}</span> ${MAT[p] && MAT[p].fr ? `<span class="muted small">${esc(p)}</span>` : ''}
      <label class="row">Quantité voulue <input type="number" min="1" id="cN" value="${state.craftQty}"></label>
      ${RECIPES[p].length > 1 ? `<label class="row small">Recette <select id="cV">${RECIPES[p].map((v, i) => `<option value="${i}" ${recipe(p) === v ? 'selected' : ''}>${esc(v[2].map(station).join(' / ') || 'Variante ' + (i + 1))} — donne ${v[0]}</option>`).join('')}</select></label>` : ''}
      <span class="muted small">Recette : ${recipeLine(p)}</span></div>` : ''}
  </div>${res}`;
};
AFTER.craft = () => {
  const q = $('#cQ');
  q.addEventListener('input', () => {
    const r = find(q.value, ['mat', 'prod'], 40).filter(x => RECIPES[x.key]);
    $('#cRes').innerHTML = r.length ? r.map(x => `<a class="chip" data-go="craft|${esc(x.key)}">${esc(x.label)}${x.label !== x.en ? ` <span class="muted">(${esc(x.en)})</span>` : ''}</a>`).join('') : (q.value ? '<span class="muted">Aucune recette trouvée.</span>' : '');
  });
  const v = $('#cV'); if (v) v.addEventListener('change', () => { state.variant[state.sel.prod] = Number(v.value); render(); });
  const n = $('#cN'); if (n) n.addEventListener('change', () => { state.craftQty = Math.max(1, Number(n.value) || 1); render(); });
};
ACTIONS.toggleStop = n => { state.craftStop[n] = !isStopped(n); render(); };
ACTIONS.resetStop = () => { state.craftStop = {}; render(); };
ACTIONS.addAllRaw = () => {
  for (const [n, q] of Object.entries(state._raw || {})) { const e = state.list[n]; state.list[n] = { need: (e ? e.need : 0) + q, have: e ? e.have : 0 }; }
  toast('Ressources ajoutées à ta liste de farm'); save();
};

// ---------- Liste de farm ----------
VIEWS.list = () => {
  const items = Object.entries(state.list);
  if (!items.length) return `<h1><i class="gi gi-scroll-unfurled"></i> Ma liste de farm</h1><div class="card"><p>Ta liste est vide.</p><p class="muted">Ajoute des ressources depuis <a data-go="resources">Ressources</a>, le <a data-go="craft">Calculateur de craft</a> ou les <a data-go="flame">Niveaux de Flamme</a>.</p></div>`;
  // Regroupe par biome pour organiser les sorties de farm
  const groups = {};
  for (const [n, v] of items) { const b = (MAT[n] && MAT[n].b[0]) || 'Autre'; (groups[b] = groups[b] || []).push([n, v]); }
  const order = [...BIOMES.map(b => b.id), 'Autre'].filter(b => groups[b]);
  const done = items.filter(([, v]) => v.have >= v.need).length;
  return `<h1><i class="gi gi-scroll-unfurled"></i> Ma liste de farm</h1><p class="sub">${done}/${items.length} terminées. Regroupée par biome pour optimiser tes sorties.</p>
  <div class="row" style="margin-bottom:12px"><button class="btn" data-act="clearDone">Retirer les terminées</button><button class="btn ghost" data-act="clearList">Vider la liste</button></div>
  ${order.map(b => `<h2>${b === 'Autre' ? 'Partout / à fabriquer' : esc(biomeFr(b))}</h2><div class="card" style="padding:6px 12px"><table>
    <tr><th></th><th>Ressource</th><th>J'ai / besoin</th><th>Où la trouver</th><th></th></tr>
    ${groups[b].map(([n, v]) => `<tr class="${v.have >= v.need ? 'done' : ''}">
      <td><input type="checkbox" class="check" data-act="tick" data-arg="${esc(n)}" ${v.have >= v.need ? 'checked' : ''}></td>
      <td><a data-go="resources|${esc(n)}">${esc(matName(n))}</a></td>
      <td style="white-space:nowrap"><input type="number" min="0" value="${v.have}" data-have="${esc(n)}" style="width:70px"> / ${v.need}</td>
      <td class="small muted">${MAT[n] ? whereText(n) : ''}</td>
      <td><button class="btn sm ghost" data-act="rmList" data-arg="${esc(n)}">✕</button></td></tr>`).join('')}
  </table></div>`).join('')}`;
};
AFTER.list = () => document.querySelectorAll('[data-have]').forEach(i => i.addEventListener('change', () => { state.list[i.dataset.have].have = Math.max(0, Number(i.value) || 0); render(); }));
ACTIONS.tick = n => { const v = state.list[n]; v.have = v.have >= v.need ? 0 : v.need; render(); };
ACTIONS.rmList = n => { delete state.list[n]; render(); };
ACTIONS.clearDone = () => { for (const [n, v] of Object.entries(state.list)) if (v.have >= v.need) delete state.list[n]; render(); };
ACTIONS.clearList = () => { if (confirm('Vider toute la liste de farm ?')) { state.list = {}; render(); } };

// ---------- Flamme ----------
VIEWS.flame = () => `<h1><i class="gi gi-fire-silhouette"></i> Niveaux de Flamme</h1>
  <p class="sub">Monter la Flamme à l'autel est LA progression principale : chaque niveau donne +1 à tous les attributs, +1 minute dans la Brume et te permet de traverser la Brume rouge (plus dangereuse) du niveau suivant.</p>
  <div class="card row" style="margin-bottom:14px">Mon niveau de Flamme actuel :
    <select id="fLv">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => `<option ${state.flame === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <span class="muted small">Les Étincelles se récupèrent dans les Mausolées de Flamme. Il faut aussi des survivants (artisans) sauvés.</span></div>
  <div class="note" style="margin-bottom:14px">Version 1.0 : de nouveaux niveaux de Flamme pour les îles flottantes de fin de jeu ont été ajoutés ; ils ne sont pas encore documentés sur le wiki.</div>
  <div class="stack">${FLAME.map(f => {
    const next = f.lv === state.flame + 1, past = f.lv <= state.flame;
    return `<div class="card ${next ? 'bd-Core' : ''}" style="${past ? 'opacity:.55' : ''}">
      <div class="row" style="justify-content:space-between"><h3>${past ? '<i class="gi gi-check-mark"></i>' : next ? '👉' : '<i class="gi gi-padlock"></i>'} Flamme niveau ${f.lv} ${next ? '<span class="chip" style="color:var(--flame2)">prochain objectif</span>' : ''}</h3>
        <span class="muted small">+${f.attr} attributs au total · Brume ${f.time} · ${f.surv} survivants requis</span></div>
      <table>${Object.entries(f.need).map(([n, q]) => `<tr><td class="qty" style="width:50px">${q}</td><td style="width:240px"><a data-go="resources|${esc(n)}">${esc(matName(n))}</a></td><td class="small muted">${MAT[n] ? whereText(n) : ''}</td></tr>`).join('')}</table>
      ${!past ? `<button class="btn ${next ? 'pri' : ''} sm" style="margin-top:8px" data-act="flameList" data-arg="${f.lv}">Ajouter à ma liste de farm</button>` : ''}
    </div>`;
  }).join('')}</div>`;
AFTER.flame = () => { const s = $('#fLv'); if (s) s.addEventListener('change', e => { state.flame = Number(e.target.value); render(); }); };
ACTIONS.flameList = lv => {
  const f = FLAME.find(x => x.lv === Number(lv));
  for (const [n, q] of Object.entries(f.need)) { const e = state.list[n]; state.list[n] = { need: Math.max(q, e ? e.need : 0), have: e ? e.have : 0 }; }
  toast(`Ressources de la Flamme ${lv} ajoutées`); save();
};

// ---------- Biomes ----------
VIEWS.biomes = () => `<h1><i class="gi gi-treasure-map"></i> Biomes</h1><p class="sub">Dans l'ordre de progression conseillé. Clique une ressource pour savoir où la trouver.</p>
  <div class="stack">${BIOMES.map((b, i) => `<div class="card" style="border-left:4px solid ${b.color}">
    <div class="row" style="justify-content:space-between"><h3 style="font-size:18px">${i + 1}. ${esc(b.fr)} ${b.fr !== b.id && b.id !== 'Sky' ? `<span class="muted small">(${esc(b.id)})</span>` : ''}</h3>
      <div><span class="chip">Niveau ${esc(b.lv)}</span><span class="chip">Flamme ${esc(b.flame)}</span></div></div>
    <p>${esc(b.desc)}</p>
    ${b.res.length ? `<div class="small"><b>Ressources clés :</b> ${b.res.map(matLink).join('')}</div>` : ''}
    <p class="small"><b>Ennemis :</b> ${esc(b.enemies)}</p>
    <p class="small" style="margin:0"><b><i class="gi gi-light-bulb"></i> Conseil :</b> ${esc(b.tips)}</p>
  </div>`).join('')}</div>`;

// ---------- Astuces ----------
VIEWS.tips = () => `<h1><i class="gi gi-light-bulb"></i> Astuces débutant</h1><p class="sub">L'essentiel pour bien démarrer.</p>
  <div class="grid">${TIPS.map(t => `<div class="card"><h3>${esc(t.t)}</h3><p class="small" style="margin:0;color:var(--fg2)">${esc(t.d)}</p></div>`).join('')}</div>`;

// ---------- Assistant (questions en langage naturel, hors-ligne) ----------
const STOP = new Set('ou est trouve trouver je peux puis on comment faire fabriquer crafter craft farmer farm recuperer obtenir avoir du de des la le les un une pour mon ma mes quel quelle quels quelles est ce que qu il faut besoin dans a au aux en recette trouve se avec sur c quoi sert utilise utiliser competence competences skill skills build arbre spe specialisation conseil conseille meilleur meilleure moi jouer joue niveau me te veux voudrais aimerais et ou'.split(' '));
const STYLE_WORDS = {
  bow: ['arc', 'archer', 'fleche', 'fleches', 'distance', 'ranger', 'rodeur'], dagger: ['dague', 'dagues', 'assassin', 'couteau'],
  stealth: ['furtif', 'furtivite', 'discret', 'infiltration'], '2h': ['deux mains', '2 mains', 'espadon', 'marteau', 'barbare', 'grosse arme'],
  '1h': ['bouclier', 'epee', 'une main', '1 main'], tank: ['tank', 'encaisser', 'defense', 'solide', 'gardien'], heal: ['soin', 'soigner', 'healer', 'heal', 'soigneur', 'guerisseur', 'support'],
  wand: ['baguette'], staff: ['baton', 'sort', 'sorts', 'feu', 'glace', 'foudre', 'sorcier'], magic: ['mage', 'magie', 'magique'],
  explore: ['explorer', 'exploration', 'planeur', 'saut', 'courir', 'deplacement', 'brume'], gather: ['recolte', 'recolter', 'bucheron', 'miner', 'minage', 'farm', 'farmer', 'bois', 'pierre'],
  melee: ['corps a corps', 'melee', 'cac', 'guerrier']
};
function detectStyles(nq) { return Object.entries(STYLE_WORDS).filter(([, ws]) => ws.some(w => (' ' + nq).includes(' ' + w))).map(([k]) => k); }
function answer(q) {
  const nq = norm(q);
  const has = (...ws) => ws.some(w => (' ' + nq + ' ').includes(' ' + w));
  // Flamme
  const fm = nq.match(/flamme\D*(\d+)/);
  if (has('flamme', 'autel') && fm) {
    const f = FLAME.find(x => x.lv === Number(fm[1]));
    if (f) return `<p><b>Pour la Flamme niveau ${f.lv}</b> il te faut ${f.surv} survivants et :</p><p>${Object.entries(f.need).map(([n, c]) => `${c}× ${matLink(n)}`).join(' ')}</p><p><a data-act="flameList" data-arg="${f.lv}">+ Tout ajouter à ma liste de farm</a> · <a data-go="flame">Voir tous les niveaux</a></p>`;
  }
  if (has('flamme', 'autel')) return `<p>La Flamme se monte à l'autel avec des Étincelles et des ressources de chaque biome. Chaque niveau donne +1 à tous tes attributs et plus de temps dans la Brume.</p><p><a data-go="flame">→ Voir ce qu'il faut pour chaque niveau</a></p>`;
  // Points de compétence / respec
  if (has('point', 'points') && has('competence', 'skill')) return `<p>${esc(TIPS[0].d)}</p><p><a data-go="planner">→ Calculer mes points dans le planificateur</a></p>`;
  if (has('reinitialis', 'respec', 'reset', 'remettre')) return `<p>${esc(TIPS[1].d)}</p>`;
  // Biome
  const bio = BIOMES.find(b => nq.includes(norm(b.fr)) || nq.includes(norm(b.id)));
  if (bio && !has('trouver', 'ou ')) return `<p><b>${esc(bio.fr)}</b> — niveau ${esc(bio.lv)}, Flamme ${esc(bio.flame)}.</p><p>${esc(bio.desc)}</p>${bio.res.length ? `<p>Ressources clés : ${bio.res.map(matLink).join('')}</p>` : ''}<p><i class="gi gi-light-bulb"></i> ${esc(bio.tips)}</p>`;
  // Build / compétences
  const styles = detectStyles(nq);
  const wantsSkill = has('competence', 'skill', 'build', 'arbre', 'spe', 'specialis', 'quoi prendre', 'stat', 'jouer', 'style', 'classe');
  const craftIntent = has('fabriquer', 'craft', 'recette', 'faire', 'construire', 'forger', 'cuisiner');
  const findIntent = has('trouver', 'trouve', 'farm', 'recolt', 'obtenir', 'avoir', 'recuper', 'ou ');
  const words = nq.split(' ').filter(w => !STOP.has(w));
  const query = words.join(' ');
  const hits = query ? find(query, ['mat', 'prod', 'skill'], 8) : [];
  // Préfère la ressource brute quand on demande « où trouver », l'objet fabriqué quand on demande « comment faire »
  if (hits.length) hits.forEach(x => { if (x.kind !== 'skill') x.sc += (findIntent && !RECIPES[x.key] ? 6 : 0) + (craftIntent && RECIPES[x.key] ? 6 : 0); });
  hits.sort((a, b) => b.sc - a.sc);
  const strongHit = hits.length && hits[0].sc >= 45;
  if (wantsSkill || (styles.length && !findIntent && !craftIntent && !strongHit)) {
    if (!styles.length) return `<p>Pour te conseiller un build, le plus simple est de répondre à mon <a data-go="quiz">questionnaire (7 questions)</a>. Tu peux aussi me demander par exemple « build arc », « compétences tank », « build soigneur coop ».</p><p>Builds disponibles : ${BUILDS.map(b => `<a data-act="openBuild" data-arg="${b.id}">${bIco(b)} ${esc(b.name.split(' —')[0])}</a>`).join(' · ')}</p>`;
    const sc = BUILDS.map(b => ({ b, s: styles.filter(t => b.tags.includes(t)).length })).sort((a, b) => b.s - a.s);
    const b = sc[0].s ? sc[0].b : null;
    const top = SKILLS.filter(s => styles.some(t => s.tags.includes(t))).sort((a, c) => c.p - a.p).slice(0, 8);
    return `${b ? `<p>Pour ce style, je te conseille le build <b>${bIco(b)} ${esc(b.name)}</b> : ${esc(b.pitch)}</p><p><b>Stats :</b> ${esc(b.stats)}</p><p><b>Premières compétences :</b> ${b.skills.slice(0, 8).map(skChip).join('')}</p><p><a data-act="applyBuild" data-arg="${b.id}">+ Charger ce build dans mon arbre</a> · <a data-act="openBuild" data-arg="${b.id}">Voir le détail</a></p>` : ''}
      <p><b>Compétences liées (${styles.map(s => TAGS_FR[s]).join(', ')}) :</b></p><ul>${top.map(s => `<li><b>${esc(s.fr)}</b> — ${esc(s.d)}</li>`).join('')}</ul>`;
  }
  // Ressource / craft
  if (!hits.length) return `<p>Je n'ai pas trouvé 🤔. Essaie par exemple :</p><ul><li>« où trouver du minerai de fer »</li><li>« comment fabriquer des barres de bronze »</li><li>« build arc » ou « compétences tank »</li><li>« que faut-il pour la flamme 5 »</li><li>« Bois envoûtés »</li></ul>`;
  const h = hits[0];
  if (h.kind === 'skill') { const s = SK[h.key]; return `<p><b>${esc(s.fr)}</b> <span class="muted">(${esc(s.n)}, ${esc(ARCH_FR[s.a[0]] || s.a[0])}, ${s.c} pt${s.c > 1 ? 's' : ''}${s.r > 1 ? '/rang, ' + s.r + ' rangs' : ''})</span></p><p>${esc(s.d)}</p><p><a data-go="planner">→ Ouvrir l'arbre de compétences</a></p>`; }
  let out = '';
  if (MAT[h.key] && !craftIntent) {
    out = `<p><b>${esc(matName(h.key))}</b> ${MAT[h.key].fr ? `<span class="muted">(${esc(h.key)})</span>` : ''}</p><p><i class="gi gi-position-marker"></i> ${whereText(h.key)}</p>${RECIPES[h.key] ? `<p><i class="gi gi-hammer-drop"></i> ${recipeLine(h.key)}</p>` : ''}<p><a data-go="resources|${esc(h.key)}">Fiche complète</a>${RECIPES[h.key] ? ` · <a data-go="craft|${esc(h.key)}">Calculer le craft</a>` : ''}</p>`;
  } else if (RECIPES[h.key]) {
    const raw = collectRaw(breakdown(h.key, recipe(h.key)[0], isStopped));
    out = `<p><b>${esc(matName(h.key))}</b> se fabrique ainsi :</p><p>${recipeLine(h.key)}</p><p>Ressources de base pour 1 fabrication : ${Object.entries(raw).map(([n, c]) => `${c}× ${MAT[n] ? matLink(n) : esc(matName(n))}`).join(' ')}</p><p class="small muted">(pour ${recipe(h.key)[0]} unité${recipe(h.key)[0] > 1 ? 's' : ''}${RECIPES[h.key].length > 1 ? ', recette ' + esc(recipe(h.key)[2].map(station).join(' / ')) + ' — autres variantes dans le calculateur' : ''})</p><p><a data-go="craft|${esc(h.key)}">→ Ouvrir dans le calculateur</a></p>`;
  } else out = `<p><b>${esc(h.label)}</b></p><p><i class="gi gi-position-marker"></i> ${whereText(h.key)}</p>`;
  if (hits.length > 1) out += `<p class="small muted">Tu cherchais peut-être : ${hits.slice(1, 6).map(x => x.kind === 'skill' ? esc(x.label) : `<a data-go="${MAT[x.key] ? 'resources' : 'craft'}|${esc(x.key)}">${esc(x.label)}</a>`).join(' · ')}</p>`;
  return out;
}
ACTIONS.openBuild = id => { state.openBuild = id; go('builds'); };
VIEWS.assistant = () => {
  if (!state.chat.length) state.chat.push({ bot: `<p>Salut ! Pose-moi tes questions sur Enshrouded 👋</p><p>Je sais répondre à : <b>où trouver</b> une ressource, <b>comment fabriquer</b> un objet, quelles <b>compétences / quel build</b> pour ton style, ce qu'il faut pour un <b>niveau de Flamme</b>, et des infos sur les <b>biomes</b>.</p>` });
  const sugg = ['Où trouver du minerai de fer ?', 'Comment fabriquer des barres de bronze ?', 'Build arc', 'Compétences pour tanker', 'Que faut-il pour la flamme 4 ?', 'Je veux jouer soigneur en coop', 'Où trouver de la résine ?', 'Plateaux nomades'];
  return `<h1><i class="gi gi-talk"></i> Assistant</h1>
  <div class="chat card">
    <div class="msgs" id="msgs">${state.chat.map(m => m.me ? `<div class="msg me">${esc(m.me)}</div>` : `<div class="msg bot">${m.bot}</div>`).join('')}</div>
    <div class="row small" style="margin-top:10px">${sugg.map(s => `<a class="chip" data-act="ask" data-arg="${esc(s)}">${esc(s)}</a>`).join('')}</div>
    <div class="composer"><input id="chatIn" placeholder="Écris ta question…" autocomplete="off"><button class="btn pri" data-act="send">Envoyer</button></div>
  </div>`;
};
ACTIONS.ask = q => { state.chat.push({ me: q }, { bot: answer(q) }); render(); };
ACTIONS.send = () => { const i = $('#chatIn'); const q = i.value.trim(); if (q) ACTIONS.ask(q); };
AFTER.assistant = () => { const m = $('#msgs'); m.scrollTop = m.scrollHeight; const i = $('#chatIn'); i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') ACTIONS.send(); }); };

// ---------- Démarrage ----------
// ---------- Mon compte ----------
VIEWS.account = () => `<h1><i class="gi gi-person"></i> Mon compte</h1>
  <p class="sub">Connecté en tant que <b>${esc(srv.user.username)}</b>${srv.user.admin ? ' (administrateur)' : ''}. Tes builds, ta liste de farm et ta progression sont enregistrés sur le serveur de la maison.</p>
  <div class="grid2">
    <form class="card stack" id="pwForm">
      <h3>Changer mon mot de passe</h3>
      <input type="text" autocomplete="username" value="${esc(srv.user.username)}" hidden>
      <label class="field">Mot de passe actuel<input type="password" id="pwCur" autocomplete="current-password" required></label>
      <label class="field">Nouveau mot de passe<input type="password" id="pwNext" autocomplete="new-password" minlength="8" required></label>
      <label class="field">Confirme le nouveau<input type="password" id="pwNext2" autocomplete="new-password" minlength="8" required></label>
      <div id="pwErr" class="err" hidden></div>
      <div class="row"><button class="btn pri" type="submit">Enregistrer</button></div>
      <p class="small muted">Tes autres appareils seront déconnectés.</p>
    </form>
    <div class="stack">
      <div class="card stack"><h3>Copie de mes données</h3>
        <p class="small muted">Télécharge une copie de tes données (build, liste de farm…) ou restaure une copie.</p>
        <div class="row"><button class="btn" data-act="exportData">Exporter</button><label class="btn">Importer<input type="file" id="importFile" accept=".json,application/json" hidden></label></div></div>
      <div class="card stack"><h3><i class="gi gi-pc"></i> Application Windows</h3>
        <p class="small muted">Le Compagnon dans sa propre fenêtre, avec un overlay discret par-dessus le jeu (mémos, liste de farm, Flamme, build) qui s'affiche tout seul quand Enshrouded se lance.</p>
        <div class="row"><a class="btn pri" href="/downloads/CompagnonEnshrouded.zip" download>Télécharger (≈ 1 Mo)</a></div>
        <p class="small muted">Décompresse le zip, lance <b>CompagnonEnshrouded.exe</b> et accepte l'installation. Windows peut afficher « éditeur inconnu » : clique sur « Informations complémentaires » puis « Exécuter quand même ».</p></div>
      <div class="card stack"><h3>Session</h3><div class="row"><button class="btn" data-act="logout">Se déconnecter</button></div></div>
    </div>
  </div>`;
AFTER.account = () => {
  $('#importFile').addEventListener('change', ACTIONS.importData);
  $('#pwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#pwErr'); err.hidden = true;
    if ($('#pwNext').value !== $('#pwNext2').value) { err.textContent = 'Les deux nouveaux mots de passe ne sont pas identiques.'; err.hidden = false; return; }
    try { await apiCall('POST', '/api/password', { current: $('#pwCur').value, next: $('#pwNext').value }); toast('Mot de passe changé'); render(); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
  });
};
ACTIONS.logout = async () => { if (srv.pending) await pushState(); await apiCall('POST', '/api/logout').catch(() => {}); location.replace('/login.html'); };
ACTIONS.exportData = () => {
  const blob = new Blob([JSON.stringify({ app: 'compagnon-enshrouded', date: new Date().toISOString(), data: JSON.parse(syncPayload()) }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `compagnon-${srv.user ? srv.user.username : 'local'}-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
ACTIONS.importData = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()); const d = j.data || j;
    if (!confirm('Remplacer tes données actuelles par celles du fichier ?')) return;
    SYNC_KEYS.forEach(k => { if (d[k] !== undefined) state[k] = d[k]; });
    toast('Données importées'); render();
  } catch { toast('⚠️ Fichier illisible'); }
};

// ---------- Administration ----------
const inviteMessage = c => (c.reset
  ? `Salut ! <i class="gi gi-fire-silhouette"></i>\n\nJ'ai réinitialisé ton mot de passe du Compagnon Enshrouded.\n\n`
  : `Salut ! <i class="gi gi-fire-silhouette"></i>\n\nJe t'ai créé un compte sur le Compagnon Enshrouded, notre appli pour nous aider dans le jeu : builds, arbre de compétences, où trouver les ressources, liste de farm et overlay en jeu.\n\n`) +
  `1. Va sur : ${location.origin}\n` +
  `2. Connecte-toi avec :\n   • Pseudo : ${c.username}\n   • Mot de passe provisoire : ${c.password}\n` +
  `3. À la première connexion, on te demandera de choisir ton propre mot de passe.\n` +
  (c.reset ? '' : `4. Pour avoir l'overlay en jeu : Mon compte → Application Windows → Télécharger. Décompresse le zip et lance CompagnonEnshrouded.exe (si Windows affiche « éditeur inconnu » : « Informations complémentaires » puis « Exécuter quand même »). Mets Enshrouded en plein écran fenêtré.\n`) +
  `\nBon jeu !`;
state.admin = { users: null, created: null };
VIEWS.admin = () => {
  const a = state.admin;
  if (!a.users) { loadUsers(); return '<h1><i class="gi gi-crown"></i> Administration</h1><p class="muted">Chargement…</p>'; }
  const fmt = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';
  return `<h1><i class="gi gi-crown"></i> Administration</h1><p class="sub">Crée un compte, puis transmets le pseudo et le mot de passe provisoire à la personne. Elle devra choisir son propre mot de passe à sa première connexion.</p>
  ${a.created ? `<div class="card stack" style="border-color:var(--flame);margin-bottom:16px">
    <h3><i class="gi gi-check-mark"></i> ${a.created.reset ? 'Nouveau mot de passe provisoire' : 'Compte créé'} pour « ${esc(a.created.username)} »</h3>
    <div class="row"><span class="small muted">Mot de passe provisoire :</span><span class="pw">${esc(a.created.password)}</span></div>
    <label class="field">Message à lui envoyer<textarea id="inviteMsg" rows="11" readonly>${esc(inviteMessage(a.created))}</textarea></label>
    <div class="row"><button class="btn pri" data-act="copyCreated"><i class="gi gi-scroll-unfurled"></i> Copier le message</button><button class="btn ghost" data-act="hideCreated">Fermer</button></div>
    <p class="small muted">Envoie ce message à la personne (SMS, Discord…). Une fois cet encadré fermé, le mot de passe ne sera plus jamais affiché : en cas d'oubli, utilise « Nouveau mot de passe » dans la liste.</p></div>` : ''}
  <div class="grid2">
    <form class="card stack" id="newUser">
      <h3>Nouveau compte</h3>
      <label class="field">Pseudo<input type="text" id="nuName" autocomplete="off" autocapitalize="none" spellcheck="false" required></label>
      <label class="row small"><input type="checkbox" class="check" id="nuAdmin"> Administrateur (peut gérer les comptes)</label>
      <div id="nuErr" class="err" hidden></div>
      <div class="row"><button class="btn pri" type="submit">Créer le compte</button></div>
    </form>
    <div class="card"><h3>Comptes (${a.users.length})</h3><table>
      <tr><th>Pseudo</th><th>État</th><th>Dernière connexion</th><th></th></tr>
      ${a.users.map(u => `<tr><td><b>${esc(u.username)}</b>${u.admin ? ' <i class="gi gi-crown"></i>' : ''}${u.id === srv.user.id ? ' <span class="muted small">(toi)</span>' : ''}</td>
        <td class="small">${u.mustChange ? '<span style="color:var(--warn)">mot de passe provisoire</span>' : 'actif'}</td>
        <td class="small muted">${fmt(u.lastLogin)}</td>
        <td><div class="row" style="justify-content:flex-end">${u.id === srv.user.id ? '' : `
          <button class="btn sm" data-act="resetUser" data-arg="${u.id}">Nouveau mot de passe</button>
          <button class="btn sm" data-act="toggleAdmin" data-arg="${u.id}">${u.admin ? 'Retirer admin' : 'Rendre admin'}</button>
          <button class="btn sm ghost" data-act="deleteUser" data-arg="${u.id}">Supprimer</button>`}</div></td></tr>`).join('')}
    </table></div>
  </div>
`;
};
async function loadUsers() {
  try { state.admin.users = (await apiCall('GET', '/api/admin/users')).users; } catch (e) { toast('⚠️ ' + e.message); state.admin.users = []; }
  if (state.view === 'admin') render();
}
AFTER.admin = () => {
  const f = $('#newUser'); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await apiCall('POST', '/api/admin/users', { username: $('#nuName').value, admin: $('#nuAdmin').checked });
      state.admin.created = { username: r.user.username, password: r.password, reset: false }; state.admin.users = null; render();
    } catch (x) { const el = $('#nuErr'); el.textContent = x.message; el.hidden = false; }
  });
};
const userById = id => state.admin.users.find(u => u.id === id);
ACTIONS.resetUser = async id => {
  const u = userById(id);
  if (!confirm(`Générer un nouveau mot de passe provisoire pour « ${u.username} » ? Il sera déconnecté partout.`)) return;
  try { const r = await apiCall('POST', `/api/admin/users/${id}/reset`); state.admin.created = { username: u.username, password: r.password, reset: true }; state.admin.users = null; render(); }
  catch (e) { toast('⚠️ ' + e.message); }
};
ACTIONS.toggleAdmin = async id => {
  const u = userById(id);
  try { await apiCall('POST', `/api/admin/users/${id}/admin`, { admin: !u.admin }); state.admin.users = null; render(); } catch (e) { toast('⚠️ ' + e.message); }
};
ACTIONS.deleteUser = async id => {
  const u = userById(id);
  if (!confirm(`Supprimer définitivement le compte « ${u.username} » et toutes ses données ?`)) return;
  try { await apiCall('DELETE', `/api/admin/users/${id}`); state.admin.users = null; toast('Compte supprimé'); render(); } catch (e) { toast('⚠️ ' + e.message); }
};
ACTIONS.copyCreated = () => copyText(inviteMessage(state.admin.created), 'Message copié : colle-le dans ton SMS ou sur Discord');
ACTIONS.hideCreated = () => { state.admin.created = null; render(); };

// ---------- Démarrage ----------
// Servi par le serveur de la maison : on charge le compte et ses données. Ouvert en fichier local : stockage navigateur.
// ---------- Version et mises à jour ----------
// Dans l'appli Windows, la page discute avec l'appli (version, mise à jour disponible, lancement de l'installation).
const appHost = window.chrome && window.chrome.webview;
function renderVer() {
  const box = $('#verBox'); if (!box) return;
  let html = '';
  html += `<a class="btn sm bug-btn" target="_blank" rel="noopener" href="https://github.com/LeVieuxSinge38/compagnon-enshrouded/issues/new?title=${encodeURIComponent('[Bug / idée] ')}&body=${encodeURIComponent("Décris ici le bug ou ton idée (tu peux coller des captures d'écran).\n\n---\nVersion : " + (srv.app ? srv.app.version : '?'))}"><i class="gi gi-scroll-quill"></i> Signaler un bug / une idée</a>`;
  if (srv.app) {
    html += `<div class="ver-line"><i class="gi gi-pc"></i> Appli Windows <b>v${esc(srv.app.version)}</b>${srv.app.update ? '' : ' <span class="muted">· à jour</span>'}</div>`;
    if (srv.app.update) html += `<button class="btn pri sm blink" data-act="appUpdate" title="${esc(srv.app.notes || '')}"><i class="gi gi-upgrade"></i> Installer la mise à jour ${esc(srv.app.update)}</button>`;
  }
  if (srv.ver) {
    html += `<div class="ver-line"><i class="gi gi-world"></i> Site <b>v${esc(srv.ver.version)}</b> <span class="muted">· ${esc(srv.ver.build)}</span></div>`;
    if (srv.newBuild) html += `<button class="btn sm blink" data-act="reloadSite">⟳ Nouvelle version du site : recharger</button>`;
  }
  box.innerHTML = html;
  box.hidden = !html;
  renderUpdateGate();
}
// Mise à jour de l'appli Windows : grande fenêtre au milieu, le reste flouté et inaccessible, un seul bouton.
// Les « nouveautés » ne listent que les nouvelles fonctionnalités (highlights de desktop.json), pas les petites corrections.
let updating = false;
// Nouvelle version du site seulement (le serveur s'est mis à jour) : même fenêtre, le bouton recharge la page.
// Les nouveautés viennent de data/nouveautes.json (dernière entrée) ; seulement les nouvelles fonctionnalités.
function renderUpdateGate() {
  let gate = $('#updGate');
  const app = appHost && srv.app && srv.app.update, site = !app && srv.newBuild;
  const u = app || (site ? 'site' : null);
  if (!u) { if (gate) gate.remove(); return; }
  if (site && srv.siteNews === undefined) { srv.siteNews = null; loadSiteNews(); }
  if (!gate) { gate = document.createElement('div'); gate.id = 'updGate'; gate.className = 'upd-gate'; document.body.appendChild(gate); }
  if (gate.dataset.v === u + updating) return;
  if (gate.dataset.v) gate.classList.add('stay'); // déjà affichée : pas de nouvelle animation
  gate.dataset.v = u + updating;
  const hl = ((app ? srv.app.highlights : srv.siteNews) || []).filter(Boolean);
  gate.innerHTML = `<div class="upd-card" role="dialog" aria-modal="true" aria-labelledby="updT">
    <img class="upd-emb" src="img/emblem.png" alt="">
    <div class="upd-kick">Nouvelle version du Compagnon</div>
    <h2 id="updT">${updating && app && srv.app.pages ? 'Mise à jour du contenu' : app ? `Version ${esc(u)} <span class="muted">· tu as la ${esc(srv.app.version)}</span>` : 'Le Compagnon a été mis à jour'}</h2>
    ${hl.length ? `<div class="upd-notes"><b><i class="gi gi-sparkles"></i> Les nouveautés</b><ul>${hl.map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>`
      : '<p class="muted">Corrections et petites améliorations.</p>'}
    ${updating ? `<div class="upd-bar"><i style="width:${srv.updPct || 0}%"></i></div><div class="upd-pct">${srv.updPct || 0} %</div><div class="upd-wait"><span class="upd-spin"></span>${app && srv.app.pages ? 'La page va se recharger toute seule' : 'Téléchargement de la mise à jour…'}</div>`
      : `<button class="btn pri upd-btn" data-act="${app ? 'appUpdate' : 'reloadSite'}"><i class="gi gi-upgrade"></i> Mettre à jour</button><div class="upd-foot">${app ? 'Ça prend quelques secondes' : 'La page se recharge'}, tes données ne bougent pas.</div>`}
  </div>`;
  const b = gate.querySelector('.upd-btn'); if (b) b.focus();
}
async function loadSiteNews() {
  // Les nouveautés ne s'affichent qu'une fois : une version suivante sans nouvelle entrée = « corrections »
  try {
    const n = await (await fetch('data/nouveautes.json', { cache: 'no-store' })).json(), last = n[0] || {};
    srv.siteNews = last.id && last.id !== store.get('newsSeen', null) ? last.items || [] : [];
    srv.siteNewsId = last.id || null;
  }
  catch { srv.siteNews = []; }
  const g = $('#updGate'); if (g) g.dataset.v = ''; renderUpdateGate();
}
// Une seule chose possible tant que la mise à jour n'est pas faite : pas de navigation au clavier derrière la fenêtre
document.addEventListener('keydown', e => {
  const gate = $('#updGate'); if (!gate) return;
  if (e.key === 'Tab') { e.preventDefault(); const b = gate.querySelector('.upd-btn'); if (b) b.focus(); }
  else if (!gate.contains(e.target)) e.stopPropagation();
}, true);
// Sauvegarde du personnage : lecture (seule) et mise à jour du niveau et des compétences prises
function ingestSave(bytes, file, mtime, manual) {
  try {
    const r = SaveGame.read(bytes);
    const before = state.game ? JSON.stringify(state.game.nodes) + state.game.level : '';
    state.game = { name: r.name, level: r.level, xp: r.xp, nodes: r.nodes, file: file || 'character.ksd', at: mtime || Date.now() };
    if (r.level) state.level = r.level;
    if (manual) toast(`Sauvegarde lue : ${r.name || 'personnage'}, niveau ${r.level || '?'}, ${r.nodes.length} nœuds`);
    if (manual || before !== JSON.stringify(r.nodes) + r.level) { if (['planner', 'home'].includes(state.view)) rerenderKeepScroll(); else save(); }
  } catch (e) { if (manual) toast('⚠️ ' + e.message); }
}
ACTIONS.appUpdate = () => {
  if (!appHost || updating) return;
  updating = true; renderUpdateGate(); appHost.postMessage('update');
  setTimeout(() => { updating = false; renderUpdateGate(); }, 90000); // échec (pas de redémarrage) : on peut réessayer
};
ACTIONS.reloadSite = () => { if (srv.siteNewsId) store.set('newsSeen', srv.siteNewsId); location.reload(); };
if (appHost) {
  appHost.addEventListener('message', e => {
    const d = e.data;
    if (d && d.type === 'app') { srv.app = d; renderVer(); checkAppVersion().then(renderVer); appUpdated(d.version); }
    if (d && d.type === 'updprogress') { srv.updPct = d.pct; const g = $('#updGate'); if (g) { const bar = g.querySelector('.upd-bar i'); if (bar) bar.style.width = d.pct + '%'; const pct = g.querySelector('.upd-pct'); if (pct) pct.textContent = d.pct + ' %'; } }
    if (d && d.type === 'open' && d.map) openMapOf(String(d.map));
    if (d && d.type === 'save' && d.data) ingestSave(Uint8Array.from(atob(d.data), c => c.charCodeAt(0)), d.file, d.mtime, false);
  });
  // « hello » est envoyé à la fin du démarrage (boot), une fois les données du compte chargées
}
// Juste après une mise à jour : petit mot de confirmation (une fois)
function appUpdated(v) {
  let prev = null; try { prev = localStorage.getItem('appVer'); localStorage.setItem('appVer', v); } catch { return; }
  if (prev && newerThan(v, prev)) toast(`✓ Compagnon mis à jour en version ${v}`);
}
async function checkSiteVersion() {
  try {
    const v = await (await fetch('/api/version', { cache: 'no-store' })).json();
    if (!srv.ver) srv.ver = v;
    else if (v.build !== srv.ver.build) srv.newBuild = true;
    await checkAppVersion();
    renderVer();
  } catch { /* serveur injoignable */ }
}
// L'appli Windows ne vérifie ses mises à jour que toutes les 30 min : la page regarde aussi, pour afficher le bouton
// tout de suite (le bouton demande à l'appli de vérifier et d'installer).
const newerThan = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }) > 0;
async function checkAppVersion() {
  if (!appHost || !srv.app || srv.app.update) return;
  try {
    const d = await (await fetch('/downloads/desktop.json', { cache: 'no-store' })).json();
    if (d.version && newerThan(d.version, srv.app.version)) srv.app = { ...srv.app, update: d.version, notes: d.notes, highlights: d.highlights };
  } catch { /* ignoré */ }
}

// Écran de lancement (une fois par session) : l'emblème s'illumine puis s'efface
const splashStart = Date.now();
function hideSplash() {
  const sp = $('#splash'); if (!sp) return;
  let seen = false; try { seen = sessionStorage.getItem('splash') === '1'; sessionStorage.setItem('splash', '1'); } catch { /* ignoré */ }
  setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 700); }, seen ? 0 : Math.max(0, 1400 - (Date.now() - splashStart)));
}
async function boot() {
  if (LOCAL) return Local.boot();
  if (location.protocol.startsWith('http')) {
    let me = null;
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      if (r.status === 401) return location.replace('/login.html');
      if (r.ok) me = await r.json();
    } catch { /* pas de serveur : mode local */ }
    if (me) {
      if (me.user.mustChange) return location.replace('/login.html');
      srv.on = true; srv.user = me.user;
      const data = await apiCall('GET', '/api/state');
      for (const k of SYNC_KEYS) state[k] = data[k] !== undefined ? data[k] : structuredClone(DEFAULTS[k]);
      srv.last = syncPayload();
      document.querySelectorAll('[data-server]').forEach(el => { el.hidden = el.dataset.server === 'admin' && !me.user.admin; });
      $('#whoami').textContent = me.user.username;
      checkSiteVersion();
      setInterval(checkSiteVersion, 2 * 60e3); // le serveur se met à jour tout seul : grande fenêtre de mise à jour dès qu'il y a du nouveau
      // En revenant sur l'appli, on recharge les données : l'overlay a pu les modifier entre-temps.
      document.addEventListener('visibilitychange', async () => {
        if (document.hidden || srv.pending || srv.inflight) return;
        try {
          const d = await apiCall('GET', '/api/state');
          if (srv.pending || srv.inflight) return; // modifié pendant le chargement
          for (const k of SYNC_KEYS) state[k] = d[k] !== undefined ? d[k] : structuredClone(DEFAULTS[k]);
          srv.last = syncPayload();
          if (!['account', 'admin'].includes(state.view)) render();
        } catch { /* serveur injoignable : on garde l'état local */ }
      });
    }
  }
  const start = (location.hash || '').slice(1);
  const mapOf = /^map:(.+)$/.exec(start); // lien « afficher sur la carte » venu de l'overlay
  if (mapOf) openMapOf(decodeURIComponent(mapOf[1]));
  else go(VIEWS[start] && (srv.on || !['account', 'admin'].includes(start)) ? start : 'home');
  hideSplash();
  // Dans l'appli Windows : demande la version et la dernière sauvegarde du personnage (après le chargement du compte,
  // sinon les données du serveur écraseraient la sauvegarde qui vient d'être lue)
  if (appHost) appHost.postMessage('hello');
}
boot();

