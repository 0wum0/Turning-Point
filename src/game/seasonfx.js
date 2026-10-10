'use strict';
/**
 * Verbindung von Jahreszeiten, Ernte und Seuchen mit Betrieben, Haushalt und Engine.
 * Alle Funktionen sind rein (lesen nur Spielstand und Einstellungen) und liefern endliche, begrenzte Faktoren.
 */
const SE = require('./seasons');
const HV = require('./harvest');
const EP = require('./epidemics');
const { dateOf, yearOf } = require('./calendar');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const md = (m, d) => [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][m - 1] + d - 1;
const EFX = () => require('./goods');

/** Tag im Jahr und Jahr eines Spielstandes. */
function when(state) {
  const d = dateOf(state.day, state.startYear);
  return { year: d.year, doy: d.doy };
}
const effects = (world, cityId) => EFX().effectsFor(world, cityId);

/** Erntefest der Stadt (Beschluss): Zusatzumsatz für Gastro/Ausflug/Einzelhandel zwischen 15. September und 15. Oktober. */
function fest(ef, sector, doy) {
  const lvl = ef && ef.season ? ef.season.erntefest : 0;
  if (!lvl || !['gastro', 'tourism', 'retail'].includes(sector) || doy < md(9, 15) || doy > md(10, 15)) return 0;
  return [0, 0.02, 0.04, 0.06][lvl] || 0;
}

/**
 * Umsatz- und Leistungsfaktor eines Betriebs:
 *   rev  = Jahreszeit × Feste × Ernte × Seuche (Lockdown, Krankenhäuser)
 *   eff  = Leistung durch kranke Mitarbeiter
 * Die Jahreszeit samt Festen ist auf ±cap (Standard 20 %) begrenzt und über das Jahr mittelwertfrei.
 */
function firmFactor(world, state, c, year, ef) {
  const { doy } = when(state);
  const city = world.city(c.cityId);
  const sec = SE.sectorOf(world, c.pkey);
  const season = SE.revenueMult(world, c.pkey, city, doy, fest(ef, sec, doy));
  const hv = city ? HV.firmMult(c.pkey, year, city.state, ef && ef.harvest ? ef.harvest.aid : 0) : 1;
  const sit = EP.situation(world, year, doy, city, ef);
  const fe = EP.firmEffects(world, c.pkey, sit, { shield: EP.shieldOn(state), kurz: ef && ef.epi ? ef.epi.kurz : 0 });
  const rev = clamp(season * hv * fe.rev, 0.5, 1.5);
  return { rev, eff: fe.eff, season, harvest: hv, epi: fe.rev, sick: fe.sick, lock: fe.lock, sector: sec };
}

/** Faktoren auf Miete/Unterkunft und Unterhalt des Hauses durch Heizen. */
function heating(world, state, year, ef) {
  const { doy } = when(state);
  const w = HV.winterSeverity(year, doy);
  const sub = ef && ef.season ? ef.season.winterhilfe : 0;
  const type = state.housing ? state.housing.type : 'street';
  const pct = SE.heatingPct(type, year, doy, w, sub);
  return { pct, mult: 1 + pct, kind: SE.heatingKind(year).name, sub };
}

/** Stimmung, Erholung und Krankheitschance durch die Jahreszeit (Tagesbeitrag). */
function body(state) {
  const { doy } = when(state);
  return { mood: SE.moodDelta(doy), rest: SE.restDelta(doy), illness: SE.illnessMult(doy) };
}

/** Alle Werte für Oberfläche und Tests in einem Objekt. */
function brief(world, state) {
  const { year, doy } = when(state);
  const city = world.city(state.cityId);
  const ef = effects(world, state.cityId);
  const w = HV.winterSeverity(year, doy);
  const sub = ef.season ? ef.season.winterhilfe : 0;
  const s = SE.brief(world, doy, year, city, w, sub, state.housing ? state.housing.type : 'rent');
  const region = city ? city.state : null;
  const harvest = HV.report(year, region);
  const epi = EP.view(world, state, year, doy, city, ef);
  const weather = HV.weatherOf(year);
  return { season: s, harvest, epi, weather: { winter: weather.winter, heat: weather.heat, name: weather.name, winterNow: Math.round(w * 10) / 10 }, year, doy };
}

module.exports = { when, effects, firmFactor, heating, body, brief, fest, yearOf };
