'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const settings = require('../settings');
const mailer = require('../lib/mailer');
const account = require('../lib/account');
const { randomToken } = require('../lib/security');
const { audit } = require('../lib/audit');

const router = express.Router();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: 'Zu viele Versuche. Bitte warte einige Minuten.' });
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const baseUrl = (req) => (require('../config').loadConfig() || {}).siteUrl || `${req.protocol}://${req.get('host')}`;

router.use((req, res, next) => (req.user ? next() : res.redirect('/login?next=/account')));

const render = async (req, res, extra = {}) => {
  const u = await db.one('SELECT id, email, username, role, created_at, last_login_at, email_verified, lang FROM users WHERE id = ?', [req.user.id]);
  const chars = await db.one('SELECT COUNT(*) n FROM characters WHERE user_id = ?', [req.user.id]);
  res.render('account', { title: 'Mein Konto', u, characters: chars.n, impersonating: !!req.session.impersonator, error: null, notice: null, pushEnabled: !!(settings.get('push') || {}).enabled, ...extra });
};

router.get('/', wrap((req, res) => render(req, res, { notice: req.query.pw ? 'Passwort geändert.' : req.query.mail ? 'E-Mail-Adresse geändert.' : null })));

router.post('/password', limiter, wrap(async (req, res) => {
  const { current = '', pw = '', pw2 = '' } = req.body;
  const u = await db.one('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(String(current), u.password_hash))) return render(req, res, { error: 'Das aktuelle Passwort stimmt nicht.' });
  if (String(pw).length < 8) return render(req, res, { error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
  if (pw !== pw2) return render(req, res, { error: 'Die beiden neuen Passwörter sind nicht gleich.' });
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(pw), 11), u.id]);
  await audit(req, 'account_password', req.user.username);
  res.redirect('/account?pw=1');
}));

router.post('/email', limiter, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(); const pw = String(req.body.current || '');
  const u = await db.one('SELECT id, password_hash, username FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(pw, u.password_hash))) return render(req, res, { error: 'Das aktuelle Passwort stimmt nicht.' });
  if (!EMAIL_RE.test(email) || email.length > 190) return render(req, res, { error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  if (await db.one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, u.id])) return render(req, res, { error: 'Diese E-Mail-Adresse wird schon verwendet.' });
  const needVerify = !!settings.get('site.require_email_verification') && mailer.smtpConfigured();
  const token = needVerify ? randomToken(24) : null;
  await db.query('UPDATE users SET email = ?, email_verified = ?, verify_token = ? WHERE id = ?', [email, needVerify ? 0 : 1, token, u.id]);
  if (needVerify) mailer.send({ to: email, ...require('../lib/mail-templates').build('verify', req.lang, u.username, `${baseUrl(req)}/verify/${token}`) }).catch(() => {});
  await audit(req, 'account_email', u.username);
  res.redirect('/account?mail=1');
}));

/* Datenexport als JSON-Datei (Art. 15/20 DSGVO) */
const lastExport = new Map();
router.get('/export', wrap(async (req, res) => {
  const last = lastExport.get(req.user.id) || 0;
  if (Date.now() - last < 30000) return res.status(429).render('error', { code: 429, title: 'Bitte kurz warten', message: 'Der Export kann nur alle 30 Sekunden angefordert werden.' });
  lastExport.set(req.user.id, Date.now());
  const data = await account.exportData(req.user.id);
  await audit(req, 'account_export', req.user.username);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="turning-point-daten-${String(req.user.username).replace(/[^\w.-]/g, '_')}-${stamp}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));

/* Konto endgültig löschen */
router.post('/delete', limiter, wrap(async (req, res) => {
  if (req.session.impersonator) return render(req, res, { error: 'Während der Admin-Ansicht kann kein Konto gelöscht werden.' });
  const u = await db.one('SELECT id, username, role, password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.current || ''), u.password_hash))) return render(req, res, { error: 'Das Passwort stimmt nicht.', openDelete: true });
  if (!['LÖSCHEN', 'DELETE'].includes(String(req.body.confirm || '').trim().toUpperCase())) return render(req, res, { error: 'Bitte tippe zur Bestätigung LÖSCHEN (bzw. DELETE) ein.', openDelete: true });
  if (u.role === 'admin') {
    const n = (await db.one("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND banned = 0")).n;
    if (n <= 1) return render(req, res, { error: 'Du bist der letzte Admin. Vergib zuerst die Admin-Rolle an jemand anderen.', openDelete: true });
  }
  await audit(req, 'account_delete', u.username);
  await account.deleteAccount(u.id);
  req.session.destroy(() => res.redirect('/?deleted=1'));
}));

module.exports = router;
