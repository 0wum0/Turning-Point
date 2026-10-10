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
pairs.push(
  ['Lerne das Gericht kennen', 'Get to know the court'],
  ['Wer dir schadet, hinterlässt Spuren. Im Bereich „Recht & Gericht“ siehst du, wie Beweise, Anzeige, Vergleich und Strafen funktionieren – bevor du sie brauchst.', 'Anyone who harms you leaves traces. In the “Law & Court” area you can see how evidence, complaints, settlements and penalties work – before you need them.'],
  ['Du wurdest verklagt – Anwalt oder Vergleich?', 'You have been sued – lawyer or settlement?'],
  ['Gegen dich läuft ein Verfahren. Mit einem Rechtsanwalt, einem Vergleich oder einem Geständnis bestimmst du selbst, wie es ausgeht.', 'Proceedings are running against you. With a lawyer, a settlement or a confession you decide how it ends.'],
  ['Zum Gericht', 'To the court'],
  ['Spuren am Tatort – Anzeige erstatten?', 'Traces at the scene – file a complaint?'],
  ['Jemand hat dir geschadet und Spuren hinterlassen. Sie verblassen: Stärke sie mit einem Detektiv oder erstatte Anzeige.', 'Someone harmed you and left traces. They fade: strengthen them with a detective or file a complaint.'],
  ['Spuren ansehen', 'View traces'],
  ['Du bist in Haft', 'You are in custody'],
  ['Wirtschaftliche Handlungen sind gesperrt, bis die Haft endet. Essen, Schlafen, Briefe und Chat gehen weiter; deine Spielzeit läuft geschützt.', 'Economic actions are blocked until the custody ends. Eating, sleeping, letters and chat continue; your game clock runs protected.'],
  ['Details', 'Details'],
);
module.exports = pairs;
