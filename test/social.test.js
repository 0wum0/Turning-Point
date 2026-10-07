'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const social = require('../src/lib/social');

const w = testWorld();
const mk = () => createCharacter(w, input(w, { professionKey: 'baecker' }), { meta: {}, coins: 0, efs_pool: 0 });

test('Ranglisten-Statistik ist inflationsbereinigt und enthält Betriebe', () => {
  const s = mk(); s.money = 5000000;
  const a = social.statsOf(w, s, { id: 7, username: 'x', meta: { influence: 12 } }, { id: 3 });
  assert.strictEqual(a.username, 'x'); assert.strictEqual(a.influence, 12); assert.ok(a.wealth > 0);
  // Dasselbe Vermögen in einer späteren Epoche (höherer Preisindex) ist real weniger wert
  const t = mk(); t.money = 5000000; t.day = 365 * 60;
  const b = social.statsOf(w, t, { id: 8, username: 'y', meta: {} }, { id: 4 });
  assert.ok(b.wealth < a.wealth, `${b.wealth} < ${a.wealth}`);
});

test('Chat-Filter maskiert Sperrwörter', () => {
  assert.strictEqual(social.mask('Du Idiot!'), 'Du *****!');
  assert.strictEqual(social.mask('Hallo zusammen'), 'Hallo zusammen');
});

test('Texte werden bereinigt und gekürzt', () => {
  assert.strictEqual(social.clean('  a\r\nb\u0000c  ', 10), 'a\nbc');
  assert.strictEqual(social.clean('x'.repeat(50), 10).length, 10);
});
