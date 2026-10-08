'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const db = require('../src/db');
const settings = require('../src/settings');
const push = require('../src/lib/push');

test('Ruhezeit über Mitternacht', () => {
  assert.ok(push.inQuiet(23, 22, 7)); assert.ok(push.inQuiet(3, 22, 7)); assert.ok(!push.inQuiet(7, 22, 7)); assert.ok(!push.inQuiet(12, 22, 7));
  assert.ok(push.inQuiet(13, 12, 14)); assert.ok(!push.inQuiet(5, 5, 5));
});
test('Ortszeit je Zeitzone', () => {
  const d = new Date('2026-01-15T22:30:00Z');
  assert.strictEqual(push.localHour('UTC', d), 22);
  assert.strictEqual(push.localHour('Europe/Berlin', d), 23);
  assert.strictEqual(push.localHour('Kein/Ort', d), 23);
});
test('Rate-Limit je Stunde', () => {
  push.resetLimits(); const t = 1e12;
  for (let i = 0; i < 3; i++) assert.ok(push.rateOk(1, 3, t + i));
  assert.ok(!push.rateOk(1, 3, t + 10)); assert.ok(push.rateOk(2, 3, t + 10)); assert.ok(push.rateOk(1, 3, t + 3600001 + 2));
});
test('Kategorien aus Betreffzeilen', () => {
  const c = push.categoryFor;
  assert.strictEqual(c('Überboten'), 'auctions'); assert.strictEqual(c('Kaufangebot'), 'offers'); assert.strictEqual(c('Gegenangebot'), 'offers');
  assert.strictEqual(c('Jobangebot'), 'jobs'); assert.strictEqual(c('Neue Bewerbung'), 'jobs'); assert.strictEqual(c('Heiratsantrag!'), 'couples');
  assert.strictEqual(c('Freundschaftsanfrage'), 'letters'); assert.strictEqual(c('Geschenk'), 'letters');
});
test('Einstellungen: nur bekannte Felder, Stunden begrenzt', () => {
  const n = push.applyPatch({ on: true }, { cats: { chat: false, evil: true }, quiet: { enabled: true, from: '99', to: '6' } });
  assert.deepStrictEqual(n.cats, { chat: false }); assert.strictEqual(n.quiet.from, 22); assert.strictEqual(n.quiet.to, 6);
  assert.ok(!push.catEnabled({ on: true, cats: { chat: false } }, 'chat')); assert.ok(push.catEnabled({ on: true }, 'jobs')); assert.ok(!push.catEnabled(null, 'jobs'));
});
test('Payload: gekürzt, interne URL', () => {
  const p = JSON.parse(push.buildPayload({ title: 'x'.repeat(200), body: 'b', tab: 'plaza', tag: 'chat' }));
  assert.ok(p.title.length <= 80); assert.strictEqual(p.url, '/play?stab=plaza#/social');
});

// ---- notify() mit Attrappen für Datenbank und Versand
function fake({ user, subs }) {
  const calls = { deleted: [], sent: [] };
  const o = { one: db.one, query: db.query };
  db.one = async (sql) => (/FROM users/.test(sql) ? user : { n: 0 });
  db.query = async (sql, p) => { if (/DELETE FROM push_subscriptions/.test(sql)) { calls.deleted.push(p[0]); return []; } if (/FROM push_subscriptions/.test(sql)) return subs; return []; };
  return { calls, restore: () => { db.one = o.one; db.query = o.query; } };
}
const sub = (id) => ({ id, endpoint: `https://push.example/${id}`, p256dh: 'k', auth: 'a', tz: 'UTC' });
const base = { id: 1, banned: 0, is_bot: 0, lang: 'de', meta: JSON.stringify({ push: { on: true, tz: 'UTC', quiet: { enabled: false, from: 22, to: 7 } } }) };

test('notify: sendet, respektiert Opt-out, Sperre und Aus-Schalter', async () => {
  push.resetLimits(); const sent = []; push.setSender(async (s, payload, opts) => { sent.push({ s, payload, opts }); });
  settings.set = async () => {}; // keine DB
  let f = fake({ user: base, subs: [sub(1)] });
  try {
    let r = await push.notify(1, { title: 'Kaufangebot', body: 'Hallo', cat: 'offers', tag: 'offers' });
    assert.strictEqual(r.sent, 1); assert.strictEqual(sent.length, 1); assert.ok(sent[0].opts.topic.length <= 32);
    assert.strictEqual(JSON.parse(sent[0].payload).tab, 'market');
    f.restore(); f = fake({ user: { ...base, banned: 1 }, subs: [sub(1)] });
    assert.strictEqual((await push.notify(1, { title: 'a', cat: 'letters' })).reason, 'user');
    f.restore(); f = fake({ user: { ...base, meta: JSON.stringify({ push: { on: true, cats: { chat: false } } }) }, subs: [sub(1)] });
    assert.strictEqual((await push.notify(1, { title: 'a', cat: 'chat' })).reason, 'optout');
    f.restore(); f = fake({ user: { ...base, meta: '{}' }, subs: [sub(1)] });
    assert.strictEqual((await push.notify(1, { title: 'a', cat: 'letters' })).reason, 'optout');
  } finally { f.restore(); }
});

test('notify: Ruhezeit, Rate-Limit, tote Abos', async () => {
  push.resetLimits(); const sent = []; push.setSender(async (s) => { sent.push(s.endpoint); if (s.endpoint.endsWith('/2')) { const e = new Error('gone'); e.statusCode = 410; throw e; } });
  const hour = push.localHour('UTC');
  const quiet = { ...base, meta: JSON.stringify({ push: { on: true, tz: 'UTC', quiet: { enabled: true, from: hour, to: (hour + 1) % 24 } } }) };
  let f = fake({ user: quiet, subs: [sub(1)] });
  try {
    assert.strictEqual((await push.notify(1, { title: 'a', cat: 'letters' })).reason, 'quiet');
    assert.strictEqual((await push.notify(1, { title: 'a', cat: 'letters', force: true })).sent, 1);
    f.restore(); push.resetLimits(); sent.length = 0;
    f = fake({ user: base, subs: [sub(1), sub(2)] });
    const r = await push.notify(1, { title: 'a', cat: 'letters' });
    assert.strictEqual(r.sent, 1); assert.deepStrictEqual(f.calls.deleted, [2]);
    push.resetLimits(); const per = settings.get('push').perHour; let last;
    for (let i = 0; i <= per; i++) last = await push.notify(1, { title: 'a', cat: 'letters' });
    assert.strictEqual(last.reason, 'rate');
  } finally { f.restore(); push.setSender(null); }
});

test('web-push verschlüsselt (aes128gcm) und signiert (VAPID) für ein Test-Abo', async () => {
  const webpush = require('web-push');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const k = webpush.generateVAPIDKeys();
  const d = webpush.generateRequestDetails({ endpoint: 'https://push.example/abc', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } },
    push.buildPayload({ title: 'T', body: 'B', tab: 'letters' }), { vapidDetails: { subject: 'mailto:a@b.de', publicKey: k.publicKey, privateKey: k.privateKey }, contentEncoding: 'aes128gcm', TTL: 60 });
  assert.strictEqual(d.headers['Content-Encoding'], 'aes128gcm'); assert.match(d.headers.Authorization, /^vapid t=/); assert.ok(Buffer.isBuffer(d.body) && d.body.length > 86);
});
