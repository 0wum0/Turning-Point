# TURNING POINT · Life. Work. Legacy.

Generationenübergreifende Lebens-, Wirtschafts- und Familiensimulation (Web-First).
Node.js + Express + MySQL/MariaDB – läuft auf **Hostinger Business (Node.js-Web-App)**.

Enthalten sind:

| Teil | Beschreibung |
|---|---|
| **Installer** | Web-Assistent unter `/install` (System-Check, DB-Test, Schema, Startdaten, Admin-Konto) |
| **Spiel** | Charaktererstellung, EFS-Zeitsystem, Meter, Wohnen, Beruf/Ausbildung/Studium, Zeitung/Web, Karte, Umzug, Familie, Erbe, Generationen, Coins |
| **Admin-Panel** | Dashboard, Spieler, Städte (mit Bild-Upload), Berufe, Medien, Einstellungen, System, Protokoll |
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
