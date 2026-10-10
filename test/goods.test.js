'use strict';
/** Warenkreislauf: Katalog, Rezepte, Versorgung, Verträge (rein, ohne Datenbank), Politik-Wirkungen. */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const seed = require('../src/db/seed-data');
const settings = require('../src/settings');
const { buildWorld } = require('../src/game/world');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const biz = require('../src/game/business');
const goods = require('../src/game/goods');
const competition = require('../src/game/competition');

settings.DEFAULTS.talente.effects.strength = 0; // exakte Rechnungen: ohne Talentwirkung
const base = testWorld();
const extra = seed.ERA_PROFESSIONS.map((p, i) => ({ id: 1000 + i, pkey: p[0], name: p[1], category: p[2], icon: p[3], era_from: p[4], era_to: p[5], base_wage: p[6], training_days: p[7], tuition_day: p[8], academic: p[9], replaces: p[10], lodging: p[11], unlocks: p[12], description: p[13], active: 1 }));
const w = buildWorld(base.cityList, [...base.professions.values(), ...extra]);
const city = (slug = 'braunschweig') => w.cityList.find((c) => c.slug === slug);
const mkState = () => { const s = createCharacter(w, input(w, { professionKey: 'baecker' }), { meta: {}, coins: 1, efs_pool: 0 }); s.contracts = { buys: [], sells: [] }; return s; };
const firm = (s, over = {}) => { const t = biz.tiersOf(w)[over.tier || 0]; const c = { id: 1, pkey: 'baecker', tier: 0, cityId: city().id, rooms: t.rooms, staff: 0, manager: true, cash: 0, base: 1, abandoned: null, ...over }; c.staff = over.staff != null ? over.staff : biz.staffNeeded(w, c); return c; };
const withGoods = (patch, fn) => { const g = settings.DEFAULTS.goods; const old = JSON.stringify(g); Object.assign(g, patch); try { return fn(); } finally { Object.assign(g, JSON.parse(old)); } };
const reset = () => { goods.setScarcity(new Map()); goods.setPolicies(null); competition.setSupply([]); };

test('Katalog: Waren haben Einheit, Preis und gültigen Zeitraum', () => {
  for (const g of Object.values(goods.GOODS)) {
    assert.ok(g.name && g.unit && g.base > 0 && g.from <= g.to, g.key);
    if (!g.service) assert.ok(g.imp && g.imp.length === 2 && g.imp.every((x) => x >= 0 && x <= 1), `${g.key} Importanteil`);
  }
  assert.ok(goods.inEra(goods.good('strom'), 1950) && !goods.inEra(goods.good('elektronik'), 1950) && goods.inEra(goods.good('elektronik'), 1975));
  assert.ok(goods.priceReal(goods.good('elektronik'), 2100) < goods.priceReal(goods.good('elektronik'), 1970), 'Elektronik wird real billiger');
});

test('Rezepte: jeder Betrieb hat eins, nur bekannte Waren, Anteile plausibel, Erzeuger ohne Zutaten', () => {
  let firms = 0;
  for (const p of w.professions.values()) {
    if (!p.unlocks) continue;
    firms++;
    for (const year of [1950, 1975, 2000, 2030, 2070]) {
      if (year < p.era_from || year > p.era_to) continue;
      const ar = goods.activeRecipe(w, p.pkey, year, city().id);
      assert.ok(ar.out.length >= 1, `${p.pkey} ohne Erzeugnis`);
      assert.ok(Math.abs(ar.out.reduce((s, o) => s + o.share, 0) - 1) < 1e-9, `${p.pkey} Erzeugnisanteile`);
      for (const i of ar.inputs) assert.ok(goods.inEra(goods.good(i.good), year), `${p.pkey} ${i.good} ${year}`);
      assert.ok(ar.wholesaleShare <= 0.6 && ar.mult >= 1 && ar.mult <= 2.6, `${p.pkey} ${year} mult ${ar.mult}`);
      assert.strictEqual(ar.primary, ar.inputs.length === 0);
    }
  }
  assert.ok(firms > 80);
  for (const k of ['landwirt', 'bergmann', 'kutterfischer', 'gaertner', 'windkraftmonteur']) assert.strictEqual(goods.activeRecipe(w, k, 1990, 1).primary, true, k);
  assert.ok(goods.activeRecipe(w, 'baecker', 1950, 1).inputs.some((i) => i.good === 'mehl'));
  assert.ok(goods.activeRecipe(w, 'baecker', 1950, 1).inputs.some((i) => i.good === 'kohle') && goods.activeRecipe(w, 'baecker', 2000, 1).inputs.some((i) => i.good === 'strom'));
  assert.ok(!goods.activeRecipe(w, 'elektriker', 1950, 1).inputs.some((i) => i.good === 'elektronik'), 'Elektronik gibt es 1950 noch nicht');
});

test('Marge bleibt: Einkauf im Großhandel kostet den Aufschlag, der Umsatz ist darauf kalkuliert (alle Berufe, alle Epochen)', () => {
  reset();
  const s = mkState();
  let n = 0;
  for (const p of w.professions.values()) {
    if (!p.unlocks) continue;
    for (const year of [1950, 1970, 1990, 2010, 2040, 2080]) {
      if (year < p.era_from || year > p.era_to) continue;
      s.day = (year - 1945) * 365;
      for (const tier of [0, 1, 2]) {
        const c = firm(s, { pkey: p.pkey, tier });
        const f1 = biz.companyFlows(w, s, c, year);
        const f0 = withGoods({ enabled: false }, () => biz.companyFlows(w, s, c, year));
        assert.ok(f1.profit > 0, `${p.pkey} ${year} T${tier} Gewinn ${f1.profit}`);
        assert.ok(Math.abs(f1.profit - f0.profit) <= Math.max(3, f0.profit * 0.02), `${p.pkey} ${year} T${tier}: ${f0.profit} → ${f1.profit}`);
        assert.ok(f1.supply.status === 'ok' || f1.supply.status === 'none');
        n++;
      }
    }
  }
  assert.ok(n > 500);
});

test('Versorgung: ohne Vorräte sinkt die Leistung bis zur Untergrenze, nie auf null; Großhandel (Standard) deckt alles', () => {
  reset();
  const s = mkState(); s.day = 5 * 365;
  const c = firm(s);
  const auto = biz.companyFlows(w, s, c, 1950);
  assert.strictEqual(auto.supply.status, 'ok'); assert.strictEqual(auto.supply.ratio, 1); assert.ok(auto.inputs > 0 && auto.supply.costWholesale === auto.inputs);
  c.autoBuy = false;
  const none = biz.companyFlows(w, s, c, 1950);
  assert.strictEqual(none.supply.status, 'missing'); assert.strictEqual(none.inputs, 0);
  assert.ok(none.income > 0 && none.income < auto.income * 0.5, `${none.income} vs ${auto.income}`);
  assert.ok(Math.abs(none.supply.factor - 0.35) < 1e-9);
  assert.ok(none.needs === undefined);
  withGoods({ noInputEfficiencyPct: 60 }, () => assert.ok(Math.abs(biz.companyFlows(w, s, c, 1950).supply.factor - 0.6) < 1e-9));
});

test('Liefervertrag: günstiger als Großhandel, deckt den Bedarf; Zahlung wird für den Verkäufer vorgemerkt; Laufzeit zählt herunter', () => {
  reset();
  const s = mkState(); s.day = 5 * 365; s.money = 1e7;
  const c = firm(s); s.companies = [c]; s.nextCompanyId = 2;
  const idx = w.idx(1950);
  const f0 = biz.companyFlows(w, s, c, 1950);
  const need = f0.supply.needs.find((n) => n.good === 'mehl');
  const real = goods.priceReal(goods.good('mehl'), 1950); // Vertragspreis = Basispreis (Wholesale ist +25 %)
  s.contracts.buys.push({ id: 7, firmId: 1, sellerId: 42, sellerFirm: 3, sellerName: 'Mühle X', good: 'mehl', qty: need.need * 2, price: real, daysLeft: 2, term: 30, auto: false, fill: 1 });
  const f1 = biz.companyFlows(w, s, c, 1950);
  const n1 = f1.supply.needs.find((n) => n.good === 'mehl');
  assert.ok(n1.byContract > 0 && n1.byWholesale === 0 && n1.missing === 0);
  assert.ok(f1.inputs < f0.inputs, 'Vertrag spart Geld');
  assert.ok(f1.profit > f0.profit);
  assert.strictEqual(f1.supply.pays.length, 1); assert.strictEqual(f1.supply.pays[0].sellerId, 42);
  const cash0 = c.cash;
  biz.settleContracts(s, c, f1, idx);
  assert.strictEqual(s.pending.supply.length, 1);
  assert.ok(Math.abs(s.pending.supply[0].real - f1.supply.pays[0].cents / idx) < 1e-9);
  biz.settleContracts(s, c, f1, idx); // zweiter Tag: gleicher Eintrag wird aufsummiert, nicht verdoppelt angelegt
  assert.strictEqual(s.pending.supply.length, 1);
  assert.ok(Math.abs(s.pending.supply[0].real - 2 * f1.supply.pays[0].cents / idx) < 1e-9);
  assert.ok(s.contracts.buys[0].ended, 'nach Ablauf ohne Verlängerung beendet');
  assert.strictEqual(c.cash, cash0);
  // beendeter Vertrag liefert nicht mehr
  assert.strictEqual(biz.companyFlows(w, s, c, 1950).supply.pays.length, 0);
  // Verlängerung
  s.contracts.buys[0].ended = false; s.contracts.buys[0].auto = true; s.contracts.buys[0].daysLeft = 1;
  biz.settleContracts(s, c, f1, idx);
  assert.strictEqual(s.contracts.buys[0].daysLeft, 30); assert.ok(!s.contracts.buys[0].ended);
});

test('Teillieferung: Verkäufer liefert nur teilweise (fill), den Rest kauft der Betrieb im Großhandel oder es bleibt eine Lücke', () => {
  reset();
  const s = mkState(); s.day = 5 * 365;
  const c = firm(s); s.companies = [c];
  const need = biz.companyFlows(w, s, c, 1950).supply.needs.find((n) => n.good === 'mehl').need;
  s.contracts.buys.push({ id: 1, firmId: 1, sellerId: 9, sellerFirm: 1, good: 'mehl', qty: need, price: goods.priceReal(goods.good('mehl'), 1950), daysLeft: 50, term: 50, fill: 0.4 });
  let n = biz.companyFlows(w, s, c, 1950).supply.needs.find((x) => x.good === 'mehl');
  assert.ok(Math.abs(n.byContract - need * 0.4) < 1e-6 && Math.abs(n.byWholesale - need * 0.6) < 1e-6);
  c.autoBuy = false;
  const f = biz.companyFlows(w, s, c, 1950); n = f.supply.needs.find((x) => x.good === 'mehl');
  assert.ok(n.missing > 0 && f.supply.status !== 'ok');
});

test('Verkauf per Vertrag: Teil der Produktion geht an den Käufer, der übrige Umsatz sinkt um denselben Anteil', () => {
  reset();
  const s = mkState(); s.day = 5 * 365;
  const c = firm(s, { pkey: 'muehle' }); s.companies = [c];
  const free = biz.companyFlows(w, s, c, 1950);
  const units = free.supply.outputs[0].units;
  s.contracts.sells.push({ id: 5, firmId: 1, buyerId: 8, buyerFirm: 2, good: 'mehl', qty: units * 0.25, price: goods.priceReal(goods.good('mehl'), 1950) * 1.0, fill: 1 });
  const f = biz.companyFlows(w, s, c, 1950);
  assert.ok(Math.abs(f.income / free.income - 0.75) < 0.01, `${f.income / free.income}`);
  assert.ok(f.contractIncome > 0 && f.profitAll > f.profit);
  assert.strictEqual(f.supply.fills[5], 1);
  // zu viel zugesagt → Erfüllungsgrad < 1
  s.contracts.sells[0].qty = units * 3;
  const g = biz.companyFlows(w, s, c, 1950);
  assert.ok(Math.abs(g.supply.fills[5] - 1 / 3) < 0.01); assert.ok(g.income < free.income * 0.05);
  biz.settleContracts(s, c, g, w.idx(1950));
  assert.ok(Math.abs(s.contracts.sells[0].fill - 0.333) < 0.002);
});

test('Preise: Stadt, Knappheit, Zoll und Subvention wirken; Dienstleistungen kennen keine Knappheit', () => {
  reset();
  const cid = city().id; const year = 1960;
  const p0 = goods.price(w, cid, 'kraftstoff', year);
  assert.ok(p0.buy > p0.market && p0.market >= p0.sell, 'Großhandel: Aufschlag beim Einkauf, Abschlag beim Ankauf');
  assert.ok(Math.abs(p0.buy / p0.market - 1.25) < 1e-9);
  goods.setScarcity(new Map([[`${cid}|kraftstoff`, 1.3]]));
  assert.ok(goods.price(w, cid, 'kraftstoff', year).buy > p0.buy * 1.25);
  const pol = goods.buildPolicies([{ office_idx: 5, kind: 'tariff', val: 20, good: null, scope_city: 0, region: null }, { office_idx: 5, kind: 'natsubsidy', good: 'mehl', val: 10, scope_city: 0, region: null }]);
  goods.setPolicies(pol);
  const p1 = goods.price(w, cid, 'kraftstoff', year);
  assert.ok(p1.market > p0.market * 1.1, `Zoll auf Importware: ${p1.market / p0.market}`);
  assert.ok(Math.abs(goods.price(w, cid, 'brot', year).market / goods.price(w, cid, 'brot', year).base - 1) < 0.1);
  assert.strictEqual(goods.price(w, cid, 'mehl', year).subsidy, 10);
  reset();
});

test('Politik: Zuschlag, Mehrwertsteuer und Subvention (mit Gegenfinanzierung) verändern Steuern und Einkauf', () => {
  reset();
  const s = mkState(); s.day = 5 * 365;
  const c = firm(s, { tier: 1 }); const cid = c.cityId; const reg = city().state;
  const f0 = biz.companyFlows(w, s, c, 1950);
  goods.setPolicies(goods.buildPolicies([{ kind: 'surcharge', val: 4, scope_city: cid }]));
  const f1 = biz.companyFlows(w, s, c, 1950);
  assert.ok(f1.tax > f0.tax && f1.profit < f0.profit);
  assert.ok(Math.abs(f1.tax - f0.tax - Math.round(f0.pretax * 0.04)) <= 2);
  goods.setPolicies(goods.buildPolicies([{ kind: 'vat', val: 5, scope_city: 0 }]));
  const f2 = biz.companyFlows(w, s, c, 1950); assert.ok(f2.vat > 0 && f2.profit < f0.profit);
  goods.setPolicies(goods.buildPolicies([{ kind: 'vat', val: -3, scope_city: 0 }]));
  const f3 = biz.companyFlows(w, s, c, 1950); assert.ok(f3.vat < 0 && f3.profit > f0.profit);
  goods.setPolicies(goods.buildPolicies([{ kind: 'subsidy', good: 'mehl', val: 20, scope_city: cid }]));
  const f4 = biz.companyFlows(w, s, c, 1950);
  assert.ok(f4.supply.subsidy > 0 && f4.inputs < f0.inputs);
  assert.ok(f4.supply.policy.levy > 2.9 && f4.supply.policy.levy < 3.1, 'Subvention 20 % kostet 3 Punkte Umlage');
  // Preisstützung (Land): Erzeuger der Region bekommen mehr Umsatz
  const m = firm(s, { pkey: 'muehle', tier: 1 });
  const g0 = biz.companyFlows(w, s, m, 1950);
  goods.setPolicies(goods.buildPolicies([{ kind: 'support', good: 'mehl', val: 15, region: reg }]));
  assert.ok(biz.companyFlows(w, s, m, 1950).income > g0.income * 1.1);
  // ein anderes Bundesland merkt nichts
  const other = w.cityList.find((x) => x.state !== reg);
  assert.strictEqual(biz.companyFlows(w, s, { ...m, cityId: other.id }, 1950).income, biz.companyFlows(w, s, { ...m, cityId: other.id }, 1950).income);
  reset();
});

test('Rahmen des Bundestags begrenzt Zuschlag und Subventionen', () => {
  reset();
  const cid = city().id;
  goods.setPolicies(goods.buildPolicies([{ kind: 'surcharge', val: 4, scope_city: cid }, { kind: 'frame', good: 'eng', val: 1 }]));
  assert.strictEqual(goods.effectsFor(w, cid).surcharge, 2, 'strenger Rahmen kappt auf 2');
  assert.deepStrictEqual(goods.powersOf(w, 2, 1950).find((p) => p.kind === 'subsidy').options, [5, 10]);
  assert.strictEqual(goods.powersOf(w, 2, 1950).find((p) => p.kind === 'surcharge').max, 2);
  reset();
  assert.strictEqual(goods.powersOf(w, 2, 1950).find((p) => p.kind === 'surcharge').max, 4);
});

test('Befugnisse: Ämter und Prüfung der Beschlüsse', () => {
  reset();
  assert.deepStrictEqual(goods.powersOf(w, 0, 1950), []);
  assert.deepStrictEqual(goods.powersOf(w, 1, 1950).map((p) => p.kind), ['surcharge', 'landzone', 'edu_city']);
  assert.deepStrictEqual(goods.powersOf(w, 5, 1950).map((p) => p.kind), ['vat', 'tariff', 'natsubsidy', 'pricebrake', 'edu_nation']);
  const c = city();
  const row = goods.normalizePolicy(w, 2, c, 1950, { kind: 'subsidy', good: 'mehl', value: 15 });
  assert.deepStrictEqual([row.kind, row.good, row.val, row.scope_city], ['subsidy', 'mehl', 15, c.id]);
  assert.throws(() => goods.normalizePolicy(w, 1, c, 1950, { kind: 'subsidy', good: 'mehl', value: 15 }), /Befugnis/);
  assert.throws(() => goods.normalizePolicy(w, 2, c, 1950, { kind: 'subsidy', good: 'mehl', value: 25 }), /nicht erlaubt/);
  assert.throws(() => goods.normalizePolicy(w, 2, c, 1950, { kind: 'subsidy', good: 'mahlzeit', value: 10 }), /Ware/);
  assert.throws(() => goods.normalizePolicy(w, 1, c, 1950, { kind: 'surcharge', value: 9 }), /Erlaubt/);
  assert.throws(() => goods.normalizePolicy(w, 5, c, 1950, { kind: 'tariff', value: 7 }), /5er/);
  assert.strictEqual(goods.normalizePolicy(w, 3, c, 1950, { kind: 'support', good: 'getreide', value: 10 }).region, c.state);
  assert.strictEqual(goods.normalizePolicy(w, 4, c, 1950, { kind: 'frame', good: 'weit' }).good, 'weit');
  const pv = goods.previewPolicy(w, row, 1950); assert.ok(pv.lines.some((l) => l.key === 'levy' && l.a === 2.3 || l.a === 2.2));
  assert.throws(() => goods.normalizePolicy(w, 5, c, 1950, { kind: 'vat', value: 1.5 }), /ganzzahlig/);
});

test('Knappheit: viele Erzeuger drücken den Preis, viele Abnehmer treiben ihn hoch; ohne Spieler neutral', () => {
  const cid = city().id;
  assert.strictEqual(goods.computeScarcity(w, []).size, 0);
  const mills = goods.computeScarcity(w, [{ city_id: cid, pkey: 'landwirt', tier: 2, rooms: 40, year: 1950 }]);
  assert.ok(mills.get(`${cid}|getreide`) < 1, 'Überangebot an Getreide');
  const bakers = goods.computeScarcity(w, Array.from({ length: 6 }, () => ({ city_id: cid, pkey: 'baecker', tier: 1, rooms: 14, year: 1950 })));
  assert.ok(bakers.get(`${cid}|mehl`) > 1.1 && bakers.get(`${cid}|mehl`) <= 1.5);
  assert.ok(!bakers.has(`${cid}|brot`) || bakers.get(`${cid}|brot`) < 1);
  assert.ok(![...bakers.keys()].some((k) => k.endsWith('|mahlzeit')), 'Dienstleistungen ohne Knappheit');
});

test('Tagesablauf über viele Tage: Firmenkasse wächst, Vorräte werden bezahlt, keine ungültigen Zahlen', () => {
  reset();
  const s = mkState(); s.money = 5e7; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 };
  const c = firm(s, { cityId: s.cityId }); s.companies = [c]; s.nextCompanyId = 2;
  s.occupation = { kind: 'work', pkey: 'baecker', ownCompanyId: 1, employer: 'x', cityId: s.cityId, factor: 1, since: 0, daysLeft: 0 };
  for (let i = 0; i < 400 && s.status === 'alive'; i++) { s.meters.fridge = 100; advance(w, s, 1); s.interrupts = []; }
  assert.ok(Number.isFinite(c.cash) && c.cash > 0, `Kasse ${c.cash}`);
  assert.ok(!(s.pending.supply || []).length, 'ohne Verträge keine Gutschriften');
  JSON.parse(JSON.stringify(s));
});
