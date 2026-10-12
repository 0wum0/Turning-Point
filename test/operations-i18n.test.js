'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const g = require('../src/i18n-game');
const i18n = require('../src/i18n');
const D = require('../src/game/operations-defaults');
const OPS = require('../src/game/operations');
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

test('Englisch (Server): Katalog der Module, Klimastufen, Ansehen-Ereignisse, Aufgaben und Freischaltung sind übersetzt', () => {
  const miss = [];
  const chk = (t) => { if (typeof t === 'string' && t && g.tr(t) === t) miss.push(t); };
  for (const m of Object.values(D.modules)) { chk(m.name); chk(m.what); for (const L of m.levels) { chk(L.name); chk(L.text); } }
  for (const k of ['great', 'good', 'ok', 'low', 'bad', 'none']) if (k !== 'ok' && k !== 'good') chk(OPS.BAND_NAME[k]);
  for (const k of ['staff_fair', 'staff_pressure']) { chk(R.REASONS[k].label); chk(R.REASONS[k].why); }
  for (const id of ['module', 'lead']) { const q = ob.QUESTS.find((x) => x.id === id); chk(q.title); chk(q.why); }
  const u = ob.UNLOCKS.find((x) => x.key === 'staff'); chk(u.label); chk(u.cond);
  chk(w().econ.insurance.betrieb.name);
  assert.deepStrictEqual([...new Set(miss)], []);
});
const w = () => require('./helpers').testWorld();

test('Englisch (Server): Meldungen, Rückmeldungen, Fehler, Tagesblatt und Hinweise mit Namen und Zahlen', () => {
  const cases = [
    ['Brand in Bäckerei Becker', 'Fire at Bäckerei Becker'],
    ['Die Betriebsversicherung übernimmt 12,00 DM des Schadens. Der Betrieb steht etwa 9 Tage still.', 'The business insurance covers 12.00 DM of the damage. The business is shut down for about 9 days.'],
    ['Der Schaden von 12,00 DM geht zu deinen Lasten. Der Betrieb steht etwa 9 Tage still.', 'You bear the damage of 12.00 DM. The business is shut down for about 9 days.'],
    ['Ein Teil des Lagers ist verbrannt.', 'Part of the warehouse stock burned.'],
    ['Für den Ausfall gibt es 4,50 DM Entschädigung.', 'You receive 4.50 DM compensation for the downtime.'],
    ['Karl denkt an Kündigung', 'Karl is thinking of quitting'],
    ['Bäckerei Becker: Karl denkt ans Kündigen. Du hast 30 Tage, um die Stimmung zu heben – ein Lob, eine Prämie oder mehr Lohn helfen.', 'Bäckerei Becker: Karl is thinking of quitting. You have 30 days to lift the mood – praise, a bonus or a raise will help.'],
    ['Streik bei Bäckerei Becker', 'Strike at Bäckerei Becker'],
    ['Einbruchsversuch bei Bäckerei Becker abgewehrt', 'Break-in attempt at Bäckerei Becker repelled'],
    ['Aus dem Betrieb wurde Ware im Wert von 2,50 DM gestohlen. Auch aus dem Lager fehlt etwas.', 'Goods worth 2.50 DM were stolen from the business. Something is missing from the warehouse as well.'],
    ['Lager ausgebaut: Vorratsraum (3,80 DM).', 'Warehouse upgraded: Storeroom (3.80 DM).'],
    ['Bauauftrag: Wiederaufbau Bäckerei Becker.', 'Construction job: Rebuilding Bäckerei Becker.'],
    ['Bauauftrag: Ausbau Bäckerei Becker: Lagerhalle.', 'Construction job: Upgrade Bäckerei Becker: Warehouse hall.'],
    ['Bäckerei Becker: Lager ausgebaut (Vorratsraum).', 'Bäckerei Becker: Warehouse upgraded (Storeroom).'],
    ['Brand in Bäckerei Becker (Köln).', 'Fire at Bäckerei Becker (Cologne).'],
    ['Alarmanlage gibt es erst ab 1970.', 'Alarm system is not available until 1970.'],
    ['Stufen werden nacheinander gebaut.', 'Levels are built one after the other.'],
    ['Karl freut sich über dein Lob.', 'Karl is pleased about your praise.'],
    ['Das Team bekommt eine Prämie (6,00 DM).', 'The team receives a bonus (6.00 DM).'],
    ['Weihnachtsfeier in Bäckerei Becker: Die Stimmung steigt (9,00 DM).', 'Christmas party at Bäckerei Becker: The mood rises (9.00 DM).'],
    ['Das letzte Betriebsfest ist noch nicht lange her (noch 12 Tage).', 'The last company party was not long ago (12 more days).'],
    ['Karl wurde abgemahnt. Kurzfristig steigt die Leistung, doch die Stimmung im Team sinkt. Wer oft abmahnt, gilt als Chef, der Druck macht – das kostet Ansehen.', 'Karl was given a formal warning. Performance rises briefly, but the mood in the team drops. Anyone who warns often is seen as a boss who applies pressure – that costs standing.'],
    ['Bäckerei Becker: Das Team ist unzufrieden', 'Bäckerei Becker: The team is unhappy'],
    ['Betriebsversicherung abschließen (6,00 DM / Tag)', 'Take out business insurance (6.00 DM / day)'],
    ['Wird freigeschaltet, wenn dein Betrieb Mitarbeiter hat. Spätestens öffnet es sich nach 6 Spieljahren.', 'Unlocks when your business has employees. At the latest it opens after 6 game years.'],
    ['Bäckerei Becker in Köln ist abgebrannt. Die Feuerwehr war im Einsatz – eine Versicherung gab es nicht.', 'Bäckerei Becker in Cologne has burned down. The fire brigade was on the scene – there was no insurance.'],
    ['Betriebsbrand', 'Business fire'],
  ];
  const bad = cases.filter(([de, en]) => g.tr(de) !== en).map(([de]) => `${de} -> ${g.tr(de)}`);
  assert.deepStrictEqual(bad, []);
});

test('Englisch (Oberfläche): feste Texte der Betriebs-Oberfläche, Innenraum, Glossar und Hinweise sind übersetzt', () => {
  const tr = clientTranslator();
  const missing = [];
  for (const f of ['public/js/game/ops.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const m of src.matchAll(/>([^<>$`{}?]{4,}?)</g)) {
      const t = m[1].trim(); if (!/[A-Za-zÄÖÜäöüß]{3}/.test(t) || /^[\W\d]+$/.test(t)) continue;
      if (tr(t) === null) missing.push(t);
    }
    for (const m of src.matchAll(/(?:title|ok|label|text|placeholder|aria-label)(?:=|: )['"]([A-ZÄÖÜ][^'"$\n]{3,})['"]/g)) { if (tr(m[1]) === null) missing.push(m[1]); }
  }
  const gl = fs.readFileSync(path.join(__dirname, '../public/js/game/glossary-ops.js'), 'utf8');
  for (const m of gl.matchAll(/^\s*\['([^']+)', '([^']+)', '((?:[^'\\]|\\.)+)'\]/gm)) for (const t of [m[2], m[3]]) if (tr(t) === null) missing.push(t);
  // Innenraum (V2): feste Verben und Bezeichnungen
  const rooms = fs.readFileSync(path.join(__dirname, '../public/js/game/rooms.js'), 'utf8');
  const bar = /\['stock', '([^']+)', 'package'\], \['safety', '([^']+)', 'shield'\], \['board', '([^']+)', 'smile'\]/.exec(rooms);
  for (const t of bar.slice(1)) if (tr(t) === null) missing.push(t);
  for (const t of ['Lager – Vorrat und Ausbau', 'Lagerregal – noch kein Lager', 'Vorrat, Lager ausbauen', 'Noch kein Lager gebaut', 'Alarmtafel & Feuerlöscher – Schutz und Brandschutz', 'Aushang – Betriebsklima', 'Lob, Prämie, Betriebsfest', 'Team loben', 'Kostet nichts', 'Prämie für das Team', 'Mitarbeiter einzeln führen …', 'Betriebsversicherung abschließen', 'Höchste Stufe erreicht', 'Geld reicht nicht', 'Braucht keine Zutaten']) { assert.ok(rooms.includes(t), `${t} fehlt im Innenraum`); if (tr(t) === null) missing.push(t); }
  assert.deepStrictEqual([...new Set(missing)], []);
  assert.strictEqual(tr('Wieder möglich in 5 Tagen'), 'Possible again in 5 days');
  assert.strictEqual(tr('Brandrisiko: ca. 1,3 % pro Jahr'), 'Fire risk: approx. 1.3 % per year');
  assert.strictEqual(tr('Ausbauen: Lagerhalle'), 'Upgrade: Lagerhalle');
  assert.strictEqual(tr('Gibt es erst ab 1970'), 'Not available until 1970');
  assert.strictEqual(tr('Betriebsklima: Gut (62)'), 'Work climate: Gut (62)');
  assert.strictEqual(tr('Lager ausbauen?'), 'Upgrade Lager?');
  assert.match(tr('schützt vor: Einbruch, Feuer, Betriebsunterbrechung'), /^protects against: burglary, fire, business interruption$/);
});

test('Englisch: Meldungen des Betriebs-Alltags haben keine Spielstand-Platzhalter vergessen (Katalog deckt alle Standardtexte)', () => {
  // Jede Standardstufe aus den Einstellungen hat eine englische Entsprechung; geänderte Texte im Admin bleiben bewusst unübersetzt.
  const names = Object.values(D.modules).flatMap((m) => [m.name, ...m.levels.map((l) => l.name)]);
  for (const n of names) assert.notStrictEqual(g.tr(n), n, n);
});
