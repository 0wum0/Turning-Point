'use strict';
/**
 * Englische Texte der Oberfläche: Jahreszeiten, Ernte und Seuchen (Jahreszeit-Karte und Check, Erntebericht, Seuchenhinweis, Schutzknöpfe,
 * Chips an Betrieben, Beschlüsse der Ämter, Glossar, Tagesblatt).
 * exact: ganzer Textknoten → Übersetzung; patterns: [Regex, Ersatz] (Muster werden zuerst ausgewertet). In T('…{}…', '…$1…') steht {} für einen beliebigen Teil, {n} für eine Zahl.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);
// ---- Muster
T('noch {n} Tage', '$1 more days left');
T('{n} Tage weniger Ansteckung', '$1 days of lower infection');
T('Ernte {n}', 'Harvest $1');
T('Gesundheitsamt Stufe {n}', 'Health office level $1'); T('Krankenhausprogramm Stufe {n}', 'Hospital programme level $1'); T('Impfkampagne Stufe {n}', 'Vaccination campaign level $1');
T('Seuchenmaßnahme Stufe {n}', 'Epidemic measure level $1'); T('Erntefest Stufe {n}', 'Harvest fair level $1');
T('Winterhilfe {n} %', 'Winter relief $1 %'); T('Kurzarbeitergeld {n} %', 'Short-time allowance $1 %'); T('Ernte- und Dürrehilfe {n} %', 'Harvest and drought relief $1 %');
T('Impfquote', 'Vaccination rate');
// ---- fest
X([
  // Karte und Chips
  ['Jahreszeit', 'Season'], ['Jahreszeiten-Check', 'Season check'], ['Heizung', 'Heating'], ['Ernte', 'Harvest'], ['Ernte dieses Jahr:', 'Harvest this year:'], ['– Getreide', '– grain'],
  ['Hochwasser in deinem Bundesland', 'Flooding in your state'],
  ['Agrarwaren und Lebensmittel sind teurer, Landwirte verdienen weniger.', 'Farm goods and food are more expensive, farmers earn less.'],
  ['Agrarwaren und Lebensmittel sind günstiger, Landwirte verdienen mehr.', 'Farm goods and food are cheaper, farmers earn more.'],
  ['Die Preise für Agrarwaren sind normal.', 'Prices for farm goods are normal.'],
  ['in Miete bzw. Unterhalt enthalten', 'included in rent or upkeep'],
  ['Jahreszeit und Feste', 'Season and festivals'], ['Saison', 'Season'], ['Maßnahmen', 'Measures'], ['Seuchenmaßnahmen', 'Epidemic measures'], ['Krankenstand', 'Sick leave'],
  // Seuchenhinweis
  ['Seuche:', 'Epidemic:'], ['Seuchen', 'Epidemics'], ['Lage bei dir:', 'Situation near you:'], ['hoch', 'high'], ['mittel', 'medium'], ['gering', 'low'], ['noch keine', 'none yet'],
  ['Die Welle erreicht deine Stadt in', 'The wave reaches your town in'], ['Tagen.', 'days.'], ['Die Welle steigt – Höhepunkt in', 'The wave is rising – peak in'], ['Die Welle steigt.', 'The wave is rising.'], ['Die Welle fällt.', 'The wave is falling.'],
  ['Maßnahmen des Bundes:', 'Federal measures:'], ['Krankenstand in den Betrieben:', 'Sick leave in businesses:'],
  ['Du bist krank.', 'You are ill.'], ['Noch', 'Another'], ['Tage. Iss gut und ruh dich aus – das Krankengeld deckt 75 % des Lohns.', 'days. Eat well and rest – sick pay covers 75 % of your wage.'],
  ['Anfängerschutz: In deinen ersten Spieltagen bleibst du gesund. Lerne in Ruhe, wie Schutz funktioniert.', 'Beginner protection: you stay healthy during your first game days. Learn in peace how protection works.'],
  ['Örtlich:', 'Locally:'], ['keine Beschlüsse', 'no decisions'],
  ['Hygienepaket aktiv', 'Hygiene kit active'], ['Hygienepaket', 'Hygiene kit'], ['Geimpft', 'Vaccinated'], ['Impfen', 'Get vaccinated'], ['Du bist geschützt', 'You are protected'], ['Schützt stark vor Ansteckung', 'Strong protection against infection'], ['Noch kein Impfstoff', 'No vaccine yet'],
  ['Schutzkonzept aktiv', 'Protection plan active'], ['Kontakte eingeschränkt', 'Contacts limited'], ['Schutzkonzept für Betriebe', 'Protection plan for businesses'], ['Kontakte einschränken', 'Limit contacts'],
  ['Homeoffice, Schichten, Tests', 'Home office, shifts, tests'], ['Weniger Ansteckung, etwas weniger Abwechslung', 'Less infection, a little less variety'],
  ['Seuchen laufen in Wellen und breiten sich von Stadt zu Stadt aus – über Wochen.', 'Epidemics come in waves and spread from town to town – over weeks.'],
  ['Sie machen krank, drücken Läden und Gaststätten und schwächen Betriebe durch Krankenstand. Dein Leben ist nur bei sehr schwerer Krankheit in Gefahr – Anfänger sind geschützt.', 'They make people ill, hit shops and pubs and weaken businesses through sick leave. Your life is only at risk in very severe illness – beginners are protected.'],
  ['Schütze dich mit einem Klick: Hygienepaket, Impfung (sobald es einen Impfstoff gibt) oder ein Schutzkonzept. Ämter können mit Beschlüssen helfen.', 'Protect yourself with one click: hygiene kit, vaccination (once there is a vaccine) or a protection plan. Offices can help with decisions.'],
  // Check
  ['So wirkt die Jahreszeit', 'How the season affects you'], ['Heizung:', 'Heating:'], ['auf Miete bzw. Hausunterhalt.', 'on rent or house upkeep.'], ['Winterhilfe der Stadt übernimmt', 'The town winter relief covers'], ['% des Mehrbedarfs.', '% of the extra need.'],
  ['Gesundheit:', 'Health:'], ['Im Winter sind Erkältungen häufiger und die Erholung ist schwerer.', 'In winter colds are more common and recovery is harder.'],
  ['Im Sommer erholst du dich leichter und bist seltener krank.', 'In summer you recover more easily and fall ill less often.'], ['In den Übergangszeiten ist alles ausgeglichen.', 'In the in-between seasons everything is balanced.'],
  ['Betriebe:', 'Businesses:'], ['– noch', '– another'], ['Tage in deiner Stadt.', 'days in your town.'],
  ['Ertrag bei dir:', 'Yield near you:'], ['% eines Normaljahres · Getreide', '% of a normal year · grain'], ['· Lebensmittel im Haushalt', '· household food'], ['· Bauernhöfe', '· farms'],
  ['Winter-Check', 'Winter check'], ['Polster für 30 Tage Fixkosten:', 'Cushion for 30 days of fixed costs:'], ['Kühlschrank mindestens halb voll', 'Fridge at least half full'],
  ['Krankenzusatz abgeschlossen (senkt Arztkosten und Schwere von Krankheiten)', 'Supplementary health insurance taken out (lowers doctor costs and the severity of illness)'],
  // Beschlüsse
  ['Gewerbesteuer-Zuschlag, Baulandausweisung, Schulbudget, Gesundheitsamt und Winterhilfe in der Stadt.', 'Business tax surcharge, land zoning, school budget, health office and winter relief in the town.'],
  ['Gewerbesteuer-Zuschlag, Subvention, Mietpreisbremse, Baulandausweisung, Schulbudget, Gesundheitsamt, Winterhilfe und Erntefest in der Stadt.', 'Business tax surcharge, subsidy, rent cap, land zoning, school budget, health office, winter relief and harvest fair in the town.'],
  ['Preisstützung für eine Ware, Wohnungsbauprogramm, Bildungsprogramm und Krankenhausprogramm im Bundesland.', 'Price support for a good, housing programme, education programme and hospital programme in the state.'],
  ['Rahmen für Zuschläge und Subventionen im ganzen Land; Berufsbildungsgesetz; Rahmen für Seuchenmaßnahmen.', 'Framework for surcharges and subsidies across the country; Vocational Training Act; framework for epidemic measures.'],
  ['Mehrwertsteuer auf Waren, Einfuhrzoll, Branchen-Subvention, Preisbremse, Berufsbildungsgesetz, Seuchenmaßnahmen, Impfkampagne, Kurzarbeitergeld und Ernte- und Dürrehilfe.', 'VAT on goods, import tariff, industry subsidy, price brake, Vocational Training Act, epidemic measures, vaccination campaign, short-time allowance and harvest and drought relief.'],
  ['Gesundheitsamt Stufe', 'Health office level'], ['Winterhilfe Stufe', 'Winter relief level'], ['Erntefest Stufe', 'Harvest fair level'], ['Krankenhausprogramm Stufe', 'Hospital programme level'], ['Impfkampagne Stufe', 'Vaccination campaign level'],
  [': Seuchen breiten sich in deiner Stadt um', ': epidemics spread in your town'], ['langsamer aus – weniger Kranke, weniger Krankenstand in den Betrieben.', 'more slowly – fewer ill, less sick leave in businesses.'],
  ['Wirkt nur, solange eine Seuche läuft.', 'Only works while an epidemic is running.'],
  [': Die Stadt übernimmt', ': the town covers'], ['des zusätzlichen Heizbedarfs im Winter für alle Bewohner – auch für dich.', 'of the extra winter heating need for all residents – you included.'],
  [': Zwischen Mitte September und Mitte Oktober machen Gastronomie, Ausflug und Einzelhandel in deiner Stadt', ': between mid-September and mid-October restaurants, outings and retail in your town make'], ['Umsatz und die Stimmung steigt.', 'more revenue and the mood rises.'],
  [': Seuchen verlaufen im ganzen Bundesland um', ': epidemics run across the whole state'], ['milder, Impfungen werden um', 'milder, vaccinations become'], ['günstiger und öfter genutzt.', 'cheaper and are used more often.'],
  ['Rahmen für Seuchenmaßnahmen: Der Kanzler darf höchstens', 'Framework for epidemic measures: the Chancellor may order up to'], ['anordnen.', 'as the strictest measure.'],
  ['Ohne Beschluss gilt: höchstens Kontaktbeschränkungen.', 'Without a decision the limit is: contact restrictions at most.'],
  ['Maßnahme:', 'Measure:'], ['(durch den Rahmen des Bundestags begrenzt, höchstens Stufe', '(limited by the Bundestag framework, level'], ['Ansteckung:', 'Infection:'], ['gegenüber keinen Maßnahmen – weniger Kranke und Krankenstand.', 'compared with no measures – fewer ill and less sick leave.'],
  ['Wirtschaft bei voller Welle: Gastronomie', 'Economy at full wave: restaurants'], [', Ausflug und Reisen', ', outings and travel'], [', Einzelhandel', ', retail'], [', übrige Branchen', ', other sectors'],
  ['Ansehen:', 'Standing:'], ['kommt gut an', 'goes down well'], ['umstritten', 'controversial'], ['riskant, aber nicht umstritten', 'risky, but not controversial'], ['neutral', 'neutral'],
  ['Gilt nur, solange eine Seuche läuft. Ohne Beschluss gelten Standardmaßnahmen je nach Schwere der Seuche.', 'Only applies while an epidemic is running. Without a decision, standard measures apply depending on the severity of the epidemic.'],
  [': Die Impfquote der Bevölkerung steigt um bis zu', ': the vaccination rate of the population rises by up to'], ['Punkte – das bremst jede Welle spürbar.', 'points – this noticeably slows every wave.'],
  ['Kurzarbeitergeld:', 'Short-time allowance:'], ['der Umsatzverluste durch Seuchenmaßnahmen werden ausgeglichen.', 'of the revenue losses caused by epidemic measures are compensated.'],
  ['Ernte- und Dürrehilfe:', 'Harvest and drought relief:'], ['des Verlusts von Bauernhöfen in schlechten Erntejahren werden ersetzt.', 'of the losses of farms in poor harvest years are reimbursed.'],
  ['Der Rahmen des Bundestags erlaubt gerade höchstens Stufe', 'The Bundestag framework currently allows level'],
  ['Stufe', 'Level'], ['Seuchenmaßnahme Stufe', 'Epidemic measure level'],
  // Glossar
  ['Heizung', 'Heating'], ['Ernte', 'Harvest'], ['Seuche', 'Epidemic'], ['Impfung', 'Vaccination'], ['Lockdown', 'Lockdown'], ['Hygienepaket', 'Hygiene kit'], ['Krankengeld', 'Sick pay'],
  ['Winter, Frühling, Sommer und Herbst folgen dem Spieldatum. Im Winter kostet Heizen mehr und Erkältungen sind häufiger, im Sommer laufen Gastronomie und Ausflüge besser. Über das ganze Jahr gleicht sich alles aus.', 'Winter, spring, summer and autumn follow the game date. In winter heating costs more and colds are more common; in summer restaurants and outings do better. Over the whole year everything evens out.'],
  ['Ein Teil von Miete und Hausunterhalt sind Heizkosten. Sie steigen im Winter und sinken im Sommer. Kohleofen, Zentralheizung und Wärmepumpe unterscheiden sich in der Höhe. Eine Winterhilfe der Stadt übernimmt einen Teil des Mehrbedarfs.', 'Part of rent and house upkeep is heating. It rises in winter and falls in summer. Coal stove, central heating and heat pump differ in size. A winter relief by the town covers part of the extra need.'],
  ['Wie gut die Ernte eines Jahres ausfällt: Katastrophenjahr, schlechte, normale, gute oder Rekordernte. Eine schlechte Ernte verteuert Getreide, Milch, Fleisch und Gemüse – und über Mehl und Brot auch dein Essen. Landwirte verdienen dann weniger. Importe dämpfen den Schock.', 'How good the harvest of a year turns out: disaster year, poor, normal, good or record harvest. A poor harvest makes grain, milk, meat and vegetables dearer – and through flour and bread your food too. Farmers then earn less. Imports soften the shock.'],
  ['Eine Krankheitswelle, die von einer Stadt aus über Wochen in andere Städte zieht. Sie steigt bis zum Höhepunkt und klingt wieder ab. Sie macht krank, schwächt Betriebe durch Krankenstand und kann Läden und Gaststätten treffen. Anfänger sind in den ersten Spieltagen geschützt.', 'A wave of illness that moves from one town into other towns over weeks. It rises to a peak and fades again. It makes people ill, weakens businesses through sick leave and can hit shops and pubs. Beginners are protected during their first game days.'],
  ['Sobald es einen Impfstoff gibt, schützt eine Impfung mit einem Klick sehr gut vor Ansteckung und macht eine Krankheit leichter. Das Krankenhausprogramm des Landes macht Impfungen günstiger.', 'Once there is a vaccine, a vaccination with one click protects very well against infection and makes an illness milder. The state hospital programme makes vaccinations cheaper.'],
  ['Die strengste Seuchenmaßnahme des Bundes: Kontakte sind stark begrenzt, die Ansteckung sinkt deutlich – aber Gastronomie, Ausflug und Einzelhandel verlieren Umsatz. Kurzarbeitergeld gleicht einen Teil aus. Der Bundestag legt fest, wie streng der Kanzler höchstens sein darf.', 'The strictest federal epidemic measure: contacts are strongly limited and infection drops sharply – but restaurants, outings and retail lose revenue. The short-time allowance compensates part of it. The Bundestag sets how strict the Chancellor may be at most.'],
  ['Masken, Seife und Abstand für 45 Tage: Du steckst dich seltener an und wirst, wenn doch, etwas leichter krank.', 'Masks, soap and distance for 45 days: you catch it less often and, if you do, fall a little less ill.'],
  ['Wer krank ist, bekommt 75 % des Lohns weiter. Ein Krankenzusatz übernimmt außerdem die Arztkosten.', 'Anyone who is ill keeps 75 % of their wage. Supplementary insurance also covers the doctor costs.'],
  // Tagesblatt
  ['Jahreszeit und Lage in den Spieljahren, in denen gerade gespielt wird:', 'Season and situation in the game years being played right now:'], ['– Ernte:', '– harvest:'], ['– Seuche:', '– epidemic:'], ['(Lage', '(situation'],
]);
module.exports = { exact, patterns };
