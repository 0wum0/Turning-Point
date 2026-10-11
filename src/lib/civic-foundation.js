'use strict';
/**
 * Stiftungen: Vermögen einbringen (dauerhaft gebunden), Ertrag und Ausschüttung je Zeitraum, Gemeinwohl-Topf der Stadt, Ruf-Gewinn, Erbschaft und Dynastie.
 *
 * Die Stiftung gehört dem Konto (der Familie) und überlebt jeden Charakter: Der Erbe führt sie weiter, ein Vermächtnis (Prozent des Nachlasses) fließt hinein.
 * Ausschüttungen buchen genau einmal: Der Abrechnungsschritt liest die Zeile unter Sperre (`FOR UPDATE`), rechnet den Zeitraum, schreibt Kapital und
 * Zeitstempel und bucht die Auszahlung in derselben Transaktion – Gemeinwohl-Topf der Stadt oder, bei Familienstiftungen, eine Gutschrift an den Besitzer.
 */
const db = require('../db');
const log = require('./log');
const live = require('./live');
const service = require('../game/service');
const M = require('../game/civic');
const RP = require('../game/reputation');
const social = require('./social');
const tagesblatt = require('./tagesblatt');
const K = require('./civic-core');
const { notice, chronicle } = require('../game/core');

const { fail, num, HOUR } = K;
const cfg = () => M.C().foundation || {};
const refresh = (...a) => require('./civic').refresh(...a);
const myFoundation = (conn, userId, lock = false) => conn.one(`SELECT * FROM foundations WHERE user_id = ? AND status = 'active'${lock ? ' FOR UPDATE' : ''}`, [userId]);
const repDelta = (real) => Math.min(6, Math.max(1, num((cfg().rep || {}).give, 3) * (0.5 + 0.5 * Math.log10(1 + real / 100000))));

async function found(userId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const F = cfg();
    await K.guard(userId, state, 'foundation', { minDays: false }); await K.notJailed(userId);
    if (state.day < num(F.minGameDays, 60)) fail(`Eine Stiftung gründest du ab ${num(F.minGameDays, 60)} Spieltagen.`);
    const blk = RP.block(RP.stand(state).lv, num(F.minLevel, 1)); if (blk) fail(blk);
    if (await myFoundation(conn, userId, true)) fail('Deine Familie hat schon eine Stiftung.');
    await conn.query("DELETE FROM foundations WHERE user_id = ? AND status <> 'active'", [userId]);
    const pu = M.purposeOf(String(input.purpose || '')); if (!pu) fail('Bitte einen Zweck wählen.');
    const nm = M.cleanName(input.name, num(F.nameMin, 3), num(F.nameMax, 40)); if (!nm.ok) fail(nm.err);
    if (social.mask(nm.name) !== nm.name || social.hasLink(nm.name)) fail('Dieser Name ist nicht erlaubt.');
    const idx = K.idxOf(world, state); const cents = K.centsFrom(input.amount); if (cents == null) fail('Bitte das Gründungsvermögen angeben.');
    const real = cents / idx; const minC = M.minCapital();
    if (real < minC - 1e-9) fail(`Eine Stiftung braucht mindestens ${K.money(Math.ceil(minC * idx), world, state)} Gründungsvermögen.`);
    const fee = Math.round(num(F.foundFeeReal, 20000) * idx);
    if (state.money < cents + fee) fail(`Du brauchst ${K.money(cents + fee, world, state)}: Vermögen plus ${K.money(fee, world, state)} für Genehmigung und Satzung.`);
    const now = Date.now(); const pct = M.clampPayout(input.payoutPct);
    const r = await conn.query('INSERT INTO foundations (user_id, city_id, name, purpose, capital_real, contributed_real, payout_pct, founded_ms, tick_ms, lock_ms, generation) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [userId, state.cityId, nm.name, pu.key, real, real, pct, now, now, now + num(F.lockHours, 720) * HOUR, state.generation || 1]);
    state.money -= cents + fee; state.stats.spent += fee; // das eingebrachte Vermögen bleibt in der Familie gebunden, nur die Gebühr ist weg
    await K.addUserSum(conn, userId, 'contributed_real', real);
    await K.foundBook(conn, r.insertId, userId, 'found', real, 'gegründet');
    RP.queue(state, 'civic', repDelta(real), 'foundation_give', `f${r.insertId}`);
    const city = (world.city(state.cityId) || {}).name || 'der Stadt';
    chronicle(state, `${state.person.first} gründet die Stiftung „${nm.name}“ (${pu.name}).`, 'society');
    notice(state, { level: 'good', title: `Stiftung gegründet: ${nm.name}`, tab: 'society', text: pu.family ? 'Dein Vermögen ist gebunden und zahlt der Familie jährlich einen Teil aus.' : 'Dein Vermögen ist gebunden und fördert dauerhaft das Gemeinwohl deiner Stadt.', info: ['Das Kapital bleibt erhalten und wächst mit einem kleinen Ertrag; ein Teil davon wird ausgeschüttet.', 'Die Stiftung gehört deiner Familie: Dein Erbe führt sie weiter, ein Vermächtnis aus dem Nachlass kann sie vergrößern.', 'Wer viel einbringt, trägt den Titel „Stifter“.'] });
    const who = ctx.user.social_public ? `${state.person.first} ${state.person.last}` : 'Eine Bürgerfamilie';
    await tagesblatt.post('life', 'Neue Stiftung', `${who} gründet in ${city} die Stiftung „${nm.name}“: ${pu.name}.`, state.cityId, conn);
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `Die Stiftung „${nm.name}“ ist gegründet.`, level: 'good', id: r.insertId };
  }, { needAlive: true });
}

async function give(userId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const F = cfg();
    await K.guard(userId, state, 'foundation', { minDays: false }); await K.notJailed(userId);
    const f = await myFoundation(conn, userId, true); if (!f) fail('Ihr habt noch keine Stiftung.');
    const idx = K.idxOf(world, state); const cents = K.centsFrom(input.amount); if (cents == null) fail('Bitte einen Betrag angeben.');
    const real = cents / idx;
    if (real < num(F.giveMinReal, 50000) - 1e-9) fail(`Zustiftungen beginnen bei ${K.money(Math.ceil(num(F.giveMinReal, 50000) * idx), world, state)}.`);
    if (state.money < cents) fail('Dafür reicht dein Geld nicht.');
    state.money -= cents;
    await conn.query('UPDATE foundations SET capital_real = capital_real + ?, contributed_real = contributed_real + ?, lock_ms = ? WHERE id = ?', [real, real, Date.now() + num(F.lockHours, 720) * HOUR, f.id]);
    await K.addUserSum(conn, userId, 'contributed_real', real);
    await K.foundBook(conn, f.id, userId, 'give', real, 'Zustiftung');
    RP.queue(state, 'civic', repDelta(real), 'foundation_give', `f${f.id}`);
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `${K.money(cents, world, state)} sind jetzt Teil des Stiftungsvermögens von „${f.name}“.`, level: 'good' };
  }, { needAlive: true });
}

async function set(userId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx;
    const f = await myFoundation(conn, userId, true); if (!f) fail('Ihr habt noch keine Stiftung.');
    const pct = M.clampPayout(input.payoutPct);
    let name = f.name;
    if (input.name != null && String(input.name).trim() && String(input.name).trim() !== f.name) {
      const nm = M.cleanName(input.name, num(cfg().nameMin, 3), num(cfg().nameMax, 40)); if (!nm.ok) fail(nm.err);
      if (social.mask(nm.name) !== nm.name || social.hasLink(nm.name)) fail('Dieser Name ist nicht erlaubt.');
      name = nm.name;
    }
    await conn.query('UPDATE foundations SET payout_pct = ?, name = ? WHERE id = ?', [pct, name, f.id]);
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `Die Stiftung schüttet künftig ${String(pct).replace('.', ',')} % ihres Vermögens im Jahr aus.`, level: 'good' };
  }, { needAlive: true });
}

/** Vermächtnis: so viel Prozent des Bargelds im Nachlass gehen beim Tod an die Stiftung (nur Spielstand; gebucht wird beim Erbfall). */
async function will(userId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx;
    const f = await myFoundation(conn, userId, false); if (!f) fail('Ein Vermächtnis braucht eine Stiftung.');
    const pct = Math.max(0, Math.min(num(cfg().willMaxPct, 30), Math.round(num(input.pct, 0))));
    M.ensure(state).will = pct;
    await refresh(conn, ctx.user, state, world);
    return { msg: pct ? `Beim Tod gehen ${pct} % deines Bargelds an die Stiftung „${f.name}“.` : 'Das Vermächtnis ist zurückgenommen.', level: 'good' };
  }, { needAlive: true });
}

async function dissolve(userId) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const F = cfg();
    await K.notJailed(userId);
    const f = await myFoundation(conn, userId, true); if (!f) fail('Ihr habt keine Stiftung.');
    const wait = Number(f.lock_ms) - Date.now();
    if (wait > 0) fail(`Das Vermögen ist noch gebunden: Eine Auflösung ist in ${Math.ceil(wait / HOUR)} Stunden möglich.`);
    const idx = K.idxOf(world, state); const back = Number(f.capital_real) * (1 - num(F.dissolveFeePct, 10) / 100);
    const r = await conn.query("DELETE FROM foundations WHERE id = ? AND status = 'active'", [f.id]);
    if (!r || !r.affectedRows) fail('Die Stiftung gibt es nicht mehr.');
    const cents = Math.round(back * idx);
    state.money += cents;
    await K.addUserSum(conn, userId, 'contributed_real', -Number(f.capital_real)); // zurückgenommenes Vermögen zählt nicht mehr für den Titel
    M.ensure(state).will = 0;
    chronicle(state, `${state.person.first} löst die Stiftung „${f.name}“ auf.`, 'society');
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `Die Stiftung „${f.name}“ ist aufgelöst. ${K.money(cents, world, state)} gehen zurück an dich (abzüglich ${num(F.dissolveFeePct, 10)} % Kosten).`, level: 'warn' };
  }, { needAlive: true });
}

/** Vermächtnis beim Erbfall in derselben Transaktion buchen; verringert old.money. Gibt den Betrag in Real zurück. */
async function applyWill(conn, userId, old, world) {
  const fl = M.ensure(old); if (!(fl.will > 0)) return 0;
  const f = await myFoundation(conn, userId, true); if (!f) return 0;
  const cents = M.bequest(old.money, fl.will); if (cents <= 0) return 0;
  const idx = K.idxOf(world, old); const real = cents / idx;
  old.money -= cents;
  await conn.query('UPDATE foundations SET capital_real = capital_real + ?, contributed_real = contributed_real + ?, lock_ms = ? WHERE id = ?', [real, real, Date.now() + num(cfg().lockHours, 720) * HOUR, f.id]);
  await K.addUserSum(conn, userId, 'contributed_real', real);
  await K.foundBook(conn, f.id, userId, 'will', real, 'Vermächtnis aus dem Nachlass');
  return real;
}

/* ================================================================================================================================================
   Abrechnung (Zeitgeber)
   ================================================================================================================================================ */
/** Eine Stiftung abrechnen. Gibt { periods, payout, income } zurück oder null. Genau einmal je Zeitraum (Sperre + Zeitstempel in einer Transaktion). */
async function tickOne(id, now = Date.now()) {
  const after = []; let out = null; let owner = null; let city = 0; let purpose = ''; let first = false; let nm = '';
  await db.tx(async (conn) => {
    conn.civicAfter = after;
    const f = await conn.one("SELECT * FROM foundations WHERE id = ? AND status = 'active' FOR UPDATE", [id]);
    if (!f) return;
    const r = M.foundationTick({ capital: Number(f.capital_real), payoutPct: Number(f.payout_pct), lastMs: Number(f.tick_ms) }, now);
    if (!r.periods) return;
    await conn.query('UPDATE foundations SET capital_real = ?, paid_real = paid_real + ?, tick_ms = ? WHERE id = ?', [r.capital, r.payout, r.nextMs, f.id]);
    const pu = M.purposeOf(f.purpose) || {};
    if (r.payout > 0) {
      if (pu.family) await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text) VALUES (?,?, 'foundation', ?)", [f.user_id, r.payout, `Ausschüttung der Familienstiftung „${f.name}“.`]);
      else await K.potAdd(conn, f.city_id, f.purpose, r.payout);
      await K.foundBook(conn, f.id, null, 'payout', r.payout, pu.family ? 'an die Familie ausgeschüttet' : `für ${pu.name || f.purpose}`);
    }
    out = { periods: r.periods, payout: r.payout, income: r.income }; owner = f.user_id; city = f.city_id; purpose = f.purpose; first = Number(f.paid_real) === 0 && r.payout > 0; nm = f.name;
  });
  for (const fn of after) { try { await fn(); } catch (e) { log.warn(`[stiftung] ${e.message}`); } }
  if (out && out.payout > 0) {
    live.publish('civic', {}, owner);
    const pu = M.purposeOf(purpose) || {};
    if (!pu.family) await require('./reputation').add(owner, 'civic', null, 'foundation_pay', `f${id}`, { cityId: city });
    if (first) { const u = await db.one('SELECT social_public FROM users WHERE id = ?', [owner]); if (!pu.family) await tagesblatt.post('life', 'Stiftung hilft', `Die Stiftung „${nm}“ schüttet erstmals aus: ${pu.name}.`, city); void u; }
  }
  return out;
}
async function tick(now = Date.now()) {
  if (!M.foundationOn()) return 0;
  const iv = Math.max(1, num(cfg().tickHours, 24)) * HOUR;
  const due = await db.query("SELECT id FROM foundations WHERE status = 'active' AND tick_ms <= ? ORDER BY tick_ms LIMIT 100", [now - iv]);
  let n = 0;
  for (const d of due) { try { if (await tickOne(d.id, now)) n++; } catch (e) { log.warn(`[stiftung] Abrechnung ${d.id}: ${e.message}`); } }
  return n;
}

/* ================================================================================================================================================
   Ansicht
   ================================================================================================================================================ */
async function view(conn, userId, world, state, idx) {
  const F = cfg(); const f = await myFoundation(conn, userId);
  const purposes = M.purposes().map((p) => ({ key: p.key, name: p.name, icon: p.icon, what: p.what, family: !!p.family }));
  const out = { purposes, min: Math.ceil(M.minCapital() * idx), fee: Math.round(num(F.foundFeeReal, 20000) * idx), giveMin: Math.ceil(num(F.giveMinReal, 50000) * idx), payout: { min: num(F.payoutMinPct, 1.5), max: num(F.payoutMaxPct, 6), def: num(F.payoutDefaultPct, 3) }, yieldPct: num(F.yieldPct, 3), willMax: num(F.willMaxPct, 30), mine: null, why: null };
  const blk = RP.block(RP.stand(state).lv, num(F.minLevel, 1));
  out.why = state.day < num(F.minGameDays, 60) ? `Ab ${num(F.minGameDays, 60)} Spieltagen.` : blk || null;
  if (!f) return out;
  const pu = M.purposeOf(f.purpose) || {};
  const ledger = (await conn.query(`SELECT l.kind, l.amount_real, l.created_at, l.user_id FROM foundation_log l WHERE l.foundation_id = ? ORDER BY l.id DESC LIMIT 12`, [f.id])).map((r) => ({ kind: r.kind, amount: Math.round(Number(r.amount_real) * idx), at: new Date(r.created_at).getTime() }));
  const cap = Number(f.capital_real); const y = num(F.yieldPct, 3) / 100; const pct = Number(f.payout_pct);
  const yearIncome = cap * y; const yearPay = (cap + yearIncome) * pct / 100;
  const pot = K.potFx(world, f.city_id);
  out.mine = {
    id: f.id, name: f.name, purpose: f.purpose, purposeName: pu.name, icon: pu.icon, family: !!pu.family, capital: Math.round(cap * idx), contributed: Math.round(Number(f.contributed_real) * idx), paid: Math.round(Number(f.paid_real) * idx),
    payoutPct: pct, yearPayout: Math.round(yearPay * idx), yearIncome: Math.round(yearIncome * idx), generation: f.generation, foundedAt: Number(f.founded_ms), nextAt: Number(f.tick_ms) + num(F.tickHours, 24) * HOUR,
    lockedUntil: Number(f.lock_ms), city: (world.city(f.city_id) || {}).name || '', effect: pot, will: M.ensure(state).will, ledger,
  };
  void social;
  return out;
}

module.exports = { found, give, set, will, dissolve, applyWill, tickOne, tick, view, myFoundation };
