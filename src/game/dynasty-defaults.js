'use strict';
/**
 * Standardwerte „Werben, Ehe und Familienunternehmen“ (Einstellung `familie`, im Admin änderbar).
 * Beträge mit Endung `Real` sind Cent „Wert von 1945“ (Kaufkraft) und werden beim Buchen mit dem Preisindex des Spielers umgerechnet;
 * Kosten in `cost` sind Vielfache des Geschenkpreises (`econ.giftCost`). Zeiten sind Spieltage (ein Spieltag ≈ 4 Minuten echte Zeit, ein Spieljahr = 24 Stunden).
 * Streng realistisch: Ehe und Partnerschaft nur zwischen Mann und Frau, Adoption bleibt, keine Waffen, nichts wird gesperrt.
 * `effects.strength` skaliert die Wirkungen von Talent/Auftreten auf das Werben und den Traditionsbonus (0 = aus, 1 = normal, 2 = doppelt).
 */
module.exports = {
  enabled: true,
  effects: { strength: 1 },
  woo: {
    maxActive: 3,                 // so viele Bekanntschaften gleichzeitig
    // Vorlieben: jede Person mag zwei dieser Dinge (deterministisch aus Beruf, Begabung und Alter)
    likes: {
      wort: 'Worte und Aufmerksamkeit', kultur: 'Kultur und Musik', natur: 'Natur und Ausflüge', genuss: 'Gutes Essen und Genuss', heim: 'Familie und Zukunft', bewegung: 'Sport und Bewegung',
    },
    // Aktionen: tag = Vorliebe, cost = Vielfache des Geschenkpreises, cd = Wartezeit (Tage) bis zur nächsten Aktion dieser Art bei derselben Person, talent = geprobte Begabung
    acts: {
      kompliment: { label: 'Kompliment', icon: 'message-circle', tag: 'wort', cost: 0, cd: 3, talent: 'charme', text: 'Ein ehrliches Wort zur rechten Zeit. Kostet nichts, wirkt mit Charme.' },
      brief: { label: 'Brief oder Gedicht', icon: 'mail', tag: 'wort', cost: 0.25, cd: 5, talent: 'bildung', text: 'Schöne Worte zu Papier gebracht: Bildung und Ausdruck zählen (Rhetorik).' },
      gespraech: { label: 'Gespräch über die Zukunft', icon: 'message-circle', tag: 'heim', cost: 0, cd: 6, talent: 'handel', text: 'Wünsche und Pläne besprechen. Verhandlungsgeschick hilft, einen gemeinsamen Weg zu finden.' },
      essen: { label: 'Zum Essen einladen', icon: 'utensils', tag: 'genuss', cost: 1.5, cd: 7, talent: 'charme', text: 'Ein Abend in guter Gesellschaft.' },
      geschenk: { label: 'Kleine Aufmerksamkeit', icon: 'gift', tag: 'genuss', cost: 1, cd: 6, talent: 'charme', text: 'Blumen, ein Buch oder eine Süßigkeit – es geht um die Geste.' },
      konzert: { label: 'Konzert oder Tanzabend', icon: 'music', tag: 'kultur', cost: 2, cd: 9, talent: 'bildung', names: [[1945, 'Tanzabend'], [1960, 'Kino und Tanz'], [1990, 'Konzert']], text: 'Musik und Kultur teilen.' },
      ausflug: { label: 'Ausflug ins Grüne', icon: 'tree-pine', tag: 'natur', cost: 1, cd: 7, talent: 'kondition', text: 'Ein Spaziergang oder eine Fahrt aufs Land.' },
      sport: { label: 'Gemeinsam Sport treiben', icon: 'activity', tag: 'bewegung', cost: 0.5, cd: 7, talent: 'kondition', text: 'Schwimmen, Wandern oder Tanzen: Bewegung verbindet.' },
    },
    // Güte einer Aktion: Grundwert + Vorliebe + Begabung + Auftreten + Rang + Laune + Zufall − Wiederholung; Treffer ab hitAt, Fehlgriff unter missAt
    q: { base: 0.36, liked: 0.26, talent: 0.18, look: 0.08, rank: 0.05, mood: 0.05, noise: 0.3, repeat: 0.15, hitAt: 0.56, missAt: 0.38 },
    gap: 2,                       // Mindestabstand (Tage) zwischen zwei Aktionen bei derselben Person
    gain: { hit: 7, hitMax: 12, mid: 2, miss: -4 },
    start: { base: 16, look: 8, rank: 6, wellbeing: 6, job: 4, home: 4, charme: 5 },   // Anfangssympathie nach dem ersten Treffen (10 bis 45)
    meetCost: 1,                                       // erstes Treffen (× Geschenkpreis)
    visit: { cost: 2, minSym: 40, bonus: 14, sym: 4 },  // Antrittsbesuch bei der Familie
    ask: { minSym: 60, minHits: 3, minDays: 14, cooldown: 10, failSym: -8, maxFails: 2, base: 0.35, perSym: 0.0125, opinion: 0.004, charme: 0.05, min: 0.25, max: 0.95, opinionMin: 20 },
    cold: { afterDays: 45, everyDays: 5, loss: 1, endAfter: 150, coolDays: 240 },   // Wartezeit ohne Kontakt: schwindende Sympathie, danach Abbruch
    rival: { idleDays: 25, everyDays: 30, maxSym: 75, chance: 0.25, loss: 3 },      // Konkurrenz nur mild: höchstens ein kleiner Rückschlag, nie das Ende allein
    jealous: { symFrom: 50, withinDays: 7, loss: 2, everyDays: 30 },                // Eifersucht nur mild
    quick: { hitsToDate: 2, dateSym: 30 },                                          // „Verabredet“ ab Sympathie 30 und 2 Treffern
    startSat: { base: 55, perSym: 0.25, min: 60, max: 85 },                         // Zufriedenheit des Partners zu Beginn
  },
  opinion: { base: 28, rank: 5, standing: 3, job: 8, firm: 8, look: 0.12, dynasty: 3, visit: 12, classPenalty: 3, wealthMax: 10 },
  // Herkunftsfamilien: Gewichte der Klassen 0 bis 3 (bescheiden, gutbürgerlich, wohlhabend, Unternehmerfamilie) und Aussteuer (Real-Cent)
  family: {
    classes: [
      { name: 'Bescheidene Verhältnisse', weight: 40, dowryReal: 0 },
      { name: 'Gutbürgerliche Familie', weight: 38, dowryReal: 60000 },
      { name: 'Wohlhabende Familie', weight: 18, dowryReal: 250000 },
      { name: 'Unternehmerfamilie', weight: 4, dowryReal: 800000 },
    ],
    dowryCapPct: 40, dowryFloorReal: 204400,    // Aussteuer höchstens so viel Prozent des Vermögens (mindestens eines Jahreslohns) – Geld entsteht nie unbegrenzt
    opinionSpan: [0.8, 1.2],                    // Familienmeinung 0 bis 100 skaliert die Aussteuer
    prestige: { repPerClass: 0.6, legacyPerClass: 2, legacyMax: 6 },   // kleiner Ansehens- und Rangvorschuss der Herkunftsfamilie
    firmTierBasePct: 60,                        // Familienbetrieb als Mitgift: so viel Prozent des Grundwerts eines kleinen Betriebs
    homeKinds: ['flat', 'house_small'],
  },
  // Eheverträge (Güterstand). notaryMult × Hochzeitspreis = Notarkosten; dowryMult wirkt auf die Aussteuer.
  contract: {
    kinds: {
      zugewinn: { name: 'Zugewinngemeinschaft', short: 'Gesetzlicher Güterstand', notaryMult: 0, dowryMult: 1, spouseShare: 1, give: false,
        text: 'Der Standard ohne Vertrag: Beide behalten ihr Eigentum. Bei einer Scheidung wird der Zuwachs des Vermögens seit der Hochzeit (inflationsbereinigt) geteilt – wer mehr dazugewonnen hat, zahlt die Hälfte des Unterschieds.' },
      trennung: { name: 'Gütertrennung', short: 'Jeder behält das Seine', notaryMult: 0.5, dowryMult: 0.5, spouseShare: 0.5, give: false,
        text: 'Mit Ehevertrag beim Notar: Jeder behält sein Vermögen, es gibt keinen Ausgleich bei Scheidung. Die Familie des Partners gibt dafür nur die Hälfte der Aussteuer. Sinnvoll für Unternehmer.' },
      mitgift: { name: 'Ehevertrag mit Mitgift', short: 'Aussteuer mit Rückfallklausel', notaryMult: 0.5, dowryMult: 1.5, spouseShare: 1, give: true,
        text: 'Die Familie des Partners bringt mehr ein – bei wohlhabenden Familien als Wohnung, bei Unternehmerfamilien als Familienbetrieb. Bei einer Scheidung fällt die Mitgift an die Familie zurück; einen Zugewinnausgleich gibt es nicht.' },
    },
    divorce: { waitDays: 365, costMult: 1.5, rep: 0 },    // Trennungsjahr, Verfahrenskosten (× Hochzeitspreis)
  },
  // Eheringe (Schmuck): zählen als Platz „Schmuck“ im Charakterblatt, sind nicht verkäuflich und werden vererbt
  ring: {
    levels: [
      { names: [[1945, 'Eheringe aus Silber'], [1990, 'Eheringe aus Silber']], costDays: 12, text: 'Schlichte Ringe: ein Zeichen, kein Prunk.' },
      { names: [[1945, 'Eheringe aus Gold'], [1990, 'Eheringe aus Gold']], costDays: 35, text: 'Klassische Trauringe aus Gold.' },
      { names: [[1945, 'Eheringe mit Brillant'], [1990, 'Eheringe mit Brillant']], costDays: 90, text: 'Handgearbeitet, mit einem funkelnden Stein – ein Stück für Generationen.' },
    ],
    resalePct: 0,
  },
  // Einarbeitung der Kinder im Familienbetrieb
  groom: {
    enabled: true, minAge: 15, maxPerFirm: 2,
    lehrWagePct: 45, nachfolgeWagePct: 80,     // Vergütung (Anteil am Mitarbeiterlohn), zahlt der Betrieb
    lehrUnits: 0.35, nachfolgeUnits: 0.8,      // Beitrag zur Besetzung des Betriebs (Köpfe)
    trainFactor: 0.9,                          // Lehre im Familienbetrieb: praxisnah, etwas kürzer
    growEvery: 90, growMax: 8,                 // alle so viele Tage +1 auf das Talent, das zum Betrieb passt; höchstens so viele Punkte in der Einarbeitung
    readyDays: 1095,                           // Nachfolger: so lange Mitarbeit macht „bereit“
    heirExpCap: 3650,                          // Berufserfahrung (Tage), die der Erbe mitnimmt, höchstens
    successorDiscPct: 25,                      // Fortführungsprivileg: Wert des Betriebs im Pflichtanteil des bereiten Nachfolgers um so viel Prozent geringer
  },
  // Übergabe zu Lebzeiten (vorweggenommene Erbfolge): Betrieb an ein volljähriges, qualifiziertes Kind
  handover: {
    enabled: true, minAge: 55, childMinAge: 18, cooldownDays: 365, maxPerChild: 2,
    freeReal: 400000,                          // Freibetrag je Kind (Real-Cent)
    relief: { company: 85, property: 0 },      // Verschonung in Prozent des Werts (Familienunternehmen)
    rates: [[750000, 7], [3000000, 11], [1e15, 15]],   // [bis Real-Cent, Steuersatz in Prozent]
    feePct: 1.2, feeMinReal: 5000,             // Notar und Register
    altenteilPct: 25,                          // Versorgungsleistung: Anteil am Tagesgewinn des übergebenen Betriebs, solange der Elternteil lebt
  },
  // Traditionsbetrieb: Jahre in Familienhand und Generationen
  tradition: {
    levels: [
      { name: 'Familienbetrieb in zweiter Generation', years: 15, gens: 2, revPct: 0.5, rep: 0.2 },
      { name: 'Traditionsunternehmen', years: 50, gens: 2, revPct: 1, rep: 0.35 },
      { name: 'Jahrhundertunternehmen', years: 100, gens: 3, revPct: 1.5, rep: 0.5 },
    ],
    capPct: 2,                                 // Kundenbindung insgesamt höchstens +2 % Umsatz (alle Betriebe zusammen wirken je Betrieb)
  },
  // Dynastie-Wertung (0 bis 100)
  dynasty: {
    weights: { generations: 18, firms: 22, wealth: 20, standing: 15, kids: 10, bond: 8, inherited: 7 },
    levels: [
      { at: 0, name: 'Zugezogene Familie' }, { at: 20, name: 'Etablierte Familie' }, { at: 40, name: 'Alteingesessene Familie' }, { at: 62, name: 'Bedeutende Dynastie' }, { at: 82, name: 'Große Dynastie' },
    ],
    hysteresis: 2, checkDays: 7, genFull: 5, wealthMinDM: 1000, wealthMaxDM: 5000000, legacyPct: 12, legacyMax: 7, tagesblattFrom: 3,
  },
  bots: { enabled: true, woo: 0.5, ask: 0.5, marry: 0.3, ring: 0.3, groom: 0.15, handover: 0.01, contractTrennung: 0.35 },
};
