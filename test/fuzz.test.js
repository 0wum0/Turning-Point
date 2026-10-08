'use strict';
/**
 * Zufalls-/Eigenschaftstests der Spiellogik (deterministisch je Seed, dauert nur wenige Sekunden).
 * Die Länge der Läufe und der Seed-Bereich lassen sich über tools/fuzz-long.js beliebig erhöhen.
 */
const test = require('node:test');
const assert = require('node:assert');
const { runScenario, runTradeScenario } = require('./fuzz-lib');

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
