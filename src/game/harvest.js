'use strict';
/**
 * Wetter und Ernte. Alles ist eine reine Funktion von Spieljahr (und Bundesland): Spieler, die im selben Spieljahr leben, erleben dieselbe
 * Ernte, und Jahre jenseits der Geschichte (nach 2025) entstehen aus einer festen Zufallsfolge.
 *
 *  - weatherOf(year): Winterhärte (Winter bis Frühjahr des Jahres), Sommerhitze/Dürre, Nässe. Geschichte: Hungerwinter 1946/47, Eiswinter 1962/63,
 *    Dürren 1947, 1976, 2003, 2018, Jahrhundertfluten 1962, 1993, 1999, 2002, 2013, 2021 (die Flut trifft nur bestimmte Bundesländer).
 *  - yieldOf(year, region): Ertrag als Faktor (1 = normales Jahr). Mittelwert über alle Jahre genau 1 (beim Laden normiert).
 *  - Klassen: Katastrophenjahr · schlecht · normal · gut · Rekord.
 *  - Preise: Ein schlechtes Jahr verteuert Agrarwaren (gedämpft vom Importanteil), ein gutes verbilligt sie; Verarbeiter geben nur einen Teil weiter
 *    (Getreide → Mehl → Brot, Fleisch → Wurst). Bauern verdienen im schlechten Jahr weniger, im guten mehr (farmPass); Dürrehilfe des Kanzlers gleicht aus.
 */
const settings = require('../settings');
const { rngFor } = require('./rng');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };

function C() {
  const j = settings.get('jahreszeiten') || {};
  const h = j.harvest || {};
  const on = j.enabled !== false && h.enabled !== false;
  return {
    on, strength: on ? num(h.strength, 1, 0, 2) : 0, variance: num(h.variance, 1, 0, 3), catastrophe: num(h.catastropheChance, 0.025, 0, 0.3),
    cushion: num(h.importCushion, 0.5, 0, 1), farmPass: num(h.farmPass, 0.55, 0, 1.5), foodPass: num(h.foodPass, 0.18, 0, 1),
    pMin: num(h.priceMin, 0.82, 0.3, 1), pMax: num(h.priceMax, 1.45, 1, 3), forced: Array.isArray(h.forced) ? h.forced : [],
  };
}

/** Normalverteilte Zufallszahl (Mittel 0, Streuung 1) aus vier gleichverteilten. */
function gz(r) { return (r() + r() + r() + r() - 2) * Math.sqrt(3); }

/* ------------------------------------------------------------------ Geschichte ------------------------------------------------------------------ */
// winter: Härte des Winters, der im Jahr endet (Januar–März; auch der Dezember davor zählt dazu); heat: Hitze/Dürre im Sommer; wet: Niederschlag (Hochwasser)
const HIST_WEATHER = {
  1947: { winter: 1, heat: 1.8, name: 'Hungerwinter und Dürresommer' }, 1963: { winter: 1, name: 'Eiswinter' }, 1979: { winter: 0.8, name: 'Schneewinter' },
  1996: { winter: 0.5 }, 2010: { winter: 0.5 }, 1956: { winter: 0.7, name: 'Kältewelle im Februar' },
  2007: { winter: -0.9 }, 2014: { winter: -0.6 }, 2020: { winter: -0.7 }, 2023: { winter: -0.5 },
  1959: { heat: 1.3 }, 1976: { heat: 2.2, name: 'Dürresommer' }, 1983: { heat: 1.2 }, 2003: { heat: 2, name: 'Hitzesommer' }, 2015: { heat: 1 }, 2018: { heat: 2, name: 'Dürresommer' }, 2022: { heat: 1.4 },
  1962: { wet: 1.5, name: 'Sturmflut' }, 1993: { wet: 1.5 }, 1999: { wet: 1.6 }, 2002: { wet: 2.2, name: 'Jahrhundertflut' }, 2013: { wet: 1.8, name: 'Hochwasser' }, 2021: { wet: 2.2, name: 'Flutkatastrophe' },
};
const HIST_FLOOD = {
  1962: ['Hamburg', 'Niedersachsen', 'Bremen'], 1993: ['Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Hessen'], 1999: ['Bayern', 'Baden-Württemberg'],
  2002: ['Sachsen', 'Sachsen-Anhalt', 'Bayern', 'Brandenburg'], 2013: ['Sachsen', 'Sachsen-Anhalt', 'Bayern', 'Thüringen'], 2021: ['Nordrhein-Westfalen', 'Rheinland-Pfalz'],
};
// Erträge historischer Jahre (Faktor, vor der Normierung)
const HIST_YIELD = { 1946: [0.58, 'Katastrophenjahr nach Krieg und Dürre'], 1947: [0.7, 'Dürrejahr'], 1948: [0.92], 1976: [0.74, 'Dürrejahr'], 2003: [0.8, 'Hitzesommer'], 2018: [0.78, 'Dürrejahr'], 1984: [1.18, 'Rekordernte'], 2004: [1.2, 'Rekordernte'], 2014: [1.15], 1990: [1.1], 1999: [1.08], 2002: [0.97, 'Jahrhundertflut (Elbe)'], 2021: [0.98], 2013: [0.97], 1962: [1.0] };

const STATES = ['Berlin', 'Hamburg', 'Bayern', 'Nordrhein-Westfalen', 'Hessen', 'Baden-Württemberg', 'Sachsen', 'Bremen', 'Niedersachsen', 'Schleswig-Holstein', 'Mecklenburg-Vorpommern', 'Sachsen-Anhalt', 'Thüringen', 'Saarland', 'Rheinland-Pfalz', 'Brandenburg'];

const wCache = new Map();
/** Wetter des Jahres (deterministisch). winter > 0 hart, < 0 mild; heat > 0 heiß und trocken; wet > 0 nass; flood = betroffene Bundesländer. */
function weatherOf(year) {
  year = Math.floor(Number(year) || 1945);
  if (wCache.has(year)) return wCache.get(year);
  const r = rngFor('weather', year);
  const h = HIST_WEATHER[year] || {};
  const rnd = { winter: gz(r) * 0.45, heat: gz(r) * 0.8, wet: gz(r) * 0.8, pick: r(), n: r() };
  let flood = HIST_FLOOD[year] || [];
  const w = {
    year,
    winter: clamp(h.winter != null ? h.winter : rnd.winter, -1, 1),
    heat: clamp(h.heat != null ? h.heat : rnd.heat, -2, 2.4),
    wet: clamp(h.wet != null ? h.wet : rnd.wet, -2, 2.4),
    name: h.name || null, flood,
  };
  if (!HIST_FLOOD[year] && year > 2025 && w.wet > 1.5) { // erfundene Jahre: gelegentlich eine regionale Flut
    const k = 1 + Math.floor(rnd.n * 3); const i0 = Math.floor(rnd.pick * STATES.length);
    w.flood = Array.from({ length: k }, (_, i) => STATES[(i0 + i * 5) % STATES.length]);
    w.name = w.name || 'Hochwasser';
  }
  if (!w.name) w.name = w.heat > 1.3 ? 'Dürresommer' : w.winter > 0.75 ? 'strenger Winter' : w.wet > 1.7 ? 'Hochwasser' : null;
  wCache.set(year, w);
  return w;
}
/** Winterhärte, die an einem Tag gilt: Dezember zählt zum Winter des Folgejahres. */
const winterSeverity = (year, doy) => weatherOf(doy >= 334 ? year + 1 : year).winter;

/* ------------------------------------------------------------------ Ertrag ------------------------------------------------------------------ */
function rawNational(year) {
  const r = rngFor('yield', year);
  const w = weatherOf(year);
  const c = C();
  const base = 1 + c.variance * (0.075 * gz(r) - 0.06 * clamp(w.heat, -1, 2.4)) - c.variance * 0.03 * clamp(w.wet, 0, 2);
  const shock = r() < c.catastrophe ? 0.28 + 0.2 * r() : 0;
  return { base, shock, n: r() };
}
let NORM = null;
function norm() {
  if (NORM) return NORM;
  const c = C();
  let s = 0; let n = 0;
  for (let y = 1945; y <= 2400; y++) { const h = HIST_YIELD[y]; const rn = rawNational(y); s += clamp(h ? h[0] : rn.base - rn.shock, 0.45, 1.3); n++; }
  NORM = { mean: s / n, key: `${c.variance}|${c.catastrophe}` };
  return NORM;
}
const normOk = () => { const c = C(); if (NORM && NORM.key !== `${c.variance}|${c.catastrophe}`) NORM = null; return norm(); };

const CLASSES = [
  [0.7, 'katastrophe', 'Katastrophenjahr'], [0.9, 'schlecht', 'schlechte Ernte'], [1.07, 'normal', 'normale Ernte'], [1.15, 'gut', 'gute Ernte'], [9, 'rekord', 'Rekordernte'],
];
const classOf = (y) => { const c = CLASSES.find((x) => y < x[0]); return { key: c[1], name: c[2] }; };

function forcedFor(year, region) {
  const c = C();
  const f = c.forced.find((x) => x && Number(x.year) === Number(year) && (!x.region || x.region === region));
  return f && Number.isFinite(Number(f.yield)) ? { yield: clamp(Number(f.yield), 0.4, 1.4), name: f.name || null } : null;
}

/** Nationaler Ertrag (Faktor) – Mittel über alle Jahre = 1. */
function nationalYield(year) {
  year = Math.floor(Number(year) || 1945);
  const f = forcedFor(year, null); if (f) return f.yield;
  if (!C().on) return 1;
  const h = HIST_YIELD[year]; const rn = rawNational(year);
  return clamp((h ? h[0] : rn.base - rn.shock) / normOk().mean, 0.45, 1.3);
}
/** Ertrag eines Bundeslandes: Landesabweichung (±5 %) und Hochwasser (−20 %). */
function yieldOf(year, region) {
  year = Math.floor(Number(year) || 1945);
  const f = forcedFor(year, region || null); if (f) return f.yield;
  const nat = nationalYield(year);
  if (!C().on) return 1;
  const c = C();
  const rr = rngFor('yield-region', year, region || '');
  const w = weatherOf(year);
  const flood = region && w.flood.includes(region) ? -0.2 : 0;
  return clamp(nat + c.variance * (0.03 * gz(rr)) + flood, 0.4, 1.35);
}

/** Preisfaktor der Agrarwaren bei Ertrag y (1 = normal), gedämpft durch den Importanteil. */
const rawPrice = (y) => (y < 1 ? 1 + 1.1 * (1 - y) : 1 - 0.5 * (y - 1));
let PN = null;
function priceNorm() { // mittelwertfrei: die Preise schwanken um das normale Niveau, nicht darüber
  const c = C(); const key = `${c.variance}|${c.catastrophe}`;
  if (PN && PN.key === key) return PN.v;
  let s = 0; let n = 0;
  for (let y = 1945; y <= 2400; y++) { s += rawPrice(nationalYield(y)); n++; }
  PN = { key, v: s / n }; return PN.v;
}
function priceMult(y, imp = 0) {
  const c = C();
  if (!c.on || !c.strength) return 1;
  const raw = rawPrice(y) / priceNorm();
  const f = 1 + (raw - 1) * (1 - c.cushion * clamp(imp, 0, 1)) * c.strength;
  return clamp(f, c.pMin, c.pMax);
}
// Wie stark ein Warenpreis dem Erntepreis folgt (Agrar voll, Verarbeitung gedämpft)
const PASS = { getreide: 1, gemuese: 1, milch: 0.6, fleisch: 0.7, mehl: 0.45, brot: 0.12, wurst: 0.3, suessware: 0.12, bier: 0.1 };
// Verarbeiter: Erlöse folgen dem Preis ihrer Hauptzutat (Weitergabe) – die Marge bleibt dadurch im Mittel erhalten
const CASCADE = { muehle: [['getreide', 0.45]], baecker: [['mehl', 0.12]], konditor: [['mehl', 0.1]], fleischermeister: [['fleisch', 0.3]], lebensmitteltechniker: [['fleisch', 0.15]] };
const FARM = new Set(['landwirt', 'gaertner']);

/** Erntepreisfaktor einer Ware in einer Region (1 = normal). Importanteil dämpft (imp), nur Waren aus PASS reagieren. */
function goodMult(goodKey, year, region, imp = 0) {
  const p = PASS[goodKey]; if (!p) return 1;
  const y = 0.6 * nationalYield(year) + 0.4 * yieldOf(year, region);
  return 1 + (priceMult(y, imp) - 1) * p;
}
/** Erlösfaktor für Betriebe: Bauern folgen dem Ertrag, Verarbeiter dem Preis der Zutat. aid = Dürrehilfe des Kanzlers (0–0,9) mindert den Verlust. */
function firmMult(pkey, year, region, aid = 0) {
  const c = C(); if (!c.on || !c.strength) return 1;
  if (FARM.has(pkey)) {
    const y = yieldOf(year, region);
    let f = 1 + c.farmPass * (y - 1) * c.strength;
    if (f < 1) f += (1 - f) * clamp(aid, 0, 0.9);
    return clamp(f, 0.6, 1.3);
  }
  const cas = CASCADE[pkey];
  if (cas) { let f = 1; for (const [g, pt] of cas) f += (goodMult(g === 'mehl' ? 'getreide' : g, year, region, 0.1) - 1) * pt; return clamp(f, 0.8, 1.2); }
  return 1;
}
/** Faktor auf die Lebensmittelpreise der Haushalte (Warenkorb folgt dem Erntepreis gedämpft). */
function foodMult(year, region) {
  const c = C(); if (!c.on || !c.strength) return 1;
  const y = 0.6 * nationalYield(year) + 0.4 * yieldOf(year, region);
  return clamp(1 + (priceMult(y, 0.15) - 1) * c.foodPass * 2, 0.9, 1.15);
}

/** Ernteübersicht für Oberfläche und Zeitung. */
function report(year, region) {
  const y = yieldOf(year, region); const nat = nationalYield(year); const w = weatherOf(year);
  const cl = classOf(y); const h = HIST_YIELD[year];
  const f = forcedFor(year, region || null);
  return {
    year, region: region || null, yield: Math.round(y * 100) / 100, national: Math.round(nat * 100) / 100, key: cl.key, label: cl.name,
    flood: !!(region && w.flood.includes(region)), floodStates: w.flood, weather: w.name, heat: Math.round(w.heat * 10) / 10, winter: Math.round(w.winter * 10) / 10,
    note: (f && f.name) || (h && h[1]) || w.name || null,
    pricePct: Math.round((goodMult('getreide', year, region, 0.15) - 1) * 1000) / 10, foodPct: Math.round((foodMult(year, region) - 1) * 1000) / 10,
    farmPct: Math.round((firmMult('landwirt', year, region, 0) - 1) * 1000) / 10,
  };
}

module.exports = { C, STATES, weatherOf, winterSeverity, nationalYield, yieldOf, priceMult, goodMult, firmMult, foodMult, classOf, report, PASS, CASCADE, HIST_YIELD, CLASSES };
