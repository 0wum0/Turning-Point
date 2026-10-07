import { html, icon, money, infoBtn, bar, on, num, yearsText } from '../ui.js';

export default {
  id: 'work', label: 'Arbeit', icon: 'briefcase',
  render(ctx) {
    const v = ctx.view; const cur = v.currency; const o = v.occupation; const w = ctx.world;
    const learnedKeys = new Set(v.learned.map((l) => l.key));
    const activeNow = w.professions.filter((p) => !p.academic && p.from <= v.date.year && v.date.year <= p.to && !learnedKeys.has(p.key));
    const acad = w.academic.filter((a) => !learnedKeys.has(a.key));
    const idx = v.idx;
    const curProf = o ? v.learned.find((l) => l.key === o.pkey) : null;
    return html`
    <div class="panel-head"><div><h2>Beruf &amp; Bildung</h2><p>Qualifikation bestimmt, welche Unternehmen du später führen darfst.</p></div>
      ${infoBtn(['Ausbildungen kosten kein Geld, zahlen aber nur Lehrlingslohn. Zehn Jahre Berufserfahrung gelten ebenfalls als Ausbildung.', 'Höhere Berufsstufen bringen mehr Lohn. Drei Studiengänge (Arzt, Finanzwirt, Jurist) kosten Geld und bleiben über alle Leben erhalten.', 'Suche Lehrstellen und Stellen in der Zeitung.'], 'Beruf')}</div>

    <div class="grid c2">
      <section class="card ${o ? 'glow' : ''}">
        <div class="card-title">${icon('briefcase')} Aktuelle Tätigkeit</div>
        ${o ? html`
          <h3 class="serif" style="font-size:1.6rem">${o.name}</h3>
          <div class="dim">${o.kind === 'training' ? 'Ausbildung' : o.kind === 'study' ? 'Studium' : o.level} · ${o.employer}</div>
          <dl class="kv mt small"><dt>${o.kind === 'study' ? 'Studiengebühr / Tag' : 'Lohn / Tag'}</dt><dd class="${o.kind === 'study' ? 'neg' : 'pos'}">${money(o.kind === 'study' ? v.flows.exp.tuition : v.flows.inc.wage, cur)}</dd>
            ${o.kind !== 'work' ? html`<dt>Dauer noch</dt><dd>${yearsText(o.daysLeft)}</dd>` : ''}
            <dt>Schlafplatz</dt><dd>${o.lodging ? 'angeboten' : '–'}</dd></dl>
          ${curProf && curProf.nextLevel ? html`<div class="mt small dim">Nächste Stufe: <b>${curProf.nextLevel}</b> (${yearsText(Math.max(0, curProf.nextAt - curProf.days))})</div>${bar((curProf.days / curProf.nextAt) * 100)}` : ''}
          ${o.kind === 'work' && !learnedKeys.has(o.pkey) && o.pkey !== 'helfer' ? html`<div class="mt small dim">Berufsanerkennung nach 10 Jahren: ${bar(((v.learned.find((l) => l.key === o.pkey) || { days: 0 }).days / 3650) * 100)}</div>` : ''}
          <div class="row end mt"><button class="btn danger sm" id="quit">${icon('log-out')} Kündigen</button></div>`
        : html`<div class="empty-note">${icon('search')}<span>Du hast keine Tätigkeit. Stellen und Lehrstellen stehen in der Zeitung.</span><button class="btn primary sm" data-go="newspaper">Zur Zeitung</button></div>`}
      </section>

      <section class="card">
        <div class="card-title">${icon('graduation-cap')} Erlernte Berufe</div>
        <div class="prof-list">${v.learned.filter((l) => l.key !== 'helfer').map((l) => html`<div class="prof ${l.active ? '' : 'old'}"><div class="lic sm">${icon(l.icon)}</div><div class="grow"><b>${l.name}</b><div class="dim small">${l.level} · ${yearsText(l.days)} Erfahrung${l.active ? '' : ' · nicht mehr gefragt'}</div>${l.nextAt ? bar((l.days / l.nextAt) * 100) : ''}</div></div>`)}
        <div class="prof"><div class="lic sm">${icon('hand-coins')}</div><div class="grow"><b>Hilfsarbeiter</b><div class="dim small">Immer möglich, niedriger Lohn</div></div></div></div>
      </section>
    </div>

    <section class="card mt">
      <div class="card-title">${icon('hammer')} Ausbildungswege (kostenlos)</div>
      <p class="dim small">Eine Ausbildung dauert 1–3 Jahre, du bekommst Lehrlingslohn (≈ 40 %). Lehrstellen findest du in der Zeitung.</p>
      <div class="grid auto" style="--gap:.7rem">${activeNow.length ? activeNow.map((p) => html`<div class="card flat row nowrap"><div class="lic sm">${icon(p.icon)}</div><div class="grow"><b>${p.name}</b><div class="dim small">${yearsText(p.days)} Ausbildung</div></div></div>`) : html`<div class="dim">Du beherrschst alle aktuell verfügbaren Berufe.</div>`}</div>
      <div class="row end mt"><button class="btn" data-go="newspaper">${icon('newspaper')} Lehrstellen suchen</button></div>
    </section>

    <section class="card mt">
      <div class="card-title">${icon('landmark')} Studium (kostet Geld) ${infoBtn(['Medizin, Finanzwesen und Rechtswissenschaft sind die einzigen kostenpflichtigen Studien.', 'Du zahlst Tag für Tag Studiengebühren und verdienst nichts. Reicht das Geld nicht mehr, bricht das Studium ab.', 'Spare vorher einen Puffer – mindestens 60 Tage Gebühren sind Pflicht.'], 'Studium')}</div>
      <div class="grid c3" style="--gap:.8rem">
        ${acad.map((a) => { const day = Math.round(a.tuition * idx); return html`<div class="card flat stack" style="--gap:.4rem"><div class="row nowrap">${icon(a.icon, 'lg')}<h4 class="mb0">${a.name}</h4></div><p class="dim small mb0">${a.description}</p>
          <dl class="kv small"><dt>Dauer</dt><dd>${yearsText(a.days)}</dd><dt>Gebühr / Tag</dt><dd class="neg">${money(day, v.currency)}</dd><dt>Gesamt (~)</dt><dd>${money(day * a.days, v.currency)}</dd></dl>
          <button class="btn sm primary" data-study="${a.key}" ${v.money < day * 60 || (o && o.kind === 'study') ? 'disabled' : ''}>Studium beginnen</button>${v.money < day * 60 ? html`<div class="small neg">Puffer fehlt: ${money(day * 60 - v.money, v.currency)}</div>` : ''}</div>`; })}
        ${acad.length ? '' : html`<div class="dim">Alle Studienabschlüsse erworben. Sie bleiben dir über Generationen erhalten.</div>`}
      </div>
    </section>`;
  },
  bind(root, ctx) {
    on(root, 'click', '[data-go]', (e, t) => ctx.go(t.dataset.go));
    const q = root.querySelector('#quit');
    if (q) q.addEventListener('click', async () => { if (await ctx.confirm({ title: 'Wirklich kündigen?', text: 'Du verlierst Lohn und gegebenenfalls deinen Schlafplatz beim Arbeitgeber.', ok: 'Kündigen', danger: true })) ctx.act('quit', {}); });
    on(root, 'click', '[data-study]', async (e, t) => { if (await ctx.confirm({ title: 'Studium beginnen?', text: 'Du zahlst täglich Studiengebühren und verdienst nichts. Bleibt das Geld aus, wird das Studium abgebrochen.', ok: 'Beginnen' })) ctx.act('study', { pkey: t.dataset.study }); });
  },
};
