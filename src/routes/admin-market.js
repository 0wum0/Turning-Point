'use strict';
/** Admin: Spielermarkt beobachten und eingreifen (Versteigerungen, Angebote, Handelsprotokoll). */
const db = require('../db');
const market = require('../lib/market');
const { audit } = require('../lib/audit');

module.exports = function mount(router, H) {
  const { wrap, flash, int } = H;

  router.get('/market', wrap(async (req, res) => {
    const auctions = await db.query("SELECT a.*, su.username seller, lu.username leader FROM market_auctions a LEFT JOIN users su ON su.id = a.seller_id LEFT JOIN users lu ON lu.id = a.lead_user ORDER BY (a.status = 'open') DESC, a.id DESC LIMIT 60");
    const offers = await db.query("SELECT o.*, bu.username buyer, su.username seller FROM market_offers o JOIN users bu ON bu.id = o.buyer_id JOIN users su ON su.id = o.seller_id ORDER BY o.id DESC LIMIT 60");
    const trades = await db.query("SELECT l.*, fu.username from_name, tu.username to_name FROM social_log l LEFT JOIN users fu ON fu.id = l.from_user LEFT JOIN users tu ON tu.id = l.to_user WHERE l.kind = 'trade' ORDER BY l.id DESC LIMIT 60");
    const k = (await db.query("SELECT (SELECT COUNT(*) FROM market_auctions WHERE status = 'open') auctions, (SELECT COUNT(*) FROM market_offers WHERE status = 'open') offers, (SELECT COUNT(*) FROM social_log WHERE kind = 'trade' AND created_at > NOW() - INTERVAL 7 DAY) trades, (SELECT COALESCE(SUM(amount),0) FROM social_log WHERE kind = 'trade' AND created_at > NOW() - INTERVAL 7 DAY) volume"))[0];
    res.render('admin/market', { title: 'Markt', subtitle: 'Angebote, Versteigerungen und Handel zwischen Spielern.', active: 'market', auctions, offers, trades, k });
  }));

  router.post('/market/auction/:id(\\d+)/cancel', wrap(async (req, res) => {
    const a = await db.one("SELECT * FROM market_auctions WHERE id = ? AND status = 'open'", [int(req.params.id)]);
    if (!a) { flash(req, 'bad', 'Versteigerung nicht gefunden.'); return res.redirect('/admin/market'); }
    const item = typeof a.item === 'string' ? JSON.parse(a.item) : a.item;
    let back = false;
    if (a.seller_id) back = await require('../game/service').withCharacter(a.seller_id, async (ctx) => { if (!ctx.state || ctx.state.status !== 'alive') return false; market.attach(ctx.world, ctx.state, a.kind, item); return true; }).catch(() => false);
    await db.query("UPDATE market_auctions SET status = 'cancelled' WHERE id = ?", [a.id]);
    await audit(req, 'market_cancel_auction', { id: a.id, name: a.name });
    flash(req, 'good', back ? 'Versteigerung abgebrochen, Gegenstand zurückgegeben.' : 'Versteigerung abgebrochen (Gegenstand konnte nicht zurückgegeben werden – Insolvenzmasse).');
    res.redirect('/admin/market');
  }));
  router.post('/market/offer/:id(\\d+)/void', wrap(async (req, res) => {
    await db.query("UPDATE market_offers SET status = 'void' WHERE id = ? AND status = 'open'", [int(req.params.id)]);
    await audit(req, 'market_void_offer', { id: int(req.params.id) });
    flash(req, 'good', 'Angebot gelöscht.'); res.redirect('/admin/market');
  }));
};
