'use strict';
const { rngFor, int, pick, chance, shuffle } = require('./rng');
const { yearOf, formatDate, dateOf } = require('./calendar');
const { isLearned, levelIndex } = require('./core');
const { LEVELS, LAST, randomFirstName, demonym } = require('./content');
const { townEventsForWeek, describeTownEvent } = require('./events');
const { scale } = require('./economy');
const { bizListings } = require('./business');

const TD = require('./text-defaults');
const txt = (world) => world.settings.get('texts');
const fmt = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));


/** Vom Admin angelegte Eilmeldungen und eigene Nachrichten (Einstellungen → Eilmeldungen). */
function customNews(world, state, cityId) {
  const year = yearOf(state.day, state.startYear);
  const list = world.settings.get('news.custom') || [];
  return list.filter((n) => n && n.active !== false && (n.title || n.text)
    && (!n.cityId || Number(n.cityId) === cityId)
    && year >= (Number(n.fromYear) || 0) && year <= (Number(n.toYear) || 9999))
    .map((n) => ({ title: String(n.title || ''), text: String(n.text || ''), day: state.day, ago: 0, type: 'custom', flash: !!n.flash, hint: null }))
    .sort((a, b) => Number(b.flash) - Number(a.flash));
}

function mediumFor(year) { return year >= 2002 ? 'web' : 'paper'; }

function nameJob(r, p, year, T) {
  if (p.pkey === 'helfer') return `${pick(r, year < 1965 ? T.paper.helperFirmsOld : T.paper.helperFirmsNew)} ${pick(r, LAST)}`;
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
      id: `job:${city.id}:${week}:${i}`, type: 'job', kind, pkey: p.pkey, profession: p.name, icon: p.icon, employer: nameJob(r, p, year, txt(world)),
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
    const name = pick(r, txt(world).paper.pensions);
    out.pension.push({ id: `pension:${city.id}:${week}:${i}`, type: 'pension', name: name.endsWith('Frau') ? `${name} ${pick(r, LAST)}` : name, base, perDay: scale(base, idx), cityId: city.id });
  }
  const maxRooms = city.size_tier >= 3 ? 4 : 3;
  for (let i = 0; i < 3 + (city.size_tier > 3 ? 1 : 0); i++) {
    const rooms = int(r, 1, maxRooms);
    const base = Math.round(econ.rentPerRoom[Math.min(3, rooms - 1)] * pf * (0.9 + r() * 0.25));
    out.rent.push({ id: `rent:${city.id}:${week}:${i}`, type: 'rent', name: `${rooms}-Zimmer-Wohnung, ${pick(r, txt(world).paper.streets)} ${int(r, 1, 60)}`, rooms, base, perDay: scale(base, idx), cityId: city.id });
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
      id: `sale:${city.id}:${week}:${i}`, type: 'sale', kind, name: `${def.name}, ${pick(r, txt(world).paper.streets)} ${int(r, 1, 60)}`, rooms: def.rooms, base, condition, price, rest: def.rest, cityId: city.id,
      rentPerDay: scale(require('./landlord').marketBase({ base, kind, condition }), idx),
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
      blurb: pick(r, txt(world).paper.blurbs), cityId: city.id,
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
  const T = txt(world);
  const l = allListings(world, state, cityId, week);
  // Nachrichten: Ereignisse dieser und der letzten Woche (Bericht) + Vorschau auf Unwetter
  const news = [];
  for (const w of [week - 1, week]) {
    if (w < 0) continue;
    for (const ev of townEventsForWeek(city, w, state.startYear, world.econ.events)) {
      const day = w * 7 + ev.offset;
      if (day <= state.day) news.push({ ...describeTownEvent(ev, city, 'past', T.news), day, ago: state.day - day, type: ev.type });
    }
  }
  for (const ev of townEventsForWeek(city, week, state.startYear, world.econ.events).concat(townEventsForWeek(city, week + 1, state.startYear, world.econ.events))) {
    const day = (Math.floor((ev.key.split(':')[1])) * 7) + ev.offset;
    if (ev.type === 'storm' && day > state.day && day - state.day <= 3) news.push({ ...describeTownEvent(ev, city, 'future', T.news), day, ago: state.day - day, type: 'forecast' });
  }
  for (const pr of (state.press || [])) {
    if (pr.day > state.day || state.day - pr.day > 21) continue;
    if (pr.cityId && pr.cityId !== cityId) continue;
    news.push({ title: pr.title, text: pr.text, day: pr.day, ago: state.day - pr.day, type: 'press', section: pr.section, big: !!pr.big });
  }
  news.sort((a, b) => b.day - a.day || (b.big ? 1 : 0) - (a.big ? 1 : 0));
  for (const c of customNews(world, state, cityId).reverse()) news.unshift(c);
  const d = dateOf(state.day, state.startYear);
  const words = T.paper.mastheadWords;
  const word = words[city.id % words.length];
  const dm = demonym(city.name);
  return {
    medium, city: { id: city.id, name: city.name, state: city.state },
    masthead: medium === 'paper' ? `${dm} ${word}` : fmt(T.paper.webMasthead, { city: city.name }),
    dateLabel: formatDate(state.day, state.startYear), edition: `Ausgabe ${d.doy + 1}/${year}`,
    jobs: l.jobs, housing: l.housing, partners: l.partners, biz: l.biz, news,
    tutorial: state.flags.tutorial ? T.guide : [],
    labels: medium === 'paper' ? T.paper.labelsPaper : T.paper.labelsWeb,
    kickers: { flash: T.paper.flashKicker, custom: T.paper.customKicker },
    quiet: { kicker: T.paper.quietKicker, title: fmt(T.paper.quietTitle, { city: city.name }), text: fmt(T.paper.quietText, { city: city.name }) },
  };
}

module.exports = { edition, resolveListing, allListings, mediumFor, customNews };
