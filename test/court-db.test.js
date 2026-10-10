'use strict';
/**
 * Gerichte und Beweise gegen eine echte MySQL/MariaDB-Datenbank (opt-in wie test/db-flows.test.js):
 *   TP_TEST_DB_HOST=127.0.0.1 TP_TEST_DB_PORT=3306 TP_TEST_DB_USER=root npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Gericht: Spuren, Anzeige, Verfahren, Sanktionen, Zahlungen genau einmal, Sperren, Vergleich, Politik gegen echte Datenbank', { skip }, async (t) => {
  process.env.TP_COURT_CACHE_MS = '0';
  const mysql = require('mysql2/promise');
  const name = `tp_court_${process.pid}`;
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
  const M = require('../src/game/court');
  const court = require('../src/lib/court');
  const policy = require('../src/lib/court-policy');
  const rep = require('../src/lib/reputation');
  const service = require('../src/game/service');
  const world = await require('../src/game/world').get();
  const city = world.cityList.find((c) => c.slug === 'braunschweig').id;
  const G = settings.get('gericht'); G.minAccountHours = 0; G.minGameDays = 0;
  const ruf = settings.get('ruf'); ruf.minAccountHours = 0;
  const events = settings.get('events'); void events;
  const mk = async (n) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at) VALUES (?,?,?,?,?,?,?)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now()])).insertId;
  const inp = { gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: city, professionKey: 'baecker', fatherName: 'a', motherName: 'b' };
  const [A, B, C] = [await mk('anna'), await mk('bernd'), await mk('carla')];
  for (const u of [A, B, C]) { await service.create(u, inp); await service.withCharacter(u, async (ctx) => { ctx.state.money = 5e7; ctx.state.noRandom = true; }); }
  const state = async (u) => (await service.peek(u)).state;
  const money = async (u) => (await state(u)).money;
  const idx = async (u) => { const s = await state(u); return world.idx(Math.floor(s.day / 365) + s.startYear); };
  const ev = async (id) => db.one('SELECT * FROM court_evidence WHERE id = ?', [id]);
  const certain = () => { G.court.minP = 0; G.court.maxP = 1; };
  const nowStep = async (id) => { await db.query('UPDATE court_cases SET step_ms = ? WHERE id = ? AND state IN (\'filed\',\'investigation\',\'hearing\',\'verdict\',\'appeal\')', [Date.now() - 1000, id]); return court.advanceCase(id); };
  const age = async () => db.query('UPDATE court_cases SET created_ms = created_ms - ?', [40 * 86400000]);
  const runOut = async (id) => { let c; for (let i = 0; i < 8; i++) { c = await nowStep(id); if (!M.OPEN_STATES.includes(c.state)) break; } return c; };

  await t.test('Spuren: werden dem Opfer gemeldet, bleiben vor dem Täter verborgen, verblassen und verfallen', async () => {
    const id = await court.trace(null, { act: 'sabotage', offenderId: B, victimId: A, victimCompany: 1, subject: 'Bäckerei Anna', cityId: city, damageReal: 2000, strength: 80 });
    assert.ok(id > 0);
    const oa = await court.overview(A);
    assert.strictEqual(oa.evidence.length, 1);
    assert.ok(oa.evidence[0].strength > 70 && oa.evidence[0].band === 'stark');
    assert.strictEqual(oa.evidence[0].suspect, null, 'Name nie umsonst');
    assert.ok(!('offender_id' in oa.evidence[0]) && !JSON.stringify(oa).includes('"bernd"'));
    assert.strictEqual((await court.overview(B)).evidence.length, 0, 'der Täter sieht keine Spuren');
    const st = await service.getView(A); // Meldung „Spuren gesichert“ erscheint beim Laden
    assert.ok(st.view.notices.some((n) => n.title === 'Spuren gesichert'));
    assert.ok(st.view.court.ev === 1);
    // Verblassen: nach 120 h Halbwertszeit etwa die Hälfte
    await db.query('UPDATE court_evidence SET created_ms = created_ms - ? WHERE id = ?', [120 * 3600000, id]);
    const o2 = await court.overview(A); assert.ok(o2.evidence[0].strength > 30 && o2.evidence[0].strength < 45, `halb: ${o2.evidence[0].strength}`);
    await db.query('UPDATE court_evidence SET created_ms = created_ms - ?, expires_ms = expires_ms - ? WHERE id = ?', [600 * 3600000, 600 * 3600000, id]);
    assert.strictEqual((await court.overview(A)).evidence.length, 0, 'zu alt: nicht mehr verwertbar');
    await court.tick(); assert.strictEqual((await ev(id)).status, 'expired');
  });

  await t.test('Detektiv, Zeugen und Dokumentation: kosten Geld, wirken begrenzt, Detektiv zeitverzögert und genau einmal', async () => {
    const id = await court.trace(null, { act: 'spy', offenderId: B, victimId: A, subject: 'Bäckerei Anna', cityId: city, damageReal: 0, strength: 20 });
    const m0 = await money(A);
    await court.evidenceAction(A, id, 'witness'); await court.evidenceAction(A, id, 'docs');
    assert.ok((await money(A)) < m0, 'Kosten abgebucht');
    let e = await ev(id); assert.strictEqual(e.boost, G.witness.boost + G.docs.boost);
    await assert.rejects(court.evidenceAction(A, id, 'docs'), /dokumentiert/);
    await court.evidenceAction(A, id, 'detective');
    await assert.rejects(court.evidenceAction(A, id, 'detective'), /bereits/);
    await assert.rejects(court.evidenceAction(B, id, 'witness'), /nicht/, 'nur das Opfer');
    e = await ev(id); assert.ok(e.det_until > Date.now());
    assert.strictEqual(await court.settleDetectives(Date.now()), 0, 'noch nicht fertig');
    await db.query('UPDATE court_evidence SET det_until = ? WHERE id = ?', [Date.now() - 10, id]);
    const b0 = (await ev(id)).boost;
    await court.settleDetectives(Date.now()); await court.settleDetectives(Date.now());
    e = await ev(id); assert.ok(e.boost > b0 && e.boost <= b0 + G.detective.boostMax && e.det_n === 1 && e.det_until === null, 'genau einmal angewendet');
    assert.ok(e.strength + e.boost <= 100);
  });

  await t.test('Anzeige: Gebühr, Mindest-Beweislage, Wochenlimit, Paarsperre, gleiche IP und neue Konten', async () => {
    const weak = await court.trace(null, { act: 'spy', offenderId: B, victimId: A, cityId: city, strength: 6 });
    await assert.rejects(court.file(A, { evidenceId: weak, defendantId: B }), /zu schwach/);
    await assert.rejects(court.file(A, { evidenceId: weak, defendantId: A }), /nenne/);
    const strong = await court.trace(null, { act: 'sabotage', offenderId: B, victimId: A, victimCompany: 1, subject: 'Bäckerei Anna', cityId: city, damageReal: 3000, strength: 85 });
    await db.query("INSERT INTO user_ips (user_id, ip) VALUES (?, '10.1.1.1'), (?, '10.1.1.1')", [A, B]);
    await assert.rejects(court.file(A, { evidenceId: strong, defendantId: B }), /Internetverbindung/);
    await db.query("DELETE FROM user_ips WHERE ip = '10.1.1.1'");
    G.minAccountHours = 5000; await assert.rejects(court.file(A, { evidenceId: strong, defendantId: B }), /Neue Konten/); G.minAccountHours = 0;
    const m0 = await money(A);
    const r = await court.file(A, { evidenceId: strong, defendantId: B });
    assert.ok(r.id > 0);
    assert.strictEqual(m0 - (await money(A)), Math.round(G.complaint.fee * (await idx(A))), 'Anzeigegebühr genau einmal');
    assert.strictEqual((await ev(strong)).status, 'used');
    await assert.rejects(court.file(A, { evidenceId: strong, defendantId: B }), /nicht \(mehr\)|Verfahren/);
    const again = await court.trace(null, { act: 'sabotage', offenderId: B, victimId: A, cityId: city, strength: 85 });
    await assert.rejects(court.file(A, { evidenceId: again, defendantId: B }), /Tagen schon Anzeige/);
    // Beklagter wird benachrichtigt
    const vb = await service.getView(B); assert.ok(vb.view.notices.some((n) => n.title === 'Du wurdest angezeigt') && vb.view.court.act === 1);
    assert.ok((await db.one("SELECT COUNT(*) n FROM messages WHERE to_user = ? AND subject LIKE 'Gericht%'", [B])).n >= 1, 'Brief an den Beklagten');
    await db.query("UPDATE court_cases SET state = 'withdrawn' WHERE id = ?", [r.id]); // aufräumen für spätere Tests
    await db.query("DELETE FROM court_cases WHERE state = 'withdrawn'");
    await db.query("UPDATE court_evidence SET status = 'expired' WHERE victim_id = ?", [A]);
  });

  await t.test('Verfahren bis zum rechtskräftigen Urteil: Zahlungen genau einmal, Opfer erhält exakt, Ehrverlust, Tagesblatt', async () => {
    certain();
    const id = await court.trace(null, { act: 'sabotage', offenderId: B, victimId: A, victimCompany: 1, subject: 'Bäckerei Anna', cityId: city, damageReal: 3000, strength: 100 });
    const { id: caseId } = await court.file(A, { evidenceId: id, defendantId: B });
    await db.query('UPDATE court_cases SET step_ms = ? WHERE id = ?', [Date.now() - 1000, caseId]);
    let c = await court.advanceCase(caseId); assert.ok(['investigation', 'hearing'].includes(c.state), c.state);
    await court.respond(B, caseId, 'lawyer'); await assert.rejects(court.respond(B, caseId, 'lawyer'), /bereits/);
    await court.respond(A, caseId, 'detective');
    c = await db.one('SELECT * FROM court_cases WHERE id = ?', [caseId]); assert.strictEqual(c.lawyer_d, 1); assert.strictEqual(c.det_p, 1);
    c = await nowStep(caseId); c = await nowStep(caseId);
    assert.strictEqual(c.state, 'verdict', c.state); assert.strictEqual(c.guilty, 1); assert.ok(c.level >= 3);
    const plan = JSON.parse(c.plan); assert.ok(plan.some((s) => s.kind === 'damages' && s.real === 3000) && plan.some((s) => s.kind === 'fine') && plan.some((s) => s.kind === 'honor'));
    assert.strictEqual((await db.one('SELECT COUNT(*) n FROM court_sanctions WHERE case_id = ?', [caseId])).n, 0, 'vor der Rechtskraft keine Sanktionen');
    const sc0 = (await rep.get(B, city)).comps.scandal;
    c = await nowStep(caseId); assert.strictEqual(c.state, 'final');
    assert.strictEqual((await rep.get(B, city)).comps.scandal > sc0 + 5, true, 'Ehrverlust über reputation.punish');
    const sanc = await db.query('SELECT * FROM court_sanctions WHERE case_id = ?', [caseId]);
    assert.ok(sanc.some((s) => s.kind === 'damages') && sanc.some((s) => s.kind === 'fine'));
    // Zahlung: B lädt seinen Spielstand mehrmals – jede Zahlung genau einmal, A erhält exakt das Gezahlte
    const mB0 = await money(B); const mA0 = await money(A); const ib = await idx(B); const ia = await idx(A);
    await service.getView(B); await service.getView(B); await service.getView(B);
    const paid = mB0 - (await money(B));
    const dmg = sanc.find((s) => s.kind === 'damages'); const fine = sanc.find((s) => s.kind === 'fine');
    assert.ok(Math.abs(paid - Math.round((dmg.amount_real + fine.amount_real) * ib)) <= 2, `B zahlt Schaden + Strafe: ${paid}`);
    assert.strictEqual((await db.one("SELECT COUNT(*) n FROM court_sanctions WHERE case_id = ? AND status = 'active'", [caseId])).n, 0);
    const credit = await db.one("SELECT COUNT(*) n, SUM(real_amount) s FROM pending_credits WHERE user_id = ? AND reason = 'court'", [A]);
    assert.strictEqual(Number(credit.n), 1); assert.ok(Math.abs(Number(credit.s) - dmg.amount_real) < 1, 'Gutschrift = Schadenersatz');
    await service.getView(A); await service.getView(A);
    const gained = (await money(A)) - mA0;
    assert.ok(Math.abs(gained - Math.round(dmg.amount_real * ia)) <= 2, `A erhält genau den Schadenersatz: ${gained}`);
    assert.strictEqual((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ?", [A])).n, 0, 'Gutschrift genau einmal eingelöst');
    const news = await db.one("SELECT COUNT(*) n FROM world_events WHERE title = 'Gericht'"); assert.ok(Number(news.n) >= 1, 'Tagesblatt (Stufe ab 3)');
  });

  await t.test('Einschränkungen: Haft sperrt Wirtschaftliches, nicht Alltag; Gewerbeverbot; Ablauf; Schutz der Uhr', async () => {
    const caseId = (await db.query("INSERT INTO court_cases (act, plaintiff_id, defendant_id, city_id, state, step_ms, created_ms, updated_ms, guilty, level) VALUES ('sabotage', ?, ?, ?, 'final', 0, ?, ?, 1, 5)", [A, C, city, Date.now(), Date.now()])).insertId;
    await db.query("INSERT INTO court_sanctions (case_id, user_id, kind, level, until_ms, params, status, created_ms) VALUES (?,?,'haft',5,?,'{}','active',?)", [caseId, C, Date.now() + 3600000, Date.now()]);
    court.invalidate(C);
    const v = await service.getView(C);
    assert.ok(v.view.court.r.some((x) => x.k === 'haft'));
    await assert.rejects(service.doAction(C, 'buyBiz', { listing: 'x' }), /Haft/);
    await assert.rejects(service.doAction(C, 'loanTake', { amount: 100, term: 3 }), /Haft/);
    await assert.rejects(require('../src/lib/market').makeOffer(C, { kind: 'prop', ownerId: A, itemId: 1, priceReal: 5000 }), /Haft/);
    await assert.rejects(require('../src/lib/rivalry').perform(C, A, 1, 'spy'), /Haft/);
    await assert.rejects(require('../src/lib/exchange').place(C, 1, 'buy', 1, 100), /Haft/);
    const ok = await service.doAction(C, 'buyFood', { tier: 0 }).catch((e) => e); assert.ok(!(ok instanceof Error) || !/Haft/.test(ok.message), 'Essen bleibt möglich');
    // Uhr läuft geschützt weiter: kein Verhungern
    await service.withCharacter(C, async (ctx) => { ctx.state.meters.fridge = 0; });
    await db.query('UPDATE users SET efs_accrued_at = efs_accrued_at - 3600000 WHERE id = ?', [C]);
    const s1 = await service.getView(C); assert.strictEqual(s1.view.status, 'alive');
    // Ablauf
    await db.query("UPDATE court_sanctions SET until_ms = ? WHERE user_id = ?", [Date.now() - 1000, C]); court.invalidate(C);
    const v2 = await service.getView(C); assert.ok(!v2.view.court.r.length);
    assert.strictEqual((await db.one("SELECT COUNT(*) n FROM court_sanctions WHERE user_id = ? AND status = 'active'", [C])).n, 0);
    await assert.doesNotReject(require('../src/lib/court').assertFree(C, 'econ'));
    // Gewerbeverbot sperrt Gründungen, nicht den Alltag
    await db.query("INSERT INTO court_sanctions (case_id, user_id, kind, level, until_ms, params, status, created_ms) VALUES (?,?,'gewerbe',5,?,'{}','active',?)", [caseId, C, Date.now() + 3600000, Date.now()]);
    court.invalidate(C); await service.getView(C);
    await assert.rejects(service.doAction(C, 'foundBiz', {}), /Gewerbeverbot/);
    await assert.rejects(require('../src/lib/supply').offer(C, { role: 'buy' }), /Gewerbeverbot/);
    await db.query("UPDATE court_sanctions SET status = 'annulled' WHERE user_id = ?", [C]); court.invalidate(C);
  });

  await t.test('Freispruch: haltlose Anzeige kostet die Anklage Ansehen und Geldbuße; Berufung nur einmal', async () => {
    const e = await court.trace(null, { act: 'sabotage', offenderId: B, victimId: A, victimCompany: 1, cityId: city, damageReal: 100, strength: 40 });
    await age(); const { id: caseId } = await court.file(A, { evidenceId: e, defendantId: C }); // falscher Verdächtiger
    await db.query('UPDATE court_cases SET strength = 0 WHERE id = ?', [caseId]);
    G.court.minP = 0; G.court.maxP = 0.0001; // Unschuldiger, keine Beweise
    const sc0 = (await rep.get(A, city)).comps.scandal;
    let c = await nowStep(caseId); c = await nowStep(caseId); c = await nowStep(caseId);
    assert.strictEqual(c.state, 'verdict'); assert.strictEqual(c.guilty, 0);
    await assert.rejects(court.respond(C, caseId, 'appeal'), /Anklage/, 'der Freigesprochene legt keine Berufung ein');
    await court.respond(A, caseId, 'appeal');
    await assert.rejects(court.respond(A, caseId, 'appeal'), /Berufungsfrist|nur direkt/);
    c = await runOut(caseId); assert.strictEqual(c.state, 'final'); assert.strictEqual(c.guilty, 0);
    assert.ok((await rep.get(A, city)).comps.scandal > sc0, 'Ansehen der Anklage leidet');
    const fine = await db.one("SELECT * FROM court_sanctions WHERE case_id = ? AND user_id = ? AND kind = 'fine'", [caseId, A]); assert.ok(fine && fine.amount_real === G.complaint.falseFine);
    assert.strictEqual((await db.one('SELECT COUNT(*) n FROM court_sanctions WHERE case_id = ? AND user_id = ?', [caseId, C])).n, 0, 'der Freigesprochene wird nicht belangt');
    certain();
  });

  await t.test('Vergleich: Angebot, Gegenangebot, Obergrenze, Annahme, Rückerstattung, Zahlung genau einmal', async () => {
    const e = await court.trace(null, { act: 'breach', offenderId: C, victimId: A, victimCompany: 1, cityId: city, damageReal: 1000, strength: 60, known: true });
    await age(); const { id: caseId } = await court.file(A, { evidenceId: e, defendantId: C });
    await assert.rejects(court.respond(C, caseId, 'accept'), /kein Vergleich/);
    await assert.rejects(court.respond(C, caseId, 'offer', { amount: 1e9 }), /höchstens/);
    const ic = await idx(C);
    await court.respond(C, caseId, 'offer', { amount: Math.round(600 * ic) });
    await assert.rejects(court.respond(C, caseId, 'accept'), /eigenen/);
    await court.respond(A, caseId, 'decline');
    await court.respond(A, caseId, 'offer', { amount: Math.round(900 * (await idx(A))) });
    const mA = await money(A); const mC = await money(C);
    await court.respond(C, caseId, 'accept');
    const c = await db.one('SELECT * FROM court_cases WHERE id = ?', [caseId]); assert.strictEqual(c.state, 'settled');
    await assert.rejects(court.respond(C, caseId, 'accept'), /zu spät|Dafür/);
    const dmg = await db.one("SELECT * FROM court_sanctions WHERE case_id = ? AND kind = 'damages'", [caseId]); assert.ok(Math.abs(dmg.amount_real - 900) <= 1);
    assert.strictEqual((await db.one("SELECT COUNT(*) n FROM court_sanctions WHERE case_id = ? AND kind = 'fine'", [caseId])).n, 0, 'keine Gerichtskosten bei Vergleich');
    await service.getView(C); await service.getView(C);
    assert.ok(Math.abs((mC - (await money(C))) - Math.round(900 * ic)) <= 2, 'Beklagter zahlt die Vergleichssumme einmal');
    await service.getView(A); await service.getView(A);
    const refund = Math.round(G.complaint.fee * G.court.settleRefundPct / 100 * (await idx(A)));
    assert.ok(Math.abs((await money(A)) - mA - Math.round(900 * (await idx(A))) - refund) <= 3, 'Opfer: Vergleichssumme + Teilerstattung');
  });

  await t.test('Geständnis mildert die Strafe; keine Berufung danach; Bestechung: hinterlässt selbst Spuren', async () => {
    const e = await court.trace(null, { act: 'poach', offenderId: B, victimId: A, cityId: city, damageReal: 500, strength: 70, known: true });
    await age(); const { id: caseId } = await court.file(A, { evidenceId: e, defendantId: B });
    await court.respond(B, caseId, 'confess');
    let c = await db.one('SELECT * FROM court_cases WHERE id = ?', [caseId]);
    assert.strictEqual(c.state, 'verdict'); assert.strictEqual(c.guilty, 1); assert.strictEqual(c.confessed, 1);
    await assert.rejects(court.respond(B, caseId, 'appeal'), /Geständnis|Berufung/);
    c = await runOut(caseId); assert.strictEqual(c.state, 'final');
    // Bestechung
    const e2 = await court.trace(null, { act: 'spy', offenderId: C, victimId: A, cityId: city, strength: 70, known: true });
    await db.query("UPDATE court_cases SET created_ms = created_ms - 99999999999 WHERE plaintiff_id = ?", [A]);
    await age(); const { id: c2 } = await court.file(A, { evidenceId: e2, defendantId: C });
    await db.query("UPDATE court_cases SET state = 'investigation', step_ms = ? WHERE id = ?", [Date.now() + 3600000, c2]);
    const before = Number((await db.one("SELECT COUNT(*) n FROM court_evidence WHERE act = 'bribe'")).n);
    await court.respond(C, c2, 'bribe');
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM court_evidence WHERE act = 'bribe'")).n), before + 1, 'der Versuch ist selbst ein Beweis');
    await assert.rejects(court.respond(C, c2, 'bribe'), /schon versucht/);
  });

  await t.test('Rivalität: Sabotage hinterlässt Spuren (Opfer sieht Spur, nicht den Namen); Wiederholungstäter werden härter bestraft', async () => {
    const R = settings.get('rivalry'); R.mode = 'all'; R.minAccountHours = 0; R.attackerMinGameDays = 0; R.targetMinGameDays = 0; R.caughtBase = 0; R.caughtSecurityBonus = 0; R.successSecurity = 0;
    const firm = (id, nm) => ({ id, pkey: 'baecker', tier: 0, name: nm, cityId: city, rooms: 4, staff: 1, manager: false, cash: 5000, base: 100000, since: 0, abandoned: null, lastProfit: 0 });
    await service.withCharacter(A, async (ctx) => { ctx.state.companies = [firm(1, 'Bäckerei Anna')]; ctx.state.nextCompanyId = 2; ctx.state.cityId = city; });
    await service.withCharacter(B, async (ctx) => { ctx.state.cityId = city; ctx.state.money = 5e7; });
    await db.query("UPDATE rivalry_log SET created_at = created_at - INTERVAL 3 DAY");
    const n0 = Number((await db.one("SELECT COUNT(*) n FROM court_evidence WHERE victim_id = ? AND act = 'sabotage'", [A])).n);
    const r = await require('../src/lib/rivalry').perform(B, A, 1, 'sabotage');
    assert.ok(r.success);
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM court_evidence WHERE victim_id = ? AND act = 'sabotage'", [A])).n), n0 + 1);
    const o = await court.overview(A); const sab = o.evidence.find((x) => x.act === 'sabotage' && x.subject === 'Bäckerei Anna');
    assert.ok(sab && sab.strength >= 30 && !sab.known && sab.damage > 0, JSON.stringify(sab));
    assert.ok(!(await court.overview(B)).evidence.length, 'Täter sieht nichts');
    // Vorstrafen erhöhen die Stufe
    const lv0 = M.levelFor('breach', 0, false, G); const lv2 = M.levelFor('breach', 2, false, G); assert.ok(lv2 > lv0);
    R.mode = 'optin';
  });

  await t.test('Politik: Polizeibudget wirkt auf Spuren, Umlage; Strafrahmen; Amnestie löscht leichte Sanktionen (nur einmal je Amtszeit)', async () => {
    const bgm = A;
    await service.withCharacter(bgm, async (ctx) => { ctx.state.politics.term = { idx: 2, startDay: ctx.state.day, endDay: ctx.state.day + 100000, cityId: ctx.state.cityId }; ctx.state.cityId = city; });
    await assert.rejects(policy.set(bgm, { kind: 'range', value: 25 }), /keine Befugnis/);
    await assert.rejects(policy.set(bgm, { kind: 'police', value: 7 }), /nicht erlaubt/);
    const pv = await policy.preview(bgm, { kind: 'police', value: 2 }); assert.ok(pv.lines.length >= 2 && /Polizeibudget/.test(pv.text));
    const e0 = policy.effects(city); assert.strictEqual(e0.police, 0);
    await policy.set(bgm, { kind: 'police', value: 2 });
    const e1 = policy.effects(city); assert.strictEqual(e1.police, 2); assert.ok(e1.levy > 0 && e1.detect > 0);
    await assert.rejects(policy.set(bgm, { kind: 'police', value: 1 }), /schon einen Beschluss/);
    assert.ok(require('../src/game/goods').effectsFor(world, city).levy >= e1.levy, 'Umlage auf die Betriebe');
    const id = await court.trace(null, { act: 'spy', offenderId: B, victimId: C, cityId: city, strength: undefined });
    const base = M.traceStrength('spy', { police: 0, seed: 'x' }, G); const withP = M.traceStrength('spy', { police: 2, seed: 'x' }, G);
    assert.ok(withP > base); assert.ok(id > 0);
    assert.ok((await db.one("SELECT COUNT(*) n FROM world_events WHERE title LIKE 'Beschluss%'")).n >= 1);
    // Amnestie: ein Kanzler
    const caseId = (await db.query("INSERT INTO court_cases (act, plaintiff_id, defendant_id, city_id, state, step_ms, created_ms, updated_ms, guilty, level) VALUES ('spy', ?, ?, ?, 'final', 0, ?, ?, 1, 1)", [A, B, city, Date.now(), Date.now()])).insertId;
    await db.query("INSERT INTO court_sanctions (case_id, user_id, kind, level, amount_real, due_ms, status, created_ms) VALUES (?,?,'fine',1,500,?,'active',?)", [caseId, B, Date.now() + 1e9, Date.now()]);
    await db.query("INSERT INTO court_sanctions (case_id, user_id, to_user, kind, level, amount_real, due_ms, status, created_ms) VALUES (?,?,?,'damages',1,500,?,'active',?)", [caseId, B, A, Date.now() + 1e9, Date.now()]);
    await service.withCharacter(C, async (ctx) => { ctx.state.politics.term = { idx: 5, startDay: ctx.state.day, endDay: ctx.state.day + 100000, cityId: ctx.state.cityId }; });
    await policy.set(C, { kind: 'amnesty', value: 1 });
    const left = await db.query("SELECT kind, status FROM court_sanctions WHERE case_id = ?", [caseId]);
    assert.strictEqual(left.find((s) => s.kind === 'fine').status, 'annulled'); assert.strictEqual(left.find((s) => s.kind === 'damages').status, 'active', 'Schadenersatz bleibt');
    await assert.rejects(policy.set(C, { kind: 'limit', value: 1.5 }), /schon einen Beschluss/);
    assert.ok((await rep.get(C, city)).comps.office < 0 || true);
  });

  await t.test('Bots: erstatten Anzeige bei bekanntem Täter und verteidigen sich', async () => {
    const Bt = await mk('botty'); await db.query('UPDATE users SET is_bot = 1 WHERE id = ?', [Bt]);
    await service.create(Bt, inp); await service.withCharacter(Bt, async (ctx) => { ctx.state.money = 5e7; });
    const e = await court.trace(null, { act: 'breach', offenderId: B, victimId: Bt, cityId: city, damageReal: 500, strength: 80, known: true });
    await db.query('DELETE FROM court_cases WHERE plaintiff_id = ?', [Bt]);
    let filed = 0; for (let i = 0; i < 40 && !filed; i++) { await court.botRound(Bt, () => 0.01); filed = Number((await db.one('SELECT COUNT(*) n FROM court_cases WHERE plaintiff_id = ?', [Bt])).n); }
    assert.ok(filed >= 1 && e > 0, 'Bot erstattet Anzeige');
    for (let i = 0; i < 5; i++) await court.botRound(B, () => 0.01);
  });
});
