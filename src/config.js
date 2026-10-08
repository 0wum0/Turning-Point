'use strict';
/**
 * Pfad- und Konfigurationslogik.
 *
 * HOSTINGER-WICHTIG: Bei Hostinger-Node.js-Apps wird der App-Ordner bei jedem
 * Deploy/Redeploy neu aufgebaut. Alles, was dauerhaft bleiben muss (config.json,
 * Uploads/Bilder, Logs, Install-Lock), liegt deshalb in einem DATEN-ORDNER
 * ausserhalb der App:
 *
 *   /home/uXXXX/domains/deine-domain.de/
 *       ├── nodejs/                 <- App (wird beim Deploy ersetzt)
 *       ├── public_html/            <- Hostinger Web-Root
 *       └── turning-point-data/     <- DATEN (bleibt bei Deploy erhalten)
 *             ├── config.json
 *             ├── install.lock
 *             ├── uploads/
 *             └── logs/
 *
 * Reihenfolge der Suche: TP_DATA_DIR (Umgebungsvariable) → ../turning-point-data
 * → ~/turning-point-data → ./data (nur Notnagel, wird mit dem App-Ordner gelöscht!)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');

function candidates() {
  const list = [];
  if (process.env.TP_DATA_DIR) list.push({ dir: path.resolve(process.env.TP_DATA_DIR), why: 'TP_DATA_DIR' });
  list.push({ dir: path.resolve(APP_ROOT, '..', 'turning-point-data'), why: 'neben dem App-Ordner (empfohlen)' });
  list.push({ dir: path.join(os.homedir(), 'turning-point-data'), why: 'Home-Verzeichnis' });
  list.push({ dir: path.join(APP_ROOT, 'data'), why: 'NOTFALL: innerhalb der App (geht beim Redeploy verloren!)', volatile: true });
  return list;
}

function isWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.probe-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch (_) {
    return false;
  }
}

let resolved = null;
function resolveDataDir() {
  if (resolved) return resolved;
  const list = candidates();
  // 1) vorhandene Installation wiederfinden
  for (const c of list) {
    if (fs.existsSync(path.join(c.dir, 'config.json'))) {
      resolved = { ...c, writable: isWritableDir(c.dir) };
      return resolved;
    }
  }
  // 2) erstes beschreibbares Verzeichnis
  for (const c of list) {
    if (isWritableDir(c.dir)) {
      resolved = { ...c, writable: true };
      return resolved;
    }
  }
  resolved = { ...list[0], writable: false };
  return resolved;
}

function resetResolve() { resolved = null; }

const paths = {
  get appRoot() { return APP_ROOT; },
  get dataDir() { return resolveDataDir().dir; },
  get configFile() { return path.join(resolveDataDir().dir, 'config.json'); },
  get lockFile() { return path.join(resolveDataDir().dir, 'install.lock'); },
  get uploadsDir() { return path.join(resolveDataDir().dir, 'uploads'); },
  get logsDir() { return path.join(resolveDataDir().dir, 'logs'); },
};

function ensureDirs() {
  for (const d of [paths.dataDir, paths.uploadsDir, paths.logsDir, path.join(paths.uploadsDir, 'cities'), path.join(paths.uploadsDir, 'misc')]) {
    fs.mkdirSync(d, { recursive: true, mode: 0o700 }); // nur der App-Benutzer: hier liegen Zugangsdaten und Uploads
  }
}

function envConfig() {
  const e = process.env;
  if (!e.TP_DB_NAME || !e.TP_DB_USER) return null;
  return {
    db: { host: e.TP_DB_HOST || 'localhost', port: Number(e.TP_DB_PORT || 3306), user: e.TP_DB_USER, password: e.TP_DB_PASS || '', database: e.TP_DB_NAME },
    sessionSecret: e.TP_SESSION_SECRET || null,
    siteUrl: e.TP_SITE_URL || null,
    fromEnv: true,
  };
}

/**
 * Umgebungsvariablen (Hostinger → Node.js-App → Environment variables) überleben jedes Redeploy.
 * Sind TP_DB_* gesetzt, haben sie Vorrang vor der config.json – dann ist nie wieder eine Neuinstallation nötig.
 */
function loadConfig() {
  let file = null;
  try { file = JSON.parse(fs.readFileSync(paths.configFile, 'utf8')); } catch (_) { /* keine Datei */ }
  const env = envConfig();
  if (env) return { ...(file || {}), ...env, sessionSecret: env.sessionSecret || (file && file.sessionSecret) || null, siteUrl: env.siteUrl || (file && file.siteUrl) || null };
  return file;
}
const envDb = () => { const e = envConfig(); return e ? e.db : null; };

function writeAtomic(file, cfg) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch (_) { /* Dateisystem ohne Rechte */ }
  fs.renameSync(tmp, file);
}

/**
 * Speichert die Konfiguration im Daten-Ordner UND – als Sicherheitsnetz – als Kopie in jedem weiteren
 * beschreibbaren, nicht flüchtigen Kandidaten-Ordner. So findet die App ihre Konfiguration auch dann
 * wieder, wenn ein Ordner (z. B. nach einem Redeploy) verschwindet.
 */
function saveConfig(cfg) {
  ensureDirs();
  writeAtomic(paths.configFile, cfg);
  for (const c of candidates()) {
    if (c.volatile || path.resolve(c.dir) === path.resolve(paths.dataDir)) continue;
    try { if (isWritableDir(c.dir)) writeAtomic(path.join(c.dir, 'config.json'), cfg); } catch (_) { /* Kopie ist optional */ }
  }
}

module.exports = { envDb, resetResolve, paths, resolveDataDir, ensureDirs, loadConfig, saveConfig, isWritableDir, candidates, APP_ROOT };
