'use strict';
/**
 * Vermieten: Eigene Immobilien (die nicht selbst bewohnt werden) können an Mieter vermietet werden.
 * Die Miete richtet sich nach Wert und Zustand; der Preisregler (mult) bestimmt die Nachfrage.
 * Tägliche Einnahmen stehen in dailyFlows (inc.rent), Mieterwechsel und Ausfälle laufen hier.
 */
const { rngFor } = require('./rng');
const { scale } = require('./economy');
const { yearOf } = require('./calendar');

const YIELD = { flat: 0.055, house_small: 0.05, house_large: 0.044, villa: 0.035 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MIN_MULT = 0.5; const MAX_MULT = 2;

/** Marktmiete pro Tag bei Preisindex 1 (Cent). */
function marketBase(p) {
  return Math.max(20, Math.round(((p.base || 0) * (YIELD[p.kind] || 0.045)) / 365 * (0.7 + 0.3 * (p.condition == null ? 100 : p.condition) / 100)));
}
const isResidence = (state, p) => state.housing && state.housing.type === 'own' && state.housing.propertyId === p.id;
const active = (state, p) => !!(p.lease && p.lease.on) && !isResidence(state, p);

/** Miete pro Tag (Cent, heutige Preise), wenn ein Mieter einzahlt. */
const cycleRent = (year) => Math.pow(require('./economy').realEstateFactor(year), 0.6); // Mieten schwanken schwächer als Preise
function rentPerDay(world, state, p, year) {
  return Math.round(scale(Math.round(marketBase(p) * clamp((p.lease && p.lease.mult) || 1, MIN_MULT, MAX_MULT)), world.idx(year)) * cycleRent(year));
}
const marketPerDay = (world, state, p, year) => Math.round(scale(marketBase(p), world.idx(year)) * cycleRent(year));

/** Miete eines Mieters: Spieler zahlen den bei Einzug vereinbarten Preis (in Wert von 1945), NPC-Mieter die Marktmiete des Reglers. */
function tenantRent(world, state, p, year) {
  const T = p.lease && p.lease.tenant;
  return T && T.contractReal ? Math.round(scale(T.contractReal, world.idx(year))) : rentPerDay(world, state, p, year);
}

/** Einnahmen heute (für dailyFlows). */
function incomeToday(world, state, year) {
  let sum = 0;
  for (const p of state.properties) {
    if (!active(state, p) || !p.lease.tenant || p.lease.tenant.arrears > 0 || p.closedUntil > state.day) continue;
    sum += tenantRent(world, state, p, year);
  }
  return sum;
}

function demand(world, p) {
  const city = world.city(p.cityId) || { size_tier: 2 };
  const price = Math.pow(clamp(1.15 / clamp(p.lease.mult || 1, MIN_MULT, MAX_MULT), 0.2, 2.5), 2);
  const cond = 0.4 + (p.condition / 100) * 0.8;
  const tier = [0.7, 0.7, 0.85, 1, 1.1, 1.2][city.size_tier] || 1;
  return 0.03 * price * cond * tier;
}

/**
 * Tagesabrechnung der Posten, die dailyFlows ausweist, die aber nirgends sonst verbucht wurden:
 * Mieteinnahmen (gutschreiben) und Einkommensteuer auf Lohn, Amtsbezüge und Miete (abbuchen).
 * Der Kredit wird in credit.creditDaily bezahlt. Aufruf einmal je Spieltag aus dem Engine-Tick.
 */
function settleIncome(ctx) {
  const { world, state } = ctx; const core = require('./core');
  const f = core.dailyFlows(world, state);
  if (f.inc.rent > 0) { state.money += f.inc.rent; state.stats.earned += f.inc.rent; }
  if (f.exp.tax > 0) { const t = ctx.offline ? Math.min(f.exp.tax, Math.max(0, state.money)) : f.exp.tax; state.money -= t; state.stats.spent += t; }
}

function landlordDaily(ctx) {
  const { world, state } = ctx;
  settleIncome(ctx);
  if (!state.properties.length) return;
  const { notice } = require('./core');
  const { randomFirstName } = require('./content');
  const year = yearOf(state.day, state.startYear);
  for (const p of state.properties) {
    const L = p.lease; if (!L || !L.on) continue;
    if (isResidence(state, p)) { L.on = false; L.tenant = null; continue; }
    if (p.closedUntil > state.day) continue; // beschädigt: kein neuer Mieter, keine Miete
    const r = rngFor('tenant', state.seed, p.id, state.day);
    const T = L.tenant;
    if (T && T.userId) { p.condition = Math.max(5, p.condition - 3 / 365); L.total = (L.total || 0) + tenantRent(world, state, p, year); continue; }
    if (T) {
      p.condition = Math.max(5, p.condition - 3 / 365); // Mieter nutzen ab
      if (T.arrears > 0) {
        T.arrears--;
        if (T.arrears === 0) { L.tenant = null; L.vacantSince = state.day; notice(state, { level: 'warn', title: `${p.name}: Mieter ausgezogen`, text: `${T.name} ist ausgezogen – ohne die ausstehende Miete zu zahlen.`, tab: 'housing', info: ['Der Mieter hat monatelang nicht gezahlt und ist dann gegangen.', 'Während dieser Zeit gab es keine Miete, die Kosten für Unterhalt liefen weiter.', 'Ein fairer Preis und ein gepflegter Zustand ziehen zuverlässigere Mieter an.'] }); }
        continue;
      }
      L.total = (L.total || 0) + rentPerDay(world, state, p, year);
      if (r() < 0.00022) {
        T.arrears = 45 + Math.floor(r() * 60);
        notice(state, { level: 'bad', title: `${p.name}: Mieter zahlt nicht`, text: `${T.name} bleibt die Miete schuldig.`, tab: 'housing', info: ['Mietausfall: Ein Mieter zahlt nicht mehr.', 'Du erhältst vorerst keine Miete, der Unterhalt läuft weiter.', 'Das passiert selten. Du kannst den Preis senken und gepflegte Wohnungen anbieten.'] });
      } else if (p.condition < 25 && r() < 0.01) { // Mieter bleiben, solange das Haus bewohnbar ist; die Miete läuft unbefristet
        L.tenant = null; L.vacantSince = state.day;
        if (state.day - (state.pending.tenantMsg || -99) >= 30) { state.pending.tenantMsg = state.day; notice(state, { level: 'info', title: `${p.name}: Mieter zieht aus`, text: `${T.name} zieht nach ${Math.round((state.day - T.since) / 365 * 10) / 10} Jahren aus. Die Wohnung wird neu angeboten.`, tab: 'housing' }); }
      }
    } else if (r() < demand(world, p)) {
      const female = r() < 0.5;
      const name = `${randomFirstName(r, year - 25 - Math.floor(r() * 30), female ? 'f' : 'm')} ${require('./content').LAST[Math.floor(r() * require('./content').LAST.length)]}`;
      L.tenant = { name, since: state.day, until: 1e9, arrears: 0 }; // unbefristet
      if (state.day - (state.pending.tenantMsg || -99) >= 20) { state.pending.tenantMsg = state.day; notice(state, { level: 'good', title: `${p.name}: Neuer Mieter`, text: `${name} hat die Immobilie gemietet – die Miete fließt ab sofort täglich.`, tab: 'housing' }); }
    }
  }
}

/** Ansicht für die Oberfläche. */
function viewOf(world, state, p, year) {
  const market = marketPerDay(world, state, p, year);
  const L = p.lease;
  const on = active(state, p);
  const perDay = on ? tenantRent(world, state, p, year) : market;
  const T = on ? L.tenant : null;
  const val = Math.max(1, Math.round(p.base * world.idx(year) * (0.2 + 0.8 * (p.condition / 100))));
  return {
    open: !!(on && L.players && !L.tenant), players: !!(L && L.players), playerTenant: !!(on && L.tenant && L.tenant.userId), on, mult: L ? clamp(L.mult || 1, MIN_MULT, MAX_MULT) : 1, market, perDay,
    yieldPct: Math.round(((perDay * 365) / val) * 1000) / 10,
    tenant: T ? { name: T.name, since: state.day - T.since, until: T.until - state.day, arrears: T.arrears || 0 } : null,
    vacantDays: on && !T ? state.day - (L.vacantSince == null ? state.day : L.vacantSince) : 0,
    total: L ? L.total || 0 : 0, canLet: !isResidence(state, p),
  };
}

module.exports = { settleIncome, tenantRent, cycleRent, marketBase, marketPerDay, rentPerDay, incomeToday, landlordDaily, viewOf, isResidence, MIN_MULT, MAX_MULT, clamp };
