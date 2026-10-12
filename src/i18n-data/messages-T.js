'use strict';
/**
 * Englische Texte (Spielserver): Charakterblatt – Erfahrungspunkte, Ausstattung, gesellschaftlicher Rang: Meldungen, Fehler, Ansehen-Texte, Aufgaben, Hinweise, Tagesblatt, Katalog.
 * Paare [deutsch, englisch]; ${…} sind Platzhalter (Namen und Zahlen), der Ausdruck muss wörtlich dem Quelltext entsprechen.
 * Der Katalog (Plätze, Stufen, Ränge, Quellen) steht in src/game/character-defaults.js; die Paare für seine Standardtexte entstehen hier aus den Standardwerten.
 */
const D = require('../game/character-defaults');

// Namen nach Epoche (deutscher Name → englisch) und Texte
const NAMES = {
  'Sonntagsanzug': 'Sunday suit', 'Business-Outfit': 'Business outfit', 'Maßanzug vom Schneider': 'Tailored suit', 'Marken-Anzug': 'Designer suit', 'Feine Garderobe': 'Fine wardrobe', 'Designer-Garderobe': 'Designer wardrobe',
  'Armbanduhr': 'Wristwatch', 'Markenuhr': 'Branded watch', 'Luxusuhr': 'Luxury watch', 'Silberschmuck': 'Silver jewellery', 'Goldschmuck': 'Gold jewellery', 'Juwelen': 'Jewels',
  'Fahrrad': 'Bicycle', 'E-Bike': 'E-bike', 'Motorroller': 'Scooter', 'Kleinwagen': 'Small car', 'Elektro-Kleinwagen': 'Electric small car', 'Limousine': 'Limousine', 'Elektro-Limousine': 'Electric limousine',
  'Aktentasche': 'Briefcase', 'Schreibmaschine': 'Typewriter', 'Personal Computer': 'Personal computer', 'Laptop': 'Laptop', 'Büroausstattung': 'Office equipment', 'Mobiltelefon und Laptop': 'Mobile phone and laptop', 'Smartphone und Laptop': 'Smartphone and laptop',
  'Friseur und Pflege': 'Hairdresser and grooming', 'Kosmetik und Wellness': 'Cosmetics and wellness', 'Wachdienst für das Zuhause': 'Security patrol for your home', 'Alarmanlage mit Wachdienst': 'Alarm system with security patrol', 'Personenschutz': 'Close protection', 'Personenschutz und Hausüberwachung': 'Close protection and home surveillance',
  'Alltagskleidung': 'Everyday clothes',
};
const SLOT_EN = {
  kleidung: { name: 'Clothing', what: 'Well-kept clothes make an impression: in pay talks, applications, in court and at elections.', texts: ['Neat and tidy – the first good impression.', 'Well cut and finely made.', 'Made to measure and exclusive – it shows that you belong.'] },
  uhr: { name: 'Watch', what: 'A good watch lasts a lifetime and can be inherited.', texts: ['Reliable and plain.', 'A well-known maker, fine movement.', 'A status symbol that keeps its value.'] },
  schmuck: { name: 'Jewellery', what: 'Rings and jewellery: an heirloom passed down through generations. (Wedding rings come with partnership.)', texts: ['A fine chain or a silver ring.', 'Gold you enjoy wearing – and keep for long.', 'Gemstones and pearls from a jeweller.'] },
  fahrzeug: { name: 'Vehicle', what: 'A vehicle of your own is convenient and shows prosperity. It is purely private (the freight vehicles of your businesses are something else) and costs tax, insurance and fuel on an ongoing basis.', texts: ['Cheap, healthy and always with you.', 'Mobile across the whole region.', 'Comfortable, prestigious and fast.'] },
  mittel: { name: 'Work equipment', what: 'Briefcase, typewriter, computer: good work equipment makes a professional impression.', texts: ['Documents always at hand.', 'Letters, offers and invoices in clean form.', 'Always reachable and perfectly organised.'] },
  pflege: { name: 'Grooming', what: 'Hairdresser, cosmetics and wellness. An ongoing service you can end at any time.', texts: ['Regularly at the hairdresser.', 'Regular grooming and relaxation.'] },
  schutz: { name: 'Security service', what: 'A service, not an object: a security patrol watches over your home, later close protection accompanies you. Both lower the risk of burglary. (There are no weapons in the game.)', texts: ['A security patrol checks on things at night.', 'A security company protects you and your home.'] },
};
const RANK_EN = [
  ['Resident', 'You are new in town and building something up.'], ['Citizen', 'You have settled in and are known as a reliable neighbour.'], ['Established citizen', 'You have a good reputation and a secure living.'],
  ['Local celebrity', 'People in your town know you – and listen to you.'], ['Prominent figure', 'A name with weight: invitations and advantages come by themselves.'], ['Society figure', 'You belong to the influential families of the country.'], ['Pinnacle of society', 'Few reach this rank: you are an institution.'],
];
const SRC_EN = {
  arbeit: ['Work experience', 'Anyone who works – in a trade or in their own business – gains experience in the field.'],
  handel: ['Negotiating and trading', 'Pay talks, supply contracts and trade routes train negotiating.'],
  fuehrung: ['Leading people', 'Leading, praising and developing a team – and holding a political office.'],
  lernen: ['Learning', 'Study, training and further education cost time and bring experience.'],
  begegnung: ['Encounters', 'Clubs, parties, dates and gifts: winning people over.'],
  sport: ['Sports', 'Anyone active in a sports club stays fit.'],
};
const catalog = [];
const seen = new Set(); const add = (de, en) => { if (typeof de === 'string' && de && !seen.has(de)) { seen.add(de); catalog.push([de, en]); } };
for (const [k, en] of Object.entries(SLOT_EN)) {
  const S = D.gear.items[k]; add(S.name, en.name); add(S.what, en.what);
  S.levels.forEach((L, i) => { add(L.text, en.texts[i]); for (const [, nm] of L.names) add(nm, NAMES[nm] || nm); });
}
D.rank.ranks.forEach((r, i) => { add(r.name, RANK_EN[i][0]); add(r.text, RANK_EN[i][1]); });
for (const [k, d] of Object.entries(D.xp.sources)) { add(d.label, SRC_EN[k][0]); add(d.text, SRC_EN[k][1]); }
add('Alltagskleidung', 'Everyday clothes');

const pairs = [
  ...catalog,
  ['schlicht', 'plain'], ['gepflegt', 'well-groomed'], ['repräsentativ', 'prestigious'], ['glanzvoll', 'glamorous'],
  // ---- Rang
  ['Neuer Rang: ${nm}', 'New rank: ${nm}'],
  ['Dein gesellschaftlicher Rang ist jetzt „${nm}“. ${rankLevels()[to - 1].text}', 'Your social rank is now “${nm}”. ${rankLevels()[to - 1].text}'],
  ['Ansehen, Vermögen, Titel und ein gepflegtes Auftreten heben deinen Rang.', 'Reputation, wealth, titles and a well-kept appearance raise your rank.'],
  ['Ein höherer Rang bringt weiche Vorteile, etwa günstigere Immobilien und mehr Beziehungen – gesperrt wird dadurch nichts.', 'A higher rank brings soft advantages, such as cheaper property and more connections – nothing is ever locked because of it.'],
  ['Im Charakterblatt siehst du, was dir noch zum nächsten Rang fehlt.', 'On the character sheet you see what is still missing for the next rank.'],
  ['${state.person.first} steigt zum Rang „${nm}“ auf.', '${state.person.first} rises to the rank of “${nm}”.'],
  ['Immobilien günstiger kaufen', 'Buy property more cheaply'], ['Wöchentliches Vorab-Angebot einer Premium-Wohnlage', 'Weekly early offer of a prime residential location'],
  ['Beziehungen bei Bewerbungen', 'Connections in job applications'], ['Günstigere Kandidatur', 'Cheaper candidacy'], ['Zusätzliche Vereinsplätze', 'Additional club places'],
  // ---- Dienstleistungen beenden
  ['Dienstleistungen beendet', 'Services ended'],
  ['Dein Geld reichte nicht mehr für Pflege und Sicherheitsdienst. Die Verträge wurden beendet.', 'Your money no longer covered grooming and security service. The contracts were ended.'],
  ['Dienstleistungen kosten jeden Tag etwas.', 'Services cost something every day.'],
  ['Wenn das Geld knapp wird, enden sie automatisch – du bekommst keine Schulden dadurch.', 'When money gets tight they end automatically – you do not run into debt because of them.'],
  ['Du kannst sie im Charakterblatt jederzeit wieder buchen.', 'You can book them again on the character sheet at any time.'],
  // ---- Erfahrung: Prüfungen
  ['Dieses Talent gibt es nicht.', 'There is no such talent.'], ['Talente und Erfahrung sind gerade ausgeschaltet.', 'Talents and experience are switched off at the moment.'],
  ['Mehr gibt die Anlage in diesem Talent nicht her.', 'The aptitude allows no more in this talent.'],
  ['Das Talent braucht noch ${waitLeft} Tage Pause.', 'The talent needs a break of ${waitLeft} more days.'],
  ['Mehr als eine begrenzte Zahl von Steigerungen pro Jahr ist nicht möglich.', 'Only a limited number of increases per year is possible.'],
  ['Dafür fehlt Erfahrung.', 'You lack the experience for that.'],
  // ---- Aktionen
  ['Das Charakterblatt ist gerade ausgeschaltet.', 'The character sheet is switched off at the moment.'], ['Unbekannter Platz.', 'Unknown slot.'], ['Talente sind gerade ausgeschaltet.', 'Talents are switched off at the moment.'],
  ['Es lässt sich gerade nichts verteilen.', 'There is nothing to distribute at the moment.'],
  ['${state.person.first} entwickelt sich weiter (${done.length} Talente).', '${state.person.first} keeps developing (${done.length} talents).'],
  ['Erfahrung verteilt: 1 Talent gesteigert (${cost} EP).', 'Experience distributed: 1 talent increased (${cost} EP).'],
  ['Erfahrung verteilt: ${done.length} Talente gesteigert (${cost} EP).', 'Experience distributed: ${done.length} talents increased (${cost} EP).'],
  ['${lbl} steigt auf ${r.v} (${r.cost} EP).', '${lbl} rises to ${r.v} (${r.cost} EP).'],
  ['Erfahrung wird ab jetzt automatisch auf die Talente deiner Tätigkeit verteilt.', 'From now on experience is distributed automatically to the talents of your activity.'],
  ['Du verteilst deine Erfahrung selbst.', 'You distribute your experience yourself.'],
  ['Das ist eine Dienstleistung, kein Gegenstand.', 'That is a service, not an item.'], ['Bitte eine Stufe von 1 bis 3 wählen.', 'Please choose a level from 1 to 3.'],
  ['${CH.levelName(slot, lv, year)} gibt es erst ab ${CH.levelDef(slot, lv).from}.', '${CH.levelName(slot, lv, year)} is not available until ${CH.levelDef(slot, lv).from}.'],
  ['Das hast du schon.', 'You already have that.'],
  ['Gewechselt zu ${nm} (${fm}, altes Stück angerechnet: ${money(world, state, back)}).', 'Changed to ${nm} (${fm}, old piece traded in: ${money(world, state, back)}).'],
  ['Gekauft: ${nm} (${fm}).', 'Bought: ${nm} (${fm}).'],
  ['${state.person.first} kauft: ${nm}.', '${state.person.first} buys: ${nm}.'],
  ['Eine Dienstleistung lässt sich nur beenden.', 'A service can only be ended.'], ['Dafür hast du kein eigenes Stück.', 'You have no piece of your own for that.'],
  ['${nm} verkauft (${money(world, state, v)}).', '${nm} sold (${money(world, state, v)}).'],
  ['Dienstleistungen nutzen sich nicht ab.', 'Services do not wear out.'], ['Das Stück ist noch in gutem Zustand.', 'The piece is still in good condition.'],
  ['${nm} aufgearbeitet (${money(world, state, cost)}).', '${nm} refurbished (${money(world, state, cost)}).'],
  ['Das ist ein Gegenstand, keine Dienstleistung.', 'That is an item, not a service.'], ['Bitte eine Stufe von 0 bis 2 wählen.', 'Please choose a level from 0 to 2.'],
  ['Diese Dienstleistung ist nicht gebucht.', 'This service is not booked.'], ['${CH.levelName(slot, was, year)} beendet.', '${CH.levelName(slot, was, year)} ended.'],
  ['Das hast du schon gebucht.', 'You have already booked that.'],
  ['Dafür reicht dein Geld nicht auf Dauer – eine Dienstleistung sollte für mindestens 30 Tage bezahlbar sein.', 'Your money will not last for that – a service should be affordable for at least 30 days.'],
  ['${nm} gebucht (${money(world, state, dc)} pro Tag).', '${nm} booked (${money(world, state, dc)} per day).'],
  ['Zu viele Aktionen in kurzer Zeit – bitte kurz warten.', 'Too many actions in a short time – please wait a moment.'],
  // ---- Aufgaben, Freischaltung, Hinweise
  ['Verteile deine ersten Erfahrungspunkte', 'Distribute your first experience points'],
  ['Wer arbeitet, führt, lernt oder Menschen trifft, sammelt Erfahrung. Im Charakterblatt steckst du sie in ein Talent – das macht dich dauerhaft besser. Ein paar Punkte hast du schon zum Start.', 'Anyone who works, leads, learns or meets people gains experience. On the character sheet you put it into a talent – that makes you better for good. You already have a few points to start with.'],
  ['Gönn dir ein gutes Auftreten', 'Treat yourself to a good appearance'],
  ['Kleidung, Uhr und Fahrzeug zeigen, wer du bist: Sie helfen ein wenig bei Gehaltsgesprächen, Wahlen und deinem Ansehen und heben deinen gesellschaftlichen Rang. Beginne mit einem Sonntagsanzug.', 'Clothing, watch and vehicle show who you are: they help a little in pay talks, elections and your reputation and raise your social rank. Start with a Sunday suit.'],
  ['Steige zum Bürger auf', 'Rise to citizen'],
  ['Dein gesellschaftlicher Rang wächst mit Ansehen, Vermögen, Titeln und Auftreten. Höhere Ränge bringen weiche Vorteile wie günstigere Immobilien – gesperrt wird dadurch nie etwas.', 'Your social rank grows with reputation, wealth, titles and appearance. Higher ranks bring soft advantages such as cheaper property – nothing is ever locked because of it.'],
  ['Charakterblatt', 'Character sheet'],
  ['Du hast ${ep} Erfahrungspunkte – verteile sie', 'You have ${ep} experience points – distribute them'],
  ['Erfahrung bleibt ungenutzt liegen, bis du sie in ein Talent steckst. Die Beste Wahl nimmt das Talent, das zu deiner Tätigkeit passt.', 'Experience stays unused until you put it into a talent. The best choice takes the talent that fits your activity.'],
  ['Beste Wahl verteilen', 'Distribute (best choice)'],
  ['Ein gepflegtes Auftreten zahlt sich aus', 'A well-kept appearance pays off'],
  ['Ein ${cn1} kostet nur ${pr1} und hilft bei Gehaltsgesprächen, Bewerbungen und Wahlen ein wenig.', 'A ${cn1} costs only ${pr1} and helps a little in pay talks, applications and elections.'],
  ['Zum Charakterblatt', 'To the character sheet'],
  ['${worn.name_cur} ist abgenutzt', '${worn.name_cur} is worn out'],
  ['Abgenutzte Stücke wirken schwächer. Aufarbeiten kostet nur einen Teil des Neupreises.', 'Worn pieces have less effect. Refurbishing costs only part of the new price.'],
  ['Aufarbeiten (${dm(worn.repair, cur)})', 'Refurbish (${dm(worn.repair, cur)})'],
  // ---- Tagesblatt und Protokoll
  ['Gesellschaft', 'Society'], ['${who} steigt in ${where} zum Rang „${note}“ auf.', '${who} rises to the rank of “${note}” in ${where}.'],
];
module.exports = pairs;
