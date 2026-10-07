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
const { csrf, escapeHtml } = require('./lib/security');

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
  app.set('trust proxy', 1); // Hostinger/LiteSpeed-Proxy
  app.set('view engine', 'ejs');
  app.set('views', path.join(config.APP_ROOT, 'views'));
  app.locals.icon = (n, c = '') => `<svg class="i ${c}" aria-hidden="true"><use href="/img/icons.svg#i-${n}"/></svg>`;
  app.locals.esc = escapeHtml;
  app.locals.assetV = APP_VERSION;

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"], connectSrc: ["'self'"], mediaSrc: ["'self'"], frameSrc: ["'self'", (req, res) => frameOrigins()], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(compression());

  const pub = path.join(config.APP_ROOT, 'public');
  app.use('/fonts', express.static(path.join(pub, 'fonts'), { maxAge: '365d', immutable: true }));
  app.use(express.static(pub, { maxAge: '1h' }));
  // Bilder liegen ausserhalb der App (Hostinger-sicher): <daten>/uploads
  app.use('/media', express.static(config.paths.uploadsDir, { maxAge: '30d', index: false, dotfiles: 'deny', fallthrough: false, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));

  app.get('/healthz', async (req, res) => {
    try { await db.query('SELECT 1'); res.json({ ok: true, version: APP_VERSION }); } catch (e) { res.status(503).json({ ok: false }); }
  });

  app.use('/webhooks', require('./routes/webhooks')); // Roh-Body & Signatur, vor Parsern/CSRF
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '300kb' }));

  app.use(session({
    name: 'tp.sid', secret: cfg.sessionSecret, resave: false, saveUninitialized: false, rolling: true, store: new MySQLStore(),
    cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 1000 * 60 * 60 * 24 * 30 },
  }));
  app.use((req, res, next) => {
    res.locals.site = { name: settings.get('site.name'), tagline: settings.get('site.tagline') };
    res.locals.era = 1; res.locals.user = null; res.locals.flash = null; res.locals.path = req.path;
    next();
  });
  app.use(csrf);

  // aktueller Nutzer + gemeinsame Template-Variablen
  app.use(async (req, res, next) => {
    try {
      req.user = null;
      if (req.session.userId) {
        const u = await db.one('SELECT id, email, username, role, banned, ban_reason, email_verified, coins FROM users WHERE id = ?', [req.session.userId]);
        if (!u || u.banned) { req.session.destroy(() => {}); } else req.user = u;
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

  // Wartungsmodus
  app.use((req, res, next) => {
    if (!settings.get('site.maintenance')) return next();
    if (req.user && req.user.role === 'admin') return next();
    if (['/login', '/logout', '/healthz'].includes(req.path) || req.path.startsWith('/admin') && !req.user) return next();
    if (req.path.startsWith('/api/')) return res.status(503).json({ ok: false, error: settings.get('site.maintenance_message') });
    return res.status(503).render('error', { code: 503, title: 'Wartung', message: settings.get('site.maintenance_message') });
  });

  app.use(require('./routes/public'));
  app.use(require('./routes/auth'));
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
    log.error(`${req.method} ${req.originalUrl}`, err);
    if (req.path.startsWith('/api/')) return res.status(500).json({ ok: false, error: 'Interner Fehler.' });
    res.status(500).render('error', { code: 500, title: 'Etwas ist schiefgelaufen', message: 'Der Fehler wurde protokolliert. Bitte versuche es gleich noch einmal.' });
  });
  return app;
}

module.exports = { createApp, APP_VERSION };
