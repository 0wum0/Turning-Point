import { html, icon, money, moneyShort, infoBtn, api, on, mount, toast, num, esc, bar } from './ui.js';

/* ---------------- Charaktererstellung ---------------- */
export function renderCreate(root, ctx) {
  const w = ctx.world;
  const st = ctx.ui.create || (ctx.ui.create = { step: 1, gender: 'm', firstName: '', lastName: '', birthCityId: null, professionKey: null, fatherName: '', fatherJob: '', motherName: '', motherJob: '', q: '' });
  const steps = ['Wer du bist', 'Heimatstadt', 'Beruf', 'Herkunft', 'Los geht’s'];
  const valid = () => ({
    1: st.firstName.trim().length >= 2 && st.lastName.trim().length >= 2, 2: !!st.birthCityId, 3: !!st.professionKey, 4: true, 5: true,
  }[st.step]);
  const city = w.cities.find((c) => c.id === st.birthCityId);
  const prof = w.startProfessions.find((p) => p.key === st.professionKey);
  const body = {
    1: () => html`<h2>Wer bist du?</h2><p class="dim">Wir schreiben das Jahr ${w.startYear}. Du bist 20 Jahre alt.</p>
      <div class="field"><label>Geschlecht</label><div class="choice" style="grid-template-columns:repeat(3,1fr)">${[['m', 'Mann'], ['f', 'Frau'], ['d', 'Divers']].map((g) => html`<label><input type="radio" name="gender" value="${g[0]}" ${st.gender === g[0] ? 'checked' : ''}><span class="opt">${g[1]}</span></label>`)}</div></div>
      <div class="grid c2"><div class="field"><label for="fn">Vorname</label><input id="fn" type="text" maxlength="30" value="${st.firstName}" autofocus></div><div class="field"><label for="ln">Nachname</label><input id="ln" type="text" maxlength="30" value="${st.lastName}"></div></div>`,
    2: () => html`<h2>Deine Heimatstadt</h2><p class="dim">Hier wurdest du geboren. Die Rückkehr in deine Geburtsstadt ist später immer kostenlos – jeder andere Umzug kostet Geld und Coins.</p>
      <div class="field"><input id="cq" type="search" placeholder="Stadt suchen …" value="${st.q}"></div>
      <div class="choice city-choice" id="cityList">${w.cities.filter((c) => !st.q || c.name.toLowerCase().includes(st.q.toLowerCase())).map((c) => html`<label><input type="radio" name="city" value="${c.id}" ${st.birthCityId === c.id ? 'checked' : ''}><span class="opt">${c.name}<small>${c.state}</small></span></label>`)}</div>`,
    3: () => html`<h2>Dein erlernter Beruf</h2><p class="dim">Du hast bereits eine praktische Ausbildung. Der Beruf bestimmt, welche Betriebe du später führen darfst.</p>
      <div class="choice prof-choice">${w.startProfessions.map((p) => html`<label><input type="radio" name="prof" value="${p.key}" ${st.professionKey === p.key ? 'checked' : ''}><span class="opt">${icon(p.icon)} ${p.name}<small>${p.description || ''}</small></span></label>`)}</div>`,
    4: () => html`<h2>Deine Herkunft</h2><p class="dim">Deine Eltern und Geschwister sind im Krieg umgekommen. Wer waren sie? (optional)</p>
      <div class="grid c2"><div class="field"><label>Vater – Vorname</label><input id="fan" type="text" maxlength="40" value="${st.fatherName}"></div><div class="field"><label>Vaters Beruf</label><input id="faj" type="text" maxlength="40" value="${st.fatherJob}" placeholder="z. B. Schlosser"></div>
      <div class="field"><label>Mutter – Vorname</label><input id="mon" type="text" maxlength="40" value="${st.motherName}"></div><div class="field"><label>Mutters Beruf</label><input id="moj" type="text" maxlength="40" value="${st.motherJob}" placeholder="z. B. Näherin"></div></div>`,
    5: () => html`<h2>Bereit?</h2>
      <div class="story card flat"><p class="serif" style="font-size:1.25rem;line-height:1.5"><b>${st.firstName} ${st.lastName}</b>, 20 Jahre alt, geboren in <b>${city ? city.name : ''}</b>. Gelernter ${prof ? prof.name : ''}. Alle Angehörigen sind tot. In der Tasche: <b>${money(w.startMoney, 'DM')}</b>.</p>
      <p class="dim mb0">Kein Dach über dem Kopf, ein leerer Kühlschrank – und die Zeitung auf dem Tisch. Wie viel Zukunft steckt in 40 Mark?</p></div>
      <div class="grid c3 mt small"><div class="chip">${icon('coins')} ${ctx.coins} Coins aus früheren Leben</div><div class="chip">${icon('zap')} Zeit: ${ctx.efsPool} EFS</div><div class="chip">${icon('flag')} Ziel: 22. Jahrhundert</div></div>`,
  }[st.step]();
  mount(root, html`<div class="create-wrap"><div class="create-head"><a class="brand" href="/"><span class="mark">${icon('hourglass')}</span><span>TURNING POINT<small>Neues Leben</small></span></a></div>
    <ol class="steps cr-steps">${steps.map((s, i) => html`<li class="${i + 1 === st.step ? 'on' : i + 1 < st.step ? 'done' : ''}"><span>${i + 1}</span> ${s}</li>`)}</ol>
    <section class="card create-card">${body}<div class="row spread mt2"><button class="btn ghost" id="back" ${st.step === 1 ? 'style="visibility:hidden"' : ''}>${icon('chevron-left')} Zurück</button><button class="btn primary lg" id="next" ${valid() ? '' : 'disabled'}>${st.step === 5 ? html`${icon('sparkles')} Leben beginnen` : html`Weiter ${icon('chevron-right')}`}</button></div></section></div>`);
  const rerender = () => renderCreate(root, ctx);
  const bindInput = (id, key) => { const el = root.querySelector(id); if (el) el.addEventListener('input', () => { st[key] = el.value; const n = root.querySelector('#next'); if (n && st.step === 1) n.disabled = !valid(); }); };
  bindInput('#fn', 'firstName'); bindInput('#ln', 'lastName'); bindInput('#fan', 'fatherName'); bindInput('#faj', 'fatherJob'); bindInput('#mon', 'motherName'); bindInput('#moj', 'motherJob');
  root.querySelectorAll('input[name=gender]').forEach((r) => r.addEventListener('change', () => { st.gender = r.value; }));
  root.querySelectorAll('input[name=city]').forEach((r) => r.addEventListener('change', () => { st.birthCityId = Number(r.value); root.querySelector('#next').disabled = false; }));
  root.querySelectorAll('input[name=prof]').forEach((r) => r.addEventListener('change', () => { st.professionKey = r.value; root.querySelector('#next').disabled = false; }));
  const cq = root.querySelector('#cq'); if (cq) { cq.addEventListener('input', () => { st.q = cq.value; const pos = cq.selectionStart; rerender(); const n = root.querySelector('#cq'); n.focus(); n.setSelectionRange(pos, pos); }); }
  root.querySelector('#back').onclick = () => { st.step--; rerender(); };
  root.querySelector('#next').onclick = async (e) => {
    if (st.step < 5) { st.step++; rerender(); return; }
    const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('POST', '/api/create', { gender: st.gender, firstName: st.firstName, lastName: st.lastName, birthCityId: st.birthCityId, professionKey: st.professionKey, fatherName: st.fatherName, fatherJob: st.fatherJob, motherName: st.motherName, motherJob: st.motherJob });
      ctx.ui.create = null; ctx.setView(r.view); ctx.go('newspaper');
    } catch (er) { toast(er.message, 'bad'); b.disabled = false; b.innerHTML = 'Leben beginnen'; }
  };
}

/* ---------------- Tod & Erbe ---------------- */
export function renderHeir(root, ctx) {
  const v = ctx.view; const cur = v.currency;
  const sel = ctx.ui.heir || (ctx.ui.heir = { childId: v.heirs[0] && v.heirs[0].id, bequest: v.estate.properties.map((p) => p.id) });
  mount(root, html`<div class="create-wrap"><div class="create-head"><span class="brand"><span class="mark">${icon('hourglass')}</span><span>TURNING POINT<small>Generationenwechsel</small></span></span></div>
    <section class="card create-card glow">
      <div class="serif dim" style="font-size:.9rem;letter-spacing:.2em;text-transform:uppercase">${v.date.label}</div>
      <h1 style="font-size:2.4rem;margin-top:.3rem">${v.person.name} ist gestorben.</h1>
      <p class="dim">${v.death ? v.death.reason : ''} – im Alter von ${v.person.age} Jahren. Ein Leben endet, das Vermächtnis geht weiter.</p>
      <hr>
      <div class="row spread"><h3 class="mb0">Wer führt die Familie weiter? ${infoBtn(['Ein volljähriges Kind wird zum neuen Spielcharakter.', 'Der Pflichtanteil verteilt das Erbe gleichmäßig auf alle Kinder – je mehr Kinder, desto kleiner dein Anteil. Coins sind davon ausgenommen und bleiben dir ganz.', 'Wähle den Erben und ordne ihm Immobilien zu, die in seinen Anteil passen.'], 'Erbe')}</h3></div>
      <div class="choice mt" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${v.heirs.map((h) => html`<label><input type="radio" name="heir" value="${h.id}" ${sel.childId === h.id ? 'checked' : ''}><span class="opt">${h.name}<small>${h.age} Jahre${h.profession ? ' · ' + h.profession : ''}</small></span></label>`)}</div>
      <h4 class="mt2">Nachlass</h4>
      <dl class="kv"><dt>Gesamter Nachlass</dt><dd>${moneyShort(v.estate.total, cur)}</dd><dt>Anzahl Kinder (Pflichtanteil)</dt><dd>${v.estate.n}</dd><dt>Anteil je Kind</dt><dd>${moneyShort(v.estate.share, cur)}</dd></dl>
      ${v.estate.properties.length ? html`<h4 class="mt">Immobilien dem Erben zuordnen</h4><div class="stack" style="--gap:.4rem">${v.estate.properties.map((p) => html`<label class="check card flat" style="padding:.6rem .8rem"><input type="checkbox" data-prop="${p.id}" ${sel.bequest.includes(p.id) ? 'checked' : ''}><span class="grow">${p.name}</span><span class="mono dim">${moneyShort(p.value, cur)}</span></label>`)}</div>` : ''}
      <div class="alert info mt" id="plan">${icon('info')}<div>…</div></div>
      <div class="row end mt2"><button class="btn primary lg" id="confirm">${icon('crown')} Erbe antreten</button></div>
    </section></div>`);
  const plan = root.querySelector('#plan > div');
  async function preview() {
    try { const r = await api('POST', '/api/heir/preview', { childId: sel.childId, bequest: sel.bequest }); mount(plan, html`Dein Erbe: <b>${r.properties.length ? r.properties.join(', ') + ' und ' : ''}${moneyShort(r.cash, cur)} in bar</b> (Pflichtanteil 1/${r.n}).`); } catch (e) { mount(plan, html`${e.message}`); }
  }
  root.querySelectorAll('input[name=heir]').forEach((r) => r.addEventListener('change', () => { sel.childId = Number(r.value); preview(); }));
  root.querySelectorAll('[data-prop]').forEach((c) => c.addEventListener('change', () => { sel.bequest = [...root.querySelectorAll('[data-prop]')].filter((x) => x.checked).map((x) => Number(x.dataset.prop)); preview(); }));
  root.querySelector('#confirm').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const r = await api('POST', '/api/heir', { childId: sel.childId, bequest: sel.bequest }); ctx.ui.heir = null; ctx.setView(r.view); ctx.go('overview'); } catch (er) { toast(er.message, 'bad'); b.disabled = false; }
  };
  preview();
}

/* ---------------- Game Over ---------------- */
export function renderGameOver(root, ctx) {
  const v = ctx.view; const d = v.death || {};
  mount(root, html`<div class="create-wrap"><div class="create-head"><span class="brand"><span class="mark">${icon('hourglass')}</span><span>TURNING POINT<small>Game Over</small></span></span></div>
    <section class="card create-card">
      <span class="chip bad">${icon('skull')} Die Linie endet</span>
      <h1 style="font-size:2.6rem;margin-top:.8rem">${v.person.name}</h1>
      <p class="serif" style="font-size:1.2rem">${d.message || d.reason || 'Das Leben ist zu Ende.'}</p>
      <hr>
      <div class="grid c3"><div><div class="dim small">Zeitraum</div><b class="serif" style="font-size:1.4rem">bis ${v.date.year}</b></div><div><div class="dim small">Alter</div><b class="serif" style="font-size:1.4rem">${v.person.age} Jahre</b></div><div><div class="dim small">Generation</div><b class="serif" style="font-size:1.4rem">${v.generation}</b></div></div>
      <div class="alert good mt">${icon('coins')}<div><b>Dein Meta-Fortschritt bleibt:</b> ${ctx.coins} Coins, abgeschlossene Studien und die Familiengeschichte gehen nicht verloren.</div></div>
      <div class="row end mt2"><button class="btn" id="chron">${icon('scroll')} Chronik ansehen</button><button class="btn primary lg" id="again">${icon('sparkles')} Neues Leben beginnen</button></div>
    </section></div>`);
  root.querySelector('#again').onclick = () => { ctx.ui.create = null; ctx.ui.forceCreate = true; ctx.render(); };
  root.querySelector('#chron').onclick = () => { ctx.ui.gameoverChron = true; ctx.go('legacy'); };
}
