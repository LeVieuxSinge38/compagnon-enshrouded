// Lecture (seule) d'une sauvegarde de personnage Enshrouded : SV2C -> blocs zstd -> liste des compétences
const fs = require('fs'), zlib = require('zlib');
const g = JSON.parse(fs.readFileSync(__dirname + '/gameSkillData.json', 'utf8'));
const byGame = {}; for (const [id, n] of Object.entries(g.nodes)) byGame[Number(n.gameNodeId) >>> 0] = [Number(id), n.type];
function decompress(b) {
  if (b.toString('latin1', 0, 4) !== 'SV2C') throw new Error('pas une sauvegarde SV2C');
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), idx = [];
  for (let p = 0; (p = b.indexOf(magic, p)) >= 0; p += 4) idx.push(p);
  return Buffer.concat(idx.map((p, k) => { try { return zlib.zstdDecompressSync(b.subarray(p, idx[k + 1] || b.length)); } catch { return zlib.zstdDecompressSync(b.subarray(p)); } }));
}
function skills(d) {
  // On cherche « nombre N » suivi de N entrées valides (identifiant de nœud connu + rang plausible) : la plus longue gagne
  let best = null;
  for (let p = 0; p + 4 < d.length && p < 200000; p++) {
    const n = d.readUInt32LE(p);
    if (n < 1 || n > 260) continue;
    let ok = true; const list = [];
    for (let k = 0; k < n; k++) {
      const q = p + 4 + k * 5; if (q + 5 > d.length) { ok = false; break; }
      const node = byGame[d.readUInt32LE(q) >>> 0], r = d[q + 4];
      if (!node || r > ((g.types[node[1]] || {}).maxLevel || 1)) { ok = false; break; }
      list.push([node[0], r]);
    }
    if (ok && (!best || n > best.list.length)) best = { at: p, list };
  }
  return best;
}
module.exports = { decompress, skills };
if (require.main === module) {
  for (const f of process.argv.slice(2)) {
    const d = decompress(fs.readFileSync(f)), s = skills(d);
    const taken = s.list.filter(x => x[1] > 0);
    const spent = taken.reduce((t, [id, r]) => t + g.types[g.nodes[id].type].cost * r, 0);
    console.log(f.split(/[\/]/).pop().padEnd(26), 'liste à', s.at, '| u32 avant :', d.readUInt32LE(s.at - 8), d.readUInt32LE(s.at - 4), '| nœuds pris', taken.length, '| points', spent);
  }
}
