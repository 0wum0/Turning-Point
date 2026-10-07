'use strict';
const settings = require('../settings');
const press = require('./press');
const { rngFor, int, chance, shuffle } = require('./rng');
const { notice, chronicle, award, clamp, kidsAtHome, minors, roomsAvailable, roomsNeeded, effectiveHousing, foodMods, learn, propertyValue, netWorth } = require('./core');
const { randomFirstName } = require('./content');
const { addPerson } = require('./state');
const { yearOf } = require('./calendar');
const bizMod = require('./business');
const { SCHOOLS } = require('./content');

const ageOfChild = (state, c) => Math.floor((state.day - c.born) / 365);
const partnerAge = (state) => Math.floor((state.day - state.partner.born) / 365);

/** Tägliche Familiendynamik: Partner, Kinder, Schule, Geburten. */
function familyDaily(ctx, flows) {
  const { world, state } = ctx;
  const year = yearOf(state.day, state.startYear);
  const runway = flows.expense > 0 ? state.money / flows.expense : 99;
  const h = effectiveHousing(state);
  const fm = foodMods(world, state);
  const hunger = state.hunger > 0;

  if (state.partner) partnerDaily(ctx, { runway, h, fm, hunger, year });
  childrenDaily(ctx, { runway, h, fm, hunger, year });
}

function partnerDaily(ctx, env) {
  const { world, state } = ctx;
  const p = state.partner;
  const rooms = roomsAvailable(state);
  const shouldLive = rooms >= 2 && state.housing.type !== 'street';
  if (shouldLive !== p.cohabit) {
    p.cohabit = shouldLive;
    notice(state, shouldLive
      ? { level: 'good', title: `${p.name} zieht bei dir ein`, text: 'Mit mehr als einem Zimmer könnt ihr zusammenleben.', info: ['Dein Partner lebt jetzt bei dir.', 'Das hebt Wohlbefinden und Erholung, verbraucht aber auch mehr Lebensmittel.', 'Halte den Kühlschrank gefüllt.'] }
      : { level: 'warn', title: `${p.name} zieht aus`, text: 'Ohne passende Wohnung könnt ihr nicht zusammenleben.', info: ['Dein Partner hat keinen gemeinsamen Wohnraum mehr.', 'Das belastet die Partnerschaft.', 'Miete oder kaufe eine Wohnung mit mindestens zwei Zimmern.'] });
  }
  const short = state.children.length && roomsAvailable(state) < roomsNeeded(state);
  let target = 50 + 0.3 * (state.meters.wellbeing - 50) + env.fm.wellbeing * 1.5 + env.h.comfort * 0.8
    + (short ? -12 : 0) + (env.runway > 20 ? 5 : env.runway < 5 ? -10 : 0) + (p.married ? 4 : 0) + (p.giftBoost || 0)
    + (p.cohabit ? 0 : -14) + (env.hunger ? -20 : 0);
  target = clamp(target, 0, 100);
  p.sat = clamp(p.sat + (target - p.sat) * 0.12, 0, 100);
  p.giftBoost = Math.max(0, (p.giftBoost || 0) - 1.5);
  if (p.sat < 12) p.unhappyDays = (p.unhappyDays || 0) + 1; else if (p.sat > 25) p.unhappyDays = 0;
  if (p.sat < 45 && state.day - (p.lastWarn || -99) >= 7) {
    p.lastWarn = state.day;
    notice(state, {
      level: 'warn', title: `${p.name} ist unzufrieden`, tab: 'family', interrupt: !p.warnedOnce,
      text: 'Die Zufriedenheit deines Partners sinkt. Ein Geschenk, gemeinsame Zeit oder bessere Lebensumstände helfen.',
      info: ['Dein Partner ist unzufrieden.', 'Bleibt die Unzufriedenheit dauerhaft sehr hoch, trennt sich dein Partner – und nimmt die Hälfte deines Vermögens und der Kinder mit.', 'Schenke etwas, verbringe Zeit miteinander, verbessere Essen und Wohnung.'],
    });
    p.warnedOnce = true;
  }
  if ((p.unhappyDays || 0) >= 25) return separate(ctx);

  // Kinderwunsch
  const kids = state.children.length;
  if (p.cohabit && kids < Math.min(state.plan.target == null ? 3 : state.plan.target, settings.get('game.max_children')) && partnerAge(state) >= 18 && partnerAge(state) <= 42 && !env.hunger) {
    const r = rngFor('birth', state.seed, state.day);
    if (chance(r, 1 / 520)) bornChild(ctx, r);
  }
}

function bornChild(ctx, r) {
  const { world, state } = ctx;
  const gender = r() < 0.5 ? 'm' : 'f';
  const year = yearOf(state.day, state.startYear);
  const first = randomFirstName(r, year, gender);
  const id = state.nextChildId++;
  const city = world.city(state.cityId);
  const person = addPerson(state, {
    name: `${first} ${state.person.last}`, gender, born: state.day, bornCity: state.cityId, role: 'child',
    parents: [state.person.id, state.partner ? state.partner.personId : null].filter(Boolean),
  });
  const child = {
    id, personId: person.id, name: first, gender, born: state.day, cityId: state.cityId, status: 'home', sat: 75, school: null,
    pendingSchool: false, path: null, pendingPath: false, pkey: null, daysLeft: 0, giftBoost: 0, unhappy: 0, coinsGranted: true,
  };
  state.children.push(child);
  const coins = settings.get('coins.per_child');
  state.fx.coins += coins;
  award(state, 'child');
  chronicle(state, `${first} wird in ${city ? city.name : 'Deutschland'} geboren.`, 'birth');
  press.story(ctx.world, state, 'birth', { child: first });
  notice(state, {
    level: 'good', title: `Ein Kind ist geboren: ${first}`, tab: 'family', interrupt: true,
    text: `${first} ist in ${city ? city.name : 'deiner Stadt'} zur Welt gekommen – du erhältst einmalig ${coins} Coins.`,
    info: ['Dein Kind ist geboren und wird in deiner aktuellen Wohnstadt „Heimatstädter“.', 'Kinder kosten Geld (Lebensmittel, Wohnraum, Schule), bringen aber Kindergeld, Coins und später die Erben deiner Familie.', 'Sorge für genug Zimmer (eins pro Kind), gefüllten Kühlschrank und kleine Aufmerksamkeiten.'],
  });
}

function childrenDaily(ctx, env) {
  const { world, state } = ctx;
  const short = roomsAvailable(state) < roomsNeeded(state);
  for (const c of state.children) {
    if (c.status === 'runaway') { runawayDaily(ctx, c); continue; }
    if (c.status !== 'home') continue;
    const age = ageOfChild(state, c);
    // Stimmung
    let target = 55 + env.fm.wellbeing * 1.2 + env.h.comfort * 0.5 + (c.giftBoost || 0) + (short ? -15 : 0) + (env.hunger ? -30 : 0)
      + (state.housing.type === 'street' ? -25 : 0) + (env.runway < 3 ? -8 : 0);
    c.sat = clamp(c.sat + (clamp(target, 0, 100) - c.sat) * 0.1, 0, 100);
    c.giftBoost = Math.max(0, (c.giftBoost || 0) - 1.5);
    if (c.sat < 40 && state.day - (c.lastWarn || -99) >= 9) {
      c.lastWarn = state.day;
      notice(state, {
        level: 'warn', title: `${c.name} ist unzufrieden`, tab: 'family',
        text: 'Ein Geschenk, mehr Platz oder besseres Essen würden helfen.',
        info: [`${c.name} fühlt sich vernachlässigt.`, 'Dauerhafte Unzufriedenheit kann dazu führen, dass ein Kind wegläuft.', 'Schenke etwas, sorge für ein eigenes Zimmer und gefüllten Kühlschrank.'],
      });
    }
    if (c.sat < 15 && age >= 8) c.unhappy++; else if (c.sat > 30) c.unhappy = 0;
    if (c.unhappy >= 20) { runaway(ctx, c); continue; }

    // Schule
    if (age >= 6 && !c.school && !c.path && !c.pendingSchool && !c.schoolDone) { c.school = 'grund'; }
    if (c.school === 'grund' && age >= 10) { c.school = null; c.pendingSchool = true; c.pendingSince = state.day; notice(state, { level: 'info', title: `${c.name}: weiterführende Schule`, tab: 'family', interrupt: true, text: 'Die Grundschule ist zu Ende. Welche Schule soll es werden?', info: ['Die Grundschulzeit ist vorbei.', 'Hauptschule, Realschule oder Gymnasium bestimmen die Möglichkeiten danach – das Gymnasium ermöglicht ein Studium, kostet aber mehr.', 'Wähle unter „Familie“ eine Schulform.'] }); }
    if (c.pendingSchool && state.day - c.pendingSince > 60) { c.pendingSchool = false; c.school = 'haupt'; notice(state, { level: 'info', title: `${c.name} besucht die Hauptschule`, text: 'Da keine Entscheidung fiel, wurde die Hauptschule gewählt.', tab: 'family' }); }
    if (['haupt', 'real', 'gym'].includes(c.school) && age >= SCHOOLS[c.school].to) {
      c.schoolDone = c.school; c.school = null; c.pendingPath = true; c.pendingSince = state.day;
      notice(state, { level: 'info', title: `${c.name}: Schulabschluss`, tab: 'family', interrupt: true, text: 'Wie soll es weitergehen – Ausbildung, Studium oder erst einmal nichts?', info: ['Dein Kind hat die Schule beendet.', 'Eine Ausbildung kostet kein Geld, ein Studium schon. Ohne Ausbildung kann es später kaum Betriebe weiterführen.', 'Wähle unter „Familie“ den Weg deines Kindes.'] });
    }
    if (c.pendingPath && state.day - c.pendingSince > 90) { c.pendingPath = false; c.path = 'none'; }
    // Ausbildung/Studium
    if ((c.path === 'training' || c.path === 'study') && c.daysLeft > 0) {
      c.daysLeft--;
      if (c.path === 'study') {
        const p = world.prof(c.pkey);
        const cost = p ? Math.round(p.tuition_day * ctx.idx) : 0;
        state.money -= cost; state.stats.spent += cost;
      }
      if (c.daysLeft === 0) {
        learn(state, c.pkey);
        const prof = world.prof(c.pkey);
        const pr = state.tree.persons.find((x) => x.id === c.personId);
        if (pr && prof) pr.jobs.push(prof.name);
        const wasStudy = c.path === 'study';
        c.path = 'done';
        notice(state, { level: 'good', title: `${c.name} hat ${wasStudy ? 'das Studium' : 'die Ausbildung'} abgeschlossen`, text: prof ? `${c.name} ist jetzt ${prof.name}.` : '', tab: 'family' });
        chronicle(state, `${c.name} schließt eine Ausbildung zum ${prof ? prof.name : 'Beruf'} ab.`, 'education');
        press.story(ctx.world, state, 'child_edu', { child: c.name.split(' ')[0], job: prof ? prof.name : 'Beruf' });
      }
    }
  }
  // Kinder-Skill geht ins Haushalts-Skill nur für Erben – daher pro Kind speichern:
  for (const c of state.children) {
    if (c.path === 'done' && c.pkey && !c.skills) c.skills = [c.pkey];
  }
}

function runaway(ctx, c) {
  const { state } = ctx;
  c.status = 'runaway';
  c.runawayDay = state.day;
  c.searchDeadline = state.day + 20;
  notice(state, {
    level: 'bad', title: `${c.name} ist weggelaufen`, tab: 'family', interrupt: true,
    text: 'Dein Kind ist weggelaufen. Du kannst in der Zeitung und im Netz nach Hinweisen suchen.',
    info: ['Dein Kind fühlte sich zu lange vernachlässigt und ist weg.', 'Wird es nicht gefunden, zieht es dauerhaft in eine Jugendhilfeeinrichtung – bleibt im Stammbaum, du zahlst aber weiter hohen Unterhalt.', 'Öffne „Familie“ und starte die Suche. Danach: Geschenke, Platz und Essen verbessern.'],
  });
  chronicle(state, `${c.name} läuft von zu Hause weg.`, 'family');
  press.story(ctx.world, state, 'child_runaway', { child: c.name.split(' ')[0] });
}
function runawayDaily(ctx, c) {
  const { state } = ctx;
  if (state.day >= c.searchDeadline) {
    c.status = 'care';
    const pr = state.tree.persons.find((x) => x.id === c.personId);
    if (pr) pr.note = 'lebt in einer Jugendhilfeeinrichtung';
    notice(state, { level: 'bad', title: `${c.name} lebt jetzt in einer Jugendhilfeeinrichtung`, tab: 'family', interrupt: true, text: 'Das Kind bleibt im Stammbaum, lebt aber nicht mehr bei dir. Du zahlst weiter Unterhalt.', info: ['Die Suche war erfolglos.', 'Das Kind ist nicht mehr bei dir und kann nicht erben, du zahlst Unterhalt.', 'Der Unterhalt läuft weiter, bis das Kind volljährig wird.'] });
    chronicle(state, `${c.name} zieht dauerhaft in eine Jugendhilfeeinrichtung.`, 'family');
  }
}

function separate(ctx) {
  const { world, state } = ctx;
  const p = state.partner;
  const year = yearOf(state.day, state.startYear);
  const total = netWorth(world, state);
  let owed = Math.floor(total / 2);
  const fromMoney = Math.max(0, Math.min(state.money, owed));
  state.money -= fromMoney; owed -= fromMoney;
  const lostProps = [];
  if (owed > 0) {
    const props = state.properties.slice().sort((a, b) => propertyValue(world, state, b, year) - propertyValue(world, state, a, year));
    for (const pr of props) {
      if (owed <= 0) break;
      const v = propertyValue(world, state, pr, year);
      state.properties = state.properties.filter((x) => x.id !== pr.id);
      lostProps.push(pr.name);
      owed -= v;
      if (owed < 0) { state.money += -owed; owed = 0; }
    }
  }
  if (owed > 0) {
    for (const c of state.companies.slice().sort((a, b) => bizMod.companyValue(world, state, b, year) - bizMod.companyValue(world, state, a, year))) {
      if (owed <= 0) break;
      const v = bizMod.companyValue(world, state, c, year) + c.cash;
      state.companies = state.companies.filter((x) => x.id !== c.id);
      if (state.occupation && state.occupation.ownCompanyId === c.id) state.occupation = null;
      lostProps.push(c.name); owed -= v;
      if (owed < 0) { state.money += -owed; owed = 0; }
    }
  }
  if (!state.properties.find((x) => x.id === state.housing.propertyId) && state.housing.type === 'own') state.housing = { type: 'street', cityId: state.cityId };
  const home = state.children.filter((c) => c.status === 'home');
  const take = Math.ceil(home.length / 2);
  const r = rngFor('sep', state.seed, state.day);
  const leaving = shuffle(r, home).slice(0, take);
  for (const c of leaving) { c.status = 'withPartner'; const pr = state.tree.persons.find((x) => x.id === c.personId); if (pr) pr.note = `lebt bei ${p.name}`; }
  const pr = state.tree.persons.find((x) => x.id === p.personId);
  if (pr) { pr.note = 'Trennung'; pr.status = 'away'; }
  chronicle(state, `Trennung von ${p.name}. ${leaving.length} Kind(er) ziehen mit.`, 'family');
  press.story(ctx.world, state, 'separation', { partner: p.name });
  notice(state, {
    level: 'bad', title: `${p.name} hat dich verlassen`, tab: 'family', interrupt: true,
    text: `Die Hälfte des Vermögens${lostProps.length ? ' (u. a. ' + lostProps.join(', ') + ')' : ''} und ${leaving.length} Kind(er) gehen mit. Die Trennung steht im Stammbaum.`,
    info: ['Die Zufriedenheit deines Partners war zu lange sehr niedrig.', 'Bei einer Trennung geht die Hälfte des Vermögens und die größere Hälfte der Kinder zur Partnerin bzw. zum Partner. Die Kinder, die gehen, erben nicht mehr bei dir.', 'Achte künftig früher auf Warnmeldungen – Geschenke, gemeinsame Zeit, bessere Wohnung.'],
  });
  state.partner = null;
}

/* ---------- Tod, Erbe, Generationenwechsel ---------- */

function eligibleHeirs(state) {
  return state.children.filter((c) => c.status === 'home' && ageOfChild(state, c) >= 18);
}

function endLife(ctx, reason, cause) {
  const { world, state } = ctx;
  state.death = { day: state.day, reason, cause };
  const heirs = eligibleHeirs(state);
  const pr = state.tree.persons.find((x) => x.id === state.person.id);
  if (pr) { pr.died = state.day; pr.status = 'dead'; pr.note = reason; }
  chronicle(state, `${state.person.first} ${state.person.last} stirbt (${reason}).`, 'death');
  press.story(world, state, 'death', { age: Math.floor((state.day - state.person.birthDay) / 365), reason });
  if (!heirs.length) {
    const why = state.children.length ? 'Es gibt kein volljähriges Kind, das das Erbe antreten kann.' : 'Es gibt keine Kinder, die das Erbe antreten könnten.';
    state.status = 'gameover';
    state.death.gameOver = true;
    state.death.message = `${reason}. ${why}`;
  } else {
    state.status = 'dead';
    state.death.heirIds = heirs.map((h) => h.id);
  }
  return state.status;
}

/** Pflichtanteil: jedes Kind erhält gleichen Anteil des Nachlasses. */
function estateShare(world, state) {
  const year = yearOf(state.day, state.startYear);
  const n = Math.max(1, state.children.filter((c) => c.status !== 'withPartner').length);
  const props = state.properties.map((p) => ({ key: `p:${p.id}`, id: p.id, kind: 'property', name: p.name, value: propertyValue(world, state, p, year) }))
    .concat((state.companies || []).map((c) => ({ key: `c:${c.id}`, id: c.id, kind: 'company', name: c.name, value: bizMod.companyValue(world, state, c, year) + c.cash })));
  const total = Math.max(0, state.money) + props.reduce((s, p) => s + p.value, 0);
  return { n, total, share: Math.floor(total / n), props, money: Math.max(0, state.money) };
}

module.exports = { familyDaily, endLife, eligibleHeirs, estateShare, bornChild, ageOfChild, separate };
