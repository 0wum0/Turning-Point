import { html, icon, money, infoBtn, bar, on, signed } from '../ui.js';

function card(c, v) {
  const cur = v.currency; const f = c.flows;
  if (c.abandoned) {
    return html`<article class="card biz lost"><div class="boards"></div>
      <div class="row nowrap spread"><h3>${c.name}</h3><span class="chip bad">${icon('triangle-alert')} Lost Place</span></div>
      <div class="dim small">${c.city} · ${c.tierName} · Wert verfällt</div>
      <dl class="kv small mt"><dt>Aktueller Wert</dt><dd>${money(c.value, cur)}</dd><dt>Reaktivierung</dt><dd>${money(c.reactivateCost, cur)}</dd></dl>
      <div class="row mt"><button class="btn primary sm" data-b="bizReactivate" data-id="${c.id}" ${c.qualified ? '' : 'disabled'}>Wiederbeleben</button><button class="btn sm" data-psell="${c.id}" data-name="${c.name}" data-value="${Math.round(c.value / (v.idx || 1))}">An Spieler …</button><button class="btn sm danger" data-sell="${c.id}">Verkaufen</button></div>
      ${c.qualified ? '' : html`<div class="small neg mt">Dir fehlt die Qualifikation (${c.profession}).</div>`}</article>`;
  }
  return html`<article class="card biz ${f.profit < 0 ? 'loss' : ''}">
    <div class="row nowrap spread"><h3>${c.name}</h3><span class="chip accent">${c.tierName}</span></div>
    <div class="dim small">${c.city} · ${c.profession}${c.owner ? ' · du arbeitest hier' : ''}${c.manager ? ' · Manager' : ''}</div>
    <div class="grid c2 mt small" style="--gap:.6rem"><div><div class="dim">Räume</div><b>${c.rooms} / ${c.maxRooms}</b></div><div><div class="dim">Mitarbeiter</div><b>${c.staff} / ${c.needed}</b></div></div>
    ${c.hit ? html`<div class="alert warn small mt">${icon('trending-down')}<div>Ein Konkurrent unterbietet deine Preise: Umsatz −${c.hit.pct} % (noch ${c.hit.days} Tage).</div></div>` : ''}${c.outage ? html`<div class="alert bad small mt">${icon('flame')}<div>Produktionsausfall nach einem Anschlag: noch ${c.outage} Tage kein Umsatz.</div></div>` : ''}
    ${c.comp ? html`<div class="small mt ${c.comp.factor < 0.9 ? 'neg' : 'dim'}">${icon('users')} Konkurrenz: ${c.comp.firms} Betriebe dieser Art in ${c.city}, ${c.comp.total} von ${c.comp.cap} Räumen Nachfrage${c.comp.factor < 1 ? html` – Umsatz ×${String(Math.round(c.comp.factor * 100) / 100).replace('.', ',')}` : ''}</div>` : ''}
    <div class="mt small">Auslastung ${Math.round(f.efficiency * 100)} %</div>${bar(f.efficiency * 100, f.efficiency < 0.5 ? 'bad' : 'good')}
    <dl class="kv small mt"><dt>Umsatz / Tag</dt><dd>${money(f.income, cur)}</dd><dt>Löhne + Unterhalt</dt><dd class="neg">${money(f.wages + f.upkeep, cur)}</dd><dt><b>Gewinn / Tag</b></dt><dd class="${f.profit >= 0 ? 'pos' : 'neg'}">${signed(f.profit, cur)}</dd><dt>Firmenkasse</dt><dd>${money(c.cash, cur)}</dd><dt>Wert</dt><dd>${money(c.value, cur)}</dd></dl>
    <div class="row mt">
      <button class="btn sm primary" data-b="bizCollect" data-id="${c.id}" ${c.cash > 0 ? '' : 'disabled'}>${icon('hand-coins')} Abholen</button>
      ${c.owner ? '' : html`<button class="btn sm" data-b="bizWork" data-id="${c.id}" ${c.cityId === v.city.id ? '' : 'disabled'}>${icon('hammer')} Selbst arbeiten</button>`}
      <button class="btn sm" data-b="bizSecurity" data-id="${c.id}" data-on="${c.security ? 0 : 1}">${icon('shield')} ${c.security ? 'Sicherheitsdienst abbestellen' : 'Sicherheitsdienst'}</button>
      <button class="btn sm" data-b="bizManager" data-id="${c.id}" data-on="${c.manager ? 0 : 1}">${icon('crown')} ${c.manager ? 'Manager entlassen' : 'Manager einstellen'}</button>
    </div>
    <div class="row mt">
      <button class="btn sm" data-b="bizHire" data-id="${c.id}" data-delta="1">+ Mitarbeiter</button><button class="btn sm" data-b="bizHire" data-id="${c.id}" data-delta="-1" ${c.staff ? '' : 'disabled'}>− Mitarbeiter</button>
      <button class="btn sm" data-b="bizExpand" data-id="${c.id}" ${c.rooms >= c.maxRooms ? 'disabled' : ''}>${icon('plus')} Raum · ${money(c.roomCost, cur)} + ${Math.max(1, Math.ceil(c.roomCoins / 2 ** c.roomStep))} ${icon('coins')}</button>
      ${c.roomCoins > 1 ? html`<button class="btn sm ghost" data-ad="${c.id}" title="Werbung ansehen, Coin-Preis senken">${icon('circle-play')}</button>` : ''}
    </div>
    <div class="row mt">${c.next ? html`<button class="btn sm" data-b="bizUpgrade" data-id="${c.id}" ${c.next.qualified && v.money >= c.next.cost ? '' : 'disabled'}>${icon('trending-up')} Zu ${c.next.name} ausbauen · ${money(c.next.cost, cur)}</button>` : ''}<button class="btn sm" data-psell="${c.id}" data-name="${c.name}" data-value="${Math.round(c.value / (v.idx || 1))}">An Spieler …</button><button class="btn sm danger" data-sell="${c.id}">Verkaufen</button></div>
    ${c.next && !c.next.qualified ? html`<div class="small dim mt">Ausbau braucht Berufsstufe ${['Anfänger', 'Geselle', 'Fachkraft', 'Meister', 'Altmeister'][c.next.minLevel]}.</div>` : ''}
  </article>`;
}

export default {
  id: 'business', label: 'Unternehmen', icon: 'store',
  render(ctx) {
    const v = ctx.view; const cs = v.companies; const cur = v.currency;
    const profit = cs.filter((c) => !c.abandoned).reduce((s, c) => s + c.flows.profit, 0);
    const cash = cs.reduce((s, c) => s + c.cash, 0);
    return html`
    <div class="panel-head"><div><h2>Unternehmen</h2><p>Vom Wirtshaus zum Hotel: Qualifikation, Räume, Mitarbeiter, Manager.</p></div>
      ${infoBtn(['Betriebe darfst du nur mit passender Qualifikation führen – etwa Wirt → Wirtshaus → Restaurant → Hotel. Der Beruf des Partners kann Betriebe der Einstiegsstufe eröffnen.', 'Du kannst zuerst selbst arbeiten und später Mitarbeiter und Manager einsetzen. Verlierst du die Qualifikation (z. B. durch Trennung oder beim Erben), wird der Betrieb zum Lost Place und verfällt über etwa zehn Jahre.', 'Betriebe zum Verkauf stehen in der Zeitung unter „Gewerbe“. Räume schaltest du mit Geld und Coins frei.'], 'Unternehmen')}</div>
    ${cs.length ? html`<div class="grid c3" style="--gap:1rem"><div class="card flat"><div class="card-title">Betriebe</div><div class="big-money">${cs.length}</div></div><div class="card flat"><div class="card-title">Gewinn / Tag</div><div class="big-money ${profit >= 0 ? 'pos' : 'neg'}">${signed(profit, cur)}</div></div><div class="card flat"><div class="card-title">Firmenkassen</div><div class="big-money">${money(cash, cur)}</div>${cash > 0 ? html`<button class="btn sm primary mt" data-b="bizCollect" data-id="all">Alles abholen</button>` : ''}</div></div>
      <div class="grid auto mt" style="--gap:1rem;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">${cs.map((c) => card(c, v))}</div>`
    : html`<div class="card empty-note">${icon('store', 'lg')}<span>Du besitzt noch keinen Betrieb. Mit Qualifikation (z. B. als Wirt oder Bäcker) findest du in der Zeitung unter „Gewerbe“ passende Angebote.</span><button class="btn primary sm" data-go="newspaper">Zur Zeitung</button></div>`}`;
  },
  bind(root, ctx) {
    on(root, 'click', '[data-go]', (e, t) => { ctx.ui.newsTab = 'biz'; ctx.go(t.dataset.go); });
    on(root, 'click', '[data-b]', (e, t) => {
      const input = { id: t.dataset.id === 'all' ? 'all' : Number(t.dataset.id) };
      if (t.dataset.on != null) input.on = t.dataset.on === '1';
      if (t.dataset.delta) input.delta = Number(t.dataset.delta);
      ctx.act(t.dataset.b, input);
    });
    on(root, 'click', '[data-psell]', (e, t) => import('../market.js').then((mod) => mod.openSell(ctx, 'firm', Number(t.dataset.psell), t.dataset.name, Number(t.dataset.value), null, () => ctx.rerender())));
    on(root, 'click', '[data-sell]', async (e, t) => { if (await ctx.confirm({ title: 'Betrieb verkaufen?', text: 'Du erhältst den aktuellen Wert (90 %) plus die Firmenkasse.', ok: 'Verkaufen', danger: true })) ctx.act('bizSell', { id: Number(t.dataset.sell) }); });
    on(root, 'click', '[data-ad]', async (e, t) => { await ctx.watchAd(`discount:room:${t.dataset.ad}`); ctx.rerender(); });
  },
};
