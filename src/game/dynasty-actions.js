'use strict';
/**
 * Aktionen „Werben, Ehe und Familienunternehmen“: Kennenlernen und Werben (Verlauf statt Einmalwurf), Antrittsbesuch, Antrag, Hochzeit mit Ehevertrag und Eheringen,
 * Scheidung mit Trennungsjahr, Einarbeitung der Kinder im Familienbetrieb, Übergabe zu Lebzeiten. Rechenregeln stehen in dynasty.js; hier nur Eingabeprüfung,
 * Kosten und Meldungen. Alles läuft über service.withCharacter (eine Transaktion pro Aktion); Geld verlässt nur den Spielstand der Spielfigur
 * (Hochzeit, Notar, Ringe, Steuer, Gebühren) oder kommt als Aussteuer genau einmal hinein. Protokoll-Einträge wandern beim Speichern aus der Vormerkung
 * (state.pending.dyn) in die Datenbank (src/lib/dynasty.js).
 */
const DYN = require('./dynasty');
const { formatMoney, scale } = require('./economy');
const { chronicle, award, clamp } = require('./core');
const press = require('./press');
const { resolveListing } = require('./newspaper');
const biz = require('./business');

const intOf = (x) => (typeof x === 'number' && Number.isInteger(x)) || (typeof x === 'string' && /^\d{1,9}$/.test(x)) ? Number(x) : NaN;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const idOf = (x) => (typeof x === 'string' && /^[A-Za-z0-9:_-]{1,40}$/.test(x) ? x : '');

function install(A, fail, { yr, pay }) {
  const on = () => { if (!DYN.enabled()) fail('Das Werben und die Familienplanung sind gerade ausgeschaltet.'); };
  const cur = (world, state) => world.currency(yr(state));
  const money = (world, state, cents) => formatMoney(cents, cur(world, state));
  const entry = (state, input) => { DYN.ensure(state); const id = idOf(input && input.id); const e = id && own(state.fam.woo, id) ? state.fam.woo[id] : null; if (!e) fail('Diese Bekanntschaft gibt es nicht (mehr).'); return e; };
  const child = (state, id) => { const n = intOf(id); const c = Number.isFinite(n) ? state.children.find((x) => x.id === n) : null; if (!c) fail('Kind nicht gefunden.'); return c; };
  const firm = (state, id) => { const n = intOf(id); const c = Number.isFinite(n) ? (state.companies || []).find((x) => x.id === n) : null; if (!c) fail('Unternehmen nicht gefunden.'); return c; };

  /* ---------------------------------------------------------------- Kennenlernen und Werben ---------------------------------------------------------------- */
  const legacyMeet = A.meet;
  A.meet = (ctx) => {
    if (!DYN.enabled()) return legacyMeet(ctx);
    const { world, state, input } = ctx;
    const l = resolveListing(world, state, input.listingId);
    if (!l || l.type !== 'partner') fail('Diese Anzeige ist nicht mehr aktuell.');
    if (l.cityId !== state.cityId) fail('Die Person wohnt in einer anderen Stadt.');
    const b = DYN.meetBlock(state, l); if (b) fail(b);
    const c0 = Math.round(DYN.num(DYN.W().meetCost, 1) * scale(world.econ.giftCost, world.idx(yr(state))));
    if (state.money < c0) fail('Für ein erstes Treffen fehlt dir das Geld.');
    pay(state, c0);
    const e = DYN.start(world, state, l);
    chronicle(state, `${state.person.first} lernt ${e.name} kennen.`, 'family');
    return { msg: `Ihr habt euch kennengelernt: ${DYN.nameOf(e.name)}. Pflege die Bekanntschaft unter „Familie“ – Treffen, Briefe und Gespräche lassen die Sympathie wachsen.`, level: 'good' };
  };

  A.wooAct = ({ world, state, input }) => {
    on(); const e = entry(state, input);
    const raw = String(input.act == null ? '' : input.act);
    const key = raw === 'best' ? DYN.bestAct(world, state, e) : raw;
    if (!key) fail('Gerade lässt sich nichts unternehmen – warte ein paar Tage.');
    if (!own(DYN.ACTS(), key)) fail('Das kennt hier niemand.');
    const b = DYN.actBlock(world, state, e, key); if (b) fail(b);
    const cost = DYN.actCostCents(world, state, key); if (cost > 0) pay(state, cost);
    const had = e.known.length;
    const r = DYN.act(world, state, e, key);
    const f = DYN.nameOf(e.name); const d = r.delta >= 0 ? `+${r.delta}` : `${r.delta}`;
    let msg = r.kind === 'hit' ? (r.liked ? `${f} strahlt – das war genau das Richtige. Sympathie ${d}.` : `${f} freut sich über die Mühe. Sympathie ${d}.`)
      : r.kind === 'mid' ? `${f} lächelt höflich – nett, aber nicht mehr. Sympathie ${d}.` : `Das kam bei ${f} nicht gut an. Sympathie ${d}.`;
    const out = { msg, level: r.kind === 'miss' ? 'warn' : 'good' };
    if (e.known.length > had) out.msg += ` ${f} mag: ${DYN.LIKES()[DYN.ACTS()[key].tag]}.`;
    if (r.hurt.length) out.msg += ` ${r.hurt[0].split(' ')[0]} hört davon und ist ein wenig enttäuscht.`;
    return out;
  };

  A.wooVisit = ({ world, state, input }) => {
    on(); const e = entry(state, input);
    const b = DYN.visitBlock(world, state, e); if (b) fail(b);
    const V = DYN.W().visit; pay(state, Math.round(V.cost * world.econ.giftCost * world.idx(yr(state))));
    e.visited = true; e.sym = DYN.r1(clamp(e.sym + Number(V.sym || 0), 0, 100)); e.last = state.day; e.n++;
    const fam = DYN.FAMILY().classes[e.cls].name;
    return { msg: `Antrittsbesuch bei der Familie von ${DYN.nameOf(e.name)}: ${fam}. Die Familie lernt dich kennen.`, level: 'good' };
  };

  A.wooAsk = ({ world, state, input }) => {
    on(); const e = entry(state, input);
    const b = DYN.askBlock(world, state, e); if (b) fail(b);
    const { p, op } = DYN.askChance(world, state, e);
    const r = require('./rng').rngFor('woo-ask', state.seed, e.id, e.tries)();
    const f = DYN.nameOf(e.name);
    if (r < p) {
      DYN.makePartner(world, state, e, op);
      award(state, 'partner');
      chronicle(state, `${state.person.first} und ${e.name} werden ein Paar.`, 'family');
      press.story(world, state, 'couple', { partner: e.name });
      return { msg: `Ihr seid jetzt ein Paar: ${e.name}.`, level: 'good' };
    }
    const A_ = DYN.W().ask; e.tries++; e.sym = DYN.r1(Math.max(0, e.sym + Number(A_.failSym || -8))); e.askAt = state.day + Number(A_.cooldown || 10); e.last = state.day;
    if (e.tries >= Number(A_.maxFails || 2)) {
      DYN.drop(state, e.id);
      return { msg: `${f} möchte lieber Freunde bleiben. Die Bekanntschaft endet.`, level: 'warn' };
    }
    return { msg: `${f} braucht noch Zeit. Versuche es später noch einmal.`, level: 'warn' };
  };

  A.wooDrop = ({ state, input }) => {
    on(); const e = entry(state, input);
    DYN.drop(state, e.id);
    return { msg: `Du beendest den Kontakt zu ${DYN.nameOf(e.name)}.`, level: 'warn' };
  };

  /* ---------------------------------------------------------------- Hochzeit mit Ehevertrag und Ringen ---------------------------------------------------------------- */
  const legacyMarry = A.marry;
  A.marry = (ctx) => {
    if (!DYN.enabled()) return legacyMarry(ctx);
    const { world, state, input } = ctx; DYN.ensure(state);
    const p = state.partner;
    if (!p) fail('Du hast keinen Partner.');
    if (p.linked) fail('Mit einem Spieler heiratest du über „Spieler → Beziehung“.');
    if (p.married) fail('Ihr seid bereits verheiratet.');
    if (p.gender === state.person.gender) fail('Eine Ehe gibt es nur zwischen Mann und Frau.');
    const kind = input.contract == null || input.contract === '' ? 'zugewinn' : String(input.contract);
    const K = own(DYN.KINDS(), kind) ? DYN.KINDS()[kind] : null; if (!K) fail('Diesen Ehevertrag gibt es nicht.');
    const ring = input.ring == null || input.ring === '' ? 0 : intOf(input.ring);
    if (!Number.isFinite(ring) || ring < 0 || ring > 3) fail('Bitte Eheringe von Stufe 0 bis 3 wählen.');
    const idx = world.idx(yr(state));
    const wedding = scale(world.econ.marriageCost, idx); const notary = Math.round(K.notaryMult * wedding); const rp = ring ? DYN.ringPrice(world, state, ring) : 0;
    if (state.money < wedding + notary + rp) fail(rp || notary ? 'Hochzeit, Notar und Ringe können wir uns noch nicht leisten.' : 'Die Hochzeit können wir uns noch nicht leisten.');
    pay(state, wedding + notary + rp);
    p.married = true; p.sat = clamp(p.sat + 15, 0, 100);
    award(state, 'partner');
    const res = DYN.wed(world, state, kind, ring, rp);
    chronicle(state, `${state.person.first} heiratet ${p.name}.`, 'family');
    press.story(world, state, 'marriage', { partner: p.name });
    try { require('./character').checkRank(world, state, { silent: true }); } catch (_) { /* optional */ }
    const f = DYN.nameOf(p.name); const d = res.dow;
    let msg = 'Ihr habt geheiratet!';
    if (d.real > 0 && d.form === 'firm') msg = `Ihr habt geheiratet! Die Familie von ${f} bringt den Familienbetrieb „${(state.companies.find((x) => x.id === d.firm) || {}).name}“ ein.`;
    else if (d.real > 0 && d.form === 'home') msg = `Ihr habt geheiratet! Die Familie von ${f} schenkt euch ${(state.properties.find((x) => x.id === d.home) || {}).name}.`;
    else if (d.real > 0) msg = `Ihr habt geheiratet! Die Familie von ${f} bringt ${money(world, state, Math.round(d.cash * idx))} als Aussteuer ein.`;
    return { msg, level: 'good' };
  };

  /* ---------------------------------------------------------------- Scheidung ---------------------------------------------------------------- */
  A.divorce = ({ world, state }) => {
    on(); DYN.ensure(state);
    const p = state.partner;
    if (!p) fail('Du hast keinen Partner.');
    if (p.linked) fail('Mit einem Spieler lässt du dich über „Spieler → Beziehung“ scheiden.');
    if (!p.married) fail('Ihr seid nicht verheiratet.');
    if (state.pending.divorce) fail('Der Scheidungsantrag läuft bereits.');
    const Dv = (DYN.C().contract || {}).divorce || { waitDays: 365, costMult: 1.5 };
    const cost = Math.round(Dv.costMult * scale(world.econ.marriageCost, world.idx(yr(state))));
    if (state.money < cost) fail('Die Verfahrenskosten (Anwalt und Gericht) kannst du dir noch nicht leisten.');
    pay(state, cost);
    state.pending.divorce = { day: state.day + Number(Dv.waitDays || 365), filed: state.day };
    chronicle(state, `${state.person.first} und ${p.name} trennen sich und beantragen die Scheidung.`, 'family');
    return { msg: `Der Scheidungsantrag ist gestellt. Nach dem Trennungsjahr (${Math.round(Dv.waitDays || 365)} Tage) wird die Ehe geschieden.`, level: 'warn' };
  };
  A.divorceCancel = ({ state }) => {
    if (!state.pending.divorce) fail('Es läuft kein Scheidungsantrag.');
    delete state.pending.divorce;
    return { msg: 'Der Scheidungsantrag wurde zurückgezogen (die Verfahrenskosten sind verloren).', level: 'good' };
  };

  /* ---------------------------------------------------------------- Kinder im Familienbetrieb ---------------------------------------------------------------- */
  A.famGroom = ({ world, state, input }) => {
    on(); DYN.ensure(state);
    const c = child(state, input.childId); const f = firm(state, input.id);
    const b = DYN.groomBlock(world, state, c, f); if (b) fail(b);
    const g = DYN.groomStart(world, state, c, f);
    const first = c.name.split(' ')[0];
    chronicle(state, `${c.name} beginnt im Familienbetrieb „${f.name}“.`, 'family');
    return { msg: g.kind === 'lehre' ? `${first} beginnt eine Lehre im Familienbetrieb „${f.name}“.` : `${first} arbeitet ab jetzt im Familienbetrieb „${f.name}“ mit.`, level: 'good' };
  };
  A.famGroomEnd = ({ state, input }) => {
    on(); const c = child(state, input.childId);
    if (!c.groom) fail('Dieses Kind wird nicht eingearbeitet.');
    delete c.groom;
    return { msg: `${c.name.split(' ')[0]} arbeitet nicht mehr im Familienbetrieb mit.`, level: 'warn' };
  };

  A.famHandover = ({ world, state, input }) => {
    on(); DYN.ensure(state);
    const c = child(state, input.childId); const f = firm(state, input.id);
    const b = DYN.handoverBlock(world, state, c, f); if (b) fail(b);
    const costs = DYN.handoverCosts(world, state, biz.companyValue(world, state, f, yr(state)) + f.cash);
    if (state.money < costs.tax + costs.fee) fail('Steuer und Gebühren der Übergabe kannst du dir noch nicht leisten.');
    pay(state, costs.tax + costs.fee);
    const worked = !!(state.occupation && state.occupation.ownCompanyId === f.id);
    DYN.doHandover(world, state, c, f, costs);
    chronicle(state, `${state.person.first} übergibt „${f.name}“ an ${c.name}.`, 'business');
    require('./reputation').queue(state, 'civic', 1.5, 'fam_succession', f.id);
    const first = c.name.split(' ')[0];
    return { msg: `„${f.name}“ gehört jetzt ${first}. Steuer ${money(world, state, costs.tax)}, Gebühren ${money(world, state, costs.fee)}.${worked ? ' Du bist jetzt im Ruhestand.' : ''}`, level: 'good' };
  };
}

const ACTIONS = ['wooAct', 'wooVisit', 'wooAsk', 'wooDrop', 'divorce', 'divorceCancel', 'famGroom', 'famGroomEnd', 'famHandover'];
module.exports = { install, ACTIONS };
