// Kleine Hilfen für prozedurale 3D-Szenen: viele Primitive werden zu wenigen Meshes zusammengefasst
// (ein Zeichenaufruf je Material statt je Einzelteil). Keine Texturen, keine externen Daten.

/** Dreiecksprisma (Satteldach): Breite 1 (x), Höhe 1 (y), Tiefe/First 1 (z), Boden offen. */
export function gableGeometry(T) {
  const g = new T.BufferGeometry();
  const a = [-.5, 0, -.5], b = [.5, 0, -.5], c = [.5, 0, .5], d = [-.5, 0, .5], r0 = [0, 1, -.5], r1 = [0, 1, .5];
  const P = [a, d, r1, a, r1, r0, c, b, r0, c, r0, r1, b, a, r0, d, c, r1].flat();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

/** Halbzylinder (Tonnendach): Achse entlang x (Länge 1), Halbkreis in y/z mit Radius 1, Boden offen. */
export function vaultGeometry(T, steps = 14) {
  const g = new T.BufferGeometry(); const P = [];
  const at = (i) => { const t = (i / steps) * Math.PI; return [Math.sin(t), Math.cos(t)]; };
  for (let i = 0; i < steps; i++) {
    const [y0, z0] = at(i), [y1, z1] = at(i + 1);
    P.push(-.5, y0, z0, -.5, y1, z1, .5, y1, z1, -.5, y0, z0, .5, y1, z1, .5, y0, z0);
  }
  // Stirnflächen
  for (let i = 0; i < steps; i++) { const [y0, z0] = at(i), [y1, z1] = at(i + 1); P.push(-.5, 0, 0, -.5, y1, z1, -.5, y0, z0, .5, 0, 0, .5, y0, z0, .5, y1, z1); }
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

export function createBatches(T, layers = ['lit']) {
  const m4 = new T.Matrix4(), nm = new T.Matrix3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3(), col = new T.Color();
  const store = Object.fromEntries(layers.map((l) => [l, { pos: [], nor: [], col: [], tris: 0 }]));
  const cache = new Map();
  const shared = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
  const geos = {
    box: () => shared('box', () => new T.BoxGeometry(1, 1, 1).toNonIndexed()),
    cyl: (n = 12) => shared('cyl' + n, () => new T.CylinderGeometry(1, 1, 1, n, 1).toNonIndexed()),
    cone: (n = 8) => shared('cone' + n, () => new T.ConeGeometry(1, 1, n, 1).toNonIndexed()),
    sphere: () => shared('sph', () => new T.SphereGeometry(1, 12, 8).toNonIndexed()),
    gable: () => shared('gable', () => gableGeometry(T)),
    vault: () => shared('vault', () => vaultGeometry(T)),
    dome: () => shared('dome', () => new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()),
  };
  function add(layer, geo, color, x, y, z, o = {}) {
    const st = store[layer]; if (!st) return;
    const { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = o;
    e.set(rx, ry, rz, 'YXZ'); q.setFromEuler(e); p.set(x, y, z); s.set(sx, sy, sz);
    m4.compose(p, q, s); nm.getNormalMatrix(m4);
    col.set(color);
    const P = geo.attributes.position, N = geo.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      p.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m4); st.pos.push(p.x, p.y, p.z);
      s.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize(); st.nor.push(s.x, s.y, s.z);
      st.col.push(col.r, col.g, col.b);
    }
    st.tris += P.count / 3;
  }
  const api = {
    /** Quader, y = Unterkante */
    box: (layer, w, h, d, color, x, y, z, o = {}) => add(layer, geos.box(), color, x, y + h / 2, z, { ...o, sx: w, sy: h, sz: d }),
    /** Zylinder/Kegelstumpf (gleicher Radius), y = Unterkante */
    cyl: (layer, r, h, color, x, y, z, o = {}) => add(layer, geos.cyl(o.n), color, x, y + h / 2, z, { ...o, sx: r, sy: h, sz: o.rz2 ?? r }),
    cone: (layer, r, h, color, x, y, z, o = {}) => add(layer, geos.cone(o.n), color, x, y + h / 2, z, { ...o, sx: r, sy: h, sz: o.rz2 ?? r }),
    sphere: (layer, r, color, x, y, z, o = {}) => add(layer, geos.sphere(), color, x, y, z, { sx: r, sy: o.sy ?? r, sz: o.sz ?? r, ...o }),
    dome: (layer, r, color, x, y, z, o = {}) => add(layer, geos.dome(), color, x, y, z, { sx: r, sy: o.sy ?? r, sz: r, ...o }),
    /** Satteldach: Breite w (quer zum First), Höhe h, Länge d (entlang First) – mit ry = PI/2 liegt der First auf x. */
    gable: (layer, w, h, d, color, x, y, z, o = {}) => add(layer, geos.gable(), color, x, y, z, { ...o, sx: w, sy: h, sz: d }),
    /** Tonnendach entlang x: Länge l, Radius r, Höhe h */
    vault: (layer, l, r, h, color, x, y, z, o = {}) => add(layer, geos.vault(), color, x, y, z, { ...o, sx: l, sy: h, sz: r }),
    add,
    triangles: () => Object.values(store).reduce((n, v) => n + v.tris, 0),
    build(layer) {
      const st = store[layer]; if (!st || !st.pos.length) return null;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(st.pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(st.nor, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(st.col, 3));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    },
    dispose() { cache.forEach((g) => g.dispose()); cache.clear(); },
  };
  return api;
}

/** Kleiner deterministischer Zufall (Mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashString = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
