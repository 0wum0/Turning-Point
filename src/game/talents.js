'use strict';
/**
 * Talente: sechs Begabungen (1–100) für Spielfigur, Partner, Kinder und Mitarbeiter.
 *   Handwerk · Handel · Führung · Bildung · Charme · Kondition
 * Jede Person hat ein Profil { v: [6 Werte], b: [6 Anlagen] }. b ist die Anlage bei Geburt/Einstellung, v der aktuelle Wert.
 * v wächst durch Nutzung und Förderung höchstens bis cap = min(100, b + growRoom) und fällt nie unter den Boden (floor).
 * Alles hier ist rein und deterministisch (Samen aus dem Spielstand); Wirkungen sind gedeckelt und über die Einstellung „talente“ skalierbar.
 */
const settings = require('../settings');
const { rngFor, int, pick } = require('./rng');
const { randomFirstName, LAST } = require('./content');
const { yearOf } = require('./calendar');

const KEYS = ['handwerk', 'handel', 'fuehrung', 'bildung', 'charme', 'kondition'];
const IDX = Object.fromEntries(KEYS.map((k, i) => [k, i]));
const META = {
  handwerk: { label: 'Handwerk', icon: 'hammer', desc: 'Geschick mit den Händen: bessere Qualität in Werkstatt, Bau und Produktion.' },
  handel: { label: 'Handel', icon: 'handshake', desc: 'Verhandeln und Verkaufen: bessere Spannen im Laden, bei Verträgen und Geschäften.' },
  fuehrung: { label: 'Führung', icon: 'crown', desc: 'Menschen leiten: ein gut geführtes Team arbeitet besser; hilft bei Gehaltsgesprächen und Wahlen.' },
  bildung: { label: 'Bildung', icon: 'graduation-cap', desc: 'Schnell lernen: kürzere Kurse, Lehren und Studien; hilft vor Gericht.' },
  charme: { label: 'Charme', icon: 'sparkles', desc: 'Menschen für sich gewinnen: Beziehungen, Ansehen, Bewerbungen und Wahlen.' },
  kondition: { label: 'Kondition', icon: 'heart-pulse', desc: 'Ausdauer und Gesundheit: seltener krank, mehr Erholung, längeres Leben.' },
};
/** Förderprogramme für Kinder: Schlüssel → Talent. */
const FOSTER = {
  nachhilfe: { key: 'bildung', label: 'Nachhilfe', icon: 'book-open' },
  sport: { key: 'kondition', label: 'Sportverein', icon: 'dumbbell' },
  musik: { key: 'charme', label: 'Musik und Theater', icon: 'music' },
  werkstatt: { key: 'handwerk', label: 'Werkstatt-AG', icon: 'hammer' },
  kaufmann: { key: 'handel', label: 'Kaufmannsladen', icon: 'store' },
  jugend: { key: 'fuehrung', label: 'Jugendgruppe', icon: 'users' },
};
/** Welche Talente ein Berufsfeld verlangt (Gewichte summieren zu 1). */
const CAT_W = {
  handwerk: { handwerk: 0.7, kondition: 0.3 }, bau: { handwerk: 0.6, kondition: 0.4 }, industrie: { handwerk: 0.5, bildung: 0.5 },
  landwirtschaft: { handwerk: 0.5, kondition: 0.5 }, verkehr: { kondition: 0.5, handel: 0.5 }, gastronomie: { charme: 0.5, handwerk: 0.5 },
  dienstleistung: { charme: 0.5, handel: 0.5 }, kreativ: { bildung: 0.5, charme: 0.5 }, energie: { bildung: 0.5, handwerk: 0.5 },
  technik: { bildung: 0.6, handwerk: 0.4 }, akademisch: { bildung: 0.7, fuehrung: 0.3 },
};
const W_TRADE = { handel: 0.6, charme: 0.4 }; const W_LEAD = { fuehrung: 0.5, charme: 0.5 }; const W_BODY = { kondition: 0.6, charme: 0.4 };
const RE_TRADE = /haendler|kauf|verkaeufer|kassierer|milchmann|makler|finanzwirt|werbe|online/; const RE_LEAD = /polizist|erzieher|lehrer|manager|betreuer|jurist/; const RE_BODY = /fitness|hafenarbeiter|pflege|bergmann|zusteller|reinig/;
const EVEN = { handwerk: 1 / 6, handel: 1 / 6, fuehrung: 1 / 6, bildung: 1 / 6, charme: 1 / 6, kondition: 1 / 6 };

const num = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const C = () => { const c = settings.get('talente') || {}; return c; };
const enabled = () => C().enabled !== false;
const E = () => { const c = C(); const e = c.effects || {}; return { s: enabled() ? clamp(num(e.strength, 1), 0, 2) : 0, e }; };
/** Wirkung in Prozent/Punkten: Basiswert × Stärke. */
const eff = (name, d) => { const { s, e } = E(); return s * num(e[name], d); };
const floorV = () => clamp(Math.round(num(C().floor, 5)), 1, 30);
const hardCap = () => clamp(Math.round(num(C().cap, 100)), 50, 100);
const gauss = (r) => (r() + r() + r() - 1.5) * 2; // Streuung ≈ 1
const norm = (v) => clamp((num(v, 50) - 50) / 50, -1, 1); // −1 … +1 um die Mitte 50

/* ------------------------------------------------------------ Profile ------------------------------------------------------------ */
const clampT = (v, hi) => clamp(Math.round(num(v, 50)), floorV(), hi == null ? hardCap() : hi);

function newProfile(r, tilt) {
  const c = C(); const sd = num((c.inherit || {}).spread, 14); const hi = num(c.birthMax, 95);
  const b = KEYS.map((k) => clampT(50 + gauss(r) * sd + ((tilt && tilt[k]) || 0), hi));
  return { v: b.slice(), b };
}
/** Kind (oder Spielfigur) aus zwei Elternprofilen: Mittel, ein Stück Rückkehr zur Mitte, Mutation. */
function fromParents(a, b, r) {
  const c = C(); const inh = c.inherit || {}; const reg = clamp(num(inh.regress, 15), 0, 100) / 100; const mut = clamp(num(inh.mutation, 12), 0, 40); const hi = num(c.birthMax, 95);
  const pa = ensure(a, r); const pb = ensure(b, r);
  const base = KEYS.map((k, i) => {
    const m = (pa.v[i] + pb.v[i]) / 2;
    const m2 = m + (50 - m) * reg;
    return clampT(m2 + (r() * 2 - 1) * mut, hi);
  });
  return { v: base.slice(), b: base };
}
/** Profil prüfen/reparieren (idempotent). Fehlt es, wird es aus r erzeugt. */
function ensure(p, r) {
  if (!p || !Array.isArray(p.v) || p.v.length !== KEYS.length) return newProfile(r || (() => 0.5));
  if (!Array.isArray(p.b) || p.b.length !== KEYS.length) p.b = p.v.slice();
  for (let i = 0; i < KEYS.length; i++) {
    p.v[i] = clampT(p.v[i]); p.b[i] = clampT(p.b[i]);
    if (p.v[i] > capAt(p, i)) p.v[i] = capAt(p, i);
  }
  return p;
}
const clone = (p) => (p ? { v: p.v.slice(), b: p.b.slice() } : null);
const capAt = (p, i) => Math.min(hardCap(), Math.max(p.v[i], (p.b ? p.b[i] : p.v[i]) + clamp(Math.round(num(C().growRoom, 25)), 0, 60)));
const val = (p, key) => (p && p.v ? p.v[IDX[key]] : 50);
const avg = (p) => (p && p.v ? p.v.reduce((s, x) => s + x, 0) / KEYS.length : 50);

/** Talent um pts Punkte steigern (höchstens bis zur Obergrenze). Gibt die tatsächlich gewonnenen Punkte zurück. */
function grow(p, key, pts) {
  const i = IDX[key]; if (i == null || !p) return 0;
  const before = p.v[i]; const cap = capAt(p, i);
  p.v[i] = clamp(Math.round(before + Math.max(0, num(pts, 0))), floorV(), cap);
  return p.v[i] - before;
}

const BANDS = ['gering', 'solide', 'stark', 'herausragend'];
const bandOf = (v) => (v < 40 ? 0 : v < 60 ? 1 : v < 75 ? 2 : 3);
const bandName = (v) => BANDS[bandOf(v)];

/** Anzeige: sechs Balken. Bei hidden=true (kleine Kinder) nur grobe Stufen (Anlagen). */
function bars(p, hidden) {
  const q = ensure(p ? clone(p) : null);
  return KEYS.map((k, i) => ({
    key: k, label: (C().labels || {})[k] || META[k].label, icon: META[k].icon,
    v: hidden ? null : q.v[i], cap: hidden ? null : capAt(q, i), band: bandOf(q.v[i]), bandName: BANDS[bandOf(q.v[i])], b: hidden ? null : q.b[i],
  }));
}
function best(p) { let bi = 0; KEYS.forEach((k, i) => { if (p.v[i] > p.v[bi]) bi = i; }); return KEYS[bi]; }

/* ------------------------------------------------------------ Berufe, Passung ------------------------------------------------------------ */
function weightsFor(world, pkey) {
  const p = world && world.prof ? world.prof(pkey) : null;
  const key = String(pkey || '');
  if (RE_TRADE.test(key)) return W_TRADE;
  if (RE_LEAD.test(key)) return W_LEAD;
  if (RE_BODY.test(key)) return W_BODY;
  return CAT_W[(p && p.category) || ''] || EVEN;
}
/** Passung eines Profils zu Gewichten, 0–100. */
function fit(p, w) {
  if (!p || !p.v) return 50;
  let s = 0; let t = 0;
  for (const [k, x] of Object.entries(w || EVEN)) { s += (p.v[IDX[k]] || 50) * x; t += x; }
  return Math.round(t > 0 ? s / t : 50);
}
const fitFor = (world, p, pkey) => fit(p, weightsFor(world, pkey));
const topKeys = (w) => Object.entries(w).sort((a, b) => b[1] - a[1]).map((x) => x[0]);

/** Passung zu den Schulformen: Gymnasium → Bildung, Realschule → Handel/Charme/Führung, Hauptschule → Handwerk/Kondition. */
function schoolFit(p) {
  return { haupt: fit(p, { handwerk: 0.5, kondition: 0.5 }), real: fit(p, { handel: 0.4, charme: 0.3, fuehrung: 0.3 }), gym: fit(p, { bildung: 1 }) };
}
const REC = {
  handwerk: 'Handwerkliches Talent – eine Ausbildung im Handwerk?',
  handel: 'Talent für Handel – Kaufmannslehre?',
  fuehrung: 'Führungstalent – später einen Betrieb leiten?',
  bildung: 'Lernstark – Gymnasium und Studium?',
  charme: 'Gewinnend – ein Beruf mit Menschen, vielleicht sogar Politik?',
  kondition: 'Sportlich und robust – ein körperlicher Beruf oder Sport fördern?',
};
function recommendation(p, age) {
  if (age < num(C().revealAge, 6)) return 'Noch zu klein – die Begabung zeigt sich mit etwa 6 Jahren.';
  const k = best(p);
  if (p.v[IDX[k]] < 55) return 'Ein ausgewogenes Kind – es kann vieles werden. Fördern hilft in jede Richtung.';
  return REC[k];
}

/* ------------------------------------------------------------ Wirkungen ------------------------------------------------------------ */
/** Umsatzfaktor eines Betriebs aus der Teamqualität (0–100). */
function revenueMult(q) { const m = eff('revenuePct', 12) / 100; return r2(clamp(1 + m * norm(q), 0.85, 1.15)); }
/** Lieferzuverlässigkeit (Einheiten, die ein Verkäufer wirklich liefern kann). */
function reliability(q) { const m = eff('reliabilityPct', 6) / 100; return r2(clamp(1 + m * norm(q), 0.9, 1.1)); }
/** Lohnfaktor einer Fachkraft aus der Passung: Talent kostet Geld (Mittelwert ≈ 1). */
function wageMult(f) { const m = eff('wagePct', 20) / 100; return r2(clamp(1 + m * norm(f), 0.75, 1.3)); }
/** Lohnfaktor einer angestellten Spielfigur aus der Passung zum Beruf. */
function jobWageMult(p, w) { return r2(clamp(1 + (eff('jobWagePct', 6) / 100) * norm(fit(p, w)), 0.94, 1.06)); }
/** Zusatz auf die Bewerbungschance (Prozentpunkte). */
function applyPts(p) { return r1(eff('applyPts', 5) * norm((val(p, 'charme') + val(p, 'fuehrung')) / 2)); }
/** Zusatz auf die Chance im Gehaltsgespräch (0–1). */
function raiseBonus(p) { return r2(eff('raisePct', 6) / 100 * norm((val(p, 'charme') * 0.5 + val(p, 'fuehrung') * 0.5))); }
/** Faktor auf Dauer von Kursen, Lehre und Studium (Bildung: schneller < 1). */
function studyMult(p) { return r2(clamp(1 - (eff('studyPct', 20) / 100) * norm(val(p, 'bildung')), 0.75, 1.25)); }
/** Gesundheitsziel-Zuschlag (Punkte) und Erholung durch Kondition. */
function healthPts(p) { return r1(eff('healthPts', 4) * norm(val(p, 'kondition'))); }
function restPts(p) { return r1(eff('restPts', 1) * norm(val(p, 'kondition'))); }
/** Lebenserwartung in Tagen (± wenige Jahre). */
function lifeDays(p) { return Math.round(eff('lifeDaysPerPt', 11) * (val(p, 'kondition') - 50)); }
/** Zufriedenheit des Partners: Charme und Bildung der Spielfigur (Punkte im Zielwert). */
function partnerPts(p) { return r1(eff('partnerPts', 5) * norm((val(p, 'charme') * 0.6 + val(p, 'bildung') * 0.4))); }
/** Kinderzufriedenheit durch Charme/Bildung der Eltern (Mittel beider Eltern, soweit bekannt). */
function childPts(p) { return r1(eff('childPts', 3) * norm((val(p, 'charme') + val(p, 'bildung')) / 2)); }
/** Faktor auf positive Ansehen-Zuwächse. */
function repGain(p) { return r2(clamp(1 + (eff('repGainPct', 15) / 100) * norm(val(p, 'charme')), 0.85, 1.15)); }
/** Gewicht bei Wahlen (Stimmen-Faktor). */
function voteWeight(p) { return r2(clamp(1 + (eff('votePct', 6) / 100) * norm((val(p, 'charme') + val(p, 'fuehrung')) / 2), 0.94, 1.06)); }
/** Zusatz auf die Wahlchance der schnellen Kandidatur (0–1). */
function chanceBonus(p) { return r2(eff('chancePct', 5) / 100 * norm((val(p, 'charme') + val(p, 'fuehrung')) / 2)); }
/** Punkte in der Verteidigung vor Gericht (Bildung, Charme). */
function courtPts(p) { return r1(eff('courtPts', 3) * norm((val(p, 'bildung') + val(p, 'charme')) / 2)); }
/** Zusatz auf die Entdeckungschance bei Sabotage/Spionage (Faktor um 1, Handel/Führung). */
function detectMult(p) { return r2(clamp(1 + (eff('detectPct', 5) / 100) * norm((val(p, 'handel') + val(p, 'fuehrung')) / 2), 0.9, 1.1)); }

/* ------------------------------------------------------------ Bildungspolitik ------------------------------------------------------------ */
const ZERO_EDU = { school: 0, library: 0, sport: 0, courseDisc: 0, lehrSubsidy: 0 };
function eduOf(world, cityId) {
  try { const x = require('./goods').effectsFor(world, cityId).edu; return x ? { ...ZERO_EDU, ...x } : ZERO_EDU; } catch (_) { return ZERO_EDU; }
}
const growMult = (edu) => 1 + (num(((C().edu || {}).schoolPct), 10) / 100) * clamp(num(edu && edu.school, 0), 0, 3);

/* ------------------------------------------------------------ Betrieb: Team ------------------------------------------------------------ */
const WEEK = (day) => Math.floor(day / 7);

function cityTier(world, cityId) { const c = world && world.city ? world.city(cityId) : null; return c ? num(c.size_tier, 2) : 2; }
function poolMean(world, state, cityId) {
  const p = C().pool || {}; const year = yearOf(state.day, state.startYear);
  const prog = clamp((year - 1945) / 155, 0, 1);
  return num(p.mean, 46) + num(p.tierBonus, 2) * cityTier(world, cityId) + num(p.eraBonus, 4) * prog;
}
function person(r, state, gender) {
  const year = yearOf(state.day, state.startYear);
  const g = gender || (r() < 0.5 ? 'm' : 'f');
  return { name: `${randomFirstName(r, year, g)} ${pick(r, LAST)}`, g };
}
function memberFrom(r, state, mean, opts = {}) {
  const sd = num((C().inherit || {}).spread, 14) * 0.85; const p = person(r, state);
  const spec = int(r, 0, KEYS.length - 1);
  const b = KEYS.map((k, i) => clampT(mean + gauss(r) * sd + (i === spec ? 9 : 0), 92));
  return { name: p.name, g: p.g, age: opts.lehr ? int(r, 16, 18) : int(r, 19, 56), v: b.slice(), b };
}
/** Bewerberpool einer Firma für die laufende Woche (deterministisch je Spielstand, Betrieb, Woche). */
function applicants(world, state, c) {
  const cf = C(); const pc = cf.pool || {}; const week = WEEK(state.day);
  const tier = cityTier(world, c.cityId);
  const size = clamp(Math.round(num(pc.size, 4)) + (tier >= 4 ? 1 : 0) - (tier <= 1 ? 1 : 0), 3, 5);
  const nL = clamp(Math.round(num(pc.apprentices, 2)), 0, 4);
  const mean = poolMean(world, state, c.cityId);
  const w = weightsFor(world, c.pkey);
  const taken = c.pool && c.pool.week === week ? c.pool.taken || [] : [];
  const mk = (i, lehr) => {
    const r = rngFor('tal-app', state.seed || 0, c.id, week, lehr ? 'l' : 's', i);
    const m = memberFrom(r, state, lehr ? mean - 12 : mean, { lehr });
    const f = fit(m, w);
    return { id: `${week}.${lehr ? 'l' : 's'}${i}`, lehr: !!lehr, name: m.name, g: m.g, age: m.age, v: m.v, b: m.b, fit: f, w: lehr ? 0 : wageMult(f) };
  };
  const staff = []; const apps = [];
  for (let i = 0; i < size; i++) staff.push(mk(i, false));
  for (let i = 0; i < nL; i++) apps.push(mk(i, true));
  const open = staff.filter((x) => !taken.includes(x.id));
  const bestId = open.length ? open.slice().sort((a, b) => (b.fit - a.fit) || (a.w - b.w))[0].id : null;
  return { week, staff: staff.map((x) => ({ ...x, taken: taken.includes(x.id), best: x.id === bestId })), apprentices: apps.map((x) => ({ ...x, taken: taken.includes(x.id) })), bestId };
}
const markTaken = (state, c, id) => { const week = WEEK(state.day); if (!c.pool || c.pool.week !== week) c.pool = { week, taken: [] }; if (!c.pool.taken.includes(id)) c.pool.taken.push(id); };

function lehrCfg() { const a = C().apprentice || {}; return { max: clamp(Math.round(num(a.max, 2)), 0, 6), days: Math.round(num(a.years, 3) * 365), wagePct: clamp(num(a.wagePct, 45), 10, 100) / 100, every: Math.max(10, num(a.everyDays, 90)), meister: Math.max(1, num(a.meisterMult, 1.5)) }; }
const isLehr = (m) => !!(m && m.lehr);

/** Einen Bewerber einstellen (verändert den Betrieb, nicht Geld). */
function hire(world, state, c, cand) {
  const team = c.team || (c.team = []);
  const id = c.nextMember || 1; c.nextMember = id + 1;
  const m = { id, name: cand.name, g: cand.g, age0: cand.age, since: state.day, v: cand.v.slice(), b: cand.b.slice(), w: cand.lehr ? 1 : cand.w, lehr: null, ask: null };
  if (cand.lehr) m.lehr = { start: state.day, end: state.day + lehrCfg().days, last: state.day };
  team.push(m);
  c.staff = Math.max(c.staff || 0, team.length);
  markTaken(state, c, cand.id);
  return m;
}

/** Team an die Kopfzahl angleichen: fehlende Mitarbeiter werden deterministisch erzeugt, überzählige (schwächste) entfernt. */
function syncTeam(world, state, c) {
  if (!c || c.abandoned) { if (c && c.team && !c.staff) c.team = []; return c; }
  const team = c.team || (c.team = []);
  const staff = Math.max(0, Math.floor(num(c.staff, 0)));
  while (team.length > staff) {
    const w = weightsFor(world, c.pkey); let wi = 0;
    team.forEach((m, i) => { const sc = fit(m, w) - (isLehr(m) ? 5 : 0); const cs = fit(team[wi], w) - (isLehr(team[wi]) ? 5 : 0); if (sc < cs) wi = i; });
    team.splice(wi, 1);
  }
  while (team.length < staff) {
    const id = c.nextMember = c.nextMember || 1; c.nextMember = id + 1;
    const r = rngFor('tal-staff', state.seed || 0, c.id, id);
    const m = memberFrom(r, state, poolMean(world, state, c.cityId));
    team.push({ id, name: m.name, g: m.g, age0: m.age, since: state.day, v: m.v, b: m.b, w: wageMult(fit(m, weightsFor(world, c.pkey))), lehr: null, ask: null });
  }
  return c;
}

/** Teamqualität 0–100 (50 = durchschnittlich): Fachwissen der Mitarbeiter, Leitung durch Chef/Manager. */
function teamQuality(world, state, c) {
  const w = weightsFor(world, c.pkey); const team = c.team || [];
  const heads = [];
  for (const m of team) heads.push(isLehr(m) ? 50 : fit(m, w));
  for (let i = team.length; i < Math.max(0, Math.floor(num(c.staff, 0))); i++) heads.push(50);
  const ownerHere = state.occupation && state.occupation.ownCompanyId === c.id;
  const me = state.talents;
  if (ownerHere) heads.push(fit(me, w));
  for (const ps of c.playerStaff || []) heads.push(ps.tal ? fit(ps.tal, w) : 50);
  const skill = heads.length ? heads.reduce((s, x) => s + x, 0) / heads.length : 50;
  const lead = c.playerManager ? (c.playerManager.tal ? val(c.playerManager.tal, 'fuehrung') * 0.6 + val(c.playerManager.tal, 'handel') * 0.4 : 50)
    : c.manager ? 55 : (me ? val(me, 'fuehrung') * 0.6 + val(me, 'handel') * 0.4 : 50);
  const q = clamp(0.8 * skill + 0.2 * lead, 0, 100);
  return { q: r1(q), skill: r1(skill), lead: r1(lead), heads: heads.length };
}
/** Alles, was die Tagesrechnung eines Betriebs braucht (ohne Nebenwirkungen). */
function firmEffects(world, state, c, edu) {
  if (!enabled()) return { q: 50, rev: 1, rel: 1, wageUnits: null };
  const t = teamQuality(world, state, c);
  const team = c.team || []; const lc = lehrCfg();
  const sub = clamp(num(edu && edu.lehrSubsidy, 0), 0, 80) / 100;
  let units = 0;
  for (const m of team) units += isLehr(m) ? lc.wagePct * (1 - sub) : clamp(num(m.w, 1), 0.7, 1.4);
  units += Math.max(0, Math.floor(num(c.staff, 0)) - team.length);
  return { q: t.q, rev: revenueMult(t.q), rel: reliability(t.q), wageUnits: units, skill: t.skill, lead: t.lead };
}

/** Marktlohn eines Mitarbeiters aus seiner heutigen Passung. */
const marketWage = (world, c, m) => wageMult(fit(m, weightsFor(world, c.pkey)));

/** Täglich je Betrieb: Lehre, Lohnforderungen, Kündigungen. Liefert Meldungen als [{level,title,text}]. */
function firmDaily(world, state, c, ctx = {}) {
  const out = [];
  if (!enabled() || !c || c.abandoned) return out;
  syncTeam(world, state, c);
  const team = c.team; const lc = lehrCfg(); const w = weightsFor(world, c.pkey);
  const edu = eduOf(world, c.cityId);
  const meister = ownerMaster(state, c) ? lc.meister : 1;
  for (let i = team.length - 1; i >= 0; i--) {
    const m = team[i];
    if (m.lehr) {
      const every = lc.every / meister;
      if (state.day - (m.lehr.last || m.lehr.start) >= every) {
        m.lehr.last = state.day;
        const keys = topKeys(w).slice(0, 2);
        grow(m, keys[int(rngFor('tal-lehr', state.seed || 0, c.id, m.id, state.day), 0, keys.length - 1)], 1 * growMult(edu));
      }
      if (state.day >= m.lehr.end) {
        m.lehr = null; m.w = marketWage(world, c, m);
        out.push({ level: 'good', title: `${m.name} hat die Lehre beendet`, text: `${m.name} ist jetzt Fachkraft in ${c.name} (Passung ${fit(m, w)} %).` });
      }
    }
    if (m.course && state.day >= m.course.end) {
      const cr = m.course; m.course = null;
      const gain = grow(m, cr.key, cr.pts);
      out.push({ level: 'good', title: `Kurs beendet: ${m.name}`, text: `${m.name} ist besser in ${(C().labels || {})[cr.key] || META[cr.key].label}${gain ? ` (+${gain})` : ' – mehr geht in diesem Bereich nicht'}.` });
    }
    if (m.ask && state.day >= m.ask.until) {
      if (ctx.offline) { m.w = m.ask.w; m.ask = null; }
      else { team.splice(i, 1); c.staff = Math.max(0, (c.staff || 0) - 1); out.push({ level: 'warn', title: `${m.name} kündigt`, text: `${m.name} wollte mehr Lohn und wechselt nun zu einem anderen Betrieb.` }); }
    }
  }
  return out;
}
function ownerMaster(state, c) {
  try { return require('./core').levelIndex(state, c.pkey) >= 3 && (state.skills.learned || []).includes(c.pkey); } catch (_) { return false; }
}

/** Jährlich (Neujahr): Lernen durch Arbeit, Politik (Bibliothek, Sport), Lohnforderungen. */
function yearly(world, state) {
  const out = [];
  if (!enabled() || !state || !state.talents) return out;
  const year = yearOf(state.day, state.startYear); const cf = C(); const tr = cf.train || {};
  const edu = eduOf(world, state.cityId); const lv = num((cf.edu || {}).levelPts, 0.34);
  const rnd = (...p) => rngFor('tal-yr', state.seed || 0, year, ...p)();
  // Spielfigur: Arbeit schult das Berufsfeld; Bibliothek/Sportstätten der Stadt helfen allen
  const occ = state.occupation;
  if (occ && occ.kind === 'work') {
    const w = weightsFor(world, occ.pkey);
    for (const k of topKeys(w).slice(0, 2)) if (rnd('job', k) < num(tr.yearPct, 50) / 100) grow(state.talents, k, num(tr.yearPts, 1));
  }
  const bump = (p, tag) => {
    if (!p) return;
    if (edu.library && rnd(tag, 'bil') < edu.library * lv) grow(p, 'bildung', 1);
    if (edu.sport && rnd(tag, 'kon') < edu.sport * lv) grow(p, 'kondition', 1);
  };
  bump(state.talents, 'me'); if (state.partner) bump(state.partner.tal, 'pa');
  for (const k of state.children) if (k.tal && k.status === 'home') {
    bump(k.tal, `k${k.id}`);
    const age = Math.floor((state.day - k.born) / 365);
    if (edu.school && age >= 6 && age < 18 && rnd(`k${k.id}`, 'sch') < edu.school * lv) grow(k.tal, 'bildung', 1);
  }
  // Mitarbeiter: Berufspraxis; Lohnforderung bei deutlich gewachsenem Marktwert
  for (const c of state.companies || []) {
    if (c.abandoned) continue;
    syncTeam(world, state, c);
    const w = weightsFor(world, c.pkey);
    for (const m of c.team) {
      if (!m.lehr) for (const k of topKeys(w).slice(0, 2)) if (rnd('f', c.id, m.id, k) < num(tr.yearPct, 50) / 100) grow(m, k, num(tr.yearPts, 1));
      if (!m.lehr && !m.ask) {
        const mk = marketWage(world, c, m);
        if (mk > num(m.w, 1) + num((cf.raise || {}).margin, 0.06)) { m.ask = { w: mk, until: state.day + Math.round(num((cf.raise || {}).askDays, 30)) }; out.push({ level: 'warn', title: `${m.name} verlangt mehr Lohn`, text: `${c.name}: ${m.name} ist besser geworden und fordert ${Math.round((mk / Math.max(0.01, m.w) - 1) * 100)} % mehr. Du hast ${Math.round(num((cf.raise || {}).askDays, 30))} Tage Zeit.`, tab: 'business' }); }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ Kinder: Fördern ------------------------------------------------------------ */
function fosterCost(world, idx) { const f = C().foster || {}; return Math.round(num(world.econ.childCostPerDay, 90) * idx * num(f.feeDays, 15)); }
function fosterStart(world, state, c, focus, idx) {
  const f = C().foster || {}; const F = FOSTER[focus];
  if (!F) return { err: 'Unbekanntes Förderprogramm.' };
  if (!c.tal) return { err: 'Dieses Kind hat noch kein Talentprofil.' };
  if (c.status !== 'home') return { err: 'Nur Kinder zu Hause können gefördert werden.' };
  const age = Math.floor((state.day - c.born) / 365);
  if (age < num(f.minAge, 3)) return { err: `Gefördert wird ab ${num(f.minAge, 3)} Jahren.` };
  if (age > num(f.maxAge, 17)) return { err: 'Das Kind ist dafür zu alt.' };
  if (c.foster) return { err: 'Es läuft schon ein Förderprogramm.' };
  const cap = capAt(c.tal, IDX[F.key]);
  if (c.tal.v[IDX[F.key]] >= cap) return { err: `${(C().labels || {})[F.key] || META[F.key].label} ist bei diesem Kind schon voll ausgebildet.` };
  return { ok: true, key: F.key, cost: fosterCost(world, idx), days: Math.round(num(f.days, 90)), pts: num(f.pts, 4) };
}
function fosterDaily(world, state, c) {
  if (!c.foster || state.day < c.foster.end) return null;
  const fo = c.foster; c.foster = null;
  const mult = growMult(eduOf(world, c.cityId != null ? c.cityId : state.cityId));
  const gain = grow(c.tal, fo.key, Math.round(fo.pts * mult));
  c.sat = clamp(num(c.sat, 70) + num((C().foster || {}).sat, 6), 0, 100);
  return { key: fo.key, gain };
}

/* ------------------------------------------------------------ Kurse für Mitarbeiter, Profile im Spielstand ------------------------------------------------------------ */
function courseOffer(world, state, c, m, key, idx, edu) {
  const t = C().train || {}; const e = edu || eduOf(world, c.cityId);
  const fee = Math.round(num(world.econ.companies.staffWage, 500) * idx * num(t.courseFeeDays, 25) * (1 - clamp(e.courseDisc, 0, 60) / 100));
  const days = Math.round(num(t.courseDays, 45) * studyMult(state.talents));
  return { fee, days, pts: num(t.coursePts, 4) + (e.courseDisc >= 20 ? 1 : 0) };
}

/** Alle Profile eines Spielstands sicherstellen (neue Charaktere, Altspielstände). Idempotent; nutzt feste Samen. */
function ensureAll(state) {
  if (!state || !state.person) return state;
  const seed = state.seed || 0;
  const tree = state.tree && state.tree.persons ? state.tree.persons : [];
  for (const p of tree) if (p.role === 'parent' && !validProfile(p.tal)) p.tal = newProfile(rngFor('tal-per', seed, p.id));
  if (!validProfile(state.talents)) {
    const me = tree.find((x) => x.id === state.person.id);
    const par = me && me.parents ? me.parents.map((id) => tree.find((x) => x.id === id)).filter(Boolean) : [];
    state.talents = par.length === 2 && par.every((x) => validProfile(x.tal)) ? fromParents(par[0].tal, par[1].tal, rngFor('tal-me', seed, state.person.id)) : newProfile(rngFor('tal-me', seed, state.person.id));
  } else ensure(state.talents);
  if (state.partner) {
    if (!validProfile(state.partner.tal)) state.partner.tal = newProfile(rngFor('tal-partner', seed, state.partner.personId || state.partner.name), {});
    else ensure(state.partner.tal);
  }
  for (const k of state.children || []) {
    if (!validProfile(k.tal)) k.tal = fromParents(state.talents, state.partner && state.partner.tal ? state.partner.tal : newProfile(rngFor('tal-other', seed, k.id)), rngFor('tal-child', seed, k.id));
    else ensure(k.tal);
  }
  return state;
}
const validProfile = (p) => !!p && Array.isArray(p.v) && p.v.length === KEYS.length && p.v.every(Number.isFinite) && Array.isArray(p.b) && p.b.length === KEYS.length;

/** Verdichtete Schreibweise für player_stats.talents ("52,61,…") und zurück. */
const pack = (p) => (validProfile(p) ? p.v.join(',') : null);
function unpack(s) {
  if (typeof s !== 'string') return null;
  const a = s.split(',').map((x) => Number(x));
  if (a.length !== KEYS.length || !a.every(Number.isFinite)) return null;
  const v = a.map((x) => clampT(x));
  return { v, b: v.slice() };
}

module.exports = {
  KEYS, IDX, META, FOSTER, CAT_W, C, enabled, newProfile, fromParents, ensure, ensureAll, validProfile, clone, capAt, val, avg, grow, bandOf, bandName, bars, best,
  weightsFor, fit, fitFor, topKeys, schoolFit, recommendation, REC,
  revenueMult, reliability, wageMult, jobWageMult, applyPts, raiseBonus, studyMult, healthPts, restPts, lifeDays, partnerPts, childPts, repGain, voteWeight, chanceBonus, courtPts, detectMult,
  eduOf, growMult, ZERO_EDU, applicants, hire, syncTeam, teamQuality, firmEffects, marketWage, firmDaily, yearly, lehrCfg, isLehr, markTaken, courseOffer,
  fosterCost, fosterStart, fosterDaily, pack, unpack, WEEK, poolMean,
};
