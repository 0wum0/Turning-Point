'use strict';
/**
 * Charakterblatt – Datenbankseite: Käufe, Verkäufe, Dienstleistungen und Rangaufstiege werden im Spielstand vorgemerkt (`state.pending.char`,
 * siehe src/game/character.js) und hier in `service.withCharacter` VOR dem Speichern genau einmal ins Protokoll (`char_log`) geschrieben; danach ist die Liste leer.
 * Rangaufstiege ab `rank.tagesblattFrom` erscheinen im Tagesblatt (Namen nur bei sichtbarem Profil). Geld wird hier nicht bewegt: Kaufpreis, Erlös und
 * laufende Kosten laufen im Spielstand der Spielfigur.
 */
const db = require('../db');
const log = require('./log');

/** Vorgemerkte Einträge ins Protokoll schreiben; leert die Liste im Spielstand (muss VOR saveCharacter laufen). */
async function flush(conn, user, state, world) {
  const q = state && state.pending && state.pending.char;
  if (!q || !q.length) return;
  state.pending.char = [];
  const M = require('../game/character');
  const live = require('./live');
  const city = (id) => (world && world.city ? (world.city(id) || {}).name : '') || 'der Stadt';
  for (const e of q) {
    try {
      const kind = String(e.k || '').slice(0, 8);
      const note = kind === 'rank' ? String((M.rankLevels()[Number(e.lv) - 1] || {}).name || '').slice(0, 120) : '';
      await conn.query('INSERT INTO char_log (user_id, city_id, kind, slot, lvl, real_amount, note) VALUES (?,?,?,?,?,?,?)',
        [user.id, Number(e.city) || 0, kind, String(e.slot || '').slice(0, 12), Math.round(Number(e.lv) || 0), Math.round(Number(e.real) || 0), note]);
      if (kind === 'rank' && Number(e.lv) >= Number(M.RANK().tagesblattFrom || 5) && Number(e.lv) > Number(e.from || 0)) {
        const who = user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Bürger'; const where = city(e.city);
        await require('./tagesblatt').post('life', 'Gesellschaft', `${who} steigt in ${where} zum Rang „${note}“ auf.`, e.city, conn);
      }
    } catch (err) { log.warn(`[charakter] ${err.message}`); }
  }
  if (conn.repAfter) conn.repAfter.push(() => live.publish('character', {}, user.id)); else live.publish('character', {}, user.id);
}

/** Rang und Auftreten ins öffentliche Profil (Verzeichnis, Profil). Wird mit den Statistiken geschrieben. */
async function publish(conn, user, state) {
  if (!state || !state.char) return;
  const M = require('../game/character');
  try {
    const year = require('../game/calendar').yearOf(state.day, state.startYear);
    await conn.query('UPDATE player_stats SET rank_lv = ?, look = ? WHERE user_id = ?', [state.char.rank.lv, Math.round(M.look(state, year)), user.id]);
  } catch (e) { log.warn(`[charakter] Profil: ${e.message}`); }
}

/** Gesamtbild fürs Wählen/Gericht anderer Konten: Auftreten (0–100) je Konto (eine Abfrage). */
async function looks(ids) {
  const out = new Map(); if (!ids || !ids.length) return out;
  try { const rows = await db.query(`SELECT user_id, look, rank_lv FROM player_stats WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids); for (const r of rows) out.set(r.user_id, { look: Number(r.look) || 0, rank: Number(r.rank_lv) || 1 }); } catch (_) { /* Spalte fehlt noch */ }
  return out;
}

/** Vorteil des Rangs eines Kontos (aus dem veröffentlichten Rang), z. B. 'feeDiscPct' oder 'clubSlots'; ohne Charakterblatt 0. */
async function perkOf(conn, userId, name) {
  const M = require('../game/character'); if (!M.enabled()) return 0;
  try {
    const r = await (conn || db).one('SELECT rank_lv FROM player_stats WHERE user_id = ?', [userId]);
    const list = (M.RANK().perks || {})[name]; if (!r || !Array.isArray(list)) return 0;
    return Number(list[Math.min(7, Math.max(1, Number(r.rank_lv) || 1)) - 1]) || 0;
  } catch (_) { return 0; }
}

/** Letzte Einträge für den Admin. */
async function adminLog(limit = 100) {
  return db.query('SELECT l.*, u.username FROM char_log l JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT ?', [Math.max(1, Math.min(500, Number(limit) || 100))]);
}

module.exports = { flush, publish, looks, perkOf, adminLog };
