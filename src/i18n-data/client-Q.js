'use strict';
/**
 * Englische Texte der Oberfläche: Handel & Transport (Handelsrouten, Beste Route finden, Fracht und Speditionen, Verkehrspolitik,
 * Fracht in Lieferverträgen, Glossar, Aufgabe und Hinweise).
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz] (Muster werden zuerst ausgewertet). In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);
// ---- Muster
// ---- fest
X([
  // Aufgabe, Einführung, Hinweise
  ['Richte deine erste Handelsroute ein', 'Set up your first trade route'],
  ['Waren sind nicht überall gleich teuer. Eine Handelsroute kauft sie dort, wo sie billig sind, und verkauft sie dort, wo sie mehr bringen – automatisch. „Beste Route finden“ rechnet dir vorher alles vor.', 'Goods do not cost the same everywhere. A trade route buys them where they are cheap and sells them where they fetch more – automatically. “Find the best route” works it all out for you beforehand.'],
  ['Handel & Transport', 'Trade & transport'],
  // Glossar
  ['Handelsroute', 'Trade route'],
  ['Ein Betrieb kauft eine Ware in einer Stadt, schickt sie in eine andere und verkauft sie dort – automatisch alle paar Tage. Der Gewinn kommt aus dem Preisunterschied abzüglich Fracht, Gebühren und Risiko und ist auf rund 24 % im Jahr begrenzt.', 'A business buys a good in one town, ships it to another and sells it there – automatically every few days. The profit comes from the price difference minus freight, fees and risk, and is capped at about 24 % a year.'],
  ['Fracht', 'Freight'],
  ['Was der Transport einer Ware kostet. Sie hängt von Gewicht, Entfernung, Verkehrsträger, Kraftstoff- und Strompreis, Jahreszeit und Politik ab. Bei Lieferverträgen zahlt sie der Käufer (ab Werk) oder der Verkäufer (frei Haus).', 'What it costs to transport a good. It depends on weight, distance, mode of transport, fuel and electricity price, season and politics. In supply contracts the buyer pays it (ex works) or the seller (delivered).'],
  ['Spedition', 'Haulier'],
  ['Ein Transport- oder Logistikbetrieb. Er darf Routen mit eigenem Fuhrpark fahren (billiger) und anderen Fracht verkaufen – mit einem Frachtangebot in Prozent des Tarifs.', 'A transport or logistics business. It can run routes with its own fleet (cheaper) and sell freight to others – with a freight offer as a percentage of the tariff.'],
  ['Frachtvertrag', 'Freight contract'],
  ['Ein Händler oder Lieferpartner bucht bei einer Spedition Fracht zum Angebotspreis. Die Spedition bekommt die Zahlung abzüglich ihrer eigenen Kosten; mehr als ihre Kapazität kann sie nicht fahren.', 'A trader or supply partner books freight from a haulier at the offered price. The haulier receives the payment minus its own costs; it cannot carry more than its capacity.'],
  ['Maut', 'Toll'],
  ['Maut und Hafengebühr', 'Toll and port fee'],
  ['Eine Gebühr auf die Fracht: ab 2005 für Lastwagen, dazu Sätze der Städte (im Rahmen des Bundestags). Sie erhöht die Kosten jeder Route durch diese Stadt.', 'A fee on freight: for lorries from 2005, plus rates set by towns (within the frame of the Bundestag). It raises the cost of every route through that town.'],
  ['Schmuggel', 'Smuggling'],
  ['Wer Zoll oder Maut umgeht, spart Geld, riskiert aber bei jeder Fahrt eine Kontrolle: Geldstrafe, Beschlagnahme, Spuren vor Gericht und ein Skandal im Ansehen.', 'Anyone who evades duty or tolls saves money but risks a check on every trip: a fine, seizure, evidence in court and a scandal for their reputation.'],
  ['Transportversicherung', 'Freight insurance'],
  ['Kostet einen kleinen Teil der Ladung und ersetzt einen großen Teil der Ware, die durch Unfall oder Plünderung verloren geht.', 'Costs a small part of the cargo and replaces a large part of the goods lost through accident or plunder.'],
  ['Verkehrsträger', 'Mode of transport'],
  ['Fuhrwerk und Bahn nach dem Krieg, Lastwagen ab 1950, Containerschiffe ab 1970, Luftfracht ab 1980, später Drohnen und Röhrenfracht. Bahn, Hafen und Flughafen gibt es nur in Orten mit Anschluss.', 'Horse cart and rail after the war, lorries from 1950, container ships from 1970, air freight from 1980, later drones and tube freight. Rail, port and airport exist only in places with a connection.'],
  ['Lieferzeit', 'Delivery time'],
  ['So viele Spieltage braucht die Fracht zwischen zwei Orten. Bei einem Liefervertrag über mehrere Städte kommt die erste Lieferung erst nach dieser Zeit an.', 'This many game days the freight needs between two places. In a supply contract across several towns the first delivery only arrives after this time.'],
  ['Hier schickst du Waren zwischen Städten: Eine Handelsroute kauft dort, wo es billig ist, und verkauft dort, wo es mehr bringt. Die Vorschau rechnet dir Fracht, Gebühren und Risiko vor.', 'Here you ship goods between towns: a trade route buys where it is cheap and sells where it fetches more. The preview works out freight, fees and risk for you.'],
  ['Zeig mir, wo ich eine Route finde', 'Show me where to find a route'],
  ['Tippe auf „Beste Route finden“ – wir zeigen dir, wo sich Handel gerade lohnt.', 'Tap “Find the best route” – we show you where trade pays off right now.'],
]);
module.exports = { exact, patterns };
