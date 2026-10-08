'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const game = require('../src/i18n-game');
const i18n = require('../src/i18n');

const SERVER = [
  ['Der Spielermarkt ist gerade geschlossen.', 'The player market is closed right now.'],
  ['Du hast schon 5 offene Angebote.', 'You already have 5 open offers.'],
  ['Ein Spieler möchte „Villa Sonne“ kaufen. Antworte unter „Spieler → Markt“.', 'A player wants to buy “Villa Sonne”. Reply under “Players → Market”.'],
  ['Anna erwirbt Villa Sonne bei der Zwangsversteigerung.', 'Anna acquires Villa Sonne at the foreclosure auction.'],
  ['Anna erwirbt Villa Sonne von Karl.', 'Anna acquires Villa Sonne from Karl.'],
  ['Immobilie gekauft: Villa Sonne', 'Property bought: Villa Sonne'],
  ['Du hast Villa Sonne für 1.200,00 DM (plus 60,50 DM Gebühren) erworben.', 'You acquired Villa Sonne for 1,200.00 DM (plus 60.50 DM fees).'],
  ['Die Börse ist geschlossen.', 'The stock exchange is closed.'],
  ['Du besitzt nur 3 Anteile.', 'You only own 3 shares.'],
  ['Börsengang: Bäckerei Koch', 'IPO: Bäckerei Koch'],
  ['Für die Übernahme brauchst du mindestens 50 Prozent der Anteile.', 'For the takeover you need at least 50 percent of the shares.'],
  ['Du wohnst jetzt zur Miete bei Karl Becker.', 'You now rent from Karl Becker.'],
  ['Du kannst nicht bei dir selbst mieten.', 'You cannot rent from yourself.'],
  ['Mietvertrag beendet', 'Tenancy ended'],
  ['Der Wettbewerb ist gerade abgeschaltet.', 'Competition is switched off right now.'],
  ['Sabotage gegen Gasthaus Linde', 'Sabotage against Gasthaus Linde'],
  ['Erfolgreich: ein Mitarbeiter wechselt zu dir. Niemand weiß, dass du es warst.', 'Successful: an employee switches to you. Nobody knows it was you.'],
  ['Bei Gasthaus Linde wurde ein Mitarbeiter abgeworben. Täter: Karl.', 'An employee was poached at Gasthaus Linde. Culprit: Karl.'],
  ['Bei Gasthaus Linde gab es einen Anschlag: Maschinen beschädigt, 6 Tage Produktionsausfall (Reparatur von der Versicherung gezahlt). Der Täter ist unbekannt. Der Angriff wurde abgewehrt.', 'There was an attack at Gasthaus Linde: machines damaged, 6 days of production outage (repair paid by the insurance). The culprit is unknown. The attack was fended off.'],
  ['Wert 100 · Gewinn/Tag 5 · Kasse 20 · 3 Mitarbeiter · Sicherheitsdienst (Beträge in Wert von 1945).', 'Value 100 · profit/day 5 · cash 20 · 3 employees · security service (amounts in 1945 value).'],
  ['Kredit bewilligt: 4,5 % p. a., Rate 12,00 DM pro Tag.', 'Loan approved: 4.5 % p.a., installment 12.00 DM per day.'],
  ['Das übersteigt deinen Kreditrahmen.', 'That exceeds your credit limit.'],
  ['Neue Bewerbung', 'New application'],
  ['Das Gebot muss mindestens 1.200 (Wert 1945) betragen.', 'The bid must be at least 1,200 (1945 value).'],
];

test('Serverseitige Meldungen werden ins Englische übersetzt', () => {
  for (const [de, en] of SERVER) assert.strictEqual(game.tr(de), en, de);
});

function clientTranslator() {
  let js = '';
  i18n.dictScript({}, { type() { return this; }, set() { return this; }, send(x) { js = x; } });
  const src = fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'window.__tr=tr;})();');
  const sb = { window: {}, document: { body: null, addEventListener() {} }, NodeFilter: {}, MutationObserver: function () {} };
  vm.createContext(sb); vm.runInContext(js, sb); vm.runInContext(src, sb);
  return (s) => sb.window.__tr(s);
}

const CLIENT = [
  ['Stadtverzeichnis', 'City directory'],
  ['3 Einwohner · Beträge in heutigen Preisen', '3 residents · amounts in today’s prices'],
  ['5 Zimmer · Zustand 80 % · Eigentümer:', '5 rooms · condition 80 % · owner:'],
  ['Angebot für „Villa Sonne“', 'Offer for “Villa Sonne”'],
  ['Dein Gebot (DM)', 'Your bid (DM)'],
  ['Versteigerung von Karl · Marktwert 1.200 DM · Mindestgebot 700 DM · endet in 3 Std 4 Min', 'Auction by Karl · Market value 1.200 DM · Minimum bid 700 DM · ends in 3 h 4 min'],
  ['Wert 5 DM · Höchstgebot 7 DM (du) · endet in 1 T 3 Std', 'Value 5 DM · Highest bid 7 DM (you) · ends in 1 d 3 h'],
  ['Dein Kaufangebot an Karl · läuft bis 3.4.2026', 'Your purchase offer to Karl · runs until 3.4.2026'],
  ['Kurs 5 DM · Fairer Wert 6 DM · Du besitzt 10 Anteile. Ein Kauf reserviert den Höchstpreis sofort; zu viel gezahltes Geld kommt zurück. Nicht ausgeführte Teile bleiben als Order offen.', 'Price 5 DM · Fair value 6 DM · You own 10 shares. A purchase reserves the maximum price immediately; any overpaid money is refunded. Unfilled parts remain as an open order.'],
  ['Verkauf: 3 × 12 DM, 2 × 14 DM · kein Kaufgebot', 'Asks: 3 × 12 DM, 2 × 14 DM · no bids'],
  ['+1,5 %', '+1.5 %'],
  ['Restschuld · 5,0 % · Rate 12 DM / Tag · noch 3 J. 2 Mon.', 'Remaining debt · 5.0 % · installment 12 DM / day · 3 y. 2 mo. left'],
  ['Börsennotiert, 30 % Ausschüttung', 'Listed, 30 % payout'],
  ['Berlin (dein Wohnort) – anderen Ort lesen …', 'Berlin (your home city) – read another place …'],
  ['Konkurrenz: 3 Betriebe dieser Art in Berlin, 5 von 8 Räumen Nachfrage – Umsatz ×0,9', 'Competition: 3 businesses of this kind in Berlin, 5 of 8 rooms of demand – revenue ×0.9'],
  ['Du unterbietest die Preise: Der Umsatz des Betriebs sinkt für einige Tage. (−18 % Umsatz, 14 Tage)', 'You undercut the prices: the business’s revenue drops for a few days. (−18 % revenue, 14 days)'],
  ['Auch an Spieler vermieten', 'Also let to players'],
  ['Mietersuche · 5 Tage leer', 'Looking for tenants · 5 days vacant'],
  ['Mieter kündigen?', 'Give the tenant notice?'],
  ['Bank & Kredite', 'Bank & loans'],
  ['−86k DM (Wert 1945)', '−86k DM (1945 value)'],
  ['Sachsen-Anhalt', 'Saxony-Anhalt'],
];

test('Oberflächentexte (exakt, Vorlagen, Teilzeilen) werden ins Englische übersetzt', () => {
  const tr = clientTranslator();
  for (const [de, en] of CLIENT) assert.strictEqual(tr(de), en, de);
});
