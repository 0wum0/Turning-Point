/* Jahreszeiten, Ernte und Seuchen (Oberfläche): Jahreszeiten-Karte mit Tipp, Erntebericht, Seuchenhinweis mit drei Schutzknöpfen,
 * Chips an Betrieben und im Warenkreislauf. Daten kommen fertig vom Server (view.season). Zahlen stehen in eigenen Elementen (für die englische Oberfläche). */
import { html, icon, money, infoBtn, on, modal, term } from './ui.js';

const dec = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: d });
const sg = (p) => (p > 0 ? `+${dec(p)}` : p < 0 ? `−${dec(-p)}` : '±0');
const tone = (p, good = 1) => (Math.abs(p) < 1 ? '' : (p * good > 0 ? 'good' : 'warn'));

/** Chip „Heizung +12 %“ für Kosten (Haushalt, Übersicht). */
export function heatChip(v) {
  const h = v.season && v.season.heating; if (!h || !v.season.on || Math.abs(h.pct) < 0.5) return '';
  return html`<span class="chip ${h.pct > 0 ? 'warn' : 'good'}" title="${h.kind}">${icon('flame')} <b>${sg(h.pct)} %</b> <span>Heizung</span></span>`;
}

/** Kleine Erntezeile: „Ernte 1947: schlechte Ernte – Getreide +28 %“. */
export function harvestLine(v) {
  const hv = v.season && v.season.harvest; if (!hv) return '';
  const t = hv.yield < 0.9 ? 'warn' : hv.yield >= 1.07 ? 'good' : '';
  return html`<span class="chip ${t}" data-harvest-chip>${icon('wheat')} <span>Ernte</span> <b>${v.season.year}</b><span>:</span> <span>${hv.label}</span> <span>– Getreide</span> <b>${sg(hv.pricePct)} %</b></span>`;
}

/** Streifen für Warenkreislauf und Preisbarometer. */
export function harvestStrip(v) {
  const hv = v.season && v.season.harvest; if (!hv) return '';
  return html`<div class="harvest-strip small mt0"><span class="dim">Ernte dieses Jahr:</span> ${harvestLine(v)}${hv.flood ? html`<span class="chip bad">${icon('cloud-rain')} <span>Hochwasser in deinem Bundesland</span></span>` : ''}
    <span class="dim">${hv.pricePct > 3 ? 'Agrarwaren und Lebensmittel sind teurer, Landwirte verdienen weniger.' : hv.pricePct < -3 ? 'Agrarwaren und Lebensmittel sind günstiger, Landwirte verdienen mehr.' : 'Die Preise für Agrarwaren sind normal.'}</span></div>`;
}

/** Chips an einer Betriebskarte: Jahreszeit, Ernte, Seuche. */
export function firmSeasonChips(c) {
  const s = c.flows && c.flows.sfx; if (!s) return '';
  const pct = (x) => Math.round((x - 1) * 1000) / 10;
  const out = [];
  if (Math.abs(pct(s.season)) >= 1.5) out.push(html`<span class="chip ${tone(pct(s.season))}" title="Jahreszeit und Feste">${icon('calendar')} <span>Saison</span> <b>${sg(pct(s.season))} %</b></span>`);
  if (Math.abs(pct(s.harvest)) >= 1.5) out.push(html`<span class="chip ${tone(pct(s.harvest))}" title="Ernte">${icon('wheat')} <span>Ernte</span> <b>${sg(pct(s.harvest))} %</b></span>`);
  if (s.lock >= 0.01) out.push(html`<span class="chip warn" title="Seuchenmaßnahmen">${icon('shield')} <span>Maßnahmen</span> <b>−${dec(s.lock * 100)} %</b></span>`);
  if (s.sick >= 0.01) out.push(html`<span class="chip warn" title="Krankenstand">${icon('stethoscope')} <span>Krankenstand</span> <b>${dec(s.sick * 100)} %</b></span>`);
  if (!out.length) return '';
  return html`<div class="row wrap mt small season-chips">${out}</div>`;
}

/** Drei Schutzknöpfe (Hygienepaket, Impfung, Schutzkonzept / Kontakte einschränken). */
function protectRow(v, cur) {
  const p = v.season.epi.protect; if (!p) return '';
  const hy = p.hygiene; const va = p.vaccine; const sh = p.shield;
  const btn = (what, ic, title, sub, cost, disabled, on) => html`<button class="btn ${on ? 'good' : ''}" data-epi="${what}" ${disabled || on ? 'disabled' : ''}>${icon(ic)}<span class="stack" style="--gap:0;text-align:left"><b>${title}</b><small class="dim">${sub}</small></span>${cost != null && !on ? html`<span class="mono nw">${money(cost, cur)}</span>` : ''}</button>`;
  return html`<div class="epi-actions mt">
    ${btn('hygiene', 'shield', hy.on ? 'Hygienepaket aktiv' : 'Hygienepaket', hy.on ? `noch ${hy.left} Tage` : `${hy.days} Tage weniger Ansteckung`, hy.cost, v.money < hy.cost, hy.on)}
    ${btn('vaccine', 'stethoscope', va.done ? 'Geimpft' : 'Impfen', va.available ? (va.done ? 'Du bist geschützt' : 'Schützt stark vor Ansteckung') : 'Noch kein Impfstoff', va.available ? va.cost : null, !va.available || v.money < va.cost, va.done)}
    ${btn('shield', sh.firms ? 'building-2' : 'home', sh.on ? (sh.firms ? 'Schutzkonzept aktiv' : 'Kontakte eingeschränkt') : (sh.firms ? 'Schutzkonzept für Betriebe' : 'Kontakte einschränken'), sh.on ? `noch ${sh.left} Tage` : (sh.firms ? 'Homeoffice, Schichten, Tests' : 'Weniger Ansteckung, etwas weniger Abwechslung'), sh.firms ? sh.cost : null, false, sh.on)}
  </div>`;
}

/** Seuchenhinweis: Lage vor Ort, Maßnahmen, eigener Zustand und drei Schutzknöpfe. */
export function epiBanner(ctx, { full = false } = {}) {
  const v = ctx.view; const s = v.season; if (!s || !s.epi || !s.epi.on) return '';
  const e = s.epi; const w = e.wave;
  if (!w && !e.me.sick) return '';
  const cur = v.currency;
  const lvlTone = w ? (w.level === 'hoch' ? 'bad' : w.level === 'mittel' ? 'warn' : 'info') : 'good';
  const lvlName = w ? { hoch: 'hoch', mittel: 'mittel', gering: 'gering', keine: 'noch keine' }[w.level] : '';
  return html`<section class="card mt epi-banner ${lvlTone}" id="epiBanner" data-spot="epi">
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('shield')} <span>Seuche:</span> <span data-i18n-skip>${w ? w.name : e.me.sick.name}</span> ${infoBtn(['Seuchen laufen in Wellen und breiten sich von Stadt zu Stadt aus – über Wochen.', 'Sie machen krank, drücken Läden und Gaststätten und schwächen Betriebe durch Krankenstand. Dein Leben ist nur bei sehr schwerer Krankheit in Gefahr – Anfänger sind geschützt.', 'Schütze dich mit einem Klick: Hygienepaket, Impfung (sobald es einen Impfstoff gibt) oder ein Schutzkonzept. Ämter können mit Beschlüssen helfen.'], 'Seuchen')}</div>
      ${w ? html`<span class="chip ${lvlTone}"><span>Lage bei dir:</span> <b>${lvlName}</b></span>` : ''}</div>
    <div class="small mt">${w ? (w.phase === 'coming' ? html`<span>Die Welle erreicht deine Stadt in</span> <b>${w.daysToStart}</b> <span>Tagen.</span>`
      : w.phase === 'rising' ? (w.daysToPeak > 0 ? html`<span>Die Welle steigt – Höhepunkt in</span> <b>${w.daysToPeak}</b> <span>Tagen.</span>` : html`<span>Die Welle steigt.</span>`)
        : html`<span>Die Welle fällt.</span>`) : ''}
      ${e.measure.level > 0 ? html`<span class="dim"> <span>Maßnahmen des Bundes:</span> </span><b>${e.measure.name}</b>` : ''}
      ${e.sickShare >= 1 ? html`<span class="dim"> <span>Krankenstand in den Betrieben:</span> </span><b>${dec(e.sickShare)} %</b>` : ''}</div>
    ${e.me.sick ? html`<div class="alert warn small mt">${icon('stethoscope')}<div><b>Du bist krank.</b> <span>Noch</span> <b>${e.me.sick.daysLeft}</b> <span>Tage. Iss gut und ruh dich aus – das Krankengeld deckt 75 % des Lohns.</span></div></div>` : ''}
    ${e.me.protected ? html`<div class="alert good small mt">${icon('badge-check')}<div><span>Anfängerschutz: In deinen ersten Spieltagen bleibst du gesund. Lerne in Ruhe, wie Schutz funktioniert.</span></div></div>` : ''}
    ${protectRow(v, cur)}
    ${full ? html`<div class="small dim mt"><span>Örtlich:</span> ${e.local.hygiene ? html`<span class="chip good">Gesundheitsamt Stufe ${e.local.hygiene}</span>` : ''}${e.local.hospital ? html`<span class="chip good">Krankenhausprogramm Stufe ${e.local.hospital}</span>` : ''}${e.local.vacc ? html`<span class="chip">Impfquote <b>${e.local.vacc}</b> %</span>` : ''}${!e.local.hygiene && !e.local.hospital && !e.local.vacc ? html`<span>keine Beschlüsse</span>` : ''}</div>` : ''}
  </section>`;
}

/** Karte „Jahreszeit“ für die Übersicht. */
export function seasonCard(ctx) {
  const v = ctx.view; const s = v.season; if (!s || !s.on) return '';
  const sec = (s.sectors || []).filter((x) => Math.abs(x.pct) >= 3).slice(0, 3);
  return html`<section class="card mt season-card s${s.idx}" id="seasonCard" data-spot="season">
    <div class="row spread wrap"><div class="row nowrap"><span class="season-ic">${icon(s.icon, 'lg')}</span><div><div class="card-title" style="margin:0">${term('Jahreszeit', s.name)}</div><div class="small dim season-tip">${s.tip}</div></div></div>
      <button class="btn sm" data-season-guide="1">Jahreszeiten-Check</button></div>
    <div class="row wrap mt small">${heatChip(v)}${sec.map((x) => html`<span class="chip ${tone(x.pct)}">${x.name} <b>${sg(x.pct)} %</b></span>`)}${(s.festivals || []).map((f) => html`<span class="chip accent">${icon(f.icon)} ${f.name}</span>`)}${harvestLine(v)}</div>
  </section>`;
}

function guide(ctx) {
  const v = ctx.view; const s = v.season; const hv = s.harvest; const cur = v.currency; const f = v.flows;
  const reserve = Math.round(f.expense * 30);
  const enough = v.money >= reserve; const fridge = v.meters.fridge >= 50;
  const ins = (v.insurance || []).find((i) => i.key === 'gesundheit');
  ctx.act('seen', { key: 'season' }, { silent: true, noRender: true }).catch(() => {});
  const check = (ok, text) => html`<li class="${ok ? 'pos' : 'dim'}">${icon(ok ? 'circle-check' : 'circle-alert')} ${text}</li>`;
  modal(html`<h3>${icon(s.icon)} <span>Jahreszeiten-Check</span></h3>
    <p class="small dim">${s.tip}</p>
    <h4>So wirkt die Jahreszeit</h4>
    <ul class="small tal-fx">
      <li><span>Heizung:</span> ${s.heating.kind} <b>${sg(s.heating.pct)} %</b> <span>auf Miete bzw. Hausunterhalt.</span>${s.heating.subsidy ? html` <span>Winterhilfe der Stadt übernimmt</span> <b>${s.heating.subsidy}</b> <span>% des Mehrbedarfs.</span>` : ''}</li>
      <li><span>Gesundheit:</span> <span>${s.idx === 0 ? 'Im Winter sind Erkältungen häufiger und die Erholung ist schwerer.' : s.idx === 2 ? 'Im Sommer erholst du dich leichter und bist seltener krank.' : 'In den Übergangszeiten ist alles ausgeglichen.'}</span></li>
      ${(s.sectors || []).length ? html`<li><span>Betriebe:</span> ${s.sectors.map((x) => html`<span class="nw">${x.name} <b>${sg(x.pct)} %</b></span>`)}</li>` : ''}
      ${(s.festivals || []).map((x) => html`<li>${icon(x.icon)} <b>${x.name}</b> <span>– noch</span> <b>${x.daysLeft}</b> <span>Tage in deiner Stadt.</span></li>`)}
    </ul>
    <h4 class="mt">Ernte ${s.year}</h4>
    <p class="small"><b>${hv.label}</b>${hv.note ? html` <span class="dim">(${hv.note})</span>` : ''}<br><span>Ertrag bei dir:</span> <b>${Math.round(hv.yield * 100)}</b> <span>% eines Normaljahres · Getreide</span> <b>${sg(hv.pricePct)} %</b> <span>· Lebensmittel im Haushalt</span> <b>${sg(hv.foodPct)} %</b> <span>· Bauernhöfe</span> <b>${sg(hv.farmPct)} %</b></p>
    <h4 class="mt">Winter-Check</h4>
    <ul class="small" style="list-style:none;padding:0">
      ${check(enough, html`<span>Polster für 30 Tage Fixkosten:</span> <b>${money(reserve, cur)}</b>`)}
      ${check(fridge, html`<span>Kühlschrank mindestens halb voll</span>`)}
      ${check(!!(ins && ins.on), html`<span>Krankenzusatz abgeschlossen (senkt Arztkosten und Schwere von Krankheiten)</span>`)}
    </ul>
    <div class="row end mt"><button class="btn primary" data-close="x">Verstanden</button></div>`, { wide: true });
}

export function bindSeasons(root, ctx) {
  on(root, 'click', '[data-season-guide]', () => guide(ctx));
  on(root, 'click', '[data-epi]', (e, t) => ctx.act('epiProtect', { what: t.dataset.epi }));
}
