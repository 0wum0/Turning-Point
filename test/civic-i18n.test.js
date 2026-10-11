'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const g = require('../src/i18n-game');
const i18n = require('../src/i18n');
const D = require('../src/game/civic-defaults');
const M = require('../src/game/civic');
const R = require('../src/game/reputation');
const ob = require('../src/game/onboarding');

function clientTranslator() {
  let js = '';
  i18n.dictScript({}, { type() { return this; }, set() { return this; }, send(x) { js = x; } });
  const src = fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'window.__tr=tr;})();');
  const sb = { window: {}, document: { body: null, addEventListener() {} }, NodeFilter: {}, MutationObserver: function () {} };
  vm.createContext(sb); vm.runInContext(js, sb); vm.runInContext(src, sb);
  return (s) => sb.window.__tr(s);
}

test('Englisch (Server): Einstellungstexte, Ansehen-Ereignisse und Aufgaben der Gesellschaft sind übersetzt', () => {
  const miss = [];
  const chk = (t) => { if (typeof t === 'string' && t && g.tr(t) === t) miss.push(t); };
  for (const k of D.clubs.kinds) { chk(k.name); chk(k.what); }
  for (const f of D.parish.faiths) chk(f.name);
  for (const l of D.parish.levels) chk(l.name);
  for (const v of Object.values(D.parish.ceremonies)) { chk(v.label); if (v.labels) Object.values(v.labels).forEach(chk); }
  for (const p of D.foundation.purposes) { chk(p.name); chk(p.what); }
  for (const t of D.titles.list) { chk(t.name); chk(t.what); for (const r of t.ranks) chk(r.name); }
  for (const r of Object.values(M.ROLE_NAME)) chk(r);
  for (const k of ['civic_club', 'civic_event', 'civic_donate', 'civic_foundation', 'civic_payout', 'civic_ceremony', 'civic_title', 'civic_title_lost', 'civic_embezzle', 'civic_ousted']) { const v = R.REASONS[k]; if (v) { chk(v.label); chk(v.why); } }
  for (const id of ['club', 'civic']) { const q = ob.QUESTS.find((x) => x.id === id); if (q) { chk(q.title); chk(q.why); } }
  assert.deepStrictEqual([...new Set(miss)], []);
});

test('Englisch (Server): Meldungen mit Namen, Zahlen und Art-, Gemeinde-, Zweck- und Rangnamen', () => {
  const cases = [
    ['Karl gründet den Sportverein „Eintracht“ in Köln.', 'Karl founds the sports club “Eintracht” in Cologne.'],
    ['Verein gegründet: Eintracht', 'Club founded: Eintracht'],
    ['Karl gründet die Stiftung „Alpha“ (Armenhilfe).', 'Karl founds the foundation “Alpha” (poor relief).'],
    ['Karl erhält den Titel „Stifter“.', 'Karl receives the title “Founder”.'],
    ['Titel verliehen: Mäzen', 'Title awarded: Patron'],
    ['Gemeinde: Katholische Gemeinde', 'Congregation: Catholic congregation'],
    ['Der Verein „Eintracht“ empfiehlt Anna Roth. Das gibt etwa +3 % Stimmengewicht – gewählt wird weiter von den Bürgern.', 'The club “Eintracht” recommends Anna Roth. That gives about +3 % vote weight – the citizens still do the electing.'],
    ['Der erste Beitrag übersteigt dein Geld.', 'The first fee is more than you can afford.'],
    ['Du bist aus dem Verein „Eintracht“ ausgetreten.', 'You left the club “Eintracht”.'],
    ['Du hast 12,00 DM in die Kasse von „Eintracht“ gespendet. Danke!', 'You donated 12.00 DM to the treasury of “Eintracht”. Thank you!'],
    ['Das letzte Fest ist noch nicht lange her. Das nächste ist in 5 Stunden möglich.', 'The last celebration was not long ago. The next one is possible in 5 hours.'],
    ['Vereinsbeitrag: Eintracht', 'Club fee: Eintracht'],
  ];
  const bad = cases.filter(([de, en]) => g.tr(de) !== en).map(([de]) => `${de} -> ${g.tr(de)}`);
  assert.deepStrictEqual(bad, []);
});

test('Englisch (Oberfläche): feste Texte der Gesellschaft-Oberfläche und des Glossars sind übersetzt', () => {
  const tr = clientTranslator();
  const files = ['public/js/game/civic.js'];
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const m of src.matchAll(/>([^<>$`{}]{4,}?)</g)) {
      const t = m[1].trim(); if (!/[A-Za-zÄÖÜäöüß]{3}/.test(t) || /^[\W\d]+$/.test(t)) continue;
      if (tr(t) === null) missing.push(t);
    }
    for (const m of src.matchAll(/(?:title|ok|label|text|placeholder|aria-label)(?:=|: )['"]([A-ZÄÖÜ][^'"$\n]{3,})['"]/g)) { if (tr(m[1]) === null) missing.push(m[1]); }
  }
  const gl = fs.readFileSync(path.join(__dirname, '../public/js/game/glossary-civic.js'), 'utf8');
  for (const m of gl.matchAll(/^\s*\['([^']+)', '([^']+)', '((?:[^'\\]|\\.)+)'\]/gm)) for (const t of [m[2], m[3]]) if (tr(t) === null) missing.push(t);
  assert.deepStrictEqual([...new Set(missing)], []);
  assert.strictEqual(tr('Verein gründen'), 'Found a club');
  assert.strictEqual(tr('in 3 Std.'), 'in 3 h');
  assert.match(tr('Kosten aus der Kasse: 5,00 DM – nächstes Fest in 2 Std.'), /^Cost from the treasury: 5,00 DM/);
  assert.match(tr('2 von 5 Mitgliedern misstrauen dem Vorsitz. Bei einer Mehrheit (mindestens drei Stimmen) ist er abgewählt.'), /^2 of 5 members/);
});
