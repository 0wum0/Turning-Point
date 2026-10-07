/* Orte: kompakte Serverdaten entpacken, Beschreibung/Art ableiten, Orte suchen (rund 9.000 Orte in Deutschland). */
import { esc } from './ui.js';

const STATE_SHORT = { 'Baden-Württemberg': 'BW', Bayern: 'BY', Berlin: 'BE', Brandenburg: 'BB', Bremen: 'HB', Hamburg: 'HH', Hessen: 'HE', 'Mecklenburg-Vorpommern': 'MV', Niedersachsen: 'NI', 'Nordrhein-Westfalen': 'NW', 'Rheinland-Pfalz': 'RP', Saarland: 'SL', Sachsen: 'SN', 'Sachsen-Anhalt': 'ST', 'Schleswig-Holstein': 'SH', Thüringen: 'TH' };
const fold = (s) => String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function decodeWorld(world) {
  const states = world.states || [];
  const extra = world.cityExtra || {};
  const cities = (world.cityRows || []).map((r) => {
    const e = extra[r[0]] || {};
    return { id: r[0], name: r[1], state: states[r[2]] || '', lat: r[3], lon: r[4], tier: r[5], factor: r[6], pop: r[7], since: r[8], image: e.image || null, aerial: e.aerial || null, description: e.description || '', key: fold(r[1]) };
  });
  const count = new Map();
  cities.forEach((c) => count.set(c.name, (count.get(c.name) || 0) + 1));
  cities.forEach((c) => { c.label = count.get(c.name) > 1 ? `${c.name} (${STATE_SHORT[c.state] || c.state})` : c.name; });
  world.cities = cities;
  world.cityById = new Map(cities.map((c) => [c.id, c]));
  world.byPop = cities.slice().sort((a, b) => b.pop - a.pop);
  return world;
}

export const cityOf = (ctx, id) => (ctx.world && ctx.world.cityById ? ctx.world.cityById.get(id) : null);
export const cityLabel = (ctx, id) => { const c = cityOf(ctx, id); return c ? c.label : '–'; };

/** Art des Ortes nach Einwohnerzahl. */
export function kindOf(c) {
  const p = c.pop || 0;
  if (p >= 800000) return 'Metropole';
  if (p >= 200000) return 'Großstadt';
  if (p >= 50000) return 'Stadt';
  if (p >= 10000) return 'Kleinstadt';
  if (p >= 3000) return 'Gemeinde';
  return 'Dorf';
}
export function describe(c) {
  if (c.description) return c.description;
  const p = c.pop || 0;
  const art = kindOf(c);
  return p ? `${c.name} ist ${art === 'Dorf' ? 'ein Dorf' : art === 'Gemeinde' ? 'eine Gemeinde' : art === 'Kleinstadt' ? 'eine Kleinstadt' : art === 'Stadt' ? 'eine Stadt' : 'eine ' + art} in ${c.state} mit rund ${p.toLocaleString('de-DE')} Einwohnern.` : `${c.name} ist ein Ort in ${c.state}.`;
}

/** Suche nach Namen (Anfang bevorzugt, größere Orte zuerst). */
export function searchCities(world, q, { year = 9999, limit = 12 } = {}) {
  const f = fold(q); if (f.length < 1) return [];
  const starts = []; const has = [];
  for (const c of world.byPop) {
    if (c.since > year) continue;
    if (c.key.startsWith(f)) starts.push(c); else if (c.key.includes(f)) has.push(c);
    if (starts.length >= limit * 3) break;
  }
  return starts.concat(has).slice(0, limit);
}

/** Such-Eingabe mit Ergebnisliste. onPick(city) wird beim Anklicken aufgerufen. */
export function bindPlaceSearch(input, results, ctx, { year = 9999, limit = 10, onPick }) {
  const show = () => {
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; return; }
    const list = searchCities(ctx.world, q, { year, limit });
    results.innerHTML = list.length
      ? list.map((c) => `<button type="button" data-pick="${c.id}"><span>${esc(c.label)}</span><small>${esc(c.state)}${c.pop ? ' · ' + (c.pop >= 1000 ? Math.round(c.pop / 1000) + 'k' : c.pop) : ''}</small></button>`).join('')
      : '<div class="dim small" style="padding:.5rem .7rem">Kein Ort gefunden.</div>';
  };
  input.addEventListener('input', show);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = results.querySelector('[data-pick]'); if (b) { e.preventDefault(); b.click(); } } });
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const c = ctx.world.cityById.get(Number(b.dataset.pick)); results.innerHTML = ''; input.value = ''; if (c) onPick(c);
  });
}
