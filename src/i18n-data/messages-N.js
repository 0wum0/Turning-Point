'use strict';
/**
 * Englische Texte (Spielserver): Gerichte und Beweise – Handlungen, Zustände, Sanktionen, Meldungen, Briefe, Fehlermeldungen, Beschlüsse.
 * Paare [deutsch, englisch]; ${…} sind Platzhalter (Namen und Zahlen). Muster stehen vor den festen Texten.
 */
const R = require('../game/reputation');

const EVENTS = {
  court_convicted: ['Convicted by a court', 'A court found you guilty. Word gets around.'],
  court_false: ['Baseless complaint', 'Your complaint turned out to be baseless. Anyone who wrongly accuses others loses standing.'],
  court_fair: ['Acquitted in court', 'A court acquitted you. Your good name remains intact.'],
  court_amnesty: ['Amnesty granted', 'An amnesty is controversial: victims feel overlooked.'],
};
const pairs = [];
for (const [k, v] of Object.entries(R.REASONS)) { const e = EVENTS[k]; if (e) { pairs.push([v.label, e[0]]); pairs.push([v.why, e[1]]); } }
module.exports = pairs;
