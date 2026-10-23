// Appli autonome (2.0) : le Compagnon tourne sur le PC, sans serveur ni compte.
// Profil local (nom du joueur, réglages) et données propres à chaque personnage (profil.js), assistant de premier
// lancement, Paramètres, sélecteur de personnage, sauvegardes de tous les personnages lues par l'appli Windows,
// relais réseau pour les actualités, et récupération des données de l'ancien serveur de la maison.
// Chargé avant app.js ; Local.boot() est appelé par app.js quand la page est servie par l'appli (compagnon.local).
'use strict';
window.Local = (() => {
  const KEYS = () => [...SYNC_KEYS, 'memos'];
  let chars = {};          // personnages lus dans les sauvegardes : id → { id, name, level, nodes, xp, file, mtime }
  let firstLatest = null;  // sauvegarde la plus récente au démarrage (le suivi automatique ne réagit qu'aux suivantes)
  let dirs = [];           // dossiers de sauvegardes surveillés
  let migrateSent = false;
  const wiz = { step: 1, name: '', pick: null, migrated: null, migrating: false, sound: true, follow: true, flame: 1 };

  // ---------- Relais réseau et autres demandes à l'appli Windows ----------
  const waiting = {};
  let seq = 0;
  function hostFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      if (!appHost) return reject(new Error('Hors de l\'appli'));
      const id = 'f' + (++seq);
      waiting[id] = { resolve, reject };
      appHost.postMessage('fetch:' + JSON.stringify({ id, url, method: opts.method || 'GET', body: opts.body || null }));
      setTimeout(() => { if (waiting[id]) { delete waiting[id]; reject(new Error('Délai dépassé')); } }, 30000);
    });
  }
  function onHost(d) {
    if (d.type === 'fetch' && waiting[d.id]) { const w = waiting[d.id]; delete waiting[d.id]; d.ok ? w.resolve(d.text) : w.reject(new Error('Réseau indisponible')); }
    if (d.type === 'migrate') onMigrate(d);
    if (d.type === 'saves') onSaves(d);
  }

  // ---------- Données du personnage actif ----------
  function loadState() {
    for (const k of SYNC_KEYS) state[k] = Profil.load(k, DEFAULTS[k]);
    const c = chars[Profil.active()];
    if (c) applySave(c, false);
  }
  function saveState() { if (Profil.active()) for (const k of SYNC_KEYS) Profil.save(k, state[k]); }

  // ---------- Sauvegardes du jeu (tous les personnages) ----------
  function onSaves(d) {
    dirs = d.dirs || [];
    const next = {};
    for (const s of d.list || []) {
      try {
        const r = SaveGame.read(Uint8Array.from(atob(s.data), c => c.charCodeAt(0)));
        next[s.id] = { id: s.id, name: r.name || 'Personnage', level: r.level || 1, xp: r.xp, nodes: r.nodes, file: s.file, mtime: s.mtime };
      } catch { /* sauvegarde illisible : ignorée */ }
    }
    chars = next;
    // Les personnages déjà connus du profil gardent leur nom et leur niveau à jour ; les nouveaux s'ajoutent tout seuls
    if (Profil.exists()) for (const c of Object.values(chars)) Profil.upsertChar(c.id, { name: c.name, level: c.level, file: c.file, at: c.mtime });
    const latest = Object.values(chars).sort((a, b) => b.mtime - a.mtime)[0];
    if (firstLatest === null) firstLatest = latest ? latest.id + ':' + latest.mtime : '';
    else if (latest && Profil.exists() && Profil.get().settings.follow && latest.id !== Profil.active() && latest.id + ':' + latest.mtime !== firstLatest) {
      // Le jeu vient d'enregistrer un autre personnage : c'est lui qu'on joue
      firstLatest = latest.id + ':' + latest.mtime;
      switchTo(latest.id, `Tu joues avec ${latest.name} : le Compagnon passe sur ${latest.name}`);
      return;
    }
    const c = chars[Profil.active()];
    if (c) applySave(c, true);
    if (state.view === 'welcome' || state.view === 'settings') render();
    renderSwitch();
  }
  // Niveau et compétences du personnage actif, lus dans sa sauvegarde
  function applySave(c, live) {
    const before = state.game ? JSON.stringify(state.game.nodes) + state.game.level : '';
    state.game = { name: c.name, level: c.level, xp: c.xp, nodes: c.nodes, file: c.file, at: c.mtime };
    state.level = c.level;
    if (live && before !== JSON.stringify(c.nodes) + c.level) {
      if (['planner', 'home'].includes(state.view)) rerenderKeepScroll(); else save();
    }
  }

  // ---------- Changer de personnage ----------
  function switchTo(id, msg) {
    if (id === Profil.active()) return;
    saveState();
    Profil.setActive(id);
    loadState();
    const m = $('#main'); m.classList.remove('enter'); void m.offsetWidth; m.classList.add('enter');
    render(); renderSwitch();
    toast(msg || `Personnage : ${(Profil.get().chars[id] || {}).name || id}`);
  }
  const ago = t => sinceFr(t) || '';
  function renderSwitch() {
    const box = $('#charSw'); if (!box) return;
    const p = Profil.get(), c = p.chars[p.active];
    if (!Profil.exists() || !c) { box.hidden = true; return; }
    box.hidden = false;
    const others = Object.entries(p.chars).filter(([id]) => id !== p.active);
    box.innerHTML = `<button class="cs-cur" data-act="csToggle" title="Changer de personnage">
        <i class="gi gi-visored-helm"></i><span><b>${esc(c.name)}</b><small>Niveau ${esc(c.level || '?')}</small></span><i class="gi gi-cycle cs-arrow"></i></button>
      <div class="cs-menu" hidden>
        ${others.map(([id, o]) => `<button data-act="csPick" data-arg="${esc(id)}"><b>${esc(o.name)}</b><small>Niveau ${esc(o.level || '?')}${o.at ? ' · joué ' + esc(ago(o.at)) : ''}</small></button>`).join('')
          || '<div class="small muted" style="padding:8px 10px">Aucun autre personnage trouvé.</div>'}
        <button data-go="settings" class="cs-set"><i class="gi gi-cog"></i> Paramètres</button>
      </div>`;
  }

  // ---------- Récupération des données de l'ancien serveur ----------
  function onMigrate(d) {
    wiz.migrating = false;
    if (!d.ok) { render(); return; }
    try {
      const me = JSON.parse(d.me), st = JSON.parse(d.state);
      wiz.migrated = st; if (!wiz.name) wiz.name = me.user.username;
      if (st.flame) wiz.flame = st.flame;
    } catch { /* lecture impossible : ignoré */ }
    render();
  }

  // ---------- Assistant de premier lancement ----------
  const charList = () => Object.values(chars).sort((a, b) => b.mtime - a.mtime);
  function welcome() {
    const st = wiz.step, list = charList();
    if (!wiz.pick && list[0]) wiz.pick = list[0].id;
    const dots = [1, 2, 3].map(i => `<i class="${i === st ? 'on' : i < st ? 'done' : ''}"></i>`).join('');
    let body = '';
    if (st === 1) body = `<h2>Bienvenue, aventurier</h2><p class="sub">Le Compagnon t'accompagne dans Valdebraise : builds, équipement, ressources, carte. Tout reste sur ton PC.</p>
      <label class="field">Comment t'appelles-tu ?<input type="text" id="wName" maxlength="30" value="${esc(wiz.name)}" placeholder="Ton nom ou pseudo" autocomplete="off"></label>
      ${wiz.migrated ? `<div class="wz-mig"><i class="gi gi-check-mark"></i> Tes données de l'ancienne version ont été retrouvées et seront reprises (build, liste de farm, mémos, carte).</div>` : ''}
      <div class="row wz-nav"><span></span><button class="btn pri" data-act="wzNext">Continuer</button></div>`;
    if (st === 2) body = `<h2>Ton personnage</h2><p class="sub">${list.length ? 'Voici les personnages trouvés dans tes sauvegardes d\'Enshrouded. Choisis celui que tu joues : tu pourras changer à tout moment.' : 'Aucune sauvegarde de personnage trouvée pour le moment.'}</p>
      <div class="wz-chars">${list.map(c => `<button class="wz-char ${wiz.pick === c.id ? 'on' : ''}" data-act="wzPick" data-arg="${esc(c.id)}"><i class="gi gi-visored-helm"></i><span><b>${esc(c.name)}</b><small>Niveau ${c.level} · joué ${esc(ago(c.mtime))}</small></span></button>`).join('')}</div>
      ${!list.length ? `<p class="small muted">Lance le jeu une fois avec ton personnage (le jeu crée alors sa sauvegarde), ou indique où sont tes sauvegardes.</p>` : ''}
      <div class="row"><button class="btn sm" data-act="pickSaveDir"><i class="gi gi-open-folder"></i> Choisir le dossier des sauvegardes</button></div>
      <div class="row wz-nav"><button class="btn ghost" data-act="wzBack">Retour</button><button class="btn pri" data-act="wzNext">${list.length ? 'Continuer' : 'Continuer sans personnage'}</button></div>`;
    if (st === 3) body = `<h2>Derniers réglages</h2><p class="sub">Tu pourras tout changer plus tard dans les Paramètres.</p>
      <label class="wz-opt"><input type="checkbox" id="wSound" ${wiz.sound ? 'checked' : ''}><span><b>Musique de l'intro</b><small>Quelques secondes au démarrage du Compagnon.</small></span></label>
      <label class="wz-opt"><input type="checkbox" id="wFollow" ${wiz.follow ? 'checked' : ''}><span><b>Changer de personnage automatiquement</b><small>Si tu lances le jeu avec un autre de tes personnages, le Compagnon bascule dessus tout seul.</small></span></label>
      <label class="field">Niveau de ta Flamme <span class="muted small">(modifiable plus tard dans l\'onglet Niveaux de Flamme)</span><select id="wFlame">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => `<option ${wiz.flame === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="row wz-nav"><button class="btn ghost" data-act="wzBack">Retour</button><button class="btn pri" data-act="wzDone"><i class="gi gi-sparkles"></i> C'est parti</button></div>`;
    return `<div class="wz"><div class="wz-card card"><img class="wz-emb" src="img/emblem.png" alt=""><div class="wz-dots">${dots}</div>${body}</div></div>`;
  }
  function readWizard() {
    const n = $('#wName'); if (n) wiz.name = n.value.trim();
    const s = $('#wSound'); if (s) wiz.sound = s.checked;
    const f = $('#wFollow'); if (f) wiz.follow = f.checked;
    const l = $('#wFlame'); if (l) wiz.flame = Number(l.value);
  }
  function finishWizard() {
    readWizard();
    const c = chars[wiz.pick];
    const id = c ? c.id : 'manuel', name = c ? c.name : (wiz.name || 'Mon personnage');
    const p = Profil.get();
    p.name = wiz.name || 'Aventurier';
    p.settings = { ...p.settings, sound: wiz.sound, follow: wiz.follow };
    p.chars = {};
    for (const o of Object.values(chars)) p.chars[o.id] = { name: o.name, level: o.level, file: o.file, at: o.mtime };
    if (!c) p.chars[id] = { name, level: 1 };
    p.active = id;
    Profil.set(p);
    try { localStorage.setItem('ens.introSon', String(wiz.sound)); } catch { /* ignoré */ }
    // Données reprises de l'ancien compte (sinon on part de zéro)
    const from = wiz.migrated || {};
    for (const k of KEYS()) if (from[k] !== undefined) Profil.save(k, from[k]);
    Profil.save('flame', wiz.flame);
    loadState();
    renderSwitch();
    go('home');
    toast(`Bienvenue, ${p.name} !`);
  }

  // ---------- Paramètres ----------
  function settings() {
    const p = Profil.get(), list = Object.entries(p.chars);
    return `<h1><i class="gi gi-cog"></i> Paramètres</h1><p class="sub">Tout est enregistré sur ce PC, rien n'est envoyé sur Internet.</p>
    <div class="grid2">
      <div class="card stack"><h3>Joueur</h3>
        <label class="field">Ton nom<input type="text" id="sName" maxlength="30" value="${esc(p.name)}"></label>
        <h3>Personnages</h3>
        <div class="wz-chars">${list.map(([id, c]) => `<div class="wz-char ${id === p.active ? 'on' : ''}"><i class="gi gi-visored-helm"></i><span><b>${esc(c.name)}</b><small>Niveau ${esc(c.level || '?')}${chars[id] ? '' : ' · sauvegarde introuvable'}</small></span>
          ${id === p.active ? '<span class="chip">actif</span>' : `<button class="btn sm" data-act="csPick" data-arg="${esc(id)}">Choisir</button>${chars[id] ? '' : `<button class="btn sm ghost" data-act="sDelChar" data-arg="${esc(id)}" title="Oublier ce personnage et ses données">Oublier</button>`}`}</div>`).join('')}</div>
        <label class="wz-opt"><input type="checkbox" id="sFollow" ${p.settings.follow ? 'checked' : ''}><span><b>Changer de personnage automatiquement</b><small>Si tu lances le jeu avec un autre de tes personnages, le Compagnon bascule dessus tout seul.</small></span></label>
      </div>
      <div class="card stack"><h3>Sauvegardes du jeu</h3>
        <p class="small muted">Le Compagnon lit (sans jamais les modifier) les sauvegardes de tes personnages.</p>
        <div class="small">${dirs.length ? dirs.map(d => `<div><i class="gi gi-open-folder"></i> ${esc(d)}</div>`).join('') : '<span class="muted">Aucun dossier trouvé.</span>'}</div>
        <div class="row"><button class="btn sm" data-act="pickSaveDir"><i class="gi gi-open-folder"></i> Choisir le dossier</button><button class="btn sm ghost" data-act="autoSaveDir">Trouver tout seul (Steam)</button></div>
        <h3>Démarrage</h3>
        <label class="wz-opt"><input type="checkbox" id="sSound" ${p.settings.sound ? 'checked' : ''}><span><b>Musique de l'intro</b><small>Quelques secondes au démarrage.</small></span></label>
        <h3>Copie de sécurité</h3>
        <p class="small muted">Un fichier avec tous tes réglages et les données de tes personnages : pour changer de PC ou par précaution.</p>
        <div class="row"><button class="btn sm" data-act="sExport"><i class="gi gi-scroll-unfurled"></i> Exporter</button><label class="btn sm ghost">Importer<input type="file" id="sImport" accept=".json,application/json" hidden></label></div>
      </div>
    </div>
    <p class="small muted" style="margin-top:18px">Icônes : game-icons.net (CC BY 3.0) · Police des titres : Cinzel (OFL) · Données : wiki Enshrouded.</p>`;
  }

  // ---------- Démarrage ----------
  function init() {
    VIEWS.welcome = welcome;
    VIEWS.settings = settings;
    AFTER.welcome = () => {
      const n = $('#wName'); if (n) { n.focus(); n.addEventListener('keydown', e => { if (e.key === 'Enter') ACTIONS.wzNext(); }); }
      if (appHost && !migrateSent) { migrateSent = true; appHost.postMessage('migrate'); }
    };
    AFTER.settings = () => {
      $('#sName').addEventListener('change', e => { const p = Profil.get(); p.name = e.target.value.trim() || p.name; Profil.set(p); toast('Nom enregistré'); });
      $('#sFollow').addEventListener('change', e => { const p = Profil.get(); p.settings.follow = e.target.checked; Profil.set(p); });
      $('#sSound').addEventListener('change', e => { const p = Profil.get(); p.settings.sound = e.target.checked; Profil.set(p); try { localStorage.setItem('ens.introSon', String(e.target.checked)); } catch { /* ignoré */ } });
      $('#sImport').addEventListener('change', async e => {
        const f = e.target.files[0]; if (!f) return;
        if (!confirm('Remplacer tous tes réglages et les données de tes personnages par ceux de ce fichier ?')) return;
        try { Profil.importAll(await f.text()); loadState(); renderSwitch(); render(); toast('Copie de sécurité importée'); }
        catch (x) { toast('⚠️ ' + x.message); }
      });
    };
    ACTIONS.wzNext = () => { readWizard(); if (wiz.step === 1 && !wiz.name) { toast('Indique ton nom pour continuer'); return; } wiz.step = Math.min(3, wiz.step + 1); render(); };
    ACTIONS.wzBack = () => { readWizard(); wiz.step = Math.max(1, wiz.step - 1); render(); };
    ACTIONS.wzPick = id => { wiz.pick = id; render(); };
    ACTIONS.wzDone = finishWizard;
    ACTIONS.pickSaveDir = () => appHost && appHost.postMessage('pickSaveDir');
    ACTIONS.autoSaveDir = () => appHost && appHost.postMessage('autoSaveDir');
    ACTIONS.csToggle = () => { const m = $('#charSw .cs-menu'); if (m) m.hidden = !m.hidden; };
    ACTIONS.csPick = id => switchTo(id);
    ACTIONS.sDelChar = id => {
      if (!confirm('Oublier ce personnage et toutes ses données dans le Compagnon ?')) return;
      try { for (const k of KEYS()) localStorage.removeItem('ens.c.' + id + '.' + k); } catch { /* ignoré */ }
      Profil.removeChar(id); render();
    };
    ACTIONS.sExport = () => {
      const blob = new Blob([Profil.exportAll()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `compagnon-enshrouded-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    document.addEventListener('click', e => { const m = $('#charSw .cs-menu'); if (m && !m.hidden && !e.target.closest('#charSw')) m.hidden = true; });
    // L'overlay modifie la liste de farm ou les mémos : on recharge
    window.addEventListener('storage', e => { if (e.key && Profil.active() && e.key.startsWith('ens.c.' + Profil.active() + '.')) { loadState(); if (!['welcome', 'settings'].includes(state.view)) render(); } });
    if (appHost) appHost.addEventListener('message', e => { if (e.data && e.data.type) onHost(e.data); });
    document.querySelectorAll('[data-local]').forEach(el => { el.hidden = false; });
  }
  function boot() {
    init();
    const start = (location.hash || '').slice(1);
    if (!Profil.exists()) go('welcome');
    else {
      loadState();
      const mapOf = /^map:(.+)$/.exec(start);
      if (mapOf) openMapOf(decodeURIComponent(mapOf[1]));
      else go(VIEWS[start] && !['account', 'admin', 'welcome'].includes(start) ? start : 'home');
    }
    renderSwitch();
    hideSplash();
    if (appHost) appHost.postMessage('hello');
  }
  return { boot, saveState, hostFetch, renderSwitch, playerName: () => Profil.get().name };
})();
