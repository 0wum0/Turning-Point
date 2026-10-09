'use strict';
/** Englische Texte (Spielserver): Stadtwirtschaft (Preisindizes, Zeitungsmeldungen, Beschlüsse, Einsteiger-Aufgabe und Berater). Paare [deutsch, englisch]; ${…} sind Platzhalter. */
module.exports = [
  // Einsteiger
  ['Vergleiche die Preise deiner Stadt', 'Compare the prices in your city'],
  ['Wohnen, Essen und Löhne kosten nicht überall gleich viel. Im Preisbarometer siehst du, ob deine Stadt teuer oder günstig ist – und wo es sich zu leben lohnt.', 'Housing, food and wages do not cost the same everywhere. The price barometer shows whether your city is expensive or cheap – and where living pays off.'],
  ['Wohnen ist in ${rentTip.city} günstiger', 'Housing is cheaper in ${rentTip.city}'],
  ['Deine Unterkunft kostet ${Math.round(eco.rentShare * 100)} % deines Einkommens. In ${rentTip.city} (${rentTip.km} km entfernt) wäre sie rund ${rentTip.pct} % billiger – etwa ${dm(rentTip.savePerDay, cur)} pro Tag. Ein Umzug kostet aber Geld und Coins, und Arbeit musst du dort neu suchen.', 'Your housing costs ${Math.round(eco.rentShare * 100)} % of your income. In ${rentTip.city} (${rentTip.km} km away) it would be about ${rentTip.pct} % cheaper – roughly ${dm(rentTip.savePerDay, cur)} per day. A move costs money and coins, though, and you would have to look for work there.'],
  ['Preise vergleichen', 'Compare prices'],
  // Beschlüsse der Ämter
  ['Mietpreisbremse', 'Rent brake'], ['Begrenzt, wie schnell das Mietniveau in deiner Stadt steigen darf', 'Limits how fast the rent level in your city may rise'],
  ['Baulandausweisung', 'Building land designation'], ['Mehr Bauland und damit mehr Wohnungen in deiner Stadt', 'More building land and therefore more homes in your city'],
  ['Wohnungsbauprogramm (Land)', 'Housing programme (state)'], ['Mehr Wohnungsangebot in allen Städten deines Bundeslandes', 'More housing supply in all cities of your state'],
  ['Preisbremse / Inflationsziel', 'Price brake / inflation target'], ['Schiebt das Preisniveau aller Städte etwas nach unten oder oben', 'Pushes the price level of all cities slightly down or up'],
  ['Mietpreisbremse in ${c}: Mietniveau steigt höchstens ${v} % pro Jahr', 'Rent brake in ${c}: the rent level rises by at most ${v} % per year'],
  ['Baulandausweisung in ${c}: ${v} % mehr Wohnungsangebot', 'Building land designation in ${c}: ${v} % more housing supply'],
  ['Wohnungsbauprogramm in ${c}: ${v} % mehr Wohnungsangebot', 'Housing programme in ${c}: ${v} % more housing supply'],
  ['Preisbremse: Preisniveau ${v} Punkte', 'Price brake: price level ${v} points'], ['Inflationsziel: Preisniveau ${v} Punkte', 'Inflation target: price level ${v} points'],
  ['Dieser Wert ist nicht erlaubt.', 'This value is not allowed.'],
  // Zeitungsmeldungen zur Preisentwicklung
  ['Lebensmittel in ${c} werden teurer', 'Food in ${c} is getting dearer'], ['Die Preise für Brot, Fleisch und Gemüse ziehen an: etwa ${p} % mehr als vor einem Jahr.', 'Prices for bread, meat and vegetables are rising: about ${p} % more than a year ago.'],
  ['Lebensmittel in ${c} werden billiger', 'Food in ${c} is getting cheaper'], ['Auf den Märkten wird es günstiger: Lebensmittel kosten etwa ${p} % weniger als vor einem Jahr.', 'Things are getting cheaper at the markets: food costs about ${p} % less than a year ago.'],
  ['Mieten in ${c} steigen', 'Rents in ${c} are rising'], ['Wohnungen werden knapper und teurer: Die Mieten liegen etwa ${p} % über dem Vorjahr.', 'Homes are getting scarcer and dearer: rents are about ${p} % above last year.'],
  ['Mieten in ${c} geben nach', 'Rents in ${c} are easing'], ['Der Wohnungsmarkt entspannt sich: Die Mieten liegen etwa ${p} % unter dem Vorjahr.', 'The housing market is easing: rents are about ${p} % below last year.'],
  ['Gaststätten und Dienste in ${c} verlangen mehr', 'Restaurants and services in ${c} charge more'], ['Friseur, Wirtshaus und Handwerk kosten etwa ${p} % mehr als vor einem Jahr.', 'Hairdressers, inns and trades cost about ${p} % more than a year ago.'],
  ['Dienste in ${c} werden günstiger', 'Services in ${c} are getting cheaper'], ['Der Wettbewerb drückt die Preise: Gaststätten und Dienste kosten etwa ${p} % weniger.', 'Competition is pushing prices down: restaurants and services cost about ${p} % less.'],
  ['Bauen in ${c} wird teurer', 'Building in ${c} is getting dearer'], ['Die Baukosten steigen um etwa ${p} %. Neue Räume und Häuser kosten mehr.', 'Building costs are rising by about ${p} %. New rooms and houses cost more.'],
  ['Bauen in ${c} wird günstiger', 'Building in ${c} is getting cheaper'], ['Die Baukosten sinken um etwa ${p} %. Ein guter Zeitpunkt zum Bauen und Erweitern.', 'Building costs are falling by about ${p} %. A good time to build and expand.'],
  ['Löhne in ${c} steigen', 'Wages in ${c} are rising'], ['Betriebe suchen Personal: Die Löhne liegen etwa ${p} % über dem Vorjahr.', 'Businesses are looking for staff: wages are about ${p} % above last year.'],
  ['Löhne in ${c} sinken', 'Wages in ${c} are falling'], ['Es gibt mehr Arbeitssuchende als Stellen: Die Löhne liegen etwa ${p} % unter dem Vorjahr.', 'There are more job seekers than jobs: wages are about ${p} % below last year.'],
];
