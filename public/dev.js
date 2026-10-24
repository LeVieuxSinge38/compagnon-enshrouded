'use strict';

const REPO = 'LeVieuxSinge38/compagnon-enshrouded';
const API_RELEASES = 'https://api.github.com/repos/' + REPO + '/releases?per_page=30';
const apiCompare = (tag) => 'https://api.github.com/repos/' + REPO + '/compare/' + tag + '...main';

const appHost = window.chrome && window.chrome.webview;

const _dev = { data: null, ts: 0, loading: false };

/* ---------- Navigation (onglet dev) ---------- */
function _devNav() {
  var el = document.getElementById('navDev');
  if (!el) return;
  if (srv && srv.app && srv.app.dev === true) {
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
}
_devNav();
setInterval(_devNav, 2000);

/* ---------- Fetch GitHub ---------- */
async function _devFetch() {
  if (_dev.loading) return;
  _dev.loading = true;
  try {
    var relRes = await fetch(API_RELEASES);
    if (!relRes.ok) throw new Error('HTTP ' + relRes.status);
    var releases = await relRes.json();

    var stable = releases.find(function (r) { return r.prerelease === false; }) || null;
    var test = releases.find(function (r) { return r.tag_name === 'test'; }) || null;

    var commits = [];
    if (stable) {
      var cmpRes = await fetch(apiCompare(stable.tag_name));
      if (cmpRes.ok) {
        var cmp = await cmpRes.json();
        commits = (cmp.commits || [])
          .map(function (c) { return (c.commit.message || '').split('\n')[0]; })
          .filter(function (m) { return m.indexOf('Compagnon 2.') !== 0; });
      }
    }

    _dev.data = { stable: stable, test: test, commits: commits };
    _dev.ts = Date.now();
  } catch (e) {
    _dev.data = { error: e.message || String(e) };
    _dev.ts = Date.now();
  } finally {
    _dev.loading = false;
  }
}

/* ---------- Styles injectés une seule fois ---------- */
var _devStylesInjected = false;
function _devInjectStyles() {
  if (_devStylesInjected) return;
  _devStylesInjected = true;
  var s = document.createElement('style');
  s.textContent = [
    '.dev-line{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;border-left:4px solid #888;margin-bottom:6px;background:rgba(0,0,0,.04)}',
    '.dev-line.dev-ok{border-left-color:#39a96b}',
    '.dev-line.dev-no{border-left-color:#d9534f;text-decoration:line-through;opacity:.6}',
    '.dev-line.dev-edit{border-left-color:#e08a2a}',
    '.dev-line .dev-text{flex:1;font-size:14px;line-height:1.4}',
    '.dev-mk{width:30px;height:30px;border-radius:50%;border:1px solid var(--line,#ccc);background:transparent;color:#fff;cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0}',
    '.dev-mk.ok.on{background:#39a96b;border-color:#39a96b}',
    '.dev-mk.no.on{background:#d9534f;border-color:#d9534f}',
    '.dev-mk.edit.on{background:#e08a2a;border-color:#e08a2a}'
  ].join('\n');
  document.head.appendChild(s);
}

/* ---------- localStorage marks ---------- */
var MARKS_KEY = 'ens.dev.marks';
function _devReadMarks() {
  try {
    var raw = localStorage.getItem(MARKS_KEY);
    if (!raw) return {};
    var obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) { return {}; }
}
function _devWriteMarks(marks) {
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch (e) { /* quota / private mode */ }
}

/* ---------- PATCH_OVERRIDES helper ---------- */
function _devDisplayText(original) {
  var ov = (typeof window.PATCH_OVERRIDES === 'object' && window.PATCH_OVERRIDES) ? window.PATCH_OVERRIDES : null;
  if (ov && ov[original] !== undefined && ov[original] !== original) {
    return { text: ov[original], rewritten: true };
  }
  return { text: original, rewritten: false };
}

/* ---------- Tile style helper ---------- */
function _devTileStyle(bg) {
  return 'background:' + bg + ';color:#fff;border-radius:16px;padding:18px;';
}

/* ---------- VIEWS.dev ---------- */
VIEWS.dev = function () {
  // Sécurité : réservé au propriétaire
  if (!srv || !srv.app || srv.app.dev !== true) {
    return '<p class="muted">R\u00e9serv\u00e9 au propri\u00e9taire du Compagnon.</p>';
  }

  _devInjectStyles();

  var h = '<h1><i class="gi gi-cog"></i> D\u00e9veloppeur</h1>';
  h += '<p class="sub">R\u00e9serv\u00e9 au propri\u00e9taire : ce que tu as, ce qui est public, et ce qui partira \u00e0 la prochaine publication.</p>';

  if (!_dev.data) {
    h += '<p class="muted">Chargement depuis GitHub\u2026</p>';
    return h;
  }

  if (_dev.data.error) {
    h += '<p class="muted">Impossible de joindre GitHub : ' + esc(_dev.data.error) + '</p>';
    return h;
  }

  var stable = _dev.data.stable;
  var test = _dev.data.test;
  var commits = _dev.data.commits;

  // --- Deux tuiles côte à côte ---
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';

  // Tuile ORANGE
  h += '<div style="' + _devTileStyle('linear-gradient(135deg,#b35a12,#e08a2a)') + '">';
  h += '<div style="font-size:11px;font-weight:700;letter-spacing:1px;opacity:.85;margin-bottom:6px">MA VERSION</div>';
  h += '<div style="font-size:34px;font-weight:800;line-height:1.15">Version b\u00eata ' + esc(srv.app.version) + '</div>';
  if (test) {
    var dTest = new Date(test.published_at).toLocaleDateString('fr-FR', { dateStyle: 'long' });
    h += '<div style="margin-top:8px;font-size:13px;opacity:.9">Canal test \u00b7 derni\u00e8re version de test le ' + esc(dTest) + '</div>';
  }
  h += '</div>';

  // Tuile VERTE
  h += '<div style="' + _devTileStyle('linear-gradient(135deg,#1f7a45,#39a96b)') + '">';
  h += '<div style="font-size:11px;font-weight:700;letter-spacing:1px;opacity:.85;margin-bottom:6px">VERSION PUBLIQUE</div>';
  if (stable) {
    var pubName = (stable.name || '').replace(/^Compagnon Enshrouded\s+/, '');
    h += '<div style="font-size:34px;font-weight:800;line-height:1.15">' + esc(pubName) + '</div>';
    var dPub = new Date(stable.published_at).toLocaleDateString('fr-FR', { dateStyle: 'long' });
    h += '<div style="margin-top:8px;font-size:13px;opacity:.9">Publi\u00e9e le ' + esc(dPub) + '</div>';
  } else {
    h += '<div style="font-size:34px;font-weight:800;line-height:1.15">\u2014</div>';
  }
  h += '</div>';

  h += '</div>';

  // Bouton Actualiser
  h += '<div style="margin-bottom:20px"><button class="btn" data-act="devRefresh"><i class="gi gi-refresh"></i> Actualiser</button></div>';

  // --- Carte Prochaine mise à jour publique ---
  h += '<div class="card stack" style="margin-bottom:16px">';
  h += '<h2>Prochaine mise \u00e0 jour publique</h2>';

  if (commits.length === 0) {
    h += '<p class="muted">Rien en attente : tout est d\u00e9j\u00e0 publi\u00e9.</p>';
  } else {
    var marks = _devReadMarks();

    // Liste des lignes à marquer
    h += '<div style="margin-bottom:12px">';
    for (var i = 0; i < commits.length; i++) {
      var original = commits[i];
      var disp = _devDisplayText(original);
      var mark = marks[original] || null;
      var cls = 'dev-line dev-' + (mark || 'none');

      h += '<div class="' + cls + '">';
      h += '<span class="dev-text">' + esc(disp.text);
      if (disp.rewritten) {
        h += ' <span class="small muted">(reformul\u00e9)</span>';
      }
      h += '</span>';

      // Trois boutons
      var marksArr = ['ok', 'no', 'edit'];
      var labels = { ok: '\u2713', no: '\u2715', edit: '\u270e' };
      var titles = { ok: 'Garder', no: 'Ne pas mettre', edit: '\u00c0 reformuler' };
      for (var m = 0; m < marksArr.length; m++) {
        var mk = marksArr[m];
        var onCls = (mark === mk) ? ' on' : '';
        h += '<button class="dev-mk ' + mk + onCls + '" data-act="devMark" data-arg="' + mk + '|' + i + '" title="' + titles[mk] + '">' + labels[mk] + '</button>';
      }
      h += '</div>';
    }
    h += '</div>';

    // Compteur
    var cOk = 0, cNo = 0, cEdit = 0, cNone = 0;
    for (var j = 0; j < commits.length; j++) {
      var mk2 = marks[commits[j]];
      if (mk2 === 'ok') cOk++;
      else if (mk2 === 'no') cNo++;
      else if (mk2 === 'edit') cEdit++;
      else cNone++;
    }
    h += '<p class="small" style="margin:10px 0">' + cOk + ' \u00e0 garder \u00b7 ' + cNo + ' \u00e9cart\u00e9es \u00b7 ' + cEdit + ' \u00e0 reformuler \u00b7 ' + cNone + ' pas encore marqu\u00e9es</p>';

    // Bouton "Copier la demande pour Claude" si Z > 0
    if (cEdit > 0) {
      h += '<div style="margin-bottom:10px"><button class="btn" data-act="devAsk"><i class="gi gi-talk"></i> Copier la demande pour Claude</button></div>';
    }

    // Bouton Publier
    var canPublish = (cNone === 0 && cEdit === 0);
    if (appHost) {
      h += '<div style="margin-top:12px"><button class="btn pri" data-act="devPublish" id="devPub"' + (canPublish ? '' : ' disabled') + '><i class="gi gi-upgrade"></i> Publier pour tout le monde</button></div>';
      if (!canPublish) {
        h += '<p class="small muted">Marque chaque ligne (\u2713 garder, \u2715 \u00e9carter) pour pouvoir publier.</p>';
      }
    } else {
      h += '<p class="small muted" style="margin-top:12px">La publication se fait depuis l\u2019appli Windows.</p>';
    }
    h += '<div id="devPubMsg" class="small"></div>';
  }
  h += '</div>';

  // --- Carte Notes de la version publique actuelle ---
  h += '<div class="card stack">';
  h += '<h2>Notes de la version publique actuelle</h2>';
  if (stable && stable.body) {
    h += '<pre style="white-space:pre-wrap;font-family:inherit;margin:0">' + esc(stable.body) + '</pre>';
  } else {
    h += '<p class="muted">Aucune note disponible.</p>';
  }
  h += '</div>';

  return h;
};

/* ---------- AFTER.dev ---------- */
AFTER.dev = function () {
  var now = Date.now();
  if ((!_dev.data || now - _dev.ts > 60000) && !_dev.loading) {
    _devFetch().then(function () {
      if (state.view === 'dev') render();
    });
  }
};

/* ---------- ACTIONS ---------- */
ACTIONS.devRefresh = function () {
  _dev.data = null;
  _dev.ts = 0;
  render();
};

ACTIONS.devMark = function (arg) {
  // arg = "ok|3" ou "no|0" etc.
  var parts = arg.split('|');
  var markType = parts[0];
  var index = parseInt(parts[1], 10);
  if (isNaN(index) || !_dev.data || !_dev.data.commits) return;

  var commits = _dev.data.commits;
  if (index < 0 || index >= commits.length) return;

  var original = commits[index];
  var marks = _devReadMarks();

  // Si on reclique sur la même marque, on l'enlève
  if (marks[original] === markType) {
    delete marks[original];
  } else {
    marks[original] = markType;
  }

  _devWriteMarks(marks);
  render();
};

ACTIONS.devAsk = function () {
  if (!_dev.data || !_dev.data.commits) return;
  var commits = _dev.data.commits;
  var marks = _devReadMarks();

  var lines = [];
  for (var i = 0; i < commits.length; i++) {
    if (marks[commits[i]] === 'edit') {
      var disp = _devDisplayText(commits[i]);
      lines.push('- \u00ab ' + disp.text + ' \u00bb');
    }
  }
  if (lines.length === 0) return;

  var text = 'Patch note : reformule ces lignes (garde le sens, phrase courte et claire pour les joueurs) :\n' + lines.join('\n');

  function _done() {
    var msgEl = document.getElementById('devPubMsg');
    if (msgEl) msgEl.innerHTML = 'Demande copi\u00e9e : colle-la \u00e0 Claude.';
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(_done).catch(function () {
      _fallbackCopy(text); _done();
    });
  } else {
    _fallbackCopy(text); _done();
  }
};

function _fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
}

ACTIONS.devPublish = function () {
  if (!_dev.data || !_dev.data.commits) return;
  var commits = _dev.data.commits;
  var marks = _devReadMarks();

  var highlights = [];
  for (var i = 0; i < commits.length; i++) {
    if (marks[commits[i]] === 'ok') {
      var disp = _devDisplayText(commits[i]);
      highlights.push(disp.text);
    }
  }
  if (highlights.length === 0) return;

  var btn = document.getElementById('devPub');
  var msgEl = document.getElementById('devPubMsg');
  if (btn) btn.disabled = true;
  if (msgEl) msgEl.innerHTML = 'Publication en cours\u2026 (confirme dans la fen\u00eatre Windows)';

  appHost.postMessage('publish:' + JSON.stringify({ highlights: highlights }));
};

/* ---------- Écouteur de réponse depuis l'appli Windows ---------- */
if (appHost && appHost.addEventListener) {
  appHost.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'publish') {
      var msgEl = document.getElementById('devPubMsg');
      if (e.data.ok) {
        if (msgEl) {
          msgEl.innerHTML = '<span style="color:#39a96b">\u2713 ' + esc(e.data.msg) + '</span>';
        }
        // Effacer les marques
        try { localStorage.removeItem(MARKS_KEY); } catch (ex) { /* ignore */ }
        _dev.data = null;
        _dev.ts = 0;
        setTimeout(function () { render(); }, 3000);
      } else {
        if (msgEl) {
          msgEl.innerHTML = '<span style="color:#e08a2a">\u26a0 ' + esc(e.data.msg) + '</span>';
        }
        var btn = document.getElementById('devPub');
        if (btn) btn.disabled = false;
      }
    }
  });
}
