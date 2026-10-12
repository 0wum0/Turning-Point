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
ursprünglichen Positionen und Grid-Container wiederhergestellt. Spielregeln,
Freischaltungen, Preise, Datenbank und API-Aktionen bleiben unverändert.

Chat, Benachrichtigungen und Einstellungen stehen im HUD; Hilfe, Konto, Ton,
Animationen, Sprache, Farbschema und Abmelden im Zusatzmenü. Stadt-Luftansicht,
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
- `design-gilde.test.js`: 3D-Stadt (Tages-/Jahreszeit, Draw-Call-Budget, Hover, Karte, Vollbild), Innenraum-Aktionsleiste auf Desktop und Handy (auch reduzierte Bewegung), Betriebs-Innenraum (Lager, Schutz & Brand, Betriebsklima) und Modul-Details in der Stadt.
- Zusätzlicher Browsertest: gestaffeltes Laden, Startfehler/Wiederholen,
  Koordinaten und Beschriftungs-IDs über drei Zoomstufen und vier Viewports,
  fortschreitende Frachtposition, ruhende Routen und reduzierte Bewegung.
- Viewports: 1440×900, 832×384, 412×915 und 320×640.

Playwright lokal installieren oder `TP_PLAYWRIGHT_PATH` angeben; optional
`TP_CHROMIUM_PATH` für vorhandenes Chromium. Die UI-Fixture arbeitet ohne
Produktivkonten und ersetzt keinen Test mit einer echten Mehrspieler-Datenbank.
