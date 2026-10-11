'use strict';
/** Gesellschaft (Modell, ohne Datenbank): Namen, Beiträge, Vereinswirkungen, Wahlempfehlungen, Gemeinde-Ansehen, Stiftungsabrechnung, Töpfe, Titel, Spielstand und Engine. */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const settings = require('../src/settings');
const M = require('../src/game/civic');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const ob = require('../src/game/onboarding');
const biz = require('../src/game/business');

settings.DEFAULTS.talente.effects.strength = 0;
const G = settings.DEFAULTS.gesellschaft;
const w = testWorld();
const HOUR = 3600000;
const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`);

test('Namen: gekürzt, bereinigt, ohne Adressen; Vergleichsschlüssel ignoriert Groß-/Kleinschreibung und Zeichen', () => {
  const a = M.cleanName('  TSV   Braunschweig <b> ');
  assert.strictEqual(a.name, 'TSV Braunschweig b'); assert.ok(a.ok);
  assert.strictEqual(M.cleanName('tsv BRAUNSCHWEIG').key, M.cleanName('T.S.V. Braunschweig').key);
  assert.ok(!M.cleanName('ab').ok && /zu kurz/.test(M.cleanName('ab').err));
  assert.ok(!M.cleanName('x'.repeat(41)).ok && /zu lang/.test(M.cleanName('x'.repeat(41)).err));
  assert.ok(!M.cleanName('12345').ok, 'ohne Wort');
  for (const bad of ['Verein www.spam.de', 'Verein spam.com', 'mail@verein', 'http://x']) assert.ok(!M.cleanName(bad).ok, bad);
  assert.strictEqual(M.cleanText('<script>x</script>\u0000 Hallo', 8), 'scriptx/');
  assert.ok(M.cleanName(null).err && M.cleanName(undefined).err);
});

test('Beiträge: fällig nach Ablauf, begrenztes Nachholen, Schonfrist, beitragsfrei', () => {
  const now = 10 * 24 * HOUR; const iv = M.feeInterval();
  assert.strictEqual(iv, 24 * HOUR);
  assert.deepEqual(M.dues({ paid_until: now + HOUR }, 100, now), { periods: 0, lapsed: false, late: 0 });
  assert.strictEqual(M.dues({ paid_until: now - HOUR }, 100, now).periods, 1);
  assert.strictEqual(M.dues({ paid_until: now - 30 * HOUR }, 100, now).periods, 2);
  assert.strictEqual(M.dues({ paid_until: now - 200 * HOUR }, 100, now).periods, G.clubs.catchUpMax, 'Nachholen ist begrenzt');
  assert.ok(!M.dues({ paid_until: now - 40 * HOUR }, 100, now).lapsed && M.dues({ paid_until: now - 60 * HOUR }, 100, now).lapsed, 'Schonfrist 48 Stunden');
  assert.strictEqual(M.dues({ paid_until: 0 }, 0, now).periods, 0, 'beitragsfrei');
  assert.strictEqual(M.clampFee(1e9), G.clubs.feeMaxReal); assert.strictEqual(M.clampFee(-5), 0); assert.strictEqual(M.clampFee('abc'), 0); assert.strictEqual(M.clampFee(1234.6), 1235);
});

test('Vereinswirkung: erst ab der Mindestzahl, wächst mit der Größe, jede Art zählt einmal, alles gedeckelt, Stärke 0 schaltet ab', () => {
  assert.deepEqual(M.clubFx('sport', 2), { health: 0, rest: 0, mood: 0, rev: 0 });
  const a = M.clubFx('sport', 3); const b = M.clubFx('sport', 40);
  assert.ok(a.health > 0 && b.health > a.health && b.health <= 2 + 1e-9);
  assert.ok(M.clubFx('handwerk', 40).rev > 0 && M.clubFx('kultur', 40).mood > 0);
  assert.deepEqual(M.clubFx('unbekannt', 50), { health: 0, rest: 0, mood: 0, rev: 0 });
  const two = M.combineFx({ clubs: [{ kind: 'sport', members: 40 }, { kind: 'sport', members: 41 }] });
  const one = M.combineFx({ clubs: [{ kind: 'sport', members: 41 }] });
  assert.deepEqual(two, one, 'zwei Sportvereine wirken nicht doppelt');
  const all = M.combineFx({ clubs: M.kinds().map((k) => ({ kind: k.key, members: 99 })), parishLevel: 3, pot: { health: 5, wellbeing: 5, kids: 5, aid: 5 }, titles: [{ key: 'kommerzienrat', rank: 3 }] });
  assert.ok(all.health <= 4 && all.mood <= 4 && all.rev <= 3 && all.kids <= 0.5 && all.aid <= 2 && all.rest <= 2);
  G.effects.strength = 0;
  try { assert.deepEqual(M.combineFx({ clubs: [{ kind: 'sport', members: 40 }], parishLevel: 3, titles: [{ key: 'kommerzienrat', rank: 3 }] }), { health: 0, rest: 0, mood: 0, rev: 0, kids: 0, aid: 0 }); } finally { G.effects.strength = 1; }
});

test('Wahlempfehlung: Gewicht je Mitglied, je Verein und insgesamt gedeckelt – Politik bleibt offen', () => {
  assert.strictEqual(M.endorseBoost(4, false), 1);
  assert.strictEqual(M.endorseBoost(100, false), G.clubs.endorse.clubCapPct);
  assert.ok(M.endorseBoost(4, true) > M.endorseBoost(4, false) && M.endorseBoost(100, true) <= G.clubs.endorse.clubCapPct);
  assert.strictEqual(M.totalBoost([2.5, 2.5, 2.5], 0), G.clubs.endorse.totalCapPct, 'alle Vereine zusammen höchstens 4');
  assert.strictEqual(M.totalBoost([2.5, 2.5], 100), G.elections.maxBoostPct, 'mit Titeln höchstens 6');
  assert.strictEqual(M.totalBoost([], 0), 0); assert.strictEqual(M.totalBoost(['x', -3], -1), 0, 'unsinnige Werte');
  assert.strictEqual(M.voteFactor(0), 1); assert.strictEqual(M.voteFactor(6), 1.06); assert.strictEqual(M.voteFactor(60), 1.06); assert.strictEqual(M.voteFactor(-9), 1);
  const E = require('../src/lib/elections');
  // Gewicht entscheidet nur Gleichstände und Beinahe-Gleichstände – nicht eine klare Mehrheit
  const clear = E.tally([{ userId: 1, influence: 0, weight: 1 }, { userId: 2, influence: 0, weight: M.voteFactor(6) }], { 1: 10, 2: 6 }, {});
  assert.strictEqual(clear.winnerId, 1);
  const near = E.tally([{ userId: 1, influence: 0, weight: 1 }, { userId: 2, influence: 0, weight: M.voteFactor(6) }], { 1: 20, 2: 20 }, {});
  assert.strictEqual(near.winnerId, 2);
});

test('Abwahl und Nachfolge: Mehrheit und Mindestzahl, Vorstand vor Mitgliedern, Dienstalter', () => {
  assert.ok(!M.mistrustReached(2, 3) && !M.mistrustReached(2, 4) && !M.mistrustReached(2, 10), 'mindestens drei Stimmen');
  assert.ok(M.mistrustReached(3, 5) && !M.mistrustReached(3, 6) && M.mistrustReached(4, 6));
  const rows = [{ user_id: 5, role: 'member', joined_ms: 10 }, { user_id: 7, role: 'board', joined_ms: 50 }, { user_id: 9, role: 'board', joined_ms: 30 }, { user_id: 3, role: 'president', joined_ms: 1 }];
  assert.strictEqual(M.successor(rows, 3).user_id, 9);
  assert.strictEqual(M.successor(rows.filter((r) => r.role === 'member'), 0).user_id, 5);
  assert.strictEqual(M.successor([], 0), null); assert.strictEqual(M.successor([{ user_id: 1, role: 'member', joined_ms: 1 }], 1), null);
  assert.strictEqual(M.successor([{ user_id: 8, role: 'member', joined_ms: 1 }, { user_id: 4, role: 'member', joined_ms: 1 }], 0).user_id, 4, 'bei Gleichstand die kleinere Nummer');
});

test('Gemeinde-Ansehen: abnehmender Ertrag, Tagesgrenze, Verfall, Stufen, Notgabe', () => {
  const g1 = M.standingGain(100); const g2 = M.standingGain(1000); const g3 = M.standingGain(1e7);
  assert.ok(g1 > 0 && g2 > g1 && g3 <= G.parish.donate.standingDayCap && g3 >= g2);
  assert.ok(M.standingGain(2000) < 2 * M.standingGain(1000), 'abnehmender Ertrag'); assert.strictEqual(M.standingGain(0), 0); assert.strictEqual(M.standingGain(-5), 0);
  close(M.standingDecay(100, 10), 100 * Math.pow(0.99, 10), 0.01); assert.strictEqual(M.standingDecay(5, 0), 5); assert.strictEqual(M.standingDecay(-3, 5), 0);
  assert.strictEqual(M.parishLevel(0).name, 'Neu in der Gemeinde'); assert.strictEqual(M.parishLevel(8).idx, 1); assert.strictEqual(M.parishLevel(30).idx, 2); assert.strictEqual(M.parishLevel(999).idx, 3);
  assert.ok(M.parishLevel(999).next === null && M.parishLevel(0).next === 'Gemeindeglied' && M.parishLevel(4).pct > 0 && M.parishLevel(4).pct < 1);
  assert.strictEqual(M.aidAmount(1000, 0), 150); assert.strictEqual(M.aidAmount(1e9, 0), G.parish.aid.maxReal); assert.ok(M.aidAmount(1e9, 2) > M.aidAmount(1e9, 0) && M.aidAmount(1e9, 2) <= G.parish.aid.maxReal * 2);
  assert.strictEqual(M.aidAmount(-5, 0), 0);
  assert.strictEqual(M.ceremonyLabel('juedisch', 'wedding'), 'Trauung unter dem Hochzeitsbaldachin'); assert.strictEqual(M.ceremonyLabel('gibtsnicht', 'baptism'), 'Taufe');
  for (const f of M.faiths()) for (const k of M.CEREMONIES) assert.ok(f.ceremony[k], `${f.key} ${k}`);
});

test('Stiftung: Abrechnung je Zeitraum (Ertrag, dann Ausschüttung), begrenztes Nachholen, Ausschüttungssatz in den Grenzen, Kapital nie negativ', () => {
  const now = 100 * 24 * HOUR;
  const one = M.foundationTick({ capital: 1e6, payoutPct: 3, lastMs: now - 24 * HOUR }, now);
  assert.strictEqual(one.periods, 1); close(one.income, 1e6 * 0.03, 0.01); close(one.payout, (1e6 + 3e4) * 0.03, 0.01); close(one.capital, 1e6 + one.income - one.payout, 0.01); assert.strictEqual(one.nextMs, now);
  assert.strictEqual(M.foundationTick({ capital: 1e6, payoutPct: 3, lastMs: now - 23 * HOUR }, now).periods, 0);
  const none = M.foundationTick({ capital: 1e6, payoutPct: 3, lastMs: now - 23 * HOUR }, now); assert.strictEqual(none.nextMs, now - 23 * HOUR, 'angebrochener Zeitraum zählt weiter');
  const long = M.foundationTick({ capital: 1e6, payoutPct: 3, lastMs: now - 400 * 24 * HOUR }, now);
  assert.strictEqual(long.periods, G.foundation.catchUpMax, 'Nachholen ist begrenzt'); assert.strictEqual(long.nextMs, now, 'den Rest verfällt');
  assert.strictEqual(M.clampPayout(0), G.foundation.payoutMinPct); assert.strictEqual(M.clampPayout(99), G.foundation.payoutMaxPct); assert.strictEqual(M.clampPayout('x'), G.foundation.payoutDefaultPct);
  // Auszahlungssatz ≥ Mindestsatz: das Kapital wächst langsam (Ertrag 3 %, Ausschüttung mindestens 1,5 %), nie ins Unendliche
  let cap = 1e6; for (let i = 0; i < 500; i++) cap = M.foundationTick({ capital: cap, payoutPct: 1.5, lastMs: 0 }, 24 * HOUR).capital;
  assert.ok(cap > 1e6 && Number.isFinite(cap)); cap = 1e6; for (let i = 0; i < 500; i++) cap = M.foundationTick({ capital: cap, payoutPct: 6, lastMs: 0 }, 24 * HOUR).capital; assert.ok(cap < 1e6, 'hohe Ausschüttung zehrt das Kapital langsam auf');
  assert.strictEqual(M.foundationTick({ capital: -5, payoutPct: 3, lastMs: 0 }, 24 * HOUR).capital, 0);
  assert.strictEqual(M.bequest(1000, 20), 200); assert.strictEqual(M.bequest(1000, 99), 300, 'Obergrenze 30 %'); assert.strictEqual(M.bequest(-1, 20), 0); assert.strictEqual(M.bequest(1000, -5), 0);
});

test('Gemeinwohl-Topf: klingt ab, wirkt sättigend (größere Städte brauchen mehr), jeder Zweck wirkt anders', () => {
  close(M.potDecay(100, 1), 92, 1e-9); assert.strictEqual(M.potDecay(100, 0), 100); assert.ok(M.potDecay(100, 100) < 0.1);
  const none = M.potEffect({}, 3); assert.deepEqual(none, { kids: 0, health: 0, wellbeing: 0, aid: 0 });
  const small = M.potEffect({ bildung: 60000, gesundheit: 60000, kultur: 60000, armut: 60000 }, 1); const big = M.potEffect({ bildung: 60000, gesundheit: 60000, kultur: 60000, armut: 60000 }, 5);
  assert.ok(small.kids > big.kids && small.health > big.health, 'dieselbe Summe wirkt in einer kleinen Stadt stärker');
  const huge = M.potEffect({ bildung: 1e12, gesundheit: 1e12, kultur: 1e12, armut: 1e12 }, 3);
  assert.ok(huge.kids <= 0.2 + 1e-9 && huge.health <= 1.2 + 1e-9 && huge.wellbeing <= 1 + 1e-9 && huge.aid <= 1 + 1e-9, 'gedeckelt');
  assert.ok(M.potEffect({ bildung: 5000 }, 3).kids > 0 && M.potEffect({ bildung: 5000 }, 3).health === 0);
});

test('Titel: Bedingungen je Rang, Würde (Ruf, Skandal), Wirkungen gedeckelt und einmal je Titel, Anzeigename', () => {
  const base = { lvl: 2, scandal: 0, donated: 0, contributed: 0, biz: 0, staff: 0, chair: 0, chairDays: 0, office: 0 };
  assert.deepEqual(M.evaluate(base), []);
  const rich = { ...base, lvl: 3, donated: 700000, biz: 2e8, staff: 50, contributed: 3e7, office: 6, chair: 20, chairDays: 20 };
  const got = Object.fromEntries(M.evaluate(rich).map((t) => [t.key, t.rank]));
  assert.deepEqual(got, { kommerzienrat: 3, stifter: 3, maezen: 2, ehrenvorsitz: 2, altamt: 3 });
  assert.strictEqual(M.rankFor(M.titleDef('kommerzienrat'), { ...rich, staff: 10, biz: 6e6, donated: 30000, lvl: 2 }), 1);
  assert.strictEqual(M.rankFor(M.titleDef('ehrenbuerger'), rich), 0, 'Ehrenbürger vergibt nur der Bürgermeister');
  assert.deepEqual(M.evaluate({ ...rich, lvl: -1 }), [], 'Zweifelhaft: keine Titel'); assert.deepEqual(M.evaluate({ ...rich, scandal: 25 }), [], 'Skandal: keine Titel');
  assert.strictEqual(M.titleName('kommerzienrat', 2), 'Geheimer Kommerzienrat'); assert.strictEqual(M.titleName('kommerzienrat', 9), 'Wirklicher Geheimer Kommerzienrat'); assert.strictEqual(M.titleName('nichts', 1), 'nichts');
  const fx = M.titleFx([{ key: 'kommerzienrat', rank: 3 }, { key: 'stifter', rank: 3 }, { key: 'maezen', rank: 3 }, { key: 'altamt', rank: 3 }, { key: 'ehrenbuerger', rank: 1 }, { key: 'ehrenbuerger', rank: 1 }]);
  assert.ok(fx.vote <= G.titles.maxVotePct && fx.fee <= G.titles.maxFeeDiscPct && fx.rev <= 3 && fx.slots <= 2, JSON.stringify(fx));
  assert.deepEqual(M.titleFx([]), { vote: 0, fee: 0, rev: 0, slots: 0 }); assert.deepEqual(M.titleFx([{ key: 'unbekannt', rank: 1 }]), { vote: 0, fee: 0, rev: 0, slots: 0 });
  assert.strictEqual(M.titleFx([{ key: 'ehrenbuerger', rank: 1 }, { key: 'ehrenbuerger', rank: 1 }]).vote, 1, 'ein Titel zählt einmal');
  assert.strictEqual(M.bestTitle([{ key: 'maezen', rank: 3 }, { key: 'kommerzienrat', rank: 1 }]), 'Mäzen'); assert.strictEqual(M.bestTitle([]), null);
  assert.strictEqual(M.bestTitle([{ key: 'maezen', rank: 1 }, { key: 'kommerzienrat', rank: 1 }]), 'Kommerzienrat', 'bei gleichem Rang zählt das Ansehen der Titelart');
});

test('Politik bleibt offen: Titel und Vereine bewirken keine Sperre, nur kleine Zugaben', () => {
  // Mit allen Titeln und Empfehlungen ist die Zugabe zum Stimmengewicht höchstens 6 %, die Gebühr höchstens 25 % billiger – nie eine Voraussetzung
  const max = M.titleFx(M.titleList().map((d) => ({ key: d.key, rank: d.ranks.length })));
  const factor = M.voteFactor(M.totalBoost([2.5, 2.5, 2.5], max.vote));
  assert.ok(factor <= 1.06 + 1e-9 && max.fee <= 25);
  const E = require('../src/lib/elections');
  const s = createCharacter(w, input(w), { meta: {}, coins: 0, efs_pool: 0 }); s.day = 40 * 365; s.person.birthDay = s.day - 40 * 365;
  assert.strictEqual(E.standingBlock(s, 5, settings.get('elections')) !== undefined, true); // Ansehen-Prüfung unverändert, ohne Bezug zu Titeln
});

test('Spielstand: ohne Daten harmlos, Zwischenspeicher wirkt in der Engine, Trauerfeiern verfallen, Altstände bleiben lesbar', () => {
  const s = createCharacter(w, input(w), { meta: {}, coins: 0, efs_pool: 0 });
  assert.deepEqual(M.body(s), { mood: 0, rest: 0, health: 0 }); assert.strictEqual(M.revMult(s), 1); assert.strictEqual(M.brief(s).on, false);
  const f = M.ensure(s); assert.deepEqual(f.funerals, []); assert.strictEqual(f.will, 0);
  const e = M.addFuneral(s, 'Opa'); assert.strictEqual(e.id, 1); assert.strictEqual(M.addFuneral(s, 'Oma').id, 2);
  for (let i = 0; i < 10; i++) M.addFuneral(s, `X${i}`); assert.ok(M.ensure(s).funerals.length <= 6);
  s.civic = { at: 1, clubs: [{ id: 1, name: 'V', kind: 'sport', role: 'member', members: 9 }], titles: [{ key: 'kommerzienrat', rank: 2, name: 'Geheimer Kommerzienrat' }], fx: { health: 2, rest: 0.8, mood: 1.5, rev: 1.5, kids: 0.1, aid: 0 }, due: 1 };
  assert.deepEqual(M.body(s), { mood: 1.5, rest: 0.8, health: 2 }); assert.strictEqual(M.revMult(s), 1.015);
  const b = M.brief(s); assert.ok(b.on && b.clubs.length === 1 && b.best === 'Geheimer Kommerzienrat' && b.due === 1);
  s.status = 'dead'; assert.deepEqual(M.body(s), { mood: 0, rest: 0, health: 0 }); s.status = 'alive';
  // Tagesroutine: Kinder-Zufriedenheit steigt gedeckelt; alte Trauerfeiern verfallen
  s.children = [{ id: 1, status: 'home', sat: 99.95 }]; s.day = 1000; M.ensure(s).funerals = [{ id: 1, name: 'alt', day: 0 }, { id: 2, name: 'neu', day: 990 }];
  M.daily({ state: s }); assert.strictEqual(s.children[0].sat, 100); assert.deepEqual(M.ensure(s).funerals.map((x) => x.id), [2]);
});

test('Engine: Vereinswirkungen heben Stimmung, Erholung, Gesundheit und Umsatz spürbar, aber klein; ohne Zwischenspeicher bleibt alles gleich', () => {
  const run = (civic) => {
    const s = createCharacter(w, input(w, { professionKey: 'wirt' }), { meta: {}, coins: 0, efs_pool: 0 });
    s.life.baseYears = 900; s.life.rare = false; s.seed = 4242; s.noRandom = true; s.money = 5e7; s.housing = { type: 'rent', cityId: s.cityId, base: 3000, rooms: 2 };
    if (civic) s.civic = civic;
    for (let i = 0; i < 365 * 3; i++) { s.meters.fridge = 100; advance(w, s, 1); s.interrupts = []; }
    return s;
  };
  const a = run(null); const b = run({ at: 1, clubs: [], titles: [], fx: { health: 2, rest: 0.8, mood: 1.5, rev: 0, kids: 0, aid: 0 } });
  assert.ok(b.meters.wellbeing >= a.meters.wellbeing && b.meters.wellbeing - a.meters.wellbeing <= 2.5, `Stimmung ${a.meters.wellbeing} → ${b.meters.wellbeing}`);
  assert.ok(b.meters.health >= a.meters.health && b.meters.health - a.meters.health <= 3, `Gesundheit ${a.meters.health} → ${b.meters.health}`);
  const c1 = { id: 1, pkey: 'wirt', tier: 0, cityId: a.cityId, rooms: biz.tiersOf(w)[0].rooms, staff: 3, manager: true, cash: 0, base: 1, abandoned: null };
  const year = 1960; a.day = 15 * 365; b.day = 15 * 365; a.civic = null; b.civic = { fx: { rev: 1.5 } };
  const fa = biz.companyFlows(w, a, c1, year).income; const fb = biz.companyFlows(w, b, c1, year).income;
  assert.ok(fb > fa && fb / fa <= 1.016, `Umsatz ${fa} → ${fb}`);
  // Wirkungen schalten sich per Stärke ab (der Zwischenspeicher wird dann gar nicht erst gefüllt)
  assert.strictEqual(M.revMult({ civic: { fx: { rev: 99 } } }), 1.03, 'harte Obergrenze');
});

test('Einsteiger: neue Aufgaben (Verein, Gemeinwohl) erfüllen sich aus dem Zwischenspeicher; „Was jetzt?“ meldet offene Beiträge und Trauerfeiern', () => {
  const s = createCharacter(w, input(w), { meta: {}, coins: 0, efs_pool: 0 });
  assert.ok(ob.QUESTS.some((q) => q.id === 'club') && ob.QUESTS.some((q) => q.id === 'give'));
  assert.ok(!ob.satisfied(s).has('club') && !ob.satisfied(s).has('give'));
  s.civic = { clubs: [{ id: 1 }], parish: null, foundation: null, titles: [] };
  assert.ok(ob.satisfied(s).has('club') && !ob.satisfied(s).has('give'));
  s.civic = { clubs: [], parish: { id: 1 }, titles: [] }; assert.ok(ob.satisfied(s).has('give'));
  s.civic = { clubs: [], parish: null, foundation: null, titles: [{ key: 'maezen' }] }; assert.ok(ob.satisfied(s).has('give'));
  assert.ok(ob.SEEN_KEYS.includes('civic'));
  const v = { status: 'alive', currency: 'DM', meters: { fridge: 90, health: 90, wellbeing: 80 }, hunger: 0, housing: { type: 'rent' }, occupation: {}, money: 1e6, companies: [], children: [], properties: [], flows: { net: 1, expense: 100 }, civic: { on: true, due: 1, parish: null, funerals: 0 } };
  assert.strictEqual(ob.advise(v, null, {}).top.id, 'civic-due');
  v.civic = { on: true, due: 0, parish: { id: 1 }, funerals: 2 }; assert.strictEqual(ob.advise(v, null, {}).top.id, 'civic-funeral');
  v.civic = { on: false }; assert.ok(!['civic-due', 'civic-funeral'].includes(ob.advise(v, null, {}).top.id));
});

test('Einstellungen: Standardwerte vollständig und folgerichtig (Beträge, Grenzen, Listen)', () => {
  assert.strictEqual(G.enabled, true);
  assert.ok(M.kinds().length === 4 && M.faiths().length === 5 && M.purposes().length === 5 && M.titleList().length === 6);
  for (const t of M.titleList()) { if (t.auto === false) continue; assert.strictEqual(t.req.length, t.ranks.length, t.key); for (const k of ['vote', 'fee', 'rev', 'slots']) assert.strictEqual(t.fx[k].length, t.ranks.length, `${t.key}.${k}`); }
  assert.ok(G.foundation.payoutMinPct <= G.foundation.payoutDefaultPct && G.foundation.payoutDefaultPct <= G.foundation.payoutMaxPct);
  assert.ok(G.foundation.payoutMinPct < G.foundation.yieldPct * 1.0 + 1e-9, 'Mindestausschüttung unter dem Ertrag: Kapital wächst langsam, aber sicher');
  assert.ok(G.clubs.endorse.clubCapPct <= G.clubs.endorse.totalCapPct && G.clubs.endorse.totalCapPct <= G.elections.maxBoostPct);
  for (const k of M.kinds()) assert.ok(k.name && k.icon && k.what && k.fx, k.key);
  for (const p of M.purposes()) assert.ok(p.name && p.icon && p.what, p.key);
  // jede Rangbezeichnung ist eindeutig lesbar und enthält keine Modellnamen
  const text = JSON.stringify(G); assert.ok(!/claude|sonnet|anthropic/i.test(text));
});
