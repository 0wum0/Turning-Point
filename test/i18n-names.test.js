'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../src/i18n-game');

test('Betriebsnamen werden nicht nach dem Kopfwort-Muster übersetzt', () => {
  assert.strictEqual(g.tr('Großbäckerei Koch'), 'Großbäckerei Koch');
  assert.strictEqual(g.tr('Bäckerei Peters'), 'Bäckerei Peters');
  assert.strictEqual(g.tr('Börsengang: Bäckerei Koch'), 'IPO: Bäckerei Koch');
});

test('Vorlagen übersetzen nur den festen Teil, Namen bleiben', () => {
  assert.strictEqual(g.tr('Bei Gasthaus Linde wurde ein Mitarbeiter abgeworben. Täter: Karl.'), 'An employee was poached at Gasthaus Linde. Culprit: Karl.');
  assert.strictEqual(g.tr('Anna Test beginnt ein neues Leben in Berlin.'), 'Anna Test begins a new life in Berlin.');
  assert.strictEqual(g.tr('Anna Test beginnt ein neues Leben in Köln.'), 'Anna Test begins a new life in Cologne.');
  assert.strictEqual(g.tr('Sabotage gegen Großbäckerei Koch'), 'Sabotage against Großbäckerei Koch');
});

test('Städtenamen und Berufe mit exaktem Eintrag bleiben übersetzbar', () => {
  assert.strictEqual(g.exactOnly('München'), 'Munich');
  assert.strictEqual(g.exactOnly('Großbäckerei Koch'), 'Großbäckerei Koch');
});

test('API-Antworten: Namen exakt, Chat und Spielerbriefe unverändert, Systembriefe übersetzt', () => {
  const body = {
    firms: [{ name: 'Großbäckerei Koch', city: 'München' }, { name: 'München' }],
    messages: [{ name: 'Anna', text: 'Neue Bewerbung bei Großbäckerei Koch', username: 'anna' }],
    items: [
      { kind: 'letter', subject: 'Neue Bewerbung', preview: 'Börse ist geschlossen.', other: 'Anna' },
      { kind: 'system', subject: 'Neue Bewerbung', preview: 'Neue Bewerbung', other: 'Das Postamt' },
    ],
  };
  const out = g.deep(body, undefined, { social: true, verbatim: new Set(['text', 'body', 'message', 'msg', 'title']) });
  assert.strictEqual(out.firms[0].name, 'Großbäckerei Koch');
  assert.strictEqual(out.firms[1].name, 'Munich');
  assert.strictEqual(out.messages[0].text, 'Neue Bewerbung bei Großbäckerei Koch');
  assert.strictEqual(out.items[0].subject, 'Neue Bewerbung');
  assert.strictEqual(out.items[0].preview, 'Börse ist geschlossen.');
  assert.strictEqual(out.items[1].subject, 'New application');
});

test('Kopfwort-Regel nur auf ausdrücklichen Wunsch (allgemeine Listen)', () => {
  assert.strictEqual(g.tr('Bäckerei Peters', { head: true }), 'Bakery Peters');
  assert.strictEqual(g.tr('Bäckerei Peters'), 'Bäckerei Peters');
});

test('Client-Übersetzer: markierte Knoten werden übersetzt-frei gelassen (data-i18n-skip)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '../public/js/i18n.js'), 'utf8');
  assert.match(src, /closest\('\[data-i18n-skip\]'\)/);
  for (const f of ['views/social.js', 'chatmodal.js', 'market.js', 'directory.js', 'exchange.js']) {
    const t = fs.readFileSync(require('path').join(__dirname, '../public/js/game', f), 'utf8');
    assert.match(t, /data-i18n-skip/, f);
  }
});
