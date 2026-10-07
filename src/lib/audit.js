'use strict';
const db = require('../db');
async function audit(req, action, detail) {
  try {
    await db.query('INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?,?,?,?)', [req && req.session ? req.session.userId || null : null, action, typeof detail === 'string' ? detail : JSON.stringify(detail || {}), req ? req.ip : null]);
  } catch (_) { /* Audit darf nie die Anfrage zerstören */ }
}
module.exports = { audit };
