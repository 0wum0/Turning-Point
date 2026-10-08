'use strict';
/**
 * Tagesblatt: öffentliche Zeitung über alles, was in der Welt passiert – Kennzahlen (Geld im Umlauf, aktive Spieler, Handel, Börse)
 * und Schlagzeilen aus Spielerereignissen (public_news) sowie Weltereignissen (world_events: neue Leben, Insolvenzen, Börsenbericht).
 * Namen erscheinen nur bei Spielern mit sichtbarem Profil.
 */
const db = require('../db');
const log = require('./log');

async function post(kind, title, text, cityId = 0, conn = db) {
  try { await conn.query('INSERT INTO world_events (kind, city_id, title, text) VALUES (?,?,?,?)', [kind, cityId || 0, String(title).slice(0, 200), String(text)]); } catch (e) { log.warn(`[tagesblatt] ${e.message}`); }
}

async function stats() {
  const world = await require('../game/world').get();
  const one = async (sql, p = []) => (await db.one(sql, p)) || {};
  const online = await one("SELECT COUNT(*) n FROM users WHERE banned = 0 AND last_seen_at > NOW() - INTERVAL 10 MINUTE");
  const day = await one("SELECT COUNT(*) n FROM users WHERE banned = 0 AND last_seen_at > NOW() - INTERVAL 1 DAY");
  const total = await one('SELECT COUNT(*) n FROM users WHERE banned = 0');
  const alive = await one("SELECT COUNT(*) n FROM player_stats WHERE status = 'alive'");
  const byYear = await db.query("SELECT ps.year y, SUM(c.money) m FROM player_stats ps JOIN characters c ON c.id = ps.char_id WHERE ps.status = 'alive' GROUP BY ps.year");
  const money = byYear.reduce((s, r) => s + Number(r.m) / Math.max(0.0001, world.idx(r.y)), 0);
  const wealth = await one("SELECT COALESCE(SUM(wealth),0) n FROM player_stats WHERE status = 'alive'");
  const firms = await one('SELECT COUNT(*) n, COALESCE(SUM(value_real),0) v FROM player_firms');
  const props = await one('SELECT COUNT(*) n FROM player_props');
  const trades = await one("SELECT COUNT(*) n FROM social_log WHERE kind = 'trade' AND created_at > NOW() - INTERVAL 1 DAY");
  const listed = await one("SELECT COUNT(*) n FROM stocks WHERE status = 'active'");
  const vol = await one('SELECT COALESCE(SUM(shares * price_real),0) n FROM stock_trades WHERE created_at > NOW() - INTERVAL 1 DAY');
  const auctions = await one("SELECT COUNT(*) n FROM market_auctions WHERE status = 'open'");
  const debt = await one("SELECT COUNT(*) n FROM player_stats WHERE status = 'alive' AND wealth < 0");
  return {
    online: Number(online.n), activeDay: Number(day.n), players: Number(total.n), alive: Number(alive.n),
    money: Math.round(money / 100), wealth: Math.round(Number(wealth.n) / 100), firms: Number(firms.n), firmValue: Math.round(Number(firms.v) / 100), props: Number(props.n),
    trades: Number(trades.n), listed: Number(listed.n), stockVolume: Math.round(Number(vol.n) / 100), auctions: Number(auctions.n), indebted: Number(debt.n),
  };
}

async function feed(limit = 40, cityId = 0) {
  const lim = Math.min(100, Math.max(1, limit));
  const c = cityId ? 'AND city_id = ?' : ''; const p = cityId ? [cityId] : [];
  const rows = await db.query(
    `(SELECT 'player' src, n.section, n.title, n.text, n.created_at, n.city_id FROM public_news n JOIN users u ON u.id = n.user_id WHERE u.social_public = 1 AND u.banned = 0 ${c.replace('city_id', 'n.city_id')})
     UNION ALL (SELECT 'world', CASE kind WHEN 'stock' THEN 'Börse' WHEN 'life' THEN 'Chronik' ELSE 'Wirtschaft' END, title, text, created_at, city_id FROM world_events WHERE 1=1 ${c})
     ORDER BY created_at DESC LIMIT ${lim}`, [...p, ...p]);
  const world = await require('../game/world').get();
  const city = (id) => { const x = id && world.city(id); return x ? (x.label || x.name) : null; };
  return rows.map((r) => ({ section: r.section, title: r.title, text: r.text, at: r.created_at, city: city(r.city_id) }));
}

/** Stündlicher Börsenbericht: größter Gewinner/Verlierer der letzten 24 Stunden. */
async function stockReport() {
  const rows = await db.query("SELECT s.name, s.city_id, s.price_real, (SELECT price_real FROM stock_trades WHERE stock_id = s.id AND created_at < NOW() - INTERVAL 1 DAY ORDER BY id DESC LIMIT 1) prev FROM stocks s WHERE s.status = 'active'");
  const ch = rows.filter((r) => r.prev).map((r) => ({ ...r, pct: (Number(r.price_real) / Number(r.prev) - 1) * 100 })).sort((a, b) => b.pct - a.pct);
  if (!ch.length) return;
  const up = ch[0]; const down = ch[ch.length - 1];
  if (Math.abs(up.pct) < 1 && Math.abs(down.pct) < 1) return;
  const last = await db.one("SELECT 1 x FROM world_events WHERE kind = 'stock' AND created_at > NOW() - INTERVAL 20 HOUR LIMIT 1");
  if (last) return;
  const f = (x) => `${x.pct >= 0 ? '+' : ''}${x.pct.toFixed(1).replace('.', ',')} %`;
  await post('stock', 'Börsenbericht', `Größter Gewinner: ${up.name} (${f(up)}). ${down !== up ? `Größter Verlierer: ${down.name} (${f(down)}).` : ''}`.trim(), up.city_id);
}

function start() {
  setInterval(() => { stockReport().catch(() => {}); }, 3600000).unref();
  setInterval(() => { db.query("DELETE FROM world_events WHERE created_at < NOW() - INTERVAL 60 DAY").catch(() => {}); }, 86400000).unref();
}

module.exports = { post, stats, feed, stockReport, start };
