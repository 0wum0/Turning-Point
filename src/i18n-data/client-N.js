'use strict';
/**
 * Englische Texte der Oberfläche: Gerichte und Beweise (Recht & Gericht, Spuren, Verfahren, Dialoge, Glossar).
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz] (Muster werden zuerst ausgewertet). In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);
// ---- Muster (Zahlen und Namen im Text)
T('Anzeigen: {n} von {n} diese Woche · Gebühr {} · mindestens Beweislage {n}.', 'Complaints: $1 of $2 this week · fee $3 · minimum evidence $4.');
T('Beweislage: {} ({n})', 'Evidence: $1 ($2)');
T('Dokumentierter Schaden: {}', 'Documented damage: $1');
T('Verdacht: {} (Sicherheit ca. {n} %) – prüfe das gut, Hinweise können irren.', 'Suspect: $1 (certainty approx. $2 %) – check this carefully, hints can be wrong.');
T('Detektiv arbeitet, Ergebnis {}.', 'Detective at work, result $1.');
T('Detektiv ({})', 'Detective ($1)');
T('Zeugen befragen ({})', 'Interview witnesses ($1)');
T('Schaden dokumentieren ({})', 'Document damage ($1)');
T('Du klagst gegen', 'You are suing');
T('{} · Schaden {}', '$1 · damage $2');
T('{} - nächster Schritt {} ({})', '$1 – next step $2 ($3)');
T('{} – nächster Schritt {} ({})', '$1 – next step $2 ($3)');
T('Beweislage: {} · {} Detektiv(e)', 'Evidence: $1 · $2 detective(s)');
T('Dein Vergleichsvorschlag: {}', 'Your settlement proposal: $1');
T('Verlauf ({n})', 'History ($1)');
T('Meine Verfahren', 'My proceedings');
T('Abgeschlossene Verfahren ({n})', 'Concluded proceedings ($1)');
T('Schuldig (Stufe {n})', 'Guilty (level $1)');
T('Berufung möglich bis {}.', 'Appeal possible until $1.');
T('{} bis {} ({})', '$1 until $2 ($3)');
T('Amtsgericht {}', 'District court $1');
T('Amtsgericht {} · Beweise · Anzeige · Vergleich · Gericht. Polizei vor Ort: {}.', 'District court $1 · evidence · complaint · settlement · court. Police on site: $2.');
T('Offene gerichtliche Zahlungen: {} – sie werden bei Gelegenheit abgebucht.', 'Open court payments: $1 – they are debited when possible.');
T('noch {} Tage verwertbar', 'still usable for $1 days');
T('noch {n} Std. verwertbar', 'still usable for $1 h');
T('verblasst, noch {} verwertbar', 'fading, still usable for $1');
T('Schadenersatz an {}: noch {}, wird bis {} abgebucht.', 'Damages to $1: $2 left, debited by $3.');
T('{} bis {} ({}).', '$1 until $2 ($3).');
T('in {n} Std.', 'in $1 h'); T('in {n} Min.', 'in $1 min'); T('in {n} Tagen', 'in $1 days');
T('{} anzeigen?', 'Report $1?');
T('Fall: {}. Beweislage: {}. Gebühr: {} (nicht erstattbar).', 'Case: $1. Evidence: $2. Fee: $3 (not refundable).');
T('Fall: {} bei {}. Beweislage: {}. Gebühr: {} (nicht erstattbar).', 'Case: $1 at $2. Evidence: $3. Fee: $4 (not refundable).');
T('Verdächtigen anzeigen: {} ({n} %)', 'Report suspect: $1 ($2 %)');
T('{} - {}', '$1 – $2');
T('In dieser Amtszeit beschlossen: {}', 'Decided in this term: $1');
T('Aktuelle Beschlüsse: {}', 'Current decisions: $1');
T('Der Betrag in {}', 'The amount in $1');

X([
  ['Recht & Gericht', 'Law & Court'], ['Recht &amp; Gericht', 'Law & Court'],
  ['Öffnen', 'Open'], ['Meine Verfahren', 'My proceedings'], ['Spuren', 'Traces'],
  ['Keine laufenden Verfahren.', 'No proceedings running.'],
  ['Keine Spuren. Wenn dir jemand schadet, erscheint hier ein Hinweis „Spuren gesichert“.', 'No traces. If someone harms you, a notice “Traces secured” appears here.'],
  ['Zu schwach für eine Anzeige', 'Too weak for a complaint'], ['Anzeige erstatten', 'File a complaint'],
  ['Täter bekannt', 'Culprit known'], ['Täter unbekannt', 'Culprit unknown'],
  ['Dein Rechtsanwalt', 'Your lawyer'], ['Gegenseite mit Anwalt', 'Other side has a lawyer'], ['Geständnis', 'Confession'],
  ['Rechtsanwalt', 'Lawyer'], ['Detektiv', 'Detective'], ['Gestehen', 'Confess'], ['Vergleich anbieten', 'Offer settlement'], ['Vergleich annehmen', 'Accept settlement'], ['Ablehnen', 'Decline'],
  ['Anzeige zurückziehen', 'Withdraw complaint'], ['Berufung', 'Appeal'], ['Richter bestechen', 'Bribe the judge'],
  ['Freispruch', 'Acquittal'], ['Abbrechen', 'Cancel'], ['Beschließen', 'Decide'], ['Wirkung ansehen', 'View effect'], ['Vorschlag senden', 'Send proposal'],
  ['Verdächtigen anzeigen:', 'Report suspect:'], ['Oder Spieler suchen (Name)', 'Or search for a player (name)'], ['Niemand gefunden.', 'No one found.'],
  ['Anzeige erstatten', 'File a complaint'], ['Vergleich anbieten', 'Offer a settlement'],
  ['Zeige nur jemanden an, bei dem du dir sicher bist. Eine haltlose Anzeige kostet dich eine Geldbuße', 'Only report someone you are sure about. A baseless complaint costs you a fine'],
  ['Wer bestimmt die Regeln?', 'Who sets the rules?'],
  ['Dein Amt: Recht und Ordnung', 'Your office: law and order'],
  ['Dieses Amt hat keine Macht über Gerichte.', 'This office has no power over courts.'],
  ['Du bist in einer anderen Stadt gewählt worden.', 'You were elected in another city.'],
  ['Das passiert', 'This is what happens'],
  ['Der Beschluss gilt bis zum Ende deiner Amtszeit und kann nicht zurückgenommen werden.', 'The decision applies until the end of your term and cannot be withdrawn.'],
  ['Du wurdest angezeigt. Rechtsanwalt, Vergleich oder Geständnis –', 'You have been reported. Lawyer, settlement or confession –'], ['jetzt entscheiden', 'decide now'],
  ['Der Verlauf', 'History'],
  ['Wirtschaftliche Handlungen sind gesperrt; Essen, Schlafen, Briefe, Chat und Politik gehen weiter, und deine Spielzeit läuft geschützt.', 'Economic actions are blocked; eating, sleeping, letters, chat and politics continue, and your game clock runs protected.'],
  ['Du darfst keine Betriebe gründen, kaufen oder ausbauen.', 'You may not found, buy or expand businesses.'],
  ['Diese Betriebsart darfst du nicht führen.', 'You may not run this type of business.'], ['Der Betrieb steht still.', 'The business is at a standstill.'],
  ['Haft', 'Custody'], ['Gewerbeverbot', 'Trade ban'], ['Berufsverbot', 'Occupation ban'], ['Betriebsschließung', 'Business closure'], ['Verwarnung', 'Warning'], ['Schadenersatz', 'Damages'], ['Geldstrafe', 'Fine'], ['Ehrverlust', 'Loss of honour'],
  ['Beweislage: stark', 'Evidence: strong'], ['stark', 'strong'], ['mittel', 'medium'], ['schwach', 'weak'],
  ['Eröffnet', 'Open'],
]);

// ---- Glossar
X([
  ['Beweis (Spuren)', 'Evidence (traces)'], ['Anzeige (Klage)', 'Complaint (lawsuit)'], ['Beweis', 'Evidence'], ['Anzeige', 'Complaint'], ['Vergleich', 'Settlement'], ['Gericht', 'Court'], ['Haft', 'Custody'],
  ['Jede feindliche Tat hinterlässt Spuren. Die Stärke der Spuren (0 bis 100) bestimmt, ob eine Anzeige Erfolg hat. Spuren verblassen innerhalb weniger Wochen echter Zeit; Detektiv, Zeugen und Schadensdokumentation stärken sie.', 'Every hostile act leaves traces. The strength of the traces (0 to 100) decides whether a complaint succeeds. Traces fade within a few weeks of real time; a detective, witnesses and damage documentation strengthen them.'],
  ['Mit einer Anzeige bringst du eine bestimmte Person vor das Gericht. Sie kostet eine Gebühr, ist pro Woche begrenzt und braucht eine Mindest-Beweislage. Haltlose Anzeigen kosten dich Geld und Ansehen.', 'With a complaint you bring a specific person before the court. It costs a fee, is limited per week and needs a minimum of evidence. Baseless complaints cost you money and standing.'],
  ['Beide Seiten einigen sich auf eine Zahlung des Beklagten. Das Verfahren endet ohne Urteil, beide sparen die Gerichtskosten.', 'Both sides agree on a payment by the defendant. The proceedings end without a verdict; both save the court costs.'],
  ['Das Amtsgericht deiner Stadt entscheidet nach Beweislage, Verteidigung und Ansehen. Politiker bestimmen den Rahmen: Polizeibudget, Strafrahmen, Strenge der Gesetze, Verjährung, Amnestie.', 'The district court of your city decides by evidence, defence and standing. Politicians set the framework: police budget, penalty range, strictness of laws, limitation period, amnesty.'],
  ['Eine Strafe für schwere Taten: Für einige Stunden echter Zeit sind wirtschaftliche Handlungen gesperrt. Essen, Schlafen, Briefe, Chat und Politik gehen weiter, und die Spielzeit läuft geschützt weiter.', 'A penalty for serious acts: for a few hours of real time economic actions are blocked. Eating, sleeping, letters, chat and politics continue, and the game clock keeps running protected.'],
]);

module.exports = { exact, patterns };
