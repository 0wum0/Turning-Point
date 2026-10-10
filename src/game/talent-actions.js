'use strict';
/**
 * Aktionen rund um Talente: Bewerberpool (einstellen, Lehrling, entlassen), Kurse für Mitarbeiter, Lohnforderungen, Kinder fördern.
 * Rechenregeln stehen in talents.js; hier nur Prüfungen, Kosten und Meldungen.
 */
const TL = require('./talents');
const biz = require('./business');
const { scale, formatMoney } = require('./economy');
const { chronicle } = require('./core');

function install(A, fail, { yr, pay }) {
  const company = (state, id) => { const c = (state.companies || []).find((x) => x.id === Number(id)); if (!c) fail('Unternehmen nicht gefunden.'); return c; };
  const active = (c) => { if (c.abandoned) fail('Der Betrieb steht leer. Reaktiviere ihn zuerst.'); };
  const member = (c, id) => { const m = (c.team || []).find((x) => x.id === Number(id)); if (!m) fail('Diesen Mitarbeiter gibt es nicht (mehr).'); return m; };
  const cur = (world, state) => world.currency(yr(state));
  const lab = (k) => (TL.C().labels || {})[k] || TL.META[k].label;

  /** Platz im Betrieb: Mitarbeiterzahl höchstens Bedarf + 2 (wie bisher). */
  const room = (world, c) => { if ((c.staff || 0) >= biz.staffNeeded(world, c) + 2) fail('Mehr Mitarbeiter braucht der Betrieb nicht.'); };

  /** Beste Wahl (Passung, bei Gleichstand der günstigere Lohn) aus dem Pool einstellen. Einfacher Knopf für Einsteiger. */
  const hireBest = (world, state, c) => {
    room(world, c);
    const pool = TL.applicants(world, state, c);
    const cand = pool.staff.find((x) => x.id === pool.bestId);
    if (!cand) fail('Diese Woche bewirbt sich niemand mehr. Nächste Woche kommen neue Bewerber.');
    return hire(world, state, c, cand);
  };
  const hire = (world, state, c, cand) => {
    TL.syncTeam(world, state, c);
    c.staff = (c.staff || 0) + 1;
    const m = TL.hire(world, state, c, cand);
    const wl = TL.fit(m, TL.weightsFor(world, c.pkey));
    chronicle(state, `${c.name} stellt ${m.name} ein.`, 'business');
    const lehrPct = Math.round(TL.lehrCfg().wagePct * 100); const lehrYears = TL.lehrCfg().days / 365; const nm = m.name; const cn = c.name;
    return { m, fit: wl, msg: cand.lehr ? `${nm} beginnt eine Lehre in ${cn} (Lohn ${lehrPct} %, ${lehrYears} Jahre).` : `${nm} ist eingestellt (Passung ${wl} %).` };
  };

  // Alter Knopf „± Mitarbeiter“: + stellt die beste Bewerbung ein, − entlässt den schwächsten Mitarbeiter.
  A.bizHire = ({ world, state, input }) => {
    const c = company(state, input.id); active(c);
    const n = Math.floor(Number(input.delta)) || 0;
    TL.syncTeam(world, state, c);
    if (n > 0) { const r = hireBest(world, state, c); return { msg: `Beste Wahl: ${r.msg}` }; }
    if (!c.staff) return { msg: 'Es gibt niemanden zu entlassen.', level: 'warn' };
    const w = TL.weightsFor(world, c.pkey);
    const worst = c.team.slice().sort((a, b) => (TL.fit(a, w) - TL.fit(b, w)))[0];
    if (worst) { c.team = c.team.filter((x) => x !== worst); }
    c.staff = Math.max(0, c.staff - 1);
    return { msg: worst ? `${worst.name} wurde entlassen.` : 'Mitarbeiter entlassen.' };
  };

  A.bizHireApplicant = ({ world, state, input }) => {
    const c = company(state, input.id); active(c);
    TL.syncTeam(world, state, c);
    const pool = TL.applicants(world, state, c);
    const id = String(input.cand || '');
    const cand = pool.staff.concat(pool.apprentices).find((x) => x.id === id);
    if (!cand) fail('Diese Bewerbung ist nicht mehr aktuell.');
    if (cand.taken) fail('Diese Person ist schon vergeben.');
    room(world, c);
    const lehrMax = TL.lehrCfg().max;
    if (cand.lehr && (c.team || []).filter((m) => m.lehr).length >= TL.lehrCfg().max) fail(`Mehr als ${lehrMax} Lehrlinge gleichzeitig bildet dieser Betrieb nicht aus.`);
    const r = hire(world, state, c, cand);
    return { msg: r.msg, level: 'good' };
  };

  A.bizFire = ({ world, state, input }) => {
    const c = company(state, input.id); active(c);
    TL.syncTeam(world, state, c);
    const m = member(c, input.mid);
    c.team = c.team.filter((x) => x !== m); c.staff = Math.max(0, (c.staff || 0) - 1);
    return { msg: `${m.name} wurde entlassen.`, level: 'warn' };
  };

  A.bizTrain = ({ world, state, input }) => {
    const c = company(state, input.id); active(c);
    TL.syncTeam(world, state, c);
    const m = member(c, input.mid);
    const key = String(input.key || '');
    if (!TL.KEYS.includes(key)) fail('Bitte ein Talent wählen.');
    if (m.lehr) fail('Lehrlinge lernen im Betrieb; Kurse gibt es für ausgelernte Fachkräfte.');
    if (m.course) fail(`${m.name} ist schon in einem Kurs.`);
    const i = TL.IDX[key];
    if (m.v[i] >= TL.capAt(m, i)) fail(`${m.name} hat in ${lab(key)} das Ende der Fahnenstange erreicht.`);
    const idx = world.idx(yr(state));
    const o = TL.courseOffer(world, state, c, m, key, idx, TL.eduOf(world, c.cityId));
    if (state.money < o.fee) fail('Für die Kursgebühr reicht dein Geld nicht.');
    pay(state, o.fee);
    m.course = { key, end: state.day + o.days, pts: o.pts };
    const lbl = lab(key); const fee = formatMoney(o.fee, cur(world, state));
    return { msg: `${m.name} besucht einen Kurs in ${lbl} (${o.days} Tage, ${fee}).`, level: 'good' };
  };

  A.bizRaise = ({ world, state, input }) => {
    const c = company(state, input.id); active(c);
    const m = member(c, input.mid);
    if (!m.ask) fail('Es liegt keine Lohnforderung vor.');
    m.w = m.ask.w; m.ask = null;
    return { msg: `${m.name} bekommt mehr Lohn und bleibt.`, level: 'good' };
  };

  A.foster = ({ world, state, input }) => {
    const c = (state.children || []).find((x) => x.id === Number(input.childId));
    if (!c) fail('Kind nicht gefunden.');
    const idx = world.idx(yr(state));
    const r = TL.fosterStart(world, state, c, String(input.focus || ''), idx);
    if (r.err) fail(r.err);
    if (state.money < r.cost) fail('Für das Förderprogramm reicht das Geld nicht.');
    pay(state, r.cost);
    c.foster = { key: r.key, end: state.day + r.days, pts: r.pts, focus: String(input.focus) };
    const prog = TL.FOSTER[input.focus].label; const fee = formatMoney(r.cost, cur(world, state));
    return { msg: `${c.name} wird gefördert: ${prog} (${r.days} Tage, ${fee}).`, level: 'good' };
  };
}

module.exports = { install };
