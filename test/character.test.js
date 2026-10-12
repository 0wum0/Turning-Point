'use strict';
/** Charakterblatt: Erfahrung (Quellen, Deckel, Kosten, Verteilung), Ausstattung (Preise, Epochen, Abnutzung, Wiederverkauf, Dienste, Wirkungen), Rang, Erbe, Altstände (rein, ohne Datenbank). */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const settings = require('../src/settings');
const CH = require('../src/game/character');
const D = require('../src/game/character-defaults');
const TL = require('../src/game/talents');
const { createCharacter, upgradeState } = require('../src/game/state');
const { createHeirState } = require('../src/game/heir');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const { present } = require('../src/game/present');
const { edition } = require('../src/game/newspaper');
const family = require('../src/game/family');
const { rngFor } = require('../src/game/rng');

const w = testWorld();
const user = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const mk = (over = {}) => createCharacter(w, input(w, over), user());
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i, user: user(), now: Date.now() });
const fails = (s, n, i, re) => assert.throws(() => act(s, n, i), re || /./);
const yearOf = (s) => s.startYear + Math.floor(s.day / 365);
const rich = (s, year = 1990) => { s.day = (year - 1945) * 365 + 100; s.money = 5e9; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 }; s.meters.fridge = 100; s.skills.days.baecker = 4000; return s; };
const run = (s, days, keepRich = true) => { for (let i = 0; i < days && s.status === 'alive'; i++) { s.meters.fridge = 100; s.meters.health = 100; if (keepRich) s.money = Math.max(s.money, 1e9); advance(w, s, 1); s.interrupts = []; } };
const withCfg = (fn) => { const save = JSON.stringify(settings.DEFAULTS.charakter); try { fn(settings.DEFAULTS.charakter); } finally { const o = JSON.parse(save); for (const k of Object.keys(settings.DEFAULTS.charakter)) delete settings.DEFAULTS.charakter[k]; Object.assign(settings.DEFAULTS.charakter, o); } };
const wage = (s) => Math.round(w.econ.companies.staffWage * w.idx(yearOf(s)));

test('Standardwerte: sieben Plätze, steigende Preise und Auftreten, sieben Ränge, Quellen mit Deckel; keine Waffen', () => {
  assert.deepStrictEqual(CH.SLOTS, ['kleidung', 'uhr', 'schmuck', 'fahrzeug', 'mittel', 'pflege', 'schutz']);
  for (const k of ['kleidung', 'uhr', 'schmuck', 'fahrzeug', 'mittel']) {
    const L = D.gear.items[k].levels; assert.strictEqual(L.length, 3);
    for (let i = 1; i < 3; i++) { assert.ok(L[i].costDays > L[i - 1].costDays && L[i].look > L[i - 1].look, k); }
  }
  for (const k of ['pflege', 'schutz']) { const L = D.gear.items[k].levels; assert.strictEqual(L.length, 2); assert.ok(L[1].dayDays > L[0].dayDays); }
  const maxLook = CH.SLOTS.reduce((a, k) => a + Math.max(...D.gear.items[k].levels.map((l) => l.look)), 0); assert.strictEqual(maxLook, 100, 'Auftreten höchstens 100');
  assert.strictEqual(D.rank.ranks.length, 7); assert.strictEqual(D.rank.ranks[0].at, 0);
  for (let i = 1; i < 7; i++) assert.ok(D.rank.ranks[i].at > D.rank.ranks[i - 1].at);
  assert.strictEqual(Object.values(D.rank.weights).reduce((a, b) => a + b, 0), 100);
  const text = JSON.stringify(D).toLowerCase(); assert.ok(!/waffe|pistole|gewehr|messer/.test(text.replace('waffen gibt es nicht', '').replace('waffen gibt es im spiel nicht', '')), 'keine Waffen im Katalog');
  for (const s of Object.values(D.xp.sources)) assert.ok(s.capEp > 0 && s.capEp <= 5);
  assert.ok(D.effects.repGainPct <= 8 && D.effects.votePct <= 3 && D.effects.courtPts <= 2, 'Wirkungen klein');
});

test('Altstand: ensure legt xp = 0 und neutrale Ausstattung an, idempotent; Unsinn wird bereinigt', () => {
  const s = mk(); delete s.talents.xp; delete s.char;
  upgradeState(s); const once = JSON.stringify(s); upgradeState(s); assert.strictEqual(JSON.stringify(s), once);
  assert.strictEqual(s.talents.xp.bal, 0); assert.strictEqual(s.char.rank.lv, 1); assert.deepStrictEqual(s.char.gear, {});
  s.talents.xp = { bal: 'x', tot: -5, spent: 2.7, auto: 1, src: { arbeit: 'no', handel: [1, 2] }, buys: [[1, 99], [2, 1], 'z'], last: [{ s: 'x', p: NaN, d: 1 }] };
  s.char = { gear: { kleidung: { lv: 9 }, uhr: { lv: 2, paid: -5, cond: 500 }, nix: {} }, svc: { pflege: 7, schutz: 1 }, heir: [{ slot: 'auto', lv: 1 }], rank: { lv: 99, sc: -4 }, legacy: { pts: 'x' } };
  CH.ensure(s);
  assert.strictEqual(s.talents.xp.bal, 0); assert.strictEqual(s.talents.xp.tot, 0); assert.strictEqual(s.talents.xp.auto, true); assert.deepStrictEqual(Object.keys(s.talents.xp.src), ['handel']); assert.deepStrictEqual(s.talents.xp.buys, [[2, 1]]); assert.deepStrictEqual(s.talents.xp.last, []);
  assert.deepStrictEqual(Object.keys(s.char.gear), ['uhr']); assert.strictEqual(s.char.gear.uhr.cond, 100); assert.strictEqual(s.char.gear.uhr.paid, 0); assert.deepStrictEqual(s.char.svc, { schutz: 1 }); assert.deepStrictEqual(s.char.heir, []); assert.strictEqual(s.char.rank.lv, 7); assert.strictEqual(s.char.rank.sc, 0); assert.strictEqual(s.char.legacy, null);
});

test('Neuer Charakter: Startguthaben, Rang 1, nichts gekauft; Talentprofil bleibt wie es war', () => {
  const s = mk();
  assert.strictEqual(s.talents.xp.bal, D.xp.startBal); assert.strictEqual(s.talents.xp.tot, 0); assert.strictEqual(s.char.rank.lv, 1);
  assert.ok(TL.validProfile(s.talents));
});

test('Erfahrung: Quellen mit Deckel je Fenster, Höchstguthaben, keine Gutschrift ohne Talente oder bei Abschaltung', () => {
  const s = rich(mk()); s.talents.xp.bal = 0;
  const cap = D.xp.sources.fuehrung.capEp;
  let got = 0; for (let i = 0; i < 40; i++) got += CH.award(s, 'fuehrung', 1);
  assert.ok(Math.abs(got - cap) < 1e-9, `Deckel ${cap}, erhalten ${got}`);
  s.day += D.xp.windowDays; got = CH.award(s, 'fuehrung', 100); assert.ok(Math.abs(got - cap) < 1e-9, 'im neuen Fenster wieder Platz');
  assert.strictEqual(CH.award(s, 'gibtsnicht', 5), 0); assert.strictEqual(CH.award(s, 'arbeit', -5), 0); assert.strictEqual(CH.award(s, 'arbeit', NaN), 0);
  s.talents.xp.bal = D.xp.balMax - 0.5; s.day += D.xp.windowDays; assert.ok(CH.award(s, 'lernen', 3) <= 0.5 + 1e-9); assert.ok(s.talents.xp.bal <= D.xp.balMax);
  withCfg((C) => { C.enabled = false; assert.strictEqual(CH.award(s, 'sport', 1), 0); });
  const t = s.talents; s.talents = null; assert.strictEqual(CH.award(s, 'sport', 1), 0); s.talents = t;
});

test('Erfahrung: Aktionen und Tätigkeiten bringen EP; Fehlschläge nicht; Tagesdeckel gilt', () => {
  const s = rich(mk()); s.talents.xp.bal = 0; s.partner = { personId: 'p9', name: 'Anna', gender: 'f', born: s.day - 9000, sat: 60, cohabit: true };
  assert.ok(CH.onAction(w, s, 'gift', {}, { msg: 'ok' }) > 0, 'Geschenk an den Partner');
  assert.strictEqual(CH.onAction(w, s, 'gift', {}, { level: 'warn' }), 0, 'Fehlschlag zählt nicht');
  assert.strictEqual(CH.onAction(w, s, 'buyFood', {}, {}), 0, 'kein Zusammenhang');
  const x = s.talents.xp; for (let i = 0; i < 40; i++) CH.onAction(w, s, 'gift', {}, {});
  assert.ok(CH.srcGot(s, 'begegnung') <= D.xp.sources.begegnung.capEp + 1e-9);
  const s2 = rich(mk()); s2.talents.xp.bal = 0; s2.occupation = { kind: 'work', pkey: 'baecker', employer: 'X', cityId: s2.cityId, factor: 1, since: s2.day };
  run(s2, 200); assert.ok(s2.talents.xp.tot > 1.5 && s2.talents.xp.tot <= D.xp.sources.arbeit.capEp + 1e-9 * 200, `Berufspraxis ${s2.talents.xp.tot}`);
  void x;
});

test('Erfahrung verteilen: Kosten steigen mit dem Wert, Obergrenze der Anlage, Pause je Talent, Höchstzahl je Jahr, Beste Wahl und alles verteilen', () => {
  const s = rich(mk()); const x = s.talents.xp; x.bal = 50;
  assert.ok(CH.stepCost(30) <= CH.stepCost(60) && CH.stepCost(60) < CH.stepCost(95)); assert.ok(CH.stepCost(10) >= 1 && CH.stepCost(100) <= 12);
  const i = TL.IDX.handel; s.talents.v[i] = 50; s.talents.b[i] = 50; const v0 = s.talents.v[i];
  const r = act(s, 'chTrain', { key: 'handel' }); assert.match(r.msg, /steigt auf/); assert.strictEqual(s.talents.v[i], v0 + 1);
  assert.ok(Math.abs(x.bal - (50 - CH.stepCost(v0))) < 1e-9); assert.strictEqual(x.spent, 1);
  fails(s, 'chTrain', { key: 'handel' }, /Pause/);
  s.day += D.xp.waitDays; act(s, 'chTrain', { key: 'handel' });
  // Obergrenze: nie über b + growRoom
  s.talents.v[i] = TL.capAt(s.talents, i); fails(s, 'chTrain', { key: 'handel' }, /Anlage/);
  // Höchstzahl je Jahr
  const s2 = rich(mk()); s2.talents.xp.bal = 60; let n = 0;
  for (let d = 0; d < 400; d++) { s2.day++; for (const k of TL.KEYS) { try { act(s2, 'chTrain', { key: k }); n++; } catch (_) { /* gesperrt */ } } if (d === 100) assert.ok(n <= D.xp.yearMax, `im ersten Jahr höchstens ${D.xp.yearMax}`); }
  fails(rich(mk()), 'chTrain', { key: 'x' }, /gibt es nicht/); fails(s, 'chTrain', { key: '__proto__' }, /gibt es nicht/); fails(s, 'chTrain', { key: 5 }, /gibt es nicht/);
  const s3 = rich(mk()); s3.talents.xp.bal = 40; const before = s3.talents.v.slice(); const all = act(s3, 'chTrain', { key: 'all' }); assert.match(all.msg, /Erfahrung verteilt/);
  const after = s3.talents.v; assert.ok(after.every((x2, k) => x2 - before[k] <= 1) && after.some((x2, k) => x2 > before[k]));
  const s4 = rich(mk()); s4.talents.xp.bal = 40; const rec = CH.recommend(w, s4); s4.occupation = { kind: 'work', pkey: 'baecker', employer: 'X', cityId: s4.cityId, factor: 1, since: 0 };
  const top2 = TL.topKeys(TL.weightsFor(w, 'baecker')).slice(0, 2); assert.ok(top2.includes(CH.recommend(w, s4)[0])); void rec;
  act(s4, 'chTrain', { key: 'best' }); assert.ok(top2.map((k) => TL.IDX[k]).includes(s4.talents.xp.buys[0][1]));
});

test('Erfahrung: Auto-Verteilung auf die Talente der Tätigkeit, nur wenn eingeschaltet', () => {
  const s = rich(mk()); s.occupation = { kind: 'work', pkey: 'baecker', employer: 'X', cityId: s.cityId, factor: 1, since: s.day }; s.talents.xp.bal = 30;
  run(s, 30); assert.strictEqual(s.talents.xp.spent, 0, 'ausgeschaltet: nichts passiert');
  act(s, 'chAuto', { on: true }); assert.strictEqual(s.talents.xp.auto, true); run(s, 30); assert.ok(s.talents.xp.spent >= 1);
  act(s, 'chAuto', { on: false }); assert.strictEqual(s.talents.xp.auto, false);
});

test('Ausstattung kaufen: Preis in Tageslöhnen, Geld auf den Cent genau einmal, Epochen, Eingabeprüfung', () => {
  const s = rich(mk(), 1950); const m0 = s.money; const year = yearOf(s);
  const price = CH.price(w, s, 'kleidung', 2, year); assert.ok(price > 0);
  const r = act(s, 'chBuy', { slot: 'kleidung', level: 2 }); assert.match(r.msg, /Gekauft/); assert.strictEqual(m0 - s.money, price, 'Geld genau einmal'); assert.strictEqual(s.stats.spent, price);
  assert.strictEqual(s.char.gear.kleidung.lv, 2); assert.strictEqual(s.char.gear.kleidung.cond, 100); assert.ok(s.pending.char.some((e) => e.k === 'buy' && e.slot === 'kleidung'));
  fails(s, 'chBuy', { slot: 'kleidung', level: 2 }, /schon/);
  fails(s, 'chBuy', { slot: 'fahrzeug', level: 3 }, /erst ab/); // Limousine ab 1955
  for (const bad of [{ slot: 'x', level: 1 }, { slot: '__proto__', level: 1 }, { slot: 'kleidung', level: 4 }, { slot: 'kleidung', level: 0 }, { slot: 'kleidung', level: 'a' }, { slot: 'kleidung', level: 1.5 }, { slot: 'pflege', level: 1 }, {}, { slot: ['uhr'], level: 1 }]) fails(s, 'chBuy', bad);
  s.money = 10; fails(s, 'chBuy', { slot: 'uhr', level: 3 }, /Geld/); assert.strictEqual(s.money, 10, 'bei Fehlschlag nichts abgebucht');
  const s2 = rich(mk(), 2012); act(s2, 'chBuy', { slot: 'mittel', level: 2 }); assert.strictEqual(CH.levelName('mittel', 2, 2012), 'Laptop'); assert.strictEqual(CH.levelName('mittel', 2, 2005), 'Personal Computer'); assert.strictEqual(CH.levelName('mittel', 2, 1950), 'Schreibmaschine'); assert.strictEqual(CH.levelName('fahrzeug', 2, 1950), 'Motorroller');
});

test('Preise folgen Preisindex und Stadtwirtschaft; Wechsel rechnet das alte Stück an; Verkauf mit Abschlag und Zustand; kein Gewinn durch Hin und Her', () => {
  const s = rich(mk(), 1990); const m0 = s.money; const p1 = CH.price(w, s, 'uhr', 1, 1990); const p2 = CH.price(w, s, 'uhr', 2, 1990);
  assert.ok(Math.abs(p1 / wage(s) - D.gear.items.uhr.levels[0].costDays) < 0.5, 'Preis = Tageslöhne × Lohn');
  act(s, 'chBuy', { slot: 'uhr', level: 1 }); const back = CH.resaleValue(w, s, 'uhr', s.char.gear.uhr); assert.ok(back > 0 && back < p1, 'Abschlag');
  const m1 = s.money; act(s, 'chBuy', { slot: 'uhr', level: 2 }); assert.strictEqual(m1 - s.money, p2 - back, 'altes Stück angerechnet, genau einmal');
  const gain = s.money; act(s, 'chSell', { slot: 'uhr' }); const sold = s.money - gain; assert.ok(sold > 0 && sold < p2);
  assert.ok(s.money < m0, 'Kaufen und Verkaufen kostet Geld');
  fails(s, 'chSell', { slot: 'uhr' }, /kein eigenes/); assert.deepStrictEqual(s.char.gear, {});
  const s2 = rich(mk(), 1990); act(s2, 'chBuy', { slot: 'kleidung', level: 3 }); const fresh = CH.resaleValue(w, s2, 'kleidung', s2.char.gear.kleidung); s2.char.gear.kleidung.cond = 0; assert.ok(CH.resaleValue(w, s2, 'kleidung', s2.char.gear.kleidung) < fresh * 0.5, 'abgenutzt ist weniger wert');
  // Herunterstufen bringt nie mehr Geld als der Kauf kostete
  const s3 = rich(mk(), 1990); act(s3, 'chBuy', { slot: 'kleidung', level: 3 }); const spent = s3.stats.spent; const m3 = s3.money; act(s3, 'chBuy', { slot: 'kleidung', level: 1 }); assert.ok(s3.money - m3 < spent);
});

test('Abnutzung, Mode, Aufarbeiten: Zustand sinkt über die Lebensdauer, veraltete Mode wirkt weniger, Aufarbeiten stellt wieder her', () => {
  const s = rich(mk(), 1960); act(s, 'chBuy', { slot: 'kleidung', level: 3 }); const L0 = CH.look(s, yearOf(s));
  run(s, 365 * 3); const g = s.char.gear.kleidung; assert.ok(g.cond < 60 && g.cond > 40, `Zustand ${g.cond} nach 3 von 6 Jahren`);
  assert.ok(CH.look(s, yearOf(s)) < L0, 'abgenutzt wirkt weniger');
  fails(rich(mk()), 'chRepair', { slot: 'kleidung' }, /kein eigenes/);
  const m = s.money; act(s, 'chRepair', { slot: 'kleidung' }); assert.ok(m - s.money > 0); assert.ok(g.cond >= D.gear.repairTo - 1e-9); fails(s, 'chRepair', { slot: 'kleidung' }, /gutem Zustand/);
  const old = rich(mk(), 1960); act(old, 'chBuy', { slot: 'kleidung', level: 2 }); const l1 = CH.look(old, 1960); old.char.gear.kleidung.y = 1960 - 20; assert.ok(CH.look(old, 1960) < l1, 'aus der Mode');
  assert.ok(CH.isDated('kleidung', { y: 1940 }, 1960) && !CH.isDated('kleidung', { y: 1955 }, 1960));
});

test('Dienstleistungen: täglicher Satz, Beenden, nie in die Insolvenz, Epoche, Einbruchsrisiko sinkt', () => {
  const s = rich(mk(), 1990); const r = act(s, 'chService', { slot: 'schutz', level: 1 }); assert.match(r.msg, /gebucht/);
  const dc = CH.dayCost(w, s, 'schutz', 1, 1990); assert.ok(dc > 0); assert.strictEqual(CH.upkeepDay(w, s), dc);
  assert.ok(CH.burglaryMult(s) < 1 && CH.burglaryMult(s) >= 0.2);
  const f = require('../src/game/core').dailyFlows(w, s); assert.strictEqual(f.exp.gear, dc, 'in der Tagesrechnung sichtbar');
  const sp0 = s.stats.spent; run(s, 10, false); assert.ok(s.stats.spent - sp0 >= dc * 10 - 1, `laufende Kosten gebucht ${s.stats.spent - sp0} ${dc}`);
  act(s, 'chService', { slot: 'schutz', level: 0 }); assert.strictEqual(CH.burglaryMult(s), 1); fails(s, 'chService', { slot: 'schutz', level: 0 }, /nicht gebucht/);
  fails(rich(mk(), 1950), 'chService', { slot: 'schutz', level: 2 }, /erst ab/); fails(s, 'chService', { slot: 'schutz', level: 5 }); fails(s, 'chService', { slot: 'uhr', level: 1 }, /Gegenstand/);
  const poor = rich(mk(), 1990); act(poor, 'chService', { slot: 'pflege', level: 2 }); act(poor, 'chService', { slot: 'schutz', level: 2 });
  poor.money = 5; advance(w, poor, 1); poor.interrupts = []; assert.deepStrictEqual(poor.char.svc, {}, 'ohne Geld enden die Dienste'); assert.ok(poor.money >= 0, 'keine Schulden durch Ausstattung');
  const car = rich(mk(), 1990); act(car, 'chBuy', { slot: 'fahrzeug', level: 2 }); assert.ok(CH.upkeepDay(w, car) > 0, 'Fahrzeug kostet Unterhalt');
});

test('Wirkungen: gedeckelt, null ohne Auftreten, steigen monoton, Stärke 0 schaltet ab; Ruf-Zuwachs bleibt unter +20 %', () => {
  const s = rich(mk(), 1990); assert.strictEqual(CH.repGain(s), 1); assert.strictEqual(CH.raiseAdd(s), 0); assert.strictEqual(CH.voteMult(s), 1); assert.strictEqual(CH.courtPts(s), 0);
  let last = 0;
  for (const [slot, lv] of [['kleidung', 1], ['kleidung', 2], ['kleidung', 3], ['uhr', 3], ['schmuck', 3], ['fahrzeug', 3], ['mittel', 3]]) {
    act(s, 'chBuy', { slot, level: lv }); const L = CH.look(s, 1990); assert.ok(L >= last, 'Auftreten steigt monoton'); last = L;
  }
  act(s, 'chService', { slot: 'pflege', level: 2 }); const full = CH.wirkungen(s);
  assert.ok(full.repGain <= 1 + D.effects.repGainPct / 100 + 1e-9 && full.raise <= D.effects.raisePct / 100 + 1e-9 && full.vote <= 1 + D.effects.votePct / 100 + 1e-9 && full.court <= D.effects.courtPts + 1e-9 && full.chance <= D.effects.chancePct / 100 + 1e-9);
  assert.ok(full.repGain > 1.03 && full.raise > 0.02 && full.vote > 1.015, 'spürbar');
  const x = CH.xpOf(s); void x;
  settings.DEFAULTS.charakter.effects.strength = 0;
  try { const z = CH.wirkungen(s); assert.deepStrictEqual([z.repGain, z.raise, z.apply, z.vote, z.chance, z.court, z.comfort, z.burglary], [1, 0, 0, 1, 0, 0, 0, 1]); } finally { settings.DEFAULTS.charakter.effects.strength = 1; }
  settings.DEFAULTS.charakter.effects.strength = 2;
  try { assert.ok(CH.repGain(s) <= 1 + 2 * D.effects.repGainPct / 100 + 1e-9); } finally { settings.DEFAULTS.charakter.effects.strength = 1; }
  const rp = require('../src/game/reputation'); s.pending = {}; rp.queue(s, 'civic', 10, 'gift'); assert.ok(s.pending.rep[0].d <= 12.0001 && s.pending.rep[0].d > 10, 'Zuwachs mit Auftreten, höchstens +20 %');
});

test('Wirkungen greifen: Gehaltsgespräch, Bewerbung, Kandidatur, Wohlbefinden', () => {
  const career = require('../src/game/career'); const society = require('../src/game/society');
  const s = rich(mk(), 1990); s.occupation = { kind: 'work', pkey: 'baecker', employer: 'X', cityId: s.cityId, factor: 1, since: 0 };
  const occ = career.workerOcc(s); const r0 = career.raiseChance(s, occ); const a0 = career.applyChance(s, 'baecker'); const c0 = society.winChance(w, s, 0, 1, 0);
  for (const [slot, lv] of [['kleidung', 3], ['uhr', 3], ['schmuck', 3], ['fahrzeug', 3], ['mittel', 3]]) act(s, 'chBuy', { slot, level: lv });
  assert.ok(career.raiseChance(s, occ) > r0 && career.applyChance(s, 'baecker') > a0 && society.winChance(w, s, 0, 1, 0) > c0);
  assert.ok(career.raiseChance(s, occ) - r0 <= D.effects.raisePct / 100 + 1e-9);
  assert.ok(CH.comfort(s) > 0 && CH.comfort(s) <= 1.5);
});

test('Rang: monoton in jeder Quelle, Trägheit beim Abstieg, nie gesperrt – keine harte Sperre durch Rang oder Ausstattung', () => {
  const s = rich(mk(), 1990); const P0 = CH.rankParts(w, s);
  s.rep = { s: 60, l: 60, lv: 4, ll: 4, c: [20, 20, 20, 20, 0] }; const P1 = CH.rankParts(w, s); assert.ok(P1.rep > P0.rep && P1.total > P0.total);
  s.money *= 100; assert.ok(CH.rankParts(w, s).wealth >= P1.wealth);
  s.civic = { titles: [{ key: 'kommerzienrat', rank: 2 }] }; const P2 = CH.rankParts(w, s); assert.ok(P2.title > 0); s.civic.titles.push({ key: 'stifter', rank: 3 }); assert.ok(CH.rankParts(w, s).title >= P2.title);
  s.politics.term = { idx: 3, startDay: 0, endDay: 99999 }; assert.ok(CH.rankParts(w, s).title > P2.title);
  let prev = -1; for (let sc = 0; sc <= 100; sc += 2) { const lv = CH.rankFor(sc, 1); assert.ok(lv >= prev && lv >= 1 && lv <= 7); prev = lv; }
  const at = D.rank.ranks[3].at; assert.strictEqual(CH.rankFor(at, 1), 4); assert.strictEqual(CH.rankFor(at - 1, 4), 4, 'Trägheit'); assert.strictEqual(CH.rankFor(at - D.rank.hysteresis - 0.5, 4), 3);
  const r = CH.checkRank(w, s); assert.ok(r.parts.total > 0 && s.char.rank.lv >= 1);
  const up = rich(mk(), 1990); up.money = 9e11; up.rep = { s: 70, l: 70, lv: 4, ll: 4, c: [30, 30, 30, 30, 0] }; const before = up.notices.length; const ch = CH.checkRank(w, up); assert.ok(ch.changed && ch.to > 1); assert.ok(up.notices.length > before, 'Aufstieg wird gemeldet'); assert.ok(up.pending.char.some((e) => e.k === 'rank'));
  // Ämter und Kauf hängen nicht am Rang: keine Referenz auf den Rang in den Prüfungen (nur weiche Vorteile)
  const fs = require('fs'); for (const f of ['src/game/society.js', 'src/lib/elections.js', 'src/game/business.js']) assert.ok(!/char\.rank|rankLv|rank_lv/.test(fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8')), `${f} sperrt nicht nach Rang`);
  for (const [k, arr] of Object.entries(D.rank.perks)) if (Array.isArray(arr)) assert.ok(arr.every((x, i) => x >= 0 && (i === 0 || x >= arr[i - 1])), `${k} steigt nur`);
});

test('Rang-Vorteile: günstigere Immobilien, Vorab-Angebot ab Rang 4, Kandidaturgebühr, Beziehungen; alle Angebote bleiben sichtbar', () => {
  const s = rich(mk(), 1990); const e0 = edition(w, s, s.cityId); const ids0 = e0.housing.sale.map((x) => x.id);
  const s2 = JSON.parse(JSON.stringify(s)); s2.char.rank.lv = 6; const e6 = edition(w, s2, s2.cityId);
  for (const h of e0.housing.sale) { const h6 = e6.housing.sale.find((x) => x.id === h.id); assert.ok(h6, 'Angebot bleibt sichtbar'); assert.ok(h6.price < h.price && h6.price >= h.price * 0.96, 'höchstens 3 % günstiger'); }
  assert.ok(e6.housing.sale.some((x) => x.vip) && !e0.housing.sale.some((x) => x.vip) && e6.housing.sale.length === ids0.length + 1, 'ein zusätzliches Vorab-Angebot');
  const vip = e6.housing.sale.find((x) => x.vip); assert.match(vip.id, /^sale:\d+:\d+:9$/);
  s2.money = vip.price + 100; const n0 = s2.properties.length; act(s2, 'buy', { listingId: vip.id }); assert.strictEqual(s2.properties.length, n0 + 1, 'Vorab-Angebot ist kaufbar');
  const e0b = edition(w, s2, s2.cityId); assert.ok(!e0b.housing.sale.some((x) => x.id === vip.id), 'danach verkauft');
  s2.char.rank.lv = 1; fails(s2, 'buy', { listingId: vip.id });
  assert.ok(CH.applyPts(s2) === 0); s2.char.rank.lv = 7; assert.ok(CH.applyPts(s2) >= D.rank.perks.contacts[6]);
});

test('Erbe: kleiner Bildungsvorsprung ohne EP-Verdoppelung, Erbstücke (Uhr, Schmuck) nicht verkäuflich, kein Geld aus dem Nichts, Herkunft teilweise', () => {
  const s = rich(mk(), 1990); s.talents.xp.tot = 200; s.talents.xp.bal = 40;
  act(s, 'chBuy', { slot: 'uhr', level: 3 }); act(s, 'chBuy', { slot: 'schmuck', level: 2 }); act(s, 'chBuy', { slot: 'fahrzeug', level: 2 }); act(s, 'chBuy', { slot: 'kleidung', level: 3 });
  s.char.rank.sc = 70; s.char.rank.lv = 6;
  family.bornChild({ world: w, state: s, idx: 1 }, rngFor('b', 2)); const k = s.children[0]; k.born = s.day - 20 * 365;
  const est = family.estateShare(w, s); const { state: h } = createHeirState(w, s, k.id, []);
  assert.ok(h.talents.xp.bal <= D.xp.inherit.max && h.talents.xp.bal >= 1, `Vorsprung ${h.talents.xp.bal}`); assert.strictEqual(h.talents.xp.tot, 0); assert.ok(h.talents.xp.bal < s.talents.xp.bal + s.talents.xp.tot * 0.5, 'keine Verdoppelung');
  assert.deepStrictEqual(Object.keys(h.char.gear), [], 'Fahrzeug und Kleidung bleiben beim Verstorbenen'); assert.deepStrictEqual(h.char.heir.map((x) => x.slot).sort(), ['schmuck', 'uhr']);
  const uhr = h.char.heir.find((x) => x.slot === 'uhr'); assert.strictEqual(uhr.lv, 3); assert.ok(uhr.cond <= 90.01);
  assert.ok(h.money <= est.share, 'Erbe bekommt nur seinen Pflichtanteil');
  fails(h, 'chSell', { slot: 'uhr' }, /kein eigenes/); assert.ok(CH.look(h, 1990) > 4, 'Erbstück wirkt');
  assert.ok(h.char.legacy && h.char.legacy.pts > 0 && h.char.legacy.pts <= D.rank.legacyMax, 'Herkunft'); assert.strictEqual(h.char.rank.lv, 1);
  const P = CH.rankParts(w, h); assert.ok(P.legacy > 0);
  const later = JSON.parse(JSON.stringify(h)); later.day += 365 * 30; assert.ok(CH.rankParts(w, later).legacy < P.legacy, 'Herkunft verblasst');
  // zweites Kind: eine Stufe weniger
  const s2 = rich(mk(), 1990); act(s2, 'chBuy', { slot: 'uhr', level: 3 }); family.bornChild({ world: w, state: s2, idx: 1 }, rngFor('b', 3)); family.bornChild({ world: w, state: s2, idx: 1 }, rngFor('b', 4)); s2.children.forEach((c) => { c.born = s2.day - 20 * 365; });
  const h2 = createHeirState(w, s2, s2.children[0].id, []).state; assert.strictEqual(h2.char.heir.find((x) => x.slot === 'uhr').lv, 2);
});

test('Anzeige: view enthält Talente, Ausstattung, Rang und Kurz-Lebenslauf; Preise und Wirkungen stimmen mit dem Modell überein', () => {
  const s = rich(mk(), 1990); act(s, 'chBuy', { slot: 'kleidung', level: 2 });
  const v = present(w, s, user(), Date.now()).char;
  assert.strictEqual(v.gear.length, 7); assert.strictEqual(v.rank.levels.length, 7); assert.strictEqual(v.xp.buys.length, 6); assert.ok(v.chron.length >= 1);
  const k = v.gear.find((g) => g.key === 'kleidung'); assert.strictEqual(k.lv, 2); assert.strictEqual(k.levels[1].current, true); assert.strictEqual(k.levels[2].price, CH.price(w, s, 'kleidung', 3, 1990));
  assert.ok(v.look > 4 && v.fx.rep > 0 && v.fx.rep <= 8); assert.strictEqual(v.upkeepDay, 0);
  assert.strictEqual(JSON.stringify(v), JSON.stringify(JSON.parse(JSON.stringify(v))), 'serialisierbar');
  const dead = JSON.parse(JSON.stringify(s)); dead.status = 'dead'; dead.death = { day: 1, reason: 'Alter' }; assert.strictEqual(present(w, dead, user(), 1).char, null);
});

test('Ausschalten: enabled = false – keine Wirkung, keine Kosten, keine Erfahrung, Aktionen melden es', () => {
  const s = rich(mk(), 1990); act(s, 'chBuy', { slot: 'kleidung', level: 3 }); act(s, 'chService', { slot: 'pflege', level: 1 });
  withCfg((C) => { C.enabled = false; assert.strictEqual(CH.upkeepDay(w, s), 0); assert.strictEqual(CH.repGain(s), 1); assert.strictEqual(CH.award(s, 'arbeit', 1), 0); fails(s, 'chBuy', { slot: 'uhr', level: 1 }, /ausgeschaltet/); fails(s, 'chTrain', { key: 'handel' }, /ausgeschaltet/); const f = require('../src/game/core').dailyFlows(w, s); assert.strictEqual(f.exp.gear, 0); });
});

test('Engine: lange Läufe – Zustand bleibt in den Grenzen, Geld ganzzahlig, Rang und EP endlich', () => {
  const s = rich(mk(), 1960); act(s, 'chBuy', { slot: 'kleidung', level: 2 }); act(s, 'chBuy', { slot: 'fahrzeug', level: 2 }); act(s, 'chService', { slot: 'pflege', level: 1 });
  s.occupation = { kind: 'work', pkey: 'baecker', employer: 'X', cityId: s.cityId, factor: 1, since: s.day }; act(s, 'chAuto', { on: true });
  run(s, 365 * 8);
  assert.ok(Number.isInteger(s.money)); const x = s.talents.xp; assert.ok(x.bal >= 0 && x.bal <= D.xp.balMax && Number.isFinite(x.tot));
  for (const g of Object.values(s.char.gear)) assert.ok(g.cond >= 0 && g.cond <= 100);
  assert.ok(s.char.rank.lv >= 1 && s.char.rank.lv <= 7); assert.ok(TL.validProfile(s.talents)); assert.ok(x.spent >= 1, 'Automatik hat verteilt');
  s.talents.v.forEach((v, i) => assert.ok(v <= TL.capAt(s.talents, i)));
});

test('Admin: Einstellungsprüfung nimmt die Standardwerte an und weist Unsinn zurück', () => {
  const { validateJson } = require('../src/routes/admin');
  const copy = () => JSON.parse(JSON.stringify(D));
  assert.doesNotThrow(() => validateJson('charakter', copy()));
  const bad = (fn, re) => { const c = copy(); fn(c); assert.throws(() => validateJson('charakter', c), re); };
  bad((c) => { c.effects.strength = 5; }, /effects\.strength/);
  bad((c) => { c.effects.lookFull = 5; }, /lookFull/);
  bad((c) => { c.rank.ranks.pop(); }, /sieben Ränge/);
  bad((c) => { c.rank.ranks[0].at = 3; }, /erste Rang|sieben Ränge/);
  bad((c) => { c.rank.weights.rep = 90; }, /Gewichte/);
  bad((c) => { c.rank.perks.clubSlots[2] = 9; }, /clubSlots/);
  bad((c) => { c.gear.items.uhr.levels.pop(); }, /genau 3 Stufen/);
  bad((c) => { c.gear.items.kleidung.levels[0].names = []; }, /Namen nach Epoche/);
  bad((c) => { c.xp.sources = {}; }, /Quelle/);
  bad((c) => { c.xp.waitDays = -1; }, /waitDays/);
  bad((c) => { c.bots.buy = 3; }, /bots\.buy/);
  bad((c) => { delete c.gear; }, /gear/);
});
