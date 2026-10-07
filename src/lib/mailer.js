'use strict';
const nodemailer = require('nodemailer');
const settings = require('../settings');

function smtpConfigured() {
  const c = settings.get('mail.smtp');
  return !!(c && c.host && c.from);
}

async function send({ to, subject, text, html }) {
  const c = settings.get('mail.smtp');
  if (!smtpConfigured()) throw new Error('SMTP ist nicht konfiguriert.');
  const t = nodemailer.createTransport({
    host: c.host, port: Number(c.port) || 587, secure: !!c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  return t.sendMail({ from: c.from, to, subject, text, html });
}

module.exports = { send, smtpConfigured };
