'use strict';
const express = require('express');
const social = require('../lib/social');
const exchange = require('../lib/exchange');
const leases = require('../lib/leases');
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

router.get('/notifications', wrap(async (req, res) => res.json({ ok: true, ...(await social.notifications(uid(req))) })));
router.get('/directory', wrap(async (req, res) => res.json({ ok: true, ...(await social.directory(uid(req), { cityId: int(req.query.cityId), tab: ['people', 'houses', 'firms'].includes(req.query.tab) ? req.query.tab : 'people', q: req.query.q || '', page: int(req.query.page, 1) })) })));
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

/* ---------- Arbeit (Spieler stellen Spieler ein) ---------- */
const bonds = require('../lib/bonds');
const worldSvc = require('../game/world');
const fresh = async (req, res, extra = {}) => { const v = await service.getView(uid(req)); res.json({ ok: true, view: v.view, ...extra }); };
/* ---------- Wahlen ---------- */
const elections = require('../lib/elections');
router.get('/elections', wrap(async (req, res) => res.json({ ok: true, ...(await elections.overview(await worldSvc.get(), uid(req))) })));
router.post('/elections/run', wrap(async (req, res) => { const r = await elections.run(uid(req), req.body.idx, req.body.platform); res.json({ ok: true, message: r.msg, view: r.view }); }));
router.post('/elections/withdraw', wrap(async (req, res) => { await elections.withdraw(uid(req), req.body.electionId); res.json({ ok: true }); }));
router.post('/elections/vote', wrap(async (req, res) => { await elections.vote(uid(req), req.body.electionId, req.body.candidateId); res.json({ ok: true }); }));

router.get('/jobs/market', wrap(async (req, res) => res.json({ ok: true, ...(await bonds.market(await worldSvc.get(), uid(req))) })));
router.get('/jobs/mine', wrap(async (req, res) => res.json({ ok: true, ...(await bonds.mine(await worldSvc.get(), uid(req))) })));
router.post('/jobs/offer', wrap(async (req, res) => { const id = await bonds.createOffer(await worldSvc.get(), uid(req), req.body || {}); res.json({ ok: true, id }); }));
router.post('/jobs/offer/:id/close', wrap(async (req, res) => { await bonds.closeOffer(uid(req), int(req.params.id)); res.json({ ok: true }); }));
router.post('/jobs/apply', wrap(async (req, res) => { await bonds.apply(await worldSvc.get(), uid(req), int(req.body.offerId), req.body.message); res.json({ ok: true }); }));
router.post('/jobs/invite', wrap(async (req, res) => { await bonds.invite(await worldSvc.get(), uid(req), int(req.body.offerId), int(req.body.userId)); res.json({ ok: true }); }));
router.post('/jobs/decide', wrap(async (req, res) => { const r = await bonds.decide(await worldSvc.get(), uid(req), int(req.body.appId), !!req.body.accept); await fresh(req, res, r); }));
router.post('/jobs/withdraw', wrap(async (req, res) => { await bonds.withdraw(uid(req), int(req.body.appId)); res.json({ ok: true }); }));
router.post('/jobs/quit', wrap(async (req, res) => { await bonds.quit(uid(req)); await fresh(req, res); }));
router.post('/jobs/fire', wrap(async (req, res) => { await bonds.fire(uid(req), int(req.body.id)); await fresh(req, res); }));

/* ---------- Spielermarkt ---------- */
const market = require('../lib/market');
router.post('/lease/take', wrap(async (req, res) => { const r = await leases.take(uid(req), int(req.body.ownerId), int(req.body.propId)); await fresh(req, res, r); }));
router.post('/lease/leave', wrap(async (req, res) => { await leases.leave(uid(req)); await fresh(req, res); }));
router.post('/lease/evict', wrap(async (req, res) => { await leases.evict(uid(req), int(req.body.propId)); await fresh(req, res); }));
router.get('/exchange', wrap(async (req, res) => res.json({ ok: true, ...(await exchange.overview(uid(req))) })));
router.get('/exchange/history/:id', wrap(async (req, res) => res.json({ ok: true, history: await exchange.history(int(req.params.id)) })));
router.post('/exchange/order', wrap(async (req, res) => { const r = await exchange.place(uid(req), int(req.body.stockId), String(req.body.side), req.body.shares, req.body.priceReal); res.json({ ok: true, ...r, view: r.view }); }));
router.post('/exchange/cancel', wrap(async (req, res) => { await exchange.cancel(uid(req), int(req.body.id)); res.json({ ok: true }); }));
router.post('/exchange/ipo', wrap(async (req, res) => { const r = await exchange.ipo(uid(req), int(req.body.companyId), req.body.floatPct, req.body.divPct); res.json({ ok: true, ...r }); }));
router.post('/exchange/delist', wrap(async (req, res) => { await exchange.delist(uid(req), int(req.body.companyId)); res.json({ ok: true }); }));
router.post('/exchange/takeover', wrap(async (req, res) => { await exchange.takeover(uid(req), int(req.body.stockId)); await fresh(req, res); }));
router.get('/market', wrap(async (req, res) => res.json({ ok: true, ...(await market.overview(uid(req))) })));
router.get('/market/auctions', wrap(async (req, res) => res.json({ ok: true, auctions: await market.auctions(uid(req), int(req.query.cityId)) })));
router.post('/market/offer', wrap(async (req, res) => { const id = await market.makeOffer(uid(req), { kind: String(req.body.kind), ownerId: int(req.body.ownerId), itemId: int(req.body.itemId), priceReal: req.body.priceReal, message: req.body.message }); res.json({ ok: true, id }); }));
router.post('/market/respond', wrap(async (req, res) => { const r = await market.respondOffer(uid(req), int(req.body.id), String(req.body.action), req.body.priceReal); await fresh(req, res, r); }));
router.post('/market/withdraw', wrap(async (req, res) => { await market.withdrawOffer(uid(req), int(req.body.id)); res.json({ ok: true }); }));
router.post('/market/ask', wrap(async (req, res) => { await market.setAsk(uid(req), String(req.body.kind), int(req.body.itemId), req.body.priceReal == null || req.body.priceReal === '' ? null : req.body.priceReal); res.json({ ok: true }); }));
router.post('/market/buy', wrap(async (req, res) => { const r = await market.buyNow(uid(req), int(req.body.sellerId), String(req.body.kind), int(req.body.itemId)); await fresh(req, res, { cost: r.cost }); }));
router.post('/market/auction/start', wrap(async (req, res) => { const r = await market.startAuction(uid(req), String(req.body.kind), int(req.body.itemId), req.body.minReal, int(req.body.hours, 24)); await fresh(req, res, r); }));
router.post('/market/auction/bid', wrap(async (req, res) => { await market.bid(uid(req), int(req.body.id), req.body.priceReal); res.json({ ok: true }); }));

/* ---------- Wettbewerb ---------- */
const rivalry = require('../lib/rivalry');
router.get('/rivalry', wrap(async (req, res) => res.json({ ok: true, ...(await rivalry.status(uid(req))) })));
router.post('/rivalry/optin', wrap(async (req, res) => { await rivalry.setOptIn(uid(req), !!req.body.on); res.json({ ok: true, ...(await rivalry.status(uid(req))) }); }));
router.post('/rivalry/act', wrap(async (req, res) => { const r = await rivalry.perform(uid(req), int(req.body.targetId), int(req.body.companyId), String(req.body.action)); await fresh(req, res, r); }));

/* ---------- Beziehung & Hochzeit ---------- */
router.get('/couple', wrap(async (req, res) => res.json({ ok: true, ...(await bonds.coupleView(await worldSvc.get(), uid(req))) })));
router.post('/couple/request', wrap(async (req, res) => { await bonds.request(await worldSvc.get(), uid(req), int(req.body.userId)); res.json({ ok: true }); }));
router.post('/couple/respond', wrap(async (req, res) => { await bonds.respond(await worldSvc.get(), uid(req), int(req.body.id), !!req.body.accept); await fresh(req, res); }));
router.post('/couple/cancel', wrap(async (req, res) => { await bonds.cancelRequest(uid(req), int(req.body.id)); res.json({ ok: true }); }));
router.post('/couple/propose', wrap(async (req, res) => { await bonds.propose(uid(req)); res.json({ ok: true }); }));
router.post('/couple/answer', wrap(async (req, res) => { await bonds.answerProposal(await worldSvc.get(), uid(req), !!req.body.accept); await fresh(req, res); }));
router.post('/couple/breakup', wrap(async (req, res) => { await bonds.breakup(uid(req)); await fresh(req, res); }));

module.exports = router;
