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
  { id: 't5', title: 'EFS – deine Zeit', text: 'Jeder Tag bringt dir 50 EFS, ein Login weitere 50. Ein EFS entspricht einem Spieltag; 365 EFS sind ein Jahr. Du entscheidest, wann du Zeit „vorspulst“. Auch wenn du nicht da bist, läuft das Leben weiter.', info: ['EFS sind Erfahrung, Fortschritt und Zeit zugleich.', 'Mehr EFS = schneller älter, aber auch mehr Verdienst.', 'Sammle EFS auf der Karte und spule die Zeit vor, wenn du bereit bist.'] },
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

module.exports = {
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
