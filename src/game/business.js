'use strict';
const { rngFor, int, pick, shuffle, chance } = require('./rng');
const press = require('./press');
const { yearOf } = require('./calendar');
const { scale, formatMoney, currencyOf, isEuroDay } = require('./economy');
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
  if (c.abandoned) return { income: 0, wages: 0, upkeep: 0, profit: 0, efficiency: 0, needed: 0, inputs: 0, vat: 0, contractIncome: 0, profitAll: 0 };
  const needed = staffNeeded(world, c);
  const ownerHere = state.occupation && state.occupation.ownCompanyId === c.id ? 1 : 0;
  const ps = c.playerStaff || [];
  const eff = Math.max(0.2, Math.min(1, (c.staff + ps.length + ownerHere) / needed)) * (c.manager || c.playerManager || ownerHere ? 1 : 0.6);
  const strike = c.strikeUntil && state.day < c.strikeUntil ? 0 : 1;
  const comp = require('./competition').info(world, c.cityId, c.pkey, c.rooms);
  const hit = c.hit && state.day < c.hit.until ? c.hit.factor : 1; const outage = c.outageUntil && state.day < c.outageUntil ? 0 : 1;
  const ce = require('./cityecon'); // Stadtwirtschaft: Sektor-Index (Umsatz, abgeschwächt) und örtliches Lohnniveau; ohne Stadtindizes = 1
  const raw = c.rooms * t.incomePerRoom * idx * cityMult(world.city(c.cityId)) * eff * marketPhase(year).factor * strike * comp.factor * hit * outage * ce.revenueMult(world, c.cityId, c.pkey, year);
  // Warenkreislauf: Rezept, Versorgung, Verträge, Politik (siehe goods.js). Ohne Rezeptzutaten/aus: identisch zur früheren Rechnung.
  const goods = require('./goods'); const gw = goods.W();
  const ar = goods.activeRecipe(world, c.pkey, year, c.cityId);
  const ef = goods.effectsFor(world, c.cityId);
  const rPot = Math.round(raw * ar.mult * goods.outputFactor(ar, year, ef));
  const buy = goods.buyPlan(world, state, c, year, rPot, ar, gw);
  const rAct = Math.round(rPot * buy.factor);
  const sell = goods.sellPlan(world, state, c, year, rAct, ar, gw);
  const income = Math.round(rAct * sell.npcShare);
  const wages = Math.round((c.staff * econ.staffWage * idx + (c.manager ? econ.managerWage * idx : 0)) * ce.wageMult(c.cityId, year) + ps.reduce((s, x) => s + x.wage * idx, 0) + (c.playerManager ? c.playerManager.wage * idx : 0));
  const upkeep = Math.round((companyValue(world, state, c, year) * econ.upkeepYearPct) / 100 / 365) + (c.security ? Math.round(c.rooms * t.incomePerRoom * idx * 0.04) : 0);
  const inputs = buy.cost;
  const vat = Math.round((ef.vat / 100) * Math.max(0, income - inputs));
  const pretax = income - wages - upkeep - inputs - vat;
  const taxer = require('./tax');
  const tax = pretax > 0 ? Math.max(0, taxer.corporateTax(pretax) + Math.round((pretax * (ef.surcharge + ef.levy)) / 100)) : 0;
  const profit = pretax - tax;
  return {
    income, wages, upkeep, tax, pretax, profit, efficiency: eff, needed, comp, inputs, vat, contractIncome: sell.contractIncome, profitAll: profit + sell.contractIncome,
    supply: {
      on: gw.on, primary: ar.primary, status: buy.status, ratio: buy.ratio, factor: buy.factor, auto: buy.auto, needs: buy.needs, pays: buy.pays, outputs: sell.outputs, fills: sell.fills,
      costContract: buy.costContract, costWholesale: buy.costWholesale, subsidy: buy.subsidy, cost: buy.cost, contractIncome: sell.contractIncome,
      policy: { surcharge: ef.surcharge, levy: Math.round(ef.levy * 10) / 10, vat: ef.vat, tariff: ef.tariff },
    },
  };
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
  const euro = isEuroDay(state.day, state.startYear, world.econ);
  for (const c of state.companies) {
    if (euro) c.cash = Math.round(c.cash / 2); // Firmenkasse wird mit der Währung 2:1 umgestellt (Preise und Löhne tun es über den Index)
    if (state.day % 30 === 0) {
      const q = qualification(world, state, c.pkey, c.tier);
      if (!c.abandoned && !q.ok) {
        c.abandoned = { day: state.day }; c.manager = false; c.staff = 0;
        if (state.occupation && state.occupation.ownCompanyId === c.id) state.occupation = null;
        chronicle(state, `${c.name} wird aufgegeben (fehlende Qualifikation).`, 'business');
        press.story(world, state, 'business_closed', { firm: c.name, cityId: c.cityId });
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
    settleContracts(state, c, f, world.idx(year));
    if (c.stock) require('../lib/exchange').dividend(ctx, c, f.profit);
    if (c.cash < 0) {
      state.money += c.cash; state.stats.spent += -c.cash; c.cash = 0;
      if (ctx.offline) { c.staff = Math.max(0, c.staff - 1); }
    }
  }
}

/**
 * Lieferverträge buchen (reine Zustandsänderung, die DB-Gutschrift folgt beim Speichern – siehe lib/supply.js):
 * Der Käufer zahlt in seiner Zeit, die Gutschrift für den Verkäufer wird in „realem“ Wert (÷ eigener Preisindex) vorgemerkt.
 * Verkäufer merken sich, zu wie viel Prozent sie liefern konnten (fill); Käufer zählen die Laufzeit herunter.
 */
function settleContracts(state, c, f, idxNow) {
  const sp = f.supply; const K = state.contracts;
  if (!sp || !K) return;
  const idx = Math.max(0.0001, idxNow || 1);
  for (const p of sp.pays || []) {
    const bb = (K.buys || []).find((x) => x.id === p.id); if (bb) bb.take = Math.round(Math.max(0, Math.min(1, p.take == null ? 1 : p.take)) * 1000) / 1000;
    if (!(p.cents > 0) || !p.sellerId) continue;
    const q = state.pending.supply || (state.pending.supply = []);
    let e = q.find((x) => x.id === p.id);
    if (!e) { e = { id: p.id, userId: p.sellerId, firm: p.sellerFirm, real: 0, what: c.name }; q.push(e); }
    e.real += p.cents / idx;
  }
  for (const s of K.sells || []) if (s.firmId === c.id && sp.fills && sp.fills[s.id] != null) s.fill = Math.round(sp.fills[s.id] * 1000) / 1000;
  for (const b of K.buys || []) {
    if (b.firmId !== c.id || b.ended) continue;
    if (sp.on && !(sp.pays || []).some((p) => p.id === b.id)) b.take = 0; // Bedarf schon anderweitig gedeckt: der Verkäufer muss nichts zurückhalten
    b.daysLeft = (b.daysLeft == null ? b.term || 30 : b.daysLeft) - 1;
    if (b.daysLeft <= 0) { if (b.auto) b.daysLeft = b.term || 30; else b.ended = true; }
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
    const base = Math.round(t.price * city.price_factor * require('./cityecon').buildMult(city.id, year) * (0.85 + r() * 0.35));
    const names = chainNames(world, p.pkey);
    out.push({
      id: `biz:${city.id}:${week}:${i}`, type: 'biz', pkey: p.pkey, tier, tierName: names[tier], name: `${names[tier]} ${pick(r, LAST)}`, cityId: city.id,
      base, price: Math.round(base * idx), rooms: t.rooms, minLevel: t.minLevel, profession: p.name, icon: p.icon,
      qualified: qualification(world, state, p.pkey, tier).ok,
      comp: require('./competition').info(world, city.id, p.pkey, t.rooms),
    });
  }
  // Einstiegsstufen bleiben käuflich: Wer die höhere Stufe beherrscht, kann für die erste Sparte auch den kleineren Betrieb nehmen
  // (sonst wäre der Kleinbetrieb nach wenigen Berufsjahren nie mehr im Angebot und die Preisspirale nicht einzuholen).
  if (out.length) {
    const top = out[0]; const pk = top.pkey;
    for (let t = top.tier - 1; t >= 0; t--) {
      const tt = tiers[t]; const names = chainNames(world, pk);
      const base = Math.round(tt.price * city.price_factor * require('./cityecon').buildMult(city.id, year) * (0.85 + r() * 0.35));
      out.push({
        id: `biz:${city.id}:${week}:${10 + t}`, type: 'biz', pkey: pk, tier: t, tierName: names[t], name: `${names[t]} ${pick(r, LAST)}`, cityId: city.id,
        base, price: Math.round(base * idx), rooms: tt.rooms, minLevel: tt.minLevel, profession: top.profession, icon: top.icon,
        qualified: qualification(world, state, pk, t).ok, comp: require('./competition').info(world, city.id, pk, tt.rooms),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ Gründen (ohne Zeitungsangebot) ------------------------------------------------------------------ */
const NAME_MIN = 3; const NAME_MAX = 40;
/** Firmenname aus Spielereingabe: Steuer-/HTML-Zeichen weg, Leerraum bereinigt. Gibt '' zurück, wenn nichts Brauchbares bleibt. */
function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ').replace(/[<>&"'`\\{}[\]|^~]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}
const URLISH = /(https?:|ftp:|www\.|:\/\/|@|\b[a-z0-9-]+\.(com|de|net|org|info|io|ru|xyz|me|to|ly|gg|tk|cc|shop|site|online|app)\b)/i;
function validName(state, raw) {
  const n = cleanName(raw);
  if (n.length < NAME_MIN) return { ok: false, err: `Der Name ist zu kurz (mindestens ${NAME_MIN} Zeichen).` };
  if (!/[\p{L}\p{N}]{2,}/u.test(n)) return { ok: false, err: 'Der Name braucht mindestens ein richtiges Wort.' };
  if (URLISH.test(n)) return { ok: false, err: 'Der Name darf keine Internetadresse enthalten.' };
  if ((state.companies || []).some((c) => String(c.name).toLowerCase() === n.toLowerCase())) return { ok: false, err: 'Eine deiner Firmen heißt schon so. Wähle einen anderen Namen.' };
  return { ok: true, name: n };
}
function suggestName(world, state, pkey, tier) {
  const base = `${chainNames(world, pkey)[tier]} ${state.person.last || ''}`.trim().slice(0, NAME_MAX);
  for (let i = 1; i < 40; i++) {
    const cand = i === 1 ? base : `${base.slice(0, NAME_MAX - 4)} ${['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] || i}`;
    if (validName(state, cand).ok) return cand;
  }
  return base;
}
const foundPrice = (world, city, tier, idx, year) => { const base = Math.round(tiersOf(world)[tier].price * city.price_factor * require('./cityecon').buildMult(city.id, year)); return { base, price: Math.round(base * idx) }; };

/**
 * Marktlage vor Ort für eine Gründung: Nachfrage (Obergrenze der Stadt in Räumen) gegen vorhandene Betriebe dieser Art (Spieler und Bots),
 * dazu das Preisniveau des Sektors (Stadtwirtschaft). state: crowded (viel Konkurrenz) · busy · ok · free (kaum Konkurrenz).
 */
function localMarket(world, city, pkey, rooms, year) {
  const ce = require('./cityecon'); const c0 = require('./competition').info(world, city.id, pkey, 0);
  const sat0 = c0.total / c0.cap; const sat1 = (c0.total + rooms) / c0.cap;
  const sec = ce.sectorOfPkey(world, pkey);
  return {
    state: sat1 > 1.15 ? 'crowded' : sat0 < 0.35 ? 'free' : sat1 > 0.8 ? 'busy' : 'ok', firms: c0.firms, total: c0.total, cap: c0.cap, sat: Math.round(sat1 * 100) / 100,
    sector: sec, sectorName: sec ? ce.META[sec].name : null, level: sec ? Math.round(ce.level(city.id, sec, year) * 100) / 100 : 1,
  };
}

/** Berufe, aus denen man gründen darf (wie die Zeitung: kein Akademiker-/Helferberuf, nur mit Betriebsart, nur in der Epoche). */
function foundKeys(world, state, year) {
  const keys = new Set(state.skills.learned);
  if (state.partner && state.partner.pkey) keys.add(state.partner.pkey);
  return [...keys].map((k) => world.prof(k)).filter((p) => p && !p.academic && p.pkey !== 'helfer' && p.unlocks && p.era_from <= year && year <= p.era_to);
}

/**
 * Gründungsoptionen: für jede Betriebsart, die der Spieler führen darf, die Stufen mit Preis (fest, ohne Zufall).
 * Preis = Stufenpreis × Stadtfaktor × Preisindex. Eine Option je Beruf (höchste erlaubte Stufe) mit allen erlaubten Stufen darunter.
 */
function foundOptions(world, state) {
  const year = yearOf(state.day, state.startYear);
  const idx = world.idx(year);
  const city = world.city(state.cityId);
  const econ = world.econ.companies;
  const tiers = tiersOf(world);
  const goods = require('./goods');
  const count = (state.companies || []).length;
  const full = count >= econ.maxCompanies;
  const options = [];
  if (city) {
    for (const p of foundKeys(world, state, year)) {
      const lv = [];
      for (let t = 0; t < tiers.length; t++) {
        const q = qualification(world, state, p.pkey, t);
        if (!q.ok) continue;
        const { base, price } = foundPrice(world, city, t, idx, year);
        const rooms = tiers[t].rooms;
        const probe = { id: -1, pkey: p.pkey, tier: t, name: '', cityId: city.id, rooms, staff: staffNeeded(world, { rooms, tier: t }), manager: true, cash: 0, base, since: state.day, abandoned: null };
        let f = null; try { f = companyFlows(world, state, probe, year); } catch (_) { f = null; }
        const ar = goods.activeRecipe(world, p.pkey, year, city.id);
        lv.push({
          tier: t, tierName: chainNames(world, p.pkey)[t], suggest: suggestName(world, state, p.pkey, t), price, base, rooms, minLevel: tiers[t].minLevel, via: q.via,
          upkeep: Math.round((price * econ.upkeepYearPct) / 100 / 365), profit: f ? f.profit : null, income: f ? f.income : null, wages: f ? f.wages : null, inputsCost: f ? f.inputs : null, staff: probe.staff,
          inputs: ar.inputs.map((i) => ({ good: i.good, name: goods.good(i.good).name, icon: goods.good(i.good).icon })),
          outputs: ar.out.map((o) => ({ good: o.good, name: goods.good(o.good).name, service: !!goods.good(o.good).service })),
          affordable: state.money >= price, missing: Math.max(0, price - state.money), market: localMarket(world, city, p.pkey, rooms, year),
        });
      }
      if (!lv.length) continue;
      const top = lv[lv.length - 1];
      options.push({ pkey: p.pkey, profession: p.name, icon: p.icon, desc: p.description || '', tier: top.tier, tiers: lv, ...top, name: suggestName(world, state, p.pkey, top.tier) });
    }
  }
  options.sort((a, b) => a.price - b.price || a.profession.localeCompare(b.profession, 'de'));
  const cheapest = options.length ? Math.min(...options.map((o) => Math.min(...o.tiers.map((x) => x.price)))) : null;
  return { cityId: state.cityId, city: city ? city.name : null, count, max: econ.maxCompanies, full, options, cheapest, canAfford: cheapest != null && state.money >= cheapest, nameMin: NAME_MIN, nameMax: NAME_MAX };
}

/** Gründung prüfen (gleiche Regeln wie der Kauf aus der Zeitung); wirft nicht, sondern liefert { ok, err | c-Daten }. */
function checkFound(world, state, input) {
  const inp = input && typeof input === 'object' ? input : {};
  const pkey = typeof inp.pkey === 'string' ? inp.pkey : '';
  const tier = typeof inp.tier === 'number' || (typeof inp.tier === 'string' && /^\d$/.test(inp.tier)) ? Number(inp.tier) : NaN;
  if (!pkey || !Number.isInteger(tier) || tier < 0 || tier >= tiersOf(world).length) return { ok: false, err: 'Bitte wähle eine Betriebsart.' };
  const year = yearOf(state.day, state.startYear);
  const p = foundKeys(world, state, year).find((x) => x.pkey === pkey);
  if (!p) return { ok: false, err: 'Diese Betriebsart kannst du nicht gründen.' };
  const city = world.city(state.cityId);
  if (!city) return { ok: false, err: 'Du musst in einer Stadt wohnen.' };
  if ((state.companies || []).length >= world.econ.companies.maxCompanies) return { ok: false, err: 'Du besitzt bereits die maximale Anzahl an Unternehmen.' };
  if (!qualification(world, state, pkey, tier).ok) return { ok: false, err: 'Dir fehlt die Qualifikation für diesen Betrieb.' };
  const nm = inp.name == null || inp.name === '' ? { ok: true, name: suggestName(world, state, pkey, tier) } : validName(state, inp.name);
  if (!nm.ok) return nm;
  const { base, price } = foundPrice(world, city, tier, world.idx(year), year);
  if (state.money < price) return { ok: false, err: 'Dafür reicht dein Geld nicht.' };
  return { ok: true, pkey, tier, name: nm.name, city, base, price, rooms: tiersOf(world)[tier].rooms };
}

module.exports = { foundOptions, checkFound, cleanName, validName, suggestName, settleContracts, marketPhase, qualification, companyValue, companyFlows, staffNeeded, businessDaily, bizListings, tierName, chainNames, netBusinessValue, tiersOf, cityMult };
