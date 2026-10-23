// Carte interactive de Valdebraise (Leaflet) : fond du wiki découpé en tuiles (img/carte/{z}/{x}_{y}.jpg),
// 48 000 points de wikily.gg (data/carte.json, avec l'autorisation de wikily), filtres par catégorie et par ressource,
// recherche, et lieux « faits » propres à chaque joueur. Coordonnées du wiki : 0..10240, y vers le haut ; Leaflet : [y, x].
'use strict';
window.Carte = (() => {
  const SIZE = 10240, NATIVE = 5, TILE = 320; // niveau 5 = 10 240 px = résolution du fond du wiki
  const CRS = L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(TILE / SIZE, 0, -TILE / SIZE, TILE) });
  const SUBS = new Set(['ore-veins', 'plants']);            // catégories détaillées par ressource (une case par matériau)
  const BIG = 1200;                                         // au-delà : points dessinés (rapide) plutôt qu'icônes
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const ls = { get(k, d) { try { const v = localStorage.getItem('ens.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ens.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } } };
  // Couleur des minerais (points dessinés) ; les plantes prennent une teinte verte selon leur nom
  const ORE_COL = { 'Cuivre': '#d9822b', 'Fer': '#9aa3ad', 'Ambre': '#f0a830', 'Silex': '#d8cfc0', 'Argile': '#b8683e', 'Soufre': '#e8d84a', 'Sel': '#f4f4f4',
    'Charbon': '#3c3c3c', 'Or': '#f5c542', 'Argent': '#dfe5ea', 'Étain': '#8fb0b8', 'Célestium': '#7fd3ff', 'Obsidienne': '#6b4c8c', 'Nacre': '#f2e6dc',
    'Aigue-marine': '#6fd6d0', 'Améthyste': '#a46ad8', 'Lapis-lazuli': '#3a68d8', 'Marbre rouge': '#c0473f', 'Goudron': '#1d1d1d', 'Os': '#ece5d2',
    'Os fossilisé': '#c9b98a', "Pièces d'or": '#ffd34d' };
  const GAME_ICO = { 'ancient-spires': 'Ancient_Spire', 'flame-shrines': 'Flame_Shrine', 'night-sanctums': 'Night_Sanctum', 'gem-forges': 'Gem_Forge',
    'ancient-obelisks': 'Ancient_Obelisk', 'shroud-roots': 'Shroud_Root', 'elixir-wells': 'Elixir_Well', 'shroud-lairs': 'Shroud_Lair', 'balefire': 'Balefire',
    'enemy-camps': 'Enemy_Camp', 'dungeons': 'Sun_Temple', 'hollow-halls': 'Hollow_Halls', 'vaults': 'Ancient_Vault', 'villages': 'Village', 'camps': 'Camp',
    'farms': 'Farm', 'mines': 'Mine', 'caves': 'Cave_Passage', 'lore': 'Lore' };
  const hue = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const colorOf = (c, ni) => c.id === 'ore-veins' ? ORE_COL[c.names[ni]] || '#ccc' : c.id === 'plants' ? `hsl(${70 + hue(c.names[ni]) % 90},65%,55%)` : '#8fd0f5';

  let data = null, loading = null;
  const load = () => loading || (loading = fetch('data/carte.json').then(r => { if (!r.ok) throw new Error('carte'); return r.json(); }).then(j => (data = j)));
  const cat = id => data.cats.find(c => c.id === id);
  const keyOf = (c, ni) => SUBS.has(c.id) ? `${c.id}:${ni}` : c.id;
  const ptsOf = key => { const [id, ni] = key.split(':'); const c = cat(id); return c.pts.map((p, i) => [p, i]).filter(([p]) => ni == null || p[2] === Number(ni)); };
  const hasIco = (c, ni) => c.keys && c.keys[ni] && !c.noIco.includes(ni);
  const icoHtml = (c, ni, size = 20) => hasIco(c, ni) ? `<img src="img/res/${esc(c.keys[ni])}.png" alt="" width="${size}" height="${size}">`
    : SUBS.has(c.id) ? `<i class="c-dot" style="background:${colorOf(c, ni)}"></i>` : catIco(c, size);
  const catIco = (c, size = 20) => GAME_ICO[c.id] ? `<img src="img/icones-carte/${GAME_ICO[c.id]}.png" alt="" width="${size}" height="${size}">` : `<span class="c-emo">${c.ico}</span>`;

  // ---------- État de la carte affichée ----------
  let M = null, opts = null, built = new Map(), byId = new Map(), on = new Set(), hideDone = false, labels = null, renderer = null, places = null, showNames = true;
  // Noms des lieux écrits sur la carte, comme dans le jeu (« Sanctuaire intérieur », « Pont de Braelyn »…)
  const NAMED = ['landmarks', 'villages', 'farms', 'mines', 'camps'];
  function placesLayer() {
    const kept = [];
    for (const id of NAMED) { const c = cat(id); if (!c) continue;
      for (const p of c.pts) { const n = c.names[p[2]];
        if (/^(Mine|Ruines|Épaves)$/.test(n) || kept.some(k => k.n === n && Math.hypot(k.x - p[0], k.y - p[1]) < 800)) continue;
        kept.push({ n, x: p[0], y: p[1], minor: id !== 'landmarks' && id !== 'villages' }); } }
    return L.layerGroup(kept.map(k => L.marker([k.y, k.x], { interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'c-place' + (k.minor ? ' minor' : ''), html: `<span>${esc(k.n)}</span>`, iconSize: [0, 0] }) })));
  }

  function markerFor(c, i, p, big) {
    const ll = [p[1], p[0]], ni = p[2], id = c.ids ? c.ids[i] : null, done = id && opts.isDone(id);
    let m;
    if (big) m = L.circleMarker(ll, { renderer, radius: SUBS.has(c.id) ? 4 : 5, weight: 1, color: '#08121c', fillColor: done ? '#5d6670' : colorOf(c, ni), fillOpacity: done ? 0.35 : 0.95 });
    else m = L.marker(ll, { icon: L.divIcon({ className: 'cm-w', html: `<div class="cm ${GAME_ICO[c.id] ? 'cm-game' : c.g === 'res' ? 'cm-res' : 'cm-poi g-' + c.g}${done ? ' done' : ''}">${icoHtml(c, ni, GAME_ICO[c.id] ? 30 : 20)}</div>`, iconSize: GAME_ICO[c.id] ? [30, 30] : [26, 26], iconAnchor: GAME_ICO[c.id] ? [15, 15] : [13, 13] }), riseOnHover: true, keyboard: false });
    m.bindTooltip(() => `<b>${esc(c.names[ni])}</b>${c.subs && p[3] >= 0 ? ` · ${esc(c.subs[p[3]])}` : ''}${done ? ' ✓' : ''}`, { direction: 'top', offset: big ? [0, -5] : [0, -13], className: 'c-tip' });
    m.on('click', () => { m.unbindPopup(); m.bindPopup(popupHtml(c, i), { maxWidth: 320, className: 'c-pop' }).openPopup(); });
    if (id) m.on('contextmenu', ev => { L.DomEvent.preventDefault(ev.originalEvent); ACTIONS.carteDone(id); }); // clic droit : cocher / décocher
    m._c = { c, i, big };
    if (id) byId.set(id, m);
    return m;
  }
  function popupHtml(c, i) {
    const p = c.pts[i], ni = p[2], id = c.ids ? c.ids[i] : null, done = id && opts.isDone(id);
    let h = `<div class="c-pop-h">${icoHtml(c, ni, 28)}<div><b>${esc(c.names[ni])}</b><div class="small muted">${esc(c.fr)}${c.subs && p[3] >= 0 && c.id !== 'ore-rocks' ? ' · ' + esc(c.subs[p[3]]) : ''}</div></div></div>`;
    if (c.id === 'ore-veins') h += `<div>Filon de <b>${p[3].toLocaleString('fr-FR')} m³</b> · ${p[4] < 0 ? '<b>en surface</b>' : `à <b>${p[4]} m</b> sous terre`}</div>`;
    if (c.id === 'ore-rocks' && c.subs) h += `<div>Contient : ${esc(c.subs[p[3]])}</div>`;
    if (c.descs && p[4] >= 0 && c.id !== 'ore-veins') h += `<div class="small">${esc(c.descs[p[4]])}</div>`;
    const mk = c.keys && opts.matKey(c.keys[ni]);
    if (mk) h += `<a class="small" data-go="resources|${esc(mk)}">Fiche de la ressource →</a>`;
    if (id) h += `<div style="margin-top:6px"><button class="btn sm ${done ? '' : 'pri'}" data-act="carteDone" data-arg="${esc(id)}">${done ? '↺ Pas encore fait' : '✓ Marquer comme fait'}</button></div>`;
    return `<div class="c-pop-in">${h}</div>`;
  }
  // Beaucoup de points (ou plus de 3 espèces de plantes à la fois) : points dessinés, sinon icônes
  const bigFor = (key, n) => n > BIG || (key.startsWith('plants:') && [...on].filter(k => k.startsWith('plants:')).length > 3);
  function layer(key) {
    const [id] = key.split(':'), c = cat(id), pts = ptsOf(key), big = bigFor(key, pts.length);
    const old = built.get(key);
    if (old && old._big === big) return old;
    if (old) M.removeLayer(old);
    const g = L.layerGroup(pts.filter(([, i]) => !(hideDone && c.ids && opts.isDone(c.ids[i]))).map(([p, i]) => markerFor(c, i, p, big)));
    g._big = big;
    built.set(key, g);
    return g;
  }
  function apply() {
    for (const [k, g] of built) if (!on.has(k) && M.hasLayer(g)) M.removeLayer(g);
    for (const k of on) { const g = layer(k); if (!M.hasLayer(g)) g.addTo(M); }
    ls.set('carteOn', [...on]);
    syncSide();
  }
  function rebuild() { for (const g of built.values()) M.removeLayer(g); built = new Map(); byId = new Map(); apply(); }

  // ---------- Panneau de filtres ----------
  function sideHtml() {
    const grp = Object.entries(data.groups).map(([g, label]) => {
      const cs = data.cats.filter(c => c.g === g);
      return `<details class="c-grp" ${g === 'res' || cs.some(c => [...on].some(k => k.split(':')[0] === c.id)) ? 'open' : ''}><summary>${esc(label)}</summary>${cs.map(c => SUBS.has(c.id)
        ? `<div class="c-sub"><div class="c-subh"><label class="c-row"><input type="checkbox" data-cat="${c.id}"><span class="c-ic">${catIco(c, 18)}</span><span class="c-nm">${esc(c.fr)}</span><span class="c-n">${c.n.toLocaleString('fr-FR')}</span></label><button class="c-exp" data-exp="${c.id}" title="Choisir une ressource">▸</button></div>
          <div class="c-mats" ${c.id === 'ore-veins' ? '' : 'hidden'}>${c.names.map((n, ni) => [n, ni, c.pts.filter(p => p[2] === ni).length]).sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([n, ni, k]) =>
            `<label class="c-row"><input type="checkbox" data-k="${c.id}:${ni}"><span class="c-ic">${icoHtml(c, ni, 18)}</span><span class="c-nm">${esc(n)}</span><span class="c-n">${k}</span></label>`).join('')}</div></div>`
        : `<label class="c-row"><input type="checkbox" data-k="${c.id}"><span class="c-ic">${catIco(c, 18)}</span><span class="c-nm">${esc(c.fr)}</span><span class="c-n" data-n="${c.id}"></span></label>`).join('')}</details>`;
    }).join('');
    return `<input id="cQ" type="search" class="search" placeholder="Rechercher : ambre, cuivre, boss, village…" autocomplete="off">
      <div id="cRes" class="c-results"></div>
      <div class="row c-tools"><button class="btn sm" data-c="lieux" title="Tous les lieux, sans les ressources">Tous les lieux</button><button class="btn sm ghost" data-c="none">Tout masquer</button></div>
      <label class="c-row c-hide"><input type="checkbox" id="cHide" ${hideDone ? 'checked' : ''}><span class="c-nm">Masquer ce que j'ai fait</span></label>
      <p class="small muted" style="margin:4px 2px 8px">Clic sur un point : détails. <b>Clic droit</b> : le cocher comme fait.</p>
      <label class="c-row"><input type="checkbox" id="cNames" ${showNames ? 'checked' : ''}><span class="c-nm">Noms des lieux (comme en jeu)</span></label>
      <div class="c-groups">${grp}</div>
      <p class="small muted c-src">Fond : wiki Enshrouded</p>`;
  }
  function syncSide() {
    const side = opts.side;
    side.querySelectorAll('input[data-k]').forEach(i => { i.checked = on.has(i.dataset.k); });
    side.querySelectorAll('input[data-cat]').forEach(i => {
      const c = cat(i.dataset.cat), k = c.names.filter((_, ni) => on.has(`${c.id}:${ni}`)).length;
      i.checked = k === c.names.length; i.indeterminate = k > 0 && k < c.names.length;
    });
    side.querySelectorAll('[data-n]').forEach(s => {
      const c = cat(s.dataset.n);
      const d = c.ids ? c.ids.filter(id => opts.isDone(id)).length : 0;
      s.textContent = c.ids && d ? `${d}/${c.n}` : c.n.toLocaleString('fr-FR');
      s.title = c.ids ? `${d} fait(s) sur ${c.n}` : '';
    });
  }
  // Recherche : ressources (filons, plantes), catégories, lieux nommés
  function search(q) {
    const nq = norm(q), out = [];
    if (nq.length < 2) return out;
    const hit = s => { const t = norm(s); return t.startsWith(nq) || t.split(' ').some(w => w.startsWith(nq)) || t.includes(' ' + nq); };
    for (const c of data.cats) if (SUBS.has(c.id)) c.names.forEach((n, ni) => { if (hit(n)) out.push({ t: 'res', key: `${c.id}:${ni}`, html: `${icoHtml(c, ni, 18)} <b>${esc(n)}</b> <span class="muted">· ${c.pts.filter(p => p[2] === ni).length} ${c.id === 'ore-veins' ? 'filons' : 'plantes'}</span>` }); });
    for (const c of data.cats) if (hit(c.fr)) out.push({ t: 'cat', key: c.id, html: `${catIco(c, 18)} <b>${esc(c.fr)}</b> <span class="muted">· ${c.n}</span>` });
    for (const c of data.cats) if (!SUBS.has(c.id) && c.names.length > 1) c.pts.forEach((p, i) => {
      if (out.length < 40 && hit(c.names[p[2]])) out.push({ t: 'pt', cat: c.id, i, html: `${catIco(c, 18)} ${esc(c.names[p[2]])} <span class="muted">· ${esc(c.fr)}${c.subs && p[3] >= 0 ? ' · ' + esc(c.subs[p[3]]) : ''}</span>` });
    });
    return out.slice(0, 14);
  }
  function showResults(q) {
    const box = opts.side.querySelector('#cRes'), r = search(q);
    box.innerHTML = r.map((x, j) => `<div class="c-hit" data-j="${j}">${x.html}</div>`).join('') || (norm(q).length >= 2 ? '<div class="small muted">Rien trouvé.</div>' : '');
    box.querySelectorAll('.c-hit').forEach(el => el.addEventListener('click', () => pick(r[Number(el.dataset.j)])));
    box._r = r;
  }
  function pick(x) {
    if (!x) return;
    if (x.t === 'res') focusKey(x.key);
    else if (x.t === 'cat') { const c = cat(x.key); (SUBS.has(c.id) ? c.names.map((_, ni) => `${c.id}:${ni}`) : [c.id]).forEach(k => on.add(k)); apply(); fit(SUBS.has(c.id) ? null : c.id); }
    else { const c = cat(x.cat); on.add(c.id); apply(); const p = c.pts[x.i]; M.flyTo([p[1], p[0]], Math.max(M.getZoom(), 5)); setTimeout(() => { const m = [...layer(c.id).getLayers()].find(m => m._c.i === x.i); if (m) m.fire('click'); }, 700); }
  }
  // Une ressource choisie : on n'affiche qu'elle (les lieux restent) et on cadre ses points
  function focusKey(key) {
    for (const k of [...on]) if (SUBS.has(k.split(':')[0])) on.delete(k);
    on.add(key); apply(); fit(key);
  }
  function fit(key) {
    const pts = key ? ptsOf(key).map(([p]) => [p[1], p[0]]) : null;
    if (pts && pts.length) M.flyToBounds(L.latLngBounds(pts).pad(0.08), { maxZoom: 5, duration: 0.6 });
  }

  // ---------- Montage dans la page ----------
  function mount(o) {
    opts = o;
    if (M) { M.remove(); M = null; }
    o.map.innerHTML = '<div class="c-loading">Chargement de la carte…</div>';
    return load().then(() => {
      o.map.innerHTML = '';
      built = new Map(); byId = new Map();
      hideDone = ls.get('carteHide', false);
      on = new Set(ls.get('carteOn', null) || data.cats.filter(c => c.on).map(c => c.id));
      renderer = L.canvas({ padding: 0.4 });
      M = L.map(o.map, { crs: CRS, minZoom: 1, maxZoom: 6, zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, maxBounds: [[-1500, -1500], [SIZE + 1500, SIZE + 1500]], maxBoundsViscosity: 0.7, attributionControl: false, zoomControl: true });
      L.tileLayer('img/carte/{z}/{x}_{y}.jpg', { tileSize: TILE, minZoom: 1, maxZoom: 6, maxNativeZoom: NATIVE, noWrap: true, bounds: [[0, 0], [SIZE, SIZE]] }).addTo(M);
      // Noms des régions, visibles de loin
      labels = L.layerGroup((o.labels || []).map(([t, x, y]) => L.marker([y, x], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'c-region', html: `<span>${esc(t)}</span>`, iconSize: [0, 0] }) })));
      places = placesLayer();
      showNames = ls.get('carteNames', true);
      // De loin : les grandes régions ; de près : le nom des lieux
      const lbl = () => { const z = M.getZoom(); o.map.dataset.z = Math.floor(z);
        if (z < 3) labels.addTo(M); else M.removeLayer(labels);
        if (z >= 3 && showNames) places.addTo(M); else M.removeLayer(places); };
      o.map._lbl = lbl;
      M.on('zoomend', lbl);
      const v = ls.get('carteView', null);
      if (v) M.setView([v[0], v[1]], v[2]); else M.fitBounds([[0, 0], [SIZE, SIZE]]);
      lbl();
      M.on('moveend', () => { const c = M.getCenter(); ls.set('carteView', [Math.round(c.lat), Math.round(c.lng), M.getZoom()]); });
      // Panneau
      o.side.innerHTML = sideHtml();
      o.side.addEventListener('change', e => {
        const t = e.target;
        if (t.id === 'cHide') { hideDone = t.checked; ls.set('carteHide', hideDone); rebuild(); return; }
        if (t.id === 'cNames') { showNames = t.checked; ls.set('carteNames', showNames); o.map._lbl(); return; }
        if (t.dataset.k) { if (t.checked) on.add(t.dataset.k); else on.delete(t.dataset.k); apply(); }
        if (t.dataset.cat) { const c = cat(t.dataset.cat); c.names.forEach((_, ni) => { const k = `${c.id}:${ni}`; if (t.checked) on.add(k); else on.delete(k); }); apply(); }
      });
      o.side.querySelectorAll('[data-exp]').forEach(b => {
        const box = b.closest('.c-sub').querySelector('.c-mats'), upd = () => { b.textContent = box.hidden ? '▸' : '▾'; };
        upd(); b.addEventListener('click', () => { box.hidden = !box.hidden; upd(); });
      });
      o.side.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.c === 'none') on.clear();
        else data.cats.filter(c => c.g !== 'res' && c.id !== 'return-beacons' && c.id !== 'upstreams' && c.id !== 'chests' && c.id !== 'lore').forEach(c => on.add(c.id));
        apply();
      }));
      const q = o.side.querySelector('#cQ');
      q.addEventListener('input', () => showResults(q.value));
      q.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = o.side.querySelector('#cRes')._r; if (r && r[0]) pick(r[0]); } });
      apply();
      setTimeout(() => M.invalidateSize(), 50);
      if (o.focus && o.focus.loot) focusLoot(o.focus.loot); else if (o.focus) focusSlug(o.focus);
    }).catch(() => { o.map.innerHTML = '<div class="c-loading">Impossible de charger la carte. Recharge la page (F5).</div>'; });
  }
  // Où tombe un objet d'équipement : seulement les coffres de la bonne fourchette de niveaux et les boss qui le lâchent,
  // ou un coffre précis. Un bandeau en haut du panneau le rappelle ; ✕ revient à la carte normale.
  let loot = null;
  const chestLv = (c, p) => Number(String((c.subs || [])[p[3]] || '').replace(/\D/g, ''));
  // Région de chaque coffre : celle du point de traditions ou de pêche le plus proche (ils portent le nom de leur région)
  const REGIONS = ['Hautes pâtures', 'Bois envoûtés', 'Blackmire', 'Plateaux nomades', 'Regs exaltés', "Sommets de l'Albaneve", 'Bassin des eaux voilées', 'Berceau des cendres'];
  let chestReg = null;
  function regionOfChests() {
    if (chestReg) return chestReg;
    const anchors = [];
    for (const id of ['lore', 'fishing-spots']) { const c = cat(id); c.pts.forEach(p => { const r = (c.subs || [])[p[3]]; if (REGIONS.includes(r)) anchors.push([p[0], p[1], r]); }); }
    chestReg = cat('chests').pts.map(p => { let best = null, d = Infinity; for (const a of anchors) { const e = (a[0] - p[0]) ** 2 + (a[1] - p[1]) ** 2; if (e < d) { d = e; best = a[2]; } } return best; });
    return chestReg;
  }
  // Régions où l'objet tombe vraiment (« surtout dans les régions X (338), Y (166) et Z (6) » : Z est écartée, trop rare)
  const lootRegions = rg => { const out = [], re = new RegExp('(' + REGIONS.join('|') + ')(?: \\((\\d+)\\))?', 'g'); let m; while ((m = re.exec(rg || ''))) if (!m[2] || Number(m[2]) >= 20) out.push(m[1]); return out; };
  function clearLoot() { if (loot) { M.removeLayer(loot); loot = null; } const b = opts.side.querySelector('.c-loot'); if (b) b.remove(); }
  function focusLoot(f) {
    clearLoot();
    const ch = cat('chests'), bo = cat('bosses'), picked = [];
    if (f.chest) { const i = ch.ids.indexOf(f.chest); if (i >= 0) picked.push([ch, i]); }
    else {
      const regs = lootRegions(f.rg), reg = regs.length ? regionOfChests() : null;
      if (f.ch) ch.pts.forEach((p, i) => { const lv = chestLv(ch, p); if (lv >= f.ch[0] && lv <= f.ch[1] && (!reg || regs.includes(reg[i]))) picked.push([ch, i]); });
      if (f.b) bo.pts.forEach((p, i) => { if (f.b.includes(bo.names[p[2]])) picked.push([bo, i]); });
    }
    // les autres coffres et boss sont masqués pour ne voir que ceux-là
    on.delete('chests'); on.delete('bosses'); apply();
    loot = L.layerGroup(picked.map(([c, i]) => markerFor(c, i, c.pts[i], false))).addTo(M);
    const nc = picked.filter(([c]) => c === ch).length, nb = picked.length - nc;
    const b = document.createElement('div');
    b.className = 'c-loot';
    b.innerHTML = `<div>🎯 <b>${esc(f.name)}</b><br><span class="small">${f.chest ? 'Le coffre où il se trouve' : `${nc} coffre${nc > 1 ? 's' : ''}${f.ch ? ` de niveau ${f.ch[0]} à ${f.ch[1]}` : ''}${nb ? ` · ${nb} boss` : ''}${f.rg ? `<br>${esc(f.rg.replace(/^(surtout )?dans /, 'Surtout dans '))}` : ''}`}</span></div><button class="c-exp" title="Revenir à la carte normale">✕</button>`;
    b.querySelector('button').addEventListener('click', clearLoot);
    opts.side.prepend(b);
    const pts = picked.map(([c, i]) => [c.pts[i][1], c.pts[i][0]]);
    if (pts.length === 1) { M.flyTo(pts[0], 5); setTimeout(() => loot.getLayers()[0].fire('click'), 800); }
    else if (pts.length) M.flyToBounds(L.latLngBounds(pts).pad(0.08), { maxZoom: 5, duration: 0.6 });
  }
  // Ouvre la carte sur une ressource (identifiant « copper-ore »)
  function focusSlug(slug) {
    const r = window.CARTE_RES && CARTE_RES[slug];
    if (!r || !M) return;
    const c = cat(r[0]);
    const key = SUBS.has(c.id) ? `${c.id}:${r[1]}` : c.id;
    if (SUBS.has(c.id)) focusKey(key); else { on.add(key); apply(); fit(key); }
    const q = opts.side.querySelector('#cQ'); if (q) { q.value = c.names[r[1]]; showResults(q.value); }
  }
  // Un lieu vient d'être marqué fait / pas fait
  function setDone(id) {
    const m = byId.get(id); if (!m || !M) { syncSide(); return; }
    const { c, i, big } = m._c, p = c.pts[i], done = opts.isDone(id);
    if (hideDone && done) { M.closePopup(); built.forEach(g => g.removeLayer(m)); byId.delete(id); }
    else if (big) m.setStyle({ fillColor: done ? '#5d6670' : colorOf(c, p[2]), fillOpacity: done ? 0.35 : 0.95 });
    else { const el = m.getElement(); if (el && el.firstChild) el.firstChild.classList.toggle('done', !!done); m.setPopupContent(popupHtml(c, i)); }
    if (big && m.getPopup()) m.setPopupContent(popupHtml(c, i));
    syncSide();
  }
  const unmount = () => { if (M) { M.remove(); M = null; } };
  return { mount, unmount, setDone, focusSlug, active: () => !!M };
})();
