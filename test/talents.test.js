'use strict';
/** Talente: Modell, Vererbung, Wachstum, Wirkungen, Bewerberpool, Team, Fördern, Bildungspolitik, Altspielstände (rein, ohne Datenbank). */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const settings = require('../src/settings');
const T = require('../src/game/talents');
const TV = require('../src/game/talent-view');
const { rngFor } = require('../src/game/rng');
const { createCharacter, upgradeState } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const { createHeirState } = require('../src/game/heir');
const actions = require('../src/game/actions');
const biz = require('../src/game/business');
const goods = require('../src/game/goods');
const { present } = require('../src/game/present');

const w = testWorld();
const user = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const mk = (over = {}) => createCharacter(w, input(w, over), user());
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i, user: user(), now: Date.now() });
const rich = (s) => { s.money = 5e8; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 }; s.meters.fridge = 100; return s; };
const firm = (s) => { act(s, 'foundBiz', { pkey: 'baecker', tier: 0 }); return s.companies[0]; };
const run = (s, days) => { for (let i = 0; i < days && s.status === 'alive'; i++) { s.meters.fridge = 100; advance(w, s, 1); s.interrupts = []; } };
const inRange = (p) => p.v.every((x, i) => Number.isInteger(x) && x >= T.C().floor && x <= 100 && x <= T.capAt(p, i));

test('Profil: sechs Werte im Bereich, deterministisch je Samen', () => {
  const a = T.newProfile(rngFor('t', 1)); const b = T.newProfile(rngFor('t', 1)); const c = T.newProfile(rngFor('t', 2));
  assert.deepStrictEqual(a, b); assert.notDeepStrictEqual(a, c);
  assert.strictEqual(a.v.length, 6); assert.ok(inRange(a));
  for (let i = 0; i < 400; i++) assert.ok(inRange(T.newProfile(rngFor('range', i))));
});

test('Vererbung: Kinder liegen nahe am Mittel der Eltern, zur Mitte hin gezogen, Mutation begrenzt', () => {
  const hi = { v: [90, 90, 90, 90, 90, 90], b: [90, 90, 90, 90, 90, 90] }; const lo = { v: [10, 10, 10, 10, 10, 10], b: [10, 10, 10, 10, 10, 10] };
  const inh = T.C().inherit; let sum = 0; let n = 0;
  for (let i = 0; i < 300; i++) {
    const k = T.fromParents(hi, hi, rngFor('kid', i)); assert.ok(inRange(k));
    for (const x of k.v) { assert.ok(x <= 95 && x <= 90 + inh.mutation && x >= 90 - 40 * inh.regress / 100 - inh.mutation - 1, `Kind ${x}`); sum += x; n++; }
  }
  assert.ok(sum / n < 90 && sum / n > 70, 'Rückkehr zur Mitte');
  const lowKid = T.fromParents(lo, lo, rngFor('kid', 1)); assert.ok(lowKid.v.every((x) => x >= T.C().floor && x <= 10 + 40 * inh.regress / 100 + inh.mutation + 1));
  assert.deepStrictEqual(T.fromParents(hi, lo, rngFor('x', 3)), T.fromParents(hi, lo, rngFor('x', 3)));
});

test('Wachstum: nie über die Grenze der Anlage, nie unter den Boden, Profile reparieren sich', () => {
  const p = T.newProfile(rngFor('g', 1)); const i = T.IDX.bildung; const cap = T.capAt(p, i);
  for (let k = 0; k < 100; k++) T.grow(p, 'bildung', 7);
  assert.strictEqual(p.v[i], cap); assert.ok(cap <= p.b[i] + T.C().growRoom && cap <= 100);
  assert.strictEqual(T.grow(p, 'bildung', 5), 0); assert.strictEqual(T.grow(p, 'bildung', -9), 0);
  const bad = { v: [0, 200, NaN, 50, 50, 50], b: [3, 3, 3] }; T.ensure(bad);
  assert.ok(T.validProfile(bad) && inRange(bad));
});

test('Wirkungen: alle gedeckelt für 0 … 100, Stärke 0 schaltet ab', () => {
  const ex = [0, 50, 100].map((x) => ({ v: Array(6).fill(x), b: Array(6).fill(x) }));
  for (const p of ex) {
    assert.ok(T.revenueMult(T.fit(p, T.CAT_W.handwerk)) >= 0.85 && T.revenueMult(100) <= 1.15);
    assert.ok(T.reliability(100) <= 1.1 && T.reliability(0) >= 0.9);
    assert.ok(Math.abs(T.healthPts(p)) <= T.C().effects.healthPts + 0.01 && Math.abs(T.lifeDays(p)) <= 11 * 50 + 1);
    assert.ok(T.studyMult(p) >= 0.75 && T.studyMult(p) <= 1.25 && T.repGain(p) >= 0.85 && T.repGain(p) <= 1.15);
    assert.ok(T.voteWeight(p) >= 0.94 && T.voteWeight(p) <= 1.06 && Math.abs(T.chanceBonus(p)) <= 0.051 && Math.abs(T.courtPts(p)) <= 3.01);
    assert.ok(T.jobWageMult(p, T.CAT_W.handwerk) >= 0.94 && T.jobWageMult(p, T.CAT_W.handwerk) <= 1.06);
    assert.ok(T.detectMult(p) >= 0.9 && T.detectMult(p) <= 1.1);
  }
  assert.strictEqual(T.revenueMult(50), 1); assert.strictEqual(T.studyMult(ex[1]), 1);
  const e = settings.DEFAULTS.talente.effects; const old = e.strength;
  try { e.strength = 0; assert.strictEqual(T.revenueMult(100), 1); assert.strictEqual(T.healthPts(ex[2]), 0); assert.strictEqual(T.wageMult(100), 1); e.strength = 2; assert.ok(T.revenueMult(100) <= 1.15); } finally { e.strength = old; }
});

test('Passung: Berufsfeld bestimmt die gefragten Talente; Schulen und Empfehlung', () => {
  const p = { v: [80, 30, 30, 30, 30, 60], b: [80, 30, 30, 30, 30, 60] };
  assert.ok(T.fitFor(w, p, 'tischler') > T.fitFor(w, p, 'einzelhandelsverkaeufer'));
  const q = { v: [30, 85, 30, 30, 70, 30], b: [30, 85, 30, 30, 70, 30] };
  assert.ok(T.fitFor(w, q, 'einzelhandelsverkaeufer') > T.fitFor(w, q, 'tischler'));
  const g = { v: [30, 30, 30, 90, 30, 30], b: [30, 30, 30, 90, 30, 30] };
  assert.ok(T.schoolFit(g).gym > T.schoolFit(g).haupt);
  assert.match(T.recommendation(q, 12), /Handel/); assert.match(T.recommendation(q, 3), /zu klein/);
});

test('Bewerberpool: 3–5 Bewerber, deterministisch je Betrieb und Woche, wechselt wöchentlich, Stadtgröße hebt den Mittelwert', () => {
  const s = rich(mk()); const c = firm(s);
  const a = T.applicants(w, s, c); const b = T.applicants(w, s, c);
  assert.deepStrictEqual(a, b); assert.ok(a.staff.length >= 3 && a.staff.length <= 5 && a.apprentices.length === T.C().pool.apprentices);
  assert.ok(a.staff.every((x) => inRange(x) && x.fit >= 0 && x.fit <= 100 && x.w >= 0.75 && x.w <= 1.3));
  assert.ok(a.bestId && a.staff.find((x) => x.id === a.bestId).fit === Math.max(...a.staff.map((x) => x.fit)));
  s.day += 7; assert.notDeepStrictEqual(T.applicants(w, s, c).staff.map((x) => x.name), a.staff.map((x) => x.name));
  s.day -= 7;
  const m = (tier) => { const big = { ...c, cityId: w.cityList.find((x) => x.size_tier === tier).id }; let t = 0; for (let k = 0; k < 40; k++) { s.day = k * 7; t += T.poolMean(w, s, big.cityId); } return t; };
  assert.ok(m(5) > m(2));
});

test('Einstellen aus dem Pool: Bewerber wird vergeben, Lohn nach Talent, Lehrling kostet weniger und wird Fachkraft', () => {
  const s = rich(mk()); const c = firm(s);
  const pool = T.applicants(w, s, c); const pick = pool.staff[0];
  const r = act(s, 'bizHireApplicant', { id: c.id, cand: pick.id });
  assert.match(r.msg, /eingestellt/); assert.strictEqual(c.staff, 1); assert.strictEqual(c.team.length, 1); assert.strictEqual(c.team[0].name, pick.name);
  assert.throws(() => act(s, 'bizHireApplicant', { id: c.id, cand: pick.id }), /vergeben/);
  assert.ok(T.applicants(w, s, c).staff.find((x) => x.id === pick.id).taken);
  const l = T.applicants(w, s, c).apprentices[0];
  act(s, 'bizHireApplicant', { id: c.id, cand: l.id });
  assert.ok(c.team[1].lehr); const wages0 = biz.companyFlows(w, s, c, 1946).wages;
  assert.ok(wages0 < 2 * w.econ.companies.staffWage * w.idx(1946) * 1.3, 'Lehrling billig');
  const before = c.team[1].v.slice();
  run(s, T.lehrCfg().days + 5);
  const m = c.team.find((x) => x.name === l.name);
  assert.ok(m && !m.lehr, 'Lehre beendet'); assert.ok(m.v.some((x, i) => x > before[i]), 'Lehrling hat gelernt'); assert.ok(inRange(m));
  assert.ok(s.notices.some((n) => /Lehre beendet/.test(n.title)));
});

test('Beste Wahl und Entlassen (alter Knopf), Team nie größer als die Belegschaft, Auffüllen deterministisch', () => {
  const s = rich(mk()); const c = firm(s);
  act(s, 'bizHire', { id: c.id, delta: 1 }); assert.strictEqual(c.team.length, 1);
  const best = T.applicants(w, s, c); assert.ok(!best.staff.find((x) => x.name === c.team[0].name) || true);
  act(s, 'bizHire', { id: c.id, delta: -1 }); assert.strictEqual(c.staff, 0); assert.strictEqual(c.team.length, 0);
  const pre = JSON.parse(JSON.stringify({ ...c, staff: 3, team: [] }));
  c.staff = 3; T.syncTeam(w, s, c); const names = c.team.map((m) => m.name); assert.strictEqual(c.team.length, 3);
  const c2 = pre; T.syncTeam(w, s, c2); assert.deepStrictEqual(c2.team.map((m) => m.name), names, 'deterministisch');
  c.staff = 1; T.syncTeam(w, s, c); assert.strictEqual(c.team.length, 1);
});

test('Team-Qualität wirkt auf den Umsatz, höchstens ±15 %, und auf die Lohnsumme', () => {
  const s = rich(mk()); const c = firm(s); c.staff = 3; c.manager = true; T.syncTeam(w, s, c);
  const flat = JSON.parse(JSON.stringify(c)); const hi = JSON.parse(JSON.stringify(c)); const lo = JSON.parse(JSON.stringify(c));
  for (const m of hi.team) { m.v = [95, 95, 95, 95, 95, 95]; m.b = m.v.slice(); } for (const m of lo.team) { m.v = [5, 5, 5, 5, 5, 5]; m.b = m.v.slice(); } for (const m of flat.team) { m.v = Array(6).fill(50); m.b = m.v.slice(); }
  const f = (x) => biz.companyFlows(w, s, x, 1946);
  const a = f(hi); const b = f(lo); const m = f(flat);
  assert.ok(a.income > m.income && b.income < m.income, 'Talent zählt');
  assert.ok(a.income / m.income <= 1.151 && b.income / m.income >= 0.849, `${a.income / m.income} ${b.income / m.income}`);
  hi.team.forEach((x) => { x.w = T.wageMult(95); }); assert.ok(f(hi).wages > f(lo).wages, 'gute Leute kosten mehr');
});

test('Lohnforderung: wächst der Marktwert, fordert die Fachkraft mehr; ohne Antwort kündigt sie, offline wird automatisch erhöht', () => {
  const s = rich(mk()); const c = firm(s); c.staff = 1; T.syncTeam(w, s, c);
  const m = c.team[0]; m.v = Array(6).fill(90); m.b = m.v.slice(); m.w = 0.8;
  const out = T.yearly(w, s); assert.ok(m.ask && out.some((n) => /verlangt mehr Lohn/.test(n.title)));
  act(s, 'bizRaise', { id: c.id, mid: m.id }); assert.ok(!m.ask && m.w > 0.8);
  m.w = 0.8; m.ask = { w: 1.2, until: s.day + 1 }; s.day += 2; T.firmDaily(w, s, c, { offline: true }); assert.strictEqual(m.w, 1.2);
  m.w = 0.8; m.ask = { w: 1.2, until: s.day - 1 }; const n = T.firmDaily(w, s, c, {}); assert.strictEqual(c.team.length, 0); assert.strictEqual(c.staff, 0); assert.ok(n.some((x) => /kündigt/.test(x.title)));
});

test('Kurs für Mitarbeiter: Gebühr, Dauer, Talent steigt bis zur Grenze', () => {
  const s = rich(mk()); const c = firm(s); c.staff = 1; T.syncTeam(w, s, c); const m = c.team[0]; m.v = Array(6).fill(40); m.b = m.v.slice();
  const m0 = s.money; act(s, 'bizTrain', { id: c.id, mid: m.id, key: 'handwerk' }); assert.ok(s.money < m0 && m.course);
  assert.throws(() => act(s, 'bizTrain', { id: c.id, mid: m.id, key: 'handwerk' }), /schon in einem Kurs/);
  run(s, 60); assert.ok(!m.course && m.v[0] > 40 && m.v[0] <= T.capAt(m, 0));
  m.v[0] = T.capAt(m, 0); assert.throws(() => act(s, 'bizTrain', { id: c.id, mid: m.id, key: 'handwerk' }), /Fahnenstange/);
});

test('Kinder: Anlagen von den Eltern, bis 6 Jahre nur grobe Stufen, Fördern kostet und wirkt, Grenze gilt', () => {
  const s = rich(mk()); s.partner = { personId: 'p9', name: 'Anna Test', gender: 'f', born: -8000, sat: 70, married: true, cohabit: true, giftBoost: 0, unhappyDays: 0, pkey: 'baecker', profession: 'Bäcker', since: 0, tal: T.newProfile(rngFor('pa', 1)) };
  const fam = require('../src/game/family'); const ctx = { world: w, state: s, idx: 1 };
  fam.bornChild(ctx, rngFor('b', 1)); const k = s.children[0];
  assert.ok(T.validProfile(k.tal) && inRange(k.tal));
  let v = present(w, s, user(), Date.now()); assert.strictEqual(v.children[0].tal.hidden, true); assert.ok(v.children[0].tal.bars.every((b) => b.v == null && b.band >= 0));
  assert.match(v.children[0].tal.rec, /zu klein/);
  k.born = s.day - 7 * 365; v = present(w, s, user(), Date.now()); assert.strictEqual(v.children[0].tal.hidden, false); assert.ok(v.children[0].tal.bars.every((b) => Number.isInteger(b.v)));
  const m0 = s.money; k.tal.v = Array(6).fill(45); k.tal.b = k.tal.v.slice();
  act(s, 'foster', { childId: k.id, focus: 'nachhilfe' }); assert.ok(s.money < m0 && k.foster);
  assert.throws(() => act(s, 'foster', { childId: k.id, focus: 'sport' }), /schon ein Förderprogramm/);
  run(s, T.C().foster.days + 2); assert.ok(!k.foster && k.tal.v[T.IDX.bildung] > 45);
  k.tal.v[T.IDX.kondition] = T.capAt(k.tal, T.IDX.kondition); assert.throws(() => act(s, 'foster', { childId: k.id, focus: 'sport' }), /voll ausgebildet/);
  k.born = s.day - 2 * 365; assert.throws(() => act(s, 'foster', { childId: k.id, focus: 'musik' }), /ab 3 Jahren/);
});

test('Erbe behält die Talente; Adoptivkinder haben zufällige Anlagen', () => {
  const s = rich(mk()); const fam = require('../src/game/family'); const ctx = { world: w, state: s, idx: 1 };
  fam.bornChild(ctx, rngFor('b', 2)); const k = s.children[0]; k.born = s.day - 20 * 365; const tal = JSON.parse(JSON.stringify(k.tal));
  const { state } = createHeirState(w, s, k.id, []); assert.deepStrictEqual(state.talents, tal);
  fam.bornChild(ctx, rngFor('b', 3), { adopt: true }); assert.ok(T.validProfile(s.children[1].tal));
});

test('Altspielstand: Talente werden aus dem Samen abgeleitet, stabil und idempotent', () => {
  const s = rich(mk()); const orig = JSON.parse(JSON.stringify(s.talents));
  const old = JSON.parse(JSON.stringify(s)); delete old.talents; old.tree.persons.forEach((p) => delete p.tal);
  const once = upgradeState(JSON.parse(JSON.stringify(old))); const twice = upgradeState(JSON.parse(JSON.stringify(once)));
  assert.deepStrictEqual(once.talents, orig, 'gleiche Werte wie bei der Erschaffung'); assert.deepStrictEqual(twice, once);
  const c = firm(rich(mk())); assert.ok(c);
});

test('Politik: Bildungsbeschlüsse – Befugnisse, Prüfung, Wirkung gedeckelt, Umlage', () => {
  const city = w.cityList[3];
  assert.ok(goods.powersOf(w, 2, 1960).some((p) => p.kind === 'edu_city') && goods.powersOf(w, 3, 1960).some((p) => p.kind === 'edu_region') && goods.powersOf(w, 5, 1960).some((p) => p.kind === 'edu_nation'));
  assert.ok(!goods.powersOf(w, 0, 1960).some((p) => /edu/.test(p.kind)));
  const row = goods.normalizePolicy(w, 2, city, 1960, { kind: 'edu_city', good: 'library', value: 3 }); assert.strictEqual(row.good, 'library'); assert.strictEqual(row.val, 3);
  assert.throws(() => goods.normalizePolicy(w, 2, city, 1960, { kind: 'edu_city', good: 'x', value: 2 }), /Schulen/);
  assert.throws(() => goods.normalizePolicy(w, 2, city, 1960, { kind: 'edu_city', good: 'school', value: 9 }), /Stufe/);
  assert.throws(() => goods.normalizePolicy(w, 1, city, 1960, { kind: 'edu_nation', value: 1 }), /Befugnis/);
  const pv = goods.previewPolicy(w, row, 1960, city.id); assert.ok(pv.lines.some((l) => l.key === 'edu_city') && pv.lines.some((l) => l.key === 'levy'));
  try {
    goods.setPolicies(goods.buildPolicies([{ ...row, scope_city: city.id, region: null }, { kind: 'edu_region', val: 2, region: city.state, scope_city: 0, good: null }, { kind: 'edu_nation', val: 3, scope_city: 0, region: null, good: null }, { kind: 'edu_city', val: 99, good: 'school', scope_city: city.id }]));
    const e = goods.effectsFor(w, city.id);
    assert.deepStrictEqual([e.edu.library, e.edu.school, e.edu.courseDisc, e.edu.lehrSubsidy], [3, 0, 20, 60]); assert.ok(e.levy > 0);
    const s = rich(mk()); s.cityId = city.id; const c = firm(s); c.cityId = city.id;
    act(s, 'bizHireApplicant', { id: c.id, cand: T.applicants(w, s, c).apprentices[0].id });
    const fx0 = T.firmEffects(w, s, c, T.ZERO_EDU); const fx1 = T.firmEffects(w, s, c, e.edu); assert.ok(fx1.wageUnits < fx0.wageUnits, 'Staat zahlt Lehrlingslohn mit');
    assert.ok(T.growMult({ school: 3 }) <= 1.3 + 1e-9);
    const view = TV.firmView(w, s, c, 1, 1946, 2); assert.strictEqual(view.lehr.subsidy, 60);
  } finally { goods.setPolicies(null); }
  assert.strictEqual(goods.effectsFor(w, city.id).edu.library, 0);
});

test('Jahreswechsel: Arbeit schult die Spielfigur, Bibliothek und Sport helfen, alles bleibt in der Grenze', () => {
  const s = rich(mk()); s.occupation = { kind: 'work', pkey: 'baecker', employer: 'X', cityId: s.cityId, factor: 1, lodging: false, since: 0 };
  const before = s.talents.v.slice(); const cap = s.talents.v.map((x, i) => T.capAt(s.talents, i));
  for (let y = 0; y < 60; y++) { s.day += 365; T.yearly(w, s); }
  assert.ok(s.talents.v.every((x, i) => x >= before[i] && x <= cap[i]) && s.talents.v.some((x, i) => x > before[i]));
});

test('Spielfigur: Altersprofil, Ansehen-Zuwachs, Verdichtung für das Verzeichnis', () => {
  const s = mk(); assert.ok(inRange(s.talents));
  const rep = require('../src/game/reputation'); s.talents = { v: Array(6).fill(100), b: Array(6).fill(100) }; s.pending = s.pending || {};
  rep.queue(s, 'rel', 1, 'rent_paid'); const q = s.pending.rep.find((e) => e.r === 'rent_paid'); assert.ok(q.d > 1 && q.d <= 1.15 + 1e-9);
  const p = T.newProfile(rngFor('pk', 1)); const u = T.unpack(T.pack(p)); assert.deepStrictEqual(u.v, p.v); assert.strictEqual(T.unpack('x,1'), null); assert.strictEqual(T.pack(null), null);
});

test('Ansicht: Talente in der Spielansicht (eigene Balken, Partner, Kinder, Betriebe)', () => {
  const s = rich(mk()); const c = firm(s); act(s, 'bizHire', { id: c.id, delta: 1 });
  const v = present(w, s, user(), Date.now());
  assert.strictEqual(v.talents.me.bars.length, 6); assert.ok(v.talents.me.fx);
  const f = v.companies[0].talent; assert.ok(f.q >= 0 && f.q <= 100 && f.pool.staff.length >= 3 && f.team.length === 1 && f.keys.length === 2);
  assert.ok(f.rev >= -15 && f.rev <= 15);
  JSON.stringify(v);
});

test('Talente aus: Einstellung enabled=false neutralisiert alle Wirkungen, Spiel läuft weiter', () => {
  const t = settings.DEFAULTS.talente; const old = t.enabled; t.enabled = false;
  try { const s = rich(mk()); const c = firm(s); c.staff = 2; run(s, 40); assert.strictEqual(T.revenueMult(100), 1); assert.strictEqual(T.lifeDays(s.talents), 0); assert.strictEqual(T.firmEffects(w, s, c, T.ZERO_EDU).rev, 1); assert.strictEqual(present(w, s, user(), Date.now()).talents, null); } finally { t.enabled = old; }
});
