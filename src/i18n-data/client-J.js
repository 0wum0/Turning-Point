'use strict';
/**
 * Englische Texte der Oberfläche: Warenkreislauf (Versorgung, Lieferverträge, Lieferantensuche) und Wirtschaftspolitik der Ämter.
 * exact: ganzer Text → Übersetzung; patterns: [Regex, Ersatz]. In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 * Muster stehen vor den Einzeltexten (Reihenfolge der Auswertung: Muster zuerst, dann exakte Treffer).
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

// ---- Muster (Texte mit Zahlen)
T('Was Verträge nicht liefern, kauft der Betrieb beim günstigsten Anbieter – meist im Großhandel (rund {n} % teurer als per Vertrag).', 'Whatever contracts do not deliver, the business buys from the cheapest supplier – usually wholesale (about $1 % dearer than by contract).');
T('– immer lieferbar, aber rund {n} % teurer.', '– always available, but about $1 % dearer.');
T('noch {n} Tage', '$1 days left');
T('{n} Tage', '$1 days');
T('liefert zu {n} %', 'delivers $1 %');
T('{n} Verträge bisher', '$1 contracts so far');
T('Zoll {} %', 'Tariff $1 %');
T('Umlage +{}', 'Levy +$1');
T('Gewerbesteuer {}', 'Trade tax $1');
T('Mehrwertsteuer {}', 'VAT $1');
T('Menge pro Tag ({})', 'Quantity per day ($1)');
T('{n} % = {}', '$1 % = $2');
T('{} – Zuschlag bis {n}, Subvention bis {n} %', '$1 – surcharge up to $2, subsidy up to $3 %');

patterns.push(['^([\\d.,]+ (?:DM|€)) je ([^·]+)$', '$1 per $2']);
X([
  ['Leistung nur', 'Performance only'], ['Versorgung', 'Supplies'], ['Versorgung gut', 'Supplies good'], ['Versorgung knapp', 'Supplies low'], ['Versorgung fehlt', 'Supplies missing'], ['Keine Zutaten nötig', 'No ingredients needed'],
  ['Geliefert nach Liefervertrag', 'Delivered under a supply contract'], ['Vertrag', 'Contract'], ['Großhandel', 'Wholesale'], ['fehlt', 'missing'],
  ['Beim Großhandel gekauft (etwas teurer)', 'Bought from wholesale (a bit dearer)'], ['Diese Menge fehlt, die Leistung sinkt', 'This amount is missing, performance drops'],
  ['Anbieter in deiner Region suchen', 'Look for suppliers in your region'], ['Lieferant suchen', 'Find supplier'], ['pro Tag', 'per day'],
  ['Dieser Betrieb stellt seine Waren selbst her und braucht keine Zutaten.', 'This business makes its goods itself and needs no ingredients.'],
  ['Dein Betrieb ist gut versorgt. Jeden Tag braucht er:', 'Your business is well supplied. Every day it needs:'],
  ['Es wird knapp. Jeden Tag braucht dein Betrieb:', 'Supplies are running low. Every day your business needs:'],
  ['Es fehlen Zutaten. Jeden Tag braucht dein Betrieb:', 'Ingredients are missing. Every day your business needs:'],
  ['Zutaten pro Tag', 'Ingredients per day'], ['Zuschuss vom Staat eingerechnet:', 'State subsidy included:'], ['– es fehlt:', '– missing:'],
  ['Schließe einen Liefervertrag oder warte, bis sich der Markt beruhigt.', 'Sign a supply contract or wait until the market calms down.'],
  ['Schalte „Automatisch einkaufen“ ein, damit der Betrieb im Großhandel nachkauft.', 'Switch on “Buy automatically” so the business restocks from wholesale.'],
  ['Automatisch einkaufen', 'Buy automatically'], ['Hergestellt pro Tag:', 'Produced per day:'], ['Abnehmer für', 'Buyers for'],
  ['Einnahmen aus Lieferverträgen:', 'Income from supply contracts:'], ['Einnahmen aus Lieferverträgen', 'Income from supply contracts'], ['Wareneinkauf', 'Purchases of goods'], ['Mehrwertsteuer', 'VAT'],
  ['Du kaufst', 'You buy'], ['Du verkaufst', 'You sell'], ['pro Tag von', 'per day from'], ['pro Tag an', 'per day to'], ['je', 'per'], ['verlängert sich', 'renews itself'],
  ['Vertrag kündigen', 'Cancel contract'],
  // Übersicht
  ['Warenkreislauf – so hängt alles zusammen', 'Goods cycle – how everything connects'],
  ['Jeder Betrieb stellt Waren her und braucht dafür Zutaten: Die Bäckerei braucht Mehl, die Mühle braucht Getreide, der Bauernhof liefert es. Fehlen Zutaten, arbeitet der Betrieb schlechter.', 'Every business makes goods and needs ingredients for it: the bakery needs flour, the mill needs grain, the farm supplies it. If ingredients are missing, the business performs worse.'],
  ['Einfach:', 'Simple:'], ['Fehlende Zutaten kauft der Betrieb automatisch im', 'The business buys missing ingredients automatically from'],
  ['Besser:', 'Better:'], ['Schließe einen', 'Sign a'], ['Liefervertrag', 'supply contract'],
  ['mit einem anderen Betrieb. Das ist günstiger, und der Lieferant verdient mehr als im Großhandel.', 'with another business. It is cheaper, and the supplier earns more than at wholesale.'],
  ['Preise', 'Prices'], ['hängen von Angebot und Nachfrage ab – und von den Beschlüssen der Ämter (Steuern, Zoll, Zuschüsse).', 'depend on supply and demand – and on the decisions of public offices (taxes, tariffs, subsidies).'],
  ['dein Betrieb', 'your business'], ['Großhandelspreise bei dir in der Stadt', 'Wholesale prices in your city'], ['knapp', 'scarce'], ['reichlich', 'plentiful'],
  ['Zuschuss auf den Einkauf', 'Subsidy on purchases'], ['Zoll auf den importierten Anteil', 'Tariff on the imported share'],
  ['Meine Lieferverträge', 'My supply contracts'], ['Lieferverträge', 'Supply contracts'], ['Lade …', 'Loading …'],
  ['Ein Liefervertrag legt fest: Wer liefert wem welche Ware, wie viel pro Tag, zu welchem Preis und wie lange.', 'A supply contract sets who delivers which good to whom, how much per day, at what price and for how long.'],
  ['Der Käufer zahlt jeden Tag automatisch aus der Firmenkasse, der Lieferant bekommt das Geld in seine Kasse. Verträge sind günstiger als der Großhandel.', 'The buyer pays automatically every day from the company cash, the supplier receives the money in its cash. Contracts are cheaper than wholesale.'],
  ['Öffne bei einem Betrieb die Versorgung und tippe bei einer Zutat auf „Lieferant suchen“.', 'Open the supplies of a business and tap “Find supplier” at an ingredient.'],
  ['Noch keine Verträge. Tippe bei einer Zutat auf „Lieferant suchen“ – oder bei einem Erzeugnis auf „Abnehmer“.', 'No contracts yet. Tap “Find supplier” at an ingredient – or “Buyers” at a product.'],
  ['Angebote an dich', 'Offers to you'], ['Laufende Verträge', 'Running contracts'], ['Deine offenen Angebote', 'Your open offers'],
  ['Annehmen', 'Accept'], ['Ablehnen', 'Decline'], ['Zurückziehen', 'Withdraw'],
  // Dialoge
  ['Abnehmer suchen', 'Find buyers'], ['Suche läuft …', 'Searching …'], ['Schließen', 'Close'], ['Abbrechen', 'Cancel'],
  ['Diese Betriebe stellen die Ware her.', 'These businesses make the good.'], ['Diese Betriebe brauchen die Ware.', 'These businesses need the good.'],
  ['Im Vertrag legt ihr Menge, Preis und Laufzeit fest.', 'In the contract you agree on quantity, price and term.'], ['Richtpreis:', 'Guide price:'],
  ['in deiner Stadt', 'in your city'], ['Kann etwa liefern:', 'Can supply about:'], ['Braucht etwa:', 'Needs about:'], ['neu am Markt', 'new on the market'], ['Vertrag besteht', 'Contract exists'],
  ['Vertrag anbieten', 'Offer contract'], ['von', 'from'], ['an', 'to'], ['Laufzeit', 'Term'], ['Preis:', 'Price:'], ['Angebot senden', 'Send offer'],
  ['Gerade bietet niemand in deiner Region diese Ware an. Der Großhandel springt ein, solange „Automatisch einkaufen“ an ist.', 'Nobody in your region offers this good right now. Wholesale steps in as long as “Buy automatically” is on.'],
  ['Im Großhandel zahlst du etwa', 'At wholesale you pay about'], ['Der Großhandel zahlt dir nur etwa', 'Wholesale pays you only about'], ['Mit dem Vertrag sparst du', 'With the contract you save'], ['Mit dem Vertrag verdienst du', 'With the contract you earn'],
  ['pro Tag mehr.', 'more per day.'], ['Dieser Preis ist schlechter als der Großhandel.', 'This price is worse than wholesale.'],
  ['Automatisch verlängern', 'Renew automatically'], ['Der Vertrag läuft nach Ablauf von selbst weiter, bis jemand kündigt.', 'After expiry the contract simply continues until someone cancels.'],
  ['Das Angebot ist unterwegs. Du bekommst Post, sobald geantwortet wird.', 'The offer is on its way. You will get mail as soon as it is answered.'],
  ['Vertrag abgeschlossen. Ab dem nächsten Spieltag wird geliefert.', 'Contract signed. Deliveries start on the next game day.'], ['Angebot abgelehnt.', 'Offer declined.'],
  ['Vertrag beenden?', 'End contract?'], ['Der Vertrag wird sofort gekündigt. Danach kauft bzw. verkauft dein Betrieb wieder über den Großhandel.', 'The contract is cancelled immediately. After that your business buys and sells through wholesale again.'],
  ['Beenden', 'End'], ['Vertrag beendet.', 'Contract ended.'],
  // Einsteiger / Hinweise
  ['Tippe bei einer Zutat auf „Lieferant suchen“.', 'Tap “Find supplier” at an ingredient.'], ['Zeig mir, wo ich Lieferanten finde', 'Show me where to find suppliers'],
  ['Hier führst du deine Firmen: Mitarbeiter einstellen, Betriebe ausbauen und Gewinn abholen. In der „Versorgung“ siehst du, welche Zutaten ein Betrieb braucht – und wo du sie günstiger bekommst.', 'Here you run your companies: hire staff, expand businesses and collect profit. Under “Supplies” you see which ingredients a business needs – and where you can get them cheaper.'],
  // Wirtschaftspolitik
  ['Dein Amt: das kannst du entscheiden', 'Your office: what you can decide'], ['Was Ämter in der Wirtschaft bestimmen', 'What offices decide in the economy'],
  ['Wer ein Amt hält, darf pro Amtszeit einen Beschluss fassen. Das wirkt auf Preise, Steuern und Zuschüsse – für alle Betriebe im Gebiet.', 'Whoever holds an office may make one decision per term. It affects prices, taxes and subsidies – for all businesses in the area.'],
  ['Berät die Stadt – noch keine Macht über die Wirtschaft.', 'Advises the city – no power over the economy yet.'], ['Gewerbesteuer-Zuschlag in der Stadt.', 'Trade tax surcharge in the city.'],
  ['Gewerbesteuer-Zuschlag und Subvention für eine Ware in der Stadt.', 'Trade tax surcharge and a subsidy for one good in the city.'], ['Preisstützung für eine Ware im Bundesland.', 'Price support for one good in the state.'],
  ['Rahmen: Obergrenzen für Zuschläge und Subventionen im ganzen Land.', 'Framework: upper limits for surcharges and subsidies across the country.'], ['Mehrwertsteuer auf Waren, Einfuhrzoll und Branchen-Subvention.', 'Value-added tax on goods, import tariff and sector subsidy.'],
  ['Ortsbeirat', 'Local council'], ['Stadtrat', 'City council'], ['Bürgermeister', 'Mayor'], ['Landtagsabgeordneter', 'State parliament member'], ['Bundestagsabgeordneter', 'Member of the Bundestag'], ['Bundeskanzler', 'Chancellor'],
  ['Gewählte Amtsinhaber bestimmen die Wirtschaftspolitik: Steuern, Zölle, Zuschüsse für eine Ware.', 'Elected office holders set economic policy: taxes, tariffs, subsidies for a good.'],
  ['Pro Amtszeit darf jeder Amtsinhaber einen Beschluss fassen. Er gilt, solange er im Amt ist, und wirkt auf alle Betriebe im Gebiet – auch auf deine eigenen. Die Spieler wählen mit.', 'Each office holder may make one decision per term. It applies while they are in office and affects all businesses in the area – including your own. The players vote.'],
  ['Prüfe die Wirkung vor dem Beschluss: Du siehst genau, was sich ändert.', 'Check the effect before deciding: you see exactly what changes.'], ['Wirtschaftspolitik', 'Economic policy'],
  ['Pro Amtszeit darfst du', 'Per term you may make'], ['einen', 'one'], ['Beschluss fassen. Vorher siehst du genau, was er bewirkt.', 'decision. Beforehand you see exactly what it does.'],
  ['noch', 'for another'], ['Jahre', 'years'], ['Tage', 'days'], ['im Amt', 'in office'], ['Rahmen:', 'Framework:'], ['Standard', 'Default'], ['Normal', 'Normal'],
  ['Du hast in dieser Amtszeit schon entschieden:', 'You have already decided this term:'],
  ['Dieses Amt hat noch keine Macht über die Wirtschaft. Ab dem Stadtrat darfst du Steuern und Zuschüsse bestimmen.', 'This office has no power over the economy yet. From city council upwards you can set taxes and subsidies.'],
  ['Bei dir gilt gerade:', 'Currently in force for you:'], ['Aktuelle Beschlüsse bei dir', 'Current decisions in your area'], ['gilt noch', 'valid for'], ['Std.', 'h'],
  ['Zurzeit hat kein Amtsinhaber einen Beschluss gefasst, der bei dir gilt.', 'No office holder has made a decision that applies to you at the moment.'],
  ['Änderung:', 'Change:'], ['Zoll:', 'Tariff:'], ['Normal: 0', 'Normal: 0'], ['Ware', 'Good'], ['Aufschlag auf den Verkaufspreis', 'Surcharge on the selling price'], ['Zuschuss auf den Einkauf', 'Subsidy on purchases'], ['Rahmen', 'Framework'],
  ['Das passiert', 'What happens'], ['wird für alle Betriebe im Land billiger um', 'becomes cheaper for all businesses in the country by'], ['Wirkung ansehen', 'Preview effect'], ['Beschließen', 'Decide'],
  ['Der Beschluss gilt bis zum Ende deiner Amtszeit und kann in dieser Amtszeit nicht zurückgenommen werden. Er wirkt auch auf deine eigenen Betriebe.', 'The decision applies until the end of your term and cannot be withdrawn this term. It also affects your own businesses.'],
  ['Beschluss gefasst.', 'Decision made.'],
  ['Keine Änderung der Gewerbesteuer.', 'No change to the trade tax.'], ['Keine Änderung der Mehrwertsteuer.', 'No change to the VAT.'], ['Keine Änderung beim Einfuhrzoll.', 'No change to the import tariff.'],
  ['Betriebe in deiner Stadt zahlen mehr Gewerbesteuer: Von je 100 Gewinn gehen', 'Businesses in your city pay more trade tax: out of every 100 profit,'], ['mehr ans Rathaus.', 'more go to city hall.'],
  ['Betriebe in deiner Stadt zahlen weniger Gewerbesteuer: Von je 100 Gewinn bleiben', 'Businesses in your city pay less trade tax: out of every 100 profit,'], ['mehr im Betrieb.', 'more stay in the business.'],
  ['Der Einkauf von', 'The purchase of'], ['wird für alle Betriebe in der Stadt billiger um', 'becomes cheaper for all businesses in the city by'], ['%.', '%.'],
  ['Erzeuger von', 'Producers of'], ['in deinem Bundesland bekommen mehr Erlös:', 'in your state earn more:'],
  ['Gegenfinanzierung: Alle Betriebe im Gebiet zahlen dafür', 'Financing: all businesses in the area pay'], ['Punkte Gewerbesteuer.', 'points of trade tax for it.'],
  ['Alle Betriebe zahlen mehr Mehrwertsteuer auf ihre Wertschöpfung (Umsatz minus Wareneinkauf):', 'All businesses pay more VAT on their value added (revenue minus purchases):'],
  ['Alle Betriebe zahlen weniger Mehrwertsteuer auf ihre Wertschöpfung (Umsatz minus Wareneinkauf):', 'All businesses pay less VAT on their value added (revenue minus purchases):'],
  ['Punkte.', 'points.'], ['Der Zoll trifft nur den importierten Anteil einer Ware. Beispiele:', 'The tariff only affects the imported share of a good. Examples:'], ['(Importanteil', '(import share'], ['%):', '%):'],
  ['Heimische Erzeuger verkaufen dadurch etwas besser.', 'Domestic producers sell somewhat better as a result.'],
  ['Obergrenzen im ganzen Land: Gewerbesteuer-Zuschlag höchstens', 'Limits across the country: trade tax surcharge at most'], ['Punkte, Subventionen höchstens', 'points, subsidies at most'],
  ['Du bist in', 'You were elected in'],
  // Glossar
  ['Warenkreislauf', 'Goods cycle'],
  ['Betriebe stellen Waren her und brauchen dafür Zutaten: Bauernhof → Mühle → Bäckerei → Laden. Fehlende Zutaten kauft der Betrieb im Großhandel oder per Liefervertrag.', 'Businesses make goods and need ingredients for it: farm → mill → bakery → shop. Missing ingredients are bought from wholesale or by supply contract.'],
  ['Der Großhandel liefert jede Zutat immer, aber rund ein Viertel teurer als der Marktpreis. Überschüsse nimmt er zu einem niedrigeren Preis ab. Wer Verträge schließt, spart den Aufschlag.', 'Wholesale always delivers every ingredient, but about a quarter dearer than the market price. It takes surpluses at a lower price. Whoever signs contracts saves the surcharge.'],
  ['Ein Vertrag zwischen zwei Betrieben: Wer liefert wem welche Ware, wie viel pro Tag, zu welchem Preis und wie lange. Der Käufer zahlt täglich automatisch, der Lieferant bekommt das Geld in seine Firmenkasse.', 'A contract between two businesses: who delivers which good to whom, how much per day, at what price and for how long. The buyer pays automatically every day, the supplier receives the money in its company cash.'],
  ['Zeigt, ob dein Betrieb alle nötigen Zutaten bekommt: gut, knapp oder fehlt. Fehlen Zutaten, sinkt die Leistung – aber nie sofort auf null.', 'Shows whether your business gets all necessary ingredients: good, low or missing. If ingredients are missing, performance drops – but never straight to zero.'],
  ['Einfuhrzoll', 'Import tariff'], ['Ein Aufschlag auf Waren aus dem Ausland. Er trifft nur den importierten Anteil einer Ware und schützt heimische Erzeuger. Der Bundeskanzler legt ihn fest.', 'A surcharge on goods from abroad. It only affects the imported share of a good and protects domestic producers. The chancellor sets it.'],
  ['Mehrwertsteuer auf Waren', 'Value-added tax on goods'], ['Eine Steuer auf die Wertschöpfung eines Betriebs: Umsatz minus Wareneinkauf. Der Bundeskanzler kann den Satz ändern.', 'A tax on a business’s value added: revenue minus purchases. The chancellor can change the rate.'],
  ['Subvention (Zuschuss)', 'Subsidy'], ['Ein Zuschuss auf den Einkauf einer Ware. Bürgermeister, Kanzler und andere Amtsinhaber können ihn beschließen. Dafür zahlen alle Betriebe im Gebiet ein wenig mehr Gewerbesteuer.', 'A subsidy on the purchase of a good. Mayors, the chancellor and other office holders can decide it. In return all businesses in the area pay a little more trade tax.'],
  ['Gewerbesteuer', 'Trade tax'], ['Steuer auf den Gewinn eines Betriebs. Stadtrat und Bürgermeister können einen Zuschlag beschließen, der für alle Betriebe der Stadt gilt.', 'Tax on a business’s profit. City council and mayor can decide a surcharge that applies to all businesses in the city.'],
  ['Versorgung', 'Supplies'],
]);
for (const [de, en] of require('./goods-en')) exact[de] = en;

module.exports = { exact, patterns };
