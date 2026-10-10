'use strict';
/**
 * Gerichte und Beweise – Speicher und Abläufe (Modell: src/game/court.js, Politik: src/lib/court-policy.js).
 *
 *   trace(conn, {...})           eine Handlung hinterlässt Spuren (Beweis, vor dem Täter verborgen); das Opfer erhält „Spuren gesichert“
 *   evidenceAction(...)          Detektiv (zeitverzögert), Zeugenaussage, Schadensdokumentation – kosten Geld des Opfers
 *   file(...)                    Anzeige/Klage gegen ein bestimmtes Konto (Gebühr, Wochenlimit, Paar-Sperre, Schutz vor Neukonten/gleicher IP)
 *   respond(...)                 Rechtsanwalt, Geständnis, Vergleich, Berufung, Rücknahme, Bestechung
 *   advance / tick               Zustandsautomat: filed → investigation → hearing → verdict → (appeal) → final | settled | dismissed | withdrawn
 *   reconcile                    beim Laden des Spielstands: Zahlungsaufträge genau einmal begleichen, Einschränkungen in state.court spiegeln
 *   assertFree                   Sperre für wirtschaftliche Handlungen außerhalb von actions.run (Markt, Börse, Verträge, Wettbewerb)
 *
 * Geld: Gebühren zahlt der Handelnde aus dem eigenen Spielstand (Staat, kein Empfänger). Schadenersatz und Geldstrafen sind Zahlungsaufträge
 * (court_sanctions); der Verurteilte begleicht sie in reconcile() unter Sperre seiner Zeile, der Schadenersatz geht im selben Schritt als
 * pending_credits an das Opfer – jede Zahlung genau einmal, das Opfer erhält exakt, was der Verurteilte zahlt (abzüglich des Staatsanteils).
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const live = require('./live');
const social = require('./social');
const service = require('../game/service');
const M = require('../game/court');
const { yearOf } = require('../game/calendar');
const { notice } = require('../game/core');
const { formatMoney } = require('../game/economy');
const { ActionError } = require('../game/actions');

const fail = (m) => { throw new ActionError(m); };
const cfg = () => settings.get('gericht') || {};
const on = () => cfg().enabled !== false;
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const HOUR = M.HOUR;
const pol = () => require('./court-policy');
const rep = () => require('./reputation');
const idxOf = (world, s) => Math.max(0.0001, world.idx(yearOf(s.day, s.startYear)));
const worldP = () => require('../game/world').get();
const maxLimit = () => Math.max(1, ...(cfg().politics || {}).limitation || [1]);

/* ============================================================================================
   Ereignisse (Zeitleiste und Meldungen)
   ============================================================================================ */
async function event(conn, userId, caseId, type, level, title, text, evidenceId = null) {
  if (!userId) return;
  try {
    await (conn || db).query('INSERT INTO court_events (user_id, case_id, evidence_id, type, level, title, text, created_ms) VALUES (?,?,?,?,?,?,?,?)',
      [userId, caseId || null, evidenceId, String(type).slice(0, 20), level || 'info', String(title).slice(0, 120), String(text).slice(0, 500), Date.now()]);
    live.publish('court', {}, userId);
  } catch (e) { log.warn(`[gericht] Ereignis: ${e.message}`); }
}
/** Brief mit Push (nie innerhalb einer Transaktion mit Sperren aufrufen). */
function letter(userId, subject, body, from = null) { return social.sendSystemLetter(userId, subject, body, from).catch((e) => log.warn(`[gericht] Brief: ${e.message}`)); }
/** Nach dem Commit ausführen (innerhalb withCharacter), sonst sofort. */
function after(conn, fn) { if (conn && conn.repAfter) conn.repAfter.push(fn); else Promise.resolve().then(fn).catch((e) => log.warn(`[gericht] ${e.message}`)); }

/* ============================================================================================
   Beweise
   ============================================================================================ */
/**
 * Eine Handlung hinterlässt Spuren. o: { act, offenderId, victimId, victimCompany, subject, cityId, damageReal, security, failed, caught, known, strength? }.
 * Läuft in der Transaktion conn des Aufrufers (oder eigenständig). Der Täter erfährt davon nichts. Gibt die Beweis-ID zurück (0 = keine Spur).
 */
async function trace(conn, o) {
  try {
    if (!on() || !o || !M.ACTS[o.act] || !o.victimId || (o.offenderId && o.victimId === o.offenderId)) return 0;
    const c = conn || db; const C = cfg(); const E = C.evidence || {};
    const P = pol().effects(o.cityId);
    const strength = o.strength != null ? Math.round(M.clamp(o.strength, 0, 100)) : M.traceStrength(o.act, { security: !!o.security, failed: !!o.failed, police: P.police, caught: !!o.caught, seed: `${o.victimId}-${o.offenderId || 0}-${Date.now()}-${Math.random()}` }, C);
    const now = Date.now();
    const keep = num(E.keepHours, 336) * HOUR * maxLimit();
    const damage = Math.max(0, Math.min(num(E.maxDamageReal, 60000), num(o.damageReal, 0)));
    const subject = o.subject ? String(o.subject).slice(0, 80) : null;
    const r = await c.query('INSERT INTO court_evidence (act, offender_id, victim_id, victim_company, subject, city_id, strength, known, damage_real, created_ms, expires_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [o.act, o.offenderId || null, o.victimId, o.victimCompany || null, subject, o.cityId || 0, strength, o.known || o.caught ? 1 : 0, damage, now, now + keep]);
    const id = r.insertId;
    // Je Opfer höchstens 40 offene Spuren: die ältesten verfallen
    await c.query("UPDATE court_evidence SET status = 'expired' WHERE victim_id = ? AND status = 'open' AND id NOT IN (SELECT id FROM (SELECT id FROM court_evidence WHERE victim_id = ? AND status = 'open' ORDER BY id DESC LIMIT 40) x)", [o.victimId, o.victimId]);
    await event(c, o.victimId, null, 'evidence', 'warn', 'Spuren gesichert', `Nach dem Vorfall${subject ? ` bei „${subject}“` : ''} (${M.ACTS[o.act].text}) wurden Spuren gesichert. Unter „Gesellschaft → Recht & Gericht“ kannst du die Beweislage stärken und Anzeige erstatten. Spuren verblassen mit der Zeit.`, id);
    return id;
  } catch (e) { log.warn(`[gericht] Spuren: ${e.message}`); return 0; }
}

const band = (v) => (v >= 60 ? 'stark' : v >= 30 ? 'mittel' : 'schwach');

/** Detektivergebnisse, deren Zeit abgelaufen ist, genau einmal anwenden (Schutz durch bedingtes Update). */
async function settleDetectives(now = Date.now(), victimId = 0) {
  const rows = await db.query(`SELECT * FROM court_evidence WHERE det_until IS NOT NULL AND det_until <= ? AND status = 'open' ${victimId ? 'AND victim_id = ?' : ''} LIMIT 50`, victimId ? [now, victimId] : [now]);
  const C = cfg();
  for (const ev of rows) {
    try {
      const others = (await db.query("SELECT user_id FROM player_stats WHERE city_id = ? AND status = 'alive' AND user_id NOT IN (?, ?) ORDER BY RAND() LIMIT 8", [ev.city_id, ev.victim_id, ev.offender_id || 0])).map((r) => r.user_id);
      const res = M.detectiveResult({ ...ev, id: ev.id }, ev.det_n + 1, C, others);
      const base = Math.min(100, ev.strength);
      const boost = Math.max(0, Math.min(100 - base, ev.boost + res.boost));
      const upd = await db.query('UPDATE court_evidence SET det_until = NULL, det_n = det_n + 1, boost = ?, suspect_id = COALESCE(?, suspect_id), suspect_conf = IF(? IS NULL, suspect_conf, ?) WHERE id = ? AND det_until IS NOT NULL', [boost, res.suspect, res.suspect, res.conf, ev.id]);
      if (!upd || !upd.affectedRows) continue;
      const text = res.suspect ? `Der Detektiv hat ermittelt: Die Spuren deuten mit etwa ${res.conf} % Sicherheit auf eine bestimmte Person hin. Die Beweislage ist stärker geworden. Prüfe den Namen sorgfältig, bevor du Anzeige erstattest – Detektive können sich irren.` : 'Der Detektiv hat die Spuren ausgewertet: Die Beweislage ist stärker geworden, einen Namen konnte er aber nicht nennen.';
      await event(db, ev.victim_id, null, 'detective', 'good', 'Bericht des Detektivs', text, ev.id);
    } catch (e) { log.warn(`[gericht] Detektiv: ${e.message}`); }
  }
  return rows.length;
}

function payFee(ctx, real, what) {
  const cents = Math.round(real * idxOf(ctx.world, ctx.state));
  if (ctx.state.money < cents) fail(`Dafür reicht dein Geld nicht (${what}).`);
  ctx.state.money -= cents; ctx.state.stats.spent = (ctx.state.stats.spent || 0) + cents;
  return cents;
}

/** Detektiv beauftragen, Zeugen befragen oder Schaden dokumentieren (nur das Opfer, kostet Geld). */
async function evidenceAction(userId, evId, kind) {
  if (!on()) fail('Das Gerichtswesen ist gerade abgeschaltet.');
  if (!['detective', 'witness', 'docs'].includes(kind)) fail('Unbekannte Maßnahme.');
  return service.withCharacter(userId, async (ctx) => {
    const C = cfg(); const now = Date.now();
    const ev = await ctx.conn.one('SELECT * FROM court_evidence WHERE id = ? AND victim_id = ? FOR UPDATE', [int(evId), userId]);
    if (!ev || ev.status !== 'open') fail('Diese Spur gibt es nicht (mehr).');
    if (ev.case_id) fail('Zu dieser Spur läuft bereits ein Verfahren.');
    if (M.currentStrength(ev, now, C, pol().effects(ev.city_id).limitation) <= 0) fail('Die Spuren sind zu alt und nicht mehr verwertbar.');
    const L = ev.strength + ev.boost;
    if (kind === 'detective') {
      const D = C.detective || {};
      if (ev.det_until) fail('Ein Detektiv arbeitet bereits an dieser Sache.');
      if (ev.det_n >= num(D.perEvidence, 2)) fail(`Mehr als ${num(D.perEvidence, 2)} Detektive lohnen sich bei einer Spur nicht.`);
      if (ev.known && ev.det_n >= 1) fail('Der Täter ist bekannt – ein weiterer Detektiv bringt nichts.');
      const cents = payFee(ctx, num(D.cost, 5000), 'Detektiv');
      await ctx.conn.query('UPDATE court_evidence SET det_until = ? WHERE id = ?', [now + num(D.hours, 4) * HOUR, ev.id]);
      return { msg: `Ein Detektiv ist beauftragt (${num(D.hours, 4)} Stunden). Das Ergebnis erscheint hier und als Meldung.`, level: 'good', cents };
    }
    const K = kind === 'witness' ? C.witness || {} : C.docs || {};
    const have = kind === 'witness' ? ev.witness_n : ev.docs;
    if (have >= num(K.max, 1)) fail(kind === 'witness' ? 'Weitere Zeugen gibt es nicht.' : 'Der Schaden ist bereits dokumentiert.');
    if (L >= 100) fail('Die Beweislage ist bereits so stark wie möglich.');
    const cents = payFee(ctx, num(K.cost, 800), kind === 'witness' ? 'Zeugenbefragung' : 'Schadensdokumentation');
    let boost = ev.boost + num(K.boost, 6); let suspect = null; let conf = 0; let msg;
    if (kind === 'witness') {
      const others = (await ctx.conn.query("SELECT user_id FROM player_stats WHERE city_id = ? AND status = 'alive' AND user_id NOT IN (?, ?) ORDER BY RAND() LIMIT 8", [ev.city_id, ev.victim_id, ev.offender_id || 0])).map((r) => r.user_id);
      const res = M.witnessResult(ev, ev.witness_n + 1, C, others); suspect = res.suspect; conf = res.conf;
      msg = suspect ? `Ein Zeuge glaubt, jemanden erkannt zu haben (Sicherheit etwa ${conf} %). Zeugen irren sich oft – die Beweislage ist nur leicht gestiegen.` : 'Die Zeugenaussage stützt die Beweislage ein wenig, nennt aber keinen Namen.';
    } else msg = 'Der Schaden ist dokumentiert. Das stärkt die Beweislage.';
    boost = Math.max(0, Math.min(100 - Math.min(100, ev.strength), boost));
    await ctx.conn.query(`UPDATE court_evidence SET boost = ?, ${kind === 'witness' ? 'witness_n = witness_n + 1' : 'docs = docs + 1'}, suspect_id = COALESCE(?, suspect_id), suspect_conf = IF(? IS NULL, suspect_conf, ?) WHERE id = ?`, [boost, suspect, suspect, conf, ev.id]);
    return { msg, level: 'good', cents };
  }, { needAlive: true });
}

/* ============================================================================================
   Anzeige
   ============================================================================================ */
async function userInfo(id) {
  return db.one('SELECT u.id, u.banned, u.is_bot, u.created_at, ps.name, ps.city_id, ps.status, u.social_public FROM users u LEFT JOIN player_stats ps ON ps.user_id = u.id WHERE u.id = ?', [id]);
}

/** Schutz vor Missbrauch zwischen zwei Konten: gesperrt, neue Konten, gleiche Internetverbindung, Blockierung. */
async function pairGuard(a, b) {
  const C = cfg();
  const ua = await userInfo(a); const ub = await userInfo(b);
  if (!ub || ub.banned || !ua) fail('Gegen dieses Konto ist keine Anzeige möglich.');
  const minH = num(C.minAccountHours, 24);
  const age = (u) => (Date.now() - new Date(u.created_at).getTime()) / HOUR;
  if (age(ua) < minH || age(ub) < minH) fail('Neue Konten sind vor Gericht geschützt (Mindestalter des Kontos).');
  const rel = await social.relation(a, b); if (rel === 'blocked' || rel === 'blocked_by') fail('Gegen dieses Konto ist keine Anzeige möglich.');
  if (C.blockSameIp !== false && await social.sameIp(a, b)) {
    try { await require('./anticheat').flag(a, 'gift_ring', `Anzeige gegen Konto gleicher IP (Nutzer ${b})`); } catch (_) { /* optional */ }
    fail('Zwischen Konten mit derselben Internetverbindung gibt es keine Verfahren.');
  }
  return { ua, ub };
}

async function file(userId, { evidenceId, defendantId }) {
  if (!on()) fail('Das Gerichtswesen ist gerade abgeschaltet.');
  defendantId = int(defendantId); evidenceId = int(evidenceId);
  if (!defendantId || defendantId === userId) fail('Bitte nenne das Konto, gegen das du Anzeige erstatten willst.');
  const { ub } = await pairGuard(userId, defendantId);
  if (!ub.name) fail('Dieses Konto spielt gerade nicht.');
  let created = null;
  const out = await service.withCharacter(userId, async (ctx) => {
    const C = cfg(); const K = C.complaint || {}; const now = Date.now();
    if (ctx.state.day < num(C.minGameDays, 20)) fail(`Dein Charakter muss mindestens ${num(C.minGameDays, 20)} Spieltage alt sein.`);
    const ev = await ctx.conn.one('SELECT * FROM court_evidence WHERE id = ? AND victim_id = ? FOR UPDATE', [evidenceId, userId]);
    if (!ev || ev.status !== 'open') fail('Diese Spur gibt es nicht (mehr).');
    if (ev.case_id) fail('Zu dieser Spur läuft bereits ein Verfahren.');
    const E = pol().effects(ev.city_id);
    const strength = M.currentStrength(ev, now, C, E.limitation);
    if (strength <= 0) fail('Die Spuren sind zu alt und nicht mehr verwertbar.');
    if (strength < num(K.minStrength, 15)) fail(`Die Beweislage ist noch zu schwach für eine Anzeige (mindestens ${num(K.minStrength, 15)} nötig). Beauftrage einen Detektiv, befrage Zeugen oder dokumentiere den Schaden.`);
    const week = await ctx.conn.one('SELECT COUNT(*) n FROM court_cases WHERE plaintiff_id = ? AND created_ms > ?', [userId, now - 7 * 24 * HOUR]);
    if (Number(week.n) >= num(K.perWeek, 3)) fail(`Du hast diese Woche schon ${num(K.perWeek, 3)} Anzeigen erstattet.`);
    const open = await ctx.conn.one("SELECT COUNT(*) n FROM court_cases WHERE plaintiff_id = ? AND state IN ('filed','investigation','hearing','verdict','appeal')", [userId]);
    if (Number(open.n) >= num(K.openMax, 3)) fail(`Du hast schon ${num(K.openMax, 3)} laufende Verfahren.`);
    const pair = await ctx.conn.one('SELECT 1 x FROM court_cases WHERE plaintiff_id = ? AND defendant_id = ? AND created_ms > ? LIMIT 1', [userId, defendantId, now - num(K.perPairDays, 14) * 24 * HOUR]);
    if (pair) fail(`Gegen dieses Konto hast du in den letzten ${num(K.perPairDays, 14)} Tagen schon Anzeige erstattet.`);
    const cents = payFee(ctx, num(K.fee, 1200), 'Anzeigegebühr');
    const claim = Math.max(0, num(ev.damage_real, 0));
    const r = await ctx.conn.query("INSERT INTO court_cases (act, plaintiff_id, defendant_id, evidence_id, city_id, state, step_ms, claim_real, strength, created_ms, updated_ms) VALUES (?,?,?,?,?, 'filed', ?, ?, ?, ?, ?)",
      [ev.act, userId, defendantId, ev.id, ev.city_id, now + num((C.court || {}).intakeMinutes, 2) * 60000, claim, strength, now, now]);
    await ctx.conn.query("UPDATE court_evidence SET status = 'used', case_id = ? WHERE id = ?", [r.insertId, ev.id]);
    const label = M.ACTS[ev.act].label;
    await event(ctx.conn, userId, r.insertId, 'filed', 'info', 'Anzeige erstattet', `Du hast Anzeige gegen ${ub.name} erstattet (${label}). Die Gerichtskanzlei prüft den Eingang, danach beginnt die Ermittlung.`);
    await event(ctx.conn, defendantId, r.insertId, 'filed', 'bad', 'Du wurdest angezeigt', `${ctx.state.person.first} ${ctx.state.person.last} hat Anzeige gegen dich erstattet (${label}). Du kannst einen Rechtsanwalt nehmen, einen Vergleich anbieten oder gestehen. Unter „Gesellschaft → Recht & Gericht“ siehst du alles.`);
    created = { id: r.insertId, defendantId, plaintiff: `${ctx.state.person.first} ${ctx.state.person.last}`, label };
    after(ctx.conn, () => letter(defendantId, 'Gericht: Du wurdest angezeigt', `Gegen dich läuft eine Anzeige (${label}). Du kannst einen Rechtsanwalt nehmen, einen Vergleich anbieten oder gestehen – unter „Gesellschaft → Recht & Gericht“.`));
    return { msg: `Anzeige gegen ${ub.name} erstattet. Das Verfahren läuft.`, level: 'good', cents, id: r.insertId };
  }, { needAlive: true });
  return { ...out, case: created };
}

/* ============================================================================================
   Verfahren: Antworten der Beteiligten
   ============================================================================================ */
const ACTIVE_STATES = ['filed', 'investigation', 'hearing'];

async function lockCase(conn, id, userId) {
  const c = await conn.one('SELECT * FROM court_cases WHERE id = ? FOR UPDATE', [int(id)]);
  if (!c || (c.plaintiff_id !== userId && c.defendant_id !== userId)) fail('Dieses Verfahren gibt es nicht.');
  return c;
}
const roleOf = (c, userId) => (c.plaintiff_id === userId ? 'p' : 'd');
const otherOf = (c, userId) => (c.plaintiff_id === userId ? c.defendant_id : c.plaintiff_id);

async function respond(userId, caseId, action, input = {}) {
  if (!on()) fail('Das Gerichtswesen ist gerade abgeschaltet.');
  await advanceCase(int(caseId)); // Zeitplan nachziehen, bevor jemand handelt
  return service.withCharacter(userId, async (ctx) => {
    const C = cfg(); const K = C.court || {}; const now = Date.now();
    const c = await lockCase(ctx.conn, caseId, userId); const role = roleOf(c, userId); const other = otherOf(c, userId);
    const me = `${ctx.state.person.first} ${ctx.state.person.last}`;
    const running = ACTIVE_STATES.includes(c.state) || c.state === 'appeal';
    const touch = (set, params) => ctx.conn.query(`UPDATE court_cases SET ${set}, updated_ms = ? WHERE id = ?`, [...params, now, c.id]);
    switch (action) {
      case 'lawyer': {
        if (!running) fail('Dafür ist es zu spät.');
        const col = role === 'p' ? 'lawyer_p' : 'lawyer_d'; if (c[col]) fail('Du hast bereits einen Rechtsanwalt.');
        const cents = payFee(ctx, num((K.lawyer || {}).cost, 4000) * (c.state === 'appeal' ? num((K.lawyer || {}).appealCostMult, 2) : 1), 'Rechtsanwalt');
        await touch(`${col} = 1`, []);
        await event(ctx.conn, userId, c.id, 'lawyer', 'info', 'Rechtsanwalt beauftragt', 'Du hast einen Rechtsanwalt beauftragt. Er stärkt deine Seite vor Gericht.');
        await event(ctx.conn, other, c.id, 'lawyer', 'info', 'Die Gegenseite hat einen Rechtsanwalt', `${me} lässt sich von einem Rechtsanwalt vertreten.`);
        return { msg: 'Rechtsanwalt beauftragt.', level: 'good', cents };
      }
      case 'detective': {
        if (role !== 'p') fail('Nur die Anklage kann einen Detektiv beauftragen.');
        if (!['filed', 'investigation'].includes(c.state)) fail('Dafür ist es zu spät.');
        const D = C.detective || {}; if (c.det_p >= num(D.perEvidence, 2)) fail('Mehr Detektive bringen nichts.');
        const cents = payFee(ctx, num(D.cost, 5000), 'Detektiv');
        const det = c.det_p + 1;
        const nextStep = c.state === 'investigation' ? Math.max(now + 60000, Number(c.created_ms) + num(K.intakeMinutes, 2) * 60000 + M.investigationMs(det, C)) : Number(c.step_ms);
        await touch('det_p = ?, step_ms = ?', [det, nextStep]);
        await event(ctx.conn, userId, c.id, 'detective', 'good', 'Detektiv beauftragt', `Ein Detektiv unterstützt die Ermittlung. Das Verfahren wird kürzer und die Beweislage stärker.`);
        return { msg: 'Detektiv beauftragt: Die Ermittlung wird kürzer.', level: 'good', cents };
      }
      case 'confess': {
        if (role !== 'd') fail('Nur der Angeklagte kann gestehen.');
        if (!ACTIVE_STATES.includes(c.state)) fail('Dafür ist es zu spät.');
        await verdictNow(ctx.conn, { ...c, confessed: 1 }, 1, now, true);
        await event(ctx.conn, userId, c.id, 'confess', 'warn', 'Geständnis', 'Du hast gestanden. Das mildert die Strafe, das Urteil steht fest.');
        await event(ctx.conn, other, c.id, 'confess', 'good', 'Der Angeklagte hat gestanden', `${me} hat gestanden. Das Urteil steht fest.`);
        return { msg: 'Geständnis abgegeben. Die Strafe fällt milder aus.', level: 'warn' };
      }
      case 'offer': {
        if (!ACTIVE_STATES.includes(c.state)) fail('Ein Vergleich ist nur vor dem Urteil möglich.');
        const cents = Math.round(num(input.amount, -1)); if (!(cents >= 0)) fail('Bitte einen Betrag nennen.');
        const real = Math.round(cents / idxOf(ctx.world, ctx.state));
        const cap = M.settleCap(c.claim_real, C); if (real > cap) fail(`Ein Vergleich darf höchstens ${Math.round(cap * idxOf(ctx.world, ctx.state) / 100)} (in deiner Währung) betragen.`);
        await touch('offer_real = ?, offer_by = ?, offer_ms = ?', [real, userId, now]);
        await event(ctx.conn, userId, c.id, 'offer', 'info', 'Vergleich angeboten', 'Dein Vergleichsvorschlag wurde der Gegenseite übermittelt.');
        await event(ctx.conn, other, c.id, 'offer', 'warn', 'Vergleichsvorschlag', `${me} schlägt einen Vergleich vor: Der Angeklagte zahlt einmalig. Du kannst annehmen, ablehnen oder selbst einen Betrag vorschlagen. Mit einem Vergleich sparen beide die Gerichtskosten.`);
        after(ctx.conn, () => letter(other, 'Gericht: Vergleichsvorschlag', 'Im Verfahren gibt es einen Vergleichsvorschlag. Du findest ihn unter „Gesellschaft → Recht & Gericht“.'));
        return { msg: 'Vergleichsvorschlag gesendet.', level: 'good', real };
      }
      case 'accept': case 'decline': {
        if (!ACTIVE_STATES.includes(c.state)) fail('Dafür ist es zu spät.');
        if (c.offer_real == null || !c.offer_by) fail('Es liegt kein Vergleichsvorschlag vor.');
        if (c.offer_by === userId) fail('Auf deinen eigenen Vorschlag antwortet die Gegenseite.');
        if (action === 'decline') {
          await touch('offer_real = NULL, offer_by = NULL, offer_ms = NULL', []);
          await event(ctx.conn, other, c.id, 'offer', 'info', 'Vergleich abgelehnt', `${me} lehnt den Vergleichsvorschlag ab. Das Verfahren läuft weiter.`);
          return { msg: 'Vergleich abgelehnt.', level: 'warn' };
        }
        if (now - Number(c.offer_ms) > num(K.settleExpireHours, 48) * HOUR) fail('Der Vergleichsvorschlag ist abgelaufen.');
        const upd = await ctx.conn.query("UPDATE court_cases SET state = 'settled', ended_ms = ?, updated_ms = ?, summary = ? WHERE id = ? AND state IN ('filed','investigation','hearing')", [now, now, 'Vergleich', c.id]);
        if (!upd || !upd.affectedRows) fail('Das Verfahren ist inzwischen anders ausgegangen.');
        await settle(ctx.conn, c, now);
        await event(ctx.conn, userId, c.id, 'settled', 'good', 'Vergleich geschlossen', 'Der Vergleich ist geschlossen. Das Verfahren ist beendet, beide sparen die Gerichtskosten.');
        await event(ctx.conn, other, c.id, 'settled', 'good', 'Vergleich geschlossen', `${me} hat den Vergleich angenommen. Das Verfahren ist beendet.`);
        return { msg: 'Vergleich geschlossen.', level: 'good' };
      }
      case 'withdraw': {
        if (role !== 'p') fail('Nur die Anklage kann die Anzeige zurückziehen.');
        if (!['filed', 'investigation'].includes(c.state)) fail('Dafür ist es zu spät.');
        const upd = await ctx.conn.query("UPDATE court_cases SET state = 'withdrawn', ended_ms = ?, updated_ms = ?, summary = 'Anzeige zurückgezogen' WHERE id = ? AND state IN ('filed','investigation')", [now, now, c.id]);
        if (!upd || !upd.affectedRows) fail('Das Verfahren ist inzwischen anders ausgegangen.');
        await ctx.conn.query("UPDATE court_evidence SET status = 'open', case_id = NULL WHERE id = ? AND case_id = ?", [c.evidence_id, c.id]);
        await event(ctx.conn, userId, c.id, 'withdrawn', 'info', 'Anzeige zurückgezogen', 'Du hast die Anzeige zurückgezogen. Die Spuren bleiben (verblassend) erhalten.');
        await event(ctx.conn, other, c.id, 'withdrawn', 'good', 'Anzeige zurückgezogen', `${me} hat die Anzeige zurückgezogen. Das Verfahren ist beendet.`);
        return { msg: 'Anzeige zurückgezogen.', level: 'good' };
      }
      case 'appeal': {
        if (c.state !== 'verdict') fail('Berufung ist nur direkt nach dem Urteil möglich.');
        if (c.appeal_used) fail('Berufung ist nur einmal möglich.');
        const losing = c.guilty ? 'd' : 'p'; if (role !== losing) fail(c.guilty ? 'Nur der Verurteilte kann Berufung einlegen.' : 'Nur die Anklage kann gegen den Freispruch Berufung einlegen.');
        if (c.confessed) fail('Nach einem Geständnis ist keine Berufung möglich.');
        const cents = payFee(ctx, num((C.complaint || {}).fee, 1200) * num(K.appealFeeMult, 2), 'Berufungsgebühr');
        const upd = await ctx.conn.query("UPDATE court_cases SET state = 'appeal', appeal_used = 1, appeal_by = ?, round = 2, lawyer_p = 0, lawyer_d = 0, step_ms = ?, updated_ms = ? WHERE id = ? AND state = 'verdict'", [userId, now + M.investigationMs(0, C, true), now, c.id]);
        if (!upd || !upd.affectedRows) fail('Die Berufungsfrist ist abgelaufen.');
        await event(ctx.conn, userId, c.id, 'appeal', 'info', 'Berufung eingelegt', 'Das Berufungsgericht prüft den Fall neu. Rechtsanwälte müssen neu beauftragt werden.');
        await event(ctx.conn, other, c.id, 'appeal', 'warn', 'Berufung eingelegt', `${me} hat Berufung eingelegt. Das Urteil ruht, bis das Berufungsgericht entschieden hat.`);
        return { msg: 'Berufung eingelegt.', level: 'good', cents };
      }
      case 'bribe': {
        if (role !== 'd') fail('Das kommt für dich nicht infrage.');
        const B = C.bribe || {}; if (B.enabled === false) fail('Das ist nicht möglich.');
        if (!['investigation', 'hearing', 'appeal'].includes(c.state)) fail('Dafür ist es zu spät.');
        if (c.bribed) fail('Du hast es schon versucht.');
        const cents = payFee(ctx, num(B.cost, 3000), 'Bestechungsgeld');
        const E = pol().effects(c.city_id);
        const p = M.clamp(num(B.successPct, 35) / 100 - E.police * 0.08, 0.05, 0.9);
        const ok = M.roll('bribe', c.id, c.round) < p;
        await touch('bribed = ?', [ok ? 1 : 2]);
        // Der Versuch selbst hinterlässt Spuren – auch wenn er gelingt. Das Opfer ist die Anklage.
        await trace(ctx.conn, { act: 'bribe', offenderId: userId, victimId: c.plaintiff_id, victimCompany: null, subject: null, cityId: c.city_id, damageReal: 0, strength: ok ? 30 : num(B.evidence, 65), known: !ok, caught: !ok });
        if (!ok) {
          await event(ctx.conn, c.plaintiff_id, c.id, 'bribe', 'warn', 'Bestechungsversuch', 'Das Gericht meldet einen Bestechungsversuch der Gegenseite. Du kannst deswegen Anzeige erstatten.');
          await event(ctx.conn, userId, c.id, 'bribe', 'bad', 'Bestechung aufgeflogen', 'Der Richter hat das Geld abgelehnt und den Versuch gemeldet. Das wird dir vorgehalten.');
          return { msg: 'Der Richter hat abgelehnt und den Versuch gemeldet.', level: 'bad', cents };
        }
        return { msg: 'Das Geld wurde angenommen. Ob es etwas nützt, zeigt das Urteil – Spuren davon bleiben aber zurück.', level: 'warn', cents };
      }
      default: fail('Unbekannte Handlung.');
    }
    return {};
  }, { needAlive: true });
}

/** Vergleich bestätigt: Zahlungsauftrag Schadenersatz (Vergleichssumme) und teilweise Rückerstattung der Anzeigegebühr an die Anklage. */
async function settle(conn, c, now) {
  const C = cfg(); const real = Math.max(0, Math.round(num(c.offer_real, 0)));
  if (real > 0) await conn.query("INSERT INTO court_sanctions (case_id, user_id, to_user, kind, level, amount_real, due_ms, status, created_ms) VALUES (?,?,?,'damages',1,?,?, 'active', ?)", [c.id, c.defendant_id, c.plaintiff_id, real, now + num((C.sanctions || {}).payDays, 14) * 24 * HOUR, now]);
  const refund = Math.round(num((C.complaint || {}).fee, 1200) * num((C.court || {}).settleRefundPct, 50) / 100);
  if (refund > 0) await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text) VALUES (?,?,'court',?)", [c.plaintiff_id, refund, 'Teilerstattung der Anzeigegebühr nach Vergleich.']);
  await conn.query("UPDATE court_evidence SET status = 'used' WHERE id = ?", [c.evidence_id]);
  live.publish('court', {}, c.plaintiff_id); live.publish('court', {}, c.defendant_id);
}

/* ============================================================================================
   Urteil
   ============================================================================================ */
async function defendantFirm(userId) {
  const row = await db.one("SELECT state, status FROM characters WHERE user_id = ? ORDER BY (status = 'gameover'), id DESC LIMIT 1", [userId]);
  if (!row) return null;
  try {
    const s = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
    const list = (s.companies || []).filter((x) => !x.abandoned).sort((a, b) => (b.base || 0) - (a.base || 0));
    return list[0] ? { id: list[0].id, pkey: list[0].pkey, cityId: s.cityId } : { id: null, pkey: null, cityId: s.cityId };
  } catch (_) { return null; }
}

/** Urteil berechnen (rein bis auf Lesezugriffe). Rückgabe { guilty, p, level, plan, text }. */
async function computeVerdict(c, round, confessed) {
  const C = cfg(); const K = C.court || {};
  const ev = c.evidence_id ? await db.one('SELECT * FROM court_evidence WHERE id = ?', [c.evidence_id]) : null;
  const truth = !!(ev && ev.offender_id && ev.offender_id === c.defendant_id);
  const E = pol().effects(c.city_id);
  const D = await rep().confidence(c.defendant_id, c.city_id).catch(() => ({ value: 0.5 }));
  const P = await rep().confidence(c.plaintiff_id, c.city_id).catch(() => ({ value: 0.5 }));
  const firm = await defendantFirm(c.defendant_id);
  const avg = (num((C.detective || {}).boostMin, 14) + num((C.detective || {}).boostMax, 30)) / 2;
  const strength = Math.min(100, num(c.strength, 0) + num(c.det_p, 0) * avg);
  const alibi = !!(M.ACTS[c.act] && M.ACTS[c.act].needsPresence && firm && firm.cityId && firm.cityId !== c.city_id);
  const inp = { strength, truth, lawyerP: !!c.lawyer_p, lawyerD: !!c.lawyer_d, repD: D.value, repP: P.value, alibi, strictness: E.strictness, bribed: c.bribed === 1, confessed: !!confessed };
  const dec = M.decide(c.id, round, inp, C);
  const out = { guilty: dec.guilty, p: dec.p, truth, level: 0, plan: [], inp };
  if (!dec.guilty) return out;
  const since = Date.now() - num(K.priorWindowDays, 60) * 24 * HOUR;
  const priors = Number((await db.one("SELECT COUNT(*) n FROM court_cases WHERE defendant_id = ? AND guilty = 1 AND state = 'final' AND ended_ms > ? AND id <> ?", [c.defendant_id, since, c.id])).n) || 0;
  out.level = M.levelFor(c.act, priors, confessed, C);
  out.plan = M.sanctionsFor(c.act, out.level, { claim: c.claim_real, rangePct: E.rangePct, confessed, hasFirm: !!(firm && firm.id), pkey: firm && firm.pkey }, C);
  if (firm && firm.id) for (const s of out.plan) if (s.kind === 'closure') s.company = firm.id;
  out.priors = priors;
  return out;
}

/** Urteil jetzt sprechen und festhalten (Zustand 'verdict'); Berufungsfrist beginnt. Bei Geständnis keine Berufung. */
async function verdictNow(conn, c, round, now, confessed = false) {
  const C = cfg();
  const v = await computeVerdict({ ...c }, round, confessed || !!c.confessed);
  const step = now + num((C.court || {}).appealWindowHours, 24) * HOUR;
  const text = v.guilty ? `Schuldig (Stufe ${v.level}).` : 'Freispruch.';
  const upd = await conn.query("UPDATE court_cases SET state = 'verdict', guilty = ?, level = ?, plan = ?, confessed = ?, appeal_used = ?, step_ms = ?, summary = ?, updated_ms = ? WHERE id = ? AND state IN ('filed','investigation','hearing')",
    [v.guilty ? 1 : 0, v.level, JSON.stringify(v.plan), confessed || c.confessed ? 1 : 0, confessed || c.confessed ? 1 : c.appeal_used, step, text, now, c.id]);
  if (!upd || !upd.affectedRows) return false;
  await announceVerdict(conn, c, v);
  return true;
}

const planText = (plan) => plan.filter((s) => s.kind !== 'warn').map((s) => {
  const hrs = (h) => (h >= 24 ? `${Math.round(h / 24 * 10) / 10} Tage` : `${h} Std.`);
  switch (s.kind) {
    case 'damages': return 'Schadenersatz an das Opfer';
    case 'fine': return 'Geldstrafe';
    case 'honor': return 'Ehrverlust';
    case 'closure': return `Betriebsschließung (${hrs(s.hours)})`;
    case 'gewerbe': return `Gewerbeverbot (${hrs(s.hours)})`;
    case 'beruf': return `Berufsverbot (${hrs(s.hours)})`;
    case 'haft': return `Haft (${hrs(s.hours)})`;
    default: return s.kind;
  }
}).join(', ');

async function announceVerdict(conn, c, v) {
  const label = M.ACTS[c.act].label;
  if (v.guilty) {
    const list = planText(v.plan) || 'Verwarnung';
    await event(conn, c.defendant_id, c.id, 'verdict', 'bad', 'Urteil: schuldig', `Das Gericht hat dich im Fall „${label}“ schuldig gesprochen: Verwarnung${list ? `, ${list}` : ''}. Du kannst innerhalb der Frist Berufung einlegen (einmal); sonst wird das Urteil rechtskräftig.`);
    await event(conn, c.plaintiff_id, c.id, 'verdict', 'good', 'Urteil: schuldig', `Das Gericht hat den Angeklagten im Fall „${label}“ schuldig gesprochen: ${list || 'Verwarnung'}. Das Urteil wird rechtskräftig, wenn keine Berufung eingelegt wird.`);
  } else {
    await event(conn, c.defendant_id, c.id, 'verdict', 'good', 'Urteil: Freispruch', `Das Gericht hat dich im Fall „${label}“ freigesprochen.`);
    await event(conn, c.plaintiff_id, c.id, 'verdict', 'warn', 'Urteil: Freispruch', `Das Gericht hat den Angeklagten im Fall „${label}“ freigesprochen: Die Beweise reichten nicht. Du kannst einmal Berufung einlegen.`);
  }
  after(conn, async () => { await letter(c.defendant_id, v.guilty ? 'Gericht: Urteil gegen dich' : 'Gericht: Freispruch', v.guilty ? 'Das Gericht hat dich schuldig gesprochen. Einzelheiten und Berufung unter „Gesellschaft → Recht & Gericht“.' : 'Das Gericht hat dich freigesprochen.'); await letter(c.plaintiff_id, 'Gericht: Urteil in deinem Verfahren', v.guilty ? 'Das Gericht hat den Angeklagten schuldig gesprochen.' : 'Das Gericht hat den Angeklagten freigesprochen.'); });
}

/** Rechtskräftig: Sanktionen werden Zahlungsaufträge bzw. Einschränkungen (genau einmal, durch bedingte Zustandsänderung). */
async function finalize(c, now, fromState) {
  const C = cfg(); const S = C.sanctions || {};
  const plan = (() => { try { return JSON.parse(c.plan || '[]'); } catch (_) { return []; } })();
  let punish = null; let falseAcc = false;
  const ok = await db.tx(async (conn) => {
    const upd = await conn.query("UPDATE court_cases SET state = 'final', ended_ms = ?, updated_ms = ? WHERE id = ? AND state = ?", [now, now, c.id, fromState]);
    if (!upd || !upd.affectedRows) return false;
    const due = now + num(S.payDays, 14) * 24 * HOUR;
    if (c.guilty) {
      for (const s of plan) {
        if (s.kind === 'damages') await conn.query("INSERT INTO court_sanctions (case_id, user_id, to_user, kind, level, amount_real, due_ms, status, created_ms) VALUES (?,?,?,'damages',?,?,?, 'active', ?)", [c.id, c.defendant_id, c.plaintiff_id, c.level, s.real, due, now]);
        else if (s.kind === 'fine') await conn.query("INSERT INTO court_sanctions (case_id, user_id, kind, level, amount_real, due_ms, status, created_ms) VALUES (?,?,'fine',?,?,?, 'active', ?)", [c.id, c.defendant_id, c.level, s.real, due, now]);
        else if (M.RESTRICT_KINDS.includes(s.kind)) await conn.query("INSERT INTO court_sanctions (case_id, user_id, kind, level, until_ms, params, status, created_ms) VALUES (?,?,?,?,?,?, 'active', ?)", [c.id, c.defendant_id, s.kind, c.level, now + Math.round(s.hours * HOUR), JSON.stringify({ pkey: s.pkey || null, company: s.company || null }), now]);
        else if (s.kind === 'honor') punish = s.pts;
      }
      await event(conn, c.defendant_id, c.id, 'final', 'bad', 'Urteil rechtskräftig', `Das Urteil im Fall „${M.ACTS[c.act].label}“ ist rechtskräftig. Geldzahlungen werden dir in den nächsten Tagen abgebucht, Einschränkungen siehst du unter „Recht & Gericht“.`);
      await event(conn, c.plaintiff_id, c.id, 'final', 'good', 'Urteil rechtskräftig', 'Das Urteil ist rechtskräftig. Schadenersatz wird dir gutgeschrieben, sobald der Verurteilte zahlt.');
    } else {
      const ev = c.evidence_id ? await conn.one('SELECT offender_id FROM court_evidence WHERE id = ?', [c.evidence_id]) : null;
      falseAcc = !(ev && ev.offender_id === c.defendant_id);
      const fine = num((C.complaint || {}).falseFine, 1500);
      if (falseAcc && fine > 0) await conn.query("INSERT INTO court_sanctions (case_id, user_id, kind, level, amount_real, due_ms, status, created_ms) VALUES (?,?,'fine',1,?,?, 'active', ?)", [c.id, c.plaintiff_id, fine, due, now]);
      await event(conn, c.defendant_id, c.id, 'final', 'good', 'Freispruch rechtskräftig', 'Der Freispruch ist rechtskräftig. Das Verfahren ist beendet.');
      await event(conn, c.plaintiff_id, c.id, 'final', falseAcc ? 'bad' : 'warn', 'Verfahren beendet', falseAcc ? 'Die Anzeige hat sich als haltlos erwiesen. Das schadet deinem Ansehen und kostet eine Geldbuße.' : 'Der Freispruch ist rechtskräftig. Das Verfahren ist beendet.');
    }
    return true;
  });
  if (!ok) return false;
  invalidate(c.defendant_id); invalidate(c.plaintiff_id);
  const [dfn, pl] = [await userInfo(c.defendant_id), await userInfo(c.plaintiff_id)];
  if (c.guilty) {
    if (punish) await rep().punish(c.defendant_id, 'court_convicted', punish, `k${c.id}`, { cityId: c.city_id });
    if (c.level >= num(S.publicFromLevel, 3)) {
      const nm = dfn && dfn.social_public && dfn.name ? dfn.name : 'Ein Bürger';
      await require('./tagesblatt').post('life', 'Gericht', `${nm} wurde im Fall „${M.ACTS[c.act].label}“ verurteilt${planText(plan) ? `: ${planText(plan)}` : ''}.`, c.city_id);
    }
  } else {
    if (falseAcc) { await rep().punish(c.plaintiff_id, 'court_false', num((C.complaint || {}).falseScandal, 5), `k${c.id}`, { cityId: c.city_id }); await rep().add(c.defendant_id, 'rel', null, 'court_fair', `k${c.id}`, { cityId: c.city_id }); }
  }
  void pl;
  live.publish('court', {}, c.defendant_id); live.publish('court', {}, c.plaintiff_id);
  return true;
}

/* ============================================================================================
   Zustandsautomat
   ============================================================================================ */
async function step(c, now) {
  const C = cfg(); const K = C.court || {};
  const t0 = Number(c.step_ms);
  switch (c.state) {
    case 'filed': {
      const next = Number(c.created_ms) + num(K.intakeMinutes, 2) * 60000 + M.investigationMs(c.det_p, C);
      const upd = await db.query("UPDATE court_cases SET state = 'investigation', step_ms = ?, updated_ms = ? WHERE id = ? AND state = 'filed'", [next, now, c.id]);
      if (!upd || !upd.affectedRows) return false;
      await event(db, c.plaintiff_id, c.id, 'investigation', 'info', 'Ermittlung läuft', 'Die Gerichtskanzlei hat die Anzeige angenommen. Die Ermittlung hat begonnen; Detektive verkürzen sie.');
      await event(db, c.defendant_id, c.id, 'investigation', 'info', 'Ermittlung läuft', 'Die Ermittlung gegen dich hat begonnen. Nutze die Zeit: Rechtsanwalt, Vergleich oder Geständnis.');
      return true;
    }
    case 'investigation': {
      const next = t0 + num(K.hearingHours, 12) * HOUR;
      const upd = await db.query("UPDATE court_cases SET state = 'hearing', step_ms = ?, updated_ms = ? WHERE id = ? AND state = 'investigation'", [next, now, c.id]);
      if (!upd || !upd.affectedRows) return false;
      await event(db, c.plaintiff_id, c.id, 'hearing', 'info', 'Verhandlung angesetzt', 'Die Ermittlung ist abgeschlossen. Die Verhandlung findet bald statt; danach ergeht das Urteil.');
      await event(db, c.defendant_id, c.id, 'hearing', 'warn', 'Verhandlung angesetzt', 'Die Ermittlung ist abgeschlossen. Bald ergeht das Urteil – letzte Gelegenheit für Rechtsanwalt, Vergleich oder Geständnis.');
      return true;
    }
    case 'hearing': {
      const ok = await db.tx(async (conn) => {
        const cur = await conn.one("SELECT * FROM court_cases WHERE id = ? AND state = 'hearing' FOR UPDATE", [c.id]); if (!cur) return false;
        return verdictNow(conn, cur, 1, now);
      });
      return !!ok;
    }
    case 'verdict': return finalize(c, now, 'verdict');
    case 'appeal': {
      const v = await computeVerdict(c, 2, false);
      const upd = await db.query("UPDATE court_cases SET guilty = ?, level = ?, plan = ?, summary = ?, updated_ms = ? WHERE id = ? AND state = 'appeal'", [v.guilty ? 1 : 0, v.level, JSON.stringify(v.plan), v.guilty ? `Berufung: schuldig (Stufe ${v.level})` : 'Berufung: Freispruch', now, c.id]);
      if (!upd || !upd.affectedRows) return false;
      const cc = { ...c, guilty: v.guilty ? 1 : 0, level: v.level, plan: JSON.stringify(v.plan) };
      await announceVerdict(db, cc, v);
      return finalize(cc, now, 'appeal');
    }
    default: return false;
  }
}

async function advanceCase(id, now = Date.now()) {
  let c = null;
  for (let i = 0; i < 8; i++) {
    c = await db.one('SELECT * FROM court_cases WHERE id = ?', [id]);
    if (!c || !M.OPEN_STATES.includes(c.state) || Number(c.step_ms) > now) return c;
    let ok = false;
    try { ok = await step(c, now); } catch (e) { log.warn(`[gericht] Verfahren ${id}: ${e.message}`); return c; }
    if (!ok) return c;
  }
  return c;
}

/** Zeitgeber: fällige Verfahren, Detektivergebnisse, verfallene Spuren und alte Daten. */
async function tick(now = Date.now()) {
  if (!on()) return;
  await settleDetectives(now);
  const due = await db.query("SELECT id FROM court_cases WHERE state IN ('filed','investigation','hearing','verdict','appeal') AND step_ms <= ? ORDER BY step_ms LIMIT 40", [now]);
  for (const r of due) await advanceCase(r.id, now);
  await db.query("UPDATE court_evidence SET status = 'expired' WHERE status = 'open' AND expires_ms <= ?", [now]);
}
async function prune() {
  await db.query("DELETE FROM court_evidence WHERE status IN ('expired','used') AND created_ms < ?", [Date.now() - 90 * 24 * HOUR]);
  await db.query("DELETE FROM court_events WHERE created_ms < ?", [Date.now() - 120 * 24 * HOUR]);
  await db.query("DELETE FROM court_cases WHERE state IN ('final','settled','dismissed','withdrawn') AND COALESCE(ended_ms, updated_ms) < ?", [Date.now() - 180 * 24 * HOUR]);
}

/* ============================================================================================
   Abgleich beim Laden des Spielstands (bonds.reconcile)
   ============================================================================================ */
const cache = new Map();
const TTL = process.env.TP_COURT_CACHE_MS != null && process.env.TP_COURT_CACHE_MS !== '' ? Math.max(0, Number(process.env.TP_COURT_CACHE_MS) || 0) : 5000;
function invalidate(userId) { cache.delete(userId); }

/**
 * Zahlungsaufträge genau einmal begleichen (unter der Sperre der Zeilen), Einschränkungen in state.court spiegeln, Meldungen zeigen.
 * state.court = { r: [{k, until, pkey}], debt (Cent), ev (offene Spuren), p, d (laufende Verfahren als Anklage/Beklagter), act (Beklagter muss handeln) }.
 */
async function reconcile(conn, user, state, world) {
  if (!state) return;
  if (!on()) { delete state.court; return; }
  const now = Date.now(); const C = cfg(); const S = C.sanctions || {};
  const idx = Math.max(0.0001, world.idx(yearOf(state.day, state.startYear)));
  const cur = world.currency(yearOf(state.day, state.startYear));
  let rows = await conn.query("SELECT * FROM court_sanctions WHERE user_id = ? AND status = 'active' ORDER BY id", [user.id]);
  const moneyIds = rows.filter((s) => M.MONEY_KINDS.includes(s.kind)).map((s) => s.id);
  if (moneyIds.length) { // Zahlungsaufträge unter Sperre erneut lesen (nur diese Zeilen), damit jede Zahlung genau einmal gebucht wird
    const locked = new Map((await conn.query(`SELECT * FROM court_sanctions WHERE id IN (${moneyIds.map(() => '?').join(',')}) AND status = 'active' FOR UPDATE`, moneyIds)).map((r) => [r.id, r]));
    rows = rows.filter((s) => !M.MONEY_KINDS.includes(s.kind) || locked.has(s.id)).map((s) => (locked.get(s.id) || s));
  }
  const court = { r: [], debt: 0, ev: 0, p: 0, d: 0, act: 0, at: now };
  const alive = state.status === 'alive';
  for (const s of rows) {
    if (M.MONEY_KINDS.includes(s.kind)) {
      const left = Math.max(0, s.amount_real - s.paid_real);
      if (left <= 1e-6) { await conn.query("UPDATE court_sanctions SET status = 'paid' WHERE id = ?", [s.id]); continue; }
      if (s.due_ms && Number(s.due_ms) < now) { await conn.query("UPDATE court_sanctions SET status = 'expired' WHERE id = ? AND status = 'active'", [s.id]); await event(conn, user.id, s.case_id, 'expired', 'info', 'Zahlungsfrist abgelaufen', 'Der Rest einer gerichtlichen Zahlung ist verfallen, weil die Frist abgelaufen ist.'); continue; }
      if (!alive) continue;
      const cap = Math.floor(Math.max(0, state.money) * num(S.maxPayPct, 70) / 100);
      const cents = Math.min(Math.round(left * idx), cap);
      if (cents > 0) {
        const real = cents / idx; const full = cents >= Math.round(left * idx);
        const upd = await conn.query("UPDATE court_sanctions SET paid_real = paid_real + ?, status = IF(?, 'paid', status) WHERE id = ? AND status = 'active'", [real, full ? 1 : 0, s.id]);
        if (upd && upd.affectedRows) {
          state.money -= cents; state.stats.spent = (state.stats.spent || 0) + cents;
          if (s.kind === 'damages' && s.to_user) {
            const share = real * (1 - num(S.damagesStatePct, 0) / 100);
            if (share > 0) await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text) VALUES (?,?,'court',?)", [s.to_user, share, 'Schadenersatz aus einem Gerichtsverfahren.']);
            live.publish('court', {}, s.to_user); live.publish('business', {}, s.to_user);
          }
          notice(state, { level: 'warn', title: s.kind === 'damages' ? 'Schadenersatz gezahlt' : 'Geldstrafe gezahlt', tab: 'society', text: `Aus einem Gerichtsverfahren wurden ${formatMoney(cents, cur)} abgebucht${full ? '' : ' (Ratenzahlung: Der Rest folgt, sobald wieder Geld da ist)'}.` });
        }
      }
      court.debt += Math.max(0, Math.round((left - (cents / idx)) * idx));
    } else if (M.RESTRICT_KINDS.includes(s.kind)) {
      if (Number(s.until_ms) <= now) { await conn.query("UPDATE court_sanctions SET status = 'ended' WHERE id = ? AND status = 'active'", [s.id]); await event(conn, user.id, s.case_id, 'ended', 'good', 'Einschränkung beendet', `${M.SANCTIONS[s.kind]} ist abgelaufen.`); continue; }
      let pk = null; let co = null; try { const p = JSON.parse(s.params || '{}'); pk = p.pkey || null; co = p.company || null; } catch (_) { /* leer */ }
      court.r.push({ k: s.kind, until: Number(s.until_ms), pkey: pk, caseId: s.case_id });
      if (alive && (s.kind === 'closure' || s.kind === 'beruf')) {
        const days = M.closureDays(Number(s.until_ms), now, settings.get('game.clock_days_per_day'));
        for (const f of state.companies || []) {
          if (f.abandoned) continue;
          if ((s.kind === 'closure' && f.id === co) || (s.kind === 'beruf' && pk && f.pkey === pk)) f.outageUntil = Math.max(f.outageUntil || 0, state.day + days);
        }
      }
    }
  }
  // Zähler für Hinweise („Was jetzt?“) und Banner
  const ev = await conn.one("SELECT COUNT(*) n FROM court_evidence WHERE victim_id = ? AND status = 'open' AND case_id IS NULL AND expires_ms > ?", [user.id, now]);
  court.ev = Number(ev.n) || 0;
  const cs = await conn.query("SELECT plaintiff_id, defendant_id, state, lawyer_d, offer_by FROM court_cases WHERE (plaintiff_id = ? OR defendant_id = ?) AND state IN ('filed','investigation','hearing','verdict','appeal')", [user.id, user.id]);
  for (const k of cs) {
    if (k.plaintiff_id === user.id) court.p++; else { court.d++; if (k.state !== 'verdict' && !k.lawyer_d && !k.offer_by) court.act++; }
  }
  // Meldungen aus den Ereignissen (einmal)
  const evs = await conn.query('SELECT * FROM court_events WHERE user_id = ? AND notified = 0 ORDER BY id LIMIT 12', [user.id]);
  if (evs.length) {
    await conn.query(`UPDATE court_events SET notified = 1 WHERE id IN (${evs.map(() => '?').join(',')})`, evs.map((e) => e.id));
    for (const e of evs) notice(state, { level: e.level === 'bad' ? 'bad' : e.level === 'good' ? 'good' : e.level === 'warn' ? 'warn' : 'info', title: e.title, text: e.text, tab: 'society', interrupt: e.level === 'bad' });
  }
  state.court = court;
  cache.set(user.id, { at: now, r: court.r });
}

/** Haft aktiv? (aus dem Spielstand) */
const jailed = (state, now = Date.now()) => !!(state && state.court && Array.isArray(state.court.r) && state.court.r.some((x) => x.k === 'haft' && x.until > now));

/** Sperre für wirtschaftliche Handlungen außerhalb von actions.run. scope: 'econ' (Haft) oder 'trade' (zusätzlich Gewerbeverbot). */
async function assertFree(userId, scope = 'econ') {
  if (!on() || !userId) return;
  const now = Date.now(); let e = cache.get(userId);
  if (!e || now - e.at > TTL) {
    const rows = await db.query("SELECT kind k, until_ms until, params, case_id caseId FROM court_sanctions WHERE user_id = ? AND status = 'active' AND kind IN ('haft','gewerbe','beruf','closure') AND until_ms > ?", [userId, now]);
    e = { at: now, r: rows.map((r) => ({ k: r.k, until: Number(r.until), caseId: r.caseId })) };
    cache.set(userId, e);
    if (cache.size > 5000) cache.clear();
  }
  const t = M.blockText(e.r, scope, now);
  if (t) fail(t);
}

/* ============================================================================================
   Amnestie (Kanzler): leichte Sanktionen im ganzen Land erlassen
   ============================================================================================ */
async function amnesty(conn, holderId) {
  const lv = num((cfg().politics || {}).amnestyMaxLevel, 2);
  const rows = await conn.query("SELECT s.id, s.user_id, s.kind FROM court_sanctions s WHERE s.status = 'active' AND s.kind IN ('fine','closure','gewerbe','beruf','haft') AND s.level <= ? AND s.user_id <> ?", [lv, holderId]);
  if (!rows.length) return 0;
  await conn.query(`UPDATE court_sanctions SET status = 'annulled' WHERE id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id));
  for (const u of new Set(rows.map((r) => r.user_id))) { await event(conn, u, null, 'amnesty', 'good', 'Amnestie', 'Eine Amnestie hat leichte Strafen erlassen. Geldstrafen, Verbote und Haft aus leichteren Verfahren sind aufgehoben.'); invalidate(u); }
  return rows.length;
}

/* ============================================================================================
   Übersicht für die Oberfläche
   ============================================================================================ */
async function overview(userId) {
  const p = await service.peek(userId); if (!p || !p.state) return { ok: true, enabled: false };
  const C = cfg(); const now = Date.now();
  if (!on()) return { ok: true, enabled: false };
  await settleDetectives(now, userId).catch(() => {});
  const open = await db.query("SELECT id FROM court_cases WHERE (plaintiff_id = ? OR defendant_id = ?) AND state IN ('filed','investigation','hearing','verdict','appeal') AND step_ms <= ?", [userId, userId, now]);
  for (const r of open) await advanceCase(r.id, now);
  const { w: world, state } = p; const idx = idxOf(world, state); const cents = (real) => Math.round(real * idx);
  const K = C.complaint || {}; const Ct = C.court || {}; const D = C.detective || {};
  const costs = {
    complaint: cents(num(K.fee, 1200)), detective: cents(num(D.cost, 5000)), witness: cents(num((C.witness || {}).cost, 800)), docs: cents(num((C.docs || {}).cost, 1500)),
    lawyer: cents(num((Ct.lawyer || {}).cost, 4000)), lawyerAppeal: cents(num((Ct.lawyer || {}).cost, 4000) * num((Ct.lawyer || {}).appealCostMult, 2)),
    appeal: cents(num(K.fee, 1200) * num(Ct.appealFeeMult, 2)), bribe: cents(num((C.bribe || {}).cost, 3000)), falseFine: cents(num(K.falseFine, 1500)),
  };
  const evRows = await db.query("SELECT e.*, s.name suspect_name FROM court_evidence e LEFT JOIN player_stats s ON s.user_id = e.suspect_id WHERE e.victim_id = ? AND e.status = 'open' AND e.expires_ms > ? ORDER BY e.id DESC LIMIT 40", [userId, now]);
  const evidence = evRows.map((e) => {
    const lim = pol().effects(e.city_id).limitation;
    const cur = M.currentStrength(e, now, C, lim);
    const total = e.strength + e.boost;
    return {
      id: e.id, act: e.act, label: M.ACTS[e.act].label, text: M.ACTS[e.act].text, subject: e.subject, city: (world.city(e.city_id) || {}).name || null, cityId: e.city_id,
      strength: Math.round(cur), band: band(cur), known: !!e.known, usable: cur > 0, canFile: cur >= num(K.minStrength, 15) && !e.case_id, damage: cents(e.damage_real), caseId: e.case_id,
      suspect: e.suspect_id ? { id: e.suspect_id, name: e.suspect_name || 'Unbekannt', conf: e.suspect_conf } : null,
      detective: e.det_until ? { until: Number(e.det_until) } : null, detN: e.det_n, witnessN: e.witness_n, docs: e.docs,
      canDetective: !e.det_until && e.det_n < num(D.perEvidence, 2) && !(e.known && e.det_n >= 1) && cur > 0, canWitness: e.witness_n < num((C.witness || {}).max, 3) && total < 100 && cur > 0, canDocs: e.docs < num((C.docs || {}).max, 1) && total < 100 && cur > 0,
      ageHours: Math.round((now - Number(e.created_ms)) / HOUR), leftHours: Math.max(0, Math.round((Number(e.created_ms) + num((C.evidence || {}).keepHours, 336) * HOUR * lim - now) / HOUR)),
    };
  }).filter((e) => e.usable);
  const caseRows = await db.query(
    `SELECT c.*, pp.name pname, dd.name dname, pu.social_public ppub, du.social_public dpub FROM court_cases c LEFT JOIN player_stats pp ON pp.user_id = c.plaintiff_id LEFT JOIN player_stats dd ON dd.user_id = c.defendant_id
     LEFT JOIN users pu ON pu.id = c.plaintiff_id LEFT JOIN users du ON du.id = c.defendant_id
     WHERE (c.plaintiff_id = ? OR c.defendant_id = ?) AND (c.state IN ('filed','investigation','hearing','verdict','appeal') OR c.updated_ms > ?) ORDER BY c.id DESC LIMIT 30`, [userId, userId, now - 14 * 24 * HOUR]);
  const ids = caseRows.map((c) => c.id);
  const evs = ids.length ? await db.query(`SELECT case_id, type, level, title, text, created_ms FROM court_events WHERE user_id = ? AND case_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, [userId, ...ids]) : [];
  const byCase = new Map(); for (const e of evs) { if (!byCase.has(e.case_id)) byCase.set(e.case_id, []); byCase.get(e.case_id).push({ type: e.type, level: e.level, title: e.title, text: e.text, at: Number(e.created_ms) }); }
  const cases = caseRows.map((c) => caseView(c, userId, world, state, idx, now, costs, byCase.get(c.id) || [], C));
  const sanc = await db.query("SELECT s.*, t.name to_name FROM court_sanctions s LEFT JOIN player_stats t ON t.user_id = s.to_user WHERE s.user_id = ? AND s.status = 'active' ORDER BY s.id DESC", [userId]);
  const restrictions = sanc.filter((s) => M.RESTRICT_KINDS.includes(s.kind) && Number(s.until_ms) > now).map((s) => ({ id: s.id, kind: s.kind, label: M.SANCTIONS[s.kind], until: Number(s.until_ms), caseId: s.case_id }));
  const debts = sanc.filter((s) => M.MONEY_KINDS.includes(s.kind)).map((s) => ({ id: s.id, kind: s.kind, label: M.SANCTIONS[s.kind], left: cents(Math.max(0, s.amount_real - s.paid_real)), due: Number(s.due_ms), to: s.to_name || null, caseId: s.case_id }));
  const week = await db.one('SELECT COUNT(*) n FROM court_cases WHERE plaintiff_id = ? AND created_ms > ?', [userId, now - 7 * 24 * HOUR]);
  const openN = cases.filter((c) => c.role === 'p' && c.open).length;
  const E = pol().effects(state.cityId);
  const { SANCTIONS, ACTS } = M;
  return {
    ok: true, enabled: true, now, costs, evidence, cases, restrictions, debts, acts: Object.fromEntries(Object.entries(ACTS).map(([k, v]) => [k, v.label])), sanctionNames: SANCTIONS,
    limits: { weekUsed: Number(week.n), weekMax: num(K.perWeek, 3), openUsed: openN, openMax: num(K.openMax, 3), minStrength: num(K.minStrength, 15), pairDays: num(K.perPairDays, 14) },
    local: { police: E.police, policeName: pol().POLICE_NAMES[E.police] || 'Normal', strictness: E.strictness, rangePct: E.rangePct, limitation: E.limitation },
    bribe: (C.bribe || {}).enabled !== false, hours: { investigation: num(Ct.investigationHours, 24), hearing: num(Ct.hearingHours, 12), appeal: num(Ct.appealWindowHours, 24) },
  };
}

function caseView(c, userId, world, state, idx, now, costs, timeline, C) {
  const role = roleOf(c, userId); const open = M.OPEN_STATES.includes(c.state);
  const cents = (real) => Math.round(real * idx);
  const plan = (() => { try { return JSON.parse(c.plan || '[]'); } catch (_) { return []; } })();
  const losing = c.guilty == null ? null : c.guilty ? 'd' : 'p';
  const canAppeal = c.state === 'verdict' && !c.appeal_used && !c.confessed && role === losing;
  const running = ACTIVE_STATES.includes(c.state) || c.state === 'appeal';
  const offer = c.offer_real != null && c.offer_by ? { amount: cents(c.offer_real), mine: c.offer_by === userId, expired: now - Number(c.offer_ms) > num((C.court || {}).settleExpireHours, 48) * HOUR } : null;
  const actions = [];
  if (running) {
    if (!(role === 'p' ? c.lawyer_p : c.lawyer_d)) actions.push('lawyer');
    if (role === 'p' && ['filed', 'investigation'].includes(c.state) && c.det_p < num((C.detective || {}).perEvidence, 2)) actions.push('detective');
    if (role === 'd' && ACTIVE_STATES.includes(c.state)) actions.push('confess');
    if (role === 'd' && !c.bribed && (C.bribe || {}).enabled !== false && ['investigation', 'hearing', 'appeal'].includes(c.state)) actions.push('bribe');
    if (role === 'p' && ['filed', 'investigation'].includes(c.state)) actions.push('withdraw');
    if (ACTIVE_STATES.includes(c.state)) { actions.push('offer'); if (offer && !offer.mine && !offer.expired) actions.push('accept', 'decline'); }
  }
  if (canAppeal) actions.push('appeal');
  const other = role === 'p' ? { name: c.dname || 'Unbekannt', userId: c.defendant_id } : { name: c.pname || 'Unbekannt', userId: c.plaintiff_id };
  const nextText = ({
    filed: 'Die Kanzlei prüft den Eingang', investigation: 'Ermittlung läuft – danach Verhandlung', hearing: 'Verhandlung – danach das Urteil', verdict: c.guilty ? 'Berufungsfrist – danach rechtskräftig' : 'Berufungsfrist – danach rechtskräftig', appeal: 'Berufungsgericht entscheidet',
  })[c.state] || null;
  return {
    id: c.id, role, act: c.act, label: M.ACTS[c.act].label, state: c.state, stateLabel: M.STATE_LABEL[c.state], open, city: (world.city(c.city_id) || {}).name || null, court: `Amtsgericht ${(world.city(c.city_id) || {}).name || ''}`.trim(),
    other, claim: cents(c.claim_real), settleCap: cents(M.settleCap(c.claim_real, C)), nextAt: open ? Number(c.step_ms) : null, nextText, offer, actions,
    lawyerMine: !!(role === 'p' ? c.lawyer_p : c.lawyer_d), lawyerOther: !!(role === 'p' ? c.lawyer_d : c.lawyer_p), detectives: role === 'p' ? c.det_p : null, confessed: !!c.confessed,
    strength: role === 'p' ? Math.round(num(c.strength, 0)) : null, strengthBand: role === 'p' ? band(num(c.strength, 0) + num(c.det_p, 0) * 22) : null,
    verdict: c.guilty == null ? null : { guilty: !!c.guilty, level: c.level, plan: plan.map((s) => ({ kind: s.kind, label: M.SANCTIONS[s.kind], real: s.real ? cents(s.real) : null, hours: s.hours || null })), appealUntil: c.state === 'verdict' ? Number(c.step_ms) : null, canAppeal, appeal: !!c.appeal_used, round: c.round },
    summary: c.summary, createdAt: Number(c.created_ms), endedAt: c.ended_ms ? Number(c.ended_ms) : null, timeline, costs: { lawyer: c.state === 'appeal' ? costs.lawyerAppeal : costs.lawyer, detective: costs.detective, appeal: costs.appeal, bribe: costs.bribe },
  };
}

/** Verdächtige für die Anzeige: Konten aus der Stadt des Vorfalls (nur sichtbare Profile), ohne Namen des echten Täters zu verraten. */
async function suspects(userId, q) {
  const text = String(q || '').trim().slice(0, 40); if (text.length < 2) return [];
  const like = `%${text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return (await db.query("SELECT ps.user_id id, ps.name, ps.username, ps.city_id FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE u.banned = 0 AND u.social_public = 1 AND ps.status = 'alive' AND ps.user_id <> ? AND (ps.name LIKE ? OR ps.username LIKE ?) ORDER BY ps.name LIMIT 8", [userId, like, like])).map((r) => ({ id: r.id, name: r.name, username: r.username }));
}

/* ============================================================================================
   Bots: verhalten sich wie Spieler (erstatten Anzeige, verteidigen sich, vergleichen sich)
   ============================================================================================ */
async function botRound(userId, rnd = Math.random) {
  if (!on()) return;
  const C = cfg();
  await settleDetectives(Date.now(), userId).catch(() => {});
  // Opfer: Anzeige gegen bekannten Täter oder Verdächtigen, wenn die Beweislage reicht
  const evs = await db.query("SELECT * FROM court_evidence WHERE victim_id = ? AND status = 'open' AND case_id IS NULL AND expires_ms > ? ORDER BY id DESC LIMIT 5", [userId, Date.now()]);
  for (const e of evs) {
    if (rnd() > 0.25) continue;
    const cur = M.currentStrength(e, Date.now(), C, pol().effects(e.city_id).limitation);
    const target = e.known ? e.offender_id : (e.suspect_conf >= 55 ? e.suspect_id : null);
    if (cur >= num((C.complaint || {}).minStrength, 15) + 5 && target) { try { await file(userId, { evidenceId: e.id, defendantId: target }); } catch (_) { /* Geld, Limits */ } break; }
    if (!target && cur >= 20 && e.det_n < 1 && rnd() < 0.4) { try { await evidenceAction(userId, e.id, 'detective'); } catch (_) { /* Geld */ } break; }
  }
  // Beklagter / Kläger: Anwalt, Vergleich
  const cs = await db.query("SELECT * FROM court_cases WHERE (plaintiff_id = ? OR defendant_id = ?) AND state IN ('filed','investigation','hearing') ORDER BY id LIMIT 4", [userId, userId]);
  for (const c of cs) {
    try {
      const me = c.plaintiff_id === userId ? 'p' : 'd';
      if (c.offer_real != null && c.offer_by && c.offer_by !== userId) {
        if (rnd() < 0.45) await respond(userId, c.id, c.offer_real <= c.claim_real * 1.2 + 1 ? 'accept' : 'decline');
        continue;
      }
      if (me === 'd' && !c.lawyer_d && rnd() < 0.3) { await respond(userId, c.id, 'lawyer'); continue; }
      if (me === 'd' && c.offer_real == null && c.claim_real > 0 && rnd() < 0.2) { const real = Math.round(c.claim_real * (0.6 + rnd() * 0.3)); const p = await service.peek(userId); const idx = idxOf(p.w, p.state); await respond(userId, c.id, 'offer', { amount: Math.round(real * idx) }); continue; }
      if (me === 'p' && !c.lawyer_p && rnd() < 0.15) await respond(userId, c.id, 'lawyer');
    } catch (_) { /* Geld, Stand */ }
  }
}

function start() {
  const run = () => tick().catch((e) => log.warn(`[gericht] ${e.message}`));
  setInterval(run, 60000).unref();
  setInterval(() => { prune().catch((e) => log.warn(`[gericht] ${e.message}`)); }, 6 * 3600000).unref();
  pol().start();
}

module.exports = {
  trace, evidenceAction, file, respond, advanceCase, tick, prune, settleDetectives, reconcile, assertFree, jailed, amnesty, overview, suspects, botRound, start, invalidate, event,
  computeVerdict, finalize, settle, step, band,
};
