'use strict';
/** /api/push/* – Web-Push-Abo der installierten PWA (Anmeldung per Session, CSRF über api.js/app.js). */
const express = require('express');
const rateLimit = require('express-rate-limit');
const settings = require('../settings');
const push = require('../lib/push');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => (e && e.status === 400 ? res.status(400).json({ ok: false, error: e.message }) : next(e)));
const lim = rateLimit({ windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `p${req.user ? req.user.id : req.ip}`, validate: { keyGeneratorIpFallback: false }, message: { ok: false, error: 'Zu viele Anfragen – bitte kurz warten.' } });

router.get('/key', wrap(async (req, res) => {
  const enabled = !!(settings.get('push') || {}).enabled;
  res.json({ ok: true, enabled, key: enabled ? await push.publicKey() : null });
}));
router.get('/prefs', wrap(async (req, res) => res.json({ ok: true, prefs: await push.getPrefs(req.user.id) })));
router.post('/prefs', lim, wrap(async (req, res) => {
  await push.setPrefs(req.user.id, { cats: req.body.cats, quiet: req.body.quiet });
  res.json({ ok: true, prefs: await push.getPrefs(req.user.id) });
}));
router.post('/subscribe', lim, wrap(async (req, res) => {
  if (!(settings.get('push') || {}).enabled) return res.status(400).json({ ok: false, error: 'Push-Benachrichtigungen sind derzeit abgeschaltet.' });
  await push.subscribe(req.user.id, req.body.subscription, String(req.body.tz || ''), String(req.get('user-agent') || ''));
  res.json({ ok: true, prefs: await push.getPrefs(req.user.id) });
}));
router.post('/unsubscribe', lim, wrap(async (req, res) => {
  await push.unsubscribe(req.user.id, req.body.endpoint ? String(req.body.endpoint) : null);
  res.json({ ok: true, prefs: await push.getPrefs(req.user.id) });
}));
router.post('/test', lim, wrap(async (req, res) => {
  const r = await push.notify(req.user.id, { title: 'Turning Point', body: 'Benachrichtigungen funktionieren.', cat: 'letters', tab: 'letters', tag: 'test', force: true });
  res.json({ ok: r.sent > 0, sent: r.sent, reason: r.reason || null });
}));

module.exports = router;
