'use strict';
/**
 * Englische Texte der Oberfläche für Spielermarkt, Börse, Bank, Vermietung, Wettbewerb, Stadtverzeichnis und Ortssuche.
 * exact: ganzer Text → Übersetzung; patterns: [Regex, Ersatz]. In T('…{}…', '…$1…') steht {} für einen beliebigen Teil.
 * Zeilen mit „ · “ werden vom Übersetzer (public/js/i18n.js) auch teilweise übersetzt, daher genügen Einzelteile.
 */
const exact = {};
const patterns = [];
const X = (pairs) => { for (const [de, en] of pairs) exact[de] = en; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const T = (de, en) => patterns.push(['^' + esc(de).replace(/\\\{\\\}/g, '([^·]+?)').replace(/\\\{n\\\}/g, '(\\d+)') + '$', en]);

// ---- Stadtverzeichnis
X([
  ['Einwohner', 'Residents'], ['Häuser', 'Houses'], ['Suchen …', 'Search …'],
  ['Eigentumswohnung', 'Condominium'], ['Kleines Haus', 'Small house'], ['Großes Haus', 'Large house'], ['Villa', 'Villa'],
  ['Nimmt am Wettbewerb teil', 'Takes part in competition'], ['Wettbewerb', 'Competition'],
  ['Mieten', 'Rent'], ['Wohnsitz', 'Residence'], ['vermietet', 'let'], ['zu vermieten', 'to let'], ['Angebot', 'Offer'], ['Bieten', 'Bid'],
  ['Verkaufen …', 'Sell …'], ['verlassen', 'abandoned'], ['in Schieflage', 'in distress'], ['läuft gut', 'doing well'], ['ausgeglichen', 'break-even'],
  ['Wert · Gewinn', 'Value · profit'], ['ohne Beruf', 'no occupation'], ['Einziehen', 'Move in'], ['Du bist eingezogen.', 'You have moved in.'],
  ['Nichts gefunden. Nur Spieler mit sichtbarem Profil erscheinen hier.', 'Nothing found. Only players with a visible profile appear here.'],
  ['Stadtverzeichnis', 'City directory'],
  ['Nur Spieler mit sichtbarem Profil erscheinen hier.', 'Only players with a visible profile appear here.'],
]);
T('{n} Einwohner · Beträge in heutigen Preisen', '$1 residents · amounts in today’s prices');
T('{n} Einwohner gefunden · Beträge in heutigen Preisen', '$1 residents found · amounts in today’s prices');
T('{n} Häuser · Beträge in heutigen Preisen', '$1 houses · amounts in today’s prices');
T('{n} Häuser gefunden · Beträge in heutigen Preisen', '$1 houses found · amounts in today’s prices');
T('{n} Betriebe · Beträge in heutigen Preisen', '$1 businesses · amounts in today’s prices');
T('{n} Betriebe gefunden · Beträge in heutigen Preisen', '$1 businesses found · amounts in today’s prices');
T('Seite {n}/{n}', 'Page $1/$2');
T('{n} Zimmer', '$1 rooms'); T('Zustand {n} %', 'condition $1 %'); T('Zustand {n} %', 'condition $1 %');
T('{n} Zimmer · Zustand {n} % · Eigentümer:', '$1 rooms · condition $2 % · owner:');
T('{n} Räume', '$1 rooms'); T('{n} Mitarbeiter', '$1 employees'); T('Inhaber: {}', 'Owner: $1'); T('Inhaber:', 'Owner:'); T('Eigentümer:', 'Owner:');
T('{} · {n} Räume · {n} Mitarbeiter · Inhaber:', '$1 · $2 rooms · $3 employees · owner:');
T('{n} Betrieb(e)', '$1 business(es)'); T('{n} Immobilie(n)', '$1 propert(ies)');
T('vermietet · {} / Tag', 'let · $1 / day'); T('zu vermieten · {} / Tag', 'to let · $1 / day'); T('{} / Tag', '$1 / day');
T('Zu verkaufen · {}', 'For sale · $1'); T('Zu verkaufen für {}', 'For sale for $1'); T('Gewinn {} / Tag', 'profit $1 / day'); T('Wert · Gewinn {} / Tag', 'Value · profit $1 / day');
T('„{}“ mieten?', 'Rent “$1”?');
T('Die Miete ({} pro Tag) wird bei Einzug festgeschrieben und täglich abgebucht. Dein bisheriges Zuhause fällt weg.', 'The rent ($1 per day) is fixed on moving in and debited daily. Your current home is lost.');

// ---- Spielermarkt
X([
  ['Immobilie', 'Property'], ['Gegenstand', 'Item'], ['Richtwert:', 'Guide value:'], ['Verkaufspreis:', 'Asking price:'], ['Nachricht (optional)', 'Message (optional)'],
  ['z. B. Ich zahle sofort.', 'e.g. I will pay immediately.'], ['Sofort kaufen', 'Buy now'], ['Angebot senden', 'Send offer'],
  ['Angebot verschickt. Der Eigentümer wird benachrichtigt.', 'Offer sent. The owner will be notified.'], ['Gekauft!', 'Bought!'],
  ['Marktwert:', 'Market value:'], ['. Käufer zahlen zusätzlich Gebühren.', '. Buyers pay fees on top.'],
  ['Jeder Spieler kann dann sofort kaufen. Du siehst es im Stadtverzeichnis als „Zu verkaufen“.', 'Any player can then buy it right away. You will see it in the city directory as “For sale”.'],
  ['Zum Verkauf anbieten', 'Offer for sale'], ['Angebot zurückziehen', 'Withdraw offer'], ['Oder versteigern', 'Or auction'], ['Mindestgebot', 'Minimum bid'],
  ['6 Std', '6 h'], ['24 Std', '24 h'], ['48 Std', '48 h'],
  ['Mindestgebot und Dauer. Während der Auktion ist der Gegenstand nicht in deinem Besitz; ohne Gebot kommt er zurück.', 'Minimum bid and duration. During the auction the item is not in your possession; without a bid it comes back to you.'],
  ['Zum Verkauf angeboten.', 'Offered for sale.'], ['Angebot zurückgezogen.', 'Offer withdrawn.'], ['Wirklich versteigern?', 'Really auction it?'],
  ['Der Gegenstand wird sofort aus deinem Besitz genommen und versteigert.', 'The item is taken out of your possession immediately and auctioned.'],
  ['Versteigern', 'Auction'], ['Die Versteigerung läuft.', 'The auction is running.'],
  ['Zwangsversteigerung (Insolvenzmasse)', 'Foreclosure auction (insolvency estate)'], ['Bieten', 'Bid'], ['Gebot abgegeben.', 'Bid placed.'],
  ['Gegenangebot', 'Counteroffer'], ['Gegenangebot gesendet.', 'Counteroffer sent.'], ['Abgeschlossen!', 'Done!'], ['Abgelehnt.', 'Declined.'],
  ['Zurückziehen', 'Withdraw'], ['Annehmen', 'Accept'], ['Ablehnen', 'Decline'], ['Zuletzt', 'Recently'], ['angenommen', 'accepted'], ['abgelehnt', 'declined'],
  ['Kaufangebot', 'Purchase offer'], ['Verkaufsangebot', 'Sale offer'], ['Zwangsversteigerung', 'Foreclosure auction'], ['Versteigerung', 'Auction'], ['deine', 'yours'],
  ['Angebote', 'Offers'], ['Mein Besitz zum Verkauf', 'My property for sale'],
  ['Keine offenen Angebote. Im Stadtverzeichnis kannst du jedem Eigentümer ein Angebot machen.', 'No open offers. In the city directory you can make an offer to any owner.'],
  ['Du besitzt noch nichts, das du verkaufen könntest.', 'You do not own anything yet that you could sell.'],
  ['Zurzeit läuft hier keine Versteigerung. Insolvenzmassen und freiwillige Versteigerungen erscheinen an dieser Stelle.', 'No auction is running here at the moment. Insolvency estates and voluntary auctions appear here.'],
  ['Kaufangebote gehen an den Eigentümer, der annehmen, ablehnen oder ein Gegenangebot machen kann.', 'Purchase offers go to the owner, who can accept, decline or make a counteroffer.'],
  ['Beträge sind intern auf den Wert von 1945 umgerechnet; jede Seite zahlt und erhält in ihrer eigenen Währung.', 'Amounts are converted internally to 1945 values; each side pays and receives in their own currency.'],
  ['Gebühren trägt der Käufer: Immobilien 3,5 % Grunderwerbsteuer, Betriebe 1,5 % Beurkundung.', 'The buyer bears the fees: property 3.5 % real estate transfer tax, businesses 1.5 % notarisation.'],
  ['Grunderwerbsteuer 3,5 %', 'real estate transfer tax 3.5 %'], ['Beurkundung 1,5 %', 'notarisation 1.5 %'],
]);
T('Angebot für „{}“', 'Offer for “$1”'); T('Gebot für „{}“', 'Bid for “$1”'); T('„{}“ verkaufen', 'Sell “$1”'); T('„{}“ sofort kaufen?', 'Buy “$1” now?');
T('. Gebühren ({}) trägst du zusätzlich.', '. Fees ($1) are charged on top.');
T('Dein Gebot ({})', 'Your bid ($1)'); T('Dein Preis ({})', 'Your price ($1)'); T('Verkaufspreis ({})', 'Asking price ($1)'); T('Betrag ({})', 'Amount ($1)');
T('Preis {} zuzüglich Gebühren. Der Kauf ist endgültig.', 'Price $1 plus fees. The purchase is final.');
T('Mindestens {}. Gebühren kommen hinzu; bei Zuschlag muss das Geld da sein.', 'At least $1. Fees come on top; the money must be available when the bid is accepted.');
T('Versteigerung von {}', 'Auction by $1'); T('Marktwert {}', 'Market value $1'); T('Höchstgebot {} (du)', 'Highest bid $1 (you)'); T('Höchstgebot {}', 'Highest bid $1'); T('Mindestgebot {}', 'Minimum bid $1'); T('ab {}', 'from $1');
T('Wert {}', 'Value $1'); T('Wert {} ·', 'Value $1 ·');
T('endet in {n} T {n} Std', 'ends in $1 d $2 h'); T('endet in {n} Std {n} Min', 'ends in $1 h $2 min'); T('endet in {n} Min', 'ends in $1 min');
T('läuft bis {}', 'runs until $1');
T('Dein Kaufangebot an {}', 'Your purchase offer to $1'); T('Dein Verkaufsangebot an {}', 'Your sale offer to $1');
T('Gegenangebot von {}', 'Counteroffer from $1'); T('Verkaufsangebot von {}', 'Sale offer from $1'); T('Kaufangebot von {}', 'Purchase offer from $1');
T('{} · verlassen', '$1 · abandoned');
T('Versteigerungen in {}', 'Auctions in $1');
T('{} – angenommen', '$1 – accepted'); T('{} – abgelehnt', '$1 – declined'); T('{} – Gegenangebot', '$1 – counteroffer');

// ---- Börse
X([
  ['Börse', 'Stock exchange'], ['Markt', 'Market'], ['Von der Börse nehmen', 'Delist'], ['Der Betrieb ist nicht mehr börsennotiert.', 'The business is no longer listed.'],
  ['Streubesitz (%)', 'Free float (%)'], ['Ausschüttung vom Gewinn (%)', 'Payout from profit (%)'], ['An die Börse', 'Go public'],
  ['Dein Betrieb wird in 1.000 Anteile geteilt. Den Streubesitz bietest du zum fairen Kurs an; du erhältst bei jedem Verkauf den Erlös. Danach zahlt der Betrieb täglich eine Ausschüttung an alle Aktionäre – auch an dich. Wer 50 % der Anteile hält, kann den Betrieb übernehmen.',
    'Your business is divided into 1,000 shares. You offer the free float at the fair price; you receive the proceeds from every sale. After that the business pays a daily payout to all shareholders – including you. Whoever holds 50 % of the shares can take over the business.'],
  ['Börsengang geglückt!', 'IPO successful!'], ['Anteile', 'Shares'], ['Kauforder', 'Buy order'], ['Verkaufsorder', 'Sell order'],
  ['Order liegt im Orderbuch.', 'Order is in the order book.'], ['Die Börse ist gerade geschlossen.', 'The stock exchange is closed right now.'],
  ['dein Betrieb', 'your business'], ['Mein Depot', 'My portfolio'], ['Du hältst keine Aktien.', 'You hold no shares.'], ['Offene Orders', 'Open orders'],
  ['Zurücknehmen', 'Cancel'], ['Keine offenen Orders.', 'No open orders.'], ['Order zurückgenommen.', 'Order cancelled.'], ['Übernehmen', 'Take over'],
  ['Du übernimmst den Betrieb als Mehrheitsaktionär. Der bisherige Eigentümer bleibt Minderheitsaktionär.', 'You take over the business as majority shareholder. The previous owner remains a minority shareholder.'],
  ['Übernahme vollzogen.', 'Takeover completed.'], ['Kein Verkaufsangebot', 'No asks'], ['kein Kaufgebot', 'no bids'],
  ['Spielerbetriebe können an die Börse gehen: 1.000 Anteile, davon 10–49 % im Streubesitz.', 'Player businesses can go public: 1,000 shares, of which 10–49 % are free float.'],
  ['Börsennotierte Betriebe schütten täglich einen Teil ihres Gewinns an alle Aktionäre aus.', 'Listed businesses pay out part of their profit to all shareholders every day.'],
  ['Wer 50 % oder mehr der Anteile hält, kann den Betrieb übernehmen. Der bisherige Eigentümer bleibt Minderheitsaktionär.', 'Whoever holds 50 % or more of the shares can take over the business. The previous owner remains a minority shareholder.'],
  ['Preise sind intern „Wert von 1945“; jeder zahlt in seiner eigenen Währung.', 'Prices are internally “1945 value”; everyone pays in their own currency.'],
  ['Börsengang', 'IPO'], ['Börse …', 'Exchange …'],
]);
T('{} an der Börse', '$1 on the stock exchange');
T('{n} von 1.000 Anteilen liegen bei anderen. Ausschüttung: {} % des Tagesgewinns an alle Anteilseigner. Mehrheitsaktionäre (ab 50 %) können den Betrieb übernehmen.', '$1 of 1,000 shares are held by others. Payout: $2 % of the daily profit to all shareholders. Majority shareholders (from 50 %) can take over the business.');
T('Börsengang: {}', 'IPO: $1');
T('{}: Kaufen', '$1: Buy'); T('{}: Verkaufen', '$1: Sell');
T('Kurs {} · Fairer Wert {}. Ein Kauf reserviert den Höchstpreis sofort; zu viel gezahltes Geld kommt zurück. Nicht ausgeführte Teile bleiben als Order offen.', 'Price $1 · Fair value $2. A purchase reserves the maximum price immediately; any overpaid money is refunded. Unfilled parts remain as an open order.');
T('Kurs {} · Fairer Wert {} · Du besitzt {n} Anteile. Ein Kauf reserviert den Höchstpreis sofort; zu viel gezahltes Geld kommt zurück. Nicht ausgeführte Teile bleiben als Order offen.', 'Price $1 · Fair value $2 · You own $3 shares. A purchase reserves the maximum price immediately; any overpaid money is refunded. Unfilled parts remain as an open order.');
T('Höchstpreis je Anteil ({})', 'Maximum price per share ($1)'); T('Mindestpreis je Anteil ({})', 'Minimum price per share ($1)');
T('Höchstens {}', 'At most $1');
T('{n} Anteile ausgeführt, {n} offen.', '$1 shares executed, $2 open.'); T('{n} Anteile ausgeführt.', '$1 shares executed.');
T('Verkauf: {}', 'Asks: $1'); T('Kauf: {}', 'Bids: $1'); T('Kauf {} × {}', 'Buy $1 × $2'); T('Verkauf {} × {}', 'Sell $1 × $2');
T('fair {}', 'fair $1'); T('Umsatz {n}', 'Volume $1'); T('Ausschüttung {} %', 'Payout $1 %');
T('Du hältst', 'You hold'); T('Anteile ({n},{n} %)', 'shares ($1.$2 %)'); T('Anteile ({n} %)', 'shares ($1 %)'); T('{n} Anteile · Kurs {}', '$1 shares · price $2');
T('Noch ist kein Betrieb börsennotiert. Starte unter „Unternehmen“ den ersten Börsengang (Mindestwert {}).', 'No business is listed yet. Start the first IPO under “Business” (minimum value $1).');
T('{} übernehmen?', 'Take over $1?');
T('Kein Verkaufsangebot · kein Kaufgebot', 'No asks · no bids');
patterns.push(['^([+\\-−]?\\d+),(\\d+) %$', '$1.$2 %']);
patterns.push(['^\\(([+\\-−]?\\d+),(\\d+) %\\)$', '($1.$2 %)']);

// ---- Bank
X([
  ['Bank & Kredite', 'Bank & loans'], ['Die Bank vergibt gerade keine Kredite.', 'The bank is not granting loans right now.'],
  ['Kreditrahmen', 'Credit limit'], ['Schulden', 'Debt'], ['Noch verfügbar', 'Still available'], ['Zinssatz neuer Kredite', 'Interest rate for new loans'],
  ['Laufzeit (Jahre)', 'Term (years)'], ['Kredit aufnehmen', 'Take out loan'], ['Neuer Kredit', 'New loan'], ['Deine Kredite', 'Your loans'],
  ['Ganz tilgen', 'Repay in full'], ['Teil …', 'Part …'], ['Wie viel zurückzahlen?', 'How much to repay?'],
  ['Der Rahmen richtet sich nach deinen Immobilien, Betrieben und deinem Einkommen. Die Rate wird täglich abgebucht; sinkt dein Konto unter null, droht die Insolvenz.', 'The limit depends on your property, businesses and income. The installment is debited daily; if your account falls below zero, insolvency looms.'],
  ['Restlaufzeit abgelaufen', 'term expired'], ['Restschuld', 'remaining debt'],
]);
T('{} % p. a.', '$1 % p.a.'); T('mind. {}', 'min. $1');
T('Rate ca. {} pro Tag · Gesamtzins ca. {}', 'Installment approx. $1 per day · total interest approx. $2');
T('Restschuld · {} % · Rate {} / Tag · noch {n} J. {n} Mon.', 'Remaining debt · $1 % · installment $2 / day · $3 y. $4 mo. left'); T('Restschuld · {} % · Rate {} / Tag · noch {n} J.', 'Remaining debt · $1 % · installment $2 / day · $3 y. left'); T('Restschuld · {} % · Rate {} / Tag · noch {n} Tage', 'Remaining debt · $1 % · installment $2 / day · $3 days left');
T('Restschuld · {} % · Rate {} / Tag · Restlaufzeit abgelaufen', 'Remaining debt · $1 % · installment $2 / day · term expired');
T('noch {} J. {} Mon.', '$1 y. $2 mo. left'); T('noch {} J.', '$1 y. left'); T('noch {} Tage', '$1 days left'); T('{n} J. {n} Mon.', '$1 y. $2 mo.'); T('{n} J.', '$1 y.');
T('Rate {} / Tag', 'installment $1 / day'); T('Rate {} / Tag', 'installment $1 / day');
T('davon Steuern', 'of which taxes');

// ---- Wettbewerb
X([
  ['Industriespionage', 'Industrial espionage'], ['Preiskampf', 'Price war'], ['Mitarbeiter abwerben', 'Poach employees'], ['Sabotage', 'Sabotage'],
  ['Du erfährst Wert, Gewinn, Kasse und Personal des Betriebs. Kein Schaden, aber du kannst dabei auffallen.', 'You learn the value, profit, cash and staff of the business. No damage, but you may be noticed.'],
  ['Du unterbietest die Preise: Der Umsatz des Betriebs sinkt für einige Tage.', 'You undercut the prices: the business’s revenue drops for a few days.'],
  ['Ein Mitarbeiter wechselt die Seite – der Betrieb arbeitet weniger effizient.', 'An employee switches sides – the business works less efficiently.'],
  ['Ein Anschlag legt den Betrieb für einige Tage lahm und verursacht Reparaturkosten. Hohes Risiko: wirst du erwischt, zahlst du eine hohe Strafe.', 'An attack paralyses the business for a few days and causes repair costs. High risk: if you are caught, you pay a heavy fine.'],
  ['Du nimmst nicht am Wettbewerb teil. Du kannst das unter Spieler → Mein Profil einschalten.', 'You are not taking part in competition. You can switch it on under Players → My profile.'],
  ['Der Wettbewerb ist gerade abgeschaltet.', 'Competition is switched off right now.'],
  ['Du bist wegen Verstößen vorübergehend vom Wettbewerb ausgeschlossen.', 'You are temporarily excluded from competition because of violations.'],
  ['Du wurdest wegen wiederholter Verstöße vorübergehend vom Wettbewerb ausgeschlossen.', 'You have been temporarily excluded from competition because of repeated violations.'],
  ['Schutz für Betriebe: Sicherheitsdienst (wehrt Angriffe oft ab, erhöht die Entdeckungschance) und Gebäudeversicherung (zahlt Reparaturen).', 'Protection for businesses: security service (often fends off attacks, raises the chance of detection) and building insurance (pays for repairs).'],
  ['Sabotage wirklich versuchen?', 'Really attempt sabotage?'],
  ['Ein Anschlag schadet dem Betrieb. Wirst du erwischt, zahlst du eine hohe Strafe, der Gegner erfährt deinen Namen und es erscheint in der Zeitung.', 'An attack harms the business. If you are caught, you pay a heavy fine, the opponent learns your name and it appears in the newspaper.'],
  ['Anschlag ausführen', 'Carry out attack'], ['Kasse', 'Cash'], ['Räume · Personal', 'Rooms · staff'], ['Sicherheitsdienst', 'Security service'], ['ja', 'yes'], ['nein', 'no'],
  ['Du bist aufgefallen und zahlst eine Strafe.', 'You were noticed and pay a fine.'],
  ['Erfolgreich – aber du wurdest erwischt!', 'Successful – but you were caught!'], ['Erfolgreich, unbemerkt.', 'Successful, unnoticed.'], ['Abgewehrt – und du wurdest erwischt.', 'Fended off – and you were caught.'],
  ['Du nimmst jetzt am Wettbewerb teil.', 'You are now taking part in competition.'], ['Du bist ausgestiegen.', 'You have opted out.'],
  ['Ich nehme am Wettbewerb teil', 'I take part in competition'], ['Sicherheitsdienst abbestellen', 'Cancel security service'],
  [': Du kannst Betriebe anderer ausspionieren, im Preis unterbieten, Mitarbeiter abwerben oder sabotieren – und selbst Ziel werden.', ': You can spy on other players’ businesses, undercut their prices, poach employees or sabotage them – and become a target yourself.'],
  ['Der Wettbewerb ist für', 'Competition is'], ['alle Spieler aktiv', 'active for all players'],
]);
T('Wettbewerb: {}', 'Competition: $1');
{
  const base = 'Teilnehmer können gegenseitig Betriebe ausspionieren, im Preis unterbieten, Mitarbeiter abwerben oder sabotieren (mit Risiko und Strafe). Nur wer selbst teilnimmt, kann Ziel werden. Nach der Anmeldung bleibst du mindestens {n} Tage dabei.';
  const eb = 'Participants can spy on each other’s businesses, undercut prices, poach employees or sabotage them (with risk and penalty). Only those who take part themselves can become a target. After signing up you stay in for at least $1 days.';
  for (const [d1, e1, pre] of [[' Ausstieg möglich ab {}.', ' You can opt out from $2.', true], ['', '', false]]) {
    for (const [d2, e2] of [[' Du bist derzeit gesperrt.', ' You are currently blocked.'], ['', '']]) T(base + d1 + d2, eb + e1 + e2);
  }
}
T('Du musst in der Stadt des Betriebs wohnen. Jede Aktion kostet Geld; mit Risiko von ca. {n} % (je nach Aktion) wirst du erwischt – dann zahlst du das {n}-Fache der Kosten als Strafe und der Gegner erfährt deinen Namen. {n}/{n} Verstößen im Fenster; bei {n} wirst du gesperrt.',
  'You must live in the city of the business. Every action costs money; with a risk of about $1 % (depending on the action) you will be caught – then you pay $2 times the cost as a fine and the opponent learns your name. $3/$4 violations in the window; at $5 you are blocked.');
for (const [d, e] of [
  ['Du erfährst Wert, Gewinn, Kasse und Personal des Betriebs. Kein Schaden, aber du kannst dabei auffallen.', 'You learn the value, profit, cash and staff of the business. No damage, but you may be noticed.'],
  ['Du unterbietest die Preise: Der Umsatz des Betriebs sinkt für einige Tage.', 'You undercut the prices: the business’s revenue drops for a few days.'],
  ['Ein Anschlag legt den Betrieb für einige Tage lahm und verursacht Reparaturkosten. Hohes Risiko: wirst du erwischt, zahlst du eine hohe Strafe.', 'An attack paralyses the business for a few days and causes repair costs. High risk: if you are caught, you pay a heavy fine.'],
]) { T(d + ' (−{n} % Umsatz, {n} Tage)', e + ' (−$1 % revenue, $2 days)'); T(d + ' ({n} Tage Ausfall)', e + ' ($1 days of outage)'); }
T('Ein Mitarbeiter wechselt die Seite – der Betrieb arbeitet weniger effizient. ({n} Tage Ausfall)', 'An employee switches sides – the business works less efficiently. ($1 days of outage)');

// ---- Vermietung, Immobilien, Betriebe
X([
  ['Auch an Spieler vermieten', 'Also let to players'], ['im Stadtverzeichnis', 'in the city directory'], ['Spieler-Mieter kündigen', 'Give notice to player tenant'],
  ['Mieter kündigen?', 'Give the tenant notice?'], ['Der Spieler verliert sofort seine Wohnung.', 'The player loses their home immediately.'], ['Kündigen', 'Give notice'],
  ['Du wohnst zur Miete bei einem anderen Spieler. Der Vermieter kann kündigen; du kannst jederzeit ausziehen.', 'You rent from another player. The landlord can give notice; you can move out at any time.'],
  ['Ausziehen', 'Move out'], ['Ausziehen?', 'Move out?'],
  ['Du beendest den Mietvertrag und wohnst danach auf der Straße, bis du etwas Neues findest.', 'You end the tenancy and will then live on the street until you find something new.'],
  ['An Spieler verkaufen …', 'Sell to a player …'], ['An Spieler …', 'To a player …'], ['Mieter zahlt nicht', 'Tenant not paying'],
  ['Qualifikation fehlt', 'Qualification missing'], ['Konkurrenz', 'Competition'],
  ['Betriebe dieser Art in der Stadt (Spieler)', 'Businesses of this kind in the city (players)'],
  ['Du besitzt noch keine Immobilie. Sparen lohnt sich – Eigentum steigt über Jahrzehnte im Wert.', 'You do not own any property yet. Saving pays off – property gains value over decades.'],
  ['davon Mieteinnahmen', 'of which rental income'], ['davon Kreditrate', 'of which loan installment'],
  ['Zurück zu meinem Wohnort', 'Back to my home city'], ['Ort suchen …', 'Search place …'], ['Ort suchen', 'Search place'], ['Kein Ort gefunden.', 'No place found.'],
  ['Große Städte zum Schnellstart:', 'Large cities for a quick start:'], ['Stadt oder Dorf suchen … (rund 9.000 Orte)', 'Search a city or village … (about 9,000 places)'],
  ['Stadtplatz-Chat', 'City square chat'],
  ['Baden-Württemberg', 'Baden-Württemberg'], ['Mecklenburg-Vorpommern', 'Mecklenburg-Western Pomerania'], ['Nordrhein-Westfalen', 'North Rhine-Westphalia'],
  ['Rheinland-Pfalz', 'Rhineland-Palatinate'], ['Sachsen-Anhalt', 'Saxony-Anhalt'], ['Schleswig-Holstein', 'Schleswig-Holstein'],
  ['Bayern', 'Bavaria'], ['Niedersachsen', 'Lower Saxony'], ['Sachsen', 'Saxony'], ['Thüringen', 'Thuringia'], ['Hessen', 'Hesse'],
  ['Moderator', 'Moderator'],
]);
T('Mieter: {}', 'Tenant: $1'); T('. Gebühren (Grunderwerbsteuer 3,5 %) trägst du zusätzlich.', '. Fees (real estate transfer tax 3.5 %) are charged on top.'); T('. Gebühren (Beurkundung 1,5 %) trägst du zusätzlich.', '. Fees (notarisation 1.5 %) are charged on top.'); T('Mietersuche · {n} Tage leer', 'Looking for a tenant · $1 days vacant'); T('noch ca. {n} Mon.', 'approx. $1 mo. left');
T('Angebote in {}. Du kannst sie bewohnen oder vermieten – und in anderen Städten über die Zeitung kaufen.', 'Offers in $1. You can live in them or let them out – and buy in other cities through the newspaper.');
T('{n} Zimmer · Zustand {n} % · Miete möglich: ca. {} / Tag', '$1 rooms · condition $2 % · possible rent: approx. $3 / day');
T('{n} Zimmer · Zustand {n} %', '$1 rooms · condition $2 %'); T('Miete möglich: ca. {} / Tag', 'possible rent: approx. $1 / day');
T('{} fehlen', '$1 missing');
T('Ein Konkurrent unterbietet deine Preise: Umsatz −{n} % (noch {n} Tage).', 'A competitor is undercutting your prices: revenue −$1 % ($2 days left).');
T('Produktionsausfall nach einem Anschlag: noch {n} Tage kein Umsatz.', 'Production outage after an attack: no revenue for another $1 days.');
T('Konkurrenz: {n} Betriebe dieser Art in {}, {n} von {n} Räumen Nachfrage', 'Competition: $1 businesses of this kind in $2, $3 of $4 rooms of demand');
T('Konkurrenz: {n} Betriebe dieser Art in {}, {n} von {n} Räumen Nachfrage – Umsatz ×{n},{n}', 'Competition: $1 businesses of this kind in $2, $3 of $4 rooms of demand – revenue ×$5.$6'); T('Konkurrenz: {n} Betriebe dieser Art in {}, {n} von {n} Räumen Nachfrage – Umsatz ×{n}', 'Competition: $1 businesses of this kind in $2, $3 of $4 rooms of demand – revenue ×$5');
T('Konkurrenz: {n} · Nachfrage {n}/{n}', 'Competition: $1 · demand $2/$3');
T('Börsennotiert, {} % Ausschüttung', 'Listed, $1 % payout');
T('Zu {} ausbauen · {}', 'Upgrade to $1 · $2');
T('{}, {}', '$1, $2');
patterns.pop(); // zu allgemein

// ---- Ort (Karte, Zeitung, Charaktererstellung)
T('{n} Einwohner', '$1 residents'); T('{}k Einwohner', '$1k residents');
T('seit {n}', 'since $1');
T('{} (dein Wohnort) – anderen Ort lesen …', '$1 (your home city) – read another place …');
T('{} – anderen Ort lesen …', '$1 – read another place …');
for (const [de, en] of [['Metropole', 'Metropolis'], ['Großstadt', 'Large city'], ['Stadt', 'City'], ['Kleinstadt', 'Small town'], ['Gemeinde', 'Municipality'], ['Dorf', 'Village']]) X([[de, en]]);


// ---- Konto (account.ejs und Meldungen)
X([
  ['Das Konto wird', 'The account will be'], ['endgültig', 'permanently'],
  ['gelöscht: Charaktere, Spielstände, Coins, EFS, Dauerkarte, Freunde, Briefe an dich, Chat-Beiträge und Betriebe. Beziehungen und Arbeitsverhältnisse mit anderen Spielern enden. Briefe, die du anderen geschickt hast, bleiben ohne Absender erhalten. Käufe bleiben anonymisiert gespeichert, weil das Gesetz eine Aufbewahrung vorschreibt.',
    'deleted: characters, saved games, coins, EFS, season pass, friends, letters sent to you, chat posts and businesses. Relationships and employment with other players end. Letters you sent to others remain without a sender. Purchases remain stored anonymised because the law requires retention.'],
  ['Das lässt sich nicht rückgängig machen.', 'This cannot be undone.'], ['LÖSCHEN', 'DELETE'],
  ['Passwort geändert.', 'Password changed.'], ['E-Mail-Adresse geändert.', 'Email address changed.'], ['Das aktuelle Passwort stimmt nicht.', 'The current password is incorrect.'],
  ['Die beiden neuen Passwörter sind nicht gleich.', 'The two new passwords do not match.'], ['Bitte eine gültige E-Mail-Adresse angeben.', 'Please enter a valid email address.'],
  ['Diese E-Mail-Adresse wird schon verwendet.', 'This email address is already in use.'], ['Während der Admin-Ansicht kann kein Konto gelöscht werden.', 'No account can be deleted while in admin view.'],
  ['Das Passwort stimmt nicht.', 'The password is incorrect.'], ['Bitte tippe zur Bestätigung LÖSCHEN (bzw. DELETE) ein.', 'Please type DELETE to confirm.'],
  ['Du bist der letzte Admin. Vergib zuerst die Admin-Rolle an jemand anderen.', 'You are the last admin. First give the admin role to someone else.'],
]);

// ---- Tagesblatt
X([
  ['Das Tagesblatt', 'The Daily Gazette'], ['Alle Meldungen →', 'All reports →'], ['Tagesblatt', 'Daily Gazette'],
  ['Was in der Welt von Turning Point passiert – live aus allen Städten.', 'What is happening in the world of Turning Point – live from every city.'],
  ['jetzt online', 'online now'], ['aktiv in 24 Std', 'active in 24 h'], ['Geld im Umlauf', 'Money in circulation'], ['(Wert 1945)', '(1945 value)'],
  ['Betriebe', 'Businesses'], ['Geschäfte heute', 'Deals today'], ['Börsenwerte', 'Listed stocks'],
  ['Spieler gesamt', 'Players in total'], ['lebende Charaktere', 'living characters'], ['Immobilien', 'Properties'], ['laufende Versteigerungen', 'running auctions'], ['Börsenumsatz 24 Std', 'Stock turnover 24 h'],
  ['Noch keine Meldungen. Sobald die ersten Spieler etwas bewegen, steht es hier.', 'No reports yet. As soon as the first players make a move, it will appear here.'],
  ['Wirtschaft', 'Economy'], ['Chronik', 'Chronicle'], ['Börse', 'Stock exchange'], ['Lokales', 'Local'], ['Nachruf', 'Obituary'],
]);

X([['Kind adoptieren', 'Adopt a child'], ['Ein Kind adoptieren (Verfahren dauert etwa fünf Monate)', 'Adopt a child (the procedure takes about five months)'], ['Antrag zurückziehen', 'Withdraw application']]);
patterns.push(['^Adoption läuft · noch ca\\. (\\d+) Mon\\.$', 'Adoption pending · about $1 mo.']);

X([['Baufirma beauftragen', 'Hire a construction firm'], ['Eine Baufirma aus der Stadt wird beauftragt und bezahlt', 'A construction firm from the city is hired and paid']]);
patterns.push(['^Baufirma beauftragen · (.+)$', 'Hire a construction firm · $1']);

patterns.push(['^auffüllen · ≈ (.+) / Tag · hält ca\\. (\\d+) Tage$', 'refill · ≈ $1 / day · lasts about $2 days']);

// Negative Beträge in „Wert 1945“
patterns.push(['^([−-][\\d.,kmbt]+) DM \\(Wert 1945\\)$', '$1 DM (1945 value)']);

module.exports = { exact, patterns };
