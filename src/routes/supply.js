'use strict';
/** Warenkreislauf: Lieferverträge (Suche, Angebote, Annahme, Kündigung) und Wirtschaftspolitik der Amtsinhaber. */
const express = require('express');
const service = require('../game/service');
const actions = require('../game/actions');
const settings = require('../settings');
const goods = require('../game/goods');
const supply = require('../lib/supply');
const policies = require('../lib/policies');
const { userLimit } = require('../lib/limits');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  if (e instanceof actions.ActionError) return res.status(400).json({ ok: false, error: e.message });
  return next(e);
});
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const uid = (req) => req.user.id;
const fresh = async (req, res, extra = {}) => { const v = await service.getView(uid(req)); res.json({ ok: true, view: v.view, ...extra }); };

const writeLimit = userLimit(20, 'Zu viele Handelsaktionen – bitte kurz warten.');
const readLimit = userLimit(60);
router.use((req, res, next) => (req.method === 'POST' ? writeLimit : readLimit)(req, res, next));
router.use((req, res, next) => (settings.get('social').enabled || req.path.startsWith('/policy') ? next() : res.status(403).json({ ok: false, error: 'Die Gemeinschaftsfunktionen sind gerade abgeschaltet.' })));

router.get('/mine', wrap(async (req, res) => res.json({ ok: true, ...(await supply.mine(uid(req))) })));
router.get('/partners', wrap(async (req, res) => res.json({ ok: true, ...(await supply.partners(uid(req), int(req.query.companyId), String(req.query.good || ''), req.query.side === 'buyer' ? 'buyer' : 'supplier')) })));
router.post('/offer', wrap(async (req, res) => {
  const b = req.body || {};
  const id = await supply.offer(uid(req), { role: b.role, myCompany: b.myCompany, otherUser: b.otherUser, otherCompany: b.otherCompany, good: String(b.good || ''), qty: b.qty, pricePct: b.pricePct, termDays: b.termDays, auto: !!b.auto, freightMode: b.freightMode === 'seller' ? 'seller' : 'buyer', carrierOffer: b.carrierOffer ? int(b.carrierOffer) : 0 });
  res.json({ ok: true, id });
}));
router.post('/respond', wrap(async (req, res) => { const r = await supply.respond(uid(req), int(req.body.id), !!req.body.accept); await fresh(req, res, r); }));
router.post('/cancel', wrap(async (req, res) => { await supply.cancel(uid(req), int(req.body.id)); await fresh(req, res); }));
router.get('/prices', wrap(async (req, res) => {
  const p = await service.peek(uid(req)); if (!p || !p.state) return res.json({ ok: true, list: [] });
  const { yearOf } = require('../game/calendar');
  res.json({ ok: true, list: goods.priceList(p.w, p.state.cityId, yearOf(p.state.day, p.state.startYear)) });
}));

router.get('/policy', wrap(async (req, res) => res.json({ ok: true, ...(await policies.overview(uid(req))) })));
router.post('/policy/preview', wrap(async (req, res) => res.json({ ok: true, ...(await policies.preview(uid(req), req.body || {})) })));
router.post('/policy/set', wrap(async (req, res) => { const r = await policies.set(uid(req), req.body || {}); res.json({ ok: true, message: r.msg, level: r.level, view: r.view }); }));

module.exports = router;
