import {mountPossessions} from './possessions.js';
import map from './views/map.js';
import { html, icon, mount } from './ui.js';
import { isV2 } from './design.js';

let worldPromise = null;
let worldAt = 0;
let pendingHost = null;
let worldKey = '';
const mapKey = (ctx) => JSON.stringify([ctx.view.city.id, ctx.view.date.year, ctx.view.properties.map((p) => [p.id, p.cityId]), ctx.view.companies.map((c) => [c.id, c.cityId])]);
const en = () => document.documentElement.lang === 'en';

export function syncSimulator(ctx) {
  const shell = document.querySelector('.shell'); const page = document.getElementById('page');
  if (!shell || !page) return;
  let frame = document.getElementById('sim-window');
  if (!isV2()) {
    if (frame) { frame.before(page); frame.remove(); }
    const world = document.getElementById('sim-world');
    if (world) { world.__dispose?.(); world.remove(); }
    document.getElementById('sim-map-handle')?.remove();
    document.body.classList.remove('sim-playing'); shell.classList.remove('sim-management'); worldAt = 0;
    return;
  }
  document.body.classList.add('sim-playing');
  if (!frame) {
    const world = document.createElement('div'); world.id = 'sim-world'; world.className = 'sim-world'; world.dataset.route = 'map';
    world.setAttribute('aria-label', en() ? 'Game world' : 'Spielwelt');
    shell.insertBefore(world, page);
    frame = document.createElement('section'); frame.id = 'sim-window'; frame.className = 'sim-window';
    frame.setAttribute('aria-labelledby', 'sim-window-title');
    frame.innerHTML = `<header class="sim-window-bar"><span id="sim-window-title"></span><button class="btn ghost sm" data-sim-close title="${en() ? 'Back to map' : 'Zur Spielwelt'}" aria-label="${en() ? 'Close management' : 'Verwaltung schließen'}">${icon('x').__raw}</button></header><nav id="sim-tabs" class="sim-tabs" aria-label="${en() ? 'Management areas' : 'Verwaltungsbereiche'}"></nav><div class="sim-window-body"><aside id="sim-profile" class="sim-profile"></aside></div><footer class="sim-window-footer"><button class="btn ghost sm" data-sim-close>${icon('chevron-left').__raw} ${en() ? 'Game world' : 'Spielwelt'}</button><span id="sim-breadcrumb"></span><span class="design-beta">BETA</span></footer>`;
    page.before(frame); frame.querySelector('.sim-window-body').append(page);
    frame.querySelectorAll('[data-sim-close]').forEach((b) => { b.onclick = () => ctx.go('map'); });
  }
  const isMap = ctx.route === 'map';
  const returning = isMap && !frame.hidden;
  frame.hidden = isMap;
  const world = document.getElementById('sim-world');
  world.inert = !isMap; world.setAttribute('aria-hidden', String(!isMap));
  shell.classList.toggle('sim-management', !isMap);
  // A failed map fetch never prevents opening a management module.
  ensureWorld(ctx, returning).catch(() => {});
}

export async function ensureWorld(ctx, force = false) {
  const host = document.getElementById('sim-world');
  if (!host || !isV2()) return;
  if (worldPromise) return pendingHost === host ? worldPromise : worldPromise.then(() => ensureWorld(ctx, force));
  const key = mapKey(ctx);
  if (!force && host.querySelector('#germany') && Date.now() - worldAt < 60000 && key === worldKey) return;
  pendingHost = host;
  worldPromise = (async () => {
    try {
      const data = await map.load(ctx);
      if (!host.isConnected || !isV2()) return;
      host.__dispose?.(); mount(host, map.render(ctx, data));
      map.bind(host, ctx, data); const disposeMap=host.__dispose;const disposeNav=mountPossessions(host,ctx,{surface:'map'});host.__dispose=()=>{disposeNav();disposeMap?.();}; worldAt = Date.now(); worldKey = key;
      ctx.ui.simMapData = data;
    } catch (err) {
      if (!host.isConnected) return;
      if (!host.querySelector('#germany')) {
        mount(host, html`<div class="sim-world-error card"><h3>${en() ? 'Map unavailable' : 'Karte nicht geladen'}</h3><p>${err.message}</p><button class="btn primary" data-world-retry>${en() ? 'Retry' : 'Erneut versuchen'}</button></div>`);
        host.querySelector('[data-world-retry]').onclick = () => ensureWorld(ctx, true);
      }
    } finally { worldPromise = null; }
  })();
  return worldPromise;
}

// Escape closes the management frame only when no other dialog/menu consumes it.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || !isV2() || document.querySelector('.modal-backdrop, .sim-utility[open], .interior')) return;
  const close = document.querySelector('#sim-window:not([hidden]) [data-sim-close]');
  if (close) { e.preventDefault(); close.click(); }
});
