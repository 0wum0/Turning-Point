'use strict';
/**
 * Englische Texte (Spielserver): Gesellschaft – Vereine, Gemeinden, Stiftungen, Titel und Ränge: Meldungen, Fehler, Ansehen, Briefe, Tagesblatt.
 * Paare [deutsch, englisch]; ${…} sind Platzhalter (Namen und Zahlen).
 */
const pairs = [
  // ---- Ansehen (Ereignisse)
  ['Im Verein aktiv', 'Active in a club'],
  ['Du bist Mitglied in einem Verein und zahlst deinen Beitrag. Ehrenamt zählt fürs Gemeinwohl.', 'You are a member of a club and pay your dues. Volunteering counts towards the common good.'],
  ['Vereinsfest ausgerichtet', 'Club celebration held'],
  ['Dein Verein hat ein Fest für alle Mitglieder gegeben. Das macht dich im Ort bekannt und beliebt.', 'Your club gave a celebration for all its members. That makes you known and liked in town.'],
  ['Gespendet', 'Donated'],
  ['Du hast an einen Verein oder eine Gemeinde gespendet. Wer gibt, stärkt das Gemeinwohl.', 'You donated to a club or a congregation. Whoever gives strengthens the common good.'],
  ['Vermögen in eine Stiftung eingebracht', 'Assets placed in a foundation'],
  ['Du hast dauerhaft Vermögen für das Gemeinwohl gebunden. Das spricht sich herum.', 'You have tied up assets for the common good for good. That gets around.'],
  ['Stiftung hilft', 'Foundation helps'],
  ['Deine Stiftung hat Geld für das Gemeinwohl ausgeschüttet.', 'Your foundation paid out money for the common good.'],
  ['Feier in der Gemeinde', 'Celebration in the congregation'],
  ['Du hast eine Feier in deiner Gemeinde ausgerichtet. Familie und Glaube verbinden die Menschen.', 'You held a celebration in your congregation. Family and faith bring people together.'],
  ['Titel verliehen', 'Title awarded'],
  ['Für dein Wirken wurde dir ein Titel verliehen. Das hebt dein Ansehen.', 'You were awarded a title for your work. That raises your standing.'],
  ['Titel aberkannt', 'Title revoked'],
  ['Dir wurde ein Titel aberkannt, weil du die Voraussetzungen nicht mehr erfüllst.', 'A title was revoked because you no longer meet the requirements.'],
  ['Vereinskasse veruntreut', 'Club treasury embezzled'],
  ['Du hast Geld aus der Vereinskasse in die eigene Tasche genommen. Alle Mitglieder können es im Kassenbuch lesen.', 'You took money from the club treasury for yourself. All members can read it in the cash book.'],
  ['Als Vereinsvorsitzender abgewählt', 'Voted out as club chairman'],
  ['Die Mitglieder haben dir das Vertrauen entzogen und dich als Vorsitzenden abgewählt.', 'The members withdrew their trust and voted you out as chairman.'],
  // ---- Einsteiger-Aufgaben und Hinweise
  ['Tritt einem Verein bei', 'Join a club'],
  ['Ein Verein verbindet: Sport hält fit, Kultur hebt die Stimmung, Handwerker stärken ihren Umsatz – und Ehrenamt zählt fürs Ansehen. Die Beiträge füllen die Vereinskasse, aus der Feste bezahlt werden.', 'A club brings people together: sport keeps you fit, culture lifts the mood, tradesmen boost their sales – and volunteering counts towards your standing. The dues fill the club treasury, which pays for celebrations.'],
  ['Tu etwas für das Gemeinwohl', 'Do something for the common good'],
  ['Eine Gemeinde, eine Spende, eine Stiftung oder ein Titel: Wer der Stadt etwas zurückgibt, steigert sein Ansehen – und Titel bringen spürbare Vorteile bei Wahlen und im Geschäft.', 'A congregation, a donation, a foundation or a title: whoever gives something back to the town gains standing – and titles bring noticeable advantages in elections and in business.'],
  ['Ein Vereinsbeitrag ist offen', 'A club fee is due'],
  ['Wer den Beitrag nicht zahlt, scheidet nach einigen Tagen aus dem Verein aus. Der Beitrag wird abgebucht, sobald das Geld reicht.', 'Whoever does not pay the fee leaves the club after a few days. The fee is debited as soon as you have enough money.'],
  ['Zu den Vereinen', 'To the clubs'],
  ['Eine Trauerfeier steht aus', 'A funeral service is pending'],
  ['Die Gemeinde kann für einen Verstorbenen der Familie eine Trauerfeier ausrichten. Das tröstet Kinder und Partner und bringt ein wenig Ansehen.', 'The congregation can hold a funeral service for a deceased family member. It comforts children and partner and brings a little standing.'],
  ['Zur Gemeinde', 'To the congregation'],
];
module.exports = pairs;
