import { html, icon, money, infoBtn, bar, on, num, yearsText } from '../ui.js';

export default {
  id: 'work', label: 'Arbeit', icon: 'briefcase',
  render(ctx) {
    const v = ctx.view; const cur = v.currency; const o = v.occupation; const w = ctx.world;
    const learnedKeys = new Set(v.learned.map((l) => l.key));
    const activeNow = w.professions.filter((p) => !p.academic && p.from <= v.date.year && v.date.year <= p.to && !learnedKeys.has(p.key));
    const acad = w.academic.filter((a) => !learnedKeys.has(a.key));
    const idx = v.idx; const career = v.career;
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
          ${career.steps ? html`<div class="mt small dim">Gehaltsstufen: Betriebszugehörigkeit ${career.steps.tenure}/${career.steps.maxTenure} · Leistung ${career.steps.perf}/${career.steps.maxPerf} (je +${career.steps.pct} %, Lohn gesamt ${career.steps.mult} %)</div>` : ''}
          ${career.notice ? html`<div class="alert warn mt">${icon('info')}<div>Kündigungsfrist: noch ${career.notice.daysLeft} Tage${career.notice.switchTo ? html` – danach wechselst du zu <b>${career.notice.switchTo}</b>` : ''}. <button class="btn sm ghost" id="cancelNotice">Zurücknehmen</button></div></div>` : ''}
          <div class="row end wrap mt" style="gap:.5rem">${career.raise ? html`<button class="btn sm" id="raise" ${career.raise.can ? '' : 'disabled'} title="Chance ca. ${career.raise.chance} %">${icon('trending-up')} Gehaltsgespräch${career.raise.wait ? ' (in ' + career.raise.wait + ' T.)' : ''}</button>` : ''}
            ${career.canNotice ? html`<button class="btn sm" id="notice">Mit Frist kündigen (${career.noticeDays} T.)</button>` : ''}<button class="btn danger sm" id="quit">${icon('log-out')} Sofort kündigen</button></div>`
        : html`<div class="empty-note">${icon('search')}<span>Du hast keine Tätigkeit. Stellen und Lehrstellen stehen in der Zeitung.</span><button class="btn primary sm" data-go="newspaper">Zur Zeitung</button></div>`}
      </section>

      <section class="card">
        <div class="card-title">${icon('graduation-cap')} Erlernte Berufe</div>
        <div class="prof-list">${v.learned.filter((l) => l.key !== 'helfer').map((l) => html`<div class="prof ${l.active ? '' : 'old'}"><div class="lic sm">${icon(l.icon)}</div><div class="grow"><b>${l.name}</b><div class="dim small">${l.level} · ${yearsText(l.days)} Erfahrung${l.active ? '' : ' · nicht mehr gefragt'}</div>${l.nextAt ? bar((l.days / l.nextAt) * 100) : ''}</div></div>`)}
        <div class="prof"><div class="lic sm">${icon('hand-coins')}</div><div class="grow"><b>Hilfsarbeiter</b><div class="dim small">Immer möglich, niedriger Lohn</div></div></div></div>
      </section>
    </div>

    ${career.benefit ? html`<div class="alert good mt">${icon('hand-coins')}<div><b>Arbeitslosengeld</b>: ${money(career.benefit.perDay, cur)} pro Tag, noch ${career.benefit.daysLeft} Tage. Es endet, sobald du eine neue Stelle antrittst.</div></div>` : ''}
    <section class="card mt">
      <div class="card-title">${icon('graduation-cap')} Weiterbildung ${infoBtn(['Fortbildung: Gebühr und ' + career.courses.days + ' Tage Kurs bringen Berufserfahrung (ein Jahr) und können eine höhere Berufsstufe bedeuten.', 'Umschulung: Gebühr und ' + career.courses.unlockDays + ' Tage Kurs schalten einen neuen Beruf frei.', 'Während eines Kurses sinkt täglich die Erholung. Pro Jahr sind ' + career.courses.cap + ' Kurse möglich.'], 'Weiterbildung')}</div>
      ${career.course ? html`<div class="alert info">${icon('graduation-cap')}<div>Laufender Kurs: <b>${career.course.name}</b> (${career.course.kind === 'unlock' ? 'Umschulung' : 'Fortbildung'}), noch ${career.course.daysLeft} Tage.</div></div>` : ''}
      <p class="dim small">Kurse in diesem Jahr: ${career.courses.used}/${career.courses.cap}</p>
      <div class="grid auto" style="--gap:.6rem">${career.courses.options.map((p) => html`<div class="card flat row nowrap"><div class="lic sm">${icon(p.icon)}</div><div class="grow"><b>${p.name}</b><div class="dim small">${p.learned ? 'Fortbildung' : 'Umschulung'} · ${money(p.fee, cur)}</div></div><button class="btn sm ${p.learned ? '' : 'primary'}" data-course="${p.key}:${p.learned ? 'skill' : 'unlock'}" ${career.course || career.courses.used >= career.courses.cap || v.money < p.fee ? 'disabled' : ''}>Buchen</button></div>`)}</div>
    </section>

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
    const rs = root.querySelector('#raise'); if (rs) rs.addEventListener('click', () => ctx.act('askRaise', {}));
    const cn = root.querySelector('#cancelNotice'); if (cn) cn.addEventListener('click', () => ctx.act('cancelNotice', {}));
    const nt = root.querySelector('#notice'); if (nt) nt.addEventListener('click', async () => { if (await ctx.confirm({ title: 'Mit Kündigungsfrist kündigen?', text: 'Du arbeitest bis zum Fristende weiter. Arbeitslosengeld gibt es nach eigener Kündigung nicht.', ok: 'Kündigen', danger: true })) ctx.act('giveNotice', {}); });
    on(root, 'click', '[data-course]', async (e, t) => { const [pkey, kind] = t.dataset.course.split(':'); if (await ctx.confirm({ title: 'Kurs buchen?', text: 'Die Gebühr wird sofort abgebucht.', ok: 'Buchen' })) ctx.act('course', { pkey, kind }); });
    on(root, 'click', '[data-study]', async (e, t) => { if (await ctx.confirm({ title: 'Studium beginnen?', text: 'Du zahlst täglich Studiengebühren und verdienst nichts. Bleibt das Geld aus, wird das Studium abgebrochen.', ok: 'Beginnen' })) ctx.act('study', { pkey: t.dataset.study }); });
  },
};
