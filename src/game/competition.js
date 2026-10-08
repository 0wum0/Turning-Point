'use strict';
/**
 * Konkurrenz: Je Stadt und Betriebsart gibt es nur begrenzte Nachfrage (Räume). Sind dort mehr Räume von Spielerbetrieben
 * in Betrieb als die Stadt verträgt, sinkt der Umsatz aller Betriebe dieser Art. Die Angebotsmengen kommen aus player_firms
 * und werden regelmäßig aktualisiert (fehlen sie, gilt keine Sättigung).
 */
const settings = require('../settings');

let SUPPLY = new Map();
const key = (cityId, pkey) => `${cityId}|${pkey}`;
function setSupply(rows) { const m = new Map(); for (const r of rows) m.set(key(r.city_id, r.pkey), { rooms: Number(r.rooms) || 0, firms: Number(r.firms) || 0 }); SUPPLY = m; }

/** Marktlage für einen Betrieb: Nachfrage (cap), Angebot (total), Betriebe, Sättigung und Umsatzfaktor ≤ 1. */
function info(world, cityId, pkey, myRooms = 0) {
  const C = settings.get('competition'); const city = world.city(cityId);
  const s = SUPPLY.get(key(cityId, pkey)) || { rooms: 0, firms: 0 };
  const cap = (C.cap && C.cap[city ? city.size_tier : 2]) || 10;
  const total = Math.max(s.rooms, myRooms);
  const sat = total / cap;
  const factor = !C.enabled || sat <= 1 ? 1 : Math.max(C.minFactor || 0.35, Math.pow(1 / sat, C.exponent || 0.8));
  return { cap, total, firms: Math.max(s.firms, myRooms ? 1 : 0), sat, factor };
}

module.exports = { setSupply, info };
