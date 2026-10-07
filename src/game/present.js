'use strict';
const settings = require('../settings');
const { dateOf, formatDate, yearOf, ageYears } = require('./calendar');
const { scale } = require('./economy');
const {
  dailyFlows, propertyValue, netWorth, roomsAvailable, roomsNeeded, effectiveHousing, levelIndex, foodCostPerDay,
  consumption, kidsAtHome,
} = require('./core');
const { HOUSING, LEVELS, SCHOOLS } = require('./content');
const { estateShare, eligibleHeirs, ageOfChild } = require('./family');
const { lifespanDays } = require('./engine');
const { mediumFor } = require('./newspaper');
const biz = require('./business');

const round = (n) => Math.round(n);

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
  const curCityFactor = 0.6 + 0.4 * (city ? city.price_factor : 1);
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
      type: state.housing.type, name: state.housing.name || h.name, label: h.name, icon: h.icon, closed: h === HOUSING.damaged,
      rooms: roomsAvailable(state), needed: roomsNeeded(state), propertyId: state.housing.propertyId || null,
      perDay: flows.exp.lodging,
    },
    occupation: occ ? {
      kind: occ.kind, pkey: occ.pkey, name: occProf ? occProf.name : occ.pkey, employer: occ.employer, lodging: !!occ.lodging, daysLeft: occ.daysLeft || 0,
      cityId: occ.cityId, level: occ.kind === 'work' ? LEVELS[levelIndex(state, occ.pkey)].name : null, since: occ.since,
    } : null,
    flows: { income: flows.income, expense: flows.expense, net: flows.net, inc: flows.inc, exp: flows.exp },
    food: {
      consumption: consumption(state),
      tiers: econ.food.map((t, i) => ({ key: t.key, name: t.name, cost: round(t.perPct * Math.max(0, 100 - state.meters.fridge) * idx * curCityFactor), perDay: foodCostPerDay(world, state, i) })),
    },
    learned,
    properties: state.properties.map((p) => ({
      id: p.id, name: p.name, kind: p.kind, cityId: p.cityId, city: (world.city(p.cityId) || {}).name, rooms: p.rooms, condition: round(p.condition),
      value: propertyValue(world, state, p, year), closed: p.closedUntil > state.day ? p.closedUntil - state.day : 0,
      maintainCost: round(propertyValue(world, state, p, year) * ((100 - p.condition) / 100) * 0.08), residence: state.housing.propertyId === p.id,
    })),
    companies: (state.companies || []).map((c) => {
      const t = biz.tiersOf(world)[c.tier]; const nt = biz.tiersOf(world)[c.tier + 1]; const f = biz.companyFlows(world, state, c, year); const city = world.city(c.cityId);
      const roomCost = Math.round(t.roomPrice * idx * (city ? city.price_factor : 1));
      return {
        id: c.id, name: c.name, pkey: c.pkey, profession: (world.prof(c.pkey) || {}).name, tier: c.tier, tierName: biz.tierName(world, c), cityId: c.cityId, city: city && city.name,
        rooms: c.rooms, maxRooms: t.maxRooms, staff: c.staff, needed: f.needed || biz.staffNeeded(world, c), manager: c.manager, cash: c.cash, abandoned: !!c.abandoned,
        value: biz.companyValue(world, state, c, year), flows: f, owner: !!(state.occupation && state.occupation.ownCompanyId === c.id),
        roomCost, roomCoins: biz.tiersOf(world)[c.tier].roomCoins, roomStep: state.discounts[`room:${c.id}`] || 0,
        qualified: biz.qualification(world, state, c.pkey, c.tier).ok,
        next: nt ? { name: biz.chainNames(world, c.pkey)[c.tier + 1], cost: Math.max(0, Math.round((nt.price - t.price) * idx * (city ? city.price_factor : 1))), minLevel: nt.minLevel, qualified: biz.qualification(world, state, c.pkey, c.tier + 1).ok } : null,
        reactivateCost: Math.round(c.base * idx * (econ.companies.reactivatePct / 100)),
      };
    }),
    insurance: Object.entries(econ.insurance).map(([k, v]) => ({
      key: k, name: v.name, on: !!state.insurance[k], covers: v.covers,
      perDay: v.perDay ? scale(v.perDay, idx) : round((state.properties.reduce((s, p) => s + propertyValue(world, state, p, year), 0) * v.yearPctOfValue) / 100 / 365),
    })),
    cards: { health: state.cards.health, available: year >= 1960, price: scale(4000, idx), coinPrice: 2 },
    butler: state.butler ? { perDay: scale(state.butler.perDay, idx) } : null,
    autoMaintain: !!state.flags.autoMaintain,
    partner: state.partner ? {
      name: state.partner.name, gender: state.partner.gender, age: ageYears(state.partner.born, state.day), profession: state.partner.profession,
      sat: round(state.partner.sat), married: state.partner.married, cohabit: state.partner.cohabit, canTogether: state.day - (state.partner.lastTogether || -99) >= 5,
    } : null,
    plan: state.plan,
    children: state.children.map((c) => ({
      id: c.id, name: c.name, gender: c.gender, age: ageOfChild(state, c), status: c.status, sat: round(c.sat), school: c.school, schoolName: c.school ? SCHOOLS[c.school].name : null,
      schoolDone: c.schoolDone || null, pendingSchool: !!c.pendingSchool, pendingPath: !!c.pendingPath, path: c.path, pkey: c.pkey, profession: c.pkey ? (world.prof(c.pkey) || {}).name : null,
      daysLeft: c.daysLeft || 0, city: (world.city(c.cityId) || {}).name, searchLeft: c.status === 'runaway' ? Math.max(0, c.searchDeadline - state.day) : 0,
    })),
    maxChildren: settings.get('game.max_children'),
    rooms: { have: roomsAvailable(state), need: roomsNeeded(state) },
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

  if (state.status === 'dead') {
    const est = estateShare(world, state);
    view.heirs = eligibleHeirs(state).map((c) => ({ id: c.id, name: c.name, age: ageOfChild(state, c), profession: c.pkey ? (world.prof(c.pkey) || {}).name : null }));
    view.estate = { n: est.n, total: est.total, share: est.share, money: est.money, properties: est.props.map((p) => ({ id: p.key, name: p.name, value: p.value })) };
  }
  return view;
}

module.exports = { present, eraName, eraKey };
