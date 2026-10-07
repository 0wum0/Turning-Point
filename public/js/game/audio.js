// Dezente, prozedural erzeugte Klänge (WebAudio) – keine Audiodateien, kein Datenverbrauch.
let ac = null; let master = null; let musicTimer = null; let bellTimer = null; let era = 1;
let enabled = false;
try { enabled = localStorage.getItem('tp-sound') === '1'; } catch (_) { /* ignorieren */ }

const SCALES = {
  1: { root: 110.0, steps: [0, 3, 5, 7, 10], chords: [[0, 7, 12], [-4, 3, 8], [-2, 5, 10], [-5, 2, 7]] },     // a-Moll-Pentatonik, Nachkriegszeit
  2: { root: 146.83, steps: [0, 2, 3, 7, 9], chords: [[0, 7, 10], [5, 9, 12], [3, 7, 10], [-2, 5, 9]] },     // dorisch, 60er/70er
  3: { root: 174.61, steps: [0, 2, 4, 6, 7], chords: [[0, 4, 7], [2, 6, 9], [4, 7, 11], [-1, 2, 7]] },       // lydisch, 90er
  4: { root: 130.81, steps: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [-3, 4, 9], [-5, 2, 7], [-7, 0, 5]] },      // Dur-Pentatonik, Digital
  5: { root: 164.81, steps: [0, 2, 4, 6, 8], chords: [[0, 7, 11], [2, 9, 13], [4, 8, 14], [-3, 4, 9]] },     // Ganzton, Zukunft
};
const hz = (root, semis) => root * 2 ** (semis / 12);

function ensure() {
  if (ac) return ac;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  ac = new C(); master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  return ac;
}
function tone(freq, { type = 'sine', t0 = 0, dur = 1, gain = 0.05, attack = 0.02, to = master, detune = 0 } = {}) {
  const t = ac.currentTime + t0;
  const o = ac.createOscillator(); const g = ac.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.05);
}

function chord(i) {
  const sc = SCALES[era] || SCALES[1]; const ch = sc.chords[i % sc.chords.length];
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(master);
  ch.forEach((s) => { tone(hz(sc.root, s), { type: 'triangle', dur: 9, gain: 0.028, attack: 3, to: lp, detune: -4 }); tone(hz(sc.root, s), { type: 'sine', dur: 9, gain: 0.02, attack: 3, to: lp, detune: 5 }); });
  tone(hz(sc.root, ch[0] - 12), { type: 'sine', dur: 9, gain: 0.04, attack: 2.5, to: lp });
}
function bell() {
  const sc = SCALES[era] || SCALES[1];
  const s = sc.steps[Math.floor(Math.random() * sc.steps.length)] + 12 * (1 + Math.floor(Math.random() * 2));
  tone(hz(sc.root, s), { type: 'sine', dur: 3.2, gain: 0.03, attack: 0.01 });
  tone(hz(sc.root, s) * 2.01, { type: 'sine', dur: 1.6, gain: 0.008, attack: 0.01 });
}

function startMusic() {
  if (!ensure() || musicTimer) return;
  if (ac.state === 'suspended') ac.resume();
  let i = 0; chord(i++);
  musicTimer = setInterval(() => chord(i++), 8000);
  const scheduleBell = () => { bellTimer = setTimeout(() => { if (enabled) bell(); scheduleBell(); }, 3500 + Math.random() * 5000); };
  scheduleBell();
}
function stopMusic() { clearInterval(musicTimer); clearTimeout(bellTimer); musicTimer = null; bellTimer = null; if (ac) ac.suspend(); }

export const isOn = () => enabled;
export function toggle() {
  enabled = !enabled;
  try { localStorage.setItem('tp-sound', enabled ? '1' : '0'); } catch (_) { /* ignorieren */ }
  if (enabled) { startMusic(); ping('good'); } else stopMusic();
  return enabled;
}
export function setEra(n) { era = n || 1; }
/** Benachrichtigungston: nur wenn Ton aktiv ist */
export function ping(level = 'info') {
  if (!enabled || !ensure()) return;
  if (ac.state === 'suspended') ac.resume();
  const sc = SCALES[era] || SCALES[1];
  const notes = level === 'bad' ? [-12, -17] : level === 'warn' ? [0, -5] : level === 'good' ? [12, 19] : [7];
  notes.forEach((s, i) => tone(hz(sc.root * 2, s), { type: 'sine', t0: i * 0.11, dur: 0.6, gain: 0.05, attack: 0.01 }));
}
/** Nach Seitenstart: Musik fortsetzen, sobald der Nutzer das erste Mal interagiert (Autoplay-Regeln). */
export function resumeOnGesture() {
  if (!enabled) return;
  const go = () => { document.removeEventListener('pointerdown', go); if (enabled) startMusic(); };
  document.addEventListener('pointerdown', go, { once: true });
}
