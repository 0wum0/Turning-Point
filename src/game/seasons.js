'use strict';
/**
 * Jahreszeiten: rein deterministisch aus dem Spieldatum (Tag im Jahr) – alle Spieler im gleichen Spieljahr sehen dasselbe.
 *
 *  - Jahreszeit mit glatter Wärmekurve (kältester Tag 15. Januar, wärmster 16. Juli) und Intensität (wie tief im Winter / Sommer).
 *  - Branchen-Nachfrage: je Branche eine Kurve über das Jahr. Jede Kurve wird beim Laden mittelwertfrei gemacht und auf Höchstwert 1 gebracht,
 *    der Ausschlag (amp) ist gedeckelt (cap): Gastro/Ausflug im Sommer, Heizung/Kohle/Strom im Winter, Bau ruht im tiefen Winter,
 *    Einzelhandel vor Weihnachten, Landwirtschaft folgt dem Wachstum. Der Jahresumsatz bleibt dadurch (fast) unverändert.
 *  - Haushalt: Heizkosten (Anteil an Miete/Unterhalt, je nach Heizungsart der Epoche), Krankheitschance, Erholung, Stimmung.
 *  - Regionale Feste (Weihnachtsmarkt, Karneval, Oktoberfest, Sommerfest, Erntedank): kleiner Umsatzbonus und gute Laune.
 * Nichts hier schreibt in den Spielstand; die Engine ruft die Funktionen auf.
 */
const settings = require('../settings');
const { dateOf } = require('./calendar');
const { hash } = require('./rng');

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };

function C() {
  const j = settings.get('jahreszeiten') || {};
  const s = j.seasons || {}; const f = j.festivals || {};
  const h = s.heating || {}; const he = s.health || {}; const a = s.amp || {};
  const on = j.enabled !== false;
  const sOn = on && s.enabled !== false;
  const amp = {};
  for (const k of ['gastro', 'tourism', 'heat', 'bau', 'retail', 'agrar']) amp[k] = num(a[k], DEF_AMP[k], 0, 0.5);
  return {
    on, seasons: sOn, strength: sOn ? num(s.strength, 1, 0, 2) : 0, cap: num(s.cap, 0.2, 0, 0.5), amp,
    heating: { share: num(h.share, 0.12, 0, 0.5), kohle: num(h.kohle, 1.2, 0, 3), zentral: num(h.zentral, 0.9, 0, 3), waerme: num(h.waerme, 0.6, 0, 3), severity: num(h.severity, 0.35, 0, 1) },
    health: { illness: num(he.illness, 0.35, 0, 0.8), rest: num(he.rest, 0.4, 0, 2), mood: num(he.mood, 1.5, 0, 6) },
    festivals: { on: on && f.enabled !== false, boost: num(f.boostPct, 6, 0, 20) / 100, well: num(f.well, 6, 0, 20) },
    labels: Object.assign({ winter: 'Winter', fruehling: 'Frühling', sommer: 'Sommer', herbst: 'Herbst' }, j.labels || {}),
  };
}
const DEF_AMP = { gastro: 0.14, tourism: 0.2, heat: 0.2, bau: 0.16, retail: 0.18, agrar: 0.15 };

/* ------------------------------------------------------------------ Kalender ------------------------------------------------------------------ */
/** Wärme: −1 (15. Januar) … +1 (16. Juli), glatt. */
const warmth = (doy) => -Math.cos((TAU * (doy - 15)) / 365);
/** Abstand auf dem Jahreskreis. */
const circ = (a, b) => { const d = Math.abs(a - b) % 365; return Math.min(d, 365 - d); };
const gauss = (doy, c, sigma) => Math.exp(-0.5 * (circ(doy, c) / sigma) ** 2);

const SEASONS = [
  { key: 'winter', idx: 0, icon: 'cloud-hail', tip: 'Heizen kostet mehr, Gastro und Ausflüge sind ruhiger, Erkältungen häufen sich.', notice: 'Heizen kostet mehr, Gastro und Ausflüge sind ruhiger, Erkältungen häufen sich. Lege ein Polster für die Heizkosten zurück.' },
  { key: 'fruehling', idx: 1, icon: 'flower-2', tip: 'Es wird wärmer: Bau und Ausflüge ziehen an, die Heizkosten sinken.', notice: 'Es wird wärmer: Bau und Ausflüge ziehen an, die Heizkosten sinken.' },
  { key: 'sommer', idx: 2, icon: 'sun-medium', tip: 'Gastro, Hotel und Ausflug laufen am besten; Heizen ist kaum nötig, du erholst dich leichter.', notice: 'Gastro, Hotel und Ausflug laufen am besten; Heizen ist kaum nötig, du erholst dich leichter.' },
  { key: 'herbst', idx: 3, icon: 'wheat', tip: 'Erntezeit: Die Ernte bestimmt die Lebensmittelpreise. Vor dem Winter lohnt sich ein Polster.', notice: 'Erntezeit: Die Ernte bestimmt die Lebensmittelpreise. Vor dem Winter lohnt sich ein Polster. Der Erntebericht erscheint in der Zeitung.' },
];
const monthOfDoy = (doy) => dateOf(clamp(Math.floor(doy), 0, 364), 1945).month;
/** Jahreszeit eines Tages im Jahr (Dezember bis Februar = Winter …). */
function seasonOf(doy) {
  const m = monthOfDoy(doy);
  const i = m === 11 || m < 2 ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3;
  const w = warmth(doy);
  const S = SEASONS[i];
  const labels = C().labels;
  return {
    key: S.key, idx: i, name: labels[S.key] || S.key, icon: S.icon, tip: S.tip, warmth: Math.round(w * 1000) / 1000,
    intensity: Math.round((i === 0 ? Math.max(0, -w) : i === 2 ? Math.max(0, w) : 1 - Math.abs(w)) * 1000) / 1000, // wie ausgeprägt die Jahreszeit gerade ist
  };
}

/* ------------------------------------------------------------------ Branchen ------------------------------------------------------------------ */
const SECTOR_OF = {
  gastro: ['wirt', 'servierkraft'],
  tourism: ['reisekaufmann', 'flugbegleiter', 'linienpilot', 'busfahrer', 'taxifahrer', 'strassenbahnschaffner', 'zugbegleiter', 'fotograf', 'fitnesstrainer'],
  heat: ['kohlenhaendler', 'bergmann', 'kraftwerkstechniker', 'energietechniker', 'heizungsbauer', 'waermepumpeninstallateur', 'schornsteinfeger', 'wasserstofftechniker', 'solartechniker', 'windkraftmonteur', 'lokheizer'],
  retail: ['einzelhandelsverkaeufer', 'supermarktkassierer', 'online_haendler', 'modedesigner', 'uhrmacher', 'optiker', 'schuhmachermeister', 'orthopaedieschuhtechniker', 'schneider', 'milchmann', 'konditor'],
  agrar: ['landwirt', 'gaertner', 'landarbeiter', 'agrartechniker', 'revierfoerster'],
};
const BRANCH = {};
for (const [sec, list] of Object.entries(SECTOR_OF)) for (const k of list) BRANCH[k] = sec;
const SECTOR_NAME = { gastro: 'Gastronomie', tourism: 'Ausflug & Reisen', heat: 'Heizung & Energie', bau: 'Bau', retail: 'Einzelhandel', agrar: 'Landwirtschaft' };
/** Saisonbranche eines Berufs (null = unabhängig von der Jahreszeit). */
function sectorOf(world, pkey) {
  if (BRANCH[pkey]) return BRANCH[pkey];
  const p = world && world.prof ? world.prof(pkey) : null;
  if (p && p.category === 'bau') return 'bau';
  if (p && p.category === 'landwirtschaft') return 'agrar';
  if (p && p.category === 'gastronomie') return 'gastro';
  return null;
}

const SHAPE_FN = {
  gastro: (d) => 0.75 * warmth(d) + 0.4 * gauss(d, 350, 12),
  tourism: (d) => warmth(d),
  heat: (d) => -warmth(d),
  bau: (d) => warmth(d),
  retail: (d) => gauss(d, 342, 15) + 0.3 * gauss(d, 98, 9),
  agrar: (d) => Math.cos((TAU * (d - 265)) / 365),
};
const SHAPE = {};
for (const [k, fn] of Object.entries(SHAPE_FN)) {
  const a = Array.from({ length: 365 }, (_, d) => fn(d));
  const mean = a.reduce((s, x) => s + x, 0) / 365;
  const b = a.map((x) => x - mean);
  const mx = Math.max(...b.map(Math.abs)) || 1;
  SHAPE[k] = b.map((x) => x / mx);
}
const doyOf = (d) => clamp(Math.floor(Number(d) || 0), 0, 364);
/** Nachfragefaktor einer Branche an einem Tag (1 = normal), höchstens ±cap. */
function sectorMult(sector, doy) {
  const c = C();
  if (!c.seasons || !SHAPE[sector]) return 1;
  const amp = (c.amp[sector] || 0) * c.strength;
  return clamp(1 + amp * SHAPE[sector][doyOf(doy)], 1 - c.cap, 1 + c.cap);
}

/* ------------------------------------------------------------------ Feste ------------------------------------------------------------------ */
const CUMD = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const md = (m, d) => CUMD[m - 1] + d - 1; // Monat 1–12, Tag → Tag im Jahr
const KARNEVAL = ['Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Hessen', 'Baden-Württemberg', 'Saarland'];
const FEST_DEF = [
  { key: 'weihnacht', name: 'Weihnachtsmarkt', icon: 'gift', from: md(11, 27), to: md(12, 23), sectors: ['retail', 'gastro'], boost: 1, text: 'Der Weihnachtsmarkt lockt Kundschaft in die Stadt.' },
  { key: 'karneval', name: 'Karneval', icon: 'party-popper', from: md(2, 5), to: md(2, 20), sectors: ['gastro', 'tourism'], boost: 1.2, states: KARNEVAL, text: 'Karneval: Die Stadt feiert, Gaststätten sind voll.' },
  { key: 'oktoberfest', name: 'Oktoberfest', icon: 'utensils', from: md(9, 19), to: md(10, 4), sectors: ['gastro', 'tourism'], boost: 1.5, states: ['Bayern'], text: 'Oktoberfest: Zeltwirte und Gäste haben Hochbetrieb.' },
  { key: 'volksfest', name: 'Volksfest', icon: 'ticket', from: md(9, 26), to: md(10, 12), sectors: ['gastro', 'tourism'], boost: 1, states: ['Baden-Württemberg'], text: 'Das Volksfest zieht Besucher aus der ganzen Region an.' },
  { key: 'erntedank', name: 'Erntedankfest', icon: 'wheat', from: md(10, 1), to: md(10, 8), sectors: ['gastro', 'retail', 'agrar'], boost: 0.8, text: 'Erntedank: Der Markt feiert die Ernte.' },
  { key: 'sommerfest', name: 'Sommerfest', icon: 'sun-medium', sectors: ['gastro', 'tourism'], boost: 1, own: true, text: 'Das Sommerfest der Stadt bringt Gäste und gute Laune.' },
];
/** Sommerfest je Stadt: eigener Termin (7 Tage zwischen 20. Juni und 20. August), fest aus der Stadt-ID. */
const sommerStart = (cityId) => md(6, 20) + (hash(`sommerfest|${cityId}`) % 52);
/** Feste, die an einem Tag in einer Stadt laufen. */
function festivalsOn(city, doy) {
  const c = C();
  if (!c.festivals.on || !city) return [];
  const d = doyOf(doy); const out = [];
  for (const f of FEST_DEF) {
    if (f.states && !f.states.includes(city.state)) continue;
    const from = f.own ? sommerStart(city.id) : f.from; const to = f.own ? from + 6 : f.to;
    if (d < from || d > to) continue;
    out.push({ key: f.key, name: f.name, icon: f.icon, text: f.text, sectors: f.sectors, boost: f.boost, from, to, day: d - from });
  }
  return out;
}

/** Umsatzfaktor für Jahreszeit und Feste eines Betriebs (Beruf, Stadt, Tag im Jahr), höchstens ±cap. */
function revenueMult(world, pkey, city, doy, extra = 0) {
  const c = C();
  if (!c.seasons && !c.festivals.on) return 1;
  const sec = sectorOf(world, pkey);
  let m = sec ? sectorMult(sec, doy) : 1;
  if (sec && c.festivals.on) {
    const fs = festivalsOn(city, doy).filter((f) => f.sectors.includes(sec));
    if (fs.length) m += c.festivals.boost * Math.max(...fs.map((f) => f.boost));
  }
  if (sec && extra) m += extra;
  return clamp(m, 1 - c.cap, 1 + c.cap + (extra > 0 ? extra : 0));
}

/* ------------------------------------------------------------------ Haushalt: Heizung, Gesundheit, Stimmung ------------------------------------------------------------------ */
/** Heizungsart der Epoche: Kohleofen, Zentralheizung, Wärmepumpe. */
function heatingKind(year) {
  if (year < 1965) return { key: 'kohle', name: 'Kohleofen' };
  if (year < 2010) return { key: 'zentral', name: 'Zentralheizung' };
  return { key: 'waerme', name: 'Wärmepumpe' };
}
const HEAT_Q = { pension: 0.8, rent: 1, own: 1.1, workplace: 0, street: 0 };
/** Abweichung der Heizlast an einem Tag (−1 … +1,35, mittelwertfrei über die Jahre): Winter positiv, Sommer negativ, harter Winter mehr. */
function heatDev(doy, winterSev = 0) {
  const w = warmth(doy);
  return -w + (winterSev || 0) * Math.max(0, -w) * C().heating.severity;
}
/** Anteil, um den Miete/Unterhalt durch Heizen steigt (+) oder sinkt (−). subsidy = Winterhilfe der Stadt (0–1) mindert nur den Mehrbedarf. */
function heatingPct(housingType, year, doy, winterSev = 0, subsidy = 0) {
  const c = C();
  if (!c.seasons) return 0;
  const q = HEAT_Q[housingType] || 0;
  if (!q) return 0;
  const k = c.heating[heatingKind(year).key];
  let dev = heatDev(doy, winterSev) * c.strength;
  if (dev > 0) dev *= 1 - clamp(subsidy, 0, 0.9);
  return clamp(c.heating.share * k * q * dev, -0.3, 0.4);
}
/** Faktor auf Miete/Unterkunft bzw. Unterhalt des Eigenheims. */
const heatingMult = (housingType, year, doy, winterSev, subsidy) => 1 + heatingPct(housingType, year, doy, winterSev, subsidy);

/** Faktor auf die Krankheitschance (Winter höher, Sommer niedriger; Mittel 1). */
function illnessMult(doy) { const c = C(); return c.seasons ? 1 - c.health.illness * warmth(doy) * c.strength : 1; }
/** Zusätzliche Erholung je Tag (Sommer +, Winter −; Mittel 0). */
function restDelta(doy) { const c = C(); return c.seasons ? c.health.rest * warmth(doy) * c.strength : 0; }
/** Stimmungs-Zielwert-Verschiebung (Sommer +, Winter −, Weihnachtszeit +; Mittel ≈ 0). */
function moodDelta(doy) { const c = C(); return c.seasons ? c.health.mood * (warmth(doy) + 0.5 * gauss(doy, 354, 8) - 0.03) * c.strength : 0; }

/** Kurzfassung für die Oberfläche: Jahreszeit, was sich jetzt ändert und welche Feste laufen. */
function brief(world, doy, year, city, winterSev = 0, subsidy = 0, housingType = 'rent') {
  const c = C();
  const S = seasonOf(doy);
  const hk = heatingKind(year);
  const hp = heatingPct(housingType, year, doy, winterSev, subsidy);
  const sectors = Object.keys(SHAPE).map((k) => ({ key: k, name: SECTOR_NAME[k], pct: Math.round((sectorMult(k, doy) - 1) * 1000) / 10 })).filter((x) => Math.abs(x.pct) >= 1.5);
  return {
    on: c.seasons, key: S.key, idx: S.idx, name: S.name, icon: S.icon, tip: S.tip, intensity: S.intensity, warmth: S.warmth,
    heating: { kind: hk.name, pct: Math.round(hp * 1000) / 10, subsidy: Math.round(clamp(subsidy, 0, 0.9) * 100) },
    sectors: sectors.sort((a, b) => b.pct - a.pct),
    festivals: festivalsOn(city, doy).map((f) => ({ key: f.key, name: f.name, icon: f.icon, text: f.text, daysLeft: Math.max(0, f.to - doyOf(doy)) })),
    mood: Math.round(moodDelta(doy) * 10) / 10,
  };
}

module.exports = {
  C, SEASONS, SECTOR_NAME, warmth, seasonOf, sectorOf, sectorMult, festivalsOn, revenueMult, heatingKind, heatDev, heatingPct, heatingMult, illnessMult, restDelta, moodDelta, brief,
  SHAPE, FEST_DEF,
};
