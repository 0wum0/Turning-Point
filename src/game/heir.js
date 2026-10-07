'use strict';
const settings = require('../settings');
const { rngFor, int, chance } = require('./rng');
const { yearOf } = require('./calendar');
const { notice, chronicle, learn, propertyValue } = require('./core');
const { estateShare, eligibleHeirs, ageOfChild } = require('./family');

/**
 * Generationenwechsel. Pflichtanteil: Jedes Kind (außer den mit dem Partner gegangenen) erhält
 * denselben Anteil am Nachlass (Geld + Immobilien). Der Erbe bekommt zuerst die ihm
 * zugedachten Immobilien (soweit sie in seinen Anteil passen) und den Rest in bar.
 */
function planInheritance(world, state, childId, bequestIds = []) {
  const year = yearOf(state.day, state.startYear);
  const est = estateShare(world, state);
  let remaining = est.share;
  const taken = [];
  for (const pid of bequestIds) {
    const p = state.properties.find((x) => x.id === Number(pid));
    if (!p || taken.includes(p)) continue;
    const v = propertyValue(world, state, p, year);
    if (v <= remaining) { taken.push(p); remaining -= v; }
  }
  return { est, properties: taken, cash: remaining };
}

function createHeirState(world, old, childId, bequestIds) {
  const c = old.children.find((x) => x.id === Number(childId));
  if (!c || !eligibleHeirs(old).includes(c)) throw new Error('Dieses Kind kann nicht erben.');
  const plan = planInheritance(world, old, childId, bequestIds);
  const year = yearOf(old.day, old.startYear);
  const seed = Math.floor(Math.random() * 2 ** 31);
  const r = rngFor('char', seed);
  const city = world.city(c.cityId) || world.city(old.cityId);
  const state = {
    v: 1, seed, startYear: old.startYear, day: old.day, cycle: old.cycle, generation: old.generation + 1,
    status: 'alive', death: null,
    person: { id: c.personId, first: c.name, last: old.person.last, gender: c.gender, birthDay: c.born, birthCityId: c.cityId },
    cityId: old.cityId,
    money: plan.cash,
    meters: { fridge: 50, fridgeQ: 2, wellbeing: 60, rest: 80, health: 95 },
    housing: { type: 'street', cityId: old.cityId },
    occupation: null,
    skills: { learned: [], days: {} },
    properties: plan.properties.map((p) => ({ ...p, closedUntil: p.closedUntil })), nextPropId: old.nextPropId,
    insurance: { ...old.insurance }, cards: { health: old.cards.health }, butler: null,
    partner: null, plan: { children: true }, children: [], nextChildId: 1,
    tree: old.tree,
    life: { baseYears: 60 + r() * 10, extraDays: 0, illness: null, rare: chance(r, 0.015), healthSum: 0, healthDays: 0, cardsUsed: 0 },
    hunger: 0, restZero: 0,
    notices: [], nextNoticeId: 1, interrupts: [],
    stats: { earned: 0, spent: 0, peakWorth: plan.cash, daysWorked: 0 },
    discounts: {}, collected: {}, flags: { tutorial: false, autoMaintain: old.flags.autoMaintain, foodTier: 1 },
    pending: {}, mods: {},
    fx: { coins: 0, efs: 0 },
  };
  for (const k of c.skills || []) learn(state, k);
  const me = state.tree.persons.find((x) => x.id === c.personId);
  if (me) { me.role = 'player'; me.gen = state.generation; me.status = 'alive'; me.jobs = me.jobs || []; }
  // Wohnsitz: größtes geerbtes Haus in der Heimatstadt, sonst Pension
  const home = state.properties.filter((p) => p.cityId === old.cityId).sort((a, b) => b.rooms - a.rooms)[0] || state.properties.sort((a, b) => b.rooms - a.rooms)[0];
  if (home) {
    state.cityId = home.cityId;
    state.housing = { type: 'own', cityId: home.cityId, propertyId: home.id };
  } else {
    const cty = world.city(old.cityId);
    state.housing = { type: 'pension', cityId: old.cityId, name: 'Pension', base: Math.round(world.econ.lodging.pension * (cty ? cty.price_factor : 1)), rooms: 1 };
  }
  chronicle(state, `Generation ${state.generation}: ${c.name} ${state.person.last} tritt das Erbe an.`, 'inheritance');
  notice(state, {
    level: 'good', title: `Generation ${state.generation}: Das Erbe ist angetreten`, tab: 'legacy',
    text: `${c.name} erbt ${plan.properties.length ? plan.properties.map((p) => p.name).join(', ') + ' und ' : ''}${plan.cash} Cent in bar (Pflichtanteil 1/${plan.est.n}).`,
    info: ['Du spielst jetzt das Kind des Verstorbenen.', 'Das Erbe wird nach Pflichtanteil verteilt: Je mehr Kinder, desto kleiner der Anteil.', 'Suche dir Arbeit, halte die Familie zusammen und führe das Lebenswerk fort.'],
  });
  return { state, plan };
}

module.exports = { createHeirState, planInheritance };
