'use strict';
/** Regressionstests zu Fehlern, die der Fuzz-Lauf und die Durchsicht der Spiellogik aufgedeckt haben. */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter, upgradeState } = require('../src/game/state');
const actions = require('../src/game/actions');
const { advance } = require('../src/game/engine');
const { edition, resolveListing, isSold, markSold, setSoldGlobal } = require('../src/game/newspaper');
const credit = require('../src/game/credit');
const { estateShare } = require('../src/game/family');
const { createHeirState } = require('../src/game/heir');
const settings = require('../src/settings');
const service = require('../src/game/service');

const w = testWorld();
const mkUser = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const mk = (over = {}, o = {}) => { const s = createCharacter(w, input(w, over), mkUser(), o); s.money = 9e9; s.housing = { type: 'rent', cityId: s.cityId, base: 70, rooms: 4 }; return s; };
const act = (s, n, i, user = mkUser()) => actions.run(n, { world: w, state: s, input: i, user, now: 1.7e12 });
const rejects = (fn, re) => assert.throws(fn, (e) => e instanceof actions.ActionError && (!re || re.test(e.message)));

test('Versicherung: Prototyp-Schlüssel („constructor“, „toString“) sind keine Versicherung', () => {
  const s = mk();
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) rejects(() => act(s, 'insurance', { key, on: true }), /Unbekannte Versicherung/);
  assert.deepStrictEqual(Object.keys(s.insurance).sort(), ['gebaeude', 'gesundheit', 'hausrat']);
});

test('Kredite: Restschuld bleibt ganzzahlig (auch über die Euro-Umstellung), NaN-Rückzahlung bucht kein NaN', () => {
  const s = mk({}, {});
  s.day = (2001 - s.startYear) * 365 + 300; s.person.birthDay = s.day - 30 * 365;
  s.properties.push({ id: 1, kind: 'house_large', name: 'Haus', cityId: s.cityId, rooms: 5, base: 5e6, condition: 90, closedUntil: 0, bought: 0 }); s.nextPropId = 2;
  act(s, 'loanTake', { amount: 1234567, years: 10 });
  advance(w, s, 400, { mode: 'offline' });
  for (const l of s.loans) { assert.ok(Number.isInteger(l.left) && Number.isInteger(l.pay), JSON.stringify(l)); }
  const money = s.money;
  rejects(() => act(s, 'loanRepay', { id: s.loans[0].id, amount: 'x' }));
  assert.strictEqual(s.money, money);
  assert.ok(Number.isFinite(s.money));
});

test('Erbe: Kredite werden aus dem Nachlass beglichen (kein schuldenfreies Erben von Kreditgeld)', () => {
  const s = mk();
  s.properties.push({ id: 1, kind: 'house_large', name: 'Haus', cityId: s.cityId, rooms: 5, base: 5e6, condition: 90, closedUntil: 0, bought: 0 }); s.nextPropId = 2;
  s.money = 1000;
  const before = estateShare(w, s);
  s.loans = [{ id: 1, principal: 500000, left: 500000, rate: 5, daysLeft: 3000, pay: 200, day: 0 }]; s.nextLoanId = 2; s.money += 500000;
  const after = estateShare(w, s);
  assert.strictEqual(after.debt, 500000);
  assert.strictEqual(after.total, before.total, 'Kreditgeld erhöht den Nachlass nicht');
  s.children.push({ id: 1, personId: s.tree.persons[0].id, name: 'Kind', gender: 'f', born: s.day - 20 * 365, cityId: s.cityId, status: 'home', sat: 70, school: null, skills: [] }); s.nextChildId = 2;
  const heir = createHeirState(w, s, 1, []);
  assert.ok(heir.state.money <= after.share);
  assert.strictEqual((heir.state.loans || []).length, 0);
});

test('EFS-Belohnungen lassen sich nicht durch Wiederholung farmen (Mieten, Bewerben, Versichern, Umziehen)', () => {
  const s = mk(); s.money = 9e9; s.housing = { type: 'street', cityId: s.cityId };
  const ed = edition(w, s, s.cityId);
  act(s, 'rent', { listingId: ed.housing.rent[0].id });
  const efs1 = s.fx.efs; assert.ok(efs1 > 0);
  for (let i = 0; i < 5; i++) act(s, 'rent', { listingId: ed.housing.rent[i % ed.housing.rent.length].id });
  assert.strictEqual(s.fx.efs, efs1, 'weitere Mietbelohnungen innerhalb eines Jahres entfallen');
  for (let i = 0; i < 4; i++) { act(s, 'insurance', { key: 'hausrat', on: true }); act(s, 'insurance', { key: 'hausrat', on: false }); }
  assert.strictEqual(s.fx.efs, efs1 + settings.get('efs.awards').insurance, 'Versicherung nur einmal pro Jahr belohnt');
  const e2 = s.fx.efs;
  act(s, 'insurance', { key: 'gesundheit', on: true });
  assert.strictEqual(s.fx.efs, e2 + settings.get('efs.awards').insurance, 'andere Versicherung zählt eigenständig');
  s.day += 366; // ein Jahr später gibt es die Belohnung wieder
  const e3 = s.fx.efs;
  act(s, 'rent', { listingId: edition(w, s, s.cityId).housing.rent[0].id });
  assert.ok(s.fx.efs > e3);
});

test('Bewerbung auf die eigene Stelle setzt Betriebszugehörigkeit nicht zurück', () => {
  const s = mk(); const job = edition(w, s, s.cityId).jobs.find((j) => j.kind === 'work');
  act(s, 'apply', { listingId: job.id });
  s.day += 2; const since = s.occupation.since; // dieselbe Woche: Anzeige noch gültig
  assert.ok(resolveListing(w, s, job.id));
  rejects(() => act(s, 'apply', { listingId: job.id }), /bereits/);
  assert.strictEqual(s.occupation.since, since);
});

test('Gekaufte Immobilienanzeige verschwindet aus der Zeitung und ist nicht noch einmal kaufbar (Spieler selbst)', () => {
  const s = mk(); const id = edition(w, s, s.cityId).housing.sale[0].id;
  act(s, 'buy', { listingId: id });
  assert.strictEqual(s.properties.length, 1);
  assert.ok(isSold(s, id));
  assert.ok(!edition(w, s, s.cityId).housing.sale.some((l) => l.id === id));
  assert.strictEqual(resolveListing(w, s, id), null);
  const money = s.money;
  rejects(() => act(s, 'buy', { listingId: id }), /nicht mehr aktuell/);
  assert.strictEqual(s.money, money); assert.strictEqual(s.properties.length, 1);
  // nächste Woche: alte Id ist ohnehin ungültig, der Merker wird bereinigt
  s.day += 7; markSold(s, edition(w, s, s.cityId).housing.sale[0].id);
  assert.strictEqual(s.soldListings.length, 1);
});

test('Gekaufte Anzeige eines anderen Spielers (globale Liste) ist gesperrt, wird aber nicht im Spielstand gespeichert', () => {
  const a = mk(); const b = mk();
  const id = edition(w, a, a.cityId).housing.sale[1].id;
  assert.ok(edition(w, b, b.cityId).housing.sale.some((l) => l.id === id));
  setSoldGlobal(b, [id]);
  assert.ok(!edition(w, b, b.cityId).housing.sale.some((l) => l.id === id));
  rejects(() => act(b, 'buy', { listingId: id }), /nicht mehr aktuell/);
  assert.ok(!JSON.stringify(b).includes(id), 'globale Liste wird nicht serialisiert');
  assert.ok(edition(w, a, a.cityId).housing.sale.some((l) => l.id === id), 'andere Spieler ohne Eintrag sehen sie noch (Quelle ist die DB)');
  assert.deepStrictEqual(upgradeState(JSON.parse(JSON.stringify(b))).soldListings || [], b.soldListings || []);
});

test('Betriebsanzeige: nach dem Kauf nicht erneut kaufbar', () => {
  const s = mk({ professionKey: 'wirt' }); s.skills.days.wirt = 4000;
  const l = edition(w, s, s.cityId).biz.find((x) => x.qualified); assert.ok(l);
  act(s, 'buyBiz', { listingId: l.id });
  assert.strictEqual(s.companies.length, 1);
  rejects(() => act(s, 'buyBiz', { listingId: l.id }), /nicht mehr aktuell/);
  assert.strictEqual(s.companies.length, 1);
});

test('Spekulationsfrist: Immobilie lässt sich nicht sofort nach dem Kauf zu Geld machen', () => {
  const s = mk(); act(s, 'buy', { listingId: edition(w, s, s.cityId).housing.sale[0].id });
  const id = s.properties[0].id;
  rejects(() => act(s, 'sell', { propertyId: id }), /Spekulationsfrist/);
  s.day += 366;
  const before = s.money; act(s, 'sell', { propertyId: id });
  assert.ok(s.money > before); assert.strictEqual(s.properties.length, 0);
});

test('Vermietung: Eine Immobilie mit Spieler-Mieter wird weder überschrieben noch verkauft', () => {
  const s = mk(); act(s, 'buy', { listingId: edition(w, s, s.cityId).housing.sale[0].id });
  const p = s.properties[0]; p.bought = -999;
  act(s, 'letOn', { propertyId: p.id, mult: 1 });
  p.lease.tenant = { name: 'Mieter', since: s.day, until: s.day + 99999, arrears: 0, userId: 7, contractReal: 100 };
  rejects(() => act(s, 'letOn', { propertyId: p.id, mult: 1 }), /Spieler wohnt/);
  rejects(() => act(s, 'sell', { propertyId: p.id }), /Spieler wohnt/);
  assert.strictEqual(p.lease.tenant.userId, 7);
});

test('Umzug: zieht nicht in eine an einen Spieler vermietete Immobilie', () => {
  const s = mk(); s.money = 9e9;
  const other = w.cityList.find((c) => c.id !== s.cityId && c.size_tier >= 2);
  s.properties.push({ id: 1, kind: 'flat', name: 'Vermietet', cityId: other.id, rooms: 4, base: 1e6, condition: 80, closedUntil: 0, bought: 0, lease: { on: true, mult: 1, players: true, tenant: { name: 'X', since: 0, until: 9e9, arrears: 0, userId: 5, contractReal: 10 } } },
    { id: 2, kind: 'flat', name: 'Frei', cityId: other.id, rooms: 2, base: 1e6, condition: 80, closedUntil: 0, bought: 0 });
  s.nextPropId = 3;
  act(s, 'move', { cityId: other.id }, { meta: {}, coins: 9999 });
  assert.strictEqual(s.housing.propertyId, 2);
});

/* ---------------- Spieluhr ---------------- */
const clockUser = (t) => ({ meta: {}, coins: 0, efs_pool: 0, efs_accrued_at: t, efs_carry: 0, login_bonus_date: 'heute' });
const perDay = () => 86400000 / settings.get('game.clock_days_per_day');

test('Spieluhr: Zeitspannen gehen beim Aufteilen in viele Abgleiche nicht verloren und werden nicht doppelt gezählt', () => {
  const s = mk(); s.money = 9e12;
  const t0 = 1.7e12; const u = clockUser(t0); let t = t0; let total = 0;
  const gaps = [100, 130, 91, 400, 95, 200, 333, 120]; // Minuten, alle ≥ Offline-Schwelle (Schutz) und < 3650 Tage
  const startDay = s.day;
  for (const g of gaps) { t += g * 60000; total += g * 60000; service.syncEfs(u, s, t, w); assert.ok(u.efs_carry >= 0 && u.efs_carry < 1); assert.strictEqual(u.efs_accrued_at, t); }
  assert.strictEqual(s.day - startDay, Math.floor(total / perDay() + 1e-9));
  assert.ok(Math.abs((s.day - startDay) + u.efs_carry - total / perDay()) < 1e-6);
});

test('Spieluhr: rückwärts laufende Anfragezeit (parallele Anfrage) zählt keine Zeit doppelt', () => {
  const s = mk(); const t0 = 1.7e12; const u = clockUser(t0 + 10000);
  const d0 = s.day;
  service.syncEfs(u, s, t0, w); // „älterer“ Zeitstempel als der gebuchte Stand
  assert.strictEqual(s.day, d0); assert.strictEqual(u.efs_accrued_at, t0 + 10000, 'Zeitstempel läuft nie rückwärts');
  service.syncEfs(u, s, t0 + 10000 + 60000, w);
  assert.strictEqual(u.efs_accrued_at, t0 + 70000);
  assert.ok(s.day - d0 <= Math.ceil(60000 / perDay()), 'nur die echte Spanne wird gezählt');
});

test('Spieluhr: Obergrenze 3650 Tage und Offline-Schutz ab der Abwesenheitsschwelle', () => {
  const s = mk(); s.money = 9e12; const t0 = 1.7e12; const u = clockUser(t0);
  const r = service.syncEfs(u, s, t0 + 20 * 365 * perDay(), w);
  assert.ok(r.offline); assert.strictEqual(r.offline.days, 3650);
  const s2 = mk(); const u2 = clockUser(t0); const away = settings.get('game.offline_after_minutes');
  const r2 = service.syncEfs(u2, s2, t0 + (away - 1) * 60000, w);
  assert.ok(!r2.offline); assert.ok(r2.clock);
  const s3 = mk(); const r3 = service.syncEfs(clockUser(t0), s3, t0 + (away + 1) * 60000, w);
  assert.ok(r3.offline);
});

test('Steuer: Einkommen oberhalb der letzten Stufe wird nicht steuerfrei', () => {
  const tax = require('../src/game/tax');
  const t = settings.get('tax'); const saved = t.brackets;
  try {
    t.brackets = [[1000, 0], [5000, 0.2]]; // Admin hat die Endstufe auf einen endlichen Wert gesetzt
    assert.strictEqual(Math.round(tax.annual(5000)), 800);
    assert.strictEqual(Math.round(tax.annual(15000)), Math.round(800 + 10000 * 0.2));
  } finally { t.brackets = saved; }
});

test('NPC-Mieter bleiben unbefristet, solange das Haus bewohnbar ist', () => {
  const { testWorld, input } = require('./helpers');
  const { createCharacter } = require('../src/game/state');
  const { landlordDaily } = require('../src/game/landlord');
  const w = testWorld(); const s = createCharacter(w, input(w, { professionKey: 'baecker' }), { meta: {}, coins: 0, efs_pool: 0 });
  s.properties.push({ id: 1, kind: 'house_small', name: 'H', cityId: s.cityId, rooms: 4, base: 2000000, condition: 100, closedUntil: 0, bought: 0, lease: { on: true, mult: 1, tenant: { name: 'Mieter', since: 0, until: 10, arrears: 0 }, total: 0 } });
  const ev = w.econ.events; w.econ.events = { ...(ev || {}), private: { rate: 1e12, poorRate: 1e12 } };
  s.day = 5000; // weit nach dem früheren Ablaufdatum
  try { for (let i = 0; i < 300; i++) { s.day++; s.properties[0].condition = 100; s.properties[0].lease.tenant.arrears = 0; landlordDaily({ world: w, state: s, offline: false }); } } finally { w.econ.events = ev; }
  assert.ok(s.properties[0].lease.tenant, 'Mieter wohnt weiter');
});

test('Anfänger-Schutz: Neuling ohne Wohnung überlebt die laufende Uhr in den ersten Spieltagen', () => {
  const { testWorld, input } = require('./helpers');
  const { createCharacter } = require('../src/game/state');
  const service = require('../src/game/service');
  const w = testWorld(); const user = { id: 1, meta: {}, coins: 0, efs_pool: 0, efs_accrued_at: 1000, efs_carry: 0 };
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), user);
  assert.strictEqual(s.housing.type, 'street');
  const sync = service.syncEfs ? service.syncEfs : null;
  if (!sync) return; // nicht exportiert: Verhalten wird über den Dienst geprüft
  sync(user, s, 1000 + 40 * 60000, w); // 40 Minuten ≈ 10 Spieltage auf der Straße
  assert.strictEqual(s.status, 'alive');
});
