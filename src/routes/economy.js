'use strict';
/** Stadtwirtschaft: Preisbarometer, Vergleich mit anderen Städten und Hinweise (nur Lesen). */
const express = require('express');
const service = require('../game/service');
const actions = require('../game/actions');
const ce = require('../game/cityecon');
const core = require('../game/core');
const { yearOf } = require('../game/calendar');
const { userLimit } = require('../lib/limits');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  if (e instanceof actions.ActionError) return res.status(400).json({ ok: false, error: e.message });
  return next(e);
});
router.use(userLimit(60));

/** Angebot und Nachfrage in Worten: knapp / ausgeglichen / reichlich (aus den letzten Eingaben der Aktualisierung). */
function marketOf(world, cityId) {
  const inp = ce.getInputs(cityId) || { players: 0, rooms: { food: 0, services: 0, build: 0, all: 0 } };
  return ce.SECTORS.map((s) => {
    const b = ce.balance(world, cityId, s, inp, ce.noPolicy());
    return { sector: s, demand: Math.round(b.D * 10) / 10, supply: Math.round(b.S * 10) / 10, state: b.ratio >= 1.12 ? 'tight' : b.ratio <= 0.9 ? 'plenty' : 'even' };
  });
}

router.get('/city', wrap(async (req, res) => {
  const p = await service.peek(req.user.id);
  if (!p || !p.state) return res.status(400).json({ ok: false, error: 'Kein Charakter.' });
  const world = p.w; const state = p.state;
  const cityId = Number(req.query.cityId) || state.cityId;
  const city = world.city(cityId);
  if (!city) return res.status(404).json({ ok: false, error: 'Unbekannte Stadt.' });
  const year = yearOf(state.day, state.startYear);
  const ids = String(req.query.ids || '').split(',').map(Number).filter((x) => Number.isFinite(x) && x > 0).slice(0, 8);
  const lodging = state.status === 'alive' ? core.dailyFlows(world, state).exp.lodging : 0;
  res.json({
    ok: true, enabled: ce.active(), year, here: cityId === state.cityId,
    city: { id: city.id, name: city.name, state: city.state, tier: city.size_tier, pop: city.pop || 0 },
    barometer: ce.barometer(world, cityId, year),
    market: marketOf(world, cityId),
    compare: ce.compare(world, cityId, year, { ids }),
    tips: cityId === state.cityId ? ce.tips(world, state, year, lodging) : [],
    news: ce.news(world, cityId, year),
  });
}));

module.exports = router;
