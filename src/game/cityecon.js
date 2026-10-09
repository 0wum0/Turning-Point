'use strict';
/**
 * Stadtwirtschaft: Preisindizes je Stadt und Sektor (Lebensmittel, Wohnen & Miete, Dienstleistungen & Gastro, Baukosten, Löhne).
 *
 * Aufbau eines Indexes (alle Werte sind Faktoren, 1 = Durchschnitt, immer zwischen `min` und `max` der Einstellungen):
 *   Stufe(Stadt, Sektor, Jahr) = Dynamik(Stadt, Sektor) × Epoche(Stadt, Sektor, Jahr)
 *   - Dynamik: echtzeitlich und für alle Spieler gleich. Sie nähert sich einem Gleichgewicht aus Nachfrage und Angebot an
 *     (Zielwert = (Nachfrage / Angebot)^Stärke, dazu Politik und kleines deterministisches Rauschen). Nachfrage = Grundlast der Stadt
 *     plus lebende Charaktere, Angebot = Grundlast (NPC) plus Räume der Spieler- und Bot-Betriebe. Nur Städte mit Aktivität bekommen
 *     eine Zeile (src/lib/cityecon.js, Tabelle city_economy); alle anderen haben Dynamik 1.
 *   - Epoche: deterministische, mittelwertfreie Welle plus Langzeittrend je Stadt (hängt nur vom Spieljahr ab, jeder Spieler lebt in seiner Zeit).
 * Wichtig für die Bilanz (kein Doppelzählen): Der Index ist ein MULTIPLIKATOR auf den festen Stadtfaktor (cities.price_factor) und liegt neben
 * - der Knappheit der Waren im Großhandel (goods.js, je Stadt und Ware, nur Zutaten) und
 * - der Konkurrenz-Sättigung (competition.js, je Stadt und Betriebsart, nur die eigenen Räume).
 * Der Betriebsumsatz nimmt den Sektor-Index nur abgeschwächt (pass.revenue) und die Angebotsseite zählt Betriebsräume nur mit firmWeight.
 * Ohne Aktivität und mit deaktivierter Stadtwirtschaft ist jeder Faktor exakt 1 – die Engine rechnet dann wie vorher.
 */
const settings = require('../settings');

const SECTORS = ['food', 'rent', 'services', 'build', 'wage'];
const SIDX = { food: 0, rent: 1, services: 2, build: 3, wage: 4 };
const META = {
  food: { name: 'Lebensmittel', icon: 'shopping-basket', cheap: 'Essen ist hier günstig', dear: 'Essen ist hier teuer' },
  rent: { name: 'Wohnen & Miete', icon: 'house', cheap: 'Wohnen ist hier günstig', dear: 'Wohnen ist hier teuer' },
  services: { name: 'Dienstleistungen & Gastro', icon: 'utensils', cheap: 'Dienste sind hier günstig', dear: 'Dienste sind hier teuer' },
  build: { name: 'Baukosten', icon: 'hammer', cheap: 'Bauen ist hier günstig', dear: 'Bauen ist hier teuer' },
  wage: { name: 'Löhne', icon: 'wallet', cheap: 'Die Löhne sind hier niedrig', dear: 'Die Löhne sind hier hoch' },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };

/** Einstellungen mit Standardwerten und Grenzen (nie NaN). */
function C() {
  const c = settings.get('stadtwirtschaft') || {};
  const s = c.strength || {}; const n = c.npcRooms || {}; const p = c.pass || {}; const pol = c.policy || {};
  const lo = num(c.min, 0.75, 0.3, 1); const hi = num(c.max, 1.6, 1, 4);
  const list = (a, d) => (Array.isArray(a) && a.length ? a.map(Number).filter(Number.isFinite) : d);
  return {
    on: c.enabled !== false, lo, hi,
    intervalMs: num(c.intervalMinutes, 60, 1, 1440) * 60000, tauMs: num(c.tauHours, 24, 0.1, 24 * 90) * 3600000,
    strength: Object.fromEntries(SECTORS.map((k) => [k, num(s[k], { food: 0.35, rent: 0.5, services: 0.4, build: 0.4, wage: 0.4 }[k], 0, 2)])),
    npc: Object.fromEntries(SECTORS.map((k) => [k, num(n[k], { food: 8, rent: 10, services: 14, build: 6, wage: 20 }[k], 0.5, 100)])),
    pd: num(c.playerDemand, 1, 0, 20), fw: num(c.firmWeight, 0.3, 0, 5),
    noise: num(c.noisePct, 1.5, 0, 20) / 100, eraAmp: num(c.eraPct, 3, 0, 20) / 100, eraTrend: num(c.eraTrendPct, 4, 0, 30) / 100,
    pass: { revenue: num(p.revenue, 0.35, 0, 2), property: num(p.property, 0.5, 0, 2), goods: num(p.goods, 0.4, 0, 2), household: num(p.household, 1, 0, 2) },
    hist: Math.round(num(c.histPoints, 60, 14, 400)), newsPct: num(c.newsPct, 4, 0.5, 50),
    policy: {
      rentCap: list(pol.rentCapOptions, [0, 2, 4]), zone: list(pol.zoneOptions, [5, 10, 15]), program: list(pol.programOptions, [5, 10, 15]), brake: list(pol.brakeOptions, [-2, -1, 1, 2]),
      capPenalty: num(pol.capSupplyPenaltyPct, 6, 0, 50) / 100, zoneBuild: num(pol.zoneBuildPct, 50, 0, 300) / 100, brakeWage: num(pol.brakeWagePct, 70, 0, 200) / 100,
    },
  };
}
const msPerGameDay = () => 86400000 / Math.max(1, Number(settings.get('game.clock_days_per_day')) || 365);

/* ------------------------------------------------------------------ Zustand (Zwischenspeicher) ------------------------------------------------------------------ */
let STATE = new Map();   // cityId*8+Sektor → { v, t, pt, hist[] }
let INPUTS = new Map();  // cityId → { players, rooms:{food,services,build,all} } (letzter Stand der Aktualisierung)
let PRIMED = false;
let VERSION = 0;
const key = (cityId, sector) => Number(cityId) * 8 + SIDX[sector];

const active = () => PRIMED && C().on;
/** Setzt den Zwischenspeicher (aus der Datenbank oder in Tests). */
function setState(map, inputs) {
  STATE = map instanceof Map ? map : new Map();
  if (inputs !== undefined) INPUTS = inputs instanceof Map ? inputs : new Map();
  PRIMED = true; VERSION++; NAT.clear(); TIPS.clear();
}
/** Schaltet die Stadtwirtschaft ohne Dynamik scharf (nur Epochenfaktor) – für Simulationen. */
function prime() { if (!PRIMED) { PRIMED = true; VERSION++; } }
function reset() { STATE = new Map(); INPUTS = new Map(); PRIMED = false; VERSION++; NAT.clear(); TIPS.clear(); }
const getState = () => STATE;
const getInputs = (cityId) => INPUTS.get(Number(cityId)) || null;
const version = () => VERSION;

/* ------------------------------------------------------------------ Deterministische Bausteine ------------------------------------------------------------------ */
/** Hash (a,b,c) → [0,1). */
function h01(a, b, c) {
  let x = (Math.imul((a | 0) + 1, 0x9E3779B1) ^ Math.imul((b | 0) + 7, 0x85EBCA6B) ^ Math.imul((c | 0) + 13, 0xC2B2AE35)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D) >>> 0; x ^= x >>> 12; x = Math.imul(x, 0x297A2D39) >>> 0; x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
/** Epochenfaktor: Welle (14–36 Jahre Periode) und Langzeittrend je Stadt und Sektor, Mittel über die Jahre ≈ 1. */
function era(cityId, sector, year, c = C()) {
  const s = SIDX[sector];
  const period = 14 + 22 * h01(cityId, s, 1); const phase = 2 * Math.PI * h01(cityId, s, 2);
  const wave = Math.sin((2 * Math.PI * (year - 1945)) / period + phase);
  const trend = (h01(cityId, s, 3) * 2 - 1) * c.eraTrend * ((year - 2022) / 80);
  return 1 + c.eraAmp * wave + trend;
}
/** Fester Stadtfaktor des Sektors (so rechnete das Spiel schon vor der Stadtwirtschaft). */
function staticFactor(city, sector) {
  const pf = (city && city.price_factor) || 1;
  if (sector === 'rent' || sector === 'build') return pf;
  if (sector === 'food') return 0.6 + 0.4 * pf;
  if (sector === 'services') return 0.7 + 0.3 * pf;
  return 1;
}

/* ------------------------------------------------------------------ Stufen und Multiplikatoren für das Spiel ------------------------------------------------------------------ */
const dyn = (cityId, sector) => { const e = STATE.get(key(cityId, sector)); return e ? e.v : 1; };
/** Index relativ zum festen Stadtfaktor (1 = unverändert). */
function level(cityId, sector, year, c0) {
  if (cityId == null || !PRIMED) return 1;
  const c = c0 || C();
  if (!c.on) return 1;
  return clamp(dyn(cityId, sector) * era(Number(cityId), sector, year, c), c.lo, c.hi);
}
const foodMult = (cityId, year) => level(cityId, 'food', year);
const rentMult = (cityId, year) => level(cityId, 'rent', year);
const wageMult = (cityId, year) => level(cityId, 'wage', year);
const buildMult = (cityId, year) => level(cityId, 'build', year);
const servicesMult = (cityId, year) => level(cityId, 'services', year);
/** Kosten für Kinder, Schule und Freizeit: Mischung aus Lebensmitteln und Diensten. */
function householdMult(cityId, year) {
  if (!active()) return 1;
  return 1 + ((level(cityId, 'food', year) + level(cityId, 'services', year)) / 2 - 1) * C().pass.household;
}
/** Immobilienpreise folgen Mieten und Baukosten, abgeschwächt (Preise reagieren träger als Mieten). */
function propertyMult(cityId, year) {
  if (!active()) return 1;
  const p = C().pass.property;
  return Math.pow(level(cityId, 'rent', year), p) * Math.pow(level(cityId, 'build', year), p / 2);
}

/** Sektor einer Ware (null = nationaler Markt ohne Stadtindex). */
const FOOD_CATS = new Set(['agrar', 'nahrung']);
function sectorOfGood(g) {
  if (!g) return null;
  if (g.service) return g.key === 'bauleistung' ? 'build' : 'services';
  if (FOOD_CATS.has(g.cat)) return 'food';
  if (g.cat === 'bau') return 'build';
  return null;
}
const PK = new Map();
/** Sektor einer Betriebsart: nach der wichtigsten hergestellten Ware. */
function sectorOfPkey(world, pkey) {
  if (PK.has(pkey)) return PK.get(pkey);
  const goods = require('./goods');
  const rec = goods.recipeFor(world, pkey);
  const first = rec && rec.out && rec.out[0] ? goods.good(rec.out[0][0]) : null;
  const s = sectorOfGood(first);
  if (PK.size < 2000) PK.set(pkey, s);
  return s;
}
/** Faktor auf den Umsatz je Raum einer Betriebsart (abgeschwächt). */
function revenueMult(world, cityId, pkey, year) {
  if (!active()) return 1;
  const s = sectorOfPkey(world, pkey); if (!s) return 1;
  return Math.pow(level(cityId, s, year), C().pass.revenue);
}
/** Faktor auf den Großhandelspreis einer Ware (nur Lebensmittel/Bau). */
function goodMult(cityId, g, year) {
  if (!active()) return 1;
  const s = sectorOfGood(g); if (!s) return 1;
  return 1 + (level(cityId, s, year) - 1) * C().pass.goods;
}

/* ------------------------------------------------------------------ Gleichgewicht ------------------------------------------------------------------ */
const capOf = (world, cityId) => {
  const comp = settings.get('competition') || {}; const city = world.city(cityId);
  return Number((comp.cap && comp.cap[city ? city.size_tier : 2]) || 10) || 10;
};
/** Politik-Wirkungen auf die Stadtwirtschaft (aus goods.effectsFor): zone (%) Wohnungsangebot, rentCap (% je Jahr) oder null, brake (Punkte). */
const noPolicy = () => ({ zone: 0, rentCap: null, brake: 0 });

/**
 * Nachfrage und Angebot eines Sektors (in „Räumen“, der Einheit der Konkurrenz-Obergrenze).
 * inp = { players, rooms: { food, services, build, all } }.
 */
function balance(world, cityId, sector, inp, pol) {
  const c = C(); const B = capOf(world, cityId) * c.npc[sector];
  const players = Math.max(0, Number(inp && inp.players) || 0); const r = (inp && inp.rooms) || {};
  const P = pol || noPolicy();
  let D = B; let S = B;
  if (sector === 'food' || sector === 'services') { D += players * c.pd; S += (r[sector] || 0) * c.fw; }
  else if (sector === 'rent') {
    D += players * c.pd * 1.5; S += (r.build || 0) * c.fw * 0.5 + B * (P.zone / 100) * 2;
    if (P.rentCap != null) S *= 1 - c.policy.capPenalty;
  } else if (sector === 'build') {
    D += players * c.pd * 0.5 + (r.all || 0) * 0.06 + B * (P.zone / 100) * c.policy.zoneBuild; S += (r.build || 0) * c.fw;
  } else if (sector === 'wage') { D += (r.all || 0) * 0.5 * c.fw; S += players * c.pd; }
  return { D, S, ratio: S > 0 ? D / S : 1 };
}

/** Zielwert (Gleichgewicht) eines Sektors. nowMs steuert nur das deterministische Rauschen (6-Stunden-Takt). */
function target(world, cityId, sector, inp, pol, nowMs) {
  const c = C(); const P = pol || noPolicy();
  let t = Math.pow(Math.max(1e-6, balance(world, cityId, sector, inp, P).ratio), c.strength[sector]);
  if (P.brake) t *= 1 + 0.015 * P.brake * (sector === 'wage' ? c.policy.brakeWage : 1);
  if (c.noise > 0) t *= 1 + c.noise * (h01(cityId, SIDX[sector], Math.floor((nowMs || 0) / 21600000)) * 2 - 1);
  return clamp(t, c.lo, c.hi);
}

/**
 * Ein Schritt der Annäherung: Mittelwert-Reversion mit Zeitkonstante tau. rentCap (% je Spieljahr) begrenzt den Anstieg des Mietindex.
 * Rein und deterministisch. Rückgabe: neuer Wert (immer in [lo, hi], nie NaN).
 */
function step(prev, tgt, dtMs, rentCapPct) {
  const c = C();
  const p = Number.isFinite(prev) ? prev : 1; const t = Number.isFinite(tgt) ? tgt : 1;
  const a = 1 - Math.exp(-Math.max(0, Number.isFinite(dtMs) ? dtMs : 0) / c.tauMs);
  let v = p + (t - p) * a;
  if (rentCapPct != null && v > p) {
    const yearMs = 365 * msPerGameDay();
    v = Math.min(v, p * (1 + (Math.max(0, rentCapPct) / 100) * (Math.max(0, Number.isFinite(dtMs) ? dtMs : 0) / yearMs)));
  }
  return clamp(v, c.lo, c.hi);
}

/** Neuer Zeileneintrag nach einem Schritt, mit Verlaufspunkten (ein Punkt je Spielmonat). */
function advanceEntry(prev, tgt, nowMs, rentCapPct) {
  const c = C();
  const e = prev ? { v: prev.v, t: prev.t, pt: prev.pt, hist: prev.hist.slice() } : { v: 1, t: nowMs, pt: nowMs, hist: [1] };
  const dt = clamp(nowMs - e.t, 0, 72 * 3600000);
  e.v = step(e.v, tgt, dt, rentCapPct); e.t = nowMs;
  const pointMs = 30 * msPerGameDay();
  let guard = 0;
  while (nowMs - e.pt >= pointMs && guard++ < c.hist) { e.pt += pointMs; e.hist.push(Math.round(e.v * 1000) / 1000); }
  if (nowMs - e.pt >= pointMs) e.pt = nowMs;
  if (e.hist.length > c.hist) e.hist = e.hist.slice(-c.hist);
  e.v = Math.round(e.v * 10000) / 10000;
  return e;
}

/* ------------------------------------------------------------------ Anzeige: Barometer, Vergleich, Hinweise ------------------------------------------------------------------ */
let NAT = new Map(); // Jahr → Landesdurchschnitt je Sektor
let TIPS = new Map();
let NATWORLD = null;
/** Landesdurchschnitt der Preisstufe (fester Faktor × Index), nach Einwohnern gewichtet. */
function nationalAverage(world, year) {
  if (NATWORLD !== world) { NAT.clear(); TIPS.clear(); NATWORLD = world; }
  if (NAT.has(year)) return NAT.get(year);
  const sum = {}; let wsum = 0; const c = C();
  for (const s of SECTORS) sum[s] = 0;
  for (const city of world.cityList) {
    if ((city.since || 1945) > year) continue;
    const w = Math.max(500, Number(city.pop) || 0);
    wsum += w;
    for (const s of SECTORS) sum[s] += w * staticFactor(city, s) * level(city.id, s, year, c);
  }
  const out = {};
  for (const s of SECTORS) out[s] = wsum > 0 ? sum[s] / wsum : 1;
  if (NAT.size > 200) NAT.clear();
  NAT.set(year, out);
  return out;
}
const labelOf = (rel) => (rel <= 0.93 ? 'cheap' : rel >= 1.07 ? 'dear' : 'normal');
const trendOf = (yoy) => (yoy >= 0.015 ? 'up' : yoy <= -0.015 ? 'down' : 'flat');
/** Dynamik vor etwa einem Spieljahr (12 Punkte zurück). */
function dynBefore(cityId, sector, points = 12) {
  const e = STATE.get(key(cityId, sector));
  if (!e) return 1;
  return e.hist.length ? e.hist[Math.max(0, e.hist.length - 1 - points)] : e.v;
}

/** Zeile je Sektor für eine Stadt: Stufe (inkl. festem Faktor), Veränderung zum Vorjahr, Verlauf, Etikett gegenüber dem Landesdurchschnitt. */
function barometer(world, cityId, year, series = 8) {
  const city = world.city(cityId); if (!city) return null;
  const c = C();
  const nat = nationalAverage(world, year);
  const rows = SECTORS.map((s) => {
    const st = staticFactor(city, s);
    const lv = st * level(cityId, s, year, c);
    const prev = st * clamp(dynBefore(cityId, s) * era(cityId, s, year - 1, c), c.lo, c.hi);
    const yoy = prev > 0 ? lv / prev - 1 : 0;
    const e = STATE.get(key(cityId, s));
    const spark = [];
    for (let k = series - 1; k >= 0; k--) {
      const d = e ? e.hist[Math.max(0, e.hist.length - 1 - 12 * k)] : 1;
      spark.push(Math.round(st * clamp((e ? d : 1) * era(cityId, s, Math.max(1945, year - k), c), c.lo, c.hi) * 1000) / 1000);
    }
    const rel = nat[s] > 0 ? lv / nat[s] : 1;
    return {
      sector: s, name: META[s].name, icon: META[s].icon, level: Math.round(lv * 1000) / 1000, idx: Math.round(level(cityId, s, year, c) * 1000) / 1000, yoy: Math.round(yoy * 1000) / 1000, trend: trendOf(yoy),
      vsNational: Math.round((rel - 1) * 1000) / 1000, label: labelOf(rel), spark,
    };
  });
  return { cityId, name: city.name, year, rows, national: Object.fromEntries(SECTORS.map((s) => [s, Math.round(nat[s] * 1000) / 1000])) };
}

const NEAR = new Map(); let NEARWORLD = null;
/** Die nächsten Städte (ab 10.000 Einwohnern, nach Luftlinie × 1,25), zwischengespeichert je Stadt. */
function nearest(world, cityId, n = 40) {
  if (NEARWORLD !== world) { NEAR.clear(); NEARWORLD = world; }
  if (NEAR.has(cityId)) return NEAR.get(cityId);
  const { haversineKm } = require('./economy'); const me = world.city(cityId); if (!me) return [];
  const all = [];
  for (const c of world.cityList) if (c.id !== cityId && ((Number(c.pop) || 0) >= 10000 || (c.size_tier || 1) >= 2)) all.push({ c, km: haversineKm(me, c) }); // nur Städte, keine Weiler
  all.sort((a, b) => a.km - b.km);
  const out = all.slice(0, n).map((x) => ({ id: x.c.id, km: Math.round(x.km) }));
  if (NEAR.size > 400) NEAR.clear();
  NEAR.set(cityId, out);
  return out;
}

/** Vergleichstabelle: eigene Stadt, Nachbarorte (Umkreis) und gewählte Orte, je Sektor die Preisstufe und der Abstand zur eigenen Stadt. */
function compare(world, cityId, year, { ids = [], radiusKm = 150, limit = 10 } = {}) {
  const here = world.city(cityId); if (!here) return []; const cc = C();
  const wanted = new Set(ids.map(Number).filter((x) => Number.isFinite(x) && x !== cityId && world.city(x)));
  const near = nearest(world, cityId).filter((n) => n.km <= radiusKm).slice(0, limit * 3);
  const rows = []; const seen = new Set();
  const { haversineKm } = require('./economy');
  const add = (id, km, picked) => {
    const c = world.city(id); if (!c || seen.has(id) || (c.since || 1945) > year) return; seen.add(id);
    const levels = {}; for (const s of SECTORS) levels[s] = Math.round(staticFactor(c, s) * level(id, s, year, cc) * 1000) / 1000;
    rows.push({ id, name: c.name, state: c.state, km, tier: c.size_tier, pop: c.pop || 0, picked: !!picked, levels });
  };
  add(cityId, 0, false);
  for (const id of wanted) add(id, Math.round(haversineKm(here, world.city(id))), true);
  let n = 0; for (const x of near) { if (n >= limit) break; if (!seen.has(x.id)) { add(x.id, x.km, false); n++; } }
  const me = rows.find((r) => r.id === cityId);
  for (const r of rows) { r.vs = {}; for (const s of SECTORS) r.vs[s] = me && me.levels[s] > 0 ? Math.round((r.levels[s] / me.levels[s] - 1) * 1000) / 1000 : 0; r.here = r.id === cityId; }
  return rows;
}

/**
 * Hinweise für den Spieler: Wohnt er zur Miete und ist eine Nachbarstadt deutlich günstiger, sagt der Tipp, wie viel er täglich spart.
 * lodgingPerDay = aktuelle Wohnkosten (Cent). Rückgabe: Liste von { kind, ... } (Texte formuliert die Oberfläche).
 */
function tips(world, state, year, lodgingPerDay) {
  const out = []; const cityId = state.cityId; const here = world.city(cityId); if (!here) return out;
  const ck = `${cityId}|${year}|${VERSION}|${Math.round(lodgingPerDay || 0)}|${state.occupation ? state.occupation.pkey : ''}`;
  if (TIPS.has(ck)) return TIPS.get(ck);
  const cc = C(); const lv = (c, s) => staticFactor(c, s) * level(c.id, s, year, cc);
  const nearby = nearest(world, cityId).filter((n) => n.km <= 90 && (world.city(n.id).since || 1945) <= year);
  if (lodgingPerDay > 0 && state.housing && (state.housing.type === 'rent' || state.housing.type === 'pension')) {
    let best = null;
    for (const n of nearby) { const c = world.city(n.id); const r = lv(c, 'rent') / lv(here, 'rent'); if (r <= 0.88 && (!best || r < best.r)) best = { c, r, km: n.km }; }
    if (best) out.push({ kind: 'rent', cityId: best.c.id, city: best.c.name, km: best.km, savePerDay: Math.round(lodgingPerDay * (1 - best.r)), pct: Math.round((1 - best.r) * 100) });
  }
  if (state.occupation && state.occupation.kind === 'work') {
    let best = null;
    for (const n of nearby) { const c = world.city(n.id); const r = lv(c, 'wage') / lv(here, 'wage'); if (r >= 1.1 && (!best || r > best.r)) best = { c, r, km: n.km }; }
    if (best) out.push({ kind: 'wage', cityId: best.c.id, city: best.c.name, km: best.km, pct: Math.round((best.r - 1) * 100) });
  }
  if (TIPS.size > 500) TIPS.clear();
  TIPS.set(ck, out);
  return out;
}

/** Zeitungsmeldungen, wenn sich ein Index gegenüber dem Vorjahr stark bewegt hat (rein aus dem Zwischenspeicher). */
function news(world, cityId, year) {
  if (!active()) return [];
  const b = barometer(world, cityId, year, 2); if (!b) return [];
  const th = C().newsPct / 100; const out = [];
  const T = {
    food: [['Lebensmittel in {c} werden teurer', 'Die Preise für Brot, Fleisch und Gemüse ziehen an: etwa {p} % mehr als vor einem Jahr.'], ['Lebensmittel in {c} werden billiger', 'Auf den Märkten wird es günstiger: Lebensmittel kosten etwa {p} % weniger als vor einem Jahr.']],
    rent: [['Mieten in {c} steigen', 'Wohnungen werden knapper und teurer: Die Mieten liegen etwa {p} % über dem Vorjahr.'], ['Mieten in {c} geben nach', 'Der Wohnungsmarkt entspannt sich: Die Mieten liegen etwa {p} % unter dem Vorjahr.']],
    services: [['Gaststätten und Dienste in {c} verlangen mehr', 'Friseur, Wirtshaus und Handwerk kosten etwa {p} % mehr als vor einem Jahr.'], ['Dienste in {c} werden günstiger', 'Der Wettbewerb drückt die Preise: Gaststätten und Dienste kosten etwa {p} % weniger.']],
    build: [['Bauen in {c} wird teurer', 'Die Baukosten steigen um etwa {p} %. Neue Räume und Häuser kosten mehr.'], ['Bauen in {c} wird günstiger', 'Die Baukosten sinken um etwa {p} %. Ein guter Zeitpunkt zum Bauen und Erweitern.']],
    wage: [['Löhne in {c} steigen', 'Betriebe suchen Personal: Die Löhne liegen etwa {p} % über dem Vorjahr.'], ['Löhne in {c} sinken', 'Es gibt mehr Arbeitssuchende als Stellen: Die Löhne liegen etwa {p} % unter dem Vorjahr.']],
  };
  for (const r of b.rows) {
    if (Math.abs(r.yoy) < th) continue;
    const t = T[r.sector][r.yoy > 0 ? 0 : 1];
    const p = String(Math.round(Math.abs(r.yoy) * 100));
    out.push({ sector: r.sector, up: r.yoy > 0, title: t[0].replace('{c}', world.city(cityId).name), text: t[1].replace('{p}', p), pct: Math.round(r.yoy * 100) });
  }
  return out.sort((a, b2) => Math.abs(b2.pct) - Math.abs(a.pct)).slice(0, 2);
}

/**
 * Wirkung eines Beschlusses auf den Gleichgewichtswert (Vorschau): vorher/nachher als Prozent gegenüber dem festen Stadtfaktor.
 * row = { kind, val }; ef = Politik-Wirkungen (goods.effectsFor) der Stadt VOR dem Beschluss.
 */
function previewEffect(world, cityId, row, ef, nowMs) {
  const c = C(); const inp = INPUTS.get(Number(cityId)) || { players: 0, rooms: { all: 0 } };
  const base = { zone: (ef && ef.zone) || 0, rentCap: ef && ef.rentCap != null ? ef.rentCap : null, brake: (ef && ef.brake) || 0 };
  const after = { ...base };
  if (row.kind === 'rentcap') after.rentCap = Number(row.val);
  else if (row.kind === 'landzone' || row.kind === 'housing') after.zone = base.zone + Number(row.val);
  else if (row.kind === 'pricebrake') after.brake = base.brake + Number(row.val);
  const sectors = row.kind === 'pricebrake' ? ['food', 'rent', 'services', 'build', 'wage'] : row.kind === 'rentcap' ? ['rent'] : ['rent', 'build'];
  const out = [];
  for (const s of sectors) {
    const t0 = target(world, cityId, s, inp, base, nowMs); const t1 = target(world, cityId, s, inp, after, nowMs);
    out.push({ sector: s, name: META[s].name, now: Math.round(level(cityId, s, 2000) / Math.max(1e-6, era(cityId, s, 2000)) * 1000) / 1000, before: Math.round(t0 * 1000) / 1000, after: Math.round(t1 * 1000) / 1000, pct: Math.round((t1 / t0 - 1) * 1000) / 10 });
  }
  return out;
}

module.exports = {
  SECTORS, META, C, active, setState, prime, reset, getState, getInputs, version,
  h01, era, staticFactor, level, foodMult, rentMult, wageMult, buildMult, servicesMult, householdMult, propertyMult,
  sectorOfGood, sectorOfPkey, revenueMult, goodMult, balance, target, step, advanceEntry, noPolicy, capOf,
  nationalAverage, barometer, nearest, compare, tips, news, previewEffect, labelOf, key,
};
