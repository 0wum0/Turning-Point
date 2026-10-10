import { html, icon, money, infoBtn, bar, on, ring } from '../ui.js';
import { epiBanner, bindSeasons, heatChip, seasonCard } from '../seasons.js';

const TIER_ICONS = ['sandwich', 'utensils', 'croissant', 'crown'];

export default {
  id: 'household', label: 'Haushalt', icon: 'shopping-basket',
  render(ctx) {
    const v = ctx.view; const cur = v.currency; const m = v.meters;
    const full = m.fridge >= 95;
    return html`
    <div class="panel-head"><div><h2>Haushalt &amp; Gesundheit</h2><p>Essen, Versicherungen und Vorsorge – unabhängig davon, wo du wohnst.</p></div></div>

    ${epiBanner(ctx, { full: true })}
    <section class="card glow">
      <div class="row spread"><div class="card-title" style="margin:0">${icon('refrigerator')} Kühlschrank ${infoBtn(['Der Kühlschrank verbraucht täglich Vorrat – mit Partner und Kindern mehr.', 'Ist er leer, hast du Hunger: Wohlbefinden und Gesundheit sinken täglich. Gute Qualität hebt Stimmung und Gesundheit.', 'Fülle ihn rechtzeitig auf. Später kann ein Butler das übernehmen.'], 'Kühlschrank')}</div>
        <span class="chip">${icon('refresh-cw')} Verbrauch ${v.food.consumption} % / Tag</span></div>
      <div class="fridge-bar mt">${bar(m.fridge, m.fridge < 25 ? 'bad' : 'good')}<div class="row spread small dim"><span>${m.fridge} % gefüllt</span><span>Qualität Ø ${m.fridgeQ} / 4</span></div></div>
      <div class="grid c4 mt" style="--gap:.7rem">
        ${v.food.tiers.map((t, i) => html`<button class="tier" data-food="${i}" ${full || v.money < t.cost ? 'disabled' : ''}>
          ${icon(TIER_ICONS[i], 'lg')}<b>${t.name}</b><span class="mono">${money(t.cost, cur)}</span><small class="dim">auffüllen · ≈ ${money(t.perDay, cur)} / Tag · hält ca. ${t.lasts} Tage</small></button>`)}
      </div>
      ${full ? html`<div class="dim small mt">Der Kühlschrank ist voll.</div>` : ''}
    </section>

    <div class="grid c3 mt" style="--gap:1rem">
      ${[['smile', 'Wohlbefinden', m.wellbeing, 'Ernährung, Arbeit, Wohnung, Beziehung, Finanzen und Erholung bestimmen deine Stimmung.'], ['moon', 'Erholung', m.rest, 'Hängt vor allem vom Schlafplatz ab. Arbeit und Kinder kosten Kraft.'], ['heart-pulse', 'Gesundheit', m.health, 'Gutes Essen, Schlaf, Stimmung und ab etwa 1960 Medizin halten dich gesund.']].map((x) => html`
        <section class="card flat"><div class="row nowrap">${ring(x[2], x[1], x[0], { size: 56 })}<div class="grow"><b>${x[1]}</b><div class="dim small">${x[2]} %</div></div></div><p class="dim small mb0 mt">${x[3]}</p></section>`)}
    </div>

    ${seasonCard(ctx)}
    <section class="card mt">
      <div class="card-title">${icon('shield')} Versicherungen ${infoBtn(['Versicherungen ersetzen Schäden durch Einbruch, Feuer, Sturm oder Krankheit.', 'Sie verhindern aber nicht die Ausfallzeit – ein vom Blitz getroffenes Haus bleibt trotzdem für eine Weile unbenutzbar.', 'Die Zeitung warnt vor Unwettern und Einbruchserien.'], 'Versicherung')}</div>
      <div class="grid c3" style="--gap:.8rem">${v.insurance.map((i) => html`<div class="card flat stack" style="--gap:.4rem"><div class="row spread nowrap"><b>${i.name}</b><span class="chip ${i.on ? 'good' : ''}">${i.on ? 'aktiv' : 'aus'}</span></div>
        <div class="dim small">schützt vor: ${i.covers.map((c) => ({ burglary: 'Einbruch', fire: 'Feuer', storm: 'Sturm/Blitz', illness: 'Arztkosten' }[c] || c)).join(', ')}</div>
        <div class="mono small">${i.perDay ? money(i.perDay, cur) + ' / Tag' : 'nur mit Immobilie'}</div>
        <button class="btn sm ${i.on ? 'danger' : 'primary'}" data-ins="${i.key}" data-on="${i.on ? 0 : 1}">${i.on ? 'Kündigen' : 'Abschließen'}</button></div>`)}</div>
    </section>

    <section class="card mt">
      <div class="card-title">${icon('stethoscope')} Gesundheitskarten ${infoBtn(['Ab etwa 1960 gibt es Gesundheitskarten. Jede verlängert dein Leben um 10 Tage und stärkt die Gesundheit.', 'Bei einer schweren Erkrankung ist das deine wichtigste Möglichkeit, Zeit zu gewinnen – die Krankheit endet aber trotzdem irgendwann.', 'Kaufe Karten rechtzeitig mit Geld oder Coins.'], 'Gesundheitskarten')}</div>
      ${v.life.illness ? html`<div class="alert bad">${icon('triangle-alert')}<div><b>Diagnose: ${v.life.illness}.</b> Dir bleiben etwa ${v.life.daysLeft} Tage. ${v.cards.available ? 'Gesundheitskarten können dein Leben verlängern.' : 'Die Medizin kann dir noch nicht helfen.'}</div></div>` : ''}
      ${v.cards.available ? html`<div class="row spread"><div><b class="serif" style="font-size:1.5rem">${v.cards.health}</b> <span class="dim">Karte(n) im Besitz</span></div>
        <div class="row"><button class="btn sm" data-cards="money">${icon('banknote')} Kaufen · ${money(v.cards.price, cur)}</button><button class="btn sm" data-cards="coins">${icon('coins')} 1 Karte · ${v.cards.coinPrice} Coins</button><button class="btn sm primary" data-use ${v.cards.health < 1 ? 'disabled' : ''}>${icon('heart-pulse')} Karte einsetzen</button></div></div>`
        : html`<div class="dim">Gesundheitskarten gibt es erst ab ca. 1960.</div>`}
    </section>

    <section class="card mt">
      <div class="card-title">${icon('crown')} Butler</div>
      ${v.butler ? html`<div class="row spread"><div>Dein Butler füllt den Kühlschrank automatisch. <span class="dim">${money(v.butler.perDay, cur)} / Tag</span></div><button class="btn sm danger" data-butler="0">Entlassen</button></div>`
        : html`<div class="row spread"><div class="dim">Für großes Haus oder Villa: Ein Butler übernimmt das tägliche Einkaufen. Du wechselst vom Selbermachen zum Management deines Lebenswerks.</div><button class="btn sm" data-butler="1">Einstellen</button></div>`}
    </section>`;
  },
  bind(root, ctx) {
    bindSeasons(root, ctx);
    on(root, 'click', '[data-food]', (e, t) => ctx.act('buyFood', { tier: Number(t.dataset.food) }));
    on(root, 'click', '[data-ins]', (e, t) => ctx.act('insurance', { key: t.dataset.ins, on: t.dataset.on === '1' }));
    on(root, 'click', '[data-cards]', (e, t) => ctx.act('buyCards', { pay: t.dataset.cards, count: 1 }));
    on(root, 'click', '[data-use]', () => ctx.act('useCard', {}));
    on(root, 'click', '[data-butler]', (e, t) => ctx.act('butler', { on: t.dataset.butler === '1' }));
  },
};
