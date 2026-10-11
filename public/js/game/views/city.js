import { html, raw, icon, infoBtn, api, on, mount, toast, esc } from '../ui.js';
import { isV2 } from '../design.js';
import { createCityCamera } from '../city-camera.js';
import { buildAerial } from '../aerial.js';
import { directorySkeleton, bindDirectory } from '../directory.js';
import { econSkeleton, bindEcon } from '../economy.js';

export default {
  id: 'city', label: 'Stadt', icon: 'building-2',
  async load(ctx) { return api('GET', `/api/city?cityId=${ctx.ui.cityId || ctx.view.city.id}`); },
  render(ctx, data) {
    const v = ctx.view; const c = data.city;
    const a = buildAerial({ cityId: c.id, name: c.name, tier: c.tier, era: v.date.eraKey, buildings: data.buildings, aerial: c.aerial, selected: ctx.ui.cityBuilding });
    ctx.ui._aerial = a;
    const own = data.buildings.filter((b) => b.own); const pub = data.buildings.filter((b) => !b.own);
    const row = (b) => html`<button class="bl-item ${b.own ? 'own' : ''}" data-focus="${b.key}"><span class="bl-ic">${icon(b.icon || 'landmark')}</span><span class="grow">${b.name}</span>${b.tasks.some((t) => t.ready) ? html`<i class="rdy" title="Aufgabe verfügbar"></i>` : ''}</button>`;
    return html`
    <div class="panel-head"><div><h2>${c.name}</h2><p>${c.state} · Luftansicht – ziehen zum Verschieben, Mausrad zum Zoomen, Gebäude auswählen und die Stadt entdecken.</p></div>
      <div class="row">${data.here ? html`<span class="chip good">${icon('map-pin')} Hier wohnst du</span>` : html`<span class="chip warn">${icon('eye')} Du bist nicht vor Ort</span>`}<button class="btn sm" data-go="map">${icon('map')} Zur Karte</button>
      ${infoBtn(['Das ist deine Stadt aus der Vogelperspektive. Öffentliche Orte wie Rathaus, Markthalle oder Bahnhof sind immer da – dazu alles, was dir selbst gehört.', 'In jedem Gebäude findest du Aufgaben und Möglichkeiten. Aufgaben bringen zusätzliche EFS und kleine Vorteile. Interaktionen sind nur in der Stadt möglich, in der du wohnst.', 'Klicke ein Gebäude an, schau dich um (ziehen zum Drehen) und klicke auf leuchtende Dinge.'], 'Stadtansicht')}</div></div>
    ${data.here ? '' : html`<div class="alert info">${icon('info')}<div>Du siehst ${c.name} nur von oben. Aufgaben und Einkäufe sind nur in deinem Wohnort möglich – ziehe dafür um (Karte).</div></div>`}
    <div class="city-layout">
      <section class="card aerial-card"><div class="map-tools"><button class="btn sm" id="azin" aria-label="Vergrößern">${icon('plus')}</button><button class="btn sm" id="azout" aria-label="Verkleinern">${icon('minus')}</button><button class="btn sm" id="azreset" aria-label="Zentrieren">${icon('refresh-cw')}</button></div>
        <div id="aerialHost">${raw(a.svg)}</div>
        <div class="aerial-hint small dim">${icon('hand-coins')} Goldene Umrandung = dein Besitz</div></section>
      <aside class="card bl-panel">
        <div class="sim-city-only city-catalog-head"><span class="city-eyebrow">DEINE STADT</span><h3>Orte entdecken</h3><label class="sr" for="citySearch">Gebäude suchen</label><input id="citySearch" type="search" placeholder="Gebäude suchen …" autocomplete="off"></div>
        <div class="sim-city-only" id="citySelection" aria-live="polite"></div>
        <p class="sim-city-only city-no-results" hidden>Kein Gebäude gefunden.</p>
        ${own.length ? html`<div class="card-title">${icon('castle')} Dein Besitz &amp; Arbeitsplatz</div><div class="bl-list">${own.map(row)}</div>` : ''}
        <div class="card-title" style="margin-top:${own.length ? '1rem' : '0'}">${icon('landmark')} Öffentliche Orte</div><div class="bl-list">${pub.map(row)}</div>
        ${(data.playerFirms || []).length ? html`<div class="card-title" style="margin-top:1rem">${icon('users')} Betriebe anderer Spieler</div><div class="bl-list">${data.playerFirms.slice(0, 6).map((f) => html`<button class="bl-item" data-plaza="1"><span class="bl-ic">${icon('store')}</span><span class="grow" data-i18n-skip>${f.name}<small class="dim"> · ${f.owner}</small></span><span class="chip">besuchen</span></button>`)}</div>` : ''}
      </aside>
    </div>
    ${econSkeleton()}
    ${directorySkeleton(ctx, c.id)}`;
  },
  bind(root, ctx, data) {
    ctx.ui.cityData = data;
    const svg = root.querySelector('svg.aerial'); const spots = ctx.ui._aerial.spots;
    const saved = ctx.ui.cityBox?.id === data.city.id ? ctx.ui.cityBox.box : null;
    const camera = createCityCamera(svg, { saved, smooth: isV2, onChange: box => { ctx.ui.cityBox = { id:data.city.id, box }; } });
    const own = data.buildings.find(b => b.residence) || data.buildings.find(b => b.own && spots[b.key]) || data.buildings.find(b => b.type === 'rathaus');
    const centerOn = (x,y,level) => camera.center(x,y,level);
    if (!saved && own && spots[own.key]) camera.center(spots[own.key].x, spots[own.key].y, 2.1, true);
    root.querySelector('#azin').onclick = () => camera.zoom(.8);
    root.querySelector('#azout').onclick = () => camera.zoom(1.25);
    root.querySelector('#azreset').onclick = () => { if (own && spots[own.key]) centerOn(spots[own.key].x,spots[own.key].y,2.1); };
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const vis = () => { if (document.hidden || media.matches || document.documentElement.dataset.motion === 'off') svg.pauseAnimations?.(); else svg.unpauseAnimations?.(); };
    document.addEventListener('visibilitychange', vis); media.addEventListener('change',vis);
    const motion = new MutationObserver(vis); motion.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']}); vis();
    root.__dispose = () => { camera.dispose(); motion.disconnect(); media.removeEventListener('change',vis); document.removeEventListener('visibilitychange',vis); };
    let entering = false;
    const enter = async (key) => {
      const b = data.buildings.find((x) => x.key === key); if (!b) return;
      ctx.ui.cityBuilding = key;
      if (entering || document.querySelector('.interior')) return;
      entering = true;
      try { const { openInterior } = await import('../interior.js'); if (root.isConnected) await openInterior(ctx, b, data); }
      catch (e) { toast(e.message, 'bad'); } finally { entering = false; }
    };
    const select = (key) => {
      if (!isV2()) return enter(key);
      const b = data.buildings.find(x => x.key === key); if (!b) return;
      ctx.ui.cityBuilding = key;
      svg.querySelectorAll('.bld').forEach(el => el.classList.toggle('sel', el.dataset.key === key));
      root.querySelectorAll('[data-focus]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.focus === key)));
      const ready = b.tasks.filter(t => t.ready && !t.blocked).length;
      mount(root.querySelector('#citySelection'), html`<div class="city-selection-icon">${icon(b.icon || 'landmark')}</div><span class="city-eyebrow">${b.own ? 'DEIN BESITZ' : 'ÖFFENTLICHER ORT'}</span><h3>${b.name}</h3><p>${!data.here ? 'Du besuchst diese Stadt. Aktionen sind an deinem Wohnort verfügbar.' : ready ? `${ready} Aufgaben für dich bereit` : 'Entdecke die Möglichkeiten in diesem Gebäude.'}</p><button class="btn primary" id="cityEnter">${icon('arrow-right')} Gebäude betreten</button>`);
      root.querySelector('#cityEnter').onclick = () => enter(key);
      root.querySelector('.bl-panel').scrollTop = 0;
      if (matchMedia('(max-width:650px) and (orientation:portrait)').matches) root.querySelector('#citySelection').scrollIntoView({ block:'nearest', behavior:media.matches || document.documentElement.dataset.motion === 'off' ? 'instant' : 'smooth' });
    };
    root.querySelector('#citySearch').oninput = e => {
      const q = e.target.value.trim().toLocaleLowerCase('de'); let count = 0;
      root.querySelectorAll('.bl-item').forEach(el => { el.hidden = !el.textContent.toLocaleLowerCase('de').includes(q); if (!el.hidden) count++; });
      root.querySelector('.city-no-results').hidden = count > 0;
    };
    on(svg, 'click', '.bld', (e, t) => { if (!camera.dragged) select(t.dataset.key); });
    on(svg, 'keydown', '.bld', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(t.dataset.key); } });
    on(root, 'click', '[data-focus]', (e, t) => { const s = spots[t.dataset.focus]; if (s) centerOn(s.x, s.y, 2.4); select(t.dataset.focus); });
    bindEcon(root, ctx, data.city.id);
    bindDirectory(root, ctx, data.city.id);
    on(root, 'click', '[data-go]', (e, t) => ctx.go(t.dataset.go));
    on(root, 'click', '[data-plaza]', () => { ctx.ui.soc = ctx.ui.soc || {}; ctx.ui.soc.tab = 'plaza'; ctx.go('social'); });
  },
};
