'use strict';
/**
 * Betrieb 2.0 – Datenbankseite: Vorfälle der Betriebe (Brand, abgewehrter Einbruch …) werden im Spielstand vorgemerkt
 * (`state.pending.ops`, siehe src/game/operations.js) und hier in `service.withCharacter` VOR dem Speichern genau einmal ins Protokoll (`ops_log`)
 * und – bei einem Brand – ins Tagesblatt geschrieben; danach ist die Liste leer. Namen stehen nur bei Spielern mit sichtbarem Profil im Tagesblatt.
 * Geld wird hier nicht bewegt: Schaden, Versicherung und Prämien laufen im Spielstand des Besitzers, Bauaufträge über `contractors.flush`.
 */
const db = require('../db');
const log = require('./log');

/** Vorgemerkte Vorfälle ins Protokoll schreiben; leert die Liste im Spielstand (muss VOR saveCharacter laufen). */
async function flush(conn, user, state, world) {
  const q = state && state.pending && state.pending.ops;
  if (!q || !q.length) return;
  state.pending.ops = [];
  const live = require('./live');
  const city = (id) => (world && world.city ? (world.city(id) || {}).name : '') || 'der Stadt';
  for (const e of q) {
    try {
      await conn.query('INSERT INTO ops_log (user_id, company_id, city_id, kind, real_amount, insured, days, name) VALUES (?,?,?,?,?,?,?,?)',
        [user.id, Number(e.c) || 0, Number(e.city) || 0, String(e.k).slice(0, 12), Math.round(Number(e.real) || 0), e.ins ? 1 : 0, Math.round(Number(e.days) || 0), String(e.name || '').slice(0, 120)]);
      if (e.k === 'fire') {
        const who = user.social_public ? e.name : 'Ein Betrieb';
        await require('./tagesblatt').post('life', 'Betriebsbrand', `${who} in ${city(e.city)} ist abgebrannt. Die Feuerwehr war im Einsatz${e.ins ? '' : ' – eine Versicherung gab es nicht'}.`, e.city, conn);
      }
    } catch (err) { log.warn(`[betrieb] ${err.message}`); }
  }
  if (conn.repAfter) conn.repAfter.push(() => live.publish('biz', {}, user.id)); else live.publish('biz', {}, user.id);
}

/** Letzte Vorfälle für den Admin. */
async function adminLog(limit = 100) {
  return db.query('SELECT l.*, u.username FROM ops_log l JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT ?', [Math.max(1, Math.min(500, Number(limit) || 100))]);
}

module.exports = { flush, adminLog };
