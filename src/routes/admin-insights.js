'use strict';
/** Admin: Dashboard, Analytics (Charts) und Anti-Cheat-Zentrale. */
const os = require('os');
const db = require('../db');
const settings = require('../settings');
const stats = require('../lib/stats');
const anticheat = require('../lib/anticheat');
const { audit } = require('../lib/audit');

const RULE_LABELS = {
  burst: 'Anfrage-Flut', bot: 'Bot-Takt (zu gleichmäßig)', task_fast: 'Aufgaben zu schnell', ad_fast: 'Werbung zu schnell', ad_burst: 'Werbe-Serie',
  multi_account: 'Mehrfachkonten (gleiche IP)', multi_ip: 'Konto-Sharing (viele IPs)', wealth: 'Unmögliche Einnahmen', time_hack: 'Zeit-/EFS-Manipulation',
  coin_inflow: 'Auffälliger Coin-Zufluss', integrity: 'Datenintegrität', gift_ring: 'Geschenk-/Besuchs-Ring', chat_spam: 'Chat-/Brief-Spam',
};

module.exports = function mount(router, H) {
  const { wrap, flash, int, clean } = H;

  /* ============================ Dashboard ============================ */
  router.get('/', wrap(async (req, res) => {
    await stats.snapshot().catch(() => {});
    const t0 = Date.now(); await db.query('SELECT 1'); const dbMs = Date.now() - t0;
    const [u] = await db.query("SELECT COUNT(*) total, SUM(created_at > NOW() - INTERVAL 7 DAY) week, SUM(last_seen_at > NOW() - INTERVAL 1 DAY) active, SUM(last_seen_at > NOW() - INTERVAL 10 MINUTE) online, COALESCE(SUM(coins),0) coins, COALESCE(SUM(efs_pool),0) efs, SUM(banned) banned, SUM(sub_until > ?) subs FROM users", [Date.now()]);
    const [c] = await db.query("SELECT SUM(status='alive') alive, SUM(status='dead') dead, SUM(status='gameover') ended, COUNT(*) total, MAX(generation) maxgen FROM characters");
    const [a] = await db.query('SELECT COUNT(*) n, COALESCE(SUM(reward),0) coins FROM ad_claims WHERE claimed_at > ?', [Date.now() - 86400000]);
    const [p30] = await db.query("SELECT COUNT(*) n, COALESCE(SUM(price_cents),0) cents FROM purchases WHERE status='completed' AND created_at > NOW() - INTERVAL 30 DAY");
    const [flags] = await db.query("SELECT SUM(status='open') open, COUNT(DISTINCT CASE WHEN status='open' THEN user_id END) users FROM cheat_flags");
    const ser = await stats.series(30);
    const dist = await stats.distributions();
    const startYear = settings.get('game.start_year');
    const map = (x) => ({ ...x, year: startYear + Math.floor(x.game_day / 365) });
    const recent = await db.query('SELECT id, username, role, created_at, last_seen_at FROM users ORDER BY id DESC LIMIT 6');
    const alive = (await db.query("SELECT c.id, c.name, c.game_day, c.money, c.generation, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.status='alive' ORDER BY c.updated_at DESC LIMIT 6")).map(map);
    const rich = (await db.query("SELECT c.id, c.name, c.game_day, c.money, c.generation, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.status='alive' ORDER BY c.money DESC LIMIT 6")).map(map);
    const events = await db.query('SELECT a.action, a.detail, a.created_at, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 8');
    const risky = await db.query("SELECT f.id, f.rule, f.detail, f.last_at, u.id uid, u.username FROM cheat_flags f JOIN users u ON u.id = f.user_id WHERE f.status = 'open' ORDER BY f.last_at DESC LIMIT 5");
    const sum = (arr) => arr.reduce((x, y) => x + y, 0);
    res.render('admin/dashboard', {
      title: 'Dashboard', active: 'dashboard', u, c, a, p30, flags, ser, dist, recent, alive, rich, events, risky, RULE_LABELS,
      rev30: sum(ser.revenue), sys: { dbMs, mem: Math.round(process.memoryUsage().rss / 1048576), up: Math.round(process.uptime() / 60), load: os.loadavg()[0].toFixed(2), node: process.version },
    });
  }));

  /* ============================ Analytics ============================ */
  router.get('/analytics', wrap(async (req, res) => {
    const range = [14, 30, 90, 180].includes(int(req.query.range)) ? int(req.query.range) : 30;
    const [ser, dist, ret] = await Promise.all([stats.series(range), stats.distributions(), stats.retention(10)]);
    const [f] = await db.query("SELECT COUNT(*) users, (SELECT COUNT(DISTINCT user_id) FROM characters) withchar, (SELECT COUNT(*) FROM (SELECT user_id FROM characters GROUP BY user_id HAVING COUNT(*) > 1) x) multi, SUM(sub_until > ?) subs, (SELECT COUNT(DISTINCT user_id) FROM purchases WHERE status='completed' AND price_cents > 0) payers, (SELECT COUNT(DISTINCT user_id) FROM ad_claims WHERE claimed_at IS NOT NULL) adusers FROM users WHERE role='player'", [Date.now()]);
    const eco = await db.one("SELECT COUNT(*) n, COALESCE(SUM(money),0) money, COALESCE(AVG(game_day),0) avgday FROM characters WHERE status='alive'");
    res.render('admin/analytics', { title: 'Analytics', active: 'analytics', range, ser, dist, ret, f, eco });
  }));

  /* ============================ Anti-Cheat ============================ */
  router.get('/anticheat', wrap(async (req, res) => {
    const st = ['open', 'dismissed', 'confirmed', 'all'].includes(req.query.st) ? req.query.st : 'open';
    const rl = clean(req.query.rule, 30); const q = clean(req.query.q, 40);
    const conds = []; const params = [];
    if (st !== 'all') { conds.push('f.status = ?'); params.push(st); }
    if (rl) { conds.push('f.rule = ?'); params.push(rl); }
    if (q) { conds.push('u.username LIKE ?'); params.push(`%${q}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const flags = await db.query(`SELECT f.*, u.username, u.banned FROM cheat_flags f JOIN users u ON u.id = f.user_id ${where} ORDER BY f.last_at DESC LIMIT 150`, params);
    const users = await db.query("SELECT u.id, u.username, u.banned, COUNT(*) flags, MAX(f.last_at) last_at FROM cheat_flags f JOIN users u ON u.id = f.user_id WHERE f.status <> 'dismissed' GROUP BY u.id ORDER BY MAX(f.last_at) DESC LIMIT 60");
    for (const x of users) x.score = await anticheat.risk(x.id, true);
    users.sort((a, b) => b.score - a.score);
    const byRule = await db.query("SELECT rule, COUNT(*) n FROM cheat_flags WHERE created_at > NOW() - INTERVAL 30 DAY GROUP BY rule ORDER BY n DESC");
    const ips = await db.query("SELECT i.ip, COUNT(DISTINCT i.user_id) n, GROUP_CONCAT(DISTINCT u.username ORDER BY u.username SEPARATOR ', ') names FROM user_ips i JOIN users u ON u.id = i.user_id WHERE u.role <> 'admin' GROUP BY i.ip HAVING n >= 2 ORDER BY n DESC LIMIT 30");
    const ser = await stats.series(30);
    const [k] = await db.query("SELECT SUM(status='open') open, SUM(status='confirmed') confirmed, SUM(status='dismissed') dismissed, COUNT(*) total FROM cheat_flags");
    const [auto] = await db.query("SELECT COUNT(*) n FROM audit_log WHERE action = 'anticheat_autoban'");
    res.render('admin/anticheat', { title: 'Anti-Cheat', active: 'anticheat', flags, users, byRule, ips, ser, k, autoBans: auto.n, st, rl, q, RULE_LABELS, cfg: settings.get('anticheat'), scan: req.session.lastScan || null });
  }));
  router.post('/anticheat/scan', wrap(async (req, res) => {
    const r = await anticheat.scanAll({});
    req.session.lastScan = { at: Date.now(), ...r };
    await audit(req, 'anticheat_scan', r);
    flash(req, r.busy ? 'bad' : 'good', r.busy ? 'Ein Scan läuft bereits.' : `${r.users} Spielstände geprüft, ${r.flagged} mit neuen Auffälligkeiten.`);
    res.redirect('/admin/anticheat');
  }));
  router.post('/anticheat/flag/:id(\\d+)/:act(dismiss|confirm|reopen)', wrap(async (req, res) => {
    const status = { dismiss: 'dismissed', confirm: 'confirmed', reopen: 'open' }[req.params.act];
    await db.query('UPDATE cheat_flags SET status = ? WHERE id = ?', [status, int(req.params.id)]);
    await audit(req, `anticheat_${req.params.act}`, req.params.id);
    res.redirect(req.get('referer') || '/admin/anticheat');
  }));
  router.post('/anticheat/user/:id(\\d+)/:act(clear|ban)', wrap(async (req, res) => {
    const id = int(req.params.id);
    if (req.params.act === 'clear') { await db.query("UPDATE cheat_flags SET status = 'dismissed' WHERE user_id = ? AND status = 'open'", [id]); flash(req, 'good', 'Alle offenen Verdachtsfälle des Spielers als unbedenklich markiert.'); }
    else if (id !== req.user.id) {
      await db.query("UPDATE users SET banned = 1, ban_reason = ? WHERE id = ? AND role <> 'admin'", [clean(req.body.reason, 200) || 'Anti-Cheat', id]);
      await db.query('DELETE FROM sessions WHERE data LIKE ?', [`%"userId":${id}%`]);
      await db.query("UPDATE cheat_flags SET status = 'confirmed' WHERE user_id = ? AND status = 'open'", [id]);
      flash(req, 'good', 'Spieler gesperrt, Verdachtsfälle bestätigt.');
    }
    await audit(req, `anticheat_user_${req.params.act}`, String(id));
    res.redirect(req.get('referer') || '/admin/anticheat');
  }));
};
