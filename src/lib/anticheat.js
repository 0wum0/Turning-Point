'use strict';
/**
 * Anti-Cheat-Engine (serverseitig).
 *  - Echtzeit: Anfrage-Rhythmus (Burst, Bot-Takt), Werbe-Missbrauch, zu schnelle Aufgaben
 *  - Konten: Mehrfachkonten je IP, Konto-Sharing (viele IPs)
 *  - Spielstand-Prüfung: Zeit-/EFS-Hack, unmögliche Einnahmen, Coin-Zufluss, Datenintegrität
 * Jeder Verdacht wird als „Flag“ mit Gewicht gespeichert; aus den Flags ergibt sich ein Risiko-Score
 * (mit Verfall über die Zeit). Je nach Einstellung nur melden, bremsen oder automatisch sperren.
 * Admins werden nie geflaggt.
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');

const cfg = () => settings.get('anticheat');
const rule = (name) => { const c = cfg(); return c.enabled && c.rules[name] && c.rules[name].enabled ? c.rules[name] : null; };

const adminCache = new Map(); // userId -> {admin, at}
async function isAdmin(userId) {
  const hit = adminCache.get(userId);
  if (hit && Date.now() - hit.at < 300000) return hit.admin;
  const u = await db.one('SELECT role FROM users WHERE id = ?', [userId]);
  const admin = !!u && u.role !== 'player';
  adminCache.set(userId, { admin, at: Date.now() });
  return admin;
}

/* ---------------- Flags & Risiko ---------------- */
const riskCache = new Map(); // userId -> {score, at}
const throttled = new Map(); // userId -> until

async function risk(userId, fresh = false) {
  const hit = riskCache.get(userId);
  if (!fresh && hit && Date.now() - hit.at < 20000) return hit.score;
  const rows = await db.query("SELECT weight, count, last_at FROM cheat_flags WHERE user_id = ? AND status <> 'dismissed'", [userId]);
  const decay = Math.max(1, cfg().decayDays);
  let score = 0;
  for (const r of rows) {
    const ageDays = (Date.now() - new Date(r.last_at).getTime()) / 86400000;
    score += r.weight * Math.sqrt(Math.min(r.count, 9)) * Math.max(0, 1 - ageDays / decay);
  }
  score = Math.round(score);
  riskCache.set(userId, { score, at: Date.now() });
  return score;
}

async function applyAuto(userId, score) {
  const c = cfg();
  if (c.autoAction === 'ban' && score >= c.banAt) {
    const u = await db.one('SELECT banned, role FROM users WHERE id = ?', [userId]);
    if (u && !u.banned && u.role === 'player') {
      await db.query("UPDATE users SET banned = 1, ban_reason = 'Automatisch: Anti-Cheat' WHERE id = ?", [userId]);
      await db.query('DELETE FROM sessions WHERE data LIKE ?', [`%"userId":${userId}%`]);
      await db.query("INSERT INTO audit_log (user_id, action, detail) VALUES (NULL, 'anticheat_autoban', ?)", [`user ${userId} score ${score}`]);
      log.warn(`[anticheat] Konto ${userId} automatisch gesperrt (Score ${score}).`);
    }
  } else if ((c.autoAction === 'throttle' || c.autoAction === 'ban') && score >= c.throttleAt) {
    throttled.set(userId, Date.now() + 3600000);
  }
}

/** Verdacht melden. Gleiche Regel + Spieler innerhalb von 30 Minuten werden zusammengefasst. */
async function flag(userId, ruleName, detail, weightOverride) {
  try {
    const r = rule(ruleName);
    if (!r || !userId || await isAdmin(userId)) return null;
    const weight = weightOverride || r.weight || 10;
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail || {});
    const ex = await db.one("SELECT id FROM cheat_flags WHERE user_id = ? AND rule = ? AND status = 'open' AND last_at > NOW() - INTERVAL 30 MINUTE ORDER BY id DESC LIMIT 1", [userId, ruleName]);
    if (ex) await db.query('UPDATE cheat_flags SET count = count + 1, last_at = NOW(), detail = ? WHERE id = ?', [text.slice(0, 2000), ex.id]);
    else await db.query('INSERT INTO cheat_flags (user_id, rule, weight, detail) VALUES (?,?,?,?)', [userId, ruleName, weight, text.slice(0, 2000)]);
    const score = await risk(userId, true);
    await applyAuto(userId, score);
    return score;
  } catch (e) { log.error('[anticheat] flag fehlgeschlagen', e); return null; }
}

/* ---------------- Echtzeit: Anfrage-Rhythmus ---------------- */
const reqs = new Map(); // userId -> {all: [ts], act: [ts]}
function gc() { const lim = Date.now() - 120000; for (const [k, v] of reqs) if (!v.all.length || v.all[v.all.length - 1] < lim) reqs.delete(k); for (const [k, v] of throttled) if (v < Date.now()) throttled.delete(k); }
setInterval(gc, 120000).unref();

function middleware(req, res, next) {
  const c = cfg();
  if (!c.enabled || !req.user || req.user.role !== 'player') return next();
  const id = req.user.id; const now = Date.now();
  trackIp(req, id);
  let r = reqs.get(id); if (!r) { r = { all: [], act: [] }; reqs.set(id, r); }
  r.all.push(now); while (r.all.length && r.all[0] < now - 60000) r.all.shift();
  if (throttled.has(id) && r.all.length > 25) return res.status(429).json({ ok: false, error: 'Zu viele Anfragen – bitte langsamer.' });
  const burst = rule('burst');
  if (burst && r.all.length > burst.perMinute) { flag(id, 'burst', `${r.all.length} Anfragen in 60 s`); r.all.length = 0; }
  if (req.method === 'POST' && /^\/(action|advance)/.test(req.path)) {
    const bot = rule('bot');
    r.act.push(now);
    if (bot) {
      while (r.act.length > bot.samples) r.act.shift();
      if (r.act.length === bot.samples) {
        const iv = []; for (let i = 1; i < r.act.length; i++) iv.push(r.act[i] - r.act[i - 1]);
        const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
        const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length);
        if (mean < bot.maxMeanMs && sd < bot.maxJitterMs) { flag(id, 'bot', `${bot.samples} Aktionen im Takt von ${Math.round(mean)} ms (Abweichung ${Math.round(sd)} ms)`); r.act.length = 0; }
      }
    }
  }
  next();
}

/* ---------------- Hooks für Routen ---------------- */
const taskFails = new Map();
async function taskRejected(userId) {
  const r = rule('task_fast'); if (!r) return;
  const arr = (taskFails.get(userId) || []).filter((t) => t > Date.now() - 3600000); arr.push(Date.now()); taskFails.set(userId, arr);
  if (arr.length >= r.perHour) { taskFails.set(userId, []); await flag(userId, 'task_fast', `${arr.length} abgebrochene/zu schnelle Aufgaben pro Stunde`); }
}
async function adTooFast(userId, ms) { await flag(userId, 'ad_fast', `Belohnung nach ${Math.round(ms / 1000)} s angefordert (Mindestdauer nicht erreicht)`); }
async function adStarted(userId) {
  const r = rule('ad_burst'); if (!r) return;
  const n = (await db.one('SELECT COUNT(*) n FROM ad_claims WHERE user_id = ? AND started_at > ?', [userId, Date.now() - 3600000])).n;
  if (n >= r.perHour) await flag(userId, 'ad_burst', `${n} Werbe-Starts in der letzten Stunde`);
}

const ipCache = new Map();
const LOCAL = new Set(['', '::1', '127.0.0.1', '::ffff:127.0.0.1']);
async function trackIp(req, userId) {
  try {
    if (!userId) return;
    const ip = String(req.ip || '').slice(0, 64);
    if (LOCAL.has(ip)) return;
    const key = `${userId}|${ip}`;
    if (ipCache.has(key) && Date.now() - ipCache.get(key) < 1800000) return;
    ipCache.set(key, Date.now());
    if (ipCache.size > 20000) ipCache.clear();
    await db.query('INSERT INTO user_ips (user_id, ip) VALUES (?,?) ON DUPLICATE KEY UPDATE last_seen = NOW(), hits = hits + 1', [userId, ip]);
    const ma = rule('multi_account');
    if (ma) {
      const others = await db.query('SELECT DISTINCT u.id, u.username FROM user_ips i JOIN users u ON u.id = i.user_id WHERE i.ip = ? AND i.last_seen > NOW() - INTERVAL ? HOUR', [ip, ma.windowHours]);
      if (others.length >= ma.accountsPerIp) await flag(userId, 'multi_account', `${others.length} Konten teilen die IP ${ip}: ${others.map((o) => o.username).slice(0, 8).join(', ')}`);
    }
    const mi = rule('multi_ip');
    if (mi) {
      const n = (await db.one('SELECT COUNT(DISTINCT ip) n FROM user_ips WHERE user_id = ? AND last_seen > NOW() - INTERVAL ? MINUTE', [userId, mi.windowMinutes])).n;
      if (n >= mi.ips) await flag(userId, 'multi_ip', `${n} verschiedene IPs innerhalb von ${mi.windowMinutes} Minuten`);
    }
  } catch (e) { log.error('[anticheat] trackIp', e); }
}

/* ---------------- Spielstand-Prüfung ---------------- */
function inspect(state, user, ctx) {
  const out = [];
  const w = ctx.world; const maxKids = settings.get('game.max_children');
  const bad = [];
  const num = (name, v, lo, hi) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) bad.push(`${name}=${v}`); };
  num('money', state.money, -1e12, 1e15); num('day', state.day, 0, 365 * 600);
  for (const k of ['fridge', 'wellbeing', 'rest', 'health']) num(`meters.${k}`, state.meters && state.meters[k], -50, 150);
  if ((state.children || []).length > maxKids + 2) bad.push(`children=${state.children.length}`);
  if ((state.properties || []).length > 500) bad.push(`properties=${state.properties.length}`);
  if ((state.companies || []).length > (w.econ.companies.maxCompanies || 30) + 2) bad.push(`companies=${state.companies.length}`);
  if (!['alive', 'dead', 'gameover'].includes(state.status)) bad.push(`status=${state.status}`);
  if (state.stats) for (const k of ['earned', 'spent', 'peakWorth']) num(`stats.${k}`, state.stats[k], 0, 1e16);
  if (bad.length) out.push({ rule: 'integrity', detail: `Unmögliche Werte: ${bad.slice(0, 8).join(', ')}` });

  const wr = rule('wealth');
  if (wr && state.status === 'alive' && state.day > 30 && state.stats) {
    const year = state.startYear + Math.floor(state.day / 365);
    const perDay = state.stats.earned / (state.day + 1) / Math.max(0.01, w.idx(year));
    if (perDay > wr.maxEarnedPerDay) out.push({ rule: 'wealth', detail: `Ø ${Math.round(perDay / 100)} Einnahmen/Tag (Index 1) – Grenze ${Math.round(wr.maxEarnedPerDay / 100)}` });
  }
  return out;
}

async function scanUser(row, world) {
  const { parseState } = require('../game/state');
  const found = [];
  let state; try { state = parseState(row.state); } catch (e) { found.push({ rule: 'integrity', detail: `Spielstand nicht lesbar: ${e.message}` }); }
  const user = { id: row.user_id, coins: row.coins, efs_pool: row.efs_pool, created_at: row.u_created };
  if (state) found.push(...inspect(state, user, { world }));
  // Zeit-/EFS-Hack: Spieltage + Vorrat dürfen die theoretisch verdienbaren EFS nicht übersteigen
  const th = rule('time_hack');
  if (th) {
    const adminGrant = await db.one("SELECT 1 x FROM audit_log WHERE action LIKE 'admin\\_%' AND detail LIKE ? LIMIT 1", [`%${row.username}%`]);
    if (!adminGrant) {
      const ageDays = Math.max(1, (Date.now() - new Date(row.u_created).getTime()) / 86400000 + 1);
      const perDay = settings.get('efs.daily_auto') + settings.get('efs.login_bonus') + settings.get('efs.active_daily_cap');
      const paid = await db.one("SELECT COALESCE(SUM(efs),0) e FROM purchases WHERE user_id = ? AND status = 'completed'", [row.user_id]);
      const ads = await db.one("SELECT COUNT(*) n FROM ad_claims WHERE user_id = ? AND claimed_at IS NOT NULL AND purpose = 'efs'", [row.user_id]);
      const bound = ageDays * perDay + Number(paid.e) + ads.n * settings.get('ads.efs_reward') + 400;
      const cyc = await db.query('SELECT cycle, MAX(game_day) d FROM characters WHERE user_id = ? GROUP BY cycle', [row.user_id]);
      const used = cyc.reduce((a, c) => a + Number(c.d), 0) + row.efs_pool;
      if (used > bound * th.tolerance) found.push({ rule: 'time_hack', detail: `${used} EFS genutzt/vorrätig, theoretisch höchstens ${Math.round(bound)} (Konto ${ageDays.toFixed(1)} Tage alt)` });
    }
  }
  // Coin-Zufluss innerhalb von 24 h
  const ci = rule('coin_inflow');
  if (ci) {
    const snap = await db.one('SELECT coins, at FROM user_snap WHERE user_id = ?', [row.user_id]);
    const now = Date.now();
    if (!snap) await db.query('INSERT INTO user_snap (user_id, coins, at) VALUES (?,?,?)', [row.user_id, row.coins, now]);
    else if (now - Number(snap.at) >= 86400000) {
      const since = new Date(Number(snap.at));
      const adminGrant = await db.one("SELECT 1 x FROM audit_log WHERE action LIKE 'admin\\_%' AND detail LIKE ? AND created_at > ? LIMIT 1", [`%${row.username}%`, since]);
      if (!adminGrant) {
        const days = Math.max(1, (now - Number(snap.at)) / 86400000);
        const bought = await db.one("SELECT COALESCE(SUM(coins),0) c FROM purchases WHERE user_id = ? AND created_at > ?", [row.user_id, since]);
        const offers = await db.one('SELECT COALESCE(SUM(coins),0) c FROM offer_events WHERE user_id = ? AND created_at > ?', [row.user_id, since]);
        const sub = settings.get('subscription') || {};
        const allowed = days * (settings.get('ads.daily_cap') * settings.get('coins.ad_video') + (sub.daily_coins || 0) + settings.get('coins.per_child') * 2) + Number(bought.c) + Number(offers.c) + settings.get('coins.legacy_bonus') + ci.slack;
        const gain = row.coins - snap.coins;
        if (gain > allowed) found.push({ rule: 'coin_inflow', detail: `+${gain} Coins in ${days.toFixed(1)} Tagen, erklärbar sind höchstens ${Math.round(allowed)}` });
      }
      await db.query('UPDATE user_snap SET coins = ?, at = ? WHERE user_id = ?', [row.coins, now, row.user_id]);
    }
  }
  for (const f of found) await flag(row.user_id, f.rule, f.detail);
  return found.length;
}

let scanning = false;
/** Prüft Spielstände. recentMinutes = nur zuletzt aktive, sonst alle. Liefert {users, flagged}. */
async function scanAll({ recentMinutes = null, limit = 1500 } = {}) {
  if (scanning) return { users: 0, flagged: 0, busy: true };
  scanning = true;
  try {
    const world = await require('../game/world').get();
    const where = recentMinutes ? 'AND c.updated_at > NOW() - INTERVAL ? MINUTE' : '';
    const rows = await db.query(`SELECT c.state, c.user_id, u.coins, u.efs_pool, u.username, u.created_at u_created FROM characters c JOIN users u ON u.id = c.user_id WHERE c.status = 'alive' AND u.role <> 'admin' ${where} ORDER BY c.updated_at DESC LIMIT ?`, recentMinutes ? [recentMinutes, limit] : [limit]);
    let flagged = 0;
    for (const r of rows) flagged += (await scanUser(r, world)) ? 1 : 0;
    return { users: rows.length, flagged };
  } finally { scanning = false; }
}

function start() {
  const t = setInterval(() => { scanAll({ recentMinutes: 45 }).catch((e) => log.error('[anticheat] Scan', e)); }, 30 * 60 * 1000);
  t.unref();
}

module.exports = { flag, risk, middleware, taskRejected, adTooFast, adStarted, trackIp, scanAll, start, inspect, isThrottled: (id) => throttled.has(id) };
