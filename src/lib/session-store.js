'use strict';
const session = require('express-session');
const db = require('../db');

/** Minimaler MySQL-Session-Store (keine zusätzliche Abhängigkeit, läuft überall). */
class MySQLStore extends session.Store {
  constructor(ttlMs = 1000 * 60 * 60 * 24 * 30) {
    super();
    this.ttl = ttlMs;
    this.timer = setInterval(() => this.prune().catch(() => {}), 1000 * 60 * 30);
    this.timer.unref();
  }
  expiryOf(sess) {
    const c = sess && sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttl;
    return c;
  }
  get(sid, cb) {
    db.one('SELECT data FROM sessions WHERE sid = ? AND expires > ?', [sid, Date.now()])
      .then((r) => cb(null, r ? JSON.parse(r.data) : null)).catch(cb);
  }
  set(sid, sess, cb) {
    db.query(
      'INSERT INTO sessions (sid, data, expires) VALUES (?,?,?) ON DUPLICATE KEY UPDATE data = VALUES(data), expires = VALUES(expires)',
      [sid, JSON.stringify(sess), this.expiryOf(sess)],
    ).then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }
  touch(sid, sess, cb) {
    db.query('UPDATE sessions SET expires = ? WHERE sid = ?', [this.expiryOf(sess), sid]).then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }
  destroy(sid, cb) {
    db.query('DELETE FROM sessions WHERE sid = ?', [sid]).then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }
  async prune() { await db.query('DELETE FROM sessions WHERE expires < ?', [Date.now()]); }
}

/** Muster, die genau die Sitzungen eines Kontos treffen ("userId":5 darf nicht auch 50 oder 500 erwischen). */
function userSessionPatterns(userId) {
  const id = Math.trunc(Number(userId));
  if (!Number.isSafeInteger(id) || id <= 0) return [];
  return [`%"userId":${id},%`, `%"userId":${id}}%`];
}
/** Beendet alle Sitzungen eines Kontos (optional bis auf die aktuelle). Gibt die Anzahl zurück. */
async function killUserSessions(userId, exceptSid = null) {
  const pats = userSessionPatterns(userId);
  if (!pats.length) return 0;
  const r = await db.query(`DELETE FROM sessions WHERE (data LIKE ? OR data LIKE ?)${exceptSid ? ' AND sid <> ?' : ''}`, exceptSid ? [...pats, exceptSid] : pats);
  return r.affectedRows || 0;
}
async function countUserSessions(userId) {
  const pats = userSessionPatterns(userId);
  if (!pats.length) return 0;
  return (await db.one('SELECT COUNT(*) n FROM sessions WHERE (data LIKE ? OR data LIKE ?) AND expires > ?', [...pats, Date.now()])).n;
}

module.exports = { MySQLStore, userSessionPatterns, killUserSessions, countUserSessions };
