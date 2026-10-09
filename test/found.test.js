'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const { createCharacter } = require('../src/game/state');
const actions = require('../src/game/actions');
const biz = require('../src/game/business');
const onboarding = require('../src/game/onboarding');
const { edition } = require('../src/game/newspaper');

const w = testWorld();
const u = () => ({ meta: {}, coins: 50, efs_pool: 0 });
const mk = (k = 'baecker') => { const s = createCharacter(w, input(w, { professionKey: k }), u()); s.money = 50000000; return s; };
const act = (s, n, i) => actions.run(n, { world: w, state: s, input: i, user: u(), now: Date.now() });

test('foundOptions: nur Betriebsarten der eigenen Qualifikation, feste Preise ohne Zufall', () => {
  const s = mk('baecker');
  const a = biz.foundOptions(w, s); const b = biz.foundOptions(w, s);
  assert.deepStrictEqual(a, b, 'deterministisch');
  const o = a.options.find((x) => x.pkey === 'baecker');
  assert.ok(o, 'Bäckerei im Angebot');
  assert.ok(a.options.every((x) => s.skills.learned.includes(x.pkey) || (s.partner && s.partner.pkey === x.pkey)));
  const city = w.city(s.cityId); const t0 = biz.tiersOf(w)[0];
  assert.strictEqual(o.tiers[0].price, Math.round(Math.round(t0.price * city.price_factor) * w.idx(1945 + Math.floor(s.day / 365))), 'Preis = Stufe × Stadtfaktor × Index');
  assert.strictEqual(a.cityId, s.cityId);
  assert.ok(a.canAfford && a.cheapest > 0);
  assert.match(o.name, /Bäckerei/);
  assert.ok(typeof o.tiers[0].profit === 'number' && o.tiers[0].inputs.length > 0);
});

test('foundBiz: Gründung bucht den Preis, legt den Betrieb an und merkt keine Zeitungsanzeige', () => {
  const s = mk('baecker');
  const o = biz.foundOptions(w, s).options.find((x) => x.pkey === 'baecker');
  const m0 = s.money;
  const r = act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: '  Bäckerei  Sonnenschein ' });
  assert.match(r.msg, /Sonnenschein/);
  assert.strictEqual(s.companies.length, 1);
  assert.strictEqual(s.companies[0].name, 'Bäckerei Sonnenschein');
  assert.strictEqual(s.money, m0 - o.tiers[0].price);
  assert.strictEqual(s.companies[0].cityId, s.cityId);
  assert.ok(!(s.sold && Object.keys(s.sold).length), 'kein markSold');
  // Zeitungsangebot kostet bei gleicher Stufe im Mittel dasselbe Niveau, die Gründung aber ist reproduzierbar
  assert.ok(edition(w, s, s.cityId));
});

test('foundBiz: Standardname wird vorgeschlagen und bleibt eindeutig', () => {
  const s = mk('baecker');
  act(s, 'foundBiz', { pkey: 'baecker', tier: 0 });
  act(s, 'foundBiz', { pkey: 'baecker', tier: 0 });
  assert.strictEqual(s.companies.length, 2);
  assert.notStrictEqual(s.companies[0].name, s.companies[1].name);
  assert.match(s.companies[0].name, /^Bäckerei /);
});

test('foundBiz: Qualifikation, Geld, Höchstzahl und Stufe werden serverseitig geprüft', () => {
  const s = mk('baecker');
  assert.throws(() => act(s, 'foundBiz', { pkey: 'wirt', tier: 0, name: 'Gasthaus Zur Post' }), /nicht gründen/);
  assert.throws(() => act(s, 'foundBiz', { pkey: 'baecker', tier: 2, name: 'Backwarenfabrik X' }), /Qualifikation/);
  assert.throws(() => act(s, 'foundBiz', { pkey: 'baecker', tier: 7, name: 'Bäckerei Y' }), /Betriebsart/);
  s.money = 100;
  assert.throws(() => act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Bäckerei Arm' }), /Geld/);
  s.money = 50000000;
  const max = w.econ.companies.maxCompanies;
  s.companies = Array.from({ length: max }, (_, i) => ({ id: i + 1, pkey: 'baecker', tier: 0, name: `Firma ${i}`, cityId: s.cityId, rooms: 3, staff: 0, cash: 0, base: 1, abandoned: null }));
  s.nextCompanyId = max + 1;
  assert.throws(() => act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Bäckerei Zuviel' }), /maximale Anzahl/);
  assert.ok(biz.foundOptions(w, s).full);
});

test('foundBiz: Namen werden bereinigt, URLs/zu kurz/doppelt abgelehnt', () => {
  const s = mk('baecker');
  assert.strictEqual(biz.cleanName('  <b>Brot</b>\u0000 &​ "Haus" \n  Müller '), 'Brot Haus Müller');
  assert.strictEqual(biz.cleanName('x'.repeat(100)).length, 40);
  assert.strictEqual(biz.cleanName(null), '');
  assert.strictEqual(biz.cleanName({}), '');
  for (const bad of ['ab', '  ', '<>', 'www.billig-geld.de', 'Besuche http://x.y', 'brot.com', 'mail@x', '!!', '\u0000\u0001\u0002']) {
    assert.throws(() => act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: bad }), /Name|Internet|Wort/, JSON.stringify(bad));
  }
  assert.strictEqual(s.companies.length, 0);
  act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: 'Brotkorb' });
  assert.throws(() => act(s, 'foundBiz', { pkey: 'baecker', tier: 0, name: ' brotKORB ' }), /heißt schon so/);
});

test('foundBiz: Müll-Eingaben werfen sauber und verändern nichts', () => {
  const junk = [null, undefined, 0, 1, 'x', [], {}, { pkey: {} }, { pkey: '__proto__', tier: 0 }, { pkey: 'baecker', tier: '0; DROP' }, { pkey: 'baecker', tier: -1 }, { pkey: 'baecker', tier: 1.5 }, { pkey: 'baecker', tier: NaN }, { pkey: 'baecker', tier: 0, name: 42 }, { pkey: ['baecker'], tier: 0 }, { pkey: 'constructor', tier: 0 }];
  for (const inp of junk) {
    const s = mk('baecker'); const m = s.money;
    try { act(s, 'foundBiz', inp); } catch (e) { assert.ok(e instanceof actions.ActionError || /Betriebsart|Qualifikation|Name|nicht/.test(e.message), `${JSON.stringify(inp)}: ${e.message}`); }
    if (s.companies.length === 0) assert.strictEqual(s.money, m);
    else assert.ok(Number.isFinite(s.money) && s.money <= m);
  }
});

test('foundBiz: Maurer gründet Baufirma mit Dienstleistung', () => {
  const s = mk('maurer');
  const o = biz.foundOptions(w, s).options.find((x) => x.pkey === 'maurer');
  assert.ok(o);
  assert.ok(o.outputs.every((x) => x.service), 'Bauleistung ist eine Dienstleistung');
  assert.ok(o.inputs.some((i) => i.good === 'baustoffe'));
  act(s, 'foundBiz', { pkey: 'maurer', tier: 0, name: 'Baufirma Fundament' });
  assert.strictEqual(s.companies[0].pkey, 'maurer');
});

test('Onboarding: Hinweis „Gründe dein erstes Unternehmen“ und Freischaltung des Tabs', () => {
  const s = mk('baecker');
  const f = biz.foundOptions(w, s);
  const v = { currency: 'DM', money: s.money, meters: { fridge: 80 }, hunger: 0, status: 'alive', occupation: { kind: 'work' }, housing: { type: 'rent' }, companies: [], found: f, food: { tiers: [] }, properties: [], children: [], notices: [], flows: { net: 100, expense: 100 } };
  const adv = onboarding.advise(v, null, { startMoney: 4000 });
  const all = [adv.top, ...adv.more];
  assert.ok(all.some((x) => x.id === 'found' && x.cta.tab === 'business' && x.cta.spot === 'found'), JSON.stringify(all.map((x) => x.id)));
  const q = onboarding.QUESTS.find((x) => x.id === 'business');
  assert.strictEqual(q.title, 'Gründe dein erstes Unternehmen'); assert.strictEqual(q.tab, 'business');
  assert.ok(onboarding.unlocks(s, new Set(), false, { canFound: true }).business.open);
  assert.ok(!onboarding.unlocks(s, new Set(), false, { canFound: false }).business.open);
  v.found = { ...f, canAfford: false };
  const adv2 = onboarding.advise(v, null, { startMoney: 4000 });
  assert.ok(![adv2.top, ...adv2.more].some((x) => x.id === 'found'));
});

test('present: Ansicht enthält found und Verträge-Daten für jede Firma', () => {
  const { present } = require('../src/game/present');
  const s = mk('maurer');
  act(s, 'foundBiz', { pkey: 'maurer', tier: 0, name: 'Baufirma Test' });
  const v = present(w, s, { meta: {}, coins: 1, efs_pool: 0 }, Date.now());
  assert.ok(v.found && Array.isArray(v.found.options));
  assert.ok(v.companies[0].deals && Array.isArray(v.companies[0].deals.buys));
  assert.ok(v.companies[0].supply && v.companies[0].supply.outputs.every((o) => o.service), 'Baufirma hat nur Dienstleistungen');
});

test('Englisch: Gründungsmeldungen und Dialogtexte sind übersetzt', () => {
  const g = require('../src/i18n-game');
  for (const t of ['Bitte wähle eine Betriebsart.', 'Diese Betriebsart kannst du nicht gründen.', 'Der Name darf keine Internetadresse enthalten.', 'Eine deiner Firmen heißt schon so. Wähle einen anderen Namen.']) assert.notStrictEqual(g.tr(t), t, t);
  const k = require('../src/i18n-data/client-K');
  for (const t of ['Unternehmen gründen', 'Lieferant suchen', 'Abnehmer suchen', 'Vertrag vorschlagen', 'Meine Lieferverträge']) assert.ok(k.exact[t], t);
});

test('Asset-Version enthält Build-Kennung (Updates erreichen Spieler sofort)', () => {
  const { assetVersion } = require('../src/lib/assetver');
  const v = assetVersion(require('path').resolve(__dirname, '..'), '1.2.3');
  assert.match(v, /^1\.2\.3-[\w.-]+$/);
  assert.notStrictEqual(v, '1.2.3');
});
