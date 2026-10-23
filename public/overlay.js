// Overlay : mémos, liste de farm, prochain niveau de Flamme et build, synchronisés avec le compte.
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAT = {}; MATERIALS.forEach(m => MAT[m.n] = m);
const matName = n => (MAT[n] && MAT[n].fr) || PRODUCT_FR[n] || n;
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const BIOME_FR = {}; BIOMES.forEach(b => { BIOME_FR[b.id] = b.fr; });
const resIcon = (n, s) => MAP.icons[n] ? `<img class="res-ico" src="img/res/${esc(MAP.icons[n])}" alt="" width="${s}" height="${s}">` : '';
// Recherche de ressource (onglet Ressources)
let resQ = '', resSel = null, appVer = null;

const LOCAL = location.hostname === 'compagnon.local';

let data = { memos: [], list: {}, tree: [], flame: 1 };
let tab = 'farm';
try { tab = localStorage.getItem('ov.tab') || 'farm'; } catch { /* stockage indisponible */ }
let pending = null, inflight = false, timer = null, hideDone = false;
// Dans l'appli Windows : on envoie le nombre de choses à faire à la bulle (overlay réduit)
const host = window.chrome && window.chrome.webview;
let lastBadge = -1;
function sendBadge() {
  if (!host) return;
  const n = data.memos.filter(m => !m.done).length + Object.values(data.list).filter(v => v.have < v.need).length;
  if (n !== lastBadge) { lastBadge = n; host.postMessage('badge:' + n); }
}

async function api(method, url, body) {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'compagnon' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (r.status === 401 || r.status === 403) { location.replace('/login.html'); throw new Error('Non connecté'); }
  if (!r.ok) throw new Error('Erreur serveur');
  return r.json();
}
const setSync = t => { $('#sync').innerHTML = t; };

// On n'envoie que les clés modifiées par l'overlay : le serveur fusionne avec le reste.
function save(keys) {
  if (LOCAL) {
    keys.forEach(k => window.Profil.save(k, data[k]));
    setSync('✓ enregistré');
    return;
  }
  pending = Object.assign(pending || {}, Object.fromEntries(keys.map(k => [k, data[k]])));
  setSync('…');
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const body = pending; pending = null; inflight = true;
    try { await api('PUT', '/api/state', body); setSync('✓ enregistré'); }
    catch { pending = Object.assign(body, pending || {}); setSync('<i class="gi gi-hazard-sign"></i> hors ligne'); }
    finally { inflight = false; }
  }, 500);
}
async function load() {
  if (LOCAL) {
    if (pending || inflight) return;
    data = {
      memos: window.Profil.load('memos', []),
      list: window.Profil.load('list', {}),
      tree: window.Profil.load('tree', []),
      game: window.Profil.load('game', null),
      flame: window.Profil.load('flame', 1),
      level: window.Profil.load('level', 1),
      roots: window.Profil.load('roots', 0),
      wells: window.Profil.load('wells', 0)
    };
    setSync('');
    render();
    return;
  }
  if (pending || inflight) return; // ne pas écraser une modification pas encore enregistrée
  try {
    const d = await api('GET', '/api/state');
    if (pending || inflight) return; // modifié pendant le chargement : on garde la version locale
    data = { memos: d.memos || [], list: d.list || {}, tree: d.tree || [], game: d.game || null, flame: d.flame || 1, level: d.level || 1, roots: d.roots || 0, wells: d.wells || 0 };
    setSync('');
    render();
  } catch { setSync('<i class="gi gi-hazard-sign"></i> serveur injoignable'); }
}

// ---------- Onglets ----------
const TAB_NAME = { res: 'Ressources', farm: 'Liste de farm', flame: 'Flamme', build: 'Build', memos: 'Mémos' };
const tabCount = () => {
  if (tab === 'farm') { const n = Object.values(data.list).filter(v => v.have < v.need).length; return n ? ` <span>· ${n} à récolter</span>` : ''; }
  if (tab === 'memos') { const n = data.memos.filter(m => !m.done).length; return n ? ` <span>· ${n} à faire</span>` : ''; }
  return '';
};
const VIEWS = {
  res() {
    const q = norm(resQ);
    const hits = q ? MATERIALS.filter(m => norm((m.fr || '') + ' ' + m.n).includes(q))
      .sort((a, b) => norm(a.fr || a.n).indexOf(q) - norm(b.fr || b.n).indexOf(q) || (a.fr || a.n).length - (b.fr || b.n).length).slice(0, 8) : [];
    const m = resSel && MAT[resSel];
    let detail = '';
    if (m) {
      const n = m.n, places = (MAP.byMat[n] || []).length, inList = data.list[n];
      const where = m.o ? esc(m.o) : m.oe ? `<span class="sub2">(wiki, en anglais)</span> ${esc(m.oe)}` : '<span class="sub2">Pas encore d\'information détaillée.</span>';
      detail = `<div class="ov-res">
        <div class="row" style="gap:8px;flex-wrap:nowrap">${resIcon(n, 36)}<div><b>${esc(matName(n))}</b><div class="sub2">${esc(n)}${m.b.length ? ' · ' + m.b.map(b => esc(BIOME_FR[b] || b)).join(', ') : ''}</div></div></div>
        <p style="margin:8px 0"><i class="gi gi-position-marker"></i> ${where}</p>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          ${places ? `<button class="btn pri" data-act="resMap" data-n="${esc(n)}"><i class="gi gi-treasure-map"></i> Afficher sur la carte <span class="sub2" style="color:inherit">(${places} lieu${places > 1 ? 'x' : ''})</span></button>` : '<span class="sub2">Pas de lieu précis sur la carte.</span>'}
          <button class="btn" data-act="resList" data-n="${esc(n)}">${inList ? "✓ Dans ma liste de farm" : '➕ Liste de farm'}</button>
        </div></div>`;
    }
    return `<div class="ov-add"><input type="search" id="resIn" placeholder="Fer, cuivre, résine… (nom de la ressource)" value="${esc(resQ)}" autocomplete="off"></div>
      ${detail}
      ${hits.filter(x => x !== m).map(x => `<div class="it ov-hit" data-act="resPick" data-n="${esc(x.n)}">${resIcon(x.n, 22)}<span class="t">${esc(matName(x.n))}</span>${(MAP.byMat[x.n] || []).length ? '<span class="sub2"><i class="gi gi-treasure-map"></i></span>' : ''}</div>`).join('')}
      ${q && !hits.length ? '<div class="empty">Aucune ressource trouvée.</div>' : ''}
      ${!q && !m ? '<div class="empty">Tape le nom d\'une ressource pour savoir où la trouver.</div>' : ''}`;
  },
  memos() {
    const memos = data.memos;
    return `<form class="ov-add" id="addMemo"><input type="text" id="memoIn" placeholder="Nouveau mémo… (Entrée)" maxlength="300" autocomplete="off"><button class="btn pri">+</button></form>
      ${memos.length ? memos.map((m, i) => `<div class="it ${m.done ? 'done' : ''}">
        <input type="checkbox" class="check" data-act="memoDone" data-i="${i}" ${m.done ? 'checked' : ''}>
        <span class="t">${esc(m.t)}</span><button class="x" data-act="memoDel" data-i="${i}" title="Supprimer">✕</button></div>`).join('')
        : '<div class="empty">Aucun mémo.<br>Note ici ce que tu dois faire pendant ta session.</div>'}
      ${memos.some(m => m.done) ? '<div style="margin-top:8px"><button class="btn ghost" data-act="memoClean">Retirer les mémos faits</button></div>' : ''}`;
  },
  farm() {
    let items = Object.entries(data.list).sort((a, b) => (a[1].have >= a[1].need) - (b[1].have >= b[1].need) || matName(a[0]).localeCompare(matName(b[0])));
    if (hideDone) items = items.filter(([, v]) => v.have < v.need);
    if (!Object.keys(data.list).length) return '<div class="empty">Ta liste de farm est vide.<br>Cherche une ressource dans l\'onglet Ressources, ou ajoute-en depuis le Compagnon (Craft, Flamme).</div>';
    return `<label class="row sub2 ov-opt"><input type="checkbox" class="check" data-act="hideDone" ${hideDone ? 'checked' : ''}> masquer ce qui est déjà farmé</label>
      ${items.map(([n, v]) => { const ok = v.have >= v.need;
        return `<div class="fi ${ok ? 'done' : ''}">
        <div class="fi-top"><button class="fi-chk${ok ? ' on' : ''}" data-act="fill" data-n="${esc(n)}" title="${ok ? 'Pas encore farmé' : 'Farmé !'}">✓</button>${resIcon(n, 26) || '<span class="fi-noico"></span>'}<span class="fi-n">${esc(matName(n))}</span></div></div>`; }).join('')}`;
  },
  flame() {
    const f = FLAME.find(x => x.lv === data.flame + 1);
    if (!f) return '<div class="empty">Flamme au niveau maximum connu 🎉</div>';
    return `<h4>Niveau actuel : ${data.flame} · prochain objectif : Flamme ${f.lv}</h4>
      <div class="sub2" style="margin-bottom:6px">${f.surv} survivants · +${f.attr} attributs · Brume ${esc(f.time)}</div>
      ${Object.entries(f.need).map(([n, q]) => { const l = data.list[n]; const have = l ? l.have : 0;
        return `<div class="it ${have >= q ? 'done' : ''}">${resIcon(n, 22) || '<span style="width:22px;flex-shrink:0"></span>'}<span class="t">${esc(matName(n))}</span><span class="q">${q}</span>${l ? `<span class="sub2">${have}/${l.need}</span>` : ''}</div>`; }).join('')}
      <div style="margin-top:10px"><button class="btn" data-act="flameList">Ajouter à ma liste de farm</button></div>`;
  },
  build() {
    const steps = SkillTree.steps(data.tree);
    if (!steps.length) return '<div class="empty">Aucun plan dans l\'arbre.<br>Charge un build dans le Compagnon (Builds ou Arbre de compétences).</div>';
    const got = new Map((data.game && data.game.nodes) || []);
    const done = s => (got.get(s.id) || 0) >= s.rank;
    const lv = Math.max(0, (Math.min(50, data.level) - 1) * 2), avail = lv + Math.max(Number(data.roots) + Number(data.wells) * 3, (data.game ? SkillTree.spent(data.game.nodes) : 0) - lv);
    const next = steps.findIndex(s => s.total > avail);
    const todo = steps.find(s => !done(s));
    return `${data.game ? `<div class="ov-next">${todo ? `▶ Prochaine étape : <b>${esc(todo.name)}</b>${todo.max > 1 ? ` (rang ${todo.rank})` : ''} · ${todo.pts} pt${todo.pts > 1 ? 's' : ''}` : '🎉 Build terminé !'}</div>` : ''}
      <div class="sub2" style="margin-bottom:6px">${data.game ? `Niveau ${data.game.level || '?'} en jeu · ${steps.filter(done).length}/${steps.length} étapes faites.` : `${avail} points disponibles · ${steps[steps.length - 1].total} planifiés.`}</div>
      ${steps.map(s => `<div class="it ${done(s) ? 'done' : s.total > avail ? 'done' : ''}${todo === s ? ' next' : ''}"><span class="q" style="min-width:26px;color:${SkillTree.color(s.id)}">${done(s) ? '✓' : s.n}</span>
        <span class="t"><b>${esc(s.name)}</b>${s.max > 1 ? ` <span class="sub2">×${s.rank}</span>` : ''}</span><span class="sub2">+${s.pts} · ${s.total}</span></div>`).join('')}
      ${next > 0 ? `<div class="sub2" style="margin-top:6px">Prochaine étape quand tu auras ${steps[next].total} points : ${esc(steps[next].name)}.</div>` : ''}`;
  }
};

function render() {
  sendBadge();
  if (!VIEWS[tab]) tab = 'farm';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const y = $('#ov').scrollTop;
  // Conserver la saisie en cours si l'affichage est rafraîchi pendant qu'on tape
  const old = $('#memoIn'), typed = old ? old.value : '', hadFocus = old && document.activeElement === old;
  const hadResFocus = !!$('#resIn') && document.activeElement === $('#resIn');
  $('#ov').innerHTML = `<div class="ov-h">${esc(TAB_NAME[tab])}${tabCount()}</div>` + VIEWS[tab]();
  $('#ov').scrollTop = y;
  const inp = $('#memoIn');
  if (inp && typed) inp.value = typed;
  if (inp && hadFocus) inp.focus();
  const ri = $('#resIn');
  if (ri) {
    if (hadResFocus) { ri.focus(); ri.setSelectionRange(ri.value.length, ri.value.length); }
    ri.addEventListener('input', () => { resQ = ri.value; resSel = null; render(); });
  }
  const f = $('#addMemo');
  if (f) f.addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#memoIn').value.trim(); if (!t) return;
    data.memos.push({ t, done: false }); $('#memoIn').value = ''; save(['memos']); render(); $('#memoIn').focus();
  });
}

const ACTIONS = {
  openMain: () => { if (host) host.postMessage('open:main'); else window.open('/', '_blank'); },
  resPick: el => { resSel = el.dataset.n; render(); },
  resList: el => { const n = el.dataset.n, e = data.list[n]; data.list[n] = { need: e ? e.need : 10, have: e ? e.have : 0 }; save(['list']); render(); },
  // Ouvre la grande carte dans la fenêtre du Compagnon (appli 1.4+) ; sinon dans le navigateur
  resMap: el => {
    const n = el.dataset.n;
    if (host && appVer && appVer.localeCompare('1.4.0', undefined, { numeric: true }) >= 0) host.postMessage('open:map:' + n);
    else window.open('/#map:' + encodeURIComponent(n), '_blank');
  },
  memoDone: el => { const m = data.memos[el.dataset.i]; m.done = !m.done; save(['memos']); render(); },
  memoDel: el => { data.memos.splice(Number(el.dataset.i), 1); save(['memos']); render(); },
  memoClean: () => { data.memos = data.memos.filter(m => !m.done); save(['memos']); render(); },
  inc: el => { const v = data.list[el.dataset.n]; v.have = Math.min(9999, v.have + 1); save(['list']); render(); },
  dec: el => { const v = data.list[el.dataset.n]; v.have = Math.max(0, v.have - 1); save(['list']); render(); },
  fill: el => { const v = data.list[el.dataset.n]; v.have = v.have >= v.need ? 0 : v.need; save(['list']); render(); },
  hideDone: () => { hideDone = !hideDone; render(); },
  flameList: () => {
    const f = FLAME.find(x => x.lv === data.flame + 1);
    for (const [n, q] of Object.entries(f.need)) { const e = data.list[n]; data.list[n] = { need: Math.max(q, e ? e.need : 0), have: e ? e.have : 0 }; }
    save(['list']); tab = 'farm'; render();
  }
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; try { localStorage.setItem('ov.tab', tab); } catch { /* ignoré */ } render(); if (tab === 'res' && $('#resIn')) $('#resIn').focus(); return; }
  const a = e.target.closest('[data-act]');
  if (a && ACTIONS[a.dataset.act]) ACTIONS[a.dataset.act](a);
});

// Mise à jour de l'appli Windows : bandeau en haut de l'overlay
if (host) {
  host.addEventListener('message', e => {
    let d = e.data; const box = $('#upd');
    if (d && d.type === 'updprogress') { box.hidden = false; box.innerHTML = '<div class="ov-upd-t">Téléchargement de la mise à jour…</div><div class="upd-bar"><i style="width:' + d.pct + '%"></i></div><div class="upd-pct">' + d.pct + ' %</div>'; return; }
    // Appli 2.0 : sauvegardes de tous les personnages ; on prend celle du personnage actif
    if (d && d.type === 'saves' && LOCAL) {
      const s = (d.list || []).find(x => x.id === window.Profil.active());
      if (s) d = { type: 'save', data: s.data, file: s.file, mtime: s.mtime };
    }
    if (d && d.type === 'save' && d.data) {
      try {
        const r = SaveGame.read(Uint8Array.from(atob(d.data), c => c.charCodeAt(0)));
        // Le jeu enregistre toutes les quelques secondes : on n'écrit (et on ne redessine) que si le personnage a vraiment changé,
        // sinon la fenêtre principale du Compagnon se redessinerait à chaque sauvegarde (clignotement).
        const before = data.game ? JSON.stringify(data.game.nodes) + '|' + data.game.level + '|' + data.game.name : '';
        data.game = { name: r.name, level: r.level, xp: r.xp, nodes: r.nodes, file: d.file, at: d.mtime || Date.now() };
        if (r.level) data.level = r.level;
        if (before !== JSON.stringify(r.nodes) + '|' + r.level + '|' + r.name) { save(['game', 'level']); render(); }
      } catch { /* sauvegarde illisible : on garde l'état actuel */ }
      return;
    }
    if (!d || d.type !== 'app') return;
    appVer = d.version || null;
    showAppUpdate(d.update);
    if (!d.update) checkAppVersion();
  });
}
function showAppUpdate(v) {
  const box = $('#upd');
  box.hidden = !v;
  // Couvre tout le panneau : on ne peut rien faire d'autre avant la mise à jour
  if (v) box.innerHTML = `<div class="ov-upd-t"><i class="gi gi-upgrade"></i> Nouvelle version <b>${esc(v)}</b></div><div class="small">Le Compagnon redémarre tout seul en quelques secondes, tes données ne bougent pas.</div><button class="btn pri blink" data-act="appUpdate">Mettre à jour</button>`;
}
// L'appli Windows ne vérifie ses mises à jour que toutes les 30 min : l'overlay regarde aussi
async function checkAppVersion() {
  if (!appVer) return;
  try {
    const d = await (await fetch('/downloads/desktop.json', { cache: 'no-store' })).json();
    if (d.version && String(d.version).localeCompare(appVer, undefined, { numeric: true }) > 0) {
      showAppUpdate(d.version);
      if (host) host.postMessage('check'); // l'appli (1.6+) vérifie aussitôt : la bulle passe au vert même overlay réduit
    }
  } catch { /* ignoré */ }
}
// Le serveur s'est mis à jour : l'overlay reste ouvert des heures, il se recharge tout seul (sauf pendant une saisie)
let siteBuild = null;
async function checkSite() {
  if (LOCAL) return;
  try {
    const v = await (await fetch('/api/version', { cache: 'no-store' })).json();
    if (!siteBuild) { siteBuild = v.build; return; }
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.value;
    if (v.build !== siteBuild && !pending && !inflight && !typing) location.reload();
    else checkAppVersion();
  } catch { /* serveur injoignable */ }
}
checkSite();
setInterval(checkSite, 2 * 60e3);
ACTIONS.appUpdate = () => { if (host) { host.postMessage('update'); $('#upd').innerHTML = '<span>Installation… l\'appli va redémarrer</span>'; } };

// Rafraîchit quand l'overlay redevient visible, et régulièrement pendant qu'il l'est.
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
window.addEventListener('focus', load);
// Toutes les 20 s, même réduit en bulle : le compteur de la bulle reste à jour.
setInterval(load, 20000);

if (LOCAL) {
  window.addEventListener('storage', load);
  $('#who').textContent = (window.Profil.get().chars[window.Profil.active()] || {}).name || '';
} else {
  api('GET', '/api/me').then(r => { $('#who').textContent = r.user.username; }).catch(() => {});
}
// Premier chargement, puis demande à l'appli Windows sa version et la dernière sauvegarde du personnage
load().then(() => { if (host) host.postMessage('hello'); });
