'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ob = require('../src/game/onboarding');
const { upgradeState } = require('../src/game/state');

const base = (over = {}) => ({
  day: 0, status: 'alive', money: 4000, hunger: 0, meters: { fridge: 45, health: 100 },
  housing: { type: 'street' }, occupation: null, skills: { learned: ['baecker'] }, stats: { earned: 0 },
  properties: [], companies: [], children: [], partner: null, politics: { term: null, completed: {} },
  flags: {}, fx: { coins: 0, efs: 0, influence: 0 }, ...over,
});
const fresh = (over) => { const s = base(over); ob.initFresh(s); return s; };
const user = () => ({ meta: {} });

test('frischer Charakter: nichts erledigt, kein stilles Übernehmen', () => {
  const s = fresh(); const u = user();
  assert.deepEqual(ob.tick(s, u), []);
  assert.equal(Object.keys(s.flags.quests.done).length, 0);
});

test('Aufgaben erfüllen sich aus dem Spielstand und zahlen genau einmal pro Konto', () => {
  const s = fresh(); const u = user();
  s.flags.quests.seen.newspaper = true;
  assert.deepEqual(ob.tick(s, u), ['paper']);
  assert.equal(s.fx.efs, 2);
  assert.deepEqual(ob.tick(s, u), []); // nicht doppelt
  s.housing.type = 'pension'; s.occupation = { kind: 'work' };
  assert.deepEqual(ob.tick(s, u).sort(), ['job', 'shelter']);
  // Zweiter Charakter desselben Kontos: erledigt, aber ohne erneute Belohnung
  const s2 = fresh(); s2.flags.quests.seen.newspaper = true; const before = s2.fx.efs;
  assert.deepEqual(ob.tick(s2, u), ['paper']);
  assert.equal(s2.fx.efs, before);
});

test('Einzelprüfungen: Lohn, Wohnung, Sparen, zweiter Beruf, Betrieb, Vermietung, Wahl', () => {
  const s = fresh(); const u = user();
  s.stats.earned = 1; s.housing.type = 'rent'; s.money = 40000; s.skills.learned.push('tischler');
  s.companies = [{ id: 1 }]; s.properties = [{ lease: { on: true } }]; s.flags.quests.seen.vote = true; s.flags.quests.acts.buyFood = 1; s.flags.quests.acts.bizHire = 1;
  const done = ob.tick(s, u);
  for (const id of ['wage', 'home', 'save', 'skill2', 'business', 'hire', 'let', 'vote', 'food']) assert.ok(done.includes(id), id);
  assert.ok(!done.includes('market'));
});

test('Kühlschrank: sieben Tage durchgehend gefüllt; Hunger setzt zurück', () => {
  const s = fresh(); const u = user();
  ob.tick(s, u); assert.equal(s.flags.quests.fridgeSince, 0);
  s.day = 6; assert.ok(!ob.tick(s, u).includes('fridge7'));
  s.day = 7; assert.ok(ob.tick(s, u).includes('fridge7'));
  const t = fresh(); ob.tick(t, u); t.day = 5; t.hunger = 1; ob.tick(t, u); assert.equal(t.flags.quests.fridgeSince, null);
});

test('Altstand-Migration: Erfülltes wird still übernommen (ohne Belohnung), Rest bleibt offen', () => {
  const s = upgradeState(base({ day: 5000, money: 90000, housing: { type: 'own' }, occupation: { kind: 'work' }, stats: { earned: 5000 }, skills: { learned: ['a', 'b'] }, flags: { tutorial: true } }));
  assert.ok(s.flags.quests.legacy);
  const u = user();
  assert.deepEqual(ob.tick(s, u), []);
  assert.equal(s.fx.efs, 0);
  const d = s.flags.quests.done;
  for (const id of ['shelter', 'job', 'wage', 'home', 'save', 'skill2', 'fridge7']) assert.ok(d[id] != null, id);
  assert.equal(d.business, undefined);
  assert.ok(!s.flags.quests.legacy);
  assert.equal(u.meta.questRewarded, undefined);
});

test('seen/acts: nur erlaubte Marken, Willkommen am Konto', () => {
  const s = fresh(); const u = user();
  ob.markSeen(s, u, 'marketOffer'); ob.markSeen(s, u, 'evil'); ob.markSeen(s, u, 'welcome');
  assert.ok(s.flags.quests.seen.marketOffer); assert.ok(!s.flags.quests.seen.evil); assert.ok(u.meta.welcomed);
  assert.equal(ob.showWelcome(s, u), false);
  assert.equal(ob.showWelcome(fresh(), user()), true);
  assert.equal(ob.showWelcome(fresh({ day: 900 }), user()), false);
});

const V = (over = {}) => ({
  currency: 'DM', money: 4000, hunger: 0, meters: { fridge: 60, health: 90 }, housing: { type: 'rent', closed: false }, occupation: { kind: 'work' },
  flows: { net: 100, expense: 50 }, food: { tiers: [{ cost: 100 }, { cost: 300 }] }, properties: [], companies: [], children: [], notices: [], credit: { loans: [] }, efs: { pool: 10 }, partner: null, status: 'alive', ...over,
});

test('Berater: Hunger vor allem anderen, mit Ein-Klick-Kauf wenn bezahlbar', () => {
  const a = ob.advise(V({ hunger: 1, housing: { type: 'street' }, occupation: null }));
  assert.equal(a.top.id, 'food'); assert.equal(a.top.cta.kind, 'act'); assert.equal(a.top.cta.name, 'buyFood');
  assert.ok(a.more.length >= 1);
  const poor = ob.advise(V({ hunger: 1, money: 10 }));
  assert.equal(poor.top.cta.kind, 'go');
});

test('Berater: Straße, keine Arbeit, beschädigtes Haus, Kinder, Kredit, Ruhe', () => {
  assert.equal(ob.advise(V({ housing: { type: 'street' } })).top.id, 'shelter');
  assert.equal(ob.advise(V({ occupation: null })).top.id, 'job');
  const rep = ob.advise(V({ properties: [{ id: 3, name: 'Haus', closed: 40, repairCost: 500, condition: 50 }], money: 9000 }));
  assert.equal(rep.top.id, 'repair'); assert.equal(rep.top.cta.input.propertyId, 3);
  assert.equal(ob.advise(V({ children: [{ name: 'Anna', pendingSchool: true }] })).top.id, 'kids');
  const loan = ob.advise(V({ credit: { loans: [{ left: 1000 }] }, money: 50000 }));
  assert.equal(loan.top.id, 'loan');
  const calm = ob.advise(V());
  assert.equal(calm.top.id, 'calm'); assert.equal(calm.top.cta.kind, 'advance');
  const q = ob.advise(V(), { title: 'X', why: 'y', tab: 'newspaper', spot: 'nav:newspaper' });
  assert.equal(q.top.id, 'quest');
});

test('Freischalten: gesperrt zeigt Hinweis, Quest/Zeit/„Alle Funktionen“ öffnen, Politik bleibt erreichbar', () => {
  const s = base();
  let u = ob.unlocks(s, new Set(), false);
  assert.equal(u.business.open, false); assert.match(u.business.hint, /^Wird freigeschaltet, wenn /);
  assert.equal(u.exchange.open, false);
  u = ob.unlocks(s, new Set(['wage']), false); assert.equal(u.bank.open, true);
  u = ob.unlocks(s, new Set(['save']), false); assert.ok(u.business.open && u.society.open && u.elections.open);
  u = ob.unlocks(base({ day: 365 * 7 }), new Set(), false); assert.ok(Object.values(u).every((x) => x.open));
  u = ob.unlocks(s, new Set(), true); assert.ok(Object.values(u).every((x) => x.open && x.hint === ''));
  u = ob.unlocks(base({ companies: [{}] }), new Set(), false); assert.ok(u.business.open && u.exchange.open);
});

test('Aufgaben-Definitionen: eindeutige ids, Pflichtfelder', () => {
  const ids = ob.QUESTS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const q of ob.QUESTS) { assert.ok(q.title && q.why && q.tab && q.spot && typeof q.done === 'function', q.id); }
});

test('Englisch: Aufgaben, Freischalt-Hinweise und Glossar sind übersetzt', () => {
  const g = require('../src/i18n-game');
  const missing = [];
  for (const q of ob.QUESTS) for (const t of [q.title, q.why]) if (g.tr(t) === t) missing.push(t);
  for (const u of ob.UNLOCKS) for (const t of [u.cond]) if (g.tr(t) === t) missing.push(t);
  const hint = ob.unlocks(base(), new Set(), false).business.hint;
  if (g.tr(hint) === hint || /Wird freigeschaltet/.test(g.tr(hint))) missing.push(hint);
  const adv = ob.advise(V({ hunger: 1, housing: { type: 'street' }, occupation: null, properties: [{ id: 1, name: 'Haus', closed: 30, repairCost: 1, condition: 10 }], children: [{ name: 'A', pendingSchool: true }] }));
  for (const a of [adv.top, ...adv.more]) for (const t of [a.title, a.why, a.cta.label]) if (g.tr(t) === t) missing.push(t);
  assert.deepEqual(missing, []);
  const c = require('../src/i18n-data/client-I');
  const src = require('fs').readFileSync(require('path').join(__dirname, '../public/js/game/glossary.js'), 'utf8');
  assert.equal([...src.matchAll(/^  \['/gm)].length, c.GLOSSARY_EN_COUNT);
});
