'use strict';
/**
 * Hilfsfunktionen für die E2E-Tests: eigene App-Instanz mit frischer Datenbank, Browser (Playwright) und kleine Spiel-Helfer.
 * Konfiguration per Umgebungsvariablen (alle optional):
 *   TP_E2E_PORT (3290) · TP_E2E_DB_NAME (tp_e2e) · TP_E2E_DB_USER/PASS/HOST (tp/tppass/127.0.0.1) · TP_E2E_ADMIN_* (Zugang zum Anlegen der DB, Standard: root über Socket)
 *   TP_PLAYWRIGHT_PATH (Pfad zum Paket „playwright“) · TP_E2E_HEADED=1 (Browser sichtbar)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..', '..');
const E = process.env;
const PORT = Number(E.TP_E2E_PORT || 3290);
const BASE = `http://127.0.0.1:${PORT}`;
const DBX = { host: E.TP_E2E_DB_HOST || '127.0.0.1', port: Number(E.TP_E2E_DB_PORT || 3306), user: E.TP_E2E_DB_USER || 'tp', password: E.TP_E2E_DB_PASS || 'tppass', database: E.TP_E2E_DB_NAME || 'tp_e2e' };

function loadPlaywright() {
  const tries = [E.TP_PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (_) { /* nächster Versuch */ } }
  throw new Error('Playwright nicht gefunden. Installiere es (npm i -D playwright) oder setze TP_PLAYWRIGHT_PATH.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-e2e-'));
  const env = { ...E, TP_DB_HOST: DBX.host, TP_DB_PORT: String(DBX.port), TP_DB_USER: DBX.user, TP_DB_PASS: DBX.password, TP_DB_NAME: DBX.database, TP_DATA_DIR: dataDir, PORT: String(PORT), TP_API_RATE: '1000000', TP_SITE_URL: BASE, NODE_ENV: 'test' };
  const prep = spawnSync(process.execPath, [path.join(__dirname, 'prepare-db.js')], { env, encoding: 'utf8' });
  if (prep.status !== 0) throw new Error(`Datenbank konnte nicht vorbereitet werden:\n${prep.stdout}\n${prep.stderr}`);
  // config.json im Daten-Ordner, damit die App nicht versehentlich eine andere Installation findet
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ version: 1, siteUrl: BASE, sessionSecret: 'e2e-secret-' + Date.now(), db: DBX }));
  const logFile = path.join(dataDir, 'server.out');
  const out = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', out, out] });
  let exited = false; child.on('exit', () => { exited = true; });
  for (let i = 0; i < 80; i++) {
    if (exited) throw new Error(`Server beendet sich sofort:\n${fs.readFileSync(logFile, 'utf8')}`);
    try { const r = await fetch(`${BASE}/healthz`); if (r.ok) break; } catch (_) { /* noch nicht bereit */ }
    await sleep(250);
  }
  const pool = await mysql.createPool({ ...DBX, connectionLimit: 3, timezone: 'Z' });
  return {
    base: BASE, dataDir, logFile, pool,
    log: () => fs.readFileSync(logFile, 'utf8'),
    sql: async (q, p) => (await pool.query(q, p))[0],
    async stop() { await pool.end().catch(() => {}); child.kill('SIGTERM'); await sleep(300); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* egal */ } },
  };
}

/** Browser-Kontext mit Fehlersammlung (Seitenfehler, Konsolenfehler, fehlgeschlagene Antworten >= 500). */
async function newPlayer(browser, app, label, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: lang === 'en' ? 'en-US' : 'de-DE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[${label}] console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`[${label}] HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.setDefaultTimeout(8000);
  return { label, ctx, page, errors, app };
}

/* ---------------------------- Spiel-Helfer (UI) ---------------------------- */
async function register(pl, { username, email, password }) {
  const { page, app } = pl;
  await page.goto(`${app.base}/register`);
  await page.fill('#username', username); await page.fill('#email', email); await page.fill('#password', password);
  await page.check('input[name=terms]');
  await Promise.all([page.waitForURL('**/play'), page.click('button[type=submit]')]);
  await page.waitForSelector('#fn');
}

async function login(pl, { login: id, password }) {
  const { page, app } = pl;
  await page.goto(`${app.base}/login`);
  await page.fill('#login', id); await page.fill('#password', password);
  await Promise.all([page.waitForURL('**/play'), page.click('button[type=submit]')]);
}

async function logout(pl) {
  await Promise.all([pl.page.waitForURL(`${pl.app.base}/`), pl.page.click('form.logout button')]);
}

/** Charaktererstellung in fünf Schritten; `city` = Anfang des Stadtnamens in der Schnellauswahl, `prof` = Berufsschlüssel (Standard Bäcker). */
async function createCharacter(pl, { first, last, city = 'Berlin', prof = 'baecker', gender = 'm' }) {
  const { page } = pl;
  await page.waitForSelector('#fn');
  await page.check(`input[name=gender][value=${gender}]`, { force: true });
  await page.fill('#fn', first); await page.fill('#ln', last); await page.click('#next');
  await page.click(`#cityList label:has-text("${city}") >> nth=0`); await page.click('#next');
  await page.click(`.prof-choice label:has(input[value="${prof}"])`); await page.click('#next');
  await page.click('#next');
  await page.click('#next');
  await page.waitForSelector('#page');
  await page.waitForSelector('#hud .hud-id');
}

/** Schließt offene Dialoge (z. B. den Bericht nach dem Vorspulen). */
async function closeModals(pl) {
  for (let i = 0; i < 5 && (await pl.page.locator('.modal-backdrop').count()); i++) { await pl.page.keyboard.press('Escape'); await sleep(120); }
}

/** Wartet, bis die Hauptfläche neu aufgebaut wurde (renderPage ersetzt #page) und keine Platzhalter mehr zeigt. */
const pageMarkOld = (pl) => pl.page.evaluate(() => { const p = document.getElementById('page'); if (p) p.__old = true; });
const pageFresh = (pl) => pl.page.waitForFunction(() => { const p = document.getElementById('page'); return p && !p.__old && !p.querySelector('.skel'); });

async function nav(pl, id) {
  await closeModals(pl);
  if (await pl.page.evaluate((x) => location.hash === `#/${x}`, id)) { // schon dort: kein hashchange, also neu laden über Wechsel
    await pl.page.waitForFunction(() => !document.querySelector('#page .skel'));
    return;
  }
  await pageMarkOld(pl);
  await pl.page.click(`#side a[data-nav=${id}]`);
  await pageFresh(pl);
}

/** Tab im Bereich „Spieler“ öffnen. */
async function socialTab(pl, tab) {
  await nav(pl, 'social');
  await pl.page.click(`.soc-tabs [data-tab=${tab}]`);
  await pl.page.waitForSelector(`.soc-tabs [data-tab=${tab}].on`);
  await pl.page.waitForFunction(() => !document.querySelector('#page .skel'));
  await sleep(250);
}

async function toastText(pl) { return pl.page.locator('.toasts .toast').last().innerText().catch(() => ''); }

async function setMoney(app, username, cents) {
  const [u] = await app.sql('SELECT id FROM users WHERE username = ?', [username]);
  await app.sql("UPDATE characters SET state = JSON_SET(state, '$.money', ?), money = ? WHERE user_id = ? AND status = 'alive'", [cents, cents, u.id]);
}
async function userId(app, username) { return (await app.sql('SELECT id FROM users WHERE username = ?', [username]))[0].id; }

/** Direkter API-Aufruf mit der Browser-Sitzung (CSRF-Token aus dem Seitenkopf). */
async function api(pl, method, url, body) {
  return pl.page.evaluate(async ([m, u, b]) => {
    const t = (document.querySelector('meta[name=csrf-token]') || {}).content || '';
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: b ? JSON.stringify(b) : undefined, credentials: 'same-origin' });
    let j = null; try { j = await r.json(); } catch (_) { /* kein JSON */ }
    return { status: r.status, json: j };
  }, [method, url, body]);
}

module.exports = { pageMarkOld, pageFresh, closeModals, ROOT, BASE, PORT, DBX, loadPlaywright, startApp, newPlayer, register, login, logout, createCharacter, nav, socialTab, toastText, setMoney, userId, api, sleep };

module.exports.json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
