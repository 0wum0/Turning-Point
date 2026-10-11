'use strict';
/**
 * Handelsrouten, Fracht und Verkehrspolitik gegen eine echte Datenbank (opt-in: TP_TEST_DB_PORT): Fracht in Lieferverträgen zwischen zwei Städten
 * (Lieferzeit, ab Werk / frei Haus, Frachtführer), Gutschriften genau einmal, Routen-Spiegel und Last, Admin-Sperre, Spuren für das Gericht, Beschlüsse.
 */
const test = require('node:test');
const assert = require('node:assert');

const port = process.env.TP_TEST_DB_PORT;
const skip = port ? false : 'keine Test-Datenbank (TP_TEST_DB_PORT nicht gesetzt)';

test('Handelsrouten und Fracht gegen echte Datenbank', { skip }, async (t) => {
  const mysql = require('mysql2/promise');
  const name = `tp_transport_${process.pid}`;
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
  const supply = require('../src/lib/supply');
  const transport = require('../src/lib/transport');
  const tpolicy = require('../src/lib/transport-policy');
  const goods = require('../src/game/goods');
  const T = require('../src/game/transport');
  const TR = require('../src/game/trade');
  const { advance } = require('../src/game/engine');
  const { yearOf } = require('../src/game/calendar');
  const world = await require('../src/game/world').get();
  const cityOf = (slug) => world.cityList.find((c) => c.slug === slug).id;
  const BS = cityOf('braunschweig'); const HA = cityOf('hannover');
  settings.get('goods').contracts.minAccountHours = 0;
  const mk = async (n) => (await db.query('INSERT INTO users (email, username, password_hash, coins, efs_pool, meta, efs_accrued_at, social_public) VALUES (?,?,?,?,?,?,?,1)', [`${n}@x.test`, n, 'x', 10, 0, '{}', Date.now()])).insertId;
  const inp = (job) => ({ gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: BS, professionKey: job, fatherName: 'a', motherName: 'b' });
  const [A, B, C, D, E] = [await mk('mueller'), await mk('baecker'), await mk('spedition'), await mk('haendler'), await mk('buergermeister')];
  for (const [u, job] of [[A, 'muehle'], [B, 'baecker'], [C, 'baecker'], [D, 'baecker'], [E, 'baecker']]) await service.create(u, inp(job));
  for (const u of [A, B, C, D, E]) await service.withCharacter(u, async (ctx) => { ctx.state.money = 9e9; ctx.state.housing = { type: 'rent', cityId: BS, base: 70, rooms: 3 }; });
  const state = async (u) => (await service.peek(u)).state;
  const addFirm = (u, pkey, cityId, cash = 0, rooms = 6) => service.withCharacter(u, async (ctx) => {
    const s = ctx.state; const id = s.nextCompanyId++;
    s.companies.push({ id, pkey, tier: 0, name: `${pkey} ${id}`, cityId, rooms, staff: 3, manager: true, cash, base: 100000, since: s.day, abandoned: null, lastProfit: 0 });
    return { id };
  }).then((r) => r.id);
  const fA = await addFirm(A, 'muehle', BS); const fB = await addFirm(B, 'baecker', HA);
  for (const [u, k] of [[C, 'kraftfahrer'], [D, 'einzelhandelsverkaeufer']]) await service.withCharacter(u, async (ctx) => { if (!ctx.state.skills.learned.includes(k)) ctx.state.skills.learned.push(k); });
  const fC = await addFirm(C, 'kraftfahrer', BS, 5e6, 9); const fD = await addFirm(D, 'einzelhandelsverkaeufer', BS, 5e7, 12);
  const runDays = async (u, n) => service.withCharacter(u, async (ctx) => { for (let i = 0; i < n; i++) { ctx.state.meters.fridge = 100; ctx.state.meters.health = 100; advance(ctx.world, ctx.state, 1, { mode: 'online' }); ctx.state.interrupts = []; } });
  const cash = async (u, f) => (await state(u)).companies.find((c) => c.id === f).cash;

  await t.test('Lieferantensuche zeigt Entfernung, Fracht und Lieferzeit; weit entfernte Orte fallen weg', async () => {
    const found = await supply.partners(B, fB, 'mehl', 'supplier');
    const p = found.list.find((x) => x.userId === A);
    assert.ok(p && !p.sameCity && p.km > 20 && p.freight > 0 && p.days >= 1, JSON.stringify(p));
    assert.ok(found.kg > 0 && found.freightMaxPct > 0);
  });

  let farId;
  await t.test('Vertrag über zwei Städte: Fracht ab Werk wird festgelegt, Lieferzeit gilt, Kosten für den Käufer, Gutschrift ohne Fracht', async () => {
    const id = farId = await supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'mehl', qty: 8, pricePct: 100, termDays: 120, auto: true });
    const offerRow = await db.one('SELECT * FROM supply_contracts WHERE id = ?', [id]);
    assert.ok(offerRow.freight_real > 0 && offerRow.lag_days >= 1 && offerRow.km > 20 && offerRow.freight_mode === 'buyer');
    const letter = await db.one("SELECT body FROM messages WHERE to_user = ? AND subject = 'Lieferangebot'", [A]);
    assert.match(letter.body, /Fracht: \d+ km, \d+ Tage Lieferzeit, ab Werk/);
    await supply.respond(A, id, true); await service.getView(B);
    const act = await db.one('SELECT * FROM supply_contracts WHERE id = ?', [id]);
    assert.strictEqual(act.lag_left, act.lag_days);
    const sB = await state(B);
    const buy = sB.contracts.buys.find((x) => x.id === id);
    assert.ok(buy.freight > 0 && buy.fmode === 'buyer' && buy.lag === act.lag_days);
    // Tage in Lieferzeit: kein Vertragskauf, keine Gutschrift
    await runDays(B, Math.max(0, act.lag_days - 1));
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ? AND reason = 'supply'", [A])).n), 0, 'unterwegs wird nichts bezahlt');
    await runDays(B, act.lag_days + 8);
    const rows = await db.query("SELECT * FROM pending_credits WHERE user_id = ? AND reason = 'supply'", [A]);
    assert.strictEqual(rows.length, 1);
    const sB2 = await state(B); const b2 = sB2.contracts.buys.find((x) => x.id === id);
    assert.strictEqual(b2.lag, 0);
    const lagRow = await db.one('SELECT lag_left, days_left FROM supply_contracts WHERE id = ?', [id]);
    assert.strictEqual(lagRow.lag_left, 0);
    // Gutschrift = Warenpreis ohne Fracht: Σ pro Tag qty·take·fill·price (real); Käufer zahlt mehr als der Verkäufer erhält
    const paidDays = 8 + 1; // Tage nach der Lieferzeit
    const maxCredit = paidDays * 8 * act.price_real;
    assert.ok(rows[0].real_amount > 0 && rows[0].real_amount <= maxCredit * 1.001, `Gutschrift ${rows[0].real_amount} ≤ ${maxCredit}`);
    // Laden gutschreiben, nichts doppelt
    const a0 = await cash(A, fA); await service.getView(A); const a1 = await cash(A, fA); assert.ok(a1 > a0);
    for (let i = 0; i < 3; i++) await service.getView(A);
    assert.strictEqual(Number((await db.one('SELECT COUNT(*) n FROM pending_credits WHERE user_id = ?', [A])).n), 0);
  });

  await t.test('Frei Haus: der Verkäufer trägt die Fracht, die Gutschrift sinkt entsprechend', async () => {
    await supply.cancel(A, farId);
    const fA2 = await addFirm(A, 'muehle', BS);
    const id = await supply.offer(A, { role: 'sell', myCompany: fA2, otherUser: B, otherCompany: fB, good: 'mehl', qty: 8, pricePct: 100, termDays: 120, freightMode: 'seller' });
    const o = await db.one('SELECT * FROM supply_contracts WHERE id = ?', [id]); assert.strictEqual(o.freight_mode, 'seller');
    await supply.respond(B, id, true); await service.getView(B);
    await db.query("DELETE FROM pending_credits WHERE user_id = ?", [A]);
    const sB = await state(B);
    const buy = sB.contracts.buys.find((x) => x.id === id);
    const f = require('../src/game/business').companyFlows(world, { ...sB, contracts: { buys: [{ ...buy, lag: 0 }], sells: [] } }, sB.companies.find((c) => c.id === fB), yearOf(sB.day, sB.startYear));
    const pay = f.supply.pays.find((x) => x.id === id);
    assert.ok(pay && pay.freightCents > 0, 'Fracht berechnet');
    assert.strictEqual(pay.cents - pay.freightCents, pay.credit, 'frei Haus: Käufer zahlt nur den Warenpreis, der Verkäufer trägt die Fracht');
    const sell = await supply.mine(A); assert.ok(sell.contracts.some((c) => c.id === id && c.freightMode === 'seller' && c.km > 20));
    await supply.cancel(A, id);
  });

  await t.test('Frachtführer: Spedition bietet Fracht an, Vertrag nutzt sie, die Zahlung kommt genau einmal bei der Spedition an', async () => {
    await assert.rejects(transport.createOffer(A, { company: fA, pct: 85 }), /nur Transport/);
    const oid = await transport.createOffer(C, { company: fC, pct: 80 });
    const market = await transport.marketOffers(B, await service.peek(B));
    assert.ok(market.some((x) => x.id === oid && x.pct === 80), 'Angebot im Markt');
    await assert.rejects(supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'mehl', qty: 8, pricePct: 100, termDays: 120, carrierOffer: 99999 }), /nicht mehr/);
    const std = await db.one('SELECT 1 x'); void std;
    const id = await supply.offer(B, { role: 'buy', myCompany: fB, otherUser: A, otherCompany: fA, good: 'mehl', qty: 8, pricePct: 100, termDays: 120, carrierOffer: oid });
    const row = await db.one('SELECT * FROM supply_contracts WHERE id = ?', [id]);
    assert.strictEqual(row.carrier_user, C); assert.strictEqual(row.carrier_pct, 80);
    const plain = await supply.partners(B, fB, 'mehl', 'supplier'); const pp = plain.list.find((x) => x.userId === A);
    assert.ok(row.freight_real < pp.freight * 0.9, `Rabatt ${row.freight_real} < ${pp.freight}`);
    assert.ok(plain.carriers.some((x) => x.id === oid), 'Spedition in der Suche');
    await supply.respond(A, id, true);
    const c0 = await cash(C, fC);
    await runDays(B, 20);
    const cr = await db.query("SELECT * FROM pending_credits WHERE user_id = ? AND reason = 'freight'", [C]);
    assert.strictEqual(cr.length, 1, 'eine aufsummierte Frachtzahlung'); assert.strictEqual(cr[0].company_id, fC);
    const sB = await state(B); assert.ok(!sB.pending.freight || sB.pending.freight.length === 0, 'Vormerkung geleert');
    await service.getView(C); const c1 = await cash(C, fC); assert.ok(c1 > c0, `Kasse ${c0} → ${c1}`);
    for (let i = 0; i < 3; i++) await service.getView(C);
    assert.strictEqual(Number((await db.one("SELECT COUNT(*) n FROM pending_credits WHERE user_id = ? AND reason = 'freight'", [C])).n), 0);
    assert.strictEqual(await cash(C, fC) >= c1, true);
    const used = await transport.capacityUsed(oid); assert.ok(used > 0, 'Kapazität belegt');
    await supply.cancel(B, id);
  });

  await t.test('Handelsroute: Einrichten mit Vorschau, Spiegel in der Datenbank, Last, Fahrt und Erlös, Admin-Sperre', async () => {
    goods.setScarcity(new Map([[`${BS}|eisenwaren`, 0.8], [`${HA}|eisenwaren`, 1.6]]));
    const pv = await transport.preview(D, { firm: fD, good: 'eisenwaren', from: BS, to: HA, qty: 300, interval: 8 });
    assert.ok(pv.ok && pv.money.costs > 0 && pv.mode.days >= 1 && pv.gapPct > 30, JSON.stringify(pv).slice(0, 200));
    await assert.rejects(transport.create(D, { firm: 999, good: 'eisenwaren', from: BS, to: HA, qty: 300 }), /Betrieb/);
    await assert.rejects(transport.create(A, { firm: fA, good: 'eisenwaren', from: BS, to: HA, qty: 300 }), /Transport-, Logistik/);
    const r = await transport.create(D, { firm: fD, good: 'eisenwaren', from: BS, to: HA, qty: 300, interval: 8 });
    assert.ok(r.id >= 1, JSON.stringify(Object.keys(r)));
    const m = await db.one('SELECT * FROM transport_routes WHERE user_id = ?', [D]);
    assert.ok(m && m.good === 'eisenwaren' && m.active === 1 && m.flow_real > 0 && m.from_city === BS && m.to_city === HA);
    await transport.refresh();
    assert.ok(transport.flows().some((f) => f.good === 'eisenwaren' && f.to === HA && f.perDay > 0), 'Fluss für die Knappheit');
    assert.ok(TR.loadAt(HA, 'eisenwaren').inn > 0 && TR.loadAt(BS, 'eisenwaren').out > 0);
    const scar = goods.computeScarcity(world, [], transport.flows());
    assert.ok(scar.get(`${HA}|eisenwaren`) < 1 && scar.get(`${BS}|eisenwaren`) > 1, 'Zielstadt billiger, Ursprung teurer');
    const c0 = await cash(D, fD);
    await runDays(D, 40);
    const sD = await state(D);
    const route = sD.trade.routes[0];
    assert.ok(route.made.trips >= 2 || route.trip, 'Fahrten laufen');
    assert.ok(Math.abs(route.made.profit) > 0);
    const m2 = await db.one('SELECT * FROM transport_routes WHERE user_id = ?', [D]);
    assert.strictEqual(m2.trips, route.made.trips);
    const ov = await transport.overview(D);
    assert.ok(ov.ok && ov.view.routes.length === 1 && ov.goods.length > 5 && ov.modes.length >= 2 && ov.eligibleFirms[0].id === fD);
    // Admin hält die Route an; der Besitzer sieht es beim Laden, neue Fahrten starten nicht
    await transport.adminCancel(D, route.id, 'Test');
    await service.getView(D);
    const s3 = await state(D); assert.strictEqual(s3.trade.routes[0].locked, true); assert.strictEqual(s3.trade.routes[0].active, false);
    await assert.rejects(transport.setActive(D, route.id, true), /Spielleitung/);
    await transport.adminCancel(D, route.id, '', true);
    await service.getView(D);
    assert.strictEqual((await state(D)).trade.routes[0].locked, false);
    await transport.setActive(D, route.id, true);
    // Löschen erst ohne Fahrt unterwegs
    await transport.setActive(D, route.id, false);
    void c0;
    const stats = await transport.adminStats(); assert.ok(stats.routes >= 1);
    goods.setScarcity(new Map());
  });

  await t.test('Spuren: Diebstahl hinterlässt eine Spur beim Opfer, Schmuggel eine beim ehrlichen Wettbewerber', async () => {
    await service.withCharacter(D, async (ctx) => { ctx.state.pending.tradeEv = [{ kind: 'theft', cityId: HA, damageReal: 500, subject: 'Test' }]; });
    const th = await db.one("SELECT * FROM court_evidence WHERE act = 'theft' AND victim_id = ?", [D]);
    assert.ok(th && th.offender_id === null && th.known === 0);
    // Wettbewerber: Route von C nach Hannover mit Eisenwaren (Spiegel), D schmuggelt dorthin
    await service.withCharacter(C, async (ctx) => { const r = TR.create(ctx.world, ctx.state, { firm: fC, good: 'eisenwaren', from: BS, to: HA, qty: 300, interval: 8 }); assert.ok(r.route, r.err); });
    await service.withCharacter(D, async (ctx) => { ctx.state.pending.tradeEv = [{ kind: 'smuggle', cityId: HA, good: 'eisenwaren', damageReal: 300, subject: 'Test' }]; });
    const sm = await db.one("SELECT * FROM court_evidence WHERE act = 'smuggle'");
    assert.ok(sm && sm.offender_id === D && sm.victim_id === C && sm.known === 1);
    assert.strictEqual((await state(D)).pending.tradeEv.length, 0, 'Vormerkung geleert');
  });

  await t.test('Verkehrspolitik: ein Beschluss je Amtszeit mit Vorschau, wirkt auf Anschluss und Fracht, erlischt mit dem Amt', async () => {
    await service.withCharacter(E, async (ctx) => { ctx.state.politics.term = { idx: 2, startDay: ctx.state.day, endDay: ctx.state.day + 1460, cityId: BS }; });
    const ov = await tpolicy.overview(E);
    assert.deepStrictEqual(ov.office.powers.map((p) => p.kind), ['hub', 'toll']);
    await assert.rejects(tpolicy.set(D, { kind: 'hub', value: 1, good: 'rail' }), /kein Amt/);
    await assert.rejects(tpolicy.preview(E, { kind: 'road', value: 1 }), /keine Befugnis/);
    await assert.rejects(tpolicy.preview(E, { kind: 'toll', value: 5 }), /nicht erlaubt/);
    const pv = await tpolicy.preview(E, { kind: 'toll', value: 4 });
    assert.ok(pv.lines.some((l) => /4 % teurer/.test(l)) && /Maut/.test(pv.text));
    const before = T.quote(world, { from: BS, to: HA, good: 'eisenwaren', year: 1950, doy: 150, unitValueReal: 50, mode: 'bahn', env: { winter: 0, lock: 0, flood: false } }).pick.perUnit.total;
    const r = await tpolicy.set(E, { kind: 'toll', value: 4 });
    assert.match(r.msg, /Maut/);
    await assert.rejects(tpolicy.set(E, { kind: 'hub', value: 1, good: 'air' }), /schon einen Beschluss/);
    const after = T.quote(world, { from: BS, to: HA, good: 'eisenwaren', year: 1950, doy: 150, unitValueReal: 50, mode: 'bahn', env: { winter: 0, lock: 0, flood: false } }).pick.perUnit.total;
    assert.ok(after > before, `Maut wirkt ${before} → ${after}`);
    const ov2 = await tpolicy.overview(E); assert.ok(ov2.active.some((a) => /Maut/.test(a.text)) && ov2.office.used);
    assert.ok((await db.query("SELECT * FROM world_events WHERE title LIKE 'Beschluss:%'")).length >= 1, 'Tagesblatt');
    // Amt verloren → erlischt beim nächsten Aufbau
    await service.withCharacter(E, async (ctx) => { ctx.state.politics.term = null; });
    await db.query("UPDATE player_stats SET office = NULL WHERE user_id = ?", [E]);
    await tpolicy.refresh();
    assert.strictEqual(T.quote(world, { from: BS, to: HA, good: 'eisenwaren', year: 1950, doy: 150, unitValueReal: 50, mode: 'bahn', env: { winter: 0, lock: 0, flood: false } }).pick.perUnit.total, before);
  });

  await t.test('Bots richten Routen ein und bieten Fracht an (wie Spieler)', async () => {
    goods.setScarcity(new Map([[`${BS}|eisenwaren`, 0.7], [`${HA}|eisenwaren`, 1.7], [`${BS}|textil`, 0.75], [`${HA}|textil`, 1.6]]));
    await service.withCharacter(D, async (ctx) => { ctx.state.day = Math.max(ctx.state.day, 400); ctx.state.trade.routes = []; });
    await transport.botRound(D, () => 0.01);
    const s = await state(D);
    assert.ok(s.trade.routes.length >= 1, 'Bot hat eine Route eingerichtet');
    goods.setScarcity(new Map());
  });
});
