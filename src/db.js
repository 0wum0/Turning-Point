'use strict';
const mysql = require('mysql2/promise');

let pool = null;

function connectionOptions(db) {
  return {
    host: db.host,
    port: db.port || 3306,
    user: db.user,
    password: db.password,
    database: db.database,
    charset: 'utf8mb4',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 6, // Shared-Hosting hat meist ein Limit je DB-User
    queueLimit: 0,
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: false,
    multipleStatements: false,
  };
}

function init(db) {
  if (pool) { try { pool.end(); } catch (_) {} }
  pool = mysql.createPool(connectionOptions(db));
  return pool;
}

function getPool() {
  if (!pool) throw new Error('Datenbank nicht initialisiert');
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function one(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function tx(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const api = {
      query: async (sql, params) => (await conn.query(sql, params))[0],
      one: async (sql, params) => (await conn.query(sql, params))[0][0] || null,
    };
    const result = await fn(api);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}

/** Einmaliger Verbindungstest mit beliebigen Zugangsdaten (für den Installer). */
async function testConnection(db) {
  const conn = await mysql.createConnection({ ...connectionOptions(db), connectTimeout: 8000 });
  try {
    const [[v]] = await conn.query('SELECT VERSION() AS v');
    const [tables] = await conn.query('SHOW TABLES');
    const names = tables.map((r) => Object.values(r)[0]);
    let installed = false;
    let hasAdmin = false;
    if (names.includes('settings')) {
      const [r] = await conn.query("SELECT value FROM settings WHERE `key`='installed_at'");
      installed = r.length > 0;
    }
    if (names.includes('users')) {
      const [r] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE role='admin'");
      hasAdmin = r[0].n > 0;
    }
    return { version: v.v, tables: names, installed, hasAdmin };
  } finally {
    await conn.end();
  }
}

module.exports = { init, getPool, query, one, tx, testConnection };
