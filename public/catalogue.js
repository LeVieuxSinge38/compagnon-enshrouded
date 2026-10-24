'use strict';
(function () {

  /* 8 – Feuille de style */
  var style = document.createElement('style');
  style.textContent =
    '.cat-grid{align-items:start;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-top:12px;}' +
    '.cat-it{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--card);cursor:pointer;}' +
    '.cat-it:hover{border-color:var(--flame);}' +
    '.cat-it:has(.cat-det){grid-column:1/-1;cursor:default;}' +
'.cat-drops{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px 14px;margin-top:10px;}' +
    '.cat-boss{width:72px;height:72px;border-radius:12px;object-fit:cover;background:#0b1220;border:1px solid var(--line);flex-shrink:0;}.cat-boss-none{display:grid;place-items:center;font-size:34px;color:var(--fg3);}.cat-it:has(.cat-det) .cat-boss{width:140px;height:140px;}' +

    '.cat-it .cat-txt{flex:1;min-width:0;}' +
    '.cat-det{flex-basis:100%;cursor:default;}' +
    '.cat-bar{display:flex;gap:8px;flex-wrap:wrap;}' +
    '.cat-bar input{flex:1;min-width:200px;}';
  document.head.appendChild(style);

  /* 2 – État */
  state.catQ = '';
  state.catType = '';
  state.catSel = null;

  /* 1 – Onglets */
  GROUPS.cat = [
    ['catWeapons', '<i class="gi gi-crossed-swords"></i> Armes'],
    ['catArmor',   '<i class="gi gi-breastplate"></i> Armures'],
    ['catOther',   '<i class="gi gi-ring"></i> Boucliers et anneaux'],
    ['catBoss',    '<i class="gi gi-death-skull"></i> Boss']
  ];

  /* Utilitaires */
  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function matches(q, fr, en) {
    if (!q) return true;
    var nq = norm(q);
    return norm(fr).indexOf(nq) !== -1 || norm(en).indexOf(nq) !== -1;
  }
  function typeFR(t) {
    return (window.WEAPON_TYPE_FR || {})[t] || t;
  }
  function findFR(en) {
    var arr = [window.WEAPONS, window.SHIELDS, window.RINGS];
    for (var i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      for (var j = 0; j < arr[i].length; j++) {
        if (arr[i][j].en === en) return arr[i][j].fr;
      }
    }
    if (window.GEAR) {
      for (var k = 0; k < window.GEAR.length; k++) {
        var pcs = window.GEAR[k].pieces || [];
        for (var m = 0; m < pcs.length; m++) {
          if (pcs[m][0] === en) return pcs[m][2];
        }
      }
    }
    return en;
  }

  /* Carte générique */
  function card(en, fr, subLine, extraLine, extraLine2) {
    var h = '<div class="cat-it" data-act="catOpen" data-arg="' + esc(en) + '">';
    h += zoomIcon(en, 48, fr);
    h += '<div class="cat-txt">';
    h += '<strong>' + esc(fr) + '</strong>';
    h += '<div class="small muted">' + subLine + '</div>';
    if (extraLine) h += '<div class="small">' + extraLine + '</div>';
    if (extraLine2) h += '<div class="small">' + extraLine2 + '</div>';
    h += '</div>';
    if (state.catSel === en) {
      var prov = provHtml(en);
      h += '<div class="cat-det"><div data-act="catNoop">' +
        (prov || '<p class="small muted">Provenance inconnue.</p>') +
        '</div></div>';
    }
    h += '</div>';
    return h;
  }

  /* Barre de recherche commune */
  function barHTML(withType) {
    var h = '<div class="cat-bar">';
    h += '<input id="catQ" type="search" placeholder="Chercher…" value="' + esc(state.catQ) + '">';
    if (withType) {
      var seen = {};
      (window.WEAPONS || []).forEach(function (w) { seen[typeFR(w.type)] = true; });
      var types = Object.keys(seen).sort();
      h += '<select id="catType"><option value="">Tous les types</option>';
      types.forEach(function (t) {
        h += '<option value="' + esc(t) + '"' + (state.catType === t ? ' selected' : '') + '>' + esc(t) + '</option>';
      });
      h += '</select>';
    }
    h += '</div>';
    return h;
  }

  /* 4 – Vues */
  VIEWS.catWeapons = function () {
    var h = '<h1><i class="gi gi-scroll-unfurled"></i> Catalogue</h1>' + barHTML(true);
    var items = (window.WEAPONS || []).filter(function (w) {
      if (!matches(state.catQ, w.fr, w.en)) return false;
      if (state.catType && typeFR(w.type) !== state.catType) return false;
      return true;
    }).sort(function (a, b) { return (a.lv == null ? 999 : a.lv) - (b.lv == null ? 999 : b.lv); });
    var total = items.length;
    items = items.slice(0, 150);
    h += '<div class="cat-grid">';
    items.forEach(function (w) {
      var sub = (w.lv != null ? 'Niv. ' + w.lv + ' · ' : '') + esc(typeFR(w.type));
      var extra = craftAt(w.en) ? '<i class="gi gi-hammer-drop"></i> ' + esc(craftAt(w.en)) : lootShort(w.en);
      h += card(w.en, w.fr, sub, extra);
    });
    h += '</div>';
    if (total > 150) h += '<p class="small muted">… affine ta recherche (' + total + ' résultats)</p>';
    return h;
  };

  VIEWS.catArmor = function () {
    var h = '<h1><i class="gi gi-scroll-unfurled"></i> Catalogue</h1>' + barHTML(false);
    var items = [];
    (window.GEAR || []).forEach(function (g) {
      (g.pieces || []).forEach(function (p) {
        items.push({ en: p[0], fr: p[2], lv: g.lv, set: g.fr });
      });
    });
    items = items.filter(function (it) { return matches(state.catQ, it.fr, it.en); })
      .sort(function (a, b) { return (a.lv == null ? 999 : a.lv) - (b.lv == null ? 999 : b.lv); });
    var total = items.length;
    items = items.slice(0, 150);
    h += '<div class="cat-grid">';
    items.forEach(function (it) {
      var sub = (it.lv != null ? 'Niv. ' + it.lv + ' · ' : '') + esc(it.set);
      var extra = craftAt(it.en) ? '<i class="gi gi-hammer-drop"></i> ' + esc(craftAt(it.en)) : lootShort(it.en);
      var armor = '';
      if (window.ARMOR_STATS && window.ARMOR_STATS[it.en]) {
        var st = window.ARMOR_STATS[it.en];
        armor = 'Armure : ' + st[0] + ' physique / ' + st[1] + ' magique';
      }
      h += card(it.en, it.fr, sub, extra, armor);
    });
    h += '</div>';
    if (total > 150) h += '<p class="small muted">… affine ta recherche (' + total + ' résultats)</p>';
    return h;
  };

  VIEWS.catOther = function () {
    var h = '<h1><i class="gi gi-scroll-unfurled"></i> Catalogue</h1>' + barHTML(false);
    var items = [];
    (window.SHIELDS || []).forEach(function (s) { items.push({ en: s.en, fr: s.fr, lv: s.lv, kind: 'Bouclier' }); });
    (window.RINGS || []).forEach(function (r) { items.push({ en: r.en, fr: r.fr, lv: r.lv, kind: 'Anneau', eff: r.eff }); });
    items = items.filter(function (it) { return matches(state.catQ, it.fr, it.en); })
      .sort(function (a, b) { return (a.lv == null ? 999 : a.lv) - (b.lv == null ? 999 : b.lv); });
    var total = items.length;
    items = items.slice(0, 150);
    h += '<div class="cat-grid">';
    items.forEach(function (it) {
      var sub = (it.lv != null ? 'Niv. ' + it.lv + ' · ' : '') + esc(it.kind);
      var extra = craftAt(it.en) ? '<i class="gi gi-hammer-drop"></i> ' + esc(craftAt(it.en)) : lootShort(it.en);
      var ring = '';
      if (it.eff) ring = it.eff.join(', ');
      h += card(it.en, it.fr, sub, extra, ring);
    });
    h += '</div>';
    if (total > 150) h += '<p class="small muted">… affine ta recherche (' + total + ' résultats)</p>';
    return h;
  };

  VIEWS.catBoss = function () {
    var h = '<h1><i class="gi gi-scroll-unfurled"></i> Catalogue</h1>' + barHTML(false);
    var bosses = {};
    var prov = window.PROV || {};
    Object.keys(prov).forEach(function (en) {
      var b = prov[en].b;
      if (!b) return;
      b.forEach(function (name) {
        if (!bosses[name]) bosses[name] = [];
        bosses[name].push(en);
      });
    });
    Object.keys(window.BOSS_EN || {}).forEach(function (n) { if (!bosses[n]) bosses[n] = []; }); // aussi les boss de la carte sans butin connu
    var names = Object.keys(bosses).sort().filter(function (n) { return matches(state.catQ, n, n); });
    h += '<div class="cat-grid">';
    names.forEach(function (name) {
      var arg = 'boss:' + name;
      h += '<div class="cat-it" data-act="catOpen" data-arg="' + esc(arg) + '">';
      h += (window.BOSS_IMG && BOSS_IMG[name]) ? '<img class="cat-boss" src="' + esc(BOSS_IMG[name]) + '" alt="">' : '<span class="cat-boss cat-boss-none"><i class="gi gi-death-skull"></i></span>';
      h += '<div class="cat-txt">';
      h += '<strong>' + esc(name) + '</strong>';
      if (window.BOSS_EN && BOSS_EN[name] && BOSS_EN[name] !== name) h += '<div class="small muted">' + esc(BOSS_EN[name]) + '</div>';
      h += '<div class="small muted">' + bosses[name].length + ' objet(s) possible(s)</div>';
      h += '</div>';
      if (state.catSel === arg) {
        var det = '<div data-act="catNoop">';
        det += '<button class="btn sm pri" data-act="catBossMap" data-arg="' + esc(name) + '"><i class="gi gi-treasure-map"></i> Voir sur la carte</button>\n';
        det += '<div class="cat-drops">';
        bosses[name].forEach(function (en) {
          var fr = findFR(en);
          det += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">';
          det += zoomIcon(en, 32, fr);
          det += '<span>' + esc(fr) + '</span>';
          det += '</div>';
        });
        det += '</div>';
        det += '</div>';
        h += '<div class="cat-det">' + det + '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
    return h;
  };

  /* 6 – Actions */
  ACTIONS.catOpen = function (arg) {
    state.catSel = state.catSel === arg ? null : arg;
    render();
  };
  ACTIONS.catBossMap = function (nom) {
    state.carteFocus = { loot: { name: nom, b: [nom] } };
    go('carte');
  };
  ACTIONS.catNoop = function () {};

  /* 7 – AFTER : liaison des barres */
  function bindBar() {
    var q = document.getElementById('catQ');
    if (q) {
      q.addEventListener('input', function () {
        state.catQ = q.value;
        render();
        var el = document.getElementById('catQ');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      });
    }
    var t = document.getElementById('catType');
    if (t) {
      t.addEventListener('change', function () {
        state.catType = t.value;
        render();
      });
    }
  }
  AFTER.catWeapons = bindBar;
  AFTER.catArmor   = bindBar;
  AFTER.catOther   = bindBar;
  AFTER.catBoss    = bindBar;

})();
