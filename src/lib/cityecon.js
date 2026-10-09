'use strict';
/**
 * Stadtwirtschaft (Server): hält die Preisindizes je Stadt aktuell. Alle `intervalMinutes` (und beim Start) werden aus den veröffentlichten
 * Betrieben (player_firms, auch Bots) und den lebenden Charakteren je Stadt Nachfrage und Angebot der fünf Sektoren berechnet; jeder Index
 * nähert sich seinem Gleichgewicht an (src/game/cityecon.js). Nur Städte mit Aktivität (oder Beschluss) bekommen Zeilen in `city_economy`;
 * ruhige Orte haben Dynamik 1 und fallen von selbst aus dem Zwischenspeicher, sobald sie wieder neutral sind.
 * Der Zwischenspeicher im Speicher (game/cityecon.js) ist die Quelle für die Engine; die Datenbank hält ihn über Neustarts.
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const ce = require('../game/cityecon');

let TIMER = null;
let BUSY = false;
let LAST = { at: 0, cities: 0, rows: 0, ms: 0 };

const worldP = () => require('../game/world').get();
const parseHist = (t) => { try { const a = JSON.parse(t); return Array.isArray(a) ? a.map(Number).filter(Number.isFinite).slice(-400) : []; } catch (_) { return []; } };

/** Zwischenspeicher aus der Datenbank laden (beim Start). */
async function load() {
  const rows = await db.query('SELECT * FROM city_economy');
  const map = new Map();
  for (const r of rows) {
    if (!(r.sector in ce.META)) continue;
    const hist = parseHist(r.hist); const v = Number(r.idx);
    if (!Number.isFinite(v)) continue;
    map.set(ce.key(r.city_id, r.sector), { v, t: Number(r.updated_at) || Date.now(), pt: Number(r.pt_at) || Date.now(), hist: hist.length ? hist : [v], cityId: r.city_id, sector: r.sector });
  }
  ce.setState(map);
  return map.size;
}

/** Eingaben je Stadt aus Betrieben und Charakteren. */
async function gatherInputs(world) {
  const firms = await db.query('SELECT city_id, pkey, SUM(rooms) rooms FROM player_firms WHERE abandoned = 0 GROUP BY city_id, pkey');
  const players = await db.query("SELECT city_id, COUNT(*) n FROM player_stats WHERE status = 'alive' AND city_id IS NOT NULL GROUP BY city_id");
  const inputs = new Map();
  const get = (id) => { if (!inputs.has(id)) inputs.set(id, { players: 0, rooms: { food: 0, services: 0, build: 0, all: 0 } }); return inputs.get(id); };
  for (const r of firms) {
    if (!world.city(r.city_id)) continue;
    const i = get(r.city_id); const rooms = Number(r.rooms) || 0; const s = ce.sectorOfPkey(world, r.pkey);
    i.rooms.all += rooms; if (s === 'food' || s === 'services' || s === 'build') i.rooms[s] += rooms;
  }
  for (const r of players) { if (world.city(r.city_id)) get(r.city_id).players += Number(r.n) || 0; }
  return inputs;
}

/** Politisch betroffene Städte (Beschluss mit Stadtbezug) bekommen ebenfalls Zeilen. */
function policyCities(world) {
  const goods = require('../game/goods'); const P = goods.currentPolicies(); const out = new Set();
  for (const [id, c] of P.city.entries()) if (world.city(id) && (c.zone || c.rentCap != null)) out.add(id);
  return out;
}

/**
 * Eine Aktualisierung. Rein deterministisch bei gleichen Eingaben und gleicher Uhrzeit (nowMs).
 * Rückgabe: { cities, rows }.
 */
async function refresh(nowMs = Date.now()) {
  if (BUSY) return null;
  BUSY = true; const t0 = Date.now();
  try {
    const C = ce.C();
    if (!C.on) { if (ce.active()) ce.reset(); return { cities: 0, rows: 0 }; }
    const world = await worldP();
    const inputs = await gatherInputs(world);
    const prev = ce.getState();
    const ids = new Set(inputs.keys());
    for (const k of prev.keys()) ids.add(Math.floor(k / 8));
    const pcs = policyCities(world);
    for (const id of pcs) ids.add(id);
    const goods = require('../game/goods');
    const next = new Map(); const keep = [];
    for (const id of ids) {
      if (!world.city(id)) continue;
      const inp = inputs.get(id) || { players: 0, rooms: { food: 0, services: 0, build: 0, all: 0 } };
      const ef = goods.effectsFor(world, id);
      const pol = { zone: ef.zone, rentCap: ef.rentCap, brake: ef.brake };
      let maxDev = 0; const rows = {};
      for (const s of ce.SECTORS) {
        const old = prev.get(ce.key(id, s));
        const tgt = ce.target(world, id, s, inp, pol, nowMs);
        const e = ce.advanceEntry(old, tgt, nowMs, s === 'rent' ? ef.rentCap : null);
        e.cityId = id; e.sector = s; e.target = tgt;
        const b = ce.balance(world, id, s, inp, pol); e.demand = b.D; e.supply = b.S;
        rows[s] = e; maxDev = Math.max(maxDev, Math.abs(e.v - 1), Math.abs(tgt - 1));
      }
      const quiet = !inputs.has(id) && !pcs.has(id) && maxDev < 0.004;
      if (quiet) continue; // wieder neutral und ohne Aktivität: Zeile entfällt
      for (const s of ce.SECTORS) { next.set(ce.key(id, s), rows[s]); keep.push(rows[s]); }
    }
    ce.setState(next, new Map([...inputs].map(([id, i]) => [id, i])));
    // Persistieren: ersetzen (klein, nur aktive Städte)
    try {
      const gone = [...prev.entries()].filter(([k]) => !next.has(k)).map(([k, e]) => ({ cityId: e.cityId != null ? e.cityId : Math.floor(k / 8), sector: e.sector || ce.SECTORS[k % 8] }));
      for (const e of gone) await db.query('DELETE FROM city_economy WHERE city_id = ? AND sector = ?', [e.cityId, e.sector]);
      for (let i = 0; i < keep.length; i += 100) {
        const part = keep.slice(i, i + 100);
        await db.query(`INSERT INTO city_economy (city_id, sector, idx, target, demand, supply, hist, pt_at, updated_at) VALUES ${part.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')} ON DUPLICATE KEY UPDATE idx = VALUES(idx), target = VALUES(target), demand = VALUES(demand), supply = VALUES(supply), hist = VALUES(hist), pt_at = VALUES(pt_at), updated_at = VALUES(updated_at)`,
          part.flatMap((e) => [e.cityId, e.sector, e.v, e.target, Math.round(e.demand * 100) / 100, Math.round(e.supply * 100) / 100, JSON.stringify(e.hist), Math.round(e.pt), Math.round(e.t)]));
      }
    } catch (e) { log.warn(`[stadtwirtschaft] speichern: ${e.message}`); }
    LAST = { at: nowMs, cities: new Set(keep.map((e) => e.cityId)).size, rows: keep.length, ms: Date.now() - t0 };
    try { require('./live').publish('economy', {}); } catch (_) { /* optional */ }
    return { cities: LAST.cities, rows: LAST.rows };
  } finally { BUSY = false; }
}

/** Landesweite Kurzfassung (Tagesblatt): Mittel der aktiven Städte und Ausreißer je Sektor. */
function summary(world) {
  const st = ce.getState(); const by = {};
  for (const e of st.values()) { (by[e.sector] = by[e.sector] || []).push(e); }
  const out = [];
  for (const s of ce.SECTORS) {
    const list = by[s] || []; if (!list.length) continue;
    const avg = list.reduce((a, e) => a + e.v, 0) / list.length;
    const hi = list.reduce((m, e) => (e.v > m.v ? e : m), list[0]); const lo = list.reduce((m, e) => (e.v < m.v ? e : m), list[0]);
    const nm = (e) => { const c = world.city(e.cityId); return c ? c.name : ''; };
    out.push({ sector: s, name: ce.META[s].name, avgPct: Math.round((avg - 1) * 1000) / 10, high: { city: nm(hi), pct: Math.round((hi.v - 1) * 1000) / 10 }, low: { city: nm(lo), pct: Math.round((lo.v - 1) * 1000) / 10 }, cities: list.length });
  }
  return out;
}

function start() {
  load().catch((e) => log.warn(`[stadtwirtschaft] laden: ${e.message}`)).then(() => refresh()).catch((e) => log.warn(`[stadtwirtschaft] ${e.message}`));
  if (TIMER) clearTimeout(TIMER);
  const loop = () => {
    TIMER = setTimeout(() => { refresh().catch((e) => log.warn(`[stadtwirtschaft] ${e.message}`)).finally(loop); }, Math.max(60000, ce.C().intervalMs)); // Takt aus den Einstellungen, wirkt ab dem nächsten Durchlauf
    TIMER.unref();
  };
  loop();
}
const last = () => LAST;

module.exports = { start, load, refresh, summary, last, gatherInputs };
