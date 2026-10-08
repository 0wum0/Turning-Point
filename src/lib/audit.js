'use strict';
const db = require('../db');
const { logSafe } = require('./security');
/** Protokolleintrag. Detailtext wird gekürzt und von Steuerzeichen befreit (keine gefälschten Zeilen, kein Aufblähen der Tabelle). */
async function audit(req, action, detail) {
  try {
    const text = logSafe(typeof detail === 'string' ? detail : JSON.stringify(detail || {}), 1000);
    await db.query('INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?,?,?,?)', [req && req.session ? req.session.userId || null : null, String(action).slice(0, 60), text, req ? String(req.ip || '').slice(0, 64) : null]);
  } catch (_) { /* Audit darf nie die Anfrage zerstören */ }
}
module.exports = { audit };
