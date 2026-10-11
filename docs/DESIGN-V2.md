# Design V2 (Beta)

Im Spiel über das Zahnrad **Einstellungen → Design → Design V2 · Beta** aktivieren.
**Bisheriges Design** stellt das bisherige Layout wieder her. Die Auswahl wird pro
Browser in `tp-game-design` gespeichert; unbekannte Werte verwenden Classic.
Die vorhandene Hell-/Dunkel-Präferenz `tp-theme` wird nicht überschrieben.

V2 übernimmt den Aufbau der Video-Referenz: kompakte Statusleiste, dunkle
Verwaltungspanels, farbige eigene Dock-Illustrationen, große Karte und ein
aufklappbares Stadtpanel. Die fünf Menügruppen enthalten sämtliche 14 bisherigen
Routen einschließlich Freischaltungen, Hinweisen und Zählern. Konto, Hilfe,
Animationen, Ton, Sprache, Farbschema und Abmelden bleiben im Zusatzmenü erreichbar;
Chat, Benachrichtigungen und Einstellungen bleiben direkt in der Statusleiste.

## Technische Grenzen

- Zusätzliche CSS-Datei, alle Spiel-Overrides unter `data-game-design="v2"` und
  `body.game`. Classic bleibt Standard. Landingpage und Admin sind nicht betroffen.
- Bestehende Routen, Seiten, Spiellogik und API-Aktionen werden wiederverwendet.
  Der Designwechsel zeichnet nur die Navigation neu; Eingaben, SVG-Karte,
  Zoomzustand und Spielszene werden nicht neu erzeugt.
- Keine Änderungen an Spielstand, Datenbankschema, Preisen oder Freischaltungen.
- Auf schmalen Hochformat-Displays steht das Stadtpanel unter der Karte, im
  Querformat und auf dem Desktop über der linken Kartenseite. Es ist scrollbar.
- Einführungen bleiben über „Karte & Spielhilfe“ verfügbar. Escape schließt
  Dockmenüs; die Designauswahl verwendet den bestehenden zugänglichen Dialog.
- Wird Browserspeicher blockiert, funktioniert der Wechsel für die aktuelle
  Sitzung und zeigt an, dass er nicht gespeichert werden konnte.

## Prüfung

`npm test` und `npm run test:design` (Playwright installieren oder
`TP_PLAYWRIGHT_PATH` setzen; optional `TP_CHROMIUM_PATH` für vorhandenes Chromium).

Der zusätzliche Browsertest verwendet einen lokalen Server mit echten
Seed-/Presenter-Daten und simulierten API-Antworten, keine Produktivkonten. Er
prüft alle 14 Navigationsziele, Erreichbarkeit der Untermenüs, 1440×900, 832×384,
412×915 und 320×640, Kartenzustand beim Wechsel, Rückkehr zum Classic-Layout,
Speicherung nach Reload und Rendering der ursprünglichen Spielszene. Die
Datenbankintegration wird dadurch nicht ersetzt.
