'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const { edition } = require('../src/game/newspaper');
const { dailyFlows } = require('../src/game/core');

const w = testWorld();
const u = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i, user: u(), now: Date.now() });
const run = (s, d) => { for (let i = 0; i < d && s.status === 'alive'; i++) { s.meters.fridge = 100; advance(w, s, 1); s.interrupts = []; } };

test('Immobilie kaufen, vermieten, Mieter zahlt Miete; Preisregler wirkt', () => {
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), u());
  s.money = 50000000; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 };
  const sale = edition(w, s, s.cityId).housing.sale[0];
  assert.ok(sale.rentPerDay > 0);
  act(s, 'buy', { listingId: sale.id });
  const p = s.properties[0];
  act(s, 'letOn', { propertyId: p.id, mult: 0.6 });
  for (let i = 0; i < 40 && !p.lease.tenant; i++) run(s, 30); // Mieter kommen zufällig – bis zu 1200 Tage abwarten (sonst sporadischer Fehlschlag)
  assert.ok(p.lease.tenant, 'Mieter gefunden');
  run(s, 3); // der Mieter braucht mindestens einen Miettag (sonst total = 0, wenn er gerade erst eingezogen ist)
  p.closedUntil = 0; p.lease.tenant.arrears = 0; // Zufallsereignisse (Sturmschaden, Mietausfall) ausschließen
  const f = dailyFlows(w, s);
  assert.ok(f.inc.rent > 0, 'Mieteinnahmen in den Tagesflüssen');
  assert.ok(p.lease.total > 0);
  // Selbst bewohnte Immobilie lässt sich nicht vermieten, Einziehen bei Mieter gesperrt
  assert.throws(() => act(s, 'moveIn', { propertyId: p.id }), /vermietet/);
  act(s, 'letOff', { propertyId: p.id });
  assert.strictEqual(dailyFlows(w, s).inc.rent, 0);
  act(s, 'moveIn', { propertyId: p.id });
  assert.throws(() => act(s, 'letOn', { propertyId: p.id }), /bewohnst/);
});
