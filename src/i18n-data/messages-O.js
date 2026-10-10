'use strict';
/**
 * Englische Texte (Spielserver): Talente – Bewerberpool, Lehrlinge, Kurse, Fördern, Beschlüsse zur Bildung, Aufgaben und Hinweise.
 * Paare [deutsch, englisch]; ${…} sind Platzhalter (Namen und Zahlen). Muster stehen vor den festen Texten.
 */
const pairs = [
  ['Stelle jemanden mit passendem Talent ein', 'Hire someone with a fitting talent'],
  ['Jeder Mensch hat Talente. Wer zu deiner Betriebsart passt, bringt mehr Umsatz. Im Bewerberpool siehst du die Passung auf einen Blick.', 'Everyone has talents. Someone who fits your type of business brings more revenue. The applicant pool shows the fit at a glance.'],
  // Meldungen
  ['${m.name} hat die Lehre beendet', '${m.name} has finished the apprenticeship'],
  ['${m.name} ist jetzt Fachkraft in ${c.name} (Passung ${fit(m, w)} %).', '${m.name} is now a skilled worker at ${c.name} (fit ${fit(m, w)} %).'],
  ['Kurs beendet: ${m.name}', 'Course finished: ${m.name}'],
  ['${m.name} ist besser in ${lbl} (+${gain}).', '${m.name} is better at ${lbl} (+${gain}).'],
  ['${m.name} ist besser in ${lbl} – mehr geht in diesem Bereich nicht.', '${m.name} is better at ${lbl} – there is no more to gain in this area.'],
  ['${m.name} kündigt', '${m.name} quits'],
  ['${m.name} wollte mehr Lohn und wechselt nun zu einem anderen Betrieb.', '${m.name} wanted a higher wage and is now moving to another business.'],
  ['${m.name} verlangt mehr Lohn', '${m.name} demands a higher wage'],
  ['${c.name}: ${m.name} ist besser geworden und fordert ${pct} % mehr. Du hast ${askDays} Tage Zeit.', '${c.name}: ${m.name} has improved and demands ${pct} % more. You have ${askDays} days.'],
  ['${c.name} hat das Förderprogramm beendet', '${c.name} has finished the support programme'],
  ['${lbl} +${done.gain}. ${c.name} ist stolz auf sich.', '${lbl} +${done.gain}. ${c.name} is proud.'],
  ['${c.name} hat viel Spaß gehabt – in diesem Bereich ist aber kaum mehr zu holen.', '${c.name} had a lot of fun – but there is hardly anything left to gain in this area.'],
  // Aktionen und Fehler
  ['Unbekanntes Förderprogramm.', 'Unknown support programme.'], ['Dieses Kind hat noch kein Talentprofil.', 'This child has no talent profile yet.'],
  ['Nur Kinder zu Hause können gefördert werden.', 'Only children living at home can be supported.'], ['Gefördert wird ab ${num(f.minAge, 3)} Jahren.', 'Support starts at ${num(f.minAge, 3)} years.'],
  ['Das Kind ist dafür zu alt.', 'The child is too old for that.'], ['Es läuft schon ein Förderprogramm.', 'A support programme is already running.'],
  ['${lbl} ist bei diesem Kind schon voll ausgebildet.', '${lbl} is already fully developed in this child.'],
  ['Unternehmen nicht gefunden.', 'Business not found.'], ['Der Betrieb steht leer. Reaktiviere ihn zuerst.', 'The business is empty. Reactivate it first.'],
  ['Diesen Mitarbeiter gibt es nicht (mehr).', 'This employee does not exist (any more).'], ['Mehr Mitarbeiter braucht der Betrieb nicht.', 'The business does not need more staff.'],
  ['Diese Woche bewirbt sich niemand mehr. Nächste Woche kommen neue Bewerber.', 'Nobody else applies this week. New applicants come next week.'],
  ['${nm} beginnt eine Lehre in ${cn} (Lohn ${lehrPct} %, ${lehrYears} Jahre).', '${nm} starts an apprenticeship at ${cn} (wage ${lehrPct} %, ${lehrYears} years).'],
  ['${nm} ist eingestellt (Passung ${wl} %).', '${nm} is hired (fit ${wl} %).'], ['Beste Wahl: ${r.msg}', 'Best choice: ${r.msg}'],
  ['Es gibt niemanden zu entlassen.', 'There is nobody to dismiss.'], ['${worst.name} wurde entlassen.', '${worst.name} was dismissed.'], ['Mitarbeiter entlassen.', 'Employee dismissed.'],
  ['Diese Bewerbung ist nicht mehr aktuell.', 'This application is no longer current.'], ['Diese Person ist schon vergeben.', 'This person has already been taken.'],
  ['Mehr als ${lehrMax} Lehrlinge gleichzeitig bildet dieser Betrieb nicht aus.', 'This business does not train more than ${lehrMax} apprentices at the same time.'],
  ['${m.name} wurde entlassen.', '${m.name} was dismissed.'], ['Bitte ein Talent wählen.', 'Please choose a talent.'],
  ['Lehrlinge lernen im Betrieb; Kurse gibt es für ausgelernte Fachkräfte.', 'Apprentices learn on the job; courses are for trained staff.'],
  ['${m.name} ist schon in einem Kurs.', '${m.name} is already on a course.'], ['${m.name} hat in ${lab(key)} das Ende der Fahnenstange erreicht.', '${m.name} has reached the limit in ${lab(key)}.'],
  ['Für die Kursgebühr reicht dein Geld nicht.', 'You cannot afford the course fee.'],
  ['${m.name} besucht einen Kurs in ${lbl} (${o.days} Tage, ${fee}).', '${m.name} attends a course in ${lbl} (${o.days} days, ${fee}).'],
  ['Es liegt keine Lohnforderung vor.', 'There is no wage demand.'], ['${m.name} bekommt mehr Lohn und bleibt.', '${m.name} gets a higher wage and stays.'],
  ['Kind nicht gefunden.', 'Child not found.'], ['Für das Förderprogramm reicht das Geld nicht.', 'You cannot afford the support programme.'],
  ['${c.name} wird gefördert: ${prog} (${r.days} Tage, ${fee}).', '${c.name} is being supported: ${prog} (${r.days} days, ${fee}).'],
  ['Nachhilfe', 'Tutoring'], ['Sportverein', 'Sports club'], ['Musik und Theater', 'Music and theatre'], ['Werkstatt-AG', 'Workshop club'], ['Kaufmannsladen', 'Toy shop'], ['Jugendgruppe', 'Youth group'],
  // Empfehlungen
  ['Handwerkliches Talent – eine Ausbildung im Handwerk?', 'Manual talent – a trade apprenticeship?'], ['Talent für Handel – Kaufmannslehre?', 'A talent for trade – a merchant apprenticeship?'],
  ['Führungstalent – später einen Betrieb leiten?', 'Leadership talent – run a business one day?'], ['Lernstark – Gymnasium und Studium?', 'A strong learner – grammar school and university?'],
  ['Gewinnend – ein Beruf mit Menschen, vielleicht sogar Politik?', 'Winning – a job with people, perhaps even politics?'], ['Sportlich und robust – ein körperlicher Beruf oder Sport fördern?', 'Sporty and robust – a physical job, or encourage sport?'],
  ['Noch zu klein – die Begabung zeigt sich mit etwa 6 Jahren.', 'Still too young – the aptitude shows at about 6 years.'], ['Ein ausgewogenes Kind – es kann vieles werden. Fördern hilft in jede Richtung.', 'A well-rounded child – it can become many things. Support helps in any direction.'],
  ['gering', 'low'], ['solide', 'solid'], ['stark', 'strong'], ['herausragend', 'outstanding'], ['schwach', 'weak'], ['durchschnitt', 'average'], ['gut', 'good'],
  // Hinweise
  ['${fostr.name} fördern', 'Support ${fostr.name}'], ['${fostr.tal.rec} Ein Förderprogramm steigert ein Talent und kostet nur ${dm(fostr.tal.cost, cur)}.', '${fostr.tal.rec} A support programme raises a talent and costs only ${dm(fostr.tal.cost, cur)}.'],
  ['${teamLow.name}: Stelle jemanden mit passendem Talent ein', '${teamLow.name}: hire someone with a fitting talent'],
  ['Dir fehlen Mitarbeiter. Im Bewerberpool siehst du, wer zu deinem Betrieb passt – gute Leute bringen mehr Umsatz.', 'You are short of staff. The applicant pool shows who fits your business – good people bring more revenue.'],
  ['Bewerber ansehen', 'View applicants'],
  // Bildungspolitik
  ['Schulbudget', 'School budget'], ['Bildungsprogramm (Land)', 'Education programme (state)'], ['Berufsbildungsgesetz (Bund)', 'Vocational Training Act (federal)'],
  ['Schulen, Bibliothek oder Sportstätten fördern: Kinder entwickeln ihre Talente schneller, Bewohner lernen und trainieren mehr – Betriebe zahlen dafür eine kleine Umlage', 'Fund schools, a library or sports facilities: children develop their talents faster, residents learn and train more – businesses pay a small levy for it'],
  ['Kurse für Mitarbeiter werden im ganzen Bundesland günstiger und wirken etwas stärker', 'Courses for employees become cheaper across the whole state and work a little better'],
  ['Der Staat bezahlt einen Teil des Lohns von Lehrlingen in allen Betrieben des Landes', 'The state pays part of the wages of apprentices in all businesses of the country'],
  ['Schulbudget in ${cn}: ${focus}, Stufe ${r.val}', 'School budget in ${cn}: ${focus}, level ${r.val}'], ['der Stadt', 'the city'],
  ['Schulen', 'Schools'], ['Bibliothek', 'Library'], ['Sportstätten', 'Sports facilities'],
  ['Bildungsprogramm in ${rg}: Stufe ${r.val} (Kurse günstiger)', 'Education programme in ${rg}: level ${r.val} (cheaper courses)'], ['der Region', 'the region'],
  ['Handwerk', 'Crafts'], ['Führung', 'Leadership'], ['Charme', 'Charm'], ['Kondition', 'Stamina'],
  ['Berufsbildungsgesetz: Stufe ${r.val} (Lehrlingslohn teilweise vom Staat bezahlt)', 'Vocational Training Act: level ${r.val} (apprentice wages partly paid by the state)'],
  ['Bitte Schulen, Bibliothek oder Sportstätten wählen.', 'Please choose schools, library or sports facilities.'], ['Diese Stufe ist nicht erlaubt.', 'This level is not allowed.'],
];
module.exports = pairs;
