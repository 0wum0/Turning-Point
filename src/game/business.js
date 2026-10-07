'use strict';
const { rngFor, int, pick, shuffle, chance } = require('./rng');
const { yearOf } = require('./calendar');
const { scale, formatMoney, currencyOf } = require('./economy');
const { notice, chronicle, isLearned, levelIndex } = require('./core');
const { LAST } = require('./content');
const EVD = require('./event-defaults');

const tiersOf = (world) => world.econ.companies.tiers;
const cityMult = (city) => 0.7 + 0.15 * (city ? city.size_tier : 2);

function chainNames(world, pkey) {
  const c = world.econ.companies.chains[pkey];
  if (c) return c;
  const p = world.prof(pkey);
  const base = (p && p.unlocks) || (p && p.name) || 'Betrieb';
  return [base, `${base} (groß)`, `${base}-Konzern`];
}
const tierName = (world, c) => chainNames(world, c.pkey)[Math.min(c.tier, 2)];

/** Qualifikation: eigene Stufe oder (nur Stufe 1) der Beruf des zusammenlebenden Partners. */
function qualification(world, state, pkey, tier) {
  const t = tiersOf(world)[tier];
  if (!t) return { ok: false, via: null };
  if (isLearned(state, pkey) && levelIndex(state, pkey) >= t.minLevel) return { ok: true, via: 'self' };
  if (tier === 0 && state.partner && state.partner.cohabit && state.partner.pkey === pkey) return { ok: true, via: 'partner' };
  return { ok: false, via: null };
}

function companyValue(world, state, c, year) {
  const idx = world.idx(year);
  let v = c.base * idx;
  if (c.abandoned) {
    const yrs = (state.day - c.abandoned.day) / 365;
    v *= Math.max(0.2, 1 - (0.8 * yrs) / world.econ.companies.abandonYears);
  }
  return Math.round(v);
}

function staffNeeded(world, c) { return Math.ceil(c.rooms / tiersOf(world)[c.tier].roomsPerStaff); }

/** Konjunktur: historische Krisen und Aufschwünge dämpfen/stärken den Umsatz aller Betriebe. */
const CRISES = [[1973, 1975, 0.8, 'Ölkrise'], [1980, 1982, 0.85, 'Rezession'], [1992, 1994, 0.88, 'Rezession nach der Wiedervereinigung'], [2001, 2003, 0.9, 'Platzen der Dotcom-Blase'], [2008, 2009, 0.78, 'Finanzkrise'], [2020, 2021, 0.75, 'Pandemie-Lockdowns']];
const BOOMS = [[1950, 1957, 1.12, 'Wirtschaftswunder'], [1986, 1990, 1.06, 'Aufschwung'], [2014, 2019, 1.05, 'langer Aufschwung']];
function marketPhase(year) {
  for (const [a, b, f, name] of CRISES) if (year >= a && year <= b) return { factor: f, name, kind: 'crisis' };
  for (const [a, b, f, name] of BOOMS) if (year >= a && year <= b) return { factor: f, name, kind: 'boom' };
  return { factor: 1, name: null, kind: null };
}

function companyFlows(world, state, c, year) {
  const idx = world.idx(year);
  const econ = world.econ.companies;
  const t = tiersOf(world)[c.tier];
  if (c.abandoned) return { income: 0, wages: 0, upkeep: 0, profit: 0, efficiency: 0, needed: 0 };
  const needed = staffNeeded(world, c);
  const ownerHere = state.occupation && state.occupation.ownCompanyId === c.id ? 1 : 0;
  const eff = Math.max(0.2, Math.min(1, (c.staff + ownerHere) / needed)) * (c.manager || ownerHere ? 1 : 0.6);
  const strike = c.strikeUntil && state.day < c.strikeUntil ? 0 : 1;
  const income = Math.round(c.rooms * t.incomePerRoom * idx * cityMult(world.city(c.cityId)) * eff * marketPhase(year).factor * strike);
  const wages = Math.round(c.staff * econ.staffWage * idx + (c.manager ? econ.managerWage * idx : 0));
  const upkeep = Math.round((companyValue(world, state, c, year) * econ.upkeepYearPct) / 100 / 365);
  return { income, wages, upkeep, profit: income - wages - upkeep, efficiency: eff, needed };
}

function netBusinessValue(world, state, year) {
  return (state.companies || []).reduce((s, c) => s + companyValue(world, state, c, year), 0);
}

/**
 * Zufallsereignisse je Betrieb (deterministisch je Betrieb+Woche, einmal pro Woche möglich):
 * Inspektion, Streik, Gästelob, Diebstahl. Konjunktur-Wechsel werden einmal je Phase gemeldet.
 */
function bizEvents(ctx, c, year) {
  const { world, state } = ctx;
  const phase = marketPhase(year);
  const key = phase.kind ? phase.name : '';
  if ((state.pending.market || '') !== key && state.day % 30 === 0) {
    state.pending.market = key;
    if (phase.kind === 'crisis') notice(state, { level: 'bad', title: `Wirtschaftskrise: ${phase.name}`, tab: 'business', text: `Die Umsätze deiner Betriebe sinken spürbar (ca. ${Math.round((1 - phase.factor) * 100)} %). Halte Rücklagen in der Firmenkasse.`, info: ['Krisenjahre dämpfen den Umsatz aller Betriebe.', 'Fixkosten und Löhne laufen weiter.', 'Gut gefüllte Firmenkassen und wenig Personal überstehen Krisen besser.'] });
    else if (phase.kind === 'boom') notice(state, { level: 'good', title: `Aufschwung: ${phase.name}`, tab: 'business', text: 'Die Geschäfte laufen besser als sonst – ein guter Moment zum Erweitern.' });
  }
  if (state.day % 7 !== c.id % 7) return;
  const B = { ...EVD.business, ...((world.econ.events && world.econ.events.business) || {}) };
  const r = rngFor('bizev', state.seed || 0, c.id, Math.floor(state.day / 7));
  if (!chance(r, B.chance)) return;
  const idx = world.idx(year);
  const cur = currencyOf(year, world.econ);
  const kind = pick(r, ['inspection', 'inspection', 'strike', 'praise', 'theft']);
  const needed = staffNeeded(world, c);
  if (kind === 'inspection') {
    const clean = c.staff >= needed && c.manager;
    if (clean) {
      c.cash += scale(B.inspectionBonus, idx);
      notice(state, { level: 'good', title: `Inspektion bei ${c.name}`, tab: 'business', text: 'Das Amt findet nichts zu beanstanden und lobt den Betrieb.' });
    } else {
      const fine = scale(B.fineBase + c.rooms * B.finePerRoom, idx);
      c.cash -= fine;
      notice(state, { level: 'warn', title: `Inspektion bei ${c.name}`, tab: 'business', text: `Zu wenig Personal oder keine Leitung: ${formatMoney(fine, cur)} Strafe aus der Firmenkasse.`, info: ['Ämter prüfen Hygiene, Arbeitsschutz und Besetzung.', 'Mit genug Personal und einem Manager passiert dir das nicht.', 'Stelle Mitarbeiter ein oder setze einen Manager ein.'] });
    }
  } else if (kind === 'strike' && c.staff >= B.strikeMinStaff) {
    c.strikeUntil = state.day + int(r, B.strikeMinDays, B.strikeMaxDays);
    notice(state, { level: 'warn', title: `Streik bei ${c.name}`, tab: 'business', text: 'Die Belegschaft legt die Arbeit nieder. Während des Streiks gibt es keinen Umsatz.', info: ['Streiks dauern wenige Tage.', 'Löhne und Unterhalt laufen weiter.', 'Ein Manager schlichtet; mehr Lohn beruhigt langfristig die Stimmung.'] });
  } else if (kind === 'praise') {
    const bonus = scale(B.praiseBase + c.rooms * B.praisePerRoom, idx);
    c.cash += bonus;
    notice(state, { level: 'good', title: `Gästelob für ${c.name}`, tab: 'business', text: `Eine begeisterte Kritik bringt Zulauf: ${formatMoney(bonus, cur)} zusätzlicher Umsatz.` });
  } else if (kind === 'theft') {
    const loss = scale(B.theftLoss, idx);
    c.cash -= loss;
    notice(state, { level: 'warn', title: `Diebstahl in ${c.name}`, tab: 'business', text: `Aus dem Betrieb wurde Ware im Wert von ${formatMoney(loss, cur)} gestohlen.` });
  }
}

/** Tagesbetrieb: Gewinn sammelt sich in der Firmenkasse; Qualifikation wird monatlich geprüft. */
function businessDaily(ctx) {
  const { world, state } = ctx;
  if (!state.companies || !state.companies.length) return;
  const year = yearOf(state.day, state.startYear);
  for (const c of state.companies) {
    if (state.day % 30 === 0) {
      const q = qualification(world, state, c.pkey, c.tier);
      if (!c.abandoned && !q.ok) {
        c.abandoned = { day: state.day }; c.manager = false; c.staff = 0;
        if (state.occupation && state.occupation.ownCompanyId === c.id) state.occupation = null;
        chronicle(state, `${c.name} wird aufgegeben (fehlende Qualifikation).`, 'business');
        notice(state, {
          level: 'bad', title: `${c.name} steht leer`, tab: 'business', interrupt: true,
          text: 'Dir fehlt die nötige Qualifikation. Der Betrieb wird zum Lost Place und verliert über etwa zehn Jahre an Wert.',
          info: ['Ein Betrieb darf nur mit passender Qualifikation geführt werden.', 'Ohne sie verfällt er: Bretter, Absperrungen, sinkender Wert. Er bleibt aber in deinem Besitz.', 'Erwirb die Qualifikation (Ausbildung, Erfahrung, Partner) und reaktiviere ihn – oder verkaufe ihn.'],
        });
      }
    }
    if (c.abandoned) continue;
    if (!ctx.offline) bizEvents(ctx, c, year);
    const f = companyFlows(world, state, c, year);
    c.cash += f.profit;
    c.lastProfit = f.profit;
    if (c.cash < 0) {
      state.money += c.cash; state.stats.spent += -c.cash; c.cash = 0;
      if (ctx.offline) { c.staff = Math.max(0, c.staff - 1); }
    }
  }
}

function bizListings(world, state, city, week) {
  const year = yearOf(state.day, state.startYear);
  const idx = world.idx(year);
  const r = rngFor('biz', city.id, week);
  const tiers = tiersOf(world);
  const keys = new Set();
  for (const k of state.skills.learned) keys.add(k);
  if (state.partner && state.partner.pkey) keys.add(state.partner.pkey);
  const cand = shuffle(r, [...keys].map((k) => world.prof(k)).filter((p) => p && !p.academic && p.pkey !== 'helfer' && p.unlocks && p.era_from <= year && year <= p.era_to));
  const out = [];
  for (let i = 0; i < Math.min(3, cand.length); i++) {
    const p = cand[i];
    let tier = 0;
    for (let t = tiers.length - 1; t >= 0; t--) if (qualification(world, state, p.pkey, t).ok) { tier = Math.min(t + (i > 0 && r() < 0.25 ? 1 : 0), tiers.length - 1); break; }
    const t = tiers[tier];
    const base = Math.round(t.price * city.price_factor * (0.85 + r() * 0.35));
    const names = chainNames(world, p.pkey);
    out.push({
      id: `biz:${city.id}:${week}:${i}`, type: 'biz', pkey: p.pkey, tier, tierName: names[tier], name: `${names[tier]} ${pick(r, LAST)}`, cityId: city.id,
      base, price: Math.round(base * idx), rooms: t.rooms, minLevel: t.minLevel, profession: p.name, icon: p.icon,
      qualified: qualification(world, state, p.pkey, tier).ok,
    });
  }
  return out;
}

module.exports = { marketPhase, qualification, companyValue, companyFlows, staffNeeded, businessDaily, bizListings, tierName, chainNames, netBusinessValue, tiersOf, cityMult };
