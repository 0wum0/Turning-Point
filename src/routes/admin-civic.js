'use strict';
/** Admin: Gesellschaft – Vereine, Gemeinden, Stiftungen und Titel ansehen und eingreifen (alles im Audit-Protokoll; Pfade mit /civic/user/:uid/ laufen durch die Rollenprüfung). */
const db = require('../db');
const settings = require('../settings');
const civic = require('../lib/civic');
const M = require('../game/civic');
const { audit } = require('../lib/audit');

module.exports = function mount(router, H) {
  const { wrap, flash, int, num, clean } = H;

  router.get('/civic', wrap(async (req, res) => {
    const stats = await civic.adminStats(); const lists = await civic.adminList();
    res.render('admin/civic', {
      title: 'Gesellschaft', subtitle: 'Vereine, Gemeinden, Stiftungen und Titel. Beträge in Wert von 1945 (Kaufkraft). Eingriffe stehen im Protokoll.', active: 'civic', cfg: settings.get('gesellschaft'), stats, ...lists,
      titleDefs: M.titleList().map((d) => ({ key: d.key, name: d.name, ranks: d.ranks })),
    });
  }));

  router.post('/civic/enabled', wrap(async (req, res) => {
    const on = req.body.enabled === '1';
    await settings.set('gesellschaft', { ...settings.get('gesellschaft'), enabled: on });
    await audit(req, 'civic_enabled', { enabled: on });
    flash(req, 'good', on ? 'Gesellschaft eingeschaltet.' : 'Gesellschaft ausgeschaltet (keine Beiträge, keine Handlungen, keine Wirkungen).'); res.redirect('/admin/civic');
  }));

  router.post('/civic/club/:id(\\d+)/dissolve', wrap(async (req, res) => {
    const id = int(req.params.id); const note = clean(req.body.note, 160);
    const n = await civic.adminDissolveClub(id, note);
    await audit(req, 'civic_club_dissolve', { club: id, note });
    flash(req, 'good', `Verein aufgelöst (${n} Mitglieder benachrichtigt). Das Vermögen fällt an die Stadt.`); res.redirect('/admin/civic');
  }));
  router.post('/civic/club/:id(\\d+)/president', wrap(async (req, res) => {
    const id = int(req.params.id); const uid = int(req.body.user);
    const ok = await civic.adminSetPresident(id, uid);
    await audit(req, 'civic_club_president', { club: id, user: uid });
    flash(req, ok ? 'good' : 'bad', ok ? 'Neuer Vorsitz eingesetzt.' : 'Dieses Konto ist kein Mitglied des Vereins.'); res.redirect('/admin/civic');
  }));
  router.post('/civic/parish/:id(\\d+)/fund', wrap(async (req, res) => {
    const id = int(req.params.id); const delta = Math.round(num(req.body.delta, 0) * 100);
    const n = await civic.adminParishFund(id, delta);
    await audit(req, 'civic_parish_fund', { parish: id, deltaReal: delta });
    flash(req, n ? 'good' : 'bad', n ? 'Gemeindekasse angepasst.' : 'Gemeinde nicht gefunden.'); res.redirect('/admin/civic');
  }));
  router.post('/civic/foundation/:id(\\d+)/dissolve', wrap(async (req, res) => {
    const id = int(req.params.id); const note = clean(req.body.note, 160);
    const n = await civic.adminDissolveFoundation(id, note);
    await audit(req, 'civic_foundation_dissolve', { foundation: id, note });
    flash(req, n ? 'good' : 'bad', n ? 'Stiftung aufgelöst; das Vermögen wird dem Besitzer gutgeschrieben.' : 'Stiftung nicht gefunden.'); res.redirect('/admin/civic');
  }));

  // Pfade enthalten das betroffene Konto (/civic/user/:uid/…), damit die Rechteprüfung (roles.targetOf) greift
  router.post('/civic/user/:uid(\\d+)/title/grant', wrap(async (req, res) => {
    const uid = int(req.params.uid); const key = clean(req.body.key, 16); const rank = int(req.body.rank, 1);
    const ok = M.titleDef(key) && await db.one('SELECT 1 x FROM users WHERE id = ?', [uid]) && await civic.grantTitle(uid, key, rank, 0, 'admin');
    await audit(req, 'civic_title_grant', { user: uid, key, rank });
    flash(req, ok ? 'good' : 'bad', ok ? 'Titel verliehen.' : 'Titel oder Konto unbekannt.'); res.redirect('/admin/civic');
  }));
  router.post('/civic/user/:uid(\\d+)/title/revoke', wrap(async (req, res) => {
    const uid = int(req.params.uid); const key = clean(req.body.key, 16);
    const n = await civic.revokeTitle(uid, key, 'admin');
    await audit(req, 'civic_title_revoke', { user: uid, key });
    flash(req, n ? 'good' : 'bad', n ? 'Titel entzogen (er wird nicht automatisch neu vergeben).' : 'Dieses Konto trägt den Titel nicht.'); res.redirect('/admin/civic');
  }));
};
