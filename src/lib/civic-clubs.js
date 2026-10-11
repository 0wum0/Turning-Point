'use strict';
/**
 * Vereine: Gründung, Beitritt, Beitrag, Kasse und Kassenbuch, Vorstand, Abwahl, Feste, Wahlempfehlungen und – als dunkle Seite – die Veruntreuung der Kasse.
 *
 * Geld genau einmal: Jede Handlung läuft in service.withCharacter (Zeilen des Spielers gesperrt, Spielstand und Datenbank in einer Transaktion).
 * Bewegungen der Vereinskasse sind bedingte Updates (`… WHERE treasury_real >= ?`): fehlt die Deckung, bucht niemand etwas. Beiträge zieht der Spielstand beim Laden
 * ein (civic.reconcile); alles, was an andere Konten geht, läuft über pending_credits.
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

const { fail, num, int, HOUR } = K;
const cfg = () => M.C().clubs || {};
const cleanDesc = (t) => M.cleanText(t, num(cfg().descMax, 200));
const letter = (to, subject, body, from) => social.sendSystemLetter(to, subject, body, from || null).catch((e) => log.warn(`[vereine] Brief: ${e.message}`));
const pub = (r) => (r && r.social_public ? (r.name || r.username) : 'Ein Mitglied');
const refresh = (...a) => require('./civic').refresh(...a);

async function clubRow(conn, id, lock = false) {
  const c = await conn.one(`SELECT * FROM clubs WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [int(id)]);
  if (!c || c.status !== 'active') fail('Diesen Verein gibt es nicht (mehr).');
  return c;
}
const memberOf = (conn, clubId, userId, lock = false) => conn.one(`SELECT * FROM club_members WHERE club_id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`, [clubId, userId]);
const isBoard = (m) => !!m && (m.role === 'president' || m.role === 'board');
async function countMembers(conn, clubId) { return Number((await conn.one('SELECT COUNT(*) n FROM club_members WHERE club_id = ?', [clubId])).n); }
async function slotsFor(conn, userId) { return num(cfg().maxMemberships, 4) + (await K.titleFxOf(conn, userId)).slots; }

/** Verein auflösen: Vermögen fällt an die Gemeinwohl-Kasse der Stadt (Topf „Kultur“), Mitglieder und Wahlempfehlungen verschwinden. Gibt die betroffenen Mitglieder zurück. */
async function closeClub(conn, club, why) {
  const r = await conn.query("UPDATE clubs SET status = 'dissolved', closed_at = NOW(), name_key = CONCAT(LEFT(name_key, 60), '~', id) WHERE id = ? AND status = 'active'", [club.id]);
  if (!r || !r.affectedRows) return null;
  const fresh = await conn.one('SELECT treasury_real FROM clubs WHERE id = ? FOR UPDATE', [club.id]);
  const left = Math.max(0, Number(fresh.treasury_real) || 0);
  await conn.query('UPDATE clubs SET treasury_real = 0 WHERE id = ?', [club.id]);
  if (left > 0) await K.potAdd(conn, club.city_id, 'kultur', left);
  const members = await conn.query('SELECT user_id FROM club_members WHERE club_id = ?', [club.id]);
  await conn.query('DELETE FROM club_members WHERE club_id = ?', [club.id]);
  await conn.query('DELETE FROM club_endorsements WHERE club_id = ?', [club.id]);
  await K.clubBook(conn, club.id, null, 'dissolve', left, why || 'aufgelöst');
  K.after(conn, () => live.publish('civic', {}));
  return members.map((m) => m.user_id);
}

/** Der Vorsitz geht an den Nachfolger (Vorstand vor Mitgliedern, dienstältester zuerst). Ohne Nachfolger wird der Verein aufgelöst. */
async function succeed(conn, club, leavingId, why) {
  const rows = await conn.query('SELECT user_id, role, joined_ms FROM club_members WHERE club_id = ?', [club.id]);
  const next = M.successor(rows, leavingId);
  if (!next) return { closed: await closeClub(conn, club, why || 'keine Mitglieder mehr') };
  await conn.query("UPDATE club_members SET role = 'president', mistrust = 0 WHERE club_id = ? AND user_id = ?", [club.id, next.user_id]);
  await conn.query("UPDATE club_members SET mistrust = 0 WHERE club_id = ?", [club.id]);
  await conn.query('UPDATE clubs SET president_id = ?, chair_ms = ? WHERE id = ?', [next.user_id, Date.now(), club.id]);
  await K.clubBook(conn, club.id, next.user_id, 'chair', 0, why || 'neuer Vorsitz');
  K.after(conn, () => letter(next.user_id, 'Du führst jetzt den Verein', `Du bist nun Vorsitzende/r des Vereins „${club.name}“. Kasse, Feste und Vorstand findest du unter „Gesellschaft → Vereine“.`));
  return { president: next.user_id };
}

/* ================================================================================================================================================
   Gründen, beitreten, austreten, auflösen
   ================================================================================================================================================ */
async function found(userId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const k = cfg();
    await K.guard(userId, state, 'clubs'); await K.notJailed(userId);
    if (state.day < num(k.foundMinGameDays, 20)) fail(`Einen Verein gründen kannst du ab ${num(k.foundMinGameDays, 20)} Spieltagen.`);
    const kind = M.kindOf(String(input.kind || '')); if (!kind) fail('Bitte wähle eine Art von Verein.');
    const nm = M.cleanName(input.name, num(k.nameMin, 3), num(k.nameMax, 40)); if (!nm.ok) fail(nm.err);
    if (social.mask(nm.name) !== nm.name || social.hasLink(nm.name)) fail('Dieser Name ist nicht erlaubt.');
    const blk = RP.block(RP.stand(state).lv, -1); if (blk) fail(blk);
    const idx = K.idxOf(world, state);
    const feeIn = input.fee === 0 || input.fee === '0' ? 0 : K.centsFrom(input.fee);
    const feeReal = feeIn == null ? num(k.feeDefaultReal, 1200) : M.clampFee(feeIn / idx);
    const cost = Math.round(num(k.foundFeeReal, 4000) * idx);
    if (state.money < cost) fail(`Für die Gründung brauchst du ${K.money(cost, world, state)} (Eintragung und Satzung).`);
    const mine = Number((await conn.one("SELECT COUNT(*) n FROM clubs WHERE president_id = ? AND status = 'active'", [userId])).n);
    if (mine >= num(k.maxFounded, 2)) fail(`Du leitest schon ${mine} Vereine – mehr sind nicht erlaubt.`);
    const cnt = Number((await conn.one('SELECT COUNT(*) n FROM club_members WHERE user_id = ?', [userId])).n);
    if (cnt >= await slotsFor(conn, userId)) fail('Du bist schon in so vielen Vereinen, wie du schaffen kannst. Tritt zuerst aus einem aus.');
    const now = Date.now();
    let id;
    try {
      const r = await conn.query('INSERT INTO clubs (city_id, name, name_key, kind, president_id, fee_real, descr, chair_ms) VALUES (?,?,?,?,?,?,?,?)', [state.cityId, nm.name, nm.key, kind.key, userId, feeReal, cleanDesc(input.descr) || null, now]);
      id = r.insertId;
    } catch (e) { if (e && e.code === 'ER_DUP_ENTRY') fail('Einen Verein mit diesem Namen gibt es in der Stadt schon.'); throw e; }
    await conn.query("INSERT INTO club_members (club_id, user_id, role, joined_ms, paid_until) VALUES (?,?, 'president', ?, ?)", [id, userId, now, now + M.feeInterval()]);
    state.money -= cost; state.stats.spent += cost;
    await K.clubBook(conn, id, userId, 'found', num(k.foundFeeReal, 4000), 'gegründet');
    const city = (world.city(state.cityId) || {}).name || 'der Stadt';
    chronicle(state, `${state.person.first} gründet den ${kind.name} „${nm.name}“ in ${city}.`, 'society');
    notice(state, { level: 'good', title: `Verein gegründet: ${nm.name}`, tab: 'society', text: `Du bist Vorsitzende/r des Vereins „${nm.name}“. Gewinne Mitglieder, damit er wirkt.`, info: [`Ein Verein wirkt ab ${num(k.minActive, 3)} Mitgliedern auf alle, die dazugehören.`, 'Beiträge fließen in die Vereinskasse. Mit der Kasse richtest du Feste aus – das macht den Verein beliebt.', 'Im Kassenbuch sehen alle Mitglieder jede Buchung. Wer Geld privat entnimmt, begeht Veruntreuung.'] });
    const who = ctx.user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Bürger';
    await tagesblatt.post('life', 'Vereinsgründung', `${who} gründet in ${city} den ${kind.name} „${nm.name}“.`, state.cityId, conn);
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `„${nm.name}“ ist gegründet. Du bist Vorsitzende/r.`, level: 'good', id };
  }, { needAlive: true });
}

async function join(userId, clubId) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const k = cfg();
    await K.guard(userId, state, 'clubs'); await K.notJailed(userId);
    const club = await clubRow(conn, clubId, true);
    if (club.city_id !== state.cityId) fail('Du kannst nur Vereinen deiner Stadt beitreten.');
    if (await memberOf(conn, club.id, userId)) fail('Du bist schon Mitglied.');
    const blk = RP.block(RP.stand(state).lv, -1); if (blk) fail('Verrufene nimmt kein Verein auf.');
    if (await countMembers(conn, club.id) >= num(k.maxMembers, 60)) fail('Der Verein ist voll.');
    const cnt = Number((await conn.one('SELECT COUNT(*) n FROM club_members WHERE user_id = ?', [userId])).n);
    if (cnt >= await slotsFor(conn, userId)) fail('Du bist schon in so vielen Vereinen, wie du schaffen kannst. Tritt zuerst aus einem aus.');
    const left = await conn.one('SELECT left_ms FROM club_left WHERE club_id = ? AND user_id = ?', [club.id, userId]);
    if (left && Date.now() - Number(left.left_ms) < num(k.rejoinHours, 12) * HOUR) { const hrs = Math.ceil((num(k.rejoinHours, 12) * HOUR - (Date.now() - Number(left.left_ms))) / HOUR); fail(`Du bist erst vor Kurzem ausgetreten. Beitritt wieder in ${hrs} Stunden.`); }
    const idx = K.idxOf(world, state); const feeCents = Math.round(club.fee_real * idx);
    if (state.money < feeCents) fail(`Der erste Beitrag kostet ${K.money(feeCents, world, state)}. Dafür reicht dein Geld nicht.`);
    const now = Date.now();
    await conn.query("INSERT INTO club_members (club_id, user_id, role, joined_ms, paid_until, paid_real) VALUES (?,?, 'member', ?, ?, ?)", [club.id, userId, now, now + M.feeInterval(), club.fee_real]);
    if (feeCents > 0) { state.money -= feeCents; state.stats.spent += feeCents; await conn.query('UPDATE clubs SET treasury_real = treasury_real + ? WHERE id = ?', [club.fee_real, club.id]); }
    await conn.query('DELETE FROM club_left WHERE club_id = ? AND user_id = ?', [club.id, userId]);
    await K.clubBook(conn, club.id, userId, 'join', club.fee_real, 'beigetreten');
    RP.queue(state, 'civic', null, 'club_active', `c${club.id}`);
    chronicle(state, `${state.person.first} tritt dem Verein „${club.name}“ bei.`, 'society');
    K.after(conn, async () => { live.publish('civic', {}); await letter(club.president_id, 'Neues Mitglied', `${ctx.user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Bürger'} ist dem Verein „${club.name}“ beigetreten.`, userId); });
    await refresh(conn, ctx.user, state, world);
    return { msg: `Willkommen im Verein „${club.name}“!`, level: 'good' };
  }, { needAlive: true });
}

async function leave(userId, clubId) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx;
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId, true);
    if (!m) fail('Du bist in diesem Verein kein Mitglied.');
    await conn.query('DELETE FROM club_members WHERE club_id = ? AND user_id = ?', [club.id, userId]);
    await conn.query('INSERT INTO club_left (club_id, user_id, left_ms) VALUES (?,?,?) ON DUPLICATE KEY UPDATE left_ms = VALUES(left_ms)', [club.id, userId, Date.now()]);
    await K.clubBook(conn, club.id, userId, 'leave', 0, 'ausgetreten');
    let note = 0;
    if (m.role === 'president') {
      const r = await succeed(conn, club, userId, 'Vorsitz nach Austritt');
      note = r.closed ? 1 : 2;
    }
    chronicle(state, `${state.person.first} verlässt den Verein „${club.name}“.`, 'society');
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    const msg = note === 1 ? `Du bist aus dem Verein „${club.name}“ ausgetreten. Du warst das letzte Mitglied: Der Verein ist aufgelöst, sein Vermögen fällt an die Stadt.`
      : note === 2 ? `Du bist aus dem Verein „${club.name}“ ausgetreten. Der Vorsitz ging an das dienstälteste Mitglied.` : `Du bist aus dem Verein „${club.name}“ ausgetreten.`;
    return { msg, level: 'info' };
  }, { needAlive: true });
}

async function dissolve(userId, clubId) {
  let members = []; let name = '';
  const out = await service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx;
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId);
    if (!m || m.role !== 'president') fail('Nur der Vorsitz kann den Verein auflösen.');
    members = (await closeClub(conn, club, 'vom Vorsitz aufgelöst')) || []; name = club.name;
    const city = (world.city(club.city_id) || {}).name || 'der Stadt';
    chronicle(state, `${state.person.first} löst den Verein „${club.name}“ auf.`, 'society');
    await tagesblatt.post('life', 'Verein aufgelöst', `Der Verein „${club.name}“ in ${city} hat sich aufgelöst. Sein Vermögen fällt an die Stadt.`, club.city_id, conn);
    await refresh(conn, ctx.user, state, world);
    return { msg: `Der Verein „${club.name}“ ist aufgelöst. Das Vermögen der Kasse fällt an die Stadt (Gemeinwohl).`, level: 'warn' };
  }, { needAlive: true });
  for (const id of members) if (id !== userId) await letter(id, 'Verein aufgelöst', `Der Verein „${name}“ wurde aufgelöst.`);
  return out;
}

/* ================================================================================================================================================
   Beitrag, Spenden, Feste
   ================================================================================================================================================ */
async function setFee(userId, clubId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx;
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId);
    if (!m || m.role !== 'president') fail('Nur der Vorsitz kann den Beitrag ändern.');
    const wait = num(cfg().feeChangeHours, 24) * HOUR - (Date.now() - num(club.fee_ms, 0));
    if (club.fee_ms && wait > 0) fail(`Der Beitrag wurde gerade erst geändert. Wieder möglich in ${Math.ceil(wait / HOUR)} Stunden.`);
    const idx = K.idxOf(world, state);
    const cents = input.fee === 0 || input.fee === '0' ? 0 : K.centsFrom(input.fee); if (cents == null) fail('Bitte einen Beitrag angeben (0 für beitragsfrei).');
    const real = M.clampFee(cents / idx);
    await conn.query('UPDATE clubs SET fee_real = ?, fee_ms = ? WHERE id = ?', [real, Date.now(), club.id]);
    await K.clubBook(conn, club.id, userId, 'fee_set', real, 'Beitrag geändert');
    K.after(conn, () => live.publish('civic', {}));
    return { msg: `Der Beitrag beträgt jetzt ${K.money(Math.round(real * idx), world, state)} im Jahr (gedeckelt auf ${K.money(Math.round(num(cfg().feeMaxReal, 6000) * idx), world, state)}).`, level: 'good' };
  }, { needAlive: true });
}

async function donate(userId, clubId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const D = cfg().donate || {};
    await K.guard(userId, state, 'clubs'); await K.notJailed(userId);
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId, true);
    if (!m) fail('Spenden kannst du nur an Vereine, in denen du Mitglied bist.');
    const idx = K.idxOf(world, state); const cents = K.centsFrom(input.amount); if (cents == null) fail('Bitte einen Betrag angeben.');
    const real = cents / idx;
    if (real < num(D.minReal, 100) - 1e-9) fail(`Die kleinste Spende beträgt ${K.money(Math.ceil(num(D.minReal, 100) * idx), world, state)}.`);
    if (state.money < cents) fail('Dafür reicht dein Geld nicht.');
    const day = K.today(); const used = m.day_no === day ? Number(m.day_real) : 0;
    if (used + real > num(D.dayCapReal, 30000) + 1e-9) fail(`Pro Tag kannst du höchstens ${K.money(Math.round(num(D.dayCapReal, 30000) * idx), world, state)} an einen Verein spenden.`);
    state.money -= cents; state.stats.spent += cents;
    await conn.query('UPDATE clubs SET treasury_real = treasury_real + ? WHERE id = ?', [real, club.id]);
    await conn.query('UPDATE club_members SET day_no = ?, day_real = ?, paid_real = paid_real + ? WHERE club_id = ? AND user_id = ?', [day, used + real, real, club.id, userId]);
    await K.addUserSum(conn, userId, 'donated_real', real);
    await K.clubBook(conn, club.id, userId, 'donate', real, 'Spende');
    RP.queue(state, 'civic', Math.min(2.5, Math.max(0.4, 0.4 + 0.5 * Math.log10(1 + real / 1000))), 'donate', `c${club.id}`);
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `Du hast ${K.money(cents, world, state)} in die Kasse von „${club.name}“ gespendet. Danke!`, level: 'good' };
  }, { needAlive: true });
}

/** Vereinsfest aus der Kasse: macht alle Mitglieder zufriedener (beim nächsten Laden), den Ausrichter bekannt, und stärkt den Gemeinwohl-Topf „Kultur“ der Stadt. */
async function event(userId, clubId) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const E = cfg().event || {};
    await K.guard(userId, state, 'clubs');
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId);
    if (!isBoard(m)) fail('Feste richtet der Vorstand aus.');
    const n = await countMembers(conn, club.id);
    if (n < num(E.minMembers, 3)) fail(`Für ein Fest braucht der Verein mindestens ${num(E.minMembers, 3)} Mitglieder.`);
    const wait = num(E.cooldownHours, 12) * HOUR - (Date.now() - num(club.event_ms, 0));
    if (wait > 0) fail(`Das letzte Fest ist noch nicht lange her. Das nächste ist in ${Math.ceil(wait / HOUR)} Stunden möglich.`);
    const cost = num(E.costReal, 1500);
    const r = await conn.query('UPDATE clubs SET treasury_real = treasury_real - ?, event_ms = ?, events_n = events_n + 1 WHERE id = ? AND treasury_real >= ?', [cost, Date.now(), club.id, cost]);
    if (!r || !r.affectedRows) fail(`Dafür reicht die Kasse nicht (nötig: ${K.money(Math.round(cost * K.idxOf(world, state)), world, state)}).`);
    await K.potAdd(conn, club.city_id, 'kultur', cost * 0.5);
    await K.clubBook(conn, club.id, userId, 'event', cost, 'Vereinsfest');
    const kd = M.kindOf(club.kind) || {};
    RP.queue(state, 'civic', num(E.rep, 0.8) * num(kd.eventRepMult, 1), 'club_event', `c${club.id}`);
    state.meters.wellbeing = Math.min(100, state.meters.wellbeing + num(E.wellbeing, 4));
    chronicle(state, `${state.person.first} richtet für den Verein „${club.name}“ ein Fest aus.`, 'society');
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `Das Fest des Vereins „${club.name}“ war ein Erfolg. Die Mitglieder freuen sich.`, level: 'good' };
  }, { needAlive: true });
}

/** Einmaliger Stimmungsgewinn für ein Fest, das ein Mitglied beim Laden vorfindet (genau einmal je Mitglied und Fest). */
async function applyEvent(conn, user, state, m, club) {
  const E = cfg().event || {};
  if (!(Number(club.event_ms) > Number(m.seen_event_ms || 0))) return false;
  const fresh = Date.now() - Number(club.event_ms) < num(E.windowHours, 48) * HOUR;
  const r = await conn.query('UPDATE club_members SET seen_event_ms = ? WHERE club_id = ? AND user_id = ? AND seen_event_ms < ?', [club.event_ms, club.id, user.id, club.event_ms]);
  if (!r || !r.affectedRows || !fresh) return false;
  state.meters.wellbeing = Math.min(100, state.meters.wellbeing + num(E.wellbeing, 4));
  notice(state, { level: 'good', title: `Vereinsfest: ${club.name || club.cname}`, tab: 'society', text: 'Dein Verein hat gefeiert. Das hat dir gutgetan.' });
  return true;
}

/* ================================================================================================================================================
   Vorstand, Abwahl, Ausschluss
   ================================================================================================================================================ */
async function setRole(userId, clubId, targetId, role) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; targetId = int(targetId);
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId);
    if (!m || m.role !== 'president') fail('Nur der Vorsitz bestimmt den Vorstand.');
    if (targetId === userId) fail('Wähle ein anderes Mitglied.');
    const t = await memberOf(conn, club.id, targetId, true); if (!t) fail('Dieses Mitglied gibt es nicht.');
    if (role === 'president') { // Vorsitz übergeben
      await conn.query("UPDATE club_members SET role = 'board', mistrust = 0 WHERE club_id = ? AND user_id = ?", [club.id, userId]);
      await conn.query("UPDATE club_members SET role = 'president', mistrust = 0 WHERE club_id = ? AND user_id = ?", [club.id, targetId]);
      await conn.query('UPDATE club_members SET mistrust = 0 WHERE club_id = ?', [club.id]);
      await conn.query('UPDATE clubs SET president_id = ?, chair_ms = ? WHERE id = ?', [targetId, Date.now(), club.id]);
      await K.clubBook(conn, club.id, targetId, 'chair', 0, 'Vorsitz übergeben');
      K.after(conn, () => letter(targetId, 'Du führst jetzt den Verein', `Du bist nun Vorsitzende/r des Vereins „${club.name}“.`, userId));
    } else if (role === 'board') {
      const nb = Number((await conn.one("SELECT COUNT(*) n FROM club_members WHERE club_id = ? AND role = 'board'", [club.id])).n);
      if (t.role !== 'board' && nb >= 2) fail('Der Vorstand hat höchstens zwei weitere Mitglieder.');
      await conn.query("UPDATE club_members SET role = 'board' WHERE club_id = ? AND user_id = ?", [club.id, targetId]);
      await K.clubBook(conn, club.id, targetId, 'board', 0, 'in den Vorstand berufen');
    } else {
      await conn.query("UPDATE club_members SET role = 'member' WHERE club_id = ? AND user_id = ?", [club.id, targetId]);
      await K.clubBook(conn, club.id, targetId, 'board', 0, 'aus dem Vorstand entlassen');
    }
    K.after(conn, () => live.publish('civic', {}));
    return { msg: role === 'president' ? 'Der Vorsitz ist übergeben. Du bleibst im Vorstand.' : role === 'board' ? 'Das Mitglied gehört jetzt zum Vorstand.' : 'Das Mitglied ist wieder einfaches Mitglied.', level: 'good' };
  }, { needAlive: true });
}

async function kick(userId, clubId, targetId) {
  let name = '';
  const out = await service.withCharacter(userId, async (ctx) => {
    const { state, conn } = ctx; targetId = int(targetId);
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId);
    if (!isBoard(m)) fail('Mitglieder ausschließen kann nur der Vorstand.');
    if (targetId === userId) fail('Zum Verlassen nutze „Austreten“.');
    const t = await memberOf(conn, club.id, targetId, true); if (!t) fail('Dieses Mitglied gibt es nicht.');
    if (t.role === 'president' || (t.role === 'board' && m.role !== 'president')) fail('Den Vorsitz und den Vorstand kann nur eine Abwahl oder der Vorsitz entfernen.');
    await conn.query('DELETE FROM club_members WHERE club_id = ? AND user_id = ?', [club.id, targetId]);
    await conn.query('INSERT INTO club_left (club_id, user_id, left_ms) VALUES (?,?,?) ON DUPLICATE KEY UPDATE left_ms = VALUES(left_ms)', [club.id, targetId, Date.now() + 72 * HOUR]);
    await K.clubBook(conn, club.id, targetId, 'kick', 0, 'ausgeschlossen');
    name = club.name;
    K.after(conn, () => live.publish('civic', {}));
    chronicle(state, `${state.person.first} schließt ein Mitglied aus dem Verein „${club.name}“ aus.`, 'society');
    return { msg: 'Das Mitglied wurde ausgeschlossen.', level: 'warn' };
  }, { needAlive: true });
  await letter(targetId, 'Aus dem Verein ausgeschlossen', `Der Vorstand hat dich aus dem Verein „${name}“ ausgeschlossen.`);
  return out;
}

/** Misstrauen gegen den Vorsitz: Erreicht es die Mehrheit, wird er abgewählt und der Vorsitz geht an den Nachfolger. */
async function mistrust(userId, clubId, on) {
  let ousted = null;
  const out = await service.withCharacter(userId, async (ctx) => {
    const { conn } = ctx;
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId, true);
    if (!m) fail('Nur Mitglieder können abstimmen.');
    if (m.role === 'president') fail('Über sich selbst stimmt der Vorsitz nicht ab.');
    if (Date.now() - num(club.chair_ms, 0) < 6 * HOUR) fail('Der Vorsitz ist gerade erst gewählt. Gib ihm etwas Zeit.');
    await conn.query('UPDATE club_members SET mistrust = ? WHERE club_id = ? AND user_id = ?', [on ? 1 : 0, club.id, userId]);
    const votes = Number((await conn.one('SELECT COUNT(*) n FROM club_members WHERE club_id = ? AND mistrust = 1 AND role <> ?', [club.id, 'president'])).n);
    const n = await countMembers(conn, club.id);
    let msg = on ? `Dein Misstrauen ist vermerkt (${votes} von ${n} Mitgliedern).` : 'Dein Misstrauen ist zurückgenommen.';
    if (on && M.mistrustReached(votes, n)) {
      const old = club.president_id;
      await conn.query("UPDATE club_members SET role = 'member' WHERE club_id = ? AND user_id = ?", [club.id, old]);
      const r = await succeed(conn, { ...club }, old, 'Abwahl des Vorsitzes');
      await K.clubBook(conn, club.id, old, 'ousted', 0, 'abgewählt');
      ousted = old; msg = 'Die Mehrheit der Mitglieder hat dem Vorsitz das Vertrauen entzogen. Er ist abgewählt, ein Nachfolger übernimmt.';
      void r;
    }
    K.after(conn, () => live.publish('civic', {}));
    return { msg, level: ousted ? 'warn' : 'info' };
  }, { needAlive: true });
  if (ousted) {
    await require('./reputation').add(ousted, 'scandal', null, 'club_ousted', `c${clubId}`);
    await letter(ousted, 'Als Vorsitzender abgewählt', 'Die Mitglieder haben dir das Vertrauen entzogen. Du bist weiter Mitglied, der Vorsitz ging an einen Nachfolger.');
  }
  return out;
}

/* ================================================================================================================================================
   Veruntreuung: Geld privat aus der Kasse nehmen
   ================================================================================================================================================ */
async function withdraw(userId, clubId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const W = cfg().withdraw || {};
    if (W.enabled === false) fail('Entnahmen aus der Kasse sind gerade nicht möglich.');
    await K.guard(userId, state, 'clubs');
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId);
    if (!isBoard(m)) fail('Über die Kasse verfügt nur der Vorstand.');
    const n = await countMembers(conn, club.id);
    if (n < num(W.minMembers, 2)) fail('Ein Ein-Mann-Verein hat niemanden, der die Kasse prüft.');
    const idx = K.idxOf(world, state); const cents = K.centsFrom(input.amount); if (cents == null) fail('Bitte einen Betrag angeben.');
    const real = cents / idx;
    if (input.confirm !== true) fail('Das ist Veruntreuung. Bitte bestätige ausdrücklich, dass du das Geld privat entnehmen willst.');
    const r = await conn.query('UPDATE clubs SET treasury_real = treasury_real - ?, embezzled_real = embezzled_real + ? WHERE id = ? AND treasury_real >= ?', [real, real, club.id, real]);
    if (!r || !r.affectedRows) fail('So viel ist nicht in der Kasse.');
    state.money += cents; // kein „verdientes“ Geld: es gehört der Kasse
    await K.clubBook(conn, club.id, userId, 'withdraw', real, 'privat entnommen');
    // Opfer ist das dienstälteste andere Mitglied; es sieht die Spur im Bereich „Recht & Gericht“ (Täter bekannt: das Kassenbuch nennt den Namen)
    const vic = await conn.one('SELECT user_id FROM club_members WHERE club_id = ? AND user_id <> ? ORDER BY (role = \'member\') DESC, joined_ms ASC, user_id ASC LIMIT 1', [club.id, userId]);
    if (vic) await require('./court').trace(conn, { act: 'embezzle', offenderId: userId, victimId: vic.user_id, victimCompany: club.id, subject: club.name, cityId: club.city_id, damageReal: real, known: true });
    RP.queue(state, 'scandal', num(W.scandal, 12), 'club_embezzle', `c${club.id}`);
    K.after(conn, () => live.publish('civic', {}));
    notice(state, { level: 'bad', title: 'Kasse geplündert', tab: 'society', text: `Du hast ${K.money(cents, world, state)} aus der Vereinskasse genommen. Alle Mitglieder können es im Kassenbuch lesen.`, info: ['Das ist Veruntreuung: Ein Mitglied kann dich vor Gericht bringen.', 'Verlierst du den Prozess, musst du das Geld in die Kasse zurückzahlen und es kostet Ansehen.', 'Die Mitglieder können dich außerdem abwählen.'] });
    await refresh(conn, ctx.user, state, world);
    return { msg: `${K.money(cents, world, state)} wurden aus der Kasse genommen – das steht jetzt im Kassenbuch.`, level: 'bad' };
  }, { needAlive: true });
}

/** Schadenersatz aus einem Urteil über Veruntreuung fließt zurück in die Kasse (aus src/lib/court.js). */
async function restitution(conn, clubId, real, text) {
  const r = await conn.query("UPDATE clubs SET treasury_real = treasury_real + ? WHERE id = ? AND status = 'active'", [real, int(clubId)]);
  if (r && r.affectedRows) { await K.clubBook(conn, clubId, null, 'restitution', real, text || 'Rückzahlung nach Urteil'); K.after(conn, () => live.publish('civic', {})); return true; }
  return false;
}

/* ================================================================================================================================================
   Wahlempfehlung: Vereine unterstützen Kandidaten, ersetzen aber keine Stimmen
   ================================================================================================================================================ */
async function endorse(userId, clubId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const E = cfg().endorse || {};
    await K.guard(userId, state, 'clubs');
    const club = await clubRow(conn, clubId, true); const m = await memberOf(conn, club.id, userId);
    if (!isBoard(m)) fail('Wahlempfehlungen spricht der Vorstand aus.');
    const n = await countMembers(conn, club.id);
    if (n < num(E.minMembers, 4)) fail(`Ein Verein braucht mindestens ${num(E.minMembers, 4)} Mitglieder, um eine Wahlempfehlung auszusprechen.`);
    const el = await conn.one("SELECT * FROM elections WHERE id = ? AND status = 'open'", [int(input.election)]);
    if (!el) fail('Diese Wahl gibt es nicht mehr.');
    if (Date.now() >= Number(el.vote_start)) fail('Die Wahl läuft schon. Empfehlungen sind nur vor Beginn der Abstimmung möglich.');
    if (el.city_id && el.city_id !== club.city_id) fail('Dein Verein kann nur bei Wahlen seiner eigenen Stadt oder bei Wahlen im ganzen Land empfehlen.');
    const cand = int(input.candidate);
    if (cand === userId) fail('Der Vorsitz empfiehlt sich nicht selbst. Lass einen anderen aus dem Vorstand entscheiden.');
    const c = await conn.one('SELECT 1 x FROM election_candidates WHERE election_id = ? AND user_id = ?', [el.id, cand]); if (!c) fail('Diesen Kandidaten gibt es in dieser Wahl nicht.');
    const funded = !!input.funded;
    const prev = await conn.one('SELECT candidate_id, funded FROM club_endorsements WHERE club_id = ? AND election_id = ?', [club.id, el.id]);
    if (prev && prev.candidate_id === cand && (!funded || prev.funded)) fail('Diesen Kandidaten empfiehlt der Verein schon.');
    let cost = 0;
    if (funded && !(prev && prev.funded)) {
      cost = num(E.costReal, 2000);
      const r = await conn.query('UPDATE clubs SET treasury_real = treasury_real - ? WHERE id = ? AND treasury_real >= ?', [cost, club.id, cost]);
      if (!r || !r.affectedRows) fail(`Für die Wahlkampfhilfe reicht die Kasse nicht (nötig: ${K.money(Math.round(cost * K.idxOf(world, state)), world, state)}).`);
    }
    await conn.query('INSERT INTO club_endorsements (club_id, election_id, candidate_id, funded) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE candidate_id = VALUES(candidate_id), funded = GREATEST(funded, VALUES(funded))', [club.id, el.id, cand, funded ? 1 : 0]);
    await K.clubBook(conn, club.id, cand, 'endorse', cost, funded ? 'Wahlkampfhilfe' : 'Wahlempfehlung');
    const cn = await conn.one('SELECT COALESCE(ps.name, u.username) name, u.social_public FROM users u LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE u.id = ?', [cand]);
    K.after(conn, () => { live.publish('civic', {}); live.publish('market', {}); });
    const boost = M.endorseBoost(n, funded); const cname = cn && cn.social_public ? cn.name : '';
    const msg = cname ? `Der Verein „${club.name}“ empfiehlt ${cname}. Das gibt etwa +${boost} % Stimmengewicht – gewählt wird weiter von den Bürgern.`
      : `Der Verein „${club.name}“ empfiehlt den Kandidaten. Das gibt etwa +${boost} % Stimmengewicht – gewählt wird weiter von den Bürgern.`;
    return { msg, level: 'good' };
  }, { needAlive: true });
}

/** Stimmengewicht aus Empfehlungen für Kandidaten einer Wahl: Map(userId → Prozentpunkte-Liste). Gezählt werden nur Mitglieder, die schon ein Weilchen dabei sind, kein neues Konto sind und nicht dieselbe Internetverbindung wie der Kandidat nutzen. */
async function endorsements(electionId, conn = db) {
  const E = cfg().endorse || {}; const out = new Map();
  const rows = await conn.query('SELECT e.club_id, e.candidate_id, e.funded FROM club_endorsements e JOIN clubs c ON c.id = e.club_id AND c.status = \'active\' WHERE e.election_id = ?', [int(electionId)]);
  const minAge = Date.now() - num(E.minMemberHours, 24) * HOUR;
  const minAcc = num(M.C().minAccountHours, 12);
  for (const r of rows) {
    const n = Number((await conn.one(
      `SELECT COUNT(*) n FROM club_members m JOIN users u ON u.id = m.user_id WHERE m.club_id = ? AND m.user_id <> ? AND m.joined_ms <= ? AND u.banned = 0 AND u.created_at <= NOW() - INTERVAL ? HOUR
         AND NOT EXISTS (SELECT 1 FROM user_ips a JOIN user_ips b ON a.ip = b.ip WHERE a.user_id = m.user_id AND b.user_id = ?)`, [r.club_id, r.candidate_id, minAge, minAcc, r.candidate_id])).n);
    if (n < num(E.minMembers, 4) - 1) continue; // der Verein war schon beim Aussprechen groß genug; hier zählen nur echte, unabhängige Mitglieder
    const pct = M.endorseBoost(n, !!r.funded);
    (out.get(r.candidate_id) || out.set(r.candidate_id, []).get(r.candidate_id)).push(pct);
  }
  return out;
}

/* ================================================================================================================================================
   Ansichten
   ================================================================================================================================================ */
/** Mitglieder eines Vereins mit Namen (nur sichtbare Profile mit Namen). */
async function membersView(conn, clubId, viewerId) {
  const rows = await conn.query(`SELECT m.user_id, m.role, m.joined_ms, m.paid_until, m.mistrust, ps.name, u.username, u.social_public FROM club_members m JOIN users u ON u.id = m.user_id LEFT JOIN player_stats ps ON ps.user_id = m.user_id
    WHERE m.club_id = ? ORDER BY (m.role = 'president') DESC, (m.role = 'board') DESC, m.joined_ms LIMIT 80`, [clubId]);
  return rows.map((r) => ({ userId: r.user_id, name: r.user_id === viewerId ? (r.name || r.username) : pub(r), role: r.role, roleName: M.ROLE_NAME[r.role], since: Number(r.joined_ms), paidUntil: Number(r.paid_until), mistrust: !!r.mistrust, me: r.user_id === viewerId }));
}
async function ledgerView(conn, clubId, viewerId, idx, limit = 30) {
  const rows = await conn.query(`SELECT l.id, l.kind, l.amount_real, l.text, l.created_at, l.user_id, ps.name, u.username, u.social_public FROM club_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN player_stats ps ON ps.user_id = l.user_id WHERE l.club_id = ? ORDER BY l.id DESC LIMIT ?`, [clubId, limit]);
  return rows.map((r) => ({ id: r.id, kind: r.kind, amount: Math.round(Number(r.amount_real) * idx), who: r.user_id ? (r.user_id === viewerId ? (r.name || r.username) : pub(r)) : null, text: r.text, at: new Date(r.created_at).getTime() }));
}

module.exports = { found, join, leave, dissolve, setFee, donate, event, applyEvent, setRole, kick, mistrust, withdraw, restitution, endorse, endorsements, closeClub, succeed, membersView, ledgerView, clubRow, memberOf, isBoard, countMembers, slotsFor };
