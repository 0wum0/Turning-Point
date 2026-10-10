'use strict';
/** Gerichte und Beweise: Übersicht, Maßnahmen zu Spuren, Anzeige, Antworten im Verfahren und Beschlüsse der Ämter. */
const express = require('express');
const service = require('../game/service');
const actions = require('../game/actions');
const court = require('../lib/court');
const policy = require('../lib/court-policy');
const { userLimit } = require('../lib/limits');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  if (e instanceof actions.ActionError) return res.status(400).json({ ok: false, error: e.message });
  return next(e);
});
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const uid = (req) => req.user.id;
router.use((req, res, next) => (req.method === 'POST' ? userLimit(15, 'Zu viele Anfragen an das Gericht – bitte kurz warten.') : userLimit(60))(req, res, next));
const fresh = async (req, res, r) => { const v = await service.getView(uid(req)); res.json({ ok: true, message: r && r.msg, level: r && r.level, id: r && r.id, view: v.view }); };

router.get('/', wrap(async (req, res) => res.json(await court.overview(uid(req)))));
router.get('/suspects', wrap(async (req, res) => res.json({ ok: true, list: await court.suspects(uid(req), req.query.q) })));
router.post('/evidence/:id(\\d+)/:kind(detective|witness|docs)', wrap(async (req, res) => fresh(req, res, await court.evidenceAction(uid(req), int(req.params.id), req.params.kind))));
router.post('/file', wrap(async (req, res) => fresh(req, res, await court.file(uid(req), { evidenceId: int(req.body.evidenceId), defendantId: int(req.body.defendantId) }))));
router.post('/case/:id(\\d+)/:action(lawyer|detective|confess|offer|accept|decline|withdraw|appeal|bribe)', wrap(async (req, res) => fresh(req, res, await court.respond(uid(req), int(req.params.id), req.params.action, { amount: req.body && req.body.amount }))));

router.get('/policy', wrap(async (req, res) => res.json({ ok: true, ...(await policy.overview(uid(req))) })));
router.post('/policy/preview', wrap(async (req, res) => res.json({ ok: true, ...(await policy.preview(uid(req), req.body || {})) })));
router.post('/policy/set', wrap(async (req, res) => { const r = await policy.set(uid(req), req.body || {}); res.json({ ok: true, message: r.msg, level: r.level, view: r.view }); }));

module.exports = router;
