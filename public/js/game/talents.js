/* Talente (Oberfläche): sechs Balken, Karte „Deine Talente“, Begabung der Kinder mit Empfehlung und Fördern, Team und Bewerber der Betriebe.
 * Daten kommen fertig vom Server (view.talents, children[].tal, companies[].talent). Zahlen stehen in eigenen Elementen (für die englische Oberfläche). */
import { html, icon, money, infoBtn, bar, on, modal, term } from './ui.js';

const BAND_PCT = [22, 48, 70, 92];
const dec = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: d });

/** Sechs Balken. Bei kleinen Kindern (hidden) nur grobe Stufen. */
export function talentBars(bars, { compact = false } = {}) {
  if (!bars) return '';
  return html`<div class="tal-bars ${compact ? 'compact' : ''}">${bars.map((b) => {
    const w = b.v == null ? BAND_PCT[b.band] : b.v;
    return html`<div class="tal-row ${b.v == null ? 'hid' : ''}"><span class="tal-ic" title="${b.label}">${icon(b.icon)}</span><span class="tal-lb">${b.label}</span>
      <div class="tal-bar b${b.band}" role="img" aria-label="${b.label}"><i style="width:${w}%"></i>${b.v != null && b.cap > b.v ? html`<u style="left:${b.cap}%"></u>` : ''}</div>
      ${b.v == null ? html`<span class="tal-v dim small">${b.bandName}</span>` : html`<b class="tal-v">${b.v}</b>`}</div>`;
  })}</div>`;
}

const fitTone = (f) => (f >= 62 ? 'good' : f >= 48 ? '' : 'warn');
export const fitChip = (f, label = 'Passung') => html`<span class="chip ${fitTone(f)}" title="${label}">${icon('sparkles')} <span>${label}</span> <b>${f} %</b></span>`;

const TIPS = {
  handwerk: 'Wächst durch Arbeit in Handwerk, Bau und Produktion – und durch die Werkstatt-AG bei Kindern.',
  handel: 'Wächst durch Arbeit in Handel und Verkauf, Kaufmannslehre und den Kaufmannsladen bei Kindern.',
  fuehrung: 'Wächst, wenn du Teams leitest, Ämter ausübst oder Kinder in der Jugendgruppe förderst.',
  bildung: 'Wächst durch Kurse, Studium, Bibliothek in deiner Stadt und Nachhilfe bei Kindern.',
  charme: 'Wächst durch Arbeit mit Menschen, Beziehungen und Musik oder Theater bei Kindern.',
  kondition: 'Wächst durch Sportstätten in deiner Stadt, körperliche Arbeit und Sportverein bei Kindern.',
};

function openGuide(ctx) {
  const t = ctx.view.talents; if (!t || !t.me) return;
  const fx = t.me.fx;
  const sgn = (x, u = '') => html`<b>${x > 0 ? '+' : x < 0 ? '−' : '±'}${dec(Math.abs(x))}${u}</b>`;
  modal(html`<h3>${icon('sparkles')} <span>So entwickelst du dich</span></h3>
    <p class="small dim">Jede Person hat sechs Talente von 1 bis 100. 50 ist durchschnittlich. Talente wachsen langsam durch Übung – aber nur bis zu einer Grenze, die in der Anlage liegt (der kleine Strich im Balken).</p>
    <div class="stack" style="--gap:.6rem">${t.me.bars.map((b) => html`<div class="tal-guide"><div class="row nowrap">${icon(b.icon)} <b>${b.label}</b> <span class="dim small">${b.v} / ${b.cap}</span></div><div class="small dim">${TIPS[b.key]}</div></div>`)}</div>
    <h4 class="mt">Was deine Talente bewirken</h4>
    <ul class="small tal-fx">
      <li><span>Kondition: Gesundheit</span> ${sgn(fx.health)} <span>Punkte, Lebenserwartung</span> ${sgn(fx.lifeYears)} <span>Jahre</span></li>
      <li><span>Charme und Bildung: Partner zufriedener um</span> ${sgn(fx.partner)} <span>Punkte, Kinder um</span> ${sgn(fx.child)}</li>
      <li><span>Charme und Führung: Gehaltsgespräch</span> ${sgn(fx.raise, ' %')}<span>, Bewerbung</span> ${sgn(fx.apply, ' %')}<span>, Wahlchance</span> ${sgn(fx.chance, ' %')}</li>
      <li><span>Bildung: Kurse, Lehre und Studium dauern</span> ${sgn(fx.study, ' %')}</li>
      <li><span>Charme: Zuwachs an Ansehen</span> ${sgn(fx.rep, ' %')}<span>; Bildung und Charme vor Gericht</span> ${sgn(fx.court)} <span>Punkte</span></li>
    </ul>
    <p class="small dim">Im eigenen Betrieb zählen vor allem die Talente deiner Mitarbeiter – stelle Leute ein, die zur Betriebsart passen.</p>
    <div class="row end mt"><button class="btn primary" data-close="x">Verstanden</button></div>`, { wide: true });
}

/** Karte „Deine Talente“ für die Übersicht. */
export function talentCard(ctx) {
  const t = ctx.view.talents; if (!t || !t.me) return '';
  const me = t.me; const j = me.job;
  const best = me.bars.find((b) => b.key === me.best);
  return html`<section class="card mt" id="talCard" data-spot="talents">
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('sparkles')} ${term('Talent', 'Deine Talente')} ${infoBtn(['Talente sind deine Begabungen: Handwerk, Handel, Führung, Bildung, Charme und Kondition.', 'Sie bestimmen, wie gut dir Arbeit, Familie und Politik von der Hand gehen. Du erbst sie von deinen Eltern und gibst sie weiter.', 'Übe, besuche Kurse und fördere deine Kinder – so wachsen Talente bis zu ihrer Grenze.'], 'Talente')}</div>
      <button class="btn sm" data-tal-guide="1">So entwickelst du dich</button></div>
    <div class="mt">${talentBars(me.bars)}</div>
    <div class="row wrap mt small">${best ? html`<span class="chip accent">${icon(best.icon)} <span>Stärke:</span> ${best.label}</span>` : ''}${j ? fitChip(j.fit, 'Passung zu deinem Beruf') : ''}</div>
  </section>`;
}
export function bindTalents(root, ctx) {
  on(root, 'click', '[data-tal-guide]', () => openGuide(ctx));
}

/* ---------- Kinder ---------- */
export function childTalent(c, v) {
  const t = c.tal; if (!t) return '';
  const cur = v.currency;
  const f = t.foster;
  return html`<div class="tal-box mt">
    <div class="row spread nowrap"><b class="small">${icon('sparkles')} ${term('Begabung', 'Begabung')}</b>${t.hidden ? html`<span class="chip small">Anlagen</span>` : ''}</div>
    ${talentBars(t.bars, { compact: true })}
    <div class="small mt">${icon('lightbulb')} <span>Empfehlung:</span> <span>${t.rec}</span></div>
    ${f ? html`<div class="small mt dim"><span>Förderung läuft:</span> <b>${f.label}</b> <span>– noch</span> ${f.daysLeft} <span>Tage</span></div>${bar((1 - f.daysLeft / Math.max(1, f.total)) * 100)}`
      : t.options.length ? html`<div class="row mt"><button class="btn sm" data-foster="${c.id}">${icon('graduation-cap')} <span>Fördern</span> · ${money(t.cost, cur)}</button></div>` : ''}
  </div>`;
}
/** Schulwahl: Schaltflächen mit Hinweis „passt zu Begabung“. */
export function schoolFitMark(c, type) {
  const s = c.tal && c.tal.school && c.tal.school[type]; if (!s) return '';
  return s.good ? html`<small class="tal-pass">${icon('sparkles')} <span>passt zu Begabung</span></small>` : html`<small class="dim">${s.fit} %</small>`;
}
export function openFoster(ctx, childId) {
  const c = ctx.view.children.find((x) => x.id === Number(childId)); if (!c || !c.tal) return;
  const t = c.tal; const cur = ctx.view.currency;
  const m = modal(html`<h3>${icon('graduation-cap')} <span>Fördern:</span> <span data-i18n-skip>${c.name}</span></h3>
    <p class="small dim"><span>Ein Förderprogramm dauert</span> ${t.days} <span>Tage, kostet</span> ${money(t.cost, cur)} <span>und steigert ein Talent um einige Punkte – bis zur Grenze der Anlage.</span></p>
    <div class="grid c2" style="--gap:.6rem">${t.options.map((o) => html`<button class="btn tal-opt" data-focus="${o.focus}" ${o.ok ? '' : 'disabled'} title="${o.why || ''}">${icon(o.icon)} <span><b>${o.label}</b><small class="dim"><span>trainiert</span> ${o.keyLabel} · +${o.pts}</small></span></button>`)}</div>
    <div class="row end mt"><button class="btn ghost" data-close="x">Abbrechen</button></div>`, { wide: true });
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-focus]'); if (!b || b.disabled) return;
    m.close();
    try { await ctx.act('foster', { childId: c.id, focus: b.dataset.focus }); } catch (_) { /* Meldung ist schon da */ }
  });
}
export function bindChildTalents(root, ctx) {
  on(root, 'click', '[data-foster]', (e, t) => openFoster(ctx, t.dataset.foster));
}

/* ---------- Betrieb: Team-Qualität, Bewerber ---------- */
export function firmTeam(c, v) {
  const t = c.talent; if (!t) return '';
  const tone = t.q >= 54 ? 'good' : t.q >= 46 ? '' : 'warn';
  return html`<div class="tal-firm mt">
    <div class="row spread nowrap small"><span>${icon('users')} ${term('Team-Qualität', 'Team-Qualität')}</span><span class="chip ${tone}"><b>${t.band}</b></span></div>
    ${bar(t.q, t.q < 46 ? 'bad' : 'good')}
    <div class="small dim mt"><span>Gefragt in diesem Betrieb:</span> ${t.keys.map((k) => html`<span class="chip small">${icon(k.icon)} ${k.label}</span> `)}</div>
    <div class="small dim"><span>Wirkung auf den Umsatz:</span> <b class="${t.rev >= 0 ? 'pos' : 'neg'}">${t.rev > 0 ? '+' : t.rev < 0 ? '−' : '±'}${dec(Math.abs(t.rev))} %</b></div>
    <div class="row mt">
      <button class="btn sm primary" data-applicants="${c.id}" ${t.canHire ? '' : 'disabled'}>${icon('users')} <span>Bewerber ansehen</span></button>
      <button class="btn sm" data-team="${c.id}" ${t.team.length ? '' : 'disabled'}>${icon('briefcase')} <span>Team</span> (${t.team.length})${t.team.some((m) => m.ask) ? html` <span class="badge">!</span>` : ''}</button>
    </div></div>`;
}

const memberCard = (m, extra) => html`<article class="card flat tal-person ${m.best ? 'best' : ''}">
  <div class="row nowrap spread"><div class="row nowrap"><div class="avatar ${m.g}">${m.name.slice(0, 1)}</div><div><b data-i18n-skip>${m.name}</b><div class="dim small">${m.age} <span>Jahre</span></div></div></div>
    <div class="col end">${fitChip(m.fit, 'Passung')}</div></div>
  ${talentBars(m.bars, { compact: true })}
  ${extra}
</article>`;

export function openApplicants(ctx, id) {
  const get = () => ctx.view.companies.find((x) => x.id === Number(id));
  if (!get()) return;
  const m = modal(html`<div id="talApp"></div>`, { wide: true });
  const box = m.el.querySelector('#talApp');
  const paint = () => {
    const c = get(); if (!c) { m.close(); return; }
    const t = c.talent; const cur = ctx.view.currency;
    const lehr = t.pool.apprentices;
    box.innerHTML = html`<h3>${icon('users')} <span>Bewerber für</span> <span data-i18n-skip>${c.name}</span></h3>
      <p class="small dim"><span>Jede Woche melden sich neue Bewerber. Je besser die Talente zu deiner Betriebsart passen, desto mehr Umsatz bringt das Team – aber gute Leute kosten mehr Lohn.</span></p>
      <div class="row spread wrap"><div class="small">${c.staff} / ${c.needed} <span>Mitarbeiter</span> · <span>Wochenpool Nr.</span> ${t.pool.week}</div>
        <button class="btn primary" data-best="1" ${t.canHire && t.pool.staff.some((x) => !x.taken) ? '' : 'disabled'}>${icon('sparkles')} <span>Beste Wahl einstellen</span></button></div>
      ${t.canHire ? '' : html`<div class="alert warn mt small">${icon('info')}<div><span>Mehr Mitarbeiter braucht der Betrieb nicht.</span></div></div>`}
      <h4 class="mt">Fachkräfte</h4>
      <div class="grid auto" style="--gap:.7rem;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${t.pool.staff.map((x) => memberCard(x, html`<div class="row spread nowrap mt small"><span>${money(x.wage, cur)} <span>/ Tag</span></span>
        ${x.taken ? html`<span class="chip">vergeben</span>` : html`<button class="btn sm ${x.best ? 'primary' : ''}" data-hire="${x.id}" ${t.canHire ? '' : 'disabled'}>${x.best ? html`${icon('sparkles')} ` : ''}<span>Einstellen</span></button>`}</div>`))}</div>
      ${lehr.length ? html`<h4 class="mt">${term('Lehrling', 'Lehrlinge')} <span class="dim small">(${t.lehr.now} / ${t.lehr.max})</span></h4>
        <p class="small dim"><span>Lehrlinge kosten nur</span> ${t.lehr.wagePct} <span>% des Lohns${t.lehr.subsidy ? ' (der Staat übernimmt zusätzlich ' + t.lehr.subsidy + ' %)' : ''}, lernen</span> ${dec(t.lehr.years, 0)} <span>Jahre im Betrieb und werden dann Fachkräfte. Ein Meister bildet schneller aus.</span></p>
        <div class="grid auto" style="--gap:.7rem;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${lehr.map((x) => memberCard(x, html`<div class="row spread nowrap mt small"><span>${money(x.wage, cur)} <span>/ Tag</span></span>
          ${x.taken ? html`<span class="chip">vergeben</span>` : html`<button class="btn sm" data-hire="${x.id}" ${t.canHire && t.lehr.now < t.lehr.max ? '' : 'disabled'}><span>Als Lehrling nehmen</span></button>`}</div>`))}</div>` : ''}
      <div class="row end mt"><button class="btn ghost" data-close="x">Schließen</button></div>`.__raw;
  };
  paint();
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-hire], [data-best]'); if (!b || b.disabled) return;
    try {
      if (b.dataset.best) await ctx.act('bizHire', { id: Number(id), delta: 1 });
      else await ctx.act('bizHireApplicant', { id: Number(id), cand: b.dataset.hire });
      paint();
    } catch (_) { /* Meldung ist schon da */ }
  });
}

export function openTeam(ctx, id) {
  const get = () => ctx.view.companies.find((x) => x.id === Number(id));
  if (!get()) return;
  const m = modal(html`<div id="talTeam"></div>`, { wide: true });
  const box = m.el.querySelector('#talTeam');
  const paint = () => {
    const c = get(); if (!c) { m.close(); return; }
    const t = c.talent; const cur = ctx.view.currency;
    box.innerHTML = html`<h3>${icon('briefcase')} <span>Team von</span> <span data-i18n-skip>${c.name}</span></h3>
      <p class="small dim"><span>Kurse kosten</span> ${money(t.course.fee, cur)} <span>und dauern</span> ${t.course.days} <span>Tage. Das Talent steigt um</span> ${t.course.pts} <span>Punkte – bis zur Grenze der Anlage.${t.course.disc ? ' Das Bildungsprogramm des Landes spart ' + t.course.disc + ' %.' : ''}</span></p>
      <div class="grid auto" style="--gap:.7rem;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${t.team.map((x) => memberCard(x, html`
        <div class="small mt">${money(x.wage, cur)} <span>/ Tag</span> · ${x.years} <span>Jahre dabei</span>${x.lehr ? html` · <span class="chip small">${icon('graduation-cap')} <span>Lehrling, noch</span> ${Math.ceil(x.lehr.daysLeft / 365 * 10) / 10} <span>Jahre</span></span>` : ''}</div>
        ${x.ask ? html`<div class="alert warn small mt">${icon('triangle-alert')}<div><b>${x.name.split(' ')[0]}</b> <span>verlangt</span> ${x.ask.pct} <span>% mehr Lohn (noch</span> ${x.ask.daysLeft} <span>Tage).</span><div class="row mt"><button class="btn sm primary" data-raise="${x.id}"><span>Lohn erhöhen</span></button></div></div></div>` : ''}
        ${x.course ? html`<div class="small dim mt">${icon('graduation-cap')} <span>Im Kurs, noch</span> ${x.course.daysLeft} <span>Tage</span></div>`
          : x.lehr ? '' : html`<div class="row mt"><select data-trainkey="${x.id}" aria-label="Talent wählen">${x.bars.map((b) => html`<option value="${b.key}" ${b.v >= b.cap ? 'disabled' : ''}>${b.label} (${b.v})</option>`)}</select><button class="btn sm" data-train="${x.id}"><span>Kurs</span></button></div>`}
        <div class="row end mt"><button class="btn sm ghost danger" data-fire="${x.id}"><span>Entlassen</span></button></div>`))}</div>
      <div class="row end mt"><button class="btn ghost" data-close="x">Schließen</button></div>`.__raw;
  };
  paint();
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-train], [data-raise], [data-fire]'); if (!b || b.disabled) return;
    try {
      if (b.dataset.train) { const sel = m.el.querySelector(`[data-trainkey="${b.dataset.train}"]`); await ctx.act('bizTrain', { id: Number(id), mid: Number(b.dataset.train), key: sel.value }); }
      else if (b.dataset.raise) await ctx.act('bizRaise', { id: Number(id), mid: Number(b.dataset.raise) });
      else if (b.dataset.fire) { if (!(await ctx.confirm({ title: 'Mitarbeiter entlassen?', text: 'Die Stelle wird frei; gute Leute findest du nicht immer sofort wieder.', ok: 'Entlassen', danger: true }))) return; await ctx.act('bizFire', { id: Number(id), mid: Number(b.dataset.fire) }); }
      paint();
    } catch (_) { /* Meldung ist schon da */ }
  });
}
export function bindFirmTalents(root, ctx) {
  on(root, 'click', '[data-applicants]', (e, t) => openApplicants(ctx, t.dataset.applicants));
  on(root, 'click', '[data-team]', (e, t) => openTeam(ctx, t.dataset.team));
}
