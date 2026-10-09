'use strict';
/**
 * Englische Texte (Spielserver): Ruf und Ansehen – Stufen, Bestandteile, Ereignisse im Protokoll, Hinweise, Sperrtexte,
 * Ehrenbürgerwürde, Briefe und Meldungen. Paare [deutsch, englisch]; ${…} sind Platzhalter (Namen und Zahlen).
 * Die Ereignistexte werden aus src/game/reputation.js (REASONS) gelesen und hier nur übersetzt.
 */
const R = require('../game/reputation');

const LEVELS = { Verrufen: 'Disreputable', Zweifelhaft: 'Dubious', Unbekannt: 'Unknown', Anständig: 'Decent', Angesehen: 'Respected', Honoratior: 'Notable', Ehrenbürger: 'Honorary citizen' };
const KINDS = { Zuverlässigkeit: 'Reliability', Handel: 'Trade', Gemeinwohl: 'Public good', 'Ansehen im Amt': 'Standing in office', Skandal: 'Scandal' };

const EVENTS = {
  rent_paid: ['Rent paid on time', 'Anyone who pays the rent on time every day counts as reliable.'],
  rent_missed: ['Rent unpaid – home lost', 'The rent could not be paid and the home was lost. Word gets around.'],
  loan_paid: ['Loan installment paid on time', 'The loan installment was debited on time. Banks and other players remember that.'],
  loan_missed: ['Loan installment unpaid', 'There was not enough money for the loan installment. The bank takes note.'],
  loan_cleared: ['Loan repaid in full', 'A loan was repaid completely – a real proof of trust.'],
  contract_done: ['Supply contract fulfilled properly', 'A supply contract ran properly to its end. Both sides gain trust.'],
  contract_cancel: ['Supply contract cancelled early', 'A running supply contract was cancelled early. The partner was suddenly left without a buyer or supplier.'],
  auction_default: ['Winning bid not honoured', 'You won an auction but could not pay for the winning bid.'],
  trade_done: ['Fair trade completed', 'A deal with another player was completed fairly.'],
  offer_answered: ['Offer answered fairly', 'You answered an offer instead of leaving it unanswered. That shows decency.'],
  supply_ok: ['Reliable deliveries', 'Deliveries or payments from supply contracts arrived on time and in full.'],
  supply_short: ['Unreliable deliveries', 'You could not deliver the agreed quantity from a supply contract.'],
  exchange_trade: ['Trading on the stock exchange', 'Active trading on the exchange shows that you take part and pay.'],
  ipo: ['Stock exchange listing', 'A stock exchange listing makes a business public and creates obligations towards shareholders.'],
  gift: ['Gift to another player', 'You gave money to another player. Generosity raises the public good.'],
  tax_paid: ['Taxes paid', 'You paid your taxes – that finances the city.'],
  hire: ['Employee hired', 'You gave another player a job.'],
  staff_kept: ['Employees on the payroll', 'Your business employs staff. Jobs count towards the public good.'],
  fire_unfair: ['Employee dismissed shortly after hiring', 'An employee was dismissed shortly after being hired. That is considered unfair.'],
  visit: ['Visited another player’s business', 'You visited another player’s business and spent money there.'],
  honor: ['Honorary citizenship received', 'The mayor awarded you honorary citizenship.'],
  office_won: ['Election won', 'You won an election. Higher offices give more standing.'],
  office_run: ['Stood as a candidate', 'You ran in an election. Those who stand are seen.'],
  office_term: ['Term of office completed', 'You completed a term of office. Higher offices give more standing.'],
  office_quit: ['Resigned from office early', 'You resigned from office early. The voters are disappointed.'],
  policy_popular: ['Popular decision', 'Your decision is well received by the citizens (for example lower taxes or a rent brake).'],
  policy_unpopular: ['Controversial decision', 'Your decision is controversial (for example higher taxes). That costs standing.'],
  honor_given: ['Honorary citizenship awarded', 'As mayor you awarded honorary citizenship.'],
  sabotage_caught: ['Caught committing sabotage', 'You were caught in an attack on someone else’s business. That is a serious scandal.'],
  spy_caught: ['Caught spying', 'You were caught in industrial espionage.'],
  fine: ['Fine paid', 'You had to pay a fine (inspection or competition).'],
  bankrupt: ['Went bankrupt', 'You became insolvent. That casts a long shadow.'],
  evict: ['Evicted a tenant', 'You put a tenant out on the street. That harms your reputation as a landlord.'],
  flagged: ['Suspicious behaviour reported', 'Your behaviour was noticed (for example suspicious deals between accounts sharing an internet connection).'],
  admin: ['Adjusted by the game team', 'The game team adjusted your reputation.'],
};

const TIPS = [
  ['Rechnungen pünktlich zahlen', 'Pay bills on time', 'Miete und Kreditraten rechtzeitig zahlen und Verträge einhalten – das ist die schnellste Grundlage.', 'Pay rent and loan installments on time and keep your contracts – that is the quickest foundation.'],
  ['Fair handeln', 'Trade fairly', 'Schließe Geschäfte mit Mitspielern ab, beantworte Angebote und liefere zuverlässig.', 'Make deals with other players, answer offers and deliver reliably.'],
  ['Gutes tun', 'Do good', 'Beschäftige Mitarbeiter, zahle Steuern und beschenke Mitspieler. Das zählt für das Gemeinwohl.', 'Employ staff, pay taxes and give gifts to other players. That counts towards the public good.'],
  ['Ein Amt ausfüllen', 'Hold an office', 'Wahlen gewinnen und Amtszeiten zu Ende bringen steigert das Ansehen im Amt.', 'Winning elections and completing terms of office raises your standing in office.'],
  ['Skandale vermeiden', 'Avoid scandals', 'Sabotage, Pleiten und Rauswürfe schaden lange. Ein Skandal flaut nur langsam ab.', 'Sabotage, bankruptcies and evictions do lasting harm. A scandal fades only slowly.'],
];

const pairs = [];
for (const [de, en] of Object.entries(LEVELS)) pairs.push([de, en]);
for (const [de, en] of Object.entries(KINDS)) pairs.push([de, en]);
for (const [k, v] of Object.entries(R.REASONS)) { const e = EVENTS[k]; if (e) { pairs.push([v.label, e[0]]); pairs.push([v.why, e[1]]); } }
for (const t of TIPS) { pairs.push([t[0], t[1]]); pairs.push([t[2], t[3]]); }
const HINTS = {
  rel: 'Pay rent, loan installments, contracts and winning bids on time and reliably.',
  trade: 'Trade fairly, answer offers and deliver reliably.',
  civic: 'Help other players, give people jobs and pay taxes.',
  office: 'Win elections, fill offices well and pass popular decisions.',
  scandal: 'Caught sabotage, bankruptcies, fines and evictions – fades only slowly.',
};
for (const k of R.KINDS) pairs.push([R.KIND_HINT[k], HINTS[k]]);

// Sperrtexte (für jede Stufe) und die Einbettungen in Fehlermeldungen
const NEED_NEG = ['Mit dem Ruf „Verrufen“ ist das gesperrt. Zahle Rechnungen pünktlich und halte dich an Verträge, dann erholt sich dein Ansehen.', 'This is blocked for those with the reputation “Disreputable”. Pay bills on time and keep your contracts, then your standing will recover.'];
pairs.push(NEED_NEG);
for (let lv = 0; lv <= 4; lv++) pairs.push([R.needText(lv), `You need at least this standing: ${LEVELS[R.levelName(lv)]}.`]);

pairs.push(
  ['Die Bank vergibt keinen Kredit. ${blocked}', 'The bank does not grant a loan. ${blocked}'],
  ['Arbeitgeber stellen dich so nicht ein. ${bl}', 'Employers will not hire you like this. ${bl}'],
  ['Die Börse nimmt dich so nicht auf. ${bl}', 'The stock exchange will not admit you like this. ${bl}'],
  ['Eine Übernahme ist dir so nicht möglich. ${bl}', 'A takeover is not possible for you like this. ${bl}'],
  ['Verkäufer reden mit dir so nicht. ${bl}', 'Sellers will not talk to you like this. ${bl}'],
  ['Lieferverträge sind dir so nicht möglich. ${band.blocked}', 'Supply contracts are not possible for you like this. ${band.blocked}'],
  ['Der Preis muss zwischen ${lo} % und ${hi} % des Marktpreises liegen. (Dein Ansehen „${band.name}“ weitet den Rahmen.)', 'The price must be between ${lo} % and ${hi} % of the market price. (Your standing “${band.name}” widens the range.)'],
  ['Der Preis muss zwischen ${lo} % und ${hi} % des Marktpreises liegen. (Dein Ansehen „${band.name}“ verengt den Rahmen.)', 'The price must be between ${lo} % and ${hi} % of the market price. (Your standing “${band.name}” narrows the range.)'],
  ['Der Preis muss zwischen ${lo} % und ${hi} % des Marktpreises liegen.', 'The price must be between ${lo} % and ${hi} % of the market price.'],
  // Ereignisse und Meldungen
  ['Dein Ansehen ist gestiegen', 'Your standing has risen'],
  ['Die Leute reden gut über dich: Dein Ansehen ist jetzt „${name}“. Unter „Übersicht → Ansehen“ siehst du, warum.', 'People speak well of you: your standing is now “${name}”. Under “Overview → Standing” you can see why.'],
  ['Dein Ruf hat gelitten', 'Your reputation has suffered'],
  ['Dein Ansehen ist auf „${name}“ gefallen. Zahle Rechnungen pünktlich und halte Verträge ein – dann erholt es sich mit der Zeit. Unter „Übersicht → Ansehen“ siehst du, warum.', 'Your standing has fallen to “${name}”. Pay bills on time and keep your contracts – then it recovers over time. Under “Overview → Standing” you can see why.'],
  ['Ehrenbürger', 'Honorary citizen'],
  ['${nm} genießt höchstes Ansehen und gilt nun als Ehrenbürger.', '${nm} enjoys the highest esteem and is now considered an honorary citizen.'],
  ['Skandal', 'Scandal'],
  ['${nm} ist in Verruf geraten: Man spricht von Sabotage, Zahlungsausfällen und gebrochenen Verträgen.', '${nm} has fallen into disrepute: people talk of sabotage, missed payments and broken contracts.'],
  ['Familienruf: Der Erbe übernimmt einen Teil des Rufs', 'Family reputation: the heir takes over part of the reputation'],
  ['Neuanfang: Ein Teil des alten Rufs bleibt', 'Fresh start: part of the old reputation remains'],
  ['Von der Spielleitung angepasst', 'Adjusted by the game team'],
  ['Sonstiges', 'Other'],
  // Ehrenbürgerwürde
  ['Nur ein amtierender Bürgermeister kann die Ehrenbürgerwürde verleihen.', 'Only a serving mayor can award honorary citizenship.'],
  ['Ansehen ist gerade abgeschaltet.', 'Standing is switched off right now.'],
  ['Du bist nicht mehr in der Stadt, in der du gewählt wurdest.', 'You are no longer in the city where you were elected.'],
  ['In dieser Amtszeit hast du die Würde schon verliehen.', 'You have already awarded the honour in this term of office.'],
  ['Du kannst dich nicht selbst ehren.', 'You cannot honour yourself.'],
  ['Diesen Bürger gibt es nicht (mehr).', 'This citizen does not exist (any more).'],
  ['Die Würde geht nur an Bürger deiner Stadt.', 'The honour can only go to citizens of your city.'],
  ['Zwischen diesen Konten ist das nicht möglich (gleiche Internetverbindung oder zu neues Konto).', 'That is not possible between these accounts (same internet connection or account too new).'],
  ['${t.name} hat vor Ort noch zu wenig Ansehen (nötig: ${R.levelName(min)}).', '${t.name} does not have enough standing locally yet (needed: ${R.levelName(min)}).'],
  ['${t.name} wurde erst kürzlich geehrt.', '${t.name} was only honoured recently.'],
  ['${name} wird Ehrenbürger von ${city}: Gemeinwohl +${civic}, örtliches Ansehen +${pts}. Du gewinnst selbst ein wenig Amtsansehen. Das geht nur einmal pro Amtszeit. Danach wäre ${name} vor Ort „${after}“ (jetzt: ${now}).',
    '${name} becomes an honorary citizen of ${city}: public good +${civic}, local standing +${pts}. You gain a little standing in office yourself. This is possible only once per term. Afterwards ${name} would be “${after}” locally (now: ${now}).'],
  ['deiner Stadt', 'your city'],
  ['Ehrenbürgerwürde verliehen', 'Honorary citizenship awarded'],
  ['Neuer Ehrenbürger von ${city}: ${t.name}.', 'New honorary citizen of ${city}: ${t.name}.'],
  ['${info.nm} verleiht dir die Ehrenbürgerwürde von ${info.city}. Dein Ansehen vor Ort ist gestiegen.', '${info.nm} awards you the honorary citizenship of ${info.city}. Your standing locally has risen.'],
  ['${state.person.first} verleiht ${t.name} die Ehrenbürgerwürde von ${city}.', '${state.person.first} awards ${t.name} the honorary citizenship of ${city}.'],
  ['Ehrenbürgerwürde', 'Honorary citizenship'],
  ['${info.nm} verleiht ${info.t.name} die Ehrenbürgerwürde von ${info.city}.', '${info.nm} awards ${info.t.name} the honorary citizenship of ${info.city}.'],
  ['Der Bürgermeister', 'The mayor'],
  ['Ein Bürger', 'A citizen'],
  // Einsteiger
  ['Erreiche Ansehen: Anständig', 'Reach standing: Decent'],
  ['Wer Miete und Steuern pünktlich zahlt und fair handelt, genießt Vertrauen: Die Bank gibt bessere Zinsen, Mieter und Geschäftspartner kommen leichter, und Ämter stehen dir offen.', 'Anyone who pays rent and taxes on time and trades fairly is trusted: the bank offers better interest rates, tenants and business partners come more easily, and offices are open to you.'],
  ['Deine Miete ist in Gefahr', 'Your rent is at risk'],
  ['Reicht das Geld nicht für die Miete, verlierst du die Wohnung – und dein Ansehen leidet. Pünktlich zahlen dagegen stärkt es.', 'If the money does not cover the rent, you lose the home – and your standing suffers. Paying on time strengthens it.'],
  ['Dein Ruf ist angeschlagen', 'Your reputation is damaged'],
  ['Banken, Vermieter und Wähler misstrauen dir. Zahle Rechnungen pünktlich und halte Verträge ein, dann erholt sich dein Ansehen mit der Zeit.', 'Banks, landlords and voters distrust you. Pay bills on time and keep your contracts, then your standing recovers over time.'],
  ['Mein Ansehen', 'My standing'],
  ['Einnahmen verbessern', 'Improve income'],
  ['Hier siehst du dein Ansehen – und warum es sich verändert.', 'This is your standing – and why it changes.'],
  // Wahlen
  ['Dafür brauchst du mindestens Ansehen: Anständig.', 'You need at least this standing: Decent.'],
  ['alle außer Verrufen', 'everyone except Disreputable'],
  ['Kredit aufnehmen', 'Take out a loan'], ['Lieferverträge anbieten', 'Offer supply contracts'], ['Kaufangebote machen', 'Make purchase offers'], ['An die Börse gehen', 'Go public on the exchange'],
  ['Betriebe übernehmen', 'Take over businesses'], ['Bewerben und einstellen', 'Apply for jobs and hire'],
);
module.exports = pairs;
