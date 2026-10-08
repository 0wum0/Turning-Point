'use strict';
const crypto = require('crypto');

/** CSRF: Token liegt in der Session; Formulare senden _csrf, API-Aufrufe den Header X-CSRF-Token. */
const FORM_PAGES = /^\/(login|register|forgot|reset\/)/;
function csrf(req, res, next) {
  // Anonyme Besucher bekommen nur dort ein Token (und damit eine Session-Zeile), wo es ein Formular gibt – sonst könnte jeder Aufruf die Sitzungstabelle füllen.
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (safe && !req.session.csrf && (req.session.userId || FORM_PAGES.test(req.path || ''))) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf || '';
  if (safe) return next();
  const sent = req.get('x-csrf-token') || (req.body && req.body._csrf) || req.query._csrf;
  if (req.session.csrf && typeof sent === 'string' && sent.length === req.session.csrf.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrf))) return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ ok: false, error: 'Sitzung abgelaufen – bitte Seite neu laden.' });
  return res.status(403).render('error', { code: 403, title: 'Sitzung abgelaufen', message: 'Bitte lade die Seite neu und versuche es noch einmal.' });
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
/** Einmal-Token (Passwort-Reset, E-Mail-Bestätigung) werden nur als SHA-256 gespeichert: ein DB-Leck liefert keine nutzbaren Links. */
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const TOKEN_RE = /^[a-f0-9]{32,128}$/;

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Nur relative Pfade der eigenen Seite zulassen (kein „//host“, kein „/\host“, keine Steuerzeichen) – sonst Fallback. */
function safePath(n, fallback = '/') {
  return typeof n === 'string' && n.length <= 300 && /^\/(?![/\\])[\w\-./?=&%#~+,:@!*()]*$/.test(n) ? n : fallback;
}

/** Einfache, strenge Adressprüfung: genau eine Adresse, keine Listen („a@b.de,c@d.de“), keine Anführungszeichen/Klammern/Steuerzeichen. */
const EMAIL_RE = /^[^\s@,;:<>()[\]\\"'`]{1,64}@[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)*\.[\p{L}]{2,24}$/u;
const isEmail = (s) => typeof s === 'string' && s.length <= 190 && EMAIL_RE.test(s);

/** Zugangs-Daten aus Protokollen heraushalten (Reset-/Bestätigungslinks, Signaturen, Passwörter in Query-Strings). */
function redactUrl(u) {
  return String(u == null ? '' : u)
    .replace(/(\/(?:reset|verify)\/)[^/?#\s]+/gi, '$1[token]')
    .replace(/([?&](?:sig|token|tp_token|_csrf|password|pw|secret|key|code)=)[^&#\s]*/gi, '$1[x]')
    .slice(0, 300);
}

/**
 * Öffentliche Basis-Adresse für Links in E-Mails/Zahlungen. Bevorzugt die konfigurierte siteUrl; nur ersatzweise der Host der Anfrage
 * (dann streng auf Host-Zeichen geprüft – ein manipulierter Host-Header kann sonst Passwort-Reset-Links umlenken: siteUrl setzen!).
 */
function baseUrl(req, cfg) {
  const site = cfg && cfg.siteUrl ? String(cfg.siteUrl).replace(/\/+$/, '') : '';
  if (/^https?:\/\/[\w.-]+(:\d{1,5})?$/i.test(site)) return site;
  const host = String(req.get('host') || '');
  return `${req.protocol === 'https' ? 'https' : 'http'}://${/^[\w.-]+(:\d{1,5})?$/.test(host) ? host : 'localhost'}`;
}

/** LIKE-Muster aus Nutzereingaben: % und _ wörtlich nehmen. */
const escapeLike = (s) => String(s == null ? '' : s).replace(/[\\%_]/g, (c) => `\\${c}`);

/** Kürzt und bereinigt Protokolltexte (Steuerzeichen/Zeilenumbrüche raus → keine gefälschten Logzeilen). */
function logSafe(s, max = 500) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').slice(0, max);
}

/**
 * JSON-Bodies: höchstens `maxDepth` Ebenen und `maxNodes` Knoten (iterativ geprüft, kein Rekursions-Überlauf).
 * Tiefe Verschachtelungen aus 300 kB Text könnten sonst tief rekursive Auswertungen (Übersetzung, Protokoll, Spiellogik) zum Absturz bringen.
 */
function jsonShape(maxDepth = 12, maxNodes = 20000) {
  return (req, res, next) => {
    const b = req.body;
    if (b && typeof b === 'object') {
      let n = 0; const stack = [[b, 1]];
      while (stack.length) {
        const [v, d] = stack.pop();
        if (d > maxDepth || ++n > maxNodes) return res.status(400).json({ ok: false, error: 'Ungültige Anfrage.' });
        if (v && typeof v === 'object') for (const k of Object.keys(v)) { const c = v[k]; if (c && typeof c === 'object') stack.push([c, d + 1]); else n++; }
        if (n > maxNodes) return res.status(400).json({ ok: false, error: 'Ungültige Anfrage.' });
      }
    }
    next();
  };
}

module.exports = { jsonShape, csrf, randomToken, hashToken, TOKEN_RE, escapeHtml, safePath, isEmail, redactUrl, baseUrl, escapeLike, logSafe };
