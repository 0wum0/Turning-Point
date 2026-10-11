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

X([
  // ---- Aufgaben und Hinweise
  ['Tritt einem Verein bei', 'Join a club'],
  ['Ein Verein verbindet: Sport hält fit, Kultur hebt die Stimmung, Handwerker stärken ihren Umsatz – und Ehrenamt zählt fürs Ansehen. Die Beiträge füllen die Vereinskasse, aus der Feste bezahlt werden.', 'A club brings people together: sport keeps you fit, culture lifts the mood, tradesmen boost their sales – and volunteering counts towards your standing. The dues fill the club treasury, which pays for celebrations.'],
  ['Tu etwas für das Gemeinwohl', 'Do something for the common good'],
  ['Eine Gemeinde, eine Spende, eine Stiftung oder ein Titel: Wer der Stadt etwas zurückgibt, steigert sein Ansehen – und Titel bringen spürbare Vorteile bei Wahlen und im Geschäft.', 'A congregation, a donation, a foundation or a title: whoever gives something back to the town gains standing – and titles bring noticeable advantages in elections and in business.'],
  ['Hier findest du Vereine, die Gemeinde, Stiftung und Titel. Tritt einem Verein bei oder spende der Gemeinde.', 'Here you find clubs, the congregation, foundations and titles. Join a club or donate to the congregation.'],
  ['Hier kandidierst du für Ämter und sammelst Einfluss. Außerdem gehörst du hier zu Vereinen und zur Gemeinde, gründest Stiftungen und siehst deine Titel. Lotto und Spielbank sind nur ein Zeitvertreib.', 'Here you run for office and gather influence. You also belong to clubs and the congregation here, found foundations and see your titles. Lottery and casino are only a pastime.'],
  ['Zeig mir die Vereine', 'Show me the clubs'],
  ['Ämter, Einfluss, Vereine, Gemeinde – und ein bisschen Glück.', 'Offices, influence, clubs, congregation – and a bit of luck.'],
  // ---- Glossar (Begriffe und Texte)
  ['Verein', 'Club'], ['Vereine', 'Clubs'], ['Vereinskasse', 'Club treasury'], ['Vorstand', 'Board'], ['Vorstand und Vorsitz', 'Board and chair'], ['Veruntreuung', 'Embezzlement'], ['Veruntreuung der Kasse', 'Embezzlement of the treasury'],
  ['Wahlempfehlung', 'Election recommendation'], ['Glaubensgemeinde', 'Congregation'], ['Gemeindekasse', 'Congregation treasury'], ['Gemeinde (Glaubensgemeinschaft)', 'Congregation (faith community)'], ['Gemeinde-Ansehen', 'Congregation standing'],
  ['Notgabe', 'Emergency aid'], ['Notgaben', 'Emergency aid payments'], ['Stiftung', 'Foundation'], ['Zustiftung', 'Endowment'], ['Zustiftung und Vermächtnis', 'Endowment and legacy'],
  ['Gemeinwohl-Topf', 'Common-good pot'], ['Gemeinwohl-Topf der Stadt', 'The town’s common-good pot'], ['Titel', 'Title'], ['Titel und Ränge', 'Titles and ranks'], ['Kommerzienrat', 'Councillor of commerce'], ['Stifter', 'Founder'], ['Stifter und Mäzen', 'Founder and patron'],
  ['Eine Gruppe von Bürgern deiner Stadt: Sport-, Kultur-, Handwerker- oder Wohltätigkeitsverein. Mitglieder zahlen einen Jahresbeitrag; ab drei Mitgliedern wirkt der Verein auf alle, die dazugehören – ein bisschen mehr Gesundheit, Stimmung oder Umsatz.', 'A group of citizens of your town: sports, cultural, tradesmen’s or charity association. Members pay an annual fee; from three members the club takes effect on everyone who belongs – a little more health, mood or sales.'],
  ['Alle Beiträge und Spenden landen in der Kasse. Der Vorstand zahlt daraus Feste. Jede Buchung steht im Kassenbuch, das alle Mitglieder lesen können.', 'All fees and donations end up in the treasury. The board pays for celebrations from it. Every entry is in the cash book, which all members can read.'],
  ['Der Vorsitz führt den Verein, bis zu zwei weitere Mitglieder gehören zum Vorstand. Nur der Vorstand richtet Feste aus, empfiehlt Kandidaten und verfügt über die Kasse. Wer das Vertrauen verliert, kann abgewählt werden.', 'The chair leads the club; up to two further members belong to the board. Only the board holds celebrations, recommends candidates and controls the treasury. Whoever loses the members’ trust can be voted out.'],
  ['Wer als Vorstand Geld privat aus der Vereinskasse nimmt, begeht Veruntreuung. Das steht im Kassenbuch, ein Mitglied kann Anzeige erstatten, und bei einem Urteil fließt das Geld zurück in die Kasse. Dazu kommen Strafen und ein Skandal.', 'A board member who takes money from the club treasury for themselves commits embezzlement. It is in the cash book, a member can press charges, and after a verdict the money flows back into the treasury. Penalties and a scandal follow.'],
  ['Ein Verein darf vor einer Wahl einen Kandidaten empfehlen. Das gibt ein wenig Stimmengewicht – höchstens vier Prozent aus allen Vereinen. Eine klare Mehrheit der Bürger entscheidet trotzdem allein.', 'Before an election a club may recommend a candidate. That gives a little vote weight – at most four percent from all clubs. A clear majority of the citizens still decides alone.'],
  ['Die Glaubensgemeinschaft deiner Stadt, zum Beispiel evangelisch, katholisch, jüdisch, muslimisch oder frei. Wer beitritt, kann spenden, in Not eine Notgabe erbitten und Hochzeit, Taufe oder Trauerfeier feiern. Der Beitritt ist freiwillig.', 'The faith community of your town, for example Protestant, Catholic, Jewish, Muslim or free. Whoever joins can donate, ask for emergency aid in need and celebrate a wedding, baptism or funeral. Joining is voluntary.'],
  ['Dein Standing in der Gemeinde. Es wächst mit Spenden (je größer die Spende, desto langsamer) und verfällt langsam, wenn du nicht mehr gibst. Erben übernehmen die Hälfte.', 'Your standing in the congregation. It grows with donations (the bigger the donation, the slower) and slowly lapses if you stop giving. Heirs take over half of it.'],
  ['Hilfe der Gemeinde in der Not: ein Teil der Gemeindekasse. Es gibt sie nur mit etwas Gemeinde-Ansehen, nach einer Wartezeit und wenn dein Geld wirklich nicht reicht.', 'Help from the congregation in need: a part of the congregation’s treasury. It is only available with some standing in the congregation, after a waiting period, and when your money really is not enough.'],
  ['Vermögen, das auf Dauer gebunden ist. Es bleibt erhalten und wirft einen kleinen Ertrag ab; jedes Jahr wird ein Teil für das Gemeinwohl deiner Stadt ausgeschüttet – oder bei einer Familienstiftung an deine Nachkommen. Die Stiftung gehört der Familie und überlebt dich.', 'Assets tied up for good. They are preserved and earn a small yield; every year a part is paid out for the common good of your town – or, with a family foundation, to your descendants. The foundation belongs to the family and outlives you.'],
  ['Wer Geld zusätzlich in die Stiftung gibt, stiftet zu. Ein Vermächtnis legt fest, wie viel Prozent deines Bargelds beim Tod an die Stiftung gehen, bevor deine Kinder den Rest erben.', 'Whoever gives additional money to the foundation endows it. A legacy sets what percentage of your cash goes to the foundation on death before your children inherit the rest.'],
  ['Ausschüttungen von Stiftungen und aufgelöste Vereinskassen füllen den Topf der Stadt. Er wirkt auf alle Bürger (Kinder, Gesundheit, Stimmung, Notgaben) und klingt jeden Tag etwas ab – wer nachlegt, hält die Wirkung.', 'Payouts from foundations and dissolved club treasuries fill the town’s pot. It affects all citizens (children, health, mood, emergency aid) and fades a little every day – whoever tops it up keeps the effect.'],
  ['Eine Auszeichnung für Verdienste, zum Beispiel Kommerzienrat, Stifter, Mäzen oder Altbürgermeister. Titel kommen automatisch, wenn du die Voraussetzungen erfüllst und einen guten Ruf hast, und bringen kleine Vorteile bei Wahlen und im Geschäft.', 'An award for services, for example councillor of commerce, founder, patron or former mayor. Titles come automatically when you meet the requirements and have a good reputation, and bring small advantages in elections and in business.'],
  ['Der Titel für Unternehmer mit gutem Ruf, mehreren Arbeitsplätzen und Spenden an die Stadt. Er gibt etwas mehr Umsatz, Stimmengewicht und billigere Kandidaturen; höhere Ränge verlangen mehr.', 'The title for entrepreneurs with a good reputation, several jobs and donations to the town. It gives a little more sales, vote weight and cheaper candidacies; higher ranks demand more.'],
  ['Stifter ist, wer viel Vermögen in Stiftungen einbringt; Mäzen, wer über die Jahre viel spendet. Beide Titel gehören der Familie und bleiben über die Generationen.', 'A founder is someone who places a lot of assets in foundations; a patron is someone who donates a lot over the years. Both titles belong to the family and last across the generations.'],
  // ---- Karten und Reiter
  ['Titel & Ränge', 'Titles & ranks'],
  ['gleich', 'shortly'],
  ['Vereine, Gemeinde & Titel', 'Clubs, congregation & titles'], ['Vereine, Gemeinde, Stiftung & Titel', 'Clubs, congregation, foundation & titles'], ['Beitrag offen', 'Fee due'], ['Trauerfeier offen', 'Funeral pending'],
  ['Hier gehört deine Familie zur Gesellschaft ihrer Stadt: Vereine, Glaubensgemeinschaft, Stiftungen und Titel.', 'Here your family belongs to the society of its town: clubs, faith community, foundations and titles.'],
  ['Alles bringt kleine Vorteile und Ansehen – nichts davon ist Pflicht, und Politik bleibt für alle offen.', 'Everything brings small advantages and standing – none of it is compulsory, and politics stays open to everyone.'],
  ['Fang klein an: Tritt einem Verein bei oder spende der Gemeinde.', 'Start small: join a club or donate to the congregation.'],
  ['Gesellschaft', 'Society'],
  // ---- Kassenbuch
  ['Verein gegründet', 'Club founded'], ['Beitritt (erster Beitrag)', 'Joined (first fee)'], ['Austritt', 'Left'], ['Beitrag', 'Fee'], ['Beitrag geändert', 'Fee changed'], ['Spende', 'Donation'], ['Vereinsfest', 'Club celebration'],
  ['Privat entnommen', 'Taken privately'], ['Rückzahlung nach Urteil', 'Repayment after verdict'], ['Neuer Vorsitz', 'New chair'], ['Vorstand geändert', 'Board changed'], ['Ausgeschlossen', 'Expelled'], ['Ausgeschieden (Beitrag offen)', 'Left (fee unpaid)'],
  ['Abgewählt', 'Voted out'], ['Verurteilt wegen Veruntreuung', 'Convicted of embezzlement'], ['Verein aufgelöst', 'Club dissolved'], ['Feier', 'Celebration'], ['Zustiftung', 'Endowment'], ['Ausschüttung', 'Payout'], ['Vermächtnis', 'Legacy'],
  ['Kassenbuch', 'Cash book'], ['Kassenbuch der Gemeinde', 'Congregation cash book'], ['Buch der Stiftung', 'Foundation ledger'], ['Noch keine Buchungen.', 'No entries yet.'],
  // ---- Vereine
  ['Mitglied', 'Member'], ['Mitglieder', 'Members'], ['im Jahr', 'per year'], ['Vorsitz:', 'Chair:'], ['Kasse:', 'Treasury:'], 
  ['wirkt auf die Mitglieder', 'takes effect on the members'], ['noch zu klein für die Wirkung', 'still too small to take effect'],
  ['Öffnen', 'Open'], ['Austreten', 'Leave'], ['Beitreten', 'Join'],
  ['Deine Vereine', 'Your clubs'],
  ['Du gehörst noch keinem Verein an. Tritt unten einem bei oder gründe einen eigenen – der erste Beitrag ist gering.', 'You do not belong to a club yet. Join one below or found your own – the first fee is small.'],
  ['Vereine in', 'Clubs in'], ['Verein gründen', 'Found a club'],
  ['In deiner Stadt gibt es noch keinen Verein. Sei der Erste!', 'There is no club in your town yet. Be the first!'],
  ['Ein', 'A'], ['Eine', 'A'], ['Die', 'The'],
  ['verbindet die Menschen deiner Stadt. Mitglieder zahlen einen Jahresbeitrag in die', 'brings the people of your town together. Members pay an annual fee into the'],
  ['; daraus richtet der', '; from it the'], ['Feste aus. Ab', 'holds celebrations. From'],
  ['Mitgliedern wirkt der Verein auf alle, die dazugehören.', 'members the club takes effect on everyone who belongs.'],
  ['Art des Vereins', 'Kind of club'], ['Name', 'Name'], ['z. B. Sportfreunde Eintracht', 'e.g. Sports Friends Unity'], ['Beschreibung (freiwillig)', 'Description (optional)'], ['Was macht ihr?', 'What do you do?'], ['Gründen', 'Found'],
  ['(Eintragung und Satzung). Du wirst Vorsitzende/r und zahlst keinen eigenen Beitrag im ersten Jahr.', '(registration and statutes). You become chairperson and pay no fee of your own in the first year.'],
  ['Die Gründung kostet einmalig', 'Founding costs a one-off'],
  ['in den Vorstand berufen', 'appoint to the board'], ['aus dem Vorstand entlassen', 'remove from the board'], ['Vorsitz übergeben', 'hand over the chair'], ['ausschließen', 'expel'],
  ['Gesundheit', 'Health'], ['Stimmung', 'Mood'], ['Umsatz', 'Sales'], ['Erholung', 'Recovery'],
  ['Die Kasse und das Kassenbuch sehen nur Mitglieder.', 'Only members can see the treasury and the cash book.'],
  ['Spenden', 'Donate'], ['Beitrag ändern', 'Change fee'], ['Misstrauen zurücknehmen', 'Withdraw no-confidence'], ['Misstrauen gegen den Vorsitz', 'No confidence in the chair'], ['Verein auflösen', 'Dissolve club'],
  
  ['Wahlempfehlung', 'Election recommendation'], ['Wahl beginnt', 'Election starts'], ['empfohlen', 'recommended'], ['empfohlen (mit Wahlkampfhilfe)', 'recommended (with campaign support)'], ['Empfehlen', 'Recommend'],
  ['Noch keine anderen Kandidaten.', 'No other candidates yet.'],
  ['Kasse privat entnehmen', 'Take from the treasury privately'], ['Das ist Veruntreuung.', 'This is embezzlement.'],
  [' Die Buchung steht für alle Mitglieder im Kassenbuch, ein Mitglied kann dich vor Gericht bringen, du verlierst bei einem Urteil das Geld und Ansehen – und die Mitglieder können dich abwählen. Es gibt kein Zurück.', ' The entry is visible to all members in the cash book, a member can take you to court, you lose the money and standing on a verdict – and the members can vote you out. There is no way back.'],
  ['Die Buchung steht für alle Mitglieder im Kassenbuch, ein Mitglied kann dich vor Gericht bringen, du verlierst bei einem Urteil das Geld und Ansehen – und die Mitglieder können dich abwählen. Es gibt kein Zurück.', 'The entry is visible to all members in the cash book, a member can take you to court, you lose the money and standing on a verdict – and the members can vote you out. There is no way back.'],
  ['Trotzdem Geld entnehmen …', 'Take money anyway …'],
  ['Schließen', 'Close'], ['Abbrechen', 'Cancel'],
  ['Jahresbeitrag ändern', 'Change annual fee'], ['Der neue Beitrag gilt für alle Mitglieder ab dem nächsten Zeitraum.', 'The new fee applies to all members from the next period.'], ['Speichern', 'Save'],
  ['Austreten?', 'Leave?'], ['Verein auflösen?', 'Dissolve the club?'], ['Auflösen', 'Dissolve'],
  ['Das Vermögen der Kasse fällt an die Stadt (Gemeinwohl). Alle Mitglieder verlieren die Mitgliedschaft.', 'The treasury’s assets go to the town (common good). All members lose their membership.'],
  ['Das Geld geht auf dein Konto. Das ist strafbar und für alle sichtbar.', 'The money goes to your account. That is a criminal offence and visible to everyone.'],
  ['Entnehmen (Veruntreuung)', 'Withdraw (embezzlement)'], ['Wirklich?', 'Really?'], ['Du begehst Veruntreuung. Ein Mitglied kann dich anzeigen.', 'You are committing embezzlement. A member can report you.'], ['Ja, entnehmen', 'Yes, withdraw'],
  ['Mitglied ausschließen?', 'Expel member?'], ['Das Mitglied kann erst nach einer Wartezeit wieder beitreten.', 'The member can only rejoin after a waiting period.'], ['Ausschließen', 'Expel'],
  ['Vorsitz übergeben?', 'Hand over the chair?'], ['Du bleibst im Vorstand, der neue Vorsitz bestimmt künftig über Beitrag und Auflösung.', 'You stay on the board; the new chair decides on the fee and dissolution from now on.'], ['Übergeben', 'Hand over'],
  // ---- Gemeinde
  ['ist die Glaubensgemeinschaft deiner Stadt. Mitglieder spenden in die Gemeindekasse; daraus gibt es', 'is the faith community of your town. Members donate to the congregation’s treasury; from it there is'],
  ['für Mitglieder in Not. Hochzeit, Taufe und Trauerfeier feierst du hier mit deiner Familie. Die Mitgliedschaft bleibt deiner Familie über die Generationen erhalten – aber du musst nicht beitreten.', 'for members in need. You celebrate weddings, baptisms and funerals here with your family. Membership stays with your family across the generations – but you do not have to join.'],
  ['Gemeinde-Ansehen:', 'Standing in the congregation:'], ['Punkte – nächste Stufe:', 'points – next level:'], ['ab', 'from'], ['Punkten', 'points'], ['Punkte – höchste Stufe erreicht.', 'points – highest level reached.'],
  ['Gemeindekasse:', 'Congregation treasury:'], ['Von dir gespendet:', 'Donated by you:'],
  ['Die Gemeinde hilft Mitgliedern in Not mit einem Teil der Kasse.', 'The congregation helps members in need with a part of the treasury.'],
  ['Damit niemand die Kasse plündert, gibt es sie nur mit etwas Gemeinde-Ansehen, nach einer Wartezeit und nur, wenn dein Geld wirklich nicht reicht oder du auf der Straße lebst.', 'So that nobody plunders the treasury, it is only available with some standing in the congregation, after a waiting period and only if your money really is not enough or you live on the street.'],
  ['Spende regelmäßig, wenn du kannst – dann ist die Kasse gefüllt, wenn jemand sie braucht.', 'Donate regularly if you can – then the treasury is full when someone needs it.'],
  ['Du kannst eine Notgabe von', 'You can ask for emergency aid of'], ['erbitten.', ''], ['Zurzeit keine Notgabe möglich.', 'No emergency aid possible at the moment.'], ['Erbitten', 'Ask'],
  ['Feiern mit der Familie', 'Celebrations with the family'], ['Schon gefeiert.', 'Already celebrated.'], ['Mit', 'With'], ['– die Zufriedenheit steigt.', '– contentment rises.'], ['Feiern', 'Celebrate'],
  ['Für kleine Kinder bis drei Jahre.', 'For small children up to three years.'], ['Kein Kind bis drei Jahre, das noch nicht gefeiert wurde.', 'No child up to three years who has not been celebrated yet.'],
  ['Jahr', 'year'], ['Jahre', 'years'],
  ['Für einen verstorbenen Angehörigen: Das tröstet die Familie.', 'For a deceased relative: this comforts the family.'], ['Zurzeit steht keine Trauerfeier an.', 'No funeral service is due at the moment.'], ['Ausrichten', 'Hold'],
  ['Die Mitgliedschaft bleibt deiner Familie über die Generationen erhalten. Du kannst jederzeit austreten.', 'Membership stays with your family across the generations. You can leave at any time.'],
  ['Aus der Gemeinde austreten?', 'Leave the congregation?'], ['Dein Gemeinde-Ansehen verfällt. Ein neuer Beitritt ist erst nach einer Wartezeit möglich.', 'Your standing in the congregation lapses. Joining again is only possible after a waiting period.'],
  ['An die Gemeinde spenden', 'Donate to the congregation'],
  // ---- Stiftung
  ['bindet Vermögen auf Dauer. Es bleibt erhalten und wirft einen kleinen Ertrag ab; ein Teil davon wird jedes Jahr ausgeschüttet – für das Gemeinwohl deiner Stadt (das bringt Ansehen und lässt den', 'ties up assets for good. They are preserved and earn a small yield; a part of it is paid out every year – for the common good of your town (that brings standing and makes the'],
  ['wirken) oder, bei einer Familienstiftung, an deine Nachkommen. Die Stiftung gehört deiner Familie und überlebt dich.', 'take effect) or, with a family foundation, to your descendants. The foundation belongs to your family and outlives you.'],
  ['Mindestens', 'At least'], ['Gründungsvermögen plus', 'founding capital plus'], ['Gebühr. Das Vermögen ist danach 30 Tage gebunden. Wer viel einbringt, trägt den Titel „Stifter“.', 'fee. The assets are then tied up for 30 days. Whoever contributes a lot bears the title “Founder”.'],
  ['Zweck der Stiftung', 'Purpose of the foundation'], ['Name der Stiftung', 'Name of the foundation'], ['z. B. Bürgerstiftung Zukunft', 'e.g. Citizens’ Foundation Future'], ['Stiftung gründen', 'Found a foundation'],
  ['Generation', 'Generation'], ['der Stifterfamilie', 'of the founding family'],
  ['Stiftungsvermögen', 'Foundation assets'], ['Eingebracht insgesamt', 'Contributed in total'], ['Bisher ausgeschüttet', 'Paid out so far'], ['Ausschüttung im Jahr', 'Payout per year'], ['Ertrag im Jahr', 'Yield per year'], ['Nächste Abrechnung', 'Next settlement'],
  ['Vermögen gebunden bis', 'Assets tied up until'], ['frei', 'free'], ['% des Bargelds beim Tod', '% of cash on death'], ['keines', 'none'],
  ['Die Ausschüttung geht an deine Familie (Gutschrift). Gemeinwohl-Ansehen gibt es dafür nicht.', 'The payout goes to your family (credit). There is no common-good standing for it.'],
  ['Wirkung in der Stadt:', 'Effect in town:'], ['Noch gering – jede Ausschüttung füllt den Topf, er klingt aber täglich ab.', 'Still small – every payout fills the pot, but it fades daily.'],
  ['Zustiften', 'Endow'], ['Ausschüttung ändern', 'Change payout'], ['Vermächtnis', 'Legacy'],
  ['Prozent im Jahr', 'Percent per year'], ['Prozent des Bargelds', 'Percent of cash'], ['Festlegen', 'Set'],
  ['Stiftung auflösen?', 'Dissolve the foundation?'], ['Du bekommst das Vermögen zurück, abzüglich der Kosten der Auflösung. Der Titel „Stifter“ richtet sich dann nach dem, was eingebracht bleibt.', 'You get the assets back, less the costs of dissolution. The title “Founder” then depends on what remains contributed.'],
  // ---- Titel
  ['würdigt, was du für deine Stadt leistest. Er wird automatisch verliehen, sobald du die Voraussetzungen erfüllst, und bringt', 'honours what you do for your town. It is awarded automatically as soon as you meet the requirements, and brings'],
  ['kleine', 'small'],
  ['Vorteile: mehr Gewicht bei Wahlen, eine günstigere Kandidatur, etwas mehr Umsatz, mehr Vereinsplätze. Titel und Vereine unterstützen im Wahlkampf – sie ersetzen aber keine Stimmen (zusammen höchstens +6 % Stimmengewicht).', 'advantages: more weight in elections, a cheaper candidacy, a little more sales, more club slots. Titles and clubs support campaigns – but they do not replace votes (together at most +6 % vote weight).'],
  ['Deine Titel', 'Your titles'], ['Familientitel – bleibt über die Generationen', 'Family title – lasts across the generations'], ['Persönlicher Titel – endet mit deinem Leben', 'Personal title – ends with your life'],
  ['Du trägst noch keinen Titel. Unten siehst du, was dafür nötig ist.', 'You do not bear a title yet. Below you can see what is needed.'],
  ['Alle Titel und ihre Voraussetzungen', 'All titles and their requirements'], ['Jetzt prüfen', 'Check now'],
  ['Dein Ansehen:', 'Your standing:'], ['Skandal', 'Scandal'], ['Ohne guten Ruf gibt es keinen Titel – wer verrufen ist, verliert sie.', 'Without a good reputation there is no title – whoever is disreputable loses them.'],
  ['Stimmengewicht', 'Vote weight'], ['Kandidaturgebühr', 'Candidacy fee'], ['Vereinsplatz', 'club slot'], ['noch nicht', 'not yet'], ['Stimmen', 'Votes'], ['Gebühr', 'Fee'],
  ['Wird nicht automatisch vergeben: Ein Bürgermeister verleiht die Würde einem verdienten Bürger seiner Stadt.', 'Not awarded automatically: a mayor awards the honour to a deserving citizen of their town.'],
  ['Gemeinwohl in', 'Common good in'], ['Bildung', 'Education'], ['Kultur', 'Culture'], ['Armenhilfe', 'Poor relief'],
  ['Der erste Jahresbeitrag', 'The first annual fee'],
]);
// ---- Muster mit Zahlen, Beträgen und Namen
T('in {n} Min.', 'in $1 min'); T('in {n} Std.', 'in $1 h'); T('in {n} Tagen', 'in $1 days');
T('Jahresbeitrag ({}, höchstens {})', 'Annual fee ($1, at most $2)');
T('Beitrag ({})', 'Fee ($1)'); T('Betrag ({})', 'Amount ($1)'); T('Gründungsvermögen ({})', 'Founding capital ($1)');
T('Ausschüttung im Jahr ({} bis {} % des Vermögens)', 'Payout per year ({} to {} % of the assets)'.replace('{}', '$1').replace('{}', '$2'));
T('Mit einem hohen Beitrag füllt sich die Kasse schneller, aber weniger Menschen treten bei. Ein Verein wirkt erst ab {n} Mitgliedern.', 'With a high fee the treasury fills faster, but fewer people join. A club only takes effect from $1 members.');
T('Kosten aus der Kasse: {} – nächstes Fest {}', 'Cost from the treasury: $1 – next celebration $2'); T('Kosten aus der Kasse: {}', 'Cost from the treasury: $1');
T('Fest ausrichten ({})', 'Hold a celebration ($1)'); T('mit Wahlkampfhilfe ({})', 'with campaign support ($1)');
T('Der Vorstand darf vor einer Wahl einen Kandidaten empfehlen (etwa +{} % Stimmengewicht, mit Wahlkampfhilfe aus der Kasse etwa +{} %). Gewählt wird weiter von den Bürgern – ein Verein ersetzt keine Stimmen.', 'Before an election the board may recommend a candidate (about +$1 % vote weight, with campaign support from the treasury about +$2 %). The citizens still do the electing – a club does not replace votes.');
T('Deine Spende geht in die Vereinskasse von „{}“.', 'Your donation goes into the club treasury of “$1”.');
T('Du verlässt den Verein „{}“.', 'You are leaving the club “$1”.');
T('Dem Verein „{}“ beitreten?', 'Join the club “$1”?');
T('Der erste Jahresbeitrag ({}) wird sofort abgebucht, danach jedes Jahr.', 'The first annual fee ($1) is debited immediately, then every year.');
T('Der {} beitreten?', 'Join the $1?');
T('Die Spende füllt die Gemeindekasse und stärkt dein Gemeinde-Ansehen. Kleinste Spende: {}.', 'The donation fills the congregation’s treasury and strengthens your standing there. Smallest donation: $1.');
T('{} feiern?', 'Hold: $1?');
T('Die Gebühr ({}) geht in die Gemeindekasse.', 'The fee ($1) goes into the congregation’s treasury.');
T('Das Geld bleibt dauerhaft im Stiftungsvermögen. Kleinste Zustiftung: {}. Danach ist das Vermögen wieder 30 Tage gebunden.', 'The money stays in the foundation’s assets for good. Smallest endowment: $1. Afterwards the assets are tied up again for 30 days.');
T('Wie viel Prozent des Vermögens schüttet die Stiftung jährlich aus? ({} bis {}) Der Ertrag beträgt etwa {} %: Liegt die Ausschüttung darunter, wächst das Vermögen.', 'What percentage of the assets does the foundation pay out each year? ($1 to $2) The yield is about $3 %: if the payout is below that, the assets grow.');
T('Wie viel Prozent deines Bargelds sollen beim Tod an die Stiftung gehen (0 bis {})? Deine Kinder teilen sich den Rest.', 'What percentage of your cash should go to the foundation on death (0 to $1)? Your children share the rest.');
T('Kinder +{}', 'Children +$1'); T('Notgaben +{} %', 'Emergency aid +$1 %'); T('Du: {}', 'You: $1');
T('{n} von {n} Mitgliedern misstrauen dem Vorsitz. Bei einer Mehrheit (mindestens drei Stimmen) ist er abgewählt.', '$1 of $2 members have no confidence in the chair. With a majority (at least three votes) they are voted out.');
module.exports = { exact, patterns };
