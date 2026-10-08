'use strict';
/** Netzwerk-Härtung: Proxy-Vertrauen (IP-Erkennung), Server-Zeitlimits gegen langsame Angreifer, Antwort-Frist je Anfrage. */

/**
 * Wie viele Proxys stehen vor der App? Hostinger: ein Proxy (LiteSpeed) → 1; dann gilt die letzte Adresse in X-Forwarded-For
 * (vom Proxy selbst angehängt), vorangestellte, vom Client gefälschte Einträge werden ignoriert.
 * TP_TRUST_PROXY: Zahl (Anzahl Proxys, 0 = keinem vertrauen, etwa bei direktem Zugriff ohne Proxy) oder Express-Liste („loopback, 10.0.0.0/8“).
 */
function trustProxySetting(v = process.env.TP_TRUST_PROXY) {
  if (v === undefined || String(v).trim() === '') return 1;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Math.min(10, Number(s));
  if (s.toLowerCase() === 'false' || s.toLowerCase() === 'off') return 0;
  return s;
}

function hardenServer(server) {
  server.headersTimeout = 20000; // Kopfzeilen müssen in 20 s komplett sein (Slowloris)
  server.requestTimeout = 120000; // ganzer Request-Body (größter legitimer Upload: Admin-Backup)
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
  return server;
}

/** Antwort-Frist: hängt ein Handler (z. B. blockierte DB), bekommt der Client nach `ms` ein 503 statt ewig zu warten. SSE ist ausgenommen. */
function deadline(ms = 45000) {
  return (req, res, next) => {
    if (req.path === '/api/live') return next();
    const t = setTimeout(() => {
      if (!res.headersSent) { res.status(503).set('Retry-After', '10'); if (req.path.startsWith('/api/')) res.json({ ok: false, error: 'Der Server antwortet gerade zu langsam – bitte gleich noch einmal versuchen.' }); else res.type('text').send('Der Server antwortet gerade zu langsam.'); }
    }, ms);
    if (t.unref) t.unref();
    const done = () => clearTimeout(t);
    res.on('finish', done); res.on('close', done);
    next();
  };
}

module.exports = { trustProxySetting, hardenServer, deadline };
