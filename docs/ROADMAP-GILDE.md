# Roadmap „Die Gilde“ – Bauschritte 9 bis 15

Stand: Analyse des Codes nach Schritt 8 (Gesellschaft). Reine Planung, kein Feature-Code.
Die Schritte 0 bis 8 sind fertig (Warenkreislauf, Stadtwirtschaft, Ruf, Recht & Gericht, Talente, Jahreszeiten, Handel & Transport, Gesellschaft, dazu Einsteiger-Erlebnis, Börse, Wahlen/Karriere, Design V2). Dieses Dokument legt fest, was von den Mechaniken des Spiels „Die Gilde“ (2002) schon im Spiel steckt, was fehlt und wie die Lücken **realistisch in unserer Welt** (Deutschland ab 1945, keine Fantasy) geschlossen werden. Der ältere Konzeptstand steht in `docs/ROADMAP.md`, Design V2 in `docs/DESIGN-V2.md`, die Feature-Beschreibungen im `README.md`.

---

## 1. Leitplanken

| Prinzip | Bedeutung für alle Schritte |
|---|---|
| **Realistisch übersetzen** | Mittelalterliche Begriffe werden durch heutige Entsprechungen ersetzt (Titel → Stand, Ehrungen, Familienunternehmen; Folter → Ermittlungsbefugnisse mit Richtervorbehalt; Kutsche → Lkw, Bahn, Schiff, Flugzeug, gibt es schon). Epochen bleiben maßgeblich: Alarmanlage, Videoüberwachung und Cyberangriff gibt es erst, wenn es sie historisch gab. |
| **Keine Verherrlichung** | Straftaten erscheinen aus der Sicht von Opfer, Schutz und Ermittlung. Keine Anleitungen, keine Gewaltdarstellung, keine Kinder als Ziel. Entführung und Waffen entfallen vollständig. |
| **Freiwillig und gedeckelt** | Feindliche Mechaniken bleiben opt-in (wie `rivalry.mode = optin`). Jede Wirkung hat einen Deckel und hängt an einem `effects.strength` (0 = aus, 1 = normal, 2 = doppelt) wie bei Talenten und Gesellschaft. |
| **Kanzler bleibt erreichbar** | Kein neues System darf die politische Laufbahn Ortsbeirat bis Bundeskanzler sperren. Neue Laufbahnen sind nie Voraussetzung. Jede Gremienwahl hat einen Fallback (NPC-Gremium oder Bürgerwahl), damit nichts ewig offen bleibt. |
| **Einsteiger zuerst** | Jedes System startet im Autopilot (neutrale Werte, Manager oder Voreinstellung erledigt es). Neue Bereiche kommen über `UNLOCKS` (`src/game/onboarding.js`), eine Aufgabe in `QUESTS`, einen „Was jetzt?“-Hinweis (`advise`), Glossar-Einträge und „Worum geht es hier?“-Texte. Der Server sperrt nichts, nur die Oberfläche blendet progressiv ein. |
| **Balance ±10 %** | Jeder Schritt bekommt einen Schalter in `tools/econ-sim.js` (z. B. `--betrieb on|off`) und bleibt für alle Archetypen im Mittel innerhalb ±10 % (Einzelläufe der Vermieter schwanken schon heute um ±20 bis 35 %, das wird wie bisher berichtet). Neue Wirkungen sind mittelwertfrei (Mitte = 0), so wie die Talente und Jahreszeiten. |
| **Bekannte Muster nutzen** | Reines Modell in `src/game/*.js` mit `*-defaults.js`; Datenbank und Geldflüsse in `src/lib/*.js`; Geld an andere Konten nur über `pending_credits`; Ruf über `reputation.queue/flush`; Spuren über `court.trace` (Eintrag in `ACTS`); Beschlüsse je Amtszeit wie `policies.js`/`court-policy.js`; Einstellungsgruppe in `src/settings.js` plus `src/admin-labels.js`; Migration ab `034` (jeweils nächste freie Nummer); Texte in neuen `client-`/`messages-`Dateien (nächster freier Buchstabe ab S). |

### Definition of Done (gilt für jeden Schritt)

1. Reines Modell + Defaults, deterministisch, mit Unit-Tests (`node --test test/*.test.js`).
2. Persistenz/Geld in `src/lib`, Migration, `upgradeState` für Altspielstände (Felder fehlen = neutraler Zustand, idempotent).
3. Admin: Einstellungsgruppe (Ein/Aus, `effects.strength`, alle Zahlen), Beschriftung in `admin-labels.js`, wo sinnvoll Admin-Seite mit Protokoll und rollenabhängigem Zugriff (`roles.js`).
4. Bots: Verhalten in `bots.js`/`civic-bots.js`/`court.botRound`-Stil, ununterscheidbar von Spielern, mit Leitplanken (keine Geldbitten, keine Beziehungen zu Spielern).
5. i18n: deutsche Quelltexte, englische in neuen `client-<X>.js`/`messages-<X>.js`, Test nach Vorbild `civic-i18n.test.js`; Spielereingaben bleiben mit `data-i18n-skip` unübersetzt.
6. Oberfläche in **Classic und Design V2** (siehe Abschnitt 5); `test/ui-static.test.js` und, wo 3D betroffen ist, `test/e2e/design-*.test.js`.
7. Einsteiger-Anbindung (Freischaltung, Aufgabe, Hinweis, Glossar).
8. Balance-Lauf (`econ-sim` mit Schalter), Fuzz-Szenario (`test/fuzz.test.js`, `tools/fuzz-long.js`), DB-Test (opt-in `TP_TEST_DB_PORT`), E2E-Szenario in `test/e2e/e2e.test.js`.
9. README-Abschnitt (Modell, Wirkungen, Admin, Bots, Balance-Tabelle, Qualität, Offen) und DESIGN-V2-Abschnitt.

---

## 2. Abgleich: Vorlage → Stand heute → Lücke → Plan

Legende Stand: **ja** = vollständig vorhanden, **teils** = Kern da, Lücken benannt, **fehlt** = nichts vorhanden.

### 2.1 Wirtschaft

| Vorlage | Stand heute (Code) | Lücke | Plan |
|---|---|---|---|
| Warenkreislauf, schwankende Marktpreise | **ja**: `src/game/goods.js` (35 Waren, Rezepte, Knappheit je Stadt), `cityecon.js` (fünf Preisindizes), `harvest.js` und `seasons.js` (Ernte, Jahreszeit), Lieferverträge `src/lib/supply.js`, Politik-Beschlüsse `policies.js`; UI `economy.js`, `supply.js`, `found.js` | Betriebe haben **keinen Lagerbestand**: Versorgung ist ein Fluss (`companyFlows`), Lieferausfälle schlagen sofort durch, Preisfenster (günstig einkaufen) sind nicht nutzbar | Lager-Modul in Schritt 9 |
| Betriebs-Upgrades: Lagerplatz | **fehlt** | Kein Puffer, keine Lagergröße | Schritt 9 (Modul „Lager“, Stufen 0 bis 3) |
| Betriebs-Upgrades: Feuersicherheit | **teils**: `events.js` kennt Feuer **nur für Immobilien**, Gebäudeversicherung (`settings.js` `insurance.gebaeude`) deckt Haus; Betriebe haben nur Zufallsereignisse Inspektion, Streik, Lob, Diebstahl (`bizEvents` in `business.js`) | Kein Betriebsbrand, kein Brandschutz, keine Betriebsversicherung | Schritt 9 (Modul „Brandschutz“, Betriebsbrand als seltenes Ereignis, Betriebsversicherung) |
| Betriebs-Upgrades: mehr Arbeiter | **teils**: Räume (`A.bizExpand`), Stufen (`A.bizUpgrade`), Personal höchstens Bedarf + 2 (`room()` in `talent-actions.js`) | Starre Obergrenze, keine Arbeitsplatz-Ausstattung | Schritt 9 (Modul „Arbeitsplätze und Sozialräume“) |
| Betriebs-Upgrades: Wachen gegen Diebe | **teils**: `A.bizSecurity` ist ein **Schalter** (`c.security`), kostet 4 % der Raumerträge, wirkt in `rivalry.js` (`successSecurity`, `caughtSecurityBonus`) und auf Beweisstärke (`court` `securityBonus`) | Keine Stufen, kein Bezug zu Diebstahl-Ereignissen, keine Epochen (Alarmanlage, Video) | Schritt 9 (Stufenleiter 0 bis 3, Altwert `true` = Stufe 1); Diebstahl-Seite in Schritt 14 |
| Mitarbeiter: Lehrlinge/Gesellen | **ja**: `talents.js` (Bewerberpool, 2 Lehrstellen, Lehre 3 Jahre, Meister-Faktor), `talent-actions.js` (`bizHireApplicant`, `bizTrain`, `bizRaise`, `bizFire`), UI `talents.js`, Betriebsdialog | – | – |
| Mitarbeiter: Löhne | **ja**: Lohn je Mitarbeiter `m.w`, Lohnforderung mit Frist (`raise.askDays`), Spieler als Angestellte (`bonds.js`, Lohngrenzen) | Kein Bonus, keine Sonderzahlung | Schritt 9 |
| Produktivität durch Lob, Geschenke, Bonus – oder Drohungen | **fehlt**: Produktivität hängt nur an Talent-Passung (±10 %) und Streik-Zufall | Kein Betriebsklima, keine Führungsaktionen | Schritt 9 (Betriebsklima 0 bis 100, Lob, Prämie, Betriebsfest, Abmahnung als „Drohung“) |

### 2.2 Dynastie und Privatleben

| Vorlage | Stand heute (Code) | Lücke | Plan |
|---|---|---|---|
| Charakterwerte und Talente | **ja**: sechs Talente 1 bis 100 (Handwerk, Handel, Führung, Bildung, Charme, Kondition) mit Anlage und Obergrenze (`talents.js`), Vererbung, Wirkungen gedeckelt | Rhetorik entspricht Charme/Führung, Verhandlung entspricht Handel (kein Handlungsbedarf). **Kampf entfällt** (kein Gewalt-Talent) | Keine neue Basisgröße; Kampf wird bewusst nicht übersetzt |
| Erfahrungspunkte | **teils**: Spielfigur wächst nur passiv (`yearPts`, Beruf) und über Kurse/Bildungspolitik; Kinder über „Fördern“; Mitarbeiter über Kurse/Lehre | Kein Erfahrungskonto, keine Verteilung durch den Spieler, keine Wirkung von Tätigkeiten | Schritt 10 (EP aus Tätigkeiten, Verteilung, steigende Kosten, Tagesdeckel) |
| Ausrüstung (Ringe, Waffen, Parfüm) | **fehlt** (kein Inventar, `grep` nach Auto, Kleidung, Schmuck ohne Treffer) | Keine Ausstattung | Schritt 10 (Ausstattung: Kleidung, Uhr/Schmuck/Eheringe, Fahrzeug, Arbeitsmittel, Pflege; keine Waffen) |
| Brautschau: umwerben per Gedicht, Geschenk, Kompliment | **teils**: Kontaktanzeigen der Zeitung (`newspaper.js`), `A.meet` (ein Treffen, Zufallswurf), `A.gift`, `A.together`, `A.marry`; Spielerehen über `bonds.propose` | Werben ist ein Einmalwurf ohne Verlauf, ohne Vorlieben, ohne Auswahl der Mittel | Schritt 11 (mehrstufiges Werben: Kompliment, Brief, Geschenk, Ausflug; Vorlieben des Gegenübers) |
| Partner bringt Geld, Titel oder Betriebe mit | **teils**: Beruf des Partners qualifiziert für Betriebe (`business.qualification`), Talente aus dem Beruf | Kein Vermögen, kein Betrieb, kein Ruf/Stand, kein Ehevertrag | Schritt 11 (Partnerbeitrag, Güterstand, Familienbetrieb der Schwiegerfamilie, nur bei NPC-Partnern) |
| Nachfolge: Kinder zeugen, großziehen, Schule/Lehre | **ja**: Kinderwunsch (`A.plan`), Geburt (`family.bornChild`), Schule, Ausbildung, Studium, Weglaufen, Adoption, Fördern (`A.foster`); UI `views/family.js` | Kein Heranführen im eigenen Betrieb | Schritt 11 (Einarbeitung im Familienbetrieb) |
| Nahtloser Wechsel zum Kind | **ja** (beim Tod): `heir.js` (`createHeirState`, Pflichtanteil, Immobilien/Betriebe zugedacht), `service.chooseHeir`, Stammbaum `views/legacy.js`, Stiftung geht über den Erbfall | Kein Wechsel zu Lebzeiten, kein Dynastie-Wert über Generationen hinaus (Rangliste `dynasty` zählt nur Generationen) | Schritt 11 (Übergabe zu Lebzeiten optional, Traditionsbetrieb, Dynastie-Wertung) |
| Titel und Status: Titel kaufen, Privilegien, größere Häuser, höhere Ämter | **teils**: `civic-defaults.js` `TITLES` (Ehrenbürger, Kommerzienrat 3 Ränge, Stifter, Mäzen, Ehrenvorsitz, Altamt) werden **automatisch** nach Ansehen, Spenden, Betriebswert verliehen; Wirkung klein (Stimmengewicht ≤ 6 %, Kandidaturgebühr, Umsatz, Vereinsplätze); Ruf-Mindeststufen für Ämter | Titel schalten keine Wohnlage, kein Haus, keine Clubs frei; kein gesamter „Stand“; Ehrungen durch Landtag/Kanzler fehlen | Schritt 10 (gesellschaftlicher Rang mit weichen Privilegien), Schritt 12 (Ehrungen verleihen) |

### 2.3 Politik und Justiz

| Vorlage | Stand heute (Code) | Lücke | Plan |
|---|---|---|---|
| Pyramidenförmiges Amtssystem (Informant, Stadtwache, Richter … Bürgermeister) | **teils**: sechs politische Ämter `settings.js` `economy.politics.offices` (Ortsbeirat … Bundeskanzler), Aufstieg Stufe für Stufe (`society.js`, `elections.js`), Gehalt `officeEffects`, Beschlüsse je Amtszeit (`policies.js`, `court-policy.js`, `cityecon` Politik) | Der **Unterbau fehlt**: keine Ämter für Ordnung, Polizei, Ermittlung, Anklage, Richter; das Gericht läuft vollautomatisch (`src/lib/court.js`) | Schritt 13 (Laufbahn „Sicherheit und Recht“) |
| Gehalt und Sonderfähigkeiten je Amt (Steuern ändern, begnadigen, Folter) | **teils**: Steuern/Zoll/Mehrwertsteuer/Strafrahmen/Verjährung/Amnestie als Beschlüsse (ein Beschluss je Amtszeit, Vorschau, Umlage) | Keine Befugnisse im Verfahren (Ermittlung, Anklage, Urteil), kein Gnadenentscheid für Einzelfälle. **Folter entfällt** | Schritt 13 (Ermittlungsbefugnisse mit Richtervorbehalt, Anklage von Amts wegen, Gnadenentscheid Landtag) |
| Gewählt von Amtsinhabern der Ebene darüber | **fehlt**: `elections.js` ist Bürgerwahl (alle wohnenden Konten, Bots mit Gewicht gedeckelt, ein Stimmrecht je Konto) | Kein Gremienwahlrecht | Schritt 12 (Gremienwahl für neue Ämter, optional Kanzler durch Bundestag, immer mit Fallback) |
| Bestechung der Wähler | **teils**: nur Bestechung des Richters durch den Angeklagten (`gericht.bribe`, Spur `bribe`) | Keine Wahlbestechung, keine regulierte Wahlkampffinanzierung | Schritt 12 (Wahlkampfmittel mit Obergrenze und Transparenz; Vorteilsgewährung an Gremienmitglieder als strafbare Tat mit Spur) |
| Gerichtsverhandlung mit Kläger, Angeklagtem, Richter | **teils**: Kläger und Angeklagter vollständig (Anzeige, Rechtsanwalt, Vergleich, Geständnis, Berufung, Bestechung; `court.js` und `src/lib/court.js`, Urteil `decide` deterministisch mit festem Würfel); UI `public/js/game/court.js` als Verfahrenskarten | **Keine Richterrolle**, keine Schöffen, keine Verhandlung als Szene, kein Gerichtsgebäude (`places.js` kennt keins) | Schritt 13 |

### 2.4 Intrigen und Unterwelt

| Vorlage | Stand heute (Code) | Lücke | Plan |
|---|---|---|---|
| Spione anheuern, Konkurrenz sabotieren | **teils**: `src/lib/rivalry.js` (Industriespionage, Preiskampf, Abwerben, Sabotage; opt-in, Tages-/Wochenlimits, Neulingsschutz, Entdeckung, Strafe, Sperre, Spuren fürs Gericht) | Nur Selbstausführung, kein **Beauftragen** eines Dienstleisters (Haftung des Auftraggebers) | Schritt 14 (Aufträge an Detektei/Dienstleister) |
| Brandstiftung | **teils**: „Sabotage“ (Produktionsausfall 6 Tage) ist abstrakt; Feuer gibt es nur zufällig an Immobilien | Kein Brandanschlag, kein Betriebsbrand | Schritt 9 (Betriebsbrand als Ereignis), Schritt 14 (Brandanschlag als Sabotage-Variante, nur wenn Entscheidung 1 es zulässt) |
| Diebe: Taschendiebstahl, Einbruch | **teils**: Einbruch zufällig (`events.js` `burglary`, Hausratversicherung deckt), Diebstahl im Betrieb zufällig (`bizEvents` `theft`), Diebstahl auf der Route (`trade.js` `stolen`, Spur `theft`) | Keine Kriminalitätslage, keine Schutzmaßnahmen außer Versicherung, keine Taschendiebstahl-/Fahrzeug-/Betrugsfälle, kein Bezug zu Polizeibudget außer Beweisstärke | Schritt 14 |
| Räuber überfallen Handelskarren | **teils**: Risiko `robbery` („Plünderung“, Nachkriegszeit) in `trade.js`/`transport-defaults.js`, Transportversicherung, Neulingsschutz | Kein Begleitschutz, kein Lagebild der Route, Vorfall nicht sichtbar | Schritt 14 (Begleitschutz, Lagebild), Schritt 15 (Sichtbarkeit) |
| Entführung und Lösegeld | **fehlt** | – | **Entfällt.** Ersatz: Erpressung per Cyberangriff (Verschlüsselungstrojaner, ab 2000er) und Betrugsmaschen mit Schutz, Backup und Versicherung (Schritt 14) |

### 2.5 Ansichten

| Vorlage | Stand heute (Code) | Lücke | Plan |
|---|---|---|---|
| Lebendige Stadtansicht (Karren, Diebe, Brände sichtbar) | **teils**: V2-3D-Stadt (`city-3d.js`, `city-buildings.js`, `city-life.js`, `atmosphere.js`): Tag/Nacht, Jahreszeit, Passanten, Fuhrwerke/Autos je Epoche, Rauch; Karte zeigt Fracht schematisch (`map-operations.js`); Classic: Luftbild `aerial.js` mit anklickbaren Gebäuden | Das Leben ist **Kulisse**: Fahrzeuge und Passanten kennen weder eigene Routen noch Vorfälle; keine Brände, keine Polizei, keine Baustellen | Schritt 15 |
| Klick schickt Charaktere | **fehlt**: Klick wählt Gebäude und fliegt die Kamera, es gibt keine Spielerfigur | Keine Figuren für Spieler, Familie, Mitarbeiter | Schritt 15 |
| Innenansicht Wohnhaus (Familie, Chronik, Geschenke, Titel) | **teils**: `rooms.js` `home` mit Hotspots (Bett, Kühlschrank, Herd, Schreibtisch, Familie …), Aktionsleiste (`BAR`), Vermächtnis/Familie als eigene Seiten | Titel, Orden, Familienbilder, Chronik nicht im Raum | Schritt 15 (Wand mit Ehrungen und Familienbildern, Hotspots), Inhalte aus 10 und 11 |
| Innenansicht Betrieb (Arbeiter bei der Arbeit, Menüs) | **teils**: `rooms.js` `biz` mit stehenden Mitarbeiterfiguren (`staffFigs`, höchstens 8), Hotspots „Kasse leeren“, „Einstellen & Verwalten“ | Keine Arbeitsanimation, keine Stimmung, keine Module sichtbar | Schritt 9 (Module/Stimmung in Daten), Schritt 15 (Darstellung) |
| Innenansicht Rathaus (Ämterbaum, Bewerbung, Abstimmung) | **teils**: `rathaus` mit Hotspots „Arbeiten“, „Wahlen“, „Umziehen“; Wahlen als Liste in `elections.js` (Spieler → Wahlen), Ämterliste in `views/society.js` | Kein Ämterbaum, keine Bewerbung der Verwaltungslaufbahn | Schritt 12 |
| Gerichtssaal (aufgereihte Parteien, Urteil) | **fehlt**: Verfahrenskarten mit Zeitleiste (`public/js/game/court.js`) | Kein Gebäude, kein Raum, keine Aufstellung | Schritt 13 |
| Charakterblatt (Talente, Ausrüstung, EP verteilen) | **teils**: Karte „Deine Talente“ in der Übersicht (`talents.js`, `views/overview.js`), Ansehen-Fenster (`reputation.js`) | Keine eigene Seite, keine Ausstattung, keine EP | Schritt 10 |
| Tagebuch und Chronik der Stadt | **teils**: persönliche Chronik `chronicle()` (500 Einträge, `state.tree.events`, Anzeige im Vermächtnis), Zeitung der Stadt (`press.js`, `newspaper.js`), Tagesblatt (`tagesblatt.js`, `world_events` und `public_news`, 60 Tage), Spielerwelt-Ereignisse | Keine **Stadtchronik** mit Hochzeiten, Todesfällen, Fehden und freien Ämtern; Fehden (Rivalität) erscheinen nur bei erwischter Sabotage | Schritt 15 |

---

## 3. Übersetzung ins Moderne

| Gilde-Begriff | Turning Point (Deutschland ab 1945) | Hinweis |
|---|---|---|
| Adelstitel kaufen | **Gesellschaftlicher Rang** (aus Ansehen, Vermögen, Titeln, Ausstattung) und **Ehrungen**: Ehrenbürger (Bürgermeister), Landesverdienstorden (Landtag), Verdienstorden der Bundesrepublik (Kanzler), Kommerzienrat (historisch gegen Spenden vergeben, gibt es schon), Traditionsunternehmen (Familienbetrieb 50 und 100 Jahre) | Kein Titel ist Voraussetzung für ein Amt; Wirkungen klein und gedeckelt |
| Größeres Haus durch Titel | Premium-Wohnlagen und Clubmitgliedschaften zu besseren Konditionen ab einem Rang; nichts wird gesperrt, nur günstiger oder früher angeboten | Kaufangebote bleiben für alle sichtbar |
| Schutzringe, Waffen, Parfüm | Ausstattung: Kleidung, Uhr und Schmuck (auch Eheringe), Fahrzeug, Arbeitsmittel (Aktentasche, Rechner), Pflege; keine Waffen | Erbstücke gehen an Kinder |
| Mitgift | Partnerbeitrag und Ehevertrag (Zugewinngemeinschaft oder Gütertrennung), Familienbetrieb der Herkunftsfamilie | Nur NPC-Partner; Spielerehen bleiben ohne Geldfluss zwischen Konten |
| Gedichte, Komplimente, Geschenke | Brief, Kompliment, Einladung zum Essen oder Konzert, Geschenk | Dieselbe Kandidatenliste wie heute |
| Informant, Stadtwache, Richter | Laufbahn „Sicherheit und Recht“: Ordnungsamt, Polizeivollzug, Kriminalkommissariat, Staatsanwaltschaft, Richteramt (mit Schöffen) | Beamtenlaufbahn: Bewerbung, Ernennung durch die Ebene darüber |
| Folter | Ermittlungsbefugnisse mit Richtervorbehalt: Akteneinsicht, Zeugenvernehmung, Spuren sichern, Observation, Durchsuchung; rechtswidrige Ermittlung führt zum Verwertungsverbot und Amtsverlust | Keine Gewaltmittel |
| Begnadigen | Gnadenentscheid (Landtag, Kanzler); die Amnestie des Kanzlers gibt es schon | Ein Fall je Amtszeit |
| Wähler bestechen | Wahlkampfmittel bis zur Obergrenze und mit Transparenz; Vorteilsgewährung an Gremienmitglieder ist strafbar (Spur, Gericht, Amtsverlust) | Bürgerwahl bleibt für die politischen Ämter |
| Räuber, Diebe | Alltagskriminalität als **Lage** der Stadt (Einbruch, Taschendiebstahl, Fahrzeugdiebstahl, Ladendiebstahl), Betrug; auf Fahrten Plünderung und Diebstahl | Nur NPC-Täter, kein Diebstahl zwischen Spielern |
| Entführung, Lösegeld | **entfällt**; Ersatz Erpressung per Cyberangriff mit Backup und Versicherung | Frühestens ab den 2000er Jahren |
| Brandstiftung | Brandanschlag als Variante der Sabotage (höchste Strafstufe), Betriebsbrand als Zufallsereignis mit Brandschutz | Abhängig von Entscheidung 1 |
| Spione anheuern | Wirtschaftsspionage im Auftrag (Detektei); der Auftraggeber haftet bei Aufdeckung (Anstiftung) | Opt-in wie bisher |
| Stadtchronik | Chronik mit Hochzeiten, Geburten, Todesfällen, Urteilen, Fehden, Ämtervakanzen | Datenschutz: Namen nur bei sichtbarem Profil |

---

## 4. Verzahnung mit vorhandenen Systemen

| System | Anbindung |
|---|---|
| **Ruf** (`reputation.js`) | Neue Ruf-Ereignisse mit Tagesgrenzen: fairer Arbeitgeber, Abmahnungsdruck, Amtsführung der Laufbahn, Wahlkampfspenden, Ehrungen. Der Rang nutzt `reputation.stand`. Mindeststufen für Ämter bleiben; „Verrufen“ ist weiterhin der einzige harte Ausschluss. |
| **Gericht** (`court.js`) | Neue Taten in `ACTS`: `votebuy` (Vorteilsgewährung im Gremium), `misconduct` (Amtsmissbrauch, rechtswidrige Ermittlung), `commission` (Auftrag an Dienstleister), `burglary`/`cyber` (NPC-Täter, Täter unbekannt), `arson` (falls Brandanschlag). Neue Sanktionen: Bewährung, gemeinnützige Arbeit. Alle Geldflüsse bleiben „genau einmal“ über `court_sanctions` und `pending_credits`. |
| **Talente** | EP-Verteilung (Schritt 10) arbeitet innerhalb `capAt`/`growRoom`; Führung wirkt auf Lob und Gremienwahl, Charme auf Werben, Bildung auf Jura-Laufbahn. Alle neuen Wirkungen laufen unter dem Gesamtdeckel von `talente.effects.strength`. |
| **Transport** (`trade.js`, `src/lib/transport.js`) | Lager (9) puffert Lieferausfälle, Lagebild und Begleitschutz (14) wirken auf `robbery`/`theft`, Fahrzeuge der eigenen Routen werden sichtbar (15). Fahrzeug aus der Ausstattung (10) ist rein privat. |
| **Gesellschaft** (`civic*.js`) | Titel-Katalog wird erweitert (Ehrungen, Traditionsunternehmen), Rang nutzt Titel, Verein „Nachbarschaftshilfe“ kann die Kriminalitätslage senken, Vereinsfeste und Gemeinde-Trauung begleiten Hochzeit (11). |
| **Politik** (`policies.js`, `elections.js`, `court-policy.js`) | Neue Beschlüsse nach dem Muster „ein Beschluss je Amtszeit, Vorschau, Umlage, endet mit der Amtszeit“. Die politische Laufbahn bleibt unverändert; Gremienwahl hat Fallback. |
| **Stadtwirtschaft** (`cityecon.js`) | Kriminalitätslage (14) liest Preisniveau, Löhne und Polizeibudget; Betriebsmodule kosten über `buildMult`. |
| **Jahreszeiten und Seuchen** | Arbeitsschutz und Klima reagieren auf Hitze, Kälte, Krankenstand; lange Winternächte erhöhen die Einbruchlage. |
| **Bank, Börse** | Betriebsmodule und Familienbetrieb gehen in den Betriebswert (`companyValue`) ein; die Börse bleibt unverändert. |
| **Einsteiger** | Neue Einträge in `UNLOCKS` (z. B. `staff`, `character`, `career`), neue `QUESTS`, `advise`-Hinweise („Das Team ist unzufrieden“, „Dein Haus ist ungeschützt“), Glossar je Begriff. |
| **Bots** | Jeder Schritt bringt eine `botRound`-Erweiterung; Bots nutzen Klima-Aktionen, verteilen EP, werben, bewerben sich auf Gremien (mit Obergrenze), lehnen Vorteilsgewährung nach Ruf ab. Anti-Cheat ignoriert Bots wie bisher. |
| **Anti-Cheat und Schutz** | Gleiche IP, neue Konten und Neulingsschutz gelten für alles Neue; Tagesdeckel je Quelle; Offline und Anfängerschutz (`game.newbie_protect_days`) vermeiden Verluste. |

---

## 5. Darstellung: Design V2 und Standarddesign

Regel: **Eine Logik, zwei Schalen.** Die API und die Spielaktionen sind für beide Designs identisch; V2 verschiebt vorhandene DOM-Abschnitte (siehe `docs/DESIGN-V2.md`) und nutzt zusätzlich die 3D-Stadt und Innenräume. Neue Seiten tragen sich in `DESIGN_GROUPS` (`public/js/game/design.js`) ein, damit alle Routen im Dock erreichbar bleiben.

| Bereich | Standarddesign (Classic) | Design V2 |
|---|---|---|
| Betrieb (9) | Erweiterung von `views/business.js` und Betriebsdialog: Karte „Ausbau“ mit Modulen und Preisvorschau, Karte „Betriebsklima“ mit Balken und Führungsknöpfen | Innenraum `biz` (`rooms.js`): Hotspots Lager (Regale mit Füllstand), Sicherheitsstufe (Kamera, Alarmpanel), Aushang Klima; Aktionsleiste „Einstellen & Verwalten“ |
| Charakterblatt (10) | neue Seite `character` (Hauptquartier) mit Talenten, EP, Ausstattung, Rang | wie Classic im Verwaltungsfenster, zusätzlich Garderobe im Wohnhaus-Raum |
| Werben und Familie (11) | Erweiterung `views/family.js`: Werbeverlauf mit Sympathiebalken, Ehevertrag-Dialog, Übergabe | Wohnhaus-Raum: Hotspot „Familie“ öffnet dieselbe Seite; Fotowand |
| Ämter (12) | Erweiterung `views/society.js` und `elections.js`: Karte „Ämterbaum“ als Pyramide, Bewerbungs- und Abstimmungsboxen | Rathaus-Raum: Ämterbaum als Wandtafel, Hotspots je Stufe öffnen Bewerbung/Abstimmung |
| Gericht (13) | Erweiterung `court.js`: Karte „Verhandlung“ mit Aufstellung Kläger / Richter / Angeklagter, Phasen, Urteilsbanner | Gebäudetyp `gericht` in `places.js` (Amtsgericht ab Stadtgröße 2, Landgericht größer) mit Gerichtssaal-Innenraum: Richterbank, Parteien, Zeugenstand, Zuschauerbänke |
| Sicherheit (14) | Karte „Sicherheitslage“ im Stil des Preisbarometers (`economy.js`), Schutzmaßnahmen, Vorfallliste | Wache als Gebäude, Polizeiauto und Absperrband in der Stadt bei Vorfall |
| Stadt und Chronik (15) | Luftbild `aerial.js` mit Ereignismarkern und Ereignisleiste, Chronik-Reiter in Zeitung | 3D-Stadt: Figuren, Klick-Befehle, Fahrzeuge der eigenen Routen, Feuer, Baugerüste; Chronik als Tafel im Rathaus/Archiv |

Querschnitt: Tastaturbedienung und Textalternative für jede Szene, `prefers-reduced-motion` und „Animationen aus“ werden respektiert, Draw-Call-Budget der 3D-Stadt bleibt im Test (`design-gilde.test.js`), Viewports 1440×900, 832×384, 412×915, 320×640.

---

## 6. Bauschritte

Reihenfolge nach Abhängigkeit und Nutzen. Jeder Schritt ist für sich lauffähig und ausgeliefert (Server, Admin, Bots, Texte, beide Designs). Zahlen sind Startwerte und im Admin änderbar.

### Schritt 9 – Betrieb 2.0: Ausbaumodule und Betriebsklima

**Ziel.** Betriebe werden zu Entscheidungseinheiten wie in der Gilde: Ausbau (Lager, Brandschutz, Schutz, Arbeitsplätze) und Personalführung (Lob, Prämie, Betriebsfest, Abmahnung), ohne Einsteiger zu überfordern.

**Umfang.**
- **Module** je Betrieb (`c.mods = { lager, brand, schutz, arbeit }`, je 0 bis 3, einmalige Kosten mit `buildMult` der Stadt plus Tagesunterhalt, epochenabhängig verfügbar):
  - *Lager*: Puffer an Zutaten in Tagen (3 / 7 / 14). Überbrückt Lieferausfälle der Verträge, erlaubt Einkauf im günstigen Preisfenster (Erntejahr, Saison) mit höchstens ±3 % Kosteneffekt. Lagerware ist bei Brand und Diebstahl gefährdet.
  - *Brandschutz* (Melder, Löschanlage): senkt Wahrscheinlichkeit und Schaden eines **neuen Betriebsbrands** (seltenes, deterministisches Wochenereignis wie `bizEvents`). Neue Betriebsversicherung (`insurance.betrieb`: Brand, Einbruch, Betriebsunterbrechung).
  - *Schutz*: `c.security` (Schalter) wird Stufenleiter 0 bis 3 (Schloss und Pförtner, Alarmanlage ab 1970, Videoüberwachung ab 1990, Werkschutz). Altwert `true` wird Stufe 1. Wirkt weiter auf Rivalität und Beweisstärke, neu auf das Diebstahl-Ereignis.
  - *Arbeitsplätze und Sozialräume*: hebt die Personalgrenze (Bedarf + 2) in Stufen mit sinkendem Grenzertrag und bildet die Basis des Klimas (Kantine, Arbeitsschutz).
- **Betriebsklima**: Wert 0 bis 100 je Mitarbeiter (`m.mood`) und Mittel je Betrieb. Treiber: Lohn relativ zum Marktlohn, Anerkennung, Auslastung, Sozialräume, Jahreszeit und Seuche. Wirkung mittelwertfrei: Produktivität höchstens ±6 % **innerhalb** der bestehenden Umsatzgrenze der Talente (kein Doppelzählen), Kündigungs- und Lohnforderungsneigung (bestehendes `ask`), Streikchance (bisher reiner Zufall, künftig klimaabhängig).
- **Führungsaktionen** (Abkühlzeit, Kosten in Lohntagen): *Lob* (kostenlos, kurze Wirkung, wirkt stärker mit Führung/Charme), *Prämie* (Geld, abnehmender Ertrag), *Betriebsfest/Weihnachtsfeier* (Team), *Gesundheitstag*, *Abmahnung/Kündigungsandrohung* (die „Drohung“: kurzfristig mehr Leistung, aber Klima sinkt und Wiederholung kostet Ruf `staff_pressure`). Spieler als Angestellte werden nie beeinflusst, sie entscheiden selbst; für sie bleibt nur der vereinbarte Lohn.
- **Autopilot**: Mit Manager hält der Betrieb das Klima auf neutralem Niveau; Einsteiger sehen Module und Klima erst, wenn der Betrieb Personal hat (`UNLOCKS.staff`).

**Abhängigkeiten.** Nur vorhandene Systeme (Business, Talente, Transport, Jahreszeiten). Grundlage für Schritt 14 (Schutz) und 15 (Darstellung).

**Risiken.** Doppelzählen mit Talent-Umsatz, Manager, Streik und Krankenstand; Spielstand wächst (Teamliste `c.team`, `m.mood`); Rückwärtskompatibilität von `c.security`; Überfrachtung der Betriebsseite (daher Autopilot und progressive Anzeige); Betriebsbrand darf keine Insolvenz auslösen (Deckel, Versicherung, Neulingsschutz, keine Ereignisse offline).

**Teststrategie.**
- Unit: Modulkosten und Epochen, Klima-Gleichgewicht, Deckel der Produktivität, Abkühlzeiten, Altwert `security: true`.
- Fuzz: `mood` stets 0 bis 100, Produktivität im Deckel, Geld erhalten, kein negatives Lager.
- DB (opt-in): Spieler-Angestellte unberührt, Prämie bucht genau einmal.
- Balance: `econ-sim --betrieb on|off` für Betriebsinhaber und Mischform; Ziel: Vollausbau netto höchstens +6 % Gewinn gegenüber Basis, Nichtnutzer ±0 %, alle Archetypen innerhalb ±10 %.
- E2E: Modul kaufen, Prämie geben, Klima sichtbar; i18n-Test; UI-Static für Classic und V2.

---

### Schritt 10 – Charakterblatt, Erfahrung und Ausstattung

**Ziel.** Die Spielfigur bekommt ein Profil mit Entscheidungen: Erfahrungspunkte verteilen, Ausstattung wählen, gesellschaftlichen Rang sehen.

**Umfang.**
- **Erfahrungskonto (EP)** in `state.talents.xp`: EP entstehen aus Tätigkeiten (Verhandeln: Vertrag, Gehaltsgespräch → Handel; Team führen, Verein leiten, Amt → Führung; Feste, Wahlkampf, Vereine → Charme; Kurse, Studium, Gericht → Bildung; eigene Arbeit im Betrieb → Handwerk; Sportverein → Kondition) mit Tagesdeckel je Quelle (Muster `AWARD_SPACING`, `compDayCap`). Verteilung auf Talente bis zur bestehenden Grenze (`capAt`), Kosten steigen mit dem Wert. Passive Zuwächse (`yearPts`) bleiben.
- **Ausstattung** statt Ausrüstung: Slots Kleidung, Uhr/Schmuck (inkl. Eheringe aus Schritt 11), Fahrzeug (Fahrrad bis Auto, epochenabhängig), Arbeitsmittel (Aktentasche, später Rechner), Pflege. Kauf mit Geld, Wiederverkauf mit Abschlag, Moden nach Epoche, Erbstücke gehen an Kinder. Wirkung klein, gedeckelt und vor allem Status. **Keine Waffen.** Coins kaufen nie Werte, höchstens Kosmetik.
- **Gesellschaftlicher Rang** (1 bis 7, rein berechnet aus Ansehen, inflationsbereinigtem Vermögen, Titeln, Ausstattung): weiche Privilegien (Premium-Wohnlagen früher und günstiger, Clubs, bessere Plätze), keine Sperren.
- **Seite Charakterblatt** (Porträt, Talente mit Boni, EP, Ausstattung, Ansehen, Titel, Rang, Kurz-Lebenslauf aus `chronicle`).

**Abhängigkeiten.** Talente, Ruf, Gesellschaft (Titel). Unabhängig von Schritt 9, parallel möglich.

**Risiken.** Doppelzählen mit Talentwirkungen (gemeinsamer Deckel `effects.strength`); Eindruck „Pay to win“; EP-Farming (Deckel, Anti-Cheat); Erbe: EP und Ausstattung dürfen nicht doppelt wandern (Kind erbt Erbstücke nach Pflichtanteil, EP nur als kleiner Bildungsvorsprung); Geldsenke darf die Balance nicht kippen.

**Teststrategie.**
- Unit: EP-Quellen und Deckel, Kostenkurve, Verteilung bis `capAt`, Ausstattungswirkung gedeckelt, Rangformel monoton.
- Altstand: `upgradeState` legt `xp = 0` an, idempotent.
- Fuzz: Talente 1 bis 100, Wirkungen im Deckel, Ausstattung nie negativ.
- Heir-Test: Erbstücke, keine EP-Verdoppelung.
- Balance: `econ-sim --charakter on|off`, Ausstattungskosten höchstens 5 bis 8 % Jahreseinkommen bei Vollausstattung, Wirkungssumme unter 3 % Nettovermögen.
- E2E: EP verteilen, Ausstattung kaufen, Rang ändert sich; i18n; UI-Static.

---

### Schritt 11 – Werben, Ehe und Familienunternehmen

**Ziel.** Partnerwahl und Nachfolge werden zur Planungsaufgabe der Dynastie, mit nahtlosem Generationswechsel.

**Umfang.**
- **Werben statt Einmalwurf**: Aus den Kontaktanzeigen (vorhandene Kandidatenliste) wird ein Verlauf Kennenlernen → Verabredung → Paar. Jede Person hat zwei Vorlieben (deterministisch aus Beruf, Talent, Alter). Aktionen: Kompliment (Charme-Probe, Abkühlzeit), Brief/Gedicht (Bildung/Charme), Geschenk, Ausflug/Essen/Konzert. Sympathie steigt bei Treffern und fällt bei Fehlgriffen. Die bestehenden Regeln der Partnerwahl bleiben unverändert.
- **Partnerbeitrag und Ehevertrag** (nur NPC-Partner): Aussteuer in begrenztem Umfang, selten ein **Familienbetrieb** als Beteiligung, kleiner Ansehens- und Rangvorschuss der Herkunftsfamilie. Güterstand wählbar (Zugewinngemeinschaft als Standard, Gütertrennung mit Ehevertrag), wirkt auf Trennung und Erbe. Spielerehen (`bonds.js`) bleiben ohne Geldfluss zwischen Konten.
- **Nachfolge**: Kinder können im eigenen Betrieb eingearbeitet werden (Talentzuwachs, Berufserfahrung, erbt Vorsprung wie in `heir.js`). **Traditionsbetrieb** (50 und 100 Jahre in Familienhand) als Familientitel im Katalog `civic`. Rangliste „Dynastie“ berücksichtigt Familienbetrieb-Alter.
- **Optional (Entscheidung 3)**: Übergabe zu Lebzeiten ab Alter 60 (vorweggenommene Erbfolge): Betrieb/Immobilie an ein volljähriges Kind, Wechsel der Spielfigur auf Wunsch.

**Abhängigkeiten.** Schritt 10 (Rang, Eheringe, Erbstücke) wünschenswert, nicht zwingend. Nutzt Gemeinde-Trauung und Talente.

**Risiken.** Geldschöpfung durch Aussteuer (einmalig je Charakter, Obergrenze im Verhältnis zum Lebensvermögen, Scheidung verwirkt); Partnerwechsel-Farming; Konflikte mit Pflichtanteil und Trennungsregel; Altstände mit bestehender Ehe (kein nachträglicher Vertrag); Vorlieben dürfen kein Sackgassen-Raten werden (Hinweise im Klartext, Einsteiger-Voreinstellung „Beste Wahl“).

**Teststrategie.**
- Unit: Sympathiemodell deterministisch, Aussteuer-Obergrenze, Güterstand: Scheidung und Tod rechnen auf den Cent.
- Fuzz: Geld erhalten (Σ vor = Σ nach plus Aussteuer), Kinder und Partner konsistent.
- Heir/DB: Pflichtanteil unverändert, Spielerehe unberührt, Übergabe zu Lebzeiten ohne Duplikat von Besitz.
- Balance: `econ-sim` um Archetyp „Familie“ ergänzen, Band ±10 %.
- E2E: Werben bis zur Ehe, Ehevertrag, Kind im Betrieb; i18n; UI-Static.

---

### Schritt 12 – Ämterpyramide, Rathaus und Wahlen

**Ziel.** Politik wird als sichtbare Pyramide mit Befugnissen erlebbar. Gremien wählen, Wahlkampf kostet und kann strafbar werden. Der Weg zum Kanzler bleibt offen.

**Umfang.**
- **Gremienwahl** (`elections.mode = council`) für neue Ämter: Wähler sind die Inhaber der Ebene darüber (Spieler und NPC-Sitze), Quorum, danach **Fallback** (NPC-Gremium oder Bürgerwahl nach höchstens zwei Zyklen). Die bestehende Bürgerwahl der sechs politischen Ämter bleibt Standard. Admin-Schalter `kanzlerMode: citizens | bundestag | mixed` (Standard `citizens`); bei zu wenigen Bundestagsmitgliedern fällt `bundestag` automatisch auf Bürgerwahl zurück.
- **Befugnisse** je Amt, jeweils eine pro Amtszeit mit Vorschau und Umlage (Muster `policies.js`): Stadtrat wählt Dezernenten, Bürgermeister Ehrungen und Haushaltsentscheid, Landtag Gnadenentscheid für **einen** Fall und Landesverdienstorden, Bundestag Rahmen, Kanzler Verdienstorden und die bestehenden Beschlüsse.
- **Wahlkampf und Bestechung**: legale Wahlkampfmittel bis zu einer Obergrenze, öffentlich ab einem Betrag (Transparenz). Vorteilsgewährung an Gremienmitglieder ist eine Tat (`votebuy`) mit Spur, Entdeckungschance (Polizeibudget wirkt), Anzeige, Amtsverlust und Skandal. Gremien-Bots lehnen nach Ruf ab.
- **Ehrungen**: Katalog `civic.titles` erhält verleihbare Titel (Landesverdienstorden, Verdienstorden, begrenzte Anzahl je Amtszeit, Vorschau, 30-Tage-Sperre wie bei der Ehrenbürgerwürde).
- **Rathaus-Ämterbaum** (Darstellung siehe Abschnitt 5): Pyramide aller Stufen mit Inhaber, Gehalt, Befugnis, Mindestansehen, Bewerbung/Kandidatur und Abstimmung.

**Abhängigkeiten.** Ruf (Mindeststufen), Gericht (Spur `votebuy`), Gesellschaft (Titel). Schritt 13 baut darauf auf (Ernennungen).

**Risiken.** Kanzlerpfad: Test „erreichbar unter jeder Einstellung“ ist Pflicht. Machtkonzentration und Absprachen (Befangenheit: Freunde, Verein, gleiche IP; Rotation). Wenige Spieler je Gremium (deshalb NPC-Sitze und Fallback). Echtzeit-Zyklen gegen Spieluhr. Wahlkampfmittel dürfen kein Geldkanal zwischen Konten werden (Zahlung an Staat/Kampagne, nie an Personen).

**Teststrategie.**
- Unit: Quorum, Fallback, Gewichtung, Obergrenzen, Befangenheit, Gehalts- und Kraftkosten.
- DB (opt-in): Gremienwahl mit zwei Spielern und NPC-Sitzen, Fallback nach Zyklus, Bestechungsversuch mit Spur und Anzeige, Ehrung mit Sperre, Absetzen durch Admin mit Protokoll.
- Fuzz: Besetzung immer eindeutig oder offen, keine doppelten Amtsinhaber, Geld erhalten.
- Kanzler-Test: von Ortsbeirat bis Kanzler mit `kanzlerMode` in allen drei Einstellungen und ohne Spieler im Bundestag.
- Balance: Ämter bleiben außerhalb von `econ-sim` (unverändert bitgleich); Gehälter wie bestehende Ämter.
- E2E: Kandidatur, Gremienabstimmung, Ehrung; i18n; UI-Static in Classic und V2.

---

### Schritt 13 – Sicherheit und Recht: Laufbahn, Richterrolle, Gerichtssaal

**Ziel.** Verfahren erhalten die dritte Rolle (Richter), Behörden erhalten Ermittlungsbefugnisse. Die Verhandlung wird als Szene sichtbar.

**Umfang.**
- **Laufbahn „Sicherheit und Recht“** in fünf Stufen: Ordnungsamt (Hinweisgeber, die „Informanten“), Polizeivollzug (Stadtwache), Kriminalkommissariat, Staatsanwaltschaft, Richteramt (mit Schöffen). Bewerbung, Ernennung durch die Ebene darüber über die Gremien aus Schritt 12 (NPC-Fallback). Voraussetzungen: Dienstzeit, Bildung (Rechtswissenschaft für die oberen Stufen), Ansehen. Besoldung nach Stufe. Nebenamt mit Kraftkosten wie die Politik.
- **Befugnisse** (Folter-Ersatz): Ordnungsamt Gewerbekontrolle und Hinweise (kleiner Spurenbonus), Polizei Spuren sichern (verkürzt die Ermittlungsfrist), Kommissariat Zeugenvernehmung, Observation, Durchsuchung **nur mit Richtervorbehalt**, Staatsanwaltschaft Anklage von Amts wegen bei Offizialdelikten und Einstellung gegen Auflage, Richter Prozessleitung und Strafzumessung. Rechtswidrige Ermittlung ergibt Verwertungsverbot (Beweis fällt), Amtsverlust und Skandal.
- **Richterrolle**: Das bestehende Urteil (`decide`, fester Würfel) bleibt die Grundlage. Richter und Schöffen verschieben Schuldwahrscheinlichkeit höchstens um ±8 Punkte und die Sanktionsstufe um höchstens eine Stufe im Strafrahmen. Befangenheit (Freundschaft, gleicher Verein, gleiche IP, Beteiligter) schließt aus. **Frist**: Entscheidet niemand in `hearingHours`, ergeht das Standardurteil (kein Stillstand). Aufgehobene Urteile kosten Amtsansehen. Bestechung eines Spieler-Richters ist Vorteilsannahme (Spur, Verfahren).
- **Neue Sanktionen**: Bewährung (Haft zur Bewährung mit Auflagen) und gemeinnützige Arbeit statt Geldstrafe (Gemeinwohl, Ansehen).
- **Gerichtsgebäude und Gerichtssaal** (Darstellung siehe Abschnitt 5); öffentliche Verhandlung mit Datenschutzregel (Namen nur bei sichtbarem Profil).

**Abhängigkeiten.** Schritt 12 (Ernennung, Befangenheit, Gremien). Baut auf `court.js`, `court-policy.js`, `reputation.confidence`.

**Risiken.** Spielerfairness (Macht über andere Spieler: deshalb enge Modulation, Befangenheit, Frist, Berufung, NPC-Fallback); Datenschutz; Komplexität von `src/lib/court.js` (787 Zeilen, Zustandsautomat; Erweiterung nur über klar definierte Haken); Absprachen im Freundeskreis; „genau einmal“ der Geldflüsse muss erhalten bleiben.

**Teststrategie.**
- Unit: Modulation und Deckel, Befangenheit, Fristfall, Verwertungsverbot, neue Sanktionen, Strafrahmen mit Landtagsbeschluss.
- DB (opt-in): Verfahren mit Spieler-Richter, Zeitablauf mit Standardurteil, Berufung, Bestechung des Richters, Anklage von Amts wegen, Zahlungen genau einmal.
- Fuzz: Urteil innerhalb der Grenzen, Haft ≤ 24 Stunden, Geld erhalten, Sperren laufen ab, Alltag und Politik nie gesperrt.
- Balance: Gerichtsvorgänge entstehen nur durch feindliche Handlungen; `econ-sim` bitgleich zum Stand davor.
- E2E: Bewerbung als Polizist, Verhandlung mit Rollen, Urteil; Design-Test für den Gerichtssaal (Hotspots, Viewports); i18n.

---

### Schritt 14 – Unterwelt und Sicherheit: Kriminalitätslage, Schutz, Aufträge

**Ziel.** Alltags- und Wirtschaftskriminalität werden als Risiko mit Gegenmaßnahmen erlebbar, aus Sicht von Opfer, Schutz und Ermittlung.

**Umfang.**
- **Kriminalitätslage je Stadt** (rein, deterministisch wie `seasons.js`): aus Stadtgröße, Löhnen und Preisniveau (`cityecon`), Epoche (Nachkriegszeit mit Schwarzmarkt und Plünderung, später ruhiger), Polizeibudget (`court-policy`), Polizeistreifen der Laufbahn (13), Jahreszeit (Winternächte). Anzeige als **Sicherheitsbarometer** wie das Preisbarometer.
- **Vorfälle als NPC-Ereignisse** gegen Spieler: Taschendiebstahl, Einbruch (ersetzt `burglary`), Ladendiebstahl (ersetzt `theft` im Betrieb), Fahrzeugdiebstahl (Ausstattung aus 10), Lagerdiebstahl (Modul aus 9), Betrug (Telefon- und Mailmaschen), **Cyberangriff** mit Datenverschlüsselung ab etwa 2005. Wahrscheinlichkeit = Lage × Schutz; Schaden gedeckelt. Schutz: Haustürschloss und Alarm, Tresor, Betriebsversicherung, Werkschutz (9), IT-Schutz mit Sicherung (neu, ab 2000). Neulingsschutz und Offline ohne Verluste.
- **Handelsrouten**: Lagebild je Strecke, **Begleitschutz** als Option (Kostenanteil der Fracht), Vorfall meldet sich im Tagesblatt und bleibt weiter als `trace` `theft` für das Gericht.
- **Täter** sind ausschließlich NPC. Spieler-Polizisten (13) können Fälle bearbeiten (kleine Belohnung in Ansehen und Dienstzeit); Anzeigen gegen unbekannt gehen an die Ermittlungsquote (Polizeibudget, Spuren), teilweise Rückgabe, Versicherung.
- **Aufträge** (Spionage, Abwerben, Preiskampf) an Detektei/Dienstleister statt Selbstausführung: Verzögerung, verwischte Spur, aber **Haftung des Auftraggebers** bei Aufdeckung (`commission`). Rivalität bleibt opt-in. Brandanschlag nur gemäß Entscheidung 1.
- **Nachbarschaftshilfe** als Vereinsart: senkt die Lage der Stadt leicht.

**Abhängigkeiten.** Schritt 9 (Schutzmodule, Betriebsversicherung), 13 (Polizei, Staatsanwaltschaft). Teilbar: Lage und Schutz können vor 13 ausgeliefert werden.

**Risiken.** Verherrlichung (Gegenmittel: nur Opfer- und Schutzsicht, abstrakte Beschreibung, keine Anleitungen); Frust bei Verlusten (Deckel, Versicherung, Autopilot-Vorschlag „Hausrat abschließen“, Anfängerschutz); Rechtstexte (Hinweis in den Nutzungsbedingungen, vgl. Abschnitt 2a der Bots); Opfer-Täter-Absprachen (es gibt keine Spieler-Täter außer der opt-in Rivalität mit den bekannten Schutzregeln); Altersfreigabe.

**Teststrategie.**
- Unit: Lagefunktion monoton und begrenzt, Wahrscheinlichkeiten, Schutzwirkung, Epochen (kein Cyberangriff vor 2000).
- Fuzz: Verlust ≤ Deckel, Versicherung ersetzt exakt, Geld erhalten, keine Ereignisse offline und im Neulingsschutz.
- DB (opt-in): Ereignis → Spur → Anzeige gegen unbekannt → Ermittlungsquote; Auftrag mit Haftung.
- Balance: `econ-sim --lage on|off`; erwartete Verluste ohne Schutz höchstens 1 bis 2 % des Vermögens je Jahr, mit Schutz unter 0,5 %; Schutzkosten höchstens das 1,2-fache des Erwartungsverlusts; alle Archetypen ±10 %.
- E2E: Ereignis sehen, Schutz kaufen, Lage fällt; i18n; UI-Static.

---

### Schritt 15 – Lebendige Stadt, Figuren und Stadtchronik

**Ziel.** Das Gilde-Gefühl: Die Ergebnisse der Schritte 9 bis 14 und der bestehenden Systeme sind in der Stadt sichtbar; Figuren folgen Klicks; die Stadt führt eine Chronik.

**Umfang.**
- **Zustandsfeed** `/api/city/live` (keine neuen Spielregeln): eigene Fahrten (Lkw, Bahn, Schiff aus `trade`), Vorfälle der letzten Spielstunden (Brand, Einbruch, Anschlag, Festnahme), laufende Verhandlungen und Wahlen. Aktualisierung über den bestehenden SSE-Kanal (`live.js`).
- **V2-3D-Stadt**: Spielerfigur, Partner, Kinder und Mitarbeiter als instanziierte Figuren; Klick auf Boden oder Gebäude schickt die Figur auf dem Straßenraster (`aerial.roads`) zum Ziel und öffnet dort den Innenraum; Fahrzeuge der eigenen Routen am Bahnhof und auf der Straße (Fortschritt wie in der Karte), Feuer mit Rauch und Löschzug, Polizeiauto und Absperrband, Baugerüste bei Ausbau.
- **Classic**: Luftbild (`aerial.js`) mit Ereignismarkern und Ereignisleiste, gleiche Daten, keine 3D-Pflicht.
- **Innenansichten**: Wohnhaus mit Wand für Ehrungen und Familienbilder (Hotspots Familie, Chronik, Geschenke, Titel), Betrieb mit Arbeitsanimation und Stimmungssymbolen (Daten aus 9), Rathaus (12), Gericht (13), Wache (14).
- **Stadtchronik** (Zeitung → Chronik): Hochzeiten, Geburten, Todesfälle, Urteile, Fehden (Konfliktkonto aus `rivalry_log`, Täter nur wenn bekannt), freie Ämter und Bewerbungsfristen, Gründungen und Insolvenzen, Titel. Neue Arten in `world_events` (`marriage`, `death`, `feud`, `vacancy`), Filter, Datenschutz über `social_public`. Persönliches Tagebuch: Filteransicht der bestehenden `chronicle`.

**Abhängigkeiten.** Alle früheren Schritte (liefert nur Darstellung). Einzelne Teile (Figuren, Fahrzeuge der eigenen Routen) können früher liegen.

**Risiken.** Performance und Draw-Calls in der 3D-Stadt (Budget bleibt im Test); Barrierefreiheit (Tastatur-Alternative zu Klick-Bewegung, Textfeed, reduzierte Bewegung); mobile Geräte; Datenschutz in der Chronik; Aufbewahrungsfristen (`maintenance.js`, 60 Tage Weltereignisse).

**Teststrategie.**
- Unit: Pfadsuche auf dem Raster, Feed-Aggregation, Chronikfilter, Datenschutzfilter.
- Design-Tests (`test/e2e/design-*.test.js`): Draw-Call-Budget, Klick → Figur → Innenraum, reduzierte Bewegung, vier Viewports.
- E2E: Chronik zeigt Hochzeit, Urteil und Vakanz eines Testlaufs; i18n.
- Balance: nicht betroffen.

---

## 7. Empfohlene Reihenfolge

```
9 Betrieb 2.0 ──┐
10 Charakterblatt ─┼─> 11 Werben/Ehe/Familienunternehmen
                 │
12 Ämter/Rathaus/Wahlen ─> 13 Sicherheit und Recht ─┐
                                9 ──────────────────┼─> 14 Unterwelt und Sicherheit ─> 15 Lebendige Stadt und Chronik
```

1. **9** und **10** zuerst (unabhängig, parallel möglich): sie vertiefen die täglich genutzten Bereiche Betrieb und Person und liefern Schutzmodule, Ausstattung und Rang als Bausteine.
2. **11** danach (nutzt Rang, Eheringe, Erbstücke aus 10).
3. **12** kann parallel zu 11 laufen; **13** erst danach (Ernennung braucht die Gremien).
4. **14** nach 9 und 13; eine erste Auslieferung nur mit Lage und Schutz ist vor 13 möglich.
5. **15** zuletzt als gemeinsame Darstellungsschicht; Figuren und Fahrzeuge der eigenen Routen dürfen früher kommen, wenn die 3D-Stadt schnell Wirkung zeigen soll.

Gründe: Reihenfolge von klein nach groß (Betrieb, Person, Familie, dann Politik und Justiz, zuletzt Unterwelt), geringste Gefahr für die Balance zuerst, die größten Eingriffe (12, 13) erst, wenn Admin-, Bot- und Testmuster mehrfach erprobt sind.

---

## 8. Offene Entscheidungen

| Nr. | Frage | Empfehlung |
|---|---|---|
| 1 | **Wie stark ins Moderne?** Streng realistisch (Behörden, Strafrecht, Cyberangriff; Brandanschlag nur als seltene Sabotage-Variante mit höchster Strafstufe) oder näher an der Gilde (Aufträge an „die Unterwelt“, mehr Gewalt-Andeutung)? | Streng realistisch. Entführung und Waffen entfallen, Brandanschlag als abstrakte Sabotage-Variante nur im opt-in Wettbewerb. |
| 2 | **Wahlmodell**: Bürgerwahl bleibt für die sechs politischen Ämter, Gremienwahl nur für die neue Laufbahn (und optional den Kanzler durch den Bundestag), oder gilt die Gilde-Regel „gewählt von Amtsinhabern“ überall? | Bürgerwahl bleibt Standard; Gremienwahl für Laufbahn; `kanzlerMode` per Admin-Schalter, Standard `citizens`, damit der Kanzler immer erreichbar bleibt. |
| 3 | **Macht von Spielern in der Justiz**: Echte, eng begrenzte Entscheidungsgewalt (Richter, Polizei) oder nur beratend (NPC entscheidet, Spieler-Schöffen geben Empfehlung)? | Begrenzte Gewalt (±8 Punkte, eine Stufe) mit Befangenheitsregeln, Frist und NPC-Fallback. |
| 4 | **Übergabe zu Lebzeiten** an das Kind (Ruhestand ab 60) zusätzlich zur Erbfolge beim Tod? | Optional in Schritt 11, nur für volljährige Erben und ohne Duplizierung von Besitz oder Erfahrung. |
| 5 | **Reihenfolge der Sichtbarkeit**: Figuren und Fahrzeuge der 3D-Stadt früher ziehen (Schritt 15 aufteilen) oder wie geplant zuletzt? | Wie geplant zuletzt; nur Fahrzeuge der eigenen Routen früher, wenn gewünscht. |

## 9. Nicht-Ziele

Entführung und Lösegeld, Waffen und Kampf, Folter, Diebstahl oder Überfall zwischen Spielern, Fantasy-Elemente, fremde Länder (Deutschland bleibt der einzige Ortskatalog, siehe DESIGN-V2), Geld für Werte mit Coins, Sperren von Ämtern durch Titel oder Rang.
