'use strict';
/**
 * Aktionen „Betrieb 2.0“: Module bauen und zurückbauen, Mitarbeiter führen (Lob, Prämie, Betriebsfest, Geschenk, Abmahnung).
 * Rechenregeln stehen in operations.js; hier nur Prüfungen, Kosten und Meldungen. Alles läuft über service.withCharacter (eine Transaktion pro Aktion),
 * Geld verlässt nur den Spielstand des Besitzers (Privatgeld) oder geht als Bauauftrag über die vorhandene Warteschlange (pending.jobs → pending_credits, genau einmal).
 * Spieler als Angestellte (c.playerStaff) werden nie beeinflusst – sie entscheiden selbst.
 */
const OPS = require('./operations');
const TL = require('./talents');
const { formatMoney } = require('./economy');
const { chronicle } = require('./core');
const { dateOf } = require('./calendar');

const intOf = (x) => (typeof x === 'number' || (typeof x === 'string' && /^\d{1,9}$/.test(x)) ? Math.floor(Number(x)) : NaN);

function install(A, fail, { yr, pay }) {
  const company = (state, id) => { const n = intOf(id); const c = Number.isFinite(n) ? (state.companies || []).find((x) => x.id === n) : null; if (!c) fail('Unternehmen nicht gefunden.'); return c; };
  const active = (c) => { if (c.abandoned) fail('Der Betrieb steht leer. Reaktiviere ihn zuerst.'); };
  const on = () => { if (!OPS.enabled()) fail('Ausbau und Betriebsklima sind gerade ausgeschaltet.'); };
  const cur = (world, state) => world.currency(yr(state));
  const money = (world, state, cents) => formatMoney(cents, cur(world, state));
  const modKey = (input) => { const k = String(input.mod == null ? '' : input.mod); if (!OPS.KEYS.includes(k)) fail('Unbekanntes Modul.'); return k; };
  /** Mitarbeiter (NPC-Team) wählen: id, 'all' oder fail. */
  const team = (world, state, c) => { TL.syncTeam(world, state, c); return c.team || []; };
  const member = (c, id) => { const n = intOf(id); const m = Number.isFinite(n) ? (c.team || []).find((x) => x.id === n) : null; if (!m) fail('Diesen Mitarbeiter gibt es nicht (mehr).'); return m; };
  const mcd = (m) => (m.mcd && typeof m.mcd === 'object' ? m.mcd : (m.mcd = {}));
  const left = (state, m, key) => Math.max(0, (mcd(m)[key] || 0) - state.day);

  /* ---------------------------------------------------------------- Module ---------------------------------------------------------------- */
  A.opsBuild = ({ world, state, input, user }) => {
    on(); const c = company(state, input.id); active(c);
    const key = modKey(input); const lv = OPS.level(c, key);
    if (lv >= 3) fail('Das ist bereits die höchste Stufe.');
    if (input.level != null && intOf(input.level) !== lv + 1) fail('Stufen werden nacheinander gebaut.');
    const year = yr(state); const nl = lv + 1;
    if (!OPS.eraOk(key, nl, year)) fail(`${OPS.levelName(key, nl)} gibt es erst ab ${OPS.LV(key, nl).from}.`);
    if (key === 'lager' && !(require('./goods').activeRecipe(world, c.pkey, year, c.cityId).inputs || []).length) fail('Dieser Betrieb braucht keine Zutaten und lagert nichts ein.');
    const cost = OPS.upgradeCost(world, state, c, key, nl, year);
    if (state.money < cost) fail('Dafür reicht dein Geld nicht.');
    pay(state, cost);
    const idx = Math.max(0.0001, world.idx(year));
    OPS.setLevel(c, key, nl);
    c.base += Math.round(cost / idx * 0.6); // Module steigern den Wert des Betriebs
    if (key === 'lager') OPS.ops(c).stock = OPS.lagerCap(c); // der Preis enthält die erste Befüllung
    try { require('./contractors').order(state, user, world, c.cityId, cost, `Ausbau ${c.name}: ${OPS.levelName(key, nl)}`); } catch (_) { /* optional */ }
    const nm = OPS.MOD(key).name;
    chronicle(state, `${c.name}: ${nm} ausgebaut (${OPS.levelName(key, nl)}).`, 'business');
    return { msg: `${nm} ausgebaut: ${OPS.levelName(key, nl)} (${money(world, state, cost)}).`, level: 'good' };
  };

  A.opsRemove = ({ state, input }) => {
    const c = company(state, input.id);
    const key = modKey(input); const lv = OPS.level(c, key);
    if (!lv) fail('Dieses Modul ist nicht gebaut.');
    OPS.setLevel(c, key, 0);
    if (key === 'lager') OPS.ops(c).stock = 0;
    return { msg: `${OPS.MOD(key).name} zurückgebaut. Eine Erstattung gibt es nicht.`, level: 'warn' };
  };

  // Alter Schalter „Sicherheitsdienst“: bleibt als Kurzform für Schutz Stufe 1 bzw. ohne Schutz erhalten.
  A.bizSecurity = (ctx) => {
    const { state, input } = ctx; const c = company(state, input.id); active(c);
    if (input.on) {
      if (OPS.level(c, 'schutz') >= 1) return { msg: 'Der Betrieb hat bereits einen Sicherheitsdienst.', level: 'warn' };
      return A.opsBuild({ ...ctx, input: { id: c.id, mod: 'schutz' } });
    }
    OPS.setLevel(c, 'schutz', 0);
    return { msg: 'Der Sicherheitsdienst wurde abbestellt.' };
  };

  /* ---------------------------------------------------------------- Mitarbeiter führen ---------------------------------------------------------------- */
  const L = () => OPS.LEAD();

  A.bizPraise = ({ world, state, input }) => {
    on(); const c = company(state, input.id); active(c); const mem = team(world, state, c);
    if (!mem.length) fail('Es gibt niemanden, den du loben könntest.');
    const who = input.mid === 'all' ? mem : [member(c, input.mid)];
    const P = L().praise; const skill = OPS.leadSkill(state);
    const todo = who.filter((m) => left(state, m, 'praise') <= 0 && OPS.moodOf(m) < 95);
    if (!todo.length) fail(who.length === 1 ? (OPS.moodOf(who[0]) >= 95 ? `${who[0].name} ist bestens gelaunt – ein Lob wäre jetzt verschwendet.` : `${who[0].name} wurde gerade erst gelobt.`) : 'Dein Team wurde gerade erst gelobt oder ist bestens gelaunt.');
    for (const m of todo) {
      const recent = m.pr && state.day - (m.pr.d || 0) <= 30 ? m.pr.n || 0 : 0;
      OPS.bump(m, P.gain * skill * Math.pow(P.fatigue, recent));
      m.pr = { d: state.day, n: recent + 1 };
      mcd(m).praise = state.day + P.cooldown;
    }
    return { msg: todo.length === 1 ? `${todo[0].name} freut sich über dein Lob.` : 'Das Team freut sich über dein Lob.', level: 'good' };
  };

  A.bizBonus = ({ world, state, input }) => {
    on(); const c = company(state, input.id); active(c); const mem = team(world, state, c);
    if (!mem.length) fail('Es gibt niemanden, dem du eine Prämie zahlen könntest.');
    const who = input.mid === 'all' ? mem : [member(c, input.mid)];
    const B = L().bonus; const todo = who.filter((m) => left(state, m, 'bonus') <= 0);
    if (!todo.length) fail(who.length === 1 ? `${who[0].name} hat erst vor kurzem eine Prämie bekommen.` : 'Dein Team hat erst vor kurzem eine Prämie bekommen.');
    const cost = Math.round(OPS.wageDay(world, yr(state)) * B.costDays * todo.length);
    if (state.money < cost) fail('Für die Prämie reicht dein Geld nicht.');
    pay(state, cost);
    for (const m of todo) {
      const recent = m.bn && state.day - (m.bn.d || 0) <= 180 ? m.bn.n || 0 : 0;
      OPS.bump(m, B.gain * Math.pow(0.7, recent)); // wiederholte Prämien wirken weniger
      m.bn = { d: state.day, n: recent + 1 };
      mcd(m).bonus = state.day + B.cooldown;
    }
    return { msg: todo.length === 1 ? `${todo[0].name} bekommt eine Prämie (${money(world, state, cost)}).` : `Das Team bekommt eine Prämie (${money(world, state, cost)}).`, level: 'good' };
  };

  A.bizParty = ({ world, state, input }) => {
    on(); const c = company(state, input.id); active(c); const mem = team(world, state, c);
    if (!mem.length) fail('Ohne Mitarbeiter gibt es nichts zu feiern.');
    const Pa = L().party; const o = OPS.ops(c); o.cd = o.cd && typeof o.cd === 'object' ? o.cd : {};
    if ((o.cd.party || 0) > state.day) fail(`Das letzte Betriebsfest ist noch nicht lange her (noch ${o.cd.party - state.day} Tage).`);
    const doy = dateOf(state.day, state.startYear).doy; const xmas = doy >= 334 || doy < 3;
    const cost = Math.round(OPS.wageDay(world, yr(state)) * (Pa.baseDays + Pa.costDays * mem.length));
    if (state.money < cost) fail('Für das Fest reicht dein Geld nicht.');
    pay(state, cost);
    for (const m of mem) OPS.bump(m, Pa.gain * (xmas ? Pa.christmas : 1));
    o.cd.party = state.day + Pa.cooldown;
    return { msg: `${xmas ? 'Weihnachtsfeier' : 'Betriebsfest'} in ${c.name}: Die Stimmung steigt (${money(world, state, cost)}).`, level: 'good' };
  };

  A.bizGift = ({ world, state, input }) => {
    on(); const c = company(state, input.id); active(c); team(world, state, c);
    const m = member(c, input.mid); const G = L().gift;
    if (left(state, m, 'gift') > 0) fail(`${m.name} hat erst vor kurzem ein Geschenk bekommen.`);
    const cost = Math.round(OPS.wageDay(world, yr(state)) * G.costDays);
    if (state.money < cost) fail('Für das Geschenk reicht dein Geld nicht.');
    pay(state, cost);
    OPS.bump(m, G.gain);
    mcd(m).gift = state.day + G.cooldown;
    return { msg: `${m.name} freut sich über das Geschenk (${money(world, state, cost)}).`, level: 'good' };
  };

  A.bizWarn = ({ world, state, input }) => {
    on(); const c = company(state, input.id); active(c); const mem = team(world, state, c);
    const m = member(c, input.mid); const W = L().warn; const K = OPS.K();
    if (left(state, m, 'warn') > 0) fail(`${m.name} hat bereits eine Abmahnung bekommen.`);
    mcd(m).warn = state.day + W.cooldown;
    m.mood = OPS.r2(Math.max(0, OPS.moodOf(m) - W.loss));
    for (const x of mem) if (x !== m) x.mood = OPS.r2(Math.max(0, OPS.moodOf(x) - W.others));
    const o = OPS.ops(c);
    o.fear = (Array.isArray(o.fear) ? o.fear.filter((u) => u > state.day) : []).concat(state.day + K.fearDays).slice(-3);
    o.push = { until: state.day + W.pushDays, pct: W.push };
    o.warns = (Array.isArray(o.warns) ? o.warns.filter((d) => state.day - d <= W.repeatDays) : []).concat(state.day).slice(-6);
    let note = '';
    if (o.warns.length >= 2) { require('./reputation').queue(state, 'scandal', null, 'staff_pressure', `c${c.id}`); note = ' Wer oft abmahnt, gilt als Chef, der Druck macht – das kostet Ansehen.'; }
    return { msg: `${m.name} wurde abgemahnt. Kurzfristig steigt die Leistung, doch die Stimmung im Team sinkt.${note}`, level: 'warn' };
  };
}

const ACTIONS = ['opsBuild', 'opsRemove', 'bizPraise', 'bizBonus', 'bizParty', 'bizGift', 'bizWarn', 'bizSecurity'];
module.exports = { install, ACTIONS };
