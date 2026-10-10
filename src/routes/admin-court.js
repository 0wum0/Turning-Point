'use strict';
/** Admin: Gerichte und Beweise – Übersicht, Verfahren und Sanktionen einsehen und aufheben (alles im Audit-Protokoll). */
const db = require('../db');
const settings = require('../settings');
const court = require('../lib/court');
const M = require('../game/court');
const { audit } = require('../lib/audit');

module.exports = function mount(router, H) {
  const { wrap, flash, int } = H;

  router.get('/court', wrap(async (req, res) => {
    const cases = await db.query(`SELECT c.*, p.username pu, d.username du FROM court_cases c JOIN users p ON p.id = c.plaintiff_id JOIN users d ON d.id = c.defendant_id ORDER BY c.id DESC LIMIT 80`);
    const sanctions = await db.query(`SELECT s.*, u.username un FROM court_sanctions s JOIN users u ON u.id = s.user_id WHERE s.status = 'active' ORDER BY s.id DESC LIMIT 80`);
    const k = (await db.query("SELECT (SELECT COUNT(*) FROM court_evidence WHERE status = 'open') ev, (SELECT COUNT(*) FROM court_cases WHERE state IN ('filed','investigation','hearing','verdict','appeal')) open, (SELECT COUNT(*) FROM court_cases WHERE state = 'final' AND guilty = 1) guilty, (SELECT COUNT(*) FROM court_sanctions WHERE status = 'active' AND kind IN ('haft','gewerbe','beruf','closure') AND until_ms > ?) restr", [Date.now()]))[0];
    res.render('admin/court', { title: 'Gericht', subtitle: 'Verfahren, Sanktionen und Beweise einsehen und bei Bedarf aufheben.', active: 'court', cfg: settings.get('gericht'), cases, sanctions, k, ACTS: Object.fromEntries(Object.entries(M.ACTS).map(([a, v]) => [a, v.label])), SANCTIONS: M.SANCTIONS, STATE: M.STATE_LABEL });
  }));

  router.post('/court/enabled', wrap(async (req, res) => {
    const on = req.body.enabled === '1';
    await settings.set('gericht', { ...settings.get('gericht'), enabled: on });
    await audit(req, 'court_enabled', { enabled: on });
    flash(req, 'good', on ? 'Gerichtswesen eingeschaltet.' : 'Gerichtswesen ausgeschaltet (laufende Verfahren ruhen, Sperren entfallen).'); res.redirect('/admin/court');
  }));

  // Pfade enthalten das betroffene Konto (/court/user/:uid/…), damit die Rechteprüfung (roles.targetOf) greift
  router.post('/court/user/:uid(\\d+)/case/:cid(\\d+)/annul', wrap(async (req, res) => {
    const cid = int(req.params.cid); const uid = int(req.params.uid);
    const c = await db.one('SELECT * FROM court_cases WHERE id = ? AND (defendant_id = ? OR plaintiff_id = ?)', [cid, uid, uid]);
    if (!c) { flash(req, 'bad', 'Verfahren nicht gefunden.'); return res.redirect('/admin/court'); }
    await db.tx(async (conn) => {
      await conn.query("UPDATE court_cases SET state = 'dismissed', ended_ms = ?, updated_ms = ?, summary = 'Von der Spielleitung aufgehoben' WHERE id = ?", [Date.now(), Date.now(), cid]);
      await conn.query("UPDATE court_sanctions SET status = 'annulled' WHERE case_id = ? AND status = 'active'", [cid]);
      await court.event(conn, c.defendant_id, cid, 'annul', 'good', 'Verfahren aufgehoben', 'Die Spielleitung hat das Verfahren aufgehoben. Sanktionen entfallen.');
      await court.event(conn, c.plaintiff_id, cid, 'annul', 'info', 'Verfahren aufgehoben', 'Die Spielleitung hat das Verfahren aufgehoben.');
    });
    court.invalidate(c.defendant_id); court.invalidate(c.plaintiff_id);
    await audit(req, 'court_case_annul', { case: cid, defendant: c.defendant_id });
    flash(req, 'good', 'Verfahren aufgehoben, Sanktionen annulliert.'); res.redirect('/admin/court');
  }));

  router.post('/court/user/:uid(\\d+)/sanction/:sid(\\d+)/annul', wrap(async (req, res) => {
    const sid = int(req.params.sid); const uid = int(req.params.uid);
    const r = await db.query("UPDATE court_sanctions SET status = 'annulled' WHERE id = ? AND user_id = ? AND status = 'active'", [sid, uid]);
    court.invalidate(uid);
    await audit(req, 'court_sanction_annul', { sanction: sid, user: uid });
    flash(req, r.affectedRows ? 'good' : 'bad', r.affectedRows ? 'Sanktion aufgehoben.' : 'Sanktion nicht gefunden.'); res.redirect('/admin/court');
  }));

  router.post('/court/user/:uid(\\d+)/clear', wrap(async (req, res) => {
    const uid = int(req.params.uid);
    const r = await db.query("UPDATE court_sanctions SET status = 'annulled' WHERE user_id = ? AND status = 'active'", [uid]);
    court.invalidate(uid);
    await audit(req, 'court_user_clear', { user: uid, n: r.affectedRows });
    flash(req, 'good', `${r.affectedRows} Sanktionen aufgehoben.`); res.redirect('/admin/court');
  }));
};
