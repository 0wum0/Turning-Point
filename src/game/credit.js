'use strict';
/** Bank: Kredite mit Annuitätentilgung, Zins nach Epoche und Auslastung, Kreditrahmen nach Vermögen und Einkommen. */
const settings = require('../settings');
const { scale, isEuroDay } = require('./economy');
const { yearOf } = require('./calendar');

const cfg = () => settings.get('credit');
const BASE = [[1945, 6], [1960, 6.5], [1970, 8], [1980, 8.5], [1990, 7], [2000, 5], [2010, 2.5], [2020, 4], [2030, 3.5], [2100, 3.5]];
function baseRate(year) {
  for (let i = 1; i < BASE.length; i++) if (year <= BASE[i][0]) { const [y0, r0] = BASE[i - 1]; const [y1, r1] = BASE[i]; return r0 + ((r1 - r0) * (year - y0)) / Math.max(1, y1 - y0); }
  return BASE[BASE.length - 1][1];
}
const SURCHARGE = 2; // Aufschlag (Prozentpunkte) bei voll ausgeschöpftem Rahmen
const debt = (state) => (state.loans || []).reduce((s, l) => s + l.left, 0);
const dailyPay = (state) => (state.loans || []).reduce((s, l) => s + l.pay, 0);

/** Zinssatz (Prozent p. a.) für neue Kredite – steigt mit der Auslastung des Rahmens. */
function rateFor(year, utilisation) { return Math.round((baseRate(year) + cfg().spread + SURCHARGE * Math.max(0, Math.min(1, utilisation))) * 10) / 10; }

function limitOf(world, state, year) {
  const { propertyValue } = require('./core'); const biz = require('./business');
  const props = state.properties.reduce((s, p) => s + propertyValue(world, state, p, year), 0);
  const firms = (state.companies || []).reduce((s, c) => s + biz.companyValue(world, state, c, year), 0);
  const income = Math.max(0, require('./core').dailyFlows(world, state).inc.wage + require('./core').dailyFlows(world, state).inc.rent);
  return Math.max(0, Math.round(cfg().assetPct / 100 * (props + firms) + cfg().incomeDays * income));
}

/** Laufendes Einkommen pro Tag (Cent): Lohn, Miete und die Gewinne der Betriebe. */
function incomePerDay(world, state) {
  const f = require('./core').dailyFlows(world, state);
  return Math.max(0, f.inc.wage + f.inc.rent + (state.companies || []).reduce((s, c) => s + Math.max(0, c.lastProfit || 0), 0));
}

function view(world, state) {
  const year = yearOf(state.day, state.startYear); const limit = limitOf(world, state, year); const d = debt(state);
  const util = limit > 0 ? d / limit : 1;
  return { enabled: cfg().enabled, limit, debt: d, available: Math.max(0, limit - d), rate: rateFor(year, util), minAmount: scale(cfg().minAmount, world.idx(year)), maxYears: cfg().maxYears,
    loans: (state.loans || []).map((l) => ({ id: l.id, left: l.left, pay: l.pay, rate: l.rate, days: l.daysLeft, taken: l.principal })) };
}

function take(world, state, amount, years) {
  if (!cfg().enabled) throw new Error('Die Bank vergibt gerade keine Kredite.');
  const year = yearOf(state.day, state.startYear); const v = view(world, state);
  amount = Math.round(amount);
  if (!(amount >= v.minAmount)) throw new Error('Der Betrag ist zu klein.');
  if (amount > v.available) throw new Error('Das übersteigt deinen Kreditrahmen.');
  const y = Math.max(1, Math.min(cfg().maxYears, Math.round(years || 5))); const n = y * 365;
  const rate = rateFor(year, (v.debt + amount) / Math.max(1, v.limit)); const r = rate / 100 / 365;
  const pay = Math.max(1, Math.round((amount * r) / (1 - Math.pow(1 + r, -n))));
  // Tragbarkeit: alle Raten zusammen dürfen höchstens 60 % des Jahreseinkommens (Lohn, Miete, Betriebsgewinne) plus ein Viertel der Barmittel kosten
  const capacity = 0.6 * incomePerDay(world, state) * 365 + 0.25 * Math.max(0, state.money);
  if ((dailyPay(state) + pay) * 365 > capacity) throw new Error('Die Raten wären für dein Einkommen zu hoch. Wähle eine längere Laufzeit oder einen kleineren Betrag.');
  state.loans = state.loans || []; state.nextLoanId = state.nextLoanId || 1;
  state.loans.push({ id: state.nextLoanId++, principal: amount, left: amount, rate, daysLeft: n, pay, day: state.day });
  state.money += amount;
  return { rate, pay, n };
}

function repay(state, id, amount) {
  const l = (state.loans || []).find((x) => x.id === id); if (!l) throw new Error('Kredit nicht gefunden.');
  const a = Math.min(Math.round(amount), l.left, state.money); if (a < 1) throw new Error('Dir fehlt das Geld für die Rückzahlung.');
  state.money -= a; const f = (l.left - a) / l.left; l.left -= a; l.pay = Math.max(1, Math.round(l.pay * f));
  if (l.left < 1) state.loans = state.loans.filter((x) => x.id !== id);
  return a;
}

/** Tag: Zins fällt an, Tilgung wird verbucht (die Rate selbst steckt in dailyFlows als exp.loan). */
function creditDaily(ctx) {
  const { state } = ctx; if (!state.loans || !state.loans.length) return;
  if (isEuroDay(state.day, state.startYear, settings.get('economy'))) {
    // Währungsumstellung 2:1: Restschuld und Rate halbieren sich wie Geld, Preise und Löhne (sonst verdoppelte sich die Last real)
    for (const l of state.loans) { l.left = l.left / 2; l.pay = Math.max(1, Math.round(l.pay / 2)); l.principal = Math.round(l.principal / 2); }
  }
  for (const l of state.loans) {
    const interest = l.left * (l.rate / 100 / 365); const principalPart = Math.min(l.left, Math.max(0, l.pay - interest));
    // Die Rate (Zins + Tilgung) wird wirklich vom Konto abgebucht; offline nur, soweit Geld da ist (Rest läuft als Zins auf).
    const due = Math.min(l.pay, Math.round(l.left + interest));
    const paid = ctx.offline ? Math.min(due, Math.max(0, state.money)) : due;
    state.money -= paid; if (state.stats) state.stats.spent += paid;
    if (paid >= due) l.left = Math.max(0, l.left - principalPart); else l.left += interest;
    l.daysLeft--;
  }
  state.loans = state.loans.filter((l) => l.left >= 1 && l.daysLeft > -365);
}

module.exports = { baseRate, rateFor, debt, dailyPay, limitOf, view, take, repay, creditDaily };
