# TURNING POINT · Life. Work. Legacy.

Generationenübergreifende Lebens-, Wirtschafts- und Familiensimulation (Web-First).
Node.js + Express + MySQL/MariaDB – läuft auf **Hostinger Business (Node.js-Web-App)**.

Enthalten sind:

| Teil | Beschreibung |
|---|---|
| **Installer** | Web-Assistent unter `/install` (System-Check, DB-Test, Schema, Startdaten, Admin-Konto) |
| **Spiel** | Charaktererstellung, EFS-Zeitsystem, Meter, Wohnen, Beruf/Ausbildung/Studium, Zeitung/Web, Karte, Umzug, Familie, Erbe, Generationen, Coins |
| **Admin-Panel** | Dashboard, Spieler- & Charakter-Editor (alles änderbar), Städte, Berufe (Schnell-Editor), Finanzen, Medien, Einstellungen (Baum-Editor für alle Werte inkl. Aufgaben/Ereignisse/Startseite), Werkzeuge, Backup/Import, Logs, Protokoll |
| **Design** | Eigenes Design-System „Nachtdruck“ (dunkel/hell, Epochen-Akzente), lokal gehostete Schriften & Icons |

---

## 1. Warum der Daten-Ordner **außerhalb** des Node-Ordners liegt

Bei Hostinger-Node.js-Apps wird der App-Ordner bei jedem Deploy/Redeploy neu aufgebaut.
Alles, was bleiben muss, liegt deshalb in `turning-point-data/` **neben** der App:

```
/home/uXXXX/domains/deine-domain.de/
├── nodejs/                  ← App (wird beim Deploy ersetzt)
├── public_html/             ← Hostinger Web-Root
└── turning-point-data/      ← DATEN (bleibt bei jedem Redeploy erhalten)
    ├── config.json          ← DB-Zugang, Session-Secret (Rechte 0600)
    ├── install.lock
    ├── uploads/             ← Bilder (Städte, Medien) – werden unter /media ausgeliefert
    └── logs/app.log
```

Die App findet den Ordner automatisch (Reihenfolge):
`TP_DATA_DIR` → `../turning-point-data` → `~/turning-point-data` → `./data` (Notnagel, **geht beim Redeploy verloren**).
Im Admin-Panel unter **System** siehst du jederzeit, welcher Ordner gewählt wurde; der Installer warnt bei einem flüchtigen Ordner.

> Nach einem Redeploy ist alles sofort wieder da: Konfiguration, Uploads und die komplette MySQL-Datenbank bleiben erhalten.
> Ging der Daten-Ordner einmal verloren, erkennt der Installer die vorhandene Datenbank und legt **nur** die Konfiguration neu an (Wiederverbindung, keine Daten werden verändert).

## 2. Deployment auf Hostinger Business

1. **hPanel → Websites → Datenbanken → MySQL-Datenbanken**: Datenbank + Benutzer anlegen (Namen/Passwort notieren).
2. **hPanel → Websites → Website hinzufügen → Node.js-Web-App**
   - Repository `0wum0/Turning-Point` per GitHub verbinden (oder ZIP hochladen)
   - Node-Version: **20 oder 22**
   - Startdatei: `server.js` · Build-Befehl: `npm install` (kein Build-Schritt nötig)
3. **Umgebungsvariablen** (hPanel → Node.js-App → Environment variables), empfohlen:
   - `TP_INSTALL_KEY` = ein langes Zufallspasswort (schützt den Installer, bis er benutzt wurde)
   - optional `TP_DATA_DIR` = `/home/uXXXX/domains/deine-domain.de/turning-point-data`
4. Deployen, dann `https://deine-domain.de/install` öffnen und den Assistenten durchlaufen:
   System-Check → Datenbank (Host meist `localhost`) → Seite & Admin → Installation.
5. Fertig: Anmelden, Admin-Panel unter `/admin`.
   Danach im Admin-Panel unter **Einstellungen → Rechtliches** Impressum & Datenschutz pflegen und unter **E-Mail (SMTP)** den Mailversand einrichten (Hostinger: `smtp.hostinger.com`, Port 465).

**Updates:** Neuen Code pushen/deployen – Datenbank-Änderungen laufen beim Start automatisch als versionierte Migrationen (`src/db/migrations.js`).

### Umgebungsvariablen (alle optional)

| Variable | Wirkung |
|---|---|
| `PORT` | Wird von Hostinger gesetzt |
| `TP_DATA_DIR` | Pfad des Daten-Ordners (außerhalb der App!) |
| `TP_INSTALL_KEY` | Schutzschlüssel für den Installer |
| `TP_DB_HOST/PORT/NAME/USER/PASS` | Alternativ zur `config.json`: DB-Zugang aus der Umgebung |
| `TP_SESSION_SECRET`, `TP_SITE_URL` | nur zusammen mit den `TP_DB_*`-Variablen relevant |
| `TP_API_RATE` | API-Anfragen/Minute je Spieler (Standard 180); skaliert auch die Bremsen für Handel/Verzeichnis |
| `TP_TRUST_PROXY` | Anzahl der Proxys vor der App (Standard 1 = Hostinger; `0` = direkt erreichbar) oder Liste (`loopback, 10.0.0.0/8`) |
| `TP_IP_RATE`, `TP_WEBHOOK_RATE` | Anfragen/Minute je IP für Seiten (300) bzw. Webhooks (300) |
| `TP_SSE_PER_IP`, `TP_SSE_TOTAL` | Obergrenzen für Live-Verbindungen je IP (15) und insgesamt (800) |

### Redeploy ohne Neuinstallation (wichtig!)

Hinterlege die Datenbank-Zugangsdaten **einmalig als Umgebungsvariablen** in Hostinger (Node.js-App → Environment variables). Sie überleben jedes Redeploy; die App startet dann ohne Installer, auch wenn die Konfigurationsdatei fehlt:

```
TP_DB_HOST=localhost
TP_DB_PORT=3306
TP_DB_NAME=u123456789_turningpoint
TP_DB_USER=u123456789_tp
TP_DB_PASS=…
TP_DATA_DIR=/home/uXXXX/domains/deine-domain.de/turning-point-data   # Bilder/Uploads dauerhaft
```

Der Installer zeigt dir diese Werte am Ende zum Kopieren an. Das Session-Geheimnis wird dauerhaft in der Datenbank gespeichert. Ist die Datenbank mit diesen Variablen noch leer, bietet die App den Installer an (Zugangsdaten sind vorausgefüllt).

## 2b. Zahlungen, Werbung, Offerwall (Admin → Einstellungen)

- **Stripe:** Modus `stripe`, Secret Key und Webhook-Secret eintragen. Webhook in Stripe auf `https://DEINE-DOMAIN/webhooks/stripe` mit den Ereignissen `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`. Für die Dauerkarte die Preis-ID (`price_…`) eintragen. Gutschriften sind idempotent (Stripe-Session-ID).
- **Belohnungswerbung:** Anbieter `simulated` (Platzhalter) oder `custom`: URL einer Anzeigen-Seite deines Netzwerks, die per iframe lädt und nach Abschluss `window.parent.postMessage({type:"tp-ad-complete"}, "*")` sendet. Der Server prüft zusätzlich Mindestdauer, Einmaligkeit und Tageslimit. Die Herkunft der URL wird automatisch in der CSP (`frame-src`) freigegeben.
- **Offerwall:** iframe-URL (`{uid}` = Spieler-ID) und Postback `GET /webhooks/offerwall?uid=&coins=&txid=&sig=` mit `sig = HMAC-SHA256(Geheimnis, "uid|coins|txid")`.
- Im Modus `test` werden Käufe ohne Zahlung gutgeschrieben – nur zum Testen, vor dem Livegang auf `stripe` oder `off` stellen.

## 2c. Admin-Panel im Überblick

- **Spieler:** Liste mit Filtern/Sortierung/Sammelaktionen; je Spieler Konto komplett editierbar (Name, E-Mail, Rolle, Coins, EFS, Dauerkarte, Meta-Daten, Passwort), „Als Spieler einloggen“ (Admin-Ansicht mit Rückweg), Sitzungen beenden, Käufe/Werbung/Protokoll.
- **Charaktere:** jeder Spielstand editierbar – Felder (Geld, Meter, Datum, Status, Wohnort …), alle Bereiche (Immobilien, Betriebe, Kinder, Partner, Beruf, Stammbaum …) im Baum-Editor, Schnellaktionen (heilen, wiederbeleben, Tage vorspulen, Geld buchen, Beruf erlernt, Tod auslösen, Meldung senden) und Roh-JSON.
- **Einstellungen:** jede Zahl, jeder Text und jede Liste (Preise, Löhne, Aufgaben, Betriebe, Ämter, Ereignis-Wahrscheinlichkeiten, Startseite, Ankündigungs-Banner) per Formular; „Standard“ setzt zurück; „Experten“ zeigt wirklich alle Werte.
- **Städte/Berufe:** Tabellen direkt editierbar, Duplizieren, Löschen (geschützt, wenn in Spielständen verwendet), Lohn-Faktor für alle Berufe.
- **Zeitung & Eilmeldungen:** Eilmeldungen/Nachrichten veröffentlichen (Stadt, Zeitraum), alle automatisch erzeugten Stadtnachrichten je Jahr einsehen, sämtliche Zeitungstexte (Nachrichten-Vorlagen, Straßen, Pensionen, Kontakttexte, Beschriftungen, Ratgeber) unter Einstellungen → „Zeitung & Texte“ ändern.
- **Dashboard & Analytics:** Kennzahlen mit Verlauf, Charts (Wachstum, Aktivität, Umsatz, Logins, Coins/Spielgeld, Berufe, Städte, Wohnformen, Vermögen, Generationen, Lebensmeter), Kohorten-Bindung und Spieler-Trichter; Zeitraum 14–180 Tage.
- **Anti-Cheat:** serverseitige Engine (Bot-Takt, Anfrage-Flut, zu schnelle Aufgaben/Werbung, Mehrfachkonten/IP-Sharing, Zeit-/EFS-Manipulation, unmögliche Einnahmen, Coin-Zufluss, Datenintegrität) mit Risiko-Score, Verdachtsliste, IP-Gruppen, Voll-Scan und optionaler automatischer Sperre (Einstellungen → Anti-Cheat).
- **Finanzen, Werkzeuge, Backup:** Käufe/Erstattungen/Gutschriften, Coins an Gruppen, Meldung an alle Spieler, Aufräumen, Konfig-/Vollsicherung herunterladen und einspielen, Server-Log mit Filter.

## 2c2. Spieler untereinander (Gemeinschaft)

Im Spiel unter **Spieler**: inflationsbereinigte **Ranglisten** (Vermögen, Unternehmer, Politik, Dynastie, Familie, Zeitreise; gesamt, Stadt oder Freunde), öffentliche **Profile**, **Freunde**, **Briefe**, **Stadtplatz-Chat** je Stadt (mit Wortfilter, Tempolimit, Meldefunktion), **Geschenke** (Tageslimits, Gebühr, keine Geschenke zwischen Konten mit gleicher IP) und **Besuche in Spielerbetrieben** (Gast zahlt, Besitzer verdient, beide steigern Wohlbefinden bzw. Umsatz). Ereignisse anderer Spieler erscheinen als „Spielerwelt“ in der Zeitung der Stadt; Übersicht und Menü zeigen Rang, Online-Spieler und neue Briefe. Jeder Spieler kann sich unsichtbar schalten. Im Admin unter **Community**: Meldungen, Chat und Briefe moderieren, stummschalten, Rangliste ausblenden/neu berechnen, Geschenk-/Besuchslog, Mitteilung an alle; alle Limits unter Einstellungen → Community. Anti-Cheat prüft Geschenk-Ringe und Chat-Spam.

### Spieler als Chefs, Mitarbeiter und Ehepartner

- **Arbeit:** Spieler mit eigenem Betrieb schreiben Stellen aus (Mitarbeiter oder Betriebsleitung, Tageslohn innerhalb der Grenzen aus Einstellungen → Community), laden Spieler ein oder wählen aus Bewerbungen. Der Mitarbeiter arbeitet im Beruf des Betriebs (Erfahrung, vereinbarter Lohn jeden Spieltag); im Betrieb steigen Produktivität und Lohnkosten. Kündigen, Entlassen, Umzug, Betriebsschließung und Tod beenden das Verhältnis automatisch.
- **Beziehung & Hochzeit:** Anfrage → Paar → Heiratsantrag → Hochzeit (beide stimmen zu, Kosten werden geteilt). Der Partner ist ein echter Spieler: Beruf qualifiziert für Betriebe, gemeinsame Kinder erscheinen bei beiden, Trennung/Scheidung nur bewusst (Scheidung: Abfindung des Verursachers), Ehepartner erbt einen Anteil am Bargeld.
- **Technik:** Die Spielstände bleiben getrennt und werden beim Laden abgeglichen (`src/lib/bonds.js`); Geld wandert nie unkontrolliert zwischen Konten (Lohn-Obergrenze, keine Jobs/Geschenke zwischen Konten mit gleicher IP, Tageslimits). Admin: Community → „Jobs & Ehen“.

## 2d. Animationen

Startseite, Anmeldung, Spiel und Admin sind durchgehend animiert (`public/js/motion.js`, `public/css/motion.css`): Aurora-Hintergrund mit Partikeln, Wort-für-Wort-Überschrift mit Goldglanz, Scroll-Reveal, hochzählende Zahlen (Geld/EFS/Coins mit Aufleuchten), füllende Meter-Ringe, Spotlight und 3D-Tilt auf Karten, Ripple auf Buttons, Konfetti bei Erfolgen, Seitenblättern im Zeitungs-Leser, gezeichnete Charts im Admin. Im Spiel schaltet der Funken-Knopf in der Kopfzeile alles ab; „Bewegung reduzieren“ des Betriebssystems wird respektiert.

## 2e. Einsteiger-Erlebnis

Ziel: Wer das Spiel zum ersten Mal öffnet, soll in etwa fünf Minuten wissen, was zu tun ist – ohne dass eine Funktion entfällt. Alles ist reine Oberfläche: Der Server sperrt nichts.

| Baustein | Was es tut | Wo es liegt |
|---|---|---|
| **Willkommensdialog** | Vier kurze Folien beim ersten Start (Ausgangslage, Echtzeit-Uhr und EFS, die vier Anzeigen, wo man klickt). Jederzeit über den „?“-Knopf im Kopfbereich erneut zu öffnen. „Gesehen“ steht in `users.meta.welcomed`. | `public/js/game/onboarding.js` |
| **„Deine ersten Schritte“** | 16 geordnete Aufgaben als einklappbare Karte oben in der Übersicht, mit Fortschrittsbalken. Sie erfüllen sich selbst aus dem Spielstand (Wohnung, Arbeit, Lohn, gefüllter Kühlschrank …). Pro Aufgabe ein Satz „Warum?“, ein Knopf **Zeig mir’s** (öffnet die richtige Seite und lässt die passende Schaltfläche pulsieren, mit Sprechblase) und eine kleine einmalige Belohnung (EFS bzw. 1 Coin, höchstens einmal pro Konto in `users.meta.questRewarded`). | `src/game/onboarding.js` (`QUESTS`), Fortschritt in `state.flags.quests` |
| **„Was jetzt?“** | Berechnet aus dem Spielstand die eine wichtigste nächste Handlung (Hunger, keine Unterkunft, keine Arbeit, beschädigtes Haus, offene Entscheidung bei Kindern, Kredit, brachliegendes Geld …), mit Begründung in einfacher Sprache und Ein-Klick-Knopf (z. B. Essen kaufen). Daneben die nächsten zwei Empfehlungen. | `advise()` in `src/game/onboarding.js` |
| **Schrittweises Freischalten** | Unternehmen, Gesellschaft, Markt, Börse, Wahlen, Bank und Wettbewerb erscheinen zunächst mit Schloss und dem Hinweis „Wird freigeschaltet, wenn …“. Sie öffnen sich durch die passende Aufgabe, durch vorhandenen Besitz oder nach 6 Spieljahren. Schalter **„Alle Funktionen anzeigen“** im Hilfe-Menü und unter *Konto → Anzeige im Spiel* (`users.meta.showAll`). | `UNLOCKS` / `unlocks()` |
| **Glossar** | Antippbare Begriffe (`term('EFS')` in `ui.js`) mit kurzer Erklärung, dazu eine Glossar-Seite mit Suche (Hilfe-Menü). | `public/js/game/glossary.js` |
| **„Worum geht es hier?“** | Auf jeder Seite ein bis zwei Sätze mit Knopf „Zeig mir den wichtigsten Knopf“; ausblendbar, im Hilfe-Menü wieder einblendbar. | `INTROS` in `onboarding.js` |

**Technik.** Neue Charaktere starten mit leerem `flags.quests`. Ältere Spielstände und Erben haben das Feld nicht: `upgradeState` legt es mit `legacy: true` an, und der nächste Abgleich übernimmt bereits Erfüllbares **still** (ohne Belohnung). Aktionen, die der Spielstand nicht selbst festhält (Zeitung geöffnet, Markt-Angebot, Wahl, Freundschaft), meldet die Oberfläche über die Aktion `seen` (Liste der erlaubten Schlüssel in `SEEN_KEYS`); jede ausgeführte Spielaktion wird in `flags.quests.acts` vermerkt. Aufgaben, Berater und Freischaltungen sind reine Funktionen und in `test/onboarding.test.js` getestet. Englische Texte: `src/i18n-data/client-I.js` (Oberfläche) und `src/i18n-data/messages-I.js` (Server-Texte).

## 3. Lokale Entwicklung

```bash
npm install
TP_DATA_DIR=/tmp/tp-data PORT=3000 npm start      # dann http://localhost:3000/install
npm test                                           # Engine-Tests (ohne Datenbank)
```

Benötigt MySQL ≥ 5.7 oder MariaDB ≥ 10.3 (utf8mb4).

## 3b. Tests

- `npm test` – schnelle Unit-Tests (ohne Datenbank), inkl. `test/security.test.js` und `test/maintenance.test.js`.
- `npm run test:e2e` – Browser-Rundgang mit zwei frischen Spielern (Registrieren, Charakter, Essen, Wohnen, Job, Vorspulen, Karte, Zeitung, Stadtplatz-Chat, Briefe, Glocke, Vermieten an Spieler, Marktangebot, Auktion, Börsengang und Aktienkauf, Adoption, Sicherheitsprüfungen, englische Oberfläche). Nicht Teil von `npm test`.
  - Voraussetzungen: laufende MariaDB/MySQL, [Playwright](https://playwright.dev) mit Chromium (`TP_PLAYWRIGHT_PATH` zeigt auf das Paket, falls es nicht im Modulpfad liegt; `PLAYWRIGHT_BROWSERS_PATH` für den Browser-Ordner).
  - Die Suite legt eine **eigene** Datenbank an (Standard `tp_e2e`, wird jedes Mal gelöscht und neu erzeugt) und startet die App selbst auf Port 3290 mit eigenem Daten-Ordner – ein laufender Entwicklungsserver bleibt unberührt.
  - Einstellungen per Umgebung: `TP_E2E_PORT`, `TP_E2E_DB_NAME`, `TP_E2E_DB_USER`/`TP_E2E_DB_PASS`/`TP_E2E_DB_HOST`; für das Anlegen der Datenbank `TP_E2E_ADMIN_USER`/`TP_E2E_ADMIN_PASS` (Standard: `root` über `/run/mysqld/mysqld.sock`, sonst zusätzlich `TP_E2E_ADMIN_HOST`). `TP_E2E_HEADED=1` zeigt den Browser.
  - Für die Tests sind Alters- und IP-Sperren zwischen den Testkonten gelockert (siehe `test/e2e/prepare-db.js`).

## 3c. Aufräumen alter Daten

`src/lib/maintenance.js` löscht täglich (in kleinen `DELETE … LIMIT`-Schritten) alte Chat-Nachrichten (30 Tage), gelesene Briefe (180), Zeitungsmeldungen (90), Weltereignisse (60), beendete Angebote/Versteigerungen/Gebote (30), erledigte Börsenorders (30), Börsengeschäfte (180), beendete Mietverträge (90) sowie abgelaufene und anonyme Sitzungen. Die Fristen stehen unter Admin → Einstellungen → „Aufräumen“.

## 4. Architektur in Kürze

```
server.js                  Einstieg; ohne Konfiguration läuft nur der Installer
src/config.js              Pfadlogik (Daten-Ordner), config.json
src/install/installer.js   Installer-API (Check, DB-Test, Install, Wiederverbindung)
src/db/                    Pool, Migrationen, Startdaten (48 Städte, 31 Berufe)
src/settings.js            Alle Spiel-/Seiteneinstellungen (im Admin änderbar)
src/game/                  Simulation (reines JS, DB-unabhängig, getestet)
  engine.js                Tagesschritt, Meter, Tod, Währungsumstellung, Berufswandel
  core.js / calendar.js / economy.js / content.js / rng.js
  goods.js                 Warenkreislauf (Katalog, Rezepte, Preise, Politik-Wirkungen)
  cityecon.js              Stadtwirtschaft: Preisindizes je Stadt (Lebensmittel, Wohnen, Dienste, Bau, Löhne)
  newspaper.js             Deterministische Zeitung (Stellen, Wohnungen, Kontakte, Ereignisse)
  events.js                Stadtereignisse (Unwetter, Feuer, Einbruch, Fest)
  family.js / heir.js      Partner, Kinder, Schule, Trennung, Pflichtanteil-Erbe
  actions.js               Alle Spieleraktionen (validiert, serverseitig)
  service.js               Persistenz, EFS-Zufluss, Offline-Fortschritt, Transaktionen
src/routes/                public, auth, api, play, admin
views/ public/             EJS-Templates, CSS-Design-System, Spiel-Frontend (ES-Module, ohne Build)
```

**Template-System:** serverseitiges **EJS** für Seiten (kein Build-Schritt, ideal für Hostinger) +
ein eigenes **CSS-Design-System** (`public/css/app.css`) und ein schlankes Spiel-Frontend aus ES-Modulen.
Für ein Spiel mit eigener Bildsprache ist ein eigenes Design-System besser als ein fertiges Admin-Template.

## 5. Sicherheit

**Anmeldung & Konten**
- Passwörter mit bcrypt (Kosten 11, reines JS). Neue Passwörter: mindestens 10 Zeichen, höchstens 72 Bytes (bcrypt-Grenze), keine Allerwelts-Passwörter, nicht der Spielername. Bestehende Passwörter bleiben gültig.
- Sitzungen in MySQL, Cookie `HttpOnly` + `SameSite=Lax` + `Secure` (automatisch über https), neue Sitzungs-ID bei jeder Anmeldung (Session-Fixation), Abmelden zerstört die Sitzung, absolute Höchstdauer 90 Tage. Nach Passwort-Reset bzw. -Änderung und bei Sperre werden die Sitzungen des Kontos beendet.
- Reset- und Bestätigungs-Links: 256-Bit-Zufall, in der Datenbank nur als SHA-256-Hash, Reset 1 Stunde gültig und atomar einmalig. Antworten verraten nicht, ob ein Konto existiert; gleiche Rechenzeit bei unbekanntem Konto.
- Bremsen: Anmeldung je IP, je Konto+IP und je Konto gesamt; Passwort-Mails höchstens 3 pro Stunde und Adresse; API je Spieler (`TP_API_RATE`); alle übrigen Seiten je IP (`TP_IP_RATE`, Standard 300/min); Webhooks `TP_WEBHOOK_RATE`.

**Rechte (Admin)**
- Rollen Admin > Co-Admin > Moderator > Spieler; die Rechteprüfung normalisiert Pfade (Gross-/Kleinschreibung, `//`, abschließendes `/`, `%`-Kodierung), weil Express diese Varianten auf dieselben Routen leitet.
- Niemand ändert gleich- oder höherrangige Konten (gilt auch für Sammelaktionen, Anti-Cheat, Community-Stummschaltung, Charakter-Editor); Geheimnisse (Stripe, Offerwall, SMTP) und Passwörter setzt nur der Admin.
- Spielerrouten prüfen Eigentum serverseitig (Briefe, Angebote, Orders, Bewerbungen, Werbe-Token …); der Client schickt nur Absichten, nie Besitzer-IDs, die vertraut würden.

**Transport & Header**
- Helmet mit strikter CSP (Skripte nur von `self`, keine Inline-Handler, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (Kamera, Mikrofon, Standort … aus), `Cache-Control: no-store` für alle dynamischen Antworten.
- **Proxy:** Hostinger stellt genau einen Proxy vor die App (`trust proxy` = 1); als Client-IP gilt der vom Proxy angehängte Eintrag, vom Client vorangestellte `X-Forwarded-For`-Werte werden ignoriert. Läuft die App ohne Proxy (direkt erreichbar), setze `TP_TRUST_PROXY=0`; bei mehreren Proxys die Anzahl oder eine Liste (`loopback, 10.0.0.0/8`).
- **Setze `TP_SITE_URL` (bzw. beim Installer die Seiten-Adresse)**: Links in E-Mails und Stripe-Rücksprünge werden daraus gebaut, nie aus dem `Host`-Header.
- Zeitlimits: Kopfzeilen 20 s, Request-Body 120 s, Antwort-Frist 45 s je Anfrage (503 statt Hängen). Live-Verbindungen (SSE): 5 je Spieler, `TP_SSE_PER_IP` (15) je IP, `TP_SSE_TOTAL` (800) insgesamt, Neuaufbau alle 20 Minuten. Bodies: Formulare 100 kB (nur Team: 12 MB, erst nach der Anmeldeprüfung), JSON 300 kB, Uploads 4 MB.

**Eingaben**
- SQL ausschließlich mit Platzhaltern; Sortierung/Tabellen/Spalten stammen aus festen Listen. Die Datenbankschicht lehnt Arrays/Objekte als Parameter ab (verhindert „Objekt-Injektion“ aus JSON-Bodies), `LIKE`-Suchtexte werden maskiert.
- Weiterleitungen (`next`, Sprachwahl) nur auf relative Pfade der eigenen Seite (kein `//host`, kein `/\host`). E-Mail-Adressen: genau eine Adresse (keine Listen), Betreff ohne Zeilenumbrüche.
- Push: Das Ziel eines Push-Abos muss ein Dienst der Browser-Hersteller sein (FCM, Mozilla, Apple, Windows) – kein SSRF auf interne Adressen. Ausgehende Aufrufe gibt es sonst nur an `api.stripe.com` und den konfigurierten SMTP-Server.
- Ausgabe: EJS maskiert standardmäßig (Rohausgabe nur für Icons/Includes, per Test abgesichert); Client-Vorlagen maskieren jede Interpolation. Uploads: nur PNG/JPG/WEBP/GIF per Magic-Byte-Prüfung, Zufallsnamen, außerhalb der App, `nosniff`.

**Zahlungen & Webhooks**
- Stripe: HMAC-SHA256 über den **rohen** Body, zeitkonstanter Vergleich, Zeitfenster 5 Minuten, Gutschriften idempotent über die Zahlungsreferenz (eindeutiger Schlüssel).
- Offerwall: HMAC über `uid|coins|txid`, strenge Typ-/Formatprüfung, eindeutige Transaktions-ID (Wiederholungen werden quittiert, aber nicht erneut gutgeschrieben), höchstens 1000 Coins je Meldung.
- `payments.mode = test` schreibt ohne Zahlung gut – **nur zum Testen**, in Produktion auf `off` oder `stripe` lassen.

**Geheimnisse & Protokolle**
- `config.json` Rechte 0600, Daten-Ordner 0700; Session-Geheimnis zufällig und dauerhaft; Stripe-/Offerwall-/SMTP-Geheimnisse werden im Admin-Bereich nie angezeigt und fehlen in Export/Backup (außer ausdrücklich gewählt, nur Admin). Fehlerseiten und API-Antworten enthalten nie Stacktraces.
- Protokolle (`app.log`, Audit) schwärzen Reset-/Bestätigungs-Tokens und Signaturen in Adressen, entfernen Steuerzeichen (keine gefälschten Zeilen) und kürzen lange Werte.
- Installer: Setze vor dem ersten Aufruf `TP_INSTALL_KEY`. Ohne Schlüssel kann jeder, der die Seite vor dir aufruft, die Installation ausführen.

**Abhängigkeiten:** `npm audit` meldet derzeit keine bekannten Schwachstellen; vor Releases `npm audit --omit=dev` ausführen. Tests: `npm test` (u. a. `test/security.test.js`, `test/security-hardening.test.js`).

## 6. Lizenzen Dritter

Schriften: Inter, Fraunces (SIL OFL 1.1, via Fontsource) · Icons: Lucide (ISC).


## Team-Rollen, Orte, Berufe, Kurzzahlen

- **Rollen:** `Admin` (alles), `Co-Admin` (alles außer System, Backup & Import, Werkzeuge, Zahlungs-/Mail-/Experten-Einstellungen, Rollen vergeben, Passwörter zurücksetzen, „Als Spieler einloggen“) und `Moderator` (Spieler ansehen/sperren, Community, Anti-Cheat, News). Rollen vergibt nur ein Admin unter Admin → Spieler → Konto. Teammitglieder erscheinen in der Rangliste und im Chat mit Kennzeichnung; niemand bearbeitet gleich- oder höherrangige Konten (außer Admins). Rechte: `src/lib/roles.js`.
- **Orte:** rund 9.000 Orte (Gemeindesitze und größere Dörfer) aus `src/db/places-de.json` (GeoNames-Daten, CC BY 4.0 – Quellenangabe: geonames.org). Migration `011_places` legt sie an; `since` (Jahr) steuert, ab wann ein Ort existiert (z. B. Eisenhüttenstadt 1950, Norderstedt 1970). Die Karte zeichnet je nach Zoom nur sichtbare Orte, die Suche findet jeden Ort. Im Admin unter Städte mit Suche, Filter und Seiten.
- **Berufe:** über 130 Berufe mit Zeitfenster (`era_from`/`era_to`), Migration `009_professions_era`.
- **Kurzzahlen:** große Beträge erscheinen als 1k, 12k, 999k, 1m, 5b … (`compact()` in `ui.js` und `economy.js`).

## Immobilien vermieten & Bots

- **Vermieten:** Eigene Immobilien, die man nicht selbst bewohnt, lassen sich unter *Wohnen* vermieten. Marktmiete aus Wert und Zustand, Preisregler 50–200 %, Mieter kommen je nach Preis/Zustand/Stadtgröße, wechseln nach einigen Monaten bis Jahren, selten gibt es Mietausfall. Einnahmen stehen in den Tagesflüssen (`inc.rent`). Code: `src/game/landlord.js`. Immobilien kann man auf *Wohnen* und in der Zeitung (auch in anderen Städten) kaufen.
- **Bots:** Admin → Spieler → *Bots* (standardmäßig aus). Echte Konten (`users.is_bot`) mit Charakteren, die nach den Spielregeln leben, im Stadtplatz-Chat plaudern, Briefe beantworten, Freundschaften annehmen und Spielerbetriebe besuchen (`src/lib/bots.js`, Texte in `bot-texts.js`). Leitplanken: nicht in der Singles-Liste, keine Beziehungen mit Spielern, nie Geld-/Kaufbitten, ehrliche Antwort auf die ernste Frage „Bist du ein Bot?“, Hinweis in den Nutzungsbedingungen (Abschnitt 2a), im Admin gekennzeichnet; Anti-Cheat und Statistiken ignorieren Bots. **Chat-Vielfalt:** `bot-texts.js` hat nach Tageszeit (früh/Vormittag/Mittag/Nachmittag/Abend/Nacht), Epoche (Spieljahr: Trümmerzeit, Währungsreform, Wirtschaftswunder, Mauerbau, Ölkrise, Mauerfall, Euro, Internet, Smartphone, Pandemie … bis ins 22. Jahrhundert), Stadt (allgemein und für rund 25 Städte besonders), Beruf (`{prof}`) und Alltagsthemen sortierte Zeilenbänke (Deutsch und Englisch, `stats()` zählt sie). `pickFresh` sorgt für Wiederholungsschutz: dieselbe Zeile kommt bei einem Bot erst nach 150 und bei allen Bots erst nach 400 Äußerungen wieder (kleine Bänke werden reihum erschöpft).

### Push-Benachrichtigungen (Web-Push, PWA)

Spieler mit installierter App (oder Browser) können unter **Mein Konto → Benachrichtigungen auf dem Handy** Pushes für neue Briefe, Erwähnungen (`@spielername`) im Stadtplatz-Chat, Kauf-/Gegenangebote, „Überboten“ bei Versteigerungen, Beziehungsanfragen und Jobangebote einschalten – je Kategorie einstellbar, mit Ruhezeit (Standard 22–7 Uhr in der Ortszeit des Geräts).

- **Technik:** Standard Web-Push mit VAPID (Paket `web-push`). Die VAPID-Schlüssel entstehen beim ersten Aufruf automatisch und liegen in der Tabelle `settings` (Schlüssel `push.vapid`) – nie im Repository. Abos in `push_subscriptions` (Migration `022`), Einstellungen je Spieler in `users.meta.push`. Service Worker: `public/sw.js` (`push`, `notificationclick` öffnet `/play?stab=…#/social`). Oberfläche: `public/js/push-settings.js`, API: `/api/push/key|prefs|subscribe|unsubscribe|test`.
- **Auslöser:** eine Funktion `notify(userId, {title, body, tab, tag, cat})` in `src/lib/push.js`; sie hängt an `social.sendSystemLetter`, `social.sendLetter` und dem Chat (Erwähnungen) und deckt damit Briefe, Freundschafts-/Beziehungs-/Jobanfragen, Marktangebote und Auktionen ab.
- **Leitplanken:** Admin-Schalter, keine Pushes an gesperrte Konten und Bots, Ruhezeit, höchstens `perHour` Pushes je Spieler und Stunde, Zusammenfassen per Tag/Topic, tote Abos (404/410) werden gelöscht, kein Push solange das Spiel im Vordergrund offen ist.
- **Admin:** Einstellungen → *Push* (`push`: `enabled`, `perHour`, `quietEnabled`, `quietFrom`, `quietTo`). Voraussetzung: HTTPS. Auf dem iPhone muss die App zuerst zum Home-Bildschirm hinzugefügt werden.

### Eigennamen in der englischen Oberfläche

Von Spielern getippte Texte und Eigennamen werden nie übersetzt: Chatzeilen, Briefe von Spielern, Angebotsnachrichten, Job-Titel, Betriebs- und Personennamen. Serverseitig (`src/i18n-game.js`) übersetzen Vorlagen nur den festen Teil, Namen in den Platzhaltern bleiben; die Kopfwort-Regel („Bäckerei Peters“ → „Bakery Peters“) gilt nur mit `tr(text, { head: true })`. Namen-Felder (`name`, `owner`, …) werden nur bei exaktem Treffer übersetzt (z. B. „München“ → „Munich“). Im Browser (`public/js/i18n.js`) überspringt der Übersetzer alles unter `data-i18n-skip` – dieses Attribut gehört an jede Stelle, die Spielereingaben oder Namen ausgibt.

### Börse (Phase 5)
- **Börsengang:** Unter *Unternehmen → Börsengang* teilt ein Betrieb sich in 1.000 Anteile (Mindestwert und Mindest-Spielalter in den Einstellungen `exchange`). 10–49 % kommen als Verkaufsorder zum fairen Kurs (Substanz- und Ertragswert) in den Handel.
- **Handel:** Tab *Spieler → Börse*. Limit-Orders (Kauf reserviert den Höchstpreis vorab, Verkauf sperrt die Anteile), Orderbuch mit Preis-Zeit-Priorität; ein Marktausgleicher („Börse“, Nutzer 0) kauft/verkauft begrenzt (`makerDailyPct`) mit Spanne (`makerSpreadPct`). Erlöse an abwesende Verkäufer laufen über `pending_credits`.
- **Dividende:** Ein börsennotierter Betrieb schüttet täglich `divPct` des Gewinns aus der Firmenkasse aus; die Verteilung an alle Anteilseigner geschieht nach dem Speichern (`exchange.flushDividends`).
- **Übernahme:** Wer ≥ `takeoverPct` % hält, kann den Betrieb übernehmen (Betrieb wechselt per `market.detach/attach`, der bisherige Eigentümer bleibt Minderheitsaktionär). Börsennotierte Betriebe lassen sich nicht über Angebote/Auktionen/`bizSell` verkaufen; bei Insolvenz wird die Notierung gelöscht.
- **Grenzen des Marktausgleichers** (Gruppe `exchange`): Tageslimit je Nutzer (`makerUserDailyReal`, Gesamtwert real in Cent, 0 = aus), Mindest-Haltedauer vor dem Rückverkauf an ihn (`makerMinHoldMinutes`, frisch gekaufte Anteile bleiben gesperrt), Spread-Zuschlag je eigenem Geschäft am Tag (`makerSpreadStepPct`, gedeckelt bei `makerSpreadMaxPct`) und Sperre von Scheinhandel: Orders von Konten mit gleicher IP (`social.sameIp`, `blockSameIp`) werden im Orderbuch nicht abgeglichen und als `gift_ring` gemeldet. Reine Funktionen (`makerSpreadPct`, `capShares`, `sellableToMaker`, `dropWash`) sind in `test/exchange.test.js` getestet; `place` liefert zusätzlich `limits` (Hinweise, warum der Ausgleicher nicht voll bedient hat).
- Code: `src/lib/exchange.js`, Routen `/api/social/exchange/*`, Oberfläche `public/js/game/exchange.js`, Admin: Gruppe „Markt“ → `exchange`.

### Spieler als Mieter
- Eigentümer: unter *Wohnen* bei einer vermieteten Immobilie „Auch an Spieler vermieten“ ankreuzen (Aktion `letPlayers`). Sie erscheint im Stadtverzeichnis (Tab *Häuser*) mit „Mieten“; ein Mieter kann gekündigt werden.
- Mieter (gleiche Stadt, Rücklagen für 30 Tage): Die Tagesmiete wird bei Einzug in „Wert von 1945“ festgeschrieben, er zahlt sie als Wohnkosten, der Eigentümer erhält sie als `inc.rent`. Auszug, Kündigung, Verkauf oder Tod beenden den Vertrag.
- Code: `src/lib/leases.js` (Tabelle `player_leases`, Abgleich über `bonds.reconcile`), `landlord.tenantRent`.


## Wirtschaftsbalance

Langzeitsimulation ohne Datenbank: `node tools/econ-sim.js [--years 85] [--seed 7] [--only employee,landlord0,landlord,owner,mixed] [--json] [--no-static]`. Sie spielt deterministisch fünf Archetypen ab 1945 (Angestellter, Vermieter ohne/mit Kredit, Betriebsinhaber, Mischform) über `engine.advance`, druckt je Jahrzehnt Geld, Immobilien, Firmenwert, Schulden und Nettovermögen **in DM von 1945** (Preisindex bereinigt) sowie die Jahresflüsse (Lohn, Miete, Steuer, Kreditrate, Betriebsgewinn/-löhne) und vorab statische Kennzahlen (Mietrendite je Objektart, Kreditzins, Betriebsrendite je Stufe/Personalmodell). Die Spielerpolitiken stehen im Skript (Kühlschrank gratis gefüllt, keine Kinder – es misst die Geldwirtschaft, nicht das ganze Leben).

**Gefundene Probleme und Änderungen**

| Befund | Änderung |
| --- | --- |
| **Mieteinnahmen, Einkommensteuer und Kreditraten wurden nie verbucht**: `dailyFlows` wies sie nur aus; Mieten kamen nie aufs Konto, Steuer und Raten wurden nie abgebucht, Kredite tilgten sich kostenlos (Kredit = geschenktes Geld). | `landlord.settleIncome` (Aufruf aus `landlordDaily`) schreibt Miete gut und bucht die Einkommensteuer ab; `credit.creditDaily` bucht die Rate (Zins + Tilgung) ab, offline nur soweit Geld da ist. |
| Euro-Umstellung halbierte nur das Bargeld: Restschuld/Rate und Firmenkassen blieben nominal stehen (real verdoppelt, Vermieter mit Kredit gingen 2002 pleite). | `economy.isEuroDay`; Kredite (`creditDaily`) und Firmenkassen (`businessDaily`) werden am 1.1. des Euro-Jahres halbiert. |
| Unwetter trafen jede Immobilie ca. 5-mal, Brände 0,6-mal im Jahr (Schäden und Ausfalltage von weit über 40 % des Werts jährlich): Vermieten war strukturell verlustreich. | `economy.events.town` in `settings.js`: `stormHitChance` 0,4 → 0,1, `stormCostPct` 6 → 4, `fireHitChance` 0,12 → 0,04. |
| Mietrenditen brutto 3,5–6 % bei Kreditzinsen 8–11,5 %: Fremdfinanzierung lohnte nie. | `landlord.YIELD` +10 % (Wohnung 5,5 %, kleines Haus 5 %, großes Haus 4,4 %, Villa 3,5 %), `credit.spread` 1,5 → 1,0, Auslastungsaufschlag 3 → 2 Punkte. |
| Kein Schutz vor Raten, die das Einkommen übersteigen (jetzt, wo Raten wirklich abgebucht werden, wäre das sofortige Insolvenz). | `credit.take`: alle Raten zusammen höchstens 60 % des Jahreseinkommens (Lohn, Miete, Betriebsgewinne) plus 25 % der Barmittel. |
| Betriebsinhaber zahlten nur 10 % Gewerbesteuer, Angestellte bis 45 %. | `tax.corporatePct` 10 → 15. |
| Wer die Berufsstufe für Stufe 2/3 erreicht hatte, sah den Kleinbetrieb nie wieder im Angebot; mit Lohnersparnissen war der Einstieg praktisch unerreichbar (Preis wächst mit dem Index, Sparrate nicht). | `business.bizListings` bietet für die erste Sparte zusätzlich die niedrigeren Stufen an (IDs `…:10+Stufe`). |

**Ergebnis (Seed 7, 85 Jahre, Netto in DM von 1945)**: Angestellter 123 000 (nach 150 Jahren 152 000: linear, kein Ausreißer), Vermieter ohne Kredit 119 000, Vermieter mit Kredit 155 000 (Hebel lohnt jetzt moderat, Fehlplanung bleibt riskant), Betriebsinhaber 390 000, Mischform 545 000. Betriebe schreiben bei Eigenarbeit oder Personal plus Manager Gewinne (Rendite ca. 6–30 % je Stufe/Ausbau, Stufe 3 mit 50 Räumen in einer Stadt wird durch die Konkurrenzsättigung auf ca. 5 % gedrückt). Kein Geld-Explosions- oder Kollaps-Pfad in 150 Jahren; Kredite sind bei normaler Planung tilgbar (Annuität endet bei 0, getestet).

**Offen (außerhalb dieses Bereichs, `actions.js`/`core.js`)**: *Immobilien-Flip*: `maintain` kostet nur 8 % von (Wert × Zustandsdefizit), `propertyValue` bewertet Zustand aber mit 0,2 + 0,8·Zustand; wer ein Objekt mit Zustand ~50 kauft, instand setzt und verkauft, macht sofort ca. +55 % Gewinn (nur durch die wöchentlichen Angebote begrenzt). Vorschlag: Instandsetzungskosten auf ca. 60–80 % des Wertzuwachses (`0.08` → `0.55`) anheben oder den Verkaufsabschlag erhöhen. Außerdem fehlt eine Steuerpflicht auf ausgeschüttete Betriebsgewinne (`bizCollect`).

## Warenkreislauf & Lieferketten

Betriebe stellen Waren her und brauchen dafür Zutaten (Bauernhof → Mühle → Bäckerei → Laden; Holz → Tischlerei; Betonwerk → Baufirma; Zeche → Kraftwerk → IT-Firma). Fehlen Zutaten, sinkt die Leistung bis zu einer Untergrenze (Standard 35 %, nie sofort null). Alles ist für Einsteiger gebaut: Standardmäßig kauft jeder Betrieb fehlende Zutaten selbst im Großhandel („Automatisch einkaufen“ an) – wer sich kümmert, spart mit Lieferverträgen.

**Aufbau**
- `src/game/goods.js`: Katalog (35 Waren mit Basispreis in Cent „Wert von 1945“, Einheit, Epoche, Importanteil; Dienstleistungen sind nicht handelbar), Rezepte aller Betriebsarten (Erzeuger wie Bauernhof, Zeche, Fischkutter, Windpark brauchen nichts; unbekannte Berufe fallen auf ihre Kategorie zurück), Preise, Versorgung (`buyPlan`/`sellPlan`), Politik-Wirkungen. Mengen ergeben sich aus Umsatz und Warenpreisen (Rezept = Umsatzanteile, nicht Gramm), die UI zeigt sie je Tag.
- `src/game/business.js`: `companyFlows` rechnet Versorgung, Wareneinkauf, Mehrwertsteuer, Zuschläge; `settleContracts` (aus `businessDaily`) bucht Verträge. `present.js` liefert `companies[].supply/deals` und `goods` (Preise, Ketten).
- Großhandel (immer lieferbar): Einkauf = Marktpreis × (1 + Aufschlag, Standard 25 %); nicht vertraglich verkaufte Erzeugnisse sind im Umsatz mit 20 % Abschlag auf den Basispreis kalkuliert. Marktpreis = Basis × Stadtfaktor × Knappheit × (1 + Zoll · Importanteil). Knappheit je (Stadt, Ware) entsteht aus Angebot/Nachfrage der veröffentlichten Betriebe (`player_firms`, alle zwei Minuten in `policies.refresh`), gedämpft (`scarcityStrength`, Faktor 0,8–1,5).
- **Lieferverträge** (`src/lib/supply.js`, Tabelle `supply_contracts`, Migration 026): Angebot einer Seite (Brief + Live-Meldung), Annahme/Ablehnung/Kündigung, Preis 90–115 % des Marktpreises (real 1945 gespeichert), Laufzeit 30–730 Tage, Verlängerung, höchstens 4 je Betrieb, nur im selben Bundesland. Der Käufer zahlt täglich in seiner Zeit aus der Firmenkasse; die Gutschrift (in Realwert = Cent ÷ eigener Preisindex) wird in `state.pending.supply` vorgemerkt und in `supply.flush` **vor** `saveCharacter` als `pending_credits` (reason `supply`, `company_id` = Firma des Verkäufers) geschrieben und die Liste geleert – genau einmal, wie bei den Bauaufträgen. Der Verkäufer erhält sie beim nächsten Laden in seiner Währung. Rückkanal: `fill` (wie viel der Verkäufer liefern kann) und `take` (wie viel der Käufer wirklich abnimmt) stehen in der Tabelle; Laufzeit zählt der Käufer herunter. Verträge enden, wenn ein Betrieb oder Charakter verschwindet (`reconcile`/`flush`). Selbstverträge und Konten mit gleicher IP sind ausgeschlossen. Bots antworten und verhandeln nach der Spielsitzung (`bots.js` → `supply.botRound`).
- **Politik** (`src/lib/policies.js`, Tabelle `goods_policies`): Wer ein Amt hält (`state.politics.term`), fasst je Amtszeit EINEN Beschluss; vorher zeigt die Oberfläche die Wirkung. Stadtrat: Gewerbesteuer-Zuschlag (−2…+4 Punkte); Bürgermeister: Zuschlag oder Stadt-Subvention für eine Ware (5–20 %); Landtag: Preisstützung (5–15 %) für Erzeuger im Bundesland; Bundestag: Rahmen (Streng/Normal/Weit, Obergrenzen für Zuschlag und Subvention); Kanzler: Mehrwertsteuer auf die Wertschöpfung (−3…+5), Einfuhrzoll auf den importierten Anteil (−10…+20 %, schützt Erzeuger) oder Branchen-Subvention. Jede Subvention wird mit einer Umlage (0,15 Punkte Gewerbesteuer je Prozent) auf alle Betriebe im Gebiet gegenfinanziert. Beschlüsse gelten bis zum Ende der Amtszeit (in echte Zeit umgerechnet) und erlöschen bei Rücktritt oder Amtsverlust; das Tagesblatt meldet sie. Alle Grenzen stehen im Admin (Gruppe „Warenkreislauf“, Einstellung `goods`).
- Oberfläche: Unternehmen → „Warenkreislauf“ (Erklärung, Kettenbild mit den eigenen Betrieben, Großhandelspreise, meine Verträge) und je Betrieb die Box „Versorgung“ (Ampel gut/knapp/fehlt, Zutaten mit Quelle und Kosten, Schalter, Lieferantensuche, Abnehmersuche); Gesellschaft → „Dein Amt: das kannst du entscheiden“. Einsteiger: Aufgabe „Schließe deinen ersten Liefervertrag“, „Was jetzt?“-Hinweis bei knapper Versorgung, Glossar (Warenkreislauf, Großhandel, Liefervertrag, Versorgung, Zoll, Mehrwertsteuer, Subvention, Gewerbesteuer). Englisch: `client-J.js`, `messages-J.js`, `goods-en.js`.

**Balance** (`node tools/econ-sim.js`, Tabelle „Warenkreislauf“; Personal + Manager, Stufen 1–3, drei Städte, DM von 1945 je Tag): Der Umsatz ist mit `1 / (1 − Wareneinsatzquote im Großhandel)` kalkuliert, damit die Marge bei Großhandelseinkauf unverändert bleibt. Ergebnis 1950–2090: Gewinn alt = Gewinn neu in jeder Epoche (1950: 31,0; 1965: 26,0; 1980: 19,9 mit Rezession; ab 1995: 26,0), Wareneinsatz 14–20 DM bei 55–74 DM Umsatz. Ein Test prüft alle Berufe × Epochen × Stufen: Gewinn > 0 und höchstens 2 % Abweichung zur Rechnung ohne Waren. Verluste in Krisenjahren (1980: kleine Betriebe in kleinen Städten) sind ein bestehender Befund der Konjunkturfaktoren, nicht der Waren. Vorteil eines Vertrags zu 100 % Marktpreis: 20 % der vertraglich gedeckten Zutatenkosten (Käufer) bzw. 25 % mehr als der Großhandel zahlt (Verkäufer); die Spanne ist so gewählt, dass beide Seiten immer besser fahren als im Großhandel. Zukunft: Verträge zwischen eigenen Betrieben (Werkspreis) und Transport/Entfernung sind nicht modelliert.

**Qualität**: `test/goods.test.js` (Katalog, Rezepte, Versorgung, Verträge, Politik, Knappheit), `test/goods-db.test.js` (zwei Spieler verschiedener Spielzeiten gegen echte Datenbank: Angebot, Annahme, tägliche Abrechnung, Gutschrift genau einmal, Kündigung, Tod, Bot, Beschluss), Fuzz: Invarianten für `state.contracts`/`pending.supply`, `runSupplyScenario` (Σ vorgemerkter Realwert = Σ Zahlungen, nichts doppelt, nichts negativ), `tools/fuzz-long.js` führt es mit.

## Stadtwirtschaft (Preise nach Angebot und Nachfrage)

Jede Stadt hat ein eigenes Preisniveau, das **lebt**: Fünf Indizes (Lebensmittel, Wohnen & Miete, Dienstleistungen & Gastro, Baukosten, Löhne) folgen Nachfrage und Angebot vor Ort. Wo viele Spieler wohnen und wenige Wohnungen oder Betriebe da sind, wird es teurer; wo viele Betriebe konkurrieren, wird es billiger. Ämter können mit Beschlüssen eingreifen. Alles bleibt für Einsteiger lesbar: Das **Preisbarometer** zeigt in einfachen Worten, ob eine Stadt teuer oder günstig ist, und sagt, wo ein Umzug sich lohnt.

**Modell** (`src/game/cityecon.js`, rein und deterministisch; Server-Takt in `src/lib/cityecon.js`)
- **Stufe = Dynamik × Epochenfaktor**, immer zwischen `min` 0,75 und `max` 1,6 – als Faktor **auf den festen Stadtfaktor** (`cities.price_factor`), nicht statt seiner.
- **Dynamik** (echtzeitlich, für alle Spieler gleich): nähert sich dem Gleichgewicht `(Nachfrage / Angebot)^Stärke` mit Zeitkonstante `tauHours` (24 Stunden ≈ ein Spieljahr, Standardtempo), dazu ein kleines deterministisches Rauschen (±1,5 %, 6-Stunden-Takt). Nachfrage = Grundlast der Stadt (Obergrenze der Konkurrenz `competition.cap` × Vielfaches je Sektor, `npcRooms`) plus lebende Charaktere (`playerDemand`). Angebot = Grundlast plus Räume der veröffentlichten Spieler- und Bot-Betriebe (`player_firms`, Gewicht `firmWeight`). Lohnniveau: Betriebe fragen Personal nach, Charaktere bieten Arbeit an. Wohnen: Wohnungen entstehen durch Baufirmen (halbes Gewicht) und Baulandbeschlüsse.
- **Epochenfaktor**: deterministische, mittelwertfreie Welle (14–36 Jahre Periode, ±3 %) plus Langzeittrend je Stadt (±4 %) – hängt nur vom Spieljahr ab, damit Spieler in verschiedenen Epochen jeweils ihre eigene Preisgeschichte sehen.
- **Speicher**: Tabelle `city_economy` (Migration 027), **nur Städte mit Aktivität oder Beschluss** haben Zeilen (rund 9.000 Orte bleiben sonst reine Formel: Dynamik 1). Aktualisierung alle `intervalMinutes` (Standard 60) und beim Start (`market.start` → `cityecon.start`), danach liegen die Werte auch im Arbeitsspeicher; ruhige Städte fallen von selbst wieder heraus. Der Verlauf (ein Punkt je Spielmonat, `histPoints` 60) steht als JSON in der Zeile und speist die Linien und die Pfeile „seit letztem Jahr“.
- **Kein Doppelzählen** – die drei Preisschichten im Überblick:

| Schicht | Wirkt auf | Quelle |
| --- | --- | --- |
| fester Stadtfaktor | Miete, Immobilien, Gründungskosten, Lebensmittel (abgeschwächt), Warenpreise (`cityPriceWeight`) | `cities.price_factor` |
| Knappheit der Waren | Großhandelspreis **je Ware** (Zutaten) | `goods.computeScarcity`, Betriebe je Stadt |
| Konkurrenz-Sättigung | Umsatz **der eigenen Betriebsart** bei Überfüllung | `competition.info` |
| **Stadtindex** (neu) | Umsatz *aller Betriebe des Sektors* (nur mit `pass.revenue` 0,35), Löhne, Miete, Lebensmittel, Haushaltskosten, Baukosten, Immobilienwerte, Großhandel für Lebensmittel/Bau (`pass.goods` 0,4) | `city_economy` |

Der Umsatz nimmt den Sektorindex nur abgeschwächt (`revenue`), die Angebotsseite zählt Betriebsräume nur mit `firmWeight` 0,3 und die Grundlast ist ein Vielfaches der Konkurrenz-Obergrenze – so wirken Konkurrenz und Stadtindex nebeneinander und nicht doppelt.

**Wo die Indizes im Spiel wirken**
| Index | Einspeisung |
| --- | --- |
| Lebensmittel | `core.foodFactor` → Essen kaufen (`buyFood`), Preisliste im Haushalt, Tageskosten; Großhandel Agrar/Nahrung (`goods.price`) |
| Wohnen & Miete | Mietanzeigen und Pensionen in der Zeitung, Mieteinnahmen NPC-Mieter (`landlord.rentPerDay/marketPerDay`), Anzeigenpreise; bestehende Mietverträge bleiben fest |
| Immobilienwert | `core.propertyValue` und Kaufanzeigen: `Miete^0,5 × Baukosten^0,25` (träger als die Miete) |
| Dienste & Lebensmittel | Umsatz je Raum der Betriebe (`business.companyFlows`, Sektor nach dem wichtigsten Erzeugnis), Kinderkosten und Kindergeld (`householdMult` = Mittel aus beiden) |
| Baukosten | Gründungspreis (`foundPrice`), Zeitungsangebote für Betriebe, Raum- und Stufenausbau (`bizExpand`, `bizUpgrade`), Großhandel Baustoffe |
| Löhne | Stellenanzeigen und Tageslohn (`core.dailyFlows`, `newspaper.jobListings` rechnen gleich), Lohnkosten der Betriebe (ohne vereinbarte Spielerlöhne) |

**Oberfläche** (`public/js/game/economy.js`, Server `src/routes/economy.js`, `GET /api/economy/city`)
- **Preisbarometer** in der Stadtansicht und in der Zeitung (Reiter *Wirtschaft*): je Sektor Etikett *Günstig hier / Durchschnitt / Teuer hier* gegenüber dem Landesdurchschnitt (nach Einwohnern gewichtet), Pfeil und Prozent seit letztem Jahr, Linie der letzten Jahre, „Wohnungen sind knapp / Viele Wohnungen frei“ aus Nachfrage und Angebot, Tipps („In Teltow ist Wohnen etwa 22 % günstiger – ein Umzug spart rund 2,50 DM pro Tag“) und eine **sortierbare Vergleichstabelle** der nächsten Städte (ab 10.000 Einwohnern, bis 150 km) mit Ortssuche für beliebige weitere Orte. Aktualisiert sich still über den Live-Kanal `economy`.
- **Zeitung**: Meldungen wie „Mieten in X steigen“ oder „Lebensmittel in X werden billiger“, sobald sich ein Index um mindestens `newsPct` (4 %) gegenüber dem Vorjahr bewegt (rein aus dem Zwischenspeicher, keine Dauerschleife). **Tagesblatt**: Zeile mit dem Preisniveau der aktiven Städte und den höchsten Mieten.
- **Gründen** (`found.js`): „Viel Konkurrenz – die Nachfrage ist knapp“ bzw. „Kaum Konkurrenz“, Betriebe und Nachfrage in Räumen, Preisniveau der Branche.
- **Einsteiger**: Aufgabe *Vergleiche die Preise deiner Stadt* (16 Aufgaben insgesamt), „Was jetzt?“-Hinweis, wenn die Unterkunft mindestens 30 % des Einkommens kostet und eine Nachbarstadt mindestens 12 % günstiger ist, Glossar (Preisindex, Nachfrage, Angebot, Preisbarometer, Mietpreisbremse, Baulandausweisung).

**Politik** (weiter vollständig verfügbar, ein Beschluss je Amtszeit mit Vorschau, endet mit der Amtszeit): *Stadtrat/Bürgermeister* – **Baulandausweisung** (+5/10/15 % Wohnungsangebot, Nebenwirkung: höhere Baukosten) und (nur Bürgermeister) **Mietpreisbremse** (Mietniveau steigt höchstens 0/2/4 % je Spieljahr; Nebenwirkung: Vermieter investieren weniger, Angebot −6 %, der Druck baut sich auf und holt nach der Amtszeit auf; Mieteinnahmen steigen entsprechend langsam). *Landtag* – **Wohnungsbauprogramm** für alle Städte des Bundeslandes (mit Umlage wie die Preisstützung). *Bundeskanzler* – **Preisbremse / Inflationsziel** (−2…+2 Punkte auf das Preisniveau aller Städte, ±1,5 % je Punkt; Löhne folgen mit 70 %). Bundestag bleibt beim Rahmen. Die Vorschau zeigt die Wirkung auf den Zielwert (`cityecon.previewEffect`).

**Bots** nutzen die dynamischen Preise ohnehin über die günstigsten Anzeigen; zusätzlich ziehen mietende Bots ohne Besitz, Betriebe und Partner gelegentlich in eine mindestens 15 % günstigere Nachbarstadt und kaufen keine Betriebe in übersättigten Städten. **Admin**: Einstellungen → *Stadtwirtschaft* (`stadtwirtschaft`: `enabled`, `intervalMinutes`, `tauHours`, `min`/`max`, `strength` je Sektor, `npcRooms`, `playerDemand`, `firmWeight`, `noisePct`, `eraPct`/`eraTrendPct`, `pass`, `histPoints`, `newsPct`, `policy`); `enabled: false` setzt alle Faktoren auf genau 1.

**Balance** (`node tools/econ-sim.js [--city off|era|live] [--others 12]`, Tabelle *Stadtwirtschaft*; Seeds 7–13, 85 Jahre, Nettovermögen in DM von 1945): Der Mittelwert der Faktoren liegt bei 1 (Epochenfaktor mittelwertfrei, ruhige Städte ohne Dynamik). Mit lebenden Indizes in Braunschweig (12 weitere Charaktere, kleines Gefolge an Betrieben) ändern sich die Archetypen gegenüber „ohne Stadtindizes“ so:

| Archetyp | ohne | mit Stadtindizes | Abweichung |
| --- | --- | --- | --- |
| Angestellter (Ø Seeds 8–13) | 121.930 | 120.540 | −1,1 % |
| Vermieter ohne Kredit (Ø Seeds 8–13) | 38.930 | 36.540 | −6,2 % |
| Vermieter mit Kredit (Ø Seeds 8–13) | 60.260 | 55.130 | −8,5 % |
| Betriebsinhaber (Seed 7 / 8) | 1.929.000 / 1.921.000 | 1.786.000 / 1.809.000 | −7,4 % / −5,8 % |
| Mischform (Seed 7 / 8) | 41.370 / 42.940 | 44.960 / 46.170 | +8,7 % / +7,5 % |

Einzelne Läufe der Vermieter schwanken durch die Auswahl der Anzeigen um bis zu ±20 bis 35 % (schon ohne Stadtindizes liegen die Seeds beim Vermieter mit Kredit zwischen 51.000 und 75.000); der Mittelwert über sechs Seeds liegt im Band von ±10 %. Die Tabelle *Gleichgewicht* zeigt die Lagen für ein Wirtshaus 1980 (Tagesgewinn in DM von 1945): München ruhig 7,2 (ohne Index 7,2), Cottbus ruhig 1,8 (2,0), Cottbus mit 20 Spielern 2,2 (2,0; Mieten +14 %, Löhne −4 %), Cottbus mit 250 Gaststättenräumen 0,3 (2,0; Dienste 0,85, Löhne 1,10, Bau 1,18), München mit 40 Spielern 7,3 – große Städte vertragen Zulauf, kleine kippen schneller.

**Qualität**: `test/cityecon.test.js` (Gleichgewicht, Annäherung ohne Überschwingen, Grenzen, Determinismus, Mietbremse, Epochenmittel, Einspeisung in Miete/Wert/Lohn/Essen/Bau/Umsatz/Großhandel, Barometer, Vergleich, Tipps, Meldungen, Beschlüsse mit Vorschau, englische Texte), `test/cityecon-db.test.js` (opt-in `TP_TEST_DB_PORT`: Aktualisierung aus echten Betrieben, Persistenz, Neustart, Rückkehr zur Mitte, Mietbremse, Tagesblatt), Fuzz: `runCityEconScenario` und Aktionsläufe mit zufälligen Stadtindizes (alle Indizes endlich und in den Grenzen). Offen: Mietverträge sind bei Einzug fest (kein Anpassen an den Markt), Regionsbeschlüsse wirken nur in Städten mit Aktivität, Jahreszeiten kommen in Schritt 6.

### Spieltempo und Live-Aktualisierung
- **Tempo:** `efs.daily_auto` = 365 → ein realer Tag entspricht einem Spieljahr (1 EFS = 1 Spieltag). Änderbar im Admin unter Einstellungen → Spielwelt/EFS.
- **Live:** `GET /api/live` (Server-Sent Events, `src/lib/live.js`) meldet Änderungen (Briefe, Chat, Markt, Börse, Verzeichnis, Tagesblatt). Der Browser (`public/js/game/live.js`) lädt dann nur die betroffene Ansicht still nach – ohne Neuladen, ohne Flackern, ohne laufende Eingaben zu stören. Zusätzlich HUD-Abgleich alle 60 Sekunden.
- **Spieluhr:** Die Spielzeit läuft automatisch mit der echten Uhr (`game.clock_days_per_day`, Standard 365 → 24 Stunden = 1 Spieljahr, ein Spieltag etwa alle 4 Minuten). Bei Abwesenheit über `game.offline_after_minutes` gilt der Offline-Schutz. EFS (`efs.login_bonus` 365, Sammel-Limit 1600/Tag, Aufgaben- und Fortschrittsbelohnungen ×7) sind ein Vorrat zum zusätzlichen Vorspulen; `efs.daily_auto` (automatisches EFS) ist standardmäßig 0. Im Browser meldet sich die Uhr zum Tageswechsel und lädt still nach (`scheduleClock` in `main.js`).

**Gewinne der Betriebe (Anhebung):** `economy.companies.tiers[].incomePerRoom` von 420/520/680 auf 525/650/850 (≈ +25 %). Ein normal besetzter Betrieb mit Manager erreicht damit etwa 19–25 % Jahresrendite auf den Kaufpreis (kleine Stufen) statt vorher 5–10 %; große Betriebe (Stufe 3, 50 Räume) ≈ 10 %. Langzeitsimulation (`tools/econ-sim.js`, Archetyp „Unternehmer“): Nettovermögen nach 85 Jahren ≈ 1,9 Mio statt 0,4 Mio (1945-DM). Ein im Admin gespeicherter `economy`-Wert überschreibt diese Standardwerte.
