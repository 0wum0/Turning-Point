'use strict';
const db = require('../db');
const settings = require('../settings');
const { priceIndex, currencyOf } = require('./economy');

let cached = null;

/** Lädt Städte + Berufe aus der DB (gecacht; Admin-Änderungen rufen invalidate()). */
async function load() {
  const [cities, professions] = await Promise.all([
    db.query('SELECT * FROM cities WHERE active = 1 ORDER BY name'),
    db.query('SELECT * FROM professions WHERE active = 1 ORDER BY academic, era_from, name'),
  ]);
  cached = buildWorld(cities, professions);
  return cached;
}
async function get() { return cached || load(); }
function invalidate() { cached = null; }

function buildWorld(cities, professions) {
  const cityMap = new Map(cities.map((c) => [c.id, c]));
  const profMap = new Map(professions.map((p) => [p.pkey, p]));
  const world = {
    cities: cityMap,
    cityList: cities,
    professions: profMap,
    get settings() { return settings; },
    get econ() { return settings.get('economy'); },
    idx(year) { return priceIndex(year, settings.get('economy')); },
    currency(year) { return currencyOf(year, settings.get('economy')); },
    activeProfessions(year) {
      return professions.filter((p) => p.era_from <= year && year <= p.era_to);
    },
    successorOf(key, year) {
      return professions.find((p) => p.replaces === key && p.era_from <= year && year <= p.era_to) || null;
    },
    city(id) { return cityMap.get(id); },
    prof(key) { return profMap.get(key); },
  };
  return world;
}

module.exports = { load, get, invalidate, buildWorld };
