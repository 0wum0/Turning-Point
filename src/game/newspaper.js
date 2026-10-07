'use strict';
const { rngFor, int, pick, chance, shuffle } = require('./rng');
const { yearOf, formatDate, dateOf } = require('./calendar');
const { isLearned, levelIndex } = require('./core');
const { LEVELS, LAST, randomFirstName, demonym } = require('./content');
const { townEventsForWeek, describeTownEvent } = require('./events');
const { scale } = require('./economy');
const { bizListings } = require('./business');

const STREETS = ['Hauptstraße', 'Bahnhofstraße', 'Gartenweg', 'Lindenallee', 'Schillerstraße', 'Am Markt', 'Goethestraße', 'Ringstraße', 'Mühlenweg', 'Kirchplatz', 'Birkenweg', 'Hafenstraße'];
const PENSIONS = ['Pension Haus Linde', 'Gästehaus Sonnenschein', 'Pension Zur Post', 'Fremdenzimmer Frau', 'Pension Am Bahnhof', 'Gasthof Zum Löwen'];
const HELPER_FIRMS_OLD = ['Trümmerbeseitigung', 'Aufbauhilfe', 'Hafenarbeit', 'Fuhrbetrieb', 'Erntehilfe'];
const HELPER_FIRMS_NEW = ['Lagerservice', 'Reinigungsdienst', 'Bauhilfsdienst', 'Verpackung & Versand', 'Gartenservice'];
const BLURBS = ['sucht einen verlässlichen Menschen fürs Leben.', 'liebt Tanz und Sonntagsspaziergänge.', 'ist fleißig, bescheiden und treu.', 'hat Humor und ein großes Herz.', 'wünscht sich Kinder und ein Zuhause.', 'kocht gern und lacht viel.', 'ist naturverbunden und häuslich.'];

const TUTORIAL = [
  { id: 't1', title: 'Wie geht es dir? – Die vier Anzeigen', text: 'Oben rechts siehst du Kühlschrank, Wohlbefinden, Erholung und Gesundheit. Sie hängen zusammen: Wer gut isst und in einer richtigen Wohnung schläft, bleibt gesund und leistungsfähig.', info: ['Vier Werte bestimmen dein Leben.', 'Fällt einer stark ab, ziehen die anderen mit nach unten.', 'Halte den Kühlschrank gefüllt, such dir eine Unterkunft und eine Arbeit.'] },
  { id: 't2', title: 'Kein Dach, kein Leben', text: 'Wer auf der Straße schläft, überlebt nur etwa drei Tage. Schlafplätze beim Arbeitgeber sind billig, aber nur eine Notlösung. Pension, Miete und schließlich ein eigenes Haus bringen mehr Erholung.', info: ['Wohnen ist die Basis deiner Erholung.', 'Je besser die Wohnform, desto besser Erholung und Gesundheit.', 'Suche unter „Wohnungsmarkt“ eine Pension oder Miete.'] },
  { id: 't3', title: 'Arbeit, Ausbildung und Erfahrung', text: 'Eine Ausbildung kostet kein Geld, bringt aber nur Lehrlingslohn. Wer etwa zehn Jahre in einem Beruf arbeitet, gilt ebenfalls als ausgebildet. Höhere Stufen bringen mehr Lohn.', info: ['Ausbildung ist kostenlos, Studium nicht.', 'Berufe bestimmen später, welche Unternehmen du betreiben darfst.', 'Schau in den Stellenmarkt nach Lehrstellen und Arbeit.'] },
  { id: 't4', title: 'Vorrat ist alles', text: 'Der Kühlschrank muss regelmäßig gefüllt werden – egal wo du wohnst. Bessere Qualität hebt Stimmung und Gesundheit, kostet aber mehr.', info: ['Essen kostet Geld und Zeit.', 'Ein leerer Kühlschrank schadet Stimmung und Gesundheit täglich.', 'Kaufe unter „Haushalt“ Lebensmittel.'] },
  { id: 't5', title: 'EFS – deine Zeit', text: 'Jeder Tag bringt dir 50 EFS, ein Login weitere 50. Ein EFS entspricht einem Spieltag; 365 EFS sind ein Jahr. Du entscheidest, wann du Zeit „vorspulst“. Auch wenn du nicht da bist, läuft das Leben weiter.', info: ['EFS sind Erfahrung, Fortschritt und Zeit zugleich.', 'Mehr EFS = schneller älter, aber auch mehr Verdienst.', 'Sammle EFS auf der Karte und spule die Zeit vor, wenn du bereit bist.'] },
  { id: 't6', title: 'Coins – die besondere Währung', text: 'Coins sind frei verdienbar durch freiwillige Werbung und für jedes Kind. Sie bleiben dir über Tod und Neustart erhalten. Wer Werbung ansieht, kann Coin-Preise Schritt für Schritt senken.', info: ['Coins sind Meta-Fortschritt.', 'Umzüge und besondere Dinge kosten Coins.', 'Du entscheidest selbst, ob du Werbung ansiehst.'] },
  { id: 't7', title: 'Familie ist Vermächtnis', text: 'Kinder kosten Geld und Platz, bringen aber Kindergeld, Coins und später die Erben deines Lebenswerks. Ohne volljährigen Erben endet die Linie.', info: ['Ohne Erben gibt es kein zweites Leben für die Familie.', 'Der Pflichtanteil verteilt das Erbe gleichmäßig auf die Kinder.', 'Suche unter „Kontakte“ eine Partnerin oder einen Partner.'] },
  { id: 't8', title: 'Versichere dich', text: 'Unwetter, Feuer und Einbrüche kommen vor. Eine Versicherung ersetzt Schäden – aber nicht die Ausfallzeit.', info: ['Ohne Versicherung zahlst du Schäden selbst.', 'Mit Versicherung wird der Schaden ersetzt, das Gebäude fällt trotzdem aus.', 'Schließe unter „Haushalt“ Versicherungen ab.'] },
];

function mediumFor(year) { return year >= 2002 ? 'web' : 'paper'; }

function nameJob(r, p, year) {
  if (p.pkey === 'helfer') return `${pick(r, year < 1965 ? HELPER_FIRMS_OLD : HELPER_FIRMS_NEW)} ${pick(r, LAST)}`;
  if (p.academic) return `${p.unlocks || 'Praxis'} ${pick(r, ['Dr. ', 'Prof. ', ''])}${pick(r, LAST)}`;
  const base = p.unlocks || p.name;
  return `${base} ${pick(r, LAST)}`;
}

function jobListings(world, state, city, week) {
  const year = yearOf(state.day, state.startYear);
  const idx = world.idx(year);
  const r = rngFor('jobs', city.id, week);
  const active = world.activeProfessions(year).filter((p) => !p.academic);
  const learned = active.filter((p) => isLearned(state, p.pkey) && p.pkey !== 'helfer');
  const academic = world.activeProfessions(year).filter((p) => p.academic && isLearned(state, p.pkey));
  const chosen = [];
  for (const p of shuffle(r, learned).slice(0, 3)) chosen.push(p);
  for (const p of academic) chosen.push(p);
  chosen.push(world.prof('helfer'));
  const others = shuffle(r, active.filter((p) => !chosen.includes(p) && p.pkey !== 'helfer'));
  const n = 5 + city.size_tier;
  while (chosen.length < n && others.length) chosen.push(others.shift());
  const ls = chosen.filter(Boolean).map((p, i) => {
    const factor = Math.round((0.9 + r() * 0.25) * 100) / 100;
    const kind = isLearned(state, p.pkey) ? 'work' : 'training';
    const lodging = !!p.lodging && chance(r, Math.min(0.8, Math.max(0.1, 0.8 - (year - 1945) / 60)));
    const lv = LEVELS[levelIndex(state, p.pkey)].mult;
    const wage = kind === 'work' ? scale(p.base_wage, idx, factor * lv) : scale(p.base_wage, idx, factor * 0.4);
    return {
      id: `job:${city.id}:${week}:${i}`, type: 'job', kind, pkey: p.pkey, profession: p.name, icon: p.icon, employer: nameJob(r, p, year),
      factor, lodging, wage, trainingDays: kind === 'training' ? p.training_days : 0, cityId: city.id,
    };
  });
  return ls;
}

function housingListings(world, state, city, week) {
  const year = yearOf(state.day, state.startYear);
  const idx = world.idx(year);
  const econ = world.econ;
  const r = rngFor('housing', city.id, week);
  const out = { pension: [], rent: [], sale: [] };
  const pf = city.price_factor;
  for (let i = 0; i < 2; i++) {
    const base = Math.round(econ.lodging.pension * pf * (0.9 + r() * 0.25));
    const name = pick(r, PENSIONS);
    out.pension.push({ id: `pension:${city.id}:${week}:${i}`, type: 'pension', name: name.endsWith('Frau') ? `${name} ${pick(r, LAST)}` : name, base, perDay: scale(base, idx), cityId: city.id });
  }
  const maxRooms = city.size_tier >= 3 ? 4 : 3;
  for (let i = 0; i < 3 + (city.size_tier > 3 ? 1 : 0); i++) {
    const rooms = int(r, 1, maxRooms);
    const base = Math.round(econ.rentPerRoom[Math.min(3, rooms - 1)] * pf * (0.9 + r() * 0.25));
    out.rent.push({ id: `rent:${city.id}:${week}:${i}`, type: 'rent', name: `${rooms}-Zimmer-Wohnung, ${pick(r, STREETS)} ${int(r, 1, 60)}`, rooms, base, perDay: scale(base, idx), cityId: city.id });
  }
  const kinds = [['flat', 4], ['house_small', 3], ['house_large', 1.5], ['villa', 0.5]];
  for (let i = 0; i < 2 + (city.size_tier > 3 ? 1 : 0); i++) {
    let x = r() * kinds.reduce((s, k) => s + k[1], 0);
    let kind = 'flat';
    for (const k of kinds) { x -= k[1]; if (x <= 0) { kind = k[0]; break; } }
    const def = econ.property[kind];
    const base = Math.round(def.price * pf * (0.85 + r() * 0.4));
    const condition = int(r, 45, 95);
    const price = Math.round(base * idx * (0.2 + 0.8 * (condition / 100)));
    out.sale.push({
      id: `sale:${city.id}:${week}:${i}`, type: 'sale', kind, name: `${def.name}, ${pick(r, STREETS)} ${int(r, 1, 60)}`, rooms: def.rooms, base, condition, price, rest: def.rest, cityId: city.id,
    });
  }
  return out;
}

function partnerListings(world, state, city, week) {
  if (state.partner) return [];
  const year = yearOf(state.day, state.startYear);
  const r = rngFor('partners', city.id, week);
  const myAge = Math.floor((state.day - state.person.birthDay) / 365);
  const profs = world.activeProfessions(year).filter((p) => p.pkey !== 'helfer');
  const out = [];
  for (let i = 0; i < 3; i++) {
    const gender = r() < 0.5 ? 'f' : 'm';
    const age = Math.min(48, Math.max(18, myAge + int(r, -6, 8)));
    const first = randomFirstName(r, year - age, gender);
    const p = pick(r, profs);
    out.push({
      id: `partner:${city.id}:${week}:${i}`, type: 'partner', gender, name: `${first} ${pick(r, LAST)}`, age, pkey: p.pkey, profession: p.name,
      blurb: pick(r, BLURBS), cityId: city.id,
    });
  }
  return out;
}

function allListings(world, state, cityId, week) {
  const city = world.city(cityId);
  return { jobs: jobListings(world, state, city, week), housing: housingListings(world, state, city, week), partners: partnerListings(world, state, city, week), biz: bizListings(world, state, city, week) };
}

function resolveListing(world, state, id) {
  const m = /^(job|pension|rent|sale|partner|biz):(\d+):(\d+):(\d+)$/.exec(id || '');
  if (!m) return null;
  const cityId = Number(m[2]);
  const week = Number(m[3]);
  if (week !== Math.floor(state.day / 7)) return null;
  const city = world.city(cityId);
  if (!city) return null;
  const l = allListings(world, state, cityId, week);
  return [...l.jobs, ...l.housing.pension, ...l.housing.rent, ...l.housing.sale, ...l.partners, ...l.biz].find((x) => x.id === id) || null;
}

function edition(world, state, cityId) {
  const city = world.city(cityId);
  const year = yearOf(state.day, state.startYear);
  const week = Math.floor(state.day / 7);
  const medium = mediumFor(year);
  const l = allListings(world, state, cityId, week);
  // Nachrichten: Ereignisse dieser und der letzten Woche (Bericht) + Vorschau auf Unwetter
  const news = [];
  for (const w of [week - 1, week]) {
    if (w < 0) continue;
    for (const ev of townEventsForWeek(city, w, state.startYear)) {
      const day = w * 7 + ev.offset;
      if (day <= state.day) news.push({ ...describeTownEvent(ev, city, 'past'), day, ago: state.day - day, type: ev.type });
    }
  }
  for (const ev of townEventsForWeek(city, week, state.startYear).concat(townEventsForWeek(city, week + 1, state.startYear))) {
    const day = (Math.floor((ev.key.split(':')[1])) * 7) + ev.offset;
    if (ev.type === 'storm' && day > state.day && day - state.day <= 3) news.push({ ...describeTownEvent(ev, city, 'future'), day, ago: state.day - day, type: 'forecast' });
  }
  news.sort((a, b) => b.day - a.day);
  const d = dateOf(state.day, state.startYear);
  const word = ['Tageblatt', 'Anzeiger', 'Kurier', 'Nachrichten', 'Zeitung'][city.id % 5];
  const dm = demonym(city.name);
  return {
    medium, city: { id: city.id, name: city.name, state: city.state },
    masthead: medium === 'paper' ? `${dm} ${word}` : `${city.name} · Das Netz`,
    dateLabel: formatDate(state.day, state.startYear), edition: `Ausgabe ${d.doy + 1}/${year}`,
    jobs: l.jobs, housing: l.housing, partners: l.partners, biz: l.biz, news,
    tutorial: state.flags.tutorial ? TUTORIAL : [],
    labels: medium === 'paper'
      ? { jobs: 'Stellenmarkt', housing: 'Wohnungsmarkt', partners: 'Kontakte', news: 'Aus der Stadt', biz: 'Gewerbe' }
      : { jobs: 'Jobbörse', housing: 'Immobilienportal', partners: 'Partnerbörse', news: 'Nachrichten', biz: 'Unternehmensbörse' },
  };
}

module.exports = { edition, resolveListing, allListings, mediumFor, TUTORIAL };
