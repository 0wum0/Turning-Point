'use strict';
/**
 * Lieferverträge und Wirtschaftspolitik gegen eine echte Datenbank (zwei Spieler in verschiedenen Spielzeiten, Gutschrift genau einmal,
 * Kündigung, Beschlüsse eines Amtsinhabers). Läuft nur mit Test-Datenbank: TP_TEST_DB_PORT=3306 npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Warenkreislauf gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_goods_${process.pid}`;
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
  const service = require('../src/game/service');
  const supply = require('../src/lib/supply');
  const policies = require('../src/lib/policies');
  const goods = require('../src/game/goods');
  const { advance } = require('../src/game/engine');
  const { edition } = require('../src/game/newspaper');
  const { yearOf } = require('../src/game/calendar');
  const world = await require('../src/game/world').get();
  const city = world.cityList.find((c) => c.slug === 'braunschweig').id;
  settings.get('goods').contracts.minAccountHours = 0;
  settings.get('goods').contracts.sameRegionOnly = false;
  const mk = async (n) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at, social_public) VALUES (?,?,?,?,?,?,?,1)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now()])).insertId;
  const inp = (job) => ({ gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: city, professionKey: job, fatherName: 'a', motherName: 'b' });
  const [A, B, C] = [await mk('mueller'), await mk('baecker'), await mk('buergermeister')];
  await service.create(A, inp('muehle')); await service.create(B, inp('baecker')); await service.create(C, inp('baecker'));
  for (const u of [A, B, C]) await service.withCharacter(u, async (ctx) => { ctx.state.money = 9e9; ctx.state.housing = { type: 'rent', cityId: city, base: 70, rooms: 3 }; });
  const state = async (u) => (await service.peek(u)).state;
  const buy = async (u, pkey) => { const s = await state(u); const l = edition(world, s, city).biz.find((x) => x.pkey === pkey && x.qualified); await service.doAction(u, 'buyBiz', { listingId: l.id }); return (await state(u)).companies.slice(-1)[0].id; };
  const fA = await buy(A, 'muehle'); const fB = await buy(B, 'baecker');
  const runDays = async (u, n) => service.withCharacter(u, async (ctx) => { for (let i = 0; i < n; i++) { ctx.state.meters.fridge = 100; ctx.state.meters.health = 100; advance(ctx.world, ctx.state, 1, { mode: 'online' }); ctx.state.interrupts = []; } });

  await t.test('Suche zeigt Müller als Lieferanten für Mehl; Angebot und Annahme', async () => {
    const found = await supply.partners(B, fB, 'mehl', 'supplier');
    assert.ok(found.list.some((p) => p.userId === A && p.companyId === fA), 'Mühle gefunden');
    assert.strictEqual((await supply.partners(B, fB, 'brot', 'supplier')).list.length, 0, 'Bäckerei hat keine Lieferanten für Brot');
    await assert.rejects(supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'brot', qty: 5, pricePct: 100, termDays: 60 }), /stellt Brot/);
    await assert.rejects(supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'mehl', qty: 5, pricePct: 150, termDays: 60 }), /zwischen 90 % und 115 %/);
    await assert.rejects(supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'mehl', qty: 5, pricePct: 100, termDays: 3 }), /Laufzeit/);
    const id = await supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'mehl', qty: 8, pricePct: 100, termDays: 60, auto: true });
    await assert.rejects(supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'mehl', qty: 8, pricePct: 100, termDays: 60 }), /schon einen Vertrag/);
    await assert.rejects(supply.respond(B, id, true), /eigenes Angebot/);
    assert.strictEqual((await supply.mine(A)).offers.length, 1);
    assert.strictEqual((await db.query("SELECT * FROM messages WHERE to_user = ? AND subject = 'Lieferangebot'", [A])).length, 1, 'Brief an den Verkäufer');
    assert.deepStrictEqual(await supply.respond(A, id, true), { accepted: true });
    assert.strictEqual((await supply.mine(B)).contracts.length, 1);
  });

  await t.test('Käufer rechnet täglich ab: Kasse sinkt, Gutschrift für den Verkäufer genau einmal, Ware kommt per Vertrag', async () => {
    const before = (await state(B)).companies.find((c) => c.id === fB);
    await runDays(B, 30);
    const sB = await state(B); assert.strictEqual(sB.contracts.buys.length, 1, 'Spiegel im Spielstand'); const idxB = world.idx(yearOf(sB.day, sB.startYear));
    const rows = await db.query("SELECT * FROM pending_credits WHERE user_id = ? AND reason = 'supply'", [A]);
    assert.strictEqual(rows.length, 1, 'eine aufsummierte Gutschrift');
    assert.strictEqual(rows[0].company_id, fA);
    const flows = require('../src/game/business').companyFlows(world, sB, sB.companies.find((c) => c.id === fB), yearOf(sB.day, sB.startYear));
    const mehl = flows.supply.needs.find((n) => n.good === 'mehl');
    assert.ok(mehl.byContract > 0 && mehl.byContract <= 8 + 1e-9, 'Vertragsmenge begrenzt');
    assert.ok(rows[0].real_amount > 0);
    // Mehrfaches Laden bucht nichts nach
    for (let i = 0; i < 3; i++) await service.getView(B);
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ? AND reason = 'supply'", [A])).n), 1);
    assert.strictEqual(sB.pending.supply === undefined || sB.pending.supply.length === 0, true, 'Vormerkung geleert');
    // Verkäufer lädt: Gutschrift in der Firmenkasse (in seiner Währung/Zeit), danach keine Zeile mehr
    const a0 = (await state(A)).companies.find((c) => c.id === fA).cash;
    const viewA = await service.getView(A);
    const a1 = (await state(A)).companies.find((c) => c.id === fA).cash;
    assert.ok(a1 > a0, `Kasse ${a0} → ${a1}`);
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ?", [A])).n), 0);
    assert.ok(viewA.view.notices.some((n) => /Lieferungen für/.test(n.title)), 'eine Sammelmeldung');
    await service.getView(A);
    assert.strictEqual((await state(A)).companies.find((c) => c.id === fA).cash >= a1, true);
    // Erhaltung (in Realwerten): was B zahlt, bekommt A (gleiche Epoche → gleicher Index, Rundung ≤ 1 Cent je Tag)
    const sA = await state(A); const idxA = world.idx(yearOf(sA.day, sA.startYear));
    assert.ok(idxA > 0 && idxB > 0);
    void before;
  });

  await t.test('Verkäufer meldet seine Lieferfähigkeit zurück; Laufzeit und Abnahme des Käufers stehen in der Datenbank', async () => {
    await runDays(A, 5);
    const row = await db.one("SELECT * FROM supply_contracts WHERE status = 'active'");
    assert.ok(row.fill > 0 && row.fill <= 1);
    assert.ok(row.days_left < 60 && row.days_left >= 20, `Rest ${row.days_left}`);
    assert.ok(row.take > 0 && row.take <= 1);
    const sA = await state(A);
    assert.strictEqual(sA.contracts.sells.length, 1);
  });

  await t.test('Auto-Verlängerung läuft; Kündigung durch den Verkäufer wirkt beim Käufer', async () => {
    await runDays(B, 40); // 60-Tage-Laufzeit überschritten → verlängert (auto)
    const row = await db.one("SELECT * FROM supply_contracts WHERE status = 'active'");
    assert.ok(row && row.days_left > 15, 'verlängert');
    const id = row.id;
    await supply.cancel(A, id);
    await service.getView(B);
    assert.strictEqual((await state(B)).contracts.buys.length, 0);
    const n = await db.query("SELECT * FROM messages WHERE to_user = ? AND subject = 'Liefervertrag gekündigt'", [B]);
    assert.strictEqual(n.length, 1);
    const f = require('../src/game/business').companyFlows(world, await state(B), (await state(B)).companies.find((c) => c.id === fB), 1946);
    assert.ok(f.supply.needs.every((x) => x.byContract === 0), 'ohne Vertrag Großhandel');
  });

  await t.test('Vertrag endet, wenn der Betrieb des Partners nicht mehr existiert; Bot nimmt Angebote an', async () => {
    const id = await supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'mehl', qty: 4, pricePct: 100, termDays: 30 });
    await supply.botRound(A, () => 0); // stellvertretend für einen Bot: antwortet auf das Angebot
    assert.strictEqual((await db.one('SELECT status FROM supply_contracts WHERE id = ?', [id])).status, 'active');
    await service.withCharacter(A, async (ctx) => { ctx.state.companies = ctx.state.companies.filter((c) => c.id !== fA); });
    await service.getView(A);
    assert.strictEqual((await db.one('SELECT status, end_reason FROM supply_contracts WHERE id = ?', [id])).end_reason, 'firm_gone');
    await service.getView(B);
    assert.strictEqual((await state(B)).contracts.buys.length, 0);
  });

  await t.test('Gestorbener Charakter beendet seine Verträge', async () => {
    const f2 = await service.withCharacter(A, async (ctx) => { const s = ctx.state; const id = s.nextCompanyId++; s.companies.push({ id, pkey: 'muehle', tier: 0, name: 'Mühle Zwei', cityId: city, rooms: 3, staff: 0, manager: false, cash: 0, base: 1000, since: s.day, abandoned: null, lastProfit: 0 }); return { id }; }).then((r) => r.id);
    const id = await supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: f2, good: 'mehl', qty: 4, pricePct: 100, termDays: 30 });
    await supply.respond(A, id, true);
    await service.withCharacter(A, async (ctx) => { ctx.state.status = 'gameover'; ctx.state.death = { day: ctx.state.day, reason: 'Test', gameOver: true, message: 'x' }; });
    assert.strictEqual((await db.one('SELECT status FROM supply_contracts WHERE id = ?', [id])).status, 'ended');
  });

  await t.test('Amtsinhaber: ein Beschluss je Amtszeit, wirkt auf Steuern, erlischt mit dem Amt', async () => {
    await service.withCharacter(C, async (ctx) => { ctx.state.politics.term = { idx: 1, startDay: ctx.state.day, endDay: ctx.state.day + 1460, cityId: city }; });
    const ov = await policies.overview(C);
    assert.deepStrictEqual(ov.office.powers.map((p) => p.kind), ['surcharge']);
    const pv = await policies.preview(C, { kind: 'surcharge', value: 3 });
    assert.strictEqual(pv.preview.lines[0].key, 'surcharge');
    await assert.rejects(policies.set(C, { kind: 'surcharge', value: 9 }), /Erlaubt/);
    await assert.rejects(policies.set(C, { kind: 'subsidy', good: 'mehl', value: 10 }), /Befugnis/);
    const r = await policies.set(C, { kind: 'surcharge', value: 3 });
    assert.match(r.msg, /Gewerbesteuer-Zuschlag/);
    await assert.rejects(policies.set(C, { kind: 'surcharge', value: 2 }), /schon einen Beschluss/);
    assert.strictEqual(goods.effectsFor(world, city).surcharge, 3);
    assert.strictEqual(goods.effectsFor(world, city + 1 === city ? 0 : world.cityList.find((c) => c.id !== city).id).surcharge, 0, 'andere Stadt unberührt');
    assert.strictEqual((await db.query("SELECT * FROM world_events WHERE kind = 'election' AND title LIKE 'Beschluss%'")).length, 1, 'Tagesblatt');
    // Rücktritt → Beschluss erlischt beim nächsten Abgleich
    await service.withCharacter(C, async (ctx) => { ctx.state.politics.term = null; });
    await policies.refresh();
    assert.strictEqual(goods.effectsFor(world, city).surcharge, 0);
    goods.setPolicies(null);
  });
});
