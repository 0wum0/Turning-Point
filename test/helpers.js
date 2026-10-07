'use strict';
const { CITIES, PROFESSIONS } = require('../src/db/seed-data');
const { buildWorld } = require('../src/game/world');

function testWorld() {
  const cities = CITIES.map((c, i) => ({ id: i + 1, slug: c[0], name: c[1], state: c[2], lat: c[3], lon: c[4], size_tier: c[5], price_factor: c[6], image: null, description: c[7], active: 1 }));
  const professions = PROFESSIONS.map((p, i) => ({
    id: i + 1, pkey: p[0], name: p[1], category: p[2], icon: p[3], era_from: p[4], era_to: p[5], base_wage: p[6], training_days: p[7],
    tuition_day: p[8], academic: p[9], replaces: p[10], lodging: p[11], unlocks: p[12], description: p[13], active: 1,
  }));
  return buildWorld(cities, professions);
}

const input = (w, over = {}) => ({
  gender: 'm', firstName: 'Karl', lastName: 'Becker', birthCityId: w.cityList.find((c) => c.slug === 'braunschweig').id, professionKey: 'baecker',
  fatherName: 'Hans', fatherJob: 'Schlosser', motherName: 'Anna', motherJob: 'Näherin', ...over,
});

module.exports = { testWorld, input };
