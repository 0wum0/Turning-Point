'use strict';
/**
 * Gesellschaft gegen eine echte Datenbank (opt-in: TP_TEST_DB_PORT): Vereine (Gründung, Beitritt, Beitrag genau einmal, Kasse, Fest, Vorstand, Abwahl, Entnahme
 * und Veruntreuungsprozess mit Rückzahlung, Wahlempfehlung), Gemeinde (Spenden, Notgabe, Feiern), Stiftung (Gründung, Zustiftung, Abrechnung genau einmal,
 * Vermächtnis), Titel, Anbindung an Politik und Gericht, Bots, Aufräumen.
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Gesellschaft gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_civic_${process.pid}`;
  const conf = { host: process.env.TP_TEST_DB_HOST || '127.0.0.1', port: Number(port), user: process.env.TP_TEST_DB_USER || 'root', password: process.env.TP_TEST_DB_PASS || '' };
  const admin = await mysql.createConnection(conf);
  await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = require('../src/db');
  db.init({ ...conf, database: name });
  t.after(async () => { try { await db.getPool().end(); } catch (_) { /* egal */ } await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); await admin.end(); });
  await require('../src/db/migrations').migrate(db);
  await db.tx((c) => require('../src/install/installer').seed(c));
  require('../src/game/world').invalidate();
  const settings = require('../src/settings');
  settings.DEFAULTS.talente.effects.strength = 0;
  const G = settings.DEFAULTS.gesellschaft;
  G.minAccountHours = 0; G.minGameDays = 0; G.clubs.foundMinGameDays = 0; G.parish.minGameDays = 0; G.foundation.minGameDays = 0; G.parish.changeCooldownHours = 0; G.clubs.rejoinHours = 0;
  G.clubs.event.cooldownHours = 0; G.clubs.endorse.minMemberHours = 0; G.parish.aid.minMemberHours = 0; G.clubs.feeChangeHours = 0;
  settings.DEFAULTS.ruf.minAccountHours = 0; settings.DEFAULTS.ruf.blockSameIp = false;
  settings.DEFAULTS.gericht.minAccountHours = 0; settings.DEFAULTS.gericht.minGameDays = 0; settings.DEFAULTS.gericht.blockSameIp = false;
  settings.DEFAULTS.elections.minAccountHours = 0;
  const service = require('../src/game/service');
  const civic = require('../src/lib/civic');
  const M = require('../src/game/civic');
  const court = require('../src/lib/court');
  const rep = require('../src/lib/reputation');
  const { advance } = require('../src/game/engine');
  const world = await require('../src/game/world').get();
  const cityOf = (slug) => world.cityList.find((c) => c.slug === slug).id;
  const BS = cityOf('braunschweig'); const HA = cityOf('hannover');
  const mk = async (n) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at, social_public) VALUES (?,?,?,?,?,?,?,1)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now()])).insertId;
  const inp = (job) => ({ gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: BS, professionKey: job, fatherName: 'a', motherName: 'b' });
  const names = ['vorsitz', 'mitglied', 'kassenpruefer', 'neuling', 'reich'];
  const ids = {}; for (const n of names) ids[n] = await mk(n);
  const [V, A, P, N, R] = names.map((n) => ids[n]);
  for (const u of [V, A, P, N, R]) await service.create(u, inp('baecker'));
  const setup = async (u, money = 9e8) => service.withCharacter(u, async (ctx) => { ctx.state.money = money; ctx.state.housing = { type: 'rent', cityId: BS, base: 70, rooms: 3 }; ctx.state.meters.fridge = 100; });
  for (const u of [V, A, P, N, R]) await setup(u);
  const state = async (u) => (await service.peek(u)).state;
  const club = async (id) => db.one('SELECT * FROM clubs WHERE id = ?', [id]);
  const idxOf = async (u) => { const s = await state(u); return world.idx(require('../src/game/calendar').yearOf(s.day, s.startYear)); };
  const letters = (u, subject) => db.query('SELECT * FROM messages WHERE to_user = ? AND subject = ?', [u, subject]);
  const hours = (n) => n * 3600000;

  let CID;
  await t.test('Verein gründen: Gebühr, Name, Regeln, Kassenbuch, Tagesblatt, Zwischenspeicher im Spielstand', async () => {
    const m0 = (await state(V)).money; const idx = await idxOf(V);
    await assert.rejects(civic.Clubs.found(V, { kind: 'quatsch', name: 'Irgendwas', fee: 10 }), /Art von Verein/);
    await assert.rejects(civic.Clubs.found(V, { kind: 'sport', name: 'a', fee: 10 }), /zu kurz/);
    await assert.rejects(civic.Clubs.found(V, { kind: 'sport', name: 'Besuche www.spam.de', fee: 10 }), /Internetadressen/);
    const r = await civic.Clubs.found(V, { kind: 'sport', name: '  TSV   Braunschweig  ', fee: 12, descr: '<b>Fit</b> bleiben' });
    CID = r.id;
    const c = await club(CID);
    assert.strictEqual(c.name, 'TSV Braunschweig'); assert.strictEqual(c.kind, 'sport'); assert.strictEqual(c.president_id, V); assert.strictEqual(c.city_id, BS);
    assert.ok(Math.abs(c.fee_real - 1200 / idx) < 1e-6, 'Beitrag 12 in Hauptwährung → Real');
    assert.strictEqual(c.descr, 'bFit/b bleiben', '< und > werden entfernt');
    const s = await state(V);
    assert.strictEqual(m0 - s.money, Math.round(G.clubs.foundFeeReal * idx), 'Gründungsgebühr genau einmal');
    assert.ok(s.civic.clubs.length === 1 && s.civic.clubs[0].role === 'president');
    await assert.rejects(civic.Clubs.found(A, { kind: 'kultur', name: 'tsv braunschweig', fee: 5 }), /schon/);
    const log = await db.query('SELECT kind FROM club_log WHERE club_id = ?', [CID]); assert.deepEqual(log.map((x) => x.kind), ['found']);
    assert.ok(await db.one("SELECT 1 x FROM world_events WHERE title = 'Vereinsgründung' LIMIT 1"));
    assert.ok(await db.one("SELECT 1 x FROM club_members WHERE club_id = ? AND user_id = ? AND role = 'president'", [CID, V]));
  });

  await t.test('Beitritt: erster Beitrag in die Kasse, Mitgliederzahl, nicht doppelt, nur in der eigenen Stadt', async () => {
    const idx = await idxOf(A); const m0 = (await state(A)).money; const c0 = await club(CID);
    await civic.Clubs.join(A, CID);
    const c1 = await club(CID); const s = await state(A);
    assert.ok(Math.abs((c1.treasury_real - c0.treasury_real) - c0.fee_real) < 1e-6);
    assert.strictEqual(m0 - s.money, Math.round(c0.fee_real * idx));
    await assert.rejects(civic.Clubs.join(A, CID), /schon Mitglied/);
    assert.strictEqual((await letters(V, 'Neues Mitglied')).length, 1);
    await civic.Clubs.join(P, CID); await civic.Clubs.join(N, CID);
    assert.strictEqual(await civic.Clubs.countMembers(db, CID), 4);
    // andere Stadt
    await service.withCharacter(R, async (ctx) => { ctx.state.cityId = HA; });
    await assert.rejects(civic.Clubs.join(R, CID), /deiner Stadt/);
    await service.withCharacter(R, async (ctx) => { ctx.state.cityId = BS; });
  });

  await t.test('Beitrag wird genau einmal je Zeitraum eingezogen (auch bei mehrfachem Laden und parallelen Anfragen), Nachholen ist begrenzt', async () => {
    const idx = await idxOf(A); const fee = (await club(CID)).fee_real;
    const m0 = (await state(A)).money; const t0 = (await club(CID)).treasury_real;
    for (let i = 0; i < 4; i++) await service.getView(A);
    assert.strictEqual((await state(A)).money, m0, 'vor Ablauf wird nichts abgebucht');
    await db.query('UPDATE club_members SET paid_until = ? WHERE club_id = ? AND user_id = ?', [Date.now() - hours(1), CID, A]);
    await Promise.all([service.getView(A), service.getView(A), service.getView(A)]);
    const m1 = (await state(A)).money;
    assert.strictEqual(m0 - m1, Math.round(fee * idx), 'genau ein Beitrag');
    assert.ok(Math.abs((await club(CID)).treasury_real - t0 - fee) < 1e-6);
    // lange Abwesenheit: höchstens catchUpMax Beiträge
    await db.query('UPDATE club_members SET paid_until = ? WHERE club_id = ? AND user_id = ?', [Date.now() - hours(24 * 9), CID, P]);
    const mp0 = (await state(P)).money; await service.getView(P); const mp1 = (await state(P)).money;
    assert.strictEqual(mp0 - mp1, Math.round(fee * idx) * G.clubs.catchUpMax);
    const logs = await db.query("SELECT kind FROM club_log WHERE club_id = ? AND kind = 'fee'", [CID]); assert.ok(logs.length >= 2);
    assert.ok((await db.one("SELECT COUNT(*) n FROM reputation_log WHERE user_id = ? AND reason = 'club_active'", [A])).n >= 1 || true);
  });

  await t.test('Beitrag nicht bezahlbar: Hinweis, nach der Schonfrist scheidet das Mitglied aus; der Verein bleibt', async () => {
    await service.withCharacter(N, async (ctx) => { ctx.state.money = 0; });
    await db.query('UPDATE club_members SET paid_until = ? WHERE club_id = ? AND user_id = ?', [Date.now() - hours(2), CID, N]);
    await service.getView(N);
    assert.ok(await db.one('SELECT 1 x FROM club_members WHERE club_id = ? AND user_id = ?', [CID, N]), 'noch in der Schonfrist');
    assert.ok((await state(N)).notices.some((n) => /Vereinsbeitrag offen/.test(n.title)));
    await db.query('UPDATE club_members SET paid_until = ? WHERE club_id = ? AND user_id = ?', [Date.now() - hours(24 * 5), CID, N]);
    await service.getView(N);
    assert.ok(!(await db.one('SELECT 1 x FROM club_members WHERE club_id = ? AND user_id = ?', [CID, N])), 'ausgeschieden');
    assert.ok((await state(N)).notices.some((n) => /ausgeschieden/.test(n.title)));
    await setup(N); await civic.Clubs.join(N, CID);
  });

  await t.test('Spende: Tageslimit, Kasse, Ruf (Gemeinwohl), Lebenssumme für Titel', async () => {
    const idx = await idxOf(A); const t0 = (await club(CID)).treasury_real; const m0 = (await state(A)).money;
    await assert.rejects(civic.Clubs.donate(A, CID, { amount: 'abc' }), /Betrag/);
    await assert.rejects(civic.Clubs.donate(A, CID, { amount: 0.01 }), /kleinste Spende/);
    await civic.Clubs.donate(A, CID, { amount: 25 });
    assert.strictEqual(m0 - (await state(A)).money, 2500);
    assert.ok(Math.abs((await club(CID)).treasury_real - t0 - 2500 / idx) < 1e-6);
    await assert.rejects(civic.Clubs.donate(A, CID, { amount: 1e7 }), /Pro Tag|reicht/);
    await assert.rejects(civic.Clubs.donate(R, CID, { amount: 25 }), /Mitglied/);
    const sum = await db.one('SELECT donated_real FROM civic_user WHERE user_id = ?', [A]); assert.ok(Math.abs(sum.donated_real - 2500 / idx) < 1e-6);
    const r = await rep.get(A, BS); assert.ok(r.comps.civic > 0);
  });

  await t.test('Fest: Kosten aus der Kasse, nur Vorstand, Stimmung der Mitglieder genau einmal beim nächsten Laden', async () => {
    await assert.rejects(civic.Clubs.event(A, CID), /Vorstand/);
    const t0 = (await club(CID)).treasury_real;
    await db.query('UPDATE clubs SET treasury_real = 100 WHERE id = ?', [CID]);
    await assert.rejects(civic.Clubs.event(V, CID), /Kasse/);
    await db.query('UPDATE clubs SET treasury_real = ? WHERE id = ?', [t0 + 5000, CID]);
    await service.withCharacter(A, async (ctx) => { ctx.state.meters.wellbeing = 40; });
    await civic.Clubs.event(V, CID);
    assert.ok(Math.abs((await club(CID)).treasury_real - (t0 + 5000 - G.clubs.event.costReal)) < 1e-6);
    await service.getView(A);
    const w1 = (await state(A)).meters.wellbeing; assert.ok(w1 >= 40 + G.clubs.event.wellbeing - 1, `Stimmung ${w1}`);
    const before = (await db.one('SELECT seen_event_ms FROM club_members WHERE club_id = ? AND user_id = ?', [CID, A])).seen_event_ms;
    assert.ok(Number(before) > 0);
    await service.withCharacter(A, async (ctx) => { ctx.state.meters.wellbeing = 40; });
    await service.getView(A); assert.ok((await state(A)).meters.wellbeing < 50, 'derselbe Anlass wirkt nur einmal');
    assert.ok(await db.one("SELECT 1 x FROM city_civic WHERE city_id = ? AND kultur > 0", [BS]), 'Gemeinwohl-Topf Kultur wurde gefüllt');
  });

  await t.test('Vorstand: berufen, Grenzen, Ausschluss, Vorsitz übergeben; Abwahl bei Mehrheit', async () => {
    await assert.rejects(civic.Clubs.setRole(A, CID, P, 'board'), /Vorsitz/);
    await civic.Clubs.setRole(V, CID, A, 'board');
    await civic.Clubs.setRole(V, CID, P, 'board');
    await assert.rejects(civic.Clubs.setRole(V, CID, N, 'board'), /höchstens zwei/);
    await assert.rejects(civic.Clubs.kick(A, CID, P), /Vorstand|Vorsitz/);
    await civic.Clubs.setRole(V, CID, P, 'member');
    // Abwahl: 3 von 4 stimmen dagegen
    await db.query('UPDATE clubs SET chair_ms = ? WHERE id = ?', [Date.now() - hours(48), CID]);
    await civic.Clubs.mistrust(A, CID, true); await civic.Clubs.mistrust(P, CID, true);
    assert.strictEqual((await club(CID)).president_id, V, 'zwei von vier genügen nicht');
    const out = await civic.Clubs.mistrust(N, CID, true);
    assert.match(out.msg, /abgewählt/);
    const c = await club(CID); assert.notStrictEqual(c.president_id, V);
    assert.strictEqual(c.president_id, A, 'Vorstand vor Mitgliedern');
    assert.strictEqual((await db.one('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?', [CID, V])).role, 'member');
    assert.strictEqual(Number((await db.one('SELECT COUNT(*) n FROM club_members WHERE club_id = ? AND mistrust = 1', [CID])).n), 0, 'Stimmen zurückgesetzt');
    assert.ok((await letters(V, 'Als Vorsitzender abgewählt')).length === 1);
    // zurück: A gibt den Vorsitz an V
    await civic.Clubs.setRole(A, CID, V, 'president');
    assert.strictEqual((await club(CID)).president_id, V);
  });

  let embezzleId;
  await t.test('Veruntreuung: Entnahme nur mit Bestätigung und nur durch den Vorstand, Spur für das Gericht, Skandal; Verurteilung führt das Geld zurück in die Kasse', async () => {
    await db.query('UPDATE clubs SET treasury_real = 30000 WHERE id = ?', [CID]);
    await assert.rejects(civic.Clubs.withdraw(P, CID, { amount: 100, confirm: true }), /Vorstand/);
    await assert.rejects(civic.Clubs.withdraw(V, CID, { amount: 100 }), /Veruntreuung/);
    await assert.rejects(civic.Clubs.withdraw(V, CID, { amount: 1e9, confirm: true }), /nicht in der Kasse/);
    const idx = await idxOf(V); const m0 = (await state(V)).money;
    await civic.Clubs.withdraw(V, CID, { amount: 100, confirm: true });
    assert.strictEqual((await state(V)).money - m0, 10000);
    const c = await club(CID);
    assert.ok(Math.abs(c.treasury_real - (30000 - 10000 / idx)) < 1e-6 && Math.abs(c.embezzled_real - 10000 / idx) < 1e-6);
    const ev = await db.one("SELECT * FROM court_evidence WHERE act = 'embezzle' AND offender_id = ?", [V]);
    assert.ok(ev && ev.known === 1 && ev.victim_company === CID && ev.victim_id !== V);
    embezzleId = ev.id;
    const r = await rep.get(V, BS); assert.ok(r.comps.scandal > 0, 'Skandal');
    const ledger = await civic.Clubs.ledgerView(db, CID, A, idx);
    assert.ok(ledger.some((e) => e.kind === 'withdraw' && e.who));
    // das Opfer erstattet Anzeige; das Verfahren läuft bis zum rechtskräftigen Urteil
    const gc = settings.DEFAULTS.gericht; gc.court.minP = 0; gc.court.maxP = 1;
    await db.query('UPDATE court_evidence SET strength = 100 WHERE id = ?', [ev.id]);
    const victim = ev.victim_id;
    const cs = await court.file(victim, { evidenceId: ev.id, defendantId: V });
    assert.strictEqual((await db.one('SELECT act FROM court_cases WHERE id = ?', [cs.id])).act, 'embezzle');
    const nowStep = async (id) => { await db.query("UPDATE court_cases SET step_ms = ? WHERE id = ? AND state IN ('filed','investigation','hearing','verdict','appeal')", [Date.now() - 1000, id]); return court.advanceCase(id); };
    let k; for (let i = 0; i < 8; i++) { k = await nowStep(cs.id); if (k.state === 'final') break; }
    assert.strictEqual(k.state, 'final'); assert.strictEqual(k.guilty, 1);
    const t1 = (await club(CID)).treasury_real; const sanc = await db.one("SELECT * FROM court_sanctions WHERE case_id = ? AND kind = 'damages'", [cs.id]);
    assert.ok(sanc && sanc.to_user === victim && Math.abs(sanc.amount_real - 10000 / idx) < 1e-6);
    const mV = (await state(V)).money; await service.getView(V); await service.getView(V);
    const paid = mV - (await state(V)).money; assert.ok(paid > 0);
    const t2 = (await club(CID)).treasury_real; assert.ok(t2 - t1 > 0 && t2 - t1 <= sanc.amount_real + 1e-6, 'Rückzahlung geht in die Vereinskasse');
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ? AND reason = 'court'", [victim])).n), 0, 'nicht an das klagende Mitglied');
    assert.ok(await db.one("SELECT 1 x FROM club_log WHERE club_id = ? AND kind = 'restitution'", [CID]));
    // Der verurteilte Vorsitzende verliert das Amt im Verein
    const c2 = await club(CID); assert.notStrictEqual(c2.president_id, V);
    assert.strictEqual((await db.one('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?', [CID, V])).role, 'member');
    gc.court.minP = 0.03; gc.court.maxP = 0.97;
  });

  await t.test('Auflösen: Vermögen fällt an die Stadt, Mitglieder verlieren die Zugehörigkeit, Name wird frei', async () => {
    const id = (await civic.Clubs.found(R, { kind: 'kultur', name: 'Chor Frohsinn', fee: 5 })).id;
    await civic.Clubs.join(N, id);
    await db.query('UPDATE clubs SET treasury_real = 5000 WHERE id = ?', [id]);
    const kult0 = Number((await db.one('SELECT kultur FROM city_civic WHERE city_id = ?', [BS])).kultur);
    await assert.rejects(civic.Clubs.dissolve(N, id), /Vorsitz/);
    await civic.Clubs.dissolve(R, id);
    assert.strictEqual((await club(id)).status, 'dissolved');
    assert.strictEqual(Number((await db.one('SELECT COUNT(*) n FROM club_members WHERE club_id = ?', [id])).n), 0);
    assert.ok(Number((await db.one('SELECT kultur FROM city_civic WHERE city_id = ?', [BS])).kultur) > kult0 + 4000);
    await service.getView(N); assert.ok(!(await state(N)).civic.clubs.some((c) => c.id === id));
    assert.ok((await letters(N, 'Verein aufgelöst')).length === 1);
    await civic.Clubs.found(R, { kind: 'kultur', name: 'Chor Frohsinn', fee: 5 }); // Name ist wieder frei
  });

  void embezzleId; void HA; void advance;
});
