'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const settings = require('../settings');
const mailer = require('../lib/mailer');
const { randomToken } = require('../lib/security');
const { audit } = require('../lib/audit');
const anticheat = require('../lib/anticheat');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false, message: 'Zu viele Versuche. Bitte warte einige Minuten.' });
// Zweite Bremse je Konto (nicht nur je IP): verteilte Passwort-Versuche gegen denselben Namen werden ebenfalls gestoppt. Zählt nur Fehlversuche.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: (req) => `acct:${String((req.body && req.body.login) || '').trim().toLowerCase().slice(0, 190)}`, validate: { keyGeneratorIpFallback: false },
  message: 'Zu viele Fehlversuche für dieses Konto. Bitte warte einige Minuten.',
});
// Fester Hash, damit auch bei unbekanntem Konto gleich lange gerechnet wird (kein Zeitunterschied → keine Konto-Erkennung)
const DUMMY_HASH = bcrypt.hashSync('turning-point-dummy-password', 11);
const NAME_RE = /^[\p{L}\p{N}_.-]{3,24}$/u;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function safeNext(n) { return typeof n === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(n) ? n : '/play'; }
function login(req, user, cb) {
  req.session.regenerate((err) => {
    if (err) return cb(err);
    req.session.userId = user.id;
    cb(null);
  });
}
const baseUrl = (req) => (require('../config').loadConfig() || {}).siteUrl || `${req.protocol}://${req.get('host')}`;

router.post('/stop-impersonation', (req, res) => {
  const admin = req.session.impersonator;
  if (!admin) return res.redirect('/play');
  delete req.session.impersonator;
  req.session.userId = admin;
  res.redirect('/admin/users');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/play');
  res.render('auth/login', { error: null, notice: req.query.registered ? 'Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben.' : req.query.reset ? 'Passwort geändert. Du kannst dich jetzt anmelden.' : null, values: {}, next: safeNext(req.query.next) });
});

router.post('/login', authLimiter, accountLimiter, async (req, res, next) => {
  try {
    const id = String(req.body.login || '').trim();
    const pw = String(req.body.password || '');
    const u = await db.one('SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1', [id.toLowerCase(), id]);
    const fail = (m) => res.status(401).render('auth/login', { error: m, notice: null, values: { login: id }, next: safeNext(req.body.next) });
    if (!(await bcrypt.compare(pw, u ? u.password_hash : DUMMY_HASH)) || !u) { await audit(req, 'login_failed', id); return fail('Benutzername oder Passwort stimmt nicht.'); }
    if (u.banned) return fail(`Dieses Konto ist gesperrt${u.ban_reason ? ': ' + u.ban_reason : '.'}`);
    if (!u.email_verified && settings.get('site.require_email_verification')) return fail('Bitte bestätige zuerst deine E-Mail-Adresse.');
    login(req, u, async (err) => {
      if (err) return next(err);
      await db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [u.id]);
      await audit(req, 'login', u.username);
      anticheat.trackIp(req, u.id);
      res.redirect(safeNext(req.body.next));
    });
  } catch (e) { next(e); }
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/play');
  if (!settings.get('site.registration_open')) return res.status(403).render('error', { code: 403, title: 'Registrierung geschlossen', message: 'Neue Konten sind im Moment nicht möglich.' });
  res.render('auth/register', { error: null, values: {} });
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    if (!settings.get('site.registration_open')) return res.status(403).render('error', { code: 403, title: 'Registrierung geschlossen', message: 'Neue Konten sind im Moment nicht möglich.' });
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const pw = String(req.body.password || '');
    const values = { username, email };
    const bad = (m) => res.status(400).render('auth/register', { error: m, values });
    if (req.body.website) return bad('Registrierung abgelehnt.');
    if (!NAME_RE.test(username)) return bad('Der Spielername muss 3–24 Zeichen lang sein (Buchstaben, Zahlen, _ . -).');
    if (!EMAIL_RE.test(email) || email.length > 190) return bad('Bitte eine gültige E-Mail-Adresse angeben.');
    if (pw.length < 8) return bad('Das Passwort braucht mindestens 8 Zeichen.');
    if (!req.body.terms) return bad('Bitte bestätige Alter (16+), Nutzungsbedingungen und Datenschutzerklärung.');
    if (await db.one('SELECT id FROM users WHERE email = ? OR username = ?', [email, username])) return bad('Diese E-Mail oder dieser Name ist bereits vergeben.');
    const needVerify = settings.get('site.require_email_verification') && mailer.smtpConfigured();
    const token = needVerify ? randomToken(32) : null;
    const hash = await bcrypt.hash(pw, 11);
    const r = await db.query(
      'INSERT INTO users (email, username, password_hash, role, email_verified, verify_token, coins, efs_accrued_at, meta, lang) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [email, username, hash, 'player', needVerify ? 0 : 1, token, settings.get('coins.start'), Date.now(), JSON.stringify({}), req.lang === 'en' ? 'en' : 'de'],
    );
    await audit(req, 'register', username);
    anticheat.trackIp(req, r.insertId);
    if (needVerify) {
      const link = `${baseUrl(req)}/verify/${token}`;
      mailer.send({ to: email, ...require('../lib/mail-templates').build('verify', req.lang, username, link) }).catch(() => {});
      return res.redirect('/login?registered=1');
    }
    login(req, { id: r.insertId }, (err) => (err ? next(err) : res.redirect('/play')));
  } catch (e) { next(e); }
});

router.get('/verify/:token', async (req, res, next) => {
  try {
    const r = await db.query('UPDATE users SET email_verified = 1, verify_token = NULL WHERE verify_token = ?', [req.params.token]);
    if (!r.affectedRows) return res.status(400).render('error', { code: 400, title: 'Link ungültig', message: 'Dieser Bestätigungslink ist abgelaufen oder wurde bereits verwendet.' });
    res.redirect('/login?reset=1');
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });
router.get('/logout', (req, res) => res.redirect('/'));

router.get('/forgot', (req, res) => res.render('auth/forgot', { message: mailer.smtpConfigured() ? null : 'E-Mail-Versand ist auf diesem Server nicht eingerichtet. Bitte wende dich an den Betreiber.' }));
router.post('/forgot', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (mailer.smtpConfigured()) {
      const u = await db.one('SELECT id, username, lang FROM users WHERE email = ?', [email]);
      if (u) {
        const token = randomToken(32);
        await db.query('UPDATE users SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [token, u.id]);
        const link = `${baseUrl(req)}/reset/${token}`;
        mailer.send({ to: email, ...require('../lib/mail-templates').build('reset', u.lang || req.lang, u.username, link) }).catch(() => {});
      }
    }
    res.render('auth/forgot', { message: 'Falls ein Konto mit dieser Adresse existiert, ist ein Link unterwegs.' });
  } catch (e) { next(e); }
});
router.get('/reset/:token', async (req, res, next) => {
  try {
    const u = await db.one('SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW()', [req.params.token]);
    if (!u) return res.status(400).render('error', { code: 400, title: 'Link ungültig', message: 'Dieser Link ist abgelaufen. Fordere einen neuen an.' });
    res.render('auth/reset', { token: req.params.token, error: null });
  } catch (e) { next(e); }
});
router.post('/reset/:token', authLimiter, async (req, res, next) => {
  try {
    const pw = String(req.body.password || '');
    const u = await db.one('SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW()', [req.params.token]);
    if (!u) return res.status(400).render('error', { code: 400, title: 'Link ungültig', message: 'Dieser Link ist abgelaufen.' });
    if (pw.length < 8) return res.status(400).render('auth/reset', { token: req.params.token, error: 'Mindestens 8 Zeichen.' });
    await db.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [await bcrypt.hash(pw, 11), u.id]);
    // alle bestehenden Sitzungen dieses Kontos beenden (gestohlene Sitzung / vergessenes Gerät)
    await db.query('DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?', [`%"userId":${u.id},%`, `%"userId":${u.id}}%`]);
    res.redirect('/login?reset=1');
  } catch (e) { next(e); }
});

module.exports = router;
