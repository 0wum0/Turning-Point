'use strict';
/**
 * Wirtschaftsbalance-Simulation (ohne Datenbank, deterministisch).
 * Spielt Archetypen über viele Spieljahre ab 1945 und druckt je Jahrzehnt Geld / Vermögen in Werten von 1945
 * sowie die Flüsse (Lohn, Miete, Steuer, Kredit, Betrieb).
 *
 *   node tools/econ-sim.js [--years 85] [--seed 7] [--only employee,landlord,owner,mixed] [--json]
 */
const { testWorld, input } = require('../test/helpers');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const { edition } = require('../src/game/newspaper');
const core = require('../src/game/core');
const credit = require('../src/game/credit');
const biz = require('../src/game/business');
const landlord = require('../src/game/landlord');
const competition = require('../src/game/competition');
const { yearOf } = require('../src/game/calendar');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const YEARS = Number(arg('years', 85));
const SEED = Number(arg('seed', 7));
const ONLY = String(arg('only', 'employee,landlord0,landlord,owner,mixed')).split(',');
const JSON_OUT = argv.includes('--json');

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const w = testWorld();
const user = () => ({ meta: {}, coins: 100000, efs_pool: 0 });

/** Der Spieler konkurriert mit seinen eigenen Betrieben (im Spiel kommt das Angebot aus player_firms). */
function supply(s) {
  const m = new Map();
  for (const c of s.companies) { if (c.abandoned) continue; const k = `${c.cityId}|${c.pkey}`; const e = m.get(k) || { city_id: c.cityId, pkey: c.pkey, rooms: 0, firms: 0 }; e.rooms += c.rooms; e.firms++; m.set(k, e); }
  competition.setSupply([...m.values()]);
}

function makeRun(name, pkey, policy) {
  Math.random = mulberry(SEED * 1000 + name.length * 17 + pkey.length);
  const s = createCharacter(w, input(w, { professionKey: pkey }), user());
  s.life.baseYears = 900; s.life.rare = false;
  const act = (n, i) => { try { const m0 = s.money; const rr = actions.run(n, { world: w, state: s, input: i, user: user(), now: Date.now() }); if (process.env.TRACE2 && ['buy', 'maintain', 'repair', 'sell', 'loanTake'].includes(n)) console.log('ACT', n, yearOf(s.day, s.startYear), Math.round((s.money - m0) / w.idx(yearOf(s.day, s.startYear)) / 100)); return rr; } catch (e) { if (process.env.DBG) console.log('ACT FAIL', n, e.message); return null; } };
  const dec = [];
  const acc = { wage: 0, rent: 0, tax: 0, loan: 0, bizProfit: 0, bizTax: 0, bizWages: 0, bizInputs: 0, upkeep: 0, spent: 0 };
  const year0 = yearOf(s.day, s.startYear);
  let lastDecade = -1; const rows = [];
  let bad = null;
  const startDay = s.day;
  const maxDays = YEARS * 365;
  const snap = (year) => {
    const idx = w.idx(year);
    const props = s.properties.reduce((a, p) => a + core.propertyValue(w, s, p, year), 0);
    const firms = (s.companies || []).reduce((a, c) => a + biz.companyValue(w, s, c, year) + c.cash, 0);
    const debt = credit.debt(s);
    return { year, money: s.money / idx / 100, props: props / idx / 100, firms: firms / idx / 100, debt: debt / idx / 100, net: core.netWorth(w, s) / idx / 100, nProps: s.properties.length, nFirms: s.companies.length };
  };
  const flush = (year) => {
    const idx = w.idx(year);
    const r = snap(year);
    const f = {}; for (const k of Object.keys(acc)) f[k] = acc[k] / idx / 100 / Math.max(1, (acc.days || 1)) * 365; // grob: Jahreswert in 1945-DM
    rows.push({ ...r, ...Object.fromEntries(Object.entries(acc).filter(([k]) => k !== 'days').map(([k, v]) => [k, v / (acc.idxSum || 1) / 100 * 365 / Math.max(1, acc.days)])) });
    for (const k of Object.keys(acc)) acc[k] = 0; acc.days = 0; acc.idxSum = 0;
  };
  acc.days = 0; acc.idxSum = 0;
  for (let d = 0; d < maxDays && s.status === 'alive'; d++) {
    const year = yearOf(s.day, s.startYear); const idx = w.idx(year);
    if (d % 14 === 0) { policy({ s, act, year, idx, w, edition }); supply(s); }
    s.meters.fridge = 100; s.meters.rest = Math.max(s.meters.rest, 60); s.meters.health = Math.max(s.meters.health, 80);
    const f = core.dailyFlows(w, s);
    const m0 = s.money;
    const cash0 = (s.companies || []).reduce((a, c) => a + c.cash, 0);
    advance(w, s, 1); s.interrupts = [];
    // Flüsse (aufgelaufen laut dailyFlows) in Cent heutiger Preise → durch idx später normiert
    acc.wage += f.inc.wage; acc.rent += f.inc.rent; acc.tax += f.exp.tax; acc.loan += f.exp.loan; acc.upkeep += f.exp.upkeep;
    for (const c of s.companies || []) if (!c.abandoned) { const cf = biz.companyFlows(w, s, c, year); acc.bizProfit += cf.profit; acc.bizTax += cf.tax; acc.bizWages += cf.wages; acc.bizInputs += cf.inputs || 0; }
    acc.spent += 0; acc.days++; acc.idxSum += idx / acc.days * acc.days; // idxSum approximiert unten
    acc.idxSum = (acc.idxSum); 
    if (process.env.TRACE && d % 365 === 364) console.log('TRACE', name, year, 'money', Math.round(s.money / idx / 100), 'props', s.properties.map((p) => Math.round(core.propertyValue(w, s, p, year) / idx / 100) + '@' + Math.round(p.condition) + (p.lease && p.lease.tenant ? 'T' : '-')).join(','), 'earned', Math.round(s.stats.earned / idx / 100), 'spent', Math.round(s.stats.spent / idx / 100));
    const dec10 = Math.floor((year - year0) / 10);
    if (dec10 !== lastDecade && (year - year0) % 10 === 0 && d > 0) { lastDecade = dec10; flushRow(); }
    function flushRow() {
      const r = snap(year);
      const days = acc.days || 1;
      const norm = (v) => v / idx / 100 / days * 365;
      rows.push({ ...r, wage: norm(acc.wage), rent: norm(acc.rent), tax: norm(acc.tax), loan: norm(acc.loan), upkeep: norm(acc.upkeep), bizProfit: norm(acc.bizProfit), bizTax: norm(acc.bizTax), bizWages: norm(acc.bizWages), bizInputs: norm(acc.bizInputs) });
      for (const k of Object.keys(acc)) acc[k] = 0; acc.days = 0; acc.idxSum = 0;
    }
  }
  const year = yearOf(s.day, s.startYear);
  rows.push({ ...snap(year), final: true, status: s.status, reason: s.death && s.death.reason });
  return { name, rows, state: s };
}

/* ---------- Politik der Archetypen ---------- */
function ensureHome(c) {
  const { s, act, w: W, edition: ed } = c;
  if (s.housing.type === 'own' || (s.housing.type === 'rent' && (s.housing.rooms || 1) >= 1)) return;
  const E = ed(W, s, s.cityId);
  const r = E.housing.rent.slice().sort((a, b) => a.perDay - b.perDay)[0];
  if (r && s.money > r.perDay * 20) act('rent', { listingId: r.id });
  else { const p = E.housing.pension.slice().sort((a, b) => a.perDay - b.perDay)[0]; if (p && s.money > p.perDay * 5) act('rent', { listingId: p.id }); }
}
function ensureJob(c) {
  const { s, act, w: W, edition: ed } = c;
  if (s.occupation) return;
  const E = ed(W, s, s.cityId);
  const j = E.jobs.filter((x) => x.kind === 'work' && x.pkey !== 'helfer').sort((a, b) => b.wage - a.wage)[0] || E.jobs[0];
  if (j) act('apply', { listingId: j.id });
}
function tend(c) {
  const { s, act } = c;
  if (s.properties.length && !s.insurance.gebaeude) act('insurance', { key: 'gebaeude', on: true });
  for (const q of s.properties) {
    if (q.closedUntil - s.day > 10) act('repair', { propertyId: q.id });
    if (!(q.lease && q.lease.on) && !(s.housing.type === 'own' && s.housing.propertyId === q.id)) act('letOn', { propertyId: q.id, mult: 1 });
    if (q.condition < 70) act('maintain', { propertyId: q.id });
  }
}
function buyLet(c, { loans, maxProps }) {
  const { s, act, w: W, edition: ed, idx } = c;
  tend(c);
  if (s.properties.length >= maxProps) return;
  const E = ed(W, s, s.cityId);
  const sale = (E.housing.sale || []).filter((x) => x.condition >= 75).sort((a, b) => (b.rentPerDay || 0) / b.price - (a.rentPerDay || 0) / a.price)[0];
  if (!sale) return;
  const reserve = 365 * credit.dailyPay(s) + 120 * idx * 200; // Rücklage: ein Jahr Kreditraten
  const free = s.money - reserve;
  if (free >= sale.price) { act('buy', { listingId: sale.id }); }
  else if (loans) {
    const v = credit.view(W, s);
    const need = sale.price - free;
    const f = core.dailyFlows(W, s);
    const newPay = need * (v.rate / 100 / 365) / (1 - Math.pow(1 + v.rate / 100 / 365, -20 * 365));
    if (need <= v.available && need >= v.minAmount && f.net + credit.dailyPay(s) - newPay > 0 && free > 0) {
      const r = act('loanTake', { amount: need, years: 20 });
      if (r) act('buy', { listingId: sale.id });
    }
  }
  tend(c);
}
function earlyRepay(c) {
  const { s, act } = c;
  for (const l of s.loans || []) if (s.money > l.left * 1.5 + 100000) act('loanRepay', { id: l.id, all: true });
}
function runBiz(c, { maxFirms }) {
  const { s, act, w: W, edition: ed, idx, year } = c;
  const E = ed(W, s, s.cityId);
  if (s.companies.length < maxFirms) {
    const b = (E.biz || []).filter((x) => x.qualified && s.money > x.price * 1.12).sort((a, d) => d.price - a.price)[0];
    if (b) act('buyBiz', { listingId: b.id });
  }
  for (const co of s.companies) {
    if (co.abandoned) { act('bizReactivate', { id: co.id }); continue; }
    const need = biz.staffNeeded(W, co);
    if (co.staff < need && s.money > 40 * 500 * idx) act('bizHire', { id: co.id, delta: 1 });
    if (!co.manager && s.money > 60 * 600 * idx) act('bizManager', { id: co.id, on: true });
    if (co.cash > 20 * 500 * idx) act('bizCollect', { id: co.id });
    // Ausbau: Räume, dann Stufe
    const t = biz.tiersOf(W)[co.tier];
    if (co.rooms < t.maxRooms && s.money > t.roomPrice * idx * 2.5 && co.lastProfit > 0) act('bizExpand', { id: co.id });
    if (co.tier < 2 && s.money > (biz.tiersOf(W)[co.tier + 1].price) * idx * 2) act('bizUpgrade', { id: co.id });
  }
  if (s.companies.length && !s.occupation) act('bizWork', { id: s.companies[0].id });
}

const POLICIES = {
  employee: { pkey: 'baecker', fn: (c) => { ensureHome(c); ensureJob(c); } },
  landlord0: { pkey: 'baecker', fn: (c) => { ensureHome(c); ensureJob(c); buyLet(c, { loans: false, maxProps: 12 }); } },
  landlord: { pkey: 'baecker', fn: (c) => { ensureHome(c); ensureJob(c); earlyRepay(c); buyLet(c, { loans: true, maxProps: 12 }); } },
  owner: { pkey: 'wirt', fn: (c) => { ensureHome(c); if (!c.s.companies.length) ensureJob(c); runBiz(c, { maxFirms: 3 }); } },
  mixed: { pkey: 'wirt', fn: (c) => { ensureHome(c); if (!c.s.companies.length) ensureJob(c); runBiz(c, { maxFirms: 2 }); earlyRepay(c); buyLet(c, { loans: true, maxProps: 6 }); } },
};


/* ---------- Statische Kennzahlen (ohne Spielverlauf) ---------- */
function staticTables() {
  const { realEstateFactor } = require('../src/game/economy');
  const city = w.cityList.find((c) => c.slug === 'braunschweig') || w.cityList[0];
  console.log('=== Statisch: Immobilien- und Kreditkennzahlen (Zustand 85 %, mittlere Auslastung) ===');
  console.log(['Jahr', 'Zins%', 'Infl%/a', 'brutto Wohnung', 'kl. Haus', 'gr. Haus', 'Villa', 'netto Whg*'].map((x) => x.padStart(14)).join(''));
  for (const y of [1950, 1960, 1970, 1980, 1990, 2010, 2030, 2060, 2090]) {
    const infl = (Math.pow(w.idx(y + 5) / w.idx(y), 1 / 5) - 1) * 100;
    const row = ['flat', 'house_small', 'house_large', 'villa'].map((k) => {
      const price = (0.2 + 0.8 * 0.85) * realEstateFactor(y);
      const rent = landlord.marketBase({ base: 1e8, kind: k, condition: 85 }) * 365 / 1e8 * landlord.cycleRent(y);
      return rent / price * 100;
    });
    // netto: 5 % Leerstand/Ausfall, Unterhalt 1,2 % des Werts, 15 % Steuer auf Miete
    const net = (row[0] * 0.95 - w.econ.upkeepYearPct) * 0.85;
    console.log([y, credit.rateFor(y, 0.5).toFixed(1), infl.toFixed(1), ...row.map((v) => v.toFixed(1) + ' %'), net.toFixed(1) + ' %'].map((x) => String(x).padStart(14)).join(''));
  }
  console.log('  * netto = (brutto*0,95 - Unterhalt) * 0,85; Gesamtrendite einer Immobilie = netto + Teuerung + realer Preistrend.');
  console.log('\n=== Statisch: Betriebe 1960, Tagesgewinn in DM von 1945 (Braunschweig), Spieler arbeitet selbst ===');
  const s = createCharacter(w, input(w, { professionKey: 'wirt' }), user()); s.day = 15 * 365; s.skills.days.wirt = 4000;
  const year = yearOf(s.day, s.startYear); const idx = w.idx(year);
  console.log(['Stufe', 'Räume', 'Personal', 'Manager', 'Umsatz', 'Löhne', 'Unterhalt', 'Steuer', 'Gewinn', 'Jahr', 'Kaufpreis', 'Rendite'].map((x) => x.padStart(11)).join(''));
  const tiers = biz.tiersOf(w);
  for (let t = 0; t < tiers.length; t++) {
    for (const rooms of [tiers[t].rooms, tiers[t].maxRooms]) for (const mode of ['allein', 'Personal', 'Pers.+Mgr']) {
      const c = { id: 1, pkey: 'wirt', tier: t, cityId: city.id, rooms, staff: 0, manager: false, cash: 0, base: Math.round(tiers[t].price * city.price_factor), abandoned: null };
      const need = biz.staffNeeded(w, c);
      if (mode === 'allein') s.occupation = { kind: 'work', pkey: 'wirt', ownCompanyId: 1 }; else s.occupation = null;
      if (mode !== 'allein') c.staff = need; if (mode === 'Pers.+Mgr') c.manager = true;
      const f = biz.companyFlows(w, s, c, year);
      const price = c.base + (rooms - tiers[t].rooms) * tiers[t].roomPrice * city.price_factor;
      const per = (v) => (v / idx / 100).toFixed(1);
      console.log([t, rooms, mode === 'allein' ? '0 (Chef)' : need, c.manager ? 'ja' : 'nein', per(f.income), per(f.wages), per(f.upkeep), per(f.tax), per(f.profit), per(f.profit * 365), Math.round(price / 100), (f.profit * 365 / idx / 100 / (price / 100) * 100).toFixed(1) + ' %'].map((x) => String(x).padStart(11)).join(''));
    }
  }
}

/** Warenkreislauf: Gewinn normal besetzter Betriebe (Personal + Manager) je Epoche, mit Warenwirtschaft (automatischer Großhandelseinkauf) und ohne. */
function goodsTable() {
  const seed = require('../src/db/seed-data'); const { buildWorld } = require('../src/game/world'); const goods = require('../src/game/goods'); const settings = require('../src/settings');
  const extra = seed.ERA_PROFESSIONS.map((p, i) => ({ id: 1000 + i, pkey: p[0], name: p[1], category: p[2], icon: p[3], era_from: p[4], era_to: p[5], base_wage: p[6], training_days: p[7], tuition_day: p[8], academic: p[9], replaces: p[10], lodging: p[11], unlocks: p[12], description: p[13], active: 1 }));
  const W2 = buildWorld(w.cityList, [...w.professions.values(), ...extra]);
  const s = createCharacter(W2, input(W2, { professionKey: 'baecker' }), user()); s.contracts = { buys: [], sells: [] };
  const cities = ['braunschweig', 'muenchen', 'cottbus'].map((k) => W2.cityList.find((c) => c.slug === k)).filter(Boolean);
  console.log('\n=== Warenkreislauf: normal besetzte Betriebe (Personal + Manager, Stufe 1-3, 3 Städte), Tagesgewinn in DM von 1945, Großhandelseinkauf ===');
  console.log(['Epoche', 'Betriebe', 'Umsatz', 'Wareneinsatz', 'Gewinn alt', 'Gewinn neu', 'Anteil Verlust'].map((x) => x.padStart(14)).join(''));
  for (const year of [1950, 1965, 1980, 1995, 2010, 2030, 2050, 2070, 2090]) {
    s.day = (year - 1945) * 365; const idx = W2.idx(year);
    let n = 0; let inc = 0; let inp = 0; let p0 = 0; let p1 = 0; let loss = 0;
    for (const p of W2.professions.values()) {
      if (!p.unlocks || year < p.era_from || year > p.era_to) continue;
      for (const city of cities) for (let tier = 0; tier < 3; tier++) {
        const t = biz.tiersOf(W2)[tier];
        const c = { id: 1, pkey: p.pkey, tier, cityId: city.id, rooms: t.rooms, staff: 0, manager: true, cash: 0, base: 1, abandoned: null }; c.staff = biz.staffNeeded(W2, c);
        const on = biz.companyFlows(W2, s, c, year);
        settings.DEFAULTS.goods.enabled = false; const off = biz.companyFlows(W2, s, c, year); settings.DEFAULTS.goods.enabled = true;
        n++; inc += on.income; inp += on.inputs; p0 += off.profit; p1 += on.profit; if (on.profit < 0) loss++;
      }
    }
    const per = (v) => (v / n / idx / 100).toFixed(1);
    console.log([year, n, per(inc), per(inp), per(p0), per(p1), (loss / n * 100).toFixed(1) + ' %'].map((x) => String(x).padStart(14)).join(''));
  }
}

const f0 = (v) => (v == null ? '' : Math.round(v).toLocaleString('de-DE'));
const out = [];
if (!JSON_OUT && !argv.includes('--no-static')) staticTables();
if (!JSON_OUT && (argv.includes('--goods') || !argv.includes('--no-static'))) goodsTable();
for (const name of ONLY) {
  const P = POLICIES[name]; if (!P) continue;
  const res = makeRun(name, P.pkey, P.fn);
  out.push(res);
  if (JSON_OUT) continue;
  console.log(`\n=== ${name} (${P.pkey}) – Werte in DM von 1945 (Preisindex bereinigt); Flüsse = Jahreswerte im Schnitt des Jahrzehnts ===`);
  console.log(['Jahr', 'Geld', 'Immo', 'Firmen', 'Schuld', 'Netto', 'Immos', 'Firmen#', 'Lohn', 'Miete', 'Steuer', 'Kreditrate', 'Betr.Gewinn', 'Betr.Lohn', 'Waren'].map((x) => x.padStart(10)).join(''));
  for (const r of res.rows) {
    if (r.final) { console.log(`Ende ${r.year}: ${r.status}${r.reason ? ' (' + r.reason + ')' : ''}  Netto ${f0(r.net)}`); continue; }
    console.log([r.year, f0(r.money), f0(r.props), f0(r.firms), f0(r.debt), f0(r.net), r.nProps, r.nFirms, f0(r.wage), f0(r.rent), f0(r.tax), f0(r.loan), f0(r.bizProfit), f0(r.bizWages), f0(r.bizInputs)].map((x) => String(x).padStart(10)).join(''));
  }
}
if (JSON_OUT) console.log(JSON.stringify(out.map((o) => ({ name: o.name, rows: o.rows })), null, 1));
