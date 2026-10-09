'use strict';
/**
 * Ruf und Ansehen – Speicher und Schnittstelle (Modell: src/game/reputation.js).
 *
 *   add(userId, kind, delta, reason, ref, opts)   Ereignis buchen (sofort, eigene Transaktion – nie innerhalb einer fremden Sperre aufrufen)
 *   queue (game/reputation.queue)                 im Spielstand vormerken; flush() bucht es VOR dem Speichern genau einmal
 *   get(userId, cityId)                           aktuelle Werte (Bestandteile, Gesamtwert, Stufe, örtlich)
 *   many(ids, cityId)                             nur Stufen für Plaketten (eine Abfrage)
 *
 * Schutz: Handlungen mit Konten gleicher IP oder ganz neuen Konten zählen nicht (opts.other), Tagesgrenzen je Ereignis und
 * Bestandteil, abnehmender Ertrag, Abflauen zur Mitte (träge beim Lesen/Schreiben, kein Zeitgeber nötig).
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const live = require('./live');
const R = require('../game/reputation');

const cfg = () => settings.get('ruf') || {};
const on = () => cfg().enabled !== false;
const today = () => R.isDay(Date.now());
const parse = (s) => { try { const o = s ? JSON.parse(s) : null; return o && typeof o === 'object' ? o : null; } catch (_) { return null; } };
const pick = (r) => ({ rel: Number(r.rel) || 0, trade: Number(r.trade) || 0, civic: Number(r.civic) || 0, office: Number(r.office) || 0, scandal: Number(r.scandal) || 0 });

/* ---- kleiner Zwischenspeicher (15 s) für die Werte je Spieler; add() leert ihn ---- */
const cache = new Map(); // userId -> Map(cityId -> {at, snap})
const TTL = process.env.TP_REP_CACHE_MS != null && process.env.TP_REP_CACHE_MS !== '' ? Math.max(0, Number(process.env.TP_REP_CACHE_MS) || 0) : 15000; // Tests ändern die Datenbank direkt: dort TP_REP_CACHE_MS=0
function cacheGet(uid, city) { const m = cache.get(uid); const e = m && m.get(city); return e && Date.now() - e.at < TTL ? e.snap : null; }
function cachePut(uid, city, snap) {
  if (cache.size > 3000) cache.clear();
  let m = cache.get(uid); if (!m) { m = new Map(); cache.set(uid, m); }
  m.set(city, { at: Date.now(), snap });
}
const invalidate = (uid) => cache.delete(uid);

/** Zeile laden und bis heute abflauen lassen (nur im Speicher). */
function settle(row, cityRow) {
  const C = cfg(); const t = today();
  const c = R.decay(pick(row), t - (Number(row.decay_day) || t), C);
  let pts = 0;
  if (cityRow) pts = (Number(cityRow.pts) || 0) * Math.pow(1 - Math.min(0.5, (Number((C.decayPct || {}).civic) || 1.5) / 100), Math.max(0, t - (Number(cityRow.decay_day) || t)));
  return { c, pts, caps: parse(row.caps) };
}

async function readRow(conn, userId, cityId, lock) {
  const sql = `SELECT r.*, rc.pts AS c_pts, rc.decay_day AS c_day FROM reputation r LEFT JOIN reputation_city rc ON rc.user_id = r.user_id AND rc.city_id = ? WHERE r.user_id = ?${lock ? ' FOR UPDATE' : ''}`;
  return conn.one(sql, [Number(cityId) || 0, userId]);
}

/** Aktuelle Werte (neutral, wenn es noch keine Zeile gibt). */
async function get(userId, cityId = 0, conn = db) {
  const C = cfg();
  const hit = cacheGet(userId, cityId); if (hit) return hit;
  const row = await readRow(conn, userId, cityId, false);
  const st = row ? settle(row, row.c_day != null ? { pts: row.c_pts, decay_day: row.c_day } : null) : { c: R.blank(), pts: 0 };
  const snap = describe(st.c, st.pts, C);
  cachePut(userId, cityId, snap);
  return snap;
}

function describe(c, pts, C = cfg()) {
  const s = R.score(c, C); const l = R.localScore(s, pts, C); const lv = R.levelOf(s, C); const ll = R.levelOf(l, C);
  const info = R.levelInfo(lv); const pr = R.progress(s, C);
  return {
    enabled: C.enabled !== false, comps: Object.fromEntries(R.KINDS.map((k) => [k, Math.round(c[k] * 10) / 10])), score: s, level: lv, levelName: info.name, levelKey: info.key, tone: info.tone,
    local: l, localLevel: ll, localName: R.levelName(ll), progress: pr, nextName: pr.next == null ? null : R.levelName(lv + 1),
  };
}

/** Zwischenspeicher für den Spielstand (state.rep). */
async function snapshot(conn, userId, cityId) {
  if (!on()) return null;
  const d = await get(userId, cityId, conn);
  return { s: d.score, l: d.local, lv: d.level, ll: d.localLevel, c: R.KINDS.map((k) => d.comps[k]) };
}

/** Plakettendaten für viele Spieler: { userId -> {lv, ll, s} } (ll nur mit cityId). */
async function many(ids, cityId = 0) {
  const out = new Map(); const list = [...new Set((ids || []).map(Number).filter((x) => x > 0))].slice(0, 200);
  if (!list.length || !on()) return out;
  const C = cfg();
  const rows = await db.query(`SELECT * FROM reputation WHERE user_id IN (${list.map(() => '?').join(',')})`, list);
  const crows = cityId ? await db.query(`SELECT * FROM reputation_city WHERE city_id = ? AND user_id IN (${list.map(() => '?').join(',')})`, [Number(cityId), ...list]) : [];
  const cmap = new Map(crows.map((r) => [r.user_id, r]));
  for (const r of rows) {
    const st = settle(r, cmap.get(r.user_id) || null); const s = R.score(st.c, C); const l = R.localScore(s, st.pts, C);
    out.set(r.user_id, { s, lv: R.levelOf(s, C), l, ll: R.levelOf(l, C), scandal: Math.round(st.c.scandal * 10) / 10 });
  }
  for (const id of list) if (!out.has(id)) out.set(id, { s: 0, lv: 0, l: 0, ll: 0, scandal: 0 });
  return out;
}
/** Plakette als kleines Objekt für Listen. */
function badge(m, local = false) { const lv = m ? (local ? m.ll : m.lv) : 0; return { lv, name: R.levelName(lv) }; }

/* ---- Abgleich fremder Konten (Missbrauchsschutz) ---- */
async function countsFor(userId, other) {
  const C = cfg(); const social = require('./social');
  if (!other || other === userId) return true;
  if (C.blockSameIp !== false) { try { if (await social.sameIp(userId, other)) return false; } catch (_) { /* ohne IP-Tabelle */ } }
  const min = Number(C.minAccountHours); if (min > 0) {
    try { const a = await social.accountAgeHours(userId); const b = await social.accountAgeHours(other); if (a.h < min || b.h < min) return false; } catch (_) { /* weiter */ }
  }
  return true;
}

async function ensureRow(conn, userId) {
  await conn.query('INSERT IGNORE INTO reputation (user_id, decay_day, updated_at) VALUES (?,?,?)', [userId, today(), Date.now()]);
}

/** Kern: bucht ein Ereignis in der Transaktion conn. Gibt den angewendeten Betrag zurück (0, wenn nichts zählte). */
async function addConn(conn, userId, kind, delta, reason, ref, opts = {}) {
  const C = cfg(); if (!on() || !R.REASONS[reason]) return 0; // nur bekannte Ereignisse (feste Liste, jedes mit Tagesgrenze)
  const sign = Number(delta != null ? delta : (R.REASONS[reason] || {}).d);
  const positive = (kind === 'scandal' || (R.REASONS[reason] && R.REASONS[reason].kind === 'scandal')) ? sign < 0 : sign > 0;
  if (opts.other && positive && !(await countsFor(userId, opts.other))) return 0;
  await ensureRow(conn, userId);
  const cityId = Number(opts.cityId) || 0;
  const row = await readRow(conn, userId, cityId, true);
  const st = settle(row, row.c_day != null ? { pts: row.c_pts, decay_day: row.c_day } : null);
  const t = today();
  const before = R.score(st.c, C); const lvBefore = R.levelOf(before, C);
  const res = R.applyEvent({ c: st.c, caps: st.caps }, { kind, delta, reason, pairKey: opts.other || undefined }, C, t);
  const c = res.c;
  const sc = R.score(c, C); const lvAfter = R.levelOf(sc, C);
  // geändert? (auch ohne Betrag Abflauen und Tageswechsel festhalten)
  await conn.query('UPDATE reputation SET rel=?, trade=?, civic=?, office=?, scandal=?, score=?, lvl=?, caps=?, decay_day=?, updated_at=? WHERE user_id=?',
    [c.rel, c.trade, c.civic, c.office, c.scandal, sc, lvAfter, JSON.stringify(res.caps), t, Date.now(), userId]);
  const applied = res.applied;
  if (Math.abs(applied) < 0.005 || !res.kind) { invalidate(userId); return 0; }
  const kd = res.kind;
  if (cityId) {
    const pts = Math.max(-100, Math.min(100, st.pts + R.pointsOf(kd, applied, C)));
    await conn.query('INSERT INTO reputation_city (user_id, city_id, pts, decay_day) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE pts = VALUES(pts), decay_day = VALUES(decay_day)', [userId, cityId, pts, t]);
  }
  const rs = String(reason || '').slice(0, 30);
  const upd = await conn.query('UPDATE reputation_log SET delta = delta + ?, n = n + ?, ref = ?, created_at = NOW() WHERE user_id = ? AND reason = ? AND day_no = ? AND kind = ?', [applied, Math.max(1, opts.n || 1), ref == null ? null : String(ref).slice(0, 60), userId, rs, t, kd]);
  if (!upd || !upd.affectedRows) {
    await conn.query('INSERT INTO reputation_log (user_id, kind, reason, delta, n, ref, city_id, day_no) VALUES (?,?,?,?,?,?,?,?)', [userId, kd, rs, applied, Math.max(1, opts.n || 1), ref == null ? null : String(ref).slice(0, 60), cityId || null, t]);
    const keep = Math.max(10, Math.min(400, Number(C.ledgerKeep) || 80));
    await conn.query('DELETE FROM reputation_log WHERE user_id = ? AND id < (SELECT id FROM (SELECT id FROM reputation_log WHERE user_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?) x)', [userId, userId, keep]);
  }
  invalidate(userId);
  const post = () => notifyChange(userId, lvBefore, lvAfter, cityId).catch((e) => log.warn(`[ruf] ${e.message}`));
  if (conn.repAfter) conn.repAfter.push(post); else post();
  if (conn.repAfter) conn.repAfter.push(() => live.publish('rep', {}, userId)); else live.publish('rep', {}, userId);
  return applied;
}

/** Ereignis buchen (eigene Transaktion). Nie aus einer Transaktion heraus aufrufen, die andere Spieler sperrt. */
async function add(userId, kind, delta, reason, ref, opts = {}) {
  if (!on() || !userId) return 0;
  try {
    if (opts.conn) return await addConn(opts.conn, userId, kind, delta, reason, ref, opts);
    const after = [];
    const r = await db.tx((conn) => { conn.repAfter = after; return addConn(conn, userId, kind, delta, reason, ref, opts); });
    await runAfter(after);
    return r;
  } catch (e) { log.warn(`[ruf] ${reason}: ${e.message}`); return 0; }
}

/** Stufenwechsel: Brief an den Spieler, bei Absturz oder Ehrenbürger eine Meldung im Tagesblatt. */
async function notifyChange(userId, before, after, cityId) {
  if (before === after) return;
  const social = require('./social');
  const name = R.levelName(after);
  if (after > before) await social.sendSystemLetter(userId, 'Dein Ansehen ist gestiegen', `Die Leute reden gut über dich: Dein Ansehen ist jetzt „${name}“. Unter „Übersicht → Ansehen“ siehst du, warum.`);
  else if (after <= -1 && before > after) await social.sendSystemLetter(userId, 'Dein Ruf hat gelitten', `Dein Ansehen ist auf „${name}“ gefallen. Zahle Rechnungen pünktlich und halte Verträge ein – dann erholt es sich mit der Zeit. Unter „Übersicht → Ansehen“ siehst du, warum.`);
  if (after >= 4 || after <= -2) {
    const u = await db.one('SELECT u.social_public, u.is_bot, ps.name, ps.city_id FROM users u LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE u.id = ?', [userId]);
    if (!u) return;
    const nm = u.social_public && u.name ? u.name : 'Ein Bürger';
    const city = cityId || (u.city_id || 0);
    if (after >= 4 && before < 4) await require('./tagesblatt').post('life', 'Ehrenbürger', `${nm} genießt höchstes Ansehen und gilt nun als Ehrenbürger.`, city);
    else if (after <= -2 && before > -2) await require('./tagesblatt').post('life', 'Skandal', `${nm} ist in Verruf geraten: Man spricht von Sabotage, Zahlungsausfällen und gebrochenen Verträgen.`, city);
  }
}

/** Vorgemerkte Ereignisse des Spielstands verbuchen (vor dem Speichern, in derselben Transaktion). Fremde Ziele erst nach dem Commit. */
async function flush(conn, user, state) {
  if (!state || !state.pending) return;
  const q = state.pending.rep;
  if (q && q.length) {
    state.pending.rep = []; // zuerst leeren: Der gespeicherte Stand darf die Einträge nie ein zweites Mal enthalten
    for (const e of q) {
      if (!e || !R.REASONS[e.r] && !R.KINDS.includes(e.k)) continue;
      const target = e.u && e.u !== user.id ? e.u : user.id;
      const opts = { other: e.o || undefined, cityId: e.c || 0, n: e.n || 1 };
      if (target !== user.id) { if (conn.repAfter) conn.repAfter.push(() => add(target, e.k, e.d, e.r, e.f, { ...opts, other: user.id })); continue; }
      try { await addConn(conn, user.id, e.k, e.d, e.r, e.f, { ...opts, conn }); } catch (er) { log.warn(`[ruf] ${e.r}: ${er.message}`); }
    }
  } else if (state.pending.rep) delete state.pending.rep;
  state.rep = await snapshot(conn, user.id, state.cityId);
  if (!state.rep) delete state.rep;
}

/** Nach dem Commit: aufgeschobene Buchungen ausführen. */
async function runAfter(list) {
  for (const f of list || []) { try { await f(); } catch (e) { log.warn(`[ruf] ${e.message}`); } }
}

/** Erbe bzw. Neustart: Bestandteile auf pct Prozent verkleinern (Familienruf bleibt zum Teil). */
async function inherit(conn, userId, which = 'heir') {
  if (!on()) return;
  const C = cfg(); const pct = Number((C.inherit || {})[which === 'heir' ? 'heirPct' : 'restartPct']);
  const row = await conn.one('SELECT * FROM reputation WHERE user_id = ? FOR UPDATE', [userId]);
  if (!row) return;
  const st = settle(row, null); const c = R.inherit(st.c, Number.isFinite(pct) ? pct : 50);
  await conn.query('UPDATE reputation SET rel=?, trade=?, civic=?, office=?, scandal=?, score=?, lvl=?, caps=NULL, decay_day=?, updated_at=? WHERE user_id=?',
    [c.rel, c.trade, c.civic, c.office, c.scandal, R.score(c, C), R.levelOf(R.score(c, C), C), today(), Date.now(), userId]);
  await conn.query('UPDATE reputation_city SET pts = pts * ?, decay_day = ? WHERE user_id = ?', [Math.max(0, Math.min(1, (Number.isFinite(pct) ? pct : 50) / 100)), today(), userId]);
  await conn.query('INSERT INTO reputation_log (user_id, kind, reason, delta, n, ref, day_no) VALUES (?,?,?,?,?,?,?)', [userId, 'rel', which === 'heir' ? 'inherit' : 'restart', 0, 1, which === 'heir' ? 'Familienruf geht zu Teilen auf den Erben über' : 'Neuanfang', today()]);
  invalidate(userId);
}

/** Protokoll für die Oberfläche: die letzten Einträge mit Text. */
async function ledger(userId, limit = 30) {
  const rows = await db.query('SELECT id, kind, reason, delta, n, ref, created_at FROM reputation_log WHERE user_id = ? ORDER BY id DESC LIMIT ?', [userId, Math.max(1, Math.min(200, limit))]);
  return rows.map((r) => ({ id: r.id, kind: r.kind, reason: r.reason, label: labelOf(r.reason, r.ref), why: (R.REASONS[r.reason] || {}).why || '', delta: Math.round(Number(r.delta) * 10) / 10, n: r.n, at: new Date(r.created_at).getTime() }));
}
function labelOf(reason, ref) {
  if (reason === 'inherit') return 'Familienruf: Der Erbe übernimmt einen Teil des Rufs';
  if (reason === 'restart') return 'Neuanfang: Ein Teil des alten Rufs bleibt';
  if (reason === 'admin') return ref && /^[\w\s,.!-]{1,60}$/.test(String(ref)) ? `Von der Spielleitung angepasst (${ref})` : 'Von der Spielleitung angepasst';
  return (R.REASONS[reason] || {}).label || 'Sonstiges';
}

/** Vollständige Ansicht für „Ansehen“: Bestandteile, Stufe, örtlich, letzte Veränderungen, Mindeststufen, Tipps. */
async function view(userId, cityId = 0, world = null) {
  const C = cfg(); const d = await get(userId, cityId);
  const log8 = await ledger(userId, 30);
  const since = Date.now() - 7 * 86400000;
  const recent = log8.filter((x) => x.at >= since && Math.abs(x.delta) >= 0.1);
  const top = [...recent].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  const levels = R.LEVELS.map((l) => ({ idx: l.idx, name: l.name, tone: l.tone, from: l.idx <= -2 ? null : (C.levels || [])[l.idx + 1] }));
  const offices = world ? world.econ.politics.offices.map((o, i) => ({ idx: i, name: o.name, min: R.officeMin(i, C), minName: R.officeMin(i, C) >= 0 ? R.levelName(R.officeMin(i, C)) : null })) : [];
  const gates = [
    { key: 'loan', label: 'Kredit aufnehmen', min: R.minFor('loan', C) }, { key: 'contract', label: 'Lieferverträge anbieten', min: R.minFor('contract', C) },
    { key: 'offer', label: 'Kaufangebote machen', min: R.minFor('offer', C) }, { key: 'ipo', label: 'An die Börse gehen', min: R.minFor('ipo', C) },
    { key: 'takeover', label: 'Betriebe übernehmen', min: R.minFor('takeover', C) }, { key: 'hire', label: 'Bewerben und einstellen', min: R.minFor('hire', C) },
  ].map((g) => ({ ...g, minName: g.min >= 0 ? R.levelName(g.min) : 'alle außer Verrufen', ok: !R.block(d.level, g.min) }));
  const fx = {
    creditRate: R.creditRateDelta(d.level, C), creditLimit: R.creditLimitMult(d.level, C), contractBand: R.contractBandPad(d.level, C),
    tenantDemand: R.tenantDemandMult(d.localLevel, C), arrears: R.arrearsMult(d.localLevel, C),
  };
  return {
    ok: true, ...d, cityId, kinds: R.KINDS.map((k) => ({ key: k, label: R.KIND_LABEL[k], hint: R.KIND_HINT[k], value: d.comps[k] })), top, ledger: log8, levels, offices, gates, effects: fx,
    tips: R.TIPS, honorMin: R.levelName(Math.max(0, Number((C.honor || {}).minLevel) || 1)),
  };
}

/** Wartung: alte Protokolleinträge und leere Ortspunkte entfernen. */
async function prune() {
  if (!on()) return;
  const days = Math.max(7, Number(cfg().ledgerDays) || 90);
  await db.query('DELETE FROM reputation_log WHERE created_at < NOW() - INTERVAL ? DAY LIMIT 2000', [days]);
  await db.query('DELETE FROM reputation_city WHERE ABS(pts) < 0.5 AND decay_day < ?', [today() - 14]);
}

/** Örtliche Punkte direkt anheben (z. B. Ehrenbürgerwürde); bleibt im Bereich −100 … 100. */
async function bumpLocal(userId, cityId, pts) {
  if (!on() || !userId || !cityId) return;
  await db.tx(async (conn) => {
    await ensureRow(conn, userId);
    const row = await readRow(conn, userId, cityId, true);
    const st = settle(row, row.c_day != null ? { pts: row.c_pts, decay_day: row.c_day } : null);
    const v = Math.max(-100, Math.min(100, st.pts + Number(pts || 0)));
    await conn.query('INSERT INTO reputation_city (user_id, city_id, pts, decay_day) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE pts = VALUES(pts), decay_day = VALUES(decay_day)', [userId, cityId, v, today()]);
  });
  invalidate(userId); live.publish('rep', {}, userId);
}

/**
 * Haken für spätere Gerichte und Misstrauensvoten (Schritt 4): Vertrauen in einen Amtsinhaber 0 … 1 aus Gesamtwert und Skandal.
 * Wer das Amt entziehen will, ruft confidence() ab und kann den Ruf über punish() belasten (gleiche Grenzen wie alle Ereignisse).
 */
async function confidence(userId, cityId = 0) {
  const d = await get(userId, cityId);
  return { value: Math.max(0, Math.min(1, (d.local + 50) / 100)), level: d.localLevel, scandal: d.comps.scandal, score: d.local };
}
function punish(userId, reason, delta, ref, opts) { return add(userId, 'scandal', delta, reason || 'fine', ref, opts); }

/** Admin: Werte setzen/zurücksetzen. */
async function adminReset(userId, comps = null) {
  const c = comps || R.blank();
  await db.tx(async (conn) => {
    await ensureRow(conn, userId);
    const sc = R.score(c, cfg());
    await conn.query('UPDATE reputation SET rel=?, trade=?, civic=?, office=?, scandal=?, score=?, lvl=?, caps=NULL, decay_day=?, updated_at=? WHERE user_id=?', [c.rel, c.trade, c.civic, c.office, c.scandal, sc, R.levelOf(sc, cfg()), today(), Date.now(), userId]);
    await conn.query('DELETE FROM reputation_city WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM reputation_log WHERE user_id = ?', [userId]);
    await conn.query('INSERT INTO reputation_log (user_id, kind, reason, delta, n, ref, day_no) VALUES (?,?,?,?,?,?,?)', [userId, 'rel', 'admin', 0, 1, 'zurückgesetzt', today()]);
  });
  invalidate(userId);
  live.publish('rep', {}, userId);
}
async function adminDeleteEntry(userId, id) { await db.query('DELETE FROM reputation_log WHERE id = ? AND user_id = ?', [Number(id) || 0, userId]); }

function start() { setInterval(() => { prune().catch((e) => log.warn(`[ruf] ${e.message}`)); }, 6 * 3600000).unref(); }

module.exports = { bumpLocal, confidence, punish, add, addConn, get, many, badge, snapshot, flush, runAfter, inherit, ledger, view, prune, adminReset, adminDeleteEntry, describe, start, countsFor, labelOf, invalidate, REASONS: R.REASONS };
