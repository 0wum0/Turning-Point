/* Warenkreislauf: Versorgung der Betriebe, Lieferverträge, Lieferantensuche.
 * Preise in Verträgen sind „Wert von 1945“ (real); angezeigt wird in eigener Währung.
 * Für die englische Oberfläche stehen Zahlen, Einheiten und Namen in eigenen Elementen, damit jeder Textknoten einzeln übersetzbar ist. */
import { html, icon, api, on, modal, toast, money, infoBtn, term } from './ui.js';
import { repBadge } from './reputation.js';
import { harvestStrip } from './seasons.js';
const EN = () => document.documentElement.lang === 'en';
/** Zahl mit passendem Dezimalzeichen; kleine Mengen mit zwei, große ohne Nachkommastellen. */
export const dec = (n, digits) => {
  const d = digits != null ? digits : (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  let s = (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return EN() ? s : s.replace('.', ',');
};
const k = (ctx) => ctx.view.idx || 1;
/** Preis je Einheit (Wert 1945 in Cent) in heutigem Geld, zwei Nachkommastellen: 0,45 DM. */
const price = (ctx, real) => { const v = (real * k(ctx)) / 100; const s = Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1); return `${EN() ? s : s.replace('.', ',')} ${ctx.view.currency === 'EUR' ? '€' : 'DM'}`; };
const qty = (q, unit) => html`<span class="mono nw"><span>${dec(q)}</span> <span>${unit}</span></span>`;
const apply = (ctx, r) => { if (r && r.view) { ctx.setView(r.view); ctx.hud(); } };

const STATUS = {
  ok: ['good', 'Versorgung gut', 'circle-check'],
  tight: ['warn', 'Versorgung knapp', 'triangle-alert'],
  missing: ['bad', 'Versorgung fehlt', 'circle-alert'],
  none: ['good', 'Keine Zutaten nötig', 'circle-check'],
};
const SCAR = { knapp: ['warn', 'knapp'], reichlich: ['good', 'reichlich'] };

function needRow(n, c, v) {
  const chips = [];
  if (n.byContract > 0.005) chips.push(html`<span class="chip accent" title="Geliefert nach Liefervertrag">${icon('handshake')} Vertrag</span>`);
  if (n.byWholesale > 0.005) chips.push(html`<span class="chip" title="Beim Großhandel gekauft (etwas teurer)">${icon('store')} Großhandel</span>`);
  if (n.missing > 0.005) chips.push(html`<span class="chip bad" title="Diese Menge fehlt, die Leistung sinkt">${icon('circle-alert')} fehlt</span>`);
  return html`<div class="sup-need">
    <div class="sup-need-top"><span class="nm">${icon(n.icon || 'package')} <b>${n.name}</b></span><span class="q">${qty(n.need, n.unit)} <span class="dim">pro Tag</span></span></div>
    <div class="sup-need-bot"><span class="chips">${chips}</span><span class="cost mono">${n.cost > 0 ? money(n.cost, v.currency) : '–'}</span>
      <button class="btn sm ghost" data-supply-find="${n.good}" data-id="${c.id}" data-side="supplier" title="Anbieter in deiner Region suchen">${icon('search')} Lieferant suchen</button></div>
  </div>`;
}

const daysLeft = (d) => Math.max(0, Math.round(d.daysLeft == null ? d.term || 0 : d.daysLeft));
/** Eine Vertragszeile: wer liefert wem was. buy = ich kaufe. */
function dealLine(x, buy, ctx) {
  const who = x.other || x.otherName || 'Spieler';
  const firm = x.otherFirm;
  return html`<div class="grow small"><div><b>${buy ? 'Du kaufst' : 'Du verkaufst'}</b> ${qty(x.qty, x.unit)} <b>${x.name || x.goodName}</b> <span>pro Tag ${buy ? 'von' : 'an'}</span> <span data-i18n-skip>${who}${firm ? ` (${firm})` : ''}</span> ${repBadge(x.otherUser || x.sellerId)}</div>
    <div class="dim"><span>${price(ctx, x.priceReal)}</span> <span>je</span> <span>${x.unit}</span> · ${x.status === 'offer' ? html`<span>${`${x.term} Tage`}</span>` : (x.daysLeft != null || x.term) ? html`<span>${`noch ${daysLeft(x)} Tage`}</span>` : ''}${x.auto ? html` · <span>verlängert sich</span>` : ''}${x.fill != null && x.fill < 0.98 && x.status !== 'offer' ? html` · <span>${`liefert zu ${Math.round(x.fill * 100)} %`}</span>` : ''}</div></div>`;
}
const dealRow = (d, buy, ctx) => html`<div class="firm sup-deal">${dealLine(d, buy, ctx)}<span class="deal-st">${statusChip(d)}</span><button class="btn sm ghost" data-contract-cancel="${d.id}" title="Vertrag kündigen">${icon('x')}</button></div>`;

/** Die „Versorgung“-Box eines Betriebs (Klartext, Ampel, Schalter, Suche). */
export function supplyBox(c, v, ctx) {
  const s = c.supply; if (!s || !s.on) return '';
  const [tone, label, ic] = STATUS[s.status] || STATUS.ok;
  const open = ctx.ui.supOpen ? ctx.ui.supOpen[c.id] !== false : true;
  const cur = v.currency;
  const lack = s.needs.filter((n) => n.missing > 0.005).map((n) => n.name);
  const lead = s.primary
    ? html`<p class="small dim sup-lead">Dieser Betrieb stellt seine Waren selbst her und braucht keine Zutaten.</p>`
    : html`<p class="small sup-lead">${s.status === 'ok' ? 'Dein Betrieb ist gut versorgt. Jeden Tag braucht er:' : s.status === 'tight' ? 'Es wird knapp. Jeden Tag braucht dein Betrieb:' : 'Es fehlen Zutaten. Jeden Tag braucht dein Betrieb:'}</p>`;
  return html`<details class="sup ${tone}" data-sup="${c.id}" ${open ? 'open' : ''}>
    <summary><span class="row nowrap spread" style="gap:.5rem"><b>${icon('package')} Versorgung</b><span class="row nowrap" style="gap:.4rem"><span class="chip ${tone}">${icon(ic)} ${label}</span>${icon('chevron-down', 'sup-caret')}</span></span></summary>
    ${lead}
    <div class="stack" style="--gap:.45rem">${s.needs.map((n) => needRow(n, c, v))}</div>
    ${!s.primary ? html`<div class="row nowrap spread small mt"><span>Zutaten pro Tag</span><b class="mono">${money(s.cost, cur)}</b></div>
      ${s.subsidy > 0 ? html`<div class="small pos">${icon('landmark')} <span>Zuschuss vom Staat eingerechnet:</span> <span class="mono">${money(s.subsidy, cur)}</span></div>` : ''}
      ${s.status !== 'ok' ? html`<div class="alert ${s.status === 'missing' ? 'bad' : 'warn'} small mt">${icon('triangle-alert')}<div><span>Leistung nur</span> <b>${Math.round(s.factor * 100)} %</b>${lack.length ? html` <span>– es fehlt:</span> ${lack.map((n, i) => html`${i ? ', ' : ''}<b>${n}</b>`)}` : ''}<div>${s.auto ? 'Schließe einen Liefervertrag oder warte, bis sich der Markt beruhigt.' : 'Schalte „Automatisch einkaufen“ ein, damit der Betrieb im Großhandel nachkauft.'}</div></div></div>` : ''}` : ''}
    <label class="sup-auto mt"><input type="checkbox" data-supply-auto="${c.id}" ${c.autoBuy ? 'checked' : ''}><span><b>Automatisch einkaufen</b><br><span class="dim small">Was Verträge nicht liefern, kauft der Betrieb beim günstigsten Anbieter – meist im Großhandel (rund ${v.goods.markupPct} % teurer als per Vertrag).</span></span></label>
    <div class="small mt sup-out"><b>Hergestellt pro Tag:</b> ${s.outputs.map((o, i) => html`${i ? ', ' : ' '}${qty(o.units, o.unit)} <span>${o.name}</span>`)}</div>
    ${s.contractIncome > 0 ? html`<div class="small pos mt"><span>Einnahmen aus Lieferverträgen:</span> <span class="mono">${money(s.contractIncome, cur)}</span> <span>pro Tag</span></div>` : ''}
  </details>`;
}


/* ------------------------------------------------------------------ Lieferverträge einer Firma (immer sichtbar) ------------------------------------------------------------------ */
/** Was geht bei diesem Betrieb? Zutaten (Lieferant suchen) und handelbare Erzeugnisse (Abnehmer suchen); Dienstleistungen sind nicht handelbar. */
function tradeOptions(c, v) {
  const s = c.supply; const goodsOn = !!(v.goods && v.goods.enabled) && !!(s && s.on);
  const needs = goodsOn && s ? s.needs : [];
  const sellable = goodsOn && s ? s.outputs.filter((o) => !o.service) : [];
  const services = goodsOn && s ? s.outputs.filter((o) => o.service) : [];
  return { goodsOn, needs, sellable, services };
}
const statusChip = (d) => (d.fill != null && d.fill < 0.98 ? html`<span class="chip warn">liefert zu ${Math.round(d.fill * 100)} %</span>` : html`<span class="chip good">${icon('circle-check')} läuft</span>`);

export function contractsSection(c, v, ctx) {
  const deals = c.deals || { buys: [], sells: [] };
  const n = deals.buys.length + deals.sells.length;
  const { goodsOn, needs, sellable, services } = tradeOptions(c, v);
  const dead = !!c.abandoned;
  const off = dead || !goodsOn;
  const noSupplier = !needs.length; const noBuyer = !sellable.length;
  const why = dead ? 'Der Betrieb steht leer – wiederbeleben, dann sind Verträge wieder möglich.'
    : 'Lieferverträge sind im Moment vom Spielbetrieb abgeschaltet. Dein Betrieb kauft und verkauft dann direkt über den Großhandel.';
  const notes = [];
  if (!off && noSupplier) notes.push('Dieser Betrieb stellt seine Waren selbst her und braucht keine Zutaten – einen Lieferanten brauchst du nicht.');
  if (!off && noBuyer) notes.push(services.length ? html`<span>Dieser Betrieb erbringt eine Dienstleistung:</span> ${services.map((o, i) => html`${i ? ', ' : ''}<span>${o.name}</span>`)}<span>. Dienstleistungen verkauft er direkt an Kunden – dafür gibt es keine Verträge, nur für Zutaten, die er einkauft.</span>` : 'Dieser Betrieb stellt nichts her, was andere Betriebe als Zutat brauchen.');
  return html`<section class="sup-contracts ${n ? '' : 'empty'}" data-contracts="${c.id}">
    <div class="row nowrap spread"><b>${icon('handshake')} Lieferverträge</b><span class="chip ${n ? 'accent' : ''}">${n ? `${n} laufend` : 'keine'}</span></div>
    ${n ? html`<div class="stack mt" style="--gap:.4rem">${deals.buys.map((d) => dealRow(d, true, ctx))}${deals.sells.map((d) => dealRow(d, false, ctx))}</div>`
    : html`<p class="small dim mt">${off ? why : 'Noch kein Liefervertrag. Ein Vertrag mit einem anderen Spieler ist rund 20 % günstiger als der Großhandel.'}</p>`}
    <div class="row mt" style="gap:.4rem">
      <button class="btn sm" data-contract-find="supplier" data-id="${c.id}" ${off || noSupplier ? 'disabled' : ''}>${icon('search')} Lieferant suchen</button>
      <button class="btn sm" data-contract-find="buyer" data-id="${c.id}" ${off || noBuyer ? 'disabled' : ''}>${icon('search')} Abnehmer suchen</button>
      <button class="btn sm primary" data-contract-propose="${c.id}" ${off || (noSupplier && noBuyer) ? 'disabled' : ''}>${icon('handshake')} Vertrag vorschlagen</button>
    </div>
    ${notes.map((t) => html`<p class="small dim mt">${icon('info')} ${t}</p>`)}
  </section>`;
}

/** „Meine Lieferverträge“ – eigene Fläche oben in der Unternehmensübersicht (lädt Angebote und Verträge aller Firmen). */
export function contractsPanel(v) {
  const g = v.goods || {};
  return html`<section class="card" id="myContracts" data-spot-supply>
    <div class="card-title">${icon('handshake')} Meine Lieferverträge ${infoBtn(['Ein Liefervertrag legt fest: Wer liefert wem welche Ware, wie viel pro Tag, zu welchem Preis und wie lange.', 'Der Käufer zahlt jeden Tag automatisch aus der Firmenkasse, der Lieferant bekommt das Geld in seine Kasse. Verträge sind günstiger als der Großhandel.', 'Bei jedem Betrieb findest du den Abschnitt „Lieferverträge“ mit „Lieferant suchen“ und „Abnehmer suchen“.'], 'Lieferverträge')}</div>
    ${g.enabled === false ? html`<p class="small dim">Lieferverträge sind im Moment vom Spielbetrieb abgeschaltet.</p>` : ''}
    <div id="supContracts" class="stack" style="--gap:.4rem"><div class="dim small">Lade …</div></div>
  </section>`;
}

/** Auswahl, wofür ein Vertrag vorgeschlagen werden soll (Zutat einkaufen oder Erzeugnis verkaufen). */
function openPropose(ctx, c, again, only) {
  let { needs, sellable } = tradeOptions(c, ctx.view);
  if (only === 'supplier') sellable = []; else if (only === 'buyer') needs = [];
  const dlg = modal(html`<h3>${icon('handshake')} ${only === 'supplier' ? 'Lieferant suchen' : only === 'buyer' ? 'Abnehmer suchen' : 'Vertrag vorschlagen'}</h3><p class="small dim">Wähle, worüber du mit einem anderen Spieler einen Liefervertrag schließen möchtest:</p><p class="small"><b data-i18n-skip>${c.name}</b></p>
    ${needs.length ? html`<div class="card-title mt">Zutat einkaufen</div><div class="stack" style="--gap:.4rem">${needs.map((n) => html`<button class="btn" data-pr="supplier" data-good="${n.good}">${icon(n.icon || 'package')} <span>Lieferant für</span> ${n.name}</button>`)}</div>` : ''}
    ${sellable.length ? html`<div class="card-title mt">Erzeugnis verkaufen</div><div class="stack" style="--gap:.4rem">${sellable.map((o) => html`<button class="btn" data-pr="buyer" data-good="${o.good}">${icon(o.icon || 'package')} <span>Abnehmer für</span> ${o.name}</button>`)}</div>` : ''}
    <div class="row end mt"><button class="btn ghost" data-close="x">Schließen</button></div>`);
  on(dlg.el, 'click', '[data-pr]', (e, t) => { dlg.close(); openPartners(ctx, c.id, t.dataset.good, t.dataset.pr, again); });
}

/* ------------------------------------------------------------------ Warenkreislauf-Übersicht ------------------------------------------------------------------ */
export function cyclePanel(v, ctx) {
  const g = v.goods; if (!g || !g.enabled) return '';
  const quest = v.onboarding && v.onboarding.quests ? v.onboarding.quests.find((q) => q.id === 'contract') : null;
  const open = ctx.ui.cycleOpen != null ? ctx.ui.cycleOpen : !(quest && quest.done);
  const chains = g.chains.map((ch) => html`<div class="chain"><div class="chain-name small dim">${ch.name}</div><div class="chain-steps">${ch.steps.map((s, i) => html`${i ? html`<span class="arr">${icon('arrow-right')}</span>` : ''}<span class="step ${s.mine ? 'mine' : ''}" title="${s.good}">${icon(s.icon)}<span>${s.label}</span>${s.mine ? html`<small>dein Betrieb</small>` : ''}</span>`)}</div></div>`);
  return html`<details class="card sup-panel" id="cyclePanel" data-spot-supply ${open ? 'open' : ''}>
    <summary><span class="row nowrap spread"><span class="card-title" style="margin:0">${icon('layers')} Warenkreislauf – so hängt alles zusammen</span>${icon('chevron-down', 'sup-caret')}</span></summary>
    <div class="mt">${harvestStrip(v)}</div>
    <p class="small mt">Jeder Betrieb stellt Waren her und braucht dafür Zutaten: Die Bäckerei braucht Mehl, die Mühle braucht Getreide, der Bauernhof liefert es. Fehlen Zutaten, arbeitet der Betrieb schlechter.</p>
    <ol class="small sup-steps"><li><b>Einfach:</b> Fehlende Zutaten kauft der Betrieb automatisch im ${term('Großhandel')} – immer lieferbar, aber rund ${g.markupPct} % teurer.</li><li><b>Besser:</b> Schließe einen ${term('Liefervertrag')} mit einem anderen Betrieb. Das ist günstiger, und der Lieferant verdient mehr als im Großhandel.</li><li><b>Preise</b> hängen von Angebot und Nachfrage ab – und von den Beschlüssen der Ämter (Steuern, Zoll, Zuschüsse).</li></ol>
    <div class="stack mt" style="--gap:.5rem">${chains}</div>
    ${g.prices.length ? html`<div class="card-title mt" style="margin-bottom:.3rem">Großhandelspreise bei dir in der Stadt</div>
      <div class="sup-prices small">${g.prices.map((p) => html`<div class="pr"><span>${icon(p.icon)} <span>${p.name}</span></span><span class="mono nw">${price(ctx, p.buy)} <span class="dim">/ ${p.unit}</span></span>${SCAR[p.scarLabel] ? html`<span class="chip ${SCAR[p.scarLabel][0]}">${SCAR[p.scarLabel][1]}</span>` : html`<span></span>`}${p.subsidy ? html`<span class="chip good" title="Zuschuss auf den Einkauf">−${p.subsidy} %</span>` : p.tariffPct ? html`<span class="chip warn" title="Zoll auf den importierten Anteil">Zoll ${p.tariffPct > 0 ? '+' : ''}${dec(p.tariffPct, 1)} %</span>` : html`<span></span>`}</div>`)}</div>` : ''}
  </details>`;
}

async function loadContracts(root, ctx) {
  const box = root.querySelector('#supContracts'); if (!box) return;
  let d;
  try { d = await api('GET', '/api/supply/mine'); } catch (e) { box.innerHTML = html`<div class="dim small">Die Verträge konnten gerade nicht geladen werden.</div>`.__raw; return; }
  const row = (x, kind) => html`<div class="firm sup-deal"><div class="grow small"><div class="dim"><span>Betrieb:</span> <b data-i18n-skip>${x.myFirm || 'Betrieb'}</b> ${x.status === 'offer' ? html`<span class="chip warn">Angebot</span>` : html`<span class="chip good">läuft</span>`}</div>${dealLine({ ...x, name: x.goodName }, x.role === 'buy', ctx)}</div>
    <div class="row nowrap" style="gap:.3rem">${kind === 'in' ? html`<button class="btn sm primary" data-contract-yes="${x.id}">Annehmen</button><button class="btn sm" data-contract-no="${x.id}">Ablehnen</button>` : kind === 'out' ? html`<button class="btn sm" data-contract-cancel="${x.id}">Zurückziehen</button>` : html`<button class="btn sm ghost" data-contract-cancel="${x.id}" title="Vertrag kündigen">${icon('x')}</button>`}</div></div>`;
  const inc = d.offers.filter((x) => x.incoming); const out = d.offers.filter((x) => !x.incoming);
  box.innerHTML = (inc.length + out.length + d.contracts.length === 0)
    ? html`<div class="alert info small">${icon('info')}<div><p style="margin:0 0 .3rem"><b>Was ist ein Liefervertrag?</b> Zwei Spieler-Betriebe vereinbaren, dass einer dem anderen täglich eine Ware zu einem festen Preis liefert.</p><p style="margin:0">Das spart dem Käufer etwa 20 % gegenüber dem Großhandel, und der Lieferant verdient mehr als beim Verkauf an die Stadt. Starte bei einem Betrieb mit „Lieferant suchen“ oder „Abnehmer suchen“.</p></div></div>`.__raw
    : html`${inc.length ? html`<div class="small"><b>Angebote an dich</b></div>${inc.map((x) => row(x, 'in'))}` : ''}${d.contracts.length ? html`<div class="small mt"><b>Laufende Verträge</b></div>${d.contracts.map((x) => row(x, 'active'))}` : ''}${out.length ? html`<div class="small mt"><b>Deine offenen Angebote</b></div>${out.map((x) => row(x, 'out'))}` : ''}`.__raw;
}

/* ------------------------------------------------------------------ Dialoge ------------------------------------------------------------------ */
async function openPartners(ctx, companyId, good, side, after) {
  const c = ctx.view.companies.find((x) => x.id === companyId); if (!c) return;
  const supplier = side !== 'buyer';
  const dlg = modal(html`<h3>${icon('handshake')} ${supplier ? 'Lieferant suchen' : 'Abnehmer suchen'}</h3><div id="plBody" class="dim small">Suche läuft …</div><div class="row end mt"><button class="btn ghost" data-close="x">Schließen</button></div>`, { wide: true });
  let d;
  try { d = await api('GET', `/api/supply/partners?companyId=${companyId}&good=${encodeURIComponent(good)}&side=${supplier ? 'supplier' : 'buyer'}`); } catch (e) { dlg.el.querySelector('#plBody').textContent = e.message; return; }
  const body = dlg.el.querySelector('#plBody');
  const need = supplier ? (c.supply.needs.find((n) => n.good === good) || {}).need : (c.supply.outputs.find((o) => o.good === good) || {}).units;
  body.className = '';
  body.innerHTML = html`<p class="small"><b>${d.good}</b>: <span>${supplier ? 'Diese Betriebe stellen die Ware her.' : 'Diese Betriebe brauchen die Ware.'}</span> <span>Im Vertrag legt ihr Menge, Preis und Laufzeit fest.</span> <span>Richtpreis:</span> <b class="mono">${price(ctx, d.baseReal)}</b> <span>je</span> <span>${d.unit}</span></p>
    <div class="stack" style="--gap:.5rem">${d.list.length ? d.list.map((p, i) => html`<div class="firm" style="align-items:flex-start"><div class="grow small"><b data-i18n-skip>${p.firm}</b> ${p.sameCity ? html`<span class="chip good">in deiner Stadt</span>` : ''}
      <div class="dim"><span data-i18n-skip>${p.city} · ${p.owner}</span> ${repBadge(p.userId)}</div>
      <div class="dim"><span>${supplier ? 'Kann etwa liefern:' : 'Braucht etwa:'}</span> ${qty(p.units, d.unit)} <span>pro Tag</span>${p.deals ? html` · <span>${p.deals} Verträge bisher</span>` : html` · <span>neu am Markt</span>`}${p.linked ? html` · <span>Vertrag besteht</span>` : ''}</div></div>
      <button class="btn sm primary" data-pick="${i}" ${p.linked ? 'disabled' : ''}>Vertrag anbieten</button></div>`) : html`<div class="alert info small">${icon('info')}<div>${d.note || 'Gerade bietet niemand in deiner Region diese Ware an. Der Großhandel springt ein, solange „Automatisch einkaufen“ an ist.'}</div></div>`}</div>`.__raw;
  on(dlg.el, 'click', '[data-pick]', (e, t) => { const p = d.list[Number(t.dataset.pick)]; dlg.close(); openOffer(ctx, c, p, d, supplier, need, after); });
}

function openOffer(ctx, c, p, d, supplier, need, after) {
  const q0 = Math.max(0.1, Math.round(Math.min(need || p.units || 1, p.units || need || 1) * 10) / 10);
  const dlg = modal(html`<h3>${icon('handshake')} Vertrag anbieten</h3>
    <p class="small"><b>${d.good}</b> <span>${supplier ? 'von' : 'an'}</span> <b data-i18n-skip>${p.firm}</b> <span class="dim" data-i18n-skip>(${p.owner})</span></p>
    <div class="grid c2" style="--gap:.7rem"><div class="field"><label for="of-q">Menge pro Tag (${d.unit})</label><input id="of-q" type="number" min="0.1" step="0.1" value="${q0}"></div>
    <div class="field"><label for="of-t">Laufzeit</label><select id="of-t">${[30, 60, 90, 180, 365].map((n) => html`<option value="${n}" ${n === 90 ? 'selected' : ''}>${n} Tage</option>`)}</select></div></div>
    <div class="field"><label for="of-p">Preis: <b id="of-pv"></b></label><input id="of-p" type="range" min="${d.min}" max="${d.max}" step="1" value="100"></div>
    <div class="small dim" id="of-sum"></div>
    ${d.band && d.band.pad ? html`<div class="small dim mt">${icon('badge-check')} <span>Dein Ansehen</span> „${d.band.name}“ <span>${d.band.pad > 0 ? 'weitet den erlaubten Preisrahmen' : 'verengt den erlaubten Preisrahmen'}:</span> ${d.min}–${d.max} %</div>` : ''}
    <label class="sup-auto mt"><input type="checkbox" id="of-a" checked><span><b>Automatisch verlängern</b><br><span class="dim small">Der Vertrag läuft nach Ablauf von selbst weiter, bis jemand kündigt.</span></span></label>
    <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="of-go">Angebot senden</button></div>`);
  const q = dlg.el.querySelector('#of-q'); const pr = dlg.el.querySelector('#of-p');
  const upd = () => {
    const pct = Number(pr.value); const real = d.baseReal * pct / 100; const amount = Number(q.value) || 0;
    dlg.el.querySelector('#of-pv').textContent = `${pct} % = ${price(ctx, real)}`;
    const wh = d.baseReal * (supplier ? 1.25 : 0.8); const save = (supplier ? wh - real : real - wh) * amount * k(ctx);
    dlg.el.querySelector('#of-sum').innerHTML = html`<span>${supplier ? 'Im Großhandel zahlst du etwa' : 'Der Großhandel zahlt dir nur etwa'}</span> <b class="mono">${price(ctx, wh)}</b> <span>je</span> <span>${d.unit}</span>. ${save > 0 ? html`<span>${supplier ? 'Mit dem Vertrag sparst du' : 'Mit dem Vertrag verdienst du'}</span> <b class="pos">${money(save, ctx.view.currency)}</b> <span>pro Tag mehr.</span>` : html`<span class="neg">Dieser Preis ist schlechter als der Großhandel.</span>`}`.__raw;
  };
  dlg.el.addEventListener('input', upd); upd();
  dlg.el.querySelector('#of-go').onclick = async () => {
    try {
      await api('POST', '/api/supply/offer', { role: supplier ? 'buy' : 'sell', myCompany: c.id, otherUser: p.userId, otherCompany: p.companyId, good: d.key, qty: Number(q.value), pricePct: Number(pr.value), termDays: Number(dlg.el.querySelector('#of-t').value), auto: dlg.el.querySelector('#of-a').checked });
      toast('Das Angebot ist unterwegs. Du bekommst Post, sobald geantwortet wird.'); dlg.close(); if (after) after();
    } catch (e) { toast(e.message, 'bad'); }
  };
}

/* ------------------------------------------------------------------ Verdrahtung ------------------------------------------------------------------ */
export function bindSupply(root, ctx) {
  const again = () => ctx.rerender();
  const firmOf = (t) => ctx.view.companies.find((x) => x.id === Number(t.dataset.id || t.dataset.contractPropose));
  on(root, 'click', '[data-contract-find]', (e, t) => {
    const c = firmOf(t); if (!c) return; const side = t.dataset.contractFind; const o = tradeOptions(c, ctx.view);
    const list = side === 'buyer' ? o.sellable : o.needs;
    if (list.length === 1) openPartners(ctx, c.id, list[0].good, side, again); else openPropose(ctx, c, again, side);
  });
  on(root, 'click', '[data-contract-propose]', (e, t) => { const c = firmOf(t); if (c) openPropose(ctx, c, again); });
  on(root, 'click', '[data-supply-find]', (e, t) => { e.preventDefault(); openPartners(ctx, Number(t.dataset.id), t.dataset.supplyFind, t.dataset.side, again); });
  on(root, 'change', '[data-supply-auto]', (e, t) => ctx.act('bizSupply', { id: Number(t.dataset.supplyAuto), on: t.checked }));
  root.querySelectorAll('details.sup').forEach((d) => d.addEventListener('toggle', () => { ctx.ui.supOpen = ctx.ui.supOpen || {}; ctx.ui.supOpen[Number(d.dataset.sup)] = d.open; }));
  const cp = root.querySelector('#cyclePanel'); if (cp) cp.addEventListener('toggle', () => { ctx.ui.cycleOpen = cp.open; });
  const act = async (fn, msg) => { try { const r = await fn(); apply(ctx, r); if (msg) toast(msg); again(); } catch (err) { toast(err.message, 'bad'); } };
  on(root, 'click', '[data-contract-yes]', (e, t) => act(() => api('POST', '/api/supply/respond', { id: Number(t.dataset.contractYes), accept: true }), 'Vertrag abgeschlossen. Ab dem nächsten Spieltag wird geliefert.'));
  on(root, 'click', '[data-contract-no]', (e, t) => act(() => api('POST', '/api/supply/respond', { id: Number(t.dataset.contractNo), accept: false }), 'Angebot abgelehnt.'));
  on(root, 'click', '[data-contract-cancel]', async (e, t) => {
    if (await ctx.confirm({ title: 'Vertrag beenden?', text: 'Der Vertrag wird sofort gekündigt. Danach kauft bzw. verkauft dein Betrieb wieder über den Großhandel.', ok: 'Beenden', danger: true })) act(() => api('POST', '/api/supply/cancel', { id: Number(t.dataset.contractCancel) }), 'Vertrag beendet.');
  });
  loadContracts(root, ctx);
}
