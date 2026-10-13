/* Charakterblatt (Oberfläche): Erfahrungspunkte verteilen, Ausstattung wählen, gesellschaftlicher Rang, Chronik-Auszug.
 * Daten kommen fertig vom Server (view.char). Die Seite ist für Design V2 und das Standarddesign dieselbe; Zahlen stehen in eigenen Elementen
 * (für die englische Oberfläche). Alle Knöpfe rufen ausschließlich Spielaktionen des Servers auf (chTrain, chAuto, chBuy, chSell, chRepair, chService). */
import { html, icon, money, infoBtn, bar, on, modal, term } from './ui.js';
import { isOpen } from './onboarding.js';

const lang = () => document.documentElement.lang;
const dec = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(lang() === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: d });
const BAND_TONE = ['', 'good', 'good', 'gold'];
const SOURCE_ORDER = ['arbeit', 'handel', 'fuehrung', 'lernen', 'begegnung', 'sport'];

const pips = (lv, max = 3) => html`<span class="ops-pips" role="img" aria-label="Stufe ${lv} von ${max}">${Array.from({ length: max }, (_, i) => html`<i class="${i < lv ? 'on' : ''}"></i>`)}</span>`;
const whyText = (l) => (l.why === 'era' ? `Gibt es erst ab ${l.from}.` : l.why === 'money' ? 'Dafür reicht dein Geld nicht.' : l.why === 'off' ? 'Gerade ausgeschaltet.' : '');
const rankTone = (lv) => (lv >= 6 ? 'gold' : lv >= 3 ? 'good' : '');

/** Kleine Karte für die Übersicht: Rang, Erfahrung, Auftreten. */
export function charMini(ctx) {
  const c = ctx.view.char; if (!c || !c.on) return '';
  if (!isOpen(ctx, 'character')) return '';
  const r = c.rank;
  return html`<section class="card mt char-mini" data-ch-mini>
    <div class="row spread wrap"><div class="card-title" style="margin:0">${icon('id-card')} ${term('Rang', 'Dein Rang')}: <b>${r.name}</b></div>
      <button class="btn sm" data-go="character">${icon('id-card')} <span>Zum Charakterblatt</span></button></div>
    <div class="row wrap mt small">
      <span class="chip ${rankTone(r.lv)}">${icon('award')} <span>Rang</span> <b>${r.lv}</b> <span>von 7</span></span>
      ${c.xp ? html`<span class="chip ${c.xp.bal >= 2 ? 'accent' : ''}">${icon('sparkles')} <b>${dec(c.xp.bal)}</b> <span>Erfahrungspunkte</span></span>` : ''}
      <span class="chip ${BAND_TONE[['schlicht', 'gepflegt', 'repräsentativ', 'glanzvoll'].indexOf(c.lookBand)]}">${icon('shirt')} <span>Auftreten:</span> <b>${c.lookBand}</b></span>
    </div>
    ${r.next ? html`<div class="mt">${bar(Math.max(0, Math.min(100, (r.score - (r.levels[r.lv - 1].at)) / Math.max(1, r.next.at - r.levels[r.lv - 1].at) * 100)), '')}<div class="small dim mt"><span>Noch</span> ${dec(r.next.missing)} <span>Punkte bis</span> ${r.next.name}</div></div>` : ''}
  </section>`;
}

/* ------------------------------------------------------------------ Seite ------------------------------------------------------------------ */
function heroCard(ctx, c) {
  const v = ctx.view; const r = c.rank; const p = v.person;
  const occ = v.occupation;
  return html`<section class="card char-hero" data-ch-rank>
    <div class="row nowrap" style="gap:1rem;align-items:flex-start">
      <div class="avatar ${p.gender} char-avatar" aria-hidden="true">${p.first.slice(0, 1)}${p.last.slice(0, 1)}</div>
      <div class="grow stack" style="--gap:.25rem">
        <h3 class="serif" style="margin:0" data-i18n-skip>${p.name}</h3>
        <div class="dim small"><span data-i18n-skip>${p.age}</span> <span>Jahre</span> · <span>Generation</span> <span data-i18n-skip>${v.generation}</span> · <span data-i18n-skip>${v.city.name}</span>${occ ? html` · <span data-i18n-skip>${occ.name}</span>` : ''}</div>
        <div class="row wrap small" style="margin-top:.3rem">
          <span class="chip ${rankTone(r.lv)} char-rank-chip">${icon('award')} <span>Rang</span> <b>${r.lv}</b> · <b>${r.name}</b></span>
          ${c.titles.map((t) => html`<span class="chip gold" data-i18n-skip>${icon('crown')} ${t.name}</span>`)}
          <span class="chip ${BAND_TONE[['schlicht', 'gepflegt', 'repräsentativ', 'glanzvoll'].indexOf(c.lookBand)]}">${icon('shirt')} ${term('Auftreten')}: <b>${c.lookBand}</b> · ${Math.round(c.look)}</span>
          ${c.xp ? html`<span class="chip ${c.xp.bal >= 2 ? 'accent' : ''}">${icon('sparkles')} <b>${dec(c.xp.bal)}</b> ${term('Erfahrungspunkte', 'Erfahrungspunkte')}</span>` : ''}
        </div>
      </div>
      ${infoBtn(['Das Charakterblatt zeigt, wer du bist: deine Talente, was du trägst und fährst und welchen Platz du in der Gesellschaft einnimmst.', 'Alles hier ist freiwillig. Erfahrung macht dich besser, Ausstattung wirkt ein wenig und zeigt Status, der Rang bringt weiche Vorteile. Gesperrt wird dadurch nie etwas – auch das Kanzleramt bleibt für jeden erreichbar.', 'Steck deine Erfahrungspunkte in ein Talent, kauf dir mit Maß etwas Passendes und schau, was dir zum nächsten Rang fehlt.'], 'Charakterblatt')}
    </div>
    ${r.next ? html`<div class="mt"><div class="row spread small"><span>${r.name}</span><span>${r.next.name}</span></div>${bar(Math.max(0, Math.min(100, (r.score - r.levels[r.lv - 1].at) / Math.max(1, r.next.at - r.levels[r.lv - 1].at) * 100)), 'good')}<div class="small dim mt"><span>Noch</span> ${dec(r.next.missing)} <span>Punkte bis zum nächsten Rang.</span></div></div>`
      : html`<div class="small dim mt">${icon('crown')} <span>Höchster Rang erreicht.</span></div>`}
  </section>`;
}

function talentCardHtml(ctx, c) {
  const x = c.xp; const t = ctx.view.talents;
  if (!x || !t || !t.me) return html`<section class="card" data-ch-xp><div class="card-title">${icon('sparkles')} ${term('Erfahrungspunkte')}</div><div class="dim small">Talente sind gerade ausgeschaltet.</div></section>`;
  const bars = t.me.bars.map((b) => ({ ...b }));
  return html`<section class="card" data-ch-xp>
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('sparkles')} ${term('Erfahrungspunkte')}: <b>${dec(x.bal)}</b></div>
      ${infoBtn(['Erfahrung sammelst du, wenn du arbeitest, Menschen führst, lernst, Verträge schließt oder Menschen triffst. Jede Quelle hat einen Deckel pro Jahr.', 'Mit Erfahrung steigerst du deine Talente – dauerhaft, aber nur bis zur Grenze deiner Anlage (der kleine Strich im Balken). Je höher ein Talent, desto teurer der nächste Punkt. Jedes Talent braucht nach einer Steigerung eine Pause.', 'Tippe auf das Plus beim Talent, das du fördern willst, oder lass die Beste Wahl entscheiden.'], 'Erfahrungspunkte')}</div>
    <div class="stack mt" style="--gap:.4rem">${x.buys.map((b) => html`<div class="ch-tal">
      <span class="tal-ic" title="${b.label}">${icon(b.icon)}</span><span class="tal-lb">${b.label}</span>
      <div class="tal-bar b${b.v < 40 ? 0 : b.v < 60 ? 1 : b.v < 75 ? 2 : 3}" role="img" aria-label="${b.label}"><i style="width:${b.v}%"></i>${b.cap > b.v ? html`<u style="left:${b.cap}%"></u>` : ''}</div>
      <b class="tal-v">${b.v}</b>
      <button class="btn sm ${b.ok ? 'primary' : ''}" data-ch-train="${b.key}" ${b.ok ? '' : 'disabled'} title="${b.ok ? '' : b.why}" aria-label="${b.label} steigern">${icon('plus')} <span class="mono">${b.cost}</span></button></div>`)}</div>
    <div class="small dim mt"><span>Ein Punkt kostet je nach Wert 2 bis 10 Erfahrung. Noch</span> <b>${x.yearLeft}</b> <span>Steigerungen in diesem Spieljahr (höchstens</span> ${x.yearMax}<span>), je Talent</span> ${x.waitDays} <span>Tage Pause.</span></div>
    <div class="row wrap mt">
      <button class="btn sm primary" data-ch-best="1" ${x.buys.some((b) => b.ok) ? '' : 'disabled'}>${icon('sparkles')} <span>Beste Wahl</span></button>
      <button class="btn sm" data-ch-all="1" ${x.buys.some((b) => b.ok) ? '' : 'disabled'}>${icon('layers')} <span>Alles verteilen</span></button>
      <label class="row small" style="gap:.4rem;cursor:pointer"><input type="checkbox" data-ch-auto="1" ${x.auto ? 'checked' : ''}> <span>Automatisch verteilen</span></label>
    </div>
    <div class="ch-src mt">
      <div class="card-title" style="margin:0 0 .3rem">${icon('activity')} <span>Woher die Erfahrung kommt</span></div>
      ${SOURCE_ORDER.map((k) => x.sources.find((s) => s.key === k)).filter(Boolean).map((s) => html`<div class="ch-srow" title="${s.text}">
        <span class="tal-ic">${icon(s.icon)}</span><span class="small" style="min-width:0">${s.label}${s.talent ? html` <span class="dim">· ${s.talent}</span>` : ''}</span>
        ${bar(s.pct, s.pct >= 100 ? 'warn' : 'good')}<span class="small mono">${dec(s.got)}<span class="dim">/${dec(s.cap)}</span></span></div>`)}
      <div class="small dim mt">${icon('info')} <span>Die Balken zeigen, wie viel Erfahrung du in diesem Spieljahr aus jeder Quelle schon bekommen hast.</span></div>
    </div>
    ${x.last.length ? html`<div class="small mt"><b>Zuletzt:</b> ${x.last.slice(0, 4).map((e) => html`<span class="chip small">${e.label} +${dec(e.p)}</span> `)}</div>` : ''}
  </section>`;
}

function rankCardHtml(ctx, c) {
  const r = c.rank; const P = r.parts; const W = r.weights;
  const part = (label, v, max, tone = 'good') => html`<div class="ch-prow"><span class="small">${label}</span>${bar(max > 0 ? v / max * 100 : 0, tone)}<span class="small mono">${dec(v)}<span class="dim">/${dec(max, 0)}</span></span></div>`;
  return html`<section class="card" data-ch-ladder>
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('award')} ${term('Rang', 'Gesellschaftlicher Rang')}</div>
      ${infoBtn(['Dein Rang (1 bis 7) wird aus deinem Ansehen, deinem Vermögen (inflationsbereinigt), deinen Titeln und Ämtern, deinem Auftreten und deiner Herkunft berechnet. Er geht nur langsam wieder verloren.', 'Höhere Ränge bringen weiche Vorteile: günstigere Immobilien und ein Vorab-Angebot, Beziehungen bei Bewerbungen, eine günstigere Kandidatur und mehr Vereinsplätze. Nichts wird gesperrt – kein Amt und kein Kauf hängt am Rang.', 'Zahle pünktlich, handle fair, sammle Titel, bau Vermögen auf und achte auf dein Auftreten.'], 'Rang')}</div>
    <div class="mt"><b class="serif" style="font-size:1.15rem">${r.name}</b><div class="small dim">${r.text}</div></div>
    <div class="stack mt" style="--gap:.3rem">
      ${part('Ansehen', P.rep, W.rep)}${part('Vermögen', P.wealth, W.wealth)}${part('Titel und Ämter', P.title, W.title)}${part('Auftreten', P.gear, W.gear)}${part('Herkunft', P.legacy, W.origin, '')}
      <div class="row spread small"><b>Summe</b><b class="mono">${dec(P.total)} <span class="dim">/ 100</span></b></div>
    </div>
    <ol class="ch-ladder mt">${r.levels.map((l) => html`<li class="${l.done ? 'done' : ''} ${l.lv === r.lv ? 'now' : ''}"><span class="mono">${l.lv}</span><span>${l.name}</span><span class="small dim mono">ab ${l.at}</span></li>`)}</ol>
    <div class="card-title mt" style="margin-bottom:.3rem">${icon('key')} <span>Weiche Vorteile</span></div>
    <ul class="ch-perks">${r.perks.map((p) => html`<li class="${p.on ? 'on' : ''}"><span>${icon(p.on ? 'check' : 'lock')}</span><span>${p.text}${p.on && p.value ? html` <b>${p.unit === '%' ? '−' : '+'}${dec(p.value)}${p.unit === '%' ? ' %' : p.unit ? ' ' + p.unit : ''}</b>` : ''}</span><span class="small dim">${p.from ? html`<span>ab Rang</span> ${p.from}` : ''}</span></li>`)}</ul>
    <div class="small dim mt">${icon('info')} <span>Nichts davon sperrt etwas: Alle Angebote bleiben für alle sichtbar, und jedes Amt bis zum Bundeskanzler bleibt erreichbar.</span></div>
  </section>`;
}

function levelBtn(s, l, cur) {
  const reason = whyText(l);
  const label = s.kind === 'service' ? html`<span>${l.name}</span> · ${money(l.dayCost, cur)} <span>pro Tag</span>` : html`<span>${s.lv ? 'Wechseln zu:' : 'Kaufen:'}</span> ${l.name} · ${money(l.price, cur)}`;
  if (l.current) return html`<div class="ch-lv cur"><span class="chip good small">${icon('check')} <span>Aktuell</span></span> <b>${l.name}</b></div>`;
  return html`<button class="btn sm ${l.ok ? '' : ''}" ${s.kind === 'service' ? html`data-ch-svc="${s.key}:${l.lv}"` : html`data-ch-buy="${s.key}:${l.lv}"`} ${l.ok ? '' : 'disabled'} title="${reason || l.text}">${icon(s.kind === 'service' ? 'handshake' : 'shopping-basket')} ${label}</button>`;
}

function slotHtml(s, cur, infoOf) {
  const heir = s.heir;
  return html`<div class="ch-slot" data-ch-slot="${s.key}">
    <div class="row spread nowrap"><b class="ops-mod-t">${icon(s.icon)} <span>${s.name}</span></b><span class="row nowrap">${pips(s.effLv, s.max)}${infoOf(s)}</span></div>
    <div class="small ${s.lv || heir ? '' : 'dim'}">${s.lv ? html`<b data-i18n-skip>${s.name_cur}</b>` : s.key === 'kleidung' ? html`<span>Alltagskleidung</span>` : html`<span>Nichts</span>`}${s.dated ? html` · <span class="chip small warn">${icon('clock')} <span>aus der Mode</span></span>` : ''}</div>
    ${heir ? html`<div class="small">${icon('gem')} <span>Erbstück:</span> <b data-i18n-skip>${heir.name}</b> · <span class="dim">${heir.cond} %</span></div>` : ''}
    ${s.cond != null ? html`<div class="row small" style="gap:.4rem"><span class="dim">Zustand</span>${bar(s.cond, s.cond < 40 ? 'bad' : 'good')}<span class="mono">${s.cond} %</span></div>` : ''}
    <div class="small dim">${s.look ? html`<span>Auftreten:</span> +${dec(s.look)}` : ''}${s.dayCost ? html`${s.look ? ' · ' : ''}<span>Kosten:</span> ${money(s.dayCost, cur)} <span>pro Tag</span>` : ''}${s.resale ? html` · <span>Verkaufswert:</span> ${money(s.resale, cur)}` : ''}</div>
    <div class="ch-lvs mt">${s.levels.map((l) => levelBtn(s, l, cur))}</div>
    <div class="row wrap mt">
      ${s.kind === 'item' && s.cond != null ? html`<button class="btn sm ghost" data-ch-repair="${s.key}" ${s.repair ? '' : 'disabled'} title="${s.repair ? 'Stellt den Zustand wieder her' : 'Noch in gutem Zustand'}">${icon('wrench')} <span>Aufarbeiten</span>${s.repair ? html` · ${money(s.repair, cur)}` : ''}</button>
        <button class="btn sm ghost danger" data-ch-sell="${s.key}">${icon('banknote')} <span>Verkaufen</span> · ${money(s.resale, cur)}</button>` : ''}
      ${s.kind === 'service' && s.lv ? html`<button class="btn sm ghost danger" data-ch-svc="${s.key}:0">${icon('x')} <span>Beenden</span></button>` : ''}
    </div>
  </div>`;
}

function gearCardHtml(ctx, c) {
  const cur = ctx.view.currency; const f = c.fx; const mx = f.max;
  const sgn = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±');
  const fxRow = (label, val, max, unit) => html`<li><span>${label}</span> <b class="${val > 0 ? 'pos' : ''}">${sgn(val)}${dec(Math.abs(val))}${unit}</b> <span class="dim small">(<span>höchstens</span> ${dec(max)}${unit})</span></li>`;
  return html`<section class="card mt" data-ch-gear>
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('shirt')} ${term('Ausstattung')}</div>
      ${infoBtn(['Ausstattung ist, was du trägst und fährst: Kleidung, Uhr, Schmuck, Fahrzeug und Arbeitsmittel, dazu Pflege und ein Sicherheitsdienst als laufende Dienstleistungen. Waffen gibt es nicht.', 'Zusammen ergeben sie dein Auftreten (0 bis 100). Das wirkt klein, aber spürbar: ein bisschen mehr Ansehen, bessere Chancen im Gehaltsgespräch, bei Bewerbungen und Wahlen, Pluspunkte vor Gericht. Die Wirkungen sind gedeckelt, ein Zwang besteht nie.', 'Kaufe mit Maß. Stücke nutzen sich ab und kosten Unterhalt; du kannst sie jederzeit mit Abschlag verkaufen. Uhr und Schmuck sind Erbstücke und gehen an die Kinder.'], 'Ausstattung')}</div>
    <div class="grid c2 mt" style="--gap:1rem">
      <div class="ch-look">
        <div class="row spread small"><span>${term('Auftreten')}</span><b>${Math.round(c.look)} <span class="dim">/ 100 · ${c.lookBand}</span></b></div>${bar(c.look, 'good')}
        <ul class="small ch-fx mt">
          ${fxRow('Zuwachs an Ansehen', f.rep, mx.rep, ' %')}${fxRow('Gehaltsgespräch: Chance', f.raise, mx.raise, ' %')}${fxRow('Bewerbung: Chance', f.apply, mx.apply, ' %')}${fxRow('Wahl: Stimmengewicht', f.vote, mx.vote, ' %')}${fxRow('Kandidatur: Chance', f.chance, mx.chance, ' %')}${fxRow('Gericht: Punkte', f.court, mx.court, '')}
          ${f.comfort ? html`<li><span>Wohlbefinden</span> <b class="pos">+${dec(f.comfort)}</b></li>` : ''}${f.burglary ? html`<li><span>Einbruchsrisiko</span> <b class="pos">−${f.burglary} %</b></li>` : ''}
        </ul>
        <div class="small dim mt"><span>Die Wirkungen beginnen ab etwa 10 Punkten Auftreten und sind bei 80 Punkten voll ausgeschöpft.</span></div>
        <dl class="kv small mt"><dt>Laufende Kosten / Tag</dt><dd class="${c.upkeepDay ? 'neg' : ''}">${money(c.upkeepDay, cur)}</dd><dt>Laufende Kosten / Jahr</dt><dd class="${c.upkeepYear ? 'neg' : ''}">${money(c.upkeepYear, cur)}</dd></dl>
      </div>
      <div class="small dim">${icon('lightbulb')} <span>Tipp: Beginne mit Kleidung und Aktentasche – das ist günstig und wirkt am meisten. Ein Auto lohnt sich erst, wenn das Geld locker sitzt.</span></div>
    </div>
    <div class="ch-slots mt">${c.gear.map((s) => slotHtml(s, cur, (sl) => html`<button class="btn sm ghost" data-ch-info="${sl.key}" aria-label="Stufen ansehen" title="Stufen ansehen">${icon('info')}</button>`))}</div>
  </section>`;
}

function chronCard(ctx, c) {
  const v = ctx.view; const startYear = v.date.year - Math.floor(v.date.day / 365);
  return html`<section class="card mt" data-ch-chron><div class="card-title">${icon('scroll')} <span>Kurz-Lebenslauf</span></div>
    ${c.chron.length ? html`<ol class="chron">${c.chron.map((e) => html`<li><span class="y">${startYear + Math.floor(e.day / 365)}</span><span data-i18n-skip>${e.text}</span></li>`)}</ol>` : html`<div class="dim small">Noch nichts erlebt.</div>`}
    <div class="row end mt"><button class="btn sm ghost" data-go="legacy">${icon('git-fork')} <span>Ganze Chronik im Vermächtnis</span></button></div></section>`;
}

export const page = {
  id: 'character', label: 'Charakter', icon: 'id-card',
  render(ctx) {
    const v = ctx.view; const c = v.char;
    if (!c || !c.on) return html`<div class="panel-head"><div><h2>Charakterblatt</h2></div></div><div class="alert warn">${icon('triangle-alert')}<div><span>Das Charakterblatt ist gerade ausgeschaltet.</span></div></div>`;
    return html`
    <div class="panel-head"><div><h2>Charakterblatt</h2><p>Talente, Ausstattung und dein Platz in der Gesellschaft – alles auf einen Blick.</p></div></div>
    ${heroCard(ctx, c)}
    <div class="grid c2 mt" style="--gap:1rem;align-items:start">${talentCardHtml(ctx, c)}${rankCardHtml(ctx, c)}</div>
    ${gearCardHtml(ctx, c)}
    ${chronCard(ctx, c)}`;
  },
  bind(root, ctx) { bindChar(root, ctx); },
};

function openSlot(ctx, key) {
  const c = ctx.view.char; const s = c.gear.find((x) => x.key === key); if (!s) return; const cur = ctx.view.currency;
  const rows = s.levels.map((l) => html`<li class="ops-lv ${l.current ? 'built' : ''}"><div class="row spread nowrap"><b data-i18n-skip>${l.name}</b><span class="chip small ${l.current ? 'good' : ''}">${l.current ? 'Aktuell' : s.kind === 'service' ? html`${money(l.dayCost, cur)} <span>pro Tag</span>` : money(l.price, cur)}</span></div>
    <div class="small">${l.text}</div><div class="small dim"><span>Auftreten:</span> +${dec(l.look)}${l.burglaryMult != null ? html` · <span>Einbruchsrisiko:</span> −${Math.round((1 - l.burglaryMult) * 100)} %` : ''}${l.eraOk ? '' : html` · <span>Erst ab</span> ${l.from}`}</div></li>`);
  modal(html`<h3>${icon(s.icon)} <span>${s.name}</span></h3><p class="small dim">${s.what}</p><ol class="ops-lvs">${rows}</ol>
    <p class="small dim">${s.kind === 'service' ? 'Dienstleistungen kosten täglich Geld und lassen sich jederzeit beenden. Reicht das Geld nicht mehr, enden sie von selbst.' : 'Stücke nutzen sich ab; ein veraltetes Stück wirkt etwas weniger. Beim Wechsel wird das alte Stück angerechnet.'}</p>
    <div class="row end mt"><button class="btn primary" data-close="x">Verstanden</button></div>`, { wide: true });
}

export function bindChar(root, ctx) {
  const run = async (name, input) => { try { await ctx.act(name, input); } catch (_) { /* Meldung ist schon da */ } };
  on(root, 'click', '[data-ch-train]', (e, t) => { if (!t.disabled) run('chTrain', { key: t.dataset.chTrain }); });
  on(root, 'click', '[data-ch-best]', (e, t) => { if (!t.disabled) run('chTrain', { key: 'best' }); });
  on(root, 'click', '[data-ch-all]', (e, t) => { if (!t.disabled) run('chTrain', { key: 'all' }); });
  on(root, 'change', '[data-ch-auto]', (e, t) => run('chAuto', { on: !!t.checked }));
  on(root, 'click', '[data-ch-info]', (e, t) => openSlot(ctx, t.dataset.chInfo));
  on(root, 'click', '[data-ch-buy]', async (e, t) => {
    if (t.disabled) return; const [slot, lv] = t.dataset.chBuy.split(':'); const s = ctx.view.char.gear.find((x) => x.key === slot); const l = s && s.levels.find((x) => x.lv === Number(lv)); if (!l) return;
    const cur = ctx.view.currency;
    if (await ctx.confirm({ title: `${l.name} kaufen?`, text: `${l.text} Es kostet ${money(l.price, cur)}${s.lv ? `, dein altes Stück wird mit ${money(s.resale, cur)} angerechnet` : ''}. Auftreten: +${dec(l.look)}.`, ok: 'Kaufen' })) await run('chBuy', { slot, level: Number(lv) });
  });
  on(root, 'click', '[data-ch-sell]', async (e, t) => {
    const slot = t.dataset.chSell; const s = ctx.view.char.gear.find((x) => x.key === slot); if (!s) return;
    if (await ctx.confirm({ title: `${s.name_cur} verkaufen?`, text: `Du bekommst ${money(s.resale, ctx.view.currency)}. Erbstücke bleiben dir.`, ok: 'Verkaufen', danger: true })) await run('chSell', { slot });
  });
  on(root, 'click', '[data-ch-repair]', (e, t) => { if (!t.disabled) run('chRepair', { slot: t.dataset.chRepair }); });
  on(root, 'click', '[data-ch-svc]', async (e, t) => {
    if (t.disabled) return; const [slot, lv] = t.dataset.chSvc.split(':');
    await run('chService', { slot, level: Number(lv) });
  });
  on(root, 'click', '[data-go]', (e, t) => { e.preventDefault(); ctx.go(t.dataset.go); });
}
