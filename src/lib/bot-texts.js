'use strict';
/** Texte für Bots: Spitznamen, Chat, Briefe. Bewusst kurz und alltäglich gehalten. */
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;

const HANDLES = ['Mia', 'Leon', 'Anna', 'Paul', 'Lena', 'Jonas', 'Emma', 'Felix', 'Laura', 'Max', 'Sophie', 'Tim', 'Nina', 'Ben', 'Julia', 'Lukas', 'Clara', 'Jan', 'Hanna', 'Niklas', 'Marie', 'David', 'Lisa', 'Tom', 'Katrin', 'Stefan', 'Petra', 'Jürgen', 'Heike', 'Uwe', 'Sabine', 'Olaf', 'Birgit', 'Kai', 'Tanja', 'Ralf', 'Frieda', 'Henning', 'Merle', 'Torben', 'Ida', 'Carsten', 'Nele', 'Matthias'];
const TAILS = ['', '', '', '_', '88', '91', '07', '1987', '1992', '2001', '_k', '.m', 'HH', 'B', 'xx', '_77', '23', '4711', 'S', '_official', 'Fan'];
const WORDS = ['Zocker', 'Daddler', 'Bäcker', 'Wirt', 'Tüftler', 'Nordlicht', 'Rheinländer', 'Schwabe', 'Pottkind', 'Küstenkind', 'Spieler', 'Fuchs', 'Bär', 'Kapitän'];

function nickname(first) {
  const base = chance(0.25) ? pick(WORDS) : (chance(0.55) ? first : pick(HANDLES));
  let n = base + pick(TAILS);
  if (chance(0.2)) n = n.toLowerCase();
  if (chance(0.12)) n = `${pick(HANDLES)}_${pick(WORDS)}`;
  return n.replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 22) || `${first}${Math.floor(Math.random() * 99)}`;
}

const BIO_DE = ['Baue mir hier was auf.', 'Immer für einen Plausch zu haben.', 'Langsam, aber stetig.', 'Erst Arbeit, dann Vergnügen.', 'Sammle Häuser und Erinnerungen.', 'Neu hier, aber schon dabei.', 'Familie geht vor.', 'Mal sehen, wie weit ich komme.', 'Kaffee, Kuchen, Kurs halten.', ''];
const BIO_EN = ['Building something here.', 'Always up for a chat.', 'Slow but steady.', 'Work first, fun later.', 'Collecting houses and memories.', 'New here, but already hooked.', 'Family comes first.', 'Let\'s see how far I get.'];
const bio = (lang) => pick(lang === 'en' ? BIO_EN : BIO_DE).trim() || null;

/* ---------- Stil: Kleinschreibung, Tippfehler, Emoji ---------- */
function style(P, text) {
  let t = text;
  if (P.lower) t = t.charAt(0).toLowerCase() + t.slice(1);
  if (P.tone === 'knapp') t = t.replace(/[.!]$/, '');
  if (P.typo && t.length > 12 && chance(0.25)) { const i = 3 + Math.floor(Math.random() * (t.length - 6)); if (/[a-zäöü]/i.test(t[i]) && /[a-zäöü]/i.test(t[i + 1])) t = t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2); }
  if (P.emoji && chance(0.35)) t += ` ${pick(['🙂', '😊', '👍', '😄', '☕'])}`;
  return t;
}

/* ---------- Gesprächsbausteine (Deutsch / Englisch) ---------- */
const DE = {
  greet: ['Moin zusammen!', 'Hallo ihr alle!', 'Hi, wie läuft’s bei euch?', 'Servus!', 'Na, alle da?', 'Guten Tag allerseits.', 'Hallo {city}!'],
  morning: ['Guten Morgen!', 'Moin, schon jemand wach?', 'Morgen zusammen, erstmal Kaffee.'],
  evening: ['Schönen Abend noch!', 'Na, Feierabend?', 'Abend zusammen.'],
  night: ['Noch jemand so spät unterwegs?', 'Eigentlich müsste ich schlafen …'],
  game: ['Hat jemand einen Tipp für eine günstige Wohnung in {city}?', 'Lohnt sich ein eigener Betrieb eigentlich schon früh?', 'Wie macht ihr das mit dem Kühlschrank, immer voll halten?', 'Hat hier jemand ein Haus zur Miete angeboten?', 'Wer hat schon mal für ein Amt kandidiert?', 'Ich spare gerade auf ein eigenes Haus.', 'Die Zeitung hat heute wieder interessante Stellen.', 'Wie weit seid ihr im Spiel, welches Jahr?', 'Mein Mieter zahlt zum Glück pünktlich.', 'Bei mir ist gerade alles ruhig, kann gern so bleiben.', 'Kinder kosten ordentlich, aber es lohnt sich.', 'Hat jemand Erfahrung mit der Versicherung?'],
  era: {
    1940: ['Der Wiederaufbau geht langsam voran.', 'Wer hat noch Arbeit gefunden? Es wird überall gebraucht.', 'Die Preise sind verrückt, aber es geht bergauf.'],
    1950: ['Das Wirtschaftswunder merkt man langsam.', 'Habt ihr schon einen Fernseher gesehen?', 'Es geht uns besser als noch vor ein paar Jahren.'],
    1960: ['Die Zeiten ändern sich schnell.', 'Heute Abend gibt’s endlich Fernsehen bei den Nachbarn.', 'Autos gibt’s überall, früher undenkbar.'],
    1970: ['Die Ölkrise merkt man an den Preisen.', 'Schlaghosen sind wieder ganz groß.', 'Alles wird teurer, oder täusche ich mich?'],
    1980: ['Computer sind auf einmal überall.', 'Hört ihr auch so viel Musik wie ich?', 'Die Arbeitslosigkeit macht mir etwas Sorgen.'],
    1990: ['Die Wiedervereinigung verändert alles.', 'Und nun auch noch der Euro in ein paar Jahren.', 'Wer hat schon Internet zu Hause?'],
    2000: ['Das Internet ist schon praktisch.', 'Wie findet ihr den Euro?', 'Handys haben jetzt ja alle.'],
    2010: ['Ohne Smartphone geht kaum noch was.', 'Die Mieten sind echt hoch geworden.', 'Wer hat sich schon ein E-Auto angeschafft?'],
    2020: ['Homeoffice ist für mich Alltag.', 'Die Energiepreise machen mir zu schaffen.', 'Was haltet ihr von den neuen Berufen?'],
  },
  replyGreet: ['Hallo {them}!', 'Moin {them}!', 'Hi {them}, schön dich zu sehen.', 'Hey {them} 🙂', 'Servus!', 'Hallo, willkommen!'],
  replyHowAre: ['Läuft gut, danke. Und bei dir?', 'Kann nicht klagen, danke der Nachfrage.', 'Alles im grünen Bereich, bei dir?', 'Es geht – viel zu tun, aber das ist ja gut.'],
  replyHelp: ['Schau mal in der Zeitung unter Wohnungsmarkt, da stehen oft gute Angebote.', 'Am Anfang hilft jede Arbeit – später kannst du dich verbessern.', 'Ich würde zuerst den Kühlschrank und ein Dach über dem Kopf sichern.', 'Frag doch mal in der Rangliste herum, die Leute dort sind oft hilfsbereit.', 'Keine Ahnung, ich bin selbst noch am Ausprobieren.'],
  replyThanks: ['Gern geschehen!', 'Kein Ding.', 'Immer gern.'],
  replyGeneric: ['Ja, finde ich auch.', 'Stimmt, da ist was dran.', 'Hm, interessant.', 'Gute Frage eigentlich.', 'Das sehe ich ähnlich.', 'Haha, ja.', 'Genau 🙂'],
  honest: ['Ich bin eine computergesteuerte Spielfigur – kein echter Mensch.', 'Ehrlich gesagt: Ja, ich bin ein Bot, also computergesteuert.'],
};
const EN = {
  greet: ['Morning all!', 'Hello everyone!', 'Hi, how are things?', 'Hey there!', 'Anyone around?', 'Hello {city}!'],
  morning: ['Good morning!', 'Morning, coffee first.'], evening: ['Good evening!', 'Evening everyone.'], night: ['Anyone else up this late?'],
  game: ['Anyone know a cheap flat in {city}?', 'Is it worth opening a business early?', 'How do you keep the fridge full all the time?', 'I\'m saving up for my own house.', 'The newspaper has some nice jobs today.', 'What year are you all in?', 'My tenant pays on time, luckily.'],
  era: { 1940: ['Rebuilding is slow but steady.'], 1950: ['The economic miracle is starting to show.'], 1960: ['Times are changing fast.'], 1980: ['Computers are everywhere now.'], 1990: ['Reunification changes everything.'], 2000: ['The internet is quite handy.'], 2010: ['Rents have gone up a lot.'], 2020: ['Energy prices are a worry.'] },
  replyGreet: ['Hi {them}!', 'Hello {them}, welcome!', 'Hey {them} 🙂'], replyHowAre: ['Going well, thanks. You?', 'Can\'t complain!', 'All good, and you?'],
  replyHelp: ['Check the newspaper housing market, there are often good offers.', 'Any job helps at the start – you can improve later.', 'Secure the fridge and a roof first.', 'No idea, still figuring it out myself.'],
  replyThanks: ['You\'re welcome!', 'No problem.'], replyGeneric: ['Yeah, I think so too.', 'True.', 'Good question.', 'Haha, yes.'],
  honest: ['I\'m a computer-controlled character – not a real person.', 'To be honest: yes, I\'m a bot.'],
};
const L = (P) => (P.lang === 'en' ? EN : DE);
const fill = (t, v) => t.replace('{city}', v.city || '').replace('{them}', v.them || '').trim();

function idle(P, { city, year, hour }) {
  const T = L(P); const r = Math.random(); let t;
  if (r < 0.2) t = pick(hour < 11 ? T.morning : hour < 18 ? T.greet : hour < 23 ? T.evening : T.night);
  else if (r < 0.5) { const dec = Math.max(1940, Math.min(2020, Math.floor((year || 1950) / 10) * 10)); t = pick(T.era[dec] || T.era[1950] || T.game); }
  else t = pick(T.game);
  return style(P, fill(t, { city }));
}

const RE_BOT = /\b(bot|bots|roboter|robot|computer(gesteuert)?|k\.?i\.?|künstliche|mensch oder|echter? mensch|echt\??|real person|human)\b/i;
const RE_GREET = /\b(hallo|hi|hey|moin|servus|guten (morgen|tag|abend)|hello|morning)\b/i;
const RE_HOWARE = /(wie geht'?s|wie läuft|alles klar|how are you|how's it)/i;
const RE_QUESTION = /\?/;
const RE_THANKS = /\b(danke|dank|thx|thanks|thank you)\b/i;

/** Antwort auf eine Chat-Nachricht eines Spielers: { text, p } (p = Wahrscheinlichkeit zu antworten) oder null. */
function chatReply(P, text, { myFirst, theirFirst, username }) {
  const T = L(P); const lc = String(text || '').toLowerCase();
  const mentions = (myFirst && lc.includes(myFirst.toLowerCase())) || (username && lc.includes(String(username).toLowerCase()));
  if (RE_BOT.test(text) && (mentions || /\b(ihr|alle|seid|any|you)\b/i.test(text)) && /\?|bist|seid|are you|ist/.test(lc)) return { text: style(P, pick(T.honest)), p: mentions ? 1 : 0.35 };
  if (RE_GREET.test(text)) return { text: style(P, fill(pick(T.replyGreet), { them: theirFirst })), p: mentions ? 1 : 0.55 };
  if (RE_HOWARE.test(text)) return { text: style(P, pick(T.replyHowAre)), p: mentions ? 1 : 0.5 };
  if (RE_THANKS.test(text)) return { text: style(P, pick(T.replyThanks)), p: 0.4 };
  if (RE_QUESTION.test(text)) return { text: style(P, pick(T.replyHelp)), p: mentions ? 0.95 : 0.4 };
  if (mentions) return { text: style(P, pick(T.replyGeneric)), p: 0.8 };
  return { text: style(P, pick(T.replyGeneric)), p: 0.08 };
}

const LETTER_DE = ['Danke für deine Nachricht! Ich melde mich, sobald ich etwas Genaueres weiß.', 'Hallo {them}, schön von dir zu hören. Gerade ist viel los, aber ich schaue gern, was sich machen lässt.', 'Hi {them}, danke dir! Lass uns gern in Kontakt bleiben.', 'Hallo {them}, vielen Dank. Ich bin mir noch nicht sicher, aber ich überlege es mir.', 'Grüß dich {them}! Klingt gut, danke für die Nachricht.'];
const LETTER_EN = ['Thanks for your message! I\'ll get back to you once I know more.', 'Hi {them}, nice to hear from you. Busy at the moment, but I\'ll see what I can do.', 'Hello {them}, thank you! Let\'s stay in touch.'];
function letterReply(P, text, them) {
  const bank = P.lang === 'en' ? LETTER_EN : LETTER_DE;
  if (RE_BOT.test(text) && /\?|bist|are you/i.test(text)) return pick(L(P).honest);
  return fill(pick(bank), { them }) + (P.tone === 'höflich' ? (P.lang === 'en' ? '\n\nBest wishes' : '\n\nViele Grüße') : '');
}
const applyText = (P) => (P.lang === 'en' ? 'Hello, I would like to work for you. I am reliable and quick to learn.' : pick(['Guten Tag, ich würde gern bei Ihnen arbeiten. Ich bin zuverlässig und lerne schnell.', 'Hallo, die Stelle interessiert mich sehr. Ich kann bald anfangen.']));

module.exports = { nickname, bio, idle, chatReply, letterReply, applyText, style };
