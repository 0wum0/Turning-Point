/* Handel & Transport: Handelsrouten zwischen Städten, Beste Route finden, Fracht und Speditionen, Verkehrspolitik.
 * Zahlen stehen in eigenen Elementen (für die englische Oberfläche). Beträge in Cent heutiger Preise; die Server-Vorschau rechnet alles aus. */
import { html, raw, icon, api, on, modal, toast, money, infoBtn, term, esc, bar, signed } from '../ui.js';
import { dec } from '../supply.js';
import { bindPlaceSearch, cityOf } from '../places.js';
import { project, VIEW, outlinePath, unproject } from '../germany.js';
import { repBadge } from '../reputation.js';

const RISK_NAME = { accident: 'Unfall', robbery: 'Plünderung', pothole: 'Panne auf schlechter Straße', weather: 'Schnee und Unwetter', customs: 'Zollkontrolle', strike: 'Streik', quarantine: 'Quarantäne', smuggle: 'Schmuggel entdeckt' };
const STATUS = {
  underway: ['accent', 'Unterwegs', 'truck'], ready: ['good', 'Bereit zur Abfahrt', 'circle-check'], idle: ['', 'Wartet auf die nächste Fahrt', 'clock'], waiting: ['warn', 'Wartet (Hochwasser)', 'cloud-rain'], stopped: ['warn', 'Angehalten', 'circle-alert'],
};
const MODE_ICON = { fuhrwerk: 'truck', lkw: 'truck', bahn: 'train-front', container: 'ship', luft: 'plane', drohne: 'plane', hyperloop: 'train-front' };
const pctFmt = (n) => dec(n, 1);
const kg = (n) => (n >= 1000 ? `${dec(n / 1000, 1)} t` : `${dec(n, 0)} kg`);

/* ------------------------------------------------------------------ kleine Bausteine ------------------------------------------------------------------ */
function envChips(d) {
  const e = d.env || {}; const out = [];
  if (e.winter > 0.15) out.push(html`<span class="chip warn" title="Schnee und Eis bremsen Straße und Bahn und verteuern die Fracht">${icon('cloud-hail')} Winter bremst die Fracht</span>`);
  if (e.flood) out.push(html`<span class="chip bad" title="Hochwasser sperrt Straße und Schiene in der Region">${icon('cloud-rain')} Hochwasser sperrt Straßen</span>`);
  if (e.lock >= 1) out.push(html`<span class="chip warn" title="Seuchenmaßnahmen: Grenzkontrollen verzögern und verteuern die Fracht">${icon('shield')} Seuchenmaßnahmen: Kontrollen</span>`);
  if (!out.length) out.push(html`<span class="chip good">${icon('circle-check')} Freie Fahrt</span>`);
  return out;
}

function timeline(r, v) {
  const t = r.trip;
  if (t) {
    const done = Math.max(0, Math.min(100, ((t.days - t.left) / Math.max(1, t.days)) * 100));
    return html`<div class="tl" aria-label="Fahrt unterwegs"><div class="tl-step on">${icon('package')}<span>Beladen</span></div><div class="tl-bar">${bar(done, 'good')}<small class="dim"><span>Noch</span> <b>${t.left}</b> <span>${t.left === 1 ? 'Tag' : 'Tage'}</span></small></div><div class="tl-step">${icon('flag')}<span>Ankunft</span></div></div>
      <div class="small dim mt"><span>Unterwegs mit</span> <b>${t.modeName}</b>: <b>${dec(t.units, 0)}</b> <span>${r.unit}</span>${t.events.length ? html` · ${t.events.map((x) => html`<span class="chip warn">${RISK_NAME[x] || x}</span> `)}` : ''}</div>`;
  }
  if (r.status === 'stopped') return html`<div class="small dim">${r.locked ? 'Von der Spielleitung angehalten.' : 'Die Route ist angehalten.'}</div>`;
  return html`<div class="small dim"><span>Nächste Fahrt in</span> <b>${r.nextIn}</b> <span>${r.nextIn === 1 ? 'Tag' : 'Tage'}</span></div>`;
}

function routeCard(r, d, ctx) {
  const v = ctx.view; const cur = v.currency; const st = STATUS[r.status] || STATUS.idle;
  const firm = (v.companies.find((c) => c.id === r.firm) || {}).name || '';
  const last = r.made.last;
  return html`<article class="card flat route" data-route="${r.id}">
    <div class="row nowrap spread"><h3 class="serif" style="margin:0;font-size:1.15rem">${icon(r.mode && MODE_ICON[r.mode] ? MODE_ICON[r.mode] : 'route')} <span>${r.goodName}</span></h3><span class="chip ${st[0]}">${icon(st[2])} <span>${st[1]}</span></span></div>
    <div class="small mt"><b data-i18n-skip>${r.fromName}</b> ${icon('arrow-right')} <b data-i18n-skip>${r.toName}</b> <span class="dim">· <span data-i18n-skip>${firm}</span></span></div>
    <div class="mt">${timeline(r, v)}</div>
    <div class="small dim mt"><span>Menge</span> <b>${dec(r.qty, 0)}</b> <span>${r.unit}</span> <span>alle</span> <b>${r.interval}</b> <span>Tage</span>${r.insured ? html` · <span class="chip good">${icon('shield')} versichert</span>` : ''}${r.smuggle ? html` · <span class="chip bad">${icon('skull')} Schmuggel</span>` : ''}${r.carrier ? html` · <span class="chip accent">${icon('handshake')} <span data-i18n-skip>${r.carrier.name}</span></span>` : ''}</div>
    <dl class="kv small mt"><dt>Fahrten bisher</dt><dd>${r.made.trips}${r.made.lost ? html` <span class="neg">(${r.made.lost} mit Verlust)</span>` : ''}</dd><dt>Gewinn insgesamt</dt><dd class="${r.made.profit >= 0 ? 'pos' : 'neg'}">${signed(r.made.profit, cur)}</dd>${last ? html`<dt>Letzte Fahrt</dt><dd class="${last.net >= 0 ? 'pos' : 'neg'}">${signed(last.net, cur)}</dd>` : ''}</dl>
    <div class="row mt">${r.locked ? '' : r.active ? html`<button class="btn sm" data-rt-active="${r.id}" data-on="0">${icon('hourglass')} Anhalten</button>` : html`<button class="btn sm primary" data-rt-active="${r.id}" data-on="1">${icon('play')} Starten</button>`}<button class="btn sm" data-rt-edit="${r.id}">${icon('pencil')} Ändern</button><button class="btn sm ghost danger" data-rt-del="${r.id}" ${r.trip ? 'disabled' : ''} title="${r.trip ? 'Erst nach der Ankunft' : 'Route löschen'}">${icon('trash-2')}</button></div>
  </article>`;
}

function logRows(d, v) {
  const cur = v.currency; const L = (d.view.log || []).slice(0, 8);
  if (!L.length) return '';
  return html`<details class="mt"><summary class="small"><b>Letzte Fahrten</b> <span class="dim">(${L.length})</span></summary><div class="stack mt" style="--gap:.35rem">${L.map((l) => html`<div class="firm small"><div class="grow"><b data-i18n-skip>${l.label}</b><div class="dim"><span>Tag</span> ${l.day} · ${l.mode} · <b>${dec(l.units, 0)}</b> <span>von</span> <b>${dec(l.sent, 0)}</b> <span>angekommen</span>${(l.events || []).map((x) => html` <span class="chip warn">${RISK_NAME[x] || x}</span>`)}</div></div><b class="${l.net >= 0 ? 'pos' : 'neg'}">${signed(l.net, cur)}</b></div>`)}</div></details>`;
}

/* ------------------------------------------------------------------ Vorschau ------------------------------------------------------------------ */
function previewHtml(p, d, ctx) {
  const cur = ctx.view.currency; const M = p.money;
  if (!p.ok) return html`<div class="alert warn small">${icon('triangle-alert')}<div>${p.err}</div></div>`;
  const good = M.net > 0;
  const risky = (p.risks || []).filter((x) => !x.caught && x.loss);
  return html`
    <div class="rt-head small"><b data-i18n-skip>${p.from.name}</b> ${icon('arrow-right')} <b data-i18n-skip>${p.to.name}</b> · <b>${dec(p.km, 0)}</b> <span>km</span> · ${icon(MODE_ICON[p.mode.key] || 'truck')} <b>${p.mode.name}</b> · <b>${p.mode.days}</b> <span>${p.mode.days === 1 ? 'Tag' : 'Tage'}</span> <span>Reisezeit</span></div>
    <div class="chips mt">${p.mode.flags.winter ? html`<span class="chip warn">${icon('cloud-hail')} Winter</span>` : ''}${p.mode.flags.flood ? html`<span class="chip bad">${icon('cloud-rain')} Hochwasser</span>` : ''}${p.mode.flags.lockdown ? html`<span class="chip warn">${icon('shield')} Kontrollen</span>` : ''}${p.mode.flags.boost ? html`<span class="chip good">${icon('trending-up')} Ausbau beschleunigt</span>` : ''}${p.own ? html`<span class="chip good">${icon('truck')} eigener Fuhrpark</span>` : ''}${p.carrierPct ? html`<span class="chip accent">${icon('handshake')} Frachtführer ${p.carrierPct} %</span>` : ''}</div>
    <dl class="kv small mt">
      <dt><span>Ladung kaufen:</span> <b>${dec(p.units, 0)}</b> <span>${p.unit}</span></dt><dd>${money(M.cargo, cur)}</dd>
      <dt>Fracht</dt><dd>${money(M.freight, cur)}</dd>
      ${M.toll ? html`<dt>Maut und Gebühren</dt><dd>${money(M.toll, cur)}</dd>` : ''}${M.port ? html`<dt>Hafen- und Flughafengebühr</dt><dd>${money(M.port, cur)}</dd>` : ''}${M.duty ? html`<dt>${term('Zoll')}</dt><dd>${money(M.duty, cur)}</dd>` : ''}${M.insurance ? html`<dt>Transportversicherung</dt><dd>${money(M.insurance, cur)}</dd>` : ''}
      <dt><b>Kosten der Fahrt</b></dt><dd><b>${money(M.costs, cur)}</b></dd>
      <dt>Erlös im Zielort</dt><dd>${money(M.revenue, cur)}</dd>
      ${M.squeeze > 0 ? html`<dt class="dim"><span>Wettbewerb drückt die Spanne um</span></dt><dd class="dim">−${money(M.squeeze, cur)}</dd>` : ''}
      <dt>Bürokosten (je Fahrt)</dt><dd class="neg">−${money(M.overhead, cur)}</dd>
      ${M.expLoss ? html`<dt>Erwartete Verluste (Risiko)</dt><dd class="neg">−${money(M.expLoss, cur)}</dd>` : ''}
      <dt><b>Erwarteter Gewinn je Fahrt</b></dt><dd class="${good ? 'pos' : 'neg'}"><b>${signed(M.net, cur)}</b></dd>
      <dt>Rendite aufs Jahr</dt><dd class="${good ? 'pos' : 'neg'}">${pctFmt(p.roiYear)} %</dd>
    </dl>
    <div class="small dim mt"><span>Preise:</span> <b data-i18n-skip>${p.from.name}</b> ${dec(p.buyPrice / 100, 2)} <span>→</span> <b data-i18n-skip>${p.to.name}</b> ${dec(p.sellPrice / 100, 2)} <span>je</span> <span>${p.unit}</span> <span>(Lücke</span> <b>${p.gapPct >= 0 ? '+' : ''}${pctFmt(p.gapPct)} %</b><span>)</span></div>
    ${p.impA > 0.015 || p.impB > 0.015 ? html`<div class="small dim">${icon('users')} <span>Andere Händler auf dieser Strecke drücken den Gewinn: Einkauf</span> <b>+${pctFmt(p.impA * 100)} %</b><span>, Verkauf</span> <b>−${pctFmt(p.impB * 100)} %</b><span>.</span></div>` : ''}
    ${!good ? html`<div class="alert warn small mt">${icon('triangle-alert')}<div><b>Diese Route lohnt sich gerade nicht.</b> Die Preise in beiden Städten liegen zu dicht beieinander oder die Fracht ist zu teuer. Versuche eine andere Ware, einen anderen Zielort oder „Beste Route finden“. Der Betrieb fährt nur, wenn ein Gewinn zu erwarten ist.</div></div>` : ''}
    ${p.cashShort ? html`<div class="alert warn small mt">${icon('wallet')}<div><span>In der Firmenkasse fehlen</span> <b>${money(p.cashShort, cur)}</b><span>. Die Ladung wird dann kleiner, oder die Fahrt wartet.</span></div></div>` : ''}
    ${p.units < p.wantUnits ? html`<div class="small dim mt">${icon('info')} <span>Mehr als</span> <b>${dec(p.maxUnits, 0)}</b> <span>${p.unit} passen nicht in deine</span> <b>${p.vehicles}</b> <span>${p.vehicles === 1 ? 'Fahrzeug' : 'Fahrzeuge'}.</span></div>` : ''}
    ${(p.risks || []).length ? html`<details class="mt"><summary class="small"><b>Risiken unterwegs</b> <span class="dim">(${p.risks.length})</span></summary><ul class="small">${p.risks.map((x) => html`<li><b>${RISK_NAME[x.key] || x.name}</b> <span>${pctFmt(x.pct)} %</span>${x.loss ? html` <span class="dim">· −${x.loss[0]}…${x.loss[1]} % <span>der Ladung</span></span>` : ''}${x.delay ? html` <span class="dim">· +${x.delay[0]}…${x.delay[1]} <span>Tage</span></span>` : ''}${x.caught ? html` <span class="dim">· <span>Geldstrafe, Beschlagnahme und Spuren vor Gericht</span></span>` : ''}</li>`)}</ul>${risky.length && !p.carrierPct ? html`<div class="small dim"><span>Mit Transportversicherung ersetzt ein Teil der Verluste.</span></div>` : ''}</details>` : ''}
    <details class="mt"><summary class="small"><b>Verkehrsträger im Vergleich</b></summary><div class="stack mt" style="--gap:.3rem">${p.options.map((o) => html`<div class="firm small ${o.ok ? '' : 'dim'}">${icon(MODE_ICON[o.key] || 'truck')}<div class="grow"><b>${o.name}</b>${o.ok ? html` · <b>${o.days}</b> <span>${o.days === 1 ? 'Tag' : 'Tage'}</span> · <b>${money(o.perUnit, cur)}</b> <span>je</span> <span>${p.unit}</span>` : html` · <span>${o.why}</span>`}</div></div>`)}</div></details>`;
}

/* ------------------------------------------------------------------ Dialog: Route einrichten oder ändern ------------------------------------------------------------------ */
function miniMap(ctx, a, b) {
  const year = ctx.view.date.year; const pts = ctx.world.byPop.filter((c) => c.since <= year && c.tier >= 4).slice(0, 40);
  const dot = (c, cls) => { const [x, y] = project(c.lon, c.lat); return `<g class="${cls}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${cls === 'mm-pt' ? 3 : 7}"/>${cls === 'mm-pt' ? '' : `<text y="-11" text-anchor="middle">${esc(c.name.split(' ')[0])}</text>`}</g>`; };
  let line = '';
  if (a && b) { const [x1, y1] = project(a.lon, a.lat); const [x2, y2] = project(b.lon, b.lat); line = `<line class="mm-line" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }
  return `<svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" class="mm" style="aspect-ratio:${VIEW.w} / ${VIEW.h}" role="img" aria-label="Karte der Strecke"><path class="mm-land" d="${outlinePath()}"/>${pts.map((c) => dot(c, 'mm-pt')).join('')}${line}${a ? dot(a, 'mm-a') : ''}${b ? dot(b, 'mm-b') : ''}</svg>`;
}

function nearest(ctx, lon, lat) {
  const year = ctx.view.date.year; let best = null; let bd = 1e9; const cos = Math.cos((lat * Math.PI) / 180);
  for (const c of ctx.world.cities) { if (c.since > year) continue; const dx = (c.lon - lon) * cos; const dy = c.lat - lat; const dd = dx * dx + dy * dy - (c.tier >= 3 ? 0.02 : 0); if (dd < bd) { bd = dd; best = c; } }
  return best;
}

function openRoute(ctx, d, preset = {}, existing = null) {
  const v = ctx.view; const cur = v.currency;
  const firms = d.eligibleFirms;
  const st = { firm: existing ? existing.firm : (preset.firm || (firms[0] && firms[0].id)), good: existing ? existing.good : (preset.good || ''), from: existing ? cityOf(ctx, existing.from) : (preset.from ? cityOf(ctx, preset.from) : null), to: existing ? cityOf(ctx, existing.to) : (preset.to ? cityOf(ctx, preset.to) : null), pick: 'from' };
  const goodsOpts = d.goods;
  const carriers = d.offers.market;
  const dlg = modal(html`<h3>${icon('route')} ${existing ? 'Route ändern' : 'Neue Handelsroute'}</h3>
    <p class="small dim">Kaufe eine Ware in einer Stadt, schicke sie in eine andere und verkaufe sie dort – der Betrieb fährt von selbst, auch wenn du nicht da bist.</p>
    <div class="grid c2" style="--gap:.6rem">
      <div class="field"><label for="rt-firm">Betrieb</label><select id="rt-firm" data-i18n-skip ${existing ? 'disabled' : ''}>${firms.map((f) => html`<option value="${f.id}" ${f.id === st.firm ? 'selected' : ''}>${f.name}</option>`)}</select></div>
      <div class="field"><label for="rt-good">Ware</label><select id="rt-good" ${existing ? 'disabled' : ''}><option value="">– wählen –</option>${goodsOpts.map((g) => html`<option value="${g.key}" ${g.key === st.good ? 'selected' : ''}>${g.name} (${money(g.price, cur)} / ${g.unit})</option>`)}</select></div>
    </div>
    ${existing ? '' : html`<div class="rt-pick mt"><div class="row nowrap" style="gap:.4rem"><button type="button" class="btn sm on" data-pickwhat="from">${icon('map-pin')} Start</button><button type="button" class="btn sm" data-pickwhat="to">${icon('flag')} Ziel</button><span class="small dim">Ort suchen oder auf der Karte antippen</span></div>
      <div class="pl-wrap mt"><input id="rt-q" style="width:100%" type="search" placeholder="Ort suchen …" autocomplete="off" aria-label="Ort suchen"><div class="pl-res" id="rt-res"></div></div></div>`}
    <div class="rt-places small mt" id="rt-places"></div>
    <div id="rt-map" class="mt"></div>
    <div class="grid c2 mt" style="--gap:.6rem">
      <div class="field"><label for="rt-qty">Menge je Fahrt <span class="dim" id="rt-unit"></span></label><input id="rt-qty" type="number" min="1" step="1" value="${existing ? existing.qty : (preset.qty || 100)}"></div>
      <div class="field"><label for="rt-int">Alle … Tage</label><input id="rt-int" type="number" min="1" max="${d.trade.maxInterval}" step="1" value="${existing ? existing.interval : (preset.interval || 10)}"></div>
    </div>
    <div class="grid c2 mt" style="--gap:.6rem">
      <div class="field"><label for="rt-mode">Verkehrsträger</label><select id="rt-mode"><option value="auto">Automatisch (günstigste Wahl)</option>${d.modes.map((m) => html`<option value="${m.key}" ${existing && existing.mode === m.key ? 'selected' : ''}>${m.name}</option>`)}</select></div>
      <div class="field" id="rt-carrier-f"><label for="rt-carrier">Frachtführer</label><select id="rt-carrier"><option value="">Standardtarif</option>${carriers.map((c) => html`<option value="${c.id}" ${existing && existing.carrier && false ? 'selected' : ''}>${c.firm} · ${c.city} · ${c.pct} %</option>`)}</select></div>
    </div>
    <label class="sup-auto mt"><input type="checkbox" id="rt-ins" ${existing && existing.insured ? 'checked' : ''}><span><b>Transportversicherung</b><br><span class="dim small"><span>Kostet</span> ${dec(d.trade.insurancePct, 1)} <span>% der Ladung und ersetzt</span> ${d.trade.insureCoverPct} <span>% verlorener Ware.</span></span></span></label>
    <label class="sup-auto mt" id="rt-sm-f" hidden><input type="checkbox" id="rt-sm" ${existing && existing.smuggle ? 'checked' : ''}><span><b>${icon('skull')} Zoll und Maut umgehen (Schmuggel)</b><br><span class="small neg"><span>Strafbar! Bei einer Kontrolle drohen Geldstrafe, Beschlagnahme, Spuren vor Gericht und ein Skandal.</span></span></span></label>
    <div id="rt-pv" class="mt"><div class="dim small">Wähle Ware, Start und Ziel – dann siehst du hier, ob sich die Route lohnt.</div></div>
    <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="rt-go" disabled>${existing ? 'Speichern' : 'Route einrichten'}</button></div>`, { wide: true });
  const $ = (s) => dlg.el.querySelector(s);
  let seq = 0; let timer = 0; let last = null;
  const input = () => ({
    firm: Number($('#rt-firm').value), good: $('#rt-good').value, from: st.from && st.from.id, to: st.to && st.to.id, qty: Number($('#rt-qty').value), interval: Number($('#rt-int').value) || undefined,
    mode: $('#rt-mode').value, insured: $('#rt-ins').checked, smuggle: $('#rt-sm').checked && !$('#rt-sm-f').hidden, carrierOffer: Number($('#rt-carrier').value) || 0, routeId: existing ? existing.id : 0,
  });
  const places = () => {
    const chip = (c, k) => (c ? html`<span class="chip accent">${icon(k === 'from' ? 'map-pin' : 'flag')} <b data-i18n-skip>${c.label}</b></span>` : html`<span class="chip">${icon(k === 'from' ? 'map-pin' : 'flag')} <span>${k === 'from' ? 'Start wählen' : 'Ziel wählen'}</span></span>`);
    $('#rt-places').innerHTML = html`${chip(st.from, 'from')} ${icon('arrow-right')} ${chip(st.to, 'to')}`.__raw;
    $('#rt-map').innerHTML = miniMap(ctx, st.from, st.to);
  };
  const refreshUnit = () => { const g = goodsOpts.find((x) => x.key === $('#rt-good').value); $('#rt-unit').textContent = g ? `(${g.unit})` : ''; };
  const preview = async () => {
    const my = ++seq; const i = input();
    $('#rt-go').disabled = true;
    if (!i.good || !i.from || !i.to || !(i.qty > 0)) { $('#rt-pv').innerHTML = html`<div class="dim small">Wähle Ware, Start und Ziel – dann siehst du hier, ob sich die Route lohnt.</div>`.__raw; return; }
    if (i.from === i.to) { $('#rt-pv').innerHTML = html`<div class="alert warn small">${icon('triangle-alert')}<div>Start und Ziel müssen verschiedene Orte sein.</div></div>`.__raw; return; }
    let r; try { r = (await api('POST', '/api/transport/preview', i)).preview; } catch (e) { if (my === seq) $('#rt-pv').innerHTML = html`<div class="alert warn small">${icon('triangle-alert')}<div>${e.message}</div></div>`.__raw; return; }
    if (my !== seq) return;
    last = r; $('#rt-pv').innerHTML = previewHtml(r, d, ctx).__raw;
    $('#rt-sm-f').hidden = !(r.ok && r.canSmuggle && !r.protectedNow);
    $('#rt-carrier-f').hidden = !!(r.ok && r.own);
    $('#rt-go').disabled = !r.ok;
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(preview, 350); };
  dlg.el.addEventListener('input', (e) => { if (e.target.id === 'rt-q') return; if (e.target.id === 'rt-good') refreshUnit(); later(); });
  dlg.el.addEventListener('change', later);
  if (!existing) {
    const setPlace = (c) => { st[st.pick] = c; if (st.pick === 'from' && !st.to) { st.pick = 'to'; dlg.el.querySelectorAll('[data-pickwhat]').forEach((b) => b.classList.toggle('on', b.dataset.pickwhat === 'to')); } places(); later(); };
    bindPlaceSearch($('#rt-q'), $('#rt-res'), ctx, { year: v.date.year, onPick: setPlace });
    on(dlg.el, 'click', '[data-pickwhat]', (e, t) => { st.pick = t.dataset.pickwhat; dlg.el.querySelectorAll('[data-pickwhat]').forEach((b) => b.classList.toggle('on', b === t)); });
    dlg.el.querySelector('#rt-map').addEventListener('click', (e) => {
      const svg = e.target.closest('svg'); if (!svg) return; const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * VIEW.w; const y = ((e.clientY - r.top) / r.height) * VIEW.h; const [lon, lat] = unproject(x, y);
      const c = nearest(ctx, lon, lat); if (c) setPlace(c);
    });
  }
  refreshUnit(); places(); if (st.good && st.from && st.to) preview();
  if (existing && existing.carrier) { /* Frachtführer ist beim Ändern unverändert, wenn nichts Neues gewählt wird */ }
  $('#rt-go').onclick = async () => {
    const i = input();
    try {
      const r = existing ? await api('POST', `/api/transport/route/${existing.id}`, { qty: i.qty, interval: i.interval, mode: i.mode, insured: i.insured, smuggle: i.smuggle, ...(i.carrierOffer ? { carrierOffer: i.carrierOffer } : {}) }) : await api('POST', '/api/transport/route', i);
      if (r.view) { ctx.setView(r.view); ctx.hud(); }
      toast(r.message || 'Route eingerichtet.'); dlg.close(); window.dispatchEvent(new CustomEvent('tp-seen', { detail: 'route' })); ctx.rerender();
    } catch (e) { toast(e.message, 'bad'); }
  };
  void last;
  return dlg;
}

/* ------------------------------------------------------------------ Dialog: Beste Route finden ------------------------------------------------------------------ */
async function openSuggest(ctx, d) {
  const v = ctx.view; const cur = v.currency;
  const firms = d.eligibleFirms;
  const dlg = modal(html`<h3>${icon('sparkles')} Beste Route finden</h3>
    <p class="small dim">Wir vergleichen die Preise der Waren in Städten in deiner Nähe und rechnen Fracht, Gebühren, Risiko und Wettbewerb ein. Der Vorschlag richtet sich nach der Kasse deines Betriebs.</p>
    <div class="grid c2" style="--gap:.6rem"><div class="field"><label for="sg-firm">Betrieb</label><select id="sg-firm" data-i18n-skip>${firms.map((f) => html`<option value="${f.id}">${f.name}</option>`)}</select></div>
    <div class="field"><label for="sg-good">Ware (optional)</label><select id="sg-good"><option value="">Alle Waren</option>${d.goods.map((g) => html`<option value="${g.key}">${g.name}</option>`)}</select></div></div>
    <div id="sg-body" class="mt"><div class="dim small">Suche läuft …</div></div>
    <div class="row end mt"><button class="btn ghost" data-close="x">Schließen</button></div>`, { wide: true });
  const body = dlg.el.querySelector('#sg-body');
  const run = async () => {
    body.innerHTML = '<div class="dim small">Suche läuft …</div>';
    let r; try { r = await api('POST', '/api/transport/suggest', { firm: Number(dlg.el.querySelector('#sg-firm').value), good: dlg.el.querySelector('#sg-good').value }); } catch (e) { body.innerHTML = html`<div class="alert warn small">${icon('triangle-alert')}<div>${e.message}</div></div>`.__raw; return; }
    if (!r.list.length) { body.innerHTML = html`<div class="alert info small">${icon('info')}<div><b>Gerade lohnt sich keine Route.</b> Die Preise in den Städten in deiner Nähe liegen zu dicht beieinander, oder die Kasse des Betriebs ist zu klein. Schau später wieder vorbei – Preise ändern sich mit Ernte, Jahreszeit und Politik.</div></div>`.__raw; return; }
    body.innerHTML = html`<div class="stack" style="--gap:.5rem">${r.list.map((s, i) => html`<div class="firm" style="align-items:flex-start"><div class="grow small"><b>${s.goodName}</b>: <b data-i18n-skip>${s.fromName}</b> ${icon('arrow-right')} <b data-i18n-skip>${s.toName}</b>
      <div class="dim"><b>${dec(s.km, 0)}</b> <span>km</span> · ${s.modeName} · <b>${s.days}</b> <span>${s.days === 1 ? 'Tag' : 'Tage'}</span> · <span>Preislücke</span> <b>+${pctFmt(s.gapPct)} %</b></div>
      <div><span>Gewinn je Fahrt</span> <b class="pos">${money(s.net, cur)}</b> <span class="dim">· <b>${pctFmt(s.roiYear)}</b> <span>% im Jahr</span> · <span>Einsatz</span> ${money(s.cargo, cur)}</span></div></div>
      <button class="btn sm primary" data-use="${i}">Übernehmen</button></div>`)}</div>`.__raw;
    on(body, 'click', '[data-use]', (e, t) => {
      const s = r.list[Number(t.dataset.use)]; dlg.close();
      openRoute(ctx, d, { firm: Number(dlg.el.querySelector('#sg-firm').value), good: s.good, from: s.from, to: s.to, qty: s.qty, interval: s.interval });
    });
  };
  dlg.el.querySelector('#sg-firm').onchange = run; dlg.el.querySelector('#sg-good').onchange = run;
  run();
}

/* ------------------------------------------------------------------ Fracht und Speditionen ------------------------------------------------------------------ */
function freightCard(d, ctx) {
  const v = ctx.view; const carriers = (v.companies || []).filter((c) => d.eligibleFirms.some((f) => f.id === c.id && f.kind === 'carrier'));
  const mine = d.offers.mine; const market = d.offers.market;
  return html`<section class="card mt" id="trFreight">
    <div class="card-title">${icon('truck')} ${term('Fracht')} und ${term('Spedition')} ${infoBtn(['Eine Spedition (Fuhrunternehmen, Logistik) kann anderen Spielern Fracht verkaufen: günstiger als der normale Tarif, aber mit Gewinn für sie.', 'Wer eine Route oder einen Liefervertrag über mehrere Städte hat, wählt dort einen Frachtführer – die Fracht wird billiger, die Spedition verdient mit.', 'Die Spedition legt Preis (in Prozent des Tarifs) und Kapazität (kg pro Tag) fest. Mehr als die Kapazität kann sie nicht fahren.'], 'Fracht und Spedition')}</div>
    ${carriers.length ? html`<div class="small mt"><b>Meine Frachtangebote</b></div>
      <div class="stack mt" style="--gap:.4rem">${mine.length ? mine.map((o) => html`<div class="firm small"><div class="grow"><b data-i18n-skip>${o.firm}</b> · <b>${o.pct}</b> <span>% des Tarifs</span><div class="dim"><span>Ausgelastet:</span> <b>${kg(o.used)}</b> <span>von</span> <b>${kg(o.cap)}</b> <span>pro Tag</span></div></div><button class="btn sm ghost" data-offer-close="${o.id}" title="Angebot zurückziehen">${icon('x')}</button></div>`) : html`<div class="dim small">Noch kein Angebot. Mit einem Angebot können andere bei dir Fracht buchen.</div>`}</div>
      <div class="grid c2 mt" style="--gap:.6rem"><div class="field"><label for="fo-firm">Betrieb</label><select id="fo-firm" data-i18n-skip>${carriers.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></div>
      <div class="field"><label for="fo-pct">Preis: <b id="fo-pv">90</b> % des Tarifs</label><input id="fo-pct" type="range" min="${d.contracts.carrierMinPct}" max="${d.contracts.carrierMaxPct}" step="1" value="90"></div></div>
      <div class="row end mt"><button class="btn sm primary" id="fo-go">${icon('handshake')} Fracht anbieten</button></div>`
      : html`<p class="small dim mt">Du hast keine Spedition. Mit einem Fuhrunternehmen, einer Logistikfirma oder einem Lieferdienst kannst du anderen Fracht verkaufen.</p>`}
    <div class="small mt"><b>Frachtangebote in der Nähe</b></div>
    <div class="stack mt" style="--gap:.4rem">${market.length ? market.map((o) => html`<div class="firm small"><div class="grow"><b data-i18n-skip>${o.firm}</b> ${repBadge(o.userId)}<div class="dim"><span data-i18n-skip>${o.city}</span>${o.km != null ? html` · <b>${dec(o.km, 0)}</b> <span>km</span>` : ''} · <b>${o.pct}</b> <span>% des Tarifs</span> · <span>frei:</span> <b>${kg(o.free)}</b><span>/Tag</span></div></div></div>`) : html`<div class="dim small">Gerade bietet niemand Fracht an. Dann gilt der Standardtarif.</div>`}</div>
  </section>`;
}

/* ------------------------------------------------------------------ Verkehrspolitik ------------------------------------------------------------------ */
const ROLES = [
  ['Stadtrat und Bürgermeister', 'Bahnhofs-, Hafen- oder Flughafenausbau der Stadt und Maut/Hafengebühr.'],
  ['Landtagsabgeordneter', 'Straßenbauprogramm im Bundesland.'],
  ['Bundestagsabgeordneter', 'Rahmen: höchste Maut und Hafengebühr der Städte.'],
  ['Bundeskanzler', 'Autobahn- und Bahnnetz-Programm im ganzen Land (und der Einfuhrzoll, der Schiffs- und Luftfracht trifft).'],
];
async function bindPolicy(root, ctx, d) {
  const box = root.querySelector('#trPol'); if (!box) return;
  let p; try { p = await api('GET', '/api/transport/policy'); } catch (_) { box.remove(); return; }
  if (!p.enabled) { box.remove(); return; }
  const o = p.office; const L = p.local;
  const chips = html`${L.rail ? html`<span class="chip good">${icon('train-front')} Bahn Stufe ${L.rail}</span> ` : ''}${L.port ? html`<span class="chip good">${icon('ship')} Hafen Stufe ${L.port}</span> ` : ''}${L.air ? html`<span class="chip good">${icon('plane')} Flughafen Stufe ${L.air}</span> ` : ''}${L.toll ? html`<span class="chip ${L.toll > 0 ? 'warn' : 'good'}">${L.toll > 0 ? 'Maut' : 'Gebührenfreiheit'} ${L.toll > 0 ? '+' : ''}${L.toll} %</span> ` : ''}${L.net ? html`<span class="chip good">${icon('trending-up')} Netzprogramm Stufe ${L.net}: ${L.netSpeed} % schneller, ${L.netCost} % billiger</span> ` : ''}`;
  const active = p.active.length ? html`<div class="stack mt" style="--gap:.4rem">${p.active.map((a) => html`<div class="firm"><div class="grow small"><b>${a.text}</b><div class="dim"><span data-i18n-skip>${a.office}${a.holder ? ` · ${a.holder}` : ''}</span> · <span>gilt noch</span> ${a.hours} <span>Std.</span></div></div></div>`)}</div>` : html`<div class="dim small mt">Zurzeit hat kein Amtsinhaber einen Beschluss zum Verkehr gefasst, der bei dir gilt.</div>`;
  const help = infoBtn(['Gewählte Amtsinhaber bestimmen den Verkehr: Ausbau von Bahnhof, Hafen und Flughafen, Maut, Straßenbau und das Netz im ganzen Land.', 'Pro Amtszeit darf jeder Amtsinhaber einen Beschluss zum Verkehr fassen. Er wirkt auf alle Routen, Speditionen und Lieferverträge im Gebiet – auch auf deine eigenen.', 'Prüfe die Wirkung vor dem Beschluss: Du siehst genau, was sich ändert und welche Umlage die Betriebe zahlen.'], 'Verkehrspolitik');
  if (!o) {
    box.innerHTML = html`<div class="card-title">${icon('landmark')} Was Ämter im Verkehr bestimmen ${help}</div>${chips ? html`<div class="small dim mt"><span>Bei dir gilt gerade:</span> ${chips}</div>` : ''}
      <div class="stack mt" style="--gap:.4rem">${ROLES.map((r) => html`<div class="firm"><div class="grow small"><b>${r[0]}</b><div class="dim">${r[1]}</div></div></div>`)}</div>${active}`.__raw;
    return;
  }
  const status = o.used ? html`<div class="alert good small">${icon('circle-check')}<div><b>Du hast in dieser Amtszeit schon entschieden:</b> ${o.used.text}</div></div>`
    : !o.powers.length ? html`<div class="alert info small">${icon('info')}<div>Dieses Amt hat noch keine Macht über den Verkehr. Ab dem Stadtrat darfst du Bahnhöfe, Häfen und Maut bestimmen.</div></div>`
      : !o.cityOk ? html`<div class="alert warn small">${icon('triangle-alert')}<div>Du bist in einer anderen Stadt gewählt worden – zieh zurück, um dort zu entscheiden.</div></div>` : '';
  const ctl = (pw) => {
    if (pw.kind === 'hub') return html`<div class="grid c2" style="--gap:.6rem"><div class="field"><label for="tp-focus">Was ausbauen?</label><select id="tp-focus">${pw.focus.map((f) => html`<option value="${f.key}">${f.name} (Stufe ${f.level})</option>`)}</select></div><div class="field"><label for="tp-hub">Ausbau</label><select id="tp-hub">${pw.options.map((x) => html`<option value="${x.value}">${x.label}</option>`)}</select></div></div>`;
    return html`<div class="field"><label for="tp-${pw.kind}">Wert</label><select id="tp-${pw.kind}">${pw.options.map((x) => html`<option value="${x.value}">${x.label}</option>`)}</select></div>`;
  };
  box.innerHTML = html`<div class="card-title">${icon('landmark')} Dein Amt: Verkehr ${help}</div>
    <div class="small dim"><b>${o.name}</b> · <span>noch</span> ${o.daysLeft >= 365 ? dec(o.daysLeft / 365, 1) : o.daysLeft} <span>${o.daysLeft >= 365 ? 'Jahre' : 'Tage'}</span> <span>im Amt</span></div>
    <p class="small mt">Pro Amtszeit darfst du <b>einen</b> Beschluss zum Verkehr fassen. Vorher siehst du genau, was er bewirkt.</p>
    ${status}
    ${!o.used && o.cityOk ? html`<div class="stack mt" style="--gap:.8rem">${o.powers.map((pw) => html`<div class="pol" data-tpol="${pw.kind}"><b>${pw.name}</b><div class="dim small">${pw.what}</div><div class="mt">${ctl(pw)}</div><div class="row end mt"><button class="btn sm primary" data-tpol-preview="${pw.kind}">Wirkung ansehen</button></div></div>`)}</div>` : ''}
    ${chips ? html`<div class="small dim mt"><span>Bei dir gilt gerade:</span> ${chips}</div>` : ''}${active}`.__raw;
  on(box, 'click', '[data-tpol-preview]', async (e, t) => {
    const pw = o.powers.find((x) => x.kind === t.dataset.tpolPreview); if (!pw) return;
    const input = pw.kind === 'hub' ? { kind: 'hub', good: box.querySelector('#tp-focus').value, value: Number(box.querySelector('#tp-hub').value) } : { kind: pw.kind, value: Number(box.querySelector(`#tp-${pw.kind}`).value) };
    let pv; try { pv = await api('POST', '/api/transport/policy/preview', input); } catch (err) { toast(err.message, 'bad'); return; }
    const dlg = modal(html`<h3 style="flex-wrap:wrap">${icon('scale')} <span>${pw.name}</span>: <span>Das passiert</span></h3><p class="small"><b>${pv.text}</b></p><ul class="pol-fx">${pv.lines.map((l) => html`<li>${l}</li>`)}</ul>
      <p class="small dim">Der Beschluss gilt bis zum Ende deiner Amtszeit und kann in dieser Amtszeit nicht zurückgenommen werden. Er wirkt auch auf deine eigenen Betriebe.</p>
      <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="tpol-go">Beschließen</button></div>`);
    dlg.el.querySelector('#tpol-go').onclick = async () => {
      try { const r = await api('POST', '/api/transport/policy/set', input); if (r.view) { ctx.setView(r.view); ctx.hud(); } toast(r.message || 'Beschluss gefasst.', r.level || 'good'); dlg.close(); ctx.rerender(); } catch (err) { toast(err.message, 'bad'); }
    };
  });
}

/* ------------------------------------------------------------------ Seite ------------------------------------------------------------------ */
export default {
  id: 'trade', label: 'Handel & Transport', icon: 'route',
  async load() { return api('GET', '/api/transport'); },
  render(ctx, d) {
    const v = ctx.view; const cur = v.currency;
    const head = html`<div class="panel-head"><div><h2>Handel & Transport</h2><p>Waren zwischen Städten verschicken, Fracht sparen, Preisunterschiede nutzen.</p></div>
      ${infoBtn(['Eine Handelsroute kauft eine Ware in einer Stadt, schickt sie per Fuhrwerk, Lastwagen, Bahn, Schiff oder Flugzeug in eine andere und verkauft sie dort – automatisch, alle paar Tage.', 'Der Gewinn hängt vom Preisunterschied zwischen den Städten ab, von Fracht und Gebühren, vom Wetter und von der Politik. Andere Händler auf derselben Strecke drücken den Gewinn; die Rendite ist auf rund 24 % im Jahr begrenzt.', 'Starte mit „Beste Route finden“: Du siehst vorher, was sich lohnt. Die Fahrt läuft nur, wenn ein Gewinn zu erwarten ist.'], 'Handelsrouten')}</div>`;
    if (!d.enabled) return html`${head}<div class="alert info">${icon('info')}<div>Handel & Transport ist im Moment vom Spielbetrieb abgeschaltet.</div></div>`;
    const routes = d.view.routes;
    const canRoute = d.eligibleFirms.length > 0;
    return html`${head}
    <section class="card">
      <div class="row spread"><div class="card-title" style="margin:0">${icon('route')} Verkehrslage ${infoBtn(['Die Lage zeigt, was Fracht gerade bremst: Winter, Hochwasser und Seuchenmaßnahmen.', 'Jeder Verkehrsträger hat seine Zeit: Fuhrwerk und Bahn nach dem Krieg, Lastwagen ab 1950, Containerschiffe ab 1970, Luftfracht ab 1980, später Drohnen und Röhrenfracht.', 'Bahn, Hafen und Flughafen gibt es nur in Orten mit Anschluss – Ämter können Städte ausbauen.'], 'Verkehrslage')}</div><span class="chip">${icon('clock')} <span>Ein Spieltag ≈ 4 Minuten</span></span></div>
      <div class="chips mt">${envChips(d)}</div>
      <div class="stack mt" style="--gap:.3rem">${d.modes.map((m) => html`<div class="small">${icon(MODE_ICON[m.key] || 'truck')} <b>${m.name}</b> <span class="dim">· <b>${dec(m.speed, 0)}</b> <span>km pro Tag</span> · <span>bis</span> <b>${kg(m.capKg)}</b> <span>je Fahrzeug</span></span></div>`)}</div>
      ${d.hubs ? html`<div class="small dim mt"><span>Anschluss in</span> <b data-i18n-skip>${v.city.name}</b>: <span>Bahn</span> <b>${d.hubs.rail}</b> · <span>Hafen</span> <b>${d.hubs.port}</b> · <span>Flughafen</span> <b>${d.hubs.air}</b></div>` : ''}
    </section>

    <section class="card mt" id="trRoutes" data-spot-trade>
      <div class="row spread"><div class="card-title" style="margin:0">${icon('route')} Meine Handelsrouten ${infoBtn(['Jede Route gehört zu einem Betrieb (Spedition, Laden, Handel). Die Fahrzeuge des Betriebs bestimmen, wie viel er laden kann.', 'Die Kosten der Ladung zahlt die Firmenkasse bei der Abfahrt, den Erlös bekommt sie bei der Ankunft. Fehlt Geld, wird die Ladung kleiner – nichts rutscht ins Minus.', 'Unterwegs gibt es Risiken (Unfall, früher Plünderung, Wetter, Zoll). Die Transportversicherung ersetzt einen Teil.'], 'Meine Routen')}</div>
        <span class="chip">${routes.length} / ${d.view.max}</span></div>
      ${canRoute ? html`<div class="row mt"><button class="btn primary" id="rt-best">${icon('sparkles')} Beste Route finden</button><button class="btn" id="rt-new">${icon('plus')} Neue Route</button></div>`
        : html`<div class="alert info mt">${icon('info')}<div><b>Dafür brauchst du einen Transport- oder Handelsbetrieb.</b> Spedition, Fuhrunternehmen, Logistik, Lieferdienst oder ein Laden, Kohlen- oder Onlinehandel dürfen Routen betreiben. Gründe oder kaufe einen unter „Unternehmen“. <button class="btn sm" data-go="business">Zu Unternehmen</button></div></div>`}
      ${routes.length ? html`<div class="grid auto mt" style="--gap:.8rem;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${routes.map((r) => routeCard(r, d, ctx))}</div>` : canRoute ? html`<div class="empty-note mt">${icon('route', 'lg')}<span>Noch keine Route. Mit „Beste Route finden“ zeigen wir dir, wo sich Handel gerade lohnt.</span></div>` : ''}
      ${logRows(d, v)}
    </section>
    ${freightCard(d, ctx)}
    <section class="card mt" id="trPol"><div class="dim small">Lade …</div></section>`;
  },
  bind(root, ctx, d) {
    if (!d.enabled) return;
    on(root, 'click', '[data-go]', (e, t) => ctx.go(t.dataset.go));
    const act = async (fn, msg) => { try { const r = await fn(); if (r && r.view) { ctx.setView(r.view); ctx.hud(); } if (msg) toast(msg); ctx.rerender(); } catch (e) { toast(e.message, 'bad'); } };
    const best = root.querySelector('#rt-best'); if (best) best.onclick = () => openSuggest(ctx, d);
    const nw = root.querySelector('#rt-new'); if (nw) nw.onclick = () => openRoute(ctx, d);
    on(root, 'click', '[data-rt-active]', (e, t) => act(() => api('POST', `/api/transport/route/${t.dataset.rtActive}/active`, { on: t.dataset.on === '1' }), t.dataset.on === '1' ? 'Route läuft wieder.' : 'Route angehalten.'));
    on(root, 'click', '[data-rt-edit]', (e, t) => { const r = d.view.routes.find((x) => x.id === Number(t.dataset.rtEdit)); if (r) openRoute(ctx, d, {}, r); });
    on(root, 'click', '[data-rt-del]', async (e, t) => { if (await ctx.confirm({ title: 'Route löschen?', text: 'Die Route wird entfernt. Bereits Verdientes bleibt in der Firmenkasse.', ok: 'Löschen', danger: true })) act(() => api('POST', `/api/transport/route/${t.dataset.rtDel}/remove`, {}), 'Route gelöscht.'); });
    on(root, 'click', '[data-offer-close]', (e, t) => act(() => api('POST', `/api/transport/offer/${t.dataset.offerClose}/close`, {}), 'Angebot zurückgezogen.'));
    const pct = root.querySelector('#fo-pct'); if (pct) pct.addEventListener('input', () => { root.querySelector('#fo-pv').textContent = pct.value; });
    const go = root.querySelector('#fo-go'); if (go) go.onclick = () => act(() => api('POST', '/api/transport/offer', { company: Number(root.querySelector('#fo-firm').value), pct: Number(pct.value) }), 'Frachtangebot veröffentlicht.');
    bindPolicy(root, ctx, d);
    window.dispatchEvent(new CustomEvent('tp-seen', { detail: 'trade' }));
  },
};

export { openRoute, openSuggest };
void raw;
