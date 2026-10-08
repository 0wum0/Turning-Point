'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { csrf, escapeHtml } = require('../src/lib/security');
const social = require('../src/lib/social');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const walk = (d, ext, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, ext, out); else if (p.endsWith(ext)) out.push(p); } return out; };

function run(req) {
  const res = { code: null, locals: {}, status(c) { this.code = c; return this; }, json() { return this; }, render() { return this; } };
  let nexted = false; csrf({ method: 'POST', path: '/x', get: () => undefined, body: {}, query: {}, session: {}, ...req }, res, () => { nexted = true; });
  return { nexted, code: res.code };
}

test('CSRF: ohne oder mit falschem Token wird abgelehnt, mit richtigem Token durchgelassen', () => {
  const session = { csrf: 'a'.repeat(48) };
  assert.deepStrictEqual(run({ session: { ...session } }), { nexted: false, code: 403 });
  assert.strictEqual(run({ session: { ...session }, body: { _csrf: 'b'.repeat(48) } }).nexted, false);
  assert.strictEqual(run({ session: { ...session }, body: { _csrf: 'kurz' } }).nexted, false);
  assert.strictEqual(run({ session: { ...session }, body: { _csrf: session.csrf } }).nexted, true);
  assert.strictEqual(run({ session: { ...session }, get: (h) => (h === 'x-csrf-token' ? session.csrf : undefined) }).nexted, true);
  assert.strictEqual(run({ method: 'GET', session: {} }).nexted, true);
});

test('CSRF greift vor allen Routen (nur Webhooks mit eigener Signatur davor)', () => {
  const app = read('src/app.js');
  const iCsrf = app.indexOf('app.use(csrf)');
  assert.ok(iCsrf > 0);
  const mounts = [...app.matchAll(/app\.use\((?:'[^']*',\s*)?require\('\.\/routes\/([\w-]+)'\)/g)];
  assert.ok(mounts.length >= 5);
  for (const m of mounts) {
    if (m[1] === 'webhooks') assert.ok(m.index < iCsrf, 'Webhooks vor CSRF (Signaturprüfung)');
    else assert.ok(m.index > iCsrf, `${m[1]} muss nach CSRF eingehängt sein`);
  }
  assert.match(read('src/routes/webhooks.js'), /signature|sig/i);
});

test('Sitzungs-Cookie: httpOnly, SameSite, Secure automatisch', () => {
  const app = read('src/app.js');
  assert.match(app, /httpOnly: true/); assert.match(app, /sameSite: 'lax'/); assert.match(app, /secure: 'auto'/);
});

test('Anmeldung, Registrierung und Passwort-Zurücksetzen sind ratenbegrenzt', () => {
  const a = read('src/routes/auth.js');
  for (const r of ["'/login'", "'/register'", "'/forgot'", "'/reset/:token'"]) assert.match(a, new RegExp(`router\\.post\\(${r.replace(/[/:]/g, (c) => `\\${c}`)}, authLimiter`), r);
  assert.match(a, /accountLimiter/);
  assert.match(a, /DUMMY_HASH/, 'gleichbleibende Rechenzeit bei unbekanntem Konto');
  assert.match(read('src/routes/api.js'), /rateLimit\(/);
});

test('API verlangt Anmeldung vor allen Routen', () => {
  const a = read('src/routes/api.js');
  assert.ok(a.indexOf('res.status(401)') < a.indexOf("router.get('/state'"));
});

test('Admin-Bereich ist hinter einer Rollenprüfung', () => {
  const a = read('src/routes/admin.js');
  assert.match(a, /role/); assert.match(a, /router\.use\(/);
});

test('Templates: Rohausgabe (<%-) nur für Includes, Icons, CSRF-Feld und feste Aktionsleisten', () => {
  const ok = /^<%-\s*(include\(|icon\(|csrf\b|typeof actions !== 'undefined' \? actions|actions\b)/;
  for (const f of walk(path.join(ROOT, 'views'), '.ejs')) {
    for (const m of read(path.relative(ROOT, f)).matchAll(/<%-[^%]*%>/g)) assert.match(m[0], ok, `${path.relative(ROOT, f)}: ${m[0]}`);
  }
});

test('Client-Vorlagen: html`` maskiert Interpolationen, rohes HTML nur über raw()/__raw', () => {
  const ui = read('public/js/game/ui.js');
  assert.match(ui, /return esc\(v\)/);
  assert.match(ui, /export function html\(/);
  // Chatzeilen maskieren Name und Text
  for (const f of ['public/js/game/chatmodal.js', 'public/js/game/views/social.js']) {
    const src = read(f);
    assert.match(src, /\$\{esc\(m\.name\)\}/); assert.match(src, /\$\{esc\(m\.text\)\}/);
  }
});

test('escapeHtml maskiert alle Sonderzeichen', () => {
  assert.strictEqual(escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.strictEqual(escapeHtml(null), '');
});

test('Eingabegrenzen: clean() kürzt und entfernt Steuerzeichen', () => {
  assert.strictEqual(social.clean('a\u0000b\u0007c', 10), 'abc');
  assert.strictEqual(social.clean('x'.repeat(5000), 1500).length, 1500);
  assert.match(read('src/app.js'), /limit: '100kb'/); assert.match(read('src/app.js'), /limit: '300kb'/);
});

test('Link-Spam wird erkannt, normale Sätze nicht', () => {
  for (const t of ['besuch www.spam.de', 'https://x.y/z', 'gratis auf evil.com', 't.me/kanal', 'discord.gg/abc']) assert.ok(social.hasLink(t), t);
  for (const t of ['Hallo Berlin!', 'Ich suche Arbeit. Wer hilft?', 'Preis 3,50 DM']) assert.ok(!social.hasLink(t), t);
});

test('Spielernamen: keine Sonderzeichen erlaubt', () => {
  const m = read('src/routes/auth.js').match(/const NAME_RE = (\/.*\/u);/);
  const re = eval(m[1]); // eslint-disable-line no-eval
  assert.ok(re.test('anna_1')); assert.ok(!re.test('<b>x</b>')); assert.ok(!re.test('ab')); assert.ok(!re.test('a'.repeat(25)));
});
