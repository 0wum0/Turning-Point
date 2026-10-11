'use strict';
/** Englische Oberfläche: Handelsrouten und Transport – Servertexte (Meldungen, Fehler, Beschlüsse, Verkehrsträger, Hinweise) sind übersetzt. */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const seed = require('../src/db/seed-data');
const settings = require('../src/settings');
const { buildWorld } = require('../src/game/world');
const { createCharacter } = require('../src/game/state');
const biz = require('../src/game/business');
const goods = require('../src/game/goods');
const g = require('../src/i18n-game');
const T = require('../src/game/transport');
const TR = require('../src/game/trade');
const TP = require('../src/lib/transport-policy');
const ob = require('../src/game/onboarding');

settings.DEFAULTS.talente.effects.strength = 0;
const base = testWorld();
const extra = seed.ERA_PROFESSIONS.map((p, i) => ({ id: 1000 + i, pkey: p[0], name: p[1], category: p[2], icon: p[3], era_from: p[4], era_to: p[5], base_wage: p[6], training_days: p[7], tuition_day: p[8], academic: p[9], replaces: p[10], lodging: p[11], unlocks: p[12], description: p[13], active: 1 }));
const w = buildWorld(base.cityList, [...base.professions.values(), ...extra]);
const cid = (n) => w.cityList.find((c) => c.name === n).id;
const miss = [];
const need = (t) => { if (typeof t === 'string' && t.length > 1 && g.tr(t) === t) miss.push(t); };

test('Verkehrsträger, Gründe, Risiken und Beschlüsse sind übersetzt', () => {
  for (const m of T.C().modes) { need(m.name); need(m.note); }
  for (const k of Object.values(TP.KINDS)) { need(k.name); need(k.what); }
  for (const t of Object.values(TP.FOCUS)) need(t);
  for (const t of Object.values(TR.RISK_NAME)) need(t);
  const city = w.city(cid('Cottbus')); const world = w; const row = (o) => ({ ...o });
  for (const r of [row({ kind: 'hub', good: 'rail', val: 2, scope_city: city.id }), row({ kind: 'hub', good: 'port', val: 1, scope_city: city.id }), row({ kind: 'hub', good: 'air', val: 3, scope_city: city.id }), row({ kind: 'toll', val: 4, scope_city: city.id }), row({ kind: 'toll', val: -2, scope_city: city.id }), row({ kind: 'toll', val: 0, scope_city: city.id }), row({ kind: 'road', val: 2, region: 'Brandenburg' }), row({ kind: 'tollframe', val: 3 }), row({ kind: 'net', val: 3 })]) {
    need(TP.describe(world, r));
    for (const l of TP.previewLines(world, r, city, 1990)) need(l);
  }
  for (const o of [1, 2, 3, 5, 4, 0]) for (const p of [1, 2, 3, 4, 5].flatMap((i) => TP.powersOf(i, w, city, 1990))) { need(p.name); need(p.what); for (const x of p.options || []) need(x.label); for (const f of p.focus || []) need(f.name); void o; }
  assert.deepEqual([...new Set(miss)], []);
});

test('Fahrten: Meldungen bei Ankunft und Aussetzen, Fehler beim Anlegen, Hinweise sind übersetzt', () => {
  const s = createCharacter(w, input(w, { professionKey: 'baecker' }), { meta: {}, coins: 1, efs_pool: 0 });
  s.day = 20 * 365 + 100; s.person.birthDay = s.day - 30 * 365; s.seed = 5; s.money = 1e9; s.housing = { type: 'rent', cityId: s.cityId, base: 3000, rooms: 1 };
  const t0 = biz.tiersOf(w)[0];
  const c = { id: 1, pkey: 'kraftfahrer', tier: 0, name: 'Spedition Test', cityId: cid('Cottbus'), rooms: t0.rooms, staff: 3, manager: true, cash: 8e5, base: 1, abandoned: null }; s.companies = [c];
  s.notices = [];
  goods.setScarcity(new Map([[`${cid('Cottbus')}|eisenwaren`, 0.8], [`${cid('Dresden')}|eisenwaren`, 1.6]]));
  const old = settings.DEFAULTS.transport.risk.accident; settings.DEFAULTS.transport.risk.accident = { p: 0.5, lossMin: 10, lossMax: 30 };
  try {
    const r = TR.create(w, s, { firm: 1, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 300, interval: 8, insured: true, strict: false });
    assert.ok(r.route, r.err);
    for (let i = 0; i < 200; i++) { s.day++; TR.daily({ world: w, state: s, offline: false }); if (i === 60) c.cash = 100; if (i === 90) c.cash = 8e5; }
    for (const n of s.notices) { need(n.title); need(n.text); for (const x of n.info || []) need(x); }
    assert.ok(s.notices.length >= 3);
    for (const e of [TR.create(w, s, { firm: 9, good: 'eisenwaren', from: 1, to: 2, qty: 5 }).err, TR.create(w, s, { firm: 1, good: 'strom', from: cid('Cottbus'), to: cid('Dresden'), qty: 5 }).err, TR.create(w, s, { firm: 1, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Cottbus'), qty: 5 }).err, TR.create(w, s, { firm: 1, good: 'eisenwaren', from: cid('Cottbus'), to: cid('Dresden'), qty: 5 }).err, TR.edit(w, s, 77, {}).err, TR.remove(s, 77).err]) need(e);
    const q = T.quote(w, { from: cid('Cottbus'), to: cid('Passau'), good: 'brot', year: 1960, doy: 1, mode: 'container', env: { winter: 0, lock: 0, flood: false } }); need(q.err);
    const q2 = T.quote(w, { from: cid('Cottbus'), to: cid('Passau'), good: 'brot', year: 1960, doy: 1, mode: 'luft', env: { winter: 0, lock: 0, flood: false } }); need(q2.err);
    for (const o of q2.options) need(o.why);
    const v = { status: 'alive', currency: 'DM', meters: { fridge: 90 }, housing: { type: 'rent' }, occupation: {}, money: 1e6, companies: [], children: [], trade: { routes: [{ status: 'stopped', locked: false, trip: null, goodName: 'Eisenwaren', fromName: 'Cottbus', toName: 'Dresden' }], hint: { goodName: 'Möbel', fromName: 'Cottbus', toName: 'München', gapPct: 30, net: 5000 } } };
    const a = ob.advise(v, null, {}); need(a.top.title); need(a.top.why); for (const m of a.more) { need(m.title); need(m.why); }
    assert.deepEqual([...new Set(miss)], []);
  } finally { settings.DEFAULTS.transport.risk.accident = old; goods.setScarcity(new Map()); }
});
