'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const g = require('../src/i18n-game');
const i18n = require('../src/i18n');
const D = require('../src/game/character-defaults');
const CH = require('../src/game/character');
const ob = require('../src/game/onboarding');

function clientTranslator() {
  let js = '';
  i18n.dictScript({}, { type() { return this; }, set() { return this; }, send(x) { js = x; } });
  const src = fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'window.__tr=tr;})();');
  const sb = { window: {}, document: { body: null, addEventListener() {} }, NodeFilter: {}, MutationObserver: function () {} };
  vm.createContext(sb); vm.runInContext(js, sb); vm.runInContext(src, sb);
  return (s) => sb.window.__tr(s);
}

test('Englisch (Server): Katalog der Plätze, Stufen, Ränge, Quellen, Aufgaben und Freischaltung sind übersetzt', () => {
  const miss = [];
  const same = new Set(['Limousine', 'Laptop']); // gleiche Schreibweise in beiden Sprachen
  const chk = (t) => { if (typeof t === 'string' && t && !same.has(t) && g.tr(t) === t) miss.push(t); };
  for (const S of Object.values(D.gear.items)) { chk(S.name); chk(S.what); for (const L of S.levels) { chk(L.text); for (const [, n] of L.names) chk(n); } }
  for (const r of D.rank.ranks) { chk(r.name); chk(r.text); }
  for (const s of Object.values(D.xp.sources)) { chk(s.label); chk(s.text); }
  for (const b of CH.BANDS) chk(b);
  chk('Alltagskleidung');
  for (const id of ['xp', 'gear', 'rank']) { const q = ob.QUESTS.find((x) => x.id === id); chk(q.title); chk(q.why); }
  const u = ob.UNLOCKS.find((x) => x.key === 'character'); chk(u.label); chk(u.cond);
  assert.deepStrictEqual([...new Set(miss)], []);
});

test('Englisch (Server): Meldungen, Rückmeldungen, Fehler, Tagesblatt und Hinweise mit Namen und Zahlen', () => {
  const cases = [
    ['Neuer Rang: Prominenz', 'New rank: Prominent figure'],
    ['Dein gesellschaftlicher Rang ist jetzt „Prominenz“. Ein Name mit Gewicht: Einladungen und Vorteile kommen von selbst.', 'Your social rank is now “Prominent figure”. A name with weight: invitations and advantages come by themselves.'],
    ['Karl steigt zum Rang „Bürger“ auf.', 'Karl rises to the rank of “Citizen”.'],
    ['Gekauft: Sonntagsanzug (14,00 DM).', 'Bought: Sunday suit (14.00 DM).'],
    ['Gewechselt zu Maßanzug vom Schneider (45,00 DM, altes Stück angerechnet: 6,00 DM).', 'Changed to Tailored suit (45.00 DM, old piece traded in: 6.00 DM).'],
    ['Karl kauft: Sonntagsanzug.', 'Karl buys: Sunday suit.'],
    ['Markenuhr verkauft (30,00 DM).', 'Branded watch sold (30.00 DM).'],
    ['Aktentasche aufgearbeitet (2,00 DM).', 'Briefcase refurbished (2.00 DM).'],
    ['Wachdienst für das Zuhause gebucht (0,40 DM pro Tag).', 'Security patrol for your home booked (0.40 DM per day).'],
    ['Friseur und Pflege beendet.', 'Hairdresser and grooming ended.'],
    ['Handwerk steigt auf 62 (5 EP).', 'Crafts rises to 62 (5 EP).'],
    ['Erfahrung verteilt: 3 Talente gesteigert (12 EP).', 'Experience distributed: 3 talents increased (12 EP).'],
    ['Karl entwickelt sich weiter (3 Talente).', 'Karl keeps developing (3 talents).'],
    ['Das Talent braucht noch 9 Tage Pause.', 'The talent needs a break of 9 more days.'],
    ['Alarmanlage mit Wachdienst gibt es erst ab 1990.', 'Alarm system with security patrol is not available until 1990.'],
    ['Dafür fehlt Erfahrung.', 'You lack the experience for that.'],
    ['Du hast 5,2 Erfahrungspunkte – verteile sie', 'You have 5,2 experience points – distribute them'],
    ['Ein Sonntagsanzug kostet nur 14,00 DM und hilft bei Gehaltsgesprächen, Bewerbungen und Wahlen ein wenig.', 'A Sunday suit costs only 14.00 DM and helps a little in pay talks, applications and elections.'],
    ['Maßanzug vom Schneider ist abgenutzt', 'Tailored suit is worn out'],
    ['Aufarbeiten (2,00 DM)', 'Refurbish (2.00 DM)'],
    ['Karl Becker steigt in Köln zum Rang „Prominenz“ auf.', 'Karl Becker rises to the rank of “Prominent figure” in Cologne.'],
    ['Zu viele Aktionen in kurzer Zeit – bitte kurz warten.', 'Too many actions in a short time – please wait a moment.'],
  ];
  const bad = cases.filter(([de, en]) => g.tr(de) !== en).map(([de]) => `${de} -> ${g.tr(de)}`);
  assert.deepStrictEqual(bad, []);
});

test('Englisch (Oberfläche): feste Texte des Charakterblatts, Innenraum, Glossar, Einsteiger-Spots und Zeitung sind übersetzt', () => {
  const tr = clientTranslator();
  const missing = [];
  for (const f of ['public/js/game/char.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const m of src.matchAll(/>([^<>$`{}?]{4,}?)</g)) {
      const t = m[1].trim(); if (!/[A-Za-zÄÖÜäöüß]{3}/.test(t) || /^[\W\d]+$/.test(t)) continue;
      if (tr(t) === null) missing.push(t);
    }
    for (const m of src.matchAll(/(?:title|ok|label|text|placeholder|aria-label)(?:=|: )['"]([A-ZÄÖÜ][^'"$\n]{3,})['"]/g)) { if (tr(m[1]) === null) missing.push(m[1]); }
    for (const m of src.matchAll(/(?:\? |: )'([A-ZÄÖÜ][^'$\n]{3,})'/g)) { if (tr(m[1]) === null && !/^[A-Z]+$/.test(m[1])) missing.push(m[1]); }
  }
  const gl = fs.readFileSync(path.join(__dirname, '../public/js/game/glossary-char.js'), 'utf8');
  for (const m of gl.matchAll(/^\s*\['([^']+)', '([^']+)', '((?:[^'\\]|\\.)+)'\]/gm)) for (const t of [m[2], m[3]]) if (tr(t) === null) missing.push(t);
  for (const t of ['Garderobe', 'Garderobe – Charakterblatt', 'Charakterblatt öffnen', 'Talente, Ausstattung und gesellschaftlicher Rang', 'Charakter', 'Vorab-Angebot', 'Ein Vorab-Angebot für Persönlichkeiten mit hohem gesellschaftlichem Rang', 'Rang']) if (tr(t) === null) missing.push(t);
  const ob2 = fs.readFileSync(path.join(__dirname, '../public/js/game/onboarding.js'), 'utf8');
  for (const id of ['xp', 'gear', 'rank']) { const m = new RegExp(`  ${id}: \\{ sel: '[^']*(?:'[^']*')*[^']*', text: '([^']+)' \\}`).exec(ob2); if (m && tr(m[1]) === null) missing.push(m[1]); }
  const intro = /character: \['([^']+)', 'xp', '([^']+)'\]/.exec(ob2); for (const t of [intro[1], intro[2]]) if (tr(t) === null) missing.push(t);
  assert.deepStrictEqual([...new Set(missing)], []);
  assert.strictEqual(tr('Stufe 2 von 3'), 'Level 2 of 3');
});
