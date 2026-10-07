'use strict';
/**
 * Alle deutschen Orte (Gemeindesitze und größere Dörfer, rund 9.000) aus src/db/places-de.json.
 * Idempotent: bestehende Städte werden nur um Einwohnerzahl/Gründungsjahr ergänzt, neue Orte per Batch angelegt.
 * Orte mit since > Jahr erscheinen erst in diesem Spieljahr (Neugründungen nach 1945).
 */
const fs = require('fs');
const path = require('path');

const norm = (s) => String(s).toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]+/g, '');
const tierOf = (pop) => (pop >= 800000 ? 5 : pop >= 450000 ? 4 : pop >= 200000 ? 3 : pop >= 50000 ? 2 : 1);

function factorOf(tier, state, name) {
  const base = { 5: 1.12, 4: 1.02, 3: 0.95, 2: 0.92, 1: 0.86 }[tier];
  const west = ['Bayern', 'Baden-Württemberg', 'Hessen', 'Hamburg'].includes(state) ? 0.05 : 0;
  const east = ['Sachsen', 'Sachsen-Anhalt', 'Thüringen', 'Brandenburg', 'Mecklenburg-Vorpommern'].includes(state) ? -0.06 : 0;
  let h = 7; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return Math.round((base + west + east + ((h % 13) - 6) / 100) * 100) / 100;
}

async function seed(db, log = () => {}) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'places-de.json'), 'utf8'));
  const existing = await db.query('SELECT id, slug, name, state FROM cities');
  const byName = new Map(existing.map((c) => [`${norm(c.name)}|${c.state}`, c]));
  const slugs = new Set(existing.map((c) => c.slug));
  const fresh = [];
  for (const [name, si, lat, lon, pop, since] of data.rows) {
    const state = data.states[si];
    const ex = byName.get(`${norm(name)}|${state}`);
    if (ex) { await db.query('UPDATE cities SET pop = ?, since = ? WHERE id = ?', [pop, since, ex.id]); continue; }
    let slug = norm(name).slice(0, 48) || 'ort'; let n = 1; const base = slug;
    while (slugs.has(slug)) { n++; slug = `${base}-${n}`; }
    slugs.add(slug);
    const tier = tierOf(pop);
    fresh.push([slug, name, state, lat, lon, tier, factorOf(tier, state, name), pop, since]);
  }
  for (let i = 0; i < fresh.length; i += 400) {
    const part = fresh.slice(i, i + 400);
    await db.query(`INSERT IGNORE INTO cities (slug, name, state, lat, lon, size_tier, price_factor, pop, since) VALUES ${part.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')}`, part.flat());
  }
  log(`Orte: ${fresh.length} neu, ${data.rows.length - fresh.length} bestehende ergänzt.`);
  return fresh.length;
}

module.exports = { seed, tierOf };
