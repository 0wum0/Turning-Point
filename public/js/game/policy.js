/* Wirtschaftspolitik der Ämter: „Dein Amt: das kannst du entscheiden“ und „Was Ämter in der Wirtschaft bestimmen“.
 * Jede Wirkung wird vor dem Beschluss erklärt. Zahlen stehen in eigenen Elementen (für die englische Oberfläche). */
import { html, icon, api, on, modal, toast, infoBtn } from './ui.js';
import { dec } from './supply.js';

const ROLES = [
  ['Ortsbeirat', 'Berät die Stadt – noch keine Macht über die Wirtschaft.'],
  ['Stadtrat', 'Gewerbesteuer-Zuschlag, Baulandausweisung und Schulbudget in der Stadt.'],
  ['Bürgermeister', 'Gewerbesteuer-Zuschlag, Subvention, Mietpreisbremse, Baulandausweisung und Schulbudget in der Stadt.'],
  ['Landtagsabgeordneter', 'Preisstützung für eine Ware, Wohnungsbauprogramm und Bildungsprogramm im Bundesland.'],
  ['Bundestagsabgeordneter', 'Rahmen für Zuschläge und Subventionen im ganzen Land; Berufsbildungsgesetz.'],
  ['Bundeskanzler', 'Mehrwertsteuer auf Waren, Einfuhrzoll, Branchen-Subvention, Preisbremse und Berufsbildungsgesetz.'],
];

const hasEdu = (e) => !!e && (e.school || e.library || e.sport || e.courseDisc || e.lehrSubsidy);
const eduChips = (e) => (hasEdu(e) ? html`${e.school ? html`<span class="chip good">Schulen Stufe ${e.school}</span> ` : ''}${e.library ? html`<span class="chip good">Bibliothek Stufe ${e.library}</span> ` : ''}${e.sport ? html`<span class="chip good">Sportstätten Stufe ${e.sport}</span> ` : ''}${e.courseDisc ? html`<span class="chip good">Kurse −${e.courseDisc} %</span> ` : ''}${e.lehrSubsidy ? html`<span class="chip good">Lehrlingslohn −${e.lehrSubsidy} %</span>` : ''}` : '');
export const policyBox = () => html`<section class="card mt" id="polBox"><div class="dim small">Lade …</div></section>`;

const num = (n, d) => html`<b>${dec(n, d)}</b>`;
const sg = (p) => (p > 0 ? `+${dec(p, 1)}` : p < 0 ? `−${dec(-p, 1)}` : '0');
/* Wirkung auf die Zielwerte der Preisindizes (Vorschau der Stadtwirtschaft) */
const fxList = (b) => html`<ul class="pol-ex">${(b || []).map((e) => html`<li><b>${e.name}</b>: <span>Zielwert</span> <b>${sg(e.pct)} %</b></li>`)}</ul>`;
function effectLine(l, pv) {
  switch (l.key) {
    case 'surcharge':
      if (!l.a) return html`<li>Keine Änderung der Gewerbesteuer.</li>`;
      return l.a > 0
        ? html`<li><span>Betriebe in deiner Stadt zahlen mehr Gewerbesteuer: Von je 100 Gewinn gehen</span> ${num(l.a, 1)} <span>mehr ans Rathaus.</span></li>`
        : html`<li><span>Betriebe in deiner Stadt zahlen weniger Gewerbesteuer: Von je 100 Gewinn bleiben</span> ${num(-l.a, 1)} <span>mehr im Betrieb.</span></li>`;
    case 'subsidy': return html`<li><span>Der Einkauf von</span> <b>${l.b}</b> <span>wird für alle Betriebe in der Stadt billiger um</span> ${num(l.a)} <span>%.</span></li>`;
    case 'natsubsidy': return html`<li><span>Der Einkauf von</span> <b>${l.b}</b> <span>wird für alle Betriebe im Land billiger um</span> ${num(l.a)} <span>%.</span></li>`;
    case 'support': return html`<li><span>Erzeuger von</span> <b>${l.b}</b> <span>in deinem Bundesland bekommen mehr Erlös:</span> <b>+${dec(l.a)} %</b></li>`;
    case 'levy': return html`<li class="dim"><span>Gegenfinanzierung: Alle Betriebe im Gebiet zahlen dafür</span> <b>+${dec(l.a, 1)}</b> <span>Punkte Gewerbesteuer.</span></li>`;
    case 'vat':
      if (!l.a) return html`<li>Keine Änderung der Mehrwertsteuer.</li>`;
      return l.a > 0
        ? html`<li><span>Alle Betriebe zahlen mehr Mehrwertsteuer auf ihre Wertschöpfung (Umsatz minus Wareneinkauf):</span> <b>+${dec(l.a)}</b> <span>Punkte.</span></li>`
        : html`<li><span>Alle Betriebe zahlen weniger Mehrwertsteuer auf ihre Wertschöpfung (Umsatz minus Wareneinkauf):</span> <b>${dec(l.a)}</b> <span>Punkte.</span></li>`;
    case 'tariff':
      return html`<li>${l.a === 0 ? html`<span>Keine Änderung beim Einfuhrzoll.</span>` : html`<span>Der Zoll trifft nur den importierten Anteil einer Ware. Beispiele:</span>`}
        ${l.a !== 0 ? html`<ul class="pol-ex">${(l.b || []).map((e) => html`<li><b>${e.name}</b> <span>(Importanteil</span> ${e.imp} <span>%):</span> <b>${e.up > 0 ? '+' : ''}${dec(e.up, 1)} %</b></li>`)}</ul><div class="dim small"><span>Heimische Erzeuger verkaufen dadurch etwas besser.</span></div>` : ''}</li>`;
    case 'rentcap': return html`<li><span>Das Mietniveau in deiner Stadt darf höchstens um</span> <b>${dec(l.a)}</b> <span>% pro Jahr steigen (0 heißt: eingefroren).</span></li>
      <li class="dim"><span>Nebenwirkung: Vermieter bauen und vermieten weniger, das Wohnungsangebot sinkt um</span> <b>${dec(l.c)}</b> <span>%. Der Druck auf die Mieten wächst, und nach der Amtszeit holt der Markt auf. Auch deine eigenen Mieteinnahmen steigen nur langsam.</span>${fxList(l.b)}</li>`;
    case 'landzone': return html`<li><span>Neues Bauland: Das Wohnungsangebot in deiner Stadt wächst um</span> <b>${dec(l.a)}</b> <span>%. Die Mieten tendieren nach unten.</span>${fxList(l.b)}</li>
      <li class="dim"><span>Nebenwirkung: Viele wollen gleichzeitig bauen – Bauen wird etwas teurer (auch für deine Betriebe).</span></li>`;
    case 'housing': return html`<li><span>Wohnungsbauprogramm: Das Wohnungsangebot in allen Städten deines Bundeslandes wächst um</span> <b>${dec(l.a)}</b> <span>%. Wirkung zeigt sich zuerst in Städten mit vielen Einwohnern.</span>${fxList(l.b)}</li>`;
    case 'pricebrake': return html`<li>${l.a < 0 ? html`<span>Preisbremse: Das Preisniveau aller Städte wird nach unten geschoben – Wohnen, Essen, Dienste und Bauen.</span>` : html`<span>Höheres Inflationsziel: Das Preisniveau aller Städte wird nach oben geschoben.</span>`}${fxList(l.b)}</li>
      <li class="dim"><span>Nebenwirkung: Die Preise der Betriebe folgen – bei einer Bremse verdienen sie etwas weniger, die Löhne folgen abgeschwächt.</span></li>`;
    case 'edu_city': {
      const what = l.b === 'library' ? html`<span>Die Bibliothek hilft allen Bewohnern: Mit etwas Glück wächst ihre Bildung jedes Jahr um einen Punkt.</span>`
        : l.b === 'sport' ? html`<span>Die Sportstätten helfen allen Bewohnern: Mit etwas Glück wächst ihre Kondition jedes Jahr um einen Punkt.</span>`
          : html`<span>Gute Schulen: Kinder lernen mehr (Bildung wächst mit etwas Glück jedes Jahr) und Förderprogramme wirken stärker.</span>`;
      return html`<li><span>Schulbudget Stufe</span> ${num(l.a)}<span>:</span> ${what} <span>Förderprogramme der Kinder in deiner Stadt wirken um</span> <b>+${dec(l.c)} %</b> <span>stärker.</span></li>`;
    }
    case 'edu_region': return html`<li><span>Bildungsprogramm Stufe</span> ${num(l.a)}<span>: Kurse für Mitarbeiter kosten im ganzen Bundesland</span> <b>${dec(l.b)} %</b> <span>weniger und bringen ab Stufe 2 einen Punkt mehr.</span></li>`;
    case 'edu_nation': return html`<li><span>Berufsbildungsgesetz Stufe</span> ${num(l.a)}<span>: Der Staat übernimmt</span> <b>${dec(l.b)} %</b> <span>des Lohns von Lehrlingen in allen Betrieben des Landes.</span></li>`;
    case 'frame': return html`<li><span>Obergrenzen im ganzen Land: Gewerbesteuer-Zuschlag höchstens</span> ${num(l.a)} <span>Punkte, Subventionen höchstens</span> ${num(l.b)} <span>%.</span></li>`;
    default: return '';
  }
}

function control(p) {
  if (p.kind === 'edu_city') {
    return html`<div class="grid c2" style="--gap:.6rem"><div class="field"><label for="pe-focus">Schwerpunkt</label><select id="pe-focus">${p.focus.map((f) => html`<option value="${f.key}">${f.name}</option>`)}</select></div>
      <div class="field"><label for="pe-lv">Stufe</label><select id="pe-lv">${p.options.map((o) => html`<option value="${o}">Stufe ${o}</option>`)}</select></div></div>`;
  }
  if (p.kind === 'edu_region' || p.kind === 'edu_nation') {
    return html`<div class="field"><label for="pe-lv-${p.kind}">Stufe</label><select id="pe-lv-${p.kind}">${p.options.map((o) => html`<option value="${o}">Stufe ${o}</option>`)}</select></div>`;
  }
  if (p.kind === 'surcharge' || p.kind === 'vat' || p.kind === 'tariff') {
    const lbl = p.kind === 'tariff' ? 'Zoll' : 'Änderung';
    return html`<div class="field"><label for="pv-${p.kind}"><span>${lbl}:</span> <b data-pv="${p.kind}">0</b> <span>${p.unit}</span></label><input id="pv-${p.kind}" type="range" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="0" data-prange="${p.kind}"></div>
      <div class="small dim row spread nowrap"><span>${p.min}</span><span>Normal: 0</span><span>+${p.max}</span></div>`;
  }
  if (p.kind === 'subsidy' || p.kind === 'natsubsidy' || p.kind === 'support') {
    return html`<div class="grid c2" style="--gap:.6rem"><div class="field"><label for="pg-${p.kind}">Ware</label><select id="pg-${p.kind}">${p.goods.map((g) => html`<option value="${g.key}">${g.name}</option>`)}</select></div>
      <div class="field"><label for="pp-${p.kind}">${p.kind === 'support' ? 'Aufschlag auf den Verkaufspreis' : 'Zuschuss auf den Einkauf'}</label><select id="pp-${p.kind}">${p.options.map((o) => html`<option value="${o}">${o} %</option>`)}</select></div></div>`;
  }
  if (p.kind === 'rentcap' || p.kind === 'landzone' || p.kind === 'housing' || p.kind === 'pricebrake') {
    const lbl = p.kind === 'rentcap' ? 'Erlaubter Anstieg der Mieten' : p.kind === 'pricebrake' ? 'Preisniveau verschieben um' : 'Zusätzliches Wohnungsangebot';
    const txt = (o) => (p.kind === 'rentcap' ? (o === 0 ? 'Mieten eingefroren (0 % pro Jahr)' : `höchstens ${o} % pro Jahr`) : p.kind === 'pricebrake' ? `${o > 0 ? '+' : '−'}${Math.abs(o)} Punkte` : `+${o} %`);
    return html`<div class="field"><label for="pq-${p.kind}">${lbl}</label><select id="pq-${p.kind}">${p.options.map((o, i) => html`<option value="${o}" ${i === (p.kind === 'pricebrake' ? 1 : 0) ? 'selected' : ''}>${txt(o)}</option>`)}</select></div>`;
  }
  if (p.kind === 'frame') {
    return html`<div class="field"><label for="pf-frame">Rahmen</label><select id="pf-frame">${p.frames.map((f) => html`<option value="${f.key}">${f.name} – Zuschlag bis ${f.maxSurcharge}, Subvention bis ${f.maxSubsidy} %</option>`)}</select></div>`;
  }
  return '';
}
function valueOf(root, p) {
  if (p.kind === 'edu_city') return { kind: p.kind, good: root.querySelector('#pe-focus').value, value: Number(root.querySelector('#pe-lv').value) };
  if (p.kind === 'edu_region' || p.kind === 'edu_nation') return { kind: p.kind, value: Number(root.querySelector(`#pe-lv-${p.kind}`).value) };
  if (p.kind === 'surcharge' || p.kind === 'vat' || p.kind === 'tariff') return { kind: p.kind, value: Number(root.querySelector(`#pv-${p.kind}`).value) };
  if (p.kind === 'frame') return { kind: p.kind, good: root.querySelector('#pf-frame').value, value: 1 };
  if (p.kind === 'rentcap' || p.kind === 'landzone' || p.kind === 'housing' || p.kind === 'pricebrake') return { kind: p.kind, value: Number(root.querySelector(`#pq-${p.kind}`).value) };
  return { kind: p.kind, good: root.querySelector(`#pg-${p.kind}`).value, value: Number(root.querySelector(`#pp-${p.kind}`).value) };
}

export async function bindPolicy(root, ctx) {
  const box = root.querySelector('#polBox'); if (!box) return;
  let d;
  try { d = await api('GET', '/api/supply/policy'); } catch (e) { box.remove(); return; }
  if (!d.enabled) { box.remove(); return; }
  const o = d.office;
  const loc = d.local;
  const active = d.active.length ? html`<div class="card-title mt" style="margin-bottom:.3rem">Aktuelle Beschlüsse bei dir</div><div class="stack" style="--gap:.4rem">${d.active.map((a) => html`<div class="firm"><div class="grow small"><b>${a.text}</b><div class="dim"><span data-i18n-skip>${a.office}${a.holder ? ` · ${a.holder}` : ''}</span> · <span>gilt noch</span> ${a.hours} <span>Std.</span></div></div></div>`)}</div>` : html`<div class="dim small mt">Zurzeit hat kein Amtsinhaber einen Beschluss gefasst, der bei dir gilt.</div>`;
  const effects = (loc.surcharge || loc.levy || loc.vat || loc.tariff || loc.zone || loc.rentCap != null || loc.brake || hasEdu(loc.edu)) ? html`<div class="small mt dim"><span>Bei dir gilt gerade:</span> ${loc.surcharge ? html`<span class="chip ${loc.surcharge > 0 ? 'warn' : 'good'}">Gewerbesteuer ${loc.surcharge > 0 ? '+' : ''}${loc.surcharge}</span> ` : ''}${loc.levy ? html`<span class="chip warn">Umlage +${dec(loc.levy, 1)}</span> ` : ''}${loc.vat ? html`<span class="chip ${loc.vat > 0 ? 'warn' : 'good'}">Mehrwertsteuer ${loc.vat > 0 ? '+' : ''}${loc.vat}</span> ` : ''}${loc.tariff ? html`<span class="chip ${loc.tariff > 0 ? 'warn' : 'good'}">Zoll ${loc.tariff > 0 ? '+' : ''}${loc.tariff} %</span> ` : ''}${loc.rentCap != null ? html`<span class="chip good">Mietpreisbremse ${loc.rentCap} % pro Jahr</span> ` : ''}${loc.zone ? html`<span class="chip good">Wohnungsangebot +${loc.zone} %</span> ` : ''}${loc.brake ? html`<span class="chip ${loc.brake < 0 ? 'good' : 'warn'}">Preisniveau ${loc.brake > 0 ? '+' : '−'}${Math.abs(loc.brake)} Punkte</span> ` : ''}${eduChips(loc.edu)}</div>` : '';
  const help = infoBtn(['Gewählte Amtsinhaber bestimmen die Wirtschaftspolitik: Steuern, Zölle, Zuschüsse für eine Ware.', 'Pro Amtszeit darf jeder Amtsinhaber einen Beschluss fassen. Er gilt, solange er im Amt ist, und wirkt auf alle Betriebe im Gebiet – auch auf deine eigenen. Die Spieler wählen mit.', 'Prüfe die Wirkung vor dem Beschluss: Du siehst genau, was sich ändert.'], 'Wirtschaftspolitik');
  if (!o) {
    box.innerHTML = html`<div class="card-title">${icon('scale')} Was Ämter in der Wirtschaft bestimmen ${help}</div>
      <p class="dim small">Wer ein Amt hält, darf pro Amtszeit einen Beschluss fassen. Das wirkt auf Preise, Steuern und Zuschüsse – für alle Betriebe im Gebiet.</p>
      <div class="stack" style="--gap:.4rem">${ROLES.map((r) => html`<div class="firm"><div class="grow small"><b>${r[0]}</b><div class="dim">${r[1]}</div></div></div>`)}</div>
      ${effects}${active}`.__raw;
    return;
  }
  const status = o.used ? html`<div class="alert good small">${icon('circle-check')}<div><b>Du hast in dieser Amtszeit schon entschieden:</b> ${o.used.text}</div></div>`
    : !o.powers.length ? html`<div class="alert info small">${icon('info')}<div>Dieses Amt hat noch keine Macht über die Wirtschaft. Ab dem Stadtrat darfst du Steuern und Zuschüsse bestimmen.</div></div>`
      : !o.cityOk ? html`<div class="alert warn small">${icon('triangle-alert')}<div>Du bist in ${o.cityName} gewählt worden – zieh zurück, um dort zu entscheiden.</div></div>` : '';
  box.innerHTML = html`<div class="card-title">${icon('landmark')} Dein Amt: das kannst du entscheiden ${help}</div>
    <div class="small dim"><b>${o.name}</b> · <span>noch</span> ${o.daysLeft >= 365 ? dec(o.daysLeft / 365, 1) : o.daysLeft} <span>${o.daysLeft >= 365 ? 'Jahre' : 'Tage'}</span> <span>im Amt</span> · <span>Rahmen:</span> ${d.frame.name}</div>
    <p class="small mt">Pro Amtszeit darfst du <b>einen</b> Beschluss fassen. Vorher siehst du genau, was er bewirkt.</p>
    ${status}
    ${!o.used && o.cityOk ? html`<div class="stack mt" style="--gap:.8rem">${o.powers.map((p) => html`<div class="pol" data-pol="${p.kind}"><b>${p.name}</b><div class="dim small">${p.what}</div><div class="mt">${control(p)}</div>
      <div class="row end mt"><button class="btn sm primary" data-pol-preview="${p.kind}">Wirkung ansehen</button></div></div>`)}</div>` : ''}
    ${effects}${active}`.__raw;
  box.addEventListener('input', (e) => { const r = e.target.closest('[data-prange]'); if (!r) return; const el = box.querySelector(`[data-pv="${r.dataset.prange}"]`); if (el) el.textContent = `${Number(r.value) > 0 ? '+' : ''}${r.value}`; });
  on(box, 'click', '[data-pol-preview]', async (e, t) => {
    const p = o.powers.find((x) => x.kind === t.dataset.polPreview); if (!p) return;
    const input = valueOf(box, p);
    let pv;
    try { pv = await api('POST', '/api/supply/policy/preview', input); } catch (err) { toast(err.message, 'bad'); return; }
    const dlg = modal(html`<h3 style="flex-wrap:wrap">${icon('scale')} <span>${p.name}</span>: <span>Das passiert</span></h3><p class="small"><b>${pv.text}</b></p><ul class="pol-fx">${pv.preview.lines.map((l) => effectLine(l, pv.preview))}</ul>
      <p class="small dim">Der Beschluss gilt bis zum Ende deiner Amtszeit und kann in dieser Amtszeit nicht zurückgenommen werden. Er wirkt auch auf deine eigenen Betriebe.</p>
      <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="pol-go">Beschließen</button></div>`);
    dlg.el.querySelector('#pol-go').onclick = async () => {
      try { const r = await api('POST', '/api/supply/policy/set', input); if (r.view) { ctx.setView(r.view); ctx.hud(); } toast(r.message || 'Beschluss gefasst.', r.level || 'good'); dlg.close(); ctx.rerender(); } catch (err) { toast(err.message, 'bad'); }
    };
  });
}
