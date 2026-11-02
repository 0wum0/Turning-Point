'use strict';
/**
 * Werben, Ehe und Familienunternehmen – Datenbankseite: Hochzeiten, Scheidungen, Übergaben zu Lebzeiten, Traditionsstufen und Familienrang werden im Spielstand
 * vorgemerkt (`state.pending.dyn`, siehe src/game/dynasty.js) und hier in `service.withCharacter` VOR dem Speichern genau einmal ins Protokoll (`dyn_log`)
 * geschrieben; danach ist die Liste leer. Hochzeit, Übergabe und Familienrang ab `dynasty.tagesblattFrom` erscheinen im Tagesblatt (Namen nur bei sichtbarem Profil).
 * Geld wird hier nicht bewegt: Hochzeit, Notar, Ringe, Steuer und Gebühren laufen im Spielstand der Spielfigur; Spielerehen buchen über src/lib/bonds.js.
 */
const db = require('../db');
const log = require('./log');

/** Vorgemerkte Einträge ins Protokoll schreiben; leert die Liste im Spielstand (muss VOR saveCharacter laufen). */
async function flush(conn, user, state, world) {
  const q = state && state.pending && state.pending.dyn;
  if (!q || !q.length) return;
  state.pending.dyn = [];
  const M = require('../game/dynasty');
  const live = require('./live');
  const city = (id) => (world && world.city ? (world.city(id) || {}).name : '') || 'der Stadt';
  const who = user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Bürger';
  for (const e of q) {
    try {
      const kind = String(e.k || '').slice(0, 8);
      const note = String(e.note || '').slice(0, 120);
      await conn.query('INSERT INTO dyn_log (user_id, city_id, kind, lvl, real_amount, note) VALUES (?,?,?,?,?,?)',
        [user.id, Number(e.city) || 0, kind, Math.round(Number(e.lv) || 0), Math.round(Number(e.real) || 0), note]);
      const tb = require('./tagesblatt'); const where = city(e.city);
      if (kind === 'wed' && user.social_public && state.partner) await tb.post('life', 'Hochzeit', `${who} und ${state.partner.name} haben in ${where} geheiratet.`, e.city, conn);
      else if (kind === 'hand') await tb.post('life', 'Nachfolge', user.social_public ? `${who} übergibt „${note}“ in ${where} an die nächste Generation.` : `Ein Bürger übergibt einen Familienbetrieb in ${where} an die nächste Generation.`, e.city, conn); // Namen nur bei sichtbarem Profil
      else if (kind === 'trad') await tb.post('life', 'Traditionsbetrieb', user.social_public ? `„${note}“ in ${where} ist jetzt ein ${M.tradName(Number(e.lv))}.` : `Ein Familienbetrieb in ${where} ist jetzt ein ${M.tradName(Number(e.lv))}.`, e.city, conn);
      else if (kind === 'dyn' && Number(e.lv) >= Number(M.C().dynasty.tagesblattFrom || 3) && Number(e.lv) > Number(e.from || 0) && user.social_public) await tb.post('life', 'Familie', `Die Familie ${state.person.last} gilt in ${where} jetzt als „${note}“.`, e.city, conn);
    } catch (err) { log.warn(`[familie] ${err.message}`); }
  }
  if (conn.repAfter) conn.repAfter.push(() => live.publish('family', {}, user.id)); else live.publish('family', {}, user.id);
}

/** Familienrang ins öffentliche Profil (Rangliste „Dynastie“, Verzeichnis). Wird mit den Statistiken geschrieben. */
async function publish(conn, user, state) {
  if (!state || !state.fam) return;
  try { await conn.query('UPDATE player_stats SET dyn_pts = ?, dyn_lv = ? WHERE user_id = ?', [Math.round(state.fam.dyn.pts * 10), state.fam.dyn.lv, user.id]); } catch (e) { log.warn(`[familie] Profil: ${e.message}`); }
}

/** Letzte Einträge für den Admin. */
async function adminLog(limit = 100) {
  return db.query('SELECT l.*, u.username FROM dyn_log l JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT ?', [Math.max(1, Math.min(500, Number(limit) || 100))]);
}

module.exports = { flush, publish, adminLog };
