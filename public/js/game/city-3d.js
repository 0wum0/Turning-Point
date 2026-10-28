// 3D-Stadtansicht (Design V2). Dieselben Grundrisse, Schlüssel und Spielaktionen wie die 2D-Luftansicht.
// Lebendige Stadt: Gebäude mit eigener Silhouette je Typ, Tag/Nacht nach Spieluhr, Jahreszeit nach Spieldatum,
// Passanten, Fuhrwerke/Autos, Rauch, Brunnen. Alles prozedural, ohne Bilddateien.
import { buildLandmark } from './city-buildings.js';
import { createLife } from './city-life.js';
import { atmosphereAt, seasonAt } from './atmosphere.js';
import { seeded, gableGeometry } from './mesh-batch.js';
import { createCityWalker } from './city-walker.js';
import { createCityMinimap } from './city-minimap.js';

const UNIT = .1, WORLD_W = 200, WORLD_D = 125;
const lerpHex = (T, a, b, t) => new T.Color(a).lerp(new T.Color(b), t);

const soft = (T, stops) => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };

function houseTextures(T, seed) {
  const r = seeded(seed), W = 128, H = 128;
  const col = document.createElement('canvas'), em = document.createElement('canvas'); col.width = col.height = em.width = em.height = W;
  const g = col.getContext('2d'), e = em.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '120,105,80'},${.02 + r() * .05})`; g.fillRect(r() * W, r() * H, 3 + r() * 10, 2 + r() * 6); }
  g.fillStyle = 'rgba(80,60,40,.35)'; g.fillRect(0, H - 14, W, 14); g.fillStyle = 'rgba(80,60,40,.18)'; g.fillRect(0, 0, W, 6);
  const win = (x, y, w, h, lit) => { g.fillStyle = '#5b4a38'; g.fillRect(x - 4, y - 4, w + 8, h + 8); g.fillStyle = '#3a5560'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, y, w, h * .35); g.fillStyle = '#5b4a38'; g.fillRect(x + w / 2 - 1.5, y, 3, h); g.fillRect(x, y + h / 2 - 1.5, w, 3); if (lit) { e.fillStyle = r() < .5 ? '#ffc875' : '#ffdc9a'; e.fillRect(x, y, w, h); } };
  for (const x of [18, 82]) { win(x, 20, 28, 34, r() < .7); win(x, 68, 28, 30, r() < .55); }
  g.fillStyle = '#4a3322'; g.fillRect(55, 76, 18, 38); const mk = (c) => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: mk(col), emissive: mk(em) };
}

export async function createCity3D(host, aerial, opts) {
  const { onSelect = () => {}, onEnter = () => {}, describe = () => null, selected, reduced = () => false, getHour = () => 12, era = 1, doy = 180, cityId = 1 } = opts;
  const T = await import('/vendor/three/three.min.js');
  if (!host.isConnected) return null;
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '3D-Stadt. Ziehen zum Drehen, Mausrad zum Zoomen, Pfeiltasten drehen, W A S D verschieben, Plus und Minus zoomen. Gebäude auch über die Ortsliste auswählen.');
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); } catch (_) { throw new Error('Die 3D-Stadt ist auf diesem Gerät nicht verfügbar. Die 2D-Ansicht bleibt vollständig spielbar.'); }
  host.append(canvas);
  const coarse = matchMedia('(pointer:coarse)').matches;
  const season = seasonAt(doy), rnd = seeded(cityId * 7919 + 13);
  const scene = new T.Scene(); scene.fog = new T.FogExp2(0x9fb7c8, .0022);
  const camera = new T.PerspectiveCamera(43, 1, .2, 900), ray = new T.Raycaster(), pointer = new T.Vector2();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  const disposables = [];
  const track = (...o) => { disposables.push(...o); return o[0]; };
  const toWorld = (x, y) => new T.Vector3((x - 1000) * UNIT, 0, (y - 625) * UNIT);
  let alive = true, raf = 0, previous = 0, drag = null, focusKey = selected, textureURL, hoverKey = null, atmo = atmosphereAt(getHour(), season), lastAtmo = -1e9;

  // ---- Himmel, Sonne/Mond, Sterne, Wolken
  const skyGeo = track(new T.SphereGeometry(600, 24, 14)); const skyColors = new Float32Array(skyGeo.attributes.position.count * 3); skyGeo.setAttribute('color', new T.BufferAttribute(skyColors, 3));
  const sky = new T.Mesh(skyGeo, track(new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }))); sky.renderOrder = -10; scene.add(sky);
  const starGeo = track(new T.BufferGeometry()), starPos = []; for (let i = 0; i < 240; i++) { const a = rnd() * Math.PI * 2, e = .15 + rnd() * 1.3, r = 560; starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  starGeo.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
  const stars = new T.Points(starGeo, track(new T.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }))); stars.renderOrder = -9; scene.add(stars);
  const sunSprite = new T.Sprite(track(new T.SpriteMaterial({ map: track(soft(T, [[0, 'rgba(255,255,240,1)'], [.18, 'rgba(255,240,200,.95)'], [.4, 'rgba(255,220,160,.25)'], [1, 'rgba(255,200,120,0)']])), depthWrite: false, fog: false, transparent: true }))); sunSprite.scale.set(120, 120, 1); sunSprite.renderOrder = -8; scene.add(sunSprite);
  const cloudTex = track(soft(T, [[0, 'rgba(255,255,255,.95)'], [.5, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]));
  const clouds = Array.from({ length: 9 }, (_, i) => { const m = new T.Sprite(track(new T.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: .8 }))); m.scale.set(70 + rnd() * 70, 18 + rnd() * 10, 1); m.position.set((rnd() - .5) * 420, 70 + rnd() * 40, (rnd() - .5) * 300 - 40); m.userData.speed = 1.2 + rnd() * 1.6; m.renderOrder = -7; scene.add(m); return m; });

  // ---- Licht
  const sun = new T.DirectionalLight(0xffffff, 2); sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -118, right: 118, top: 82, bottom: -82, near: 10, far: 420 }); sun.shadow.normalBias = .14; sun.shadow.bias = -.0004; scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight(0xc4e4e7, 0x415132, 1.8); scene.add(hemi);

  // ---- Boden, Fluss, Schnee
  const ground = new T.Mesh(track(new T.PlaneGeometry(WORLD_W, WORLD_D)), track(new T.MeshStandardMaterial({ color: 0x7c9261, roughness: 1 }))); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const plinth = new T.Mesh(track(new T.BoxGeometry(WORLD_W + 1, 3, WORLD_D + 1)), track(new T.MeshStandardMaterial({ color: 0x3a3d34, roughness: .95 }))); plinth.position.y = -1.55; scene.add(plinth);
  const snowPlane = new T.Mesh(track(new T.PlaneGeometry(WORLD_W, WORLD_D)), track(new T.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 1, transparent: true, opacity: 0, depthWrite: false }))); snowPlane.rotation.x = -Math.PI / 2; snowPlane.position.y = .035; snowPlane.receiveShadow = true; snowPlane.visible = season.snow > .04; snowPlane.material.opacity = season.snow * .58; scene.add(snowPlane);
  textureURL = URL.createObjectURL(new Blob([aerial.terrain], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => { if (alive) { const tx = new T.Texture(img); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1); tx.needsUpdate = true; ground.material.map = tx; ground.material.color.copy(lerpHex(T, 0xffffff, 0xf1d6ae, season.autumn * .55).lerp(new T.Color(0xe9f0f6), season.snow * .5)); ground.material.needsUpdate = true; invalidate(); } URL.revokeObjectURL(textureURL); textureURL = null; };
  img.onerror = () => { URL.revokeObjectURL(textureURL); textureURL = null; }; img.src = textureURL;
  let river = null;
  if (aerial.river && aerial.river.length > 3) {
    const pts = aerial.river.map(([x, y]) => toWorld(x, y)), pos = [], uv = [], idx = []; const half = 3.5;
    pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l; pos.push(p.x + nx * half, .05, p.z + nz * half, p.x - nx * half, .05, p.z - nz * half); uv.push(i * .35, 0, i * .35, 1); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
    const g = track(new T.BufferGeometry()); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const cg = c.getContext('2d'); cg.clearRect(0, 0, 128, 64); const rr = seeded(5);
    for (let i = 0; i < 46; i++) { cg.strokeStyle = `rgba(255,255,255,${.12 + rr() * .3})`; cg.lineWidth = 1 + rr() * 1.4; const x = rr() * 128, y = rr() * 64; cg.beginPath(); cg.moveTo(x, y); cg.quadraticCurveTo(x + 8, y - 2, x + 18 + rr() * 10, y); cg.stroke(); }
    const tex = track(new T.CanvasTexture(c)); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.colorSpace = T.SRGBColorSpace;
    river = new T.Mesh(g, track(new T.MeshStandardMaterial({ map: tex, transparent: true, opacity: .8, roughness: .2, metalness: .1, depthWrite: false, side: T.DoubleSide, color: 0xffffff }))); river.renderOrder = 2; scene.add(river);
  }

  // ---- Häuser (instanziert): Putz mit Fenstern, Satteldächer, Schornsteine
  const structures = aerial.structures || [], transform = new T.Object3D(), houseChimneys = [];
  const hTex = houseTextures(T, cityId + 11);
  const wallMat = track(new T.MeshStandardMaterial({ map: hTex.map, emissiveMap: hTex.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: .9 }));
  const walls = new T.InstancedMesh(track(new T.BoxGeometry(1, 1, 1)), wallMat, structures.length);
  const roofGeo = track(gableGeometry(T)); const roofMat = track(new T.MeshStandardMaterial({ roughness: .78, side: T.DoubleSide }));
  const roofs = new T.InstancedMesh(roofGeo, roofMat, structures.length);
  const wallTints = era >= 4 ? [0xf2efe8, 0xe3e1da, 0xd9d4c6, 0xcfc6b0, 0xe9dcc2] : [0xefe3c4, 0xe5cf9c, 0xe3bfa4, 0xd8cdb6, 0xf0ead8, 0xcdb48a];
  const roofH = era <= 2 ? 1.25 : era <= 4 ? .85 : .35, whiteRoof = new T.Color(0xf4f8fb);
  const chimGeo = track(new T.BoxGeometry(.5, 1, .5)), chimList = [];
  structures.forEach((b, i) => {
    const p = toWorld(b.x, b.y), h = b.height * UNIT, w = b.w * UNIT, d = b.d * UNIT, r = rnd();
    transform.position.set(p.x, h / 2, p.z); transform.rotation.set(0, 0, 0); transform.scale.set(w, h, d); transform.updateMatrix(); walls.setMatrixAt(i, transform.matrix);
    walls.setColorAt(i, new T.Color(wallTints[Math.floor(r * wallTints.length * 7.3) % wallTints.length]));
    const along = w > d; transform.position.set(p.x, h, p.z); transform.rotation.set(0, along ? Math.PI / 2 : 0, 0); transform.scale.set((along ? d : w) + .35, roofH * (.85 + (r * 3 % 1) * .4), (along ? w : d) + .35); transform.updateMatrix(); roofs.setMatrixAt(i, transform.matrix);
    roofs.setColorAt(i, new T.Color(b.roof).lerp(whiteRoof, season.snow * .78));
    if (r < .42 && era <= 4) chimList.push({ x: p.x + (along ? w * .22 : 0), z: p.z + (along ? 0 : d * .22), y: h + roofH * .55, h: .7 + r });
  });
  walls.castShadow = walls.receiveShadow = true; roofs.castShadow = roofs.receiveShadow = true; scene.add(walls, roofs);
  const chimMesh = new T.InstancedMesh(chimGeo, track(new T.MeshStandardMaterial({ color: 0x8a5a48, roughness: .9 })), Math.max(1, chimList.length)); chimMesh.count = chimList.length;
  chimList.forEach((c, i) => { transform.position.set(c.x, c.y + c.h / 2, c.z); transform.rotation.set(0, 0, 0); transform.scale.set(1, c.h, 1); transform.updateMatrix(); chimMesh.setMatrixAt(i, transform.matrix); });
  chimMesh.castShadow = true; scene.add(chimMesh);
  chimList.slice(0, 16).forEach((c) => houseChimneys.push({ x: c.x, y: c.y + c.h + .1, z: c.z, dark: false }));

  // ---- Bäume (Stamm + Krone / Nadelbaum), Jahreszeit färbt die Kronen
  const trees = [...(aerial.vegetation || []).map((v) => { const p = toWorld(v.x, v.y); return { x: p.x, z: p.z, r: Math.max(.5, v.r * UNIT * 1.5) }; })];
  const fountainPark = (aerial.parks || [])[0];
  for (const pk of aerial.parks || []) {
    const c = toWorld((pk.x0 + pk.x1) / 2, (pk.y0 + pk.y1) / 2), w = (pk.x1 - pk.x0) * UNIT, d = (pk.y1 - pk.y0) * UNIT;
    for (let i = 0; i < 16; i++) { const x = c.x + (rnd() - .5) * (w - 2), z = c.z + (rnd() - .5) * (d - 2); if (pk === fountainPark && Math.hypot(x - c.x, z - c.z) < 5.2) continue; trees.push({ x, z, r: .8 + rnd() * .8 }); }
  }
  const isPine = (i) => i % 4 === 3;
  const crowns = new T.InstancedMesh(track(new T.IcosahedronGeometry(1, 1)), track(new T.MeshStandardMaterial({ roughness: 1, flatShading: false })), trees.length);
  const pines = new T.InstancedMesh(track(new T.ConeGeometry(1, 2.4, 9)), track(new T.MeshStandardMaterial({ roughness: 1 })), trees.length);
  const trunks = new T.InstancedMesh(track(new T.CylinderGeometry(.09, .14, 1, 6)), track(new T.MeshStandardMaterial({ color: 0x5a4331, roughness: 1 })), trees.length);
  const col = new T.Color();
  trees.forEach((tr, i) => {
    const pine = isPine(i), r = tr.r, th = r * (pine ? .9 : 1.15);
    transform.position.set(tr.x, th / 2, tr.z); transform.rotation.set(0, 0, 0); transform.scale.set(r, th, r); transform.updateMatrix(); trunks.setMatrixAt(i, transform.matrix);
    transform.position.set(tr.x, pine ? th + r * 1.05 : th + r * .85, tr.z); transform.rotation.set(0, i, 0); transform.scale.set(r * (pine ? .85 : 1.1), r * (pine ? 1.1 : .95), r * (pine ? .85 : 1.1));
    transform.updateMatrix(); (pine ? pines : crowns).setMatrixAt(i, transform.matrix);
    if (pine) { transform.scale.setScalar(.0001); transform.updateMatrix(); crowns.setMatrixAt(i, transform.matrix); } else { transform.scale.setScalar(.0001); transform.updateMatrix(); pines.setMatrixAt(i, transform.matrix); }
    const v = (i * 37 % 11) / 11;
    if (pine) col.setHSL(.34 + v * .03, .45, .15 + v * .05).lerp(whiteRoof, season.snow * .5); // Nadelbäume bleiben grün
    else if (season.snow > .5) col.setHSL(.09, .12, .36 + v * .06).lerp(whiteRoof, season.snow * .45);
    else if (season.autumn > .1) col.setHSL(.27 - season.autumn * (.15 + v * .12), .4 + season.autumn * .3, .27 + v * .07);
    else if (season.blossom > .25 && v > .6) col.setHSL(.94, .5, .78 - v * .08); else col.setHSL(.27 + v * .03, .42, .24 + v * .08);
    (pine ? pines : crowns).setColorAt(i, col);
    (pine ? crowns : pines).setColorAt(i, col);
  });
  for (const m of [crowns, pines, trunks]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // ---- Straßenlaternen
  const lampPts = []; const mainOf = (arr) => new Set(arr.filter((_, i) => i % 3 === 1));
  const mx = mainOf(aerial.roads.xs), my = mainOf(aerial.roads.ys);
  for (const x of aerial.roads.xs) for (let y = 70; y < 1200; y += 200) { const p = toWorld(x + (mx.has(x) ? 20 : 13), y); lampPts.push(p); }
  for (const y of aerial.roads.ys) for (let x = 90; x < 1950; x += 220) { const p = toWorld(x, y + (my.has(y) ? 20 : 13)); lampPts.push(p); }
  const lampCap = lampPts.slice(0, 110);
  const posts = new T.InstancedMesh(track(new T.CylinderGeometry(.04, .06, 1.7, 5)), track(new T.MeshStandardMaterial({ color: 0x2f3236, roughness: .6, metalness: .4 })), lampCap.length);
  const heads = new T.InstancedMesh(track(new T.SphereGeometry(.17, 8, 6)), track(new T.MeshBasicMaterial({ color: 0xffd58a })), lampCap.length);
  const haloGeo = track(new T.BufferGeometry()); haloGeo.setAttribute('position', new T.Float32BufferAttribute(lampCap.flatMap((p) => [p.x, 1.85, p.z]), 3));
  const haloMat = track(new T.PointsMaterial({ map: track(soft(T, [[0, 'rgba(255,214,140,1)'], [.35, 'rgba(255,190,100,.35)'], [1, 'rgba(255,170,80,0)']])), size: 6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, fog: false }));
  const halos = new T.Points(haloGeo, haloMat); halos.frustumCulled = false; halos.renderOrder = 5;
  lampCap.forEach((p, i) => { transform.position.set(p.x, .85, p.z); transform.rotation.set(0, 0, 0); transform.scale.set(1, 1, 1); transform.updateMatrix(); posts.setMatrixAt(i, transform.matrix); transform.position.set(p.x, 1.78, p.z); transform.updateMatrix(); heads.setMatrixAt(i, transform.matrix); });
  scene.add(posts, heads, halos);

  // ---- Wahrzeichen
  const glassOn = track(new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, emissive: 0xffc46a, emissiveIntensity: 0, roughness: .25, metalness: .1 }));
  const glassOff = track(new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: .25, metalness: .1 }));
  const shared = { glassOn, glassOff };
  const lms = aerial.landmarks || [], buildings = [], chimneys = [...houseChimneys], flagMeshes = [], lightSprites = [], ownRings = [], info = new Map();
  const flagMats = new Map();
  const lmData = [];
  for (const b of lms) {
    const built = buildLandmark(T, b, { era }, shared), pos = toWorld(b.x, b.y);
    built.group.position.copy(pos); built.group.userData.key = b.key; scene.add(built.group); buildings.push(built.group); info.set(b.key, { ...built, pos, b });
    for (const c of built.chimneys) chimneys.push({ x: pos.x + c.x, y: c.y, z: pos.z + c.z, dark: c.dark });
    for (const f of built.flags) {
      if (!flagMats.has(f.col)) flagMats.set(f.col, track(new T.MeshStandardMaterial({ color: f.col, side: T.DoubleSide, roughness: .8 })));
      const m = new T.Mesh(track(new T.PlaneGeometry(1.1, .7)), flagMats.get(f.col)); m.position.set(pos.x + f.x + .55, pos.y + f.y - .4, pos.z + f.z); m.userData.phase = rnd() * 6; scene.add(m); flagMeshes.push(m);
    }
    for (const l of built.lights) { const s = new T.Sprite(track(new T.SpriteMaterial({ map: track(soft(T, [[0, 'rgba(255,255,255,1)'], [.3, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']])), color: l.color, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }))); s.scale.set(5, 5, 1); s.position.set(pos.x + l.x, l.y, pos.z + l.z); scene.add(s); lightSprites.push(s); }
    if (b.own) {
      const sz = Math.max(b.w, b.d) * UNIT * .62;
      const ringO = new T.Mesh(track(new T.RingGeometry(sz, sz + .22, 48)), track(new T.MeshBasicMaterial({ color: 0xf3cd7f, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false })));
      ringO.rotation.x = -Math.PI / 2; ringO.position.set(pos.x, .09, pos.z); scene.add(ringO); ownRings.push(ringO);
      const pole = new T.Mesh(track(new T.CylinderGeometry(.04, .04, 1.6, 6)), track(new T.MeshStandardMaterial({ color: 0xe3b94a, roughness: .5, metalness: .6 }))); pole.position.set(pos.x, built.height + .8, pos.z - (b.d * UNIT) * .1); scene.add(pole);
      const pen = new T.Mesh(track(new T.PlaneGeometry(.95, .55)), track(new T.MeshStandardMaterial({ color: 0xe3b94a, side: T.DoubleSide, roughness: .6 }))); pen.position.set(pole.position.x + .48, built.height + 1.35, pole.position.z); pen.userData.phase = rnd() * 6; scene.add(pen); flagMeshes.push(pen);
    }
    lmData.push({ x: pos.x, z: pos.z, w: b.w * UNIT, d: b.d * UNIT, key: b.key });
  }

  // ---- Leben
  const life = createLife(T, scene, { aerial, toWorld, era, seed: cityId * 31 + 5, chimneys, landmarks: lmData, parks: fountainPark ? [{ x: toWorld((fountainPark.x0 + fountainPark.x1) / 2, (fountainPark.y0 + fountainPark.y1) / 2).x, z: toWorld((fountainPark.x0 + fountainPark.x1) / 2, (fountainPark.y0 + fountainPark.y1) / 2).z }] : [] });

  // ---- Hervorhebung, Auswahlring, Markierungen (HTML), Tooltip, Karte
  const ring = new T.Mesh(track(new T.RingGeometry(1, 1.07, 64)), track(new T.MeshBasicMaterial({ color: 0xa6ffd3, side: T.DoubleSide, transparent: true, opacity: .9, depthWrite: false }))); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  const hoverRing = new T.Mesh(track(new T.RingGeometry(1, 1.12, 64)), track(new T.MeshBasicMaterial({ color: 0xfff1b8, side: T.DoubleSide, transparent: true, opacity: .7, depthWrite: false }))); hoverRing.rotation.x = -Math.PI / 2; hoverRing.visible = false; scene.add(hoverRing);
  const labels = document.createElement('div'); labels.className = 'city3d-labels'; host.append(labels);
  const playerTag=document.createElement('span');playerTag.className='city-player-tag';playerTag.textContent='Du';playerTag.setAttribute('aria-hidden','true');labels.append(playerTag);
  const tip = document.createElement('div'); tip.className = 'city3d-tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); labels.append(tip);
  const card = document.createElement('div'); card.className = 'city3d-card'; card.hidden = true; card.setAttribute('aria-live', 'polite'); labels.append(card);
  const pins = lms.map((b) => {
    const button = document.createElement('button'); button.className = 'city3d-pin'; button.dataset.cityKey = b.key; button.dataset.own = String(b.own); button.dataset.kind = b.type; button.type = 'button'; button.title = b.name; button.setAttribute('aria-label', b.name);
    button.innerHTML = '<span aria-hidden="true">◆</span><strong></strong>'; button.querySelector('strong').textContent = b.name;
    button.onclick = () => { focus(b.key); onSelect(b.key); }; labels.append(button);
    const anchor = toWorld(b.x, b.y); anchor.y = (info.get(b.key)?.height || 4) + 1.4; return { button, anchor, key: b.key };
  });
  const controls = [...(host.closest('.aerial-card')?.querySelectorAll('.city-view-mode,.map-tools') || [])];
  const paintPins = () => {
    host.style.setProperty('--city-overlay-space',`${Math.max(card.hidden?0:card.offsetHeight,walker.element.hidden?0:walker.element.offsetHeight)+20}px`);
    const r = host.getBoundingClientRect(), blocked = [...controls,minimap.element,walker.element,card].filter(el=>el.offsetWidth && el.offsetHeight).map(el=>el.getBoundingClientRect());
    host.classList.toggle('city-has-selection',!card.hidden);
    const player=walker.snapshot(),pp=new T.Vector3((player.x-1000)*UNIT,2.8,(player.y-625)*UNIT).project(camera);
    playerTag.textContent=player.label;
    const px=(pp.x+1)*r.width/2,py=(1-pp.y)*r.height/2;
    playerTag.hidden=Math.abs(pp.x)>.96 || Math.abs(pp.y)>.9 || pp.z>1 || pp.z< -1;
    playerTag.style.left=`${px}px`;playerTag.style.top=`${py}px`;
    const tagBox=playerTag.getBoundingClientRect();playerTag.style.visibility=blocked.some(b=>tagBox.right>b.left&&tagBox.left<b.right&&tagBox.bottom>b.top&&tagBox.top<b.bottom)?'hidden':'';
    for (const pin of pins) {
      const p = pin.anchor.clone().project(camera), x=(p.x+1)*.5*r.width, y=(1-p.y)*.5*r.height;
      // Markers remain anchored to the building; the city list also exposes those behind camera controls.
      const covered=blocked.some(b=>x+r.left+20>b.left && x+r.left-20<b.right && y+r.top+20>b.top && y+r.top-20<b.bottom);
      pin.button.hidden=p.z>1 || p.z< -1 || Math.abs(p.x)>.94 || Math.abs(p.y)>.88 || covered;
      pin.button.style.left=`${x}px`;pin.button.style.top=`${y}px`;
      pin.button.setAttribute('aria-pressed',String(pin.key===focusKey));pin.button.dataset.hover=String(pin.key===hoverKey);
      const caption=pin.button.querySelector('strong').getBoundingClientRect();
      pin.button.dataset.captionHidden=String(caption.width>0 && (caption.left<r.left+6 || caption.right>r.right-6 || blocked.some(b=>caption.right>b.left&&caption.left<b.right&&caption.bottom>b.top&&caption.top<b.bottom)));
    }
  };
  const highlight = (key, on) => { const i = info.get(key); if (!i) return; for (const mat of i.surfaceMaterials || [i.litMaterial]) mat.emissive.setHex(on ? 0x3b3010 : 0x000000); };
  const placeRing = (mesh, key, pad) => { const i = info.get(key); if (!i) return; const r = Math.max(i.b.w, i.b.d) * UNIT * pad; mesh.position.set(i.pos.x, .12, i.pos.z); mesh.scale.set(r, r, 1); mesh.visible = true; };
  const showTip = (key, x, y) => {
    const d = key && describe(key); if (!d) { tip.hidden = true; return; }
    tip.innerHTML = ''; const h = document.createElement('strong'); h.textContent = d.title; tip.append(h);
    for (const l of d.lines || []) { const s = document.createElement('span'); s.textContent = l; tip.append(s); }
    tip.hidden = false; const r = host.getBoundingClientRect(); tip.style.left = `${Math.max(8, Math.min(x - r.left + 16, r.width - tip.offsetWidth - 8))}px`; tip.style.top = `${Math.max(8, Math.min(y - r.top + 16, r.height - tip.offsetHeight - 8))}px`;
  };
  const showCard = (key) => {
    const d = key && describe(key); if (!d) { card.hidden = true; return; }
    card.innerHTML = ''; const eyebrow = document.createElement('span'); eyebrow.textContent = d.kind || ''; const h = document.createElement('strong'); h.textContent = d.title; card.append(eyebrow, h);
    for (const l of d.lines || []) { const s = document.createElement('small'); s.textContent = l; card.append(s); }
    const row = document.createElement('div'); const enter = document.createElement('button'); enter.type = 'button'; enter.className = 'btn primary'; enter.textContent = d.enterLabel || 'Gebäude betreten';enter.disabled=d.canEnter===false;enter.title=d.reason || ''; enter.onclick = () => onEnter(key);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn ghost'; close.textContent = 'Schließen'; close.onclick = () => { card.hidden = true; ring.visible = false; focusKey = null; invalidate(); };
    row.append(enter, close); card.append(row); card.hidden = false;
  };

  // ---- Zeit, Beleuchtung, Jahreszeit
  const tmp = new T.Color(), skyTop = new T.Color(), skyHor = new T.Color();
  function applyAtmosphere(a) {
    atmo = a; scene.fog.color.setHex(a.skyHorizon); scene.fog.density = .0017 + a.glow * .0009 + season.snow * .0006;
    skyTop.setHex(a.skyTop); skyHor.setHex(a.skyHorizon); const P = skyGeo.attributes.position, C = skyGeo.attributes.color;
    for (let i = 0; i < P.count; i++) { const k = Math.max(0, Math.min(1, P.getY(i) / 600)); tmp.copy(skyHor).lerp(skyTop, Math.pow(k, .55)); C.setXYZ(i, tmp.r, tmp.g, tmp.b); } C.needsUpdate = true;
    const d = a.sunDir; sun.position.set(d[0] * 190, d[1] * 190, d[2] * 190); sun.color.setHex(a.sunColor); sun.intensity = a.sunIntensity; hemi.color.setHex(a.hemiSky); hemi.groundColor.setHex(a.hemiGround); hemi.intensity = a.hemiIntensity;
    renderer.toneMappingExposure = a.exposure; stars.material.opacity = a.starAlpha; stars.visible = a.starAlpha > .02;
    sunSprite.position.set(d[0] * 480, d[1] * 480 + 10, d[2] * 480); sunSprite.material.color.setHex(a.isNight ? 0xcfd9ff : a.sunColor); sunSprite.scale.setScalar(a.isNight ? 70 : 130);
    for (const c of clouds) c.material.color.copy(tmp.setHex(a.hemiSky).lerp(new T.Color(0xffffff), a.isNight ? 0 : .6)).multiplyScalar(a.isNight ? .35 : 1), c.material.opacity = (a.isNight ? .35 : .8) * (season.snow > .5 ? 1 : .9);
    glassOn.emissiveIntensity = a.glow * 1.5; wallMat.emissiveIntensity = a.glow * 1.35; haloMat.opacity = a.lampAlpha * .85;
    heads.material.color.setHex(0xffd58a).multiplyScalar(.4 + a.lampAlpha * .9);
    for (const s of lightSprites) s.material.opacity = Math.max(a.glow * .8, .25);
  }
  applyAtmosphere(atmo);

  // ---- Kamera
  const bounds = { x: WORLD_W / 2 - 8, z: WORLD_D / 2 - 6 };
  const target = { x: 0, z: 0, az: .2, el: 1.0, dist: 105 }, shown = { ...target };
  const clampTarget = () => { target.x = Math.max(-bounds.x, Math.min(bounds.x, target.x)); target.z = Math.max(-bounds.z, Math.min(bounds.z, target.z)); };
  let flight = null, followPlayer = false;
  const cancelFlight = () => { if(flight){const done=flight.done;flight=null;done(false);} };
  const walker = createCityWalker(T, scene, host, aerial, {start:opts.playerPosition,onPosition:opts.onPlayerPosition,reduced,invalidate,actor:opts.actor,actorPositions:opts.actorPositions});
  const minimap = createCityMinimap(T, host, aerial, {camera,player:()=>walker.snapshot(),actors:opts.actors,onActor:id=>{
    const actor=opts.actors.find(a=>a.id===id&&a.available);if(!actor)return;
    cancelFlight();walker.setActor(actor);followPlayer=false;opts.onActorChange?.(id);
    const p=walker.snapshot();target.x=(p.x-1000)*UNIT;target.z=(p.y-625)*UNIT;clampTarget();
    if(focusKey)showCard(focusKey);invalidate();
  },invalidate,pan:(x,y)=>{
    cancelFlight();followPlayer=false;target.x=(x-1000)*UNIT;target.z=(y-625)*UNIT;clampTarget();invalidate();
  }});
  async function walkTo(key) {
    if(!info.has(key))return false;
    cancelFlight();followPlayer=true;focusKey=key;placeRing(ring,key,.78);card.hidden=true;
    const p=walker.snapshot();target.x=(p.x-1000)*UNIT;target.z=(p.y-625)*UNIT;target.dist=36;target.el=.9;
    const arrived=await walker.walkTo(key);
    if(alive && !arrived){showCard(focusKey);invalidate();}
    return arrived;
  }
  function focus(key, immediate = false) {
    if(walker.snapshot().walking && walker.snapshot().destination!==key)walker.cancel();
    const i = info.get(key); if (!i) return; focusKey = key; target.x = i.pos.x; target.z = i.pos.z; target.dist = Math.min(Math.max(target.dist, 40), 68);
    placeRing(ring, key, .78); showCard(key); if (immediate) Object.assign(shown, target); invalidate();
  }
  function flyTo(key, { ms = 650 } = {}) {
    cancelFlight();const i = info.get(key); if (!i || !alive) return Promise.resolve(false);
    focusKey = key; placeRing(ring, key, .78); card.hidden = true;
    if (reduced()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const from = { ...shown }, to = { x: i.pos.x, z: i.pos.z, az: 0, el: .5, dist: 17 }; let az0 = from.az; while (az0 > Math.PI) az0 -= Math.PI * 2; while (az0 < -Math.PI) az0 += Math.PI * 2; from.az = az0; shown.az = az0;
      flight = { t0: performance.now(), ms, from, to, done: resolve }; invalidate();
    });
  }
  const ease = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const camDir = new T.Vector3();
  function placeCamera() {
    const dist = shown.dist * Math.max(1, .85 / camera.aspect);
    camera.position.set(shown.x + dist * Math.cos(shown.el) * Math.sin(shown.az), dist * Math.sin(shown.el) + 1, shown.z + dist * Math.cos(shown.el) * Math.cos(shown.az));
    camera.lookAt(shown.x, 1, shown.z);
  }
  let lastDraw = 0; const app = host.closest('#app');
  function invalidate() { if (alive && !raf && !document.hidden && !app?.inert) raf = requestAnimationFrame(render); }
  const wake = () => { if (document.hidden || app?.inert || !host.getClientRects().length) { cancelAnimationFrame(raf); raf = 0; previous = 0; } else invalidate(); };
  document.addEventListener('visibilitychange', wake); const overlayObserver = new MutationObserver(wake); if (app) overlayObserver.observe(app, { attributes: true, attributeFilter: ['inert'] });
  const motionMedia = matchMedia('(prefers-reduced-motion: reduce)'); motionMedia.addEventListener('change', wake); const motionObserver = new MutationObserver(wake); motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  let frames = 0, fpsT = performance.now(), fps = 0;
  function render(t) {
    raf = 0; if (!alive || !host.isConnected || !host.getClientRects().length || app?.inert) return;
    const animated = !reduced();
    if (animated && t - lastDraw < 30) { invalidate(); return; }
    lastDraw = t; const dt = previous ? Math.min(100, t - previous) : 16; previous = t;
    let moving = walker.update(dt);
    if(moving && followPlayer){const p=walker.snapshot();target.x=(p.x-1000)*UNIT;target.z=(p.y-625)*UNIT;clampTarget();}
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.t0) / flight.ms), e = ease(k);
      for (const key of ['x', 'z', 'az', 'el', 'dist']) shown[key] = flight.from[key] + (flight.to[key] - flight.from[key]) * e;
      Object.assign(target, shown); moving = true;
      if (k >= 1 || reduced()) { Object.assign(shown,flight.to);Object.assign(target,shown);const done = flight.done; flight = null; done(true); }
    } else {
      for (const k of Object.keys(target)) { const delta = target[k] - shown[k]; shown[k] += delta * (reduced() ? 1 : 1 - Math.exp(-dt / 110)); if (Math.abs(delta) > .001) moving = true; else shown[k] = target[k]; }
    }
    if (animated) {
      if (t - lastAtmo > 400) { lastAtmo = t; applyAtmosphere(atmosphereAt(getHour(), season)); }
      life.update(t, atmo, season);
      for (const f of flagMeshes) { f.rotation.y = Math.sin(t * .003 + f.userData.phase) * .35; f.scale.x = 1 + Math.sin(t * .004 + f.userData.phase) * .08; }
      for (const c of clouds) { c.position.x += c.userData.speed * dt * .0012; if (c.position.x > 260) c.position.x = -260; }
      if (river) river.material.map.offset.x = -(t * .00004 % 1);
    }
    if (moving && (hoverKey || !tip.hidden)) clearHover();
    placeCamera(); renderer.render(scene, camera); paintPins(); minimap.update(shown);
    frames++; if (t - fpsT > 1000) { fps = Math.round(frames * 1000 / (t - fpsT)); frames = 0; fpsT = t; }
    if (moving || animated) invalidate(); else previous = 0;
  }
  const resize = () => { const r = host.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); invalidate(); };
  const observer = new ResizeObserver(resize); observer.observe(host);

  // ---- Eingaben: Ziehen = drehen, Rechtsklick/Umschalt = verschieben, Pinch = Zoom, Hover = Hervorhebung
  const pts = new Map(); let pinch = 0, lastClick = { key: null, t: 0 };
  const pick = (cx, cy) => { const r = canvas.getBoundingClientRect(); pointer.set((cx - r.left) / r.width * 2 - 1, 1 - (cy - r.top) / r.height * 2); ray.setFromCamera(pointer, camera); const hit = ray.intersectObjects(buildings, true)[0]; let o = hit?.object; while (o && !o.userData.key) o = o.parent; return o?.userData.key || null; };
  canvas.oncontextmenu = (e) => e.preventDefault();
  canvas.onpointerdown = (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, az: target.az, el: target.el, tx: target.x, tz: target.z, moved: 0, pan: e.button === 2 || e.shiftKey || e.button === 1 }; else if (drag) drag.moved = 99; cancelFlight(); };
  let hoverQueued = null;
  const clearHover = () => { if (hoverKey) { highlight(hoverKey, false); hoverKey = null; hoverRing.visible = false; canvas.style.cursor = 'grab'; } tip.hidden = true; };
  const hover = () => { const e = hoverQueued; hoverQueued = null; if (!e || !alive) return; const key = pick(e.clientX, e.clientY); if (key !== hoverKey) { if (hoverKey) highlight(hoverKey, false); hoverKey = key; if (key) { highlight(key, true); placeRing(hoverRing, key, .9); } else hoverRing.visible = false; canvas.style.cursor = key ? 'pointer' : 'grab'; invalidate(); } showTip(key, e.clientX, e.clientY); };
  canvas.onpointermove = (e) => {
    if (!pts.has(e.pointerId) || !drag) { if (e.pointerType === 'mouse') { hoverQueued = e; requestAnimationFrame(hover); } return; }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch && d > 4) zoom(pinch / d); pinch = d; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 5) { followPlayer=false;tip.hidden = true; if (drag.pan) { const s = shown.dist * .0023; target.x = drag.tx - (dx * Math.cos(shown.az) + dy * Math.sin(shown.az)) * s; target.z = drag.tz + (dx * Math.sin(shown.az) - dy * Math.cos(shown.az)) * s; clampTarget(); } else { target.az = drag.az - dx * .005; target.el = Math.max(.25, Math.min(1.45, drag.el + dy * .004)); } invalidate(); }
  };
  const end = (e) => {
    if (!drag) return; const click = e.type === 'pointerup' && drag.moved < 5; pts.delete(e.pointerId); pinch = 0;
    if (pts.size) { const p = [...pts.values()][0]; drag = { x: p[0], y: p[1], az: target.az, el: target.el, tx: target.x, tz: target.z, moved: 99, pan: false }; return; }
    drag = null;
    if (click) { const key = pick(e.clientX, e.clientY); if (key) { const now = performance.now(); if (lastClick.key === key && now - lastClick.t < 380) { onEnter(key); lastClick = { key: null, t: 0 }; return; } lastClick = { key, t: now }; focus(key); onSelect(key); } else if (e.pointerType !== 'mouse') { card.hidden = true; } }
  };
  canvas.onpointerup = end; canvas.onpointercancel = end; canvas.onpointerleave = () => { clearHover(); invalidate(); };
  function zoom(f) { target.dist = Math.max(14, Math.min(190, target.dist * f)); invalidate(); }
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(Math.max(-120, Math.min(120, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * .002)); }, { passive: false });
  canvas.onkeydown = (e) => {
    const step = shown.dist * .08, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'w', 'a', 's', 'd'].includes(k)) {
      e.preventDefault();followPlayer=false;
      if (k === '-') zoom(1.2); else if (k === '+' || k === '=') zoom(.8); else if (k === 'Home') reset();
      else if ('wasd'.includes(k)) { const fx = -Math.sin(shown.az), fz = -Math.cos(shown.az); const rx = Math.cos(shown.az), rz = -Math.sin(shown.az); const f = k === 'w' ? 1 : k === 's' ? -1 : 0, r = k === 'd' ? 1 : k === 'a' ? -1 : 0; target.x += (fx * f + rx * r) * step; target.z += (fz * f + rz * r) * step; clampTarget(); invalidate(); }
      else { target.az += (k === 'ArrowLeft' ? -.15 : k === 'ArrowRight' ? .15 : 0); target.el = Math.max(.25, Math.min(1.45, target.el + (k === 'ArrowUp' ? .1 : k === 'ArrowDown' ? -.1 : 0))); invalidate(); }
    }
  };
  function reset() { followPlayer=false;Object.assign(target, { x: 0, z: 0, az: .2, el: 1.0, dist: 105 }); invalidate(); }
  if (selected) focus(selected, true);
  resize();
  if (reduced()) life.still(atmo, season);
  return {
    focus, flyTo, walkTo, zoom, reset, invalidate,
    /** Kennzahlen für Tests und die Leistungsbeurteilung */
    stats() { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, fps, player:walker.snapshot(),camera:{...shown}, extensions:buildings.filter(b=>b.userData.extensions?.length).map(b=>({key:b.userData.key,rooms:b.userData.extensions})), construction:buildings.filter(b=>b.userData.constructionStage!==null).map(b=>({key:b.userData.key,stage:b.userData.constructionStage})), hour: atmo.hour, season: season.key, ...life.count }; },
    dispose() {
      alive = false; cancelAnimationFrame(raf); observer.disconnect(); overlayObserver.disconnect(); motionObserver.disconnect(); motionMedia.removeEventListener('change', wake); document.removeEventListener('visibilitychange', wake); if (textureURL) URL.revokeObjectURL(textureURL);
      cancelFlight();walker.dispose();minimap.dispose();host.classList.remove('city-has-selection');life.dispose(); scene.traverse((m) => { m.geometry?.dispose(); for (const material of Array.isArray(m.material) ? m.material : [m.material]) { if (!material) continue; for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); } });
      disposables.forEach((d) => d.dispose?.()); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); labels.remove();
    },
    get selected() { return focusKey; },
  };
}
