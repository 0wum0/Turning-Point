'use strict';
const db = require('../db');
const settings = require('../settings');
const world = require('./world');
const { advance } = require('./engine');
const { createCharacter, validateCreation, parseState } = require('./state');
const { createHeirState, planInheritance } = require('./heir');
const { present } = require('./present');
const actions = require('./actions');
const { notice } = require('./core');
const { yearOf } = require('./calendar');

const parseMeta = (s) => { try { return s ? JSON.parse(s) : {}; } catch (_) { return {}; } };

/** Auf den Nutzer wirkende Effekte (Coins, EFS, Abschlüsse) aus dem Spielstand übernehmen. */
function flush(user, state) {
  user.coins = Math.max(0, user.coins + (state.fx.coins || 0));
  user.efs_pool = Math.max(0, user.efs_pool + (state.fx.efs || 0));
  if (state.fx.influence) user.meta.influence = (user.meta.influence || 0) + state.fx.influence;
  state.fx = { coins: 0, efs: 0, influence: 0 };
  if (state.death && state.death.completed && !state.death.counted) { state.death.counted = true; user.meta.completedCycles = (user.meta.completedCycles || 0) + 1; }
  if (state.pending.degrees && state.pending.degrees.length) {
    const set = new Set(user.meta.degrees || []);
    state.pending.degrees.forEach((d) => set.add(d));
    user.meta.degrees = [...set];
    state.pending.degrees = [];
  }
}

/**
 * Spieluhr und EFS: Die Spielzeit läuft automatisch mit der echten Uhr (game.clock_days_per_day Spieltage je 24 Stunden,
 * Standard 365 = 1 Spieljahr). Bei längerer Abwesenheit läuft sie im Offline-Schutz (kein Verhungern/Insolvenz),
 * sonst wie beim aktiven Spielen. EFS sind ein Vorrat zum zusätzlichen Vorspulen (Login-Bonus, Sammeln, Käufe).
 */
function syncEfs(user, state, now, w) {
  const perMs = settings.get('game.clock_days_per_day') / 86400000;
  const last = user.efs_accrued_at || now;
  const elapsed = Math.max(0, now - last);
  const accrued = elapsed * perMs + (user.efs_carry || 0);
  const whole = Math.floor(accrued);
  user.efs_carry = accrued - whole;
  user.efs_accrued_at = now;
  // optionales EFS-Einkommen (Standard aus)
  const eRate = settings.get('efs.daily_auto') / 86400000;
  if (eRate > 0) { const e = elapsed * eRate + (user.meta.efsCarry || 0); const ew = Math.floor(e); user.meta.efsCarry = e - ew; user.efs_pool += ew; }
  const awayMin = elapsed / 60000;
  let offline = null; let clock = null;
  if (state && state.status === 'alive' && whole > 0) {
    const n = Math.min(whole, 3650);
    const before = { day: state.day, money: state.money, year: yearOf(state.day, state.startYear) };
    if (awayMin >= settings.get('game.offline_after_minutes')) {
      const res = advance(w, state, n, { mode: 'offline' });
      flush(user, state);
      offline = { days: res.advanced, awayMinutes: Math.round(awayMin), fromYear: before.year, toYear: yearOf(state.day, state.startYear), moneyDelta: state.money - before.money, status: state.status };
      notice(state, {
        level: 'info', title: 'Während du weg warst …',
        text: `${res.advanced} Spieltage sind vergangen (${before.year} → ${offline.toYear}). Gehalt, Miete und Alltag liefen automatisch weiter.`,
        info: ['Das Leben geht auch ohne dich weiter: Die Spielzeit läuft mit der echten Uhr.', 'Einnahmen und Fixkosten werden verbucht. Während du länger weg bist, kannst du weder verhungern noch insolvent werden.', 'Schau, was sich verändert hat.'],
      });
    } else {
      let left = n; let adv = 0;
      while (left > 0 && state.status === 'alive') { const r = advance(w, state, left, { mode: 'online' }); if (r.advanced < 1) break; left -= r.advanced; adv += r.advanced; }
      flush(user, state);
      clock = { days: adv, fromYear: before.year, toYear: yearOf(state.day, state.startYear), moneyDelta: state.money - before.money, status: state.status };
    }
  }
  const today = actions.berlinDay(now);
  let bonus = 0; let perks = null;
  if (user.login_bonus_date !== today) {
    bonus = settings.get('efs.login_bonus');
    user.efs_pool += bonus;
    user.login_bonus_date = today;
    const sub = settings.get('subscription');
    if (sub && sub.enabled && user.sub_until && Number(user.sub_until) > now) {
      user.coins += sub.daily_coins || 0;
      if (state && state.status === 'alive' && sub.daily_health_cards) state.cards.health += sub.daily_health_cards;
      perks = { coins: sub.daily_coins || 0, cards: sub.daily_health_cards || 0 };
    }
  }
  if (state && state.status === 'alive' && user.meta.pendingMoney) { state.money += user.meta.pendingMoney; user.meta.pendingMoney = 0; }
  return { offline, clock, bonus, perks };
}

async function loadUser(conn, userId) {
  const u = await conn.one('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
  if (!u) return null;
  u.meta = parseMeta(u.meta);
  return u;
}
async function saveUser(conn, u) {
  await conn.query(
    'UPDATE users SET coins = ?, efs_pool = ?, meta = ?, efs_accrued_at = ?, efs_carry = ?, login_bonus_date = ?, last_seen_at = NOW() WHERE id = ?',
    [u.coins, u.efs_pool, JSON.stringify(u.meta), u.efs_accrued_at, u.efs_carry, u.login_bonus_date, u.id],
  );
}
async function activeRow(conn, userId) {
  return conn.one("SELECT * FROM characters WHERE user_id = ? ORDER BY (status = 'gameover'), id DESC LIMIT 1 FOR UPDATE", [userId]);
}
async function saveCharacter(conn, row, state) {
  await conn.query(
    'UPDATE characters SET state = ?, game_day = ?, money = ?, status = ?, name = ?, end_reason = ?, ended_at = IF(? <> \'alive\', COALESCE(ended_at, NOW()), NULL) WHERE id = ?',
    [JSON.stringify(state), state.day, state.money, state.status, `${state.person.first} ${state.person.last}`, state.death ? (state.death.reason || null) : null, state.status, row.id],
  );
}

/**
 * Führt fn(ctx) transaktional auf dem aktuellen Charakter des Nutzers aus.
 * ctx = {world, state, user, row, sync, now}; fn darf state/user verändern, das wird gespeichert.
 */
async function withCharacter(userId, fn, { needAlive = false } = {}) {
  const w = await world.get();
  const now = Date.now();
  return db.tx(async (conn) => {
    const user = await loadUser(conn, userId);
    if (!user) throw new actions.ActionError('Nutzer nicht gefunden.');
    const row = await activeRow(conn, userId);
    let state = row ? parseState(row.state) : null;
    const pressBefore = state ? (state.nextPressId || 0) : 0;
    const sync = syncEfs(user, state, now, w);
    if (state) flush(user, state);
    if (needAlive && (!state || state.status !== 'alive')) throw new actions.ActionError('Dein Charakter lebt nicht mehr.');
    const bonds = require('../lib/bonds');
    if (state) { await bonds.reconcile(conn, user, row, state, w); flush(user, state); }
    const ctx = { world: w, state, user, row, sync, now, conn };
    const wasAlive = !!(state && state.status === 'alive');
    const result = (await fn(ctx)) || {};
    state = ctx.state;
    if (wasAlive && state && state.status === 'gameover') { const nm = user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Bürger'; await require('../lib/tagesblatt').post('life', 'Insolvenz', `${nm} ist zahlungsunfähig. Besitz kommt unter den Hammer.`, state.cityId, conn); }
    else if (wasAlive && state && state.status === 'dead' && user.social_public) { await require('../lib/tagesblatt').post('life', 'Todesfall', `${state.person.first} ${state.person.last} ist verstorben.`, state.cityId, conn); }
    if (state && row) {
      if (state.status === 'gameover' && ((state.properties || []).length || (state.companies || []).length)) { try { await require('../lib/market').estate(conn, user, state, w); } catch (e) { require('../lib/log').warn(`[market] Insolvenzmasse: ${e.message}`); } }
      flush(user, state); await bonds.beforeSave(conn, user, state, w); await saveCharacter(conn, row, state);
      try { await require('../game/contractors').flush(conn, state); } catch (e) { require('../lib/log').warn(`[contractors] ${e.message}`); }
      try { await require('../lib/exchange').flushDividends(conn, state); } catch (e) { require('../lib/log').warn(`[exchange] ${e.message}`); }
      const social = require('../lib/social');
      await social.upsertStats(conn, user, row, state, w);
      await social.publishNews(conn, user, state, pressBefore);
    }
    await saveUser(conn, user);
    return { ...result, sync, view: state ? present(w, state, user, now) : null, coins: user.coins, efsPool: user.efs_pool };
  });
}

async function getView(userId) {
  return withCharacter(userId, () => ({}));
}

async function create(userId, input) {
  const w = await world.get();
  const now = Date.now();
  return db.tx(async (conn) => {
    const user = await loadUser(conn, userId);
    const row = await activeRow(conn, userId);
    if (row && row.status !== 'gameover') throw new actions.ActionError('Du hast bereits einen Charakter.');
    const { err } = validateCreation(w, input, user.meta);
    if (err.length) throw new actions.ActionError(err.join(' '));
    const cycle = row ? row.cycle + 1 : 1;
    const state = createCharacter(w, input, user, { cycle });
    user.efs_accrued_at = now;
    user.efs_carry = 0;
    const today = actions.berlinDay(now);
    if (user.login_bonus_date !== today) { user.efs_pool += settings.get('efs.login_bonus'); user.login_bonus_date = today; }
    flush(user, state);
    const r = await conn.query(
      'INSERT INTO characters (user_id, cycle, generation, status, name, state, game_day, money) VALUES (?,?,?,?,?,?,?,?)',
      [userId, cycle, 1, 'alive', `${state.person.first} ${state.person.last}`, JSON.stringify(state), 0, state.money],
    );
    user.meta.cycles = (user.meta.cycles || 0) + 1;
    await saveUser(conn, user);
    await require('../lib/social').upsertStats(conn, user, { id: r.insertId }, state, w);
    await require('../lib/tagesblatt').post('life', 'Neu in der Stadt', `${user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein neuer Bürger'} beginnt ein neues Leben in ${(w.city(state.cityId) || {}).label || 'der Stadt'}.`, state.cityId, conn);
    return { view: present(w, state, user, now), id: r.insertId };
  });
}

async function doAction(userId, name, input) {
  return withCharacter(userId, async (ctx) => {
    if (!ctx.state) throw new actions.ActionError('Du hast noch keinen Charakter.');
    const needAlive = !['readNotices', 'tutorial'].includes(name);
    if (needAlive && ctx.state.status !== 'alive') throw new actions.ActionError('Dein Charakter lebt nicht mehr.');
    const out = actions.run(name, { world: ctx.world, state: ctx.state, input: input || {}, user: ctx.user, now: ctx.now });
    return { ok: true, message: out.msg || '', level: out.level || 'good' };
  });
}

async function doAdvance(userId, days) {
  return withCharacter(userId, async (ctx) => {
    const s = ctx.state;
    if (!s || s.status !== 'alive') throw new actions.ActionError('Dein Charakter lebt nicht mehr.');
    const want = days === 'max' ? ctx.user.efs_pool : Math.floor(Number(days) || 0);
    const n = Math.min(want, ctx.user.efs_pool, 3650);
    if (n < 1) throw new actions.ActionError('Du hast keine EFS zum Vorspulen. Sammle EFS auf der Karte oder warte auf den nächsten Tag.');
    const before = { year: yearOf(s.day, s.startYear), money: s.money, ids: s.nextNoticeId };
    const res = advance(ctx.world, s, n, { mode: 'online' });
    ctx.user.efs_pool -= res.advanced;
    flush(ctx.user, s);
    return {
      ok: true, advanced: res.advanced, stopped: res.stopped, moneyDelta: s.money - before.money,
      newNotices: s.notices.filter((x) => x.id >= before.ids), yearFrom: before.year, yearTo: yearOf(s.day, s.startYear),
    };
  });
}

async function chooseHeir(userId, childId, bequest) {
  const w = await world.get();
  const now = Date.now();
  return db.tx(async (conn) => {
    const user = await loadUser(conn, userId);
    const row = await activeRow(conn, userId);
    if (!row || row.status !== 'dead') throw new actions.ActionError('Es steht kein Erbe an.');
    const old = parseState(row.state);
    const { state } = createHeirState(w, old, childId, Array.isArray(bequest) ? bequest : []);
    flush(user, state);
    await conn.query(
      'INSERT INTO characters (user_id, parent_id, cycle, generation, status, name, state, game_day, money) VALUES (?,?,?,?,?,?,?,?,?)',
      [userId, row.id, state.cycle, state.generation, 'alive', `${state.person.first} ${state.person.last}`, JSON.stringify(state), state.day, state.money],
    );
    await conn.query("UPDATE characters SET status = 'gameover', end_reason = COALESCE(end_reason,'Generationenwechsel') WHERE id = ?", [row.id]);
    await saveUser(conn, user);
    const newRow = await conn.one('SELECT id FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
    await require('../lib/social').upsertStats(conn, user, newRow, state, w);
    return { view: present(w, state, user, now) };
  });
}

async function previewHeir(userId, childId, bequest) {
  const w = await world.get();
  const row = await db.one("SELECT * FROM characters WHERE user_id = ? AND status = 'dead' ORDER BY id DESC LIMIT 1", [userId]);
  if (!row) throw new actions.ActionError('Es steht kein Erbe an.');
  const state = parseState(row.state);
  const plan = planInheritance(w, state, childId, Array.isArray(bequest) ? bequest : []);
  return { n: plan.est.n, share: plan.est.share, cash: plan.cash, properties: plan.properties.concat(plan.companies).map((p) => p.name) };
}

/** Nur lesen (ohne Sperre/Sync) – für Zeitung, Karte, Kostenvoranschläge. */
async function peek(userId) {
  const w = await world.get();
  const user = await db.one('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  user.meta = parseMeta(user.meta);
  const row = await db.one("SELECT * FROM characters WHERE user_id = ? ORDER BY (status = 'gameover'), id DESC LIMIT 1", [userId]);
  return { w, user, row, state: row ? parseState(row.state) : null };
}

module.exports = { activeRow, saveCharacter, peek, withCharacter, getView, create, doAction, doAdvance, chooseHeir, previewHeir, flush, syncEfs, loadUser, saveUser, parseMeta };
