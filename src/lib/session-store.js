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
module.exports = { MySQLStore };
