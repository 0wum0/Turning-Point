'use strict';
/**
 * Gerichte und Beweise (rein, ohne Datenbank; Speicher und Abläufe: src/lib/court.js).
 *
 * Feindliche oder unerlaubte Handlungen (ACTS) hinterlassen Spuren: einen Beweis mit Stärke 0 … 100, der mit der Zeit verblasst.
 * Das Opfer kann die Stärke durch Detektiv, Zeugen und Schadensdokumentation erhöhen und Anzeige erstatten. Ein Gericht der Stadt entscheidet
 * deterministisch-verrauscht (fester Würfel je Verfahren): Beweislage gegen Verteidigung. Danach folgen abgestufte Sanktionen.
 * Alle Funktionen hier sind rein und nehmen die Einstellungen (settings.gericht) als Parameter C.
 */
const crypto = require('crypto');

/** Handlungen, die Spuren hinterlassen. needsPresence: Der Täter muss vor Ort gewesen sein (Alibi möglich). */
const ACTS = {
  sabotage: { label: 'Sabotage', text: 'Anschlag auf einen Betrieb', needsPresence: true },
  spy: { label: 'Industriespionage', text: 'Ausspionierter Betrieb', needsPresence: true },
  poach: { label: 'Abwerben von Mitarbeitern', text: 'Mitarbeiter wurden abgeworben', needsPresence: true },
  price: { label: 'Preiskampf', text: 'Preise wurden unfair unterboten', needsPresence: true },
  breach: { label: 'Vertragsbruch', text: 'Liefervertrag vorzeitig gebrochen', needsPresence: false },
  default: { label: 'Zahlungsausfall', text: 'Vereinbarte Zahlung nicht geleistet', needsPresence: false },
  evict: { label: 'Räumung ohne Frist', text: 'Mieter ohne Frist vor die Tür gesetzt', needsPresence: false },
  fraud: { label: 'Betrug im Handel', text: 'Zuschlag oder Zusage nicht eingehalten', needsPresence: false },
  bribe: { label: 'Bestechung', text: 'Bestechungsversuch gegenüber dem Gericht', needsPresence: false },
};
const ACT_KEYS = Object.keys(ACTS);

/** Zustände eines Verfahrens (Zustandsautomat). Offen = noch nicht rechtskräftig. */
const STATES = ['filed', 'investigation', 'hearing', 'verdict', 'appeal', 'final', 'settled', 'dismissed', 'withdrawn'];
const OPEN_STATES = ['filed', 'investigation', 'hearing', 'verdict', 'appeal'];
const STATE_LABEL = {
  filed: 'Anzeige eingegangen', investigation: 'Ermittlung', hearing: 'Verhandlung', verdict: 'Urteil (Berufung möglich)', appeal: 'Berufung', final: 'Rechtskräftig',
  settled: 'Verglichen', dismissed: 'Eingestellt', withdrawn: 'Zurückgezogen',
};

/** Sanktionsarten. */
const SANCTIONS = {
  warn: 'Verwarnung', damages: 'Schadenersatz', fine: 'Geldstrafe', closure: 'Betriebsschließung', gewerbe: 'Gewerbeverbot', beruf: 'Berufsverbot', haft: 'Haft', honor: 'Ehrverlust',
};
const MONEY_KINDS = ['damages', 'fine'];
const RESTRICT_KINDS = ['closure', 'gewerbe', 'beruf', 'haft'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round1 = (x) => Math.round(x * 10) / 10;
const HOUR = 3600000;

/** Deterministischer Würfel 0 … 1 aus Schlüsseln (gleiche Eingabe, gleiches Ergebnis). */
function roll(...keys) {
  const h = crypto.createHash('sha256').update(keys.join('|')).digest();
  return h.readUInt32BE(0) / 4294967296;
}

/* ------------------------------------------------------------------ Beweise ------------------------------------------------------------------ */

/**
 * Stärke der Spuren einer Handlung (0 … 100). opts: { security (Betrieb des Opfers hat Sicherheitsdienst), failed (Angriff abgewehrt),
 * police (Stufe des Polizeibudgets der Stadt: −1 … 2), caught (Täter wurde bei der Tat erwischt), seed (Schlüssel für den Zufall) }.
 */
function traceStrength(act, opts = {}, C = {}) {
  const E = C.evidence || {};
  const base = num((E.base || {})[act], 40);
  const luck = num(E.luck, 12);
  const r = roll('trace', act, opts.seed == null ? '' : opts.seed) * 2 - 1; // −1 … 1
  let s = base + r * luck;
  if (opts.security) s += num(E.securityBonus, 15);
  if (opts.failed) s += num(E.failedAttackBonus, 10);
  s += num(opts.police, 0) * num(E.policeStep, 8);
  if (opts.caught) s = Math.max(s, 90);
  return Math.round(clamp(s, 5, 100));
}

/** Aktuelle Stärke eines Beweises: (Grundstärke + Zugewinn) mit Halbwertszeit; nach keepHours (· Verjährung) ungültig. */
function currentStrength(ev, now, C = {}, limit = 1) {
  const E = C.evidence || {};
  const age = Math.max(0, (now - num(ev.created_ms, now)) / HOUR);
  if (age > num(E.keepHours, 336) * clamp(limit, 0.25, 3)) return 0;
  const half = Math.max(1, num(E.halfLifeHours, 120));
  const v = (num(ev.strength, 0) + num(ev.boost, 0)) * Math.pow(0.5, age / half);
  return v < num(E.minUsable, 3) ? 0 : Math.min(100, Math.round(v * 10) / 10);
}

/** Wirkung eines Detektivs: Zugewinn und Ergebnis zum Namen. realOffender = tatsächlicher Täter (Server), others = andere mögliche Verdächtige. */
function detectiveResult(ev, n, C = {}, others = []) {
  const D = C.detective || {};
  const boost = Math.round(num(D.boostMin, 14) + roll('det-boost', ev.id, n) * (num(D.boostMax, 30) - num(D.boostMin, 14)));
  const known = !!ev.known;
  let suspect = null; let conf = 0;
  if (!known) {
    const s = num(ev.strength, 0) + num(ev.boost, 0) + boost;
    const pName = clamp(num(D.nameChance, 0.55) * (0.6 + s / 150), 0, 0.95);
    const r = roll('det-name', ev.id, n);
    if (ev.offender_id && r < pName) { suspect = ev.offender_id; conf = Math.round(60 + roll('det-conf', ev.id, n) * 30); }
    else if (others.length && r > 1 - num(D.decoyChance, 0.12)) { suspect = others[Math.floor(roll('det-decoy', ev.id, n) * others.length) % others.length]; conf = Math.round(40 + roll('det-conf', ev.id, n) * 20); }
  }
  return { boost, suspect, conf };
}

/** Wirkung einer Zeugenaussage: kleiner Zugewinn; Name nur selten und unsicher. */
function witnessResult(ev, n, C = {}, others = []) {
  const W = C.witness || {};
  let suspect = null; let conf = 0;
  if (!ev.known) {
    const r = roll('wit-name', ev.id, n);
    if (ev.offender_id && r < num(W.nameChance, 0.25)) { suspect = ev.offender_id; conf = Math.round(35 + roll('wit-conf', ev.id, n) * 25); }
    else if (others.length && r > 1 - num(W.decoyChance, 0.2)) { suspect = others[Math.floor(roll('wit-decoy', ev.id, n) * others.length) % others.length]; conf = Math.round(25 + roll('wit-conf', ev.id, n) * 25); }
  }
  return { boost: num(W.boost, 6), suspect, conf };
}

/* ------------------------------------------------------------------ Urteil ------------------------------------------------------------------ */

/**
 * Wahrscheinlichkeit eines Schuldspruchs 0 … 1.
 * in: { strength (aktuelle Beweisstärke), truth (Angeklagter ist der wahre Täter), lawyerP, lawyerD (0/1), repD, repP (Vertrauen 0 … 1), alibi (0/1),
 *       strictness (Faktor), bribed (0/1), confessed }
 */
function guiltP(inp, C = {}) {
  const K = C.court || {};
  if (inp.confessed) return 1;
  let s = num(inp.strength, 0);
  if (!inp.truth) s *= num(K.innocentFactor, 0.35);
  s *= num(inp.strictness, 1);
  s += inp.lawyerP ? num((K.lawyer || {}).plaintiff, 10) : 0;
  s += (num(inp.repP, 0.5) - 0.5) * 2 * num(K.plaintiffRepWeight, 5) + num(inp.talP, 0);
  let d = 26 + (inp.lawyerD ? num((K.lawyer || {}).defendant, 24) : 0) + (num(inp.repD, 0.5) - 0.5) * 2 * num(K.repWeight, 12) + (inp.alibi ? num(K.alibi, 8) : 0) + (inp.bribed ? 20 : 0) + num(inp.talD, 0);
  d = Math.max(0, d);
  const p = 1 / (1 + Math.exp(-(s - d) / Math.max(1, num(K.slope, 14))));
  return clamp(p, num(K.minP, 0.03), num(K.maxP, 0.97));
}

/** Urteil: deterministisch je Verfahren (caseId, Runde). Rückgabe { guilty, p, roll }. */
function decide(caseId, round, inp, C = {}) {
  const p = guiltP(inp, C);
  if (inp.confessed) return { guilty: true, p: 1, roll: 0 };
  const r = roll('verdict', caseId, round);
  return { guilty: r < p, p: round1(p * 1000) / 1000, roll: r };
}

/* ------------------------------------------------------------------ Sanktionen ------------------------------------------------------------------ */

/**
 * Stufe 1 … 6 aus Schwere der Tat, Vorstrafen (Schuldsprüche in der Frist) und Geständnis.
 * Schwere 0 (Preiskampf) bleibt bei Stufe 1 (nur Verwarnung).
 */
function levelFor(act, priors, confessed, C = {}) {
  const sev = num(((C.sanctions || {}).severity || {})[act], 1);
  let lv = sev + Math.min(2, Math.max(0, priors | 0)) - (confessed ? 1 : 0);
  if (sev <= 0) lv = Math.min(lv, 1);
  return clamp(Math.round(lv), 1, 6);
}

const at = (arr, lv, d = 0) => num((arr || [])[lv], d);

/**
 * Sanktionen zu Stufe und Rahmen. ctx: { claim (Schaden real), rangePct (Strafrahmen der Region in %), confessed, hasFirm, pkey }.
 * Rückgabe: Liste { kind, real?, hours?, pts? } – Beträge in „Wert 1945“, Haft/Verbote in echten Stunden.
 */
function sanctionsFor(act, level, ctx = {}, C = {}) {
  const S = C.sanctions || {}; const K = C.court || {};
  const lv = clamp(level | 0, 1, 6);
  const out = [{ kind: 'warn' }];
  const claim = Math.max(0, Math.min(num(ctx.claim, 0), num((C.evidence || {}).maxDamageReal, 60000)));
  if (claim > 0) out.push({ kind: 'damages', real: Math.round(claim) });
  const disc = ctx.confessed ? 1 - num(K.confessDiscountPct, 40) / 100 : 1;
  const range = 1 + num(ctx.rangePct, 0) / 100;
  // Stufe 1 ist eine Verwarnung mit Gerichtskosten; erst ab Stufe 2 kommt eine Geldstrafe hinzu
  let fine = lv >= 2 ? Math.round(at(S.fineByLevel, lv) * disc * range) : 0;
  fine = Math.min(fine, Math.round(num(S.maxFineReal, 30000) * Math.max(1, range)));
  const costs = ctx.settled ? 0 : Math.round(num(K.costsReal, 600));
  if (fine + costs > 0) out.push({ kind: 'fine', real: fine + costs, costs });
  const honor = Math.round(at(S.honor, lv) * disc);
  if (honor > 0) out.push({ kind: 'honor', pts: honor });
  if (ctx.hasFirm && at(S.closureHours, lv) > 0) out.push({ kind: 'closure', hours: Math.round(at(S.closureHours, lv) * disc * 10) / 10 });
  if (at(S.gewerbeHours, lv) > 0) out.push({ kind: 'gewerbe', hours: Math.round(at(S.gewerbeHours, lv) * disc) });
  if (ctx.pkey && at(S.berufHours, lv) > 0) out.push({ kind: 'beruf', hours: Math.round(at(S.berufHours, lv) * disc), pkey: ctx.pkey });
  if (at(S.haftHours, lv) > 0) out.push({ kind: 'haft', hours: Math.min(num(S.haftMaxHours, 24), Math.round(at(S.haftHours, lv) * disc * 10) / 10) });
  return out;
}

/* ------------------------------------------------------------------ Einschränkungen ------------------------------------------------------------------ */

/** Handlungen (Spielaktionen), die Haft sperrt: alles Wirtschaftliche. Politik, Alltag, Briefe, Chat bleiben frei. */
const ECON_ACTIONS = ['buy', 'sell', 'letOn', 'letPlayers', 'letPrice', 'loanTake', 'buyBiz', 'foundBiz', 'bizHire', 'bizHireApplicant', 'bizFire', 'bizTrain', 'bizRaise', 'foster', 'bizSecurity', 'bizManager', 'bizSupply', 'bizExpand', 'bizUpgrade', 'bizCollect', 'bizSell', 'bizReactivate', 'gift', 'casino', 'lotto'];
/** Handlungen, die ein Gewerbeverbot sperrt: Betriebe gründen, kaufen, ausbauen, Personal und Verträge. */
const TRADE_ACTIONS = ['buyBiz', 'foundBiz', 'bizHire', 'bizHireApplicant', 'bizManager', 'bizExpand', 'bizUpgrade', 'bizReactivate'];
/** Handlungen mit Berufsschlüssel in der Eingabe (Gründen/Kaufen): Berufsverbot. */
const PKEY_ACTIONS = ['foundBiz', 'buyBiz'];

const fmtUntil = (ms) => new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Prüft eine Aktion gegen die Einschränkungen im Spielstand (state.court.r = [{k, until, pkey?}]). Gibt einen Text oder null zurück.
 * input wird nur gelesen (pkey beim Gründen/Kaufen).
 */
function gate(name, state, input, now = Date.now()) {
  const r = state && state.court && Array.isArray(state.court.r) ? state.court.r : null;
  if (!r || !r.length) return null;
  const live = r.filter((x) => x && x.until > now);
  if (!live.length) return null;
  const haft = live.find((x) => x.k === 'haft');
  if (haft && ECON_ACTIONS.includes(name)) return `Du bist in Haft (bis ${fmtUntil(haft.until)}). Wirtschaftliche Handlungen sind gesperrt; Essen, Schlafen, Briefe, Chat und Politik bleiben möglich. Details unter „Gesellschaft → Recht & Gericht“.`;
  const gw = live.find((x) => x.k === 'gewerbe');
  if (gw && TRADE_ACTIONS.includes(name)) return `Gegen dich besteht ein Gewerbeverbot (bis ${fmtUntil(gw.until)}): Du darfst keine Betriebe gründen, kaufen oder ausbauen.`;
  if (PKEY_ACTIONS.includes(name)) {
    const pk = String(input && (input.pkey || input.professionKey || input.profession) || '');
    const bv = live.find((x) => x.k === 'beruf' && (!x.pkey || !pk || x.pkey === pk));
    if (bv) return `Gegen dich besteht ein Berufsverbot für diese Betriebsart (bis ${fmtUntil(bv.until)}).`;
  }
  return null;
}

/** Wirtschaftliche Sperre für Bibliotheksfunktionen (Markt, Börse, Verträge …): Haft sperrt, Gewerbeverbot nur mit scope 'trade'. */
function blockText(restr, scope = 'econ', now = Date.now()) {
  const live = (restr || []).filter((x) => x && x.until > now);
  const haft = live.find((x) => x.k === 'haft');
  if (haft) return `Du bist in Haft (bis ${fmtUntil(haft.until)}). Wirtschaftliche Handlungen sind gesperrt.`;
  const gw = live.find((x) => x.k === 'gewerbe');
  if (gw && scope === 'trade') return `Gegen dich besteht ein Gewerbeverbot (bis ${fmtUntil(gw.until)}).`;
  return null;
}

/** Wie lange (Spieltage) eine Betriebsschließung noch dauert, umgerechnet aus echten Stunden. */
function closureDays(untilMs, now, clockDaysPerDay) {
  const hours = Math.max(0, (untilMs - now) / HOUR);
  return Math.ceil((hours / 24) * Math.max(1, num(clockDaysPerDay, 365)));
}

/* ------------------------------------------------------------------ Zeitplan ------------------------------------------------------------------ */

/** Dauer der Ermittlung in ms; Detektive verkürzen sie (je Detektiv um detectiveShorten, mindestens minInvestigationPct %). */
function investigationMs(detectives, C = {}, appeal = false) {
  const K = C.court || {};
  const base = num(appeal ? K.appealInvestigationHours : K.investigationHours, appeal ? 12 : 24) * HOUR;
  const f = Math.max(num(K.minInvestigationPct, 30) / 100, 1 - num(K.detectiveShorten, 0.35) * Math.max(0, detectives | 0));
  return Math.round(base * f);
}

/** Obergrenze für einen Vergleich: höchstens settleCapMult · Anspruch (mindestens die Gebühr). */
function settleCap(claim, C = {}) {
  return Math.round(Math.max(num((C.complaint || {}).fee, 1200), num(claim, 0) * num((C.court || {}).settleCapMult, 1.5)));
}

module.exports = {
  ACTS, ACT_KEYS, STATES, OPEN_STATES, STATE_LABEL, SANCTIONS, MONEY_KINDS, RESTRICT_KINDS, ECON_ACTIONS, TRADE_ACTIONS, PKEY_ACTIONS, HOUR,
  roll, traceStrength, currentStrength, detectiveResult, witnessResult, guiltP, decide, levelFor, sanctionsFor, gate, blockText, closureDays, investigationMs, settleCap, fmtUntil, clamp,
};
