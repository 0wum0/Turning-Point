# Design V2 (Beta)

Aktivierung: **Einstellungen → Design → Design V2 · Beta**. **Bisheriges Design**
stellt Classic wieder her. Classic bleibt die Vorgabe; `tp-game-design` speichert
die Auswahl pro Browser. Die separate Hell-/Dunkel-Präferenz bleibt erhalten.

## Spielaufbau

V2 verwendet eine dauerhafte, bildschirmfüllende Spielwelt. Die Verwaltung öffnet
sich darüber in einem Fenster mit Identität/Vermögen links, Bereichsreitern oben,
Funktionsauswahl im Inhalt und Rückkehr zur Karte unten. Das illustrierte Dock
enthält fünf Bereiche; sämtliche bisherigen Routen bleiben erreichbar:

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
- Zahlen auf Markern bezeichnen **Orte in der Gruppe**, nicht Immobilien.
  Gruppen öffnen eine vollständige Ortsliste oder lassen sich weiter vergrößern.
- Wohnort grün, eigener Immobilien-/Unternehmensstandort violett, andere Orte blau.
- Ortssuche, Zoom, Verschieben, Pinch, Stadtauswahl, Umzug/Preisvorschau und
  EFS-Sammeln bleiben verfügbar. Tastaturaktivierung ist ebenfalls möglich.
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

## Prüfung

- `npm test`: Spiellogik, statische UI-Prüfungen und Gruppierungs-/Kollisionstests
  gegen den echten Ortskatalog.
- `npm run test:design`: Playwright-Browsertest mit realem Presenter, echten
  Städten/Gebäuden/Zeitungsdaten und simulierten Serverantworten. Prüft alle 14
  Navigationsziele, Bereichsauswahl, Lebensmittelaktion, Gruppenauswahl, Ortssuche,
  Zoom, Besitzfilter, kollisionsfreie Beschriftungen, responsive Fenster,
  Classic-Rückkehr und Speicherung nach Neuladen.
- Viewports: 1440×900, 832×384, 412×915 und 320×640.

Playwright lokal installieren oder `TP_PLAYWRIGHT_PATH` angeben; optional
`TP_CHROMIUM_PATH` für vorhandenes Chromium. Die UI-Fixture arbeitet ohne
Produktivkonten und ersetzt keinen Test mit einer echten Mehrspieler-Datenbank.
