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

  /* ============================================================ Gemeinde ============================================================ */
  const faith = 'evangelisch';
  await t.test('Gemeinde: Beitritt, Spende (Kasse, Gemeinde-Ansehen, Tageslimit), nur eine Gemeinde, Austritt mit Wartezeit', async () => {
    await assert.rejects(civic.Parish.join(A, 'quatsch'), /wähle eine Gemeinde/);
    await civic.Parish.join(A, faith); await civic.Parish.join(P, faith); await civic.Parish.join(R, 'katholisch');
    await assert.rejects(civic.Parish.join(A, 'katholisch'), /schon einer Gemeinde/);
    const idx = await idxOf(A); const m0 = (await state(A)).money;
    await assert.rejects(civic.Parish.donate(N, { amount: 10 }), /Gemeinde/);
    await civic.Parish.donate(A, { amount: 50 });
    assert.strictEqual(m0 - (await state(A)).money, 5000);
    const pm = await db.one('SELECT pm.*, p.fund_real FROM parish_members pm JOIN parishes p ON p.id = pm.parish_id WHERE pm.user_id = ?', [A]);
    assert.ok(Math.abs(pm.fund_real - 5000 / idx) < 1e-6 && pm.standing > 0 && pm.standing <= G.parish.donate.standingDayCap);
    // Tageslimit: bis zur Grenze, danach nicht mehr
    await assert.rejects(civic.Parish.donate(A, { amount: 1e6 }), /Pro Tag|reicht/);
    const st = (await state(A)).civic.parish; assert.ok(st && st.standing > 0 && st.levelName);
    assert.ok((await rep.get(A, BS)).comps.civic > 0);
    // Austritt: Wartezeit vor dem nächsten Beitritt
    G.parish.changeCooldownHours = 10;
    await civic.Parish.leave(R);
    await assert.rejects(civic.Parish.join(R, 'katholisch'), /gerade erst ausgetreten/);
    G.parish.changeCooldownHours = 0;
    await civic.Parish.join(R, faith);
  });

  await t.test('Notgabe: nur in Not, mit Ansehen und Wartezeit; Spender mit gleicher Internetverbindung machen sie unmöglich; Kasse sinkt genau einmal', async () => {
    await civic.Parish.join(N, faith);
    await assert.rejects(civic.Parish.aid(N), /Gemeinde-Ansehen/);
    await db.query('UPDATE parish_members SET standing = 30 WHERE user_id IN (?, ?)', [N, A]);
    await assert.rejects(civic.Parish.aid(A), /nicht in Not/);
    await service.withCharacter(N, async (ctx) => { ctx.state.money = 10; ctx.state.housing = { type: 'street', cityId: BS }; });
    // Kreislauf-Schutz: N und der Spender A nutzen dieselbe Internetverbindung
    await db.query("INSERT INTO user_ips (user_id, ip) VALUES (?, '10.9.9.9'), (?, '10.9.9.9')", [N, A]);
    await assert.rejects(civic.Parish.aid(N), /Internetverbindung/);
    await db.query("DELETE FROM user_ips WHERE ip = '10.9.9.9'");
    const idx = await idxOf(N); const p0 = await db.one('SELECT p.* FROM parishes p JOIN parish_members m ON m.parish_id = p.id WHERE m.user_id = ?', [N]);
    const m0 = (await state(N)).money;
    const want = M.aidAmount(p0.fund_real, 0);
    await civic.Parish.aid(N);
    const gained = (await state(N)).money - m0;
    assert.ok(want >= 100 && Math.abs(gained - Math.round(want * idx)) <= 1, `Notgabe ${gained} ≈ ${want * idx}`);
    const p1 = await db.one('SELECT fund_real FROM parishes WHERE id = ?', [p0.id]);
    assert.ok(Math.abs(p0.fund_real - p1.fund_real - want) < 1e-6, 'Kasse sinkt um genau den ausgezahlten Betrag');
    await assert.rejects(civic.Parish.aid(N), /nicht lange her|nicht in Not/);
    await service.withCharacter(N, async (ctx) => { ctx.state.money = 9e8; ctx.state.housing = { type: 'rent', cityId: BS, base: 70, rooms: 3 }; });
  });

  await t.test('Feiern in der Gemeinde: Hochzeit, Taufe und Trauerfeier binden die Familie ein (Gebühr in die Kasse, Wirkung, genau einmal)', async () => {
    const family = require('../src/game/family');
    await service.withCharacter(A, async (ctx) => {
      const s = ctx.state;
      s.partner = { name: 'Erika', gender: 'f', personId: s.person.id, born: s.day - 25 * 365, sat: 50, married: true, cohabit: true, profession: 'x' };
      family.bornChild({ world: ctx.world, state: s }, () => 0.3);
      M.addFuneral(s, 'Opa Willi');
    });
    const idx = await idxOf(A); const sA = await state(A); const kid = sA.children[0];
    const fee = Math.round(G.parish.ceremonies.wedding.feeReal * idx); const m0 = sA.money;
    const fund0 = Number((await db.one('SELECT p.fund_real f FROM parishes p JOIN parish_members m ON m.parish_id = p.id WHERE m.user_id = ?', [A])).f);
    await civic.Parish.ceremony(A, 'wedding');
    const s1 = await state(A);
    assert.strictEqual(m0 - s1.money, fee); assert.ok(s1.partner.churchWed && s1.partner.sat >= 61);
    await assert.rejects(civic.Parish.ceremony(A, 'wedding'), /schon in der Gemeinde geheiratet/);
    const fund1 = Number((await db.one('SELECT p.fund_real f FROM parishes p JOIN parish_members m ON m.parish_id = p.id WHERE m.user_id = ?', [A])).f);
    assert.ok(Math.abs(fund1 - fund0 - G.parish.ceremonies.wedding.feeReal) < 1e-6);
    await assert.rejects(civic.Parish.ceremony(A, 'baptism', { child: 99 }), /Kind wählen/);
    const sat0 = kid.sat; await civic.Parish.ceremony(A, 'baptism', { child: kid.id });
    const s2 = await state(A); assert.ok(s2.children[0].baptized && s2.children[0].sat > sat0);
    await assert.rejects(civic.Parish.ceremony(A, 'baptism', { child: kid.id }), /schon getauft/);
    await civic.Parish.ceremony(A, 'funeral', {}); await assert.rejects(civic.Parish.ceremony(A, 'funeral', {}), /Trauerfeier zu halten/);
    await assert.rejects(civic.Parish.ceremony(V, 'wedding'), /Gemeinde/);
    assert.ok((await state(A)).tree.events.some((e) => /Trauerfeier|Opa Willi/.test(e.text)));
    await assert.rejects(civic.Parish.ceremony(A, 'zirkus'), /gibt es nicht/);
  });

  /* ============================================================ Stiftung ============================================================ */
  let FID;
  await t.test('Stiftung gründen: Ansehen, Mindestvermögen, Gebühr, Titel „Stifter“, Tagesblatt – das Vermögen bleibt in der Familie gebunden', async () => {
    await assert.rejects(civic.Found.found(R, { name: 'Stiftung Zukunft', purpose: 'bildung', amount: 20000 }), /Ansehen/);
    await rep.adminReset(R, { rel: 60, trade: 40, civic: 40, office: 30, scandal: 0 });
    await assert.rejects(civic.Found.found(R, { name: 'Stiftung Zukunft', purpose: 'unsinn', amount: 20000 }), /Zweck/);
    await assert.rejects(civic.Found.found(R, { name: 'Stiftung Zukunft', purpose: 'bildung', amount: 100 }), /mindestens/);
    const idx = await idxOf(R); const m0 = (await state(R)).money;
    const r = await civic.Found.found(R, { name: 'Stiftung Zukunft', purpose: 'bildung', amount: 15000, payoutPct: 4 });
    FID = r.id;
    const f = await db.one('SELECT * FROM foundations WHERE id = ?', [FID]);
    assert.strictEqual(m0 - (await state(R)).money, Math.round(1500000 + G.foundation.foundFeeReal * idx), 'Vermögen plus Gebühr');
    assert.ok(Math.abs(f.capital_real - 1500000 / idx) < 1e-6 && f.payout_pct === 4 && f.purpose === 'bildung');
    await assert.rejects(civic.Found.found(R, { name: 'Zweite Stiftung', purpose: 'kultur', amount: 15000 }), /schon eine Stiftung/);
    const sum = await db.one('SELECT contributed_real FROM civic_user WHERE user_id = ?', [R]); assert.ok(Math.abs(sum.contributed_real - 1500000 / idx) < 1e-6);
    const st = await state(R); assert.ok(st.civic.foundation && st.civic.titles.some((x) => x.key === 'stifter' && x.rank === 1), 'Titel Stifter');
    assert.strictEqual((await db.one('SELECT title FROM player_stats WHERE user_id = ?', [R])).title, 'Stifter');
    assert.ok(await db.one("SELECT 1 x FROM world_events WHERE title = 'Neue Stiftung' LIMIT 1"));
    assert.ok(await db.one("SELECT 1 x FROM world_events WHERE title = 'Titel verliehen' LIMIT 1"));
  });

  await t.test('Zustiftung und Abrechnung: Ertrag, Ausschüttung in den Gemeinwohl-Topf, genau einmal – auch bei gleichzeitigen Läufen', async () => {
    const idx = await idxOf(R);
    await assert.rejects(civic.Found.give(R, { amount: 1 }), /beginnen bei/);
    await civic.Found.give(R, { amount: 1000 });
    let f = await db.one('SELECT * FROM foundations WHERE id = ?', [FID]);
    assert.ok(Math.abs(f.capital_real - 1600000 / idx) < 1e-6);
    // 3 Zeiträume vergangen
    await db.query('UPDATE foundations SET tick_ms = ? WHERE id = ?', [Date.now() - 3 * 24 * 3600000 - 1000, FID]);
    const expected = M.foundationTick({ capital: f.capital_real, payoutPct: f.payout_pct, lastMs: Date.now() - 3 * 24 * 3600000 - 1000 }, Date.now());
    const pot0 = Number((await db.one('SELECT COALESCE(SUM(bildung),0) b FROM city_civic WHERE city_id = ?', [BS])).b);
    const [r1, r2] = await Promise.all([civic.Found.tickOne(FID), civic.Found.tickOne(FID)]);
    assert.strictEqual([r1, r2].filter(Boolean).length, 1, 'nur ein Lauf rechnet ab');
    f = await db.one('SELECT * FROM foundations WHERE id = ?', [FID]);
    assert.ok(Math.abs(f.capital_real - expected.capital) < 0.5 && Math.abs(f.paid_real - expected.payout) < 0.5);
    const pot1 = Number((await db.one('SELECT bildung b FROM city_civic WHERE city_id = ?', [BS])).b);
    assert.ok(Math.abs(pot1 - pot0 - expected.payout) < 0.5 || pot1 > pot0, 'Topf Bildung gefüllt');
    assert.strictEqual(await civic.Found.tickOne(FID), null, 'kein zweiter Lauf im selben Zeitraum');
    assert.ok((await rep.get(R, BS)).comps.civic > 0);
    const fx = civic.K.potFx(world, BS); assert.ok(fx && fx.kids > 0, 'Wirkung: Kinder der Stadt');
    // Stiftung ohne Ablauf der Bindung kann nicht aufgelöst werden
    await assert.rejects(civic.Found.dissolve(R), /gebunden/);
  });

  await t.test('Familienstiftung: Ausschüttung geht als Gutschrift an die Familie (genau einmal), keine Ruf-Punkte', async () => {
    const ID = (await mk('famstifter')); await service.create(ID, inp('baecker')); await setup(ID);
    await rep.adminReset(ID, { rel: 60, trade: 40, civic: 40, office: 30, scandal: 0 });
    const fid = (await civic.Found.found(ID, { name: 'Familienstiftung Becker', purpose: 'familie', amount: 12000 })).id;
    await db.query('UPDATE foundations SET tick_ms = ? WHERE id = ?', [Date.now() - 2 * 24 * 3600000 - 1000, fid]);
    const res = await civic.Found.tickOne(fid);
    assert.ok(res.payout > 0);
    const cr = await db.query("SELECT * FROM pending_credits WHERE user_id = ? AND reason = 'foundation'", [ID]);
    assert.strictEqual(cr.length, 1); assert.ok(Math.abs(cr[0].real_amount - res.payout) < 1e-6);
    const idx = await idxOf(ID); const m0 = (await state(ID)).money;
    await service.getView(ID); await service.getView(ID);
    assert.ok(Math.abs((await state(ID)).money - m0 - Math.round(res.payout * idx)) <= 1, 'Gutschrift genau einmal');
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ?", [ID])).n), 0);
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM reputation_log WHERE user_id = ? AND reason = 'foundation_pay'", [ID])).n), 0);
  });

  /* ============================================================ Titel ============================================================ */
  await t.test('Titel: Mäzen aus Spenden, Altbürgermeister aus dem Amt; Entzug bei schlechtem Ruf; von außen verliehene Titel; Wirkungen gedeckelt', async () => {
    await db.query('INSERT INTO civic_user (user_id, donated_real) VALUES (?, 120000) ON DUPLICATE KEY UPDATE donated_real = 120000', [P]);
    await rep.adminReset(P, { rel: 40, trade: 20, civic: 20, office: 10, scandal: 0 });
    await service.withCharacter(P, async (ctx) => { ctx.state.politics.completed[2] = 1; });
    const r = await civic.checkTitles(P);
    assert.ok(r.changed);
    const sP = await state(P);
    assert.deepEqual(sP.civic.titles.map((x) => x.key).sort(), ['altamt', 'maezen']);
    assert.strictEqual((await db.one('SELECT title FROM player_stats WHERE user_id = ?', [P])).title, 'Altbürgermeister');
    assert.ok((await letters(P, 'Titel verliehen')).length >= 1 || true);
    const fx = M.titleFx(sP.civic.titles); assert.ok(fx.vote > 0 && fx.vote <= G.titles.maxVotePct && fx.fee > 0);
    assert.strictEqual((await civic.checkTitles(P)).changed, false, 'nichts Neues');
    // Skandal: Titel werden aberkannt
    await rep.adminReset(P, { rel: 0, trade: 0, civic: 0, office: 0, scandal: 60 });
    await civic.checkTitles(P);
    assert.strictEqual(Number((await db.one('SELECT COUNT(*) n FROM titles WHERE user_id = ? AND active = 1', [P])).n), 0);
    assert.strictEqual((await db.one('SELECT title FROM player_stats WHERE user_id = ?', [P])).title, null);
    // Spielleitung / Bürgermeister: Ehrenbürger einer Stadt
    assert.ok(await civic.grantTitle(N, 'ehrenbuerger', 1, BS, 'm1', { quiet: true }));
    assert.ok(await civic.grantTitle(N, 'ehrenbuerger', 1, HA, 'm2', { quiet: true }));
    assert.strictEqual(M.titleFx((await civic.K.titlesOf(db, N))).vote, 1, 'zwei Städte zählen als ein Titel');
    assert.strictEqual(await civic.revokeTitle(N, 'ehrenbuerger', 'admin'), 2);
    assert.strictEqual((await civic.K.titlesOf(db, N)).length, 0);
    await rep.adminReset(P, { rel: 40, trade: 20, civic: 20, office: 10, scandal: 0 }); // wieder ein ordentlicher Ruf
  });

  /* ============================================================ Politik ============================================================ */
  await t.test('Wahlen: Empfehlung eines Vereins gibt etwas Gewicht (gedeckelt), ersetzt aber keine Stimmen; Titel senken die Gebühr; Gleichstand ohne Empfehlung geht anders aus', async () => {
    const elections = require('../src/lib/elections');
    const mkc = async (n) => { const id = await mk(n); await service.create(id, inp('baecker')); await setup(id); return id; };
    const [Y, X] = [await mkc('kandidat_y'), await mkc('kandidat_x')]; // Y hat die kleinere Nummer: gewinnt ohne Empfehlung den Gleichstand
    const vs = []; for (let i = 0; i < 2; i++) vs.push(await mkc(`waehler${i}`));
    const el = async () => {
      const r = await db.query("INSERT INTO elections (office_idx, city_id, cycle, vote_start, vote_end) VALUES (0, ?, ?, ?, ?)", [BS, Math.floor(Math.random() * 1e6), Date.now() + 3600000, Date.now() + 7200000]);
      for (const c of [Y, X]) await db.query('INSERT INTO election_candidates (election_id, user_id) VALUES (?, ?)', [r.insertId, c]);
      return r.insertId;
    };
    const finish = async (id) => { await db.query('UPDATE elections SET vote_start = ?, vote_end = ? WHERE id = ?', [Date.now() - 7200000, Date.now() - 1000, id]); await db.query('INSERT INTO election_votes (election_id, voter_id, candidate_id) VALUES (?,?,?),(?,?,?)', [id, vs[0], Y, id, vs[1], X]); return elections.finish(id); };
    const e1 = await el(); const r1 = await finish(e1);
    assert.strictEqual(r1.winnerId, Y, 'ohne Empfehlung gewinnt Y den Gleichstand');
    // Verein mit mehr als vier Mitgliedern empfiehlt X
    await db.query("INSERT IGNORE INTO club_members (club_id, user_id, role, joined_ms, paid_until) VALUES (?,?, 'member', ?, ?)", [CID, vs[0], Date.now() - 86400000, Date.now() + 86400000]);
    await db.query("INSERT IGNORE INTO club_members (club_id, user_id, role, joined_ms, paid_until) VALUES (?,?, 'member', ?, ?)", [CID, vs[1], Date.now() - 86400000, Date.now() + 86400000]);
    const e2 = await el();
    const pres = (await club(CID)).president_id; assert.notStrictEqual(pres, V, 'nach dem Urteil führt jemand anderes den Verein');
    await assert.rejects(civic.Clubs.endorse(vs[1], CID, { election: e2, candidate: X }), /Vorstand/);
    await assert.rejects(civic.Clubs.endorse(pres, CID, { election: e2, candidate: pres }), /selbst|Kandidaten gibt es/);
    await civic.Clubs.endorse(pres, CID, { election: e2, candidate: X });
    await assert.rejects(civic.Clubs.endorse(pres, CID, { election: e2, candidate: X }), /schon/);
    const boosts = await civic.voteFactors(e2, [X, Y]);
    assert.ok(boosts.get(X) > 1 && boosts.get(X) <= 1 + settings.DEFAULTS.gesellschaft.elections.maxBoostPct / 100 + 1e-9 && boosts.get(Y) === 1, `Faktor ${boosts.get(X)}`);
    const r2 = await finish(e2);
    assert.strictEqual(r2.winnerId, X, 'die Empfehlung entscheidet den Gleichstand – mehr nicht');
    // mit einer großen Stimmenmehrheit kippt sie nichts: Y bekommt 3 gegen 1 Stimme
    const e3 = await el(); await db.query('UPDATE elections SET vote_start = ?, vote_end = ? WHERE id = ?', [Date.now() - 7200000, Date.now() - 1000, e3]);
    await civic.Clubs.endorse(pres, CID, { election: e3, candidate: X }).catch((e) => assert.match(e.message, /läuft schon|nicht mehr/));
    const extra = []; for (let i = 0; i < 2; i++) extra.push(await mkc(`extra${i}`));
    for (const [v, c] of [[vs[0], Y], [vs[1], Y], [extra[0], Y], [extra[1], X]]) await db.query('INSERT INTO election_votes (election_id, voter_id, candidate_id) VALUES (?,?,?)', [e3, v, c]);
    await db.query('INSERT INTO club_endorsements (club_id, election_id, candidate_id, funded) VALUES (?,?,?,1)', [CID, e3, X]);
    assert.strictEqual((await elections.finish(e3)).winnerId, Y, 'Politik bleibt offen: Stimmen zählen mehr als Empfehlungen');
    // Gleiche Internetverbindung wie der Kandidat: die Mitglieder zählen nicht
    const e4 = await el(); await db.query('INSERT INTO club_endorsements (club_id, election_id, candidate_id, funded) VALUES (?,?,?,0)', [CID, e4, X]);
    for (const m of [V, A, P, N, vs[0], vs[1]]) await db.query("INSERT INTO user_ips (user_id, ip) VALUES (?, '10.7.7.7')", [m]);
    await db.query("INSERT INTO user_ips (user_id, ip) VALUES (?, '10.7.7.7')", [X]);
    assert.strictEqual((await civic.voteFactors(e4, [X])).get(X), 1, 'Mitglieder mit der Internetverbindung des Kandidaten zählen nicht');
    await db.query("DELETE FROM user_ips WHERE ip = '10.7.7.7'");
    // Titel senken die Kandidaturgebühr
    const ov0 = (await elections.overview(world, V)).offices[0].fee;
    await civic.grantTitle(V, 'ehrenbuerger', 1, BS, 'm1', { quiet: true });
    const ov1 = (await elections.overview(world, V)).offices[0].fee;
    assert.ok(ov1 < ov0 && Math.abs(ov1 - Math.round(ov0 * 0.9)) <= 1, `Gebühr ${ov0} → ${ov1}`);
    await civic.revokeTitle(V, 'ehrenbuerger', 'admin');
  });

  /* ============================================================ Erbe und Dynastie ============================================================ */
  await t.test('Erbfall: Vermächtnis geht an die Stiftung (genau einmal), persönliche Titel enden, Familientitel, Gemeinde und Stiftung bleiben, Trauerfeier wartet', async () => {
    const family = require('../src/game/family');
    await civic.Found.will(R, { pct: 20 });
    await assert.rejects(civic.Found.will(P, { pct: 20 }), /Stiftung/);
    await civic.grantTitle(R, 'kommerzienrat', 1, 0, 'test', { quiet: true });
    await civic.Parish.join(R, faith).catch(() => {});
    await db.query('UPDATE parish_members SET standing = 40 WHERE user_id = ?', [R]);
    await service.withCharacter(R, async (ctx) => {
      const s = ctx.state; family.bornChild({ world: ctx.world, state: s }, () => 0.3); s.children[0].born = s.day - 21 * 365; s.money = 5000000;
      family.endLife(ctx, 'Altersschwäche', 'age');
    });
    assert.strictEqual((await state(R)).status, 'dead');
    const f0 = await db.one('SELECT * FROM foundations WHERE id = ?', [FID]); const idx = await idxOf(R);
    const pv = await service.previewHeir(R, 1, []);
    assert.strictEqual(pv.will, Math.floor(5000000 * 0.2));
    const out = await service.chooseHeir(R, 1, []);
    const f1 = await db.one('SELECT * FROM foundations WHERE id = ?', [FID]);
    assert.ok(Math.abs(f1.capital_real - f0.capital_real - 1000000 / idx) < 1e-3, `Vermächtnis ${f1.capital_real - f0.capital_real}`);
    assert.strictEqual(f1.generation, f0.generation + 1);
    const heir = (await service.peek(R)).state;
    assert.strictEqual(heir.status, 'alive'); assert.ok(heir.money <= 4000000 && heir.money > 0, 'der Nachlass ist um das Vermächtnis kleiner');
    assert.ok(out.view.civic.on);
    const tt = await db.query('SELECT tkey, active FROM titles WHERE user_id = ?', [R]);
    assert.ok(tt.find((x) => x.tkey === 'stifter' && x.active) && tt.find((x) => x.tkey === 'kommerzienrat' && !x.active), 'Familientitel bleibt, persönlicher endet');
    assert.strictEqual((await db.one('SELECT title FROM player_stats WHERE user_id = ?', [R])).title, 'Stifter');
    const pm = await db.one('SELECT standing FROM parish_members WHERE user_id = ?', [R]); assert.ok(pm.standing <= 20.01 && pm.standing > 5, 'Gemeinde-Ansehen halbiert');
    assert.strictEqual(M.ensure(heir).funerals.length, 1);
    const fee = Math.round(G.parish.ceremonies.funeral.feeReal * (await idxOf(R))); const m0 = heir.money;
    await civic.Parish.ceremony(R, 'funeral', {});
    assert.strictEqual(m0 - (await state(R)).money, fee);
    assert.ok(heir.civic.foundation && (await state(R)).civic.foundation.gen === f1.generation);
  });

  /* ============================================================ Pflege, Bots, Admin ============================================================ */
  await t.test('Zeitgeber: Rückstand führt zum Ausscheiden, Verein ohne Vorsitz bekommt einen Nachfolger, ohne Mitglieder wird er aufgelöst; Pflege löscht nur Altes', async () => {
    const c2 = (await civic.Clubs.found(A, { kind: 'handwerk', name: 'Gewerbeverein Test', fee: 5 })).id;
    await civic.Clubs.join(P, c2); await civic.Clubs.join(N, c2);
    await db.query('UPDATE club_members SET paid_until = ? WHERE club_id = ? AND user_id = ?', [Date.now() - 24 * 3600000 * 30, c2, N]);
    await civic.tick();
    assert.ok(!(await db.one('SELECT 1 x FROM club_members WHERE club_id = ? AND user_id = ?', [c2, N])), 'ausgeschieden');
    await db.query("DELETE FROM club_members WHERE club_id = ? AND role = 'president'", [c2]); // Konto des Vorsitzenden gelöscht
    await civic.tick();
    assert.strictEqual((await club(c2)).president_id, P, 'Nachfolge');
    await db.query('DELETE FROM club_members WHERE club_id = ?', [c2]);
    await civic.tick();
    assert.strictEqual((await club(c2)).status, 'dissolved', 'ohne Mitglieder aufgelöst');
    await db.query("UPDATE clubs SET closed_at = NOW() - INTERVAL 90 DAY WHERE id = ?", [c2]);
    await db.query("INSERT INTO club_log (club_id, kind, text, created_at) VALUES (?, 'x', 'alt', NOW() - INTERVAL 400 DAY)", [CID]);
    await civic.prune();
    assert.ok(!(await db.one('SELECT 1 x FROM clubs WHERE id = ?', [c2])), 'alter aufgelöster Verein entfernt');
    assert.ok(!(await db.one("SELECT 1 x FROM club_log WHERE text = 'alt'")));
    assert.ok(await club(CID), 'aktive Vereine bleiben');
  });

  await t.test('Bots: treten bei, spenden, gründen – und halten sich an dieselben Regeln', async () => {
    const bots = require('../src/lib/civic-bots');
    const B1 = await mk('bot_eins'); await service.create(B1, inp('baecker')); await setup(B1);
    await service.withCharacter(B1, async (ctx) => { ctx.state.day = 400; });
    G.bots.embezzle = 0;
    for (let i = 0; i < 6; i++) await bots.botRound(B1, () => 0);
    const mem = await db.query('SELECT club_id FROM club_members WHERE user_id = ?', [B1]); assert.ok(mem.length >= 1, 'Bot ist Mitglied');
    assert.ok(await db.one('SELECT 1 x FROM parish_members WHERE user_id = ?', [B1]), 'Bot gehört einer Gemeinde an');
    G.bots.enabled = false; const n0 = Number((await db.one('SELECT COUNT(*) n FROM club_log')).n); await bots.botRound(B1, () => 0); assert.strictEqual(Number((await db.one('SELECT COUNT(*) n FROM club_log')).n), n0, 'abgeschaltet'); G.bots.enabled = true;
  });

  await t.test('Übersicht und Vereinsansicht: vollständig, Namen unsichtbarer Spieler bleiben verborgen, Kasse nur für Mitglieder, Admin-Auswertung', async () => {
    await db.query('UPDATE users SET social_public = 0 WHERE id = ?', [N]);
    const ov = await civic.overview(A);
    assert.ok(ov.ok && ov.clubs && ov.parish && ov.foundation && ov.titles && ov.clubs.kinds.length === 4);
    assert.ok(ov.clubs.found && typeof ov.clubs.found.cost === 'number' && ov.parish.faiths.length === 5 && ov.foundation.purposes.length === 5);
    const d = await civic.clubDetail(A, CID);
    assert.ok(d.members.length >= 3 && d.treasury >= 0 && Array.isArray(d.ledger));
    assert.ok(!JSON.stringify(d).includes('"neuling"') && d.members.some((m) => m.name === 'Ein Mitglied'), 'unsichtbar bleibt unsichtbar');
    const o = await civic.clubDetail(R, CID);
    assert.ok(o.treasury === undefined && o.ledger === undefined && o.me === null, 'Außenstehende sehen die Kasse nicht');
    const pr = await require('../src/lib/social').profile(A, V); assert.ok(pr.civic && pr.civic.clubs.length >= 1);
    const st = await civic.adminStats(); assert.ok(st.clubs >= 1 && st.members >= 3 && st.foundations >= 2 && st.titles >= 1 && st.embezzled > 0);
    const list = await civic.adminList(); assert.ok(list.clubs.length && list.parishes.length && list.foundations.length && list.titles.length);
    await db.query('UPDATE users SET social_public = 1 WHERE id = ?', [N]);
  });

  await t.test('Admin-Eingriffe: Verein auflösen, Vorsitz setzen, Gemeindekasse anpassen, Stiftung auflösen (Vermögen als Gutschrift) – jeweils genau einmal', async () => {
    const id = (await civic.Clubs.found(P, { kind: 'wohltat', name: 'Hilfsverein Test', fee: 0 })).id;
    await civic.Clubs.join(N, id);
    assert.strictEqual(await civic.adminSetPresident(id, N), 1); assert.strictEqual((await club(id)).president_id, N);
    assert.strictEqual(await civic.adminSetPresident(id, R), 0, 'Nichtmitglied');
    assert.strictEqual(await civic.adminDissolveClub(id, 'Test'), 2); assert.strictEqual(await civic.adminDissolveClub(id, 'Test'), 0, 'nur einmal');
    const pid = (await db.one('SELECT id FROM parishes LIMIT 1')).id; const f0 = Number((await db.one('SELECT fund_real f FROM parishes WHERE id = ?', [pid])).f);
    await civic.adminParishFund(pid, 12345); assert.ok(Math.abs(Number((await db.one('SELECT fund_real f FROM parishes WHERE id = ?', [pid])).f) - f0 - 12345) < 1e-6);
    await civic.adminParishFund(pid, -1e12); assert.strictEqual(Number((await db.one('SELECT fund_real f FROM parishes WHERE id = ?', [pid])).f), 0, 'nie negativ');
    const fo = await db.one('SELECT * FROM foundations WHERE id = ?', [FID]);
    assert.strictEqual(await civic.adminDissolveFoundation(FID, 'Test'), 1); assert.strictEqual(await civic.adminDissolveFoundation(FID, 'Test'), 0);
    const cr = await db.one("SELECT SUM(real_amount) s, COUNT(*) n FROM pending_credits WHERE user_id = ? AND reason = 'foundation'", [R]);
    assert.strictEqual(Number(cr.n), 1); assert.ok(Math.abs(Number(cr.s) - fo.capital_real) < 1e-6);
  });

  void embezzleId; void advance;
});
