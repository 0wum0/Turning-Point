'use strict';
/**
 * Englische Texte (Spielserver): Werben, Ehe und Familienunternehmen – Bekanntschaften, Ehevertrag, Eheringe, Scheidung, Kinder im Familienbetrieb,
 * Übergabe zu Lebzeiten, Traditionsbetrieb, Dynastie-Wertung: Meldungen, Fehler, Ansehen-Texte, Aufgaben, Hinweise, Tagesblatt, Katalog.
 * Paare [deutsch, englisch]; ${…} sind Platzhalter (Namen und Zahlen). Mehrere Sätze werden satzweise übersetzt (siehe i18n-game.js), deshalb stehen die Sätze einzeln hier.
 * Der Katalog (Vorlieben, Aktionen, Familienklassen, Eheverträge, Ringe, Traditionsstufen, Dynastiestufen) steht in src/game/dynasty-defaults.js; die Paare für seine Standardtexte entstehen hier.
 */
const D = require('../game/dynasty-defaults');

const LIKES = { wort: 'Words and attention', kultur: 'Culture and music', natur: 'Nature and outings', genuss: 'Good food and enjoyment', heim: 'Family and the future', bewegung: 'Sport and exercise' };
const ACTS = {
  kompliment: ['Compliment', 'An honest word at the right time. Costs nothing, works with charm.'],
  brief: ['Letter or poem', 'Fine words put on paper: education and expression count (rhetoric).'],
  gespraech: ['Talk about the future', 'Discuss wishes and plans. Negotiating skill helps to find a common path.'],
  essen: ['Invite to dinner', 'An evening in good company.'],
  geschenk: ['Small token of affection', 'Flowers, a book or a sweet – it is the gesture that counts.'],
  konzert: ['Concert or dance evening', 'Sharing music and culture.'],
  ausflug: ['Trip to the countryside', 'A walk or a drive out of town.'],
  sport: ['Doing sport together', 'Swimming, hiking or dancing: movement brings people together.'],
};
const NAMES = { 'Tanzabend': 'Dance evening', 'Kino und Tanz': 'Cinema and dancing', 'Konzert': 'Concert' };
const CLASSES = ['Modest circumstances', 'Middle-class family', 'Wealthy family', 'Business family'];
const KINDS = {
  zugewinn: ['Community of accrued gains', 'Statutory property regime', 'The standard without a contract: both keep their own property. In a divorce the growth of wealth since the wedding (adjusted for inflation) is shared – whoever gained more pays half of the difference.'],
  trennung: ['Separation of property', 'Everyone keeps their own', 'With a marriage contract at the notary: everyone keeps their wealth, there is no settlement in a divorce. In return the partner’s family gives only half of the dowry. Sensible for entrepreneurs.'],
  mitgift: ['Marriage contract with dowry', 'Dowry with reversion clause', 'The partner’s family contributes more – a flat from wealthy families, a family business from business families. In a divorce the dowry reverts to the family; there is no settlement of gains.'],
};
const RINGS = [
  ['Eheringe aus Silber', 'Wedding rings in silver', 'Schlichte Ringe: ein Zeichen, kein Prunk.', 'Plain rings: a sign, not a show.'],
  ['Eheringe aus Gold', 'Wedding rings in gold', 'Klassische Trauringe aus Gold.', 'Classic wedding bands in gold.'],
  ['Eheringe mit Brillant', 'Wedding rings with a diamond', 'Handgearbeitet, mit einem funkelnden Stein – ein Stück für Generationen.', 'Handmade, with a sparkling stone – a piece for generations.'],
];
const TRAD = ['Family business in the second generation', 'Traditional company', 'Centenary company'];
const TRAD_DE = D.tradition.levels.map((l) => l.name);
const DYN = ['Newcomer family', 'Established family', 'Old-established family', 'Distinguished dynasty', 'Great dynasty'];

const catalog = [];
const seen = new Set(); const add = (de, en) => { if (typeof de === 'string' && de && !seen.has(de)) { seen.add(de); catalog.push([de, en]); } };
for (const [k, en] of Object.entries(LIKES)) add(D.woo.likes[k], en);
for (const [k, [name, text]] of Object.entries(ACTS)) { add(D.woo.acts[k].label, name); add(D.woo.acts[k].text, text); }
for (const [de, en] of Object.entries(NAMES)) add(de, en);
D.family.classes.forEach((c, i) => add(c.name, CLASSES[i]));
for (const [k, [name, short, text]] of Object.entries(KINDS)) { add(D.contract.kinds[k].name, name); add(D.contract.kinds[k].short, short); add(D.contract.kinds[k].text, text); }
RINGS.forEach(([de, en, tde, ten]) => { add(de, en); add(tde, ten); });
add('Keine Ringe', 'No rings'); add('Ihr verzichtet auf Ringe.', 'You do without rings.');
TRAD_DE.forEach((de, i) => add(de, TRAD[i]));
D.dynasty.levels.forEach((l, i) => add(l.name, DYN[i]));

const pairs = [
  ...catalog,
  ['skeptisch', 'skeptical'], ['aufgeschlossen', 'open-minded'], ['angetan', 'pleased'], ['begeistert', 'delighted'],
  // ---- Fehler und Prüfungen (Werben)
  ['Das Werben ist gerade ausgeschaltet.', 'Courting is switched off at the moment.'], ['Das Werben und die Familienplanung sind gerade ausgeschaltet.', 'Courting and family planning are switched off at the moment.'],
  ['Eine Partnerschaft gibt es nur zwischen Mann und Frau.', 'A partnership exists only between a man and a woman.'], ['Eine Ehe gibt es nur zwischen Mann und Frau.', 'A marriage exists only between a man and a woman.'],
  ['Ihr kennt euch schon.', 'You already know each other.'],
  ['Du kannst höchstens ${n} Bekanntschaften gleichzeitig pflegen.', 'You can keep at most ${n} acquaintances at the same time.'],
  ['${f} möchte dich im Moment nicht sehen.', '${f} does not want to see you at the moment.'], ['Gib dem Ganzen Zeit.', 'Give it some time.'],
  ['Diese Bekanntschaft gibt es nicht (mehr).', 'This acquaintance does not exist (any more).'], ['Gerade lässt sich nichts unternehmen – warte ein paar Tage.', 'There is nothing to do right now – wait a few days.'],
  ['Das kennt hier niemand.', 'Nobody here knows that.'],
  ['Gib ${f} einen Moment – ihr habt euch gerade erst gesehen (noch ${n} Tage).', 'Give ${f} a moment – you have only just seen each other (${n} more days).'],
  ['Das hast du erst vor Kurzem getan – warte noch ${n} Tage.', 'You only did that recently – wait ${n} more days.'],
  ['Die Familie lädt erst ein, wenn ihr euch besser kennt (Sympathie ${n}).', 'The family will only invite you once you know each other better (affection ${n}).'],
  ['Du hast die Familie schon besucht.', 'You have already visited the family.'],
  ['Die Sympathie reicht noch nicht (${n} nötig).', 'The affection is not enough yet (${n} needed).'],
  ['Ihr kennt euch noch zu wenig – dazu braucht es mindestens ${n} gelungene Treffen.', 'You do not know each other well enough yet – that takes at least ${n} successful meetings.'],
  ['Lasst euch noch etwas Zeit (noch ${n} Tage).', 'Give it a little more time (${n} more days).'], ['Gib ${f} noch etwas Zeit (noch ${n} Tage).', 'Give ${f} a little more time (${n} more days).'],
  ['Die Familie hat große Vorbehalte.', 'The family has serious reservations.'], ['Ein Antrittsbesuch könnte das ändern.', 'A first visit could change that.'],
  // ---- Aktionen (Werben)
  ['Diese Anzeige ist nicht mehr aktuell.', 'This advertisement is no longer current.'],
  ['Ihr habt euch kennengelernt: ${f}.', 'You have met: ${f}.'], ['Pflege die Bekanntschaft unter „Familie“ – Treffen, Briefe und Gespräche lassen die Sympathie wachsen.', 'Nurture the acquaintance under “Family” – meetings, letters and conversations make the affection grow.'],
  ['${f} strahlt – das war genau das Richtige.', '${f} beams – that was exactly the right thing.'], ['${f} freut sich über die Mühe.', '${f} is pleased by the effort.'],
  ['${f} lächelt höflich – nett, aber nicht mehr.', '${f} smiles politely – nice, but no more.'], ['Das kam bei ${f} nicht gut an.', 'That did not go down well with ${f}.'],
  ['Sympathie ${d}.', 'Affection ${d}.'], ['${f} mag: ${label}.', '${f} likes: ${label}.'], ['${f} hört davon und ist ein wenig enttäuscht.', '${f} hears about it and is a little disappointed.'],
  ['Antrittsbesuch bei der Familie von ${f}: ${c}.', 'First visit to the family of ${f}: ${c}.'], ['Die Familie lernt dich kennen.', 'The family gets to know you.'],
  ['Ihr seid jetzt ein Paar: ${n}.', 'You are now a couple: ${n}.'],
  ['${f} möchte lieber Freunde bleiben.', '${f} would rather stay friends.'], ['Die Bekanntschaft endet.', 'The acquaintance ends.'],
  ['${f} braucht noch Zeit.', '${f} still needs time.'], ['Versuche es später noch einmal.', 'Try again later.'],
  ['Du beendest den Kontakt zu ${f}.', 'You end contact with ${f}.'],
  ['${n} lernt ${m} kennen.', '${n} gets to know ${m}.'], ['${a} und ${b} werden ein Paar.', '${a} and ${b} become a couple.'],
  // ---- Bekanntschaft: Meldungen im Tageslauf
  ['${f} trifft sich auch mit anderen', '${f} is also seeing other people'],
  ['Jemand anderes zeigt Interesse an ${f}.', 'Someone else is showing interest in ${f}.'], ['Melde dich mal wieder – ein Treffen hilft.', 'Get in touch again – a meeting helps.'],
  ['Bekanntschaften wollen gepflegt werden.', 'Acquaintances need nurturing.'],
  ['Wer sich lange nicht meldet, verliert an Sympathie. Eine Konkurrenz ist nur ein kleiner Rückschlag – aufgegeben wird niemand deswegen.', 'Anyone who stays out of touch for long loses affection. A rival is only a small setback – nobody is given up because of that.'],
  ['Triff dich bald wieder mit ihr oder ihm.', 'Meet her or him again soon.'],
  ['${f} meldet sich nicht mehr', '${f} no longer gets in touch'], ['Die Bekanntschaft ist eingeschlafen.', 'The acquaintance has fizzled out.'], ['Nach einer Weile kannst du es noch einmal versuchen.', 'After a while you can try again.'],
  // ---- Hochzeit, Ehevertrag
  ['Ihr habt geheiratet!', 'You got married!'], ['Die Hochzeit können wir uns noch nicht leisten.', 'We cannot afford the wedding yet.'], ['Hochzeit, Notar und Ringe können wir uns noch nicht leisten.', 'We cannot yet afford the wedding, the notary and the rings.'],
  ['Diesen Ehevertrag gibt es nicht.', 'There is no such marriage contract.'], ['Bitte Eheringe von Stufe 0 bis 3 wählen.', 'Please choose wedding rings from level 0 to 3.'],
  ['Die Familie von ${f} bringt den Familienbetrieb „${firm}“ ein.', 'The family of ${f} brings in the family business “${firm}”.'], ['Die Familie von ${f} schenkt euch ${home}.', 'The family of ${f} gives you ${home}.'],
  ['Die Familie von ${f} bringt ${amount} als Aussteuer ein.', 'The family of ${f} brings in ${amount} as a dowry.'],
  ['Eine Aussteuer gibt es nur einmal pro Leben.', 'A dowry is given only once in a lifetime.'],
  ['Der Familienbetrieb der Partnerfamilie würde nur zu Geld gemacht: Für ihn fehlen dir die Qualifikation oder ein freier Betriebsplatz.', 'The partner family’s business would only be turned into money: you lack the qualification or a free business slot for it.'],
  // ---- Scheidung
  ['Die Verfahrenskosten (Anwalt und Gericht) kannst du dir noch nicht leisten.', 'You cannot yet afford the costs of the proceedings (lawyer and court).'],
  ['Der Scheidungsantrag ist gestellt.', 'The divorce petition has been filed.'], ['Nach dem Trennungsjahr (${n} Tage) wird die Ehe geschieden.', 'After the year of separation (${n} days) the marriage will be dissolved.'],
  ['Es läuft kein Scheidungsantrag.', 'There is no divorce petition pending.'], ['Der Scheidungsantrag wurde zurückgezogen (die Verfahrenskosten sind verloren).', 'The divorce petition has been withdrawn (the costs of the proceedings are lost).'],
  ['Der Scheidungsantrag läuft bereits.', 'The divorce petition is already pending.'], ['Ihr seid nicht verheiratet.', 'You are not married.'],
  ['Mit einem Spieler lässt du dich über „Spieler → Beziehung“ scheiden.', 'With a player you get divorced via “Players → Relationship”.'],
  ['${a} und ${b} trennen sich und beantragen die Scheidung.', '${a} and ${b} separate and file for divorce.'],
  ['Scheidung von ${n}', 'Divorce from ${n}'], ['Scheidung von ${n}.', 'Divorce from ${n}.'], ['${n} Kind(er) ziehen mit.', '${n} child(ren) go with them.'],
  ['Laut Ehevertrag („${kn}“) gehen ${paid} an ${p}; ${n} Kind(er) ziehen mit.', 'According to the marriage contract (“${kn}”), ${paid} go to ${p}; ${n} child(ren) go with them.'],
  ['Laut Ehevertrag („${kn}“) gibt es keinen Ausgleich; ${n} Kind(er) ziehen mit.', 'According to the marriage contract (“${kn}”) there is no settlement; ${n} child(ren) go with them.'],
  ['Der Ehevertrag regelt, wer bei der Trennung was bekommt.', 'The marriage contract regulates who gets what in a separation.'],
  ['Zugewinn: Wer in der Ehe mehr dazugewonnen hat, gibt dem Partner die Hälfte des Unterschieds ab (inflationsbereinigt). Gütertrennung und Mitgift kennen keinen Ausgleich; bei der Mitgift fällt die Aussteuer an die Familie zurück.', 'Accrued gains: whoever gained more during the marriage gives the partner half of the difference (adjusted for inflation). Separation of property and dowry have no settlement; with a dowry the dowry reverts to the family.'],
  ['Die Kinder, die gehen, erben nicht mehr bei dir.', 'The children who leave no longer inherit from you.'],
  ['Mitgift zurückgegeben', 'Dowry returned'], ['An die Familie von ${p} gehen zurück: ${list}.', 'Returned to the family of ${p}: ${list}.'],
  ['Geld-Aussteuer', 'cash dowry'],
  // ---- Kinder im Familienbetrieb
  ['Die Einarbeitung ist gerade ausgeschaltet.', 'Training in the family business is switched off at the moment.'], ['Kind nicht gefunden.', 'Child not found.'], ['Das Kind lebt nicht bei dir.', 'The child does not live with you.'],
  ['Dein Kind wird schon eingearbeitet.', 'Your child is already being trained.'], ['Zur Einarbeitung muss ein Kind mindestens ${n} Jahre alt sein.', 'A child must be at least ${n} years old to be trained in the business.'],
  ['Erst die Schule beenden.', 'Finish school first.'], ['Dein Kind ist schon in Ausbildung oder Studium.', 'Your child is already in training or studying.'], ['Der Betrieb steht leer.', 'The business is vacant.'],
  ['In diesem Betrieb werden schon genug Kinder eingearbeitet.', 'Enough children are already being trained in this business.'],
  ['Für diesen Betrieb braucht dein Kind ein Studium (Gymnasium und Studium über die Familienseite).', 'For this business your child needs a degree (grammar school and university via the family page).'],
  ['Diesen Beruf gibt es gerade nicht.', 'This occupation does not exist at the moment.'], ['Beruf nicht gefunden.', 'Occupation not found.'],
  ['${f} beginnt eine Lehre im Familienbetrieb „${firm}“.', '${f} starts an apprenticeship in the family business “${firm}”.'], ['${f} arbeitet ab jetzt im Familienbetrieb „${firm}“ mit.', '${f} now works in the family business “${firm}”.'],
  ['${n} beginnt im Familienbetrieb „${firm}“.', '${n} starts in the family business “${firm}”.'],
  ['${f} arbeitet nicht mehr im Familienbetrieb mit.', '${f} no longer works in the family business.'], ['Dieses Kind wird nicht eingearbeitet.', 'This child is not being trained.'],
  ['${f} ist bereit für die Nachfolge', '${f} is ready to take over'],
  ['${f} kennt den Betrieb „${firm}“ jetzt von Grund auf.', '${f} now knows the business “${firm}” inside out.'],
  ['Beim Erben wird der Betrieb mit Abschlag auf den Pflichtanteil angerechnet, und mit einer Übergabe zu Lebzeiten kannst du ihn schon jetzt weitergeben.', 'When inherited, the business counts towards the statutory share at a discount, and with a handover during your lifetime you can pass it on right now.'],
  ['Dein Kind arbeitet seit Jahren im Familienbetrieb mit.', 'Your child has been working in the family business for years.'],
  ['Ein bereiter Nachfolger behält den Betrieb leichter: Er wird im Pflichtanteil mit einem Abschlag angerechnet, und die Berufserfahrung bleibt dem Erben.', 'A ready successor keeps the business more easily: it counts towards the statutory share at a discount, and the work experience stays with the heir.'],
  ['Du kannst den Betrieb schon zu Lebzeiten übergeben (Familie → Kind).', 'You can hand the business over during your lifetime (Family → child).'],
  ['${n} ist bereit, den Betrieb „${firm}“ zu übernehmen.', '${n} is ready to take over the business “${firm}”.'],
  // ---- Übergabe zu Lebzeiten
  ['Die Übergabe zu Lebzeiten ist gerade ausgeschaltet.', 'Handover during your lifetime is switched off at the moment.'], ['Eine Übergabe zu Lebzeiten ist ab ${n} Jahren möglich.', 'A handover during your lifetime is possible from age ${n}.'],
  ['Das Kind muss mindestens ${n} Jahre alt sein.', 'The child must be at least ${n} years old.'], ['Unternehmen nicht gefunden.', 'Business not found.'], ['Ein leerstehender Betrieb lässt sich nicht übergeben.', 'A vacant business cannot be handed over.'],
  ['Das Kind braucht die Qualifikation für diesen Betrieb – arbeitet es ein, erlernt es den Beruf.', 'The child needs the qualification for this business – train the child in it or have them learn the trade.'],
  ['Die nächste Übergabe ist erst in ${n} Tagen möglich.', 'The next handover is possible in ${n} days.'], ['Dieses Kind führt schon genug Betriebe.', 'This child already runs enough businesses.'],
  ['Ein börsennotierter Betrieb lässt sich nicht verschenken.', 'A listed company cannot be given away.'], ['Während des Umbaus lässt sich der Betrieb nicht übergeben.', 'The business cannot be handed over during renovation.'],
  ['Im Betrieb arbeiten Mitspieler – beende erst deren Arbeitsverhältnisse.', 'Other players work in the business – end their employment first.'], ['Beende zuerst die Lieferverträge des Betriebs.', 'End the business’s supply contracts first.'],
  ['Steuer und Gebühren der Übergabe kannst du dir noch nicht leisten.', 'You cannot yet afford the tax and fees for the handover.'],
  ['${n} übergibt „${firm}“ an ${c}.', '${n} hands “${firm}” over to ${c}.'],
  ['„${firm}“ gehört jetzt ${f}.', '“${firm}” now belongs to ${f}.'], ['Steuer ${tax}, Gebühren ${fee}.', 'Tax ${tax}, fees ${fee}.'], ['Du bist jetzt im Ruhestand.', 'You are retired now.'],
  ['Nachfolge geregelt', 'Succession settled'],
  ['Du führst „${firm}“ weiter – eingearbeitet, qualifiziert und mit der Erfahrung aus den Jahren im Betrieb.', 'You carry on “${firm}” – trained, qualified and with the experience of your years in the business.'],
  ['Dein Elternteil hat dich im Familienbetrieb eingearbeitet.', 'Your parent trained you in the family business.'],
  ['Der Betrieb bleibt in der Familie und zählt jetzt eine Generation mehr: das bringt Kundenbindung und Ansehen.', 'The business stays in the family and now counts one more generation: that brings customer loyalty and standing.'],
  ['Führe ihn weiter und gib ihn irgendwann an deine Kinder weiter.', 'Carry it on and hand it on to your children some day.'],
  // ---- Traditionsbetrieb
  ['${c} wird zum „${nm}“.', '${c} becomes a “${nm}”.'],
  ['Seit ${y} Jahren gehört der Betrieb der Familie; ${g} Generationen führen ihn.', 'For ${y} years the business has belonged to the family; ${g} generations have run it.'], ['Kunden schätzen das: etwas mehr Umsatz und Ansehen.', 'Customers appreciate that: a little more revenue and standing.'],
  ['Ein Familienbetrieb über Generationen genießt Vertrauen.', 'A family business over generations enjoys trust.'],
  ['Die Kundenbindung bringt einen kleinen, gedeckelten Umsatzzuwachs, dazu etwas Ansehen.', 'Customer loyalty brings a small, capped increase in revenue and a little standing.'],
  ['Führe den Betrieb in die nächste Generation, um die nächste Stufe zu erreichen.', 'Lead the business into the next generation to reach the next level.'],
  // ---- Dynastie
  ['Familienrang: ${nm}', 'Family rank: ${nm}'], ['Die Familie ${last} gilt jetzt als „${nm}“.', 'The ${last} family is now regarded as “${nm}”.'],
  ['Generationen, Familienbetriebe, Ansehen und Zusammenhalt zahlen sich aus.', 'Generations, family businesses, standing and cohesion pay off.'],
  ['Die Dynastie-Wertung misst, wie fest die Familie über Generationen steht.', 'The dynasty rating measures how firmly the family stands across generations.'],
  ['Sie wächst mit Generationen, Familienbetrieben und Traditionsbetrieben, Vermögen, Ansehen, gut ausgebildeten Kindern und einer beständigen Ehe.', 'It grows with generations, family businesses and traditional businesses, wealth, standing, well-educated children and a lasting marriage.'],
  ['Im Charakterblatt siehst du, was dir zur nächsten Stufe fehlt.', 'On the character sheet you see what is missing for the next level.'],
  ['Die Familie ${last} gilt jetzt als „${nm}“.', 'The ${last} family is now regarded as “${nm}”.'],
  // ---- Ansehen
  ['Hochzeit in eine angesehene Familie', 'Marriage into a respected family'], ['Du hast in eine Familie mit gutem Namen eingeheiratet. Das spricht sich herum.', 'You have married into a family with a good name. Word gets around.'],
  ['Traditionsbetrieb', 'Traditional business'], ['Ein Betrieb, der über Generationen in der Familie bleibt, genießt das Vertrauen der Kunden.', 'A business that stays in the family for generations enjoys the trust of its customers.'],
  ['Nachfolge geregelt', 'Succession settled'], ['Du hast einen Betrieb rechtzeitig an das nächste Familienmitglied übergeben. Arbeitsplätze bleiben sicher.', 'You handed a business over to the next family member in good time. Jobs stay secure.'],
  // ---- Tagesblatt
  ['Hochzeit', 'Wedding'], ['${who} und ${p} haben in ${where} geheiratet.', '${who} and ${p} got married in ${where}.'],
  ['Nachfolge', 'Succession'], ['${who} übergibt „${note}“ in ${where} an die nächste Generation.', '${who} hands “${note}” in ${where} over to the next generation.'],
  ['Traditionsbetrieb', 'Traditional business'], ['„${note}“ in ${where} ist jetzt ein ${nm}.', '“${note}” in ${where} is now a ${nm}.'],
  ['Familie', 'Family'], ['Die Familie ${last} gilt in ${where} jetzt als „${note}“.', 'The ${last} family is now regarded as “${note}” in ${where}.'],
  // ---- Aufgaben, Freischaltung, Hinweise
  ['Heirate – mit Ehevertrag', 'Get married – with a marriage contract'],
  ['Eine Ehe ist auch ein Vertrag: Der Güterstand regelt, was bei einer Scheidung gilt.', 'A marriage is also a contract: the property regime governs what applies in a divorce.'],
  ['Im Hochzeitsdialog siehst du Zugewinn, Gütertrennung und Mitgift im Vergleich – dazu die Aussteuer, die dir die Familie mitbringt.', 'In the wedding dialogue you see accrued gains, separation of property and dowry compared – plus the dowry the family brings you.'],
  ['Arbeite ein Kind im Familienbetrieb ein', 'Train a child in the family business'],
  ['Kinder, die den Betrieb kennen, können ihn später führen: Sie lernen den Beruf, ihre Talente wachsen, und der Betrieb bleibt in der Familie – die Grundlage für Traditionsbetrieb und Dynastie.', 'Children who know the business can run it later: they learn the trade, their talents grow, and the business stays in the family – the basis for a traditional business and a dynasty.'],
  ['Nachfolge & Dynastie', 'Succession & dynasty'], ['du eine Partnerin oder einen Partner, ein Kind oder einen Betrieb hast', 'you have a partner, a child or a business'],
  ['${n} wartet auf deinen Antrag', '${n} is waiting for your proposal'],
  ['Ihr kennt euch gut genug: Die Chance liegt bei etwa ${n} %.', 'You know each other well enough: the chance is about ${n} %.'], ['Ein Antrittsbesuch bei der Familie stimmt sie freundlicher.', 'A first visit to the family makes them friendlier.'],
  ['Melde dich bei ${n}', 'Get in touch with ${n}'],
  ['Wer sich lange nicht meldet, wird vergessen.', 'Anyone who stays out of touch for long is forgotten.'], ['Ein Treffen oder ein Brief hält die Bekanntschaft lebendig.', 'A meeting or a letter keeps the acquaintance alive.'],
  ['${n} im Familienbetrieb einarbeiten', 'Train ${n} in the family business'],
  ['Wer den Betrieb kennt, kann ihn später führen.', 'Whoever knows the business can run it later.'], ['Die Talente wachsen, und der Betrieb bleibt in der Familie.', 'Talents grow, and the business stays in the family.'],
  ['Zur Familie', 'To the family'],
];
module.exports = pairs;
