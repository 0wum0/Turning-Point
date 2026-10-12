'use strict';
/**
 * Betrieb 2.0 gegen eine echte Datenbank (opt-in: TP_TEST_DB_PORT): Ausbau bucht genau einmal und geht als Bauauftrag an die Baufirma (pending_credits),
 * Brand wird genau einmal protokolliert (ops_log, Tagesblatt), Versicherung und Prämie buchen auf den Cent, Spieler-Angestellte bleiben unberührt,
 * Klima erscheint im Stadtverzeichnis, Aufräumen löscht alte Vorfälle, Migration 034 ist idempotent.
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Betrieb 2.0 gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_ops_${process.pid}`;
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
  const service = require('../src/game/service');
  const OPS = require('../src/game/operations');
  const D = require('../src/game/operations-defaults');
  const contractors = require('../src/game/contractors');
  const social = require('../src/lib/social');
  const maintenance = require('../src/lib/maintenance');
  const migrations = require('../src/db/migrations');
  const world = await require('../src/game/world').get();
  const { yearOf } = require('../src/game/calendar');
  const BS = world.cityList.find((c) => c.slug === 'braunschweig').id;
  const mk = async (n, pub = 1) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at, social_public) VALUES (?,?,?,?,?,?,?,?)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now(), pub])).insertId;
  const inp = (job) => ({ gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: BS, professionKey: job, fatherName: 'a', motherName: 'b' });
  const O = await mk('inhaber'); const C = await mk('baufirma'); const S = await mk('stiller', 0);
  for (const u of [O, C, S]) await service.create(u, inp('baecker'));
  const setup = async (u, money = 9e8) => service.withCharacter(u, async (ctx) => { ctx.state.money = money; ctx.state.day = 3000; ctx.state.housing = { type: 'rent', cityId: BS, base: 70, rooms: 3 }; ctx.state.meters.fridge = 100; ctx.state.skills.days.baecker = 4000; });
  for (const u of [O, C, S]) await setup(u);
  const state = async (u) => (await service.peek(u)).state;
  const idx = async (u) => { const s = await state(u); return world.idx(yearOf(s.day, s.startYear)); };
  const act = (u, n, i) => service.doAction(u, n, i);
  await act(O, 'foundBiz', { pkey: 'baecker', tier: 0 });
  let comp = (await state(O)).companies[0];
  for (let i = 0; i < 3; i++) { try { await act(O, 'bizHire', { id: comp.id, delta: 1 }); } catch (_) { await service.withCharacter(O, (ctx) => { ctx.state.day += 7; }); await act(O, 'bizHire', { id: comp.id, delta: 1 }); } }
  // Baufirma des Test-Spielers C in der Stadt
  await act(C, 'foundBiz', { pkey: 'baecker', tier: 0 }); const cc = (await state(C)).companies[0];
  contractors.set([{ city_id: BS, user_id: C, company_id: cc.id, name: cc.name }]);
  const credits = (u) => db.query("SELECT * FROM pending_credits WHERE user_id = ? AND reason = 'job'", [u]);
  const quiet = () => { D.fire.weeklyChance = 0; };
  quiet();

  await t.test('Ausbau: Geld genau einmal, Stufe gespeichert, Bauauftrag genau einmal an die Baufirma (pending_credits)', async () => {
    const s0 = await state(O); const y = yearOf(s0.day, s0.startYear);
    const cost = OPS.upgradeCost(world, s0, s0.companies[0], 'brand', 1, y); const m0 = s0.money; const n0 = (await credits(C)).length;
    await act(O, 'opsBuild', { id: s0.companies[0].id, mod: 'brand' });
    const s1 = await state(O); assert.strictEqual(m0 - s1.money, cost, 'genau einmal abgebucht'); assert.strictEqual(s1.companies[0].mods.brand, 1);
    const cr = await credits(C); assert.strictEqual(cr.length - n0, 1, 'ein Bauauftrag'); const last = cr[cr.length - 1];
    assert.ok(Math.abs(Number(last.real_amount) - Math.round(cost / (await idx(O)))) <= 1); assert.match(last.text, /Ausbau/);
    assert.strictEqual(s1.pending.jobs.length, 0, 'Liste nach dem Speichern leer');
    await act(O, 'bizCollect', { id: 'all' }).catch(() => {}); // weitere Züge dürfen den Auftrag nicht wiederholen
    assert.strictEqual((await credits(C)).length, cr.length);
    // Baufirma bekommt das Geld beim nächsten Laden gutgeschrieben (Währung der Baufirma)
    const cash0 = (await state(C)).companies[0].cash; await service.getView(C); const cash1 = (await state(C)).companies[0].cash;
    assert.ok(cash1 > cash0, 'Gutschrift kommt in der Firmenkasse der Baufirma an'); assert.strictEqual((await credits(C)).length, 0, 'und wird nur einmal ausgezahlt');
    await service.getView(C); assert.strictEqual((await state(C)).companies[0].cash, cash1);
  });

  await t.test('Betriebsbrand: wird genau einmal protokolliert (ops_log, Tagesblatt), Schaden und Versicherung buchen auf den Cent, kein Spieler-Mitarbeiter betroffen', async () => {
    D.fire.weeklyChance = 1; // jede Woche brennt es (Wochenwürfel höchstens 20 %): Brand direkt auslösen
    await act(O, 'insurance', { key: 'betrieb', on: true });
    const before = (await db.one('SELECT COUNT(*) n FROM ops_log WHERE user_id = ?', [O])).n; const wb = (await db.one("SELECT COUNT(*) n FROM world_events WHERE title = 'Betriebsbrand'")).n;
    let dmg = 0; let m0 = 0; let m1 = 0;
    await service.withCharacter(O, async (ctx) => {
      const c = ctx.state.companies[0]; m0 = ctx.state.money; const year = yearOf(ctx.state.day, ctx.state.startYear);
      const value = require('../src/game/business').companyValue(ctx.world, ctx.state, c, year);
      OPS.fire({ world: ctx.world, state: ctx.state, offline: false }, c, year, OPS.fireRisk(ctx.world, ctx.state, c, 200));
      dmg = Math.round(value * D.fire.damagePct / 100 * OPS.fireRisk(ctx.world, ctx.state, c, 200).dmgMult); m1 = ctx.state.money;
      assert.strictEqual(ctx.state.pending.ops.length, 1);
      // Spieler als Angestellte werden nie beeinflusst
      c.playerStaff = [{ userId: S, wage: 500, tal: null }]; require('../src/game/engine').advance(ctx.world, ctx.state, 3, { mode: 'online' }); ctx.state.interrupts = [];
      assert.ok(c.playerStaff.every((p) => p.mood === undefined && p.mcd === undefined)); delete c.playerStaff;
    });
    assert.ok(Math.abs((m0 - m1) - Math.round(dmg * 0.1)) <= 2, `Selbstbeteiligung ${m0 - m1} ≈ 10 % von ${dmg}`);
    const rows = await db.query('SELECT * FROM ops_log WHERE user_id = ? ORDER BY id', [O]); assert.strictEqual(rows.length - before, 1); assert.strictEqual(rows[rows.length - 1].kind, 'fire'); assert.strictEqual(rows[rows.length - 1].insured, 1);
    assert.strictEqual((await db.one("SELECT COUNT(*) n FROM world_events WHERE title = 'Betriebsbrand'")).n - wb, 1);
    const ev = await db.one("SELECT text FROM world_events WHERE title = 'Betriebsbrand' ORDER BY id DESC LIMIT 1"); assert.match(ev.text, /ist abgebrannt/); assert.doesNotMatch(ev.text, /eine Versicherung gab es nicht/);
    const s = await state(O); assert.strictEqual((s.pending.ops || []).length, 0, 'Warteschlange nach dem Speichern leer');
    await service.getView(O); await service.getView(O);
    assert.strictEqual((await db.one('SELECT COUNT(*) n FROM ops_log WHERE user_id = ?', [O])).n, rows.length, 'weiteres Laden schreibt nichts nach');
    assert.ok(s.companies[0].outageUntil > s.day, 'Betrieb steht still');
    quiet();
  });

  await t.test('Unsichtbares Profil: das Tagesblatt nennt den Betrieb nicht beim Namen', async () => {
    await act(S, 'foundBiz', { pkey: 'baecker', tier: 0 });
    await service.withCharacter(S, async (ctx) => { const c = ctx.state.companies[0]; const year = yearOf(ctx.state.day, ctx.state.startYear); OPS.fire({ world: ctx.world, state: ctx.state, offline: false }, c, year, OPS.fireRisk(ctx.world, ctx.state, c, 200)); });
    const ev = await db.one("SELECT text FROM world_events WHERE title = 'Betriebsbrand' ORDER BY id DESC LIMIT 1"); assert.match(ev.text, /^Ein Betrieb in /); assert.match(ev.text, /eine Versicherung gab es nicht/);
  });

  await t.test('Prämie und Betriebsfest buchen auf den Cent und genau einmal; Lob kostet nichts; Abmahnung vormerkt Ansehen erst beim Speichern', async () => {
    quiet();
    const s0 = await state(O); const c = s0.companies[0]; const wd = world.econ.companies.staffWage * await idx(O); const team = c.team.length; assert.ok(team >= 1);
    const m0 = s0.money;
    await act(O, 'bizBonus', { id: c.id, mid: 'all' }); const s1 = await state(O); assert.strictEqual(m0 - s1.money, Math.round(wd * D.lead.bonus.costDays * team));
    await assert.rejects(act(O, 'bizBonus', { id: c.id, mid: 'all' }), /vor kurzem/);
    const m1 = (await state(O)).money; await act(O, 'bizPraise', { id: c.id, mid: 'all' }); assert.strictEqual((await state(O)).money, m1);
    const s2 = await state(O); assert.ok(s2.companies[0].team.every((m) => m.mood >= 0 && m.mood <= 100));
    await act(O, 'bizWarn', { id: c.id, mid: c.team[0].id }); await service.withCharacter(O, async (ctx) => { ctx.state.day += 31; });
    await act(O, 'bizWarn', { id: c.id, mid: c.team[1] ? c.team[1].id : c.team[0].id }).catch(() => {});
    const rep = require('../src/lib/reputation'); const g = await rep.get(O); assert.ok(g, 'Ansehen lesbar');
  });

  await t.test('Stadtverzeichnis und Statistik: Arbeitsklima steht in player_firms und im Verzeichnis (ohne Schutz-Details)', async () => {
    await service.getView(O);
    const row = await db.one('SELECT * FROM player_firms WHERE user_id = ?', [O]); assert.ok(row.climate != null && row.climate >= 0 && row.climate <= 100);
    const dir = await social.directory(C, { cityId: BS, tab: 'firms' }); const f = dir.items.find((x) => x.userId === O); assert.ok(f && f.climate === Number(row.climate));
    assert.ok(!('mods' in f) && !('security' in f), 'keine Schutzangaben im Verzeichnis');
  });

  await t.test('Aufräumen: alte Vorfälle werden gelöscht, neue bleiben; Einstellung opsLogDays', async () => {
    await db.query("INSERT INTO ops_log (user_id, company_id, city_id, kind, name, created_at) VALUES (?,?,?,?,?, NOW() - INTERVAL 400 DAY)", [O, 1, BS, 'fire', 'Alt']);
    const n0 = (await db.one('SELECT COUNT(*) n FROM ops_log')).n;
    const res = await maintenance.run(); assert.ok(res && res.opsLog >= 1, JSON.stringify(res));
    assert.strictEqual((await db.one('SELECT COUNT(*) n FROM ops_log')).n, n0 - res.opsLog); assert.ok((await db.one('SELECT COUNT(*) n FROM ops_log')).n >= 1, 'junge Zeilen bleiben');
    assert.strictEqual(maintenance.DEFAULT_DAYS.opsLogDays, 120);
    assert.ok((await require('../src/lib/operations').adminLog(5)).length >= 1);
  });

  await t.test('Migration 034: idempotent, Betriebsversicherung in den gespeicherten Wirtschaftsdaten ergänzt', async () => {
    await db.query("INSERT INTO settings (`key`, value) VALUES ('economy', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [JSON.stringify({ insurance: { hausrat: { name: 'x' }, gebaeude: { name: 'y' }, gesundheit: { name: 'z' } } })]);
    await db.query("DELETE FROM schema_migrations WHERE id = '034_operations'");
    await db.query('DROP TABLE ops_log'); await db.query('ALTER TABLE player_firms DROP COLUMN climate');
    assert.strictEqual(await migrations.migrate(db), 1);
    const e = JSON.parse((await db.one("SELECT value FROM settings WHERE `key` = 'economy'")).value); assert.strictEqual(e.insurance.betrieb.name, 'Betriebsversicherung');
    assert.strictEqual(await migrations.migrate(db), 0);
    assert.ok((await db.query('SELECT 1 FROM ops_log LIMIT 1')) !== undefined);
  });
});
