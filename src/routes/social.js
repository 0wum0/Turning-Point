'use strict';
const express = require('express');
const social = require('../lib/social');
const service = require('../game/service');
const actions = require('../game/actions');
const settings = require('../settings');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  if (e instanceof actions.ActionError) return res.status(400).json({ ok: false, error: e.message });
  return next(e);
});
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const uid = (req) => req.user.id;

router.use((req, res, next) => (settings.get('social').enabled || req.path === '/summary' ? next() : res.status(403).json({ ok: false, error: 'Die Gemeinschaftsfunktionen sind gerade abgeschaltet.' })));

router.get('/summary', wrap(async (req, res) => res.json({ ok: true, ...(await social.summary(uid(req))) })));

router.get('/leaderboard', wrap(async (req, res) => {
  const p = await service.peek(uid(req));
  res.json({ ok: true, ...(await social.leaderboard(uid(req), { cat: String(req.query.cat || 'wealth'), scope: String(req.query.scope || 'all'), cityId: p && p.state ? p.state.cityId : 0 })) });
}));

router.get('/me', wrap(async (req, res) => res.json({ ok: true, ...(await social.myProfile(uid(req))) })));
router.get('/profile/:id', wrap(async (req, res) => res.json({ ok: true, profile: await social.profile(uid(req), int(req.params.id)) })));
router.post('/profile', wrap(async (req, res) => { await social.setProfile(uid(req), { bio: req.body.bio, social_public: !!req.body.public }); res.json({ ok: true }); }));

router.get('/search', wrap(async (req, res) => res.json({ ok: true, players: await social.search(uid(req), req.query.q) })));
router.get('/friends', wrap(async (req, res) => res.json({ ok: true, ...(await social.listFriends(uid(req))) })));
router.post('/friends/request', wrap(async (req, res) => res.json({ ok: true, state: await social.friendRequest(uid(req), int(req.body.userId)) })));
router.post('/friends/respond', wrap(async (req, res) => { await social.friendRespond(uid(req), int(req.body.userId), !!req.body.accept); res.json({ ok: true }); }));
router.post('/friends/remove', wrap(async (req, res) => { await social.friendRemove(uid(req), int(req.body.userId), !!req.body.block); res.json({ ok: true }); }));

router.get('/inbox', wrap(async (req, res) => res.json({ ok: true, ...(await social.inbox(uid(req), req.query.box === 'out' ? 'out' : 'in', Math.max(1, int(req.query.page, 1)))) })));
router.get('/letter/:id', wrap(async (req, res) => res.json({ ok: true, letter: await social.readLetter(uid(req), int(req.params.id)) })));
router.post('/letter', wrap(async (req, res) => { await social.sendLetter(uid(req), int(req.body.to), req.body.subject, req.body.body); res.json({ ok: true }); }));
router.post('/letter/:id/delete', wrap(async (req, res) => { await social.deleteLetter(uid(req), int(req.params.id)); res.json({ ok: true }); }));
router.post('/report', wrap(async (req, res) => { await social.report(uid(req), String(req.body.kind), int(req.body.refId), req.body.reason); res.json({ ok: true }); }));

const visitInfo = (p) => {
  const V = settings.get('social').visit; const { scale } = require('../game/economy'); const { yearOf } = require('../game/calendar');
  const idx = p && p.state ? p.w.idx(yearOf(p.state.day, p.state.startYear)) : 1;
  return { price: V.price.map((x) => scale(x, idx)), wellbeing: V.wellbeing, cooldownMin: V.cooldownMin, enabled: V.enabled };
};
router.get('/chat', wrap(async (req, res) => {
  const p = await service.peek(uid(req)); const cityId = p && p.state ? p.state.cityId : 0;
  const c = await social.chatList(uid(req), int(req.query.cityId, cityId), int(req.query.after));
  const firms = int(req.query.after) ? undefined : await social.firmsInCity(uid(req), cityId);
  res.json({ ok: true, cityId, ...c, firms, visit: visitInfo(p), chat: { maxLen: settings.get('social').chat.maxLen, cooldownSec: settings.get('social').chat.cooldownSec } });
}));
router.post('/chat', wrap(async (req, res) => { const id = await social.chatSend(uid(req), int(req.body.cityId), req.body.text); res.json({ ok: true, id }); }));

router.post('/gift', wrap(async (req, res) => {
  const r = await social.gift(uid(req), int(req.body.to), Number(String(req.body.amount).replace(',', '.')));
  const v = await service.getView(uid(req));
  res.json({ ok: true, received: r.received, view: v.view });
}));
router.post('/visit', wrap(async (req, res) => {
  const r = await social.visit(uid(req), int(req.body.owner), int(req.body.company));
  const v = await service.getView(uid(req));
  res.json({ ok: true, message: `Du warst bei ${r.name}: +${r.boost} Wohlbefinden.`, view: v.view });
}));
router.get('/firms', wrap(async (req, res) => {
  const p = await service.peek(uid(req)); const cityId = int(req.query.cityId, p && p.state ? p.state.cityId : 0);
  res.json({ ok: true, firms: await social.firmsInCity(uid(req), cityId) });
}));

module.exports = router;
