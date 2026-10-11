'use strict';
/**
 * Handelsrouten und Transport (Server): Spiegel der Routen aus den Spielständen (Last auf Strecken, Admin, Frachtführer), Frachtangebote
 * von Speditionen (Frachtverträge), Gutschriften an Frachtführer (genau einmal, wie die Lieferverträge), Spuren für das Gericht und die
 * Schnittstellen für die Oberfläche. Die Simulation selbst läuft im Spielstand des Besitzers (src/game/trade.js) – offline sicher.
 */
const db = require('../db');
const log = require('./log');
const live = require('./live');
const service = require('../game/service');
const goods = require('../game/goods');
const T = require('../game/transport');
const TR = require('../game/trade');
const { ActionError } = require('../game/actions');
const { yearOf, dateOf } = require('../game/calendar');
const { notice } = require('../game/core');

const fail = (m) => { throw new ActionError(m); };
const num = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const worldP = () => require('../game/world').get();
const on = () => T.C().on && T.C().trade.enabled !== false;
const r2 = (x) => Math.round(x * 100) / 100;

/* ============================================================================================
   Last auf den Strecken (aus den gespiegelten Routen) – wirkt auf Preise und Gewinne
   ============================================================================================ */
let FLOWS = [];
async function refresh() {
  try {
    const rows = await db.query('SELECT from_city, to_city, good, flow_real FROM transport_routes WHERE active = 1 AND cancelled = 0 AND flow_real > 0');
    const m = new Map(); const list = [];
    for (const r of rows) {
      const a = `${r.to_city}|${r.good}`; const b = `${r.from_city}|${r.good}`;
      const x = m.get(a) || { inn: 0, out: 0 }; x.inn += Number(r.flow_real); m.set(a, x);
      const y = m.get(b) || { inn: 0, out: 0 }; y.out += Number(r.flow_real); m.set(b, y);
      list.push({ to: r.to_city, from: r.from_city, good: r.good, perDay: Number(r.flow_real) });
    }
    FLOWS = list; TR.setLoad(m);
  } catch (e) { log.warn(`[transport] Last: ${e.message}`); }
}
const flows = () => FLOWS;

/* ============================================================================================
   Abgleich beim Laden und Zurückschreiben beim Speichern
   ============================================================================================ */
async function reconcile(conn, user, state) {
  if (!state || state.status !== 'alive') return;
  const t = state.trade; if (!t || !Array.isArray(t.routes) || !t.routes.length) return;
  const rows = await conn.query('SELECT route_id, cancelled, cancel_note FROM transport_routes WHERE user_id = ?', [user.id]);
  const byId = new Map(rows.map((r) => [r.route_id, r]));
  for (const r of t.routes) {
    const row = byId.get(r.id);
    if (row && row.cancelled && !r.locked) {
      r.locked = true; r.active = false;
      notice(state, { level: 'warn', tab: 'trade', title: 'Route angehalten', text: `Die Spielleitung hat die Route ${r.good} angehalten.${row.cancel_note ? ` Grund: ${row.cancel_note}` : ''} Eine laufende Fahrt kommt noch an.`, info: ['Die Route startet keine neuen Fahrten mehr.', 'Du verlierst keine Ware: eine Fahrt unterwegs wird noch abgerechnet.', 'Bei Fragen wende dich an die Spielleitung.'] });
    } else if (row && !row.cancelled && r.locked) { r.locked = false; }
  }
  const ids = [...new Set(t.routes.filter((r) => r.carrier && r.carrier.offer).map((r) => r.carrier.offer))];
  if (ids.length) {
    const open = new Set((await conn.query(`SELECT id FROM freight_offers WHERE status = 'open' AND id IN (${ids.map(() => '?').join(',')})`, ids)).map((x) => x.id));
    for (const r of t.routes) {
      if (r.carrier && r.carrier.offer && !open.has(r.carrier.offer)) {
        r.carrier = null;
        notice(state, { level: 'info', tab: 'trade', title: 'Frachtführer nicht mehr verfügbar', text: 'Die Spedition hat ihr Angebot zurückgezogen. Die Route fährt wieder zum Standardtarif.', info: ['Fracht kostet jetzt wieder den normalen Tarif.', 'Du kannst unter „Handel & Transport“ ein neues Angebot wählen.', 'Die Route läuft weiter.'] });
      }
    }
  }
}

/** Vor dem Speichern: Frachtzahlungen genau einmal verbuchen, Spuren für das Gericht, Routen spiegeln. */
async function flush(conn, user, state, world) {
  if (!state) return;
  const q = state.pending && state.pending.freight;
  if (q && q.length) {
    state.pending.freight = [];
    const ids = [...new Set(q.map((x) => x.userId))];
    const alive = new Set((await conn.query(`SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map((r) => r.id));
    for (const e of q) {
      if (!alive.has(e.userId) || !(e.real > 0)) continue;
      await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text, company_id) VALUES (?,?,'freight',?,?)", [e.userId, e.real, `Fracht für ${String(e.what || '').slice(0, 80)}`, e.firm || null]);
      live.publish('business', {}, e.userId);
    }
  } else if (state.pending && state.pending.freight) delete state.pending.freight;
  const ev = state.pending && state.pending.tradeEv;
  if (ev && ev.length) {
    state.pending.tradeEv = [];
    for (const x of ev.slice(0, 6)) {
      try {
        if (x.kind === 'theft') await require('./court').trace(conn, { act: 'theft', offenderId: null, victimId: user.id, subject: x.subject, cityId: x.cityId, damageReal: x.damageReal, known: false });
        else if (x.kind === 'smuggle') {
          // Wer am Zoll vorbeiliefert, unterbietet ehrliche Händler: das Opfer ist der größte ehrliche Zulieferer derselben Ware im Zielort
          const v = await conn.one('SELECT user_id, company_id FROM transport_routes WHERE to_city = ? AND good = ? AND user_id <> ? AND active = 1 AND cancelled = 0 ORDER BY flow_real DESC LIMIT 1', [x.cityId, x.good, user.id]);
          if (v) await require('./court').trace(conn, { act: 'smuggle', offenderId: user.id, victimId: v.user_id, victimCompany: v.company_id, subject: x.subject, cityId: x.cityId, damageReal: x.damageReal, known: true });
        }
      } catch (e) { log.warn(`[transport] Spur: ${e.message}`); }
    }
  }
  // Spiegel
  const t = state.trade;
  if (!t || !Array.isArray(t.routes)) return;
  if (!t.routes.length && !t.m) return;
  const year = yearOf(state.day, state.startYear); const idx = Math.max(0.0001, world.idx(year));
  const rows = [];
  for (const r of t.routes) {
    let flow = 0;
    if (r.active && !r.locked) { try { flow = (goods.price(world, r.from, r.good, year).market / idx) * (r.qty || 0) / Math.max(1, r.interval || 1); } catch (_) { flow = 0; } }
    r.reg = Math.round(flow * 100) / 100;
    rows.push([user.id, r.id, r.firm, r.good, r.from, r.to, r.qty, r.interval, String(r.mode || 'auto').slice(0, 12), TR.routeStatus(r, state.day), r.active ? 1 : 0, r.reg, r.carrier && r.carrier.offer ? r.carrier.offer : null, r.made.trips, Math.round(r.made.profit / idx)]);
  }
  const sig = JSON.stringify(rows.map((x) => x.slice(1, 13).concat([x[13]])));
  if (t.sig === sig) return;
  t.sig = sig; t.m = rows.length ? 1 : 0;
  if (rows.length) {
    await conn.query(`INSERT INTO transport_routes (user_id, route_id, company_id, good, from_city, to_city, qty, interval_days, mode, status, active, flow_real, carrier_offer, trips, profit_real) VALUES ${rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')}
      ON DUPLICATE KEY UPDATE company_id = VALUES(company_id), good = VALUES(good), from_city = VALUES(from_city), to_city = VALUES(to_city), qty = VALUES(qty), interval_days = VALUES(interval_days), mode = VALUES(mode), status = VALUES(status), active = VALUES(active), flow_real = VALUES(flow_real), carrier_offer = VALUES(carrier_offer), trips = VALUES(trips), profit_real = VALUES(profit_real)`, rows.flat());
    await conn.query(`DELETE FROM transport_routes WHERE user_id = ? AND route_id NOT IN (${rows.map(() => '?').join(',')})`, [user.id, ...rows.map((x) => x[1])]);
  } else await conn.query('DELETE FROM transport_routes WHERE user_id = ?', [user.id]);
  live.publish('trade', {}, user.id);
}

/* ============================================================================================
   Frachtangebote (Frachtverträge)
   ============================================================================================ */
const kgDay = (qty, good, perDays) => num(qty, 0) * T.weightOf(good) / Math.max(1, perDays);
async function capacityUsed(offerId, ignore = {}) {
  let used = 0;
  const routes = await db.query('SELECT user_id, route_id, good, qty, interval_days FROM transport_routes WHERE carrier_offer = ? AND active = 1 AND cancelled = 0', [offerId]);
  for (const r of routes) { if (ignore.route && ignore.route.user === r.user_id && ignore.route.id === r.route_id) continue; used += kgDay(r.qty, r.good, r.interval_days); }
  const cons = await db.query("SELECT id, good, qty FROM supply_contracts WHERE carrier_offer = ? AND status IN ('active','offer')", [offerId]);
  for (const c of cons) { if (ignore.contract === c.id) continue; used += kgDay(c.qty, c.good, 1); }
  return used;
}

async function offerRow(id) {
  return db.one(`SELECT o.*, f.name firm, f.city_id, f.pkey, f.rooms, f.tier, f.abandoned, ps.name owner, ps.year, ps.status pstatus, u.banned, u.social_public
    FROM freight_offers o JOIN player_firms f ON f.user_id = o.user_id AND f.company_id = o.company_id JOIN player_stats ps ON ps.user_id = o.user_id JOIN users u ON u.id = o.user_id WHERE o.id = ?`, [int(id)]);
}

/** Frachtführer für eine Route oder einen Vertrag wählen; prüft Kapazität und Partner. need = kg pro Tag. */
async function attach(offerId, userId, need, ignore = {}) {
  const o = await offerRow(offerId);
  if (!o || o.status !== 'open' || o.abandoned || o.pstatus !== 'alive' || o.banned) fail('Dieses Frachtangebot gibt es nicht mehr.');
  if (o.user_id === userId) fail('Du kannst nicht bei dir selbst Fracht bestellen.');
  if (await require('./social').sameIp(userId, o.user_id)) fail('Zwischen Konten mit derselben Internetverbindung sind keine Frachtverträge erlaubt.');
  const used = await capacityUsed(o.id, ignore);
  if (used + need > o.cap_kg_day + 1e-6) fail(`Die Spedition ist ausgelastet (noch ${Math.max(0, Math.floor(o.cap_kg_day - used))} kg pro Tag frei).`);
  return { offer: o.id, user: o.user_id, firm: o.company_id, pct: o.pct, name: `${o.firm}`, owner: o.owner };
}

async function marketOffers(userId, p) {
  const { w: world, state } = p; const home = world.city(state.cityId);
  const rows = await db.query(`SELECT o.id, o.user_id, o.company_id, o.pct, o.cap_kg_day, f.name firm, f.city_id, ps.name owner FROM freight_offers o
    JOIN player_firms f ON f.user_id = o.user_id AND f.company_id = o.company_id JOIN player_stats ps ON ps.user_id = o.user_id JOIN users u ON u.id = o.user_id
    WHERE o.status = 'open' AND o.user_id <> ? AND f.abandoned = 0 AND ps.status = 'alive' AND u.banned = 0 AND u.social_public = 1 ORDER BY o.pct ASC, o.id DESC LIMIT 60`, [userId]);
  const out = [];
  for (const r of rows) {
    const c = world.city(r.city_id); const used = await capacityUsed(r.id);
    out.push({ id: r.id, userId: r.user_id, firm: r.firm, owner: r.owner, city: c ? c.name : '?', cityId: r.city_id, km: home && c ? Math.round(T.distanceKm(home, c)) : null, pct: r.pct, free: Math.max(0, Math.floor(r.cap_kg_day - used)), cap: r.cap_kg_day });
  }
  return out.filter((x) => x.free > 0).sort((a, b) => (a.km == null ? 9e9 : a.km) - (b.km == null ? 9e9 : b.km)).slice(0, 20);
}

async function myOffers(userId) {
  const rows = await db.query("SELECT o.*, f.name firm FROM freight_offers o LEFT JOIN player_firms f ON f.user_id = o.user_id AND f.company_id = o.company_id WHERE o.user_id = ? AND o.status = 'open' ORDER BY o.id", [userId]);
  const out = [];
  for (const r of rows) out.push({ id: r.id, company: r.company_id, firm: r.firm, pct: r.pct, cap: r.cap_kg_day, used: Math.round(await capacityUsed(r.id)) });
  return out;
}

async function createOffer(userId, input) {
  if (!on()) fail('Handelsrouten und Frachtverträge sind gerade nicht möglich.');
  await require('./court').assertFree(userId, 'trade');
  const world = await worldP();
  const f = await db.one("SELECT f.*, ps.year, ps.status pstatus FROM player_firms f JOIN player_stats ps ON ps.user_id = f.user_id WHERE f.user_id = ? AND f.company_id = ?", [userId, int(input.company)]);
  if (!f || f.abandoned || f.pstatus !== 'alive') fail('Diesen Betrieb besitzt du nicht (oder er ist nicht aktiv).');
  if (TR.firmKind(world, f) !== 'carrier') fail('Frachtangebote machen nur Transport- und Logistikbetriebe (Spedition, Fuhrunternehmen, Logistik).');
  const k = T.C().contracts;
  const pct = Math.round(num(input.pct, 90, num(k.carrierMinPct, 70), num(k.carrierMaxPct, 100)));
  const open = await db.one("SELECT COUNT(*) n FROM freight_offers WHERE user_id = ? AND company_id = ? AND status = 'open'", [userId, f.company_id]);
  if (Number(open.n) >= num(k.offerLimit, 4)) fail('Für diesen Betrieb laufen schon genug Frachtangebote.');
  const mode = T.modeAt(T.C().modes.find((m) => m.key === 'lkw') || T.C().modes[0], f.year);
  const maxCap = Math.floor(TR.fleetOf(world, f) * mode.cap / 3);
  const cap = Math.floor(num(input.cap, maxCap, 100, maxCap));
  const r = await db.query('INSERT INTO freight_offers (user_id, company_id, pct, cap_kg_day) VALUES (?,?,?,?)', [userId, f.company_id, pct, cap]);
  live.publish('trade', {});
  return r.insertId;
}

async function closeOffer(userId, id) {
  const r = await db.query("UPDATE freight_offers SET status = 'closed', closed_at = NOW() WHERE id = ? AND user_id = ? AND status = 'open'", [int(id), userId]);
  if (!r.affectedRows) fail('Dieses Frachtangebot gibt es nicht mehr.');
  // Laufende Verträge mit diesem Frachtführer behalten ihren Preis bis zum Ende; neue Fahrten nehmen den Standardtarif (reconcile)
  live.publish('trade', {});
}

/* ============================================================================================
   Schnittstelle für die Oberfläche
   ============================================================================================ */
function eligible(world, state) { return TR.tradeFirms(world, state); }

async function overview(userId) {
  const p = await service.peek(userId); if (!p || !p.state) return { enabled: false };
  const { w: world, state } = p; const year = yearOf(state.day, state.startYear); const doy = dateOf(state.day, state.startYear).doy; const idx = world.idx(year);
  const k = T.C(); const city = world.city(state.cityId);
  const v = TR.view(world, state);
  const keys = Object.values(goods.GOODS).filter((g) => T.shippable(g.key, year));
  const env = city ? T.environment(world, year, doy, city, city) : { winter: 0, lock: 0, flood: false };
  const modes = k.modes.filter((m) => year >= m.from && year <= m.to).map((m) => { const s = T.modeAt(m, year); return { key: m.key, name: m.name, icon: m.icon, net: m.net, speed: Math.round(s.speed), capKg: Math.round(s.cap), cost: Math.round(s.cost * 10000) / 10000, note: m.note || '' }; });
  let policy = null; try { policy = require('./transport-policy').local(state.cityId); } catch (_) { policy = null; }
  const out = {
    ok: true, enabled: on(), year, idx, currency: world.currency(year), view: v, env, modes,
    goods: keys.map((g) => ({ key: g.key, name: g.name, unit: g.unit, icon: g.icon, kg: T.weightOf(g.key), price: goods.price(world, state.cityId, g.key, year).market })),
    maxTravelDays: k.maxDays, labels: k.labels, hubs: city ? T.hubs(city, year) : null,
    risk: { protectedNow: TR.protectedNow(state), robbery: year <= k.risk.robbery.toYear, tollYear: k.tolls.lkwFromYear },
    trade: { roiCapPct: k.trade.roiCapPct, insurancePct: k.trade.insurancePct, insureCoverPct: k.trade.insureCoverPct, minInterval: k.trade.minInterval, maxInterval: k.trade.maxInterval, minCargoReal: k.trade.minCargoReal },
    eligibleFirms: eligible(world, state).map((c) => ({ id: c.id, name: c.name, kind: TR.firmKind(world, c) })),
    policy, offers: { mine: await myOffers(userId), market: await marketOffers(userId, p) },
    contracts: k.contracts,
  };
  return out;
}

function pickFirm(world, state, id) {
  const c = (state.companies || []).find((x) => x.id === int(id) && !x.abandoned);
  if (!c) fail('Bitte einen Betrieb wählen, der die Route betreibt.');
  if (!TR.firmKind(world, c)) fail('Routen betreiben nur Transport-, Logistik- und Handelsbetriebe (Spedition, Laden, Handel).');
  return c;
}

async function carrierFor(input, userId, world, state, c, ignore) {
  if (!input.carrierOffer) return null;
  if (TR.isCarrierFirm(world, c)) return null; // eigener Fuhrpark
  const g = String(input.good || '');
  const interval = Math.max(1, int(input.interval, 10));
  return attach(int(input.carrierOffer), userId, kgDay(num(input.qty, 0), g, interval), ignore);
}

function trimEval(e, world, state) {
  if (!e.ok) return { ok: false, err: e.err };
  const m = e.mode; const q = e.q;
  return {
    ok: true, good: e.goodName, unit: e.unit, from: { id: q.from.id, name: q.from.name, state: q.from.state }, to: { id: q.to.id, name: q.to.name, state: q.to.state },
    units: e.units, wantUnits: e.wantUnits, maxUnits: e.maxUnits, vehicles: e.vehicles, interval: e.interval, cycleMin: e.cycleMin, km: q.km, own: e.own, smuggle: e.smuggle, carrierPct: e.carrierPct,
    mode: { key: m.key, name: m.name, icon: m.icon, days: m.days, speed: m.speed, capKg: m.capKg, unitsPerVehicle: m.unitsPerVehicle, flags: m.flags },
    options: q.options.map((o) => ({ key: o.key, name: o.name, icon: o.icon, ok: o.ok, why: o.why, days: o.days, speed: o.speed, perUnit: Math.round(o.perUnit.total * e.idx * 100) / 100, note: o.note })),
    buyPrice: e.buyPrice, sellPrice: e.sellPrice, unitBuy: e.unitBuy, unitSell: e.unitSell, gapPct: e.gapPct, impA: e.impA, impB: e.impB,
    money: { cargo: e.cargo, freight: e.freight, toll: e.toll, port: e.port, duty: e.duty, insurance: e.insurance, costs: e.costs, revenueRaw: e.revenueRaw, revenue: e.revenue, margin: e.margin, marginRaw: e.marginRaw, squeeze: e.squeeze, capMargin: e.capMargin, overhead: e.overhead, expLoss: e.expLoss, net: e.net, perDay: e.perDay, saved: e.saved },
    roiYear: e.roiYear, risks: e.riskView, env: q.env, tariffPct: m.tariffPct, tollPct: m.tollPct, canSmuggle: m.perUnit.evadable > 0, evadable: Math.round(m.perUnit.evadable * e.idx * e.units), protectedNow: TR.protectedNow(state),
  };
}

async function preview(userId, input) {
  if (!on()) fail('Handelsrouten sind gerade abgeschaltet.');
  const p = await service.peek(userId); if (!p || !p.state || p.state.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  const { w: world, state } = p; const c = pickFirm(world, state, input.firm);
  const carrier = await carrierFor(input, userId, world, state, c, {});
  const d = { good: String(input.good || ''), from: int(input.from), to: int(input.to), qty: input.qty, mode: input.mode || 'auto', interval: input.interval, insured: !!input.insured, smuggle: !!input.smuggle, carrier };
  const existing = input.routeId ? state.trade.routes.find((r) => r.id === int(input.routeId)) : null;
  const e = TR.evaluate(world, state, c, d, existing ? { skipOwnA: existing.reg, skipOwnB: existing.reg } : {});
  const out = trimEval(e, world, state);
  if (out.ok && c.cash < e.costs) out.cashShort = e.costs - c.cash;
  if (out.ok) out.cash = c.cash;
  return out;
}

async function suggest(userId, input) {
  if (!on()) fail('Handelsrouten sind gerade abgeschaltet.');
  const p = await service.peek(userId); if (!p || !p.state || p.state.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  const { w: world, state } = p; const c = pickFirm(world, state, input.firm);
  const list = TR.suggest(world, state, c, { good: input.good ? String(input.good) : null, budget: input.budget != null ? num(input.budget, c.cash * 0.8, 0) : Math.max(0, c.cash * 0.8), limit: 6 });
  return { ok: true, list, cash: c.cash };
}

function gate(state, input) { const b = require('../game/court').gate('tradeRoute', state, input); if (b) fail(b); }

async function create(userId, input) {
  if (!on()) fail('Handelsrouten sind gerade abgeschaltet.');
  return service.withCharacter(userId, async (ctx) => {
    const { world, state } = ctx; gate(state, input);
    const c = pickFirm(world, state, input.firm);
    if (input.smuggle && TR.protectedNow(state)) fail('Schmuggel ist in den ersten Spieltagen (Anfängerschutz) nicht möglich.');
    const carrier = await carrierFor(input, userId, world, state, c, {});
    const res = TR.create(world, state, { ...input, firm: c.id, carrier });
    if (res.err) fail(res.err);
    return { msg: `Route eingerichtet: ${res.eval.goodName} von ${res.eval.fromName} nach ${res.eval.toName}.`, level: 'good', id: res.route.id };
  }, { needAlive: true });
}

async function edit(userId, id, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state } = ctx; gate(state, input);
    const r = state.trade.routes.find((x) => x.id === int(id)); if (!r) fail('Diese Route gibt es nicht.');
    const c = (state.companies || []).find((x) => x.id === r.firm);
    const patch = { ...input };
    if (input.carrierOffer !== undefined) {
      if (input.carrierOffer && c && !TR.isCarrierFirm(world, c)) patch.carrier = await attach(int(input.carrierOffer), userId, kgDay(input.qty != null ? input.qty : r.qty, r.good, input.interval != null ? input.interval : r.interval), { route: { user: userId, id: r.id } });
      else patch.carrier = null;
    }
    if (input.smuggle && TR.protectedNow(state)) fail('Schmuggel ist in den ersten Spieltagen (Anfängerschutz) nicht möglich.');
    const res = TR.edit(world, state, id, patch);
    if (res.err) fail(res.err);
    return { msg: 'Route gespeichert.', level: 'good' };
  }, { needAlive: true });
}

async function setActive(userId, id, onOff) {
  return service.withCharacter(userId, async (ctx) => {
    if (onOff) gate(ctx.state, {});
    const res = TR.setActive(ctx.state, id, onOff);
    if (res.err) fail(res.err);
    return { msg: onOff ? 'Route läuft wieder.' : 'Route angehalten. Eine Fahrt unterwegs kommt noch an.', level: 'good' };
  }, { needAlive: true });
}

async function remove(userId, id) {
  return service.withCharacter(userId, async (ctx) => {
    const res = TR.remove(ctx.state, id);
    if (res.err) fail(res.err);
    return { msg: 'Route gelöscht.', level: 'good' };
  }, { needAlive: true });
}

/* ============================================================================================
   Fracht in Lieferverträgen
   ============================================================================================ */
/**
 * Fracht je Einheit (real) und Lieferzeit zwischen den Orten zweier Betriebe (Zeilen aus player_firms mit city_id) im Jahr des Käufers.
 * Kein Wetter und keine Seuchenlage: ein Vertrag legt einen festen Tarif fest. null = keine Verbindung.
 */
function contractFreight(world, sellerFirm, buyerFirm, goodKey, year, carrierPct) {
  if (!sellerFirm || !buyerFirm || sellerFirm.city_id === buyerFirm.city_id) return { same: true, perUnit: 0, days: 0, km: 0, mode: null, modeName: null };
  const g = goods.good(goodKey); if (!g) return null;
  const idx = world.idx(year);
  const val = goods.priceReal(g, year);
  const f = T.freightFor(world, { from: sellerFirm.city_id, to: buyerFirm.city_id, good: goodKey, year, doy: 150, unitValueReal: val, env: { winter: 0, lock: 0, flood: false }, carrierPct: carrierPct || null });
  void idx;
  return f;
}
const maxKm = () => num(T.C().contracts.maxKm, 450, 0, 5000);
const crossRegion = () => T.C().on && T.C().contracts.crossRegion !== false;

/* ============================================================================================
   Bots: sehen aus wie Spieler – richten Routen ein, nutzen Fracht, bieten Fracht an
   ============================================================================================ */
async function botRound(userId, rnd = Math.random) {
  if (!on() || T.C().bots.enabled === false) return;
  const p = await service.peek(userId); if (!p || !p.state || p.state.status !== 'alive') return;
  const { w: world, state } = p;
  const firms = eligible(world, state); if (!firms.length) return;
  const t = state.trade;
  if (TR.protectedNow(state)) return;
  // Schlechte Routen beenden (nach einigen Fahrten mit Verlust)
  for (const r of t.routes) {
    if (r.active && r.made.trips >= 4 && r.made.profit < 0 && rnd() < 0.5) { try { await setActive(userId, r.id, false); } catch (_) { /* egal */ } return; }
    if (!r.active && !r.locked && !r.trip && rnd() < 0.2) { try { await remove(userId, r.id); } catch (_) { /* egal */ } return; }
  }
  // Spedition: ab und zu Fracht anbieten
  const carrier = firms.find((c) => TR.isCarrierFirm(world, c));
  if (carrier && rnd() < 0.08) {
    const have = await db.one("SELECT COUNT(*) n FROM freight_offers WHERE user_id = ? AND status = 'open'", [userId]);
    if (Number(have.n) < 1) { try { await createOffer(userId, { company: carrier.id, pct: 78 + Math.floor(rnd() * 16) }); } catch (_) { /* Grenzen */ } return; }
  }
  if (t.routes.length >= Math.min(num(T.C().bots.routes, 2, 0, 6), TR.maxRoutesTotal())) return;
  if (rnd() > 0.22) return;
  const c = firms[Math.floor(rnd() * firms.length)];
  if (t.routes.filter((r) => r.firm === c.id).length >= TR.routesPerFirm(world, c)) return;
  const list = TR.suggest(world, state, c, { budget: c.cash * 0.5, limit: 4 });
  if (!list.length) return;
  const s = list[Math.floor(rnd() * Math.min(3, list.length))];
  let carrierOffer = 0;
  if (!TR.isCarrierFirm(world, c) && rnd() < 0.35) { const m = await marketOffers(userId, p); if (m.length) carrierOffer = m[Math.floor(rnd() * Math.min(3, m.length))].id; }
  try {
    await create(userId, { firm: c.id, good: s.good, from: s.from, to: s.to, qty: s.qty, interval: s.interval, insured: s.riskPct > 1 || rnd() < 0.3, carrierOffer: carrierOffer || undefined });
  } catch (e) {
    if (carrierOffer) { try { await create(userId, { firm: c.id, good: s.good, from: s.from, to: s.to, qty: s.qty, interval: s.interval, insured: false }); } catch (_) { /* nichts */ } }
  }
}

/* ============================================================================================
   Admin
   ============================================================================================ */
async function adminList(limit = 120) {
  const rows = await db.query(`SELECT r.*, u.username, ps.name pname, f.name firm FROM transport_routes r JOIN users u ON u.id = r.user_id LEFT JOIN player_stats ps ON ps.user_id = r.user_id
    LEFT JOIN player_firms f ON f.user_id = r.user_id AND f.company_id = r.company_id ORDER BY r.cancelled DESC, r.updated_at DESC LIMIT ?`, [Math.max(1, Math.min(500, int(limit, 120)))]);
  const world = await worldP();
  return rows.map((r) => ({ ...r, goodName: (goods.good(r.good) || {}).name || r.good, fromName: (world.city(r.from_city) || {}).name || '?', toName: (world.city(r.to_city) || {}).name || '?' }));
}
async function adminStats() {
  const a = await db.one('SELECT COUNT(*) n, SUM(active = 1 AND cancelled = 0) act, SUM(cancelled = 1) canc, COALESCE(SUM(flow_real), 0) flow FROM transport_routes');
  const o = await db.one("SELECT COUNT(*) n FROM freight_offers WHERE status = 'open'");
  const c = await db.one("SELECT COUNT(*) n FROM supply_contracts WHERE status = 'active' AND km > 0");
  return { routes: Number(a.n), active: Number(a.act || 0), cancelled: Number(a.canc || 0), flow: Math.round(Number(a.flow)), offers: Number(o.n), contracts: Number(c.n) };
}
async function adminCancel(userId, routeId, note, restore = false) {
  const r = await db.query('UPDATE transport_routes SET cancelled = ?, cancel_note = ? WHERE user_id = ? AND route_id = ?', [restore ? 0 : 1, restore ? null : String(note || '').slice(0, 160), userId, int(routeId)]);
  live.publish('trade', {}, userId);
  await refresh();
  return r.affectedRows;
}

function start() {
  refresh().catch(() => {});
  setInterval(() => { db.query("DELETE FROM freight_offers WHERE status = 'closed' AND closed_at < NOW() - INTERVAL 30 DAY").catch(() => {}); }, 6 * 3600000).unref();
}

module.exports = {
  refresh, flows, reconcile, flush, attach, capacityUsed, createOffer, closeOffer, marketOffers, myOffers, overview, preview, suggest, create, edit, setActive, remove,
  contractFreight, maxKm, crossRegion, botRound, adminList, adminStats, adminCancel, start, on, kgDay,
};
