'use strict';
/**
 * Bots in der Gesellschaft (mild): treten Vereinen und Gemeinden bei, gründen selten einen Verein, richten Feste aus, spenden kleine Beträge
 * und stiften – reiche Bots – gelegentlich eine Stiftung. Sie nutzen dieselben Funktionen wie Spieler (gleiche Prüfungen, gleiche Grenzen),
 * ihr Verhalten ist von Spielern nicht zu unterscheiden. Eine Veruntreuung kommt nur sehr selten vor (bots.embezzle, 0 = nie).
 */
const db = require('../db');
const service = require('../game/service');
const M = require('../game/civic');
const Clubs = require('./civic-clubs');
const Parish = require('./civic-parish');
const Found = require('./civic-foundation');
const K = require('./civic-core');

const WORDS = {
  sport: [['TSV', 'SV', 'FC', 'Turnverein', 'Sportfreunde'], ['Eintracht', 'Frisch Auf', 'Germania', 'Union', 'Blau-Weiß']],
  kultur: [['Gesangverein', 'Musikverein', 'Theaterverein', 'Heimatverein', 'Chor'], ['Frohsinn', 'Harmonie', 'Lyra', 'Concordia', 'Liederkranz']],
  handwerk: [['Handwerkerverein', 'Gewerbeverein', 'Innung', 'Handwerkerbund'], ['Eintracht', 'Fortschritt', 'Gutes Handwerk', 'Zukunft']],
  wohltat: [['Hilfsverein', 'Wohltätigkeitsverein', 'Förderkreis', 'Nachbarschaftshilfe'], ['Miteinander', 'Hand in Hand', 'Lichtblick', 'Nächstenliebe']],
};
const FOUNDATIONS = [['Stiftung', ['Zukunft', 'Gemeinsinn', 'Lichtblick', 'Wegweiser', 'Heimat']], ['Bürgerstiftung', ['Stadt', 'Nachbarn', 'Zusammen']]];
const pick = (a, rnd) => a[Math.floor(rnd() * a.length) % a.length];

async function botRound(userId, rnd = Math.random) {
  if (!M.enabled()) return;
  const B = (M.C().bots) || {}; if (B.enabled === false) return;
  const p = await service.peek(userId); if (!p || !p.state || p.state.status !== 'alive') return;
  const { w: world, state } = p; if (state.day < 40) return;
  const idx = K.idxOf(world, state); const city = world.city(state.cityId);
  const mine = await db.query("SELECT m.club_id id, m.role, c.treasury_real, c.kind, c.name, (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id) members FROM club_members m JOIN clubs c ON c.id = m.club_id AND c.status = 'active' WHERE m.user_id = ?", [userId]);
  const small = (frac, cap) => Math.max(1, Math.floor(Math.min(state.money * frac, cap * idx))) / 100; // Betrag in Hauptwährung
  if (M.clubsOn()) {
    if (!mine.length && rnd() < num(B.join, 0.05)) {
      const list = await db.query("SELECT c.id, (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id) members, c.fee_real FROM clubs c WHERE c.city_id = ? AND c.status = 'active' ORDER BY members DESC LIMIT 8", [state.cityId]);
      const ok = list.filter((c) => Number(c.members) < num(M.C().clubs.maxMembers, 60) && Number(c.fee_real) * idx < state.money * 0.2);
      if (ok.length) { try { await Clubs.join(userId, pick(ok.slice(0, 4), rnd).id); } catch (_) { /* Regeln */ } return; }
    }
    if (!mine.length && rnd() < num(B.found, 0.012) && state.money > num(M.C().clubs.foundFeeReal, 4000) * idx * 25) {
      const kind = pick(M.kinds(), rnd); const w = WORDS[kind.key] || WORDS.kultur;
      const name = `${pick(w[0], rnd)} ${pick(w[1], rnd)}${city && rnd() < 0.4 ? ` ${city.name.split(' ')[0]}` : ''}`;
      try { await Clubs.found(userId, { kind: kind.key, name, fee: (num(M.C().clubs.feeDefaultReal, 1200) * idx * (0.5 + rnd())) / 100 }); } catch (_) { /* Name vergeben, Geld */ }
      return;
    }
    for (const c of mine) {
      if (['president', 'board'].includes(c.role) && c.members >= 3 && rnd() < num(B.event, 0.05)) { try { await Clubs.event(userId, c.id); } catch (_) { /* Kasse, Wartezeit */ } }
      if (c.role === 'president' && c.members >= 3 && Number(c.treasury_real) > 4000 && num(B.embezzle, 0) > 0 && rnd() < num(B.embezzle, 0.002)) {
        try { await Clubs.withdraw(userId, c.id, { amount: (Number(c.treasury_real) * 0.08 * idx) / 100, confirm: true }); } catch (_) { /* Regeln */ }
      }
    }
    if (mine.length && rnd() < num(B.donate, 0.03) && state.money > 3000 * idx) { try { await Clubs.donate(userId, pick(mine, rnd).id, { amount: small(0.01, 600) }); } catch (_) { /* Limits */ } }
  }
  if (M.parishOn()) {
    const pm = await Parish.myRow(db, userId);
    if (!pm && rnd() < num(B.parish, 0.04)) { try { await Parish.join(userId, pick(M.faiths().filter((f) => ['evangelisch', 'katholisch', 'frei'].includes(f.key) || rnd() < 0.3), rnd).key); } catch (_) { /* Regeln */ } }
    else if (pm && rnd() < num(B.donate, 0.03) && state.money > 2000 * idx) { try { await Parish.donate(userId, { amount: small(0.01, 500) }); } catch (_) { /* Limits */ } }
    else if (pm && rnd() < 0.02) { try { await Parish.aid(userId); } catch (_) { /* nicht in Not */ } }
  }
  if (M.foundationOn() && rnd() < num(B.foundation, 0.004)) {
    const fo = await Found.myFoundation(db, userId);
    const need = (M.minCapital() + num(M.C().foundation.foundFeeReal, 20000)) * idx;
    if (!fo && state.money > need * 2.5) {
      const nm = pick(FOUNDATIONS, rnd); const purposes = M.purposes().filter((x) => !x.family);
      try { await Found.found(userId, { name: `${nm[0]} ${pick(nm[1], rnd)}`, purpose: pick(purposes, rnd).key, amount: (M.minCapital() * idx * (1 + rnd())) / 100 }); } catch (_) { /* Ansehen, Regeln */ }
    } else if (fo && state.money > M.C().foundation.giveMinReal * idx * 6) { try { await Found.give(userId, { amount: (M.C().foundation.giveMinReal * idx * (1 + rnd() * 3)) / 100 }); } catch (_) { /* Regeln */ } }
  }
}
function num(v, d) { return Number.isFinite(Number(v)) ? Number(v) : d; }

module.exports = { botRound };
