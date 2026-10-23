// Lecture d'une sauvegarde de personnage Enshrouded (character*.ksd), en lecture seule, directement dans la page.
// Format : en-tête « SV2C » (48 octets) puis blocs « S2BH » ; les blocs marqués compressés contiennent une trame Zstandard
// (décompressée avec fzstd). On y retrouve le pseudo, le niveau, l'expérience et la liste des nœuds de l'arbre (identifiant + rang).
'use strict';
(function () {
  const u32 = (b, p) => (b[p] | b[p + 1] << 8 | b[p + 2] << 16 | b[p + 3] << 24) >>> 0;
  const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));

  // Longueur exacte d'une trame Zstandard (en-tête + blocs + somme de contrôle)
  function zstdFrameSize(b, p) {
    const start = p, fhd = b[p + 4];
    const single = fhd >> 5 & 1, check = fhd >> 2 & 1, dict = [0, 1, 2, 4][fhd & 3], fcsFlag = fhd >> 6;
    p += 5 + (single ? 0 : 1) + dict + (fcsFlag === 0 ? single : [0, 2, 4, 8][fcsFlag]);
    for (;;) {
      const h = b[p] | b[p + 1] << 8 | b[p + 2] << 16, last = h & 1, type = h >> 1 & 3, size = h >> 3;
      p += 3 + (type === 1 ? 1 : size);
      if (p > b.length) throw new Error('trame tronquée');
      if (last) break;
    }
    return p + (check ? 4 : 0) - start;
  }

  function decompress(file) {
    const b = file instanceof Uint8Array ? file : new Uint8Array(file);
    if (ascii(b, 0, 4) !== 'SV2C') throw new Error('Ce fichier n\'est pas une sauvegarde de personnage Enshrouded.');
    const parts = [];
    for (let p = 0; (p = indexOf(b, [0x53, 0x32, 0x42, 0x48], p)) >= 0; p += 4) { // « S2BH »
      const z = p + 14;
      if (b[p + 9] === 1 && b[z] === 0x28 && b[z + 1] === 0xb5 && b[z + 2] === 0x2f && b[z + 3] === 0xfd)
        parts.push(fzstd.decompress(b.subarray(z, z + zstdFrameSize(b, z))));
    }
    const out = new Uint8Array(parts.reduce((t, x) => t + x.length, 0));
    let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
    return out;
  }
  function indexOf(b, pat, from) {
    outer: for (let i = from; i <= b.length - pat.length; i++) { for (let j = 0; j < pat.length; j++) if (b[i + j] !== pat[j]) continue outer; return i; }
    return -1;
  }

  // Liste des compétences : « nombre N » suivi de N entrées (identifiant connu sur 4 octets + rang sur 1 octet)
  function findSkills(d) {
    let best = null;
    for (let p = 8; p + 4 < d.length && p < 300000; p++) {
      const n = u32(d, p);
      if (n < 1 || n > 300 || p + 4 + n * 5 > d.length) continue;
      const list = [];
      let ok = true;
      for (let k = 0; k < n; k++) {
        const q = p + 4 + k * 5, id = GAME_NODE_IDS[u32(d, q)], r = d[q + 4];
        if (id === undefined || !TREE_NODE_MAX[id] || r > TREE_NODE_MAX[id]) { ok = false; break; }
        list.push([id, r]);
      }
      if (ok && (!best || n > best.list.length)) best = { at: p, list };
    }
    return best;
  }
  const TREE_NODE_MAX = {};
  for (const [id, type] of TREE.nodes) TREE_NODE_MAX[id] = TREE.types[type].m;

  function read(file) {
    const d = decompress(file);
    let name = '';
    for (let p = 0; p < 64 && !name; p++) { const n = u32(d, p); if (n >= 1 && n <= 32) { const s = new TextDecoder().decode(d.subarray(p + 4, p + 4 + n)); if (/^[\p{L}\p{N} _.'-]+$/u.test(s)) name = s; } }
    const sk = findSkills(d);
    if (!sk) return { name, level: null, xp: null, nodes: [] }; // personnage sans aucune compétence
    const level = u32(d, sk.at - 8), xp = u32(d, sk.at - 4);
    return { name, level: level >= 1 && level <= 99 ? level : null, xp, nodes: sk.list.filter(x => x[1] > 0) };
  }
  window.SaveGame = { read, decompress };
})();
