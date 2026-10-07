'use strict';
/** Zusätzliche englische Texte: Orte, Karte, Berufsgruppen, Rollen. */
const KINDS = { Dorf: ['village', 'a village'], Gemeinde: ['municipality', 'a municipality'], Kleinstadt: ['small town', 'a small town'], Stadt: ['city', 'a city'], Großstadt: ['large city', 'a large city'], Metropole: ['metropolis', 'a metropolis'] };
const exact = {
  'Vermieten': 'Let out', 'Vermietet': 'Let', 'Vermieten: ca.': 'Letting: approx.', 'Miete / Tag': 'Rent / day', 'Marktmiete': 'Market rent', 'Rendite / Jahr': 'Yield / year', 'Mietdauer': 'Tenancy', 'Bisher eingenommen': 'Earned so far',
  'der Marktmiete': 'of the market rent', 'Günstiger = schneller ein Mieter, teurer = mehr Ertrag, aber längerer Leerstand.': 'Cheaper = tenant sooner, pricier = more income but longer vacancy.',
  'Vermietung beenden': 'End letting', 'Mieter zahlt nicht': 'Tenant not paying', 'davon Mieteinnahmen': 'of which rental income', 'Immobilien kaufen': 'Buy property',
  'Angebote in': 'Offers in', 'Mietpreis:': 'Rent:',
  'Mein Konto': 'My account', 'Konto': 'Account', 'Profil': 'Profile', 'Hier verwaltest du deine Zugangsdaten und deine Daten – Auskunft, Export und Löschung nach DSGVO.': 'Manage your login details and your data here – access, export and deletion under the GDPR.',
  'Spielername': 'Player name', 'Registriert': 'Registered', 'Charaktere': 'Characters', 'nicht bestätigt': 'not confirmed', 'Zum Spiel': 'To the game',
  'Sichtbarkeit & Profiltext (Spieler → Mein Profil)': 'Visibility & profile text (Players → My profile)', 'Sichtbarkeit &amp; Profiltext (Spieler → Mein Profil)': 'Visibility & profile text (Players → My profile)',
  'Passwort ändern': 'Change password', 'Aktuelles Passwort': 'Current password', 'Neues Passwort': 'New password', 'Wiederholen': 'Repeat', 'Passwort speichern': 'Save password',
  'E-Mail-Adresse ändern': 'Change email address', 'Neue E-Mail': 'New email', 'E-Mail speichern': 'Save email',
  'Meine Daten (Auskunft & Export)': 'My data (access & export)', 'Meine Daten (Auskunft &amp; Export)': 'My data (access & export)',
  'Du erhältst alle zu deinem Konto gespeicherten Daten als JSON-Datei: Kontodaten, Charaktere und Spielstände, Rangliste, Freunde, Briefe, Chat-Beiträge, Beziehungen, Jobs, IP-Adressen, Käufe und Meldungen. Passwort-Hash und Sicherheits-Token sind nicht enthalten.': 'You receive all data stored for your account as a JSON file: account data, characters and game states, leaderboard, friends, letters, chat posts, relationships, jobs, IP addresses, purchases and reports. Password hash and security tokens are not included.',
  'Daten herunterladen (JSON)': 'Download data (JSON)', 'Konto löschen': 'Delete account', 'Ich möchte mein Konto löschen …': 'I want to delete my account …',
  'Das Konto wird endgültig gelöscht:': 'The account will be permanently deleted:', 'Passwort': 'Password', 'Tippe LÖSCHEN ein': 'Type DELETE', 'Konto endgültig löschen': 'Delete account permanently',
  'Dein Konto wurde gelöscht. Danke fürs Mitspielen!': 'Your account has been deleted. Thanks for playing!',
  'Das aktuelle Passwort stimmt nicht.': 'The current password is incorrect.', 'Das neue Passwort braucht mindestens 8 Zeichen.': 'The new password needs at least 8 characters.',
  'Die beiden neuen Passwörter sind nicht gleich.': 'The two new passwords do not match.', 'Passwort geändert.': 'Password changed.', 'E-Mail-Adresse geändert.': 'Email address changed.',
  'Diese E-Mail-Adresse wird schon verwendet.': 'This email address is already in use.', 'Das Passwort stimmt nicht.': 'The password is incorrect.',
  'Bitte tippe zur Bestätigung LÖSCHEN (bzw. DELETE) ein.': 'Please type DELETE to confirm.',
  'Du bist der letzte Admin. Vergib zuerst die Admin-Rolle an jemand anderen.': 'You are the last admin. Give the admin role to someone else first.',
  'Während der Admin-Ansicht kann kein Konto gelöscht werden.': 'No account can be deleted during admin view.', 'Während der Admin-Ansicht kann kein Konto gelöscht werden.': 'No account can be deleted during admin view.',
  'Bitte kurz warten': 'Please wait a moment', 'Der Export kann nur alle 30 Sekunden angefordert werden.': 'The export can only be requested every 30 seconds.',
  'Gelöschtes Konto': 'Deleted account',
  'Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben.': 'Almost done: please confirm your email address using the link we sent you.',
  'Passwort geändert. Du kannst dich jetzt anmelden.': 'Password changed. You can log in now.',
  'Benutzername oder Passwort stimmt nicht.': 'Username or password is incorrect.', 'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Please confirm your email address first.',
  'Zu viele Versuche. Bitte warte einige Minuten.': 'Too many attempts. Please wait a few minutes.',
  'Falls ein Konto mit dieser Adresse existiert, ist ein Link unterwegs.': 'If an account with this address exists, a link is on its way.',
  'E-Mail-Versand ist auf diesem Server nicht eingerichtet. Bitte wende dich an den Betreiber.': 'Email delivery is not set up on this server. Please contact the operator.',
  'Link ungültig': 'Invalid link', 'Dieser Bestätigungslink ist abgelaufen oder wurde bereits verwendet.': 'This confirmation link has expired or was already used.',
  'Dieser Link ist abgelaufen. Fordere einen neuen an.': 'This link has expired. Request a new one.', 'Dieser Link ist abgelaufen.': 'This link has expired.',
  'Registrierung geschlossen': 'Registration closed', 'Neue Konten sind im Moment nicht möglich.': 'New accounts are not possible at the moment.',
  'Echtes Vermögen heute:': 'Actual wealth today:',
  'Stadt oder Dorf suchen … (rund 9.000 Orte)': 'Search a city or village … (about 9,000 places)',
  'Große Städte zum Schnellstart:': 'Big cities for a quick start:',
  'Ort suchen …': 'Search a place …', 'Kein Ort gefunden.': 'No place found.', 'Zurück zu meinem Wohnort': 'Back to my home place',
  'Handwerk': 'Crafts', 'Bau': 'Construction', 'Landwirtschaft': 'Agriculture', 'Industrie': 'Industry', 'Verkehr': 'Transport', 'Gastronomie': 'Hospitality',
  'Dienstleistung': 'Services', 'Energie': 'Energy', 'Technik': 'Technology', 'Kreatives': 'Creative',
  'Diesen Ort gibt es noch nicht.': 'This place does not exist yet.', 'Team': 'Team',
};
const patterns = [];
for (const [de, [en, art]] of Object.entries(KINDS)) {
  exact[de] = en.charAt(0).toUpperCase() + en.slice(1);
  const E = en.charAt(0).toUpperCase() + en.slice(1);
  patterns.push([`^(.+) · ${de} · ([\\d.,kmb]+) Einwohner · seit (\\d+)$`, `$1 · ${E} · $2 inhabitants · since $3`]);
  patterns.push([`^(.+) · ${de} · ([\\d.,kmb]+) Einwohner$`, `$1 · ${E} · $2 inhabitants`]);
  patterns.push([`^(.+) · ${de}$`, `$1 · ${E}`]);
  patterns.push([`^(.+) ist ${de === 'Dorf' ? 'ein Dorf' : de === 'Gemeinde' ? 'eine Gemeinde' : de === 'Kleinstadt' ? 'eine Kleinstadt' : de === 'Stadt' ? 'eine Stadt' : de === 'Großstadt' ? 'eine Großstadt' : 'eine Metropole'} in (.+) mit rund ([\\d.]+) Einwohnern\\.$`, `$1 is ${art} in $2 with about $3 inhabitants.`]);
}
patterns.push(['^([\\d.,kmbt]+) DM \\(Wert 1945\\)$', '$1 DM (1945 value)']);
patterns.push(['^Mieter: (.+)$', 'Tenant: $1']);
patterns.push(['^Mietersuche · (\\d+) Tage leer$', 'Looking for tenants · $1 days vacant']);
patterns.push(['^/ Tag \\(([\\d.,]+) % Rendite im Jahr\\)$', '/ day ($1 % yield per year)']);
patterns.push(['^noch ca\\. (\\d+) Mon\\.$', 'about $1 more months']);
patterns.push(['^Mietpreis: (\\d+) %$', 'Rent: $1 %']);
patterns.push(['^· Miete möglich: ca\\. (.+) / Tag$', '· Rent possible: approx. $1 / day']);
patterns.push(['^(.+) Zimmer · Zustand (\\d+) % · Miete möglich: ca\\. (.+) / Tag$', '$1 rooms · condition $2 % · rent possible: approx. $3 / day']);
patterns.push(['^(.+) Zimmer · Zustand (\\d+) %$', '$1 rooms · condition $2 %']);
patterns.push(['^Angebote in (.+)\\. Du kannst sie bewohnen oder vermieten – und in anderen Städten über die Zeitung kaufen\\.$', 'Offers in $1. You can live in them or let them out – and buy in other cities via the newspaper.']);
patterns.push(['^(.+) ist ein Ort in (.+)\\.$', '$1 is a place in $2.']);
patterns.push(['^(\\d+[.,]?\\d*k?m?) Einwohner$', '$1 inhabitants']);
module.exports = { exact, patterns };
