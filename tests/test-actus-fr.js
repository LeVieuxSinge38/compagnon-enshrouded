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
(async () => {
  const d = JSON.parse(await fetchText('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1203620&count=3&maxlength=0&feeds=steam_community_announcements&format=json'));
  const items = d.appnews.newsitems.slice(0, 2).map(n => ({ gid: String(n.gid), title: n.title, blocks: T.bbBlocks(n.contents).slice(0, 12) }));
  const r = await T.translateNews(items, fetchText);
  for (const n of items) console.log(n.title, '→', n.fr ? n.fr.title + ' | ' + n.fr.texts.slice(0, 2).join(' / ').slice(0, 200) : '(non traduit)');
  if (r.frFailed || items.some(n => !n.fr)) { console.error('ÉCHEC : traduction indisponible'); process.exit(1); }
  console.log('OK');
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
