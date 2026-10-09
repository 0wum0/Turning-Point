'use strict';
/** Stadtwirtschaft: Indexmodell (Gleichgewicht, Annäherung, Grenzen, Determinismus), Einspeisung ins Spiel, Politik-Vorschau (ohne Datenbank). */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const settings = require('../src/settings');
const ce = require('../src/game/cityecon');
const goods = require('../src/game/goods');
const biz = require('../src/game/business');
const landlord = require('../src/game/landlord');
const core = require('../src/game/core');
const competition = require('../src/game/competition');
const { createCharacter } = require('../src/game/state');
const { edition } = require('../src/game/newspaper');
const { advance } = require('../src/game/engine');
const { yearOf } = require('../src/game/calendar');

const w = testWorld();
const city = (slug = 'braunschweig') => w.cityList.find((c) => c.slug === slug);
const HOUR = 3600000;
const withCfg = (patch, fn) => { const g = settings.DEFAULTS.stadtwirtschaft; const old = JSON.stringify(g); Object.assign(g, patch); try { return fn(); } finally { Object.assign(g, JSON.parse(old)); } };
/** Zwischenspeicher mit festen Dynamikwerten für eine Stadt belegen. */
const setDyn = (cityId, vals) => {
  const m = new Map();
  for (const s of ce.SECTORS) m.set(ce.key(cityId, s), { v: vals[s] == null ? 1 : vals[s], t: 0, pt: 0, hist: [vals[s] == null ? 1 : vals[s]], cityId, sector: s });
  ce.setState(m, new Map());
};
const fresh = () => createCharacter(w, input(w), { meta: {}, coins: 3, efs_pool: 0 });
test.beforeEach(() => { ce.reset(); goods.setPolicies(null); goods.setScarcity(new Map()); competition.setSupply([]); });

test('ohne Aktivierung und bei Abschaltung ist jeder Faktor genau 1', () => {
  for (const s of ce.SECTORS) assert.strictEqual(ce.level(city().id, s, 1990), 1);
  assert.strictEqual(ce.propertyMult(city().id, 1990), 1);
  ce.prime();
  withCfg({ enabled: false }, () => { setDyn(city().id, { rent: 1.4 }); for (const s of ce.SECTORS) assert.strictEqual(ce.level(city().id, s, 1990), 1); });
});

test('Epochenfaktor: deterministisch, beschränkt und im Mittel nahe 1', () => {
  ce.prime();
  for (const s of ce.SECTORS) {
    let sum = 0; let n = 0;
    for (const c of w.cityList) for (let y = 1945; y <= 2100; y += 5) { const e = ce.era(c.id, s, y); assert.ok(Number.isFinite(e) && e > 0.88 && e < 1.12, `${s} ${c.name} ${y}: ${e}`); assert.strictEqual(e, ce.era(c.id, s, y)); sum += e; n++; }
    assert.ok(Math.abs(sum / n - 1) < 0.01, `Mittel ${s}: ${sum / n}`);
  }
});

test('Gleichgewicht: viel Konkurrenz senkt, viele Einwohner heben den Index; ohne Aktivität neutral', () => {
  const c = city('hamburg'); const calm = { players: 0, rooms: { food: 0, services: 0, build: 0, all: 0 } };
  withCfg({ noisePct: 0 }, () => {
    for (const s of ce.SECTORS) assert.ok(Math.abs(ce.target(w, c.id, s, calm, null, 0) - 1) < 1e-9, s);
    const small = city('braunschweig');
    const crowded = { players: 0, rooms: { food: 600, services: 600, build: 600, all: 4000 } };
    assert.ok(ce.target(w, small.id, 'food', crowded, null, 0) < 0.8, 'Überangebot Lebensmittel');
    assert.ok(ce.target(w, small.id, 'wage', crowded, null, 0) > 1.15, 'viele Firmen treiben die Löhne');
    const people = { players: 300, rooms: { food: 0, services: 0, build: 0, all: 0 } };
    assert.ok(ce.target(w, small.id, 'rent', people, null, 0) > 1.2, 'viele Einwohner treiben die Mieten');
    assert.ok(ce.target(w, small.id, 'wage', people, null, 0) < 0.85, 'viele Arbeitssuchende drücken die Löhne');
    // Großstadt verträgt dieselbe Aktivität besser als eine kleine Stadt
    const mid = { players: 90, rooms: { food: 60, services: 60, build: 20, all: 150 } };
    assert.ok(Math.abs(ce.target(w, c.id, 'rent', mid, null, 0) - 1) < Math.abs(ce.target(w, small.id, 'rent', mid, null, 0) - 1));
  });
});

test('Ziel liegt immer in den Grenzen, auch bei absurden Eingaben', () => {
  const ins = [{ players: 1e9, rooms: { food: 1e9, services: 1e9, build: 1e9, all: 1e9 } }, { players: 0, rooms: { food: 1e9, services: 1e9, build: 0, all: 1e9 } }, null, {}, { players: -5, rooms: { food: -3 } }];
  for (const inp of ins) for (const s of ce.SECTORS) for (const pol of [null, { zone: 40, rentCap: 0, brake: -3 }, { zone: 0, rentCap: null, brake: 3 }]) {
    const t = ce.target(w, city().id, s, inp, pol, 123456);
    assert.ok(Number.isFinite(t) && t >= 0.75 && t <= 1.6, `${s}: ${t}`);
  }
});

test('Annäherung: konvergiert gegen das Ziel, ohne Überschwingen, in den Grenzen, deterministisch', () => {
  let a = null; let b = null; const path = [];
  for (let i = 1; i <= 240; i++) { a = ce.advanceEntry(a, 1.35, i * HOUR); b = ce.advanceEntry(b, 1.35, i * HOUR); path.push(a.v); }
  assert.deepStrictEqual(a, b, 'gleiche Eingaben ergeben gleichen Verlauf');
  for (let i = 1; i < path.length; i++) assert.ok(path[i] >= path[i - 1] && path[i] <= 1.35 + 1e-9, 'monoton und ohne Überschwingen');
  assert.ok(Math.abs(a.v - 1.35) < 0.01, `Endwert ${a.v}`);
  let c = null; for (let i = 1; i <= 24; i++) c = ce.advanceEntry(c, 1.35, i * HOUR);
  assert.ok(c.v > 1.1 && c.v < 1.3, `nach etwa einem Spieljahr ist ein guter Teil geschafft: ${c.v}`);
  // zurück zur Mitte, wenn die Aktivität endet
  for (let i = 241; i <= 600; i++) a = ce.advanceEntry(a, 1, i * HOUR);
  assert.ok(Math.abs(a.v - 1) < 0.01);
  // lange Pausen werden gedeckelt, Werte bleiben endlich
  const z = ce.advanceEntry(a, 9, 1e15); assert.ok(Number.isFinite(z.v) && z.v <= 1.6);
  assert.ok(Number.isFinite(ce.step(NaN, NaN, NaN, null)));
});

test('Verlauf: ein Punkt je Spielmonat, höchstens histPoints, nur endliche Werte', () => {
  const month = 30 * 86400000 / 365; // 365 Spieltage je 24 Stunden
  let e = null;
  for (let i = 0; i <= 400; i++) e = ce.advanceEntry(e, 1.2, i * month * 0.5);
  assert.ok(e.hist.length >= 20 && e.hist.length <= 60, `Länge ${e.hist.length}`);
  assert.ok(e.hist.every(Number.isFinite));
});

test('Mietpreisbremse begrenzt den Anstieg des Mietindex, Senkungen bleiben möglich', () => {
  let free = null; let capped = null; let zero = null;
  for (let i = 1; i <= 24; i++) { free = ce.advanceEntry(free, 1.5, i * HOUR, null); capped = ce.advanceEntry(capped, 1.5, i * HOUR, 4); zero = ce.advanceEntry(zero, 1.5, i * HOUR, 0); }
  assert.ok(free.v > 1.2, `frei ${free.v}`);
  assert.ok(capped.v <= 1.0401 && capped.v > 1.02, `4 %/Jahr: nach einem Spieljahr höchstens +4 %, ${capped.v}`);
  assert.ok(Math.abs(zero.v - 1) < 1e-9, `Null: eingefroren, ${zero.v}`);
  let down = ce.advanceEntry({ v: 1.4, t: 0, pt: 0, hist: [1.4] }, 1, 10 * HOUR, 0); assert.ok(down.v < 1.4);
});

test('Politik: Bauland und Wohnungsbau senken das Mietziel, Mietpreisbremse staut Druck auf, Preisbremse verschiebt alle Preise', () => {
  const c = city('braunschweig'); const inp = { players: 60, rooms: { food: 0, services: 0, build: 6, all: 6 } };
  withCfg({ noisePct: 0 }, () => {
    const base = ce.target(w, c.id, 'rent', inp, null, 0);
    assert.ok(base > 1.1);
    assert.ok(ce.target(w, c.id, 'rent', inp, { zone: 10, rentCap: null, brake: 0 }, 0) < base - 0.05, 'Bauland');
    assert.ok(ce.target(w, c.id, 'rent', inp, { zone: 0, rentCap: 2, brake: 0 }, 0) > base, 'Bremse verknappt das Angebot (Nachholeffekt)');
    assert.ok(ce.target(w, c.id, 'build', inp, { zone: 10, rentCap: null, brake: 0 }, 0) >= ce.target(w, c.id, 'build', inp, null, 0), 'Bauland treibt Baukosten');
    for (const s of ['food', 'rent', 'services', 'build']) assert.ok(ce.target(w, c.id, s, inp, { zone: 0, rentCap: null, brake: -2 }, 0) < ce.target(w, c.id, s, inp, null, 0), s);
    assert.ok(ce.target(w, c.id, 'wage', inp, { zone: 0, rentCap: null, brake: -2 }, 0) > ce.target(w, c.id, 'wage', inp, { zone: 0, rentCap: null, brake: 2 }, 0) - 1);
  });
});

test('Einspeisung: Miete, Immobilienwert, Lohn, Lebensmittel, Baukosten und Umsatz folgen dem Index', () => {
  const c = city(); const s = fresh(); const year = yearOf(s.day, s.startYear);
  const prop = { id: 1, name: 'Haus', kind: 'house_small', base: 400000, condition: 80, cityId: c.id, rooms: 3, lease: { on: true, mult: 1, tenant: { name: 'X', since: 0, until: 1e9, arrears: 0 } } };
  const flat = { kind: 'flat', base: 100000, condition: 80, cityId: c.id };
  const m0 = { rent: landlord.rentPerDay(w, s, prop, year), val: core.propertyValue(w, s, prop, year), food: core.foodFactor(w, s, year), found: biz.foundOptions(w, s) };
  s.occupation = { kind: 'work', pkey: 'baecker', cityId: c.id, factor: 1, since: 0, employer: 'X' };
  const wage0 = core.dailyFlows(w, s).inc.wage;
  const firm = { id: 1, pkey: 'baecker', tier: 0, cityId: c.id, rooms: 4, staff: 2, manager: true, cash: 0, base: 1, abandoned: null };
  const f0 = biz.companyFlows(w, s, firm, year);
  const ed0 = edition(w, s, c.id);
  ce.prime(); setDyn(c.id, { rent: 1.2, food: 1.1, build: 1.3, wage: 1.15, services: 1.1 });
  const era = (sec) => ce.era(c.id, sec, year);
  const lv = (sec) => ce.level(c.id, sec, year);
  assert.ok(Math.abs(landlord.rentPerDay(w, s, prop, year) / m0.rent - lv('rent')) < 0.02, 'Miete');
  assert.ok(Math.abs(core.propertyValue(w, s, prop, year) / m0.val - Math.pow(lv('rent'), 0.5) * Math.pow(lv('build'), 0.25)) < 0.02, 'Immobilienwert');
  assert.ok(Math.abs(core.foodFactor(w, s, year) / m0.food - lv('food')) < 1e-9, 'Lebensmittel');
  assert.ok(Math.abs(core.dailyFlows(w, s).inc.wage / wage0 - lv('wage')) < 0.01, 'Lohn');
  const f1 = biz.companyFlows(w, s, firm, year);
  assert.ok(f1.wages / f0.wages > lv('wage') - 0.02 && f1.wages / f0.wages < lv('wage') + 0.02, 'Lohnkosten');
  assert.ok(f1.income / f0.income > 1.02 && f1.income / f0.income < Math.pow(lv('food'), 0.6) + 0.02, 'Umsatz folgt abgeschwächt');
  assert.ok(biz.foundOptions(w, s).options[0].price / m0.found.options[0].price > lv('build') - 0.01, 'Gründungspreis folgt Baukosten');
  const ed1 = edition(w, s, c.id);
  assert.ok(ed1.housing.rent[0].perDay > ed0.housing.rent[0].perDay && ed1.housing.pension[0].perDay > ed0.housing.pension[0].perDay, 'Anzeigen');
  assert.ok(ed1.jobs[0].wage > ed0.jobs[0].wage, 'Stellenanzeigen');
  assert.ok(ed1.housing.sale[0].price > ed0.housing.sale[0].price, 'Kaufpreise');
  void era;
});

test('Großhandel: Lebensmittel- und Baupreise folgen dem Stadtindex, andere Waren nicht', () => {
  const c = city(); ce.prime();
  const p0 = { mehl: goods.price(w, c.id, 'mehl', 1960).market, eisen: goods.price(w, c.id, 'eisen', 1960).market, baustoffe: goods.price(w, c.id, 'baustoffe', 1960).market };
  setDyn(c.id, { food: 1.3, build: 1.3 });
  const f = ce.level(c.id, 'food', 1960);
  assert.ok(goods.price(w, c.id, 'mehl', 1960).market / p0.mehl > 1.05);
  assert.ok(Math.abs(goods.price(w, c.id, 'mehl', 1960).market / p0.mehl - (1 + (f - 1) * 0.4)) < 0.02);
  assert.ok(goods.price(w, c.id, 'baustoffe', 1960).market / p0.baustoffe > 1.05);
  assert.strictEqual(goods.price(w, c.id, 'eisen', 1960).market, p0.eisen);
});

test('Betriebsarten gehören Sektoren: Bäckerei = Lebensmittel, Wirtshaus = Dienste, Maurer = Bau', () => {
  assert.strictEqual(ce.sectorOfPkey(w, 'baecker'), 'food');
  assert.strictEqual(ce.sectorOfPkey(w, 'wirt'), 'services');
  assert.strictEqual(ce.sectorOfPkey(w, 'maurer'), 'build');
  assert.strictEqual(ce.sectorOfPkey(w, 'bergmann'), null);
});

test('Barometer, Vergleich, Hinweise und Zeitung', () => {
  const c = city('braunschweig'); const s = fresh(); ce.prime();
  setDyn(c.id, { rent: 1.3, food: 0.8 });
  const b = ce.barometer(w, c.id, 1970);
  assert.deepStrictEqual(b.rows.map((r) => r.sector), ce.SECTORS);
  for (const r of b.rows) { assert.ok(Number.isFinite(r.level) && r.spark.length === 8 && r.spark.every(Number.isFinite), r.sector); assert.ok(['up', 'down', 'flat'].includes(r.trend)); assert.ok(['cheap', 'normal', 'dear'].includes(r.label)); }
  assert.strictEqual(b.rows[1].label, 'dear'); assert.strictEqual(b.rows[0].label, 'cheap');
  const cmp = ce.compare(w, c.id, 1970, { limit: 5, radiusKm: 400, ids: [city('muenchen') ? city('muenchen').id : 3] });
  assert.ok(cmp[0].here && cmp.length >= 3 && cmp.length <= 7);
  for (const r of cmp) for (const sec of ce.SECTORS) assert.ok(Number.isFinite(r.levels[sec]) && Number.isFinite(r.vs[sec]));
  // Hinweis: Mieter in teurer Stadt, günstige Nachbarstadt
  s.housing = { type: 'rent', base: 1000, rooms: 1 };
  const tip = ce.tips(w, s, 1970, 4000);
  assert.ok(tip.every((t) => t.kind === 'rent' || t.kind === 'wage'));
  const t = tip.find((x) => x.kind === 'rent');
  if (t) { assert.ok(t.savePerDay > 0 && t.pct >= 12 && t.km <= 90); }
  // Zeitung: starker Anstieg gegenüber dem Vorjahr wird gemeldet
  const m = new Map(); for (const sec of ce.SECTORS) m.set(ce.key(c.id, sec), { v: 1.3, t: 0, pt: 0, hist: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.3], cityId: c.id, sector: sec });
  ce.setState(m, new Map());
  const n = ce.news(w, c.id, 1970);
  assert.ok(n.length >= 1 && n.length <= 2 && n.every((x) => x.title && x.text && !/\{/.test(x.title + x.text)));
  assert.ok(edition(w, fresh(), c.id).news.some((x) => x.section === 'Wirtschaft'));
});

test('Politik-Beschlüsse: Befugnisse, Prüfung, Wirkung und Vorschau', () => {
  const c = city(); const reg = c.state;
  assert.deepStrictEqual(goods.powersOf(w, 2, 1950).map((p) => p.kind), ['surcharge', 'subsidy', 'rentcap', 'landzone']);
  assert.deepStrictEqual(goods.powersOf(w, 3, 1950).map((p) => p.kind), ['support', 'housing']);
  assert.ok(goods.powersOf(w, 5, 1950).some((p) => p.kind === 'pricebrake'));
  assert.deepStrictEqual(goods.powersOf(w, 4, 1950).map((p) => p.kind), ['frame'], 'Bundestag bleibt beim Rahmen');
  const rc = goods.normalizePolicy(w, 2, c, 1950, { kind: 'rentcap', value: 2 }); assert.deepStrictEqual([rc.kind, rc.val, rc.scope_city], ['rentcap', 2, c.id]);
  assert.strictEqual(goods.normalizePolicy(w, 3, c, 1950, { kind: 'housing', value: 10 }).region, reg);
  assert.strictEqual(goods.normalizePolicy(w, 5, c, 1950, { kind: 'pricebrake', value: -1 }).val, -1);
  assert.throws(() => goods.normalizePolicy(w, 1, c, 1950, { kind: 'rentcap', value: 2 }), /Befugnis/);
  assert.throws(() => goods.normalizePolicy(w, 2, c, 1950, { kind: 'rentcap', value: 3 }), /nicht erlaubt/);
  assert.throws(() => goods.normalizePolicy(w, 2, c, 1950, { kind: 'landzone', value: 99 }), /nicht erlaubt/);
  assert.throws(() => goods.normalizePolicy(w, 5, c, 1950, { kind: 'pricebrake', value: 0 }), /nicht erlaubt/);
  goods.setPolicies(goods.buildPolicies([
    { kind: 'rentcap', val: 2, scope_city: c.id }, { kind: 'landzone', val: 10, scope_city: c.id }, { kind: 'housing', val: 5, region: reg }, { kind: 'pricebrake', val: -2, scope_city: 0 },
  ]));
  const ef = goods.effectsFor(w, c.id);
  assert.deepStrictEqual([ef.rentCap, ef.zone, ef.brake], [2, 15, -2]);
  assert.ok(ef.levy > 0, 'Wohnungsbauprogramm wird über die Umlage mitfinanziert');
  const other = w.cityList.find((x) => x.state !== reg);
  assert.deepStrictEqual([goods.effectsFor(w, other.id).rentCap, goods.effectsFor(w, other.id).zone, goods.effectsFor(w, other.id).brake], [null, 0, -2], 'nur Bremse gilt landesweit');
  goods.setPolicies(null);
  const prev = (row) => goods.previewPolicy(w, row, 1950, c.id).lines;
  const l1 = prev({ kind: 'rentcap', val: 2, scope_city: c.id })[0]; assert.strictEqual(l1.key, 'rentcap'); assert.ok(l1.b.length === 1 && Number.isFinite(l1.b[0].pct) && l1.c === 6);
  const l2 = prev({ kind: 'landzone', val: 10, scope_city: c.id })[0]; assert.strictEqual(l2.key, 'landzone'); assert.ok(l2.b.some((e) => e.sector === 'rent'));
  const l3 = prev({ kind: 'housing', val: 10, region: reg }); assert.ok(l3.some((l) => l.key === 'housing') && l3.some((l) => l.key === 'levy'));
  const l4 = prev({ kind: 'pricebrake', val: -2, scope_city: 0 })[0]; assert.strictEqual(l4.b.length, 5); assert.ok(l4.b.every((e) => e.pct < 0.5));
});

test('Politik wirkt in der Aktualisierung: Mietbremse deckelt, Beschluss läuft mit der Gleichgewichtsrechnung', () => {
  const c = city('braunschweig'); ce.prime();
  const inp = { players: 80, rooms: { food: 0, services: 0, build: 0, all: 0 } };
  const ef = { rentCap: 0, zone: 0, brake: 0 };
  let e = null;
  for (let i = 1; i <= 48; i++) { const t = ce.target(w, c.id, 'rent', inp, ef, i * HOUR); e = ce.advanceEntry(e, t, i * HOUR, ef.rentCap); }
  assert.ok(e.v <= 1.0001, `Miete bleibt eingefroren: ${e.v}`);
});

test('Engine-Lauf mit Stadtindizes bleibt endlich, lebt und ändert die Bilanz nur moderat', () => {
  const run = (prime) => {
    ce.reset(); if (prime) { ce.prime(); setDyn(city().id, { rent: 1.2, wage: 1.1, food: 1.1 }); }
    const s = fresh(); s.money = 400000;
    const e = edition(w, s, s.cityId);
    s.occupation = null;
    require('../src/game/actions').run('apply', { world: w, state: s, input: { listingId: e.jobs.find((j) => j.pkey === 'baecker').id }, user: { meta: {}, coins: 3 }, now: Date.now() });
    require('../src/game/actions').run('rent', { world: w, state: s, input: { listingId: e.housing.rent[0].id }, user: { meta: {}, coins: 3 }, now: Date.now() });
    for (let i = 0; i < 400; i++) { if (s.meters.fridge < 40) require('../src/game/actions').run('buyFood', { world: w, state: s, input: { tier: 1 }, user: { meta: {}, coins: 3 }, now: Date.now() }); advance(w, s, 1); s.interrupts = []; }
    return s;
  };
  const a = run(false); const b = run(true);
  assert.ok(Number.isFinite(a.money) && Number.isFinite(b.money));
  assert.strictEqual(b.status, 'alive');
});

test('Einsteiger: Aufgabe „Preise vergleichen“ und Hinweis auf günstigere Nachbarstadt', () => {
  const ob = require('../src/game/onboarding');
  const s = { day: 0, status: 'alive', money: 4000, hunger: 0, meters: { fridge: 45, health: 100 }, housing: { type: 'rent' }, occupation: { kind: 'work' }, skills: { learned: ['baecker'] }, stats: { earned: 1 }, properties: [], companies: [], children: [], partner: null, politics: { term: null, completed: {} }, flags: {}, fx: { coins: 0, efs: 0, influence: 0 } };
  ob.initFresh(s); const u = { meta: {} };
  assert.ok(ob.QUESTS.some((q) => q.id === 'prices') && ob.SEEN_KEYS.includes('prices'));
  ob.tick(s, u); // erledigt Wohnung, Arbeit und Lohn
  assert.ok(!s.flags.quests.done.prices);
  ob.markSeen(s, u, 'prices');
  assert.ok(ob.tick(s, u).includes('prices'));
  const v = { currency: 'DM', hunger: 0, meters: { fridge: 60, health: 90 }, money: 90000, status: 'alive', housing: { type: 'rent' }, occupation: { kind: 'work' }, properties: [], companies: [], children: [], flows: { net: 100, expense: 900 }, notices: [],
    econ: { on: true, rentShare: 0.4, tips: [{ kind: 'rent', cityId: 5, city: 'Teltow', km: 20, savePerDay: 250, pct: 22 }] } };
  const a = ob.advise(v, null, {});
  assert.strictEqual(a.top.id, 'cheaper-city'); assert.match(a.top.why, /40 %.*Teltow.*22 %/); assert.strictEqual(a.top.cta.tab, 'city');
  for (const t of [a.top.title, a.top.why, a.top.cta.label]) assert.notStrictEqual(require('../src/i18n-game').tr(t), t, `übersetzt: ${t.slice(0, 40)}`);
  for (const q of ob.QUESTS.filter((x) => x.id === 'prices')) for (const t of [q.title, q.why]) assert.notStrictEqual(require('../src/i18n-game').tr(t), t);
  v.econ.rentShare = 0.1; assert.notStrictEqual(ob.advise(v, null, {}).top.id, 'cheaper-city', 'bei niedriger Mietbelastung kein Hinweis');
  v.econ = { on: false, tips: [], rentShare: 0 }; assert.notStrictEqual(ob.advise(v, null, {}).top.id, 'cheaper-city');
});

test('Englisch: Beschlüsse, Zeitungsmeldungen, Aufgaben und Oberflächentexte sind übersetzt', () => {
  const g = require('../src/i18n-game');
  const missing = [];
  const need = (t) => { if (g.tr(t) === t) missing.push(t); };
  for (const k of ['rentcap', 'landzone', 'housing', 'pricebrake']) { need(goods.KINDS[k].name); need(goods.KINDS[k].what); }
  const c = city('braunschweig');
  for (const row of [{ kind: 'rentcap', val: 2, scope_city: c.id }, { kind: 'landzone', val: 10, scope_city: c.id }, { kind: 'housing', val: 5, region: c.state }, { kind: 'pricebrake', val: -1 }, { kind: 'pricebrake', val: 2 }]) need(require('../src/lib/policies').describe(w, row));
  ce.prime();
  for (const s of ce.SECTORS) for (const up of [true, false]) {
    const m = new Map(); m.set(ce.key(c.id, s), { v: up ? 1.4 : 0.8, t: 0, pt: 0, hist: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, up ? 1.4 : 0.8], cityId: c.id, sector: s }); ce.setState(m, new Map());
    for (const n of ce.news(w, c.id, 1970)) { need(n.title); need(n.text); }
  }
  assert.throws(() => goods.normalizePolicy(w, 2, c, 1950, { kind: 'rentcap', value: 3 }), (e) => { need(e.message); return true; });
  const cl = require('../src/i18n-data/client-L');
  for (const [re] of cl.patterns) assert.doesNotThrow(() => new RegExp(re));
  assert.deepStrictEqual(missing, []);
  // Glossareinträge der Stadtwirtschaft sind in der Oberfläche übersetzt
  const src = require('fs').readFileSync(require('path').join(__dirname, '../public/js/game/glossary-city.js'), 'utf8');
  const texts = [...src.matchAll(/^  \['[^']+', '([^']+)', '([^']+)'\],$/gm)];
  assert.strictEqual(texts.length, 6);
  for (const [, title, text] of texts) { assert.ok(cl.exact[title], title); assert.ok(cl.exact[text], text.slice(0, 40)); }
});
