/* Börse: Aktien von Spielerbetrieben handeln. Kurse laufen intern in „Wert von 1945“ (real); angezeigt wird in eigener Währung. */
import { term, html, icon, api, on, modal, toast, money, infoBtn } from './ui.js';

const k = (ctx) => ctx.view.idx || 1;
const m = (ctx, real) => money(Math.round(real * k(ctx)), ctx.view.currency);
const toReal = (ctx, v) => Math.round((Number(String(v).replace(/\./g, '').replace(',', '.')) * 100) / k(ctx));
const fromReal = (ctx, real) => (Math.round(real * k(ctx)) / 100).toFixed(2).replace('.', ',');
const apply = (ctx, r) => { if (r && r.view) { ctx.setView(r.view); ctx.hud(); } };
const sym = (ctx) => (ctx.view.currency === 'EUR' ? '€' : 'DM');

/** Börsengang (oder Rückzug) für einen eigenen Betrieb. */
export function openIpo(ctx, companyId, listed, onDone) {
  const c = ctx.view.companies.find((x) => x.id === companyId); if (!c) return;
  if (listed) {
    const dlg = modal(html`<h3>${icon('trending-up')} ${c.name} an der Börse</h3>
      <p class="dim small">${c.stock.outside} von 1.000 Anteilen liegen bei anderen. Ausschüttung: ${c.stock.div} % des Tagesgewinns an alle Anteilseigner. Mehrheitsaktionäre (ab 50 %) können den Betrieb übernehmen.</p>
      <div class="row end mt"><button class="btn ghost" data-close="no">Schließen</button><button class="btn danger" id="dl-go">Von der Börse nehmen</button></div>`);
    dlg.el.querySelector('#dl-go').onclick = async () => { try { await api('POST', '/api/social/exchange/delist', { companyId }); toast('Der Betrieb ist nicht mehr börsennotiert.'); dlg.close(); if (onDone) onDone(); } catch (e) { toast(e.message, 'warn'); } };
    return;
  }
  const dlg = modal(html`<h3>${icon('trending-up')} Börsengang: ${c.name}</h3>
    <p class="dim small">Dein Betrieb wird in 1.000 Anteile geteilt. Den Streubesitz bietest du zum fairen Kurs an; du erhältst bei jedem Verkauf den Erlös. Danach zahlt der Betrieb täglich eine Ausschüttung an alle Aktionäre – auch an dich. Wer 50 % der Anteile hält, kann den Betrieb übernehmen.</p>
    <div class="grid c2"><div class="field"><label for="ip-f">Streubesitz (%)</label><input id="ip-f" type="number" min="10" max="49" value="30"></div>
    <div class="field"><label for="ip-d">Ausschüttung vom Gewinn (%)</label><input id="ip-d" type="number" min="0" max="80" value="30"></div></div>
    <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="ip-go">An die Börse</button></div>`);
  dlg.el.querySelector('#ip-go').onclick = async () => {
    try { await api('POST', '/api/social/exchange/ipo', { companyId, floatPct: Number(dlg.el.querySelector('#ip-f').value), divPct: Number(dlg.el.querySelector('#ip-d').value) }); toast('Börsengang geglückt!'); if (window.TPMotion) window.TPMotion.confetti(); dlg.close(); if (onDone) onDone(); } catch (e) { toast(e.message, 'warn'); }
  };
}

function openTrade(ctx, s, side, onDone) {
  const ref = side === 'buy' ? Math.ceil(s.price * 1.05) : Math.floor(s.price * 0.95);
  const dlg = modal(html`<h3>${icon(side === 'buy' ? 'plus' : 'minus')} ${s.name}: ${side === 'buy' ? 'Kaufen' : 'Verkaufen'}</h3>
    <p class="dim small">Kurs ${m(ctx, s.price)} · Fairer Wert ${m(ctx, s.fair)}${side === 'sell' ? ` · Du besitzt ${s.held} Anteile` : ''}. Ein Kauf reserviert den Höchstpreis sofort; zu viel gezahltes Geld kommt zurück. Nicht ausgeführte Teile bleiben als Order offen.</p>
    <div class="grid c2"><div class="field"><label for="tr-n">Anteile</label><input id="tr-n" type="number" min="1" value="${side === 'sell' ? Math.min(s.held, 10) : 10}"></div>
    <div class="field"><label for="tr-p">${side === 'buy' ? 'Höchstpreis' : 'Mindestpreis'} je Anteil (${sym(ctx)})</label><input id="tr-p" type="text" inputmode="decimal" value="${fromReal(ctx, ref)}"></div></div>
    <div class="small dim" id="tr-sum"></div>
    <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="tr-go">${side === 'buy' ? 'Kauforder' : 'Verkaufsorder'}</button></div>`);
  const sum = () => { const n = Number(dlg.el.querySelector('#tr-n').value) || 0; const p = toReal(ctx, dlg.el.querySelector('#tr-p').value) || 0; dlg.el.querySelector('#tr-sum').textContent = `Höchstens ${m(ctx, n * p)}`; };
  dlg.el.addEventListener('input', sum); sum();
  dlg.el.querySelector('#tr-go').onclick = async () => {
    try { const r = await api('POST', '/api/social/exchange/order', { stockId: s.id, side, shares: Number(dlg.el.querySelector('#tr-n').value), priceReal: toReal(ctx, dlg.el.querySelector('#tr-p').value) }); apply(ctx, r); toast(r.moved ? `${r.moved} Anteile ausgeführt${r.left ? `, ${r.left} offen` : ''}.` : 'Order liegt im Orderbuch.'); dlg.close(); if (onDone) onDone(); } catch (e) { toast(e.message, 'warn'); }
  };
}

export function renderExchange(ctx, d) {
  const cityName = (id) => { const c = ctx.world.cityById.get(id); return c ? c.label : '–'; };
  if (!d.enabled) return html`<div class="card empty-note">${icon('trending-up', 'lg')}<span>Die Börse ist gerade geschlossen.</span></div>`;
  const book = (b) => (b ? html`<div class="small dim">${b.asks.length ? 'Verkauf: ' + b.asks.slice(0, 3).map((x) => `${x.n} × ${m(ctx, x.p)}`).join(', ') : 'Kein Verkaufsangebot'} · ${b.bids.length ? 'Kauf: ' + b.bids.slice(0, 3).map((x) => `${x.n} × ${m(ctx, x.p)}`).join(', ') : 'kein Kaufgebot'}</div>` : '');
  const row = (s) => html`<div class="firm" style="align-items:flex-start"><div class="grow"><b data-i18n-skip>${s.name}</b> <span class="dim small">${cityName(s.cityId)} · ${s.owner}</span>${s.mine ? html` <span class="chip">dein Betrieb</span>` : ''}
      <div class="row small" style="gap:.8rem"><b class="mono">${m(ctx, s.price)}</b>${s.change != null ? html`<span class="${s.change >= 0 ? 'pos' : 'neg'}">${s.change >= 0 ? '+' : ''}${String(s.change).replace('.', ',')} %</span>` : ''}<span class="dim">fair ${m(ctx, s.fair)}</span><span class="dim">Umsatz ${s.vol}</span><span class="dim">Ausschüttung ${s.div} %</span></div>${book(s.book)}
      ${s.held ? html`<div class="small">Du hältst <b>${s.held}</b> Anteile (${(s.held / s.shares * 100).toFixed(1).replace('.', ',')} %)</div>` : ''}</div>
    <div class="row nowrap wrap" style="justify-content:flex-end"><button class="btn sm primary" data-xbuy="${s.id}">Kaufen</button>${s.held ? html`<button class="btn sm" data-xsell="${s.id}">Verkaufen</button>` : ''}${!s.mine && s.held * 2 >= s.shares ? html`<button class="btn sm danger" data-xtake="${s.id}">Übernehmen</button>` : ''}</div></div>`;
  return html`<div class="grid c2" style="--gap:1rem">
    <section class="card" style="grid-column:1/-1"><div class="card-title">${icon('trending-up')} Börse ${infoBtn(['Spielerbetriebe können an die Börse gehen: 1.000 Anteile, davon 10–49 % im Streubesitz.', 'Kauf- und Verkaufsorders mit Limit treffen sich im Orderbuch. Die Börse selbst kauft und verkauft in begrenztem Umfang mit einem Aufschlag von ca. ' + d.config.spread + ' %, damit der Handel nie stillsteht.', 'Börsennotierte Betriebe schütten täglich einen Teil ihres Gewinns an alle Aktionäre aus.', 'Wer 50 % oder mehr der Anteile hält, kann den Betrieb übernehmen. Der bisherige Eigentümer bleibt Minderheitsaktionär.', 'Preise sind intern „Wert von 1945“; jeder zahlt in seiner eigenen Währung.'], 'Börse')}</div>
      <p class="dim small">Hier kaufst und verkaufst du ${term('Anteil', 'Anteile')} an Betrieben anderer Spieler. Der Kurs ist der aktuelle Preis eines Anteils, „fair“ der rechnerische Wert.</p>
      <div class="stack" style="--gap:.6rem">${d.stocks.map(row)}${d.stocks.length ? '' : html`<div class="dim small">Noch ist kein Betrieb börsennotiert. Starte unter „Unternehmen“ den ersten Börsengang (Mindestwert ${m(ctx, d.config.minValueReal)}).</div>`}</div></section>
    <section class="card"><div class="card-title">${icon('briefcase')} Mein Depot</div>
      <div class="stack" style="--gap:.4rem">${d.holdings.map((h) => html`<div class="firm"><div class="grow"><b data-i18n-skip>${h.name}</b> <span class="dim small">${h.shares} Anteile · Kurs ${m(ctx, h.price)}</span></div><span class="${h.price >= h.avg ? 'pos' : 'neg'} small mono">${h.avg ? (((h.price / h.avg) - 1) * 100).toFixed(1).replace('.', ',') + ' %' : ''}</span></div>`)}${d.holdings.length ? '' : html`<div class="dim small">Du hältst keine Aktien.</div>`}</div></section>
    <section class="card"><div class="card-title">${icon('scroll')} Offene Orders</div>
      <div class="stack" style="--gap:.4rem">${d.orders.map((o) => html`<div class="firm"><div class="grow"><b data-i18n-skip>${o.name}</b> <span class="dim small">${o.side === 'buy' ? 'Kauf' : 'Verkauf'} ${o.left} × ${m(ctx, o.price)}</span></div><button class="btn sm ghost" data-xcancel="${o.id}">Zurücknehmen</button></div>`)}${d.orders.length ? '' : html`<div class="dim small">Keine offenen Orders.</div>`}</div></section></div>`;
}

export function bindExchange(root, ctx, d, reload) {
  const find = (id) => d.stocks.find((x) => x.id === Number(id));
  on(root, 'click', '[data-xbuy]', (e, t) => { const s = find(t.dataset.xbuy); if (s) openTrade(ctx, s, 'buy', reload); });
  on(root, 'click', '[data-xsell]', (e, t) => { const s = find(t.dataset.xsell); if (s) openTrade(ctx, s, 'sell', reload); });
  on(root, 'click', '[data-xcancel]', async (e, t) => { try { await api('POST', '/api/social/exchange/cancel', { id: Number(t.dataset.xcancel) }); const r = await api('GET', '/api/me').catch(() => null); void r; toast('Order zurückgenommen.'); reload(); } catch (er) { toast(er.message, 'bad'); } });
  on(root, 'click', '[data-xtake]', async (e, t) => {
    const s = find(t.dataset.xtake); if (!s) return;
    if (!(await ctx.confirm({ title: `${s.name} übernehmen?`, text: 'Du übernimmst den Betrieb als Mehrheitsaktionär. Der bisherige Eigentümer bleibt Minderheitsaktionär.', ok: 'Übernehmen', danger: true }))) return;
    try { const r = await api('POST', '/api/social/exchange/takeover', { stockId: s.id }); apply(ctx, r); toast('Übernahme vollzogen.'); if (window.TPMotion) window.TPMotion.confetti(); reload(); } catch (er) { toast(er.message, 'bad'); }
  });
}
