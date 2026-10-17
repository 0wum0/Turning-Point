# Mehrjährige Betriebsbauaufträge

Stand: 16. Oktober 2026. Dieses Arbeitspaket ersetzt die bisherigen sofortigen Aktionen `bizExpand` und `bizUpgrade` durch gespeicherte Bauaufträge. Wohngebäude nutzen ergänzend die unten beschriebenen Anbauaufträge. Die separaten Betriebsversorgungsmodule (`opsBuild`) behalten vorerst ihre bisherigen Regeln.

## Spielerablauf

Die Bauplanung ist in der Unternehmensverwaltung und am Schreibtisch des Betriebsbüros erreichbar. Vor einer Beauftragung stehen dort Preis, Coinbetrag, Dauer, Voraussetzungen und Abbruchbedingungen. Das bloße Öffnen bucht nichts.

- Ein zusätzlicher Betriebsraum dauert standardmäßig je nach aktueller Stufe **ein, zwei oder drei Spieljahre**.
- Ein Stufenumbau dauert standardmäßig **fünf Spieljahre**.
- Geld und gegebenenfalls der bisherige Coinpreis werden bei Beauftragung bezahlt. Ein Betrieb hat höchstens einen laufenden Bauauftrag.
- Bis zur Fertigstellung bleiben bisherige Räume und Produktionswerte erhalten. Der bestehende Betrieb arbeitet weiter, soweit seine bisherigen Voraussetzungen erfüllt sind.
- Jeder tatsächlich simulierte Spieltag zählt einmal: normale Uhr, Offlinezeit und EFS-Vorspulen nutzen dieselbe Tagesfunktion. EFS zu besitzen oder zu verdienen erhöht allein noch keinen Baufortschritt.
- Fehlende Qualifikation für die Zielstufe oder ein stillgelegter Betrieb pausieren den Bau. Nach Wiederherstellung der Voraussetzungen läuft er weiter. Der Restzeitraum bleibt erhalten; das angezeigte Fertigstellungsdatum verschiebt sich entsprechend.
- Erst bei Fertigstellung werden Räume/Stufe, Gebäudebasiswert und gegebenenfalls der Name geändert. Die bestehende konfigurierte Ausbaubelohnung (`efs.awards.buy_property`) wird dann einmal vergeben. Sie wurde nicht durch einen neuen frei erfundenen EFS-Wert ersetzt. Die Fertigstellung erzeugt eine Nachricht, aber keinen eigenen Vorspul-Stopp.

## Darstellung

Verwaltung und Innenraum zeigen denselben serverseitigen Fortschritt mit Resttagen, Ziel und Fertigstellungsdatum. Auf der 3D-Stadtansicht stehen Gerüste und Absperrungen am betroffenen Gebäude; die Gerüststufe ändert sich pro Viertel des Baufortschritts. Nach Fertigstellung verschwindet das Gerüst, das vorhandene Modell berücksichtigt die neue Stufe und Raumzahl. Beim Verlassen des Büros wird die Stadt mit aktuellen Daten neu aufgebaut.

Die Zahl der Betriebsräume bleibt die wirtschaftliche Kapazität des vorhandenen Systems. Bereits vorhandene Räume bleiben in ihren bisherigen Bedienbereichen zusammengefasst. Neu fertiggestellte Raumausbauten und die zusätzliche Kapazität von Stufenumbauten erhalten jetzt jeweils einen eigenen begehbaren Raum; siehe unten. Frei gezeichnete Grundrisse bleiben offen.

## Abbruch, Wert und Besitzwechsel

Ein Abbruch benötigt im Dialog einen ausdrücklichen zweiten Klick. Er erstattet den ungenutzten Geldanteil entsprechend `Resttage / vereinbarte Bauzeit`. Coins und bereits verbrauchte Bauleistungen werden nicht erstattet; aus einem abgebrochenen Auftrag entstehen keine EFS. Der Auftrag verschwindet, die vorherige Kapazität bleibt bestehen.

Der Geldanteil wird indexbereinigt gespeichert und für Erstattung und Anzeige zum aktuellen Jahresindex bewertet. Dadurch passen Währungswechsel und Verkäufe zwischen Figuren verschiedener Epochen zusammen. Die Oberfläche nennt ihn deshalb „Auftragswert zu heutigen Preisen“. Rückzahlungen werden als Geldzufluss in der Statistik erfasst.

Der bereits finanzierte Ausbauwert zählt während des Baus einmal zum Firmenwert. Nach Abschluss geht derselbe Basiswert in den Gebäudewert über; es gibt keine doppelte Addition. Veräußerte und vererbte Firmen nehmen ihren Auftrag mit. Beim Spielerhandel wird nur der technische Tagesanker auf den Käuferkalender gesetzt; Fortschritt, vereinbarte Dauer und Ziel bleiben erhalten. Eine fehlende Zielqualifikation des neuen Besitzers pausiert den Auftrag.

## Technik und Konfiguration

`src/game/construction.js` verwaltet Aufträge direkt unter `company.construction`: Art, Dauer, verstrichene Tage, zuletzt verarbeiteter Tag, Kaufbetrag, indexbereinigter Betrag, Coins, Zielstufe, Zielräume und späterer Basiswertzuwachs. Ohne dieses Feld ist kein Bauauftrag vorhanden; vorhandene ausgebaute Gebäude werden nicht zurückgesetzt. `constructionRevision` schützt auch nach Abbruch und Neubestellung vor alten Anfragen.

Vor der Zahlung prüfen die Aktionen Eigentum, aktiven Betrieb, Qualifikation, Stufengrenzen, Budget, Coins, Revision sowie den angezeigten Preis und die angezeigte Dauer. Die bestehende Charaktertransaktion speichert Geld und Auftrag zusammen. Abbruch prüft Revision und aktuellen Erstattungsbetrag. Nach Kommunikationsfehlern liest die Oberfläche den Serverstand, statt die Mutation automatisch zu wiederholen.

Unter Wirtschaft → Betriebe & Politik:

```json
{"construction":{"roomYears":[1,2,3],"upgradeYears":5}}
```

Raumbauzeiten sind auf ein bis drei Jahre begrenzt, Umbauzeiten auf ein bis zehn Jahre. Änderungen gelten für neue Aufträge. Alle Werte sind vorläufige Spielbalance gemäß Konzept 1.4.

Prüfungen: `test/construction.test.js`, angepasster Ausbauabschnitt in `test/business.test.js` und `test/e2e/design-construction.test.js`. Die Browser-Fixture nutzt echte Spielaktionen und Presenter; eine echte Produktionsdatenbank ist nicht Teil dieser UI-Prüfung.


## Wohngebäude: Bauauftrag und individuelle Räume

Die Immobilienverwaltung und der Schreibtisch eigener Häuser öffnen „Wohnraum erweitern“. Auch kleine Wohnungen haben einen direkten Bauplanungsbutton im Innenraum. Mietwohnungen und öffentliche Gebäude lassen sich nicht auf eigene Rechnung erweitern.

- Raumtyp wählen: Schlafzimmer (vorläufig 1 Jahr), Arbeitszimmer (2 Jahre), Wohnzimmer (3 Jahre). Preis und Dauer vor Zahlung prüfen. Es läuft ein Auftrag je Immobilie; Standard und technische Obergrenze sind vier zusätzliche Räume.
- Der vorläufige Preis beträgt 50 % des ursprünglichen Zimmer-Basispreises des Gebäudetyps, skaliert nach Jahresindex, Stadt und Baukosten. Bereits gekaufte Möbel und frühere Anbauten verteuern die nächste Bestellung nicht zusätzlich. Es werden keine Coins verlangt.
- Normale Tage, Offlinezeit und EFS-Vorspulen verwenden dieselbe Tagesfunktion. Gebäudesperre oder Zustand unter 30 % pausieren den Bau, ohne Tage nachträglich anzurechnen. Nach Reparatur läuft die vereinbarte Restzeit weiter. Der Abschluss erzeugt keinen zusätzlichen Vorspul-Stopp.
- Erst die Fertigstellung erhöht `property.rooms` und den operativen Gebäudebasiswert. Der neue Wohnraum zählt dann für den eigenen Haushalt. Unterhalt, Versicherungsprämien und Instandsetzung berechnen sich während des Baus weiter aus dem bisherigen Gebäude und vorhandenen Möbeln. NPC-Marktmieten folgen erst danach dem erweiterten Gebäude. Bestehende Spieler-Mieten bleiben vertraglich unverändert; die neue Zimmerzahl wird bei der nächsten Vertragsabstimmung aus dem veröffentlichten Eigentümerstand übernommen.
- Jeder fertige Anbau besitzt eine stabile Raum-ID, einen Typ und einen eigenen Namen. In V2 verbindet ein zusätzlicher Flur die ursprünglichen Wohnbereiche mit den Anbauten. Es ist stets nur ein Raum sichtbar. Türen, Raumregister und Einrichtungskatalog erreichen dieselben Räume. Der Flur ist ein Bedienbereich, zählt nicht als zusätzlicher Wohnraum und lässt sich nicht mit Möbeln blockieren.
- Neue Räume haben ihre zum Typ passende räumliche Gestaltung; Möbel werden separat gekauft. Bis zu sechs Stellplätze je Raum, maximal 48 gekaufte Gegenstände je Gebäude. Schlafzimmer nehmen beispielsweise Betten auf, Arbeitszimmer Schreibtische. Bestehende Möbelfunktionen und Stück-EFS gelten auch hier. Die alten Wohnbereiche werden nicht umbenannt oder entfernt.
- Classic erhält dieselbe Bauplanung, Fortschrittsanzeige und Einrichtungsauswahl. Die einzeln betretenen 3D-Räume gehören zu V2.
- Während des Baus sind dieselben Gerüstphasen wie bei Betrieben sichtbar. Nach Fertigstellung entstehen am Außenmodell eigene Anbauteile: zwei seitliche Bereiche und bei weiteren Räumen eine zweite Etage. Schlafräume erhalten frühzeitliche Fensterläden, Büros größere Fenster mit Überdachung, Wohnräume breitere Fenstergruppen. Frühe Epochen verwenden Satteldächer; moderne Epochen Flachdächer. Die Form bleibt innerhalb der reservierten Gebäudefläche. Das ist eine prozedurale Darstellung des Ausbaus, kein frei gezeichneter Bauplan.

Abbruch mit zweiter Bestätigung erstattet nur den noch ungenutzten, aktuell indexierten Geldanteil. Alte Räume und Möbel bleiben erhalten. Der finanzierte Ausbau zählt einmal zum Vermögen; bei Fertigstellung geht derselbe Basiswert in das Gebäude über. Bauverträge, fertige Raum-IDs und Möbel bleiben bei Verkauf und Vererbung am Objekt. Beim Spielerhandel wird der Tagesanker auf den Käuferkalender gesetzt.

Für Wohnraumausbau werden vorläufig keine neuen EFS-Belohnungen eingeführt, da deren genaue Höhe im Konzept offen ist. Möbelbestellungen erzeugen weiterhin 1 EFS je gekauftem Gegenstand.

Konfiguration unter Wirtschaft → Wohnraumausbau (`economy.homeConstruction`):

```json
{"maxExtensions":4,"pricePct":50,"years":{"bedroom":1,"office":2,"main":3}}
```

`maxExtensions` ist auf 1–4, `pricePct` auf 10–200 und jede Bauzeit auf 1–3 Jahre begrenzt. Änderungen gelten nur für neue Verträge. Alte Spielstände benötigen keine Migration und erhalten keine kostenlosen Anbauten. Bestehende wirtschaftliche Zimmerzahlen werden nicht rückwirkend in beliebig viele 3D-Räume aufgeteilt.

Technik: `src/game/home-construction.js`, `property.construction`, `property.constructionRevision` und `property.extensions`; gemeinsame Raumdefinitionen in `furnishing.js`. Tests: `test/home-construction.test.js` und `test/e2e/design-home-construction.test.js`. Die Multiplayer-Kapazitätsabstimmung ist zusätzlich mit einem Datenbankstub geprüft; ein Produktionsdatenbanktest wird dadurch nicht ersetzt.


## Individuelle Betriebsräume

Bei einem zusätzlichen Raum lässt sich jetzt vor Beauftragung die räumliche Nutzung wählen: ein zum Gewerbe benannter Arbeitsraum (z. B. Backstube, Schmiedewerkstatt oder Salon), Lagerraum oder Büro; im Gastgewerbe zusätzlich Küche. Diese Wahl verändert keine Löhne, Produktionsmultiplikatoren oder Lagerkapazitäten. Wirtschaftliche Kapazität wächst weiterhin nur durch die bestehende Raumzahl. Die separaten Lager-/Versorgungsmodule bleiben erforderlich.

Der angenommene Vertrag speichert `addedRooms` mit festen IDs, Namen und Raumtypen. Bei Fertigstellung gehen sie in `company.extensions` über. Stufenumbauten erzeugen genau so viele neue Arbeitsräume, wie wirtschaftliche Raumkapazität hinzukommt. Bestehende Raum-IDs und Möbel bleiben erhalten. Alte laufende Verträge ohne dieses Feld erhalten bei Abschluss passende Arbeitsräume; alte abgeschlossene Kapazitäten werden beim bloßen Laden nicht umgeschrieben.

Die Räume besitzen eigene Einrichtung, passende Arbeitsflächen und Zugänge zu vorhandenen Spielaktionen. Zusätzliche Büros verwenden dieselbe Firmenkasse und Banklizenz und zeigen die echten Qualifikationsnachweise. Eine zweite Abholstelle dupliziert weder Geld noch EFS. Küchen nutzen bestehende Betreuungsaufgaben und unterstützen passende Küchenmöbel.

Je vier Zusatzräume teilen sich einen Flurabschnitt. Die Flure sind verbunden und führen zurück zum Hauptraum; höchstens sieben Türen stehen in einem Abschnitt. Zusätzliche Raumgeometrie wird erst beim Betreten aufgebaut. Bei vielen Räumen ersetzen beschriftete Auswahllisten die langen Buttonreihen in Innenansicht und Einrichtung. Das bestehende Maximum von 50 Betriebsräumen wird damit unterstützt; die bisherige Gesamtgrenze von 48 gekauften Möbelstücken je Gebäude bleibt bestehen. Ein Stufenumbau bleibt über das bestehende Außenmodell sichtbar. Fertiggestellte Zusatzräume bilden jetzt eigene Gewerbeflügel; Details siehe unten.

Prüfungen: `test/business-rooms.test.js` sowie `test/e2e/design-business-rooms.test.js` (Raumauswahl, echte Geldabholung, Einrichtung, 50 Räume, verbundene Flure und Mobilansicht). Der Wohnhaus-Browsertest prüft außerdem die neuen Anbauteile und ihre Dächer in frühen und modernen Epochen.


## Sichtbare Gewerbeflügel

Die 3D-Außenansicht gruppiert fertiggestellte Zusatzräume nach ihrer gespeicherten Nutzung in bis zu vier kompakte Flügel: Arbeitsbereich, Büro, Lager und gegebenenfalls Küche. Anzahl und Nutzung bestimmen Fensterreihen, Tiefe und bis zu drei Geschosse. Lager erhalten ein Tor, Büros größere Fenster und Küchen sowie Back-/Schmiedearbeitsräume einen Abzug. Frühe Epochen verwenden Ziegeldächer, moderne Flach- beziehungsweise industrielle Sägezahndächer. Dach- und Fassadentexturen verwenden dieselben Materialien wie das Stammgebäude.

Die Darstellung ist eine kompakte Außenansicht und kein maßstäblicher Grundriss jedes Innenraums. Alle fertiggestellten Raum-IDs sind ihren Flügeln zugeordnet. Laufende Aufträge erzeugen weiterhin nur das Gerüst; abgebrochene oder unfertige Räume erscheinen nicht als Flügel. Gebäude ohne gespeicherte Zusatzräume behalten ihr bisheriges Modell. Die bisherige wirtschaftliche Kapazität und alle Baukosten bleiben unverändert.

Technik: `public/js/game/business-annex.js`, eingebunden in `city-buildings.js`. Browserprüfung: `test/e2e/design-possessions.test.js` prüft 47 zusätzliche Räume, unterschiedliche Gewerbe, Epochen, begrenzte Gebäudefläche und Altbestände.
