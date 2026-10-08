'use strict';
/** Englische Texte (Oberflächen-Durchlauf): Reste, die in der englischen Ansicht noch deutsch waren. */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\{n\}/g, '(\\d+)').replace(/\{\}/g, '([^·]+?)') + '$', en]);

X([
  ['Unterkunft suchen', 'Find accommodation'], ['Arbeit suchen', 'Look for work'], ['Spielen', 'Play'],
  ['Ziehen = umsehen', 'Drag = look around'], ['Rad = Zoom', 'Wheel = zoom'], ['Klick auf Gegenstände', 'Click objects'], ['Dein Besitz', 'Your property'],
  ['verheiratet', 'married'], ['wohnt bei dir', 'lives with you'], ['wohnt woanders', 'lives elsewhere'], ['Partner(in)', 'Partner'],
  ['Hier gibt es keine Aufgaben – aber vielleicht etwas anderes zu entdecken.', 'There are no tasks here – but perhaps something else to discover.'],
  ['Du bist nicht in dieser Stadt – Aktionen sind nur vor Ort möglich.', 'You are not in this city – actions are only possible on site.'],
  ['3D wird auf diesem Gerät nicht unterstützt. Du kannst trotzdem alle Aufgaben hier erledigen.', '3D is not supported on this device. You can still do all tasks here.'],
  ['Du bist nicht in dieser Stadt.', 'You are not in this city.'], ['Du bist nicht vor Ort', 'You are not on site'],
  ['Die Marke taucht jeweils nur an einer Stelle auf – schnapp sie dir', 'The token appears in one place at a time – grab it'],
  ['Klicke die Zahlen der Reihe nach (1, 2, 3 …)', 'Click the numbers in order (1, 2, 3 …)'], ['Sammle alle goldenen Marken', 'Collect all the golden tokens'],
  ['Geschafft!', 'Done!'], ['Ergebnis wird verbucht …', 'Recording the result …'],
  ['Alles gelesen – keine neuen Nachrichten.', 'All read – no new messages.'],
  ['läuft gut', 'doing well'], ['Nichts gefunden. Nur Spieler mit sichtbarem Profil erscheinen hier.', 'Nothing found. Only players with a visible profile appear here.'],
  ['Noch keine Kandidaten.', 'No candidates yet.'], ['Höchstpreis', 'Highest price'], ['Übernehmen', 'Take over'], ['dein Betrieb', 'your business'],
  ['Du hältst keine Aktien.', 'You hold no shares.'], ['kein Kaufgebot', 'no buy offer'],
  ['Dieses Leben ist beendet.', 'This life has ended.'], ['Zurück', 'Back'],
  ['(du)', '(you)'], ['Angebot zurückziehen', 'Withdraw offer'], ['deine', 'yours'],
  ['Keine offenen Angebote. Im Stadtverzeichnis kannst du jedem Eigentümer ein Angebot machen.', 'No open offers. In the city directory you can make an offer to any owner.'],
  ['Du besitzt noch nichts, das du verkaufen könntest.', 'You do not own anything you could sell yet.'],
  ['Zurzeit läuft hier keine Versteigerung. Insolvenzmassen und freiwillige Versteigerungen erscheinen an dieser Stelle.', 'No auction is running right now. Insolvency estates and voluntary auctions appear here.'],
  ['ein Dorf', 'a village'], ['eine Gemeinde', 'a municipality'], ['eine Kleinstadt', 'a small town'], ['eine Stadt', 'a city'],
  ['Bücherregal – Familienchronik', 'Bookshelf – family chronicle'], ['Familienchronik öffnen', 'Open family chronicle'], ['Stammbaum, Chronik und frühere Leben', 'Family tree, chronicle and earlier lives'],
  ['Einnahmen, Ausgaben und Vermögen', 'Income, expenses and wealth'], ['Aufräumen', 'Tidy up'], ['Postfach öffnen', 'Open mailbox'], ['Meldungen und Nachrichten', 'Notices and messages'],
  ['Partner und Kinder', 'Partner and children'], ['Pensionen, Mieten und Käufe', 'Boarding houses, rentals and purchases'], ['Bürgeramt', 'Citizens’ office'],
  ['Rednerpult – Wahlbüro', 'Lectern – election office'], ['Zum Wahlbüro (Ämter & Wahlen)', 'To the election office (offices & elections)'], ['Kandidieren und Einfluss', 'Run for office and influence'],
  ['Karte öffnen (Umzug)', 'Open map (move)'], ['Umziehen und Heimatstädte', 'Moving and home towns'], ['Reiseziel wählen', 'Choose a destination'],
  ['Obst & Gemüse', 'Fruit & vegetables'], ['Gemüse', 'Vegetables'], ['Brot & Käse', 'Bread & cheese'], ['Aufgabe für deine Kinder', 'Task for your children'], ['Das Netz öffnen', 'Open the net'],
  ['Kasse, Betreuung, Aufträge', 'Till, care, orders'], ['Gästetische – bedienen', 'Guest tables – serve'], ['Arbeitsfläche – anpacken', 'Work surface – get stuck in'],
  ['Büro – Unternehmen verwalten', 'Office – manage business'], ['Du arbeitest hier bereits selbst', 'You already work here yourself'], ['Büro des Arbeitgebers – Beruf', 'Employer’s office – profession'],
  ['(nicht erfüllt)', '(not met)'], ['Der Kühlschrank ist voll.', 'The fridge is full.'], ['Noch keine früheren Leben.', 'No earlier lives yet.'],
  ['teuer', 'expensive'], ['günstig', 'cheap'], ['Zahlungen noch nicht aktiv', 'Payments not active yet'], ['überlegt noch', 'still thinking'], ['großer Betrieb', 'large business'],
  ['Zurzeit sucht kein Spieler in deiner Stadt Personal. Schau später wieder vorbei – oder eröffne selbst einen Betrieb und stelle ein.', 'No player in your city is hiring at the moment. Check back later – or open a business yourself and hire.'],
  ['Antrag annehmen & heiraten', 'Accept proposal & marry'], ['Noch nicht', 'Not yet'],
  ['Du bist vergeben – andere Singles siehst du hier erst wieder, wenn du allein bist.', 'You are taken – you will only see other singles here again once you are single.'],
  ['Gerade sind keine anderen Singles in deiner Stadt sichtbar.', 'No other singles are visible in your city right now.'],
  ['Dein Profil ist privat – du erscheinst nicht in der Liste. Ändern unter „Mein Profil“.', 'Your profile is private – you do not appear in the list. Change it under “My profile”.'],
  ['Aufgabe verfügbar', 'Task available'], ['Börse', 'Exchange'], ['Börse …', 'Exchange …'],
  /* Toasts und Hinweise aus Aktionen */
  ['Gewinn abgeholt.', 'Profit collected.'], ['Mitarbeiter eingestellt.', 'Employee hired.'], ['Mitarbeiter entlassen.', 'Employee dismissed.'], ['Gebäudeversicherung abgeschlossen.', 'Building insurance taken out.'],
  ['Leider nichts gewonnen.', 'Unfortunately you won nothing.'], ['Bitte einen Einsatz wählen.', 'Please choose a stake.'], ['Die Kugel fällt auf die falsche Farbe. Einsatz verloren.', 'The ball lands on the wrong colour. Stake lost.'],
  ['Die ganze Stadt feiert – das hebt die Stimmung.', 'The whole city is celebrating – it lifts the mood.'], ['Ein Fest in deiner Stadt.', 'A festival in your city.'],
  ['Das Wohlbefinden steigt für ein paar Tage.', 'Well-being rises for a few days.'], ['Nichts nötig – genieße es.', 'Nothing needed – enjoy it.'],
  ['Weiterbildung', 'Further education'],
  ['Während eines Kurses sinkt täglich die Erholung.', 'Rest drops daily during a course.'],
  ['Roulette auf Rot/Schwarz: Gewinnchance 48,6 %, Einsatz verdoppelt sich bei Gewinn.', 'Roulette on red/black: 48.6 % chance to win, your stake doubles on a win.'],
  ['Die Null gehört der Bank – auf Dauer verliert man. Wer alles setzt, riskiert die Insolvenz.', 'Zero belongs to the bank – in the long run you lose. Betting everything risks insolvency.'],
  ['Spiele nur freiwillig und mit Maß.', 'Play voluntarily and in moderation.'],
]);
T('Gewinn: {} (Einsatz {}).', 'Win: $1 (stake $2).');
T('Gewonnen! +{}', 'Won! +$1');
T('{} wurde instand gesetzt – ein städtischer Handwerksbetrieb hat die Arbeiten übernommen.', '$1 has been repaired – a municipal trades company took over the work.');
T('{} wurde instand gesetzt – die {} hat den Auftrag bekommen.', '$1 has been repaired – $2 got the contract.');
T('{}: ein städtischer Handwerksbetrieb repariert den Schaden in etwa zehn Tagen.', '$1: a municipal trades company will repair the damage in about ten days.');
T('{}: die {} repariert den Schaden in etwa zehn Tagen.', '$1: $2 will repair the damage in about ten days.');
T('Fortbildung: Gebühr und {n} Tage Kurs bringen Berufserfahrung (ein Jahr) und können eine höhere Berufsstufe bedeuten.', 'Training: the fee and a {n}-day course give work experience (one year) and can mean a higher career level.'.replace('{n}', '$1'));
T('Umschulung: Gebühr und {n} Tage Kurs schalten einen neuen Beruf frei.', 'Retraining: the fee and a $1-day course unlock a new profession.');
T('Pro Jahr sind {n} Kurse möglich.', '$1 courses are possible per year.');
T('Wahlkampf {}', 'Campaign $1');
for (const [inc, incEn, ng] of [['Einkommen ([^·]+?) / Tag', 'Income $2 / day', 3], ['Einkommen unbezahlt', 'Income unpaid', 2]]) {
  const k = ng; // Gruppe der Kraft-Angabe
  const base = `^Wahlkampf ([^·]+?) · ${inc} · Kraft −(\\d+)/Tag`;
  patterns.push([`${base} · (\\d+)× absolviert$`, `Campaign $1 · ${incEn.replace('$2', ng === 3 ? '$2' : '')} · Energy −$${k}/day · $${k + 1}× completed`]);
  patterns.push([`${base}$`, `Campaign $1 · ${incEn} · Energy −$${k}/day`]);
}
T('{n}× absolviert', '$1× completed');
T('Einkommen {} / Tag', 'Income $1 / day');
T('Kraft −{n}/Tag', 'Energy −$1/day');
T('Verbrauch {} / Tag', 'Consumption $1 / day');

/* Game-over-Meldung = Todesursache + Satz zum Erbe (zur Laufzeit zusammengesetzt) */
const REASONS = [['auf der Straße gestorben', 'died on the street'], ['verhungert', 'starved'], ['an Krebs gestorben', 'died of cancer'], ['an seiner Krankheit gestorben', 'died of his illness'], ['an Altersschwäche gestorben', 'died of old age'], ['an Erschöpfung gestorben', 'died of exhaustion']];
const WHY = [['Es gibt kein volljähriges Kind, das das Erbe antreten kann.', 'There is no adult child who can take over the inheritance.'], ['Es gibt keine Kinder, die das Erbe antreten könnten.', 'There are no children who could take over the inheritance.']];
for (const [r, re] of REASONS) for (const [w, we] of WHY) exact[`${r}. ${w}`] = `${re[0].toUpperCase()}${re.slice(1)}. ${we}`;

const CAUSE = [['auf der Straße gestorben', 'on the street'], ['verhungert', 'of starvation'], ['an Krebs gestorben', 'of cancer'], ['an seiner Krankheit gestorben', 'of his illness'], ['an Altersschwäche gestorben', 'of old age'], ['an Erschöpfung gestorben', 'of exhaustion'], ['Alter', 'of old age']];
for (const [de, en] of CAUSE) T(`{} stirbt (${de}).`, `$1 dies (${en}).`);

module.exports = { exact, patterns };
