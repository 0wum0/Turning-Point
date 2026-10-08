'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const { dailyFlows, netWorth } = require('../src/game/core');
const credit = require('../src/game/credit');
const tax = require('../src/game/tax');
const competition = require('../src/game/competition');
const { realEstateFactor } = require('../src/game/economy');
const { edition } = require('../src/game/newspaper');

const w = testWorld();
const u = () => ({ meta: {}, coins: 50, efs_pool: 0 });

test('Steuer ist progressiv und hat einen Freibetrag', () => {
  assert.strictEqual(tax.incomeTaxPerDay(1, 100), 0); // 365 DM im Jahr: steuerfrei
  const small = tax.incomeTaxPerDay(1, 1500); const big = tax.incomeTaxPerDay(1, 60000);
  assert.ok(small > 0 && big / 60000 > small / 1500, 'höherer Durchschnittssatz bei höherem Einkommen');
  assert.strictEqual(tax.corporateTax(-100), 0);
  assert.strictEqual(tax.corporateTax(1000), 150); // Gewerbesteuer 15 %
});

test('Kredit: Auszahlung, Tagesrate in den Flüssen, Tilgung bis null, Schulden senken das Vermögen', () => {
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), u());
  s.money = 5000000; s.properties.push({ id: 1, kind: 'house_small', name: 'Haus', cityId: s.cityId, rooms: 4, base: 2000000, condition: 100, closedUntil: 0, bought: 0 });
  const nw0 = netWorth(w, s); const m0 = s.money;
  const r = credit.take(w, s, 500000, 2);
  assert.strictEqual(s.money, m0 + 500000);
  assert.strictEqual(dailyFlows(w, s).exp.loan, r.pay);
  assert.ok(Math.abs(netWorth(w, s) - nw0) < 5, 'Kredit ändert das Vermögen nicht (Geld rein, Schuld drauf)');
  for (let i = 0; i < 800; i++) credit.creditDaily({ state: s });
  assert.strictEqual((s.loans || []).length, 0);
  assert.throws(() => credit.take(w, s, 5e12, 5), /Kreditrahmen/);
});

test('Konkurrenz: zu viele Räume derselben Art in einer Stadt drücken den Umsatz', () => {
  const city = w.cityList[0];
  competition.setSupply([]);
  assert.strictEqual(competition.info(w, city.id, 'baecker', 2).factor, 1);
  competition.setSupply([{ city_id: city.id, pkey: 'baecker', rooms: 200, firms: 20 }]);
  const f = competition.info(w, city.id, 'baecker', 2).factor;
  assert.ok(f < 0.6 && f >= 0.35, `Faktor ${f}`);
  competition.setSupply([]);
});

test('Immobilienzyklus: Faktor je Jahr, stetig', () => {
  assert.ok(realEstateFactor(1945) < realEstateFactor(1957));
  assert.ok(Math.abs(realEstateFactor(2021) - 1.5) < 1e-9);
  assert.ok(realEstateFactor(2200) > 1);
});

test('Wettbewerb: Preiskampf und Anschlag senken den Umsatz, Sicherheitsdienst kostet', () => {
  const biz = require('../src/game/business');
  const actions = require('../src/game/actions');
  const { edition } = require('../src/game/newspaper');
  const s = createCharacter(w, input(w, { professionKey: 'wirt' }), u());
  s.money = 90000000; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 };
  const l = edition(w, s, s.cityId).biz.find((x) => x.pkey === 'wirt');
  actions.run('buyBiz', { world: w, state: s, input: { listingId: l.id }, user: u(), now: Date.now() });
  const c = s.companies[0]; c.staff = 6; c.manager = true;
  const year = require('../src/game/calendar').yearOf(s.day, s.startYear);
  const base = biz.companyFlows(w, s, c, year).income;
  c.hit = { until: s.day + 10, factor: 0.8 };
  assert.ok(biz.companyFlows(w, s, c, year).income < base);
  c.outageUntil = s.day + 3;
  assert.strictEqual(biz.companyFlows(w, s, c, year).income, 0);
  delete c.hit; c.outageUntil = 0;
  const up0 = biz.companyFlows(w, s, c, year).upkeep; c.security = true;
  assert.ok(biz.companyFlows(w, s, c, year).upkeep > up0);
});

test('Tagesabrechnung: Miete wird gutgeschrieben, Einkommensteuer und Kreditrate wirklich abgebucht', () => {
  const { advance } = require('../src/game/engine');
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), u());
  s.money = 50000000; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 };
  s.occupation = { kind: 'work', pkey: 'baecker', employer: 'x', cityId: s.cityId, factor: 1, since: 0 };
  s.properties.push({ id: 1, kind: 'house_small', name: 'H', cityId: s.cityId, rooms: 4, base: 2000000, condition: 100, closedUntil: 0, bought: 0, lease: { on: true, mult: 1, tenant: { name: 'a', since: 0, until: 99999, arrears: 0 }, total: 0 } });
  credit.take(w, s, 1000000, 5);
  s.meters.fridge = 100;
  const f = dailyFlows(w, s);
  const m0 = s.money; const d0 = credit.debt(s);
  advance(w, s, 1);
  assert.ok(f.inc.rent > 0 && f.exp.tax > 0 && f.exp.loan > 0);
  // Lohn + Miete - Steuer - Rate - Unterkunft - Unterhalt (Essen ist über den Kühlschrank gedeckt)
  const expected = f.inc.wage + f.inc.rent - f.exp.tax - f.exp.loan - f.exp.lodging - f.exp.upkeep;
  assert.ok(Math.abs((s.money - m0) - expected) <= 2, `Kontoänderung ${s.money - m0} statt ${expected}`);
  assert.ok(credit.debt(s) < d0, 'Tilgung läuft');
});

test('Euro-Umstellung halbiert Restschuld und Firmenkasse', () => {
  const { isEuroDay } = require('../src/game/economy');
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), u());
  s.money = 50000000; s.properties.push({ id: 1, kind: 'house_small', name: 'H', cityId: s.cityId, rooms: 4, base: 2000000, condition: 100, closedUntil: 0, bought: 0 });
  credit.take(w, s, 800000, 5);
  s.day = (2002 - 1945) * 365 - 1; // der nächste Tick ist der 1. Januar 2002
  const left = s.loans[0].left; const pay = s.loans[0].pay;
  s.day++;
  assert.ok(isEuroDay(s.day, s.startYear, w.econ));
  credit.creditDaily({ state: s });
  assert.ok(s.loans[0].left < left * 0.51 && s.loans[0].pay <= Math.ceil(pay / 2) + 1, 'Schuld und Rate halbiert');
  assert.ok(!isEuroDay(s.day + 1, s.startYear, w.econ));
});

test('Kredit: Raten müssen zum Einkommen passen', () => {
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), u());
  s.money = 5000000; s.occupation = null;
  s.properties.push({ id: 1, kind: 'villa', name: 'V', cityId: s.cityId, rooms: 15, base: 15000000, condition: 100, closedUntil: 0, bought: 0 });
  assert.throws(() => credit.take(w, s, 4000000, 1), /zu hoch/);
  assert.doesNotThrow(() => credit.take(w, s, 4000000, 30));
});

test('Einstiegsbetrieb bleibt im Angebot, auch wenn man die höhere Stufe beherrscht', () => {
  const s = createCharacter(w, input(w, { professionKey: 'wirt' }), u());
  s.skills.days.wirt = 4000; // Meister: darf Stufe 2
  const b = edition(w, s, s.cityId).biz.filter((x) => x.pkey === 'wirt');
  assert.ok(b.some((x) => x.tier === 0 && x.qualified), 'Wirtshaus (Stufe 1) weiterhin kaufbar');
  assert.ok(b.some((x) => x.tier >= 1 && x.qualified));
});
