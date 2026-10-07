'use strict';
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const db = require('../db');
const { migrate } = require('../db/migrations');
const { CITIES, PROFESSIONS } = require('../db/seed-data');
const settings = require('../settings');
const log = require('../lib/log');

const REQUIRED_NODE = 18;

function systemCheck() {
  const dir = config.resolveDataDir();
  const checks = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ id: 'node', label: 'Node.js-Version', ok: major >= REQUIRED_NODE, detail: `v${process.versions.node} (benötigt ≥ ${REQUIRED_NODE})` });
  checks.push({ id: 'datadir', label: 'Daten-Ordner (außerhalb der App)', ok: dir.writable, detail: `${dir.dir} – ${dir.why}` });
  checks.push({ id: 'volatile', label: 'Daten überleben Redeploy', ok: !dir.volatile, warn: !!dir.volatile, detail: dir.volatile ? 'Der Ordner liegt in der App und würde beim Redeploy gelöscht. Setze die Umgebungsvariable TP_DATA_DIR auf einen Ordner außerhalb der App.' : 'Ja – der Ordner liegt außerhalb des Node.js-App-Ordners.' });
  checks.push({ id: 'appdir', label: 'App-Ordner', ok: true, detail: config.APP_ROOT });
  checks.push({ id: 'mem', label: 'Arbeitsspeicher', ok: true, detail: `${Math.round(os.totalmem() / 1048576)} MB gesamt, ${Math.round(os.freemem() / 1048576)} MB frei` });
  checks.push({ id: 'env', label: 'Installationsschutz', ok: true, warn: !process.env.TP_INSTALL_KEY, detail: process.env.TP_INSTALL_KEY ? 'TP_INSTALL_KEY ist gesetzt – der Installer ist geschützt.' : 'Empfehlung: Setze vor dem ersten Aufruf die Umgebungsvariable TP_INSTALL_KEY, damit niemand sonst die Installation ausführen kann.' });
  return { checks, ok: checks.every((c) => c.ok), needsKey: !!process.env.TP_INSTALL_KEY, dataDir: dir.dir };
}

function keyOk(req) {
  const need = process.env.TP_INSTALL_KEY;
  if (!need) return true;
  const got = String((req.body && req.body.installKey) || req.get('x-install-key') || '');
  const a = Buffer.from(got); const b = Buffer.from(need);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cleanDb(b) {
  const d = {
    host: String(b.host || 'localhost').trim(), port: Number(b.port) || 3306, user: String(b.user || '').trim(),
    password: String(b.password || ''), database: String(b.database || '').trim(),
  };
  if (!d.host || !d.user || !d.database) throw new Error('Bitte Host, Benutzer und Datenbankname angeben.');
  return d;
}

async function seed(conn) {
  for (const c of CITIES) {
    await conn.query('INSERT IGNORE INTO cities (slug, name, state, lat, lon, size_tier, price_factor, description) VALUES (?,?,?,?,?,?,?,?)', [c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]);
  }
  for (const p of PROFESSIONS) {
    await conn.query(
      'INSERT IGNORE INTO professions (pkey, name, category, icon, era_from, era_to, base_wage, training_days, tuition_day, academic, replaces, lodging, unlocks, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', p,
    );
  }
}

async function runInstall(body, publicOrigin) {
  const steps = [];
  const step = (m) => { steps.push(m); log.info('[install]', m); };
  const dbCfg = cleanDb(body.db || {});
  const site = {
    name: String((body.site && body.site.name) || 'Turning Point').trim().slice(0, 60) || 'Turning Point',
    url: String((body.site && body.site.url) || publicOrigin || '').trim().replace(/\/$/, ''),
  };
  const adm = body.admin || {};
  const email = String(adm.email || '').trim().toLowerCase();
  const username = String(adm.username || '').trim();
  const password = String(adm.password || '');

  const info = await db.testConnection(dbCfg);
  step(`Datenbank verbunden (${info.version}).`);
  const reconnect = info.installed;
  if (!reconnect) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Bitte eine gültige Admin-E-Mail angeben.');
    if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(username)) throw new Error('Benutzername: 3–24 Zeichen (Buchstaben, Zahlen, _ . -).');
    if (password.length < 10) throw new Error('Das Admin-Passwort braucht mindestens 10 Zeichen.');
  }
  const dir = config.resolveDataDir();
  if (!dir.writable) throw new Error(`Der Daten-Ordner ist nicht beschreibbar: ${dir.dir}`);
  config.ensureDirs();
  step(`Daten-Ordner bereit: ${dir.dir}`);

  db.init(dbCfg);
  const applied = await migrate(db, step);
  step(`Datenbank-Schema aktuell (${applied} neue Migration(en)).`);

  if (!reconnect) {
    await db.tx(async (conn) => {
      await seed(conn);
      step(`Startdaten geladen: ${CITIES.length} Städte, ${PROFESSIONS.length} Berufe.`);
      const hash = await bcrypt.hash(password, 11);
      await conn.query(
        "INSERT INTO users (email, username, password_hash, role, email_verified, coins, efs_accrued_at, meta) VALUES (?,?,?,'admin',1,?,?,?)",
        [email, username, hash, 100, Date.now(), JSON.stringify({})],
      );
      step(`Admin-Konto „${username}“ angelegt.`);
      await conn.query("INSERT INTO settings (`key`, value) VALUES ('site.name', ?), ('installed_at', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [JSON.stringify(site.name), JSON.stringify(new Date().toISOString())]);
    });
  } else {
    step('Bestehende Installation erkannt – es werden keine Daten verändert (Wiederverbindung).');
  }
  const cfg = { version: 1, installedAt: new Date().toISOString(), siteUrl: site.url, sessionSecret: crypto.randomBytes(48).toString('hex'), db: dbCfg };
  config.saveConfig(cfg);
  step('Konfiguration gespeichert (außerhalb der App).');
  fs.writeFileSync(config.paths.lockFile, `installed ${new Date().toISOString()}\n`);
  return { steps, reconnect, adminLogin: reconnect ? null : username };
}

function createInstallerApp({ onInstalled }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(config.APP_ROOT, 'views'));
  app.locals.icon = (n, c = '') => `<svg class="i ${c}" aria-hidden="true"><use href="/img/icons.svg#i-${n}"/></svg>`;
  app.use(express.static(require('path').join(config.APP_ROOT, 'public'), { maxAge: '1h' }));
  app.use(express.json({ limit: '50kb' }));
  const limiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
  app.use('/install/api', limiter);
  let busy = false;

  app.get('/install', (req, res) => {
    res.render('install/index', { title: 'Installation', needsKey: !!process.env.TP_INSTALL_KEY, origin: `${req.protocol}://${req.get('host')}`, assetV: 1, era: 1 });
  });
  app.get('/install/api/check', (req, res) => res.json(systemCheck()));
  app.post('/install/api/db-test', async (req, res) => {
    if (!keyOk(req)) return res.status(403).json({ ok: false, error: 'Falscher Installationsschlüssel.' });
    try {
      const info = await db.testConnection(cleanDb(req.body.db || {}));
      res.json({ ok: true, version: info.version, tables: info.tables.length, installed: info.installed, hasAdmin: info.hasAdmin });
    } catch (e) {
      res.json({ ok: false, error: friendlyDbError(e) });
    }
  });
  app.post('/install/api/run', async (req, res) => {
    if (!keyOk(req)) return res.status(403).json({ ok: false, error: 'Falscher Installationsschlüssel.' });
    if (busy) return res.status(409).json({ ok: false, error: 'Die Installation läuft bereits.' });
    busy = true;
    try {
      const out = await runInstall(req.body, `${req.protocol}://${req.get('host')}`);
      res.json({ ok: true, ...out });
      setTimeout(() => onInstalled().catch((e) => log.error('Boot nach Installation fehlgeschlagen', e)), 300);
    } catch (e) {
      log.error('[install] Fehler', e);
      res.json({ ok: false, error: friendlyDbError(e) });
    } finally { busy = false; }
  });
  app.get('/', (req, res) => res.redirect('/install'));
  app.use((req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/install/api')) return res.status(503).json({ ok: false, error: 'Nicht installiert.' });
    res.redirect('/install');
  });
  return app;
}

function friendlyDbError(e) {
  const m = e && e.message ? e.message : String(e);
  if (e && e.code === 'ER_ACCESS_DENIED_ERROR') return 'Zugriff verweigert: Benutzername oder Passwort der Datenbank stimmt nicht.';
  if (e && e.code === 'ER_BAD_DB_ERROR') return 'Die Datenbank existiert nicht. Lege sie zuerst im Hostinger-Panel an (Datenbanken → MySQL).';
  if (e && (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT')) return `Der Datenbankserver ist nicht erreichbar (${e.code}). Bei Hostinger meist Host „localhost“ oder 127.0.0.1.`;
  return m;
}

module.exports = { createInstallerApp, systemCheck };
