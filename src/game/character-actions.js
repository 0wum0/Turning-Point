'use strict';
/**
 * Aktionen „Charakterblatt“: Erfahrungspunkte verteilen, Ausstattung kaufen, wechseln, verkaufen und instand setzen, Dienstleistungen buchen.
 * Rechenregeln stehen in character.js; hier nur Eingabeprüfung, Kosten und Meldungen. Alles läuft über service.withCharacter (eine Transaktion pro Aktion),
 * Geld verlässt nur den Spielstand der Spielfigur und kommt nur beim Verkauf zurück – genau einmal je Aktion. Protokoll-Einträge wandern beim Speichern aus der
 * Vormerkung (state.pending.char) in die Datenbank (src/lib/character.js).
 */
const CH = require('./character');
const TL = require('./talents');
const { formatMoney } = require('./economy');
const { chronicle } = require('./core');

const intOf = (x) => (typeof x === 'number' && Number.isInteger(x)) || (typeof x === 'string' && /^\d{1,9}$/.test(x)) ? Number(x) : NaN;

function install(A, fail, { yr, pay }) {
  const on = () => { if (!CH.enabled()) fail('Das Charakterblatt ist gerade ausgeschaltet.'); };
  const cur = (world, state) => world.currency(yr(state));
  const money = (world, state, cents) => formatMoney(cents, cur(world, state));
  const slotOf = (input) => { const k = typeof input.slot === 'string' ? input.slot : ''; if (!CH.SLOTS.includes(k)) fail('Unbekannter Platz.'); return k; };
  const real = (world, state, cents) => Math.round(cents / Math.max(0.0001, world.idx(yr(state))));

  /* ---------------------------------------------------------------- Erfahrungspunkte ---------------------------------------------------------------- */
  A.chTrain = ({ world, state, input }) => {
    on(); CH.ensure(state);
    if (!TL.enabled()) fail('Talente sind gerade ausgeschaltet.');
    const key = String(input.key == null ? '' : input.key);
    if (key === 'all') {
      const done = CH.trainAll(world, state);
      if (!done.length) { const first = CH.canTrain(state, CH.recommend(world, state)[0]); fail(first.why || 'Es lässt sich gerade nichts verteilen.'); }
      chronicle(state, `${state.person.first} entwickelt sich weiter (${done.length} Talente).`, 'talent');
      const cost = done.reduce((a, d) => a + d.cost, 0);
      return { msg: done.length === 1 ? `Erfahrung verteilt: 1 Talent gesteigert (${cost} EP).` : `Erfahrung verteilt: ${done.length} Talente gesteigert (${cost} EP).`, level: 'good' };
    }
    const k = key === 'best' ? (CH.recommend(world, state).find((x) => CH.canTrain(state, x).ok) || CH.recommend(world, state)[0]) : key;
    if (!k || !Object.prototype.hasOwnProperty.call(TL.IDX, k)) fail('Dieses Talent gibt es nicht.');
    const r = CH.train(state, k);
    if (r.err) fail(r.err);
    const lbl = (TL.C().labels || {})[k] || TL.META[k].label;
    return { msg: `${lbl} steigt auf ${r.v} (${r.cost} EP).`, level: 'good' };
  };

  A.chAuto = ({ state, input }) => {
    on(); CH.ensure(state);
    const x = CH.xpOf(state); if (!x) fail('Talente sind gerade ausgeschaltet.');
    x.auto = !!(input.on === true || input.on === 'true' || input.on === 1 || input.on === '1');
    return { msg: x.auto ? 'Erfahrung wird ab jetzt automatisch auf die Talente deiner Tätigkeit verteilt.' : 'Du verteilst deine Erfahrung selbst.', level: 'good' };
  };

  /* ---------------------------------------------------------------- Ausstattung ---------------------------------------------------------------- */
  A.chBuy = ({ world, state, input }) => {
    on(); CH.ensure(state);
    const slot = slotOf(input); if (CH.isService(slot)) fail('Das ist eine Dienstleistung, kein Gegenstand.');
    const lv = intOf(input.level); if (!Number.isFinite(lv) || lv < 1 || lv > 3) fail('Bitte eine Stufe von 1 bis 3 wählen.');
    const year = yr(state);
    if (!CH.eraOk(slot, lv, year)) fail(`${CH.levelName(slot, lv, year)} gibt es erst ab ${CH.levelDef(slot, lv).from}.`);
    const g = CH.own(state, slot);
    if (g && g.lv === lv) fail('Das hast du schon.');
    const cost = CH.price(world, state, slot, lv, year);
    const back = g ? CH.resaleValue(world, state, slot, g) : 0;
    const net = cost - back;
    if (net > 0 && state.money < net) fail('Dafür reicht dein Geld nicht.');
    if (net > 0) pay(state, net); else if (net < 0) state.money += -net;
    CH.ensure(state);
    state.char.gear[slot] = { lv, paid: real(world, state, cost), cond: 100, day: state.day, y: year };
    const nm = CH.levelName(slot, lv, year); const fm = money(world, state, cost);
    chronicle(state, `${state.person.first} kauft: ${nm}.`, 'gear');
    CH.queueLog(state, { k: 'buy', slot, lv, real: real(world, state, cost), back: real(world, state, back), city: state.cityId });
    CH.checkRank(world, state);
    return { msg: g ? `Gewechselt zu ${nm} (${fm}, altes Stück angerechnet: ${money(world, state, back)}).` : `Gekauft: ${nm} (${fm}).`, level: 'good' };
  };

  A.chSell = ({ world, state, input }) => {
    on(); CH.ensure(state);
    const slot = slotOf(input); if (CH.isService(slot)) fail('Eine Dienstleistung lässt sich nur beenden.');
    const g = CH.own(state, slot); if (!g) fail('Dafür hast du kein eigenes Stück.');
    const v = CH.resaleValue(world, state, slot, g);
    const nm = CH.levelName(slot, g.lv, yr(state));
    state.money += v;
    delete state.char.gear[slot];
    CH.queueLog(state, { k: 'sell', slot, lv: g.lv, real: real(world, state, v), city: state.cityId });
    CH.checkRank(world, state, { silent: true });
    return { msg: `${nm} verkauft (${money(world, state, v)}).`, level: 'good' };
  };

  A.chRepair = ({ world, state, input }) => {
    on(); CH.ensure(state);
    const slot = slotOf(input); if (CH.isService(slot)) fail('Dienstleistungen nutzen sich nicht ab.');
    const g = CH.own(state, slot); if (!g) fail('Dafür hast du kein eigenes Stück.');
    if (g.cond >= CH.GEAR().repairBelow) fail('Das Stück ist noch in gutem Zustand.');
    const cost = CH.repairCost(world, state, slot, g);
    if (state.money < cost) fail('Dafür reicht dein Geld nicht.');
    pay(state, cost);
    g.cond = CH.r1(Math.max(g.cond, CH.GEAR().repairTo));
    const nm = CH.levelName(slot, g.lv, yr(state));
    CH.queueLog(state, { k: 'repair', slot, lv: g.lv, real: real(world, state, cost), city: state.cityId });
    return { msg: `${nm} aufgearbeitet (${money(world, state, cost)}).`, level: 'good' };
  };

  A.chService = ({ world, state, input }) => {
    on(); CH.ensure(state);
    const slot = slotOf(input); if (!CH.isService(slot)) fail('Das ist ein Gegenstand, keine Dienstleistung.');
    const lv = input.level == null || input.level === 0 || input.level === '0' ? 0 : intOf(input.level);
    if (!Number.isFinite(lv) || lv < 0 || lv > 2) fail('Bitte eine Stufe von 0 bis 2 wählen.');
    const year = yr(state); const was = state.char.svc[slot] || 0;
    if (lv === 0) {
      if (!was) fail('Diese Dienstleistung ist nicht gebucht.');
      delete state.char.svc[slot];
      return { msg: `${CH.levelName(slot, was, year)} beendet.`, level: 'warn' };
    }
    if (lv === was) fail('Das hast du schon gebucht.');
    if (!CH.eraOk(slot, lv, year)) fail(`${CH.levelName(slot, lv, year)} gibt es erst ab ${CH.levelDef(slot, lv).from}.`);
    const dc = CH.dayCost(world, state, slot, lv, year);
    if (state.money < dc * 30) fail('Dafür reicht dein Geld nicht auf Dauer – eine Dienstleistung sollte für mindestens 30 Tage bezahlbar sein.');
    state.char.svc[slot] = lv;
    const nm = CH.levelName(slot, lv, year);
    CH.queueLog(state, { k: 'svc', slot, lv, real: real(world, state, dc), city: state.cityId });
    CH.checkRank(world, state, { silent: true });
    return { msg: `${nm} gebucht (${money(world, state, dc)} pro Tag).`, level: 'good' };
  };
}

const ACTIONS = ['chTrain', 'chAuto', 'chBuy', 'chSell', 'chRepair', 'chService'];
module.exports = { install, ACTIONS };
