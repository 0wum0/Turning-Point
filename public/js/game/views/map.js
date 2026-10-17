import { html, raw, icon, money, infoBtn, api, on, toast, num, esc, mount, modal } from '../ui.js';
import { project, VIEW, outlinePath } from '../germany.js';
import { isV2 } from '../design.js';
import { visitCity } from '../city-context.js';
import { layoutMarkers } from '../map-layout.js';
import { operationsPanel, cityAssets, routePanel, routeDrawing, animateFreight } from '../map-operations.js';
import { GEOGRAPHY } from '../map-geography.js';
import { sceneFor } from './overview.js';
import { bindPlaceSearch, describe, kindOf } from '../places.js';

function graticule() {
  let s = '';
  for (let lon = 6; lon <= 15; lon++) { const [x] = project(lon, 50); s += `<line x1="${x}" y1="0" x2="${x}" y2="${VIEW.h}"/>`; }
  for (let lat = 48; lat <= 55; lat++) { const [, y] = project(10, lat); s += `<line x1="0" y1="${y}" x2="${VIEW.w}" y2="${y}"/>`; }
  return s;
}

export default {
  id: 'map', label: 'Karte', icon: 'map',
  async load(ctx) {
    if (!isV2()) return api('GET', '/api/map');
    const [data, transport] = await Promise.all([api('GET', '/api/map'), api('GET', '/api/transport').catch(() => null)]);
    return { ...data, transport };
  },
  render(ctx, data) {
    const v = ctx.view;
    const simulator = isV2();
    const sparks = data.pickups.map((p) => {
      const c = ctx.world.cityById.get(p.cityId); if (!c) return '';
      const [x, y] = project(c.lon, c.lat);
      return `<g class="pickup" data-key="${p.key}" transform="translate(${(x - 3).toFixed(1)} ${(y - 22).toFixed(1)})" tabindex="0" role="button" aria-label="${p.amount} EFS einsammeln"><circle class="halo" r="12"/><circle r="9"/><text y="3" text-anchor="middle">+${p.amount}</text></g>`;
    }).join('');
    return html`
    <div class="panel-head"><div><h2>Deutschland</h2><p>Wähle eine Stadt. Goldene Funken sind EFS zum Einsammeln.</p></div>
      <div class="row"><span class="chip accent" id="${simulator ? 'classicEfsToday' : 'efsToday'}">${icon('zap')} Heute gesammelt: ${data.activeEfs.today} / ${data.activeEfs.cap} EFS</span>${infoBtn(['Auf der Karte tauchen stündlich neue EFS-Funde auf.', 'Aktive EFS beschleunigen dein Leben – 1 EFS ist 1 Spieltag. Pro Tag gibt es ein Sammel-Limit.', 'Klicke auf die goldenen Funken. Komm später wieder, neue erscheinen jede Stunde.'], 'Karte & EFS')}</div></div>
    <div class="map-layout"><button type="button" class="btn sm sim-map-toggle" aria-controls="mapPanel" aria-expanded="true" title="Stadtinformationen ein-/ausblenden">${icon('map-pin')}<span>${simulator ? 'Standorte' : 'Stadt'}</span></button>
      <section class="card map-card">
        <div class="map-search pl-wrap"><input id="mapq" type="search" placeholder="Ort suchen …" autocomplete="off" aria-label="Ort suchen"><div class="pl-res" id="mapres"></div></div>
        <div class="map-tools"><button class="btn sm" id="zin" aria-label="Vergrößern">${icon('plus')}</button><button class="btn sm" id="zout" aria-label="Verkleinern">${icon('minus')}</button><button class="btn sm" id="zreset" aria-label="Zurücksetzen">${icon('refresh-cw')}</button></div>
        ${simulator ? html`<details class="sim-map-toolbar" ${(ctx.ui.mapFiltersOpen ?? !matchMedia('(max-width:650px)').matches) ? 'open' : ''}><summary>${icon('layers')}<span>Kartenfilter<small class="sim-map-efs" id="efsToday">${data.activeEfs.today} / ${data.activeEfs.cap} EFS heute</small></span>${icon('chevron-down')}</summary><div class="sim-map-filter-options"><label><input type="checkbox" data-map-owned ${ctx.ui.mapFilter === 'owned' ? 'checked' : ''}> Eigene Standorte</label><label><input type="checkbox" data-map-efs ${ctx.ui.mapShowEfs === false ? '' : 'checked'}> EFS-Funde anzeigen</label><label><input type="checkbox" data-map-routes ${ctx.ui.mapShowRoutes === false ? '' : 'checked'}> Handelsrouten</label></div></details>` : ''}
        <svg id="germany" class="z1" viewBox="0 0 ${VIEW.w} ${VIEW.h}" preserveAspectRatio="xMidYMid meet" role="application" aria-label="Karte von Deutschland">
          <defs><linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".30"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".10"/></linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g id="vp">${simulator ? html`<g class="sim-geography" aria-hidden="true">${GEOGRAPHY.map((c) => html`<path d="${c.path}" fill="${c.id === '276' ? '#b6c99a' : '#9ab997'}" fill-rule="evenodd" stroke="#e9edc4" stroke-width=".65"/>`)}</g>` : html`<g class="grat">${raw(graticule())}</g><path class="land-glow" d="${outlinePath()}" filter="url(#glow)"/><path class="land" d="${outlinePath()}"/>` }
            ${simulator ? html`<g id="sim-routes"></g>` : ''}<g id="dots"></g>${raw(sparks)}</g>
        </svg>
        <div class="map-legend small dim"><span>${icon('map-pin')} Du wohnst hier</span><span>★ Geburtsstadt (Rückkehr gratis)</span><span><i class="sq"></i> Eigener Besitz</span>${simulator ? html`<span title="Natural Earth · heutige Grenzen als Orientierung">Zahl = Orte · Routen schematisch · Natural Earth</span>` : ''}</div>
      </section>
      <aside class="card map-panel" id="mapPanel"><div class="dim">Wähle eine Stadt auf der Karte.</div></aside>
    </div>`;
  },
  bind(root, ctx, data) {
    const simulator = isV2();
    const panelToggle = root.querySelector('.sim-map-toggle');
    panelToggle.onclick = () => {
      const collapsed = panelToggle.getAttribute('aria-expanded') === 'true';
      if (simulator) ctx.ui.mapPanelCollapsed = collapsed;
      panelToggle.setAttribute('aria-expanded', String(!collapsed));
      panelToggle.closest('.map-layout').dataset.panelCollapsed = String(collapsed);
      if (simulator) scheduleDraw();
    };
    const svg = root.querySelector('#germany'); const vp = svg.querySelector('#vp');
    /* nur sichtbare Orte zeichnen (rund 9.000 Orte): Zoom-Stufe bestimmt, ab welcher Ortsgröße */
    const own = new Set([...data.properties, ...ctx.view.companies].map((p) => p.cityId)); const year = ctx.view.date.year;
    const pts = ctx.world.byPop.filter((c) => c.since <= year).map((c) => ({ c, xy: project(c.lon, c.lat) }));
    const labelMeasure = document.createElement('canvas').getContext('2d');
    if (labelMeasure) labelMeasure.font = `600 12px ${getComputedStyle(root).fontFamily}`;
    const dotsG = svg.querySelector('#dots'); let drawPending = false;
    let kk = 1; let clusters = []; let filter = ctx.ui.mapFilter || 'all'; let disposed = false;
    let cityRequest = 0;
    let clusterCache = null, clusterKey = '', routesKey = '';
    const markerNodes = new Map();
    const setAttr = (node, name, value) => { if (node.getAttribute(name) !== String(value)) node.setAttribute(name, value); };
    function reconcileMarkers() {
      const retained = new Set();
      clusters.forEach((p, i) => {
        const id = p.c.id; retained.add(id);
        let entry = markerNodes.get(id);
        if (!entry) {
          const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          node.innerHTML = '<g class="sim-marker-symbol"></g><g class="sim-place-label"></g>';
          node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button');
          entry = { node, symbol: node.firstElementChild, label: node.lastElementChild };
          markerNodes.set(id, entry); dotsG.appendChild(node);
        }
        const { node, symbol, label } = entry;
        setAttr(node, 'class', `sim-marker${p.owned ? ' owned' : ''}${id === data.here ? ' home' : ''}${id === ctx.ui.mapCity ? ' selected' : ''}`);
        setAttr(node, 'data-marker', i); setAttr(node, 'data-city-id', id);
        setAttr(node, 'transform', `translate(${p.xy[0]} ${p.xy[1]}) scale(${kk})`);
        setAttr(node, 'aria-label', p.members.length > 1 ? p.members.length + ' Orte bei ' + p.c.label : p.c.label);
        const count = p.members.length;
        if (entry.count !== count) {
          symbol.innerHTML = `<circle r="15" fill="transparent"/><path class="sim-pin" d="${count > 1 ? 'M0 0L-5-6a12 12 0 1 1 10 0Z' : 'M0 0C-2-3-8-9-8-14a8 8 0 0 1 16 0c0 5-6 11-8 14Z'}"/>${count > 1 ? `<text class="sim-cluster-count" y="-13">${count >= 1000 ? (Math.round(count / 100) / 10).toLocaleString('de-DE') + 'k' : count}</text>` : '<circle class="sim-pin-core" cy="-14" r="2.6"/>'}`;
          entry.count = count;
        }
        const labelHtml = p.label ? `<path class="sim-label-leader" d="M0 0H${Math.round(p.label.edge)}"/><circle class="sim-place-anchor" r="2.5"/><rect class="sim-label-plate" x="${Math.round(p.label.rect.x - p.sx)}" y="-10" width="${p.label.rect.w}" height="20" rx="3"/><text class="sim-marker-label" x="${Math.round(p.label.dx)}" y="${p.label.dy}">${esc(p.label.text)}</text>` : '';
        if (entry.labelHtml !== labelHtml) { label.innerHTML = labelHtml; entry.labelHtml = labelHtml; }
        if (p.label) setAttr(label, 'data-label-city', id);
        else label.removeAttribute('data-label-city');
      });
      for (const [id, entry] of markerNodes) if (!retained.has(id)) { entry.node.remove(); markerNodes.delete(id); }
    }
    const dotHtml = (c, xy) => {
      const [x, y] = xy; const r = 2.6 + c.tier * 1.05; const here = c.id === data.here;
      return `<g class="city t${c.tier}${here ? ' here' : ''}${c.id === ctx.ui.mapCity ? ' sel' : ''}" data-id="${c.id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${kk})" tabindex="0" role="button" aria-label="${esc(c.label)}">
        ${here ? `<circle class="pulse-ring" r="${r + 8}"/>` : ''}<circle class="hit" r="${r + 7}"/><circle class="dot" r="${r}"/>
        ${c.id === data.birthCityId ? '<text class="glyph" y="-' + (r + 4) + '" text-anchor="middle">★</text>' : ''}
        ${own.has(c.id) ? `<rect class="own" x="${r + 2}" y="-${r + 2}" width="6" height="6" rx="1.2"/>` : ''}
        <text class="lbl" x="${r + 5}" y="3.5">${esc(c.name.split(' ')[0])}</text></g>`;
    };
    function drawDots() {
      drawPending = false;
      if (disposed || !svg.isConnected) return;
      if (simulator) {
        const bounds = svg.getBoundingClientRect();
        const excluded = [...document.querySelectorAll('#sim-world .map-search, #sim-world .map-tools, #sim-world .sim-map-toolbar, #sim-world .sim-map-toggle, #sim-world .map-legend, #sim-world #mapPanel, #side')].filter((el) => el.getClientRects().length).map((el) => { const b = el.getBoundingClientRect(); return { x: b.left - bounds.left - 4, y: b.top - bounds.top - 4, w: b.width + 8, h: b.height + 8 }; });
        const key = [svg.clientWidth, svg.clientHeight, box.w, box.h, ctx.ui.mapCity, filter].join(':');
        const layout = layoutMarkers(pts, { groups: key === clusterKey ? clusterCache : undefined, box, width: svg.clientWidth, height: svg.clientHeight, selected: ctx.ui.mapCity, home: data.here, birth: data.birthCityId, owned: own, filter, excluded, measure: labelMeasure ? (text) => labelMeasure.measureText(text).width : undefined });
        clusterKey = key; clusterCache = layout.groups;
        kk = 1 / layout.scale; clusters = layout.markers;
        const nextRoutesKey = [kk, ctx.ui.mapShowRoutes, ctx.ui.mapRoute, ctx.ui.mapCity].join(':');
        if (nextRoutesKey !== routesKey) {
          svg.querySelector('#sim-routes').innerHTML = ctx.ui.mapShowRoutes === false ? '' : routeDrawing(ctx, data.transport, ctx.ui.mapRoute, ctx.ui.mapCity, kk);
          routesKey = nextRoutesKey;
        }
        reconcileMarkers();
      } else {
      const z = full.w / box.w; const minTier = z < 1.5 ? 3 : z < 3 ? 2 : 1; const pad = 24; const out = []; kk = Math.max(0.2, Math.min(1, box.w / full.w * 1.15));
      for (const p of pts) {
        const c = p.c; const [x, y] = p.xy;
        const must = c.id === data.here || c.id === ctx.ui.mapCity || c.id === data.birthCityId || own.has(c.id);
        if (!must) { if (c.tier < minTier || x < box.x - pad || x > box.x + box.w + pad || y < box.y - pad || y > box.y + box.h + pad) continue; }
        out.push(dotHtml(c, p.xy)); if (out.length > 800) break;
      }
      dotsG.innerHTML = out.join('');
      }
      svg.querySelectorAll('.pickup').forEach((n) => { if (!n.dataset.tx) { const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(n.getAttribute('transform')); n.dataset.tx = m[1]; n.dataset.ty = m[2]; } n.setAttribute('transform', `translate(${n.dataset.tx} ${n.dataset.ty}) scale(${kk})`); if (simulator) n.style.display = ctx.ui.mapShowEfs === false ? 'none' : ''; });
    }
    function scheduleDraw() { if (!drawPending) { drawPending = true; requestAnimationFrame(drawDots); } }
    function fullBox() {
      if (!simulator) return { x: 0, y: 0, w: VIEW.w, h: VIEW.h };
      const ratio = svg.clientWidth / Math.max(1, svg.clientHeight);
      const h = Math.max(VIEW.h + 90, (VIEW.w + 60) / ratio), w = h * ratio;
      return { x: (VIEW.w - w) / 2, y: (VIEW.h - h) / 2, w, h };
    }
    let full = fullBox(); let box = { ...(simulator && ctx.ui.mapBox || full) };
    const apply = () => { if (simulator) ctx.ui.mapBox = { ...box }; svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`); scheduleDraw(); const z = full.w / box.w; svg.setAttribute('class', z < 1.5 ? 'z1' : z < 2.8 ? 'z2' : z < 4.5 ? 'z3' : 'z4'); };
    const clampBox = () => {
      if (simulator) {
        box.w = Math.max(VIEW.w / 20, Math.min(full.w, box.w)); box.h = box.w * full.h / full.w;
        box.x = Math.max(full.x - 40, Math.min(full.x + full.w - box.w + 40, box.x));
        box.y = Math.max(full.y - 40, Math.min(full.y + full.h - box.h + 40, box.y)); return;
      }
      box.w = Math.max(full.w / 7, Math.min(full.w, box.w)); box.h = box.w * (full.h / full.w); box.x = Math.max(-40, Math.min(full.w - box.w + 40, box.x)); box.y = Math.max(-40, Math.min(full.h - box.h + 40, box.y)); };
    const zoomAt = (f, cx, cy) => { const nx = box.x + (cx - box.x) * (1 - f); const ny = box.y + (cy - box.y) * (1 - f); box.x = nx; box.y = ny; box.w *= f; box.h *= f; clampBox(); apply(); };
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); const s = Math.max(box.w / r.width, box.h / r.height); const ox = (r.width - box.w / s) / 2; const oy = (r.height - box.h / s) / 2; return [box.x + (e.clientX - r.left - ox) * s, box.y + (e.clientY - r.top - oy) * s, s]; };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = toSvg(e); zoomAt(e.deltaY < 0 ? 0.85 : 1.18, x, y); }, { passive: false });
    root.querySelector('#zin').onclick = () => zoomAt(0.7, box.x + box.w / 2, box.y + box.h / 2);
    root.querySelector('#zout').onclick = () => zoomAt(1.4, box.x + box.w / 2, box.y + box.h / 2);
    root.querySelector('#zreset').onclick = () => { box = { ...full }; apply(); };
    const resize = () => {
      if (!simulator || disposed) return;
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2, z = full.h / box.h;
      full = fullBox(); box.h = full.h / z; box.w = box.h * full.w / full.h;
      box.x = cx - box.w / 2; box.y = cy - box.h / 2; clampBox(); apply();
    };
    const observer = simulator ? new ResizeObserver(resize) : null; observer?.observe(svg);
    const obstacles = simulator ? new ResizeObserver(scheduleDraw) : null;
    root.querySelectorAll('#mapPanel, .sim-map-toolbar, .map-legend').forEach((el) => obstacles?.observe(el));
    root.querySelector('.sim-map-toolbar')?.addEventListener('toggle', (e) => { ctx.ui.mapFiltersOpen = e.target.open; scheduleDraw(); });
    const stopFreight = simulator ? animateFreight(svg, ctx, data.transport) : null;
    root.__dispose = () => { disposed = true; observer?.disconnect(); obstacles?.disconnect(); stopFreight?.(); };
    root.querySelector('[data-map-owned]')?.addEventListener('change', (e) => { filter = e.target.checked ? 'owned' : 'all'; ctx.ui.mapFilter = filter; scheduleDraw(); });
    root.querySelector('[data-map-efs]')?.addEventListener('change', (e) => { ctx.ui.mapShowEfs = e.target.checked; scheduleDraw(); });
    root.querySelector('[data-map-routes]')?.addEventListener('change', (e) => { ctx.ui.mapShowRoutes = e.target.checked; scheduleDraw(); });
    const ptrs = new Map(); let dragged = false; let pinch = 0;
    svg.addEventListener('pointerdown', (e) => { if (!simulator || !e.target.closest('[data-marker], [data-map-route], .pickup')) svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragged = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    svg.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId); const cur = [e.clientX, e.clientY]; ptrs.set(e.pointerId, cur);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { const [x, y] = toSvg({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }); zoomAt(pinch / d, x, y); } pinch = d; dragged = true; return; }
      const dx = cur[0] - prev[0]; const dy = cur[1] - prev[1];
      if (Math.abs(dx) + Math.abs(dy) > 1) { dragged = true; if (simulator) svg.setPointerCapture(e.pointerId); }
      const r = svg.getBoundingClientRect(); const s = Math.max(box.w / r.width, box.h / r.height);
      box.x -= dx * s; box.y -= dy * s; clampBox(); apply();
    });
    const end = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);

    const panel = root.querySelector('#mapPanel');
    async function showCity(id) {
      if (simulator) ctx.ui.mapPanelCollapsed = false;
      panelToggle.setAttribute('aria-expanded', 'true');
      panelToggle.closest('.map-layout').dataset.panelCollapsed = 'false';
      ctx.ui.mapCity = id; window.dispatchEvent(new Event('tp-map-city')); ctx.ui.mapRoute = null; scheduleDraw();
      const request = ++cityRequest;
      const c = ctx.world.cityById.get(id); if (!c) return;
      const v = ctx.view; const here = id === v.city.id;
      svg.querySelectorAll('.city.sel').forEach((n) => n.classList.remove('sel'));
      const node = svg.querySelector(`.city[data-id="${id}"]`); if (node) node.classList.add('sel');
      const props = v.properties.filter((p) => p.cityId === id);
      let quote = null;
      if (simulator && !here) mount(panel, html`<div class="sim-map-card-head"><button class="btn ghost sm" data-ops-back>${icon('chevron-left')} Übersicht</button><span>STADT</span></div><div class="sim-map-card-body" role="status"><h3>${c.label}</h3><p class="dim small">Stadtinformationen werden geladen …</p></div>`);
      if (!here) { try { quote = (await api('GET', `/api/move-quote?cityId=${id}`)).quote; } catch (_) { /* ignore */ } }
      if (request !== cityRequest || disposed) return;
      const cur = v.currency;
      mount(panel, html`
        ${simulator ? html`<div class="sim-map-card-head"><button class="btn ghost sm" data-portfolio>${icon('chevron-left')} Standorte</button><span>STADT</span></div>` : ''}
        <div class="${simulator ? 'sim-map-card-body' : ''}">
        <div class="city-hero">${sceneFor(ctx, id, props)}</div>
        <h3 class="serif" style="margin-top:1rem">${c.label}</h3>
        <div class="dim small">${c.state} · ${kindOf(c)}${c.pop ? ' · ' + num(c.pop) + ' Einwohner' : ''}${c.since > 1945 ? ' · seit ' + c.since : ''}</div>
        <p class="dim small" style="margin:.6rem 0">${describe(c)}</p>
        <div class="row small">${id === data.birthCityId ? html`<span class="chip accent">★ Geburtsstadt</span>` : ''}${c.factor >= 1.1 ? html`<span class="chip warn">teuer</span>` : c.factor <= 0.88 ? html`<span class="chip good">günstig</span>` : ''}${props.length ? html`<span class="chip good">${props.length} eigene Immobilie(n)</span>` : ''}</div>
        ${simulator ? cityAssets(ctx, id) : ''}
        <button class="btn primary block mt" id="enterCity">${icon('building-2')} Stadt ansehen</button>
        <hr>
        ${here ? html`<div class="alert good">${icon('map-pin')}<div>Hier wohnst du.</div></div>`
          : quote ? html`<dl class="kv small"><dt>Entfernung</dt><dd>${num(quote.km)} km</dd>
              <dt>Umzugskosten</dt><dd>${quote.free ? 'kostenlos' : money(quote.money, cur)}</dd>
              <dt>Coins ${infoBtn(['Ein Umzug kostet Geld und Coins – nur die Rückkehr in deine Geburtsstadt ist immer gratis.', 'Der Coin-Preis richtet sich nach der Entfernung zur nächsten eigenen Position. Jede freiwillige Werbung halbiert ihn: 50 → 25 → 13 → 7 → 4 → 2 → 1.', 'Sieh Werbung an oder spare Coins (z. B. durch Kinder).'], 'Coin-Preis')}</dt><dd>${quote.free || !quote.baseCoins ? '–' : quote.coins === quote.baseCoins ? quote.coins : html`<s class="faint">${quote.baseCoins}</s> ${quote.coins}`}</dd></dl>
            <div class="alert warn small mt">${icon('triangle-alert')}<div>Beim Umzug verlierst du Mietvertrag und Stelle. Eigene Immobilien am Zielort beziehst du automatisch.</div></div>
            <div class="stack mt" style="--gap:.5rem">
              ${quote.coins > 1 && ctx.world.adsEnabled ? html`<button class="btn block" id="adDiscount">${icon('circle-play')} Werbung ansehen · Coin-Preis halbieren</button>` : ''}
              <button class="btn primary block" id="doMove" ${(v.money < quote.money || ctx.coins < quote.coins) ? 'disabled' : ''}>${icon('truck')} Umziehen</button>
              ${(v.money < quote.money || ctx.coins < quote.coins) ? html`<div class="small neg">${v.money < quote.money ? 'Es fehlt Geld. ' : ''}${ctx.coins < quote.coins ? 'Es fehlen Coins (du hast ' + ctx.coins + ').' : ''}</div>` : ''}
            </div>` : html`<p class="dim small" role="status">Umzugskosten konnten nicht geladen werden.</p><button class="btn block" data-move-retry>Erneut versuchen</button>`}</div>`);
      panel.querySelector('[data-portfolio]')?.addEventListener('click', showPortfolio);
      panel.querySelector('#enterCity').onclick = () => visitCity(ctx, id, simulator);
      panel.querySelector('[data-move-retry]')?.addEventListener('click', () => showCity(id));
      const mv = panel.querySelector('#doMove');
      if (mv) mv.onclick = async () => { const ok = await ctx.confirm({ title: `Nach ${c.name} ziehen?`, text: 'Kosten werden sofort abgebucht. Du verlierst deine Stelle und eine gemietete Wohnung.', ok: 'Umziehen' }); if (ok) { ctx.ui.mapCity = null; await ctx.act('move', { cityId: id }); } };
      const ad = panel.querySelector('#adDiscount');
      if (ad) ad.onclick = async () => { await ctx.watchAd(`discount:move:${id}`); showCity(id); };
    }
    function showPortfolio() {
      ++cityRequest; ctx.ui.mapRoute = null; ctx.ui.mapCity = null; scheduleDraw();
      mount(panel, operationsPanel(ctx, data));
    }
    function showRoute(id) {
      const route = data.transport?.view?.routes?.find((r) => String(r.id) === String(id));
      if (!route) return;
      ++cityRequest; ctx.ui.mapRoute = route.id; ctx.ui.mapCity = null;
      ctx.ui.mapPanelCollapsed = false;
      panelToggle.setAttribute('aria-expanded', 'true');
      panelToggle.closest('.map-layout').dataset.panelCollapsed = 'false';
      mount(panel, routePanel(ctx, route)); scheduleDraw();
    }
    on(panel, 'click', '[data-ops-tab]', (e, b) => { ctx.ui.mapOpsTab = b.dataset.opsTab; showPortfolio(); });
    on(panel, 'click', '[data-location]', (e, b) => { const c = ctx.world.cityById.get(Number(b.dataset.location)); if (c) focusCity(c); });
    on(panel, 'click', '[data-ops-route]', (e, b) => { showRoute(b.dataset.opsRoute); });
    on(panel, 'click', '[data-ops-back]', showPortfolio);
    on(panel, 'click', '[data-sim-open]', (e, b) => {
      ctx.ui.simFocus = { route: b.dataset.simOpen, entity: b.dataset.entity };
      ctx.go(b.dataset.simOpen);
    });
    on(svg, 'click', '[data-map-route]', (e, b) => { if (!dragged) showRoute(b.dataset.mapRoute); });
    on(svg, 'keydown', '[data-map-route]', (e, b) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showRoute(b.dataset.mapRoute); } });
    function pickMarker(index) {
      const p = clusters[index]; if (!p) return;
      if (p.members.length === 1) { visitCity(ctx, p.c.id, simulator); return; }
      const m = modal(html`<h3>${p.members.length} Orte bei ${p.c.label}</h3><p class="dim small">Wähle einen Ort oder vergrößere diesen Kartenausschnitt.</p><button class="btn primary mb" data-cluster-zoom>${icon('plus')} Ausschnitt vergrößern</button><div class="sim-cluster-list">${p.members.map(({ c }) => html`<button class="btn" data-cluster-city="${c.id}"><span>${c.label}</span><small>${own.has(c.id) ? 'Eigener Besitz' : c.state}</small></button>`)}</div>`);
      m.el.querySelector('[data-cluster-zoom]').onclick = () => { m.close(); zoomAt(.5, p.xy[0], p.xy[1]); };
      m.el.querySelectorAll('[data-cluster-city]').forEach((b) => { b.onclick = () => { m.close(); focusCity(ctx.world.cityById.get(Number(b.dataset.clusterCity))); }; });
    }
    on(svg, 'click', '[data-marker]', (e, t) => { if (dragged) return; const label = e.target.closest('[data-label-city]'); if (label) visitCity(ctx, Number(label.dataset.labelCity), true); else pickMarker(Number(t.dataset.marker)); });
    on(svg, 'keydown', '[data-marker]', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickMarker(Number(t.dataset.marker)); } });
    on(svg, 'click', '.city' , (e, t) => { if (dragged) return; showCity(Number(t.dataset.id)); });
    on(svg, 'dblclick', '.city', (e, t) => { ctx.ui.cityId = Number(t.dataset.id); ctx.ui.cityBox = null; ctx.go('city'); });
    on(svg, 'keydown', '.city', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showCity(Number(t.dataset.id)); } });
    on(svg, 'click', '.pickup', async (e, t) => {
      e.stopPropagation(); if (dragged) return;
      try {
        const r = await ctx.act('collect', { key: t.dataset.key }, { noRender: true });
        t.remove(); data.activeEfs.today += parseInt(String(r.message).replace(/\D/g, ''), 10) || 0;
        root.querySelector('#efsToday').innerHTML = simulator ? `${data.activeEfs.today} / ${data.activeEfs.cap} EFS heute` : `${icon('zap').__raw} Heute gesammelt: ${data.activeEfs.today} / ${data.activeEfs.cap} EFS`;
      } catch (_) { /* Toast kommt aus act */ }
    });
    on(svg, 'keydown', '.pickup', (e, t) => { if (e.key === 'Enter') t.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    function focusCity(c) { const xy = project(c.lon, c.lat); box.w = simulator ? VIEW.w / 3 : full.w / 4; box.h = box.w * (full.h / full.w); box.x = xy[0] - box.w / 2; box.y = xy[1] - box.h / 2; clampBox(); apply(); if (simulator) { ctx.ui.mapCity = c.id; ctx.ui.mapPanelCollapsed = false; visitCity(ctx, c.id, true); } else showCity(c.id); }
    bindPlaceSearch(root.querySelector('#mapq'), root.querySelector('#mapres'), ctx, { year, onPick: focusCity });
    const initialCollapsed = ctx.ui.mapPanelCollapsed ?? (matchMedia('(max-width:650px)').matches && !ctx.ui.mapCity);
    clampBox(); apply();
    if (simulator && ctx.ui.mapRoute && data.transport?.view?.routes?.some((r) => r.id === ctx.ui.mapRoute)) showRoute(ctx.ui.mapRoute);
    else if (simulator && !ctx.ui.mapCity) showPortfolio();
    else showCity(ctx.ui.mapCity || ctx.view.city.id);
    if (simulator && initialCollapsed) {
      ctx.ui.mapPanelCollapsed = true;
      panelToggle.setAttribute('aria-expanded', 'false'); panelToggle.closest('.map-layout').dataset.panelCollapsed = 'true';
    }
  },
};
