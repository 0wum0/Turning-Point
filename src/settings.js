'use strict';
const db = require('./db');

/**
 * Alle Spiel- und Seiteneinstellungen. Werte sind im Admin-Panel änderbar und
 * liegen als JSON in der Tabelle `settings`. Fehlende Schlüssel fallen auf die Defaults zurück.
 */
const EVENT_DEFAULTS = require('./game/event-defaults');
const DEFAULTS = {
  'site.name': 'Turning Point',
  'site.tagline': 'Life. Work. Legacy.',
  'site.registration_open': true,
  'site.maintenance': false,
  'site.maintenance_message': 'Turning Point wird gerade gewartet. Bitte versuche es gleich noch einmal.',
  'site.require_email_verification': false,
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
  'site.announcement': { active: false, id: 1, level: 'info', title: '', text: '' },
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
  'ads.provider': 'simulated',     // simulated | custom (iframe-URL des Werbenetzwerks)
  'ads.custom_url': '',
  'offerwall.url': '',               // iframe-URL, {uid} wird ersetzt
  'offerwall.secret': '',            // Postback-Signatur (HMAC-SHA256)
  'ads.min_seconds': 8,
  'ads.daily_cap': 50,
  'ads.efs_reward': 20,
  'legal.impressum': '',
  'legal.datenschutz': '',

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
    events: EVENT_DEFAULTS,
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
      rathaus: [{ id: 'queue', name: 'Besucher einweisen', desc: 'Schicke die Wartenden in der richtigen Reihenfolge zum Schalter.', mini: 'sequence', minSeconds: 6, cooldownMin: 90, reward: { efs: 8, wellbeing: 2 } }, { id: 'forms', name: 'Formulare ablegen', desc: 'Hilf im Bürgeramt, Akten zu sortieren.', mini: 'collect', minSeconds: 6, cooldownMin: 120, reward: { efs: 10, influence: 1 } }, { id: 'petition', name: 'Bürgeranliegen annehmen', desc: 'Nimm die Anliegen der Bürger auf – eins nach dem anderen.', mini: 'hunt', minSeconds: 7, cooldownMin: 150, reward: { efs: 10, influence: 2 } }],
      zeitung: [{ id: 'proof', name: 'Korrektur lesen', desc: 'Finde die Fehler im Satz.', mini: 'collect', minSeconds: 7, cooldownMin: 90, reward: { efs: 10 } }, { id: 'press', name: 'Druckmaschine anwerfen', desc: 'Drücke die Schritte in der richtigen Reihenfolge.', mini: 'sequence', minSeconds: 7, cooldownMin: 100, reward: { efs: 9, money: 300 } }, { id: 'scoop', name: 'Reportage recherchieren', desc: 'Der Tipp taucht nur kurz an einer Stelle auf.', mini: 'hunt', minSeconds: 8, cooldownMin: 120, reward: { efs: 12, influence: 1 } }],
      markt: [{ id: 'sell', name: 'Am Stand verkaufen', desc: 'Bediene die Kunden der Reihe nach.', mini: 'sequence', minSeconds: 6, cooldownMin: 75, reward: { efs: 8, money: 400 } }, { id: 'sort', name: 'Waren sortieren', desc: 'Kisten an den richtigen Stand bringen.', mini: 'collect', minSeconds: 7, cooldownMin: 60, reward: { efs: 8, money: 300 } }, { id: 'fresh', name: 'Frische prüfen', desc: 'Finde die besten Stücke am Stand.', mini: 'hunt', minSeconds: 7, cooldownMin: 80, reward: { efs: 8, wellbeing: 2 } }],
      arzt: [{ id: 'check', name: 'Vorsorge-Untersuchung', desc: 'Ein Check-up tut gut.', mini: null, minSeconds: 0, cooldownMin: 360, reward: { health: 8, efs: 5 } }, { id: 'volunteer', name: 'Wartezimmer helfen', desc: 'Reiche Patienten die Unterlagen in der richtigen Reihenfolge.', mini: 'sequence', minSeconds: 6, cooldownMin: 150, reward: { efs: 8, wellbeing: 3 } }],
      schule: [{ id: 'help', name: 'Hausaufgabenhilfe', desc: 'Hilf deinen Kindern bei den Aufgaben.', mini: 'collect', minSeconds: 6, cooldownMin: 120, requires: 'children', reward: { efs: 8, childSat: 10 } }, { id: 'play', name: 'Pausenhof-Spiel', desc: 'Spiele mit den Kindern Fangen – sie verstecken sich!', mini: 'hunt', minSeconds: 7, cooldownMin: 120, requires: 'children', reward: { efs: 6, childSat: 14, wellbeing: 3 } }],
      pension: [{ id: 'rest', name: 'Ausruhen', desc: 'Eine Runde Schlaf auf dem Zimmer.', mini: null, minSeconds: 0, cooldownMin: 30, reward: { rest: 10 } }, { id: 'chat', name: 'Mit Gästen plaudern', desc: 'Finde die gesprächigen Gäste.', mini: 'hunt', minSeconds: 6, cooldownMin: 90, reward: { wellbeing: 5, efs: 4 } }],
      home: [
        { id: 'leisure', name: 'Entspannen', desc: 'Radio, Fernseher oder Rechner – je nach Zeit.', mini: null, minSeconds: 0, cooldownMin: 60, reward: { wellbeing: 5, rest: 2 } },
        { id: 'cook', name: 'Kochen', desc: 'Bereite das Essen in der richtigen Reihenfolge zu.', mini: 'sequence', minSeconds: 6, cooldownMin: 120, reward: { efs: 6, wellbeing: 6 } },
        { id: 'rest', name: 'Ausruhen', desc: 'Ein Nickerchen im eigenen Bett.', mini: null, minSeconds: 0, cooldownMin: 30, reward: { rest: 12, wellbeing: 2 } },
        { id: 'repair', name: 'Kleinreparatur', desc: 'Finde die defekten Stellen im Haus.', mini: 'hunt', minSeconds: 8, cooldownMin: 180, reward: { efs: 9, wellbeing: 2 } },
        { id: 'tidy', name: 'Aufräumen', desc: 'Ordnung schaffen – das tut der Seele gut.', mini: 'collect', minSeconds: 6, cooldownMin: 90, reward: { efs: 6, wellbeing: 4 } },
      ],
      biz: [{ id: 'orders', name: 'Bestellungen abarbeiten', desc: 'Erledige die Aufträge in der richtigen Reihenfolge.', mini: 'sequence', minSeconds: 8, cooldownMin: 90, reward: { efs: 10, bizCash: 0.3 } }, { id: 'serve', name: 'Betrieb betreuen', desc: 'Kümmere dich persönlich um Gäste und Kunden.', mini: 'collect', minSeconds: 9, cooldownMin: 60, reward: { efs: 12, bizCash: 0.5 } }, { id: 'inventory', name: 'Inventur', desc: 'Finde die fehlenden Posten – jeweils nur einer ist sichtbar.', mini: 'hunt', minSeconds: 8, cooldownMin: 120, reward: { efs: 10, bizCash: 0.4 } }],
      work: [{ id: 'tools', name: 'Werkzeug vorbereiten', desc: 'Bringe die Arbeitsschritte in die richtige Reihenfolge.', mini: 'sequence', minSeconds: 7, cooldownMin: 100, reward: { efs: 8, wellbeing: 2 } }, { id: 'shift', name: 'Zusatzschicht', desc: 'Pack bei der Arbeit mit an.', mini: 'collect', minSeconds: 9, cooldownMin: 90, reward: { efs: 12, money: 400, rest: -4 } }, { id: 'meeting', name: 'Besprechung vorbereiten', desc: 'Finde die Unterlagen für die Runde.', mini: 'hunt', minSeconds: 7, cooldownMin: 110, reward: { efs: 9, influence: 1 } }],
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

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
/** Tiefes Zusammenführen: neue Standardwerte (auch neue Aufgaben je Gebäude) erscheinen trotz gespeicherter Einstellungen. */
function deepMerge(d, v) {
  if (isObj(d) && isObj(v)) {
    const out = { ...d };
    for (const k of Object.keys(v)) out[k] = k in d ? deepMerge(d[k], v[k]) : v[k];
    return out;
  }
  if (Array.isArray(d) && Array.isArray(v) && d.every((x) => isObj(x) && x.id) && v.every((x) => isObj(x) && x.id)) {
    const ids = new Set(v.map((x) => x.id));
    return [...v, ...d.filter((x) => !ids.has(x.id))];
  }
  return v;
}

function get(key) {
  const v = cache && Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : undefined;
  if (v === undefined) return DEFAULTS[key];
  const d = DEFAULTS[key];
  if (isObj(d) && isObj(v)) return deepMerge(d, v);
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
