# Design V2 (Beta)

Aktivierung: **Einstellungen → Design → Design V2 · Beta**. **Bisheriges Design**
stellt Classic wieder her. Classic bleibt die Vorgabe; `tp-game-design` speichert
die Auswahl pro Browser. Die separate Hell-/Dunkel-Präferenz bleibt erhalten.

## Spielaufbau

V2 verwendet eine dauerhafte, bildschirmfüllende Spielwelt. Die Verwaltung öffnet
sich darüber in einem Fenster mit Identität/Vermögen links, Bereichsreitern oben,
Funktionsauswahl im Inhalt und Rückkehr zur Karte unten. Das illustrierte Dock
enthält fünf einzeln gefasste, illustrierte Bereichsknöpfe; sämtliche bisherigen Routen bleiben erreichbar:

| Dock | Bereiche im Verwaltungsfenster |
| --- | --- |
| Hauptquartier | Übersicht, Wohnen, Haushalt, Familie, Vermächtnis |
| Spielwelt | Stadt, Zeitung, Karte |
| Wirtschaft | Unternehmen, Beruf, Handel & Transport |
| Gesellschaft | Gesellschaft, Spieler |
| Geschäft | Shop |

Funktionsmenüs verschieben vorhandene DOM-Abschnitte einschließlich ihrer
Eingaben und Ereignishandler. Die Gesamtübersicht zeigt alle Abschnitte; einzelne
Funktionen lassen sich gezielt öffnen. Beim Wechsel zu Classic werden die
ursprünglichen Positionen und Grid-Container wiederhergestellt. Der reine Designwechsel
ändert keine Spielregeln, Freischaltungen oder Preise. Die gemeinsamen Regeln des
Zielkonzepts 1.4 sind in [CONCEPT-1.4.md](CONCEPT-1.4.md) getrennt dokumentiert.

Der V2-Header zeigt von links Coins, Geld, Charakter/Datum, EFS/Jahrestag und das
bestehende Nettovermögen (Geld, Firmenkassen/-werte und Immobilien minus Kredite).
Der Jahresring wächst mit der Spielzeit und wechselt seine Farbe mit der Jahreszeit.
Es gibt vier anklickbare Anzeigen: Vorrat, Energie, Wohlbefinden und Gesundheit.
Dieselbe echte Leiste bleibt auch im V2-Innenraum bedienbar. Einstellungen bleiben
direkt erreichbar; die EFS-Navigation,
Chat, Benachrichtigungen, Hilfe, Konto, Ton, Animationen, Sprache, Farbschema
und Abmelden stehen im Zusatzmenü. Stadt-Luftansicht,
Gebäude, Zeitung, Multiplayer-Reiter und Dialoge verwenden weiterhin ihre echten
Spielmodule. Einführung und Hilfen bleiben über „Spielhilfe“ zugänglich.

## Karte

- Bildschirmbezogene Gruppierung des vollständigen Ortsdatensatzes. Auch bei
  rund 9.000 Orten überlappen weder Gruppierungsmarker noch Ortsbeschriftungen.
- Ortsnamen sind mit einer Linie an der exakten Koordinate ihres Ortes verankert.
  Namensschild, Kartenpunkt und Gruppenauswahl verwenden dieselbe Orts-ID;
  keine Gruppenmittelpunkte. Textbreiten werden im Browser gemessen. Namen
  weichen Kartenfiltern, Suchfeld, Standortpanel, Legende und Dock aus.
- Zahlen auf Markern bezeichnen **Orte in der Gruppe**, nicht Immobilien.
  Gruppen öffnen eine vollständige Ortsliste oder lassen sich weiter vergrößern.
- Wohnort grün, eigener Immobilien-/Unternehmensstandort violett, andere Orte blau.
- Ortssuche, Zoom, Verschieben, Pinch, Stadtauswahl, Umzug/Preisvorschau und
  EFS-Sammeln bleiben verfügbar. Tastaturaktivierung ist ebenfalls möglich.
- Kompakte Kartenverwaltung mit Reitern **Standorte / Betriebe / Routen**,
  tatsächlichen Besitzanzahlen, Tagesbilanz, Vermögen und Betriebskennzahlen.
- Stadtinformationen zeigen die eigenen Immobilien und Unternehmen vor Ort.
  Ein Klick öffnet direkt deren bestehenden Verwaltungsabschnitt; Formulare
  und Aktionen werden nicht nachgebaut. Betriebskennzahlen stehen zusammen
  in einer kompakten Übersicht.
- Handelsverbindungen stammen aus `/api/transport`. Linien verbinden Start
  und Ziel **schematisch**, ohne Straßenverläufe oder Fahrzeugpositionen zu
  behaupten. Unterwegs befindliche Fracht erhält ein Verkehrsmittel-Symbol
  (Bahn, Schiff, Flugzeug oder Straßenfracht). Seine schematische Position folgt
  dem Anteil der abgelaufenen Spieltage, einschließlich der laufenden Spieluhr.
  Eine bewegte Spur zeigt die Fahrtrichtung. Wartende Routen erhalten keine
  Bewegung. Auswahl über Karte oder Routenliste öffnet Status, Ware, Menge,
  Fahrten, Gewinn und den Fortschritt anhand echter Spieltage. Die bestehende
  Routenverwaltung bleibt für Änderungen und Start/Stopp zuständig.
- Filter für eigenen Besitz, EFS und Handelsrouten. Transportfehler blockieren
  die Karte nicht; bei der Rückkehr aus der Verwaltung werden Daten erneuert.
- Standortliste und Filter für eigenen Besitz/EFS. Kartenausschnitt und Filter
  bleiben während der Sitzung über Verwaltungswechsel und Aktualisierungen erhalten.
- Die Basiskarte wird mitgeliefert: vereinfachte Natural-Earth-Länderumrisse,
  Public Domain, aus `world-atlas` 2.0.2 (50m). Keine externen Kartendienste,
  API-Schlüssel oder Laufzeitabhängigkeiten. Heutige Grenzen dienen ausschließlich
  der Orientierung; Spielzeit und verfügbare Orte kommen aus der Spielwelt.
  Quelle: https://www.naturalearthdata.com/about/terms-of-use/

## Darstellung und Rückkehr

Alle CSS-Anpassungen sind auf `data-game-design="v2"` und `body.game` begrenzt.
Die vorhandenen Classic-Stylesheets werden nicht verändert. Landingpage und
Administration bleiben unberührt. Im Hochformat werden die Funktionsmenüs
horizontal, das Standortpanel wird zu einer einklappbaren unteren Karte.
Im Querformat und auf dem Desktop sitzt es links über der Spielwelt.

Escape schließt zuerst offene Dialoge/Menüs, danach das Verwaltungsfenster.
Ein blockierter Browserspeicher verhindert die Auswahl für die laufende Sitzung
nicht. Kartenfehler haben einen Wiederholen-Knopf und blockieren die Verwaltung
nicht. Charaktererstellung, Erbfolge und Spielende bleiben scrollbar.

## Ladebildschirm und Bewegung

V2 startet mit einem eigenen illustrierten Deutschland-Panorama, Turning-Point-
Schriftzug und animierter Sanduhr. Die drei Ladeabschnitte werden durch tatsächlich
abgeschlossene Anfragen und den fertigen Spielaufbau gefüllt; es gibt keine
künstliche Wartezeit oder vorgetäuschte Prozentanzeige. Fehler lösen die Sperre
und zeigen den bisherigen Wiederholen-Knopf. Classic behält seinen Ladebildschirm.

Verwaltungsfenster und Kartenpanels blenden kurz ein. Kartenfilter sind auf kleinen
Bildschirmen zunächst eingeklappt. Frachtbewegung, Spur, Sanduhr und Übergänge
respektieren „Animationen aus“ und `prefers-reduced-motion`. Hinter der Verwaltung
pausiert die Kartenanimation, beim Entfernen der Karte wird sie beendet.

Deutschland bleibt der einzige spielbare Ortskatalog. Eine spätere Welt-Erweiterung
benötigt einen eigenen Import und eine erweiterte Kartenprojektion; diese Änderung
fügt noch keine anderen spielbaren Länder hinzu.

## 3D-Stadt und Innenräume (Gilde-Stil)

Die 3D-Stadt (Stadt → „3D-Stadt“) ist vollständig prozedural (keine Bild-/Modelldateien, keine externen Dienste):

- **Wahrzeichen je Typ** (`city-buildings.js`): Rathaus mit Uhrenturm und Arkade, Bahnhof mit Tonnendach, Bahnsteig,
  Gleisen und Zug (Dampflok bis ca. 1960), Markthalle mit Streifendach und Ständen, Arztpraxis mit Kreuz, Schule mit
  Glockenturm und Zaun, Zeitungsverlag mit Sheddach und Schornstein, Lotto-Kiosk, Spielbank mit Kuppel, Fachwerk-Pension und
  -Wirtshaus mit Auslegerschild, Schmiede mit Esse und Glut, Bäckerei, Werkstatt, Scheune/Silo, Gewächshaus, Läden.
  Jedes Gebäude trägt ein Namensschild; eigene Gebäude haben goldenen Ring und Wimpel. Pro Gebäude wenige Meshes (Batching).
- **Tageszeit nach Spieluhr** (`atmosphere.js`): ein Spieltag ≈ 4 Minuten (`game.clock_days_per_day`), daraus Sonnen-/Mondstand,
  Himmel, Sterne, beleuchtete Fenster und Laternen. Bei reduzierter Bewegung/„Animationen aus“ bleibt die Zeit beim Laden stehen.
- **Jahreszeit nach Spieldatum**: Winter mit Schnee auf Dächern/Boden, Frühling mit Blüten, Herbstlaub; flachere Wintersonne.
- **Leben**: Passanten, Fuhrwerke (bis 1960er) bzw. Autos, Rauch aus Schornsteinen, Brunnen im Park, Fluss, Vögel, Wolken.
- **Bedienung**: Hover hebt das Gebäude hervor (Tooltip mit Name, Art, bereiten Aufgaben), Klick wählt aus und zeigt eine Infokarte,
  Doppelklick oder „Gebäude betreten“ fliegt die Kamera zur Tür und öffnet den Innenraum. Ziehen = drehen, Rechtsklick/Umschalt+Ziehen
  oder W/A/S/D = verschieben, Rad/Pinch/+/− = zoomen, Home = Ansicht zurücksetzen. **Vollbild**-Knopf (Esc beendet).
- **Innenräume**: Aktionsleiste am unteren Rand mit Verben (Arbeiten, Kaufen, Verkaufen, Einstellen & Verwalten, Ausruhen, Kochen,
  Reisen …). Jeder Knopf wählt dieselben Gegenstände/Aktionen wie der Klick im Raum bzw. die Liste rechts – es gibt keine neuen
  Spielaktionen. Punkt am Knopf = Aufgabe bereit. Personal mit Mützen/Schürzen, laufende Kundschaft, Fensterblick passend zur
  Tageszeit, Namensschild an der Wand, sanfte Kamerafahrt beim Betreten.
- **Betrieb 2.0 im Innenraum** (`rooms.js`, Raumtyp `biz`, nur für eigene Betriebe mit aktivem Betrieb 2.0): drei zusätzliche Gegenstände mit Verben in der Aktionsleiste –
  **Lager** (Regal an der linken Wand, die Kisten spiegeln den Füllstand; Aktionen: Vorrat ansehen, nächste Stufe bauen), **Schutz & Brand** (Alarmtafel mit Kontrolllampen,
  Feuerlöscher, ab Brandschutz 3 Sprinklerleitung, ab Schutz 2 Kamera; Aktionen: Brandrisiko, Brandschutz/Schutz ausbauen, Betriebsversicherung) und **Betriebsklima**
  (Aushang mit Stimmungsfarbe und Balken je Mitarbeiter; Aktionen: Team loben, Prämie, Betriebsfest bzw. Weihnachtsfeier, „Mitarbeiter einzeln führen“ öffnet die Unternehmen-Seite).
  Alle Knöpfe rufen die vorhandenen Spielaktionen auf (`opsBuild`, `bizPraise`, `bizBonus`, `bizParty`, `insurance`); gesperrte Aktionen nennen den Grund
  (Epoche, Geld, Betrieb ohne Zutaten). Ohne Mitarbeiter bleibt der Aushang leer („Stelle Mitarbeiter ein“).
- **Betrieb 2.0 in der Stadt** (`city-buildings.js`, Daten aus `/api/city` → `mods`, `burning`): Eigene Betriebe zeigen ihre Module dezent am Haus – roter Feuerlöscher an der
  Fassade (Brandschutz 1+), Sprinklerleitung unter der Traufe (3), Kamera an der Ecke mit Kontrolllicht (Schutz 2+), Poller (Schutz 1+), Lagerkisten (eine je Lagerstufe) und eine
  Bank vor dem Haus (Arbeitsplätze). Nach einem Brand glimmen oranger Schein und Licht am Gebäude, solange der Betrieb ruht. Der Draw-Call-Bereich bleibt im Budget (Test `design-gilde`).
- Prüfhilfen: `document.documentElement.dataset.cityHour` (0–24) und `cityDoy` (0–364) frieren Tages-/Jahreszeit ein;
  `#city3dHost.__city3d.stats()` liefert Draw-Calls, Dreiecke, Passanten usw. Das Renderer-Bundle wurde um einige three.js-Exporte
  erweitert (siehe `public/vendor/three/README.md`).
- Zeit-/Jahreszeit-Funktionen sind getestet (`test/atmosphere.test.js`), Browser-Verhalten in `test/e2e/design-gilde.test.js`.

## Charakterblatt (Schritt 10)

Die Seite `character` (`public/js/game/char.js`, `views/character.js`) ist für beide Designs dieselbe: Talente mit Erfahrungspunkten, Rang, Ausstattung und Kurz-Lebenslauf. Design V2 trägt sie im Dock unter **Hauptquartier** ein (`DESIGN_GROUPS`, Reiter „Charakter“); das Verwaltungsfenster baut die Bereichsleiste („Gesamtübersicht“, „Erfahrungspunkte“, „Gesellschaftlicher Rang“, „Ausstattung“, „Kurz-Lebenslauf“) automatisch aus den Karten. Zusätzlich gibt es im **Wohnhaus-Innenraum** die **Garderobe** (der vorhandene Schrank wird Hotspot, Aktionsleiste „Garderobe“, Aktion „Charakterblatt öffnen“). Alle Knöpfe rufen dieselben Spielaktionen auf (`chTrain`, `chAuto`, `chBuy`, `chSell`, `chRepair`, `chService`); die Übersicht zeigt eine kleine Rang-Karte, die Zeitung ein „Vorab-Angebot“ für hohe Ränge. Der Test `design-gilde.test.js` prüft den Weg Stadt → Wohnhaus → Garderobe → Charakterblatt auf Desktop und Handy ohne Überlauf.

## Prüfung

- `npm test`: Spiellogik, statische UI-Prüfungen und Gruppierungs-/Kollisionstests
  gegen den echten Ortskatalog.
- `npm run test:design`: Playwright-Browsertest mit realem Presenter, echten
  Städten/Gebäuden/Zeitungsdaten und simulierten Serverantworten. Prüft alle 14
  Navigationsziele, Bereichsauswahl, Lebensmittelaktion, Gruppenauswahl, Ortssuche,
  Zoom, Besitzfilter, kollisionsfreie Beschriftungen, responsive Fenster,
  Classic-Rückkehr und Speicherung nach Neuladen. Außerdem: gezieltes Öffnen
  von Betrieben/Immobilien/Routen, 50-%-Fahrtfortschritt, Routenfilter und
  Anhalten einer Route über den originalen Handler mit Aktualisierung der Karte.
  Die Funktionsauswahl respektiert unabhängig gesetzte `hidden`-Attribute der
  Spielmodule.
- `design-gilde.test.js`: 3D-Stadt (Tages-/Jahreszeit, Draw-Call-Budget, Hover, Karte, Vollbild), Innenraum-Aktionsleiste auf Desktop und Handy (auch reduzierte Bewegung), Betriebs-Innenraum (Lager, Schutz & Brand, Betriebsklima), Modul-Details in der Stadt und das Charakterblatt über die Garderobe im Wohnhaus.
- Zusätzlicher Browsertest: gestaffeltes Laden, Startfehler/Wiederholen,
  Koordinaten und Beschriftungs-IDs über drei Zoomstufen und vier Viewports,
  fortschreitende Frachtposition, ruhende Routen und reduzierte Bewegung.
- Viewports: 1440×900, 832×384, 412×915 und 320×640.

Playwright lokal installieren oder `TP_PLAYWRIGHT_PATH` angeben; optional
`TP_CHROMIUM_PATH` für vorhandenes Chromium. Die UI-Fixture arbeitet ohne
Produktivkonten und ersetzt keinen Test mit einer echten Mehrspieler-Datenbank.

### Durchgängiger Stadteinstieg und Lebensweg

- Ortsnamen, einzelne Ortsmarker, Suchtreffer und Orte aus einer Markergruppe öffnen in V2 direkt die 3D-Stadt. Eine Zahl auf einem Gruppenmarker öffnet weiterhin die Ortsauswahl. Die 2D-Karte bleibt wählbar; bei fehlendem WebGL greift der bestehende Rückfall auf 2D.
- Der besuchte Ort und der Wohnort sind getrennt. Die Zeitung übernimmt den besuchten Ort, auch beim Öffnen aus einem Gebäude. „Zurück zu meinem Wohnort“ wählt ausdrücklich die Heimat-Ausgabe. Ein Stadtrundgang löst keinen Umzug und keine Zahlung aus.
- Der Stadtbegleiter zeigt die nächste Empfehlung des Servers; dringende Probleme wie Essen, Unterkunft, Gesundheit oder fehlende Zutaten haben Vorrang. Auf dem Handy steht eine kompakte Verknüpfung über der Stadt. Der aufklappbare Lebensweg verbindet die vorhandenen Aufgaben in vier Bereiche: Leben sichern, Betrieb aufbauen, Handel vernetzen, Familie & Einfluss.
- Ziele öffnen die bestehenden Spielaktionen und ihre passenden Reiter. Persönliche Stellen-/Wohnungssuche führt zur Zeitung des Wohnorts. Beim Verlassen des eigenen Betriebs öffnet dessen Verwaltungsaktion gezielt diesen Betrieb.
- Fortschritt, Belohnungen, Berufsvoraussetzungen, Produktion, Lieferungen und Erbschaft verwenden weiterhin die vorhandene Serverlogik. Die neue Führung vergibt keine eigenen Belohnungen und simuliert keinen zweiten Spielstand. Sie ist eine Verbindung der Turning-Point-Systeme, keine vollständige Nachbildung aller Gilde-Mechaniken.

Prüfung: `test/city-journey.test.js` und `test/e2e/design-city-flow.test.js` decken Ortswechsel ohne Umzug, lokale Zeitungsausgaben, den Weg zurück, echte Angebotsreiter und abgeleiteten Fortschritt ab. Die bestehenden Design-/Innenraumtests prüfen weiterhin Aktionen, 2D/3D-Wechsel und Classic.

### Betriebsalltag in der Stadt (Gilde-Referenz)

- Ein eigener Betrieb zeigt schon bei der Gebäudeauswahl seinen Zustand. Im Innenraum erklären Zutaten, Auslastung und Tagesgewinn den Warenkreislauf; Details zu Rezept, Erzeugnissen, Team und Firmenkasse bleiben zunächst eingeklappt. Die Verwaltung öffnet genau den ausgewählten Betrieb.
- Die Darstellung liest die bestehenden Serverwerte einschließlich der wirksamen Lagerversorgung, nicht nur den ungepufferten Einkauf. Brand, Produktionsausfall, Streik und Stilllegung haben Vorrang. Der Presenter ergänzt dafür nur Streikdauer, Spielerpersonal und Betriebsleitung; Produktionsrechnung, Guthaben und Balance ändern sich nicht.
- V2-Mitarbeiter stehen an Arbeitsplätzen und bewegen ihre Arme; Bäckerei, Tischlerei und Schmiede erhalten passende Werkstücke. Höchstens acht Mitarbeiterfiguren repräsentieren das reale Team. Der Eigentümer arbeitet sichtbar nur mit, wenn er diesem Betrieb zugeteilt ist. Arbeitsbewegung und Kundschaft stoppen bei Stillständen; nach Spielaktionen wird der Zustand im offenen Raum aktualisiert. Reduzierte Bewegung bleibt respektiert. Die Bewegung ist eine Darstellung der Produktion und erzeugt keine zusätzlichen Waren.
- Prüfung: `test/business-life.test.js` prüft echte Presenter-Zustände, Streik, Ausfall und Lagerdeckung. `test/e2e/design-business-life.test.js` prüft reale WebGL-Posen, Stillstand nach Serverantwort, reduzierte Bewegung, Firmenauswahl und Handy-Layout.

Weiter offen laut `ROADMAP-GILDE.md`: frei steuerbare Familienfiguren, erweitertes Werben, Ausstattung/EP und die zusätzlichen Amts-/Gerichtsrollen. Dieser Ausbau schließt diese Roadmap-Schritte nicht ab.


## Versorgung, Schäden und Standorte

- Jeder Lebensmittelkauf fügt **100 Vorratseinheiten** hinzu. Die Anzeige nennt den gesamten Bestand und die Reichweite für den Haushalt; der Kreis bleibt auf 100 % begrenzt. Qualität wird über den gesamten Bestand gewichtet. Bestehende Spielstände behalten ihren Vorrat.
- Alle drei Versorgungskreise öffnen einen Dialog mit echtem Warenbestand: Lebensmittel/Getränke kaufen und einzeln verbrauchen. Obst und Mahlzeiten stärken Gesundheit, Kaffee/Energy-Drink geben Energie; Wasser und Mahlzeiten unterstützen beides. Energy-Drinks sind ab 1987 verfügbar. Schlafen am vorhandenen Schlafplatz gibt einmal pro Spieltag bis zu 35 Energie. Diese Aktionen heilen keine Diagnose und verlängern keine Lebensdauer.
- Der Butler bestellt bei weniger als sieben Tagen Vorrat bis zu einem Monatsbedarf nach – auch während eines Jahresvorsprungs. Gewählte Qualität und örtliche Preise gelten; bei Geldmangel wird günstiger bzw. kleiner eingekauft. Ohne ausreichendes Geld gibt es keine kostenlose Versorgung. Andere wichtige Lebensereignisse dürfen das Vorspulen weiterhin unterbrechen.
- Gebäudeschäden treffen standardmäßig deutlich seltener (Sturm 0,005 / Feuer 0,001 je passendem Stadtereignis); pro Immobilie liegen mindestens 365 Spieltage zwischen Schäden. Die Gebäudeversicherung organisiert die Reparatur automatisch, bewahrt den Zustand und den Wohnbedarf, und löst keinen Vorspul-Stopp oder dringlichen Dialog aus. Mieteinnahmen können während der Reparatur ausfallen. Migration 036 passt die bisherigen Standardchancen an; individuelle Werte bleiben erhalten.
- Im Gründungsdialog kann jeder verfügbare deutsche Ort ausgewählt werden. Preise/Nachfrage beziehen sich auf die Zielstadt, die Serveraktion prüft Stadt, Qualifikation und Budget erneut. Stadtansicht und lokale Zeitung führen direkt zur Gründung oder zum Immobilienmarkt. Fernkäufe verändern den Wohnort nicht; dort selbst arbeiten erfordert weiterhin Anwesenheit.
- Automatisierte Prüfung: `test/provisions.test.js` (Bestand, Preise, Effekte, Butler, Schäden, Fernkäufe, Altstände/Migration) und `test/e2e/design-provisions.test.js` (echte Aktionen im lokalen Testserver, Header in Hoch-/Querformat und ab 320 px, Dialoge und Gründungsort). Die vorhandenen Design-Tests prüfen weiterhin Classic/V2, Karte und Stadt.


## Raumgebundene Einrichtung (Konzept 1.4)

Eigene Wohnungen/Häuser und Betriebe öffnen über **Einrichtung** einen gemeinsamen Katalog. Die Auswahl enthält acht Möbel-/Gerätetypen, verfügbare Räume, Stückzahlen und einen Warenkorb mit genauem Gesamtpreis. Die Bestellung verteilt die Gegenstände auf feste freie Stellplätze. In V2 erscheinen eigene 3D-Modelle im zugewiesenen Raum; ein Klick öffnet passende vorhandene Spielaktionen und die Einrichtungsverwaltung. Umstellen und Einlagern aktualisiert die offene Szene ohne erneuten Gebäudeeinstieg.

Die Grundausstattung bleibt bestehen. Zusätzliche Möbel erweitern nicht automatisch Produktions-, Schlaf- oder Lagerkapazitäten. Classic bietet dieselbe Verwaltung; seine bisherige Innenraumdarstellung bleibt erhalten. Öffentliche Gebäude und fremde Mietwohnungen sind nicht individuell einrichtbar.

Die bestellbaren Innenräume haben Platz für zwei Reihen mit je drei zusätzlichen Stellplätzen und einen begehbaren Mittelgang. Türbeschriftungen werden vor Objektbeschriftungen platziert; optionale Hotspots weichen bei Überdeckung. Raumreiter und Objektliste bleiben als zusätzliche Navigation verfügbar.

Prüfung: `test/furnishing.test.js` prüft Kauf, Mengen/EFS, Voraussetzungen, Revisionen, Besitz, alte Spielstände und Wertberechnung. `test/e2e/design-furnishing.test.js` prüft einen echten Mehrraumkauf, Doppelanfrage, tatsächliche 3D-Modelle ohne gegenseitige Überschneidung, Einlagern/Umstellen, Classic und Viewports bis 320 px. Innenraum-, Firmenkassen- und Betriebsalltagstests prüfen die bisherigen Aktionen weiter. Siehe [FURNISHING.md](FURNISHING.md) für Speicherformat und Konfiguration.


## Mehrjährige Betriebsbauaufträge

Die Bauplanung verbindet Firmenübersicht, Büro, Tagesfortschritt und 3D-Stadt: Aufträge zeigen verbindliche Kosten/Dauer, Fortschritt und ein voraussichtliches Datum. Ein fehlender Berufsabschluss oder Stilllegung pausiert den Auftrag. Im Stadtbild zeigen Gerüste vier Bauphasen; nach Fertigstellung gelten neue Stufe und Kapazität. Bestehende Produktion bleibt bis dahin unverändert. Classic bietet dieselben Bauaktionen.

`test/e2e/design-construction.test.js` prüft Beauftragung ohne Sofortkapazität, Bürozugang, Gerüstphasen, Fertigstellung, Abbruchvorschau und mobile/Classic-Bedienung. Wirtschaftsregeln, Übertragung, Währungsbewertung und Grenzen sind in [CONSTRUCTION.md](CONSTRUCTION.md) beschrieben. Betriebsräume bleiben wirtschaftliche Kapazitätseinheiten; neue Ausbauten erhalten zusätzlich individuelle Bedienräume. Freie Grundrisse sind noch offen.


### Wohnraumausbau und zusätzliche Innenräume

Eigene Wohngebäude lassen sich über gespeicherte Bauaufträge erweitern. Nach Fertigstellung verbindet ein Flur bis zu vier zusätzliche Schlaf-, Arbeits- oder Wohnzimmer mit den vorhandenen Bereichen. Jeder Anbau hat eine eigene ID, Möbelstellplätze, einen passenden Katalog und echte Tür-Hotspots. Einrichtungsbestand, Wohnkapazität, Baufortschritt und Immobilienverwaltung verwenden denselben Objektstand. Der Flur belegt keine wirtschaftliche Zimmerkapazität. Türen verteilen sich auf Rück- und Seitenwand, damit auch der vollständige Ausbau erreichbar bleibt. Classic behält seine bisherige Übersicht und erhält dieselben Bau- und Einrichtungsmöglichkeiten als Dialoge.

Siehe [CONSTRUCTION.md](CONSTRUCTION.md) für Bauzeiten, Vermietung, Bewertung, Übertragung und prozedurale Außenmodelle. `test/e2e/design-home-construction.test.js` prüft maximalen Ausbau, Türgeometrie, Einzelraumdarstellung, Möbelkauf, mobile Dialoge und Classic.


### Große Betriebe und sichtbare Wohnanbauten

Neu gebaute Betriebsräume sind einzeln begehbar und nach Nutzung einrichtbar. Vier Räume bilden jeweils einen verbundenen Flurabschnitt. Die zusätzlichen Szenen entstehen erst bei Betreten; auch bei 50 wirtschaftlichen Räumen wird nicht der gesamte Innenausbau vorab geladen. Raumregister und Einrichtung wechseln bei großen Gebäuden zu beschrifteten Auswahllisten. Zusätzliche Büros greifen auf dieselbe Firmenkasse, Banklizenz und echten Nachweise zu.

Fertige Wohnanbauten bilden einen eigenen, zweigeschossig erweiterbaren Gebäudeflügel. Fenster, Fensterläden und Überdachungen unterscheiden die Nutzungsarten; frühe und moderne Epochen verwenden unterschiedliche Dachformen. Die Darstellung bleibt aus dem gespeicherten, tatsächlich fertiggestellten Ausbau abgeleitet. Gebäude ohne Anbauten behalten ihr bisheriges Modell.


### Gemeinsame Besitznavigation

Landkarte, Stadtansicht und Gebäude-Innenräume verwenden dieselbe Navigation „Besitz & Familie“. Die Kategorien Gewerbe, Wohngebäude und Familie lesen den aktuellen Spielstand. Die vorläufige vierte Kategorie „Haushalt“ führt zur vorhandenen Versorgung und Wohnverwaltung. Gebäude lassen sich nach Name oder Stadt filtern, direkt betreten oder in der jeweiligen Verwaltung öffnen. Die gewählte Kategorie bleibt beim Ansichtswechsel erhalten.

Der Ortsknopf führt in die betrachtete Stadt; Landkarte, standortbezogene Zeitung und Shop sind rechts erreichbar. Ein Besuch verändert weder Wohnsitz noch die bestehenden Regeln für Aktionen am Wohnort. In Innenräumen wird vor einem Wechsel die alte Szene sauber geschlossen, einschließlich Kamera, Fokus und Ressourcen. Die vorhandene Statusleiste mit Einstellungen bleibt erhalten.

Im ausgeklappten Besitzfenster sitzt unten eine kleine Deutschlandkarte mit dem betrachteten Standort, Wohnort und eigenen Standorten. Sie öffnet die große Karte. Zusätzlich besitzt die 3D-Stadt eine eigene lokale Minikarte. Lange Besitzlisten scrollen unabhängig von den Kategorien und der Standortkarte. Escape schließt zuerst das Besitzfenster; die Innenansicht bleibt dabei offen. Classic verwendet weiterhin seine bisherige Navigation.

Prüfungen: `test/e2e/design-possessions.test.js` deckt entfernte Immobilien, direkte Innenraumzugänge, Zeitungskontext, mobile Suche, Escape, Haushalt/Shop und Classic ab. Die zusätzlichen Gewerbeflügel verwenden dieselben fertiggestellten Raumdaten wie der Innenausbau; siehe [CONSTRUCTION.md](CONSTRUCTION.md).

### Lokale Orientierung und sichtbarer Gebäudeeinstieg

Die lokale Stadtübersicht ist nach Norden ausgerichtet und verwendet dieselben Straßen und Grundstücke wie die 3D-Szene. Sie zeigt den Kameraausschnitt, eigene Gebäude in Gold sowie die Spielfigur und ihren aktuellen Weg in Hellblau. Kartenklicks und Pfeiltasten verschieben die Kamera; „Zu mir“ beziehungsweise Pos1 zentriert die Spielfigur. Auf schmalen oder niedrigen Ansichten startet die Karte eingeklappt, damit Gebäudeaktionen lesbar bleiben.

„Gebäude betreten“ führt die sichtbare Spielfigur auf einem rechtwinkligen Weg über das bestehende Straßennetz bis zum nächstgelegenen Straßenpunkt des Gebäudes. Erst danach folgt der Kameraübergang in die vorhandene Innenansicht. Der lokale Weg ist eine kurze visuelle Darstellung, keine neue Zeit- oder Reiseabrechnung: Geld, EFS und gemeldeter Wohnort ändern sich dadurch nicht. „Direkt hinein“ überspringt den Weg; „Abbrechen“ stoppt den Einstieg. Bei reduzierter Bewegung entfällt die Laufanimation. Eine andere Gebäudeauswahl bricht den bisherigen Weg ab. Manuelle Kamerabewegung löst die automatische Verfolgung.

Die Position wird für jede Stadt während der Sitzung behalten. Wechsel zu Classic/2D oder in eine andere Ansicht entsorgen die Szene und beenden ausstehende Übergänge, sodass kein altes Gebäude nachträglich geöffnet wird. Dies ist noch keine freie RPG- oder Familiensteuerung und keine Tür-Kollisionsnavigation innerhalb von Grundstücken.

Gebäudemodelle erhalten Firstabdeckungen, Dachränder und Regenrinnen, frühe Wohnhäuser/Gasthäuser zusätzlich Fensterläden. Profilierte Türen und kleine Eingangsleuchten ergänzen die Fassaden; spätere Wohnhäuser besitzen Balkone mit Geländern und Pflanzkästen. Die zusätzlichen Teile nutzen die vorhandenen Material-Batches.

Prüfung: `test/city-path.test.js` prüft Straßenbindung und Interpolation; `test/e2e/design-city-navigation.test.js` prüft Laufweg, Abbruch, Einstieg, Kamera-Minimap, mobile Überlagerungen und reduzierte Bewegung. Die vorhandenen Stadt-/Gilde-Tests prüfen weiterhin Rendererbudget und Gebäudeaktionen.

### Familienmitglieder in der Stadt

Die lokale Minikarte bietet bei vorhandener Familie eine Auswahl „Aktive Person“. Jeweils die ausgewählte Figur wird dargestellt und bewegt; Name, Größe und Kleidungsfarbe unterscheiden sie von der Hauptfigur. Ihre Position wird je Stadt und Person während der Sitzung getrennt gespeichert. Ein Wechsel bricht einen laufenden Weg oder Gebäudeeinstieg ab. Die Auswahl wechselt weder den Erben noch den gemeldeten Wohnort.

Steuerbar sind der zusammenwohnende NPC-Partner am Wohnort sowie zu Hause gemeldete Kinder in ihrer tatsächlich registrierten Stadt. Die vorläufige Bediengrenze für eigene Kinderwege liegt bei sechs Jahren. Jüngere, vermisste oder anderweitig untergebrachte Kinder und verknüpfte Mitspieler erscheinen mit einem Grund als nicht auswählbar. Die Zuordnung verwendet die vom Server gelieferten Stadt-IDs; ein Kind wird nicht automatisch dem Wohnort des Spielers zugeordnet.

Kinder können zur Schule gehen; Markt, Rathaus und das aktuelle Wohngebäude dienen als Familientreffpunkte. Nach Ankunft öffnet sich die vorhandene Familienbedienung für genau diese Person: Schulwahl, Ausbildung/Studium, Begabungen, Geschenke beziehungsweise gemeinsame Zeit. Es gelten die bisherigen Serverregeln, Kosten und Wartezeiten. Das Laufen selbst erzeugt weder Einkommen noch EFS und schließt keine Ausbildung automatisch ab. Betriebs-, Berufs- und sonstige Gebäudeaktionen bleiben bei der Hauptfigur; direkte Besitzverknüpfungen wechseln dafür zurück zu ihr.

Auf kleinen Bildschirmen bleibt die Karte kompakt und klappt beim Beginn eines Familienwegs ein. Der Wechsel zur 2D-Karte setzt die Bedienung auf die Hauptfigur zurück. Classic behält seine vorhandene Familien- und Gebäudeverwaltung. Mehrere gleichzeitig steuerbare Gruppenmitglieder, freie Wege außerhalb der Straßen und eigenständige Arbeitsaufträge für Familienmitglieder bleiben offen.

Prüfung: `test/city-family.test.js` prüft Orts-/Statusregeln, eingeschränkte Ziele und getrennte Kinderwohnorte. `test/e2e/design-city-family.test.js` prüft echte Schulwahl und Geschenke, gemeinsame Zeit, getrennte Positionen, Wegabbruch beim Personenwechsel sowie mobile und Classic-Bedienung.
