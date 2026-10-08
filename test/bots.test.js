'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/lib/bot-texts');

const P = { lang: 'de', tone: 'locker', lower: false, typo: false, emoji: false, chatty: 1 };

test('Bots antworten auf die ernste Frage nach Bot-Sein ehrlich', () => {
  const r = T.chatReply(P, 'Hans, bist du eigentlich ein Bot?', { myFirst: 'Hans', theirFirst: 'Karl', username: 'hans88' });
  assert.ok(r && /Bot|computergesteuert/i.test(r.text) && r.p === 1);
  const l = T.letterReply(P, 'Frage: bist du ein Bot?', 'Karl');
  assert.match(l, /Bot|computergesteuert/i);
  const en = T.letterReply({ ...P, lang: 'en' }, 'are you a bot?', 'Karl');
  assert.match(en, /bot|computer/i);
});
test('Bots grüßen zurück und erfinden keine Zahlungsaufforderungen', () => {
  const g = T.chatReply(P, 'Hallo zusammen!', { myFirst: 'Hans', theirFirst: 'Karl', username: 'hans88' });
  assert.ok(g && g.text.length > 1);
  for (let i = 0; i < 200; i++) {
    const t = T.idle(P, { city: 'Köln', year: 1960, hour: 12 }) + T.letterReply(P, 'hallo', 'Karl');
    assert.ok(!/(€|euro|kaufen|überweis|paypal|geld schick)/i.test(t), t);
  }
  assert.ok(/^[\p{L}\p{N}_.-]{3,24}$/u.test(T.nickname('Hans')));
});
