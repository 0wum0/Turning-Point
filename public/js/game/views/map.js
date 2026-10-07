import { html, raw, icon, money, infoBtn, api, on, toast, num, esc, mount } from '../ui.js';
import { OUTLINE, project, VIEW, outlinePath } from '../germany.js';
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
    const cities = ctx.world.cities;
    const own = new Set(data.properties.map((p) => p.cityId));
    const sparks = data.pickups.map((p) => {
      const c = ctx.world.cityById.get(p.cityId); if (!c) return '';
      const [x, y] = project(c.lon, c.lat);
      return `<g class="pickup" data-key="${p.key}" transform="translate(${(x - 3).toFixed(1)} ${(y - 22).toFixed(1)})" tabindex="0" role="button" aria-label="${p.amount} EFS einsammeln"><circle class="halo" r="12"/><circle r="9"/><text y="3" text-anchor="middle">+${p.amount}</text></g>`;
    }).join('');
    return html`
    <div class="panel-head"><div><h2>Deutschland</h2><p>Wähle eine Stadt. Goldene Funken sind EFS zum Einsammeln.</p></div>
      <div class="row"><span class="chip accent" id="efsToday">${icon('zap')} Heute gesammelt: ${data.activeEfs.today} / ${data.activeEfs.cap} EFS</span>${infoBtn(['Auf der Karte tauchen stündlich neue EFS-Funde auf.', 'Aktive EFS beschleunigen dein Leben – 1 EFS ist 1 Spieltag. Pro Tag gibt es ein Sammel-Limit.', 'Klicke auf die goldenen Funken. Komm später wieder, neue erscheinen jede Stunde.'], 'Karte & EFS')}</div></div>
    <div class="map-layout">
      <section class="card map-card">
        <div class="map-search pl-wrap"><input id="mapq" type="search" placeholder="Ort suchen …" autocomplete="off" aria-label="Ort suchen"><div class="pl-res" id="mapres"></div></div>
        <div class="map-tools"><button class="btn sm" id="zin" aria-label="Vergrößern">${icon('plus')}</button><button class="btn sm" id="zout" aria-label="Verkleinern">${icon('minus')}</button><button class="btn sm" id="zreset" aria-label="Zurücksetzen">${icon('refresh-cw')}</button></div>
        <svg id="germany" class="z1" viewBox="0 0 ${VIEW.w} ${VIEW.h}" preserveAspectRatio="xMidYMid meet" role="application" aria-label="Karte von Deutschland">
          <defs><linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".30"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".10"/></linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g id="vp"><g class="grat">${raw(graticule())}</g>
            <path class="land-glow" d="${outlinePath()}" filter="url(#glow)"/><path class="land" d="${outlinePath()}"/>
            <g id="dots"></g>${raw(sparks)}</g>
        </svg>
        <div class="map-legend small dim"><span>${icon('map-pin')} Du wohnst hier</span><span>★ Geburtsstadt (Rückkehr gratis)</span><span><i class="sq"></i> Eigener Besitz</span></div>
      </section>
      <aside class="card map-panel" id="mapPanel"><div class="dim">Wähle eine Stadt auf der Karte.</div></aside>
    </div>`;
  },
  bind(root, ctx, data) {
    const svg = root.querySelector('#germany'); const vp = svg.querySelector('#vp');
    /* nur sichtbare Orte zeichnen (rund 9.000 Orte): Zoom-Stufe bestimmt, ab welcher Ortsgröße */
    const own = new Set(data.properties.map((p) => p.cityId)); const year = ctx.view.date.year;
    const pts = ctx.world.byPop.filter((c) => c.since <= year).map((c) => ({ c, xy: project(c.lon, c.lat) }));
    const dotsG = svg.querySelector('#dots'); let drawPending = false;
    let kk = 1;
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
      const z = full.w / box.w; const minTier = z < 1.5 ? 3 : z < 3 ? 2 : 1; const pad = 24; const out = []; kk = Math.max(0.2, Math.min(1, box.w / full.w * 1.15));
      for (const p of pts) {
        const c = p.c; const [x, y] = p.xy;
        const must = c.id === data.here || c.id === ctx.ui.mapCity || c.id === data.birthCityId || own.has(c.id);
        if (!must) { if (c.tier < minTier || x < box.x - pad || x > box.x + box.w + pad || y < box.y - pad || y > box.y + box.h + pad) continue; }
        out.push(dotHtml(c, p.xy)); if (out.length > 800) break;
      }
      dotsG.innerHTML = out.join('');
      svg.querySelectorAll('.pickup').forEach((n) => { if (!n.dataset.tx) { const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(n.getAttribute('transform')); n.dataset.tx = m[1]; n.dataset.ty = m[2]; } n.setAttribute('transform', `translate(${n.dataset.tx} ${n.dataset.ty}) scale(${kk})`); });
    }
    function scheduleDraw() { if (!drawPending) { drawPending = true; requestAnimationFrame(drawDots); } }
    const full = { x: 0, y: 0, w: VIEW.w, h: VIEW.h }; let box = { ...full };
    const apply = () => { svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`); scheduleDraw(); const z = full.w / box.w; svg.setAttribute('class', z < 1.5 ? 'z1' : z < 2.8 ? 'z2' : z < 4.5 ? 'z3' : 'z4'); };
    const clampBox = () => { box.w = Math.max(full.w / 7, Math.min(full.w, box.w)); box.h = box.w * (full.h / full.w); box.x = Math.max(-40, Math.min(full.w - box.w + 40, box.x)); box.y = Math.max(-40, Math.min(full.h - box.h + 40, box.y)); };
    const zoomAt = (f, cx, cy) => { const nx = box.x + (cx - box.x) * (1 - f); const ny = box.y + (cy - box.y) * (1 - f); box.x = nx; box.y = ny; box.w *= f; box.h *= f; clampBox(); apply(); };
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); const s = Math.max(box.w / r.width, box.h / r.height); const ox = (r.width - box.w / s) / 2; const oy = (r.height - box.h / s) / 2; return [box.x + (e.clientX - r.left - ox) * s, box.y + (e.clientY - r.top - oy) * s, s]; };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = toSvg(e); zoomAt(e.deltaY < 0 ? 0.85 : 1.18, x, y); }, { passive: false });
    root.querySelector('#zin').onclick = () => zoomAt(0.7, box.x + box.w / 2, box.y + box.h / 2);
    root.querySelector('#zout').onclick = () => zoomAt(1.4, box.x + box.w / 2, box.y + box.h / 2);
    root.querySelector('#zreset').onclick = () => { box = { ...full }; apply(); };
    const ptrs = new Map(); let dragged = false; let pinch = 0;
    svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragged = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    svg.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId); const cur = [e.clientX, e.clientY]; ptrs.set(e.pointerId, cur);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { const [x, y] = toSvg({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }); zoomAt(pinch / d, x, y); } pinch = d; dragged = true; return; }
      const dx = cur[0] - prev[0]; const dy = cur[1] - prev[1];
      if (Math.abs(dx) + Math.abs(dy) > 1) dragged = true;
      const r = svg.getBoundingClientRect(); const s = Math.max(box.w / r.width, box.h / r.height);
      box.x -= dx * s; box.y -= dy * s; clampBox(); apply();
    });
    const end = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);

    const panel = root.querySelector('#mapPanel');
    async function showCity(id) {
      ctx.ui.mapCity = id;
      const c = ctx.world.cityById.get(id); if (!c) return;
      const v = ctx.view; const here = id === v.city.id;
      svg.querySelectorAll('.city.sel').forEach((n) => n.classList.remove('sel'));
      const node = svg.querySelector(`.city[data-id="${id}"]`); if (node) node.classList.add('sel');
      const props = v.properties.filter((p) => p.cityId === id);
      let quote = null;
      if (!here) { try { quote = (await api('GET', `/api/move-quote?cityId=${id}`)).quote; } catch (_) { /* ignore */ } }
      const cur = v.currency;
      mount(panel, html`
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
            </div>` : html`<div class="skel" style="height:80px"></div>`}`);
      panel.querySelector('#enterCity').onclick = () => { ctx.ui.cityId = id; ctx.ui.cityBox = null; ctx.go('city'); };
      const mv = panel.querySelector('#doMove');
      if (mv) mv.onclick = async () => { const ok = await ctx.confirm({ title: `Nach ${c.name} ziehen?`, text: 'Kosten werden sofort abgebucht. Du verlierst deine Stelle und eine gemietete Wohnung.', ok: 'Umziehen' }); if (ok) { ctx.ui.mapCity = null; await ctx.act('move', { cityId: id }); } };
      const ad = panel.querySelector('#adDiscount');
      if (ad) ad.onclick = async () => { await ctx.watchAd(`discount:move:${id}`); showCity(id); };
    }
    on(svg, 'click', '.city', (e, t) => { if (dragged) return; showCity(Number(t.dataset.id)); });
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
    function focusCity(c) { const xy = project(c.lon, c.lat); box.w = full.w / 4; box.h = box.w * (full.h / full.w); box.x = xy[0] - box.w / 2; box.y = xy[1] - box.h / 2; clampBox(); apply(); showCity(c.id); }
    bindPlaceSearch(root.querySelector('#mapq'), root.querySelector('#mapres'), ctx, { year, onPick: focusCity });
    apply();
    showCity(ctx.ui.mapCity || ctx.view.city.id);
  },
};
