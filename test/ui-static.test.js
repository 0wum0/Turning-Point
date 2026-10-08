'use strict';
/** Statische Prüfungen der Oberfläche: Icon-Namen existieren, alle Client-Module sind syntaktisch gültig. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const walk = (dir, ext, out = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'node_modules') walk(p, ext, out); } else if (ext.test(f.name)) out.push(p);
  }
  return out;
};
const rel = (p) => path.relative(ROOT, p);

test('alle verwendeten Icons (icon(\'name\'), icons.svg#i-name, icon: \'name\') sind in icons.svg definiert', () => {
  const svg = fs.readFileSync(path.join(ROOT, 'public/img/icons.svg'), 'utf8');
  const defined = new Set([...svg.matchAll(/id="i-([a-z0-9-]+)"/g)].map((m) => m[1]));
  const files = [...walk(path.join(ROOT, 'public/js'), /\.js$/), ...walk(path.join(ROOT, 'views'), /\.ejs$/), ...walk(path.join(ROOT, 'src'), /\.js$/)];
  const missing = [];
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    const names = [
      ...[...t.matchAll(/\bicon\(\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]),
      ...[...t.matchAll(/icons\.svg#i-([a-z0-9-]+)/g)].map((m) => m[1]),
      ...[...t.matchAll(/\bicon\s*:\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]),
    ];
    for (const n of names) if (!defined.has(n)) missing.push(`${rel(f)}: ${n}`);
  }
  assert.deepEqual(missing, [], `Fehlende Icon-Symbole:\n${missing.join('\n')}`);
});

test('Client-Module (ES-Module) und klassische Skripte haben gültige Syntax', () => {
  const bad = [];
  for (const f of walk(path.join(ROOT, 'public/js/game'), /\.js$/)) {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(f), encoding: 'utf8' });
    if (r.status !== 0) bad.push(`${rel(f)}: ${(r.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'Fehler'}`);
  }
  for (const f of [...walk(path.join(ROOT, 'public/js'), /\.js$/).filter((p) => !p.includes(`${path.sep}game${path.sep}`)), path.join(ROOT, 'public/sw.js')]) {
    try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f }); } catch (e) { bad.push(`${rel(f)}: ${e.message}`); }
  }
  assert.deepEqual(bad, []);
});

test('Modale: oberstes Fenster schließt per Escape, Fokus-Falle und Beschriftung sind verdrahtet', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'public/js/game/ui.js'), 'utf8');
  assert.match(ui, /aria-labelledby/);
  assert.match(ui, /e\.key === 'Tab'/);
  assert.match(ui, /top !== back/);
});

test('Klick-Handler: fehlgeschlagene Aufrufe erzeugen keine unbehandelten Ablehnungen; Kartensuche bleibt absolut positioniert', () => {
  const main = fs.readFileSync(path.join(ROOT, 'public/js/game/main.js'), 'utf8');
  assert.match(main, /addEventListener\('unhandledrejection'/);
  const css = fs.readFileSync(path.join(ROOT, 'public/css/game.css'), 'utf8');
  assert.match(css, /\.map-search\.pl-wrap \{ position: absolute; \}/);
  const chat = fs.readFileSync(path.join(ROOT, 'public/js/game/chatmodal.js'), 'utf8');
  assert.match(chat, /removeEventListener\('tp-live-chat'/);
});

test('Englisches Wörterbuch enthält die Ergänzungen aus client-H und die Muster greifen', () => {
  let script = '';
  const res = { send: (s) => { script = s; }, type() { return res; }, set() { return res; } };
  require('../src/i18n').dictScript({}, res);
  const D = JSON.parse(script.replace(/^window\.TP_I18N=/, '').replace(/;$/, ''));
  assert.equal(D.exact['Arbeit suchen'], 'Look for work');
  const tr = (t) => { for (const [re, rep] of D.patterns) { const r = new RegExp(re); if (r.test(t)) return t.replace(r, rep); } return D.exact[t]; };
  assert.equal(tr('Wahlkampf 2k DM · Einkommen unbezahlt · Kraft −6/Tag'), 'Campaign 2k DM · Income unpaid · Energy −6/day');
  assert.equal(tr('Anna Test stirbt (verhungert).'), 'Anna Test dies (of starvation).');
});
