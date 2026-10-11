'use strict';
/**
 * Englische Texte (Spielserver): Handelsrouten und Transport – Meldungen, Ansehen, Beschlüsse der Ämter, Hinweise.
 * Paare [deutsch, englisch]; ${…} sind Platzhalter (Namen und Zahlen).
 */
const pairs = [
  // ---- Ansehen
  ['Handelsroute zuverlässig bedient', 'Trade route served reliably'],
  ['Deine Fracht kam an und wurde fair verkauft. Zuverlässiger Handel über Städte hinweg spricht sich herum.', 'Your freight arrived and was sold fairly. Reliable trade between cities gets around.'],
  ['Frachtvertrag erfüllt', 'Freight contract fulfilled'],
  ['Eine Spedition hat Fracht für einen Mitspieler zuverlässig befördert.', 'A haulier carried freight for another player reliably.'],
  ['Beim Schmuggel erwischt', 'Caught smuggling'],
  ['Der Zoll hat dich beim Umgehen von Zoll oder Maut erwischt. Das ist ein Skandal.', 'Customs caught you evading duty or tolls. That is a scandal.'],
  // ---- Einsteiger-Aufgabe und Hinweise
  ['Richte deine erste Handelsroute ein', 'Set up your first trade route'],
  ['Waren sind nicht überall gleich teuer. Eine Handelsroute kauft sie dort, wo sie billig sind, und verkauft sie dort, wo sie mehr bringen – automatisch. „Beste Route finden“ rechnet dir vorher alles vor.', 'Goods do not cost the same everywhere. A trade route buys them where they are cheap and sells them where they fetch more – automatically. “Find the best route” works it all out for you beforehand.'],
];
module.exports = pairs;
