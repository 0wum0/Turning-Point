import { html, icon, money, signed, num, esc } from './ui.js';
import { freightProgress, freightPoint } from './freight-motion.js';
import { project } from './germany.js';

const status = (r) => ({ underway: 'Unterwegs', ready: 'Abfahrt bereit', idle: 'Wartet auf Abfahrt', waiting: 'Wartet · Hochwasser', stopped: 'Angehalten' })[r.status] || 'Wartet auf Abfahrt';
const open = (route, entity, label, glyph) => html`<button class="sim-ops-row" data-sim-open="${route}" data-entity="${entity}">${icon(glyph)}<span>${label}</span>${icon('chevron-right')}</button>`;
const companyRow = (c, v) => open('business', `firm:${c.id}`, html`<b>${c.name}</b><small>${c.city} · ${c.abandoned ? 'Aufgegeben' : `${c.staff} / ${c.needed} Beschäftigte`}</small><em class="${c.profitAll >= 0 ? 'pos' : 'neg'}">${signed(c.profitAll, v.currency)} / Tag</em>`, 'briefcase');
const propertyRow = (p, v) => open('housing', `property:${p.id}`, html`<b>${p.name}</b><small>${p.city} · ${p.rooms} Zimmer · ${Math.round(p.condition)} % Zustand</small><em>${p.residence ? 'Dein Zuhause' : p.lease?.on ? html`${money(p.lease.perDay, v.currency)} Miete / Tag` : 'Eigener Besitz'}</em>`, 'building-2');

export function cityAssets(ctx, id) {
  const v = ctx.view, properties = v.properties.filter((p) => p.cityId === id), companies = v.companies.filter((c) => c.cityId === id);
  if (!properties.length && !companies.length) return '';
  return html`<div class="sim-city-assets"><h4>Dein Besitz vor Ort</h4>${companies.map((c) => companyRow(c, v))}${properties.map((p) => propertyRow(p, v))}</div>`;
}

export function operationsPanel(ctx, data) {
  const v = ctx.view;
  const routes = data.transport?.view?.routes || [];
  const ids = [...new Set([data.here, data.birthCityId, ...v.properties.map((p) => p.cityId), ...v.companies.map((c) => c.cityId)])].filter((id) => ctx.world.cityById.has(id));
  const tab = ['sites', 'firms', 'routes'].includes(ctx.ui.mapOpsTab) ? ctx.ui.mapOpsTab : 'sites';
  const tabs = [['sites', 'Standorte', ids.length], ['firms', 'Betriebe', v.companies.length], ['routes', 'Routen', routes.length]];
  return html`<div class="sim-map-card-head"><b>MEIN IMPERIUM</b><span>${v.city.name}</span></div>
    <div class="sim-ops-summary"><span>Bilanz / Tag<b class="${v.flows.net >= 0 ? 'pos' : 'neg'}">${signed(v.flows.net, v.currency)}</b></span><span>Vermögen<b>${money(v.worth, v.currency)}</b></span></div>
    <nav class="sim-ops-tabs" aria-label="Kartenübersicht">${tabs.map(([key, label, count]) => html`<button type="button" data-ops-tab="${key}" aria-pressed="${tab === key}">${label}<b>${count}</b></button>`)}</nav>
    <div class="sim-map-card-body sim-ops-body">${tab === 'sites' ? html`
      <div class="sim-ops-caption"><span>STANDORT</span><span>HAUS / BETRIEB</span></div>
      ${ids.map((id) => { const c = ctx.world.cityById.get(id), houses = v.properties.filter((p) => p.cityId === id).length, firms = v.companies.filter((p) => p.cityId === id).length;
        return html`<button class="sim-ops-row" data-location="${id}">${icon(id === data.here ? 'home' : 'map-pin')}<span><b>${c.label}</b><small>${id === data.here ? 'Wohnort' : id === data.birthCityId ? 'Geburtsstadt' : c.state}</small></span><strong class="sim-ops-count">${houses} / ${firms}</strong></button>`;
      })}<a class="btn primary block mt" href="#/housing">${icon('building-2')} Immobilien verwalten</a>` : tab === 'firms' ? html`
      ${v.companies.length ? v.companies.map((c) => companyRow(c, v)) : html`<div class="sim-ops-empty">${icon('briefcase')}<b>Dein erster Betrieb</b><p>Gründe ein Unternehmen und baue dir hier ein Netz aus Standorten auf.</p></div>`}
      <a class="btn primary block mt" href="#/business">${icon('briefcase')} Unternehmensverwaltung</a>` : html`
      ${data.transport === null ? html`<p class="dim small" role="status">Routen konnten nicht geladen werden. Öffne die Transportverwaltung, um es erneut zu versuchen.</p>` : data.transport?.enabled === false ? html`<p class="dim small">Handel & Transport ist derzeit nicht verfügbar.</p>` : routes.length ? routes.map((r) => html`<button class="sim-ops-row" data-ops-route="${r.id}">${icon(r.trip ? 'truck' : 'route')}<span><b>${r.fromName} → ${r.toName}</b><small>${r.goodName} · ${status(r)}</small><em>${r.trip ? html`Noch ${r.trip.left} Spieltage` : html`Gewinn ${signed(r.made.profit, v.currency)}`}</em></span>${icon('chevron-right')}</button>`) : html`<div class="sim-ops-empty">${icon('route')}<b>Dein Handelsnetz</b><p>Richte eine Handelsroute ein. Deine Verbindungen und laufenden Fahrten erscheinen anschließend auf der Karte.</p></div>`}
      <a class="btn primary block mt" href="#/trade">${icon('route')} Handel & Transport</a>`}</div>`;
}

export function routePanel(ctx, r) {
  const t = r.trip;
  const progress = t ? Math.max(0, Math.min(100, 100 * (t.days - t.left) / Math.max(1, t.days))) : 0;
  return html`<div class="sim-map-card-head"><button class="btn ghost sm" data-ops-back>${icon('chevron-left')} Übersicht</button><span>HANDELSROUTE</span></div>
    <div class="sim-map-card-body"><div class="sim-route-heading">${icon('route')}<h3>${r.fromName}<small>nach</small>${r.toName}</h3></div>
    <span class="chip ${r.active ? 'good' : 'warn'}">${status(r)}</span>
    ${t ? html`<div class="sim-trip-progress"><progress max="100" value="${progress}" aria-label="Fortschritt der aktuellen Fahrt"></progress><div><span>${t.modeName}</span><b>Noch ${t.left} ${t.left === 1 ? 'Spieltag' : 'Spieltage'}</b></div></div>` : ''}
    <dl class="kv small mt"><dt>Ware</dt><dd>${r.goodName}</dd><dt>Menge / Fahrt</dt><dd>${num(r.qty)} ${r.unit}</dd><dt>Intervall</dt><dd>${r.interval} Tage</dd><dt>Fahrten</dt><dd>${r.made.trips}</dd><dt>Gewinn insgesamt</dt><dd class="${r.made.profit >= 0 ? 'pos' : 'neg'}">${signed(r.made.profit, ctx.view.currency)}</dd></dl>
    <p class="dim small">Die Kartenlinie verbindet Start und Ziel schematisch. Frachtsymbole zeigen den Fortschritt der Spieltage; die laufende Spur kennzeichnet eine aktive Fahrt.</p>
    ${open('trade', `route:${r.id}`, 'Route verwalten', 'settings')}
    <div class="sim-route-places"><button class="btn sm" data-location="${r.from}">${icon('map-pin')} Startort</button><button class="btn sm" data-location="${r.to}">${icon('flag')} Zielort</button></div></div>`;
}

export function routeDrawing(ctx, transport, selected, city, scale) {
  return (transport?.view?.routes || []).map((r) => {
    const a = ctx.world.cityById.get(r.from), b = ctx.world.cityById.get(r.to);
    if (!a || !b) return '';
    const A = project(a.lon, a.lat), B = project(b.lon, b.lat);
    const chosen = r.id === selected || (city != null && (r.from === city || r.to === city));
    // Schematic connection, never a fabricated road or vehicle position.
    const d = `M${A[0]} ${A[1]}L${B[0]} ${B[1]}`;
    const moving = r.status === 'underway' && r.trip && r.trip.left > 0;
    const position = freightPoint(A, B, freightProgress(r.trip, ctx.view.clock, Date.now() - ctx.__viewAt));
    const glyph = { bahn: 'train-front', container: 'ship', luft: 'plane', drohne: 'plane', hyperloop: 'train-front' }[r.mode] || 'truck';
    return `<g class="sim-route-line${moving ? ' underway' : ''}${chosen ? ' selected' : ''}${r.active ? ' active' : ''}" data-map-route="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(`${r.fromName} nach ${r.toName}: ${status(r)}`)}"><path class="sim-route-hit" d="${d}"/><path class="sim-route-stroke" d="${d}"/>${moving ? `<path class="sim-route-flow" d="${d}"/>` : ''}<circle class="sim-route-end" cx="${A[0]}" cy="${A[1]}" r="${4 * scale}"/><circle class="sim-route-end" cx="${B[0]}" cy="${B[1]}" r="${4 * scale}"/>${moving ? `<g class="sim-freight" data-freight="${r.id}" data-scale="${scale}" transform="translate(${position[0]} ${position[1]}) scale(${scale})"><circle class="sim-freight-halo" r="16"/><circle r="10"/><svg x="-7" y="-7" width="14" height="14" viewBox="0 0 24 24"><use href="/img/icons.svg#i-${glyph}"/></svg></g>` : ''}</g>`;
  }).join('');
}


export function animateFreight(svg, ctx, transport) {
  let frame = 0, last = 0, disposed = false;
  const routes = new Map((transport?.view?.routes || []).filter((r) => r.trip && r.status === 'underway').map((r) => [String(r.id), r]));
  if (!routes.size) return () => {};
  const clock = { ...ctx.view.clock }, sampledAt = ctx.__viewAt || Date.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const tick = (now) => {
    if (disposed) return;
    if (now - last >= 80 && !document.hidden && !svg.closest('[inert]') && !reduced.matches && document.documentElement.dataset.motion !== 'off') {
      last = now;
      svg.querySelectorAll('[data-freight]').forEach((el) => {
        const r = routes.get(el.dataset.freight), a = ctx.world.cityById.get(r?.from), b = ctx.world.cityById.get(r?.to);
        if (!a || !b) return;
        const pos = freightPoint(project(a.lon, a.lat), project(b.lon, b.lat), freightProgress(r.trip, clock, Date.now() - sampledAt));
        el.setAttribute('transform', `translate(${pos[0]} ${pos[1]}) scale(${el.dataset.scale})`);
      });
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => { disposed = true; cancelAnimationFrame(frame); };
}
