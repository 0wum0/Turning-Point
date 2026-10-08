'use strict';
/** Englische Texte: Konto → Benachrichtigungen auf dem Handy (Web-Push). */
const exact = {};
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
X([
  ['Benachrichtigungen auf dem Handy', 'Notifications on your phone'],
  ['Wenn du Turning Point als App installiert hast, kann dich das Spiel per Push benachrichtigen – auch bei geschlossener App: neue Briefe, Erwähnungen im Stadtplatz-Chat, Kaufangebote, Überbieten bei Versteigerungen, Beziehungsanfragen und Jobangebote. Du kannst das jederzeit ausschalten; jedes Gerät meldest du einzeln an.',
    'If you have installed Turning Point as an app, the game can send you push notifications – even when the app is closed: new letters, mentions in the town square chat, purchase offers, being outbid at auctions, relationship requests and job offers. You can switch this off at any time; each device is registered separately.'],
  ['Dieses Gerät oder dieser Browser unterstützt keine Push-Benachrichtigungen. Auf dem iPhone muss die App zuerst über „Zum Home-Bildschirm“ installiert werden.',
    'This device or browser does not support push notifications. On iPhone the app must first be installed via “Add to Home Screen”.'],
  ['Push-Benachrichtigungen sind derzeit vom Betreiber abgeschaltet.', 'Push notifications are currently switched off by the operator.'],
  ['Benachrichtigungen einschalten', 'Turn notifications on'], ['Benachrichtigungen ausschalten', 'Turn notifications off'],
  ['Testnachricht senden', 'Send test message'],
  ['Worüber möchtest du informiert werden?', 'What would you like to be notified about?'],
  ['Neue Briefe und Freundschaftsanfragen', 'New letters and friend requests'],
  ['Erwähnungen im Stadtplatz-Chat (@Spielername)', 'Mentions in the town square chat (@playername)'],
  ['Kauf- und Gegenangebote', 'Purchase offers and counteroffers'],
  ['Überboten bei Versteigerungen', 'Outbid at auctions'],
  ['Beziehungs- und Heiratsanfragen', 'Relationship and marriage requests'],
  ['Bewerbungen und Jobangebote', 'Applications and job offers'],
  ['Auswahl speichern', 'Save selection'],
  ['Ruhezeit: keine Benachrichtigungen von', 'Quiet time: no notifications from'],
  ['bis', 'to'], ['Uhr (Ortszeit deines Geräts)', 'o’clock (local time of your device)'],
]);
module.exports = { exact, patterns: [] };
