'use strict';
/** Englische Oberfläche: Jahreszeiten, Ernte und Seuchen – Servertexte (Meldungen, Zeitung, Beschlüsse, Aufgabe) und Oberflächentexte sind übersetzt. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { testWorld, input } = require('./helpers');
const settings = require('../src/settings');
const g = require('../src/i18n-game');
const SE = require('../src/game/seasons');
const HV = require('../src/game/harvest');
const EP = require('../src/game/epidemics');
const goods = require('../src/game/goods');
const { createCharacter } = require('../src/game/state');
const { advance } = require('../src/game/engine');
const { edition } = require('../src/game/newspaper');
const ob = require('../src/game/onboarding');

settings.DEFAULTS.talente.effects.strength = 0;
const w = testWorld();
const city = (n) => w.cityList.find((c) => c.name === n);
const SAME = new Set(['Winter', 'Oktoberfest', 'Lockdown']); // im Englischen gleich geschrieben
const CLEAN = (s) => typeof s === 'string' && s.length > 1 && /[A-Za-zÄÖÜäöü]/.test(s) && !SAME.has(s);

test('Servertexte: Jahreszeiten, Feste, Ernte, Wellen, Maßnahmen sind übersetzt', () => {
  const miss = [];
  const need = (t) => { if (CLEAN(t) && g.tr(t) === t) miss.push(t); };
  for (let d = 0; d < 365; d += 30) { const b = SE.seasonOf(d); need(b.name); need(b.tip); }
  for (const k of Object.values(SE.SECTOR_NAME)) need(k);
  for (const f of SE.FEST_DEF) { need(f.name); need(f.text); }
  for (const y of [1946, 1947, 1976, 1984, 2002, 2003, 2004, 2018, 2021, 1963, 1979, 1962, 1999, 2013, 2050]) { const r = HV.report(y, 'Sachsen'); need(r.label); if (r.note) need(r.note); const wx = HV.weatherOf(y); if (wx.name) need(wx.name); }
  for (const x of EP.waves(w)) need(x.name);
  for (const x of EP.MEASURE_NAME.concat(EP.MEASURE_SHORT)) need(x);
  for (const k of ['Kohleofen', 'Zentralheizung', 'Wärmepumpe']) need(k);
  for (const k of ['hygiene', 'winterhilfe', 'erntefest', 'hospital', 'lockframe', 'pandemic', 'vaccine', 'kurzarbeit', 'erntehilfe']) { need(goods.KINDS[k].name); need(goods.KINDS[k].what); for (const l of goods.SEAS_LV[k]) need(l); }
  assert.deepEqual(miss, []);
});

test('Servertexte: Meldungen einer Seuchenzeit, Zeitung, Schutz-Aktionen und Beschlüsse sind übersetzt', () => {
  const miss = [];
  const need = (t) => { if (CLEAN(t) && g.tr(t) === t) miss.push(t); };
  for (const year of [1957, 2020, 2049]) {
    const s = createCharacter(w, input(w), { meta: {} });
    s.day = (year - 1945) * 365 + 300; s.person.birthDay = s.day - 30 * 365; s.housing = { type: 'rent', cityId: s.cityId, base: 3000, rooms: 1 }; s.money = 5e7;
    const seen = new Set();
    for (let i = 0; i < 365 * 2 && s.status === 'alive'; i++) {
      s.meters.fridge = 100; advance(w, s, 1); s.interrupts = [];
      for (const n of s.notices.slice(0, 4)) {
        if (seen.has(n.id)) continue; seen.add(n.id);
        if (!/^(Jahreszeit|Erntebericht|Seuchenwarnung|Höhepunkt|Entwarnung|Du bist erkrankt|Wieder gesund)|in Braunschweig$/.test(n.title)) continue;
        need(n.title); need(n.text); (n.info || []).forEach(need);
      }
      if (i % 20 === 0) for (const n of edition(w, s, s.cityId).news) { if (n.type === 'press') { need(n.title); need(n.text); need(n.section); } }
    }
  }
  const user = { meta: {}, coins: 1, efs_pool: 0 }; const actions = require('../src/game/actions');
  const s = createCharacter(w, input(w), { meta: {} }); s.day = (2020 - 1945) * 365 + 150; s.money = 1e8;
  const tryAct = (what) => { try { return actions.run('epiProtect', { world: w, state: s, input: { what }, user, now: 1 }).msg; } catch (e) { return e.message; } };
  for (const what of ['hygiene', 'hygiene', 'vaccine', 'shield', 'x']) need(tryAct(what));
  s.companies = [{ id: 1, pkey: 'wirt', tier: 0, cityId: s.cityId, rooms: 4, staff: 2, manager: true, cash: 1e8, base: 1, abandoned: null }]; s.epi.shieldUntil = -1; need(tryAct('shield'));
  const pol = require('../src/lib/policies');
  const c = city('Braunschweig');
  for (const [kind, val] of [['hygiene', 2], ['winterhilfe', 1], ['erntefest', 3], ['hospital', 2], ['lockframe', 3], ['pandemic', 0], ['pandemic', 3], ['vaccine', 2], ['kurzarbeit', 1], ['erntehilfe', 2]]) {
    need(pol.describe(w, { kind, val, scope_city: c.id, region: c.state, good: null }));
  }
  const q = ob.QUESTS.find((x) => x.id === 'winter'); need(q.title); need(q.why);
  assert.deepEqual(miss, []);
});

test('Oberfläche: neue Dateien enthalten nur übersetzte Texte (Stichprobe der festen Wendungen)', () => {
  const dict = require('../src/i18n-data/client-P');
  const src = fs.readFileSync(path.join(__dirname, '../public/js/game/seasons.js'), 'utf8');
  const lits = [...src.matchAll(/<span>([^<${}]{3,})<\/span>/g)].map((m) => m[1].trim()).filter((t) => /[a-zäöü]{3}/.test(t));
  const miss = lits.filter((t) => !dict.exact[t] && !dict.patterns.some(([re]) => new RegExp(re).test(t)));
  assert.deepEqual(miss, []);
  const gl = fs.readFileSync(path.join(__dirname, '../public/js/game/glossary-season.js'), 'utf8');
  const texts = [...gl.matchAll(/^\s+\['[^']+', '[^']+', '([^']+)'\]/gm)].map((m) => m[1]);
  assert.ok(texts.length >= 8);
  assert.deepEqual(texts.filter((t) => !dict.exact[t]), []);
});
