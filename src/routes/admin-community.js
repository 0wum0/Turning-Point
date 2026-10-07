'use strict';
/** Admin: Moderation der Spielergemeinschaft (Chat, Briefe, Meldungen, Geschenke, Rangliste). */
const db = require('../db');
const settings = require('../settings');
const social = require('../lib/social');
const { audit } = require('../lib/audit');

module.exports = function mount(router, H) {
  const { wrap, flash, int, clean } = H;

  router.get('/community', wrap(async (req, res) => {
    const tab = ['chat', 'reports', 'letters', 'log', 'board', 'bonds'].includes(req.query.t) ? req.query.t : 'reports';
    const [k] = await db.query("SELECT (SELECT COUNT(*) FROM users WHERE social_public = 1 AND role = 'player') pub, (SELECT COUNT(*) FROM users WHERE social_public = 0 AND role = 'player') priv, (SELECT COUNT(*) FROM chat_messages WHERE created_at > NOW() - INTERVAL 1 DAY) chat, (SELECT COUNT(*) FROM messages WHERE kind = 'letter' AND created_at > NOW() - INTERVAL 1 DAY) letters, (SELECT COUNT(*) FROM reports WHERE status = 'open') reports, (SELECT COALESCE(SUM(amount),0) FROM social_log WHERE kind = 'gift' AND created_at > NOW() - INTERVAL 7 DAY) gifts, (SELECT COUNT(*) FROM social_log WHERE kind = 'visit' AND created_at > NOW() - INTERVAL 7 DAY) visits, (SELECT COUNT(*) FROM friendships WHERE status = 'accepted') friends, (SELECT COUNT(*) FROM users WHERE mute_until > ?) muted", [Date.now()]);
    const d = { tab, title: 'Community', active: 'community', k, cfg: settings.get('social') };
    if (tab === 'chat') d.chat = await db.query('SELECT c.id, c.text, c.name, c.created_at, c.deleted, c.user_id, u.username, u.mute_until, ci.name city FROM chat_messages c JOIN users u ON u.id = c.user_id LEFT JOIN cities ci ON ci.id = c.city_id ORDER BY c.id DESC LIMIT 120');
    if (tab === 'reports') {
      const rows = await db.query("SELECT r.*, ru.username reporter_name, tu.username target_name, tu.mute_until, tu.banned FROM reports r JOIN users ru ON ru.id = r.reporter LEFT JOIN users tu ON tu.id = r.target_user WHERE r.status = 'open' ORDER BY r.id DESC LIMIT 80");
      for (const r of rows) {
        if (r.kind === 'chat') { const m = await db.one('SELECT text, name FROM chat_messages WHERE id = ?', [r.ref_id]); r.context = m ? `„${m.text}“` : '(Nachricht gelöscht)'; }
        else if (r.kind === 'letter') { const m = await db.one('SELECT subject, body FROM messages WHERE id = ?', [r.ref_id]); r.context = m ? `${m.subject}\n\n${m.body}` : '(Brief gelöscht)'; }
        else r.context = '';
      }
      d.reports = rows;
    }
    if (tab === 'letters') d.letters = await db.query("SELECT m.id, m.subject, LEFT(m.body, 200) body, m.created_at, m.reported, fu.username from_name, tu.username to_name FROM messages m LEFT JOIN users fu ON fu.id = m.from_user JOIN users tu ON tu.id = m.to_user WHERE m.kind = 'letter' AND m.reported = 1 ORDER BY m.id DESC LIMIT 80");
    if (tab === 'log') d.log = await db.query('SELECT l.*, fu.username from_name, tu.username to_name FROM social_log l LEFT JOIN users fu ON fu.id = l.from_user LEFT JOIN users tu ON tu.id = l.to_user ORDER BY l.id DESC LIMIT 150');
    if (tab === 'board') d.board = await db.query("SELECT ps.*, u.social_public, u.banned FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE u.role = 'player' ORDER BY ps.wealth DESC LIMIT 100");
    if (tab === 'bonds') {
      d.emps = await db.query("SELECT e.*, ou.username owner, eu.username employee, f.name firm FROM employments e JOIN users ou ON ou.id = e.owner_id JOIN users eu ON eu.id = e.employee_id LEFT JOIN player_firms f ON f.user_id = e.owner_id AND f.company_id = e.company_id ORDER BY e.status = 'active' DESC, e.id DESC LIMIT 100");
      d.couples = await db.query("SELECT c.*, a.username ua, b.username ub FROM couples c JOIN users a ON a.id = c.user_a JOIN users b ON b.id = c.user_b WHERE c.status <> 'request' ORDER BY c.status = 'ended', c.id DESC LIMIT 100");
    }
    res.render('admin/community', d);
  }));

  const back = (req, res, t) => res.redirect(`/admin/community?t=${t}`);
  router.post('/community/chat/:id(\\d+)/delete', wrap(async (req, res) => { await db.query('UPDATE chat_messages SET deleted = 1 WHERE id = ?', [int(req.params.id)]); await audit(req, 'community_chat_delete', req.params.id); flash(req, 'good', 'Chat-Nachricht entfernt.'); back(req, res, req.body.t || 'chat'); }));
  router.post('/community/user/:id(\\d+)/mute', wrap(async (req, res) => {
    const mins = Math.max(0, Math.min(60 * 24 * 365, int(req.body.minutes, 60)));
    await db.query("UPDATE users SET mute_until = ? WHERE id = ? AND role <> 'admin'", [mins ? Date.now() + mins * 60000 : null, int(req.params.id)]);
    await audit(req, 'community_mute', `${req.params.id}:${mins}`); flash(req, 'good', mins ? `Spieler für ${mins} Minuten stummgeschaltet.` : 'Stummschaltung aufgehoben.'); back(req, res, req.body.t || 'chat');
  }));
  router.post('/community/user/:id(\\d+)/hide', wrap(async (req, res) => {
    await db.query('UPDATE users SET social_public = ? WHERE id = ?', [req.body.show ? 1 : 0, int(req.params.id)]);
    await audit(req, 'community_hide', `${req.params.id}:${req.body.show ? 'show' : 'hide'}`); flash(req, 'good', req.body.show ? 'Spieler erscheint wieder in der Rangliste.' : 'Spieler aus Rangliste und Profilen ausgeblendet.'); back(req, res, 'board');
  }));
  router.post('/community/report/:id(\\d+)/resolve', wrap(async (req, res) => { await db.query("UPDATE reports SET status = 'done' WHERE id = ?", [int(req.params.id)]); await audit(req, 'community_report_done', req.params.id); flash(req, 'good', 'Meldung erledigt.'); back(req, res, 'reports'); }));
  router.post('/community/letter/:id(\\d+)/delete', wrap(async (req, res) => { await db.query('UPDATE messages SET del_to = 1, del_from = 1 WHERE id = ?', [int(req.params.id)]); await audit(req, 'community_letter_delete', req.params.id); flash(req, 'good', 'Brief entfernt.'); back(req, res, req.body.t || 'letters'); }));
  router.post('/community/employment/:id(\\d+)/end', wrap(async (req, res) => { await require('../lib/bonds').adminEnd(int(req.params.id)); await audit(req, 'community_employment_end', req.params.id); flash(req, 'good', 'Arbeitsverhältnis beendet.'); back(req, res, 'bonds'); }));
  router.post('/community/couple/:id(\\d+)/end', wrap(async (req, res) => { await require('../lib/bonds').adminEndCouple(int(req.params.id)); await audit(req, 'community_couple_end', req.params.id); flash(req, 'good', 'Beziehung aufgelöst.'); back(req, res, 'bonds'); }));
  router.post('/community/rebuild', wrap(async (req, res) => { await db.query('DELETE FROM player_stats'); const n = await social.backfillStats(); await audit(req, 'community_rebuild', String(n)); flash(req, 'good', `Ranglisten-Daten für ${n} Spieler neu berechnet.`); back(req, res, 'board'); }));
  router.post('/community/broadcast-letter', wrap(async (req, res) => {
    const subject = clean(req.body.subject, 120); const body = clean(req.body.body, 1500); if (!subject || !body) { flash(req, 'bad', 'Betreff und Text fehlen.'); return back(req, res, 'chat'); }
    const ids = await db.query("SELECT id FROM users WHERE role = 'player' AND banned = 0"); for (const u of ids) await social.sendSystemLetter(u.id, subject, body);
    await audit(req, 'community_broadcast_letter', subject); flash(req, 'good', `Mitteilung an ${ids.length} Spieler verschickt (Posteingang).`); back(req, res, 'chat');
  }));
};
