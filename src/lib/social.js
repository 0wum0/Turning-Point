'use strict';
/**
 * Mehrspieler-Ebene: Rangliste, Profile, Freunde, Briefe, Stadtplatz-Chat, Geschenke, Besuche in Spielerbetrieben,
 * öffentliche Spieler-Nachrichten. Alles serverseitig, mit Limits aus Einstellungen → Gemeinschaft (social).
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const { yearOf } = require('../game/calendar');
const { scale } = require('../game/economy');
const { notice, netWorth, clamp } = require('../game/core');
const { companyValue } = require('../game/business');
const { parseState } = require('../game/state');
const { ActionError } = require('../game/actions');
const anticheat = require('./anticheat');
const push = require('./push');

const cfg = () => settings.get('social');
const fail = (m) => { throw new ActionError(m); };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

/* =============================== Statistik / Rangliste =============================== */
function statsOf(world, state, user, charRow) {
  const year = yearOf(state.day, state.startYear);
  const idx = Math.max(0.0001, world.idx(year));
  const bizVal = (state.companies || []).reduce((s, c) => s + companyValue(world, state, c, year) + c.cash, 0);
  const term = state.politics && state.politics.term;
  const offices = world.econ.politics.offices;
  const occ = state.occupation && world.prof(state.occupation.pkey);
  return {
    user_id: user.id, char_id: charRow.id, username: user.username, name: `${state.person.first} ${state.person.last}`, city_id: state.cityId || null,
    year, status: state.status, wealth: Math.round(netWorth(world, state) / idx), biz_value: Math.round(bizVal / idx),
    companies: (state.companies || []).filter((c) => !c.abandoned).length, properties: state.properties.length,
    children: state.children.length, generation: state.generation || 1, cycle: state.cycle || 1,
    influence: Math.round((user.meta && user.meta.influence) || 0), office: term && offices[term.idx] ? offices[term.idx].name : null,
    pkey: state.occupation && state.occupation.pkey ? state.occupation.pkey : ((state.skills && state.skills.learned && state.skills.learned[0]) || null),
    partnered: state.partner ? 1 : 0,
    days: state.day, occupation: occ ? occ.name : (state.occupation && state.occupation.kind === 'study' ? 'Studium' : null),
  };
}

async function upsertStats(conn, user, charRow, state, world) {
  try {
    const s = statsOf(world, state, user, charRow);
    await conn.query(
      `INSERT INTO player_stats (user_id, char_id, username, name, city_id, year, status, wealth, biz_value, companies, properties, children, generation, cycle, influence, office, days, occupation, pkey, partnered)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE char_id=VALUES(char_id), username=VALUES(username), name=VALUES(name), city_id=VALUES(city_id), year=VALUES(year), status=VALUES(status), wealth=VALUES(wealth), biz_value=VALUES(biz_value),
         companies=VALUES(companies), properties=VALUES(properties), children=VALUES(children), generation=VALUES(generation), cycle=VALUES(cycle), influence=VALUES(influence), office=VALUES(office), days=VALUES(days), occupation=VALUES(occupation), pkey=VALUES(pkey), partnered=VALUES(partnered)`,
      [s.user_id, s.char_id, s.username, s.name, s.city_id, s.year, s.status, s.wealth, s.biz_value, s.companies, s.properties, s.children, s.generation, s.cycle, s.influence, s.office, s.days, s.occupation, s.pkey, s.partnered]);
    const year = yearOf(state.day, state.startYear); const idx = Math.max(0.0001, world.idx(year));
    const biz = require('../game/business'); const lord = require('../game/landlord');
    const askF = new Map((await conn.query('SELECT company_id, ask_real FROM player_firms WHERE user_id = ?', [user.id])).map((r) => [r.company_id, r.ask_real]));
    const askP = new Map((await conn.query('SELECT prop_id, ask_real FROM player_props WHERE user_id = ?', [user.id])).map((r) => [r.prop_id, r.ask_real]));
    await conn.query('DELETE FROM player_firms WHERE user_id = ?', [user.id]);
    for (const c of (state.companies || [])) {
      const f = biz.companyFlows(world, state, c, year);
      const distress = c.abandoned ? 1 : (f.profit < 0 && c.cash < Math.abs(f.profit) * 30) || (c.strikeUntil && state.day < c.strikeUntil) ? 1 : 0;
      await conn.query('INSERT INTO player_firms (user_id, company_id, city_id, name, pkey, tier, rooms, value_real, cash_real, profit_real, staff, distress, abandoned, ask_real) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [user.id, c.id, c.cityId, c.name, c.pkey, c.tier, c.rooms, Math.round(biz.companyValue(world, state, c, year) / idx), Math.round((c.cash || 0) / idx), Math.round(f.profit / idx), (c.staff || 0) + (c.playerStaff || []).length, distress, c.abandoned ? 1 : 0, askF.get(c.id) || null]);
    }
    await conn.query('DELETE FROM player_props WHERE user_id = ?', [user.id]);
    const { propertyValue } = require('../game/core');
    for (const p of (state.properties || [])) {
      const L = lord.viewOf(world, state, p, year);
      await conn.query('INSERT INTO player_props (user_id, prop_id, city_id, name, kind, rooms, cond_pct, value_real, rent_real, tenant, residence, ask_real, rent_open) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [user.id, p.id, p.cityId, p.name, p.kind, p.rooms, Math.round(p.condition), Math.round(propertyValue(world, state, p, year) / idx), L.on ? Math.round(L.perDay / idx) : null, L.tenant ? 1 : 0, state.housing.type === 'own' && state.housing.propertyId === p.id ? 1 : 0, askP.get(p.id) || null, L.open ? 1 : 0]);
    }
  } catch (e) { log.error('[social] Statistik', e); }
}

/** Öffentliche Zeitungsmeldungen über Spieler (nur ausgewählte Ereignistypen, nur bei sichtbarem Profil). */
async function publishNews(conn, user, state, pressBefore) {
  try {
    const c = cfg(); if (!c.enabled || !c.news.publicEvents || !user.social_public) return;
    const fresh = (state.press || []).filter((p) => p.id > pressBefore && c.news.types.includes(p.type));
    for (const p of fresh) await conn.query('INSERT INTO public_news (city_id, user_id, section, title, text) VALUES (?,?,?,?,?)', [p.cityId || state.cityId || 0, user.id, p.section || 'Lokales', String(p.title).slice(0, 200), p.text]);
  } catch (e) { log.error('[social] public_news', e); }
}

async function backfillStats() {
  const world = await require('../game/world').get();
  const rows = await db.query("SELECT c.*, u.username, u.meta, u.social_public FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = (SELECT MAX(c2.id) FROM characters c2 WHERE c2.user_id = c.user_id) AND NOT EXISTS (SELECT 1 FROM player_stats ps WHERE ps.user_id = c.user_id) LIMIT 3000");
  for (const r of rows) {
    try { const user = { id: r.user_id, username: r.username, meta: JSON.parse(r.meta || '{}'), social_public: r.social_public }; await upsertStats(db, user, r, parseState(r.state), world); } catch (_) { /* defekter Spielstand */ }
  }
  return rows.length;
}

/** Alle aktuellen Charaktere neu veröffentlichen (Rangliste, Firmen, Häuser) – z. B. nach neuen Spalten. */
async function refreshAll(conn = db) {
  const world = await require('../game/world').get();
  const rows = await conn.query("SELECT c.*, u.username, u.meta, u.social_public FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = (SELECT MAX(c2.id) FROM characters c2 WHERE c2.user_id = c.user_id)");
  for (const r of rows) {
    try { const user = { id: r.user_id, username: r.username, meta: JSON.parse(r.meta || '{}'), social_public: r.social_public }; await upsertStats(conn, user, r, parseState(r.state), world); } catch (_) { /* defekter Spielstand */ }
  }
  return rows.length;
}

/** Stadtverzeichnis: Einwohner, Häuser und Betriebe einer Stadt (nur sichtbare Spieler), seitenweise. Beträge in Preisen von 1945. */
async function directory(userId, { cityId, tab = 'people', q = '', page = 1 }) {
  const per = 20; const off = (Math.max(1, int(page, 1)) - 1) * per; const like = `%${String(q).trim().slice(0, 40)}%`; const hasQ = String(q).trim().length > 0;
  const vis = 'u.social_public = 1 AND u.banned = 0';
  const online = Date.now() - cfg().onlineMinutes * 60000;
  if (tab === 'houses') {
    const w = `pp.city_id = ? AND ${vis}${hasQ ? ' AND (pp.name LIKE ? OR ps.name LIKE ? OR ps.username LIKE ?)' : ''}`; const prm = hasQ ? [cityId, like, like, like] : [cityId];
    const total = (await db.one(`SELECT COUNT(*) n FROM player_props pp JOIN users u ON u.id = pp.user_id JOIN player_stats ps ON ps.user_id = pp.user_id WHERE ${w}`, prm)).n;
    const rows = await db.query(`SELECT pp.*, ps.name owner, ps.username, u.role FROM player_props pp JOIN users u ON u.id = pp.user_id JOIN player_stats ps ON ps.user_id = pp.user_id WHERE ${w} ORDER BY pp.value_real DESC LIMIT ? OFFSET ?`, [...prm, per, off]);
    return { tab, total, page: Math.max(1, int(page, 1)), pages: Math.max(1, Math.ceil(total / per)), items: rows.map((r) => ({ userId: r.user_id, propId: r.prop_id, owner: r.owner, username: r.username, role: r.role !== 'player' ? r.role : undefined, name: r.name, kind: r.kind, rooms: r.rooms, cond: r.cond_pct, value: Number(r.value_real), rent: r.rent_real == null ? null : Number(r.rent_real), tenant: !!r.tenant, open: !!r.rent_open, residence: !!r.residence, ask: r.ask_real == null ? null : Number(r.ask_real), mine: r.user_id === userId })) };
  }
  if (tab === 'firms') {
    const w = `f.city_id = ? AND ${vis}${hasQ ? ' AND (f.name LIKE ? OR ps.name LIKE ? OR ps.username LIKE ?)' : ''}`; const prm = hasQ ? [cityId, like, like, like] : [cityId];
    const total = (await db.one(`SELECT COUNT(*) n FROM player_firms f JOIN users u ON u.id = f.user_id JOIN player_stats ps ON ps.user_id = f.user_id WHERE ${w}`, prm)).n;
    const rows = await db.query(`SELECT f.*, ps.name owner, ps.username, u.role, u.rivalry FROM player_firms f JOIN users u ON u.id = f.user_id JOIN player_stats ps ON ps.user_id = f.user_id WHERE ${w} ORDER BY f.value_real DESC LIMIT ? OFFSET ?`, [...prm, per, off]);
    return { tab, total, page: Math.max(1, int(page, 1)), pages: Math.max(1, Math.ceil(total / per)), items: rows.map((r) => ({ userId: r.user_id, id: r.company_id, owner: r.owner, username: r.username, role: r.role !== 'player' ? r.role : undefined, name: r.name, pkey: r.pkey, tier: r.tier, rooms: r.rooms, staff: r.staff, value: Number(r.value_real), profit: Number(r.profit_real), distress: !!r.distress, abandoned: !!r.abandoned, rival: !r.abandoned && (settings.get('rivalry').mode === 'all' || !!r.rivalry) && settings.get('rivalry').mode !== 'off', ask: r.ask_real == null ? null : Number(r.ask_real), mine: r.user_id === userId })) };
  }
  const w = `ps.city_id = ? AND ${VISIBLE}${hasQ ? ' AND (ps.name LIKE ? OR ps.username LIKE ?)' : ''}`; const prm = hasQ ? [cityId, like, like] : [cityId];
  const total = (await db.one(`SELECT COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${w}`, prm)).n;
  const rows = await db.query(`SELECT ps.*, u.last_seen_at, u.role FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${w} ORDER BY ps.wealth DESC LIMIT ? OFFSET ?`, [...prm, per, off]);
  return { tab: 'people', total, page: Math.max(1, int(page, 1)), pages: Math.max(1, Math.ceil(total / per)), items: rows.map((r) => ({ ...pub(r), online: !!(r.last_seen_at && new Date(r.last_seen_at).getTime() > online), me: r.user_id === userId })) };
}

const CATS = {
  wealth: { label: 'Vermögen', expr: 'ps.wealth', unit: 'money', hint: 'Geld, Immobilien und Betriebe. Alle Beträge sind auf den Geldwert von 1945 umgerechnet (Preise steigen im Lauf der Jahre) – so sind Spieler aus verschiedenen Jahren fair vergleichbar.' },
  business: { label: 'Unternehmer', expr: 'ps.biz_value', unit: 'money', hint: 'Wert aller Betriebe samt Firmenkasse (inflationsbereinigt).' },
  politics: { label: 'Politik', expr: 'ps.influence', unit: 'pts', hint: 'Einfluss, den du über alle Leben gesammelt hast.' },
  dynasty: { label: 'Dynastie', expr: 'ps.generation * 1000 + ps.cycle', unit: 'gen', hint: 'Wie viele Generationen deine Familie schon trägt.' },
  family: { label: 'Familie', expr: 'ps.children * 1000 + ps.generation', unit: 'kids', hint: 'Anzahl der Kinder.' },
  time: { label: 'Zeitreise', expr: 'ps.days', unit: 'days', hint: 'Wie weit du in der Zeit gekommen bist.' },
};
const VISIBLE = "u.social_public = 1 AND u.banned = 0";

async function friendIds(userId) {
  const rows = await db.query("SELECT IF(user_a = ?, user_b, user_a) id FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'", [userId, userId, userId]);
  return rows.map((r) => r.id);
}

async function leaderboard(userId, { cat = 'wealth', scope = 'all', cityId = 0 } = {}) {
  const C = CATS[cat] || CATS.wealth; const size = Math.min(100, cfg().leaderboardSize);
  const conds = [VISIBLE]; const params = [];
  if (scope === 'city' && cityId) { conds.push('ps.city_id = ?'); params.push(cityId); }
  if (scope === 'friends') { const f = await friendIds(userId); f.push(userId); conds.push(`ps.user_id IN (${f.map(() => '?').join(',')})`); params.push(...f); }
  const where = conds.join(' AND ');
  const rows = await db.query(
    `SELECT ps.*, ${C.expr} AS score, u.last_seen_at, u.bio, u.role FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${where} ORDER BY score DESC, ps.user_id ASC LIMIT ?`, [...params, size]);
  const total = (await db.one(`SELECT COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${where}`, params)).n;
  const online = Date.now() - cfg().onlineMinutes * 60000;
  const out = rows.map((r, i) => ({ rank: i + 1, ...pub(r), score: Number(r.score), online: r.last_seen_at && new Date(r.last_seen_at).getTime() > online, me: r.user_id === userId }));
  let me = out.find((x) => x.me) || null;
  if (!me) {
    const mine = await db.one(`SELECT ps.*, ${C.expr} AS score, u.social_public, u.role FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ps.user_id = ?`, [userId]);
    if (mine) {
      const ahead = (await db.one(`SELECT COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${where} AND (${C.expr} > ? OR (${C.expr} = ? AND ps.user_id < ?))`, [...params, mine.score, mine.score, userId])).n;
      me = { rank: ahead + 1, ...pub(mine), score: Number(mine.score), me: true, hidden: !mine.social_public };
    }
  }
  return { cat, scope, label: C.label, unit: C.unit, hint: C.hint, total, rows: out, me, cats: Object.entries(CATS).map(([k, v]) => ({ key: k, label: v.label })) };
}
function pub(r) {
  return { userId: r.user_id, role: r.role && r.role !== 'player' ? r.role : undefined, username: r.username, name: r.name, cityId: r.city_id, year: r.year, status: r.status, wealth: Number(r.wealth), bizValue: Number(r.biz_value), companies: r.companies, properties: r.properties, children: r.children, generation: r.generation, cycle: r.cycle, influence: r.influence, office: r.office, days: r.days, occupation: r.occupation };
}

/* =============================== Profile & Beziehungen =============================== */
const pair = (a, b) => (a < b ? [a, b] : [b, a]);
async function relation(me, other) {
  if (me === other) return 'self';
  const [a, b] = pair(me, other);
  const f = await db.one('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?', [a, b]);
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friend';
  if (f.status === 'blocked') return f.requester === me ? 'blocked' : 'blocked_by';
  return f.requester === me ? 'pending_out' : 'pending_in';
}

async function profile(viewerId, targetId) {
  const u = await db.one("SELECT id, username, bio, created_at, last_seen_at, social_public, banned, role FROM users WHERE id = ?", [targetId]);
  if (!u || u.banned) fail('Dieses Profil gibt es nicht.');
  const rel = await relation(viewerId, targetId);
  const visible = u.social_public || rel === 'self' || rel === 'friend';
  const ps = await db.one('SELECT * FROM player_stats WHERE user_id = ?', [targetId]);
  const online = u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < cfg().onlineMinutes * 60000;
  const base = { id: u.id, role: u.role !== 'player' ? u.role : undefined, username: u.username, relation: rel, online: !!online, joined: u.created_at, lastSeen: visible ? u.last_seen_at : null, visible };
  if (!visible || !ps) return { ...base, bio: null, stats: null, firms: [], ranks: {} };
  const firms = await db.query('SELECT company_id id, city_id cityId, name, pkey, tier, rooms FROM player_firms WHERE user_id = ?', [targetId]);
  const ranks = {};
  for (const [k, C] of Object.entries(CATS)) {
    const ahead = (await db.one(`SELECT COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${VISIBLE} AND (${C.expr} > (SELECT ${C.expr.replace(/ps\./g, 'p2.')} FROM player_stats p2 WHERE p2.user_id = ?) )`, [targetId])).n;
    ranks[k] = ahead + 1;
  }
  return { ...base, bio: u.bio, stats: pub(ps), firms, ranks };
}

async function setProfile(userId, { bio, social_public }) {
  const text = String(bio == null ? '' : bio).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 240);
  await db.query('UPDATE users SET bio = ?, social_public = ? WHERE id = ?', [text || null, social_public ? 1 : 0, userId]);
}

async function myProfile(userId) {
  const u = await db.one('SELECT bio, social_public FROM users WHERE id = ?', [userId]);
  return { profile: await profile(userId, userId), bio: u ? u.bio : '', public: !!(u && u.social_public) };
}

async function listFriends(userId) {
  const rows = await db.query(
    `SELECT f.status, f.requester, IF(f.user_a = ?, f.user_b, f.user_a) other FROM friendships f WHERE (f.user_a = ? OR f.user_b = ?) AND f.status <> 'blocked'`, [userId, userId, userId]);
  const ids = rows.map((r) => r.other);
  const info = ids.length ? await db.query(`SELECT u.id, u.username, u.role, u.last_seen_at, ps.name, ps.city_id, ps.year, ps.wealth FROM users u LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE u.id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const map = new Map(info.map((i) => [i.id, i])); const online = Date.now() - cfg().onlineMinutes * 60000;
  const shape = (r) => { const i = map.get(r.other) || {}; return { userId: r.other, role: i.role && i.role !== 'player' ? i.role : undefined, username: i.username, name: i.name, cityId: i.city_id, year: i.year, wealth: Number(i.wealth || 0), online: !!(i.last_seen_at && new Date(i.last_seen_at).getTime() > online) }; };
  return {
    friends: rows.filter((r) => r.status === 'accepted').map(shape),
    incoming: rows.filter((r) => r.status === 'pending' && r.requester !== userId).map(shape),
    outgoing: rows.filter((r) => r.status === 'pending' && r.requester === userId).map(shape),
  };
}
async function friendRequest(from, to) {
  if (from === to) fail('Das bist du selbst.');
  const t = await db.one('SELECT id FROM users WHERE id = ? AND banned = 0', [to]); if (!t) fail('Spieler nicht gefunden.');
  const [a, b] = pair(from, to); const ex = await db.one('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?', [a, b]);
  if (ex) {
    if (ex.status === 'blocked') fail('Diese Person ist nicht erreichbar.');
    if (ex.status === 'accepted') fail('Ihr seid schon befreundet.');
    if (ex.requester !== from) { await db.query("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?", [a, b]); return 'accepted'; }
    fail('Die Anfrage läuft schon.');
  }
  const pend = (await db.one("SELECT COUNT(*) n FROM friendships WHERE requester = ? AND status = 'pending'", [from])).n;
  if (pend >= 30) fail('Du hast schon viele offene Freundschaftsanfragen. Warte, bis einige beantwortet sind.');
  const n = (await db.one("SELECT COUNT(*) n FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'", [from, from])).n;
  if (n >= cfg().friends.max) fail('Deine Freundesliste ist voll.');
  await db.query("INSERT INTO friendships (user_a, user_b, requester, status) VALUES (?,?,?, 'pending')", [a, b, from]);
  await sendSystemLetter(to, 'Freundschaftsanfrage', 'Jemand möchte dein Freund werden. Antworte unter „Spieler → Freunde“.', from);
  return 'pending';
}
async function friendRespond(me, other, accept) {
  const [a, b] = pair(me, other); const f = await db.one('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?', [a, b]);
  if (!f || f.status !== 'pending' || f.requester === me) fail('Keine offene Anfrage.');
  if (accept) await db.query("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?", [a, b]);
  else await db.query('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', [a, b]);
}
async function friendRemove(me, other, block) {
  const [a, b] = pair(me, other);
  await db.query('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', [a, b]);
  if (block) await db.query("INSERT INTO friendships (user_a, user_b, requester, status) VALUES (?,?,?, 'blocked')", [a, b, me]);
}

/* =============================== Briefe =============================== */
const clean = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
/** Enthält der Text eine Web-Adresse? (http/https/www oder Domain-Endung) – Chat und Briefe neuer Konten sind frei von Werbelinks. */
const LINK_RE = /(?:https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(?:com|net|org|de|info|biz|ru|cn|xyz|top|club|shop|online|site|link|tk)\b|\bt\.me\/|\bdiscord\.gg\/)/i;
const hasLink = (t) => LINK_RE.test(String(t == null ? '' : t));
async function accountAgeHours(userId) { const u = await db.one('SELECT created_at, mute_until FROM users WHERE id = ?', [userId]); return u ? { h: (Date.now() - new Date(u.created_at).getTime()) / 3600000, mute: Number(u.mute_until || 0) } : { h: 0, mute: 0 }; }
async function sendSystemLetter(to, subject, body, fromUser = null) {
  require('./live').publish('social', {}, to);
  await db.query("INSERT INTO messages (from_user, to_user, kind, subject, body) VALUES (?,?,?,?,?)", [fromUser, to, 'system', subject, body]);
  const cat = push.categoryFor(subject); push.fire(to, { title: subject, body, cat, tag: cat }); // Web-Push (nie blockierend, nie Fehler)
}

function notifyLetter(from, to) {
  require('./live').publish('social', {}, to);
  db.one('SELECT ps.name FROM player_stats ps WHERE ps.user_id = ?', [from]).then((ps) => push.fire(to, { title: 'Neuer Brief', body: ps && ps.name ? `Von ${ps.name}` : 'Du hast Post bekommen.', cat: 'letters', tab: 'letters', tag: 'letter', en: { title: 'New letter', body: ps && ps.name ? `From ${ps.name}` : 'You have new mail.' } })).catch(() => {});
}
async function sendLetter(from, to, subject, body) {
  const c = cfg().messages; if (!cfg().enabled) fail('Die Gemeinschaftsfunktionen sind gerade abgeschaltet.');
  if (from === to) fail('Briefe an dich selbst sind nicht nötig.');
  const t = await db.one('SELECT id FROM users WHERE id = ? AND banned = 0', [to]); if (!t) fail('Empfänger nicht gefunden.');
  const a = await accountAgeHours(from);
  if (a.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.');
  if (a.h < c.minAccountHours) fail(`Neue Konten können erst nach ${c.minAccountHours} Stunden Briefe schreiben.`);
  const rel = await relation(from, to); if (rel === 'blocked' || rel === 'blocked_by') fail('Dieser Spieler ist nicht erreichbar.');
  const n = (await db.one("SELECT COUNT(*) n FROM messages WHERE from_user = ? AND kind = 'letter' AND created_at > NOW() - INTERVAL 1 DAY", [from])).n;
  if (n >= c.perDay) fail(`Du hast heute schon ${c.perDay} Briefe geschrieben.`);
  const text = clean(body, c.maxLen); if (text.length < 2) fail('Der Brief ist leer.');
  const subj = clean(subject, 120) || '(ohne Betreff)';
  if (a.h < 48 && (hasLink(text) || hasLink(subj))) fail('Neue Konten können in den ersten 48 Stunden keine Links verschicken.');
  const dup = await db.one("SELECT 1 x FROM messages WHERE from_user = ? AND kind = 'letter' AND body = ? AND created_at > NOW() - INTERVAL 1 DAY LIMIT 1", [from, text]);
  if (dup) fail('Diesen Brief hast du heute schon verschickt.');
  const r = await db.query("INSERT INTO messages (from_user, to_user, kind, subject, body) VALUES (?,?,'letter',?,?)", [from, to, subj, text]);
  if (n >= Math.floor(c.perDay * 0.8)) anticheat.flag(from, 'chat_spam', `${n + 1} Briefe in 24 Stunden`);
  notifyLetter(from, to); // Inhalt bleibt aus dem Push (Spielereingabe, Datenschutz auf dem Sperrbildschirm)
  return r.insertId;
}
async function inbox(userId, box = 'in', page = 1) {
  const per = 20; const out = box === 'out';
  const rows = await db.query(
    `SELECT m.id, m.kind, m.subject, LEFT(m.body, 140) preview, m.created_at, m.read_at, m.reported, m.from_user, m.to_user, u.username other_name, ps.name other_char
     FROM messages m LEFT JOIN users u ON u.id = ${out ? 'm.to_user' : 'm.from_user'} LEFT JOIN player_stats ps ON ps.user_id = u.id
     WHERE ${out ? 'm.from_user = ? AND m.del_from = 0' : 'm.to_user = ? AND m.del_to = 0'} ORDER BY m.id DESC LIMIT ? OFFSET ?`, [userId, per, (page - 1) * per]);
  const total = (await db.one(`SELECT COUNT(*) n FROM messages WHERE ${out ? 'from_user = ? AND del_from = 0' : 'to_user = ? AND del_to = 0'}`, [userId])).n;
  return { box, page, pages: Math.max(1, Math.ceil(total / per)), total, items: rows.map((r) => ({ id: r.id, kind: r.kind, subject: r.subject, preview: r.preview, at: r.created_at, unread: !out && !r.read_at, reported: !!r.reported, otherId: out ? r.to_user : r.from_user, other: r.kind === 'system' && !out ? 'Das Postamt' : (r.other_char ? `${r.other_char}` : r.other_name || 'Gelöschtes Konto'), otherUser: r.other_name })) };
}
async function readLetter(userId, id) {
  const m = await db.one('SELECT m.*, f.username from_name, fp.name from_char, t.username to_name, tp.name to_char FROM messages m LEFT JOIN users f ON f.id = m.from_user LEFT JOIN player_stats fp ON fp.user_id = f.id LEFT JOIN users t ON t.id = m.to_user LEFT JOIN player_stats tp ON tp.user_id = t.id WHERE m.id = ?', [id]);
  if (!m || !((m.to_user === userId && !m.del_to) || (m.from_user === userId && !m.del_from))) fail('Brief nicht gefunden.');
  if (m.to_user === userId && !m.read_at) await db.query('UPDATE messages SET read_at = NOW() WHERE id = ?', [id]);
  return { id: m.id, kind: m.kind, subject: m.subject, body: m.body, at: m.created_at, fromId: m.from_user, from: m.kind === 'system' ? 'Das Postamt' : (m.from_char || m.from_name), toId: m.to_user, to: m.to_char || m.to_name, mine: m.from_user === userId };
}
async function deleteLetter(userId, id) {
  const m = await db.one('SELECT from_user, to_user FROM messages WHERE id = ?', [id]); if (!m) return;
  if (m.to_user === userId) await db.query('UPDATE messages SET del_to = 1 WHERE id = ?', [id]);
  if (m.from_user === userId) await db.query('UPDATE messages SET del_from = 1 WHERE id = ?', [id]);
}
async function report(userId, kind, refId, reason) {
  let target = null;
  if (kind === 'letter') { const m = await db.one('SELECT from_user, to_user FROM messages WHERE id = ?', [refId]); if (!m || m.to_user !== userId) fail('Nur erhaltene Briefe können gemeldet werden.'); target = m.from_user; await db.query('UPDATE messages SET reported = 1 WHERE id = ?', [refId]); }
  else if (kind === 'chat') { const m = await db.one('SELECT user_id FROM chat_messages WHERE id = ?', [refId]); if (!m) fail('Nachricht nicht gefunden.'); target = m.user_id; }
  else if (kind === 'player') { if (!(await db.one('SELECT id FROM users WHERE id = ?', [refId]))) fail('Spieler nicht gefunden.'); target = refId; }
  else fail('Unbekannte Meldung.');
  if ((await db.one("SELECT COUNT(*) n FROM reports WHERE reporter = ? AND created_at > NOW() - INTERVAL 1 DAY", [userId])).n >= 20) fail('Du hast heute schon sehr viele Meldungen abgeschickt.');
  const dup = await db.one("SELECT id FROM reports WHERE reporter = ? AND kind = ? AND ref_id = ? AND status = 'open'", [userId, kind, refId]);
  if (!dup) await db.query('INSERT INTO reports (reporter, target_user, kind, ref_id, reason) VALUES (?,?,?,?,?)', [userId, target, kind, refId, clean(reason, 300)]);
}
async function summary(userId) {
  const un = (await db.one('SELECT COUNT(*) n FROM messages WHERE to_user = ? AND del_to = 0 AND read_at IS NULL', [userId])).n;
  const rq = (await db.one("SELECT COUNT(*) n FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'pending' AND requester <> ?", [userId, userId, userId])).n;
  let rank = null;
  const me = await db.one(`SELECT ps.wealth, ps.city_id FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ps.user_id = ? AND u.social_public = 1`, [userId]);
  if (me) {
    const ahead = (await db.one(`SELECT COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${VISIBLE} AND (ps.wealth > ? OR (ps.wealth = ? AND ps.user_id < ?))`, [me.wealth, me.wealth, userId])).n;
    const total = (await db.one(`SELECT COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${VISIBLE}`)).n;
    const online = (await db.one(`SELECT COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ps.city_id = ? AND ps.user_id <> ? AND u.social_public = 1 AND u.banned = 0 AND u.last_seen_at > NOW() - INTERVAL ? MINUTE`, [me.city_id, userId, cfg().onlineMinutes])).n;
    rank = { wealth: ahead + 1, total, onlineHere: online };
  }
  const extra = await openRequests(userId);
  const cityId = me ? me.city_id : (await myCity(userId));
  const chatLast = cityId ? ((await db.one('SELECT MAX(id) m FROM chat_messages WHERE city_id = ? AND deleted = 0', [cityId])).m || 0) : 0;
  const chatLastMine = cityId ? ((await db.one('SELECT MAX(id) m FROM chat_messages WHERE city_id = ? AND user_id = ? AND deleted = 0', [cityId, userId])).m || 0) : 0;
  return { unread: un, requests: rq, couples: extra.couples, jobs: extra.jobs, offers: extra.offers, total: un + rq + extra.couples + extra.jobs + extra.offers, rank, chat: { cityId, last: chatLast, lastMine: chatLastMine } };
}

async function openRequests(userId) {
  const couples = (await db.one("SELECT COUNT(*) n FROM couples WHERE (user_a = ? OR user_b = ?) AND ((status = 'request' AND initiator <> ?) OR (status = 'engaged' AND engaged_by IS NOT NULL AND engaged_by <> ?))", [userId, userId, userId, userId])).n;
  const jobs = (await db.one("SELECT COUNT(*) n FROM job_apps a JOIN player_jobs j ON j.id = a.offer_id WHERE a.status = 'pending' AND ((a.kind = 'apply' AND j.owner_id = ?) OR (a.kind = 'invite' AND a.user_id = ?))", [userId, userId])).n;
  const offers = (await db.one("SELECT COUNT(*) n FROM market_offers WHERE status = 'open' AND expires_at > NOW() AND proposer <> ? AND (buyer_id = ? OR seller_id = ?)", [userId, userId, userId])).n;
  return { couples, jobs, offers };
}

/** Glocke: wer hat dir was geschickt? (ungelesene Briefe, Freundschafts-/Beziehungsanfragen, Bewerbungen) */
async function notifications(userId) {
  const items = [];
  const letters = await db.query(`SELECT m.id, m.kind, m.subject, m.created_at, u.username, ps.name char_name FROM messages m LEFT JOIN users u ON u.id = m.from_user LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE m.to_user = ? AND m.del_to = 0 AND m.read_at IS NULL ORDER BY m.id DESC LIMIT 12`, [userId]);
  for (const l of letters) items.push({ kind: l.kind === 'system' ? 'system' : 'letter', id: l.id, from: l.kind === 'system' ? 'Das Postamt' : (l.char_name || l.username), fromId: null, subject: l.subject, at: l.created_at });
  const fr = await db.query(`SELECT f.created_at, u.id uid, u.username, ps.name char_name FROM friendships f JOIN users u ON u.id = IF(f.user_a = ?, f.user_b, f.user_a) LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'pending' AND f.requester <> ? ORDER BY f.created_at DESC LIMIT 8`, [userId, userId, userId, userId]);
  for (const f of fr) items.push({ kind: 'friend', from: f.char_name || f.username, fromId: f.uid, subject: 'Freundschaftsanfrage', at: f.created_at });
  const cp = await db.query(`SELECT c.created_at, c.status, u.id uid, u.username, ps.name char_name FROM couples c JOIN users u ON u.id = IF(c.user_a = ?, c.user_b, c.user_a) LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE (c.user_a = ? OR c.user_b = ?) AND ((c.status = 'request' AND c.initiator <> ?) OR (c.status = 'engaged' AND c.engaged_by IS NOT NULL AND c.engaged_by <> ?)) LIMIT 4`, [userId, userId, userId, userId, userId]);
  for (const c of cp) items.push({ kind: 'couple', from: c.char_name || c.username, fromId: c.uid, subject: c.status === 'engaged' ? 'Heiratsantrag' : 'Beziehungsanfrage', at: c.created_at });
  const jb = await db.query(`SELECT a.created_at, a.kind, j.title, u.id uid, u.username, ps.name char_name FROM job_apps a JOIN player_jobs j ON j.id = a.offer_id JOIN users u ON u.id = IF(a.kind = 'apply', a.user_id, j.owner_id) LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE a.status = 'pending' AND ((a.kind = 'apply' AND j.owner_id = ?) OR (a.kind = 'invite' AND a.user_id = ?)) ORDER BY a.created_at DESC LIMIT 6`, [userId, userId]);
  for (const j of jb) items.push({ kind: 'job', from: j.char_name || j.username, fromId: j.uid, subject: (j.kind === 'apply' ? 'Bewerbung: ' : 'Einladung: ') + j.title, at: j.created_at });
  const of = await db.query("SELECT o.created_at, o.item_name, o.price_real, o.parent_id, ps.name, ps.user_id uid FROM market_offers o JOIN player_stats ps ON ps.user_id = o.proposer WHERE o.status = 'open' AND o.expires_at > NOW() AND o.proposer <> ? AND (o.buyer_id = ? OR o.seller_id = ?) ORDER BY o.id DESC LIMIT 6", [userId, userId, userId]);
  for (const o of of) items.push({ kind: 'offer', from: o.name, fromId: o.uid, subject: (o.parent_id ? 'Gegenangebot: ' : 'Kaufangebot: ') + o.item_name, at: o.created_at });
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return { items: items.slice(0, 20) };
}

/* =============================== Stadtplatz-Chat =============================== */
const lastChat = new Map();
function mask(text) {
  let t = text;
  for (const w of cfg().chat.blocked || []) { if (!w) continue; const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); t = t.replace(re, (m) => '*'.repeat(m.length)); }
  return t;
}
async function myCity(userId) { const r = await db.one('SELECT city_id FROM player_stats WHERE user_id = ?', [userId]); return r ? r.city_id : null; }
async function chatList(userId, cityId, after = 0) {
  const home = await myCity(userId); if (!home) fail('Beginne zuerst ein Leben, um am Stadtplatz teilzunehmen.');
  if (cityId !== home) fail('Am Stadtplatz sprichst du nur mit den Menschen deiner Stadt.');
  const rows = await db.query(`SELECT c.id, c.user_id, c.name, c.text, c.created_at, u.username, u.role FROM chat_messages c JOIN users u ON u.id = c.user_id WHERE c.city_id = ? AND c.deleted = 0 AND c.id > ? ORDER BY c.id DESC LIMIT 60`, [cityId, after]);
  const online = await db.query(`SELECT ps.user_id userId, ps.name, ps.occupation, u.role FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ps.city_id = ? AND u.banned = 0 AND u.social_public = 1 AND u.last_seen_at > NOW() - INTERVAL ? MINUTE ORDER BY u.last_seen_at DESC LIMIT 40`, [cityId, cfg().onlineMinutes]);
  return { messages: rows.reverse().map((r) => ({ id: r.id, userId: r.user_id, name: r.name, username: r.username, role: r.role !== 'player' ? r.role : undefined, text: r.text, at: r.created_at, mine: r.user_id === userId })), online };
}
/** „@spielername“ im Stadtplatz-Chat: Erwähnte Spieler derselben Stadt bekommen einen Push (höchstens 3 je Nachricht). */
const mentionsIn = (text) => [...new Set((String(text).match(/@([\p{L}\p{N}_.-]{2,40})/gu) || []).map((m) => m.slice(1).toLowerCase()))].slice(0, 3);
function notifyMentions(cityId, fromId, fromName, text) {
  const names = mentionsIn(text); if (!names.length) return;
  db.query(`SELECT u.id FROM users u JOIN player_stats ps ON ps.user_id = u.id WHERE ps.city_id = ? AND u.id <> ? AND u.banned = 0 AND LOWER(u.username) IN (${names.map(() => '?').join(',')})`, [cityId, fromId, ...names])
    .then((rows) => rows.forEach((r) => push.fire(r.id, { title: `${fromName} im Stadtplatz-Chat`, body: text, cat: 'chat', tab: 'plaza', tag: 'chat', en: { title: `${fromName} in the town square chat`, body: text } })))
    .catch(() => {});
}
async function chatSend(userId, cityId, text) {
  const c = cfg().chat; if (!cfg().enabled || !c.enabled) fail('Der Stadtplatz ist gerade geschlossen.');
  const home = await myCity(userId); if (!home || home !== cityId) fail('Du bist nicht in dieser Stadt.');
  const a = await accountAgeHours(userId);
  if (a.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.');
  if (a.h < c.minAccountHours) fail(`Neue Konten können erst nach ${c.minAccountHours} Stunde(n) mitreden.`);
  const now = Date.now(); const last = lastChat.get(userId) || { t: 0, text: '', n: 0 };
  if (now - last.t < c.cooldownSec * 1000) fail('Langsam – bitte kurz warten.');
  const t = clean(text, c.maxLen).replace(/\n+/g, ' '); if (!t) fail('Die Nachricht ist leer.');
  if (hasLink(t)) fail('Links sind im Stadtplatz-Chat nicht erlaubt.');
  if (t.toLowerCase() === last.text && now - last.t < 60000) { last.n++; if (last.n >= 3) anticheat.flag(userId, 'chat_spam', 'Wiederholte identische Chat-Nachrichten'); fail('Das hast du gerade schon geschrieben.'); }
  if (lastChat.size > 5000) for (const [k, v] of lastChat) if (now - v.t > 600000) lastChat.delete(k);
  lastChat.set(userId, { t: now, text: t.toLowerCase(), n: 0 });
  const ps = await db.one('SELECT name FROM player_stats WHERE user_id = ?', [userId]);
  const r = await db.query('INSERT INTO chat_messages (city_id, user_id, name, text) VALUES (?,?,?,?)', [cityId, userId, ps ? ps.name : 'Unbekannt', mask(t)]);
  notifyMentions(cityId, userId, ps ? ps.name : 'Jemand', t);
  require("./live").publish("chat", { cityId });
  return r.insertId;
}

/* =============================== Geschenke & Besuche (Transaktionen über zwei Spieler) =============================== */
const service = require('../game/service');
async function sameIp(a, b) { return !!(await db.one('SELECT 1 x FROM user_ips x JOIN user_ips y ON y.ip = x.ip WHERE x.user_id = ? AND y.user_id = ? LIMIT 1', [a, b])); }

async function lockPair(conn, a, b) {
  const ids = [a, b].sort((x, y) => x - y);
  await conn.query('SELECT id FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE', ids);
  const rowA = await service.activeRow(conn, a); const rowB = await service.activeRow(conn, b);
  if (!rowA || rowA.status !== 'alive') fail('Du hast keinen lebenden Charakter.');
  if (!rowB || rowB.status !== 'alive') fail('Die andere Person spielt gerade keinen lebenden Charakter.');
  return { rowA, rowB, sA: parseState(rowA.state), sB: parseState(rowB.state) };
}

async function gift(from, to, amountMoney) {
  const G = cfg().gifts; const world = await require('../game/world').get();
  if (!cfg().enabled || !G.enabled) fail('Geschenke sind gerade nicht möglich.');
  if (from === to) fail('Du kannst dir nicht selbst etwas schenken.');
  const target = await db.one('SELECT id, banned, role FROM users WHERE id = ?', [to]); if (!target || target.banned) fail('Empfänger nicht gefunden.');
  const a = await accountAgeHours(from); if (a.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.');
  if (a.h < G.minAccountHours) fail(`Geschenke sind erst ${G.minAccountHours} Stunden nach der Registrierung möglich.`);
  const rel = await relation(from, to); if (rel === 'blocked' || rel === 'blocked_by') fail('Dieser Spieler ist nicht erreichbar.');
  if (G.blockSameIp && await sameIp(from, to)) { anticheat.flag(from, 'gift_ring', `Geschenkversuch an ein Konto mit gleicher IP (Nutzer ${to})`); fail('Zwischen Konten, die dieselbe Internetverbindung nutzen, sind keine Geschenke erlaubt.'); }
  const cents = Math.round(Number(amountMoney) * 100); if (!Number.isFinite(cents) || cents < 100) fail('Der Betrag ist zu klein.');
  return db.tx(async (conn) => {
    const { rowA, rowB, sA, sB } = await lockPair(conn, from, to);
    if (sA.day < G.minGameDays) fail(`Dein Charakter muss mindestens ${G.minGameDays} Spieltage alt sein.`);
    const idxA = world.idx(yearOf(sA.day, sA.startYear)); const idxB = world.idx(yearOf(sB.day, sB.startYear));
    if (sA.money - cents < 0) fail('Dafür reicht dein Geld nicht.');
    const real = cents / idxA;
    if (real > (netWorth(world, sA) / idxA) * (G.maxPctOfWealth / 100)) fail(`Du kannst höchstens ${G.maxPctOfWealth} % deines Vermögens auf einmal verschenken.`);
    const day = await conn.one("SELECT COALESCE(SUM(amount),0) s FROM social_log WHERE kind = 'gift' AND from_user = ? AND created_at > NOW() - INTERVAL 1 DAY", [from]);
    if (Number(day.s) + real > G.dailyCapCents) fail(`Tageslimit für Geschenke: ${(G.dailyCapCents / 100).toLocaleString('de-DE')} (Kaufkraft von 1945) – bereits genutzt: ${(Number(day.s) / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })}.`);
    const recvDay = await conn.one("SELECT COALESCE(SUM(amount),0) s FROM social_log WHERE kind = 'gift' AND to_user = ? AND created_at > NOW() - INTERVAL 1 DAY", [to]);
    if (Number(recvDay.s) + real > G.dailyReceiveCents) fail('Diese Person kann heute keine weiteren Geschenke mehr annehmen.');
    const got = Math.round(real * (1 - G.feePct / 100) * idxB);
    sA.money -= cents; sA.stats.spent += cents; sB.money += got; sB.stats.earned += got;
    const cur = (y) => (y >= (world.econ.euroYear || 2002) ? 'EUR' : 'DM');
    const fmt = (v, st) => `${(v / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur(yearOf(st.day, st.startYear)) === 'EUR' ? '€' : 'DM'}`;
    notice(sA, { level: 'good', title: 'Geschenk verschickt', text: `${sB.person.first} ${sB.person.last} erhält ${fmt(got, sB)}.` });
    notice(sB, { level: 'good', title: 'Ein Geschenk ist angekommen!', text: `${sA.person.first} ${sA.person.last} hat dir ${fmt(got, sB)} geschickt.`, interrupt: true, tab: 'social' });
    await service.saveCharacter(conn, rowA, sA); await service.saveCharacter(conn, rowB, sB);
    await conn.query("INSERT INTO social_log (kind, from_user, to_user, amount, ref) VALUES ('gift',?,?,?,NULL)", [from, to, Math.round(real)]);
    await conn.query("INSERT INTO messages (from_user, to_user, kind, subject, body) VALUES (?,?, 'system', 'Geschenk', ?)", [from, to, `${sA.person.first} ${sA.person.last} hat dir ${fmt(got, sB)} geschenkt.`]);
    const pairN = await conn.one("SELECT COUNT(*) n FROM social_log WHERE kind = 'gift' AND from_user = ? AND to_user = ? AND created_at > NOW() - INTERVAL 7 DAY", [from, to]);
    if (pairN.n >= 5) anticheat.flag(from, 'gift_ring', `${pairN.n} Geschenke an dieselbe Person in 7 Tagen (Nutzer ${to})`);
    return { sent: cents, received: got, view: null, stateA: sA };
  });
}

async function visit(visitor, owner, companyId) {
  const V = cfg().visit; const world = await require('../game/world').get();
  if (!cfg().enabled || !V.enabled) fail('Besuche sind gerade nicht möglich.');
  if (visitor === owner) fail('Im eigenen Betrieb arbeitest du – schau unter „Unternehmen“.');
  const firm = await db.one('SELECT * FROM player_firms WHERE user_id = ? AND company_id = ?', [owner, companyId]); if (!firm) fail('Diesen Betrieb gibt es nicht mehr.');
  const o = await db.one('SELECT banned FROM users WHERE id = ?', [owner]); if (!o || o.banned) fail('Dieser Betrieb ist nicht erreichbar.');
  if (await sameIp(visitor, owner)) { anticheat.flag(visitor, 'gift_ring', `Besuch im Betrieb eines Kontos mit gleicher IP (Nutzer ${owner})`); fail('Bei Konten mit derselben Internetverbindung ist das nicht erlaubt.'); }
  const cd = await db.one("SELECT created_at FROM social_log WHERE kind = 'visit' AND from_user = ? AND ref = ? AND created_at > NOW() - INTERVAL ? MINUTE ORDER BY id DESC LIMIT 1", [visitor, `${owner}:${companyId}`, V.cooldownMin]);
  if (cd) fail(`Du warst gerade erst dort – komm in ${V.cooldownMin} Minuten wieder.`);
  return db.tx(async (conn) => {
    const { rowA, rowB, sA, sB } = await lockPair(conn, visitor, owner);
    const c = (sB.companies || []).find((x) => x.id === companyId); if (!c || c.abandoned) fail('Der Betrieb hat geschlossen.');
    if (sA.cityId !== c.cityId) fail('Dafür musst du in derselben Stadt wohnen.');
    const tier = Math.min(2, c.tier); const idxA = world.idx(yearOf(sA.day, sA.startYear)); const idxB = world.idx(yearOf(sB.day, sB.startYear));
    const price = scale(V.price[tier], idxA);
    if (sA.money < price) fail('Dafür reicht dein Geld nicht.');
    const real = price / idxA; const income = Math.round(real * (V.ownerSharePct / 100) * idxB);
    sA.money -= price; sA.stats.spent += price; c.cash += income; sB.stats.earned += 0;
    const boost = V.wellbeing[tier]; sA.meters.wellbeing = clamp(sA.meters.wellbeing + boost, 0, 100);
    c.guests = (c.guests || 0) + 1;
    notice(sA, { level: 'good', title: `Besuch bei ${c.name}`, text: `Du hast dir etwas gegönnt (+${boost} Wohlbefinden) und ${sB.person.first} ${sB.person.last} damit den Umsatz gesteigert.` });
    notice(sB, { level: 'good', title: `Gast bei ${c.name}`, text: `${sA.person.first} ${sA.person.last} war zu Besuch – ${(income / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} wanderten in die Firmenkasse.`, tab: 'business' });
    await service.saveCharacter(conn, rowA, sA); await service.saveCharacter(conn, rowB, sB);
    await conn.query("INSERT INTO social_log (kind, from_user, to_user, amount, ref) VALUES ('visit',?,?,?,?)", [visitor, owner, Math.round(real), `${owner}:${companyId}`]);
    return { paid: price, boost, name: c.name, stateA: sA };
  });
}

async function firmsInCity(userId, cityId) {
  const rows = await db.query(`SELECT f.user_id userId, f.company_id id, f.name, f.pkey, f.tier, f.rooms, ps.name owner, u.username FROM player_firms f JOIN users u ON u.id = f.user_id JOIN player_stats ps ON ps.user_id = f.user_id WHERE f.city_id = ? AND f.user_id <> ? AND u.banned = 0 AND u.social_public = 1 ORDER BY f.tier DESC, f.rooms DESC LIMIT 30`, [cityId, userId]);
  return rows;
}
async function publicNews(cityId) {
  const days = cfg().news.keepDays;
  return db.query('SELECT n.id, n.section, n.title, n.text, n.created_at, n.user_id, u.username FROM public_news n JOIN users u ON u.id = n.user_id WHERE n.city_id = ? AND n.created_at > NOW() - INTERVAL ? DAY ORDER BY n.id DESC LIMIT 12', [cityId, days]);
}

async function search(userId, q) {
  const t = String(q || '').trim().slice(0, 40); if (t.length < 2) return [];
  const rows = await db.query(`SELECT ps.user_id userId, ps.username, ps.name, ps.city_id cityId, ps.year, u.role FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ${VISIBLE} AND ps.user_id <> ? AND (ps.username LIKE ? OR ps.name LIKE ?) ORDER BY ps.username LIMIT 12`, [userId, `%${t}%`, `%${t}%`]);
  return rows;
}

async function prune() {
  const c = cfg();
  await db.query('DELETE FROM public_news WHERE created_at < NOW() - INTERVAL ? DAY', [c.news.keepDays + 2]);
  await db.query('DELETE FROM messages WHERE created_at < NOW() - INTERVAL ? DAY AND kind = ?', [c.messages.keepDays, 'system']);
  await db.query('DELETE FROM chat_messages WHERE id < (SELECT m FROM (SELECT COALESCE(MAX(id),0) - ? m FROM chat_messages) x)', [c.chat.keep * 20]);
}
function start() {
  setTimeout(() => backfillStats().then((n) => n && log.info(`[social] ${n} Statistik-Zeilen nachgetragen`)).catch((e) => log.error('[social] backfill', e)), 4000).unref();
  const t = setInterval(() => prune().catch((e) => log.error('[social] prune', e)), 3600000); t.unref();
}

module.exports = {
  notifications, directory, refreshAll,
  lockPair, sameIp, accountAgeHours, relation: relation,
  myProfile, search, CATS, statsOf, upsertStats, publishNews, backfillStats, leaderboard, profile, setProfile, listFriends, friendRequest, friendRespond, friendRemove, relation,
  sendLetter, hasLink, inbox, readLetter, deleteLetter, report, summary, chatList, chatSend, gift, visit, firmsInCity, publicNews, prune, start, mask, clean, sendSystemLetter, friendIds, mentionsIn,
};
