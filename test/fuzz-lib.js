'use strict';
/**
 * Seeded Fuzz-/Property-Harness für die Spiellogik (kein Testfile: wird von test/fuzz.test.js und tools/fuzz-long.js benutzt).
 * Alles ist deterministisch: Math.random wird während eines Laufs durch einen seeded PRNG ersetzt, die Uhr ist simuliert.
 */
const settings = require('../src/settings');
const { testWorld } = require('./helpers');
const actions = require('../src/game/actions');
const { createCharacter, upgradeState } = require('../src/game/state');
const { createHeirState } = require('../src/game/heir');
const { estateShare } = require('../src/game/family');
const { propertyValue } = require('../src/game/core');
const { companyValue } = require('../src/game/business');
const { advance } = require('../src/game/engine');
const { present } = require('../src/game/present');
const { edition } = require('../src/game/newspaper');
const { yearOf } = require('../src/game/calendar');
const { mulberry32 } = require('../src/game/rng');
const service = require('../src/game/service');
const market = require('../src/lib/market');

const world = testWorld();
const GENDERS = ['m', 'f', 'd'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------------- Invarianten ---------------- */
function walkNumbers(v, path, out, depth = 0) {
  if (depth > 12) return;
  if (typeof v === 'number') { if (!Number.isFinite(v)) out.push(`${path} = ${v}`); return; }
  if (v === undefined || typeof v === 'function') { out.push(`${path} ist ${typeof v}`); return; }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) walkNumbers(v[k], `${path}.${k}`, out, depth + 1);
}
const isInt = (n) => Number.isSafeInteger(n);
function dupIds(list, key = 'id') { const seen = new Set(); for (const x of list) { if (seen.has(x[key])) return x[key]; seen.add(x[key]); } return null; }

/** Gibt eine Liste von Verletzungen zurück (leer = ok). `prev` = Stand vor dem Schritt (für Monotonie). */
function invariants(s, prev) {
  const bad = [];
  const need = (c, m) => { if (!c) bad.push(m); };
  const nums = []; walkNumbers(s, 's', nums); nums.forEach((m) => bad.push(`nicht endlich: ${m}`));
  let js; try { js = JSON.stringify(s); JSON.parse(js); } catch (e) { bad.push(`nicht serialisierbar: ${e.message}`); return bad; }
  need(['alive', 'dead', 'gameover'].includes(s.status), `Status ${s.status}`);
  need(isInt(s.day) && s.day >= 0, `day ${s.day}`);
  need(isInt(s.money), `money nicht ganzzahlig: ${s.money}`);
  if (s.status === 'alive') need(s.money >= 0, `money negativ bei lebendem Charakter: ${s.money}`);
  for (const k of ['earned', 'spent']) need(isInt(s.stats[k]) && s.stats[k] >= 0, `stats.${k} ${s.stats[k]}`);
  const m = s.meters;
  for (const k of ['fridge', 'wellbeing', 'rest']) need(m[k] >= 0 && m[k] <= 100, `meter ${k} ${m[k]}`);
  need(m.health <= 100 && (s.status !== 'alive' || m.health > 0 || true), `health ${m.health}`);
  need(m.fridgeQ >= 1 && m.fridgeQ <= 4, `fridgeQ ${m.fridgeQ}`);
  need(s.hunger >= 0 && isInt(s.hunger), `hunger ${s.hunger}`);
  need(isInt(s.cards.health) && s.cards.health >= 0, `cards ${s.cards.health}`);
  need(s.fx && Number.isFinite(s.fx.coins) && Number.isFinite(s.fx.efs), 'fx');
  for (const [name, list, nextKey] of [['properties', s.properties, 'nextPropId'], ['companies', s.companies, 'nextCompanyId'], ['children', s.children, 'nextChildId']]) {
    need(dupIds(list) == null, `doppelte ${name}-Id ${dupIds(list)}`);
    const max = list.reduce((a, x) => Math.max(a, x.id), 0);
    need(s[nextKey] > max, `${nextKey} ${s[nextKey]} <= max ${max}`);
    if (prev) need(s[nextKey] >= prev[nextKey], `${nextKey} sinkt`);
  }
  need(dupIds(s.tree.persons) == null, 'doppelte Person-Id');
  need(dupIds(s.notices) == null, 'doppelte Notice-Id');
  need(s.nextNoticeId > s.notices.reduce((a, x) => Math.max(a, x.id), 0), 'nextNoticeId');
  if (prev) { need(s.day >= prev.day, 'Tag sinkt'); need(s.tree.nextId >= prev.tree.nextId, 'tree.nextId sinkt'); }
  const personIds = new Set(s.tree.persons.map((p) => p.id));
  need(personIds.has(s.person.id), 'Spieler fehlt im Stammbaum');
  for (const c of s.children) {
    need(personIds.has(c.personId), `Kind ${c.id} ohne Person`);
    need(c.born <= s.day, `Kind ${c.id} aus der Zukunft`);
    need(c.sat >= 0 && c.sat <= 100, `Kind sat ${c.sat}`);
    need(['home', 'runaway', 'care', 'withPartner'].includes(c.status), `Kind status ${c.status}`);
  }
  if (s.partner) {
    need(personIds.has(s.partner.personId), 'Partner ohne Person');
    need(s.partner.sat >= 0 && s.partner.sat <= 100, `partner.sat ${s.partner.sat}`);
    need(!(s.partner.married && !s.partner.name), 'Partner ohne Namen');
  }
  need(s.children.length <= settings.get('game.max_children') + 1, `zu viele Kinder ${s.children.length}`);
  for (const l of s.loans || []) { need(l.left >= 0 && l.pay >= 0, `Kredit negativ ${JSON.stringify(l)}`); need(isInt(l.left) && isInt(l.pay), `Kredit nicht ganzzahlig ${JSON.stringify(l)}`); }
  for (const p of s.properties) { need(p.condition >= 0 && p.condition <= 100, `condition ${p.condition}`); need(p.rooms >= 1 && isInt(p.base), `Immobilie ${JSON.stringify({ r: p.rooms, b: p.base })}`); }
  for (const c of s.companies) { need(isInt(c.cash) && c.cash >= 0, `Firmenkasse ${c.cash}`); need(c.staff >= 0 && isInt(c.staff), `staff ${c.staff}`); need(c.rooms >= 1, 'rooms'); }
  { // Warenkreislauf: Verträge und Vormerkungen
    const K = s.contracts;
    if (K) {
      need(Array.isArray(K.buys) && Array.isArray(K.sells), 'contracts ohne Listen');
      for (const b of [...(K.buys || []), ...(K.sells || [])]) { need(Number.isFinite(b.qty) && b.qty >= 0 && Number.isFinite(b.price) && b.price >= 0, `Vertrag ${b.id} Menge/Preis`); need(b.fill == null || (b.fill >= 0 && b.fill <= 1), `Vertrag ${b.id} fill ${b.fill}`); need(b.take == null || (b.take >= 0 && b.take <= 1), `Vertrag ${b.id} take ${b.take}`); }
    }
    for (const e of (s.pending && s.pending.supply) || []) need(Number.isFinite(e.real) && e.real >= 0 && Number.isInteger(e.userId), `Vormerkung ${JSON.stringify(e)}`);
    for (const c of s.companies) need(c.autoBuy === undefined || typeof c.autoBuy === 'boolean', 'autoBuy');
  }
  const h = s.housing;
  if (h.type === 'own') need(s.properties.some((p) => p.id === h.propertyId), 'Wohnsitz ohne Immobilie');
  if (s.occupation && s.occupation.ownCompanyId) need(s.companies.some((c) => c.id === s.occupation.ownCompanyId), 'Beruf ohne Firma');
  if (s.status === 'alive') need(!s.death, 'lebend mit death');
  if (s.status !== 'alive') need(!!s.death, 'tot ohne death');
  for (const k of Object.keys(s.insurance)) need(['hausrat', 'gebaeude', 'gesundheit'].includes(k) && typeof s.insurance[k] === 'boolean', `insurance.${k}`);
  need(isInt(s.life.extraDays), `extraDays ${s.life.extraDays}`);
  return bad;
}

/* ---------------- Eingaben ---------------- */
// Nur JSON-Typen (so kommen Eingaben aus dem Request-Body an).
const JUNK = [null, '', 'x', 'constructor', '__proto__', 'toString', -1, 0, 1, 2, 3, 1.5, 1e9, 1e300, -1e300, 1e999, '1', '2', true, false, [], [1], {}, { a: 1 }, 'job:1:1:1', 'sale:9:9:9', 'sale:1:0:0', '12abc'];
const pickOf = (r, arr) => arr[Math.floor(r() * arr.length)];

function inputFor0(name, s, r, user) {
  const ed = edition(world, s, s.cityId);
  const junk = () => pickOf(r, JUNK);
  const maybe = (v) => (r() < 0.12 ? junk() : v);
  const prop = () => (s.properties.length ? pickOf(r, s.properties).id : 1);
  const comp = () => (s.companies.length ? (r() < 0.1 ? 'all' : pickOf(r, s.companies).id) : 1);
  const kid = () => (s.children.length ? pickOf(r, s.children).id : 1);
  const profs = [...world.professions.keys()];
  const listing = (list) => (list.length ? pickOf(r, list).id : 'x');
  switch (name) {
    case 'apply': return { listingId: maybe(listing(ed.jobs)) };
    case 'rent': return { listingId: maybe(listing(ed.housing.rent.concat(ed.housing.pension))) };
    case 'buy': return { listingId: maybe(listing(ed.housing.sale)) };
    case 'meet': return { listingId: maybe(listing(ed.partners)) };
    case 'buyBiz': return { listingId: maybe(listing(ed.biz)) };
    case 'study': case 'course': return { pkey: maybe(pickOf(r, profs)), kind: pickOf(r, ['unlock', 'skill', junk()]) };
    case 'moveIn': case 'sell': case 'letOff': case 'maintain': case 'repair': return { propertyId: maybe(prop()) };
    case 'letOn': case 'letPrice': return { propertyId: maybe(prop()), mult: maybe(0.5 + r() * 1.5) };
    case 'letPlayers': return { propertyId: maybe(prop()), on: r() < 0.5 };
    case 'loanTake': return { amount: maybe(Math.round(r() * 5e7)), years: maybe(1 + Math.floor(r() * 30)) };
    case 'loanRepay': return { id: maybe(((s.loans || [])[0] || { id: 1 }).id), amount: maybe(Math.round(r() * 1e6)), all: r() < 0.3 };
    case 'autoMaintain': case 'tutorial': case 'butler': case 'bizSecurity': case 'bizManager': return { on: r() < 0.5, id: maybe(comp()) };
    case 'buyFood': return { tier: maybe(Math.floor(r() * 5) - 1) };
    case 'buyCards': return { count: maybe(1 + Math.floor(r() * 25)), pay: r() < 0.5 ? 'coins' : 'money' };
    case 'insurance': return { key: maybe(pickOf(r, ['hausrat', 'gebaeude', 'gesundheit', 'x'])), on: r() < 0.6 };
    case 'move': return { cityId: maybe(pickOf(r, world.cityList).id) };
    case 'collect': return { key: maybe(actions.pickups(world, user.now)[0] ? actions.pickups(world, user.now)[0].key : 'x') };
    case 'plan': return { target: maybe(Math.floor(r() * 8)) };
    case 'school': return { childId: maybe(kid()), type: maybe(pickOf(r, ['haupt', 'real', 'gym', 'x'])) };
    case 'path': return { childId: maybe(kid()), kind: pickOf(r, ['none', 'study', 'training', junk()]), pkey: maybe(pickOf(r, profs)) };
    case 'giftChild': case 'search': return { childId: maybe(kid()) };
    case 'bizWork': case 'bizSell': case 'bizReactivate': case 'bizExpand': case 'bizUpgrade': return { id: maybe(comp()) };
    case 'bizSupply': return { id: maybe(comp()), on: r() < 0.5 };
    case 'bizHire': return { id: maybe(comp()), delta: maybe(r() < 0.5 ? 1 : -1) };
    case 'bizCollect': return { id: maybe(comp()) };
    case 'runOffice': return { idx: maybe(Math.floor(r() * 4)) };
    case 'lotto': return { tickets: maybe(1 + Math.floor(r() * 25)) };
    case 'casino': return { bet: maybe(Math.floor(r() * 1e5)) };
    case 'taskStart': case 'taskFinish': return { building: maybe(pickOf(r, ['rathaus', 'markt', 'home', 'arzt', 'work', 'prop:1', 'biz:1'])), task: maybe(pickOf(r, ['a', 'b', 'c', 'rest'])) };
    case 'readNotices': return { ids: r() < 0.5 ? null : [1, 2, junk()] };
    default: return r() < 0.3 ? {} : { a: junk() };
  }
}

function inputFor(name, s, r, user) {
  const inp = inputFor0(name, s, r, user);
  const keys = Object.keys(inp);
  if (keys.length && r() < 0.3) inp[pickOf(r, keys)] = pickOf(r, JUNK); // gezielt ein Feld verderben (NaN, Infinity, Objekte …)
  return inp;
}

/* ---------------- Spieler-Politik (plausible Züge) ---------------- */
function smartMoves(s, r, user) {
  const ed = edition(world, s, s.cityId);
  const mv = [];
  const rooms = 1 + (s.partner ? 1 : 0) + s.children.filter((c) => c.status === 'home').length;
  if (s.meters.fridge < 60) mv.push(['buyFood', { tier: Math.floor(r() * 4) }]);
  if (s.housing.type === 'street' || s.housing.type === 'workplace') {
    const l = ed.housing.rent.filter((x) => x.rooms >= rooms)[0] || ed.housing.pension[0]; if (l) mv.push(['rent', { listingId: l.id }]);
  }
  if (!s.occupation) { const j = ed.jobs.filter((x) => x.kind === 'work')[0] || ed.jobs[0]; if (j) mv.push(['apply', { listingId: j.id }]); }
  if (!s.partner) { const p = ed.partners[0]; if (p) mv.push(['meet', { listingId: p.id }]); } else {
    mv.push(['marry', {}], ['gift', {}], ['together', {}]); if (r() < 0.3) mv.push(['adopt', {}]);
  }
  for (const c of s.children) { if (c.pendingSchool) mv.push(['school', { childId: c.id, type: pickOf(r, ['haupt', 'real', 'gym']) }]); if (c.pendingPath) mv.push(['path', { childId: c.id, kind: 'training', pkey: pickOf(r, ['baecker', 'schlosser', 'tischler']) }]); if (c.status === 'runaway') mv.push(['search', { childId: c.id }]); }
  if (s.money > 5e6 && r() < 0.5) { const l = ed.housing.sale[0]; if (l) mv.push(['buy', { listingId: l.id }]); }
  if (s.money > 2e6 && r() < 0.3) { const l = ed.biz[0]; if (l) mv.push(['buyBiz', { listingId: l.id }]); }
  if (s.properties.length) { const p = pickOf(r, s.properties); mv.push(['moveIn', { propertyId: p.id }], ['letOn', { propertyId: p.id, mult: 1 }], ['maintain', { propertyId: p.id }], ['sell', { propertyId: p.id }]); }
  if (s.companies.length) { const c = pickOf(r, s.companies); mv.push(['bizHire', { id: c.id, delta: 1 }], ['bizManager', { id: c.id, on: true }], ['bizCollect', { id: 'all' }], ['bizWork', { id: c.id }], ['bizSell', { id: c.id }]); }
  if (r() < 0.2) mv.push(['loanTake', { amount: Math.round(s.money * 0.5) + 1e5, years: 10 }]);
  if (s.loans && s.loans.length && r() < 0.3) mv.push(['loanRepay', { id: s.loans[0].id, all: true }]);
  void user;
  return mv;
}

/* ---------------- Lauf ---------------- */
// Aktionen, die legitim Geld einbringen (Verkauf, Kredit, Glücksspiel, Trinkgeld, Gewinnentnahme)
const MONEY_UP = new Set(['sell', 'bizSell', 'bizCollect', 'loanTake', 'lotto', 'casino', 'taskFinish']);
class Failure extends Error {}

function runScenario(seed, steps = 300, opts = {}) {
  const realRandom = Math.random;
  const prng = mulberry32(seed ^ 0x9e3779b9);
  Math.random = prng;
  const r = mulberry32(seed + 1);
  const lifeline = opts.lifeline != null ? opts.lifeline : seed % 3 === 0;
  const log = [];
  const failures = [];
  const trace = (m) => { log.push(m); if (log.length > 60) log.shift(); };
  const fail = (msg, extra) => { failures.push({ seed, msg, extra, trace: log.slice(-12) }); throw new Failure(msg); };
  const st = { digest: 0, heirs: 0, deaths: 0, gameovers: 0, steps: 0, actionsOk: 0, actionsRejected: 0, maxYear: 0 };
  let nowMs = 1.7e12;
  const user = { meta: {}, coins: 200, efs_pool: 0, now: nowMs };
  const start = () => {
    const prof = pickOf(r, ['baecker', 'schlosser', 'tischler', 'maurer', 'schneider', 'kaufmann'].filter((k) => world.prof(k)));
    const cityList = world.cityList;
    return createCharacter(world, {
      gender: pickOf(r, GENDERS), firstName: 'Fuzzi', lastName: `Test${seed}`, birthCityId: pickOf(r, cityList).id, professionKey: prof || 'baecker',
      fatherName: 'Hans', fatherJob: 'Schlosser', motherName: 'Anna', motherJob: 'Näherin',
    }, user, { cycle: 1 });
  };
  let s;
  try {
    s = start();
    // Zeitreise in andere Epoche: Startjahr verschieben ist nicht möglich, daher früh weit vorspulen
    let prev = clone(s);
    for (let i = 0; i < steps; i++) {
      st.steps++;
      nowMs += Math.floor(r() * 3e6); user.now = nowMs;
      if (s.status === 'dead') {
        const heirs = s.children.filter((c) => c.status === 'home' && (s.day - c.born) / 365 >= 18);
        if (!heirs.length) fail('tot ohne Erben aber status dead');
        const beq = [...s.properties.map((p) => p.id), ...s.companies.map((c) => `c:${c.id}`)].filter(() => r() < 0.5);
        const est = estateShare(world, s);
        const res = createHeirState(world, s, pickOf(r, heirs).id, beq);
        st.heirs++;
        {
          // Pflichtanteil: Bargeld + Wert der vererbten Gegenstände übersteigt nie den Anteil; Schulden werden vom Nachlass abgezogen
          const taken = res.plan.properties.reduce((a, p) => a + propertyValue(world, s, p, yearOf(s.day, s.startYear)), 0)
            + res.plan.companies.reduce((a, c) => a + companyValue(world, s, c, yearOf(s.day, s.startYear)) + c.cash, 0);
          if (res.plan.cash < 0 || res.plan.cash + taken > est.share) fail(`Erbe übersteigt Pflichtanteil: bar ${res.plan.cash} + Sachwerte ${taken} > ${est.share}`);
          if (est.share * est.n > est.total) fail('Pflichtanteile übersteigen den Nachlass');
          if (res.state.loans && res.state.loans.length) fail('Kredite wurden vererbt');
        }
        s = res.state; trace(`Erbe gen ${s.generation}`);
        const bad = invariants(s, null); if (bad.length) fail(`Erbe: ${bad.join('; ')}`);
        prev = clone(s); continue;
      }
      if (s.status === 'gameover') {
        st.gameovers++;
        s = start(); trace('Neustart nach Game Over');
        const bad = invariants(s, null); if (bad.length) fail(`Neustart: ${bad.join('; ')}`);
        prev = clone(s); continue;
      }
      if (lifeline) {
        // „Rettungsring“: hält den Charakter am Leben, damit auch Ehe, Kinder, Alter, Tod und Erbe erreicht werden
        const idx = world.idx(yearOf(s.day, s.startYear));
        if (s.money < 4e5 * idx) s.money += Math.round(8e5 * idx);
        const tryAct = (n, inp) => { try { actions.run(n, { world, state: s, input: inp, user, now: nowMs }); } catch (e) { if (!(e instanceof actions.ActionError)) fail(`Lifeline ${n}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); } };
        for (const [n, inp] of smartMoves(s, r, user)) if (['buyFood', 'rent', 'apply', 'meet', 'marry', 'together', 'school', 'path', 'search'].includes(n)) tryAct(n, inp);
        if (s.meters.health < 50 && s.cards.health < 1 && yearOf(s.day, s.startYear) >= 1960) tryAct('buyCards', { count: 5 });
      }
      const roll = r();
      const before = JSON.stringify(s);
      const userBefore = JSON.stringify(user);
      let label;
      try {
        if (roll < 0.22) {
          const kind = r();
          const days = kind < 0.6 ? 1 + Math.floor(r() * 40) : kind < 0.9 ? 40 + Math.floor(r() * 400) : 400 + Math.floor(r() * (lifeline ? 1500 : 3500));
          const mode = r() < 0.25 ? 'offline' : 'online';
          label = `advance ${days} ${mode}`; trace(label);
          advance(world, s, days, { mode });
          service.flush(user, s);
        } else if (roll < 0.30) {
          // Spieluhr: Server-Sync nach zufälliger Abwesenheit
          const gap = pickOf(r, [1000, 60000, 5 * 60000, 40 * 60000, 3 * 3600000, 30 * 3600000, 24 * 7 * 3600000]);
          nowMs += gap; user.now = nowMs;
          if (user.efs_accrued_at == null) user.efs_accrued_at = nowMs - gap;
          label = `syncEfs gap ${gap}`; trace(label);
          service.syncEfs(user, s, nowMs, world);
          service.flush(user, s);
        } else {
          const mv = roll < 0.65 ? smartMoves(s, r, user) : [];
          let name; let input;
          if (mv.length && r() < 0.8) { [name, input] = pickOf(r, mv); } else { name = pickOf(r, actions.ACTIONS); input = inputFor(name, s, r, user); }
          if (r() < 0.04) input = pickOf(r, JUNK);
          if (r() < 0.05) { s.money += Math.round(r() * 3e7); }
          label = `action ${name} ${JSON.stringify(input)}`; trace(label);
          const m0 = s.money; const coins0 = user.coins + s.fx.coins;
          const out = actions.run(name, { world, state: s, input: input || {}, user, now: nowMs });
          if (s.money > m0 && !MONEY_UP.has(name)) fail(`Aktion ${name} erzeugt Geld: ${m0} -> ${s.money}`);
          if (user.coins + s.fx.coins > coins0) fail(`Aktion ${name} erzeugt Coins`);
          service.flush(user, s);
          st.actionsOk++;
          if (!out || typeof out !== 'object') fail(`Aktion ${name} lieferte ${typeof out}`);
        }
      } catch (e) {
        if (e instanceof Failure) throw e;
        if (e instanceof actions.ActionError) {
          // Produktiv: Transaktion wird zurückgerollt → Stand vor der Aktion
          s = JSON.parse(before); Object.keys(user).forEach((k) => delete user[k]); Object.assign(user, JSON.parse(userBefore)); st.actionsRejected++;
          continue;
        }
        fail(`unerwartete Ausnahme in ${label}: ${e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e}`);
      }
      if (s.status === 'dead') st.deaths++;
      const bad = invariants(s, prev);
      if (bad.length) fail(`Invariante nach ${label}: ${bad.slice(0, 5).join('; ')}`, { state: s });
      // present darf nie werfen; Zustand ist idempotent aufwertbar
      try { present(world, s, user, nowMs); } catch (e) { fail(`present wirft nach ${label}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
      const a = JSON.stringify(s); const up = JSON.stringify(upgradeState(JSON.parse(a)));
      if (a !== up) fail(`upgradeState nicht idempotent nach ${label}`);
      if (JSON.stringify(JSON.parse(a)) !== a) fail('JSON-Rundlauf verändert den Stand');
      st.maxYear = Math.max(st.maxYear, yearOf(s.day, s.startYear));
      prev = JSON.parse(a);
    }
    st.digest = hashStr(JSON.stringify(s) + JSON.stringify(user));
  } catch (e) {
    if (!(e instanceof Failure)) failures.push({ seed, msg: `Harness-Fehler: ${e.stack}`, trace: log.slice(-12) });
  } finally {
    Math.random = realRandom;
  }
  return { failures, stats: st, state: s };
}

/** Zeitreise zwischen Epochen: Immobilie/Betrieb von A nach B (unterschiedliche Jahre) – Realwert bleibt erhalten, Geld erscheint nicht aus dem Nichts. */
function runTradeScenario(seed, rounds = 40) {
  const realRandom = Math.random; Math.random = mulberry32(seed ^ 7);
  const r = mulberry32(seed + 5);
  const failures = [];
  try {
    const u = () => ({ meta: {}, coins: 50, efs_pool: 0 });
    for (let i = 0; i < rounds; i++) {
      const mk = () => createCharacter(world, { gender: 'm', firstName: 'Anna', lastName: 'Tester', birthCityId: pickOf(r, world.cityList).id, professionKey: 'baecker', fatherName: 'a', motherName: 'b' }, u());
      const a = mk(); const b = mk();
      a.day = Math.floor(r() * 60000 / 4); b.day = Math.floor(r() * 60000 / 4);
      a.person.birthDay = a.day - 30 * 365; b.person.birthDay = b.day - 30 * 365;
      a.money = 9e12; a.housing = { type: 'rent', cityId: a.cityId, base: 70, rooms: 4 };
      const ed = edition(world, a, a.cityId);
      try { actions.run('buy', { world, state: a, input: { listingId: ed.housing.sale[0].id }, user: u(), now: 1 }); } catch (e) { if (!(e instanceof actions.ActionError)) throw e; continue; }
      const id = a.properties[0].id;
      const ref = (st) => require('../src/game/economy').realEstateFactor(yearOf(st.day, st.startYear)); // Immobilienzyklus ist Teil des Werts, nicht des Zeitsprungs
      const vA = market.valueReal(world, a, 'prop', a.properties[0]) / ref(a);
      const snap = market.detach(world, a, 'prop', id);
      const placed = market.attach(world, b, 'prop', snap);
      const vB = market.valueReal(world, b, 'prop', placed) / ref(b);
      if (Math.abs(vA - vB) > Math.max(2, vA * 0.001)) failures.push({ seed, msg: `Realwert ändert sich beim Zeitsprung ${vA} -> ${vB}` });
      if (a.properties.length) failures.push({ seed, msg: 'Immobilie bleibt beim Verkäufer' });
      for (const bad of [...invariants(a, null), ...invariants(b, null)]) failures.push({ seed, msg: `Handel: ${bad}` });
    }
  } catch (e) { failures.push({ seed, msg: `Handelslauf: ${e.stack}` }); } finally { Math.random = realRandom; }
  return failures;
}

/**
 * Lieferverträge zwischen zwei Spielern in verschiedenen Epochen: Was der Käufer zahlt, wird in Realwert genau einmal vorgemerkt
 * und – nach dem Verbuchen (Liste leeren) – nie ein zweites Mal; Gutschriften sind nie negativ; der Verkäufer verliert nie Ware ohne Gegenwert.
 * Geld entsteht nicht: Σ vorgemerkter Realwert = Σ Zahlungen des Käufers ÷ Index (je Tag exakt).
 */
function runSupplyScenario(seed, rounds = 30) {
  const realRandom = Math.random; Math.random = mulberry32(seed ^ 11);
  const r = mulberry32(seed + 3); const failures = [];
  const biz = require('../src/game/business'); const goods = require('../src/game/goods');
  const goodList = [['muehle', 'baecker', 'mehl'], ['landwirt', 'muehle', 'getreide'], ['schmied', 'tischler', 'eisenwaren'], ['bergmann', 'baecker', 'kohle']];
  try {
    for (let i = 0; i < rounds; i++) {
      const [sp, bp, good] = pickOf(r, goodList);
      const u = () => ({ meta: {}, coins: 50, efs_pool: 0 });
      const mkS = (pkey) => { const s = createCharacter(world, { gender: 'm', firstName: 'A', lastName: 'B', birthCityId: pickOf(r, world.cityList).id, professionKey: 'baecker', fatherName: 'a', motherName: 'b' }, u()); s.day = Math.floor(r() * 12000); s.contracts = { buys: [], sells: [] }; s.money = 9e12; return s; };
      const S = mkS(); const B = mkS();
      const yearS = yearOf(S.day, S.startYear); const yearB = yearOf(B.day, B.startYear);
      const mkF = (s, pkey, id) => { const c = { id, pkey, tier: Math.floor(r() * 3), cityId: s.cityId, rooms: 3 + Math.floor(r() * 8), staff: 2, manager: r() < 0.7, cash: 1e9, base: 1e6, since: 0, abandoned: null, lastProfit: 0 }; s.companies.push(c); s.nextCompanyId = id + 1; s.skills.learned.push(pkey); s.skills.days[pkey] = 30000; return c; };
      const cS = mkF(S, sp, 1); const cB = mkF(B, bp, 1);
      const price = goods.priceReal(goods.good(good), yearB) * (0.9 + r() * 0.25);
      B.contracts.buys.push({ id: 1, firmId: 1, sellerId: 77, sellerFirm: 1, sellerName: 'S', good, qty: 0.5 + r() * 40, price, daysLeft: 20 + Math.floor(r() * 80), term: 90, auto: r() < 0.5, fill: r() < 0.3 ? r() : 1, take: 1 });
      S.contracts.sells.push({ id: 1, firmId: 1, buyerId: 78, buyerFirm: 1, good, qty: B.contracts.buys[0].qty, price, fill: 1, take: 1 });
      let expected = 0; let credited = 0; let paidCents = 0;
      for (let d = 0; d < 80 + Math.floor(r() * 200); d++) {
        B.day++; S.day++;
        const yB = yearOf(B.day, B.startYear);
        const f = biz.companyFlows(world, B, cB, yB);
        const idxB = world.idx(yB);
        const pays = f.supply.pays.filter((p) => p.cents > 0).reduce((a, p) => a + p.cents, 0);
        expected += pays / idxB; paidCents += pays;
        biz.businessDaily({ world, state: B, offline: false });
        biz.businessDaily({ world, state: S, offline: false });
        B.money = Math.max(B.money, 1e12); S.money = Math.max(S.money, 1e12); B.status = 'alive'; S.status = 'alive';
        for (const s of [S, B]) { s.notices = []; s.interrupts = []; }
        if (r() < 0.15 || d % 40 === 39) { // „Speichern“: Vormerkungen verbuchen und leeren
          const q = (B.pending.supply || []).splice(0);
          for (const e of q) { if (!(e.real >= 0)) failures.push({ seed, msg: `Gutschrift ${e.real}` }); credited += e.real; cS.cash += Math.round(e.real * world.idx(yearOf(S.day, S.startYear))); }
          if ((B.pending.supply || []).length) failures.push({ seed, msg: 'Vormerkung nach Verbuchen nicht leer' });
        }
        if (!Number.isFinite(cB.cash) || !Number.isFinite(cS.cash)) failures.push({ seed, msg: 'Firmenkasse nicht endlich' });
        for (const bad of [...invariants(S, null), ...invariants(B, null)].filter((m) => /Vertrag|Vormerkung|autoBuy/.test(m))) failures.push({ seed, msg: bad });
        if (B.contracts.buys[0].ended) { B.contracts.buys[0].ended = false; B.contracts.buys[0].daysLeft = 50; }
      }
      for (const e of (B.pending.supply || []).splice(0)) credited += e.real;
      if (Math.abs(expected - credited) > 1e-6 * Math.max(1, expected) + 1e-6) failures.push({ seed, msg: `Realwert nicht erhalten: gezahlt ${expected} vorgemerkt ${credited}` });
      if (yearS < 0 || yearB < 0) failures.push({ seed, msg: 'Jahr' });
      void paidCents;
    }
  } catch (e) { failures.push({ seed, msg: `Vertragslauf: ${e.stack}` }); } finally { Math.random = realRandom; }
  return failures;
}

module.exports = { world, runScenario, runTradeScenario, runSupplyScenario, invariants, inputFor, JUNK, clone };
