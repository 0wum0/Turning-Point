'use strict';
/** Jahreszeiten, Ernte und Seuchen: reine Modelle (Kurven, Wetter, Wellen), Wirkungen auf Betriebe und Haushalt, Beschlüsse, Engine-Läufe. */
const test = require('node:test');
const assert = require('node:assert');
const { testWorld, input } = require('./helpers');
const settings = require('../src/settings');
const SE = require('../src/game/seasons');
const HV = require('../src/game/harvest');
const EP = require('../src/game/epidemics');
const SFX = require('../src/game/seasonfx');
const goods = require('../src/game/goods');
const biz = require('../src/game/business');
const core = require('../src/game/core');
const actions = require('../src/game/actions');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const { dateOf } = require('../src/game/calendar');

settings.DEFAULTS.talente.effects.strength = 0;
const w = testWorld();
const city = (name) => w.cityList.find((c) => c.name === name);
const mk = (year = 1945, doy = 0, over = {}) => {
  const s = createCharacter(w, input(w, over), { meta: {}, coins: 1, efs_pool: 0 });
  s.day = (year - s.startYear) * 365 + doy; s.contracts = { buys: [], sells: [] }; s.person.birthDay = s.day - 30 * 365;
  return s;
};
const firm = (s, over = {}) => { const t = biz.tiersOf(w)[over.tier || 0]; return { id: 1, pkey: 'baecker', tier: 0, cityId: city('Braunschweig').id, rooms: t.rooms, staff: 3, manager: true, cash: 0, base: 1, abandoned: null, ...over }; };
const withJ = (patch, fn) => { const j = settings.DEFAULTS.jahreszeiten; const old = JSON.stringify(j); try { patch(j); return fn(); } finally { Object.assign(j, JSON.parse(old)); } };
const noEpi = () => { goods.setPolicies(null); };

test('Jahreszeit: Wärmekurve, Jahreszeiten nach Monat, Intensität im Bereich', () => {
  assert.strictEqual(SE.seasonOf(0).key, 'winter');
  assert.strictEqual(SE.seasonOf(59).key, 'fruehling');
  assert.strictEqual(SE.seasonOf(151).key, 'sommer');
  assert.strictEqual(SE.seasonOf(243).key, 'herbst');
  assert.strictEqual(SE.seasonOf(340).key, 'winter');
  assert.ok(SE.warmth(15) < -0.999 && SE.warmth(197) > 0.999);
  for (let d = 0; d < 365; d++) { const s = SE.seasonOf(d); assert.ok(s.intensity >= 0 && s.intensity <= 1 && s.warmth >= -1 && s.warmth <= 1); }
});

test('Branchenkurven: mittelwertfrei, begrenzt (±20 %), die richtige Jahreszeit führt', () => {
  for (const sec of Object.keys(SE.SHAPE)) {
    let sum = 0; let mn = 9; let mx = 0;
    for (let d = 0; d < 365; d++) { const m = SE.sectorMult(sec, d); sum += m; mn = Math.min(mn, m); mx = Math.max(mx, m); assert.ok(m >= 0.8 && m <= 1.2, `${sec} ${d} ${m}`); }
    assert.ok(Math.abs(sum / 365 - 1) < 1e-9, `${sec} Jahresmittel ${sum / 365}`);
    assert.ok(mx - mn > 0.1, `${sec} schwankt`);
  }
  assert.ok(SE.sectorMult('gastro', 196) > 1.08 && SE.sectorMult('gastro', 15) < 1);
  assert.ok(SE.sectorMult('heat', 15) > 1.15 && SE.sectorMult('heat', 196) < 0.85);
  assert.ok(SE.sectorMult('bau', 15) < 0.85 && SE.sectorMult('bau', 196) > 1.1);
  assert.ok(SE.sectorMult('retail', 342) > 1.12 && SE.sectorMult('retail', 100) < 1.1);
  assert.ok(SE.sectorMult('agrar', 265) > 1.1);
  assert.strictEqual(SE.sectorOf(w, 'wirt'), 'gastro'); assert.strictEqual(SE.sectorOf(w, 'maurer'), 'bau'); assert.strictEqual(SE.sectorOf(w, 'it_fachmann'), null);
});

test('Jahreszeiten: Schalter und Stärke (0 = keine Wirkung, Deckel bleibt)', () => {
  withJ((j) => { j.seasons.strength = 0; }, () => { for (let d = 0; d < 365; d += 20) assert.strictEqual(SE.sectorMult('heat', d), 1); });
  withJ((j) => { j.enabled = false; }, () => { assert.strictEqual(SE.sectorMult('gastro', 196), 1); assert.strictEqual(SE.heatingPct('rent', 1950, 15, 0, 0), 0); });
  withJ((j) => { j.seasons.strength = 2; j.seasons.amp.heat = 0.5; }, () => { for (let d = 0; d < 365; d++) assert.ok(SE.sectorMult('heat', d) <= 1.2 + 1e-9); });
});

test('Heizung: Winter teurer, Sommer günstiger, Jahresmittel unverändert, Epoche und Winterhilfe wirken', () => {
  let sum = 0; for (let d = 0; d < 365; d++) sum += SE.heatingMult('rent', 1950, d, 0, 0);
  assert.ok(Math.abs(sum / 365 - 1) < 1e-9);
  assert.ok(SE.heatingPct('rent', 1950, 15, 0, 0) > 0.1 && SE.heatingPct('rent', 1950, 196, 0, 0) < -0.1);
  assert.strictEqual(SE.heatingPct('street', 1950, 15, 0, 0), 0);
  assert.strictEqual(SE.heatingPct('workplace', 1950, 15, 0, 0), 0);
  assert.ok(SE.heatingPct('rent', 1950, 15, 0, 0) > SE.heatingPct('rent', 1990, 15, 0, 0) && SE.heatingPct('rent', 1990, 15, 0, 0) > SE.heatingPct('rent', 2030, 15, 0, 0), 'Kohleofen > Zentralheizung > Wärmepumpe');
  assert.strictEqual(SE.heatingKind(1950).name, 'Kohleofen'); assert.strictEqual(SE.heatingKind(2030).name, 'Wärmepumpe');
  assert.ok(SE.heatingPct('rent', 1950, 15, 1, 0) > SE.heatingPct('rent', 1950, 15, 0, 0), 'harter Winter');
  assert.ok(SE.heatingPct('rent', 1950, 15, 0, 0.5) < SE.heatingPct('rent', 1950, 15, 0, 0), 'Winterhilfe mindert den Mehrbedarf');
  assert.strictEqual(SE.heatingPct('rent', 1950, 196, 0, 0.5), SE.heatingPct('rent', 1950, 196, 0, 0), 'im Sommer nichts zu fördern');
  assert.ok(SE.heatingPct('own', 1950, 15, 0, 0) > SE.heatingPct('pension', 1950, 15, 0, 0), 'Eigenheim hat größeren Heizbedarf als Pension');
});

test('Haushalt: Tageskosten schwanken mit der Jahreszeit, Essen folgt der Ernte', () => {
  noEpi();
  const s = mk(1950, 15); s.housing = { type: 'rent', cityId: s.cityId, base: 3000, rooms: 1 };
  const winter = core.dailyFlows(w, s); s.day += 181; const summer = core.dailyFlows(w, s);
  assert.ok(winter.exp.lodging > summer.exp.lodging && winter.heat.pct > 5 && summer.heat.pct < -5);
  const b = SFX.body(mk(1950, 15)); const c = SFX.body(mk(1950, 196));
  assert.ok(b.illness > c.illness && b.rest < c.rest && b.mood < c.mood);
  const ff = (y) => core.foodFactor(w, mk(y, 100), y);
  assert.ok(ff(1946) > ff(1950) * 1.05, 'Katastrophenjahr verteuert Essen');
});

test('Wetter und Ernte: deterministisch, Geschichte stimmt, Mittel 1, Klassen und Hochwasser', () => {
  for (const y of [1946, 1976, 2002, 2050, 2099]) { assert.deepStrictEqual(HV.report(y, 'Bayern'), HV.report(y, 'Bayern')); assert.deepStrictEqual(HV.weatherOf(y), HV.weatherOf(y)); }
  assert.strictEqual(HV.report(1946, null).key, 'katastrophe');
  assert.ok(HV.weatherOf(1947).winter === 1, 'Hungerwinter 1946/47');
  assert.ok(HV.weatherOf(1976).heat > 2 && HV.report(1976, 'Hessen').key === 'schlecht');
  assert.ok(HV.weatherOf(2018).heat >= 2);
  assert.ok(HV.weatherOf(2002).flood.includes('Sachsen') && HV.report(2002, 'Sachsen').flood && !HV.report(2002, 'Hessen').flood);
  assert.ok(HV.yieldOf(2002, 'Sachsen') < HV.yieldOf(2002, 'Hessen') - 0.1, 'Flut drückt den Ertrag im Land');
  assert.ok(HV.weatherOf(2021).flood.includes('Nordrhein-Westfalen'));
  let sum = 0; const cls = {}; let n = 0;
  for (let y = 1945; y <= 2100; y++) { const v = HV.nationalYield(y); assert.ok(v >= 0.45 && v <= 1.3); sum += v; n++; const k = HV.classOf(v).key; cls[k] = (cls[k] || 0) + 1; }
  assert.ok(Math.abs(sum / n - 1) < 0.01, `Mittel ${sum / n}`);
  for (const k of ['schlecht', 'normal', 'gut', 'rekord']) assert.ok(cls[k] > 3, `${k} kommt vor: ${JSON.stringify(cls)}`);
  assert.ok(HV.weatherOf(2150).year === 2150 && Number.isFinite(HV.nationalYield(2150)), 'Jahre nach der Geschichte entstehen aus der Zufallsfolge');
});

test('Erntepreise: begrenzt, mittelwertfrei, Importanteil dämpft, Verarbeiter geben nur einen Teil weiter', () => {
  let ps = 0; let fs = 0; let n = 0;
  for (let y = 1945; y <= 2100; y++) {
    const g = HV.goodMult('getreide', y, 'Hessen', 0.1); const f = HV.firmMult('landwirt', y, 'Hessen'); const fd = HV.foodMult(y, 'Hessen');
    assert.ok(g >= 0.82 && g <= 1.45 && f >= 0.6 && f <= 1.3 && fd >= 0.9 && fd <= 1.15, `${y}: ${g} ${f} ${fd}`);
    assert.ok(Math.abs(HV.goodMult('mehl', y, 'Hessen', 0.1) - 1) <= Math.abs(g - 1) + 1e-9 && Math.abs(HV.goodMult('brot', y, 'Hessen', 0.1) - 1) <= Math.abs(HV.goodMult('mehl', y, 'Hessen', 0.1) - 1) + 1e-9, 'Weitergabe nimmt ab');
    ps += g; fs += f; n++;
  }
  assert.ok(Math.abs(ps / n - 1) < 0.01 && Math.abs(fs / n - 1) < 0.01);
  assert.ok(HV.priceMult(0.6, 0.5) < HV.priceMult(0.6, 0), 'Importe dämpfen den Preisschock');
  assert.strictEqual(HV.goodMult('holz', 1946, 'Hessen', 0), 1); assert.strictEqual(HV.goodMult('strom', 1946, 'Hessen', 0), 1);
  assert.ok(HV.firmMult('landwirt', 1946, 'Hessen', 0.9) > HV.firmMult('landwirt', 1946, 'Hessen', 0), 'Dürrehilfe gleicht aus');
  assert.ok(HV.firmMult('landwirt', 1984, 'Hessen', 0.9) === HV.firmMult('landwirt', 1984, 'Hessen', 0), 'Hilfe nur im Verlustjahr');
  assert.ok(HV.firmMult('muehle', 1946, 'Hessen') > 1 && HV.firmMult('muehle', 1946, 'Hessen') < 1.2);
  withJ((j) => { j.harvest.forced = [{ year: 1960, yield: 0.5 }]; }, () => { assert.strictEqual(HV.nationalYield(1960), 0.5); assert.strictEqual(HV.report(1960, 'Bayern').key, 'katastrophe'); });
  withJ((j) => { j.harvest.enabled = false; }, () => { assert.strictEqual(HV.goodMult('getreide', 1946, 'Hessen', 0), 1); assert.strictEqual(HV.foodMult(1946, 'Hessen'), 1); assert.strictEqual(HV.firmMult('landwirt', 1946, 'Hessen'), 1); });
});

test('Warenpreise folgen der Ernte; Bauer verdient im schlechten Jahr weniger, im guten mehr, Jahressumme bleibt', () => {
  noEpi();
  const c = city('Braunschweig');
  assert.ok(goods.price(w, c.id, 'getreide', 1946).market > goods.price(w, c.id, 'getreide', 1950).market * 1.2 * (w.idx(1946) / w.idx(1950)) * 0.7);
  const s = mk(1950, 0); const f = firm(s, { pkey: 'landwirt' });
  const yr = (y) => { s.day = (y - 1945) * 365 + 262; return biz.companyFlows(w, s, f, y).sfx.harvest; };
  assert.ok(yr(1946) < 0.85 && yr(1984) > 1.05);
});

test('Betriebe: Saisonumsatz über das Jahr unverändert (±1 %), Gastro im Sommer vorn, Bau im Winter schwach', () => {
  noEpi();
  const run = (pkey, patch) => {
    const s = mk(1950, 0, { professionKey: 'baecker' });
    const f = firm(s, { pkey });
    let inc = 0; let sum = 0; const byDoy = [];
    withJ(patch || (() => {}), () => { for (let d = 0; d < 365; d++) { s.day = 5 * 365 + d; const x = biz.companyFlows(w, s, f, 1950); inc += x.income; byDoy.push(x.income); sum += x.sfx.season; } });
    return { inc, byDoy, mean: sum / 365 };
  };
  for (const pkey of ['wirt', 'maurer', 'einzelhandelsverkaeufer', 'kohlenhaendler']) {
    const a = run(pkey); const off = run(pkey, (j) => { j.seasons.strength = 0; j.festivals.enabled = false; });
    assert.ok(Math.abs(a.inc / off.inc - 1) < 0.015, `${pkey}: ${a.inc} vs ${off.inc}`);
    assert.ok(Math.max(...a.byDoy) / Math.min(...a.byDoy) > 1.15 && Math.max(...a.byDoy) / Math.min(...a.byDoy) <= 1.51, `${pkey} schwankt`);
  }
  const g = run('wirt'); assert.ok(g.byDoy[196] > g.byDoy[15]);
  const b = run('maurer'); assert.ok(b.byDoy[196] > b.byDoy[15] * 1.2);
});

test('Feste: Oktoberfest nur in Bayern, Karneval im Rheinland, Weihnachtsmarkt überall, Sommerfest je Stadt eine Woche', () => {
  const m = city('München'); const k = city('Köln'); const h = city('Hamburg');
  const names = (c, d) => SE.festivalsOn(c, d).map((f) => f.key);
  assert.ok(names(m, 270).includes('oktoberfest') && !names(h, 270).includes('oktoberfest'));
  assert.ok(names(k, 40).includes('karneval') && !names(m, 40).includes('karneval'));
  assert.ok(names(h, 340).includes('weihnacht'));
  for (const c of w.cityList.slice(0, 12)) { const days = []; for (let d = 0; d < 365; d++) if (names(c, d).includes('sommerfest')) days.push(d); assert.strictEqual(days.length, 7, c.name); assert.ok(days[0] >= 170 && days[6] <= 245); }
  const base = SE.revenueMult(w, 'wirt', m, 100); const fest = SE.revenueMult(w, 'wirt', m, 270);
  assert.ok(fest >= SE.sectorMult('gastro', 270) && fest <= 1.2 + 1e-9 && base <= 1.2);
  withJ((j) => { j.festivals.enabled = false; }, () => assert.deepStrictEqual(SE.festivalsOn(m, 270), []));
});

test('Seuchenwellen: deterministisch, historisch und erfunden, Ausbreitung von Stadt zu Stadt, glatte Kurve', () => {
  const list = EP.waves(w);
  assert.deepStrictEqual(list.map((x) => x.id), EP.waves(w).map((x) => x.id));
  for (const id of ['grippe1957', 'grippe1968', 'sars2003', 'grippe2009', 'covid1', 'covid2', 'covid3']) assert.ok(list.find((x) => x.id === id), id);
  assert.ok(list.filter((x) => x.fictional).length >= 3, 'erfundene Seuchen in den 2040ern, 2070ern und 2090ern');
  for (const [a, b] of [[2040, 2049], [2070, 2079], [2090, 2099]]) assert.ok(list.some((x) => x.fictional && x.year >= a && x.year <= b), `${a}`);
  const c1 = list.find((x) => x.id === 'covid1');
  const muc = city('München'); const kiel = city('Kiel');
  assert.ok(EP.timing(w, c1, kiel).start > EP.timing(w, c1, muc).start + 80, 'Kiel erreicht die Welle Wochen später');
  assert.strictEqual(EP.originOf(w, c1).name, 'München');
  let peak = 0; let prev = 0;
  for (let d = 0; d < 600; d++) { const day = EP.abs(2020, 0) + d; const I = EP.intensity(w, c1, muc, Math.floor(day / 365), day % 365); assert.ok(I >= 0 && I <= 1); peak = Math.max(peak, I); assert.ok(Math.abs(I - prev) < 0.12, 'glatt'); prev = I; }
  assert.ok(peak > 0.8 && peak <= 1);
  assert.strictEqual(EP.intensity(w, c1, muc, 2019, 100), 0); assert.strictEqual(EP.intensity(w, c1, muc, 2023, 100), 0);
  withJ((j) => { j.epidemics.frequency = 0; }, () => assert.strictEqual(EP.waves(w).filter((x) => x.fictional).length, 0));
  withJ((j) => { j.epidemics.enabled = false; }, () => assert.strictEqual(EP.waves(w).length, 0));
});

test('Lage vor Ort: Maßnahmen, Rahmen und Hygiene senken die Ansteckung; Impfquote wächst; Grenzen halten', () => {
  const c = city('Braunschweig');
  const at = (efEpi, doy = 160) => EP.situation(w, 2020, doy, c, { epi: { hyg: 0, hospital: 0, level: null, cap: 2, vaccLvl: 0, kurz: 0, ...efEpi } });
  const base = at({}); assert.ok(base.active && base.level === 2 && base.I > 0.1 && base.I <= 1);
  assert.ok(at({ hyg: 3 }).I < base.I); assert.ok(at({ level: 3, cap: 3 }).I < base.I); assert.ok(at({ level: 0 }).I > base.I, 'Lockern erhöht');
  assert.strictEqual(at({ level: 3, cap: 1 }).level, 1, 'Rahmen des Bundestags deckelt');
  assert.ok(at({ hospital: 3 }).waves[0].sev < base.waves[0].sev);
  const late = EP.situation(w, 2021, 60, c, { epi: { hyg: 0, hospital: 0, level: null, cap: 2, vaccLvl: 0, kurz: 0 } });
  assert.ok(late.vaccAvail && late.vacc > 0 && late.vacc <= 0.8, JSON.stringify(late.vaccAvail));
  assert.ok(EP.situation(w, 2021, 60, c, { epi: { hyg: 0, hospital: 0, level: null, cap: 2, vaccLvl: 3, kurz: 0 } }).vacc > late.vacc);
  for (let y = 1945; y <= 2100; y += 1) for (let d = 0; d < 365; d += 30) { const x = EP.situation(w, y, d, c, null); assert.ok(x.I >= 0 && x.I <= 1 && x.sickShare >= 0 && x.sickShare <= 0.3 && x.level >= 0 && x.level <= 3, `${y}/${d}`); }
  assert.strictEqual(EP.situation(w, 1950, 10, c, null).active, false);
});

test('Betriebe in der Seuche: Krankenstand und Lockdown je Branche begrenzt, Schutzkonzept und Kurzarbeit mildern', () => {
  const c = city('Braunschweig');
  const sit = EP.situation(w, 2020, 165, c, { epi: { hyg: 0, hospital: 0, level: 3, cap: 3, vaccLvl: 0, kurz: 0 } });
  const g = EP.firmEffects(w, 'wirt', sit); const bau = EP.firmEffects(w, 'maurer', sit); const it = EP.firmEffects(w, 'it_fachmann', sit); const arzt = EP.firmEffects(w, 'arzt', sit);
  assert.ok(g.rev < bau.rev && bau.rev <= 1 && g.rev >= 0.5 && g.eff < 1 && g.eff >= 0.7);
  assert.ok(arzt.rev >= 1 && arzt.rev <= 1.15, 'Krankenhäuser profitieren');
  assert.ok(EP.firmEffects(w, 'wirt', sit, { shield: true }).rev > g.rev && EP.firmEffects(w, 'wirt', sit, { shield: true }).eff > g.eff);
  assert.ok(EP.firmEffects(w, 'wirt', sit, { kurz: 0.65 }).rev > g.rev);
  assert.ok(it.rev > g.rev);
  assert.deepStrictEqual(EP.firmEffects(w, 'wirt', EP.situation(w, 1950, 10, c, null)), { eff: 1, rev: 1, sick: 0, lock: 0 });
  // Betriebsrechnung: Gastro im Lockdown deutlich unter Normal, immer endlich
  noEpi();
  const s = mk(2020, 165); const f = firm(s, { pkey: 'wirt' });
  const lock = biz.companyFlows(w, s, f, 2020); s.day = (2020 - 1945) * 365 + 20; const calm = biz.companyFlows(w, s, f, 2020);
  assert.ok(lock.sfx.epi < 0.97 && calm.sfx.epi === 1 && Number.isFinite(lock.profit), `${lock.sfx.epi} < ${calm.sfx.epi}`);
});

test('Gesundheit: Anfängerschutz, Schutzmaßnahmen, Impfung, Krankheit begrenzt, Sterblichkeit klein', () => {
  noEpi();
  const run = (opt) => {
    const s = mk(1957, 200, opt.over || {}); s.day = (1957 - 1945) * 365 + 230 + (opt.dayShift || 0); s.person.birthDay = s.day - 30 * 365;
    s.housing = { type: 'rent', cityId: s.cityId, base: 3000, rooms: 1 }; s.money = 5e7; s.meters.fridge = 100; s.flags.autoMaintain = true;
    if (opt.old) s.person.birthDay = s.day - 70 * 365;
    if (opt.prep) opt.prep(s);
    const ev = w.econ.events; w.econ.events = { ...(ev || {}), private: { rate: 1e12, poorRate: 1e12 } };
    const nb = settings.DEFAULTS['game.newbie_protect_days']; settings.DEFAULTS['game.newbie_protect_days'] = opt.newbie ? 1e6 : 90;
    try {
      let sick = 0; let minHealth = 100;
      for (let i = 0; i < 260 && s.status === 'alive'; i++) { if (s.meters.fridge < 50) s.meters.fridge = 100; advance(w, s, 1); s.interrupts = []; if (EP.isSick(s)) sick++; minHealth = Math.min(minHealth, s.meters.health); }
      return { s, sick, minHealth, cases: s.epi.cases };
    } finally { w.econ.events = ev; settings.DEFAULTS['game.newbie_protect_days'] = nb; }
  };
  const base = []; for (let k = 0; k < 6; k++) base.push(run({ over: { firstName: 'Karl' + k }, dayShift: k * 3 }));
  const totalCases = base.reduce((a, x) => a + x.cases, 0);
  assert.ok(totalCases >= 1, 'ohne Schutz erwischt es einige');
  const nb = run({ newbie: true }); assert.strictEqual(nb.cases, 0, 'Anfängerschutz: gesund');
  for (const x of base) { assert.ok(x.minHealth > 5, `Gesundheit fällt nicht ins Bodenlose: ${x.minHealth}`); assert.strictEqual(x.s.status, 'alive', 'Jüngere sterben nicht an der Welle'); }
  const prot = []; for (let k = 0; k < 6; k++) prot.push(run({ over: { firstName: 'Karl' + k }, dayShift: k * 3, prep: (s) => { s.epi.hygUntil = 99999; s.epi.shieldUntil = 99999; s.insurance.gesundheit = true; } }));
  assert.ok(prot.reduce((a, x) => a + x.cases, 0) <= totalCases, 'Schutz hilft');
  const old = []; for (let k = 0; k < 6; k++) old.push(run({ over: { firstName: 'Opa' + k }, old: true, dayShift: k * 3 }));
  for (const x of old) assert.ok(x.minHealth >= 5 || x.s.status !== 'alive');
});

test('Schutz-Aktionen: Hygienepaket, Impfung (nur mit Impfstoff), Schutzkonzept; Kosten, Fehler, Hospital-Rabatt', () => {
  noEpi();
  const user = { meta: {}, coins: 1, efs_pool: 0 };
  const act = (s, what) => actions.run('epiProtect', { world: w, state: s, input: { what }, user, now: Date.now() });
  const s = mk(2020, 165); s.money = 1e7;
  const m0 = s.money;
  const r = act(s, 'hygiene'); assert.ok(r.msg && s.money < m0 && EP.hygOn(s));
  assert.throws(() => act(s, 'hygiene'), /wirkt noch/);
  assert.throws(() => act(s, 'vaccine'), /Impfstoff/);
  const s2 = mk(2021, 80); s2.money = 1e7; act(s2, 'vaccine'); assert.ok(EP.vaccinatedFor(s2, 'covid2') || EP.vaccinatedFor(s2, 'covid3'));
  assert.throws(() => act(s2, 'vaccine'), /schon geimpft/);
  const poor = mk(2020, 165); poor.money = 0; assert.throws(() => act(poor, 'hygiene'), /fehlt/);
  const calm = mk(1950, 100); calm.money = 1e7; assert.throws(() => act(calm, 'hygiene'), /keine Seuche/);
  assert.throws(() => act(s, 'x'), /Unbekannte/);
  const sh = mk(2020, 165); sh.money = 1e7; assert.ok(/Kontakte/.test(act(sh, 'shield').msg));
  const owner = mk(2020, 165); owner.money = 1e7; owner.companies = [firm(owner, { pkey: 'wirt', cash: 1e7 })]; const cash0 = owner.companies[0].cash; assert.ok(/Schutzkonzept/.test(act(owner, 'shield').msg) && owner.companies[0].cash < cash0);
  // Impfung wirkt: Risiko sinkt stark
  const ps = EP.personalRisk(w, s2, 2021, 'covid2').total; const pn = EP.personalRisk(w, mk(2021, 80), 2021, 'covid2').total; assert.ok(ps < pn * 0.3);
  // Krankenhausprogramm macht Impfung günstiger
  goods.setPolicies(goods.buildPolicies([{ kind: 'hospital', val: 3, region: city('Braunschweig').state }]));
  const sitH = EP.situation(w, 2021, 80, city('Braunschweig'), goods.effectsFor(w, city('Braunschweig').id));
  assert.ok(EP.prices(w, mk(2021, 80), 2021, sitH).vaccine < EP.prices(w, mk(2021, 80), 2021, null).vaccine);
  goods.setPolicies(null);
});

test('Beschlüsse: Befugnisse, Prüfung, Vorschau mit Zielkonflikt, Wirkung und Deckel durch den Rahmen', () => {
  goods.setPolicies(null);
  const c = city('Braunschweig');
  const kinds = (i) => goods.powersOf(w, i, 2020).map((p) => p.kind);
  assert.ok(['hygiene', 'winterhilfe'].every((k) => kinds(1).includes(k)) && !kinds(1).includes('erntefest'));
  assert.ok(kinds(2).includes('erntefest') && kinds(3).includes('hospital') && kinds(4).includes('lockframe'));
  assert.ok(['pandemic', 'vaccine', 'kurzarbeit', 'erntehilfe'].every((k) => kinds(5).includes(k)));
  assert.ok(!kinds(5).includes('hospital') && !kinds(0).length);
  assert.throws(() => goods.normalizePolicy(w, 1, c, 2020, { kind: 'pandemic', value: 2 }), /Befugnis/);
  assert.throws(() => goods.normalizePolicy(w, 5, c, 2020, { kind: 'pandemic', value: 4 }), /nicht erlaubt/);
  assert.throws(() => goods.normalizePolicy(w, 5, c, 2020, { kind: 'pandemic', value: 1.5 }), /nicht erlaubt/);
  const row = goods.normalizePolicy(w, 2, c, 2020, { kind: 'hygiene', value: 2 });
  assert.deepStrictEqual([row.kind, row.val, row.scope_city, row.region], ['hygiene', 2, c.id, null]);
  assert.strictEqual(goods.normalizePolicy(w, 3, c, 2020, { kind: 'hospital', value: 3 }).region, c.state);
  for (const [off, kind, val] of [[2, 'hygiene', 3], [2, 'winterhilfe', 2], [2, 'erntefest', 1], [3, 'hospital', 2], [4, 'lockframe', 3], [5, 'pandemic', 0], [5, 'pandemic', 3], [5, 'vaccine', 2], [5, 'kurzarbeit', 3], [5, 'erntehilfe', 1]]) {
    const r = goods.normalizePolicy(w, off, c, 2020, { kind, value: val });
    const pv = goods.previewPolicy(w, r, 2020, c.id);
    assert.ok(pv.lines.length >= 1 && pv.lines[0].key === kind, kind);
    if (kind !== 'lockframe' && kind !== 'pandemic') assert.ok(pv.lines.some((l) => l.key === 'levy' && l.a > 0), `${kind} hat eine Umlage`);
  }
  const p3 = goods.previewPolicy(w, goods.normalizePolicy(w, 5, c, 2020, { kind: 'pandemic', value: 3 }), 2020, c.id).lines[0];
  assert.strictEqual(p3.c, 'unpopular'); assert.ok(p3.b.capped && p3.b.cap === 2, 'Standardrahmen deckelt auf Stufe 2');
  const p2 = goods.previewPolicy(w, goods.normalizePolicy(w, 5, c, 2020, { kind: 'pandemic', value: 2 }), 2020, c.id).lines[0].b;
  assert.ok(p2.infect > 0 && p2.gastro > 0 && p2.gastro > p2.other);
  // Wirkung
  const rows = [{ kind: 'hygiene', val: 3, scope_city: c.id }, { kind: 'winterhilfe', val: 2, scope_city: c.id }, { kind: 'erntefest', val: 3, scope_city: c.id }, { kind: 'hospital', val: 2, region: c.state }, { kind: 'lockframe', val: 3 }, { kind: 'pandemic', val: 3 }, { kind: 'vaccine', val: 2 }, { kind: 'kurzarbeit', val: 3 }, { kind: 'erntehilfe', val: 3 }];
  goods.setPolicies(goods.buildPolicies(rows));
  const ef = goods.effectsFor(w, c.id);
  assert.deepStrictEqual([ef.epi.hyg, ef.epi.hospital, ef.epi.level, ef.epi.cap, ef.epi.vaccLvl], [3, 2, 3, 3, 2]);
  assert.ok(ef.epi.kurz === 0.65 && ef.harvest.aid === 0.9 && ef.season.winterhilfe === 0.35 && ef.season.erntefest === 3);
  assert.ok(ef.levy > 1.5, 'Umlagen summieren sich');
  assert.strictEqual(goods.effectsFor(w, city('München').id).epi.hyg, 0, 'Stadtbeschluss wirkt nur in der Stadt');
  assert.strictEqual(goods.effectsFor(w, city('Köln').id).epi.hospital, 0, 'Landesbeschluss nur im Bundesland');
  assert.strictEqual(goods.effectsFor(w, city('München').id).epi.level, 3, 'Bundesbeschluss gilt überall');
  // Winterhilfe senkt Heizkosten, Erntefest hebt Gastro im Herbst, Kurzarbeit mildert, Erntehilfe hilft Bauern
  const s = mk(1950, 15); s.housing = { type: 'rent', cityId: c.id, base: 3000, rooms: 1 }; s.cityId = c.id;
  const withHelp = core.dailyFlows(w, s).exp.lodging; goods.setPolicies(null); const without = core.dailyFlows(w, s).exp.lodging;
  assert.ok(withHelp < without);
  goods.setPolicies(goods.buildPolicies(rows.filter((r) => r.kind === 'erntefest')));
  const so = mk(1950, 280); so.cityId = c.id; const f = firm(so, { pkey: 'wirt' });
  const fest = biz.companyFlows(w, so, f, 1950).sfx.season; goods.setPolicies(null); assert.ok(fest > biz.companyFlows(w, so, f, 1950).sfx.season);
  goods.setPolicies(goods.buildPolicies([{ kind: 'erntehilfe', val: 3 }]));
  const sf = mk(1946, 262); sf.cityId = c.id; const farm = firm(sf, { pkey: 'landwirt' }); const aid = biz.companyFlows(w, sf, farm, 1946).sfx.harvest; goods.setPolicies(null);
  assert.ok(aid > biz.companyFlows(w, sf, farm, 1946).sfx.harvest);
  // Ansehen: Lockdown umstritten, Hygiene beliebt
  const RP = require('../src/game/reputation');
  assert.strictEqual(RP.policyMood('pandemic', 3), -1); assert.strictEqual(RP.policyMood('pandemic', 1), 1); assert.strictEqual(RP.policyMood('pandemic', 2), 0);
  for (const k of ['hygiene', 'winterhilfe', 'erntefest', 'hospital', 'vaccine', 'kurzarbeit', 'erntehilfe']) assert.strictEqual(RP.policyMood(k, 2), 1, k);
  goods.setPolicies(null);
});

test('Engine: Jahre durch die Seuchenzeit laufen ohne ungültige Zustände (Jahreszeit-Meldungen, Ernte, Krankheit)', () => {
  noEpi();
  for (const [year, over] of [[1957, {}], [1968, { firstName: 'Anna' }], [2020, {}], [2049, {}]]) {
    const s = mk(year, 250, over); s.day = (year - 1945) * 365 + 250 + 120; s.person.birthDay = s.day - 30 * 365; // jenseits des Anfängerschutzes
    s.housing = { type: 'rent', cityId: s.cityId, base: 3000, rooms: 1 }; s.money = 5e7; s.cityId = city('München').id;
    s.companies = [firm(s, { pkey: 'wirt', cityId: s.cityId, cash: 1000 })];
    const titles = new Set();
    for (let i = 0; i < 365 * 2 && s.status === 'alive'; i++) {
      if (s.meters.fridge < 40) s.meters.fridge = 100;
      advance(w, s, 1); s.interrupts = [];
      for (const n of s.notices.slice(0, 3)) titles.add(n.title.replace(/\d{4}/, 'JJJJ'));
      assert.ok(Number.isFinite(s.money) && s.meters.health <= 100 && s.meters.rest >= 0 && s.meters.wellbeing >= 0 && s.meters.wellbeing <= 100, `${year} Tag ${i}`);
      assert.ok(s.companies.every((c) => Number.isFinite(c.cash)));
    }
    assert.ok([...titles].some((t) => /Jahreszeit: /.test(t)), `Jahreszeitenwechsel wird gemeldet ${year} ${s.status} ${s.day} ${[...titles].join('|')}`);
    assert.ok([...titles].some((t) => /Erntebericht/.test(t)), 'Erntebericht erscheint');
    if (year === 1957 || year === 2020 || year === 2049) assert.ok([...titles].some((t) => /Seuchenwarnung|Höhepunkt|Entwarnung|erkrankt/.test(t)), `${year}: Seuche wird gemeldet`);
  }
});

test('Zeitungs- und Ansichtsdaten: Jahreszeit, Ernte und Seuche stehen im Spielzustand', () => {
  noEpi();
  const { present } = require('../src/game/present');
  const s = mk(2020, 100); s.cityId = city('München').id;
  const v = present(w, s, { meta: {}, coins: 1, efs_pool: 0 }, Date.now());
  assert.ok(v.season && v.season.key === 'fruehling' && v.season.epi.active && v.season.harvest.label && v.season.epi.protect.hygiene.cost > 0);
  assert.ok(v.season.epi.measure.level === 2 && v.season.heat);
  const sec = Object.keys(v.season.sectors || {}); assert.ok(Array.isArray(v.season.sectors) && sec.length);
  assert.ok(dateOf(s.day, s.startYear).doy === 100);
});
