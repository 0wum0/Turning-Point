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

test('Gesellschaft: jeder Knopf der Oberfläche ist verdrahtet, jede Server-Adresse existiert, Glossarbegriffe sind vorhanden', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'public/js/game/civic.js'), 'utf8');
  const routes = fs.readFileSync(path.join(ROOT, 'src/routes/civic.js'), 'utf8');
  // Auswahlen der Handler (on(root, 'click', '[data-x]')) ↔ Attribute in den Vorlagen
  const sels = new Set([...ui.matchAll(/on\([a-z.]+, 'click', '\[(data-[a-z-]+)\]'/g)].map((m) => m[1]));
  assert.ok(sels.size >= 12, [...sels].join());
  for (const a of sels) assert.ok(new RegExp(` ${a}(=|[ >])`).test(ui), `Kein Knopf mit ${a}`);
  // API-Adressen: /api/civic/... im Client ↔ router.<verb>('/...') im Server
  const served = new Set([...routes.matchAll(/router\.(?:get|post)\('([^']*)'/g)].map((m) => m[1].replace(/:[a-z]+(\(\\\\d\+\))?/g, ':x')));
  for (const m of ui.matchAll(/\/api\/civic(\/[^'`"?]*)?/g)) {
    const p = (m[1] || '/').replace(/\$\{[^}]+\}/g, ':x');
    if (p === '/') { assert.ok(served.has('/'), 'GET /'); continue; }
    assert.ok(served.has(p), `Server kennt ${p} nicht`);
  }
  // Glossarbegriffe: term('…') nennt vorhandene Schlüssel
  const gl = fs.readFileSync(path.join(ROOT, 'public/js/game/glossary-civic.js'), 'utf8');
  const keys = new Set([...gl.matchAll(/^\s*\['([^']+)'/gm)].map((m) => m[1]));
  for (const m of ui.matchAll(/term\('([^']+)'/g)) assert.ok(keys.has(m[1]), `Glossar fehlt: ${m[1]}`);
  // Oberfläche ist an Übersicht, Gesellschaft und Live angebunden
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/views/society.js'), 'utf8'), /bindCivic\(root, ctx\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/views/overview.js'), 'utf8'), /civicMini\(ctx\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/live.js'), 'utf8'), /tp-live-civic/);
});

test('Betrieb 2.0: Knöpfe sind verdrahtet, Aktionen existieren, Glossar/Spots vorhanden; Classic und Design V2 sind angebunden', () => {
  const ops = fs.readFileSync(path.join(ROOT, 'public/js/game/ops.js'), 'utf8');
  const sels = new Set([...ops.matchAll(/on\(root, 'click', '\[(data-[a-z-]+)\]'/g)].map((m) => m[1]));
  assert.ok(sels.size >= 5, [...sels].join());
  for (const a of sels) assert.ok(new RegExp(` ${a}(=|[ >])`).test(ops), `Kein Knopf mit ${a}`);
  // Aktionsnamen im Client ↔ A.<name> im Server
  const A = require('../src/game/actions').ACTIONS;
  const used = new Set([...ops.matchAll(/(?:ctx\.act|act)\('([A-Za-z]+)'/g)].map((m) => m[1]).concat([...ops.matchAll(/const name = [^;]+;/g)].flatMap((m) => [...m[0].matchAll(/'(biz[A-Za-z]+)'/g)].map((x) => x[1]))));
  for (const n of used) assert.ok(A.includes(n), `Aktion ${n} fehlt im Server`);
  for (const n of ['opsBuild', 'opsRemove', 'bizPraise', 'bizBonus', 'bizParty', 'bizGift', 'bizWarn', 'bizSecurity']) assert.ok(A.includes(n), n);
  // Glossar: term('…') nennt vorhandene Schlüssel
  const gl = fs.readFileSync(path.join(ROOT, 'public/js/game/glossary-ops.js'), 'utf8');
  const keys = new Set([...gl.matchAll(/^\s*\['([^']+)'/gm)].map((m) => m[1]));
  for (const m of ops.matchAll(/term\('([^']+)'/g)) assert.ok(keys.has(m[1]), `Glossar fehlt: ${m[1]}`);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/glossary.js'), 'utf8'), /GLOSSARY_OPS/);
  // Einsteiger-Spots (Aufgaben „module“ und „lead“) zeigen auf vorhandene Elemente
  const ob = fs.readFileSync(path.join(ROOT, 'public/js/game/onboarding.js'), 'utf8');
  assert.match(ob, /modules: \{ sel: '\[data-ops-modules\]'/); assert.match(ob, /climate: \{ sel: '\[data-ops-climate\]/);
  assert.match(ops, /data-ops-modules/); assert.match(ops, /data-ops-climate/);
  // Classic: Betriebskarte bindet die Oberfläche ein; Teamdialog führt einzelne Mitarbeiter
  const biz = fs.readFileSync(path.join(ROOT, 'public/js/game/views/business.js'), 'utf8');
  assert.match(biz, /opsBox\(c, v, ctx\)/); assert.match(biz, /bindOps\(root, ctx\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/talents.js'), 'utf8'), /memberLead\(c, x, cur\)/);
  // Design V2: Innenraum des Betriebs mit Lager, Schutz & Brand und Aushang; Stadtgebäude zeigen Module; Live-Ereignis „business“ lädt nach
  const rooms = fs.readFileSync(path.join(ROOT, 'public/js/game/rooms.js'), 'utf8');
  for (const id of ['stock', 'safety', 'board']) assert.match(rooms, new RegExp(`spot\\([a-zA-Z]+, '${id}'`));
  assert.match(rooms, /\['stock', 'Lager', 'package'\], \['safety', 'Schutz & Brand', 'shield'\], \['board', 'Betriebsklima', 'smile'\]/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/city-buildings.js'), 'utf8'), /b\.mods\.brand >= 1/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/aerial.js'), 'utf8'), /mods:b\.mods/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/live.js'), 'utf8'), /business: \['business', 'overview'\]/);
  // Der Server liefert, was die Oberfläche braucht
  const { buildingsFor } = require('../src/game/places'); assert.ok(buildingsFor.toString().includes('mods:'));
});

test('Charakterblatt: Knöpfe sind verdrahtet, Aktionen existieren, Glossar/Spots vorhanden; Classic und Design V2 sind angebunden', () => {
  const ch = fs.readFileSync(path.join(ROOT, 'public/js/game/char.js'), 'utf8');
  const sels = new Set([...ch.matchAll(/on\(root, '(?:click|change)', '\[(data-[a-z-]+)\]'/g)].map((m) => m[1]));
  assert.ok(sels.size >= 8, [...sels].join());
  for (const a of sels) assert.ok(new RegExp(`${a}(=|[ >])`).test(ch), `Kein Knopf mit ${a}`);
  assert.ok(!/(?<!html)`data-[a-z-]+=/.test(ch), 'Attribute dürfen nicht als Text in html`` stehen (würden maskiert)');
  const A = require('../src/game/actions').ACTIONS;
  const used = new Set([...ch.matchAll(/run\('([A-Za-z]+)'/g)].map((m) => m[1]));
  for (const n of used) assert.ok(A.includes(n), `Aktion ${n} fehlt im Server`);
  for (const n of ['chTrain', 'chAuto', 'chBuy', 'chSell', 'chRepair', 'chService']) { assert.ok(A.includes(n), n); assert.ok(used.has(n), `Oberfläche ruft ${n} auf`); }
  const gl = fs.readFileSync(path.join(ROOT, 'public/js/game/glossary-char.js'), 'utf8');
  const keys = new Set([...gl.matchAll(/^\s*\['([^']+)'/gm)].map((m) => m[1]));
  for (const m of ch.matchAll(/term\('([^']+)'/g)) assert.ok(keys.has(m[1]), `Glossar fehlt: ${m[1]}`);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/glossary.js'), 'utf8'), /GLOSSARY_CHAR/);
  // Einsteiger-Spots zeigen auf vorhandene Elemente
  const ob = fs.readFileSync(path.join(ROOT, 'public/js/game/onboarding.js'), 'utf8');
  assert.match(ob, /xp: \{ sel: '\[data-ch-best\]/); assert.match(ob, /gear: \{ sel: '\[data-ch-slot="kleidung"\]/); assert.match(ob, /rank: \{ sel: '\[data-ch-ladder\]'/);
  assert.match(ch, /data-ch-xp/); assert.match(ch, /data-ch-gear/); assert.match(ch, /data-ch-ladder/); assert.match(ch, /data-ch-slot="\$\{s\.key\}"/);
  // Seite im Hauptmenü, im Dock von Design V2, in der Übersicht und im Live-Kanal
  const main = fs.readFileSync(path.join(ROOT, 'public/js/game/main.js'), 'utf8');
  assert.match(main, /import character from '\.\/views\/character\.js'/); assert.match(main, /family, character, legacy/); assert.match(main, /character: 'character'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/design.js'), 'utf8'), /'overview', 'character', 'housing'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/views/overview.js'), 'utf8'), /charMini\(ctx\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/live.js'), 'utf8'), /character: \['character', 'overview'\]/);
  // Design V2: Garderobe im Wohnhaus öffnet das Charakterblatt
  const rooms = fs.readFileSync(path.join(ROOT, 'public/js/game/rooms.js'), 'utf8');
  assert.match(rooms, /\['wardrobe', 'Garderobe', 'shirt'\]/); assert.match(rooms, /spot\(wd, 'wardrobe'[^;]+'character'/);
  // Zeitung zeigt Vorab-Angebote; Profil zeigt den Rang
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/views/newspaper.js'), 'utf8'), /h\.vip/); assert.match(fs.readFileSync(path.join(ROOT, 'public/js/game/views/social.js'), 'utf8'), /s\.rankName/);

});
