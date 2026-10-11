'use strict';
/**
 * Standardwerte für „Gesellschaft“: Vereine, Gemeinden (Glaubensgemeinschaften), Stiftungen, Titel und Ränge (Einstellung `gesellschaft`, im Admin änderbar).
 * Alle Beträge mit Endung `Real` sind Cent „Wert von 1945“ (Kaufkraft), sie werden beim Buchen mit dem Preisindex des Spielers in seine Währung umgerechnet.
 * Zeiten sind echte Stunden (ein echter Tag entspricht einem Spieljahr). `effects.strength` skaliert alle Wirkungen (0 = aus, 1 = normal, 2 = doppelt).
 */
const KINDS = [
  { key: 'sport', name: 'Sportverein', icon: 'trophy', what: 'Gemeinsamer Sport hält gesund und fit.', fx: { health: 2, rest: 0.8 } },
  { key: 'kultur', name: 'Kulturverein', icon: 'music', what: 'Chor, Theater und Feste heben die Stimmung.', fx: { wellbeing: 1.5 } },
  { key: 'handwerk', name: 'Handwerker- und Gewerbeverein', icon: 'hammer', what: 'Betriebe tauschen sich aus und werben gemeinsam: ein kleines Umsatzplus.', fx: { revPct: 0.5 } },
  { key: 'wohltat', name: 'Wohltätigkeitsverein', icon: 'hand-coins', what: 'Spenden sammeln und helfen: Feste dieses Vereins stärken das Gemeinwohl doppelt.', fx: { wellbeing: 0.8 }, eventRepMult: 2 },
];

const FAITHS = [
  { key: 'evangelisch', name: 'Evangelische Gemeinde', ceremony: { wedding: 'Kirchliche Trauung', baptism: 'Taufe', funeral: 'Trauerfeier' } },
  { key: 'katholisch', name: 'Katholische Gemeinde', ceremony: { wedding: 'Kirchliche Trauung', baptism: 'Taufe', funeral: 'Trauerfeier' } },
  { key: 'juedisch', name: 'Jüdische Gemeinde', ceremony: { wedding: 'Trauung unter dem Hochzeitsbaldachin', baptism: 'Namensgebung', funeral: 'Trauerfeier' } },
  { key: 'muslimisch', name: 'Muslimische Gemeinde', ceremony: { wedding: 'Religiöse Trauung', baptism: 'Namensfeier', funeral: 'Trauerfeier' } },
  { key: 'frei', name: 'Freie Gemeinde', ceremony: { wedding: 'Freie Trauung', baptism: 'Namensfeier', funeral: 'Trauerfeier' } },
];

const PURPOSES = [
  { key: 'bildung', name: 'Bildung und Schule', icon: 'graduation-cap', what: 'Schulspeisung, Bücher und Stipendien: Kinder der Stadt sind zufriedener.' },
  { key: 'gesundheit', name: 'Gesundheit und Pflege', icon: 'heart-pulse', what: 'Krankenpflege und Erholung: die Bürger der Stadt erholen sich etwas besser.' },
  { key: 'kultur', name: 'Kunst und Kultur', icon: 'music', what: 'Konzerte, Museen und Feste: die Stimmung in der Stadt steigt.' },
  { key: 'armut', name: 'Armenhilfe', icon: 'hand-coins', what: 'Suppenküche und Nothilfe: Gemeinden können in der Not mehr helfen.' },
  { key: 'familie', name: 'Familienstiftung', icon: 'users', what: 'Das Vermögen bleibt in der Familie: jährliche Auszahlung an die Nachkommen, kein Gemeinwohl-Ansehen.', family: true },
];

/**
 * Titel: rank-Stufen (1 bis 3). req je Stufe: lvl (Mindeststufe des Ansehens), donated (Spenden insgesamt), contributed (in Stiftungen eingebracht),
 * biz (Betriebswert), staff (Mitarbeiter), chair (Mitglieder des geleiteten Vereins), chairDays, office (höchstes vollendetes Amt + 1).
 * Wirkungen je Stufe: vote (Prozentpunkte Stimmengewicht bei Wahlen), fee (Prozent weniger Kandidaturgebühr), rev (Prozent Umsatz der Betriebe), slots (zusätzliche Vereine).
 */
const TITLES = [
  { key: 'ehrenbuerger', name: 'Ehrenbürger', scope: 'person', city: true, auto: false, ranks: ['Ehrenbürger'], fx: { vote: [1], fee: [10], rev: [0], slots: [0] },
    what: 'Vom Bürgermeister verliehen. Wer sich um die Stadt verdient gemacht hat, trägt den Titel, solange er lebt.' },
  { key: 'kommerzienrat', name: 'Kommerzienrat', scope: 'person', auto: true, ranks: ['Kommerzienrat', 'Geheimer Kommerzienrat', 'Wirklicher Geheimer Kommerzienrat'],
    req: [{ lvl: 2, donated: 20000, biz: 5000000, staff: 6 }, { lvl: 3, donated: 150000, biz: 30000000, staff: 20 }, { lvl: 3, donated: 600000, biz: 150000000, staff: 45 }],
    fx: { vote: [1, 1.5, 2], fee: [10, 15, 20], rev: [0.5, 1, 1.5], slots: [0, 1, 1] },
    what: 'Für Unternehmer mit gutem Ruf, die ihrer Stadt etwas zurückgeben: Betrieb, Arbeitsplätze und Spenden zählen.' },
  { key: 'stifter', name: 'Stifter', scope: 'family', auto: true, ranks: ['Stifter', 'Großstifter', 'Ehrenstifter'],
    req: [{ contributed: 1000000 }, { contributed: 5000000 }, { contributed: 25000000 }],
    fx: { vote: [1, 1.5, 2], fee: [10, 15, 20], rev: [0, 0, 0], slots: [0, 0, 1] },
    what: 'Wer Vermögen dauerhaft in eine Stiftung einbringt. Der Titel gehört der Familie und bleibt über Generationen.' },
  { key: 'maezen', name: 'Mäzen', scope: 'family', auto: true, ranks: ['Förderer', 'Wohltäter', 'Mäzen'],
    req: [{ donated: 100000 }, { donated: 500000 }, { donated: 2000000 }],
    fx: { vote: [0.5, 1, 1.5], fee: [5, 10, 15], rev: [0, 0, 0], slots: [0, 0, 0] },
    what: 'Wer Vereinen, Gemeinden und Stiftungen über die Jahre viel spendet. Der Titel gehört der Familie.' },
  { key: 'ehrenvorsitz', name: 'Ehrenvorsitzender', scope: 'person', auto: true, ranks: ['Vereinsvorsitzender', 'Ehrenvorsitzender'],
    req: [{ chair: 5, chairDays: 3 }, { chair: 15, chairDays: 14 }],
    fx: { vote: [0.5, 1], fee: [0, 5], rev: [0, 0], slots: [1, 1] },
    what: 'Wer einen lebendigen Verein verlässlich führt – ohne Kassenskandal.' },
  { key: 'altamt', name: 'Altbürgermeister', scope: 'person', auto: true, ranks: ['Altbürgermeister', 'Staatsrat', 'Altbundeskanzler'],
    req: [{ office: 3 }, { office: 4 }, { office: 6 }],
    fx: { vote: [1, 1.5, 2], fee: [10, 15, 20], rev: [0, 0, 0], slots: [0, 1, 1] },
    what: 'Für alle, die ein hohes Amt ordentlich zu Ende geführt haben: Bürgermeister, Landtag oder Bundeskanzler.' },
];

module.exports = {
  enabled: true,
  minAccountHours: 12, blockSameIp: true, minGameDays: 15,
  clubs: {
    enabled: true, kinds: KINDS,
    foundFeeReal: 4000, foundMinGameDays: 20, maxFounded: 2, maxMemberships: 4, maxMembers: 60, nameMin: 3, nameMax: 40, descMax: 200,
    feeMaxReal: 6000, feeDefaultReal: 1200, feeIntervalHours: 24, graceHours: 48, catchUpMax: 2, lapseDays: 7, rejoinHours: 12, feeChangeHours: 24,
    minActive: 3,                                              // ab so vielen Mitgliedern wirkt ein Verein (Gesundheit, Stimmung, Umsatz)
    event: { costReal: 1500, cooldownHours: 12, minMembers: 3, wellbeing: 4, rep: 0.8, windowHours: 48 },
    donate: { minReal: 100, dayCapReal: 30000, rep: 0.5 },
    withdraw: { enabled: true, minMembers: 2, scandal: 12 },   // „Privat entnehmen“ = Veruntreuung: sichtbar im Kassenbuch, Spur für das Gericht, Skandal
    mistrust: { pct: 50, min: 3 },                             // mehr als so viele Prozent der Mitglieder (mindestens min) stimmen gegen den Vorsitz → Abwahl
    endorse: { perMemberPct: 0.25, clubCapPct: 2.5, totalCapPct: 4, fundedMult: 1.5, costReal: 2000, minMembers: 4, minMemberHours: 24 },
    ledgerKeep: 100, ledgerDays: 120, dissolvedKeepDays: 30,
  },
  parish: {
    enabled: true, faiths: FAITHS,
    minGameDays: 10, changeCooldownHours: 48, nameMax: 40,
    donate: { minReal: 100, dayCapReal: 30000, rep: 0.8, standingRef: 2000, standingScale: 8, standingDayCap: 12, decayPct: 1 },
    levels: [{ at: 0, name: 'Neu in der Gemeinde' }, { at: 8, name: 'Gemeindeglied' }, { at: 25, name: 'Stütze der Gemeinde' }, { at: 55, name: 'Ehrenmitglied' }],
    aid: { enabled: true, minMemberHours: 48, minStanding: 8, maxReal: 2500, cooldownHours: 72, fundSharePct: 15, needDays: 8, ipLookbackHours: 336, potBonusPct: 100 },
    ceremonies: {
      wedding: { feeReal: 3000, partner: 12, well: 3, rep: 0.8 },
      baptism: { feeReal: 1200, child: 12, well: 2, rep: 0.4, maxAge: 3 },
      funeral: { feeReal: 2000, well: 5, kids: 4, rep: 0.6, keepDays: 400 },
    },
    fx: { wellbeing: 0.8 },
    ledgerKeep: 120, ledgerDays: 120,
  },
  foundation: {
    enabled: true, purposes: PURPOSES,
    minCapitalReal: 1000000, giveMinReal: 50000, foundFeeReal: 20000, minLevel: 1, minGameDays: 60, nameMin: 3, nameMax: 40,
    yieldPct: 3, payoutMinPct: 1.5, payoutMaxPct: 6, payoutDefaultPct: 3, tickHours: 24, catchUpMax: 14, yieldCapReal: 2000000000,
    lockHours: 720, dissolveFeePct: 10, willMaxPct: 30, rep: { give: 3, pay: 0.6 },
    pot: { decayPct: 8, refReal: 60000, maxEffect: 1, tierRef: 1 },                // Gemeinwohl-Topf der Stadt: Auszahlungen wirken nach und klingen ab
    ledgerKeep: 100, ledgerDays: 120,
  },
  pot: { fx: { bildung: { kids: 0.2 }, gesundheit: { health: 1.2 }, kultur: { wellbeing: 1 }, armut: { aid: 1 } } },
  titles: { enabled: true, list: TITLES, maxVotePct: 4, maxFeeDiscPct: 25, checkMinutes: 10, repOnGrant: 3 },
  elections: { maxBoostPct: 6 },
  effects: { strength: 1 },
  bots: { enabled: true, join: 0.05, found: 0.012, donate: 0.03, event: 0.05, parish: 0.04, foundation: 0.004, embezzle: 0.002 },
};
