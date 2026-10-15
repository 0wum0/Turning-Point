# Raumgebundene Einrichtung

Stand: 15. Oktober 2026. Umsetzung des Einrichtungsbestellsystems aus Konzept 1.4.

## Bedienung

- Eigene Immobilien und Betriebe haben einen Einrichtungsdialog, erreichbar in ihrer Verwaltung und im V2-Innenraum.
- Raum wählen, Gegenstand und Menge vormerken, weitere Räume ausstatten und den gesamten Warenkorb verbindlich bestellen. Der Gesamtpreis zeigt Centbeträge.
- Jeder erfolgreich gekaufte Gegenstand gibt genau 1 EFS. Eine Bestellung mit zehn Betten gibt zehn EFS; drei Fritteusen geben drei EFS.
- Gegenstände werden sofort auf freien, festen Stellplätzen des Zielraums aufgestellt. In V2 erscheinen dafür echte 3D-Modelle mit vorhandenen Raumaktionen und Zugang zur Einrichtungsverwaltung.
- Im Bestand können Gegenstände kostenlos in geeignete Räume umgestellt oder in die Gebäudereserve eingelagert werden. Dabei entstehen keine EFS. Die offene Szene aktualisiert sich unmittelbar.
- Grundausstattung bleibt erhalten. Möbel geben keine zusätzliche automatische Produktion, Lagerkapazität oder Belohnung. Haushaltsvorräte bleiben gemeinsam verwaltet; ein weiterer Kühlschrank verdoppelt sie nicht.
- Classic unterstützt Katalog und Bestandsverwaltung bei unveränderter bisheriger Innenraumdarstellung. Fremde Mietwohnungen und öffentliche Gebäude können nicht eingerichtet werden.

## Katalog und Grenzen

| Gegenstand | Basispreis in Cent (1945) | Ab Spieljahr | Geeignete Räume |
| --- | ---: | ---: | --- |
| Holzbett | 18000 | 1945 | Eigene Wohnung: Wohnzimmer, Schlafzimmer |
| Esstisch mit Stühlen | 14000 | 1945 | Hauptraum, Küche |
| Vorratsschrank | 12000 | 1945 | Alle vorhandenen Räume |
| Schreibtisch | 22000 | 1945 | Hauptraum, Büro |
| Küchenherd | 35000 | 1945 | Küche |
| Gewerbefritteuse | 45000 | 1955 | Küche einer Gastwirtschaft |
| Elektrischer Kühlschrank | 80000 | 1955 | Küche |
| Radio mit Beistelltisch | 16000 | 1945 | Hauptraum, Schlafzimmer, Büro |

Preise folgen dem bestehenden Jahresindex. Preise und Freischaltjahre sind vorläufige Spielbalance, keine Behauptung über historische Erfindungsdaten. Unter Wirtschaft → Einrichtung lässt sich `economy.furnishing` konfigurieren, beispielsweise:

```json
{"roomSlots":6,"items":{"bed":{"price":18000,"fromYear":1945}}}
```

Ein Raum hat standardmäßig sechs zusätzliche Stellplätze (konfigurierbar von eins bis sechs), ein Gebäude höchstens 48 gekaufte Gegenstände inklusive Reserve, eine Bestellung höchstens 24 Gegenstände. Vorhandene Räume werden serverseitig aus Immobilie beziehungsweise Betriebsart bestimmt; der Möbelkauf schaltet keine Räume frei.

## Speicherung, Buchung und Vermögen

`src/game/furnishing.js` definiert Katalog, Räume, Werte und Aktionen. `furnishing` liegt direkt auf dem jeweiligen Objekt in `state.properties` oder `state.companies`, mit `revision`, `nextId` und `items`. Jeder Gegenstand speichert ID, Typ, Raum, Stellplatz, Kaufjahr, gezahlten Preis und indexbereinigten Basiswert. Alte Spielstände benötigen keine Migration: Ohne das Feld ist der zusätzliche Bestand leer.

`furnishingOrder` prüft Eigentum, aktiven Betrieb, Revision, Gegenstand, Epoche, Raum, Menge, Kapazität, Angebotspreis und Budget vor der ersten Zustandsänderung. Bestand, Geld und EFS werden innerhalb der bestehenden Spielaktion gemeinsam gespeichert. Eine Anfrage mit bereits verarbeiteter Revision wird abgelehnt; nach einem Verbindungsfehler liest die Oberfläche den Serverstand neu, statt den Kauf automatisch zu wiederholen. `furnishingMove` verwendet dieselbe Revisionsprüfung und verändert weder Geld noch EFS.

Einrichtung gehört zum Gebäude und bleibt bei dessen bestehender Übertragung beziehungsweise Erbschaft dabei. Ihr Zeitwert wird einmal in den Immobilien- beziehungsweise Firmenwert eingerechnet: 60 % des indexierten Basiswerts, vermindert um vier Prozentpunkte je vergangenem Spieljahr bis zu einer Altersuntergrenze von 20 %. Dadurch berücksichtigen auch bestehende, auf dem Gebäudewert beruhende Verkaufspreise, Beleihung und laufende Berechnungen die Einrichtung. Es gibt keine zweite Addition im Nettovermögen und keinen separaten Möbelverkauf.

## Prüfungen und verbleibender Ausbau

`test/furnishing.test.js` deckt Stück-EFS, Wiederholungen, vollständige Ablehnung ungültiger Warenkörbe, Voraussetzungen, Raumgrenzen, Reserve, alte Spielstände und Bewertung ab. `test/e2e/design-furnishing.test.js` nutzt den echten Presenter und die echten Spielaktionen mit einer lokalen Test-Fixture: Mehrraumkauf, Doppelanfrage, aktualisierte physische Modelle, Umstellen, mobile Formulare und Classic. Produktionsdatenbank-Transaktionen werden dadurch nicht ersetzt.

Freie Möbelpositionierung, Transport-/Lieferzeiten, mehrjährige Bauaufträge, umfangreichere Epochenmodelle sowie zusätzliche Produktionswirkungen sind nicht Teil dieses Stands. Die sechs Stellplätze sind ein bewusst begrenztes Aufstellungssystem, kein vollständiger Innenraumeditor.
