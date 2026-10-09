/* Wirtschaftspolitik der Ämter: „Dein Amt: das kannst du entscheiden“ und „Was Ämter in der Wirtschaft bestimmen“.
 * Jede Wirkung wird vor dem Beschluss erklärt. Zahlen stehen in eigenen Elementen (für die englische Oberfläche). */
import { html, icon, api, on, modal, toast, infoBtn } from './ui.js';
import { dec } from './supply.js';

const ROLES = [
  ['Ortsbeirat', 'Berät die Stadt – noch keine Macht über die Wirtschaft.'],
  ['Stadtrat', 'Gewerbesteuer-Zuschlag in der Stadt.'],
  ['Bürgermeister', 'Gewerbesteuer-Zuschlag und Subvention für eine Ware in der Stadt.'],
  ['Landtagsabgeordneter', 'Preisstützung für eine Ware im Bundesland.'],
  ['Bundestagsabgeordneter', 'Rahmen: Obergrenzen für Zuschläge und Subventionen im ganzen Land.'],
  ['Bundeskanzler', 'Mehrwertsteuer auf Waren, Einfuhrzoll und Branchen-Subvention.'],
];

export const policyBox = () => html`<section class="card mt" id="polBox"><div class="dim small">Lade …</div></section>`;

const num = (n, d) => html`<b>${dec(n, d)}</b>`;
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
    case 'frame': return html`<li><span>Obergrenzen im ganzen Land: Gewerbesteuer-Zuschlag höchstens</span> ${num(l.a)} <span>Punkte, Subventionen höchstens</span> ${num(l.b)} <span>%.</span></li>`;
    default: return '';
  }
}

function control(p) {
  if (p.kind === 'surcharge' || p.kind === 'vat' || p.kind === 'tariff') {
    const lbl = p.kind === 'tariff' ? 'Zoll' : 'Änderung';
    return html`<div class="field"><label for="pv-${p.kind}"><span>${lbl}:</span> <b data-pv="${p.kind}">0</b> <span>${p.unit}</span></label><input id="pv-${p.kind}" type="range" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="0" data-prange="${p.kind}"></div>
      <div class="small dim row spread nowrap"><span>${p.min}</span><span>Normal: 0</span><span>+${p.max}</span></div>`;
  }
  if (p.kind === 'subsidy' || p.kind === 'natsubsidy' || p.kind === 'support') {
    return html`<div class="grid c2" style="--gap:.6rem"><div class="field"><label for="pg-${p.kind}">Ware</label><select id="pg-${p.kind}">${p.goods.map((g) => html`<option value="${g.key}">${g.name}</option>`)}</select></div>
      <div class="field"><label for="pp-${p.kind}">${p.kind === 'support' ? 'Aufschlag auf den Verkaufspreis' : 'Zuschuss auf den Einkauf'}</label><select id="pp-${p.kind}">${p.options.map((o) => html`<option value="${o}">${o} %</option>`)}</select></div></div>`;
  }
  if (p.kind === 'frame') {
    return html`<div class="field"><label for="pf-frame">Rahmen</label><select id="pf-frame">${p.frames.map((f) => html`<option value="${f.key}">${f.name} – Zuschlag bis ${f.maxSurcharge}, Subvention bis ${f.maxSubsidy} %</option>`)}</select></div>`;
  }
  return '';
}
function valueOf(root, p) {
  if (p.kind === 'surcharge' || p.kind === 'vat' || p.kind === 'tariff') return { kind: p.kind, value: Number(root.querySelector(`#pv-${p.kind}`).value) };
  if (p.kind === 'frame') return { kind: p.kind, good: root.querySelector('#pf-frame').value, value: 1 };
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
  const effects = (loc.surcharge || loc.levy || loc.vat || loc.tariff) ? html`<div class="small mt dim"><span>Bei dir gilt gerade:</span> ${loc.surcharge ? html`<span class="chip ${loc.surcharge > 0 ? 'warn' : 'good'}">Gewerbesteuer ${loc.surcharge > 0 ? '+' : ''}${loc.surcharge}</span> ` : ''}${loc.levy ? html`<span class="chip warn">Umlage +${dec(loc.levy, 1)}</span> ` : ''}${loc.vat ? html`<span class="chip ${loc.vat > 0 ? 'warn' : 'good'}">Mehrwertsteuer ${loc.vat > 0 ? '+' : ''}${loc.vat}</span> ` : ''}${loc.tariff ? html`<span class="chip ${loc.tariff > 0 ? 'warn' : 'good'}">Zoll ${loc.tariff > 0 ? '+' : ''}${loc.tariff} %</span>` : ''}</div>` : '';
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
    const dlg = modal(html`<h3>${icon('scale')} <span>${p.name}</span>: <span>Das passiert</span></h3><p class="small"><b>${pv.text}</b></p><ul class="pol-fx">${pv.preview.lines.map((l) => effectLine(l, pv.preview))}</ul>
      <p class="small dim">Der Beschluss gilt bis zum Ende deiner Amtszeit und kann in dieser Amtszeit nicht zurückgenommen werden. Er wirkt auch auf deine eigenen Betriebe.</p>
      <div class="row end mt"><button class="btn ghost" data-close="no">Abbrechen</button><button class="btn primary" id="pol-go">Beschließen</button></div>`);
    dlg.el.querySelector('#pol-go').onclick = async () => {
      try { const r = await api('POST', '/api/supply/policy/set', input); if (r.view) { ctx.setView(r.view); ctx.hud(); } toast(r.message || 'Beschluss gefasst.', r.level || 'good'); dlg.close(); ctx.rerender(); } catch (err) { toast(err.message, 'bad'); }
    };
  });
}
