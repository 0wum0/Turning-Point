// Generative Stadtansicht (statisch, ressourcenschonend): Szene je Stadt + Epoche.
import { raw, esc } from './ui.js';

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PALETTES = {
  1: { sky: ['#2a1d12', '#8a5a2b', '#e8b374'], far: '#3d2a1b', mid: '#2a1c12', near: '#1a120b', win: '#ffd48a', sun: '#ffe2ab' },
  2: { sky: ['#1b1f3a', '#c4602d', '#ffc78a'], far: '#3a2a3f', mid: '#251d2e', near: '#15111c', win: '#ffb15c', sun: '#ffe0b3' },
  3: { sky: ['#140f2e', '#6a3bb0', '#f08bd0'], far: '#2c2057', mid: '#1c1540', near: '#100b2b', win: '#9ff3ff', sun: '#ffd3f1' },
  4: { sky: ['#0d1b3a', '#2f6fd6', '#a8d3ff'], far: '#1d3560', mid: '#122443', near: '#0a162b', win: '#ffeaa8', sun: '#e8f3ff' },
  5: { sky: ['#06141f', '#0b6f7a', '#58f0dc'], far: '#0e3b4a', mid: '#0a2a37', near: '#061a24', win: '#7ffff0', sun: '#c8fff8' },
};

export function cityScene({ id = 1, name = '', tier = 3, era = 1, owned = [], w = 960, h = 340, label = true } = {}) {
  const r = rng(`${id}:${name}`);
  const p = PALETTES[era] || PALETTES[1];
  const uid = `sc${id}x${era}${Math.floor(r() * 1e5)}`;
  let out = `<svg class="scene" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Stadtansicht ${esc(name)}">`;
  out += `<defs><linearGradient id="${uid}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".6" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient>
  <radialGradient id="${uid}g"><stop offset="0" stop-color="${p.sun}" stop-opacity=".95"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient></defs>`;
  out += `<rect width="${w}" height="${h}" fill="url(#${uid}s)"/>`;
  const sx = 120 + r() * (w - 240);
  out += `<circle cx="${sx}" cy="${h * 0.52}" r="${h * 0.42}" fill="url(#${uid}g)"/><circle cx="${sx}" cy="${h * 0.52}" r="22" fill="${p.sun}" opacity=".9"/>`;
  if (era >= 3) for (let i = 0; i < 40; i++) out += `<circle cx="${r() * w}" cy="${r() * h * 0.4}" r="${r() * 1.2 + .3}" fill="#fff" opacity="${r() * .5 + .15}"/>`;
  // Hintere Silhouette
  const layer = (base, count, minH, maxH, color, opacity, style) => {
    let s = `<g fill="${color}" opacity="${opacity}">`;
    let x = -20;
    while (x < w + 20) {
      const bw = 26 + r() * 54; const bh = minH + r() * (maxH - minH);
      const y = base - bh;
      if (era <= 2 && style === 'old' && r() < 0.35) { // Giebeldach
        s += `<path d="M${x} ${base}V${y + 14}L${x + bw / 2} ${y}L${x + bw} ${y + 14}V${base}Z"/>`;
      } else if (era >= 4 && style === 'new' && r() < 0.3) {
        s += `<rect x="${x}" y="${y}" width="${bw * .7}" height="${bh}" rx="3"/>`;
      } else s += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}"/>`;
      x += bw + r() * 6;
    }
    return s + '</g>';
  };
  out += layer(h * 0.78, 0, 40, 90 + tier * 12, p.far, 0.9, era >= 4 ? 'new' : 'old');
  // Kirchturm / Wahrzeichen
  const tx = 80 + r() * (w - 160);
  if (era <= 3) out += `<g fill="${p.mid}"><rect x="${tx}" y="${h * 0.34}" width="16" height="${h * 0.5}"/><path d="M${tx - 3} ${h * 0.34}L${tx + 8} ${h * 0.34 - 46}L${tx + 19} ${h * 0.34}Z"/></g>`;
  else out += `<g fill="${p.mid}"><rect x="${tx}" y="${h * 0.22}" width="22" height="${h * 0.62}"/><rect x="${tx + 9}" y="${h * 0.22 - 30}" width="4" height="30"/></g>`;
  // Mittlere Häuser mit Fenstern
  let x = -10; const base = h * 0.9;
  out += `<g>`;
  while (x < w) {
    const bw = 44 + r() * 70; const bh = 70 + r() * (60 + tier * 18);
    const y = base - bh;
    out += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${p.mid}"/>`;
    if (era <= 2 && r() < 0.6) out += `<path d="M${x - 3} ${y}L${x + bw / 2} ${y - 24}L${x + bw + 3} ${y}Z" fill="${p.near}"/>`;
    for (let wy = y + 12; wy < base - 18; wy += 18) for (let wx = x + 8; wx < x + bw - 10; wx += 15) {
      if (r() < 0.45) out += `<rect x="${wx}" y="${wy}" width="7" height="10" rx="1" fill="${p.win}" opacity="${0.5 + r() * 0.5}"/>`;
    }
    x += bw + 2 + r() * 8;
  }
  out += `</g>`;
  // Straße & Vordergrund
  out += `<rect y="${h * 0.9}" width="${w}" height="${h * 0.1}" fill="${p.near}"/>`;
  out += `<rect y="${h * 0.9}" width="${w}" height="2" fill="${p.win}" opacity=".25"/>`;
  for (let i = 0; i < 9; i++) { const tx2 = r() * w; out += `<g fill="${p.near}"><rect x="${tx2}" y="${h * 0.8}" width="3" height="${h * 0.12}"/><circle cx="${tx2 + 1.5}" cy="${h * 0.79}" r="${9 + r() * 6}"/></g>`; }
  // Eigene Gebäude
  owned.slice(0, 5).forEach((o, i) => {
    const ox = 90 + i * 150 + r() * 20;
    out += `<g><rect x="${ox}" y="${h * 0.62}" width="60" height="${h * 0.28}" fill="none" stroke="#f3cd7f" stroke-width="2" rx="3" stroke-dasharray="5 4"/><path d="M${ox + 30} ${h * 0.62}v-26" stroke="#f3cd7f" stroke-width="2"/><path d="M${ox + 30} ${h * 0.62 - 26}h18l-5 7l5 7h-18z" fill="#f3cd7f"/></g>`;
  });
  if (label) out += `<rect width="${w}" height="${h}" fill="url(#${uid}s)" opacity="0"/>`;
  out += '</svg>';
  return raw(out);
}
