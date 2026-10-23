// Intro au démarrage (une fois par lancement) : brume lente, emblème, titre, et une courte musique douce (≈ 4 s)
// générée par le navigateur (aucun fichier son). Réglage « ens.introSon » : false = sans musique.
'use strict';
(() => {
  const box = document.getElementById('intro');
  if (!box) return;
  let seen = false;
  try { seen = sessionStorage.getItem('intro') === '1'; sessionStorage.setItem('intro', '1'); } catch { /* ignoré */ }
  if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) { box.remove(); return; }
  let sound = true;
  try { sound = localStorage.getItem('ens.introSon') !== 'false'; } catch { /* ignoré */ }
  if (sound) try { music(); } catch { /* son indisponible */ }
  setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 1400); }, 4300);

  // Un accord grave et doux (la mineur) qui s'ouvre puis s'éteint, et trois notes cristallines en écho
  function music() {
    const C = new (window.AudioContext || window.webkitAudioContext)(), now = C.currentTime + 0.05, out = C.createGain();
    out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(0.22, now + 1.4); out.gain.linearRampToValueAtTime(0.18, now + 3); out.gain.linearRampToValueAtTime(0, now + 4.3);
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, now); lp.frequency.linearRampToValueAtTime(2200, now + 2.5);
    const echo = C.createDelay(); echo.delayTime.value = 0.32; const fb = C.createGain(); fb.gain.value = 0.38; echo.connect(fb); fb.connect(echo);
    lp.connect(out); echo.connect(out); out.connect(C.destination);
    [110, 164.81, 220, 261.63, 329.63].forEach((f, i) => {
      for (const det of [-6, 6]) {
        const o = C.createOscillator(), g = C.createGain();
        o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det; g.gain.value = 0.07;
        o.connect(g); g.connect(lp); o.start(now); o.stop(now + 4.5);
      }
    });
    [[659.25, 1.5], [987.77, 2.1], [880, 2.6]].forEach(([f, t]) => {
      const o = C.createOscillator(), g = C.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(0.08, now + t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, now + t + 1.4);
      o.connect(g); g.connect(echo); g.connect(out); o.start(now + t); o.stop(now + t + 1.6);
    });
    setTimeout(() => C.close(), 6000);
  }
})();
