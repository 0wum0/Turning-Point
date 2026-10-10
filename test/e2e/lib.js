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

/** Fragt fn() wiederholt ab, bis sie etwas „Wahres“ liefert (z. B. eine Datenbankzeile); wirft mit Beschreibung nach Ablauf. Kein starres Warten. */
async function until(fn, { timeout = 10000, every = 100, what = 'Bedingung' } = {}) {
  const end = Date.now() + timeout; let last;
  for (;;) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    if (Date.now() > end) throw new Error(`Zeitüberschreitung beim Warten auf: ${what}${last instanceof Error ? ` (${last.message})` : ''}`);
    await sleep(every);
  }
}

/** Wartet, bis ein Port frei ist bzw. (frei=false) belegt wird. */
function portFree(port) {
  return new Promise((resolve) => {
    const srv = require('net').createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function startApp() {
  if (!(await portFree(PORT))) throw new Error(`Port ${PORT} ist belegt (läuft noch eine alte Testinstanz?). Setze TP_E2E_PORT auf einen freien Port.`);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-e2e-'));
  const env = { ...E, TP_REP_CACHE_MS: '0', TP_COURT_CACHE_MS: '0', TP_DB_HOST: DBX.host, TP_DB_PORT: String(DBX.port), TP_DB_USER: DBX.user, TP_DB_PASS: DBX.password, TP_DB_NAME: DBX.database, TP_DATA_DIR: dataDir, PORT: String(PORT), TP_API_RATE: '1000000', TP_SITE_URL: BASE, NODE_ENV: 'test' };
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
    async stop() {
      await pool.end().catch(() => {});
      if (!exited) {
        const gone = new Promise((r) => child.once('exit', r));
        child.kill('SIGTERM');
        await Promise.race([gone, sleep(4000)]);
        if (!exited) { child.kill('SIGKILL'); await Promise.race([gone, sleep(2000)]); }
      }
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* egal */ }
    },
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
  await page.fill('#fn', first); await page.fill('#ln', last); await page.locator('#next').click({ timeout: 30000 });
  await page.click(`#cityList label:has-text("${city}") >> nth=0`); await page.locator('#next').click({ timeout: 30000 });
  await page.click(`.prof-choice label:has(input[value="${prof}"])`); await page.locator('#next').click({ timeout: 30000 });
  await page.locator('#next').click({ timeout: 30000 });
  await page.locator('#next').click({ timeout: 30000 });
  await page.waitForSelector('#page');
  await page.waitForSelector('#hud .hud-id');
  await dismissWelcome(pl);
}

/** Schließt den Willkommensdialog des ersten Starts (Überspringen) und wartet, bis er weg und als gesehen gemeldet ist. */
async function dismissWelcome(pl) {
  const { page } = pl;
  const w = page.locator('.modal.welcome');
  try { await w.first().waitFor({ state: 'visible', timeout: 4000 }); } catch (_) { return; } // schon gesehen
  const seen = page.waitForResponse((r) => /\/api\/action\/seen$/.test(r.url()), { timeout: 5000 }).catch(() => null);
  await page.click('.modal.welcome [data-close=skip]');
  await page.locator('.modal.welcome').first().waitFor({ state: 'detached' });
  await seen;
}

/** Schließt offene Dialoge (z. B. den Bericht nach dem Vorspulen) und wartet, bis sie wirklich weg sind. */
async function closeModals(pl) {
  const bd = pl.page.locator('.modal-backdrop');
  for (let i = 0; i < 6 && (await bd.count()); i++) {
    await pl.page.keyboard.press('Escape');
    await bd.first().waitFor({ state: 'detached', timeout: 1500 }).catch(() => {});
  }
}

/** Schaltet „Alle Funktionen anzeigen“ (users.meta.showAll) über die Spiel-Schnittstelle ein und lädt die Seite neu. */
async function showAll(pl, on = true) {
  const r = await api(pl, 'POST', '/api/action/uiPrefs', { showAll: on });
  if (r.status !== 200) throw new Error(`uiPrefs fehlgeschlagen: ${r.status}`);
  await reloadGame(pl);
}

/** Seite neu laden und warten, bis das Spiel (Kopfzeile + Hauptfläche) fertig aufgebaut ist; ein evtl. Willkommensdialog wird geschlossen. */
async function reloadGame(pl) {
  await pl.page.reload();
  try { await pl.page.waitForSelector('#hud .hud-id'); } catch (e) { throw new Error(`${e.message}\nSeite nach dem Neuladen: ${(await pl.page.innerText('body').catch(() => '')).slice(0, 400)}`); }
  await pl.page.waitForFunction(() => document.getElementById('page') && !document.querySelector('#page .skel'));
  await dismissWelcome(pl);
}

/** Wartet, bis die Hauptfläche neu aufgebaut wurde (renderPage ersetzt #page) und keine Platzhalter mehr zeigt. */
const pageMarkOld = (pl) => pl.page.evaluate(() => { const p = document.getElementById('page'); if (p) p.__old = true; });
const pageFresh = (pl) => pl.page.waitForFunction(() => { const p = document.getElementById('page'); return p && !p.__old && !p.querySelector('.skel'); });
/** Wartet, bis die Seite für die Route fertig aufgebaut ist (#page trägt data-route erst nach dem Aufbau, Platzhalter sind weg). */
const pageReady = (pl, id) => pl.page.waitForFunction((x) => { const p = document.getElementById('page'); return p && p.dataset.route === x && !p.__old && !p.querySelector('.skel'); }, id);

async function nav(pl, id) {
  await closeModals(pl);
  const { page } = pl;
  if (await page.evaluate((x) => location.hash === `#/${x}`, id)) {
    await page.waitForFunction((x) => { const p = document.getElementById('page'); return p && p.dataset.route === x && !p.querySelector('.skel'); }, id);
  } else {
    // Die Seitenleiste wird bei jeder Kopfzeilen-Aktualisierung neu aufgebaut; ein Klick kann dabei ins Leere gehen → bis zu dreimal versuchen
    for (let i = 0; i < 3; i++) {
      await pageMarkOld(pl);
      await page.click(`#side a[data-nav=${id}]`);
      try { await page.waitForFunction((x) => location.hash === `#/${x}`, id, { timeout: 2500 }); break; } catch (e) { if (i === 2) throw e; }
    }
    await pageReady(pl, id); // neuer Seiteninhalt (nicht der alte) und keine Platzhalter mehr
  }
  await page.waitForSelector(`#side a.nav.on[data-nav=${id}]`);
}

/** Wie nav, aber mit Prüfung, dass der Bereich nicht gesperrt ist (sonst zeigt die Seite nur die Freischaltungs-Karte). */
async function navOpen(pl, id) {
  await nav(pl, id);
  const locked = await pl.page.locator('#page .lock-card').count();
  if (locked) throw new Error(`Bereich „${id}“ ist gesperrt: ${(await pl.page.innerText('#page')).slice(0, 200)}`);
}

/** Tab im Bereich „Spieler“ öffnen. */
async function socialTab(pl, tab) {
  await nav(pl, 'social');
  if (!(await pl.page.locator(`.soc-tabs [data-tab=${tab}].on`).count())) {
    await pageMarkOld(pl);
    await pl.page.click(`.soc-tabs [data-tab=${tab}]`);
    await pageFresh(pl);
  }
  await pl.page.waitForSelector(`.soc-tabs [data-tab=${tab}].on`);
  await pl.page.waitForFunction(() => !document.querySelector('#page .skel'));
}

/** Reiter in der Zeitung (news, jobs, housing, partners, biz …) öffnen und auf den fertigen Aufbau warten. */
async function paperTab(pl, tab) {
  await nav(pl, 'newspaper');
  const sel = `.paper-tabs [data-tab=${tab}]`;
  if (!(await pl.page.locator(`${sel}.on`).count())) {
    await pageMarkOld(pl);
    await pl.page.click(sel);
    await pageFresh(pl);
  }
  await pl.page.waitForSelector(`${sel}.on`);
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

module.exports = { until, paperTab, dismissWelcome, showAll, reloadGame, navOpen, pageMarkOld, pageFresh, closeModals, ROOT, BASE, PORT, DBX, loadPlaywright, startApp, newPlayer, register, login, logout, createCharacter, nav, socialTab, toastText, setMoney, userId, api, sleep };

module.exports.json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
