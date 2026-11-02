'use strict';
/** Werben, Ehe und Familienunternehmen: englische Texte (Katalog, Meldungen, Fehler, Tagesblatt, Aufgaben) und Oberfläche. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const g = require('../src/i18n-game');
const i18n = require('../src/i18n');
const D = require('../src/game/dynasty-defaults');
const ob = require('../src/game/onboarding');
const R = require('../src/game/reputation');

function clientTranslator() {
  let js = '';
  i18n.dictScript({}, { type() { return this; }, set() { return this; }, send(x) { js = x; } });
  const src = fs.readFileSync(path.join(__dirname, '../public/js/i18n.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'window.__tr=tr;})();');
  const sb = { window: {}, document: { body: null, addEventListener() {} }, NodeFilter: {}, MutationObserver: function () {} };
  vm.createContext(sb); vm.runInContext(js, sb); vm.runInContext(src, sb);
  return (s) => sb.window.__tr(s);
}

test('Englisch (Server): Katalog der Vorlieben, Aktionen, Familienklassen, Eheverträge, Ringe, Traditions- und Dynastiestufen, Aufgaben, Freischaltung und Ansehen sind übersetzt', () => {
  const miss = [];
  const chk = (t) => { if (typeof t === 'string' && t && g.tr(t) === t) miss.push(t); };
  for (const t of Object.values(D.woo.likes)) chk(t);
  for (const a of Object.values(D.woo.acts)) { chk(a.label); chk(a.text); for (const [, n] of a.names || []) chk(n); }
  for (const c of D.family.classes) chk(c.name);
  for (const k of Object.values(D.contract.kinds)) { chk(k.name); chk(k.short); chk(k.text); }
  for (const L of D.ring.levels) { for (const [, n] of L.names) chk(n); chk(L.text); }
  for (const L of D.tradition.levels) chk(L.name);
  for (const L of D.dynasty.levels) chk(L.name);
  for (const b of ['skeptisch', 'aufgeschlossen', 'angetan', 'begeistert']) chk(b);
  for (const id of ['marry', 'succession']) { const q = ob.QUESTS.find((x) => x.id === id); chk(q.title); chk(q.why); }
  const u = ob.UNLOCKS.find((x) => x.key === 'dynasty'); chk(u.label); chk(u.cond);
  for (const r of ['fam_wedding', 'fam_trad', 'fam_succession']) { chk(R.REASONS ? R.REASONS[r].label : ''); chk(R.REASONS ? R.REASONS[r].why : ''); }
  assert.deepStrictEqual([...new Set(miss)], []);
});

test('Englisch (Server): Meldungen, Rückmeldungen, Fehler, Tagesblatt und Hinweise mit Namen und Zahlen (auch mehrere Sätze)', () => {
  const cases = [
    ['Ihr habt euch kennengelernt: Renate. Pflege die Bekanntschaft unter „Familie“ – Treffen, Briefe und Gespräche lassen die Sympathie wachsen.', 'You have met: Renate. Nurture the acquaintance under “Family” – meetings, letters and conversations make the affection grow.'],
    ['Renate strahlt – das war genau das Richtige. Sympathie +8.', 'Renate beams – that was exactly the right thing. Affection +8.'],
    ['Renate lächelt höflich – nett, aber nicht mehr. Sympathie +2. Renate mag: Gutes Essen und Genuss.', 'Renate smiles politely – nice, but no more. Affection +2. Renate likes: Good food and enjoyment.'],
    ['Das kam bei Renate nicht gut an. Sympathie -4. Anna hört davon und ist ein wenig enttäuscht.', 'That did not go down well with Renate. Affection -4. Anna hears about it and is a little disappointed.'],
    ['Ihr seid jetzt ein Paar: Renate Weber.', 'You\'re a couple now: Renate Weber.'],
    ['Renate braucht noch Zeit. Versuche es später noch einmal.', 'Renate still needs time. Try again later.'],
    ['Renate möchte lieber Freunde bleiben. Die Bekanntschaft endet.', 'Renate would rather stay friends. The acquaintance ends.'],
    ['Antrittsbesuch bei der Familie von Renate: Wohlhabende Familie. Die Familie lernt dich kennen.', 'First visit to the family of Renate: Wealthy family. The family gets to know you.'],
    ['Ihr habt geheiratet! Die Familie von Renate bringt 3,9k DM als Aussteuer ein.', 'You got married! The family of Renate brings in 3.9k DM as a dowry.'],
    ['Ihr habt geheiratet! Die Familie von Renate bringt den Familienbetrieb „Weber & Söhne“ ein.', 'You got married! The family of Renate brings in the family business “Weber & Söhne”.'],
    ['Der Scheidungsantrag ist gestellt. Nach dem Trennungsjahr (365 Tage) wird die Ehe geschieden.', 'The divorce petition has been filed. After the year of separation (365 days) the marriage will be dissolved.'],
    ['Laut Ehevertrag („Zugewinngemeinschaft“) gehen 12,5k DM an Eva; 2 Kind(er) ziehen mit.', 'According to the marriage contract (“Community of accrued gains”), 12.5k DM go to Eva; 2 child(ren) go with them.'],
    ['Laut Ehevertrag („Gütertrennung“) gibt es keinen Ausgleich; 1 Kind(er) ziehen mit.', 'According to the marriage contract (“Separation of property”) there is no settlement; 1 child(ren) go with them.'],
    ['An die Familie von Eva gehen zurück: Geld-Aussteuer, Brotladen.', 'Returned to the family of Eva: Cash dowry, Brotladen.'],
    ['Karl beginnt eine Lehre im Familienbetrieb „Brotladen“.', 'Karl starts an apprenticeship in the family business “Brotladen”.'],
    ['Karl arbeitet ab jetzt im Familienbetrieb „Brotladen“ mit.', 'Karl now works in the family business “Brotladen”.'],
    ['Zur Einarbeitung muss ein Kind mindestens 15 Jahre alt sein.', 'A child must be at least 15 years old to be trained in the business.'],
    ['Eine Übergabe zu Lebzeiten ist ab 55 Jahren möglich.', 'A handover during your lifetime is possible from age 55.'],
    ['„Brotladen“ gehört jetzt Karl. Steuer 1,2k DM, Gebühren 3k DM. Du bist jetzt im Ruhestand.', '“Brotladen” now belongs to Karl. Tax 1.2k DM, fees 3k DM. You are retired now.'],
    ['Karl Becker übergibt „Brotladen“ in Köln an die nächste Generation.', 'Karl Becker hands “Brotladen” in Cologne over to the next generation.'],
    ['Ein Bürger übergibt einen Familienbetrieb in Köln an die nächste Generation.', 'A citizen hands a family business in Cologne over to the next generation.'],
    ['Ein Familienbetrieb in Köln ist jetzt ein Traditionsunternehmen.', 'A family business in Cologne is now a Traditional company.'],
    ['Brotladen wird zum „Traditionsunternehmen“.', 'Brotladen becomes a “Traditional company”.'],
    ['Seit 52 Jahren gehört der Betrieb der Familie; 2 Generationen führen ihn. Kunden schätzen das: etwas mehr Umsatz und Ansehen.', 'For 52 years the business has belonged to the family; 2 generations have run it. Customers appreciate that: a little more revenue and standing.'],
    ['Die Familie Becker gilt jetzt als „Alteingesessene Familie“. Generationen, Familienbetriebe, Ansehen und Zusammenhalt zahlen sich aus.', 'The Becker family is now regarded as “Old-established family”. Generations, family businesses, standing and cohesion pay off.'],
    ['Renate wartet auf deinen Antrag', 'Renate is waiting for your proposal'],
    ['Melde dich bei Renate', 'Get in touch with Renate'],
    ['Anna im Familienbetrieb einarbeiten', 'Train Anna in the family business'],
    ['Gib Renate einen Moment – ihr habt euch gerade erst gesehen (noch 2 Tage).', 'Give Renate a moment – you have only just seen each other (2 more days).'],
    ['Du kannst höchstens 3 Bekanntschaften gleichzeitig pflegen.', 'You can keep at most 3 acquaintances at the same time.'],
    ['Renate möchte dich im Moment nicht sehen. Gib dem Ganzen Zeit.', 'Renate does not want to see you at the moment. Give it some time.'],
    ['Ein Familienbetrieb über Generationen genießt Vertrauen.', 'A family business over generations enjoys trust.'],
  ];
  const bad = cases.filter(([de, en]) => g.tr(de) !== en).map(([de]) => `${de} -> ${g.tr(de)}`);
  assert.deepStrictEqual(bad, []);
});

test('Englisch (Oberfläche): feste Texte der Familien-Oberfläche, Glossar, Einsteiger-Spots sind übersetzt', () => {
  const tr = clientTranslator();
  const missing = [];
  for (const f of ['public/js/game/dyn.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const m of src.matchAll(/>([^<>$`{}?]{4,}?)</g)) { const t = m[1].trim(); if (!/[A-Za-zÄÖÜäöüß]{3}/.test(t) || /^[\W\d]+$/.test(t)) continue; if (tr(t) === null) missing.push(t); }
    for (const m of src.matchAll(/(?:title|ok|label|text|placeholder|aria-label)(?:=|: )['"]([A-ZÄÖÜ][^'"$\n]{3,})['"]/g)) { if (tr(m[1]) === null) missing.push(m[1]); }
    for (const m of src.matchAll(/(?:\? |: )'([A-ZÄÖÜ][^'$\n]{3,})'/g)) { if (tr(m[1]) === null && !/^[A-Z]+$/.test(m[1])) missing.push(m[1]); }
  }
  const gl = fs.readFileSync(path.join(__dirname, '../public/js/game/glossary-dyn.js'), 'utf8');
  for (const m of gl.matchAll(/^\s*\['([^']+)', '([^']+)', '((?:[^'\\]|\\.)+)'\]/gm)) for (const t of [m[2], m[3]]) if (tr(t) === null) missing.push(t);
  const ob2 = fs.readFileSync(path.join(__dirname, '../public/js/game/onboarding.js'), 'utf8');
  for (const id of ['woo', 'marry', 'groom']) { const m = new RegExp(`  ${id}: \\{ sel: '[^']*(?:'[^']*')*[^']*', text: '([^']+)' \\}`).exec(ob2); if (m && tr(m[1]) === null) missing.push(m[1]); }
  const intro = /  family: \['([^']+)', 'woo', '([^']+)'\]/.exec(ob2); for (const t of [intro[1], intro[2]]) if (tr(t) === null) missing.push(t);
  for (const t of ['Kennenlernen', 'Zur Familie', 'Du pflegst gerade Bekanntschaften.']) if (tr(t) === null) missing.push(t);
  assert.deepStrictEqual([...new Set(missing)], []);
  assert.strictEqual(tr('Stufe 3 von 5'), 'Level 3 of 5');
});
