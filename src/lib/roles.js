'use strict';
/** Rollen: Admin (alles) > Co-Admin (fast alles) > Moderator (Spieler, Community, Anti-Cheat, News) > Spieler. */
const RANK = { player: 0, moderator: 1, coadmin: 2, admin: 3 };
const LABEL = { admin: 'Admin', coadmin: 'Co-Admin', moderator: 'Moderator' };
const ROLES = ['player', 'moderator', 'coadmin', 'admin'];

const rank = (r) => RANK[r] || 0;
const isStaff = (r) => rank(r) >= 1;
const label = (r) => LABEL[r] || '';

/* Pfade relativ zu /admin */
const MOD_GET = [/^\/$/, /^\/users(\/|$)/, /^\/characters(\/|$)/, /^\/community(\/|$)/, /^\/anticheat(\/|$)/, /^\/news(\/|$)/, /^\/logs(\/|$)/];
const MOD_POST = [/^\/community\//, /^\/anticheat\/(flag|user)\//, /^\/news(\/|$)/, /^\/users\/\d+\/(ban|unban)$/, /^\/users\/\d+\/kick$/];
const CO_DENY = [/^\/system(\/|$)/, /^\/backup(\/|$)/, /^\/tools(\/|$)/, /^\/settings\/(payments|mail|expert|ads)(\/|$)/, /^\/users\/\d+\/(impersonate|role|password)$/];

/**
 * Express findet Routen ohne Rücksicht auf Groß-/Kleinschreibung, doppelte und abschließende Schrägstriche („/System“, „/users/5/impersonate/“).
 * Die Rechteprüfung muss denselben Pfad sehen – sonst umgeht ein Co-Admin die Sperrliste.
 */
function normalize(path) {
  let p = String(path == null ? '' : path);
  try { p = decodeURIComponent(p); } catch (_) { return null; }
  p = p.toLowerCase().replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** Darf diese Rolle diese Admin-Seite öffnen / diese Aktion ausführen? */
function can(role, method, rawPath) {
  if (role === 'admin') return true;
  const path = normalize(rawPath);
  if (path === null || /[\\\u0000]/.test(path)) return false;
  const m = String(method).toUpperCase();
  if (role === 'coadmin') return !CO_DENY.some((re) => re.test(path));
  if (role === 'moderator') return (m === 'GET' || m === 'HEAD' ? MOD_GET : MOD_POST).some((re) => re.test(path));
  return false;
}

/* Admin-Pfade, die ein bestimmtes Konto („user“) oder den Charakter eines Kontos („char“) als Ziel haben */
const TARGET_PATHS = [
  [/^\/users\/(\d+)(?:\/|$)/, 'user'], [/^\/anticheat\/user\/(\d+)(?:\/|$)/, 'user'], [/^\/community\/user\/(\d+)(?:\/|$)/, 'user'],
  [/^\/rivalry\/ban\/(\d+)(?:\/|$)/, 'user'], [/^\/characters\/(\d+)(?:\/|$)/, 'char'],
];
/** Welches Konto/Charakter betrifft dieser Admin-Pfad? → { kind, id } oder null. */
function targetOf(rawPath) {
  const p = normalize(rawPath);
  if (p === null) return null;
  for (const [re, kind] of TARGET_PATHS) { const m = re.exec(p); if (m) return { kind, id: Number(m[1]) }; }
  return null;
}

module.exports = { RANK, ROLES, LABEL, rank, isStaff, label, can, normalize, targetOf };
