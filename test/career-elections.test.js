'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const actions = require('../src/game/actions');
const { edition } = require('../src/game/newspaper');
const { dailyFlows } = require('../src/game/core');
const career = require('../src/game/career');
const el = require('../src/lib/elections');
const settings = require('../src/settings');

const w = testWorld();
const user = () => ({ meta: {}, coins: 5, efs_pool: 0 });
const fresh = () => createCharacter(w, input(w), user());
const act = (s, name, inp = {}) => actions.run(name, { world: w, state: s, input: inp, user: user(), now: Date.now() });
const working = () => {
  const s = fresh(); s.money = 5e7;
  const e = edition(w, s, s.cityId);
  act(s, 'apply', { listingId: e.jobs.find((j) => j.pkey === 'baecker' && j.kind === 'work').id });
  act(s, 'rent', { listingId: e.housing.pension[0].id });
  return s;
};
const pass = (s, n) => { for (let i = 0; i < n && s.status === 'alive'; i++) { s.meters.fridge = 100; s.meters.fridgeQ = 2; advance(w, s, 1); s.interrupts = []; } };
const C = () => settings.get('elections');

/* ---------------- Wahlen ---------------- */
test('Wahlzyklus: Nominierung, dann Wahlfenster in den letzten Stunden', () => {
  const c = { ...C(), cycleDays: 7, voteHours: 24 };
  const cyc = 7 * 86400000;
  const early = windowAt(cyc * 10 + 1000);
  assert.strictEqual(early.phase, 'nomination');
  assert.strictEqual(early.voteEnd, cyc * 11);
  assert.strictEqual(early.voteEnd - early.voteStart, 24 * 3600000);
  assert.strictEqual(windowAt(cyc * 11 - 3600000).phase, 'voting');
  function windowAt(t) { return el.windowAt(t, c); }
});

test('Auszählung: Mehrheit, Gleichstand nach Einfluss, einzelner Kandidat, keine Stimmen', () => {
  const cands = [{ userId: 5, influence: 3 }, { userId: 9, influence: 8 }];
  assert.strictEqual(el.tally(cands, { 5: 4, 9: 2 }).winnerId, 5);
  const tie = el.tally(cands, { 5: 3, 9: 3 });
  assert.strictEqual(tie.winnerId, 9); assert.ok(tie.tie);
  assert.strictEqual(el.tally(cands, { 5: 2 }, { 9: 3 }).winnerId, 9, 'Bot-Stimmen zählen');
  assert.strictEqual(el.tally([cands[0]], {}).winnerId, 5, 'unbestritten');
  assert.strictEqual(el.tally(cands, {}).winnerId, null);
});

test('Bot-Stimmen sind gedeckelt und deterministisch', () => {
  const c = { ...C(), botVotes: true, botVoteMax: 20, botTurnoutPct: 100, botMaxPctOfHuman: 100 };
  const cands = [{ userId: 1, influence: 0 }, { userId: 2, influence: 5 }];
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum(el.botVotesFor(7, cands, 50, 3, c)), 3, 'höchstens so viele wie Spielerstimmen');
  assert.strictEqual(sum(el.botVotesFor(7, cands, 50, 0, c)), 1, 'mindestens eine');
  assert.deepStrictEqual(el.botVotesFor(7, cands, 50, 10, c), el.botVotesFor(7, cands, 50, 10, c));
  assert.strictEqual(sum(el.botVotesFor(7, cands, 50, 10, { ...c, botVotes: false })), 0);
});

test('Kandidatur und Wahlrecht werden geprüft', () => {
  const s = fresh(); const c = C();
  s.day = 365 * 30; // alt genug
  assert.strictEqual(el.runBlock(w, s, 0, c, 100), null);
  assert.match(el.runBlock(w, s, 0, c, 1), /Stunden/);
  assert.match(el.runBlock(w, s, 1, c, 100), /Zuerst/);
  s.politics.term = { idx: 0, startDay: 0, endDay: 99 };
  assert.match(el.runBlock(w, s, 0, c, 100), /im Amt/);
  const ps = { user_id: 1, status: 'alive', city_id: 4 };
  assert.strictEqual(el.voteBlock(ps, 100, { city_id: 4 }, 2, c), null);
  assert.match(el.voteBlock(ps, 100, { city_id: 5 }, 2, c), /wohnst/);
  assert.match(el.voteBlock(ps, 100, { city_id: 0 }, 1, c), /selbst/);
  assert.match(el.voteBlock(ps, 1, { city_id: 0 }, 2, c), /Stunden/);
  assert.strictEqual(el.scopeCity(c, 2, 4), 4); assert.strictEqual(el.scopeCity(c, c.firstNationalOffice, 4), 0);
});

/* ---------------- Karriere ---------------- */
test('Gehaltsstufen: Betriebszugehörigkeit und Leistung erhöhen den Lohn', () => {
  const s = working();
  const base = dailyFlows(w, s).inc.wage;
  s.occupation.since = s.day - 3 * 365; // eine Tenure-Stufe
  const tenured = dailyFlows(w, s).inc.wage;
  assert.ok(tenured > base, `${base} -> ${tenured}`);
  s.occupation.perfSteps = 2;
  assert.ok(dailyFlows(w, s).inc.wage > tenured);
  assert.deepStrictEqual(career.steps(s, s.occupation), { tenure: 1, perf: 2 });
});

test('Gehaltsgespräch: Abkühlzeit und Stufenlimit', () => {
  const s = working(); s.meters.wellbeing = 100;
  let got = 0; let tries = 0;
  while (got < 3 && tries++ < 60) { s.day += settings.get('career').raiseCooldownDays; act(s, 'askRaise'); got = s.occupation.perfSteps || 0; }
  assert.strictEqual(got, 3);
  s.day += 1000;
  assert.throws(() => act(s, 'askRaise'), /Leistungsstufen/);
  const t = working();
  act(t, 'askRaise');
  assert.throws(() => act(t, 'askRaise'), /Tagen möglich/);
});

test('Kündigung mit Frist: Stelle endet nach Ablauf, kein Arbeitslosengeld', () => {
  const s = working(); const k = settings.get('career');
  act(s, 'giveNotice');
  assert.throws(() => act(s, 'giveNotice'), /bereits gekündigt/);
  pass(s, k.noticeDays - 2);
  assert.ok(s.occupation, 'arbeitet noch');
  pass(s, 3);
  assert.strictEqual(s.occupation, null);
  assert.strictEqual(s.career.benefit, null);
  const t = working(); act(t, 'giveNotice'); act(t, 'cancelNotice'); assert.strictEqual(t.occupation.notice, null);
});

test('Stellenwechsel: Bewerbung mit Chance, Wechsel nach der Kündigungsfrist', () => {
  const s = working(); s.meters.wellbeing = 100;
  s.occupation.since = s.day - 400;
  const e = edition(w, s, s.cityId);
  const other = e.jobs.find((j) => j.kind === 'work' && j.pkey === 'helfer');
  assert.ok(other, 'zweite Stelle');
  assert.ok(career.applyChance(s, 'baecker') > 0.5);
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    s.day += 30; s.career.applied = {}; s.occupation.notice = null; s.career.hire = null;
    const r = act(s, 'apply', { listingId: edition(w, s, s.cityId).jobs.find((j) => j.kind === 'work' && j.pkey === 'helfer').id });
    ok = !!s.career.hire;
    if (!ok) assert.match(r.msg, /abgelehnt/);
  }
  assert.ok(ok, 'irgendwann Zusage');
  const employer = s.career.hire.employer;
  assert.ok(s.occupation.notice);
  pass(s, settings.get('career').noticeDays + 1);
  assert.strictEqual(s.occupation.employer, employer);
  assert.strictEqual(s.career.hire, null);
});

test('Weiterbildung: Gebühr, Dauer, Jahreslimit; Fortbildung hebt Erfahrung, Umschulung schaltet Beruf frei', () => {
  const s = working(); const k = settings.get('career');
  const before = s.skills.days.baecker || 0;
  const m0 = s.money;
  act(s, 'course', { pkey: 'baecker', kind: 'skill' });
  assert.ok(s.money < m0, 'Gebühr');
  assert.throws(() => act(s, 'course', { pkey: 'baecker', kind: 'skill' }), /bereits einen Kurs/);
  pass(s, k.courseDays * 2 + 1); // Bildung verkürzt oder verlängert den Kurs um bis zu 20 %
  assert.ok((s.skills.days.baecker || 0) >= before + k.skillBonusDays);
  const other = w.activeProfessions(1945).find((p) => !p.academic && p.pkey !== 'helfer' && !s.skills.learned.includes(p.pkey));
  assert.ok(other);
  act(s, 'course', { pkey: other.pkey, kind: 'unlock' });
  assert.throws(() => act(s, 'course', { pkey: 'baecker', kind: 'skill' }), /bereits einen Kurs/);
  pass(s, k.unlockDays * 2 + 1);
  assert.ok(s.skills.learned.includes(other.pkey));
  // Jahreslimit
  s.career.course = null; s.career.courses[1945] = k.coursesPerYear; s.day = 0;
  assert.throws(() => act(s, 'course', { pkey: 'baecker', kind: 'skill' }), /pro Jahr/);
  assert.throws(() => act(s, 'course', { pkey: 'baecker', kind: 'unlock' }), /pro Jahr|beherrschst/);
});

test('Arbeitslosengeld: nach unfreiwilligem Verlust für begrenzte Zeit, danach nichts', () => {
  const s = working(); const k = settings.get('career').benefit;
  s.occupation.since = s.day - 400;
  const b = career.onJobLost(w, s, 'fired');
  assert.ok(b && b.real > 0 && b.until === s.day + k.days);
  s.occupation = null;
  s.meters.fridge = 100;
  const m = s.money;
  pass(s, 1);
  const view = career.benefitView(w, s);
  assert.ok(view && view.perDay > 0 && view.daysLeft === k.days - 1);
  assert.ok(s.career.benefit, 'läuft');
  s.career.benefit.until = s.day; // letzter Bezugstag
  pass(s, 2);
  assert.strictEqual(s.career.benefit, null);
  assert.ok(m > 0);
  // Neue Stelle beendet den Anspruch; zu kurze Beschäftigung begründet keinen
  const t = working(); assert.strictEqual(career.onJobLost(w, t, 'fired'), null);
});

test('Englische Übersetzungen der Wahl- und Karrieretexte', () => {
  const { tr } = require('../src/i18n-game');
  assert.strictEqual(tr('Zusage von Xaver! Nach Ablauf der Kündigungsfrist (30 Tage) wechselst du als Bäcker.'), 'Offer from Xaver! After your notice period (30 days) you will move over as Baker.');
  assert.strictEqual(tr('Wahl zum Stadtrat in Berlin: Es wurde niemand gewählt.'), 'Election for City councilor in Berlin: nobody was elected.');
  assert.strictEqual(tr('Du hast in dieser Wahl schon gewählt.'), 'You have already voted in this election.');
  assert.strictEqual(tr('Mehr als 2 Kurse pro Jahr sind nicht möglich.'), 'More than 2 courses per year are not possible.');
});
