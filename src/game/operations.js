'use strict';
/**
 * Betrieb 2.0: Ausbaumodule (Lager, Brandschutz, Schutz, Arbeitsplätze), Betriebsklima und Betriebsbrand.
 *
 * Spielstand (alles optional; fehlt es, gilt der neutrale Zustand – Altspielstände brauchen keine Umstellung):
 *   c.mods = { lager, brand, schutz, arbeit }   Stufen 0–3 (alter Schalter c.security === true gilt als Schutz Stufe 1)
 *   c.ops  = { stock, cd, fear, push, fire, hist }  Lagerbestand in Tagen, Abkühlzeiten, Abmahnungs-Druck, Brandzustand, letzte Vorfälle
 *   m.mood = 0–100 je Mitarbeiter des Betriebs (50 = neutral); Spieler als Angestellte (c.playerStaff) werden nie beeinflusst.
 *
 * Alle Wirkungen sind gedeckelt, laufen unter einem Regler (`betrieb.effects.strength`: 0 = aus, 1 = normal, 2 = doppelt) und sind um 50 mittelwertfrei:
 * Das Klima hebt oder senkt den Umsatz höchstens um 6 % und wird mit dem Talent-Faktor zusammen auf dieselbe Grenze (±15 %) gekappt – kein Doppelzählen.
 * Geld bewegt sich nur im Spielstand des Besitzers (Firmenkasse, Privatgeld) oder über die vorhandenen Warteschlangen (Bauaufträge → pending_credits).
 */
const settings = require('../settings');
const { rngFor, int } = require('./rng');
const { yearOf, dateOf } = require('./calendar');
const D = require('./operations-defaults');

const KEYS = ['lager', 'brand', 'schutz', 'arbeit'];
const num = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (x) => Math.round(x * 10) / 10 + 0;
const r2 = (x) => Math.round(x * 100) / 100 + 0;
const norm = (v) => clamp((num(v, 50) - 50) / 50, -1, 1);
const C = () => settings.get('betrieb') || D;
const enabled = () => C().enabled !== false;
const E = () => (C().effects || D.effects);
const strength = () => (enabled() ? clamp(num(E().strength, 1), 0, 2) : 0);
const K = () => ({ ...D.climate, ...(C().climate || {}) });
const LEAD = () => ({ ...D.lead, ...(C().lead || {}) });
const MOD = (key) => { const m = (C().modules || {})[key]; return m && Array.isArray(m.levels) && m.levels.length === 3 ? m : D.modules[key]; };
const LV = (key, lv) => (lv >= 1 && lv <= 3 ? MOD(key).levels[lv - 1] : null);
/** Wirkung zwischen „keine“ (Faktor 1) und dem Stufenwert, skaliert mit dem Regler (nie unter 0,05). */
const scaleMult = (m) => clamp(1 + (num(m, 1) - 1) * strength(), 0.05, 3);

/* ------------------------------------------------------------------ Stufen ------------------------------------------------------------------ */
/** Stufe 0–3 eines Moduls. Der alte Schalter `security` zählt als Schutz Stufe 1. */
function level(c, key) {
  if (!c) return 0;
  const v = c.mods && c.mods[key] != null ? Math.floor(num(c.mods[key], 0)) : (key === 'schutz' && c.security ? 1 : 0);
  return clamp(v, 0, 3);
}
function setLevel(c, key, lv) {
  if (!c.mods || typeof c.mods !== 'object') c.mods = {};
  c.mods[key] = clamp(Math.floor(lv), 0, 3);
  c.security = (num(c.mods.schutz, 0)) >= 1; // alter Schalter bleibt für Wettbewerb und Anzeige im Takt (immer gesetzt, damit upgradeState nichts mehr ändert)
  return c.mods[key];
}
/** Altspielstände: Schalter → Stufe (idempotent). */
function normalize(c) {
  if (!c || typeof c !== 'object') return c;
  if (c.mods && typeof c.mods === 'object') { for (const k of KEYS) if (c.mods[k] != null) c.mods[k] = clamp(Math.floor(num(c.mods[k], 0)), 0, 3); } else if (c.security) c.mods = { schutz: 1 };
  if (c.mods && c.mods.schutz == null && c.security) c.mods.schutz = 1;
  if (c.mods) c.security = (c.mods.schutz || 0) >= 1;
  return c;
}
const ops = (c) => { if (!c.ops || typeof c.ops !== 'object') c.ops = {}; return c.ops; };
const eraOk = (key, lv, year) => { const L = LV(key, lv); return !!L && year >= num(L.from, 1945); };
const levelName = (key, lv) => (LV(key, lv) || {}).name || '';

/** Kosten (Cent heutiger Preise) einer Stufe: Prozent vom Grundwert des Betriebs × Preisindex × Baupreise der Stadt (Stadtwirtschaft). */
function moduleCost(world, state, c, key, lv, year) {
  const L = LV(key, lv); if (!L) return 0;
  const idx = world.idx(year); const bm = require('./cityecon').buildMult(c.cityId, year);
  return Math.max(1, Math.round(num(c.base, 0) * idx * (num(L.costPct, 0) / 100) * bm));
}
/** Aufpreis beim Ausbau von Stufe lv−1 auf lv (die alte Stufe wird angerechnet). */
function upgradeCost(world, state, c, key, lv, year) {
  return Math.max(1, moduleCost(world, state, c, key, lv, year) - (lv > 1 ? moduleCost(world, state, c, key, lv - 1, year) : 0));
}
/** Tagesunterhalt (Cent) aller Module eines Betriebs. */
function upkeepDay(world, state, c, year) {
  if (!enabled() || !c || c.abandoned) return 0;
  let u = 0;
  for (const key of KEYS) {
    const lv = level(c, key); if (!lv) continue;
    const M = MOD(key);
    if (key === 'schutz') {
      const t = require('./business').tiersOf(world)[c.tier]; const idx = world.idx(year);
      const pct = (M.upkeepRevPct || D.modules.schutz.upkeepRevPct)[lv - 1];
      u += Math.round(c.rooms * t.incomePerRoom * idx * num(pct, 0) / 100);
    } else u += Math.round(moduleCost(world, state, c, key, lv, year) * num(M.upkeepPct, 3) / 100 / 365);
  }
  return u;
}

/** Höchste Personalzahl: Bedarf + 2 + Zusatzstellen durch Arbeitsplätze. */
function maxStaff(world, c) {
  const ar = LV('arbeit', level(c, 'arbeit'));
  return require('./business').staffNeeded(world, c) + 2 + (ar && enabled() ? num(ar.slots, 0) : 0);
}

/* ------------------------------------------------------------------ Lager ------------------------------------------------------------------ */
const lagerCap = (c) => { const L = LV('lager', level(c, 'lager')); return L && enabled() ? num(L.days, 0) : 0; };
const stockOf = (c) => clamp(num(c.ops && c.ops.stock, 0), 0, lagerCap(c));

/**
 * Lagerplan eines Tages (rein). buy = Ergebnis von goods.buyPlan, w = goods.W().
 * Fehlt etwas (Lieferausfall), deckt der Bestand die Lücke. Sonst wird im günstigen Preisfenster aufgefüllt und im teuren Fenster verbraucht
 * (Kosteneffekt höchstens ±priceWindowPct der Zutatenkosten); in normalen Zeiten füllt der Betrieb langsam nach.
 * Rückgabe: factor (statt buy.factor), cost (statt buy.cost), d (Änderung des Bestands in Tagen), use/fill (Anzeige), saved/spent (Cent).
 */
function lagerPlan(c, buy, w) {
  const base = { on: false, cap: 0, days: 0, factor: buy.factor, cost: buy.cost, d: 0, saved: 0, spent: 0, cover: 0, window: 'none', scar: 1 };
  const cap = lagerCap(c);
  if (!cap || !buy.needs || !buy.needs.length || strength() <= 0) return base;
  const days = stockOf(c);
  let sw = 0; let ss = 0;
  for (const n of buy.needs) { sw += n.share; ss += n.share * (n.scar || 1); }
  const scar = sw > 0 ? ss / sw : 1;
  const out = { ...base, on: true, cap, days, scar: r2(scar) };
  const costW = Math.max(0, buy.costWholesale || 0);
  if (buy.ratio < 0.999) { // Lücke in der Versorgung: Vorrat springt ein
    const cover = Math.min(1 - buy.ratio, days);
    if (cover > 0) { out.cover = cover; out.d = -cover; out.factor = w.floor + (1 - w.floor) * Math.min(1, buy.ratio + cover); out.window = 'cover'; }
    return out;
  }
  const cap3 = num(E().priceWindowPct, 3) / 100 * strength();
  if (scar >= 1.06 && days > 0 && costW > 0) { // teures Fenster: Vorrat verbrauchen statt teuer kaufen
    const use = Math.min(days, 0.5, (cap3 * buy.cost) / costW);
    out.d = -use; out.saved = Math.round(use * costW); out.cost = Math.max(0, buy.cost - out.saved); out.window = 'use';
  } else if (days < cap && costW > 0) { // günstiges Fenster: kräftig, sonst langsam auffüllen
    const cheap = scar <= 0.97;
    const b = Math.min(cap - days, cheap ? 0.5 : 0.25);
    if (b > 0) { out.d = b; out.spent = Math.round(b * costW); out.cost = buy.cost + out.spent; out.window = cheap ? 'buy' : 'fill'; }
  }
  return out;
}

/* ------------------------------------------------------------------ Klima ------------------------------------------------------------------ */
const moodOf = (m) => clamp(num(m && m.mood, K().start), 0, 100);
const members = (c) => (c && Array.isArray(c.team) ? c.team : []);
/** Durchschnittliche Stimmung der Belegschaft (null ohne Mitarbeiter). */
function avgMood(c) {
  const t = members(c); if (!t.length) return null;
  return t.reduce((s, m) => s + moodOf(m), 0) / t.length;
}
const bandOf = (v) => (v == null ? 'none' : v >= 75 ? 'great' : v >= 60 ? 'good' : v >= 42 ? 'ok' : v >= 25 ? 'low' : 'bad');
const BAND_NAME = { none: 'Keine Mitarbeiter', great: 'Ausgezeichnet', good: 'Gut', ok: 'Normal', low: 'Angespannt', bad: 'Schlecht' };

/** Wirkungen des Betriebs auf Tagesrechnung (rein, ohne Nebenwirkung). */
function firmEffects(c, needed, day) {
  const out = { avg: null, band: 'none', climateMult: 1, capMult: 1, sickMult: 1, extra: 0, slots: 0, pushMult: 1 };
  if (!enabled() || !c) return out;
  const avg = avgMood(c);
  out.avg = avg == null ? null : r1(avg);
  out.band = bandOf(avg);
  const s = strength();
  if (avg != null && s > 0) out.climateMult = r2(1 + clamp(num(E().climatePct, 6) / 100 * s, 0, 0.12) * norm(avg) * 1);
  const ar = LV('arbeit', level(c, 'arbeit'));
  out.slots = ar ? num(ar.slots, 0) : 0;
  if (ar && s > 0) out.sickMult = scaleMult(ar.sickMult);
  const heads = Math.max(0, Math.floor(num(c.staff, 0)));
  out.extra = Math.min(out.slots, Math.max(0, heads - needed));
  if (out.extra > 0 && s > 0) {
    const list = Array.isArray(E().extraHeadPct) ? E().extraHeadPct : D.effects.extraHeadPct;
    let cap = 0; for (let i = 0; i < out.extra; i++) cap += num(list[i], 0);
    out.capMult = r2(1 + (cap / 100) * s);
  }
  const pu = c.ops && c.ops.push;
  if (pu && day != null && pu.until > day && s > 0) out.pushMult = r2(1 + num(pu.pct, 0) / 100 * s);
  return out;
}
/** Umsatzfaktor: Talent-Faktor × Klima, gemeinsam auf die Talentgrenze (±15 %) gekappt, dazu die Zusatzstellen. */
function revFactor(tfxRev, ox) {
  return clamp(num(tfxRev, 1) * ox.climateMult, 0.85, 1.15) * ox.capMult * ox.pushMult;
}
/** Krankenausfall (Seuche) mit Arbeitsschutz: sfx.eff liegt nahe 1, der Verlust wird kleiner. */
const sickEff = (eff, ox) => (ox.sickMult === 1 ? eff : 1 - (1 - eff) * ox.sickMult);

/** Zielwert der Stimmung eines Mitarbeiters (rein). cx = { staffRatio, sickEff, lead, day }. */
function moodTarget(world, state, c, m, cx) {
  const Kc = K(); let t = Kc.start;
  const TL = require('./talents');
  if (!m.lehr) t += clamp((num(m.w, 1) / Math.max(0.2, TL.marketWage(world, c, m)) - 1) * Kc.wageFair, -15, 8);
  t -= Kc.understaffed * (1 - clamp(cx.staffRatio, 0, 1));
  const ar = LV('arbeit', level(c, 'arbeit')); if (ar) t += num(ar.mood, 0) * Math.min(1, strength());
  t -= Kc.sick * clamp(1 - cx.sickEff, 0, 1) * 4;
  t += Kc.leadPts * norm(cx.lead);
  t -= fearPts(c, state.day);
  if (c.strikeUntil && state.day <= c.strikeUntil + 14) t -= Kc.strikeAfter;
  if (c.manager || c.playerManager) t = Math.max(t, Kc.start); // Autopilot: ein Manager hält das Klima mindestens auf neutralem Niveau
  return clamp(t, 0, 100);
}
function fearPts(c, day) {
  const f = (c.ops && Array.isArray(c.ops.fear) ? c.ops.fear : []).filter((u) => u > day);
  return Math.min(3, f.length) * K().fearPts;
}

/* ------------------------------------------------------------------ Brand ------------------------------------------------------------------ */
function riskOf(world, c) {
  const p = world && world.prof ? world.prof(c.pkey) : null;
  const R = { ...D.fire.risk, ...((C().fire || {}).risk || {}) };
  return num(R[(p && p.category) || ''], 1);
}
/** Brandrisiko je Jahr in Prozent (Anzeige) und je Woche (Würfel). */
function fireRisk(world, state, c, doy) {
  const F = { ...D.fire, ...(C().fire || {}) };
  const winter = doy != null && (doy < 59 || doy >= 334) ? 1 + num(F.winterPct, 25) / 100 : 1;
  const B = LV('brand', level(c, 'brand'));
  const pm = B ? scaleMult(B.pMult) : 1;
  const weekly = clamp(num(F.weeklyChance, 0.0005) * riskOf(world, c) * winter * pm, 0, 0.2);
  const yearly = clamp(num(F.weeklyChance, 0.0005) * riskOf(world, c) * pm * 52, 0, 1);
  return { weekly, yearly: r2(yearly * 100), dmgMult: B ? scaleMult(B.dmgMult) : 1, outMult: B ? scaleMult(B.outMult) : 1 };
}
const insured = (state) => !!(state.insurance && state.insurance.betrieb);
/** Rabatt auf die Betriebsversicherung durch Brandschutz und Schutz (Faktor 0,5–1). */
function premiumFactor(c) {
  const b = LV('brand', level(c, 'brand')); const s = LV('schutz', level(c, 'schutz'));
  return clamp(1 - (num(b && b.premDisc, 0) + num(s && s.premDisc, 0)) / 100 * Math.min(1, strength()), 0.5, 1);
}
/** Tagesprämie (Cent) der Betriebsversicherung für alle aktiven Betriebe. */
function premiumDay(world, state, year) {
  const rate = num(((world.econ.insurance || {}).betrieb || {}).yearPctOfCompanies, 0.2);
  const biz = require('./business');
  let v = 0;
  for (const c of state.companies || []) if (!c.abandoned) v += biz.companyValue(world, state, c, year) * premiumFactor(c);
  return Math.round((v * rate) / 100 / 365);
}

/* ------------------------------------------------------------------ Ereignisse und Tageslauf ------------------------------------------------------------------ */
const fmtD = (cents, cur) => require('./economy').formatMoney(cents, cur);
const histPush = (c, e) => { const h = ops(c).hist || (ops(c).hist = []); h.unshift(e); if (h.length > 10) h.length = 10; };
/** Vorfall für die Datenbank vormerken (Protokoll, Tagesblatt); service.withCharacter schreibt ihn einmalig (src/lib/operations.js). */
function queueLog(state, e) {
  const q = state.pending.ops || (state.pending.ops = []);
  if (q.length < 20) q.push(e);
}

/**
 * Wochenereignisse eines Betriebs (nach den Zufallsereignissen der Betriebe, nie offline und nicht im Anfängerschutz):
 * Betriebsbrand, Kündigungsneigung bei schlechter Stimmung, Streikdrohung bei schlechter Stimmung.
 */
function weekly(ctx, c, year) {
  const { world, state } = ctx;
  if (!enabled() || ctx.offline || !c || c.abandoned) return;
  if (state.day % 7 !== c.id % 7) return;
  if (state.day < num(settings.get('game.newbie_protect_days'), 90)) return;
  const week = Math.floor(state.day / 7);
  const doy = dateOf(state.day, state.startYear).doy;
  // ---- Brand
  const rk = fireRisk(world, state, c, doy);
  if (strength() > 0 && !(c.outageUntil && state.day < c.outageUntil) && rngFor('opsfire', state.seed || 0, c.id, week)() < rk.weekly) fire(ctx, c, year, rk);
  // ---- Klima: Kündigungsneigung und Streik
  const Kc = K(); const r = rngFor('opsmood', state.seed || 0, c.id, week);
  const ox = firmEffects(c, require('./business').staffNeeded(world, c), state.day);
  for (const m of members(c)) {
    if (m.ask || m.lehr) { r(); continue; }
    const md = moodOf(m);
    const roll = r();
    if (md < Kc.quitBelow && roll < Kc.quitWeekly * (Kc.quitBelow - md) / Math.max(1, Kc.quitBelow)) {
      const TL = require('./talents'); const askDays = Math.round(num((TL.C().raise || {}).askDays, 30));
      const w = Math.max(num(m.w, 1) * 1.05, TL.marketWage(world, c, m));
      m.ask = { w: r2(w), until: state.day + askDays, mood: true };
      require('./core').notice(state, { level: 'warn', title: `${m.name} denkt an Kündigung`, tab: 'business', text: `${c.name}: ${m.name} denkt ans Kündigen. Du hast ${askDays} Tage, um die Stimmung zu heben – ein Lob, eine Prämie oder mehr Lohn helfen.`, info: ['Die Stimmung im Team ist niedrig.', 'Wer sich nicht wertgeschätzt fühlt, sucht sich eine neue Stelle.', 'Öffne das Team und wähle Lob, Prämie oder Lohnerhöhung.'] });
    }
  }
  if (ox.avg != null && ox.avg < Kc.strikeBelow && c.staff >= num(((world.econ.events || {}).business || {}).strikeMinStaff, 3) && !(c.strikeUntil && state.day < c.strikeUntil)) {
    const rs = rngFor('opsstrike', state.seed || 0, c.id, week)();
    if (rs < Kc.strikeWeekly * (Kc.strikeBelow - ox.avg) / Math.max(1, Kc.strikeBelow) * 2) strikeStart(ctx, c, rngFor('opsstrikelen', state.seed || 0, c.id, week));
  }
}

function strikeStart(ctx, c, r) {
  const { world, state } = ctx; const B = { ...require('./event-defaults').business, ...((world.econ.events && world.econ.events.business) || {}) };
  c.strikeUntil = state.day + int(r, B.strikeMinDays, B.strikeMaxDays);
  require('./core').notice(state, { level: 'warn', title: `Streik bei ${c.name}`, tab: 'business', text: 'Die Belegschaft legt die Arbeit nieder, weil die Stimmung am Boden ist. Während des Streiks gibt es keinen Umsatz.', info: ['Ein niedriges Betriebsklima kann zum Streik führen.', 'Löhne und Unterhalt laufen weiter.', 'Faire Löhne, Lob und eine Prämie heben die Stimmung wieder.'] });
}

/** Betriebsbrand: Schaden, Ausfall, Lagerverlust; Brandschutz mindert, die Betriebsversicherung zahlt. Löst nie die Insolvenz aus (Deckel auf eigene Mittel). */
function fire(ctx, c, year, rk) {
  const { world, state } = ctx; const biz = require('./business'); const core = require('./core'); const press = require('./press');
  const F = { ...D.fire, ...(C().fire || {}) }; const I = { ...D.insurance, ...(C().insurance || {}) };
  const r = rngFor('opsfire2', state.seed || 0, c.id, Math.floor(state.day / 7));
  const cur = world.currency(year);
  const value = biz.companyValue(world, state, c, year);
  let damage = Math.round(value * num(F.damagePct, 10) / 100 * rk.dmgMult);
  let out = Math.max(1, Math.round(int(r, num(F.outage[0], 10), num(F.outage[1], 24)) * rk.outMult));
  const ins = insured(state);
  if (ins) out = Math.max(1, Math.round(out * (1 - num(I.outageCutPct, 35) / 100)));
  const stock = stockOf(c); const lost = Math.round(stock * num(F.stockLossPct, 50) / 100 * 100) / 100;
  if (lost > 0) ops(c).stock = Math.max(0, stock - lost);
  // Wer zahlt? Versicherung übernimmt den vereinbarten Anteil; der Rest kommt aus Firmenkasse und Privatgeld (nie mehr als der Deckel)
  const covered = ins ? Math.round(damage * num(I.paidPct, 90) / 100) : 0;
  let own = damage - covered;
  const reach = Math.max(0, num(c.cash, 0)) + Math.floor(Math.max(0, state.money) * num(F.ownerCapPct, 50) / 100);
  let short = 0;
  if (own > reach) { short = own - reach; own = reach; }
  const fromCash = Math.min(Math.max(0, num(c.cash, 0)), own); c.cash -= fromCash;
  const fromOwner = own - fromCash; state.money -= fromOwner; state.stats.spent += fromOwner;
  if (short > 0) out += Math.ceil(out * 0.5 * Math.min(1, short / Math.max(1, damage))); // Notreparatur: es dauert länger
  const interruption = ins ? Math.round(Math.max(0, num(c.lastProfit, 0)) * out * num(I.interruptionPct, 60) / 100) : 0;
  if (interruption > 0) c.cash += interruption;
  c.outageUntil = Math.max(num(c.outageUntil, 0), state.day + out);
  const o = ops(c); o.fire = { day: state.day, until: c.outageUntil };
  for (const m of members(c)) m.mood = clamp(moodOf(m) - num(F.moodHit, 6), 0, 100);
  histPush(c, { d: state.day, k: 'fire', amt: damage, ins: ins ? 1 : 0 });
  const idx = Math.max(0.0001, world.idx(year));
  queueLog(state, { k: 'fire', c: c.id, city: c.cityId, name: c.name, real: Math.round(damage / idx), ins: ins ? 1 : 0, days: out });
  // Wiederaufbau: die Rechnung geht an eine Baufirma der Stadt (Spieler oder Bot), sonst an den städtischen Handwerksbetrieb
  const paid = fromCash + fromOwner + covered;
  if (paid > 0) { try { require('./contractors').order(state, null, world, c.cityId, paid, `Wiederaufbau ${c.name}`); } catch (_) { /* optional */ } }
  const cn = (world.city(c.cityId) || {}).name || '';
  core.chronicle(state, `Brand in ${c.name} (${cn}).`, 'event');
  press.story(world, state, 'fire', { prop: c.name, cityId: c.cityId });
  const dmgTxt = fmtD(damage, cur); const covTxt = fmtD(covered, cur); const compTxt = fmtD(interruption, cur);
  const info = ['In deinem Betrieb hat es gebrannt.', ins ? 'Die Betriebsversicherung trägt den größten Teil, der Betrieb ruht trotzdem einige Tage.' : 'Ohne Betriebsversicherung trägst du Schaden und Ausfall selbst.', 'Brandschutz senkt Wahrscheinlichkeit und Schaden; die Betriebsversicherung schließt du im Haushalt ab.'];
  if (lost > 0) info.push('Ein Teil des Lagers ist verbrannt.');
  if (ins && interruption > 0) info.push(`Für den Ausfall gibt es ${compTxt} Entschädigung.`);
  core.notice(state, {
    level: 'bad', title: `Brand in ${c.name}`, tab: 'business', interrupt: true,
    text: ins ? `Die Betriebsversicherung übernimmt ${covTxt} des Schadens. Der Betrieb steht etwa ${out} Tage still.` : `Der Schaden von ${dmgTxt} geht zu deinen Lasten. Der Betrieb steht etwa ${out} Tage still.`,
    info,
  });
}

/** Diebstahl im Betrieb (aus den Zufallsereignissen): Schutz kann ihn abwehren; sonst trifft er auch das Lager. Gibt { repelled, extra } zurück. */
function theft(ctx, c) {
  const { state } = ctx; const lv = level(c, 'schutz'); const out = { repelled: false, extra: 0 };
  if (!enabled() || !lv) { return out; }
  const L = LV('schutz', lv);
  const roll = rngFor('opstheft', state.seed || 0, c.id, Math.floor(state.day / 7))();
  if (roll < clamp(num(L.repel, 0) / 100 * Math.min(1, strength()), 0, 0.95)) { out.repelled = true; return out; }
  return out;
}
/** Zusätzlicher Lagerverlust bei Diebstahl (ohne Abwehr): Anteil am Bestand; liefert die verlorenen Tage. */
function theftStock(c) {
  const st = stockOf(c); if (st <= 0) return 0;
  const lost = Math.round(st * num((C().theft || D.theft).stockLossPct, 10) / 100 * 100) / 100;
  ops(c).stock = Math.max(0, st - lost);
  return lost;
}
/** Abwehr im Wettbewerb: Faktor auf Abwehr- und Entdeckungschance des Schutzes (Stufe 1 = 1, ohne Schutz 0). */
function rivalMult(c) {
  const L = LV('schutz', level(c, 'schutz')); if (!L || !enabled()) return level(c, 'schutz') ? 1 : 0;
  return scaleMult(L.rival);
}
/** Streikdrohung wird bei guter Stimmung abgewendet: false = der Streik findet nicht statt. */
function strikeHolds(c, state) {
  if (!enabled() || strength() <= 0) return true;
  const avg = avgMood(c); if (avg == null || avg <= K().start) return true;
  const keep = clamp(1 - 0.9 * norm(avg), 0.1, 1);
  return rngFor('opsstrikeok', state.seed || 0, c.id, Math.floor(state.day / 7))() < keep;
}

/**
 * Täglich je Betrieb (nach companyFlows): Stimmung folgt dem Zielwert, Lagerbestand, Abmahnungsdruck, Ansehen als fairer Arbeitgeber.
 * f = Ergebnis von companyFlows (sfx, lager). Verändert nur den Spielstand.
 */
function daily(ctx, c, f) {
  const { world, state } = ctx;
  if (!c || c.abandoned) return;
  const o = c.ops && typeof c.ops === 'object' ? c.ops : null;
  if (o) {
    if (Array.isArray(o.fear)) { o.fear = o.fear.filter((u) => u > state.day); if (!o.fear.length) delete o.fear; }
    if (o.push && o.push.until <= state.day) delete o.push;
  }
  if (!enabled()) return;
  if (f && f.lager && f.lager.on && f.lager.d) ops(c).stock = clamp(r2(stockOf(c) + f.lager.d), 0, lagerCap(c));
  else if (o && o.stock != null && !lagerCap(c)) o.stock = 0;
  const team = members(c); if (!team.length) return;
  const biz = require('./business'); const TL = require('./talents');
  const needed = biz.staffNeeded(world, c); const Kc = K();
  const cx = { staffRatio: needed > 0 ? (c.staff || 0) / needed : 1, sickEff: f && f.sfx ? f.sfx.eff : 1, lead: TL.teamQuality(world, state, c).lead };
  for (const m of team) {
    const t = moodTarget(world, state, c, m, cx);
    const cur = moodOf(m);
    m.mood = r2(clamp(cur + (t - cur) * clamp(num(Kc.relax, 0.03), 0.005, 0.3), 0, 100));
  }
  for (const m of team) { // aus Unmut entstandene Kündigungsabsicht verfliegt, sobald die Stimmung wieder gut ist
    if (m.ask && m.ask.mood && moodOf(m) >= Kc.quitBelow + 15) {
      m.ask = null;
      require('./core').notice(state, { level: 'good', title: `${m.name} bleibt`, tab: 'business', text: `${c.name}: ${m.name} fühlt sich wieder wohl und denkt nicht mehr ans Kündigen.` });
    }
  }
  const avg = avgMood(c);
  const rep = require('./reputation');
  if (avg != null && c.staff >= 2) {
    if (avg >= Kc.fairFrom) rep.queue(state, 'civic', null, 'staff_fair', `c${c.id}`);
    else if (avg < Kc.pressureBelow && fearPts(c, state.day) > 0) rep.queue(state, 'scandal', null, 'staff_pressure', `c${c.id}`);
  }
}

/* ------------------------------------------------------------------ Führungsaktionen (reine Rechnung) ------------------------------------------------------------------ */
/** Bump der Stimmung: kleiner bei guter, größer bei schlechter Stimmung (nie über 100). Gibt die tatsächliche Änderung zurück. */
function bump(m, pts) {
  const cur = moodOf(m);
  const f = clamp(2 * (1 - cur / 100), 0.2, 1.6);
  const next = clamp(cur + pts * f * Math.min(1.5, Math.max(0.2, strength())), 0, 100);
  m.mood = r2(next);
  return r2(next - cur);
}
const wageDay = (world, year) => world.econ.companies.staffWage * world.idx(year);
/** Lohnforderungen kommen bei guter Stimmung später, bei schlechter früher (Punkte auf die Schwelle der Marktlohn-Differenz). */
function askAdj(m) {
  if (!enabled() || strength() <= 0) return 0;
  return r2(num(K().askMarginPts, 0.04) * norm(moodOf(m)) * Math.min(1, strength()));
}
/** Nach einer Entlassung: das Team ist verunsichert (einmalig). */
function afterDismiss(c) {
  if (!enabled() || strength() <= 0) return;
  for (const x of members(c)) x.mood = r2(clamp(moodOf(x) - num(LEAD().fireMood, 4), 0, 100));
}
/** Wirkung der Führungsfähigkeit der Spielfigur (Führung und Charme): 0,8–1,2. */
function leadSkill(state) {
  const TL = require('./talents'); const p = state.talents; if (!p) return 1;
  return clamp(1 + 0.4 * norm((TL.val(p, 'fuehrung') + TL.val(p, 'charme')) / 2) * Math.min(1, strength()), 0.8, 1.2);
}

/* ------------------------------------------------------------------ Anzeige ------------------------------------------------------------------ */
function modulesView(world, state, c, year) {
  const idx = world.idx(year); const ar = require('./goods').activeRecipe(world, c.pkey, year, c.cityId);
  const takes = ar && ar.inputs && ar.inputs.length > 0;
  const out = {};
  for (const key of KEYS) {
    const M = MOD(key); const lv = level(c, key); const cur = LV(key, lv);
    const nl = lv + 1; const L = lv < 3 ? LV(key, nl) : null;
    let why = null;
    if (!enabled()) why = 'off';
    else if (c.abandoned) why = 'abandoned';
    else if (key === 'lager' && !takes) why = 'noinputs';
    else if (L && !eraOk(key, nl, year)) why = 'era';
    const next = L ? {
      lv: nl, name: L.name, text: L.text, from: L.from, cost: upgradeCost(world, state, c, key, nl, year), why, ok: !why && state.money >= upgradeCost(world, state, c, key, nl, year),
      upkeep: upkeepAfter(world, state, c, key, nl, year) - upkeepAfter(world, state, c, key, lv, year),
    } : null;
    out[key] = {
      key, name: M.name, icon: M.icon, what: M.what, lv, max: 3, cur: cur ? { name: cur.name, text: cur.text } : null, next, upkeep: upkeepAfter(world, state, c, key, lv, year),
      levels: MOD(key).levels.map((x, i) => ({ lv: i + 1, name: x.name, text: x.text, from: x.from, eraOk: year >= num(x.from, 1945) })),
    };
  }
  void idx;
  return out;
}
function upkeepAfter(world, state, c, key, lv, year) {
  if (!lv) return 0;
  const M = MOD(key);
  if (key === 'schutz') { const t = require('./business').tiersOf(world)[c.tier]; return Math.round(c.rooms * t.incomePerRoom * world.idx(year) * num((M.upkeepRevPct || D.modules.schutz.upkeepRevPct)[lv - 1], 0) / 100); }
  return Math.round(moduleCost(world, state, c, key, lv, year) * num(M.upkeepPct, 3) / 100 / 365);
}

/** Alles, was die Oberfläche für einen Betrieb braucht. f = companyFlows. */
function firmView(world, state, c, idx, year, f) {
  const TL = require('./talents'); const biz = require('./business');
  const needed = (f && f.needed) || biz.staffNeeded(world, c);
  const ox = firmEffects(c, needed, state.day); const L = LEAD(); const cur = world.currency(year);
  const doy = dateOf(state.day, state.startYear).doy;
  const rk = fireRisk(world, state, c, doy);
  const wd = Math.round(wageDay(world, year));
  const team = members(c);
  const cd = (key) => Math.max(0, num((c.ops && c.ops.cd || {})[key], 0) - state.day);
  const mcdMin = (key) => (team.length ? Math.min(...team.map((m) => Math.max(0, num(m.mcd && m.mcd[key], 0) - state.day))) : 0); // Wartezeit je Mitarbeiter: der Knopf gilt, solange irgendjemand infrage kommt
  const dec = (cents, d) => Math.round(cents * d);
  const lock = enabled() && !c.abandoned;
  const christmas = doy >= 334 || doy < 3;
  const lagerL = f && f.lager ? f.lager : null;
  const stock = lagerCap(c) ? { days: r1(stockOf(c)), cap: lagerCap(c), window: lagerL ? lagerL.window : 'none', scar: lagerL ? lagerL.scar : 1, saved: lagerL ? lagerL.saved : 0 } : null;
  const member = (m) => ({ id: m.id, mood: Math.round(moodOf(m)), band: bandOf(moodOf(m)), praiseCd: Math.max(0, num(m.mcd && m.mcd.praise, 0) - state.day), giftCd: Math.max(0, num(m.mcd && m.mcd.gift, 0) - state.day), bonusCd: Math.max(0, num(m.mcd && m.mcd.bonus, 0) - state.day), warnCd: Math.max(0, num(m.mcd && m.mcd.warn, 0) - state.day) });
  return {
    on: enabled(), strength: strength(),
    modules: modulesView(world, state, c, year), stock,
    climate: { avg: ox.avg, band: ox.band, name: BAND_NAME[ox.band], effectPct: r1((ox.climateMult - 1) * 100), capPct: r1((ox.capMult - 1) * 100), maxPct: r1(num(E().climatePct, 6) * strength()), members: team.map(member), fear: fearPts(c, state.day), auto: !!(c.manager || c.playerManager), sickPct: Math.round((1 - ox.sickMult) * 100) },
    slots: ox.slots, extra: ox.extra, maxStaff: needed + 2 + ox.slots,
    fire: { yearPct: rk.yearly, band: rk.yearly >= 3 ? 'high' : rk.yearly >= 1.2 ? 'mid' : 'low', insured: insured(state), outage: c.outageUntil && state.day < c.outageUntil && c.ops && c.ops.fire ? c.outageUntil - state.day : 0 },
    insurance: { on: insured(state), premiumDay: Math.round(premiumDay(world, { ...state, companies: [c] }, year)), disc: Math.round((1 - premiumFactor(c)) * 100) },
    actions: lock ? {
      praise: { ok: team.some((m) => Math.max(0, num(m.mcd && m.mcd.praise, 0) - state.day) <= 0 && moodOf(m) < 95), cd: mcdMin('praise'), cooldown: L.praise.cooldown },
      bonus: { cost: dec(wd, L.bonus.costDays) * 1, perHead: dec(wd, L.bonus.costDays), cd: mcdMin('bonus'), gain: L.bonus.gain, cooldown: L.bonus.cooldown },
      party: { cost: dec(wd, L.party.baseDays + L.party.costDays * team.length), cd: cd('party'), gain: L.party.gain * (christmas ? L.party.christmas : 1), christmas, cooldown: L.party.cooldown },
      gift: { cost: dec(wd, L.gift.costDays), cd: 0, gain: L.gift.gain, cooldown: L.gift.cooldown },
      warn: { loss: L.warn.loss, others: L.warn.others, cooldown: L.warn.cooldown },
    } : null,
    hist: ((c.ops && c.ops.hist) || []).map((h) => ({ d: h.d, k: h.k, amt: h.amt, ins: h.ins })),
    wageDay: wd, currency: cur,
  };
}

module.exports = {
  KEYS, C, D, enabled, strength, level, setLevel, normalize, ops, eraOk, levelName, LV, MOD, moduleCost, upgradeCost, upkeepDay, lagerCap, stockOf, lagerPlan,
  moodOf, avgMood, bandOf, BAND_NAME, firmEffects, revFactor, sickEff, moodTarget, fearPts, fireRisk, insured, premiumFactor, premiumDay, weekly, fire, theft, theftStock, rivalMult, strikeHolds, daily,
  bump, wageDay, leadSkill, askAdj, afterDismiss, maxStaff, firmView, modulesView, histPush, queueLog, LEAD, K, norm, clamp, r2, num,
};
