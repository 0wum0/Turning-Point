'use strict';
const test = require('node:test');
const assert = require('node:assert');
const maintenance = require('../src/lib/maintenance');
const db = require('../src/db');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);

test('Aufbewahrungsfristen: Standardwerte ergeben die vorgesehenen Grenzzeitpunkte', () => {
  const c = maintenance.cutoffs({}, NOW);
  assert.strictEqual(c.chatDays.getTime(), NOW - 30 * DAY);
  assert.strictEqual(c.lettersReadDays.getTime(), NOW - 180 * DAY);
  assert.strictEqual(c.newsDays.getTime(), NOW - 90 * DAY);
  assert.strictEqual(c.worldEventsDays.getTime(), NOW - 60 * DAY);
  assert.strictEqual(c.marketDays.getTime(), NOW - 30 * DAY);
  assert.strictEqual(c.ordersDays.getTime(), NOW - 30 * DAY);
  assert.strictEqual(c.tradesDays.getTime(), NOW - 180 * DAY);
  assert.strictEqual(c.leasesDays.getTime(), NOW - 90 * DAY);
});

test('Aufbewahrungsfristen: eigene Werte gelten, ungültige fallen auf den Standard zurück', () => {
  const c = maintenance.cutoffs({ chatDays: 7, newsDays: 0, tradesDays: 'abc', leasesDays: -5, marketDays: 99999 }, NOW);
  assert.strictEqual(c.chatDays.getTime(), NOW - 7 * DAY);
  assert.strictEqual(c.newsDays.getTime(), NOW - 90 * DAY, '0 → Standard');
  assert.strictEqual(c.tradesDays.getTime(), NOW - 180 * DAY, 'Text → Standard');
  assert.strictEqual(c.leasesDays.getTime(), NOW - 90 * DAY, 'negativ → Standard');
  assert.strictEqual(c.marketDays.getTime(), NOW - 3650 * DAY, 'nach oben begrenzt');
});

test('Aufräumen löscht in LIMIT-Schritten, nie offene Angebote/Versteigerungen/Orders, und wiederholt bis zum Rest', async () => {
  const calls = [];
  const orig = db.query;
  let chatLeft = 5; // 5 Zeilen, Schrittgröße 2 → 2 + 2 + 1
  db.query = async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM chat_messages/.test(sql)) { const n = Math.min(2, chatLeft); chatLeft -= n; return { affectedRows: n }; }
    return { affectedRows: 0 };
  };
  const settings = require('../src/settings');
  const origGet = settings.get;
  settings.get = (k) => (k === 'maintenance' ? { enabled: true, batch: 100 } : origGet(k));
  try {
    // Mindest-Schrittgröße ist 100 → mit 5 Zeilen reicht ein Durchlauf; die Schleifenlogik prüfen wir unten separat
    const res = await maintenance.run(NOW);
    assert.strictEqual(res.chat, 2);
    for (const c of calls) {
      if (/^DELETE/.test(c.sql)) assert.match(c.sql, /LIMIT \d+$/, c.sql);
    }
    const sqls = calls.map((c) => c.sql).join('\n');
    assert.match(sqls, /status <> 'open'/);
    assert.match(sqls, /status IN \('filled','cancelled'\)/);
    assert.match(sqls, /status = 'ended'/);
    assert.match(sqls, /read_at IS NOT NULL/);
    assert.match(sqls, /FROM sessions/);
    // Grenzzeitpunkte stammen aus cutoffs()
    const chat = calls.find((c) => /FROM chat_messages/.test(c.sql));
    assert.strictEqual(chat.params[0].getTime(), NOW - 30 * DAY);
  } finally { db.query = orig; settings.get = origGet; }
});

test('Aufräumen wiederholt, solange volle Schritte gelöscht wurden', async () => {
  const orig = db.query; let n = 0;
  db.query = async () => { n++; return { affectedRows: n < 3 ? 100 : 7 }; };
  const settings = require('../src/settings'); const origGet = settings.get;
  settings.get = (k) => (k === 'maintenance' ? { enabled: true, batch: 100 } : origGet(k));
  try { const res = await maintenance.run(NOW); assert.strictEqual(res.chat, 207); } finally { db.query = orig; settings.get = origGet; }
});

test('Aufräumen lässt sich abschalten', async () => {
  const orig = db.query; let called = false; db.query = async () => { called = true; return { affectedRows: 0 }; };
  const settings = require('../src/settings'); const origGet = settings.get;
  settings.get = (k) => (k === 'maintenance' ? { enabled: false } : origGet(k));
  try { assert.strictEqual(await maintenance.run(NOW), null); assert.strictEqual(called, false); } finally { db.query = orig; settings.get = origGet; }
});

test('Einstellungsgruppe „Aufräumen“ ist im Admin-Bereich vorhanden und hat Standardwerte', () => {
  const settings = require('../src/settings');
  const d = settings.DEFAULTS.maintenance;
  assert.ok(d && d.enabled === true);
  for (const k of Object.keys(maintenance.DEFAULT_DAYS)) assert.ok(k in d, `Standard für ${k}`);
  assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/routes/admin.js'), 'utf8'), /id: 'maintenance'/);
});
