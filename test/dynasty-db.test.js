'use strict';
/**
 * Werben, Ehe und Familienunternehmen gegen eine echte Datenbank (opt-in: TP_TEST_DB_PORT): Hochzeit bucht auf den Cent genau einmal und steht genau einmal im Protokoll (dyn_log),
 * Tagesblatt nur mit sichtbarem Profil, Übergabe zu Lebzeiten (Steuer und Gebühren genau einmal, Protokoll, Altenteil), Traditionsstufe, Familienrang im Profil und in der Rangliste,
 * Spielerehen mit Güterstand (Abfindung und Erbanteil), Aufräumen, Migration 037 idempotent.
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Familie gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_dyn_${process.pid}`;
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
  settings.DEFAULTS.ruf.minAccountHours = 0; settings.DEFAULTS.ruf.blockSameIp = false;
  Object.assign(settings.DEFAULTS.social.couples, { minAccountHours: 0, blockSameIp: false, requireSameCity: true });
  const service = require('../src/game/service');
  const DYN = require('../src/game/dynasty');
  const D = require('../src/game/dynasty-defaults');
  const bonds = require('../src/lib/bonds');
  const maintenance = require('../src/lib/maintenance');
  const migrations = require('../src/db/migrations');
  const social = require('../src/lib/social');
  const dynLib = require('../src/lib/dynasty');
  const family = require('../src/game/family');
  const biz = require('../src/game/business');
  const { yearOf } = require('../src/game/calendar');
  const world = await require('../src/game/world').get();
  const BS = world.cityList.find((c) => c.slug === 'braunschweig').id;
  const mk = async (n, pub = 1) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at, social_public) VALUES (?,?,?,?,?,?,?,?)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now(), pub])).insertId;
  const inp = (job, gender = 'm') => ({ gender, firstName: gender === 'm' ? 'Karl' : 'Anna', lastName: 'Becker', birthCityId: BS, professionKey: job, fatherName: 'a', motherName: 'b' });
  const A = await mk('sichtbar'); const B = await mk('stiller', 0);
  for (const u of [A, B]) await service.create(u, inp('baecker'));
  const setup = async (u, money = 9e8) => service.withCharacter(u, async (ctx) => { const s = ctx.state; s.money = money; s.day = 3000; s.person.birthDay = s.day - 60 * 365; s.housing = { type: 'rent', cityId: BS, base: 70, rooms: 4 }; s.meters.fridge = 100; s.skills.days.baecker = 4000; });
  for (const u of [A, B]) await setup(u);
  const state = async (u) => (await service.peek(u)).state;
  const act = (u, n, i) => service.doAction(u, n, i);
  const logs = (u, kind) => db.query('SELECT * FROM dyn_log WHERE user_id = ?' + (kind ? ' AND kind = ?' : '') + ' ORDER BY id', kind ? [u, kind] : [u]);
  const partnerize = (u) => service.withCharacter(u, async (ctx) => { const s = ctx.state; s.partner = { personId: 'p-db', name: 'Eva Roth', gender: 'f', born: s.day - 28 * 365, pkey: 'friseur', profession: 'Friseur', sat: 80, married: false, cohabit: true, giftBoost: 0, unhappyDays: 0, since: s.day, fam: { cls: 2, visited: true } }; s.tree.persons.push({ id: 'p-db', status: 'alive', role: 'partner', jobs: [] }); });

  await t.test('Hochzeit: Kosten, Notar, Ring und Aussteuer auf den Cent genau einmal; genau ein Protokolleintrag; doppelter Klick heiratet nur einmal', async () => {
    await partnerize(A); await partnerize(B);
    const s0 = await state(A); const y = yearOf(s0.day, s0.startYear); const idx = world.idx(y);
    const wed = Math.round(world.econ.marriageCost * idx); const notary = Math.round(D.contract.kinds.trennung.notaryMult * wed); const ring = DYN.ringPrice(world, s0, 2); const plan = DYN.dowryPlan(world, s0, 'trennung'); const m0 = s0.money;
    const res = await Promise.allSettled([act(A, 'marry', { contract: 'trennung', ring: 2 }), act(A, 'marry', { contract: 'trennung', ring: 2 })]);
    assert.strictEqual(res.filter((r) => r.status === 'fulfilled').length, 1, 'nur eine Hochzeit');
    const s1 = await state(A); assert.strictEqual(s1.money - m0, Math.round(plan.cashReal * idx) - wed - notary - ring); assert.strictEqual(s1.fam.contract.kind, 'trennung'); assert.strictEqual(s1.fam.ring.lv, 2); assert.strictEqual((s1.pending.dyn || []).length, 0);
    const rows = await logs(A, 'wed'); assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].lvl, 2);
    await service.getView(A); await service.getView(A); assert.strictEqual((await logs(A, 'wed')).length, 1, 'Protokoll nicht doppelt');
    await act(B, 'marry', { contract: 'zugewinn' });
    const ev = await db.query("SELECT text FROM world_events WHERE title = 'Hochzeit' ORDER BY id"); assert.strictEqual(ev.length, 1, JSON.stringify(ev)); assert.match(ev[0].text, /^Karl Becker und Eva Roth haben in .* geheiratet\.$/);
    assert.strictEqual((await logs(B, 'wed')).length, 1);
  });

  await t.test('Familienrang im öffentlichen Profil und in der Rangliste „Dynastie“; Aufstieg im Tagesblatt nur mit sichtbarem Profil', async () => {
    await service.withCharacter(A, async (ctx) => { ctx.state.generation = 5; ctx.state.fam.dyn.legacy = 7; ctx.state.money = 9e12; ctx.state.day -= ctx.state.day % 7; DYN.dynCheck(ctx.world, ctx.state); });
    await service.getView(A); const ps = await db.one('SELECT dyn_pts, dyn_lv FROM player_stats WHERE user_id = ?', [A]); assert.ok(ps.dyn_pts > 0 && ps.dyn_lv >= 2, JSON.stringify(ps));
    const lb = await social.leaderboard(B, { cat: 'dynasty', scope: 'all' }); assert.strictEqual(lb.rows[0].userId, A, 'höherer Familienrang steht oben');
    const up = (await logs(A, 'dyn')); assert.ok(up.length >= 1); const n0 = up.length; await service.getView(A); assert.strictEqual((await logs(A, 'dyn')).length, n0);
    await service.withCharacter(B, async (ctx) => { ctx.state.generation = 5; ctx.state.fam.dyn.legacy = 7; ctx.state.money = 9e12; DYN.dynCheck(ctx.world, ctx.state); });
    await service.getView(B);
    const ev = await db.query("SELECT text FROM world_events WHERE title = 'Familie' ORDER BY id"); assert.ok(ev.every((e) => /^Die Familie Becker gilt in .* jetzt als „/.test(e.text)), JSON.stringify(ev)); assert.ok(ev.length <= 1, 'nur das sichtbare Profil');
  });

  await t.test('Übergabe zu Lebzeiten: Steuer und Gebühren genau einmal, ein Protokolleintrag, Tagesblatt, Altenteil täglich; Betrieb läuft beim Kind weiter', async () => {
    await service.withCharacter(A, async (ctx) => {
      const s = ctx.state; s.money = 9e9; s.partner = null; s.fam.contract = null; s.fam.ring = null;
      const r = require('../src/game/actions').run('foundBiz', { world: ctx.world, state: s, input: { pkey: 'baecker', tier: 1, name: 'Großbäckerei' }, user: ctx.user, now: Date.now() }); assert.ok(r);
      s.companies[0].cash = 2e7;
      family.bornChild({ world: ctx.world, state: s, idx: 1 }, require('../src/game/rng').rngFor('db', 3)); const k = s.children[0]; k.born = s.day - 25 * 365; k.skills = ['baecker']; k.path = 'done'; k.pkey = 'baecker';
    });
    const s0 = await state(A); const f = s0.companies[0]; const k = s0.children[0]; const costs = DYN.handoverCosts(world, s0, biz.companyValue(world, s0, f, yearOf(s0.day, s0.startYear)) + f.cash); const m0 = s0.money;
    const res = await Promise.allSettled([act(A, 'famHandover', { childId: k.id, id: f.id }), act(A, 'famHandover', { childId: k.id, id: f.id })]);
    assert.strictEqual(res.filter((r) => r.status === 'fulfilled').length, 1);
    const s1 = await state(A); assert.strictEqual(m0 - s1.money, costs.tax + costs.fee); assert.strictEqual(s1.companies.length, 0); assert.strictEqual(s1.children[0].estate.companies.length, 1);
    assert.strictEqual((await logs(A, 'hand')).length, 1); const ev = await db.query("SELECT text FROM world_events WHERE title = 'Nachfolge'"); assert.strictEqual(ev.length, 1); assert.match(ev[0].text, /Großbäckerei/);
    const sa = (await db.one("SELECT COUNT(*) n FROM player_firms WHERE user_id = ?", [A])).n; assert.strictEqual(Number(sa), 0, 'der Betrieb gehört dem Elternteil nicht mehr');
    await service.withCharacter(A, async (ctx) => { const s = ctx.state; const held = s.children[0].estate.companies[0]; held.staff = 1; held.manager = true; held.cash = 0; const m1 = s.money; const fl = biz.companyFlows(ctx.world, s, held, yearOf(s.day, s.startYear)); DYN.heldDaily({ world: ctx.world, state: s, offline: false }); assert.strictEqual(s.money - m1, fl.profit > 0 ? Math.floor(fl.profit * D.handover.altenteilPct / 100) : 0); });
  });

  await t.test('Traditionsstufe: genau ein Protokolleintrag und eine Tagesblatt-Meldung je Stufe', async () => {
    await service.withCharacter(B, async (ctx) => {
      const s = ctx.state; s.money = 9e9; require('../src/game/actions').run('foundBiz', { world: ctx.world, state: s, input: { pkey: 'baecker', tier: 0, name: 'Altes Brot' }, user: ctx.user, now: Date.now() });
      const c = s.companies[0]; c.since = s.day - 60 * 365; c.gen = 2; c.trad = 0; s.day -= s.day % 7; DYN.daily({ world: ctx.world, state: s, offline: false });
    });
    await service.getView(B); await service.getView(B); assert.strictEqual((await logs(B, 'trad')).length, 1); assert.strictEqual((await db.one("SELECT COUNT(*) n FROM world_events WHERE title = 'Traditionsbetrieb'")).n, 1);
  });

  await t.test('Spielerehe: Güterstand wird beim Antrag gewählt; Gütertrennung = keine Abfindung, halber Erbanteil; Zugewinn = wie bisher', async () => {
    const male = await mk('ehemann'); const female = await mk('ehefrau'); await service.create(male, inp('baecker', 'm')); await service.create(female, inp('baecker', 'f'));
    for (const u of [male, female]) await setup(u, 5e8);
    for (const u of [male, female]) await db.query("UPDATE player_stats SET city_id = ? WHERE user_id = ?", [BS, u]);
    await bonds.request(world, male, female); const req = await db.one("SELECT id FROM couples WHERE status = 'request'"); await bonds.respond(world, female, req.id, true);
    await assert.rejects(bonds.propose(male, 'mitgift'), /Güterstand/); await bonds.propose(male, 'trennung'); await bonds.answerProposal(world, female, true);
    const cp = await db.one("SELECT * FROM couples WHERE status = 'married'"); assert.strictEqual(cp.regime, 'trennung');
    await service.getView(male); await service.getView(female);
    const sm = await state(male); const sf = await state(female); assert.strictEqual(sm.partner.contract, 'trennung'); assert.strictEqual(sf.partner.contract, 'trennung'); assert.ok(sm.partner.married);
    // Scheidung durch den Mann: kein Ausgleich
    const mBefore = (await state(male)).money; await bonds.breakup(male); await service.getView(male); const after = await state(male);
    assert.strictEqual(after.partner, null); assert.strictEqual(after.money, mBefore, 'Gütertrennung: keine Abfindung'); assert.strictEqual((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ?", [female])).n, 0);
    await service.getView(female); assert.strictEqual((await state(female)).partner, null);
    // Zugewinn zum Vergleich
    await bonds.request(world, male, female); const req2 = await db.one("SELECT id FROM couples WHERE status = 'request'"); await bonds.respond(world, female, req2.id, true); await bonds.propose(male); await bonds.answerProposal(world, female, true);
    await service.getView(male); await service.getView(female); assert.strictEqual((await state(male)).partner.contract, 'zugewinn');
    const m2 = (await state(male)).money; await bonds.breakup(male); await service.getView(male); const a2 = await state(male);
    assert.ok(m2 - a2.money >= Math.floor(m2 * settings.get('social').couples.divorceSettlementPct / 100) - 1, `Abfindung gezahlt: ${m2 - a2.money}`);
    assert.strictEqual((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ?", [female])).n, 1);
    await service.getView(female); assert.strictEqual((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ?", [female])).n, 0, 'Gutschrift genau einmal gebucht');
  });

  await t.test('Aufräumen: alte Protokolleinträge werden gelöscht, neue bleiben; Einstellung dynLogDays', async () => {
    await db.query("INSERT INTO dyn_log (user_id, city_id, kind, lvl, real_amount, created_at) VALUES (?,?,?,?,?, NOW() - INTERVAL 400 DAY)", [A, BS, 'wed', 1, 5]);
    const n0 = (await db.one('SELECT COUNT(*) n FROM dyn_log')).n;
    const res = await maintenance.run(); assert.ok(res && res.dynLog >= 1, JSON.stringify(res));
    assert.strictEqual((await db.one('SELECT COUNT(*) n FROM dyn_log')).n, n0 - res.dynLog); assert.ok((await db.one('SELECT COUNT(*) n FROM dyn_log')).n >= 1);
    assert.strictEqual(maintenance.DEFAULT_DAYS.dynLogDays, 120); assert.ok((await dynLib.adminLog(5)).length >= 1);
  });

  await t.test('Migration 037: idempotent, Tabelle und Spalten vorhanden', async () => {
    await db.query("DELETE FROM schema_migrations WHERE id = '037_dynasty'");
    await db.query('DROP TABLE dyn_log'); await db.query('ALTER TABLE player_stats DROP COLUMN dyn_pts, DROP COLUMN dyn_lv'); await db.query('ALTER TABLE couples DROP COLUMN regime');
    assert.strictEqual(await migrations.migrate(db), 1); assert.strictEqual(await migrations.migrate(db), 0);
    assert.ok((await db.query('SELECT 1 FROM dyn_log LIMIT 1')) !== undefined); const c = await db.one('SELECT dyn_pts, dyn_lv FROM player_stats LIMIT 1'); assert.ok(!c || (c.dyn_pts >= 0 && c.dyn_lv >= 1)); const r = await db.one('SELECT regime FROM couples LIMIT 1'); assert.ok(!r || r.regime);
  });
});
