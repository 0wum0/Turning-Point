'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const actions = require('../src/game/actions');
const { advance } = require('../src/game/engine');
const { adoptionBlock } = require('../src/game/family');

const w = testWorld();
const u = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i || {}, user: u(), now: Date.now() });

function couple(gender, partnerGender) {
  const s = createCharacter(w, input(w, { professionKey: 'baecker', gender }), u());
  s.money = 90000000; s.person.birthDay = s.day - 30 * 365;
  s.housing = { type: 'rent', cityId: s.cityId, base: 100, rooms: 5 };
  s.occupation = { type: 'job', pkey: 'baecker', wage: 100, level: 0, since: 0 };
  s.partner = { personId: 'pp', name: 'Eva', gender: partnerGender, born: s.day - 28 * 365, pkey: null, profession: 'Hausfrau', sat: 80, married: true, cohabit: true, giftBoost: 0, unhappyDays: 0, since: 0 };
  return s;
}

test('Adoption: Antrag, Wartezeit, dann zieht ein Kind ein', () => {
  const s = couple('m', 'f'); const before = s.money;
  assert.strictEqual(adoptionBlock(s, 8), null);
  act(s, 'adopt');
  assert.ok(s.money < before);
  assert.ok(s.pending.adopt);
  assert.throws(() => act(s, 'adopt'), /läuft bereits/);
  s.plan.target = 0; // kein leibliches Kind dazwischen
  for (let i = 0; i < 160 && s.status === 'alive'; i++) { advance(w, s, 1); s.money = Math.max(s.money, 50000000); s.meters.fridge = 90; s.interrupts = []; }
  assert.strictEqual(s.children.length, 1);
  assert.ok(s.children[0].born < s.day, 'adoptiertes Kind ist nicht neugeboren');
  assert.ok(!s.pending.adopt);
});

test('Adoption nur für verheiratete Paare aus Mann und Frau', () => {
  assert.match(adoptionBlock(couple('m', 'm'), 8), /Mann und Frau/);
  const s = couple('f', 'm'); s.partner.married = false;
  assert.match(adoptionBlock(s, 8), /verheiratet/);
  const t = couple('m', 'f'); t.housing = { type: 'rent', cityId: t.cityId, base: 100, rooms: 1 };
  assert.match(adoptionBlock(t, 8), /Platz/);
});
