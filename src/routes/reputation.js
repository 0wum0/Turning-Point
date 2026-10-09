'use strict';
/** Ruf und Ansehen: eigene Ansicht (Bestandteile, Stufe, Protokoll) und Plaketten für Listen (nur Lesen) sowie die Ehrenbürgerwürde. */
const express = require('express');
const service = require('../game/service');
const actions = require('../game/actions');
const reputation = require('../lib/reputation');
const { userLimit } = require('../lib/limits');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  if (e instanceof actions.ActionError) return res.status(400).json({ ok: false, error: e.message });
  return next(e);
});
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
router.use((req, res, next) => (req.method === 'POST' ? userLimit(12) : userLimit(60))(req, res, next));

router.get('/', wrap(async (req, res) => {
  const p = await service.peek(req.user.id);
  const cityId = p && p.state ? p.state.cityId : 0;
  res.json(await reputation.view(req.user.id, cityId, p && p.w));
}));

/** Plaketten für Spieler-IDs (Verzeichnis, Angebote, Bewerbungen, Kandidaten): nur Stufen, keine Zahlen. */
router.get('/badges', wrap(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter((x) => x > 0).slice(0, 100);
  const cityId = int(req.query.cityId);
  const m = await reputation.many(ids, cityId);
  const out = {}; for (const [id, v] of m) out[id] = { lv: cityId ? v.ll : v.lv, nat: v.lv };
  res.json({ ok: true, badges: out });
}));

/** Ehrenbürgerwürde (nur Bürgermeister): Kandidaten, Vorschau, Verleihung. */
const honor = require('../lib/honor');
router.get('/honor', wrap(async (req, res) => res.json({ ok: true, ...(await honor.overview(req.user.id)) })));
router.post('/honor/preview', wrap(async (req, res) => res.json({ ok: true, ...(await honor.preview(req.user.id, int(req.body.userId))) })));
router.post('/honor/grant', wrap(async (req, res) => {
  const r = await honor.grant(req.user.id, int(req.body.userId));
  const v = await service.getView(req.user.id);
  res.json({ ok: true, ...r, view: v.view });
}));

module.exports = router;
