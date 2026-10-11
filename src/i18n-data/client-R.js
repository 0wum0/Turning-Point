'use strict';
/**
 * Englische Texte der Oberfläche: Gesellschaft (Vereine, Gemeinde, Stiftung, Titel und Ränge; Glossar, Aufgaben, Hinweise).
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz] (Muster werden zuerst ausgewertet). In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);
void T;
X([
  // Aufgaben und Hinweise
  ['Tritt einem Verein bei', 'Join a club'],
  ['Ein Verein verbindet: Sport hält fit, Kultur hebt die Stimmung, Handwerker stärken ihren Umsatz – und Ehrenamt zählt fürs Ansehen. Die Beiträge füllen die Vereinskasse, aus der Feste bezahlt werden.', 'A club brings people together: sport keeps you fit, culture lifts the mood, tradesmen boost their sales – and volunteering counts towards your standing. The dues fill the club treasury, which pays for celebrations.'],
  ['Tu etwas für das Gemeinwohl', 'Do something for the common good'],
  ['Eine Gemeinde, eine Spende, eine Stiftung oder ein Titel: Wer der Stadt etwas zurückgibt, steigert sein Ansehen – und Titel bringen spürbare Vorteile bei Wahlen und im Geschäft.', 'A congregation, a donation, a foundation or a title: whoever gives something back to the town gains standing – and titles bring noticeable advantages in elections and in business.'],
]);
module.exports = { exact, patterns };
