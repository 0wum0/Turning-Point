'use strict';
/**
 * Texte für Bots: Spitznamen, Chat, Briefe. Bewusst kurz und alltäglich gehalten.
 *
 * Aufbau: Jede Sprache hat Textbänke nach Tageszeit, Epoche (Spieljahr), Stadt, Beruf und Alltagsthemen.
 * `pickFresh` wählt Zeilen mit Wiederholungsschutz: Eine Zeile kommt weder bei demselben Bot innerhalb von
 * BOT_WINDOW Äußerungen noch bei allen Bots zusammen innerhalb von GLOBAL_WINDOW Äußerungen noch einmal vor
 * (ist eine Bank kleiner als das Fenster, wird die am längsten nicht benutzte Zeile genommen).
 * Auf direkte, ernst gemeinte Fragen („bist du ein Bot?“) antworten Bots ehrlich.
 */
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;

const HANDLES = ['Mia', 'Leon', 'Anna', 'Paul', 'Lena', 'Jonas', 'Emma', 'Felix', 'Laura', 'Max', 'Sophie', 'Tim', 'Nina', 'Ben', 'Julia', 'Lukas', 'Clara', 'Jan', 'Hanna', 'Niklas', 'Marie', 'David', 'Lisa', 'Tom', 'Katrin', 'Stefan', 'Petra', 'Jürgen', 'Heike', 'Uwe', 'Sabine', 'Olaf', 'Birgit', 'Kai', 'Tanja', 'Ralf', 'Frieda', 'Henning', 'Merle', 'Torben', 'Ida', 'Carsten', 'Nele', 'Matthias', 'Greta', 'Bernd', 'Ute', 'Dieter', 'Gisela', 'Rolf', 'Monika', 'Klaus', 'Renate', 'Horst', 'Elke', 'Wolfgang', 'Ingrid', 'Anja', 'Sven', 'Mareike', 'Jule', 'Finn', 'Lotta', 'Malte', 'Svenja', 'Dirk', 'Corinna', 'Arne', 'Wiebke', 'Hannes', 'Rike'];
const TAILS = ['', '', '', '_', '88', '91', '07', '1987', '1992', '2001', '_k', '.m', 'HH', 'B', 'xx', '_77', '23', '4711', 'S', '_official', 'Fan', '_de', '64', '1975', '99', '_hh', 'K', '.l', '_x', '2010', '55', 'M'];
const WORDS = ['Zocker', 'Daddler', 'Bäcker', 'Wirt', 'Tüftler', 'Nordlicht', 'Rheinländer', 'Schwabe', 'Pottkind', 'Küstenkind', 'Spieler', 'Fuchs', 'Bär', 'Kapitän', 'Sachse', 'Franke', 'Waterkant', 'Hanseat', 'Bastler', 'Segler', 'Wanderer', 'Eule', 'Dachs', 'Rabe', 'Lotse', 'Kutter', 'Nachtigall', 'Grübler', 'Hobbyhändler', 'Stadtkind'];

function nickname(first) {
  const base = chance(0.25) ? pick(WORDS) : (chance(0.55) ? first : pick(HANDLES));
  let n = base + pick(TAILS);
  if (chance(0.2)) n = n.toLowerCase();
  if (chance(0.12)) n = `${pick(HANDLES)}_${pick(WORDS)}`;
  return n.replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 22) || `${first}${Math.floor(Math.random() * 99)}`;
}

const BIO_DE = ['Baue mir hier was auf.', 'Immer für einen Plausch zu haben.', 'Langsam, aber stetig.', 'Erst Arbeit, dann Vergnügen.', 'Sammle Häuser und Erinnerungen.', 'Neu hier, aber schon dabei.', 'Familie geht vor.', 'Mal sehen, wie weit ich komme.', 'Kaffee, Kuchen, Kurs halten.', 'Lieber solide als spektakulär.', 'Gute Nachbarschaft ist mir wichtig.', 'Handwerk hat goldenen Boden.', 'Ich lese jeden Morgen die Zeitung.', 'Spare für das große Ziel.', 'Ruhig, freundlich, gern unterwegs.', 'Lieber einmal mehr nachgerechnet.', 'Erst denken, dann kaufen … meistens.', 'Auf der Suche nach dem besten Angebot.', 'Hier wird gearbeitet und gelacht.', 'Jahr für Jahr ein Stückchen weiter.', 'Mein Rezept: Geduld.', 'Nebenbei Hobbyökonom.', 'Wer rastet, der rostet.', 'Immer ein offenes Ohr.', ''];
const BIO_EN = ['Building something here.', 'Always up for a chat.', 'Slow but steady.', 'Work first, fun later.', 'Collecting houses and memories.', 'New here, but already hooked.', 'Family comes first.', 'Let’s see how far I get.', 'Solid beats spectacular.', 'Good neighbours matter to me.', 'Reading the paper every morning.', 'Saving up for the big goal.', 'Quiet, friendly, always on the move.', 'Patience is my recipe.', 'Hobby economist on the side.', 'Always an open ear.'];
const bio = (lang) => pick(lang === 'en' ? BIO_EN : BIO_DE).trim() || null;

/* ---------- Stil: Kleinschreibung, Tippfehler, Emoji ---------- */
function style(P, text) {
  let t = text;
  if (P.lower) t = t.charAt(0).toLowerCase() + t.slice(1);
  if (P.tone === 'knapp') t = t.replace(/[.!]$/, '');
  if (P.typo && t.length > 12 && chance(0.25)) { const i = 3 + Math.floor(Math.random() * (t.length - 6)); if (/[a-zäöü]/i.test(t[i]) && /[a-zäöü]/i.test(t[i + 1])) t = t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2); }
  if (P.emoji && chance(0.35)) t += ` ${pick(['🙂', '😊', '👍', '😄', '☕'])}`;
  return t;
}

/* ---------- Wiederholungsschutz ---------- */
const GLOBAL_WINDOW = 400;
const BOT_WINDOW = 150;
const MAX_TRACKED_BOTS = 400;
let seq = 0;
const usedGlobal = new Map(); // Zeile -> Nummer der letzten Verwendung
const usedByBot = new Map(); // Bot-ID -> Map(Zeile -> Nummer)

function prune(map, window) {
  if (map.size < window * 3) return;
  for (const [k, v] of map) if (seq - v > window * 2) map.delete(k);
}
/** Wählt aus `pool` eine Zeile, die nicht kürzlich vorkam; merkt sich die Wahl. `botId` darf fehlen. */
function pickFresh(pool, botId) {
  if (!pool || !pool.length) return '';
  const mine = botId != null ? (usedByBot.get(botId) || usedByBot.set(botId, new Map()).get(botId)) : null;
  const ok = (line, relaxed) => {
    const g = usedGlobal.get(line); const b = mine ? mine.get(line) : undefined;
    if (b !== undefined && seq - b <= BOT_WINDOW) return false;
    if (!relaxed && g !== undefined && seq - g <= GLOBAL_WINDOW) return false;
    return true;
  };
  let choice = null;
  for (let i = 0; i < 12 && choice === null; i++) { const c = pick(pool); if (ok(c, false)) choice = c; }
  if (choice === null) { const fresh = pool.filter((c) => ok(c, false)); if (fresh.length) choice = pick(fresh); }
  if (choice === null) { const rel = pool.filter((c) => ok(c, true)); if (rel.length) choice = pick(rel); }
  if (choice === null) { // alles kürzlich benutzt: die am längsten nicht benutzte Zeile
    let best = Infinity;
    for (const c of pool) { const t = Math.max(usedGlobal.get(c) ?? -1, mine && mine.get(c) !== undefined ? mine.get(c) : -1); if (t < best) { best = t; choice = c; } }
  }
  seq++;
  usedGlobal.set(choice, seq); if (mine) mine.set(choice, seq);
  prune(usedGlobal, GLOBAL_WINDOW);
  if (mine) prune(mine, BOT_WINDOW);
  if (usedByBot.size > MAX_TRACKED_BOTS) usedByBot.delete(usedByBot.keys().next().value);
  return choice;
}

/* ---------- Gesprächsbausteine: Deutsch ---------- */
const DE = {
  greet: [
    'Moin zusammen!', 'Hallo ihr alle!', 'Hi, wie läuft’s bei euch?', 'Servus!', 'Na, alle da?', 'Guten Tag allerseits.', 'Hallo {city}!', 'Grüß euch!', 'Hallöchen in die Runde.', 'Hey, schön euch zu lesen.',
    'Ich schau mal kurz rein, was es Neues gibt.', 'Wie sieht’s aus bei euch in {city}?', 'Ist hier heute viel los?', 'Na, was machen die Geschäfte?', 'Grüße aus {city}!', 'Mahlzeit in die Runde.', 'Tag zusammen, wer ist online?', 'Einen schönen Tag wünsche ich!', 'Hallo, ich bin mal wieder da.', 'Lange nichts gelesen, wie geht’s euch?',
    'Gibt’s Neuigkeiten aus der Stadt?', 'Alles ruhig bei euch?', 'Sei gegrüßt, {city}.', 'Hi zusammen, ich hoffe, es geht euch gut.', 'Na, wer hat heute schon etwas geschafft?', 'Guten Tag, ich störe nur kurz.', 'Tach auch!', 'Moin moin, hier ist {city} wieder wach.', 'Allerseits einen guten Tag!', 'Hallo Nachbarn!',
  ],
  early: [
    'Guten Morgen! Der Kaffee läuft schon.', 'Moin, schon jemand wach?', 'Morgen zusammen, erstmal Kaffee.', 'Früh aufgestanden heute, das Licht war einfach zu schön.', 'Frühschicht gehabt, jetzt gibt’s Frühstück.', 'Morgenstund hat Gold im Mund, sagt man.', 'Wer ist auch schon so früh auf den Beinen?', 'Der Bäcker hat heute besonders gut gerochen.', 'Guten Morgen {city}!', 'Noch halb im Schlaf, aber die Zeitung muss gelesen werden.',
    'Morgens ist es am ruhigsten, da kann man in Ruhe planen.', 'Ich fange den Tag gern langsam an.', 'Frühstück, Zeitung, dann an die Arbeit.', 'Ein neuer Tag, neue Möglichkeiten.', 'Guten Morgen allerseits, auf ein ordentliches Tagwerk!', 'Der Wecker war heute gnadenlos.', 'Schon die ersten Straßenbahnen gehört?', 'Morgens ist die Luft in {city} am besten.', 'Wer macht heute einen langen Tag?', 'Ich muss gleich los, wollte aber noch kurz Hallo sagen.',
    'Moin! Heute steht einiges an.', 'Erstmal ein Brot und dann los.', 'Kaum jemand ist wach – schön ruhig hier.', 'Guten Morgen, ich hoffe, ihr habt gut geschlafen.', 'Der Tag fängt gut an.',
  ],
  morning: [
    'Guten Morgen!', 'Schönen Vormittag euch allen.', 'Bei mir ist der Vormittag schon gut gefüllt.', 'Wer hat heute schon etwas erledigt?', 'Ich bin gerade unterwegs zu ein paar Besorgungen.', 'Vormittags erledige ich immer den Papierkram.', 'Zwischen zwei Terminen kurz hier vorbeigeschaut.', 'Heute läuft alles nach Plan.', 'Die Post ist heute auch schon da gewesen.', 'Der Vormittag vergeht wie im Flug.',
    'Ich warte noch auf eine wichtige Antwort.', 'Kaffeepause! Wer kommt mit?', 'Heute früh war auf dem Markt schon richtig was los.', 'Mal sehen, was der Tag noch bringt.', 'Ich muss gleich noch zur Bank.', 'Gerade die Zeitung durchgesehen – es gibt einiges.', 'Wer hat Tipps für einen produktiven Tag?', 'Schönes Wetter für Erledigungen heute.', 'Nach dem Frühstück läuft es bei mir am besten.', 'Heute wird fleißig gearbeitet.',
    'Noch eine Stunde, dann gibt’s Mittag.', 'Vormittags ist bei mir die beste Zeit zum Planen.', 'Gleich geht’s zur Arbeit.', 'Ein ruhiger Morgen in {city}.', 'Wer ist auch schon fleißig?',
  ],
  noon: [
    'Mahlzeit!', 'Mittagspause, endlich.', 'Was gibt’s bei euch zu Mittag?', 'Bei uns gibt’s heute Eintopf.', 'Ich hole mir gleich etwas Warmes.', 'Mittags ist es in {city} am lebhaftesten.', 'Kurz durchatmen, dann geht’s weiter.', 'Wer isst auch gerade?', 'Heute gibt’s was Leckeres, ich freu mich schon.', 'Pause, Zeitung und ein Butterbrot.',
    'Mittagessen ist die beste Erfindung.', 'Kantine oder zu Hause – was ist euer Favorit?', 'Der Mittagstisch beim Wirt um die Ecke ist gut und günstig.', 'Halbzeit des Tages!', 'Ich nutze die Pause zum Lesen.', 'Mahlzeit, ihr Lieben, lasst es euch schmecken.', 'Gleich ein Spaziergang, die Sonne tut gut.', 'Bei mir gibt’s Kartoffeln mit Quark.', 'Mittags kurz abschalten, das hilft.', 'Der Kühlschrank ist zum Glück gut gefüllt.',
  ],
  afternoon: [
    'Schönen Nachmittag!', 'Der Nachmittag zieht sich heute.', 'Kaffee und Kuchen wären jetzt genau richtig.', 'Bald ist Feierabend, durchhalten.', 'Nachmittags kommt immer der kleine Durchhänger.', 'Wer hat heute noch viel vor?', 'Ich bin gerade im Endspurt für heute.', 'Heute lief es richtig gut, ich bin zufrieden.', 'Noch ein paar Stunden, dann ist es geschafft.', 'Gleich noch kurz zum Einkaufen.',
    'Das Licht ist am Nachmittag in {city} richtig schön.', 'Ich überlege, ob ich heute noch etwas anschaffe.', 'Wie war euer Tag bisher?', 'Zeit für eine Tasse Tee.', 'Die Kinder kommen gleich aus der Schule.', 'Nachmittags sind die Straßen voll.', 'Heute noch ein Termin, dann Ruhe.', 'Hat jemand zufällig die Abendzeitung gesehen?', 'Der Tag war lang, aber gut.', 'Schönen Nachmittag euch, bleibt dran.',
  ],
  evening: [
    'Schönen Abend noch!', 'Na, Feierabend?', 'Abend zusammen.', 'Endlich Feierabend, die Füße sind schwer.', 'Der Abend gehört der Familie.', 'Wer sitzt auch gemütlich zu Hause?', 'Ein ruhiger Abend in {city}.', 'Nach dem Abendessen noch ein bisschen Zeitung.', 'Feierabend! Was habt ihr heute noch vor?', 'Ich lasse den Tag ausklingen.',
    'Heute war viel los, jetzt geht’s aufs Sofa.', 'Abends studiere ich immer die Anzeigen.', 'Guten Abend, die Runde ist ja noch wach.', 'Ein Glas Wasser, ein Buch – mehr brauche ich heute nicht.', 'Wie ist euer Abend?', 'Der Tag hat sich gelohnt.', 'Abends kommt man zum Nachdenken.', 'Ich rechne noch die Wochenbilanz durch.', 'Draußen wird es dunkel in {city}.', 'Noch jemand beim Abendbrot?',
    'Heute früh ins Bett, morgen wird’s wieder anstrengend.', 'Der Abend ist die beste Zeit zum Plaudern.', 'Habt einen schönen Abend!', 'Zeit, die Beine hochzulegen.', 'Abendgruß aus {city}!',
  ],
  night: [
    'Noch jemand so spät unterwegs?', 'Eigentlich müsste ich schlafen …', 'Die Nacht ist ruhig in {city}.', 'Nachteule meldet sich.', 'Ich kann nicht einschlafen, zu viele Gedanken.', 'Wer ist denn jetzt noch wach?', 'Ein letzter Blick auf die Zeitung, dann ins Bett.', 'Gute Nacht allerseits.', 'So spät noch Rechnungen sortiert.', 'Nachts ist es am ruhigsten zum Nachdenken.',
    'Ein Tee und dann schlafen.', 'Ich sollte längst im Bett sein.', 'Nachtschicht gehabt, jetzt noch kurz runterkommen.', 'Schlaft gut, ihr da draußen.', 'Es ist wirklich schon spät geworden.', 'Wer macht noch die Nacht zum Tag?', 'Draußen ist alles still.', 'Morgen früh muss ich raus – trotzdem noch wach.', 'Ein Gutenachtgruß in die Runde.', 'Die Straßenlaternen brennen schon lange.',
  ],
  game: [
    'Hat jemand einen Tipp für eine günstige Wohnung in {city}?', 'Lohnt sich ein eigener Betrieb eigentlich schon früh?', 'Wie macht ihr das mit dem Kühlschrank, immer voll halten?', 'Hat hier jemand ein Haus zur Miete angeboten?', 'Wer hat schon mal für ein Amt kandidiert?', 'Ich spare gerade auf ein eigenes Haus.', 'Die Zeitung hat heute wieder interessante Stellen.', 'Wie weit seid ihr im Spiel, welches Jahr?', 'Mein Mieter zahlt zum Glück pünktlich.', 'Bei mir ist gerade alles ruhig, kann gern so bleiben.', 'Kinder kosten ordentlich, aber es lohnt sich.', 'Hat jemand Erfahrung mit der Versicherung?',
    'Ich überlege, ob ich einen Kredit aufnehme oder lieber weiter spare.', 'Eine Gebäudeversicherung ist bei einem Haus fast Pflicht, oder?', 'Wer hat schon eine Firma an die Börse gebracht?', 'Wie viel Personal braucht ein Betrieb eigentlich wirklich?', 'Manager einstellen oder selbst mitarbeiten – was meint ihr?', 'Meine Instandhaltung frisst gerade ordentlich Geld.', 'Habt ihr schon mal einen Mieter verloren?', 'Mit der Zeit zahlt sich Erfahrung im Beruf richtig aus.', 'Ich vergleiche gerade Mietangebote in der Zeitung.', 'Bei den Preisen muss man genau rechnen.',
    'Ein Haus braucht Pflege, sonst verfällt der Wert.', 'Kennt jemand einen guten Handwerker?', 'Ich habe heute die Rate pünktlich gezahlt, ein gutes Gefühl.', 'Wer hat Lust auf einen Besuch in meinem Betrieb?', 'Wie oft schaut ihr in den Spielermarkt?', 'Kurz vor einer Beförderung, ich bin gespannt.', 'Meine Kasse ist ordentlich gefüllt, aber wohin damit?', 'Ob ich die Wohnung lieber behalte oder vermiete?', 'Ich habe eine ruhige Woche hinter mir.', 'Wer verkauft gerade eine Immobilie in {city}?',
    'Mein Betrieb läuft, aber die Löhne drücken.', 'Hat jemand die Wettervorhersage in der Zeitung gesehen?', 'Ich plane meinen nächsten Umzug.', 'Spart ihr eher oder investiert ihr?', 'Mir fehlt noch ein Raum im Betrieb.', 'Was kostet bei euch gerade ein Brot?', 'Ein Gärtchen am Haus wäre schön.', 'Der Nachbar hat sein Dach neu gedeckt, sieht gut aus.', 'Lohnt sich ein Studium wirklich?', 'Wer hat Erfahrung mit dem Hausbau?',
    'Gibt es hier jemanden, der Lehrlinge sucht?', 'Ich habe heute etwas Neues gelernt.', 'Wir haben heute den Haushalt neu sortiert.', 'Der Winter wird teuer, glaube ich.', 'Im Sommer läuft das Geschäft besser, oder?', 'Eine Versicherung für die Familie beruhigt ungemein.', 'Wer schreibt eigentlich noch Briefe?', 'Gerade den Kühlschrank aufgefüllt, jetzt reicht es eine Weile.', 'Ich würde gern mal das Rathaus besuchen.', 'Mit etwas Geduld wird aus wenig viel.',
    'Spielt jemand Lotto?', 'Mein Partner und ich planen die Familie.', 'Der Markt schwankt, da heißt es ruhig bleiben.', 'Mir gefällt es hier in {city} richtig gut.', 'Gestern hat es kräftig gestürmt, hoffentlich ist bei euch alles heil.', 'Nach dem Unwetter muss ich erst mal das Dach prüfen.', 'Ich habe die Wohnung renoviert, sieht gleich ganz anders aus.', 'Habt ihr eine Hausratversicherung?', 'Zinsen sind gerade ein Thema bei mir.', 'Wann lohnt sich der Ausbau eines Betriebs?',
  ],
  weather: ['Was für ein Wetter heute!', 'Es regnet schon den ganzen Tag.', 'Endlich mal wieder Sonne in {city}.', 'Der Wind pfeift heute ordentlich.', 'Bei dem Nebel sieht man kaum die Hand vor Augen.', 'Schnee in der Nacht, der Weg ist glatt.', 'Die Hitze setzt mir heute zu.', 'Ein Gewitter liegt in der Luft.', 'Der Herbst färbt die Bäume schön.', 'Im Frühling blüht {city} richtig auf.', 'Zum Glück hatte ich einen Schirm dabei.', 'Die ersten Schneeflocken sind gefallen.'],
  family: ['Die Kinder haben heute die Küche auf den Kopf gestellt.', 'Sonntags kocht bei uns die ganze Familie.', 'Meine Kleine hat heute ein Bild gemalt, so stolz.', 'Familienzeit ist das Wichtigste.', 'Die Schule macht Fortschritte, die Zeugnisse waren gut.', 'Wir überlegen, ob wir ein weiteres Kind wollen.', 'Opa erzählt wieder Geschichten von früher.', 'Der Garten ist das Reich der Kinder.', 'Bei uns ist immer was los, nie langweilig.', 'Gemeinsames Abendessen ist bei uns heilig.'],
  work: ['Heute war richtig viel zu tun.', 'Der Chef hat mich gelobt, das tut gut.', 'Nach den Jahren hat man seinen Rhythmus gefunden.', 'Ich bleibe meinem Beruf treu.', 'Mit Erfahrung wird alles leichter.', 'Überstunden gab es auch noch.', 'Die Kollegen sind nett, das hilft.', 'Ein ehrlicher Lohn für ehrliche Arbeit.', 'Mal sehen, ob ich bald befördert werde.', 'Zwischendurch eine Pause ist Gold wert.', 'Ich denke über eine Weiterbildung nach.', 'Die Arbeit macht heute richtig Spaß.'],
  money: ['Die Preise ziehen wieder an.', 'Zum Monatsende wird es immer knapp.', 'Ich lege jeden Monat etwas zur Seite.', 'Billig ist nicht immer günstig.', 'Rechnen, rechnen, rechnen – anders geht es nicht.', 'Wer rechnet, spart.', 'Ein Polster auf dem Konto gibt Ruhe.', 'Große Anschaffungen überlege ich mir lange.', 'Ohne Rücklagen wäre ich nervös.', 'Manchmal gönne ich mir etwas Gutes.', 'Das Haushaltsbuch hat mir schon geholfen.', 'Lohn und Preise – das muss zusammenpassen.'],
  leisure: ['Am Wochenende geht’s ins Grüne.', 'Ich würde gern mal wieder ins Kino.', 'Ein Buch am Abend ist das Schönste.', 'Wer spielt Skat?', 'Beim Spaziergang kommen mir die besten Ideen.', 'Radfahren hält fit.', 'Gartenarbeit entspannt mich enorm.', 'Ein Konzert wäre mal wieder schön.', 'Ich bastle gern an meinem Haus.', 'Am Sonntag gibt’s bei uns Kuchen.', 'Ein Tag am Wasser wäre jetzt was.', 'Schach am Abend, herrlich.'],
  cityGeneric: ['{city} ist schon eine schöne Stadt.', 'Ich möchte {city} nicht mehr missen.', 'In {city} kennt man sich noch.', 'Wer hat Tipps, was man in {city} unbedingt gesehen haben muss?', 'Die Märkte in {city} sind immer einen Besuch wert.', 'Ich bin gern in {city} unterwegs.', 'Was ist euer Lieblingsplatz in {city}?', 'Die Nachbarschaft in {city} ist Gold wert.', 'In {city} wird viel gebaut, man sieht es an jeder Ecke.', 'Der Weg zur Arbeit durch {city} ist mein tägliches Programm.', 'Wohnt jemand hier schon länger als ich in {city}?', 'Manchmal denke ich an einen Umzug, aber {city} hält mich.', 'Die Wohnungssuche in {city} ist ein Abenteuer.', 'Wer kennt einen guten Bäcker in {city}?', 'Heute war ich am Marktplatz in {city}, wie immer ein Gewusel.', 'Man wird in {city} schnell heimisch.', 'Die Leute in {city} sind schon in Ordnung.', 'Ich zeige Besuch gern {city}.', 'In {city} ist immer etwas los.', 'Straßenbahn oder Fahrrad in {city}?'],
  prof: ['Als {prof} sieht man die Stadt mit anderen Augen.', 'Mein Beruf als {prof} ernährt mich gut.', 'Wer von euch ist auch {prof}?', 'Als {prof} hat man selten Langeweile.', 'Der Alltag als {prof} hat seine Eigenheiten.', 'Ich bin gern {prof}, auch wenn es anstrengend ist.', 'Hat jemand Tipps für einen {prof}, der sich selbstständig machen will?', 'Als {prof} lernt man nie aus.', 'Es gibt Tage, da liebe ich meinen Beruf als {prof}.', 'Ein {prof} kennt die Tücken des Alltags.', 'Gute Arbeit als {prof} spricht sich herum.', 'Mit den Jahren wird man als {prof} richtig sicher.', 'Ob sich mein Beruf als {prof} in Zukunft verändert?', 'Wer sucht einen zuverlässigen {prof}?', 'Als {prof} schaue ich besonders auf die Stellenanzeigen.', 'Mein Meister hat mir als {prof} viel beigebracht.', 'Erfahrung als {prof} lässt sich nicht erwerben, nur sammeln.', 'Heute war ein typischer Tag für einen {prof}.', 'Ich überlege, als {prof} einen Betrieb zu übernehmen.', 'Der Beruf {prof} hat Zukunft, finde ich.', 'Einem {prof} geht die Arbeit nie aus.', 'Ob andere Berufe es leichter haben als ein {prof}?', 'Stolz darauf, {prof} zu sein.', 'Als {prof} kommt man ganz schön rum.'],
  cityLines: {
    Berlin: ['In Berlin ändert sich ständig alles.', 'Die S-Bahn in Berlin ist heute mal wieder voll.', 'Berliner Luft hat schon was.'],
    Hamburg: ['Der Hafen in Hamburg riecht heute nach Salz und Kaffee.', 'Hamburg im Nieselregen – wie immer.', 'Wer holt am Fischmarkt frischen Fisch?'],
    'München': ['In München ist der Föhn heute spürbar.', 'München ohne Biergarten ist kaum vorstellbar.', 'Die Mieten in München sind eine Wissenschaft für sich.'],
    'Köln': ['Der Dom in Köln steht wie eh und je.', 'Kölsch und Rheinblick – was will man mehr.', 'In Köln wird der Karneval schon früh geplant.'],
    Frankfurt: ['Frankfurt hat Messe, das spürt man in der ganzen Stadt.', 'Im Bankenviertel gibt es immer was zu rechnen.', 'Ein Äppler am Main schmeckt immer.'],
    Stuttgart: ['Stuttgart im Kessel, da staut sich die Luft.', 'Hier in Stuttgart wird gewerkelt und getüftelt.', 'Schaffe, schaffe, Häusle baue – das passt zu Stuttgart.'],
    'Düsseldorf': ['Auf der Königsallee flaniert es sich schön.', 'Ein Altbier in der Altstadt nach Feierabend.', 'Düsseldorf hat den Rhein vor der Tür.'],
    Dortmund: ['Dortmund hat Herz und Stahl.', 'Am Wochenende ist Fußball in Dortmund Pflicht.', 'Hier im Revier kennt man sich.'],
    Essen: ['Essen und die Zechen – das gehört zusammen.', 'Das Ruhrgebiet wird grüner, als man denkt.', 'Im Pott hält man zusammen.'],
    Leipzig: ['Leipzig ist Messestadt, das merkt man.', 'Thomaskirche und Musik, das ist Leipzig.', 'In Leipzig tut sich was.'],
    Bremen: ['Bremer Stadtmusikanten und frischer Wind.', 'Der Roland steht noch am Markt.', 'Bremen ist klein, aber fein.'],
    Dresden: ['Dresden an der Elbe, ein Spaziergang lohnt immer.', 'Die Frauenkirche prägt das Stadtbild.', 'Dresden baut und baut.'],
    Hannover: ['Hannover hat Messe und Maschsee.', 'In Hannover spricht man das schönste Deutsch, heißt es.', 'Am Maschsee ist heute viel los.'],
    'Nürnberg': ['Nürnberger Lebkuchen sind unschlagbar.', 'Der Christkindlesmarkt kommt bald, ich freue mich.', 'In Nürnberg wird Geschichte lebendig.'],
    Kiel: ['Kiel und die Förde, Wind inklusive.', 'Die Kieler Woche kommt, die Stadt füllt sich.', 'Moin aus Kiel!'],
    'Lübeck': ['Marzipan aus Lübeck ist unschlagbar.', 'Das Holstentor sieht heute besonders schön aus.', 'Lübeck, die alte Hansestadt.'],
    Rostock: ['Rostock und die Ostsee, frische Brise inklusive.', 'Hanse und Hafen, das ist Rostock.', 'Am Strand bei Warnemünde ist es herrlich.'],
    Freiburg: ['Freiburg und der Schwarzwald vor der Haustür.', 'Das Münster in Freiburg ist beeindruckend.', 'In Freiburg scheint oft die Sonne.'],
    Aachen: ['Aachener Printen sind etwas Besonderes.', 'Aachen liegt direkt an der Grenze, das ist spannend.', 'Der Dom in Aachen hat Geschichte.'],
    'Münster': ['In Münster fährt jeder Rad.', 'Der Prinzipalmarkt ist das Herz von Münster.', 'Münster ist schön grün.'],
    Karlsruhe: ['Karlsruhe, die Fächerstadt.', 'In Karlsruhe fährt die Bahn mitten durch die Stadt.', 'Am Schloss in Karlsruhe spaziert es sich gut.'],
    Trier: ['Die Porta Nigra in Trier ist unglaublich alt.', 'Trier und die Mosel – Wein inklusive.', 'In Trier wohnt Geschichte.'],
    Regensburg: ['Die Steinerne Brücke in Regensburg ist ein Wunder.', 'Regensburg hat eine schöne Altstadt.', 'An der Donau in Regensburg lässt es sich leben.'],
    'Würzburg': ['Würzburg und der Frankenwein passen zusammen.', 'Die Residenz in Würzburg ist prächtig.', 'Am Main in Würzburg ist es schön.'],
    Kassel: ['In Kassel schaut man gern in den Bergpark.', 'Kassel hat Kunst und Industrie.', 'Kassel liegt schön mittendrin.'],
    Bonn: ['Bonn am Rhein, gemütlich und politisch.', 'In Bonn ist alles ein bisschen kleiner und netter.', 'Der Rhein bei Bonn ist heute ruhig.'],
    Augsburg: ['Augsburg hat eine lange Handelsgeschichte.', 'Die Fuggerei in Augsburg ist eine Besonderheit.', 'In Augsburg gibt es schöne Kanäle.'],
    Mannheim: ['In Mannheim ist alles in Quadraten, da verläuft man sich nicht.', 'Mannheim hat Industrie und Herz.', 'Am Neckar und Rhein liegt Mannheim ideal.'],
  },
  era: [
    { from: 1945, to: 1947, lines: ['Der Wiederaufbau geht langsam voran.', 'Wer hat noch Arbeit gefunden? Es wird überall gebraucht.', 'Die Preise sind verrückt, aber es geht bergauf.', 'Ohne Lebensmittelmarken geht gar nichts.', 'Der Winter ist hart, Kohle ist knapp.', 'Auf dem Schwarzmarkt tauscht man Zigaretten gegen alles.', 'Die Trümmerfrauen räumen jeden Tag Steine weg.', 'Wir hamstern auf dem Land, was wir kriegen können.', 'Jeder teilt, was er hat.', 'Die Ruinen werden weniger, langsam, aber sicher.', 'Hauptsache, wir haben ein Dach über dem Kopf.', 'Das Radio bringt endlich wieder Musik.', 'Endlich wieder Frieden, das ist das Wichtigste.', 'Die Suchmeldungen im Radio gehen mir nahe.'] },
    { from: 1948, to: 1949, lines: ['Seit der Währungsreform sind die Schaufenster wieder voll.', 'Vierzig D-Mark Kopfgeld, damit fängt jeder neu an.', 'Plötzlich gibt es wieder alles in den Läden.', 'Die Rosinenbomber über Berlin vergisst man nicht.', 'Die neue D-Mark ist hart, man spürt es im Geldbeutel.', 'Das Grundgesetz ist beschlossen, ein neuer Anfang.', 'Wer hätte gedacht, dass es so schnell aufwärts geht.', 'Die erste Wahl zum Bundestag steht an, spannend.', 'Vor dem Schaufenster stehen alle und staunen.', 'Der Schwarzmarkt hat sich fast erledigt.', 'Jetzt lohnt sich Arbeiten wieder.', 'Ein neues Geld, eine neue Zeit.'] },
    { from: 1950, to: 1955, lines: ['Das Wirtschaftswunder merkt man langsam.', 'Habt ihr schon einen Fernseher gesehen?', 'Es geht uns besser als noch vor ein paar Jahren.', 'Das Wunder von Bern war unglaublich!', 'Wir haben uns endlich einen Kühlschrank geleistet.', 'Die Nierentische sind überall.', 'Mit dem Motorroller kommt man schön durch die Stadt.', 'Die Läden sind voll, und die Leute haben wieder Arbeit.', 'Italien ist das neue Traumziel, hört man.', 'Ein Radio hat jetzt fast jeder.', 'Der Käfer fährt und fährt.', 'Es wird gebaut, wohin man blickt.', 'Wer fleißig ist, kommt voran.', 'Die Wohnungsnot ist noch spürbar, aber es wird besser.'] },
    { from: 1956, to: 1962, lines: ['Die Zeiten ändern sich schnell.', 'Heute Abend gibt’s endlich Fernsehen bei den Nachbarn.', 'Autos gibt’s überall, früher undenkbar.', 'Die Mauer in Berlin macht mir Sorgen.', 'Rock ’n’ Roll im Radio, die Eltern schimpfen.', 'Die Gastarbeiter bringen frischen Wind in die Betriebe.', 'Petticoat und Pomade, die Jugend ist anders.', 'Es herrscht fast Vollbeschäftigung.', 'Der Urlaub am Meer ist jetzt für viele erschwinglich.', 'Alle reden vom Wohlstand für alle.', 'Der Katalog vom Versandhaus ist mein Lieblingsbuch.', 'Waschmaschine und Kühlschrank gehören bald in jeden Haushalt.', 'Die Tagesschau gucken wir jetzt jeden Abend.', 'In den Fabriken wird rund um die Uhr gearbeitet.'] },
    { from: 1963, to: 1972, lines: ['Die Bundesliga hat begonnen, am Samstag ist Fußball.', 'Die Beatles laufen bei uns rauf und runter.', 'Die Mondlandung war ein Erlebnis, die ganze Straße schaute zu.', 'Farbfernsehen ist schon was anderes.', 'Die Studenten gehen auf die Straße, es gärt.', 'Miniröcke sind das Gesprächsthema Nummer eins.', 'Die Olympischen Spiele in München waren ein Fest.', 'Wir sparen auf ein eigenes Auto.', 'Die neuen Autobahnen sind ein Segen.', 'Die Ostpolitik wird heiß diskutiert.', 'Langhaarige überall, die Eltern sind entsetzt.', 'Das Wirtschaftswunder ist wohl endgültig Alltag.', 'Plattenläden sind voll wie nie.', 'Jeder zweite Haushalt hat jetzt ein Telefon.'] },
    { from: 1973, to: 1979, lines: ['Die Ölkrise merkt man an den Preisen.', 'Schlaghosen sind wieder ganz groß.', 'Alles wird teurer, oder täusche ich mich?', 'Autofreie Sonntage, das gab es noch nie.', 'Die WM im eigenen Land war großartig.', 'Disco am Wochenende, bis die Füße weh tun.', 'Sparen ist jetzt das Gebot der Stunde.', 'Die Arbeitslosigkeit steigt, man spürt es überall.', 'Taschenrechner sind plötzlich erschwinglich.', 'Die Zeiten sind unruhig, man bleibt lieber zu Hause.', 'Die Heizkosten sind ein Thema am Küchentisch.', 'Was ist von den neuen Videospielen zu halten?', 'Dauerwellen sind bei uns im Viertel groß in Mode.', 'Man muss rechnen können in diesen Jahren.'] },
    { from: 1980, to: 1988, lines: ['Computer sind auf einmal überall.', 'Hört ihr auch so viel Musik wie ich?', 'Die Arbeitslosigkeit macht mir etwas Sorgen.', 'Mein Sohn verbringt Stunden am Heimcomputer.', 'Der Walkman ist die beste Erfindung seit Langem.', 'Tschernobyl macht vielen Angst, man isst vorsichtiger.', 'Die Neue Deutsche Welle läuft in jedem Radio.', 'Mit dem Videorecorder nimmt man jetzt Filme auf.', 'Die Friedensbewegung ist stark, überall Demos.', 'Die Rezession spürt man bei den Aufträgen.', 'Die CD soll besser klingen als jede Platte.', 'Privatfernsehen gibt es jetzt, mal sehen.', 'Das Waldsterben beschäftigt viele.', 'Aerobic und Stirnband – die Mode ist schrill.'] },
    { from: 1989, to: 1991, lines: ['Die Wiedervereinigung verändert alles.', 'Der Mauerfall – ich werde den Abend nie vergessen.', 'Plötzlich stehen die Trabis auf unseren Straßen.', 'Hundert Mark Begrüßungsgeld, die Schlangen sind lang.', 'Die Währungsunion ist ein Riesenschritt.', 'Auf einmal darf man überall hinfahren.', 'Verwandte aus dem Osten besuchen uns endlich.', 'Wir sind Weltmeister geworden, was für ein Sommer.', 'Die Montagsdemonstrationen haben Geschichte geschrieben.', 'Alles ist im Umbruch, aber ein guter Umbruch.', 'Die Grenzen sind offen, kaum zu fassen.', 'In den neuen Ländern ist so viel zu tun.'] },
    { from: 1992, to: 1998, lines: ['Und nun auch noch der Euro in ein paar Jahren.', 'Wer hat schon Internet zu Hause?', 'Der Aufbau im Osten kostet, aber er lohnt sich.', 'Handys werden kleiner und billiger.', 'Techno und Loveparade, die Jugend feiert anders.', 'Windows 95 hat bei uns Einzug gehalten.', 'Der Solidaritätszuschlag geht ans Portemonnaie.', 'Tamagotchi füttern ist bei den Kindern Pflicht.', 'Die Rezession spüren viele Betriebe.', 'E-Mail ist schneller als jeder Brief.', 'Diskussion um den Euro in jeder Kneipe.', 'Wir haben endlich einen Computer für die Buchhaltung.', 'Die Arbeitslosenzahlen machen Sorgen.', 'Die Preise für Telefonieren sinken.'] },
    { from: 1999, to: 2002, lines: ['Das Internet ist schon praktisch.', 'Wie findet ihr den Euro?', 'Handys haben jetzt ja alle.', 'Der Euro im Portemonnaie fühlt sich noch fremd an.', 'Alles wird umgerechnet, ständig der Taschenrechner.', 'Der Teuro sorgt für Gesprächsstoff.', 'SMS schreiben ist mein neues Hobby.', 'Mit der Jahrtausendwende ist ja nichts passiert, zum Glück.', 'Die neuen Münzen sind hübsch.', 'Online-Shops schießen überall aus dem Boden.', 'DVDs verdrängen die Videokassette.', 'Die Aktienkurse spielen verrückt.'] },
    { from: 2003, to: 2012, lines: ['Ohne Handy geht kaum noch jemand aus dem Haus.', 'Das Sommermärchen 2006 war traumhaft.', 'Die Finanzkrise macht mir Sorgen um meine Rücklagen.', 'Fast jeder hat jetzt ein Profil in einem sozialen Netzwerk.', 'Flachbildfernseher sind jetzt Standard.', 'Das erste Smartphone hat mein Leben verändert.', 'Die Eurokrise ist ständig in den Nachrichten.', 'Videos im Netz schaut man stundenlang.', 'Rauchverbot in der Kneipe, daran gewöhnt man sich.', 'Die Abwrackprämie hat viele Autos verschwinden lassen.', 'Online einkaufen ist bequem geworden.', 'Alle reden über Hartz IV.'] },
    { from: 2013, to: 2019, lines: ['Ohne Smartphone geht kaum noch was.', 'Die Mieten sind echt hoch geworden.', 'Wer hat sich schon ein E-Auto angeschafft?', 'Streamingdienste ersetzen den Fernseher.', 'Mit der Energiewende ändert sich vieles.', 'Mein Einkauf kommt jetzt per Lieferdienst.', 'Die Zinsen sind so niedrig, sparen lohnt kaum.', 'Elektroroller stehen an jeder Ecke.', 'Die Klimadebatte wird immer lauter.', 'Alle chatten per Messenger, Briefe sind selten.', 'Die Wohnungssuche ist zum Glücksspiel geworden.', 'Fitnessuhren zählen jetzt jeden Schritt.'] },
    { from: 2020, to: 2029, lines: ['Homeoffice ist für mich Alltag.', 'Die Energiepreise machen mir zu schaffen.', 'Was haltet ihr von den neuen Berufen?', 'Videokonferenzen gehören jetzt zum Arbeitsalltag.', 'Die Preise steigen wieder spürbar.', 'Wärmepumpen sind in aller Munde.', 'Mit künstlicher Intelligenz ändern sich viele Berufe.', 'Das Deutschlandticket hat mein Pendeln erleichtert.', 'Lieferdrohnen sehe ich inzwischen öfter.', 'Die Pandemie hat vieles verändert, auch bei uns.', 'Wer arbeitet noch jeden Tag im Büro?', 'Solaranlagen auf dem Dach rechnen sich langsam.'] },
    { from: 2030, to: 2059, lines: ['Autonome Fahrzeuge sind aus dem Straßenbild nicht mehr wegzudenken.', 'Roboter im Haushalt, das hätten meine Großeltern nicht geglaubt.', 'Die Vier-Tage-Woche ist bei uns im Betrieb Alltag.', 'Wasserstoff ist die neue Energie, sagt man.', 'Die Hitzesommer verändern unsere Städte.', 'Neue Berufe entstehen schneller, als man hinterherkommt.', 'Vertikale Farmen liefern das Gemüse aus der Nachbarschaft.', 'Lieferroboter gehören zum Straßenbild.', 'Ich lasse mir von der KI die Steuern vorbereiten.', 'Die Jugend lernt heute ganz anders als wir damals.', 'Klimaanpassung ist das große Thema für die Stadtplanung.', 'Das Geld sitzt locker, aber die Preise ziehen an.'] },
    { from: 2060, to: 2200, lines: ['Das 22. Jahrhundert rückt näher, kaum zu glauben.', 'Meine Urgroßeltern würden die Welt nicht wiedererkennen.', 'Auf dem Mond gibt es Stützpunkte, die Nachrichten sind voll davon.', 'Virtuelle Welten gehören zum Alltag.', 'Die Weltraumlogistik wächst, neue Stellen überall.', 'Pflegeroboter sind aus den Heimen nicht mehr wegzudenken.', 'Die Natur kommt in die Städte zurück.', 'Gute Handwerker sind immer noch gefragt.', 'Geschichten von früher hören die Jungen kaum noch.', 'Die Familienchronik reicht schon Jahrhunderte zurück.', 'Wie viele Generationen es wohl noch werden?', 'Trotz aller Technik: Ein Gespräch im Chat bleibt ein Gespräch.'] },
  ],
  replyGreet: ['Hallo {them}!', 'Moin {them}!', 'Hi {them}, schön dich zu sehen.', 'Hey {them} 🙂', 'Servus!', 'Hallo, willkommen!', 'Grüß dich, {them}!', 'Tag {them}, wie geht’s?', 'Hallöchen {them}.', 'Schön, dass du da bist, {them}.', 'Moin, {them}! Alles gut bei dir?', 'Hi, hi! Was gibt’s Neues?', 'Sei gegrüßt, {them}.', 'Hey {them}, lange nicht gelesen.', 'Hallo {them}, einen schönen Tag dir.', 'Na, {them}, auch wieder da?', 'Grüße zurück, {them}.', 'Hallo zusammen und hallo {them}!', 'Willkommen in {city}, {them}!', 'Guten Tag, {them}.'],
  replyHowAre: ['Läuft gut, danke. Und bei dir?', 'Kann nicht klagen, danke der Nachfrage.', 'Alles im grünen Bereich, bei dir?', 'Es geht – viel zu tun, aber das ist ja gut.', 'Bestens, danke! Und selbst?', 'Man schlägt sich durch, danke. Und du?', 'Ganz ordentlich, der Tag war ruhig.', 'Mal so, mal so, aber insgesamt gut.', 'Mir geht’s gut, die Geschäfte laufen.', 'Danke der Nachfrage, soweit alles gut.', 'Eigentlich prima, ich kann nicht meckern.', 'Heute richtig gut, ich hatte einen guten Tag.', 'Immer besser, danke. Wie sieht’s bei dir aus?', 'Alles in Ordnung hier, danke.', 'Müde, aber zufrieden.'],
  replyHelp: ['Schau mal in der Zeitung unter Wohnungsmarkt, da stehen oft gute Angebote.', 'Am Anfang hilft jede Arbeit – später kannst du dich verbessern.', 'Ich würde zuerst den Kühlschrank und ein Dach über dem Kopf sichern.', 'Frag doch mal in der Rangliste herum, die Leute dort sind oft hilfsbereit.', 'Keine Ahnung, ich bin selbst noch am Ausprobieren.', 'Rechne erst die Fixkosten durch, dann entscheide.', 'Ich würde mit kleinen Schritten anfangen.', 'Eine Versicherung kann sich bei Schäden schnell bezahlt machen.', 'Lass dir Zeit, die Angebote wechseln jede Woche.', 'Bei Häusern lohnt es sich, auf den Zustand zu achten.', 'Mit etwas Erfahrung im Beruf steigt auch der Lohn.', 'Vielleicht hilft ein Blick in den Spielermarkt?', 'Ein kleiner Betrieb ist ein guter Anfang, wenn du die Qualifikation hast.', 'Lies am besten die Meldungen im Postfach, da steht oft die Lösung.', 'Ich habe es erst mit einer Mietwohnung versucht, das war solide.', 'Frag ruhig noch mal, vielleicht weiß jemand anderes mehr.', 'Spar dir erst ein Polster an, das beruhigt.', 'Hast du schon die Stellenanzeigen verglichen?', 'Je nach Stadt sind die Preise sehr unterschiedlich.', 'Ich würde mir die Zinsen genau ansehen, bevor ich einen Kredit nehme.', 'Gute Frage – ich würde erst mal die Nachbarn fragen.', 'Probier es aus, viel kaputt machen kannst du nicht.', 'Das hängt ein bisschen vom Jahr ab, in dem du gerade lebst.', 'Manchmal hilft es, eine Nacht darüber zu schlafen.', 'Vielleicht eröffnest du einfach etwas Kleines und wächst langsam.'],
  replyThanks: ['Gern geschehen!', 'Kein Ding.', 'Immer gern.', 'Dafür nicht.', 'Hab ich doch gern gemacht.', 'Bitte, bitte.', 'Passt schon!', 'Nichts zu danken.', 'Jederzeit wieder.', 'Freut mich, dass es hilft.', 'Na klar, dafür ist die Runde da.', 'Gern, viel Erfolg!'],
  replyBye: ['Tschüss {them}!', 'Bis später, {them}.', 'Machs gut!', 'Gute Nacht, {them}.', 'Schönen Abend noch!', 'Bis zum nächsten Mal.', 'Einen schönen Tag dir!', 'Auf Wiederlesen.', 'Pass auf dich auf, {them}.', 'Mach’s gut und bis bald.'],
  replyGeneric: ['Ja, finde ich auch.', 'Stimmt, da ist was dran.', 'Hm, interessant.', 'Gute Frage eigentlich.', 'Das sehe ich ähnlich.', 'Haha, ja.', 'Genau 🙂', 'Da sagst du was.', 'Kann ich nachvollziehen.', 'Das geht mir ähnlich.', 'Ja, so ist es wohl.', 'Hätte ich nicht gedacht.', 'Interessanter Gedanke.', 'Sehe ich auch so.', 'Ach, das kenne ich.', 'Das stimmt wohl.', 'Mag sein.', 'Das klingt vernünftig.', 'Erzähl mehr!', 'Da bin ich ganz bei dir.', 'Ja, genau das habe ich auch erlebt.', 'Ein guter Punkt.', 'Hm, darüber muss ich nachdenken.', 'So habe ich das noch nie gesehen.', 'Ach so, ja.', 'Klingt gut.', 'Das ist wahr.', 'Oh, das ist spannend.', 'Verstehe, danke für die Info.', 'Es kommt wohl drauf an.', 'Möglich ist alles.', 'Ja, das hört man öfter.', 'Mhm.', 'Echt?', 'Dem schließe ich mich an.', 'Na dann viel Erfolg damit!', 'Daran sollte man denken.', 'Da hast du recht.', 'Das macht Sinn.', 'Ja ja, so ist das Leben.'],
  honest: ['Ich bin eine computergesteuerte Spielfigur – kein echter Mensch.', 'Ehrlich gesagt: Ja, ich bin ein Bot, also computergesteuert.', 'Ja, ich bin ein Bot – eine computergesteuerte Figur, die hier mitspielt.', 'Ich will da nicht flunkern: Ich bin ein Bot und kein Mensch.', 'Ehrliche Antwort: Ja, ich bin ein Bot und werde vom Computer gesteuert.', 'Ich bin ein Bot, also eine automatische Spielfigur. Aber ich freue mich trotzdem über Gesellschaft.', 'Ja, ich bin computergesteuert – ein Bot, kein echter Mensch.', 'Du hast mich erwischt – ich bin ein Bot, kein Mensch aus Fleisch und Blut.'],
};

/* ---------- Gesprächsbausteine: Englisch ---------- */
const EN = {
  greet: ['Morning all!', 'Hello everyone!', 'Hi, how are things?', 'Hey there!', 'Anyone around?', 'Hello {city}!', 'Greetings from {city}!', 'Hi folks, anything new?', 'Hello neighbours!', 'Good day to you all.', 'How’s business, everyone?', 'Just popping in to say hello.', 'Hi all, hope you’re well.', 'Hey, nice to see you all here.', 'Is it busy in {city} today?', 'Long time no see, how are you all?', 'Hello hello!', 'Anything exciting happening in town?', 'Hi, I’m back again.', 'Good to read you all!'],
  early: ['Good morning! The coffee’s already on.', 'Up early today, the light was just too nice.', 'Anyone else awake this early?', 'Morning, coffee first.', 'The bakery smells wonderful this morning.', 'Early bird here, reading the paper.', 'The first trams are already running.', 'A fresh day, fresh chances.', 'Quiet mornings are the best for planning.', 'Alarm clock was merciless today.', 'Breakfast, paper, then work.', 'Good morning {city}!'],
  morning: ['Good morning!', 'Have a lovely morning, everyone.', 'My morning is packed already.', 'Paper work in the morning, always.', 'Coffee break! Who’s joining?', 'I’m running a few errands.', 'A calm morning in {city}.', 'Waiting for an important reply.', 'The post has already been round.', 'Things are going to plan today.', 'Off to the bank in a minute.', 'Let’s see what the day brings.'],
  noon: ['Lunchtime at last.', 'What’s for lunch on your side?', 'Stew for us today.', 'A quick break, then back at it.', 'Lunch is the best invention.', 'Midday is the liveliest time in {city}.', 'Bread, paper and a short rest.', 'Heading out for something warm.', 'Enjoy your meal, everyone.', 'Halfway through the day already.'],
  afternoon: ['Good afternoon!', 'Coffee and cake would be perfect now.', 'The afternoon drags a little today.', 'Nearly closing time, hang in there.', 'A good day so far, I’m pleased.', 'How’s your day been?', 'Time for a cup of tea.', 'The kids will be home from school soon.', 'The light in {city} is lovely this afternoon.', 'A few more hours and it’s done.'],
  evening: ['Good evening!', 'Finished for the day, finally.', 'Evening everyone.', 'A quiet evening in {city}.', 'Family time now.', 'What are you up to tonight?', 'Winding down after a long day.', 'Reading the ads after dinner.', 'Putting my feet up.', 'Hope you all have a lovely evening!', 'Going through this week’s numbers.', 'It’s getting dark in {city}.'],
  night: ['Anyone else up this late?', 'I should be asleep by now …', 'A quiet night in {city}.', 'Night owl checking in.', 'Can’t sleep, too many thoughts.', 'One last look at the paper, then bed.', 'Good night, everyone.', 'Tea and then sleep.', 'Everything’s so quiet outside.', 'It’s really late already.'],
  game: ['Anyone know a cheap flat in {city}?', 'Is it worth opening a business early?', 'How do you keep the fridge full all the time?', 'I’m saving up for my own house.', 'The newspaper has some nice jobs today.', 'What year are you all in?', 'My tenant pays on time, luckily.', 'Should I take a loan or keep saving?', 'Building insurance feels like a must for a house.', 'How many staff does a business really need?', 'Manager or work there myself – what would you do?', 'Upkeep is eating my money at the moment.', 'Experience in your trade really pays off in time.', 'Anyone looking for apprentices?', 'I’m comparing rents in the paper.', 'A house needs care or its value drops.', 'I paid my instalment on time, feels good.', 'Anyone tried the player market?', 'Almost up for a promotion, curious.', 'Do you save or invest?', 'Anyone know a good tradesman?', 'It was stormy last night, hope your roofs are fine.', 'Prices go up again, don’t they?', 'I’m planning my next move.', 'Is studying really worth it?', 'Anyone playing the lottery?', 'My business is running, but wages weigh heavy.', 'I painted the flat, looks totally different now.', 'Patience turns little into plenty.', 'I really like it here in {city}.'],
  weather: ['What weather today!', 'Rain all day long.', 'Finally some sun in {city}.', 'The wind is howling.', 'Fog so thick you can’t see your hand.', 'Snow overnight, the roads are slippery.', 'The heat is getting to me.', 'Thunderstorm in the air.', 'Autumn colours look lovely.', 'Spring is waking {city} up.'],
  family: ['The kids turned the kitchen upside down.', 'Sunday cooking is a family affair here.', 'Family time is what matters most.', 'School reports were good this year.', 'Grandad is telling his old stories again.', 'Dinner together is sacred in our house.'],
  work: ['A busy day at work.', 'I got praised today, that feels good.', 'Experience makes everything easier.', 'Honest pay for honest work.', 'Maybe a promotion soon.', 'I’m thinking about more training.', 'Colleagues are nice, that helps.', 'Work was actually fun today.'],
  money: ['Prices are creeping up again.', 'Month-end is always tight.', 'I put a little aside each month.', 'Cheap isn’t always good value.', 'A cushion in the account gives peace of mind.', 'Big purchases get a long think.', 'Keeping a household book has saved me.', 'Wages and prices must fit together.'],
  leisure: ['A trip to the countryside this weekend.', 'A book in the evening is the best.', 'Anyone for cards tonight?', 'Walks give me my best ideas.', 'Gardening relaxes me enormously.', 'Cake on Sundays at our place.', 'Chess in the evening, lovely.', 'A day by the water would be great.'],
  cityGeneric: ['{city} is such a lovely town.', 'What’s your favourite spot in {city}?', 'The markets in {city} are always worth a visit.', 'Neighbours in {city} are worth their weight in gold.', 'Flat hunting in {city} is an adventure.', 'There’s always something going on in {city}.', 'Tram or bicycle in {city}?', 'You feel at home in {city} quickly.', 'I enjoy showing visitors around {city}.', 'Anyone know a good baker in {city}?'],
  prof: ['As a {prof} you see the town differently.', 'My work as a {prof} feeds me well.', 'Any other {prof} here?', 'A {prof} is rarely bored.', 'I like being a {prof}, even when it’s tough.', 'As a {prof} you never stop learning.', 'Good work as a {prof} gets around.', 'Today was a typical day for a {prof}.', 'Thinking about taking over a business as a {prof}.', 'A {prof} always has work.', 'Proud to be a {prof}.', 'Does the job of a {prof} have a future?'],
  cityLines: {
    Berlin: ['Berlin never stops changing.', 'The S-Bahn in Berlin is packed again.'],
    Hamburg: ['The harbour in Hamburg smells of salt and coffee today.', 'Hamburg in drizzle – as usual.'],
    'München': ['The foehn is noticeable in Munich today.', 'Munich without a beer garden is hard to imagine.'],
    'Köln': ['The cathedral in Cologne stands as always.', 'Cologne carnival is planned early.'],
    Frankfurt: ['Frankfurt has a trade fair on, you can feel it.', 'Always something to calculate in the banking district.'],
    Stuttgart: ['Stuttgart in its valley, the air just sits there.', 'Folks in Stuttgart tinker and build.'],
    'Düsseldorf': ['A stroll along the Königsallee is lovely.', 'Düsseldorf has the Rhine on its doorstep.'],
    Dortmund: ['Dortmund has heart and steel.', 'Football on Saturdays is a must in Dortmund.'],
    Essen: ['Essen and the collieries belong together.', 'The Ruhr is greener than you think.'],
    Leipzig: ['Leipzig is a fair city, you can tell.', 'Something is happening in Leipzig.'],
    Bremen: ['Bremen Town Musicians and a fresh breeze.', 'Bremen is small but fine.'],
    Dresden: ['A walk along the Elbe in Dresden is always worth it.', 'Dresden keeps building.'],
    Hannover: ['Hannover has fairs and the Maschsee.', 'The Maschsee is busy today.'],
    'Nürnberg': ['Nuremberg gingerbread is unbeatable.', 'The Christmas market is coming, can’t wait.'],
    Kiel: ['Kiel and the fjord, wind included.', 'Kiel Week is coming, the town fills up.'],
    'Lübeck': ['Lübeck marzipan is unbeatable.', 'The Holstentor looks lovely today.'],
    Rostock: ['Rostock and the Baltic, fresh breeze included.', 'Hanse and harbour, that is Rostock.'],
    Freiburg: ['Freiburg with the Black Forest on the doorstep.', 'The sun often shines in Freiburg.'],
    Aachen: ['Aachen Printen are something special.', 'Aachen sits right at the border, that’s exciting.'],
    'Münster': ['Everyone cycles in Münster.', 'The Prinzipalmarkt is the heart of Münster.'],
  },
  era: [
    { from: 1945, to: 1947, lines: ['Rebuilding is slow but steady.', 'Nothing works without ration cards.', 'Coal is scarce and the winter is hard.', 'The rubble women clear stones every single day.', 'We forage in the countryside for whatever we can get.', 'The radio finally plays music again.', 'Peace is the main thing.'] },
    { from: 1948, to: 1949, lines: ['Since the currency reform the shop windows are full again.', 'Forty marks head money, everyone starts anew.', 'Suddenly everything is back in the shops.', 'The new mark is hard, you feel it in your wallet.', 'The Berlin airlift will never be forgotten.', 'A new basic law, a new beginning.'] },
    { from: 1950, to: 1955, lines: ['The economic miracle is starting to show.', 'Have you seen a television yet?', 'We finally treated ourselves to a fridge.', 'Miracle of Bern, unbelievable!', 'Italy is the new dream destination, they say.', 'Building going on wherever you look.'] },
    { from: 1956, to: 1962, lines: ['Times are changing fast.', 'The wall in Berlin worries me.', 'Rock ’n’ roll on the radio, parents are grumbling.', 'Nearly full employment.', 'Washing machines and fridges will soon be in every home.', 'Holidays at the seaside are affordable for many now.'] },
    { from: 1963, to: 1972, lines: ['The Bundesliga has started, Saturday means football.', 'The Beatles are on repeat here.', 'The moon landing was an experience, the whole street watched.', 'Colour television is something else.', 'Students are taking to the streets.', 'The Olympic Games in Munich were a festival.'] },
    { from: 1973, to: 1979, lines: ['The oil crisis shows in the prices.', 'Car-free Sundays, never seen that.', 'Disco at the weekend until my feet hurt.', 'Unemployment is rising, you notice it everywhere.', 'Pocket calculators are suddenly affordable.', 'Heating costs are a kitchen-table topic.'] },
    { from: 1980, to: 1988, lines: ['Computers are everywhere now.', 'My son spends hours at the home computer.', 'The Walkman is the best invention in ages.', 'Chernobyl frightens many, people eat more carefully.', 'The CD is said to sound better than any record.', 'Unemployment worries me a little.'] },
    { from: 1989, to: 1991, lines: ['Reunification changes everything.', 'The fall of the wall – I’ll never forget that evening.', 'Suddenly Trabants are on our streets.', 'Hundred marks welcome money, the queues are long.', 'You can travel anywhere now, hardly believable.', 'We won the World Cup, what a summer.'] },
    { from: 1992, to: 1998, lines: ['And soon the euro, too.', 'Who has the internet at home already?', 'Mobile phones are getting smaller and cheaper.', 'E-mail is faster than any letter.', 'Everyone argues about the euro in the pub.', 'Techno and Love Parade, young people celebrate differently.'] },
    { from: 1999, to: 2002, lines: ['The internet is quite handy.', 'How do you like the euro?', 'Everybody has a mobile phone now.', 'Everything gets converted, calculator at all times.', 'Texting is my new hobby.', 'Online shops are popping up everywhere.'] },
    { from: 2003, to: 2012, lines: ['Hardly anyone leaves home without a mobile.', 'The 2006 summer fairytale was dreamlike.', 'The financial crisis worries me for my savings.', 'My first smartphone changed my life.', 'Flat-screen TVs are standard now.', 'Online shopping has become so convenient.'] },
    { from: 2013, to: 2019, lines: ['Hardly anything works without a smartphone.', 'Rents have gone up a lot.', 'Who has bought an electric car already?', 'Streaming services replace the television.', 'Interest rates are so low, saving hardly pays.', 'Flat hunting has turned into a lottery.'] },
    { from: 2020, to: 2029, lines: ['Working from home is everyday life for me.', 'Energy prices are a worry.', 'What do you think of the new professions?', 'Video calls are part of work now.', 'Heat pumps are on everyone’s lips.', 'With artificial intelligence many jobs are changing.'] },
    { from: 2030, to: 2059, lines: ['Self-driving cars are part of the street scene now.', 'Household robots, my grandparents would not have believed it.', 'The four-day week is normal in our firm.', 'Hot summers are changing our cities.', 'New professions appear faster than you can keep up.', 'Vertical farms deliver vegetables from the neighbourhood.'] },
    { from: 2060, to: 2200, lines: ['The 22nd century is getting closer, hard to believe.', 'My great-grandparents would not recognise the world.', 'There are bases on the moon, the news is full of it.', 'Virtual worlds are part of everyday life.', 'Space logistics is growing, new jobs everywhere.', 'Despite all technology, a chat is still a chat.'] },
  ],
  replyGreet: ['Hi {them}!', 'Hello {them}, welcome!', 'Hey {them} 🙂', 'Good to see you, {them}.', 'Hi {them}, how are you?', 'Greetings, {them}!', 'Hey {them}, long time no see.', 'Hello and welcome to {city}, {them}!', 'Hi there, {them}.', 'Nice to read you, {them}.'],
  replyHowAre: ['Going well, thanks. You?', 'Can’t complain!', 'All good, and you?', 'Pretty well, thanks for asking.', 'Busy, but that is a good thing.', 'Not bad at all, and yourself?', 'Fine, the day was calm.', 'Tired but happy.', 'Up and down, mostly up.', 'Great, thanks!'],
  replyHelp: ['Check the newspaper housing market, there are often good offers.', 'Any job helps at the start – you can improve later.', 'Secure the fridge and a roof first.', 'No idea, still figuring it out myself.', 'Work out your fixed costs first, then decide.', 'I would start with small steps.', 'Insurance can pay off quickly after damage.', 'Take your time, offers change every week.', 'With a house, watch the condition.', 'With experience in your trade your pay rises, too.', 'Maybe have a look at the player market?', 'A small business is a good start if you are qualified.', 'Read the messages in your mailbox, the answer is often there.', 'Save a cushion first, it calms the nerves.', 'Prices differ a lot from city to city.', 'Look at the interest closely before taking a loan.', 'Sleep on it, it often helps.', 'Just try it, you can hardly break anything.'],
  replyThanks: ['You’re welcome!', 'No problem.', 'Happy to help.', 'Any time.', 'Glad it helps.', 'Of course, that’s what the chat is for.'],
  replyBye: ['Bye {them}!', 'See you later, {them}.', 'Take care!', 'Good night, {them}.', 'Have a lovely evening!', 'Until next time.'],
  replyGeneric: ['Yeah, I think so too.', 'True.', 'Good question.', 'Haha, yes.', 'Fair point.', 'I see it similarly.', 'Interesting thought.', 'That makes sense.', 'Tell me more!', 'I know that feeling.', 'Hm, I will have to think about that.', 'Could be.', 'Sounds reasonable.', 'Right you are.', 'Really?', 'Good luck with that!', 'I’m with you.', 'Never thought of it that way.'],
  honest: ['I’m a computer-controlled character – not a real person.', 'To be honest: yes, I’m a bot.', 'Yes, I’m a bot – a computer-controlled character playing along.', 'I won’t pretend: I’m a bot, not a human.', 'Honest answer: yes, I’m run by the computer.', 'I’m a bot, an automatic game character. I still enjoy the company though.'],
};

const L = (P) => (P.lang === 'en' ? EN : DE);
const fill = (t, v) => t.replace(/\{city\}/g, v.city || '').replace(/\{them\}/g, v.them || '').replace(/\{prof\}/g, v.prof || '').replace(/\s+([,.!?])/g, '$1').trim();

/** Tageszeit-Bank nach Berliner Stunde. */
function timeBank(T, hour) {
  const h = Number.isFinite(hour) ? hour : 12;
  if (h >= 5 && h < 9) return T.early;
  if (h >= 9 && h < 12) return T.morning;
  if (h >= 12 && h < 14) return T.noon;
  if (h >= 14 && h < 18) return T.afternoon;
  if (h >= 18 && h < 23) return T.evening;
  return T.night;
}
/** Epochen-Zeilen für das Spieljahr (die passende Epoche; in Übergangsjahren zusätzlich die vorherige). */
function eraLines(T, year) {
  const y = Number.isFinite(year) ? year : 1950;
  const hit = T.era.filter((e) => y >= e.from && y <= e.to);
  if (!hit.length) return y < T.era[0].from ? T.era[0].lines : T.era[T.era.length - 1].lines;
  const i = T.era.indexOf(hit[0]);
  return y - hit[0].from <= 1 && i > 0 ? hit[0].lines.concat(T.era[i - 1].lines) : hit[0].lines;
}
/** Zeilen zur Stadt: allgemeine Vorlagen plus städtische Besonderheiten (Name beginnt mit dem Schlüssel). */
function cityBank(T, city) {
  const special = Object.keys(T.cityLines).find((k) => city && String(city).startsWith(k));
  return special ? T.cityLines[special].concat(T.cityGeneric) : T.cityGeneric;
}

/**
 * Eine Zeile für den Stadtchat. ctx: { city, year, hour, prof, botId }. Gewichte: Tageszeit, Epoche, Stadt, Beruf, Alltag.
 */
function idle(P, ctx = {}) {
  const T = L(P); const { city, year, hour, prof, botId } = ctx; const r = Math.random(); let bank;
  if (r < 0.17) bank = Math.random() < 0.6 ? timeBank(T, hour) : T.greet;
  else if (r < 0.43) bank = eraLines(T, year);
  else if (r < 0.54) bank = cityBank(T, city);
  else if (r < 0.63 && prof) bank = T.prof;
  else {
    const topics = [T.game, T.game, T.game, T.weather, T.family, T.work, T.money, T.leisure];
    bank = pick(topics);
  }
  const line = pickFresh(bank, botId);
  return style(P, fill(line, { city, prof }));
}

const RE_BOT = /\b(bot|bots|roboter|robot|computer(gesteuert)?|k\.?i\.?|künstliche|mensch oder|echter? mensch|echt\??|real person|human)\b/i;
const RE_GREET = /\b(hallo|hi|hey|moin|servus|guten (morgen|tag|abend)|hello|morning)\b/i;
const RE_HOWARE = /(wie geht'?s|wie läuft|alles klar|how are you|how's it)/i;
const RE_QUESTION = /\?/;
const RE_THANKS = /\b(danke|dank|thx|thanks|thank you)\b/i;
const RE_BYE = /\b(tschüss|tschüs|ciao|bis (später|bald|morgen)|gute nacht|bye|good night|see you)\b/i;

/** Antwort auf eine Chat-Nachricht eines Spielers: { text, p } (p = Wahrscheinlichkeit zu antworten) oder null. */
function chatReply(P, text, { myFirst, theirFirst, username, city, botId } = {}) {
  const T = L(P); const lc = String(text || '').toLowerCase();
  const say = (bank, v) => style(P, fill(pickFresh(bank, botId), { them: theirFirst, city, ...v }));
  const mentions = (myFirst && lc.includes(myFirst.toLowerCase())) || (username && lc.includes(String(username).toLowerCase()));
  if (RE_BOT.test(text) && (mentions || /\b(ihr|alle|seid|any|you)\b/i.test(text)) && /\?|bist|seid|are you|ist/.test(lc)) return { text: style(P, pickFresh(T.honest, botId)), p: mentions ? 1 : 0.35 };
  if (RE_GREET.test(text)) return { text: say(T.replyGreet), p: mentions ? 1 : 0.55 };
  if (RE_HOWARE.test(text)) return { text: say(T.replyHowAre), p: mentions ? 1 : 0.5 };
  if (RE_THANKS.test(text)) return { text: say(T.replyThanks), p: 0.4 };
  if (RE_BYE.test(text)) return { text: say(T.replyBye), p: mentions ? 0.9 : 0.3 };
  if (RE_QUESTION.test(text)) return { text: say(T.replyHelp), p: mentions ? 0.95 : 0.4 };
  if (mentions) return { text: say(T.replyGeneric), p: 0.8 };
  return { text: say(T.replyGeneric), p: 0.08 };
}

/* ---------- Briefe ---------- */
const LETTER_DE = [
  'Danke für deine Nachricht! Ich melde mich, sobald ich etwas Genaueres weiß.', 'Hallo {them}, schön von dir zu hören. Gerade ist viel los, aber ich schaue gern, was sich machen lässt.', 'Hi {them}, danke dir! Lass uns gern in Kontakt bleiben.', 'Hallo {them}, vielen Dank. Ich bin mir noch nicht sicher, aber ich überlege es mir.', 'Grüß dich {them}! Klingt gut, danke für die Nachricht.',
  'Hallo {them}, deine Zeilen haben mich erreicht. Ich antworte ausführlicher, sobald ich Zeit habe.', 'Hi {them}, danke fürs Schreiben! Im Moment ist es bei mir etwas hektisch.', 'Lieber {them}, schön, dass du dich meldest. Ich denke darüber nach und schreibe dir bald.', 'Guten Tag {them}, besten Dank für deinen Brief. Ich komme darauf zurück.', 'Hallo {them}, das freut mich zu lesen! Ich schaue, wie es bei mir passt.',
  'Hey {them}, danke dir. Gib mir ein, zwei Tage, dann weiß ich mehr.', 'Hallo {them}, ich war gerade unterwegs, daher die späte Antwort. Danke für deine Nachricht.', 'Servus {them}, nett von dir zu schreiben. Ich halte die Augen offen.', 'Hallo {them}, vielen Dank für das Angebot zum Austausch. Gern.', 'Hi {them}, das klingt interessant. Erzähl mir gern mehr davon.',
  'Guten Tag {them}, Ihre Nachricht ist angekommen. Ich werde sie in Ruhe lesen und antworten.', 'Hallo {them}, vielen Dank, dass du an mich gedacht hast.', 'Moin {them}, danke dir! Bei mir läuft gerade alles ruhig, ich melde mich.', 'Hallo {them}, ich freue mich über deine Post. Wie geht es dir denn so?', 'Hi {them}, deine Nachricht kam genau richtig. Lass uns bald genauer darüber sprechen.',
  'Hallo {them}, danke. Ich muss das erst mit meiner Familie besprechen.', 'Grüß dich {them}, ich schaue mir das an und melde mich in den nächsten Tagen.', 'Hallo {them}, danke für die netten Zeilen. Ich wünsche dir eine gute Zeit.', 'Hi {them}, schön, dass es dich hier gibt. Ich melde mich wieder.', 'Hallo {them}, vielen Dank für deine Geduld. Ich antworte noch ausführlich.',
  'Guten Tag {them}, ich habe deinen Brief gelesen und denke darüber nach.', 'Hey {them}, ich bin gerade etwas eingespannt, schreibe dir aber bald mehr.', 'Hallo {them}, danke, dass du dich gemeldet hast. Es ist schön, Kontakte in der Stadt zu haben.', 'Hi {them}, deine Nachricht freut mich. Vielleicht trifft man sich ja mal im Chat.', 'Hallo {them}, das ist eine gute Frage. Ich überlege und gebe dir Bescheid.',
  'Lieber {them}, vielen Dank für deine Zeilen. Ich lasse es dich wissen, sobald sich etwas ergibt.',
];
const LETTER_QUESTION_DE = ['Gute Frage, {them}! Genau weiß ich es nicht, aber ich halte die Ohren offen.', 'Hallo {them}, da bin ich ehrlich gesagt selbst noch am Überlegen.', 'Hi {them}, ich würde es erst einmal in Ruhe ausprobieren und dann entscheiden.', 'Hallo {them}, das kommt ganz darauf an. Magst du mir mehr dazu sagen?', 'Grüß dich {them}, ich glaube, das hängt von Stadt und Jahr ab. Ich schaue mal nach.', 'Hallo {them}, ich bin mir nicht sicher. Frag auch gern im Stadtchat, dort wissen es oft mehrere.'];
const LETTER_OPEN_DE = ['', '', '', 'Hallo,\n\n', 'Guten Tag,\n\n'];
const CLOSE_DE = ['Viele Grüße', 'Beste Grüße', 'Mit freundlichen Grüßen', 'Herzliche Grüße', 'Es grüßt dich freundlich', 'Alles Gute'];
const LETTER_EN = ['Thanks for your message! I’ll get back to you once I know more.', 'Hi {them}, nice to hear from you. Busy at the moment, but I’ll see what I can do.', 'Hello {them}, thank you! Let’s stay in touch.', 'Hi {them}, thanks for writing. Things are a little hectic here.', 'Hello {them}, your letter has arrived. I will answer properly once I have time.', 'Dear {them}, good of you to write. I will think it over and get back to you.', 'Hey {them}, give me a day or two and I’ll know more.', 'Hello {them}, thank you for thinking of me.', 'Hi {them}, that sounds interesting. Tell me more about it.', 'Hello {them}, I’m glad you wrote. How are you doing?', 'Hi {them}, I need to talk it over with my family first.', 'Hello {them}, thanks for the kind words. Have a good time.'];
const LETTER_QUESTION_EN = ['Good question, {them}! I don’t know exactly, but I’ll keep my ears open.', 'Hello {them}, honestly I’m still thinking that over myself.', 'Hi {them}, it depends. Can you tell me more?', 'Hello {them}, I’m not sure. Try asking in the city chat, several people often know.'];
const CLOSE_EN = ['Best wishes', 'Kind regards', 'All the best', 'Warm regards'];
function letterReply(P, text, them, botId) {
  const en = P.lang === 'en'; const T = L(P);
  if (RE_BOT.test(text) && /\?|bist|are you/i.test(text)) return pickFresh(T.honest, botId);
  const bank = RE_QUESTION.test(text) && chance(0.6) ? (en ? LETTER_QUESTION_EN : LETTER_QUESTION_DE) : (en ? LETTER_EN : LETTER_DE);
  const body = fill(pickFresh(bank, botId), { them });
  const open = !en && P.tone === 'höflich' ? pick(LETTER_OPEN_DE) : '';
  const close = P.tone === 'höflich' ? `\n\n${pick(en ? CLOSE_EN : CLOSE_DE)}` : '';
  return `${open}${body}${close}`;
}
const OFFER_DE = ['Ich würde den Betrieb zu einem fairen Preis übernehmen.', 'Interesse an einer Übernahme – gern reden wir darüber.', 'Falls du verkaufen möchtest: Mein Angebot steht.', 'Der Betrieb gefällt mir. Wäre ein fairer Preis für dich denkbar?', 'Ich suche genau so einen Betrieb und würde ihn ordentlich weiterführen.', 'Wenn du ihn abgeben willst, kümmere ich mich darum – zu einem anständigen Preis.', 'Mein Angebot ist ernst gemeint, lass uns reden.', 'Dein Betrieb passt gut zu meinen Plänen.'];
const OFFER_EN = ['I would take this business off your hands at a fair price.', 'Interested in taking over – happy to talk.', 'If you want to sell, my offer stands.', 'I like the business. Could a fair price work for you?', 'My offer is serious, let’s talk.', 'Your business fits my plans well.'];
const APPLY_DE = ['Guten Tag, ich würde gern bei Ihnen arbeiten. Ich bin zuverlässig und lerne schnell.', 'Hallo, die Stelle interessiert mich sehr. Ich kann bald anfangen.', 'Guten Tag, ich suche eine feste Arbeit und würde mich freuen, in Ihrem Betrieb mitzuhelfen.', 'Hallo, ich bin fleißig und pünktlich. Hätten Sie Verwendung für mich?', 'Sehr geehrte Damen und Herren, ich bewerbe mich auf Ihre Stelle und bringe Erfahrung mit.', 'Hallo, ich wohne in der Nähe und könnte kurzfristig anfangen.', 'Guten Tag, Ihr Betrieb hat einen guten Ruf. Dort würde ich gern arbeiten.', 'Hallo, ich packe gern mit an und arbeite sorgfältig.'];
const APPLY_EN = ['Hello, I would like to work for you. I am reliable and quick to learn.', 'Hello, the position interests me a lot. I can start soon.', 'Good day, I am looking for steady work and would be glad to help in your business.', 'Hello, I am hard-working and punctual. Could you use me?', 'Hello, I live nearby and could start at short notice.'];
const offerText = (P, botId) => pickFresh(P.lang === 'en' ? OFFER_EN : OFFER_DE, botId);
const applyText = (P, botId) => pickFresh(P.lang === 'en' ? APPLY_EN : APPLY_DE, botId);

/** Größen der Textbänke (für Tests und Admin-Übersichten). */
function stats() {
  const count = (T) => Object.keys(T).reduce((n, k) => {
    const v = T[k];
    if (k === 'era') return n + v.reduce((a, e) => a + e.lines.length, 0);
    if (Array.isArray(v)) return n + v.length;
    return n + Object.values(v).reduce((a, l) => a + l.length, 0);
  }, 0);
  return { de: count(DE) + LETTER_DE.length + LETTER_QUESTION_DE.length + OFFER_DE.length + APPLY_DE.length, en: count(EN) + LETTER_EN.length + LETTER_QUESTION_EN.length + OFFER_EN.length + APPLY_EN.length };
}

module.exports = { nickname, bio, idle, chatReply, letterReply, applyText, offerText, style, pickFresh, eraLines, timeBank, cityBank, stats, DE, EN, LETTER_DE, LETTER_EN };
