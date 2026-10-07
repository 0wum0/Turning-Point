'use strict';
const { rngFor, int, pick, chance, weighted } = require('./rng');
const { notice, chronicle, propertyValue } = require('./core');
const { scale, formatMoney } = require('./economy');
const { season, yearOf } = require('./calendar');

/**
 * Stadtereignisse sind DETERMINISTISCH je (Stadt, Woche): Die Zeitung kann sie ankündigen
 * oder berichten, und die Engine wendet sie auf dieselbe Weise an.
 */
const TYPES = [
  { type: 'storm', w: 3 }, { type: 'fire', w: 1.2 }, { type: 'burglary', w: 2 },
  { type: 'festival', w: 2 }, { type: 'lotto', w: 1.5 }, { type: 'market', w: 2 },
];

function townEventsForWeek(city, week, startYear = 1945) {
  const r = rngFor('town', city.id, week);
  const count = weighted(r, [{ w: 3, n: 0 }, { w: 4, n: 1 }, { w: 2, n: 2 }]).n;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = weighted(r, TYPES.map((x) => ({ ...x, w: x.type === 'storm' ? x.w * (season(week * 7, startYear) === 2 ? 2 : 0.7) : x.w })));
    out.push({ type: t.type, offset: int(r, 0, 6), cityId: city.id, key: `${city.id}:${week}:${i}`, seed: int(r, 0, 1e9) });
  }
  return out;
}

function townEventsOn(city, day, startYear) {
  const week = Math.floor(day / 7);
  return townEventsForWeek(city, week, startYear).filter((e) => week * 7 + e.offset === day);
}

const STORM_KINDS = ['Hagelunwetter', 'Blitzeinschlag', 'schwerer Sturm'];
function describeTownEvent(ev, city, tense = 'past') {
  const r = rngFor('desc', ev.key);
  const c = city.name;
  switch (ev.type) {
    case 'storm': {
      const kind = pick(r, STORM_KINDS);
      return tense === 'future'
        ? { title: `Unwetterwarnung für ${c}`, text: `Der Wetterdienst erwartet in den nächsten Tagen ${kind === 'schwerer Sturm' ? 'einen schweren Sturm' : 'ein ' + kind} über ${c}. Hausbesitzer sollten ihre Gebäude versichern.`, hint: 'storm' }
        : { title: `${kind} über ${c}`, text: `${kind === 'Blitzeinschlag' ? 'Ein Blitz schlug' : 'Ein ' + kind + ' richtete'} in ${c} Schäden an Dächern und Häusern an.`, hint: 'storm' };
    }
    case 'fire':
      return { title: `Feuer in ${c}`, text: `In ${c} brannte es in der Nacht in einem Wohnhaus. Die Feuerwehr war stundenlang im Einsatz.`, hint: 'fire' };
    case 'burglary':
      return { title: `Einbruchserie in ${c}`, text: `Die Polizei in ${c} warnt: In mehreren Wohnungen wurde eingebrochen. Eine Hausratversicherung schützt vor dem Schaden.`, hint: 'burglary' };
    case 'festival':
      return { title: `Stadtfest in ${c}`, text: `${c} feiert! Musik, Tanz und gute Laune auf dem Marktplatz – die Stimmung in der Stadt ist prächtig.`, hint: 'festival' };
    case 'lotto':
      return { title: `Lotto: Glückspilz in ${c}`, text: `Ein Tipper aus ${c} hat einen hohen Gewinn gemacht. „Ich muss mich erst einmal setzen“, sagte er.`, hint: 'lotto' };
    default:
      return { title: `Markt in ${c}`, text: `Auf dem Wochenmarkt in ${c} sind Lebensmittel diese Woche ${r() < 0.5 ? 'etwas teurer' : 'erfreulich günstig'}.`, hint: 'market' };
  }
}

/** Wendet Stadtereignisse des heutigen Tages an (nur wenn sie den Spieler betreffen). */
function applyTownEvents(ctx) {
  const { world, state } = ctx;
  const year = yearOf(state.day, state.startYear);
  const idx = world.idx(year);
  const cityIds = new Set([state.cityId, ...state.properties.map((p) => p.cityId)]);
  for (const cid of cityIds) {
    const city = world.city(cid);
    if (!city) continue;
    for (const ev of townEventsOn(city, state.day, state.startYear)) {
      const r = rngFor('apply', state.seed, ev.key);
      const d = describeTownEvent(ev, city);
      if (ev.type === 'storm') {
        for (const p of state.properties.filter((x) => x.cityId === cid)) {
          if (!chance(r, 0.4)) continue;
          const cost = Math.round(propertyValue(world, state, p, year) * 0.06);
          const insured = state.insurance.gebaeude;
          const pay = insured ? 0 : Math.min(cost, Math.max(0, state.money));
          state.money -= pay; state.stats.spent += pay;
          p.condition = Math.max(5, p.condition - (insured ? 12 : 20) - (pay < cost ? 15 : 0));
          p.closedUntil = state.day + 14;
          notice(state, {
            level: 'bad', title: `Sturmschaden: ${p.name}`, tab: 'housing',
            text: insured ? 'Deine Gebäudeversicherung ersetzt den Schaden. Das Haus ist trotzdem für etwa 14 Tage nicht voll nutzbar.' : `Die Reparatur kostet dich ${formatMoney(pay, world.currency(year))} und das Haus ist etwa 14 Tage nicht voll nutzbar.`,
            info: ['Ein Unwetter hat dein Gebäude beschädigt.', 'Ohne Gebäudeversicherung zahlst du die Reparatur selbst. Auch mit Versicherung bleibt die Ausfallzeit.', 'Schließe eine Gebäudeversicherung ab und lies die Zeitung – Unwetter werden vorher angekündigt.'],
          });
        }
      } else if (ev.type === 'fire') {
        for (const p of state.properties.filter((x) => x.cityId === cid)) {
          if (!chance(r, 0.12)) continue;
          const cost = Math.round(propertyValue(world, state, p, year) * 0.25);
          const insured = state.insurance.gebaeude;
          const pay = insured ? 0 : Math.min(cost, Math.max(0, state.money));
          state.money -= pay; state.stats.spent += pay;
          p.condition = Math.max(5, p.condition - 35);
          p.closedUntil = state.day + 60;
          chronicle(state, `Feuer in ${p.name} (${city.name}).`, 'event');
          notice(state, {
            level: 'bad', title: `Feuer: ${p.name}`, tab: 'housing', interrupt: true,
            text: insured ? 'Die Versicherung bezahlt die Reparatur. Das Gebäude fällt etwa 60 Tage aus.' : 'Du trägst den Schaden selbst. Das Gebäude fällt etwa 60 Tage aus.',
            info: ['Ein Feuer hat dein Gebäude schwer beschädigt.', 'Versicherung ersetzt Kosten, aber nicht die Ausfallzeit.', 'Eine Gebäudeversicherung lohnt sich besonders bei teuren Häusern.'],
          });
        }
      } else if (ev.type === 'burglary' && cid === state.cityId && state.housing.type !== 'street' && state.money > 0 && chance(r, 0.3)) {
        const loss = Math.min(Math.round(state.money * 0.12), scale(5000, idx));
        if (state.insurance.hausrat) {
          notice(state, { level: 'warn', title: 'Einbruch – Schaden ersetzt', text: 'Bei dir wurde eingebrochen. Deine Hausratversicherung hat den Verlust ersetzt.', info: ['Ein Einbrecher war bei dir.', 'Mit Hausratversicherung bekommst du den Schaden erstattet.', 'Du musst nichts weiter tun.'] });
        } else {
          state.money -= loss; state.stats.spent += loss;
          notice(state, { level: 'bad', title: 'Einbruch!', text: 'Bei dir wurde eingebrochen. Bargeld fehlt.', tab: 'household', info: ['Ein Einbrecher hat Bargeld mitgenommen.', 'Ohne Hausratversicherung trägst du den Schaden selbst.', 'Schließe unter „Haushalt“ eine Hausratversicherung ab.'] });
        }
      } else if (ev.type === 'festival' && cid === state.cityId) {
        state.mods.wellBoost = Math.min(15, (state.mods.wellBoost || 0) + 10);
        notice(state, { level: 'good', title: `Stadtfest in ${city.name}`, text: 'Die ganze Stadt feiert – das hebt die Stimmung.', info: ['Ein Fest in deiner Stadt.', 'Das Wohlbefinden steigt für ein paar Tage.', 'Nichts nötig – genieße es.'] });
      }
    }
  }
}

/** Persönliche Zufallsereignisse + stilles „adaptives Glück“ für Spieler in Not. */
function rollPrivateEvent(ctx, flows) {
  const { world, state } = ctx;
  const r = rngFor('priv', state.seed, state.day);
  const year = yearOf(state.day, state.startYear);
  const idx = world.idx(year);
  const poor = state.money < Math.max(1, flows.expense) * 10 && state.properties.length === 0;
  if (!chance(r, poor ? 1 / 12 : 1 / 26)) return;
  const luck = poor ? 5 : 1;
  const t = weighted(r, [
    { id: 'gold', w: 2 * luck }, { id: 'gift', w: state.occupation && state.occupation.kind === 'work' ? 2 * luck : 0 },
    { id: 'heritage', w: 0.35 * luck }, { id: 'bag', w: 0.5 * luck }, { id: 'sick', w: 2.2 },
  ]);
  if (t.id === 'gold') {
    const v = scale(1500, idx);
    state.money += v; state.stats.earned += v;
    notice(state, { level: 'good', title: 'Glückliches Fundstück', text: 'Du hast beim Spazierengehen eine Goldkette gefunden und verkauft.', info: ['Ein glücklicher Zufall.', 'Du erhältst einmalig Geld.', 'Nichts zu tun – freu dich.'] });
  } else if (t.id === 'gift') {
    const v = scale(600, idx);
    state.money += v; state.stats.earned += v;
    notice(state, { level: 'good', title: 'Großzügiger Kunde', text: 'Ein zufriedener Kunde hat dir ein ordentliches Trinkgeld gegeben.', info: ['Gute Arbeit zahlt sich aus.', 'Einmaliger Bonus.', 'Nichts zu tun.'] });
  } else if (t.id === 'heritage') {
    const v = scale(15000, idx);
    state.money += v; state.stats.earned += v;
    notice(state, { level: 'good', title: 'Unerwartetes Erbe', text: 'Eine entfernte Tante aus Amerika hat dir Geld hinterlassen.', info: ['Ein unbekannter Verwandter hat dich bedacht.', 'Einmaliger Geldsegen.', 'Nutze ihn weise.'] });
  } else if (t.id === 'bag') {
    const v = scale(4000, idx);
    state.money += v; state.stats.earned += v;
    notice(state, { level: 'good', title: 'Eine Tasche mit Goldmünzen', text: 'Beim Aufräumen findest du eine alte Tasche mit Goldmünzen.', info: ['Ein seltener Fund.', 'Einmaliger Geldsegen.', 'Nichts zu tun.'] });
  } else if (t.id === 'sick') {
    state.meters.health = Math.max(1, state.meters.health - 15);
    let cost = scale(800, idx);
    if (state.insurance.gesundheit) cost = 0;
    cost = Math.min(cost, Math.max(0, state.money));
    state.money -= cost; state.stats.spent += cost;
    notice(state, { level: 'warn', title: 'Krankheit', text: 'Du hast dich erkältet und warst beim Arzt.', tab: 'household', info: ['Eine Krankheit hat deine Gesundheit getroffen.', 'Gute Ernährung und eine ordentliche Wohnung verkürzen die Erholung.', 'Iss besser, schlafe in einer richtigen Wohnung – ein Krankenzusatz ersetzt Arztkosten.'] });
  }
}

module.exports = { townEventsForWeek, townEventsOn, describeTownEvent, applyTownEvents, rollPrivateEvent };
