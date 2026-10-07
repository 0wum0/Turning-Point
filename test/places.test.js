'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const actions = require('../src/game/actions');
const places = require('../src/game/places');

const w = testWorld();
const mk = () => { const s = createCharacter(w, input(w), { meta: {}, coins: 0 }); s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 3, name: 'Testwohnung' }; return s; };
const run = (s, name, inp, user, now) => actions.run(name, { world: w, state: s, input: inp, user, now });

test('Gebäudeliste: öffentliche Orte, eigene Wohnung, Eigentum, Betrieb, Arbeitgeber', () => {
  const s = mk();
  s.properties.push({ id: 1, kind: 'villa', name: 'Villa', cityId: s.cityId, rooms: 15, base: 1, condition: 80, closedUntil: 0 });
  s.companies.push({ id: 1, pkey: 'baecker', tier: 0, name: 'Bäckerei X', cityId: s.cityId, rooms: 3, staff: 0, manager: false, cash: 0, base: 1, abandoned: null });
  s.occupation = { kind: 'work', pkey: 'baecker', employer: 'Fremd GmbH', cityId: s.cityId, factor: 1, lodging: false, since: 0 };
  const keys = places.buildingsFor(w, s, s.cityId).map((b) => b.key);
  for (const k of ['rathaus', 'markt', 'bahnhof', 'home', 'prop:1', 'biz:1', 'work']) assert.ok(keys.includes(k), k);
  const other = w.cityList.find((c) => c.id !== s.cityId);
  const k2 = places.buildingsFor(w, s, other.id).map((b) => b.key);
  assert.ok(!k2.includes('home') && !k2.includes('work') && k2.includes('rathaus'));
});

test('Aufgabe: Start nötig, Mindestdauer, Belohnung, Abkühlzeit, Tageslimit', () => {
  const s = mk(); const user = { meta: {}, coins: 0 }; const t0 = Date.now();
  assert.throws(() => run(s, 'taskFinish', { building: 'rathaus', task: 'forms' }, user, t0), /nicht abgeschlossen/);
  run(s, 'taskStart', { building: 'rathaus', task: 'forms' }, user, t0);
  assert.throws(() => run(s, 'taskFinish', { building: 'rathaus', task: 'forms' }, user, t0 + 1000), /nicht abgeschlossen/);
  const r = run(s, 'taskFinish', { building: 'rathaus', task: 'forms' }, user, t0 + 7000);
  assert.ok(/EFS/.test(r.msg));
  assert.strictEqual(s.fx.efs, 10); assert.strictEqual(s.fx.influence, 1);
  assert.throws(() => run(s, 'taskStart', { building: 'rathaus', task: 'forms' }, user, t0 + 8000), /erst wieder/);
  run(s, 'taskStart', { building: 'rathaus', task: 'forms' }, user, t0 + 121 * 60000);
  user.meta.activeEfs = { date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(t0 + 121 * 60000 + 8000)), amount: 220 };
  const r2 = run(s, 'taskFinish', { building: 'rathaus', task: 'forms' }, user, t0 + 121 * 60000 + 8000);
  assert.ok(/Tageslimit/.test(r2.msg)); assert.strictEqual(s.fx.efs, 10);
});

test('Sofort-Aufgabe (Ausruhen) wirkt auf die Erholung; fremde Stadt/Kinder-Aufgabe gesperrt', () => {
  const s = mk(); const user = { meta: {}, coins: 0 }; const now = Date.now();
  s.meters.rest = 40;
  run(s, 'taskFinish', { building: 'home', task: 'rest' }, user, now);
  assert.ok(s.meters.rest >= 52);
  assert.throws(() => run(s, 'taskStart', { building: 'schule', task: 'help' }, user, now), /Kinder/);
  assert.throws(() => run(s, 'taskStart', { building: 'work', task: 'shift' }, user, now), /nicht/);
});
