'use strict';

const REPO = 'LeVieuxSinge38/compagnon-enshrouded';
const API_RELEASES = 'https://api.github.com/repos/' + REPO + '/releases?per_page=30';
const apiCompare = (tag) => 'https://api.github.com/repos/' + REPO + '/compare/' + tag + '...main';

const _dev = { data: null, ts: 0, loading: false };

function _devNav() {
  const el = document.getElementById('navDev');
  if (!el) return;
  if (srv && srv.app && srv.app.channel === 'test') {
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
}
_devNav();
setInterval(_devNav, 2000);

async function _devFetch() {
  if (_dev.loading) return;
  _dev.loading = true;
  try {
    const relRes = await fetch(API_RELEASES);
    if (!relRes.ok) throw new Error('HTTP ' + relRes.status);
    const releases = await relRes.json();

    const stable = releases.find(function (r) { return r.prerelease === false; }) || null;
    const test = releases.find(function (r) { return r.tag_name === 'test'; }) || null;

    let commits = [];
    if (stable) {
      const cmpRes = await fetch(apiCompare(stable.tag_name));
      if (cmpRes.ok) {
        const cmp = await cmpRes.json();
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

VIEWS.dev = function () {
  var h = '<h1><i class="gi gi-cog"></i> D\u00e9veloppeur</h1>';
  h += '<p class="sub">R\u00e9serv\u00e9 au canal test : ce que tu as, ce qui est public, et ce qui partira \u00e0 la prochaine publication.</p>';

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

  h += '<div class="grid2">';

  // Carte Versions
  h += '<div class="card stack">';
  h += '<h2>Versions</h2>';
  h += '<p>Ma version : <b>' + esc(srv.app.version) + '</b> (canal test)</p>';
  if (stable) {
    var dPub = new Date(stable.published_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    h += '<p>Version publique : <b>' + esc(stable.name) + '</b> \u2014 publi\u00e9e le ' + esc(dPub) + '</p>';
  }
  if (test) {
    var dTest = new Date(test.published_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    h += '<p>Derni\u00e8re version de test : ' + esc(dTest) + '</p>';
  }
  h += '<button class="btn sm" data-act="devRefresh">Actualiser</button>';
  h += '</div>';

  // Carte Prochaine mise à jour publique
  h += '<div class="card stack">';
  h += '<h2>Prochaine mise \u00e0 jour publique</h2>';
  if (commits.length === 0) {
    h += '<p class="muted">Rien en attente : tout est d\u00e9j\u00e0 publi\u00e9.</p>';
  } else {
    h += '<p><b>' + commits.length + ' modification(s)</b> pas encore publi\u00e9e(s) :</p>';
    h += '<ul>';
    for (var i = 0; i < commits.length; i++) {
      h += '<li>' + esc(commits[i]) + '</li>';
    }
    h += '</ul>';
    h += '<p class="small muted">Pour corriger ce texte ou publier pour tout le monde, dis-le simplement \u00e0 Claude (\u00ab publie \u00bb).</p>';
  }
  h += '</div>';

  // Carte Notes (pleine largeur)
  h += '<div class="card stack" style="grid-column:1/-1">';
  h += '<h2>Notes de la version publique actuelle</h2>';
  if (stable && stable.body) {
    h += '<pre style="white-space:pre-wrap;font-family:inherit;margin:0">' + esc(stable.body) + '</pre>';
  } else {
    h += '<p class="muted">Aucune note disponible.</p>';
  }
  h += '</div>';

  h += '</div>';
  return h;
};

AFTER.dev = function () {
  var now = Date.now();
  if ((!_dev.data || now - _dev.ts > 60000) && !_dev.loading) {
    _devFetch().then(function () {
      if (state.view === 'dev') render();
    });
  }
};

ACTIONS.devRefresh = function () {
  _dev.data = null;
  _dev.ts = 0;
  render();
};
