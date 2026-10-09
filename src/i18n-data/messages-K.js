'use strict';
/** Englische Texte (Spielserver): Unternehmen gründen (Aktion foundBiz), Einsteiger-Aufgabe und Berater. Paare [deutsch, englisch]; ${…} sind Platzhalter. */
module.exports = [
  ['Gründe dein erstes Unternehmen', 'Found your first business'],
  ['Eine eigene Firma verdient auch dann Geld, wenn du gerade nicht arbeitest – der Weg zum Vermächtnis. Unter „Unternehmen“ gründest du sie mit einem Klick.', 'A business of your own earns money even when you are not working – the path to a legacy. Under “Business” you found one with a click.'],
  ['Du hast die Qualifikation und genug Geld (ab ${dm(v.found.cheapest, cur)}). Eine eigene Firma verdient auch, wenn du nicht arbeitest.', 'You have the qualification and enough money (from ${dm(v.found.cheapest, cur)}). A business of your own earns money even when you are not working.'],
  ['Unternehmen gründen', 'Found a business'],
  ['Bitte wähle eine Betriebsart.', 'Please choose a business type.'],
  ['Diese Betriebsart kannst du nicht gründen.', 'You cannot found this type of business.'],
  ['Du musst in einer Stadt wohnen.', 'You must live in a town.'],
  ['Der Name ist zu kurz (mindestens ${NAME_MIN} Zeichen).', 'The name is too short (at least ${NAME_MIN} characters).'],
  ['Der Name braucht mindestens ein richtiges Wort.', 'The name needs at least one real word.'],
  ['Der Name darf keine Internetadresse enthalten.', 'The name must not contain a web address.'],
  ['Eine deiner Firmen heißt schon so. Wähle einen anderen Namen.', 'One of your businesses already has that name. Choose another name.'],
  ['${state.person.first} gründet ${r.name} (${r.city.name}).', '${state.person.first} founds ${r.name} (${r.city.name}).'],
  ['${r.name} ist gegründet. Arbeite selbst im Betrieb oder stelle Mitarbeiter ein.', '${r.name} is founded. Work in the business yourself or hire employees.'],
];
