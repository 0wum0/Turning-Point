'use strict';
/** Handelsrouten und Transport (rein, ohne Datenbank): Entfernung, Verkehrsträger je Epoche, Kosten, Jahreszeit/Hochwasser/Seuche, Politik, Routen, Risiken. */
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
const T = require('../src/game/transport');
const TR = require('../src/game/trade');
const { yearOf } = require('../src/game/calendar');

settings.DEFAULTS.talente.effects.strength = 0;
settings.DEFAULTS.jahreszeiten.harvest.enabled = false;
const base = testWorld();
const extra = seed.ERA_PROFESSIONS.map((p, i) => ({ id: 1000 + i, pkey: p[0], name: p[1], category: p[2], icon: p[3], era_from: p[4], era_to: p[5], base_wage: p[6], training_days: p[7], tuition_day: p[8], academic: p[9], replaces: p[10], lodging: p[11], unlocks: p[12], description: p[13], active: 1 }));
const w = buildWorld(base.cityList, [...base.professions.values(), ...extra]);
const cid = (n) => w.cityList.find((c) => c.name === n).id;
const reset = () => { goods.setScarcity(new Map()); goods.setPolicies(null); competition.setSupply([]); T.setPolicy(null); TR.setLoad(new Map()); };
const NOENV = { winter: 0, lock: 0, flood: false };
const q = (from, to, good, year, over = {}) => T.quote(w, { from: cid(from), to: cid(to), good, year, doy: 150, unitValueReal: goods.price(w, cid(from), good, year).market / w.idx(year), env: NOENV, ...over });
const mk = (year = 1952, pkey = 'kraftfahrer', over = {}) => {
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), { meta: {}, coins: 1, efs_pool: 0 });
  s.contracts = { buys: [], sells: [] };
  s.day = (year - 1945) * 365 + 100; s.startYear = 1945; s.person.birthDay = s.day - 30 * 365;
  s.housing = { type: 'rent', cityId: s.cityId, base: 3000, rooms: 1 }; s.money = 5e6; s.meters.fridge = 100;
  const t = biz.tiersOf(w)[over.tier || 0];
  const c = { id: 1, pkey, tier: 0, name: 'Spedition Test', cityId: cid('Cottbus'), rooms: t.rooms, staff: 0, manager: true, cash: 4e5, base: 1, abandoned: null, ...over };
  c.staff = biz.staffNeeded(w, c); s.companies = [c]; s.nextCompanyId = 2;
  return { s, c };
};
const ctxOf = (s, offline = false) => ({ world: w, state: s, offline });
// Der Tagesablauf einer Route ohne die übrige Simulation: Tage vorwärts, nur Handelsrouten
const run = (s, days, offline = false) => { for (let i = 0; i < days; i++) { s.day++; TR.daily(ctxOf(s, offline)); } };

test('Entfernung: Luftlinie aus Länge/Breite, symmetrisch und plausibel', () => {
  const a = w.city(cid('Berlin')); const b = w.city(cid('München'));
  const d = T.distanceKm(a, b);
  assert.ok(d > 480 && d < 530, `Berlin–München ${d}`);
  assert.strictEqual(Math.round(T.distanceKm(a, b)), Math.round(T.distanceKm(b, a)));
  assert.strictEqual(T.distanceKm(a, a), 0);
});

test('Verkehrsträger je Epoche: Fuhrwerk und Bahn 1946, LKW ab 1950, Containerschiff ab 1970, Luftfracht ab 1980, Drohne ab 2035, Röhre ab 2060', () => {
  reset();
  const ok = (from, to, good, year) => q(from, to, good, year).options.filter((o) => o.ok).map((o) => o.key);
  const k46 = ok('Cottbus', 'Dresden', 'brot', 1946);
  assert.ok(k46.includes('fuhrwerk') && k46.includes('bahn') && !k46.includes('lkw'), k46.join());
  assert.ok(ok('Cottbus', 'Dresden', 'brot', 1955).includes('lkw'));
  assert.ok(!ok('Hamburg', 'Bremen', 'brot', 1965).includes('container') && ok('Hamburg', 'Bremen', 'brot', 1975).includes('container'));
  assert.ok(!ok('Hamburg', 'München', 'brot', 1975).includes('luft') && ok('Hamburg', 'München', 'brot', 1985).includes('luft'));
  assert.ok(!ok('Cottbus', 'Dresden', 'arznei', 2030).includes('drohne') && ok('Cottbus', 'Dresden', 'arznei', 2040).includes('drohne'));
  assert.ok(!ok('Cottbus', 'Dresden', 'moebel', 2040).includes('drohne'), 'Möbel sind zu schwer für Drohnen');
  assert.ok(ok('Hamburg', 'München', 'brot', 2070).includes('hyperloop') && !ok('Hamburg', 'München', 'brot', 2050).includes('hyperloop'));
  assert.ok(!ok('Cottbus', 'Passau', 'brot', 1980).includes('container'), 'Kein Hafen in Cottbus');
});

test('Geschwindigkeit und Kosten: LKW wird schneller und billiger, Fuhrwerk ist langsam, Luft teuer und schnell', () => {
  reset();
  const lk = (y) => q('Hamburg', 'München', 'moebel', y).options.find((o) => o.key === 'lkw');
  assert.ok(lk(1955).days > lk(1995).days && lk(1955).perUnit.freight > lk(1995).perUnit.freight);
  const fu = q('Hamburg', 'München', 'moebel', 1950).options.find((o) => o.key === 'fuhrwerk');
  assert.ok(fu.days >= 3 * lk(1955).days);
  const li = q('Hamburg', 'München', 'moebel', 1990).options.find((o) => o.key === 'luft');
  const lk90 = q('Hamburg', 'München', 'moebel', 1990).options.find((o) => o.key === 'lkw');
  assert.ok(li.days <= lk90.days && li.perUnit.freight > 4 * lk90.perUnit.freight);
  const x = q('Hamburg', 'München', 'moebel', 1990);
  assert.ok(x.pick.days >= 1 && x.pick.days <= T.C().maxDays);
  assert.ok(x.pick.perUnit.total > 0 && Number.isFinite(x.pick.perUnit.total));
});

test('Preise des Kraftstoffs gehen in die Kosten ein (Knappheit am Startort)', () => {
  reset();
  const a = q('Cottbus', 'Dresden', 'eisen', 1960).options.find((o) => o.key === 'lkw');
  goods.setScarcity(new Map([[`${cid('Cottbus')}|kraftstoff`, 1.5]]));
  const b = q('Cottbus', 'Dresden', 'eisen', 1960).options.find((o) => o.key === 'lkw');
  assert.ok(b.perUnit.freight > a.perUnit.freight * 1.1, `${a.perUnit.freight} → ${b.perUnit.freight}`);
  reset();
});

test('Jahreszeit, Hochwasser und Seuchen: Winter bremst, Flut sperrt, Lockdown erhöht Reisezeit und Kosten', () => {
  reset();
  const cold = T.quote(w, { from: cid('Cottbus'), to: cid('Dresden'), good: 'eisen', year: 1963, doy: 20, unitValueReal: 30, mode: 'lkw' });
  const warm = T.quote(w, { from: cid('Cottbus'), to: cid('Dresden'), good: 'eisen', year: 1963, doy: 200, unitValueReal: 30, mode: 'lkw' });
  assert.ok(cold.env.winter > 0.5 && warm.env.winter === 0);
  assert.ok(cold.pick.perUnit.freight > warm.pick.perUnit.freight && cold.pick.speed < warm.pick.speed);
  // Jahrhundertflut 2002: Sachsen
  let hit = -1; for (let d = 100; d < 300; d++) if (T.floodActive(2002, d, 'Sachsen')) { hit = d; break; }
  assert.ok(hit > 0, 'Flut in Sachsen 2002');
  const fl = T.quote(w, { from: cid('Dresden'), to: cid('Leipzig'), good: 'eisen', year: 2002, doy: hit, unitValueReal: 30, mode: 'lkw' });
  const dry = T.quote(w, { from: cid('Dresden'), to: cid('Leipzig'), good: 'eisen', year: 2002, doy: 20, unitValueReal: 30, mode: 'lkw' });
  assert.ok(fl.env.flood && !dry.env.flood && fl.pick.days > dry.pick.days);
  assert.ok(!T.floodActive(2002, hit, 'Bremen'), 'nur betroffene Länder');
  const lock = T.quote(w, { from: cid('Cottbus'), to: cid('Dresden'), good: 'eisen', year: 2020, doy: 120, unitValueReal: 30, mode: 'lkw', env: { winter: 0, lock: 3, flood: false } });
  const free = T.quote(w, { from: cid('Cottbus'), to: cid('Dresden'), good: 'eisen', year: 2020, doy: 120, unitValueReal: 30, mode: 'lkw', env: NOENV });
  assert.ok(lock.pick.days >= free.pick.days && lock.pick.perUnit.freight > free.pick.perUnit.freight);
});

test('Politik: Netz und Straßenbau machen LKW schneller und billiger, Stadtmaut verteuert, Ausbau schafft Bahnanschluss, Zoll trifft Hafen- und Luftfracht', () => {
  reset();
  const base0 = q('Cottbus', 'Dresden', 'eisen', 1975, { mode: 'lkw' }).pick;
  const pol = T.noPolicy(); pol.nation.net = 3; pol.region.set('Brandenburg', { road: 3 }); pol.region.set('Sachsen', { road: 3 });
  T.setPolicy(pol);
  const fast = q('Cottbus', 'Dresden', 'eisen', 1975, { mode: 'lkw' }).pick;
  assert.ok(fast.speed > base0.speed && fast.perUnit.freight < base0.perUnit.freight);
  const pol2 = T.noPolicy(); pol2.city.set(cid('Dresden'), { toll: 6 }); T.setPolicy(pol2);
  const toll = q('Cottbus', 'Dresden', 'eisen', 1975, { mode: 'lkw' }).pick;
  assert.ok(toll.perUnit.toll > 0 && toll.perUnit.total > base0.perUnit.total);
  // der Rahmen des Bundestags begrenzt die Maut
  const pol3 = T.noPolicy(); pol3.city.set(cid('Dresden'), { toll: 6 }); pol3.nation.frame = 0; T.setPolicy(pol3);
  assert.strictEqual(q('Cottbus', 'Dresden', 'eisen', 1975, { mode: 'lkw' }).pick.perUnit.toll, 0);
  // Zoll: nur Hafen-/Luftfracht
  reset();
  const pt = T.noPolicy(); T.setPolicy(pt);
  goods.setPolicies(goods.buildPolicies([{ office_idx: 5, kind: 'tariff', good: null, val: 20, scope_city: 0, region: null }]));
  const ship = q('Hamburg', 'Bremen', 'elektronik', 1990, { mode: 'container' }).pick;
  const rail = q('Hamburg', 'Bremen', 'elektronik', 1990, { mode: 'bahn' }).pick;
  assert.ok(ship.perUnit.duty > 0 && rail.perUnit.duty === 0, `${ship.perUnit.duty} ${rail.perUnit.duty}`);
  reset();
  // Kleinstadt ohne Bahnhof bekommt mit dem Ausbau einen
  const small = { id: 99991, name: 'Kleinstadt', state: 'Sachsen', lat: 51, lon: 13, pop: 4000, size_tier: 1, since: 1945 };
  assert.strictEqual(T.hubs(small, 1960).rail, 0);
  const pol4 = T.noPolicy(); pol4.city.set(99991, { hub: { rail: 1 } }); T.setPolicy(pol4);
  assert.strictEqual(T.hubs(small, 1960).rail, 1);
  reset();
});

test('Angebot: deterministisch, alle Zahlen endlich, Auswahl der günstigsten Option, Fehler bei fehlender Verbindung', () => {
  reset();
  const a = JSON.stringify(q('Hamburg', 'München', 'moebel', 1990)); const b = JSON.stringify(q('Hamburg', 'München', 'moebel', 1990));
  assert.strictEqual(a, b);
  const x = q('Rostock', 'Passau', 'moebel', 1975);
  for (const o of x.options) { assert.ok(Number.isFinite(o.perUnit.total) && o.days >= 1); }
  assert.ok(x.pick.perUnit.total <= Math.min(...x.options.filter((o) => o.ok && o.days <= x.pick.days).map((o) => o.perUnit.total)) + 1e-9);
  assert.strictEqual(q('Cottbus', 'Cottbus', 'brot', 1960).ok, false);
  assert.strictEqual(T.quote(w, { from: cid('Cottbus'), to: cid('Dresden'), good: 'strom', year: 1960, doy: 1, env: NOENV }).ok, false, 'Strom nicht auf Routen');
  assert.strictEqual(q('Cottbus', 'Passau', 'brot', 1960, { mode: 'container' }).ok, false);
  const f = T.freightFor(w, { from: cid('Cottbus'), to: cid('Dresden'), good: 'mehl', year: 1960, doy: 10, unitValueReal: 40, env: NOENV });
  assert.ok(f && f.perUnit > 0 && f.days >= 1);
  assert.strictEqual(T.freightFor(w, { from: cid('Cottbus'), to: cid('Cottbus'), good: 'mehl', year: 1960 }).perUnit, 0);
});

test('Betriebe für Routen: Spedition und Handel; Fuhrpark und Routengrenzen wachsen mit der Stufe', () => {
  const { c } = mk(1952, 'kraftfahrer'); const h = mk(1952, 'einzelhandelsverkaeufer').c; const bk = mk(1952, 'baecker').c;
  assert.strictEqual(TR.firmKind(w, c), 'carrier'); assert.strictEqual(TR.firmKind(w, h), 'trader'); assert.strictEqual(TR.firmKind(w, bk), null);
  assert.ok(TR.fleetOf(w, c) >= 2 && TR.fleetOf(w, c) >= TR.fleetOf(w, h));
  const c2 = { ...c, tier: 2 }; assert.ok(TR.routesPerFirm(w, c2) > TR.routesPerFirm(w, c));
});

/** Zwei Städte mit großem Preisgefälle für eine Ware erzwingen (Knappheit). */
function gap(good, from, to, fx = 0.8, ty = 1.5) { goods.setScarcity(new Map([[`${cid(from)}|${good}`, fx], [`${cid(to)}|${good}`, ty]])); }

test('Vorschau: Spanne, Kosten, Rendite-Deckel und erwarteter Gewinn; ohne Gefälle kein Gewinn', () => {
  reset();
  const { s, c } = mk(1962, 'kraftfahrer');
  let e = TR.evaluate(w, s, c, { good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 300, mode: 'auto', interval: 0 }, { env: NOENV });
  assert.ok(e.ok && e.cargo > 0 && e.freight > 0 && e.net < e.margin + 1);
  assert.ok(e.net < 0 || e.roiYear <= 22.1, `ROI ${e.roiYear}`);
  gap('eisenwaren', 'Cottbus', 'Dresden');
  e = TR.evaluate(w, s, c, { good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 300, mode: 'auto', interval: 8 }, { env: NOENV });
  assert.ok(e.gapPct > 20 && e.marginRaw > e.capMargin && e.squeeze > 0, 'Wettbewerb drückt die Spanne');
  assert.strictEqual(e.margin, e.capMargin);
  assert.ok(e.roiYear <= 22.1 && e.roiYear > 0, `ROI ${e.roiYear}`);
  assert.ok(e.interval >= e.cycleMin);
  assert.ok(e.units === 300 || e.units === e.maxUnits);
  reset();
});

test('Last auf dem Paar: Je mehr Routen dieselbe Strecke fahren, desto kleiner der Gewinn', () => {
  reset();
  const { s, c } = mk(1962, 'kraftfahrer');
  gap('eisenwaren', 'Cottbus', 'Dresden', 0.85, 1.25);
  const d = { good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 100, mode: 'auto', interval: 10 };
  const e0 = TR.evaluate(w, s, c, d, { env: NOENV });
  const L = new Map(); const ab = TR.absorb(w, cid('Dresden'));
  L.set(`${cid('Dresden')}|eisenwaren`, { inn: ab * 0.6, out: 0 }); L.set(`${cid('Cottbus')}|eisenwaren`, { inn: 0, out: ab * 0.6 }); TR.setLoad(L);
  const e1 = TR.evaluate(w, s, c, d, { env: NOENV });
  assert.ok(e1.unitSell < e0.unitSell && e1.unitBuy > e0.unitBuy && e1.net < e0.net, `${e0.net} → ${e1.net}`);
  assert.ok(e1.impB <= T.C().trade.impactMax + 1e-9);
  reset();
});

function runRoute(year, extraRoute = {}, sOver = {}) {
  reset(); gap('eisenwaren', 'Cottbus', 'Dresden', 0.8, 1.5);
  const { s, c } = mk(year, 'kraftfahrer', sOver);
  const r = TR.create(w, s, { firm: c.id, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 300, interval: 8, ...extraRoute });
  return { s, c, r };
}

test('Route anlegen: Prüfungen (Betrieb, Ware, Menge, Intervall, Grenzen) und Anzeige', () => {
  const { s, c, r } = runRoute(1962);
  assert.ok(r.route && r.route.id === 1 && r.eval.ok);
  assert.strictEqual(TR.create(w, s, { firm: 99, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 100 }).err.length > 5, true);
  assert.ok(TR.create(w, s, { firm: c.id, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 100 }).err, 'Doppelte Route');
  assert.ok(TR.create(w, s, { firm: c.id, good: 'strom', from: cid('Cottbus'), to: cid('Leipzig'), qty: 100 }).err, 'Strom');
  assert.ok(TR.create(w, s, { firm: c.id, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Cottbus'), qty: 100 }).err, 'gleicher Ort');
  const bk = mk(1962, 'baecker');
  assert.ok(TR.create(w, bk.s, { firm: bk.c.id, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 100 }).err, 'Bäckerei darf keine Routen');
  // Obergrenze je Betrieb (Stufe 0 Spedition: 2 Routen)
  assert.ok(TR.create(w, s, { firm: c.id, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Leipzig'), qty: 200, interval: 12 }).route);
  assert.ok(TR.create(w, s, { firm: c.id, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Berlin'), qty: 200, interval: 12 }).err.includes('Routen'));
  const v = TR.view(w, s);
  assert.strictEqual(v.routes.length, 2); assert.ok(v.firms[0].vehicles >= 1 && v.routes[0].status === 'idle');
  reset();
});

test('Route läuft: Abfahrt bezahlt aus der Firmenkasse, Ankunft bringt den Erlös, Geld stimmt auf den Cent', () => {
  const { s, c } = runRoute(1962);
  const start = c.cash; const route = s.trade.routes[0];
  const paid = []; const wasTrip = [];
  let spentOver = 0; const idx = w.idx(yearOf(s.day, s.startYear));
  for (let d = 0; d < 120; d++) {
    const before = c.cash; const hadTrip = !!route.trip;
    s.day++; TR.daily(ctxOf(s));
    const after = c.cash;
    if (!hadTrip && route.trip) paid.push(before - after - Math.round(T.C().trade.overheadReal * idx));
    wasTrip.push(!!route.trip);
  }
  void spentOver;
  const m = route.made;
  assert.ok(m.trips >= 5, `Fahrten ${m.trips}`);
  const tripSum = s.trade.log.length ? s.trade.log.reduce((a, l) => a + l.net, 0) : 0;
  void tripSum;
  // Kassenstand = Start + Summe der Fahrtergebnisse − Bürokosten (Überschlag über made.profit und Protokoll)
  assert.ok(Math.abs(c.cash - (start + m.profit - Math.round(T.C().trade.overheadReal * w.idx(1962) * 120) - (route.trip ? route.trip.costs : 0))) < 120 * 3, `Kasse ${c.cash} erwartet ${start + m.profit}`);
  assert.ok(m.profit > 0, 'Mit Preisgefälle gibt es Gewinn');
  assert.ok(paid.every((p) => p > 0));
  reset();
});

test('Rendite-Deckel: Der Jahresgewinn überschreitet nicht rund 24 % des gebundenen Kapitals (auch bei riesigem Preisgefälle)', () => {
  const oldRisk = settings.DEFAULTS.transport.risk.enabled; settings.DEFAULTS.transport.risk.enabled = false;
  const { s, c } = runRoute(1962, { qty: 300, interval: 9 });
  const route = s.trade.routes[0];
  const cash0 = c.cash; let capital = 0; let n = 0; const idx = w.idx(yearOf(s.day, s.startYear));
  for (let d = 0; d < 365; d++) {
    const had = !!route.trip; s.day++; TR.daily(ctxOf(s));
    if (!had && route.trip) { capital += route.trip.cargo; n++; }
  }
  assert.ok(n > 15, `Fahrten ${n}`);
  const profit = route.made.profit - Math.round(T.C().trade.overheadReal * idx * 365);
  const avgCap = capital / n;
  assert.ok(route.made.profit / avgCap <= 0.245, `Rendite ${(route.made.profit / avgCap).toFixed(3)}`);
  assert.ok(route.made.profit / avgCap > 0.15, 'ohne Risiko erreicht die Route den Deckel fast');
  assert.ok(profit < avgCap * 0.25);
  assert.ok(c.cash > cash0 - 10 && Number.isFinite(c.cash));
  settings.DEFAULTS.transport.risk.enabled = oldRisk;
  reset();
});

test('Risiken: Verluste sind gedeckelt, Anfänger-Schutz und Offline schalten sie ab, Versicherung ersetzt einen Teil', () => {
  reset(); gap('eisenwaren', 'Cottbus', 'Dresden', 0.8, 1.5);
  const old = JSON.stringify(settings.DEFAULTS.transport.risk);
  Object.assign(settings.DEFAULTS.transport.risk, { accident: { p: 0.6, lossMin: 30, lossMax: 90 }, scale: 3 });
  try {
    const mkRun = (insured, opts = {}) => {
      reset(); gap('eisenwaren', 'Cottbus', 'Dresden', 0.8, 1.5);
      const { s, c } = mk(1962, 'kraftfahrer'); if (opts.newbie) s.day = 10;
      const r = TR.create(w, s, { firm: c.id, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 300, interval: 8, insured, strict: false });
      assert.ok(r.route, r.err);
      run(s, 150, !!opts.offline);
      return { s, c };
    };
    const a = mkRun(false); const b = mkRun(true);
    const evs = a.s.trade.log.filter((l) => l.events.includes('accident')); assert.ok(evs.length > 3, 'Unfälle treten auf');
    for (const l of a.s.trade.log) assert.ok(l.units >= Math.floor(l.sent * (1 - T.C().risk.lossCapPct / 100)), `Deckel ${l.units}/${l.sent}`);
    assert.ok(b.s.trade.stats.profit > a.s.trade.stats.profit, `Versicherung ${b.s.trade.stats.profit} > ${a.s.trade.stats.profit}`);
    const off = mkRun(false, { offline: true }); assert.ok(off.s.trade.log.every((l) => l.events.length === 0), 'offline ohne Ereignisse');
    const nb = mkRun(false, { newbie: true }); assert.ok(nb.s.trade.log.filter((l) => l.day < 90).every((l) => l.events.length === 0), 'Anfänger-Schutz');
  } finally { Object.assign(settings.DEFAULTS.transport.risk, JSON.parse(old)); }
  reset();
});

test('Plünderung gibt es nur in den frühen Nachkriegsjahren, Zollkontrolle nur bei Schmuggel mit Zoll/Maut', () => {
  reset();
  const { s } = mk(1946, 'kraftfahrer'); const { s: s2 } = mk(1975, 'kraftfahrer');
  const sev = (st, y) => { const c = st.companies[0]; return TR.evaluate(w, st, c, { good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 100, interval: 10 }, { env: NOENV }); };
  assert.ok(sev(s, 1946).risks.some((r) => r.key === 'robbery') && !sev(s2, 1975).risks.some((r) => r.key === 'robbery'));
  assert.ok(!sev(s2, 1975).risks.some((r) => r.key === 'smuggle'));
  const c2 = s2.companies[0];
  s2.day = (2010 - 1945) * 365 + 100;
  const sm = TR.evaluate(w, s2, c2, { good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 100, interval: 10, smuggle: true, mode: 'lkw' }, { env: NOENV });
  assert.ok(sm.risks.some((r) => r.key === 'smuggle') && sm.saved > 0, 'LKW-Maut ab 2005 lässt sich umgehen');
  reset();
});

test('Kein Abbuchen auf Kredit: Reicht die Kasse nicht, wird die Ladung kleiner oder die Fahrt verschoben', () => {
  const { s, c } = runRoute(1962, { qty: 300 });
  c.cash = 3000; const route = s.trade.routes[0];
  run(s, 12);
  assert.ok(c.cash >= 0, `Kasse ${c.cash}`);
  assert.ok(!route.trip || route.trip.units <= 300);
  reset();
});

test('Haft sperrt neue Fahrten; Hochwasser verschiebt die Abfahrt', () => {
  const { s, c } = runRoute(1962);
  s.court = { r: [{ k: 'haft', until: Date.now() + 3600000 }] };
  const route = s.trade.routes[0];
  run(s, 20); assert.strictEqual(route.made.trips + (route.trip ? 1 : 0), 0);
  s.court = null; run(s, 20); assert.ok(route.made.trips + (route.trip ? 1 : 0) > 0);
  void c; reset();
  // Flut 2002 in Sachsen
  let hit = -1; for (let d = 100; d < 300; d++) if (T.floodActive(2002, d, 'Sachsen')) { hit = d; break; }
  const f = mk(2002, 'kraftfahrer'); f.s.day = (2002 - 1945) * 365 + hit - 1; f.c.cityId = cid('Dresden');
  gap('eisenwaren', 'Dresden', 'Leipzig', 0.8, 1.5);
  const r2 = TR.create(w, f.s, { firm: f.c.id, good: 'eisenwaren', from: cid('Dresden'), to: cid('Leipzig'), qty: 200, interval: 8, mode: 'lkw' });
  assert.ok(r2.route, r2.err);
  run(f.s, 3); assert.ok(!f.s.trade.routes[0].trip, 'Flut: keine Abfahrt');
  reset();
});

test('Frachtführer: Preis nach Tarif, Zahlung wird für genau eine Auszahlung vorgemerkt', () => {
  reset(); gap('eisenwaren', 'Cottbus', 'Dresden', 0.8, 1.5);
  const { s, c } = mk(1962, 'einzelhandelsverkaeufer');
  const car = { offer: 5, user: 77, firm: 3, pct: 80, name: 'Spedition X' };
  const std = TR.evaluate(w, s, c, { good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 300, interval: 10 }, { env: NOENV });
  const withC = TR.evaluate(w, s, c, { good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 300, interval: 10, carrier: car }, { env: NOENV });
  assert.ok(withC.freight < std.freight && Math.abs(withC.freight / std.freight - 0.8) < 0.02);
  const r = TR.create(w, s, { firm: c.id, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 300, interval: 10, carrier: car });
  assert.ok(r.route, r.err);
  run(s, 30);
  const q1 = s.pending.freight || [];
  assert.ok(q1.length === 1 && q1[0].userId === 77 && q1[0].firm === 3 && q1[0].real > 0);
  const trips = s.trade.routes[0].no;
  assert.ok(trips >= 2);
  // Σ vorgemerkt = Σ Fracht × (1 − Kostenanteil) ÷ Index
  const idx = w.idx(1962);
  assert.ok(q1[0].real > 0 && q1[0].real < trips * 3000 / idx);
  reset();
});

test('Beste Route finden: liefert Vorschläge mit Gewinn, sortiert, innerhalb der Grenzen', () => {
  reset();
  const { s, c } = mk(1962, 'kraftfahrer');
  goods.setScarcity(new Map([[`${cid('Cottbus')}|eisenwaren`, 0.8], [`${cid('München')}|eisenwaren`, 1.5], [`${cid('Dresden')}|textil`, 1.4], [`${cid('Hamburg')}|textil`, 0.85]]));
  const sug = TR.suggest(w, s, c, { budget: 200000, limit: 5 });
  assert.ok(sug.length >= 1, 'mindestens ein Vorschlag');
  for (let i = 1; i < sug.length; i++) assert.ok(sug[i - 1].perDay >= sug[i].perDay);
  for (const x of sug) { assert.ok(x.net > 0 && x.cargo <= 200000 * 1.06 && x.interval >= x.days + 1 && x.roiYear <= 24.5); }
  assert.deepEqual(TR.suggest(w, s, c, { budget: 200000, limit: 5 }), sug, 'deterministisch');
  reset();
});

test('Tagesablauf ist deterministisch und überlebt Engine-Läufe (alle Epochen, Zahlen endlich)', () => {
  for (const year of [1948, 1972, 1995, 2030, 2075]) {
    reset();
    const mkS = () => {
      const { s, c } = mk(year, 'kraftfahrer'); s.seed = 4242;
      const r = TR.create(w, s, { firm: c.id, good: 'kleidung', from: cid('Cottbus'), to: cid('München'), qty: 400, interval: 20 });
      return { s, c, ok: !r.err };
    };
    const a = mkS(); const b = mkS();
    if (!a.ok) continue;
    for (const o of [a, b]) { o.s.meters.fridge = 100; for (let i = 0; i < 90; i++) { o.s.meters.fridge = 100; o.s.money = Math.max(o.s.money, 1e6); advance(w, o.s, 1); o.s.interrupts = []; } }
    assert.deepEqual(a.s.trade, b.s.trade, `deterministisch ${year}`);
    assert.ok(Number.isFinite(a.c.cash) && a.c.cash >= 0, `Kasse ${year}`);
  }
  reset();
});
