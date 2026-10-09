'use strict';
/**
 * Englische Texte der Oberfläche: Ruf und Ansehen (Karte, Detailfenster, Plaketten, Ehrenbürgerwürde, Sperrhinweise, Glossar).
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz] (Muster werden zuerst ausgewertet). In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

// ---- Muster
T('{} zum Ehrenbürger ernennen?', 'Make $1 an honorary citizen?');
T('ab {} Punkten', 'from $1 points');
T('Als Bürgermeister darfst du in deiner Amtszeit einem Bürger der Stadt die Würde verleihen: {n} Punkte Gemeinwohl und {n} Punkte örtliches Ansehen für ihn, ein wenig Amtsansehen für dich. Vorher siehst du eine Vorschau.', 'As mayor you may award the honour to one citizen of the city during your term: $1 points of public good and $2 points of local standing for them, and a little standing in office for you. You see a preview first.');

X([
  // Stufen
  ['Verrufen', 'Disreputable'], ['Zweifelhaft', 'Dubious'], ['Unbekannt', 'Unknown'], ['Anständig', 'Decent'], ['Angesehen', 'Respected'], ['Honoratior', 'Notable'], ['Ehrenbürger', 'Honorary citizen'],
  // Karte und Fenster
  ['Ansehen & Ruf', 'Standing & reputation'], ['Alle Details', 'All details'], ['Vor Ort:', 'Locally:'], ['Vor Ort', 'Locally'], ['Landesweit', 'Nationwide'],
  ['Noch', 'Another'], ['Punkte bis', 'points to'], ['Punktestand', 'Score'], ['Höchste Stufe erreicht', 'Highest level reached'], ['Punkte', 'points'],
  ['Das hat sich zuletzt am meisten geändert:', 'These changed the most recently:'], ['Warum?', 'Why?'],
  ['Noch keine Veränderungen. Zahle Miete und Steuern pünktlich, handle fair und hilf anderen – so wächst dein Ansehen.', 'No changes yet. Pay rent and taxes on time, trade fairly and help others – that is how your standing grows.'],
  ['Warum hat sich mein Ruf geändert?', 'Why has my reputation changed?'],
  ['Zahle Rechnungen pünktlich und halte dich an Verträge – dann erholt sich dein Ansehen mit der Zeit.', 'Pay bills on time and keep your contracts – then your standing recovers over time.'],
  ['Rechnungen pünktlich zahlen und Verträge einhalten.', 'Pay bills on time and keep contracts.'], ['Fair handeln, Angebote beantworten und zuverlässig liefern.', 'Trade fairly, answer offers and deliver reliably.'],
  ['Mitspielern helfen, Menschen beschäftigen und Steuern zahlen.', 'Help other players, give people jobs and pay taxes.'], ['Wahlen gewinnen und Ämter ordentlich ausfüllen.', 'Win elections and fill offices well.'],
  ['Skandale vermeiden – sie flauen nur langsam ab.', 'Avoid scandals – they fade only slowly.'],
  ['Dein Ansehen', 'Your standing'],
  ['Wie die Leute über dich und deine Familie denken. Es wächst durch ordentliches Verhalten und sinkt durch Ärger.', 'How people think of you and your family. It grows with proper behaviour and falls with trouble.'],
  ['Erben übernehmen etwa die Hälfte davon:', 'Heirs take over about half of it:'], ['Familienruf', 'Family reputation'],
  ['Vor Ort bist du bekannter: Wer in einer Stadt wohnt und handelt, genießt dort mehr Ansehen als anderswo.', 'You are better known locally: anyone who lives and trades in a city enjoys more standing there than elsewhere.'],
  ['Fünf Bestandteile', 'Five components'], ['Was dein Ansehen bewirkt', 'What your standing does'], ['Was dafür nötig ist', 'What is required'], ['So steigerst du dein Ansehen', 'How to raise your standing'], ['Letzte Veränderungen', 'Recent changes'],
  ['Noch nichts verzeichnet.', 'Nothing recorded yet.'],
  ['Kreditzins', 'Loan interest'], ['Kreditrahmen', 'Credit limit'], ['Preisrahmen bei Lieferverträgen', 'Price range for supply contracts'], ['Mieter-Nachfrage (örtlich)', 'Tenant demand (local)'], ['Mietausfälle (örtlich)', 'Rent defaults (local)'],
  ['unverändert', 'unchanged'], ['Prozentpunkte', 'percentage points'], ['weiter um', 'wider by'], ['enger um', 'narrower by'],
  ['Amt:', 'Office:'], ['kein Mindestansehen', 'no minimum standing'], ['Mindestansehen für dieses Amt:', 'Minimum standing for this office:'],
  // Ehrenbürgerwürde
  ['In dieser Amtszeit hast du die Würde schon verliehen.', 'You have already awarded the honour in this term of office.'], ['Zurzeit nicht möglich.', 'Not possible right now.'],
  ['Ehrenbürgerwürde', 'Honorary citizenship'], ['Vorschau', 'Preview'], ['Würde verleihen', 'Award the honour'],
  ['Zurzeit gibt es in deiner Stadt niemanden mit genug Ansehen. Nötig:', 'There is currently nobody in your city with enough standing. Required:'],
  // andere Stellen
  ['Mein Ansehen', 'My standing'], ['Dein Ansehen', 'Your standing'], ['wirkt auf die Bank:', 'affects the bank:'], ['Prozentpunkte Zins', 'percentage points of interest'], ['weitet den erlaubten Preisrahmen', 'widens the allowed price range'], ['verengt den erlaubten Preisrahmen', 'narrows the allowed price range'],
  ['Ansehen (Ruf)', 'Standing (reputation)'], ['Zuverlässigkeit', 'Reliability'], ['Gemeinwohl', 'Public good'], ['Skandal', 'Scandal'],
  // Glossar
  ['Wie die Leute über dich und deine Familie denken. Es besteht aus Zuverlässigkeit, Handel, Gemeinwohl, Amt und Skandal. Gutes Ansehen macht Kredite günstiger, öffnet Ämter und erleichtert Geschäfte.', 'How people think of you and your family. It consists of reliability, trade, public good, office and scandal. Good standing makes loans cheaper, opens offices and makes deals easier.'],
  ['Der Ruf gehört der Familie: Ein Erbe übernimmt etwa die Hälfte des Ansehens seiner Eltern. Nach einer Pleite und einem Neuanfang bleibt noch ein Viertel.', 'Reputation belongs to the family: an heir takes over about half of their parents’ standing. After a bankruptcy and a fresh start, a quarter remains.'],
  ['Zählt, wenn du Miete und Kreditraten pünktlich zahlst, Verträge einhältst und Zuschläge bei Versteigerungen bezahlst.', 'Counts when you pay rent and loan installments on time, keep contracts and pay for winning auction bids.'],
  ['Zählt, wenn du anderen hilfst: Geschenke, Arbeitsplätze, gezahlte Steuern.', 'Counts when you help others: gifts, jobs, taxes paid.'],
  ['Erwischte Sabotage, Pleiten, Strafen und Rauswürfe. Ein Skandal zieht dein Ansehen herunter und flaut nur langsam ab.', 'Caught sabotage, bankruptcies, fines and evictions. A scandal pulls your standing down and fades only slowly.'],
  ['Eine hohe Stufe des Ansehens, knapp unter Ehrenbürger. Wer so geachtet wird, darf für die höchsten Ämter kandidieren.', 'A high level of standing, just below honorary citizen. Anyone held in such esteem may run for the highest offices.'],
  ['Die höchste Stufe des Ansehens. Ein Bürgermeister kann in seiner Amtszeit einem Bürger die Ehrenbürgerwürde verleihen; das hebt das Ansehen vor Ort.', 'The highest level of standing. A mayor can award honorary citizenship to one citizen during their term; this raises standing locally.'],
]);

module.exports = { exact, patterns };
