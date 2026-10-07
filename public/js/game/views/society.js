import { html, icon, money, infoBtn, bar, on, yearsText, signed } from '../ui.js';

export default {
  id: 'society', label: 'Gesellschaft', icon: 'landmark',
  render(ctx) {
    const v = ctx.view; const p = v.politics; const g = v.gambling; const cur = v.currency;
    return html`
    <div class="panel-head"><div><h2>Gesellschaft</h2><p>Ämter, Einfluss – und ein bisschen Glück.</p></div>
      ${infoBtn(['Öffentliche Ämter müssen Stufe für Stufe durchlaufen werden. Anfangs kosten sie Geld, Kraft und Gesundheit und bringen wenig ein.', 'Mit Erfahrung und Einfluss steigen Wahlchancen und Einkommen. Einfluss bleibt dir über alle Leben erhalten. Im Amt arbeitest du nur noch in Teilzeit (60 % Lohn).', 'Kandidiere für das erste Amt, sobald du etwas Erspartes und gute Stimmung hast.'], 'Ämter')}</div>

    <section class="card ${p.term ? 'glow' : ''}">
      <div class="row spread"><div class="card-title" style="margin:0">${icon('landmark')} Politische Laufbahn</div><span class="chip accent">${icon('sparkles')} Einfluss: ${p.influence}</span></div>
      ${p.term ? html`<div class="mt"><h3 class="serif" style="font-size:1.6rem">${p.term.name}</h3><div class="dim">Noch ${yearsText(p.term.daysLeft)} im Amt · Einkommen ${money(p.term.income, cur)} / Tag</div>${bar((1 - p.term.daysLeft / p.termDays) * 100)}<div class="row end mt"><button class="btn sm danger" id="resign">Zurücktreten</button></div></div>`
        : !p.ageOk ? html`<div class="alert info mt">${icon('info')}<div>Ämter gibt es ab ${p.minAge} Jahren.</div></div>` : ''}
      <div class="stack mt" style="--gap:.6rem">${p.offices.map((o) => html`<div class="office ${o.unlocked ? '' : 'locked'}"><div class="lic sm">${icon(o.unlocked ? 'landmark' : 'lock')}</div>
        <div class="grow"><b>${o.name}</b><div class="dim small">Wahlkampf ${money(o.campaign, cur)} · Einkommen ${o.income ? money(o.income, cur) + ' / Tag' : 'unbezahlt'} · Kraft −${o.rest}/Tag${o.done ? ' · ' + o.done + '× absolviert' : ''}</div></div>
        <div class="row nowrap"><span class="chip">${o.chance} %</span><button class="btn sm primary" data-run="${o.idx}" ${(!o.unlocked || p.term || !p.ageOk || v.money < o.campaign) ? 'disabled' : ''}>Kandidieren</button></div></div>`)}</div>
    </section>

    <div class="grid c2 mt" style="--gap:1rem">
      <section class="card"><div class="card-title">${icon('ticket')} Lotto ${infoBtn(['Lotto ist freiwillig – und statistisch ein Verlustgeschäft.', 'Es gibt kleine Gewinne, selten große. Sehr selten winkt ein Vermögen.', 'Setze nur, was du verschmerzen kannst.'], 'Lotto')}</div>
        <p class="dim small">Ein Tipp kostet <b>${money(g.ticket, cur)}</b>. Gewinne: ×2, ×10, ×300, selten ×10.000.</p>
        <div class="row"><button class="btn" data-lotto="1">1 Tipp</button><button class="btn" data-lotto="5">5 Tipps</button><button class="btn" data-lotto="20">20 Tipps</button></div></section>
      <section class="card"><div class="card-title">${icon('dices')} Spielbank ${infoBtn(['Roulette auf Rot/Schwarz: Gewinnchance 48,6 %, Einsatz verdoppelt sich bei Gewinn.', 'Die Null gehört der Bank – auf Dauer verliert man. Wer alles setzt, riskiert die Insolvenz.', 'Spiele nur freiwillig und mit Maß.'], 'Casino')}</div>
        ${g.casino ? html`<div class="row"><input id="bet" type="number" min="1" value="${Math.max(100, Math.round(g.ticket * 5))}" style="width:140px"><button class="btn primary" id="betBtn">Einsatz in Cent setzen</button></div><div class="dim small mt">Bisheriger Gesamtverlust: ${money(g.lost, cur)}</div>`
          : html`<div class="dim">${v.date.year < g.casinoFrom ? 'Spielbanken gibt es erst ab ' + g.casinoFrom + '.' : 'Zutritt erst ab ' + g.minAge + ' Jahren.'}</div>`}</section>
    </div>`;
  },
  bind(root, ctx) {
    on(root, 'click', '[data-run]', (e, t) => ctx.act('runOffice', { idx: Number(t.dataset.run) }));
    const rs = root.querySelector('#resign'); if (rs) rs.onclick = async () => { if (await ctx.confirm({ title: 'Zurücktreten?', text: 'Die laufende Amtszeit zählt dann nicht.', ok: 'Zurücktreten', danger: true })) ctx.act('resignOffice', {}); };
    on(root, 'click', '[data-lotto]', (e, t) => ctx.act('lotto', { tickets: Number(t.dataset.lotto) }));
    const b = root.querySelector('#betBtn'); if (b) b.onclick = () => ctx.act('casino', { bet: Number(root.querySelector('#bet').value) });
  },
};
