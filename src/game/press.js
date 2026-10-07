'use strict';
const { rngFor, pick } = require('./rng');
const { yearOf } = require('./calendar');
const { randomFirstName, LAST } = require('./content');

const fmt = (t, v) => String(t == null ? '' : t).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));

/** Bürgermeister einer Stadt: deterministisch je Stadt und Amtsperiode; der Spieler selbst, wenn er das Amt dort innehat. */
function mayorOf(world, state, cityId) {
  const year = yearOf(state.day, state.startYear);
  const city = world.city(cityId);
  const big = !!city && city.size_tier >= 4;
  const t = state.politics && state.politics.term;
  const term = Math.floor((year - state.startYear) / 6);
  const r = rngFor('mayor', cityId || 0, term);
  const gender = year >= 1990 && r() < 0.3 ? 'f' : 'm';
  const name = `${randomFirstName(r, year - 50, gender)} ${pick(r, LAST)}`;
  const title = gender === 'f' ? (big ? 'Oberbürgermeisterin' : 'Bürgermeisterin') : (big ? 'Oberbürgermeister' : 'Bürgermeister');
  if (t && t.idx === 2 && cityId === state.cityId) return { name, title: 'Landrat', self: true };
  return { name, title };
}

/**
 * Schreibt einen Zeitungsartikel über ein Ereignis. Vorlagen: Einstellungen → Zeitung & Texte → press.
 * Platzhalter: {name} {first} {last} {city} {mayor} {mayorTitle} {year} + je Ereignis (firm, prop, partner, child, job …)
 */
function story(world, state, type, vars = {}) {
  try {
    const T = (world.settings.get('texts') || {}).press || {};
    const t = T[type];
    if (!t || !Array.isArray(t.texts) || !t.texts.length) return null;
    const cityId = vars.cityId != null ? vars.cityId : state.cityId;
    const city = world.city(cityId);
    const m = mayorOf(world, state, cityId);
    const v = { name: `${state.person.first} ${state.person.last}`, first: state.person.first, last: state.person.last, city: city ? city.name : 'Deutschland', mayor: m.name, mayorTitle: m.title, year: yearOf(state.day, state.startYear), ...vars };
    const r = rngFor('press', state.seed || 0, state.day, type, cityId || 0);
    state.press = state.press || [];
    state.nextPressId = (state.nextPressId || 0) + 1;
    const item = { id: state.nextPressId, day: state.day, cityId: cityId || 0, type, section: t.section || 'Lokales', title: fmt(t.title, v), text: fmt(pick(r, t.texts), v), big: !!t.big };
    state.press.push(item);
    if (state.press.length > 150) state.press.splice(0, state.press.length - 150);
    return item;
  } catch (_) { return null; }
}

module.exports = { story, mayorOf };
