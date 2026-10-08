'use strict';
/**
 * Karriere: Kündigungsfrist und Stellenwechsel mit Bewerbungschance, Gehaltsstufen (Betriebszugehörigkeit + Leistung),
 * Weiterbildung (Kurse mit Gebühr, Dauer und Jahreslimit) und Arbeitslosengeld nach unfreiwilligem Stellenverlust.
 * Grundlohn und Berufsstufen (LEVELS) bleiben in core.js / engine.js; hier kommen nur Zuschläge und Übergänge dazu.
 */
const settings = require('../settings');
const press = require('./press');
const { rngFor } = require('./rng');
const { yearOf } = require('./calendar');
const { scale } = require('./economy');
const { clamp, notice, chronicle, award, isLearned, learn, levelIndex, dailyFlows } = require('./core');
const { LEVELS } = require('./content');

const cfg = () => settings.get('career');
const yr = (state) => yearOf(state.day, state.startYear);

function ensure(state) {
  if (!state.career) state.career = { applied: {}, hire: null, lastRaise: -9999, courses: {}, course: null, benefit: null };
  return state.career;
}

/** Gehaltsstufen: Betriebszugehörigkeit (alle tenureStepDays) + durch Gehaltsgespräche erreichte Leistungsstufen. */
function steps(state, occ) {
  const c = cfg();
  const ten = Math.min(c.tenureMaxSteps, Math.floor(Math.max(0, state.day - (occ.since || state.day)) / c.tenureStepDays));
  return { tenure: ten, perf: Math.min(c.raiseMaxSteps, occ.perfSteps || 0) };
}
function payMult(state, occ) {
  const s = steps(state, occ);
  return 1 + (cfg().stepPct / 100) * (s.tenure + s.perf);
}

function workerOcc(state) {
  const o = state.occupation;
  return o && o.kind === 'work' && !o.playerJob && !o.ownCompanyId ? o : null;
}

/** Chance einer Bewerbung auf eine bessere Stelle (rein). */
function applyChance(state, pkey) {
  const c = cfg();
  const p = c.applyBasePct + c.applyPerLevelPct * levelIndex(state, pkey) + (state.meters.wellbeing - 50) / 5 + (state.partner ? 1 : 0);
  return clamp(p, 10, 95) / 100;
}
function raiseChance(state, occ) {
  const tenure = Math.max(0, state.day - (occ.since || state.day));
  const p = 0.2 + levelIndex(state, occ.pkey) * 0.05 + Math.min(0.2, tenure / 3650) + (state.meters.wellbeing - 50) / 400 + (state.meters.health - 70) / 600 + (state.meters.rest > 40 ? 0.04 : 0);
  return clamp(p, 0.08, 0.8);
}

function nextRng(state, tag) {
  state.pending.rngN = (state.pending.rngN || 0) + 1;
  return rngFor(tag, state.seed, state.day, state.pending.rngN)();
}

/** Unfreiwilliger Jobverlust: Anspruch auf Arbeitslosengeld (Anteil des letzten Lohns, begrenzte Dauer). */
function onJobLost(world, state, cause) {
  const b = cfg().benefit; const occ = state.occupation;
  if (!b || !b.enabled || !occ || occ.kind !== 'work' || occ.ownCompanyId) return null;
  if (state.day - (occ.since || state.day) < b.minWorkDays) return null;
  const idx = world.idx(yr(state));
  const wage = dailyFlows(world, state).inc.wage;
  const real = Math.round((wage / Math.max(0.0001, idx)) * (b.pct / 100));
  if (real <= 0) return null;
  const c = ensure(state);
  c.benefit = { real, until: state.day + b.days, cause: cause || 'lost' };
  return c.benefit;
}

function benefitView(world, state) {
  const c = ensure(state); const b = c.benefit;
  if (!b || state.day > b.until) return null;
  return { perDay: Math.round(b.real * world.idx(yr(state))), daysLeft: b.until - state.day };
}

function install(A, fail, { pay }) {
  A.giveNotice = ({ world, state }) => {
    const occ = workerOcc(state);
    if (!occ) fail('Eine Kündigung ist nur aus einer festen Stelle möglich.');
    if (occ.notice) fail('Du hast bereits gekündigt.');
    const days = cfg().noticeDays;
    occ.notice = { endDay: state.day + days, reason: 'quit' };
    return { msg: `Kündigung eingereicht. Deine Stelle endet in ${days} Tagen; bis dahin arbeitest du weiter.` };
  };
  A.cancelNotice = ({ state }) => {
    const occ = state.occupation; const c = ensure(state);
    if (!occ || !occ.notice) fail('Es läuft keine Kündigung.');
    occ.notice = null; c.hire = null;
    return { msg: 'Die Kündigung wurde zurückgenommen.' };
  };
  A.askRaise = ({ world, state }) => {
    const occ = workerOcc(state); const c = ensure(state); const k = cfg();
    if (!occ) fail('Ein Gehaltsgespräch führst du in einer festen Stelle.');
    if (steps(state, occ).perf >= k.raiseMaxSteps) fail('Mehr Leistungsstufen gibt es in dieser Stelle nicht.');
    const wait = c.lastRaise + k.raiseCooldownDays - state.day;
    if (wait > 0) fail(`Das nächste Gehaltsgespräch ist in ${wait} Tagen möglich.`);
    c.lastRaise = state.day;
    const p = raiseChance(state, occ);
    if (nextRng(state, 'raise') >= p) return { msg: 'Dein Chef vertröstet dich: Zeig weiter gute Leistung.', level: 'warn' };
    occ.perfSteps = (occ.perfSteps || 0) + 1;
    award(state, 'training_finish');
    chronicle(state, `${state.person.first} bekommt eine Gehaltserhöhung.`, 'work');
    return { msg: `Gehaltserhöhung: +${k.stepPct} % Lohn (Leistungsstufe ${occ.perfSteps}).`, level: 'good' };
  };
  A.course = ({ world, state, input }) => {
    const c = ensure(state); const k = cfg(); const year = yr(state);
    const p = world.prof(input.pkey);
    if (!p || p.academic || p.pkey === 'helfer') fail('Dafür gibt es keinen Kurs.');
    if (!(p.era_from <= year && year <= p.era_to)) fail('Diesen Beruf gibt es zurzeit nicht.');
    if (c.course) fail('Du besuchst bereits einen Kurs.');
    if ((c.courses[year] || 0) >= k.coursesPerYear) fail(`Mehr als ${k.coursesPerYear} Kurse pro Jahr sind nicht möglich.`);
    const kind = input.kind === 'unlock' ? 'unlock' : 'skill';
    if (kind === 'skill' && !isLearned(state, p.pkey)) fail('Eine Fortbildung setzt den Beruf voraus.');
    if (kind === 'unlock' && isLearned(state, p.pkey)) fail('Diesen Beruf beherrschst du bereits.');
    const idx = world.idx(year);
    const fee = scale(p.base_wage, idx, kind === 'unlock' ? k.unlockFeeDays : k.courseFeeDays);
    if (state.money < fee) fail('Für die Kursgebühr reicht dein Geld nicht.');
    pay(state, fee);
    const days = kind === 'unlock' ? k.unlockDays : k.courseDays;
    c.courses[year] = (c.courses[year] || 0) + 1;
    c.course = { pkey: p.pkey, kind, endDay: state.day + days, days };
    return { msg: kind === 'unlock' ? `Umschulung zum ${p.name} gebucht (${days} Tage).` : `Fortbildung als ${p.name} gebucht (${days} Tage).` };
  };
}

/** Täglich nach dem Arbeitstag: Kündigung/Stellenwechsel, Kurs, Arbeitslosengeld. */
function daily(ctx) {
  const { world, state } = ctx; const c = ensure(state);
  let occ = state.occupation;
  if (occ && occ.notice && state.day >= occ.notice.endDay) {
    const h = c.hire;
    if (h) {
      state.occupation = { kind: 'work', pkey: h.pkey, employer: h.employer, cityId: h.cityId, factor: h.factor, lodging: h.lodging, since: state.day };
      if (state.housing.type === 'workplace' && !h.lodging) state.housing = { type: 'street', cityId: state.cityId };
      const p = world.prof(h.pkey);
      c.hire = null; c.benefit = null;
      chronicle(state, `${state.person.first} wechselt zu ${h.employer}.`, 'work');
      press.story(world, state, 'job_new', { employer: h.employer, job: p ? p.name : h.pkey });
      notice(state, { level: 'good', title: `Neue Stelle: ${h.employer}`, text: `Du arbeitest jetzt als ${p ? p.name : 'Fachkraft'} bei ${h.employer}.`, tab: 'work', interrupt: true });
    } else {
      state.occupation = null;
      if (state.housing.type === 'workplace') state.housing = { type: 'street', cityId: state.cityId };
      notice(state, { level: 'warn', title: 'Kündigungsfrist abgelaufen', text: 'Du hast keine Stelle mehr. Arbeitslosengeld gibt es nach eigener Kündigung nicht.', tab: 'newspaper', interrupt: true });
    }
    occ = state.occupation;
  }
  if (c.course) {
    state.meters.rest = clamp(state.meters.rest - 2, 0, 100);
    if (state.day >= c.course.endDay) {
      const cr = c.course; c.course = null;
      const p = world.prof(cr.pkey);
      if (cr.kind === 'unlock') {
        learn(state, cr.pkey);
        const me = state.tree.persons.find((x) => x.id === state.person.id); if (me && p) me.jobs.push(p.name);
        notice(state, { level: 'good', title: `Umschulung abgeschlossen: ${p ? p.name : ''}`, text: 'Du darfst den Beruf nun in Betrieben ausüben.', tab: 'work', interrupt: true });
      } else {
        const before = levelIndex(state, cr.pkey);
        state.skills.days[cr.pkey] = (state.skills.days[cr.pkey] || 0) + cfg().skillBonusDays;
        const now = levelIndex(state, cr.pkey);
        notice(state, { level: 'good', title: `Fortbildung abgeschlossen: ${p ? p.name : ''}`, text: now > before ? `Neue Berufsstufe: ${LEVELS[now].name}.` : 'Die Berufserfahrung wächst.', tab: 'work', interrupt: true });
      }
      award(state, 'training_finish');
      chronicle(state, `Weiterbildung abgeschlossen: ${p ? p.name : ''}.`, 'education');
    }
  }
  if (c.benefit) {
    if (occ || state.day > c.benefit.until) c.benefit = null;
    else { const amt = Math.round(c.benefit.real * ctx.idx); state.money += amt; state.stats.earned += amt; }
  }
}

module.exports = { install, daily, payMult, steps, applyChance, raiseChance, onJobLost, benefitView, ensure, nextRng, workerOcc };
