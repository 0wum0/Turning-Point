'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld } = require('./helpers');
const exchange = require('../src/lib/exchange');

const w = testWorld();

test('Fairer Kurs: Substanz- und Ertragswert, nie unter 40 % der Substanz', () => {
  assert.strictEqual(exchange.fairPerShare(1000000, 0, 1000), 500);
  assert.ok(exchange.fairPerShare(1000000, 1000, 1000) > 500);
  assert.ok(exchange.fairPerShare(1000000, -100000, 1000) >= 400);
});

test('Dividende wird aus der Firmenkasse gezogen und zur Verteilung vorgemerkt', () => {
  const state = { day: 100, startYear: 1945, pending: {} };
  const c = { cash: 10000, stock: { id: 7, divPct: 50 } };
  exchange.dividend({ world: w, state }, c, 4000);
  assert.strictEqual(c.cash, 8000);
  assert.strictEqual(state.pending.div.length, 1);
  assert.strictEqual(state.pending.div[0].stockId, 7);
  exchange.dividend({ world: w, state }, c, -50);
  assert.strictEqual(state.pending.div.length, 1);
});
