'use strict';
/**
 * Handelsrouten (rein, im Spielstand): Ein Betrieb mit Handels- oder Transportbezug kauft Ware G in Stadt A, schickt sie nach Stadt B und verkauft sie dort –
 * automatisch alle `interval` Spieltage. Alles läuft im Spielstand des Besitzers (offline sicher, nichts bleibt hängen):
 *   Abfahrt: Ware, Fracht, Gebühren und Versicherung werden aus der Firmenkasse bezahlt.  Ankunft: der Erlös geht in die Firmenkasse.
 * Preise aus goods.js (Marktpreis je Stadt: Knappheit, Zoll, Ernte, Stadtindex), Transport aus transport.js. Der Gewinn je Fahrt ist durch eine
 * Jahresrendite-Obergrenze auf das gebundene Kapital gedeckelt (Wettbewerb gleicht Preisunterschiede aus) und schrumpft mit der Last auf dem Paar.
 * Zufall (Unfall, Plünderung, Schlagloch, Wetter, Zoll, Streik, Quarantäne) ist deterministisch je Route und Fahrt und durch Deckel begrenzt.
 */
const settings = require('../settings');
const { rngFor } = require('./rng');
const { dateOf, yearOf } = require('./calendar');
const { notice } = require('./core');
const rep = require('./reputation');
const T = require('./transport');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ Betriebe, Flotte, Grenzen ------------------------------------------------------------------ */
/** Betrieb darf Routen betreiben: Transport-/Logistikbetriebe (Spedition) und Handelsbetriebe (Laden, Kohlenhandel, Onlinehandel, Apotheke). */
function firmKind(world, c) {
  if (!c || c.abandoned) return null;
  const goods = require('./goods'); const r = goods.recipeFor(world, c.pkey);
  if (r.out.some(([g]) => g === 'transport')) return 'carrier';
  if (r.out.some(([g]) => g === 'ladenverkauf')) return 'trader';
  return null;
}
const isCarrierFirm = (world, c) => firmKind(world, c) === 'carrier';
/** Fahrzeuge (Ladeplätze) eines Betriebs. */
function fleetOf(world, c) {
  const tr = T.C().trade; const per = firmKind(world, c) === 'carrier' ? num(tr.roomsPerVehicleCarrier, 3, 1, 100) : num(tr.roomsPerVehicleOther, 6, 1, 100);
  return 1 + Math.floor((Number(c.rooms) || 0) / per);
}
/** Wie viele Routen darf ein Betrieb haben (nach Stufe) und der Spieler insgesamt. */
const routesPerFirm = (world, c) => 1 + (Number(c.tier) || 0) * num(T.C().trade.extraRoutePerTier, 1, 0, 5) + (firmKind(world, c) === 'carrier' ? 1 : 0);
const maxRoutesTotal = () => Math.floor(num(T.C().trade.maxRoutesTotal, 6, 1, 50));
const tradeFirms = (world, state) => (state.companies || []).filter((c) => firmKind(world, c));

function ensure(state) {
  if (!state.trade || typeof state.trade !== 'object') state.trade = {};
  const t = state.trade;
  if (!Array.isArray(t.routes)) t.routes = [];
  if (!Number.isInteger(t.nextId)) t.nextId = 1;
  if (!Array.isArray(t.log)) t.log = [];
  if (!t.stats || typeof t.stats !== 'object') t.stats = { trips: 0, profit: 0, lost: 0 };
  return t;
}

/* ------------------------------------------------------------------ Last auf den Paaren (Zwischenspeicher aus der Datenbank) ------------------------------------------------------------------ */
let LOAD = new Map(); // `${Stadt}|${Ware}` → { inn, out } (Wert 1945 je Tag)
function setLoad(map) { LOAD = map instanceof Map ? map : new Map(); }
const getLoad = () => LOAD;
const loadAt = (city, good) => LOAD.get(`${city}|${good}`) || { inn: 0, out: 0 };
/** Aufnahmefähigkeit der Stadt für eine Ware (Wert 1945 je Tag): Grundlast der Stadt × Anteil. */
function absorb(world, cityId) {
  const ce = require('./cityecon');
  return Math.max(50, ce.capOf(world, cityId) * 420 * 1.5 * num(T.C().trade.absorbShare, 0.5, 0.01, 10));
}

/* ------------------------------------------------------------------ Risiken ------------------------------------------------------------------ */
const RISK_NAME = {
  accident: 'Unfall', robbery: 'Plünderung', pothole: 'Schlagloch und Panne', weather: 'Schnee und Unwetter', customs: 'Zollkontrolle', strike: 'Streik im Verkehr', quarantine: 'Quarantäne', smuggle: 'Zoll umgangen – erwischt',
};
function protectedNow(state) { return state.day < num(settings.get('game.newbie_protect_days'), 90, 0, 1e6); }

/** Risiken einer Fahrt als Liste { key, name, p, lossMin, lossMax (Anteil der Ladung), delayMin, delayMax }. Rein, begrenzt. */
function riskList(world, state, mode, q, year, smuggle) {
  const k = T.C().risk; if (k.enabled === false) return [];
  const sc = num(k.scale, 1, 0, 3);
  if (sc <= 0) return [];
  const m = T.modeByKey(mode.key) || {}; const mr = num(m.risk, 1, 0, 5);
  const win = q.env ? q.env.winter : 0; const lock = q.env ? q.env.lock : 0;
  const out = [];
  const add = (key, p, lossMin, lossMax, delayMin, delayMax, extra) => { p = clamp(p * sc, 0, 0.6); if (p > 0.0005) out.push({ key, name: RISK_NAME[key], p: Math.round(p * 10000) / 10000, lossMin: lossMin / 100, lossMax: lossMax / 100, delayMin: delayMin || 0, delayMax: delayMax || 0, ...extra }); };
  const dist = clamp(mode.km / 300, 0.5, 2);
  add('accident', num(k.accident.p, 0.04) * mr * (1 + 0.5 * win) * dist, num(k.accident.lossMin, 8), num(k.accident.lossMax, 30));
  const rb = k.robbery;
  if (year >= num(rb.fromYear, 1945) && year <= num(rb.toYear, 1955)) {
    const f = 1 - (year - num(rb.fromYear, 1945)) / Math.max(1, num(rb.toYear, 1955) - num(rb.fromYear, 1945) + 1);
    add('robbery', num(rb.p, 0.14) * clamp(f, 0, 1) * (m.net === 'rail' ? 0.5 : 1) * dist, num(rb.lossMin, 25), num(rb.lossMax, 60));
  }
  if ((m.key === 'fuhrwerk' || m.key === 'lkw') && year <= num(k.pothole.toYear, 1975)) {
    const f = 1 - (year - 1945) / Math.max(1, num(k.pothole.toYear, 1975) - 1945 + 1);
    add('pothole', num(k.pothole.p, 0.1) * clamp(f, 0.15, 1), 0, 0, 1, num(k.pothole.delayMax, 3));
  }
  if (win > 0.15 && (m.net === 'road' || m.net === 'rail')) add('weather', num(k.weather.p, 0.25) * win, 0, 0, 1, num(k.weather.delayMax, 4));
  if (m.net === 'port' || m.net === 'air') add('customs', num(k.customs.p, 0.05), 0, 0, num(k.customs.delay, 1), num(k.customs.delay, 1));
  if (m.net === 'port' || m.net === 'rail' || m.net === 'air') add('strike', num(k.strike.p, 0.02), 0, 0, num(k.strike.delayMin, 2), num(k.strike.delayMax, 6));
  if (lock >= 2) add('quarantine', num(T.C().epidemic.quarantineChance, 0.08) * (lock - 1), 0, 0, num(T.C().epidemic.quarantineDays[0], 3), num(T.C().epidemic.quarantineDays[1], 8));
  if (smuggle && mode.perUnit.evadable > 0) {
    let police = 0; try { police = require('../lib/court-policy').effects(q.to.id).detect || 0; } catch (_) { /* ohne Polizeibudget */ }
    add('smuggle', num(k.customs.smuggleP, 0.16) + police, 0, 0, 2, 4, { caught: true });
  }
  return out;
}

/* ------------------------------------------------------------------ Bewertung einer Fahrt ------------------------------------------------------------------ */
/**
 * Alle Zahlen einer Fahrt (Cent in Preisen des Spieljahres). d = { good, from, to, qty, mode, interval, insured, smuggle, carrier: {pct} | null, reg (bereits gemeldete Last) }.
 * c = Betrieb (für Flotte und eigene Fuhrparkvorteile). Ergebnis: { ok, err } oder Aufstellung inkl. erwartetem Gewinn je Fahrt.
 */
function evaluate(world, state, c, d, opt = {}) {
  const k = T.C(); const tr = k.trade;
  const year = yearOf(state.day, state.startYear); const doy = dateOf(state.day, state.startYear).doy; const idx = world.idx(year);
  const goods = require('./goods'); const g = goods.good(d.good);
  if (!g) return { ok: false, err: 'Unbekannte Ware.' };
  if (!T.shippable(d.good, year)) return { ok: false, err: 'Diese Ware kann es jetzt nicht auf Routen geben.' };
  const A = world.city(d.from); const B = world.city(d.to);
  if (!A || !B) return { ok: false, err: 'Bitte Start- und Zielort wählen.' };
  if (A.since > year || B.since > year) return { ok: false, err: 'Diesen Ort gibt es noch nicht.' };
  const pa = goods.price(world, d.from, d.good, year); const pb = goods.price(world, d.to, d.good, year);
  const unitValueReal = pa.market / idx;
  const own = !!(c && isCarrierFirm(world, c));
  const carrierPct = !own && d.carrier && d.carrier.pct ? num(d.carrier.pct, 100, 30, 150) : null;
  const q = T.quote(world, { from: d.from, to: d.to, good: d.good, year, doy, mode: d.mode || 'auto', ownFleet: own, carrierPct, unitValueReal, env: opt.env });
  if (!q.ok) return { ok: false, err: q.err, q };
  const p = q.pick;
  const vehicles = Math.max(1, Math.floor(opt.vehicles != null ? opt.vehicles : c ? fleetOf(world, c) : 1));
  const maxUnits = Math.max(1, p.unitsPerVehicle * vehicles);
  const want = Math.max(0, Math.floor(num(d.qty, 0, 0, 1e9)));
  const units = Math.min(want, maxUnits);
  const cycleMin = p.days + 1;
  const interval = Math.max(cycleMin, Math.floor(num(d.interval, cycleMin, 1, 3650)));
  // Preisdruck: Die Last auf dem Paar (andere Routen plus diese) drückt Verkaufs- und hebt Einkaufspreis
  const reg = num(d.reg, 0, 0, 1e12);
  const flowReal = (units * unitValueReal) / interval;
  const la = loadAt(d.from, d.good); const lb = loadAt(d.to, d.good);
  const outA = Math.max(0, la.out - (opt.skipOwnA || reg)) + flowReal; const inB = Math.max(0, lb.inn - (opt.skipOwnB || reg)) + flowReal;
  const impA = Math.min(num(tr.impactMax, 0.35, 0, 0.9), num(tr.impact, 0.25, 0, 5) * outA / absorb(world, d.from));
  const impB = Math.min(num(tr.impactMax, 0.35, 0, 0.9), num(tr.impact, 0.25, 0, 5) * inB / absorb(world, d.to));
  const unitBuy = pa.market * (1 + num(tr.buyPremiumPct, 2) / 100) * (1 + impA);
  const unitSell = pb.market * (1 - num(tr.sellDiscountPct, 10) / 100) * (1 - impB);
  const smuggle = !!d.smuggle && p.perUnit.evadable > 0;
  const cargo = Math.round(unitBuy * units);
  const freight = Math.round(p.perUnit.freight * idx * units);
  const toll = smuggle ? 0 : Math.round(p.perUnit.toll * idx * units);
  const port = Math.round(p.perUnit.port * idx * units);
  const duty = smuggle ? 0 : Math.round(p.perUnit.duty * idx * units);
  const insurance = d.insured ? Math.round(cargo * num(tr.insurancePct, 2.5, 0, 50) / 100) : 0;
  const costs = cargo + freight + toll + port + duty + insurance;
  const revenueRaw = Math.round(unitSell * units);
  const marginRaw = revenueRaw - costs;
  const overhead = Math.round(num(tr.overheadReal, 3, 0, 1e6) * idx * interval);
  // Risikoerwartung (auf Basis der Kosten): Wer Risiko trägt, darf eine Risikoprämie verdienen – der Deckel gilt für den Gewinn NACH Risiko
  const risks = riskList(world, state, p, q, year, smuggle);
  const cover = d.insured ? num(tr.insureCoverPct, 70, 0, 100) / 100 : 0;
  const lossCap = num(k.risk.lossCapPct, 60, 5, 100) / 100;
  let expLoss = 0; const riskView = [];
  for (const rk of risks) {
    let e = 0;
    if (rk.caught) { const fine = (p.perUnit.evadable * idx * units) * num(k.risk.customs.fineMult, 2); e = rk.p * (fine + cargo * num(k.risk.customs.seizePct, 25) / 100); }
    else if (rk.lossMax > 0) e = rk.p * ((rk.lossMin + rk.lossMax) / 2) * costs * (1 - cover);
    expLoss += e;
    riskView.push({ key: rk.key, name: rk.name, pct: Math.round(rk.p * 1000) / 10, loss: rk.lossMax > 0 ? [Math.round(rk.lossMin * 100), Math.round(rk.lossMax * 100)] : null, delay: rk.delayMax > 0 ? [rk.delayMin, rk.delayMax] : null, caught: !!rk.caught });
  }
  expLoss = Math.round(Math.min(expLoss, costs * lossCap));
  const capMargin = Math.round(cargo * num(tr.roiCapPct, 24, 1, 400) / 100 * interval / 365) + expLoss;
  const margin = marginRaw > capMargin ? capMargin : marginRaw;
  const revenue = costs + margin;
  const net = margin - overhead - expLoss;
  return {
    ok: true, q, mode: p, vehicles, units, maxUnits, wantUnits: want, interval, cycleMin, smuggle, own, carrierPct,
    unitBuy: r2(unitBuy), unitSell: r2(unitSell), buyPrice: r2(pa.market), sellPrice: r2(pb.market), gapPct: r1((pb.market / pa.market - 1) * 100), impA: r2(impA), impB: r2(impB), flowReal: r2(flowReal),
    cargo, freight, toll, port, duty, insurance, costs, revenueRaw, revenue, marginRaw, margin, squeeze: Math.max(0, marginRaw - capMargin), capMargin, overhead, expLoss, net,
    roiYear: cargo > 0 ? r1((net / cargo) * (365 / interval) * 100) : 0, perDay: Math.round(net / interval), risks, riskView, saved: smuggle ? Math.round((p.perUnit.evadable * idx) * units) : 0,
    goodName: g.name, unit: g.unit, idx, year, fromName: A.name, toName: B.name,
  };
}

/* ------------------------------------------------------------------ Anlegen, ändern, beenden ------------------------------------------------------------------ */
const routeStatus = (route, day) => (!route.active ? 'stopped' : route.trip ? 'underway' : route.wait ? 'waiting' : day >= route.next ? 'ready' : 'idle');

function checkInput(world, state, input, routeId) {
  const t = ensure(state); const tr = T.C().trade;
  if (!T.C().on || tr.enabled === false) return { err: 'Handelsrouten sind gerade abgeschaltet.' };
  const c = (state.companies || []).find((x) => x.id === Number(input.firm) && !x.abandoned);
  if (!c) return { err: 'Bitte einen Betrieb wählen, der die Route betreibt.' };
  if (!firmKind(world, c)) return { err: 'Routen betreiben nur Transport-, Logistik- und Handelsbetriebe (Spedition, Laden, Handel).' };
  const mine = t.routes.filter((x) => x.firm === c.id && x.id !== routeId).length;
  if (mine >= routesPerFirm(world, c)) return { err: `Dieser Betrieb betreibt schon ${mine} Routen – mehr geht erst mit einer höheren Betriebsstufe.` };
  if (t.routes.filter((x) => x.id !== routeId).length >= maxRoutesTotal()) return { err: `Du betreibst schon ${maxRoutesTotal()} Routen – das ist die Obergrenze.` };
  const from = Number(input.from); const to = Number(input.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return { err: 'Bitte Start- und Zielort wählen.' };
  if (t.routes.some((x) => x.id !== routeId && x.firm === c.id && x.good === input.good && x.from === from && x.to === to)) return { err: 'Diese Route gibt es für den Betrieb schon.' };
  return { c, from, to };
}

/** Neue Route anlegen. Rückgabe: Route oder wirft per err. input = { firm, good, from, to, qty, interval, mode, insured, smuggle, carrier }. */
function create(world, state, input) {
  const t = ensure(state);
  const ck = checkInput(world, state, input || {}, 0); if (ck.err) return { err: ck.err };
  const d = { good: String(input.good || ''), from: ck.from, to: ck.to, qty: input.qty, mode: input.mode || 'auto', interval: input.interval, insured: !!input.insured, smuggle: !!input.smuggle, carrier: input.carrier || null };
  const e = evaluate(world, state, ck.c, d);
  if (!e.ok) return { err: e.err };
  if (!(e.units >= 1)) return { err: 'Bitte eine Menge angeben.' };
  const tr = T.C().trade;
  if (e.interval > num(tr.maxInterval, 60, 1, 3650)) return { err: `Das Intervall darf höchstens ${tr.maxInterval} Tage betragen.` };
  if (Number(input.interval) && Number(input.interval) < e.cycleMin) return { err: `Das Intervall muss mindestens ${e.cycleMin} Tage sein (Hin- und Rückfahrt dauern so lange).` };
  if (e.cargo / Math.max(1e-9, e.idx) < num(tr.minCargoReal, 150, 0, 1e9)) return { err: 'Die Ladung ist zu klein – eine Fahrt muss sich lohnen. Nimm mehr Menge mit.' };
  const route = {
    id: t.nextId++, firm: ck.c.id, good: d.good, from: d.from, to: d.to, qty: Math.min(Math.floor(Number(input.qty)), e.maxUnits), interval: e.interval, mode: d.mode, insured: d.insured, smuggle: d.smuggle, strict: input.strict !== false,
    carrier: d.carrier ? { offer: d.carrier.offer, user: d.carrier.user, firm: d.carrier.firm, pct: d.carrier.pct, name: d.carrier.name || '' } : null,
    active: true, next: state.day + 1, wait: 0, trip: null, no: 0, reg: 0, made: { trips: 0, lost: 0, profit: 0, last: null }, created: state.day,
  };
  t.routes.push(route);
  return { route, eval: e };
}

function edit(world, state, id, input) {
  const t = ensure(state); const r = t.routes.find((x) => x.id === Number(id)); if (!r) return { err: 'Diese Route gibt es nicht.' };
  if (r.locked) return { err: 'Diese Route wurde von der Spielleitung angehalten.' };
  const c = (state.companies || []).find((x) => x.id === r.firm && !x.abandoned);
  const d = { good: r.good, from: r.from, to: r.to, qty: input.qty != null ? input.qty : r.qty, mode: input.mode != null ? input.mode : r.mode, interval: input.interval != null ? input.interval : r.interval, insured: input.insured != null ? !!input.insured : r.insured, smuggle: input.smuggle != null ? !!input.smuggle : r.smuggle, carrier: input.carrier !== undefined ? input.carrier : r.carrier };
  const e = evaluate(world, state, c, d, { skipOwnA: r.reg, skipOwnB: r.reg });
  if (!e.ok) return { err: e.err };
  if (Number(d.interval) < e.cycleMin) return { err: `Das Intervall muss mindestens ${e.cycleMin} Tage sein.` };
  r.qty = Math.min(Math.floor(Number(d.qty)), e.maxUnits); r.mode = d.mode; r.interval = e.interval; r.insured = d.insured; r.smuggle = d.smuggle; r.carrier = d.carrier ? { offer: d.carrier.offer, user: d.carrier.user, firm: d.carrier.firm, pct: d.carrier.pct, name: d.carrier.name || '' } : null;
  if (input.strict != null) r.strict = !!input.strict;
  return { route: r, eval: e };
}

function setActive(state, id, on) {
  const r = ensure(state).routes.find((x) => x.id === Number(id)); if (!r) return { err: 'Diese Route gibt es nicht.' };
  if (on && r.locked) return { err: 'Diese Route wurde von der Spielleitung angehalten.' };
  r.active = !!on; if (on) { r.wait = 0; if (r.next < state.day + 1) r.next = state.day + 1; }
  return { route: r };
}
function remove(state, id) {
  const t = ensure(state); const r = t.routes.find((x) => x.id === Number(id)); if (!r) return { err: 'Diese Route gibt es nicht.' };
  if (r.trip) return { err: 'Es ist noch eine Fahrt unterwegs – warte bis zur Ankunft oder halte die Route an.' };
  t.routes = t.routes.filter((x) => x.id !== r.id);
  return { route: r };
}

/* ------------------------------------------------------------------ Tagesablauf ------------------------------------------------------------------ */
function logAdd(state, entry) {
  const t = ensure(state); t.log.unshift({ day: state.day, ...entry }); const max = Math.floor(num(T.C().trade.historyMax, 40, 5, 200));
  if (t.log.length > max) t.log.length = max;
}
const money = (state, world, cents) => { const year = yearOf(state.day, state.startYear); const cur = world.currency(year); return `${(Math.abs(cents) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur === 'EUR' ? '€' : 'DM'}`; };
const queueFreight = (state, route, cents, idx, what) => {
  if (!route.carrier || !route.carrier.user || !(cents > 0)) return;
  const share = 1 - num(T.C().trade.carrierCostSharePct, 55, 0, 100) / 100;
  const real = (cents * share) / Math.max(0.0001, idx);
  if (!(real > 0)) return;
  const q = state.pending.freight || (state.pending.freight = []);
  let e = q.find((x) => x.userId === route.carrier.user && x.firm === route.carrier.firm);
  if (!e) { e = { userId: route.carrier.user, firm: route.carrier.firm, real: 0, what: String(what || '').slice(0, 80) }; q.push(e); }
  e.real += real;
};

function vehiclesInUse(state, firmId) { return ensure(state).routes.filter((r) => r.firm === firmId && r.trip).reduce((s, r) => s + (r.trip.vehicles || 1), 0); }

function depart(ctx, route, c) {
  const { world, state } = ctx; const tr = T.C().trade;
  const year = yearOf(state.day, state.startYear); const doy = dateOf(state.day, state.startYear).doy; const idx = world.idx(year);
  const skip = (days, why, level = 'info') => {
    route.next = state.day + days;
    const key = `trw${route.id}`; const last = state.pending[key] == null ? -999 : state.pending[key];
    if (why && state.day - last >= 20) { state.pending[key] = state.day; notice(state, { level, tab: 'trade', title: 'Fahrt ausgesetzt', text: `${why}`, info: ['Die Route bleibt bestehen und versucht es später wieder.', 'Du verlierst nichts.', 'Prüfe Kasse, Preise und Verbindung auf der Seite „Handel & Transport“.'] }); }
    return false;
  };
  if (c.strikeUntil && state.day < c.strikeUntil) return skip(1, null);
  const free = fleetOf(world, c) - vehiclesInUse(state, c.id);
  if (free < 1) return skip(1, null);
  const env = T.environment(world, year, doy, world.city(route.from), world.city(route.to));
  const mode0 = route.mode && route.mode !== 'auto' ? T.modeByKey(route.mode) : null;
  if (env.flood && (!mode0 || mode0.net === 'road' || mode0.net === 'rail')) {
    route.wait = (route.wait || 0) + 1;
    if (route.wait > num(tr.maxWaitDays, 12, 1, 90)) { route.wait = 0; return skip(num(tr.retryDays, 2) + 3, 'Hochwasser sperrt die Strecke – die Fahrt fällt diesmal aus.', 'warn'); }
    return skip(1, null);
  }
  route.wait = 0;
  const unitCap = (() => { const e0 = evaluate(world, state, c, { ...route, qty: 1 }, { vehicles: free, skipOwnA: route.reg, skipOwnB: route.reg, env }); return e0; })();
  if (!unitCap.ok) return skip(num(tr.retryDays, 2), `Die Verbindung ist gerade nicht möglich: ${unitCap.err}`, 'warn');
  // So viel Ware, wie die Kasse hergibt (Rest bleibt unangetastet): Abfahrt nie auf Kredit
  let units = Math.min(route.qty, unitCap.maxUnits);
  let e = evaluate(world, state, c, { ...route, qty: units }, { vehicles: free, skipOwnA: route.reg, skipOwnB: route.reg, env });
  if (e.ok && e.costs > c.cash) {
    const perUnit = e.costs / Math.max(1, e.units);
    units = Math.floor(c.cash / Math.max(1e-9, perUnit));
    if (units < 1) return skip(num(tr.retryDays, 2) + 1, 'In der Firmenkasse fehlt das Geld für die Ladung. Lege Geld in die Kasse oder verkleinere die Route.', 'warn');
    e = evaluate(world, state, c, { ...route, qty: units }, { vehicles: free, skipOwnA: route.reg, skipOwnB: route.reg, env });
    while (e.ok && e.costs > c.cash && units > 1) { units--; e = evaluate(world, state, c, { ...route, qty: units }, { vehicles: free, skipOwnA: route.reg, skipOwnB: route.reg, env }); }
  }
  if (!e.ok || e.costs > c.cash) return skip(num(tr.retryDays, 2), 'Die Fahrt ist gerade nicht möglich.', 'warn');
  if (e.cargo / idx < num(tr.minCargoReal, 150, 0, 1e9) * 0.5) return skip(num(tr.retryDays, 2) + 1, 'Die Ladung wäre zu klein, um sich zu lohnen.', 'warn');
  if (route.strict !== false && e.net <= 0) return skip(num(tr.retryDays, 2), `Die Preislage ist gerade ungünstig (${e.fromName} → ${e.toName}: kein Gewinn zu erwarten). Die Fahrt wartet auf bessere Preise.`);
  // bezahlen
  c.cash -= e.costs;
  route.no = (route.no || 0) + 1;
  // Ereignisse (deterministisch je Route und Fahrt)
  const r = rngFor('trip', state.seed || 0, route.id, route.no);
  const events = []; let loss = 0; let delay = 0; let caught = null; let stolen = false;
  const live = !ctx.offline && !protectedNow(state);
  for (const rk of e.risks) {
    const roll = r(); const sev = r();
    if (!live || roll >= rk.p) continue;
    if (rk.caught) { caught = { fine: Math.round(e.q.pick.perUnit.evadable * idx * e.units * num(T.C().risk.customs.fineMult, 2)), seize: Math.round(e.cargo * num(T.C().risk.customs.seizePct, 25) / 100) }; events.push({ key: 'smuggle', delay: rk.delayMin + Math.round(sev * (rk.delayMax - rk.delayMin)) }); delay += events[events.length - 1].delay; continue; }
    const ev = { key: rk.key };
    if (rk.lossMax > 0) { ev.loss = Math.round((rk.lossMin + sev * (rk.lossMax - rk.lossMin)) * 100) / 100; loss += ev.loss; if (rk.key === 'robbery') stolen = true; }
    if (rk.delayMax > 0) { ev.delay = Math.round(rk.delayMin + sev * (rk.delayMax - rk.delayMin)); delay += ev.delay; }
    events.push(ev);
  }
  loss = Math.min(loss, num(T.C().risk.lossCapPct, 60, 5, 100) / 100);
  const days = Math.min(T.C().maxDays + 20, e.mode.days + delay);
  route.trip = {
    no: route.no, depart: state.day, arrive: state.day + days, units: e.units, vehicles: Math.max(1, Math.ceil(e.units / e.mode.unitsPerVehicle)), mode: e.mode.key, modeName: e.mode.name,
    cargo: e.cargo, freight: e.freight, toll: e.toll, port: e.port, duty: e.duty, insurance: e.insurance, costs: e.costs, capMargin: e.capMargin, insured: !!route.insured, smuggle: e.smuggle,
    events, loss, caught, stolen, expNet: e.net, km: e.q.km, saved: e.saved,
  };
  queueFreight(state, route, e.freight, idx, c.name);
  route.next = state.day + Math.max(route.interval, e.mode.days + 1);
  return true;
}

function arrive(ctx, route, c) {
  const { world, state } = ctx; const tr = T.C().trade; const trip = route.trip;
  const year = yearOf(state.day, state.startYear); const idx = world.idx(year);
  const goods = require('./goods'); const pb = goods.price(world, route.to, route.good, year);
  const cityTo = world.city(route.to); const cityFrom = world.city(route.from);
  const delivered = Math.max(0, Math.floor(trip.units * (1 - trip.loss)));
  const lb = loadAt(route.to, route.good);
  const flow = (delivered * pb.market / idx) / Math.max(1, route.interval);
  const impB = Math.min(num(tr.impactMax, 0.35, 0, 0.9), num(tr.impact, 0.25, 0, 5) * (Math.max(0, lb.inn - (route.reg || 0)) + flow) / absorb(world, route.to));
  const unitSell = pb.market * (1 - num(tr.sellDiscountPct, 10) / 100) * (1 - impB);
  const revenueRaw = Math.round(unitSell * delivered);
  const revenue = Math.min(revenueRaw, trip.costs + trip.capMargin); // Wettbewerb gleicht Spannen oberhalb der Renditegrenze aus
  const squeeze = revenueRaw - revenue;
  const cover = trip.insured ? num(tr.insureCoverPct, 70, 0, 100) / 100 : 0;
  const lostValue = Math.round(Math.max(0, trip.units - delivered) * unitSell);
  const payout = Math.round(lostValue * cover);
  let fine = 0; let seize = 0;
  if (trip.caught) { fine = trip.caught.fine; seize = Math.min(trip.caught.seize, revenue); }
  const income = Math.max(0, revenue - seize);
  const cash0 = c.cash;
  c.cash += income + payout - fine;
  let net = income + payout - fine - trip.costs;
  const sumLoss = route.made;
  sumLoss.trips += 1; sumLoss.profit += net; if (net < 0) sumLoss.lost += 1;
  sumLoss.last = { day: state.day, net, units: delivered };
  const t = ensure(state); t.stats.trips += 1; t.stats.profit += net; if (net < 0) t.stats.lost += 1;
  route.trip = null;
  const label = `${goods.good(route.good).name}: ${cityFrom ? cityFrom.name : '?'} → ${cityTo ? cityTo.name : '?'}`;
  const evs = trip.events.map((x) => x.key);
  logAdd(state, { route: route.id, no: trip.no, label, status: net >= 0 ? 'delivered' : 'loss', net, units: delivered, sent: trip.units, mode: trip.modeName, events: evs, days: state.day - trip.depart, squeeze, cargo: trip.cargo, revenue });
  // Meldung, Ruf, Spuren
  const parts = [];
  const names = { accident: 'Unfall', robbery: 'Plünderung', pothole: 'Panne auf schlechter Straße', weather: 'Schnee und Unwetter', customs: 'Zollkontrolle', strike: 'Streik', quarantine: 'Quarantäne', smuggle: 'Zollkontrolle: Schmuggel entdeckt' };
  for (const ev of trip.events) parts.push(`${names[ev.key] || ev.key}${ev.loss ? ` (−${Math.round(ev.loss * 100)} % der Ladung)` : ev.delay ? ` (+${ev.delay} Tage)` : ''}`);
  const bad = net < 0 || trip.events.some((x) => x.loss || x.key === 'smuggle');
  notice(state, {
    level: net >= 0 && !trip.caught ? 'good' : 'warn', tab: 'trade',
    title: net >= 0 ? `Fracht angekommen: ${label}` : `Fahrt mit Verlust: ${label}`,
    text: `${delivered} von ${trip.units} ${goods.good(route.good).unit} geliefert. ${net >= 0 ? 'Gewinn' : 'Verlust'}: ${money(state, world, net)}${parts.length ? `. Unterwegs: ${parts.join(', ')}` : ''}${payout ? `. Die Transportversicherung zahlte ${money(state, world, payout)}.` : ''}`,
    info: ['Die Ladung wurde im Zielort verkauft, der Erlös liegt in der Firmenkasse.', squeeze > 0 ? 'Der Wettbewerb hat einen Teil der Preisspanne weggedrückt – so hoch ist die Rendite einer Route gedeckelt.' : 'Gewinn je Fahrt ist durch die Rendite-Obergrenze und die Last auf dem Paar begrenzt.', bad ? 'Eine Transportversicherung ersetzt einen Teil verlorener Ladung.' : 'Die Route fährt weiter, solange sie sich lohnt.'],
  });
  if (!bad) rep.queue(state, 'trade', 0.2, 'route_ok', `r${route.id}`);
  if (trip.stolen) { (state.pending.tradeEv || (state.pending.tradeEv = [])).push({ kind: 'theft', cityId: route.to, damageReal: Math.round((lostValue / idx) * 1), subject: c.name }); }
  if (trip.caught) {
    rep.queue(state, 'scandal', null, 'smuggle_caught', `r${route.id}`);
    (state.pending.tradeEv || (state.pending.tradeEv = [])).push({ kind: 'smuggle', cityId: route.to, good: route.good, damageReal: Math.round((trip.saved / idx) * 1), subject: c.name });
  }
  if (route.carrier && route.carrier.user) rep.queue(state, 'trade', 0.15, 'freight_ok', `f${route.carrier.offer}`, { user: route.carrier.user });
  void cash0;
  return net;
}

/** Tagesablauf aller Routen (aus der Engine, nach den Betrieben). */
function daily(ctx) {
  const { world, state } = ctx;
  const t = state.trade; if (!t) return;
  if (!T.C().on || T.C().trade.enabled === false) return;
  if (!ctx.offline && state.day % 30 === 11 && !protectedNow(state)) hintUpdate(world, state);
  if (!t.routes || !t.routes.length) return;
  const tr = T.C().trade; const idx = world.idx(yearOf(state.day, state.startYear));
  for (const route of t.routes) {
    const c = (state.companies || []).find((x) => x.id === route.firm);
    if (!c || c.abandoned || !firmKind(world, c)) {
      if (!route.trip) { route.active = false; }
      continue;
    }
    if (route.active || route.trip) {
      const over = Math.min(c.cash, Math.round(num(tr.overheadReal, 3, 0, 1e6) * idx));
      if (over > 0) c.cash -= over;
    }
    if (route.trip && state.day >= route.trip.arrive) { arrive(ctx, route, c); }
    else if (route.active && !route.trip && state.day >= route.next) {
      const block = require('./court').gate('tradeRoute', state, {});
      if (block) { route.next = state.day + 5; continue; }
      depart(ctx, route, c);
    }
  }
}

/** „Was jetzt?“: etwa einmal im Spielmonat nachsehen, ob sich für einen Betrieb ohne Route gerade ein Preisunterschied nebenan lohnt. */
function hintUpdate(world, state) {
  const t = ensure(state); delete t.hint;
  if (t.routes.length) return;
  const c = tradeFirms(world, state).filter((x) => x.cash > 0)[0]; if (!c) return;
  try {
    const s = suggest(world, state, c, { budget: c.cash * 0.6, maxKm: 400, limit: 1 })[0];
    if (s && s.net > 0) t.hint = { day: state.day, firm: c.id, good: s.good, goodName: s.goodName, from: s.from, fromName: s.fromName, to: s.to, toName: s.toName, gapPct: s.gapPct, net: s.net, qty: s.qty };
  } catch (_) { /* ohne Hinweis */ }
}

/* ------------------------------------------------------------------ Beste Route finden ------------------------------------------------------------------ */
/**
 * Durchsucht Städte in der Nähe nach der besten Handelsroute für einen Betrieb. opt = { good, budget (Cent), maxKm, limit }.
 * Rang: erwarteter Gewinn je Tag. Liefert Vorschläge mit allen Zahlen für die Vorschau.
 */
function suggest(world, state, c, opt = {}) {
  const k = T.C(); const year = yearOf(state.day, state.startYear); const goods = require('./goods');
  const home = world.city(c ? c.cityId : state.cityId); if (!home) return [];
  const maxKm = num(opt.maxKm, 700, 50, 3000);
  const cand = world.cityList.filter((x) => (x.since || 0) <= year && x.id !== home.id && (Number(x.pop) || ({ 5: 1.2e6, 4: 5e5, 3: 2.2e5, 2: 8e4, 1: 2e4 }[x.size_tier] || 2e4)) >= 9000 && T.distanceKm(home, x) <= maxKm);
  const near = cand.map((x) => ({ x, d: T.distanceKm(home, x) })).sort((a, b) => a.d - b.d).slice(0, 28).map((o) => o.x);
  const big = cand.slice().sort((a, b) => (Number(b.pop) || b.size_tier * 1e5) - (Number(a.pop) || a.size_tier * 1e5)).slice(0, 14);
  const set = new Map(); for (const x of [home, ...near, ...big]) set.set(x.id, x);
  const cities = [...set.values()];
  const keys = opt.good ? [opt.good] : Object.values(goods.GOODS).filter((g) => T.shippable(g.key, year)).map((g) => g.key);
  const idx = world.idx(year);
  const price = new Map();
  for (const ct of cities) for (const gk of keys) price.set(`${ct.id}|${gk}`, goods.price(world, ct.id, gk, year).market);
  const budget = opt.budget != null ? opt.budget : c ? c.cash * 0.8 : state.money * 0.5;
  const tr = k.trade; const pre = [];
  for (const a of cities) for (const b of cities) {
    if (a.id === b.id) continue;
    const dist = T.distanceKm(a, b); if (dist > maxKm || dist < 15) continue;
    for (const gk of keys) {
      const pa = price.get(`${a.id}|${gk}`); const pb = price.get(`${b.id}|${gk}`);
      const gap = (pb * (1 - num(tr.sellDiscountPct, 10) / 100)) / (pa * (1 + num(tr.buyPremiumPct, 2) / 100)) - 1;
      if (gap > 0.012) pre.push({ a, b, gk, gap, dist });
    }
  }
  pre.sort((x, y) => y.gap - x.gap);
  const out = [];
  const minReal = num(tr.minCargoReal, 150, 0, 1e9);
  for (const o of pre.slice(0, 90)) {
    const g = goods.good(o.gk); const unitCost = price.get(`${o.a.id}|${o.gk}`) * (1 + 0.02 + Math.min(0.12, o.dist / 4000));
    let units = Math.floor(budget / Math.max(1e-9, unitCost));
    if (units < 1 || (units * price.get(`${o.a.id}|${o.gk}`)) / idx < minReal) continue;
    const base = { good: o.gk, from: o.a.id, to: o.b.id, qty: units, mode: 'auto', interval: 0, insured: false };
    const e0 = evaluate(world, state, c, base);
    if (!e0.ok || !(e0.units >= 1)) continue;
    // Menge wählen: je größer die Ladung, desto stärker der Preisdruck – probiere Anteile der Kasse und nimm den besten Tagesgewinn
    let e = null;
    for (const f of [1, 0.5, 0.25, 0.12, 0.06]) {
      const u = Math.min(Math.max(1, Math.floor(units * f)), e0.maxUnits);
      const x = evaluate(world, state, c, { ...base, qty: u, interval: e0.cycleMin + 2 });
      if (x.ok && x.cargo <= budget * 1.02 && x.cargo / idx >= minReal && (!e || x.perDay > e.perDay)) e = x;
    }
    if (!e || e.net <= 0) continue;
    out.push({ good: o.gk, goodName: g.name, unit: g.unit, from: o.a.id, fromName: o.a.name, to: o.b.id, toName: o.b.name, qty: e.units, interval: e.interval, mode: e.mode.key, modeName: e.mode.name, days: e.mode.days, km: e.q.km,
      gapPct: e.gapPct, net: e.net, perDay: e.perDay, roiYear: e.roiYear, cargo: e.cargo, freight: e.freight + e.toll + e.port + e.duty, squeeze: e.squeeze, riskPct: Math.round(e.risks.reduce((s, x) => s + (x.lossMax > 0 ? x.p * 100 : 0), 0) * 10) / 10 });
  }
  out.sort((x, y) => y.perDay - x.perDay || y.roiYear - x.roiYear);
  const seen = new Set(); const res = [];
  for (const s of out) { const key = `${s.good}|${s.from}|${s.to}`; if (seen.has(key)) continue; seen.add(key); res.push(s); if (res.length >= num(opt.limit, 6, 1, 30)) break; }
  return res;
}

/* ------------------------------------------------------------------ Anzeige ------------------------------------------------------------------ */
/** Kurzfassung für die Spielansicht (leicht): Routen mit Status, letzter Fahrt, Obergrenzen. Details liefert die Schnittstelle /api/transport. */
function view(world, state) {
  const t = ensure(state); const goods = require('./goods'); const year = yearOf(state.day, state.startYear);
  const on = T.C().on && T.C().trade.enabled !== false;
  const firms = tradeFirms(world, state).map((c) => ({ id: c.id, name: c.name, city: (world.city(c.cityId) || {}).name, kind: firmKind(world, c), vehicles: fleetOf(world, c), used: vehiclesInUse(state, c.id), routes: t.routes.filter((r) => r.firm === c.id).length, max: routesPerFirm(world, c), cash: c.cash }));
  return {
    on, max: maxRoutesTotal(), firms, year,
    routes: t.routes.map((r) => {
      const g = goods.good(r.good); const A = world.city(r.from); const B = world.city(r.to);
      return {
        id: r.id, firm: r.firm, good: r.good, goodName: g ? g.name : r.good, unit: g ? g.unit : '', from: r.from, fromName: A ? A.name : '?', to: r.to, toName: B ? B.name : '?', qty: r.qty, interval: r.interval, mode: r.mode, insured: !!r.insured, smuggle: !!r.smuggle,
        carrier: r.carrier ? { user: r.carrier.user, name: r.carrier.name, pct: r.carrier.pct } : null, active: !!r.active, locked: !!r.locked, status: routeStatus(r, state.day), strict: r.strict !== false,
        nextIn: r.trip ? Math.max(0, r.trip.arrive - state.day) : Math.max(0, r.next - state.day),
        trip: r.trip ? { no: r.trip.no, modeName: r.trip.modeName, units: r.trip.units, departed: r.trip.depart, arrive: r.trip.arrive, days: r.trip.arrive - r.trip.depart, left: Math.max(0, r.trip.arrive - state.day), events: r.trip.events.map((x) => x.key), cargo: r.trip.cargo } : null,
        made: { trips: r.made.trips, lost: r.made.lost, profit: r.made.profit, last: r.made.last },
      };
    }),
    log: t.log.slice(0, 20), stats: t.stats, hint: t.hint && state.day - t.hint.day < 60 ? t.hint : null,
  };
}

module.exports = {
  ensure, firmKind, isCarrierFirm, fleetOf, routesPerFirm, maxRoutesTotal, tradeFirms, setLoad, getLoad, loadAt, absorb, riskList, evaluate, create, edit, setActive, remove, daily, suggest, view,
  routeStatus, protectedNow, vehiclesInUse, RISK_NAME,
};
