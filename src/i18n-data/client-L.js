'use strict';
/**
 * Englische Texte der Oberfläche: Stadtwirtschaft (Preisbarometer, Vergleich, Hinweise, Gründungsdialog, Beschlüsse der Ämter, Glossar).
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz] (Muster werden zuerst ausgewertet). In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

// ---- Muster
T('Was kostet das Leben in {}? Das Preisbarometer vergleicht Lebensmittel, Mieten, Dienste, Baukosten und Löhne mit dem Rest des Landes.', 'What does life cost in $1? The price barometer compares food, rents, services, building costs and wages with the rest of the country.');
T('höchstens {n} % pro Jahr', 'at most $1 % per year');
T('+{n} %', '+$1 %');
T('{n} Punkte', '$1 points');
T('+{n} Punkte', '+$1 points');
T('−{n} Punkte', '−$1 points');
T('Mietpreisbremse {n} % pro Jahr', 'Rent brake $1 % per year');
T('Wohnungsangebot +{n} %', 'Housing supply +$1 %');
T('Preisniveau +{n} Punkte', 'Price level +$1 points');
T('Preisniveau −{n} Punkte', 'Price level −$1 points');
T('{n} Betriebe dieser Art in der Stadt · Nachfrage {n} von {n} Räumen', '$1 businesses of this kind in the city · demand $2 of $3 rooms');
T('Nach {} sortieren', 'Sort by $1');
T('{} – sortieren', '$1 – sort');

const SECTORS = [['Lebensmittel', 'Food'], ['Wohnen & Miete', 'Housing & rent'], ['Dienstleistungen & Gastro', 'Services & hospitality'], ['Baukosten', 'Building costs'], ['Löhne', 'Wages']];
for (const [de, en] of SECTORS) { exact[`${de} – sortieren`] = `${en} – sort`; exact[`Nach ${de} sortieren`] = `Sort by ${en}`; }

X([
  // Preisbarometer
  ['Preisbarometer', 'Price barometer'], ['Preisindex', 'Price index'],
  ['So teuer ist das Leben hier im Vergleich zum Durchschnitt aller Orte im Jahr', 'How expensive life is here compared with the average of all places in the year'],
  ['. Pfeile zeigen die Veränderung seit letztem Jahr.', '. Arrows show the change since last year.'],
  ['Die Stadtwirtschaft ist gerade abgeschaltet. Es gelten feste Stadtpreise.', 'The city economy is switched off at the moment. Fixed city prices apply.'],
  ['Lebensmittel', 'Food'], ['Wohnen & Miete', 'Housing & rent'], ['Dienstleistungen & Gastro', 'Services & hospitality'], ['Baukosten', 'Building costs'], ['Löhne', 'Wages'],
  ['Essen', 'Food'], ['Miete', 'Rent'], ['Dienste', 'Services'], ['Bauen', 'Building'],
  ['Günstig hier', 'Cheap here'], ['Durchschnitt', 'Average'], ['Teuer hier', 'Expensive here'], ['Niedrig hier', 'Low here'], ['Hoch hier', 'High here'],
  ['teurer', 'dearer'], ['billiger', 'cheaper'], ['unverändert', 'unchanged'], ['höher', 'higher'], ['niedriger', 'lower'],
  ['seit letztem Jahr', 'since last year'], ['zum Durchschnitt', 'vs. average'], ['Verlauf der letzten Jahre', 'Trend of the last years'],
  ['Lebensmittel sind knapp', 'Food is scarce'], ['Lebensmittel gibt es reichlich', 'Food is plentiful'], ['Wohnungen sind knapp', 'Homes are scarce'], ['Viele Wohnungen frei', 'Many homes are vacant'],
  ['Dienste sind gefragt', 'Services are in demand'], ['Viel Konkurrenz bei Diensten', 'Lots of competition among services'], ['Baufirmen sind ausgelastet', 'Builders are fully booked'], ['Baufirmen suchen Aufträge', 'Builders are looking for work'],
  ['Arbeitskräfte werden gesucht', 'Workers are in demand'], ['Viele Arbeitssuchende', 'Many job seekers'],
  ['Das Preisbarometer zeigt, wie teuer das Leben in einer Stadt ist: Lebensmittel, Wohnen, Dienstleistungen, Bauen – und wie hoch die Löhne sind.', 'The price barometer shows how expensive life is in a city: food, housing, services, building – and how high wages are.'],
  ['Die Preise folgen Angebot und Nachfrage: Wo viele Menschen wohnen und wenige Betriebe oder Wohnungen da sind, wird es teurer. Wo viele Betriebe konkurrieren, wird es billiger.', 'Prices follow supply and demand: where many people live and there are few businesses or homes, things get dearer. Where many businesses compete, things get cheaper.'],
  ['Der Vergleich zum Durchschnitt zeigt dir, wo sich leben, arbeiten und gründen am meisten lohnt. Ämter wie Bürgermeister und Landtag können die Preise mit Beschlüssen beeinflussen.', 'The comparison with the average shows where living, working and founding a business pays off most. Offices such as mayor and state parliament can influence prices with decisions.'],
  // Hinweise
  ['Hier ist Wohnen teurer als in der Nähe: In', 'Housing is dearer here than nearby: In'], ['(', '('], [' km entfernt) ist Wohnen etwa', ' km away) housing is about'],
  ['km entfernt) ist Wohnen etwa', 'km away) housing is about'], ['% günstiger. Ein Umzug dorthin spart dir rund', '% cheaper. Moving there saves you about'], ['pro Tag.', 'per day.'],
  ['Bedenke: Ein Umzug kostet Geld und Coins, und Arbeit musst du dort neu suchen.', 'Keep in mind: a move costs money and coins, and you would have to look for work there.'],
  ['Stadt ansehen', 'View city'], ['In', 'In'], ['km entfernt) liegen die Löhne etwa', 'km away) wages are about'], ['% höher als hier.', '% higher than here.'],
  // Vergleich
  ['Vergleich mit anderen Orten', 'Comparison with other places'], ['Unterschied zum Durchschnitt – tippe auf ein Symbol zum Sortieren', 'Difference from the average – tap a symbol to sort'],
  ['Ort hinzufügen', 'Add a place'], ['Ort zum Vergleich hinzufügen …', 'Add a place to compare …'], ['Ort', 'Place'], ['Hier', 'Here'], ['Aus dem Vergleich entfernen', 'Remove from comparison'],
  ['Die Preise sind gerade nicht erreichbar.', 'The prices cannot be reached right now.'],
  ['Hier siehst du, wie teuer Essen, Wohnen und Löhne in deiner Stadt sind – und wo es günstiger ist.', 'Here you can see how expensive food, housing and wages are in your city – and where it is cheaper.'],
  // Gründungsdialog
  ['Viel Konkurrenz – die Nachfrage ist knapp', 'Lots of competition – demand is scarce'], ['Einige Betriebe dieser Art – es wird eng', 'Several businesses of this kind – it is getting crowded'],
  ['Die Nachfrage reicht für einen weiteren Betrieb', 'Demand is enough for another business'], ['Kaum Konkurrenz – die Nachfrage ist frei', 'Hardly any competition – demand is free'],
  ['Betriebe dieser Art in der Stadt (Spieler und Bots) gegen die Nachfrage der Stadt', 'Businesses of this kind in the city (players and bots) against the demand of the city'],
  ['Nachfrage vor Ort', 'Local demand'],
  ['Preisniveau der Branche', 'Price level of the industry'], ['(wirkt auf deinen Umsatz)', '(affects your revenue)'],
  // Beschlüsse
  ['Gewerbesteuer-Zuschlag und Baulandausweisung in der Stadt.', 'Trade tax surcharge and building land designation in the city.'],
  ['Gewerbesteuer-Zuschlag, Subvention, Mietpreisbremse und Baulandausweisung in der Stadt.', 'Trade tax surcharge, subsidy, rent brake and building land designation in the city.'],
  ['Preisstützung für eine Ware und Wohnungsbauprogramm im Bundesland.', 'Price support for a good and housing programme in the state.'],
  ['Mehrwertsteuer auf Waren, Einfuhrzoll, Branchen-Subvention und Preisbremse.', 'VAT on goods, import tariff, industry subsidy and price brake.'],
  ['Zielwert', 'target level'],
  ['Das Mietniveau in deiner Stadt darf höchstens um', 'The rent level in your city may rise by at most'], ['% pro Jahr steigen (0 heißt: eingefroren).', '% per year (0 means: frozen).'],
  ['Nebenwirkung: Vermieter bauen und vermieten weniger, das Wohnungsangebot sinkt um', 'Side effect: landlords build and let less, housing supply falls by'],
  ['%. Der Druck auf die Mieten wächst, und nach der Amtszeit holt der Markt auf. Auch deine eigenen Mieteinnahmen steigen nur langsam.', '%. Pressure on rents grows, and after the term the market catches up. Your own rental income also rises only slowly.'],
  ['Neues Bauland: Das Wohnungsangebot in deiner Stadt wächst um', 'New building land: housing supply in your city grows by'], ['%. Die Mieten tendieren nach unten.', '%. Rents tend downwards.'],
  ['Nebenwirkung: Viele wollen gleichzeitig bauen – Bauen wird etwas teurer (auch für deine Betriebe).', 'Side effect: many want to build at the same time – building gets a little dearer (for your businesses too).'],
  ['Wohnungsbauprogramm: Das Wohnungsangebot in allen Städten deines Bundeslandes wächst um', 'Housing programme: housing supply in all cities of your state grows by'], ['%. Wirkung zeigt sich zuerst in Städten mit vielen Einwohnern.', '%. The effect shows first in cities with many residents.'],
  ['Preisbremse: Das Preisniveau aller Städte wird nach unten geschoben – Wohnen, Essen, Dienste und Bauen.', 'Price brake: the price level of all cities is pushed down – housing, food, services and building.'],
  ['Höheres Inflationsziel: Das Preisniveau aller Städte wird nach oben geschoben.', 'Higher inflation target: the price level of all cities is pushed up.'],
  ['Nebenwirkung: Die Preise der Betriebe folgen – bei einer Bremse verdienen sie etwas weniger, die Löhne folgen abgeschwächt.', 'Side effect: business prices follow – with a brake they earn a little less, and wages follow more weakly.'],
  ['Erlaubter Anstieg der Mieten', 'Permitted rent increase'], ['Preisniveau verschieben um', 'Shift the price level by'], ['Zusätzliches Wohnungsangebot', 'Additional housing supply'],
  ['Mieten eingefroren (0 % pro Jahr)', 'Rents frozen (0 % per year)'],
  // Glossar
  ['Eine Zahl, die zeigt, wie teuer etwas in einer Stadt ist. +10 % heißt: zehn Prozent teurer als im Durchschnitt. Das Preisbarometer zeigt sie für Essen, Wohnen, Dienste, Bauen und Löhne.', 'A number showing how expensive something is in a city. +10 % means: ten percent dearer than average. The price barometer shows it for food, housing, services, building and wages.'],
  ['Nachfrage', 'Demand'], ['Wie viel die Menschen kaufen oder mieten wollen. Wohnen viele Menschen in einer Stadt, ist die Nachfrage hoch – und die Preise steigen, wenn das Angebot nicht mithält.', 'How much people want to buy or rent. If many people live in a city, demand is high – and prices rise if supply does not keep up.'],
  ['Marktangebot', 'Supply'], ['Wie viel Wohnungen, Waren oder Dienste zur Verfügung stehen. Viele Betriebe derselben Art in einer Stadt bedeuten ein großes Angebot – und sinkende Preise.', 'How many homes, goods or services are available. Many businesses of the same kind in a city mean a large supply – and falling prices.'],
  ['Die Übersicht in Stadt und Zeitung: Sie zeigt für deine Stadt, ob Wohnen, Essen, Dienste, Bauen und Löhne teuer oder günstig sind, wie sie sich entwickeln und wie andere Orte im Vergleich dastehen.', 'The overview in the city and the newspaper: it shows whether housing, food, services, building and wages are expensive or cheap in your city, how they develop and how other places compare.'],
  ['Mietpreisbremse', 'Rent brake'], ['Ein Beschluss von Bürgermeister oder Stadtrat: Das Mietniveau darf in der Stadt nur noch langsam steigen. Mieter freut es, Vermieter bauen weniger – das Wohnungsangebot wächst langsamer.', 'A decision by the mayor or city council: the rent level in the city may only rise slowly. Tenants like it, landlords build less – housing supply grows more slowly.'],
  ['Baulandausweisung', 'Building land designation'], ['Die Stadt weist Flächen zum Bauen aus. Es entstehen mehr Wohnungen und die Mieten sinken – dafür wird Bauen etwas teurer, weil alle gleichzeitig bauen wollen.', 'The city designates land for building. More homes are built and rents fall – but building gets a little dearer because everyone wants to build at once.'],
  // Tagesblatt
  ['Preise in den Städten mit Betrieben und Einwohnern (gegenüber dem Normalniveau):', 'Prices in the cities with businesses and residents (compared with the normal level):'], ['Höchste Mieten:', 'Highest rents:'],
]);

module.exports = { exact, patterns };
