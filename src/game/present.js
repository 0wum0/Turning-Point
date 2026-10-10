'use strict';
const settings = require('../settings');
const { dateOf, formatDate, yearOf, ageYears } = require('./calendar');
const { scale } = require('./economy');
const {
  dailyFlows, propertyValue, netWorth, roomsAvailable, roomsNeeded, effectiveHousing, levelIndex, foodCostPerDay, satiety,
  consumption, kidsAtHome, isLearned,
} = require('./core');
const { HOUSING, LEVELS, SCHOOLS } = require('./content');
const { estateShare, eligibleHeirs, ageOfChild } = require('./family');
const { lifespanDays } = require('./engine');
const { mediumFor } = require('./newspaper');
const biz = require('./business');
const society = require('./society');
const onboarding = require('./onboarding');
const cityecon = require('./cityecon');
const TV = require('./talent-view');
const TLN = require('./talents');

const round = (n) => Math.round(n);

/** Gericht: Einschränkungen und Zähler aus dem Spielstand (state.court, gefüllt von src/lib/court.js beim Laden). */
function courtBrief(state, now = Date.now()) {
  const c = state.court; if (!c) return null;
  const { SANCTIONS } = require('./court');
  return { r: (c.r || []).filter((x) => x.until > now).map((x) => ({ k: x.k, label: SANCTIONS[x.k], until: x.until })), debt: c.debt || 0, ev: c.ev || 0, p: c.p || 0, d: c.d || 0, act: c.act || 0 };
}

function eraName(year) {
  if (year < 1950) return 'Nachkriegszeit';
  if (year < 1965) return 'Wirtschaftswunder';
  if (year < 1990) return 'Wohlstandsjahre';
  if (year < 2002) return 'Wendezeit';
  if (year < 2025) return 'Digitales Zeitalter';
  if (year < 2060) return 'Neue Zwanziger';
  return 'Zukunft';
}
const eraKey = (year) => (year < 1965 ? 1 : year < 1990 ? 2 : year < 2002 ? 3 : year < 2025 ? 4 : 5);

function hintsFor(state, flows) {
  const h = [];
  const m = state.meters;
  if (m.fridge < 25 || state.hunger > 0) h.push({ target: 'household', level: state.hunger > 0 ? 'bad' : 'warn', text: 'Kühlschrank auffüllen' });
  if (state.housing.type === 'street') h.push({ target: 'newspaper', level: 'bad', text: 'Unterkunft suchen' });
  else if (!state.occupation && state.status === 'alive') h.push({ target: 'newspaper', level: 'warn', text: 'Arbeit suchen' });
  if (m.health < 40) h.push({ target: 'household', level: 'bad', text: 'Gesundheit schützen' });
  if (state.partner && state.partner.sat < 45) h.push({ target: 'family', level: 'warn', text: 'Partner glücklich machen' });
  if (state.children.some((c) => c.status === 'home' && c.sat < 40)) h.push({ target: 'family', level: 'warn', text: 'Kind unzufrieden' });
  if (state.children.some((c) => c.pendingSchool || c.pendingPath || c.status === 'runaway')) h.push({ target: 'family', level: 'warn', text: 'Entscheidung bei den Kindern' });
  if (flows.net < 0 && state.money < -flows.net * 10) h.push({ target: 'work', level: 'warn', text: 'Einnahmen verbessern' });
  return h;
}

/** Mindestansehen für ein Amt (Anzeige): nötige Stufe, Name und ob sie erreicht ist. */
function officeRep(state, i) {
  const R = require('./reputation'); const need = R.officeMin(i); const st = R.stand(state);
  const lv = i >= (settings.get('elections').firstNationalOffice || 3) ? st.lv : st.ll;
  return { need, name: need >= 0 ? R.levelName(need) : null, ok: !R.block(lv, need), hint: R.block(lv, need) };
}
const r2 = (x) => Math.round(x * 100) / 100;
/** Versorgung eines Betriebs in einfachen Zahlen für die Oberfläche (Mengen je Tag, Beträge in Cent heutiger Preise). */
function supplyView(sp) {
  if (!sp) return null;
  return {
    on: sp.on, primary: sp.primary, status: sp.status, ratio: r2(sp.ratio), factor: r2(sp.factor), auto: sp.auto, cost: sp.cost, costContract: sp.costContract, costWholesale: sp.costWholesale, subsidy: sp.subsidy, contractIncome: sp.contractIncome, policy: sp.policy,
    needs: sp.needs.map((n) => ({ good: n.good, name: n.name, unit: n.unit, icon: n.icon, need: r2(n.need), byContract: r2(n.byContract), byWholesale: r2(n.byWholesale), missing: r2(n.missing), price: Math.round(n.price * 100) / 100, scar: n.scarLabel, subsidyPct: n.subsidyPct, cost: n.costContract + n.costWholesale - n.subsidy })),
    outputs: sp.outputs.map((o) => ({ good: o.good, name: o.name, unit: o.unit, icon: o.icon, service: o.service, units: r2(o.units), byContract: r2(o.byContract), committed: r2(o.committed), fill: r2(o.fill), income: o.income })),
  };
}
/** Laufende Lieferverträge einer Firma (aus dem Spielstand gespiegelt). */
function dealsView(state, firmId) {
  const K = state.contracts || { buys: [], sells: [] };
  const g = require('./goods');
  const one = (x, buy) => ({ id: x.id, good: x.good, name: (g.good(x.good) || {}).name || x.good, unit: (g.good(x.good) || {}).unit || '', qty: r2(x.qty), priceReal: x.price, fill: x.fill == null ? 1 : x.fill, take: x.take == null ? 1 : x.take, other: buy ? x.sellerName : x.buyerName, otherFirm: buy ? x.sellerFirmName : x.buyerFirmName, daysLeft: x.daysLeft, term: x.term, auto: !!x.auto });
  return { buys: (K.buys || []).filter((x) => x.firmId === firmId && !x.ended).map((x) => one(x, true)), sells: (K.sells || []).filter((x) => x.firmId === firmId).map((x) => one(x, false)) };
}
/** Warenkreislauf für die Übersicht: Preise der Waren in der Stadt des Spielers, Beispielketten mit eigenen Betrieben. */
function goodsView(world, state, year) {
  const g = require('./goods'); const w = g.W();
  const keys = new Set();
  for (const c of state.companies || []) { if (c.abandoned) continue; const ar = g.activeRecipe(world, c.pkey, year, c.cityId); ar.inputs.forEach((i) => keys.add(i.good)); ar.out.forEach((o) => { if (!g.good(o.good).service) keys.add(o.good); }); }
  const own = new Set((state.companies || []).filter((c) => !c.abandoned).map((c) => c.pkey));
  return {
    enabled: g.enabled(), markupPct: Math.round(w.markup * 100), discountPct: Math.round(w.discount * 100), floorPct: Math.round(w.floor * 100),
    prices: g.enabled() ? g.priceList(world, state.cityId, year, [...keys]) : [],
    chains: g.CHAINS.map((ch) => ({ name: ch.name, steps: ch.steps.filter((s) => { const gd = g.good(s.good); return gd && g.inEra(gd, year) && (!s.pkey || (world.prof(s.pkey) && world.prof(s.pkey).era_from <= year && year <= world.prof(s.pkey).era_to)); }).map((s) => ({ label: s.label, good: g.good(s.good).name, icon: g.good(s.good).icon, mine: !!s.pkey && own.has(s.pkey) })) })).filter((ch) => ch.steps.length >= 2),
  };
}

/** Stadtwirtschaft in Kurzform für „Was jetzt?“ und die Kopfzeile: Mietanteil am Einkommen und günstigere Nachbarstädte. */
function econView(world, state, year, flows) {
  if (!cityecon.active() || state.status !== 'alive') return { on: false, tips: [], rentShare: 0 };
  return { on: true, tips: cityecon.tips(world, state, year, flows.exp.lodging), rentShare: flows.income > 0 ? Math.round((flows.exp.lodging / flows.income) * 1000) / 1000 : 0 };
}

function present(world, state, user, now) {
  const year = yearOf(state.day, state.startYear);
  const idx = world.idx(year);
  const econ = world.econ;
  const flows = dailyFlows(world, state);
  const date = dateOf(state.day, state.startYear);
  const city = world.city(state.cityId);
  const h = effectiveHousing(state);
  const occ = state.occupation;
  const occProf = occ ? world.prof(occ.pkey) : null;
  const curCityFactor = require('./core').foodFactor(world, state, year);
  const age = ageYears(state.person.birthDay, state.day);
  const span = lifespanDays(state, year);

  const learned = state.skills.learned.concat(['helfer']).map((k) => {
    const p = world.prof(k);
    if (!p) return null;
    const lv = levelIndex(state, k);
    const days = state.skills.days[k] || 0;
    const next = LEVELS[lv + 1];
    return { key: k, name: p.name, icon: p.icon, level: LEVELS[lv].name, days, nextLevel: next ? next.name : null, nextAt: next ? next.days : null, active: p.era_from <= year && year <= p.era_to };
  }).filter(Boolean);

  const view = {
    status: state.status,
    generation: state.generation, cycle: state.cycle,
    person: { id: state.person.id, name: `${state.person.first} ${state.person.last}`, first: state.person.first, last: state.person.last, gender: state.person.gender, age, birthCity: (world.city(state.person.birthCityId) || {}).name },
    date: { label: formatDate(state.day, state.startYear), year, doy: date.doy, day: state.day, era: eraName(year), eraKey: eraKey(year), medium: mediumFor(year) },
    currency: world.currency(year),
    announcement: (() => { const a = world.settings.get('site.announcement'); return a && a.active && (a.text || a.title) ? { id: a.id, level: a.level || 'info', title: a.title || '', text: a.text || '' } : null; })(),
    idx,
    city: city ? { id: city.id, name: city.name, state: city.state, image: city.image } : null,
    money: state.money,
    worth: netWorth(world, state),
    meters: {
      fridge: round(state.meters.fridge), fridgeQ: Math.round(state.meters.fridgeQ * 10) / 10,
      wellbeing: round(state.meters.wellbeing), rest: round(state.meters.rest), health: round(state.meters.health),
    },
    hunger: state.hunger,
    housing: {
      lessor: state.housing.lessor || null,
      type: state.housing.type, name: state.housing.name || h.name, label: h.name, icon: h.icon, closed: h === HOUSING.damaged,
      rooms: roomsAvailable(state), needed: roomsNeeded(state), propertyId: state.housing.propertyId || null,
      perDay: flows.exp.lodging,
    },
    occupation: occ ? {
      kind: occ.kind, pkey: occ.pkey, name: occProf ? occProf.name : occ.pkey, employer: occ.employer, playerJob: !!occ.playerJob, lodging: !!occ.lodging, daysLeft: occ.daysLeft || 0,
      cityId: occ.cityId, notice: !!occ.notice, level: occ.kind === 'work' ? LEVELS[levelIndex(state, occ.pkey)].name : null, since: occ.since,
    } : null,
    career: (() => {
      const career = require('./career'); const k = settings.get('career'); const cd = career.ensure(state); const wo = career.workerOcc(state);
      const st = wo ? career.steps(state, wo) : null; const wait = Math.max(0, cd.lastRaise + k.raiseCooldownDays - state.day);
      const used = cd.courses[year] || 0;
      const fee = (p, n) => scale(p.base_wage, idx, n);
      const pk = world.activeProfessions(year).filter((p) => !p.academic && p.pkey !== 'helfer');
      const cp = cd.course ? world.prof(cd.course.pkey) : null; const hp = cd.hire ? world.prof(cd.hire.pkey) : null;
      return {
        notice: occ && occ.notice ? { daysLeft: Math.max(0, occ.notice.endDay - state.day), switchTo: cd.hire ? `${hp ? hp.name : cd.hire.pkey} · ${cd.hire.employer}` : null } : null, noticeDays: k.noticeDays, canNotice: !!wo && !occ.notice,
        steps: st ? { tenure: st.tenure, perf: st.perf, maxTenure: k.tenureMaxSteps, maxPerf: k.raiseMaxSteps, pct: k.stepPct, mult: Math.round(career.payMult(state, wo) * 100) } : null,
        raise: wo ? { can: st.perf < k.raiseMaxSteps && wait === 0, wait, chance: Math.round(career.raiseChance(state, wo) * 100) } : null,
        course: cd.course ? { name: cp ? cp.name : cd.course.pkey, kind: cd.course.kind, daysLeft: Math.max(0, cd.course.endDay - state.day) } : null,
        courses: { used, cap: k.coursesPerYear, days: Math.max(14, Math.round(k.courseDays * TLN.studyMult(state.talents))), unlockDays: Math.max(14, Math.round(k.unlockDays * TLN.studyMult(state.talents))), options: pk.map((p) => ({ key: p.pkey, name: p.name, icon: p.icon, learned: isLearned(state, p.pkey), fee: fee(p, state.skills.learned.includes(p.pkey) ? k.courseFeeDays : k.unlockFeeDays) })) },
        benefit: career.benefitView(world, state),
      };
    })(),
    flows: { income: flows.income, expense: flows.expense, net: flows.net, inc: flows.inc, exp: flows.exp },
    food: {
      consumption: Math.round(consumption(state) * satiety(state.meters.fridgeQ) * 10) / 10,
      tiers: econ.food.map((t, i) => ({ key: t.key, name: t.name, cost: round(t.perPct * Math.max(0, 100 - state.meters.fridge) * idx * curCityFactor), perDay: foodCostPerDay(world, state, i), lasts: Math.round(100 / (consumption(state) * satiety(i + 1))) })),
    },
    learned,
    credit: require('./credit').view(world, state),
    rep: require('./reputation').brief(state),
    court: courtBrief(state),
    properties: state.properties.map((p) => ({
      id: p.id, name: p.name, kind: p.kind, cityId: p.cityId, city: (world.city(p.cityId) || {}).name, rooms: p.rooms, condition: round(p.condition),
      value: propertyValue(world, state, p, year), closed: p.closedUntil > state.day ? p.closedUntil - state.day : 0,
      repairCost: p.closedUntil > state.day ? round(propertyValue(world, state, p, year) * Math.min(0.2, 0.04 + 0.0015 * (p.closedUntil - state.day))) : 0, maintainCost: round(propertyValue(world, state, p, year) * ((100 - p.condition) / 100) * 0.5), residence: state.housing.propertyId === p.id,
      lease: require('./landlord').viewOf(world, state, p, year),
    })),
    companies: (state.companies || []).map((c) => {
      const t = biz.tiersOf(world)[c.tier]; const nt = biz.tiersOf(world)[c.tier + 1]; const f = biz.companyFlows(world, state, c, year); const city = world.city(c.cityId);
      const roomCost = Math.round(t.roomPrice * idx * (city ? city.price_factor : 1) * cityecon.buildMult(c.cityId, year));
      return {
        id: c.id, name: c.name, pkey: c.pkey, profession: (world.prof(c.pkey) || {}).name, tier: c.tier, tierName: biz.tierName(world, c), cityId: c.cityId, city: city && city.name,
        rooms: c.rooms, maxRooms: t.maxRooms, staff: c.staff, needed: f.needed || biz.staffNeeded(world, c), manager: c.manager, cash: c.cash, abandoned: !!c.abandoned,
        value: biz.companyValue(world, state, c, year), flows: f, comp: f.comp, security: !!c.security, stock: c.stock ? { id: c.stock.id, div: c.stock.divPct, outside: c.stock.outside || 0 } : null, hit: c.hit && state.day < c.hit.until ? { days: c.hit.until - state.day, pct: Math.round((1 - c.hit.factor) * 100) } : null, outage: c.outageUntil && state.day < c.outageUntil ? c.outageUntil - state.day : 0, owner: !!(state.occupation && state.occupation.ownCompanyId === c.id),
        roomCost, roomCoins: biz.tiersOf(world)[c.tier].roomCoins, roomStep: state.discounts[`room:${c.id}`] || 0,
        qualified: biz.qualification(world, state, c.pkey, c.tier).ok,
        next: nt ? { name: biz.chainNames(world, c.pkey)[c.tier + 1], cost: Math.max(0, Math.round((nt.price - t.price) * idx * (city ? city.price_factor : 1) * cityecon.buildMult(c.cityId, year))), minLevel: nt.minLevel, qualified: biz.qualification(world, state, c.pkey, c.tier + 1).ok } : null,
        reactivateCost: Math.round(c.base * idx * (econ.companies.reactivatePct / 100)),
        autoBuy: c.autoBuy !== false, supply: supplyView(f.supply), inputs: f.inputs || 0, vat: f.vat || 0, contractIncome: f.contractIncome || 0, profitAll: f.profitAll == null ? f.profit : f.profitAll,
        deals: dealsView(state, c.id),
        talent: TV.firmView(world, state, c, idx, year, f.needed || biz.staffNeeded(world, c)),
      };
    }),
    goods: goodsView(world, state, year),
    found: biz.foundOptions(world, state),
    econ: econView(world, state, year, flows),
    politics: (() => {
      const pc = econ.politics; const infl = (user.meta.influence || 0) + (state.fx.influence || 0); const t = state.politics.term;
      return {
        influence: infl, elections: !!settings.get('elections').enabled, chanceOff: !!settings.get('elections').disableChance, minAge: pc.minAge, termDays: pc.termDays, ageOk: age >= pc.minAge,
        term: t ? { name: pc.offices[t.idx].name, idx: t.idx, daysLeft: Math.max(0, t.endDay - state.day), income: society.officeEffects(world, state, year).income } : null,
        offices: pc.offices.map((o, i) => ({ idx: i, name: o.name, campaign: scale(o.campaign, idx), income: scale(o.income + o.termBonus * society.completed(state, i), idx), done: society.completed(state, i), unlocked: i === 0 || society.completed(state, i - 1) > 0, chance: Math.round(society.winChance(world, state, infl, i) * 100), rest: o.rest, rep: officeRep(state, i) })),
      };
    })(),
    gambling: { ticket: scale(econ.gambling.ticket, idx), casino: year >= econ.gambling.casinoFromYear && age >= econ.gambling.casinoMinAge, casinoFrom: econ.gambling.casinoFromYear, minAge: econ.gambling.casinoMinAge, lost: state.stats.gambled || 0 },
    insurance: Object.entries(econ.insurance).map(([k, v]) => ({
      key: k, name: v.name, on: !!state.insurance[k], covers: v.covers,
      perDay: v.perDay ? scale(v.perDay, idx) : round((state.properties.reduce((s, p) => s + propertyValue(world, state, p, year), 0) * v.yearPctOfValue) / 100 / 365),
    })),
    cards: { health: state.cards.health, available: year >= 1960, price: scale(4000, idx), coinPrice: 2 },
    butler: state.butler ? { perDay: scale(state.butler.perDay, idx) } : null,
    autoMaintain: !!state.flags.autoMaintain,
    partner: state.partner ? {
      name: state.partner.name, gender: state.partner.gender, age: ageYears(state.partner.born, state.day), profession: state.partner.profession,
      tal: state.partner.tal ? TV.barsOf(state.partner.tal, false) : null, sat: round(state.partner.sat), linked: !!state.partner.linked, userId: state.partner.userId || null, married: state.partner.married, cohabit: state.partner.cohabit, canTogether: state.day - (state.partner.lastTogether || -99) >= 5,
    } : null,
    plan: state.plan,
    adoption: (() => { const fam = require('./family'); const block = fam.adoptionBlock(state, settings.get('game.max_children')); return { block, pending: state.pending.adopt ? Math.max(0, state.pending.adopt.day - state.day) : null, cost: Math.round(world.econ.marriageCost * 2 * world.idx(yearOf(state.day, state.startYear))) }; })(),
    children: state.children.map((c) => ({
      id: c.id, name: c.name, gender: c.gender, age: ageOfChild(state, c), status: c.status, sat: round(c.sat), school: c.school, schoolName: c.school ? SCHOOLS[c.school].name : null,
      schoolDone: c.schoolDone || null, pendingSchool: !!c.pendingSchool, pendingPath: !!c.pendingPath, path: c.path, pkey: c.pkey, profession: c.pkey ? (world.prof(c.pkey) || {}).name : null,
      daysLeft: c.daysLeft || 0, city: (world.city(c.cityId) || {}).name, searchLeft: c.status === 'runaway' ? Math.max(0, c.searchDeadline - state.day) : 0,
      tal: TV.childView(world, state, c, idx, ageOfChild(state, c)),
    })),
    talents: TLN.enabled() ? { me: TV.meView(world, state), labels: TLN.C().labels || {}, revealAge: Number(TLN.C().revealAge || 6), edu: TLN.eduOf(world, state.cityId) } : null,
    maxChildren: settings.get('game.max_children'),
    rooms: { have: roomsAvailable(state), need: roomsNeeded(state) },
    clock: { perMs: settings.get('game.clock_days_per_day') / 86400000, carry: user.efs_carry || 0, at: now },
    efs: { pool: user.efs_pool, daily: settings.get('efs.daily_auto'), login: settings.get('efs.login_bonus') },
    coins: user.coins,
    notices: state.notices.slice(0, 40),
    hints: hintsFor(state, flows),
    tutorial: !!state.flags.tutorial,
    life: { ageDays: state.day - state.person.birthDay, span, illness: state.life.illness ? state.life.illness.name : null, daysLeft: Math.max(0, span - (state.day - state.person.birthDay)) },
    stats: state.stats,
    tree: { persons: state.tree.persons, events: state.tree.events.slice(-80).reverse() },
    discounts: state.discounts,
    legacy: { target: settings.get('game.legacy_year'), progress: Math.max(0, Math.min(1, (year - state.startYear) / (settings.get('game.legacy_year') - state.startYear))) },
    death: state.death,
  };

  view.onboarding = onboarding.view(world, state, user, view);

  if (state.status === 'dead') {
    const est = estateShare(world, state);
    view.heirs = eligibleHeirs(state).map((c) => ({ id: c.id, name: c.name, age: ageOfChild(state, c), profession: c.pkey ? (world.prof(c.pkey) || {}).name : null }));
    view.estate = { n: est.n, total: est.total, share: est.share, money: est.money, properties: est.props.map((p) => ({ id: p.key, name: p.name, value: p.value })) };
  }
  return view;
}

module.exports = { present, eraName, eraKey };
