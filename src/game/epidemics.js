'use strict';
/**
 * Seuchen. Wellen sind eine reine Funktion des Spieldatums (Jahr + Tag im Jahr), also für alle Spieler im selben Spieljahr gleich:
 * historische Grippewellen und die Pandemie 2020–2022, in den 2040er/2070er/2090er Jahren erfundene Seuchen aus einer festen Zufallsfolge.
 *
 * Ausbreitung: Jede Welle beginnt in einer Ursprungsstadt und erreicht eine andere Stadt nach Entfernung ÷ Tempo (Standard 9 km je Spieltag,
 * also über Wochen). Vor Ort steigt die Stärke I (0…1) glatt bis zum Höhepunkt und fällt wieder. Maßnahmen verkleinern I:
 *   Hygienebeschlüsse der Stadt, Impfquote, Maskenpflicht / Kontaktbeschränkung / Lockdown des Bundes (gedeckelt durch den Rahmen des Bundestags).
 * Gesundheit: Ansteckungschance je Tag ∝ I · Risiko (Kondition, Alter, Krankenzusatz, Vorerkrankung, Hygiene, Schutzkonzept, Impfung);
 * Krankheitsdauer und Schwere ∝ Welle · Epoche (Medizin) · Person. Anfängerschutz: gesund. Gesundheit fällt nie unter eine Schwelle,
 * Sterblichkeit ist klein, nach Epoche skaliert und gedeckelt. Betriebe: kranke Mitarbeiter (Leistung −), Lockdown-Verlust je Branche, Krankenhäuser (+).
 */
const settings = require('../settings');
const { rngFor, hash } = require('./rng');
const { haversineKm } = require('./economy');
const { sectorOf } = require('./seasons');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const abs = (year, doy) => year * 365 + doy;
const md = (m, d) => [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][m - 1] + d - 1;

function C() {
  const j = settings.get('jahreszeiten') || {};
  const e = j.epidemics || {};
  const on = j.enabled !== false && e.enabled !== false;
  const m = e.measures || {}; const l = e.lockdown || {}; const p = e.price || {}; const mo = e.mortality || {};
  const arr = (a, d) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) ? a.map((x) => clamp(x, 0, 0.9)) : d);
  return {
    on, severity: num(e.severity, 1, 0, 3), frequency: num(e.frequency, 1, 0, 3), speed: num(e.speedKm, 9, 1, 100), infect: num(e.infect, 1, 0, 3),
    mortality: { on: mo.enabled !== false, max: num(mo.max, 0.004, 0, 0.05) },
    measures: [0, num(m.mask, 0.18, 0, 0.9), num(m.contact, 0.38, 0, 0.9), num(m.lockdown, 0.6, 0, 0.95)],
    lock: { gastro: arr(l.gastro, [0, 0.1, 0.3]), tourism: arr(l.tourism, [0, 0.15, 0.4]), retail: arr(l.retail, [0, 0.05, 0.15]), other: arr(l.other, [0, 0.01, 0.04]) },
    price: { hygiene: num(p.hygiene, 3, 0, 100), vaccine: num(p.vaccine, 12, 0, 500), shieldDays: num(p.shieldDays, 6, 0, 60) },
    forced: Array.isArray(e.forced) ? e.forced : [],
  };
}

/* ------------------------------------------------------------------ Wellen ------------------------------------------------------------------ */
const MEASURE_NAME = ['Keine Maßnahmen', 'Maskenpflicht & Hygieneregeln', 'Kontaktbeschränkungen', 'Lockdown'];
const MEASURE_SHORT = ['Lockerung', 'Masken', 'Kontaktbeschränkung', 'Lockdown'];
// kind: flu (leichter, keine Maßnahmen des Bundes) | pandemic. sev 0…1, contag = Ansteckungsfreude, duration = Tage vor Ort bis zum Abklingen,
// vacc = Tage nach Beginn, ab denen ein Impfstoff da ist (null = keiner), def = Standardmaßnahmen des Bundes ohne Beschluss des Kanzlers
const HIST = [
  { id: 'grippe1957', name: 'Asiatische Grippe', year: 1957, doy: md(8, 20), origin: 'Hamburg', kind: 'flu', sev: 0.5, contag: 0.8, duration: 120, vacc: null, def: 0 },
  { id: 'grippe1968', name: 'Hongkong-Grippe', year: 1968, doy: md(11, 25), origin: 'Frankfurt am Main', kind: 'flu', sev: 0.5, contag: 0.8, duration: 120, vacc: 80, def: 0 },
  { id: 'sars2003', name: 'SARS-Ausbruch', year: 2003, doy: md(3, 1), origin: 'Frankfurt am Main', kind: 'flu', sev: 0.35, contag: 0.35, duration: 70, vacc: null, def: 1 },
  { id: 'grippe2009', name: 'Schweinegrippe', year: 2009, doy: md(9, 20), origin: 'Düsseldorf', kind: 'flu', sev: 0.3, contag: 0.8, duration: 100, vacc: 70, def: 0 },
  { id: 'covid1', name: 'Corona-Pandemie (1. Welle)', year: 2020, doy: md(2, 25), origin: 'München', kind: 'pandemic', sev: 0.75, contag: 0.9, duration: 120, vacc: null, def: 2 },
  { id: 'covid2', name: 'Corona-Pandemie (2. Welle)', year: 2020, doy: md(10, 10), origin: 'Köln', kind: 'pandemic', sev: 0.8, contag: 1, duration: 150, vacc: 70, def: 2 },
  { id: 'covid3', name: 'Corona-Pandemie (3. Welle)', year: 2021, doy: md(11, 1), origin: 'Leipzig', kind: 'pandemic', sev: 0.5, contag: 1.1, duration: 120, vacc: 0, def: 1 },
];
const NAMES = ['Nordwind-Fieber', 'Staubfieber', 'Kuppelgrippe', 'Schlafsucht', 'Rotes Fieber', 'Glasfieber', 'Küstenhusten', 'Aschenfieber'];
/** Erfundene Seuchen: je ein Fenster in den 2040ern, 2070ern und 2090ern; feste Zufallsfolge. */
function fictional(world, freq) {
  if (!freq) return [];
  const big = world.cityList.filter((c) => c.size_tier >= 4).sort((a, b) => a.id - b.id);
  const pool = big.length ? big : world.cityList;
  const out = [];
  for (const [y0, y1] of [[2040, 2049], [2070, 2079], [2090, 2099]]) {
    const n = freq >= 2 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const r = rngFor('tp-epidemic', y0, k);
      if (k === 0 || r() < freq - 1) {
        const year = y0 + Math.floor(r() * (y1 - y0 + 1));
        const doy = Math.floor(r() * 2) ? md(10, 1) + Math.floor(r() * 90) : Math.floor(r() * 60);
        const sev = 0.5 + 0.35 * r();
        out.push({ id: `seuche${y0}_${k}`, name: NAMES[Math.floor(r() * NAMES.length)], year, doy: clamp(doy, 0, 364), origin: pool[Math.floor(r() * pool.length)].name, kind: 'pandemic', sev: r3(sev), contag: r3(0.8 + 0.3 * r()), duration: 130 + Math.floor(r() * 40), vacc: 100 + Math.floor(r() * 60), def: sev > 0.7 ? 2 : 1, fictional: true });
      }
    }
  }
  return out;
}

const WCACHE = new WeakMap();
/** Alle Wellen der Welt (historisch + erfunden + vom Admin erzwungene). */
function waves(world) {
  const c = C();
  const key = `${c.on}|${c.frequency}|${JSON.stringify(c.forced)}`;
  const hit = WCACHE.get(world);
  if (hit && hit.key === key) return hit.list;
  const list = [];
  if (c.on) {
    for (const w of HIST.concat(fictional(world, c.frequency))) list.push(w);
    for (const f of c.forced) {
      if (!f || f.ended) continue;
      const y = Math.floor(Number(f.year)); const d = Math.floor(Number(f.doy));
      if (!Number.isFinite(y) || !Number.isFinite(d)) continue;
      list.push({ id: String(f.id || `admin${y}_${d}`).slice(0, 40), name: String(f.name || 'Seuche').slice(0, 60), year: y, doy: clamp(d, 0, 364), origin: String(f.origin || ''), kind: f.kind === 'flu' ? 'flu' : 'pandemic', sev: num(f.sev, 0.6, 0.05, 1), contag: num(f.contag, 1, 0.1, 2), duration: Math.floor(num(f.duration, 120, 20, 400)), vacc: f.vacc == null || f.vacc === '' ? null : Math.floor(num(f.vacc, 90, 0, 400)), def: Math.floor(num(f.level, 1, 0, 3)), forced: true });
    }
  }
  const out = list.map((w) => ({ ...w, start: abs(w.year, w.doy) })).sort((a, b) => a.start - b.start);
  WCACHE.set(world, { key, list: out });
  return out;
}
const lastEnd = (world) => Math.max(0, ...waves(world).map((w) => w.start + w.duration + 900));

const DIST = new Map();
function originOf(world, w) {
  return world.cityList.find((c) => c.name === w.origin) || world.cityList.find((c) => c.slug === w.origin) || world.cityList.find((c) => c.size_tier >= 4) || world.cityList[0];
}
/** Entfernung (km) der Stadt zum Ursprung der Welle. */
function distTo(world, w, city) {
  const k = `${w.id}|${city.id}`;
  if (DIST.has(k)) return DIST.get(k);
  const o = originOf(world, w);
  const d = o && o.id !== city.id ? haversineKm(o, city) : 0;
  if (DIST.size > 4000) DIST.clear();
  DIST.set(k, d);
  return d;
}
/** Stärke I (0…1) der Welle in einer Stadt am Tag (ohne Maßnahmen): Beginn nach Entfernung, glatter Anstieg bis ~38 % der Dauer, dann Abklingen. */
function intensity(world, w, city, year, doy) {
  const c = C();
  const t = abs(year, doy) - w.start - distTo(world, w, city) / c.speed;
  if (t <= 0 || t >= w.duration) return 0;
  const u = t / w.duration; const pk = 0.38;
  const base = u < pk ? Math.sin((Math.PI / 2) * (u / pk)) ** 2 : Math.cos((Math.PI / 2) * ((u - pk) / (1 - pk))) ** 2;
  const vul = 0.88 + 0.24 * ((hash(`vul|${w.id}|${city.id}`) % 1000) / 1000); // Stadt-Eigenart ±12 %
  return clamp(base * vul, 0, 1);
}
/** Beginn der Welle in der Stadt (Tag, abs) und Tag des Höhepunkts. */
function timing(world, w, city) {
  const t0 = w.start + distTo(world, w, city) / C().speed;
  return { start: Math.round(t0), peak: Math.round(t0 + w.duration * 0.38), end: Math.round(t0 + w.duration) };
}

/* ------------------------------------------------------------------ Lage ------------------------------------------------------------------ */
/** Medizinischer Stand der Epoche (1 = 1945, 0,35 = ab etwa 2020): Pflegequalität, senkt Schwere und Sterblichkeit. */
const care = (year) => r3(1 - 0.65 * clamp((year - 1945) / 75, 0, 1));
const NO_EF = { epi: { hyg: 0, hospital: 0, level: null, cap: 2, vaccLvl: 0, kurz: 0 } };
/**
 * Lage in einer Stadt: laufende Wellen mit Stärke vor Ort (I roh, Ieff nach Maßnahmen), geltende Maßnahmenstufe des Bundes, Impfquote.
 * ef = goods.effectsFor(world, cityId) (enthält ef.epi aus den Beschlüssen).
 */
function situation(world, year, doy, city, ef) {
  const c = C();
  const out = { waves: [], I: 0, Iraw: 0, level: 0, cap: 2, hyg: 0, hospital: 0, vacc: 0, vaccAvail: null, sickShare: 0, active: false };
  if (!c.on || !city) return out;
  const epi = (ef && ef.epi) || NO_EF.epi;
  out.cap = epi.cap; out.hyg = epi.hyg; out.hospital = epi.hospital;
  const now = abs(year, doy);
  for (const w of waves(world)) {
    if (now < w.start - 40 || now > w.start + w.duration + 900) continue;
    const raw = intensity(world, w, city, year, doy);
    const tm = timing(world, w, city);
    // Nationaler Eindruck (Ursprungsstadt) bestimmt, ob der Bund Maßnahmen für nötig hält
    const o = originOf(world, w);
    const natRaw = Math.max(raw, o ? intensity(world, w, o, year, doy) * 0.8 : 0);
    let level = 0;
    if (w.kind === 'pandemic' && natRaw > 0.2) level = epi.level != null ? epi.level : w.def;
    else if (w.kind === 'flu' && natRaw > 0.2 && epi.level != null) level = epi.level;
    else if (w.kind === 'flu' && natRaw > 0.4) level = Math.min(w.def, 1);
    level = Math.min(level, epi.cap);
    // Impfquote der Bevölkerung: wächst nach Verfügbarkeit bis ~55 % (Krankenhausprogramm/Kampagne mehr)
    let vacc = 0; let avail = null;
    if (w.vacc != null && now >= w.start + w.vacc) {
      vacc = clamp((now - w.start - w.vacc) / 160, 0, 1) * clamp(0.5 + 0.1 * epi.hospital + 0.1 * epi.vaccLvl, 0, 0.8);
      avail = { wave: w.id, name: w.name, since: now - (w.start + w.vacc) };
    }
    const meas = 1 - c.measures[level];
    const hyg = 1 - [0, 0.08, 0.15, 0.22][epi.hyg || 0];
    const eff = clamp(raw * c.infect * w.contag * meas * hyg * (1 - 0.6 * vacc), 0, 1);
    const sev = clamp(w.sev * c.severity * (1 - 0.1 * epi.hospital), 0, 1.5);
    const phase = raw <= 0 ? (now < tm.start ? 'coming' : 'over') : now < tm.peak ? 'rising' : 'falling';
    if (raw <= 0 && now > tm.end) continue; // vorbei
    if (raw <= 0 && tm.start - now > 40) continue;
    out.waves.push({ id: w.id, name: w.name, kind: w.kind, I: r3(raw), Ieff: r3(eff), sev: r3(sev), phase, level, vacc: r3(vacc), start: tm.start, peak: tm.peak, end: tm.end, daysToStart: Math.max(0, tm.start - now), daysToPeak: Math.max(0, tm.peak - now), vaccAvail: !!avail });
    out.Iraw = Math.max(out.Iraw, raw); out.I = Math.max(out.I, eff);
    if (level > out.level) out.level = level;
    if (avail && (!out.vaccAvail || vacc > out.vaccAvail.share)) out.vaccAvail = { ...avail, share: r3(vacc) };
    out.vacc = Math.max(out.vacc, vacc);
    out.sickShare += eff * sev * 0.22 * care(year);
  }
  out.sickShare = r3(clamp(out.sickShare, 0, 0.3));
  out.active = out.waves.some((x) => x.I > 0.03);
  return out;
}

/* ------------------------------------------------------------------ Betriebe ------------------------------------------------------------------ */
const HEALTH_JOBS = new Set(['arzt', 'apotheker', 'krankenpfleger', 'pflegekraft', 'hebamme', 'zahnarzt', 'psychologe', 'pflegeroboter_betreuer']);
/**
 * Betriebe in einer Seuchenlage: Leistung (kranke Mitarbeiter), Umsatzfaktor (Lockdown je Branche, Krankenhäuser +).
 * shield = Schutzkonzept des Betriebs ist aktiv (halbiert Krankenstand, mindert Lockdown-Verlust um 40 %), kurz = Kurzarbeitergeld (0–0,7).
 */
function firmEffects(world, pkey, sit, { shield = false, kurz = 0 } = {}) {
  const none = { eff: 1, rev: 1, sick: 0, lock: 0 };
  if (!sit || !sit.active) return none;
  const c = C();
  const sick = clamp(sit.sickShare * (shield ? 0.5 : 1), 0, 0.3);
  const sec = sectorOf(world, pkey);
  const col = sec === 'gastro' ? 'gastro' : sec === 'tourism' ? 'tourism' : sec === 'retail' ? 'retail' : 'other';
  let lock = 0;
  if (sit.level > 0) lock = c.lock[col][sit.level - 1] * clamp(sit.Iraw * 1.6, 0, 1) * (shield ? 0.6 : 1) * (1 - clamp(kurz, 0, 0.7));
  let boost = 0;
  if (HEALTH_JOBS.has(pkey)) boost = clamp(sit.I * 0.1, 0, 0.1);
  return { eff: r3(1 - sick), rev: r3(clamp(1 - lock + boost, 0.5, 1.15)), sick: r3(sick), lock: r3(lock) };
}

/* ------------------------------------------------------------------ Spielstand ------------------------------------------------------------------ */
function ensure(state) {
  if (!state.epi || typeof state.epi !== 'object') state.epi = {};
  const e = state.epi;
  if (e.hygUntil == null) e.hygUntil = -1;
  if (e.shieldUntil == null) e.shieldUntil = -1;
  if (e.sick === undefined) e.sick = null;
  if (!e.immune) e.immune = {};
  if (!e.warn) e.warn = {};
  if (e.vacc === undefined) e.vacc = null;
  if (e.cases == null) e.cases = 0;
  return e;
}
const isSick = (state) => !!(state.epi && state.epi.sick && state.epi.sick.until > state.day);
const hygOn = (state) => !!(state.epi && state.epi.hygUntil > state.day);
const shieldOn = (state) => !!(state.epi && state.epi.shieldUntil > state.day);
const vaccinatedFor = (state, waveId) => !!(state.epi && state.epi.vacc && state.epi.vacc.wave === waveId);

/** Persönliches Risiko (Faktor auf die Ansteckung); einzelne Teile für die Oberfläche. */
function personalRisk(world, state, year, waveId) {
  const talents = require('./talents');
  const age = (state.day - state.person.birthDay) / 365;
  const kon = state.talents && state.talents.v ? Number(state.talents.v.kondition) || 50 : 50;
  const f = { base: 1 };
  f.kondition = clamp(1.12 - 0.3 * ((kon - 50) / 50), 0.8, 1.3);
  f.age = age < 12 ? 0.85 : age >= 65 ? 1.2 : age >= 50 ? 1.08 : 1;
  f.insurance = state.insurance && state.insurance.gesundheit ? 0.9 : 1;
  f.health = state.meters && state.meters.health < 40 ? 1.25 : 1;
  f.hygiene = hygOn(state) ? 0.65 : 1;
  f.shield = shieldOn(state) ? 0.7 : 1;
  f.vacc = vaccinatedFor(state, waveId) ? 0.15 : 1;
  void talents;
  const total = Object.values(f).reduce((a, b) => a * b, 1);
  return { total: r3(total), parts: f, age };
}

const newbie = (state) => state.day < (Number(settings.get('game.newbie_protect_days')) || 0);

/**
 * Tagesablauf einer Spielfigur (Engine, nach der Gesundheit): Ansteckung, Krankheit, Warnungen, Erholung.
 * Rückgabe: Gesundheitsabzug heute (wirkt auf state.meters.health), Krankengeld-Faktor wird über isSick() gelesen.
 */
function daily(ctx, sit, year, doy, notices) {
  const { world, state } = ctx;
  const e = ensure(state);
  const c = C();
  if (!c.on) return;
  const m = state.meters;
  const age = (state.day - state.person.birthDay) / 365;
  // Warnungen (einmal je Welle und Phase)
  for (const w of sit.waves) {
    const st = e.warn[w.id] || 0;
    if (st < 1 && w.I > 0.02) { e.warn[w.id] = 1; notices.push({ level: 'warn', title: `Seuchenwarnung: ${w.name}`, tab: 'household', interrupt: true, text: `${w.name} hat deine Region erreicht. Du kannst dich mit einem Klick schützen.`, info: ['Eine Seuche breitet sich aus – von Stadt zu Stadt, über Wochen.', 'Sie macht krank, schwächt Betriebe und kann Läden und Gaststätten zum Schließen zwingen.', 'Schütze dich: Hygienepaket, Impfung (sobald verfügbar) oder ein Schutzkonzept – siehe Übersicht und Haushalt.'] }); }
    else if (st < 2 && w.I > 0.6) { e.warn[w.id] = 2; notices.push({ level: 'warn', title: `Höhepunkt: ${w.name}`, tab: 'household', text: 'Die Welle erreicht bei dir den Höhepunkt. In den nächsten Wochen ist Vorsicht klug.' }); }
    else if (st < 3 && w.phase === 'falling' && w.I < 0.08) { e.warn[w.id] = 3; notices.push({ level: 'good', title: `Entwarnung: ${w.name}`, tab: 'household', text: 'Die Welle ebbt ab. Maßnahmen werden gelockert, das Geschäft normalisiert sich.' }); }
  }
  if (ctx.offline || newbie(state)) { if (isSick(state)) recover(state, notices); return; }
  // Erkrankt: Gesundheit und Genesung
  if (isSick(state)) {
    const s = e.sick;
    const floor = age >= 60 ? 14 : 22;
    const drain = Math.min(4, 0.6 + 2.2 * s.sev);
    if (m.health > floor) m.health = Math.max(floor, m.health - drain);
    m.rest = Math.max(0, m.rest - 1.2);
    if (c.mortality.on && s.sev >= 0.4 && state.status === 'alive') {
      const frail = clamp((age - 55) / 30, 0, 1) + (m.health < 30 ? 0.4 : 0);
      const p = clamp(c.mortality.max * s.sev * frail * s.care * (s.vacc ? 0.3 : 1), 0, c.mortality.max);
      if (p > 0) {
        const r = rngFor('epi-death', state.seed, state.day, s.wave);
        if (r() < p) return { die: s.name };
      }
    }
    if (state.day >= s.until - 1) recover(state, notices);
    return;
  }
  // Ansteckung
  for (const w of sit.waves) {
    if (w.Ieff <= 0.01) continue;
    if (e.immune[w.id] && e.immune[w.id] > state.day) continue;
    const risk = personalRisk(world, state, year, w.id);
    const p = clamp(0.05 * w.Ieff * risk.total, 0, 0.5);
    const r = rngFor('epi', state.seed, state.day, w.id);
    if (r() >= p) continue;
    const insured = !!state.insurance.gesundheit;
    const cr = care(year);
    const talentsK = state.talents && state.talents.v ? Number(state.talents.v.kondition) || 50 : 50;
    const sev = clamp(w.sev * cr * (1.15 - 0.3 * (talentsK - 50) / 50) * (age >= 65 ? 1.25 : age < 12 ? 0.8 : 1) * (vaccinatedFor(state, w.id) ? 0.3 : 1) * (insured ? 0.85 : 1) * (hygOn(state) ? 0.9 : 1) * (0.9 + 0.2 * r()), 0.05, 1);
    const days = 4 + Math.round(8 * sev);
    e.sick = { wave: w.id, name: w.name, from: state.day, until: state.day + days, sev: r3(sev), care: cr, vacc: vaccinatedFor(state, w.id) };
    e.cases++;
    e.immune[w.id] = state.day + days + 150;
    state.pending.epiDoctor = true;
    notices.push({ level: 'bad', title: `Du bist erkrankt: ${w.name}`, tab: 'household', interrupt: true, text: `Du bist ${days} Tage krank. Lohn gibt es als Krankengeld (75 %), die Gesundheit sinkt etwas. Ruh dich aus und iss gut.`, info: ['Die Seuche hat dich erwischt.', 'Du genesen von allein; Krankenzusatz und gute Verfassung (Kondition) verkürzen die Folgen. Dein Leben ist nicht in Gefahr, solange du dich versorgst.', 'Iss gut, schlafe in einer Wohnung und kaufe Gesundheitskarten (ab 1960), wenn die Gesundheit sehr niedrig ist.'] });
    break;
  }
}
function recover(state, notices) {
  const e = state.epi; if (!e.sick) return;
  notices.push({ level: 'good', title: 'Wieder gesund', tab: 'household', text: `Du hast ${e.sick.name} überstanden. Eine Zeit lang bist du gegen diese Welle geschützt.` });
  e.sick = null;
}
/** Arztkosten beim Ausbruch (ohne Krankenzusatz). */
function doctorCost(world, state, year) {
  if (state.insurance && state.insurance.gesundheit) return 0;
  return Math.round(300 * world.idx(year) * (0.5 + 0.5 * care(year)));
}

/* ------------------------------------------------------------------ Schutz-Aktionen ------------------------------------------------------------------ */
function prices(world, state, year, sit) {
  const c = C(); const idx = world.idx(year);
  const firms = (state.companies || []).filter((x) => !x.abandoned);
  const biz = require('./business');
  const income = firms.reduce((s, f) => { try { return s + (biz.companyFlows(world, state, f, year).income || 0); } catch (_) { return s; } }, 0);
  const hyg = Math.round(c.price.hygiene * 100 * idx);
  const disc = 1 - 0.25 * ((sit && sit.hospital) || 0);
  return { hygiene: hyg, vaccine: Math.round(c.price.vaccine * 100 * idx * disc), shield: firms.length ? Math.round(income * c.price.shieldDays) : 0, hasFirms: firms.length > 0, hygDays: 45, shieldDays: 45 };
}
/** Was kann der Spieler jetzt tun? Für die Oberfläche und die Bots. */
function protections(world, state, year, sit) {
  const e = ensure(state);
  const pr = prices(world, state, year, sit);
  const wave = sit.waves.find((w) => w.I > 0.02 || w.daysToStart < 25) || null;
  const va = sit.vaccAvail;
  return {
    wave: wave ? wave.id : null,
    hygiene: { on: hygOn(state), cost: pr.hygiene, days: pr.hygDays, left: Math.max(0, e.hygUntil - state.day) },
    vaccine: { available: !!va, name: va ? va.name : null, done: !!(va && vaccinatedFor(state, va.wave)), cost: pr.vaccine },
    shield: { on: shieldOn(state), cost: pr.shield, days: pr.shieldDays, left: Math.max(0, e.shieldUntil - state.day), firms: pr.hasFirms },
  };
}

/** Schutz kaufen (reine Zustandsänderung). what: hygiene | vaccine | shield. Wirft Error mit Hinweistext. */
function protect(world, state, year, sit, what) {
  const e = ensure(state);
  const pr = prices(world, state, year, sit);
  const bad = (m) => { const err = new Error(m); err.protect = true; return err; };
  if (state.status !== 'alive') throw bad('Dafür brauchst du einen lebenden Charakter.');
  if (what === 'hygiene') {
    if (hygOn(state)) throw bad('Dein Hygienepaket wirkt noch.');
    if (state.money < pr.hygiene) throw bad('Dafür fehlt dir das Geld.');
    state.money -= pr.hygiene; state.stats.spent += pr.hygiene; e.hygUntil = state.day + pr.hygDays;
    return { cost: pr.hygiene, msg: `Hygienepaket gekauft: Masken, Seife, Abstand – ${pr.hygDays} Tage weniger Ansteckungsrisiko.` };
  }
  if (what === 'vaccine') {
    const va = sit.vaccAvail;
    if (!va) throw bad('Es gibt noch keinen Impfstoff.');
    if (vaccinatedFor(state, va.wave)) throw bad('Du bist gegen diese Welle schon geimpft.');
    if (state.money < pr.vaccine) throw bad('Dafür fehlt dir das Geld.');
    state.money -= pr.vaccine; state.stats.spent += pr.vaccine; e.vacc = { wave: va.wave, day: state.day };
    return { cost: pr.vaccine, msg: `Geimpft gegen ${va.name}: Du steckst dich kaum noch an und erkrankst, wenn überhaupt, leichter.` };
  }
  if (what === 'shield') {
    if (shieldOn(state)) throw bad('Dein Schutzkonzept läuft noch.');
    if (pr.hasFirms) {
      const firms = state.companies.filter((x) => !x.abandoned);
      if (firms.reduce((s, f) => s + f.cash, 0) + state.money < pr.shield) throw bad('Dafür fehlt Geld in der Firmenkasse.');
      let left = pr.shield;
      for (const f of firms) { const take = Math.min(left, Math.max(0, f.cash)); f.cash -= take; left -= take; }
      if (left > 0) { state.money -= left; state.stats.spent += left; }
    }
    e.shieldUntil = state.day + pr.shieldDays;
    return { cost: pr.shield, msg: pr.hasFirms ? `Schutzkonzept für deine Betriebe (Homeoffice, Schichten, Tests): ${pr.shieldDays} Tage weniger Krankenstand und kleinere Einbußen.` : `Du schränkst Kontakte ein: ${pr.shieldDays} Tage weniger Ansteckungsrisiko, dafür etwas weniger Abwechslung.` };
  }
  throw bad('Unbekannte Schutzmaßnahme.');
}

/** Kurzfassung für die Oberfläche (Banner). */
function view(world, state, year, doy, city, ef) {
  const sit = situation(world, year, doy, city, ef);
  const e = ensure(state);
  const w = sit.waves.filter((x) => x.I > 0.02 || x.daysToStart < 25).sort((a, b) => b.Ieff - a.Ieff)[0] || null;
  const level = (name) => (I) => (I >= 0.6 ? 'hoch' : I >= 0.25 ? 'mittel' : I > 0.02 ? 'gering' : 'keine');
  void level;
  const lvl = w ? (w.I >= 0.6 ? 'hoch' : w.I >= 0.25 ? 'mittel' : w.I > 0.02 ? 'gering' : 'keine') : 'keine';
  return {
    on: C().on, active: !!w, wave: w ? { id: w.id, name: w.name, kind: w.kind, phase: w.phase, level: lvl, I: w.I, Ieff: w.Ieff, daysToStart: w.daysToStart, daysToPeak: w.daysToPeak, end: w.end } : null,
    measure: { level: sit.level, name: MEASURE_NAME[sit.level], short: MEASURE_SHORT[sit.level], cap: sit.cap },
    local: { hygiene: sit.hyg, hospital: sit.hospital, vacc: Math.round(sit.vacc * 100) },
    me: { sick: isSick(state) ? { name: e.sick.name, daysLeft: Math.max(0, e.sick.until - state.day), sev: e.sick.sev } : null, immune: Object.entries(e.immune).some(([id, u]) => u > state.day && sit.waves.some((x) => x.id === id)), protected: newbie(state), cases: e.cases },
    protect: protections(world, state, year, sit),
    sickShare: Math.round(sit.sickShare * 1000) / 10,
    risk: w ? personalRisk(world, state, year, w.id).total : 1,
  };
}

module.exports = {
  C, HIST, MEASURE_NAME, MEASURE_SHORT, waves, originOf, distTo, intensity, timing, situation, firmEffects, care, ensure, isSick, hygOn, shieldOn, vaccinatedFor, personalRisk, daily,
  doctorCost, prices, protections, protect, view, newbie, lastEnd, NO_EF, abs,
};
