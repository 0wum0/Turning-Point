import { html, raw, icon, infoBtn, api, on, mount, toast, esc } from '../ui.js';
import { buildAerial, WORLD } from '../aerial.js';

export default {
  id: 'city', label: 'Stadt', icon: 'building-2',
  async load(ctx) { return api('GET', `/api/city?cityId=${ctx.ui.cityId || ctx.view.city.id}`); },
  render(ctx, data) {
    const v = ctx.view; const c = data.city;
    const a = buildAerial({ cityId: c.id, name: c.name, tier: c.tier, era: v.date.eraKey, buildings: data.buildings, aerial: c.aerial, selected: ctx.ui.cityBuilding });
    ctx.ui._aerial = a;
    const own = data.buildings.filter((b) => b.own); const pub = data.buildings.filter((b) => !b.own);
    const row = (b) => html`<button class="bl-item ${b.own ? 'own' : ''}" data-focus="${b.key}"><span class="bl-ic">${icon(b.icon || 'landmark')}</span><span class="grow">${b.name}</span>${b.tasks.some((t) => t.ready) ? html`<i class="rdy" title="Aufgabe verfügbar"></i>` : ''}</button>`;
    return html`
    <div class="panel-head"><div><h2>${c.name}</h2><p>${c.state} · Luftansicht – ziehen zum Verschieben, Mausrad zum Zoomen, Gebäude anklicken zum Betreten.</p></div>
      <div class="row">${data.here ? html`<span class="chip good">${icon('map-pin')} Hier wohnst du</span>` : html`<span class="chip warn">${icon('eye')} Du bist nicht vor Ort</span>`}<button class="btn sm" data-go="map">${icon('map')} Zur Karte</button>
      ${infoBtn(['Das ist deine Stadt aus der Vogelperspektive. Öffentliche Orte wie Rathaus, Markthalle oder Bahnhof sind immer da – dazu alles, was dir selbst gehört.', 'In jedem Gebäude findest du Aufgaben und Möglichkeiten. Aufgaben bringen zusätzliche EFS und kleine Vorteile. Interaktionen sind nur in der Stadt möglich, in der du wohnst.', 'Klicke ein Gebäude an, schau dich um (ziehen zum Drehen) und klicke auf leuchtende Dinge.'], 'Stadtansicht')}</div></div>
    ${data.here ? '' : html`<div class="alert info">${icon('info')}<div>Du siehst ${c.name} nur von oben. Aufgaben und Einkäufe sind nur in deinem Wohnort möglich – ziehe dafür um (Karte).</div></div>`}
    <div class="city-layout">
      <section class="card aerial-card"><div class="map-tools"><button class="btn sm" id="azin" aria-label="Vergrößern">${icon('plus')}</button><button class="btn sm" id="azout" aria-label="Verkleinern">${icon('minus')}</button><button class="btn sm" id="azreset" aria-label="Zentrieren">${icon('refresh-cw')}</button></div>
        <div id="aerialHost">${raw(a.svg)}</div>
        <div class="aerial-hint small dim">${icon('hand-coins')} Goldene Umrandung = dein Besitz</div></section>
      <aside class="card bl-panel">
        ${own.length ? html`<div class="card-title">${icon('castle')} Dein Besitz &amp; Arbeitsplatz</div><div class="bl-list">${own.map(row)}</div>` : ''}
        <div class="card-title" style="margin-top:${own.length ? '1rem' : '0'}">${icon('landmark')} Öffentliche Orte</div><div class="bl-list">${pub.map(row)}</div>
      </aside>
    </div>`;
  },
  bind(root, ctx, data) {
    ctx.ui.cityData = data;
    const svg = root.querySelector('svg.aerial'); const { w: W, h: H } = WORLD;
    const spots = ctx.ui._aerial.spots;
    const full = { x: 0, y: 0, w: W, h: H };
    let box = ctx.ui.cityBox && ctx.ui.cityBox.id === data.city.id ? { ...ctx.ui.cityBox.box } : null;
    const apply = () => { svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`); svg.classList.toggle('zoomed', W / box.w > 1.7); ctx.ui.cityBox = { id: data.city.id, box: { ...box } }; };
    const aspect = () => { const r = svg.getBoundingClientRect(); return r.height / r.width; };
    const clampBox = () => { box.w = Math.max(W / 6, Math.min(W, box.w)); box.h = box.w * aspect(); box.x = Math.max(-60, Math.min(W - box.w + 60, box.x)); box.y = Math.max(-60, Math.min(H - box.h + 60, box.y)); };
    const centerOn = (x, y, zoom) => { box = { x: 0, y: 0, w: W / zoom, h: 0 }; box.h = box.w * aspect(); box.x = x - box.w / 2; box.y = y - box.h / 2; clampBox(); apply(); };
    const own = data.buildings.find((b) => b.residence) || data.buildings.find((b) => b.own && spots[b.key]) || data.buildings.find((b) => b.type === 'rathaus');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    if (!box) { const s = own && spots[own.key]; if (s) centerOn(s.x, s.y, 2.1); else { box = { ...full }; box.h = box.w * aspect(); clampBox(); apply(); } } else apply();
    const zoomAt = (f, cx, cy) => { box.x = box.x + (cx - box.x) * (1 - f); box.y = box.y + (cy - box.y) * (1 - f); box.w *= f; clampBox(); apply(); };
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); return [box.x + ((e.clientX - r.left) / r.width) * box.w, box.y + ((e.clientY - r.top) / r.height) * box.h]; };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = toSvg(e); zoomAt(e.deltaY < 0 ? 0.85 : 1.18, x, y); }, { passive: false });
    root.querySelector('#azin').onclick = () => zoomAt(0.7, box.x + box.w / 2, box.y + box.h / 2);
    root.querySelector('#azout').onclick = () => zoomAt(1.4, box.x + box.w / 2, box.y + box.h / 2);
    root.querySelector('#azreset').onclick = () => { const s = own && spots[own.key]; if (s) centerOn(s.x, s.y, 2.1); };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce && svg.pauseAnimations) svg.pauseAnimations();
    const vis = () => { if (!svg.isConnected) { document.removeEventListener('visibilitychange', vis); return; } if (svg.pauseAnimations && svg.unpauseAnimations) { if (document.hidden || reduce) svg.pauseAnimations(); else svg.unpauseAnimations(); } };
    document.addEventListener('visibilitychange', vis);
    const ptrs = new Map(); let dragged = false; let pinch = 0;
    svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragged = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    svg.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId); const cur = [e.clientX, e.clientY]; ptrs.set(e.pointerId, cur);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { const [x, y] = toSvg({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }); zoomAt(pinch / d, x, y); } pinch = d; dragged = true; return; }
      const dx = cur[0] - prev[0]; const dy = cur[1] - prev[1];
      if (Math.abs(dx) + Math.abs(dy) > 1.5) dragged = true;
      const r = svg.getBoundingClientRect(); box.x -= (dx / r.width) * box.w; box.y -= (dy / r.height) * box.h; clampBox(); apply();
    });
    const end = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    const enter = async (key) => {
      const b = data.buildings.find((x) => x.key === key); if (!b) return;
      ctx.ui.cityBuilding = key;
      const { openInterior } = await import('../interior.js');
      openInterior(ctx, b, data);
    };
    on(svg, 'click', '.bld', (e, t) => { if (!dragged) enter(t.dataset.key); });
    on(svg, 'keydown', '.bld', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(t.dataset.key); } });
    on(root, 'click', '[data-focus]', (e, t) => { const s = spots[t.dataset.focus]; if (s) centerOn(s.x, s.y, 2.4); enter(t.dataset.focus); });
    on(root, 'click', '[data-go]', (e, t) => ctx.go(t.dataset.go));
  },
};
