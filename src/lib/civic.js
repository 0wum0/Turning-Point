'use strict';
/**
 * Gesellschaft (Server): Vereine, Gemeinden, Stiftungen sowie Titel und Ränge – Abgleich beim Laden des Spielstands, Übersicht für die Oberfläche,
 * Anbindung an Wahlen, Gericht und Erbfall, Zeitgeber, Bots und Admin. Rechenregeln: src/game/civic.js. Einzelne Bereiche: civic-clubs.js,
 * civic-parish.js, civic-foundation.js; gemeinsame Bausteine: civic-core.js.
 *
 * Spielstand: `state.civic` ist ein Zwischenspeicher (wird bei jedem Laden aus der Datenbank gefüllt, nie vom Spieler verändert), `state.flags.civic`
 * trägt Familienangaben (offene Trauerfeiern, Vermächtnis). Beiträge zieht reconcile() beim Laden ein: erst die Mitgliedszeile bedingt aktualisieren
 * (`paid_until` unverändert), erst dann Geld buchen – so wird jeder Beitrag genau einmal gezahlt, auch bei gleichzeitigen Anfragen.
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const live = require('./live');
const service = require('../game/service');
const M = require('../game/civic');
const RP = require('../game/reputation');
const social = require('./social');
const tagesblatt = require('./tagesblatt');
const K = require('./civic-core');
const Clubs = require('./civic-clubs');
const Parish = require('./civic-parish');
const Found = require('./civic-foundation');
const { ActionError } = require('../game/actions');
const { notice, chronicle } = require('../game/core');
const { yearOf } = require('../game/calendar');

const { fail, num, int, HOUR } = K;
void settings;
const cfg = () => M.C();
const letter = (to, subject, body, from) => social.sendSystemLetter(to, subject, body, from || null).catch((e) => log.warn(`[gesellschaft] Brief: ${e.message}`));

/* ================================================================================================================================================
   Titel
   ================================================================================================================================================ */
/** Kennzahlen für Titel aus Spielstand und Konto (alles in Real = Cent Wert 1945). */
async function gatherFacts(conn, user, state, world) {
  const sums = await K.userSums(conn, user.id);
  const year = yearOf(state.day, state.startYear); const idx = Math.max(0.0001, world.idx(year));
  const biz = require('../game/business');
  let bizVal = 0; let staff = 0;
  for (const c of state.companies || []) { if (c.abandoned) continue; try { bizVal += biz.companyValue(world, state, c, year) + (c.cash || 0); } catch (_) { /* unvollständig */ } staff += (c.staff || 0) + (c.playerStaff || []).length; }
  const st = RP.stand(state); const scandal = state.rep && Array.isArray(state.rep.c) ? Number(state.rep.c[4]) || 0 : 0;
  let office = 0; for (const [k, v] of Object.entries((state.politics && state.politics.completed) || {})) if (v > 0) office = Math.max(office, Number(k) + 1);
  const rows = await conn.query("SELECT c.id, c.chair_ms, c.embezzled_real, (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id) members FROM clubs c WHERE c.president_id = ? AND c.status = 'active'", [user.id]);
  let chair = 0; let chairDays = 0;
  for (const r of rows) { if (Number(r.embezzled_real) > 0) continue; if (r.members > chair) { chair = r.members; chairDays = (Date.now() - Number(r.chair_ms)) / 86400000; } }
  return { lvl: st.lv, scandal, donated: sums.donated, contributed: sums.contributed, biz: bizVal / idx, staff, chair, chairDays, office };
}

async function setBestTitle(conn, userId) {
  const tt = await K.titlesOf(conn, userId);
  await conn.query('UPDATE player_stats SET title = ? WHERE user_id = ?', [M.bestTitle(tt), userId]);
}

/** Titel vergeben, erhöhen oder entziehen. Gibt true zurück, wenn sich etwas änderte. Gedrosselt (Einstellung titles.checkMinutes), force umgeht das. */
async function evaluateTitles(conn, user, state, world, force = false) {
  if (!M.titlesOn() || state.status !== 'alive') return false;
  const T = cfg().titles || {}; const f = M.ensure(state); const now = Date.now();
  if (!force && now - num(f.chk, 0) < num(T.checkMinutes, 10) * 60000) return false;
  f.chk = now;
  const facts = await gatherFacts(conn, user, state, world);
  const have = await conn.query('SELECT * FROM titles WHERE user_id = ?', [user.id]);
  let changed = false;
  const unworthy = facts.lvl < -1 || facts.scandal >= 25;
  if (unworthy) {
    for (const t of have.filter((x) => x.active)) {
      await conn.query('UPDATE titles SET active = 0, ref = ? WHERE id = ?', ['unwuerdig', t.id]); changed = true;
      const nm = M.titleName(t.tkey, t.rnk);
      notice(state, { level: 'bad', title: `Titel aberkannt: ${nm}`, tab: 'society', text: 'Dein Ruf ist so schlecht geworden, dass dir der Titel aberkannt wurde. Mit gutem Ansehen kannst du ihn zurückgewinnen.' });
      RP.queue(state, 'scandal', null, 'title_lost', t.tkey);
    }
  } else {
    for (const ev of M.evaluate(facts)) {
      const d = M.titleDef(ev.key); const row = have.find((x) => x.tkey === ev.key && x.city_id === 0);
      if (row && row.active && row.rnk >= ev.rank) continue;
      if (row && !row.active && (row.ref === 'court' || row.ref === 'admin')) continue; // gerichtlich oder von der Spielleitung entzogen: nur dort wieder vergeben
      const nm = M.titleName(ev.key, ev.rank);
      if (row) await conn.query('UPDATE titles SET rnk = ?, active = 1, ref = NULL, granted_ms = ? WHERE id = ?', [ev.rank, now, row.id]);
      else await conn.query('INSERT INTO titles (user_id, tkey, rnk, city_id, scope, granted_ms) VALUES (?,?,?,?,?,?)', [user.id, ev.key, ev.rank, 0, d.scope === 'family' ? 'family' : 'person', now]);
      changed = true;
      RP.queue(state, 'civic', num(T.repOnGrant, 3) * ev.rank, 'title_gain', ev.key);
      chronicle(state, `${state.person.first} erhält den Titel „${nm}“.`, 'society');
      notice(state, { level: 'good', title: `Titel verliehen: ${nm}`, tab: 'society', interrupt: true, text: `Für dein Wirken in der Stadt trägst du jetzt den Titel „${nm}“. Er bringt dir mehr Gewicht bei Wahlen und kleine Vorteile.`, info: [d.what, d.scope === 'family' ? 'Der Titel gehört deiner Familie und bleibt über die Generationen.' : 'Der Titel gehört dir persönlich und endet mit deinem Leben.', 'Unter „Gesellschaft → Titel“ siehst du, was er bewirkt und wie der nächste Rang aussieht.'] });
      const nmP = user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Bürger';
      const cid = state.cityId;
      await tagesblatt.post('life', 'Titel verliehen', `${nmP} trägt jetzt den Titel „${nm}“.`, cid, conn);
      K.after(conn, () => letter(user.id, 'Titel verliehen', `Dir wurde der Titel „${nm}“ verliehen. Unter „Gesellschaft → Titel“ siehst du, was er bewirkt.`));
    }
  }
  if (changed) { await setBestTitle(conn, user.id); K.after(conn, () => live.publish('civic', {}, user.id)); }
  return changed;
}

/** Titel von außen vergeben (Ehrenbürgerwürde des Bürgermeisters, Spielleitung): eigene Transaktion. */
async function grantTitle(userId, key, rank = 1, cityId = 0, ref = null, opts = {}) {
  const d = M.titleDef(key); if (!d) return false;
  const rk = Math.max(1, Math.min(d.ranks.length, int(rank, 1)));
  const after = [];
  await db.tx(async (conn) => {
    conn.civicAfter = after;
    const row = await conn.one('SELECT * FROM titles WHERE user_id = ? AND tkey = ? AND city_id = ? FOR UPDATE', [userId, key, cityId || 0]);
    if (row) await conn.query('UPDATE titles SET rnk = GREATEST(rnk, ?), active = 1, ref = ?, granted_ms = ? WHERE id = ?', [rk, ref ? String(ref).slice(0, 60) : null, Date.now(), row.id]);
    else await conn.query('INSERT INTO titles (user_id, tkey, rnk, city_id, scope, granted_ms, ref) VALUES (?,?,?,?,?,?,?)', [userId, key, rk, cityId || 0, d.scope === 'family' ? 'family' : 'person', Date.now(), ref ? String(ref).slice(0, 60) : null]);
    await setBestTitle(conn, userId);
  });
  for (const fn of after) { try { await fn(); } catch (_) { /* optional */ } }
  if (!opts.quiet) {
    await require('./reputation').add(userId, 'civic', num((cfg().titles || {}).repOnGrant, 3) * rk, 'title_gain', key, { cityId: cityId || 0 });
    const nm = M.titleName(key, rk);
    await letter(userId, 'Titel verliehen', `Dir wurde der Titel „${nm}“ verliehen. Unter „Gesellschaft → Titel“ siehst du, was er bewirkt.`);
  }
  live.publish('civic', {}, userId);
  return true;
}
async function revokeTitle(userId, key, why = 'admin', cityId = null) {
  const r = await db.query('UPDATE titles SET active = 0, ref = ? WHERE user_id = ? AND tkey = ? AND active = 1' + (cityId == null ? '' : ' AND city_id = ?'), cityId == null ? [why, userId, key] : [why, userId, key, cityId]);
  if (r.affectedRows) { await setBestTitle(db, userId); live.publish('civic', {}, userId); }
  return r.affectedRows;
}

/* ================================================================================================================================================
   Zwischenspeicher im Spielstand und Abgleich beim Laden
   ================================================================================================================================================ */
async function snapshot(conn, user, state, world) {
  if (!M.enabled()) { delete state.civic; return null; }
  const rows = await conn.query(
    `SELECT m.club_id, m.role, m.joined_ms, m.paid_until, c.name, c.kind, c.fee_real, (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id) members
     FROM club_members m JOIN clubs c ON c.id = m.club_id AND c.status = 'active' WHERE m.user_id = ? ORDER BY m.joined_ms`, [user.id]);
  const clubs = rows.map((r) => ({ id: r.club_id, name: r.name, kind: r.kind, role: r.role, members: Number(r.members) }));
  const pm = await Parish.myRow(conn, user.id);
  const fo = await Found.myFoundation(conn, user.id);
  const tt = await K.titlesOf(conn, user.id);
  const potRaw = K.potFx(world, state.cityId);
  const lvl = pm ? M.parishLevel(Parish.standingOf(pm)) : null;
  const titles = tt.map((t) => ({ key: t.key, rank: t.rank, name: M.titleName(t.key, t.rank), scope: t.scope, cityId: t.cityId }));
  const fx = M.combineFx({ clubs, parishLevel: lvl ? lvl.idx : -1, pot: potRaw ? { health: potRaw.health, wellbeing: potRaw.wellbeing, kids: potRaw.kids, aid: potRaw.aid } : null, titles: tt });
  const idx = Math.max(0.0001, world.idx(yearOf(state.day, state.startYear)));
  const arrears = rows.filter((r) => num(r.fee_real, 0) > 0 && Date.now() >= Number(r.paid_until)).length;
  state.civic = {
    at: Date.now(), clubs,
    parish: pm ? { id: pm.parish_id, faith: pm.faith, name: (M.faithOf(pm.faith) || {}).name || pm.faith, standing: Math.round(Parish.standingOf(pm) * 10) / 10, levelName: lvl.name, level: lvl.idx, fund: Math.round(Number(pm.fund_real) * idx) } : null,
    foundation: fo ? { id: fo.id, name: fo.name, purpose: fo.purpose, capital: Math.round(Number(fo.capital_real) * idx), gen: fo.generation } : null,
    titles, fx, due: arrears,
  };
  return state.civic;
}
/** „Prüfen jetzt“: Titel sofort neu berechnen (die Oberfläche ruft das beim Öffnen des Reiters Titel). */
async function checkTitles(userId) {
  return service.withCharacter(userId, async (ctx) => {
    if (!M.titlesOn()) return { msg: 'Titel sind gerade nicht verfügbar.', level: 'info' };
    const ch = await evaluateTitles(ctx.conn, ctx.user, ctx.state, ctx.world, true);
    if (ch) await snapshot(ctx.conn, ctx.user, ctx.state, ctx.world);
    return { msg: ch ? 'Deine Titel wurden aktualisiert.' : 'Es gibt nichts Neues.', level: ch ? 'good' : 'info', changed: ch };
  }, { needAlive: true });
}
/** Nach jeder Handlung den Zwischenspeicher auffrischen (Aufgaben und „Was jetzt?“ sehen den neuen Stand sofort). */
async function refresh(conn, user, state, world) { await snapshot(conn, user, state, world); await evaluateTitles(conn, user, state, world, true).then((ch) => (ch ? snapshot(conn, user, state, world) : null)).catch((e) => log.warn(`[titel] ${e.message}`)); }

/** Beiträge einziehen, Feste anwenden, Mitglieder mit zu langem Rückstand entlassen. */
async function collect(conn, user, state, world, now) {
  const rows = await conn.query(
    `SELECT m.*, c.name cname, c.kind, c.fee_real, c.city_id, c.president_id, c.event_ms FROM club_members m JOIN clubs c ON c.id = m.club_id AND c.status = 'active' WHERE m.user_id = ? ORDER BY m.joined_ms`, [user.id]);
  const idx = K.idxOf(world, state); const iv = M.feeInterval();
  for (const m of rows) {
    const club = { id: m.club_id, name: m.cname, event_ms: m.event_ms, city_id: m.city_id, president_id: m.president_id };
    const d = M.dues(m, m.fee_real, now);
    if (d.periods > 0) {
      const per = Math.round(num(m.fee_real, 0) * idx);
      const pay = per > 0 ? Math.min(d.periods, Math.floor(Math.max(0, state.money) / per)) : d.periods;
      if (pay > 0) {
        const until = pay === d.periods ? now + iv : Number(m.paid_until) + pay * iv;
        const upd = await conn.query('UPDATE club_members SET paid_until = ?, paid_real = paid_real + ? WHERE club_id = ? AND user_id = ? AND paid_until = ?', [until, num(m.fee_real, 0) * pay, m.club_id, user.id, m.paid_until]);
        if (upd && upd.affectedRows) {
          const amount = per * pay;
          state.money -= amount; state.stats.spent += amount;
          await conn.query("UPDATE clubs SET treasury_real = treasury_real + ? WHERE id = ? AND status = 'active'", [num(m.fee_real, 0) * pay, m.club_id]);
          await K.clubBook(conn, m.club_id, user.id, 'fee', num(m.fee_real, 0) * pay, pay > 1 ? `${pay} Beiträge` : 'Beitrag');
          RP.queue(state, 'civic', null, 'club_active', `c${m.club_id}`);
          const money = K.money(amount, world, state);
          const text = pay === 1 && d.periods === 1 ? `Der Beitrag wurde abgebucht: ${money}.` : pay === d.periods ? `Die Beiträge für ${pay} Jahre wurden abgebucht: ${money}.` : `Die Beiträge für ${pay} Jahre wurden abgebucht: ${money}. Für die übrigen Jahre reichte das Geld nicht.`;
          notice(state, { level: pay < d.periods ? 'warn' : 'info', title: `Vereinsbeitrag: ${m.cname}`, tab: 'society', text });
        }
      } else if (d.lapsed) {
        const del = await conn.query('DELETE FROM club_members WHERE club_id = ? AND user_id = ? AND paid_until = ?', [m.club_id, user.id, m.paid_until]);
        if (del && del.affectedRows) {
          await conn.query('INSERT INTO club_left (club_id, user_id, left_ms) VALUES (?,?,?) ON DUPLICATE KEY UPDATE left_ms = VALUES(left_ms)', [m.club_id, user.id, now]);
          await K.clubBook(conn, m.club_id, user.id, 'lapse', 0, 'wegen offener Beiträge ausgeschieden');
          if (m.role === 'president') await Clubs.succeed(conn, { id: m.club_id, name: m.cname, city_id: m.city_id }, user.id, 'Vorsitz nach Ausscheiden');
          notice(state, { level: 'warn', title: `Aus dem Verein ausgeschieden: ${m.cname}`, tab: 'society', text: 'Du konntest den Beitrag nicht zahlen und bist deshalb ausgeschieden.' });
        }
      } else if (state.day - num(state.pending.clubWarn, -99) >= 5) {
        state.pending.clubWarn = state.day;
        notice(state, { level: 'warn', title: `Vereinsbeitrag offen: ${m.cname}`, tab: 'society', text: 'Für den Beitrag reicht dein Geld gerade nicht. Zahle bald, sonst scheidest du aus dem Verein aus.' });
      }
    }
    await Clubs.applyEvent(conn, user, state, m, club);
  }
}

async function reconcile(conn, user, state, world) {
  if (!state) return;
  try {
    if (!M.enabled()) { delete state.civic; return; }
    const alive = state.status === 'alive';
    if (alive && M.clubsOn()) await collect(conn, user, state, world, Date.now());
    await snapshot(conn, user, state, world);
    if (alive && M.titlesOn()) { const ch = await evaluateTitles(conn, user, state, world, false); if (ch) await snapshot(conn, user, state, world); }
  } catch (e) { log.warn(`[gesellschaft] Abgleich: ${e.message}`); }
}

/* ================================================================================================================================================
   Übersicht für die Oberfläche
   ================================================================================================================================================ */
async function titlesView(conn, user, state, world, idx) {
  const mine = await conn.query('SELECT * FROM titles WHERE user_id = ? ORDER BY active DESC, rnk DESC', [user.id]);
  const facts = await gatherFacts(conn, user, state, world);
  const FACT_LABEL = { lvl: 'Ansehen', donated: 'Spenden insgesamt', contributed: 'In Stiftungen eingebracht', biz: 'Wert deiner Betriebe', staff: 'Mitarbeiter', chair: 'Mitglieder deines Vereins', chairDays: 'Tage im Vorsitz', office: 'Höchstes Amt' };
  const money = (v) => Math.round(v * idx);
  const val = (k, v) => (['donated', 'contributed', 'biz'].includes(k) ? money(v) : k === 'chairDays' ? Math.floor(v) : v);
  const catalog = M.titleList().map((d) => {
    const have = mine.find((x) => x.tkey === d.key && x.active);
    const ranks = d.ranks.map((rn, i) => {
      const req = (d.req || [])[i] || null;
      const lines = req ? Object.keys(req).map((k) => ({ key: k, label: FACT_LABEL[k] || k, need: k === 'lvl' ? RP.levelName(req[k]) : k === 'office' ? ((world.econ.politics.offices[req[k] - 1] || {}).name || '') : val(k, req[k]), have: k === 'lvl' ? RP.levelName(facts.lvl) : k === 'office' ? ((world.econ.politics.offices[facts.office - 1] || {}).name || '–') : val(k, facts[k]), ok: Number(facts[k] || 0) >= Number(req[k]), money: ['donated', 'contributed', 'biz'].includes(k), levelMin: k === 'lvl' ? req[k] : undefined })) : [];
      const fx = d.fx || {};
      return { rank: i + 1, name: rn, got: !!(have && have.rnk >= i + 1), lines, fx: { vote: (fx.vote || [])[i] || 0, fee: (fx.fee || [])[i] || 0, rev: (fx.rev || [])[i] || 0, slots: (fx.slots || [])[i] || 0 } };
    });
    return { key: d.key, name: d.name, what: d.what, scope: d.scope, auto: d.auto !== false, city: !!d.city, ranks, have: have ? have.rnk : 0 };
  });
  const active = mine.filter((x) => x.active).map((x) => ({ key: x.tkey, rank: x.rnk, cityId: x.city_id, scope: x.scope }));
  const fx = M.titleFx(active);
  return {
    mine: mine.map((x) => ({ key: x.tkey, rank: x.rnk, name: M.titleName(x.tkey, x.rnk), scope: x.scope, active: !!x.active, city: x.city_id ? (world.city(x.city_id) || {}).name || '' : '', since: Number(x.granted_ms), ref: x.ref })),
    catalog, fx, best: M.bestTitle(active),
    facts: { lvl: facts.lvl, lvlName: RP.levelName(facts.lvl), scandal: facts.scandal },
  };
}

async function clubsView(conn, user, state, world, idx) {
  const k = M.C().clubs || {}; const userId = user.id;
  const mine = await conn.query(`SELECT m.role, m.paid_until, m.joined_ms, c.*, (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id) members, pp.name pname, pu.social_public ppub, pu.username puser
    FROM club_members m JOIN clubs c ON c.id = m.club_id AND c.status = 'active' LEFT JOIN player_stats pp ON pp.user_id = c.president_id LEFT JOIN users pu ON pu.id = c.president_id WHERE m.user_id = ? ORDER BY m.joined_ms`, [userId]);
  const list = await conn.query(`SELECT c.id, c.name, c.kind, c.fee_real, c.events_n, c.chair_ms, (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id) members, pp.name pname, pu.social_public ppub
    FROM clubs c LEFT JOIN player_stats pp ON pp.user_id = c.president_id LEFT JOIN users pu ON pu.id = c.president_id WHERE c.city_id = ? AND c.status = 'active' ORDER BY members DESC, c.id LIMIT 40`, [state.cityId]);
  const joined = new Set(mine.map((r) => r.id));
  const slots = await Clubs.slotsFor(conn, userId);
  const kindInfo = (key) => M.kindOf(key) || { name: key, icon: 'users' };
  const blk = RP.block(RP.stand(state).lv, -1);
  const founded = mine.filter((r) => r.role === 'president').length;
  let foundWhy = null;
  if (state.day < num(k.foundMinGameDays, 20)) foundWhy = `Ab ${num(k.foundMinGameDays, 20)} Spieltagen.`;
  else if (blk) foundWhy = 'Verrufene dürfen keinen Verein gründen.';
  else if (founded >= num(k.maxFounded, 2)) foundWhy = `Du leitest schon ${founded} Vereine.`;
  else if (mine.length >= slots) foundWhy = 'Du bist schon in so vielen Vereinen, wie du schaffen kannst.';
  else if (state.money < Math.round(num(k.foundFeeReal, 4000) * idx)) foundWhy = 'Dir fehlt das Geld für die Gründung.';
  return {
    kinds: M.kinds().map((x) => ({ key: x.key, name: x.name, icon: x.icon, what: x.what })),
    mine: mine.map((r) => ({
      id: r.id, name: r.name, kind: r.kind, kindName: kindInfo(r.kind).name, icon: kindInfo(r.kind).icon, role: r.role, roleName: M.ROLE_NAME[r.role], members: Number(r.members), fee: Math.round(Number(r.fee_real) * idx),
      treasury: Math.round(Number(r.treasury_real) * idx), paidUntil: Number(r.paid_until), arrears: Number(r.fee_real) > 0 && Date.now() >= Number(r.paid_until), president: r.ppub ? (r.pname || r.puser) : null, active: Number(r.members) >= num(k.minActive, 3), descr: r.descr || '',
    })),
    list: list.map((r) => ({
      id: r.id, name: r.name, kind: r.kind, kindName: kindInfo(r.kind).name, icon: kindInfo(r.kind).icon, members: Number(r.members), fee: Math.round(Number(r.fee_real) * idx), president: r.ppub ? r.pname : null, joined: joined.has(r.id), events: r.events_n,
      full: Number(r.members) >= num(k.maxMembers, 60), active: Number(r.members) >= num(k.minActive, 3),
      why: joined.has(r.id) ? null : Number(r.members) >= num(k.maxMembers, 60) ? 'Der Verein ist voll.' : mine.length >= slots ? 'Du bist schon in genug Vereinen.' : blk ? 'Verrufene nimmt kein Verein auf.' : state.money < Math.round(Number(r.fee_real) * idx) ? 'Der erste Beitrag übersteigt dein Geld.' : null,
    })),
    found: { ok: !foundWhy, why: foundWhy, cost: Math.round(num(k.foundFeeReal, 4000) * idx), feeDefault: Math.round(num(k.feeDefaultReal, 1200) * idx), feeMax: Math.round(num(k.feeMaxReal, 6000) * idx), maxFounded: num(k.maxFounded, 2), founded, slots, used: mine.length, minActive: num(k.minActive, 3), nameMax: num(k.nameMax, 40) },
    limits: { eventCost: Math.round(num((k.event || {}).costReal, 1500) * idx), donateMin: Math.ceil(num((k.donate || {}).minReal, 100) * idx), endorseCost: Math.round(num((k.endorse || {}).costReal, 2000) * idx), minMembersEvent: num((k.event || {}).minMembers, 3), minMembersEndorse: num((k.endorse || {}).minMembers, 4) },
  };
}

async function overview(userId) {
  const p = await service.peek(userId); if (!p || !p.state) return { ok: true, enabled: false };
  const { w: world, state } = p; const user = { id: userId, meta: p.user.meta, social_public: p.user.social_public };
  if (!M.enabled()) return { ok: true, enabled: false };
  const idx = Math.max(0.0001, world.idx(yearOf(state.day, state.startYear)));
  const conn = db;
  const out = {
    ok: true, enabled: true, alive: state.status === 'alive', parts: { clubs: M.clubsOn(), parish: M.parishOn(), foundation: M.foundationOn(), titles: M.titlesOn() },
    currency: world.currency(yearOf(state.day, state.startYear)), city: { id: state.cityId, name: (world.city(state.cityId) || {}).name || '' },
    brief: M.brief(state), strength: M.strength(),
  };
  if (state.status !== 'alive') return out;
  if (M.clubsOn()) out.clubs = await clubsView(conn, user, state, world, idx);
  if (M.parishOn()) out.parish = await Parish.view(conn, userId, world, state, idx);
  if (M.foundationOn()) out.foundation = await Found.view(conn, userId, world, state, idx);
  if (M.titlesOn()) out.titles = await titlesView(conn, user, state, world, idx);
  const pot = K.potFx(world, state.cityId);
  out.city.pot = pot; out.city.potRaw = K.potSnapshot(state.cityId);
  out.fx = (state.civic && state.civic.fx) || null;
  return out;
}

async function clubDetail(userId, clubId) {
  const p = await service.peek(userId); if (!p || !p.state) fail('Du brauchst einen lebenden Charakter.');
  const { w: world, state } = p; const idx = Math.max(0.0001, world.idx(yearOf(state.day, state.startYear)));
  const c = await db.one(`SELECT c.*, pu.social_public ppub, pp.name pname FROM clubs c LEFT JOIN users pu ON pu.id = c.president_id LEFT JOIN player_stats pp ON pp.user_id = c.president_id WHERE c.id = ? AND c.status = 'active'`, [int(clubId)]);
  if (!c) fail('Diesen Verein gibt es nicht (mehr).');
  const me = await Clubs.memberOf(db, c.id, userId);
  const members = await Clubs.membersView(db, c.id, userId);
  const out = {
    ok: true, id: c.id, name: c.name, kind: c.kind, kindName: (M.kindOf(c.kind) || {}).name, icon: (M.kindOf(c.kind) || {}).icon, city: (world.city(c.city_id) || {}).name || '', descr: c.descr || '', members, count: members.length, fee: Math.round(Number(c.fee_real) * idx),
    president: c.ppub ? c.pname : null, since: new Date(c.created_at).getTime(), events: c.events_n, me: me ? { role: me.role, roleName: M.ROLE_NAME[me.role], mistrust: !!me.mistrust, paidUntil: Number(me.paid_until) } : null,
    active: members.length >= num((M.C().clubs || {}).minActive, 3), fx: M.clubFx(c.kind, members.length),
    limits: { eventCost: Math.round(num(((M.C().clubs || {}).event || {}).costReal, 1500) * idx), endorseCost: Math.round(num(((M.C().clubs || {}).endorse || {}).costReal, 2000) * idx), donateMin: Math.ceil(num(((M.C().clubs || {}).donate || {}).minReal, 100) * idx) },
  };
  if (me) {
    out.treasury = Math.round(Number(c.treasury_real) * idx);
    out.ledger = await Clubs.ledgerView(db, c.id, userId, idx, 30);
    out.mistrustVotes = members.filter((m) => m.mistrust).length;
    out.cooldown = { event: Math.max(0, num(((M.C().clubs || {}).event || {}).cooldownHours, 12) * HOUR - (Date.now() - num(c.event_ms, 0))) };
    if (Clubs.isBoard(me)) {
      const els = await db.query("SELECT e.id, e.office_idx, e.city_id, e.vote_start FROM elections e WHERE e.status = 'open' AND e.vote_start > ? AND (e.city_id = 0 OR e.city_id = ?) ORDER BY e.office_idx DESC LIMIT 8", [Date.now(), c.city_id]);
      out.elections = [];
      for (const e of els) {
        const cands = await db.query('SELECT ec.user_id, COALESCE(ps.name, u.username) name, u.social_public FROM election_candidates ec JOIN users u ON u.id = ec.user_id LEFT JOIN player_stats ps ON ps.user_id = ec.user_id WHERE ec.election_id = ?', [e.id]);
        const mineE = await db.one('SELECT candidate_id, funded FROM club_endorsements WHERE club_id = ? AND election_id = ?', [c.id, e.id]);
        out.elections.push({ id: e.id, office: (world.econ.politics.offices[e.office_idx] || {}).name, voteStart: Number(e.vote_start), candidates: cands.filter((x) => x.user_id !== userId).map((x) => ({ userId: x.user_id, name: x.social_public ? x.name : 'Kandidat/in' })), endorsed: mineE ? { candidate: mineE.candidate_id, funded: !!mineE.funded } : null, boost: M.endorseBoost(members.length, false), boostFunded: M.endorseBoost(members.length, true) });
      }
    }
  }
  return out;
}

/** Öffentliche Angaben für das Profil: Vereine, Titel, Stiftung, Gemeinde (nur aktive Mitgliedschaften; Namen der Mitglieder bleiben privat). */
async function publicOf(userId) {
  if (!M.enabled()) return null;
  const clubs = await db.query("SELECT c.id, c.name, c.kind, m.role FROM club_members m JOIN clubs c ON c.id = m.club_id AND c.status = 'active' WHERE m.user_id = ? ORDER BY m.joined_ms LIMIT 6", [userId]);
  const tt = await K.titlesOf(db, userId);
  const fo = await db.one("SELECT name, purpose FROM foundations WHERE user_id = ? AND status = 'active'", [userId]);
  const pm = await db.one('SELECT p.faith, pm.standing, pm.st_day FROM parish_members pm JOIN parishes p ON p.id = pm.parish_id WHERE pm.user_id = ?', [userId]);
  if (!clubs.length && !tt.length && !fo && !pm) return null;
  return {
    clubs: clubs.map((c) => ({ id: c.id, name: c.name, kind: c.kind, kindName: (M.kindOf(c.kind) || {}).name || c.kind, role: M.ROLE_NAME[c.role] })),
    titles: tt.map((t) => ({ key: t.key, name: M.titleName(t.key, t.rank), scope: t.scope })),
    foundation: fo ? { name: fo.name, purpose: (M.purposeOf(fo.purpose) || {}).name || fo.purpose } : null,
    parish: pm ? { name: (M.faithOf(pm.faith) || {}).name || pm.faith, level: M.parishLevel(M.standingDecay(pm.standing, K.today() - pm.st_day)).name } : null,
  };
}

/* ================================================================================================================================================
   Anbindung: Wahlen, Gericht, Erbfall, Familie
   ================================================================================================================================================ */
/** Faktoren für das Stimmengewicht bei der Auszählung: Map(userId → Faktor ≥ 1) aus Empfehlungen von Vereinen und Titeln, gedeckelt. */
async function voteFactors(electionId, candidateIds) {
  const out = new Map(); if (!M.enabled() || !candidateIds.length) return out;
  try {
    const clubs = M.clubsOn() ? await Clubs.endorsements(electionId) : new Map();
    const titles = M.titlesOn() ? await db.query(`SELECT user_id, tkey, rnk FROM titles WHERE active = 1 AND user_id IN (${candidateIds.map(() => '?').join(',')})`, candidateIds) : [];
    const byUser = new Map();
    for (const t of titles) (byUser.get(t.user_id) || byUser.set(t.user_id, []).get(t.user_id)).push({ key: t.tkey, rank: t.rnk });
    for (const id of candidateIds) out.set(id, M.voteFactor(M.totalBoost(clubs.get(id) || [], M.titleFx(byUser.get(id) || []).vote)));
  } catch (e) { log.warn(`[gesellschaft] Stimmengewicht: ${e.message}`); }
  return out;
}
/** Nachlass für die Kandidaturgebühr (Prozent), z. B. 10 = zehn Prozent weniger. */
async function feeDiscount(conn, userId) { try { const t = M.titlesOn() ? (await K.titleFxOf(conn, userId)).fee : 0; const r = await require('./character').perkOf(conn, userId, 'feeDiscPct'); return Math.min(Number(M.C().titles && M.C().titles.maxFeeDiscPct) || 25, t + r); } catch (_) { return 0; } } // Titel und Rang (Charakterblatt) senken die Gebühr, zusammen höchstens bis zum Deckel

/** Rechtskräftiges Urteil: Veruntreuung entzieht Vorstandsämter; schwere Urteile nehmen persönliche Titel. */
async function onVerdict(c, defendantInfo) {
  if (!M.enabled()) return;
  const T = cfg().titles || {};
  try {
    if (c.act === 'embezzle') {
      const ev = c.evidence_id ? await db.one('SELECT victim_company FROM court_evidence WHERE id = ?', [c.evidence_id]) : null;
      const clubId = ev && ev.victim_company;
      if (clubId) {
        const after = [];
        await db.tx(async (conn) => {
          conn.civicAfter = after;
          const club = await conn.one("SELECT * FROM clubs WHERE id = ? AND status = 'active' FOR UPDATE", [clubId]);
          const m = club ? await Clubs.memberOf(conn, clubId, c.defendant_id, true) : null;
          if (!club || !m) return;
          if (m.role === 'president') { await conn.query("UPDATE club_members SET role = 'member' WHERE club_id = ? AND user_id = ?", [clubId, c.defendant_id]); await Clubs.succeed(conn, club, c.defendant_id, 'Vorsitz nach Urteil'); }
          else if (m.role === 'board') await conn.query("UPDATE club_members SET role = 'member' WHERE club_id = ? AND user_id = ?", [clubId, c.defendant_id]);
          await K.clubBook(conn, clubId, c.defendant_id, 'verdict', 0, 'wegen Veruntreuung verurteilt');
        });
        for (const fn of after) { try { await fn(); } catch (_) { /* optional */ } }
      }
    }
    if (c.level >= num(T.revokeFromLevel, 4)) {
      const r = await db.query("UPDATE titles SET active = 0, ref = 'court' WHERE user_id = ? AND scope = 'person' AND active = 1", [c.defendant_id]);
      if (r.affectedRows) { await setBestTitle(db, c.defendant_id); await require('./reputation').add(c.defendant_id, 'scandal', null, 'title_lost', 'court'); await letter(c.defendant_id, 'Titel aberkannt', 'Nach dem Urteil wurden dir deine persönlichen Titel aberkannt.'); }
    }
  } catch (e) { log.warn(`[gesellschaft] Urteil: ${e.message}`); }
  void defendantInfo;
}

/** Erbfall, Teil 1 (vor dem Erben-Spielstand, in derselben Transaktion): das Vermächtnis geht an die Stiftung und mindert den Nachlass. */
async function beforeHeir(conn, userId, old, world) {
  try { return M.foundationOn() ? await Found.applyWill(conn, userId, old, world) : 0; } catch (e) { log.warn(`[gesellschaft] Vermächtnis: ${e.message}`); return 0; }
}
/** Neuanfang nach der Insolvenz: persönliche Titel enden, das Gemeinde-Ansehen schrumpft; Vereine, Stiftung und Familientitel bleiben. */
async function afterRestart(conn, userId) {
  try {
    if (!M.enabled()) return;
    await conn.query("UPDATE titles SET active = 0, ref = 'neustart' WHERE user_id = ? AND scope = 'person' AND active = 1", [userId]);
    await conn.query('UPDATE parish_members SET standing = standing * 0.25, st_day = ? WHERE user_id = ?', [K.today(), userId]);
    await setBestTitle(conn, userId);
  } catch (e) { log.warn(`[gesellschaft] Neuanfang: ${e.message}`); }
}
/** Vorschau des Vermächtnisses (Cent) für die Erbenwahl – ohne zu buchen. */
async function previewWill(userId, old, world) {
  try {
    if (!M.foundationOn()) return 0;
    const fl = M.ensure(old); if (!(fl.will > 0)) return 0;
    const f = await Found.myFoundation(db, userId); if (!f) return 0;
    void world; return M.bequest(old.money, fl.will);
  } catch (_) { return 0; }
}
/** Erbfall, Teil 2: persönliche Titel enden, Familientitel, Gemeinde, Vereine und Stiftung bleiben; eine Trauerfeier für den Verstorbenen wartet auf den Erben. */
async function afterHeir(conn, userId, old, fresh, world) {
  try {
    if (!M.enabled()) return;
    await conn.query("UPDATE titles SET active = 0, ref = 'tod' WHERE user_id = ? AND scope = 'person' AND active = 1", [userId]);
    await setBestTitle(conn, userId);
    await conn.query("UPDATE foundations SET generation = generation + 1 WHERE user_id = ? AND status = 'active'", [userId]);
    await conn.query('UPDATE parish_members SET standing = standing * 0.5, st_day = ? WHERE user_id = ?', [K.today(), userId]);
    const pm = await Parish.myRow(conn, userId);
    if (pm) M.addFuneral(fresh, `${old.person.first} ${old.person.last}`);
    const f = M.ensure(fresh); f.will = 0;
    const fo = await Found.myFoundation(conn, userId);
    if (fo) { notice(fresh, { level: 'info', title: `Stiftung „${fo.name}“`, tab: 'society', text: 'Die Stiftung deiner Familie gehört jetzt dir: Du führst sie in der nächsten Generation weiter.' }); chronicle(fresh, `${fresh.person.first} führt die Stiftung „${fo.name}“ der Familie weiter.`, 'society'); }
    if (pm) notice(fresh, { level: 'info', title: 'Trauerfeier', tab: 'society', text: `${old.person.first} ${old.person.last} ist gestorben. Die Gemeinde bietet dir an, eine Trauerfeier auszurichten.` });
    await snapshot(conn, { id: userId, meta: {} }, fresh, world);
  } catch (e) { log.warn(`[gesellschaft] Erbe: ${e.message}`); }
}

/* ================================================================================================================================================
   Zeitgeber und Pflege
   ================================================================================================================================================ */
async function tick(now = Date.now()) {
  if (!M.enabled()) return;
  try { await Found.tick(now); } catch (e) { log.warn(`[gesellschaft] Stiftungen: ${e.message}`); }
  const k = cfg().clubs || {};
  try {
    // Mitglieder mit zu langem Rückstand scheiden aus (Beiträge werden beim Laden gezahlt: wer lange nicht spielt, verliert die Mitgliedschaft)
    const lapse = now - num(k.lapseDays, 7) * 24 * HOUR;
    const rows = await db.query("SELECT m.club_id, m.user_id, m.role FROM club_members m JOIN clubs c ON c.id = m.club_id AND c.status = 'active' WHERE c.fee_real > 0 AND m.paid_until < ? LIMIT 100", [lapse]);
    for (const r of rows) {
      await db.tx(async (conn) => {
        const del = await conn.query('DELETE FROM club_members WHERE club_id = ? AND user_id = ? AND paid_until < ?', [r.club_id, r.user_id, lapse]);
        if (!del || !del.affectedRows) return;
        await conn.query('INSERT INTO club_left (club_id, user_id, left_ms) VALUES (?,?,?) ON DUPLICATE KEY UPDATE left_ms = VALUES(left_ms)', [r.club_id, r.user_id, now]);
        await K.clubBook(conn, r.club_id, r.user_id, 'lapse', 0, 'wegen offener Beiträge ausgeschieden');
      });
    }
    // Vereine ohne Vorsitz (Konto gelöscht, Mitglied ausgeschieden): Nachfolge oder Auflösung
    const orphans = await db.query("SELECT c.* FROM clubs c WHERE c.status = 'active' AND NOT EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id AND m.role = 'president') LIMIT 50");
    for (const c of orphans) await db.tx(async (conn) => { const club = await conn.one("SELECT * FROM clubs WHERE id = ? AND status = 'active' FOR UPDATE", [c.id]); if (club) await Clubs.succeed(conn, club, 0, 'Vorsitz nach Ausscheiden'); });
    await prune();
  } catch (e) { log.warn(`[gesellschaft] Pflege: ${e.message}`); }
}
async function prune() {
  const k = cfg().clubs || {}; const p = cfg().parish || {}; const f = cfg().foundation || {};
  await db.query("DELETE FROM clubs WHERE status <> 'active' AND closed_at < NOW() - INTERVAL ? DAY LIMIT 200", [Math.max(1, num(k.dissolvedKeepDays, 30))]);
  await db.query('DELETE FROM club_log WHERE created_at < NOW() - INTERVAL ? DAY LIMIT 2000', [Math.max(7, num(k.ledgerDays, 120))]);
  await db.query('DELETE FROM parish_log WHERE created_at < NOW() - INTERVAL ? DAY LIMIT 2000', [Math.max(7, num(p.ledgerDays, 120))]);
  await db.query('DELETE FROM foundation_log WHERE created_at < NOW() - INTERVAL ? DAY LIMIT 2000', [Math.max(7, num(f.ledgerDays, 120))]);
  await db.query('DELETE FROM club_left WHERE left_ms < ? LIMIT 2000', [Date.now() - 30 * 24 * HOUR]);
  await db.query("DELETE e FROM club_endorsements e JOIN elections x ON x.id = e.election_id WHERE x.status = 'done'");
  await db.query('DELETE FROM city_civic WHERE bildung + gesundheit + kultur + armut < 1 AND day_no < ? LIMIT 500', [K.today() - 30]);
}
function start() {
  K.loadPots().catch(() => {});
  setInterval(() => { tick().catch((e) => log.warn(`[gesellschaft] ${e.message}`)); }, 10 * 60000).unref();
}

/* ================================================================================================================================================
   Admin
   ================================================================================================================================================ */
async function adminStats() {
  const one = async (sql) => (await db.one(sql)) || {};
  const c = await one("SELECT COUNT(*) n, COALESCE(SUM(treasury_real),0) t, COALESCE(SUM(embezzled_real),0) e FROM clubs WHERE status = 'active'");
  const m = await one('SELECT COUNT(*) n FROM club_members');
  const p = await one('SELECT COUNT(*) n, COALESCE(SUM(fund_real),0) f FROM parishes');
  const pm = await one('SELECT COUNT(*) n FROM parish_members');
  const f = await one("SELECT COUNT(*) n, COALESCE(SUM(capital_real),0) c, COALESCE(SUM(paid_real),0) p FROM foundations WHERE status = 'active'");
  const t = await one('SELECT COUNT(*) n FROM titles WHERE active = 1');
  return { clubs: Number(c.n), clubTreasury: Math.round(Number(c.t)), embezzled: Math.round(Number(c.e)), members: Number(m.n), parishes: Number(p.n), parishFund: Math.round(Number(p.f)), parishMembers: Number(pm.n), foundations: Number(f.n), capital: Math.round(Number(f.c)), paid: Math.round(Number(f.p)), titles: Number(t.n) };
}
async function adminList() {
  const world = await require('../game/world').get();
  const nm = (id) => (world.city(id) || {}).name || '?';
  const clubs = (await db.query("SELECT c.*, u.username president, (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id) members FROM clubs c LEFT JOIN users u ON u.id = c.president_id WHERE c.status = 'active' ORDER BY c.id DESC LIMIT 150")).map((r) => ({ ...r, cityName: nm(r.city_id) }));
  const parishes = (await db.query('SELECT p.*, (SELECT COUNT(*) FROM parish_members m WHERE m.parish_id = p.id) members FROM parishes p ORDER BY p.fund_real DESC LIMIT 100')).map((r) => ({ ...r, cityName: nm(r.city_id), faithName: (M.faithOf(r.faith) || {}).name || r.faith }));
  const foundations = (await db.query("SELECT f.*, u.username owner FROM foundations f JOIN users u ON u.id = f.user_id WHERE f.status = 'active' ORDER BY f.capital_real DESC LIMIT 100")).map((r) => ({ ...r, cityName: nm(r.city_id), purposeName: (M.purposeOf(r.purpose) || {}).name || r.purpose }));
  const titles = (await db.query('SELECT t.*, u.username FROM titles t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 120')).map((r) => ({ ...r, name: M.titleName(r.tkey, r.rnk), cityName: r.city_id ? nm(r.city_id) : '' }));
  return { clubs, parishes, foundations, titles };
}
async function adminDissolveClub(clubId, note) {
  let members = []; let name = '';
  await db.tx(async (conn) => {
    const club = await conn.one("SELECT * FROM clubs WHERE id = ? AND status = 'active' FOR UPDATE", [int(clubId)]); if (!club) return;
    name = club.name; members = (await Clubs.closeClub(conn, club, 'von der Spielleitung aufgelöst')) || [];
  });
  const reason = note ? String(note).slice(0, 160) : '';
  for (const id of members) await letter(id, 'Verein aufgelöst', reason ? `Der Verein „${name}“ wurde von der Spielleitung aufgelöst. Grund: ${reason}` : `Der Verein „${name}“ wurde von der Spielleitung aufgelöst.`);
  return members.length;
}
async function adminSetPresident(clubId, userId) {
  return db.tx(async (conn) => {
    const club = await conn.one("SELECT * FROM clubs WHERE id = ? AND status = 'active' FOR UPDATE", [int(clubId)]); if (!club) return 0;
    const m = await Clubs.memberOf(conn, club.id, int(userId), true); if (!m) return 0;
    await conn.query("UPDATE club_members SET role = 'member', mistrust = 0 WHERE club_id = ? AND role = 'president'", [club.id]);
    await conn.query("UPDATE club_members SET role = 'president' WHERE club_id = ? AND user_id = ?", [club.id, m.user_id]);
    await conn.query('UPDATE clubs SET president_id = ?, chair_ms = ? WHERE id = ?', [m.user_id, Date.now(), club.id]);
    await K.clubBook(conn, club.id, m.user_id, 'chair', 0, 'von der Spielleitung eingesetzt');
    return 1;
  });
}
async function adminParishFund(parishId, deltaReal) {
  const d = Math.max(-1e9, Math.min(1e9, Number(deltaReal) || 0));
  const r = await db.query('UPDATE parishes SET fund_real = GREATEST(0, fund_real + ?) WHERE id = ?', [d, int(parishId)]);
  return r.affectedRows;
}
async function adminDissolveFoundation(id, note) {
  let owner = 0; let back = 0; let name = '';
  await db.tx(async (conn) => {
    const f = await conn.one("SELECT * FROM foundations WHERE id = ? AND status = 'active' FOR UPDATE", [int(id)]); if (!f) return;
    owner = f.user_id; back = Number(f.capital_real); name = f.name;
    await conn.query('DELETE FROM foundations WHERE id = ?', [f.id]);
    if (back > 0) await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text) VALUES (?,?, 'foundation', ?)", [owner, back, `Die Stiftung „${name}“ wurde von der Spielleitung aufgelöst.`]);
    await K.addUserSum(conn, owner, 'contributed_real', -back);
  });
  const why = note ? String(note).slice(0, 160) : '';
  if (owner) await letter(owner, 'Stiftung aufgelöst', why ? `Die Stiftung „${name}“ wurde von der Spielleitung aufgelöst. Grund: ${why} Das Vermögen wird dir gutgeschrieben.` : `Die Stiftung „${name}“ wurde von der Spielleitung aufgelöst. Das Vermögen wird dir gutgeschrieben.`);
  return owner ? 1 : 0;
}

module.exports = {
  reconcile, refresh, snapshot, checkTitles, publicOf, overview, clubDetail, evaluateTitles, grantTitle, revokeTitle, voteFactors, feeDiscount, onVerdict, beforeHeir, previewWill, afterHeir, afterRestart, tick, start, prune,
  adminStats, adminList, adminDissolveClub, adminSetPresident, adminParishFund, adminDissolveFoundation, gatherFacts,
  Clubs, Parish, Found, K, restitution: Clubs.restitution,
};
void ActionError; void fail;
