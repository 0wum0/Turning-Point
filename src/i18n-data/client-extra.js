'use strict';
/** Zusätzliche englische Texte: Orte, Karte, Berufsgruppen, Rollen. */
const KINDS = { Dorf: ['village', 'a village'], Gemeinde: ['municipality', 'a municipality'], Kleinstadt: ['small town', 'a small town'], Stadt: ['city', 'a city'], Großstadt: ['large city', 'a large city'], Metropole: ['metropolis', 'a metropolis'] };
const exact = {
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
patterns.push(['^(.+) ist ein Ort in (.+)\\.$', '$1 is a place in $2.']);
patterns.push(['^(\\d+[.,]?\\d*k?m?) Einwohner$', '$1 inhabitants']);
module.exports = { exact, patterns };
