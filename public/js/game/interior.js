// 3D-Innenansicht eines Gebäudes: drehbar, Objekte anklickbar, Aufgaben & Minispiel.
import { html, mount, esc, icon, api, toast, money, sleep } from './ui.js';
import { buildRoom, tokenSpots } from './rooms.js';

const REWARD_LABEL = { efs: (n) => `+${n} EFS`, rest: (n) => `${n > 0 ? '+' : ''}${n} Erholung`, wellbeing: (n) => `+${n} Wohlbefinden`, health: (n) => `+${n} Gesundheit`, influence: (n) => `+${n} Einfluss`, money: () => 'Trinkgeld', childSat: () => 'Kinder froh', bizCash: () => 'Extra-Umsatz' };
const rewardText = (r) => Object.entries(r || {}).map(([k, n]) => (REWARD_LABEL[k] ? REWARD_LABEL[k](n) : '')).filter(Boolean).join(' · ');

export async function openInterior(ctx, b, data) {
  let T;
  const root = document.createElement('div'); root.className = 'interior';
  root.innerHTML = `<canvas></canvas>
    <div class="int-top"><button class="btn sm" id="intBack">← Verlassen</button><div class="int-title"><b class="serif">${esc(b.name)}</b><span class="dim small">${b.own ? 'Dein Besitz · ' : ''}Ziehen = umsehen · Rad = Zoom · Klick auf Gegenstände</span></div><button class="btn sm ghost" id="intTasksBtn">Aufgaben</button></div>
    <div class="int-tasks card"></div><div class="int-tip hide"></div><div class="int-panel card hide"></div><div class="int-mini hide"></div>`;
  document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const canvas = root.querySelector('canvas'); const tip = root.querySelector('.int-tip'); const panel = root.querySelector('.int-panel'); const mini = root.querySelector('.int-mini');
  let renderer; let alive = true; let rafId = 0; let needs = true; let minigame = null;
  const cleanup = () => {
    alive = false; cancelAnimationFrame(rafId); window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey);
    if (renderer) { renderer.dispose(); }
    root.remove(); document.body.style.overflow = '';
  };
  const close = () => { cleanup(); ctx.rerender(); };
  root.querySelector('#intBack').onclick = close;
  const onKey = (e) => { if (e.key === 'Escape') { if (minigame) stopMini(); else close(); } };
  document.addEventListener('keydown', onKey);

  const here = data.here;
  // ---- Aufgabenliste (links)
  const tasksBox = root.querySelector('.int-tasks');
  const renderTasks = () => {
    mount(tasksBox, html`<div class="card-title">${icon('hammer')} Aufgaben hier</div>${b.tasks.length ? b.tasks.map((t) => html`<div class="int-task ${t.ready ? 'ready' : ''}"><div class="grow"><b>${t.name}</b><div class="dim small">${t.desc}</div><div class="small accent-t">${rewardText(t.reward)}</div></div><span class="chip ${t.ready ? 'good' : ''}">${!here ? 'nicht vor Ort' : t.blocked ? 'gesperrt' : t.ready ? 'bereit' : 'in ' + t.cooldownLeft + ' Min.'}</span></div>`) : html`<div class="dim small">Hier gibt es keine Aufgaben – aber vielleicht etwas anderes zu entdecken.</div>`}`);
  };
  renderTasks();
  root.querySelector('#intTasksBtn').onclick = () => tasksBox.classList.toggle('show');

  const refreshCity = async () => {
    try { const r = await api('GET', `/api/city?cityId=${data.city.id}`); const nb = r.buildings.find((x) => x.key === b.key); if (nb) b.tasks = nb.tasks; } catch (_) { /* ignorieren */ }
    renderTasks();
  };
  const api2 = {
    go: (route, tab) => { cleanup(); if (tab) ctx.ui.newsTab = tab; ctx.go(route); },
    act: async (name, input) => { try { await ctx.act(name, input, { noRender: true }); } catch (_) { /* Toast kommt aus act */ } await refreshCity(); showActions(currentHot); },
  };

  // ---- Aktionspanel
  let currentHot = null;
  const resolveActions = (h) => {
    let list = h.actions();
    const out = [];
    for (const a of list) {
      if (a.kind === 'food') {
        for (const [i, tier] of ctx.view.food.tiers.entries()) out.push({ label: `Kühlschrank/Vorrat auffüllen – ${tier.name}`, sub: money(tier.cost, ctx.view.currency), disabled: ctx.view.meters.fridge >= 95 || ctx.view.money < tier.cost, run: ({ act }) => act('buyFood', { tier: i }) });
      } else if (a.kind === 'task') {
        const t = a.task; const st = !here ? 'Du bist nicht in dieser Stadt.' : t.blocked || (!t.ready ? `Wieder verfügbar in ${t.cooldownLeft} Min.` : '');
        out.push({ label: `Aufgabe: ${t.name}`, sub: st || `${t.desc} (${rewardText(t.reward)})`, disabled: !t.ready || !here, run: () => runTask(t) });
      } else out.push(a);
    }
    return out;
  };
  const showActions = (h) => {
    currentHot = h;
    if (!h) { panel.classList.add('hide'); return; }
    const acts = resolveActions(h);
    mount(panel, html`<div class="row spread"><b class="serif" style="font-size:1.15rem">${h.label}</b><button class="btn ghost sm" id="pClose" aria-label="Schließen">${icon('x')}</button></div>
      ${acts.length ? html`<div class="stack mt" style="--gap:.5rem">${acts.map((a, i) => html`<button class="btn block act" data-i="${i}" ${a.disabled || (!here && !a.allowAway) ? 'disabled' : ''}><span class="grow" style="text-align:left"><b>${a.label}</b>${a.sub ? html`<div class="dim small" style="font-weight:500;white-space:normal">${a.sub}</div>` : ''}</span></button>`)}</div>` : html`<div class="dim mt">Hier gibt es gerade nichts zu tun.</div>`}
      ${!here ? html`<div class="small dim mt">Du bist nicht in dieser Stadt – Aktionen sind nur vor Ort möglich.</div>` : ''}`);
    panel.classList.remove('hide');
    panel.querySelector('#pClose').onclick = () => showActions(null);
    panel.querySelectorAll('.act').forEach((btn) => { btn.onclick = async () => { const a = acts[Number(btn.dataset.i)]; if (a && a.run) await a.run(api2); }; });
  };

  // ---- 3D initialisieren
  try {
    T = await import('/vendor/three/three.min.js');
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (e) { renderer = null; }
  const room = renderer ? buildRoom(T, b, ctx) : null;
  if (!renderer || !room) {
    // Fallback ohne WebGL: Aktionen als Liste
    mount(panel, html`<div class="alert warn">${icon('triangle-alert')}<div>3D wird auf diesem Gerät nicht unterstützt. Du kannst trotzdem alle Aufgaben hier erledigen.</div></div>
      <div class="stack" style="--gap:.5rem">${b.tasks.map((t, i) => html`<button class="btn block act" data-i="${i}" ${t.ready && here ? '' : 'disabled'}><span class="grow" style="text-align:left"><b>${t.name}</b><div class="dim small" style="font-weight:500">${t.desc} (${rewardText(t.reward)})</div></span></button>`)}</div>`);
    panel.classList.remove('hide'); canvas.classList.add('hide');
    panel.querySelectorAll('.act').forEach((btn) => { btn.onclick = async () => { const t = b.tasks[Number(btn.dataset.i)]; btn.disabled = true; try { if (t.minSeconds) { await api('POST', '/api/action/taskStart', { building: b.key, task: t.id }); await sleep(t.minSeconds * 1000 + 400); } await finishTask(t); } catch (e) { toast(e.message, 'bad'); } }; });
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; renderer.outputColorSpace = T.SRGBColorSpace;
  const { scene, hotspots, dims } = room;
  const markers = [];
  const numTex = (txt, bg = '#ffd54a', fg = '#2a1a00') => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); g.lineWidth = 8; g.strokeStyle = '#fff6d0'; g.stroke(); g.fillStyle = fg; g.font = '800 78px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 68); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
  const sprite = (tex, size) => { const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); s.scale.set(size, size, 1); s.renderOrder = 10; return s; };
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
  const cam = { az: 0.42, el: 0.78, dist: Math.max(dims.w, dims.d) * 1.35, target: new T.Vector3(0, 1.1, 0.4) };
  const minD = 5; const maxD = Math.max(dims.w, dims.d) * 2;
  const placeCam = () => { const ce = Math.cos(cam.el); camera.position.set(cam.target.x + cam.dist * ce * Math.sin(cam.az), cam.target.y + cam.dist * Math.sin(cam.el), cam.target.z + cam.dist * ce * Math.cos(cam.az)); camera.lookAt(cam.target); };
  const invalidate = () => { needs = true; if (!rafId) rafId = requestAnimationFrame(frame); };
  const onResize = () => { const r = root.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); invalidate(); };
  window.addEventListener('resize', onResize);
  const tokens = [];
  function frame(t) {
    rafId = 0; if (!alive) return;
    if (tokens.length) { tokens.forEach((k, i) => { k.mesh.position.y = k.y0 + Math.sin(t / 380 + i) * 0.12; k.mesh.rotation.y = t / 700 + i; }); needs = true; }
    if (needs) { needs = false; placeCam(); renderer.render(scene, camera); }
    if (tokens.length) rafId = requestAnimationFrame(frame);
  }
  onResize();

  // ---- Hotspots: Raycast, Hover, Klick
  const ray = new T.Raycaster(); const ptr = new T.Vector2();
  const hotOf = (obj) => { let o = obj; while (o) { const h = hotspots.find((x) => x.obj === o); if (h) return h; o = o.parent; } return null; };
  const pickAt = (e) => { const r = canvas.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, camera); return ray.intersectObjects(scene.children, true); };
  let hoverHot = null;
  const setEmissive = (h, on) => { h.obj.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) { if (on) { m.userData._e = m.material.emissive.getHex(); m.material.emissive.setHex(0x553a10); } else if (m.userData._e != null) m.material.emissive.setHex(m.userData._e); } }); };
  // Gegenstände mit Aufgabe leuchten sanft, damit man sie findet
  hotspots.forEach((h) => { if (h.actions().some((a) => a.kind === 'task' && a.task.ready) && here) setEmissive(h, true); });
  const markReady = () => {
    markers.splice(0).forEach((m) => scene.remove(m));
    hotspots.forEach((h) => {
      setEmissive(h, false);
      if (here && h.actions().some((a) => a.kind === 'task' && a.task.ready)) {
        setEmissive(h, true);
        const m = sprite(numTex('!', '#5fd6a4', '#06281c'), 0.8); m.position.set(h.obj.position.x, 3.1, h.obj.position.z); scene.add(m); markers.push(m);
      }
    });
  };
  markReady();

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0, az: cam.az, el: cam.el, pts: new Map([[e.pointerId, [e.clientX, e.clientY]]]), pinch: 0 }; });
  canvas.addEventListener('pointermove', (e) => {
    if (drag && drag.pts.has(e.pointerId)) {
      drag.pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (drag.pts.size === 2) { const [a, c] = [...drag.pts.values()]; const dd = Math.hypot(a[0] - c[0], a[1] - c[1]); if (drag.pinch) { cam.dist = Math.max(minD, Math.min(maxD, cam.dist * (drag.pinch / dd))); invalidate(); } drag.pinch = dd; drag.moved = 99; return; }
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved > 5) { cam.az = Math.max(-0.45, Math.min(1.15, drag.az - dx * 0.005)); cam.el = Math.max(0.35, Math.min(1.25, drag.el + dy * 0.004)); invalidate(); }
      return;
    }
    const hit = pickAt(e).find((i) => hotOf(i.object)); const h = hit ? hotOf(hit.object) : null;
    if (h !== hoverHot) { if (hoverHot) markReady(); hoverHot = h; if (h) setEmissive(h, true); invalidate(); }
    canvas.style.cursor = h ? 'pointer' : 'grab';
    if (h) { tip.textContent = h.label + (h.hint ? ` · ${h.hint}` : ''); tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 14}px`; tip.classList.remove('hide'); } else tip.classList.add('hide');
  });
  const endDrag = (e) => {
    if (!drag) return;
    const wasClick = drag.moved <= 5 && drag.pts.size <= 1; drag.pts.delete(e.pointerId); if (drag.pts.size === 0) { const moved = drag.moved; drag = null; if (wasClick && moved <= 5) clickAt(e); } else drag.pinch = 0;
  };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(minD, Math.min(maxD, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); invalidate(); }, { passive: false });

  function clickAt(e) {
    const hits = pickAt(e);
    if (minigame) { const t = hits.find((i) => tokens.some((k) => k.mesh === i.object || k.mesh === i.object.parent)); if (t) collectToken(tokens.find((k) => k.mesh === t.object || k.mesh === t.object.parent)); return; }
    const hit = hits.find((i) => hotOf(i.object));
    if (hit) { const h = hotOf(hit.object); showActions(h); const acts = resolveActions(h); if (acts.length === 1 && !acts[0].disabled && h.autorun) acts[0].run(api2); } else showActions(null);
  }

  // ---- Aufgaben & Minispiel
  async function runTask(t) {
    showActions(null);
    try {
      if (t.minSeconds) await api('POST', '/api/action/taskStart', { building: b.key, task: t.id }).then((r) => ctx.setView(r.view));
    } catch (e) { toast(e.message, 'bad'); return; }
    if ((t.mini === 'collect' || t.mini === 'sequence') && t.minSeconds) return startMini(t);
    await finishTask(t);
  }
  async function finishTask(t) {
    try { const r = await api('POST', '/api/action/taskFinish', { building: b.key, task: t.id }); ctx.setView(r.view); toast(r.message, r.level); ctx.hud(); } catch (e) { toast(e.message, 'bad'); }
    await refreshCity(); markReady(); invalidate();
  }
  function startMini(t) {
    const n = Math.max(4, Math.ceil(t.minSeconds / 1.3)); const started = performance.now();
    const spots = tokenSpots(dims, n, Date.now() % 1000);
    const seq = t.mini === 'sequence';
    spots.forEach((p, idx) => {
      const m = new T.Mesh(new T.SphereGeometry(seq ? 0.34 : 0.28, 16, 12), new T.MeshBasicMaterial({ color: 0xffd54a })); m.position.set(p[0], p[1], p[2]); scene.add(m);
      const ring = new T.Mesh(new T.TorusGeometry(0.42, 0.04, 8, 24), new T.MeshBasicMaterial({ color: 0xfff2b0 })); ring.rotation.x = Math.PI / 2; m.add(ring);
      if (seq) { const sp = sprite(numTex(String(idx + 1)), 0.9); sp.position.set(0, 0.85, 0); m.add(sp); }
      tokens.push({ mesh: m, y0: p[1], num: idx + 1 });
    });
    minigame = { t, total: n, got: 0, started, seq, wrong: 0 };
    mini.classList.remove('hide'); mini.innerHTML = `<b>${esc(t.name)}</b> – ${seq ? 'Klicke die Zahlen der Reihe nach (1, 2, 3 …)' : 'Sammle alle goldenen Marken'}: <span id="mc">0 / ${n}</span> <button class="btn sm ghost" id="mx">Abbrechen</button>`;
    mini.querySelector('#mx').onclick = stopMini; invalidate();
  }
  function stopMini() { tokens.splice(0).forEach((k) => scene.remove(k.mesh)); minigame = null; mini.classList.add('hide'); invalidate(); }
  async function collectToken(k) {
    if (minigame.seq && k.num !== minigame.got + 1) { minigame.wrong++; toast(`Falsche Reihenfolge – als Nächstes die ${minigame.got + 1}!`, 'warn'); return; }
    scene.remove(k.mesh); tokens.splice(tokens.indexOf(k), 1); minigame.got++;
    const mc = mini.querySelector('#mc'); if (mc) mc.textContent = `${minigame.got} / ${minigame.total}`; invalidate();
    if (minigame.got >= minigame.total) {
      const { t, started } = minigame; const wait = Math.max(0, t.minSeconds * 1000 - (performance.now() - started) + 350);
      mini.innerHTML = '<b>Geschafft!</b> Ergebnis wird verbucht …'; minigame = null; await sleep(wait); mini.classList.add('hide'); await finishTask(t);
    }
  }
  // Testhilfe: Bildschirmpositionen der Marken (für automatisierte Tests)
  root._tokenScreen = () => { const r = canvas.getBoundingClientRect(); return tokens.slice().sort((a, b) => a.num - b.num).map((k) => { const p = k.mesh.position.clone().project(camera); return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height]; }); };
  invalidate();
  // Zeit sparen: Akku-schonend – gerendert wird nur bei Bewegung/Minispiel
}

