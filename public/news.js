'use strict';
(function () {
  // ---------- Actualités du jeu (annonces officielles Steam) ----------
  // Le navigateur ne peut pas interroger Steam directement : l'appelant fournit fetchText qui le fait à notre place.
  const STEAM_NEWS = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1203620&count=12&maxlength=0&feeds=steam_community_announcements&format=json';
  const STEAM_IMG = /^https:\/\/(clan|cdn|shared)\.(cloudflare|akamai)\.steamstatic\.com\//;

  // --- Cache localStorage (remplace le cache mémoire 1 h) ---
  function readCache() {
    try {
      const raw = localStorage.getItem('ens.newsCache');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* stockage indisponible */ }
    return { at: 0, items: null };
  }
  function writeCache(items) {
    try {
      localStorage.setItem('ens.newsCache', JSON.stringify({ at: Date.now(), items }));
    } catch (e) { /* stockage indisponible */ }
  }

  // --- Nettoyage du balisage BBCode Steam ---
  function bbText(t) {
    return String(t)
      .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/g, '$1')
      .replace(/\[dynamiclink[^\]]*\][\s\S]*?\[\/dynamiclink\]/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim();
  }

  function bbBlocks(src) {
    const s = String(src).replace(/\{STEAM_CLAN_IMAGE\}/g, 'https://clan.cloudflare.steamstatic.com/images');
    // Deux écritures d'image chez Steam : [img src="…"][/img] et [img]…[/img]
    const re = /\[(h1|h2|h3|p|\*)\]([\s\S]*?)\[\/\1\]|\[img[^\]]*?src="([^"]+)"[^\]]*\]|\[img\]([^[]+)\[\/img\]/g;
    const out = []; let m;
    while ((m = re.exec(s)) && out.length < 80) {
      const lone = (m[3] || m[4] || '').trim();
      if (lone) { if (STEAM_IMG.test(lone)) out.push({ t: 'img', src: lone }); continue; }
      const imgs = [...m[2].matchAll(/\[img[^\]]*?src="([^"]+)"|\[img\]([^[]+)\[\/img\]/g)].map(x => (x[1] || x[2]).trim()).filter(u => STEAM_IMG.test(u));
      const text = bbText(m[2]);
      if (text) out.push({ t: m[1] === '*' ? 'li' : m[1] === 'p' ? 'p' : 'h', text });
      for (const u of imgs) out.push({ t: 'img', src: u });
    }
    return out;
  }

  // --- Chargement des annonces Steam ---
  const RETRY_DELAYS = [30e3, 120e3, 120e3]; // nouvelles tentatives de traduction dans la même session
  async function steamNews(fetchText, onUpdate, delays = RETRY_DELAYS) {
    const cache = readCache();
    // Le cache n'est valable que si toutes les annonces sont traduites
    if (cache.items && cache.items.every(n => n.fr) && Date.now() - cache.at < 3600e3) return cache.items;
    const raw = await fetchText(STEAM_NEWS);
    const data = JSON.parse(raw);
    const items = (data.appnews.newsitems || []).map(n => {
      const blocks = bbBlocks(n.contents);
      const img = blocks.find(b => b.t === 'img');
      // Sans image dans l'annonce : bannière officielle du jeu
      return { gid: String(n.gid), title: n.title, date: n.date, url: `https://store.steampowered.com/news/app/1203620/view/${n.gid}`,
        image: img ? img.src : 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1203620/header.jpg', blocks };
    });
    const r = await translateNews(items, fetchText);
    // Traduction incomplète : on garde l'affichage, sans cache, et on réessaie plus tard dans la session
    if ((r && r.frFailed) || items.some(n => !n.fr)) {
      retryTranslate(items, fetchText, onUpdate, delays);
      return items;
    }
    writeCache(items);
    return items;
  }

  function retryTranslate(items, fetchText, onUpdate, delays) {
    if (!delays.length) return;
    setTimeout(async () => {
      let r = null;
      try { r = await translateNews(items, fetchText); } catch (e) { /* on réessaiera */ }
      if (r && !r.frFailed && items.every(n => n.fr)) {
        writeCache(items);
        if (onUpdate) onUpdate(items);
      } else retryTranslate(items, fetchText, onUpdate, delays.slice(1));
    }, delays[0]);
  }

  // --- Traduction française des annonces (Google Traduction, texte public uniquement) ---
  // Chaque annonce n'est traduite qu'une fois : le résultat est gardé dans localStorage 'ens.newsFr'.
  // En cas d'échec, l'annonce reste en anglais.
  const GTX = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t';

  async function gtx(text, fetchText) {
    for (let i = 0; i < 3; i++) {
      try {
        const raw = await fetchText(GTX, { method: 'POST', body: 'q=' + encodeURIComponent(text) });
        const data = JSON.parse(raw);
        return ((data[0] || []).map(s => s[0] || '')).join('');
      } catch (e) {
        if (i === 2) throw e;
        await new Promise(r => setTimeout(r, i === 0 ? 1500 : 4000));
      }
    }
  }

  // Traduit une liste de textes d'une ligne en regroupant les envois (une ligne par texte)
  async function translateAll(texts, fetchText) {
    const out = [];
    for (let i = 0; i < texts.length;) {
      let j = i, len = 0;
      while (j < texts.length && (j === i || len + texts[j].length < 1800)) len += texts[j++].length + 1;
      const part = texts.slice(i, j);
      let lines;
      try {
        const result = await gtx(part.join('\n'), fetchText);
        lines = result.split('\n').map(s => s.trim());
      } catch (e) {
        // Si échec, traduire chaque texte individuellement
        lines = [];
        for (const t of part) {
          lines.push((await gtx(t, fetchText)).trim()); // un échec remonte : l'annonce reste en anglais et sera réessayée
          await new Promise(r => setTimeout(r, 600));
        }
      }
      if (lines.length === part.length) out.push(...lines);
      else for (const t of part) out.push((await gtx(t, fetchText)).trim());
      i = j;
      if (i < texts.length) await new Promise(r => setTimeout(r, 600));
    }
    return out;
  }

  // Vocabulaire du jeu en français (Google traduit « Shroud » par « Linceul », le jeu dit « Brume »)
  const GAME_FR = [
    [/\b(du|au) Linceul\b/gi, (_, a) => a.toLowerCase() === 'du' ? 'de la Brume' : 'à la Brume'],
    [/\ble Linceul\b/g, 'la Brume'],
    [/\bLe Linceul\b/g, 'La Brume'],
    [/\b[Ll]inceul\b/g, 'Brume'],
    [/\bd['’]Em?bervale\b/g, 'de Valdebraise'],
    [/\bEm?bervale\b/g, 'Valdebraise'],
    [/\b([Gg])rand(s)? sanctuaire(s)? de la Flamme/g, '$1rand$2 mausolée$3 de Flamme'],
    [/\bSanctuaire(s)? de la Flamme/g, 'Mausolée$1 de Flamme'], [/\bsanctuaire(s)? de la Flamme/g, 'mausolée$1 de Flamme'],
    [/\bFlèche(s)? ancienne(s)?/g, 'Tour$1 des Anciens'], [/\bflèche(s)? ancienne(s)?/g, 'tour$1 des Anciens'],
    [/\bFlame Shrine\b/g, 'Mausolée de Flamme'],
    [/\bRevelwood\b/g, 'Bois envoûtés'],
    [/\bFell\b/g, 'Déchus'],
    [/\bHollow\b/g, 'Creux'],
    [/\bAncient Spire\b/g, 'Tour des Anciens'],
    [/\bShroud\b/g, 'Brume']
  ];
  const frGame = t => GAME_FR.reduce((s, [re, by]) => s.replace(re, by), t);

  // --- Lecture / écriture du cache de traduction (localStorage) ---
  function readFrCache() {
    try {
      const raw = localStorage.getItem('ens.newsFr');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* stockage indisponible */ }
    return {};
  }
  function writeFrCache(cache) {
    try {
      localStorage.setItem('ens.newsFr', JSON.stringify(cache));
    } catch (e) { /* stockage indisponible */ }
  }

  async function translateNews(items, fetchText) {
    const cache = readFrCache();
    let changed = false;
    let frFailed = false;
    for (const n of items) {
      const texts = [n.title, ...n.blocks.filter(b => b.t !== 'img').map(b => b.text)];
      if (!cache[n.gid] || cache[n.gid].length !== texts.length) {
        try {
          const translations = await translateAll(texts, fetchText);
          cache[n.gid] = translations;
          changed = true;
        } catch (e) {
          console.warn('Traduction des actualités impossible :', e.message);
          frFailed = true;
          // Continuer avec les autres annonces
        }
      }
      if (cache[n.gid]) {
        delete n.frFailed;
        const fr = cache[n.gid].map(frGame);
        n.fr = { title: fr[0], texts: fr.slice(1) };
      } else {
        n.frFailed = true;
      }
    }
    if (changed) {
      const keep = new Set(items.map(n => n.gid)); // on ne garde que les annonces encore affichées
      for (const k of Object.keys(cache)) if (!keep.has(k)) delete cache[k];
      writeFrCache(cache);
    }
    return { frFailed };
  }

  // --- API publique ---
  window.News = {
    load(fetchText, onUpdate, delays) {
      return steamNews(fetchText, onUpdate, delays);
    },
    _test: { translateNews, frGame, bbBlocks }
  };
})();
