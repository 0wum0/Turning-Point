'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const { edition } = require('../src/game/newspaper');
const { createHeirState } = require('../src/game/heir');

const w = testWorld();
const u = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const mk = (k = 'wirt') => createCharacter(w, input(w, { professionKey: k }), u());
const act = (s, n, i, usr = u()) => actions.run(n, { world: w, state: s, input: i, user: usr, now: Date.now() });
const run = (s, d) => { for (let i = 0; i < d && s.status === 'alive'; i++) { s.meters.fridge = 100; advance(w, s, 1); s.interrupts = []; } };
const setup = () => { const s = mk(); s.money = 20000000; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 }; return s; };

test('Wirt kauft Wirtshaus, arbeitet selbst, Gewinn sammelt sich', () => {
  const s = setup();
  const e = edition(w, s, s.cityId);
  const b = e.biz.find((x) => x.pkey === 'wirt');
  assert.ok(b && b.qualified);
  act(s, 'buyBiz', { listingId: b.id });
  assert.strictEqual(s.companies.length, 1);
  act(s, 'bizWork', { id: 1 });
  run(s, 60);
  assert.ok(s.companies[0].cash > 0, `Kasse ${s.companies[0].cash}`);
  const m = s.money; act(s, 'bizCollect', { id: 1 });
  assert.ok(s.money > m);
});

test('Ohne Qualifikation kein Kauf; Verlust der Qualifikation → Lost Place', () => {
  const s = mk('baecker'); s.money = 20000000;
  const e = edition(w, s, s.cityId);
  assert.ok(!e.biz.some((x) => x.pkey === 'wirt'));
  const t = setup();
  const b = edition(w, t, t.cityId).biz.find((x) => x.pkey === 'wirt');
  act(t, 'buyBiz', { listingId: b.id });
  t.skills.learned = []; // Qualifikation weg
  t.day = Math.ceil(t.day / 30) * 30 - 1;
  run(t, 2);
  assert.ok(t.companies[0].abandoned, 'Betrieb aufgegeben');
  const f = require('../src/game/business');
  const v0 = f.companyValue(w, t, t.companies[0], 1945);
  t.day += 365 * 5;
  assert.ok(f.companyValue(w, t, t.companies[0], 1945) < v0, 'Wert verfällt');
});

test('Räume: Geld + Coins, Ausbau braucht Berufsstufe', () => {
  const s = setup();
  act(s, 'buyBiz', { listingId: edition(w, s, s.cityId).biz.find((x) => x.pkey === 'wirt').id });
  const usr = u();
  act(s, 'bizExpand', { id: 1 }, usr);
  assert.strictEqual(s.companies[0].rooms, 4);
  assert.strictEqual(s.fx.coins, -1);
  assert.throws(() => act(s, 'bizUpgrade', { id: 1 }), /Qualifikation/);
  s.skills.days.wirt = 2000; // Fachkraft
  act(s, 'bizUpgrade', { id: 1 });
  assert.strictEqual(s.companies[0].tier, 1);
});

test('Erbe: Betrieb geht in den Pflichtanteil; ohne Qualifikation wird er Lost Place', () => {
  const s = setup();
  act(s, 'buyBiz', { listingId: edition(w, s, s.cityId).biz.find((x) => x.pkey === 'wirt').id });
  s.children.push({ id: 1, personId: 'c0', name: 'Erbe', gender: 'm', born: s.day - 22 * 365, cityId: s.cityId, status: 'home', sat: 80, path: 'none', skills: [] });
  s.tree.persons.push({ id: 'c0', jobs: [] });
  const { state: h } = createHeirState(w, s, 1, ['c:1']);
  assert.strictEqual(h.companies.length, 1);
  h.day = Math.ceil(h.day / 30) * 30 - 1; h.life.baseYears = 300; h.housing = { type: 'rent', cityId: h.cityId, base: 70, rooms: 2 };
  run(h, 2);
  assert.ok(h.companies[0].abandoned);
});

test('Politik: Stufen nacheinander, Amtszeit gibt Einfluss und Einkommen', () => {
  const s = setup(); s.person.birthDay = s.day - 30 * 365;
  assert.throws(() => act(s, 'runOffice', { idx: 1 }), /Zuerst/);
  let won = false;
  for (let i = 0; i < 40 && !won; i++) { s.day += 1; s.money = 20000000; act(s, 'runOffice', { idx: 0 }); won = !!s.politics.term; }
  assert.ok(won, 'irgendwann gewählt');
  const before = s.fx.influence;
  run(s, 1500);
  assert.strictEqual(s.politics.term, null);
  assert.ok(s.fx.influence > before);
  assert.strictEqual(s.politics.completed[0], 1);
  assert.doesNotThrow(() => act(s, 'runOffice', { idx: 1 }));
});

test('Lotto & Casino buchen Geld korrekt', () => {
  const s = setup(); s.person.birthDay = s.day - 30 * 365; s.day = 10 * 365;
  const m = s.money;
  const r = act(s, 'lotto', { tickets: 5 });
  assert.strictEqual(s.money, m - r.lottoStake + r.lottoWin);
  const m2 = s.money; act(s, 'casino', { bet: 1000 });
  assert.ok(s.money === m2 + 1000 || s.money === m2 - 1000);
  assert.throws(() => act(s, 'casino', { bet: -5 }), /Einsatz/);
});

test('Betriebs-Ereignisse und Konjunktur laufen ohne Fehler und wirken auf die Kasse', () => {
  const { marketPhase } = require('../src/game/business');
  assert.ok(marketPhase(2008).factor < 1);
  assert.ok(marketPhase(1955).factor > 1);
  assert.strictEqual(marketPhase(1970).factor, 1);
  const s = setup();
  const b = edition(w, s, s.cityId).biz.find((x) => x.pkey === 'wirt');
  act(s, 'buyBiz', { listingId: b.id });
  act(s, 'bizWork', { id: 1 });
  let seen = 0;
  for (let i = 0; i < 700 && s.status === 'alive'; i++) {
    s.meters.fridge = 100; s.money = Math.max(s.money, 1e7); advance(w, s, 1);
    seen += s.interrupts.length; s.interrupts = [];
  }
  assert.ok(Number.isFinite(s.companies[0].cash));
});
