'use strict';
// Tageszeit/Jahreszeit der 3D-Stadt (reine Funktionen im Client-Modul).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const load = async () => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../public/js/game/atmosphere.js')).toString('base64'));

test('Spieluhr: Stunde aus Bruchteil des Spieltags, ohne Uhr Mittag', async () => {
  const { gameHour } = await load();
  assert.equal(gameHour({ perMs: 0, carry: 0 }, 0, 5), 12);
  const perMs = 365 / 86400000; // ein Spieltag ≈ 4 Minuten
  assert.ok(Math.abs(gameHour({ perMs, carry: .25 }, 1000, 1000) - 6) < 1e-9);
  const dayMs = 1 / perMs;
  assert.ok(Math.abs(gameHour({ perMs, carry: 0 }, 0, dayMs / 2) - 12) < 1e-6);
  const h = gameHour({ perMs, carry: .9 }, 0, dayMs * 3.4);
  assert.ok(h >= 0 && h < 24);
});

test('Jahreszeit: Winter schneit, Herbst färbt, Sommer ist grün, Übergänge stetig', async () => {
  const { seasonAt, monthOf } = await load();
  assert.equal(monthOf(0), 0); assert.equal(monthOf(31), 1); assert.equal(monthOf(364), 11);
  assert.equal(seasonAt(15).key, 'winter'); assert.ok(seasonAt(15).snow > .9);
  assert.equal(seasonAt(180).key, 'summer'); assert.equal(seasonAt(180).snow, 0);
  assert.equal(seasonAt(292).key, 'autumn'); assert.ok(seasonAt(292).autumn > .9);
  assert.ok(seasonAt(112).blossom > .9);
  let last = seasonAt(0).snow;
  for (let d = 1; d < 365; d++) { const s = seasonAt(d).snow; assert.ok(Math.abs(s - last) < .12, `Sprung bei Tag ${d}`); last = s; }
});

test('Beleuchtung: Nacht dunkel mit Fensterglühen, Mittag hell, Richtung normiert, Übergänge stetig', async () => {
  const { atmosphereAt, seasonAt } = await load();
  const s = seasonAt(180), noon = atmosphereAt(12, s), night = atmosphereAt(0, s);
  assert.ok(noon.sunIntensity > night.sunIntensity * 2.5);
  assert.equal(noon.glow, 0); assert.equal(night.glow, 1); assert.ok(night.isNight && !noon.isNight);
  for (const h of [0, 5, 7, 12, 19, 23.9]) { const a = atmosphereAt(h, s); assert.ok(Math.abs(Math.hypot(...a.sunDir) - 1) < 1e-9); assert.ok(a.sunDir[1] > 0, 'Licht kommt von oben'); }
  let prev = atmosphereAt(0, s);
  for (let h = .1; h < 24.01; h += .1) { const a = atmosphereAt(h % 24, s); assert.ok(Math.abs(a.sunIntensity - prev.sunIntensity) < .35, `Sprung bei ${h}`); assert.ok(Math.abs(a.glow - prev.glow) < .2); prev = a; }
  assert.ok(atmosphereAt(12, seasonAt(15)).sunDir[1] < atmosphereAt(12, s).sunDir[1], 'Wintersonne steht tiefer');
});
