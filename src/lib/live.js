'use strict';
/**
 * Live-Verbindung (Server-Sent Events): Der Server meldet dem Browser, dass sich etwas geändert hat
 * (neuer Brief, Chat, Markt, Börse, Tagesblatt …); der Browser lädt dann nur den betroffenen Teil still nach.
 * Es werden keine Inhalte gesendet, nur Stichworte – Daten kommen weiter über die normalen, geprüften API-Routen.
 */
const clients = new Map(); // userId -> Set<res>
let count = 0;

function add(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  const set = clients.get(userId);
  if (set.size >= 5) { const old = set.values().next().value; try { old.end(); } catch (_) { /* weg */ } set.delete(old); }
  set.add(res); count++;
  res.on('close', () => { set.delete(res); count--; if (!set.size) clients.delete(userId); });
}

function send(res, type, data) { try { res.write(`event: ${type}\ndata: ${JSON.stringify(data || {})}\n\n`); if (res.flush) res.flush(); } catch (_) { /* Verbindung weg */ } }

/** An einen Spieler (userId) oder alle (null) melden. */
function publish(type, data, userId = null) {
  if (!count) return;
  if (userId != null) { for (const r of clients.get(userId) || []) send(r, type, data); return; }
  for (const set of clients.values()) for (const r of set) send(r, type, data);
}

function connect(req, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  add(req.user.id, res);
  send(res, 'hello', {});
  const hb = setInterval(() => { try { res.write(': ♥\n\n'); if (res.flush) res.flush(); } catch (_) { clearInterval(hb); } }, 25000);
  res.on('close', () => clearInterval(hb));
}

/** Funktionen einwickeln: Nach jedem erfolgreichen Aufruf wird `type` an alle gemeldet. */
function announce(obj, names, type) {
  for (const n of names) {
    const f = obj[n]; if (typeof f !== 'function') continue;
    obj[n] = async (...a) => { const r = await f(...a); publish(type, {}); return r; };
  }
  return obj;
}

const stats = () => ({ connections: count, users: clients.size });

module.exports = { announce, publish, connect, stats };
