'use strict';
const EN = require('./i18n-en');
const LANGS = ['de', 'en'];

function fromCookie(req) {
  const m = /(?:^|;\s*)tp_lang=(de|en)\b/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}
function detect(req) {
  const c = fromCookie(req);
  if (c) return c;
  const first = String(req.headers['accept-language'] || '').toLowerCase().split(',')[0].trim();
  return first.startsWith('en') ? 'en' : 'de';
}
function middleware(req, res, next) {
  res.locals.lang = detect(req);
  req.lang = res.locals.lang;
  next();
}
/** /lang/en?next=/register setzt das Cookie und leitet zurück. */
function setLang(req, res) {
  const code = LANGS.includes(req.params.code) ? req.params.code : 'de';
  res.cookie('tp_lang', code, { maxAge: 365 * 24 * 3600 * 1000, sameSite: 'lax', httpOnly: false, secure: 'auto' });
  res.redirect(require('./lib/security').safePath(req.query.next, '/')); // kein „//host“ und kein „/\\host“ (Browser lesen \\ als /)
}
function dictScript(req, res) {
  let extra = { exact: {}, patterns: [] };
  try { extra = require('./i18n-data/client'); } catch (_) { /* optional */ }
  let more = { exact: {}, patterns: [] };
  try { more = require('./i18n-data/client-extra'); } catch (_) { /* optional */ }
  let phase = { exact: {}, patterns: [] };
  try { phase = require('./i18n-data/client-phase'); } catch (_) { /* optional */ }
  let fx = { exact: {}, patterns: [] };
  try { fx = require('./i18n-data/client-F'); } catch (_) { /* optional */ }
  let gg = { exact: {}, patterns: [] };
  try { gg = require('./i18n-data/client-G'); } catch (_) { /* optional */ }
  res.type('application/javascript').set('Cache-Control', 'public, max-age=300').send('window.TP_I18N=' + JSON.stringify({ exact: Object.assign({}, gg.exact, fx.exact, phase.exact, extra.exact, more.exact, EN.EXACT), patterns: EN.PATTERNS.concat(extra.patterns || [], more.patterns, phase.patterns, fx.patterns) }) + ';');
}
module.exports = { middleware, setLang, dictScript, detect };
