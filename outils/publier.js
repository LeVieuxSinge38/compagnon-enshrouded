'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = 'LeVieuxSinge38/compagnon-enshrouded';
const DRY_RUN = process.argv.includes('--dry-run');

// ── 1. SHA git ──────────────────────────────────────────────────────────────
console.log('→ Récupération du SHA git…');
const shaResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
if (shaResult.status !== 0) {
  console.error('Erreur : impossible de récupérer le SHA git.');
  process.exit(1);
}
const sha = shaResult.stdout.trim();
console.log(`  SHA : ${sha}`);

// ── 2. Vider / créer release/ ───────────────────────────────────────────────
console.log('→ Préparation du dossier release/…');
const releaseDir = path.resolve('release');
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

// ── 3. Construction de web.zip ──────────────────────────────────────────────
console.log('→ Construction de web.zip…');
const { buildZip } = require('./webzip');
const zipBuffer = buildZip(
  'public',
  r => r === 'downloads' || r.startsWith('downloads/') || r === 'login.html' || r === 'login.js',
  { 'build.txt': sha }
);
fs.writeFileSync(path.join(releaseDir, 'web.zip'), zipBuffer);
console.log('  web.zip écrit.');

// ── 4. desktop.json (BOM + webBuild) ────────────────────────────────────────
console.log('→ Lecture de public/downloads/desktop.json…');
let rawJson = fs.readFileSync('public/downloads/desktop.json', 'utf8');
if (rawJson.charCodeAt(0) === 0xFEFF) rawJson = rawJson.slice(1);
const desktop = JSON.parse(rawJson);
desktop.webBuild = sha;
fs.writeFileSync(path.join(releaseDir, 'desktop.json'), JSON.stringify(desktop, null, 2) + '\n', 'utf8');
console.log(`  desktop.json écrit (webBuild = ${sha}).`);

// ── 5. Copie des fichiers de distribution ───────────────────────────────────
console.log('→ Copie des fichiers de distribution…');
const filesToCopy = [...desktop.files, 'CompagnonEnshrouded.zip'];
for (const f of filesToCopy) {
  const src = path.join('public', 'downloads', f);
  const dst = path.join(releaseDir, f);
  fs.copyFileSync(src, dst);
  console.log(`  ${f}`);
}

// ── 6. Détermination du tag ─────────────────────────────────────────────────
console.log('→ Détermination du tag…');
const version = desktop.version;
let tag = 'v' + version;
const viewResult = spawnSync('gh', ['release', 'view', tag, '--repo', REPO], { encoding: 'utf8' });
if (viewResult.status === 0) {
  tag = 'v' + version + '-' + sha;
}
console.log(`  Tag : ${tag}`);

// ── 7. Notes markdown ───────────────────────────────────────────────────────
console.log('→ Génération des notes…');
const lines = [];
if (desktop.notes) {
  lines.push(desktop.notes);
}
if (Array.isArray(desktop.highlights)) {
  for (const h of desktop.highlights) {
    lines.push('- ' + h);
  }
}
lines.push('');
lines.push('**Installation** : télécharge CompagnonEnshrouded.zip, dézippe-le où tu veux, lance CompagnonEnshrouded.exe.');
const notesMd = lines.join('\n') + '\n';
fs.writeFileSync(path.join(releaseDir, 'notes.md'), notesMd, 'utf8');
console.log('  notes.md écrit.');

// ── 8. gh release create ────────────────────────────────────────────────────
const releaseFiles = fs.readdirSync(releaseDir)
  .filter(f => f !== 'notes.md')
  .map(f => path.join('release', f));

if (DRY_RUN) {
  console.log('');
  console.log(`[DRY-RUN] Tag : ${tag}`);
  console.log('[DRY-RUN] Fichiers :');
  for (const f of releaseFiles) {
    console.log(`  ${f}`);
  }
  console.log('');
  console.log(`[DRY-RUN] gh release create ${tag} ${releaseFiles.join(' ')} --repo ${REPO} --title "Compagnon Enshrouded ${version}" --notes-file release/notes.md`);
} else {
  console.log('→ Création de la release GitHub…');
  const args = [
    'release', 'create', tag,
    ...releaseFiles,
    '--repo', REPO,
    '--title', `Compagnon Enshrouded ${version}`,
    '--notes-file', 'release/notes.md'
  ];
  const result = spawnSync('gh', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Erreur : gh release create a échoué.');
    process.exit(1);
  }
  console.log('✓ Release créée avec succès !');
}
