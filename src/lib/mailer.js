'use strict';
const nodemailer = require('nodemailer');
const settings = require('../settings');
const { isEmail } = require('./security');

function smtpConfigured() {
  const c = settings.get('mail.smtp');
  return !!(c && c.host && c.from);
}

async function send({ to, subject, text, html }) {
  const c = settings.get('mail.smtp');
  // Genau eine gültige Empfängeradresse; Betreff ohne Zeilenumbrüche (Header-Injektion / Mail-Relay-Missbrauch)
  if (!isEmail(to)) throw new Error('Ungültige Empfängeradresse.');
  if (!smtpConfigured()) throw new Error('SMTP ist nicht konfiguriert.');
  const subj = String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const t = nodemailer.createTransport({
    host: c.host, port: Number(c.port) || 587, secure: !!c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  return t.sendMail({ from: c.from, to, subject: subj, text, html });
}

module.exports = { send, smtpConfigured };
