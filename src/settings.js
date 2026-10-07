'use strict';
const db = require('./db');

/**
 * Alle Spiel- und Seiteneinstellungen. Werte sind im Admin-Panel änderbar und
 * liegen als JSON in der Tabelle `settings`. Fehlende Schlüssel fallen auf die Defaults zurück.
 */
const DEFAULTS = {
  'site.name': 'Turning Point',
  'site.tagline': 'Life. Work. Legacy.',
  'site.registration_open': true,
  'site.maintenance': false,
  'site.maintenance_message': 'Turning Point wird gerade gewartet. Bitte versuche es gleich noch einmal.',
  'site.require_email_verification': false,
  'site.contact_email': '',
  'site.legal_name': '',
  'site.legal_address': '',

  'efs.daily_auto': 50,          // automatisch pro realem Tag
  'efs.login_bonus': 50,         // zusätzlich beim ersten Login des Tages
  'efs.active_daily_cap': 220,   // max. Sammel-EFS (Karte/Funde) pro realem Tag
  'efs.awards': {                // einmalige Fortschrittsbelohnungen
    training_start: 10, training_finish: 40, job_start: 10, rent: 15, buy_property: 100,
    partner: 40, child: 60, study_finish: 120, move: 10, insurance: 5,
  },

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
  'ads.provider': 'simulated',
  'ads.min_seconds': 8,
  'ads.daily_cap': 50,
  'ads.efs_reward': 20,
  'legal.impressum': '',
  'legal.datenschutz': '',

  'payments.mode': 'off',            // off | test (Testkäufe schreiben direkt gut)
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
    gambling: { ticket: 200, casinoMinAge: 21, casinoFromYear: 1950 },
    companies: {
      maxCompanies: 30,
      staffWage: 500,          // Cent/Tag je Mitarbeiter (Index 1)
      managerWage: 900,
      upkeepYearPct: 1,
      abandonYears: 10,
      reactivatePct: 25,       // % des Kaufpreises zur Reaktivierung
      tiers: [
        { minLevel: 0, price: 1200000, rooms: 3, maxRooms: 6, incomePerRoom: 260, roomsPerStaff: 3, roomPrice: 150000, roomCoins: 1 },
        { minLevel: 2, price: 4000000, rooms: 6, maxRooms: 14, incomePerRoom: 330, roomsPerStaff: 3, roomPrice: 300000, roomCoins: 2 },
        { minLevel: 3, price: 12000000, rooms: 12, maxRooms: 50, incomePerRoom: 420, roomsPerStaff: 3, roomPrice: 600000, roomCoins: 3 },
      ],
      chains: {
        wirt: ['Wirtshaus', 'Restaurant', 'Hotel'], baecker: ['Bäckerei', 'Großbäckerei', 'Backwarenfabrik'],
        tischler: ['Tischlerei', 'Möbelwerkstatt', 'Möbelfabrik'], schmied: ['Schmiede', 'Maschinenwerkstatt', 'Stahlwerk'],
        landwirt: ['Bauernhof', 'Gutshof', 'Agrarbetrieb'], maurer: ['Baufirma', 'Bauunternehmen', 'Baukonzern'],
        friseur: ['Friseursalon', 'Salon-Kette', 'Beauty-Konzern'],
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

function get(key) {
  const v = cache && Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : undefined;
  if (v === undefined) return DEFAULTS[key];
  const d = DEFAULTS[key];
  if (d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object') return { ...d, ...v };
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

function all() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = get(k);
  return out;
}

module.exports = { DEFAULTS, load, get, set, all };
