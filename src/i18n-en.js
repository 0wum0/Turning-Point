'use strict';
/**
 * Englische Oberfläche: exakte Textzuordnung (deutscher Text → Englisch) und Muster mit Zahlen.
 * Wird serverseitig als /i18n/en.js ausgeliefert; ein kleiner Übersetzer im Browser tauscht die Texte aus.
 * Nicht enthalten (bleiben deutsch): Zeitungsartikel, Ereignistexte, Berufs-/Städtenamen, Admin-Bereich.
 */
const EXACT = {
  // Navigation / HUD
  'Übersicht': 'Overview', 'Zeitung': 'Newspaper', 'Web': 'Web', 'Karte': 'Map', 'Stadt': 'City', 'Arbeit': 'Work', 'Unternehmen': 'Business', 'Gesellschaft': 'Society',
  'Spieler': 'Players', 'Wohnen': 'Housing', 'Haushalt': 'Household', 'Familie': 'Family', 'Vermächtnis': 'Legacy', 'Shop': 'Shop', 'Hauptmenü': 'Main menu',
  'Kühlschrank': 'Fridge', 'Wohlbefinden': 'Wellbeing', 'Erholung': 'Rest', 'Gesundheit': 'Health', 'Animationen an/aus': 'Animations on/off', 'Ton an/aus': 'Sound on/off',
  'Farbschema wechseln': 'Switch color scheme', 'Abmelden': 'Log out', 'Musik & Töne': 'Music & sounds', 'Schließen': 'Close', 'Mitspieler': 'Fellow players', 'Rangliste': 'Leaderboard',
  'Stadtplatz-Chat': 'City square chat', 'Stadtplatz': 'City square', 'Freunde': 'Friends', 'Postfach': 'Inbox', 'Mein Profil': 'My profile', 'Briefe': 'Letters', 'Beziehung': 'Relationship',
  'Zurück': 'Back', 'Weiter': 'Next', 'Speichern': 'Save', 'Abbrechen': 'Cancel', 'Bestätigen': 'Confirm', 'Verstanden': 'Got it', 'Neu laden': 'Reload', 'Löschen': 'Delete',
  'Annehmen': 'Accept', 'Ablehnen': 'Decline', 'Alle': 'All', 'Meine Stadt': 'My city', 'Ja': 'Yes', 'Nein': 'No', 'Melden': 'Report', 'Blockieren': 'Block', 'Profil': 'Profile',
  'Turning Point lädt …': 'Turning Point is loading …', 'Turning Point benötigt JavaScript.': 'Turning Point requires JavaScript.', 'Keine Verbindung zum Server.': 'No connection to the server.',
  'Bitte anmelden.': 'Please log in.', 'Was ist das?': 'What is this?', 'Was ist passiert?': 'What happened?', 'Warum ist das wichtig?': 'Why does it matter?', 'Was kann ich tun?': 'What can I do?',
  'Januar': 'January', 'Februar': 'February', 'März': 'March', 'Mai': 'May', 'Juni': 'June', 'Juli': 'July', 'Oktober': 'October', 'Dezember': 'December',
  // Landing / Auth / Seite
  'Anmelden': 'Log in', 'Registrieren': 'Sign up', 'Kostenlos spielen': 'Play for free', 'Weiterspielen': 'Continue playing', 'Willkommen zurück': 'Welcome back', 'Dein Lebenswerk wartet.': 'Your life’s work awaits.',
  'E-Mail oder Benutzername': 'Email or username', 'Passwort': 'Password', 'Passwort vergessen?': 'Forgot password?', 'Neu hier?': 'New here?', 'Passwort zurücksetzen': 'Reset password',
  'Wir senden dir einen Link per E-Mail.': 'We will email you a link.', 'E-Mail': 'Email', 'Link senden': 'Send link', 'Zurück zur Anmeldung': 'Back to login', 'Passwort vergessen': 'Forgot password',
  'Dein Leben beginnt hier': 'Your life begins here', 'Kostenlos. Keine Zahlungsart nötig.': 'Free. No payment method needed.', 'Spielername': 'Player name', '3–24 Zeichen, Buchstaben, Zahlen, _ . -': '3–24 characters: letters, numbers, _ . -',
  'Mindestens 8 Zeichen.': 'At least 8 characters.', 'Ich bin mindestens 16 Jahre alt und akzeptiere die': 'I am at least 16 years old and accept the', 'Nutzungsbedingungen': 'Terms of Use', 'sowie die': 'and the',
  'Datenschutzerklärung': 'Privacy Policy', 'Konto erstellen': 'Create account', 'Schon dabei?': 'Already playing?', 'Neues Passwort': 'New password', 'Zur Startseite': 'Back to home page',
  'Impressum': 'Legal notice', 'Datenschutz': 'Privacy', 'AGB': 'Terms', 'Widerruf': 'Withdrawal', 'Nutzungsbedingungen (AGB)': 'Terms of Use', 'Widerrufsbelehrung': 'Right of withdrawal', 'Admin': 'Admin',
  'Admin-Ansicht: du spielst als': 'Admin view: you are playing as', 'Zurück zum Admin': 'Back to admin', 'Spiel': 'Game',
  'Bitte bestätige Alter (16+), Nutzungsbedingungen und Datenschutzerklärung.': 'Please confirm your age (16+), the Terms of Use and the Privacy Policy.',
  'Bitte eine gültige E-Mail-Adresse angeben.': 'Please enter a valid email address.', 'Das Passwort braucht mindestens 8 Zeichen.': 'The password needs at least 8 characters.',
  'Der Spielername muss 3–24 Zeichen lang sein (Buchstaben, Zahlen, _ . -).': 'The player name must be 3–24 characters (letters, numbers, _ . -).',
  'Diese E-Mail oder dieser Name ist bereits vergeben.': 'This email or name is already taken.', 'Registrierung abgelehnt.': 'Registration rejected.',
  // Charakter-Erstellung / Screens
  'Wer bist du?': 'Who are you?', 'Geschlecht': 'Gender', 'Vorname': 'First name', 'Nachname': 'Last name', 'Deine Heimatstadt': 'Your home city', 'Dein erlernter Beruf': 'Your trained profession', 'Deine Herkunft': 'Your background',
  'Bereit?': 'Ready?', 'Neues Leben': 'New life', 'Generationenwechsel': 'Generation change', 'Nachlass': 'Estate', 'Gesamter Nachlass': 'Total estate', 'Anzahl Kinder (Pflichtanteil)': 'Number of children (compulsory share)',
  'Anteil je Kind': 'Share per child', 'Zeitraum': 'Period', 'Alter': 'Age', 'Generation': 'Generation', 'Dein Meta-Fortschritt bleibt:': 'Your meta progress stays:', 'Wer du bist': 'Who you are', 'Heimatstadt': 'Home city',
  'Beruf': 'Profession', 'Herkunft': 'Background', 'Los geht’s': 'Let’s go', 'Leben beginnen': 'Begin life', 'Ein volljähriges Kind wird zum neuen Spielcharakter.': 'An adult child becomes your new character.', 'Game Over': 'Game over',
  'Das Leben ist zu Ende.': 'This life has ended.', 'Dieses Leben ist beendet.': 'This life has ended.', 'Dein Charakter ist gestorben.': 'Your character has died.', 'Das Leben ruft dich': 'Life is calling', 'Zeit vergeht': 'Time passes',
  'Das Spiel konnte nicht geladen werden': 'The game could not be loaded', 'Belohnung abholen': 'Claim reward', 'Seit deinem letzten Besuch sind': 'Since your last visit',
  // Übersicht / Finanzen
  'Finanzen': 'Finances', 'Beruf & Zuhause': 'Job & home', 'Beruf &amp; Zuhause': 'Job & home', 'EFS – deine Zeit': 'EFS – your time', 'Vermögen gesamt:': 'Total wealth:', 'Einnahmen / Tag': 'Income / day', 'Ausgaben / Tag': 'Expenses / day',
  'Essen / Tag (~)': 'Food / day (~)', 'Bilanz / Tag': 'Balance / day', 'Kein Beruf – in der Zeitung nach Arbeit suchen.': 'No job – look for work in the newspaper.', 'Zur Zeitung': 'To the newspaper', 'Werbung ansehen': 'Watch an ad',
  'Alle gelesen': 'Mark all read', 'Keine Meldungen.': 'No messages.', 'Ansehen': 'View', 'Auszubildender': 'Apprentice', 'Student': 'Student', 'Kein Dach – Gesundheit sinkt täglich': 'No roof – health drops daily', 'Keine Miete': 'No rent',
  'Gesamtvermögen': 'Total wealth', 'Weg ins 22. Jahrhundert': 'Road to the 22nd century', 'Familienstammbaum': 'Family tree', 'Chronik': 'Chronicle', 'Noch keine früheren Leben.': 'No earlier lives yet.',
  'Der Stammbaum deiner Familie – ein historisches Archiv über alle Generationen.': 'Your family tree – a historical archive across all generations.',
  // Arbeit
  'Beruf & Bildung': 'Career & education', 'Beruf &amp; Bildung': 'Career & education', 'Ausbildung': 'Apprenticeship', 'Studium': 'Studies', 'Dauer': 'Duration', 'Lohn / Tag': 'Wage / day', 'Studium beginnen': 'Start studies', 'Hilfsarbeiter': 'Laborer',
  'Immer möglich, niedriger Lohn': 'Always possible, low wage', 'Nächste Stufe:': 'Next level:', 'Schlafplatz': 'Place to sleep', 'Wirklich kündigen?': 'Really quit?', 'Studium beginnen?': 'Start studies?',
  'Du hast keine Tätigkeit. Stellen und Lehrstellen stehen in der Zeitung.': 'You have no occupation. Jobs and apprenticeships are in the newspaper.',
  'Qualifikation bestimmt, welche Unternehmen du später führen darfst.': 'Your qualification determines which businesses you may run later.',
  // Wohnen / Haushalt
  'Wohnen & Immobilien': 'Housing & property', 'Wohnen &amp; Immobilien': 'Housing & property', 'Haushalt & Gesundheit': 'Household & health', 'Haushalt &amp; Gesundheit': 'Household & health',
  'Dein Zuhause entscheidet über Erholung, Gesundheit und Familienglück.': 'Your home determines rest, health and family happiness.', 'Aktuell': 'Current', 'Kosten / Tag': 'Costs / day', 'Zimmer': 'Rooms',
  'Dein Besitz': 'Your property', 'Einziehen': 'Move in', 'Straße': 'Street', 'Arbeitgeber': 'Employer', 'Pension': 'Boarding house', 'Miete': 'Rent', 'Eigentum': 'Ownership', 'Immobilie verkaufen?': 'Sell property?', 'Immobilie kaufen?': 'Buy property?',
  'Essen, Versicherungen und Vorsorge – unabhängig davon, wo du wohnst.': 'Food, insurance and health care – wherever you live.', 'Der Kühlschrank ist voll.': 'The fridge is full.', 'Einstellen': 'Hire', 'Entlassen': 'Dismiss',
  'Einbruch': 'Burglary', 'Feuer': 'Fire', 'Arztkosten': 'Medical costs', 'Kündigen': 'Cancel', 'Abschließen': 'Sign up', ' / Tag': ' / day',
  // Unternehmen
  'Aktueller Wert': 'Current value', 'Verkaufen': 'Sell', 'Räume': 'Rooms', 'Umsatz / Tag': 'Revenue / day', 'Löhne + Unterhalt': 'Wages + upkeep', 'Gewinn / Tag': 'Profit / day', 'Firmenkasse': 'Company cash', 'Wert': 'Value',
  '+ Mitarbeiter': '+ employee', '− Mitarbeiter': '− employee', 'Firmenkassen': 'Company cash boxes', 'Alles abholen': 'Collect all', 'Manager einstellen': 'Hire manager', 'Manager entlassen': 'Dismiss manager', 'Anfänger': 'Beginner',
  'Geselle': 'Journeyman', 'Fachkraft': 'Skilled worker', 'Meister': 'Master', 'Altmeister': 'Grand master', 'Betrieb verkaufen?': 'Sell business?', 'Betrieb kaufen?': 'Buy business?', 'Wiederbeleben': 'Revive',
  'Vom Wirtshaus zum Hotel: Qualifikation, Räume, Mitarbeiter, Manager.': 'From inn to hotel: qualification, rooms, staff, managers.',
  // Familie
  'Partner, Kinder und die Zukunft deines Vermächtnisses.': 'Partner, children and the future of your legacy.', 'Wunsch-Kinderzahl': 'Desired number of children', 'Kontakte ansehen': 'View contacts', 'zu Hause': 'at home',
  'Hauptschule': 'Secondary school', 'Realschule': 'Intermediate school', 'Gymnasium': 'Grammar school', 'Wie geht es weiter?': 'What next?', 'Nichts': 'Nothing', 'Jugendhilfe': 'Youth welfare',
  // Gesellschaft
  'Ämter, Einfluss – und ein bisschen Glück.': 'Offices, influence – and a bit of luck.', 'Kandidieren': 'Run for office', 'Zurücktreten': 'Resign', 'Lotto': 'Lottery', '1 Tipp': '1 ticket', '5 Tipps': '5 tickets', '20 Tipps': '20 tickets',
  // Karte
  'Deutschland': 'Germany', 'Wähle eine Stadt. Goldene Funken sind EFS zum Einsammeln.': 'Choose a city. Golden sparks are EFS to collect.', 'Eigener Besitz': 'Own property', 'Entfernung': 'Distance', 'Umzugskosten': 'Moving costs', 'Umziehen': 'Move',
  'teuer': 'expensive', 'günstig': 'cheap', 'Hier wohnst du.': 'You live here.', 'Wähle eine Stadt auf der Karte.': 'Select a city on the map.',
  // Zeitung
  'Die Zeitung': 'The Newspaper', 'Das Netz': 'The Web', 'Ratgeber': 'Guide', 'Lokales': 'Local', 'Stelle': 'Job', 'Lehrstelle': 'Apprenticeship', 'Kauf': 'Buy', 'Treffen': 'Meet', 'Mietwohnungen': 'Apartments for rent', 'Zu verkaufen': 'For sale',
  'Pensionen & Zimmer': 'Boarding houses & rooms', 'Pensionen &amp; Zimmer': 'Boarding houses & rooms', 'alle ansehen': 'view all', 'Qualifikation fehlt': 'Qualification missing', 'Jobs, Immobilien, Kontakte und Nachrichten – seit 2002 online.': 'Jobs, property, contacts and news – online since 2002.',
  'Stellen, Wohnungen, Kontakte und Neuigkeiten aus deiner Stadt.': 'Jobs, homes, contacts and news from your city.', 'Der Ratgeber ist ausgeblendet.': 'The guide is hidden.',
  // Shop
  'Coins & EFS': 'Coins & EFS', 'Coins &amp; EFS': 'Coins & EFS', 'Coins': 'Coins', 'EFS-Vorrat': 'EFS reserve', 'Pakete': 'Packages', 'Kaufen': 'Buy', 'Dauerkarte abschließen': 'Get the season pass', 'Testmodus': 'Test mode',
  'Zahlungen noch nicht aktiv': 'Payments not active yet', 'Komplett kostenlos spielbar – alles hier ist freiwillig.': 'Completely free to play – everything here is optional.', 'Coins bleiben dir nach jedem Leben erhalten.': 'Coins are kept after every life.',
  'Ein kurzes Video. Keine Pflicht, kein Zwang.': 'A short video. No obligation.', 'Zusätzliche Zeit durch ein Video.': 'Extra time through a video.',
  // Spieler
  'Messe dich mit anderen, triff Menschen, handle und plaudere – die Welt ist nicht allein deine.': 'Compete with others, meet people, trade and chat – the world isn’t yours alone.',
  'Nachkriegszeit': 'Post-war era', 'Wirtschaftswunder': 'Economic miracle', 'Wendezeit': 'Reunification era', 'Euro & Internet': 'Euro & internet', 'Euro &amp; Internet': 'Euro & internet', 'Zukunft': 'Future', 'Wartung': 'Maintenance',
  'Alles vorspulen': 'Fast-forward all', 'Während du weg warst …': 'While you were away …', 'Krankheit': 'Illness',
  'Vermögen': 'Wealth', 'Kinder': 'Children', 'Betriebe': 'Businesses', 'Immobilien': 'Properties', 'Einfluss': 'Influence', 'Platz Vermögen': 'Wealth rank', 'Betreff': 'Subject', 'Text': 'Text', 'Betrieb': 'Business', 'Rolle': 'Role', 'Mitarbeiter': 'Employee',
  'Betriebsleitung': 'Management', 'Stellen': 'Jobs', 'Beschreibung': 'Description', 'Bewerben': 'Apply', 'Meine Bewerbungen': 'My applications', 'Dein Platz': 'Your rank', 'Posteingang': 'Inbox', 'Gesendet': 'Sent', 'Unternehmer': 'Entrepreneurs',
  'Politik': 'Politics', 'Dynastie': 'Dynasty', 'Zeitreise': 'Time travel', 'Paar': 'Couple', 'Verlobt': 'Engaged', 'Verheiratet': 'Married', 'Antrag machen': 'Propose', 'Beenden': 'End', 'Scheidung einreichen': 'File for divorce',
  'Beziehung beenden': 'End relationship', 'Anfrage senden': 'Send request', 'Anfrage annehmen': 'Accept request', 'Anfrage gesendet': 'Request sent', 'Freundschaft beenden': 'End friendship', 'blockiert': 'blocked', 'Tageslohn': 'Daily wage',
  'Dieses Profil ist privat.': 'This profile is private.', 'Ihr seid jetzt Freunde!': 'You are friends now!', 'Anfrage gesendet.': 'Request sent.', 'Freundschaft beendet.': 'Friendship ended.', 'Brief verschickt.': 'Letter sent.',
  'Danke, die Meldung ist angekommen.': 'Thanks, your report was received.', 'Ihr seid verheiratet! 💍': 'You are married! 💍', 'Antrag abgelehnt.': 'Proposal declined.', 'Die Beziehung ist beendet.': 'The relationship has ended.',
  'Profil gespeichert.': 'Profile saved.', 'Einladung verschickt.': 'Invitation sent.', 'Bewerbung verschickt.': 'Application sent.', 'Stelle geschlossen.': 'Job closed.', 'Keine Briefe.': 'No letters.',
  'Niemand gefunden.': 'Nobody found.', 'Niemand sonst online.': 'Nobody else online.', 'Noch niemand hier – sei der Erste!': 'Nobody here yet – be the first!', 'Noch ist es still auf dem Platz. Sag Hallo!': 'It is quiet on the square. Say hello!',
  'Mindestens 2 Buchstaben.': 'At least 2 letters.', 'Noch keine Platzierung.': 'No ranking yet.', 'Starte ein Leben, um in der Rangliste zu erscheinen.': 'Start a life to appear on the leaderboard.',
  'Hier sprichst du mit den anderen Spielern deiner Stadt – so wie auf dem Marktplatz.': 'Here you talk to the other players in your city – like at the market square.',
  'Die Rangliste vergleicht inflationsbereinigt: 1 DM von 1945 ist die Maßeinheit – so konkurrieren Spieler aus allen Epochen fair.': 'The leaderboard compares inflation-adjusted: 1945 Deutschmark is the unit – so players from all eras compete fairly.',
  'Über mich (max. 240 Zeichen)': 'About me (max. 240 characters)', 'Öffentlich sichtbar (Rangliste, Profil, Stadtplatz, Zeitungsmeldungen)': 'Publicly visible (leaderboard, profile, city square, news)',
  'Privat heißt: Du erscheinst nirgends – andere können dir aber weiterhin Briefe schreiben.': 'Private means: you appear nowhere – but others can still write you letters.',
  'Noch keine Freunde. Suche rechts nach Spielern oder klicke in der Rangliste auf einen Namen.': 'No friends yet. Search for players on the right or click a name in the leaderboard.',
  'Gerade sind keine anderen Singles in deiner Stadt sichtbar.': 'No other singles are visible in your city right now.', 'Deine offenen Anfragen': 'Your open requests',
};
// Muster mit Zahlen/Namen: [Regex-Quelle, Ersatz mit $1…]
const PATTERNS = [
  ['^1 Tag$', '1 day'], ['^1 Jahr$', '1 year'], ['^(\\d+) Jahre?$', '$1 years'], ['^(\\d+) J\\. (\\d+) Mon\\.$', '$1 y. $2 mo.'],
  ['^Platz (\\d+) von (\\d+) · Vermögen$', 'Rank $1 of $2 · Wealth'], ['^Platz (\\d+) von (\\d+) · (.+)$', 'Rank $1 of $2 · $3'], ['^auffüllen · ≈ (.+) / Tag$', 'refill · ≈ $1 / day'], ['^(\\d+) Spieler online in (.+)$', '$1 players online in $2'], ['^(\\d+) neue[r]? Briefe?$', '$1 new letter(s)'],
  ['^Zyklus (\\d+)$', 'Cycle $1'], ['^Höchststand Konto (.+)$', 'Peak balance $1'], ['^(\\d+) Freundschaftsanfragen?$', '$1 friend request(s)'], ['^(\\d+) Felder$', '$1 fields'],
  ['^(\\d+) Spieler$', '$1 players'], ['^(\\d+) Tage$', '$1 days'], ['^(\\d+) Mon\\.$', '$1 mo.'], ['^(\\d+) Briefe?$', '$1 letters'],
  ['^(\\d+) Freundschaftsanfragen?$', '$1 friend request(s)'], ['^Seite (\\d+) von (\\d+)$', 'Page $1 of $2'], ['^Willkommen, (.+)$', 'Welcome, $1'],
];
module.exports = { EXACT, PATTERNS };
