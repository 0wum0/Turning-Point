'use strict';
/** Standardtexte von Zeitung, Nachrichten und Ratgeber (im Admin unter Einstellungen → Zeitung & Texte änderbar). */
const STREETS = ['Hauptstraße', 'Bahnhofstraße', 'Gartenweg', 'Lindenallee', 'Schillerstraße', 'Am Markt', 'Goethestraße', 'Ringstraße', 'Mühlenweg', 'Kirchplatz', 'Birkenweg', 'Hafenstraße'];
const PENSIONS = ['Pension Haus Linde', 'Gästehaus Sonnenschein', 'Pension Zur Post', 'Fremdenzimmer Frau', 'Pension Am Bahnhof', 'Gasthof Zum Löwen'];
const HELPER_FIRMS_OLD = ['Trümmerbeseitigung', 'Aufbauhilfe', 'Hafenarbeit', 'Fuhrbetrieb', 'Erntehilfe'];
const HELPER_FIRMS_NEW = ['Lagerservice', 'Reinigungsdienst', 'Bauhilfsdienst', 'Verpackung & Versand', 'Gartenservice'];
const BLURBS = ['sucht einen verlässlichen Menschen fürs Leben.', 'liebt Tanz und Sonntagsspaziergänge.', 'ist fleißig, bescheiden und treu.', 'hat Humor und ein großes Herz.', 'wünscht sich Kinder und ein Zuhause.', 'kocht gern und lacht viel.', 'ist naturverbunden und häuslich.'];

const TUTORIAL = [
  { id: 't1', title: 'Wie geht es dir? – Die vier Anzeigen', text: 'Oben rechts siehst du Kühlschrank, Wohlbefinden, Erholung und Gesundheit. Sie hängen zusammen: Wer gut isst und in einer richtigen Wohnung schläft, bleibt gesund und leistungsfähig.', info: ['Vier Werte bestimmen dein Leben.', 'Fällt einer stark ab, ziehen die anderen mit nach unten.', 'Halte den Kühlschrank gefüllt, such dir eine Unterkunft und eine Arbeit.'] },
  { id: 't2', title: 'Kein Dach, kein Leben', text: 'Wer auf der Straße schläft, überlebt nur etwa drei Tage. Schlafplätze beim Arbeitgeber sind billig, aber nur eine Notlösung. Pension, Miete und schließlich ein eigenes Haus bringen mehr Erholung.', info: ['Wohnen ist die Basis deiner Erholung.', 'Je besser die Wohnform, desto besser Erholung und Gesundheit.', 'Suche unter „Wohnungsmarkt“ eine Pension oder Miete.'] },
  { id: 't3', title: 'Arbeit, Ausbildung und Erfahrung', text: 'Eine Ausbildung kostet kein Geld, bringt aber nur Lehrlingslohn. Wer etwa zehn Jahre in einem Beruf arbeitet, gilt ebenfalls als ausgebildet. Höhere Stufen bringen mehr Lohn.', info: ['Ausbildung ist kostenlos, Studium nicht.', 'Berufe bestimmen später, welche Unternehmen du betreiben darfst.', 'Schau in den Stellenmarkt nach Lehrstellen und Arbeit.'] },
  { id: 't4', title: 'Vorrat ist alles', text: 'Der Kühlschrank muss regelmäßig gefüllt werden – egal wo du wohnst. Bessere Qualität hebt Stimmung und Gesundheit, kostet aber mehr.', info: ['Essen kostet Geld und Zeit.', 'Ein leerer Kühlschrank schadet Stimmung und Gesundheit täglich.', 'Kaufe unter „Haushalt“ Lebensmittel.'] },
  { id: 't5', title: 'EFS – deine Zeit', text: 'Die Spielzeit läuft mit der echten Uhr: 24 Stunden sind ein Spieljahr. Ein EFS entspricht einem Spieltag; mit deinem Vorrat kannst du zusätzlich „vorspulen“. Ein Login bringt dir EFS, und auch wenn du nicht da bist, läuft das Leben weiter.', info: ['EFS sind Erfahrung, Fortschritt und Zeit zugleich.', 'Mehr EFS = schneller älter, aber auch mehr Verdienst.', 'Sammle EFS auf der Karte und spule die Zeit vor, wenn du bereit bist.'] },
  { id: 't6', title: 'Coins – die besondere Währung', text: 'Coins sind frei verdienbar durch freiwillige Werbung und für jedes Kind. Sie bleiben dir über Tod und Neustart erhalten. Wer Werbung ansieht, kann Coin-Preise Schritt für Schritt senken.', info: ['Coins sind Meta-Fortschritt.', 'Umzüge und besondere Dinge kosten Coins.', 'Du entscheidest selbst, ob du Werbung ansiehst.'] },
  { id: 't7', title: 'Familie ist Vermächtnis', text: 'Kinder kosten Geld und Platz, bringen aber Kindergeld, Coins und später die Erben deines Lebenswerks. Ohne volljährigen Erben endet die Linie.', info: ['Ohne Erben gibt es kein zweites Leben für die Familie.', 'Der Pflichtanteil verteilt das Erbe gleichmäßig auf die Kinder.', 'Suche unter „Kontakte“ eine Partnerin oder einen Partner.'] },
  { id: 't8', title: 'Versichere dich', text: 'Unwetter, Feuer und Einbrüche kommen vor. Eine Versicherung ersetzt Schäden – aber nicht die Ausfallzeit.', info: ['Ohne Versicherung zahlst du Schäden selbst.', 'Mit Versicherung wird der Schaden ersetzt, das Gebäude fällt trotzdem aus.', 'Schließe unter „Haushalt“ Versicherungen ab.'] },
];

const NEWS = {
  storm: {
    title: '{kind} über {city}', futureTitle: 'Unwetterwarnung für {city}',
    kinds: [
      { name: 'Hagelunwetter', past: 'Ein Hagelunwetter richtete in {city} Schäden an Dächern und Häusern an.', future: 'Der Wetterdienst erwartet in den nächsten Tagen ein Hagelunwetter über {city}. Hausbesitzer sollten ihre Gebäude versichern.' },
      { name: 'Blitzeinschlag', past: 'Ein Blitzeinschlag richtete in {city} Schäden an Dächern und Häusern an.', future: 'Der Wetterdienst erwartet in den nächsten Tagen schwere Gewitter über {city}. Hausbesitzer sollten ihre Gebäude versichern.' },
      { name: 'schwerer Sturm', past: 'Ein schwerer Sturm richtete in {city} Schäden an Dächern und Häusern an.', future: 'Der Wetterdienst erwartet in den nächsten Tagen einen schweren Sturm über {city}. Hausbesitzer sollten ihre Gebäude versichern.' },
    ],
  },
  fire: { title: 'Feuer in {city}', text: 'In {city} brannte es in der Nacht in einem Wohnhaus. Die Feuerwehr war stundenlang im Einsatz.' },
  burglary: { title: 'Einbruchserie in {city}', text: 'Die Polizei in {city} warnt: In mehreren Wohnungen wurde eingebrochen. Eine Hausratversicherung schützt vor dem Schaden.' },
  festival: { title: 'Stadtfest in {city}', text: '{city} feiert! Musik, Tanz und gute Laune auf dem Marktplatz – die Stimmung in der Stadt ist prächtig.' },
  lotto: { title: 'Lotto: Glückspilz in {city}', text: 'Ein Tipper aus {city} hat einen hohen Gewinn gemacht. „Ich muss mich erst einmal setzen“, sagte er.' },
  market: { title: 'Markt in {city}', cheap: 'Auf dem Wochenmarkt in {city} sind Lebensmittel diese Woche erfreulich günstig.', expensive: 'Auf dem Wochenmarkt in {city} sind Lebensmittel diese Woche etwas teurer.' },
};


const PRESS = {
  business_open: { section: 'Wirtschaft', big: true, title: 'Neueröffnung in {city}: {firm}', texts: [
    '{name} hat in {city} die Firma „{firm}“ eröffnet. Die Stadt {city} und {mayorTitle} {mayor} gratulieren zur Neueröffnung und wünschen viel Erfolg.',
    'Frischer Wind für {city}: {name} führt ab sofort „{firm}“. {mayorTitle} {mayor} besuchte den Betrieb und wünschte „allzeit gute Geschäfte“.',
    'Eröffnungsfeier in {city}: Zahlreiche Gäste kamen, als {name} die Türen von „{firm}“ öffnete. {mayorTitle} {mayor} überbrachte die Glückwünsche der Stadt.' ] },
  business_expand: { section: 'Wirtschaft', title: '„{firm}“ wächst', texts: [
    'Das Geschäft läuft: „{firm}“ in {city} wird ausgebaut. {mayorTitle} {mayor} lobte den Unternehmergeist von {name}.',
    '{name} investiert in {city}: Aus „{from}“ wird „{firm}“. Die Stadt gratuliert zum Wachstum.' ] },
  business_revive: { section: 'Wirtschaft', title: 'Neues Leben für „{firm}“', texts: [
    'Der lange leerstehende Betrieb „{firm}“ in {city} wird von {name} wiederbelebt. Anwohner freuen sich über das Ende des Leerstands.' ] },
  business_closed: { section: 'Wirtschaft', title: '„{firm}“ steht leer', texts: [
    'In {city} hat „{firm}“ den Betrieb eingestellt. Das Gebäude steht leer – Nachbarn befürchten Verfall.' ] },
  property_buy: { section: 'Gesellschaft', title: 'Neuer Eigentümer in {city}', texts: [
    '{name} hat in {city} eine Immobilie erworben: {prop}. {mayorTitle} {mayor} heißt den neuen Eigentümer bzw. die neue Eigentümerin willkommen.',
    'Immobilienmarkt {city}: {prop} hat einen neuen Besitzer – {name}. Die Stadt wünscht ein gutes Einleben.' ] },
  move: { section: 'Lokales', title: 'Zuzug: {name} kommt nach {city}', texts: [
    '{city} hat einen neuen Einwohner: {name} ist zugezogen. {mayorTitle} {mayor} wünscht „ein herzliches Willkommen“.',
    'Wir begrüßen {name} in {city}! Die Stadt freut sich über Zuwachs.' ] },
  job_new: { section: 'Wirtschaft', title: 'Neu bei {employer}', texts: [
    '{employer} in {city} stellt {name} als {job} ein. Die Belegschaft heißt die Verstärkung willkommen.' ] },
  training_start: { section: 'Wirtschaft', title: 'Neue Lehrstelle bei {employer}', texts: [
    '{name} beginnt bei {employer} in {city} eine Ausbildung zum {job}. Der Betrieb freut sich über den Nachwuchs.' ] },
  study_start: { section: 'Bildung', title: 'Neu an der Universität', texts: [
    '{name} hat in {city} ein Studium begonnen: {job}. Die Hochschule gratuliert zur Immatrikulation.' ] },
  education_done: { section: 'Bildung', title: 'Ausbildung bestanden', texts: [
    '{name} hat die Ausbildung zum {job} erfolgreich abgeschlossen. {mayorTitle} {mayor} gratuliert zur bestandenen Prüfung.' ] },
  study_done: { section: 'Bildung', big: true, title: 'Abschluss: {job}', texts: [
    'Großer Tag für {name}: Das Studium ({job}) ist geschafft. Die Stadt {city} gratuliert zum akademischen Abschluss.' ] },
  couple: { section: 'Gesellschaft', title: 'Verliebt in {city}', texts: [
    'Wie man hört, haben {name} und {partner} zueinander gefunden. Die Stadt wünscht dem Paar alles Gute.' ] },
  marriage: { section: 'Gesellschaft', big: true, title: 'Hochzeit in {city}', texts: [
    '{name} und {partner} haben geheiratet. {mayorTitle} {mayor} gratulierte dem Brautpaar im Namen der Stadt {city}.',
    'Glockengeläut in {city}: {name} und {partner} haben sich das Ja-Wort gegeben. Die Stadt wünscht Glück und Gesundheit.' ] },
  birth: { section: 'Gesellschaft', title: 'Nachwuchs: {child} ist da', texts: [
    'Familie {last} in {city} freut sich: {child} ist geboren. {mayorTitle} {mayor} und die Stadt gratulieren den Eltern.',
    'Storch in {city}: Bei {name} ist Nachwuchs eingetroffen. Der kleine Neuankömmling heißt {child}.' ] },
  child_edu: { section: 'Bildung', title: '{child} schließt Ausbildung ab', texts: [
    '{child} {last} hat die Ausbildung zum {job} bestanden. Die Familie ist stolz.' ] },
  separation: { section: 'Gesellschaft', title: 'Getrennte Wege', texts: [
    'Wie aus dem Umfeld zu hören ist, gehen {name} und {partner} künftig getrennte Wege.' ] },
  child_runaway: { section: 'Lokales', title: 'Suchmeldung: {child}', texts: [
    'Die Polizei in {city} sucht {child} {last}. Hinweise nimmt jede Dienststelle entgegen.' ] },
  child_found: { section: 'Lokales', title: 'Entwarnung: {child} ist wieder da', texts: [
    'Erleichterung in {city}: {child} {last} wurde wohlbehalten gefunden und ist zu Hause.' ] },
  death: { section: 'Nachruf', big: true, title: 'Nachruf: {name}', texts: [
    '{name} ist im Alter von {age} Jahren gestorben. {mayorTitle} {mayor} sprach den Angehörigen das Beileid der Stadt {city} aus.',
    'Trauer in {city}: {name} ({age}) hat uns verlassen. Die Beisetzung findet im engsten Familienkreis statt.' ] },
  heir: { section: 'Gesellschaft', title: 'Das Erbe ist angetreten', texts: [
    '{child} {last} tritt das Erbe der Familie an und führt das Lebenswerk in {city} fort. Die Stadt wünscht eine glückliche Hand.' ] },
  elected: { section: 'Politik', big: true, title: 'Wahl: {name} ist {office}', texts: [
    '{name} wurde zum {office} gewählt. In {city} wird der Wahlausgang lebhaft diskutiert.',
    'Wahlabend in {city}: {name} setzt sich durch und wird {office}. {mayorTitle} {mayor} gratulierte dem Wahlsieger bzw. der Wahlsiegerin.' ] },
  term_end: { section: 'Politik', title: 'Amtszeit beendet', texts: [
    'Die Amtszeit von {name} als {office} ist zu Ende. {city} dankt für den Einsatz.' ] },
  lotto: { section: 'Vermischtes', big: true, title: 'Lotto-Glück in {city}', texts: [
    'Ein Tipper aus {city} hat {amount} gewonnen – es soll sich um {name} handeln. „Ich muss mich erst einmal setzen“, soll der Gewinner gesagt haben.' ] },
  fire: { section: 'Blaulicht', title: 'Feuer in {city}', texts: [
    'In {city} brannte {prop}. Die Feuerwehr war stundenlang im Einsatz. Besitzer ist {name}.' ] },
  storm: { section: 'Blaulicht', title: 'Sturmschäden in {city}', texts: [
    'Das Unwetter hat {prop} in {city} beschädigt. Eigentümer {name} muss sich um die Reparatur kümmern.' ] },
  burglary: { section: 'Blaulicht', title: 'Einbruch in {city}', texts: [
    'In {city} wurde bei {name} eingebrochen. Die Polizei bittet um Hinweise und rät zu einer Hausratversicherung.' ] },
  insolvency: { section: 'Wirtschaft', big: true, title: 'Insolvenz: {name}', texts: [
    '{name} aus {city} musste Insolvenz anmelden. Gläubiger und Familie sind betroffen.' ] },
  euro: { section: 'Wirtschaft', big: true, title: 'Der Euro ist da', texts: [
    'Historischer Tag: Der Euro löst die D-Mark ab. Auch in {city} werden Preise und Löhne umgestellt.' ] },
  legacy: { section: 'Gesellschaft', big: true, title: 'Ein Vermächtnis vollendet sich', texts: [
    'Die Familie {last} hat das Jahr {year} erreicht. {mayorTitle} {mayor} würdigte das generationenübergreifende Lebenswerk in {city}.' ] },
  epoch: { section: 'Wirtschaft', title: 'Berufe im Wandel', texts: [
    'Der Strukturwandel verändert die Arbeitswelt in {city}: {change}.' ] },
};

module.exports = {
  press: PRESS,
  paper: {
    streets: STREETS, pensions: PENSIONS, helperFirmsOld: HELPER_FIRMS_OLD, helperFirmsNew: HELPER_FIRMS_NEW, blurbs: BLURBS,
    mastheadWords: ['Tageblatt', 'Anzeiger', 'Kurier', 'Nachrichten', 'Zeitung'], webMasthead: '{city} · Das Netz',
    labelsPaper: { jobs: 'Stellenmarkt', housing: 'Wohnungsmarkt', partners: 'Kontakte', news: 'Aus der Stadt', biz: 'Gewerbe' },
    labelsWeb: { jobs: 'Jobbörse', housing: 'Immobilienportal', partners: 'Partnerbörse', news: 'Nachrichten', biz: 'Unternehmensbörse' },
    quietKicker: 'RUHIGE WOCHE', quietTitle: 'Nichts Besonderes in {city}',
    quietText: 'Die Menschen gehen ihrer Arbeit nach, der Markt ist ruhig. Wer die Zeitung aufmerksam liest, erfährt früh von Unwettern, Festen und Einbruchserien.',
    flashKicker: 'EILMELDUNG', customKicker: 'AKTUELL',
  },
  news: NEWS,
  guide: TUTORIAL,
};
