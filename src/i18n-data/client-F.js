'use strict';
/**
 * Englische Texte der Oberfläche: Spielerwahlen (Spieler → Wahlen, Gesellschaft) und Karriere (Arbeit).
 * exact: ganzer Text → Übersetzung; patterns: [Regex, Ersatz]. In T('…{}…', '…$1…') steht {} für einen beliebigen Teil.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

X([
  ['Wahlen', 'Elections'], ['Kandidieren', 'Run for office'], ['Kandidatur zurückziehen', 'Withdraw candidacy'], ['Wählen', 'Vote'], ['Wahlspruch (optional)', 'Slogan (optional)'],
  ['Noch keine Kandidaten.', 'No candidates yet.'], ['Letzte Ergebnisse', 'Latest results'], ['Noch keine abgeschlossenen Wahlen.', 'No completed elections yet.'],
  ['Spielerwahlen sind gerade abgeschaltet.', 'Player elections are switched off right now.'], ['landesweit', 'nationwide'], ['Du', 'You'], ['deine Stimme', 'your vote'],
  ['Niemand gewählt.', 'Nobody elected.'], ['Stimme abgegeben.', 'Vote cast.'], ['Kandidatur zurückgezogen.', 'Candidacy withdrawn.'], ['Kandidatur eingereicht.', 'Candidacy submitted.'],
  ['Wahlfenster offen', 'Voting window open'], ['Kandidaturen möglich', 'Candidacies open'], ['Zu den Wahlen', 'To the elections'],
  ['Ämter werden in Echtzeit von den Spielern gewählt.', 'Offices are elected by the players in real time.'],
  ['Wähle in der Wahlphase einen Kandidaten – eine Stimme je Wahl.', 'Choose a candidate during the voting phase – one vote per election.'],
  ['Wer kandidieren will, zahlt eine Kandidaturgebühr und wird in der Nominierungsphase eingetragen.', 'Anyone who wants to run pays a candidacy fee and is registered during the nomination phase.'],
  ['Der Sieger tritt das Amt automatisch an. Das Ergebnis erscheint im Tagesblatt.', 'The winner takes office automatically. The result appears in the daily paper.'],
  ['Die Gebühr von', 'The fee of'], ['Deine Kandidatur ist öffentlich.', 'Your candidacy is public.'],
  ['Weiterbildung', 'Further education'], ['Laufender Kurs:', 'Current course:'], ['Buchen', 'Book'], ['Fortbildung', 'Further training'], ['Umschulung', 'Retraining'],
  ['Kurs buchen?', 'Book course?'], ['Die Gebühr wird sofort abgebucht.', 'The fee is charged immediately.'],
  ['Gehaltsgespräch', 'Salary talk'], ['Sofort kündigen', 'Quit immediately'], ['Zurücknehmen', 'Withdraw'], ['Arbeitslosengeld', 'Unemployment benefit'],
  ['Mit Kündigungsfrist kündigen?', 'Give notice?'], ['Du arbeitest bis zum Fristende weiter. Arbeitslosengeld gibt es nach eigener Kündigung nicht.', 'You keep working until the notice period ends. There is no unemployment benefit after resigning yourself.'],
  ['Während eines Kurses sinkt täglich die Erholung.', 'Rest drops every day during a course.'],
  ['Es endet, sobald du eine neue Stelle antrittst.', 'It ends as soon as you start a new job.'],
]);
T('Wahl endet in {}', 'Election ends in $1');
T('noch {}', '$1 left');
T('Wahl: {} – {}', 'Election: $1 – $2');
T('Gebühr {}', 'Fee $1');
T('Kandidatur: {}', 'Candidacy: $1');
T('Sieger: {} ({n} Stimmen)', 'Winner: $1 ($2 votes)');
T('Kurse in diesem Jahr: {}', 'Courses this year: $1');
T('Mit Frist kündigen ({n} T.)', 'Give notice ({n} d.)');
T('Gehaltsgespräch (in {n} T.)', 'Salary talk (in $1 d.)');
T('Kündigungsfrist: noch {n} Tage', 'Notice period: $1 days left');
T('Gehaltsstufen: Betriebszugehörigkeit {} · Leistung {} (je +{n} %, Lohn gesamt {n} %)', 'Pay steps: tenure $1 · performance $2 (each +$3 %, total wage $4 %)');
T('{} pro Tag, noch {n} Tage.', '$1 per day, $2 days left.');
T('Fortbildung · {}', 'Further training · $1');
T('Umschulung · {}', 'Retraining · $1');

module.exports = { exact, patterns };
