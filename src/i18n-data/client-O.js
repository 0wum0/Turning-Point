'use strict';
/**
 * Englische Texte der Oberfläche: Talente (Karte, Kinder, Betrieb, Bewerber, Team, Bildungspolitik, Glossar).
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz] (Muster werden zuerst ausgewertet). In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);
// ---- Muster
T('{} / Tag', '$1 / day');
T('% des Lohns, lernen', '% of the wage, learn');
T('% des Lohns (der Staat übernimmt zusätzlich {n} %), lernen', '% of the wage (the state pays another $1 %), learn');
T('Punkte – bis zur Grenze der Anlage. Das Bildungsprogramm des Landes spart {n} %.', 'points – up to the limit of the aptitude. The state education programme saves $1 %.');
T('{n} / {n}', '$1 / $2');
T('({n} / {n})', '($1 / $2)');
T('Stufe {n}', 'Level $1');
T('Schulen Stufe {n}', 'Schools level $1'); T('Bibliothek Stufe {n}', 'Library level $1'); T('Sportstätten Stufe {n}', 'Sports facilities level $1');
T('Kurse −{n} %', 'Courses −$1 %'); T('Lehrlingslohn −{n} %', 'Apprentice wage −$1 %');
T('{} · {n} Tage', '$1 · $2 days');
T('{} Jahre', '$1 years');
// ---- fest
X([
  ['Talent', 'Talent'], ['Deine Talente', 'Your talents'], ['Talente', 'Talents'], ['Begabung', 'Aptitude'], ['Anlagen', 'Predispositions'], ['Empfehlung:', 'Recommendation:'],
  ['Talente von', 'Talents of'], ['Stärke:', 'Strength:'], ['Passung', 'Fit'], ['Passung zu deinem Beruf', 'Fit for your job'],
  ['So entwickelst du dich', 'How you develop'], ['Verstanden', 'Got it'],
  ['Talente sind deine Begabungen: Handwerk, Handel, Führung, Bildung, Charme und Kondition.', 'Talents are your aptitudes: craft, trade, leadership, education, charm and stamina.'],
  ['Sie bestimmen, wie gut dir Arbeit, Familie und Politik von der Hand gehen. Du erbst sie von deinen Eltern und gibst sie weiter.', 'They decide how well work, family and politics go for you. You inherit them from your parents and pass them on.'],
  ['Übe, besuche Kurse und fördere deine Kinder – so wachsen Talente bis zu ihrer Grenze.', 'Practise, take courses and support your children – that is how talents grow up to their limit.'],
  ['Jede Person hat sechs Talente von 1 bis 100. 50 ist durchschnittlich. Talente wachsen langsam durch Übung – aber nur bis zu einer Grenze, die in der Anlage liegt (der kleine Strich im Balken).', 'Everyone has six talents from 1 to 100. 50 is average. Talents grow slowly with practice – but only up to a limit set by the aptitude (the small tick in the bar).'],
  ['Wächst durch Arbeit in Handwerk, Bau und Produktion – und durch die Werkstatt-AG bei Kindern.', 'Grows through work in crafts, construction and production – and through the workshop club for children.'],
  ['Wächst durch Arbeit in Handel und Verkauf, Kaufmannslehre und den Kaufmannsladen bei Kindern.', 'Grows through work in trade and sales, merchant training and the toy shop for children.'],
  ['Wächst, wenn du Teams leitest, Ämter ausübst oder Kinder in der Jugendgruppe förderst.', 'Grows when you lead teams, hold offices or support children in the youth group.'],
  ['Wächst durch Kurse, Studium, Bibliothek in deiner Stadt und Nachhilfe bei Kindern.', 'Grows through courses, study, a library in your city and tutoring for children.'],
  ['Wächst durch Arbeit mit Menschen, Beziehungen und Musik oder Theater bei Kindern.', 'Grows through work with people, relationships and music or theatre for children.'],
  ['Wächst durch Sportstätten in deiner Stadt, körperliche Arbeit und Sportverein bei Kindern.', 'Grows through sports facilities in your city, physical work and a sports club for children.'],
  ['Was deine Talente bewirken', 'What your talents do'],
  ['Kondition: Gesundheit', 'Stamina: health'], ['Punkte, Lebenserwartung', 'points, life expectancy'], ['Punkte, Kinder um', 'points, children by'],
  ['Charme und Bildung: Partner zufriedener um', 'Charm and education: partner happier by'], ['Charme und Führung: Gehaltsgespräch', 'Charm and leadership: salary talk'],
  [', Bewerbung', ', applications'], [', Wahlchance', ', election chance'], ['Bildung: Kurse, Lehre und Studium dauern', 'Education: courses, apprenticeships and studies take'],
  ['Charme: Zuwachs an Ansehen', 'Charm: gain in standing'], ['; Bildung und Charme vor Gericht', '; education and charm in court'], ['Punkte', 'points'], ['Jahre', 'years'],
  ['Im eigenen Betrieb zählen vor allem die Talente deiner Mitarbeiter – stelle Leute ein, die zur Betriebsart passen.', 'In your own business the talents of your staff count most – hire people who suit the type of business.'],
  ['Förderung läuft:', 'Support under way:'], ['– noch', '– still'], ['Tage', 'days'], ['Fördern', 'Support'], ['Fördern:', 'Support:'], ['passt zu Begabung', 'suits aptitude'],
  ['Ein Förderprogramm dauert', 'A support programme lasts'], ['Tage, kostet', 'days, costs'], ['und steigert ein Talent um einige Punkte – bis zur Grenze der Anlage.', 'and raises a talent by a few points – up to the limit of the aptitude.'],
  ['trainiert', 'trains'], ['Nachhilfe', 'Tutoring'], ['Sportverein', 'Sports club'], ['Musik und Theater', 'Music and theatre'], ['Werkstatt-AG', 'Workshop club'], ['Kaufmannsladen', 'Toy shop'], ['Jugendgruppe', 'Youth group'],
  ['Handwerk', 'Crafts'], ['Führung', 'Leadership'], ['Charme', 'Charm'], ['Kondition', 'Stamina'],
  ['gering', 'low'], ['solide', 'solid'], ['stark', 'strong'], ['herausragend', 'outstanding'], ['schwach', 'weak'], ['durchschnitt', 'average'], ['gut', 'good'],
  ['Handwerkliches Talent – eine Ausbildung im Handwerk?', 'Manual talent – a trade apprenticeship?'], ['Talent für Handel – Kaufmannslehre?', 'A talent for trade – a merchant apprenticeship?'],
  ['Führungstalent – später einen Betrieb leiten?', 'Leadership talent – run a business one day?'], ['Lernstark – Gymnasium und Studium?', 'A strong learner – grammar school and university?'],
  ['Gewinnend – ein Beruf mit Menschen, vielleicht sogar Politik?', 'Winning – a job with people, perhaps even politics?'], ['Sportlich und robust – ein körperlicher Beruf oder Sport fördern?', 'Sporty and robust – a physical job, or encourage sport?'],
  ['Noch zu klein – die Begabung zeigt sich mit etwa 6 Jahren.', 'Still too young – the aptitude shows at about 6 years.'], ['Ein ausgewogenes Kind – es kann vieles werden. Fördern hilft in jede Richtung.', 'A well-rounded child – it can become many things. Support helps in any direction.'],
  // Betrieb
  ['Team-Qualität', 'Team quality'], ['Gefragt in diesem Betrieb:', 'In demand in this business:'], ['Wirkung auf den Umsatz:', 'Effect on revenue:'], ['Bewerber ansehen', 'View applicants'], ['Team', 'Team'],
  ['+ Mitarbeiter (beste Wahl)', '+ Employee (best choice)'], ['Stellt die Bewerbung mit der besten Passung ein', 'Hires the applicant with the best fit'],
  ['Bewerber für', 'Applicants for'], ['Jede Woche melden sich neue Bewerber. Je besser die Talente zu deiner Betriebsart passen, desto mehr Umsatz bringt das Team – aber gute Leute kosten mehr Lohn.', 'New applicants come every week. The better the talents fit your type of business, the more revenue the team brings – but good people cost more wages.'],
  ['Mitarbeiter', 'Employees'], ['Wochenpool Nr.', 'Weekly pool no.'], ['Beste Wahl einstellen', 'Hire best choice'], ['Mehr Mitarbeiter braucht der Betrieb nicht.', 'The business does not need more staff.'],
  ['Fachkräfte', 'Skilled workers'], ['Einstellen', 'Hire'], ['vergeben', 'taken'], ['Lehrlinge', 'Apprentices'], ['Lehrling', 'Apprentice'], ['Als Lehrling nehmen', 'Take as apprentice'],
  ['/ Tag', '/ day'], ['Lehrlinge kosten nur', 'Apprentices cost only'], ['Jahre im Betrieb und werden dann Fachkräfte. Ein Meister bildet schneller aus.', 'years in the business and then become skilled workers. A master trains faster.'],
  ['Schließen', 'Close'], ['Team von', 'Team of'], ['Kurse kosten', 'Courses cost'], ['und dauern', 'and last'], ['Tage. Das Talent steigt um', 'days. The talent rises by'], ['Punkte – bis zur Grenze der Anlage.', 'points – up to the limit of the aptitude.'],
  ['Jahre dabei', 'years with us'], ['Lehrling, noch', 'Apprentice, still'], ['verlangt', 'demands'], ['% mehr Lohn (noch', '% more wage (still'], ['Tage).', 'days).'], ['Lohn erhöhen', 'Raise wage'],
  ['Im Kurs, noch', 'On a course, still'], ['Kurs', 'Course'], ['Entlassen', 'Dismiss'], ['Mitarbeiter entlassen?', 'Dismiss employee?'], ['Die Stelle wird frei; gute Leute findest du nicht immer sofort wieder.', 'The position becomes vacant; good people are not always easy to find again.'],
  ['Talent wählen', 'Choose talent'], ['Jahre', 'years'],
  // Politik
  ['Schwerpunkt', 'Focus'], ['Stufe', 'Level'], ['Schulen', 'Schools'], ['Bibliothek', 'Library'], ['Sportstätten', 'Sports facilities'],
  ['Schulbudget', 'School budget'], ['Bildungsprogramm (Land)', 'Education programme (state)'], ['Berufsbildungsgesetz (Bund)', 'Vocational Training Act (federal)'],
  ['Gute Schulen: Kinder lernen mehr (Bildung wächst mit etwas Glück jedes Jahr) und Förderprogramme wirken stärker.', 'Good schools: children learn more (education grows with a bit of luck every year) and support programmes work better.'],
  ['Die Bibliothek hilft allen Bewohnern: Mit etwas Glück wächst ihre Bildung jedes Jahr um einen Punkt.', 'The library helps all residents: with a bit of luck their education grows by a point every year.'],
  ['Die Sportstätten helfen allen Bewohnern: Mit etwas Glück wächst ihre Kondition jedes Jahr um einen Punkt.', 'The sports facilities help all residents: with a bit of luck their stamina grows by a point every year.'],
  ['Schulbudget Stufe', 'School budget level'], [':', ':'], ['Förderprogramme der Kinder in deiner Stadt wirken um', 'Support programmes for children in your city work'], ['stärker.', 'better.'],
  ['Bildungsprogramm Stufe', 'Education programme level'], ['Kurse für Mitarbeiter kosten im ganzen Bundesland', 'courses for employees cost across the whole state'], ['weniger und bringen ab Stufe 2 einen Punkt mehr.', 'less and bring one extra point from level 2.'],
  ['Berufsbildungsgesetz Stufe', 'Vocational Training Act level'], ['Der Staat übernimmt', 'The state pays'], ['des Lohns von Lehrlingen in allen Betrieben des Landes.', 'of the wages of apprentices in all businesses of the country.'],
  ['Gewerbesteuer-Zuschlag, Baulandausweisung und Schulbudget in der Stadt.', 'Trade-tax surcharge, building land and school budget in the city.'],
  ['Gewerbesteuer-Zuschlag, Subvention, Mietpreisbremse, Baulandausweisung und Schulbudget in der Stadt.', 'Trade-tax surcharge, subsidy, rent cap, building land and school budget in the city.'],
  ['Preisstützung für eine Ware, Wohnungsbauprogramm und Bildungsprogramm im Bundesland.', 'Price support for a good, housing programme and education programme in the state.'],
  ['Rahmen für Zuschläge und Subventionen im ganzen Land; Berufsbildungsgesetz.', 'Framework for surcharges and subsidies across the country; Vocational Training Act.'],
  ['Mehrwertsteuer auf Waren, Einfuhrzoll, Branchen-Subvention, Preisbremse und Berufsbildungsgesetz.', 'VAT on goods, import tariff, sector subsidy, price brake and Vocational Training Act.'],
  // Glossar
  ['Begabung (Anlage)', 'Aptitude (predisposition)'], ['Team-Qualität', 'Team quality'],
  ['Sechs Begabungen von 1 bis 100: Handwerk, Handel, Führung, Bildung, Charme und Kondition. 50 ist durchschnittlich. Sie beeinflussen Arbeit, Betriebe, Familie und Politik – nur ein wenig, aber spürbar.', 'Six aptitudes from 1 to 100: craft, trade, leadership, education, charm and stamina. 50 is average. They influence work, businesses, family and politics – only a little, but noticeably.'],
  ['Was ein Mensch von Geburt an mitbringt. Kinder erben das Mittel der Eltern, ein wenig zur Mitte gezogen und mit etwas Zufall. Mit Übung wächst ein Talent, aber nur bis zur Grenze der Anlage.', 'What a person brings from birth. Children inherit the average of their parents, pulled slightly towards the middle and with a bit of chance. A talent grows with practice, but only up to the limit of the aptitude.'],
  ['Ein Lehrling kostet nur den halben Lohn, lernt drei Jahre im Betrieb und wird dann Fachkraft. Ein Meister bildet schneller aus. Der Staat kann Lehrlingslöhne teilweise übernehmen.', 'An apprentice costs only half the wage, learns for three years in the business and then becomes a skilled worker. A master trains faster. The state can pay part of apprentice wages.'],
  ['Ein Förderprogramm für ein Kind (Nachhilfe, Sport, Musik …) kostet Geld und einige Wochen und steigert ein Talent um ein paar Punkte – bis zur Grenze der Anlage.', 'A support programme for a child (tutoring, sport, music …) costs money and a few weeks and raises a talent by a few points – up to the limit of the aptitude.'],
  ['Wie gut die Talente der Mitarbeiter zur Betriebsart passen, dazu die Führung durch dich oder den Manager. Ein gutes Team bringt bis zu zwölf Prozent mehr Umsatz – ein schwaches kostet bis zu zwölf Prozent.', 'How well the talents of the staff fit the type of business, plus the leadership by you or the manager. A good team brings up to twelve percent more revenue – a weak one costs up to twelve percent.'],
  ['Stelle jemanden mit passendem Talent ein', 'Hire someone with a fitting talent'],
]);
module.exports = { exact, patterns };
