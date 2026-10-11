'use strict';
/**
 * Gesellschaft (rein, ohne Datenbank): Vereine, Gemeinden (Glaubensgemeinschaften), Stiftungen sowie Titel und Ränge.
 * Speicher und Abläufe stehen in src/lib/civic.js; hier liegen nur Rechenregeln, Grenzen und Texte – alles deterministisch und getestet.
 *
 * Der Spielstand trägt zwei kleine Dinge:
 *   state.civic        Zwischenspeicher der Mitgliedschaften, Titel und Wirkungen (wird beim Laden aus der Datenbank gefüllt, nie selbst verändert)
 *   state.flags.civic  persistente Familienangaben: offene Trauerfeiern und der Erbteil für die Stiftung (Vermächtnis)
 * Beträge mit „Real“ sind Cent „Wert von 1945“; beim Buchen wird mit dem Preisindex des Spielers in seine Währung umgerechnet.
 */
const settings = require('../settings');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const HOUR = 3600000;

const C = () => settings.get('gesellschaft') || {};
const sub = (k) => C()[k] || {};
const enabled = () => C().enabled !== false;
const clubsOn = () => enabled() && sub('clubs').enabled !== false;
const parishOn = () => enabled() && sub('parish').enabled !== false;
const foundationOn = () => enabled() && sub('foundation').enabled !== false;
const titlesOn = () => enabled() && sub('titles').enabled !== false;
const strength = () => clamp(num((C().effects || {}).strength, 1), 0, 2);

/* ------------------------------------------------------------------ Texte und Listen ------------------------------------------------------------------ */
const kinds = () => (sub('clubs').kinds || []).filter((k) => k && k.key);
const kindOf = (key) => kinds().find((k) => k.key === key) || null;
const faiths = () => (sub('parish').faiths || []).filter((f) => f && f.key);
const faithOf = (key) => faiths().find((f) => f.key === key) || null;
const purposes = () => (sub('foundation').purposes || []).filter((p) => p && p.key);
const purposeOf = (key) => purposes().find((p) => p.key === key) || null;
const titleList = () => (sub('titles').list || []).filter((t) => t && t.key && Array.isArray(t.ranks) && t.ranks.length);
const titleDef = (key) => titleList().find((t) => t.key === key) || null;
const ceremonyLabel = (faithKey, kind) => { const f = faithOf(faithKey); return (f && f.ceremony && f.ceremony[kind]) || { wedding: 'Trauung', baptism: 'Taufe', funeral: 'Trauerfeier' }[kind] || kind; };
const CEREMONIES = ['wedding', 'baptism', 'funeral'];
const ROLE_NAME = { president: 'Vorsitzende/r', board: 'Vorstand', member: 'Mitglied' };

/** Bereinigter Name (Verein, Stiftung): ohne Sonderzeichen und Adressen, 3 bis 40 Zeichen, mit Buchstaben. key = Vergleichsschlüssel für „gibt es schon“. */
function cleanName(raw, min = 3, max = 40) {
  const name = String(raw == null ? '' : raw).replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  const key = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  let err = null;
  if (name.length < min) err = `Der Name ist zu kurz (mindestens ${min} Zeichen).`;
  else if (name.length > max) err = `Der Name ist zu lang (höchstens ${max} Zeichen).`;
  else if (!/\p{L}{2}/u.test(name)) err = 'Der Name braucht mindestens ein richtiges Wort.';
  else if (/(?:https?:|www\.|@|\.(?:com|de|net|org|info|ru|cn|xyz)\b)/i.test(name)) err = 'Im Namen sind keine Internetadressen erlaubt.';
  return { ok: !err, name, key, err };
}
const cleanText = (raw, max = 200) => String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

/* ------------------------------------------------------------------ Vereine ------------------------------------------------------------------ */
const feeInterval = () => Math.max(1, num(sub('clubs').feeIntervalHours, 24)) * HOUR;
const clampFee = (real) => Math.round(clamp(num(real, 0), 0, num(sub('clubs').feeMaxReal, 6000)));

/**
 * Beitragsstand eines Mitglieds. m.paid_until (ms): bis dahin ist bezahlt. Fällig wird je abgelaufenem Zeitraum ein Beitrag, höchstens catchUpMax Zeiträume
 * (länger Abwesende zahlen nicht rückwirkend alles). lapsed = Rückstand länger als die Schonfrist: das Mitglied scheidet aus.
 */
function dues(m, feeReal, now) {
  const K = sub('clubs'); const iv = feeInterval();
  if (!(num(feeReal, 0) > 0)) return { periods: 0, lapsed: false, late: 0 };
  const until = num(m && m.paid_until, 0);
  if (now < until) return { periods: 0, lapsed: false, late: 0 };
  const late = now - until;
  return { periods: Math.min(Math.max(1, num(K.catchUpMax, 2)), Math.floor(late / iv) + 1), lapsed: late > num(K.graceHours, 48) * HOUR, late };
}

/** Wirkung eines Vereins auf seine Mitglieder: Zielwerte (Punkte) je Tag. Wirkt erst ab minActive Mitgliedern, mit der Größe langsam steigend. */
function clubFx(kindKey, members) {
  const K = sub('clubs'); const k = kindOf(kindKey); const out = { health: 0, rest: 0, mood: 0, rev: 0 };
  if (!k || !k.fx) return out;
  const min = Math.max(1, num(K.minActive, 3)); const n = num(members, 0);
  if (n < min) return out;
  const f = (0.5 + 0.5 * clamp((n - min) / (min * 4), 0, 1)) * strength();
  out.health = r2(num(k.fx.health, 0) * f); out.rest = r2(num(k.fx.rest, 0) * f); out.mood = r2(num(k.fx.wellbeing, 0) * f); out.rev = r2(num(k.fx.revPct, 0) * f);
  return out;
}

/** Wirkung aller Mitgliedschaften, Gemeinde, Stadttopf und Titel zusammen – jeder Vereinstyp zählt einmal (der stärkste Verein), alles gedeckelt. */
function combineFx({ clubs = [], parishLevel = -1, pot = null, titles = [] } = {}) {
  const by = new Map();
  for (const c of clubs) { const f = clubFx(c.kind, c.members); const cur = by.get(c.kind); if (!cur || f.health + f.rest + f.mood + f.rev > cur.health + cur.rest + cur.mood + cur.rev) by.set(c.kind, f); }
  const out = { health: 0, rest: 0, mood: 0, rev: 0, kids: 0, aid: 0 };
  for (const f of by.values()) { out.health += f.health; out.rest += f.rest; out.mood += f.mood; out.rev += f.rev; }
  const P = sub('parish');
  if (parishLevel >= 1) out.mood += num((P.fx || {}).wellbeing, 0) * strength() * Math.min(1.5, 1 + (parishLevel - 1) * 0.25);
  if (pot) { out.health += num(pot.health, 0); out.mood += num(pot.wellbeing, 0); out.kids += num(pot.kids, 0); out.aid += num(pot.aid, 0); }
  out.rev += titleFx(titles).rev;
  return { health: r2(clamp(out.health, 0, 4)), rest: r2(clamp(out.rest, 0, 2)), mood: r2(clamp(out.mood, 0, 4)), rev: r2(clamp(out.rev, 0, 3)), kids: r2(clamp(out.kids, 0, 0.5)), aid: r2(clamp(out.aid, 0, 2)) };
}

/** Wahlempfehlung eines Vereins: Stimmengewicht in Prozentpunkten (Mitglieder · Satz, je Verein gedeckelt; mit Wahlkampfhilfe aus der Kasse etwas mehr). */
function endorseBoost(members, funded) {
  const E = sub('clubs').endorse || {};
  const base = Math.min(num(E.clubCapPct, 2.5), Math.max(0, num(members, 0)) * num(E.perMemberPct, 0.25));
  return r2(Math.min(num(E.clubCapPct, 2.5), base * (funded ? num(E.fundedMult, 1.5) : 1)));
}
/** Summe der Gewichte aller Empfehlungen und Titel, gedeckelt (Politik bleibt offen: Beliebtheit ersetzt keine Stimmen). */
function totalBoost(clubPcts, titlePct) {
  const E = sub('clubs').endorse || {}; const cap = num((C().elections || {}).maxBoostPct, 6);
  const clubs = Math.min(num(E.totalCapPct, 4), (clubPcts || []).reduce((s, x) => s + Math.max(0, num(x, 0)), 0));
  return r2(clamp(clubs + Math.max(0, num(titlePct, 0)), 0, cap));
}
/** Faktor für das Stimmengewicht bei der Auszählung (1 … 1 + maxBoost/100). */
const voteFactor = (pct) => r3(1 + clamp(num(pct, 0), 0, num((C().elections || {}).maxBoostPct, 6)) / 100);

/** Abwahl des Vorsitzes: mehr als pct Prozent der Mitglieder (mindestens min Stimmen). */
function mistrustReached(votes, members) {
  const M = sub('clubs').mistrust || {};
  return num(votes, 0) >= Math.max(1, num(M.min, 3)) && num(votes, 0) * 100 > num(members, 0) * num(M.pct, 50);
}
/** Nachfolge im Vorsitz: erst der Vorstand, dann Mitglieder – jeweils der Dienstälteste (kleinstes joined_ms, dann Nutzer-ID). */
function successor(rows, excludeId = 0) {
  const list = (rows || []).filter((r) => r.user_id !== excludeId);
  const rank = (r) => (r.role === 'board' ? 0 : 1);
  return list.slice().sort((a, b) => rank(a) - rank(b) || num(a.joined_ms, 0) - num(b.joined_ms, 0) || a.user_id - b.user_id)[0] || null;
}

/* ------------------------------------------------------------------ Gemeinde ------------------------------------------------------------------ */
/** Punkte „Gemeinde-Ansehen“ für eine Spende: abnehmender Ertrag, damit große Beträge nicht beliebig viel kaufen. */
function standingGain(real) {
  const D = sub('parish').donate || {};
  const g = num(D.standingScale, 8) * Math.log(1 + Math.max(0, num(real, 0)) / Math.max(1, num(D.standingRef, 2000)));
  return r2(clamp(g, 0, num(D.standingDayCap, 12)));
}
function standingDecay(st, days) {
  const D = sub('parish').donate || {};
  const d = clamp(Math.floor(num(days, 0)), 0, 3650);
  return r2(Math.max(0, num(st, 0)) * Math.pow(1 - clamp(num(D.decayPct, 1), 0, 50) / 100, d));
}
/** Stufe des Gemeinde-Ansehens: { idx, name, next, pct }. */
function parishLevel(st) {
  const L = (sub('parish').levels || []).slice().sort((a, b) => a.at - b.at); const v = Math.max(0, num(st, 0));
  let idx = 0; for (let i = 0; i < L.length; i++) if (v >= num(L[i].at, 0)) idx = i;
  const next = L[idx + 1] || null;
  return { idx, name: (L[idx] || {}).name || '', next: next ? next.name : null, nextAt: next ? num(next.at, 0) : null, pct: next ? clamp((v - num(L[idx].at, 0)) / Math.max(1, num(next.at, 0) - num(L[idx].at, 0)), 0, 1) : 1 };
}
/** Notgabe der Gemeinde: Anteil der Kasse, begrenzt; mit Armenhilfe-Stiftungen in der Stadt (pot.aid) bis zu doppelt so viel. */
function aidAmount(fundReal, potAid = 0) {
  const A = sub('parish').aid || {};
  const cap = num(A.maxReal, 2500) * (1 + clamp(num(potAid, 0), 0, 2) * num(A.potBonusPct, 100) / 100 * 0.5);
  return Math.max(0, Math.floor(Math.min(cap, Math.max(0, num(fundReal, 0)) * num(A.fundSharePct, 15) / 100)));
}
const ceremonyCfg = (kind) => (sub('parish').ceremonies || {})[kind] || null;

/* ------------------------------------------------------------------ Stiftung ------------------------------------------------------------------ */
const minCapital = () => num(sub('foundation').minCapitalReal, 1000000);
const clampPayout = (pct) => r2(clamp(num(pct, num(sub('foundation').payoutDefaultPct, 3)), num(sub('foundation').payoutMinPct, 1.5), num(sub('foundation').payoutMaxPct, 6)));

/**
 * Ein Abrechnungsschritt (rein): je vollem Zeitraum (tickHours) wächst das Kapital um den Ertrag, danach folgt die Ausschüttung.
 * Versäumte Zeiträume über catchUpMax verfallen (kein Nachzahlen für lange Pausen). Rückgabe: neues Kapital, Summe des Ertrags und der Ausschüttung, Zeitpunkt.
 */
function foundationTick({ capital, payoutPct, lastMs }, now) {
  const F = sub('foundation'); const iv = Math.max(1, num(F.tickHours, 24)) * HOUR;
  let cap = Math.max(0, num(capital, 0)); const last = num(lastMs, now);
  const n = Math.min(Math.max(1, num(F.catchUpMax, 14)), Math.max(0, Math.floor((now - last) / iv)));
  let income = 0; let payout = 0;
  const pct = clampPayout(payoutPct); const y = num(F.yieldPct, 3) / 100; const capY = num(F.yieldCapReal, 2e9);
  for (let i = 0; i < n; i++) {
    const inc = Math.min(cap, capY) * y; cap += inc; income += inc;
    const pay = cap * pct / 100; cap -= pay; payout += pay;
  }
  return { periods: n, income: r2(income), payout: r2(payout), capital: r2(cap), nextMs: n > 0 ? now : last };
}
/** Gemeinwohl-Topf: klingt je Tag ab. */
const potDecay = (pot, days) => Math.max(0, num(pot, 0)) * Math.pow(1 - clamp(num((sub('foundation').pot || {}).decayPct, 8), 0, 90) / 100, Math.max(0, num(days, 0)));
/** Wirkung der Töpfe einer Stadt: je Zweck sättigend (größere Städte brauchen mehr). pots = { bildung, gesundheit, kultur, armut } in Real. */
function potEffect(pots, cityTier = 2) {
  const P = (sub('foundation').pot) || {}; const FX = (C().pot || {}).fx || {};
  const ref = Math.max(1, num(P.refReal, 60000)) * (1 + Math.max(0, num(cityTier, 2) - 1) * num(P.tierRef, 1) * 0.5);
  const sat = (v) => num(P.maxEffect, 1) * (1 - Math.exp(-Math.max(0, num(v, 0)) / ref));
  const s = strength();
  const out = { kids: 0, health: 0, wellbeing: 0, aid: 0 };
  const b = sat((pots || {}).bildung); const g = sat((pots || {}).gesundheit); const k = sat((pots || {}).kultur); const a = sat((pots || {}).armut);
  out.kids = r3(num((FX.bildung || {}).kids, 0) * b * s); out.health = r3(num((FX.gesundheit || {}).health, 0) * g * s); out.wellbeing = r3(num((FX.kultur || {}).wellbeing, 0) * k * s); out.aid = r3(num((FX.armut || {}).aid, 0) * a * s);
  return out;
}
/** Vermächtnis: so viel Bargeld (Cent) geht aus dem Nachlass an die Stiftung. */
function bequest(cashCents, pct) { return Math.max(0, Math.floor(Math.max(0, num(cashCents, 0)) * clamp(num(pct, 0), 0, num(sub('foundation').willMaxPct, 30)) / 100)); }

/* ------------------------------------------------------------------ Titel und Ränge ------------------------------------------------------------------ */
/**
 * Erfüllt eine Stufe ihre Bedingungen? facts = { lvl, donated, contributed, biz, staff, chair, chairDays, office, scandal }.
 * Wer „Verrufen/Zweifelhaft“ ist oder Skandalpunkte hat, bekommt keinen Titel.
 */
function meets(req, facts) {
  if (!req) return false;
  const f = facts || {};
  if (num(f.lvl, 0) < 0) return false;
  if (num(f.scandal, 0) >= 20) return false;
  for (const k of ['lvl', 'donated', 'contributed', 'biz', 'staff', 'chair', 'chairDays', 'office']) if (req[k] != null && num(f[k], 0) < num(req[k], 0)) return false;
  return true;
}
/** Höchste erreichte Stufe (1 …) eines Titels oder 0. Titel, die der Bürgermeister verleiht (auto: false), werden nicht berechnet. */
function rankFor(def, facts) {
  if (!def || def.auto === false || !Array.isArray(def.req)) return 0;
  let best = 0;
  for (let i = 0; i < def.req.length && i < def.ranks.length; i++) if (meets(def.req[i], facts)) best = i + 1;
  return best;
}
const titleName = (key, rank) => { const d = titleDef(key); return d ? (d.ranks[clamp(num(rank, 1), 1, d.ranks.length) - 1] || d.name) : key; };
function evaluate(facts) {
  const out = [];
  for (const d of titleList()) { const r = rankFor(d, facts); if (r > 0) out.push({ key: d.key, rank: r }); }
  return out;
}
/** Wirkung der getragenen Titel: Stimmengewicht (Prozentpunkte), Gebührennachlass (%), Umsatz (%), zusätzliche Vereinsplätze – gedeckelt. */
function titleFx(titles) {
  const T = sub('titles'); const s = strength();
  const out = { vote: 0, fee: 0, rev: 0, slots: 0 };
  const best = new Map(); // ein Titel zählt einmal (Ehrenbürger mehrerer Städte: nur der höchste Rang)
  for (const t of titles || []) { const cur = best.get(t.key); if (!cur || num(t.rank, 1) > num(cur.rank, 1)) best.set(t.key, t); }
  for (const t of best.values()) {
    const d = titleDef(t.key); if (!d || !d.fx) continue; const i = clamp(num(t.rank, 1), 1, d.ranks.length) - 1;
    out.vote += num((d.fx.vote || [])[i], 0); out.fee += num((d.fx.fee || [])[i], 0); out.rev += num((d.fx.rev || [])[i], 0); out.slots += num((d.fx.slots || [])[i], 0);
  }
  return { vote: r2(clamp(out.vote * s, 0, num(T.maxVotePct, 4))), fee: r2(clamp(out.fee * s, 0, num(T.maxFeeDiscPct, 25))), rev: r2(clamp(out.rev * s, 0, 3)), slots: Math.min(2, Math.floor(out.slots)) };
}
/** Anzeigename des höchsten Titels (Rangstufe zuerst, bei Gleichstand die Reihenfolge der Liste von hinten). */
function bestTitle(titles) {
  const list = titleList(); let best = null; let score = -1;
  for (const t of titles || []) {
    const i = list.findIndex((d) => d.key === t.key); if (i < 0) continue;
    const sc = num(t.rank, 1) * 100 + i;
    if (sc > score) { score = sc; best = t; }
  }
  return best ? titleName(best.key, best.rank) : null;
}

/* ------------------------------------------------------------------ Spielstand ------------------------------------------------------------------ */
function ensure(state) {
  if (!state.flags) state.flags = {};
  if (!state.flags.civic || typeof state.flags.civic !== 'object') state.flags.civic = {};
  const f = state.flags.civic;
  if (!Array.isArray(f.funerals)) f.funerals = [];
  if (!Number.isFinite(f.will)) f.will = 0;
  if (!Number.isFinite(f.nextId)) f.nextId = 0;
  return f;
}
/** Eine offene Trauerfeier vormerken (Erbfall, verwitwet). */
function addFuneral(state, name) {
  const f = ensure(state); f.nextId += 1;
  const e = { id: f.nextId, name: String(name || '').slice(0, 60), day: state.day };
  f.funerals.push(e); if (f.funerals.length > 6) f.funerals.shift();
  return e;
}
/** Zwischenspeicher aus der Datenbank (gefüllt von src/lib/civic.js) – oder leer. */
const snap = (state) => (state && state.civic && typeof state.civic === 'object' ? state.civic : null);

/** Wirkung auf die täglichen Zielwerte (Engine): Stimmung, Erholung, Gesundheit. */
function body(state) {
  const s = snap(state); if (!s || !s.fx || state.status !== 'alive') return { mood: 0, rest: 0, health: 0 };
  return { mood: num(s.fx.mood, 0), rest: num(s.fx.rest, 0), health: num(s.fx.health, 0) };
}
/** Umsatzfaktor der Betriebe (Gewerbeverein, Titel): 1 … 1,03. */
function revMult(state) { const s = snap(state); return s && s.fx ? r3(1 + clamp(num(s.fx.rev, 0), 0, 3) / 100) : 1; }

/** Tägliche Kleinigkeiten (Engine): Kinder profitieren von Bildungsstiftungen der Stadt; alte offene Trauerfeiern verfallen. */
function daily(ctx) {
  const { state } = ctx; const s = snap(state);
  if (s && s.fx && num(s.fx.kids, 0) > 0) for (const c of state.children || []) if (c.status === 'home' && c.sat < 100) c.sat = Math.min(100, c.sat + s.fx.kids);
  const f = state.flags && state.flags.civic;
  if (f && f.funerals && f.funerals.length) { const keep = num((sub('parish').ceremonies || {}).funeral && sub('parish').ceremonies.funeral.keepDays, 400); f.funerals = f.funerals.filter((x) => state.day - x.day <= keep); }
}

/** Kurzfassung für die Oberfläche (Übersicht, Beratung): ohne Datenbank, nur aus dem Spielstand. */
function brief(state) {
  const s = snap(state); const f = (state.flags && state.flags.civic) || {};
  if (!s) return { on: false, clubs: [], titles: [], funerals: (f.funerals || []).length, will: num(f.will, 0) };
  return {
    on: true, clubs: (s.clubs || []).map((c) => ({ id: c.id, name: c.name, kind: c.kind, role: c.role, members: c.members })), parish: s.parish ? { id: s.parish.id, name: s.parish.name, level: s.parish.levelName } : null,
    foundation: s.foundation ? { name: s.foundation.name, capital: s.foundation.capital } : null, titles: (s.titles || []).map((t) => ({ key: t.key, rank: t.rank, name: t.name })),
    fx: s.fx || null, due: s.due || 0, funerals: (f.funerals || []).length, will: num(f.will, 0), best: bestTitle(s.titles || []),
  };
}

module.exports = {
  C, enabled, clubsOn, parishOn, foundationOn, titlesOn, strength, kinds, kindOf, faiths, faithOf, purposes, purposeOf, titleList, titleDef, ceremonyLabel, CEREMONIES, ROLE_NAME,
  cleanName, cleanText, feeInterval, clampFee, dues, clubFx, combineFx, endorseBoost, totalBoost, voteFactor, mistrustReached, successor,
  standingGain, standingDecay, parishLevel, aidAmount, ceremonyCfg, minCapital, clampPayout, foundationTick, potDecay, potEffect, bequest,
  meets, rankFor, titleName, evaluate, titleFx, bestTitle, ensure, addFuneral, snap, body, revMult, daily, brief, clamp, num, r2,
};
