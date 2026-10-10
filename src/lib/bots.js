'use strict';
/**
 * Computergesteuerte Spielfiguren („Bots“), die die Spielwelt beleben: eigene Konten und Charaktere, die nach denselben
 * Regeln wie echte Spieler leben (Wohnung, Arbeit, Betriebe, Immobilien, Politik), im Stadtplatz-Chat plaudern,
 * Briefe beantworten, Freundschaften annehmen und Spielerbetriebe besuchen.
 *
 * Leitplanken: Bots erscheinen nicht in der Singles-Liste und gehen keine Beziehungen mit Spielern ein; sie fragen nie nach Geld
 * oder Käufen; auf eine direkte, ernst gemeinte Frage („bist du ein Bot?“) antworten sie ehrlich. Im Admin sind sie gekennzeichnet.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const service = require('../game/service');
const worldSvc = require('../game/world');
const actions = require('../game/actions');
const social = require('./social');
const { edition } = require('../game/newspaper');
const { advance } = require('../game/engine');
const { yearOf } = require('../game/calendar');
const { randomFirstName, LAST } = require('../game/content');
const { ageOfChild } = require('../game/family');
const { createHeirState } = require('../game/heir');
const T = require('./bot-texts');

const cfg = () => settings.get('bots');
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const parse = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch (_) { return {}; } };
const berlinHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false }).format(new Date())) % 24;

/* ============================== Anlegen ============================== */
function makePersona(lang) {
  const wake = rnd(6, 10); const sleep = Math.min(24, wake + rnd(13, 17));
  const tone = pick(['locker', 'locker', 'locker', 'höflich', 'knapp']);
  return {
    lang, wake, sleep, tone,
    lower: chance(0.35), typo: chance(0.3), emoji: chance(0.35),
    chatty: 0.2 + Math.random() * 0.6, social: Math.random(), ambition: Math.random(), thrift: Math.random(),
    kids: pick([0, 0, 1, 2, 3, 4]), maxBiz: pick([0, 1, 1, 2]), maxProps: pick([0, 0, 1, 2, 3]), food: pick([0, 1, 1, 1, 2]),
  };
}

async function uniqueName(first) {
  for (let i = 0; i < 30; i++) {
    const nm = T.nickname(first);
    if (!(await db.one('SELECT id FROM users WHERE username = ?', [nm]))) return nm;
  }
  return `${first}${crypto.randomBytes(3).toString('hex')}`;
}

/** Wohnort-Wahl: oft dort, wo echte Spieler leben (damit der Stadtplatz lebt), sonst nach Einwohnerzahl. */
async function pickCity(w, year) {
  const places = w.cityList.filter((c) => (c.since || 1945) <= year);
  if (chance(0.5)) {
    const rows = await db.query('SELECT ps.city_id, COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE u.is_bot = 0 AND ps.city_id IS NOT NULL GROUP BY ps.city_id ORDER BY n DESC LIMIT 12');
    const c = rows.length ? w.city(pick(rows).city_id) : null; if (c && (c.since || 1945) <= year) return c;
  }
  const weights = places.map((c) => ((c.size_tier || 1) >= 2 ? 3 : 0.15) * Math.sqrt(2000 + (c.pop || 0)));
  let x = Math.random() * weights.reduce((s, v) => s + v, 0);
  for (let i = 0; i < places.length; i++) { x -= weights[i]; if (x <= 0) return places[i]; }
  return places[0];
}

async function createBot({ forward = true } = {}) {
  const w = await worldSvc.get();
  const year = settings.get('game.start_year');
  const lang = chance(0.12) ? 'en' : 'de';
  const gender = chance(0.5) ? 'm' : 'f';
  const first = randomFirstName(Math.random, year - 20, gender);
  const last = pick(LAST);
  const city = await pickCity(w, year);
  const profs = w.activeProfessions(year).filter((p) => !p.academic && p.pkey !== 'helfer');
  const prof = pick(profs);
  const username = await uniqueName(first);
  const persona = makePersona(lang);
  const meta = { bot: { persona, next: Date.now() + rnd(1, 20) * 60000, chatNext: Date.now() + rnd(10, 120) * 60000, born: Date.now() } };
  const r = await db.query(
    `INSERT INTO users (email, username, password_hash, role, email_verified, coins, efs_accrued_at, efs_pool, meta, social_public, bio, lang, is_bot, created_at)
     VALUES (?,?,?,'player',1,?,?,?,?,1,?,?,1, NOW() - INTERVAL ? HOUR)`,
    [`bot-${crypto.randomBytes(5).toString('hex')}@bots.invalid`, username, await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 6), settings.get('coins.start'), Date.now(), 400, JSON.stringify(meta), chance(0.45) ? T.bio(lang) : null, lang, rnd(30, 24 * 18)],
  );
  const id = r.insertId;
  await service.create(id, { gender, firstName: first, lastName: last, birthCityId: city.id, professionKey: prof.pkey, fatherName: '', fatherJob: '', motherName: '', motherJob: '' });
  if (forward) {
    for (let i = 0, n = rnd(3, 12); i < n; i++) { await db.query('UPDATE users SET efs_pool = ? WHERE id = ?', [rnd(200, 600), id]); await playGameSafe(id, { budget: rnd(150, 500), rounds: 40 }); }
  }
  return id;
}

/* ============================== Spielen ============================== */
const tryAct = (ctx, name, input) => {
  try { return actions.run(name, { world: ctx.world, state: ctx.state, input: input || {}, user: ctx.user, now: ctx.now }); } catch (e) { if (e instanceof actions.ActionError) return null; throw e; }
};
const yrOf = (s) => yearOf(s.day, s.startYear);

/** Entscheidungen eines Spielers in einer Spielsitzung (ohne Zeitvorlauf). */
function decide(ctx, P) {
  const { world: w, state: s } = ctx; const year = yrOf(s); const idx = w.idx(year);
  tryAct(ctx, 'readNotices', {});
  if (s.meters.fridge < 50) tryAct(ctx, 'buyFood', { tier: P.food });
  for (const p of s.properties) { if (p.closedUntil - s.day > 10) tryAct(ctx, 'repair', { propertyId: p.id }); else if (p.condition < 60) tryAct(ctx, 'maintain', { propertyId: p.id }); }
  const E = edition(w, s, s.cityId);
  const rooms = Math.max(1, 1 + (s.partner ? 1 : 0) + s.children.filter((c) => c.status === 'home').length);

  // Wohnen
  const h = s.housing;
  const own = s.properties.find((p) => p.cityId === s.cityId && p.rooms >= rooms && (!p.lease || !p.lease.tenant));
  if (own && h.type !== 'own') tryAct(ctx, 'moveIn', { propertyId: own.id });
  else if (!['rent', 'own'].includes(h.type) || (h.rooms || 99) < rooms) {
    const rents = E.housing.rent.filter((l) => l.rooms >= rooms && s.money > l.perDay * 25).sort((a, b) => a.perDay - b.perDay);
    if (rents.length) tryAct(ctx, 'rent', { listingId: rents[0].id });
    else if (h.type === 'street' || h.type === 'workplace') { const pen = E.housing.pension.filter((l) => s.money > l.perDay * 6).sort((a, b) => a.perDay - b.perDay)[0]; if (pen) tryAct(ctx, 'rent', { listingId: pen.id }); }
  }
  // Stadtwirtschaft: Wer zur Miete wohnt und eine deutlich günstigere Nachbarstadt kennt, zieht gelegentlich um (nur ohne Besitz, Betriebe und Partner)
  if (h.type === 'rent' && !s.properties.length && !(s.companies || []).length && !s.partner && chance(0.03)) {
    const tip = require('../game/cityecon').tips(w, s, year, require('../game/core').dailyFlows(w, s).exp.lodging).find((t) => t.kind === 'rent' && t.pct >= 15);
    if (tip && s.money > 6000 * idx) tryAct(ctx, 'move', { cityId: tip.cityId });
  }
  // Arbeit
  const occ = s.occupation;
  if (!occ) {
    const jobs = E.jobs.slice().sort((a, b) => (b.kind === 'work') - (a.kind === 'work') || b.wage - a.wage);
    const j = jobs.find((x) => x.kind === 'work' && x.pkey !== 'helfer') || jobs.find((x) => x.kind === 'training' && s.money > 50 * idx * 20) || jobs[0];
    if (j) tryAct(ctx, 'apply', { listingId: j.id });
  } else if (occ.kind === 'work' && occ.pkey === 'helfer') {
    const j = E.jobs.find((x) => x.kind === 'work' && x.pkey !== 'helfer');
    if (j) tryAct(ctx, 'apply', { listingId: j.id });
  }
  // Versicherungen
  if (s.money > 600 * 30 * idx) { for (const k of ['hausrat', 'gesundheit']) if (!s.insurance[k] && chance(0.3)) tryAct(ctx, 'insurance', { key: k, on: true }); if (s.properties.length && !s.insurance.gebaeude) tryAct(ctx, 'insurance', { key: 'gebaeude', on: true }); }
  // Familie
  if (!s.partner && ageOfPerson(s) >= 21 && chance(0.12 + P.social * 0.1) && s.money > 400 * idx) { const l = E.partners && E.partners[0]; if (l) tryAct(ctx, 'meet', { listingId: pick(E.partners).id }); }
  if (s.partner && !s.partner.married && !s.partner.linked && s.money > 6000 * idx && chance(0.25)) tryAct(ctx, 'marry', {});
  if (s.partner && chance(0.2)) tryAct(ctx, 'together', {});
  if (s.partner && s.partner.sat < 50) tryAct(ctx, 'gift', {});
  if (s.plan && s.plan.target !== P.kids) tryAct(ctx, 'plan', { target: P.kids });
  // Betriebe
  const wantBiz = (s.companies || []).length < P.maxBiz;
  if (wantBiz) {
    const b = (E.biz || []).filter((x) => x.qualified && s.money > x.price * 1.6 && (!x.comp || x.comp.sat <= 1.1)).sort((a, c) => c.price - a.price)[0]; // nicht in eine übersättigte Stadt (Nachfrage knapp)
    if (b && chance(0.5)) tryAct(ctx, 'buyBiz', { listingId: b.id });
  }
  for (const c of s.companies || []) {
    if (c.abandoned) continue;
    if (c.cash > 4000 * idx) tryAct(ctx, 'bizCollect', { id: c.id });
    if (!c.manager && s.money > 12000 * idx && chance(0.1)) tryAct(ctx, 'bizManager', { id: c.id, on: true });
    if (!s.occupation || (s.occupation && !s.occupation.ownCompanyId && chance(0.3))) tryAct(ctx, 'bizWork', { id: c.id });
  }
  // Immobilien: kaufen und vermieten
  if (s.properties.length < P.maxProps) {
    const sale = (E.housing.sale || []).filter((x) => s.money > x.price * 2.2).sort((a, b) => a.price - b.price)[0];
    if (sale && chance(0.15)) tryAct(ctx, 'buy', { listingId: sale.id });
  }
  for (const p of s.properties) {
    if (p.condition < 45 && s.money > 2000 * idx) tryAct(ctx, 'maintain', { propertyId: p.id });
    if (!(p.lease && p.lease.on) && !(h.type === 'own' && h.propertyId === p.id)) tryAct(ctx, 'letOn', { propertyId: p.id, mult: 0.85 + Math.random() * 0.4 });
  }
  // Politik & Glück
  if (ageOfPerson(s) >= 28 && !s.politics.term && P.ambition > 0.55 && chance(0.04)) tryAct(ctx, 'runOffice', { idx: 0 });
  if (s.money > 3000 * idx && chance(0.03)) tryAct(ctx, 'lotto', { tickets: 1 });
}
const ageOfPerson = (s) => Math.floor((s.day - s.person.birthDay) / 365);

/** Eine Spielsitzung: entscheiden, Zeit vorspulen, wieder entscheiden. */
async function playGame(userId, { budget, rounds = 8 } = {}) {
  const urow = await db.one('SELECT meta FROM users WHERE id = ?', [userId]); if (!urow) return;
  const P = (parse(urow.meta).bot || {}).persona || makePersona('de');
  await service.withCharacter(userId, async (ctx) => {
    const s = ctx.state; if (!s || s.status !== 'alive') return;
    let left = Math.min(ctx.user.efs_pool, budget || rnd(8, 50));
    for (let round = 0; round < rounds && s.status === 'alive'; round++) {
      await service.withSold(ctx, () => decide(ctx, P));
      const step = Math.min(left, rnd(3, 16)); if (step < 1) break;
      s.interrupts = [];
      const res = advance(ctx.world, s, step, { mode: 'online' });
      ctx.user.efs_pool -= res.advanced; left -= res.advanced; service.flush(ctx.user, s);
      if (res.advanced < 1) break;
    }
    if (s.status === 'alive') await service.withSold(ctx, () => decide(ctx, P));
  });
}
async function playGameSafe(userId, opts) {
  try { await playGame(userId, opts); } catch (e) { log.warn(`[bots] Spiel von ${userId}: ${e.message}`); }
  // Lieferverträge laufen außerhalb der Spielstand-Transaktion (eigene Datenbankzugriffe), daher erst nach der Sitzung
  try { await require('./supply').botRound(userId); } catch (e) { log.warn(`[bots] Lieferverträge von ${userId}: ${e.message}`); }
}

async function lifeCycle(userId) {
  const row = await db.one('SELECT * FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
  const u = await db.one('SELECT username, meta FROM users WHERE id = ?', [userId]);
  const P = (parse(u.meta).bot || {}).persona || makePersona('de');
  if (!row || row.status === 'gameover') {
    const w = await worldSvc.get(); const year = settings.get('game.start_year'); const gender = chance(0.5) ? 'm' : 'f';
    const places = w.cityList.filter((c) => (c.since || 1945) <= year);
    const prof = pick(w.activeProfessions(year).filter((p) => !p.academic && p.pkey !== 'helfer'));
    await service.create(userId, { gender, firstName: randomFirstName(Math.random, year - 20, gender), lastName: pick(LAST), birthCityId: (await pickCity(w, year)).id, professionKey: prof.pkey });
    return 'new';
  }
  if (row.status === 'dead') {
    const state = JSON.parse(row.state);
    const kids = (state.children || []).filter((c) => c.status === 'home' && ageOfChild(state, c) >= 18);
    if (kids.length) { await service.chooseHeir(userId, kids[0].id, (state.properties || []).map((p) => p.id)); return 'heir'; }
    await db.query("UPDATE characters SET status = 'gameover' WHERE id = ?", [row.id]);
    return 'over';
  }
  return 'alive';
}

/* ============================== Soziales ============================== */
const answered = new Set();
async function cityOf(userId) { const r = await db.one('SELECT city_id, name, pkey FROM player_stats WHERE user_id = ?', [userId]); return r; }
async function patch(userId, fn) {
  const u = await db.one('SELECT meta FROM users WHERE id = ?', [userId]); if (!u) return;
  const meta = parse(u.meta); meta.bot = meta.bot || {}; fn(meta.bot);
  await db.query('UPDATE users SET meta = ? WHERE id = ?', [JSON.stringify(meta), userId]);
}

async function handleLetters(bot, P, c) {
  if (!c.letters) return;
  const rows = await db.query("SELECT m.id, m.from_user, m.subject, m.body, m.created_at FROM messages m JOIN users f ON f.id = m.from_user WHERE m.to_user = ? AND m.kind = 'letter' AND m.read_at IS NULL AND m.del_to = 0 AND f.is_bot = 0 ORDER BY m.id LIMIT 3", [bot.id]);
  for (const m of rows) {
    const delayMin = 6 + ((m.id * 7919) % 120); // je Brief fest: 6–125 Minuten „Bedenkzeit“
    if (Date.now() - new Date(m.created_at).getTime() < delayMin * 60000) continue;
    await db.query('UPDATE messages SET read_at = NOW() WHERE id = ?', [m.id]);
    if (!chance(0.9)) continue;
    const from = await db.one('SELECT ps.name FROM player_stats ps WHERE ps.user_id = ?', [m.from_user]);
    const body = T.letterReply(P, `${m.subject} ${m.body}`, from ? from.name.split(' ')[0] : '', bot.id);
    try { await social.sendLetter(bot.id, m.from_user, /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`, body); } catch (_) { /* Limits */ }
  }
}

async function handleFriends(bot, P, c) {
  if (!c.friends) return;
  const rows = await db.query("SELECT IF(f.user_a = ?, f.user_b, f.user_a) other, f.created_at, u.is_bot FROM friendships f JOIN users u ON u.id = IF(f.user_a = ?, f.user_b, f.user_a) WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'pending' AND f.requester <> ? LIMIT 5", [bot.id, bot.id, bot.id, bot.id, bot.id]);
  for (const r of rows) {
    if (Date.now() - new Date(r.created_at).getTime() < (5 + (r.other % 60)) * 60000) continue;
    try { await social.friendRespond(bot.id, r.other, r.is_bot ? true : chance(0.78)); } catch (_) { /* ignorieren */ }
  }
}

async function handleJobs(bot, P, c) {
  if (!c.jobs) return;
  const w = await worldSvc.get(); const bonds = require('./bonds');
  const inv = await db.query("SELECT a.id FROM job_apps a WHERE a.user_id = ? AND a.kind = 'invite' AND a.status = 'pending' LIMIT 2", [bot.id]);
  for (const a of inv) { try { await bonds.decide(w, bot.id, a.id, chance(0.7)); } catch (_) { /* ignorieren */ } }
  if (chance(0.06 + P.ambition * 0.05)) {
    try { const m = await bonds.market(w, bot.id); const o = shuffle(m.offers.filter((x) => !x.mystatus))[0]; if (o) await bonds.apply(w, bot.id, o.id, T.applyText(P, bot.id)); } catch (_) { /* ignorieren */ }
  }
}

async function handleVisit(bot, P, c) {
  if (!c.visits || !chance(0.1 + P.social * 0.12)) return;
  const ps = await cityOf(bot.id); if (!ps) return;
  try {
    const firms = (await social.firmsInCity(bot.id, ps.city_id)).filter((f) => f.userId !== bot.id);
    const real = []; for (const f of firms) { const u = await db.one('SELECT is_bot FROM users WHERE id = ?', [f.userId]); if (u && !u.is_bot) real.push(f); }
    const f = pick(real); if (f) await social.visit(bot.id, f.userId, f.id);
  } catch (_) { /* Limits, Geld */ }
}

async function handleChat(bot, P, bm, c) {
  if (!c.chat) return;
  const ps = await cityOf(bot.id); if (!ps) return;
  const recent = await db.query('SELECT c.id, c.user_id, c.name, c.text, c.created_at, u.is_bot FROM chat_messages c JOIN users u ON u.id = c.user_id WHERE c.city_id = ? AND c.deleted = 0 AND c.created_at > NOW() - INTERVAL 20 MINUTE ORDER BY c.id DESC LIMIT 14', [ps.city_id]);
  const myFirst = (ps.name || '').split(' ')[0];
  const world = await worldSvc.get(); const cityObj = world.city(ps.city_id); const cityName = cityObj ? cityObj.name : '';
  // 1) auf echte Spieler reagieren
  const real = recent.find((m) => !m.is_bot && !answered.has(m.id) && (Date.now() - new Date(m.created_at).getTime()) > (25 + (m.id * 31) % 150) * 1000);
  if (real) {
    answered.add(real.id); if (answered.size > 2000) answered.clear();
    const reply = T.chatReply(P, real.text, { myFirst, theirFirst: String(real.name || '').split(' ')[0], username: bot.username, city: cityName, botId: bot.id });
    if (reply && chance(reply.p)) { try { await social.chatSend(bot.id, ps.city_id, reply.text); await patch(bot.id, (b) => { b.chatNext = Date.now() + rnd(20, 90) * 60000; }); } catch (_) { /* Limits */ } return; }
  }
  // 2) gelegentlich selbst etwas sagen
  if (Date.now() < (bm.chatNext || 0)) return;
  const botsLately = recent.slice(0, 4).filter((m) => m.is_bot).length;
  if (botsLately >= 2 || !chance(P.chatty)) { await patch(bot.id, (b) => { b.chatNext = Date.now() + rnd(20, 70) * 60000; }); return; }
  const st = await db.one('SELECT year FROM player_stats WHERE user_id = ?', [bot.id]);
  const prof = ps.pkey && world.prof(ps.pkey) ? world.prof(ps.pkey).name : null;
  try { await social.chatSend(bot.id, ps.city_id, T.idle(P, { city: cityName || 'der Stadt', year: st ? st.year : 1950, hour: berlinHour(), prof, botId: bot.id })); } catch (_) { /* Limits */ }
  await patch(bot.id, (b) => { b.chatNext = Date.now() + rnd(40, 180) * 60000 / (0.4 + P.chatty); });
}

/** Markt: Angebote an Bots beantworten, bei Versteigerungen bieten, gelegentlich ein faires Übernahmeangebot machen. */
async function handleMarket(bot, P, c) {
  if (!c.market) return;
  const market = require('./market');
  const inc = await db.query("SELECT o.* FROM market_offers o JOIN users f ON f.id = o.proposer WHERE o.status = 'open' AND o.proposer <> ? AND (o.buyer_id = ? OR o.seller_id = ?) AND f.is_bot = 0 AND o.created_at < NOW() - INTERVAL ? MINUTE LIMIT 3", [bot.id, bot.id, bot.id, 8 + (bot.id % 25)]);
  for (const o of inc) {
    try {
      const tbl = o.kind === 'prop' ? ['player_props', 'prop_id'] : ['player_firms', 'company_id'];
      const row = await db.one(`SELECT value_real FROM ${tbl[0]} WHERE user_id = ? AND ${tbl[1]} = ?`, [o.seller_id, o.item_id]);
      const val = row ? Number(row.value_real) : Number(o.price_real); const p = Number(o.price_real); const iSell = o.seller_id === bot.id;
      const ratio = iSell ? p / Math.max(1, val) : val / Math.max(1, p); // je höher, desto besser für den Bot
      if (ratio >= 0.92 + P.thrift * 0.06) await market.respondOffer(bot.id, o.id, 'accept');
      else if (ratio >= 0.6 && chance(0.7)) await market.respondOffer(bot.id, o.id, 'counter', Math.round(iSell ? val * (1 + 0.03 * Math.random()) : val * (0.97 - 0.05 * Math.random())));
      else await market.respondOffer(bot.id, o.id, 'decline');
    } catch (_) { /* Geld, Qualifikation, Limits */ }
  }
  const ps = await cityOf(bot.id); if (!ps) return;
  if (chance(0.25)) {
    try {
      const list = (await market.auctions(bot.id, ps.city_id)).filter((a) => !a.mine && !a.leading);
      const a = list[0];
      if (a) { const floor = a.lead == null ? a.min : Math.ceil(a.lead * 1.05); if (floor <= a.value * (0.55 + 0.35 * Math.random())) await market.bid(bot.id, a.id, floor); }
    } catch (_) { /* nicht qualifiziert / kein Geld */ }
  }
  if (chance(0.025 + P.ambition * 0.02)) {
    try {
      const f = await db.one("SELECT f.user_id, f.company_id, f.value_real, f.abandoned FROM player_firms f JOIN users u ON u.id = f.user_id WHERE f.city_id = ? AND f.user_id <> ? AND u.is_bot = 0 AND u.social_public = 1 AND u.banned = 0 AND f.ask_real IS NULL AND (f.distress = 1 OR f.abandoned = 1) ORDER BY RAND() LIMIT 1", [ps.city_id, bot.id]);
      if (f) await market.makeOffer(bot.id, { kind: 'firm', ownerId: f.user_id, itemId: f.company_id, priceReal: Math.round(Number(f.value_real) * (0.72 + Math.random() * 0.18)), message: T.offerText(P, bot.id) });
    } catch (_) { /* Geld, Qualifikation, Limits */ }
  }
}

/** Gericht: Bots erstatten Anzeige bei bekanntem Täter, nehmen Anwälte, bieten und beantworten Vergleiche – wie Spieler. */
async function handleCourt(bot) {
  if (!chance(0.5)) return;
  try { await require('./court').botRound(bot.id); } catch (_) { /* Geld, Limits */ }
}

/** Börse: Bots kaufen gelegentlich wenige Anteile unter dem fairen Wert und verkaufen mit Gewinn – zurückhaltend, damit echte Spieler den Kurs prägen. */
async function handleExchange(bot, P) {
  const ex = require('./exchange'); if (!require('../settings').get('exchange').enabled) return;
  if (!chance(0.06 + P.ambition * 0.05)) return;
  try {
    const o = await ex.overview(bot.id); const list = o.stocks.filter((s) => !s.mine);
    const sell = o.holdings.find((h) => !h.owner && h.price > h.avg * 1.12 && chance(0.5));
    if (sell) { await ex.place(bot.id, sell.stockId, 'sell', Math.max(1, Math.floor(sell.shares / 2)), Math.round(sell.price * 1.02)); return; }
    const s = list.filter((x) => x.price < x.fair * 0.97 && x.held < 60)[0]; if (!s) return;
    await ex.place(bot.id, s.id, 'buy', 5 + Math.floor(Math.random() * 15), Math.round(s.price * 1.03));
  } catch (_) { /* Geld, Limits */ }
}

/* ============================== Takt ============================== */
async function session(bot) {
  const meta = parse(bot.meta); const bm = meta.bot || {}; const P = bm.persona || makePersona('de'); const c = cfg();
  const h = berlinHour(); const awake = h >= P.wake && h < P.sleep;
  const factor = [0, 1.7, 1, 0.55][Math.max(1, Math.min(3, Number(c.activity) || 2))];
  const nextIn = (min, max) => Date.now() + rnd(min, max) * 60000 * factor;
  if (!awake && !chance(0.04)) { await patch(bot.id, (b) => { b.next = nextIn(25, 70); }); return; }
  await db.query('UPDATE users SET last_seen_at = NOW(), last_login_at = COALESCE(last_login_at, NOW()) WHERE id = ?', [bot.id]);
  const state = await lifeCycle(bot.id);
  if (state === 'alive' || state === 'new' || state === 'heir') {
    if (chance(0.55)) await playGameSafe(bot.id, {});
    await handleLetters(bot, P, c); await handleFriends(bot, P, c); await handleJobs(bot, P, c); await handleVisit(bot, P, c); await handleMarket(bot, P, c); await handleExchange(bot, P); await handleCourt(bot); await handleChat(bot, P, bm, c);
  }
  await patch(bot.id, (b) => { b.next = nextIn(7, 38); });
}

/** Zwischen den Sitzungen: auf frische Chat-Nachrichten echter Spieler reagiert ein wacher Bot der Stadt zeitnah. */
async function chatWatch(c) {
  if (!c.chat) return;
  const cities = await db.query("SELECT DISTINCT c.city_id FROM chat_messages c JOIN users u ON u.id = c.user_id WHERE u.is_bot = 0 AND c.deleted = 0 AND c.created_at > NOW() - INTERVAL 12 MINUTE");
  for (const { city_id: cityId } of cities) {
    const bs = await db.query('SELECT u.id, u.username, u.meta FROM users u JOIN player_stats ps ON ps.user_id = u.id WHERE u.is_bot = 1 AND u.banned = 0 AND ps.city_id = ?', [cityId]);
    const h = berlinHour();
    const awake = shuffle(bs).filter((b) => { const P = (parse(b.meta).bot || {}).persona || {}; return h >= (P.wake ?? 7) && h < (P.sleep ?? 23); });
    const bot = awake[0]; if (!bot) continue;
    const bm = parse(bot.meta).bot || {};
    await db.query('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [bot.id]);
    try { await handleChat(bot, bm.persona || makePersona('de'), bm, c); } catch (e) { log.warn(`[bots] Chat ${bot.username}: ${e.message}`); }
  }
}

let running = false;
async function tick() {
  if (running) return; running = true;
  try {
    const c = cfg(); if (!c.enabled) return;
    await ensure(c);
    const bots = await db.query('SELECT id, username, meta FROM users WHERE is_bot = 1 AND banned = 0');
    let ran = 0;
    for (const b of shuffle(bots)) {
      const bm = parse(b.meta).bot || {};
      if ((bm.next || 0) > Date.now()) continue;
      if (ran++ >= 3) break;
      try { await session(b); } catch (e) { log.warn(`[bots] ${b.username}: ${e.message}`); await patch(b.id, (x) => { x.next = Date.now() + 15 * 60000; }); }
    }
    await chatWatch(c);
  } catch (e) { log.warn(`[bots] Takt: ${e.message}`); } finally { running = false; }
}

/** Zielanzahl herstellen (langsam anlegen, damit neue Spieler nicht plötzlich eine volle Welt sehen). */
async function ensure(c = cfg()) {
  const n = (await db.one('SELECT COUNT(*) n FROM users WHERE is_bot = 1')).n;
  const target = Math.max(0, Math.min(Number(c.max) || 60, Number(c.target) || 0));
  if (n < target) { await createBot(); }
  else if (n > target) { const extra = await db.query('SELECT id FROM users WHERE is_bot = 1 ORDER BY id DESC LIMIT ?', [n - target]); for (const e of extra) await require('./account').deleteAccount(e.id); }
}

function start() { setInterval(() => { tick().catch(() => {}); }, 60000).unref(); setTimeout(() => tick().catch(() => {}), 20000).unref(); }

async function removeAll() { const all = await db.query('SELECT id FROM users WHERE is_bot = 1'); for (const u of all) await require('./account').deleteAccount(u.id); return all.length; }

module.exports = { start, tick, createBot, ensure, removeAll, session, lifeCycle, playGame, decide, makePersona };
