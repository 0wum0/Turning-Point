'use strict';
/**
 * Sicherheits-Härtung (zweiter Durchgang): Rechteprüfung, Passwort-/Token-Regeln, Redirect-/SSRF-/Header-Schutz,
 * Webhook-Signaturen, Verbindungs-Limits. Alles ohne Datenbank (Datenbankzugriffe werden bei Bedarf durch Attrappen ersetzt).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const express = require('express');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sec = require('../src/lib/security');
const roles = require('../src/lib/roles');

/** Kleiner HTTP-Helfer: App auf zufälligem Port starten, Anfrage senden, Server wieder schliessen. */
async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); } finally { await new Promise((r) => server.close(r)); }
}

/* ------------------------------------------------------------------ Rechte (Admin) */

test('Rollen: Sperrliste des Co-Admins ist nicht durch Gross-/Kleinschreibung, Schrägstriche oder %-Kodierung zu umgehen', () => {
  // Express routet „/System“, „/users/5/impersonate/“ usw. auf dieselben Handler – die Prüfung muss das genauso sehen.
  for (const p of ['/system', '/System', '/SYSTEM/', '/backup/download', '/Backup/Download', '/tools', '/Tools/grant', '/settings/payments', '/settings/Payments/', '/settings/MAIL/test', '/settings/expert',
    '/users/5/impersonate', '/users/5/impersonate/', '/users/5/IMPERSONATE', '/users/5/role/', '/users/5/password/', '/users/5/Password', '/%73ystem', '/users/5/%70assword', '/users//5/role', '//backup']) {
    assert.strictEqual(roles.can('coadmin', 'POST', p), false, `Co-Admin darf ${p} nicht`);
  }
  for (const p of ['/', '/users', '/users/5/edit', '/users/5/ban/', '/settings/site', '/community', '/finance']) assert.strictEqual(roles.can('coadmin', 'GET', p), true, p);
  assert.strictEqual(roles.can('admin', 'POST', '/System'), true);
  assert.strictEqual(roles.can('player', 'GET', '/'), false);
  assert.strictEqual(roles.can('coadmin', 'GET', '/%zz'), false, 'kaputte Kodierung wird abgelehnt');
});

test('Rollen: Moderator darf nur die freigegebenen Pfade (auch mit Schrägstrich/Grossschreibung)', () => {
  assert.ok(roles.can('moderator', 'POST', '/users/5/ban/'));
  assert.ok(roles.can('moderator', 'POST', '/Users/5/Kick'));
  assert.ok(!roles.can('moderator', 'POST', '/users/bulk'));
  assert.ok(!roles.can('moderator', 'POST', '/users/5/edit'));
  assert.ok(!roles.can('moderator', 'POST', '/users/5/reset-character'));
  assert.ok(!roles.can('moderator', 'GET', '/Settings/site'));
  assert.ok(!roles.can('moderator', 'GET', '/backup'));
});

test('Rollen: Ziel-Konto jeder Admin-Aktion wird erkannt (auch reset-character, Anti-Cheat, Community, Charaktere)', () => {
  assert.deepStrictEqual(roles.targetOf('/users/5/reset-character'), { kind: 'user', id: 5 });
  assert.deepStrictEqual(roles.targetOf('/Users/5/impersonate/'), { kind: 'user', id: 5 });
  assert.deepStrictEqual(roles.targetOf('/anticheat/user/7/ban'), { kind: 'user', id: 7 });
  assert.deepStrictEqual(roles.targetOf('/community/user/8/mute'), { kind: 'user', id: 8 });
  assert.deepStrictEqual(roles.targetOf('/characters/9/raw'), { kind: 'char', id: 9 });
  assert.strictEqual(roles.targetOf('/users/bulk'), null);
  assert.strictEqual(roles.targetOf('/settings/site'), null);
  // Die Rangprüfung hängt vor allen Admin-Routen und lehnt bei Fehlern ab (kein „fail open“)
  const a = read('src/routes/admin.js');
  assert.match(a, /roles\.targetOf\(req\.path\)/);
  assert.match(a, /catch \(e\) \{ return next\(e\); \}/);
  assert.ok(a.indexOf('roles.targetOf') < a.indexOf("require('./admin-players')"));
  // Sammelaktionen filtern nach Rang, Passwörter setzt nur der Admin
  const pl = read('src/routes/admin-players.js');
  assert.match(pl, /roles\.rank\(r\.role\) < roles\.rank\(req\.user\.role\)/);
  assert.match(pl, /req\.user\.role !== 'admin'\) throw new Error\('Passwörter setzt nur der Admin/);
});

test('Einstellungen: Geheimnisse ändert nur der Admin; iframe-/Offerwall-Adressen nur https', () => {
  const a = read('src/routes/admin.js');
  assert.match(a, /type === 'secret'\) \{\s*if \(req\.user\.role !== 'admin'\) continue;/);
  assert.match(a, /URL_KEYS/); assert.match(a, /nur https:\/\/-Adressen erlaubt/);
  const re = /^https:\/\/[^\s<>"']+$/i;
  assert.ok(re.test('https://ads.example.com/frame?uid={uid}'.replace('{uid}', '0')));
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://x.de', 'https://a b', 'https://x"onload=']) assert.ok(!re.test(bad), bad);
});

/* ------------------------------------------------------------------ Sitzungen */

test('Sitzungs-Muster treffen genau ein Konto (5 ≠ 50 ≠ 500)', () => {
  const { userSessionPatterns } = require('../src/lib/session-store');
  const like = (pat) => new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`);
  const pats = userSessionPatterns(5).map(like);
  const hit = (json) => pats.some((r) => r.test(json));
  assert.ok(hit('{"cookie":{},"csrf":"x","userId":5,"born":1}'));
  assert.ok(hit('{"cookie":{},"userId":5}'));
  assert.ok(!hit('{"cookie":{},"userId":50,"born":1}'));
  assert.ok(!hit('{"cookie":{},"userId":500}'));
  assert.deepStrictEqual(userSessionPatterns('5; DROP TABLE'), []);
  assert.deepStrictEqual(userSessionPatterns(-1), []);
  // Alle Stellen benutzen den Helfer statt eines eigenen LIKE
  for (const f of ['src/routes/admin.js', 'src/routes/admin-players.js', 'src/routes/admin-insights.js', 'src/lib/anticheat.js', 'src/routes/auth.js', 'src/routes/account.js']) assert.ok(!/LIKE \?'?, \[`%"userId":\$\{/.test(read(f)), f);
});

test('Sitzung: absolute Höchstdauer, neue Sitzungs-ID bei Anmeldung, Abmelden zerstört die Sitzung', () => {
  const app = read('src/app.js'); const auth = read('src/routes/auth.js');
  assert.match(app, /SESSION_MAX_AGE_MS/);
  assert.match(auth, /req\.session\.regenerate/);
  assert.match(auth, /router\.post\('\/logout', \(req, res\) => \{ req\.session\.destroy/);
  assert.match(auth, /killUserSessions\(u\.id\)/, 'nach Passwort-Reset alle Sitzungen beenden');
  assert.match(read('src/routes/account.js'), /killUserSessions\(u\.id, req\.sessionID\)/, 'nach Passwortwechsel andere Geräte abmelden');
});

/* ------------------------------------------------------------------ CSRF / Sessions-Tabelle */

test('CSRF: anonyme Besucher erzeugen nur auf Formularseiten eine Sitzung; POST ohne Sitzungs-Token wird abgelehnt', () => {
  const run = (req) => { const res = { locals: {}, code: null, status(c) { this.code = c; return this; }, json() { return this; }, render() { return this; } }; let n = false; sec.csrf({ method: 'GET', path: '/', get: () => undefined, body: {}, query: {}, session: {}, ...req }, res, () => { n = true; }); return { n, res, req }; };
  const home = { method: 'GET', path: '/', session: {} }; run(home);
  assert.strictEqual(home.session.csrf, undefined, 'Startseite legt keine Sitzung an');
  const tp = { method: 'GET', path: '/tagesblatt.json', session: {} }; run(tp); assert.strictEqual(tp.session.csrf, undefined);
  const login = { method: 'GET', path: '/login', session: {} }; run(login); assert.match(login.session.csrf, /^[a-f0-9]{48}$/);
  const reset = { method: 'GET', path: '/reset/abc', session: {} }; run(reset); assert.ok(reset.session.csrf);
  const user = { method: 'GET', path: '/play', session: { userId: 3 } }; run(user); assert.ok(user.session.csrf);
  const post = { method: 'POST', path: '/login', session: {}, body: { _csrf: '' } }; assert.strictEqual(run(post).n, false);
  assert.strictEqual(post.session.csrf, undefined, 'POST erzeugt kein Token');
  const empty = { method: 'POST', path: '/x', session: { csrf: 'a'.repeat(48) }, body: { _csrf: undefined } }; assert.strictEqual(run(empty).n, false);
});

/* ------------------------------------------------------------------ Redirects, E-Mail, Tokens, Logs */

test('Offene Weiterleitung: nur relative Pfade der eigenen Seite', () => {
  for (const ok of ['/play', '/account', '/admin/users?page=2', '/play#/shop', '/a/b.c-d_e?x=1&y=%20']) assert.strictEqual(sec.safePath(ok, '/'), ok, ok);
  for (const bad of ['//evil.com', '/\\evil.com', '/\\\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/\t/evil.com', '/a\nb', '', null, undefined, 5, {}, '/' + 'a'.repeat(400)]) assert.strictEqual(sec.safePath(bad, '/x'), '/x', String(bad).slice(0, 30));
  const i18n = read('src/i18n.js'); assert.match(i18n, /safePath\(req\.query\.next/);
  assert.match(read('src/routes/auth.js'), /function safeNext\(n\) \{ return safePath\(n, '\/play'\); \}/);
});

test('E-Mail-Adressen: genau eine Adresse – keine Listen, Anführungszeichen, Zeilenumbrüche', () => {
  for (const ok of ['anna@example.com', 'a.b+c@sub.example.org', 'müller@bücher.de', 'x_y-z@mail.co.uk']) assert.ok(sec.isEmail(ok), ok);
  for (const bad of ['a@b.de,c@d.de', 'a@b.de;c@d.de', 'a@b.de c@d.de', '"a"@b.de', 'a@b.de\nBcc: x@y.de', 'a@b', 'a@@b.de', '<a@b.de>', 'a@b.d', '@b.de', 'a@.de', 'a b@c.de', 'a'.repeat(70) + '@b.de', 'x@' + 'b'.repeat(200) + '.de', null, undefined, 5]) assert.ok(!sec.isEmail(bad), String(bad).slice(0, 40));
  const mailer = read('src/lib/mailer.js'); assert.match(mailer, /isEmail\(to\)/);
  assert.match(mailer, /replace\(\/\[\\r\\n\]\+\/g/);
});

test('Mailer lehnt ungültige Empfänger ab, bevor irgendetwas gesendet wird', async () => {
  const { send } = require('../src/lib/mailer');
  await assert.rejects(() => send({ to: 'a@b.de,evil@x.de', subject: 's', text: 't' }), /Ungültige Empfängeradresse/);
  await assert.rejects(() => send({ to: 'a@b.de\r\nBcc: evil@x.de', subject: 's', text: 't' }), /Ungültige Empfängeradresse/);
});

test('Einmal-Token: nur Hash in der DB, strenges Format, Reset ist atomar und einmalig', () => {
  const t = sec.randomToken(32);
  assert.match(t, /^[a-f0-9]{64}$/); assert.match(sec.hashToken(t), /^[a-f0-9]{64}$/); assert.notStrictEqual(sec.hashToken(t), t);
  assert.strictEqual(sec.hashToken(t), sec.hashToken(t));
  assert.ok(sec.TOKEN_RE.test(t)); for (const bad of ['', 'zz', "' OR 1=1 --", 'A'.repeat(64), t + 'x'.repeat(200)]) assert.ok(!sec.TOKEN_RE.test(bad), bad);
  const a = read('src/routes/auth.js');
  assert.match(a, /\[hashToken\(token\), u\.id\]/, 'Reset-Token wird gehasht gespeichert');
  assert.match(a, /token \? hashToken\(token\) : null/, 'Bestätigungs-Token wird gehasht gespeichert');
  assert.match(a, /UPDATE users SET password_hash = \?, reset_token = NULL, reset_expires = NULL WHERE id = \? AND reset_token = \? AND reset_expires > NOW\(\)/);
  assert.ok(!/IN \(\?, \?\)/.test(a), 'kein Klartext-Fallback: sonst wäre der gespeicherte Hash selbst als Token verwendbar');
  assert.match(read('server.js'), /hashLegacyTokens\(\)/); assert.match(read('src/lib/account.js'), /SHA2\(verify_token, 256\)/);
  assert.match(a, /INTERVAL 1 HOUR/);
});

test('Passwort-Regeln für neue Passwörter', () => {
  const pw = require('../src/lib/password');
  assert.strictEqual(pw.validate('korrekt-pferd-batterie', { username: 'anna' }), null);
  assert.match(pw.validate('kurz1234'), /mindestens 10/);
  assert.match(pw.validate('a'.repeat(80)), /zu lang/);
  assert.match(pw.validate('ä'.repeat(40)), /zu lang/, 'Bytes, nicht Zeichen (bcrypt schneidet bei 72 Bytes ab)');
  assert.match(pw.validate('1234567890'), /verbreitet/); assert.match(pw.validate('Passwort123'), /verbreitet/);
  assert.match(pw.validate('xxxxxxxxxxxx'), /wiederholten/);
  assert.match(pw.validate('MeinNameIstAnnaMeier99', { username: 'AnnaMeier99' }), /Spielernamen/);
  assert.match(pw.validate(undefined), /Passwort/); assert.match(pw.validate({ a: 1 }), /Passwort/);
  const a = read('src/routes/auth.js'); assert.match(a, /passwordPolicy\.validate\(pw, \{ username, email \}\)/);
  assert.match(read('src/routes/account.js'), /passwordPolicy\.validate/); assert.match(read('src/routes/admin-players.js'), /passwordPolicy\.validate/); assert.match(read('src/install/installer.js'), /passwordPolicy\.validate/);
});

test('Login: Eingaben begrenzt, Bremse je Konto+Adresse und je Konto gesamt, Passwort-Mails je Adresse gedrosselt', () => {
  const a = read('src/routes/auth.js');
  assert.match(a, /MAX_PW_INPUT = 200/); assert.match(a, /acct:\$\{[^}]+\}\|\$\{req\.ip\}/); assert.match(a, /accountTotalLimiter/); assert.match(a, /forgotMailLimiter/);
  assert.match(a, /router\.post\('\/forgot', authLimiter, forgotMailLimiter/);
  assert.match(a, /DUMMY_HASH/);
});

test('Protokolle: Zugangsdaten in URLs werden unkenntlich gemacht, Steuerzeichen entfernt, Länge begrenzt', () => {
  const t = 'a'.repeat(64);
  assert.strictEqual(sec.redactUrl(`/reset/${t}`), '/reset/[token]');
  assert.strictEqual(sec.redactUrl(`/verify/${t}?x=1`), '/verify/[token]?x=1');
  assert.match(sec.redactUrl('/webhooks/offerwall?uid=1&coins=5&txid=9&sig=deadbeef'), /sig=\[x\]$/);
  assert.match(sec.redactUrl('/x?password=geheim&a=1'), /password=\[x\]&a=1/);
  assert.ok(sec.redactUrl('/' + 'a'.repeat(1000)).length <= 300);
  assert.strictEqual(sec.logSafe('a\r\nFAKE [error] zeile\u2028x'), 'a FAKE [error] zeile x');
  assert.ok(sec.logSafe('x'.repeat(5000), 500).length === 500);
  // log.js scrubbt zusätzlich alles, was geschrieben wird
  assert.match(read('src/lib/log.js'), /scrub\(msg\)/);
  assert.match(read('src/app.js'), /redactUrl\(req\.originalUrl\)/);
  assert.match(read('src/lib/audit.js'), /logSafe\(/);
});

test('Basis-Adresse für Links in Mails kommt aus der Konfiguration, nicht aus dem Host-Header', () => {
  const req = (host, proto = 'http') => ({ protocol: proto, get: (h) => (h === 'host' ? host : undefined) });
  assert.strictEqual(sec.baseUrl(req('evil.example'), { siteUrl: 'https://spiel.de/' }), 'https://spiel.de');
  assert.strictEqual(sec.baseUrl(req('evil.example'), { siteUrl: 'javascript:alert(1)' }), 'http://evil.example', 'ungültige siteUrl → Notnagel mit geprüftem Host');
  assert.strictEqual(sec.baseUrl(req('a.b:3000'), {}), 'http://a.b:3000');
  assert.strictEqual(sec.baseUrl(req('evil.example/\r\nX: y'), {}), 'http://localhost', 'Host mit Sonderzeichen wird verworfen');
  assert.strictEqual(sec.baseUrl(req('x.de', 'https'), null), 'https://x.de');
  assert.match(read('src/routes/api.js'), /baseUrl\(req, config\.loadConfig\(\)\)/);
});

test('LIKE-Muster aus Nutzereingaben: % und _ werden wörtlich genommen', () => {
  assert.strictEqual(sec.escapeLike('50%_off\\'), '50\\%\\_off\\\\');
  assert.match(read('src/lib/social.js'), /escapeLike\(String\(q\)/);
});

/* ------------------------------------------------------------------ SQL */

test('Datenbank: Arrays/Objekte als Parameter werden abgelehnt (keine Objekt-Injektion über JSON-Bodies)', () => {
  const { checkParams } = require('../src/db');
  assert.doesNotThrow(() => checkParams([1, 'a', null, undefined, true, 5n, new Date(), Buffer.from('x')]));
  assert.doesNotThrow(() => checkParams(undefined)); assert.doesNotThrow(() => checkParams(7));
  for (const bad of [[{ a: 1 }], [[1, 2]], [{ toString() { return 'x'; } }], { a: 1 }, [() => 1], [Symbol('x')]]) assert.throws(() => checkParams(bad), /nur Skalare/);
  const db = read('src/db.js');
  assert.strictEqual((db.match(/conn\.query\(sql, checkParams\(params\)\)|getPool\(\)\.query\(sql, checkParams\(params\)\)/g) || []).length, 3, 'query + tx.query + tx.one');
});

test('SQL: keine Nutzereingabe wird in Abfragetext eingesetzt – nur Whitelists und feste Fragmente', () => {
  // Sortierung/Spalten kommen aus Objekt-Whitelists, nicht aus Eingaben
  const pl = read('src/routes/admin-players.js');
  assert.match(pl, /const order = \{ coins:[^}]+\}\[sort\] \|\| 'u\.id DESC'/); assert.match(pl, /const order = \{ money:[^}]+\}\[sort\] \|\| 'c\.id DESC'/);
  assert.match(read('src/lib/social.js'), /hasOwnProperty\.call\(CATS, cat\)/);
  // Tabellennamen im Markt: feste Zuordnung nach kind
  assert.match(read('src/lib/market.js'), /const t = kind === 'prop' \? \['player_props', 'prop_id'\] : \['player_firms', 'company_id'\]; if \(!\['prop', 'firm'\]\.includes\(kind\)\)/);
  // LIMIT/OFFSET sind immer Platzhalter, ausser maintenance (geklemmte Zahl)
  assert.match(read('src/lib/maintenance.js'), /Math\.min\(Number\(cfg\.batch\) \|\| 2000, 20000\)/);
  assert.match(read('src/lib/tagesblatt.js'), /Math\.min\(100, Math\.max\(1, limit\)\)/);
});

/* ------------------------------------------------------------------ HTTP-Härtung */

test('IP-Erkennung hinter dem Proxy: vorangestellte X-Forwarded-For-Einträge des Clients werden ignoriert', async () => {
  const net = require('../src/lib/net');
  assert.strictEqual(net.trustProxySetting(undefined), 1); assert.strictEqual(net.trustProxySetting(''), 1);
  assert.strictEqual(net.trustProxySetting('2'), 2); assert.strictEqual(net.trustProxySetting('0'), 0); assert.strictEqual(net.trustProxySetting('false'), 0);
  assert.strictEqual(net.trustProxySetting('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8'); assert.strictEqual(net.trustProxySetting('99'), 10);
  const app = express(); app.set('trust proxy', net.trustProxySetting(undefined));
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  await withServer(app, async (base) => {
    // Der Proxy (hier simuliert) hängt die echte Client-Adresse hinten an; der Client versucht, vorn eine andere unterzuschieben
    const r = await fetch(`${base}/ip`, { headers: { 'X-Forwarded-For': '6.6.6.6, 203.0.113.9' } });
    assert.strictEqual((await r.json()).ip, '203.0.113.9');
  });
  const direct = express(); direct.set('trust proxy', net.trustProxySetting('0')); direct.get('/ip', (req, res) => res.json({ ip: req.ip }));
  await withServer(direct, async (base) => {
    const r = await fetch(`${base}/ip`, { headers: { 'X-Forwarded-For': '6.6.6.6' } });
    assert.match((await r.json()).ip, /127\.0\.0\.1/, 'ohne Proxy zählt nur die Socket-Adresse');
  });
  assert.match(read('server.js'), /trustProxySetting\(\)/); assert.match(read('src/app.js'), /trustProxySetting\(\)/); assert.match(read('src/install/installer.js'), /trustProxySetting\(\)/);
});

test('Server-Zeitlimits gegen langsame Angriffe und hängende Handler', async () => {
  const net = require('../src/lib/net');
  const s = net.hardenServer(http.createServer());
  assert.ok(s.headersTimeout <= 30000 && s.headersTimeout > 0); assert.ok(s.requestTimeout > 0 && s.requestTimeout <= 300000);
  assert.ok(s.keepAliveTimeout < s.headersTimeout); assert.ok(s.maxHeadersCount <= 200);
  assert.match(read('server.js'), /hardenServer\(server\)/);
  const app = express(); app.use(net.deadline(80));
  app.get('/slow', () => { /* antwortet nie */ });
  app.get('/api/slow', () => { /* antwortet nie */ });
  app.get('/api/live', (req, res) => { res.write('x'); setTimeout(() => res.end(), 250); });
  await withServer(app, async (base) => {
    const r = await fetch(`${base}/slow`); assert.strictEqual(r.status, 503);
    const j = await fetch(`${base}/api/slow`); assert.strictEqual(j.status, 503); assert.strictEqual((await j.json()).ok, false);
    const live = await fetch(`${base}/api/live`); assert.strictEqual(live.status, 200, 'SSE ist von der Frist ausgenommen'); await live.text();
  });
});

test('Header: CSP ohne Inline-Skripte, Permissions-Policy, HSTS, no-store, Referrer-Policy; Body-Parser erst nach der Anmeldeprüfung', () => {
  const app = read('src/app.js');
  assert.match(app, /scriptSrc: \["'self'"\]/); assert.match(app, /scriptSrcAttr: \["'none'"\]/); assert.match(app, /objectSrc: \["'none'"\]/); assert.match(app, /frameAncestors: \["'none'"\]/);
  assert.match(app, /baseUri: \["'self'"\]/); assert.match(app, /formAction: \["'self'"\]/); assert.match(app, /workerSrc/); assert.ok(!/scriptSrc: \[[^\]]*unsafe/.test(app));
  assert.match(app, /Permissions-Policy/); assert.match(app, /camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.match(app, /strictTransportSecurity: \{ maxAge: 31536000/); assert.match(app, /policy: 'no-referrer'/); assert.match(app, /'Cache-Control', 'no-store'/);
  // Grosse Admin-Bodies (12 MB) nur für Team-Mitglieder: Parser steht hinter der Benutzerprüfung
  const iUser = app.indexOf('req.user = null;'); const iForm = app.indexOf('formAdmin : formSmall'); const iCsrf = app.indexOf('app.use(csrf)');
  assert.ok(iUser > 0 && iForm > iUser && iCsrf > iForm, 'Reihenfolge: Benutzer → Body → CSRF');
  assert.match(app, /roles\.isStaff\(req\.user\.role\) \? formAdmin/);
  assert.ok(app.indexOf("app.use('/webhooks', require('./routes/webhooks'))") < iUser, 'Webhooks bekommen den Roh-Body vor allen Parsern');
  assert.match(app, /parameterLimit: 300/);
});

test('Fehlerbehandlung: 4xx der Anfrage bleiben 4xx, kein Stacktrace/Detail an den Client', async () => {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.post('/api/x', (req, res) => res.json({ ok: true }));
  app.get('/api/boom', () => { throw new Error('geheimes DB-Passwort hunter2 in /srv/app/secret.js'); });
  // Handler wie in app.js (ohne Views)
  const src = read('src/app.js');
  assert.match(src, /st >= 400 && st < 500/); assert.match(src, /Interner Fehler\./);
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const st = err && Number(err.status || err.statusCode);
    if (st >= 400 && st < 500) return res.status(st).json({ ok: false, error: st === 413 ? 'Die Anfrage ist zu gross.' : 'Ungültige Anfrage.' });
    res.status(500).json({ ok: false, error: 'Interner Fehler.' });
  });
  await withServer(app, async (base) => {
    const bad = await fetch(`${base}/api/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{kaputt' }); assert.strictEqual(bad.status, 400);
    const big = await fetch(`${base}/api/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 'x'.repeat(5000) }) }); assert.strictEqual(big.status, 413);
    const prim = await fetch(`${base}/api/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '"string"' }); assert.strictEqual(prim.status, 400, 'strict: nur Objekte/Listen');
    const boom = await fetch(`${base}/api/boom`); const t = await boom.text(); assert.strictEqual(boom.status, 500); assert.ok(!/hunter2|secret\.js|at /.test(t));
  });
});

test('Verzeichnis-/Lese-Endpunkte: Seitenzahl gedeckelt, Suchtext gekürzt, teure Abfragen je Spieler gebremst', () => {
  const s = read('src/routes/social.js');
  assert.match(s, /Math\.min\(500, Math\.max\(1, int\(req\.query\.page, 1\)\)\)/); assert.match(s, /slice\(0, 40\)/);
  assert.match(s, /tradeLimit/); assert.match(s, /writeLimit/); assert.match(s, /heavyRead/);
  for (const p of ['market', 'exchange', 'elections', 'jobs', 'lease']) assert.match(s.match(/const TRADE_PATH = (\/.*\/);/)[1], new RegExp(p));
  assert.ok(!/ttlCache/.test(s), 'eigene Lesezugriffe nach Schreibaktionen nie veraltet zwischenspeichern');
  assert.match(read('src/routes/public.js'), /ttlCache\(20000/);
  assert.match(read('src/routes/api.js'), /worldCache/); assert.match(read('src/routes/api.js'), /anonLimit/);
  assert.match(read('src/routes/push.js'), /limit: 40/);
});

test('Limits: Bremse je Spieler, Skalierung über TP_API_RATE, Zwischenspeicher mit Ablauf und Obergrenze', async () => {
  const { userLimit, ttlCache, scale } = require('../src/lib/limits');
  const old = process.env.TP_API_RATE;
  try {
    delete process.env.TP_API_RATE; assert.strictEqual(scale(), 1);
    process.env.TP_API_RATE = '1800'; assert.strictEqual(scale(), 10);
    delete process.env.TP_API_RATE;
    const app = express(); app.use((req, res, next) => { req.user = { id: Number(req.get('x-u')) }; next(); });
    app.post('/t', userLimit(3, 'langsam'), (req, res) => res.json({ ok: true }));
    await withServer(app, async (base) => {
      const hit = (u) => fetch(`${base}/t`, { method: 'POST', headers: { 'x-u': String(u) } }).then((r) => r.status);
      assert.deepStrictEqual([await hit(1), await hit(1), await hit(1), await hit(1)], [200, 200, 200, 429]);
      assert.strictEqual(await hit(2), 200, 'anderer Spieler hat sein eigenes Kontingent');
    });
  } finally { if (old === undefined) delete process.env.TP_API_RATE; else process.env.TP_API_RATE = old; }
  const c = ttlCache(40, 3); let calls = 0; const mk = async () => ++calls;
  assert.strictEqual(await c.get('a', mk), 1); assert.strictEqual(await c.get('a', mk), 1);
  await new Promise((r) => setTimeout(r, 60)); assert.strictEqual(await c.get('a', mk), 2);
  for (const k of ['b', 'c', 'd', 'e']) await c.get(k, mk); assert.ok(c.size <= 3);
});

/* ------------------------------------------------------------------ Live (SSE) */

test('Live-Verbindungen: Obergrenzen je Spieler, je IP und insgesamt; Zähler werden beim Schliessen freigegeben', () => {
  const live = require('../src/lib/live');
  const fake = () => { const r = new EventEmitter(); r.write = () => true; r.end = () => r.emit('close'); return r; };
  const L = live.LIMITS; const keep = { ...L };
  try {
    L.perIp = 3; L.total = 5; L.perUser = 2;
    const open = []; const add = (uid, ip) => { const r = fake(); live.add(uid, r, ip); open.push(r); return r; };
    assert.ok(live.admit('1.1.1.1'));
    add(1, '1.1.1.1'); add(2, '1.1.1.1'); add(3, '1.1.1.1');
    assert.strictEqual(live.admit('1.1.1.1'), false, 'Obergrenze je IP');
    assert.ok(live.admit('2.2.2.2'));
    add(4, '2.2.2.2'); add(5, '3.3.3.3');
    assert.strictEqual(live.admit('4.4.4.4'), false, 'Obergrenze insgesamt (5)');
    open[0].emit('close'); open[0].emit('close'); // doppeltes close zählt nur einmal
    assert.ok(live.admit('4.4.4.4')); assert.ok(live.admit('1.1.1.1'));
    // je Spieler: die älteste Verbindung wird ersetzt
    const a = add(9, '5.5.5.5'); add(9, '5.5.5.5'); let closed = false; a.on('close', () => { closed = true; }); add(9, '5.5.5.5');
    assert.ok(closed, 'älteste Verbindung desselben Spielers wurde geschlossen');
    for (const r of open) r.emit('close');
    assert.strictEqual(live.stats().connections, 0); assert.strictEqual(live.stats().ips, 0);
  } finally { Object.assign(L, keep); }
  assert.match(read('src/lib/live.js'), /503/); assert.match(read('src/lib/live.js'), /maxAgeMs/);
});

/* ------------------------------------------------------------------ Push (SSRF) */

test('Push: nur Dienste der Browser-Hersteller als Ziel (kein SSRF auf interne Adressen)', () => {
  const { pushEndpointAllowed: ok } = require('../src/lib/push');
  for (const good of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Qabc', 'https://wns2-par02p.notify.windows.com/?token=a']) assert.ok(ok(good), good);
  for (const bad of ['https://127.0.0.1/x', 'https://[::1]/x', 'https://169.254.169.254/latest/meta-data', 'https://localhost/x', 'https://10.0.0.5/x', 'https://intranet/x', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/fcm.googleapis.com', 'https://user:pw@fcm.googleapis.com/x', 'https://storage.googleapis.com/x', 'https://0x7f000001/x', 'https://2130706433/x', 'ftp://fcm.googleapis.com/x', 'nonsense']) assert.ok(!ok(bad), bad);
});

/* ------------------------------------------------------------------ Webhooks */

test('Stripe-Signatur: HMAC über den rohen Body, zeitkonstant, Replay-Frist, mehrere v1-Signaturen', () => {
  const stripe = require('../src/lib/stripe');
  const secret = 'whsec_test'; const body = Buffer.from('{"id":"evt_1","type":"x"}'); const now = Date.now(); const t = Math.floor(now / 1000);
  const sig = (ts, b = body, s = secret) => crypto.createHmac('sha256', s).update(`${ts}.${b.toString('utf8')}`).digest('hex');
  assert.ok(stripe.verifyWebhook(body, `t=${t},v1=${sig(t)}`, secret, 300, now));
  assert.ok(stripe.verifyWebhook(body, `t=${t},v1=${'0'.repeat(64)},v1=${sig(t)}`, secret, 300, now), 'eine passende von mehreren genügt');
  assert.ok(!stripe.verifyWebhook(body, `t=${t},v1=${sig(t)}`, 'anderes', 300, now));
  assert.ok(!stripe.verifyWebhook(Buffer.from('{"id":"evt_1","type":"y"}'), `t=${t},v1=${sig(t)}`, secret, 300, now), 'manipulierter Body');
  assert.ok(!stripe.verifyWebhook(body, `t=${t - 400},v1=${sig(t - 400)}`, secret, 300, now), 'zu alt (Replay)');
  assert.ok(!stripe.verifyWebhook(body, `t=${t + 400},v1=${sig(t + 400)}`, secret, 300, now), 'aus der Zukunft');
  assert.ok(!stripe.verifyWebhook(body, `t=${t}`, secret, 300, now)); assert.ok(!stripe.verifyWebhook(body, '', secret, 300, now)); assert.ok(!stripe.verifyWebhook(body, `t=${t},v1=${sig(t)}`, '', 300, now));
  assert.ok(!stripe.verifyWebhook({}, `t=${t},v1=${sig(t)}`, secret, 300, now), 'geparstes Objekt statt Roh-Body wird nie akzeptiert');
  assert.ok(!stripe.verifyWebhook(body, `t=${t},v1=abc`, secret, 300, now));
  assert.match(read('src/lib/stripe.js'), /timingSafeEqual/);
});

test('Webhook-Routen: Stripe verlangt gültige Signatur; Offerwall prüft Typ, Signatur, Obergrenze und Wiederholung', async () => {
  const db = require('../src/db'); const settings = require('../src/settings');
  const credited = []; const seen = new Set();
  const origTx = db.tx; const origGet = settings.get;
  settings.get = (k) => ({ 'offerwall.secret': 'ow-secret', 'payments.stripe_webhook_secret': 'whsec_x', packages: [] }[k]);
  db.tx = async (fn) => fn({
    one: async (sql, p) => (/FROM offer_events/.test(sql) ? (seen.has(p[0]) ? { id: 1 } : null) : (/FROM users/.test(sql) ? { id: Number(p[0]) } : null)),
    query: async (sql, p) => { if (/INSERT INTO offer_events/.test(sql)) seen.add(p[0]); if (/UPDATE users SET coins/.test(sql)) credited.push([p[1], p[0]]); },
  });
  try {
    const app = express(); app.use('/webhooks', require('../src/routes/webhooks'));
    const sign = (uid, coins, txid) => crypto.createHmac('sha256', 'ow-secret').update(`${uid}|${coins}|${txid}`).digest('hex');
    await withServer(app, async (base) => {
      const get = async (qs) => { const r = await fetch(`${base}/webhooks/offerwall?${qs}`); return [r.status, await r.text()]; };
      assert.deepStrictEqual(await get(`uid=7&coins=50&txid=t1&sig=${sign(7, 50, 't1')}`), [200, '1']);
      assert.deepStrictEqual(credited, [[7, 50]]);
      assert.deepStrictEqual(await get(`uid=7&coins=50&txid=t1&sig=${sign(7, 50, 't1')}`), [200, '1'], 'Wiederholung wird quittiert …');
      assert.strictEqual(credited.length, 1, '… aber nicht erneut gutgeschrieben');
      assert.strictEqual((await get(`uid=7&coins=50&txid=t2&sig=${'0'.repeat(64)}`))[0], 403);
      assert.strictEqual((await get(`uid=7&coins=51&txid=t3&sig=${sign(7, 50, 't3')}`))[0], 403, 'geänderte Menge');
      assert.strictEqual((await get(`uid=8&coins=50&txid=t4&sig=${sign(7, 50, 't4')}`))[0], 403, 'geänderte Spieler-ID');
      assert.strictEqual((await get(`uid[]=7&coins=50&txid=t5&sig=${sign(7, 50, 't5')}`))[0], 400, 'Liste statt Text');
      assert.strictEqual((await get(`uid=7&coins=-5&txid=t6&sig=${sign(7, -5, 't6')}`))[0], 400, 'negative Mengen');
      assert.strictEqual((await get(`uid=7abc&coins=5&txid=t7&sig=${sign('7abc', 5, 't7')}`))[0], 400);
      assert.strictEqual((await get('uid=7&coins=5&txid=t8'))[0], 400, 'ohne Signatur');
      assert.deepStrictEqual(await get(`uid=7&coins=999999&txid=t9&sig=${sign(7, 999999, 't9')}`), [200, '1']);
      assert.deepStrictEqual(credited[1], [7, 1000], 'Obergrenze 1000 Coins je Meldung');
      assert.strictEqual((await get(`uid=7&coins=50&txid=${'x'.repeat(300)}&sig=${sign(7, 50, 'x'.repeat(300))}`))[0], 400, 'überlange Transaktions-ID');
      // Stripe: ohne/mit falscher Signatur und mit nicht-rohem Body
      const post = (headers, body) => fetch(`${base}/webhooks/stripe`, { method: 'POST', headers, body }).then((r) => r.status);
      assert.strictEqual(await post({ 'content-type': 'application/json' }, '{"type":"checkout.session.completed"}'), 400);
      assert.strictEqual(await post({ 'content-type': 'application/json', 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` }, '{}'), 400);
      assert.strictEqual(await post({ 'content-type': 'application/x-www-form-urlencoded', 'stripe-signature': 'x' }, 'a=1'), 400);
    });
  } finally { db.tx = origTx; settings.get = origGet; }
});

/* ------------------------------------------------------------------ Uploads, Installer, Konfiguration */

test('Uploads: nur Bild-Magic-Bytes, Zufallsnamen, feste Zielordner, begrenzte Felder; Auslieferung mit nosniff ohne Dotfiles', () => {
  const a = read('src/routes/admin.js');
  assert.match(a, /fileSize: 4 \* 1024 \* 1024, files: 2, fields: 60, fieldSize: 100 \* 1024, parts: 70/);
  assert.match(a, /\['cities', 'misc'\]\.includes\(kind\)/); assert.match(a, /crypto\.randomBytes\(12\)/);
  assert.match(a, /\^\(cities\|misc\)\\\/\[a-f0-9\]\{24\}\\\.\(png\|jpg\|webp\|gif\)\$/, 'Löschen nur für selbst erzeugte Dateinamen');
  const app = read('src/app.js'); assert.match(app, /dotfiles: 'deny'/); assert.match(app, /X-Content-Type-Options', 'nosniff'/);
});

test('Konfiguration: Daten-Ordner 0700, config.json 0600; Installer mit Schutz-Headern, Rate-Limit und Passwortregeln', () => {
  const c = read('src/config.js'); assert.match(c, /mode: 0o700/); assert.match(c, /mode: 0o600/);
  const i = read('src/install/installer.js'); assert.match(i, /X-Frame-Options/); assert.match(i, /rateLimit\(/); assert.match(i, /timingSafeEqual/); assert.match(i, /passwordPolicy/);
});

test('Geheimnisse: Admin-Export und Backup ohne Schlüssel, Session-Secret nie in Einstellungen/Export', () => {
  const t = read('src/routes/admin-tools.js'); const a = read('src/routes/admin.js');
  assert.match(t, /if \(!withSecrets\) \{ for \(const k of SECRETS\) delete st\[k\]/); assert.match(a, /for \(const k of \['payments\.stripe_secret', 'payments\.stripe_webhook_secret', 'offerwall\.secret'\]\) delete a\[k\]/);
  const settings = require('../src/settings');
  assert.ok(!('session_secret' in settings.DEFAULTS)); assert.ok(!('push.vapid' in settings.DEFAULTS), 'VAPID-Schlüssel stehen nie in all()/Export');
  // Backup mit Geheimnissen und Voll-Sicherung (Passwort-Hashes) sind für Co-Admins gesperrt
  assert.ok(!roles.can('coadmin', 'GET', '/backup/download')); assert.ok(!roles.can('coadmin', 'GET', '/Backup/download/'));
  // Gesundheitscheck verrät keine Version
  assert.ok(!/version/.test(read('src/app.js').match(/app\.get\('\/healthz'[\s\S]*?\}\);/)[0]));
});

test('IDOR: fremde Stellenanzeigen lassen sich nicht schliessen (Bewerbungen werden nur nach Eigentumsprüfung abgelehnt)', async () => {
  const db = require('../src/db'); const bonds = require('../src/lib/bonds');
  const calls = []; const orig = db.query;
  db.query = async (sql, p) => { calls.push([sql, p]); return { affectedRows: /UPDATE player_jobs/.test(sql) && p[1] === 7 ? 1 : 0 }; };
  try {
    await bonds.closeOffer(99, 5); // Anzeige 5 gehört jemand anderem
    assert.strictEqual(calls.length, 1); assert.match(calls[0][0], /UPDATE player_jobs[\s\S]*owner_id = \?/);
    await bonds.closeOffer(7, 5);
    assert.strictEqual(calls.length, 3, 'bei eigener Anzeige werden zusätzlich die Bewerbungen abgelehnt'); assert.match(calls[2][0], /UPDATE job_apps/);
  } finally { db.query = orig; }
});

test('JSON-Bodies: Tiefe und Knotenzahl begrenzt; Aktionsnamen nur aus der Liste', async () => {
  const app = express(); app.use(express.json({ limit: '300kb' })); app.use(sec.jsonShape()); app.post('/x', (req, res) => res.json({ ok: true }));
  await withServer(app, async (base) => {
    const post = (body) => fetch(`${base}/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).then((r) => r.status);
    assert.strictEqual(await post('{"a":{"b":[1,2,{"c":3}]}}'), 200);
    assert.strictEqual(await post('{"a":'.repeat(30) + '1' + '}'.repeat(30)), 400, '30 Ebenen');
    assert.strictEqual(await post('['.repeat(140000) + ']'.repeat(140000)), 400, 'extrem tief → 400, kein Absturz');
    assert.strictEqual(await post(JSON.stringify({ list: Array.from({ length: 30000 }, (_, i) => i) })), 400, 'zu viele Knoten');
    assert.strictEqual(await post('{}'), 200);
  });
  assert.match(read('src/app.js'), /const shape = jsonShape\(\);/);
  assert.match(read('src/routes/api.js'), /actions\.ACTIONS\.includes\(req\.params\.name\)/);
  const actions = require('../src/game/actions');
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) assert.ok(!actions.ACTIONS.includes(bad), bad);
  assert.ok(actions.ACTIONS.length > 10);
});
