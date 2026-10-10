'use strict';
/**
 * Bereitet die frische E2E-Datenbank vor (Schema + Startdaten + Admin), ohne den Web-Installer zu benutzen
 * (der Installer schreibt Konfigurationskopien in Nachbarordner). Läuft als eigener Prozess: node prepare-db.js
 * Umgebung: TP_DB_HOST/PORT/USER/PASS/NAME (Zugang der App), optional TP_E2E_ADMIN_USER/PASS/SOCKET (zum Anlegen der DB).
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const e = process.env;
  const name = e.TP_DB_NAME;
  if (!/^[A-Za-z0-9_]+$/.test(name || '')) throw new Error('TP_DB_NAME fehlt oder ist ungültig');
  const admin = await mysql.createConnection(e.TP_E2E_ADMIN_HOST
    ? { host: e.TP_E2E_ADMIN_HOST, port: Number(e.TP_E2E_ADMIN_PORT || 3306), user: e.TP_E2E_ADMIN_USER, password: e.TP_E2E_ADMIN_PASS }
    : { socketPath: e.TP_E2E_ADMIN_SOCKET || '/run/mysqld/mysqld.sock', user: e.TP_E2E_ADMIN_USER || 'root', password: e.TP_E2E_ADMIN_PASS || '' });
  await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  for (const host of ['localhost', '127.0.0.1', '%']) { try { await admin.query(`GRANT ALL ON \`${name}\`.* TO ?@?`, [e.TP_DB_USER, host]); } catch (_) { /* Benutzer existiert für diesen Host nicht */ } }
  await admin.end();
  const db = require('../../src/db');
  db.init({ host: e.TP_DB_HOST || '127.0.0.1', port: Number(e.TP_DB_PORT || 3306), user: e.TP_DB_USER, password: e.TP_DB_PASS || '', database: name });
  await require('../../src/db/migrations').migrate(db);
  await db.tx(async (conn) => {
    await require('../../src/install/installer').seed(conn);
    await conn.query("INSERT INTO users (email, username, password_hash, role, email_verified, coins, efs_accrued_at, meta) VALUES (?,?,?,'admin',1,100,?,?)",
      ['admin@e2e.test', 'e2eadmin', await bcrypt.hash('e2e-admin-pass-1', 10), Date.now(), '{}']);
    await conn.query("INSERT INTO settings (`key`, value) VALUES ('installed_at', ?)", [JSON.stringify(new Date().toISOString())]);
    // Testbetrieb: Alterssperren und IP-Sperren lockern (beide Test-Konten kommen von derselben Adresse und sind brandneu)
    const relax = {
      social: { chat: { cooldownSec: 1, minAccountHours: 0 }, messages: { minAccountHours: 0 }, gifts: { minAccountHours: 0, minGameDays: 0, blockSameIp: false }, jobs: { minAccountHours: 0, minGameDays: 0, blockSameIp: false }, couples: { minAccountHours: 0, blockSameIp: false } },
      market: { minGameDays: 0, blockSameIp: false, offerMinPct: 1 },
      exchange: { minGameDays: 0, minValueReal: 100 },
      goods: { contracts: { minAccountHours: 0, blockSameIp: false } },
      elections: { minAccountHours: 0 },
      gericht: { minAccountHours: 0, blockSameIp: false, minGameDays: 0 },
      ruf: { minAccountHours: 0, blockSameIp: false, minIpo: -1 }, // Ansehen: Testkonten sind brandneu und teilen die Adresse; Börsengang ohne Mindestansehen
    };
    for (const [k, v] of Object.entries(relax)) if (v) await conn.query('INSERT INTO settings (`key`, value) VALUES (?, ?)', [k, JSON.stringify(v)]);
  });
  await db.getPool().end();
  console.log('E2E-Datenbank bereit:', name);
})().catch((err) => { console.error(err); process.exit(1); });
