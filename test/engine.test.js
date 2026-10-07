'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const { edition, resolveListing } = require('../src/game/newspaper');
const { ladder } = require('../src/game/actions');
const { createHeirState } = require('../src/game/heir');

const w = testWorld();
const user = () => ({ meta: {}, coins: 5, efs_pool: 0 });
const fresh = () => createCharacter(w, input(w), user());
const act = (s, name, inp, u = user()) => actions.run(name, { world: w, state: s, input: inp, user: u, now: Date.now() });

test('Straße: Tod nach etwa drei Tagen', () => {
  const s = fresh();
  let days = 0;
  for (let i = 0; i < 10 && s.status === 'alive'; i++) { days += advance(w, s, 10 - days).advanced; }
  assert.ok(['dead', 'gameover'].includes(s.status), 'Charakter sollte gestorben sein');
  assert.ok(days <= 4 && days >= 2, `Tage=${days}`); // „etwa drei Tage“ – Zufallsereignisse verschieben um einen Tag
  assert.strictEqual(s.status, 'gameover'); // keine Kinder → Game Over
});

test('Start: Zeitung enthält Stelle für Startberuf und Unterkünfte', () => {
  const s = fresh();
  const e = edition(w, s, s.cityId);
  assert.ok(e.jobs.some((j) => j.pkey === 'baecker' && j.kind === 'work'));
  assert.ok(e.housing.pension.length && e.housing.rent.length);
  assert.strictEqual(e.medium, 'paper');
  const again = edition(w, s, s.cityId);
  assert.deepStrictEqual(e.jobs, again.jobs, 'Zeitung ist deterministisch');
});

test('Arbeit + Pension: Geld wächst, Meter bleiben stabil', () => {
  const s = fresh();
  const e = edition(w, s, s.cityId);
  act(s, 'apply', { listingId: e.jobs.find((j) => j.pkey === 'baecker').id });
  act(s, 'rent', { listingId: e.housing.pension[0].id });
  act(s, 'buyFood', { tier: 1 });
  const start = s.money;
  for (let i = 0; i < 30; i++) {
    if (s.meters.fridge < 40) act(s, 'buyFood', { tier: 1 });
    const r = advance(w, s, 1);
    s.interrupts = [];
    assert.strictEqual(s.status, 'alive', `lebt an Tag ${i}`);
  }
  assert.ok(s.money > start, `Geld ${start} → ${s.money}`);
  assert.ok(s.meters.health > 60, `Gesundheit ${s.meters.health}`);
  assert.ok(s.meters.wellbeing > 40, `Wohlbefinden ${s.meters.wellbeing}`);
});

test('Hunger: leerer Kühlschrank erzeugt Unterbrechung', () => {
  const s = fresh();
  s.meters.fridge = 10;
  const r = advance(w, s, 5);
  assert.strictEqual(r.stopped, 'interrupt');
});

test('Offline-Schutz: 700 Tage ohne Spieler führen nicht zu Hungertod', () => {
  const s = fresh();
  const e = edition(w, s, s.cityId);
  act(s, 'apply', { listingId: e.jobs.find((j) => j.pkey === 'baecker').id });
  act(s, 'rent', { listingId: e.housing.rent[0].id });
  const r = advance(w, s, 700, { mode: 'offline' });
  assert.strictEqual(s.status, 'alive');
  assert.strictEqual(r.advanced, 700);
});

test('Währungsumstellung 2002 halbiert Geld', () => {
  const s = fresh();
  s.housing = { type: 'workplace', cityId: s.cityId };
  s.occupation = { kind: 'work', pkey: 'helfer', employer: 'X', cityId: s.cityId, factor: 1, lodging: true, since: 0 };
  s.day = (2002 - 1945) * 365 - 2;
  s.person.birthDay = s.day - 30 * 365;
  s.money = 1000000;
  const before = s.money;
  advance(w, s, 3, { mode: 'offline' });
  assert.ok(s.money < before * 0.7, `Geld ${s.money}`);
});

test('Coin-Preisleiter 50→25→13→7→4→2→1', () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => ladder(50, i)), [50, 25, 13, 7, 4, 2, 1, 1]);
});

test('Umzug: Geburtsstadt kostenlos, sonst Geld + Coins', () => {
  const s = fresh();
  const hh = w.cityList.find((c) => c.slug === 'muenchen');
  const q = actions.moveQuote(w, s, hh.id);
  assert.ok(q.money > 0 && q.coins > 0);
  s.cityId = hh.id;
  const home = actions.moveQuote(w, s, s.person.birthCityId);
  assert.ok(home.free && home.money === 0 && home.coins === 0);
});

test('Familie: Geburt, Pflichtanteil-Erbe, Generationenwechsel', () => {
  const s = fresh();
  s.money = 5000000;
  s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 };
  s.partner = { personId: 'p3', name: 'Eva', gender: 'f', born: -20 * 365, pkey: 'friseur', profession: 'Friseur', sat: 80, married: true, cohabit: true, giftBoost: 0, unhappyDays: 0 };
  // Kinder direkt anlegen (erwachsen)
  for (let i = 0; i < 2; i++) s.children.push({ id: s.nextChildId++, personId: `c${i}`, name: 'Kind' + i, gender: 'f', born: s.day - 20 * 365, cityId: s.cityId, status: 'home', sat: 80, school: null, path: 'none', skills: [] });
  s.tree.persons.push({ id: 'c0', name: 'K', jobs: [] }, { id: 'c1', name: 'K', jobs: [] });
  s.meters.health = 0.1; s.meters.rest = 0; s.hunger = 5; s.housing = { type: 'street', cityId: s.cityId };
  advance(w, s, 2);
  assert.strictEqual(s.status, 'dead');
  const { state: h, plan } = createHeirState(w, s, s.children[0].id, []);
  assert.strictEqual(h.generation, 2);
  assert.strictEqual(plan.est.n, 2);
  assert.ok(h.money > 0 && h.money <= 5000000 / 2 * 1.2, `Erbe ${h.money}`); // zufällige Glücksfunde dürfen das Erbe leicht erhöhen
});

test('Hundert Spieljahre simulieren (Smoke) ohne Fehler', () => {
  const s = fresh();
  s.money = 100000000;
  s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 3 };
  for (let i = 0; i < 365 * 45 && s.status === 'alive'; i++) {
    if (s.meters.fridge < 30) s.meters.fridge = 100;
    advance(w, s, 1); s.interrupts = [];
    if (s.money < 1e7) s.money = 1e8;
  }
  assert.ok(s.day > 365 * 20);
});

test('22. Jahrhundert beendet den Zyklus mit Coin-Bonus', () => {
  const s = fresh();
  s.money = 1e12; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 3 }; s.life.baseYears = 500;
  s.day = (2100 - 1945) * 365 - 3;
  s.person.birthDay = s.day - 30 * 365;
  for (let i = 0; i < 6 && s.status === 'alive'; i++) { s.meters.fridge = 100; advance(w, s, 1); s.interrupts = []; }
  assert.strictEqual(s.status, 'gameover');
  assert.ok(s.death.completed && s.fx.coins >= 500);
});
