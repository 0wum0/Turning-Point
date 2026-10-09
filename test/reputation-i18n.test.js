'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../src/i18n-game');
const R = require('../src/game/reputation');
const ob = require('../src/game/onboarding');

test('Englisch: Ereignisse, Stufen, Bestandteile, Tipps und Sperrtexte sind übersetzt', () => {
  const miss = [];
  const chk = (t) => { if (g.tr(t) === t) miss.push(t); };
  for (const v of Object.values(R.REASONS)) { chk(v.label); chk(v.why); }
  for (const t of R.TIPS) { chk(t.title); chk(t.text); }
  for (const k of R.KINDS) { chk(R.KIND_LABEL[k]); chk(R.KIND_HINT[k]); }
  for (const l of R.LEVELS) chk(l.name);
  for (let lv = -1; lv <= 4; lv++) chk(R.needText(lv));
  assert.deepStrictEqual(miss, []);
  assert.strictEqual(g.tr('Anständig'), 'Decent');
  assert.strictEqual(g.tr('Dafür brauchst du mindestens Ansehen: Honoratior.'), 'You need at least this standing: Notable.');
});

test('Englisch: Fehlermeldungen, Briefe und Ehrenbürgerwürde (Vorlagen mit Namen und Zahlen)', () => {
  const cases = [
    ['Die Bank vergibt keinen Kredit. Dafür brauchst du mindestens Ansehen: Anständig.', 'The bank does not grant a loan. You need at least this standing: Decent.'],
    ['Die Börse nimmt dich so nicht auf. Dafür brauchst du mindestens Ansehen: Anständig.', 'The stock exchange will not admit you like this. You need at least this standing: Decent.'],
    ['Der Preis muss zwischen 87 % und 118 % des Marktpreises liegen. (Dein Ansehen „Angesehen“ weitet den Rahmen.)', 'The price must be between 87 % and 118 % of the market price. (Your standing “Respected” widens the range.)'],
    ['Die Leute reden gut über dich: Dein Ansehen ist jetzt „Angesehen“. Unter „Übersicht → Ansehen“ siehst du, warum.', 'People speak well of you: your standing is now “Respected”. Under “Overview → Standing” you can see why.'],
    ['Karl Becker ist in Verruf geraten: Man spricht von Sabotage, Zahlungsausfällen und gebrochenen Verträgen.', 'Karl Becker has fallen into disrepute: people talk of sabotage, missed payments and broken contracts.'],
    ['Neuer Ehrenbürger von Braunschweig: Karl.', 'New honorary citizen of Braunschweig: Karl.'],
    ['Karl hat vor Ort noch zu wenig Ansehen (nötig: Anständig).', 'Karl does not have enough standing locally yet (needed: Decent).'],
    ['Karl wird Ehrenbürger von Braunschweig: Gemeinwohl +8, örtliches Ansehen +15. Du gewinnst selbst ein wenig Amtsansehen. Das geht nur einmal pro Amtszeit. Danach wäre Karl vor Ort „Angesehen“ (jetzt: Anständig).',
      'Karl becomes an honorary citizen of Braunschweig: public good +8, local standing +15. You gain a little standing in office yourself. This is possible only once per term. Afterwards Karl would be “Respected” locally (now: Decent).'],
    ['Karl Becker verleiht dir die Ehrenbürgerwürde von Braunschweig. Dein Ansehen vor Ort ist gestiegen.', 'Karl Becker awards you the honorary citizenship of Braunschweig. Your standing locally has risen.'],
    ['Karl Becker verleiht Anna Roth die Ehrenbürgerwürde von Braunschweig.', 'Karl Becker awards Anna Roth the honorary citizenship of Braunschweig.'],
    ['Nur ein amtierender Bürgermeister kann die Ehrenbürgerwürde verleihen.', 'Only a serving mayor can award honorary citizenship.'],
  ];
  const bad = cases.filter(([de, en]) => g.tr(de) !== en).map(([de]) => de);
  assert.deepStrictEqual(bad, []);
});

test('Englisch: Einsteiger-Aufgabe und Hinweise zum Ansehen', () => {
  const q = ob.QUESTS.find((x) => x.id === 'standing');
  assert.ok(q && g.tr(q.title) !== q.title && g.tr(q.why) !== q.why);
  const adv = ob.advise({ currency: 'DM', money: 10, meters: { fridge: 80, health: 90 }, status: 'alive', occupation: { name: 'x' }, housing: { type: 'rent' }, flows: { net: 5, expense: 5, exp: { lodging: 100 } }, rep: { lv: -2 }, efs: { pool: 0 }, children: [], properties: [], companies: [], notices: [] });
  const items = [adv.top, ...adv.more];
  const ids = items.map((a) => a.id);
  assert.ok(ids.includes('rentrisk') || ids.includes('repbad'), ids.join());
  for (const a of items) for (const t of [a.title, a.why, a.cta.label]) if (/Miete|Ruf|Ansehen/.test(t)) assert.notStrictEqual(g.tr(t), t, t);
});

function clientTranslator() {
  const vm = require('vm'); const fs = require('fs'); const path = require('path'); const i18n = require('../src/i18n');
  let js = '';
  i18n.dictScript({}, { type() { return this; }, set() { return this; }, send(x) { js = x; } });
  const src = fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'window.__tr=tr;})();');
  const sb = { window: {}, document: { body: null, addEventListener() {} }, NodeFilter: {}, MutationObserver: function () {} };
  vm.createContext(sb); vm.runInContext(js, sb); vm.runInContext(src, sb);
  return (s) => sb.window.__tr(s);
}

test('Englisch (Oberfläche): feste Texte der Ansehen-Oberfläche sind übersetzt', () => {
  const tr = clientTranslator(); const fs = require('fs'); const path = require('path');
  const files = ['public/js/game/reputation.js', 'public/js/game/glossary-rep.js'];
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    // statische Textknoten zwischen > und <, ohne Platzhalter
    for (const m of src.matchAll(/>([^<>$`{}]{4,}?)</g)) {
      const t = m[1].trim(); if (/'neg'|\? '/.test(t) || !/[A-Za-zÄÖÜäöüß]{3}/.test(t) || /^[\W\d]+$/.test(t) || /^\s*[·×]\s*$/.test(t)) continue;
      if (tr(t) === null) missing.push(t);
    }
    // Zeichenketten in Anführungszeichen, die wie Sätze aussehen (Glossar, Wirkungen, Hinweise)
    for (const m of src.matchAll(/'([A-ZÄÖÜ][^'\n]{12,})'/g)) { const t = m[1]; if (/^[A-Za-z]+\.[a-z]/.test(t) || /http|\/api|class=/.test(t)) continue; if (tr(t) === null) missing.push(t); }
  }
  assert.deepStrictEqual([...new Set(missing)], []);
  assert.strictEqual(tr('Anständig'), 'Decent');
  assert.strictEqual(tr('Karl zum Ehrenbürger ernennen?'), 'Make Karl an honorary citizen?');
  assert.strictEqual(tr('Ansehen & Ruf'), 'Standing & reputation');
});
