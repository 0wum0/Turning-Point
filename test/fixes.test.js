'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const actions = require('../src/game/actions');
const { advance } = require('../src/game/engine');
const { edition } = require('../src/game/newspaper');
const biz = require('../src/game/business');
const contractors = require('../src/game/contractors');

const w = testWorld();
const u = (id = 1) => ({ id, meta: {}, coins: 50, efs_pool: 0 });
const act = (s, n, i, user) => actions.run(n, { world: w, state: s, input: i || {}, user: user || u(), now: Date.now() });

test('Butler füllt den Kühlschrank ein Jahr lang, ohne dass Hunger entsteht', () => {
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), u());
  s.money = 900000000; s.housing = { type: 'own', cityId: s.cityId, propertyId: 1 };
  s.properties = [{ id: 1, kind: 'villa', name: 'Villa', cityId: s.cityId, rooms: 15, base: 5000000, condition: 100, closedUntil: 0, bought: 0 }];
  s.butler = { perDay: 600, since: 0 }; s.meters.fridge = 100;
  let hungry = 0;
  for (let d = 0; d < 365 && s.status === 'alive'; d++) { advance(w, s, 1); s.interrupts = []; if (s.hunger > 0) hungry++; s.meters.wellbeing = 80; s.meters.rest = 80; }
  assert.strictEqual(hungry, 0);
  assert.ok(s.money < 900000000, 'Einkäufe wurden bezahlt');
});

test('Betrieb mit nötigem Personal und Manager arbeitet im Plus', () => {
  for (const [pkey, tier] of [['wirt', 0], ['wirt', 1], ['baecker', 2]]) {
    const s = createCharacter(w, input(w, { professionKey: 'wirt' }), u());
    const t = biz.tiersOf(w)[tier];
    const c = { id: 1, pkey, tier, name: 'X', cityId: s.cityId, rooms: t.rooms, staff: 0, manager: true, cash: 0, base: t.price, since: 0, abandoned: null };
    c.staff = biz.staffNeeded(w, c); s.companies = [c];
    const f = biz.companyFlows(w, s, c, 1946);
    assert.ok(f.profit > 0, `Stufe ${tier}: Gewinn ${f.profit}`);
  }
});

test('Reparatur beauftragt eine Baufirma der Stadt, die Rechnung geht an ihre Firmenkasse', () => {
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), u(1));
  s.money = 900000000;
  s.properties = [{ id: 1, kind: 'house_large', name: 'Haus', cityId: s.cityId, rooms: 8, base: 4500000, condition: 80, closedUntil: s.day + 100, bought: 0 }];
  contractors.set([{ user_id: 99, company_id: 5, name: 'Bau Müller', city_id: s.cityId }]);
  const before = s.money; const out = act(s, 'repair', { propertyId: 1 }, u(1));
  assert.match(out.msg, /Bau Müller/);
  assert.ok(s.money < before);
  assert.strictEqual(s.properties[0].closedUntil, s.day + 10);
  assert.strictEqual(s.pending.jobs.length, 1);
  assert.strictEqual(s.pending.jobs[0].to.userId, 99);
  contractors.set([]);
  const s2 = createCharacter(w, input(w, { professionKey: 'baecker' }), u(2)); s2.money = 900000000;
  s2.properties = [{ id: 1, kind: 'house_large', name: 'Haus', cityId: s2.cityId, rooms: 8, base: 4500000, condition: 80, closedUntil: s2.day + 100, bought: 0 }];
  assert.match(act(s2, 'repair', { propertyId: 1 }, u(2)).msg, /städtischer/);
});

test('Hochwertiges Essen sättigt länger als minderwertiges', () => {
  const { satiety } = require('../src/game/core');
  assert.ok(satiety(1) > satiety(2) && satiety(2) > satiety(3) && satiety(3) > satiety(4));
  const lasts = (q) => 100 / (10 * satiety(q));
  assert.ok(lasts(4) > lasts(1) * 1.5);
});
