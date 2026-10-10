'use strict';
/**
 * Wettbewerb: Spieler, die teilnehmen, können Betriebe anderer Teilnehmer in derselben Stadt ausspionieren, im Preis unterbieten,
 * Mitarbeiter abwerben oder sabotieren. Schutzregeln: Teilnahme freiwillig (oder vom Admin für alle geschaltet), Neulingsschutz,
 * Tages-/Wochenlimits je Betrieb, Schonfrist nach Sabotage, Risiko der Entdeckung samt Geldstrafe und Sperre bei Wiederholung,
 * Sicherheitsdienst und Gebäudeversicherung als Gegenmittel. Alles steht im Protokoll (rivalry_log).
 */
const db = require('../db');
const settings = require('../settings');
const service = require('../game/service');
const social = require('./social');
const anticheat = require('./anticheat');
const biz = require('../game/business');
const { yearOf } = require('../game/calendar');
const { notice, chronicle } = require('../game/core');
const { ActionError } = require('../game/actions');

const cfg = () => settings.get('rivalry');
const fail = (m) => { throw new ActionError(m); };
const idxOf = (world, s) => Math.max(0.0001, world.idx(yearOf(s.day, s.startYear)));
const part = (u) => cfg().mode === 'all' || !!u.rivalry;
const DETECT = { spy: 0.5, price: 0.15, poach: 0.4, sabotage: 1 };

async function status(userId) {
  const R = cfg(); const u = await db.one('SELECT rivalry, rivalry_since, rivalry_ban FROM users WHERE id = ?', [userId]);
  const lockUntil = u && u.rivalry && u.rivalry_since ? new Date(u.rivalry_since).getTime() + R.optOutLockDays * 86400000 : 0;
  const strikes = (await db.one("SELECT COUNT(*) n FROM rivalry_log WHERE attacker = ? AND caught = 1 AND created_at > NOW() - INTERVAL ? DAY", [userId, R.strikeWindowDays])).n;
  return {
    mode: R.mode, participating: !!u && part(u), optedIn: !!(u && u.rivalry), lockUntil: lockUntil > Date.now() ? lockUntil : 0,
    banUntil: u && u.rivalry_ban && new Date(u.rivalry_ban).getTime() > Date.now() ? new Date(u.rivalry_ban).getTime() : 0, strikes, strikeLimit: R.strikeLimit,
    actions: Object.entries(R.actions).map(([key, a]) => ({ key, label: a.label, cost: a.cost, hitPct: a.hitPct || null, days: a.days || a.outageDays || null })),
    caughtBase: R.caughtBase, finePct: R.finePct,
  };
}

async function setOptIn(userId, on) {
  const R = cfg(); if (R.mode !== 'optin') fail(R.mode === 'all' ? 'Der Wettbewerb ist für alle Spieler aktiv.' : 'Der Wettbewerb ist gerade abgeschaltet.');
  const u = await db.one('SELECT rivalry, rivalry_since FROM users WHERE id = ?', [userId]);
  if (on) { await db.query('UPDATE users SET rivalry = 1, rivalry_since = NOW() WHERE id = ?', [userId]); return; }
  if (u.rivalry && u.rivalry_since && Date.now() - new Date(u.rivalry_since).getTime() < R.optOutLockDays * 86400000) fail(`Du kannst frühestens ${R.optOutLockDays} Tage nach der Anmeldung wieder aussteigen.`);
  await db.query('UPDATE users SET rivalry = 0 WHERE id = ?', [userId]);
}

async function perform(attackerId, targetId, companyId, action) {
  const R = cfg(); const A = R.actions[action];
  if (R.mode === 'off') fail('Der Wettbewerb ist gerade abgeschaltet.');
  if (!A) fail('Unbekannte Aktion.');
  if (attackerId === targetId) fail('Das ist dein eigener Betrieb.');
  await require('./court').assertFree(attackerId, 'econ'); // Haft sperrt wirtschaftliche Handlungen
  const att = await db.one('SELECT id, rivalry, rivalry_ban, created_at, banned, mute_until FROM users WHERE id = ?', [attackerId]);
  const tgt = await db.one('SELECT id, rivalry, created_at, banned FROM users WHERE id = ?', [targetId]);
  if (!att || !tgt || tgt.banned) fail('Dieser Spieler ist nicht erreichbar.');
  if (!part(att)) fail('Du nimmst nicht am Wettbewerb teil (Spieler → Mein Profil).');
  if (!part(tgt)) fail('Dieser Spieler nimmt nicht am Wettbewerb teil.');
  if (att.rivalry_ban && new Date(att.rivalry_ban).getTime() > Date.now()) fail('Du bist wegen Verstößen vorübergehend vom Wettbewerb ausgeschlossen.');
  if ((Date.now() - new Date(att.created_at).getTime()) / 3600000 < R.minAccountHours || (Date.now() - new Date(tgt.created_at).getTime()) / 3600000 < R.minAccountHours) fail('Neue Konten sind im Wettbewerb geschützt.');
  const rel = await social.relation(attackerId, targetId); if (rel === 'blocked' || rel === 'blocked_by') fail('Dieser Spieler ist nicht erreichbar.');
  if (await social.sameIp(attackerId, targetId)) { anticheat.flag(attackerId, 'gift_ring', `Wettbewerbsaktion gegen Konto gleicher IP (Nutzer ${targetId})`); fail('Zwischen Konten mit derselben Internetverbindung ist das nicht erlaubt.'); }
  const today = (await db.one("SELECT COUNT(*) n FROM rivalry_log WHERE attacker = ? AND created_at > NOW() - INTERVAL 1 DAY", [attackerId])).n; if (today >= R.dailyCap) fail(`Heute hast du schon ${R.dailyCap} Aktionen ausgeführt.`);
  const firmDay = (await db.one("SELECT COUNT(*) n FROM rivalry_log WHERE attacker = ? AND target = ? AND company_id = ? AND created_at > NOW() - INTERVAL 1 DAY", [attackerId, targetId, companyId])).n; if (firmDay >= R.perFirmDailyCap) fail('Gegen diesen Betrieb hast du heute schon etwas unternommen.');
  if (action !== 'spy') {
    const week = (await db.one("SELECT COUNT(*) n FROM rivalry_log WHERE target = ? AND company_id = ? AND action <> 'spy' AND created_at > NOW() - INTERVAL 7 DAY", [targetId, companyId])).n; if (week >= R.perFirmWeeklyCap) fail('Dieser Betrieb war diese Woche schon oft Ziel – er ist vorerst geschützt.');
    const sab = await db.one("SELECT 1 x FROM rivalry_log WHERE target = ? AND company_id = ? AND action = 'sabotage' AND created_at > NOW() - INTERVAL ? HOUR", [targetId, companyId, R.afterSabotageShieldHours]); if (sab) fail('Dieser Betrieb steht nach einem Anschlag kurzzeitig unter Schutz.');
  }
  const world = await require('../game/world').get();
  return db.tx(async (conn) => {
    const { rowA, rowB, sA, sB } = await social.lockPair(conn, attackerId, targetId);
    const c = (sB.companies || []).find((x) => x.id === companyId); if (!c || c.abandoned) fail('Diesen Betrieb gibt es nicht mehr.');
    if (sA.cityId !== c.cityId) fail('Dafür musst du in der Stadt des Betriebs wohnen.');
    if (sA.day < R.attackerMinGameDays) fail(`Dein Charakter muss mindestens ${R.attackerMinGameDays} Spieltage alt sein.`);
    if (sB.day < R.targetMinGameDays) fail('Der Betrieb gehört einem Neuling und ist geschützt.');
    const idxA = idxOf(world, sA); const idxB = idxOf(world, sB);
    const cost = Math.round(A.cost * idxA); if (sA.money < cost) fail('Dafür reicht dein Geld nicht.');
    const year = yearOf(sB.day, sB.startYear);
    const secure = !!c.security; const nameA = `${sA.person.first} ${sA.person.last}`;
    let success = true; let spyInfo = null; let effectTxt = ''; let damageReal = 0;
    if (action === 'poach' && (c.staff || 0) <= 0) fail('In diesem Betrieb gibt es keine Mitarbeiter zum Abwerben.');
    if (action !== 'spy' && secure && Math.random() < R.successSecurity) success = false;
    sA.money -= cost; sA.stats.spent = (sA.stats.spent || 0) + cost;
    if (action === 'spy') {
      const f = biz.companyFlows(world, sB, c, year);
      spyInfo = { name: c.name, value: Math.round(biz.companyValue(world, sB, c, year) / idxB), profit: Math.round(f.profit / idxB), income: Math.round(f.income / idxB), cash: Math.round((c.cash || 0) / idxB), staff: c.staff || 0, security: secure, rooms: c.rooms };
    } else if (success) {
      if (action === 'price') { damageReal = Math.round(A.cost * 0.8); c.hit = { until: sB.day + A.days, factor: 1 - A.hitPct / 100 }; effectTxt = `Umsatz −${A.hitPct} % für ${A.days} Tage`; }
      else if (action === 'poach') { damageReal = Math.round(A.cost); c.staff = Math.max(0, c.staff - 1); effectTxt = 'ein Mitarbeiter wechselt zu dir'; }
      else if (action === 'sabotage') {
        c.outageUntil = sB.day + A.outageDays; const repair = Math.round(biz.companyValue(world, sB, c, year) * A.repairPct / 100);
        damageReal = Math.round(repair / idxB * (sB.insurance && sB.insurance.gebaeude ? 0.2 : 1));
        if (!sB.insurance || !sB.insurance.gebaeude) { const fromCash = Math.min(c.cash || 0, repair); c.cash = (c.cash || 0) - fromCash; sB.money -= Math.min(Math.max(0, sB.money), repair - fromCash); } // nie unter null: ein Anschlag soll kosten, aber nicht die Insolvenz des Opfers auslösen
        effectTxt = `Produktionsausfall ${A.outageDays} Tage`;
      }
    }
    // Entdeckung
    const pCaught = Math.min(0.95, Math.max(0.02, (R.caughtBase + (secure ? R.caughtSecurityBonus : 0) + require('./court-policy').effects(c.cityId).detect) * (DETECT[action] || 1))); // Polizeibudget der Stadt wirkt auf die Entdeckung
    const caught = !success ? true : Math.random() < pCaught;
    const fine = caught ? Math.min(Math.max(0, sA.money), Math.round(cost * R.finePct / 100)) : 0;
    sA.money -= fine; sA.stats.spent = (sA.stats.spent || 0) + fine;
    const label = A.label;
    if (action === 'spy') {
      notice(sA, { level: 'info', title: `Spionage: ${c.name}`, text: `Wert ${Math.round(spyInfo.value / 100)} · Gewinn/Tag ${Math.round(spyInfo.profit / 100)} · Kasse ${Math.round(spyInfo.cash / 100)} · ${spyInfo.staff} Mitarbeiter${spyInfo.security ? ' · Sicherheitsdienst' : ''} (Beträge in Wert von 1945).`, tab: 'social' });
    } else if (success) {
      notice(sA, { level: 'good', title: `${label} gegen ${c.name}`, text: `Erfolgreich: ${effectTxt}.${caught ? '' : ' Niemand weiß, dass du es warst.'}`, tab: 'social' });
    } else notice(sA, { level: 'bad', title: `${label} fehlgeschlagen`, text: `Der Sicherheitsdienst von ${c.name} hat dich abgewehrt.`, tab: 'social' });
    if (caught) notice(sA, { level: 'bad', title: 'Erwischt!', text: `Du wurdest bei „${label}“ gegen ${c.name} überführt und zahlst ${Math.round(fine / 100)} Strafe.`, tab: 'social', interrupt: true });
    const tText = {
      price: `Ein Konkurrent unterbietet die Preise von ${c.name}: Umsatz −${A.hitPct || 0} % für ${A.days || 0} Tage.`, poach: `Bei ${c.name} wurde ein Mitarbeiter abgeworben.`,
      sabotage: `Bei ${c.name} gab es einen Anschlag: Maschinen beschädigt, ${A.outageDays} Tage Produktionsausfall${sB.insurance && sB.insurance.gebaeude ? ' (Reparatur von der Versicherung gezahlt)' : ''}.`, spy: `Bei ${c.name} wurde herumgeschnüffelt.`,
    }[action];
    if (action !== 'spy' || caught) notice(sB, { level: caught ? 'warn' : 'bad', title: `${label}: ${c.name}`, text: `${tText}${caught ? ` Täter: ${nameA}.` : ' Der Täter ist unbekannt.'}${!success ? ' Der Angriff wurde abgewehrt.' : ''}`, tab: 'business', interrupt: true });
    if (caught) chronicle(sA, `${sA.person.first} wird bei einem Anschlag auf ${c.name} erwischt.`, 'business');
    // Ansehen: Erwischte Täter verlieren Ruf (Sabotage am meisten); die Buchung folgt beim nächsten Laden des Täters, genau einmal
    if (caught) { const RP = require('../game/reputation'); RP.queue(sA, 'scandal', null, action === 'sabotage' ? 'sabotage_caught' : action === 'spy' ? 'spy_caught' : 'fine', `u${targetId}`); if (fine > 0 && action !== 'sabotage') RP.queue(sA, 'scandal', null, 'fine', `r${companyId}`); }
    await service.saveCharacter(conn, rowA, sA); await service.saveCharacter(conn, rowB, sB);
    const uA = await service.loadUser(conn, attackerId); const uB = await service.loadUser(conn, targetId);
    await social.upsertStats(conn, uA, rowA, sA, world); await social.upsertStats(conn, uB, rowB, sB, world);
    await conn.query('INSERT INTO rivalry_log (attacker, target, company_id, company, action, caught, cost_real) VALUES (?,?,?,?,?,?,?)', [attackerId, targetId, companyId, c.name, action, caught ? 1 : 0, Math.round(A.cost)]);
    // Gericht: Jede Handlung hinterlässt Spuren (vor dem Täter verborgen); wer erwischt wurde, ist dem Opfer bekannt
    await require('./court').trace(conn, { act: action, offenderId: attackerId, victimId: targetId, victimCompany: companyId, subject: c.name, cityId: c.cityId, damageReal, security: secure, failed: !success, caught });
    if (caught && action !== 'spy') {
      await conn.query("INSERT INTO messages (from_user, to_user, kind, subject, body) VALUES (?,?, 'system', 'Wettbewerb: Täter überführt', ?)", [attackerId, targetId, `${nameA} wurde bei „${label}“ gegen ${c.name} überführt.`]);
      if (action === 'sabotage') { try { await conn.query('INSERT INTO public_news (city_id, user_id, section, title, text) VALUES (?,?,?,?,?)', [c.cityId, attackerId, 'Wirtschaft', `Anschlag auf ${c.name}`, `${nameA} wurde nach einem Anschlag auf ${c.name} überführt und muss Strafe zahlen.`]); } catch (_) { /* nur Zugabe */ } }
    }
    // Wiederholungstäter: Sperre
    let banned = false;
    if (caught && action !== 'spy') {
      const n = (await conn.one("SELECT COUNT(*) n FROM rivalry_log WHERE attacker = ? AND caught = 1 AND action <> 'spy' AND created_at > NOW() - INTERVAL ? DAY", [attackerId, R.strikeWindowDays])).n;
      if (n >= R.strikeLimit) { await conn.query('UPDATE users SET rivalry_ban = DATE_ADD(NOW(), INTERVAL ? DAY), rivalry = 0 WHERE id = ?', [R.banDays, attackerId]); banned = true; }
    }
    return { action, success, caught, fine, banned, info: spyInfo, effect: effectTxt, cost };
  });
}

async function adminLog(limit = 80) {
  return db.query('SELECT l.*, a.username att, t.username tgt FROM rivalry_log l JOIN users a ON a.id = l.attacker JOIN users t ON t.id = l.target ORDER BY l.id DESC LIMIT ?', [limit]);
}

module.exports = { status, setOptIn, perform, adminLog, part };
