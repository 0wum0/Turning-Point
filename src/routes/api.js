'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('../db');
const settings = require('../settings');
const worldSvc = require('../game/world');
const service = require('../game/service');
const actions = require('../game/actions');
const { edition } = require('../game/newspaper');
const { yearOf } = require('../game/calendar');
const { audit } = require('../lib/audit');
const stripe = require('../lib/stripe');
const config = require('../config');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  if (e instanceof actions.ActionError) return res.status(400).json({ ok: false, error: e.message });
  return next(e);
});
router.use((req, res, next) => (req.user ? next() : res.status(401).json({ ok: false, error: 'Bitte melde dich an.', login: true })));
router.use(rateLimit({ windowMs: 60 * 1000, limit: Number(process.env.TP_API_RATE) || 180, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `u${req.user ? req.user.id : req.ip}`, validate: { keyGeneratorIpFallback: false }, message: { ok: false, error: 'Zu viele Anfragen – bitte kurz warten.' } }));

router.get('/state', wrap(async (req, res) => {
  const r = await service.getView(req.user.id);
  res.json({ ok: true, view: r.view, needCreate: !r.view, sync: r.sync, coins: r.coins, efsPool: r.efsPool });
}));

router.get('/world', wrap(async (req, res) => {
  const w = await worldSvc.get();
  const startYear = settings.get('game.start_year');
  res.json({
    ok: true,
    cities: w.cityList.map((c) => ({ id: c.id, name: c.name, state: c.state, lat: c.lat, lon: c.lon, tier: c.size_tier, factor: c.price_factor, image: c.image, description: c.description })),
    startProfessions: w.activeProfessions(startYear).filter((p) => !p.academic && p.pkey !== 'helfer').map((p) => ({ key: p.pkey, name: p.name, icon: p.icon, description: p.description, category: p.category })),
    academic: w.cityList && [...w.professions.values()].filter((p) => p.academic).map((p) => ({ key: p.pkey, name: p.name, icon: p.icon, description: p.description, days: p.training_days, tuition: p.tuition_day, wage: p.base_wage })),
    professions: [...w.professions.values()].map((p) => ({ key: p.pkey, name: p.name, icon: p.icon, academic: !!p.academic, from: p.era_from, to: p.era_to, days: p.training_days })),
    startYear, startMoney: settings.get('game.start_money_cents'), maxChildren: settings.get('game.max_children'),
    adsEnabled: settings.get('ads.enabled'), adSeconds: settings.get('ads.min_seconds'), adCoins: settings.get('coins.ad_video'), adBase: settings.get('coins.ad_base'),
    schools: { haupt: 'Hauptschule', real: 'Realschule', gym: 'Gymnasium' },
  });
}));

router.post('/create', wrap(async (req, res) => {
  const r = await service.create(req.user.id, req.body || {});
  res.json({ ok: true, view: r.view });
}));

router.post('/action/:name', wrap(async (req, res) => {
  const r = await service.doAction(req.user.id, req.params.name, req.body || {});
  res.json({ ok: true, message: r.message, level: r.level, view: r.view });
}));

router.post('/advance', wrap(async (req, res) => {
  const r = await service.doAdvance(req.user.id, req.body && req.body.days);
  res.json({ ok: true, advanced: r.advanced, stopped: r.stopped, moneyDelta: r.moneyDelta, newNotices: r.newNotices, yearFrom: r.yearFrom, yearTo: r.yearTo, view: r.view });
}));

router.get('/newspaper', wrap(async (req, res) => {
  const p = await service.peek(req.user.id);
  if (!p || !p.state || p.state.status !== 'alive') return res.status(400).json({ ok: false, error: 'Kein lebender Charakter.' });
  const cityId = Number(req.query.cityId) || p.state.cityId;
  if (!p.w.city(cityId)) return res.status(404).json({ ok: false, error: 'Unbekannte Stadt.' });
  res.json({ ok: true, edition: edition(p.w, p.state, cityId), here: cityId === p.state.cityId });
}));

router.get('/map', wrap(async (req, res) => {
  const p = await service.peek(req.user.id);
  if (!p || !p.state) return res.status(400).json({ ok: false, error: 'Kein Charakter.' });
  const now = Date.now();
  const list = actions.pickups(p.w, now).filter((x) => !p.state.collected[x.key]);
  const ae = p.user.meta.activeEfs && p.user.meta.activeEfs.date === actions.berlinDay(now) ? p.user.meta.activeEfs.amount : 0;
  res.json({
    ok: true, pickups: list, here: p.state.cityId, birthCityId: p.state.person.birthCityId,
    properties: p.state.properties.map((x) => ({ id: x.id, cityId: x.cityId, name: x.name, kind: x.kind })),
    activeEfs: { today: ae, cap: settings.get('efs.active_daily_cap') },
  });
}));

router.get('/move-quote', wrap(async (req, res) => {
  const p = await service.peek(req.user.id);
  if (!p || !p.state || p.state.status !== 'alive') return res.status(400).json({ ok: false, error: 'Kein lebender Charakter.' });
  const q = actions.moveQuote(p.w, p.state, Number(req.query.cityId));
  res.json({ ok: true, quote: q, coins: p.user.coins });
}));

router.post('/heir/preview', wrap(async (req, res) => {
  res.json({ ok: true, plan: await service.previewHeir(req.user.id, req.body.childId, req.body.bequest) });
}));
router.post('/heir', wrap(async (req, res) => {
  const r = await service.chooseHeir(req.user.id, req.body.childId, req.body.bequest);
  res.json({ ok: true, view: r.view });
}));

router.get('/archive', wrap(async (req, res) => {
  const rows = await db.query("SELECT id, cycle, generation, name, status, end_reason, game_day, money, created_at FROM characters WHERE user_id = ? ORDER BY id", [req.user.id]);
  const startYear = settings.get('game.start_year');
  res.json({ ok: true, lives: rows.map((r) => ({ ...r, year: yearOf(r.game_day, startYear) })) });
}));

/* ---------- Belohnungswerbung (freiwillig, nur durch Klick) ---------- */
router.post('/ads/start', wrap(async (req, res) => {
  if (!settings.get('ads.enabled')) throw new actions.ActionError('Werbung ist derzeit deaktiviert.');
  const purpose = String(req.body.purpose || 'coins');
  if (!(purpose === 'coins' || purpose === 'efs' || /^discount:(move|room):\d+$/.test(purpose))) throw new actions.ActionError('Unbekannter Zweck.');
  const since = Date.now() - 24 * 3600 * 1000;
  const n = (await db.one('SELECT COUNT(*) AS n FROM ad_claims WHERE user_id = ? AND claimed_at IS NOT NULL AND claimed_at > ?', [req.user.id, since])).n;
  if (n >= settings.get('ads.daily_cap')) throw new actions.ActionError('Du hast heute genug Werbung gesehen. Morgen geht es weiter.');
  const token = crypto.randomBytes(16).toString('hex');
  await db.query('INSERT INTO ad_claims (user_id, token, purpose, started_at) VALUES (?,?,?,?)', [req.user.id, token, purpose, Date.now()]);
  const provider = settings.get('ads.provider'); const url = settings.get('ads.custom_url');
  res.json({ ok: true, token, seconds: settings.get('ads.min_seconds'), provider, url: provider === 'custom' && url ? `${url}${String(url).includes('?') ? '&' : '?'}tp_token=${token}` : null });
}));

router.post('/ads/claim', wrap(async (req, res) => {
  const token = String(req.body.token || '');
  const ad = await db.one('SELECT * FROM ad_claims WHERE token = ? AND user_id = ?', [token, req.user.id]);
  if (!ad || ad.claimed_at) throw new actions.ActionError('Diese Belohnung ist nicht mehr verfügbar.');
  const minMs = settings.get('ads.min_seconds') * 1000 - 600;
  if (Date.now() - ad.started_at < minMs) throw new actions.ActionError('Die Anzeige wurde nicht bis zum Ende angesehen.');
  const claimed = await db.query('UPDATE ad_claims SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL', [Date.now(), ad.id]);
  if (!claimed.affectedRows) throw new actions.ActionError('Bereits eingelöst.');
  let message = '';
  if (ad.purpose === 'coins') {
    const c = settings.get('coins.ad_video');
    await db.query('UPDATE users SET coins = coins + ? WHERE id = ?', [c, req.user.id]);
    await db.query('UPDATE ad_claims SET reward = ? WHERE id = ?', [c, ad.id]);
    message = `+${c} Coins`;
  } else if (ad.purpose === 'efs') {
    const e = settings.get('ads.efs_reward');
    await db.query('UPDATE users SET efs_pool = efs_pool + ? WHERE id = ?', [e, req.user.id]);
    message = `+${e} EFS`;
  } else {
    const key = ad.purpose.slice('discount:'.length);
    await service.withCharacter(req.user.id, async (ctx) => {
      if (!ctx.state) return;
      ctx.state.discounts[key] = Math.min(6, (ctx.state.discounts[key] || 0) + 1);
    });
    message = 'Preis gesenkt';
  }
  const r = await service.getView(req.user.id);
  res.json({ ok: true, message, view: r.view, coins: r.coins, efsPool: r.efsPool });
}));

/* ---------- Shop (Testmodus bis ein Zahlungsanbieter angebunden ist) ---------- */
router.get('/shop', wrap(async (req, res) => {
  res.json({ ok: true, mode: settings.get('payments.mode'), packages: settings.get('packages'), subscription: settings.get('subscription') });
}));
router.post('/shop/checkout', wrap(async (req, res) => {
  if (settings.get('payments.mode') !== 'stripe') throw new actions.ActionError('Online-Zahlungen sind nicht aktiv.');
  const secret = settings.get('payments.stripe_secret');
  if (!secret) throw new actions.ActionError('Zahlungsanbieter ist nicht konfiguriert.');
  const origin = (config.loadConfig() || {}).siteUrl || `${req.protocol}://${req.get('host')}`;
  const metadata = { user_id: String(req.user.id) };
  const urls = { successUrl: `${origin}/play#/shop`, cancelUrl: `${origin}/play#/shop`, email: req.user.email };
  let session;
  if (req.body.id === 'subscription') {
    const sub = settings.get('subscription'); const price = settings.get('payments.stripe_sub_price');
    if (!sub.enabled || !price) throw new actions.ActionError('Die Dauerkarte ist nicht verfügbar.');
    session = await stripe.createCheckout(secret, { ...urls, metadata: { ...metadata, package_id: 'subscription' }, subscriptionPriceId: price });
  } else {
    const pkg = (settings.get('packages') || []).find((p) => p.id === req.body.id);
    if (!pkg) throw new actions.ActionError('Paket nicht gefunden.');
    session = await stripe.createCheckout(secret, { ...urls, metadata: { ...metadata, package_id: pkg.id }, name: pkg.name, amountCents: pkg.price_cents, currency: settings.get('payments.currency') });
  }
  await audit(req, 'checkout_start', req.body.id);
  res.json({ ok: true, url: session.url });
}));

router.post('/shop/buy', wrap(async (req, res) => {
  if (settings.get('payments.mode') !== 'test') throw new actions.ActionError('Käufe sind noch nicht freigeschaltet – ein Zahlungsanbieter muss erst im Admin-Bereich verbunden werden.');
  const pkg = (settings.get('packages') || []).find((p) => p.id === req.body.id);
  if (!pkg) throw new actions.ActionError('Paket nicht gefunden.');
  await service.withCharacter(req.user.id, async (ctx) => {
    ctx.user.coins += pkg.coins || 0;
    ctx.user.efs_pool += pkg.efs || 0;
    if (ctx.state && ctx.state.status === 'alive' && pkg.money) ctx.state.money += pkg.money;
  });
  await db.query('INSERT INTO purchases (user_id, package_id, coins, efs, money, price_cents, provider, status) VALUES (?,?,?,?,?,?,?,?)', [req.user.id, pkg.id, pkg.coins || 0, pkg.efs || 0, pkg.money || 0, pkg.price_cents || 0, 'test', 'completed']);
  await audit(req, 'test_purchase', pkg.id);
  const r = await service.getView(req.user.id);
  res.json({ ok: true, view: r.view, coins: r.coins, efsPool: r.efsPool, message: `${pkg.name} gutgeschrieben (Testmodus).` });
}));

module.exports = router;
