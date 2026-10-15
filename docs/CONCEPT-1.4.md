# Turning Point – Zielkonzept 1.4

Stand: 15. Oktober 2026. Grundlage ist das vom Projektinhaber vorgegebene Gesamtkonzept 1.4. Dieses Dokument unterscheidet Zielbild, bereits vorhandene Systeme und noch ausstehende Arbeit. Es erklärt nicht die gesamte Version für fertig.

## Leitlinie

Historische Lebens- und Wirtschaftssimulation ab 1945 bis in die Zukunft, über mehrere Generationen. Beruf, Studium, Anstellung, Selbstständigkeit, Vermietung, Familie und öffentliche Ämter sind kombinierbare Lebenswege. Bestehende Spielstände und funktionierende Systeme bleiben die Grundlage; Classic bleibt als Darstellung verfügbar. V2 erhält eine eigenständige räumliche Gestaltung, inspiriert vom Bedienprinzip der Gilde.

## Ansichten und räumlicher Zusammenhang

1. Landkarte: zoombare Städte, Geburtsort und eigener Besitz. Ziel sind links ein ausklappbares Besitzfenster (Gewerbe, Wohngebäude, Familie, vierte Kategorie noch offen), rechts Zeitung, Einstellungen und Shop.
2. Stadt: bewegliche 3D-Außenwelt, anklickbare Gebäude, erkennbare eigene Objekte und Minikarte. Architektur, technische Einrichtungen und Infrastruktur entwickeln sich mit der Epoche. Nicht jede Stadt hat einen Hafen. Andere Spieler können später räumlich sichtbar werden.
3. Innenräume: jeweils ein Raum, anklickbare Türen, raumbezogene Handlungen. Eigene Betriebe besitzen ein Verwaltungsbüro; öffentliche Gebäude behalten feste Aufgaben. Ausbauten und Einrichtung sollen sichtbar werden.

Die obere Statusleiste soll dieselben Daten und Aktionen in allen drei Ansichten anbieten: Datum, Jahresfortschritt, Währung, EFS, Name, vollständiges Vermögen, Vorrat, Energie, Wohlbefinden, Gesundheit, Nachrichten und Einstellungen. Ein Ortsbesuch ist keine Ummeldung.

## Verbindliche wirtschaftliche Regeln

- Ein EFS entspricht einem Spieltag; ein Jahreszyklus umfasst 365 Tage.
- Eine erfolgreiche manuelle Abholung aus einer einzelnen Firmenkasse ergibt genau 1 EFS. Eine leere Kasse und fehlgeschlagene Anfragen ergeben nichts. Die Bedienung führt zum Büro des Betriebs; es gibt keine Sammelabholung aller Firmenkassen.
- Die Bankautomatik wird pro Gewerbeobjekt mit Coins freigeschaltet, nicht mit Spielgeld. Andere Objekte werden dadurch nicht freigeschaltet. Automatische Überweisungen geben 0 EFS.
- Vorläufige Bankkonfiguration: ab 1990, einmalig 10 Coins pro Betrieb. Der Coinpreis ist eine technische Startkonfiguration, keine vom Konzept endgültig festgelegte Balance. Unter Wirtschaft → Unternehmen sind `bankAdministration.fromYear` und `bankAdministration.unlockCoins` einstellbar. Pausieren und erneutes Aktivieren einer erworbenen Lizenz kosten keine weiteren Coins.
- Die Automatik überweist die positive Firmenkasse nach der täglichen Wirtschafts- und Handelsabrechnung. Der gesamte Kassenbestand wird übertragen. Für Handelsrouten, die einen Kassenbestand benötigen, kann sie pausiert werden. Eine spätere konfigurierbare Betriebsreserve ist noch nicht umgesetzt.
- Einrichtungsbestellungen: 1 EFS pro tatsächlich gekauftem Gegenstand, unabhängig von der Aufteilung auf Bestellungen. Fünf Betten ergeben fünf EFS. Der Warenkorb kann mehrere Räume umfassen; Geld, Einrichtung und EFS werden gemeinsam gebucht. Fehlgeschlagene oder wiederholte Anfragen erzeugen keine weiteren Buchungen. Kostenloses Umstellen und Einlagern gibt keine EFS. Lebensmittelpakete, abstrakte Materialvorräte und Sofortausbauten behalten ihre bisherigen Regeln. Details: [FURNISHING.md](FURNISHING.md).
- Arbeit und weitere berufliche beziehungsweise städtische Aktivitäten können EFS geben. Zusätzliche Werte sind noch abzustimmen. Die bereits vorhandene Echtzeituhr und der Offlinefortschritt bleiben bestehen; EFS erlaubt zusätzliches Vorspulen.

## Gebäude, Qualifikation und Entwicklung

Eigene Gebäude sollen eingerichtet, erweitert und umgebaut werden können, etwa Schenke → Wirtshaus/Restaurant/Pension/Hotel oder Werkstatt → Fabrik. Ausbauvoraussetzungen berücksichtigen Erfahrung und gegebenenfalls Meisterqualifikation. Im Büro jedes passenden Betriebs werden die echten beruflichen Nachweise der Spielfigur gezeigt. Ein Nachweis eines anderen Gewerbes oder nur die Qualifikation eines Partners erzeugt keinen eigenen Meisterbrief.

Vorläufige Bauzeiten des Konzepts: ein bis drei Spieljahre für zusätzliche Räume, etwa fünf Spieljahre für grundlegende Umbauten. Diese Zeiten sind noch nicht in die bestehenden Sofortausbauten eingebaut. Dafür sind persistente Bauaufträge, Fortschrittsdarstellung, Abbruchregeln, Speichermigration und Prüfungen für Offline-/EFS-Fortschritt erforderlich.

## Lebenswege und öffentliche Einrichtungen

- Anstellung: tägliche Arbeit, Lohn, Erfahrung, Beförderungen und zusätzliche Aufgaben; Löhne entwickeln sich mit Beruf, Epoche und Qualifikation. Ein leicht erhöhter EFS-Ertrag gegenüber einzelnen selbstständigen Tätigkeiten ist eine vorläufige Idee, keine neue feste Zahl.
- Studium: Finanzwesen, Medizin und Rechtswissenschaften ab 1950 als vorläufige Freischaltung. Dauer und konkrete Voraussetzungen bleiben abzustimmen.
- Kredite: tragfähige regelmäßige Einkünfte berücksichtigen; Zinssätze, Laufzeiten, Sicherheiten und Grenzwerte historisch entwickeln. Vermietung muss auch ohne Gewerbe möglich bleiben.
- Rathaus: Anmeldung/Ummeldung, amtliche Informationen und Standesamt. Der registrierte Wohnort bleibt bis zur Ummeldung bestehen. Kinder werden nicht allein wegen eines Ortsbesuchs oder automatisch wegen des väterlichen Wohnorts umgemeldet; die künftige Regel ist offen.
- Krankenhäuser: spätere Behandlungen; Kosten, Gesundheitskarten und Detailregeln sind offen. Bestehende Gesundheitsaktionen bleiben erhalten.
- Politik: öffentliche Ämter und Wahlen als kombinierbarer Lebensweg; weitere Verfahren separat ausarbeiten.
- Versorgung: Rohstoffe und Waren aus lokalen, epochenabhängigen Quellen (Markt, Händler, Hafen, Bahnhof, Lager, Großhandel).

## Abgleich mit dem Code

| Bereich | Vorhanden / in diesem Stand umgesetzt | Noch ausstehend |
| --- | --- | --- |
| Zeit | 1 EFS = 1 Tag, 365-Tage-Jahr; bestehender Offline-/Echtzeitfortschritt | Zusätzliche Stadtaktivitäten und endgültige Arbeitsbelohnungen |
| Firmenkasse | Einzelabholung im Büro, genau 1 EFS; gesonderte Coinlizenz je Betrieb; tägliche Automatik ohne EFS | Optionale Liquiditätsreserve und weitergehende zentrale Finanzverwaltung |
| Innenräume | V2-Einzelräume, Türen, begrenzte WASD-/Touch-Kamera; acht bestellbare Möbel/Geräte mit Raumzuordnung und eigenen 3D-Modellen; Einlagern und Umstellen | Freie Platzierung statt fester Stellplätze; umfangreichere Epochenmodelle |
| Nachweise | Passende echte Berufs-/Meisterqualifikation in jedem zugehörigen V2-Büro | Zusätzliche künftige Abschlussarten |
| Statusleiste | Echte gemeinsame V2-Leiste auch im Innenraum; vier bedienbare Zustandsanzeigen; Datum/Jahresring | Vollständige Bewertung sämtlicher Materialien, Gegenstände und externer Aktienpositionen |
| Vermögen | Nettovermögen aus Geld, Firmenwerten/-kassen und Immobilien inklusive zusätzlicher Einrichtung abzüglich Krediten | Bewertungsregeln ohne Doppelzählung für alle übrigen Vermögensarten |
| Welt und Stadt | Karte, 3D-Stadt, eigene Gebäude, standortbezogene Aktionen und Versorgung | Durchgängiges Besitzfenster/rechte Seitenleiste/Minikarte nach Referenz; deutlich detailliertere Epochenmodelle |
| Ausbau | Bestehende qualifikationsabhängige Erweiterungen und Betriebsstufen | Mehrjährige persistente Bauaufträge und damit verknüpfte sichtbare Umbauten |
| Beruf, Studium, Kredit, Vermietung, Familie, Ämter | Bereits vorhandene Systeme bleiben nutzbar | Einzelabgleich mit endgültigen Regeln und Balancing von 1.4 |

## Nächste zusammenhängende Arbeitspakete

1. Persistente Bauaufträge mit Vorschau, Voraussetzungen und Fortschritt; dieselbe Fertigstellung bei normaler Zeit, Offlinefortschritt und EFS-Vorspulen.
2. Einheitliche Besitznavigation und Minikarte in Land-, Stadt- und Innenansicht, mobil einklappbar und ohne Überdeckung von Aktionen.
3. Vollständige Vermögensbewertung und nachvollziehbare Aufschlüsselung; keine doppelte Bewertung von börsennotierten Firmen und deren Aktien.
4. Epochenabhängige Modelle und Infrastruktur weiter ausbauen; Tutorial und nächste sinnvolle Handlung an den aktuellen Lebensweg anpassen.

Offen bleiben insbesondere die vierte Besitzkategorie, konkrete zusätzliche EFS-Werte, Bauzeitberechnung, Löhne/Preise, Studienzeiten, Erfahrungsstufen, Kreditkonditionen, Kinderregistrierung und Krankenhausregeln. Vorläufige Zahlen werden als solche konfiguriert und nicht als endgültige historische Wahrheit ausgegeben.
