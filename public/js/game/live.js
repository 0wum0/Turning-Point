/* Live-Verbindung: Der Server meldet Änderungen (SSE), die Seite lädt nur das Betroffene still nach – ohne Neuladen und ohne Flackern. */
export function startLive(ctx, hooks) {
  if (!window.EventSource || ctx.__live) return;
  let es = null; let timer = 0; let fails = 0;
  const idle = () => document.hidden || document.querySelector('.modal-backdrop') || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
  const soft = () => { clearTimeout(timer); timer = setTimeout(async () => { if (idle()) { timer = setTimeout(soft, 1500); return; } await hooks.softRefresh(); }, 700); };
  const SOFT_ROUTES = { market: ['social', 'city', 'housing', 'business', 'overview'], exchange: ['social', 'business'], directory: ['social', 'city', 'housing'], news: ['overview', 'newspaper'], chat: ['social'], social: ['social', 'overview'] };
  function open() {
    es = new EventSource('/api/live');
    es.addEventListener('hello', () => { fails = 0; });
    for (const type of Object.keys(SOFT_ROUTES)) {
      es.addEventListener(type, () => {
        if (type === 'social' || type === 'chat') hooks.pollSocial();
        if (type === 'chat') window.dispatchEvent(new CustomEvent('tp-live-chat'));
        if (SOFT_ROUTES[type].includes(ctx.route)) soft();
        else if (type === 'market' || type === 'exchange') hooks.refreshHud();
      });
    }
    es.onerror = () => { fails++; if (fails > 6 || es.readyState === 2) { es.close(); setTimeout(open, 30000); fails = 0; } }; // CLOSED = Browser versucht es nicht mehr selbst
  }
  ctx.__live = true; open();
}
