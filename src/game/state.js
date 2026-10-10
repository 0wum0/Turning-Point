'use strict';
const settings = require('../settings');
const { rngFor, int, chance } = require('./rng');
const { notice, chronicle, learn } = require('./core');
const { randomFirstName } = require('./content');
const onboarding = require('./onboarding');
const T = require('./talents');

const TEXT = (v, max) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

function validateCreation(world, input, userMeta) {
  const err = [];
  const gender = ['m', 'f', 'd'].includes(input.gender) ? input.gender : null;
  if (!gender) err.push('Bitte ein Geschlecht wählen.');
  const first = TEXT(input.firstName, 30);
  const last = TEXT(input.lastName, 30);
  if (first.length < 2) err.push('Der Vorname ist zu kurz.');
  if (last.length < 2) err.push('Der Nachname ist zu kurz.');
  const cityId = Number(input.birthCityId);
  if (!world.city(cityId)) err.push('Bitte eine Geburtsstadt wählen.');
  const startYear = settings.get('game.start_year');
  const allowed = world.activeProfessions(startYear).filter((p) => !p.academic && p.pkey !== 'helfer').map((p) => p.pkey);
  const prof = String(input.professionKey || '');
  if (!allowed.includes(prof)) err.push('Bitte einen Startberuf wählen.');
  const nr = rngFor('parents', first, last, cityId);
  const parents = {
    fatherName: TEXT(input.fatherName, 40) || randomFirstName(nr, 1900, 'm'),
    fatherJob: TEXT(input.fatherJob, 40) || 'Arbeiter',
    motherName: TEXT(input.motherName, 40) || randomFirstName(nr, 1900, 'f'),
    motherJob: TEXT(input.motherJob, 40) || 'Hausfrau',
  };
  return { err, value: { gender, first, last, cityId, prof, parents } };
}

function newTree() { return { persons: [], events: [], nextId: 1 }; }
function addPerson(state, p) {
  const id = `p${state.tree.nextId++}`;
  const person = { id, status: 'alive', jobs: [], ...p };
  state.tree.persons.push(person);
  return person;
}

/** Neuer Spielcharakter (Generation 1, Startjahr). */
function createCharacter(world, input, user, { cycle = 1 } = {}) {
  const { value: v } = validateCreation(world, input, user.meta);
  const startYear = settings.get('game.start_year');
  const age = settings.get('game.start_age');
  const seed = Math.floor(Math.random() * 2 ** 31);
  const r = rngFor('char', seed);
  const state = {
    v: 1, seed, startYear, day: 0, cycle, generation: 1,
    status: 'alive', death: null,
    person: { id: null, first: v.first, last: v.last, gender: v.gender, birthDay: -age * 365 - int(r, 0, 364), birthCityId: v.cityId },
    cityId: v.cityId,
    money: settings.get('game.start_money_cents'),
    meters: { fridge: 45, fridgeQ: 2, wellbeing: 60, rest: 80, health: 100 },
    housing: { type: 'street', cityId: v.cityId },
    occupation: null,
    skills: { learned: [], days: {} },
    properties: [], nextPropId: 1, companies: [], nextCompanyId: 1, politics: { term: null, completed: {} }, career: { applied: {}, hire: null, lastRaise: -9999, courses: {}, course: null, benefit: null },
    insurance: { hausrat: false, gebaeude: false, gesundheit: false },
    cards: { health: 0 }, butler: null,
    partner: null, plan: { target: 3 }, children: [], nextChildId: 1,
    tree: newTree(),
    life: {
      baseYears: 60 + r() * 10, extraDays: 0, illness: null, rare: chance(r, 0.015),
      healthSum: 0, healthDays: 0, cardsUsed: 0,
    },
    hunger: 0, restZero: 0,
    notices: [], nextNoticeId: 1, interrupts: [],
    stats: { earned: 0, spent: 0, peakWorth: 0, daysWorked: 0 },
    discounts: {}, collected: {}, flags: { tutorial: true, autoMaintain: false, foodTier: 1 },
    pending: {}, mods: {}, taskCd: {}, press: [], nextPressId: 0,
    fx: { coins: 0, efs: 0, influence: 0 },
  };
  // Familie im Hintergrund (im Krieg umgekommen)
  const father = addPerson(state, { name: `${v.parents.fatherName} ${v.last}`, gender: 'm', born: state.person.birthDay - 26 * 365, role: 'parent', jobs: [v.parents.fatherJob], died: -1, note: 'im Krieg umgekommen', status: 'dead' });
  const mother = addPerson(state, { name: `${v.parents.motherName} ${v.last}`, gender: 'f', born: state.person.birthDay - 24 * 365, role: 'parent', jobs: [v.parents.motherJob], died: -1, note: 'im Krieg umgekommen', status: 'dead' });
  father.partnerId = mother.id; mother.partnerId = father.id;
  father.tal = T.newProfile(rngFor('tal-per', seed, father.id)); mother.tal = T.newProfile(rngFor('tal-per', seed, mother.id));
  const me = addPerson(state, { name: `${v.first} ${v.last}`, gender: v.gender, born: state.person.birthDay, bornCity: v.cityId, role: 'player', gen: 1, parents: [father.id, mother.id], jobs: [] });
  state.person.id = me.id;
  state.talents = T.fromParents(father.tal, mother.tal, rngFor('tal-me', seed, me.id));
  learn(state, v.prof);
  for (const d of user.meta.degrees || []) learn(state, d);
  me.jobs.push(world.prof(v.prof).name);
  onboarding.initFresh(state);
  chronicle(state, `${v.first} ${v.last} wird mit 20 Jahren auf sich allein gestellt – 40 DM, ein erlernter Beruf (${world.prof(v.prof).name}) und die ganze Zukunft.`, 'birth');
  notice(state, {
    level: 'good', title: 'Willkommen im Jahr 1945',
    text: 'Du hast 40 DM, einen Beruf und keine Wohnung. Schlag die Zeitung auf: Dort stehen Arbeit, Unterkünfte und Neuigkeiten.',
    info: ['Dein Leben beginnt hier.', 'Ohne Dach über dem Kopf geht es dir nach wenigen Tagen schlecht.', 'Öffne die Zeitung, suche Arbeit und eine Unterkunft – und denke an den Kühlschrank.'],
    tab: 'newspaper',
  });
  return state;
}

/** Ältere Spielstände auf das aktuelle Format heben (neue Felder mit Standardwerten). */
function upgradeState(s) {
  if (!s) return s;
  if (!s.companies) { s.companies = []; s.nextCompanyId = 1; }
  if (!s.politics) s.politics = { term: null, completed: {} };
  if (!s.fx) s.fx = { coins: 0, efs: 0, influence: 0 };
  if (s.fx.influence == null) s.fx.influence = 0;
  if (!s.plan) s.plan = { target: 3 };
  if (s.plan.target == null) s.plan.target = 3;
  if (!s.mods) s.mods = {};
  if (!s.taskCd) s.taskCd = {};
  if (!s.pending) s.pending = {};
  if (!s.career) s.career = { applied: {}, hire: null, lastRaise: -9999, courses: {}, course: null, benefit: null };
  if (!s.press) { s.press = []; s.nextPressId = 0; }
  if (!s.flags) s.flags = {};
  T.ensureAll(s); // Talente: Altstände bekommen feste, aus dem Spielstand-Samen abgeleitete Profile (idempotent)
  onboarding.ensure(s); // Altstände: Einsteiger-Aufgaben werden beim nächsten Abgleich still nachgeführt (kein Belohnungsregen)
  return s;
}
const parseState = (json) => upgradeState(JSON.parse(json));

module.exports = { upgradeState, parseState, createCharacter, validateCreation, addPerson, newTree, TEXT };
