// Generative Satelliten-/Luftansicht einer Stadt (SVG, deterministisch je Stadt + Epoche).
import { esc } from './ui.js';

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const WORLD = { w: 2000, h: 1250 };

const PAL = {
  1: { ground: '#4a5a34', lawn: ['#55663a', '#4c5d33', '#5d6b40'], road: '#6e675b', roadEdge: '#8b8374', roofs: ['#8a4a35', '#6e3a2b', '#7a5a45', '#4a4540', '#98604a'], water: '#35607a', park: '#3d5a2c', industrial: '#5d5a55' },
  2: { ground: '#566338', lawn: ['#607040', '#566838', '#6a7846'], road: '#6a6a6a', roadEdge: '#8d8d8d', roofs: ['#9b5d3f', '#7b6a5e', '#a58a70', '#5e5953', '#b86f4b'], water: '#3b6a85', park: '#44652f', industrial: '#6a6a68' },
  3: { ground: '#5a6a3e', lawn: ['#657743', '#5b6d3a', '#718449'], road: '#5f6266', roadEdge: '#8b8f94', roofs: ['#8c8f93', '#a5a8ac', '#6f5f56', '#7d838a', '#a35f45'], water: '#3f7089', park: '#487a35', industrial: '#70747a' },
  4: { ground: '#5f7140', lawn: ['#6a7e47', '#617543', '#788f50'], road: '#54575c', roadEdge: '#8e9399', roofs: ['#9aa0a6', '#b4b8bd', '#7c828a', '#a86b52', '#6d747c'], water: '#437a96', park: '#4a8438', industrial: '#7a8088' },
  5: { ground: '#4e6f4a', lawn: ['#4f8a52', '#468048', '#5a9a5c'], road: '#3f464e', roadEdge: '#6a7680', roofs: ['#3f6a8a', '#4f7f9a', '#2f8a7a', '#6a8ea0', '#39a08e'], water: '#2f86a8', park: '#3e9a4e', industrial: '#6a7e8a' },
};

const TYPE_STYLE = {
  rathaus: { roof: '#6fa293', w: 150, h: 96, tower: true }, bahnhof: { roof: '#8d8a84', w: 190, h: 70, rails: true }, markt: { roof: '#c46a43', w: 130, h: 90, stripes: true },
  arzt: { roof: '#e9edef', w: 80, h: 64, cross: true }, schule: { roof: '#b48a62', w: 140, h: 80, ell: true }, zeitung: { roof: '#6d737a', w: 120, h: 72 },
  lotto: { roof: '#e6b43d', w: 62, h: 50 }, spielbank: { roof: '#8b5fbf', w: 120, h: 84, glow: true }, pension: { roof: '#a2543b', w: 96, h: 66 },
  home: { roof: '#b8563c', w: 84, h: 62 }, biz: { roof: '#c98b3d', w: 112, h: 74 }, work: { roof: '#5c7fa6', w: 120, h: 78 },
};

function nearRiver(pts, x, y, r) { for (const p of pts) { const dx = p[0] - x; const dy = p[1] - y; if (dx * dx + dy * dy < r * r) return true; } return false; }

/**
 * @returns {{svg:string, spots:Object<string,{x:number,y:number}>}}
 */
export function buildAerial({ cityId, name, tier, era, buildings, aerial, selected }) {
  const r = rng(`aerial:${cityId}:${name}`);
  const p = PAL[era] || PAL[1];
  const { w: W, h: H } = WORLD;
  let out = '';
  const defs = `<defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${cityId}"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .22 0"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="3"/></filter>
  <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>`;
  // ---- Straßennetz
  const xs = []; const ys = [];
  for (let x = 90 + r() * 60; x < W - 80; x += 150 + r() * 70) xs.push(x);
  for (let y = 80 + r() * 50; y < H - 70; y += 128 + r() * 55) ys.push(y);
  const mainX = new Set(xs.filter((_, i) => i % 3 === 1)); const mainY = new Set(ys.filter((_, i) => i % 3 === 1));
  // ---- Fluss
  const hasRiver = tier >= 3 || r() < 0.55;
  const ry = H * (0.4 + r() * 0.25); const amp = 120 + r() * 140; const ph = r() * 6;
  const river = []; for (let x = -40; x <= W + 40; x += 20) river.push([x, ry + Math.sin(x / 330 + ph) * amp * 0.5 + Math.sin(x / 140 + ph * 2) * 28]);
  const riverPath = river.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(0)} ${q[1].toFixed(0)}`).join('');
  const cx = W / 2 + (r() - 0.5) * 160; const cy = H / 2 + (r() - 0.5) * 100;

  // ---- Blöcke
  const blocks = [];
  const gx = [0, ...xs, W]; const gy = [0, ...ys, H];
  for (let i = 0; i < gx.length - 1; i++) for (let j = 0; j < gy.length - 1; j++) {
    const rw = (mainX.has(gx[i]) ? 13 : 7); const rwR = (mainX.has(gx[i + 1]) ? 13 : 7);
    const rh = (mainY.has(gy[j]) ? 13 : 7); const rhB = (mainY.has(gy[j + 1]) ? 13 : 7);
    const x0 = gx[i] + (i ? rw : 0); const x1 = gx[i + 1] - (i + 1 < gx.length - 1 ? rwR : 0);
    const y0 = gy[j] + (j ? rh : 0); const y1 = gy[j + 1] - (j + 1 < gy.length - 1 ? rhB : 0);
    if (x1 - x0 < 50 || y1 - y0 < 50) continue;
    const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2;
    const d = Math.hypot((mx - cx) / (W / 2), (my - cy) / (H / 2));
    blocks.push({ x0, y0, x1, y1, mx, my, d, water: hasRiver && nearRiver(river, mx, my, 62), used: null });
  }
  // ---- Gebäude auf Blöcke verteilen (Rathaus im Zentrum, andere in Zentrumsnähe, eigene in Wohngebieten)
  const free = blocks.filter((b) => !b.water).sort((a, b) => a.d - b.d);
  const place = (key, preferInner) => {
    const pool = free.filter((b) => !b.used && (preferInner ? b.d < 0.55 : b.d < 0.85));
    const pick = pool.length ? pool[Math.floor(r() * Math.min(pool.length, preferInner ? 10 : 24))] : free.find((b) => !b.used);
    if (pick) pick.used = key;
    return pick;
  };
  const order = [...buildings].sort((a, b) => (a.type === 'rathaus' ? -1 : b.type === 'rathaus' ? 1 : (a.own === b.own ? 0 : a.own ? 1 : -1)));
  const spots = {};
  for (const b of order) {
    const blk = b.type === 'rathaus' ? (free[0].used = b.key, free[0]) : place(b.key, !b.own && !['bahnhof', 'pension'].includes(b.type));
    if (blk) spots[b.key] = { x: blk.mx, y: blk.my, blk };
  }

  if (aerial) {
    out += `<image href="/media/${esc(aerial)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
  } else {
    out += `<rect width="${W}" height="${H}" fill="${p.ground}"/>`;
    // Bodenflächen je Block
    for (const b of blocks) {
      const outer = b.d > 0.82; const park = !b.used && !b.water && r() < 0.08;
      const col = park ? p.park : p.lawn[Math.floor(r() * 3)];
      out += `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="${col}" ${outer ? 'opacity=".9"' : ''}/>`;
      b.park = park;
    }
    if (hasRiver) out += `<path d="${riverPath}" fill="none" stroke="${p.water}" stroke-width="74" stroke-linecap="round"/><path d="${riverPath}" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="54"/><path d="${riverPath}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="80" stroke-dasharray="1 0" transform="translate(0 4)" filter="url(#soft)"/>`;
    // Straßen
    let roads = '';
    for (const x of xs) { const wd = mainX.has(x) ? 26 : 14; roads += `<rect x="${x - wd / 2}" y="0" width="${wd}" height="${H}" fill="${p.road}"/>`; if (mainX.has(x)) roads += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${p.roadEdge}" stroke-width="1.5" stroke-dasharray="14 12" opacity=".7"/>`; }
    for (const y of ys) { const wd = mainY.has(y) ? 26 : 14; roads += `<rect x="0" y="${y - wd / 2}" width="${W}" height="${wd}" fill="${p.road}"/>`; if (mainY.has(y)) roads += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${p.roadEdge}" stroke-width="1.5" stroke-dasharray="14 12" opacity=".7"/>`; }
    out += roads;
    // Brücken-Geländer dort, wo Straßen den Fluss kreuzen
    if (hasRiver) for (const x of xs) { const q = river.reduce((m, pt) => (Math.abs(pt[0] - x) < Math.abs(m[0] - x) ? pt : m), river[0]); const wd = mainX.has(x) ? 26 : 14; out += `<rect x="${x - wd / 2 - 2}" y="${q[1] - 46}" width="${wd + 4}" height="92" fill="none" stroke="#d9d4c7" stroke-width="2" opacity=".8"/>`; }
    // Bebauung
    const shadow = (x, y, ww, hh) => `<rect x="${x + 6}" y="${y + 8}" width="${ww}" height="${hh}" fill="#000" opacity=".26"/>`;
    const gabled = era <= 2;
    for (const b of blocks) {
      if (b.water || b.park) {
        if (b.park) for (let i = 0; i < 14; i++) out += `<circle cx="${b.x0 + 8 + r() * (b.x1 - b.x0 - 16)}" cy="${b.y0 + 8 + r() * (b.y1 - b.y0 - 16)}" r="${5 + r() * 7}" fill="#2f5a25" opacity=".85"/>`;
        continue;
      }
      if (b.used) { out += `<rect x="${b.x0 + 3}" y="${b.y0 + 3}" width="${b.x1 - b.x0 - 6}" height="${b.y1 - b.y0 - 6}" fill="${p.lawn[0]}" opacity=".9"/>`; continue; }
      const bw = b.x1 - b.x0; const bh = b.y1 - b.y0;
      if (b.d > 0.9) { // Felder
        const col = ['#8a8b4a', '#6f7d3f', '#a09250', '#5d7338'][Math.floor(r() * 4)];
        for (let k = 0; k < 5; k++) out += `<rect x="${b.x0 + 4}" y="${b.y0 + 4 + k * (bh - 8) / 5}" width="${bw - 8}" height="${(bh - 8) / 5 - 2}" fill="${col}" opacity="${0.75 + r() * 0.2}"/>`;
        continue;
      }
      const industrial = tier >= 3 && b.d > 0.55 && r() < 0.14;
      const dense = b.d < 0.38;
      const cols = dense ? 3 : 2 + (r() < 0.5 ? 1 : 0); const rows = dense ? 2 + (r() < 0.5 ? 1 : 0) : 2;
      const cw = (bw - 10) / cols; const ch = (bh - 10) / rows;
      for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) {
        if (r() < (dense ? 0.06 : 0.2)) { out += `<circle cx="${b.x0 + 5 + ci * cw + cw / 2}" cy="${b.y0 + 5 + ri * ch + ch / 2}" r="${4 + r() * 6}" fill="#34602a" opacity=".8"/>`; continue; }
        const mg = industrial ? 3 : 5 + r() * 6;
        const x = b.x0 + 5 + ci * cw + mg; const y = b.y0 + 5 + ri * ch + mg; const ww = cw - mg * 2; const hh = ch - mg * 2;
        if (ww < 8 || hh < 8) continue;
        const roof = industrial ? p.industrial : p.roofs[Math.floor(r() * p.roofs.length)];
        out += shadow(x, y, ww, hh) + `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${roof}"/>`;
        if (gabled && !industrial) out += `<rect x="${x}" y="${y}" width="${ww}" height="${hh / 2}" fill="#fff" opacity=".13"/><line x1="${x}" y1="${y + hh / 2}" x2="${x + ww}" y2="${y + hh / 2}" stroke="#000" stroke-opacity=".3" stroke-width="1.4"/>`;
        else if (era >= 4 && r() < 0.3) out += `<rect x="${x + ww * 0.12}" y="${y + hh * 0.15}" width="${ww * 0.76}" height="${hh * 0.7}" fill="${era === 5 ? '#183c55' : '#2d4a63'}" opacity=".55"/>`;
        else out += `<rect x="${x + 2}" y="${y + 2}" width="${ww - 4}" height="${hh - 4}" fill="none" stroke="#000" stroke-opacity=".18"/>`;
      }
    }
    // Bäume entlang der Straßen
    for (let i = 0; i < 220; i++) { const onX = r() < 0.5; const px = onX ? xs[Math.floor(r() * xs.length)] + (r() < 0.5 ? -12 : 12) : r() * W; const py = onX ? r() * H : ys[Math.floor(r() * ys.length)] + (r() < 0.5 ? -12 : 12); if (hasRiver && nearRiver(river, px, py, 44)) continue; out += `<circle cx="${px}" cy="${py}" r="${3 + r() * 4}" fill="#2c5624" opacity=".75"/>`; }
    out += `<rect width="${W}" height="${H}" filter="url(#grain)" opacity=".7"/><rect width="${W}" height="${H}" fill="url(#vig)"/>`;
  }

  // ---- Landmarken (anklickbar)
  let marks = '';
  for (const b of buildings) {
    const s = spots[b.key]; if (!s) continue;
    const st = TYPE_STYLE[b.type] || TYPE_STYLE.home;
    const scale = b.type === 'home' && b.rooms ? 1 + Math.min(0.5, b.rooms / 30) : b.type === 'biz' ? 0.9 + (b.tier || 0) * 0.25 : 1;
    const ww = st.w * scale; const hh = st.h * scale; const x = s.x - ww / 2; const y = s.y - hh / 2;
    const own = b.own; const sel = selected === b.key;
    let g = `<g class="bld ${own ? 'own' : ''} ${sel ? 'sel' : ''}" data-key="${esc(b.key)}" tabindex="0" role="button" aria-label="${esc(b.name)}">`;
    g += `<rect class="hit" x="${s.blk.x0}" y="${s.blk.y0}" width="${s.blk.x1 - s.blk.x0}" height="${s.blk.y1 - s.blk.y0}" fill="transparent"/>`;
    g += `<rect x="${x + 9}" y="${y + 11}" width="${ww}" height="${hh}" fill="#000" opacity=".35" filter="url(#soft)"/>`;
    const roofCol = b.abandoned ? '#5b5348' : st.roof;
    if (st.ell) g += `<path d="M${x} ${y}h${ww}v${hh * 0.45}h${-ww * 0.4}v${hh * 0.55}h${-ww * 0.6}z" fill="${roofCol}"/>`;
    else g += `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="${st.tower ? 4 : 2}" fill="${roofCol}"/>`;
    g += `<rect x="${x}" y="${y}" width="${ww}" height="${hh * 0.5}" fill="#fff" opacity=".14"/><rect x="${x + 3}" y="${y + 3}" width="${ww - 6}" height="${hh - 6}" fill="none" stroke="#000" stroke-opacity=".22"/>`;
    if (st.stripes) for (let k = 0; k < 8; k++) g += `<rect x="${x + k * ww / 8}" y="${y}" width="${ww / 16}" height="${hh}" fill="#fff" opacity=".35"/>`;
    if (st.cross) g += `<rect x="${s.x - 4}" y="${s.y - 15}" width="8" height="30" fill="#d33"/><rect x="${s.x - 15}" y="${s.y - 4}" width="30" height="8" fill="#d33"/>`;
    if (st.tower) g += `<circle cx="${s.x}" cy="${s.y}" r="20" fill="#e8e0cb" stroke="#3b4a45" stroke-width="3"/><path d="M${s.x} ${s.y}v-13M${s.x} ${s.y}l8 5" stroke="#222" stroke-width="2"/>`;
    if (st.rails) for (let k = 0; k < 4; k++) g += `<line x1="${x - 40}" y1="${y + hh + 8 + k * 7}" x2="${x + ww + 40}" y2="${y + hh + 8 + k * 7}" stroke="#5a5348" stroke-width="2.4"/>`;
    if (st.glow) g += `<rect x="${x - 6}" y="${y - 6}" width="${ww + 12}" height="${hh + 12}" fill="none" stroke="#d6a6ff" stroke-width="3" opacity=".7"/>`;
    if (b.type === 'biz' && !b.abandoned) g += `<rect x="${x + ww * 0.2}" y="${y + hh * 0.2}" width="${ww * 0.6}" height="${hh * 0.6}" fill="#fff" opacity=".18"/>`;
    if (b.abandoned) for (let k = 0; k < 6; k++) g += `<line x1="${x + k * ww / 5}" y1="${y}" x2="${x + k * ww / 5 - 20}" y2="${y + hh}" stroke="#8a6a3a" stroke-width="5" opacity=".6"/>`;
    if (own) g += `<rect class="ownring" x="${x - 8}" y="${y - 8}" width="${ww + 16}" height="${hh + 16}" rx="6" fill="none" stroke="#f3cd7f" stroke-width="4" stroke-dasharray="12 8"/>`;
    // Pin + Label
    const py = y - 30;
    g += `<g class="pin" transform="translate(${s.x} ${py})"><circle r="22" class="pinbg"/><svg x="-12" y="-12" width="24" height="24" class="pinic"><use href="/img/icons.svg#i-${esc(b.icon || 'landmark')}"/></svg><path d="M-7 18 0 29 7 18z" class="pintail"/></g>`;
    g += `<text class="blabel" x="${s.x}" y="${py - 32}" text-anchor="middle">${esc(b.name)}</text>`;
    g += '</g>';
    marks += g;
  }
  const svg = `<svg class="aerial" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="application" aria-label="Luftansicht ${esc(name)}">${defs}<g id="avp">${out}${marks}</g></svg>`;
  return { svg, spots: Object.fromEntries(Object.entries(spots).map(([k, v]) => [k, { x: v.x, y: v.y }])) };
}
