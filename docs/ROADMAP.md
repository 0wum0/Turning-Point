# Umsetzungsstand & Roadmap

Stand: Phase 2/3 des Konzepts (technischer Prototyp → Web-Version). Die Kernschleife
**Leben → Arbeit → Einkommen → Ausgaben → Entscheidungen → Familie → Vermögen → Generation → Erbe** ist spielbar.

## Konzept-Abschnitt → Status

| Konzept | Status | Bemerkung |
|---|---|---|
| 1–3 Grundidee, 1945, 20 Jahre, 40 DM | ✅ | Werte im Admin änderbar |
| 4–7 Deutschland, Geburtsort, Umzug, Heimatort der Kinder | ✅ | **Karte → Stadt (Luftansicht zum Verschieben/Zoomen) → Gebäude (3D-Innenansicht mit Aufgaben)**;  48 Städte, Karte mit Zoom/Pan, Umzug kostet Geld **und** Coins (Entfernung zum nächsten eigenen Standort), Geburtsstadt gratis |
| 8 Charaktererstellung | ✅ | Geschlecht, Name, Geburtsstadt, Startberuf, Eltern (Namen/Berufe) |
| 9–10 Vier Lebensmeter | ✅ | Kühlschrank (4 Qualitätsstufen), Wohlbefinden, Erholung, Gesundheit – verzahnt |
| 11 Wohnen | ✅ | Straße (Tod nach ~3 Tagen) → Arbeitgeber → Pension → Miete → Eigentum → Villa |
| 12–14 Berufe, Stufen, Studium | ✅ | Ausbildung kostenlos, 10 Jahre Erfahrung = erlernt, 5 Stufen, 3 kostenpflichtige Studien |
| Berufswandel alle ~20 Jahre | ✅ | Nachfolge-Berufe (Schmied → Maschinenbauer → Mechatroniker …), Stellen entfallen |
| 15, 17, 18 Unternehmen, Räume, Mitarbeiter, Manager | ✅ | Betriebe in der Zeitung (Gewerbe), 3 Stufen je Beruf (z. B. Wirtshaus → Restaurant → Hotel), Räume gegen Geld + Coins, Mitarbeiter, Manager, Firmenkasse, bis zu 30 Betriebe |
| 16 Partner-Beruf eröffnet Betriebe | ✅ | Beruf des zusammenlebenden Partners qualifiziert für Einstiegsbetriebe; verlässt er die Familie, kann der Betrieb zum Lost Place werden |
| 19 Butler | ✅ | füllt Kühlschrank automatisch (ab großem Haus) |
| 20 Politische Ämter | ✅ | 6 Stufen (Ortsbeirat … Bundeskanzler), Wahlkampfkosten, Kraft/Gesundheit, Einkommen wächst, Einfluss bleibt über alle Leben |
| 21 Versicherungen | ✅ | Hausrat, Gebäude, Kranken-Zusatz; ersetzt Schaden, nicht die Ausfallzeit |
| 22–25 EFS (Zeit/Erfahrung) | ✅ | 365 EFS = 1 Jahr, 50/Tag + 50 Login, Karten-Funde, Fortschritts-Boni, Offline-Fortschritt |
| 26–29 Coins | ✅ | Werbung (Platzhalter), 100 Coins je Kind, Preisleiter 50→25→13→7→4→2→1, bleiben über alle Leben |
| 30–34 Familie, Trennung | ✅ | Partner, Kinderwunsch-Zielzahl (max. 13), Kindergeld ~50 %, Trennung halbiert Vermögen/Kinder |
| 34–37 Erbe, Tod, Krankheit | ✅ | Pflichtanteil, Immobilien dem Erben zuordnen, Gesundheitskarten (+10 Lebenstage, ab 1960), Diagnose |
| 38 Insolvenz | ✅ | Game Over bei Konto < 0 (online) |
| 39 Stammbaum | ✅ | inkl. Chronik, Trennungen, Jugendhilfe |
| 40–41 Schule, Weglaufen | ✅ | Grundschule → Haupt/Real/Gymnasium → Ausbildung/Studium; Weglaufen → Suche → Jugendhilfe + Unterhalt |
| 42–45 Zeitung → Internet (2002) | ✅ | Stellen, Wohnungen, Kontakte, Unwetter-Warnungen, Ratgeber; ab 2002 „Das Netz“ |
| 46–48 ⓘ-Hilfen, visuelle Hinweise | ✅ | Problem → Bedeutung → Lösung, leuchtende Hinweise, kein Pflicht-Tutorial |
| 49 Adaptives Glück | ✅ | still, erhöht positive Zufälle bei Not |
| 50 Lotto/Casino | ✅ | freiwillig; Lotto (Verlustgeschäft), Roulette ab 1950/21 Jahren |
| 51–53 Immobilien, Zustand, Lost Places | ✅ | Wert & Zustand; geerbte Betriebe ohne Qualifikation verfallen über ~10 Jahre, wiederbelebbar |
| 54 DM → Euro | ✅ | 2002, Beträge werden halbiert |
| 55–58 Zyklus, 22. Jahrhundert, Neustart | ✅ / ⏳ | Zyklus endet 2100 mit Coin-Bonus, Neustart 1945 mit Meta-Fortschritt; weitere Jahrhunderte = Zieljahr im Admin + neue Berufe |
| 60–68 Monetarisierung | ✅ / 🟡 | Rewarded Ads (simuliert **oder** eigene Anzeigen-Seite per iframe + postMessage, serverseitige Prüfung, Tageslimit), Stripe Checkout + signierter Webhook (idempotent), Dauerkarte (Stripe-Abo, tägliche Vorteile), Offerwall-Postback (HMAC). **Ungetestet gegen echte Konten:** Stripe/Werbenetzwerk/Offerwall – bitte mit Testschlüsseln prüfen. PayPal nicht enthalten |
| 69–71 Web-First, Registrierung, Cloud-Spielstand | ✅ | E-Mail-Bestätigung & Passwort-Reset (mit SMTP) |
| 72 Android/iOS | ⏳ | Web-Version ist bewusst PWA-fähig vorbereitet (API-first) |
| 75–76 Grafik/Audio | ✅ | generative Stadtansichten + Admin-Upload eigener Bilder; Hintergrundmusik und Töne werden im Browser erzeugt (WebAudio, abschaltbar, epochenabhängig) |

✅ umgesetzt · 🟡 teilweise · ⏳ geplant

## Getroffene Annahmen (bitte prüfen)

- **EFS-Pool:** EFS sammeln sich als Vorrat; der Spieler spult die Zeit selbst vor (1/7/30/365 Tage oder alles). Beim Vorspulen hält das Spiel an, sobald etwas Aufmerksamkeit braucht (leerer Kühlschrank, Diagnose, Kind läuft weg …).
- **Offline:** Ab 90 Minuten Abwesenheit laufen die neu aufgelaufenen EFS automatisch ab. Offline-Schutz (abschaltbar): kein Verhungern, keine Insolvenz, automatischer Einkauf; Alterstod ist weiterhin möglich.
- **Partner:** Zeitungs-Kontaktanzeigen enthalten beide Geschlechter; die Trennungsregel („Partnerin nimmt die größere Hälfte“) gilt neutral für Partner:in.
- **Kinderwunsch** ist eine Zielzahl (Standard 3), damit Familien nicht ungewollt wachsen.
- **Pflichtanteil:** Jedes Kind (außer bei der Trennung mitgegangenen) erhält Nachlass/Anzahl; der Erbe bekommt zuerst die ihm zugedachten Immobilien, den Rest in bar; Geschwister verlassen die Simulation.
- **Preise/Löhne** folgen einem Preisindex (im Admin editierbar); Zahlen sind eine erste Balance und müssen anhand von Spielerdaten justiert werden.

## Karte → Stadt → Gebäude (3D)

1. **Karte:** Stadt anklicken → „Stadt ansehen“ (oder Doppelklick).
2. **Stadtansicht:** generierte Satellitenansicht (je Stadt/Epoche), verschiebbar und zoombar. Anklickbar sind Rathaus, Bahnhof, Markthalle, Arztpraxis, Schule, Zeitungsverlag/Medienhaus, Lotto, Pension, Spielbank sowie **alles, was dir gehört** (Wohnung, Häuser, Betriebe, Arbeitgeber – gold umrandet). Im Admin kann je Stadt ein echtes Satellitenbild hochgeladen werden.
3. **3D-Innenansicht** (three.js, lokal gehostet, wird erst beim Betreten geladen, rendert nur bei Bewegung): drehbar, Gegenstände anklickbar (Kühlschrank, Bett, Theke, Rednerpult …).
4. **Aufgaben:** je Gebäude Aufgaben mit Abkühlzeit (Minispiel „goldene Marken sammeln“), die EFS (zählen zum Tageslimit), Einfluss, Erholung u. a. bringen. Server prüft Start, Mindestdauer und Abkühlzeit; Werte und Texte sind im Admin unter Wirtschaft → `tasks` einstellbar.

Hinweis: Die 3D-Räume sind prozedural (Würfel/Zylinder-Stil) – eigene Modelle/Texturen lassen sich später ergänzen.

## Nächste Schritte (Vorschlag)

1. Echte Bilder je Epoche/Stadt (Admin-Upload ist fertig), eigene Musikstücke statt generierter Klänge
2. PayPal als zweiter Zahlungsanbieter, rechtliche Texte (AGB/Widerruf) für den Shop
3. PWA/Capacitor-Hülle für Android/iOS
4. Balancing mit echten Spielerdaten (Admin-Dashboard liefert die Basis), weitere Jahrhunderte/Berufe ab 2025
5. Mehr Zufallsereignisse für Betriebe (Inspektion, Streik, Wirtschaftskrise)
