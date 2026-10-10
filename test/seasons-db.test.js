'use strict';
/**
 * Jahreszeiten, Ernte und Seuchen gegen eine echte Datenbank: Beschlüsse (Stadt, Land, Bund) mit Vorschau und Ablauf, Tagesblatt-Zeilen
 * (Beschluss, Jahreszeit und Lage der Spieljahre), Seuchenschutz über den Service, Wirkung auf die Spielfigur.
 * Läuft nur mit Test-Datenbank: TP_TEST_DB_PORT=3306 npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Jahreszeiten, Ernte und Seuchen gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_seasons_${process.pid}`;
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
  const service = require('../src/game/service');
  const policies = require('../src/lib/policies');
  const goods = require('../src/game/goods');
  const EP = require('../src/game/epidemics');
  const SFX = require('../src/game/seasonfx');
  const { advance } = require('../src/game/engine');
  const world = await require('../src/game/world').get();
  const city = world.cityList.find((c) => c.slug === 'braunschweig');
  const mk = async (n) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at, social_public) VALUES (?,?,?,?,?,?,?,1)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now()])).insertId;
  const inp = { gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: city.id, professionKey: 'baecker', fatherName: 'a', motherName: 'b' };
  const [M, K, P] = [await mk('stadtrat'), await mk('kanzler'), await mk('privat')];
  for (const u of [M, K, P]) { await service.create(u, inp); await service.withCharacter(u, async (ctx) => { ctx.state.money = 9e9; ctx.state.housing = { type: 'rent', cityId: city.id, base: 70, rooms: 3 }; }); }
  const day2020 = (2020 - 1945) * 365 + 150; // 30. Mai 2020 – Corona-Pandemie (1. Welle) steigt in Braunschweig

  await t.test('Stadtrat: Gesundheitsamt mit Vorschau, ein Beschluss je Amtszeit, wirkt nur in der Stadt, Tagesblatt', async () => {
    await service.withCharacter(M, async (ctx) => { ctx.state.politics.term = { idx: 1, startDay: ctx.state.day, endDay: ctx.state.day + 1460, cityId: city.id }; });
    const ov = await policies.overview(M);
    assert.ok(ov.office.powers.some((p) => p.kind === 'hygiene' && p.levels.length === 3) && ov.office.powers.some((p) => p.kind === 'winterhilfe'));
    const pv = await policies.preview(M, { kind: 'hygiene', value: 3 });
    assert.strictEqual(pv.preview.lines[0].key, 'hygiene'); assert.ok(pv.preview.lines.some((l) => l.key === 'levy') && /Gesundheitsamt/.test(pv.text));
    await assert.rejects(policies.preview(M, { kind: 'pandemic', value: 2 }), /Befugnis/);
    await assert.rejects(policies.set(M, { kind: 'hygiene', value: 7 }), /nicht erlaubt/);
    const r = await policies.set(M, { kind: 'hygiene', value: 3 });
    assert.match(r.msg, /Gesundheitsamt/);
    await assert.rejects(policies.set(M, { kind: 'winterhilfe', value: 1 }), /schon einen Beschluss/);
    assert.strictEqual(goods.effectsFor(world, city.id).epi.hyg, 3);
    assert.strictEqual(goods.effectsFor(world, world.cityList.find((c) => c.id !== city.id).id).epi.hyg, 0);
    assert.ok(goods.effectsFor(world, city.id).levy > 0.5, 'Umlage');
    assert.strictEqual((await db.query("SELECT * FROM world_events WHERE kind = 'election' AND title LIKE 'Beschluss%'")).length, 1);
    const ovp = await policies.overview(P);
    assert.strictEqual(ovp.local.epi.hyg, 3, 'Anzeige im Stadtbereich');
    // Hygiene bremst die Welle vor Ort
    const base = EP.situation(world, 2020, 150, city, { epi: { hyg: 0, hospital: 0, level: null, cap: 2, vaccLvl: 0, kurz: 0 } });
    const withP = EP.situation(world, 2020, 150, city, goods.effectsFor(world, city.id));
    assert.ok(withP.I < base.I);
    await service.withCharacter(M, async (ctx) => { ctx.state.politics.term = null; });
    await policies.refresh();
    assert.strictEqual(goods.effectsFor(world, city.id).epi.hyg, 0, 'erlischt mit dem Amt');
  });

  await t.test('Kanzler: Seuchenmaßnahmen werden vom Rahmen des Bundes gedeckelt, gelten für alle Städte, erlöschen mit dem Amt', async () => {
    await service.withCharacter(K, async (ctx) => { ctx.state.politics.term = { idx: 5, startDay: ctx.state.day, endDay: ctx.state.day + 1460, cityId: 0 }; });
    const pv = await policies.preview(K, { kind: 'pandemic', value: 3 });
    assert.ok(pv.preview.lines[0].b.capped && pv.preview.lines[0].b.cap === 2 && pv.preview.lines[0].c === 'unpopular');
    const r = await policies.set(K, { kind: 'pandemic', value: 1 });
    assert.match(r.msg, /Seuchenmaßnahmen/);
    const other = world.cityList.find((c) => c.slug === 'muenchen') || world.cityList[3];
    assert.strictEqual(goods.effectsFor(world, other.id).epi.level, 1);
    const sit = EP.situation(world, 2020, 150, city, goods.effectsFor(world, city.id));
    assert.strictEqual(sit.level, 1, 'Maske statt Standardmaßnahme 2');
    await service.withCharacter(K, async (ctx) => { ctx.state.politics.term = null; });
    await policies.refresh();
    assert.strictEqual(goods.effectsFor(world, city.id).epi.level, null);
  });

  await t.test('Spielfigur in der Seuche: Ansicht, Schutz über den Service, Lage im Tagesblatt', async () => {
    await service.withCharacter(P, async (ctx) => { ctx.state.day = day2020; ctx.state.person.birthDay = day2020 - 30 * 365; });
    const v = (await service.getView(P)).view;
    console.log(JSON.stringify(v.season && {k: v.season.key, y: v.season.year, d: v.season.doy, epi: v.season.epi.wave})); assert.ok(v.season && v.season.epi.active && v.season.epi.wave && v.season.epi.protect.hygiene.cost > 0, JSON.stringify(v.season && v.season.epi));
    const m0 = (await service.peek(P)).state.money;
    await service.doAction(P, 'epiProtect', { what: 'hygiene' });
    const s = (await service.peek(P)).state;
    assert.ok(s.money < m0 && EP.hygOn(s));
    await assert.rejects(service.doAction(P, 'epiProtect', { what: 'hygiene' }), /wirkt noch/);
    await db.query("UPDATE player_stats SET days = ?, year = ?, city_id = ?, status = 'alive' WHERE user_id = ?", [day2020, 2020, city.id, P]);
    await db.query('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [P]);
    const digest = await require('../src/lib/tagesblatt').seasonDigest(world);
    assert.ok(digest.some((d) => d.year === 2020 && d.epidemic && /Corona/.test(d.epidemic.name)), JSON.stringify(digest));
    const st = await require('../src/lib/tagesblatt').stats();
    assert.ok(Array.isArray(st.season));
    // ein paar Spieltage: Zustand bleibt sauber, Meldungen kommen an
    await service.withCharacter(P, async (ctx) => { for (let i = 0; i < 60; i++) { ctx.state.meters.fridge = 100; advance(ctx.world, ctx.state, 1, { mode: 'online' }); ctx.state.interrupts = []; } });
    const s2 = (await service.peek(P)).state;
    assert.ok(Number.isFinite(s2.money) && s2.status === 'alive' && SFX.brief(world, s2).season.on);
  });
});
