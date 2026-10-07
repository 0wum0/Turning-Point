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

function stateApp(code, title, message) {
  const app = express();
  app.use((req, res) => {
    res.status(code).set('Retry-After', '30').type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;background:#0b0d12;color:#efe9db;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:520px;padding:2rem"><h1 style="font-family:Georgia,serif">${title}</h1><p style="color:#aaa597">${message}</p></div></body>`);
  });
  return app;
}

async function boot() {
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
    if (!cfg.sessionSecret) throw new Error('config.json ohne sessionSecret');
    live = require('./src/app').createApp(cfg);
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
root.use((req, res, next) => (live ? live(req, res, next) : installer(req, res, next)));

process.on('unhandledRejection', (e) => log.error('unhandledRejection', e));
process.on('uncaughtException', (e) => log.error('uncaughtException', e));

const port = Number(process.env.PORT) || 3000;
boot().then(() => {
  root.listen(port, () => log.info(`Server lauscht auf Port ${port}`));
});
