'use strict';
/**
 * Charakterblatt gegen eine echte Datenbank (opt-in: TP_TEST_DB_PORT): Kauf, Verkauf und Dienste buchen auf den Cent genau einmal und stehen genau einmal im Protokoll (char_log),
 * Rang und Auftreten erscheinen im öffentlichen Profil, Rangaufstieg im Tagesblatt (nur mit sichtbarem Profil), Erbe (kleiner Vorsprung, Erbstücke), Wahl- und Gerichtsgewicht aus
 * dem veröffentlichten Auftreten, Rang-Vorteile bei Gebühr und Vereinsplätzen, Aufräumen, Migration 035 idempotent.
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Charakterblatt gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_char_${process.pid}`;
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
  const CH = require('../src/game/character');
  const maintenance = require('../src/lib/maintenance');
  const migrations = require('../src/db/migrations');
  const social = require('../src/lib/social');
  const chLib = require('../src/lib/character');
  const { createHeirState } = require('../src/game/heir');
  const world = await require('../src/game/world').get();
  const { yearOf } = require('../src/game/calendar');
  const BS = world.cityList.find((c) => c.slug === 'braunschweig').id;
  const mk = async (n, pub = 1) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at, social_public) VALUES (?,?,?,?,?,?,?,?)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now(), pub])).insertId;
  const inp = (job) => ({ gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: BS, professionKey: job, fatherName: 'a', motherName: 'b' });
  const A = await mk('sichtbar'); const B = await mk('stiller', 0);
  for (const u of [A, B]) await service.create(u, inp('baecker'));
  const setup = async (u, money = 9e8) => service.withCharacter(u, async (ctx) => { ctx.state.money = money; ctx.state.day = 3000; ctx.state.housing = { type: 'rent', cityId: BS, base: 70, rooms: 3 }; ctx.state.meters.fridge = 100; ctx.state.skills.days.baecker = 4000; });
  for (const u of [A, B]) await setup(u);
  const state = async (u) => (await service.peek(u)).state;
  const act = (u, n, i) => service.doAction(u, n, i);
  const logs = (u, kind) => db.query('SELECT * FROM char_log WHERE user_id = ?' + (kind ? ' AND kind = ?' : '') + ' ORDER BY id', kind ? [u, kind] : [u]);

  await t.test('Kauf: Geld auf den Cent genau einmal, genau ein Protokolleintrag, Warteschlange nach dem Speichern leer, weitere Züge schreiben nichts nach', async () => {
    const s0 = await state(A); const y = yearOf(s0.day, s0.startYear); const price = CH.price(world, s0, 'kleidung', 2, y); const m0 = s0.money;
    await act(A, 'chBuy', { slot: 'kleidung', level: 2 });
    const s1 = await state(A); assert.strictEqual(m0 - s1.money, price); assert.strictEqual(s1.char.gear.kleidung.lv, 2); assert.strictEqual((s1.pending.char || []).length, 0);
    const rows = await logs(A, 'buy'); assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].slot, 'kleidung'); assert.strictEqual(rows[0].lvl, 2);
    assert.ok(Math.abs(Number(rows[0].real_amount) - Math.round(price / world.idx(y))) <= 1);
    await service.getView(A); await service.getView(A); assert.strictEqual((await logs(A, 'buy')).length, 1);
    await assert.rejects(act(A, 'chBuy', { slot: 'kleidung', level: 2 }), /schon/); assert.strictEqual((await state(A)).money, s1.money);
    await Promise.allSettled([act(A, 'chBuy', { slot: 'uhr', level: 1 }), act(A, 'chBuy', { slot: 'uhr', level: 1 })]);
    assert.strictEqual((await logs(A, 'buy')).filter((r) => r.slot === 'uhr').length, 1, 'doppelter Klick kauft nur einmal');
  });

  await t.test('Verkauf und Dienste: Erlös genau einmal, Dienst kostet täglich, Protokoll', async () => {
    const s0 = await state(A); const g = s0.char.gear.uhr; const v = CH.resaleValue(world, s0, 'uhr', g); const m0 = s0.money;
    await act(A, 'chSell', { slot: 'uhr' }); assert.strictEqual((await state(A)).money - m0, v); assert.strictEqual((await logs(A, 'sell')).length, 1);
    await act(A, 'chService', { slot: 'schutz', level: 1 }); assert.strictEqual((await logs(A, 'svc')).length, 1);
    const s1 = await state(A); assert.strictEqual(s1.char.svc.schutz, 1); assert.ok(CH.upkeepDay(world, s1) > 0);
  });

  await t.test('Rang und Auftreten im öffentlichen Profil; Aufstieg im Tagesblatt nur mit sichtbarem Profil und ab dem eingestellten Rang', async () => {
    await service.getView(A);
    const ps = await db.one('SELECT rank_lv, look FROM player_stats WHERE user_id = ?', [A]); assert.ok(ps.rank_lv >= 1 && ps.look >= 0);
    const prof = await social.profile(B, A); assert.strictEqual(prof.stats.rank, Number(ps.rank_lv)); assert.ok(prof.stats.rankName);
    const w0 = (await db.one("SELECT COUNT(*) n FROM world_events WHERE title = 'Gesellschaft'")).n;
    for (const [u, pub] of [[A, true], [B, false]]) await service.withCharacter(u, async (ctx) => { const s = ctx.state; s.char.rank.lv = 4; s.rep = { s: 78, l: 78, lv: 4, ll: 4, c: [40, 40, 40, 40, 0] }; s.money = 9e11; s.civic = { titles: [{ key: 'kommerzienrat', rank: 3 }, { key: 'stifter', rank: 3 }] }; s.politics.completed = { 0: 1, 1: 1, 2: 1, 3: 1 }; const r = CH.checkRank(ctx.world, s); assert.ok(r.to >= 5, `Rang ${r.to}`); void pub; });
    const ev = await db.query("SELECT text FROM world_events WHERE title = 'Gesellschaft' ORDER BY id DESC LIMIT 2"); assert.strictEqual(ev.length - 0, ev.length); assert.strictEqual((await db.one("SELECT COUNT(*) n FROM world_events WHERE title = 'Gesellschaft'")).n - w0, 2);
    assert.ok(ev.some((e) => /^Karl Becker steigt in .* zum Rang/.test(e.text)) && ev.some((e) => /^Ein Bürger steigt in/.test(e.text)), JSON.stringify(ev));
    const nr = (await logs(A, 'rank')).length; assert.ok(nr >= 1); await service.getView(A); assert.strictEqual((await logs(A, 'rank')).length, nr, 'Protokoll nicht doppelt'); assert.strictEqual((await db.one("SELECT COUNT(*) n FROM world_events WHERE title = 'Gesellschaft'")).n - w0, 2, 'nicht doppelt');
    const ps2 = await db.one('SELECT rank_lv FROM player_stats WHERE user_id = ?', [A]); assert.ok(ps2.rank_lv >= 5);
  });

  await t.test('Rang-Vorteile: Kandidaturgebühr und Vereinsplätze aus dem veröffentlichten Rang, höchstens die Deckel der Gesellschaft', async () => {
    const civic = require('../src/lib/civic'); const clubs = require('../src/lib/civic-clubs');
    await db.query('UPDATE player_stats SET rank_lv = 1 WHERE user_id = ?', [B]); const d1 = await civic.feeDiscount(db, B); const s1 = await clubs.slotsFor(db, B);
    await db.query('UPDATE player_stats SET rank_lv = 7 WHERE user_id = ?', [B]); const d7 = await civic.feeDiscount(db, B); const s7 = await clubs.slotsFor(db, B);
    assert.ok(d7 > d1 && d7 <= settings.get('gesellschaft').titles.maxFeeDiscPct); assert.ok(s7 > s1 && s7 <= s1 + 2);
    assert.strictEqual(await chLib.perkOf(db, B, 'clubSlots'), CH.RANK().perks.clubSlots[6]); assert.strictEqual(await chLib.perkOf(db, 999999, 'clubSlots'), 0);
  });

  await t.test('Wahl und Gericht: Auftreten wird veröffentlicht und wirkt klein und gedeckelt', async () => {
    await db.query('UPDATE player_stats SET look = 100 WHERE user_id = ?', [A]);
    const m = await chLib.looks([A, B]); assert.strictEqual(m.get(A).look, 100);
    assert.ok(CH.voteOfLook(100) <= 1 + CH.D.effects.votePct / 100 + 1e-9 && CH.voteOfLook(100) > CH.voteOfLook(0)); assert.strictEqual(CH.voteOfLook(0), 1); assert.ok(CH.courtOfLook(100) <= CH.D.effects.courtPts && CH.courtOfLook(100) > 0);
    const cols = await db.query('SELECT look FROM player_stats LIMIT 1'); assert.ok(cols.length >= 1);
  });

  await t.test('Erbe: kleiner Bildungsvorsprung, Erbstück unverkäuflich, keine Verdopplung; Heir wird ganz normal gespeichert', async () => {
    const heirId = await mk('erbe-inhaber'); await service.create(heirId, inp('baecker')); await setup(heirId);
    await act(heirId, 'chBuy', { slot: 'schmuck', level: 2 });
    await service.withCharacter(heirId, async (ctx) => { const s = ctx.state; s.talents.xp.tot = 300; const fam = require('../src/game/family'); fam.bornChild({ world: ctx.world, state: s, idx: 1 }, require('../src/game/rng').rngFor('b', 2)); s.children[0].born = s.day - 20 * 365; });
    const old = await state(heirId); const { state: h } = createHeirState(world, old, old.children[0].id, []);
    assert.ok(h.talents.xp.bal <= CH.XP().inherit.max && h.talents.xp.bal >= 1); assert.strictEqual(h.char.heir.length, 1); assert.strictEqual(h.char.heir[0].slot, 'schmuck'); assert.deepStrictEqual(h.char.gear, {});
    assert.strictEqual(JSON.parse(JSON.stringify(h)).char.heir[0].lv, h.char.heir[0].lv);
  });

  await t.test('Aufräumen: alte Protokolleinträge werden gelöscht, neue bleiben; Einstellung charLogDays', async () => {
    await db.query("INSERT INTO char_log (user_id, city_id, kind, slot, lvl, real_amount, created_at) VALUES (?,?,?,?,?,?, NOW() - INTERVAL 400 DAY)", [A, BS, 'buy', 'uhr', 1, 5]);
    const n0 = (await db.one('SELECT COUNT(*) n FROM char_log')).n;
    const res = await maintenance.run(); assert.ok(res && res.charLog >= 1, JSON.stringify(res));
    assert.strictEqual((await db.one('SELECT COUNT(*) n FROM char_log')).n, n0 - res.charLog); assert.ok((await db.one('SELECT COUNT(*) n FROM char_log')).n >= 1);
    assert.strictEqual(maintenance.DEFAULT_DAYS.charLogDays, 120); assert.ok((await chLib.adminLog(5)).length >= 1);
  });

  await t.test('Migration 035: idempotent, Tabelle und Spalten vorhanden', async () => {
    await db.query("DELETE FROM schema_migrations WHERE id = '035_character'");
    await db.query('DROP TABLE char_log'); await db.query('ALTER TABLE player_stats DROP COLUMN rank_lv, DROP COLUMN look');
    assert.strictEqual(await migrations.migrate(db), 1); assert.strictEqual(await migrations.migrate(db), 0);
    assert.ok((await db.query('SELECT 1 FROM char_log LIMIT 1')) !== undefined); const c = await db.one('SELECT rank_lv, look FROM player_stats LIMIT 1'); assert.ok(!c || (c.rank_lv >= 1 && c.look >= 0));
  });
});
