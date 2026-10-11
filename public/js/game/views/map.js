import { html, raw, icon, money, infoBtn, api, on, toast, num, esc, mount, modal } from '../ui.js';
import { project, VIEW, outlinePath } from '../germany.js';
import { isV2 } from '../design.js';
import { layoutMarkers } from '../map-layout.js';
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
  async load(ctx) { return api('GET', '/api/map'); },
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
        ${simulator ? html`<div class="sim-map-toolbar"><label><input type="checkbox" data-map-owned ${ctx.ui.mapFilter === 'owned' ? 'checked' : ''}> Eigene Standorte</label><label><input type="checkbox" data-map-efs ${ctx.ui.mapShowEfs === false ? '' : 'checked'}> EFS-Funde anzeigen</label><span class="sim-map-efs" id="efsToday">${data.activeEfs.today} / ${data.activeEfs.cap} EFS heute</span></div>` : ''}
        <svg id="germany" class="z1" viewBox="0 0 ${VIEW.w} ${VIEW.h}" preserveAspectRatio="xMidYMid meet" role="application" aria-label="Karte von Deutschland">
          <defs><linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".30"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".10"/></linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g id="vp">${simulator ? html`<g class="sim-geography" aria-hidden="true">${GEOGRAPHY.map((c) => html`<path d="${c.path}" fill="${c.id === '276' ? '#b6c99a' : '#9ab997'}" fill-rule="evenodd" stroke="#e9edc4" stroke-width=".65"/>`)}</g>` : html`<g class="grat">${raw(graticule())}</g><path class="land-glow" d="${outlinePath()}" filter="url(#glow)"/><path class="land" d="${outlinePath()}"/>` }
            <g id="dots"></g>${raw(sparks)}</g>
        </svg>
        <div class="map-legend small dim"><span>${icon('map-pin')} Du wohnst hier</span><span>★ Geburtsstadt (Rückkehr gratis)</span><span><i class="sq"></i> Eigener Besitz</span>${simulator ? html`<span title="Natural Earth · heutige Grenzen als Orientierung">Zahl = Orte · Natural Earth</span>` : ''}</div>
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
    };
    const svg = root.querySelector('#germany'); const vp = svg.querySelector('#vp');
    /* nur sichtbare Orte zeichnen (rund 9.000 Orte): Zoom-Stufe bestimmt, ab welcher Ortsgröße */
    const own = new Set([...data.properties, ...ctx.view.companies].map((p) => p.cityId)); const year = ctx.view.date.year;
    const pts = ctx.world.byPop.filter((c) => c.since <= year).map((c) => ({ c, xy: project(c.lon, c.lat) }));
    const dotsG = svg.querySelector('#dots'); let drawPending = false;
    let kk = 1; let clusters = []; let filter = ctx.ui.mapFilter || 'all'; let disposed = false;
    let cityRequest = 0;
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
        const layout = layoutMarkers(pts, { box, width: svg.clientWidth, height: svg.clientHeight, selected: ctx.ui.mapCity, home: data.here, birth: data.birthCityId, owned: own, filter });
        kk = 1 / layout.scale; clusters = layout.markers;
        dotsG.innerHTML = clusters.map((p, i) => `<g class="sim-marker${p.owned ? ' owned' : ''}${p.c.id === data.here ? ' home' : ''}${p.c.id === ctx.ui.mapCity ? ' selected' : ''}" data-marker="${i}" transform="translate(${p.xy[0]} ${p.xy[1]}) scale(${kk})" tabindex="0" role="button" aria-label="${esc(p.members.length > 1 ? p.members.length + ' Orte bei ' + p.c.label : p.c.label)}"><circle r="15" fill="transparent"/><path class="sim-pin" d="${p.members.length > 1 ? 'M0 7L-5 1a13 13 0 1 1 10 0Z' : 'M0 4C-2 1-8-5-8-10a8 8 0 0 1 16 0c0 5-6 11-8 14Z'}"/>${p.members.length > 1 ? `<text class="sim-cluster-count" y="-7">${p.members.length >= 1000 ? (Math.round(p.members.length / 100) / 10).toLocaleString('de-DE') + 'k' : p.members.length}</text>` : '<circle class="sim-pin-core" cy="-10" r="2.6"/>'}${p.label ? `<text class="sim-marker-label" x="${p.label.dx}" y="${p.label.dy}">${esc(p.label.text)}</text>` : ''}</g>`).join('');
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
    root.__dispose = () => { disposed = true; observer?.disconnect(); };
    root.querySelector('[data-map-owned]')?.addEventListener('change', (e) => { filter = e.target.checked ? 'owned' : 'all'; ctx.ui.mapFilter = filter; scheduleDraw(); });
    root.querySelector('[data-map-efs]')?.addEventListener('change', (e) => { ctx.ui.mapShowEfs = e.target.checked; scheduleDraw(); });
    const ptrs = new Map(); let dragged = false; let pinch = 0;
    svg.addEventListener('pointerdown', (e) => { if (!simulator || !e.target.closest('[data-marker], .pickup')) svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragged = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
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
      ctx.ui.mapCity = id; scheduleDraw();
      const request = ++cityRequest;
      const c = ctx.world.cityById.get(id); if (!c) return;
      const v = ctx.view; const here = id === v.city.id;
      svg.querySelectorAll('.city.sel').forEach((n) => n.classList.remove('sel'));
      const node = svg.querySelector(`.city[data-id="${id}"]`); if (node) node.classList.add('sel');
      const props = v.properties.filter((p) => p.cityId === id);
      let quote = null;
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
            </div>` : html`<div class="skel" style="height:80px"></div>`}</div>`);
      panel.querySelector('[data-portfolio]')?.addEventListener('click', showPortfolio);
      panel.querySelector('#enterCity').onclick = () => { ctx.ui.cityId = id; ctx.ui.cityBox = null; ctx.go('city'); };
      const mv = panel.querySelector('#doMove');
      if (mv) mv.onclick = async () => { const ok = await ctx.confirm({ title: `Nach ${c.name} ziehen?`, text: 'Kosten werden sofort abgebucht. Du verlierst deine Stelle und eine gemietete Wohnung.', ok: 'Umziehen' }); if (ok) { ctx.ui.mapCity = null; await ctx.act('move', { cityId: id }); } };
      const ad = panel.querySelector('#adDiscount');
      if (ad) ad.onclick = async () => { await ctx.watchAd(`discount:move:${id}`); showCity(id); };
    }
    function showPortfolio() {
      ++cityRequest;
      const v = ctx.view;
      const ids = [...new Set([data.here, data.birthCityId, ...own, ...v.companies.map((c) => c.cityId)])];
      mount(panel, html`<div class="sim-map-card-head"><b>MEINE STANDORTE</b><span>${ids.length}</span></div><div class="sim-map-card-body"><div class="sim-map-stats"><div class="sim-map-stat"><span>Immobilien</span><b>${v.properties.length}</b></div><div class="sim-map-stat"><span>Unternehmen</span><b>${v.companies.length}</b></div></div><div class="stack" style="--gap:6px">${ids.map((id) => {
        const c = ctx.world.cityById.get(id); if (!c) return '';
        const count = v.properties.filter((p) => p.cityId === id).length;
        return html`<button class="btn block" data-location="${id}">${icon(id === data.here ? 'home' : 'map-pin')}<span class="grow">${c.label}</span><span>${count || (id === data.birthCityId ? '★' : '')}</span></button>`;
      })}</div><a class="btn primary block mt" href="#/housing">${icon('building-2')} Immobilien verwalten</a><a class="btn block mt" href="#/business">${icon('briefcase')} Unternehmen verwalten</a></div>`);
      panel.querySelectorAll('[data-location]').forEach((b) => { b.onclick = () => focusCity(ctx.world.cityById.get(Number(b.dataset.location))); });
    }
    function pickMarker(index) {
      const p = clusters[index]; if (!p) return;
      if (p.members.length === 1) { showCity(p.c.id); return; }
      const m = modal(html`<h3>${p.members.length} Orte bei ${p.c.label}</h3><p class="dim small">Wähle einen Ort oder vergrößere diesen Kartenausschnitt.</p><button class="btn primary mb" data-cluster-zoom>${icon('plus')} Ausschnitt vergrößern</button><div class="sim-cluster-list">${p.members.map(({ c }) => html`<button class="btn" data-cluster-city="${c.id}"><span>${c.label}</span><small>${own.has(c.id) ? 'Eigener Besitz' : c.state}</small></button>`)}</div>`);
      m.el.querySelector('[data-cluster-zoom]').onclick = () => { m.close(); zoomAt(.5, p.xy[0], p.xy[1]); };
      m.el.querySelectorAll('[data-cluster-city]').forEach((b) => { b.onclick = () => { m.close(); focusCity(ctx.world.cityById.get(Number(b.dataset.clusterCity))); }; });
    }
    on(svg, 'click', '[data-marker]', (e, t) => { if (!dragged) pickMarker(Number(t.dataset.marker)); });
    on(svg, 'keydown', '[data-marker]', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickMarker(Number(t.dataset.marker)); } });
    on(svg, 'click', '.city' , (e, t) => { if (dragged) return; showCity(Number(t.dataset.id)); });
    on(svg, 'dblclick', '.city', (e, t) => { ctx.ui.cityId = Number(t.dataset.id); ctx.ui.cityBox = null; ctx.go('city'); });
    on(svg, 'keydown', '.city', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showCity(Number(t.dataset.id)); } });
    on(svg, 'click', '.pickup', async (e, t) => {
      e.stopPropagation(); if (dragged) return;
      try {
        const r = await ctx.act('collect', { key: t.dataset.key }, { noRender: true });
        t.remove(); data.activeEfs.today += parseInt(String(r.message).replace(/\D/g, ''), 10) || 0;
        root.querySelector('#efsToday').innerHTML = `${icon('zap').__raw} Heute gesammelt: ${data.activeEfs.today} / ${data.activeEfs.cap} EFS`;
      } catch (_) { /* Toast kommt aus act */ }
    });
    on(svg, 'keydown', '.pickup', (e, t) => { if (e.key === 'Enter') t.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    function focusCity(c) { const xy = project(c.lon, c.lat); box.w = simulator ? VIEW.w / 3 : full.w / 4; box.h = box.w * (full.h / full.w); box.x = xy[0] - box.w / 2; box.y = xy[1] - box.h / 2; clampBox(); apply(); showCity(c.id); }
    bindPlaceSearch(root.querySelector('#mapq'), root.querySelector('#mapres'), ctx, { year, onPick: focusCity });
    const initialCollapsed = ctx.ui.mapPanelCollapsed ?? (matchMedia('(max-width:650px)').matches && !ctx.ui.mapCity);
    clampBox(); apply();
    if (simulator && !ctx.ui.mapCity) showPortfolio();
    else showCity(ctx.ui.mapCity || ctx.view.city.id);
    if (simulator && initialCollapsed) {
      ctx.ui.mapPanelCollapsed = true;
      panelToggle.setAttribute('aria-expanded', 'false'); panelToggle.closest('.map-layout').dataset.panelCollapsed = 'true';
    }
  },
};
