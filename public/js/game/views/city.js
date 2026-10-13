import { html, raw, icon, infoBtn, api, on, mount, toast, esc } from '../ui.js';
import { cityJourney, cityJourneyShortcut, bindCityJourney } from '../city-journey.js';
import { rememberCity } from '../city-context.js';
import { businessLife } from '../business-life.js';
import { isV2 } from '../design.js';
import { createCityCamera } from '../city-camera.js';
import { buildAerial } from '../aerial.js';
import { gameHour, seasonAt, dayPhaseLabel, MONTHS_DE } from '../atmosphere.js';
import { directorySkeleton, bindDirectory } from '../directory.js';
import { econSkeleton, bindEcon } from '../economy.js';

// Prüfhilfe: <html data-city-hour="13" data-city-doy="200"> friert Tageszeit/Jahreszeit der 3D-Stadt und der Innenräume für Tests ein.
const testNum = (name) => { const o = document.documentElement.dataset[name]; return o !== undefined && o !== '' && Number.isFinite(Number(o)) ? Number(o) : null; };
const cityHour = (ctx) => testNum('cityHour') ?? gameHour(ctx.view.clock, ctx.__viewAt);

export default {
  id: 'city', label: 'Stadt', icon: 'building-2',
  async load(ctx) { return api('GET', `/api/city?cityId=${ctx.ui.cityId || ctx.view.city.id}`); },
  render(ctx, data) {
    const v = ctx.view; const c = data.city;
    const a = buildAerial({ cityId: c.id, name: c.name, tier: c.tier, era: v.date.eraKey, buildings: data.buildings, aerial: c.aerial, selected: ctx.ui.cityBuilding, ...(isV2() ? { hour: Math.floor(cityHour(ctx)) } : {}) });
    ctx.ui._aerial = a;
    const own = data.buildings.filter((b) => b.own); const pub = data.buildings.filter((b) => !b.own);
    const row = (b) => html`<button class="bl-item ${b.own ? 'own' : ''}" data-focus="${b.key}"><span class="bl-ic">${icon(b.icon || 'landmark')}</span><span class="grow">${b.name}</span>${b.tasks.some((t) => t.ready) ? html`<i class="rdy" title="Aufgabe verfügbar"></i>` : ''}</button>`;
    return html`
    <div class="panel-head"><div><h2>${c.name}</h2><p>${c.state} · Luftansicht – ziehen zum Verschieben, Mausrad zum Zoomen, Gebäude auswählen und die Stadt entdecken.</p></div>
      <div class="row">${data.here ? html`<span class="chip good">${icon('map-pin')} Hier wohnst du</span>` : html`<span class="chip warn">${icon('eye')} Du bist nicht vor Ort</span>`}<button class="btn sm sim-city-only" data-city-paper>${icon('newspaper')} Zeitung aus ${c.name}</button><button class="btn sm" data-go="map">${icon('map')} Zur Karte</button>
      ${infoBtn(['Das ist deine Stadt aus der Vogelperspektive. Öffentliche Orte wie Rathaus, Markthalle oder Bahnhof sind immer da – dazu alles, was dir selbst gehört.', 'In jedem Gebäude findest du Aufgaben und Möglichkeiten. Aufgaben bringen zusätzliche EFS und kleine Vorteile. Interaktionen sind nur in der Stadt möglich, in der du wohnst.', 'Klicke ein Gebäude an, schau dich um (ziehen zum Drehen) und klicke auf leuchtende Dinge.'], 'Stadtansicht')}</div></div>
    ${data.here ? '' : html`<div class="alert info">${icon('info')}<div>Du erkundest ${c.name}. Dein Wohnort bleibt ${v.city.name}. Aufgaben und Einkäufe sind dort möglich; umziehen kannst du über die Karte.</div></div>`}
    ${cityJourneyShortcut(ctx, data)}
    <div class="city-layout">
      <section class="card aerial-card"><div class="map-tools"><button class="btn sm" id="azin" aria-label="Vergrößern">${icon('plus')}</button><button class="btn sm" id="azout" aria-label="Verkleinern">${icon('minus')}</button><button class="btn sm" id="azreset" aria-label="Zentrieren">${icon('refresh-cw')}</button><button class="btn sm sim-city-only" id="azfull" aria-pressed="false" aria-label="Vollbild" title="Vollbild">${icon('maximize')}</button></div>
        <div class="sim-city-only city-view-mode" role="group" aria-label="Stadtdarstellung"><button data-city-view="2d" aria-pressed="true">2D-Karte</button><button data-city-view="3d" aria-pressed="false">3D-Stadt</button></div><div id="city3dHost" hidden></div><div id="citySceneStatus" role="status" hidden></div><div id="aerialHost">${raw(a.svg)}</div>
        <div class="aerial-hint small dim">${icon('hand-coins')} Goldene Umrandung = dein Besitz</div></section>
      <aside class="card bl-panel">${cityJourney(ctx, data)}
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
    data.visualHour = ctx.ui._aerial.hour; ctx.ui.cityData = data;
    if (isV2()) rememberCity(ctx, data.city.id);
    let scene3d=null, sceneVersion=0, disposed=false;
    const svg = root.querySelector('svg.aerial'); const spots = ctx.ui._aerial.spots;
    const saved = ctx.ui.cityBox?.id === data.city.id ? ctx.ui.cityBox.box : null;
    const camera = createCityCamera(svg, { saved, smooth: isV2, onChange: box => { ctx.ui.cityBox = { id:data.city.id, box }; } });
    const own = data.buildings.find(b => b.residence) || data.buildings.find(b => b.own && spots[b.key]) || data.buildings.find(b => b.type === 'rathaus');
    const centerOn = (x,y,level) => camera.center(x,y,level);
    if (!saved && own && spots[own.key]) camera.center(spots[own.key].x, spots[own.key].y, 2.1, true);
    root.querySelector('#azin').onclick = () => scene3d ? scene3d.zoom(.8) : camera.zoom(.8);
    root.querySelector('#azout').onclick = () => scene3d ? scene3d.zoom(1.25) : camera.zoom(1.25);
    root.querySelector('#azreset').onclick = () => { if (scene3d) { scene3d.reset(); return; } if (own && spots[own.key]) centerOn(spots[own.key].x,spots[own.key].y,2.1); };
    const stage = root.querySelector('.aerial-card'), fullBtn = root.querySelector('#azfull'); let full = false;
    const setFull = (on) => { full = on; stage.classList.toggle('is-full', on); document.body.classList.toggle('city-fullscreen', on); fullBtn.setAttribute('aria-pressed', String(on)); fullBtn.setAttribute('aria-label', on ? 'Vollbild beenden' : 'Vollbild'); fullBtn.title = on ? 'Vollbild beenden (Esc)' : 'Vollbild'; fullBtn.innerHTML = icon(on ? 'minimize' : 'maximize').__raw; };
    fullBtn.onclick = () => { setFull(!full); (scene3d ? root.querySelector('#city3dHost canvas') : null)?.focus({ preventScroll:true }); };
    const onFullKey = (e) => { if (full && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setFull(false); fullBtn.focus({ preventScroll:true }); } };
    document.addEventListener('keydown', onFullKey, true);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const vis = () => { if (document.hidden || media.matches || document.documentElement.dataset.motion === 'off') svg.pauseAnimations?.(); else svg.unpauseAnimations?.(); };
    document.addEventListener('visibilitychange', vis); media.addEventListener('change',vis);
    const motion = new MutationObserver(vis); motion.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']}); vis();
    root.__dispose = () => { disposed=true; document.removeEventListener('keydown', onFullKey, true); document.body.classList.remove('city-fullscreen'); sceneVersion++; scene3d?.dispose(); designObserver.disconnect(); camera.dispose(); motion.disconnect(); media.removeEventListener('change',vis); document.removeEventListener('visibilitychange',vis); };
    const hourOf = () => cityHour(ctx), testDoy = () => testNum('cityDoy');
    let entering = false; const host3d = root.querySelector('#city3dHost');
    const KIND = { rathaus:'Ämter, Wahlen & Umzug', bahnhof:'Reisen & Umzug', markt:'Lebensmittel & Handel', arzt:'Gesundheit & Vorsorge', schule:'Schule & Kinder', zeitung:'Nachrichten, Stellen & Wohnungen', lotto:'Lotto', pension:'Wohnen auf Zeit', spielbank:'Spielbank', home:'Wohnen', biz:'Dein Betrieb', work:'Dein Arbeitsplatz' };
    const describe = (key) => { const b = data.buildings.find(x => x.key === key); if (!b) return null; const ready = b.tasks.filter(t => t.ready && !t.blocked).length; return { title:b.name, kind:b.own ? 'DEIN BESITZ' : 'ÖFFENTLICHER ORT', lines:[KIND[b.type] || '', !data.here ? 'Du bist nicht in dieser Stadt: nur ansehen.' : ready ? `${ready} Aufgabe${ready === 1 ? '' : 'n'} bereit` : 'Keine Aufgabe bereit', 'Klicken = auswählen · Doppelklick = betreten'].filter(Boolean) }; };
    const enter = async (key) => {
      const b = data.buildings.find((x) => x.key === key); if (!b) return;
      ctx.ui.cityBuilding = key;
      if (entering || document.querySelector('.interior')) return;
      entering = true;
      try {
        const loading = import('../interior.js');
        if (scene3d) { host3d.classList.add('city-entering'); await Promise.all([scene3d.flyTo(key), loading]); }
        const { openInterior } = await loading; if (root.isConnected) await openInterior(ctx, b, data);
      }
      catch (e) { toast(e.message, 'bad'); } finally { entering = false; host3d.classList.remove('city-entering'); }
    };
    const select = (key) => {
      if (!isV2()) return enter(key);
      const b = data.buildings.find(x => x.key === key); if (!b) return;
      ctx.ui.cityBuilding = key;
      scene3d?.focus(key);
      svg.querySelectorAll('.bld').forEach(el => el.classList.toggle('sel', el.dataset.key === key));
      root.querySelectorAll('[data-focus]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.focus === key)));
      const ready = b.tasks.filter(t => t.ready && !t.blocked).length;
      const life = b.type === 'biz' ? businessLife(ctx.view.companies.find(c => c.id === b.ref)) : null;
      mount(root.querySelector('#citySelection'), html`<div class="city-selection-icon">${icon(b.icon || 'landmark')}</div><span class="city-eyebrow">${b.own ? 'DEIN BESITZ' : 'ÖFFENTLICHER ORT'}</span><h3>${b.name}</h3><p>${!data.here ? 'Du besuchst diese Stadt. Aktionen sind an deinem Wohnort verfügbar.' : ready ? `${ready} Aufgaben für dich bereit` : 'Entdecke die Möglichkeiten in diesem Gebäude.'}</p><button class="btn primary" id="cityEnter">${icon('arrow-right')} Gebäude betreten</button>`);
      root.querySelector('#cityEnter').onclick = () => enter(key);
      if (life) {
        const summary = document.createElement('p'); summary.className = `city-business-status ${life.tone}`;
        summary.textContent = `${life.status} · ${life.why}`;
        root.querySelector('#cityEnter').before(summary);
      }
      root.querySelector('.bl-panel').scrollTop = 0;
      if (matchMedia('(max-width:650px) and (orientation:portrait)').matches) root.querySelector('#citySelection').scrollIntoView({ block:'nearest', behavior:media.matches || document.documentElement.dataset.motion === 'off' ? 'instant' : 'smooth' });
    };
    const switchScene = async (mode, remember = true) => {
      const version=++sceneVersion, host=root.querySelector('#city3dHost'), status=root.querySelector('#citySceneStatus');
      scene3d?.dispose();scene3d=null;if(remember)ctx.ui.cityScene=mode;
      const three=mode==='3d' && isV2(); host.hidden=!three;root.querySelector('#aerialHost').hidden=three;
      root.querySelector('.aerial-card').dataset.scene=three?'3d':'2d';
      root.querySelector('.panel-head p').textContent = `${data.city.state} · ${three ? '3D-Stadt – ziehen zum Drehen, Mausrad zum Zoomen, Gebäude oder Marker auswählen.' : 'Luftansicht – ziehen zum Verschieben, Mausrad zum Zoomen, Gebäude auswählen und die Stadt entdecken.'}`;
      root.querySelectorAll('[data-city-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.cityView===(three?'3d':'2d'))));
      status.hidden=!three;if(!three)return; status.textContent='Deine Stadt entsteht in 3D …';
      let created;
      try {
        const {createCity3D}=await import('../city-3d.js');
        if(disposed || version!==sceneVersion)return;
        created=await createCity3D(host,ctx.ui._aerial,{onSelect:select,onEnter:enter,describe,selected:ctx.ui.cityBuilding,reduced:()=>media.matches || document.documentElement.dataset.motion==='off',getHour:hourOf,era:ctx.view.date.eraKey,doy:testDoy() ?? ctx.view.date.doy,cityId:data.city.id});
        if(disposed || version!==sceneVersion){created?.dispose();return;}
        scene3d=created;status.hidden=true; host.__city3d = created; // Prüf-/Leistungshilfe: host.__city3d.stats()
      } catch(e) { if(disposed || version!==sceneVersion)return; await switchScene('2d');status.textContent=e.message;status.hidden=false; }
    };
    root.querySelectorAll('[data-city-view]').forEach(el=>{el.onclick=()=>switchScene(el.dataset.cityView);});
    const designObserver=new MutationObserver(()=>{if(isV2()){rememberCity(ctx,data.city.id);switchScene(ctx.ui.cityScene ?? '3d');}else switchScene('2d',false);});designObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-game-design']});
    if(isV2() && ctx.ui.cityScene !== '2d')switchScene('3d');
    if(isV2() && data.buildings.some(b=>b.key===ctx.ui.cityBuilding)) select(ctx.ui.cityBuilding);
    root.querySelector('#citySearch').oninput = e => {
      const q = e.target.value.trim().toLocaleLowerCase('de'); let count = 0;
      root.querySelectorAll('.bl-item').forEach(el => { el.hidden = !el.textContent.toLocaleLowerCase('de').includes(q); if (!el.hidden) count++; });
      root.querySelector('.city-no-results').hidden = count > 0;
    };
    on(svg, 'click', '.bld', (e, t) => { if (!camera.dragged) select(t.dataset.key); });
    on(svg, 'keydown', '.bld', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(t.dataset.key); } });
    on(root, 'click', '[data-focus]', (e, t) => { const s = spots[t.dataset.focus]; if (s) centerOn(s.x, s.y, 2.4); select(t.dataset.focus); });
    bindCityJourney(root, ctx);
    bindEcon(root, ctx, data.city.id);
    bindDirectory(root, ctx, data.city.id);
    root.querySelector('[data-city-paper]').onclick = () => { ctx.ui.newsCity = data.city.id; ctx.ui.newsTab = 'news'; ctx.go('newspaper'); };
    on(root, 'click', '[data-go]', (e, t) => ctx.go(t.dataset.go));
    on(root, 'click', '[data-plaza]', () => { ctx.ui.soc = ctx.ui.soc || {}; ctx.ui.soc.tab = 'plaza'; ctx.go('social'); });
  },
};
