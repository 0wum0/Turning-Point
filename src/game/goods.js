'use strict';
/**
 * Warenkreislauf: Katalog der Waren, Rezepte der Betriebe (was sie verbrauchen und herstellen), Preise (Großhandel, Knappheit,
 * Stadt, Politik) und die tägliche Versorgung eines Betriebs.
 *
 * Grundidee (bewusst einfach):
 *  - Jeder Betrieb hat ein Rezept: Anteile seines Umsatzes, die er in Zutaten steckt (inputs), und Waren, die er herstellt (out).
 *    Aus Umsatz und Warenpreisen ergeben sich die Mengen je Tag. Reine Erzeuger (Bauernhof, Zeche, Fischkutter …) brauchen nichts.
 *  - Der Umsatz des Betriebs ist so kalkuliert, dass er bei Einkauf im Großhandel (Marktpreis + Aufschlag) dieselbe Marge hat wie
 *    vor der Einführung der Warenwirtschaft: Anfänger müssen nichts tun und verdienen weiter. Lieferverträge sind günstiger als der
 *    Großhandel – das ist der Gewinn für Spieler, die sich kümmern.
 *  - Fehlen Zutaten, sinkt die Leistung bis auf eine Untergrenze (nie sofort null). Der Großhandel ist dagegen immer lieferbar.
 *  - Alle Preise sind „Wert von 1945“ (Cent je Einheit) und werden mit dem Preisindex des jeweiligen Spieljahres hochgerechnet.
 *    Verträge speichern den Preis ebenfalls real, so rechnen Spieler in verschiedenen Epochen exakt gegeneinander ab.
 */
const settings = require('../settings');

const clampN = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const cfg = () => settings.get('goods') || {};
function W() {
  const c = cfg();
  return {
    on: c.enabled !== false,
    markup: clampN(c.wholesaleMarkupPct, 25, 0, 200) / 100,
    discount: clampN(c.wholesaleDiscountPct, 20, 0, 80) / 100,
    strength: clampN(c.scarcityStrength, 0.35, 0, 2),
    sMin: clampN(c.scarcityMin, 0.8, 0.2, 1),
    sMax: clampN(c.scarcityMax, 1.5, 1, 5),
    cityW: clampN(c.cityPriceWeight, 0.5, 0, 2),
    floor: clampN(c.noInputEfficiencyPct, 35, 0, 100) / 100,
  };
}
const enabled = () => cfg().enabled !== false;

/* ------------------------------------------------------------------ Katalog ------------------------------------------------------------------ */
const GOODS = {};
/** add(key, Name, Einheit, Basispreis [Cent 1945 je Einheit], von, bis, Kategorie, Importanteil [1945, 2100], Optionen) */
function add(key, name, unit, base, from, to, cat, imp, opt = {}) {
  GOODS[key] = { key, name, unit, base, from, to, cat, imp: imp || [0, 0], service: !!opt.service, trend: opt.trend || null, icon: opt.icon || 'package' };
}
// Landwirtschaft & Rohstoffe
add('getreide', 'Getreide', 'kg', 25, 1945, 2999, 'agrar', [0.1, 0.2], { icon: 'wheat' });
add('gemuese', 'Gemüse & Obst', 'kg', 30, 1945, 2999, 'agrar', [0.1, 0.35], { icon: 'sprout' });
add('milch', 'Milch', 'l', 22, 1945, 2999, 'agrar', [0.02, 0.1], { icon: 'package' });
add('fleisch', 'Fleisch', 'kg', 180, 1945, 2999, 'agrar', [0.05, 0.2], { icon: 'utensils' });
add('fisch', 'Fisch', 'kg', 90, 1945, 2999, 'agrar', [0.2, 0.5], { icon: 'package' });
add('holz', 'Holz', 'kg', 4, 1945, 2999, 'rohstoff', [0.2, 0.3], { icon: 'tree-pine' });
add('kohle', 'Kohle', 'kg', 3, 1945, 2040, 'energie', [0.05, 0.9], { icon: 'flame' });
add('strom', 'Strom', 'kWh', 20, 1945, 2999, 'energie', [0.02, 0.1], { icon: 'zap' });
add('kraftstoff', 'Kraftstoff', 'l', 18, 1945, 2999, 'energie', [0.7, 0.4], { icon: 'truck' });
add('eisen', 'Eisen & Stahl', 'kg', 30, 1945, 2999, 'rohstoff', [0.15, 0.4], { icon: 'hammer' });
add('chemie', 'Chemikalien', 'kg', 80, 1945, 2999, 'rohstoff', [0.2, 0.4], { icon: 'factory' });
add('papier', 'Papier', 'kg', 60, 1945, 2999, 'rohstoff', [0.1, 0.25], { icon: 'scroll' });
add('baustoffe', 'Baustoffe', 'kg', 6, 1945, 2999, 'bau', [0.02, 0.1], { icon: 'building-2' });
// Nahrung & Genuss
add('mehl', 'Mehl', 'kg', 40, 1945, 2999, 'nahrung', [0.05, 0.1], { icon: 'wheat' });
add('brot', 'Brot & Backwaren', 'kg', 60, 1945, 2999, 'nahrung', [0, 0.05], { icon: 'croissant' });
add('suessware', 'Süßwaren & Torten', 'kg', 220, 1945, 2999, 'nahrung', [0.05, 0.2], { icon: 'cake' });
add('wurst', 'Wurstwaren', 'kg', 260, 1945, 2999, 'nahrung', [0.02, 0.1], { icon: 'utensils' });
add('bier', 'Bier', 'l', 50, 1945, 2999, 'nahrung', [0.05, 0.15], { icon: 'package' });
// Handwerk & Industrie
add('eisenwaren', 'Eisenwaren & Werkzeug', 'kg', 70, 1945, 2999, 'ware', [0.05, 0.3], { icon: 'hammer' });
add('moebel', 'Möbel', 'Stück', 2000, 1945, 2999, 'ware', [0.02, 0.4], { icon: 'house' });
add('textil', 'Stoffe & Leder', 'm', 90, 1945, 2999, 'ware', [0.15, 0.6], { icon: 'scissors' });
add('kleidung', 'Kleidung & Schuhe', 'Stück', 600, 1945, 2999, 'ware', [0.05, 0.7], { icon: 'shirt' });
add('ersatzteile', 'Ersatzteile & Maschinen', 'Stück', 400, 1950, 2999, 'ware', [0.1, 0.4], { icon: 'wrench' });
add('elektronik', 'Elektronik & IT-Hardware', 'Stück', 3500, 1960, 2999, 'ware', [0.2, 0.7], { icon: 'cpu', trend: [1960, 1, 2100, 0.35] });
add('arznei', 'Arzneimittel', 'Stück', 300, 1945, 2999, 'ware', [0.2, 0.4], { icon: 'heart-pulse' });
add('druck', 'Druckerzeugnisse', 'kg', 150, 1945, 2999, 'ware', [0.02, 0.1], { icon: 'newspaper' });
// Dienstleistungen (werden an Kundschaft verkauft, nicht zwischen Betrieben gehandelt)
add('mahlzeit', 'Mahlzeiten & Gästebetreuung', 'Mahlzeit', 120, 1945, 2999, 'dienst', null, { service: true, icon: 'utensils' });
add('ladenverkauf', 'Ladenverkauf', 'Einkauf', 150, 1945, 2999, 'dienst', null, { service: true, icon: 'shopping-basket' });
add('bauleistung', 'Bau- und Installationsarbeit', 'Arbeitsstunde', 250, 1945, 2999, 'dienst', null, { service: true, icon: 'hammer' });
add('handwerk', 'Handwerksleistung', 'Auftrag', 600, 1945, 2999, 'dienst', null, { service: true, icon: 'wrench' });
add('transport', 'Transport & Fahrten', 'Fahrt', 200, 1945, 2999, 'dienst', null, { service: true, icon: 'truck' });
add('software', 'Software & IT-Leistung', 'Projekttag', 1500, 1945, 2999, 'dienst', null, { service: true, icon: 'code' });
add('dienst', 'Dienstleistung', 'Leistung', 300, 1945, 2999, 'dienst', null, { service: true, icon: 'briefcase' });

const good = (key) => GOODS[key] || null;
const inEra = (g, year) => !!g && year >= g.from && year <= g.to;
const lerp = (a, b, f) => a + (b - a) * Math.max(0, Math.min(1, f));
/** Realpreis (Cent 1945 je Einheit) im Jahr, mit optionalem langfristigem Preistrend. */
function priceReal(g, year) {
  if (!g.trend) return g.base;
  const [y0, f0, y1, f1] = g.trend;
  return g.base * lerp(f0, f1, (year - y0) / Math.max(1, y1 - y0));
}
const importShare = (g, year) => lerp(g.imp[0], g.imp[1], (year - 1945) / 155);

/** Preisniveau der Stadt für Waren (1 = Durchschnitt); wirkt auf Einkaufspreise und – damit die Marge gleich bleibt – auf den Umsatz. */
function cityFactor(world, cityId) {
  const city = cityId != null && world && world.city ? world.city(cityId) : null;
  return 1 + (((city && city.price_factor) || 1) - 1) * W().cityW;
}

/* ------------------------------------------------------------------ Rezepte ------------------------------------------------------------------ */
// Eintrag in inputs: [Ware, Anteil am Umsatz (zu Marktpreisen), von, bis]; out: [Ware, Anteil]
const HEAT = (s) => [['kohle', s, 1945, 1964], ['strom', s, 1965, 2999]];
const REC = {};
function rec(pkeys, out, ins, label) { for (const k of [].concat(pkeys)) REC[k] = { out, in: ins || [], label: label || null }; }
const OUT = (g) => [[g, 1]];

// Erzeuger (brauchen nichts)
rec('landwirt', [['getreide', 0.3], ['milch', 0.25], ['fleisch', 0.25], ['gemuese', 0.2]], []);
rec('gaertner', OUT('gemuese'), []);
rec('kutterfischer', OUT('fisch'), []);
rec('bergmann', OUT('kohle'), []);
rec('energietechniker', OUT('strom'), []);
rec('windkraftmonteur', OUT('strom'), []);
rec('agrartechniker', OUT('dienst'), [['kraftstoff', 0.14, 1950, 2999]]);
rec('vertikalfarmer', OUT('gemuese'), [['strom', 0.18]]);
// Nahrung
rec('muehle', OUT('mehl'), [['getreide', 0.34], ...HEAT(0.03)]);
rec('baecker', OUT('brot'), [['mehl', 0.24], ['milch', 0.03], ...HEAT(0.04)]);
rec('konditor', OUT('suessware'), [['mehl', 0.1], ['milch', 0.09], ...HEAT(0.03)]);
rec('fleischermeister', OUT('wurst'), [['fleisch', 0.34], ...HEAT(0.03)]);
rec('lebensmitteltechniker', [['brot', 0.35], ['wurst', 0.25], ['suessware', 0.4]], [['mehl', 0.12], ['fleisch', 0.1], ['milch', 0.07], ['strom', 0.05]]);
rec('wirt', OUT('mahlzeit'), [['fleisch', 0.08], ['gemuese', 0.06], ['bier', 0.08], ['brot', 0.04], ...HEAT(0.04)]);
rec('servierkraft', OUT('mahlzeit'), [['fleisch', 0.08], ['gemuese', 0.06], ['bier', 0.08], ['brot', 0.04], ...HEAT(0.04)]);
rec('einzelhandelsverkaeufer', OUT('ladenverkauf'), [['brot', 0.08], ['gemuese', 0.07], ['milch', 0.06], ['wurst', 0.08], ['kleidung', 0.03], ...HEAT(0.03)]);
rec('kohlenhaendler', OUT('ladenverkauf'), [['kohle', 0.4]]);
rec('online_haendler', OUT('ladenverkauf'), [['elektronik', 0.14], ['kleidung', 0.08], ['kraftstoff', 0.04, 1945, 2060], ['strom', 0.03]]);
rec('erzieher', OUT('dienst'), [['milch', 0.05], ['gemuese', 0.05], ['brot', 0.04], ...HEAT(0.03)]);
// Handwerk & Industrie
rec('schmied', OUT('eisenwaren'), [['eisen', 0.3], ...HEAT(0.06)]);
rec('maschinenbauer', OUT('ersatzteile'), [['eisen', 0.28], ['strom', 0.05], ['elektronik', 0.05, 1975, 2999]]);
rec('tischler', OUT('moebel'), [['holz', 0.3], ['eisenwaren', 0.03], ...HEAT(0.03)]);
rec('stellmacher', OUT('handwerk'), [['holz', 0.22], ['eisen', 0.06]]);
rec('schneider', OUT('kleidung'), [['textil', 0.3], ...HEAT(0.02)]);
rec('textilfachmann', OUT('textil'), [['chemie', 0.1], ['strom', 0.07]]);
rec('modedesigner', OUT('kleidung'), [['textil', 0.26], ['strom', 0.03]]);
rec('schuhmachermeister', OUT('kleidung'), [['textil', 0.2], ...HEAT(0.02)]);
rec('orthopaedieschuhtechniker', OUT('kleidung'), [['textil', 0.18], ['strom', 0.03]]);
rec('maurer', OUT('bauleistung'), [['baustoffe', 0.28], ['holz', 0.04], ['kraftstoff', 0.03, 1955, 2999]]);
rec('betonbauer', OUT('baustoffe'), [['eisen', 0.08], ...HEAT(0.08)]);
rec('dachdecker', OUT('bauleistung'), [['baustoffe', 0.2], ['holz', 0.08]]);
rec('malermeister', OUT('bauleistung'), [['chemie', 0.18], ['papier', 0.02]]);
rec('installateur', OUT('bauleistung'), [['eisen', 0.12], ['baustoffe', 0.06]]);
rec('heizungsbauer', OUT('bauleistung'), [['eisen', 0.14], ['baustoffe', 0.04], ['elektronik', 0.06, 1980, 2999]]);
rec('waermepumpeninstallateur', OUT('bauleistung'), [['elektronik', 0.2], ['eisen', 0.05]]);
rec('solartechniker', OUT('bauleistung'), [['elektronik', 0.24], ['eisen', 0.04]]);
rec('klimatechniker', OUT('bauleistung'), [['elektronik', 0.12], ['strom', 0.05]]);
rec('elektriker', OUT('handwerk'), [['eisen', 0.1, 1945, 1964], ['elektronik', 0.2, 1965, 2999]]);
rec('kfz_mechaniker', OUT('handwerk'), [['ersatzteile', 0.3], ['kraftstoff', 0.02]]);
rec('eauto_techniker', OUT('handwerk'), [['ersatzteile', 0.2], ['elektronik', 0.12], ['strom', 0.03]]);
rec('uhrmacher', OUT('handwerk'), [['eisen', 0.08]]);
rec('optiker', OUT('handwerk'), [['eisen', 0.05], ['elektronik', 0.1, 1975, 2999]]);
rec('zahntechniker', OUT('handwerk'), [['chemie', 0.1], ['strom', 0.03]]);
rec('fernsehtechniker', OUT('handwerk'), [['elektronik', 0.3]]);
rec('smarthome_installateur', OUT('handwerk'), [['elektronik', 0.26]]);
rec('werftarbeiter', OUT('handwerk'), [['eisen', 0.3], ...HEAT(0.05)]);
rec('mechatroniker', OUT('ersatzteile'), [['eisen', 0.15], ['elektronik', 0.15], ['strom', 0.05]]);
rec('verfahrenstechniker', OUT('chemie'), [['strom', 0.18], ['kohle', 0.04, 1990, 2040]]);
rec('druck3d_fachkraft', OUT('ersatzteile'), [['eisen', 0.08], ['chemie', 0.1], ['strom', 0.08]]);
rec('biotechniker', OUT('arznei'), [['chemie', 0.1], ['strom', 0.12], ['elektronik', 0.06]]);
rec('robotertechniker', OUT('ersatzteile'), [['elektronik', 0.2], ['eisen', 0.08]]);
// Energie
rec('kraftwerkstechniker', OUT('strom'), [['kohle', 0.25, 1945, 2040]]);
rec('wasserstofftechniker', OUT('kraftstoff'), [['strom', 0.35]]);
// Verkehr
rec('fuhrmann', OUT('transport'), [['getreide', 0.12], ['eisen', 0.03]]);
rec('kraftfahrer', OUT('transport'), [['kraftstoff', 0.2], ['ersatzteile', 0.05]]);
rec('busfahrer', OUT('transport'), [['kraftstoff', 0.18], ['ersatzteile', 0.04]]);
rec('taxifahrer', OUT('transport'), [['kraftstoff', 0.15], ['ersatzteile', 0.03]]);
rec('lagerist', OUT('transport'), [['strom', 0.05]]);
rec('hafenlogistiker', OUT('transport'), [['kraftstoff', 0.1], ['strom', 0.06]]);
rec('logistiker', OUT('transport'), [['strom', 0.1], ['elektronik', 0.08]]);
rec('paketzusteller', OUT('transport'), [['kraftstoff', 0.12], ['papier', 0.03]]);
rec('drohnenpilot', OUT('transport'), [['elektronik', 0.15], ['strom', 0.05]]);
rec('flottenbetreuer', OUT('transport'), [['strom', 0.12], ['ersatzteile', 0.08]]);
rec('weltraum_logistiker', OUT('transport'), [['kraftstoff', 0.2], ['elektronik', 0.1]]);
rec('lieferroboter_betreuer', OUT('transport'), [['elektronik', 0.12], ['strom', 0.08]]);
// Medien, Büro, Technik
rec(['journalist', 'schriftsetzer'], OUT('druck'), [['papier', 0.22], ['strom', 0.04]]);
rec('mediengestalter', OUT('dienst'), [['druck', 0.06], ['strom', 0.04]]);
rec('werbekaufmann', OUT('dienst'), [['druck', 0.06], ['papier', 0.03]]);
rec('fotograf', OUT('dienst'), [['chemie', 0.06, 1945, 1999], ['elektronik', 0.06, 2000, 2999], ['papier', 0.04]]);
rec('kinovorfuehrer', OUT('dienst'), [['strom', 0.06]]);
rec('radiomoderator', OUT('dienst'), [['strom', 0.06]]);
rec(['it_fachmann', 'webentwickler', 'programmierer', 'systemadministrator', 'app_entwickler', 'cybersecurity_spezialist'], OUT('software'), [['elektronik', 0.12], ['strom', 0.06]]);
rec('ki_techniker', OUT('software'), [['elektronik', 0.15], ['strom', 0.12]]);
rec(['webdesigner', 'content_creator', 'social_media_manager', 'influencer_manager', 'vr_designer'], OUT('software'), [['elektronik', 0.08], ['strom', 0.06]]);
// Dienste mit Zutaten
rec('friseur', OUT('dienst'), [['chemie', 0.06], ...HEAT(0.04)]);
rec('gebaeudereiniger', OUT('dienst'), [['chemie', 0.15], ['strom', 0.03]]);
rec('fitnesstrainer', OUT('dienst'), [['strom', 0.08], ['chemie', 0.02]]);
rec(['pflegekraft', 'krankenpfleger'], OUT('dienst'), [['arznei', 0.12], ['brot', 0.04]]);
rec('pflegeroboter_betreuer', OUT('dienst'), [['elektronik', 0.1], ['strom', 0.05]]);
rec('arzt', OUT('dienst'), [['arznei', 0.12], ['strom', 0.03]]);
rec('zahnarzt', OUT('dienst'), [['arznei', 0.1], ['strom', 0.03]]);
rec('tierarzt', OUT('dienst'), [['arznei', 0.12], ['strom', 0.03]]);
rec('apotheker', OUT('ladenverkauf'), [['arznei', 0.3]]);
rec(['reisekaufmann', 'versicherungskaufmann', 'buchhalter', 'callcenter_agent', 'finanzwirt', 'jurist', 'architekt', 'ingenieur', 'lehrer', 'psychologe', 'umweltberater'], OUT('dienst'), [['papier', 0.03], ['strom', 0.04], ['elektronik', 0.04, 1985, 2999]]);

// Rückfall nach Berufskategorie (für vom Admin neu angelegte Berufe)
const CAT = {
  landwirtschaft: { out: OUT('gemuese'), in: [] },
  energie: { out: OUT('strom'), in: [] },
  handwerk: { out: OUT('handwerk'), in: [['eisen', 0.12], ...HEAT(0.03)] },
  industrie: { out: OUT('ersatzteile'), in: [['eisen', 0.2], ['strom', 0.08]] },
  bau: { out: OUT('bauleistung'), in: [['baustoffe', 0.2]] },
  verkehr: { out: OUT('transport'), in: [['kraftstoff', 0.15]] },
  gastronomie: { out: OUT('mahlzeit'), in: [['fleisch', 0.08], ['gemuese', 0.06], ['bier', 0.08], ['brot', 0.04], ...HEAT(0.04)] },
  technik: { out: OUT('software'), in: [['elektronik', 0.1], ['strom', 0.06]] },
  kreativ: { out: OUT('dienst'), in: [['papier', 0.04], ['strom', 0.04]] },
  akademisch: { out: OUT('dienst'), in: [['papier', 0.03], ['strom', 0.03]] },
  dienstleistung: { out: OUT('dienst'), in: [['papier', 0.03], ['strom', 0.04]] },
};

/** Rezept eines Berufs/Betriebs (Rückfall auf die Kategorie, zuletzt eine schlanke Dienstleistung). */
function recipeFor(world, pkey) {
  if (REC[pkey]) return REC[pkey];
  const p = world && world.prof ? world.prof(pkey) : null;
  return CAT[(p && p.category) || ''] || CAT.dienstleistung;
}

/**
 * Rezept im gegebenen Jahr: nur Zutaten, die es dann gibt; mult = Umsatzaufschlag für die Wareneinsätze
 * (Umsatz = Basisumsatz / (1 − Wareneinsatzquote im Großhandel)), damit die Marge bei Großhandelseinkauf unverändert bleibt.
 */
function activeRecipe(world, pkey, year, cityId) {
  const w = W();
  const r = recipeFor(world, pkey);
  const inputs = [];
  if (w.on) {
    for (const [gk, share, from, to] of r.in) {
      const g = GOODS[gk];
      if (!g || !inEra(g, year)) continue;
      if (year < (from || 0) || year > (to || 99999)) continue;
      inputs.push({ good: gk, share });
    }
  }
  const out = r.out.filter(([gk]) => GOODS[gk]).map(([gk, share]) => ({ good: gk, share }));
  const c = Math.min(0.6, inputs.reduce((s, x) => s + x.share, 0) * (1 + w.markup) * cityFactor(world, cityId));
  return { out, inputs, primary: !inputs.length, mult: w.on ? 1 / (1 - c) : 1, wholesaleShare: c };
}

/* ------------------------------------------------------------------ Markt: Knappheit und Politik ------------------------------------------------------------------ */
let SCARCITY = new Map(); // `${cityId}|${ware}` → Faktor
const EDU = () => { const e = (require('../settings').get('talente') || {}).edu || {}; const a = (x, d) => (Array.isArray(x) && x.length >= 3 && x.every(Number.isFinite) ? x : d); return { levy: a(e.levy, [0.2, 0.4, 0.6]), regionLevy: a(e.regionLevy, [0.2, 0.4, 0.6]), natLevy: a(e.natLevy, [0.3, 0.6, 0.9]), courseDisc: a(e.courseDisc, [10, 20, 30]), lehrSubsidy: a(e.lehrSubsidy, [20, 40, 60]), schoolPct: Number.isFinite(e.schoolPct) ? e.schoolPct : 10 }; };
/** Beschluss-Stufen für Jahreszeiten, Ernte und Seuchen (Umlagen in Punkten Gewerbesteuer, Hilfen in Anteilen). */
const SEAS = () => ({
  levy: { hygiene: [0.2, 0.4, 0.6], winterhilfe: [0.2, 0.35, 0.5], erntefest: [0.1, 0.2, 0.3], hospital: [0.2, 0.4, 0.6], vaccine: [0.2, 0.4, 0.6], kurzarbeit: [0.3, 0.6, 0.9], erntehilfe: [0.1, 0.2, 0.3] },
  winter: [0.2, 0.35, 0.5], kurz: [0.25, 0.45, 0.65], aid: [0.3, 0.6, 0.9], hyg: [8, 15, 22], fest: [2, 4, 6],
});
const emptyPolicy = () => ({ city: new Map(), region: new Map(), nation: { vat: 0, tariff: 0, subsidy: {}, levy: 0, frame: null, brake: 0, lehr: 0, pandemic: null, cap: null, vaccLvl: 0, kurz: 0, aid: 0 } });
let POL = emptyPolicy();

const scarcity = (cityId, key) => SCARCITY.get(`${cityId}|${key}`) || 1;
function setScarcity(map) { SCARCITY = map instanceof Map ? map : new Map(); }
function setPolicies(pol) { POL = pol || emptyPolicy(); }
let EXTRA_LEVY = new Map(); // zusätzliche Umlage je Stadt (z. B. Polizeibudget, src/lib/court-policy.js)
function setExtraLevy(m) { EXTRA_LEVY = m instanceof Map ? m : new Map(); }
let TR_LEVY = { city: new Map(), region: new Map(), nation: 0 }; // Umlage der Verkehrsbeschlüsse (src/lib/transport-policy.js)
function setTransportLevy(l) { TR_LEVY = l && l.city instanceof Map && l.region instanceof Map ? { city: l.city, region: l.region, nation: Number(l.nation) || 0 } : { city: new Map(), region: new Map(), nation: 0 }; }
const currentPolicies = () => POL;

/**
 * Knappheit je (Stadt, Ware) aus den veröffentlichten Betrieben (player_firms ∪ player_stats.year).
 * rows: [{city_id, pkey, tier, rooms, year}]. Marktgröße der Stadt (NPC-Grundlast) = Konkurrenz-Obergrenze × Umsatz je Raum.
 */
function computeScarcity(world, rows, flows) {
  const w = W(); const comp = settings.get('competition') || {}; const tiers = (world.econ.companies || {}).tiers || [];
  const S = new Map(); const D = new Map();
  for (const r of rows || []) {
    const city = world.city(r.city_id); if (!city) continue;
    const t = tiers[Math.max(0, Math.min(tiers.length - 1, Number(r.tier) || 0))]; if (!t) continue;
    const year = Number(r.year) || 1945;
    const ar = activeRecipe(world, r.pkey, year, r.city_id);
    const rev = (Number(r.rooms) || 0) * t.incomePerRoom * (0.7 + 0.15 * city.size_tier) * ar.mult; // Umsatz je Tag (Wert 1945)
    for (const o of ar.out) { const k = `${r.city_id}|${o.good}`; S.set(k, (S.get(k) || 0) + rev * o.share); }
    for (const i of ar.inputs) { const k = `${r.city_id}|${i.good}`; D.set(k, (D.get(k) || 0) + rev * i.share); }
  }
  // Handelsrouten: Was in einer Stadt ankommt, vergrößert dort das Angebot; was abgeholt wird, die Nachfrage (Wert 1945 je Tag)
  for (const f of flows || []) {
    if (!GOODS[f.good] || !(f.perDay > 0)) continue;
    const kt = `${f.to}|${f.good}`; const kf = `${f.from}|${f.good}`;
    S.set(kt, (S.get(kt) || 0) + f.perDay); D.set(kf, (D.get(kf) || 0) + f.perDay);
  }
  const out = new Map();
  const keys = new Set([...S.keys(), ...D.keys()]);
  for (const k of keys) {
    const [cid, gk] = k.split('|'); const g = GOODS[gk]; if (!g || g.service) continue;
    const city = world.city(Number(cid)); const cap = ((comp.cap && comp.cap[city ? city.size_tier : 2]) || 10);
    const N = cap * 420 * 1.5; // Grundlast der Stadt, in Wert 1945 je Tag
    const ratio = (N + (D.get(k) || 0)) / (N + (S.get(k) || 0));
    const f = Math.max(w.sMin, Math.min(w.sMax, Math.pow(ratio, w.strength)));
    if (Math.abs(f - 1) > 0.002) out.set(k, f);
  }
  return out;
}

/**
 * Politik-Zeilen (goods_policies, nur gültige) zu Wirkungen verdichten.
 * row: {office_idx, kind, good, val, scope_city, region}. Gegenfinanzierung (levy) trifft alle Betriebe im Geltungsbereich.
 */
function buildPolicies(rows) {
  const P = cfg().policy || {}; const lev = clampN(P.levyPerSubsidy, 0.15, 0, 2);
  const pol = emptyPolicy();
  for (const r of rows || []) {
    const val = Number(r.val); if (!Number.isFinite(val)) continue;
    const city = () => { if (!pol.city.has(r.scope_city)) pol.city.set(r.scope_city, { surcharge: 0, subsidy: {}, levy: 0, zone: 0, rentCap: null, edu: {}, hyg: 0, winterhilfe: 0, erntefest: 0 }); return pol.city.get(r.scope_city); };
    const reg = () => { if (!pol.region.has(r.region)) pol.region.set(r.region, { support: {}, levy: 0, zone: 0, edu: 0, hospital: 0 }); return pol.region.get(r.region); };
    if (r.kind === 'surcharge') city().surcharge = val;
    else if (r.kind === 'subsidy' && GOODS[r.good]) { const c = city(); c.subsidy[r.good] = Math.max(c.subsidy[r.good] || 0, val); c.levy += val * lev; }
    else if (r.kind === 'support' && GOODS[r.good]) { const c = reg(); c.support[r.good] = Math.max(c.support[r.good] || 0, val); c.levy += val * lev * 0.7; }
    else if (r.kind === 'natsubsidy' && GOODS[r.good]) { pol.nation.subsidy[r.good] = Math.max(pol.nation.subsidy[r.good] || 0, val); pol.nation.levy += val * lev; }
    else if (r.kind === 'rentcap') city().rentCap = Math.max(0, val);
    else if (r.kind === 'landzone') { const c = city(); c.zone = Math.max(c.zone, val); }
    else if (r.kind === 'housing') { const c = reg(); c.zone = Math.max(c.zone, val); c.levy += val * lev * 0.7; }
    else if (r.kind === 'edu_city' && ['school', 'library', 'sport'].includes(r.good) && val >= 1 && val <= 3) { const c = city(); c.edu[r.good] = Math.max(c.edu[r.good] || 0, val); c.levy += EDU().levy[val - 1] || 0; }
    else if (r.kind === 'edu_region' && val >= 1 && val <= 3) { const c = reg(); c.edu = Math.max(c.edu, val); c.levy += EDU().regionLevy[val - 1] || 0; }
    else if (r.kind === 'edu_nation' && val >= 1 && val <= 3) { pol.nation.lehr = Math.max(pol.nation.lehr, val); pol.nation.levy += EDU().natLevy[val - 1] || 0; }
    else if ((r.kind === 'hygiene' || r.kind === 'winterhilfe' || r.kind === 'erntefest') && val >= 1 && val <= 3) { const c = city(); const k = r.kind; const f = k === 'hygiene' ? 'hyg' : k; c[f] = Math.max(c[f], val); c.levy += SEAS().levy[k][val - 1]; }
    else if (r.kind === 'hospital' && val >= 1 && val <= 3) { const c = reg(); c.hospital = Math.max(c.hospital, val); c.levy += SEAS().levy.hospital[val - 1]; }
    else if (r.kind === 'lockframe' && val >= 1 && val <= 3) pol.nation.cap = val;
    else if (r.kind === 'pandemic' && val >= 0 && val <= 3) pol.nation.pandemic = val;
    else if (r.kind === 'vaccine' && val >= 1 && val <= 3) { pol.nation.vaccLvl = Math.max(pol.nation.vaccLvl, val); pol.nation.levy += SEAS().levy.vaccine[val - 1]; }
    else if (r.kind === 'kurzarbeit' && val >= 1 && val <= 3) { pol.nation.kurz = Math.max(pol.nation.kurz, SEAS().kurz[val - 1]); pol.nation.levy += SEAS().levy.kurzarbeit[val - 1]; }
    else if (r.kind === 'erntehilfe' && val >= 1 && val <= 3) { pol.nation.aid = Math.max(pol.nation.aid, SEAS().aid[val - 1]); pol.nation.levy += SEAS().levy.erntehilfe[val - 1]; }
    else if (r.kind === 'pricebrake') pol.nation.brake = val;
    else if (r.kind === 'vat') pol.nation.vat = val;
    else if (r.kind === 'tariff') pol.nation.tariff = val;
    else if (r.kind === 'frame') { const f = (P.frames || {})[r.good]; if (f) pol.nation.frame = { key: r.good, maxSurcharge: clampN(f.maxSurcharge, 4, 0, 20), maxSubsidy: clampN(f.maxSubsidy, 20, 0, 60), name: f.name || r.good }; }
  }
  return pol;
}

/** Rahmen (Bundestag) – ohne Beschluss gelten die Standardgrenzen aus den Einstellungen. */
function frame() {
  const P = cfg().policy || {};
  if (POL.nation.frame) return POL.nation.frame;
  return { key: null, maxSurcharge: clampN(P.surchargeMax, 4, 0, 20), maxSubsidy: clampN(P.subsidyMax, 20, 0, 60), name: 'Standard' };
}

/** Alle Wirkungen der Politik auf einen Betrieb in einer Stadt. */
function effectsFor(world, cityId) {
  const P = cfg().policy || {};
  const on = P.enabled !== false;
  const out = { surcharge: 0, levy: 0, vat: 0, tariff: 0, subsidy: {}, support: {}, zone: 0, rentCap: null, brake: 0, edu: { school: 0, library: 0, sport: 0, courseDisc: 0, lehrSubsidy: 0 }, epi: { hyg: 0, hospital: 0, level: null, cap: 2, vaccLvl: 0, kurz: 0 }, season: { winterhilfe: 0, erntefest: 0 }, harvest: { aid: 0 } };
  if (!on) return out;
  const city = world.city(cityId); const region = city ? city.state : '';
  const c = POL.city.get(cityId); const r = POL.region.get(region); const n = POL.nation;
  const fr = frame();
  if (c) out.surcharge = Math.max(clampN(P.surchargeMin, -2, -20, 0), Math.min(fr.maxSurcharge, c.surcharge || 0));
  out.levy = (c ? c.levy : 0) + (r ? r.levy : 0) + n.levy + (EXTRA_LEVY.get(cityId) || 0) + (TR_LEVY.city.get(cityId) || 0) + (TR_LEVY.region.get(region) || 0) + TR_LEVY.nation;
  out.vat = Math.max(clampN(P.vatMin, -3, -20, 0), Math.min(clampN(P.vatMax, 5, 0, 30), n.vat || 0));
  out.tariff = Math.max(clampN(P.tariffMin, -10, -50, 0), Math.min(clampN(P.tariffMax, 20, 0, 100), n.tariff || 0));
  for (const [g, v] of Object.entries(n.subsidy)) out.subsidy[g] = v;
  if (c) for (const [g, v] of Object.entries(c.subsidy)) out.subsidy[g] = Math.min(40, (out.subsidy[g] || 0) + v);
  if (r) out.support = { ...r.support };
  // Stadtwirtschaft: Bauland/Wohnungsbau (Angebot in %), Mietpreisbremse (erlaubter Anstieg in % je Jahr), Preisbremse (Punkte)
  out.zone = Math.max(0, Math.min(40, ((c && c.zone) || 0) + ((r && r.zone) || 0)));
  out.rentCap = c && c.rentCap != null ? c.rentCap : null;
  out.brake = Math.max(-3, Math.min(3, n.brake || 0));
  // Bildungspolitik (Talente): Schulbudget der Stadt, Bildungsprogramm des Landes, Berufsbildungsgesetz des Bundes
  const ed = EDU();
  if (c && c.edu) { out.edu.school = c.edu.school || 0; out.edu.library = c.edu.library || 0; out.edu.sport = c.edu.sport || 0; }
  out.edu.courseDisc = r && r.edu ? ed.courseDisc[r.edu - 1] || 0 : 0;
  out.edu.lehrSubsidy = n.lehr ? ed.lehrSubsidy[n.lehr - 1] || 0 : 0;
  // Jahreszeiten, Ernte und Seuchen: Hygiene/Winterhilfe/Erntefest der Stadt, Krankenhausprogramm des Landes, Maßnahmen/Rahmen/Impfkampagne/Kurzarbeit/Erntehilfe des Bundes
  const sv = SEAS();
  out.epi = { hyg: c ? c.hyg || 0 : 0, hospital: r ? r.hospital || 0 : 0, level: n.pandemic, cap: n.cap || 2, vaccLvl: n.vaccLvl || 0, kurz: n.kurz || 0 };
  out.season = { winterhilfe: c && c.winterhilfe ? sv.winter[c.winterhilfe - 1] : 0, erntefest: c ? c.erntefest || 0 : 0 };
  out.harvest = { aid: n.aid || 0 };
  return out;
}

/* ------------------------------------------------------------------ Preise ------------------------------------------------------------------ */
/**
 * Preise einer Ware in einer Stadt (Cent je Einheit in Preisen des Spieljahres):
 * base = Basispreis · Index, market = Marktpreis (Stadt, Knappheit, Zoll), buy = Großhandels-Einkaufspreis, sell = Großhandels-Ankaufspreis.
 */
function price(world, cityId, key, year) {
  const g = GOODS[key]; const w = W();
  if (!g) return null;
  const idx = world.idx(year); const ef = effectsFor(world, cityId);
  const imp = importShare(g, year);
  const cityF = cityFactor(world, cityId) * require('./cityecon').goodMult(cityId, g, year); // fester Stadtfaktor × Stadtindex (Lebensmittel/Bau, abgeschwächt)
  const scar = g.service ? 1 : scarcity(cityId, key);
  const tariff = 1 + (ef.tariff / 100) * imp;
  const base = priceReal(g, year) * idx;
  const hv = g.service ? 1 : require('./harvest').goodMult(key, year, (world.city(cityId) || {}).state, imp); // Erntejahr: schlechte Ernte verteuert Agrarwaren, Verarbeiter geben einen Teil weiter
  const market = base * cityF * scar * tariff * hv;
  const protect = 1 + 0.5 * (ef.tariff / 100) * imp; // Zoll schützt die heimischen Erzeuger
  const support = 1 + (ef.support[key] || 0) / 100;
  return {
    key, base, market, scar, imp, tariffPct: ef.tariff * imp, subsidy: ef.subsidy[key] || 0, support: ef.support[key] || 0,
    buy: market * (1 + w.markup), sell: base * cityF * scar * (1 - w.discount) * protect * support * hv,
  };
}
const scarcityLabel = (f) => (f >= 1.12 ? 'knapp' : f <= 0.9 ? 'reichlich' : 'normal');

/** Politik-Faktor auf den Umsatz der Erzeugnisse: Preisstützung (Land) und Zollschutz (Bund) je Ware, gewichtet mit dem Umsatzanteil. */
function outputFactor(ar, year, ef) {
  let f = 0;
  for (const o of ar.out) {
    const g = GOODS[o.good];
    if (!g || g.service) { f += o.share; continue; }
    f += o.share * (1 + (ef.support[o.good] || 0) / 100) * (1 + 0.5 * (ef.tariff / 100) * importShare(g, year));
  }
  return f > 0 ? f : 1;
}

/* ------------------------------------------------------------------ Versorgung eines Betriebs ------------------------------------------------------------------ */
const contractsOf = (state) => (state && state.contracts && typeof state.contracts === 'object' ? state.contracts : { buys: [], sells: [] });

/**
 * Einkauf: Bedarf je Zutat, Deckung durch Verträge (günstigste zuerst) und – wenn „Automatisch einkaufen“ an ist – Großhandel.
 * rPot = Umsatz bei voller Versorgung (Cent/Tag). Rein (keine Nebenwirkungen).
 */
function buyPlan(world, state, c, year, rPot, ar, w) {
  const idx = world.idx(year);
  const auto = c.autoBuy !== false;
  const buys = (contractsOf(state).buys || []).filter((b) => b && b.firmId === c.id && !b.ended && GOODS[b.good]);
  const needs = []; const pays = [];
  let wsum = 0; let wfill = 0; let costC = 0; let costW = 0; let subsidy = 0;
  for (const inp of ar.inputs) {
    const g = GOODS[inp.good]; const p = price(world, c.cityId, g.key, year);
    const unitBase = priceReal(g, year) * idx;
    const need = unitBase > 0 ? (rPot * inp.share) / unitBase : 0;
    let left = need; let byC = 0; let cents = 0;
    // Fracht: ab Werk zahlt der Käufer sie zum Warenpreis dazu, frei Haus der Verkäufer (dann steht sie nur in der Gutschrift); unterwegs (lag) liefert der Vertrag noch nicht
    const eff = (b) => (Number(b.price) || 0) + (b.fmode === 'seller' ? 0 : Math.max(0, Number(b.freight) || 0));
    const mine = buys.filter((b) => b.good === g.key && !(Number(b.lag) > 0)).sort((a, b) => eff(a) - eff(b));
    const used = [];
    for (const b of mine) {
      if (left <= 1e-9) break;
      const fill = b.fill == null ? 1 : Math.max(0, Math.min(1, Number(b.fill) || 0));
      const want = Math.min(left, Math.max(0, Number(b.qty) || 0)); // so viel Ware will der Betrieb aus diesem Vertrag
      const give = want * fill;
      if (want <= 1e-9) continue;
      const fr = Math.max(0, Number(b.freight) || 0);
      const cc = Math.round(give * eff(b) * idx);
      const freightCents = Math.round(give * fr * idx);
      const credit = Math.max(0, b.fmode === 'seller' ? cc - freightCents : Math.round(give * (Number(b.price) || 0) * idx));
      used.push({ id: b.id, units: give, cents: cc, sellerId: b.sellerId, sellerFirm: b.sellerFirm, sellerName: b.sellerName, freightCents });
      pays.push({ id: b.id, sellerId: b.sellerId, sellerFirm: b.sellerFirm, cents: cc, credit, freightCents, carrierUser: b.carrierUser || 0, carrierFirm: b.carrierFirm || 0, units: give, take: Math.max(0, Number(b.qty) || 0) > 0 ? want / Number(b.qty) : 0 });
      byC += give; left -= give; cents += cc;
    }
    const byW = auto ? Math.max(0, left) : 0;
    const missing = Math.max(0, left - byW);
    const cw = Math.round(byW * p.buy);
    const sub = Math.min(cents + cw, Math.round((p.subsidy / 100) * (byC + byW) * p.market));
    costC += cents; costW += cw; subsidy += sub;
    wsum += inp.share; wfill += inp.share * (need > 0 ? Math.min(1, (byC + byW) / need) : 1);
    needs.push({
      good: g.key, name: g.name, unit: g.unit, icon: g.icon, need, byContract: byC, byWholesale: byW, missing, contracts: used,
      costContract: cents, costWholesale: cw, subsidy: sub, price: p.buy, market: p.market, scar: p.scar, scarLabel: scarcityLabel(p.scar), subsidyPct: p.subsidy,
      share: inp.share, fill: need > 0 ? Math.min(1, (byC + byW) / need) : 1,
    });
  }
  const ratio = wsum > 0 ? wfill / wsum : 1;
  const status = !needs.length ? 'none' : ratio >= 0.9 ? 'ok' : ratio >= 0.5 ? 'tight' : 'missing';
  const factor = needs.length ? w.floor + (1 - w.floor) * ratio : 1;
  return { auto, needs, pays, ratio, factor, status, costContract: costC, costWholesale: costW, subsidy, cost: Math.max(0, costC + costW - subsidy) };
}

/**
 * Verkauf: Teile der Produktion können per Liefervertrag an andere Betriebe gehen (Bezahlung kommt vom Käufer);
 * der Rest läuft über Kundschaft/Großhandel (im Umsatz enthalten). rAct = Umsatz nach Versorgung. Rein.
 */
function sellPlan(world, state, c, year, rAct, ar, w, rel = 1) {
  const idx = world.idx(year);
  const sells = (contractsOf(state).sells || []).filter((s) => s && s.firmId === c.id && GOODS[s.good]);
  const outputs = []; const fills = {}; let npcShare = 1; let contractIncome = 0;
  for (const o of ar.out) {
    const g = GOODS[o.good];
    const unitSell = priceReal(g, year) * idx * (1 - w.discount);
    const units = unitSell > 0 ? (rAct * o.share) / unitSell : 0;
    const mine = g.service ? [] : sells.filter((s) => s.good === g.key);
    const committed = mine.reduce((s, x) => s + Math.max(0, Number(x.qty) || 0) * (x.take == null ? 1 : Math.max(0, Math.min(1, Number(x.take) || 0))), 0); // nur, was der Käufer wirklich abnimmt
    const fill = committed > 0 ? Math.min(1, (units * rel) / committed) : 1; // rel: Verlässlichkeit des Teams (Talente), ±6 %
    const phi = units > 0 ? Math.min(committed, units) / units : 0;
    npcShare -= o.share * phi;
    let ci = 0;
    for (const s of mine) { fills[s.id] = fill; ci += Math.max(0, Number(s.qty) || 0) * (s.take == null ? 1 : Math.max(0, Math.min(1, Number(s.take) || 0))) * fill * (Number(s.price) || 0) * idx; }
    contractIncome += ci;
    outputs.push({ good: g.key, name: g.name, unit: g.unit, icon: g.icon, service: g.service, units, share: o.share, byContract: Math.min(committed, units), committed, fill, income: Math.round(ci) });
  }
  return { outputs, fills, npcShare: Math.max(0, Math.min(1, npcShare)), contractIncome: Math.round(contractIncome), contracts: sells.length };
}

/* ------------------------------------------------------------------ Politik: Befugnisse eines Amtes ------------------------------------------------------------------ */
// Amt (Index in economy.politics.offices) → mögliche Beschlüsse
const POWERS = {
  1: ['surcharge', 'landzone', 'edu_city', 'hygiene', 'winterhilfe'],
  2: ['surcharge', 'subsidy', 'rentcap', 'landzone', 'edu_city', 'hygiene', 'winterhilfe', 'erntefest'],
  3: ['support', 'housing', 'edu_region', 'hospital'],
  4: ['frame', 'edu_nation', 'lockframe'],
  5: ['vat', 'tariff', 'natsubsidy', 'pricebrake', 'edu_nation', 'pandemic', 'vaccine', 'kurzarbeit', 'erntehilfe'],
};
const KINDS = {
  surcharge: { name: 'Gewerbesteuer-Zuschlag', scope: 'city', what: 'Punkte auf die Gewerbesteuer aller Betriebe in deiner Stadt' },
  subsidy: { name: 'Stadt-Subvention', scope: 'city', what: 'Zuschuss auf den Einkauf einer Ware für alle Betriebe in deiner Stadt' },
  support: { name: 'Preisstützung (Land)', scope: 'region', what: 'höherer Verkaufspreis einer Ware für Erzeuger in deinem Bundesland' },
  frame: { name: 'Rahmen (Bund)', scope: 'nation', what: 'Obergrenzen für Gewerbesteuer-Zuschlag und Subventionen im ganzen Land' },
  vat: { name: 'Mehrwertsteuer auf Waren', scope: 'nation', what: 'Punkte auf die Wertschöpfung (Umsatz minus Wareneinkauf) aller Betriebe' },
  tariff: { name: 'Einfuhrzoll', scope: 'nation', what: 'Prozent Aufschlag auf den importierten Anteil aller Waren' },
  natsubsidy: { name: 'Branchen-Subvention (Bund)', scope: 'nation', what: 'Zuschuss auf den Einkauf einer Ware für alle Betriebe im Land' },
  rentcap: { name: 'Mietpreisbremse', scope: 'city', what: 'Begrenzt, wie schnell das Mietniveau in deiner Stadt steigen darf' },
  landzone: { name: 'Baulandausweisung', scope: 'city', what: 'Mehr Bauland und damit mehr Wohnungen in deiner Stadt' },
  housing: { name: 'Wohnungsbauprogramm (Land)', scope: 'region', what: 'Mehr Wohnungsangebot in allen Städten deines Bundeslandes' },
  pricebrake: { name: 'Preisbremse / Inflationsziel', scope: 'nation', what: 'Schiebt das Preisniveau aller Städte etwas nach unten oder oben' },
  edu_city: { name: 'Schulbudget', scope: 'city', what: 'Schulen, Bibliothek oder Sportstätten fördern: Kinder entwickeln ihre Talente schneller, Bewohner lernen und trainieren mehr – Betriebe zahlen dafür eine kleine Umlage' },
  edu_region: { name: 'Bildungsprogramm (Land)', scope: 'region', what: 'Kurse für Mitarbeiter werden im ganzen Bundesland günstiger und wirken etwas stärker' },
  hygiene: { name: 'Gesundheitsamt & Hygiene', scope: 'city', what: 'Bremst die Ausbreitung von Seuchen in deiner Stadt – Betriebe zahlen dafür eine kleine Umlage' },
  winterhilfe: { name: 'Winterhilfe', scope: 'city', what: 'Ein Teil der zusätzlichen Heizkosten im Winter wird für alle Bewohner deiner Stadt übernommen – Betriebe zahlen eine Umlage' },
  erntefest: { name: 'Erntefest', scope: 'city', what: 'Ein Fest im Herbst bringt Gastronomie, Ausflug und Einzelhandel in deiner Stadt Kundschaft und gute Laune' },
  hospital: { name: 'Krankenhausprogramm & Impfzentren (Land)', scope: 'region', what: 'Seuchen verlaufen im ganzen Bundesland milder, Impfungen sind günstiger und werden öfter genutzt' },
  lockframe: { name: 'Rahmen für Seuchenmaßnahmen (Bund)', scope: 'nation', what: 'Legt fest, wie streng die Maßnahmen gegen Seuchen im Land höchstens sein dürfen' },
  pandemic: { name: 'Seuchenmaßnahmen (Bund)', scope: 'nation', what: 'Wie streng das Land gegen eine Seuche vorgeht: Ansteckung gegen Wirtschaft und Ansehen' },
  vaccine: { name: 'Impfkampagne (Bund)', scope: 'nation', what: 'Mehr Menschen lassen sich impfen, sobald ein Impfstoff da ist – Betriebe zahlen eine Umlage' },
  kurzarbeit: { name: 'Kurzarbeitergeld (Bund)', scope: 'nation', what: 'Der Staat gleicht einen Teil der Umsatzverluste durch Seuchenmaßnahmen aus – Betriebe zahlen eine Umlage' },
  erntehilfe: { name: 'Ernte- und Dürrehilfe (Bund)', scope: 'nation', what: 'Landwirte bekommen in schlechten Erntejahren einen Teil ihres Verlusts ersetzt – Betriebe zahlen eine Umlage' },
  edu_nation: { name: 'Berufsbildungsgesetz (Bund)', scope: 'nation', what: 'Der Staat bezahlt einen Teil des Lohns von Lehrlingen in allen Betrieben des Landes' },
};
const CE = () => require('./cityecon').C();
const tradable = (year) => Object.values(GOODS).filter((g) => !g.service && inEra(g, year));

const SEAS_LV = {
  hygiene: ['Aufklärung und Handwaschstationen', 'Hygienekonzept für Schulen und Läden', 'Gesundheitsamt mit Kontaktverfolgung'],
  winterhilfe: ['Heizkostenzuschuss', 'Wärmestuben und Zuschuss', 'Großer Winterfonds'],
  erntefest: ['Dorffest', 'Erntemarkt', 'Großes Erntefest'],
  hospital: ['Mehr Betten und Personal', 'Krankenhausprogramm', 'Krankenhäuser und Impfzentren'],
  lockframe: ['Eng: höchstens Maskenpflicht', 'Mittel: bis Kontaktbeschränkungen', 'Weit: bis Lockdown'],
  pandemic: ['Lockern: keine Maßnahmen', 'Maskenpflicht und Hygieneregeln', 'Kontaktbeschränkungen', 'Lockdown'],
  vaccine: ['Impfaufruf', 'Impfkampagne', 'Impfzentren überall'],
  kurzarbeit: ['Kurzarbeitergeld klein', 'Kurzarbeitergeld mittel', 'Kurzarbeitergeld groß'],
  erntehilfe: ['Beratung und Erntehelfer', 'Dürre- und Flutfonds', 'Großes Hilfspaket'],
};
const frameCap = () => POL.nation.cap || 2;
/** Befugnisse eines Amts mit den aktuell geltenden Grenzen (für die Oberfläche). */
function powersOf(world, officeIdx, year) {
  const P = cfg().policy || {}; const fr = frame();
  const kinds = P.enabled === false ? [] : (POWERS[officeIdx] || []);
  const goodsList = tradable(year).map((g) => ({ key: g.key, name: g.name }));
  return kinds.map((k) => {
    const base = { kind: k, ...KINDS[k] };
    if (k === 'surcharge') return { ...base, min: clampN(P.surchargeMin, -2, -20, 0), max: fr.maxSurcharge, step: 1, unit: 'Punkte' };
    if (k === 'subsidy' || k === 'natsubsidy') return { ...base, goods: goodsList, options: [5, 10, 15, 20, 30].filter((v) => v <= Math.min(clampN(P.subsidyMax, 20, 0, 60), fr.maxSubsidy)), unit: '%' };
    if (k === 'support') return { ...base, goods: goodsList, options: [5, 10, 15].filter((v) => v <= clampN(P.supportMax, 15, 0, 60)), unit: '%' };
    if (k === 'vat') return { ...base, min: clampN(P.vatMin, -3, -20, 0), max: clampN(P.vatMax, 5, 0, 30), step: 1, unit: 'Punkte' };
    if (k === 'tariff') return { ...base, min: clampN(P.tariffMin, -10, -50, 0), max: clampN(P.tariffMax, 20, 0, 100), step: 5, unit: '%' };
    if (k === 'rentcap') return { ...base, options: CE().policy.rentCap, unit: '% pro Jahr' };
    if (k === 'landzone') return { ...base, options: CE().policy.zone, unit: '%' };
    if (k === 'housing') return { ...base, options: CE().policy.program, unit: '%' };
    if (k === 'pricebrake') return { ...base, options: CE().policy.brake, unit: 'Punkte' };
    if (k === 'edu_city') return { ...base, focus: [{ key: 'school', name: 'Schulen' }, { key: 'library', name: 'Bibliothek' }, { key: 'sport', name: 'Sportstätten' }], options: [1, 2, 3], unit: 'Stufe' };
    if (k === 'edu_region' || k === 'edu_nation') return { ...base, options: [1, 2, 3], unit: 'Stufe' };
    if (SEAS_LV[k]) return { ...base, options: k === 'pandemic' ? [0, 1, 2, 3] : [1, 2, 3], levels: SEAS_LV[k].map((t, i) => ({ v: k === 'pandemic' ? i : i + 1, name: t })), unit: 'Stufe', cap: k === 'pandemic' ? frameCap() : undefined };
    if (k === 'frame') return { ...base, frames: Object.entries(P.frames || {}).map(([key, f]) => ({ key, name: f.name || key, maxSurcharge: f.maxSurcharge, maxSubsidy: f.maxSubsidy })) };
    return base;
  });
}

/** Prüft und normalisiert einen Beschluss; wirft bei ungültigen Werten. Rückgabe: Zeile für goods_policies. */
function normalizePolicy(world, officeIdx, city, year, input) {
  const kind = String(input && input.kind || '');
  const power = powersOf(world, officeIdx, year).find((x) => x.kind === kind);
  if (!power) throw new Error('Dieses Amt hat dafür keine Befugnis.');
  const row = { office_idx: officeIdx, kind, good: null, val: 0, scope_city: 0, region: null };
  if (power.scope === 'city') row.scope_city = city ? city.id : 0;
  if (power.scope === 'region') row.region = city ? city.state : null;
  if (power.scope === 'city' && !row.scope_city) throw new Error('Dir fehlt eine Heimatstadt.');
  if (power.scope === 'region' && !row.region) throw new Error('Dir fehlt eine Heimatregion.');
  const num = Number(input.value);
  if (kind === 'surcharge' || kind === 'vat' || kind === 'tariff') {
    if (!Number.isFinite(num) || Math.round(num) !== num) throw new Error('Bitte einen ganzzahligen Wert wählen.');
    if (num < power.min || num > power.max) throw new Error(`Erlaubt sind Werte von ${power.min} bis ${power.max}.`);
    if (kind === 'tariff' && num % 5 !== 0) throw new Error('Der Zoll wird in 5er-Schritten festgelegt.');
    row.val = num;
  } else if (kind === 'subsidy' || kind === 'natsubsidy' || kind === 'support') {
    const g = String(input.good || '');
    if (!power.goods.some((x) => x.key === g)) throw new Error('Bitte eine handelbare Ware wählen.');
    if (!power.options.includes(num)) throw new Error('Dieser Satz ist nicht erlaubt (siehe Rahmen).');
    row.good = g; row.val = num;
  } else if (kind === 'rentcap' || kind === 'landzone' || kind === 'housing' || kind === 'pricebrake') {
    if (!Number.isFinite(num) || Math.round(num) !== num || !power.options.includes(num)) throw new Error('Dieser Wert ist nicht erlaubt.');
    row.val = num;
  } else if (kind === 'edu_city') {
    const g = String(input.good || '');
    if (!power.focus.some((x) => x.key === g)) throw new Error('Bitte Schulen, Bibliothek oder Sportstätten wählen.');
    if (!power.options.includes(num)) throw new Error('Diese Stufe ist nicht erlaubt.');
    row.good = g; row.val = num;
  } else if (kind === 'edu_region' || kind === 'edu_nation') {
    if (!power.options.includes(num)) throw new Error('Diese Stufe ist nicht erlaubt.');
    row.val = num;
  } else if (SEAS_LV[kind]) {
    if (!Number.isFinite(num) || Math.round(num) !== num || !power.options.includes(num)) throw new Error('Diese Stufe ist nicht erlaubt.');
    row.val = num;
  } else if (kind === 'frame') {
    const key = String(input.good || input.value || '');
    if (!power.frames.some((x) => x.key === key)) throw new Error('Unbekannter Rahmen.');
    row.good = key; row.val = 1;
  }
  return row;
}

/** Vorschau der Beschlüsse zu Jahreszeiten, Ernte und Seuchen (Zahlen, die Oberfläche formuliert Sätze). */
function previewSeasons(world, row, L, cityId) {
  const sv = SEAS(); const v = row.val; const k = row.kind; const lv = sv.levy[k];
  if (k === 'hygiene') { L('hygiene', v, sv.hyg[v - 1]); L('levy', lv[v - 1]); }
  else if (k === 'winterhilfe') { L('winterhilfe', v, Math.round(sv.winter[v - 1] * 100)); L('levy', lv[v - 1]); }
  else if (k === 'erntefest') { L('erntefest', v, sv.fest[v - 1]); L('levy', lv[v - 1]); }
  else if (k === 'hospital') { L('hospital', v, 10 * v, 25 * v); L('levy', lv[v - 1]); }
  else if (k === 'lockframe') { L('lockframe', v, require('./epidemics').MEASURE_NAME[v]); }
  else if (k === 'pandemic') {
    const EPI = require('./epidemics'); const c = EPI.C(); const cap = frameCap(); const eff = Math.min(v, cap);
    const cut = Math.round(c.measures[eff] * 100);
    const lockTab = (col) => Math.round((eff ? c.lock[col][eff - 1] : 0) * 100);
    L('pandemic', v, { name: EPI.MEASURE_NAME[eff], infect: cut, gastro: lockTab('gastro'), tourism: lockTab('tourism'), retail: lockTab('retail'), other: lockTab('other'), cap, capped: eff < v }, v === 3 ? 'unpopular' : v === 0 ? 'risky' : v === 1 ? 'popular' : 'neutral');
  }
  else if (k === 'vaccine') { L('vaccine', v, 10 * v); L('levy', lv[v - 1]); }
  else if (k === 'kurzarbeit') { L('kurzarbeit', v, Math.round(sv.kurz[v - 1] * 100)); L('levy', lv[v - 1]); }
  else if (k === 'erntehilfe') { L('erntehilfe', v, Math.round(sv.aid[v - 1] * 100)); L('levy', lv[v - 1]); }
}

/** Kurz erklärte Wirkung eines Beschlusses (Zahlen; die Oberfläche formuliert daraus Sätze). */
function previewPolicy(world, row, year, cityId) {
  const P = cfg().policy || {}; const lev = clampN(P.levyPerSubsidy, 0.15, 0, 2);
  const g = row.good ? GOODS[row.good] : null;
  const out = { kind: row.kind, good: g ? g.name : null, value: row.val, unit: g ? g.unit : null, lines: [] };
  const L = (key, a, b, c) => out.lines.push({ key, a, b, c });
  if (row.kind === 'surcharge') L('surcharge', row.val, Math.round(row.val * 10) / 10); // Punkte, Euro je 100 Gewinn
  else if (row.kind === 'subsidy' || row.kind === 'natsubsidy') { L(row.kind, row.val, g.name); L('levy', Math.round(row.val * lev * 10) / 10); }
  else if (row.kind === 'support') { L('support', row.val, g.name); L('levy', Math.round(row.val * lev * 0.7 * 10) / 10); }
  else if (row.kind === 'edu_city') { const ed = EDU(); const lv = row.val; L('edu_city', lv, row.good, ed.schoolPct * lv); L('levy', ed.levy[lv - 1] || 0); }
  else if (row.kind === 'edu_region') { const ed = EDU(); L('edu_region', row.val, ed.courseDisc[row.val - 1] || 0); L('levy', ed.regionLevy[row.val - 1] || 0); }
  else if (row.kind === 'edu_nation') { const ed = EDU(); L('edu_nation', row.val, ed.lehrSubsidy[row.val - 1] || 0); L('levy', ed.natLevy[row.val - 1] || 0); }
  else if (SEAS_LV[row.kind]) previewSeasons(world, row, L, cityId);
  else if (row.kind === 'vat') L('vat', row.val);
  else if (row.kind === 'tariff') {
    const ex = ['kraftstoff', 'elektronik', 'kleidung', 'fisch'].filter((k) => inEra(GOODS[k], year)).map((k) => ({ name: GOODS[k].name, imp: Math.round(importShare(GOODS[k], year) * 100), up: Math.round(row.val * importShare(GOODS[k], year) * 10) / 10 }));
    L('tariff', row.val, ex);
  } else if (row.kind === 'frame') { const f = (P.frames || {})[row.good] || {}; L('frame', f.maxSurcharge, f.maxSubsidy, f.name || row.good); }
  else if (row.kind === 'rentcap' || row.kind === 'landzone' || row.kind === 'housing' || row.kind === 'pricebrake') {
    const ce = require('./cityecon'); const cid = cityId || row.scope_city || 0; const fx = ce.previewEffect(world, cid, row, effectsFor(world, cid), Date.now());
    const pc = ce.C().policy;
    if (row.kind === 'rentcap') L('rentcap', row.val, fx, Math.round(pc.capPenalty * 100));
    else if (row.kind === 'landzone') L('landzone', row.val, fx, Math.round(pc.zoneBuild * row.val * 10) / 10);
    else if (row.kind === 'housing') { L('housing', row.val, fx); L('levy', Math.round(row.val * lev * 0.7 * 10) / 10); }
    else L('pricebrake', row.val, fx);
  }
  return out;
}

/** Beispielkatalog für die Oberfläche (Waren der Epoche mit Preisen in der Stadt). */
function priceList(world, cityId, year, keys) {
  const list = keys && keys.length ? keys.map((k) => GOODS[k]).filter(Boolean) : tradable(year);
  return list.filter((g) => inEra(g, year)).map((g) => {
    const p = price(world, cityId, g.key, year);
    return { key: g.key, name: g.name, unit: g.unit, icon: g.icon, service: g.service, base: Math.round(p.base * 100) / 100, buy: Math.round(p.buy * 100) / 100, sell: Math.round(p.sell * 100) / 100, scarLabel: scarcityLabel(p.scar), subsidy: p.subsidy, tariffPct: Math.round(p.tariffPct * 10) / 10, support: p.support };
  });
}

/** Beispiel-Lieferketten für die Erklärung „Warenkreislauf“: Schritte mit Berufsschlüssel (zum Hervorheben eigener Betriebe). */
const CHAINS = [
  { name: 'Brot', steps: [{ label: 'Bauernhof', pkey: 'landwirt', good: 'getreide' }, { label: 'Mühle', pkey: 'muehle', good: 'mehl' }, { label: 'Bäckerei', pkey: 'baecker', good: 'brot' }, { label: 'Ladengeschäft', pkey: 'einzelhandelsverkaeufer', good: 'ladenverkauf' }] },
  { name: 'Fleisch & Gaststätte', steps: [{ label: 'Bauernhof', pkey: 'landwirt', good: 'fleisch' }, { label: 'Fleischerei', pkey: 'fleischermeister', good: 'wurst' }, { label: 'Wirtshaus', pkey: 'wirt', good: 'mahlzeit' }] },
  { name: 'Möbel', steps: [{ label: 'Holz (Großhandel)', pkey: null, good: 'holz' }, { label: 'Tischlerei', pkey: 'tischler', good: 'moebel' }, { label: 'Ladengeschäft', pkey: 'einzelhandelsverkaeufer', good: 'ladenverkauf' }] },
  { name: 'Hausbau', steps: [{ label: 'Betonwerk', pkey: 'betonbauer', good: 'baustoffe' }, { label: 'Baufirma', pkey: 'maurer', good: 'bauleistung' }, { label: 'Dachdecker', pkey: 'dachdecker', good: 'bauleistung' }] },
  { name: 'Strom & Technik', steps: [{ label: 'Zeche', pkey: 'bergmann', good: 'kohle' }, { label: 'Kraftwerk', pkey: 'kraftwerkstechniker', good: 'strom' }, { label: 'IT-Firma', pkey: 'it_fachmann', good: 'software' }] },
];

module.exports = {
  GOODS, KINDS, POWERS, CHAINS, REC, enabled, W, good, inEra, priceReal, importShare, recipeFor, activeRecipe,
  setScarcity, computeScarcity, scarcity, scarcityLabel, setPolicies, setExtraLevy, setTransportLevy, buildPolicies, currentPolicies, frame, effectsFor, price, priceList,
  outputFactor, buyPlan, sellPlan, powersOf, normalizePolicy, previewPolicy, tradable, SEAS, SEAS_LV,
};
