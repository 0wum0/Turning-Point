'use strict';
/**
 * Aktionen rund um Seuchen: Schutz mit einem Klick (Hygienepaket, Impfung, Schutzkonzept / Kontakte einschränken).
 * Die Rechenregeln stehen in epidemics.js; hier nur Prüfungen und Meldungen.
 */
const EP = require('./epidemics');
const SFX = require('./seasonfx');
const { dateOf } = require('./calendar');

function install(A, fail, { yr }) {
  A.epiProtect = ({ world, state, input }) => {
    const what = String(input.what || '');
    if (!['hygiene', 'vaccine', 'shield'].includes(what)) fail('Unbekannte Schutzmaßnahme.');
    const year = yr(state); const doy = dateOf(state.day, state.startYear).doy;
    const city = world.city(state.cityId);
    const sit = EP.situation(world, year, doy, city, SFX.effects(world, state.cityId));
    if (!sit.waves.length && what !== 'vaccine') fail('Gerade ist keine Seuche in Sicht. Schutzmaßnahmen lohnen sich erst, wenn eine Welle naht.');
    try {
      const r = EP.protect(world, state, year, sit, what);
      return { msg: r.msg, level: 'good' };
    } catch (e) { if (e && e.protect) return fail(e.message); throw e; }
  };
}
module.exports = { install };
