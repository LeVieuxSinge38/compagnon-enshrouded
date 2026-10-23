'use strict';

/**
 * server/webzip.js
 * Construction d'une archive ZIP (méthode 0 – stockée) sans dépendance npm.
 */

const fs = require('fs');
const path = require('path');

// ─── CRC32 (table précalculée) ───────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

/** Calcule le CRC32 d'un Buffer. */
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── Date/heure DOS fixe (2024-01-01 00:00:00) ──────────────────────────────

const DOS_TIME = 0x0000;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1; // 0x5801

// ─── Construction de l'archive ───────────────────────────────────────────────

/**
 * Construit un Buffer ZIP contenant tous les fichiers de rootDir (récursif).
 *
 * @param {string} rootDir - Répertoire racine à archiver.
 * @param {function(string): boolean} [exclude] - Retourne true pour ignorer
 *        un fichier ou un dossier (chemin relatif avec '/').
 * @param {Object<string, Buffer|string>} [extra] - Fichiers supplémentaires à ajouter
 *        à l'archive (clé = chemin relatif, valeur = contenu Buffer ou chaîne).
 * @returns {Buffer} Le contenu de l'archive ZIP.
 */
function buildZip(rootDir, exclude, extra) {

  // 1. Collecte récursive des fichiers disque (chemins relatifs, séparateur '/')
  const diskFiles = [];

  function walk(dir, rel) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = rel ? rel + '/' + entry.name : entry.name;

      if (exclude && exclude(entryRel)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, entryRel);
      } else if (entry.isFile()) {
        diskFiles.push(entryRel);
      }
    }
  }

  walk(rootDir, '');
  diskFiles.sort();

  // 2. Construction de la liste unifiée des entrées { name, data }
  const entries = [];

  for (const rel of diskFiles) {
    const fullPath = path.join(rootDir, rel);
    entries.push({ name: rel, data: fs.readFileSync(fullPath) });
  }

  if (extra && typeof extra === 'object') {
    for (const [rel, value] of Object.entries(extra)) {
      const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
      entries.push({ name: rel, data });
    }
  }

  // 3. Assemblage des segments binaires (une seule boucle)
  const chunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const size = data.length;

    // ── En-tête local de fichier (30 octets + nom) ──
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);   // signature
    lh.writeUInt16LE(20, 4);           // version nécessaire (2.0)
    lh.writeUInt16LE(0x0800, 6);       // drapeaux : bit 11 = UTF-8
    lh.writeUInt16LE(0, 8);            // méthode 0 (stockée)
    lh.writeUInt16LE(DOS_TIME, 10);    // heure DOS
    lh.writeUInt16LE(DOS_DATE, 12);    // date DOS
    lh.writeUInt32LE(crc, 14);         // CRC-32
    lh.writeUInt32LE(size, 18);        // taille compressée
    lh.writeUInt32LE(size, 22);        // taille non compressée
    lh.writeUInt16LE(nameBuf.length, 26); // longueur du nom
    lh.writeUInt16LE(0, 28);           // longueur champ extra

    chunks.push(lh, nameBuf, data);

    // ── Entrée du répertoire central (46 octets + nom) ──
    const ce = Buffer.alloc(46);
    ce.writeUInt32LE(0x02014b50, 0);   // signature
    ce.writeUInt16LE(20, 4);           // version qui a créé
    ce.writeUInt16LE(20, 6);           // version nécessaire
    ce.writeUInt16LE(0x0800, 8);       // drapeaux UTF-8
    ce.writeUInt16LE(0, 10);           // méthode 0
    ce.writeUInt16LE(DOS_TIME, 12);
    ce.writeUInt16LE(DOS_DATE, 14);
    ce.writeUInt32LE(crc, 16);
    ce.writeUInt32LE(size, 20);        // taille compressée
    ce.writeUInt32LE(size, 24);        // taille non compressée
    ce.writeUInt16LE(nameBuf.length, 28);
    ce.writeUInt16LE(0, 30);           // extra
    ce.writeUInt16LE(0, 32);           // commentaire
    ce.writeUInt16LE(0, 34);           // disque de départ
    ce.writeUInt16LE(0, 36);           // attributs internes
    ce.writeUInt32LE(0, 38);           // attributs externes
    ce.writeUInt32LE(offset, 42);      // décalage de l'en-tête local

    centralChunks.push(ce, nameBuf);

    // Mise à jour du décalage
    offset += lh.length + nameBuf.length + data.length;
  }

  // 4. Répertoire central
  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const c of centralChunks) {
    chunks.push(c);
    centralDirSize += c.length;
  }

  // 5. Fin du répertoire central (22 octets)
  const totalEntries = entries.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);  // signature
  eocd.writeUInt16LE(0, 4);           // disque courant
  eocd.writeUInt16LE(0, 6);           // disque du rép. central
  eocd.writeUInt16LE(totalEntries, 8); // entrées sur ce disque
  eocd.writeUInt16LE(totalEntries, 10); // entrées totales
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);          // longueur commentaire

  chunks.push(eocd);

  return Buffer.concat(chunks);
}

module.exports = { buildZip };
