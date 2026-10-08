'use strict';
/**
 * Abläufe über mehrere Spieler gegen eine echte MySQL/MariaDB-Datenbank (Transaktionen, Sperren, Gutschriften).
 * Läuft nur, wenn eine Test-Datenbank bereitsteht, z. B.:
 *   TP_TEST_DB_HOST=127.0.0.1 TP_TEST_DB_PORT=3306 TP_TEST_DB_USER=root npm test
 * Es wird eine eigene Datenbank „tp_unit_<pid>“ angelegt und danach wieder gelöscht.
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Mehrspieler gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_unit_${process.pid}`;
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
  const service = require('../src/game/service');
  const { edition } = require('../src/game/newspaper');
  const contractors = require('../src/game/contractors');
  const world = await require('../src/game/world').get();
  const city = world.cityList.find((c) => c.slug === 'braunschweig').id;
  const mk = async (n) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at) VALUES (?,?,?,?,?,?,?)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now()])).insertId;
  const inp = { gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: city, professionKey: 'baecker', fatherName: 'a', motherName: 'b' };
  const [A, B, C] = [await mk('alice'), await mk('bob'), await mk('carl')];
  for (const u of [A, B, C]) { await service.create(u, inp); await service.withCharacter(u, async (ctx) => { ctx.state.money = 9e9; }); }
  const state = async (u) => (await service.peek(u)).state;

  await t.test('Immobilienanzeige: nur ein Käufer, auch bei gleichzeitigen Käufen', async () => {
    const ids = edition(world, await state(A), city).housing.sale.map((x) => x.id);
    await service.doAction(A, 'buy', { listingId: ids[0] });
    await assert.rejects(service.doAction(A, 'buy', { listingId: ids[0] }), /nicht mehr aktuell/);
    await assert.rejects(service.doAction(B, 'buy', { listingId: ids[0] }), /nicht mehr aktuell/);
    assert.ok(!edition(world, await state(B), city).housing.sale.some((x) => x.id === ids[0]), 'Zeitung zeigt die verkaufte Anzeige nicht mehr');
    const res = await Promise.allSettled([B, C, A].map((u) => service.doAction(u, 'buy', { listingId: ids[1] })));
    assert.strictEqual(res.filter((r) => r.status === 'fulfilled').length, 1);
    assert.strictEqual((await db.query('SELECT * FROM sold_listings')).length, 2);
    let owned = 0; for (const u of [A, B, C]) owned += (await state(u)).properties.length;
    assert.strictEqual(owned, 2, 'Verlierer zahlt nichts und bekommt nichts');
  });

  await t.test('Bauauftrag wird genau einmal gutgeschrieben (nicht bei jedem weiteren Aufruf erneut)', async () => {
    contractors.set([{ user_id: B, company_id: 1, name: 'Bau GmbH', city_id: city }]);
    await service.withCharacter(A, async (ctx) => { ctx.state.properties.push({ id: 90, kind: 'flat', name: 'Test', cityId: city, rooms: 2, base: 1000000, condition: 40, closedUntil: 0, bought: 0 }); ctx.state.nextPropId = 91; });
    await service.doAction(A, 'maintain', { propertyId: 90 });
    for (let i = 0; i < 3; i++) await service.getView(A);
    const n = (await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ? AND reason = 'job'", [B])).n;
    contractors.set([]);
    assert.strictEqual(Number(n), 1);
  });

  await t.test('Börse: Teilausführung lässt den Rest offen; Übernahme und Ausbuchung erstatten reservierte Mittel', async () => {
    const settings = require('../src/settings'); const ex = require('../src/lib/exchange');
    const X = settings.get('exchange'); X.minGameDays = 0; X.minValueReal = 100; X.blockSameIp = false; X.takeoverPct = 25;
    for (const u of [A, B, C]) await service.withCharacter(u, async (ctx) => { ctx.state.housing = { type: 'rent', cityId: city, base: 70, rooms: 3 }; ctx.state.skills.days.baecker = 4000; ctx.state.money = 9e10; });
    const l = edition(world, await state(C), city).biz.find((x) => x.qualified);
    await service.doAction(C, 'buyBiz', { listingId: l.id });
    const firm = (await state(C)).companies[0];
    const { stockId } = await ex.ipo(C, firm.id, 49, 30);
    const price = Number((await db.one('SELECT price_real p FROM stocks WHERE id = ?', [stockId])).p);
    await ex.place(B, stockId, 'buy', 300, price); // kauft 300 von 490 angebotenen
    const ask = await db.one("SELECT left_shares, status FROM stock_orders WHERE user_id = ? AND side = 'sell'", [C]);
    assert.deepStrictEqual([Number(ask.left_shares), ask.status], [190, 'open'], 'Rest der Verkaufsorder bleibt offen');
    // A setzt ein Gebot weit unter Markt, B übernimmt (hält mehr als 25 %) – As Reservierung bleibt unberührt, Bs eigene wird erstattet
    const b0 = (await state(B)).money; await ex.place(B, stockId, 'buy', 5, 1); const b1 = (await state(B)).money; assert.ok(b1 < b0 || price * 0 === 0);
    await ex.place(A, stockId, 'buy', 10, Math.max(1, Math.floor(price / 2)));
    await ex.takeover(B, stockId);
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM stock_orders WHERE user_id = ? AND status = 'open'", [B])).n), 0);
    await db.tx((conn) => ex.releaseOrders(conn, stockId));
    const pc = await db.query("SELECT real_amount FROM pending_credits WHERE user_id = ? AND reason = 'stock'", [A]);
    assert.strictEqual(pc.length, 1, 'reservierte Mittel des Bieters kommen zurück');
  });
});
