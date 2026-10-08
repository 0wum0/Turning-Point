'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const actions = require('../src/game/actions');
const { edition } = require('../src/game/newspaper');
const market = require('../src/lib/market');

const w = testWorld();
const u = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i, user: u(), now: Date.now() });

test('Immobilie wechselt den Besitzer (entnehmen → einsetzen), Bewohner zieht aus', () => {
  const a = createCharacter(w, input(w, { professionKey: 'baecker' }), u());
  const b = createCharacter(w, input(w, { professionKey: 'baecker' }), u());
  a.money = 90000000; a.housing = { type: 'rent', cityId: a.cityId, base: 70, rooms: 4 };
  act(a, 'buy', { listingId: edition(w, a, a.cityId).housing.sale[0].id });
  const id = a.properties[0].id;
  act(a, 'moveIn', { propertyId: id });
  assert.strictEqual(a.housing.type, 'own');
  const snap = market.detach(w, a, 'prop', id);
  assert.strictEqual(a.properties.length, 0);
  assert.strictEqual(a.housing.type, 'street', 'Verkäufer wohnt nicht mehr dort');
  const placed = market.attach(w, b, 'prop', snap);
  assert.strictEqual(b.properties.length, 1);
  assert.strictEqual(placed.name, snap.name);
  assert.ok(market.valueReal(w, b, 'prop', placed) > 0);
});

test('Betrieb: Firmenkasse bleibt beim Verkäufer, Käufer startet mit leerer Kasse', () => {
  const a = createCharacter(w, input(w, { professionKey: 'wirt' }), u());
  a.money = 90000000; a.housing = { type: 'rent', cityId: a.cityId, base: 70, rooms: 4 };
  const l = edition(w, a, a.cityId).biz.find((x) => x.pkey === 'wirt');
  act(a, 'buyBiz', { listingId: l.id });
  const c = a.companies[0]; c.cash = 5000; const before = a.money;
  const snap = market.detach(w, a, 'firm', c.id);
  assert.strictEqual(a.money, before + 5000);
  const b = createCharacter(w, input(w, { professionKey: 'wirt' }), u());
  const placed = market.attach(w, b, 'firm', snap);
  assert.strictEqual(placed.cash, 0);
  assert.strictEqual(b.companies.length, 1);
});
