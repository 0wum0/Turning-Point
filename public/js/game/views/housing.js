import { html, icon, money, infoBtn, bar, on, api, num, toast } from '../ui.js';

const LADDER = [['street', 'Straße', 'tree-pine'], ['workplace', 'Arbeitgeber', 'briefcase'], ['pension', 'Pension', 'hotel'], ['rent', 'Miete', 'house'], ['own', 'Eigentum', 'castle']];

const leaseBox = (p, cur) => {
  const L = p.lease; if (!L || !L.canLet) return '';
  if (!L.on) return html`<div class="lease off mt"><div class="small dim">Vermieten: ca. <b>${money(L.market, cur)}</b> / Tag (${L.yieldPct} % Rendite im Jahr)</div><button class="btn sm" data-lease="on" data-id="${p.id}">${icon('key')} Vermieten</button></div>`;
  return html`<div class="lease on mt"><div class="row nowrap spread"><b>${icon('key')} Vermietet</b><span class="chip ${L.tenant ? (L.tenant.arrears ? 'bad' : 'good') : 'warn'}">${L.tenant ? (L.tenant.arrears ? 'Mieter zahlt nicht' : 'Mieter: ' + L.tenant.name) : 'Mietersuche · ' + L.vacantDays + ' Tage leer'}</span></div>
    <dl class="kv small mt"><dt>Miete / Tag</dt><dd class="pos">${money(L.perDay, cur)}</dd><dt>Marktmiete</dt><dd>${money(L.market, cur)}</dd><dt>Rendite / Jahr</dt><dd>${L.yieldPct} %</dd>${L.tenant ? html`<dt>Mieter seit</dt><dd>${Math.max(1, Math.round(L.tenant.since / 30))} Mon. · unbefristet</dd>` : ''}<dt>Bisher eingenommen</dt><dd>${money(L.total, cur)}</dd></dl>
    <label class="small dim" for="lm${p.id}">Mietpreis: <b class="lval">${Math.round(L.mult * 100)} %</b> der Marktmiete</label>
    <input type="range" id="lm${p.id}" class="lrange" min="50" max="200" step="5" value="${Math.round(L.mult * 100)}" data-lprice="${p.id}">
    <div class="hint">Günstiger = schneller ein Mieter, teurer = mehr Ertrag, aber längerer Leerstand.</div>
    <label class="check mt"><input type="checkbox" data-lplayers="${p.id}" ${L.players ? 'checked' : ''} ${L.playerTenant ? 'disabled' : ''}> Auch an Spieler vermieten ${L.open ? html`<span class="chip accent">im Stadtverzeichnis</span>` : ''}</label>
    ${L.playerTenant ? html`<button class="btn sm danger mt" data-evict="${p.id}">Spieler-Mieter kündigen</button> ` : ''}<button class="btn sm ghost mt" data-lease="off" data-id="${p.id}">Vermietung beenden</button></div>`;
};
const saleSection = (ctx, ed) => {
  const v = ctx.view; const cur = v.currency;
  if (!ed || !ed.housing || !ed.housing.sale) return '';
  return html`<div class="panel-head mt2"><div><h3 style="font-size:1.5rem">Immobilien kaufen</h3><p>Angebote in ${v.city.name}. Du kannst sie bewohnen oder vermieten – und in anderen Städten über die Zeitung kaufen.</p></div></div>
    <div class="listings">${ed.housing.sale.map((h) => html`<article class="listing"><div class="lic">${icon(h.kind === 'villa' ? 'castle' : 'house', 'lg')}</div>
      <div class="grow"><div class="row nowrap spread"><h4>${h.name}</h4><span class="chip accent">Kauf</span></div>
        <div class="dim small">${h.rooms} Zimmer · Zustand ${h.condition} % · Miete möglich: ca. ${money(h.rentPerDay || 0, cur)} / Tag</div>${bar(h.condition, h.condition < 50 ? 'bad' : 'good')}
        <div class="row small" style="margin-top:.4rem"><b class="mono">${money(h.price, cur)}</b>${v.money < h.price ? html`<span class="chip bad">${money(h.price - v.money, cur)} fehlen</span>` : ''}</div></div>
      <button class="btn primary sm" data-buy="${h.id}" ${v.money < h.price ? 'disabled' : ''}>Kaufen</button></article>`)}</div>`;
};

export default {
  id: 'housing', label: 'Wohnen', icon: 'house',
  async load(ctx) { try { return (await api('GET', '/api/newspaper')).edition; } catch (_) { return null; } },
  render(ctx, ed) {
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
      ${h.lessor ? html`<div class="alert mt">${icon('key')}<div class="grow">Du wohnst zur Miete bei einem anderen Spieler. Der Vermieter kann kündigen; du kannst jederzeit ausziehen.</div><button class="btn sm" data-leave="1">Ausziehen</button></div>` : ''}
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
      ${leaseBox(p, cur)}
      <div class="row mt">
        ${p.cityId === v.city.id && !p.residence ? html`<button class="btn sm primary" data-act="moveIn" data-id="${p.id}">Einziehen</button>` : ''}
        ${p.closed > 10 ? html`<button class="btn sm primary" data-act="repair" data-id="${p.id}" ${v.money < p.repairCost ? 'disabled' : ''} title="Eine Baufirma aus der Stadt wird beauftragt und bezahlt">${icon('hammer')} Baufirma beauftragen · ${money(p.repairCost, cur)}</button>` : ''}
        ${p.maintainCost > 0 ? html`<button class="btn sm" data-act="maintain" data-id="${p.id}" ${v.money < p.maintainCost ? 'disabled' : ''}>Instand setzen · ${money(p.maintainCost, cur)}</button>` : ''}
        <button class="btn sm" data-psell="${p.id}" data-name="${p.name}" data-value="${Math.round(p.value / (v.idx || 1))}">An Spieler verkaufen …</button><button class="btn sm danger" data-sell="${p.id}">Verkaufen</button>
      </div></article>`)}</div>`
    : html`<div class="card flat empty-note">${icon('house')}<span>Du besitzt noch keine Immobilie. Sparen lohnt sich – Eigentum steigt über Jahrzehnte im Wert.</span></div>`}
    ${saleSection(ctx, ed)}`;
  },
  bind(root, ctx) {
    on(root, 'click', '[data-go]', (e, t) => ctx.go(t.dataset.go));
    on(root, 'click', '[data-psell]', (e, t) => import('../market.js').then((mod) => mod.openSell(ctx, 'prop', Number(t.dataset.psell), t.dataset.name, Number(t.dataset.value), null, () => ctx.rerender())));
    on(root, 'click', '[data-buy]', (e, t) => ctx.act('buy', { listingId: t.dataset.buy }));
    on(root, 'change', '[data-lplayers]', (e, t) => ctx.act('letPlayers', { propertyId: t.dataset.lplayers, on: t.checked }));
    on(root, 'click', '[data-evict]', async (e, t) => { if (await ctx.confirm({ title: 'Mieter kündigen?', text: 'Der Spieler verliert sofort seine Wohnung.', ok: 'Kündigen', danger: true })) { try { const r = await api('POST', '/api/social/lease/evict', { propId: Number(t.dataset.evict) }); ctx.setView(r.view); ctx.hud(); ctx.rerender(); } catch (er) { toast(er.message, 'bad'); } } });
    on(root, 'click', '[data-leave]', async () => { if (await ctx.confirm({ title: 'Ausziehen?', text: 'Du beendest den Mietvertrag und wohnst danach auf der Straße, bis du etwas Neues findest.', ok: 'Ausziehen', danger: true })) { try { const r = await api('POST', '/api/social/lease/leave', {}); ctx.setView(r.view); ctx.hud(); ctx.rerender(); } catch (er) { toast(er.message, 'bad'); } } });
    on(root, 'click', '[data-lease]', (e, t) => ctx.act(t.dataset.lease === 'on' ? 'letOn' : 'letOff', { propertyId: t.dataset.id, mult: 1 }));
    root.querySelectorAll('[data-lprice]').forEach((r) => {
      r.addEventListener('input', () => { const l = r.parentNode.querySelector('.lval'); if (l) l.textContent = `${r.value} %`; });
      r.addEventListener('change', () => ctx.act('letPrice', { propertyId: r.dataset.lprice, mult: Number(r.value) / 100 }));
    });
    on(root, 'click', '[data-act]', (e, t) => ctx.act(t.dataset.act, t.dataset.id ? { propertyId: t.dataset.id } : {}));
    on(root, 'click', '[data-sell]', async (e, t) => { if (await ctx.confirm({ title: 'Immobilie verkaufen?', text: 'Du erhältst 97 % des aktuellen Werts. Wohnst du darin, stehst du danach ohne Zuhause da.', ok: 'Verkaufen', danger: true })) ctx.act('sell', { propertyId: t.dataset.sell }); });
    root.querySelector('#auto').addEventListener('change', (e) => ctx.act('autoMaintain', { on: e.target.checked }, { noRender: true }));
  },
};
