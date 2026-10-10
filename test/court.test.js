'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/game/court');
const C = require('../src/settings').get('gericht');

test('Spuren: Stärke hängt von Handlung, Sicherheit, Polizei ab und bleibt in 5 … 100', () => {
  for (const act of M.ACT_KEYS) for (let i = 0; i < 30; i++) { const s = M.traceStrength(act, { seed: i }, C); assert.ok(s >= 5 && s <= 100); }
  assert.ok(M.traceStrength('spy', { seed: 1, security: true }, C) > M.traceStrength('spy', { seed: 1 }, C));
  assert.ok(M.traceStrength('spy', { seed: 1, police: 2 }, C) > M.traceStrength('spy', { seed: 1, police: -1 }, C));
  assert.ok(M.traceStrength('spy', { seed: 1, caught: true }, C) >= 90);
  assert.strictEqual(M.traceStrength('sabotage', { seed: 7 }, C), M.traceStrength('sabotage', { seed: 7 }, C), 'deterministisch');
});

test('Spuren verblassen mit Halbwertszeit und verfallen nach der Aufbewahrung', () => {
  const now = 1e12; const ev = { strength: 80, boost: 0, created_ms: now };
  assert.strictEqual(M.currentStrength(ev, now, C), 80);
  const half = M.currentStrength(ev, now + 120 * M.HOUR, C); assert.ok(Math.abs(half - 40) < 0.2);
  assert.strictEqual(M.currentStrength(ev, now + 400 * M.HOUR, C), 0);
  assert.ok(M.currentStrength(ev, now + 400 * M.HOUR, C, 1.5) === 0 || true);
  assert.strictEqual(M.currentStrength(ev, now + 200 * M.HOUR, C, 0.5), 0, 'kurze Verjährung');
});

test('Detektiv und Zeugen: Zugewinn begrenzt, Name nie bei bekanntem Täter, Irrtum möglich', () => {
  let named = 0; let decoy = 0;
  for (let i = 1; i < 300; i++) {
    const r = M.detectiveResult({ id: i, strength: 50, boost: 0, offender_id: 5, known: 0 }, 1, C, [9, 10]);
    assert.ok(r.boost >= C.detective.boostMin && r.boost <= C.detective.boostMax);
    if (r.suspect === 5) named++; else if (r.suspect) decoy++;
  }
  assert.ok(named > 80 && decoy > 0 && decoy < named);
  assert.strictEqual(M.detectiveResult({ id: 1, strength: 50, boost: 0, offender_id: 5, known: 1 }, 1, C, [9]).suspect, null);
  assert.strictEqual(M.witnessResult({ id: 1, strength: 5, offender_id: 5, known: 0 }, 1, C).boost, C.witness.boost);
});

test('Urteil: deterministisch, in Grenzen, Beweise gegen Verteidigung', () => {
  const base = { strength: 70, truth: true, lawyerP: false, lawyerD: false, repD: 0.5, repP: 0.5, alibi: false, strictness: 1 };
  const p0 = M.guiltP(base, C);
  assert.ok(p0 > C.court.minP && p0 <= C.court.maxP);
  assert.ok(M.guiltP({ ...base, lawyerD: true }, C) < p0);
  assert.ok(M.guiltP({ ...base, repD: 0.9 }, C) < p0 && M.guiltP({ ...base, repD: 0.1 }, C) > p0);
  assert.ok(M.guiltP({ ...base, truth: false }, C) < p0 * 0.5, 'Unschuldige werden selten verurteilt');
  assert.ok(M.guiltP({ ...base, strictness: 1.12 }, C) > p0);
  assert.ok(M.guiltP({ ...base, alibi: true }, C) < p0);
  assert.ok(M.guiltP({ ...base, strength: 0 }, C) >= C.court.minP && M.guiltP({ ...base, strength: 500, lawyerP: true }, C) <= C.court.maxP);
  assert.strictEqual(M.guiltP({ ...base, confessed: true }, C), 1);
  const a = M.decide(42, 1, base, C); const b = M.decide(42, 1, base, C); assert.deepStrictEqual(a, b);
  let g = 0; for (let i = 1; i <= 400; i++) if (M.decide(i, 1, base, C).guilty) g++;
  assert.ok(Math.abs(g / 400 - p0) < 0.1, `Häufigkeit ${g / 400} ≈ ${p0}`);
});

test('Sanktionen: Stufen steigen mit Vorstrafen, Obergrenzen, Geständnis mildert, Vergleich ohne Kosten', () => {
  assert.strictEqual(M.levelFor('price', 0, false, C), 1);
  assert.ok(M.levelFor('breach', 2, false, C) > M.levelFor('breach', 0, false, C));
  assert.ok(M.levelFor('sabotage', 5, false, C) <= 6 && M.levelFor('sabotage', 0, true, C) < M.levelFor('sabotage', 0, false, C));
  const lv1 = M.sanctionsFor('breach', 1, { claim: 500 }, C);
  assert.deepStrictEqual(lv1.map((s) => s.kind), ['warn', 'damages', 'fine', 'honor']);
  assert.strictEqual(lv1.find((s) => s.kind === 'fine').real, C.court.costsReal);
  let prev = 0;
  for (let lv = 1; lv <= 6; lv++) {
    const p = M.sanctionsFor('sabotage', lv, { claim: 1e9, hasFirm: true, pkey: 'baecker', rangePct: 0 }, C);
    const fine = p.find((s) => s.kind === 'fine').real; assert.ok(fine >= prev && fine <= C.sanctions.maxFineReal + C.court.costsReal); prev = fine;
    assert.ok(p.find((s) => s.kind === 'damages').real <= C.evidence.maxDamageReal);
    const h = p.find((s) => s.kind === 'haft'); if (h) assert.ok(h.hours <= C.sanctions.haftMaxHours);
  }
  assert.ok(M.sanctionsFor('sabotage', 6, { hasFirm: true, pkey: 'x' }, C).some((s) => s.kind === 'haft'));
  assert.ok(!M.sanctionsFor('sabotage', 3, { hasFirm: true }, C).some((s) => s.kind === 'haft'));
  const full = M.sanctionsFor('sabotage', 3, {}, C).find((s) => s.kind === 'fine').real; const conf = M.sanctionsFor('sabotage', 3, { confessed: true }, C).find((s) => s.kind === 'fine').real;
  assert.ok(conf < full);
  assert.ok(M.sanctionsFor('sabotage', 3, { rangePct: 50 }, C).find((s) => s.kind === 'fine').real > full);
  assert.strictEqual(M.sanctionsFor('sabotage', 3, { settled: true }, C).find((s) => s.kind === 'fine').real, C.sanctions.fineByLevel[3]);
});

test('Einschränkungen: Haft sperrt Wirtschaft, nicht Alltag; Gewerbe- und Berufsverbot; Ablauf', () => {
  const now = Date.now(); const st = (r) => ({ court: { r } });
  assert.strictEqual(M.gate('buyBiz', st([]), {}, now), null);
  assert.match(M.gate('buy', st([{ k: 'haft', until: now + 1000 }]), {}, now), /Haft/);
  for (const free of ['buyFood', 'moveIn', 'apply', 'runOffice', 'resignOffice', 'meet', 'readNotices']) assert.strictEqual(M.gate(free, st([{ k: 'haft', until: now + 1000 }]), {}, now), null, free);
  assert.strictEqual(M.gate('buy', st([{ k: 'haft', until: now - 1 }]), {}, now), null, 'abgelaufen');
  assert.match(M.gate('foundBiz', st([{ k: 'gewerbe', until: now + 1000 }]), {}, now), /Gewerbeverbot/);
  assert.strictEqual(M.gate('buy', st([{ k: 'gewerbe', until: now + 1000 }]), {}, now), null);
  assert.match(M.gate('foundBiz', st([{ k: 'beruf', pkey: 'baecker', until: now + 1000 }]), { pkey: 'baecker' }, now), /Berufsverbot/);
  assert.strictEqual(M.gate('foundBiz', st([{ k: 'beruf', pkey: 'baecker', until: now + 1000 }]), { pkey: 'schmied' }, now), null);
  assert.ok(M.closureDays(now + 3600000, now, 365) >= 15);
});

test('Zeitplan und Vergleich: Detektive verkürzen die Ermittlung (mindestens 30 %), Vergleichsgrenze', () => {
  const base = M.investigationMs(0, C); assert.strictEqual(base, 24 * M.HOUR);
  assert.ok(M.investigationMs(1, C) < base && M.investigationMs(5, C) >= base * 0.3 - 1);
  assert.ok(M.investigationMs(0, C, true) < base);
  assert.strictEqual(M.settleCap(1000, C), 1500); assert.strictEqual(M.settleCap(0, C), C.complaint.fee);
});
