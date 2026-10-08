'use strict';
/** Admin: Bots (computergesteuerte Spielfiguren) einrichten, ansehen, entfernen. */
const db = require('../db');
const settings = require('../settings');
const bots = require('../lib/bots');
const account = require('../lib/account');
const { audit } = require('../lib/audit');

module.exports = function mount(router, H) {
  const { wrap, flash, int } = H;

  router.get('/bots', wrap(async (req, res) => {
    const rows = await db.query(`SELECT u.id, u.username, u.last_seen_at, u.created_at, u.lang, u.meta, ps.name, ps.city_id, ps.year, ps.wealth, ps.occupation, ps.status
      FROM users u LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE u.is_bot = 1 ORDER BY u.id`);
    const w = await require('../game/world').get();
    const list = rows.map((r) => {
      let bm = {}; try { bm = (JSON.parse(r.meta).bot) || {}; } catch (_) { /* leer */ }
      const c = w.city(r.city_id);
      return { ...r, city: c ? c.name : '–', next: bm.next || 0, persona: bm.persona || {} };
    });
    res.render('admin/bots', { title: 'Bots', subtitle: 'Computergesteuerte Spielfiguren, die die Spielwelt beleben.', active: 'bots', cfg: settings.get('bots'), list, now: Date.now(), startYear: settings.get('game.start_year') });
  }));

  router.post('/bots/settings', wrap(async (req, res) => {
    const b = req.body; const cur = settings.get('bots');
    const next = {
      ...cur, enabled: !!b.enabled, target: Math.max(0, Math.min(60, int(b.target, 0))), max: 60, activity: Math.max(1, Math.min(3, int(b.activity, 2))),
      chat: !!b.chat, letters: !!b.letters, friends: !!b.friends, jobs: !!b.jobs, visits: !!b.visits,
    };
    await settings.set('bots', next);
    await audit(req, 'bots_settings', next);
    flash(req, 'good', next.enabled ? `Bots aktiv (Ziel: ${next.target}). Neue Bots entstehen im Minutentakt.` : 'Bots sind ausgeschaltet. Vorhandene Figuren bleiben bestehen, handeln aber nicht mehr.');
    res.redirect('/admin/bots');
  }));

  router.post('/bots/add', wrap(async (req, res) => {
    const n = Math.max(1, Math.min(10, int(req.body.n, 1)));
    const have = (await db.one('SELECT COUNT(*) n FROM users WHERE is_bot = 1')).n;
    const cur = settings.get('bots'); if (cur.target < have + n) await settings.set('bots', { ...cur, target: Math.min(60, have + n) });
    for (let i = 0; i < n; i++) await bots.createBot();
    await audit(req, 'bots_add', { n });
    flash(req, 'good', `${n} Bot(s) angelegt.`);
    res.redirect('/admin/bots');
  }));

  router.post('/bots/run', wrap(async (req, res) => {
    await db.query("UPDATE users SET meta = JSON_SET(meta, '$.bot.next', 0) WHERE is_bot = 1 AND JSON_VALID(meta)");
    await bots.tick();
    flash(req, 'good', 'Eine Runde ausgeführt (bis zu drei Bots haben gehandelt).');
    res.redirect('/admin/bots');
  }));

  router.post('/bots/:id(\\d+)/play', wrap(async (req, res) => {
    const id = int(req.params.id); const u = await db.one('SELECT id, is_bot FROM users WHERE id = ?', [id]);
    if (!u || !u.is_bot) { flash(req, 'bad', 'Kein Bot.'); return res.redirect('/admin/bots'); }
    await db.query('UPDATE users SET efs_pool = efs_pool + 120 WHERE id = ?', [id]);
    await bots.lifeCycle(id); await bots.playGame(id, { budget: 120 });
    flash(req, 'good', 'Bot hat gespielt (+120 EFS).');
    res.redirect('/admin/bots');
  }));

  router.post('/bots/:id(\\d+)/delete', wrap(async (req, res) => {
    const id = int(req.params.id); const u = await db.one('SELECT id, is_bot, username FROM users WHERE id = ?', [id]);
    if (u && u.is_bot) { await account.deleteAccount(id); await audit(req, 'bots_delete', u.username); flash(req, 'good', 'Bot gelöscht.'); }
    res.redirect('/admin/bots');
  }));

  router.post('/bots/remove-all', wrap(async (req, res) => {
    await settings.set('bots', { ...settings.get('bots'), enabled: false, target: 0 });
    const n = await bots.removeAll();
    await audit(req, 'bots_remove_all', { n });
    flash(req, 'good', `${n} Bot(s) gelöscht, Bots ausgeschaltet.`);
    res.redirect('/admin/bots');
  }));
};
