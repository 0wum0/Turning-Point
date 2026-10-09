#!/usr/bin/env node
'use strict';
/**
 * Langer Zufallslauf über die Spiellogik (siehe test/fuzz-lib.js). Beispiele:
 *   node tools/fuzz-long.js                       # Seeds 1..200, je 600 Schritte
 *   node tools/fuzz-long.js --from 500 --to 900 --steps 1500
 *   node tools/fuzz-long.js --seed 37 --steps 3000 --verbose   # einen Seed nachspielen
 * Ein Seed spielt deterministisch immer denselben Verlauf; die Fehlermeldung nennt Seed und die letzten Schritte.
 */
const { runScenario, runTradeScenario, runSupplyScenario, runCityEconScenario } = require('../test/fuzz-lib');

const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const flag = (name) => process.argv.includes(`--${name}`);
const one = arg('seed', null);
const from = one != null ? one : arg('from', 1);
const to = one != null ? one : arg('to', 200);
const steps = arg('steps', 600);

const seen = new Map();
const agg = { runs: 0, steps: 0, actionsOk: 0, actionsRejected: 0, deaths: 0, heirs: 0, gameovers: 0, maxYear: 0 };
const t0 = Date.now();
for (let seed = from; seed <= to; seed++) {
  const { failures, stats } = runScenario(seed, steps, { cityEcon: seed % 2 === 1 });
  agg.runs++; agg.steps += stats.steps; agg.actionsOk += stats.actionsOk; agg.actionsRejected += stats.actionsRejected;
  agg.deaths += stats.deaths; agg.heirs += stats.heirs; agg.gameovers += stats.gameovers; agg.maxYear = Math.max(agg.maxYear, stats.maxYear);
  for (const f of failures) {
    const key = String(f.msg).replace(/\d+/g, '#').slice(0, 120);
    if (!seen.has(key)) seen.set(key, { first: f, count: 0 });
    seen.get(key).count++;
    if (flag('verbose')) console.log(`Seed ${seed}: ${f.msg}\n  ${(f.trace || []).join('\n  ')}`);
  }
  if (seed % 25 === 0) process.stderr.write(`… Seed ${seed}\n`);
}
for (const f of runTradeScenario(from, 60)) { const key = `trade:${f.msg.slice(0, 80)}`; if (!seen.has(key)) seen.set(key, { first: f, count: 0 }); seen.get(key).count++; }
for (let seed = from; seed <= to; seed += 5) for (const f of runSupplyScenario(seed, 4)) { const key = `supply:${String(f.msg).replace(/\d+/g, '#').slice(0, 80)}`; if (!seen.has(key)) seen.set(key, { first: f, count: 0 }); seen.get(key).count++; }
for (let seed = from; seed <= to; seed += 5) for (const f of runCityEconScenario(seed, 20)) { const key = `cityecon:${String(f.msg).replace(/\d+/g, '#').slice(0, 80)}`; if (!seen.has(key)) seen.set(key, { first: f, count: 0 }); seen.get(key).count++; }

console.log(JSON.stringify({ ...agg, seconds: Math.round((Date.now() - t0) / 1000) }));
for (const [, v] of seen) console.log(`\n${v.count}× — Seed ${v.first.seed}: ${v.first.msg}\n  Spur: ${(v.first.trace || []).slice(-8).join('\n        ')}`);
if (seen.size) { console.log(`\n${seen.size} verschiedene Verletzungen.`); process.exit(1); }
console.log('Keine Verletzungen.');
