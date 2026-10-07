import { html, icon, money, infoBtn, bar, on } from '../ui.js';

const LADDER = [['street', 'Straße', 'tree-pine'], ['workplace', 'Arbeitgeber', 'briefcase'], ['pension', 'Pension', 'hotel'], ['rent', 'Miete', 'house'], ['own', 'Eigentum', 'castle']];

export default {
  id: 'housing', label: 'Wohnen', icon: 'house',
  render(ctx) {
    const v = ctx.view; const cur = v.currency; const h = v.housing;
    const curIdx = LADDER.findIndex((l) => l[0] === h.type);
    const o = v.occupation;
    return html`
    <div class="panel-head"><div><h2>Wohnen &amp; Immobilien</h2><p>Dein Zuhause entscheidet über Erholung, Gesundheit und Familienglück.</p></div>
      ${infoBtn(['Es gibt eine Wohn-Leiter: Straße → Arbeitgeber → Pension → Miete → Eigentum → Villa.', 'Je weiter oben, desto besser Erholung und Gesundheit. Auf der Straße überlebst du nur etwa drei Tage. Eigentum kostet Unterhalt und Versicherung, steigt aber langfristig im Wert – wenn du es pflegst.', 'Such Unterkünfte in der Zeitung. Kinder brauchen je ein eigenes Zimmer.'], 'Wohnen')}</div>

    <section class="card">
      <ol class="ladder">${LADDER.map((l, i) => html`<li class="${i === curIdx ? 'on' : i < curIdx ? 'done' : ''}">${icon(l[2])}<span>${l[1]}</span></li>`)}</ol>
      <div class="grid c3 mt" style="--gap:1rem">
        <div><div class="dim small">Aktuell</div><b class="serif" style="font-size:1.3rem">${h.label}</b><div class="dim small">${h.name && h.name !== h.label ? h.name : ''}</div></div>
        <div><div class="dim small">Kosten / Tag</div><b class="serif" style="font-size:1.3rem">${h.perDay ? money(h.perDay, cur) : 'keine Miete'}</b></div>
        <div><div class="dim small">Zimmer</div><b class="serif" style="font-size:1.3rem" class="${h.rooms < h.needed ? 'neg' : ''}">${h.rooms} / ${h.needed}</b>${h.rooms < h.needed && v.children.length ? html`<div class="small neg">Kinder brauchen mehr Platz</div>` : ''}</div>
      </div>
      ${h.closed ? html`<div class="alert bad mt">${icon('triangle-alert')}<div>Dein Zuhause ist beschädigt und nur eingeschränkt nutzbar.</div></div>` : ''}
      <div class="row mt">
        ${o && o.lodging && h.type !== 'workplace' ? html`<button class="btn" data-act="sleepAtWork">${icon('bed')} Beim Arbeitgeber schlafen (${money(Math.round(25 * v.idx), cur)} / Tag)</button>` : ''}
        <button class="btn primary" data-go="newspaper">${icon('newspaper')} Wohnungsmarkt ansehen</button>
      </div>
    </section>

    <div class="panel-head mt2"><div><h3 style="font-size:1.5rem">Dein Besitz</h3></div>
      <label class="check"><input type="checkbox" id="auto" ${v.autoMaintain ? 'checked' : ''}> Automatische Instandhaltung ${infoBtn(['Gepflegte Immobilien behalten ihren Wert und steigen stärker.', 'Vernachlässigte Häuser verfallen und können im Extremfall weniger wert sein als der Kaufpreis.', 'Die automatische Pflege kostet etwa 1 % Wert pro Jahr zusätzlich.'], 'Instandhaltung')}</label></div>
    ${v.properties.length ? html`<div class="grid auto" style="--gap:1rem">${v.properties.map((p) => html`<article class="card property">
      <div class="row nowrap spread"><h4>${p.name}</h4>${p.residence ? html`<span class="chip good">${icon('map-pin')} Wohnsitz</span>` : ''}</div>
      <div class="dim small">${p.city} · ${p.rooms} Zimmer</div>
      <div class="mt small">Zustand ${p.condition} %</div>${bar(p.condition, p.condition < 50 ? 'bad' : 'good')}
      <dl class="kv small mt"><dt>Wert</dt><dd>${money(p.value, cur)}</dd>${p.closed ? html`<dt>Ausfall</dt><dd class="neg">noch ${p.closed} Tage</dd>` : ''}</dl>
      <div class="row mt">
        ${p.cityId === v.city.id && !p.residence ? html`<button class="btn sm primary" data-act="moveIn" data-id="${p.id}">Einziehen</button>` : ''}
        ${p.maintainCost > 0 ? html`<button class="btn sm" data-act="maintain" data-id="${p.id}" ${v.money < p.maintainCost ? 'disabled' : ''}>Instand setzen · ${money(p.maintainCost, cur)}</button>` : ''}
        <button class="btn sm danger" data-sell="${p.id}">Verkaufen</button>
      </div></article>`)}</div>`
    : html`<div class="card flat empty-note">${icon('house')}<span>Du besitzt noch keine Immobilie. Sparen lohnt sich – Eigentum steigt über Jahrzehnte im Wert.</span></div>`}`;
  },
  bind(root, ctx) {
    on(root, 'click', '[data-go]', (e, t) => ctx.go(t.dataset.go));
    on(root, 'click', '[data-act]', (e, t) => ctx.act(t.dataset.act, t.dataset.id ? { propertyId: t.dataset.id } : {}));
    on(root, 'click', '[data-sell]', async (e, t) => { if (await ctx.confirm({ title: 'Immobilie verkaufen?', text: 'Du erhältst 97 % des aktuellen Werts. Wohnst du darin, stehst du danach ohne Zuhause da.', ok: 'Verkaufen', danger: true })) ctx.act('sell', { propertyId: t.dataset.sell }); });
    root.querySelector('#auto').addEventListener('change', (e) => ctx.act('autoMaintain', { on: e.target.checked }, { noRender: true }));
  },
};
