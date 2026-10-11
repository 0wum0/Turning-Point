'use strict';
/**
 * Gemeinden (Glaubensgemeinschaften): Mitgliedschaft je Konto (bleibt über Generationen), Spenden in die Gemeindekasse, Gemeinde-Ansehen,
 * Notgaben aus der Kasse und kirchliche Feiern für die Familie (Trauung, Taufe bzw. Namensfeier, Trauerfeier).
 *
 * Die Gemeindekasse ist ein gemeinsamer Topf je Stadt und Bekenntnis. Spenden und Gebühren der Feiern fließen hinein (bedingte Updates in der
 * Transaktion des Spielers), Notgaben fließen heraus – nur an Mitglieder in echter Not, mit Wartezeit, Obergrenze und IP-Prüfung gegen Kreislauf-Spenden.
 */
const db = require('../db');
const log = require('./log');
const live = require('./live');
const service = require('../game/service');
const M = require('../game/civic');
const RP = require('../game/reputation');
const social = require('./social');
const K = require('./civic-core');
const core = require('../game/core');
const { ageOfChild } = require('../game/family');
const { notice, chronicle } = core;

const { fail, num, HOUR } = K;
const cfg = () => M.C().parish || {};
const refresh = (...a) => require('./civic').refresh(...a);

async function parishFor(conn, cityId, faith) {
  await conn.query('INSERT IGNORE INTO parishes (city_id, faith) VALUES (?,?)', [cityId, faith]);
  return conn.one('SELECT * FROM parishes WHERE city_id = ? AND faith = ?', [cityId, faith]);
}
async function myRow(conn, userId, lock = false) {
  return conn.one(`SELECT pm.*, p.city_id, p.faith, p.fund_real FROM parish_members pm JOIN parishes p ON p.id = pm.parish_id WHERE pm.user_id = ?${lock ? ' FOR UPDATE' : ''}`, [userId]);
}
const standingOf = (row) => M.standingDecay(row.standing, K.today() - num(row.st_day, K.today()));
const nameOf = (world, row) => `${(M.faithOf(row.faith) || {}).name || row.faith} ${(world.city(row.city_id) || {}).name || ''}`.trim();

async function join(userId, faith) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const P = cfg();
    await K.guard(userId, state, 'parish', { minDays: false });
    if (state.day < num(P.minGameDays, 10)) fail(`Einer Gemeinde schließt du dich ab ${num(P.minGameDays, 10)} Spieltagen an.`);
    const f = M.faithOf(String(faith || '')); if (!f) fail('Bitte wähle eine Gemeinde.');
    if (await myRow(conn, userId, true)) fail('Du gehörst schon einer Gemeinde an. Tritt zuerst aus.');
    const cu = await conn.one('SELECT parish_left_ms FROM civic_user WHERE user_id = ?', [userId]);
    const wait = num(P.changeCooldownHours, 48) * HOUR - (Date.now() - num(cu && cu.parish_left_ms, 0));
    if (wait > 0) fail(`Du bist gerade erst ausgetreten. Ein Beitritt ist in ${Math.ceil(wait / HOUR)} Stunden wieder möglich.`);
    const p = await parishFor(conn, state.cityId, f.key);
    await conn.query('INSERT INTO parish_members (user_id, parish_id, joined_ms, st_day) VALUES (?,?,?,?)', [userId, p.id, Date.now(), K.today()]);
    await K.parishBook(conn, p.id, userId, 'join', 0, 'beigetreten');
    chronicle(state, `${state.person.first} schließt sich der ${f.name} an.`, 'society');
    notice(state, { level: 'good', title: `Gemeinde: ${f.name}`, tab: 'society', text: 'Du gehörst jetzt zur Gemeinde. Spenden stärken dein Ansehen dort; Hochzeit, Taufe und Trauerfeier kannst du hier feiern.', info: ['Die Gemeinde bleibt deiner Familie über die Generationen erhalten.', 'Spenden fließen in die Gemeindekasse – daraus gibt es Notgaben für Mitglieder in Not.', 'Dein Gemeinde-Ansehen steigt mit Spenden und sinkt langsam, wenn du sie einstellst.'] });
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `Du bist jetzt Mitglied der ${f.name}.`, level: 'good' };
  }, { needAlive: true });
}

async function leave(userId) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx;
    const row = await myRow(conn, userId, true); if (!row) fail('Du gehörst keiner Gemeinde an.');
    await conn.query('DELETE FROM parish_members WHERE user_id = ?', [userId]);
    await conn.query('INSERT INTO civic_user (user_id, parish_left_ms, updated_ms) VALUES (?,?,?) ON DUPLICATE KEY UPDATE parish_left_ms = VALUES(parish_left_ms), updated_ms = VALUES(updated_ms)', [userId, Date.now(), Date.now()]);
    await K.parishBook(conn, row.parish_id, userId, 'leave', 0, 'ausgetreten');
    chronicle(state, `${state.person.first} tritt aus der Gemeinde aus.`, 'society');
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: 'Du bist aus der Gemeinde ausgetreten. Dein Gemeinde-Ansehen ist verfallen.', level: 'info' };
  }, { needAlive: true });
}

async function donate(userId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const D = cfg().donate || {};
    await K.guard(userId, state, 'parish', { minDays: false }); await K.notJailed(userId);
    const row = await myRow(conn, userId, true); if (!row) fail('Spenden kannst du an die Gemeinde, der du angehörst.');
    const idx = K.idxOf(world, state); const cents = K.centsFrom(input.amount); if (cents == null) fail('Bitte einen Betrag angeben.');
    const real = cents / idx;
    if (real < num(D.minReal, 100) - 1e-9) fail(`Die kleinste Spende beträgt ${K.money(Math.ceil(num(D.minReal, 100) * idx), world, state)}.`);
    if (state.money < cents) fail('Dafür reicht dein Geld nicht.');
    const day = K.today(); const used = row.day_no === day ? Number(row.day_real) : 0; const gainUsed = row.day_no === day ? Number(row.st_gain) : 0;
    if (used + real > num(D.dayCapReal, 30000) + 1e-9) fail(`Pro Tag kannst du höchstens ${K.money(Math.round(num(D.dayCapReal, 30000) * idx), world, state)} spenden.`);
    const gain = Math.max(0, Math.min(M.standingGain(real), num(D.standingDayCap, 12) - gainUsed));
    const st = standingOf(row) + gain;
    state.money -= cents; state.stats.spent += cents;
    await conn.query('UPDATE parishes SET fund_real = fund_real + ? WHERE id = ?', [real, row.parish_id]);
    await conn.query('UPDATE parish_members SET standing = ?, st_day = ?, donated_real = donated_real + ?, day_no = ?, day_real = ?, st_gain = ? WHERE user_id = ?', [st, day, real, day, used + real, gainUsed + gain, userId]);
    await K.addUserSum(conn, userId, 'donated_real', real);
    await K.parishBook(conn, row.parish_id, userId, 'donate', real, 'Spende');
    RP.queue(state, 'civic', Math.min(2.5, Math.max(0.4, 0.4 + 0.5 * Math.log10(1 + real / 1000))), 'donate', `p${row.parish_id}`);
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    const lv = M.parishLevel(st);
    return { msg: `Du hast ${K.money(cents, world, state)} an die Gemeinde gespendet. Gemeinde-Ansehen: ${lv.name}.`, level: 'good' };
  }, { needAlive: true });
}

/** Wer ist in echter Not? (rein) */
function inNeed(world, state, P) {
  const flows = core.dailyFlows(world, state);
  const days = num((P.aid || {}).needDays, 8);
  if (state.housing && state.housing.type === 'street') return 'Du schläfst auf der Straße.';
  if (state.hunger > 0) return 'Du hast Hunger.';
  if (flows.expense > 0 && state.money < flows.expense * days) return `Dein Geld reicht keine ${days} Tage.`;
  return null;
}

async function aid(userId) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const P = cfg(); const A = P.aid || {};
    await K.guard(userId, state, 'parish', { minDays: false });
    if (A.enabled === false) fail('Notgaben sind gerade nicht möglich.');
    const row = await myRow(conn, userId, true); if (!row) fail('Notgaben gibt es für Mitglieder einer Gemeinde.');
    if (Date.now() - Number(row.joined_ms) < num(A.minMemberHours, 48) * HOUR) fail(`Eine Notgabe gibt es nach ${num(A.minMemberHours, 48)} Stunden Mitgliedschaft.`);
    if (standingOf(row) < num(A.minStanding, 8)) fail(`Dafür brauchst du mehr Gemeinde-Ansehen (mindestens ${num(A.minStanding, 8)} Punkte). Gemeindeglieder, die selbst gespendet haben, bekommen Hilfe.`);
    const wait = num(A.cooldownHours, 72) * HOUR - (Date.now() - num(row.aid_ms, 0));
    if (wait > 0) fail(`Die letzte Notgabe ist noch nicht lange her. Die nächste gibt es in ${Math.ceil(wait / HOUR)} Stunden.`);
    const need = inNeed(world, state, P); if (!need) fail('Du bist nicht in Not: Dein Geld reicht für den Alltag.');
    // Kreislauf-Schutz: Spender mit derselben Internetverbindung wie der Antragsteller machen die Notgabe unmöglich
    const donors = await conn.query("SELECT DISTINCT user_id FROM parish_log WHERE parish_id = ? AND kind = 'donate' AND user_id <> ? AND created_at > NOW() - INTERVAL ? HOUR LIMIT 40", [row.parish_id, userId, num(A.ipLookbackHours, 336)]);
    for (const d of donors) if (await social.sameIp(userId, d.user_id)) fail('Die Kasse wird gerade von Konten mit deiner Internetverbindung gespeist. Eine Notgabe ist deshalb nicht möglich.');
    const pot = K.potFx(world, row.city_id);
    const real = M.aidAmount(Number(row.fund_real), pot ? pot.aid : 0);
    if (real < 100) fail('Die Gemeindekasse ist zu leer für eine Notgabe. Spenden füllen sie.');
    const r = await conn.query('UPDATE parishes SET fund_real = fund_real - ? WHERE id = ? AND fund_real >= ?', [real, row.parish_id, real]);
    if (!r || !r.affectedRows) fail('Die Gemeindekasse ist zu leer für eine Notgabe.');
    const idx = K.idxOf(world, state); const cents = Math.round(real * idx);
    state.money += cents; state.stats.earned += cents;
    await conn.query('UPDATE parish_members SET aid_ms = ? WHERE user_id = ?', [Date.now(), userId]);
    await K.parishBook(conn, row.parish_id, userId, 'aid', real, 'Notgabe');
    chronicle(state, `${state.person.first} erhält eine Notgabe der Gemeinde.`, 'society');
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `Die Gemeinde hilft dir in der Not mit ${K.money(cents, world, state)}. ${need}`, level: 'good' };
  }, { needAlive: true });
}

/** Feier in der Gemeinde: kind = wedding | baptism | funeral. Gebühr in die Kasse, Wirkung auf die Familie, Eintrag in der Familienchronik. */
async function ceremony(userId, kind, input = {}) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx; const P = cfg();
    await K.guard(userId, state, 'parish', { minDays: false }); await K.notJailed(userId);
    if (!M.CEREMONIES.includes(kind)) fail('Diese Feier gibt es nicht.');
    const row = await myRow(conn, userId, true); if (!row) fail('Feiern kannst du in der Gemeinde, der du angehörst. Tritt zuerst einer Gemeinde bei.');
    const C = M.ceremonyCfg(kind) || {}; const idx = K.idxOf(world, state);
    const cost = Math.round(num(C.feeReal, 1000) * idx);
    const label = M.ceremonyLabel(row.faith, kind);
    if (state.money < cost) fail(`Für „${label}“ brauchst du ${K.money(cost, world, state)}.`);
    let who = ''; let text = '';
    if (kind === 'wedding') {
      const p = state.partner; if (!p) fail('Dafür brauchst du einen Partner.');
      if (!p.married) fail('Ihr müsst zuerst heiraten – dann könnt ihr in der Gemeinde feiern.');
      if (p.churchWed) fail('Ihr habt schon in der Gemeinde geheiratet.');
      p.churchWed = true; p.sat = Math.max(0, Math.min(100, p.sat + num(C.partner, 12))); who = p.name;
      state.meters.wellbeing = Math.min(100, state.meters.wellbeing + num(C.well, 3));
      text = `${label}: ${state.person.first} und ${p.name} feiern in der ${nameOf(world, row)}.`;
    } else if (kind === 'baptism') {
      const c = (state.children || []).find((x) => x.id === Number(input.child));
      if (!c || c.status !== 'home') fail('Bitte ein Kind wählen, das bei dir lebt.');
      if (ageOfChild(state, c) > num(C.maxAge, 3)) fail(`Dafür ist ${c.name.split(' ')[0]} schon zu alt (bis ${num(C.maxAge, 3)} Jahre).`);
      if (c.baptized) fail('Dieses Kind ist schon getauft.');
      c.baptized = true; c.sat = Math.max(0, Math.min(100, c.sat + num(C.child, 12))); who = c.name.split(' ')[0];
      state.meters.wellbeing = Math.min(100, state.meters.wellbeing + num(C.well, 2));
      text = `${label} für ${c.name.split(' ')[0]} in der ${nameOf(world, row)}.`;
    } else {
      const f = M.ensure(state); const i = Math.max(0, f.funerals.findIndex((x) => x.id === Number(input.id)));
      const fu = f.funerals[i]; if (!fu) fail('Es gibt keine Trauerfeier zu halten.');
      f.funerals.splice(i, 1); who = fu.name;
      state.meters.wellbeing = Math.min(100, state.meters.wellbeing + num(C.well, 5));
      for (const c of state.children || []) if (c.status === 'home') c.sat = Math.min(100, c.sat + num(C.kids, 4));
      text = `${label} für ${fu.name} in der ${nameOf(world, row)}.`;
    }
    const real = cost / idx;
    state.money -= cost; state.stats.spent += cost;
    await conn.query('UPDATE parishes SET fund_real = fund_real + ? WHERE id = ?', [real, row.parish_id]);
    await K.parishBook(conn, row.parish_id, userId, 'ceremony', real, label);
    RP.queue(state, 'civic', num(C.rep, 0.6), 'parish_ceremony', `${kind}`);
    chronicle(state, text, 'family');
    notice(state, { level: 'good', title: label, tab: 'family', text: `${text} Die Familie ist bewegt.` });
    K.after(conn, () => live.publish('civic', {}));
    await refresh(conn, ctx.user, state, world);
    return { msg: `${label}${who ? ` – ${who}` : ''}: gefeiert. Die Gebühr (${K.money(cost, world, state)}) kommt der Gemeinde zugute.`, level: 'good' };
  }, { needAlive: true });
}

/** Ansicht der Gemeinden der eigenen Stadt und der eigenen Mitgliedschaft. */
async function view(conn, userId, world, state, idx) {
  const P = cfg(); const cityId = state.cityId;
  const rows = await conn.query('SELECT p.*, (SELECT COUNT(*) FROM parish_members m WHERE m.parish_id = p.id) members FROM parishes p WHERE p.city_id = ?', [cityId]);
  const byFaith = new Map(rows.map((r) => [r.faith, r]));
  const mine = await myRow(conn, userId);
  const ledger = mine ? (await conn.query(`SELECT l.kind, l.amount_real, l.created_at, l.user_id, ps.name, u.username, u.social_public FROM parish_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN player_stats ps ON ps.user_id = l.user_id WHERE l.parish_id = ? AND l.kind <> 'join' AND l.kind <> 'leave' ORDER BY l.id DESC LIMIT 12`, [mine.parish_id]))
    .map((r) => ({ kind: r.kind, amount: Math.round(Number(r.amount_real) * idx), who: r.user_id ? (r.user_id === userId ? 'Du' : (r.social_public ? (r.name || r.username) : 'Ein Mitglied')) : null, at: new Date(r.created_at).getTime() })) : [];
  const st = mine ? standingOf(mine) : 0; const lv = M.parishLevel(st);
  const A = P.aid || {}; const pot = K.potFx(world, cityId);
  const need = inNeed(world, state, P);
  let aidWhy = null;
  if (mine) {
    const wait = num(A.cooldownHours, 72) * HOUR - (Date.now() - num(mine.aid_ms, 0));
    if (A.enabled === false) aidWhy = 'Notgaben sind gerade nicht möglich.';
    else if (Date.now() - Number(mine.joined_ms) < num(A.minMemberHours, 48) * HOUR) aidWhy = `Erst nach ${num(A.minMemberHours, 48)} Stunden Mitgliedschaft.`;
    else if (st < num(A.minStanding, 8)) aidWhy = `Dafür brauchst du mindestens ${num(A.minStanding, 8)} Punkte Gemeinde-Ansehen.`;
    else if (wait > 0) aidWhy = `Wieder möglich in ${Math.ceil(wait / HOUR)} Stunden.`;
    else if (!need) aidWhy = 'Du bist nicht in Not.';
  }
  const f = M.ensure(state);
  const fees = Object.fromEntries(M.CEREMONIES.map((k) => [k, Math.round(num((M.ceremonyCfg(k) || {}).feeReal, 1000) * idx)]));
  const kids = (state.children || []).filter((c) => c.status === 'home' && !c.baptized && ageOfChild(state, c) <= num((M.ceremonyCfg('baptism') || {}).maxAge, 3)).map((c) => ({ id: c.id, name: c.name.split(' ')[0], age: ageOfChild(state, c) }));
  const faithsView = M.faiths().map((fa) => { const r = byFaith.get(fa.key); return { key: fa.key, name: fa.name, members: r ? Number(r.members) : 0, fund: r ? Math.round(Number(r.fund_real) * idx) : 0, mine: !!(mine && mine.faith === fa.key), ceremony: fa.ceremony || {} }; });
  const cu = await conn.one('SELECT parish_left_ms FROM civic_user WHERE user_id = ?', [userId]);
  const joinWait = num(P.changeCooldownHours, 48) * HOUR - (Date.now() - num(cu && cu.parish_left_ms, 0));
  return {
    faiths: faithsView,
    joinWhy: state.day < num(P.minGameDays, 10) ? `Ab ${num(P.minGameDays, 10)} Spieltagen.` : joinWait > 0 ? `Wieder möglich in ${Math.ceil(joinWait / HOUR)} Stunden.` : null,
    mine: mine ? { faith: mine.faith, name: nameOf(world, mine), cityId: mine.city_id, fund: Math.round(Number(mine.fund_real) * idx), standing: Math.round(st * 10) / 10, level: lv, donated: Math.round(Number(mine.donated_real) * idx), joinedAt: Number(mine.joined_ms),
      aid: { ok: !aidWhy, why: aidWhy, amount: Math.round(M.aidAmount(Number(mine.fund_real), pot ? pot.aid : 0) * idx), need }, ledger } : null,
    ceremonies: {
      fees, labels: mine ? Object.fromEntries(M.CEREMONIES.map((k) => [k, M.ceremonyLabel(mine.faith, k)])) : null,
      wedding: { ok: !!(state.partner && state.partner.married && !state.partner.churchWed), partner: state.partner ? state.partner.name : null, done: !!(state.partner && state.partner.churchWed), why: !state.partner ? 'Du hast keinen Partner.' : !state.partner.married ? 'Ihr seid noch nicht verheiratet.' : state.partner.churchWed ? 'Schon gefeiert.' : null },
      baptism: { children: kids },
      funeral: { list: f.funerals.map((x) => ({ id: x.id, name: x.name, day: x.day })) },
    },
    donate: { min: Math.ceil(num((P.donate || {}).minReal, 100) * idx), dayCap: Math.round(num((P.donate || {}).dayCapReal, 30000) * idx) },
  };
}

module.exports = { join, leave, donate, aid, ceremony, view, myRow, standingOf, inNeed, parishFor };
void db; void log;
