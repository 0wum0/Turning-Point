'use strict';
/**
 * Englische Texte der Oberfläche: Charakterblatt – Erfahrungspunkte, Ausstattung, gesellschaftlicher Rang, Innenraum (Garderobe), Glossar, Einsteiger-Hinweise.
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz]. In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 * Namen und Texte der Plätze, Stufen und Ränge kommen schon übersetzt vom Server (messages-T.js).
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

// ---- Muster
T('Gibt es erst ab {n}.', 'Not available until $1.');
T('{} kaufen?', 'Buy $1?'); T('{} verkaufen?', 'Sell $1?');
T('{} Es kostet {}, dein altes Stück wird mit {} angerechnet. Auftreten: +{}.', '$1 It costs $2, your old piece is credited with $3. Appearance: +$4.');
T('{} Es kostet {}. Auftreten: +{}.', '$1 It costs $2. Appearance: +$3.');
T('Du bekommst {}. Erbstücke bleiben dir.', 'You receive $1. Heirlooms stay with you.');
T('{} steigern', 'Increase $1');
T('{} Punkte bis', '$1 points until');
T('Auftreten: {} · {}', 'Appearance: $1 · $2');

X([
  // Übersicht (Karte)
  ['Dein Rang', 'Your rank'], ['Rang', 'Rank'], ['von 7', 'of 7'], ['Erfahrungspunkte', 'experience points'], ['Zum Charakterblatt', 'To the character sheet'], ['Auftreten:', 'Appearance:'], ['Punkte bis', 'points until'],
  // Seite
  ['Charakterblatt', 'Character sheet'], ['Charakter', 'Character'], ['Talente, Ausstattung und dein Platz in der Gesellschaft – alles auf einen Blick.', 'Talents, equipment and your place in society – everything at a glance.'],
  ['Das Charakterblatt ist gerade ausgeschaltet.', 'The character sheet is switched off at the moment.'],
  ['Jahre', 'years'], ['Generation', 'Generation'], ['Auftreten', 'Appearance'], ['schlicht', 'plain'], ['gepflegt', 'well-groomed'], ['repräsentativ', 'prestigious'], ['glanzvoll', 'glamorous'],
  ['Noch', 'Another'], ['Punkte bis zum nächsten Rang.', 'points until the next rank.'], ['Höchster Rang erreicht.', 'Highest rank reached.'],
  ['Talente sind gerade ausgeschaltet.', 'Talents are switched off at the moment.'],
  ['Ein Punkt kostet je nach Wert 2 bis 10 Erfahrung. Noch', 'A point costs 2 to 10 experience, depending on the value. Another'],
  ['Steigerungen in diesem Spieljahr (höchstens', 'increases this game year (at most'], ['), je Talent', '), per talent'], ['Tage Pause.', 'days break.'],
  ['Beste Wahl', 'Best choice'], ['Alles verteilen', 'Distribute all'], ['Automatisch verteilen', 'Distribute automatically'],
  ['Woher die Erfahrung kommt', 'Where experience comes from'], ['Die Balken zeigen, wie viel Erfahrung du in diesem Spieljahr aus jeder Quelle schon bekommen hast.', 'The bars show how much experience you have already received from each source this game year.'],
  ['Zuletzt:', 'Recently:'], ['Summe', 'Total'], ['Weiche Vorteile', 'Soft advantages'], ['Nichts davon sperrt etwas: Alle Angebote bleiben für alle sichtbar, und jedes Amt bis zum Bundeskanzler bleibt erreichbar.', 'None of this locks anything: all offers stay visible to everyone, and every office up to Federal Chancellor stays within reach.'],
  ['Ansehen', 'Reputation'], ['Vermögen', 'Wealth'], ['Titel und Ämter', 'Titles and offices'], ['Herkunft', 'Origin'], ['ab Rang', 'from rank'], ['Punkte', 'points'], ['Gesellschaftlicher Rang', 'Social rank'],
  ['Alltagskleidung', 'Everyday clothes'], ['Nichts', 'Nothing'], ['aus der Mode', 'out of fashion'], ['Erbstück:', 'Heirloom:'], ['Zustand', 'Condition'], ['Verkaufswert:', 'Resale value:'], ['Kosten:', 'Costs:'], ['pro Tag', 'per day'],
  ['Aufarbeiten', 'Refurbish'], ['Verkaufen', 'Sell'], ['Beenden', 'End'], ['Aktuell', 'Current'], ['Wechseln zu:', 'Change to:'], ['Kaufen:', 'Buy:'],
  ['Stellt den Zustand wieder her', 'Restores the condition'], ['Noch in gutem Zustand', 'Still in good condition'], ['Stufen ansehen', 'View levels'], ['Gerade ausgeschaltet.', 'Switched off at the moment.'], ['Dafür reicht dein Geld nicht.', 'You cannot afford that.'],
  ['höchstens', 'at most'], ['Einbruchsrisiko', 'Burglary risk'], ['Einbruchsrisiko:', 'Burglary risk:'], ['Wohlbefinden', 'Well-being'],
  ['Zuwachs an Ansehen', 'Gain in reputation'], ['Gehaltsgespräch: Chance', 'Pay talk: chance'], ['Bewerbung: Chance', 'Application: chance'], ['Wahl: Stimmengewicht', 'Election: vote weight'], ['Kandidatur: Chance', 'Candidacy: chance'], ['Gericht: Punkte', 'Court: points'],
  ['Die Wirkungen beginnen ab etwa 10 Punkten Auftreten und sind bei 80 Punkten voll ausgeschöpft.', 'The effects begin at about 10 points of appearance and are fully used at 80 points.'],
  ['Laufende Kosten / Tag', 'Running costs / day'], ['Laufende Kosten / Jahr', 'Running costs / year'],
  ['Tipp: Beginne mit Kleidung und Aktentasche – das ist günstig und wirkt am meisten. Ein Auto lohnt sich erst, wenn das Geld locker sitzt.', 'Tip: start with clothing and a briefcase – it is cheap and has the most effect. A car only pays off when money is plentiful.'],
  ['Kurz-Lebenslauf', 'Short CV'], ['Noch nichts erlebt.', 'Nothing experienced yet.'], ['Ganze Chronik im Vermächtnis', 'Full chronicle in Legacy'],
  ['Dienstleistungen kosten täglich Geld und lassen sich jederzeit beenden. Reicht das Geld nicht mehr, enden sie von selbst.', 'Services cost money every day and can be ended at any time. If the money runs out they end by themselves.'],
  ['Stücke nutzen sich ab; ein veraltetes Stück wirkt etwas weniger. Beim Wechsel wird das alte Stück angerechnet.', 'Pieces wear out; an outdated piece has a little less effect. When you change, the old piece is credited.'],
  ['Erst ab', 'Only from'], ['Einbruchsrisiko:', 'Burglary risk:'],
  // Info-Dialoge
  ['Das Charakterblatt zeigt, wer du bist: deine Talente, was du trägst und fährst und welchen Platz du in der Gesellschaft einnimmst.', 'The character sheet shows who you are: your talents, what you wear and drive and which place you hold in society.'],
  ['Alles hier ist freiwillig. Erfahrung macht dich besser, Ausstattung wirkt ein wenig und zeigt Status, der Rang bringt weiche Vorteile. Gesperrt wird dadurch nie etwas – auch das Kanzleramt bleibt für jeden erreichbar.', 'Everything here is voluntary. Experience makes you better, equipment has a small effect and shows status, rank brings soft advantages. Nothing is ever locked because of it – even the Chancellor’s office stays within reach for everyone.'],
  ['Steck deine Erfahrungspunkte in ein Talent, kauf dir mit Maß etwas Passendes und schau, was dir zum nächsten Rang fehlt.', 'Put your experience points into a talent, buy something suitable in moderation and see what you are missing for the next rank.'],
  ['Erfahrung sammelst du, wenn du arbeitest, Menschen führst, lernst, Verträge schließt oder Menschen triffst. Jede Quelle hat einen Deckel pro Jahr.', 'You gain experience when you work, lead people, learn, sign contracts or meet people. Each source has a cap per year.'],
  ['Mit Erfahrung steigerst du deine Talente – dauerhaft, aber nur bis zur Grenze deiner Anlage (der kleine Strich im Balken). Je höher ein Talent, desto teurer der nächste Punkt. Jedes Talent braucht nach einer Steigerung eine Pause.', 'With experience you raise your talents – permanently, but only up to the limit of your aptitude (the small mark in the bar). The higher a talent, the more expensive the next point. Each talent needs a break after an increase.'],
  ['Tippe auf das Plus beim Talent, das du fördern willst, oder lass die Beste Wahl entscheiden.', 'Tap the plus next to the talent you want to develop, or let the best choice decide.'],
  ['Dein Rang (1 bis 7) wird aus deinem Ansehen, deinem Vermögen (inflationsbereinigt), deinen Titeln und Ämtern, deinem Auftreten und deiner Herkunft berechnet. Er geht nur langsam wieder verloren.', 'Your rank (1 to 7) is calculated from your reputation, your wealth (inflation-adjusted), your titles and offices, your appearance and your origin. It is only lost slowly.'],
  ['Höhere Ränge bringen weiche Vorteile: günstigere Immobilien und ein Vorab-Angebot, Beziehungen bei Bewerbungen, eine günstigere Kandidatur und mehr Vereinsplätze. Nichts wird gesperrt – kein Amt und kein Kauf hängt am Rang.', 'Higher ranks bring soft advantages: cheaper property and an early offer, connections in applications, a cheaper candidacy and more club places. Nothing is locked – no office and no purchase depends on rank.'],
  ['Zahle pünktlich, handle fair, sammle Titel, bau Vermögen auf und achte auf dein Auftreten.', 'Pay on time, act fairly, collect titles, build wealth and mind your appearance.'],
  ['Ausstattung ist, was du trägst und fährst: Kleidung, Uhr, Schmuck, Fahrzeug und Arbeitsmittel, dazu Pflege und ein Sicherheitsdienst als laufende Dienstleistungen. Waffen gibt es nicht.', 'Equipment is what you wear and drive: clothing, watch, jewellery, vehicle and work equipment, plus grooming and a security service as ongoing services. There are no weapons.'],
  ['Zusammen ergeben sie dein Auftreten (0 bis 100). Das wirkt klein, aber spürbar: ein bisschen mehr Ansehen, bessere Chancen im Gehaltsgespräch, bei Bewerbungen und Wahlen, Pluspunkte vor Gericht. Die Wirkungen sind gedeckelt, ein Zwang besteht nie.', 'Together they make up your appearance (0 to 100). The effect is small but noticeable: a little more reputation, better chances in pay talks, applications and elections, extra points in court. The effects are capped and nothing is ever compulsory.'],
  ['Kaufe mit Maß. Stücke nutzen sich ab und kosten Unterhalt; du kannst sie jederzeit mit Abschlag verkaufen. Uhr und Schmuck sind Erbstücke und gehen an die Kinder.', 'Buy in moderation. Pieces wear out and cost upkeep; you can sell them at any time at a discount. Watch and jewellery are heirlooms and pass to the children.'],
  // Glossar
  ['Erfahrungspunkte (EP)', 'Experience points (XP)'],
  ['Wer arbeitet, führt, lernt, Verträge schließt oder Menschen trifft, sammelt Erfahrung. Du steckst sie im Charakterblatt in ein Talent. Jede Quelle hat einen Deckel pro Spieljahr, und je höher ein Talent, desto teurer der nächste Punkt.', 'Anyone who works, leads, learns, signs contracts or meets people gains experience. You put it into a talent on the character sheet. Each source has a cap per game year, and the higher a talent, the more expensive the next point.'],
  ['Deine Seite mit Talenten, Erfahrung, Ausstattung und gesellschaftlichem Rang. Alles darauf ist freiwillig und wirkt nur ein wenig.', 'Your page with talents, experience, equipment and social rank. Everything on it is voluntary and has only a small effect.'],
  ['Ausstattung', 'Equipment'], ['Kleidung, Uhr, Schmuck, Fahrzeug und Arbeitsmittel sowie Pflege und Sicherheitsdienst. Sie ergeben dein Auftreten, kosten laufend etwas und lassen sich mit Abschlag verkaufen. Waffen gibt es nicht.', 'Clothing, watch, jewellery, vehicle and work equipment as well as grooming and security service. They make up your appearance, cost something on an ongoing basis and can be sold at a discount. There are no weapons.'],
  ['Ein Wert von 0 bis 100, der aus deiner Ausstattung entsteht. Gepflegtes Auftreten bringt ein wenig mehr Ansehen und bessere Chancen bei Gehaltsgespräch, Bewerbung, Wahl und vor Gericht – klein, aber spürbar.', 'A value from 0 to 100 that comes from your equipment. A well-kept appearance brings a little more reputation and better chances in pay talks, applications, elections and in court – small but noticeable.'],
  ['Ein Rang von 1 bis 7, berechnet aus Ansehen, Vermögen, Titeln und Ämtern, Auftreten und Herkunft. Er bringt weiche Vorteile wie günstigere Immobilien, sperrt aber nie etwas.', 'A rank from 1 to 7, calculated from reputation, wealth, titles and offices, appearance and origin. It brings soft advantages such as cheaper property but never locks anything.'],
  ['Erbstück', 'Heirloom'], ['Uhr und Schmuck gehen an das erbende Kind. Ein Erbstück lässt sich nicht verkaufen, wirkt aber wie jedes andere Stück.', 'Watch and jewellery go to the inheriting child. A heirloom cannot be sold but works like any other piece.'],
  ['Sicherheitsdienst', 'Security service'], ['Eine Dienstleistung (Wachdienst, später Personenschutz), die täglich kostet und das Risiko eines Einbruchs senkt. Du kannst sie jederzeit beenden.', 'A service (security patrol, later close protection) that costs daily and lowers the risk of a burglary. You can end it at any time.'],
  // Innenraum, Zeitung, Profil
  ['Garderobe', 'Wardrobe'], ['Garderobe – Charakterblatt', 'Wardrobe – character sheet'], ['Charakterblatt öffnen', 'Open character sheet'], ['Talente, Ausstattung und gesellschaftlicher Rang', 'Talents, equipment and social rank'],
  ['Vorab-Angebot', 'Early offer'], ['Ein Vorab-Angebot für Persönlichkeiten mit hohem gesellschaftlichem Rang', 'An early offer for personalities of high social rank'],
  // Einsteiger
  ['Tippe auf „Beste Wahl“ – so steckst du deine Erfahrung in das Talent, das zu deiner Tätigkeit passt.', 'Tap “Best choice” – this puts your experience into the talent that fits your activity.'],
  ['Tippe bei der Kleidung auf „Kaufen“ – ein Sonntagsanzug macht schon einen guten Eindruck.', 'Tap “Buy” on clothing – a Sunday suit already makes a good impression.'],
  ['Hier siehst du, woraus sich dein Rang zusammensetzt und was dir zum nächsten fehlt.', 'Here you see what your rank is made of and what you are missing for the next one.'],
  ['Dein Charakterblatt: Hier steckst du Erfahrung in Talente, wählst Kleidung, Uhr und Fahrzeug und siehst deinen gesellschaftlichen Rang. Alles ist freiwillig und wirkt nur ein wenig.', 'Your character sheet: here you put experience into talents, choose clothing, watch and vehicle and see your social rank. Everything is voluntary and has only a small effect.'],
  ['Zeig mir die Erfahrung', 'Show me the experience'],
]);

module.exports = { exact, patterns };
