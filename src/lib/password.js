'use strict';
/** Passwort-Regeln für neue Passwörter (Registrierung, Zurücksetzen, Ändern). Bestehende Passwörter bleiben gültig. */
const MIN = 10;
const MAX_BYTES = 72; // bcrypt verarbeitet nur die ersten 72 Bytes – längere würden stillschweigend abgeschnitten
const COMMON = new Set([
  '1234567890', '0123456789', '1234567891', '12345678910', '1q2w3e4r5t', '1qaz2wsx3e', 'qwertzuiop', 'qwertyuiop', 'qwertz1234', 'qwerty1234', 'asdfghjkl1',
  'password1', 'password12', 'password123', 'password1234', 'passwort12', 'passwort123', 'passwort1234', 'passwort!1', 'abcdefghij', 'abcd123456', 'abc1234567',
  'iloveyou12', 'iloveyou123', 'willkommen1', 'willkommen12', 'willkommen123', 'hallo12345', 'sommer2020', 'sommer2024', 'winter2024', 'fussball11', 'fussball123',
  'turningpoint', 'turning-point', 'turningpoint1', 'turningpoint123', 'changeme12', 'letmein123', 'trustno1234', 'baseball123', 'superman123', 'monkey12345',
]);

/** @returns {string|null} Fehlermeldung oder null, wenn das Passwort in Ordnung ist. */
function validate(pw, { username = '', email = '' } = {}) {
  if (typeof pw !== 'string') return 'Bitte ein Passwort angeben.';
  if (pw.length < MIN) return `Das Passwort braucht mindestens ${MIN} Zeichen.`;
  if (Buffer.byteLength(pw, 'utf8') > MAX_BYTES) return `Das Passwort ist zu lang (höchstens ${MAX_BYTES} Bytes, etwa ${MAX_BYTES} einfache Zeichen).`;
  if (/^(.)\1+$/.test(pw)) return 'Das Passwort darf nicht nur aus einem wiederholten Zeichen bestehen.';
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return 'Dieses Passwort ist zu verbreitet. Bitte wähle ein anderes.';
  const u = String(username || '').trim().toLowerCase();
  if (u.length >= 4 && low.includes(u)) return 'Das Passwort darf deinen Spielernamen nicht enthalten.';
  return null;
}

module.exports = { validate, MIN, MAX_BYTES };
