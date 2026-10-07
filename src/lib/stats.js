'use strict';
/** Statistiken fürs Admin-Dashboard: Tages-Schnappschüsse, Zeitreihen und Verteilungen. */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');

const iso = (d) => new Date(d).toISOString().slice(0, 10);
function dayList(n) { const out = []; const t = new Date(); t.setUTCHours(0, 0, 0, 0); for (let i = n - 1; i >= 0; i--) out.push(iso(t.getTime() - i * 86400000)); return out; }
const toMap = (rows, key = 'n') => new Map(rows.map((r) => [iso(r.d), Number(r[key])]));

/** Heutigen Schnappschuss schreiben (läuft alle 30 Minuten und beim Öffnen des Dashboards). */
async function snapshot() {
  const day = iso(Date.now());
  const u = await db.one("SELECT COUNT(*) total, SUM(created_at >= CURDATE()) newu, SUM(last_seen_at >= CURDATE() OR last_login_at >= CURDATE()) act, SUM(last_seen_at > NOW() - INTERVAL 10 MINUTE) online, COALESCE(SUM(coins),0) coins, COALESCE(SUM(efs_pool),0) efs FROM users");
  const c = await db.one("SELECT COUNT(*) alive, COALESCE(SUM(money),0) money FROM characters WHERE status = 'alive'");
  const rev = await db.one("SELECT COALESCE(SUM(price_cents),0) r FROM purchases WHERE status = 'completed' AND created_at >= CURDATE()");
  const ads = await db.one('SELECT COUNT(*) n FROM ad_claims WHERE claimed_at >= ?', [new Date(day).getTime()]);
  const fl = await db.one('SELECT COUNT(*) n FROM cheat_flags WHERE created_at >= CURDATE()');
  await db.query(
    `INSERT INTO daily_stats (day, users_total, new_users, active_users, online_peak, chars_alive, coins_total, efs_total, money_total, revenue_cents, ad_claims, flags)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE users_total=VALUES(users_total), new_users=VALUES(new_users), active_users=GREATEST(active_users, VALUES(active_users)), online_peak=GREATEST(online_peak, VALUES(online_peak)),
       chars_alive=VALUES(chars_alive), coins_total=VALUES(coins_total), efs_total=VALUES(efs_total), money_total=VALUES(money_total), revenue_cents=VALUES(revenue_cents), ad_claims=VALUES(ad_claims), flags=VALUES(flags)`,
    [day, u.total, u.newu || 0, u.act || 0, u.online || 0, c.alive, u.coins, u.efs, c.money, rev.r, ads.n, fl.n]);
}
function start() {
  snapshot().catch((e) => log.error('[stats] Schnappschuss', e));
  const t = setInterval(() => snapshot().catch((e) => log.error('[stats] Schnappschuss', e)), 30 * 60 * 1000);
  t.unref();
}

/** Zeitreihen der letzten n Tage (Quelltabellen + Schnappschüsse). */
async function series(n = 30) {
  const days = dayList(n);
  const since = days[0];
  const sinceMs = new Date(since).getTime();
  const [reg, rev, pur, ads, chars, deaths, logins, failed, flags, snaps, actUsers] = await Promise.all([
    db.query('SELECT DATE(created_at) d, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY DATE(created_at)', [since]),
    db.query("SELECT DATE(created_at) d, SUM(price_cents) n FROM purchases WHERE status='completed' AND created_at >= ? GROUP BY DATE(created_at)", [since]),
    db.query("SELECT DATE(created_at) d, COUNT(*) n FROM purchases WHERE status='completed' AND created_at >= ? GROUP BY DATE(created_at)", [since]),
    db.query('SELECT DATE(FROM_UNIXTIME(claimed_at/1000)) d, COUNT(*) n FROM ad_claims WHERE claimed_at >= ? GROUP BY d', [sinceMs]),
    db.query('SELECT DATE(created_at) d, COUNT(*) n FROM characters WHERE created_at >= ? GROUP BY DATE(created_at)', [since]),
    db.query('SELECT DATE(ended_at) d, COUNT(*) n FROM characters WHERE ended_at >= ? GROUP BY DATE(ended_at)', [since]),
    db.query("SELECT DATE(created_at) d, COUNT(*) n FROM audit_log WHERE action = 'login' AND created_at >= ? GROUP BY DATE(created_at)", [since]),
    db.query("SELECT DATE(created_at) d, COUNT(*) n FROM audit_log WHERE action = 'login_failed' AND created_at >= ? GROUP BY DATE(created_at)", [since]),
    db.query('SELECT DATE(created_at) d, COUNT(*) n FROM cheat_flags WHERE created_at >= ? GROUP BY DATE(created_at)', [since]),
    db.query('SELECT * FROM daily_stats WHERE day >= ?', [since]),
    db.query("SELECT DATE(created_at) d, COUNT(DISTINCT user_id) n FROM audit_log WHERE action = 'login' AND created_at >= ? GROUP BY DATE(created_at)", [since]),
  ]);
  const M = { reg: toMap(reg), rev: toMap(rev), pur: toMap(pur), ads: toMap(ads), chars: toMap(chars), deaths: toMap(deaths), logins: toMap(logins), failed: toMap(failed), flags: toMap(flags), act: toMap(actUsers) };
  const snap = new Map(snaps.map((r) => [iso(r.day), r]));
  const f = (m, d) => m.get(d) || 0;
  const total = (await db.one('SELECT COUNT(*) n FROM users')).n;
  const before = total - [...M.reg.values()].reduce((a, b) => a + b, 0);
  let cum = before;
  return {
    days,
    newUsers: days.map((d) => f(M.reg, d)),
    totalUsers: days.map((d) => (cum += f(M.reg, d))),
    activeUsers: days.map((d) => Math.max(f(M.act, d), snap.has(d) ? snap.get(d).active_users : 0)),
    revenue: days.map((d) => f(M.rev, d) / 100),
    purchases: days.map((d) => f(M.pur, d)),
    adClaims: days.map((d) => f(M.ads, d)),
    newChars: days.map((d) => f(M.chars, d)),
    endedChars: days.map((d) => f(M.deaths, d)),
    logins: days.map((d) => f(M.logins, d)),
    failedLogins: days.map((d) => f(M.failed, d)),
    flags: days.map((d) => f(M.flags, d)),
    coins: days.map((d) => (snap.has(d) ? Number(snap.get(d).coins_total) : null)),
    money: days.map((d) => (snap.has(d) ? Number(snap.get(d).money_total) : null)),
    alive: days.map((d) => (snap.has(d) ? snap.get(d).chars_alive : null)),
  };
}

/** Verteilungen über alle lebenden Charaktere (60 s Cache). */
let distCache = null;
async function distributions() {
  if (distCache && Date.now() - distCache.at < 60000) return distCache.v;
  const { parseState } = require('../game/state');
  const w = await require('../game/world').get();
  const startYear = settings.get('game.start_year');
  const rows = await db.query("SELECT c.state, c.generation, c.status FROM characters c WHERE c.status = 'alive' LIMIT 5000");
  const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
  const prof = new Map(); const city = new Map(); const housing = new Map(); const kids = new Map(); const gens = new Map(); const eras = new Map(); const wealth = new Map();
  const m = { fridge: 0, wellbeing: 0, rest: 0, health: 0 }; let n = 0; let partner = 0; let comps = 0; let props = 0; let sumMoney = 0; const moneys = [];
  for (const r of rows) {
    let s; try { s = parseState(r.state); } catch (_) { continue; }
    n++;
    inc(prof, (s.occupation && s.occupation.pkey && (w.prof(s.occupation.pkey) || {}).name) || 'ohne Beruf');
    inc(city, (w.city(s.cityId) || {}).name || `#${s.cityId}`);
    inc(housing, ({ street: 'Straße', workplace: 'Schlafplatz', pension: 'Pension', rent: 'Miete', own: 'Eigentum', damaged: 'Beschädigt' })[s.housing && s.housing.type] || (s.housing && s.housing.type) || '–');
    inc(kids, String((s.children || []).length)); inc(gens, `Gen. ${r.generation}`);
    const year = startYear + Math.floor(s.day / 365); inc(eras, `${Math.floor(year / 10) * 10}er`);
    const money = Math.max(0, s.money) / 100; sumMoney += money; moneys.push(money);
    const b = money < 1 ? '0' : `10^${Math.floor(Math.log10(money))}`; inc(wealth, b);
    for (const k of Object.keys(m)) m[k] += (s.meters && s.meters[k]) || 0;
    if (s.partner) partner++; comps += (s.companies || []).length; props += (s.properties || []).length;
  }
  moneys.sort((a, b) => a - b);
  const sortDesc = (mp, lim = 12) => [...mp.entries()].sort((a, b) => b[1] - a[1]).slice(0, lim);
  const wealthKeys = [...wealth.keys()].sort((a, b) => (a === '0' ? -1 : b === '0' ? 1 : Number(a.slice(3)) - Number(b.slice(3))));
  const label = (k) => (k === '0' ? '< 1' : `${Number(`1e${k.slice(3)}`).toLocaleString('de-DE')}+`);
  const v = {
    n, partner, comps, props, sumMoney, median: moneys.length ? moneys[Math.floor(moneys.length / 2)] : 0,
    avg: Object.fromEntries(Object.entries(m).map(([k, x]) => [k, n ? Math.round(x / n) : 0])),
    professions: sortDesc(prof), cities: sortDesc(city), housing: sortDesc(housing), kids: [...kids.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
    generations: [...gens.entries()].sort((a, b) => Number(a[0].slice(5)) - Number(b[0].slice(5))), eras: [...eras.entries()].sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10)),
    wealth: wealthKeys.map((k) => [label(k), wealth.get(k)]),
  };
  distCache = { at: Date.now(), v };
  return v;
}

/** Kohorten: Anmeldewoche → Anteil, der in den folgenden Wochen noch aktiv war. */
async function retention(weeks = 8) {
  const rows = await db.query(`SELECT YEARWEEK(created_at, 3) wk, MIN(DATE(created_at)) start, COUNT(*) n,
      SUM(last_seen_at >= created_at + INTERVAL 1 DAY) d1, SUM(last_seen_at >= created_at + INTERVAL 7 DAY) d7, SUM(last_seen_at >= created_at + INTERVAL 14 DAY) d14, SUM(last_seen_at >= created_at + INTERVAL 30 DAY) d30
    FROM users WHERE role = 'player' AND created_at > NOW() - INTERVAL ? WEEK GROUP BY wk ORDER BY wk`, [weeks]);
  return rows.map((r) => ({ week: iso(r.start), n: Number(r.n), d1: Number(r.d1 || 0), d7: Number(r.d7 || 0), d14: Number(r.d14 || 0), d30: Number(r.d30 || 0) }));
}

module.exports = { snapshot, start, series, distributions, retention };
