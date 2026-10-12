// Leben in der 3D-Stadt: Autos oder Fuhrwerke je Epoche, spazierende Passanten, Schornsteinrauch,
// Brunnen im Park, Wolken und Vögel. Alles instanziiert (wenige Zeichenaufrufe) und ohne Bilddateien.
import { createBatches, seeded } from './mesh-batch.js';

const UNIT = .1;

function carGeometry(T, era) {
  const B = createBatches(T, ['lit']);
  const modern = era >= 4;
  B.box('lit', 1.55, .38, .74, 0xffffff, 0, .18, 0); B.box('lit', era >= 3 ? .9 : .75, .36, .64, 0xe9eef2, era >= 3 ? -.1 : -.2, .56, 0);
  if (modern) B.box('lit', .5, .1, .66, 0xcfd6dc, -.1, .9, 0, { rz: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl('lit', .15, .12, 0x1c1c1e, sx * .52, 0, sz * .36, { rx: Math.PI / 2, n: 8 });
  B.box('lit', .06, .12, .14, 0xfff1b8, .78, .26, .24); B.box('lit', .06, .12, .14, 0xfff1b8, .78, .26, -.24);
  const g = B.build('lit'); B.dispose(); return g;
}
function cartGeometry(T) {
  const B = createBatches(T, ['lit']);
  B.box('lit', 1.4, .12, .8, 0x8a6038, -.2, .34, 0);
  for (const sz of [-1, 1]) B.box('lit', 1.4, .26, .06, 0x6b4a2c, -.2, .46, sz * .4);
  B.box('lit', 1.0, .4, .64, 0xd8b25a, -.35, .46, 0, { sy: 1 });
  for (const sz of [-1, 1]) B.cyl('lit', .33, .08, 0x5a3d22, -.35, .0, sz * .46, { rx: Math.PI / 2, n: 10 });
  B.box('lit', .9, .42, .38, 0x6b4a2e, 1.15, .45, 0); B.box('lit', .34, .46, .24, 0x6b4a2e, 1.65, .72, 0, { rz: -.5 }); B.box('lit', .3, .22, .2, 0x5a3d22, 1.9, .86, 0);
  for (const sx of [0.8, 1.45]) for (const sz of [-.12, .12]) B.box('lit', .1, .45, .1, 0x4a3320, sx, 0, sz);
  B.box('lit', 1.0, .05, .05, 0x5a3d22, .55, .5, .0);
  const g = B.build('lit'); B.dispose(); return g;
}
function personGeometry(T) {
  const B = createBatches(T, ['lit']);
  B.box('lit', .13, .38, .13, 0x2c2f33, -.09, 0, 0); B.box('lit', .13, .38, .13, 0x2c2f33, .09, 0, 0);
  B.box('lit', .42, .5, .24, 0xffffff, 0, .38, 0);
  B.box('lit', .1, .42, .1, 0xe6e6e6, -.27, .4, 0, { rz: .1 }); B.box('lit', .1, .42, .1, 0xe6e6e6, .27, .4, 0, { rz: -.1 });
  const g = B.build('lit'); B.dispose(); return g;
}

const softTexture = (T, color = '255,255,255') => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30); grad.addColorStop(0, `rgba(${color},1)`); grad.addColorStop(.5, `rgba(${color},.45)`); grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
};

/**
 * @param {object} o { aerial, toWorld, era, seed, chimneys:[Vector3-like], landmarks:[{x,z,w,d,key}], parks:[{x,z,w,d}] }
 */
export function createLife(T, scene, o) {
  const { aerial, toWorld, era } = o; const rnd = seeded(o.seed || 7);
  const dummy = new T.Object3D(); const disposables = [];
  const mainX = new Set(aerial.roads.xs.filter((_, i) => i % 3 === 1)), mainY = new Set(aerial.roads.ys.filter((_, i) => i % 3 === 1));
  const WX = 200, WZ = 125;
  const edgeFade = (x, z) => Math.max(0, Math.min(1, Math.min(WX / 2 - Math.abs(x), WZ / 2 - Math.abs(z)) / 5));

  // ---- Fahrzeuge
  const carCount = { 1: 3, 2: 8, 3: 11, 4: 13, 5: 13 }[era] ?? 10, cartCount = { 1: 9, 2: 4, 3: 1, 4: 0, 5: 0 }[era] ?? 0;
  const mats = [];
  const mk = (geo, n, tints) => {
    if (!n) return null;
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .7, metalness: .05 }); mats.push(mat);
    const mesh = new T.InstancedMesh(geo, mat, n); mesh.castShadow = true; mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) mesh.setColorAt(i, new T.Color(tints[i % tints.length]));
    scene.add(mesh); disposables.push(geo, mat); return mesh;
  };
  const carTints = era <= 2 ? [0x3a3a3c, 0x7a4a3a, 0x3d5b6b, 0xb89b6a, 0x8a2f2a] : era <= 4 ? [0xe9e9e9, 0x2d2d33, 0xb43a32, 0x3768b5, 0xf0f0f0, 0x6b8e3a] : [0xf2fbfa, 0x35e0d0, 0xdce4e8, 0x7ad8f0];
  const cars = mk(carGeometry(T, era), carCount, carTints), carts = mk(cartGeometry(T), cartCount, [0x6b4a2e, 0x8a6038, 0x5c3d26]);
  const lanes = (n, speedBase) => Array.from({ length: n }, (_, i) => {
    const horiz = i % 2 === 0, roads = horiz ? aerial.roads.ys : aerial.roads.xs; const road = roads[Math.floor(rnd() * roads.length)];
    const main = (horiz ? mainY : mainX).has(road); const lane = (rnd() < .5 ? -1 : 1) * (main ? 5.2 : 3.2);
    return { horiz, road, lane, speed: speedBase * (.7 + rnd() * .6), offset: rnd() * (horiz ? 2000 : 1250), span: horiz ? 2000 : 1250 };
  });
  const carLanes = lanes(carCount, 2.4), cartLanes = lanes(cartCount, 1.1);
  const placeVehicles = (mesh, list, t, y) => {
    if (!mesh) return;
    list.forEach((v, i) => {
      const dist = (t * .001 * v.speed * 10 + v.offset) % v.span, dir = v.lane > 0 ? -1 : 1, along = dir > 0 ? dist : v.span - dist;
      const p = v.horiz ? toWorld(along, v.road + v.lane) : toWorld(v.road + v.lane, along);
      const f = edgeFade(p.x, p.z); dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(0, v.horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2), 0); dummy.scale.setScalar(Math.max(.001, f)); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  // ---- Passanten
  const walkers = []; const pg = personGeometry(T);
  const addWalker = (a, b, speed) => walkers.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, len: Math.hypot(b.x - a.x, b.z - a.z) || 1, speed, ph: rnd() * 100 });
  for (const lm of o.landmarks) { for (let k = 0; k < 2; k++) { const z = lm.z + lm.d / 2 + .9 + k * .5, x0 = lm.x - lm.w * .4 + k * 1.5; addWalker({ x: x0, z }, { x: x0 + lm.w * (.4 + rnd() * .3), z }, .7 + rnd() * .6); } }
  const rd = o.roadWalkers ?? 26;
  for (let i = 0; i < rd; i++) {
    const horiz = rnd() < .5, roads = horiz ? aerial.roads.ys : aerial.roads.xs, road = roads[Math.floor(rnd() * roads.length)], main = (horiz ? mainY : mainX).has(road);
    const off = (rnd() < .5 ? -1 : 1) * ((main ? 1.3 : .7) + .45), c = (rnd() * .7 + .15) * (horiz ? 2000 : 1250), len = 90 + rnd() * 160;
    const A = horiz ? toWorld(c, road) : toWorld(road, c), Bp = horiz ? toWorld(c + len, road) : toWorld(road, c + len);
    if (horiz) { A.z += off; Bp.z += off; } else { A.x += off; Bp.x += off; }
    addWalker(A, Bp, .8 + rnd() * .7);
  }
  const nW = walkers.length;
  const bodyMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), headMat = new T.MeshStandardMaterial({ roughness: .75 }); mats.push(bodyMat, headMat);
  const bodies = new T.InstancedMesh(pg, bodyMat, nW), heads = new T.InstancedMesh(new T.SphereGeometry(.12, 8, 6), headMat, nW);
  const cloth = [0x3a5a8a, 0x8a3a3a, 0x3a7a5a, 0x7a5a2a, 0x6a4a8a, 0xc9a23f, 0x444a50, 0xb06a8a], skin = [0xe8c4a0, 0xd9a77f, 0xb98260, 0xf0d2b4];
  for (let i = 0; i < nW; i++) { bodies.setColorAt(i, new T.Color(cloth[Math.floor(rnd() * cloth.length)])); heads.setColorAt(i, new T.Color(skin[Math.floor(rnd() * skin.length)])); }
  bodies.castShadow = heads.castShadow = true; bodies.frustumCulled = heads.frustumCulled = false; scene.add(bodies, heads); disposables.push(pg, heads.geometry, bodyMat, headMat);
  const placeWalkers = (t) => {
    for (let i = 0; i < nW; i++) {
      const w = walkers[i], s = (t * .001 * w.speed + w.ph) % (2 * w.len), d = s < w.len ? s : 2 * w.len - s, k = d / w.len, dir = s < w.len ? 1 : -1;
      const x = w.ax + (w.bx - w.ax) * k, z = w.az + (w.bz - w.az) * k, bob = Math.abs(Math.sin(t * .008 * w.speed + w.ph * 3)) * .05, f = edgeFade(x, z);
      const ang = Math.atan2(-(w.bz - w.az) * dir, (w.bx - w.ax) * dir);
      dummy.position.set(x, bob, z); dummy.rotation.set(0, ang, 0); dummy.scale.setScalar(Math.max(.001, f)); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, bob + .93 * f, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(.001, f)); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    }
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  };

  // ---- Rauch (Points mit Alpha je Partikel)
  const chim = o.chimneys.slice(0, 26), PER = 7, N = chim.length * PER;
  let smoke = null, smokeGeo, smokeMat;
  if (N) {
    smokeGeo = new T.BufferGeometry(); smokeGeo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(N * 3), 3)); smokeGeo.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(N * 4), 4));
    smokeMat = new T.PointsMaterial({ size: 1.5, map: softTexture(T), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    smoke = new T.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; smoke.renderOrder = 4; scene.add(smoke); disposables.push(smokeGeo, smokeMat);
  }
  const updateSmoke = (t, wind) => {
    if (!smoke) return; const P = smokeGeo.attributes.position, Cc = smokeGeo.attributes.color;
    chim.forEach((c, ci) => { for (let k = 0; k < PER; k++) {
      const i = ci * PER + k, age = ((t * .00022 * (c.dark ? 1.2 : .85) + k / PER + ci * .137) % 1);
      P.setXYZ(i, c.x + wind[0] * age * 3.2 + Math.sin(t * .001 + i) * .12 * age, c.y + age * (c.dark ? 4.8 : 3.6), c.z + wind[1] * age * 3.2);
      const a = Math.sin(age * Math.PI) * (c.dark ? .62 : .42), g = c.dark ? .28 + age * .3 : .78 - age * .12; Cc.setXYZW(i, g, g, g * 1.02, a);
    } });
    P.needsUpdate = Cc.needsUpdate = true; smokeMat.size = 1.2 + 0.6 * Math.min(1, 1);
  };

  // ---- Brunnen im Park
  let fountain = null, droplets = null, dropGeo, dropMat; const DR = 36;
  const park = o.parks && o.parks[0];
  if (park) {
    const g = new T.Group(); g.position.set(park.x, 0, park.z); scene.add(g);
    const stone = new T.MeshStandardMaterial({ color: 0xbdb5a3, roughness: .9 }), water = new T.MeshStandardMaterial({ color: 0x4f8faa, roughness: .15, metalness: .2, transparent: true, opacity: .92 }), dark = new T.MeshStandardMaterial({ color: 0x7e786b, roughness: .9 }); mats.push(stone, water, dark);
    const basin = new T.Mesh(new T.CylinderGeometry(1.9, 2.0, .6, 22), stone), pool = new T.Mesh(new T.CylinderGeometry(1.7, 1.7, .05, 22), water); pool.position.y = .5;
    const col = new T.Mesh(new T.CylinderGeometry(.18, .28, 1.6, 10), dark); col.position.y = .9; const bowl = new T.Mesh(new T.CylinderGeometry(.8, .35, .22, 14), stone); bowl.position.y = 1.7;
    const ring = new T.Mesh(new T.TorusGeometry(1.95, .13, 6, 28), dark); ring.rotation.x = Math.PI / 2; ring.position.y = .62;
    basin.position.y = .3; for (const m of [basin, pool, col, bowl, ring]) { m.castShadow = true; m.receiveShadow = true; g.add(m); disposables.push(m.geometry); }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4, bench = new T.Mesh(new T.BoxGeometry(1.5, .12, .45), new T.MeshStandardMaterial({ color: 0x7a5535, roughness: .85 })); bench.position.set(Math.cos(a) * 3.6, .45, Math.sin(a) * 3.6); bench.rotation.y = -a + Math.PI / 2; bench.castShadow = true; g.add(bench); disposables.push(bench.geometry, bench.material);
      for (const s of [-.6, .6]) { const leg = new T.Mesh(new T.BoxGeometry(.1, .4, .4), dark); leg.position.set(Math.cos(a) * 3.6 + Math.cos(a + Math.PI / 2) * s, .2, Math.sin(a) * 3.6 + Math.sin(a + Math.PI / 2) * s); g.add(leg); disposables.push(leg.geometry); } }
    dropGeo = new T.BufferGeometry(); dropGeo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(DR * 3), 3)); dropGeo.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(DR * 4), 4));
    dropMat = new T.PointsMaterial({ size: .22, map: softTexture(T, '200,235,255'), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    droplets = new T.Points(dropGeo, dropMat); droplets.frustumCulled = false; g.add(droplets); disposables.push(dropGeo, dropMat);
    fountain = { park, g, pool };
  }
  const updateFountain = (t) => {
    if (!droplets) return; const P = dropGeo.attributes.position, Cc = dropGeo.attributes.color;
    for (let i = 0; i < DR; i++) { const a = (i / DR) * Math.PI * 2 + i * .7, life = ((t * .0007 + i / DR * 3.1) % 1), r = life * 1.25, y = 1.85 + 1.4 * Math.sin(life * Math.PI) - life * life * .9;
      P.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r); Cc.setXYZW(i, .8, .93, 1, .85 * Math.sin(life * Math.PI)); }
    P.needsUpdate = Cc.needsUpdate = true;
  };

  // ---- Vögel (kreisen über der Stadt)
  const birdCount = 7, birdGeo = new T.BufferGeometry(); birdGeo.setAttribute('position', new T.Float32BufferAttribute([-.5, 0, 0, 0, 0, .12, 0, 0, -.12, 0, 0, .12, .5, 0, 0, 0, 0, -.12], 3)); birdGeo.computeVertexNormals();
  const birdMat = new T.MeshBasicMaterial({ color: 0x202428, side: T.DoubleSide }); mats.push(birdMat); const birds = new T.InstancedMesh(birdGeo, birdMat, birdCount); birds.frustumCulled = false; scene.add(birds); disposables.push(birdGeo);
  const birdData = Array.from({ length: birdCount }, () => ({ r: 12 + rnd() * 40, y: 16 + rnd() * 10, sp: .00018 + rnd() * .0002, ph: rnd() * 6.28, cx: (rnd() - .5) * 60, cz: (rnd() - .5) * 30 }));
  const placeBirds = (t, visible) => {
    for (let i = 0; i < birdCount; i++) { const b = birdData[i], a = t * b.sp + b.ph; dummy.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(a * 3) * 1.2, b.cz + Math.sin(a) * b.r * .6); dummy.rotation.set(0, -a - Math.PI / 2, Math.sin(t * .012 + i) * .5); dummy.scale.setScalar(visible ? 1 : .0001); dummy.updateMatrix(); birds.setMatrixAt(i, dummy.matrix); }
    birds.instanceMatrix.needsUpdate = true;
  };

  return {
    fountain,
    update(t, atmo, season) {
      placeVehicles(cars, carLanes, t, .0); placeVehicles(carts, cartLanes, t, .0); placeWalkers(t); updateSmoke(t, [.34, .12]); updateFountain(t);
      placeBirds(t, atmo ? !atmo.isNight && season?.key !== 'winter' : true);
      if (smokeMat) smokeMat.opacity = 1;
    },
    /** Einmaliges, bewegungsloses Bild (reduzierte Bewegung) */
    still(atmo, season) { this.update(1500, atmo, season); },
    count: { cars: carCount, carts: cartCount, walkers: nW, chimneys: chim.length },
    dispose() { disposables.forEach((d) => d.dispose?.()); mats.forEach((m) => m.dispose()); },
  };
}
