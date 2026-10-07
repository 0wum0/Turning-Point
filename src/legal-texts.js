'use strict';
/**
 * Vorlagen für die rechtlichen Texte. Sie gelten, solange im Admin (Einstellungen → Rechtliches) nichts eigenes gespeichert ist.
 * WICHTIG: Das sind Muster, keine Rechtsberatung – bitte vor dem öffentlichen Start prüfen lassen.
 */
const BETREIBER = 'Florian Engelhardt';
const ANSCHRIFT = 'Deiweg 12a\n38259 Salzgitter';
const EMAIL = 'florian0engelhardt@gmail.com';
const STAND = 'Oktober 2026';

const impressum = `Angaben gemäß § 5 DDG

${BETREIBER}
${ANSCHRIFT}
Deutschland

Kontakt
E-Mail: ${EMAIL}

Unternehmensform
Einzelunternehmen (Kleingewerbe)
Steuernummer / Wirtschafts-Identifikationsnummer: wird nachgetragen, sobald sie vorliegt

Umsatzsteuer
Es wird keine Umsatzsteuer ausgewiesen (Kleinunternehmer gemäß § 19 UStG).

Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
${BETREIBER}, Anschrift wie oben.

Streitbeilegung
Wir sind weder verpflichtet noch bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.

Haftung für Inhalte
Als Diensteanbieter sind wir für eigene Inhalte nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen (zum Beispiel Chat-Nachrichten, Briefe und Profiltexte von Spielern) zu überwachen. Bei Kenntnis von Rechtsverletzungen entfernen wir entsprechende Inhalte umgehend. Hinweise bitte per E-Mail an die oben genannte Adresse.

Haftung für Links
Soweit dieses Angebot auf externe Seiten verweist, haben wir auf deren Inhalte keinen Einfluss und übernehmen dafür keine Gewähr. Verantwortlich ist stets der jeweilige Anbieter.

Urheberrecht
Die Inhalte und das Spielkonzept unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung und Verbreitung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des Betreibers. Schriften: Inter und Fraunces (SIL Open Font License 1.1), Icons: Lucide (ISC-Lizenz).

Hinweis zum Spiel
TURNING POINT ist ein fiktives Simulationsspiel. Alle Personen, Betriebe und Ereignisse im Spiel sind frei erfunden bzw. von Spielern erschaffen. Das Spielgeld hat keinen realen Wert.`;

const datenschutz = `Datenschutzerklärung
Stand: ${STAND}

1. Verantwortlicher
${BETREIBER}, ${ANSCHRIFT.replace('\n', ', ')}, E-Mail: ${EMAIL}

2. Worum es geht
TURNING POINT ist ein Browserspiel. Diese Erklärung zeigt, welche personenbezogenen Daten wir beim Besuch der Seite und beim Spielen verarbeiten, wozu und auf welcher Rechtsgrundlage.

3. Hosting und Server-Protokolle
Das Spiel läuft bei Hostinger (Hostinger International Ltd.; Angaben zum Anbieter: hostinger.com). Mit dem Anbieter besteht ein Vertrag zur Auftragsverarbeitung. Beim Aufruf der Seiten verarbeitet der Server technisch notwendige Daten (IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Browser-Angaben). Fehlerprotokolle werden zeitlich begrenzt aufbewahrt. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (sicherer und stabiler Betrieb).

4. Konto und Spielstand
Bei der Registrierung speichern wir Spielername, E-Mail-Adresse und ein verschlüsselt gespeichertes Passwort (bcrypt, kein Klartext). Beim Spielen entstehen Spielstände (Charaktere, Besitz, Familie, Fortschritt), Spieleinstellungen und Protokolle über wichtige Aktionen (z. B. Anmeldungen). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung des Spiels).

5. Cookies und lokale Speicherung
Wir setzen ein technisch notwendiges Sitzungs-Cookie (tp.sid), das dich angemeldet hält, sowie einen Sicherheits-Token gegen Fälschung von Anfragen. Im lokalen Speicher deines Browsers merkt sich das Spiel Einstellungen wie Farbschema, Animationen und gelesene Hinweise. Ein Service Worker speichert statische Dateien (Skripte, Bilder) zwischen, damit das Spiel schneller lädt. Diese Speicherungen sind für den Betrieb erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG); Tracking- oder Werbe-Cookies setzen wir nicht ein.

6. IP-Adressen und Schutz vor Betrug
Zum Schutz vor Missbrauch (Mehrfachkonten, automatisierte Zugriffe, Manipulation von Spielständen) speichern wir IP-Adressen angemeldeter Spieler zusammen mit dem Zeitpunkt des Zugriffs und werten Nutzungsmuster automatisiert aus. Daraus kann ein interner Risiko-Wert entstehen; über Sperren entscheidet bei Verdacht ein Mensch, sofern die automatische Sperre nicht ausdrücklich eingeschaltet ist. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (fairer Spielbetrieb, Schutz unserer Systeme und anderer Spieler). IP-Zuordnungen löschen wir, wenn sie nicht mehr erforderlich sind, spätestens mit Löschung des Kontos.

7. Gemeinschaftsfunktionen
Das Spiel enthält Funktionen, in denen andere Spieler Daten von dir sehen: Charaktername, Spielername, Stadt, Beruf, Betriebe, Platzierung in Ranglisten, ein von dir verfasster Profiltext, Chat-Nachrichten auf dem Stadtplatz, Freundeslisten, Geschenke, Besuche, Spielerjobs sowie Beziehung und Heirat zwischen Spielern. Briefe sind nur für Absender und Empfänger sichtbar; das Team liest einen Brief nur, wenn er gemeldet wurde. Unter „Spieler → Mein Profil“ kannst du dich jederzeit unsichtbar schalten; dann erscheinst du nicht in Rangliste, Profilen, Chat-Anwesenheit und Zeitungsmeldungen. Chat-Nachrichten werden regelmäßig gelöscht. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Mehrspieler-Funktionen als Vertragsinhalt) und lit. f (Moderation).

8. E-Mail
Für Bestätigungs- und Passwort-Zurücksetzen-E-Mails nutzen wir einen E-Mail-Dienst (SMTP des Postfachanbieters). Dabei wird deine E-Mail-Adresse an diesen Dienst übermittelt. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.

9. Zahlungen (nur wenn Käufe aktiviert sind)
Käufe von Spielwährung oder einer Dauerkarte wickelt ein Zahlungsdienstleister ab (z. B. Stripe Payments Europe Ltd., Irland). Zahlungsdaten gibst du direkt beim Anbieter ein und wir erhalten sie nicht; wir speichern lediglich Betrag, Zeitpunkt, gekauftes Paket und eine Referenznummer. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO; gesetzliche Aufbewahrungspflichten (§ 147 AO, § 257 HGB) nach Art. 6 Abs. 1 lit. c DSGVO.

10. Belohnungswerbung (nur wenn aktiviert)
Wenn du freiwillig eine Belohnungswerbung ansiehst, kann dabei ein Werbepartner Daten (z. B. IP-Adresse, Geräteangaben) verarbeiten. Dies geschieht nur auf deine Veranlassung und wird vor Einführung eines konkreten Anbieters hier ergänzt.

11. Speicherdauer
Kontodaten und Spielstände speichern wir, solange dein Konto besteht. Nach Löschung des Kontos entfernen wir deine Daten, soweit keine gesetzlichen Aufbewahrungspflichten bestehen (z. B. Zahlungsbelege bis zu zehn Jahre). Protokolle werden nach angemessener Zeit gelöscht.

12. Empfänger und Drittländer
Empfänger sind nur die genannten Dienstleister (Hosting, E-Mail, ggf. Zahlungsanbieter), soweit für die jeweilige Funktion nötig. Eine Übermittlung in Länder außerhalb der EU/des EWR findet nur statt, wenn der jeweilige Anbieter geeignete Garantien nach Art. 44 ff. DSGVO bietet.

13. Deine Rechte
Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO). Zur Ausübung genügt eine E-Mail an ${EMAIL}; auf Wunsch löschen wir dein Konto samt Spielständen.

14. Beschwerderecht
Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der zuständigen Landesbeauftragten für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover.

15. Mindestalter
Das Angebot richtet sich an Personen ab 16 Jahren. Wenn du jünger bist, registriere dich bitte nicht.

16. Pflicht zur Bereitstellung
Ohne Spielername, E-Mail-Adresse und Passwort kann kein Konto angelegt werden. Alle weiteren Angaben (Profiltext, Sichtbarkeit) sind freiwillig.

17. Änderungen
Wir passen diese Erklärung an, wenn sich das Spiel oder die Rechtslage ändert. Es gilt die jeweils hier veröffentlichte Fassung.`;

const agb = `Nutzungsbedingungen (AGB) für TURNING POINT
Stand: ${STAND}

1. Geltungsbereich und Anbieter
Diese Bedingungen gelten für die Nutzung des Browserspiels TURNING POINT. Anbieter ist ${BETREIBER}, ${ANSCHRIFT.replace('\n', ', ')}, E-Mail: ${EMAIL}.

2. Leistung
TURNING POINT ist ein kostenlos spielbares Simulationsspiel. Es besteht kein Anspruch auf eine bestimmte Spieldauer, einen bestimmten Funktionsumfang oder ständige Verfügbarkeit. Das Spiel kann weiterentwickelt, verändert, zeitweise abgeschaltet oder eingestellt werden; Spielbalance, Preise und Regeln dürfen angepasst werden.

3. Registrierung und Konto
Die Nutzung setzt ein Konto voraus. Du musst mindestens 16 Jahre alt sein und wahrheitsgemäße Angaben machen. Pro Person ist ein Konto vorgesehen. Halte deine Zugangsdaten geheim; für Handlungen unter deinem Konto bist du verantwortlich, sofern du den Missbrauch zu vertreten hast.

4. Spielgeld, EFS und Coins
Spielgeld (DM/€ im Spiel), EFS und Coins sind virtuelle Spielelemente ohne realen Wert. Sie können nicht gegen echtes Geld getauscht oder ausgezahlt werden und sind nicht außerhalb der im Spiel vorgesehenen Funktionen übertragbar. Mit Löschung oder Sperrung des Kontos verfallen sie. Ein Anspruch auf Erhalt bestimmter Spielstände besteht nicht.

5. Kostenpflichtige Angebote (sofern verfügbar)
Optional können Coins oder eine Dauerkarte gekauft werden. Es gelten die im Shop angezeigten Preise in Euro. ${'Als Kleinunternehmer nach § 19 UStG wird keine Umsatzsteuer ausgewiesen.'} Die Zahlung erfolgt über den im Bezahlvorgang genannten Zahlungsdienstleister. Dauerkarten laufen für den angegebenen Zeitraum und verlängern sich nur, wenn dies im Shop ausdrücklich so angegeben ist; sie sind jederzeit zum Ende der laufenden Laufzeit kündbar. Für Käufe gilt die Widerrufsbelehrung.

6. Verhaltensregeln
Nicht erlaubt sind: Beleidigungen, Hassrede, Bedrohungen, sexualisierte oder rechtswidrige Inhalte in Chat, Briefen, Profilen und Namen; Spam und Werbung; Täuschung anderer Spieler; das Ausnutzen von Fehlern; der Einsatz von Bots, Skripten oder anderen Hilfsmitteln, die den Spielablauf automatisieren oder manipulieren; mehrere Konten, um Vorteile zu erlangen (z. B. Geldübertragung zwischen eigenen Konten); Eingriffe in die technische Sicherheit des Spiels.

7. Moderation und Sperrung
Bei Verstößen können wir Inhalte entfernen, Funktionen einschränken (z. B. Stummschaltung), Spielstände zurücksetzen und Konten zeitweise oder dauerhaft sperren. Bei unberechtigtem Verdacht hilft eine formlose E-Mail an uns. Das Recht zur Kündigung aus wichtigem Grund bleibt unberührt.

8. Inhalte von Spielern
Du bleibst Urheber deiner Beiträge, räumst uns aber das einfache Recht ein, sie im Rahmen des Spiels anzuzeigen und zu speichern. Du versicherst, dass deine Beiträge keine Rechte Dritter verletzen. Hinweise auf rechtswidrige Inhalte erreichen uns über die Melde-Funktion im Spiel oder per E-Mail.

9. Haftung
Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper und Gesundheit sowie nach dem Produkthaftungsgesetz. Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den typischerweise vorhersehbaren Schaden begrenzt; im Übrigen ist sie bei leichter Fahrlässigkeit ausgeschlossen. Für den Verlust von Spielständen und Spielgeld durch technische Störungen haften wir im Rahmen dieser Regeln; wir empfehlen, dem Spiel keine Bedeutung über den Spielspaß hinaus beizumessen.

10. Kündigung und Löschung
Du kannst jederzeit aufhören zu spielen. Die Löschung deines Kontos kannst du per E-Mail an ${EMAIL} verlangen. Wir können das Nutzungsverhältnis mit angemessener Frist kündigen, aus wichtigem Grund fristlos.

11. Änderungen dieser Bedingungen
Wir können diese Bedingungen mit Wirkung für die Zukunft ändern, wenn dies sachlich geboten ist (z. B. neue Funktionen oder Rechtslage). Über wesentliche Änderungen informieren wir im Spiel oder per E-Mail; widersprichst du nicht innerhalb von vier Wochen und spielst weiter, gelten die neuen Bedingungen.

12. Schlussbestimmungen
Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts; gegenüber Verbrauchern gilt dies nur, soweit nicht zwingende Verbraucherschutzvorschriften des Staates entgegenstehen, in dem du deinen gewöhnlichen Aufenthalt hast. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Rest wirksam.`;

const widerruf = `Widerrufsbelehrung für Käufe im Spiel
Stand: ${STAND}

Diese Belehrung gilt nur für kostenpflichtige Käufe (z. B. Coins oder Dauerkarte) durch Verbraucher. Das kostenlose Spielen ist davon nicht betroffen.

Widerrufsrecht
Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.

Um dein Widerrufsrecht auszuüben, musst du uns (${BETREIBER}, ${ANSCHRIFT.replace('\n', ', ')}, E-Mail: ${EMAIL}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über deinen Entschluss, diesen Vertrag zu widerrufen, informieren. Du kannst dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absendest.

Folgen des Widerrufs
Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über deinen Widerruf bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du bei der ursprünglichen Transaktion eingesetzt hast; in keinem Fall werden dir wegen dieser Rückzahlung Entgelte berechnet. Bereits gutgeschriebene Coins und Vorteile werden bei einem Widerruf wieder entfernt.

Vorzeitiges Erlöschen des Widerrufsrechts bei digitalen Inhalten
Das Widerrufsrecht erlischt bei einem Vertrag über die Lieferung von nicht auf einem körperlichen Datenträger befindlichen digitalen Inhalten (z. B. Coins), wenn wir mit der Ausführung des Vertrags begonnen haben, nachdem du ausdrücklich zugestimmt hast, dass wir mit der Ausführung vor Ablauf der Widerrufsfrist beginnen, und du bestätigt hast, dass du dadurch dein Widerrufsrecht verlierst (§ 356 Abs. 5 BGB). Bei Dauerkarten (Dienstleistung) erlischt das Widerrufsrecht nach vollständiger Erbringung der Leistung, wenn du vorher ausdrücklich zugestimmt hast und bestätigt hast, dass du dein Widerrufsrecht bei vollständiger Vertragserfüllung verlierst (§ 356 Abs. 4 BGB); bei vorzeitigem Beginn ist bei einem Widerruf ein anteiliges Entgelt für die bis dahin erbrachte Leistung zu zahlen.

Muster-Widerrufsformular
(Wenn du den Vertrag widerrufen willst, fülle bitte dieses Formular aus und sende es zurück.)

An: ${BETREIBER}, ${ANSCHRIFT.replace('\n', ', ')}, E-Mail: ${EMAIL}
Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*) / die Erbringung der folgenden Dienstleistung (*):
Bestellt am (*) / erhalten am (*):
Name des/der Verbraucher(s):
Anschrift des/der Verbraucher(s):
Spielername im Spiel:
Datum:
(*) Unzutreffendes streichen.`;

module.exports = { impressum, datenschutz, agb, widerruf, BETREIBER, ANSCHRIFT, EMAIL };
