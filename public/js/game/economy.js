/* Stadtwirtschaft: Preisbarometer (Lebensmittel, Wohnen, Dienste, Bau, Löhne), Vergleich mit anderen Orten und Hinweise.
 * Alle Zahlen kommen vom Server (/api/economy/city). Jeder dynamische Wert steht in einem eigenen Element,
 * damit die englische Oberfläche jeden Textknoten einzeln übersetzen kann. */
import { html, raw, icon, api, on, money, infoBtn, term } from './ui.js';
import { bindPlaceSearch } from './places.js';

const SECTORS = ['food', 'rent', 'services', 'build', 'wage'];
const NAME = { food: 'Lebensmittel', rent: 'Wohnen & Miete', services: 'Dienstleistungen & Gastro', build: 'Baukosten', wage: 'Löhne' };
const SHORT = { food: 'Essen', rent: 'Miete', services: 'Dienste', build: 'Bauen', wage: 'Löhne' };
const ICON = { food: 'shopping-basket', rent: 'house', services: 'utensils', build: 'hammer', wage: 'wallet' };
/* Für Preise ist „mehr“ schlecht, für Löhne gut. */
const GOODWHEN = { food: -1, rent: -1, services: -1, build: -1, wage: 1 };
const LABEL = {
  cheap: { food: 'Günstig hier', rent: 'Günstig hier', services: 'Günstig hier', build: 'Günstig hier', wage: 'Niedrig hier' },
  normal: { food: 'Durchschnitt', rent: 'Durchschnitt', services: 'Durchschnitt', build: 'Durchschnitt', wage: 'Durchschnitt' },
  dear: { food: 'Teuer hier', rent: 'Teuer hier', services: 'Teuer hier', build: 'Teuer hier', wage: 'Hoch hier' },
};
const TREND = {
  price: { up: 'teurer', down: 'billiger', flat: 'unverändert' },
  wage: { up: 'höher', down: 'niedriger', flat: 'unverändert' },
};
const MARKET = {
  food: { tight: 'Lebensmittel sind knapp', plenty: 'Lebensmittel gibt es reichlich' },
  rent: { tight: 'Wohnungen sind knapp', plenty: 'Viele Wohnungen frei' },
  services: { tight: 'Dienste sind gefragt', plenty: 'Viel Konkurrenz bei Diensten' },
  build: { tight: 'Baufirmen sind ausgelastet', plenty: 'Baufirmen suchen Aufträge' },
  wage: { tight: 'Arbeitskräfte werden gesucht', plenty: 'Viele Arbeitssuchende' },
};

const pct = (x, d = 0) => { const v = Number((x * 100).toFixed(d)); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d).replace('.', ',')} %`; };
const tone = (sec, rel, th = 0.03) => (Math.abs(rel) < th ? '' : rel * GOODWHEN[sec] > 0 ? 'good' : 'warn');

/** Verlauf als kleine Linie (acht Punkte, ein Punkt je Spieljahr). */
export function spark(vals, cls = '') {
  const w = 84; const h = 26; const pad = 3;
  const v = (vals || []).filter(Number.isFinite); if (v.length < 2) return '';
  const mn = Math.min(...v); const mx = Math.max(...v); const rng = Math.max(0.03, mx - mn);
  const x = (i) => pad + (i * (w - 2 * pad)) / (v.length - 1); const y = (n) => h - pad - ((n - mn) / rng) * (h - 2 * pad);
  const pts = v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
  return raw(`<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(v.length - 1).toFixed(1)}" cy="${y(v[v.length - 1]).toFixed(1)}" r="2.8" fill="currentColor"/></svg>`);
}

function row(r, market) {
  const kind = r.sector === 'wage' ? 'wage' : 'price';
  const t = r.trend; const arrow = t === 'up' ? 'trending-up' : t === 'down' ? 'trending-down' : 'minus';
  const yoyTone = t === 'flat' ? '' : (t === 'up' ? 1 : -1) * GOODWHEN[r.sector] > 0 ? 'good' : 'warn';
  const lab = LABEL[r.label][r.sector];
  const labTone = r.label === 'normal' ? '' : (r.label === 'dear' ? 1 : -1) * GOODWHEN[r.sector] > 0 ? 'good' : 'warn';
  const m = market && market.find((x) => x.sector === r.sector);
  const mk = m && m.state !== 'even' ? MARKET[r.sector][m.state] : null;
  return html`<li class="econ-row" data-sector="${r.sector}">
    <span class="er-ic">${icon(ICON[r.sector])}</span>
    <div class="er-main"><div class="row nowrap" style="gap:.4rem;flex-wrap:wrap"><b>${NAME[r.sector]}</b><span class="chip ${labTone}">${lab}</span></div>
      <div class="small er-sub"><span class="trend ${yoyTone}">${icon(arrow)} <b>${pct(r.yoy, 1)}</b> <span>${TREND[kind][t]}</span></span> <span class="dim">· <span>seit letztem Jahr</span></span></div>
      ${mk ? html`<div class="small dim"><span>${mk}</span></div>` : ''}</div>
    <div class="er-side"><b class="mono ${labTone}">${pct(r.vsNational)}</b><small class="dim"><span>zum Durchschnitt</span></small><span class="er-spark ${yoyTone}" title="Verlauf der letzten Jahre">${spark(r.spark)}</span></div></li>`;
}

function tipCard(t, cur) {
  if (t.kind === 'rent') {
    return html`<div class="alert info econ-tip">${icon('house')}<div><span>Hier ist Wohnen teurer als in der Nähe: In</span> <b data-i18n-skip>${t.city}</b> <span>(</span><b>${t.km}</b> <span>km entfernt) ist Wohnen etwa</span> <b>${t.pct}</b> <span>% günstiger. Ein Umzug dorthin spart dir rund</span> <b>${money(t.savePerDay, cur)}</b> <span>pro Tag.</span>
      <div class="small dim"><span>Bedenke: Ein Umzug kostet Geld und Coins, und Arbeit musst du dort neu suchen.</span></div>
      <div class="mt"><button class="btn sm" data-ec-city="${t.cityId}">Stadt ansehen</button></div></div></div>`;
  }
  return html`<div class="alert info econ-tip">${icon('wallet')}<div><span>In</span> <b data-i18n-skip>${t.city}</b> <span>(</span><b>${t.km}</b> <span>km entfernt) liegen die Löhne etwa</span> <b>${t.pct}</b> <span>% höher als hier.</span>
    <div class="mt"><button class="btn sm" data-ec-city="${t.cityId}">Stadt ansehen</button></div></div></div>`;
}

function compareTable(d, sort) {
  const nat = d.barometer.national;
  const rows = d.compare.slice();
  const here = rows.find((r) => r.here);
  const rest = rows.filter((r) => !r.here);
  if (sort === 'km') rest.sort((a, b) => a.km - b.km);
  else rest.sort((a, b) => (a.levels[sort] - b.levels[sort]) * (GOODWHEN[sort] > 0 ? -1 : 1));
  const cell = (r, s) => { const rel = nat[s] > 0 ? r.levels[s] / nat[s] - 1 : 0; return html`<td class="v ${tone(s, rel)}">${pct(rel)}</td>`; };
  const line = (r) => html`<tr class="${r.here ? 'here' : ''}"><th scope="row"><b data-i18n-skip>${r.name}</b>${r.picked ? html`<button class="x" data-ec-drop="${r.id}" aria-label="Aus dem Vergleich entfernen">${icon('x')}</button>` : ''}<small class="dim">${r.here ? html`<span>Hier</span>` : html`<span>${r.km} km</span>`}</small></th>${SECTORS.map((s) => cell(r, s))}</tr>`;
  return html`<div class="econ-tbl-wrap"><table class="econ-tbl"><thead><tr><th scope="col"><button class="${sort === 'km' ? 'on' : ''}" data-ec-sort="km">Ort</button></th>${SECTORS.map((s) => html`<th scope="col"><button class="${sort === s ? 'on' : ''}" data-ec-sort="${s}" title="${NAME[s]} – sortieren" aria-label="Nach ${NAME[s]} sortieren">${icon(ICON[s])}<span>${SHORT[s]}</span></button></th>`)}</tr></thead>
    <tbody>${here ? line(here) : ''}${rest.map(line)}</tbody></table></div>`;
}

/** Karte „Preisbarometer“ (ohne Daten: Platzhalter). */
export function econSkeleton(id = 'econBox') {
  return html`<section class="card econ-card mt" id="${id}" data-econ><div class="card-title">${icon('trending-up')} Preisbarometer</div><div class="skel" style="height:140px"></div></section>`;
}

function render(d, ctx) {
  const v = ctx.view; const cur = v.currency; const sort = ctx.ui.econSort || 'km';
  const b = d.barometer;
  const help = infoBtn(['Das Preisbarometer zeigt, wie teuer das Leben in einer Stadt ist: Lebensmittel, Wohnen, Dienstleistungen, Bauen – und wie hoch die Löhne sind.', 'Die Preise folgen Angebot und Nachfrage: Wo viele Menschen wohnen und wenige Betriebe oder Wohnungen da sind, wird es teurer. Wo viele Betriebe konkurrieren, wird es billiger.', 'Der Vergleich zum Durchschnitt zeigt dir, wo sich leben, arbeiten und gründen am meisten lohnt. Ämter wie Bürgermeister und Landtag können die Preise mit Beschlüssen beeinflussen.'], 'Preisbarometer');
  return html`<div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('trending-up')} <span>Preisbarometer</span> ${help}</div><span class="chip">${term('Preisindex', 'Preisindex')}</span></div>
    <h3 class="econ-city" data-i18n-skip>${d.city.name}</h3>
    <p class="small dim mt0"><span>So teuer ist das Leben hier im Vergleich zum Durchschnitt aller Orte im Jahr</span> <b>${d.year}</b><span>. Pfeile zeigen die Veränderung seit letztem Jahr.</span></p>
    ${d.enabled ? '' : html`<div class="alert info small">${icon('info')}<div>Die Stadtwirtschaft ist gerade abgeschaltet. Es gelten feste Stadtpreise.</div></div>`}
    <ul class="econ-rows">${b.rows.map((r) => row(r, d.market))}</ul>
    ${(d.tips || []).length ? html`<div class="stack mt" style="--gap:.5rem">${d.tips.map((t) => tipCard(t, cur))}</div>` : ''}
    <div class="econ-cmp mt"><div class="row spread wrap"><b>Vergleich mit anderen Orten</b><span class="small dim"><span>Unterschied zum Durchschnitt – tippe auf ein Symbol zum Sortieren</span></span></div>
      <div class="field mt pl-wrap"><label class="sr" for="ecSearch">Ort hinzufügen</label><input id="ecSearch" type="search" placeholder="Ort zum Vergleich hinzufügen …" autocomplete="off"><div class="pl-res" id="ecRes"></div></div>
      ${compareTable(d, sort)}</div>`;
}

/** Lädt die Daten und füllt die Karte; Städte zum Vergleich merkt sich die Sitzung. */
export async function bindEcon(root, ctx, cityId, { id = 'econBox' } = {}) {
  const box = root.querySelector(`#${id}`); if (!box) return;
  const ids = () => (ctx.ui.econCmp || []).filter((x) => x !== cityId);
  let busy = false;
  const load = async (quiet) => {
    if (busy) return; busy = true;
    try {
      const d = await api('GET', `/api/economy/city?cityId=${cityId}&ids=${ids().join(',')}`);
      if (!box.isConnected) return;
      box.innerHTML = render(d, ctx).__raw;
      box.dataset.loaded = '1';
      if (!quiet) window.dispatchEvent(new CustomEvent('tp-seen', { detail: 'prices' }));
      wire(d);
    } catch (e) { if (!quiet) box.innerHTML = html`<div class="card-title">${icon('trending-up')} Preisbarometer</div><div class="small dim">Die Preise sind gerade nicht erreichbar.</div>`.__raw; } finally { busy = false; }
  };
  const wire = (d) => {
    bindPlaceSearch(box.querySelector('#ecSearch'), box.querySelector('#ecRes'), ctx, {
      year: d.year, onPick: (c) => { if (c.id === cityId) return; const l = ctx.ui.econCmp || (ctx.ui.econCmp = []); if (!l.includes(c.id)) l.push(c.id); if (l.length > 8) l.shift(); load(true); },
    });
  };
  if (!box._bound) {
    box._bound = true;
    on(box, 'click', '[data-ec-sort]', (e, t) => { ctx.ui.econSort = t.dataset.ecSort; load(true); });
    on(box, 'click', '[data-ec-drop]', (e, t) => { ctx.ui.econCmp = (ctx.ui.econCmp || []).filter((x) => x !== Number(t.dataset.ecDrop)); load(true); });
    on(box, 'click', '[data-ec-city]', (e, t) => { ctx.ui.cityId = Number(t.dataset.ecCity); ctx.ui.newsCity = Number(t.dataset.ecCity); ctx.go(ctx.route === 'city' ? 'city' : 'city'); if (ctx.route === 'city') ctx.rerender(); });
    const live = () => { if (!box.isConnected) { window.removeEventListener('tp-live-economy', live); return; } if (!document.hidden) load(true); };
    window.addEventListener('tp-live-economy', live);
  }
  await load(false);
}
