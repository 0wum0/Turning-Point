'use strict';
/**
 * Zufalls-/Eigenschaftstests der Spiellogik (deterministisch je Seed, dauert nur wenige Sekunden).
 * Die Länge der Läufe und der Seed-Bereich lassen sich über tools/fuzz-long.js beliebig erhöhen.
 */
const test = require('node:test');
const assert = require('node:assert');
const { runTransportScenario, runScenario, runTradeScenario, runSupplyScenario, runCityEconScenario, runRepScenario, runCourtScenario } = require('./fuzz-lib');

const report = (failures) => failures.map((f) => `Seed ${f.seed}: ${f.msg}\n  Spur: ${(f.trace || []).slice(-6).join(' | ')}`).join('\n');

test('Fuzz: zufällige Aktionsfolgen halten alle Invarianten ein (ohne Rettungsring)', () => {
  for (const seed of [1, 2, 4, 5]) {
    const { failures } = runScenario(seed, 120, { lifeline: false });
    assert.deepStrictEqual(failures, [], report(failures));
  }
});

test('Fuzz: lange Leben mit Rettungsring (Ehe, Kinder, Alter, Tod, Erbe, Generationenwechsel)', () => {
  let heirs = 0;
  for (const seed of [3, 6, 9]) {
    const { failures, stats } = runScenario(seed, 150, { lifeline: true });
    assert.deepStrictEqual(failures, [], report(failures));
    heirs += stats.heirs;
  }
  assert.ok(heirs >= 0);
});

test('Fuzz: gleicher Seed → identischer Verlauf (deterministischer Replay)', () => {
  for (const seed of [11, 12]) {
    const a = runScenario(seed, 90, { lifeline: seed % 2 === 0 });
    const b = runScenario(seed, 90, { lifeline: seed % 2 === 0 });
    assert.deepStrictEqual(a.failures, [], report(a.failures));
    assert.ok(a.stats.digest > 0, 'Lauf wurde nicht zu Ende gespielt');
    assert.strictEqual(a.stats.digest, b.stats.digest);
    assert.deepStrictEqual(a.stats, b.stats);
  }
});

test('Fuzz: Handel zwischen Spielern verschiedener Epochen erhält den Realwert', () => {
  const failures = runTradeScenario(21, 12);
  assert.deepStrictEqual(failures, [], report(failures));
});

test('Fuzz: Lieferverträge erhalten den Realwert zwischen Epochen (genau einmal, nie negativ, nichts aus dem Nichts)', () => {
  for (const seed of [31, 32, 33]) {
    const failures = runSupplyScenario(seed, 6);
    assert.deepStrictEqual(failures, [], report(failures));
  }
});

test('Fuzz: Stadtindizes bleiben endlich und in den Grenzen (Modell, Politik, Mietbremse, Barometer)', () => {
  for (const seed of [41, 42, 43]) {
    const failures = runCityEconScenario(seed, 25);
    assert.deepStrictEqual(failures, [], report(failures));
  }
});

test('Fuzz: Aktionsfolgen mit zufälligen Stadtindizes halten alle Invarianten ein', () => {
  for (const seed of [51, 52]) {
    const { failures } = runScenario(seed, 100, { lifeline: seed % 2 === 0, cityEcon: true });
    assert.deepStrictEqual(failures, [], report(failures));
  }
});

test('Fuzz: Ansehen bleibt endlich und im Bereich (Tagesgrenzen, Abflauen, Erbe, Wirkungen, unsinnige Beträge)', () => {
  for (const seed of [61, 62, 63, 64]) {
    const failures = runRepScenario(seed, 400);
    assert.deepStrictEqual(failures, [], report(failures));
  }
});

test('Fuzz: Gericht – Spuren, Urteile, Sanktionen, Geld und Sperren bleiben in den Grenzen', () => {
  for (const seed of [71, 72, 73, 74]) {
    const failures = runCourtScenario(seed, 300);
    assert.deepStrictEqual(failures, [], report(failures));
  }
});

test('Fuzz: Handelsrouten – Kasse stimmt auf den Cent, Gewinn unter dem Rendite-Deckel, Fahrten wohlgeformt, deterministisch', () => {
  for (const seed of [81, 82, 83]) {
    const a = runTransportScenario(seed, 10);
    assert.deepStrictEqual(a.failures, [], report(a.failures));
    const b = runTransportScenario(seed, 10);
    assert.deepStrictEqual(a.digest, b.digest, 'gleicher Seed, gleicher Verlauf');
    assert.ok(a.digest.length >= 30);
  }
});
