'use strict';
/**
 * Ruf und Ansehen gegen eine echte MySQL/MariaDB-Datenbank (opt-in wie test/db-flows.test.js):
 *   TP_TEST_DB_HOST=127.0.0.1 TP_TEST_DB_PORT=3306 TP_TEST_DB_USER=root npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Ansehen: Ereignisse, Grenzen, Erbe, Wirkungen und Ehrenbürgerwürde gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_rep_${process.pid}`;
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
  const R = require('../src/game/reputation');
  const rep = require('../src/lib/reputation');
  const service = require('../src/game/service');
  const world = await require('../src/game/world').get();
  const city = world.cityList.find((c) => c.slug === 'braunschweig').id;
  const ruf = settings.get('ruf'); ruf.minAccountHours = 0; // frische Testkonten
  settings.get('social').gifts.minAccountHours = 0; settings.get('social').gifts.minGameDays = 0;
  const mk = async (n) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at) VALUES (?,?,?,?,?,?,?)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now()])).insertId;
  const inp = { gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: city, professionKey: 'baecker', fatherName: 'a', motherName: 'b' };
  const [A, B, C] = [await mk('alice'), await mk('bob'), await mk('carl')];
  for (const u of [A, B, C]) { await service.create(u, inp); await service.withCharacter(u, async (ctx) => { ctx.state.money = 9e9; }); }
  const state = async (u) => (await service.peek(u)).state;

  await t.test('Neutral beim Start; add() bucht, begrenzt je Tag und fasst das Protokoll zusammen', async () => {
    const g0 = await rep.get(A, city); assert.strictEqual(g0.level, 0);
    let sum = 0;
    for (let i = 0; i < 30; i++) sum += await rep.add(A, 'rel', 1, 'rent_paid', 'x');
    assert.ok(sum > 0 && sum <= R.REASONS.rent_paid.cap + 1e-9, `Tagesgrenze (${sum})`);
    const rows = await db.query("SELECT * FROM reputation_log WHERE user_id = ? AND reason = 'rent_paid'", [A]);
    assert.strictEqual(rows.length, 1, 'ein zusammengefasster Eintrag je Tag');
    assert.ok(Number(rows[0].n) > 1);
    const g1 = await rep.get(A, city); assert.ok(g1.comps.rel > 2 && g1.score > 0);
    assert.ok(g1.local > 0 && g1.local <= g1.score + 1e-9);
    assert.strictEqual(await rep.add(A, 'rel', 1, 'gibt_es_nicht', 'x'), 0);
  });

  await t.test('Schlechtes Verhalten senkt die Stufe; Skandal zählt abgezogen; Tagesblatt meldet Verruf', async () => {
    for (let i = 0; i < 4; i++) { await rep.add(B, 'scandal', 25, 'sabotage_caught', `r${i}`); await rep.add(B, 'rel', -6, 'rent_missed', 'x'); }
    const g = await rep.get(B, city);
    assert.ok(g.comps.scandal > 20 && g.level <= -1, `Stufe ${g.level} Wert ${g.score}`);
    for (let d = 0; d < 3; d++) { await db.query("UPDATE reputation SET decay_day = decay_day - 1, caps = NULL WHERE user_id = ?", [B]); rep.invalidate(B); await rep.add(B, 'scandal', 25, 'sabotage_caught', 'again'); await rep.add(B, 'scandal', 25, 'bankrupt', 'again'); }
    const g2 = await rep.get(B, city);
    assert.ok(g2.level <= -2 || g2.score < -10, `jetzt Verrufen? ${g2.score}`);
  });

  await t.test('Vorgemerkte Ereignisse im Spielstand werden genau einmal gebucht (auch bei vielen Aufrufen)', async () => {
    const before = Number((await db.one("SELECT COUNT(*) n FROM reputation_log WHERE user_id = ? AND reason = 'tax_paid'", [C])).n);
    await service.withCharacter(C, async (ctx) => { R.queue(ctx.state, 'civic', 2, 'tax_paid', 't1'); R.queue(ctx.state, 'civic', 2, 'tax_paid', 't1'); });
    for (let i = 0; i < 4; i++) await service.getView(C);
    const row = await db.one("SELECT delta, n FROM reputation_log WHERE user_id = ? AND reason = 'tax_paid'", [C]);
    assert.strictEqual(Number(row.n), 2); assert.ok(Number(row.delta) > 0 && Number(row.delta) <= 4);
    assert.ok(before === 0);
    const s = await state(C); assert.ok(!s.pending.rep || s.pending.rep.length === 0);
    assert.ok(s.rep && s.rep.s > 0, 'Zwischenspeicher im Spielstand');
  });

  await t.test('Miete pünktlich zahlen zählt: Spieltage vorspulen bucht Zuverlässigkeit', async () => {
    await service.withCharacter(A, async (ctx) => { ctx.state.housing = { type: 'rent', cityId: city, base: 70, rooms: 3 }; ctx.state.money = 9e9; });
    const r0 = (await rep.get(A, city)).comps.rel;
    await db.query('UPDATE reputation SET caps = NULL WHERE user_id = ?', [A]); rep.invalidate(A);
    await service.withCharacter(A, async (ctx) => { require('../src/game/engine').advance(ctx.world, ctx.state, 20, { mode: 'offline' }); });
    const r1 = (await rep.get(A, city)).comps.rel;
    assert.ok(r1 > r0, `Zuverlässigkeit gestiegen ${r0} → ${r1}`);
  });

  await t.test('Geschenk: zählt fürs Gemeinwohl; gleiche IP und ganz neue Konten zählen nicht', async () => {
    const social = require('../src/lib/social');
    const c0 = (await rep.get(A, city)).comps.civic;
    await social.gift(A, C, 10);
    const c1 = (await rep.get(A, city)).comps.civic;
    assert.ok(c1 > c0, 'Geschenk zählt');
    await db.query("INSERT INTO user_ips (user_id, ip) VALUES (?, '10.0.0.7'), (?, '10.0.0.7')", [A, C]).catch(() => {});
    assert.strictEqual(await rep.add(A, 'civic', 2, 'gift', 'ring', { other: C }), 0, 'gleiche IP zählt nicht');
    await db.query("DELETE FROM user_ips WHERE ip = '10.0.0.7'");
    ruf.minAccountHours = 5000;
    assert.strictEqual(await rep.add(A, 'civic', 2, 'gift', 'new', { other: B }), 0, 'neues Konto zählt nicht');
    ruf.minAccountHours = 0;
  });

  await t.test('Erbe und Neustart: ein Teil des Familienrufs bleibt', async () => {
    await rep.add(A, 'trade', 8, 'trade_done', 'a1'); await rep.add(A, 'office', 10, 'office_term', 'a2');
    const before = await rep.get(A, city);
    await db.tx((conn) => rep.inherit(conn, A, 'heir')); rep.invalidate(A);
    const after = await rep.get(A, city);
    assert.ok(Math.abs(after.comps.trade - before.comps.trade * 0.5) < 0.2);
    assert.ok(after.score < before.score && after.score > before.score * 0.3);
    const lg = await rep.ledger(A, 5); assert.ok(lg.some((x) => x.reason === 'inherit'));
  });

  await t.test('Wirkungen: Kreditzins/-rahmen, Vertragsband, Kreditsperre bei Verruf', async () => {
    const credit = require('../src/game/credit'); const supply = require('../src/lib/supply');
    const s = await state(A); s.status = 'alive';
    const base = credit.view(world, { ...s, rep: undefined });
    const good = credit.view(world, { ...s, rep: { s: 60, l: 60, lv: 3, ll: 3 } });
    const bad = credit.view(world, { ...s, rep: { s: -40, l: -40, lv: -2, ll: -2 } });
    assert.ok(good.rate < base.rate && bad.rate > base.rate);
    assert.ok(good.limit >= base.limit && bad.limit <= base.limit);
    assert.ok(bad.standing.blocked && !good.standing.blocked);
    assert.throws(() => credit.take(world, { ...s, rep: { s: -40, l: -40, lv: -2, ll: -2 } }, 100000, 3), /Ansehen|Verrufen/);
    const m = await supply.mine(A); assert.ok(m.band.lo <= 90 && m.band.hi >= 115 && m.band.lo >= 50);
    const mb = await supply.mine(B); assert.ok(mb.band.blocked || mb.band.lo >= 90, 'schlechter Ruf verengt oder sperrt');
  });

  await t.test('Ehrenbürgerwürde: nur Bürgermeister, einmal je Amtszeit, Vorschau, Wirkung beim Geehrten', async () => {
    const honor = require('../src/lib/honor');
    await assert.rejects(honor.preview(A, C), /bürgermeister/i);
    await service.withCharacter(A, async (ctx) => { ctx.state.politics.term = { idx: 2, startDay: ctx.state.day, endDay: ctx.state.day + 1000, cityId: ctx.state.cityId }; });
    // C bekommt vor Ort genug Ansehen
    for (let d = 0; d < 6; d++) { await db.query('UPDATE reputation SET caps = NULL WHERE user_id = ?', [C]); rep.invalidate(C); await rep.add(C, 'rel', 9, 'loan_cleared', `x${d}`, { cityId: city }); await rep.add(C, 'trade', 7, 'trade_done', `y${d}`, { cityId: city }); await rep.add(C, 'civic', 7, 'hire', `z${d}`, { cityId: city }); }
    const ov = await honor.overview(A); assert.ok(ov.available && ov.candidates.some((x) => x.userId === C), JSON.stringify(ov));
    const pv = await honor.preview(A, C); assert.ok(pv.gain.civic > 0 && pv.text.includes('Ehrenbürger'));
    const c0 = await rep.get(C, city);
    const g = await honor.grant(A, C); assert.ok(g.name);
    rep.invalidate(C); const c1 = await rep.get(C, city);
    assert.ok(c1.local > c0.local + 5 && c1.comps.civic >= c0.comps.civic);
    await assert.rejects(honor.grant(A, C), /schon verliehen/);
    await assert.rejects(honor.preview(A, A), /schon verliehen|selbst/);
    const lg = await rep.ledger(A, 10); assert.ok(lg.some((x) => x.reason === 'honor_given'));
  });

  await t.test('Wahlen: Mindestansehen für Ämter, Gewicht aus dem Ansehen', async () => {
    const el = require('../src/lib/elections'); const c = settings.get('elections');
    const s = await state(B); const s2 = JSON.parse(JSON.stringify(s));
    s2.politics.completed = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 }; s2.politics.term = null; s2.person.birthDay = s2.day - 40 * 365; s2.status = 'alive';
    s2.rep = { s: 5, l: 5, lv: 0, ll: 0 };
    assert.match(el.runBlock(world, s2, 1, c, 9999), /Ansehen: Anständig/);
    assert.match(el.runBlock(world, s2, 5, c, 9999), /Ansehen: Honoratior/);
    s2.rep = { s: 60, l: 60, lv: 3, ll: 3 };
    assert.strictEqual(el.runBlock(world, s2, 5, c, 9999), null, 'Kanzler erreichbar');
    const t = el.tally([{ userId: 1, influence: 0, weight: 1.05 }, { userId: 2, influence: 0, weight: 0.9 }], { 1: 10, 2: 11 });
    assert.strictEqual(t.winnerId, 1, 'Ansehen entscheidet knappe Wahl');
  });

  await t.test('Protokoll bleibt begrenzt; Admin kann zurücksetzen; Abflauen im Hintergrund', async () => {
    ruf.ledgerKeep = 12;
    for (let d = 0; d < 20; d++) { await db.query('UPDATE reputation_log SET day_no = day_no - 1 WHERE user_id = ?', [C]); await db.query('UPDATE reputation SET caps = NULL WHERE user_id = ?', [C]); rep.invalidate(C); await rep.add(C, 'rel', 1, 'rent_paid', `q${d}`); }
    const n = Number((await db.one('SELECT COUNT(*) n FROM reputation_log WHERE user_id = ?', [C])).n);
    assert.ok(n <= 14, `Protokoll begrenzt (${n})`);
    ruf.ledgerKeep = 80;
    await db.query('UPDATE reputation SET decay_day = decay_day - 30 WHERE user_id = ?', [C]); rep.invalidate(C);
    const aged = await rep.get(C, city); assert.ok(aged.comps.rel >= 0);
    const v = await rep.view(C, city, world); assert.ok(v.ok && v.kinds.length === 5 && v.levels.length === 7 && v.gates.length >= 5);
    await rep.adminReset(C); const z = await rep.get(C, city);
    assert.strictEqual(z.score, 0);
    assert.strictEqual(Number((await db.one('SELECT COUNT(*) n FROM reputation_log WHERE user_id = ?', [C])).n), 1);
  });

  await t.test('Plaketten für viele Spieler in einer Abfrage', async () => {
    const m = await rep.many([A, B, C, 99999], city);
    assert.strictEqual(m.size, 4);
    for (const v of m.values()) { assert.ok(Number.isFinite(v.s) && v.lv >= -2 && v.lv <= 4); }
  });
});
