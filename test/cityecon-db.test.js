'use strict';
/**
 * Stadtwirtschaft gegen eine echte Datenbank: Eingaben aus player_firms/player_stats, Aktualisierung, Persistenz (city_economy),
 * Neustart (laden), Rückkehr zur Mitte, Beschluss „Mietpreisbremse“ und Tagesblatt-Zusammenfassung.
 * Läuft nur mit Test-Datenbank: TP_TEST_DB_PORT=3306 npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';
const HOUR = 3600000;

test('Stadtwirtschaft gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_cityecon_${process.pid}`;
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
  const ce = require('../src/game/cityecon');
  const lib = require('../src/lib/cityecon');
  const goods = require('../src/game/goods');
  const world = await require('../src/game/world').get();
  const city = world.cityList.find((c) => c.slug === 'cottbus');
  const other = world.cityList.find((c) => c.slug === 'berlin');
  ce.reset(); goods.setPolicies(null);

  const mk = async (n, cityId, year = 1960) => {
    const id = (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at, social_public) VALUES (?,?,?,?,?,?,?,1)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now()])).insertId;
    await db.query("INSERT INTO player_stats (user_id, char_id, username, name, city_id, year, status) VALUES (?,?,?,?,?,?,'alive')", [id, id, n, n, cityId, year]);
    return id;
  };
  const firm = (u, cityId, pkey, rooms, cid) => db.query('INSERT INTO player_firms (user_id, company_id, city_id, name, pkey, tier, rooms) VALUES (?,?,?,?,?,?,?)', [u, cid, cityId, `${pkey} ${cid}`, pkey, 0, rooms]);
  const rows = (cityId) => db.query('SELECT * FROM city_economy WHERE city_id = ? ORDER BY sector', [cityId]);

  await t.test('ruhige Stadt: keine Zeilen, Faktor 1 (nur Epochenfaktor)', async () => {
    const r = await lib.refresh(1.7e12);
    assert.deepStrictEqual(r, { cities: 0, rows: 0 });
    assert.strictEqual((await rows(city.id)).length, 0);
    assert.ok(ce.active());
    assert.strictEqual(ce.level(city.id, 'rent', 1960) / ce.era(city.id, 'rent', 1960), 1);
  });

  const users = [];
  for (let i = 0; i < 6; i++) users.push(await mk(`spieler${i}`, city.id));
  const boss = await mk('wirt', city.id);
  for (let i = 0; i < 6; i++) await firm(boss, city.id, 'wirt', 12, i + 1); // viele Gaststätten
  await firm(users[0], other.id, 'baecker', 3, 1);

  let t0 = 1.7e12 + HOUR;
  await t.test('Aktivität erzeugt Zeilen für alle fünf Sektoren; Dienste sinken, Mieten steigen, alles in den Grenzen', async () => {
    const r = await lib.refresh(t0);
    assert.ok(r.cities >= 2 && r.rows >= 10, JSON.stringify(r));
    const rs = await rows(city.id);
    assert.deepStrictEqual(rs.map((x) => x.sector), ['build', 'food', 'rent', 'services', 'wage']);
    for (const x of rs) { assert.ok(x.idx >= 0.75 && x.idx <= 1.6 && Number.isFinite(x.target), x.sector); assert.ok(JSON.parse(x.hist).length >= 1); }
    const by = Object.fromEntries(rs.map((x) => [x.sector, x]));
    assert.ok(by.services.target < 0.95, `Überangebot Dienste: ${by.services.target}`);
    assert.ok(by.rent.target > 1.0 && by.wage.target > 0.97, 'Einwohner treiben die Mieten');
    assert.ok(by.services.supply > by.services.demand);
  });

  await t.test('Annäherung über die Zeit, Verlauf wächst, Speicher und Datenbank stimmen überein', async () => {
    let last = null;
    for (let i = 2; i <= 40; i++) last = await lib.refresh(t0 + i * 2 * HOUR);
    const rs = await rows(city.id); const by = Object.fromEntries(rs.map((x) => [x.sector, x]));
    assert.ok(Math.abs(by.services.idx - by.services.target) < 0.03, `${by.services.idx} → ${by.services.target}`);
    assert.ok(JSON.parse(by.services.hist).length > 10);
    assert.ok(Math.abs(ce.level(city.id, 'services', 1960) / ce.era(city.id, 'services', 1960) - by.services.idx) < 1e-3);
    assert.ok(last.rows >= 10);
  });

  await t.test('Neustart: Zwischenspeicher wird aus der Datenbank geladen', async () => {
    const before = ce.level(city.id, 'services', 1980);
    ce.reset(); assert.strictEqual(ce.level(city.id, 'services', 1980), 1);
    const n = await lib.load(); assert.ok(n >= 10);
    assert.ok(Math.abs(ce.level(city.id, 'services', 1980) - before) < 1e-3);
  });

  await t.test('Ende der Aktivität: Rückkehr zur Mitte, Zeilen verschwinden wieder', async () => {
    await db.query('DELETE FROM player_firms'); await db.query('DELETE FROM player_stats');
    let now = t0 + 100 * 2 * HOUR;
    for (let i = 0; i < 80; i++) { now += 3 * HOUR; await lib.refresh(now); }
    assert.strictEqual((await rows(city.id)).length, 0, 'wieder neutral, keine Zeilen');
    assert.strictEqual(ce.level(city.id, 'services', 1980) / ce.era(city.id, 'services', 1980), 1);
  });

  await t.test('Mietpreisbremse (Beschluss) deckelt den Anstieg des Mietindex in der Datenbank-Aktualisierung', async () => {
    for (let i = 0; i < 40; i++) await mk(`neu${i}`, city.id); // viele Einwohner → Mietdruck
    let now = t0 + 400 * HOUR;
    await lib.refresh(now);
    now += 6 * HOUR; await lib.refresh(now);
    const free = (await rows(city.id)).find((x) => x.sector === 'rent');
    assert.ok(free.idx > 1.0 && free.target > 1.1, `ohne Bremse: ${free.idx} → ${free.target}`);
    // Bremse „0 %“: eingefroren
    goods.setPolicies(goods.buildPolicies([{ kind: 'rentcap', val: 0, scope_city: city.id }]));
    const frozen = free.idx;
    for (let i = 0; i < 12; i++) { now += 3 * HOUR; await lib.refresh(now); }
    const after = (await rows(city.id)).find((x) => x.sector === 'rent');
    assert.ok(after.idx <= frozen + 1e-4, `eingefroren: ${frozen} → ${after.idx}`);
    assert.ok(after.target > free.target - 1e-9, 'Druck steigt (Angebot sinkt)');
    goods.setPolicies(null);
    for (let i = 0; i < 12; i++) { now += 3 * HOUR; await lib.refresh(now); }
    assert.ok((await rows(city.id)).find((x) => x.sector === 'rent').idx > after.idx + 0.01, 'nach Ende holt der Markt auf');
  });

  await t.test('Zusammenfassung für das Tagesblatt und Meldungen', async () => {
    const s = lib.summary(world);
    assert.ok(s.length >= 1 && s.every((x) => Number.isFinite(x.avgPct) && x.cities >= 1 && x.name));
    const stats = await require('../src/lib/tagesblatt').stats();
    assert.ok(Array.isArray(stats.prices) && stats.prices.length >= 1);
  });
});
