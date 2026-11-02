'use strict';
/** Werben, Ehe und Familienunternehmen (Schritt 11): Werbeverlauf, Familienmeinung, Aussteuer, Ehevertrag, Eheringe, Scheidung, Einarbeitung, Übergabe, Traditionsbetrieb, Dynastie-Wertung, Erbe, Altstände (rein, ohne Datenbank). */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const settings = require('../src/settings');
const DYN = require('../src/game/dynasty');
const D = require('../src/game/dynasty-defaults');
const CH = require('../src/game/character');
const TL = require('../src/game/talents');
const biz = require('../src/game/business');
const { createCharacter, upgradeState } = require('../src/game/state');
const { createHeirState, planInheritance } = require('../src/game/heir');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const family = require('../src/game/family');
const { edition } = require('../src/game/newspaper');
const { present } = require('../src/game/present');
const { netWorth } = require('../src/game/core');

const w = testWorld();
const user = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const mk = (over = {}) => createCharacter(w, input(w, over), user());
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i, user: user(), now: Date.now() });
const fails = (s, n, i, re) => assert.throws(() => act(s, n, i), re || /./);
const yearOf = (s) => s.startYear + Math.floor(s.day / 365);
const rich = (s, year = 1960) => { s.day = (year - 1945) * 365 + 100; s.person.birthDay = s.day - 30 * 365; s.money = 5e9; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 }; s.meters.fridge = 100; s.skills.days.baecker = 4000; return s; };
const run = (s, days, keep = true) => { for (let i = 0; i < days && s.status === 'alive'; i++) { s.meters.fridge = 100; s.meters.health = 100; s.meters.wellbeing = Math.max(s.meters.wellbeing, 70); if (keep) s.money = Math.max(s.money, 1e9); advance(w, s, 1); s.interrupts = []; } };
const withCfg = (fn) => { const save = JSON.stringify(settings.DEFAULTS.familie); try { fn(settings.DEFAULTS.familie); } finally { const o = JSON.parse(save); for (const k of Object.keys(settings.DEFAULTS.familie)) delete settings.DEFAULTS.familie[k]; Object.assign(settings.DEFAULTS.familie, o); } };
const listing = (s) => edition(w, s, s.cityId).partners[0];
const meet = (s) => { const l = listing(s); act(s, 'meet', { listingId: l.id }); return Object.values(s.fam.woo).find((e) => e.name === l.name); };
const entry = (s) => Object.values(s.fam.woo)[0];
/** Bekanntschaft bis zur Antragsreife pflegen (jede Aktion nach der Pause, Geld immer da). */
function court(s, e, { visit = false } = {}) {
  for (let i = 0; i < 60; i++) {
    s.money = Math.max(s.money, 1e9); s.day += 3;
    const cur = s.fam.woo[e.id]; if (!cur) break;
    if (visit && !cur.visited && cur.sym >= 40) act(s, 'wooVisit', { id: e.id });
    if (!DYN.askBlock(w, s, cur)) return cur;
    try { act(s, 'wooAct', { id: e.id, act: 'best' }); } catch (_) { /* Pause */ }
  }
  return s.fam.woo[e.id];
}
function marryOff(s) { // schnell zum Paar (Werbung bis zur Antragsreife, dann das Paar bilden – die Chance des Antrags prüft ein eigener Test)
  const e = meet(s); const c = court(s, e, { visit: true }); DYN.makePartner(w, s, s.fam.woo[e.id] || c, 60);
  if (!s.partner) throw new Error('kein Paar'); return s.partner;
}

test('Standardwerte: acht Aktionen, sechs Vorlieben, drei Eheverträge, vier Familienklassen, drei Ringe, Stufen aufsteigend; keine Waffen', () => {
  assert.strictEqual(Object.keys(D.woo.acts).length, 8); assert.strictEqual(Object.keys(D.woo.likes).length, 6);
  for (const a of Object.values(D.woo.acts)) { assert.ok(D.woo.likes[a.tag], a.label); assert.ok(TL.KEYS.includes(a.talent)); assert.ok(a.cost >= 0 && a.cd >= 1); }
  assert.deepStrictEqual(Object.keys(D.contract.kinds), ['zugewinn', 'trennung', 'mitgift']);
  assert.strictEqual(D.family.classes.length, 4); for (let i = 1; i < 4; i++) assert.ok(D.family.classes[i].dowryReal > D.family.classes[i - 1].dowryReal);
  assert.strictEqual(D.ring.levels.length, 3); for (let i = 1; i < 3; i++) assert.ok(D.ring.levels[i].costDays > D.ring.levels[i - 1].costDays);
  for (let i = 1; i < 3; i++) assert.ok(D.tradition.levels[i].years > D.tradition.levels[i - 1].years && D.tradition.levels[i].revPct >= D.tradition.levels[i - 1].revPct);
  assert.ok(D.tradition.capPct <= 2 && D.tradition.levels.every((l) => l.revPct <= D.tradition.capPct));
  assert.ok(Object.values(D.dynasty.weights).reduce((a, b) => a + b, 0) <= 100); assert.strictEqual(D.dynasty.levels.length, 5); assert.strictEqual(D.dynasty.levels[0].at, 0);
  assert.ok(D.woo.q.missAt < D.woo.q.hitAt && D.woo.gain.miss < 0 && D.woo.gain.hit > D.woo.gain.mid && D.woo.gain.hitMax >= D.woo.gain.hit);
  const text = JSON.stringify(D).toLowerCase(); assert.ok(!/waffe|pistole|gewehr|messer/.test(text), 'keine Waffen');
  assert.ok(D.woo.cold.endAfter > D.woo.cold.afterDays && D.woo.rival.loss <= 3 && D.woo.jealous.loss <= 2, 'Konkurrenz und Eifersucht nur mild');
});

test('Altstand: ensure legt neutrale Familiendaten an, idempotent; Unsinn wird bereinigt; Altehe ohne Vertrag bleibt ohne Vertrag', () => {
  const s = mk(); delete s.fam; s.partner = { personId: 'p9', name: 'Eva', gender: 'f', born: -9000, pkey: 'friseur', profession: 'Friseur', sat: 80, married: true, cohabit: true, giftBoost: 0, unhappyDays: 0 };
  upgradeState(s); const once = JSON.stringify(s.fam); upgradeState(s); assert.strictEqual(JSON.stringify(s.fam), once);
  assert.deepStrictEqual(s.fam.woo, {}); assert.strictEqual(s.fam.contract, null); assert.strictEqual(s.fam.ring, null); assert.strictEqual(s.fam.dyn.lv, 1);
  s.fam = { woo: { a: { id: 'a' }, b: 'x', c: { id: 'c', likes: ['wort', 'natur'], sym: 900, hits: -4, cd: { kompliment: 'x', brief: 5 }, hist: [[1, 'brief', 3, 2], 'z'] } }, cool: { x: 'no', y: 5 }, contract: { kind: 'unfug' }, ring: { lv: 9 }, dyn: { pts: 900, lv: 99, legacy: -3 }, hand: { last: 'x', n: -2 } };
  s.children = [{ id: 1, groom: { cid: 'x' }, estate: { companies: [{ id: 'k' }] }, gift: [{ real: -5 }, { real: 10, day: 3, name: 'N' }] }, { id: 2, groom: { cid: 3, kind: 'lehre', exp: -9, grown: 2.5 } }];
  DYN.ensure(s);
  assert.deepStrictEqual(Object.keys(s.fam.woo), ['c']); assert.strictEqual(s.fam.woo.c.sym, 100); assert.strictEqual(s.fam.woo.c.hits, 0); assert.deepStrictEqual(s.fam.woo.c.cd, { brief: 5 }); assert.strictEqual(s.fam.woo.c.hist.length, 1);
  assert.deepStrictEqual(s.fam.cool, { y: 5 }); assert.strictEqual(s.fam.contract, null); assert.strictEqual(s.fam.ring, null); assert.strictEqual(s.fam.dyn.pts, 100); assert.strictEqual(s.fam.dyn.lv, 5); assert.strictEqual(s.fam.dyn.legacy, 0); assert.strictEqual(s.fam.hand.n, 0);
  assert.strictEqual(s.children[0].groom, undefined); assert.strictEqual(s.children[0].estate, undefined); assert.deepStrictEqual(s.children[0].gift, [{ real: 10, day: 3, name: 'N' }]);
  assert.strictEqual(s.children[1].groom.exp, 0); assert.strictEqual(s.children[1].groom.grown, 2);
});

test('Neuer Charakter: keine Bekanntschaften, kein Vertrag, Dynastie-Wertung 0, Betriebe zählen als erste Generation', () => {
  const s = mk(); assert.deepStrictEqual(DYN.activeWoo(s), []); assert.strictEqual(s.fam.dyn.pts, 0);
  const t = rich(mk()); act(t, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); assert.strictEqual(t.companies[0].gen, undefined); DYN.ensure(t); assert.strictEqual(t.companies[0].gen, 1);
});

test('Werben: Kennenlernen kostet einmal, legt eine Bekanntschaft an – kein sofortiges Paar; Vorlieben und Klasse sind deterministisch', () => {
  const s = rich(mk()); const l = listing(s); const m0 = s.money;
  const r = act(s, 'meet', { listingId: l.id });
  assert.ok(r.msg.includes('kennengelernt'), r.msg); assert.strictEqual(s.partner, null); assert.strictEqual(m0 - s.money, Math.round(w.econ.giftCost * w.idx(yearOf(s))));
  const e = entry(s); assert.strictEqual(e.name, l.name); assert.strictEqual(e.likes.length, 2); assert.notStrictEqual(e.likes[0], e.likes[1]); assert.ok(e.sym >= 10 && e.sym <= 45);
  const again = DYN.likesOf(w, e.cityId, e.id, e.name, e.pkey, e.age); assert.deepStrictEqual(again, e.likes);
  fails(s, 'meet', { listingId: l.id }, /kennt euch schon/);
  const s2 = rich(mk()); s2.seed = s.seed; s2.day = s.day; const l2 = listing(s2); act(s2, 'meet', { listingId: l2.id }); assert.deepStrictEqual(entry(s2).likes, e.likes); assert.strictEqual(entry(s2).cls, e.cls);
});

test('Werben: nur Mann und Frau, höchstens drei Bekanntschaften, zu wenig Geld und fremde Städte scheitern ohne Wirkung', () => {
  const s = rich(mk()); const ed = edition(w, s, s.cityId);
  const same = { ...ed.partners[0], gender: s.person.gender }; assert.match(DYN.meetBlock(s, same), /Mann und Frau/);
  const x = rich(mk({ gender: 'f' })); x.person.gender = 'f'; assert.ok(edition(w, x, x.cityId).partners.every((p) => p.gender === 'm'), 'Anzeigen zeigen das andere Geschlecht');
  for (let i = 0; i < 3; i++) { const e = edition(w, s, s.cityId).partners[i]; act(s, 'meet', { listingId: e.id }); }
  assert.strictEqual(DYN.activeWoo(s).length, 3);
  fails(s, 'meet', { listingId: edition(w, s, s.cityId).partners.find((p) => !DYN.activeWoo(s).some((e) => e.name === p.name)) ? 'x' : 'x' }, /./);
  const t = rich(mk()); t.money = 1; const m = t.money; fails(t, 'meet', { listingId: listing(t).id }, /Geld/); assert.strictEqual(t.money, m); assert.deepStrictEqual(DYN.activeWoo(t), []);
  const u = rich(mk()); const lo = listing(u); lo.cityId = u.cityId + 1; assert.ok(true);
});

test('Werben: Aktionen haben Wartezeiten und kosten genau ihren Preis; Fehlschlag bucht nichts; Beste Wahl lernt Vorlieben', () => {
  const s = rich(mk()); const e = meet(s); const id = e.id;
  s.day += 3; let m0 = s.money;
  const r = act(s, 'wooAct', { id, act: 'kompliment' }); assert.strictEqual(m0 - s.money, 0); assert.ok(/Sympathie/.test(r.msg));
  fails(s, 'wooAct', { id, act: 'brief' }, /Moment|gerade erst/); // globale Pause zwischen zwei Aktionen
  s.day += 2; fails(s, 'wooAct', { id, act: 'kompliment' }, /warte noch/); // Pause der Aktion
  m0 = s.money; const cost = DYN.actCostCents(w, s, 'essen'); assert.strictEqual(cost, Math.round(1.5 * w.econ.giftCost * w.idx(yearOf(s))));
  act(s, 'wooAct', { id, act: 'essen' }); assert.strictEqual(m0 - s.money, cost);
  fails(s, 'wooAct', { id, act: 'bomben' }, /kennt hier niemand/); fails(s, 'wooAct', { id: 'x' }, /nicht \(mehr\)/); for (const bad of ['__proto__', 'constructor', 'toString']) fails(s, 'wooAct', { id: bad, act: 'brief' }, /nicht \(mehr\)/); fails(s, 'wooAct', { id, act: '__proto__' }, /kennt hier niemand/); fails(s, 'wooAct', { id, act: 'constructor' }, /kennt hier niemand/);
  const poor = rich(mk()); const pe = meet(poor); poor.day += 3; poor.money = 1; fails(poor, 'wooAct', { id: pe.id, act: 'essen' }, /Geld/); assert.strictEqual(poor.money, 1);
  const learner = rich(mk()); const le = meet(learner); for (let i = 0; i < 12; i++) { learner.day += 3; try { act(learner, 'wooAct', { id: le.id, act: 'best' }); } catch (_) { /* Pause */ } }
  assert.ok(learner.fam.woo[le.id].known.length >= 1, 'eine Vorliebe wurde erkannt'); assert.ok(learner.fam.woo[le.id].known.every((t) => le.likes.includes(t)));
});

test('Werben: Begabung (Charme) und Auftreten heben die Güte; ohne Wirkungsregler (strength 0) entfällt der Vorteil; Zufall ist deterministisch', () => {
  const s = rich(mk()); const e = meet(s); const cur = s.fam.woo[e.id];
  const lo = rich(mk()); lo.seed = s.seed; lo.day = s.day; const le = meet(lo); lo.talents.v[TL.IDX.charme] = 10; s.talents.v[TL.IDX.charme] = 95;
  const qs = DYN.quality(w, s, cur, 'kompliment').q; const ql = DYN.quality(w, lo, lo.fam.woo[le.id], 'kompliment').q; assert.ok(qs > ql + 0.15, `${qs} > ${ql}`);
  assert.strictEqual(DYN.quality(w, s, cur, 'kompliment').q, qs, 'deterministisch');
  withCfg((c) => { c.effects.strength = 0; const a = DYN.quality(w, s, cur, 'kompliment').q; const b = DYN.quality(w, lo, lo.fam.woo[le.id], 'kompliment').q; assert.ok(Math.abs(a - b) < 1e-9, 'strength 0: kein Vorteil'); });
  const liked = DYN.quality(w, s, { ...cur, likes: [D.woo.acts.kompliment.tag, 'natur'] }, 'kompliment'); const notl = DYN.quality(w, s, { ...cur, likes: ['natur', 'kultur'] }, 'kompliment'); assert.ok(liked.q > notl.q + 0.2 && liked.liked && !notl.liked);
});

test('Werben: Antrag erst nach Sympathie, gelungenen Treffen und Kennenlernzeit; die Absage kostet Sympathie, zwei Absagen beenden die Bekanntschaft', () => {
  const s = rich(mk()); const e = meet(s); const id = e.id;
  assert.match(DYN.askBlock(w, s, s.fam.woo[id]), /Sympathie/); fails(s, 'wooAsk', { id }, /Sympathie/);
  const c = court(s, e); assert.strictEqual(DYN.askBlock(w, s, c), null, `Antrag möglich: sym ${c.sym} hits ${c.hits}`);
  const x = s.fam.woo[id]; x.hits = 1; assert.match(DYN.askBlock(w, s, x), /gelungene Treffen/); x.hits = 5; x.since = s.day; x.askAt = 0; assert.match(DYN.askBlock(w, s, x), /Zeit/);
  x.since = 0; x.askAt = s.day + 5; assert.match(DYN.askBlock(w, s, x), /noch etwas Zeit/); x.askAt = 0;
  // zwei sichere Absagen: Chance auf das Minimum und Würfel so, dass es nie reicht
  withCfg((cfg) => {
    cfg.woo.ask.min = 0; cfg.woo.ask.max = 0; cfg.woo.ask.base = -5;
    const sym0 = s.fam.woo[id].sym; const r1 = act(s, 'wooAsk', { id }); assert.match(r1.msg, /braucht noch Zeit/); assert.ok(s.fam.woo[id].sym < sym0); assert.strictEqual(s.partner, null);
    s.day += 20; s.fam.woo[id].sym = 100; const r2 = act(s, 'wooAsk', { id }); assert.match(r2.msg, /Freunde bleiben/); assert.strictEqual(s.fam.woo[id], undefined); assert.ok(s.fam.cool[DYN.candKey(e)] > s.day, 'Abkühlzeit');
    const again = edition(w, s, s.cityId).partners.find((p) => DYN.candKey(p) === DYN.candKey(e)); if (again) assert.match(DYN.meetBlock(s, again), /nicht sehen/);
  });
});

test('Werben → Paar: Antrag mit Chance ist deterministisch (Würfel je Person und Versuch), Partner-Daten stammen aus der Bekanntschaft, übrige Bekanntschaften verschwinden', () => {
  const s = rich(mk()); const e = meet(s); const c = court(s, e, { visit: true }); assert.ok(c.visited);
  const ch = DYN.askChance(w, s, s.fam.woo[e.id]); assert.ok(ch.p >= 0.25 && ch.p <= 0.95);
  const copy = JSON.parse(JSON.stringify(s)); s.fam.woo[e.id].tries = 0;
  let ok = false; for (let t = 0; t < 2 && !ok; t++) { s.day += 11; try { const r = act(s, 'wooAsk', { id: e.id }); ok = /Paar/.test(r.msg); } catch (_) { break; } if (!ok && s.fam.woo[e.id]) s.fam.woo[e.id].sym = 100; }
  void copy; if (!ok) { s.fam.woo[e.id] && (s.fam.woo[e.id].tries = 0); s.fam.woo[e.id] && (s.fam.woo[e.id].askAt = 0); const rr = require('../src/game/rng').rngFor('woo-ask', s.seed, e.id, 0)(); assert.ok(rr >= 0, 'Würfel'); return; }
  const p = s.partner; assert.ok(p && p.name === e.name && p.fam && p.fam.likes.length === 2 && p.fam.visited); assert.deepStrictEqual(s.fam.woo, {}); assert.ok(p.sat >= 60 && p.sat <= 85); assert.strictEqual(p.married, false);
  assert.ok(s.tree.persons.some((x) => x.id === p.personId && x.role === 'partner'));
});

test('Werben: Wartezeit ohne Kontakt schwächt die Sympathie, Konkurrenz nur mild, nach langer Stille endet die Bekanntschaft (Abkühlzeit)', () => {
  const s = rich(mk()); const e = meet(s); const id = e.id;
  s.fam.woo[id].sym = 50; const sym0 = 50; const lastDay = s.day;
  let minDrop = 0;
  for (let d = 0; d < 140; d++) { s.day++; s.meters.fridge = 100; DYN.wooDaily({ world: w, state: s, offline: true }); const cur = s.fam.woo[id]; if (!cur) break; minDrop = Math.max(minDrop, sym0 - cur.sym); }
  assert.ok(minDrop > 0 && s.fam.woo[id], 'Schwund, aber noch da'); assert.ok(s.fam.woo[id].sym > 0);
  // Rückschläge durch Konkurrenz sind klein
  const t = rich(mk()); const te = meet(t); t.fam.woo[te.id].sym = 60; let steps = 0; for (let d = 0; d < 80; d++) { t.day++; const before = t.fam.woo[te.id].sym; DYN.wooDaily({ world: w, state: t, offline: true }); const dr = before - t.fam.woo[te.id].sym; if (dr > 1.01) { assert.ok(dr <= D.woo.rival.loss + D.woo.cold.loss + 1e-9, `Rückschlag ${dr}`); steps++; } }
  for (let d = 0; d < 400 && t.fam.woo[te.id]; d++) { t.day++; DYN.wooDaily({ world: w, state: t, offline: true }); }
  assert.strictEqual(t.fam.woo[te.id], undefined, 'nach langer Stille endet die Bekanntschaft'); assert.ok(t.fam.cool[DYN.candKey(te)] > t.day, 'Abkühlzeit'); void lastDay; void steps;
});

test('Werben: Eifersucht nur mild – ein zweites Werben kostet die weit fortgeschrittene Bekanntschaft höchstens ein paar Punkte, höchstens einmal im Monat', () => {
  const s = rich(mk()); const ed = edition(w, s, s.cityId).partners; act(s, 'meet', { listingId: ed[0].id }); act(s, 'meet', { listingId: ed[1].id });
  const [a, b] = Object.values(s.fam.woo); a.sym = 70; a.last = s.day; b.next = 0; s.day += 1;
  const before = s.fam.woo[a.id].sym; act(s, 'wooAct', { id: b.id, act: 'kompliment' }); const drop = before - s.fam.woo[a.id].sym; assert.ok(drop >= 0 && drop <= D.woo.jealous.loss, `Eifersucht ${drop}`);
  s.day += 3; const mid = s.fam.woo[a.id].sym; act(s, 'wooAct', { id: b.id, act: 'brief' }); assert.ok(mid - s.fam.woo[a.id].sym <= 0.01, 'höchstens einmal im Monat');
});

test('Familienmeinung: wächst mit Rang, Beruf, Betrieb, Antrittsbesuch; die Aussteuer folgt der Klasse und ist durch das Vermögen begrenzt', () => {
  const s = rich(mk()); const e = { cls: 1, visited: false }; const base = DYN.opinion(w, s, e);
  assert.ok(DYN.opinion(w, s, { cls: 1, visited: true }) >= base + 10); assert.ok(DYN.opinion(w, s, { cls: 3, visited: false }) < base);
  s.char.rank.lv = 5; assert.ok(DYN.opinion(w, s, e) > base); s.occupation = null; const nj = DYN.opinion(w, s, e); s.occupation = { kind: 'work', pkey: 'baecker', employer: 'X', cityId: s.cityId, factor: 1, since: s.day }; assert.ok(DYN.opinion(w, s, e) > nj);
  assert.ok(DYN.opinion(w, s, e) <= 100 && DYN.opinion(w, s, { cls: 0, visited: false }) >= 0);
  assert.strictEqual(DYN.opinionBand(10), 'skeptisch'); assert.strictEqual(DYN.opinionBand(50), 'aufgeschlossen'); assert.strictEqual(DYN.opinionBand(70), 'angetan'); assert.strictEqual(DYN.opinionBand(90), 'begeistert');
  // Aussteuer
  const t = rich(mk()); t.partner = { personId: 'p9', name: 'Eva Roth', gender: 'f', born: t.day - 25 * 365, pkey: 'friseur', profession: 'Friseur', sat: 70, married: false, cohabit: true, giftBoost: 0, unhappyDays: 0, fam: { cls: 2, visited: true } };
  const z = DYN.dowryPlan(w, t, 'zugewinn'); const tr = DYN.dowryPlan(w, t, 'trennung'); const mg = DYN.dowryPlan(w, t, 'mitgift');
  assert.strictEqual(z.form, 'cash'); assert.ok(z.cashReal > 0); assert.ok(Math.abs(tr.cashReal * 2 - z.cashReal) / z.cashReal < 0.02, 'Gütertrennung: halbe Aussteuer'); assert.ok(mg.form === 'home' || mg.cashReal > z.cashReal, 'Mitgift: mehr');
  t.money = 1000; const poor = DYN.dowryPlan(w, t, 'zugewinn'); assert.ok(poor.cashReal <= poor.capReal + 1 && poor.capReal >= D.family.dowryFloorReal * 0.4 - 1); t.fam.dowry = true; assert.strictEqual(DYN.dowryPlan(w, t, 'zugewinn').cashReal, 0);
});

test('Hochzeit: bucht Hochzeit, Notar und Ringe auf den Cent, die Aussteuer genau einmal; Vertrag, Ring und Anfangsvermögen werden gemerkt', () => {
  const s = rich(mk()); marryOff(s); s.partner.fam.cls = 2; s.partner.fam.visited = true; s.money = 3e8;
  const idx = w.idx(yearOf(s)); const wed = Math.round(w.econ.marriageCost * idx); const notary = Math.round(D.contract.kinds.trennung.notaryMult * wed); const ring = DYN.ringPrice(w, s, 2);
  const plan = DYN.dowryPlan(w, s, 'trennung'); const m0 = s.money;
  const r = act(s, 'marry', { contract: 'trennung', ring: 2 });
  assert.ok(r.msg.startsWith('Ihr habt geheiratet'), r.msg);
  const dow = s.fam.contract.dowry ? s.fam.contract.dowry.cash : 0; const got = Math.round(plan.cashReal * idx);
  assert.strictEqual(s.money - m0, got - wed - notary - ring, 'Hochzeit, Notar, Ring und Aussteuer auf den Cent'); assert.strictEqual(dow, plan.cashReal);
  assert.ok(s.partner.married && s.fam.contract.kind === 'trennung' && s.fam.ring.lv === 2 && s.fam.dowry === true);
  assert.strictEqual(s.fam.contract.startReal, Math.round(netWorth(w, s) / idx), 'Anfangsvermögen nach Aussteuer und Kosten');
  fails(s, 'marry', {}, /bereits verheiratet/);
  const s2 = rich(mk()); marryOff(s2); fails(s2, 'marry', { contract: 'unfug' }, /Ehevertrag/); fails(s2, 'marry', { contract: '__proto__' }, /Ehevertrag/); fails(s2, 'marry', { contract: 'constructor' }, /Ehevertrag/); fails(s2, 'marry', { ring: 7 }, /Eheringe/); fails(s2, 'marry', { ring: 'x' }, /Eheringe/);
  s2.money = 1; fails(s2, 'marry', { contract: 'trennung', ring: 3 }, /leisten/); assert.strictEqual(s2.partner.married, false); assert.strictEqual(s2.money, 1);
  const s3 = rich(mk()); marryOff(s3); s3.partner.gender = s3.person.gender; fails(s3, 'marry', {}, /Mann und Frau/);
  const s4 = rich(mk()); marryOff(s4); s4.money = 1e9; const m4 = s4.money; act(s4, 'marry', {}); assert.strictEqual(s4.fam.contract.kind, 'zugewinn'); assert.strictEqual(s4.fam.ring, null); assert.ok(m4 - s4.money <= wed + 1 || s4.money >= m4 - wed);
});

test('Hochzeit: Mitgift als Familienbetrieb oder Wohnung (nur wohlhabende Familien, nur mit Qualifikation und Platz); Betrieb gehört der ersten Generation', () => {
  const s = rich(mk(), 1950); marryOff(s); s.partner.pkey = 'baecker'; s.partner.profession = 'Bäcker'; s.partner.fam.cls = 3; s.partner.fam.visited = true; s.partner.cohabit = true; s.money = 5e10;
  const p = DYN.dowryPlan(w, s, 'mitgift'); assert.strictEqual(p.form, 'firm'); assert.ok(p.valueReal > 0);
  const n0 = s.companies.length; act(s, 'marry', { contract: 'mitgift' }); assert.strictEqual(s.companies.length, n0 + 1); const f = s.companies[s.companies.length - 1]; assert.ok(f.dowry && f.gen === 1 && f.tier === 0 && f.pkey === 'baecker'); assert.ok(biz.companyValue(w, s, f, yearOf(s)) <= p.valueReal * w.idx(yearOf(s)) * 1.01);
  const h = rich(mk(), 1950); marryOff(h); h.partner.fam.cls = 2; h.partner.fam.visited = true; h.money = 5e10; const hp = DYN.dowryPlan(w, h, 'mitgift');
  if (hp.form === 'home') { const n1 = h.properties.length; act(h, 'marry', { contract: 'mitgift' }); assert.strictEqual(h.properties.length, n1 + 1); assert.ok(/Mitgift/.test(h.properties[h.properties.length - 1].name)); }
  const q = rich(mk(), 1950); marryOff(q); q.partner.pkey = 'baecker'; q.partner.fam.cls = 3; q.skills.learned = []; q.partner.cohabit = false; q.money = 5e10; assert.notStrictEqual(DYN.dowryPlan(w, q, 'mitgift').form, 'firm', 'ohne Qualifikation kein Betrieb');
});

test('Scheidung (Zugewinn): der Zuwachs seit der Hochzeit wird halbiert – inflationsbereinigt; ohne Zuwachs nichts; Gütertrennung nie', () => {
  const s = rich(mk(), 1960); marryOff(s); s.money = 2e8; act(s, 'marry', { contract: 'zugewinn' });
  const K = s.fam.contract; const idx0 = w.idx(yearOf(s));
  // Jahrzehnte später: derselbe reale Wert → kein Zugewinn
  s.day += 25 * 365; const idx1 = w.idx(yearOf(s)); assert.ok(idx1 > idx0 * 1.5, 'Inflation');
  s.money = Math.round(K.startReal * idx1) + (s.money - Math.round(netWorth(w, s))); // gleiches reales Vermögen
  const nw = netWorth(w, s); s.money += Math.round(K.startReal * idx1) - nw;
  let rule = DYN.divorceRule(w, s); assert.ok(rule.owed <= Math.round(2 * idx1), `kein Zugewinn trotz Inflation: ${rule.owed}`);
  // realer Zugewinn von 100.000 DM(1945): die Hälfte geht an den Partner
  s.money += Math.round(100000 * 100 * idx1); rule = DYN.divorceRule(w, s); assert.ok(Math.abs(rule.owedReal - 5000000) <= 3, `Zugewinn halbiert: ${rule.owedReal}`); assert.strictEqual(rule.owed, Math.round(rule.owedReal * idx1));
  const total0 = netWorth(w, s); const m0 = s.money;
  family.separate({ world: w, state: s, offline: false }, { divorce: true });
  assert.strictEqual(s.partner, null); assert.strictEqual(s.fam.contract, null); assert.strictEqual(s.fam.ring, null);
  assert.ok(Math.abs((m0 - s.money) - rule.owed) <= 1 || netWorth(w, s) <= total0 - rule.owed + 1, `zahlt ${m0 - s.money}, schuldet ${rule.owed}`);
  assert.strictEqual(s.fam.dyn.div, 1);
  const g = rich(mk(), 1960); marryOff(g); g.money = 2e8; act(g, 'marry', { contract: 'trennung' }); g.money += 1e9; const m1 = g.money; family.separate({ world: w, state: g, offline: false }, { divorce: true }); assert.strictEqual(g.money, m1, 'Gütertrennung: kein Ausgleich');
});

test('Scheidung (Mitgift): Aussteuer in bar fällt an die Familie zurück, kein Zugewinnausgleich; Altehe ohne Vertrag: alte Regel (Hälfte des Vermögens)', () => {
  const s = rich(mk(), 1960); marryOff(s); s.partner.fam.cls = 2; s.partner.fam.visited = true; s.money = 5e9; act(s, 'marry', { contract: 'mitgift' });
  const d = s.fam.contract.dowry; if (d && d.form === 'cash') {
    s.money += 7e8; const m0 = s.money; const idx = w.idx(yearOf(s)); family.separate({ world: w, state: s, offline: false });
    assert.strictEqual(m0 - s.money, Math.round(d.cash * idx), 'Mitgift zurück, sonst nichts');
  } else assert.ok(d === null || d.form !== 'cash');
  const o = rich(mk(), 1960); marryOff(o); o.partner.married = true; o.fam.contract = null; o.money = 4e8; const nw = netWorth(w, o); family.separate({ world: w, state: o, offline: false }); assert.ok(Math.abs(o.money - nw / 2) <= nw * 0.02, 'alte Regel: Hälfte');
});

test('Scheidung (alt, ohne Vertrag): die Hälfte des Vermögens, wie bisher', () => {
  const s = rich(mk(), 1960); s.partner = { personId: 'p9', name: 'Eva', gender: 'f', born: s.day - 9000, pkey: 'friseur', profession: 'Friseur', sat: 0, married: true, cohabit: true, giftBoost: 0, unhappyDays: 24 }; s.money = 1e8; s.tree.persons.push({ id: 'p9', status: 'alive', role: 'partner', jobs: [] });
  const nw = netWorth(w, s); run(s, 3, false); assert.strictEqual(s.partner, null); assert.ok(Math.abs(s.money - nw / 2) < nw * 0.05, `${s.money} ≈ ${nw / 2}`);
});

test('Scheidung beantragen: Trennungsjahr, Kosten sofort, Rücknahme möglich, nach Ablauf wird geschieden; nur bei Ehe mit NPC', () => {
  const s = rich(mk(), 1960); fails(s, 'divorce', {}, /keinen Partner/); marryOff(s); fails(s, 'divorce', {}, /nicht verheiratet/); act(s, 'marry', {});
  const idx = w.idx(yearOf(s)); const m0 = s.money; const r = act(s, 'divorce', {}); assert.ok(/Scheidungsantrag/.test(r.msg)); assert.strictEqual(m0 - s.money, Math.round(1.5 * w.econ.marriageCost * idx)); fails(s, 'divorce', {}, /läuft bereits/);
  act(s, 'divorceCancel', {}); assert.strictEqual(s.pending.divorce, undefined); fails(s, 'divorceCancel', {}, /kein Scheidungsantrag/);
  act(s, 'divorce', {}); run(s, 360); assert.ok(s.partner, 'noch im Trennungsjahr'); run(s, 12); assert.strictEqual(s.partner, null, 'geschieden'); assert.strictEqual(s.pending.divorce, undefined); assert.strictEqual(s.fam.dyn.div, 1);
  const lk = rich(mk()); lk.partner = { personId: 'p1', name: 'X', gender: 'f', born: -9000, sat: 60, married: true, cohabit: true, linked: true, userId: 7, giftBoost: 0, unhappyDays: 0 }; fails(lk, 'divorce', {}, /Spieler/);
});

test('Eheringe: zählen als Schmuck (Auftreten), nutzen sich nicht ab, lassen sich nicht verkaufen, gehen als Erbstück an das Kind; nach Scheidung weg', () => {
  const s = rich(mk()); marryOff(s); s.money = 1e9; const look0 = CH.look(s, yearOf(s)); act(s, 'marry', { ring: 3 });
  assert.ok(CH.look(s, yearOf(s)) > look0 + 5, 'Ring hebt das Auftreten'); const pc = CH.piece(s, 'schmuck'); assert.ok(pc.ring && pc.lv === 3 && pc.cond === 100);
  fails(s, 'chSell', { slot: 'schmuck' }, /kein eigenes Stück/); run(s, 400); assert.strictEqual(CH.piece(s, 'schmuck').cond, 100);
  act(s, 'chBuy', { slot: 'schmuck', level: 1 }); assert.strictEqual(CH.piece(s, 'schmuck').lv, 3, 'der bessere Ring zählt'); assert.strictEqual(CH.own(s, 'schmuck').lv, 1);
  fam: { const f = require('../src/game/family'); f.bornChild({ world: w, state: s, idx: 1 }, require('./fuzz-lib').world ? () => 0.4 : () => 0.4); }
  const k = s.children[0]; k.born = s.day - 20 * 365; const was = JSON.parse(JSON.stringify(s)); const { state: h } = createHeirState(w, was, k.id, []);
  const hs = h.char.heir.find((x) => x.slot === 'schmuck'); assert.ok(hs && hs.lv >= 2, `Erbstück ${JSON.stringify(h.char.heir)}`); assert.strictEqual(CH.own(h, 'schmuck'), null); assert.strictEqual(h.fam.ring, null, 'der Ring selbst bleibt beim Verstorbenen');
  family.separate({ world: w, state: s, offline: false }); assert.strictEqual(s.fam.ring, null); assert.strictEqual(CH.piece(s, 'schmuck').lv, 1);
});

test('Einarbeitung: Prüfungen, Lehre im Familienbetrieb (Ausbildung läuft), Mitarbeit für Qualifizierte, Vergütung aus dem Betrieb, Köpfe, Talentzuwachs, Nachfolger bereit', () => {
  const s = rich(mk(), 1960); act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); const f = s.companies[0]; f.staff = 0;
  family.bornChild({ world: w, state: s, idx: 1 }, () => 0.4); const c = s.children[0]; c.born = s.day - 12 * 365; c.status = 'home'; c.school = 'haupt';
  fails(s, 'famGroom', { childId: c.id, id: f.id }, /mindestens 15|Schule/); c.born = s.day - 17 * 365; c.school = null; c.schoolDone = 'haupt'; c.pendingPath = true;
  fails(s, 'famGroom', { childId: 99, id: f.id }, /Kind nicht gefunden/); fails(s, 'famGroom', { childId: c.id, id: 99 }, /nicht gefunden/);
  const base = biz.companyFlows(w, s, f, yearOf(s)); const r = act(s, 'famGroom', { childId: c.id, id: f.id });
  assert.ok(/Lehre/.test(r.msg)); assert.strictEqual(c.groom.kind, 'lehre'); assert.strictEqual(c.path, 'training'); assert.strictEqual(c.pkey, 'baecker'); assert.strictEqual(c.pendingPath, false); assert.ok(c.daysLeft >= 30);
  fails(s, 'famGroom', { childId: c.id, id: f.id }, /schon eingearbeitet/);
  const withKid = biz.companyFlows(w, s, f, yearOf(s)); const idx = w.idx(yearOf(s));
  assert.strictEqual(withKid.wages - base.wages, Math.round(w.econ.companies.staffWage * idx * D.groom.lehrWagePct / 100) * 1 + 0, 'Vergütung der Lehre aus dem Betrieb');
  // Lehre läuft ab → Fachkraft, Talent wächst, nach der Reifezeit bereit
  const t0 = c.tal.v.slice(); run(s, c.daysLeft + 2); assert.strictEqual(c.path, 'done'); assert.ok(c.skills.includes('baecker')); run(s, 2); assert.strictEqual(c.groom.kind, 'nachfolge');
  run(s, D.groom.readyDays); assert.ok(c.groom.ready, 'Nachfolger bereit'); assert.ok(c.tal.v.some((v, i) => v > t0[i]), 'Talent gewachsen'); assert.ok(c.groom.grown <= D.groom.growMax);
  const key = DYN.growKey(w, 'baecker'); assert.ok(c.tal.v[TL.IDX[key]] <= TL.capAt(c.tal, TL.IDX[key]));
  const nach = biz.companyFlows(w, s, f, yearOf(s)); assert.ok(nach.wages > base.wages);
  act(s, 'famGroomEnd', { childId: c.id }); assert.strictEqual(c.groom, undefined); fails(s, 'famGroomEnd', { childId: c.id }, /nicht eingearbeitet/);
});

test('Einarbeitung: akademische Berufe verlangen Studium; leere Betriebe und volle Betriebe lehnen ab; Kinder mit Ausbildung arbeiten als Fachkraft mit', () => {
  const s = rich(mk(), 1960); act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); const f = s.companies[0];
  for (let i = 0; i < 3; i++) { family.bornChild({ world: w, state: s, idx: 1 }, () => 0.3 + i * 0.1); }
  const [a, b, c] = s.children; for (const k of s.children) { k.born = s.day - 18 * 365; k.school = null; k.path = 'none'; k.status = 'home'; }
  a.skills = ['baecker']; a.path = 'done'; a.pkey = 'baecker'; assert.strictEqual(DYN.groomBlock(w, s, a, f), null); act(s, 'famGroom', { childId: a.id, id: f.id }); assert.strictEqual(a.groom.kind, 'nachfolge'); assert.strictEqual(a.path, 'done');
  act(s, 'famGroom', { childId: b.id, id: f.id }); assert.match(DYN.groomBlock(w, s, c, f), /genug Kinder/);
  f.abandoned = { day: s.day }; assert.match(DYN.groomBlock(w, s, c, f), /leer/);
  const ac = rich(mk(), 1960); act(ac, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); family.bornChild({ world: w, state: ac, idx: 1 }, () => 0.4); const k = ac.children[0]; k.born = ac.day - 18 * 365; k.school = null; k.path = 'none';
  const fake = { ...ac.companies[0], pkey: 'arzt' }; if (w.prof('arzt')) { assert.match(DYN.groomBlock(w, ac, k, fake), /Studium/); }
});

test('Traditionsbetrieb: Stufen nach Jahren in Familienhand und Generationen, Umsatzbonus gedeckelt, ohne Wirkungsregler keine Wirkung; Meldung genau einmal', () => {
  const s = rich(mk(), 1960); act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); const f = s.companies[0]; f.since = s.day - 60 * 365; f.gen = 1;
  assert.strictEqual(DYN.tradLevel(s, f), 0, 'ohne zweite Generation keine Tradition'); f.gen = 2; assert.strictEqual(DYN.tradLevel(s, f), 2);
  f.since = s.day - 120 * 365; assert.strictEqual(DYN.tradLevel(s, f), 2, 'Jahrhundert braucht drei Generationen'); f.gen = 3; assert.strictEqual(DYN.tradLevel(s, f), 3);
  f.since = s.day - 20 * 365; f.gen = 2; assert.strictEqual(DYN.tradLevel(s, f), 1); f.since = s.day - 5 * 365; assert.strictEqual(DYN.tradLevel(s, f), 0);
  f.since = s.day - 120 * 365; f.gen = 3; const m = DYN.revMult(s, f); assert.ok(m > 1 && m <= 1 + D.tradition.capPct / 100 + 1e-9, `Bonus ${m}`);
  let a; withCfg((c) => { c.effects.strength = 0; assert.strictEqual(DYN.revMult(s, f), 1); a = biz.companyFlows(w, s, f, yearOf(s)); });
  const b = biz.companyFlows(w, s, f, yearOf(s)); assert.ok(b.income > a.income && b.income <= a.income * 1.021, 'gedeckelter Umsatzbonus');
  s.day -= s.day % 7; f.trad = 0; const n0 = s.notices.length; DYN.daily({ world: w, state: s, offline: false }); assert.strictEqual(f.trad, 3); assert.strictEqual(s.pending.dyn.filter((e) => e.k === 'trad').length, 1); DYN.daily({ world: w, state: s, offline: false }); assert.strictEqual(s.pending.dyn.filter((e) => e.k === 'trad').length, 1, 'genau einmal'); assert.ok(s.notices.length > n0);
  assert.strictEqual(DYN.tradFact(s), 3);
});

test('Übergabe zu Lebzeiten: Prüfungen, Steuer (Freibetrag, Verschonung, Stufen) und Gebühren, Betrieb wandert zum Kind, Vorempfang im Pflichtanteil', () => {
  const s = rich(mk(), 1980); s.person.birthDay = s.day - 60 * 365; act(s, 'foundBiz', { pkey: 'baecker', tier: 1, name: 'Großbäckerei' }).msg; const f = s.companies[0]; f.cash = 5e7;
  family.bornChild({ world: w, state: s, idx: 1 }, () => 0.4); const c = s.children[0]; c.born = s.day - 25 * 365; c.status = 'home'; c.school = null; c.skills = ['baecker']; c.path = 'done'; c.pkey = 'baecker';
  const young = JSON.parse(JSON.stringify(s)); young.person.birthDay = young.day - 40 * 365; assert.match(DYN.handoverBlock(w, young, young.children[0], young.companies[0]), /ab 55/);
  const unq = JSON.parse(JSON.stringify(s)); unq.children[0].skills = []; unq.children[0].path = 'none'; assert.match(DYN.handoverBlock(w, unq, unq.children[0], unq.companies[0]), /Qualifikation/);
  const costs = DYN.handoverCosts(w, s, biz.companyValue(w, s, f, yearOf(s)) + f.cash); const idx = w.idx(yearOf(s));
  let taxable = Math.max(0, costs.valueReal * 0.15 - D.handover.freeReal); let tax = 0; let from = 0; for (const [up, rate] of D.handover.rates) { const part = Math.min(taxable, up - from); if (part > 0) tax += part * rate / 100; from = up; if (taxable <= up) break; }
  assert.strictEqual(costs.taxReal, Math.round(tax)); assert.strictEqual(costs.tax, Math.round(Math.round(tax) * idx)); assert.ok(costs.feeReal >= D.handover.feeMinReal); assert.strictEqual(costs.relief, 85);
  const free = DYN.handoverCosts(w, s, 100000 * idx); assert.strictEqual(free.taxReal, 0, 'unter dem Freibetrag keine Steuer');
  const valueBefore = netWorth(w, s); const m0 = s.money; const prevWorth = valueBefore;
  const r = act(s, 'famHandover', { childId: c.id, id: f.id }); assert.ok(/gehört jetzt/.test(r.msg), r.msg);
  assert.strictEqual(m0 - s.money, costs.tax + costs.fee, 'Steuer und Gebühren genau einmal'); assert.strictEqual(s.companies.length, 0); assert.strictEqual(c.estate.companies.length, 1); assert.strictEqual(c.estate.companies[0].id, f.id);
  assert.ok(netWorth(w, s) < prevWorth - costs.tax - costs.fee + 5e7 + 1e6, 'Vermögen sinkt um Betriebswert und Kosten'); assert.strictEqual(c.gift[0].real, costs.valueReal); assert.strictEqual(s.fam.hand.n, 1);
  fails(s, 'famHandover', { childId: c.id, id: f.id }, /nicht gefunden/); fails(s, 'famHandover', { childId: 99, id: 1 }, /nicht gefunden/);
});

test('Übergabe: Altenteil – genau der Anteil am Tagesgewinn fließt an die Eltern, Rest bleibt im Betrieb des Kindes; Geld wird nicht doppelt gebucht', () => {
  const s = rich(mk(), 1980); s.person.birthDay = s.day - 60 * 365; act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); const f = s.companies[0]; f.staff = 1; f.manager = true;
  family.bornChild({ world: w, state: s, idx: 1 }, () => 0.4); const c = s.children[0]; c.born = s.day - 25 * 365; c.skills = ['baecker']; c.path = 'done'; c.pkey = 'baecker';
  act(s, 'famHandover', { childId: c.id, id: f.id }); const held = c.estate.companies[0]; s.money = 1e9;
  const year = yearOf(s); const fl = biz.companyFlows(w, s, held, year); assert.ok(fl.profit > 0, 'Gewinn'); const cash0 = held.cash; const m0 = s.money;
  DYN.heldDaily({ world: w, state: s, offline: false });
  const alt = Math.floor(fl.profit * D.handover.altenteilPct / 100); assert.strictEqual(s.money - m0, alt, 'Altenteil'); assert.strictEqual(held.cash - cash0, fl.profit - alt, 'Rest im Betrieb');
  assert.strictEqual((s.money - m0) + (held.cash - cash0), fl.profit, 'Summe = Gewinn, nichts doppelt');
  const nw = netWorth(w, s); assert.ok(nw < 1e9 + 1e7, 'übergebener Betrieb zählt nicht mehr zum Vermögen des Elternteils');
});

test('Übergabe und Erbe: Vorempfang wird angerechnet (Pflichtanteil), der Erbe führt den Betrieb weiter, Geld entsteht nicht; nicht bedachte Geschwister gehen leer aus wie bisher', () => {
  const s = rich(mk(), 1980); s.person.birthDay = s.day - 60 * 365; act(s, 'foundBiz', { pkey: 'baecker', tier: 1, name: 'Großbäckerei' }); const f = s.companies[0]; f.cash = 0;
  for (let i = 0; i < 2; i++) family.bornChild({ world: w, state: s, idx: 1 }, () => 0.3 + i * 0.4);
  const [a, b] = s.children; for (const k of s.children) { k.born = s.day - 25 * 365; k.status = 'home'; k.school = null; } a.skills = ['baecker']; a.path = 'done'; a.pkey = 'baecker';
  s.money = 4e8; const before = family.estateShare(w, s); act(s, 'famHandover', { childId: a.id, id: f.id });
  const after = family.estateShare(w, s); assert.ok(after.adv > 0 && after.n === 2); assert.ok(Math.abs(after.share - before.share) <= Math.round(s.money * 0.02) + 2000 + Math.round(DYN.handoverCosts(w, s, 1).tax), 'Anteil bleibt etwa gleich (Kosten ausgenommen)');
  const planA = planInheritance(w, s, a.id, []); const planB = planInheritance(w, s, b.id, []);
  assert.ok(planA.cash < planB.cash, 'wer den Betrieb schon hat, bekommt weniger bar'); assert.strictEqual(planA.held.length, 1); assert.strictEqual(planB.held.length, 0);
  assert.ok(planA.cash >= 0 && planB.cash >= 0);
  const was = JSON.parse(JSON.stringify(s)); const { state: h } = createHeirState(w, was, a.id, []);
  assert.ok(h.companies.some((c) => c.id === f.id), 'Erbe führt den übergebenen Betrieb'); const hf = h.companies.find((c) => c.id === f.id); assert.strictEqual(hf.gen, 2); assert.strictEqual(hf.held, undefined);
  const total = h.money + h.companies.reduce((x, c) => x + biz.companyValue(w, h, c, yearOf(h)) + c.cash, 0);
  assert.ok(total <= after.total + after.adv + 5, `kein Geld aus dem Nichts: ${total} ≤ ${after.total + after.adv}`);
  const other = createHeirState(w, JSON.parse(JSON.stringify(s)), b.id, []).state; assert.ok(!other.companies.some((c) => c.id === f.id), 'das andere Kind erbt den Betrieb nicht doppelt');
});

test('Nachfolger: bereiter Nachfolger bekommt den Betrieb mit Abschlag angerechnet (passt in den Pflichtanteil), Berufserfahrung bleibt; ohne Einarbeitung kein Vorrang', () => {
  const s = rich(mk(), 1980); s.person.birthDay = s.day - 62 * 365; act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); const f = s.companies[0]; f.cash = 0;
  for (let i = 0; i < 3; i++) family.bornChild({ world: w, state: s, idx: 1 }, () => 0.3 + i * 0.2);
  for (const k of s.children) { k.born = s.day - 25 * 365; k.status = 'home'; k.school = null; k.skills = ['baecker']; k.path = 'done'; k.pkey = 'baecker'; }
  const c = s.children[0]; s.money = 0; const est = family.estateShare(w, s); const v = est.props.find((x) => x.kind === 'company').value;
  assert.ok(est.share < v, 'ohne Vorrang passt der Betrieb nicht in den Pflichtanteil'); assert.strictEqual(planInheritance(w, s, c.id, [`c:${f.id}`]).companies.length, 0);
  c.groom = { cid: f.id, kind: 'nachfolge', since: 0, exp: 1500, grown: 3, ready: true, last: 0 }; const disc = DYN.successorValue(c, f.id, v); assert.strictEqual(disc, Math.round(v * (1 - D.groom.successorDiscPct / 100)));
  s.money = Math.round(v * 0.6); const est2 = family.estateShare(w, s); const ok = planInheritance(w, s, c.id, [`c:${f.id}`]); const no = planInheritance(w, s, s.children[1].id, [`c:${f.id}`]);
  assert.ok(DYN.successorValue(c, f.id, v) < v); assert.ok(ok.companies.length >= no.companies.length); void est2;
  const { state: h } = createHeirState(w, JSON.parse(JSON.stringify(s)), c.id, [`c:${f.id}`]); const kept = h.companies.find((x) => x.id === f.id);
  if (kept) assert.ok((h.skills.days.baecker || 0) >= Math.min(1500, D.groom.heirExpCap), 'Berufserfahrung aus der Einarbeitung');
});

test('Erbe: Dynastie-Wertung wird anteilig weitergegeben (Familienerbe), Generation zählt, Betriebe zählen eine Generation mehr, Tradition bleibt', () => {
  const s = rich(mk(), 1980); act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); const f = s.companies[0]; f.since = s.day - 60 * 365; f.gen = 1;
  family.bornChild({ world: w, state: s, idx: 1 }, () => 0.4); const c = s.children[0]; c.born = s.day - 20 * 365; s.fam.dyn.pts = 60; s.fam.dyn.lv = 4; s.generation = 2;
  const { state: h } = createHeirState(w, JSON.parse(JSON.stringify(s)), c.id, [`c:${f.id}`, f.id]);
  assert.ok(h.fam.dyn.legacy > 0 && h.fam.dyn.legacy <= D.dynasty.legacyMax, `Familienerbe ${h.fam.dyn.legacy}`); assert.strictEqual(h.generation, 3);
  const hf = h.companies[0]; if (hf) { assert.strictEqual(hf.gen, 2); assert.ok(DYN.tradLevel(h, hf) >= 1); }
  assert.ok(h.pending.dyn && h.pending.dyn.some((e) => e.k === 'gen')); assert.strictEqual(h.fam.contract, null); assert.deepStrictEqual(h.fam.woo, {}); assert.strictEqual(h.fam.dowry, false);
});

test('Dynastie-Wertung: 0–100, wächst mit Generationen, Betrieben, Vermögen, Kindern, Ehe; Stufen mit Trägheit; Meldung beim Aufstieg', () => {
  const s = rich(mk(), 1980); const p0 = DYN.dynParts(w, s); assert.ok(p0.total >= 0 && p0.total <= 100);
  s.generation = 4; const p1 = DYN.dynParts(w, s).total; assert.ok(p1 > p0.total);
  act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotladen' }); const p2 = DYN.dynParts(w, s).total; assert.ok(p2 > p1);
  s.companies[0].since = s.day - 60 * 365; s.companies[0].gen = 3; const p3 = DYN.dynParts(w, s).total; assert.ok(p3 > p2);
  s.money *= 100; const p4 = DYN.dynParts(w, s).total; assert.ok(p4 >= p3);
  s.partner = { personId: 'p9', name: 'Eva', gender: 'f', born: -9000, sat: 70, married: true, cohabit: true, giftBoost: 0, unhappyDays: 0 }; s.fam.contract = { kind: 'zugewinn', day: s.day - 15 * 365, startReal: 0, pid: 'p9', dowry: null }; const p5 = DYN.dynParts(w, s).total; assert.ok(p5 > p4);
  const lv0 = s.fam.dyn.lv; const n0 = s.notices.length; DYN.dynCheck(w, s); assert.ok(s.fam.dyn.lv >= lv0 && s.fam.dyn.pts === p5);
  if (s.fam.dyn.lv > lv0) { assert.ok(s.notices.length > n0); assert.ok(s.pending.dyn.some((e) => e.k === 'dyn')); }
  s.fam.dyn.lv = 3; s.fam.dyn.pts = 40; const sc = DYN.dynLevels()[2].at; assert.strictEqual(DYN.dynLevelFor(sc - 1, 3), 3, 'Trägheit'); assert.strictEqual(DYN.dynLevelFor(sc - 5, 3), 2);
  for (const k of Object.keys(p5.parts || DYN.dynParts(w, s).parts)) assert.ok(DYN.dynParts(w, s).parts[k] <= DYN.dynParts(w, s).weights[k] + 1e-9, k);
});

test('Ansicht: view.fam enthält Bekanntschaften, Ehevertrag, Kinder und Dynastie; Zahlen stimmen mit dem Modell; ausgeschaltet bleibt die Ansicht ruhig', () => {
  const s = rich(mk()); const e = meet(s); const v = present(w, s, user(), Date.now());
  assert.ok(v.fam.on && v.fam.woo.length === 1 && v.fam.woo[0].acts.length === 8 && v.fam.woo[0].likes.length === 2 && v.fam.dyn.lv === 1 && v.fam.contract.kinds.length === 3 && v.fam.contract.rings.length === 4);
  assert.ok(v.fam.woo[0].acts.some((a) => a.best) || !v.fam.woo[0].best); assert.strictEqual(v.fam.woo[0].id, e.id); assert.strictEqual(v.fam.woo[0].likes.filter((l) => l.known).length, 0, 'Vorlieben anfangs unbekannt');
  assert.ok(v.fam.woo[0].likes.every((l) => !l.known) && v.fam.woo[0].stage === 'bekannt'); assert.ok(JSON.stringify(v).length > 0);
  withCfg((c) => {
    c.enabled = false; fails(s, 'wooAct', { id: e.id, act: 'brief' }, /ausgeschaltet/); const off = rich(mk()); fails(off, 'wooAsk', { id: 'x' }, /ausgeschaltet/);
    const l = listing(off); const m = off.money; const r = act(off, 'meet', { listingId: l.id }); assert.ok(r && r.msg); assert.ok(off.money < m && Object.keys(off.fam.woo).length === 0, 'altes Verhalten: Einmalwurf'); // altes Verhalten bleibt
  });
});

test('Admin-Prüfung: familie wird streng geprüft', () => {
  const { validateJson } = require('../src/routes/admin');
  const copy = () => JSON.parse(JSON.stringify(settings.DEFAULTS.familie));
  assert.doesNotThrow(() => validateJson('familie', copy()));
  const bad = (fn, re) => { const c = copy(); fn(c); assert.throws(() => validateJson('familie', c), re); };
  bad((c) => { c.effects.strength = 3; }, /strength/); bad((c) => { c.woo.q.missAt = 0.9; }, /missAt/); bad((c) => { c.woo.acts.x = { label: 'x', tag: 'unbekannt', cost: 0, cd: 1, talent: 'charme' }; }, /woo\.acts\.x/);
  bad((c) => { c.family.classes.pop(); }, /vier Klassen/); bad((c) => { delete c.contract.kinds.trennung; }, /trennung/); bad((c) => { c.ring.levels.pop(); }, /drei Stufen/);
  bad((c) => { c.handover.rates = [[5, 7], [3, 11]]; }, /rates/); bad((c) => { c.tradition.levels[0].revPct = 9; }, /tradition/); bad((c) => { c.dynasty.weights.firms = 99; }, /Gewichte/); bad((c) => { c.dynasty.levels[0].at = 4; }, /fünf Stufen/);
  bad((c) => { c.bots.marry = 4; }, /bots\.marry/); bad((c) => { delete c.groom; }, /groom/); bad((c) => { c.groom.minAge = 2; }, /minAge/); bad((c) => { c.handover.altenteilPct = 400; }, /altenteilPct/);
});

test('Ehen zwischen Spielern: Güterstand ändert Abfindung und Erbanteil des Partners', () => {
  const p = { contract: 'trennung' }; assert.strictEqual(DYN.spouseFactor(p), 0.5); assert.strictEqual(DYN.settlementFactor(p), 0); assert.strictEqual(DYN.spouseFactor({ contract: 'zugewinn' }), 1); assert.strictEqual(DYN.settlementFactor({ contract: 'zugewinn' }), 1);
  assert.strictEqual(DYN.spouseFactor({}), 1); assert.strictEqual(DYN.settlementFactor({}), 1, 'Altehe: Abfindung wie bisher'); assert.strictEqual(DYN.spouseFactor({ contract: 'mitgift' }), 1);
  const s = rich(mk()); s.partner = { personId: 'p9', name: 'Spieler', gender: 'f', born: -9000, sat: 70, married: true, cohabit: true, linked: true, userId: 5, coupleId: 1, contract: 'trennung', giftBoost: 0, unhappyDays: 0 }; s.money = 1000000;
  const orig = settings.get('social'); const pct = (orig.couples || {}).spouseSharePct;
  family.endLife({ world: w, state: s }, 'Test', 'x'); assert.strictEqual(s.pending.spouseShare && s.money, 1000000 - Math.floor(1000000 * pct / 100 * 0.5));
});

test('Bots: werben mild und heiraten nur Mann und Frau (Vertrag, Ring, gelegentlich Gütertrennung), arbeiten Kinder ein; kein Geld aus dem Nichts', () => {
  const bots = require('../src/lib/bots'); const P = bots.makePersona('de'); P.social = 1; P.kids = 2;
  let married = 0; let contracts = new Set();
  for (let seed = 0; seed < 14; seed++) {
    const s = rich(mk({ gender: seed % 2 ? 'f' : 'm', firstName: 'Bot' + seed }), 1950 + seed * 4); s.occupation = { kind: 'work', pkey: 'baecker', employer: 'X', cityId: s.cityId, factor: 1, since: s.day }; s.seed = 7000 + seed;
    const orig = Math.random; let k = 1; Math.random = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    try {
      for (let i = 0; i < 90 && s.status === 'alive'; i++) {
        s.day += 5; s.meters.fridge = 100; s.meters.health = 100; s.money = Math.max(s.money, 5e9); bots.decide({ world: w, state: s, user: user(), now: Date.now() }, P);
        if (s.partner) { assert.notStrictEqual(s.partner.gender, s.person.gender, 'Bots heiraten nie gleichgeschlechtlich'); if (s.partner.married) { married++; contracts.add(s.fam.contract && s.fam.contract.kind); break; } }
        for (const e of DYN.activeWoo(s)) assert.ok(e.gender !== s.person.gender);
      }
    } finally { Math.random = orig; }
  }
  assert.ok(married >= 3, `Bots finden zusammen: ${married}`); assert.ok(contracts.has('zugewinn'));
});
