'use strict';
const db = require('./db');

/**
 * Alle Spiel- und Seiteneinstellungen. Werte sind im Admin-Panel änderbar und
 * liegen als JSON in der Tabelle `settings`. Fehlende Schlüssel fallen auf die Defaults zurück.
 */
const EVENT_DEFAULTS = require('./game/event-defaults');
const LEGAL = require('./legal-texts');
const DEFAULTS = {
  'site.name': 'Turning Point',
  'site.tagline': 'Life. Work. Legacy.',
  'site.registration_open': true,
  'site.maintenance': false,
  'site.maintenance_message': 'Turning Point wird gerade gewartet. Bitte versuche es gleich noch einmal.',
  'site.require_email_verification': false,
  texts: require('./game/text-defaults'),
  'news.custom': [],
  anticheat: {
    enabled: true,
    autoAction: 'flag',       // flag = nur melden · throttle = zusätzlich bremsen · ban = ab Schwelle automatisch sperren
    throttleAt: 60, banAt: 120, decayDays: 21,
    rules: {
      burst: { enabled: true, perMinute: 150, weight: 12 },
      bot: { enabled: true, samples: 40, maxJitterMs: 30, maxMeanMs: 3000, weight: 25 },
      task_fast: { enabled: true, perHour: 8, weight: 6 },
      ad_fast: { enabled: true, weight: 15 },
      ad_burst: { enabled: true, perHour: 10, weight: 10 },
      multi_account: { enabled: true, accountsPerIp: 3, windowHours: 48, weight: 18 },
      multi_ip: { enabled: true, ips: 4, windowMinutes: 60, weight: 15 },
      wealth: { enabled: true, maxEarnedPerDay: 2000000, weight: 25 },
      time_hack: { enabled: true, tolerance: 2, weight: 35 },
      coin_inflow: { enabled: true, slack: 200, weight: 25 },
      integrity: { enabled: true, weight: 40 },
      gift_ring: { enabled: true, weight: 20 },
      chat_spam: { enabled: true, weight: 8 },
    },
  },
  elections: {
    enabled: true, cycleDays: 7, voteHours: 24, minAccountHours: 24, minGameDays: 30, blockSameIp: true,
    feePct: 50, maxCandidates: 8, firstNationalOffice: 3, botVotes: true, botVoteMax: 20, botTurnoutPct: 60, botMaxPctOfHuman: 100, keepDays: 60, disableChance: false,
  },
  career: {
    noticeDays: 30, applyBasePct: 55, applyPerLevelPct: 8, applyCooldownDays: 20,
    raiseCooldownDays: 180, raiseMaxSteps: 3, stepPct: 5, tenureStepDays: 1095, tenureMaxSteps: 4,
    courseDays: 60, unlockDays: 120, courseFeeDays: 40, unlockFeeDays: 120, coursesPerYear: 2, skillBonusDays: 365,
    benefit: { enabled: true, pct: 60, days: 180, minWorkDays: 90 },
  },
  social: {
    enabled: true,
    leaderboardSize: 50,
    onlineMinutes: 10,
    chat: { enabled: true, cooldownSec: 3, maxLen: 240, keep: 400, minAccountHours: 1, blocked: ['arschloch', 'hurensohn', 'wichser', 'fotze', 'nazi', 'heil hitler', 'scheiß', 'scheiss', 'fick dich', 'idiot', 'spast'] },
    messages: { perDay: 30, maxLen: 1500, minAccountHours: 2, keepDays: 120 },
    friends: { max: 100 },
    gifts: { enabled: true, minAccountHours: 24, minGameDays: 30, dailyCapCents: 5000, dailyReceiveCents: 15000, maxPctOfWealth: 20, feePct: 5, blockSameIp: true },
    visit: { enabled: true, price: [250, 700, 1800], wellbeing: [4, 6, 8], ownerSharePct: 80, cooldownMin: 30, minWellbeing: 0 },
    jobs: { enabled: true, minWage: 150, maxWage: 1500, minAccountHours: 12, minGameDays: 30, blockSameIp: true, maxOffersPerCompany: 3, maxSlots: 5, applicationsPerDay: 10, maxEmployeesPerOwner: 20 },
    couples: { enabled: true, minAge: 18, minAccountHours: 12, requireSameCity: true, weddingSharePct: 50, spouseSharePct: 30, divorceSettlementPct: 20, blockSameIp: false },
    news: { publicEvents: true, keepDays: 5, types: ['business_open', 'business_expand', 'couple', 'marriage', 'birth', 'elected', 'lotto', 'death', 'heir', 'study_done'] },
  },
  maintenance: {
    enabled: true,
    batch: 2000,            // Zeilen je DELETE (kurze Sperren)
    chatDays: 30, lettersReadDays: 180, newsDays: 90, worldEventsDays: 60,
    marketDays: 30, ordersDays: 30, tradesDays: 180, leasesDays: 90, anonSessionDays: 2,
  },
  push: {
    enabled: true,         // Web-Push (Handy-Benachrichtigungen) global an/aus
    perHour: 6,            // max. Pushes je Spieler und Stunde
    quietEnabled: true,    // Ruhezeiten als Vorgabe (Spieler können sie ändern)
    quietFrom: 22, quietTo: 7,
  },
  landing: {
    eyebrow: 'Eine Lebenssimulation über Generationen',
    title: 'Ein Leben.\nEin Vermächtnis.',
    lead: '1945. Zwanzig Jahre alt. Vierzig D-Mark in der Tasche, ein erlernter Beruf und eine zerstörte Welt. Was du daraus machst, entscheidet nicht nur über dein Leben, sondern über das deiner Kinder, Enkel und Urenkel.',
    ctaStart: 'Kostenlos beginnen', ctaPlay: 'Weiterspielen',
    timeline: ['1945 · Nachkriegszeit', '1960 · Wirtschaftswunder', '1990 · Wendezeit', '2002 · Euro & Internet', '2050 · Zukunft', '2100 · 22. Jahrhundert'],
    stats: [{ value: '40 DM', label: 'Startkapital' }, { value: '365 EFS', label: 'sind ein Spieljahr' }, { value: '13', label: 'Kinder sind möglich' }, { value: '155 Jahre', label: 'bis ins 22. Jahrhundert' }],
    featuresTitle: 'Einfach aussehen. Tief spielen.', featuresSub: 'Keine Grafikschlacht – die Tiefe steckt in der Simulation.',
    features: [
      { icon: 'newspaper', title: 'Die Zeitung ist dein Fenster', text: 'Stellen, Wohnungen, Unwetterwarnungen, Kontaktanzeigen. Wer aufmerksam liest, ist im Vorteil – ab 2002 wird sie zum Internet.' },
      { icon: 'briefcase', title: 'Vom Gesellen zum Unternehmer', text: 'Ausbildung ist kostenlos, Erfahrung zählt. Berufe wandeln sich alle zwanzig Jahre – vom Schmied zum Mechatroniker.' },
      { icon: 'house', title: 'Von der Straße zur Villa', text: 'Pension, Miete, Haus, Villa. Gut gepflegte Immobilien steigen im Wert, vernachlässigte verfallen.' },
      { icon: 'users', title: 'Familie & Erbe', text: 'Partner, bis zu 13 Kinder, Schule, Pflichtanteil und Generationenwechsel. Ohne Erben endet die Linie.' },
      { icon: 'zap', title: 'EFS: Zeit als Währung', text: '50 EFS jeden Tag, 50 fürs Einloggen. Das Leben läuft auch weiter, wenn du nicht da bist.' },
      { icon: 'coins', title: 'Fair & freiwillig', text: 'Komplett kostenlos spielbar. Werbung nur, wenn du sie willst. Coins bleiben über alle Leben erhalten.' },
    ],
    quote: '„Ein kleines Ereignis kann ein großes Leben verändern.“', ctaBottom: 'Dein erstes Leben beginnen', ctaBottomPlay: 'Zurück ins Spiel',
  },
  landing_en: {
    eyebrow: 'A life simulation across generations',
    title: 'One life.\nOne legacy.',
    lead: '1945. Twenty years old. Forty Deutschmarks in your pocket, a trade learned and a world in ruins. What you make of it decides not only your own life, but that of your children, grandchildren and great-grandchildren – all the way into the 22nd century.',
    ctaStart: 'Start for free', ctaPlay: 'Continue playing',
    timeline: ['1945 · Post-war', '1960 · Economic miracle', '1990 · Reunification', '2002 · Euro & internet', '2050 · Future', '2100 · 22nd century'],
    stats: [{ value: '40 DM', label: 'starting capital' }, { value: '365 EFS', label: 'make one game year' }, { value: '13', label: 'children possible' }, { value: '155 years', label: 'into the 22nd century' }],
    featuresTitle: 'Simple to look at. Deep to play.', featuresSub: 'No graphics arms race – the depth lives in the simulation.',
    features: [
      { icon: 'newspaper', title: 'The newspaper is your window', text: 'Jobs, homes, storm warnings, personal ads. Whoever reads carefully has the edge – from 2002 it becomes the internet.' },
      { icon: 'briefcase', title: 'From journeyman to entrepreneur', text: 'Training is free, experience counts. Professions change every twenty years – from blacksmith to mechatronics technician.' },
      { icon: 'house', title: 'From the street to the villa', text: 'Boarding house, rent, house, villa. Well-kept property gains value, neglected property decays.' },
      { icon: 'users', title: 'Family & inheritance', text: 'Partner, up to 13 children, school, compulsory share and generational change. Without heirs the line ends.' },
      { icon: 'zap', title: 'EFS: time as currency', text: '50 EFS every day, 50 for logging in. Life goes on even when you are away.' },
      { icon: 'coins', title: 'Fair & voluntary', text: 'Completely free to play. Ads only if you want them. Coins stay with you across all lives.' },
    ],
    quote: '“A small event can change a great life.”', ctaBottom: 'Begin your first life', ctaBottomPlay: 'Back to the game',
  },
  tax: { enabled: true, brackets: [[1500, 0], [6000, 0.15], [20000, 0.28], [60000, 0.38], [1e15, 0.45]], corporatePct: 15 },
  credit: { enabled: true, spread: 1.0, assetPct: 60, incomeDays: 150, minAmount: 20000, maxYears: 30 },
  competition: { enabled: true, cap: [6, 6, 9, 16, 30, 55], minFactor: 0.35, exponent: 0.8 },
  // Warenkreislauf (src/game/goods.js): Rohstoffe, Zutaten und Waren. Preise sind „Wert von 1945“ (Cent je Einheit) und werden mit dem Preisindex hochgerechnet.
  goods: {
    enabled: true,
    wholesaleMarkupPct: 25,       // Großhandel verkauft an Betriebe so viel Prozent über dem Marktpreis
    wholesaleDiscountPct: 20,     // … und kauft Überschüsse so viel Prozent darunter (Umsatz ist darauf abgestimmt)
    scarcityStrength: 0.35,       // Wirkung von Knappheit/Überangebot auf den Preis (0 = aus, 1 = voll)
    scarcityMin: 0.8, scarcityMax: 1.5,
    cityPriceWeight: 0.5,         // wie stark der Preisfaktor der Stadt auf Warenpreise durchschlägt
    noInputEfficiencyPct: 35,     // so viel Leistung bleibt, wenn alle benötigten Waren fehlen (nie sofort null)
    contracts: {
      enabled: true, maxPerFirm: 4, minTermDays: 30, maxTermDays: 730, minPricePct: 90, maxPricePct: 115, // Vertragspreis in % des Marktpreises
      minAccountHours: 12, blockSameIp: true, offersPerDay: 12, offerTtlHours: 72, sameRegionOnly: true,
    },
    policy: {
      enabled: true, surchargeMin: -2, surchargeMax: 4, subsidyMax: 20, supportMax: 15, vatMin: -3, vatMax: 5, tariffMin: -10, tariffMax: 20,
      levyPerSubsidy: 0.15,       // jeder Prozentpunkt Subvention kostet alle Betriebe im Gebiet so viele Punkte Gewerbesteuer (Gegenfinanzierung)
      frames: {                   // Bundestag wählt einen Rahmen: Obergrenzen für Zuschlag und Subvention
        eng: { name: 'Streng', maxSurcharge: 2, maxSubsidy: 10 },
        normal: { name: 'Normal', maxSurcharge: 4, maxSubsidy: 20 },
        weit: { name: 'Weit', maxSurcharge: 6, maxSubsidy: 30 },
      },
    },
  },
  // Stadtwirtschaft (src/game/cityecon.js, src/lib/cityecon.js): Preisindizes je Stadt (Lebensmittel, Wohnen, Dienste, Bau, Löhne) aus Nachfrage und Angebot.
  // Alle Indizes sind Faktoren relativ zum festen Stadtfaktor (cities.price_factor) und bleiben zwischen min und max.
  stadtwirtschaft: {
    enabled: true,
    intervalMinutes: 60,          // Aktualisierung der Indizes (auch beim Start)
    tauHours: 24,                 // Zeitkonstante der Annäherung ans Gleichgewicht (24 Stunden = ca. 1 Spieljahr)
    min: 0.75, max: 1.6,          // Grenzen der Indizes (relativ zum festen Stadtfaktor)
    strength: { food: 0.35, rent: 0.5, services: 0.4, build: 0.4, wage: 0.4 }, // Wirkung des Verhältnisses Nachfrage/Angebot (Exponent)
    npcRooms: { food: 8, rent: 10, services: 14, build: 6, wage: 20 },           // Grundangebot der Stadt (NPC) je Sektor, in Vielfachen der Konkurrenz-Obergrenze (competition.cap)
    playerDemand: 1,            // Nachfrage je lebendem Charakter in der Stadt (in Räumen)
    firmWeight: 0.3,              // Gewicht eines Betriebsraums auf der Angebotsseite (die Sättigung der eigenen Betriebsart steckt schon in „Konkurrenz“)
    noisePct: 1.5,                // kleines deterministisches Rauschen auf dem Zielwert (Prozent)
    eraPct: 3, eraTrendPct: 4,    // Epochenwelle und Langzeittrend je Stadt (Prozent, deterministisch, Mittel = 1)
    pass: { revenue: 0.35, property: 0.5, goods: 0.4, household: 1 }, // Durchschlag: Umsatz der Betriebe, Immobilienpreise, Warenpreise (Lebensmittel/Bau), Haushaltskosten
    histPoints: 60,               // Verlaufspunkte je Index (ein Punkt je Spielmonat)
    newsPct: 4,                   // Zeitungsmeldung ab so vielen Prozent Veränderung gegenüber dem Vorjahr
    policy: { rentCapOptions: [0, 2, 4], zoneOptions: [5, 10, 15], programOptions: [5, 10, 15], brakeOptions: [-2, -1, 1, 2], capSupplyPenaltyPct: 6, zoneBuildPct: 50, brakeWagePct: 70 },
  },
  cycles: { realEstate: [[1945, 0.75], [1950, 0.85], [1957, 1.0], [1965, 1.08], [1973, 1.15], [1976, 1.05], [1985, 1.0], [1990, 1.2], [1993, 1.3], [1996, 1.0], [2005, 0.9], [2010, 1.0], [2015, 1.2], [2021, 1.5], [2023, 1.35], [2035, 1.4], [2060, 1.5], [2100, 1.6]] },
  exchange: { enabled: true, shares: 1000, minValueReal: 300000, minGameDays: 90, minFloatPct: 10, maxFloatPct: 49, makerSpreadPct: 5, makerDailyPct: 5, maxOrderShares: 500, openOrdersMax: 12, takeoverPct: 50,
    // Grenzen des Marktteilnehmers: Tageslimit je Nutzer (Gesamtwert real in Cent, 0 = kein Limit), Mindest-Haltedauer vor dem Rückverkauf an ihn,
    // Spread-Zuschlag je eigenem Geschäft am Tag (bis zum Höchstwert), Scheinhandel zwischen Konten mit gleicher IP sperren
    makerUserDailyReal: 200000, makerMinHoldMinutes: 60, makerSpreadStepPct: 0.5, makerSpreadMaxPct: 15, blockSameIp: true },
  rivalry: {
    mode: 'optin', // off | optin (Spieler wählen selbst) | all (für alle aktiv)
    optOutLockDays: 7, attackerMinGameDays: 60, targetMinGameDays: 60, minAccountHours: 24,
    dailyCap: 3, perFirmDailyCap: 1, perFirmWeeklyCap: 3, afterSabotageShieldHours: 48,
    strikeLimit: 3, strikeWindowDays: 30, banDays: 7,
    actions: {
      spy: { cost: 2500, label: 'Industriespionage' },
      price: { cost: 8000, hitPct: 18, days: 14, label: 'Preiskampf' },
      poach: { cost: 3000, label: 'Mitarbeiter abwerben' },
      sabotage: { cost: 6000, outageDays: 6, repairPct: 1.5, label: 'Sabotage' },
    },
    caughtBase: 0.3, caughtSecurityBonus: 0.25, successSecurity: 0.5, finePct: 400,
  },
  market: { enabled: true, propFeePct: 3.5, firmFeePct: 1.5, offerMinPct: 40, offerExpireDays: 7, auctionHours: 24, auctionIncrementPct: 5, maxOpenOffers: 10, offersPerDay: 12, minGameDays: 30, blockSameIp: true, estateAuctions: true },
  bots: { enabled: false, target: 8, max: 60, activity: 2, chat: true, letters: true, friends: true, jobs: true, visits: true, market: true },
  'site.announcement': { active: false, id: 1, level: 'info', title: '', text: '' },
  'site.contact_email': LEGAL.EMAIL,
  'site.legal_name': LEGAL.BETREIBER,
  'site.legal_address': LEGAL.ANSCHRIFT,

  'efs.daily_auto': 0,           // automatisches EFS-Einkommen (aus; die Spieluhr läuft von selbst, EFS dienen zum Vorspulen)
  'efs.login_bonus': 365,        // beim ersten Login des Tages (ein Spieljahr zum Vorspulen)
  'efs.active_daily_cap': 1600,   // max. Sammel-EFS (Karte/Funde) pro realem Tag
  'efs.awards': {                // einmalige Fortschrittsbelohnungen
    training_start: 70, training_finish: 280, job_start: 70, rent: 105, buy_property: 700,
    partner: 280, child: 420, study_finish: 840, move: 70, insurance: 35,
  },

  'game.clock_days_per_day': 365,    // Spieluhr: so viele Spieltage vergehen in 24 realen Stunden (365 = 1 Jahr)
  'game.start_year': 1945,
  'game.start_age': 20,
  'game.start_money_cents': 4000,
  'game.max_children': 13,
  'game.offline_protection': true,   // offline kann man nicht verhungern/insolvent gehen
  'game.offline_after_minutes': 90,  // ab so viel Abwesenheit gilt automatisch "offline"
  'game.street_survival_days': 3,
  'game.legacy_year': 2100,          // Ziel: 22. Jahrhundert

  'coins.start': 5,
  'coins.per_child': 100,
  'coins.legacy_bonus': 500,
  'coins.ad_base': 1,
  'coins.ad_video': 5,
  'coins.move_per_100km': 1,
  'ads.enabled': true,
  'ads.provider': 'simulated',     // simulated | custom (iframe-URL des Werbenetzwerks)
  'ads.custom_url': '',
  'offerwall.url': '',               // iframe-URL, {uid} wird ersetzt
  'offerwall.secret': '',            // Postback-Signatur (HMAC-SHA256)
  'ads.min_seconds': 8,
  'ads.daily_cap': 50,
  'ads.efs_reward': 20,
  'legal.impressum': LEGAL.impressum,
  'legal.datenschutz': LEGAL.datenschutz,
  'legal.agb': LEGAL.agb,
  'legal.widerruf': LEGAL.widerruf,

  'payments.mode': 'off',            // off | test (Testkäufe schreiben direkt gut) | stripe
  'payments.stripe_secret': '',
  'payments.stripe_webhook_secret': '',
  'payments.stripe_sub_price': '',   // Preis-ID (price_…) der Dauerkarte
  'payments.currency': 'eur',
  'packages': [
    { id: 'coins_s', name: '60 Coins', price_cents: 199, coins: 60, efs: 0, money: 0 },
    { id: 'coins_m', name: '160 Coins', price_cents: 399, coins: 160, efs: 0, money: 0 },
    { id: 'efs_s', name: '300 EFS', price_cents: 299, coins: 0, efs: 300, money: 0 },
    { id: 'efs_m', name: '600 EFS', price_cents: 499, coins: 0, efs: 600, money: 0 },
    { id: 'starter', name: 'Starterpaket', price_cents: 599, coins: 80, efs: 300, money: 20000 },
  ],
  'subscription': { enabled: false, price_cents: 599, daily_coins: 3, daily_health_cards: 1 },

  'mail.smtp': { host: '', port: 587, secure: false, user: '', pass: '', from: '' },

  'economy': {
    priceIndex: [[1945, 1], [1950, 1.15], [1960, 2], [1970, 3.4], [1980, 6], [1990, 9], [2001, 11.8], [2002, 5.9], [2010, 6.9], [2020, 8.2], [2030, 9.8], [2050, 15], [2075, 26], [2100, 42], [2200, 120]],
    euroYear: 2002,
    // Cent je Kühlschrank-Prozent (bei Preisindex 1)
    food: [
      { key: 'cheap', name: 'Günstig', perPct: 3, wellbeing: -4, health: -3 },
      { key: 'normal', name: 'Normal', perPct: 5, wellbeing: 0, health: 0 },
      { key: 'premium', name: 'Hochwertig', perPct: 10, wellbeing: 5, health: 3 },
      { key: 'gourmet', name: 'Gourmet', perPct: 22, wellbeing: 10, health: 5 },
    ],
    // Cent pro Tag (Preisindex 1), Stadt-Preisfaktor wird zusätzlich angewendet
    lodging: { workplace: 25, pension: 120 },
    rentPerRoom: [70, 110, 150, 190],
    // Kaufpreise (Cent bei Preisindex 1)
    property: {
      flat: { name: 'Eigentumswohnung', rooms: 2, price: 800000, rest: 40 },
      house_small: { name: 'Kleines Haus', rooms: 4, price: 2000000, rest: 45 },
      house_large: { name: 'Großes Haus', rooms: 8, price: 4500000, rest: 50 },
      villa: { name: 'Villa', rooms: 15, price: 15000000, rest: 60 },
    },
    upkeepYearPct: 1.2,
    // Wirtschaftsbalance: Unwetter und Brände trafen jede Immobilie ca. 5x bzw. 0,6x im Jahr (Schäden von >40 % des Werts jährlich);
    // abgeschwächt auf ca. 1,1 Sturmschäden / 0,2 Brände je Immobilie und Jahr.
    events: { ...EVENT_DEFAULTS, town: { ...EVENT_DEFAULTS.town, stormHitChance: 0.1, stormCostPct: 4, fireHitChance: 0.04 } },
    insurance: {
      hausrat: { name: 'Hausratversicherung', perDay: 12, covers: ['burglary'] },
      gebaeude: { name: 'Gebäudeversicherung', yearPctOfValue: 0.3, covers: ['fire', 'storm'] },
      gesundheit: { name: 'Krankenzusatz', perDay: 20, covers: ['illness'] },
    },
    politics: {
      minAge: 25, termDays: 1460,
      offices: [
        { name: 'Ortsbeirat', campaign: 50000, income: 0, termBonus: 100, rest: 6, health: 0.2 },
        { name: 'Stadtrat', campaign: 200000, income: 300, termBonus: 150, rest: 8, health: 0.3 },
        { name: 'Bürgermeister', campaign: 800000, income: 900, termBonus: 250, rest: 10, health: 0.4 },
        { name: 'Landtagsabgeordneter', campaign: 2500000, income: 1800, termBonus: 350, rest: 12, health: 0.5 },
        { name: 'Bundestagsabgeordneter', campaign: 6000000, income: 3000, termBonus: 500, rest: 14, health: 0.6 },
        { name: 'Bundeskanzler', campaign: 15000000, income: 6000, termBonus: 800, rest: 18, health: 0.9 },
      ],
    },
    tasks: {
      rathaus: [{ id: 'queue', name: 'Besucher einweisen', desc: 'Schicke die Wartenden in der richtigen Reihenfolge zum Schalter.', mini: 'sequence', minSeconds: 6, cooldownMin: 90, reward: { efs: 56, wellbeing: 2 } }, { id: 'forms', name: 'Formulare ablegen', desc: 'Hilf im Bürgeramt, Akten zu sortieren.', mini: 'collect', minSeconds: 6, cooldownMin: 120, reward: { efs: 70, influence: 1 } }, { id: 'petition', name: 'Bürgeranliegen annehmen', desc: 'Nimm die Anliegen der Bürger auf – eins nach dem anderen.', mini: 'hunt', minSeconds: 7, cooldownMin: 150, reward: { efs: 70, influence: 2 } }],
      zeitung: [{ id: 'proof', name: 'Korrektur lesen', desc: 'Finde die Fehler im Satz.', mini: 'collect', minSeconds: 7, cooldownMin: 90, reward: { efs: 70 } }, { id: 'press', name: 'Druckmaschine anwerfen', desc: 'Drücke die Schritte in der richtigen Reihenfolge.', mini: 'sequence', minSeconds: 7, cooldownMin: 100, reward: { efs: 63, money: 300 } }, { id: 'scoop', name: 'Reportage recherchieren', desc: 'Der Tipp taucht nur kurz an einer Stelle auf.', mini: 'hunt', minSeconds: 8, cooldownMin: 120, reward: { efs: 84, influence: 1 } }],
      markt: [{ id: 'sell', name: 'Am Stand verkaufen', desc: 'Bediene die Kunden der Reihe nach.', mini: 'sequence', minSeconds: 6, cooldownMin: 75, reward: { efs: 56, money: 400 } }, { id: 'sort', name: 'Waren sortieren', desc: 'Kisten an den richtigen Stand bringen.', mini: 'collect', minSeconds: 7, cooldownMin: 60, reward: { efs: 56, money: 300 } }, { id: 'fresh', name: 'Frische prüfen', desc: 'Finde die besten Stücke am Stand.', mini: 'hunt', minSeconds: 7, cooldownMin: 80, reward: { efs: 56, wellbeing: 2 } }],
      arzt: [{ id: 'check', name: 'Vorsorge-Untersuchung', desc: 'Ein Check-up tut gut.', mini: null, minSeconds: 0, cooldownMin: 360, reward: { health: 8, efs: 35 } }, { id: 'volunteer', name: 'Wartezimmer helfen', desc: 'Reiche Patienten die Unterlagen in der richtigen Reihenfolge.', mini: 'sequence', minSeconds: 6, cooldownMin: 150, reward: { efs: 56, wellbeing: 3 } }],
      schule: [{ id: 'help', name: 'Hausaufgabenhilfe', desc: 'Hilf deinen Kindern bei den Aufgaben.', mini: 'collect', minSeconds: 6, cooldownMin: 120, requires: 'children', reward: { efs: 56, childSat: 10 } }, { id: 'play', name: 'Pausenhof-Spiel', desc: 'Spiele mit den Kindern Fangen – sie verstecken sich!', mini: 'hunt', minSeconds: 7, cooldownMin: 120, requires: 'children', reward: { efs: 42, childSat: 14, wellbeing: 3 } }],
      pension: [{ id: 'rest', name: 'Ausruhen', desc: 'Eine Runde Schlaf auf dem Zimmer.', mini: null, minSeconds: 0, cooldownMin: 30, reward: { rest: 10 } }, { id: 'chat', name: 'Mit Gästen plaudern', desc: 'Finde die gesprächigen Gäste.', mini: 'hunt', minSeconds: 6, cooldownMin: 90, reward: { wellbeing: 5, efs: 28 } }],
      home: [
        { id: 'leisure', name: 'Entspannen', desc: 'Radio, Fernseher oder Rechner – je nach Zeit.', mini: null, minSeconds: 0, cooldownMin: 60, reward: { wellbeing: 5, rest: 2 } },
        { id: 'cook', name: 'Kochen', desc: 'Bereite das Essen in der richtigen Reihenfolge zu.', mini: 'sequence', minSeconds: 6, cooldownMin: 120, reward: { efs: 42, wellbeing: 6 } },
        { id: 'rest', name: 'Ausruhen', desc: 'Ein Nickerchen im eigenen Bett.', mini: null, minSeconds: 0, cooldownMin: 30, reward: { rest: 12, wellbeing: 2 } },
        { id: 'repair', name: 'Kleinreparatur', desc: 'Finde die defekten Stellen im Haus.', mini: 'hunt', minSeconds: 8, cooldownMin: 180, reward: { efs: 63, wellbeing: 2 } },
        { id: 'tidy', name: 'Aufräumen', desc: 'Ordnung schaffen – das tut der Seele gut.', mini: 'collect', minSeconds: 6, cooldownMin: 90, reward: { efs: 42, wellbeing: 4 } },
      ],
      biz: [{ id: 'orders', name: 'Bestellungen abarbeiten', desc: 'Erledige die Aufträge in der richtigen Reihenfolge.', mini: 'sequence', minSeconds: 8, cooldownMin: 90, reward: { efs: 70, bizCash: 0.3 } }, { id: 'serve', name: 'Betrieb betreuen', desc: 'Kümmere dich persönlich um Gäste und Kunden.', mini: 'collect', minSeconds: 9, cooldownMin: 60, reward: { efs: 84, bizCash: 0.5 } }, { id: 'inventory', name: 'Inventur', desc: 'Finde die fehlenden Posten – jeweils nur einer ist sichtbar.', mini: 'hunt', minSeconds: 8, cooldownMin: 120, reward: { efs: 70, bizCash: 0.4 } }],
      work: [{ id: 'tools', name: 'Werkzeug vorbereiten', desc: 'Bringe die Arbeitsschritte in die richtige Reihenfolge.', mini: 'sequence', minSeconds: 7, cooldownMin: 100, reward: { efs: 56, wellbeing: 2 } }, { id: 'shift', name: 'Zusatzschicht', desc: 'Pack bei der Arbeit mit an.', mini: 'collect', minSeconds: 9, cooldownMin: 90, reward: { efs: 84, money: 400, rest: -4 } }, { id: 'meeting', name: 'Besprechung vorbereiten', desc: 'Finde die Unterlagen für die Runde.', mini: 'hunt', minSeconds: 7, cooldownMin: 110, reward: { efs: 63, influence: 1 } }],
    },
    gambling: { ticket: 200, casinoMinAge: 21, casinoFromYear: 1950 },
    companies: {
      maxCompanies: 30,
      staffWage: 500,          // Cent/Tag je Mitarbeiter (Index 1)
      managerWage: 600,
      upkeepYearPct: 1,
      abandonYears: 10,
      reactivatePct: 25,       // % des Kaufpreises zur Reaktivierung
      tiers: [
        { minLevel: 0, price: 1200000, rooms: 3, maxRooms: 6, incomePerRoom: 525, roomsPerStaff: 3, roomPrice: 150000, roomCoins: 1 },
        { minLevel: 2, price: 4000000, rooms: 6, maxRooms: 14, incomePerRoom: 650, roomsPerStaff: 3, roomPrice: 300000, roomCoins: 2 },
        { minLevel: 3, price: 12000000, rooms: 12, maxRooms: 50, incomePerRoom: 850, roomsPerStaff: 3, roomPrice: 600000, roomCoins: 3 },
      ],
      chains: {
        wirt: ['Wirtshaus', 'Restaurant', 'Hotel'], baecker: ['Bäckerei', 'Großbäckerei', 'Backwarenfabrik'],
        tischler: ['Tischlerei', 'Möbelwerkstatt', 'Möbelfabrik'], schmied: ['Schmiede', 'Maschinenwerkstatt', 'Stahlwerk'],
        landwirt: ['Bauernhof', 'Gutshof', 'Agrarbetrieb'], maurer: ['Baufirma', 'Bauunternehmen', 'Baukonzern'],
        friseur: ['Friseursalon', 'Salon-Kette', 'Beauty-Konzern'],
        einzelhandelsverkaeufer: ['Ladengeschäft', 'Supermarkt', 'Handelskette'], reisekaufmann: ['Reisebüro', 'Reiseveranstalter', 'Touristikkonzern'],
        online_haendler: ['Onlineshop', 'Versandhandel', 'Handelsplattform'], fitnesstrainer: ['Fitnessstudio', 'Fitnesskette', 'Gesundheitskonzern'],
        journalist: ['Zeitungsverlag', 'Medienhaus', 'Medienkonzern'], konditor: ['Konditorei', 'Café-Betrieb', 'Süßwarenfabrik'],
        fleischermeister: ['Fleischerei', 'Wurstwarenfabrik', 'Fleischkonzern'], taxifahrer: ['Taxiunternehmen', 'Fahrdienst', 'Mobilitätskonzern'],
        installateur: ['Installationsbetrieb', 'Haustechnikfirma', 'Haustechnik-Konzern'], gaertner: ['Gärtnerei', 'Gartenbaubetrieb', 'Gartencenter-Kette'],
      },
    },
    moveBaseCost: 300,     // Cent
    moveCostPerKm: 1.6,    // Cent pro km bei Preisindex 1
    childCostPerDay: 90,   // Lebenshaltung je Kind (Cent, Index 1)
    kindergeldPct: 50,     // Kindergeld deckt x % davon
    jugendhilfePerDay: 160,
    marriageCost: 2500,
    giftCost: 400,
  },
};

let cache = null;

async function load() {
  const rows = await db.query('SELECT `key`, value FROM settings');
  const m = {};
  for (const r of rows) {
    try { m[r.key] = JSON.parse(r.value); } catch (_) { /* ignorieren */ }
  }
  cache = m;
  return m;
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
/** Tiefes Zusammenführen: neue Standardwerte (auch neue Aufgaben je Gebäude) erscheinen trotz gespeicherter Einstellungen. */
function deepMerge(d, v, byId = false) {
  if (isObj(d) && isObj(v)) {
    const out = { ...d };
    for (const k of Object.keys(v)) out[k] = k in d ? deepMerge(d[k], v[k], byId) : v[k];
    return out;
  }
  if (byId && Array.isArray(d) && Array.isArray(v) && d.every((x) => isObj(x) && x.id) && v.every((x) => isObj(x) && x.id)) {
    const ids = new Set(v.map((x) => x.id));
    return [...v, ...d.filter((x) => !ids.has(x.id))];
  }
  return v;
}

function get(key) {
  const v = cache && Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : undefined;
  if (v === undefined) return DEFAULTS[key];
  if (v === '' && key.startsWith('legal.')) return DEFAULTS[key]; // leer gespeicherte Rechtstexte → Vorlage
  const d = DEFAULTS[key];
  if (isObj(d) && isObj(v)) return deepMerge(d, v, key === 'economy');
  return v;
}

async function set(key, value) {
  await db.query(
    'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [key, JSON.stringify(value)],
  );
  if (!cache) cache = {};
  cache[key] = value;
}

async function reset(key) {
  await db.query('DELETE FROM settings WHERE `key` = ?', [key]);
  if (cache) delete cache[key];
}

function all() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = get(k);
  return out;
}

module.exports = { DEFAULTS, load, get, set, reset, all };
