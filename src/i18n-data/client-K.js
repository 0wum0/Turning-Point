'use strict';
/**
 * Englische Texte der Oberfläche: Unternehmen gründen und Lieferverträge je Betrieb.
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz] (Muster werden zuerst ausgewertet).
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

T('{n} Räume', '$1 rooms');
T('{n} bis {n} Zeichen, keine Internetadressen.', '$1 to $2 characters, no web addresses.');
T('{n} laufend', '$1 active');

X([
  ['Unternehmen gründen', 'Found a business'],
  ['Eigenes Unternehmen', 'Your own business'],
  ['Tippe auf „Unternehmen gründen“ und wähle deine Betriebsart.', 'Tap “Found a business” and choose your business type.'],
  ['Eine Firma darfst du nur führen, wenn du den passenden Beruf gelernt hast – ein Bäcker eröffnet eine Bäckerei, ein Maurer eine Baufirma.', 'You may only run a business if you have learned the matching trade – a baker opens a bakery, a mason a construction firm.'],
  ['Dir fehlt gerade so eine Qualifikation.', 'You do not have such a qualification right now.'],
  ['So bekommst du sie:', 'Here is how to get one:'],
  ['Arbeit:', 'Work:'], ['Lehre oder Kurs:', 'Apprenticeship or course:'], ['Partner:', 'Partner:'],
  ['Wer in einem Beruf arbeitet, sammelt Berufsjahre und steigt zum Gesellen und Meister auf.', 'Whoever works in a trade collects years of experience and rises to journeyman and master.'],
  ['Unter „Beruf“ kannst du einen weiteren Beruf lernen, zum Beispiel Bäcker, Wirt, Tischler oder Landwirt.', 'Under “Work” you can learn another trade, for example baker, innkeeper, carpenter or farmer.'],
  ['Lebt dein Partner mit dir zusammen, kannst du Betriebe seines Berufs auf der Einstiegsstufe eröffnen.', 'If your partner lives with you, you can open entry-level businesses of their trade.'],
  ['Du besitzt schon die höchste Anzahl an Unternehmen.', 'You already own the maximum number of businesses.'],
  ['Du besitzt die höchste Anzahl an Unternehmen.', 'You own the maximum number of businesses.'],
  ['Zu Beruf und Kursen', 'To work and courses'],
  ['Stellt', 'Produces'], ['her und verkauft es an die Stadt.', 'and sells it to the town.'],
  ['Bietet Dienstleistungen an und verkauft sie an die Stadt.', 'Offers services and sells them to the town.'],
  ['ab', 'from'], ['Berufsstufe', 'Trade level'], ['Berufsstufe ab', 'Trade level from'],
  ['Anfänger', 'Beginner'], ['Geselle', 'Journeyman'], ['Fachkraft', 'Skilled worker'], ['Meister', 'Master'], ['Altmeister', 'Grand master'],
  ['Höchstzahl an Unternehmen erreicht', 'Maximum number of businesses reached'],
  ['Dir fehlen', 'You are missing'],
  ['Schritt 1 von 2 – Was für ein Betrieb soll es werden?', 'Step 1 of 2 – What kind of business should it be?'],
  ['Ort der Gründung:', 'Where it will be founded:'],
  ['Diese Betriebsarten erlaubt dir deine Qualifikation:', 'Your qualifications allow these business types:'],
  ['Abbrechen', 'Cancel'],
  ['Schritt 2 von 2 – Name und Überblick', 'Step 2 of 2 – Name and overview'],
  ['Größe', 'Size'],
  ['Name deines Unternehmens', 'Name of your business'],
  ['Gründungspreis', 'Founding price'], ['Räume', 'Rooms'], ['Unterhalt pro Tag', 'Upkeep per day'], ['Zutaten', 'Ingredients'], ['Erzeugnis', 'Product'], ['Gewinn pro Tag*', 'Profit per day*'],
  ['keine – der Betrieb stellt alles selbst her', 'none – the business makes everything itself'],
  ['Dienstleistung (wird direkt an Kunden verkauft)', 'Service (sold directly to customers)'],
  ['* Bei voller Besetzung, nach Zutaten, Löhnen, Unterhalt und Steuern. Zu Beginn hast du noch keine Mitarbeiter: Arbeite zuerst selbst im Betrieb und stelle dann nach und nach Leute ein.', '* At full staffing, after ingredients, wages, upkeep and taxes. At the start you have no employees yet: work in the business yourself first, then hire people step by step.'],
  ['Nötige Mitarbeiter:', 'Employees needed:'], ['und ein Manager.', 'and a manager.'],
  ['Zurück', 'Back'], ['Gründen für', 'Found for'],
  ['Du kannst jetzt gründen – ab', 'You can found one now – from'],
  ['Noch etwas sparen: Die günstigste Gründung kostet', 'Save a little more: the cheapest founding costs'],
  ['Du brauchst noch einen passenden Beruf – wir zeigen dir, wie du ihn bekommst.', 'You still need a matching trade – we will show you how to get one.'],
  ['Du musst nicht auf ein Angebot warten: Unter „Unternehmen“ kannst du jederzeit selbst gründen.', 'You do not have to wait for an offer: under “Business” you can found one yourself at any time.'],
  ['Gerade keine passenden Betriebe zum Verkauf. Mit einem erlernten Beruf (z. B. Wirt, Bäcker, Tischler) kannst du selbst gründen.', 'No suitable businesses for sale right now. With a learned trade (e.g. innkeeper, baker, carpenter) you can found one yourself.'],
  ['Du besitzt noch keinen Betrieb. Gründe dein eigenes Unternehmen mit dem Knopf oben – oder schau, ob in der Zeitung unter „Gewerbe“ ein Betrieb zum Verkauf steht.', 'You do not own a business yet. Found your own with the button above – or check whether the newspaper lists one for sale under “Commerce”.'],
  ['Du gründest selbst mit „Unternehmen gründen“ (Betriebsart und Name frei wählbar) oder kaufst einen bestehenden Betrieb aus der Zeitung unter „Gewerbe“. Räume schaltest du mit Geld und Coins frei.', 'You found one yourself with “Found a business” (business type and name are your choice) or buy an existing one from the newspaper under “Commerce”. You unlock rooms with money and coins.'],
  ['Zur Zeitung', 'To the newspaper'],
  // Lieferverträge
  ['Lieferverträge', 'Supply contracts'], ['Meine Lieferverträge', 'My supply contracts'], ['keine', 'none'],
  ['Noch kein Liefervertrag. Ein Vertrag mit einem anderen Spieler ist rund 20 % günstiger als der Großhandel.', 'No supply contract yet. A contract with another player is about 20 % cheaper than wholesale.'],
  ['Der Betrieb steht leer – wiederbeleben, dann sind Verträge wieder möglich.', 'The business is abandoned – revive it and contracts become possible again.'],
  ['Lieferverträge sind im Moment vom Spielbetrieb abgeschaltet. Dein Betrieb kauft und verkauft dann direkt über den Großhandel.', 'Supply contracts are switched off by the game right now. Your business buys and sells directly through wholesale.'],
  ['Lieferant suchen', 'Find a supplier'], ['Abnehmer suchen', 'Find a buyer'], ['Vertrag vorschlagen', 'Propose a contract'],
  ['Dieser Betrieb stellt seine Waren selbst her und braucht keine Zutaten – einen Lieferanten brauchst du nicht.', 'This business makes its goods itself and needs no ingredients – you do not need a supplier.'],
  ['Dieser Betrieb stellt nichts her, was andere Betriebe als Zutat brauchen.', 'This business makes nothing that other businesses need as an ingredient.'],
  ['Wähle, worüber du mit einem anderen Spieler einen Liefervertrag schließen möchtest:', 'Choose what you want to make a supply contract about with another player:'],
  ['Dieser Betrieb erbringt eine Dienstleistung:', 'This business provides a service:'],
  ['. Dienstleistungen verkauft er direkt an Kunden – dafür gibt es keine Verträge, nur für Zutaten, die er einkauft.', '. It sells services directly to customers – there are no contracts for those, only for ingredients it buys.'],
  ['Zutat einkaufen', 'Buy an ingredient'], ['Erzeugnis verkaufen', 'Sell a product'], ['Lieferant für', 'Supplier for'], ['Abnehmer für', 'Buyer for'],
  ['läuft', 'running'], ['Angebot', 'Offer'], ['Betrieb:', 'Business:'],
  ['Die Verträge konnten gerade nicht geladen werden.', 'The contracts could not be loaded right now.'],
  ['Lieferverträge sind im Moment vom Spielbetrieb abgeschaltet.', 'Supply contracts are switched off by the game right now.'],
  ['Was ist ein Liefervertrag?', 'What is a supply contract?'],
  ['Zwei Spieler-Betriebe vereinbaren, dass einer dem anderen täglich eine Ware zu einem festen Preis liefert.', 'Two player businesses agree that one delivers a good to the other every day at a fixed price.'],
  ['Das spart dem Käufer etwa 20 % gegenüber dem Großhandel, und der Lieferant verdient mehr als beim Verkauf an die Stadt. Starte bei einem Betrieb mit „Lieferant suchen“ oder „Abnehmer suchen“.', 'That saves the buyer about 20 % compared with wholesale, and the supplier earns more than when selling to the town. Start at a business with “Find a supplier” or “Find a buyer”.'],
  ['Bei jedem Betrieb findest du den Abschnitt „Lieferverträge“ mit „Lieferant suchen“ und „Abnehmer suchen“.', 'Every business has a “Supply contracts” section with “Find a supplier” and “Find a buyer”.'],
  ['Angebote an dich', 'Offers to you'], ['Laufende Verträge', 'Running contracts'], ['Deine offenen Angebote', 'Your open offers'],
  ['Annehmen', 'Accept'], ['Ablehnen', 'Decline'], ['Zurückziehen', 'Withdraw'],
]);
for (const w of ['Zutat einkaufen', 'Erzeugnis verkaufen']) exact[w.toUpperCase()] = exact[w];

module.exports = { exact, patterns };
