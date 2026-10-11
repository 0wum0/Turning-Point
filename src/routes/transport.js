'use strict';
/** Handel & Transport: Übersicht, Vorschau, Route einrichten, Frachtangebote und Beschlüsse der Ämter zum Verkehr. */
const express = require('express');
const service = require('../game/service');
const actions = require('../game/actions');
const transport = require('../lib/transport');
const policy = require('../lib/transport-policy');
const { userLimit } = require('../lib/limits');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  if (e instanceof actions.ActionError) return res.status(400).json({ ok: false, error: e.message });
  return next(e);
});
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const uid = (req) => req.user.id;
const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
router.use((req, res, next) => (req.method === 'POST' ? userLimit(30, 'Zu viele Handelsaktionen – bitte kurz warten.') : userLimit(90))(req, res, next));

const routeInput = (b) => ({
  firm: int(b.firm), good: String(b.good || ''), from: int(b.from), to: int(b.to), qty: Number(b.qty), interval: b.interval == null || b.interval === '' ? undefined : Number(b.interval),
  mode: typeof b.mode === 'string' ? b.mode.slice(0, 12) : 'auto', insured: !!b.insured, smuggle: !!b.smuggle, strict: b.strict !== false, carrierOffer: b.carrierOffer ? int(b.carrierOffer) : 0, routeId: b.routeId ? int(b.routeId) : 0,
});
const done = (r) => ({ ok: true, message: r.msg, level: r.level, id: r.id, view: r.view });

router.get('/', wrap(async (req, res) => res.json(await transport.overview(uid(req)))));
router.post('/preview', wrap(async (req, res) => res.json({ ok: true, preview: await transport.preview(uid(req), routeInput(body(req))) })));
router.post('/suggest', wrap(async (req, res) => { const b = body(req); res.json(await transport.suggest(uid(req), { firm: int(b.firm), good: b.good ? String(b.good) : '', budget: b.budget != null ? Number(b.budget) : undefined })); }));
router.post('/route', wrap(async (req, res) => res.json(done(await transport.create(uid(req), routeInput(body(req)))))));
router.post('/route/:id(\\d+)', wrap(async (req, res) => {
  const b = body(req); const input = {};
  for (const k of ['qty', 'interval']) if (b[k] != null && b[k] !== '') input[k] = Number(b[k]);
  if (typeof b.mode === 'string') input.mode = b.mode.slice(0, 12);
  for (const k of ['insured', 'smuggle', 'strict']) if (b[k] != null) input[k] = !!b[k];
  if (b.carrierOffer !== undefined) input.carrierOffer = b.carrierOffer ? int(b.carrierOffer) : 0;
  res.json(done(await transport.edit(uid(req), int(req.params.id), input)));
}));
router.post('/route/:id(\\d+)/active', wrap(async (req, res) => res.json(done(await transport.setActive(uid(req), int(req.params.id), !!body(req).on)))));
router.post('/route/:id(\\d+)/remove', wrap(async (req, res) => res.json(done(await transport.remove(uid(req), int(req.params.id))))));

router.get('/offers', wrap(async (req, res) => {
  const p = await service.peek(uid(req)); if (!p || !p.state) return res.json({ ok: true, mine: [], market: [] });
  res.json({ ok: true, mine: await transport.myOffers(uid(req)), market: await transport.marketOffers(uid(req), p) });
}));
router.post('/offer', wrap(async (req, res) => { const b = body(req); const id = await transport.createOffer(uid(req), { company: int(b.company), pct: Number(b.pct), cap: b.cap == null ? undefined : Number(b.cap) }); res.json({ ok: true, id }); }));
router.post('/offer/:id(\\d+)/close', wrap(async (req, res) => { await transport.closeOffer(uid(req), int(req.params.id)); res.json({ ok: true }); }));

router.get('/policy', wrap(async (req, res) => res.json({ ok: true, ...(await policy.overview(uid(req))) })));
router.post('/policy/preview', wrap(async (req, res) => res.json({ ok: true, ...(await policy.preview(uid(req), body(req))) })));
router.post('/policy/set', wrap(async (req, res) => { const r = await policy.set(uid(req), body(req)); res.json({ ok: true, message: r.msg, level: r.level, view: r.view }); }));

module.exports = router;
