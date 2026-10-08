'use strict';
/** Konto-Funktionen nach DSGVO: Datenauskunft/-export (Art. 15, 20) und Löschung (Art. 17). */
const db = require('../db');

const SECRET = new Set(['password_hash', 'verify_token', 'reset_token', 'reset_expires']);
const clean = (row) => { if (!row) return row; const o = {}; for (const k of Object.keys(row)) if (!SECRET.has(k)) o[k] = row[k]; return o; };
const parse = (s) => { try { return JSON.parse(s); } catch (_) { return s; } };

async function safe(sql, params) { try { return await db.query(sql, params); } catch (_) { return []; } }

async function exportData(userId) {
  const user = clean(await db.one('SELECT * FROM users WHERE id = ?', [userId]));
  if (!user) return null;
  if (typeof user.meta === 'string') user.meta = parse(user.meta);
  const chars = (await safe('SELECT * FROM characters WHERE user_id = ? ORDER BY id', [userId])).map((c) => ({ ...c, state: parse(c.state) }));
  return {
    export: { createdAt: new Date().toISOString(), service: 'Turning Point', note: 'Alle Daten, die zu deinem Konto gespeichert sind (ohne Passwort-Hash und Sicherheits-Token).' },
    konto: user,
    charaktere: chars,
    rangliste_profil: await safe('SELECT * FROM player_stats WHERE user_id = ?', [userId]),
    spielerbetriebe: await safe('SELECT * FROM player_firms WHERE user_id = ?', [userId]),
    freundschaften: await safe('SELECT * FROM friendships WHERE user_a = ? OR user_b = ?', [userId, userId]),
    briefe_gesendet: await safe('SELECT id, to_user, kind, subject, body, created_at FROM messages WHERE from_user = ? ORDER BY id', [userId]),
    briefe_empfangen: await safe('SELECT id, from_user, kind, subject, body, created_at, read_at FROM messages WHERE to_user = ? ORDER BY id', [userId]),
    stadtplatz_chat: await safe('SELECT id, city_id, name, text, created_at FROM chat_messages WHERE user_id = ? ORDER BY id', [userId]),
    zeitungsmeldungen: await safe('SELECT * FROM public_news WHERE user_id = ?', [userId]),
    beziehungen: await safe('SELECT * FROM couples WHERE user_a = ? OR user_b = ?', [userId, userId]),
    arbeitsverhaeltnisse: await safe('SELECT * FROM employments WHERE owner_id = ? OR employee_id = ?', [userId, userId]),
    stellenanzeigen: await safe('SELECT * FROM player_jobs WHERE owner_id = ?', [userId]),
    bewerbungen: await safe('SELECT * FROM job_apps WHERE user_id = ?', [userId]),
    ip_adressen: await safe('SELECT * FROM user_ips WHERE user_id = ?', [userId]),
    kaeufe: await safe('SELECT * FROM purchases WHERE user_id = ?', [userId]),
    werbung: await safe('SELECT * FROM ad_claims WHERE user_id = ?', [userId]),
    meldungen_von_dir: await safe('SELECT id, target_user, kind, reason, created_at FROM reports WHERE reporter = ?', [userId]),
    sicherheitsmarkierungen: await safe('SELECT rule, score, status, created_at FROM cheat_flags WHERE user_id = ?', [userId]),
  };
}

/** Löscht das Konto samt Spielständen. Käufe bleiben anonymisiert (Aufbewahrungspflicht), Briefe an andere bleiben ohne Absender. */
async function deleteAccount(userId) {
  await db.query('UPDATE messages SET from_user = NULL WHERE from_user = ?', [userId]);
  await db.query('UPDATE purchases SET user_id = 0 WHERE user_id = ?', [userId]);
  await db.query('UPDATE audit_log SET user_id = NULL WHERE user_id = ?', [userId]);
  await db.query('UPDATE reports SET target_user = NULL WHERE target_user = ?', [userId]);
  await db.query('DELETE FROM reports WHERE reporter = ?', [userId]);
  await db.query('DELETE FROM social_log WHERE from_user = ? OR to_user = ?', [userId, userId]);
  await db.query('DELETE FROM ad_claims WHERE user_id = ?', [userId]);
  await db.query('DELETE FROM users WHERE id = ?', [userId]);
}

/**
 * Einmalig nach dem Update: Reset-/Bestätigungs-Token, die noch im Klartext in der Datenbank stehen, werden durch ihren SHA-256-Hash ersetzt
 * (Links in schon versendeten Mails funktionieren weiter). Danach nutzt der Code ausschließlich Hashes – ein Datenbank-Leck liefert keine nutzbaren Links.
 */
async function hashLegacyTokens() {
  const flag = await db.one("SELECT 1 AS x FROM settings WHERE `key` = 'security.tokens_hashed'");
  if (flag) return false;
  await db.query('UPDATE users SET verify_token = SHA2(verify_token, 256) WHERE verify_token IS NOT NULL');
  await db.query('UPDATE users SET reset_token = SHA2(reset_token, 256) WHERE reset_token IS NOT NULL');
  await db.query("INSERT INTO settings (`key`, value) VALUES ('security.tokens_hashed', 'true') ON DUPLICATE KEY UPDATE value = VALUES(value)");
  return true;
}

module.exports = { exportData, deleteAccount, hashLegacyTokens };
