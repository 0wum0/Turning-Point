'use strict';
const { rngFor, chance } = require('./rng');
const press = require('./press');
const { yearOf, ageYears } = require('./calendar');
const { scale, formatMoney } = require('./economy');
const { notice, chronicle, award, clamp } = require('./core');
const rep = require('./reputation');

const cfg = (world) => world.econ.politics;
const gcfg = (world) => world.econ.gambling;
const completed = (state, i) => (state.politics.completed[i] || 0);

function currentOffice(world, state) {
  const t = state.politics.term;
  return t ? { ...cfg(world).offices[t.idx], idx: t.idx, term: t } : null;
}

/** Tageswirkungen des Amtes (Einkommen / Erschöpfung / Gesundheit). */
function officeEffects(world, state, year) {
  const o = currentOffice(world, state);
  if (!o) return { income: 0, rest: 0, health: 0, wageMult: 1 };
  const idx = world.idx(year);
  return { income: scale(o.income + o.termBonus * completed(state, o.idx), idx), rest: o.rest, health: o.health, wageMult: 0.6 };
}

function winChance(world, state, userInfluence, idx) {
  const o = cfg(world).offices[idx];
  const year = yearOf(state.day, state.startYear);
  const rich = state.money > scale(o.campaign, world.idx(year)) * 3 ? 0.06 : 0;
  const base = 0.32 - idx * 0.04;
  const p = base + userInfluence / 120 + (state.meters.wellbeing - 50) / 400 + rich + Math.min(0.15, completed(state, idx) * 0.05) + (state.partner ? 0.02 : 0) + require('./talents').chanceBonus(state.talents);
  return clamp(p, 0.08, 0.9);
}

function politicsDaily(ctx) {
  const { world, state } = ctx;
  const t = state.politics.term;
  if (!t || state.day < t.endDay) return;
  const o = cfg(world).offices[t.idx];
  state.politics.completed[t.idx] = completed(state, t.idx) + 1;
  state.politics.term = null;
  const gain = 2 * (t.idx + 1);
  state.fx.influence = (state.fx.influence || 0) + gain;
  rep.queue(state, 'office', 4 + 2 * t.idx, 'office_term', `o${t.idx}`); // Amtszeit ordentlich zu Ende gebracht
  chronicle(state, `${state.person.first} beendet die Amtszeit als ${o.name}.`, 'politics');
  press.story(world, state, 'term_end', { office: o.name });
  notice(state, {
    level: 'good', title: `Amtszeit beendet: ${o.name}`, tab: 'society', interrupt: true,
    text: `Du hast ${o.name} erfolgreich ausgefüllt und gewinnst ${gain} Einfluss. Du kannst erneut kandidieren oder das nächsthöhere Amt anstreben.`,
    info: ['Deine Amtszeit ist zu Ende.', 'Einfluss erhöht deine Wahlchancen und bleibt dir über alle Leben erhalten. Höhere Ämter zahlen deutlich besser, kosten aber Kraft.', 'Kandidiere unter „Gesellschaft“ erneut oder für das nächste Amt.'],
  });
}

/* ---------------- Aktionen ---------------- */
function install(A, fail, helpers) {
  const { yr, pay } = helpers;
  A.runOffice = ({ world, state, input, user }) => {
    const idx = Math.floor(Number(input.idx));
    const c = cfg(world);
    const o = c.offices[idx];
    if (!o) fail('Unbekanntes Amt.');
    if (require('../settings').get('elections').disableChance) fail('Ämter werden jetzt per Spielerwahl vergeben (Spieler → Wahlen).');
    if (state.politics.term) fail('Du bist bereits im Amt.');
    if (ageYears(state.person.birthDay, state.day) < c.minAge) fail(`Mindestalter für Ämter: ${c.minAge} Jahre.`);
    if (idx > 0 && completed(state, idx - 1) < 1) fail(`Zuerst musst du eine Amtszeit als ${c.offices[idx - 1].name} absolvieren.`);
    { const st = rep.stand(state); const bl = rep.block(idx >= (require('../settings').get('elections').firstNationalOffice || 3) ? st.lv : st.ll, rep.officeMin(idx)); if (bl) fail(bl); }
    const year = yr(state);
    const cost = scale(o.campaign, world.idx(year));
    if (state.money < cost) fail('Für den Wahlkampf reicht dein Geld nicht.');
    pay(state, cost);
    const influence = (user.meta.influence || 0) + (state.fx.influence || 0);
    const r = rngFor('elect', state.seed, state.day, idx);
    const p = winChance(world, state, influence, idx);
    if (!chance(r, p)) { state.fx.influence = (state.fx.influence || 0) + 1; return { msg: `Die Wahl zum ${o.name} ging verloren (Chance war ${Math.round(p * 100)} %). Du gewinnst 1 Einfluss durch die Erfahrung.`, level: 'warn' }; }
    state.politics.term = { idx, startDay: state.day, endDay: state.day + c.termDays };
    state.fx.influence = (state.fx.influence || 0) + 1;
    rep.queue(state, 'office', 2 + idx, 'office_won', `o${idx}`);
    award(state, 'partner');
    chronicle(state, `${state.person.first} wird zum ${o.name} gewählt.`, 'politics');
    press.story(world, state, 'elected', { office: o.name });
    return { msg: `Gewählt! Du bist jetzt ${o.name}.`, level: 'good' };
  };
  A.resignOffice = ({ state }) => {
    if (!state.politics.term) fail('Du hast kein Amt.');
    rep.queue(state, 'office', null, 'office_quit', `o${state.politics.term.idx}`);
    state.politics.term = null;
    return { msg: 'Du bist zurückgetreten.', level: 'warn' };
  };

  A.lotto = ({ world, state, input }) => {
    const g = gcfg(world);
    const n = clamp(Math.floor(Number(input.tickets) || 1), 1, 20);
    const price = scale(g.ticket, world.idx(yr(state))) * n;
    if (state.money < price) fail('Dafür reicht dein Geld nicht.');
    pay(state, price);
    let win = 0;
    for (let i = 0; i < n; i++) {
      state.pending.rngN = (state.pending.rngN || 0) + 1;
      const r = rngFor('lotto', state.seed, state.day, state.pending.rngN)();
      const unit = price / n;
      if (r < 1 / 50000) win += unit * 10000; else if (r < 1 / 50000 + 1 / 1500) win += unit * 300; else if (r < 1 / 50000 + 1 / 1500 + 1 / 60) win += unit * 10; else if (r < 0.14) win += unit * 2;
    }
    win = Math.round(win);
    state.money += win; state.stats.earned += win;
    state.stats.gambled = (state.stats.gambled || 0) + price - win;
    if (win >= price * 100) { chronicle(state, `${state.person.first} gewinnt im Lotto.`, 'luck'); press.story(world, state, 'lotto', { amount: formatMoney(win, world.currency(yr(state))) }); }
    const cur = world.currency(yr(state));
    return { msg: win > 0 ? `Gewinn: ${formatMoney(win, cur)} (Einsatz ${formatMoney(price, cur)}).` : 'Leider nichts gewonnen.', level: win > price ? 'good' : 'warn', lottoWin: win, lottoStake: price };
  };

  A.casino = ({ world, state, input }) => {
    const g = gcfg(world);
    if (yr(state) < g.casinoFromYear) fail(`Spielbanken gibt es erst ab ${g.casinoFromYear}.`);
    if (ageYears(state.person.birthDay, state.day) < g.casinoMinAge) fail(`Zutritt erst ab ${g.casinoMinAge} Jahren.`);
    const bet = Math.floor(Number(input.bet));
    if (!(bet > 0)) fail('Bitte einen Einsatz wählen.');
    if (state.money < bet) fail('Dafür reicht dein Geld nicht.');
    state.pending.rngN = (state.pending.rngN || 0) + 1;
    const r = rngFor('casino', state.seed, state.day, state.pending.rngN)();
    const win = r < 18 / 37; // Roulette: Rot/Schwarz, Null verliert
    if (win) { state.money += bet; state.stats.earned += bet; } else pay(state, bet);
    state.stats.gambled = (state.stats.gambled || 0) + (win ? -bet : bet);
    return { msg: win ? `Gewonnen! +${formatMoney(bet, world.currency(yr(state)))}` : 'Die Kugel fällt auf die falsche Farbe. Einsatz verloren.', level: win ? 'good' : 'bad' };
  };
}

module.exports = { install, politicsDaily, officeEffects, currentOffice, winChance, completed };
