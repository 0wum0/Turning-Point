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

test('Spielerjobs: Lohn des Mitarbeiters und Lohnkosten/Produktivität im Betrieb', () => {
  const biz = require('../src/game/business');
  const { dailyFlows } = require('../src/game/core');
  const s = mk(); s.money = 2e7; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 };
  s.occupation = { kind: 'work', pkey: 'baecker', employer: 'X · Y', cityId: s.cityId, factor: 1, since: 0, playerJob: true, wage: 900 };
  const f = dailyFlows(w, s);
  assert.strictEqual(f.inc.wage, Math.round(900 * w.idx(1945)), 'vereinbarter Lohn');
  const c = { id: 1, pkey: 'baecker', tier: 0, name: 'T', cityId: s.cityId, rooms: 3, staff: 0, manager: false, cash: 0, base: 1000000, abandoned: null };
  const base = biz.companyFlows(w, s, c, 1945);
  c.playerStaff = [{ userId: 9, wage: 900 }]; c.playerManager = { userId: 8, wage: 1200 };
  const withPlayers = biz.companyFlows(w, s, c, 1945);
  assert.ok(withPlayers.efficiency > base.efficiency, 'mehr Mitarbeiter = effizienter');
  assert.ok(withPlayers.wages >= Math.round((900 + 1200) * w.idx(1945)), 'Lohnkosten der Spieler');
});

test('Ehepartner (Spieler) erbt einen Anteil am Bargeld', () => {
  const { endLife } = require('../src/game/family');
  const s = mk(); s.money = 10000;
  s.partner = { personId: 'p9', name: 'Anna', gender: 'f', born: -8000, married: true, linked: true, userId: 42, coupleId: 1, sat: 70 };
  endLife({ world: w, state: s }, 'Alter', 'age');
  const share = s.pending.spouseShare;
  assert.ok(share && share.userId === 42 && share.real > 0);
  assert.strictEqual(s.money, 10000 - Math.floor(10000 * 30 / 100));
});
