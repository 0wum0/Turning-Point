'use strict';
/**
 * Ruf und Ansehen (rein, ohne Datenbank).
 *
 * Eine Familie (Konto) hat fünf Bestandteile:
 *   rel    Zuverlässigkeit  (Miete, Kredite, Verträge, Versteigerungen)
 *   trade  Handel           (fair abgeschlossene Geschäfte, verlässliche Lieferungen)
 *   civic  Gemeinwohl       (Geschenke, Arbeitsplätze, Steuern)
 *   office Ansehen im Amt   (Ämter, Wahlen, Beschlüsse)
 *   scandal Skandal         (negativ: erwischte Sabotage, Pleiten, Strafen; flaut langsam ab)
 * Gesamtwert = Summe der gewichteten Bestandteile − Gewicht · Skandal, daraus ergibt sich die Stufe
 * (Verrufen · Zweifelhaft · Unbekannt · Anständig · Angesehen · Honoratior · Ehrenbürger).
 * Örtliches Ansehen: Punkte aus Ereignissen in der Stadt, gemischt mit dem landesweiten Wert.
 *
 * Der Spielstand trägt nur zwei Dinge: `state.rep` (Zwischenspeicher der aktuellen Werte für die Wirkungen) und
 * `state.pending.rep` (Warteschlange neuer Ereignisse, die beim Speichern genau einmal ins Protokoll wandern – src/lib/reputation.js).
 */
const settings = require('../settings');

const KINDS = ['rel', 'trade', 'civic', 'office', 'scandal'];
const KIND_LABEL = { rel: 'Zuverlässigkeit', trade: 'Handel', civic: 'Gemeinwohl', office: 'Ansehen im Amt', scandal: 'Skandal' };
const KIND_HINT = {
  rel: 'Miete, Kreditraten, Verträge und Zuschläge pünktlich und verlässlich erledigen.',
  trade: 'Fair handeln, Angebote beantworten und Lieferungen zuverlässig erfüllen.',
  civic: 'Mitspielern helfen, Menschen beschäftigen und Steuern zahlen.',
  office: 'Wahlen gewinnen, Ämter ausfüllen und beliebte Beschlüsse fassen.',
  scandal: 'Erwischte Sabotage, Pleiten, Strafen und Rauswürfe – flaut nur langsam ab.',
};

/** Stufen: idx −2 … 4. */
const LEVELS = [
  { idx: -2, key: 'verrufen', name: 'Verrufen', tone: 'bad' },
  { idx: -1, key: 'zweifelhaft', name: 'Zweifelhaft', tone: 'warn' },
  { idx: 0, key: 'unbekannt', name: 'Unbekannt', tone: 'dim' },
  { idx: 1, key: 'anstaendig', name: 'Anständig', tone: 'good' },
  { idx: 2, key: 'angesehen', name: 'Angesehen', tone: 'good' },
  { idx: 3, key: 'honoratior', name: 'Honoratior', tone: 'gold' },
  { idx: 4, key: 'ehrenbuerger', name: 'Ehrenbürger', tone: 'gold' },
];
const levelInfo = (idx) => LEVELS[Math.max(-2, Math.min(4, Math.round(Number(idx) || 0))) + 2];

/**
 * Ereignisse. d = Standardbetrag, cap = Tagesgrenze (Betrag je Konto), label = Text im Protokoll.
 * Aufrufer dürfen den Betrag überschreiben (z. B. Amtsstufe), die Grenze gilt immer.
 */
const REASONS = {
  rent_paid: { kind: 'rel', d: 0.5, cap: 5, label: 'Miete pünktlich gezahlt' },
  rent_missed: { kind: 'rel', d: -6, cap: 12, label: 'Miete nicht bezahlt – Wohnung verloren' },
  loan_paid: { kind: 'rel', d: 0.4, cap: 4, label: 'Kreditrate pünktlich gezahlt' },
  loan_missed: { kind: 'rel', d: -3, cap: 9, label: 'Kreditrate nicht bezahlt' },
  loan_cleared: { kind: 'rel', d: 5, cap: 10, label: 'Kredit vollständig zurückgezahlt' },
  contract_done: { kind: 'rel', d: 3, cap: 9, label: 'Liefervertrag ordentlich erfüllt' },
  contract_cancel: { kind: 'rel', d: -3, cap: 9, label: 'Liefervertrag vorzeitig gekündigt' },
  auction_default: { kind: 'rel', d: -6, cap: 12, label: 'Zuschlag nicht eingelöst' },
  trade_done: { kind: 'trade', d: 3, cap: 8, label: 'Fairer Handel abgeschlossen' },
  offer_answered: { kind: 'trade', d: 0.4, cap: 2, label: 'Angebot fair beantwortet' },
  supply_ok: { kind: 'trade', d: 0.5, cap: 4, label: 'Lieferungen zuverlässig' },
  supply_short: { kind: 'trade', d: -1.5, cap: 6, label: 'Lieferungen unzuverlässig' },
  exchange_trade: { kind: 'trade', d: 0.4, cap: 2, label: 'Handel an der Börse' },
  ipo: { kind: 'trade', d: 4, cap: 4, label: 'Börsengang' },
  gift: { kind: 'civic', d: 1.2, cap: 4, label: 'Geschenk an einen Mitspieler' },
  tax_paid: { kind: 'civic', d: 0.3, cap: 3, label: 'Steuern gezahlt' },
  hire: { kind: 'civic', d: 2, cap: 6, label: 'Mitarbeiter eingestellt' },
  staff_kept: { kind: 'civic', d: 0.4, cap: 3, label: 'Mitarbeiter beschäftigt' },
  fire_unfair: { kind: 'civic', d: -4, cap: 8, label: 'Mitarbeiter kurz nach der Einstellung entlassen' },
  visit: { kind: 'civic', d: 0.4, cap: 2, label: 'Betrieb eines Mitspielers besucht' },
  honor: { kind: 'civic', d: 8, cap: 8, label: 'Ehrenbürgerwürde erhalten' },
  office_won: { kind: 'office', d: 4, cap: 12, label: 'Wahl gewonnen' },
  office_run: { kind: 'office', d: 0.8, cap: 2, label: 'Als Kandidat angetreten' },
  office_term: { kind: 'office', d: 6, cap: 20, label: 'Amtszeit abgeschlossen' },
  office_quit: { kind: 'office', d: -5, cap: 10, label: 'Amt vorzeitig niedergelegt' },
  policy_popular: { kind: 'office', d: 2, cap: 6, label: 'Beliebter Beschluss' },
  policy_unpopular: { kind: 'office', d: -2, cap: 6, label: 'Umstrittener Beschluss' },
  honor_given: { kind: 'office', d: 2, cap: 4, label: 'Ehrenbürgerwürde verliehen' },
  sabotage_caught: { kind: 'scandal', d: 25, cap: 50, label: 'Bei Sabotage erwischt' },
  spy_caught: { kind: 'scandal', d: 12, cap: 36, label: 'Bei Spionage erwischt' },
  fine: { kind: 'scandal', d: 4, cap: 12, label: 'Strafe gezahlt' },
  bankrupt: { kind: 'scandal', d: 30, cap: 60, label: 'Pleite gegangen' },
  evict: { kind: 'scandal', d: 3, cap: 9, label: 'Mieter vor die Tür gesetzt' },
  flagged: { kind: 'scandal', d: 4, cap: 20, label: 'Auffälliges Verhalten gemeldet' },
  admin: { kind: 'rel', d: 0, cap: 100, label: 'Von der Spielleitung angepasst' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
const cfg = () => settings.get('ruf') || {};
const blank = () => ({ rel: 0, trade: 0, civic: 0, office: 0, scandal: 0 });
const isKind = (k) => KINDS.includes(k);
const isDay = (n) => Math.floor(n / 86400000);

/** Gesamtwert −100 … 100. */
function score(c, C = cfg()) {
  const w = C.weights || {};
  const s = num(c.rel, 0) * num(w.rel, 0.35) + num(c.trade, 0) * num(w.trade, 0.2) + num(c.civic, 0) * num(w.civic, 0.25) + num(c.office, 0) * num(w.office, 0.2) - num(c.scandal, 0) * num(w.scandal, 0.9);
  return round1(clamp(s, -100, 100));
}

/** Stufe (−2 … 4) zu einem Gesamtwert. */
function levelOf(sc, C = cfg()) {
  const t = Array.isArray(C.levels) && C.levels.length === 6 ? C.levels : [-30, -10, 12, 32, 55, 78];
  let n = 0; for (const x of t) if (sc >= x) n++;
  return n - 2;
}

/** Fortschritt innerhalb der Stufe 0…1 und Punktzahl der nächsten Stufe (null auf der obersten). */
function progress(sc, C = cfg()) {
  const t = Array.isArray(C.levels) && C.levels.length === 6 ? C.levels : [-30, -10, 12, 32, 55, 78];
  const lv = levelOf(sc, C);
  const lo = lv <= -2 ? Math.min(-100, t[0] - 40) : t[lv + 1];
  const hi = lv >= 4 ? null : t[lv + 2];
  if (hi == null) return { from: lo, next: null, pct: 1 };
  return { from: lo, next: hi, pct: clamp((sc - lo) / Math.max(1, hi - lo), 0, 1) };
}

/** Örtliches Ansehen: Mischung aus landesweitem Wert und den Punkten, die in dieser Stadt gesammelt wurden. */
function localScore(nat, pts, C = cfg()) {
  const k = clamp(num(C.localShare, 50), 0, 100) / 100;
  return round1(clamp((1 - k) * nat + k * num(pts, 0), -100, 100));
}

/** Abflauen zur Mitte (rein): days echte Tage. */
function decay(c, days, C = cfg()) {
  const d = clamp(Math.floor(num(days, 0)), 0, 3650); if (!d) return { ...c };
  const p = C.decayPct || {}; const out = {};
  for (const k of KINDS) {
    const v = num(c[k], 0); const r = clamp(num(p[k], 1.5), 0, 50) / 100;
    let x = v * Math.pow(1 - r, d);
    if (k === 'scandal') x = Math.max(0, x - clamp(num(C.scandalFlat, 0.3), 0, 10) * d);
    out[k] = Math.abs(x) < 0.01 ? 0 : x;
  }
  return out;
}

/** Wert nach Erbfall bzw. Neustart: pct Prozent aller Bestandteile bleiben. */
function inherit(c, pct) {
  const f = clamp(num(pct, 50), 0, 100) / 100; const out = {};
  for (const k of KINDS) out[k] = Math.round(num(c[k], 0) * f * 100) / 100;
  return out;
}

/** Wirkung eines Ereignisses mit Tagesgrenzen und abnehmendem Ertrag. rec = {c, caps}; Ergebnis: neuer Stand und tatsächlich angewendeter Betrag. */
function applyEvent(rec, ev, C = cfg(), day = isDay(Date.now())) {
  const R = REASONS[ev.reason] || {};
  const kind = isKind(ev.kind) ? ev.kind : R.kind;
  const c = { ...blank(), ...(rec.c || {}) };
  let caps = rec.caps && rec.caps.d === day ? { d: day, u: { ...(rec.caps.u || {}) }, p: { ...(rec.caps.p || {}) }, t: { ...(rec.caps.t || {}) } } : { d: day, u: {}, p: {}, t: {} };
  if (!isKind(kind)) return { c, caps, applied: 0, kind: null };
  let d = ev.delta != null && ev.delta !== '' ? Number(ev.delta) : R.d;
  if (!Number.isFinite(d) || d === 0) return { c, caps, applied: 0, kind };
  const reason = String(ev.reason || '');
  d *= clamp(num((C.mult || {})[reason], 1), 0, 10);
  const maxE = clamp(num(C.maxEvent, 40), 1, 100); d = clamp(d, -maxE, maxE);
  const cap = clamp(num((C.caps || {})[reason], R.cap != null ? R.cap : num(C.capDefault, 5)), 0, 1000);
  const room = Math.max(0, cap - num(caps.u[reason], 0));
  let mag = Math.min(Math.abs(d), room);
  if (ev.pairKey) { const pc = cap * clamp(num(C.pairCapPct, 50), 0, 100) / 100; mag = Math.min(mag, Math.max(0, pc - num(caps.p[`${reason}|${ev.pairKey}`], 0))); }
  const worse = kind === 'scandal' ? d > 0 : d < 0;
  if (!worse) mag = Math.min(mag, Math.max(0, clamp(num(C.compDayCap, 14), 0, 1000) - num(caps.t[kind], 0)));
  if (mag < 0.001) return { c, caps, applied: 0, kind };
  let eff = (d > 0 ? 1 : -1) * mag;
  const v = c[kind];
  if (kind === 'scandal') { if (eff > 0) eff *= 1 - clamp(v, 0, 100) / 100; } else if (eff > 0 && v > 0) eff *= 1 - clamp(v, 0, 100) / 100;
  const nv = kind === 'scandal' ? clamp(v + eff, 0, 100) : clamp(v + eff, -40, 100);
  const applied = nv - v;
  c[kind] = nv;
  caps.u[reason] = num(caps.u[reason], 0) + mag;
  if (ev.pairKey) { const k = `${reason}|${ev.pairKey}`; if (Object.keys(caps.p).length < 40 || k in caps.p) caps.p[k] = num(caps.p[k], 0) + mag; }
  if (!worse) caps.t[kind] = num(caps.t[kind], 0) + mag;
  return { c, caps, applied, kind };
}

/** Punkte, die ein angewendeter Betrag am Gesamtwert ändert (für das örtliche Ansehen). */
function pointsOf(kind, applied, C = cfg()) {
  const w = C.weights || {};
  const x = num(w[kind], kind === 'scandal' ? 0.9 : 0.25);
  return (kind === 'scandal' ? -1 : 1) * applied * x;
}

/** Zwischenspeicher für den Spielstand: nur kleine Zahlen. */
function makeSnap(c, localPts, C = cfg()) {
  const s = score(c, C); const l = localScore(s, localPts, C);
  return { s, l, lv: levelOf(s, C), ll: levelOf(l, C), c: KINDS.map((k) => round1(num(c[k], 0))) };
}

/** Aktuelle Werte aus dem Spielstand (Standard: unbekannt). */
function stand(state) {
  const r = state && state.rep;
  if (!r || !Number.isFinite(r.s)) return { s: 0, l: 0, lv: 0, ll: 0 };
  return { s: r.s, l: Number.isFinite(r.l) ? r.l : r.s, lv: clamp(Math.round(r.lv) || 0, -2, 4), ll: clamp(Math.round(r.ll) || 0, -2, 4) };
}

/** Ereignis für das Speichern vormerken (reine Zustandsänderung). Gleiche Ereignisse am selben Ziel werden zusammengefasst. */
function queue(state, kind, delta, reason, ref, extra) {
  if (!state || !state.pending || !cfg().enabled) return;
  const R = REASONS[reason]; const k = isKind(kind) ? kind : R && R.kind; if (!k) return;
  const d = delta != null ? Number(delta) : R && R.d; if (!Number.isFinite(d) || d === 0) return;
  const q = state.pending.rep || (state.pending.rep = []);
  const x = extra || {}; const u = x.user || 0; const o = x.other || 0; const rf = ref == null ? '' : String(ref).slice(0, 60);
  const e = q.find((y) => y.k === k && y.r === reason && (y.u || 0) === u && (y.o || 0) === o && (y.f || '') === rf);
  if (e) { e.d = round2(e.d + d); e.n = (e.n || 1) + 1; return; }
  if (q.length >= 40) return; // Schutz vor ausufernden Listen: Überschuss verfällt
  const ent = { k, r: reason, d: round2(d), n: 1 };
  if (rf) ent.f = rf; if (u) ent.u = u; if (o) ent.o = o; if (state.cityId) ent.c = state.cityId;
  q.push(ent);
}

/* ---------------- Wirkungen (alle beschränkt; strength 0 schaltet ab) ---------------- */
const strength = (C = cfg()) => { const e = C.effects || {}; return C.enabled === false ? 0 : clamp(num(e.strength, 1), 0, 2); };
const on = (name, C = cfg()) => { const e = C.effects || {}; return strength(C) > 0 && e[name] !== false; };
const T = (arr, lv) => arr[clamp(Math.round(lv), -2, 4) + 2];

/** Zinsaufschlag in Prozentpunkten (negativ = günstiger). */
function creditRateDelta(lv, C = cfg()) { return on('credit', C) ? round2(T([2.5, 1, 0, -0.3, -0.6, -1, -1.4], lv) * strength(C)) : 0; }
/** Faktor auf den Kreditrahmen. */
function creditLimitMult(lv, C = cfg()) { return on('credit', C) ? round2(clamp(1 + (T([0.6, 0.85, 1, 1.03, 1.06, 1.1, 1.15], lv) - 1) * strength(C), 0.5, 1.3)) : 1; }
/** Aufweitung des erlaubten Preisbands (Prozentpunkte an beiden Rändern; negativ = enger). */
function contractBandPad(lv, C = cfg()) { return on('contracts', C) ? round1(T([-3, -1.5, 0, 1, 2, 3, 4], lv) * strength(C)) : 0; }
/** Nachfrage nach Mietobjekten (Faktor), abhängig vom örtlichen Ansehen des Vermieters. */
function tenantDemandMult(lv, C = cfg()) { return on('landlord', C) ? round2(clamp(1 + (T([0.8, 0.9, 1, 1.04, 1.08, 1.12, 1.15], lv) - 1) * strength(C), 0.6, 1.3)) : 1; }
/** Faktor auf die Wahrscheinlichkeit eines Mietausfalls. */
function arrearsMult(lv, C = cfg()) { return on('landlord', C) ? round2(clamp(1 + (T([1.4, 1.2, 1, 0.9, 0.8, 0.7, 0.6], lv) - 1) * strength(C), 0.3, 2)) : 1; }
/** Stimmengewicht eines Kandidaten (±10 %; Amtsinhaber mit Skandal zusätzlich bis −15 %). */
function voteWeight(sc, scandal, incumbent, C = cfg()) {
  if (!on('elections', C)) return 1;
  let w = 1 + clamp(num(sc, 0), -100, 100) / 1000 * 1; // −10 % … +10 %
  if (incumbent) w -= clamp((num(scandal, 0) - 10) / 100 * 0.5, 0, 0.15);
  return round2(clamp(1 + (w - 1) * strength(C), 0.75, 1.1));
}
/** Mindeststufe für ein Amt (Index wie in den Einstellungen). */
function officeMin(idx, C = cfg()) { const a = Array.isArray(C.offices) ? C.offices : [0, 1, 2, 2, 3, 3]; return on('elections', C) ? clamp(Math.round(num(a[idx], 0)), -1, 4) : -1; }
/** Mindeststufe weiterer Aktionen (−1 = jeder außer „Verrufen“). */
function minFor(what, C = cfg()) {
  const map = { ipo: 'minIpo', takeover: 'minTakeover', contract: 'minContract', offer: 'minOffer', loan: 'minLoan', hire: 'minHire' };
  const v = num(C[map[what]], -1);
  return strength(C) > 0 ? clamp(Math.round(v), -2, 4) : -2;
}

/** Wie kommt ein Beschluss an? +1 beliebt, −1 umstritten, 0 neutral (steuert den Ruf des Amtsinhabers). */
function policyMood(kind, val) {
  const v = Number(val) || 0;
  switch (kind) {
    case 'surcharge': case 'vat': case 'tariff': case 'pricebrake': return v < 0 ? 1 : v > 0 ? -1 : 0;
    case 'rentcap': case 'landzone': case 'housing': return 1;
    default: return 0;
  }
}

const levelName = (lv) => levelInfo(lv).name;
/** Satz für gesperrte Aktionen. */
function needText(minLv) {
  if (minLv < 0) return 'Mit dem Ruf „Verrufen“ ist das gesperrt. Zahle Rechnungen pünktlich und halte dich an Verträge, dann erholt sich dein Ansehen.';
  return `Dafür brauchst du mindestens Ansehen: ${levelName(minLv)}.`;
}
/** Prüft eine Mindeststufe; gibt den Hinweis oder null zurück. */
function block(lv, minLv) {
  if (minLv < 0) return lv <= -2 ? needText(minLv) : null; // minLv = −1: jeder außer Verrufen
  return lv >= minLv ? null : needText(minLv);
}

const TIPS = [
  { kind: 'rel', icon: 'clock', title: 'Rechnungen pünktlich zahlen', text: 'Miete und Kreditraten rechtzeitig zahlen und Verträge einhalten – das ist die schnellste Grundlage.' },
  { kind: 'trade', icon: 'handshake', title: 'Fair handeln', text: 'Schließe Geschäfte mit Mitspielern ab, beantworte Angebote und liefere zuverlässig.' },
  { kind: 'civic', icon: 'gift', title: 'Gutes tun', text: 'Beschäftige Mitarbeiter, zahle Steuern und beschenke Mitspieler. Das zählt für das Gemeinwohl.' },
  { kind: 'office', icon: 'landmark', title: 'Ein Amt ausfüllen', text: 'Wahlen gewinnen und Amtszeiten zu Ende bringen steigert das Ansehen im Amt.' },
  { kind: 'scandal', icon: 'shield', title: 'Skandale vermeiden', text: 'Sabotage, Pleiten und Rauswürfe schaden lange. Ein Skandal flaut nur langsam ab.' },
];

/** Kurzfassung für die Übersicht und den „Was jetzt?“-Berater. */
function brief(state) {
  const r = stand(state); const info = levelInfo(r.lv);
  return { s: r.s, l: r.l, lv: r.lv, ll: r.ll, name: info.name, key: info.key, tone: info.tone };
}

module.exports = {
  KINDS, KIND_LABEL, KIND_HINT, LEVELS, REASONS, TIPS, levelInfo, levelName, blank, score, levelOf, progress, localScore, decay, inherit, applyEvent, pointsOf,
  makeSnap, stand, queue, brief, policyMood, creditRateDelta, creditLimitMult, contractBandPad, tenantDemandMult, arrearsMult, voteWeight, officeMin, minFor, needText, block, strength, isDay, cfg,
};
