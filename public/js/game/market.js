/* Spielermarkt: Angebote, Verkaufspreis, Versteigerungen. Preise laufen intern in „Wert von 1945“ (real); angezeigt wird in eigener Währung. */
import { html, raw, icon, api, on, modal, toast, money, esc, infoBtn } from './ui.js';

const k = (ctx) => ctx.view.idx || 1;
const m = (ctx, real) => money(Math.round(real * k(ctx)), ctx.view.currency);
const toReal = (ctx, v) => Math.round((Number(String(v).replace(/\./g, '').replace(',', '.')) * 100) / k(ctx));
const fromReal = (ctx, real) => (Math.round(real * k(ctx)) / 100).toFixed(2).replace('.', ',');
const apply = (ctx, r) => { if (r && r.view) { ctx.setView(r.view); ctx.hud(); } };
const left = (iso) => { const s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)); const h = Math.floor(s / 3600); const mi = Math.floor((s % 3600) / 60); return h >= 24 ? `${Math.floor(h / 24)} T ${h % 24} Std` : h ? `${h} Std ${mi} Min` : `${mi} Min`; };
const kindName = (x) => (x === 'prop' ? 'Immobilie' : 'Betrieb');

/** Kaufangebot an den Eigentümer. */
export function openOffer(ctx, spec, onDone) {
  const [kind, ownerId, itemId] = spec.split(':'); const btn = document.querySelector(`[data-offer="${spec}"]`);
  const name = (btn && btn.dataset.name) || 'Gegenstand'; const value = Number(btn && btn.dataset.value) || 0; const ask = btn && btn.dataset.ask ? Number(btn.dataset.ask) : null;
  const dlg = modal(html`<h3>${icon('hand-coins')} Angebot für „${name}“</h3>
    <p class="dim small">Richtwert: <b>${m(ctx, value)}</b>${ask ? html` · Verkaufspreis: <b>${m(ctx, ask)}</b>` : ''}. Gebühren (${kind === 'prop' ? 'Grunderwerbsteuer 3,5 %' : 'Beurkundung 1,5 %'}) trägst du zusätzlich.</p>
    <div class="field"><label for="of-p">Dein Gebot (${ctx.view.currency === 'EUR' ? '€' : 'DM'})</label><input id="of-p" type="text" inputmode="decimal" value="${fromReal(ctx, ask || value)}"></div>
    <div class="field"><label for="of-m">Nachricht (optional)</label><input id="of-m" type="text" maxlength="200" placeholder="z. B. Ich zahle sofort."></div>
    <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button>${ask ? html`<button class="btn" id="of-now">Sofort kaufen</button>` : ''}<button class="btn primary" id="of-go">Angebot senden</button></div>`);
  dlg.el.querySelector('#of-go').onclick = async () => {
    try { await api('POST', '/api/social/market/offer', { kind, ownerId: Number(ownerId), itemId: Number(itemId), priceReal: toReal(ctx, dlg.el.querySelector('#of-p').value), message: dlg.el.querySelector('#of-m').value }); toast('Angebot verschickt. Der Eigentümer wird benachrichtigt.'); dlg.close(); if (onDone) onDone(); } catch (e) { toast(e.message, 'warn'); }
  };
  const now = dlg.el.querySelector('#of-now'); if (now) now.onclick = async () => { dlg.close(); await buyNow(ctx, kind, Number(ownerId), Number(itemId), name, ask, onDone); };
}

export async function buyNow(ctx, kind, sellerId, itemId, name, ask, onDone) {
  if (!(await ctx.confirm({ title: `„${name}“ sofort kaufen?`, text: `Preis ${m(ctx, ask)} zuzüglich Gebühren. Der Kauf ist endgültig.`, ok: 'Kaufen' }))) return;
  try { const r = await api('POST', '/api/social/market/buy', { sellerId, kind, itemId }); apply(ctx, r); toast('Gekauft!'); if (window.TPMotion) window.TPMotion.confetti(); if (onDone) onDone(); } catch (e) { toast(e.message, 'bad'); }
}

/** Eigener Gegenstand: Verkaufspreis festlegen oder versteigern. */
export function openSell(ctx, kind, itemId, name, valueReal, askReal, onDone) {
  const dlg = modal(html`<h3>${icon('hand-coins')} „${name}“ verkaufen</h3>
    <p class="dim small">Marktwert: <b>${m(ctx, valueReal)}</b>. Käufer zahlen zusätzlich Gebühren.</p>
    <div class="field"><label for="sl-p">Verkaufspreis (${ctx.view.currency === 'EUR' ? '€' : 'DM'})</label><input id="sl-p" type="text" inputmode="decimal" value="${fromReal(ctx, askReal || valueReal)}"><div class="hint">Jeder Spieler kann dann sofort kaufen. Du siehst es im Stadtverzeichnis als „Zu verkaufen“.</div></div>
    <div class="row"><button class="btn primary" id="sl-ask">Zum Verkauf anbieten</button>${askReal ? html`<button class="btn ghost" id="sl-off">Angebot zurückziehen</button>` : ''}</div>
    <hr><div class="field"><label>Oder versteigern</label><div class="row nowrap"><input id="sl-min" type="text" inputmode="decimal" value="${fromReal(ctx, Math.round(valueReal * 0.6))}" aria-label="Mindestgebot"><select id="sl-h" aria-label="Dauer"><option value="6">6 Std</option><option value="24" selected>24 Std</option><option value="48">48 Std</option></select></div><div class="hint">Mindestgebot und Dauer. Während der Auktion ist der Gegenstand nicht in deinem Besitz; ohne Gebot kommt er zurück.</div></div>
    <div class="row end"><button class="btn ghost" data-close="no">Schließen</button><button class="btn" id="sl-auc">${icon('gavel')} Versteigern</button></div>`);
  const done = (msg, r) => { if (r) apply(ctx, r); toast(msg); dlg.close(); if (onDone) onDone(); };
  dlg.el.querySelector('#sl-ask').onclick = async () => { try { await api('POST', '/api/social/market/ask', { kind, itemId, priceReal: toReal(ctx, dlg.el.querySelector('#sl-p').value) }); done('Zum Verkauf angeboten.'); } catch (e) { toast(e.message, 'warn'); } };
  const off = dlg.el.querySelector('#sl-off'); if (off) off.onclick = async () => { try { await api('POST', '/api/social/market/ask', { kind, itemId, priceReal: null }); done('Angebot zurückgezogen.'); } catch (e) { toast(e.message, 'warn'); } };
  dlg.el.querySelector('#sl-auc').onclick = async () => {
    if (!(await ctx.confirm({ title: 'Wirklich versteigern?', text: 'Der Gegenstand wird sofort aus deinem Besitz genommen und versteigert.', ok: 'Versteigern', danger: true }))) return;
    try { const r = await api('POST', '/api/social/market/auction/start', { kind, itemId, minReal: toReal(ctx, dlg.el.querySelector('#sl-min').value), hours: Number(dlg.el.querySelector('#sl-h').value) }); done('Die Versteigerung läuft.', r); } catch (e) { toast(e.message, 'warn'); }
  };
}

export function openBid(ctx, a, onDone) {
  const floor = a.lead == null ? a.min : Math.ceil(a.lead * 1.05);
  const dlg = modal(html`<h3>${icon('gavel')} Gebot für „${a.name}“</h3>
    <p class="dim small">${a.reason === 'estate' ? 'Zwangsversteigerung (Insolvenzmasse)' : 'Versteigerung von ' + a.seller} · Marktwert ${m(ctx, a.value)} · ${a.lead != null ? 'Höchstgebot ' + m(ctx, a.lead) : 'Mindestgebot ' + m(ctx, a.min)} · endet in ${left(a.ends)}</p>
    <div class="field"><label for="bd-p">Dein Gebot (${ctx.view.currency === 'EUR' ? '€' : 'DM'})</label><input id="bd-p" type="text" inputmode="decimal" value="${fromReal(ctx, floor)}"><div class="hint">Mindestens ${m(ctx, floor)}. Gebühren kommen hinzu; bei Zuschlag muss das Geld da sein.</div></div>
    <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="bd-go">Bieten</button></div>`);
  dlg.el.querySelector('#bd-go').onclick = async () => { try { await api('POST', '/api/social/market/auction/bid', { id: a.id, priceReal: toReal(ctx, dlg.el.querySelector('#bd-p').value) }); toast('Gebot abgegeben.'); dlg.close(); if (onDone) onDone(); } catch (e) { toast(e.message, 'warn'); } };
}

/* ---------------- Tab „Markt“ ---------------- */
export function renderMarket(ctx, d) {
  const cityName = (id) => { const c = ctx.world.cityById.get(id); return c ? c.label : '–'; };
  const offer = (o) => html`<div class="firm" style="align-items:flex-start"><div class="grow"><b data-i18n-skip>${o.name}</b> <span class="chip">${kindName(o.kind)}</span>
      <div class="dim small">${o.mine ? 'Dein ' + (o.iAmBuyer ? 'Kaufangebot' : 'Verkaufsangebot') + ' an ' + o.other : (o.parent ? 'Gegenangebot von ' : (o.iAmBuyer ? 'Verkaufsangebot von ' : 'Kaufangebot von ')) + o.other} · läuft bis ${new Date(o.expires).toLocaleDateString('de-DE')}</div>
      ${o.message ? html`<div class="small" data-i18n-skip>„${o.message}“</div>` : ''}<div class="row small" style="margin-top:.3rem"><b class="mono">${m(ctx, o.price)}</b></div></div>
    <div class="row nowrap">${o.mine ? html`<button class="btn sm ghost" data-moff="withdraw" data-id="${o.id}">Zurückziehen</button>` : html`<button class="btn sm primary" data-moff="accept" data-id="${o.id}">Annehmen</button><button class="btn sm" data-moff="counter" data-id="${o.id}" data-price="${o.price}">Gegenangebot</button><button class="btn sm ghost" data-moff="decline" data-id="${o.id}">Ablehnen</button>`}</div></div>`;
  const own = (kind, x) => html`<div class="firm"><div class="grow"><b data-i18n-skip>${x.name}</b> <span class="dim small">${cityName(x.cityId)}${x.abandoned ? ' · verlassen' : ''}</span><div class="small dim">Wert ${m(ctx, x.value)}${x.ask != null ? html` · <span class="chip accent">Zu verkaufen für ${m(ctx, x.ask)}</span>` : ''}</div></div><button class="btn sm" data-sell="${kind}:${x.id}" data-name="${x.name}" data-value="${x.value}" data-ask="${x.ask == null ? '' : x.ask}">Verkaufen …</button></div>`;
  const auc = (a) => html`<div class="firm"><div class="grow"><b data-i18n-skip>${a.name}</b> <span class="chip ${a.reason === 'estate' ? 'warn' : ''}">${a.reason === 'estate' ? 'Zwangsversteigerung' : 'Versteigerung'}</span> <span class="dim small">${cityName(a.cityId)} · ${a.seller}</span>
      <div class="small dim">Wert ${m(ctx, a.value)} · ${a.lead != null ? 'Höchstgebot ' + m(ctx, a.lead) + (a.leading ? ' (du)' : '') : 'ab ' + m(ctx, a.min)} · endet in ${left(a.ends)}</div></div>${a.mine ? html`<span class="chip">deine</span>` : html`<button class="btn sm primary" data-bid="${a.id}">Bieten</button>`}</div>`;
  return html`<div class="grid c2" style="--gap:1rem">
    <section class="card"><div class="card-title">${icon('handshake')} Angebote ${infoBtn(['Kaufangebote gehen an den Eigentümer, der annehmen, ablehnen oder ein Gegenangebot machen kann.', 'Beträge sind intern auf den Wert von 1945 umgerechnet; jede Seite zahlt und erhält in ihrer eigenen Währung.', 'Gebühren trägt der Käufer: Immobilien 3,5 % Grunderwerbsteuer, Betriebe 1,5 % Beurkundung.'], 'Angebote')}</div>
      <div class="stack" style="--gap:.6rem">${d.offers.map(offer)}${d.offers.length ? '' : html`<div class="dim small">Keine offenen Angebote. Im Stadtverzeichnis kannst du jedem Eigentümer ein Angebot machen.</div>`}</div>
      ${d.recent.length ? html`<div class="card-title mt">Zuletzt</div><div class="stack small dim" style="--gap:.3rem">${d.recent.map((o) => html`<div><span data-i18n-skip>${o.name}</span>: ${m(ctx, o.price)} – ${{ accepted: 'angenommen', declined: 'abgelehnt', countered: 'Gegenangebot' }[o.status]}</div>`)}</div>` : ''}</section>
    <section class="card"><div class="card-title">${icon('hand-coins')} Mein Besitz zum Verkauf</div>
      <div class="stack" style="--gap:.5rem">${d.props.map((x) => own('prop', x))}${d.firms.map((x) => own('firm', x))}${d.props.length + d.firms.length ? '' : html`<div class="dim small">Du besitzt noch nichts, das du verkaufen könntest.</div>`}</div></section>
    <section class="card" style="grid-column:1/-1"><div class="card-title">${icon('gavel')} Versteigerungen in ${cityName(ctx.view.city.id)}</div>
      <div class="stack" style="--gap:.5rem">${d.auctions.map(auc)}${d.auctions.length ? '' : html`<div class="dim small">Zurzeit läuft hier keine Versteigerung. Insolvenzmassen und freiwillige Versteigerungen erscheinen an dieser Stelle.</div>`}</div></section></div>`;
}

export function bindMarket(root, ctx, d, reload) {
  on(root, 'click', '[data-moff]', async (e, t) => {
    const id = Number(t.dataset.id); const act = t.dataset.moff;
    try {
      if (act === 'withdraw') { await api('POST', '/api/social/market/withdraw', { id }); toast('Angebot zurückgezogen.'); }
      else if (act === 'counter') {
        const dlg = modal(html`<h3>Gegenangebot</h3><div class="field"><label for="co-p">Dein Preis (${ctx.view.currency === 'EUR' ? '€' : 'DM'})</label><input id="co-p" type="text" inputmode="decimal" value="${fromReal(ctx, Number(t.dataset.price))}"></div><div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="co-go">Senden</button></div>`);
        dlg.el.querySelector('#co-go').onclick = async () => { try { await api('POST', '/api/social/market/respond', { id, action: 'counter', priceReal: toReal(ctx, dlg.el.querySelector('#co-p').value) }); dlg.close(); toast('Gegenangebot gesendet.'); reload(); } catch (er) { toast(er.message, 'warn'); } };
        return;
      } else { const r = await api('POST', '/api/social/market/respond', { id, action: act }); apply(ctx, r); toast(act === 'accept' ? 'Abgeschlossen!' : 'Abgelehnt.'); if (act === 'accept' && window.TPMotion) window.TPMotion.confetti(); }
      reload();
    } catch (er) { toast(er.message, 'bad'); }
  });
  on(root, 'click', '[data-sell]', (e, t) => { const [kind, id] = t.dataset.sell.split(':'); openSell(ctx, kind, Number(id), t.dataset.name, Number(t.dataset.value), t.dataset.ask ? Number(t.dataset.ask) : null, reload); });
  on(root, 'click', '[data-bid]', (e, t) => { const a = d.auctions.find((x) => x.id === Number(t.dataset.bid)); if (a) openBid(ctx, a, reload); });
}
