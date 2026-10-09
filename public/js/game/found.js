/* Unternehmen gründen: zweistufiger Dialog (1 Betriebsart wählen, 2 Name + Zusammenfassung + Bestätigen).
 * Alle Preise und Regeln kommen vom Server (v.found); geprüft wird dort erneut (Aktion foundBiz).
 * Jeder dynamische Wert steht in einem eigenen Element, damit die englische Oberfläche jeden Textknoten einzeln übersetzen kann. */
import { html, icon, money, modal, on, signed, mount } from './ui.js';

const LEVELS = ['Anfänger', 'Geselle', 'Fachkraft', 'Meister', 'Altmeister'];
const names = (list) => list.map((x, i) => html`${i ? ', ' : ''}<span>${x.name}</span>`);

/* Marktlage vor Ort (Nachfrage und Konkurrenz) in einem Satz plus Kennzahlen */
const MARKET = {
  crowded: ['warn', 'Viel Konkurrenz – die Nachfrage ist knapp'],
  busy: ['', 'Einige Betriebe dieser Art – es wird eng'],
  ok: ['good', 'Die Nachfrage reicht für einen weiteren Betrieb'],
  free: ['good', 'Kaum Konkurrenz – die Nachfrage ist frei'],
};
const marketChip = (m) => (m ? html`<span class="chip ${MARKET[m.state][0]}" title="Betriebe dieser Art in der Stadt (Spieler und Bots) gegen die Nachfrage der Stadt">${MARKET[m.state][1]}</span>` : '');

function explainNoQualification(v) {
  return html`<h3>${icon('store')} Unternehmen gründen</h3>
    <div class="found-help">
      <p>Eine Firma darfst du nur führen, wenn du den passenden Beruf gelernt hast – ein Bäcker eröffnet eine Bäckerei, ein Maurer eine Baufirma.</p>
      <p><b>Dir fehlt gerade so eine Qualifikation.</b> So bekommst du sie:</p>
      <ol class="small">
        <li><b>Arbeit:</b> <span>Wer in einem Beruf arbeitet, sammelt Berufsjahre und steigt zum Gesellen und Meister auf.</span></li>
        <li><b>Lehre oder Kurs:</b> <span>Unter „Beruf“ kannst du einen weiteren Beruf lernen, zum Beispiel Bäcker, Wirt, Tischler oder Landwirt.</span></li>
        <li><b>Partner:</b> <span>Lebt dein Partner mit dir zusammen, kannst du Betriebe seines Berufs auf der Einstiegsstufe eröffnen.</span></li>
      </ol>
      ${v.found && v.found.full ? html`<div class="alert warn small">${icon('triangle-alert')}<div>Du besitzt schon die höchste Anzahl an Unternehmen.</div></div>` : ''}
    </div>
    <div class="row end mt"><button class="btn ghost" data-close="x">Schließen</button><button class="btn primary" data-found-go="work">${icon('graduation-cap')} Zu Beruf und Kursen</button></div>`;
}

function step1(v) {
  const f = v.found; const cur = v.currency;
  const cards = f.options.map((o) => {
    const min = Math.min(...o.tiers.map((t) => t.price));
    const can = !f.full && v.money >= min;
    const multi = o.tiers.length > 1;
    const sell = o.outputs.filter((x) => !x.service);
    const top = o.tiers[o.tiers.length - 1];
    return html`<button type="button" class="found-card ${can ? '' : 'off'}" data-found-pick="${o.pkey}" ${can ? '' : 'disabled'}>
      <span class="fc-ic">${icon(o.icon || 'store')}</span>
      <span class="fc-body"><b>${top.tierName}</b>
        <span class="small dim">${sell.length ? html`<span>Stellt</span> ${names(sell)} <span>her und verkauft es an die Stadt.</span>` : html`<span>Bietet Dienstleistungen an und verkauft sie an die Stadt.</span>`}</span>
        <span class="small fc-meta">${multi ? html`<span>ab</span> ` : ''}<b>${money(min, cur)}</b> · <span>${o.tiers[0].rooms} Räume</span> · <span>${multi ? 'Berufsstufe ab' : 'Berufsstufe'}</span> <span>${LEVELS[o.tiers[0].minLevel]}</span></span>
        <span class="small fc-meta">${marketChip(top.market)}</span>
        ${can ? '' : html`<span class="small neg">${f.full ? html`<span>Höchstzahl an Unternehmen erreicht</span>` : html`<span>Dir fehlen</span> <b>${money(min - v.money, cur)}</b>`}</span>`}
      </span></button>`;
  });
  return html`<h3>${icon('store')} Unternehmen gründen</h3>
    <div class="small dim">Schritt 1 von 2 – Was für ein Betrieb soll es werden?</div>
    <div class="small mt"><span>Ort der Gründung:</span> <b data-i18n-skip>${f.city}</b></div>
    <div class="small dim"><span>Diese Betriebsarten erlaubt dir deine Qualifikation:</span></div>
    <div class="found-grid mt">${cards}</div>
    <div class="row end mt"><button class="btn ghost" data-close="x">Abbrechen</button></div>`;
}

function step2(v, o, tierIdx, name) {
  const cur = v.currency; const t = o.tiers.find((x) => x.tier === tierIdx) || o.tiers[o.tiers.length - 1];
  const can = v.money >= t.price && !v.found.full;
  const sell = t.outputs.filter((x) => !x.service);
  return html`<h3>${icon(o.icon || 'store')} <span data-i18n-skip>${t.tierName}</span></h3>
    <div class="small dim">Schritt 2 von 2 – Name und Überblick</div>
    ${o.tiers.length > 1 ? html`<div class="field mt"><label>Größe</label><div class="row" style="gap:.4rem;flex-wrap:wrap">${o.tiers.map((x) => html`<button type="button" class="chip-btn ${x.tier === t.tier ? 'on' : ''}" data-found-tier="${x.tier}" ${v.money >= x.price ? '' : 'disabled'}><span>${x.tierName}</span> · ${money(x.price, cur)}</button>`)}</div></div>` : ''}
    <div class="field mt"><label for="found-name">Name deines Unternehmens</label><input id="found-name" type="text" minlength="${v.found.nameMin}" maxlength="${v.found.nameMax}" value="${name}" autocomplete="off" spellcheck="false"><div class="small dim"><span>${v.found.nameMin} bis ${v.found.nameMax} Zeichen, keine Internetadressen.</span></div></div>
    <dl class="kv small mt">
      <dt>Gründungspreis</dt><dd><b>${money(t.price, cur)}</b></dd>
      <dt>Räume</dt><dd>${t.rooms}</dd>
      <dt>Unterhalt pro Tag</dt><dd class="neg">${money(t.upkeep, cur)}</dd>
      <dt>Zutaten</dt><dd>${t.inputs.length ? names(t.inputs) : html`<span>keine – der Betrieb stellt alles selbst her</span>`}</dd>
      <dt>Erzeugnis</dt><dd>${sell.length ? names(sell) : html`<span>Dienstleistung (wird direkt an Kunden verkauft)</span>`}</dd>
      ${t.market ? html`<dt>Nachfrage vor Ort</dt><dd>${marketChip(t.market)}<div class="small dim"><span>${t.market.firms} Betriebe dieser Art in der Stadt · Nachfrage ${t.market.total} von ${t.market.cap} Räumen</span></div></dd>` : ''}
      ${t.market && t.market.sector ? html`<dt>Preisniveau der Branche</dt><dd><span>${t.market.sectorName}</span> <b>${t.market.level >= 1 ? '+' : '−'}${Math.round(Math.abs(t.market.level - 1) * 100)} %</b> <span class="dim small">(wirkt auf deinen Umsatz)</span></dd>` : ''}
      ${t.profit != null ? html`<dt>Gewinn pro Tag*</dt><dd class="${t.profit >= 0 ? 'pos' : 'neg'}"><b>${signed(t.profit, cur)}</b></dd>` : ''}
    </dl>
    ${t.profit != null ? html`<div class="small dim mt"><span>* Bei voller Besetzung, nach Zutaten, Löhnen, Unterhalt und Steuern. Zu Beginn hast du noch keine Mitarbeiter: Arbeite zuerst selbst im Betrieb und stelle dann nach und nach Leute ein.</span> <span>Nötige Mitarbeiter:</span> <span>${t.staff}</span> <span>und ein Manager.</span></div>` : ''}
    ${can ? '' : html`<div class="alert warn small mt">${icon('triangle-alert')}<div><span>Dir fehlen</span> <b>${money(Math.max(0, t.price - v.money), cur)}</b></div></div>`}
    <div id="found-err" class="small neg mt" role="alert"></div>
    <div class="row end mt"><button class="btn ghost" data-found-back="1">Zurück</button><button class="btn primary" id="found-go" ${can ? '' : 'disabled'}>${icon('check')} <span>Gründen für</span> ${money(t.price, cur)}</button></div>`;
}

/** Öffnet den Gründungsdialog. */
export function openFound(ctx) {
  const v = ctx.view; const f = v.found;
  if (!f || !f.options.length) {
    const d = modal(explainNoQualification(v));
    on(d.el, 'click', '[data-found-go]', (e, t) => { d.close(); ctx.go(t.dataset.foundGo); });
    return;
  }
  const dlg = modal(step1(v), { wide: true });
  const cur = { o: null, tier: 0, name: '', touched: false };
  const show = (h) => { mount(dlg.el, h); const x = dlg.el.querySelector('input, button.primary, button'); if (x) x.focus({ preventScroll: true }); };
  const toStep2 = (o, tier) => {
    cur.o = o; cur.tier = tier;
    if (!cur.touched) cur.name = o.tiers.find((x) => x.tier === tier).suggest;
    show(step2(ctx.view, o, tier, cur.name));
    const inp = dlg.el.querySelector('#found-name'); if (inp) inp.addEventListener('input', () => { cur.name = inp.value; cur.touched = true; });
  };
  on(dlg.el, 'click', '[data-found-pick]', (e, t) => {
    const o = f.options.find((x) => x.pkey === t.dataset.foundPick); if (!o) return;
    const affordable = o.tiers.filter((x) => v.money >= x.price); const pick = affordable[affordable.length - 1] || o.tiers[0];
    cur.touched = false; toStep2(o, pick.tier);
  });
  on(dlg.el, 'click', '[data-found-tier]', (e, t) => toStep2(cur.o, Number(t.dataset.foundTier)));
  on(dlg.el, 'click', '[data-found-back]', () => { show(step1(ctx.view)); });
  on(dlg.el, 'click', '#found-go', async (e, btn) => {
    const name = (dlg.el.querySelector('#found-name') || {}).value || '';
    btn.disabled = true; const err = dlg.el.querySelector('#found-err');
    try { await ctx.act('foundBiz', { pkey: cur.o.pkey, tier: cur.tier, name }); dlg.close(); }
    catch (er) { if (err) err.textContent = er.message || 'Das hat nicht geklappt.'; btn.disabled = false; }
  });
}

/** Die auffällige Hauptschaltfläche (immer sichtbar) samt Kurzhinweis. */
export function foundBar(v) {
  const f = v.found || { options: [], full: false };
  const hint = f.full ? html`<span>Du besitzt die höchste Anzahl an Unternehmen.</span>`
    : !f.options.length ? html`<span>Du brauchst noch einen passenden Beruf – wir zeigen dir, wie du ihn bekommst.</span>`
      : f.canAfford ? html`<span>Du kannst jetzt gründen – ab</span> <b>${money(f.cheapest, v.currency)}</b>` : html`<span>Noch etwas sparen: Die günstigste Gründung kostet</span> <b>${money(f.cheapest, v.currency)}</b>`;
  return html`<div class="card found-bar"><div class="grow"><b>${icon('trending-up')} Eigenes Unternehmen</b><div class="small dim">${hint}</div></div>
    <button class="btn primary" data-found="1">${icon('plus')} Unternehmen gründen</button></div>`;
}

export function bindFound(root, ctx) {
  if (ctx.ui.openFound) { ctx.ui.openFound = false; setTimeout(() => openFound(ctx), 60); }
  on(root, 'click', '[data-found]', () => openFound(ctx));
}
