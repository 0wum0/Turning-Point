'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { tr } = require('../src/i18n-game');

const CASES = [
  ['300 von 1000 Anteilen kommen zum Kurs von 201 (Wert 1945) in den Handel.', '300 of 1000 shares come to market at a price of 201 (1945 value).'],
  ['Bot Muster übernimmt als Mehrheitsaktionär Villa Sonne von Karl Becker.', 'Bot Muster takes over Villa Sonne from Karl Becker as majority shareholder.'],
  ['Otto Test ist im Alter von 20 Jahren gestorben. Bürgermeister Karl Brandt sprach den Angehörigen das Beileid der Stadt Berlin aus.', 'Otto Test has died at the age of 20. Mayor Karl Brandt expressed the condolences of the town of Berlin to the family.'],
  ['Anna Test beginnt ein neues Leben in Berlin.', 'Anna Test begins a new life in Berlin.'],
  ['Ein neuer Bürger beginnt ein neues Leben in der Stadt.', 'A new citizen begins a new life in town.'],
  ['Größter Gewinner: Alpha (+12,5 %). Größter Verlierer: Beta (-3,2 %).', 'Biggest gainer: Alpha (+12.5 %). Biggest loser: Beta (-3.2 %).'],
  ['Anna Test stellt Bob Muster als Betriebsleitung bei „Alpha“ ein. Die Belegschaft heißt die Verstärkung willkommen.', 'Anna Test hires Bob Muster as manager at “Alpha”. The staff welcome the new addition.'],
  ['Anna macht dir einen Heiratsantrag. Antworte unter „Spieler → Beziehung“.', 'Anna proposes to you. Reply under “Players → Relationship”.'],
  ['Trennung von Karl Becker.', 'Separation from Karl Becker.'],
  ['Neue Stelle: Alpha', 'New job: Alpha'],
  ['Börse', 'Stock market'],
];

test('Tagesblatt- und Bindungstexte werden vollständig übersetzt', () => {
  for (const [de, en] of CASES) assert.strictEqual(tr(de), en);
});
