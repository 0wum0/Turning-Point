'use strict';
/** Englische Texte (Spielserver): Stadtwirtschaft (Preisindizes, Zeitungsmeldungen, Beschlüsse, Einsteiger-Aufgabe und Berater). Paare [deutsch, englisch]; ${…} sind Platzhalter. */
module.exports = [
  // Einsteiger
  ['Vergleiche die Preise deiner Stadt', 'Compare the prices in your city'],
  ['Wohnen, Essen und Löhne kosten nicht überall gleich viel. Im Preisbarometer siehst du, ob deine Stadt teuer oder günstig ist – und wo es sich zu leben lohnt.', 'Housing, food and wages do not cost the same everywhere. The price barometer shows whether your city is expensive or cheap – and where living pays off.'],
  ['Wohnen ist in ${rentTip.city} günstiger', 'Housing is cheaper in ${rentTip.city}'],
  ['Deine Unterkunft kostet ${Math.round(eco.rentShare * 100)} % deines Einkommens. In ${rentTip.city} (${rentTip.km} km entfernt) wäre sie rund ${rentTip.pct} % billiger – etwa ${dm(rentTip.savePerDay, cur)} pro Tag. Ein Umzug kostet aber Geld und Coins, und Arbeit musst du dort neu suchen.', 'Your housing costs ${Math.round(eco.rentShare * 100)} % of your income. In ${rentTip.city} (${rentTip.km} km away) it would be about ${rentTip.pct} % cheaper – roughly ${dm(rentTip.savePerDay, cur)} per day. A move costs money and coins, though, and you would have to look for work there.'],
  ['Preise vergleichen', 'Compare prices'],
];
