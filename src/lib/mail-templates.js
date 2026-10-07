'use strict';
/** Betreff und Text der System-E-Mails in der Sprache des Spielers (de | en). */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const T = {
  verify: {
    de: (u, link) => ({ subject: 'Bestätige deine E-Mail – Turning Point', text: `Willkommen bei Turning Point, ${u}!\n\nBitte bestätige deine E-Mail-Adresse:\n${link}\n`, html: `<p>Willkommen bei <b>Turning Point</b>, ${esc(u)}!</p><p><a href="${esc(link)}">E-Mail bestätigen</a></p>` }),
    en: (u, link) => ({ subject: 'Confirm your email – Turning Point', text: `Welcome to Turning Point, ${u}!\n\nPlease confirm your email address:\n${link}\n`, html: `<p>Welcome to <b>Turning Point</b>, ${esc(u)}!</p><p><a href="${esc(link)}">Confirm email</a></p>` }),
  },
  reset: {
    de: (u, link) => ({ subject: 'Passwort zurücksetzen – Turning Point', text: `Hallo ${u},\n\nHier kannst du dein Passwort zurücksetzen (1 Stunde gültig):\n${link}\n\nWar das nicht du? Dann ignoriere diese E-Mail.\n`, html: `<p>Hallo ${esc(u)},</p><p><a href="${esc(link)}">Passwort zurücksetzen</a> (1 Stunde gültig)</p><p>War das nicht du? Dann ignoriere diese E-Mail.</p>` }),
    en: (u, link) => ({ subject: 'Reset your password – Turning Point', text: `Hello ${u},\n\nYou can reset your password here (valid for 1 hour):\n${link}\n\nWasn't you? Then simply ignore this email.\n`, html: `<p>Hello ${esc(u)},</p><p><a href="${esc(link)}">Reset password</a> (valid for 1 hour)</p><p>Wasn't you? Then simply ignore this email.</p>` }),
  },
  test: {
    de: () => ({ subject: 'Turning Point – Testmail', text: 'Der E-Mail-Versand funktioniert.' }),
    en: () => ({ subject: 'Turning Point – test email', text: 'Email delivery is working.' }),
  },
};

/** build('verify', 'en', username, link) → { subject, text, html } */
function build(kind, lang, ...args) { return (T[kind][lang === 'en' ? 'en' : 'de'])(...args); }
module.exports = { build };
