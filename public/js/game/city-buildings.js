// Prozedurale Wahrzeichen der 3D-Stadt: jeder Gebäudetyp hat eine eigene, wiedererkennbare Silhouette
// (Rathaus mit Uhrenturm, Bahnhof mit Tonnendach, Markthalle mit Streifendach, Fachwerk-Wirtshaus mit Schild,
// Schmiede mit Esse, Scheune …). Alles wird aus Primitiven erzeugt und je Gebäude zu wenigen Meshes
// zusammengefasst; keine Bilddateien.
import { createBatches, seeded, hashString } from './mesh-batch.js';
import { signTexture, iconTexture } from './signs.js';

const UNIT = .1;
const C = {
  plaster: 0xe7dcc0, plasterWhite: 0xf0ebdf, ochre: 0xd9b678, rose: 0xdeb9a0, stone: 0xb4ad9d, stoneDark: 0x8a8578, brick: 0xa85a42, brickDark: 0x8a4632,
  timber: 0x4a3424, wood: 0x8a6038, woodDark: 0x5c3d26, door: 0x5b3a24, slate: 0x4b5057, metal: 0x6b7077, gold: 0xe3b94a, glass: 0x3e6270,
  glassOff: 0x34505c, roofRed: 0xa4503a, green: 0x3f7a4a, white: 0xffffff, coal: 0x2a2724, hay: 0xd8b25a, barn: 0xa03a2c, copper: 0x6fa293,
};
const CHAIN_STYLE = {
  wirt: 'inn', baecker: 'bakery', konditor: 'bakery', schmied: 'forge', tischler: 'workshop', maurer: 'workshop', installateur: 'workshop',
  landwirt: 'barn', gaertner: 'greenhouse', journalist: 'press', online_haendler: 'warehouse', taxifahrer: 'warehouse',
  friseur: 'shop', einzelhandelsverkaeufer: 'shop', reisekaufmann: 'shop', fitnesstrainer: 'shop', fleischermeister: 'shop',
};
export const styleOf = (b) => b.type === 'biz' ? (CHAIN_STYLE[b.pkey] || 'shop') : b.type;
const AWNING = { bakery: [0xd9822b, 0xf4ead2], shop: [0x2f6a8a, 0xf0ece0], inn: [0x8a2f2a, 0xf0ece0], default: [0x3a7a4a, 0xf0ece0] };

const ICON_OF = { inn: 'mug', bakery: 'pretzel', forge: 'anvil', arzt: 'cross', lotto: 'clover', workshop: 'saw', barn: 'wheat', spielbank: 'coin' };

/**
 * @param T three.js-Namespace
 * @param b Landmarke aus buildAerial (key, name, type, w, d, roof, own, pkey, tier, villa, abandoned …)
 * @param env { era:number }
 * @returns {{ group, litMaterial, height, chimneys:[{x,y,z,dark}], lights:[{x,y,z,color}], flags:[{x,y,z,col}] }}
 */
export function buildLandmark(T, b, env, shared) {
  const era = env.era || 1;
  let style = styleOf(b);
  if (style === 'work') style = era >= 4 ? 'warehouse' : 'press';
  const W = b.w * UNIT, D = b.d * UNIT;
  const rnd = seeded(hashString(b.key));
  const B = createBatches(T, ['lit', 'on', 'off']);
  const chimneys = [], lights = [];
  const roofCol = b.abandoned ? 0x625a50 : new T.Color(b.roof || '#a4503a').getHex();
  const trim = C.timber;
  let top = 0;
  const up = (y) => { if (y > top) top = y; };
  const box = (w, h, d, col, x, y, z, o) => { B.box('lit', w, h, d, col, x, y, z, o); up(y + h); };
  const cyl = (r, h, col, x, y, z, o) => { B.cyl('lit', r, h, col, x, y, z, o); up(y + h); };
  const cone = (r, h, col, x, y, z, o) => { B.cone('lit', r, h, col, x, y, z, o); up(y + h); };
  const gable = (w, h, d, col, x, y, z, o) => { B.gable('lit', w, h, d, col, x, y, z, o); up(y + h); };
  // Fenster: face f (+z), b (-z), l (-x), r (+x). Mittelpunkt liegt auf der Wandfläche.
  const FACE = { f: [0, 0, 1], b: [Math.PI, 0, -1], l: [-Math.PI / 2, -1, 0], r: [Math.PI / 2, 1, 0] };
  const win = (face, x, y, z, w = .5, h = .7, lit) => {
    const [ry, nx, nz] = FACE[face]; const on = !b.abandoned && (lit ?? rnd() < .72);
    B.box('lit', w + .16, h + .16, .06, trim, x + nx * .01, y - .08, z + nz * .01, { ry });
    B.box(on ? 'on' : 'off', w, h, .08, on ? 0xffd88a : C.glass, x + nx * .04, y, z + nz * .04, { ry });
    B.box('lit', .05, h, .1, trim, x + nx * .06, y, z + nz * .06, { ry }); B.box('lit', w, .05, .1, trim, x + nx * .06, y + h / 2 - .02, z + nz * .06, { ry });
    if (b.abandoned) for (let k = 0; k < 2; k++) B.box('lit', w + .3, .09, .06, 0x7a5a38, x + nx * .1, y + (k ? .2 : -.15), z + nz * .1, { ry, rz: k ? .12 : -.1 });
  };
  /** Fensterreihen an allen vier Seiten eines Quaders (Mitte cx/cz, Maße bw/bd). */
  const windows = (cx, cz, bw, bd, y0, floors, fh, o = {}) => {
    const { door = true, back = true, w = .5, h = .72, gap = 1.45 } = o;
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * fh + fh * .56;
      const nf = Math.max(1, Math.floor(bw / gap)); const sf = bw / nf;
      for (let i = 0; i < nf; i++) { const x = cx - bw / 2 + sf * (i + .5); if (door && f === 0 && Math.abs(x - cx) < .75) continue; win('f', x, y, cz + bd / 2, w, h); if (back) win('b', x, y, cz - bd / 2, w, h); }
      const ns = Math.max(1, Math.floor(bd / gap)); const ss = bd / ns;
      for (let i = 0; i < ns; i++) { const z = cz - bd / 2 + ss * (i + .5); win('l', cx - bw / 2, y, z, w, h); win('r', cx + bw / 2, y, z, w, h); }
    }
  };
  const door = (x, z, col = C.door, w = .95, h = 1.7) => {
    box(w + .3, h + .15, .1, trim, x, 0, z + .02); B.box('lit', w, h, .1, col, x, 0, z + .08); B.cyl('lit', .045, .12, C.gold, x + w * .3, .85, z + .14, { rx: Math.PI / 2, n: 8 });
    box(w + 1.0, .2, .8, C.stone, x, 0, z + .4); box(w + .6, .2, .55, C.stoneDark, x, .2, z + .3);
  };
  const plinth = (w, d, x = 0, z = 0) => box(w + .24, .32, d + .24, C.stone, x, 0, z);
  const timbering = (cx, cz, bw, bd, y0, floors, fh) => {
    const bm = (w, h, d, x, y, z, o) => B.box('lit', w, h, d, trim, x, y, z, o);
    for (const face of ['f', 'b', 'l', 'r']) {
      const [ry, nx, nz] = FACE[face]; const len = face === 'f' || face === 'b' ? bw : bd; const px = face === 'l' ? cx - bw / 2 : face === 'r' ? cx + bw / 2 : cx; const pz = face === 'f' ? cz + bd / 2 : face === 'b' ? cz - bd / 2 : cz;
      const place = (u, y, w, h, extra = {}) => { const ox = face === 'f' || face === 'b' ? u : 0; const oz = face === 'l' || face === 'r' ? u : 0; bm(w, h, .08, px + ox + nx * .045, y, pz + oz + nz * .045, { ry, ...extra }); };
      for (let f = 0; f <= floors; f++) place(0, y0 + f * fh, len + .1, .13);
      const n = Math.max(2, Math.round(len / 1.5)); for (let i = 0; i <= n; i++) for (let f = 0; f < floors; f++) place(-len / 2 + (len * i) / n, y0 + f * fh + fh / 2, .12, fh);
      for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) if ((i + f) % 2 === 0) { const ang = Math.atan2(fh * .75, len / n); place(-len / 2 + (len * (i + .5)) / n, y0 + f * fh + fh * .5, Math.hypot(len / n, fh * .75) * .95, .09, { rz: i % 4 < 2 ? ang : -ang }); }
    }
  };
  const chimney = (x, y, z, h = 1.5, col = C.brick, dark = false) => { box(.62, h, .62, col, x, y, z); box(.8, .14, .8, C.stoneDark, x, y + h, z); chimneys.push({ x, y: y + h + .1, z, dark }); };
  const awning = (cx, y, z, wd, cols, depth = 1.0, n = 8) => {
    for (let i = 0; i < n; i++) B.box('lit', wd / n, .06, depth, cols[i % 2], cx - wd / 2 + (wd / n) * (i + .5), y, z + depth / 2, { rx: .32 });
    up(y + .3);
  };
  const barrel = (x, z, h = .8) => { cyl(.34, h, C.wood, x, 0, z, { n: 10 }); B.cyl('lit', .36, .06, C.metal, x, h * .25, z, { n: 10 }); B.cyl('lit', .36, .06, C.metal, x, h * .7, z, { n: 10 }); };
  const crate = (x, z, y = 0, s = .6, col = C.wood) => box(s, s * .8, s, col, x, y, z, { ry: rnd() * .6 });
  const pole = (x, z, h, col = C.metal) => cyl(.05, h, col, x, 0, z, { n: 6 });
  const fence = (x0, x1, z, h = .7) => { const n = Math.max(2, Math.round(Math.abs(x1 - x0) / .9)); for (let i = 0; i <= n; i++) box(.08, h, .08, C.woodDark, x0 + ((x1 - x0) * i) / n, 0, z); box(Math.abs(x1 - x0), .07, .05, C.wood, (x0 + x1) / 2, h * .85, z); box(Math.abs(x1 - x0), .07, .05, C.wood, (x0 + x1) / 2, h * .45, z); };
  const flags = [];
  const mkFlag = (x, y, z, col = 0xc0392b) => { flags.push({ x, y, z, col }); pole(x, z, y, C.metal); };

  const era12 = era <= 2;
  const floors = (b.tier || 0) >= 1 ? 3 : 2;

  switch (style) {
    case 'rathaus': {
      const mw = W * .74, h1 = 3.4; plinth(mw, D * .86);
      box(mw, h1, D * .86, C.plaster, 0, .3, 0); windows(0, 0, mw, D * .86, .3, 2, h1 / 2, { door: true, gap: 1.7, w: .55, h: .85 });
      for (const sx of [-1, 1]) { box(W * .12, 2.8, D * .7, C.plasterWhite, sx * (mw / 2 + W * .06), .3, -D * .04); windows(sx * (mw / 2 + W * .06), -D * .04, W * .12, D * .7, .3, 2, 1.4, { door: false, gap: 1.4, back: false }); B.gable('lit', D * .7 + .5, 1.2, W * .12 + .5, roofCol, sx * (mw / 2 + W * .06), 3.1, -D * .04, { ry: Math.PI / 2 }); up(4.3); }
      gable(D * .86 + .6, 2.0, mw + .6, roofCol, 0, h1 + .3, 0, { ry: Math.PI / 2 });
      // Arkade vor dem Eingang
      for (let i = -2; i <= 2; i++) { cyl(.2, 2.3, C.stone, i * 1.15, .3, D * .43 + .75, { n: 10 }); box(.5, .15, .5, C.stoneDark, i * 1.15, 2.6, D * .43 + .75); }
      box(5.2, .25, 1.7, C.stone, 0, 2.75, D * .43 + .6); box(5.4, .12, 1.8, C.stoneDark, 0, 3.0, D * .43 + .6); box(5.4, .3, .06, C.stoneDark, 0, 3.0, D * .43 + 1.5);
      door(0, D * .43, C.door, 1.3, 2.0); box(6, .22, 1.4, C.stone, 0, 0, D * .43 + .9);
      // Uhrenturm
      const tz = D * .1, tw = 2.5; box(tw, 5.3, tw, C.stone, 0, h1 - .6, tz); box(tw + .3, .25, tw + .3, C.stoneDark, 0, h1 + 4.6, tz);
      for (const [fx, fz, ry] of [[0, tw / 2 + .06, 0], [0, -tw / 2 - .06, Math.PI], [tw / 2 + .06, 0, Math.PI / 2], [-tw / 2 - .06, 0, -Math.PI / 2]]) {
        B.cyl('lit', .78, .1, C.plasterWhite, fx, h1 + 2.3, tz + fz, { rx: Math.PI / 2, ry, n: 18 });
        // Rotation um X dreht die Zylinderachse nach z; für Seiten wird per Y gedreht
        B.box('lit', .07, .55, .06, 0x1d1d1d, fx, h1 + 2.55, tz + fz + (ry === 0 ? .08 : 0), { ry }); B.box('lit', .45, .07, .06, 0x1d1d1d, fx, h1 + 2.3, tz + fz + (ry === 0 ? .08 : 0), { ry });
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) B.box('on', dz ? .7 : .12, .9, dz ? .12 : .7, 0xffc979, dx * (tw / 2 + .02) * 0 + dx * (tw / 2), h1 + 3.9, tz + dz * (tw / 2));
      cone(2.0, 3.6, C.copper, 0, h1 + 4.85, tz, { n: 4, ry: Math.PI / 4 }); B.sphere('lit', .22, C.gold, 0, h1 + 8.6, tz); cyl(.04, .9, C.gold, 0, h1 + 8.6, tz, { n: 5 }); up(h1 + 9.5);
      mkFlag(-mw / 2 + .6, 7.8, D * .43 + .5); mkFlag(mw / 2 - .6, 7.8, D * .43 + .5, 0x1d1d1d);
      break;
    }
    case 'bahnhof': {
      const hallL = W * .6, r = D * .36; plinth(hallL, D * .62, -W * .08, -D * .12);
      box(hallL, 1.4, D * .62, C.brick, -W * .08, .3, -D * .12);
      B.vault('lit', hallL + .6, r + .15, r * 1.05, 0x6f7e86, -W * .08, 1.7, -D * .12 + 0, { sz: r + .25 }); up(1.7 + r * 1.05);
      for (let i = 0; i < 9; i++) { B.box('on', .55, 1.3, .08, 0xffe3a6, -W * .08 - hallL / 2 + .8 + i * ((hallL - 1.6) / 8), .55, D * .19 + .04); }
      // Empfangsgebäude mit Uhrenturm
      const sw = W * .26, sx = W * .35; plinth(sw, D * .7, sx, -D * .1);
      box(sw, 3.0, D * .7, C.ochre, sx, .3, -D * .1); windows(sx, -D * .1, sw, D * .7, .3, 2, 1.5, { door: true, gap: 1.6 }); gable(D * .7 + .6, 1.7, sw + .6, roofCol, sx, 3.3, -D * .1, { ry: Math.PI / 2 }); door(sx, D * .25, C.door, 1.2, 1.9);
      box(1.7, 4.6, 1.7, C.stone, sx - sw * .32, 2.6, -D * .1 + 1); B.cyl('lit', .55, .08, C.plasterWhite, sx - sw * .32, 6.6, -D * .1 + 1.9, { rx: Math.PI / 2, n: 16 }); cone(1.35, 1.8, C.slate, sx - sw * .32, 7.2, -D * .1 + 1, { n: 4, ry: Math.PI / 4 }); up(9.0);
      // Bahnsteig, Dach, Gleise, Zug
      const pz = D * .5 - .25; box(W + 2.5, .3, 1.5, C.stone, 0, 0, pz); for (let i = -3; i <= 3; i++) cyl(.07, 2.6, C.metal, i * (W / 7.2), .3, pz + .45, { n: 6 });
      box(W + 2.6, .12, 1.8, 0x5e676d, 0, 2.9, pz + .1); up(3.1);
      for (const zz of [pz + 1.3, pz + 2.1]) { box(W + 6, .08, .09, 0x888c90, 0, .12, zz); box(W + 6, .14, .06, 0x4c4a47, 0, .05, zz + .0); for (let i = -9; i <= 9; i++) box(.18, .06, 1.1, 0x4c3a2c, i * ((W + 6) / 18), .02, zz + .6 - 0.6 * 0, { }); }
      const tz = pz + 1.3, tc = era12 ? 0x26292d : 0x2f6b9a; const tx = -W * .22;
      box(3.4, 1.2, 1.0, tc, tx, .35, tz + .0); box(1.1, 1.7, 1.0, tc, tx + 1.3, .35, tz); B.box('on', 1.0, .4, .06, 0xffe3a6, tx - .6, 1.0, tz + .52);
      if (era12) { cyl(.42, 1.7, 0x1b1d20, tx - 1.0, .55, tz, { rx: 0, n: 12 }); cyl(.16, .75, 0x1b1d20, tx - 1.2, 1.9, tz, { n: 8 }); chimneys.push({ x: tx - 1.2, y: 2.75, z: tz, dark: true }); }
      for (let k = 1; k <= 2; k++) { box(3.4, 1.15, 1.0, era12 ? 0x7a3b2a : 0xdbe2e6, tx + 3.6 * k + (k > 1 ? .1 : 0), .35, tz); B.box('on', 3.0, .38, .06, 0xffe3a6, tx + 3.6 * k, 1.0, tz + .52); }
      break;
    }
    case 'markt': {
      const hw = W * .82, hd = D * .78; box(hw + .4, .25, hd + .4, 0xc9bfa6, 0, 0, 0);
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { cyl(.17, 2.3, C.woodDark, sx * hw / 2, .25, -hd / 2 + (hd * i) / 3, { n: 8 }); }
      for (let i = 0; i < 6; i++) { box(.17, 2.3, .17, C.woodDark, -hw / 2 + (hw * i) / 5, .25, hd / 2); box(.17, 2.3, .17, C.woodDark, -hw / 2 + (hw * i) / 5, .25, -hd / 2); }
      const segs = 10; for (let i = 0; i < segs; i++) B.gable('lit', hd + .8, 1.9, (hw + .8) / segs, i % 2 ? 0xe9e2cf : 0xc4452f, -hw / 2 - .4 + ((hw + .8) / segs) * (i + .5), 2.55, 0, { ry: Math.PI / 2 }); up(4.5);
      // Auslagen
      const colors = [0xd9402a, 0x6aa84a, 0xf0b92a, 0xd77a2a, 0x8a5aa0];
      for (let s = 0; s < 3; s++) { const sx = -hw / 3 + (hw / 3) * s; box(2.0, .9, .9, C.wood, sx, .25, -hd * .2); awning(sx, 1.95, -hd * .2 + .3, 2.2, [AWNING.shop[0] + s * 0x101010, 0xf0ece0], .8, 6); for (let k = 0; k < 7; k++) B.sphere('lit', .15, colors[(k + s) % 5], sx - .75 + k * .25, 1.28, -hd * .2 + (k % 2) * .15); }
      for (let i = 0; i < 4; i++) crate(hw * .32 + (i % 2) * .5, hd * .22 + Math.floor(i / 2) * .6, 0.25, .55);
      barrel(-hw * .4, hd * .3); barrel(-hw * .4 + .8, hd * .34);
      mkFlag(hw / 2 - .4, 6.5, hd / 2 - .3, 0xc4452f);
      break;
    }
    case 'arzt': {
      const bw = W * .86, bd = D * .82; plinth(bw, bd);
      box(bw, 3.6, bd, C.plasterWhite, 0, .3, 0); windows(0, 0, bw, bd, .3, 2, 1.8, { gap: 1.5 });
      gable(bd + .5, 1.5, bw + .5, 0x4f7a82, 0, 3.9, 0, { ry: Math.PI / 2 });
      box(.5, 1.6, .5, C.stoneDark, bw * .28, 4.2, -bd * .2); box(1.6, 1.4, .16, C.plasterWhite, -bw * .22, 3.95, bd / 2 - .1); gable(1.9, .8, .6, 0x4f7a82, -bw * .22, 5.2, bd / 2 - .2);
      door(0, bd / 2, 0x3f7a58, 1.0, 1.7); box(.18, 1.1, .1, 0xc0392b, bw * .32, 2.7, bd / 2 + .08); box(1.1, .18, .1, 0xc0392b, bw * .32, 3.15, bd / 2 + .08);
      box(1.3, .12, 1.6, 0x9aa3a8, -bw * .32, 0, bd / 2 + .8, { rx: 0 });
      break;
    }
    case 'schule': {
      const bw = W * .88, bd = D * .66; plinth(bw, bd, 0, -D * .06);
      box(bw, 3.3, bd, 0xd6b27a, 0, .3, -D * .06); windows(0, -D * .06, bw, bd, .3, 2, 1.65, { gap: 1.55, w: .6, h: .9 });
      gable(bd + .6, 1.6, bw + .6, roofCol, 0, 3.6, -D * .06, { ry: Math.PI / 2 });
      const tz = bd / 2 - D * .06 - .2; box(2.4, 4.4, 2.4, 0xcfa96f, 0, 3.0, tz - .6); cone(1.8, 2.6, 0x4a4f55, 0, 7.4, tz - .6, { n: 4, ry: Math.PI / 4 }); B.box('on', 1.0, 1.1, .12, 0xffc979, 0, 5.6, tz + .62);
      cyl(.3, .5, C.gold, 0, 6.2, tz - .6, { n: 8 }); up(10.2); door(0, tz + .6, C.door, 1.3, 1.9);
      fence(-bw / 2, bw / 2, D * .46, .8);
      mkFlag(bw / 2 - .8, 6.5, D * .42, 0x2f6a8a);
      break;
    }
    case 'zeitung': {
      const bw = W * .86, bd = D * .78; plinth(bw, bd);
      box(bw, 3.5, bd, C.brick, 0, .3, 0); windows(0, 0, bw, bd, .3, 2, 1.75, { gap: 1.9, w: .8, h: 1.05 });
      for (let i = 0; i < 4; i++) { B.gable('lit', bd + .3, 1.0, (bw + .3) / 4, i % 2 ? 0x5d6870 : 0x6d7880, -bw / 2 - .15 + ((bw + .3) / 4) * (i + .5), 3.8, 0, { ry: Math.PI / 2 }); } up(4.8);
      cyl(.5, 7.2, C.brickDark, bw * .34, .3, -bd * .25, { n: 12 }); cyl(.62, .3, C.stoneDark, bw * .34, 7.4, -bd * .25, { n: 12 }); chimneys.push({ x: bw * .34, y: 7.9, z: -bd * .25, dark: true });
      door(-bw * .18, bd / 2, 0x335a3f, 1.2, 1.85); awning(bw * .12, 2.15, bd / 2, 2.8, [0x336b46, 0xf0ece0], .9, 8); for (let i = 0; i < 3; i++) crate(bw * .3 + i * .15, bd / 2 + .6, i * .2, .7, 0xe8e2d0);
      break;
    }
    case 'lotto': {
      const bw = W * .8, bd = D * .74; plinth(bw, bd);
      box(bw, 2.8, bd, 0xf1d36a, 0, .3, 0); windows(0, 0, bw, bd, .3, 1, 2.6, { door: false, gap: 2.0, w: 1.2, h: 1.0, back: false });
      box(bw + .6, .25, bd + .6, 0xd0b04a, 0, 3.1, 0); box(bw + .4, .12, bd + .4, 0x7d6726, 0, 3.35, 0);
      awning(0, 2.3, bd / 2, bw + .2, [0xf0c43a, 0xf8f4e6], 1.1, 8); door(bw * .3, bd / 2, 0x2f6a8a, .9, 1.6);
      pole(-bw / 2 - .5, bd / 2, 3.6); box(1.2, 1.2, .12, 0x2f8a46, -bw / 2 - .5, 3.4, bd / 2); B.sphere('lit', .32, C.white, -bw / 2 - .5, 4.0, bd / 2 + .1);
      break;
    }
    case 'spielbank': {
      const bw = W * .82, bd = D * .82; plinth(bw, bd);
      box(bw, 3.8, bd, 0xf1e6d2, 0, .3, 0); windows(0, 0, bw, bd, .3, 2, 1.9, { gap: 1.4, w: .55, h: .9 });
      for (let i = -2; i <= 2; i++) { cyl(.22, 3.4, C.white, i * 1.55, .3, bd / 2 + .9, { n: 12 }); } box(bw * .72, .35, 1.9, 0xe9deca, 0, 3.7, bd / 2 + .35);
      gable(2.4, 1.4, bw * .72, 0xb8a06a, 0, 4.0, bd / 2 + .35, { ry: Math.PI / 2 });
      door(0, bd / 2, 0x4a1d5a, 1.4, 2.0); gable(bd + .5, 1.1, bw + .5, 0x6a4a8a, 0, 4.1, 0, { ry: Math.PI / 2 });
      cyl(1.6, .8, 0xe9deca, 0, 5.0, 0, { n: 16 }); B.dome('lit', 1.6, 0x8b5fbf, 0, 5.8, 0); B.sphere('lit', .2, C.gold, 0, 7.5, 0); up(7.8);
      for (let i = 0; i < 6; i++) B.sphere('on', .1, 0xffe9a0, -bw / 2 + 0.6 + i * ((bw - 1.2) / 5), 3.55, bd / 2 + 1.3);
      lights.push({ x: 0, y: 3.2, z: bd / 2 + 1.4, color: 0xd6a6ff });
      break;
    }
    case 'pension': case 'home': {
      const villa = b.villa || (b.rooms || 0) >= 12;
      const sc = b.type === 'home' ? Math.min(1.25, .85 + (b.rooms || 2) / 28) : 1;
      const bw = W * .78 * sc / (b.type === 'home' ? Math.max(1, sc * .8) : 1), bd = D * .78; const fl = style === 'pension' ? 3 : villa ? 3 : 2; const fh = 1.7;
      plinth(bw, bd);
      if (era12 || style === 'pension') {
        box(bw, fl * fh, bd, C.plaster, 0, .3, 0); windows(0, 0, bw, bd, .3, fl, fh, { gap: 1.5 }); timbering(0, 0, bw, bd, .3, fl, fh);
        for (let f = 1; f < fl; f++) box(bw + .3, .12, bd + .3, C.timber, 0, .3 + f * fh - .05, 0);
        gable(bd + .7, 1.6 + (villa ? .4 : 0), bw + .7, roofCol, 0, .3 + fl * fh, 0, { ry: Math.PI / 2 });
        box(1.3, 1.1, .18, C.plaster, -bw * .2, .3 + fl * fh, bd / 2 - .2); gable(1.5, .8, .5, roofCol, -bw * .2, .3 + fl * fh + 1.1, bd / 2 - .3);
        B.box('on', .5, .55, .08, 0xffd88a, -bw * .2, .3 + fl * fh + .25, bd / 2 - .08);
        chimney(bw * .28, .3 + fl * fh + .2, -bd * .15, 1.3);
        if (style === 'pension') { pole(bw / 2 + .3, bd / 2 + .2, 3.2, C.woodDark); box(1.0, .12, .12, C.woodDark, bw / 2 - .15, 3.2, bd / 2 + .2); }
      } else {
        box(bw, fl * fh, bd, era >= 4 ? 0xefede6 : 0xe5d9bb, 0, .3, 0); windows(0, 0, bw, bd, .3, fl, fh, { gap: 1.6, w: .7, h: .9 });
        if (era >= 4) { box(bw + .3, .3, bd + .3, 0x7b8086, 0, .3 + fl * fh, 0); box(bw * .5, .9, bd + .1, 0xc6cacd, bw * .15, .6 + fl * fh, 0); } else gable(bd + .5, 1.2, bw + .5, roofCol, 0, .3 + fl * fh, 0, { ry: Math.PI / 2 });
        chimney(bw * .3, .3 + fl * fh, -bd * .2, 1.0, C.stoneDark);
      }
      door(bw * .12, bd / 2, C.door, 1.0, 1.7);
      if (villa) { box(bw * .35, 2.6, bd * .6, C.plasterWhite, bw / 2 + bw * .15, .3, bd * .05); gable(bd * .6 + .5, 1.2, bw * .35 + .4, roofCol, bw / 2 + bw * .15, 2.9, bd * .05, { ry: Math.PI / 2 }); windows(bw / 2 + bw * .15, bd * .05, bw * .35, bd * .6, .3, 1, 2.4, { door: false, gap: 1.3, back: false }); box(2, .12, 1.0, C.stone, -bw * .25, 1.6, bd / 2 + .5); for (const sx of [-1, 1]) cyl(.07, 1.3, C.white, -bw * .25 + sx * .85, .3, bd / 2 + .9, { n: 6 }); }
      for (let k = 0; k < 4; k++) B.sphere('lit', .22, [0xd9402a, 0xf0b92a, 0xe6a1c0, 0xf0ece0][k], -bw / 2 + .6 + k * .7, .55, bd / 2 + .25, { sy: .16 });
      break;
    }
    case 'inn': case 'bakery': case 'shop': case 'press': case 'warehouse': case 'workshop': case 'forge': case 'greenhouse': case 'barn': case 'work': default: {
      const bw = W * .8, bd = D * .78; const fl = Math.min(3, 1 + Math.max(1, (b.tier || 0) + 1)); const fh = 1.75;
      plinth(bw, bd);
      const ac = AWNING[style] || AWNING.default;
      if (style === 'inn') {
        const f = fl; box(bw, f * fh, bd, C.plaster, 0, .3, 0); windows(0, 0, bw, bd, .3, f, fh, { gap: 1.45 }); timbering(0, 0, bw, bd, .3, f, fh);
        for (let k = 1; k < f; k++) box(bw + .3, .12, bd + .3, C.timber, 0, .3 + k * fh - .05, 0);
        gable(bd + .7, 1.8, bw + .7, roofCol, 0, .3 + f * fh, 0, { ry: Math.PI / 2 });
        for (const sx of [-1, 1]) { box(1.1, 1.0, .16, C.plaster, sx * bw * .24, .3 + f * fh, bd / 2 - .18); gable(1.3, .7, .5, roofCol, sx * bw * .24, .3 + f * fh + 1.0, bd / 2 - .26); B.box('on', .45, .5, .08, 0xffd88a, sx * bw * .24, .3 + f * fh + .22, bd / 2 - .08); }
        chimney(bw * .32, .3 + f * fh + .3, -bd * .1, 1.5); door(0, bd / 2, C.door, 1.1, 1.8);
        // Auslegerschild mit Krug, Fässer, Tische mit Schirmen
        box(1.5, .12, .12, 0x2a2a2a, bw * .36 + .5, 2.9, bd / 2 + .3); B.box('lit', .06, .5, .06, 0x2a2a2a, bw * .36 + 1.1, 2.55, bd / 2 + .3); B.box('lit', .06, .5, .06, 0x2a2a2a, bw * .36 - .05, 2.55, bd / 2 + .3);
        barrel(-bw / 2 - .2, bd / 2 + .5); barrel(-bw / 2 + .6, bd / 2 + .6, .7);
        for (let i = 0; i < 2; i++) { const tx = -bw * .12 + i * 2.0; cyl(.4, .8, C.woodDark, tx, 0, bd / 2 + 1.3, { n: 8 }); cyl(.05, 1.8, C.metal, tx, 0, bd / 2 + 1.3, { n: 5 }); cone(1.0, .45, i ? 0x2f6a8a : 0xa8372c, tx, 1.8, bd / 2 + 1.3, { n: 8 }); }
      } else if (style === 'bakery') {
        const f = fl; box(bw, f * fh, bd, 0xe9c88e, 0, .3, 0); windows(0, 0, bw, bd, .3, f, fh, { gap: 1.5 });
        gable(bd + .6, 1.5, bw + .6, roofCol, 0, .3 + f * fh, 0, { ry: Math.PI / 2 }); chimney(bw * .3, .3 + f * fh + .3, -bd * .1, 1.7, C.brickDark);
        door(-bw * .2, bd / 2, C.door, 1.0, 1.8); awning(bw * .17, 2.1, bd / 2, 2.6, ac, 1.0, 8); box(1.5, .95, .8, C.wood, bw * .17, 0, bd / 2 + .35);
        for (let k = 0; k < 4; k++) B.sphere('lit', .17, 0xc98e45, bw * .17 - .5 + k * .33, 1.05, bd / 2 + .3, { sy: .1 });
        for (let k = 0; k < 3; k++) box(.7, .5, .45, 0xe3d2b0, bw / 2 - .5, k * .5, bd / 2 + .5 - k * .02, { ry: .3 * k });
      } else if (style === 'forge') {
        box(bw, 2.8, bd, C.stoneDark, 0, .3, 0); windows(0, 0, bw, bd, .3, 1, 2.8, { gap: 2.2, w: .6, h: .8, door: false }); gable(bd + .6, 1.5, bw + .6, b.abandoned ? roofCol : 0x555a60, 0, 3.1, 0, { ry: Math.PI / 2 });
        box(1.5, 6.0, 1.5, C.stone, bw * .3, .3, -bd * .15); box(1.8, .3, 1.8, C.stoneDark, bw * .3, 6.2, -bd * .15); chimneys.push({ x: bw * .3, y: 6.7, z: -bd * .15, dark: true });
        box(2.6, 2.3, 2.2, 0x6a6258, -bw / 2 - 1.1, .3, bd * .1); B.gable('lit', 2.6, .8, 2.6, 0x4c4a47, -bw / 2 - 1.1, 2.55, bd * .1, { ry: Math.PI / 2 }); B.box('on', 1.0, .9, .08, 0xff7a2a, -bw / 2 - 1.1, .9, bd * .1 + 1.15); lights.push({ x: -bw / 2 - 1.1, y: 1.2, z: bd * .1 + 1.5, color: 0xff7a2a });
        door(-bw * .1, bd / 2, 0x3a2e24, 1.5, 1.9); box(.7, .5, .45, 0x2f3237, bw * .35, 0, bd / 2 + .9); box(.3, .4, .25, 0x2f3237, bw * .35, .5, bd / 2 + .9); box(1.2, .6, .9, C.coal, bw * .05, 0, bd / 2 + 1.0);
      } else if (style === 'workshop') {
        box(bw, 2.8, bd, 0xd9c9a2, 0, .3, 0); windows(0, 0, bw, bd, .3, 1, 2.8, { gap: 1.7 });
        B.gable('lit', bd + .6, 1.3, bw + .6, roofCol, 0, 3.1, 0, { ry: Math.PI / 2 }); up(4.4);
        box(bw * .55, .12, 2.2, C.woodDark, -bw * .2, 2.4, bd / 2 + 1.0); for (const sx of [-1, 1]) box(.14, 2.4, .14, C.woodDark, -bw * .2 + sx * bw * .26, 0, bd / 2 + 2.0);
        for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) cyl(.17, 1.5, 0x9a7a4a, -bw * .45 + k * .36, .17 + r * .32, bd / 2 + 1.2, { rz: Math.PI / 2, n: 7 });
        door(bw * .2, bd / 2, C.door, 1.4, 1.9); chimney(bw * .35, 3.1, -bd * .2, 1.2);
      } else if (style === 'barn') {
        box(bw, 2.8, bd, C.barn, 0, .3, 0); for (let i = 0; i < 9; i++) box(.06, 2.8, .04, 0xefe6d2, -bw / 2 + .5 + i * (bw - 1) / 8, .3, bd / 2 + .02);
        gable(bd + .8, 2.8, bw + .8, 0x4a4540, 0, 3.1, 0, { ry: Math.PI / 2 }); box(2.0, 2.2, .1, 0xefe6d2, 0, .3, bd / 2 + .06); box(.1, 2.2, .06, C.barn, 0, .3, bd / 2 + .1); B.box('lit', 2.0, .1, .06, C.barn, 0, 1.4, bd / 2 + .1, { rz: .6 });
        cyl(.9, 4.2, 0xb9b3a6, bw * .5 + 1.2, .3, -bd * .1, { n: 14 }); B.dome('lit', .95, 0x6a6e73, bw * .5 + 1.2, 4.5, -bd * .1);
        for (let i = 0; i < 3; i++) cyl(.5, .8, C.hay, -bw * .5 - .5 - (i % 2) * .5, .0, bd * .1 + i * .8, { rz: Math.PI / 2, n: 10 });
      } else if (style === 'greenhouse') {
        box(bw * .95, 1.0, bd * .9, C.stone, 0, .3, 0); B.box('on', bw * .9, 1.6, bd * .86, 0x9fd8c8, 0, 1.3, 0);
        B.gable('on', bd * .88, 1.0, bw * .92, 0xbfe9dc, 0, 2.9, 0, { ry: Math.PI / 2 }); for (let i = 0; i <= 8; i++) box(.06, 1.6, bd * .88, 0xe8efe9, -bw * .45 + i * bw * .9 / 8, 1.3, 0);
        for (let i = 0; i < 12; i++) B.sphere('lit', .16, [0xd9402a, 0xf0b92a, 0xe6a1c0, 0x4d9a4a][i % 4], -bw * .4 + (i % 6) * .7, .7, bd * .55 + Math.floor(i / 6) * .3, { sy: .6 });
        door(bw * .3, bd * .45, 0x4a7a55, 1.0, 1.7);
      } else if (style === 'press') {
        box(bw, 3.5, bd, C.brick, 0, .3, 0); windows(0, 0, bw, bd, .3, 2, 1.75, { gap: 1.9, w: .8, h: 1.0 });
        for (let i = 0; i < 4; i++) B.gable('lit', bd + .3, 1.0, (bw + .3) / 4, i % 2 ? 0x5d6870 : 0x6d7880, -bw / 2 - .15 + ((bw + .3) / 4) * (i + .5), 3.8, 0, { ry: Math.PI / 2 }); up(4.8);
        cyl(.45, 6.6, C.brickDark, bw * .34, .3, -bd * .25, { n: 12 }); chimneys.push({ x: bw * .34, y: 7.1, z: -bd * .25, dark: true }); door(-bw * .18, bd / 2, 0x335a3f, 1.2, 1.85);
      } else if (style === 'warehouse') {
        box(bw, 2.9, bd, 0xb9bec2, 0, .3, 0); for (let i = 0; i < 3; i++) { box(1.6, 1.9, .12, 0x5b6d7a, -bw * .3 + i * bw * .3, .3, bd / 2 + .06); } box(bw + .3, .25, bd + .3, 0x5d646a, 0, 3.2, 0); box(bw * .6, .5, bd * .6, 0x7b838a, 0, 3.4, 0);
        windows(0, 0, bw, bd, 2.1, 1, 1.0, { door: false, gap: 2.2, w: 1.2, h: .45, back: false });
        for (let i = 0; i < 3; i++) crate(bw * .35 + (i % 2) * .6, bd / 2 + .7 + Math.floor(i / 2) * .2, 0, .8, 0xb58a4f);
      } else { // shop
        const f = fl; box(bw, f * fh, bd, [C.rose, C.plasterWhite, C.ochre][hashString(b.key) % 3], 0, .3, 0); windows(0, 0, bw, bd, .3, f, fh, { gap: 1.5 });
        if (era >= 4) { box(bw + .3, .3, bd + .3, 0x7b8086, 0, .3 + f * fh, 0); } else gable(bd + .6, 1.4, bw + .6, roofCol, 0, .3 + f * fh, 0, { ry: Math.PI / 2 });
        door(bw * .2, bd / 2, C.door, 1.0, 1.8); awning(-bw * .14, 2.1, bd / 2, bw * .5, ac, 1.0, 8); B.box('on', bw * .4, 1.1, .08, 0xffe1a0, -bw * .14, .7, bd / 2 + .06);
        chimney(bw * .3, .3 + f * fh + (era >= 4 ? .3 : .2), -bd * .2, 1.0, C.stoneDark);
      }
      if ((b.tier || 0) >= 2 && style !== 'barn' && style !== 'greenhouse') { box(bw * .3, 3.2, bd * .5, 0xddd0b5, bw / 2 + bw * .15, .3, -bd * .1); gable(bd * .5 + .5, 1.1, bw * .3 + .4, roofCol, bw / 2 + bw * .15, 3.5, -bd * .1, { ry: Math.PI / 2 }); }
      break;
    }
  }

  // Namensschild an der Fassade (außer wenn eigenes Dach-/Zeichenkonzept)
  const group = new T.Group(); group.userData.key = b.key;
  const litGeo = B.build('lit'), onGeo = B.build('on'), offGeo = B.build('off');
  const litMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .02, side: T.DoubleSide });
  const m1 = new T.Mesh(litGeo, litMat); m1.castShadow = true; m1.receiveShadow = true; group.add(m1);
  if (onGeo) { const m = new T.Mesh(onGeo, shared.glassOn); group.add(m); }
  if (offGeo) { const m = new T.Mesh(offGeo, shared.glassOff); group.add(m); }
  B.dispose();
  const signW = Math.min(W * .62, 4.6), signH = signW / 5.3;
  const signZ = style === 'rathaus' ? D * .43 + 1.55 : style === 'bahnhof' ? D * .5 + .6 : style === 'markt' ? D * .39 + .25 : D * .39 + .12;
  const signY = style === 'rathaus' ? 3.35 : style === 'bahnhof' ? 3.5 : style === 'markt' ? 4.3 : style === 'spielbank' ? 3.6 : style === 'lotto' ? 2.75 : Math.min(top, 3.1) - .35 + (style === 'forge' ? 0 : 0);
  const hanging = style === 'inn';
  if (!b.abandoned) {
    const sign = new T.Mesh(new T.PlaneGeometry(signW, signH), new T.MeshStandardMaterial({ map: signTexture(T, b.name, { bg: b.own ? '#6a4b17' : '#4d3320', fg: b.own ? '#ffe9a8' : '#f5ead1', border: b.own ? '#e3b94a' : '#2b1d12' }), roughness: .8 }));
    sign.position.set(hanging ? W * .8 * .36 * 0 : 0, signY, signZ + (hanging ? .75 : .1)); if (!hanging) sign.position.x = style === 'rathaus' ? 0 : (style === 'bahnhof' ? -W * .08 : 0); sign.castShadow = false; group.add(sign);
    const icon = ICON_OF[style];
    if (icon) {
      const hang = new T.Mesh(new T.PlaneGeometry(.72, .72), new T.MeshStandardMaterial({ map: iconTexture(T, icon), roughness: .8, side: T.DoubleSide }));
      const bwTotal = W * .8; hang.position.set(style === 'inn' ? bwTotal * .36 + .55 : signW / 2 + .5, style === 'inn' ? 2.25 : signY, style === 'inn' ? D * .39 + .3 : signZ + .12);
      if (style === 'inn') hang.rotation.y = Math.PI / 2 * 0; group.add(hang);
    }
  }
  group.userData.height = top; group.userData.size = [W, D];
  group.traverse((m) => { if (m.isMesh) { m.userData.key = b.key; } });
  return { group, litMaterial: litMat, height: top, chimneys, lights, flags, style };
}
