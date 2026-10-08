'use strict';
/** Kleine Helfer gegen Überlast: Bremse je Spieler und ein Kurzzeit-Zwischenspeicher für teure, oft angefragte Leseabfragen. */
const rateLimit = require('express-rate-limit');

/** Skalierung der Schwellen über TP_API_RATE (Standard 180/min) – Lasttests/E2E setzen es hoch und behalten so ihre Ruhe. */
const scale = () => Math.max(1, (Number(process.env.TP_API_RATE) || 180) / 180);

/** Bremse je angemeldetem Spieler (Fallback: IP). `perMin` gilt bei Standardeinstellung. */
function userLimit(perMin, message = 'Zu viele Anfragen – bitte kurz warten.', windowMs = 60 * 1000) {
  return rateLimit({
    windowMs, limit: Math.ceil(perMin * scale()), standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `${req.user ? `u${req.user.id}` : `i${req.ip}`}:${perMin}:${windowMs}`, validate: { keyGeneratorIpFallback: false },
    message: { ok: false, error: message },
  });
}

/** Zwischenspeicher mit Ablaufzeit und fester Obergrenze (älteste Einträge fliegen raus). */
function ttlCache(ttlMs, max = 500) {
  const m = new Map();
  return {
    async get(key, make) {
      const hit = m.get(key);
      if (hit && hit.until > Date.now()) return hit.value;
      const value = await make();
      if (m.size >= max) { for (const k of m.keys()) { m.delete(k); if (m.size < max * 0.8) break; } }
      m.set(key, { value, until: Date.now() + ttlMs });
      return value;
    },
    clear() { m.clear(); },
    get size() { return m.size; },
  };
}

module.exports = { userLimit, ttlCache, scale };
