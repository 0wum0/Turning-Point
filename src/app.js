'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const config = require('./config');
const db = require('./db');
const settings = require('./settings');
const log = require('./lib/log');
const { MySQLStore } = require('./lib/session-store');
const rateLimit = require('express-rate-limit');
const { csrf, escapeHtml, redactUrl, jsonShape } = require('./lib/security');
const net = require('./lib/net');
const roles = require('./lib/roles');

const SESSION_MAX_AGE_MS = 90 * 24 * 3600 * 1000; // absolute Höchstdauer einer Anmeldung, egal wie oft die Sitzung verlängert wurde

const APP_VERSION = require('../package.json').version;

/** Erlaubte iframe-Herkunft für Werbe-/Offerwall-Anbieter (aus den Admin-Einstellungen). */
function frameOrigins() {
  const out = [];
  for (const k of ['ads.custom_url', 'offerwall.url']) {
    try { const v = settings.get(k); if (v) out.push(new URL(String(v).replace('{uid}', '0')).origin); } catch (_) { /* ungültig */ }
  }
  return out.length ? out.join(' ') : "'self'";
}

function createApp(cfg) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', net.trustProxySetting()); // Hostinger/LiteSpeed: genau 1 Proxy (TP_TRUST_PROXY ändert das)
  app.set('view engine', 'ejs');
  app.set('views', path.join(config.APP_ROOT, 'views'));
  app.locals.icon = (n, c = '') => `<svg class="i ${c}" aria-hidden="true"><use href="/img/icons.svg#i-${n}"/></svg>`;
  app.locals.esc = escapeHtml;
  app.locals.assetV = APP_VERSION;

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], scriptSrcAttr: ["'none'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"], connectSrc: ["'self'"], mediaSrc: ["'self'"], workerSrc: ["'self'"], manifestSrc: ["'self'"], frameSrc: ["'self'", (req, res) => frameOrigins()],
        objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      },
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false, preload: false }, // wirkt nur über https (Browser ignorieren es über http)
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), midi=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=(), browsing-topics=()');
    next();
  });
  app.use(net.deadline());
  app.use(compression());

  const pub = path.join(config.APP_ROOT, 'public');
  app.use('/fonts', express.static(path.join(pub, 'fonts'), { maxAge: '365d', immutable: true }));
  app.use(express.static(pub, { maxAge: '1h' }));
  // Bilder liegen ausserhalb der App (Hostinger-sicher): <daten>/uploads
  app.use('/media', express.static(config.paths.uploadsDir, { maxAge: '30d', index: false, dotfiles: 'deny', fallthrough: false, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));

  // Dynamische Antworten (Seiten, API, Konto, Admin) dürfen nirgends zwischengespeichert werden; Routen setzen bei Bedarf eigene Werte
  app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // Gesundheits-Check: kein DB-Zugriff pro Aufruf (höchstens alle 5 s), keine Versionsangabe
  let health = { at: 0, ok: true };
  app.get('/healthz', async (req, res) => {
    if (Date.now() - health.at > 5000) { try { await db.query('SELECT 1'); health = { at: Date.now(), ok: true }; } catch (e) { health = { at: Date.now(), ok: false }; } }
    res.status(health.ok ? 200 : 503).json({ ok: health.ok });
  });

  // Bremse je IP für alles ausser der API (die hat eine eigene je Spieler) und die Webhooks (eigene, grosszügigere Bremse)
  const rl = (limit, extra = {}) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: 'Zu viele Anfragen – bitte kurz warten.', ...extra });
  app.use('/webhooks', rl(Number(process.env.TP_WEBHOOK_RATE) || 300));
  app.use('/webhooks', require('./routes/webhooks')); // Roh-Body & Signatur, vor Parsern/CSRF
  const globalLimit = rl(Number(process.env.TP_IP_RATE) || 300);
  app.use((req, res, next) => (req.path.startsWith('/api/') ? next() : globalLimit(req, res, next)));

  const i18n = require('./i18n');
  app.use(i18n.middleware);
  app.get('/lang/:code', i18n.setLang);
  app.get('/i18n/en.js', i18n.dictScript);
  app.use(session({
    name: 'tp.sid', secret: cfg.sessionSecret, resave: false, saveUninitialized: false, rolling: true, store: new MySQLStore(),
    cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 1000 * 60 * 60 * 24 * 30 },
  }));
  app.use((req, res, next) => {
    res.locals.site = { name: settings.get('site.name'), tagline: settings.get('site.tagline') };
    res.locals.era = 1; res.locals.user = null; res.locals.flash = null; res.locals.path = req.path;
    next();
  });

  // aktueller Nutzer + gemeinsame Template-Variablen
  app.use(async (req, res, next) => {
    try {
      req.user = null;
      const fresh = () => new Promise((resolve) => req.session.regenerate(() => resolve())); // alte Sitzung löschen, leere neue anlegen
      if (req.session.userId) {
        if (!req.session.born) req.session.born = Date.now();
        else if (Date.now() - req.session.born > SESSION_MAX_AGE_MS) await fresh();
      }
      if (req.session.userId) {
        const u = await db.one('SELECT id, email, username, role, banned, ban_reason, email_verified, coins, lang FROM users WHERE id = ?', [req.session.userId]);
        if (!u || u.banned) { await fresh(); } else {
          req.user = u;
          // gewählte Sprache am Konto merken (für E-Mails)
          if (/(?:^|;\s*)tp_lang=/.test(req.headers.cookie || '') && u.lang !== req.lang) { u.lang = req.lang; db.query('UPDATE users SET lang = ? WHERE id = ?', [req.lang, u.id]).catch(() => {}); }
        }
      }
      res.locals.user = req.user;
      res.locals.impersonating = req.user && req.session.impersonator ? req.user.username : null;
      res.locals.site = { name: settings.get('site.name'), tagline: settings.get('site.tagline') };
      res.locals.era = 1;
      res.locals.flash = req.session.flash || null; delete req.session.flash;
      res.locals.path = req.path;
      next();
    } catch (e) { next(e); }
  });

  // Formular-/JSON-Bodies erst NACH der Anmeldeprüfung: nur Team-Mitglieder dürfen grosse Admin-Formulare schicken (vorher konnte jeder 12 MB an /admin senden)
  const formSmall = express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 300 });
  const formAdmin = express.urlencoded({ extended: true, limit: '12mb', parameterLimit: 50000 });
  app.use((req, res, next) => (req.path.startsWith('/admin') && req.user && roles.isStaff(req.user.role) ? formAdmin : formSmall)(req, res, next));
  app.use(express.json({ limit: '300kb' }));
  const shape = jsonShape();
  app.use((req, res, next) => (req.path.startsWith('/admin') ? next() : shape(req, res, next))); // Admin-Formulare dürfen gross sein (nur Team)
  app.use(csrf);

  // Wartungsmodus
  app.use((req, res, next) => {
    if (!settings.get('site.maintenance')) return next();
    if (req.user && req.user.role !== 'player') return next();
    if (['/login', '/logout', '/healthz'].includes(req.path) || req.path.startsWith('/admin') && !req.user) return next();
    if (req.path.startsWith('/api/')) return res.status(503).json({ ok: false, error: settings.get('site.maintenance_message') });
    return res.status(503).render('error', { code: 503, title: 'Wartung', message: settings.get('site.maintenance_message') });
  });

  app.use(require('./routes/public'));
  app.use(require('./routes/auth'));
  app.use('/account', require('./routes/account'));
  app.use('/api', require('./i18n-game').apiMiddleware);
  app.use('/api', require('./routes/api'));
  app.use('/play', require('./routes/play'));
  app.use('/admin', require('./routes/admin'));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Nicht gefunden.' });
    res.status(404).render('error', { code: 404, title: 'Seite nicht gefunden', message: 'Diese Seite gibt es nicht – vielleicht ist sie ein Opfer der Zeit geworden.' });
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.code === 'ENOENT' && req.path.startsWith('/media/')) return res.status(404).end();
    if (err && err.status === 404 && req.path.startsWith('/media/')) return res.status(404).end();
    // Fehler der Anfrage selbst (zu grosse/kaputte Bodies, falsche Zeichensätze) sind keine Serverfehler und verraten nichts
    const st = err && Number(err.status || err.statusCode);
    if (st >= 400 && st < 500) {
      const msg = st === 413 ? 'Die Anfrage ist zu gross.' : 'Ungültige Anfrage.';
      if (req.path.startsWith('/api/')) return res.status(st).json({ ok: false, error: msg });
      return res.status(st).render('error', { code: st, title: msg, message: 'Bitte prüfe deine Eingabe und versuche es noch einmal.' });
    }
    log.error(`${req.method} ${redactUrl(req.originalUrl)}`, err);
    if (res.headersSent) return res.end();
    if (req.path.startsWith('/api/')) return res.status(500).json({ ok: false, error: 'Interner Fehler.' });
    res.status(500).render('error', { code: 500, title: 'Etwas ist schiefgelaufen', message: 'Der Fehler wurde protokolliert. Bitte versuche es gleich noch einmal.' });
  });
  return app;
}

module.exports = { createApp, APP_VERSION };
