'use strict';
/**
 * Politik und Verkehr: Amtsinhaber bestimmen den Rahmen für Handelsrouten und Fracht – mit demselben Mechanismus wie die Wirtschafts- und
 * Gerichtspolitik (src/lib/policies.js, court-policy.js): EIN Beschluss je Amtszeit (Tabelle transport_policies, UNIQUE je Inhaber+Amtszeit),
 * Vorschau vor der Bestätigung, erlischt mit der Amtszeit, Meldung im Tagesblatt, Wirkung auf das Ansehen des Amtsinhabers.
 *   Stadtrat / Bürgermeister   Bahnhofs-, Hafen- oder Flughafenausbau der Stadt (Anschlussstufe, schnelleres Umladen, Umlage) und Maut/Hafengebühr
 *   Landtag                    Straßenbauprogramm: Straßenfracht in Strecken des Bundeslandes schneller und billiger (Umlage)
 *   Bundestag                  Rahmen: höchste Stadtmaut im ganzen Land
 *   Bundeskanzler              Autobahn-/Bahnnetz-Investitionsprogramm: LKW und Bahn im ganzen Land schneller und billiger (Umlage)
 * Der Einfuhrzoll (Kanzler, Wirtschaftspolitik) trifft zusätzlich Hafen- und Luftfracht (siehe game/transport.js).
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const live = require('./live');
const service = require('../game/service');
const goods = require('../game/goods');
const T = require('../game/transport');
const tagesblatt = require('./tagesblatt');
const { ActionError } = require('../game/actions');
const { notice, chronicle } = require('../game/core');
const { yearOf } = require('../game/calendar');

const fail = (m) => { throw new ActionError(m); };
const msPerGameDay = () => 86400000 / Math.max(1, Number(settings.get('game.clock_days_per_day')) || 365);
const pc = () => T.C().policy;
const enabled = () => T.C().on && pc().enabled !== false;
const POWERS = { 1: ['hub', 'toll'], 2: ['hub', 'toll'], 3: ['road'], 4: ['tollframe'], 5: ['net'] };
const KINDS = {
  hub: { name: 'Bahnhofs-, Hafen- oder Flughafenausbau', scope: 'city', what: 'Baut den Anschluss deiner Stadt aus: mehr Verkehrsträger, schnelleres Umladen – Betriebe zahlen dafür eine Umlage' },
  toll: { name: 'Maut und Hafengebühr der Stadt', scope: 'city', what: 'Fracht von und nach deiner Stadt wird teurer (oder mit Gebührenfreiheit billiger)' },
  road: { name: 'Straßenbauprogramm (Land)', scope: 'region', what: 'Straßenfracht in deinem Bundesland wird schneller und billiger – Betriebe zahlen eine Umlage' },
  tollframe: { name: 'Rahmen für Maut und Hafengebühren (Bund)', scope: 'nation', what: 'Wie hoch Städte Maut und Hafengebühr höchstens verlangen dürfen' },
  net: { name: 'Autobahn- und Bahnnetz-Programm (Bund)', scope: 'nation', what: 'LKW und Bahn im ganzen Land werden schneller und billiger – Betriebe zahlen eine Umlage' },
};
const FOCUS = { rail: 'Bahnhof und Güterbahnhof', port: 'Hafen', air: 'Flughafen' };
const FOCUS_LEVEL = { rail: 'Bahnanschluss', port: 'Hafenanschluss', air: 'Flughafenanschluss' };
const LV = ['', 'Stufe 1 (Ausbau)', 'Stufe 2 (großer Ausbau)', 'Stufe 3 (Drehkreuz)'];

/* ---- Zwischenspeicher der wirksamen Beschlüsse ---- */
let ACTIVE = [];
let LOCAL = { city: new Map(), region: new Map(), nation: { net: 0, frame: null } };

/** Wirkung für eine Stadt (rein lesend). */
function effects(cityId) {
  const c = LOCAL.city.get(cityId) || {}; const hub = c.hub || {};
  return { rail: hub.rail || 0, port: hub.port || 0, air: hub.air || 0, toll: c.toll || 0, net: LOCAL.nation.net || 0, frame: LOCAL.nation.frame };
}

async function refresh() {
  const world = await require('../game/world').get();
  const rows = await db.query(
    `SELECT p.*, ps.office, ps.status, ps.name holder, u.social_public FROM transport_policies p JOIN player_stats ps ON ps.user_id = p.user_id JOIN users u ON u.id = p.user_id
     WHERE p.expires_at > ? ORDER BY p.id`, [Date.now()]);
  const offices = world.econ.politics.offices;
  const valid = rows.filter((r) => r.status === 'alive' && r.office === (offices[r.office_idx] || {}).name);
  const next = { city: new Map(), region: new Map(), nation: { net: 0, frame: null } };
  const k = pc(); const levy = { city: new Map(), region: new Map(), nation: 0 };
  const tollBy = new Map();
  for (const r of valid) {
    const val = Number(r.val);
    if (r.kind === 'hub' && FOCUS[r.good] && val >= 1 && val <= 3) {
      const c = next.city.get(r.scope_city) || { hub: {}, toll: 0 };
      c.hub[r.good] = Math.max(c.hub[r.good] || 0, val); next.city.set(r.scope_city, c);
      levy.city.set(r.scope_city, (levy.city.get(r.scope_city) || 0) + (Number(k.hubLevy[val - 1]) || 0));
    } else if (r.kind === 'toll') {
      const b = tollBy.get(r.scope_city);
      if (!b || r.office_idx >= b.office_idx) tollBy.set(r.scope_city, r);
    } else if (r.kind === 'road' && val >= 1 && val <= 3) {
      next.region.set(r.region, { road: Math.max((next.region.get(r.region) || {}).road || 0, val) });
      levy.region.set(r.region, (levy.region.get(r.region) || 0) + (Number(k.roadLevy[val - 1]) || 0));
    } else if (r.kind === 'tollframe') next.nation.frame = Number(val);
    else if (r.kind === 'net' && val >= 1 && val <= 3) { next.nation.net = Math.max(next.nation.net, val); levy.nation += Number(k.netLevy[val - 1]) || 0; }
  }
  for (const [cityId, r] of tollBy) {
    const c = next.city.get(cityId) || { hub: {}, toll: 0 };
    c.toll = Number(r.val); next.city.set(cityId, c);
    if (c.toll < 0) levy.city.set(cityId, (levy.city.get(cityId) || 0) + Math.abs(c.toll) * 0.075);
  }
  LOCAL = next;
  T.setPolicy(next);
  goods.setTransportLevy(levy);
  ACTIVE = rows.map((r) => ({ id: r.id, kind: r.kind, val: Number(r.val), focus: r.good, cityId: r.scope_city, region: r.region, office: (offices[r.office_idx] || {}).name, holder: r.social_public ? r.holder : null, until: Number(r.expires_at), text: describe(world, r) }));
}

function describe(world, r) {
  const city = r.scope_city ? world.city(r.scope_city) : null; const place = city ? city.name : 'der Stadt';
  const v = Number(r.val);
  switch (r.kind) {
    case 'hub': return `${FOCUS[r.good] || 'Verkehrsausbau'} in ${place}: ${LV[v] || `Stufe ${v}`}`;
    case 'toll': return v === 0 ? `Maut und Hafengebühr in ${place}: keine` : v > 0 ? `Maut und Hafengebühr in ${place}: ${v} % auf die Fracht` : `Gebührenfreiheit in ${place}: Fracht ${-v} % billiger`;
    case 'road': return `Straßenbauprogramm in ${r.region || 'der Region'}: ${LV[v] || `Stufe ${v}`}`;
    case 'tollframe': return `Rahmen für Maut und Hafengebühren: höchstens ${v} %`;
    case 'net': return `Autobahn- und Bahnnetz-Programm: ${LV[v] || `Stufe ${v}`}`;
    default: return r.kind;
  }
}

/** Befugnisse eines Amts mit den aktuellen Grenzen (für die Oberfläche). */
function powersOf(officeIdx, world, city, year) {
  if (!enabled()) return [];
  const k = pc();
  return (POWERS[officeIdx] || []).map((kind) => {
    const base = { kind, ...KINDS[kind] };
    if (kind === 'hub') {
      const h = world && city ? T.hubs(city, year) : { rail: 0, port: 0, air: 0 };
      const focus = ['rail', 'port', 'air'].map((f) => ({ key: f, name: FOCUS[f], level: h[f] || 0 }));
      return { ...base, focus, options: [1, 2, 3].map((v) => ({ value: v, label: LV[v], levy: Number(k.hubLevy[v - 1]) || 0 })) };
    }
    if (kind === 'toll') {
      const frame = LOCAL.nation.frame != null ? LOCAL.nation.frame : T.C().tolls.maxCityPct;
      const opts = (k.cityTollOptions || []).filter((v) => v <= frame);
      return { ...base, frame, options: [-4, -2, ...opts].map((v) => ({ value: v, label: v === 0 ? 'Keine Maut' : v < 0 ? `Gebührenfreiheit (${-v} % billiger)` : `${v} % auf die Fracht` })) };
    }
    if (kind === 'road') return { ...base, options: [1, 2, 3].map((v) => ({ value: v, label: LV[v], speed: Number(k.roadSpeed[v - 1]) || 0, cost: Number(k.roadCost[v - 1]) || 0, levy: Number(k.roadLevy[v - 1]) || 0 })) };
    if (kind === 'tollframe') return { ...base, options: (k.cityTollFrame || []).map((v) => ({ value: v, label: v === 0 ? 'Keine Maut erlaubt' : `höchstens ${v} %` })) };
    if (kind === 'net') return { ...base, options: [1, 2, 3].map((v) => ({ value: v, label: LV[v], speed: Number(k.netSpeed[v - 1]) || 0, cost: Number(k.netCost[v - 1]) || 0, levy: Number(k.netLevy[v - 1]) || 0 })) };
    return base;
  });
}

function normalize(world, officeIdx, city, year, input) {
  const kind = String(input && input.kind || '');
  const p = powersOf(officeIdx, world, city, year).find((x) => x.kind === kind);
  if (!p) throw new Error('Dieses Amt hat dafür keine Befugnis.');
  const v = Number(input.value);
  if (!p.options.some((o) => Number(o.value) === v)) throw new Error('Dieser Wert ist nicht erlaubt.');
  const row = { office_idx: officeIdx, kind, good: null, val: v, scope_city: 0, region: null };
  if (kind === 'hub') {
    const f = String(input.good || ''); if (!p.focus.some((x) => x.key === f)) throw new Error('Bitte Bahnhof, Hafen oder Flughafen wählen.');
    const lv = (p.focus.find((x) => x.key === f) || {}).level || 0;
    if (f === 'port' && lv === 0 && !T.isCoastal(city) && (Number(city.pop) || 0) < 50000) throw new Error('Ein Hafen braucht Wasser: in dieser Stadt geht nur ein Ausbau, wenn sie größer ist.');
    if (f === 'air' && (Number(city.pop) || 0) < 50000) throw new Error('Einen Flughafen gibt es erst ab einer Stadt mit etwa 50.000 Einwohnern.');
    if (lv >= 3) throw new Error('Dieser Anschluss ist schon ein Drehkreuz – mehr Ausbau geht nicht.');
    row.good = f;
  }
  const scope = p.scope;
  if (scope === 'city') { row.scope_city = city ? city.id : 0; if (!row.scope_city) throw new Error('Dir fehlt eine Heimatstadt.'); }
  if (scope === 'region') { row.region = city ? city.state : null; if (!row.region) throw new Error('Dir fehlt eine Heimatregion.'); }
  return row;
}

const pct = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
function previewLines(world, row, city, year) {
  const k = pc();
  switch (row.kind) {
    case 'hub': {
      const h = T.hubs(city, year); const lv0 = h[row.good] || 0; const lv1 = Math.min(3, lv0 + row.val);
      const lines = [`${FOCUS_LEVEL[row.good]} von ${city.name} steigt von Stufe ${lv0} auf Stufe ${lv1}.`];
      if (lv0 === 0) lines.push(`Erstmals gibt es ${row.good === 'rail' ? 'Bahnfracht' : row.good === 'port' ? 'Schiffsfracht' : 'Luftfracht'} von und nach ${city.name}.`);
      lines.push(`Umladen dauert für Fracht von und nach ${city.name} je Stufe rund ${Math.round((Number(k.hubHandling) || 0.18) * 100)} % kürzer – Händler mit Routen dorthin sparen Zeit.`);
      lines.push(`Gegenfinanzierung: Alle Betriebe der Stadt zahlen dafür ${pct(Number(k.hubLevy[row.val - 1]) || 0)} Punkte Gewerbesteuer-Umlage.`);
      return lines;
    }
    case 'toll': {
      const v = row.val; const frame = LOCAL.nation.frame != null ? LOCAL.nation.frame : T.C().tolls.maxCityPct;
      const lines = [v === 0 ? `Fracht von und nach ${city.name} bleibt ohne Maut.` : v > 0 ? `Fracht von und nach ${city.name} wird um ${v} % teurer (Maut und Hafengebühr). Das Geld fließt in die Stadtkasse, nicht an Spieler.` : `Fracht von und nach ${city.name} wird um ${-v} % billiger (Gebührenfreiheit).`];
      if (v > 0) lines.push('Ein hoher Satz vertreibt Händler: Routen dorthin werden weniger lohnend, Lieferverträge teurer.');
      if (v < 0) lines.push(`Gegenfinanzierung: Alle Betriebe der Stadt zahlen dafür ${pct(Math.abs(v) * 0.075)} Punkte Gewerbesteuer-Umlage.`);
      lines.push(`Der Rahmen des Bundestags erlaubt gerade höchstens ${frame} %.`);
      return lines;
    }
    case 'road': { const i = row.val - 1; return [`Straßenbauprogramm in ${row.region}: LKW und Fuhrwerke auf Strecken in diesem Bundesland werden ${k.roadSpeed[i]} % schneller und ${k.roadCost[i]} % billiger (Strecken von und nach anderen Ländern zur Hälfte).`, `Gegenfinanzierung: Alle Betriebe im Bundesland zahlen dafür ${pct(Number(k.roadLevy[i]) || 0)} Punkte Gewerbesteuer-Umlage.`]; }
    case 'tollframe': return [row.val === 0 ? 'Städte dürfen im ganzen Land keine Maut und Hafengebühren mehr verlangen.' : `Städte dürfen im ganzen Land höchstens ${row.val} % Maut und Hafengebühr auf die Fracht verlangen.`, 'Bestehende höhere Sätze werden auf diese Grenze gekürzt.'];
    case 'net': { const i = row.val - 1; return [`LKW und Bahn werden im ganzen Land ${k.netSpeed[i]} % schneller und ${k.netCost[i]} % billiger – für alle Händler, Speditionen und Lieferverträge.`, `Gegenfinanzierung: Alle Betriebe im Land zahlen dafür ${pct(Number(k.netLevy[i]) || 0)} Punkte Gewerbesteuer-Umlage.`, 'Der Einfuhrzoll (Wirtschaftspolitik des Kanzlers) trifft zusätzlich Schiffs- und Luftfracht.']; }
    default: return [];
  }
}

async function selfTerm(userId) {
  const p = await service.peek(userId); if (!p || !p.state || p.state.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  return p;
}

/** Übersicht für „Handel & Transport → Dein Amt“. */
async function overview(userId) {
  const p = await service.peek(userId); if (!p || !p.state) return { enabled: false };
  const { w: world, state } = p; const t = state.politics && state.politics.term; const city = world.city(state.cityId); const year = yearOf(state.day, state.startYear);
  const out = {
    enabled: enabled(), local: local(state.cityId),
    active: ACTIVE.filter((a) => (!a.cityId || a.cityId === state.cityId) && (!a.region || (city && a.region === city.state))).map((a) => ({ kind: a.kind, text: a.text, office: a.office, holder: a.holder, hours: Math.max(0, Math.round((a.until - Date.now()) / 3600000)) })),
    office: null,
  };
  if (t) {
    const o = world.econ.politics.offices[t.idx] || {};
    out.office = { idx: t.idx, name: o.name, daysLeft: Math.max(0, t.endDay - state.day), cityOk: !t.cityId || t.cityId === state.cityId, powers: powersOf(t.idx, world, city, year), used: t.transportPolicy ? { kind: t.transportPolicy.kind, text: t.transportPolicy.text || '' } : null };
  }
  return out;
}

/** Wirkung am Wohnort in einfachen Zahlen (Karte in „Handel & Transport“). */
function local(cityId) {
  const e = effects(cityId); const k = pc(); const n = LOCAL.nation;
  return { rail: e.rail, port: e.port, air: e.air, toll: e.toll, net: e.net, netSpeed: e.net ? Number(k.netSpeed[e.net - 1]) || 0 : 0, netCost: e.net ? Number(k.netCost[e.net - 1]) || 0 : 0, frame: n.frame };
}

function rowFrom(world, state, input) {
  const t = state.politics && state.politics.term; if (!t) fail('Du hast kein Amt.');
  if (!enabled()) fail('Verkehrspolitik ist gerade nicht möglich.');
  if (t.cityId && t.cityId !== state.cityId) fail('Du bist nicht mehr in der Stadt, in der du gewählt wurdest.');
  try { return normalize(world, t.idx, world.city(state.cityId), yearOf(state.day, state.startYear), input || {}); } catch (e) { return fail(e.message); }
}

async function preview(userId, input) {
  const p = await selfTerm(userId); const row = rowFrom(p.w, p.state, input);
  return { text: describe(p.w, row), lines: previewLines(p.w, row, p.w.city(p.state.cityId), yearOf(p.state.day, p.state.startYear)) };
}

/** Beschluss fassen: einer je Amtszeit (getrennt von Wirtschafts- und Gerichtsbeschluss). */
async function set(userId, input) {
  const out = await service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const t = state.politics.term;
    const row = rowFrom(world, state, input);
    if (t.transportPolicy) fail('In dieser Amtszeit hast du schon einen Beschluss zum Verkehr gefasst. Mit der nächsten Wahl darfst du wieder entscheiden.');
    const key = `t${state.person.id}:${t.startDay}`;
    const expires = Date.now() + Math.max(1, t.endDay - state.day) * msPerGameDay();
    try {
      await conn.query('INSERT INTO transport_policies (user_id, term_key, office_idx, kind, good, val, scope_city, region, expires_at) VALUES (?,?,?,?,?,?,?,?,?)', [userId, key, row.office_idx, row.kind, row.good, row.val, row.scope_city, row.region, expires]);
    } catch (e) { if (e && e.code === 'ER_DUP_ENTRY') fail('In dieser Amtszeit hast du schon einen Beschluss zum Verkehr gefasst.'); throw e; }
    const text = describe(world, row);
    const RP = require('../game/reputation'); const mood = RP.policyMood(row.kind, row.val);
    if (mood) RP.queue(state, 'office', null, mood > 0 ? 'policy_popular' : 'policy_unpopular', row.kind);
    t.transportPolicy = { kind: row.kind, val: row.val, day: state.day, text };
    const office = world.econ.politics.offices[t.idx].name;
    chronicle(state, `${state.person.first} beschließt als ${office}: ${text}.`, 'politics');
    notice(state, { level: 'good', title: 'Beschluss gefasst', tab: 'society', text: `${text}. Er gilt bis zum Ende deiner Amtszeit.`, info: ['Als Amtsinhaber darfst du pro Amtszeit einen Beschluss zum Verkehr fassen.', 'Er verändert Zeit und Kosten der Fracht – für alle im Geltungsbereich, auch für dich.', 'Mit der nächsten Amtszeit darfst du neu entscheiden.'] });
    const nm = ctx.user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Amtsinhaber';
    await tagesblatt.post('election', `Beschluss: ${office}`, `Beschluss von ${nm} (${office}): ${text}.`, row.scope_city || 0, conn);
    return { msg: `Beschluss gefasst: ${text}.`, level: 'good' };
  }, { needAlive: true });
  await refresh().catch((e) => log.warn(`[verkehr] ${e.message}`));
  live.publish('trade', {}); live.publish('economy', {});
  return out;
}

function start() { refresh().catch(() => {}); }

module.exports = { effects, local, refresh, overview, preview, set, describe, powersOf, normalize, previewLines, start, POWERS, KINDS, FOCUS, _state: () => LOCAL };
