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
- **Bots:** Admin → Spieler → *Bots* (standardmäßig aus). Echte Konten (`users.is_bot`) mit Charakteren, die nach den Spielregeln leben, im Stadtplatz-Chat plaudern, Briefe beantworten, Freundschaften annehmen und Spielerbetriebe besuchen (`src/lib/bots.js`, Texte in `bot-texts.js`). Leitplanken: nicht in der Singles-Liste, keine Beziehungen mit Spielern, nie Geld-/Kaufbitten, ehrliche Antwort auf die ernste Frage „Bist du ein Bot?“, Hinweis in den Nutzungsbedingungen (Abschnitt 2a), im Admin gekennzeichnet; Anti-Cheat und Statistiken ignorieren Bots.
