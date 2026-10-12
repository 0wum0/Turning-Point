'use strict';
/** Betrieb 2.0: Module (Stufen, Kosten, Epochen), Lager, Betriebsklima, Führungsaktionen, Betriebsbrand, Versicherung, Altwert „Sicherheitsdienst“ (rein, ohne Datenbank). */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const settings = require('../src/settings');
const OPS = require('../src/game/operations');
const D = require('../src/game/operations-defaults');
const { createCharacter, upgradeState } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const biz = require('../src/game/business');
const core = require('../src/game/core');
const goods = require('../src/game/goods');
const TL = require('../src/game/talents');
const { present } = require('../src/game/present');

const w = testWorld();
const user = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const mk = (over = {}) => createCharacter(w, input(w, over), user());
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i, user: user(), now: Date.now() });
const fails = (s, n, i, re) => assert.throws(() => act(s, n, i), re || /./);
const yearOf = (s) => s.startYear + Math.floor(s.day / 365);
const B = settings.DEFAULTS.betrieb;
const W0 = B.fire.weeklyChance;
const quiet = () => { B.fire.weeklyChance = 0; }; // keine Zufallsbrände, wo sie stören
const loud = () => { B.fire.weeklyChance = W0; };
const rich = (s, year = 1990) => { s.day = (year - 1945) * 365 + 100; s.money = 5e9; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 }; s.meters.fridge = 100; s.skills.days.baecker = 4000; return s; };
const firm = (s, hire = 3) => { act(s, 'foundBiz', { pkey: 'baecker', tier: 0 }); const c = s.companies[0]; c.manager = false; for (let i = 0; i < hire; i++) act(s, 'bizHire', { id: c.id, delta: 1 }); return c; };
const run = (s, days) => { for (let i = 0; i < days && s.status === 'alive'; i++) { s.meters.fridge = 100; s.meters.health = 100; s.money = Math.max(s.money, 1e9); advance(w, s, 1); s.interrupts = []; } };
const withCfg = (patch, fn) => { const save = JSON.stringify(B); try { fn(); } finally { const o = JSON.parse(save); for (const k of Object.keys(B)) delete B[k]; Object.assign(B, o); } };
const wage = (s) => Math.round(w.econ.companies.staffWage * w.idx(yearOf(s)));

test('Standardwerte: vier Module mit je drei Stufen, Kosten und Jahre steigen, Wirkungen werden stärker', () => {
  assert.deepStrictEqual(OPS.KEYS, ['lager', 'brand', 'schutz', 'arbeit']);
  for (const k of OPS.KEYS) {
    const L = D.modules[k].levels; assert.strictEqual(L.length, 3);
    for (let i = 1; i < 3; i++) { assert.ok(L[i].costPct > L[i - 1].costPct, `${k} Kosten`); assert.ok(L[i].from >= L[i - 1].from, `${k} Epoche`); }
  }
  const b = D.modules.brand.levels; assert.ok(b[0].pMult > b[1].pMult && b[1].pMult > b[2].pMult && b[2].dmgMult < b[0].dmgMult);
  const sc = D.modules.schutz.levels; assert.ok(sc[0].repel < sc[1].repel && sc[1].repel < sc[2].repel && sc[2].repel <= 95);
  assert.ok(D.modules.schutz.levels[1].from >= 1970 && D.modules.schutz.levels[2].from >= 1990, 'Alarmanlage ab 1970, Videoüberwachung ab 1990');
  assert.ok(D.effects.climatePct <= 6 && D.effects.priceWindowPct <= 3);
  assert.strictEqual(w.econ.insurance.betrieb.name, 'Betriebsversicherung');
});

test('Altwert: security true gilt als Schutz Stufe 1; upgradeState und setLevel halten Schalter und Stufe im Takt (idempotent)', () => {
  const s = rich(mk({ professionKey: 'baecker' })); quiet();
  const c = firm(s); c.security = true; delete c.mods;
  upgradeState(s); upgradeState(s);
  assert.strictEqual(OPS.level(c, 'schutz'), 1); assert.strictEqual(c.mods.schutz, 1); assert.strictEqual(c.security, true);
  OPS.setLevel(c, 'schutz', 0); assert.strictEqual(c.security, false); assert.strictEqual(OPS.level(c, 'schutz'), 0);
  OPS.setLevel(c, 'schutz', 3); assert.strictEqual(c.security, true);
  OPS.setLevel(c, 'brand', 99); assert.strictEqual(OPS.level(c, 'brand'), 3); OPS.setLevel(c, 'brand', -4); assert.strictEqual(OPS.level(c, 'brand'), 0);
  // alter Spielstand ohne mods: Unterhalt des alten Schalters bleibt (jetzt günstiger) und der Betrieb rechnet
  const d = { ...c, mods: undefined, security: true }; assert.ok(OPS.upkeepDay(w, s, d, yearOf(s)) > 0); assert.ok(biz.companyFlows(w, s, d, yearOf(s)).upkeep > biz.companyFlows(w, s, { ...d, security: false }, yearOf(s)).upkeep);
  // Altspielstand: kein Betriebsklima-Feld, Altversicherung ohne betrieb
  const old = JSON.parse(JSON.stringify(s)); delete old.insurance.betrieb; for (const x of old.companies) { delete x.mods; delete x.ops; for (const m of x.team || []) delete m.mood; }
  upgradeState(old); assert.strictEqual(old.insurance.betrieb, false);
});

test('Kosten: Anteil am Grundwert × Preisindex × Baupreise, Aufpreis rechnet die alte Stufe an; Epochen gelten', () => {
  const s = rich(mk({ professionKey: 'baecker' }), 1960); const c = firm(s); const y = yearOf(s);
  const c1 = OPS.moduleCost(w, s, c, 'brand', 1, y); const c2 = OPS.moduleCost(w, s, c, 'brand', 2, y);
  assert.strictEqual(c1, Math.round(c.base * w.idx(y) * (D.modules.brand.levels[0].costPct / 100) * require('../src/game/cityecon').buildMult(c.cityId, y)));
  assert.strictEqual(OPS.upgradeCost(w, s, c, 'brand', 2, y), c2 - c1);
  const big = { ...c, base: c.base * 3 }; assert.ok(OPS.moduleCost(w, s, big, 'brand', 1, y) >= c1 * 2.9);
  assert.strictEqual(OPS.eraOk('brand', 2, 1969), false); assert.strictEqual(OPS.eraOk('brand', 2, 1970), true); assert.strictEqual(OPS.eraOk('schutz', 3, 1989), false);
  act(s, 'opsBuild', { id: c.id, mod: 'brand' });
  fails(s, 'opsBuild', { id: c.id, mod: 'brand' }, /ab 1970/);   // 1960: Stufe 2 gibt es noch nicht
  s.day = (1971 - s.startYear) * 365; act(s, 'opsBuild', { id: c.id, mod: 'brand', level: 2 });
  fails(s, 'opsBuild', { id: c.id, mod: 'brand', level: 3 }, /ab 1985/);
  s.day = (1990 - s.startYear) * 365; fails(s, 'opsBuild', { id: c.id, mod: 'brand', level: 2 }, /nacheinander/); act(s, 'opsBuild', { id: c.id, mod: 'brand', level: 3 });
  fails(s, 'opsBuild', { id: c.id, mod: 'brand' }, /höchste Stufe/);
});

test('Ausbau: bucht genau einmal, steigert den Wert, schickt den Auftrag an die Baufirmen der Stadt, prüft Eingaben', () => {
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s); const y = yearOf(s);
  const cost = OPS.upgradeCost(w, s, c, 'arbeit', 1, y); const m0 = s.money; const base0 = c.base; const jobs0 = (s.pending.jobs || []).length;
  act(s, 'opsBuild', { id: c.id, mod: 'arbeit' });
  assert.strictEqual(m0 - s.money, cost); assert.strictEqual(OPS.level(c, 'arbeit'), 1); assert.ok(c.base > base0);
  const j = s.pending.jobs.slice(jobs0); assert.strictEqual(j.length, 1); assert.ok(Math.abs(j[0].real * w.idx(y) - cost) < 2);
  for (const bad of [{ id: c.id, mod: 'x' }, { id: c.id, mod: '__proto__' }, { id: c.id }, { id: 999, mod: 'brand' }, { id: 'abc', mod: 'brand' }, { id: c.id, mod: 'brand', level: 'z' }, { id: c.id, mod: 'brand', level: 3 }, { id: null, mod: 'brand' }, { id: [1], mod: 'brand' }]) fails(s, 'opsBuild', bad);
  const poor = rich(mk({ professionKey: 'baecker' })); const pc = firm(poor); poor.money = 5; fails(poor, 'opsBuild', { id: pc.id, mod: 'brand' }, /Geld/);
  // Rückbau ohne Erstattung
  const m1 = s.money; act(s, 'opsRemove', { id: c.id, mod: 'arbeit' }); assert.strictEqual(s.money, m1); assert.strictEqual(OPS.level(c, 'arbeit'), 0); fails(s, 'opsRemove', { id: c.id, mod: 'arbeit' }, /nicht gebaut/);
  // Betriebe ohne Zutaten brauchen kein Lager
  s.day = (1990 - s.startYear) * 365;
  const noIn = { ...c, pkey: 'friseur', mods: {}, ops: {} }; const rec = goods.activeRecipe(w, 'friseur', y, c.cityId);
  if (!(rec.inputs || []).length) { s.companies.push({ ...noIn, id: 77 }); fails(s, 'opsBuild', { id: 77, mod: 'lager' }, /keine Zutaten/); s.companies.pop(); }
});

test('Schalter bizSecurity (alt) baut Schutz Stufe 1 bzw. bestellt ab', () => {
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s);
  act(s, 'bizSecurity', { id: c.id, on: true }); assert.strictEqual(OPS.level(c, 'schutz'), 1); assert.strictEqual(c.security, true);
  const r = act(s, 'bizSecurity', { id: c.id, on: true }); assert.match(r.msg, /bereits/); assert.strictEqual(OPS.level(c, 'schutz'), 1);
  act(s, 'bizSecurity', { id: c.id, on: false }); assert.strictEqual(OPS.level(c, 'schutz'), 0); assert.strictEqual(c.security, false);
});

test('Lager: Lücke wird gedeckt, Preisfenster höchstens ±3 % der Zutatenkosten, nie negativ oder über der Kapazität, ohne Lager identisch', () => {
  const W = goods.W(); const needs = (scar) => [{ good: 'mehl', share: 0.6, scar }, { good: 'eier', share: 0.4, scar }];
  const buy = (over = {}) => ({ factor: 1, cost: 10000, ratio: 1, costWholesale: 8000, costContract: 0, needs: needs(1), ...over });
  const c = { id: 1, mods: { lager: 2 }, ops: { stock: 5 } };
  const none = OPS.lagerPlan({ id: 1 }, buy(), W); assert.strictEqual(none.on, false); assert.strictEqual(none.factor, 1); assert.strictEqual(none.cost, 10000); assert.strictEqual(none.d, 0);
  const gap = OPS.lagerPlan(c, buy({ ratio: 0.5, factor: W.floor + (1 - W.floor) * 0.5 }), W); assert.ok(gap.cover > 0 && gap.factor > W.floor + (1 - W.floor) * 0.5 && gap.d < 0 && gap.window === 'cover');
  const empty = OPS.lagerPlan({ ...c, ops: { stock: 0 } }, buy({ ratio: 0.5, factor: 0.7 }), W); assert.strictEqual(empty.factor, 0.7); assert.strictEqual(empty.d, 0);
  const dear = OPS.lagerPlan(c, buy({ needs: needs(1.4) }), W); assert.strictEqual(dear.window, 'use'); assert.ok(dear.saved > 0 && dear.saved <= 10000 * 0.03 + 1 && dear.cost < 10000 && dear.d < 0);
  const cheap = OPS.lagerPlan(c, buy({ needs: needs(0.85) }), W); assert.strictEqual(cheap.window, 'buy'); assert.ok(cheap.d > 0 && cheap.d <= 0.5 && cheap.cost > 10000);
  const norm = OPS.lagerPlan(c, buy(), W); assert.strictEqual(norm.window, 'fill'); assert.ok(norm.d > 0 && norm.d <= 0.25);
  const full = OPS.lagerPlan({ ...c, ops: { stock: 7 } }, buy(), W); assert.strictEqual(full.d, 0); assert.strictEqual(full.cost, 10000);
  // Folge über viele Tage: Bestand bleibt im Rahmen, Kosten schwanken nur um wenige Prozent
  const state = { mods: { lager: 1 }, ops: { stock: 3 } }; let sum = 0; let sum0 = 0;
  for (let i = 0; i < 400; i++) { const sc = 1 + 0.25 * Math.sin(i / 9); const p = OPS.lagerPlan(state, buy({ needs: needs(sc) }), W); state.ops.stock = Math.max(0, Math.min(3, state.ops.stock + p.d)); assert.ok(state.ops.stock >= 0 && state.ops.stock <= 3.0001, `Bestand ${state.ops.stock}`); sum += p.cost; sum0 += 10000; }
  assert.ok(Math.abs(sum / sum0 - 1) <= 0.03, `Kosteneffekt ${(sum / sum0 - 1) * 100}`);
});

test('Lager im Betrieb: Kauf füllt den Vorrat; ein Lieferausfall zehrt ihn auf; der Vorrat verbessert die Auslastung', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s); const y = yearOf(s);
  act(s, 'bizSupply', { id: c.id, on: false }); // keine automatischen Großhandelskäufe → fehlende Zutaten sind echte Lücken
  const f0 = biz.companyFlows(w, s, c, y); assert.ok(f0.supply.status !== 'ok', 'ohne Verträge fehlen Zutaten');
  act(s, 'opsBuild', { id: c.id, mod: 'lager' }); assert.strictEqual(OPS.stockOf(c), OPS.lagerCap(c)); assert.strictEqual(OPS.lagerCap(c), 3);
  const f1 = biz.companyFlows(w, s, c, y); assert.ok(f1.income > f0.income, 'der Vorrat überbrückt die Lücke'); assert.ok(f1.lager.d < 0);
  for (let i = 0; i < 60 && OPS.stockOf(c) > 0; i++) run(s, 1); assert.strictEqual(OPS.stockOf(c), 0, 'Vorrat aufgebraucht'); assert.ok(OPS.stockOf(c) >= 0);
  act(s, 'bizSupply', { id: c.id, on: true }); for (let i = 0; i < 80 && OPS.stockOf(c) < 2.9; i++) run(s, 1); assert.ok(OPS.stockOf(c) > 2.9, 'mit Einkauf füllt sich der Vorrat wieder'); assert.ok(OPS.stockOf(c) <= OPS.lagerCap(c) + 1e-9);
});

test('Klima: faire Löhne und volle Besetzung ergeben den neutralen Zielwert; Manager, Sozialräume, Abmahnung und Streik verschieben ihn gedeckelt', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 1); TL.syncTeam(w, s, c); const m = c.team[0]; m.w = TL.marketWage(w, c, m);
  const cx = { staffRatio: 1, sickEff: 1, lead: 50 };
  assert.ok(Math.abs(OPS.moodTarget(w, s, c, m, cx) - 50) < 0.001, 'fair bezahlt, voll besetzt: 50');
  m.w = TL.marketWage(w, c, m) * 0.6; const low = OPS.moodTarget(w, s, c, m, cx); assert.ok(low < 50 && low >= 35, `zu wenig Lohn ${low}`);
  m.w = TL.marketWage(w, c, m) * 3; assert.ok(OPS.moodTarget(w, s, c, m, cx) <= 58.01, 'Lohn über Markt hebt nur wenig');
  m.w = TL.marketWage(w, c, m);
  assert.ok(OPS.moodTarget(w, s, c, m, { ...cx, staffRatio: 0.5 }) < 50 - 3, 'Unterbesetzung drückt');
  assert.ok(OPS.moodTarget(w, s, c, m, { ...cx, sickEff: 0.7 }) < 50, 'Krankenstand drückt');
  OPS.setLevel(c, 'arbeit', 3); assert.ok(OPS.moodTarget(w, s, c, m, cx) >= 60, 'Sozialräume heben'); OPS.setLevel(c, 'arbeit', 0);
  c.manager = true; assert.ok(OPS.moodTarget(w, s, c, { ...m, w: 0.4 }, cx) >= 50, 'Manager: mindestens neutral'); c.manager = false;
  c.ops = { fear: [s.day + 10, s.day + 10, s.day + 10, s.day + 10] }; assert.strictEqual(OPS.fearPts(c, s.day), 3 * D.climate.fearPts, 'höchstens dreifach');
  assert.ok(OPS.moodTarget(w, s, c, m, cx) <= 50 - 3 * D.climate.fearPts + 0.01);
  for (const lead of [0, 25, 75, 100]) for (const wm of [0.3, 1, 5]) for (const r of [0, 0.5, 1, 2]) { const t = OPS.moodTarget(w, s, { ...c, ops: {} }, { ...m, w: wm }, { staffRatio: r, sickEff: 0.5, lead }); assert.ok(t >= 0 && t <= 100); }
});

test('Klima: Stimmung nähert sich dem Ziel, bleibt in 0 … 100; Wirkung auf Umsatz höchstens ±6 % und innerhalb der Talentgrenze', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 3); TL.syncTeam(w, s, c);
  for (const m of c.team) m.mood = 100; let ox = OPS.firmEffects(c, 1, s.day); assert.ok(Math.abs(ox.climateMult - 1.06) < 0.0001); assert.strictEqual(ox.band, 'great');
  for (const m of c.team) m.mood = 0; ox = OPS.firmEffects(c, 1, s.day); assert.ok(Math.abs(ox.climateMult - 0.94) < 0.0001); assert.strictEqual(ox.band, 'bad');
  for (const m of c.team) m.mood = 50; ox = OPS.firmEffects(c, 1, s.day); assert.strictEqual(ox.climateMult, 1);
  // Kein Doppelzählen: Talente +15 % und Klima +6 % ergeben zusammen höchstens +15 %; mit Zusatzstellen nur deren kleines Plus
  assert.ok(OPS.revFactor(1.15, { climateMult: 1.06, capMult: 1, pushMult: 1 }) <= 1.15 + 1e-9); assert.ok(OPS.revFactor(0.85, { climateMult: 0.94, capMult: 1, pushMult: 1 }) >= 0.85 - 1e-9);
  assert.ok(OPS.revFactor(1.15, { climateMult: 1.06, capMult: 1.06, pushMult: 1.015 }) <= 1.15 * 1.06 * 1.015 + 1e-9);
  // Stimmung relaxiert in Richtung Ziel
  for (const m of c.team) { m.mood = 5; m.w = TL.marketWage(w, c, m); } c.manager = true; // ein Manager hält das Klima mindestens neutral (und niemand kündigt)
  run(s, 20); const avg = OPS.avgMood(c); assert.ok(avg > 15 && avg <= 50, `Stimmung ${avg}`); for (const m of c.team) assert.ok(m.mood >= 0 && m.mood <= 100);
  // Stärke 0 schaltet die Wirkung ab
  withCfg(null, () => { B.effects.strength = 0; for (const m of c.team) m.mood = 100; const o0 = OPS.firmEffects(c, 1, s.day); assert.strictEqual(o0.climateMult, 1); assert.strictEqual(o0.capMult, 1); assert.strictEqual(OPS.sickEff(0.8, { sickMult: 1 }), 0.8); });
  // Ausgeschaltet: wie ohne Module
  withCfg(null, () => { B.enabled = false; for (const m of c.team) m.mood = 100; OPS.setLevel(c, 'arbeit', 3); const o1 = OPS.firmEffects(c, 1, s.day); assert.strictEqual(o1.climateMult, 1); assert.strictEqual(o1.capMult, 1); assert.strictEqual(OPS.upkeepDay(w, s, c, yearOf(s)), 0); fails(s, 'bizPraise', { id: c.id, mid: 'all' }, /ausgeschaltet/); OPS.setLevel(c, 'arbeit', 0); });
});

test('Arbeitsplätze: Zusatzstellen heben die Personalgrenze, bringen sinkend wenig Umsatz und lohnen erst in großen Betrieben; Arbeitsschutz mindert Krankenausfall', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 1); const need = biz.staffNeeded(w, c);
  assert.strictEqual(OPS.maxStaff(w, c), need + 2);
  OPS.setLevel(c, 'arbeit', 3); assert.strictEqual(OPS.maxStaff(w, c), need + 5);
  const hire1 = () => { for (let t = 0; t < 12; t++) { try { act(s, 'bizHire', { id: c.id, delta: 1 }); return true; } catch (e) { if (/braucht der Betrieb nicht/.test(e.message)) return false; s.day += 7; } } return false; };
  for (let i = 0; i < 5; i++) assert.ok(hire1()); assert.strictEqual(c.staff, need + 5);
  assert.ok(!hire1(), 'die Grenze gilt'); assert.ok(c.staff <= need + 5);
  const ox = OPS.firmEffects(c, need, s.day); assert.strictEqual(ox.extra, 3); assert.ok(ox.capMult > 1 && ox.capMult <= 1.06 + 1e-9);
  const one = OPS.firmEffects({ ...c, staff: need + 1 }, need, s.day).capMult - 1; const two = OPS.firmEffects({ ...c, staff: need + 2 }, need, s.day).capMult - OPS.firmEffects({ ...c, staff: need + 1 }, need, s.day).capMult;
  assert.ok(one > two, 'sinkender Grenzertrag');
  assert.ok(OPS.sickEff(0.8, { sickMult: 0.7 }) > 0.8 && OPS.sickEff(0.8, { sickMult: 0.7 }) < 1);
  // Mit weniger Arbeitsplätzen fällt die Grenze wieder; bestehende Mitarbeiter bleiben
  OPS.setLevel(c, 'arbeit', 0); assert.strictEqual(OPS.firmEffects(c, need, s.day).extra, 0);
});

test('Führung: Lob (Abkühlzeit, nachlassende Wirkung, nicht bei bester Laune), Prämie (Kosten genau, Abkühlzeit), Betriebsfest, Geschenk', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 3); TL.syncTeam(w, s, c);
  for (const m of c.team) m.mood = 40; const m0 = c.team[0];
  act(s, 'bizPraise', { id: c.id, mid: m0.id }); assert.ok(m0.mood > 40 && m0.mood <= 40 + 3 * 1.6 * 1.2 + 0.01, `Lob ${m0.mood}`); assert.strictEqual(c.team[1].mood, 40);
  fails(s, 'bizPraise', { id: c.id, mid: m0.id }, /gerade erst/);
  const gain1 = m0.mood - 40; s.day += D.lead.praise.cooldown; m0.mood = 40; act(s, 'bizPraise', { id: c.id, mid: m0.id }); assert.ok(m0.mood - 40 < gain1 + 1e-9, 'wiederholtes Lob wirkt weniger');
  m0.mood = 96; s.day += 20; fails(s, 'bizPraise', { id: c.id, mid: m0.id }, /bestens/);
  s.day += 20; for (const m of c.team) m.mood = 40; const before = s.money; act(s, 'bizPraise', { id: c.id, mid: 'all' }); assert.strictEqual(s.money, before, 'Lob kostet nichts'); assert.ok(c.team.every((m) => m.mood > 40));
  // Prämie
  for (const m of c.team) m.mood = 40; const cost = Math.round(wage(s) * D.lead.bonus.costDays * 3); const m1 = s.money;
  act(s, 'bizBonus', { id: c.id, mid: 'all' }); assert.strictEqual(m1 - s.money, cost); assert.ok(c.team.every((m) => m.mood >= 40 + 5));
  fails(s, 'bizBonus', { id: c.id, mid: 'all' }, /vor kurzem/); fails(s, 'bizBonus', { id: c.id, mid: c.team[0].id }, /vor kurzem/);
  s.day += D.lead.bonus.cooldown; const g = c.team[0].mood; c.team[0].mood = 40; act(s, 'bizBonus', { id: c.id, mid: c.team[0].id }); assert.ok(c.team[0].mood - 40 < D.lead.bonus.gain * 1.6, 'zweite Prämie wirkt weniger'); void g;
  // Betriebsfest
  for (const m of c.team) m.mood = 40; s.day = (1990 - s.startYear) * 365 + 100; const fc = Math.round(wage(s) * (D.lead.party.baseDays + D.lead.party.costDays * 3)); const m2 = s.money;
  act(s, 'bizParty', { id: c.id }); assert.strictEqual(m2 - s.money, fc); assert.ok(c.team.every((m) => m.mood > 40)); fails(s, 'bizParty', { id: c.id }, /noch nicht lange/);
  s.day += D.lead.party.cooldown; const d1 = (1990 - s.startYear) * 365 + 340; s.day = d1; for (const m of c.team) m.mood = 40; act(s, 'bizParty', { id: c.id }); const xmas = c.team[0].mood - 40;
  s.day += D.lead.party.cooldown + 1; s.day = (1991 - s.startYear) * 365 + 120; for (const m of c.team) m.mood = 40; act(s, 'bizParty', { id: c.id }); assert.ok(xmas > c.team[0].mood - 40, 'Weihnachtsfeier wirkt stärker');
  // Geschenk
  const gc = Math.round(wage(s) * D.lead.gift.costDays); const m3 = s.money; for (const m of c.team) m.mood = 40; act(s, 'bizGift', { id: c.id, mid: c.team[1].id }); assert.strictEqual(m3 - s.money, gc); fails(s, 'bizGift', { id: c.id, mid: c.team[1].id }, /vor kurzem/);
  // Eingaben und kein Geld
  const poor = rich(mk({ professionKey: 'baecker' })); const pc = firm(poor, 2); poor.money = 3; fails(poor, 'bizBonus', { id: pc.id, mid: 'all' }, /Geld/); fails(poor, 'bizParty', { id: pc.id }, /Geld/); fails(poor, 'bizGift', { id: pc.id, mid: pc.team[0].id }, /Geld/);
  for (const bad of [{ id: c.id, mid: 'x' }, { id: c.id, mid: -1 }, { id: c.id, mid: 9999 }, { id: c.id }, { id: 'all', mid: 'all' }, { id: c.id, mid: {} }, { id: c.id, mid: [1] }]) { fails(s, 'bizPraise', bad); fails(s, 'bizGift', bad); fails(s, 'bizWarn', bad); }
  const empty = rich(mk({ professionKey: 'baecker' })); act(empty, 'foundBiz', { pkey: 'baecker', tier: 0 }); fails(empty, 'bizPraise', { id: empty.companies[0].id, mid: 'all' }, /niemanden/);
});

test('Abmahnung: kurz mehr Leistung, aber Stimmung und Ziel sinken; über 60 Tage unterm Strich weniger; Wiederholung kostet Ansehen', () => {
  quiet();
  const mkRun = () => { const s = rich(mk({ professionKey: 'baecker' })); s.life.baseYears = 900; const c = firm(s, 3); TL.syncTeam(w, s, c); for (const m of c.team) m.w = TL.marketWage(w, c, m); return { s, c }; };
  const a = mkRun(); const b = { s: JSON.parse(JSON.stringify(a.s)) }; b.c = b.s.companies[0]; // gleicher Spielstand, gleicher Zufall
  const warned = b.c.team[0]; act(b.s, 'bizWarn', { id: b.c.id, mid: warned.id });
  assert.ok(warned.mood <= 50 - D.lead.warn.loss + 0.01); assert.ok(b.c.team[1].mood <= 50 - D.lead.warn.others + 0.01 && b.c.team[1].mood >= 40);
  assert.ok(OPS.firmEffects(b.c, 1, b.s.day).pushMult > 1, 'kurzfristig mehr Leistung'); assert.strictEqual(OPS.fearPts(b.c, b.s.day), D.climate.fearPts);
  fails(b.s, 'bizWarn', { id: b.c.id, mid: warned.id }, /bereits/);
  const profit = (r) => { let sum = 0; for (let i = 0; i < 60; i++) { r.s.meters.fridge = 100; r.s.meters.health = 100; r.s.money = 1e10; advance(w, r.s, 1); r.s.interrupts = []; sum += r.c.lastProfit; } return sum; };
  const pa = profit(a); const pb = profit(b);
  assert.ok(pb < pa, `Abmahnung lohnt sich nicht: ${pb} vs ${pa}`);
  // Wiederholte Abmahnung innerhalb von 90 Tagen: Ansehen
  const r = mkRun(); const rq = () => (r.s.pending.rep || []).filter((e) => e.r === 'staff_pressure').length;
  r.s.pending.rep = []; act(r.s, 'bizWarn', { id: r.c.id, mid: r.c.team[0].id }); assert.strictEqual(rq(), 0, 'die erste Abmahnung ist normal');
  r.s.day += 31; act(r.s, 'bizWarn', { id: r.c.id, mid: r.c.team[1].id }); assert.strictEqual(rq(), 1, 'die zweite innerhalb von 90 Tagen kostet Ansehen');
});

test('Ansehen: fairer Arbeitgeber bei guter Stimmung, Druck bei Abmahnungen und schlechter Stimmung (vorgemerkt, nicht gebucht)', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 3); TL.syncTeam(w, s, c); s.pending.rep = [];
  for (const m of c.team) m.mood = 90; run(s, 3);
  assert.ok((s.pending.rep || []).some((e) => e.r === 'staff_fair' && e.k === 'civic' && e.d > 0), 'fairer Arbeitgeber');
  s.pending.rep = []; for (const m of c.team) m.mood = 10; c.ops = { fear: [s.day + 400] }; run(s, 2);
  assert.ok((s.pending.rep || []).some((e) => e.r === 'staff_pressure' && e.k === 'scandal'), 'Druck auf Mitarbeiter');
  const R = require('../src/game/reputation'); assert.ok(R.REASONS.staff_fair && R.REASONS.staff_pressure && R.REASONS.staff_fair.cap <= 2);
});

test('Kündigungsneigung: bei sehr schlechter Stimmung entsteht eine Lohnforderung mit Frist; gute Stimmung nimmt sie zurück; Lohn erhöhen hebt die Stimmung', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 3); TL.syncTeam(w, s, c); c.id = 7; s.day = Math.ceil(s.day / 7) * 7 + (7 - (s.day % 7) + c.id % 7) % 7;
  let got = null;
  for (let wk = 0; wk < 80 && !got; wk++) { for (const m of c.team) { m.mood = 2; m.ask = null; } s.day += 7 - ((s.day - c.id) % 7 + 7) % 7; OPS.weekly({ world: w, state: s, offline: false }, c, yearOf(s)); got = c.team.find((m) => m.ask); }
  assert.ok(got, 'irgendwann entsteht eine Forderung'); assert.ok(got.ask.mood && got.ask.until > s.day && got.ask.w > got.w);
  const w0 = got.w; got.mood = 10; act(s, 'bizRaise', { id: c.id, mid: got.id }); assert.ok(got.w > w0 && got.mood > 10 && !got.ask);
  got.ask = { w: got.w * 1.1, until: s.day + 20, mood: true }; got.mood = 60; OPS.daily({ world: w, state: s, offline: false }, c, null); assert.strictEqual(got.ask, null, 'Unmut verflogen');
  // Offline passiert nichts
  for (const m of c.team) { m.mood = 2; m.ask = null; } OPS.weekly({ world: w, state: s, offline: true }, c, yearOf(s)); assert.ok(c.team.every((m) => !m.ask));
  // Lehrlinge und bereits fordernde Mitarbeiter werden übersprungen
  c.team[0].lehr = { start: s.day, end: s.day + 999, last: s.day }; for (let i = 0; i < 40; i++) { s.day += 7; c.team[0].mood = 1; c.team[0].ask = null; OPS.weekly({ world: w, state: s, offline: false }, c, yearOf(s)); assert.strictEqual(c.team[0].ask, null); }
});

test('Streik: gute Stimmung wendet ihn ab, schlechte kann ihn auslösen; der Zufall bleibt deterministisch', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 3); TL.syncTeam(w, s, c);
  for (const m of c.team) m.mood = 100; let holds = 0; for (let i = 0; i < 200; i++) { s.day += 7; if (OPS.strikeHolds(c, s)) holds++; } assert.ok(holds < 60, `bei bester Stimmung selten (${holds}/200)`);
  for (const m of c.team) m.mood = 50; for (let i = 0; i < 50; i++) { s.day += 7; assert.ok(OPS.strikeHolds(c, s)); }
  for (const m of c.team) m.mood = 5; let started = 0;
  for (let wk = 0; wk < 400; wk++) { c.strikeUntil = 0; s.day += 7 - ((s.day - c.id) % 7 + 7) % 7; OPS.weekly({ world: w, state: s, offline: false }, c, yearOf(s)); if (c.strikeUntil > s.day) started++; }
  assert.ok(started > 0 && started < 200, `Streiks bei schlechter Stimmung (${started})`);
  const a = []; const b = []; for (let i = 0; i < 20; i++) { s.day += 7; a.push(OPS.strikeHolds(c, s)); } s.day -= 140; for (let i = 0; i < 20; i++) { s.day += 7; b.push(OPS.strikeHolds(c, s)); } assert.deepStrictEqual(a, b);
});

test('Betriebsbrand: deterministisch, Brandschutz mindert, Versicherung zahlt, kein Brand offline/im Anfängerschutz/ohne Regler, nie Insolvenz', () => {
  withCfg(null, () => {
    B.fire.weeklyChance = 1; // jede Woche brennt es
    const mkFire = (lv, insured, money = 5e9) => { const s = rich(mk({ professionKey: 'baecker' })); s.life.baseYears = 900; s.seed = 4242; const c = firm(s, 2); s.money = money; c.cash = 0; c.id = 3; if (lv) OPS.setLevel(c, 'brand', lv); s.insurance.betrieb = insured; return { s, c }; };
    const slotDay = (s, c) => { let d = s.day; while (d % 7 !== c.id % 7) d++; return d; };
    const burn = (s, c) => OPS.fire({ world: w, state: s, offline: false }, c, yearOf(s), OPS.fireRisk(w, s, c, 200));
    const weekFire = (s, c) => { s.day = slotDay(s, c); for (let i = 0; i < 400 && !(c.outageUntil > s.day); i++) { OPS.weekly({ world: w, state: s, offline: false }, c, yearOf(s)); if (!(c.outageUntil > s.day)) s.day += 7; } return c.outageUntil > s.day; };
    // Anfängerschutz und offline
    const e0 = mkFire(0, false); e0.s.day = 10; for (let i = 0; i < 8; i++) { e0.s.day += 7 - (e0.s.day % 7) + e0.c.id % 7; OPS.weekly({ world: w, state: e0.s, offline: false }, e0.c, 1946); } assert.strictEqual(e0.c.outageUntil, undefined, 'Anfängerschutz');
    const e1 = mkFire(0, false); e1.s.day = slotDay(e1.s, e1.c); for (let i = 0; i < 100; i++) { OPS.weekly({ world: w, state: e1.s, offline: true }, e1.c, yearOf(e1.s)); e1.s.day += 7; } assert.strictEqual(e1.c.outageUntil, undefined, 'offline');
    withCfg(null, () => { B.effects.strength = 0; B.fire.weeklyChance = 1; const e2 = mkFire(0, false); e2.s.day = slotDay(e2.s, e2.c); for (let i = 0; i < 100; i++) { OPS.weekly({ world: w, state: e2.s, offline: false }, e2.c, yearOf(e2.s)); e2.s.day += 7; } assert.strictEqual(e2.c.outageUntil, undefined, 'Regler 0'); });
    // über viele Wochen tritt der Brand wirklich auf (Würfel)
    const e3 = mkFire(0, false); assert.ok(weekFire(e3.s, e3.c), 'bei hoher Chance brennt es irgendwann');
    // unversichert
    const a = mkFire(0, false); a.s.day = slotDay(a.s, a.c); const m0 = a.s.money; burn(a.s, a.c);
    assert.ok(a.c.outageUntil > a.s.day, 'Ausfall'); const lossA = m0 - a.s.money; assert.ok(lossA > 0, 'Schaden wird getragen'); assert.strictEqual(a.s.pending.ops.length, 1); assert.strictEqual(a.s.pending.ops[0].k, 'fire'); assert.strictEqual(a.s.pending.ops[0].ins, 0);
    assert.ok(a.s.notices[0].title.startsWith('Brand in') && a.s.interrupts.length === 1);
    assert.ok((a.s.pending.jobs || []).length >= 1, 'Wiederaufbau geht als Bauauftrag an eine Baufirma');
    // Brandschutz Stufe 3 mindert Schaden und Ausfall
    const b = mkFire(3, false); b.s.day = slotDay(b.s, b.c); const mB = b.s.money; burn(b.s, b.c); const lossB = mB - b.s.money;
    assert.ok(lossB < lossA * 0.5, `Brandschutz mindert (${lossB} < ${lossA})`); assert.ok(b.c.outageUntil - b.s.day < a.c.outageUntil - a.s.day);
    // Versicherung: Selbstbeteiligung 10 %, kürzerer Ausfall, Entschädigung
    const c = mkFire(0, true); c.s.day = slotDay(c.s, c.c); c.c.lastProfit = 10000; const mC = c.s.money; burn(c.s, c.c); const lossC = mC - c.s.money;
    assert.ok(Math.abs(lossC - lossA * 0.1) <= lossA * 0.02, `Selbstbeteiligung ${lossC} ≈ 10 % von ${lossA}`); assert.ok(c.c.cash > 0, 'Entschädigung für den Ausfall'); assert.ok(c.c.outageUntil - c.s.day < a.c.outageUntil - a.s.day); assert.strictEqual(c.s.pending.ops[0].ins, 1);
    // Insolvenz ausgeschlossen: wenig Geld → Schaden gedeckelt, Ausfall länger
    const d = mkFire(0, false, 2000); d.s.day = slotDay(d.s, d.c); burn(d.s, d.c); assert.ok(d.s.money >= 1000 - 1 && d.s.money <= 2000, `Geld bleibt: ${d.s.money}`); assert.ok(d.c.cash >= 0);
    // Lager verbrennt zum Teil
    const e = mkFire(0, false); OPS.setLevel(e.c, 'lager', 3); OPS.ops(e.c).stock = 14; e.s.day = slotDay(e.s, e.c); burn(e.s, e.c); assert.ok(OPS.stockOf(e.c) < 14 && OPS.stockOf(e.c) > 0);
    // Stimmung sinkt (Schreck), bleibt aber im Bereich
    assert.ok(a.c.team.every((m) => m.mood < 50 && m.mood >= 0));
    // gleiche Eingabe, gleiches Ergebnis
    const f1 = mkFire(0, false); f1.s.seed = a.s.seed; f1.s.day = a.s.day - 0; f1.s.day = slotDay(f1.s, f1.c); burn(f1.s, f1.c); assert.strictEqual(f1.c.outageUntil - f1.s.day, a.c.outageUntil - a.s.day);
    // Während des Ausfalls brennt es nicht noch einmal
    a.s.day += 7; const o = a.c.outageUntil; OPS.weekly({ world: w, state: a.s, offline: false }, a.c, yearOf(a.s)); assert.strictEqual(a.c.outageUntil, o);
  });
});

test('Brandrisiko: je Branche und Winter, Brandschutz senkt die Chance; Anzeige in Prozent pro Jahr', () => {
  loud();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 1);
  const r0 = OPS.fireRisk(w, s, c, 200); const winter = OPS.fireRisk(w, s, c, 10); assert.ok(winter.weekly > r0.weekly);
  OPS.setLevel(c, 'brand', 3); const r3 = OPS.fireRisk(w, s, c, 200); assert.ok(r3.weekly < r0.weekly * 0.3 && r3.dmgMult < 0.5 && r3.yearly < r0.yearly);
  const wirt = { ...c, pkey: 'wirt', mods: {} }; const bank = { ...c, pkey: 'baecker', mods: {} }; assert.ok(OPS.fireRisk(w, s, wirt, 200).weekly >= OPS.fireRisk(w, s, bank, 200).weekly * 0.5);
  assert.ok(OPS.fireRisk(w, s, c, 200).yearly < 10, 'Brände sind selten');
});

test('Betriebsversicherung: Beitrag in den Tageskosten, Rabatt durch Brandschutz und Schutz, Abschluss über die Versicherungsaktion', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 1); const y = yearOf(s);
  const e0 = core.dailyFlows(w, s).exp.insurance; act(s, 'insurance', { key: 'betrieb', on: true });
  const e1 = core.dailyFlows(w, s).exp.insurance; assert.ok(e1 > e0); assert.strictEqual(e1 - e0, OPS.premiumDay(w, s, y));
  OPS.setLevel(c, 'brand', 3); OPS.setLevel(c, 'schutz', 3); const e2 = core.dailyFlows(w, s).exp.insurance - e0; assert.ok(e2 < e1 - e0 && e2 >= (e1 - e0) * 0.5 - 1);
  assert.strictEqual(OPS.premiumFactor(c), 1 - (D.modules.brand.levels[2].premDisc + D.modules.schutz.levels[2].premDisc) / 100);
  act(s, 'insurance', { key: 'betrieb', on: false }); assert.strictEqual(core.dailyFlows(w, s).exp.insurance, e0);
  const v = present(w, s, user(), Date.now()); const ins = v.insurance.find((i) => i.key === 'betrieb'); assert.ok(ins && ins.name === 'Betriebsversicherung' && ins.covers.includes('interruption'));
  // ohne Betrieb kostet sie nichts
  const none = rich(mk({ professionKey: 'baecker' })); none.insurance.betrieb = true; assert.strictEqual(OPS.premiumDay(w, none, yearOf(none)), 0);
});

test('Diebstahl: Schutz wehrt ihn mit der Stufenwahrscheinlichkeit ab; sonst trifft er auch das Lager; Betriebsversicherung ersetzt ihn', () => {
  withCfg(null, () => {
    const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 1);
    assert.strictEqual(OPS.theft({ state: s }, c).repelled, false, 'ohne Schutz');
    OPS.setLevel(c, 'schutz', 3); let n = 0; for (let i = 0; i < 400; i++) { s.day = 7 * i + 1; if (OPS.theft({ state: s }, c).repelled) n++; } assert.ok(n > 300 && n < 400, `Stufe 3 wehrt ca. 90 % ab (${n}/400)`);
    OPS.setLevel(c, 'schutz', 1); n = 0; for (let i = 0; i < 400; i++) { s.day = 7 * i + 1; if (OPS.theft({ state: s }, c).repelled) n++; } assert.ok(n > 120 && n < 240, `Stufe 1 ca. 45 % (${n}/400)`);
    OPS.setLevel(c, 'lager', 2); OPS.ops(c).stock = 7; const lost = OPS.theftStock(c); assert.ok(lost > 0 && lost <= 7 * D.theft.stockLossPct / 100 + 0.01); assert.ok(OPS.stockOf(c) < 7);
    assert.ok(OPS.rivalMult(c) === 0 || OPS.rivalMult(c) >= 0); OPS.setLevel(c, 'schutz', 3); assert.ok(OPS.rivalMult(c) > OPS.rivalMult({ ...c, mods: { schutz: 1 } }));
    assert.strictEqual(OPS.rivalMult({ mods: {} }), 0, 'ohne Schutz keine Abwehr');
  });
});

test('Spieler als Angestellte werden nie beeinflusst; Betriebe ohne Team haben kein Klima', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 0);
  c.playerStaff = [{ userId: 9, wage: 500, tal: null }]; TL.syncTeam(w, s, c);
  assert.strictEqual(OPS.avgMood(c), null); const ox = OPS.firmEffects(c, 1, s.day); assert.strictEqual(ox.climateMult, 1); assert.strictEqual(ox.band, 'none');
  fails(s, 'bizPraise', { id: c.id, mid: 'all' }, /niemanden/); fails(s, 'bizBonus', { id: c.id, mid: 'all' }, /niemanden/);
  run(s, 5); assert.ok(c.playerStaff.every((p) => p.mood === undefined && p.mcd === undefined), 'Spieler-Angestellte unberührt');
  const v = OPS.firmView(w, s, c, 1, yearOf(s), biz.companyFlows(w, s, c, yearOf(s))); assert.strictEqual(v.climate.avg, null);
});

test('Ansicht: Module, Vorrat, Klima, Brandrisiko, Versicherung, Kosten der Aktionen; alle Zahlen endlich', () => {
  loud();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 3); act(s, 'opsBuild', { id: c.id, mod: 'lager' }); act(s, 'opsBuild', { id: c.id, mod: 'brand' });
  const v = present(w, s, user(), Date.now()); const o = v.companies[0].ops;
  assert.strictEqual(o.on, true); assert.deepStrictEqual(Object.keys(o.modules), OPS.KEYS); assert.strictEqual(o.modules.lager.lv, 1); assert.ok(o.modules.lager.next.cost > 0 && o.modules.lager.next.ok);
  assert.strictEqual(o.stock.cap, 3); assert.ok(o.climate.members.length === 3 && o.climate.members.every((m) => m.mood >= 0 && m.mood <= 100));
  assert.strictEqual(o.actions.bonus.perHead, Math.round(wage(s) * D.lead.bonus.costDays)); assert.strictEqual(o.actions.party.cost, Math.round(wage(s) * (D.lead.party.baseDays + D.lead.party.costDays * 3)));
  assert.ok(o.fire.yearPct > 0 && o.fire.yearPct < 10); assert.strictEqual(o.insurance.on, false); assert.ok(v.companies[0].mods.brand === 1 && v.companies[0].talent.team.every((m) => Number.isFinite(m.mood)));
  const walk = (x) => { if (typeof x === 'number') assert.ok(Number.isFinite(x), `Zahl ${x}`); else if (x && typeof x === 'object') Object.values(x).forEach(walk); }; walk(o);
  assert.ok(o.modules.brand.next.why === null && o.modules.arbeit.next.ok);
  // Lob und Prämie für alle: danach sperrt der Knopf (Wartezeit je Mitarbeiter), Betriebsfest sperrt am Betrieb
  assert.strictEqual(o.actions.praise.ok, true); for (const m of c.team) m.mood = 40;
  act(s, 'bizPraise', { id: c.id, mid: 'all' }); act(s, 'bizBonus', { id: c.id, mid: 'all' }); act(s, 'bizParty', { id: c.id });
  const o2 = present(w, s, user(), Date.now()).companies[0].ops; assert.strictEqual(o2.actions.praise.ok, false); assert.ok(o2.actions.praise.cd > 0 && o2.actions.bonus.cd > 0 && o2.actions.party.cd > 0);
  s.day = 100; const early = present(w, s, user(), Date.now()).companies[0].ops; assert.ok(early.modules.brand.next.why === 'era' || early.modules.brand.next.ok !== undefined);
});

test('Betrieb im Alltag: Module ohne Nutzung ändern nichts am Umsatz; Unterhalt entsteht nur mit Modulen; Regler 0 und Ausschalten nehmen die Wirkung', () => {
  quiet();
  const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 1); c.manager = true; const y = yearOf(s);
  const base = biz.companyFlows(w, s, c, y);
  assert.strictEqual(base.upkeep, Math.round((biz.companyValue(w, s, c, y) * w.econ.companies.upkeepYearPct) / 100 / 365));
  OPS.setLevel(c, 'brand', 1); OPS.setLevel(c, 'schutz', 2); const f = biz.companyFlows(w, s, c, y);
  assert.ok(f.upkeep > base.upkeep && f.income === base.income);
  withCfg(null, () => { B.enabled = false; assert.strictEqual(biz.companyFlows(w, s, c, y).upkeep, base.upkeep); });
  // Zusatzstellen im Umsatz sichtbar
  OPS.setLevel(c, 'arbeit', 3); const big = { ...c, rooms: 12, staff: biz.staffNeeded(w, { ...c, rooms: 12 }) + 3, team: undefined };
  const big0 = { ...big, mods: { ...c.mods, arbeit: 0 } }; assert.ok(biz.companyFlows(w, s, big, y).income > biz.companyFlows(w, s, big0, y).income);
});

test('Bots (mild): bauen nur kleine Stufen, versichern ihre Betriebe, loben ihr Team – ohne Abmahnungen, ohne Spieler-Angestellte anzufassen', () => {
  withCfg(null, () => {
    quiet(); B.bots.build = 1; B.bots.lead = 1;
    const bots = require('../src/lib/bots'); const P = bots.makePersona('de');
    const s = rich(mk({ professionKey: 'baecker' })); const c = firm(s, 3); TL.syncTeam(w, s, c); c.playerStaff = [{ userId: 9, wage: 500, tal: null }];
    const realRandom = Math.random; let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const acts = []; const orig = actions.run;
    try {
      for (let i = 0; i < 60; i++) { s.day += 9; s.money = Math.max(s.money, 5e9); const before = JSON.stringify(c.mods || {}); bots.decide({ world: w, state: s, user: user(), now: Date.now() }, P); void before; }
    } finally { Math.random = realRandom; actions.run = orig; }
    void acts;
    assert.ok(OPS.KEYS.every((k) => OPS.level(c, k) <= 2), 'Bots bauen höchstens Stufe 2');
    assert.ok(OPS.KEYS.some((k) => OPS.level(c, k) >= 1), 'und bauen etwas');
    assert.strictEqual(s.insurance.betrieb, true, 'Betriebsversicherung abgeschlossen');
    assert.ok(c.team.some((m) => m.pr && m.pr.n >= 1), 'das Team wurde gelobt');
    assert.ok(!(c.ops && c.ops.warns && c.ops.warns.length), 'Bots mahnen nie ab');
    assert.ok(c.playerStaff.every((p) => p.mood === undefined));
  });
});

test('Rate-Limit: Ausbau und Führungsaktionen laufen über eine eigene Bremse je Spieler; alle Aktionsnamen sind echte Aktionen', () => {
  const fs = require('fs'); const path = require('path');
  const api = fs.readFileSync(path.join(__dirname, '../src/routes/api.js'), 'utf8');
  assert.match(api, /OPS_ACTIONS = new Set\(require\('\.\.\/game\/operations-actions'\)\.ACTIONS\)/); assert.match(api, /userLimit\(45,/); assert.match(api, /OPS_ACTIONS\.has\(req\.params\.name\) \? opsLimit/);
  const names = require('../src/game/operations-actions').ACTIONS; for (const n of names) assert.ok(actions.ACTIONS.includes(n), n);
});
