'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const settings = require('../settings');
const mailer = require('../lib/mailer');
const { randomToken, hashToken, TOKEN_RE, isEmail, safePath, baseUrl: baseUrlOf } = require('../lib/security');
const { killUserSessions } = require('../lib/session-store');
const passwordPolicy = require('../lib/password');
const { audit } = require('../lib/audit');
const anticheat = require('../lib/anticheat');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false, message: 'Zu viele Versuche. Bitte warte einige Minuten.' });
// Zweite Bremse je Konto (nicht nur je IP): verteilte Passwort-Versuche gegen denselben Namen werden ebenfalls gestoppt. Zählt nur Fehlversuche.
// Je Konto UND Adresse: so kann ein Fremder ein Konto nicht allein durch gezielte Fehlversuche für den Besitzer sperren …
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: (req) => `acct:${String((req.body && req.body.login) || '').trim().toLowerCase().slice(0, 190)}|${req.ip}`, validate: { keyGeneratorIpFallback: false },
  message: 'Zu viele Fehlversuche für dieses Konto. Bitte warte einige Minuten.',
});
// … und zusätzlich insgesamt je Konto, damit auch verteilte Angriffe (viele Adressen) irgendwann gestoppt werden (höhere Schwelle).
const accountTotalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: (req) => `acctall:${String((req.body && req.body.login) || '').trim().toLowerCase().slice(0, 190)}`, validate: { keyGeneratorIpFallback: false },
  message: 'Zu viele Fehlversuche für dieses Konto. Bitte warte eine Weile.',
});
// Passwort-Mails: höchstens 3 je Stunde und Adresse (kein Mail-Bombing fremder Postfächer); Antwort bleibt dieselbe wie sonst (keine Konto-Erkennung)
const forgotMailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: false, legacyHeaders: false,
  keyGenerator: (req) => `fp:${String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 190)}`, validate: { keyGeneratorIpFallback: false },
  handler: (req, res) => res.render('auth/forgot', { message: 'Falls ein Konto mit dieser Adresse existiert, ist ein Link unterwegs.' }),
});
// Fester Hash, damit auch bei unbekanntem Konto gleich lange gerechnet wird (kein Zeitunterschied → keine Konto-Erkennung)
const DUMMY_HASH = bcrypt.hashSync('turning-point-dummy-password', 11);
const NAME_RE = /^[\p{L}\p{N}_.-]{3,24}$/u;
const MAX_PW_INPUT = 200; // längere Eingaben gar nicht erst durch bcrypt schicken

function safeNext(n) { return safePath(n, '/play'); }
function login(req, user, cb) {
  req.session.regenerate((err) => { // neue Sitzungs-ID bei jeder Anmeldung (Session-Fixation)
    if (err) return cb(err);
    req.session.userId = user.id;
    req.session.born = Date.now();
    cb(null);
  });
}
const baseUrl = (req) => baseUrlOf(req, require('../config').loadConfig());

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

router.post('/login', authLimiter, accountLimiter, accountTotalLimiter, async (req, res, next) => {
  try {
    const id = String(req.body.login || '').trim().slice(0, 190);
    const pw = String(req.body.password || '').slice(0, MAX_PW_INPUT);
    const u = await db.one('SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1', [id.toLowerCase(), id]);
    const fail = (m) => res.status(401).render('auth/login', { error: m, notice: null, values: { login: id }, next: safeNext(req.body.next) });
    if (!(await bcrypt.compare(pw, u ? u.password_hash : DUMMY_HASH)) || !u) { await audit(req, 'login_failed', id.slice(0, 80)); return fail('Benutzername oder Passwort stimmt nicht.'); }
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
    if (!isEmail(email)) return bad('Bitte eine gültige E-Mail-Adresse angeben.');
    const pwErr = passwordPolicy.validate(pw, { username, email }); if (pwErr) return bad(pwErr);
    if (!req.body.terms) return bad('Bitte bestätige Alter (16+), Nutzungsbedingungen und Datenschutzerklärung.');
    if (await db.one('SELECT id FROM users WHERE email = ? OR username = ?', [email, username])) return bad('Diese E-Mail oder dieser Name ist bereits vergeben.');
    const needVerify = settings.get('site.require_email_verification') && mailer.smtpConfigured();
    const token = needVerify ? randomToken(32) : null;
    const hash = await bcrypt.hash(pw, 11);
    const r = await db.query(
      'INSERT INTO users (email, username, password_hash, role, email_verified, verify_token, coins, efs_accrued_at, meta, lang) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [email, username, hash, 'player', needVerify ? 0 : 1, token ? hashToken(token) : null, settings.get('coins.start'), Date.now(), JSON.stringify({}), req.lang === 'en' ? 'en' : 'de'],
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
    const tok = String(req.params.token);
    const r = TOKEN_RE.test(tok) ? await db.query('UPDATE users SET email_verified = 1, verify_token = NULL WHERE verify_token = ?', [hashToken(tok)]) : { affectedRows: 0 };
    if (!r.affectedRows) return res.status(400).render('error', { code: 400, title: 'Link ungültig', message: 'Dieser Bestätigungslink ist abgelaufen oder wurde bereits verwendet.' });
    res.redirect('/login?reset=1');
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });
router.get('/logout', (req, res) => res.redirect('/'));

router.get('/forgot', (req, res) => res.render('auth/forgot', { message: mailer.smtpConfigured() ? null : 'E-Mail-Versand ist auf diesem Server nicht eingerichtet. Bitte wende dich an den Betreiber.' }));
router.post('/forgot', authLimiter, forgotMailLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 190);
    if (mailer.smtpConfigured() && isEmail(email)) {
      const u = await db.one('SELECT id, username, lang FROM users WHERE email = ?', [email]);
      if (u) {
        const token = randomToken(32);
        await db.query('UPDATE users SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [hashToken(token), u.id]); // nur der Hash wird gespeichert
        const link = `${baseUrl(req)}/reset/${token}`;
        mailer.send({ to: email, ...require('../lib/mail-templates').build('reset', u.lang || req.lang, u.username, link) }).catch(() => {});
      }
    }
    res.render('auth/forgot', { message: 'Falls ein Konto mit dieser Adresse existiert, ist ein Link unterwegs.' });
  } catch (e) { next(e); }
});
const findReset = (tok) => (TOKEN_RE.test(String(tok)) ? db.one('SELECT id, username, email FROM users WHERE reset_token = ? AND reset_expires > NOW()', [hashToken(tok)]) : Promise.resolve(null));
router.get('/reset/:token', async (req, res, next) => {
  try {
    const u = await findReset(req.params.token);
    if (!u) return res.status(400).render('error', { code: 400, title: 'Link ungültig', message: 'Dieser Link ist abgelaufen. Fordere einen neuen an.' });
    res.render('auth/reset', { token: req.params.token, error: null });
  } catch (e) { next(e); }
});
router.post('/reset/:token', authLimiter, async (req, res, next) => {
  try {
    const pw = String(req.body.password || '');
    const u = await findReset(req.params.token);
    if (!u) return res.status(400).render('error', { code: 400, title: 'Link ungültig', message: 'Dieser Link ist abgelaufen.' });
    const pwErr = passwordPolicy.validate(pw, { username: u.username, email: u.email });
    if (pwErr) return res.status(400).render('auth/reset', { token: req.params.token, error: pwErr });
    // Einmalig: nur wer den Token wirklich "verbraucht" (affectedRows = 1), darf das Passwort setzen – zwei gleichzeitige Anfragen gewinnen nie beide
    const r = await db.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ? AND reset_token = ? AND reset_expires > NOW()', [await bcrypt.hash(pw, 11), u.id, hashToken(req.params.token)]);
    if (!r.affectedRows) return res.status(400).render('error', { code: 400, title: 'Link ungültig', message: 'Dieser Link wurde bereits verwendet.' });
    await killUserSessions(u.id); // alle bestehenden Sitzungen beenden (gestohlene Sitzung / vergessenes Gerät)
    await audit(req, 'password_reset', u.username);
    res.redirect('/login?reset=1');
  } catch (e) { next(e); }
});

module.exports = router;
