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

/* ---- Aufgabenkarte, Berater, Freischaltung, Hilfe ---- */
T('Schritt geschafft: {}', 'Step done: $1');
X([
  ['Deine ersten Schritte', 'Your first steps'], ['Alle anzeigen', 'Show all'], ['Zeig mir’s', 'Show me'], ['Als Nächstes:', 'Next up:'],
  ['Aufklappen', 'Expand'], ['Einklappen', 'Collapse'], ['Belohnung, einmalig', 'Reward, one time only'],
  ['Alle Einstiegsschritte geschafft – du kennst jetzt die wichtigsten Bereiche. Der Rest ist dein Lebenswerk.', 'All introductory steps done – you now know the most important areas. The rest is your life’s work.'],
  ['Was jetzt?', 'What now?'], ['Danach:', 'After that:'],
  ['Alle Funktionen anzeigen', 'Show all features'],
  ['Nichts geht verloren: Der Bereich öffnet sich von selbst, sobald du so weit bist.', 'Nothing is lost: this area opens by itself as soon as you are ready.'],
  ['Zeigt auch Bereiche, die sich sonst erst nach und nach freischalten.', 'Also shows areas that would otherwise unlock bit by bit.'],
  ['Glossar', 'Glossary'], ['Fachwörter wie EFS, Börse oder Order in einfachen Worten.', 'Technical terms such as EFS, exchange or order in plain words.'],
  ['Seiten-Hinweise wieder einblenden', 'Show page hints again'], ['Die kurze Erklärung „Worum geht es hier?“ oben auf jeder Seite.', 'The short “What is this about?” explanation at the top of every page.'],
  ['Die Hinweise sind wieder da.', 'The hints are back.'],
  ['Alle Begriffe', 'All terms'], ['Verstanden', 'Got it'], ['Suchen', 'Search'], ['Wort suchen …', 'Search for a word …'],
  ['Wichtige Wörter in einfachen Worten. Tippe in den Texten auf unterstrichene Wörter, um sie direkt zu erklären.', 'Important words in plain language. Tap underlined words in the texts to get an instant explanation.'],
  /* Sprechblasen „Zeig mir’s“ */
  ['Tippe auf „Zeitung“.', 'Tap “Newspaper”.'], ['Wähle eine Qualität und kaufe Essen.', 'Pick a quality and buy food.'],
  ['Such dir eine Unterkunft aus und tippe auf „Beziehen“.', 'Pick a place to stay and tap “Move in”.'],
  ['Such dir eine Stelle aus und bewirb dich.', 'Pick a job and apply.'],
  ['Triff jemanden – ob es funkt, hängt von deiner Lage ab.', 'Meet someone – whether it clicks depends on your situation.'],
  ['Such dir einen Betrieb aus, der zu deinem Beruf passt.', 'Pick a business that fits your trade.'],
  ['Hier läuft die Zeit. Der Lohn kommt automatisch, sobald ein Tag vergeht.', 'This is where time runs. Your wage arrives automatically as soon as a day passes.'],
  ['Das ist dein Geld. Spare es auf!', 'This is your money. Save it up!'],
  ['Hier kannst du einen weiteren Beruf lernen.', 'Here you can learn another trade.'],
  ['Tippe auf „+“, um jemanden einzustellen.', 'Tap “+” to hire someone.'], ['Tippe auf „Vermieten“.', 'Tap “Let”.'],
  ['Im Stadtverzeichnis kannst du Eigentümern ein Angebot machen.', 'In the city directory you can make owners an offer.'],
  ['Wähle jemanden oder kandidiere selbst.', 'Vote for someone or run yourself.'],
  ['Das ist dein nächster sinnvoller Schritt.', 'This is your next sensible step.'], ['Der wichtigste Knopf dieser Seite.', 'The most important button on this page.'],
  ['Wähle oben einen Reiter: Stellen, Wohnungen, Kontakte, Betriebe.', 'Pick a tab at the top: jobs, flats, contacts, businesses.'], ['Wähle oben einen Bereich.', 'Pick an area at the top.'],
  /* Seiten-Einführungen */
  ['Worum geht es hier?', 'What is this about?'], ['Hinweis ausblenden', 'Hide hint'], ['Ausblenden', 'Hide'],
  ['Deine Zentrale: Oben steht, was jetzt wichtig ist. Darunter findest du Geld, Zeit, Postfach und deinen Fortschritt.', 'Your headquarters: the top shows what matters now. Below you will find money, time, mailbox and your progress.'],
  ['Zeig mir den nächsten Schritt', 'Show me the next step'],
  ['Die Zeitung zeigt Stellen, Wohnungen, mögliche Partner und Betriebe zum Kauf. Wähle oben einen Reiter und tippe bei einem Angebot auf den Knopf.', 'The newspaper lists jobs, flats, potential partners and businesses for sale. Pick a tab at the top and tap the button on an offer.'],
  ['Zeig mir die Reiter', 'Show me the tabs'],
  ['Die Karte zeigt ganz Deutschland. Hier ziehst du in eine andere Stadt um und sammelst goldene EFS-Funken (Spieltage).', 'The map shows all of Germany. Move to another city here and collect golden EFS sparks (game days).'],
  ['Zeig mir den wichtigsten Knopf', 'Show me the most important button'],
  ['In der Stadtansicht betrittst du Gebäude. Dort warten Aufgaben, die Geld oder Erfahrung bringen.', 'In the city view you enter buildings. Tasks that earn money or experience wait there.'],
  ['Hier siehst du deinen Beruf, deine Erfahrung und Weiterbildungen. Mehr Erfahrung heißt mehr Lohn.', 'Here you see your job, your experience and further training. More experience means higher pay.'],
  ['Hier führst du deine Firmen: Mitarbeiter einstellen, Betriebe ausbauen und Gewinn abholen.', 'Here you run your companies: hire staff, expand businesses and collect profit.'],
  ['Hier kandidierst du für Ämter und sammelst Einfluss. Lotto und Spielbank sind nur ein Zeitvertreib.', 'Here you run for office and gather influence. Lottery and casino are just a pastime.'],
  ['Hier triffst du die anderen echten Spieler: Rangliste, Chat, Briefe, Freunde, Markt, Börse und Wahlen.', 'Here you meet the other real players: leaderboard, chat, letters, friends, market, exchange and elections.'],
  ['Zeig mir die Bereiche', 'Show me the areas'],
  ['Dein Zuhause entscheidet über Erholung und Gesundheit. Hier siehst du, wo du wohnst, und kannst Immobilien kaufen oder vermieten.', 'Your home decides your rest and health. Here you see where you live and can buy or let property.'],
  ['Hier füllst du den Kühlschrank, schließt Versicherungen ab und sorgst für deine Gesundheit.', 'Here you fill the fridge, take out insurance and look after your health.'],
  ['Zeig mir, wo ich Essen kaufe', 'Show me where to buy food'],
  ['Partner, Kinder und Erben: Sie sind die Zukunft deines Lebenswerks.', 'Partner, children and heirs: they are the future of your life’s work.'],
  ['Dein Stammbaum und die Geschichte deiner Familie über alle Generationen. Hier gibt es nichts zu erledigen.', 'Your family tree and the story of your family across all generations. Nothing to do here.'],
  ['Freiwillig: Coins und EFS-Pakete. Das Spiel ist ohne Kauf komplett spielbar.', 'Optional: coins and EFS packs. The game is fully playable without buying anything.'],
  /* Karten und Hinweise in bestehenden Seiten */
  ['– dein Vorrat an Spieltagen', '– your stock of game days'], ['gesamt:', 'total:'], ['Vermögen', 'Net worth'],
  ['Anteile', 'Shares'],
  ['Hier kaufst und verkaufst du', 'Here you buy and sell'], ['an Betrieben anderer Spieler. Der Kurs ist der aktuelle Preis eines Anteils, „fair“ der rechnerische Wert.', 'in companies owned by other players. The price is the current price of one share; “fair” is the calculated value.'],
  ['Beträge sind auf den', 'Amounts are converted to the'], ['Wert von 1945', 'value of 1945'], ['umgerechnet, damit alle Zeiten fair vergleichbar sind.', 'so that all eras can be compared fairly.'],
  /* Konto */
  ['Anzeige im Spiel', 'Display in the game'],
  ['Standardmäßig schalten sich fortgeschrittene Bereiche (Unternehmen, Gesellschaft, Börse, Wahlen, Markt, Bank) nach und nach frei, damit der Einstieg übersichtlich bleibt. Mit diesem Schalter ist von Anfang an alles sichtbar. Es wird nichts entfernt oder gesperrt.', 'By default, advanced areas (businesses, society, exchange, elections, market, bank) unlock bit by bit to keep the start clear. With this switch everything is visible from the start. Nothing is removed or blocked.'],
]);

module.exports = { exact, patterns };

/* ---- Glossar: deutsche Texte werden aus public/js/game/glossary.js gelesen, die englischen stehen hier in gleicher Reihenfolge ---- */
const GLOSSARY_EN = [
  ['Game days in stock', 'One EFS is one game day in stock (1 EFS = 1 day). Time runs by itself; with EFS you can fast-forward it further. This is optional.'],
  ['Game day', 'The game runs faster than real life: 24 real hours are one game year, and one game day lasts about 4 minutes.'],
  ['Coins', 'A special currency for moving and extras. You earn it for children and optional ads. It stays with you across generations.'],
  ['Fridge', 'Your food supply. When it is empty you are hungry, and mood and health drop. You refill it under “Household”.'],
  ['Well-being', 'Your mood. Good food, a job, a home and time with your family lift it.'],
  ['Rest', 'How rested you are. A proper home rests you better than the street; work and children cost energy.'],
  ['Health', 'If it falls to zero, your character dies. Food, sleep and a good mood strengthen it.'],
  ['Net worth', 'Everything you own minus debts: cash, houses and companies.'],
  ['Value of 1945 (purchasing power)', 'Prices rise over the years. To compare 1960 and 2040 fairly, leaderboards convert amounts to the purchasing power of 1945. This is called inflation-adjusted.'],
  ['Influence', 'Your standing in politics. It grows with offices and raises your election chances. It stays with you across all lives.'],
  ['Qualification', 'A trade you have learned. It decides which companies you may run and which jobs you can get.'],
  ['Maintenance', 'Repairs and upkeep of a house. Good condition keeps its value up and brings more rent.'],
  ['Insurance', 'It replaces damage from fire, storm or burglary. It does not cover the building’s downtime.'],
  ['Yield', 'How many percent of the value you earn per year, for example through rent.'],
  ['Loan', 'Money borrowed from the bank. You repay a daily instalment with interest. If you cannot pay, you risk bankruptcy.'],
  ['Inheritance and compulsory share', 'When your character dies, an adult child takes over. The estate is shared fairly among all children (compulsory share). Without an adult child the line ends.'],
  ['Competition', 'Other businesses of the same kind in the city share the customers. The more there are, the less is left for each.'],
  ['Rivalry and sabotage', 'Players who take part can spy on other players’ companies, undercut them, poach staff or sabotage them – with risk and punishment.'],
  ['Market', 'Here you make offers to other players for houses and companies, or bid at auctions.'],
  ['Bid', 'The price you would pay in an auction or an offer.'],
  ['Exchange', 'Here you trade shares in other players’ companies. Profit comes from rising prices and payouts.'],
  ['Share', 'A small piece of a company. Whoever holds shares receives part of the profit.'],
  ['Order', 'Your instruction to buy or sell shares. If it is not filled at once, it stays open until someone matches.'],
  ['Limit (highest or lowest price)', 'The price you accept at most when buying, or at least when selling.'],
  ['IPO (going public)', 'Your company is split into 1,000 shares and part of them is offered for sale. That brings in money, but you keep the majority.'],
  ['Payout (dividend)', 'The part of the profit a company pays out daily to all shareholders.'],
  ['Free float', 'The part of the shares that is sold to other players.'],
  ['Escrow', 'The money is held safely until a deal is complete. That way nobody can cheat.'],
  ['Legacy', 'What your family builds over many generations. The goal of the game is a strong legacy by the year 2100.'],
];
try {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../public/js/game/glossary.js'), 'utf8');
  const rows = [...src.matchAll(/^  \['([^']+)', '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'\],$/gm)];
  rows.forEach((m, i) => { const en = GLOSSARY_EN[i]; if (!en) return; exact[m[2].replace(/\\'/g, "'")] = en[0]; exact[m[3].replace(/\\'/g, "'")] = en[1]; });
} catch (_) { /* Quelle fehlt: Glossar bleibt deutsch */ }
module.exports.GLOSSARY_EN_COUNT = GLOSSARY_EN.length;

