'use strict';
/**
 * Live-Verbindung (Server-Sent Events): Der Server meldet dem Browser, dass sich etwas geändert hat
 * (neuer Brief, Chat, Markt, Börse, Tagesblatt …); der Browser lädt dann nur den betroffenen Teil still nach.
 * Es werden keine Inhalte gesendet, nur Stichworte – Daten kommen weiter über die normalen, geprüften API-Routen.
 */
const clients = new Map(); // userId -> Set<res>
const perIp = new Map(); // ip -> Anzahl offener Verbindungen
let count = 0;
/** Grenzen gegen erschöpfte Sockets/Speicher (Hostinger: wenige Prozesse, begrenzte Dateihandles). Über Umgebung änderbar. */
const LIMITS = {
  perUser: 5,
  perIp: Number(process.env.TP_SSE_PER_IP) || 15,
  total: Number(process.env.TP_SSE_TOTAL) || 800,
  maxAgeMs: 20 * 60 * 1000, // danach schließt der Server; EventSource verbindet sich selbstständig neu (retry)
};

/** Darf noch eine Verbindung aufgebaut werden? */
function admit(ip) {
  if (count >= LIMITS.total) return false;
  if ((perIp.get(ip) || 0) >= LIMITS.perIp) return false;
  return true;
}

function add(userId, res, ip = '') {
  if (!clients.has(userId)) clients.set(userId, new Set());
  const set = clients.get(userId);
  if (set.size >= LIMITS.perUser) { const old = set.values().next().value; try { old.end(); } catch (_) { /* weg */ } set.delete(old); }
  set.add(res); count++;
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  let gone = false;
  res.on('close', () => {
    if (gone) return; gone = true;
    set.delete(res); count--; if (!set.size && clients.get(userId) === set) clients.delete(userId);
    const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
  });
}

function send(res, type, data) { try { res.write(`event: ${type}\ndata: ${JSON.stringify(data || {})}\n\n`); if (res.flush) res.flush(); } catch (_) { /* Verbindung weg */ } }

/** An einen Spieler (userId) oder alle (null) melden. */
function publish(type, data, userId = null) {
  if (!count) return;
  if (userId != null) { for (const r of clients.get(userId) || []) send(r, type, data); return; }
  for (const set of clients.values()) for (const r of set) send(r, type, data);
}

function connect(req, res) {
  const ip = String(req.ip || '');
  if (!admit(ip)) { res.set('Retry-After', '30'); return res.status(503).json({ ok: false, error: 'Live-Verbindung gerade nicht möglich – bitte später erneut versuchen.' }); }
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  if (req.socket && req.socket.setTimeout) req.socket.setTimeout(0);
  add(req.user.id, res, ip);
  send(res, 'hello', {});
  const hb = setInterval(() => { try { res.write(': ♥\n\n'); if (res.flush) res.flush(); } catch (_) { clearInterval(hb); } }, 25000);
  const ttl = setTimeout(() => { try { res.end(); } catch (_) { /* weg */ } }, LIMITS.maxAgeMs);
  if (ttl.unref) ttl.unref();
  res.on('close', () => { clearInterval(hb); clearTimeout(ttl); });
}

/** Funktionen einwickeln: Nach jedem erfolgreichen Aufruf wird `type` an alle gemeldet. */
function announce(obj, names, type) {
  for (const n of names) {
    const f = obj[n]; if (typeof f !== 'function') continue;
    obj[n] = async (...a) => { const r = await f(...a); publish(type, {}); return r; };
  }
  return obj;
}

const stats = () => ({ connections: count, users: clients.size, ips: perIp.size });

module.exports = { announce, publish, connect, stats, admit, add, LIMITS };
