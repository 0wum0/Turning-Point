'use strict';
/**
 * Englische Texte der Oberfläche: Betrieb 2.0 – Ausbaumodule, Betriebsklima, Führungsaktionen, Innenraum des Betriebs, Glossar, Hinweise.
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz]. In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 * Namen und Texte der Module kommen schon übersetzt vom Server (messages-S.js).
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

// ---- Muster
T('Wieder möglich in {n} Tagen', 'Possible again in $1 days');
T('{} ausbauen?', 'Upgrade $1?'); T('{} zurückbauen?', 'Dismantle $1?');
T('{}: {} Es kostet {} und danach täglich etwas Unterhalt.', '$1: $2 It costs $3 and then a little upkeep every day.');
T('Ausbauen: {}', 'Upgrade: $1');
T('Gibt es erst ab {n}', 'Not available until $1');
T('Vorrat: {} von {n} Tagen', 'Stock: $1 of $2 days');
T('Brandrisiko: ca. {} % pro Jahr', 'Fire risk: approx. $1 % per year');
T('{} pro Tag', '$1 per day');
T('Betriebsklima: {} ({n})', 'Work climate: $1 ($2)');
T('Wirkung auf den Umsatz: {} %', 'Effect on sales: $1 %');
T('Wirkung auf den Umsatz: {}{} %', 'Effect on sales: $1$2 %');
T('Stufe {n} von {n}', 'Level $1 of $2');
T('schützt vor: Einbruch, Feuer, Betriebsunterbrechung', 'protects against: burglary, fire, business interruption');

// ---- fest
X([
  // Karte „Ausbau“
  ['Ausbau', 'Upgrades'],
  ['Module machen einen Betrieb sicherer und leistungsfähiger: Das Lager hält Zutaten vor, der Brandschutz senkt die Gefahr eines Feuers, der Schutz wehrt Diebe ab, die Arbeitsplätze heben die Stimmung.', 'Modules make a business safer and more productive: the warehouse keeps ingredients in stock, fire protection lowers the risk of a fire, security repels thieves and the workplaces lift the mood.'],
  ['Jedes Modul hat drei Stufen. Sie kosten einmalig Geld (die Baufirmen deiner Stadt verdienen daran) und täglich etwas Unterhalt.', 'Each module has three levels. They cost money once (the construction firms of your town earn from it) and a little upkeep every day.'],
  ['Beginne mit der kleinsten Stufe. Eine Betriebsversicherung schützt zusätzlich vor den Folgen eines Brandes.', 'Start with the smallest level. Business insurance also protects against the consequences of a fire.'],
  ['Ausbau und Betriebsklima', 'Upgrades and work climate'],
  ['Hohes Brandrisiko', 'High fire risk'],
  ['Nach einem Brand steht der Betrieb still: noch', 'After a fire the business stands idle: another'],
  ['Tage.', 'days.'],
  ['Noch nicht gebaut', 'Not built yet'],
  ['Vorrat:', 'Stock:'], ['Vorrat spart Einkauf', 'Stock saves purchases'], ['Preise günstig: Vorrat füllt sich', 'Prices low: stock is filling up'], ['Vorrat überbrückt eine Lücke', 'Stock bridges a gap'],
  ['Unterhalt:', 'Upkeep:'], ['pro Tag', 'per day'],
  ['Ausbauen:', 'Upgrade:'], ['Höchste Stufe', 'Highest level'], ['Rückbau', 'Dismantle'], ['Rückbau ohne Erstattung', 'Dismantle without refund'], ['Stufen ansehen', 'View levels'],
  ['Brandrisiko:', 'Fire risk:'], ['% pro Jahr', '% per year'], ['Wie wahrscheinlich ein Betriebsbrand ist', 'How likely a business fire is'],
  ['Betriebsversicherung aktiv', 'Business insurance active'], ['Rabatt', 'Discount'], ['%', '%'],
  ['Die Betriebsversicherung zahlt den größten Teil des Schadens', 'The business insurance pays most of the damage'],
  ['Betriebsversicherung abschließen', 'Take out business insurance'],
  ['Schließt die Betriebsversicherung für alle deine Betriebe ab', 'Takes out the business insurance for all your businesses'],
  // Betriebsklima
  ['Betriebsklima', 'Work climate'],
  ['Keine Mitarbeiter', 'No employees'],
  ['Sobald du Mitarbeiter einstellst, siehst du hier ihre Stimmung. Zufriedene Teams arbeiten besser und kündigen seltener.', 'As soon as you hire employees you will see their mood here. Happy teams work better and quit less often.'],
  ['(höchstens ±', '(at most ±'], ['%)', '%)'], ['Zusatzstellen:', 'Extra positions:'], ['weniger Krankenausfall:', 'fewer sick days:'],
  ['Mit einem Manager bleibt das Klima mindestens auf neutralem Niveau.', 'With a manager the climate stays at least at a neutral level.'],
  ['Nach einer Abmahnung ist das Team verunsichert: Zielstimmung', 'After a formal warning the team is unsettled: target mood'], ['Punkte.', 'points.'],
  ['Lob für alle', 'Praise for everyone'], ['Prämie', 'Bonus'], ['Betriebsfest', 'Company party'], ['Weihnachtsfeier', 'Christmas party'], ['Mitarbeiter einzeln führen', 'Lead employees individually'],
  ['Ein Lob kostet nichts', 'Praise is free'], ['Prämie für das ganze Team', 'Bonus for the whole team'], ['Weihnachtsfeier wirkt stärker', 'A Christmas party has a stronger effect'], ['Betriebsfest für das ganze Team', 'Company party for the whole team'],
  ['Stimmung', 'Mood'], ['Unzufrieden – denkt ans Kündigen', 'Unhappy – thinking of quitting'],
  ['Lob', 'Praise'], ['Geschenk', 'Gift'], ['Abmahnen', 'Give formal warning'], ['Ein kleines Geschenk', 'A small gift'], ['Eine Prämie', 'A bonus'],
  ['Förmliche Abmahnung – senkt die Stimmung im Team', 'Formal warning – lowers the mood in the team'],
  // Modul-Dialog und Bestätigungen
  ['Gebaut', 'Built'], ['Nächste Stufe', 'Next level'], ['Später', 'Later'], ['Erst ab', 'Only from'], ['Kosten:', 'Cost:'],
  ['Die Kosten sind ein Anteil am Wert des Betriebs und richten sich nach den Baupreisen deiner Stadt. Der Unterhalt läuft täglich. Beim Rückbau gibt es kein Geld zurück.', 'The cost is a share of the value of the business and depends on the building prices in your town. Upkeep is charged daily. Dismantling gives no money back.'],
  ['Ausbauen', 'Upgrade'], ['Zurückbauen', 'Dismantle'], ['Das Modul wird abgebaut. Es gibt kein Geld zurück.', 'The module will be dismantled. No money is refunded.'],
  ['Mitarbeiter abmahnen?', 'Give a formal warning?'],
  ['Eine Abmahnung ist ein förmlicher Verweis. Kurzfristig steigt die Leistung, doch die Stimmung im ganzen Team sinkt, und wer oft abmahnt, verliert an Ansehen. Lob und Prämien wirken meist besser.', 'A formal warning is an official reprimand. Performance rises briefly, but the mood in the whole team drops, and anyone who warns often loses standing. Praise and bonuses usually work better.'],
  // Innenraum (Design V2)
  ['Lager', 'Warehouse'], ['Schutz & Brand', 'Security & fire'],
  ['Lager – Vorrat und Ausbau', 'Warehouse – stock and upgrade'], ['Lagerregal – noch kein Lager', 'Storage shelf – no warehouse yet'], ['Vorrat, Lager ausbauen', 'Stock, upgrade warehouse'],
  ['Noch kein Lager gebaut', 'No warehouse built yet'], ['Überbrückt Lieferausfälle und nutzt günstige Einkaufspreise', 'Bridges supply gaps and uses low purchase prices'], ['Ein Lager hält Zutaten für einige Tage vor', 'A warehouse keeps ingredients for a few days'],
  ['Höchste Stufe erreicht', 'Highest level reached'], ['Braucht keine Zutaten', 'Needs no ingredients'], ['Geld reicht nicht', 'Not enough money'],
  ['Alarmtafel & Feuerlöscher – Schutz und Brandschutz', 'Alarm panel & fire extinguisher – security and fire protection'], ['Brandschutz, Schutz, Versicherung', 'Fire protection, security, insurance'],
  ['Ohne Betriebsversicherung trägst du den Schaden selbst', 'Without business insurance you bear the damage yourself'],
  ['Aushang – Betriebsklima', 'Notice board – work climate'], ['Lob, Prämie, Betriebsfest', 'Praise, bonus, company party'],
  ['Stelle Mitarbeiter ein – dann siehst du hier ihre Stimmung', 'Hire employees – then you will see their mood here'],
  ['Team loben', 'Praise the team'], ['Kostet nichts', 'Free'], ['Prämie für das Team', 'Bonus for the team'], ['Mitarbeiter einzeln führen …', 'Lead employees individually …'], ['Lob, Geschenk, Prämie', 'Praise, gift, bonus'],
  ['Betriebsunterbrechung', 'business interruption'], ['nur mit Betrieb', 'only with a business'],
  // Hinweise der Einsteigerführung
  ['Hier baust du Module aus – beginne mit der kleinsten Stufe, etwa dem Brandschutz.', 'Here you build modules – start with the smallest level, for example fire protection.'],
  ['Tippe auf „Lob für alle“ – das kostet nichts und hebt die Stimmung.', 'Tap “Praise for everyone” – it costs nothing and lifts the mood.'],
  // Glossar
  ['Betriebsklima', 'Work climate'],
  ['Die Stimmung im Team von 0 bis 100 (50 ist neutral). Sie hängt von fairem Lohn, genug Personal, Sozialräumen und der Jahreszeit ab. Gute Stimmung bringt bis zu sechs Prozent mehr Umsatz, schlechte kostet bis zu sechs Prozent – und treibt Mitarbeiter zur Kündigung.', 'The mood in the team from 0 to 100 (50 is neutral). It depends on fair pay, enough staff, social rooms and the season. A good mood brings up to six percent more sales, a bad one costs up to six percent – and drives employees to quit.'],
  ['Modul', 'Module'], ['Ausbaumodul', 'Upgrade module'],
  ['Ein Ausbau für deinen Betrieb mit drei Stufen: Lager, Brandschutz, Schutz oder Arbeitsplätze. Jede Stufe kostet einmalig Geld (ein Anteil am Wert des Betriebs) und täglich etwas Unterhalt. Die Baufirmen deiner Stadt verdienen daran.', 'An upgrade for your business with three levels: warehouse, fire protection, security or workplaces. Each level costs money once (a share of the value of the business) and a little upkeep every day. The construction firms of your town earn from it.'],
  ['Lager', 'Warehouse'],
  ['Ein Vorrat an Zutaten für einige Tage. Er überbrückt Lieferausfälle und hilft beim Einkauf, wenn die Preise günstig sind. Bei Brand und Diebstahl kann er verloren gehen.', 'A stock of ingredients for a few days. It bridges supply gaps and helps with buying when prices are low. It can be lost in a fire or a theft.'],
  ['Brandschutz', 'Fire protection'],
  ['Feuerlöscher, Brandmelder und Sprinkler senken die Gefahr und den Schaden eines Betriebsbrands und machen die Betriebsversicherung günstiger.', 'Fire extinguishers, fire alarms and sprinklers lower the risk and the damage of a business fire and make the business insurance cheaper.'],
  ['Schutz', 'Security'], ['Schutzstufe', 'Security level'],
  ['Schloss und Pförtner, später Alarmanlage und Videoüberwachung. Höhere Stufen wehren Diebstahl und im Wettbewerb auch Angriffe häufiger ab.', 'Lock and gatekeeper, later alarm system and video surveillance. Higher levels repel theft and, in the rivalry, attacks more often.'],
  ['Betriebsbrand', 'Business fire'],
  ['Ein seltenes Ereignis: Es brennt im Betrieb. Er steht dann einige Tage still und ein Teil des Lagers verbrennt. Brandschutz mindert das Risiko, die Betriebsversicherung zahlt den größten Teil des Schadens.', 'A rare event: the business is on fire. It then stands idle for a few days and part of the warehouse burns. Fire protection reduces the risk, the business insurance pays most of the damage.'],
  ['Betriebsversicherung', 'Business insurance'],
  ['Schützt alle deine Betriebe vor den Folgen von Brand und Einbruch und zahlt eine Entschädigung für die Ausfalltage. Brandschutz und Schutz machen den Beitrag günstiger.', 'Protects all your businesses against the consequences of fire and burglary and pays compensation for the days of downtime. Fire protection and security make the premium cheaper.'],
  ['Prämie (Bonus)', 'Bonus'],
  ['Eine Sonderzahlung an Mitarbeiter. Sie hebt die Stimmung spürbar, kostet aber Geld – und wirkt weniger, wenn du sie oft zahlst.', 'A special payment to employees. It lifts the mood noticeably but costs money – and works less well if you pay it often.'],
  ['Abmahnung', 'Formal warning'],
  ['Ein förmlicher Verweis. Kurzfristig steigt die Leistung, doch die Stimmung im ganzen Team sinkt und das Klima bleibt Wochen belastet. Wer oft abmahnt, verliert an Ansehen. Lob und Prämien wirken meist besser.', 'An official reprimand. Performance rises briefly, but the mood in the whole team drops and the climate stays strained for weeks. Anyone who warns often loses standing. Praise and bonuses usually work better.'],
  ['Zusatzstelle', 'Extra position'],
  ['Das Modul „Arbeitsplätze“ erlaubt mehr Personal als der Betrieb braucht. Jede Zusatzstelle bringt ein wenig Umsatz (die erste am meisten) und kostet einen vollen Lohn – das lohnt sich eher in großen Betrieben.', 'The “Workplaces” module allows more staff than the business needs. Each extra position brings a little sales (the first the most) and costs a full wage – this pays off more in large businesses.'],
]);

module.exports = { exact, patterns };
