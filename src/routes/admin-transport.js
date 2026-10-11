'use strict';
/** Admin: Handelsrouten und Frachtangebote – Übersicht, Routen anhalten oder wieder freigeben (alles im Audit-Protokoll). */
const db = require('../db');
const settings = require('../settings');
const transport = require('../lib/transport');
const { audit } = require('../lib/audit');

module.exports = function mount(router, H) {
  const { wrap, flash, int, clean } = H;

  router.get('/transport', wrap(async (req, res) => {
    const routes = await transport.adminList(150);
    const stats = await transport.adminStats();
    const offers = await db.query("SELECT o.*, u.username, f.name firm FROM freight_offers o JOIN users u ON u.id = o.user_id LEFT JOIN player_firms f ON f.user_id = o.user_id AND f.company_id = o.company_id WHERE o.status = 'open' ORDER BY o.id DESC LIMIT 60");
    res.render('admin/transport', { title: 'Handel & Transport', subtitle: 'Routen, Frachtangebote und Fracht in Verträgen. Routen lassen sich anhalten; der Besitzer sieht das beim nächsten Laden.', active: 'transport', cfg: settings.get('transport'), routes, stats, offers });
  }));

  router.post('/transport/enabled', wrap(async (req, res) => {
    const on = req.body.enabled === '1';
    await settings.set('transport', { ...settings.get('transport'), enabled: on });
    await audit(req, 'transport_enabled', { enabled: on });
    flash(req, 'good', on ? 'Handel & Transport eingeschaltet.' : 'Handel & Transport ausgeschaltet (keine neuen Fahrten, Verträge ohne Fracht).'); res.redirect('/admin/transport');
  }));

  // Pfade enthalten das betroffene Konto (/transport/user/:uid/…), damit die Rechteprüfung (roles.targetOf) greift
  router.post('/transport/user/:uid(\\d+)/route/:rid(\\d+)/cancel', wrap(async (req, res) => {
    const uid = int(req.params.uid); const rid = int(req.params.rid);
    const n = await transport.adminCancel(uid, rid, clean(req.body.note, 160) || 'Von der Spielleitung angehalten');
    await audit(req, 'transport_route_cancel', { user: uid, route: rid, note: clean(req.body.note, 160) });
    flash(req, n ? 'good' : 'bad', n ? 'Route angehalten.' : 'Route nicht gefunden.'); res.redirect('/admin/transport');
  }));
  router.post('/transport/user/:uid(\\d+)/route/:rid(\\d+)/restore', wrap(async (req, res) => {
    const uid = int(req.params.uid); const rid = int(req.params.rid);
    const n = await transport.adminCancel(uid, rid, '', true);
    await audit(req, 'transport_route_restore', { user: uid, route: rid });
    flash(req, n ? 'good' : 'bad', n ? 'Route wieder freigegeben.' : 'Route nicht gefunden.'); res.redirect('/admin/transport');
  }));
  router.post('/transport/user/:uid(\\d+)/offer/:oid(\\d+)/close', wrap(async (req, res) => {
    const uid = int(req.params.uid); const oid = int(req.params.oid);
    const r = await db.query("UPDATE freight_offers SET status = 'closed', closed_at = NOW() WHERE id = ? AND user_id = ? AND status = 'open'", [oid, uid]);
    await audit(req, 'transport_offer_close', { user: uid, offer: oid });
    flash(req, r.affectedRows ? 'good' : 'bad', r.affectedRows ? 'Frachtangebot geschlossen.' : 'Angebot nicht gefunden.'); res.redirect('/admin/transport');
  }));
};
