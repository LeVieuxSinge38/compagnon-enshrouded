# Prochain équipement — résultat
- Fait : choix séparé dans le prochain (`gearnext`, « Choisir celui-ci »), bouton « Je l'ai déjà — l'équiper maintenant » (armures + armes + tout emplacement) → `gearpick` de l'actuel, ★ Mon choix, retour à la recommandation, pierre recalculée. Fichiers : `public/app.js`, `tests/test-prochain-equipement.js`.
- Lancer : `node --check public/app.js && node tests/test-prochain-equipement.js` → TOUT OK (niv. 32 → palier 33 : armure + arme équipées, alternative choisie, retour, prune au changement de build).
- Écrit par moi (pas Qwen : retouches courtes dans du code imbriqué). Non vérifié dans un vrai navigateur ; version non changée, rien poussé.
- Bundle : prochain-equipement/prochain-equipement.bundle (origin/main..prochain-equipement).
