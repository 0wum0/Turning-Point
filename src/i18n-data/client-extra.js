'use strict';
/** Zusätzliche englische Texte: Orte, Karte, Berufsgruppen, Rollen. */
const KINDS = { Dorf: ['village', 'a village'], Gemeinde: ['municipality', 'a municipality'], Kleinstadt: ['small town', 'a small town'], Stadt: ['city', 'a city'], Großstadt: ['large city', 'a large city'], Metropole: ['metropolis', 'a metropolis'] };
const exact = {
  'Stadt oder Dorf suchen … (rund 9.000 Orte)': 'Search a city or village … (about 9,000 places)',
  'Große Städte zum Schnellstart:': 'Big cities for a quick start:',
  'Ort suchen …': 'Search a place …', 'Kein Ort gefunden.': 'No place found.', 'Zurück zu meinem Wohnort': 'Back to my home place',
  'Handwerk': 'Crafts', 'Bau': 'Construction', 'Landwirtschaft': 'Agriculture', 'Industrie': 'Industry', 'Verkehr': 'Transport', 'Gastronomie': 'Hospitality',
  'Dienstleistung': 'Services', 'Energie': 'Energy', 'Technik': 'Technology', 'Kreatives': 'Creative',
  'Diesen Ort gibt es noch nicht.': 'This place does not exist yet.', 'Team': 'Team',
};
const patterns = [];
for (const [de, [en, art]] of Object.entries(KINDS)) {
  exact[de] = en.charAt(0).toUpperCase() + en.slice(1);
  const E = en.charAt(0).toUpperCase() + en.slice(1);
  patterns.push([`^(.+) · ${de} · ([\\d.,kmb]+) Einwohner · seit (\\d+)$`, `$1 · ${E} · $2 inhabitants · since $3`]);
  patterns.push([`^(.+) · ${de} · ([\\d.,kmb]+) Einwohner$`, `$1 · ${E} · $2 inhabitants`]);
  patterns.push([`^(.+) · ${de}$`, `$1 · ${E}`]);
  patterns.push([`^(.+) ist ${de === 'Dorf' ? 'ein Dorf' : de === 'Gemeinde' ? 'eine Gemeinde' : de === 'Kleinstadt' ? 'eine Kleinstadt' : de === 'Stadt' ? 'eine Stadt' : de === 'Großstadt' ? 'eine Großstadt' : 'eine Metropole'} in (.+) mit rund ([\\d.]+) Einwohnern\\.$`, `$1 is ${art} in $2 with about $3 inhabitants.`]);
}
patterns.push(['^([\\d.,kmbt]+) DM \\(Wert 1945\\)$', '$1 DM (1945 value)']);
patterns.push(['^(.+) ist ein Ort in (.+)\\.$', '$1 is a place in $2.']);
patterns.push(['^(\\d+[.,]?\\d*k?m?) Einwohner$', '$1 inhabitants']);
module.exports = { exact, patterns };
