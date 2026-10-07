'use strict';
const settings = require('../settings');
const press = require('./press');
const { rngFor, chance, weighted } = require('./rng');
const { yearOf } = require('./calendar');
const { scale, haversineKm } = require('./economy');
const {
  clamp, notice, chronicle, award, isLearned, learn, propertyValue, dailyFlows, kidsAtHome, roomsAvailable,
  residenceProperty,
} = require('./core');
const { resolveListing } = require('./newspaper');
const { addPerson } = require('./state');
const { SCHOOLS } = require('./content');
const { ageOfChild } = require('./family');
const biz = require('./business');

class ActionError extends Error {}
const fail = (m) => { throw new ActionError(m); };
const yr = (state) => yearOf(state.day, state.startYear);
const pay = (state, cents) => { state.money -= cents; state.stats.spent += cents; };
const cityFactor = (world, state) => { const c = world.city(state.cityId); return 0.6 + 0.4 * (c ? c.price_factor : 1); };

/** Coin-Preisleiter: 50 → 25 → 13 → 7 → 4 → 2 → 1 (jede freiwillige Werbung halbiert). */
function ladder(base, step) {
  let v = base;
  for (let i = 0; i < step; i++) v = Math.ceil(v / 2);
  return base > 0 ? Math.max(1, v) : 0;
}

function moveQuote(world, state, cityId) {
  const target = world.city(cityId);
  if (!target) fail('Unbekannte Stadt.');
  if (target.since > yr(state)) fail('Diesen Ort gibt es noch nicht.');
  if (target.id === state.person.birthCityId) return { free: true, km: 0, money: 0, coins: 0, baseCoins: 0, step: 0 };
  const origins = [world.city(state.cityId), ...state.properties.map((p) => world.city(p.cityId))].filter(Boolean);
  const km = Math.min(...origins.map((o) => (o.id === target.id ? 0 : haversineKm(o, target))));
  const econ = world.econ;
  const idx = world.idx(yr(state));
  const money = Math.round((econ.moveBaseCost + econ.moveCostPerKm * km) * idx);
  const baseCoins = km < 1 ? 0 : Math.max(1, Math.ceil((km / 100) * settings.get('coins.move_per_100km')));
  const key = `move:${cityId}`;
  const step = state.discounts[key] || 0;
  return { free: false, km: Math.round(km), money, baseCoins, coins: ladder(baseCoins, step), step, key };
}

const A = {};

/* ---------------- Arbeit & Bildung ---------------- */
A.apply = ({ world, state, input }) => {
  const l = resolveListing(world, state, input.listingId);
  if (!l || l.type !== 'job') fail('Diese Anzeige ist nicht mehr aktuell.');
  if (l.cityId !== state.cityId) fail('Du musst in dieser Stadt wohnen, um die Stelle anzutreten.');
  const p = world.prof(l.pkey);
  if (!p) fail('Beruf nicht gefunden.');
  if (l.kind === 'work' && !isLearned(state, l.pkey)) fail('Dafür fehlt dir die Qualifikation.');
  if (l.kind === 'training' && isLearned(state, l.pkey)) fail('Diesen Beruf beherrschst du bereits.');
  state.occupation = { kind: l.kind, pkey: l.pkey, employer: l.employer, cityId: l.cityId, factor: l.factor, lodging: l.lodging, since: state.day, daysLeft: l.kind === 'training' ? p.training_days : 0 };
  if (state.housing.type === 'workplace' && !l.lodging) state.housing = { type: 'street', cityId: state.cityId };
  award(state, l.kind === 'training' ? 'training_start' : 'job_start');
  press.story(world, state, l.kind === 'training' ? 'training_start' : 'job_new', { employer: l.employer, job: p.name });
  return { msg: l.kind === 'training' ? `Du beginnst eine Ausbildung zum ${p.name} bei ${l.employer}.` : `Du arbeitest jetzt als ${p.name} bei ${l.employer}.` };
};

A.quit = ({ state }) => {
  if (!state.occupation) fail('Du hast keine Stelle.');
  state.occupation = null;
  if (state.housing.type === 'workplace') state.housing = { type: 'street', cityId: state.cityId };
  return { msg: 'Du hast gekündigt.' };
};

A.study = ({ world, state, input }) => {
  const p = world.prof(input.pkey);
  if (!p || !p.academic) fail('Kein Studiengang.');
  if (isLearned(state, p.pkey)) fail('Diesen Abschluss hast du schon.');
  const idx = world.idx(yr(state));
  const day = scale(p.tuition_day, idx);
  if (state.money < day * 60) fail('Für ein Studium brauchst du einen Puffer von mindestens 60 Tagen Studiengebühren.');
  state.occupation = { kind: 'study', pkey: p.pkey, employer: 'Universität', cityId: state.cityId, factor: 1, lodging: false, since: state.day, daysLeft: p.training_days };
  if (state.housing.type === 'workplace') state.housing = { type: 'street', cityId: state.cityId };
  award(state, 'training_start');
  press.story(world, state, 'study_start', { job: p.name });
  return { msg: `Du beginnst das Studium: ${p.name}.` };
};

/* ---------------- Wohnen ---------------- */
A.sleepAtWork = ({ state }) => {
  const o = state.occupation;
  if (!o || !o.lodging || o.cityId !== state.cityId) fail('Dein Arbeitgeber bietet keinen Schlafplatz an.');
  state.housing = { type: 'workplace', cityId: state.cityId };
  return { msg: 'Du schläfst jetzt beim Arbeitgeber.' };
};

A.rent = ({ world, state, input }) => {
  const l = resolveListing(world, state, input.listingId);
  if (!l || (l.type !== 'rent' && l.type !== 'pension')) fail('Diese Anzeige ist nicht mehr aktuell.');
  if (l.cityId !== state.cityId) fail('Du musst dazu in der Stadt wohnen.');
  const idx = world.idx(yr(state));
  const day = scale(l.base, idx);
  if (state.money < day * 3) fail('Dir fehlt das Geld für die ersten Tage.');
  state.housing = { type: l.type, cityId: l.cityId, name: l.name, base: l.base, rooms: l.rooms || 1 };
  award(state, 'rent');
  return { msg: `${l.name} bezogen.` };
};

A.buy = ({ world, state, input }) => {
  const l = resolveListing(world, state, input.listingId);
  if (!l || l.type !== 'sale') fail('Dieses Angebot ist nicht mehr aktuell.');
  if (state.money < l.price) fail('Dafür reicht dein Geld nicht.');
  pay(state, l.price);
  const prop = { id: state.nextPropId++, kind: l.kind, name: l.name, cityId: l.cityId, rooms: l.rooms, base: l.base, condition: l.condition, closedUntil: 0, bought: state.day, rest: l.rest };
  state.properties.push(prop);
  award(state, 'buy_property');
  chronicle(state, `${state.person.first} kauft: ${l.name} (${world.city(l.cityId).name}).`, 'property');
  press.story(world, state, 'property_buy', { prop: l.name, cityId: l.cityId });
  return { msg: `Gekauft: ${l.name}.` };
};

A.moveIn = ({ state, input }) => {
  const p = state.properties.find((x) => x.id === Number(input.propertyId));
  if (!p) fail('Immobilie nicht gefunden.');
  if (p.lease && p.lease.on && p.lease.tenant) fail('Die Immobilie ist vermietet. Beende zuerst die Vermietung.');
  if (p.lease) p.lease.on = false;
  if (p.cityId !== state.cityId) fail('Diese Immobilie steht in einer anderen Stadt.');
  state.housing = { type: 'own', cityId: p.cityId, propertyId: p.id };
  return { msg: `Du ziehst in ${p.name} ein.` };
};

A.sell = ({ world, state, input }) => {
  const p = state.properties.find((x) => x.id === Number(input.propertyId));
  if (!p) fail('Immobilie nicht gefunden.');
  const v = Math.round(propertyValue(world, state, p, yr(state)) * 0.97);
  state.money += v;
  state.properties = state.properties.filter((x) => x.id !== p.id);
  if (state.housing.type === 'own' && state.housing.propertyId === p.id) state.housing = { type: 'street', cityId: state.cityId };
  return { msg: `${p.name} verkauft.` };
};

/* ---------------- Vermieten ---------------- */
const landlord = require('./landlord');
const propOf = (state, input) => { const p = state.properties.find((x) => x.id === Number(input.propertyId)); if (!p) fail('Immobilie nicht gefunden.'); return p; };
A.letOn = ({ state, input }) => {
  const p = propOf(state, input);
  if (landlord.isResidence(state, p)) fail('Die Immobilie bewohnst du selbst. Ziehe zuerst aus, um sie zu vermieten.');
  const mult = landlord.clamp(Number(input.mult) || 1, landlord.MIN_MULT, landlord.MAX_MULT);
  p.lease = { on: true, mult, tenant: null, vacantSince: state.day, total: (p.lease && p.lease.total) || 0 };
  return { msg: `${p.name} wird vermietet. Mieter melden sich, sobald Preis und Zustand passen.` };
};
A.letOff = ({ state, input }) => {
  const p = propOf(state, input);
  if (!p.lease || !p.lease.on) fail('Die Immobilie ist nicht vermietet.');
  p.lease.on = false; p.lease.tenant = null;
  return { msg: `Vermietung von ${p.name} beendet.` };
};
A.letPrice = ({ state, input }) => {
  const p = propOf(state, input);
  if (!p.lease || !p.lease.on) fail('Die Immobilie ist nicht vermietet.');
  p.lease.mult = landlord.clamp(Number(input.mult) || 1, landlord.MIN_MULT, landlord.MAX_MULT);
  return { msg: `Neuer Mietpreis: ${Math.round(p.lease.mult * 100)} % der Marktmiete.` };
};

A.maintain = ({ world, state, input }) => {
  const p = state.properties.find((x) => x.id === Number(input.propertyId));
  if (!p) fail('Immobilie nicht gefunden.');
  const v = propertyValue(world, state, p, yr(state));
  const cost = Math.round(v * ((100 - p.condition) / 100) * 0.08);
  if (cost <= 0) fail('Die Immobilie ist in bestem Zustand.');
  if (state.money < cost) fail('Dir fehlt das Geld für die Instandhaltung.');
  pay(state, cost);
  p.condition = 100;
  return { msg: `${p.name} wurde instand gesetzt.` };
};

A.autoMaintain = ({ state, input }) => { state.flags.autoMaintain = !!input.on; return { msg: input.on ? 'Automatische Instandhaltung an.' : 'Automatische Instandhaltung aus.' }; };

/* ---------------- Haushalt ---------------- */
A.buyFood = ({ world, state, input }) => {
  const tier = Math.floor(Number(input.tier));
  if (!(tier >= 0 && tier <= 3)) fail('Unbekannte Qualitätsstufe.');
  const pct = clamp(100 - state.meters.fridge, 0, 100);
  if (pct < 5) fail('Der Kühlschrank ist schon voll.');
  const cost = Math.round(world.econ.food[tier].perPct * pct * world.idx(yr(state)) * cityFactor(world, state));
  if (state.money < cost) fail('Dafür reicht dein Geld nicht.');
  pay(state, cost);
  const m = state.meters;
  m.fridgeQ = (m.fridge * m.fridgeQ + pct * (tier + 1)) / 100;
  m.fridge = 100;
  state.hunger = 0;
  state.flags.foodTier = tier;
  return { msg: `Kühlschrank aufgefüllt (${world.econ.food[tier].name}).` };
};

A.buyCards = ({ world, state, input, user }) => {
  const year = yr(state);
  if (year < 1960) fail('Gesundheitskarten gibt es erst ab ca. 1960.');
  const n = clamp(Math.floor(Number(input.count) || 1), 1, 20);
  if (input.pay === 'coins') {
    const price = n * 2;
    if (user.coins + state.fx.coins < price) fail('Nicht genug Coins.');
    state.fx.coins -= price;
  } else {
    const cost = scale(4000, world.idx(year)) * n;
    if (state.money < cost) fail('Dafür reicht dein Geld nicht.');
    pay(state, cost);
  }
  state.cards.health += n;
  return { msg: `${n} Gesundheitskarte(n) erhalten.` };
};

A.useCard = ({ state }) => {
  if (yr(state) < 1960) fail('Gesundheitskarten gibt es erst ab ca. 1960.');
  if (state.cards.health < 1) fail('Du hast keine Gesundheitskarte.');
  state.cards.health--;
  state.life.extraDays += 10;
  state.life.cardsUsed++;
  state.meters.health = clamp(state.meters.health + 15, 0, 100);
  return { msg: 'Gesundheitskarte eingesetzt: +10 Lebenstage, +15 Gesundheit.' };
};

A.insurance = ({ world, state, input }) => {
  const key = String(input.key);
  if (!world.econ.insurance[key]) fail('Unbekannte Versicherung.');
  const on = !!input.on;
  if (on && !state.insurance[key]) award(state, 'insurance');
  state.insurance[key] = on;
  return { msg: on ? `${world.econ.insurance[key].name} abgeschlossen.` : `${world.econ.insurance[key].name} gekündigt.` };
};

A.butler = ({ world, state, input }) => {
  if (!input.on) { state.butler = null; return { msg: 'Butler entlassen.' }; }
  const res = residenceProperty(state);
  if (!res || res.rooms < 8) fail('Einen Butler stellst du erst ein, wenn du ein großes Haus oder eine Villa bewohnst.');
  state.butler = { perDay: 600, since: state.day };
  return { msg: 'Butler eingestellt: Er füllt den Kühlschrank automatisch.' };
};

A.tutorial = ({ state, input }) => { state.flags.tutorial = !!input.on; return { msg: 'ok' }; };

/* ---------------- Umzug ---------------- */
A.move = ({ world, state, input, user }) => {
  const cityId = Number(input.cityId);
  if (cityId === state.cityId) fail('Du wohnst bereits dort.');
  const q = moveQuote(world, state, cityId);
  if (state.money < q.money) fail('Dir fehlt das Geld für den Umzug.');
  if (user.coins + state.fx.coins < q.coins) fail('Dir fehlen Coins für den Umzug. Sieh Werbung an, um den Preis zu senken, oder sammle Coins.');
  pay(state, q.money);
  state.fx.coins -= q.coins;
  delete state.discounts[`move:${cityId}`];
  state.cityId = cityId;
  if (state.occupation && state.occupation.kind !== 'study') state.occupation = null;
  const own = state.properties.filter((p) => p.cityId === cityId).sort((a, b) => b.rooms - a.rooms)[0];
  state.housing = own ? { type: 'own', cityId, propertyId: own.id } : { type: 'street', cityId };
  award(state, 'move');
  const c = world.city(cityId);
  chronicle(state, `${state.person.first} zieht nach ${c.name}.`, 'move');
  press.story(world, state, 'move', { cityId });
  if (!own) notice(state, { level: 'warn', title: `Neu in ${c.name}`, text: 'Du hast noch keine Unterkunft. Schau in die Zeitung.', tab: 'newspaper', info: ['Nach einem Umzug beginnst du ohne Wohnung und Arbeit.', 'Auf der Straße sinkt die Gesundheit schnell.', 'Suche sofort Unterkunft und Arbeit.'] });
  return { msg: q.free ? `Willkommen zurück in ${c.name}!` : `Umgezogen nach ${c.name}.` };
};

/* ---------------- Karte: EFS einsammeln ---------------- */
const PICKUP_LABELS = ['Ein glücklicher Fund', 'Ein heißer Tipp', 'Hilfe auf dem Markt', 'Ein Gespräch mit Nachbarn', 'Gelegenheitsjob', 'Neuigkeiten gehört'];
function pickups(world, nowMs) {
  const slot = Math.floor(nowMs / 3600000);
  const out = [];
  // Städte (Größe ≥ 2) mit je 22 % Chance, dazu eine kleine Auswahl an Dörfern – insgesamt etwa 15–25 Funde pro Stunde
  const towns = world.cityList.filter((c) => c.size_tier >= 2);
  const villages = world.cityList.filter((c) => c.size_tier < 2);
  const picks = towns.slice();
  const vr = rngFor('pickv', slot);
  for (let i = 0; i < 6 && villages.length; i++) picks.push(villages[Math.floor(vr() * villages.length)]);
  for (const c of picks) {
    const r = rngFor('pick', c.id, slot);
    if (r() < (c.size_tier >= 2 ? 0.1 : 1)) {
      const amount = weighted(r, [{ v: 10, w: 60 }, { v: 20, w: 30 }, { v: 40, w: 10 }]).v;
      out.push({ key: `${c.id}:${slot}`, cityId: c.id, amount, label: PICKUP_LABELS[Math.floor(r() * PICKUP_LABELS.length)] });
    }
  }
  return out;
}
const berlinDay = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(ms));

A.collect = ({ world, state, input, user, now }) => {
  const list = pickups(world, now);
  const p = list.find((x) => x.key === input.key);
  if (!p) fail('Das ist nicht mehr da.');
  if (state.collected[p.key]) fail('Schon eingesammelt.');
  const today = berlinDay(now);
  const am = user.meta.activeEfs && user.meta.activeEfs.date === today ? user.meta.activeEfs : { date: today, amount: 0 };
  const cap = settings.get('efs.active_daily_cap');
  if (am.amount >= cap) fail('Für heute hast du alle Sammel-EFS gefunden. Morgen gibt es neue.');
  const gain = Math.min(p.amount, cap - am.amount);
  am.amount += gain;
  user.meta.activeEfs = am;
  state.fx.efs += gain;
  state.collected[p.key] = 1;
  const slot = Math.floor(now / 3600000);
  for (const k of Object.keys(state.collected)) if (Number(k.split(':')[1]) < slot - 2) delete state.collected[k];
  return { msg: `+${gain} EFS`, efs: gain, dirtyUser: true };
};

/* ---------------- Partner ---------------- */
A.meet = ({ world, state, input }) => {
  if (state.partner) fail('Du hast bereits einen Partner.');
  const l = resolveListing(world, state, input.listingId);
  if (!l || l.type !== 'partner') fail('Diese Anzeige ist nicht mehr aktuell.');
  if (l.cityId !== state.cityId) fail('Die Person wohnt in einer anderen Stadt.');
  const cost = scale(world.econ.giftCost, world.idx(yr(state)));
  if (state.money < cost) fail('Für ein erstes Treffen fehlt dir das Geld.');
  pay(state, cost);
  state.pending.met = state.pending.met || {};
  if (state.pending.met[l.id]) fail('Ihr habt euch bereits getroffen.');
  state.pending.met[l.id] = 1;
  const r = rngFor('meet', state.seed, l.id);
  const m = state.meters;
  const p = 0.35 + (m.wellbeing - 50) / 200 + (state.money > scale(5000, world.idx(yr(state))) ? 0.1 : 0) + (state.occupation ? 0.1 : -0.05) + (state.housing.type === 'street' ? -0.2 : 0.05);
  if (!chance(r, clamp(p, 0.1, 0.85))) {
    return { msg: `${l.name} hat kein Interesse – vielleicht klappt es mit jemand anderem.`, level: 'warn' };
  }
  const born = state.day - l.age * 365 - Math.floor(r() * 300);
  const person = addPerson(state, { name: l.name, gender: l.gender, born, role: 'partner', jobs: [l.profession], parents: [] });
  state.partner = { personId: person.id, name: l.name, gender: l.gender, born, pkey: l.pkey, profession: l.profession, sat: 65, married: false, cohabit: false, giftBoost: 0, unhappyDays: 0, since: state.day };
  const me = state.tree.persons.find((x) => x.id === state.person.id);
  if (me) me.partnerId = person.id;
  award(state, 'partner');
  chronicle(state, `${state.person.first} lernt ${l.name} kennen.`, 'family');
  press.story(world, state, 'couple', { partner: l.name });
  return { msg: `Ihr seid jetzt ein Paar: ${l.name}.`, level: 'good' };
};

A.marry = ({ world, state }) => {
  const p = state.partner;
  if (!p) fail('Du hast keinen Partner.');
  if (p.linked) fail('Mit einem Spieler heiratest du über „Spieler → Beziehung“.');
  if (p.married) fail('Ihr seid bereits verheiratet.');
  const cost = scale(world.econ.marriageCost, world.idx(yr(state)));
  if (state.money < cost) fail('Die Hochzeit können wir uns noch nicht leisten.');
  pay(state, cost);
  p.married = true; p.sat = clamp(p.sat + 15, 0, 100);
  award(state, 'partner');
  chronicle(state, `${state.person.first} heiratet ${p.name}.`, 'family');
  press.story(world, state, 'marriage', { partner: p.name });
  return { msg: `Ihr habt geheiratet!`, level: 'good' };
};

A.gift = ({ world, state }) => {
  const p = state.partner;
  if (!p) fail('Du hast keinen Partner.');
  const cost = scale(world.econ.giftCost, world.idx(yr(state)));
  if (state.money < cost) fail('Für ein Geschenk fehlt das Geld.');
  pay(state, cost);
  p.sat = clamp(p.sat + 22, 0, 100); p.giftBoost = (p.giftBoost || 0) + 12;
  return { msg: `${p.name} freut sich sehr.` };
};

A.together = ({ state }) => {
  const p = state.partner;
  if (!p) fail('Du hast keinen Partner.');
  if (state.day - (p.lastTogether || -99) < 5) fail('Ihr habt gerade erst Zeit miteinander verbracht.');
  p.lastTogether = state.day;
  p.sat = clamp(p.sat + 12, 0, 100);
  state.meters.wellbeing = clamp(state.meters.wellbeing + 3, 0, 100);
  state.meters.rest = clamp(state.meters.rest - 5, 0, 100);
  return { msg: 'Ein schöner gemeinsamer Tag.' };
};

A.plan = ({ state, input }) => {
  const max = settings.get('game.max_children');
  const t = clamp(Math.floor(Number(input.target)), 0, max);
  state.plan.target = Number.isFinite(t) ? t : 3;
  return { msg: state.plan.target === 0 ? 'Kein weiterer Kinderwunsch.' : `Wunsch-Kinderzahl: ${state.plan.target}.` };
};

/* ---------------- Kinder ---------------- */
const child = (state, id) => { const c = state.children.find((x) => x.id === Number(id)); if (!c) fail('Kind nicht gefunden.'); return c; };

A.school = ({ world, state, input }) => {
  const c = child(state, input.childId);
  if (!c.pendingSchool) fail('Hier ist keine Entscheidung nötig.');
  if (!['haupt', 'real', 'gym'].includes(input.type)) fail('Unbekannte Schulform.');
  c.pendingSchool = false; c.school = input.type;
  return { msg: `${c.name} besucht jetzt die ${SCHOOLS[input.type].name}.` };
};

A.path = ({ world, state, input }) => {
  const c = child(state, input.childId);
  if (!c.pendingPath) fail('Hier ist keine Entscheidung nötig.');
  if (input.kind === 'none') { c.pendingPath = false; c.path = 'none'; return { msg: `${c.name} macht erst einmal nichts weiter.` }; }
  const p = world.prof(input.pkey);
  if (!p) fail('Beruf nicht gefunden.');
  if (input.kind === 'study') {
    if (!p.academic) fail('Das ist kein Studium.');
    if (c.schoolDone !== 'gym') fail('Ein Studium setzt das Gymnasium voraus.');
    c.pendingPath = false; c.path = 'study'; c.pkey = p.pkey; c.daysLeft = p.training_days;
    return { msg: `${c.name} beginnt das Studium: ${p.name}.` };
  }
  if (input.kind === 'training') {
    if (p.academic) fail('Das ist ein Studium.');
    if (!world.activeProfessions(yr(state)).includes(p)) fail('Diesen Beruf gibt es gerade nicht.');
    c.pendingPath = false; c.path = 'training'; c.pkey = p.pkey; c.daysLeft = p.training_days || 365;
    return { msg: `${c.name} beginnt eine Ausbildung zum ${p.name}.` };
  }
  fail('Unbekannter Weg.');
};

A.giftChild = ({ world, state, input }) => {
  const c = child(state, input.childId);
  const cost = scale(world.econ.giftCost, world.idx(yr(state)));
  if (state.money < cost) fail('Für ein Geschenk fehlt das Geld.');
  pay(state, cost);
  c.sat = clamp(c.sat + 22, 0, 100); c.giftBoost = (c.giftBoost || 0) + 12;
  return { msg: `${c.name} freut sich.` };
};

A.search = ({ world, state, input }) => {
  const c = child(state, input.childId);
  if (c.status !== 'runaway') fail('Dein Kind ist nicht weggelaufen.');
  const cost = scale(world.econ.giftCost * 3, world.idx(yr(state)));
  if (state.money < cost) fail('Für die Suche fehlt das Geld.');
  pay(state, cost);
  c.searches = (c.searches || 0) + 1;
  const r = rngFor('search', state.seed, c.id, c.searches);
  if (chance(r, 0.35 + Math.min(0.4, c.searches * 0.15))) {
    c.status = 'home'; c.sat = 45; c.unhappy = 0;
    chronicle(state, `${c.name} wird gefunden und kommt nach Hause.`, 'family');
    press.story(world, state, 'child_found', { child: c.name.split(' ')[0] });
    return { msg: `${c.name} ist wieder da!`, level: 'good' };
  }
  return { msg: 'Keine Spur. Versuche es noch einmal.', level: 'warn' };
};

/* ---------------- Unternehmen ---------------- */
const company = (state, id) => { const c = (state.companies || []).find((x) => x.id === Number(id)); if (!c) fail('Unternehmen nicht gefunden.'); return c; };
const needActive = (c) => { if (c.abandoned) fail('Der Betrieb steht leer. Reaktiviere ihn zuerst.'); };

A.buyBiz = ({ world, state, input }) => {
  const l = resolveListing(world, state, input.listingId);
  if (!l || l.type !== 'biz') fail('Dieses Angebot ist nicht mehr aktuell.');
  if (l.cityId !== state.cityId) fail('Du musst in dieser Stadt wohnen.');
  if ((state.companies || []).length >= world.econ.companies.maxCompanies) fail('Du besitzt bereits die maximale Anzahl an Unternehmen.');
  if (!biz.qualification(world, state, l.pkey, l.tier).ok) fail('Dir fehlt die Qualifikation für diesen Betrieb.');
  if (state.money < l.price) fail('Dafür reicht dein Geld nicht.');
  pay(state, l.price);
  const c = { id: state.nextCompanyId++, pkey: l.pkey, tier: l.tier, name: l.name, cityId: l.cityId, rooms: l.rooms, staff: 0, manager: false, cash: 0, base: l.base, since: state.day, abandoned: null, lastProfit: 0 };
  state.companies.push(c);
  award(state, 'buy_property');
  chronicle(state, `${state.person.first} übernimmt ${l.name} (${world.city(l.cityId).name}).`, 'business');
  press.story(world, state, 'business_open', { firm: l.name, cityId: l.cityId });
  return { msg: `${l.name} gehört dir. Arbeite selbst im Betrieb oder stelle Mitarbeiter ein.` };
};
A.bizWork = ({ world, state, input }) => {
  const c = company(state, input.id); needActive(c);
  if (c.cityId !== state.cityId) fail('Du musst vor Ort wohnen, um selbst zu arbeiten.');
  state.occupation = { kind: 'work', pkey: c.pkey, employer: c.name, cityId: c.cityId, factor: 1, lodging: false, since: state.day, ownCompanyId: c.id, daysLeft: 0 };
  if (state.housing.type === 'workplace') state.housing = { type: 'street', cityId: state.cityId };
  return { msg: `Du arbeitest jetzt selbst in ${c.name}.` };
};
A.bizHire = ({ world, state, input }) => {
  const c = company(state, input.id); needActive(c);
  const need = biz.staffNeeded(world, c);
  const n = Math.floor(Number(input.delta)) || 0;
  if (n > 0 && c.staff >= need + 2) fail('Mehr Mitarbeiter braucht der Betrieb nicht.');
  c.staff = Math.max(0, c.staff + Math.sign(n));
  return { msg: n > 0 ? 'Mitarbeiter eingestellt.' : 'Mitarbeiter entlassen.' };
};
A.bizManager = ({ state, input }) => {
  const c = company(state, input.id); needActive(c);
  c.manager = !!input.on;
  if (!c.manager && state.occupation && state.occupation.ownCompanyId !== c.id) { /* nichts */ }
  return { msg: c.manager ? 'Ein Manager führt den Betrieb jetzt selbstständig.' : 'Manager entlassen.' };
};
A.bizExpand = ({ world, state, input, user }) => {
  const c = company(state, input.id); needActive(c);
  const t = biz.tiersOf(world)[c.tier];
  if (c.rooms >= t.maxRooms) fail('Auf dieser Stufe sind alle Räume freigeschaltet. Baue den Betrieb aus (Stufe erhöhen).');
  const idx = world.idx(yr(state));
  const city = world.city(c.cityId);
  const cost = Math.round(t.roomPrice * idx * (city ? city.price_factor : 1));
  const key = `room:${c.id}`;
  const coins = ladder(t.roomCoins, state.discounts[key] || 0);
  if (state.money < cost) fail('Dafür reicht dein Geld nicht.');
  if (user.coins + state.fx.coins < coins) fail('Dir fehlen Coins. Sieh Werbung an, um den Preis zu senken.');
  pay(state, cost); state.fx.coins -= coins; delete state.discounts[key];
  c.rooms++; c.base += Math.round(cost / idx * 0.8);
  award(state, 'buy_property');
  return { msg: `Neuer Raum freigeschaltet (${c.rooms} / ${t.maxRooms}).` };
};
A.bizUpgrade = ({ world, state, input }) => {
  const c = company(state, input.id); needActive(c);
  const tiers = biz.tiersOf(world);
  if (c.tier >= tiers.length - 1) fail('Das ist bereits die höchste Stufe.');
  const nt = tiers[c.tier + 1];
  if (!biz.qualification(world, state, c.pkey, c.tier + 1).ok) fail('Dir fehlt die Qualifikation für die nächste Stufe (höhere Berufsstufe nötig).');
  const idx = world.idx(yr(state)); const city = world.city(c.cityId);
  const cost = Math.max(0, Math.round((nt.price - tiers[c.tier].price) * idx * (city ? city.price_factor : 1)));
  if (state.money < cost) fail('Dafür reicht dein Geld nicht.');
  pay(state, cost);
  c.tier++; c.rooms = Math.max(c.rooms, nt.rooms); c.base += Math.round(cost / idx);
  const old = c.name; c.name = c.name.replace(/^\S+/, biz.chainNames(world, c.pkey)[c.tier].split(' ')[0]);
  award(state, 'buy_property');
  chronicle(state, `${old} wird zu ${c.name} ausgebaut.`, 'business');
  press.story(world, state, 'business_expand', { firm: c.name, from: old, cityId: c.cityId });
  return { msg: `Ausbau abgeschlossen: ${biz.tierName(world, c)}.` };
};
A.bizCollect = ({ state, input }) => {
  const list = input.id === 'all' ? state.companies : [company(state, input.id)];
  let sum = 0;
  for (const c of list) { sum += c.cash; c.cash = 0; }
  if (sum <= 0) fail('Es liegt kein Geld in der Firmenkasse.');
  state.money += sum; state.stats.earned += sum;
  return { msg: 'Gewinn abgeholt.' };
};
A.bizSell = ({ world, state, input }) => {
  const c = company(state, input.id);
  const v = biz.companyValue(world, state, c, yr(state)) + c.cash;
  const got = Math.round(v * (c.abandoned ? 1 : 0.9));
  state.money += got;
  state.companies = state.companies.filter((x) => x.id !== c.id);
  if (state.occupation && state.occupation.ownCompanyId === c.id) state.occupation = null;
  return { msg: `${c.name} verkauft.` };
};
A.bizReactivate = ({ world, state, input }) => {
  const c = company(state, input.id);
  if (!c.abandoned) fail('Der Betrieb ist aktiv.');
  if (!biz.qualification(world, state, c.pkey, c.tier).ok) fail('Dir fehlt noch die Qualifikation.');
  const idx = world.idx(yr(state));
  const cost = Math.round(c.base * idx * (world.econ.companies.reactivatePct / 100));
  if (state.money < cost) fail('Dafür reicht dein Geld nicht.');
  pay(state, cost); c.abandoned = null;
  chronicle(state, `${c.name} wird wiederbelebt.`, 'business');
  press.story(world, state, 'business_revive', { firm: c.name, cityId: c.cityId });
  return { msg: `${c.name} ist wieder in Betrieb.` };
};

require('./society').install(A, fail, { yr, pay });
require('./places').install(A, fail, { yr, pay, settings });

/* ---------------- Meldungen ---------------- */
A.readNotices = ({ state, input }) => {
  const ids = Array.isArray(input.ids) ? input.ids.map(Number) : null;
  for (const n of state.notices) if (!ids || ids.includes(n.id)) n.seen = true;
  return { msg: '' };
};

function run(name, ctx) {
  const fn = A[name];
  if (!fn) fail('Unbekannte Aktion.');
  return fn(ctx) || {};
}

module.exports = { run, ActionError, moveQuote, ladder, pickups, berlinDay, ACTIONS: Object.keys(A) };
