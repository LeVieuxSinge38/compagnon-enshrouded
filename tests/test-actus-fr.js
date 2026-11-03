'use strict';
// Traduit pour de vrai 2 actualités Steam avec le code de la page (public/news.js).
const fs = require('fs'), vm = require('vm'), path = require('path');
const store = {};
const sandbox = { window: {}, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }, console, setTimeout, Date, JSON, URL };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'news.js'), 'utf8'), sandbox);
const T = sandbox.window.News._test;
const assert = require('assert');
assert.strictEqual(T.frGame('Le Linceul de Embervale'), 'La Brume de Valdebraise');
assert.strictEqual(T.frGame('au Sanctuaire de la Flamme'), 'au Mausolée de Flamme');
// même transport que l'appli : GET Steam, POST formulaire Google
const fetchText = async (url, o = {}) => {
  const r = await fetch(url, o.body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: o.body } : {});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Transport simulé : Steam renvoie 2 annonces ; Google préfixe « FR: » tant que fail est faux
function fake(state) {
  return async (url, o = {}) => {
    if (url.includes('steampowered')) {
      state.steam++;
      return JSON.stringify({ appnews: { newsitems: [1, 2].map(i => ({ gid: i, title: 'Title ' + i, date: 0, contents: '[p]Hello ' + i + '[/p]' })) } });
    }
    if (state.fail) throw new Error('réseau coupé');
    return JSON.stringify([[['FR:' + decodeURIComponent(o.body.slice(2)), '', null, null, 1]]]);
  };
}
async function offline() {
  // (a) cache ens.newsCache sans « fr » : les annonces sont retraduites
  for (const k of Object.keys(store)) delete store[k];
  const stale = [1, 2].map(i => ({ gid: String(i), title: 'Title ' + i, blocks: [{ t: 'p', text: 'Hello ' + i }] }));
  store['ens.newsCache'] = JSON.stringify({ at: Date.now(), items: stale });
  let st = { steam: 0, fail: false };
  let items = await sandbox.window.News.load(fake(st));
  assert(items.length === 2 && items.every(n => n.fr && /^FR:/.test(n.fr.title)), '(a) annonces non retraduites');
  assert(JSON.parse(store['ens.newsCache']).items.every(n => n.fr), '(a) cache sans fr');
  // cache complet : réutilisé sans appel réseau
  st = { steam: 0, fail: false };
  await sandbox.window.News.load(fake(st));
  assert.strictEqual(st.steam, 0, 'cache complet non réutilisé');
  // (b) échec la 1re fois, puis la tentative de session réussit et rappelle la mise à jour
  for (const k of Object.keys(store)) delete store[k];
  st = { steam: 0, fail: true };
  let updated = null;
  items = await sandbox.window.News.load(fake(st), it => { updated = it; }, [50, 50]);
  assert(items.every(n => !n.fr && n.frFailed), '(b) échec attendu');
  assert(!store['ens.newsCache'], '(b) liste non traduite écrite dans le cache');
  st.fail = false;
  await sleep(1500);
  assert(updated && updated.every(n => n.fr && !n.frFailed), '(b) mise à jour non rappelée');
  assert(JSON.parse(store['ens.newsCache']).items.every(n => n.fr), '(b) cache non écrit après réussite');
  console.log('OK hors ligne');
}
(async () => {
  await offline();
  const d = JSON.parse(await fetchText('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1203620&count=3&maxlength=0&feeds=steam_community_announcements&format=json'));
  const items = d.appnews.newsitems.slice(0, 2).map(n => ({ gid: String(n.gid), title: n.title, blocks: T.bbBlocks(n.contents).slice(0, 12) }));
  const r = await T.translateNews(items, fetchText);
  for (const n of items) console.log(n.title, '→', n.fr ? n.fr.title + ' | ' + n.fr.texts.slice(0, 2).join(' / ').slice(0, 200) : '(non traduit)');
  if (r.frFailed || items.some(n => !n.fr)) { console.error('ÉCHEC : traduction indisponible'); process.exit(1); }
  console.log('OK');
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
