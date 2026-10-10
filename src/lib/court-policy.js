'use strict';
/**
 * Politik und Recht: Amtsinhaber bestimmen den Rahmen der Gerichte – mit demselben Mechanismus wie die Wirtschaftspolitik (src/lib/policies.js):
 * EIN Beschluss je Amtszeit (Tabelle court_policies, UNIQUE je Inhaber+Amtszeit), Vorschau vor der Bestätigung, erlischt mit der Amtszeit,
 * Meldung im Tagesblatt. Alle Grenzen stehen in settings.gericht.politics.
 *   Stadtrat / Bürgermeister   Ordnungsamt: Polizeibudget der Stadt (stärkere Spuren, höhere Entdeckungschance, Umlage auf die Betriebe der Stadt)
 *   Landtag                    Strafrahmen: Aufschlag/Abschlag auf Geldstrafen im Bundesland
 *   Bundestag                  Strafgesetz: Strenge der Gerichte im ganzen Land
 *   Bundeskanzler              Verjährung der Spuren ODER Amnestie (einmal je Amtszeit, löscht leichte Sanktionen)
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const live = require('./live');
const service = require('../game/service');
const goods = require('../game/goods');
const tagesblatt = require('./tagesblatt');
const { ActionError } = require('../game/actions');
const { notice, chronicle } = require('../game/core');

const fail = (m) => { throw new ActionError(m); };
const cfg = () => (settings.get('gericht') || {}).politics || {};
const msPerGameDay = () => 86400000 / Math.max(1, Number(settings.get('game.clock_days_per_day')) || 365);
const POWERS = { 1: ['police'], 2: ['police'], 3: ['range'], 4: ['strict'], 5: ['limit', 'amnesty'] };
const KINDS = {
  police: { name: 'Ordnungsamt: Polizeibudget', scope: 'city', what: 'Mehr Streifen und Spurensicherung in deiner Stadt – oder Sparkurs' },
  range: { name: 'Strafrahmen (Land)', scope: 'region', what: 'Geldstrafen in deinem Bundesland werden milder oder härter' },
  strict: { name: 'Strafgesetz (Bund)', scope: 'nation', what: 'Wie streng die Gerichte im ganzen Land die Beweise werten' },
  limit: { name: 'Verjährung (Bund)', scope: 'nation', what: 'Wie lange Spuren vor Gericht verwertbar bleiben' },
  amnesty: { name: 'Amnestie (Bund)', scope: 'nation', what: 'Leichte Strafen im ganzen Land werden erlassen (Schadenersatz bleibt)' },
};
const POLICE_NAMES = { '-1': 'Sparkurs', 1: 'Verstärkte Streifen', 2: 'Dauerstreife und Spurensicherung' };
const STRICT_NAMES = ['Milde Auslegung', 'Regelrechte Auslegung', 'Strenge Auslegung'];
const LIMIT_NAMES = ['Kurze Verjährung', 'Übliche Verjährung', 'Lange Verjährung'];

/* ---- Zwischenspeicher der wirksamen Beschlüsse ---- */
let POL = { police: new Map(), range: new Map(), strict: 1, limit: 1 };
let CITY_STATE = new Map(); // cityId -> Bundesland (aus der Welt)
let ACTIVE = [];

const arrIdx = (arr, v) => { const i = (arr || []).findIndex((x) => Number(x) === Number(v)); return i; };

/** Wirkung für eine Stadt (rein lesend, ohne Datenbank). */
function effects(cityId) {
  const C = cfg(); const id = Number(cityId) || 0;
  const lvl = POL.police.get(id) || 0;
  const i = lvl ? arrIdx(C.policeLevels, lvl) : -1;
  const region = CITY_STATE.get(id);
  return {
    police: lvl, levy: i >= 0 ? Number((C.policeLevy || [])[i]) || 0 : 0, detect: i >= 0 ? Number((C.policeDetect || [])[i]) || 0 : 0,
    rangePct: (region && POL.range.get(region)) || 0, strictness: POL.strict || 1, limitation: POL.limit || 1,
  };
}

async function refresh() {
  const world = await require('../game/world').get();
  CITY_STATE = new Map(world.cityList.map((c) => [c.id, c.state]));
  const rows = await db.query(
    `SELECT p.*, ps.office, ps.status, ps.name holder, u.social_public FROM court_policies p JOIN player_stats ps ON ps.user_id = p.user_id JOIN users u ON u.id = p.user_id
     WHERE p.expires_at > ? ORDER BY p.id`, [Date.now()]);
  const offices = world.econ.politics.offices;
  const valid = rows.filter((r) => r.status === 'alive' && r.office === (offices[r.office_idx] || {}).name && r.kind !== 'amnesty');
  const next = { police: new Map(), range: new Map(), strict: 1, limit: 1 };
  const best = new Map(); // je Stadt gilt der Beschluss des höchsten Amts, bei Gleichstand der neueste
  for (const r of valid) {
    if (r.kind === 'police') { const b = best.get(r.scope_city); if (!b || r.office_idx >= b.office_idx) { best.set(r.scope_city, r); next.police.set(r.scope_city, Number(r.val)); } }
    else if (r.kind === 'range') next.range.set(r.region, Number(r.val));
    else if (r.kind === 'strict') next.strict = Number(r.val) || 1;
    else if (r.kind === 'limit') next.limit = Number(r.val) || 1;
  }
  POL = next;
  const levy = new Map();
  for (const [city, lvl] of next.police) { const e = effects(city); if (e.levy > 0) levy.set(city, e.levy); void lvl; }
  if (goods.setExtraLevy) goods.setExtraLevy(levy);
  ACTIVE = rows.map((r) => ({ id: r.id, kind: r.kind, val: Number(r.val), cityId: r.scope_city, region: r.region, office: (offices[r.office_idx] || {}).name, holder: r.social_public ? r.holder : null, until: Number(r.expires_at), text: describe(world, r) }));
}

function describe(world, r) {
  const city = r.scope_city ? world.city(r.scope_city) : null;
  const C = cfg();
  switch (r.kind) {
    case 'police': return `Polizeibudget in ${city ? city.name : 'der Stadt'}: ${POLICE_NAMES[r.val] || r.val}`;
    case 'range': return `Strafrahmen in ${r.region || 'der Region'}: Geldstrafen ${r.val > 0 ? '+' : r.val < 0 ? '−' : '±'}${Math.abs(r.val)} %`;
    case 'strict': return `Strafgesetz: ${STRICT_NAMES[arrIdx(C.strictness, r.val)] || 'Regelrecht'}`;
    case 'limit': return `Verjährung der Spuren: ${LIMIT_NAMES[arrIdx(C.limitation, r.val)] || 'üblich'}`;
    case 'amnesty': return 'Amnestie: leichte Strafen im Land werden erlassen';
    default: return r.kind;
  }
}

/** Befugnisse eines Amts mit den aktuellen Grenzen (für die Oberfläche). */
function powersOf(officeIdx) {
  const C = cfg();
  return (POWERS[officeIdx] || []).map((k) => {
    const base = { kind: k, ...KINDS[k] };
    if (k === 'police') return { ...base, options: (C.policeLevels || []).map((v, i) => ({ value: v, label: POLICE_NAMES[v] || String(v), levy: (C.policeLevy || [])[i] || 0, detect: Math.round(((C.policeDetect || [])[i] || 0) * 100) })) };
    if (k === 'range') return { ...base, options: (C.rangePct || []).map((v) => ({ value: v, label: v === 0 ? 'Unverändert' : `${v > 0 ? '+' : '−'}${Math.abs(v)} % auf Geldstrafen` })) };
    if (k === 'strict') return { ...base, options: (C.strictness || []).map((v, i) => ({ value: v, label: STRICT_NAMES[i] || String(v) })) };
    if (k === 'limit') return { ...base, options: (C.limitation || []).map((v, i) => ({ value: v, label: LIMIT_NAMES[i] || String(v) })) };
    return { ...base, options: [{ value: 1, label: 'Amnestie erlassen' }] };
  });
}

/** Prüft und normalisiert einen Beschluss; wirft bei ungültigen Werten. Rückgabe: Zeile für court_policies. */
function normalize(world, officeIdx, city, input) {
  const kind = String(input && input.kind || '');
  const p = powersOf(officeIdx).find((x) => x.kind === kind);
  if (!p) throw new Error('Dieses Amt hat dafür keine Befugnis.');
  const v = Number(input.value);
  if (!p.options.some((o) => Number(o.value) === v)) throw new Error('Dieser Wert ist nicht erlaubt.');
  const row = { office_idx: officeIdx, kind, val: v, scope_city: 0, region: null };
  if (p.scope === 'city') { row.scope_city = city ? city.id : 0; if (!row.scope_city) throw new Error('Dir fehlt eine Heimatstadt.'); }
  if (p.scope === 'region') { row.region = city ? city.state : null; if (!row.region) throw new Error('Dir fehlt eine Heimatregion.'); }
  return row;
}

function previewLines(world, row) {
  const C = cfg();
  switch (row.kind) {
    case 'police': {
      const i = arrIdx(C.policeLevels, row.val);
      const levy = (C.policeLevy || [])[i] || 0; const det = Math.round(((C.policeDetect || [])[i] || 0) * 100); const step = Number((settings.get('gericht').evidence || {}).policeStep) || 8;
      return [
        `Spuren nach Straftaten in der Stadt werden um ${Math.abs(row.val * step)} Punkte ${row.val > 0 ? 'stärker' : 'schwächer'}; ${row.val > 0 ? 'Opfer haben es leichter, Anzeige zu erstatten.' : 'Anzeigen werden schwerer.'}`,
        `Die Entdeckungschance bei Wettbewerbsaktionen ${det >= 0 ? 'steigt um' : 'sinkt um'} ${Math.abs(det)} Prozentpunkte.`,
        levy > 0 ? `Gegenfinanzierung: Alle Betriebe der Stadt zahlen dafür ${String(levy).replace('.', ',')} Punkte Gewerbesteuer-Umlage.` : 'Sparkurs: keine Umlage, aber schwächere Spuren.',
      ];
    }
    case 'range': return [row.val === 0 ? 'Der Strafrahmen bleibt unverändert.' : `Geldstrafen im Bundesland ${row.region} ${row.val > 0 ? 'steigen' : 'sinken'} um ${Math.abs(row.val)} %. Schadenersatz bleibt unberührt.`];
    case 'strict': return [`Die Gerichte im ganzen Land werten Beweise ${row.val > 1 ? 'strenger' : row.val < 1 ? 'milder' : 'wie bisher'} (Faktor ${String(row.val).replace('.', ',')}).`, 'Das wirkt auf Anklage wie Verteidigung gleichermaßen.'];
    case 'limit': return [`Spuren bleiben ${row.val > 1 ? 'länger' : row.val < 1 ? 'kürzer' : 'wie bisher'} verwertbar (Faktor ${String(row.val).replace('.', ',')}).`, 'Opfer müssen entsprechend früher oder dürfen länger Anzeige erstatten.'];
    case 'amnesty': return [`Verwarnungen, Geldstrafen, Betriebsschließungen, Verbote und Haft aus Verfahren bis Stufe ${C.amnestyMaxLevel || 2} werden im ganzen Land erlassen.`, 'Schadenersatz an Opfer bleibt bestehen.', 'Das ist umstritten: Du verlierst etwas Ansehen im Amt.'];
    default: return [];
  }
}

async function selfTerm(userId) {
  const p = await service.peek(userId); if (!p || !p.state || p.state.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  return p;
}

/** Übersicht für „Recht & Gericht → Dein Amt“. */
async function overview(userId) {
  const p = await service.peek(userId); if (!p || !p.state) return { enabled: false };
  const { w: world, state } = p; const t = state.politics && state.politics.term; const city = world.city(state.cityId);
  const E = effects(state.cityId);
  const out = {
    enabled: (settings.get('gericht') || {}).enabled !== false,
    local: { city: city ? city.name : null, region: city ? city.state : null, police: E.police, policeName: POLICE_NAMES[E.police] || 'Normal', rangePct: E.rangePct, strictness: E.strictness, limitation: E.limitation },
    active: ACTIVE.filter((a) => (!a.cityId || a.cityId === state.cityId) && (!a.region || (city && a.region === city.state))).map((a) => ({ kind: a.kind, text: a.text, office: a.office, holder: a.holder, hours: Math.max(0, Math.round((a.until - Date.now()) / 3600000)) })),
    office: null,
  };
  if (t) {
    const o = world.econ.politics.offices[t.idx] || {};
    out.office = { idx: t.idx, name: o.name, daysLeft: Math.max(0, t.endDay - state.day), cityOk: !t.cityId || t.cityId === state.cityId, powers: powersOf(t.idx), used: t.courtPolicy ? { kind: t.courtPolicy.kind, text: t.courtPolicy.text || '' } : null };
  }
  return out;
}

function rowFrom(world, state, input) {
  const t = state.politics && state.politics.term; if (!t) fail('Du hast kein Amt.');
  if ((settings.get('gericht') || {}).enabled === false) fail('Das Gerichtswesen ist gerade abgeschaltet.');
  if (t.cityId && t.cityId !== state.cityId) fail('Du bist nicht mehr in der Stadt, in der du gewählt wurdest.');
  try { return normalize(world, t.idx, world.city(state.cityId), input || {}); } catch (e) { return fail(e.message); }
}

async function preview(userId, input) {
  const p = await selfTerm(userId); const row = rowFrom(p.w, p.state, input);
  return { text: describe(p.w, row), lines: previewLines(p.w, row) };
}

/** Beschluss fassen: einer je Amtszeit (getrennt vom Wirtschaftsbeschluss). */
async function set(userId, input) {
  let amnestied = 0;
  const out = await service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const t = state.politics.term;
    const row = rowFrom(world, state, input);
    if (t.courtPolicy) fail('In dieser Amtszeit hast du schon einen Beschluss zu Recht und Ordnung gefasst. Mit der nächsten Wahl darfst du wieder entscheiden.');
    const key = `c${state.person.id}:${t.startDay}`;
    const expires = Date.now() + Math.max(1, t.endDay - state.day) * msPerGameDay();
    try {
      await conn.query('INSERT INTO court_policies (user_id, term_key, office_idx, kind, val, scope_city, region, expires_at) VALUES (?,?,?,?,?,?,?,?)', [userId, key, row.office_idx, row.kind, row.val, row.scope_city, row.region, expires]);
    } catch (e) { if (e && e.code === 'ER_DUP_ENTRY') fail('In dieser Amtszeit hast du schon einen Beschluss zu Recht und Ordnung gefasst.'); throw e; }
    const text = describe(world, row);
    t.courtPolicy = { kind: row.kind, val: row.val, day: state.day, text };
    if (row.kind === 'amnesty') {
      amnestied = await require('./court').amnesty(conn, userId);
      require('../game/reputation').queue(state, 'office', null, 'court_amnesty', 'amnesty');
    }
    const office = world.econ.politics.offices[t.idx].name;
    chronicle(state, `${state.person.first} beschließt als ${office}: ${text}.`, 'politics');
    notice(state, { level: 'good', title: 'Beschluss gefasst', tab: 'society', text: `${text}. Er gilt bis zum Ende deiner Amtszeit.`, info: ['Als Amtsinhaber darfst du pro Amtszeit einen Beschluss zu Recht und Ordnung fassen.', 'Er verändert, wie Gerichte und Polizei arbeiten – für alle im Geltungsbereich.', 'Mit der nächsten Amtszeit darfst du neu entscheiden.'] });
    const nm = ctx.user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Amtsinhaber';
    await tagesblatt.post('election', `Beschluss: ${office}`, `Beschluss von ${nm} (${office}): ${text}.${row.kind === 'amnesty' ? ` ${amnestied} Sanktionen wurden erlassen.` : ''}`, row.scope_city || 0, conn);
    return { msg: `Beschluss gefasst: ${text}.`, level: 'good' };
  }, { needAlive: true });
  await refresh().catch((e) => log.warn(`[gericht] ${e.message}`));
  if (amnestied) live.publish('court', {});
  return out;
}

function start() { refresh().catch(() => {}); }

module.exports = { effects, refresh, overview, preview, set, describe, powersOf, normalize, start, POWERS, KINDS, POLICE_NAMES, STRICT_NAMES, LIMIT_NAMES, _state: () => POL };
