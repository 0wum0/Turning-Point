'use strict';
const settings = require('../settings');
const press = require('./press');
const { rngFor } = require('./rng');
const { yearOf, dateOf } = require('./calendar');
const { scale } = require('./economy');
const {
  clamp, notice, chronicle, award, learn, levelIndex, dailyFlows, effectiveHousing, foodMods, consumption,
  roomsAvailable, roomsNeeded, kidsAtHome, foodCostPerDay,
} = require('./core');
const { LEVELS, ILLNESSES } = require('./content');
const { applyTownEvents, rollPrivateEvent } = require('./events');
const { familyDaily, endLife, ageOfChild } = require('./family');
const { businessDaily } = require('./business');
const society = require('./society');

/** Lebenserwartung (Tage). Medizin wird ab ~1955 besser, gesunder Lebensstil gibt Jahre. */
function lifespanDays(state, year) {
  const era = clamp((year - 1955) / 45, 0, 1) * 10;
  const avg = state.life.healthDays ? state.life.healthSum / state.life.healthDays : 70;
  const style = clamp((avg - 60) / 10, -3, 4);
  return Math.round((state.life.baseYears + era + style) * 365 + state.life.extraDays);
}

function advance(world, state, n, { mode = 'online' } = {}) {
  const ctx = { world, state, offline: mode === 'offline' && !!settings.get('game.offline_protection') };
  state.interrupts = [];
  let done = 0;
  while (done < n && state.status === 'alive') {
    dayStep(ctx);
    done++;
    if (state.interrupts.length && !ctx.offline) break;
  }
  return { advanced: done, stopped: state.status !== 'alive' ? state.status : state.interrupts.length ? 'interrupt' : null };
}

function dayStep(ctx) {
  const { world, state } = ctx;
  state.day++;
  const year = yearOf(state.day, state.startYear);
  const date = dateOf(state.day, state.startYear);
  const idx = world.idx(year);
  ctx.year = year; ctx.idx = idx;
  const econ = world.econ;

  if (date.doy === 0) newYear(ctx, year, econ);
  if (state.status !== 'alive') return;

  // ---- Einkommen / Beschäftigung ----
  const flows = dailyFlows(world, state);
  const m = state.meters;
  const occ = state.occupation;
  if (occ) occupationDaily(ctx, flows, year);

  if (flows.inc.office) { state.money += flows.inc.office; state.stats.earned += flows.inc.office; }
  // Kindergeld
  if (flows.inc.kindergeld) { state.money += flows.inc.kindergeld; state.stats.earned += flows.inc.kindergeld; }

  // ---- Unterkunft ----
  const h = state.housing;
  if (['rent', 'pension', 'workplace'].includes(h.type) && flows.exp.lodging > 0) {
    if (state.money >= flows.exp.lodging) {
      state.money -= flows.exp.lodging; state.stats.spent += flows.exp.lodging;
    } else {
      const was = h.type;
      state.housing = { type: 'street', cityId: state.cityId };
      notice(state, {
        level: 'bad', title: 'Wohnung verloren', tab: 'housing', interrupt: true,
        text: `Du konntest die ${was === 'rent' ? 'Miete' : 'Unterkunft'} nicht mehr bezahlen und stehst auf der Straße.`,
        info: ['Dein Geld reichte nicht für die Unterkunft.', 'Auf der Straße sinken Gesundheit und Erholung sehr schnell – nach etwa drei Tagen droht der Tod.', 'Finde sofort Arbeit und einen Schlafplatz (Zeitung → Arbeit/Unterkunft).'],
      });
    }
  }
  if (h.type === 'workplace' && !(occ && occ.lodging)) {
    state.housing = { type: 'street', cityId: state.cityId };
  }

  // ---- übrige Pflichtkosten ----
  const forced = flows.exp.insurance + flows.exp.upkeep + flows.exp.children + flows.exp.support + flows.exp.butler;
  let pay = forced;
  if (ctx.offline && state.money < pay) {
    pay = Math.max(0, state.money);
    for (const k of Object.keys(state.insurance)) state.insurance[k] = false;
    state.butler = null;
  }
  state.money -= pay; state.stats.spent += pay;

  // ---- Offline-Autopilot ----
  if (ctx.offline) offlineAutopilot(ctx, flows);

  // ---- Essen & Meter ----
  const eatCost = consumption(state);
  m.fridge -= eatCost;
  if (m.fridge <= 0) {
    m.fridge = 0;
    state.hunger++;
    if (state.hunger === 1) {
      notice(state, {
        level: 'bad', title: 'Der Kühlschrank ist leer', tab: 'household', interrupt: true,
        text: 'Du hast Hunger. Das drückt Stimmung und Gesundheit.',
        info: ['Dein Kühlschrank ist leer.', 'Hunger senkt Wohlbefinden und Gesundheit jeden Tag.', 'Kaufe unter „Haushalt“ Lebensmittel – der Kühlschrank muss unabhängig von der Wohnung gefüllt werden.'],
      });
    }
  } else {
    if (state.hunger > 0) state.hunger = 0;
    if (m.fridge < 22 && state.day - (state.pending.foodWarn || -99) >= 8) {
      state.pending.foodWarn = state.day;
      notice(state, { level: 'warn', title: 'Der Kühlschrank wird leer', tab: 'household', text: 'Bald ist nichts mehr zu essen da.', info: ['Dein Vorrat geht zur Neige.', 'Ist er leer, bekommst du Hunger und verlierst Gesundheit.', 'Kaufe unter „Haushalt“ Lebensmittel.'] });
    }
  }

  const eh = effectiveHousing(state);
  const fm = foodMods(world, state);
  const occKind = occ ? occ.kind : null;
  // Erholung
  let restDelta = eh.rest;
  if (state.housing.type === 'own' && state.partner && state.partner.cohabit) restDelta += 5;
  if (occKind === 'work') restDelta -= 18; else if (occKind === 'training') restDelta -= 16; else if (occKind === 'study') restDelta -= 10;
  { const oe = society.officeEffects(world, state, year); restDelta -= oe.rest; state.mods.officeHealth = oe.health; }
  restDelta -= kidsAtHome(state).filter((c) => ageOfChild(state, c) < 18).length * 1.2;
  m.rest = clamp(m.rest + restDelta, 0, 100);
  if (m.rest === 0) state.restZero++; else state.restZero = 0;

  // Wohlbefinden
  const runway = flows.expense + foodCostPerDay(world, state, 1) > 0 ? state.money / (flows.expense + foodCostPerDay(world, state, 1)) : 99;
  let wt = 50 + (state.hunger > 0 ? -30 : fm.wellbeing) + eh.comfort
    + (occKind === 'work' ? 6 : occKind ? 3 : -8)
    + (runway > 60 ? 6 : runway > 20 ? 3 : runway < 3 ? -10 : runway < 7 ? -5 : 0)
    + (m.rest < 25 ? -12 : m.rest > 80 ? 4 : 0)
    + (state.partner ? 10 * (state.partner.sat / 100) * (state.partner.cohabit ? 1 : 0.4) : 0)
    + Math.min(6, state.children.filter((c) => c.status === 'home' && c.sat > 50).length * 1.5)
    - state.children.filter((c) => c.status === 'home' && c.sat < 30).length * 2
    + (state.mods.wellBoost || 0);
  state.mods.wellBoost = (state.mods.wellBoost || 0) * 0.86;
  m.wellbeing = clamp(m.wellbeing + (clamp(wt, 0, 100) - m.wellbeing) * 0.18, 0, 100);

  // Gesundheit
  const age = (state.day - state.person.birthDay) / 365;
  const medicine = clamp((year - 1950) / 40, 0, 1) * 14;
  const agePenalty = Math.max(0, age - 40) * 0.9;
  if (state.housing.type === 'street') {
    if (ctx.offline) m.health = Math.max(25, m.health - 4);
    else m.health -= 100 / settings.get('game.street_survival_days') + 1;
  } else {
    const ht = 55 + 0.22 * m.wellbeing + 0.12 * m.rest + fm.health + eh.health * 3 + medicine - agePenalty - (state.life.illness ? 25 : 0);
    m.health += (clamp(ht, 0, 100) - m.health) * 0.07;
  }
  if (state.hunger > 0) m.health -= ctx.offline ? 2 : 6;
  if (state.restZero > 0) m.health -= 3;
  if (state.mods.officeHealth) m.health -= state.mods.officeHealth;
  if (state.life.illness) m.health -= 1.5;
  m.health = clamp(m.health, ctx.offline ? 15 : -5, 100);
  if (ctx.offline && m.health < 15) m.health = 15;
  state.life.healthSum += Math.max(0, m.health); state.life.healthDays++;

  if (m.health < 30 && state.day - (state.pending.healthWarn || -99) >= 6 && m.health > 0) {
    state.pending.healthWarn = state.day;
    notice(state, { level: 'bad', title: 'Deine Gesundheit ist kritisch', tab: 'household', interrupt: true, text: 'Du bist stark geschwächt.', info: ['Deine Gesundheit ist sehr niedrig.', 'Fällt sie auf null, stirbst du.', 'Iss gut, schlafe in einer richtigen Unterkunft, nimm bei Bedarf Gesundheitskarten (ab 1960).'] });
  }

  // Wartung der Immobilien
  for (const p of state.properties) {
    if (state.flags.autoMaintain) p.condition = Math.min(100, p.condition + 0.02);
    else p.condition = Math.max(5, p.condition - 6 / 365);
  }

  require('./landlord').landlordDaily(ctx);
  require('./credit').creditDaily(ctx);

  // Familie, Ereignisse
  familyDaily(ctx, flows);
  businessDaily(ctx);
  society.politicsDaily(ctx);
  applyTownEvents(ctx);
  rollPrivateEvent(ctx, flows);

  // Rechnungs-Warnung
  if (!ctx.offline && flows.expense > 0 && state.money > 0 && state.money < flows.expense * 3 && state.day - (state.pending.moneyWarn || -99) >= 20 && (state.properties.length || state.children.length || Object.values(state.insurance).some(Boolean))) {
    state.pending.moneyWarn = state.day;
    notice(state, { level: 'warn', title: 'Das Konto wird knapp', tab: 'work', interrupt: true, text: 'Deine Fixkosten sind bald nicht mehr gedeckt. Fällt das Konto unter null, ist das Spiel vorbei.', info: ['Dein Geld reicht nur noch für wenige Tage Fixkosten.', 'Wer im Minus landet, ist insolvent: Game Over.', 'Finde besser bezahlte Arbeit, kündige Versicherungen oder verkaufe Besitz.'] });
  }

  state.stats.peakWorth = Math.max(state.stats.peakWorth, state.money);

  // ---- Tod / Game Over ----
  if (state.money < 0) {
    if (ctx.offline) state.money = 0;
    else { press.story(world, state, 'insolvency', {}); state.status = 'gameover'; state.death = { day: state.day, reason: 'Insolvenz', gameOver: true, message: 'Dein Konto ist ins Minus gefallen – Insolvenz. Coins und Meta-Fortschritt bleiben erhalten.' }; chronicle(state, `${state.person.first} ${state.person.last} wird insolvent.`, 'death'); return; }
  }
  if (m.health <= 0) {
    const cause = state.housing.type === 'street' ? 'auf der Straße gestorben' : state.hunger > 0 ? 'verhungert' : state.life.illness ? `an ${state.life.illness.name === 'Krebs' ? 'Krebs' : 'seiner Krankheit'} gestorben` : age >= 62 ? 'an Altersschwäche gestorben' : 'an Erschöpfung gestorben';
    endLife(ctx, cause, 'health');
    return;
  }
  const span = lifespanDays(state, year);
  const ageDays = state.day - state.person.birthDay;
  if (!state.life.illness && ageDays >= span - 160) {
    const r = rngFor('ill', state.seed);
    const ill = ILLNESSES[Math.floor(r() * ILLNESSES.length)];
    state.life.illness = { name: ill, day: state.day };
    notice(state, {
      level: 'bad', title: `Diagnose: ${ill}`, tab: 'household', interrupt: true,
      text: year >= 1960 ? `Bei dir wurde ${ill} diagnostiziert. Gesundheitskarten können dein Leben um einige Tage verlängern.` : `Bei dir wurde ${ill} diagnostiziert. Die Ärzte machen wenig Hoffnung.`,
      info: ['Du bist schwer erkrankt.', 'Die Krankheit endet nicht von allein – dein Leben geht absehbar zu Ende.', year >= 1960 ? 'Setze Gesundheitskarten ein (Haushalt), regle dein Erbe und bereite die nächste Generation vor.' : 'Regle dein Erbe und bereite die nächste Generation vor.'],
    });
  }
  if (ageDays >= span) {
    if (state.life.rare && !state.life.rareUsed && state.life.healthDays && state.life.healthSum / state.life.healthDays >= 80 && state.life.cardsUsed >= 20) {
      state.life.rareUsed = true; state.life.extraDays += 20 * 365;
      notice(state, { level: 'good', title: 'Ein außergewöhnlich langes Leben', text: 'Mit viel Disziplin und Vorsorge schenkt dir das Leben noch einmal Jahrzehnte.', interrupt: true });
    } else {
      endLife(ctx, 'Alter', 'age');
    }
  }
}

function occupationDaily(ctx, flows, year) {
  const { world, state } = ctx;
  const occ = state.occupation;
  const p = world.prof(occ.pkey);
  const tired = state.meters.rest < 15 ? 0.7 : 1;
  if (occ.kind === 'work') {
    const wage = Math.round(flows.inc.wage * tired);
    state.money += wage; state.stats.earned += wage;
    const lvBefore = levelIndex(state, occ.pkey);
    state.skills.days[occ.pkey] = (state.skills.days[occ.pkey] || 0) + 1;
    state.stats.daysWorked++;
    const d = state.skills.days[occ.pkey];
    const lvNow = levelIndex(state, occ.pkey);
    if (lvNow > lvBefore) {
      notice(state, { level: 'good', title: `Beförderung: ${LEVELS[lvNow].name}`, text: `Du bist als ${p ? p.name : 'Fachkraft'} jetzt ${LEVELS[lvNow].name} und verdienst mehr.`, tab: 'work', info: ['Berufserfahrung zahlt sich aus.', 'Höhere Stufen bringen mehr Lohn und später größere Unternehmen.', 'Bleib dran.'] });
      award(state, 'training_finish');
    }
    if (d === 3650 && !state.skills.learned.includes(occ.pkey) && occ.pkey !== 'helfer') {
      learn(state, occ.pkey);
      award(state, 'training_finish');
      notice(state, { level: 'good', title: `${p ? p.name : 'Beruf'} anerkannt`, text: 'Nach zehn Jahren Berufserfahrung giltst du als ausgebildet.', tab: 'work', interrupt: true, info: ['Zehn Jahre im Beruf entsprechen einer Ausbildung.', 'Du darfst den Beruf nun auch in anderen Betrieben ausüben.', 'Schau in die Zeitung nach besseren Stellen.'] });
    }
  } else if (occ.kind === 'training') {
    const wage = Math.round(flows.inc.wage * tired);
    state.money += wage; state.stats.earned += wage;
    occ.daysLeft--;
    if (occ.daysLeft <= 0) {
      learn(state, occ.pkey);
      state.occupation = { kind: 'work', pkey: occ.pkey, employer: occ.employer, cityId: occ.cityId, factor: occ.factor, lodging: occ.lodging, since: state.day };
      const me = state.tree.persons.find((x) => x.id === state.person.id);
      if (me && p) me.jobs.push(p.name);
      award(state, 'training_finish');
      chronicle(state, `Ausbildung zum ${p ? p.name : 'Beruf'} abgeschlossen.`, 'education');
      press.story(ctx.world, state, 'education_done', { job: p ? p.name : 'Beruf' });
      notice(state, { level: 'good', title: `Ausbildung abgeschlossen: ${p ? p.name : ''}`, text: 'Du arbeitest jetzt als ausgebildete Fachkraft im selben Betrieb.', tab: 'work', interrupt: true, info: ['Deine Ausbildung ist beendet.', 'Du verdienst jetzt den vollen Lohn und kannst in vielen Betrieben arbeiten.', 'Prüfe in der Zeitung bessere Stellen.'] });
    }
  } else if (occ.kind === 'study') {
    const cost = flows.exp.tuition;
    if (state.money < cost && !ctx.offline) {
      state.occupation = null;
      notice(state, { level: 'bad', title: 'Studium abgebrochen', text: 'Du konntest die Studiengebühren nicht mehr bezahlen.', tab: 'work', interrupt: true, info: ['Das Geld reichte nicht für die Studiengebühren.', 'Das Studium wurde beendet; bisherige Semester sind verloren.', 'Spare vorher einen Puffer an, bevor du ein Studium beginnst.'] });
      return;
    }
    const pay = Math.min(cost, Math.max(0, state.money));
    state.money -= pay; state.stats.spent += pay;
    flows.exp.tuition = 0;
    occ.daysLeft--;
    if (occ.daysLeft <= 0) {
      learn(state, occ.pkey);
      state.pending.degrees = (state.pending.degrees || []).concat(occ.pkey);
      state.occupation = null;
      const me = state.tree.persons.find((x) => x.id === state.person.id);
      if (me && p) me.jobs.push(`${p.name} (Studium)`);
      award(state, 'study_finish');
      chronicle(state, `Studium abgeschlossen: ${p ? p.name : ''}.`, 'education');
      press.story(ctx.world, state, 'study_done', { job: p ? p.name : '' });
      notice(state, { level: 'good', title: `Studium abgeschlossen: ${p ? p.name : ''}`, text: 'Der akademische Abschluss bleibt über Generationen und Neustarts erhalten.', tab: 'work', interrupt: true, info: ['Du hast ein Studium beendet.', 'Akademische Abschlüsse bleiben als Meta-Fortschritt erhalten.', 'Suche in der Zeitung nach passenden Stellen.'] });
    }
  }
}

function offlineAutopilot(ctx) {
  const { world, state } = ctx;
  const m = state.meters;
  if (m.fridge < 25) {
    const econ = world.econ;
    let tier = Math.min(state.flags.foodTier ?? 1, 1);
    for (; tier >= 0; tier--) {
      const pct = 100 - m.fridge;
      const cost = Math.round(econ.food[tier].perPct * pct * ctx.idx);
      if (state.money >= cost && cost > 0) {
        m.fridgeQ = (m.fridge * m.fridgeQ + pct * (tier + 1)) / 100;
        m.fridge = 100;
        state.money -= cost; state.stats.spent += cost;
        return;
      }
    }
  }
}

function newYear(ctx, year, econ) {
  const { world, state } = ctx;
  // Ziel erreicht: das 22. Jahrhundert beendet den großen historischen Zyklus
  if (year >= settings.get('game.legacy_year') && !state.legacyDone) {
    state.legacyDone = true;
    state.status = 'gameover';
    const bonus = settings.get('coins.legacy_bonus');
    state.fx.coins += bonus;
    state.death = { day: state.day, reason: 'Vermächtnis vollendet', completed: true, gameOver: true, message: `Deine Familie hat das ${Math.floor(year / 100) + 1}. Jahrhundert erreicht! Der große Zyklus ist vollendet. Als Dank für dieses Vermächtnis erhältst du ${bonus} Coins. Die Welt beginnt von vorn – im Jahr ${state.startYear}.` };
    chronicle(state, `Das Vermächtnis der Familie ${state.person.last} erreicht das Jahr ${year}.`, 'epoch');
    press.story(world, state, 'legacy', {});
    return;
  }
  // Währungsumstellung
  if (year === (econ.euroYear || 2002)) {
    state.money = Math.round(state.money / 2);
    state.stats.peakWorth = Math.round(state.stats.peakWorth / 2);
    notice(state, { level: 'info', title: 'Der Euro kommt', text: 'Die D-Mark wird durch den Euro ersetzt. Alle Beträge werden im Verhältnis 2:1 umgestellt – Preise und Löhne ebenso.', interrupt: true, info: ['Die Währung wechselt von DM zu Euro.', 'Dein Geld wird ungefähr halbiert, Preise und Löhne passen sich an – real ändert sich wenig.', 'Nichts zu tun.'] });
    chronicle(state, 'Der Euro löst die D-Mark ab.', 'epoch');
    press.story(world, state, 'euro', {});
  }
  // Berufswandel
  const lost = [];
  const gained = [];
  for (const key of state.skills.learned.slice()) {
    const p = world.prof(key);
    if (!p || (p.era_from <= year && year <= p.era_to)) continue;
    const succ = world.successorOf(key, year);
    if (succ) { learn(state, succ.pkey); gained.push(`${p.name} → ${succ.name}`); state.skills.days[succ.pkey] = Math.max(state.skills.days[succ.pkey] || 0, state.skills.days[key] || 0); }
  }
  const occ = state.occupation;
  if (occ && occ.kind !== 'study') {
    const p = world.prof(occ.pkey);
    if (p && !(p.era_from <= year && year <= p.era_to)) {
      const succ = world.successorOf(occ.pkey, year);
      if (succ) { occ.pkey = succ.pkey; learn(state, succ.pkey); }
      else { state.occupation = null; lost.push(p.name); }
    }
  }
  if (state.partner && state.partner.pkey) {
    const pp = world.prof(state.partner.pkey);
    if (pp && !(pp.era_from <= year && year <= pp.era_to)) {
      const succ = world.successorOf(state.partner.pkey, year);
      if (succ) state.partner.pkey = succ.pkey;
    }
  }
  if (gained.length || lost.length) {
    notice(state, {
      level: lost.length ? 'warn' : 'info', title: `Die Arbeitswelt wandelt sich (${year})`, tab: 'work', interrupt: true,
      text: [gained.length ? `Neue Berufsbilder: ${gained.join(', ')}.` : '', lost.length ? `Dein Betrieb als ${lost.join(', ')} schließt – du bist ohne Stelle.` : ''].filter(Boolean).join(' '),
      info: ['Alle ~20 Jahre verändern sich Berufe: Handwerk wird Industrie, neue Berufe entstehen, alte verschwinden.', 'Deine erlernten Berufe wandeln sich mit; verschwindet eine Stelle ersatzlos, verlierst du den Job.', 'Prüfe in der Zeitung bzw. im Netz neue Stellen.'],
    });
    if (gained.length || lost.length) { chronicle(state, `Berufswandel ${year}: ${[...gained, ...lost.map((x) => x + ' (entfällt)')].join(', ')}.`, 'epoch'); press.story(world, state, 'epoch', { change: [...gained, ...lost.map((x) => x + ' (entfällt)')].join(', ') }); }
  }
  if (year === 2002) {
    notice(state, { level: 'info', title: 'Das Internet ersetzt die Zeitung', text: 'Stellen, Wohnungen, Partnerbörsen und Nachrichten findest du ab jetzt im World Wide Web.', info: ['Der Informationskanal wechselt von der Zeitung zum Web.', 'Die Inhalte bleiben ähnlich, nur das Medium ändert sich.', 'Nutze den Reiter „Web“.'], tab: 'newspaper' });
  }
}

module.exports = { advance, dayStep, lifespanDays };
