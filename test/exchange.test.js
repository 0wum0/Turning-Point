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

const X = { makerSpreadPct: 5, makerSpreadStepPct: 0.5, makerSpreadMaxPct: 15, makerUserDailyReal: 200000, makerMinHoldMinutes: 60 };

test('Spread des Marktteilnehmers wächst mit den Geschäften des Tages und ist gedeckelt', () => {
  assert.strictEqual(exchange.makerSpreadPct(X, 0), 5);
  assert.strictEqual(exchange.makerSpreadPct(X, 4), 7);
  assert.strictEqual(exchange.makerSpreadPct(X, 1000), 15);
  assert.strictEqual(exchange.makerSpreadPct({ makerSpreadPct: 5 }, 30), 5, 'ohne Einstellung bleibt der Grundspread');
  assert.ok(exchange.makerSpreadPct(X, 3) > exchange.makerSpreadPct(X, 2));
});

test('Tageslimit beim Marktteilnehmer: Anteile, die noch in das Wertlimit passen', () => {
  assert.strictEqual(exchange.capShares(X, 0, 1000), 200);
  assert.strictEqual(exchange.capShares(X, 150000, 1000), 50);
  assert.strictEqual(exchange.capShares(X, 250000, 1000), 0);
  assert.strictEqual(exchange.capShares({ makerUserDailyReal: 0 }, 1e9, 1000), Infinity, '0 heißt kein Limit');
  assert.strictEqual(exchange.capShares(X, 199999, 1000), 0, 'ein Anteil passt nicht mehr hinein');
});

test('Haltefrist: frisch gekaufte Anteile sind für den Rückverkauf an den Marktteilnehmer gesperrt', () => {
  assert.strictEqual(exchange.sellableToMaker(100, 0), 100);
  assert.strictEqual(exchange.sellableToMaker(100, 30), 70);
  assert.strictEqual(exchange.sellableToMaker(100, 500), 0);
  assert.strictEqual(exchange.sellableToMaker(0, 10), 0);
});

test('Scheinhandel: Orders von Konten mit gleicher IP werden ausgefiltert', () => {
  const book = [{ id: 1, user_id: 5 }, { id: 2, user_id: 6 }, { id: 3, user_id: 5 }, { id: 4, user_id: 7 }];
  assert.deepStrictEqual(exchange.dropWash(book, new Set([5])).map((o) => o.id), [2, 4]);
  assert.deepStrictEqual(exchange.dropWash(book, [6, 7]).map((o) => o.id), [1, 3]);
  assert.strictEqual(exchange.dropWash(book, new Set()).length, 4);
});

test('Börsen-Einstellungen enthalten die Grenzen mit sinnvollen Standardwerten', () => {
  const E = require('../src/settings').get('exchange');
  assert.ok(E.makerUserDailyReal > 0 && E.makerMinHoldMinutes >= 1 && E.makerSpreadStepPct > 0 && E.makerSpreadMaxPct >= E.makerSpreadPct && E.blockSameIp === true);
});
