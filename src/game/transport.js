'use strict';
/**
 * Transportmodell (rein, deterministisch, ohne Datenbank): Entfernungen aus Länge/Breite, Verkehrsträger je Epoche mit Geschwindigkeit,
 * Kosten und Tragfähigkeit, Anschluss der Orte (Bahn, Hafen, Flughafen), Einflüsse von Kraftstoff-/Strompreis, Jahreszeit, Hochwasser,
 * Seuchen-Maßnahmen und Politik (Straßenbau, Netz, Hafen-/Bahnhofsausbau, Maut, Zoll).
 *
 * Alle Geldbeträge sind „Wert von 1945“ in Cent (real); die Aufrufer rechnen mit dem Preisindex ihres Spieljahres um.
 * Reisezeit in Spieltagen (ein Spieltag ≈ 4 Minuten echte Zeit), gedeckelt auf `maxTravelDays`.
 */
const settings = require('../settings');
const { hash } = require('./rng');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;

/** Eingestellte Werte (Standard: src/game/transport-defaults.js). */
function C() {
  const t = settings.get('transport') || {};
  const d = require('./transport-defaults');
  const pick = (k) => (t[k] && typeof t[k] === 'object' && !Array.isArray(t[k]) ? { ...d[k], ...t[k] } : d[k]);
  return {
    on: t.enabled !== false, maxDays: num(t.maxTravelDays, d.maxTravelDays, 5, 365),
    modes: Array.isArray(t.modes) && t.modes.length ? t.modes : d.modes, weights: { ...d.weights, ...(t.weights || {}) },
    notShippable: Array.isArray(t.notShippable) ? t.notShippable : d.notShippable,
    fuel: pick('fuel'), hubs: pick('hubs'), season: pick('season'), epidemic: pick('epidemic'), tolls: pick('tolls'), policy: pick('policy'),
    trade: pick('trade'), risk: pick('risk'), contracts: pick('contracts'), bots: pick('bots'), labels: pick('labels'),
  };
}

/* ------------------------------------------------------------------ Zeitreihen und Geometrie ------------------------------------------------------------------ */
function series(pts, year) {
  if (!Array.isArray(pts) || !pts.length) return 0;
  if (year <= pts[0][0]) return Number(pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    if (year <= pts[i][0]) { const [y0, v0] = pts[i - 1]; const [y1, v1] = pts[i]; return Number(v0) + (Number(v1) - Number(v0)) * ((year - y0) / Math.max(1, y1 - y0)); }
  }
  return Number(pts[pts.length - 1][1]);
}

/** Luftlinie in km. */
function distanceKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371; const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, x)));
}

/* ------------------------------------------------------------------ Anschluss der Orte ------------------------------------------------------------------ */
const PORTS = {
  Hamburg: 3, Bremen: 3, Bremerhaven: 3, Rostock: 3, Duisburg: 3, Kiel: 2, 'Lübeck': 2, Wilhelmshaven: 2, Emden: 2, 'Köln': 2, 'Düsseldorf': 2, Mannheim: 2, 'Ludwigshafen am Rhein': 2, Karlsruhe: 2,
  'Frankfurt am Main': 2, Berlin: 2, Cuxhaven: 1, Stralsund: 1, Wismar: 1, Flensburg: 1, Stade: 1, Mainz: 1, Neuss: 1, Magdeburg: 1, Regensburg: 1, 'Nürnberg': 1, Hannover: 1, Dortmund: 1, 'Münster': 1,
  Minden: 1, 'Würzburg': 1, Passau: 1, Dresden: 1, Heilbronn: 1, Stuttgart: 1, Hamm: 1, Krefeld: 1, Bonn: 1, Koblenz: 1, Offenbach: 1, Potsdam: 1, Schwerin: 1, Oldenburg: 1, 'Osnabrück': 1, 'Lüneburg': 1, Greifswald: 1,
};
const AIRPORTS = { 'Frankfurt am Main': 3, 'Köln': 3, Leipzig: 3, 'München': 3, Hamburg: 2, Berlin: 2, 'Düsseldorf': 2, Hannover: 2, Stuttgart: 2, 'Nürnberg': 2, Dresden: 1, Bremen: 1, Dortmund: 1, 'Saarbrücken': 1 };
const popOf = (c) => Number(c && c.pop) || ({ 5: 1.2e6, 4: 5e5, 3: 2.2e5, 2: 8e4, 1: 2e4 }[c && c.size_tier] || 2e4);
const isCoastal = (c) => !!c && (c.lat >= 53.4 || (c.lat >= 53.0 && c.lon < 9.2));
const KINDS = ['rail', 'port', 'air', 'hyper'];

/* ------------------------------------------------------------------ Politik (Zwischenspeicher aus src/lib/transport-policy.js) ------------------------------------------------------------------ */
const noPolicy = () => ({ city: new Map(), region: new Map(), nation: { net: 0, frame: null } });
let POL = noPolicy();
function setPolicy(p) { POL = p && p.city && p.region && p.nation ? p : noPolicy(); }
const getPolicy = () => POL;
/** Wirkung der Beschlüsse auf eine Stadt: Ausbaustufen (Bahn, Hafen, Flughafen), Stadtmaut (begrenzt durch den Rahmen), Straßenbau des Landes, Netz des Bundes. */
function policyFor(city) {
  const c = (city && POL.city.get(city.id)) || null; const r = (city && POL.region.get(city.state)) || null; const n = POL.nation || {};
  const frame = n.frame != null ? n.frame : num(C().tolls.maxCityPct, 6, 0, 30);
  return { hub: (c && c.hub) || {}, toll: clamp(num(c && c.toll, 0, -6, 30), -6, frame), road: (r && r.road) || 0, net: n.net || 0, frame };
}

/**
 * Anschlussstufen (0 = keiner … 3 = Drehkreuz) eines Ortes: Bahn nach Einwohnern, Häfen und Flughäfen nach Lage,
 * dazu die Ausbaubeschlüsse der Stadt. Röhrenfracht ab 2060 nur zwischen Großstädten.
 */
function hubs(city, year) {
  const k = C(); const out = { rail: 0, port: 0, air: 0, hyper: 0 };
  if (!city) return out;
  const pop = popOf(city); const pf = policyFor(city).hub;
  out.rail = pop >= 200000 ? 3 : pop >= 50000 ? 2 : pop >= num(k.hubs.railPop, 10000, 100, 1e7) ? 1 : 0;
  out.port = PORTS[city.name] || 0;
  out.air = AIRPORTS[city.name] || (pop >= 500000 ? 1 : 0);
  if (pf.rail && (out.rail || pop >= 2000)) out.rail = clamp(out.rail + pf.rail, 0, 3);
  if (pf.port && (out.port || isCoastal(city) || pop >= 50000)) out.port = clamp(out.port + pf.port, 0, 3);
  if (pf.air && pop >= num(k.hubs.airPop, 150000, 1000, 1e8) / 3) out.air = clamp(out.air + pf.air, 0, 3);
  if (year >= 2060 && pop >= 200000) out.hyper = pop >= 800000 ? 3 : 2;
  return out;
}

/** Gewicht einer Handelseinheit in kg. */
const weightOf = (goodKey) => num(C().weights[goodKey], 1, 0.01, 1e4);
/** Kann die Ware auf Routen transportiert werden (Epoche, Dienstleistungen, Strom)? */
function shippable(goodKey, year) {
  const goods = require('./goods'); const g = goods.good(goodKey);
  return !!g && !g.service && goods.inEra(g, year) && !C().notShippable.includes(goodKey);
}

/* ------------------------------------------------------------------ Umwelt: Jahreszeit, Hochwasser, Seuchen ------------------------------------------------------------------ */
/** Hochwasser sperrt im Katastrophenjahr in betroffenen Bundesländern für einige Wochen Straße und Schiene. */
function floodActive(year, doy, region) {
  const k = C().season; const wx = require('./harvest').weatherOf(year);
  if (!wx.flood || !wx.flood.includes(region)) return false;
  const span = Math.max(10, num(k.floodTo, 280) - num(k.floodFrom, 130) - num(k.floodDays, 18));
  const start = num(k.floodFrom, 130) + (hash(`flood|${year}|${region}`) % span);
  return doy >= start && doy < start + num(k.floodDays, 18);
}
function environment(world, year, doy, a, b, ef) {
  const HV = require('./harvest'); const EP = require('./epidemics');
  const winter = Math.max(0, HV.winterSeverity(year, doy)) * (doy >= 334 || doy < 90 ? 1 : doy < 120 ? 0.4 : 0);
  let lock = 0;
  for (const c of [a, b]) { if (!c) continue; try { lock = Math.max(lock, EP.situation(world, year, doy, c, ef || require('./goods').effectsFor(world, c.id)).level || 0); } catch (_) { /* ohne Seuche */ } }
  const flood = !!((a && floodActive(year, doy, a.state)) || (b && floodActive(year, doy, b.state)));
  return { winter: r2(winter), lock, flood };
}

/* ------------------------------------------------------------------ Kosten- und Zeitmodell ------------------------------------------------------------------ */
/** Kraftstoff-/Strompreis relativ zum Normalniveau des Jahres (1 = normal): geht in die Kosten ein. */
function fuelRel(world, cityId, year, kind) {
  try {
    const goods = require('./goods'); const g = goods.good(kind); if (!g) return 1;
    const p = goods.price(world, cityId, kind, year); const base = goods.priceReal(g, year) * world.idx(year);
    return clamp(p.market / Math.max(1e-9, base), num(C().fuel.min, 0.7), num(C().fuel.max, 1.8));
  } catch (_) { return 1; }
}

const modeByKey = (key) => C().modes.find((m) => m.key === key) || null;
function modeAt(m, year) {
  return { speed: Math.max(1, series(m.speed, year)), cost: Math.max(0, series(m.cost, year)), cap: Math.max(1, series(m.cap, year)) };
}

/** Warum ein Verkehrsträger zwischen zwei Orten nicht geht (null = möglich). */
function whyNot(m, a, b, year, ha, hb, unitKg) {
  if (year < m.from) return `gibt es erst ab ${m.from}`;
  if (year > m.to) return 'nicht mehr üblich';
  if (m.maxUnitKg && unitKg > m.maxUnitKg) return 'nur für leichte Waren';
  const need = { rail: 'rail', port: 'port', air: 'air', hyper: 'hyper' }[m.net];
  if (need && (!ha[need] || !hb[need])) return need === 'rail' ? 'kein Bahnanschluss' : need === 'port' ? 'kein Hafen' : need === 'air' ? 'kein Flughafen' : 'keine Röhrenanbindung';
  return null;
}

/**
 * Angebot für eine Verbindung. o = { from, to (Stadt-IDs), good, year, doy, mode ('auto' | Schlüssel), ownFleet, carrierPct, smuggle, unitValueReal, env? }.
 * Ergebnis: Liste `options` (alle möglichen Verkehrsträger mit Zeit und Kosten je Einheit) und die gewählte Option als `pick`.
 * perUnit.* in Cent (Wert 1945) je Handelseinheit.
 */
function quote(world, o) {
  const k = C();
  const a = world.city(o.from); const b = world.city(o.to);
  const out = { ok: false, err: null, options: [], pick: null };
  if (!k.on) { out.err = 'Transport ist gerade abgeschaltet.'; return out; }
  if (!a || !b) { out.err = 'Unbekannter Ort.'; return out; }
  if (a.id === b.id) { out.err = 'Start und Ziel sind derselbe Ort.'; return out; }
  const year = Math.floor(num(o.year, 1945)); const doy = Math.floor(num(o.doy, 0));
  if (o.good && !shippable(o.good, year)) { out.err = 'Diese Ware kann nicht auf Routen transportiert werden.'; return out; }
  const unitKg = o.good ? weightOf(o.good) : 1;
  const air = distanceKm(a, b); const ha = hubs(a, year); const hb = hubs(b, year);
  const pa = policyFor(a); const pb = policyFor(b);
  const env = o.env || environment(world, year, doy, a, b);
  const ef = require('./goods').effectsFor(world, b.id);
  const tariffPct = Math.max(0, num(ef.tariff, 0));
  const goods = require('./goods'); const g = o.good ? goods.good(o.good) : null;
  const imp = g ? goods.importShare(g, year) : 0;
  const val = num(o.unitValueReal, 0, 0, 1e9);
  const roadNet = (pa.road + pb.road) / 2; const net = Math.max(pa.net, pb.net);
  const pol = k.policy;
  const lvlAt = (arr, lv) => (lv > 0 ? num(arr[lv - 1], 0) / 100 : 0);
  for (const m of k.modes) {
    const why = whyNot(m, a, b, year, ha, hb, unitKg);
    const s = modeAt(m, year);
    const isRoad = m.net === 'road' || m.net === 'rail';
    const kmRoad = air * num(m.road, 1.2, 1, 3);
    let speedMul = 1;
    if (m.key === 'lkw' || m.key === 'fuhrwerk') speedMul += lvlAt(pol.roadSpeed, Math.round(roadNet)) ;
    if (m.key === 'lkw' || m.key === 'bahn') speedMul += lvlAt(pol.netSpeed, net);
    if (isRoad) speedMul *= 1 - k.season.winterSlow * env.winter;
    if (env.lock) speedMul *= 1 - k.epidemic.slow * env.lock;
    if (env.flood && isRoad) speedMul *= 1 - num(k.season.floodSlow, 0.8, 0, 0.95);
    speedMul = clamp(speedMul, 0.08, 2);
    const hubLv = m.net === 'rail' ? [ha.rail, hb.rail] : m.net === 'port' ? [ha.port, hb.port] : m.net === 'air' ? [ha.air, hb.air] : m.net === 'hyper' ? [ha.hyper, hb.hyper] : [0, 0];
    const hubRed = clamp(num(pol.hubHandling, 0.18) * (Math.max(0, hubLv[0] - 1) + Math.max(0, hubLv[1] - 1)) / 2, 0, 0.5);
    const handling = num(m.handling, 0.5) * (1 - hubRed) * (env.lock >= 2 ? 1 + 0.25 * (env.lock - 1) : 1);
    const daysRaw = kmRoad / (s.speed * speedMul) + handling;
    const days = clamp(Math.ceil(daysRaw - 1e-9), 1, k.maxDays);
    // Kosten je Einheit
    const fuelK = fuelRel(world, a.id, year, m.fuel || 'kraftstoff');
    const energyAdj = 1 - num(m.energy, 0.3, 0, 1) + num(m.energy, 0.3, 0, 1) * fuelK;
    let costMul = energyAdj * (isRoad ? 1 + k.season.winterCost * env.winter : 1) * (1 + k.epidemic.cost * env.lock);
    if (m.key === 'lkw' || m.key === 'fuhrwerk') costMul *= 1 - lvlAt(pol.roadCost, Math.round(roadNet));
    if (m.key === 'lkw' || m.key === 'bahn') costMul *= 1 - lvlAt(pol.netCost, net);
    const std = unitKg * kmRoad * s.cost * Math.max(0.1, costMul);
    let freight = std;
    if (o.ownFleet) freight *= 1 - num(k.trade.ownFleetDiscountPct, 25, 0, 80) / 100;
    else if (o.carrierPct != null) freight *= clamp(num(o.carrierPct, 100, 30, 150), 30, 150) / 100;
    const tollLkw = m.key === 'lkw' && year >= num(k.tolls.lkwFromYear, 2005) ? freight * num(k.tolls.lkwPct, 8) / 100 : 0;
    const tollCity = Math.max(-0.3 * freight, freight * (pa.toll + pb.toll) / 100);
    const port = m.net === 'port' ? freight * num(k.tolls.portFeePct, 5) / 100 : m.net === 'air' ? freight * num(k.tolls.airFeePct, 4) / 100 : 0;
    const dutyOn = (m.net === 'port' || m.net === 'air') && tariffPct > 0;
    const duty = dutyOn ? val * (tariffPct / 100) * imp : 0;
    const evadable = tollLkw + tollCity + duty; // was Schmuggler sparen würden
    const perUnit = { freight: r4(freight), std: r4(std), toll: r4(tollLkw + tollCity), port: r4(port), duty: r4(duty), total: r4(freight + tollLkw + tollCity + port + duty), evadable: r4(evadable) };
    const opt = {
      key: m.key, name: m.name, icon: m.icon, note: m.note || '', ok: !why, why, km: Math.round(air), kmRoad: Math.round(kmRoad), days, daysRaw: r2(daysRaw), speed: Math.round(s.speed * speedMul), capKg: Math.round(s.cap),
      unitsPerVehicle: Math.max(1, Math.floor(s.cap / unitKg)), perUnit, tariffPct: dutyOn ? tariffPct : 0, tollPct: r2(pa.toll + pb.toll + (m.key === 'lkw' && tollLkw ? num(k.tolls.lkwPct, 8) : 0)),
      flags: { winter: env.winter > 0.15, flood: env.flood && isRoad, lockdown: env.lock, boost: speedMul > 1.02 },
    };
    out.options.push(opt);
  }
  const okOpts = out.options.filter((x) => x.ok);
  if (!okOpts.length) { out.err = 'Zwischen diesen Orten gibt es gerade keine Verbindung.'; return out; }
  const timeVal = val * 0.0006; // gebundenes Kapital: etwa 0,06 % je Tag
  const score = (x) => x.perUnit.total + timeVal * x.days;
  okOpts.sort((x, y) => score(x) - score(y));
  let pick = null;
  if (o.mode && o.mode !== 'auto') {
    pick = out.options.find((x) => x.key === o.mode);
    if (!pick) { out.err = 'Unbekannter Verkehrsträger.'; return out; }
    if (!pick.ok) { out.err = `${pick.name} geht hier nicht (${pick.why}).`; return out; }
  } else pick = okOpts[0];
  out.ok = true; out.pick = pick; out.km = Math.round(air); out.env = env;
  out.from = { id: a.id, name: a.name, state: a.state, hubs: ha }; out.to = { id: b.id, name: b.name, state: b.state, hubs: hb };
  out.options.sort((x, y) => (x.ok === y.ok ? score(x) - score(y) : x.ok ? -1 : 1));
  return out;
}

/** Fracht je Einheit (real) und Lieferzeit für einen Liefervertrag zwischen zwei Orten; null, wenn keine Verbindung besteht. */
function freightFor(world, o) {
  if (!o || o.from === o.to) return { perUnit: 0, days: 0, km: 0, mode: null, same: true };
  const q = quote(world, { mode: 'auto', ...o });
  if (!q.ok) return null;
  return { perUnit: q.pick.perUnit.total, std: q.pick.perUnit.std, days: q.pick.days, km: q.km, mode: q.pick.key, modeName: q.pick.name, tollPerUnit: q.pick.perUnit.toll, flags: q.pick.flags };
}

module.exports = {
  C, series, distanceKm, hubs, weightOf, shippable, environment, floodActive, fuelRel, modeByKey, modeAt, quote, freightFor, setPolicy, getPolicy, policyFor, noPolicy,
  PORTS, AIRPORTS, KINDS, isCoastal,
};
