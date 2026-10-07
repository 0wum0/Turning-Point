// Prozedurale 3D-Räume (three.js). Jeder Raum liefert Objekte + anklickbare Hotspots.
const PAL = {
  1: { wall: 0xcdbb9a, trim: 0x6b5a3f, floor: 0x8a6a45, floor2: 0x7a5b3a, accent: 0xa2300f, light: 0xffd9a0, bg: 0x1a130c, kind: 'planks' },
  2: { wall: 0xd8c7a8, trim: 0x7a6548, floor: 0x9b7b55, floor2: 0x8a6a46, accent: 0xe07b2f, light: 0xffe0b0, bg: 0x1d1510, kind: 'planks' },
  3: { wall: 0xe6e2da, trim: 0x8a8a8a, floor: 0x7d8892, floor2: 0x6f7a84, accent: 0x8b5fbf, light: 0xfff0e0, bg: 0x15131f, kind: 'tiles' },
  4: { wall: 0xf0efe9, trim: 0xb8b4aa, floor: 0xb9a58a, floor2: 0xa8957a, accent: 0x3f74e0, light: 0xffffff, bg: 0x11151d, kind: 'planks' },
  5: { wall: 0xdfeaef, trim: 0x9fb4be, floor: 0xcfd8dc, floor2: 0xbec9ce, accent: 0x35e0d0, light: 0xe6fbff, bg: 0x0a141b, kind: 'tiles' },
};
import { makeTextures } from './textures.js';
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export function buildRoom(T, b, ctx) {
  const v = new Proxy({}, { get: (_, k) => ctx.view[k] }); const era = ctx.view.date.eraKey; const pal = PAL[era] || PAL[1];
  const scene = new T.Scene(); scene.background = new T.Color(pal.bg);
  const hot = []; const props = new T.Group(); scene.add(props);
  const rooms = Math.max(1, b.rooms || 1);
  let w = 10; let d = 8;
  if (b.type === 'home') { const s = Math.min(2, 0.9 + rooms / 7); w = 9 * s; d = 7 * s; }
  if (['rathaus', 'markt', 'bahnhof', 'spielbank'].includes(b.type)) { w = 14; d = 10; }
  if (b.type === 'biz') { const s = 1 + (b.tier || 0) * 0.35 + Math.min(0.4, rooms / 40); w = 11 * s; d = 8.5 * s; }
  if (b.type === 'lotto') { w = 7; d = 6; }
  const ht = 3.4;

  const TX = makeTextures(T);
  const mat = (c, o = {}) => {
    const kind = o.tex === undefined ? TX.kindFor(c) : o.tex;
    const m = new T.MeshStandardMaterial({ color: c, roughness: kind === 'metal' ? 0.45 : kind === 'marble' ? 0.3 : 0.82, metalness: kind === 'metal' ? 0.55 : 0.04, ...o.mat });
    if (kind) { const t = TX.get(kind); m.map = t.map; m.bumpMap = t.bump; m.bumpScale = t.bumpScale * 0.6; }
    return m;
  };
  const part = (geo, c, x, y, z, parent, o = {}) => { const m = new T.Mesh(geo, o.m || mat(c, o)); m.position.set(x, y, z); m.castShadow = !o.noShadow; m.receiveShadow = true; if (o.rot) m.rotation.set(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0); parent.add(m); return m; };
  const box = (bw, bh, bd, c, x, y, z, parent = props, o = {}) => part(new T.BoxGeometry(bw, bh, bd), c, x, y + bh / 2, z, parent, o);
  const cyl = (rt, rb, bh, c, x, y, z, parent = props, o = {}) => part(new T.CylinderGeometry(rt, rb, bh, 20), c, x, y + bh / 2, z, parent, o);
  const sph = (r, c, x, y, z, parent = props, o = {}) => part(new T.SphereGeometry(r, 18, 14), c, x, y, z, parent, o);
  const group = (x, z, rot = 0) => { const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rot; props.add(g); return g; };

  // ---- Boden & Wände (Puppenhaus-Schnitt)
  const floorKind = { markt: 'tile', bahnhof: 'tile', arzt: 'tile', rathaus: 'marble', spielbank: 'carpet' }[b.type] || (pal.kind === 'tiles' ? 'tile' : 'wood');
  const floorTint = floorKind === 'carpet' ? 0x7a1f2a : floorKind === 'marble' ? 0xe6e1d6 : floorKind === 'tile' ? (b.type === 'arzt' ? 0xdfe9ec : pal.floor) : pal.floor;
  const ft = TX.get(floorKind, [w / 3, d / 3]);
  const floorMat = new T.MeshStandardMaterial({ color: floorTint, map: ft.map, bumpMap: ft.bump, bumpScale: ft.bumpScale * 0.5, roughness: floorKind === 'marble' ? 0.28 : 0.72, metalness: 0.03 });
  const floor = new T.Mesh(new T.BoxGeometry(w, 0.3, d), floorMat); floor.position.set(0, -0.15, 0); floor.receiveShadow = true; scene.add(floor);
  const wallKind = (b.type === 'markt' || (b.type === 'biz' && b.pkey === 'schmied')) ? 'brick' : 'plaster';
  const wallMat = (len) => { const t = TX.get(wallKind, [len / 3, 1]); return new T.MeshStandardMaterial({ color: wallKind === 'brick' ? 0xb86a4a : pal.wall, map: t.map, bumpMap: t.bump, bumpScale: t.bumpScale * 0.7, roughness: 0.9 }); };
  const wallBack = new T.Mesh(new T.BoxGeometry(w + 0.4, ht, 0.3), wallMat(w)); wallBack.position.set(0, ht / 2, -d / 2 - 0.15); wallBack.receiveShadow = true; scene.add(wallBack);
  const wallLeft = new T.Mesh(new T.BoxGeometry(0.3, ht, d + 0.4), wallMat(d)); wallLeft.position.set(-w / 2 - 0.15, ht / 2, 0); wallLeft.receiveShadow = true; scene.add(wallLeft);
  box(w, 0.35, 0.12, pal.trim, 0, 0, -d / 2 + 0.06, scene, { noShadow: true }); box(0.12, 0.35, d, pal.trim, -w / 2 + 0.06, 0, 0, scene, { noShadow: true });
  const hour = new Date().getHours(); const night = hour < 6 || hour >= 20; const dusk = !night && (hour < 8 || hour >= 18);
  const glowMat = new T.MeshBasicMaterial({ color: night ? 0x22345f : dusk ? 0xffb070 : pal.light });
  if (night) scene.background = new T.Color(0x05070d);
  const windowAt = (x, y, wall = 'back') => { const m = new T.Mesh(new T.BoxGeometry(1.8, 1.5, 0.1), glowMat); if (wall === 'back') m.position.set(x, y, -d / 2 + 0.08); else { m.position.set(-w / 2 + 0.08, y, x); m.rotation.y = Math.PI / 2; } scene.add(m); const fr = new T.Mesh(new T.BoxGeometry(2.0, 1.7, 0.08), mat(pal.trim)); fr.position.copy(m.position); fr.rotation.copy(m.rotation); fr.position.z += wall === 'back' ? -0.03 : 0; scene.add(fr); };
  for (let i = -1; i <= 1; i += 2) windowAt((w / 4) * i, 1.9);
  windowAt(0, 1.9, 'left');
  if (era === 5) { const strip = new T.Mesh(new T.BoxGeometry(w, 0.08, 0.08), new T.MeshBasicMaterial({ color: pal.accent })); strip.position.set(0, ht - 0.2, -d / 2 + 0.1); scene.add(strip); }

  // ---- Licht
  scene.add(new T.HemisphereLight(0xffffff, 0x554433, night ? 0.32 : 0.75));
  const sun = new T.DirectionalLight(night ? 0x8fa8ff : pal.light, night ? 0.35 : dusk ? 0.8 : 1.15); sun.position.set(w * 0.4, 9, d * 0.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -w; sc.right = w; sc.top = d; sc.bottom = -d; sc.near = 1; sc.far = 30; scene.add(sun);
  const lamp = new T.PointLight(pal.light, night ? 34 : 18, 18); lamp.position.set(0, ht - 0.5, 0); scene.add(lamp);

  // ---- Hotspot-Registrierung
  const spot = (obj, id, label, actions, hint) => { hot.push({ obj, id, label, hint: hint || '', actions }); return obj; };
  const taskAct = (key) => () => {
    const t = (b.tasks || []).find((x) => x.id === key); if (!t) return [];
    return [{ kind: 'task', task: t }];
  };
  const goAct = (label, route, sub, tab) => () => [{ label, sub, run: ({ go }) => go(route, tab) }];

  // ---- Möbel
  const bed = (x, z, rot, small = false, col = pal.accent) => { const g = group(x, z, rot); const s = small ? 0.7 : 1; box(2.2 * s, 0.5, 1.4 * s + 0.4, 0x6b4a2a, 0, 0, 0, g); box(2.0 * s, 0.35, 1.3 * s + 0.3, 0xf2efe6, 0, 0.5, 0, g); box(0.5, 0.2, 0.9 * s + 0.2, 0xffffff, -0.7 * s, 0.85, 0, g); box(1.2 * s, 0.1, 1.3 * s + 0.3, col, 0.4 * s, 0.85, 0, g); box(0.15, 1.1, 1.4 * s + 0.4, 0x5a3d22, -1.1 * s, 0, 0, g); return g; };
  const table = (x, z, tw = 2.4, td = 1.4, chairs = 4, col = 0x8a5c33) => { const g = group(x, z); box(tw, 0.12, td, col, 0, 1.0, 0, g); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => box(0.12, 1.0, 0.12, 0x5a3d22, a * (tw / 2 - 0.15), 0, c * (td / 2 - 0.15), g)); for (let i = 0; i < chairs; i++) { const side = i % 2 ? 1 : -1; const cx = ((Math.floor(i / 2) - 0.5) * tw) / 1.2; box(0.6, 0.12, 0.6, 0x6a4526, cx, 0.6, side * (td / 2 + 0.5), g); box(0.6, 0.7, 0.1, 0x6a4526, cx, 0.7, side * (td / 2 + 0.78), g); } return g; };
  const fridge = (x, z) => { const g = group(x, z); box(1.1, 2.3, 1.0, 0xf3f5f6, 0, 0, 0, g); box(0.06, 0.8, 0.06, 0x888888, 0.4, 1.0, 0.53, g); box(1.1, 0.04, 0.02, 0xcccccc, 0, 1.45, 0.51, g); return g; };
  const sofa = (x, z, rot = 0, col = pal.accent) => { const g = group(x, z, rot); box(2.8, 0.5, 1.1, col, 0, 0, 0, g); box(2.8, 0.9, 0.3, col, 0, 0.4, -0.5, g); box(0.3, 0.8, 1.1, col, -1.4, 0, 0, g); box(0.3, 0.8, 1.1, col, 1.4, 0, 0, g); return g; };
  const shelf = (x, z, rot = 0, rowsN = 4) => { const g = group(x, z, rot); box(2.2, 2.6, 0.5, 0x6a4526, 0, 0, 0, g); const cols = [0xa2300f, 0x2f5f8a, 0x4a7a3a, 0xc9a23f, 0x6a4a8a]; for (let r = 0; r < rowsN; r++) for (let i = 0; i < 9; i++) box(0.17, 0.4 + (i % 3) * 0.08, 0.32, cols[(i + r) % cols.length], -0.95 + i * 0.235, 0.15 + r * 0.62, 0.05, g, { noShadow: true }); return g; };
  const wardrobe = (x, z, rot = 0) => { const g = group(x, z, rot); box(1.8, 2.6, 0.8, 0x7a5535, 0, 0, 0, g); box(0.04, 2.2, 0.02, 0x3a2412, 0, 0.2, 0.41, g); box(0.1, 0.3, 0.04, 0xd8c070, -0.2, 1.2, 0.43, g); box(0.1, 0.3, 0.04, 0xd8c070, 0.2, 1.2, 0.43, g); return g; };
  const counter = (x, z, len = 4, rot = 0, col = 0x7a5535, top = 0xd8d2c0) => { const g = group(x, z, rot); box(len, 1.1, 0.9, col, 0, 0, 0, g); box(len + 0.2, 0.1, 1.1, top, 0, 1.1, 0, g); return g; };
  const desk = (x, z, rot = 0) => { const g = group(x, z, rot); box(2.0, 0.1, 1.0, 0x7a5535, 0, 1.0, 0, g); box(0.1, 1.0, 0.9, 0x5a3d22, -0.9, 0, 0, g); box(0.1, 1.0, 0.9, 0x5a3d22, 0.9, 0, 0, g); box(0.6, 0.02, 0.45, 0xffffff, -0.4, 1.1, 0.1, g); box(0.5, 0.02, 0.35, 0xe8e0c8, 0.4, 1.1, -0.1, g); if (era >= 3) { box(0.7, 0.45, 0.06, 0x222222, 0.3, 1.1, -0.25, g); box(0.2, 0.05, 0.2, 0x222222, 0.3, 1.1, -0.2, g); } box(0.7, 0.1, 0.6, 0x4a3a2a, 0, 0.55, 1.0, g); box(0.7, 0.8, 0.1, 0x4a3a2a, 0, 0.6, 1.3, g); return g; };
  const plant = (x, z) => { const g = group(x, z); cyl(0.3, 0.25, 0.5, 0xb4623a, 0, 0, 0, g); sph(0.55, 0x3f7a35, 0, 1.0, 0, g); sph(0.4, 0x4f8f40, 0.25, 1.4, 0.1, g); return g; };
  const person = (x, z, col = 0x3a5a8a, rot = 0, skin = 0xe0b896) => { const g = group(x, z, rot); cyl(0.28, 0.32, 1.1, col, 0, 0.0, 0, g); sph(0.26, skin, 0, 1.38, 0, g); box(0.5, 0.12, 0.3, 0x2a2a2a, 0, 0, 0.06, g, { noShadow: true }); return g; };
  const crate = (x, z, col = 0xb58a4f) => { const g = group(x, z, Math.random() * 0.5); box(0.9, 0.7, 0.9, col, 0, 0, 0, g); box(0.95, 0.08, 0.95, 0x8a6a3a, 0, 0.35, 0, g); return g; };
  const barrel = (x, z) => { const g = group(x, z); cyl(0.4, 0.4, 0.9, 0x8a5a2f, 0, 0, 0, g); cyl(0.42, 0.42, 0.06, 0x333333, 0, 0.2, 0, g); cyl(0.42, 0.42, 0.06, 0x333333, 0, 0.65, 0, g); return g; };
  const frame = (x, y, z, wall, c = 0xd8b46a, size = [0.9, 1.1]) => { const g = new T.Group(); box(size[0], size[1], 0.08, c, 0, 0, 0, g); box(size[0] - 0.16, size[1] - 0.16, 0.1, 0xe9dec8, 0, 0.08, 0, g); if (wall === 'back') g.position.set(x, y, -d / 2 + 0.1); else { g.position.set(-w / 2 + 0.1, y, z); g.rotation.y = Math.PI / 2; } props.add(g); return g; };
  const chandelier = (x, z) => { const g = group(x, z); const ring = part(new T.TorusGeometry(0.9, 0.06, 8, 24), 0xd8b46a, 0, ht - 0.7, 0, g, { rot: [Math.PI / 2, 0, 0], noShadow: true }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; sph(0.09, 0xfff2c4, Math.cos(a) * 0.9, ht - 0.75, Math.sin(a) * 0.9, g, { m: new T.MeshBasicMaterial({ color: 0xfff2c4 }), noShadow: true }); } cyl(0.03, 0.03, 0.7, 0xd8b46a, 0, ht - 0.7, 0, g, { noShadow: true }); return g; };
  const anyTasks = () => (b.tasks || []).some((t) => t.ready);

  // =====================  Raumtypen  =====================
  const staffFigs = (n, area, cols = [0x3a5a8a, 0x8a3a3a, 0x3a7a5a, 0x7a5a2a]) => { for (let i = 0; i < Math.min(n, 8); i++) person(area[0] + (i % 4) * 1.4 - 2, area[1] + Math.floor(i / 4) * 1.6, cols[i % cols.length], Math.PI * 0.1 * i); };
  const t = b.type;
  if (t === 'home' || (t === 'pension')) {
    const big = t === 'home';
    const bd = bed(w / 2 - 2, -d / 2 + 1.2, 0); spot(bd, 'bed', 'Bett', taskAct('rest'), 'Ausruhen');
    wardrobe(w / 2 - 4.2, -d / 2 + 0.6); plant(w / 2 - 0.8, d / 2 - 1);
    if (big) {
      const fr = fridge(-w / 2 + 0.9, -d / 2 + 0.9); spot(fr, 'fridge', 'Kühlschrank', () => [{ kind: 'food' }], 'Lebensmittel');
      const st = group(-w / 2 + 2.3, -d / 2 + 0.8); box(1.4, 1.0, 0.9, 0x555555, 0, 0, 0, st); cyl(0.2, 0.2, 0.05, 0x222222, -0.3, 1.0, 0, st, { noShadow: true }); cyl(0.2, 0.2, 0.05, 0x222222, 0.3, 1.0, 0, st, { noShadow: true }); spot(st, 'stove', 'Herd – Kochen', taskAct('cook'), 'Aufgabe: Kochen'); table(-1.0, 0.5, 2.6, 1.5, 4);
      sofa(w / 4, d / 2 - 1.5, Math.PI, pal.accent);
      const sh = shelf(0.5, -d / 2 + 0.4); spot(sh, 'shelf', 'Bücherregal – Familienchronik', goAct('Familienchronik öffnen', 'legacy', 'Stammbaum, Chronik und frühere Leben'));
      const ds = desk(-w / 2 + 1.6, d / 4, Math.PI / 2); spot(ds, 'desk', 'Schreibtisch – Finanzen', goAct('Finanzen ansehen', 'overview', 'Einnahmen, Ausgaben und Vermögen'));
      const bro = group(w / 2 - 0.7, d / 2 - 2.6); cyl(0.03, 0.03, 1.5, 0x8a6a3a, 0, 0, 0, bro, { rot: [0, 0, 0.2] }); box(0.4, 0.12, 0.2, 0xc9a23f, 0.2, 0, 0, bro); spot(bro, 'tidy', 'Besen', taskAct('tidy'), 'Aufräumen');
      const mb = group(-w / 2 + 0.5, d / 2 - 0.6); box(0.5, 0.6, 0.3, 0xc9a23f, 0, 0.6, 0, mb); box(0.06, 0.6, 0.06, 0x555555, 0, 0, 0, mb); spot(mb, 'mail', 'Briefkasten – Post', goAct('Postfach öffnen', 'overview', 'Meldungen und Nachrichten'));
      const kids = Math.min(6, v.children.filter((c) => c.status === 'home').length);
      for (let i = 0; i < kids; i++) bed(-w / 2 + 1.6 + (i % 3) * 1.8, -d / 2 + 3.6 + Math.floor(i / 3) * 2.2, Math.PI / 2, true, 0x4a7a9a + i * 3000);
      if (v.partner && v.partner.cohabit) { person(0.2, 0.2, 0xb04a6a, 0.4); const ph = frame(-w / 4, 2.1, 0, 'back'); spot(ph, 'family', 'Familienfoto', goAct('Familie ansehen', 'family', 'Partner und Kinder')); }
      else { const ph = frame(-w / 4, 2.1, 0, 'back', 0x888888); spot(ph, 'family', 'Leerer Bilderrahmen', goAct('Familie ansehen', 'family', 'Partner und Kinder')); }
      const ep = group(w / 2 - 1.6, d / 4 + 0.5, -Math.PI / 2);
      if (era === 1) { box(1.6, 0.9, 0.7, 0x6a4526, 0, 0, 0, ep); box(0.9, 0.55, 0.45, 0x4a3320, 0, 0.9, 0, ep); cyl(0.17, 0.17, 0.05, 0xd8c070, -0.2, 1.15, 0.24, ep, { rot: [Math.PI / 2, 0, 0], noShadow: true }); cyl(0.07, 0.07, 0.05, 0xd8c070, 0.25, 1.15, 0.24, ep, { rot: [Math.PI / 2, 0, 0], noShadow: true }); }
      else if (era === 2) { box(1.6, 0.8, 0.8, 0x6a4526, 0, 0, 0, ep); box(1.1, 0.8, 0.7, 0x3a2d22, 0, 0.8, 0, ep); box(0.8, 0.6, 0.05, 0x7aa0a8, 0, 0.9, 0.36, ep, { noShadow: true }); cyl(0.02, 0.02, 0.8, 0x999999, 0.3, 1.6, 0, ep, { rot: [0, 0, 0.5] }); }
      else if (era === 3) { box(1.6, 0.8, 0.8, 0x555555, 0, 0, 0, ep); box(0.9, 0.8, 0.8, 0xd8d0b8, -0.3, 0.8, 0, ep); box(0.7, 0.55, 0.05, 0x223344, -0.3, 0.9, 0.42, ep, { noShadow: true }); box(0.9, 0.08, 0.35, 0xd8d0b8, -0.3, 0.75, 0.65, ep); }
      else if (era === 4) { box(2.0, 0.6, 0.7, 0x333333, 0, 0, 0, ep); box(1.5, 0.85, 0.06, 0x111111, 0, 0.9, 0, ep); box(1.4, 0.75, 0.02, 0x2a6aa8, 0, 0.95, 0.04, ep, { m: new T.MeshBasicMaterial({ color: 0x2a6aa8 }), noShadow: true }); }
      else { box(2.0, 0.5, 0.7, 0x2a3a44, 0, 0, 0, ep); box(1.6, 0.9, 0.02, 0x35e0d0, 0, 1.0, 0.05, ep, { m: new T.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.45 }), noShadow: true }); sph(0.25, 0xcfd8dc, 1.2, 1.5, 0.4, ep, { noShadow: true }); }
      spot(ep, 'leisure', era === 1 ? 'Radio' : era >= 4 ? 'Bildschirm' : 'Fernseher', taskAct('leisure'), 'Entspannen');
      if (b.villa || rooms >= 12) { chandelier(0, 0); sofa(-w / 4, d / 2 - 1.5, Math.PI, 0x3a4a6a); plant(-w / 2 + 0.8, d / 2 - 1); }
      if (v.butler) person(w / 2 - 3, d / 4, 0x222222, -0.6);
    } else {
      const tb = table(-1, 0.8, 1.6, 1.0, 2); const rz = counter(-w / 2 + 2.2, d / 2 - 1.2, 2.6, Math.PI, 0x6a4526); spot(rz, 'reception', 'Rezeption – Zimmer & Wohnungsmarkt', goAct('Wohnungsmarkt ansehen', 'newspaper', 'Pensionen, Mieten und Käufe', 'housing'));
      box(0.9, 0.9, 0.5, 0xe9e4d6, -w / 2 + 0.7, 0, 0.5); frame(-w / 4, 2.1, 0, 'back', 0x8a6a3a);
    }
  } else if (t === 'rathaus') {
    box(w - 3, 0.2, 5.5, 0x8a2a2a, 0, 0, -d / 4 + 0.6, props, { noShadow: true });
    const c1 = counter(-w / 4, -d / 4, 5.2, 0, 0x6a5a4a, 0xe8e0cc); spot(c1, 'amt', 'Bürgeramt', () => taskAct('forms')().concat(taskAct('queue')()), 'Aufgaben: Akten & Besucher');
    person(-w / 4 - 1.2, -d / 4 - 1.0, 0x555a6a); person(-w / 4 + 1.0, -d / 4 - 1.0, 0x6a5555);
    const pod = group(w / 4, -d / 4 + 0.4); box(1.2, 1.3, 0.8, 0x6a4526, 0, 0, 0, pod); box(1.4, 0.1, 1.0, 0xa2300f, 0, 1.3, 0, pod); spot(pod, 'wahl', 'Rednerpult – Wahlbüro', goAct('Zum Wahlbüro (Ämter & Wahlen)', 'society', 'Kandidieren und Einfluss'));
    for (let i = -1; i <= 1; i++) { const f = group(w / 4 + i * 1.4, -d / 2 + 0.7); cyl(0.04, 0.04, 2.8, 0x888888, 0, 0, 0, f); box(0.9, 0.55, 0.04, [0x111111, 0xcc2222, 0xe6b800][i + 1], 0.45, 2.1, 0, f, { noShadow: true }); }
    const mp = frame(-w / 4, 1.7, 0, 'back', 0x6a4526, [3.2, 1.9]); spot(mp, 'plan', 'Stadtplan – Umzug', goAct('Karte öffnen (Umzug)', 'map', 'Umziehen und Heimatstädte'));
    for (let r = 0; r < 3; r++) for (let i = -2; i <= 2; i++) box(0.9, 0.5, 0.5, 0x6a4526, i * 1.5, 0, 1.2 + r * 1.3);
    chandelier(0, 1); plant(-w / 2 + 0.9, d / 2 - 1); plant(w / 2 - 0.9, d / 2 - 1);
  } else if (t === 'bahnhof') {
    box(w, 0.1, 3.6, 0x555a60, 0, 0, d / 2 - 1.8, props, { noShadow: true });
    for (let i = 0; i < 2; i++) box(w, 0.08, 0.1, 0x9a9a9a, 0, 0.1, d / 2 - 0.9 - i * 1.4, props, { noShadow: true });
    const tr = group(0, d / 2 - 0.2); box(9, 2.3, 1.7, 0x2f5f8a, 0, 0.3, 0, tr); for (let i = -3; i <= 3; i++) box(0.9, 0.7, 0.05, 0xffe9a8, i * 1.2, 1.4, -0.88, tr, { noShadow: true }); spot(tr, 'train', 'Zug – Reisen', goAct('Umziehen (Karte)', 'map', 'Reiseziel wählen'));
    const tk = counter(-w / 4, -d / 4, 3.2, 0, 0x6a4526); spot(tk, 'ticket', 'Fahrkartenschalter', goAct('Fahrkarte kaufen (Umzug)', 'map', 'Entfernung bestimmt den Preis')); person(-w / 4, -d / 4 - 0.9, 0x555a6a);
    const clk = new T.Group(); cyl(0.7, 0.7, 0.15, 0xf3efe2, 0, 0, 0, clk, { rot: [Math.PI / 2, 0, 0] }); clk.position.set(w / 4, 2.6, -d / 2 + 0.2); props.add(clk);
    for (let i = 0; i < 3; i++) box(1.8, 0.45, 0.6, 0x7a5a35, -2 + i * 2.6, 0, 0.2); plant(w / 2 - 0.9, -d / 2 + 1);
  } else if (t === 'markt') {
    const stalls = [[-4.2, -2.6, 0xc43a2a, 'Obst & Gemüse'], [-0.4, -2.6, 0x3a7a4a, 'Gemüse'], [3.4, -2.6, 0xe6b800, 'Brot & Käse'], [-2.4, 1.4, 0x2f5f8a, 'Fleisch & Fisch']];
    stalls.forEach(([x, z, col, label], i) => { const g = group(x, z); box(2.8, 1.0, 1.1, 0x7a5535, 0, 0, 0, g); for (let k = 0; k < 6; k++) sph(0.2, [0xe0402a, 0x6ab04a, 0xe6b800][k % 3], -1 + k * 0.4, 1.2, 0.0, g, { noShadow: true }); box(3.0, 0.1, 1.6, col, 0, 2.6, 0.15, g, { rot: [0.25, 0, 0] }); [-1.3, 1.3].forEach((px) => box(0.08, 2.6, 0.08, 0x555555, px, 0, 0.6, g)); person(0, -0.9, [0x8a3a3a, 0x3a7a5a, 0x3a5a8a, 0x7a5a2a][i], Math.PI); if (i < 3) spot(g, `stall${i}`, label, () => [{ kind: 'food' }].concat(i === 0 ? taskAct('sell')() : []), i === 0 ? 'Einkaufen & verkaufen' : 'Lebensmittel kaufen'); else spot(g, 'sort', 'Marktmeister', taskAct('sort'), 'Aufgabe: Waren sortieren'); });
    for (let i = 0; i < 6; i++) crate(w / 2 - 1.5 + (i % 2) * 0.1, d / 2 - 1.2 - i * 0.9); barrel(-w / 2 + 1, d / 2 - 1.2); barrel(-w / 2 + 2, d / 2 - 1);
  } else if (t === 'arzt') {
    const ex = group(w / 4, -d / 4); box(2.4, 0.6, 1.1, 0xe8edf0, 0, 0, 0, ex); box(2.4, 0.15, 1.1, 0x4a8a9a, 0, 0.6, 0, ex); person(0.8, 0.9, 0xffffff, Math.PI, 0xe0b896); spot(ex, 'exam', 'Untersuchungsliege', taskAct('check'), 'Vorsorge-Untersuchung');
    const cab = group(-w / 4, -d / 2 + 0.7); box(2.4, 2.4, 0.6, 0xdfe6e8, 0, 0, 0, cab); box(0.2, 0.2, 0.05, 0xd33, 0, 1.6, 0.33, cab, { noShadow: true }); spot(cab, 'cabinet', 'Medikamentenschrank', () => (v.cards.available ? [{ label: `Gesundheitskarte kaufen (${(v.cards.price / 100).toFixed(0)} ${v.currency === 'EUR' ? '€' : 'DM'})`, sub: `Du hast ${v.cards.health}`, run: ({ act }) => act('buyCards', { pay: 'money', count: 1 }) }, { label: 'Gesundheitskarte einsetzen', sub: '+10 Lebenstage, +15 Gesundheit', disabled: v.cards.health < 1, run: ({ act }) => act('useCard', {}) }] : [{ label: 'Hier gibt es noch keine Gesundheitskarten', sub: 'Erst ab etwa 1960', disabled: true }]));
    desk(-w / 4 + 1, 1.4, Math.PI); person(-w / 4 + 1, 2.4, 0xffffff, 0); plant(w / 2 - 0.8, d / 2 - 1); box(0.6, 1.8, 0.5, 0xdddddd, -w / 2 + 0.7, 0, 1.5);
  } else if (t === 'schule') {
    const bb = group(0, -d / 2 + 0.3); box(5.2, 2.0, 0.15, 0x233d2f, 0, 0.8, 0, bb); box(5.4, 0.12, 0.2, 0x7a5535, 0, 0.75, 0.05, bb); spot(bb, 'board', 'Tafel – Hausaufgabenhilfe', taskAct('help'), 'Aufgabe für deine Kinder');
    for (let r = 0; r < 3; r++) for (let i = -2; i <= 2; i++) { const g = group(i * 1.9, -0.6 + r * 1.9); box(1.2, 0.08, 0.7, 0xb58a4f, 0, 0.9, 0, g); box(0.08, 0.9, 0.5, 0x555555, -0.5, 0, 0, g); box(0.08, 0.9, 0.5, 0x555555, 0.5, 0, 0, g); box(0.5, 0.08, 0.5, 0x7a5a35, 0, 0.5, 0.8, g); }
    const gl = group(w / 2 - 1.2, -d / 2 + 1.2); sph(0.5, 0x3a7aa8, 0, 1.6, 0, gl); cyl(0.05, 0.2, 1.0, 0x7a5535, 0, 0, 0, gl); desk(w / 4, -d / 2 + 2.2, Math.PI);
    const ks = v.children.filter((c) => c.status === 'home' && c.age >= 6 && c.age < 18); ks.slice(0, 6).forEach((c, i) => person(-2.8 + i * 1.9, 0.9 + (i % 2) * 1.9, [0x4a7a9a, 0xb06a8a, 0x6a9a4a][i % 3], 0, 0xe8c4a0));
  } else if (t === 'zeitung') {
    const pr = group(w / 4, -d / 4); box(3.4, 1.8, 1.6, 0x3a4a5a, 0, 0, 0, pr); cyl(0.5, 0.5, 2.2, 0x777f88, -1.2, 1.8, 0, pr, { rot: [0, 0, Math.PI / 2] }); cyl(0.5, 0.5, 2.2, 0x777f88, 1.0, 1.8, 0, pr, { rot: [0, 0, Math.PI / 2] }); for (let i = 0; i < 4; i++) box(1.2, 0.05, 0.8, 0xf2efe6, -0.4 + i * 0.1, 0.8 + i * 0.1, 1.1 + i * 0.12, pr, { noShadow: true }); spot(pr, 'press', 'Druckerpresse – Zeitung lesen', goAct(v.date.medium === 'web' ? 'Das Netz öffnen' : 'Die Zeitung lesen', 'newspaper', 'Stellen, Wohnungen, Nachrichten'));
    const ed = desk(-w / 4, -d / 4 + 0.4); spot(ed, 'proof', 'Redaktionstisch – Korrektur lesen', taskAct('proof'), 'Aufgabe: Fehler finden'); person(-w / 4, -d / 4 + 1.5, 0x6a5a4a, Math.PI);
    desk(-w / 4, d / 4, 0); for (let i = 0; i < 5; i++) box(0.9, 0.12 * (i + 2), 0.7, 0xf2efe6, -w / 2 + 1.2 + i * 1.1, 0, d / 2 - 1.2);
  } else if (t === 'lotto') {
    const c = counter(0, -d / 4, 3.6, 0, 0x7a5535, 0xe6b43d); box(0.9, 0.8, 0.6, 0x333333, 0.6, 1.2, 0, c); spot(c, 'counter', 'Annahmestelle – Lotto spielen', () => [{ label: '1 Tipp', sub: `${(v.gambling.ticket / 100).toFixed(2).replace('.', ',')} ${v.currency === 'EUR' ? '€' : 'DM'}`, run: ({ act }) => act('lotto', { tickets: 1 }) }, { label: '5 Tipps', run: ({ act }) => act('lotto', { tickets: 5 }) }, { label: 'Zur Gesellschaft-Seite', run: ({ go }) => go('society') }]);
    person(0, -d / 4 - 1.0, 0xc4a23a); const bd2 = frame(0, 1.7, 0, 'back', 0x333333, [3.4, 1.4]); frame(-w / 4, 1.6, 0, 'back', 0xe6b43d, [1.0, 1.4]);
  } else if (t === 'spielbank') {
    const rt = group(0, 0); cyl(2.0, 2.0, 0.9, 0x1d6a3a, 0, 0, 0, rt); const whl = part(new T.TorusGeometry(0.9, 0.18, 10, 28), 0xd8b46a, 0, 1.0, 0, rt, { rot: [Math.PI / 2, 0, 0] }); sph(0.12, 0xffffff, 0.5, 1.2, 0.2, rt); spot(rt, 'roulette', 'Roulette-Tisch', () => (v.gambling.casino ? [{ label: 'Einsatz: 5 Tipps-Preise auf Rot', sub: 'Gewinnchance 48,6 %', run: ({ act }) => act('casino', { bet: Math.max(100, v.gambling.ticket * 5) }) }, { label: 'Zur Gesellschaft-Seite (freier Einsatz)', run: ({ go }) => go('society') }] : [{ label: 'Kein Zutritt', sub: `Ab ${v.gambling.minAge} Jahren`, disabled: true }]));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; person(Math.cos(a) * 3.1, Math.sin(a) * 2.6, [0x222233, 0x5a2a4a, 0x2a4a5a, 0x4a3a2a][i], a + Math.PI / 2); }
    for (let i = 0; i < 3; i++) { const m = group(-w / 2 + 1.2, -d / 2 + 1.5 + i * 1.8); box(1.0, 1.9, 0.9, 0x5a2f8a, 0, 0, 0, m); box(0.7, 0.5, 0.05, 0xffd54a, 0, 1.2, 0.48, m, { noShadow: true }); }
    chandelier(0, 0); chandelier(-4, 2); chandelier(4, 2);
  } else if (t === 'biz') {
    const live = () => v.companies.find((x) => x.id === b.ref); const c = live(); const chain = b.pkey;
    const accent = { wirt: 0x8a3a2a, baecker: 0xc9944a, tischler: 0x8a6a3a, schmied: 0x4a4a52, landwirt: 0x5a7a3a }[chain] || pal.accent;
    const cashAct = () => { const c = live(); return (c ? [{ label: 'Firmenkasse leeren', sub: `${(c.cash / 100).toFixed(2).replace('.', ',')} ${v.currency === 'EUR' ? '€' : 'DM'} liegen bereit`, disabled: c.cash <= 0, run: ({ act }) => act('bizCollect', { id: c.id }) }] : []); };
    const cnt = counter(-w / 4, -d / 2 + 1.6, 4.4, 0, accent); spot(cnt, 'cash', 'Theke & Kasse', () => cashAct().concat(taskAct('serve')(), taskAct('orders')()), 'Kasse, Betreuung, Aufträge');
    if (chain === 'wirt') { for (let i = 0; i < 3; i++) cyl(0.07, 0.07, 0.5, 0xc9c9c9, -w / 4 - 1 + i * 0.7, 1.2, -d / 2 + 1.6, props, { noShadow: true }); for (let i = 0; i < 6; i++) cyl(0.12, 0.1, 0.3, 0xe6b800, -w / 4 - 1.6 + i * 0.6, 1.2, -d / 2 + 1.9, props, { noShadow: true }); }
    else if (chain === 'baecker') { box(2.2, 1.6, 1.2, 0x8a4a3a, w / 4, 0, -d / 2 + 1.0); box(1.2, 0.6, 0.1, 0x222222, w / 4, 0.4, -d / 2 + 1.62, props, { noShadow: true }); for (let i = 0; i < 4; i++) { box(2.4, 0.08, 0.6, 0x7a5535, -w / 2 + 1.5, 0.5 + i * 0.6, -d / 2 + 0.5); for (let k = 0; k < 4; k++) sph(0.2, 0xd8a050, -w / 2 + 0.8 + k * 0.5, 0.7 + i * 0.6, -d / 2 + 0.5, props, { noShadow: true }); } }
    else if (chain === 'tischler') { box(3.2, 0.9, 1.2, 0x9a7a4a, w / 4, 0, -d / 2 + 1.2); for (let i = 0; i < 5; i++) box(0.12, 0.1, 2.6, 0xc9a56a, -w / 2 + 1 + i * 0.2, 0.1 + i * 0.12, -d / 2 + 2); }
    else if (chain === 'schmied') { box(1.6, 0.9, 1.0, 0x333333, w / 4, 0, -d / 2 + 1.0); cyl(0.7, 0.9, 0.5, 0x6a2a1a, w / 4 + 2.4, 0, -d / 2 + 1.0); sph(0.3, 0xff7a2a, w / 4 + 2.4, 0.7, -d / 2 + 1.0, props, { m: new T.MeshBasicMaterial({ color: 0xff7a2a }), noShadow: true }); }
    else { box(2.4, 1.4, 1.2, 0x666c74, w / 4, 0, -d / 2 + 1.0); box(1.0, 1.0, 0.8, accent, w / 4 + 2.2, 0, -d / 2 + 1.0); }
    const nT = Math.min(8, 2 + Math.floor(rooms / 2));
    const tablesG = []; for (let i = 0; i < nT; i++) tablesG.push(table(-w / 2 + 2.2 + (i % 4) * 2.6, 0.6 + Math.floor(i / 4) * 2.8, 1.6, 1.0, 2, accent));
    spot(tablesG[0], 'tables', chain === 'wirt' ? 'Gästetische – bedienen' : 'Arbeitsfläche – anpacken', taskAct('serve'), 'Aufgabe: Betrieb betreuen');
    const off = desk(w / 2 - 1.6, d / 2 - 1.6, Math.PI * 0.8); spot(off, 'office', 'Büro – Unternehmen verwalten', () => { const c = live(); return (c ? [{ label: 'Betrieb verwalten (Mitarbeiter, Manager, Ausbau)', run: ({ go }) => go('business') }, { label: c.owner ? 'Du arbeitest hier bereits selbst' : 'Selbst im Betrieb arbeiten', disabled: c.owner || c.abandoned, run: ({ act }) => act('bizWork', { id: c.id }) }] : []); });
    if (c) staffFigs(c.staff, [-1.5, 3.0]); if (c && (c.owner || b.own)) person(w / 4 + 1, -d / 2 + 2.6, 0x333333, 0.5);
    if (c && c.manager) person(w / 2 - 2.6, d / 2 - 2.6, 0x1a1a2a, -2.2);
    if ((b.tier || 0) >= 1) { chandelier(0, 0); plant(-w / 2 + 0.8, d / 2 - 1); }
    if (b.abandoned) { box(w, 0.4, 0.1, 0x6b5a3a, 0, 1.0, d / 2 - 0.5, props, { rot: [0, 0, 0.1] }); }
  } else if (t === 'work') {
    const bench = counter(w / 4 - 1, -d / 4, 3.6, 0, 0x6a5a4a, 0x9a8a70); const bc = (b.pkey && ctx.world.professions.find((p) => p.key === b.pkey)) || {};
    spot(bench, 'bench', 'Werkbank – Aufgaben', () => taskAct('shift')().concat(taskAct('tools')()), 'Zusatzschicht & Werkzeug');
    person(w / 4 - 1, -d / 4 - 1.0, 0x4a6a8a); box(1.4, 1.6, 1.0, 0x666c74, -w / 4, 0, -d / 2 + 1.0); box(0.9, 0.9, 0.9, 0xb58a4f, -w / 4 + 2.0, 0, -d / 2 + 1.0); crate(-w / 2 + 1.2, 1.4); crate(-w / 2 + 1.2, 2.4);
    const bo = desk(w / 2 - 1.6, d / 2 - 1.6, Math.PI * 0.8); spot(bo, 'boss', 'Büro des Arbeitgebers – Beruf', goAct('Beruf & Bildung ansehen', 'work', 'Stufe, Lohn, Ausbildung')); person(w / 2 - 2.6, d / 2 - 2.6, 0x2a2a3a, -2.2);
    if (b.lodging) { const bd3 = bed(-w / 2 + 2, d / 2 - 1.8, Math.PI / 2, true, 0x6a6a7a); spot(bd3, 'cot', 'Schlafstelle', () => [{ label: 'Hier schlafen (Schlafplatz beim Arbeitgeber)', disabled: v.housing.type === 'workplace', run: ({ act }) => act('sleepAtWork', {}) }], 'Notunterkunft'); }
  }

  // ---- Spielfiguren (Spieler selbst)
  person(-0.5, d / 2 - 2.2, pal.accent, 0.3, 0xf0c8a0);

  return { scene, hotspots: hot, dims: { w, d, ht }, pal };
}

/** Marken für das Minispiel (Positionsraster im Raum) */
export function tokenSpots(dims, n, seed = 1) {
  const out = []; let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) out.push([(rnd() - 0.5) * (dims.w - 3), 0.9 + rnd() * 0.8, (rnd() - 0.2) * (dims.d - 3)]);
  return out;
}
