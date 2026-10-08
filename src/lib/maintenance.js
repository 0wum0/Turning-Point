'use strict';
/**
 * Tägliches Aufräumen alter Daten. Löscht in kleinen Schritten (DELETE … LIMIT), damit keine langen Sperren entstehen.
 * Aufbewahrungsfristen: Admin → Einstellungen → Aufräumen (settings key `maintenance`).
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');

const DAY = 86400000;
const DEFAULT_DAYS = { chatDays: 30, lettersReadDays: 180, newsDays: 90, worldEventsDays: 60, marketDays: 30, ordersDays: 30, tradesDays: 180, leasesDays: 90, anonSessionDays: 2 };

/** Reine Funktion: Aufbewahrungstage → Grenzzeitpunkte (Date). Ungültige/0-Werte fallen auf den Standard zurück. */
function cutoffs(cfg = {}, now = Date.now()) {
  const out = {};
  for (const [k, def] of Object.entries(DEFAULT_DAYS)) {
    const n = Number(cfg[k]);
    const days = Number.isFinite(n) && n >= 1 ? Math.min(n, 3650) : def;
    out[k] = new Date(now - days * DAY);
  }
  return out;
}

/** Löscht wiederholt mit LIMIT, bis weniger als `batch` Zeilen betroffen waren. Gibt die Gesamtzahl zurück. */
async function purge(sql, params, batch) {
  let total = 0;
  for (let i = 0; i < 500; i++) {
    const r = await db.query(`${sql} LIMIT ${batch}`, params);
    total += r.affectedRows || 0;
    if ((r.affectedRows || 0) < batch) break;
    await new Promise((res) => setImmediate(res));
  }
  return total;
}

const TASKS = [
  ['chat', 'DELETE FROM chat_messages WHERE created_at < ?', 'chatDays'],
  ['letters', 'DELETE FROM messages WHERE read_at IS NOT NULL AND created_at < ?', 'lettersReadDays'],
  ['news', 'DELETE FROM public_news WHERE created_at < ?', 'newsDays'],
  ['events', 'DELETE FROM world_events WHERE created_at < ?', 'worldEventsDays'],
  ['bids', "DELETE FROM market_bids WHERE auction_id IN (SELECT id FROM (SELECT id FROM market_auctions WHERE status <> 'open' AND ends_at < ?) x)", 'marketDays'],
  ['auctions', "DELETE FROM market_auctions WHERE status <> 'open' AND ends_at < ?", 'marketDays'],
  ['offers', "DELETE FROM market_offers WHERE status <> 'open' AND expires_at < ? AND created_at < ?", 'marketDays', 2],
  ['orders', "DELETE FROM stock_orders WHERE status IN ('filled','cancelled') AND created_at < ?", 'ordersDays'],
  ['trades', 'DELETE FROM stock_trades WHERE created_at < ?', 'tradesDays'],
  ['leases', "DELETE FROM player_leases WHERE status = 'ended' AND created_at < ?", 'leasesDays'],
];

async function run(now = Date.now()) {
  const cfg = settings.get('maintenance') || {};
  if (cfg.enabled === false) return null;
  const batch = Math.max(100, Math.min(Number(cfg.batch) || 2000, 20000));
  const cut = cutoffs(cfg, now);
  const res = {};
  for (const [name, sql, key, times] of TASKS) {
    const params = Array(times || 1).fill(cut[key]);
    res[name] = await purge(sql, params, batch);
  }
  // abgelaufene Sitzungen und Sitzungen ohne Anmeldung, die länger nicht benutzt wurden (Sitzungen werden bei jeder Anfrage um 30 Tage verlängert)
  res.sessions = await purge('DELETE FROM sessions WHERE expires < ?', [now], batch);
  res.anonSessions = await purge("DELETE FROM sessions WHERE data NOT LIKE '%\"userId\"%' AND expires < ?", [now + 30 * DAY - Number(cfg.anonSessionDays > 0 ? cfg.anonSessionDays : 2) * DAY], batch);
  const n = Object.values(res).reduce((a, b) => a + b, 0);
  if (n) log.info(`[maintenance] ${n} alte Zeilen gelöscht`, JSON.stringify(res));
  return res;
}

let timer = null;
function start() {
  if (timer) return;
  const go = () => run().catch((e) => log.error('[maintenance]', e));
  setTimeout(go, 60 * 1000).unref();
  timer = setInterval(go, DAY); timer.unref();
}

module.exports = { cutoffs, run, start, DEFAULT_DAYS };
