'use strict';
const crypto = require('crypto');

/** CSRF: Token liegt in der Session; Formulare senden _csrf, API-Aufrufe den Header X-CSRF-Token. */
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token') || (req.body && req.body._csrf);
  if (typeof sent === 'string' && sent.length === req.session.csrf.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrf))) return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ ok: false, error: 'Sitzung abgelaufen – bitte Seite neu laden.' });
  return res.status(403).render('error', { code: 403, title: 'Sitzung abgelaufen', message: 'Bitte lade die Seite neu und versuche es noch einmal.' });
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { csrf, randomToken, escapeHtml };
