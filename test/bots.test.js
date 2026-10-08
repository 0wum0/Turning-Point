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

const BASE_DE = 86; const BASE_EN = 45; // Umfang der Textbänke vor der Erweiterung

test('Textbänke sind mindestens vierfach so groß wie zuvor', () => {
  const s = T.stats();
  assert.ok(s.de >= 4 * BASE_DE, `DE ${s.de}`);
  assert.ok(s.en >= 4 * BASE_EN, `EN ${s.en}`);
});

test('Epochen, Tageszeiten und Städte liefern passende Zeilen', () => {
  assert.ok(T.eraLines(T.DE, 1948).some((l) => /Währungsreform/.test(l)));
  assert.ok(T.eraLines(T.DE, 1952).some((l) => /Wirtschaftswunder/.test(l)));
  assert.ok(T.eraLines(T.DE, 1989).some((l) => /Mauerfall/.test(l)));
  assert.ok(T.eraLines(T.DE, 2002).some((l) => /Euro/.test(l)));
  assert.ok(T.eraLines(T.DE, 1996).some((l) => /Internet/.test(l)));
  assert.ok(T.eraLines(T.EN, 1989).some((l) => /wall/i.test(l)));
  assert.ok(T.eraLines(T.DE, 1900).length > 0 && T.eraLines(T.DE, 2500).length > 0, 'auch außerhalb der Tabelle gibt es Zeilen');
  assert.strictEqual(T.timeBank(T.DE, 6), T.DE.early);
  assert.strictEqual(T.timeBank(T.DE, 12), T.DE.noon);
  assert.strictEqual(T.timeBank(T.DE, 19), T.DE.evening);
  assert.strictEqual(T.timeBank(T.DE, 2), T.DE.night);
  assert.ok(T.cityBank(T.DE, 'Hamburg').some((l) => /Hafen/.test(l)));
  assert.ok(T.cityBank(T.DE, 'Frankfurt am Main').some((l) => /Messe|Banken/.test(l)));
  assert.ok(T.cityBank(T.DE, 'Irgendwo').length >= 10);
});

test('Wiederholungsschutz: kleine Bank wird reihum erschöpft, bevor eine Zeile wiederkommt', () => {
  const pool = Array.from({ length: 30 }, (_, i) => `Zeile ${i}`);
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(T.pickFresh(pool, 'tbot1'));
  assert.strictEqual(seen.size, 30);
});

test('Wiederholungsschutz im Chat: gleiche Zeile nicht binnen zehn Äußerungen, Beruf und Stadt kommen vor', () => {
  const out = [];
  for (let i = 0; i < 500; i++) out.push(T.idle(P, { city: 'Hamburg', year: 1960, hour: 8 + (i % 12), prof: 'Bäcker', botId: 'tbot2' }));
  for (let i = 0; i < out.length; i++) for (let j = Math.max(0, i - 10); j < i; j++) assert.notStrictEqual(out[i], out[j], `Wiederholung: ${out[i]}`);
  assert.ok(out.some((t) => /Bäcker/.test(t)), 'Berufsbezug');
  assert.ok(out.some((t) => /Hamburg/.test(t)), 'Stadtbezug');
  assert.ok(new Set(out).size > 150, `Vielfalt ${new Set(out).size}`);
});

test('Antworten bleiben ehrlich und frei von Zahlungsaufforderungen, in allen Epochen', () => {
  for (const lang of ['de', 'en']) {
    const Q = { ...P, lang };
    const r = T.chatReply(Q, 'Seid ihr eigentlich Bots?', { myFirst: 'Hans', theirFirst: 'Karl', username: 'x', botId: 'tbot3' });
    assert.ok(r && /bot|computer/i.test(r.text));
    for (const year of [1946, 1949, 1953, 1961, 1970, 1977, 1985, 1990, 1995, 2001, 2008, 2016, 2025, 2045, 2090]) {
      for (let i = 0; i < 80; i++) {
        const t = T.idle(Q, { city: 'Köln', year, hour: i % 24, prof: 'Wirt', botId: 'tbot4' }) + T.letterReply(Q, 'hallo?', 'Karl', 'tbot4');
        assert.ok(!/(€|\bkaufen\b|\bbuy |überweis|paypal|geld schick|send me money|human being|echter mensch bin)/i.test(t), t);
      }
    }
  }
});
