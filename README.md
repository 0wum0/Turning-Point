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
| `TP_API_RATE` | API-Anfragen/Minute je Spieler (Standard 180) |

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

- Passwörter mit bcrypt (reines JS, keine nativen Module), Sessions in MySQL, HttpOnly/SameSite-Cookies
- CSRF-Token für alle schreibenden Anfragen, Rate-Limits (Login/Registrierung/API)
- Helmet + strikte Content-Security-Policy (keine Inline-Skripte)
- Uploads: Magic-Byte-Prüfung (PNG/JPG/WEBP/GIF), Zufallsdateinamen, außerhalb der App, `nosniff`
- Spiellogik ausschließlich serverseitig (Client schickt nur Absichten); Aktionen laufen in DB-Transaktionen mit Zeilensperre

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
