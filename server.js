'use strict';
/**
 * TURNING POINT – Einstiegspunkt (Hostinger: „Startdatei“ = server.js).
 * Ist noch nichts installiert, läuft nur der Web-Installer unter /install.
 */
const express = require('express');
const config = require('./src/config');
const db = require('./src/db');
const settings = require('./src/settings');
const log = require('./src/lib/log');
const { migrate } = require('./src/db/migrations');
const { createInstallerApp } = require('./src/install/installer');

const root = express();
root.disable('x-powered-by');
root.set('trust proxy', 1);

let live = null;
let installer = null;
let retryTimer = null;
let needsInstall = false;

function stateApp(code, title, message) {
  const app = express();
  app.use((req, res) => {
    res.status(code).set('Retry-After', '30').type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;background:#0b0d12;color:#efe9db;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:520px;padding:2rem"><h1 style="font-family:Georgia,serif">${title}</h1><p style="color:#aaa597">${message}</p></div></body>`);
  });
  return app;
}

let bootPromise = null;
function boot() {
  if (!bootPromise) bootPromise = doBoot().finally(() => { bootPromise = null; });
  return bootPromise;
}

let bgStarted = false;
async function doBoot() {
  clearTimeout(retryTimer);
  const cfg = config.loadConfig();
  if (!cfg) { live = null; return false; }
  try {
    db.init(cfg.db);
    await db.query('SELECT 1');
    await migrate(db, (m) => log.info('[migrate]', m));
    await settings.load();
    const world = require('./src/game/world');
    world.invalidate();
    await world.load();
    // Noch nicht installiert (z. B. leere Datenbank mit Zugang aus den Umgebungsvariablen) → Installer
    const inst = await db.one("SELECT 1 AS x FROM settings WHERE `key` = 'installed_at'");
    if (!inst) { needsInstall = true; live = null; log.warn('Datenbank enthält noch keine Installation – Installer wird angeboten.'); return false; }
    needsInstall = false;
    // Session-Geheimnis: aus Konfiguration/Umgebung, sonst dauerhaft in der Datenbank (überlebt jedes Redeploy)
    if (!cfg.sessionSecret) {
      const row = await db.one("SELECT value FROM settings WHERE `key` = 'session_secret'");
      if (row) cfg.sessionSecret = JSON.parse(row.value);
      else { cfg.sessionSecret = require('crypto').randomBytes(48).toString('hex'); await db.query("INSERT INTO settings (`key`, value) VALUES ('session_secret', ?)", [JSON.stringify(cfg.sessionSecret)]); }
    }
    live = require('./src/app').createApp(cfg);
    if (!bgStarted) { bgStarted = true; require('./src/lib/anticheat').start(); require('./src/lib/stats').start(); require('./src/lib/social').start(); require('./src/lib/bots').start(); require('./src/lib/market').start(); require('./src/lib/exchange').start(); require('./src/lib/tagesblatt').start(); require('./src/lib/maintenance').start(); }
    log.info(`Turning Point läuft. Daten-Ordner: ${config.paths.dataDir}`);
    return true;
  } catch (e) {
    log.error('Start fehlgeschlagen:', e);
    live = stateApp(503, 'Datenbank nicht erreichbar', 'Turning Point kann gerade keine Verbindung zur Datenbank herstellen. Die Seite versucht es automatisch erneut.');
    retryTimer = setTimeout(() => boot(), 20000);
    return false;
  }
}

installer = createInstallerApp({ onInstalled: boot });
// Selbstheilung: Ist im Installer-Modus plötzlich eine Konfiguration da (z. B. von einem anderen Prozess
// installiert oder nach einem Neustart wieder auffindbar), wird sofort in die Live-App gewechselt.
let lastCheck = 0;
root.use(async (req, res, next) => {
  try {
    if (!live && !needsInstall && Date.now() - lastCheck > 1500) {
      lastCheck = Date.now();
      config.resetResolve();
      if (config.loadConfig()) await boot();
    } else if (!live && bootPromise) await bootPromise;
  } catch (e) { log.error('Selbstheilung fehlgeschlagen', e); }
  return live ? live(req, res, next) : installer(req, res, next);
});

process.on('unhandledRejection', (e) => log.error('unhandledRejection', e));
process.on('uncaughtException', (e) => log.error('uncaughtException', e));

const port = Number(process.env.PORT) || 3000;
boot().then(() => {
  root.listen(port, () => log.info(`Server lauscht auf Port ${port}`));
});
