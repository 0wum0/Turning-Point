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

/** Darf diese Rolle diese Admin-Seite öffnen / diese Aktion ausführen? */
function can(role, method, path) {
  if (role === 'admin') return true;
  const m = String(method).toUpperCase();
  if (role === 'coadmin') return !CO_DENY.some((re) => re.test(path));
  if (role === 'moderator') return (m === 'GET' || m === 'HEAD' ? MOD_GET : MOD_POST).some((re) => re.test(path));
  return false;
}

module.exports = { RANK, ROLES, LABEL, rank, isStaff, label, can };
