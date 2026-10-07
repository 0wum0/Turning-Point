'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const { edition } = require('../src/game/newspaper');
const { createHeirState, planInheritance } = require('../src/game/heir');
const { estateShare } = require('../src/game/family');

const w = testWorld();
const u = () => ({ meta: {}, coins: 5, efs_pool: 0 });
const mk = (over) => createCharacter(w, input(w, over), u());
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i, user: u(), now: Date.now() });
const stable = (s) => { s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 }; s.money = 50000000; s.meters.fridge = 100; };
const run = (s, days) => { for (let i = 0; i < days && s.status === 'alive'; i++) { s.meters.fridge = 100; advance(w, s, 1); s.interrupts = []; } };

test('Ausbildung: kostenlos, dann ausgebildete Fachkraft im selben Betrieb', () => {
  const s = mk({ professionKey: 'baecker' }); stable(s);
  const e = edition(w, s, s.cityId);
  const lehr = e.jobs.find((j) => j.kind === 'training');
  assert.ok(lehr, 'Es gibt eine Lehrstelle');
  const money0 = s.money;
  act(s, 'apply', { listingId: lehr.id });
  assert.strictEqual(s.occupation.kind, 'training');
  assert.ok(s.money === money0, 'Ausbildung kostet nichts');
  run(s, lehr.trainingDays + 1);
  assert.ok(s.skills.learned.includes(lehr.pkey), 'Beruf erlernt');
  assert.strictEqual(s.occupation.kind, 'work');
});

test('Berufserfahrung: 10 Jahre Arbeit = erlernter Beruf', () => {
  const s = mk({ professionKey: 'baecker' }); stable(s);
  s.occupation = { kind: 'work', pkey: 'tischler', employer: 'X', cityId: s.cityId, factor: 1, lodging: false, since: 0 };
  s.skills.days.tischler = 3640;
  run(s, 15);
  assert.ok(s.skills.learned.includes('tischler'));
});

test('Berufswandel: Schmied → Maschinenbauer (1965), Bergmann verliert Job → Kraftwerkstechniker (1990)', () => {
  const s = mk({ professionKey: 'schmied' }); stable(s);
  s.person.birthDay = -20 * 365 + 0; s.life.baseYears = 200;
  s.day = (1965 - 1945) * 365 - 2;
  run(s, 4);
  assert.ok(s.skills.learned.includes('maschinenbauer'));
  const b = mk({ professionKey: 'baecker' }); stable(b); b.life.baseYears = 200;
  b.skills.learned.push('bergmann');
  b.occupation = { kind: 'work', pkey: 'bergmann', employer: 'Zeche', cityId: b.cityId, factor: 1, lodging: false, since: 0 };
  b.day = (1990 - 1945) * 365 - 2;
  run(b, 4);
  assert.strictEqual(b.occupation.pkey, 'kraftwerkstechniker');
});

test('Trennung: Hälfte des Vermögens und größere Hälfte der Kinder gehen', () => {
  const s = mk({}); stable(s); s.money = 10000000;
  s.partner = { personId: 'p9', name: 'Eva', gender: 'f', born: -22 * 365, pkey: 'friseur', profession: 'Friseur', sat: 0, married: false, cohabit: true, giftBoost: 0, unhappyDays: 24 };
  for (let i = 0; i < 3; i++) s.children.push({ id: s.nextChildId++, personId: `c${i}`, name: 'K' + i, gender: 'f', born: s.day - 5 * 365, cityId: s.cityId, status: 'home', sat: 90, school: null, path: null });
  s.tree.persons.push({ id: 'p9', name: 'Eva', jobs: [] }, { id: 'c0', jobs: [] }, { id: 'c1', jobs: [] }, { id: 'c2', jobs: [] });
  s.meters.wellbeing = 0;
  advance(w, s, 3); s.interrupts = [];
  assert.strictEqual(s.partner, null);
  assert.strictEqual(s.children.filter((c) => c.status === 'withPartner').length, 2, '3 Kinder → Partnerin 2, Spieler 1');
  assert.ok(s.money < 6000000 && s.money > 4000000, `Geld halbiert: ${s.money}`);
});

test('Weglaufen → Suche → Jugendhilfe mit Unterhalt', () => {
  const s = mk({}); stable(s);
  s.children.push({ id: 1, personId: 'c0', name: 'Rebell', gender: 'm', born: s.day - 12 * 365, cityId: s.cityId, status: 'home', sat: 5, school: 'haupt', path: null, unhappy: 19 });
  s.nextChildId = 2; s.tree.persons.push({ id: 'c0', jobs: [] });
  run(s, 2);
  assert.strictEqual(s.children[0].status, 'runaway');
  run(s, 25);
  assert.strictEqual(s.children[0].status, 'care');
  const f = require('../src/game/core').dailyFlows(w, s);
  assert.ok(f.exp.support > 0, 'Unterhalt wird fällig');
});

test('Pflichtanteil: gleiche Anteile, Erbe bekommt zugedachte Immobilie wenn sie in den Anteil passt', () => {
  const s = mk({}); stable(s); s.money = 3000000;
  s.properties.push({ id: 1, kind: 'house_small', name: 'Haus', cityId: s.cityId, rooms: 4, base: 2000000, condition: 100, closedUntil: 0, bought: 0 });
  for (let i = 0; i < 2; i++) s.children.push({ id: s.nextChildId++, personId: `c${i}`, name: 'K' + i, gender: 'm', born: s.day - 20 * 365, cityId: s.cityId, status: 'home', sat: 80, path: 'none' });
  s.tree.persons.push({ id: 'c0', jobs: [] }, { id: 'c1', jobs: [] });
  const est = estateShare(w, s);
  assert.strictEqual(est.n, 2);
  assert.strictEqual(est.share, Math.floor(est.total / 2));
  const plan = planInheritance(w, s, 1, [1]);
  assert.ok(plan.properties.length === 1 && plan.cash >= 0);
  const { state: h } = createHeirState(w, s, 1, [1]);
  assert.strictEqual(h.properties.length, 1);
  assert.strictEqual(h.housing.type, 'own');
  const total = h.money + 2000000;
  assert.ok(Math.abs(total - est.share) < 5, 'Gesamterbe entspricht Pflichtanteil');
});

test('Insolvenz online → Game Over; Coins bleiben (nur Flag im Spielstand)', () => {
  const s = mk({}); stable(s); s.money = 100;
  s.insurance.hausrat = true; s.butler = { perDay: 100000, since: 0 };
  advance(w, s, 3);
  assert.strictEqual(s.status, 'gameover');
});

test('Kinderwunsch-Zielzahl begrenzt Geburten', () => {
  const s = mk({}); stable(s); s.plan.target = 0;
  s.partner = { personId: 'p9', name: 'Eva', gender: 'f', born: -22 * 365, pkey: 'friseur', profession: 'Friseur', sat: 90, married: true, cohabit: true, giftBoost: 100, unhappyDays: 0 };
  s.tree.persons.push({ id: 'p9', jobs: [] });
  run(s, 1500);
  assert.strictEqual(s.children.length, 0);
});
