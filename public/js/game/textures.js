// Prozedurale Texturen (Canvas): Holzmaserung, Putz, Stoff, Metall, Ziegel, Fliesen, Marmor, Teppich.
// Alle sind Graustufen und werden über die Materialfarbe eingefärbt; dazu je eine passende Bump-Map.
function rnd(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const S = 256;
const g = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;

const PAINT = {
  wood(c, r) {
    c.fillStyle = g(205); c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y++) { const ph = r() * 0.02; c.fillStyle = g(188 + Math.sin(y * 0.55 + ph) * 14 + (r() - 0.5) * 16); c.fillRect(0, y, S, 1); }
    for (let i = 0; i < 70; i++) { const y = r() * S; c.strokeStyle = `rgba(60,40,20,${0.12 + r() * 0.18})`; c.lineWidth = 0.6 + r() * 1.4; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= S; x += 16) c.lineTo(x, y + Math.sin(x * 0.04 + i) * 3 + (r() - 0.5) * 2); c.stroke(); }
    for (let i = 0; i < 3; i++) { const x = r() * S; const y = r() * S; for (let k = 4; k > 0; k--) { c.strokeStyle = `rgba(70,45,20,${0.18 + k * 0.05})`; c.lineWidth = 1.4; c.beginPath(); c.ellipse(x, y, k * 5, k * 2.4, 0, 0, Math.PI * 2); c.stroke(); } }
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, S, 2); c.fillRect(0, S / 2 - 1, S, 2); c.fillRect(Math.floor(r() * S), 0, 2, S / 2); c.fillRect(Math.floor(r() * S), S / 2, 2, S / 2);
  },
  plaster(c, r) {
    c.fillStyle = g(232); c.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,80,60'},${0.03 + r() * 0.06})`; c.beginPath(); c.arc(r() * S, r() * S, 4 + r() * 26, 0, Math.PI * 2); c.fill(); }
    for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.1})`; c.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1 + r() * 1.5); }
  },
  fabric(c, r) {
    c.fillStyle = g(215); c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 3) { c.fillStyle = g(200 + r() * 25); c.fillRect(0, y, S, 1.6); }
    for (let x = 0; x < S; x += 3) { c.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.1})`; c.fillRect(x, 0, 1.2, S); }
  },
  metal(c, r) {
    c.fillStyle = g(190); c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y++) { c.fillStyle = g(150 + r() * 80); c.globalAlpha = 0.55; c.fillRect(0, y, S, 1); } c.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(255,255,255,${r() * 0.25})`; c.beginPath(); const y = r() * S; c.moveTo(r() * S, y); c.lineTo(r() * S, y + (r() - 0.5) * 3); c.stroke(); }
  },
  brick(c, r) {
    c.fillStyle = g(120); c.fillRect(0, 0, S, S);
    const bh = 32; const bw = 64;
    for (let y = 0; y < S; y += bh) for (let x = -((y / bh) % 2) * (bw / 2); x < S; x += bw) { c.fillStyle = g(170 + r() * 55); c.fillRect(x + 2, y + 2, bw - 4, bh - 4); for (let i = 0; i < 24; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.12})`; c.fillRect(x + 2 + r() * (bw - 4), y + 2 + r() * (bh - 4), 2, 2); } }
  },
  tile(c, r) {
    c.fillStyle = g(90); c.fillRect(0, 0, S, S);
    const n = 4; const t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = g(205 + r() * 40); c.fillRect(i * t + 2, j * t + 2, t - 4, t - 4); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(i * t + 2, j * t + 2, t - 4, 3); }
  },
  marble(c, r) {
    c.fillStyle = g(238); c.fillRect(0, 0, S, S);
    for (let i = 0; i < 14; i++) { c.strokeStyle = `rgba(90,95,110,${0.08 + r() * 0.16})`; c.lineWidth = 0.6 + r() * 1.8; c.beginPath(); let x = r() * S; let y = 0; c.moveTo(x, y); while (y < S) { x += (r() - 0.5) * 38; y += 14 + r() * 18; c.lineTo(x, y); } c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, 0, S, 2); c.fillRect(0, 0, 2, S); c.fillRect(0, S / 2, S, 1); c.fillRect(S / 2, 0, 1, S);
  },
  carpet(c, r) {
    c.fillStyle = g(205); c.fillRect(0, 0, S, S);
    for (let i = 0; i < 6000; i++) { c.fillStyle = g(150 + r() * 100); c.globalAlpha = 0.5; c.fillRect(r() * S, r() * S, 2, 2); } c.globalAlpha = 1;
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 6; c.strokeRect(10, 10, S - 20, S - 20); c.lineWidth = 2; c.strokeRect(24, 24, S - 48, S - 48);
  },
};
const BUMP = { wood: 0.35, plaster: 0.5, fabric: 0.6, metal: 0.15, brick: 1.4, tile: 0.9, marble: 0.1, carpet: 0.9 };

export function makeTextures(T) {
  const cache = new Map();
  const get = (kind, repeat = [1, 1], seed = 7) => {
    const key = `${kind}:${repeat.join('x')}`;
    if (cache.has(key)) return cache.get(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    PAINT[kind](cv.getContext('2d'), rnd(seed + kind.length * 31));
    const map = new T.CanvasTexture(cv); map.wrapS = map.wrapT = T.RepeatWrapping; map.repeat.set(repeat[0], repeat[1]); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4;
    const bump = new T.CanvasTexture(cv); bump.wrapS = bump.wrapT = T.RepeatWrapping; bump.repeat.set(repeat[0], repeat[1]);
    const out = { map, bump, bumpScale: BUMP[kind] || 0.3 };
    cache.set(key, out); return out;
  };
  /** Materialart anhand der Farbe erraten (Holztöne, Metallgrau, kräftige Stoffe …) */
  const WOODS = new Set([0x8a5c33, 0x6a4526, 0x7a5535, 0x5a3d22, 0x6b4a2a, 0x9a7a4a, 0xb58a4f, 0x7a5a35, 0x8a5a2f, 0x6b5a3f, 0x9a8a70, 0x6a5a4a, 0x4a3a2a, 0x3a2412, 0x6a4a2a, 0x8a6a3a, 0x9a7a4a, 0xc9a56a, 0x8a4a3a]);
  const kindFor = (color) => {
    if (WOODS.has(color)) return 'wood';
    const r = (color >> 16) & 255; const g2 = (color >> 8) & 255; const b = color & 255;
    const mx = Math.max(r, g2, b); const mn = Math.min(r, g2, b);
    if (mx > 235 && mx - mn < 25) return 'plaster';
    if (mx - mn < 22) return 'metal';
    if (mx - mn > 70) return 'fabric';
    return null;
  };
  return { get, kindFor };
}
