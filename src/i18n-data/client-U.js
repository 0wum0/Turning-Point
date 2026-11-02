'use strict';
/**
 * Englische Texte der Oberfläche: Werben, Ehe und Familienunternehmen – Bekanntschaften, Hochzeit mit Ehevertrag und Ringen, Scheidung,
 * Kinder im Familienbetrieb, Übergabe zu Lebzeiten, Traditionsbetrieb, Dynastie-Wertung, Glossar, Einsteiger-Hinweise.
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz]. In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 * Namen und Texte der Katalogeinträge (Vorlieben, Aktionen, Eheverträge, Ringe, Stufen) kommen schon übersetzt vom Server (messages-U.js).
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

T('Stufe {n} von 5', 'Level $1 of 5');
T('{} kaufen?', 'Buy $1?');

X([
  // Bekanntschaften
  ['Bekanntschaften', 'Acquaintances'], ['Sympathie', 'Affection'], ['Vorlieben:', 'Likes:'], ['Familienmeinung', 'Family opinion'], ['Familienmeinung:', 'Family opinion:'],
  ['Bekannt', 'Acquainted'], ['Verabredet', 'Dating'], ['Bereit für den Antrag', 'Ready to propose'],
  ['gelungene Treffen · seit', 'successful meetings · since'], ['zuletzt gesehen vor', 'last seen'], ['Tagen', 'days ago'], ['Jahre', 'years'],
  ['Beste Wahl', 'Best choice'], ['Antrittsbesuch', 'First visit'], ['Antrag stellen', 'Propose'], ['Kontakt beenden', 'End contact'], ['Zuletzt:', 'Latest:'], ['T.', 'd'],
  ['Noch unbekannt – probiere verschiedene Aufmerksamkeiten aus', 'Not known yet – try different gestures'], ['So denkt die Familie über dich', 'What the family thinks of you'], ['Herkunftsfamilie', 'Family background'], ['Aufmerksamkeiten', 'Gestures'],
  ['Die Familie kennenlernen: sie lässt dich in die Herkunft blicken und stimmt freundlicher.', 'Get to know the family: it lets you see the background and makes them friendlier.'],
  ['Frag, ob ihr ein Paar werden wollt.', 'Ask whether you want to become a couple.'],
  ['Du lebst allein. In der Zeitung (Kontakte) findest du Menschen, die jemanden suchen. Ein erstes Treffen ist der Anfang – daraus wächst eine Bekanntschaft.', 'You live alone. In the newspaper (contacts) you find people who are looking for someone. A first meeting is the beginning – an acquaintance grows from it.'],
  ['Statt eines einzigen Wurfs gibt es jetzt einen Verlauf: Kennenlernen, Treffen, Aufmerksamkeiten, Gespräche – und irgendwann den Antrag.', 'Instead of a single throw there is now a course of events: getting to know each other, meetings, gestures, conversations – and eventually the proposal.'],
  ['Jede Person hat zwei Vorlieben (zum Beispiel Kultur oder Natur). Was ihr gefällt, siehst du an der Reaktion. Charme, Bildung und Verhandlungsgeschick helfen, dein Auftreten und dein Rang auch. Zwischen den Treffen braucht es ein paar Tage Pause; wer sich zu lange nicht meldet, wird vergessen.', 'Everyone has two likes (for example culture or nature). You can tell what they like from the reaction. Charm, education and negotiating skill help, and so do your appearance and rank. Meetings need a few days’ pause between them; anyone who stays out of touch too long is forgotten.'],
  ['Tippe auf „Beste Wahl“ – wir wählen die passende Aufmerksamkeit für dich. Mit einem Antrittsbesuch lernst du die Familie kennen.', 'Tap “Best choice” – we pick the fitting gesture for you. With a first visit you get to know the family.'],
  ['Werben', 'Courting'], ['Kontakt beenden?', 'End contact?'], ['Beenden', 'End'],
  ['Ihr verliert den Kontakt; nach einer Weile könnt ihr es noch einmal versuchen.', 'You lose touch; after a while you can try again.'],
  ['Kontakte ansehen', 'View contacts'],
  // Hochzeit und Ehevertrag
  ['Hochzeit mit', 'Wedding with'], ['Die Familie:', 'The family:'], ['Ehevertrag', 'Marriage contract'], ['Eheringe', 'Wedding rings'], ['Hochzeit', 'Wedding'], ['Gesamt:', 'Total:'], ['Heiraten', 'Get married'], ['Abbrechen', 'Cancel'],
  ['Wähle den Güterstand und die Eheringe. Wer nichts wählt, heiratet im gesetzlichen Güterstand ohne Ringe.', 'Choose the property regime and the wedding rings. If you choose nothing, you marry under the statutory regime without rings.'],
  ['Der Güterstand regelt, wer bei einer Scheidung was bekommt.', 'The property regime regulates who gets what in a divorce.'],
  ['Zugewinngemeinschaft: Wer in der Ehe mehr dazugewonnen hat (inflationsbereinigt), gibt dem Partner die Hälfte des Unterschieds ab. Gütertrennung: Jeder behält das Seine, die Familie gibt aber nur die halbe Aussteuer. Mitgift: Die Familie bringt mehr ein, bei einer Scheidung fällt die Mitgift an sie zurück.', 'Community of accrued gains: whoever gained more during the marriage (adjusted for inflation) gives the partner half of the difference. Separation of property: everyone keeps their own, but the family gives only half the dowry. Dowry: the family contributes more; in a divorce the dowry reverts to them.'],
  ['Unternehmer wählen oft die Gütertrennung, damit der Betrieb bei einer Scheidung nicht geteilt wird.', 'Entrepreneurs often choose separation of property so that the business is not split in a divorce.'],
  ['Notar:', 'Notary:'], ['Kein Notar nötig', 'No notary needed'], ['Keine Aussteuer.', 'No dowry.'], ['Keine Aussteuer', 'No dowry'], ['Aussteuer:', 'Dowry:'], ['Aussteuer', 'Dowry'], ['Aussteuer: der Familienbetrieb', 'Dowry: the family business'], ['Aussteuer: eine Wohnung', 'Dowry: a flat'],
  ['(Wert', '(value'], [')', ')'], ['(durch dein Vermögen begrenzt)', '(limited by your wealth)'], ['Eine Aussteuer gibt es nur einmal pro Leben.', 'A dowry is given only once in a lifetime.'],
  ['Zählt als Schmuck: Auftreten +', 'Counts as jewellery: appearance +'], ['. Nicht verkäuflich, wird vererbt.', '. Not for sale, passed on to the heir.'],
  ['Herkunft:', 'Background:'], ['Ehevertrag:', 'Marriage contract:'], ['bei Scheidung zu zahlen (heute):', 'payable in a divorce (today):'],
  ['Diese Ehe wurde vor dem Ehevertrag geschlossen. Bei einer Trennung gilt die alte Regel: Die Hälfte des Vermögens geht an den Partner.', 'This marriage was concluded before the marriage contract existed. In a separation the old rule applies: half of the wealth goes to the partner.'],
  ['Heiraten – mit Ehevertrag', 'Get married – with a marriage contract'], ['Scheidung beantragen', 'File for divorce'], ['Nach dem Trennungsjahr wird die Ehe geschieden.', 'After the year of separation the marriage is dissolved.'],
  ['Nach einem Trennungsjahr wird die Ehe geschieden.', 'After a year of separation the marriage is dissolved.'], ['Antrag zurückziehen', 'Withdraw petition'], ['noch', 'still'], ['Scheidung beantragen?', 'File for divorce?'], ['Antrag stellen', 'Propose'],
  ['Nach einem Trennungsjahr wird die Ehe geschieden. Der Ehevertrag regelt dann, wer was bekommt; die Verfahrenskosten sind sofort fällig.', 'After a year of separation the marriage is dissolved. The marriage contract then regulates who gets what; the costs of the proceedings are due immediately.'],
  ['Eheringe zählen als Schmuck', 'Wedding rings count as jewellery'],
  ['deine Eheringe zählen als Schmuck, lassen sich nicht verkaufen und gehen als Erbstück an das erbende Kind.', 'your wedding rings count as jewellery, cannot be sold and pass to the heir as an heirloom.'],
  ['– deine Eheringe zählen als Schmuck, lassen sich nicht verkaufen und gehen als Erbstück an das erbende Kind.', '– your wedding rings count as jewellery, cannot be sold and pass to the heir as an heirloom.'],
  // Kinder im Familienbetrieb
  ['Im Familienbetrieb', 'In the family business'], ['Lehre', 'Apprenticeship'], ['Mitarbeit', 'Working in the business'], ['Nachfolger bereit', 'Successor ready'], ['Tage im Betrieb', 'days in the business'], ['(bereit nach', '(ready after'], ['Talent', 'Talent'],
  ['Einarbeitung beenden', 'End training'], ['führt den Betrieb', 'runs the business'], ['Wert', 'Value'], ['Kasse', 'Cash'], ['Altenteil bisher', 'Retirement share so far'], ['Im Familienbetrieb einarbeiten', 'Train in the family business'], ['Betrieb übergeben', 'Hand over a business'],
  ['Steuer', 'Tax'], ['Gebühren', 'Fees'], ['Verschonung', 'Relief'], ['Freibetrag', 'Allowance'], ['Einarbeiten:', 'Training:'], ['Übergabe an', 'Handover to'],
  ['Familienbetrieb', 'Family business'],
  ['Kinder können im eigenen Betrieb eingearbeitet werden: Sie lernen den Beruf (Lehre) oder arbeiten als Fachkraft mit, ihre Talente wachsen, und die Berufserfahrung bleibt ihnen als Erben.', 'Children can be trained in your own business: they learn the trade (apprenticeship) or work as skilled staff, their talents grow, and the work experience stays with them as heirs.'],
  ['Die Vergütung zahlt der Betrieb. Ein bereiter Nachfolger bekommt den Betrieb im Pflichtanteil mit Abschlag angerechnet.', 'The business pays the remuneration. A ready successor has the business credited to the statutory share at a discount.'],
  ['Ab einem Alter von 55 Jahren kannst du einen Betrieb schon zu Lebzeiten übergeben – mit Steuer und Gebühren, aber ohne Streit um den Nachlass.', 'From age 55 you can hand a business over during your lifetime – with tax and fees, but without a dispute over the estate.'],
  ['Wähle den Betrieb. Qualifizierte Kinder arbeiten als Fachkraft mit, die übrigen machen eine Lehre im Betrieb. Der Betrieb zahlt die Vergütung.', 'Choose the business. Qualified children work as skilled staff, the others do an apprenticeship in the business. The business pays the remuneration.'],
  ['Der Betrieb gehört danach deinem Kind und läuft weiter. Du erhältst als Altenteil', 'The business then belongs to your child and keeps running. You receive as a retirement share'],
  ['des Tagesgewinns. Die Übergabe wird im Pflichtanteil angerechnet.', 'of the daily profit. The handover is credited to the statutory share.'],
  // Dynastie
  ['Dynastie-Wertung', 'Dynasty rating'], ['Dynastie-Wertung:', 'Dynasty rating:'], ['Stufe', 'Level'], ['von 5', 'of 5'], ['Generation', 'Generation'], ['Punkte', 'points'], ['Noch', 'Still'], ['Punkte bis', 'points until'], ['Höchste Stufe erreicht.', 'Highest level reached.'],
  ['Generationen', 'Generations'], ['Familienbetriebe', 'Family businesses'], ['Vermögen', 'Wealth'], ['Ansehen und Titel', 'Standing and titles'], ['Kinder', 'Children'], ['Beständige Ehe', 'Lasting marriage'], ['Familienerbe', 'Family legacy'],
  ['Jahre in Familienhand', 'years in family hands'], ['. Generation', '. generation'], ['Scheidungen:', 'Divorces:'],
  ['Jahren in zweiter Generation gilt ein Betrieb als Traditionsbetrieb: etwas mehr Kundenbindung (höchstens', 'years in the second generation a business counts as a traditional business: slightly more customer loyalty (at most'],
  ['Umsatz) und Ansehen.', 'revenue) and standing.'], ['Ab', 'From'],
  ['Du führst noch keinen Betrieb. Ein Betrieb, der über Generationen in der Familie bleibt, wird zum Traditionsbetrieb.', 'You do not run a business yet. A business that stays in the family for generations becomes a traditional business.'],
  ['Die Dynastie-Wertung misst, wie fest deine Familie über Generationen steht: wie viele Generationen schon, wie viele Familienbetriebe und Traditionsbetriebe, Vermögen, Ansehen und Titel, gut ausgebildete Kinder und eine beständige Ehe.', 'The dynasty rating measures how firmly your family stands across generations: how many generations already, how many family and traditional businesses, wealth, standing and titles, well-educated children and a lasting marriage.'],
  ['Ein Teil davon wird an die nächste Generation weitergegeben (Familienerbe). Die Wertung bringt keine Sperren; sie zeigt, wie weit die Familie gekommen ist, und steht in der Rangliste „Dynastie“.', 'Part of it is passed on to the next generation (family legacy). The rating locks nothing; it shows how far the family has come and appears in the “Dynasty” ranking.'],
  ['Arbeite Kinder im Familienbetrieb ein, halte die Betriebe in der Familie und pflege Ansehen und Zusammenhalt.', 'Train children in the family business, keep the businesses in the family and nurture standing and cohesion.'],
  ['Dynastie', 'Dynasty'],
  // Familienseite, Zeitung, Einsteiger
  ['Kennenlernen', 'Get to know'],
  ['Ein erstes Treffen kostet eine kleine Aufmerksamkeit und ist der Anfang einer Bekanntschaft. Wie es weitergeht, entscheidest du unter „Familie“: Treffen, Briefe, Gespräche – und irgendwann der Antrag.', 'A first meeting costs a small gesture and is the beginning of an acquaintance. What happens next you decide under “Family”: meetings, letters, conversations – and eventually the proposal.'],
  ['Du pflegst gerade Bekanntschaften.', 'You are currently nurturing acquaintances.'], ['Zur Familie', 'To the family'],
  ['Partner, Kinder und Erben: Sie sind die Zukunft deines Lebenswerks. Hier wirbst du um eine Partnerin oder einen Partner, heiratest mit Ehevertrag und arbeitest Kinder im Familienbetrieb ein.', 'Partner, children and heirs: they are the future of your life’s work. Here you court a partner, marry with a marriage contract and train children in the family business.'],
  ['Zeig mir die nächsten Schritte', 'Show me the next steps'],
  ['Tippe auf „Beste Wahl“, um die Bekanntschaft zu pflegen – oder auf „Heiraten“, wenn ihr schon ein Paar seid.', 'Tap “Best choice” to nurture the acquaintance – or “Get married” if you are already a couple.'],
  ['Tippe auf „Heiraten – mit Ehevertrag“ und vergleiche die Güterstände.', 'Tap “Get married – with a marriage contract” and compare the property regimes.'],
  ['Tippe bei einem Kind auf „Im Familienbetrieb einarbeiten“.', 'On a child, tap “Train in the family business”.'],
  ['Nachfolge & Dynastie', 'Succession & dynasty'],
]);

// Glossar
X([
  ['Sympathie', 'Affection'], ['Sympathie', 'Affection'], ['Familienmeinung', 'Family opinion'], ['Antrittsbesuch', 'First visit'], ['Ehevertrag', 'Marriage contract'], ['Zugewinn', 'Accrued gains'], ['Gütertrennung', 'Separation of property'], ['Aussteuer und Mitgift', 'Dowry'],
  ['Eheringe', 'Wedding rings'], ['Einarbeitung im Familienbetrieb', 'Training in the family business'], ['Nachfolger', 'Successor'], ['Übergabe zu Lebzeiten', 'Handover during your lifetime'], ['Altenteil', 'Retirement share'], ['Traditionsbetrieb', 'Traditional business'], ['Dynastie-Wertung', 'Dynasty rating'],
  ['Wie gern dich jemand mag (0 bis 100). Sie wächst mit Treffen, Briefen und Gesprächen, die der Person gefallen, und sinkt bei Fehlgriffen oder wenn du dich lange nicht meldest. Für den Antrag braucht es genug Sympathie und ein paar gelungene Treffen.', 'How much someone likes you (0 to 100). It grows with meetings, letters and conversations the person enjoys, and falls with misjudgements or when you stay out of touch for long. The proposal needs enough affection and a few successful meetings.'],
  ['Was die Familie deiner Bekanntschaft von dir hält. Ansehen, Rang, Beruf, Betrieb, Auftreten und ein Antrittsbesuch heben sie. Sie beeinflusst die Chance beim Antrag und die Höhe der Aussteuer.', 'What the family of your acquaintance thinks of you. Standing, rank, job, business, appearance and a first visit raise it. It influences the chance at the proposal and the size of the dowry.'],
  ['Du besuchst die Familie deiner Bekanntschaft. Das kostet etwas, stimmt die Familie freundlicher und verrät dir ihre Herkunft und die Vorlieben der Person.', 'You visit the family of your acquaintance. It costs something, makes the family friendlier and reveals their background and the person’s likes.'],
  ['Ein Vertrag beim Notar (oder der gesetzliche Standard), der regelt, was bei einer Scheidung gilt: Zugewinngemeinschaft, Gütertrennung oder Mitgift. Du wählst ihn beim Heiraten.', 'A contract at the notary (or the statutory standard) that regulates what applies in a divorce: community of accrued gains, separation of property or dowry. You choose it when you marry.'],
  ['Der Zuwachs deines Vermögens seit der Hochzeit, inflationsbereinigt. Bei einer Scheidung gibt der Partner mit dem größeren Zuwachs die Hälfte des Unterschieds ab. Aussteuer und Erbe zählen nicht als Zugewinn.', 'The growth of your wealth since the wedding, adjusted for inflation. In a divorce the partner with the larger gain gives half of the difference. Dowry and inheritance do not count as gains.'],
  ['Jeder behält sein Vermögen, bei einer Scheidung gibt es keinen Ausgleich. Die Familie des Partners gibt dafür nur die halbe Aussteuer. Unternehmer wählen sie oft, damit der Betrieb nicht geteilt wird.', 'Everyone keeps their wealth, there is no settlement in a divorce. In return the partner’s family gives only half the dowry. Entrepreneurs often choose it so that the business is not split.'],
  ['Was die Familie des Partners zur Hochzeit mitbringt: Geld, eine Wohnung oder bei Unternehmerfamilien ein Familienbetrieb. Sie hängt von Herkunft und Familienmeinung ab, ist durch dein Vermögen begrenzt und gibt es nur einmal pro Leben. Bei der Mitgift fällt sie bei einer Scheidung zurück.', 'What the partner’s family brings to the wedding: money, a flat or, for business families, a family business. It depends on background and family opinion, is limited by your wealth and is given only once in a lifetime. With a dowry contract it reverts in a divorce.'],
  ['Trauringe in drei Stufen. Sie zählen als Schmuck für dein Auftreten, lassen sich nicht verkaufen und gehen als Erbstück an das erbende Kind.', 'Wedding rings in three levels. They count as jewellery for your appearance, cannot be sold and pass to the heir as an heirloom.'],
  ['Ein Kind lernt im eigenen Betrieb: erst als Lehrling, später als Fachkraft. Seine Talente wachsen, der Betrieb zahlt die Vergütung, und die Berufserfahrung bleibt dem Erben.', 'A child learns in your own business: first as an apprentice, later as skilled staff. Their talents grow, the business pays the remuneration, and the work experience stays with the heir.'],
  ['Ein Kind, das lange genug im Betrieb mitgearbeitet hat. Der Betrieb wird ihm im Pflichtanteil mit Abschlag angerechnet, und es kann ihn leichter weiterführen.', 'A child who has worked in the business long enough. The business is credited to their statutory share at a discount, and they can carry it on more easily.'],
  ['Ab etwa 55 Jahren kannst du einen Betrieb schon zu Lebzeiten an ein volljähriges, qualifiziertes Kind übergeben. Es fallen Schenkungsteuer (mit Freibetrag und Verschonung für Familienunternehmen) und Gebühren an; die Übergabe wird im Pflichtanteil angerechnet.', 'From about age 55 you can hand a business over during your lifetime to an adult, qualified child. Gift tax (with an allowance and relief for family businesses) and fees apply; the handover is credited to the statutory share.'],
  ['Nach einer Übergabe bekommst du einen Teil des Tagesgewinns des Betriebs als Versorgung, solange du lebst.', 'After a handover you receive a part of the business’s daily profit as support for as long as you live.'],
  ['Ein Betrieb, der über Generationen in der Familie bleibt: nach 15 Jahren in zweiter Generation, 50 Jahren als Traditionsunternehmen, 100 Jahren als Jahrhundertunternehmen. Er genießt etwas mehr Kundenbindung (gedeckelt) und Ansehen.', 'A business that stays in the family for generations: after 15 years in the second generation, 50 years as a traditional company, 100 years as a centenary company. It enjoys slightly more customer loyalty (capped) and standing.'],
  ['Eine Wertung von 0 bis 100 und fünf Stufen, die zeigt, wie fest deine Familie über Generationen steht: Generationen, Familienbetriebe, Vermögen, Ansehen, Kinder und eine beständige Ehe. Ein Teil wird an die nächste Generation weitergegeben.', 'A rating from 0 to 100 and five levels that shows how firmly your family stands across generations: generations, family businesses, wealth, standing, children and a lasting marriage. Part of it is passed on to the next generation.'],
]);

module.exports = { exact, patterns };
