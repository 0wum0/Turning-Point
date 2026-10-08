'use strict';
/**
 * Bindungen zwischen Spielern: Arbeitsverhältnisse (Spieler stellen Spieler ein) und Partnerschaften/Ehen.
 * Die Spielstände bleiben getrennt; der Abgleich geschieht beim Laden jedes Spielstands (reconcile):
 *  - Chef: Spieler-Mitarbeiter stehen im Betrieb (Lohnkosten, Produktivität)
 *  - Mitarbeiter: Beruf „bei Spielerbetrieb“ mit vereinbartem Tageslohn
 *  - Paare: verlinkter Partner, gemeinsame Kinder, Trennung/Verwitwung, Erbteil des Ehepartners
 */
const db = require('../db');
const settings = require('./../settings');
const log = require('./log');
const press = require('../game/press');
const { yearOf } = require('../game/calendar');
const { scale } = require('../game/economy');
const { notice, chronicle, clamp } = require('../game/core');
const { addPerson } = require('../game/state');
const { ActionError } = require('../game/actions');
const social = require('./social');
const service = require('../game/service');

const cfg = () => settings.get('social');
const fail = (m) => { throw new ActionError(m); };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const money = (cents, cur) => `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur === 'EUR' ? '€' : 'DM'}`;
const curOf = (world, year) => (year >= (world.econ.euroYear || 2002) ? 'EUR' : 'DM');
const pair = (a, b) => (a < b ? [a, b] : [b, a]);
const ROLE = { staff: 'Mitarbeiter', manager: 'Betriebsleitung' };

async function stat(userId) { return db.one('SELECT ps.*, u.banned FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ps.user_id = ?', [userId]); }
const idxOfStat = (world, ps) => world.idx(ps.year);

/* ====================================================================================
   Arbeit
   ==================================================================================== */
async function jobEligible(world, userId, J) {
  const ps = await stat(userId); if (!ps || ps.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  const a = await social.accountAgeHours(userId);
  if (a.h < J.minAccountHours) fail(`Spielerjobs sind erst ${J.minAccountHours} Stunden nach der Registrierung möglich.`);
  if (a.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.');
  return ps;
}

async function createOffer(world, ownerId, b) {
  const J = cfg().jobs; if (!cfg().enabled || !J.enabled) fail('Spielerjobs sind gerade nicht möglich.');
  const ps = await jobEligible(world, ownerId, J);
  const firm = await db.one('SELECT * FROM player_firms WHERE user_id = ? AND company_id = ?', [ownerId, int(b.companyId)]); if (!firm) fail('Diesen Betrieb besitzt du nicht.');
  const role = b.role === 'manager' ? 'manager' : 'staff';
  const slots = role === 'manager' ? 1 : Math.max(1, Math.min(J.maxSlots, int(b.slots, 1)));
  const wageNow = Math.round(Number(String(b.wage).replace(',', '.')) * 100); if (!Number.isFinite(wageNow) || wageNow <= 0) fail('Bitte einen Tageslohn angeben.');
  const real = Math.round(wageNow / idxOfStat(world, ps));
  if (real < J.minWage) fail(`Der Lohn ist zu niedrig (Minimum ${money(Math.ceil(J.minWage * idxOfStat(world, ps)), curOf(world, ps.year))} pro Tag).`);
  if (real > J.maxWage) fail(`Der Lohn ist zu hoch (Maximum ${money(Math.floor(J.maxWage * idxOfStat(world, ps)), curOf(world, ps.year))} pro Tag).`);
  const open = (await db.one("SELECT COUNT(*) n FROM player_jobs WHERE owner_id = ? AND company_id = ? AND status = 'open'", [ownerId, firm.company_id])).n;
  if (open >= J.maxOffersPerCompany) fail('Für diesen Betrieb laufen schon genug Stellenanzeigen.');
  const emp = (await db.one("SELECT COUNT(*) n FROM employments WHERE owner_id = ? AND status = 'active'", [ownerId])).n;
  if (emp >= J.maxEmployeesPerOwner) fail('Du beschäftigst bereits die maximale Zahl an Spielern.');
  const title = social.clean(b.title, 80) || (role === 'manager' ? `Betriebsleiter/in bei ${firm.name}` : `Verstärkung für ${firm.name}`);
  const r = await db.query('INSERT INTO player_jobs (owner_id, company_id, city_id, title, role, wage, slots, text) VALUES (?,?,?,?,?,?,?,?)', [ownerId, firm.company_id, firm.city_id, title, role, real, slots, social.clean(b.text, 300)]);
  return r.insertId;
}
async function closeOffer(ownerId, offerId) { await db.query("UPDATE player_jobs SET status = 'closed' WHERE id = ? AND owner_id = ?", [offerId, ownerId]); await db.query("UPDATE job_apps SET status = 'rejected' WHERE offer_id = ? AND status = 'pending'", [offerId]); }

async function market(world, userId) {
  const ps = await stat(userId); if (!ps) return { offers: [], mine: null };
  const idx = idxOfStat(world, ps); const cur = curOf(world, ps.year);
  const rows = await db.query(
    `SELECT j.*, f.name firm, f.tier, f.rooms, o.name owner, o.username, (SELECT COUNT(*) FROM employments e WHERE e.offer_id = j.id AND e.status = 'active') taken,
       (SELECT a.status FROM job_apps a WHERE a.offer_id = j.id AND a.user_id = ?) mystatus, (SELECT a.kind FROM job_apps a WHERE a.offer_id = j.id AND a.user_id = ?) mykind, (SELECT a.id FROM job_apps a WHERE a.offer_id = j.id AND a.user_id = ?) myapp
     FROM player_jobs j JOIN player_firms f ON f.user_id = j.owner_id AND f.company_id = j.company_id JOIN player_stats o ON o.user_id = j.owner_id JOIN users u ON u.id = j.owner_id
     WHERE j.status = 'open' AND j.city_id = ? AND j.owner_id <> ? AND u.banned = 0 AND u.social_public = 1 ORDER BY j.id DESC LIMIT 40`, [userId, userId, userId, ps.city_id, userId]);
  const offers = rows.filter((r) => r.taken < r.slots).map((r) => ({ id: r.id, ownerId: r.owner_id, owner: r.owner, username: r.username, firm: r.firm, tier: r.tier, rooms: r.rooms, title: r.title, role: r.role, roleName: ROLE[r.role], wage: Math.round(r.wage * idx), slotsLeft: r.slots - r.taken, text: r.text, myStatus: r.mystatus, myKind: r.mykind, myApp: r.myapp }));
  return { offers, currency: cur };
}

async function mine(world, userId) {
  const ps = await stat(userId); const idx = ps ? idxOfStat(world, ps) : 1; const cur = ps ? curOf(world, ps.year) : 'DM';
  const emp = await db.one(`SELECT e.*, f.name firm, o.name owner, o.username FROM employments e LEFT JOIN player_firms f ON f.user_id = e.owner_id AND f.company_id = e.company_id LEFT JOIN player_stats o ON o.user_id = e.owner_id WHERE e.employee_id = ? AND e.status = 'active' ORDER BY e.id DESC LIMIT 1`, [userId]);
  const myApps = await db.query(`SELECT a.id, a.kind, a.status, j.title, j.wage, j.role, f.name firm, o.name owner FROM job_apps a JOIN player_jobs j ON j.id = a.offer_id LEFT JOIN player_firms f ON f.user_id = j.owner_id AND f.company_id = j.company_id LEFT JOIN player_stats o ON o.user_id = j.owner_id WHERE a.user_id = ? AND a.status = 'pending' ORDER BY a.id DESC LIMIT 20`, [userId]);
  const offers = await db.query(`SELECT j.*, f.name firm FROM player_jobs j LEFT JOIN player_firms f ON f.user_id = j.owner_id AND f.company_id = j.company_id WHERE j.owner_id = ? AND j.status = 'open' ORDER BY j.id DESC`, [userId]);
  for (const o of offers) {
    o.wageNow = Math.round(o.wage * idx);
    o.apps = await db.query(`SELECT a.id, a.kind, a.message, a.created_at, a.user_id userId, ps.name, ps.username, ps.occupation, ps.year, ps.wealth FROM job_apps a JOIN player_stats ps ON ps.user_id = a.user_id WHERE a.offer_id = ? AND a.status = 'pending' ORDER BY a.id`, [o.id]);
  }
  const staff = await db.query(`SELECT e.id, e.role, e.wage, e.started_at, e.company_id, f.name firm, ps.name, ps.username, e.employee_id userId FROM employments e LEFT JOIN player_firms f ON f.user_id = e.owner_id AND f.company_id = e.company_id JOIN player_stats ps ON ps.user_id = e.employee_id WHERE e.owner_id = ? AND e.status = 'active' ORDER BY e.id DESC`, [userId]);
  const firms = await db.query('SELECT company_id id, name, tier FROM player_firms WHERE user_id = ?', [userId]);
  return {
    currency: cur, limits: { min: Math.ceil(cfg().jobs.minWage * idx), max: Math.floor(cfg().jobs.maxWage * idx), maxSlots: cfg().jobs.maxSlots },
    employment: emp ? { id: emp.id, firm: emp.firm, owner: emp.owner, username: emp.username, ownerId: emp.owner_id, role: emp.role, roleName: ROLE[emp.role], wage: Math.round(emp.wage * idx), since: emp.started_at } : null,
    applications: myApps.map((a) => ({ id: a.id, kind: a.kind, title: a.title, firm: a.firm, owner: a.owner, role: ROLE[a.role], wage: Math.round(a.wage * idx) })),
    offers: offers.map((o) => ({ id: o.id, title: o.title, firm: o.firm, role: o.role, roleName: ROLE[o.role], wage: o.wageNow, slots: o.slots, text: o.text, apps: o.apps })),
    staff: staff.map((s) => ({ id: s.id, firm: s.firm, role: s.role, roleName: ROLE[s.role], wage: Math.round(s.wage * idx), name: s.name, username: s.username, userId: s.userId, since: s.started_at })),
    firms: firms.map((f) => ({ id: f.id, name: f.name, tier: f.tier })),
  };
}

async function apply(world, userId, offerId, message) {
  const J = cfg().jobs; const ps = await jobEligible(world, userId, J);
  const o = await db.one("SELECT j.*, u.banned FROM player_jobs j JOIN users u ON u.id = j.owner_id WHERE j.id = ? AND j.status = 'open'", [offerId]); if (!o || o.banned) fail('Diese Stelle ist nicht mehr frei.');
  if (o.owner_id === userId) fail('Das ist dein eigener Betrieb.');
  if (ps.city_id !== o.city_id) fail('Du musst in derselben Stadt wohnen wie der Betrieb.');
  if (ps.days < J.minGameDays) fail(`Dein Charakter muss mindestens ${J.minGameDays} Spieltage alt sein.`);
  if (J.blockSameIp && await social.sameIp(userId, o.owner_id)) fail('Zwischen Konten mit derselben Internetverbindung sind keine Spielerjobs erlaubt.');
  const cur = await db.one("SELECT id FROM employments WHERE employee_id = ? AND status = 'active'", [userId]); if (cur) fail('Du bist bereits bei einem Spielerbetrieb angestellt. Kündige zuerst.');
  const n = (await db.one('SELECT COUNT(*) n FROM job_apps WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 DAY', [userId])).n; if (n >= J.applicationsPerDay) fail('Heute hast du schon genug Bewerbungen verschickt.');
  const ex = await db.one('SELECT id, status, kind FROM job_apps WHERE offer_id = ? AND user_id = ?', [offerId, userId]);
  if (ex && ex.status === 'pending') fail(ex.kind === 'invite' ? 'Du wurdest bereits eingeladen – nimm die Einladung an.' : 'Du hast dich schon beworben.');
  if (ex) await db.query("UPDATE job_apps SET status = 'pending', kind = 'apply', message = ?, created_at = NOW() WHERE id = ?", [social.clean(message, 300), ex.id]);
  else await db.query("INSERT INTO job_apps (offer_id, user_id, kind, message) VALUES (?,?, 'apply', ?)", [offerId, userId, social.clean(message, 300)]);
  await social.sendSystemLetter(o.owner_id, 'Neue Bewerbung', `${ps.name} (${ps.occupation || 'ohne Beruf'}) bewirbt sich auf „${o.title}“. Entscheide unter „Spieler → Arbeit“.`, userId);
}
async function invite(world, ownerId, offerId, targetId) {
  const J = cfg().jobs; await jobEligible(world, ownerId, J);
  const o = await db.one("SELECT * FROM player_jobs WHERE id = ? AND owner_id = ? AND status = 'open'", [offerId, ownerId]); if (!o) fail('Stelle nicht gefunden.');
  const t = await stat(targetId); if (!t || t.status !== 'alive') fail('Dieser Spieler hat keinen lebenden Charakter.');
  if (t.city_id !== o.city_id) fail('Der Spieler wohnt nicht in der Stadt des Betriebs.');
  if (J.blockSameIp && await social.sameIp(ownerId, targetId)) fail('Zwischen Konten mit derselben Internetverbindung sind keine Spielerjobs erlaubt.');
  const ex = await db.one('SELECT id, status FROM job_apps WHERE offer_id = ? AND user_id = ?', [offerId, targetId]);
  if (ex && ex.status === 'pending') fail('Es gibt schon eine offene Bewerbung/Einladung.');
  if (ex) await db.query("UPDATE job_apps SET status = 'pending', kind = 'invite', message = '', created_at = NOW() WHERE id = ?", [ex.id]); else await db.query("INSERT INTO job_apps (offer_id, user_id, kind) VALUES (?,?, 'invite')", [offerId, targetId]);
  await social.sendSystemLetter(targetId, 'Jobangebot', `Du wurdest eingeladen: „${o.title}“. Antworte unter „Spieler → Arbeit“.`, ownerId);
}

/** Chef nimmt Bewerbung an/ab – oder Eingeladener nimmt Einladung an/ab. */
async function decide(world, userId, appId, accept) {
  const a = await db.one('SELECT a.*, j.owner_id, j.company_id, j.city_id, j.role, j.wage, j.slots, j.title, j.status offer_status FROM job_apps a JOIN player_jobs j ON j.id = a.offer_id WHERE a.id = ?', [appId]);
  if (!a || a.status !== 'pending') fail('Dieser Vorgang ist nicht mehr offen.');
  const isOwnerDeciding = a.kind === 'apply' && a.owner_id === userId; const isInvitee = a.kind === 'invite' && a.user_id === userId;
  if (!isOwnerDeciding && !isInvitee) fail('Das darfst du nicht entscheiden.');
  const applicantId = a.user_id;
  if (!accept) {
    await db.query("UPDATE job_apps SET status = 'rejected' WHERE id = ?", [appId]);
    await social.sendSystemLetter(isOwnerDeciding ? applicantId : a.owner_id, isOwnerDeciding ? 'Bewerbung abgelehnt' : 'Einladung abgelehnt', isOwnerDeciding ? `Auf „${a.title}“ hat es diesmal nicht geklappt.` : `Die Einladung zu „${a.title}“ wurde abgelehnt.`, userId);
    return { accepted: false };
  }
  if (a.offer_status !== 'open') fail('Die Stelle ist nicht mehr offen.');
  const taken = (await db.one("SELECT COUNT(*) n FROM employments WHERE offer_id = ? AND status = 'active'", [a.offer_id])).n; if (taken >= a.slots) fail('Alle Stellen sind schon besetzt.');
  const cur = await db.one("SELECT id FROM employments WHERE employee_id = ? AND status = 'active'", [applicantId]); if (cur) fail('Dieser Spieler arbeitet bereits bei einem Spielerbetrieb.');
  const ps = await stat(applicantId); const own = await stat(a.owner_id);
  if (!ps || ps.status !== 'alive' || !own || own.status !== 'alive') fail('Einer von euch hat keinen lebenden Charakter mehr.');
  if (ps.city_id !== a.city_id) fail('Der Bewerber wohnt nicht mehr in der Stadt.');
  const firm = await db.one('SELECT name FROM player_firms WHERE user_id = ? AND company_id = ?', [a.owner_id, a.company_id]); if (!firm) fail('Der Betrieb existiert nicht mehr.');
  if (a.role === 'manager') { const m = await db.one("SELECT id FROM employments WHERE owner_id = ? AND company_id = ? AND role = 'manager' AND status = 'active'", [a.owner_id, a.company_id]); if (m) fail('Die Betriebsleitung ist schon besetzt.'); }
  const r = await db.query("INSERT INTO employments (owner_id, employee_id, company_id, city_id, offer_id, role, wage) VALUES (?,?,?,?,?,?,?)", [a.owner_id, applicantId, a.company_id, a.city_id, a.offer_id, a.role, a.wage]);
  await db.query("UPDATE job_apps SET status = 'accepted' WHERE id = ?", [appId]);
  await db.query("UPDATE job_apps SET status = 'rejected' WHERE user_id = ? AND status = 'pending'", [applicantId]);
  if (taken + 1 >= a.slots) { await db.query("UPDATE player_jobs SET status = 'closed' WHERE id = ?", [a.offer_id]); await db.query("UPDATE job_apps SET status = 'rejected' WHERE offer_id = ? AND status = 'pending'", [a.offer_id]); }
  await social.sendSystemLetter(applicantId, 'Willkommen im Team!', `Du arbeitest jetzt bei „${firm.name}“ (${own.name}) als ${ROLE[a.role]}.`, a.owner_id);
  await social.sendSystemLetter(a.owner_id, 'Neue Mitarbeit', `${ps.name} arbeitet jetzt bei „${firm.name}“.`, applicantId);
  if (cfg().news.publicEvents) await db.query("INSERT INTO public_news (city_id, user_id, section, title, text) VALUES (?,?,?,?,?)", [a.city_id, a.owner_id, 'Wirtschaft', `Neue Kraft bei ${firm.name}`, `${own.name} stellt ${ps.name} als ${ROLE[a.role]} bei „${firm.name}“ ein. Die Belegschaft heißt die Verstärkung willkommen.`]);
  return { accepted: true, employmentId: r.insertId };
}
async function withdraw(userId, appId) { await db.query("UPDATE job_apps SET status = 'withdrawn' WHERE id = ? AND user_id = ? AND status = 'pending'", [appId, userId]); }

async function endEmployment(conn, id, reason, byUser) {
  const e = await conn.one("SELECT * FROM employments WHERE id = ? AND status = 'active'", [id]); if (!e) return null;
  await conn.query("UPDATE employments SET status = 'ended', ended_at = NOW(), reason = ? WHERE id = ?", [reason, id]);
  const why = { quit: 'hat gekündigt', fired: 'wurde entlassen', closed: 'Der Betrieb besteht nicht mehr', moved: 'ist weggezogen', died: 'ist verstorben', left: 'hat den Job gewechselt', admin: 'wurde vom Team beendet' }[reason] || reason;
  const other = byUser === e.owner_id ? e.employee_id : e.owner_id;
  if (byUser !== e.employee_id && reason !== 'died') await conn.query("INSERT INTO messages (from_user, to_user, kind, subject, body) VALUES (?,?, 'system', 'Arbeitsverhältnis beendet', ?)", [byUser || null, e.employee_id, `Dein Arbeitsverhältnis ist beendet (${why}).`]);
  if (byUser !== e.owner_id && reason !== 'died') await conn.query("INSERT INTO messages (from_user, to_user, kind, subject, body) VALUES (?,?, 'system', 'Arbeitsverhältnis beendet', ?)", [byUser || null, e.owner_id, `Ein Spieler-Mitarbeiter ist ausgeschieden (${why}).`]);
  return e;
}
async function quit(userId) { const e = await db.one("SELECT id FROM employments WHERE employee_id = ? AND status = 'active'", [userId]); if (!e) fail('Du hast keine Stelle bei einem Spielerbetrieb.'); await endEmployment(db, e.id, 'quit', userId); }
async function fire(ownerId, empId) { const e = await db.one("SELECT id FROM employments WHERE id = ? AND owner_id = ? AND status = 'active'", [empId, ownerId]); if (!e) fail('Mitarbeiter nicht gefunden.'); await endEmployment(db, e.id, 'fired', ownerId); }
async function adminEnd(empId) { await endEmployment(db, empId, 'admin', null); }

/* ====================================================================================
   Paare
   ==================================================================================== */
const ageOf = (state) => Math.floor((state.day - state.person.birthDay) / 365);
async function activeCouple(conn, userId) { return conn.one("SELECT * FROM couples WHERE (user_a = ? OR user_b = ?) AND status IN ('dating','engaged','married') ORDER BY id DESC LIMIT 1", [userId, userId]); }

async function coupleView(world, userId) {
  const cp = await activeCouple(db, userId); const ps = await stat(userId);
  const nameOf = async (id) => { const s = await stat(id); return s ? { userId: id, name: s.name, username: s.username, cityId: s.city_id, year: s.year, occupation: s.occupation } : { userId: id, name: 'Unbekannt', username: '' }; };
  const incoming = await db.query("SELECT * FROM couples WHERE status = 'request' AND initiator <> ? AND (user_a = ? OR user_b = ?) ORDER BY id DESC", [userId, userId, userId]);
  const outgoing = await db.query("SELECT * FROM couples WHERE status = 'request' AND initiator = ? ORDER BY id DESC", [userId]);
  const other = (r) => (r.user_a === userId ? r.user_b : r.user_a);
  const singles = ps && !cp && !ps.partnered ? await db.query("SELECT ps.user_id userId, ps.name, ps.username, ps.occupation, ps.year FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE u.is_bot = 0 AND ps.city_id = ? AND ps.user_id <> ? AND ps.status = 'alive' AND ps.partnered = 0 AND u.social_public = 1 AND u.banned = 0 AND NOT EXISTS (SELECT 1 FROM couples c WHERE (c.user_a = ps.user_id OR c.user_b = ps.user_id) AND c.status IN ('dating','engaged','married')) ORDER BY u.last_seen_at DESC LIMIT 30", [ps.city_id, userId]) : [];
  return {
    singles,
    me: ps ? { cityId: ps.city_id } : null,
    couple: cp ? { id: cp.id, status: cp.status, engagedByMe: cp.engaged_by === userId, other: await nameOf(other(cp)), since: cp.created_at, marriedAt: cp.married_at } : null,
    incoming: await Promise.all(incoming.map(async (r) => ({ id: r.id, other: await nameOf(other(r)) }))),
    outgoing: await Promise.all(outgoing.map(async (r) => ({ id: r.id, other: await nameOf(other(r)) }))),
    rules: { minAge: cfg().couples.minAge, sameCity: cfg().couples.requireSameCity, spouseShare: cfg().couples.spouseSharePct, divorce: cfg().couples.divorceSettlementPct },
  };
}

async function request(world, from, to) {
  const C = cfg().couples; if (!cfg().enabled || !C.enabled) fail('Partnerschaften zwischen Spielern sind gerade nicht möglich.');
  if (from === to) fail('Das bist du selbst.');
  const a = await social.accountAgeHours(from); if (a.h < C.minAccountHours) fail(`Erst ${C.minAccountHours} Stunden nach der Registrierung möglich.`);
  const me = await stat(from); const you = await stat(to);
  if (!me || me.status !== 'alive') fail('Du brauchst einen lebenden Charakter.'); if (!you || you.status !== 'alive' || you.banned) fail('Dieser Spieler hat keinen lebenden Charakter.');
  const rel = await social.relation(from, to); if (rel === 'blocked' || rel === 'blocked_by') fail('Dieser Spieler ist nicht erreichbar.');
  if (C.requireSameCity && me.city_id !== you.city_id) fail('Ihr müsst in derselben Stadt wohnen, um euch näherzukommen.');
  { const bt = await db.one('SELECT is_bot FROM users WHERE id = ?', [to]); if (bt && bt.is_bot) fail('Diese Person ist bereits vergeben.'); }
  if (me.partnered || await activeCouple(db, from)) fail('Du bist bereits in einer Beziehung oder verheiratet.'); if (you.partnered || await activeCouple(db, to)) fail('Diese Person ist bereits vergeben.');
  const [ua, ub] = pair(from, to); const dup = await db.one("SELECT id FROM couples WHERE user_a = ? AND user_b = ? AND status = 'request'", [ua, ub]); if (dup) fail('Es gibt schon eine offene Anfrage.');
  const n = (await db.one("SELECT COUNT(*) n FROM couples WHERE initiator = ? AND created_at > NOW() - INTERVAL 1 DAY", [from])).n; if (n >= 3) fail('Heute hast du schon genug Anfragen gestellt.');
  await db.query("INSERT INTO couples (user_a, user_b, initiator, status) VALUES (?,?,?, 'request')", [ua, ub, from]);
  await social.sendSystemLetter(to, 'Heiratsanbahnung', `${me.name} möchte dich näher kennenlernen. Antworte unter „Spieler → Beziehung“.`, from);
}

function linkPartner(world, state, otherState, otherStat, { userId, coupleId, head, married }) {
  const ageDays = otherState.day - otherState.person.birthDay; const born = state.day - ageDays;
  const profName = (world.prof(otherStat.pkey) || {}).name || otherStat.occupation || 'ohne Beruf';
  const person = addPerson(state, { name: otherStat.name, gender: otherState.person.gender, born, role: 'partner', jobs: [profName], parents: [] });
  state.partner = { personId: person.id, name: otherStat.name, gender: otherState.person.gender, born, pkey: otherStat.pkey || null, profession: profName, sat: 70, married: !!married, cohabit: false, giftBoost: 0, unhappyDays: 0, since: state.day, linked: true, userId, coupleId, head };
  const me = state.tree.persons.find((x) => x.id === state.person.id); if (me) me.partnerId = person.id;
}

async function respond(world, userId, coupleId, accept) {
  const cp = await db.one("SELECT * FROM couples WHERE id = ? AND status = 'request'", [coupleId]);
  if (!cp || cp.initiator === userId || (cp.user_a !== userId && cp.user_b !== userId)) fail('Keine offene Anfrage.');
  const other = cp.initiator;
  if (!accept) { await db.query("DELETE FROM couples WHERE id = ?", [coupleId]); await social.sendSystemLetter(other, 'Anfrage abgelehnt', 'Die Antwort fiel diesmal leider nein aus.', userId); return; }
  if (await activeCouple(db, userId) || await activeCouple(db, other)) fail('Einer von euch ist inzwischen vergeben.');
  await db.tx(async (conn) => {
    const { rowA, rowB, sA, sB } = await social.lockPair(conn, userId, other);
    if (sA.partner || sB.partner) fail('Einer von euch hat bereits einen Partner.');
    const C = cfg().couples;
    if (ageOf(sA) < C.minAge || ageOf(sB) < C.minAge) fail(`Beide müssen mindestens ${C.minAge} Jahre alt sein.`);
    if (C.requireSameCity && sA.cityId !== sB.cityId) fail('Ihr müsst in derselben Stadt wohnen.');
    const stA = await conn.one('SELECT * FROM player_stats WHERE user_id = ?', [userId]); const stB = await conn.one('SELECT * FROM player_stats WHERE user_id = ?', [other]);
    const head = Math.min(userId, other);
    await conn.query("UPDATE couples SET status = 'dating' WHERE id = ?", [coupleId]);
    linkPartner(world, sA, sB, stB, { userId: other, coupleId, head: userId === head, married: false });
    linkPartner(world, sB, sA, stA, { userId, coupleId, head: other === head, married: false });
    for (const [st, nm] of [[sA, stB.name], [sB, stA.name]]) {
      chronicle(st, `${st.person.first} lernt ${nm} kennen.`, 'family');
      notice(st, { level: 'good', title: `Ihr seid jetzt ein Paar: ${nm}`, text: 'Ein echter Mensch an deiner Seite. Gemeinsame Kinder, Hochzeit und Zusammenleben warten.', tab: 'social', interrupt: true });
    }
    press.story(world, sA, 'couple', { partner: stB.name }); press.story(world, sB, 'couple', { partner: stA.name });
    await service.saveCharacter(conn, rowA, sA); await service.saveCharacter(conn, rowB, sB);
    await social.upsertStats(conn, { id: userId, username: stA.username, meta: {}, social_public: 1 }, rowA, sA, world);
  });
}
async function propose(userId) {
  const cp = await activeCouple(db, userId); if (!cp || cp.status !== 'dating') fail('Ein Heiratsantrag ist nur in einer Beziehung möglich.');
  await db.query("UPDATE couples SET status = 'engaged', engaged_by = ? WHERE id = ?", [userId, cp.id]);
  const other = cp.user_a === userId ? cp.user_b : cp.user_a; const me = await stat(userId);
  await social.sendSystemLetter(other, 'Heiratsantrag!', `${me ? me.name : 'Dein Partner'} macht dir einen Heiratsantrag. Antworte unter „Spieler → Beziehung“.`, userId);
}
async function answerProposal(world, userId, accept) {
  const cp = await activeCouple(db, userId); if (!cp || cp.status !== 'engaged' || cp.engaged_by === userId) fail('Es liegt kein Antrag für dich vor.');
  const other = cp.engaged_by;
  if (!accept) { await db.query("UPDATE couples SET status = 'dating', engaged_by = NULL WHERE id = ?", [cp.id]); await social.sendSystemLetter(other, 'Antrag abgelehnt', 'Noch nicht – die Beziehung bleibt bestehen.', userId); return; }
  await db.tx(async (conn) => {
    const { rowA, rowB, sA, sB } = await social.lockPair(conn, userId, other);
    if (!sA.partner || !sA.partner.linked || !sB.partner || !sB.partner.linked) fail('Eure Beziehung ist nicht mehr aktuell.');
    const pct = cfg().couples.weddingSharePct / 100;
    const costA = Math.round(scale(world.econ.marriageCost, world.idx(yearOf(sA.day, sA.startYear))) * pct);
    const costB = Math.round(scale(world.econ.marriageCost, world.idx(yearOf(sB.day, sB.startYear))) * pct);
    if (sA.money < costA) fail('Dir fehlt das Geld für deinen Hochzeitsanteil.'); if (sB.money < costB) fail('Deiner Partnerin bzw. deinem Partner fehlt das Geld für den Hochzeitsanteil.');
    sA.money -= costA; sA.stats.spent += costA; sB.money -= costB; sB.stats.spent += costB;
    for (const st of [sA, sB]) { st.partner.married = true; st.partner.sat = clamp(st.partner.sat + 15, 0, 100); }
    await conn.query("UPDATE couples SET status = 'married', married_at = NOW() WHERE id = ?", [cp.id]);
    const nA = sA.partner.name; const nB = sB.partner.name;
    for (const [st, nm] of [[sA, nA], [sB, nB]]) { chronicle(st, `${st.person.first} heiratet ${nm}.`, 'family'); press.story(world, st, 'marriage', { partner: nm }); notice(st, { level: 'good', title: 'Ihr habt geheiratet!', text: `Herzlichen Glückwunsch zur Hochzeit mit ${nm}.`, interrupt: true, tab: 'social' }); }
    await service.saveCharacter(conn, rowA, sA); await service.saveCharacter(conn, rowB, sB);
  });
}
async function breakup(userId) {
  const cp = await activeCouple(db, userId); if (!cp) fail('Du bist in keiner Beziehung.');
  const reason = cp.status === 'married' ? 'divorce' : 'breakup';
  await db.query("UPDATE couples SET status = 'ended', ended_at = NOW(), ended_by = ?, end_reason = ? WHERE id = ?", [userId, reason, cp.id]);
  const other = cp.user_a === userId ? cp.user_b : cp.user_a;
  await social.sendSystemLetter(other, reason === 'divorce' ? 'Scheidung' : 'Trennung', 'Dein Partner hat die Beziehung beendet.', userId);
}
async function cancelRequest(userId, coupleId) { await db.query("DELETE FROM couples WHERE id = ? AND initiator = ? AND status = 'request'", [coupleId, userId]); }
async function adminEndCouple(coupleId) { await db.query("UPDATE couples SET status = 'ended', ended_at = NOW(), end_reason = 'admin' WHERE id = ? AND status <> 'ended'", [coupleId]); }

/* ====================================================================================
   Abgleich beim Laden eines Spielstands
   ==================================================================================== */
async function reconcile(conn, user, row, state, world) {
  if (!state) return;
  try {
    await reconcileCredits(conn, user, state, world);
    await require('./leases').reconcile(conn, user, state, world);
    await require('./exchange').reconcile(conn, user, state);
    if (state.status !== 'alive') return;
    await reconcileOwner(conn, user, state, world);
    await reconcileEmployee(conn, user, state, world);
    await reconcileCouple(conn, user, state, world);
  } catch (e) { log.error('[bonds] reconcile', e); }
}

async function reconcileCredits(conn, user, state, world) {
  const rows = await conn.query('SELECT * FROM pending_credits WHERE user_id = ? FOR UPDATE', [user.id]); if (!rows.length || state.status !== 'alive') return;
  const year = yearOf(state.day, state.startYear); const idx = world.idx(year); const cur = curOf(world, year);
  for (const r of rows) {
    const cents = Math.round(r.real_amount * idx); state.money += cents; state.stats.earned += cents;
    notice(state, { level: 'good', title: r.reason === 'inheritance' ? 'Erbe vom Ehepartner' : r.reason === 'settlement' ? 'Scheidungsabfindung' : 'Gutschrift', text: `${r.text || ''} ${money(cents, cur)} wurden dir gutgeschrieben.`.trim(), interrupt: true });
  }
  await conn.query('DELETE FROM pending_credits WHERE user_id = ?', [user.id]);
}

async function reconcileOwner(conn, user, state, world) {
  const comps = state.companies || [];
  for (const c of comps) { c.playerStaff = []; c.playerManager = null; }
  const emps = await conn.query("SELECT e.*, ps.name ename FROM employments e LEFT JOIN player_stats ps ON ps.user_id = e.employee_id WHERE e.owner_id = ? AND e.status = 'active'", [user.id]);
  for (const e of emps) {
    const c = comps.find((x) => x.id === e.company_id);
    if (!c || c.abandoned) { await endEmployment(conn, e.id, 'closed', user.id); continue; }
    const entry = { userId: e.employee_id, wage: e.wage, name: e.ename || 'Mitarbeiter', empId: e.id };
    if (e.role === 'manager') c.playerManager = entry; else c.playerStaff.push(entry);
  }
  const offers = await conn.query("SELECT id, company_id FROM player_jobs WHERE owner_id = ? AND status = 'open'", [user.id]);
  for (const o of offers) { const c = comps.find((x) => x.id === o.company_id); if (!c || c.abandoned) await conn.query("UPDATE player_jobs SET status = 'closed' WHERE id = ?", [o.id]); }
}

async function reconcileEmployee(conn, user, state, world) {
  const emp = await conn.one("SELECT e.*, f.name firm, f.pkey pkey, o.name oname, o.status ostatus FROM employments e LEFT JOIN player_firms f ON f.user_id = e.owner_id AND f.company_id = e.company_id LEFT JOIN player_stats o ON o.user_id = e.owner_id WHERE e.employee_id = ? AND e.status = 'active' ORDER BY e.id DESC LIMIT 1", [user.id]);
  const occ = state.occupation;
  const clear = (why) => {
    if (occ && occ.playerJob) { state.occupation = null; if (state.housing.type === 'workplace') state.housing = { type: 'street', cityId: state.cityId }; }
    notice(state, { level: 'warn', title: 'Anstellung beendet', text: why, tab: 'newspaper', interrupt: true });
  };
  if (emp) {
    if (!emp.firm || emp.ostatus === 'gameover') { await endEmployment(conn, emp.id, 'closed', emp.owner_id); return clear('Der Betrieb besteht nicht mehr.'); }
    if (state.cityId !== emp.city_id) { await endEmployment(conn, emp.id, 'moved', user.id); return clear('Du bist weggezogen – das Arbeitsverhältnis endet.'); }
    if (occ && occ.playerJob && occ.empId === emp.id) { occ.wage = emp.wage; return; }
    if (!emp.synced) {
      if (state.occupation && state.occupation.ownCompanyId) { await endEmployment(conn, emp.id, 'left', user.id); return; }
      state.occupation = { kind: 'work', pkey: emp.pkey, employer: `${emp.firm} · ${emp.oname || 'Spielerbetrieb'}`, cityId: emp.city_id, factor: 1, lodging: false, since: state.day, playerJob: true, wage: emp.wage, empId: emp.id, ownerId: emp.owner_id };
      if (state.housing.type === 'workplace') state.housing = { type: 'street', cityId: state.cityId };
      await conn.query('UPDATE employments SET synced = 1 WHERE id = ?', [emp.id]);
      chronicle(state, `${state.person.first} beginnt bei ${emp.firm} (${emp.oname}).`, 'work');
      press.story(world, state, 'job_new', { employer: `${emp.firm} (${emp.oname})`, job: ROLE[emp.role] });
      notice(state, { level: 'good', title: `Neue Stelle: ${emp.firm}`, text: `Du arbeitest jetzt bei ${emp.oname} als ${ROLE[emp.role]} – vereinbarter Lohn ${money(Math.round(emp.wage * world.idx(yearOf(state.day, state.startYear))), curOf(world, yearOf(state.day, state.startYear)))} pro Tag.`, tab: 'work', interrupt: true });
      return;
    }
    await endEmployment(conn, emp.id, 'left', user.id); // Beruf wurde anderweitig gewechselt
  } else if (occ && occ.playerJob) {
    const last = await conn.one("SELECT reason FROM employments WHERE id = ?", [occ.empId]);
    clear({ fired: 'Du wurdest entlassen.', closed: 'Der Betrieb besteht nicht mehr.', admin: 'Das Team hat das Arbeitsverhältnis beendet.', moved: 'Das Arbeitsverhältnis endet durch den Umzug.' }[last && last.reason] || 'Das Arbeitsverhältnis wurde beendet.');
  }
}

async function reconcileCouple(conn, user, state, world) {
  const p = state.partner; if (!p || !p.linked) return;
  const cp = await conn.one('SELECT * FROM couples WHERE id = ?', [p.coupleId]);
  if (!cp || cp.status === 'ended' || cp.status === 'request') {
    const wasMarried = !!(cp && cp.married_at);
    const why = cp ? cp.end_reason : 'admin';
    const widow = why === 'widowed';
    state.partner = null;
    const pr = state.tree.persons.find((x) => x.id === p.personId); if (pr) { pr.note = widow ? 'verstorben' : 'Trennung'; pr.status = widow ? 'dead' : 'away'; }
    const me = state.tree.persons.find((x) => x.id === state.person.id); if (me) delete me.partnerId;
    chronicle(state, widow ? `${p.name} stirbt.` : `${wasMarried ? 'Scheidung' : 'Trennung'} von ${p.name}.`, 'family');
    notice(state, { level: widow ? 'bad' : 'warn', title: widow ? `${p.name} ist gestorben` : wasMarried ? 'Scheidung' : 'Trennung', text: widow ? 'Dein Ehepartner ist verstorben. Ein Teil des Nachlasses geht an dich.' : `Die Beziehung zu ${p.name} ist beendet.`, tab: 'family', interrupt: true });
    if (!widow) press.story(world, state, 'separation', { partner: p.name });
    // Abfindung bei Scheidung (zahlt, wer sie beendet hat)
    if (cp && cp.end_reason === 'divorce' && cp.ended_by === user.id && state.money > 0) {
      const share = Math.floor(state.money * cfg().couples.divorceSettlementPct / 100); const real = share / Math.max(0.0001, world.idx(yearOf(state.day, state.startYear)));
      state.money -= share; state.stats.spent += share;
      const other = cp.user_a === user.id ? cp.user_b : cp.user_a;
      await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text) VALUES (?,?, 'settlement', ?)", [other, real, `Abfindung von ${state.person.first} ${state.person.last}.`]);
      await conn.query("UPDATE couples SET end_reason = 'divorce_paid' WHERE id = ?", [cp.id]);
      notice(state, { level: 'info', title: 'Abfindung gezahlt', text: `Du hast ${cfg().couples.divorceSettlementPct} % deines Bargelds an ${p.name} abgegeben.` });
    }
    return;
  }
  // aktive Beziehung: Daten des Partners auffrischen
  p.married = cp.status === 'married'; p.head = cp.user_a === user.id;
  const ps = await conn.one('SELECT name, pkey, occupation FROM player_stats WHERE user_id = ?', [p.userId]);
  if (ps) { p.name = ps.name; p.pkey = ps.pkey; p.profession = (world.prof(ps.pkey) || {}).name || ps.occupation || p.profession; }
  // gemeinsame Kinder des „führenden“ Partners übernehmen
  if (!p.head) {
    const hr = await service.activeRow(conn, p.userId);
    if (hr) {
      let hs; try { hs = require('../game/state').parseState(hr.state); } catch (_) { hs = null; }
      for (const c of (hs ? hs.children : []).filter((x) => x.sid && x.status === 'home')) {
        if (state.children.some((m) => m.sid === c.sid)) continue;
        const person = addPerson(state, { name: c.name, gender: c.gender, born: c.born, bornCity: c.cityId, role: 'child', parents: [state.person.id, p.personId] });
        state.children.push({ ...c, id: state.nextChildId++, personId: person.id, shared: true });
        chronicle(state, `${c.name.split(' ')[0]} wird geboren.`, 'birth');
        press.story(world, state, 'birth', { child: c.name.split(' ')[0] });
        notice(state, { level: 'good', title: `Ein Kind ist geboren: ${c.name.split(' ')[0]}`, text: `${p.name} und du freut euch über ${c.name.split(' ')[0]}.`, tab: 'family', interrupt: true });
      }
    }
  }
}

/** Vor dem Speichern: Erbteil des Ehepartners und Auflösen von Bindungen eines verstorbenen Charakters. */
async function beforeSave(conn, user, state, world) {
  try {
    if (!state || !state.pending) return;
    if (state.pending.spouseShare) {
      const s = state.pending.spouseShare; delete state.pending.spouseShare;
      await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text) VALUES (?,?, 'inheritance', ?)", [s.userId, s.real, `${state.person.first} ${state.person.last} hat dir einen Teil des Nachlasses hinterlassen.`]);
    }
    if (state.status !== 'alive') {
      if (state.partner && state.partner.linked && state.partner.coupleId) await conn.query("UPDATE couples SET status = 'ended', ended_at = NOW(), end_reason = 'widowed', ended_by = ? WHERE id = ? AND status <> 'ended'", [user.id, state.partner.coupleId]);
      const emp = await conn.one("SELECT id FROM employments WHERE employee_id = ? AND status = 'active'", [user.id]); if (emp) await endEmployment(conn, emp.id, 'died', user.id);
    }
  } catch (e) { log.error('[bonds] beforeSave', e); }
}

module.exports = {
  createOffer, closeOffer, market, mine, apply, invite, decide, withdraw, quit, fire, adminEnd,
  coupleView, request, respond, propose, answerProposal, breakup, cancelRequest, adminEndCouple,
  reconcile, beforeSave, endEmployment,
};
