'use strict';
/**
 * Gesellschaft – gemeinsame Bausteine der Server-Seite: Prüfungen, Umrechnung, Kassenbücher, Lebenssummen je Konto, Gemeinwohl-Töpfe der Städte
 * und Titel. Geld wird in „Real“ geführt (Cent, Wert von 1945) und mit dem Preisindex des Spielers in Cent seiner Währung umgerechnet.
 * Alle Buchungen laufen innerhalb der Transaktion von service.withCharacter (die Zeilen des Spielers sind gesperrt): Spielstand und Datenbank ändern
 * sich gemeinsam oder gar nicht – jede Zahlung wird genau einmal gebucht.
 */
const db = require('../db');
const log = require('./log');
const live = require('./live');
const M = require('../game/civic');
const { ActionError } = require('../game/actions');
const { yearOf } = require('../game/calendar');
const { formatMoney } = require('../game/economy');

const fail = (m) => { throw new ActionError(m); };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const HOUR = 3600000;
const today = () => Math.floor(Date.now() / 86400000);

const idxOf = (world, state) => Math.max(0.0001, world.idx(yearOf(state.day, state.startYear)));
const curOf = (world, state) => world.currency(yearOf(state.day, state.startYear));
const money = (cents, world, state) => formatMoney(cents, curOf(world, state));
/** Betrag aus der Oberfläche (Hauptwährung, z. B. 12,50) → Cent; null, wenn unbrauchbar. */
function centsFrom(input) {
  const n = Number(String(input == null ? '' : input).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) return null;
  return Math.round(n * 100);
}

/** Gemeinsame Prüfungen für jede Handlung: eingeschaltet, lebender Charakter, Kontoalter, nicht stummgeschaltet, Spieltage. */
async function guard(userId, state, part, { minDays = true } = {}) {
  const C = M.C();
  if (!M.enabled()) fail('Die Gesellschaft ist gerade nicht verfügbar.');
  if (part === 'clubs' && !M.clubsOn()) fail('Vereine sind gerade nicht verfügbar.');
  if (part === 'parish' && !M.parishOn()) fail('Gemeinden sind gerade nicht verfügbar.');
  if (part === 'foundation' && !M.foundationOn()) fail('Stiftungen sind gerade nicht verfügbar.');
  if (!state || state.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  const a = await require('./social').accountAgeHours(userId);
  if (a.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.');
  if (a.h < M.num(C.minAccountHours, 12)) fail(`Das geht erst ${M.num(C.minAccountHours, 12)} Stunden nach der Registrierung.`);
  if (minDays && state.day < M.num(C.minGameDays, 15)) fail(`Dein Charakter muss mindestens ${M.num(C.minGameDays, 15)} Spieltage alt sein.`);
}
/** Haft sperrt Geldausgaben (wie alle wirtschaftlichen Handlungen). */
async function notJailed(userId) { await require('./court').assertFree(userId, 'econ'); }

/* ---- Kassenbücher ---- */
async function book(conn, table, fk, id, userId, kind, amountReal, text, keep) {
  await conn.query(`INSERT INTO ${table} (${fk}, user_id, kind, amount_real, text) VALUES (?,?,?,?,?)`, [id, userId || null, String(kind).slice(0, 12), Math.round(num(amountReal, 0) * 100) / 100, String(text || '').slice(0, 200)]);
  const k = Math.max(20, Math.min(400, int(keep, 100)));
  if (Math.random() < 0.1) await conn.query(`DELETE FROM ${table} WHERE ${fk} = ? AND id < (SELECT id FROM (SELECT id FROM ${table} WHERE ${fk} = ? ORDER BY id DESC LIMIT 1 OFFSET ?) x)`, [id, id, k]);
}
const clubBook = (conn, clubId, userId, kind, real, text) => book(conn, 'club_log', 'club_id', clubId, userId, kind, real, text, (M.C().clubs || {}).ledgerKeep);
const parishBook = (conn, id, userId, kind, real, text) => book(conn, 'parish_log', 'parish_id', id, userId, kind, real, text, (M.C().parish || {}).ledgerKeep);
const foundBook = (conn, id, userId, kind, real, text) => book(conn, 'foundation_log', 'foundation_id', id, userId, kind, real, text, (M.C().foundation || {}).ledgerKeep);

/* ---- Lebenssummen je Konto (Spenden und Stiftungsvermögen zählen für Titel, über alle Generationen) ---- */
async function addUserSum(conn, userId, field, real) {
  if (!(field === 'donated_real' || field === 'contributed_real')) throw new Error('Feld');
  await conn.query(`INSERT INTO civic_user (user_id, ${field}, updated_ms) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ${field} = GREATEST(0, ${field} + VALUES(${field})), updated_ms = VALUES(updated_ms)`, [userId, Math.max(-1e12, real), Date.now()]);
}
async function userSums(conn, userId) {
  const r = await conn.one('SELECT donated_real, contributed_real FROM civic_user WHERE user_id = ?', [userId]);
  return { donated: r ? Number(r.donated_real) : 0, contributed: r ? Number(r.contributed_real) : 0 };
}

/* ---- Gemeinwohl-Töpfe der Städte (Auszahlungen gemeinnütziger Stiftungen, Vereinsfeste): wirken nach und klingen je Tag ab ---- */
const POT_KEYS = ['bildung', 'gesundheit', 'kultur', 'armut'];
const POTS = new Map(); // cityId -> { bildung, gesundheit, kultur, armut, day }
function potRowNow(row) {
  const d = Math.max(0, today() - num(row.day_no != null ? row.day_no : row.day, today()));
  const out = { day: today() };
  for (const k of POT_KEYS) out[k] = M.potDecay(num(row[k], 0), d);
  return out;
}
/** Zahlung in einen Topf (in der Transaktion conn); der Zwischenspeicher wird nach dem Commit aktualisiert. */
async function potAdd(conn, cityId, purpose, real) {
  if (!cityId || !POT_KEYS.includes(purpose) || !(real > 0)) return;
  await conn.query('INSERT IGNORE INTO city_civic (city_id, day_no, updated_ms) VALUES (?,?,?)', [cityId, today(), Date.now()]);
  const row = await conn.one('SELECT * FROM city_civic WHERE city_id = ? FOR UPDATE', [cityId]);
  const cur = potRowNow(row); cur[purpose] += real;
  await conn.query('UPDATE city_civic SET bildung = ?, gesundheit = ?, kultur = ?, armut = ?, day_no = ?, updated_ms = ? WHERE city_id = ?', [cur.bildung, cur.gesundheit, cur.kultur, cur.armut, cur.day, Date.now(), cityId]);
  const after = () => { POTS.set(cityId, cur); live.publish('civic', {}); };
  const q = conn.repAfter || conn.civicAfter; // Listen, die nach dem Commit laufen (service.withCharacter bzw. eigene Transaktionen)
  if (q) q.push(after); else after();
}
async function loadPots() {
  try {
    const rows = await db.query('SELECT * FROM city_civic');
    POTS.clear();
    for (const r of rows) POTS.set(r.city_id, { day: num(r.day_no, today()), bildung: num(r.bildung, 0), gesundheit: num(r.gesundheit, 0), kultur: num(r.kultur, 0), armut: num(r.armut, 0) });
  } catch (e) { log.warn(`[gesellschaft] Töpfe: ${e.message}`); }
}
/** Wirkung der Töpfe in einer Stadt { kids, health, wellbeing, aid }. */
function potFx(world, cityId) {
  const row = POTS.get(cityId); if (!row) return null;
  const c = world && world.city(cityId);
  return M.potEffect(potRowNow(row), c ? c.size_tier : 2);
}
const potSnapshot = (cityId) => { const row = POTS.get(cityId); return row ? potRowNow(row) : null; };

/** Später (nach dem Commit der Transaktion) ausführen; ohne Liste sofort. */
const after = (conn, fn) => { const q = conn && (conn.repAfter || conn.civicAfter); if (q) q.push(fn); else Promise.resolve().then(fn).catch((e) => log.warn(`[gesellschaft] ${e.message}`)); };

/* ---- Titel eines Kontos ---- */
async function titlesOf(conn, userId) {
  const rows = await conn.query('SELECT tkey, rnk, city_id, scope FROM titles WHERE user_id = ? AND active = 1', [userId]);
  return rows.map((r) => ({ key: r.tkey, rank: r.rnk, cityId: r.city_id, scope: r.scope }));
}
const titleFxOf = async (conn, userId) => M.titleFx(await titlesOf(conn, userId));

module.exports = {
  after, titlesOf, titleFxOf,
  fail, int, num, HOUR, today, idxOf, curOf, money, centsFrom, guard, notJailed, clubBook, parishBook, foundBook, addUserSum, userSums,
  POT_KEYS, POTS, potAdd, loadPots, potFx, potSnapshot, potRowNow,
};
