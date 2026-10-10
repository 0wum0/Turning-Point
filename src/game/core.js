'use strict';
const settings = require('../settings');
const { LEVELS, HOUSING } = require('./content');
const { scale } = require('./economy');
const { yearOf } = require('./calendar');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Meldung ins Postfach (Problem → Bedeutung → Lösung für das ⓘ). */
function notice(state, n) {
  const id = state.nextNoticeId++;
  const item = {
    id, day: state.day, level: n.level || 'info', title: n.title, text: n.text || '',
    info: n.info || null, interrupt: !!n.interrupt, seen: false, tab: n.tab || null,
  };
  state.notices.unshift(item);
  if (state.notices.length > 60) state.notices.length = 60;
  if (n.interrupt) state.interrupts.push(id);
  return item;
}

function chronicle(state, text, type = 'life') {
  state.tree.events.push({ day: state.day, type, text });
  if (state.tree.events.length > 500) state.tree.events.splice(0, state.tree.events.length - 500);
}

/** Belohnung (EFS-Pool / Coins) – wird vom Server in den User-Datensatz übernommen. */
/** Mindestabstand (Spieltage) zwischen zwei Belohnungen derselben Art – verhindert EFS-Farming durch wiederholtes Mieten, Bewerben, Versichern usw. */
const AWARD_SPACING = { rent: 365, insurance: 365, job_start: 365, training_start: 365, move: 365, buy_property: 180 };
function award(state, kind, tag = '') {
  const amount = (settings.get('efs.awards') || {})[kind] || 0;
  if (!amount) return 0;
  const gap = AWARD_SPACING[kind];
  if (gap) {
    const log = state.awardLog || (state.awardLog = {});
    const k = tag ? `${kind}:${tag}` : kind;
    if (log[k] != null && state.day - log[k] >= 0 && state.day - log[k] < gap) return 0;
    log[k] = state.day;
  }
  state.fx.efs += amount;
  return amount;
}

const isLearned = (state, key) => key === 'helfer' || state.skills.learned.includes(key);
function learn(state, key) {
  if (!state.skills.learned.includes(key)) state.skills.learned.push(key);
}
function levelIndex(state, key) {
  const d = state.skills.days[key] || 0;
  let lv = 0;
  LEVELS.forEach((l, i) => { if (d >= l.days) lv = i; });
  return lv;
}

function propertyValue(world, state, p, year) {
  const idx = world.idx(year);
  return Math.round(p.base * idx * (0.2 + 0.8 * (p.condition / 100)) * require('./economy').realEstateFactor(year) * require('./cityecon').propertyMult(p.cityId, year));
}
/** Preisfaktor für Lebensmittel am Wohnort: fester Stadtfaktor (abgeschwächt) × Stadtindex Lebensmittel. */
function foodFactor(world, state, year) {
  const c = world.city(state.cityId);
  return (0.6 + 0.4 * (c ? c.price_factor : 1)) * require('./cityecon').foodMult(state.cityId, year);
}
function netWorth(world, state) {
  const year = yearOf(state.day, state.startYear);
  const biz = (state.companies || []).reduce((s, c) => s + require('./business').companyValue(world, state, c, year) + c.cash, 0);
  return state.money + biz + state.properties.reduce((s, p) => s + propertyValue(world, state, p, year), 0) - require('./credit').debt(state);
}

const kidsAtHome = (state) => state.children.filter((c) => c.status === 'home');
const minors = (state) => kidsAtHome(state).filter((c) => (state.day - c.born) / 365 < 18);

function residenceProperty(state) {
  return state.housing.type === 'own' ? state.properties.find((p) => p.id === state.housing.propertyId) : null;
}
/** Effektive Wohnform (beschädigtes Haus zählt schlechter). */
function effectiveHousing(state) {
  const p = residenceProperty(state);
  if (p && p.closedUntil > state.day) return HOUSING.damaged;
  return HOUSING[state.housing.type];
}
function roomsAvailable(state) {
  const h = state.housing;
  if (h.type === 'own') { const p = residenceProperty(state); return p ? p.rooms : 0; }
  if (h.type === 'rent') return h.rooms || 1;
  if (h.type === 'pension' || h.type === 'workplace') return 1;
  return 0;
}
const roomsNeeded = (state) => 1 + kidsAtHome(state).length;

function foodMods(world, state) {
  const tiers = world.econ.food;
  const q = clamp(state.meters.fridgeQ, 1, tiers.length) - 1;
  const lo = Math.floor(q);
  const hi = Math.min(tiers.length - 1, lo + 1);
  const f = q - lo;
  const mix = (k) => tiers[lo][k] + (tiers[hi][k] - tiers[lo][k]) * f;
  return { wellbeing: mix('wellbeing'), health: mix('health') };
}

const SCHOOL_COST = { haupt: 0, real: 15, gym: 30 };

/** Tages-Cashflow in Cent. Die UI zeigt exakt diese Zahlen, die Engine bucht sie. */
function dailyFlows(world, state) {
  const year = yearOf(state.day, state.startYear);
  const idx = world.idx(year);
  const econ = world.econ;
  const inc = { wage: 0, kindergeld: 0, office: 0, rent: 0 };
  const exp = { lodging: 0, insurance: 0, upkeep: 0, children: 0, support: 0, butler: 0, tuition: 0, tax: 0, loan: 0 };
  const occ = state.occupation;
  if (occ) {
    const p = world.prof(occ.pkey);
    if (p) {
      if (occ.kind === 'work' && occ.ownCompanyId) {
        inc.wage = 0; // Eigentümer lebt vom Gewinn des Betriebs
      } else if (occ.kind === 'work' && occ.playerJob) {
        inc.wage = scale(occ.wage || 0, idx); // vereinbarter Lohn beim Spielerbetrieb
      } else if (occ.kind === 'work') {
        const lv = LEVELS[levelIndex(state, occ.pkey)].mult;
        const TL = require('./talents');
        inc.wage = scale(p.base_wage, idx, (occ.factor || 1) * lv * require('./career').payMult(state, occ) * TL.jobWageMult(state.talents, TL.weightsFor(world, occ.pkey))); // Begabung für den Beruf: höchstens ±6 %
      } else if (occ.kind === 'training') {
        inc.wage = scale(p.base_wage, idx, 0.4 * (occ.factor || 1));
      } else if (occ.kind === 'study') {
        exp.tuition = scale(p.tuition_day, idx);
      }
    }
  }
  const ce = require('./cityecon');
  if (occ && !(occ.kind === 'work' && (occ.ownCompanyId || occ.playerJob)) && occ.kind !== 'study') inc.wage = Math.round(inc.wage * ce.wageMult(occ.cityId != null ? occ.cityId : state.cityId, year)); // örtliches Lohnniveau (Stadtwirtschaft)
  const oe = require('./society').officeEffects(world, state, year);
  inc.wage = Math.round(inc.wage * oe.wageMult);
  inc.office = oe.income;
  inc.rent = require('./landlord').incomeToday(world, state, year);
  const h = state.housing;
  if (h.type === 'workplace') exp.lodging = scale(econ.lodging.workplace, idx);
  else if (h.type === 'pension' || h.type === 'rent') exp.lodging = scale(h.base, idx);
  const home = minors(state);
  const childCost = scale(econ.childCostPerDay, idx, ce.householdMult(state.cityId, year));
  exp.children = home.length * childCost;
  for (const c of home) exp.children += scale(SCHOOL_COST[c.school] || 0, idx);
  inc.kindergeld = Math.round(home.length * childCost * (econ.kindergeldPct / 100));
  exp.support = state.children.filter((c) => c.status === 'care').length * scale(econ.jugendhilfePerDay, idx);
  for (const [k, on] of Object.entries(state.insurance)) {
    if (!on || !econ.insurance[k]) continue;
    const ins = econ.insurance[k];
    if (ins.perDay) exp.insurance += scale(ins.perDay, idx);
    else if (ins.yearPctOfValue) {
      const total = state.properties.reduce((s, p) => s + propertyValue(world, state, p, year), 0);
      exp.insurance += Math.round((total * ins.yearPctOfValue) / 100 / 365);
    }
  }
  for (const p of state.properties) {
    const v = propertyValue(world, state, p, year);
    exp.upkeep += Math.round((v * (econ.upkeepYearPct + (state.flags.autoMaintain ? 1 : 0))) / 100 / 365);
  }
  if (state.butler) exp.butler = scale(state.butler.perDay, idx);
  exp.loan = require('./credit').dailyPay(state);
  exp.tax = require('./tax').incomeTaxPerDay(idx, inc.wage + inc.office + inc.rent);
  const income = Object.values(inc).reduce((a, b) => a + b, 0);
  const expense = Object.values(exp).reduce((a, b) => a + b, 0);
  return { inc, exp, income, expense, net: income - expense };
}

function consumption(state) {
  return 7 + (state.partner && state.partner.cohabit ? 3 : 0) + 1.5 * minors(state).length;
}
/** Sättigung: Hochwertiges Essen hält länger vor. q = Qualität 1 (günstig) bis 4 (Gourmet); Faktor auf den täglichen Verbrauch. */
const satiety = (q) => Math.max(0.6, 1.25 - 0.17 * (Math.max(1, Math.min(4, q || 2)) - 1));
/** Kosten (Cent) des täglichen Essens in einer Qualitätsstufe. */
function foodCostPerDay(world, state, tierIdx = 1) {
  const year = yearOf(state.day, state.startYear);
  return Math.round(world.econ.food[tierIdx].perPct * consumption(state) * satiety(tierIdx + 1) * world.idx(year) * foodFactor(world, state, year));
}

module.exports = {
  clamp, notice, chronicle, award, isLearned, learn, levelIndex, propertyValue, foodFactor, netWorth, kidsAtHome, minors,
  residenceProperty, effectiveHousing, roomsAvailable, roomsNeeded, foodMods, dailyFlows, foodCostPerDay, consumption, satiety, SCHOOL_COST,
};
