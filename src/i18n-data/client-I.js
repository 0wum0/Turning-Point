'use strict';
/** Englische Texte: Einsteiger-Erlebnis (Willkommen, Aufgabenreihe, „Was jetzt?“, Freischaltungen, Glossar). Muster zuerst, dann exakte Texte. */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\{n\}/g, '(\\d+)').replace(/\{\}/g, '(.+?)') + '$', en]);

/* ---- Willkommen ---- */
T('Willkommen im Jahr {n}', 'Welcome to the year $1');
T('Du bist {n} Jahre alt, auf dich allein gestellt und hast {}, einen erlernten Beruf – und kein Zuhause.', 'You are $1 years old, on your own, and have $2, a trade you have learned – and no home.');
T('Das Spiel läuft in Echtzeit: {} Stunden in der echten Welt sind ein Jahr im Spiel. Ein Spieltag dauert etwa {} Minuten.', 'The game runs in real time: $1 hours in the real world are one year in the game. A game day lasts about $2 minutes.');
T('Du hast gerade {} EFS.', 'You currently have $1 EFS.');
T('Baue Schritt für Schritt ein Leben auf – mit Arbeit, Wohnung, Familie und vielleicht einer eigenen Firma. Gib dein Lebenswerk an deine Kinder weiter. So wächst über Generationen ein Vermächtnis, bis ins Jahr {n}.', 'Build a life step by step – with a job, a home, a family and maybe a company of your own. Pass your life’s work on to your children. Over generations a legacy grows, up to the year $1.');
X([
  ['Dein Ziel:', 'Your goal:'],
  ['Die Uhr läuft von selbst', 'The clock runs by itself'],
  ['Du musst nichts abwarten oder drücken: Lohn, Miete und Alltag werden automatisch verrechnet – auch dann, wenn du das Spiel schließt.', 'You do not have to wait or press anything: wages, rent and everyday life are settled automatically – even when you close the game.'],
  ['EFS', 'EFS'],
  ['sind dein Vorrat an Spieltagen (1 EFS = 1 Tag). Du kannst sie einsetzen, um die Zeit zusätzlich vorzuspulen – aber nur, wenn du es willst.', 'are your stock of game days (1 EFS = 1 day). You can spend them to fast-forward time even further – but only if you want to.'],
  ['Vier Anzeigen halten dich am Leben', 'Four gauges keep you alive'],
  ['Kühlschrank', 'Fridge'], ['Wohlbefinden', 'Well-being'], ['Erholung', 'Rest'], ['Gesundheit', 'Health'],
  ['– dein Essensvorrat. Ist er leer, hast du Hunger.', '– your food supply. When it is empty, you are hungry.'],
  ['– deine Stimmung. Gutes Essen, Arbeit und ein Zuhause heben sie.', '– your mood. Good food, work and a home lift it.'],
  ['– wie ausgeruht du bist. Auf der Straße schläfst du schlecht, in einer Wohnung gut.', '– how rested you are. You sleep badly on the street and well in a flat.'],
  ['– fällt sie auf null, stirbt dein Charakter. Alle anderen Anzeigen wirken auf sie.', '– if it falls to zero, your character dies. All the other gauges affect it.'],
  ['Du findest sie oben im Kopfbereich. Ein Klick darauf erklärt sie genauer.', 'You will find them at the top. Click one to see a closer explanation.'],
  ['Wo klicke ich?', 'Where do I click?'],
  ['Zeitung', 'Newspaper'], ['Haushalt', 'Household'], ['Übersicht', 'Overview'],
  ['– Hier stehen Arbeit, Wohnungen und Neuigkeiten. Dein erster Weg.', '– Jobs, flats and news are listed here. Your first stop.'],
  ['– Hier kaufst du Essen für den Kühlschrank.', '– Buy food for your fridge here.'],
  ['– Oben stehen „Was jetzt?“ und „Deine ersten Schritte“. Sie zeigen dir immer, was als Nächstes sinnvoll ist, und führen dich mit einem Klick dorthin.', '– At the top you will find “What now?” and “Your first steps”. They always show what makes sense next and take you there with one click.'],
  ['Alles andere schaltet sich nach und nach frei. Über den Hilfe-Knopf „?“ oben rechts öffnest du diese Einführung jederzeit wieder.', 'Everything else unlocks bit by bit. The help button “?” at the top right reopens this introduction at any time.'],
  ['Überspringen', 'Skip'], ['Schließen', 'Close'], ['Weiter', 'Next'], ['Zurück', 'Back'], ['Los geht’s', 'Let’s go'],
  ['Willkommen', 'Welcome'],
  ['Hilfe', 'Help'], ['Hilfe und Einführung', 'Help and introduction'],
  ['Einführung ansehen', 'Watch the introduction'],
  ['Die vier Folien zum Spielstart – in einer Minute gelesen.', 'The four slides for getting started – read in a minute.'],
]);

module.exports = { exact, patterns };
