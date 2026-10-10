'use strict';
/** Anzeigedaten für Talente (Spielfigur, Partner, Kinder, Betriebe). Rein; Beträge in Cent heutiger Preise. */
const TL = require('./talents');
const { SCHOOLS } = require('./content');

const labels = () => TL.C().labels || {};
const barsOf = (p, hidden) => TL.bars(p, hidden).map((b) => ({ ...b, label: labels()[b.key] || b.label }));

function effectsOf(p) {
  return {
    health: TL.healthPts(p), lifeYears: Math.round((TL.lifeDays(p) / 365) * 10) / 10, rest: TL.restPts(p), partner: TL.partnerPts(p), child: TL.childPts(p),
    raise: Math.round(TL.raiseBonus(p) * 1000) / 10, apply: TL.applyPts(p), study: Math.round((TL.studyMult(p) - 1) * 100), rep: Math.round((TL.repGain(p) - 1) * 100),
    vote: Math.round((TL.voteWeight(p) - 1) * 1000) / 10, chance: Math.round(TL.chanceBonus(p) * 1000) / 10, court: TL.courtPts(p),
  };
}

function meView(world, state) {
  const p = state.talents; if (!p) return null;
  const occ = state.occupation && state.occupation.kind === 'work' ? state.occupation : null;
  const w = occ ? TL.weightsFor(world, occ.pkey) : null;
  return {
    bars: barsOf(p, false), best: TL.best(p), fx: effectsOf(p),
    job: occ ? { fit: TL.fit(p, w), keys: TL.topKeys(w).slice(0, 2), wagePct: Math.round((TL.jobWageMult(p, w) - 1) * 100) } : null,
  };
}

function childView(world, state, c, idx, age) {
  if (!c.tal) return null;
  const f = TL.C().foster || {};
  const hidden = age < Number(TL.C().revealAge || 6);
  const fosterOk = c.status === 'home' && age >= Number(f.minAge || 3) && age <= Number(f.maxAge || 17);
  const edu = TL.eduOf(world, c.cityId != null ? c.cityId : state.cityId);
  const mult = TL.growMult(edu);
  const options = fosterOk && !c.foster ? Object.entries(TL.FOSTER).map(([focus, F]) => {
    const r = TL.fosterStart(world, state, c, focus, idx);
    return { focus, label: F.label, icon: F.icon, key: F.key, keyLabel: labels()[F.key] || TL.META[F.key].label, ok: !!r.ok, why: r.err || null, pts: Math.round(Number(f.pts || 4) * mult) };
  }) : [];
  const sf = TL.schoolFit(c.tal);
  const bestSchool = Object.entries(sf).sort((a, b) => b[1] - a[1])[0][0];
  return {
    hidden, bars: barsOf(c.tal, hidden), best: hidden ? null : TL.best(c.tal), rec: TL.recommendation(c.tal, age),
    school: hidden ? null : Object.fromEntries(Object.entries(sf).map(([k, v]) => [k, { fit: v, name: SCHOOLS[k].name, good: v >= 60 && k === bestSchool }])),
    foster: c.foster ? { focus: c.foster.focus, key: c.foster.key, label: (TL.FOSTER[c.foster.focus] || {}).label || '', daysLeft: Math.max(0, c.foster.end - state.day), total: Number(f.days || 90) } : null,
    options, cost: TL.fosterCost(world, idx), days: Number(f.days || 90),
    path: c.pkey ? { fit: TL.fitFor(world, c.tal, c.pkey) } : null,
    fits: c.pendingPath && !hidden ? Object.fromEntries(world.activeProfessions(require('./calendar').yearOf(state.day, state.startYear)).map((p) => [p.pkey, TL.fitFor(world, c.tal, p.pkey)])) : null,
  };
}

function memberView(world, state, c, m, idx, year) {
  const w = TL.weightsFor(world, c.pkey); const sw = world.econ.companies.staffWage;
  const lc = TL.lehrCfg();
  const unit = Math.round(sw * idx * (m.lehr ? lc.wagePct : m.w));
  return {
    id: m.id, name: m.name, g: m.g, age: Math.floor(((m.age0 || 30) * 365 + (state.day - (m.since || 0))) / 365),
    bars: barsOf(m, false), fit: TL.fit(m, w), wage: unit, wageMult: m.lehr ? lc.wagePct : m.w, years: Math.max(0, Math.floor((state.day - (m.since || state.day)) / 365)),
    lehr: m.lehr ? { daysLeft: Math.max(0, m.lehr.end - state.day), total: lc.days } : null,
    course: m.course ? { key: m.course.key, daysLeft: Math.max(0, m.course.end - state.day) } : null,
    ask: m.ask ? { pct: Math.round((m.ask.w / Math.max(0.01, m.w) - 1) * 100), daysLeft: Math.max(0, m.ask.until - state.day), wage: Math.round(sw * idx * m.ask.w) } : null,
  };
}

function firmView(world, state, c, idx, year, needed) {
  TL.syncTeam(world, state, c);
  const ef = require('./goods').effectsFor(world, c.cityId);
  const fx = TL.firmEffects(world, state, c, ef.edu);
  const w = TL.weightsFor(world, c.pkey);
  const lc = TL.lehrCfg();
  const pool = TL.applicants(world, state, c);
  const sw = world.econ.companies.staffWage;
  const full = (c.staff || 0) >= needed + 2;
  const lehrNow = (c.team || []).filter((m) => m.lehr).length;
  const card = (x) => ({
    id: x.id, name: x.name, g: x.g, age: x.age, bars: barsOf(x, false), fit: x.fit, wage: Math.round(sw * idx * (x.lehr ? lc.wagePct : x.w)), taken: !!x.taken, best: !!x.best, lehr: !!x.lehr,
  });
  const edu = ef.edu; const t = TL.C().train || {};
  return {
    q: fx.q, skill: Math.round(fx.skill), lead: Math.round(fx.lead), rev: Math.round((fx.rev - 1) * 1000) / 10, rel: Math.round((fx.rel - 1) * 1000) / 10,
    band: fx.q >= 62 ? 'stark' : fx.q >= 54 ? 'gut' : fx.q >= 46 ? 'durchschnitt' : 'schwach',
    keys: TL.topKeys(w).slice(0, 2).map((k) => ({ key: k, label: labels()[k] || TL.META[k].label, icon: TL.META[k].icon })),
    team: (c.team || []).map((m) => memberView(world, state, c, m, idx, year)),
    pool: { week: pool.week, staff: pool.staff.map(card), apprentices: pool.apprentices.map(card) },
    canHire: !full, lehr: { now: lehrNow, max: lc.max, years: lc.days / 365, wagePct: Math.round(lc.wagePct * 100), subsidy: Math.round(edu.lehrSubsidy || 0) },
    course: { days: Math.round(Number(t.courseDays || 45) * TL.studyMult(state.talents)), disc: Math.round(edu.courseDisc || 0), fee: Math.round(sw * idx * Number(t.courseFeeDays || 25) * (1 - (edu.courseDisc || 0) / 100)), pts: Number(t.coursePts || 4) + ((edu.courseDisc || 0) >= 20 ? 1 : 0) },
  };
}

module.exports = { meView, childView, firmView, barsOf, effectsOf };
