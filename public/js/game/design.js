import { html, icon, modal, mount, money, signed, num } from './ui.js';
import { sceneFor } from './views/overview.js';

export const isV2 = () => document.documentElement.dataset.gameDesign === 'v2';
const en = () => document.documentElement.lang === 'en';
const text = (de, eng) => en() ? eng : de;

export function openDesignSettings(onChange) {
  const m = modal(html`<h3>${icon('settings')} ${text('Einstellungen', 'Settings')}</h3>
    <p class="dim">${text('Design auswählen. Du kannst jederzeit zurückwechseln.', 'Choose a design. You can switch back at any time.')}</p>
    <fieldset class="design-choices"><legend>${text('Design', 'Design')}</legend>
      <label class="design-choice"><input type="radio" name="game-design" value="classic" ${!isV2() ? 'checked' : ''}>
        <span class="design-preview classic" aria-hidden="true"><i></i><i></i><i></i></span>
        <strong>${text('Bisheriges Design', 'Classic design')}</strong><small>${text('Nachtdruck · Epochenfarben · Seitenmenü', 'Night print · Era colours · Side menu')}</small></label>
      <label class="design-choice"><input type="radio" name="game-design" value="v2" ${isV2() ? 'checked' : ''}>
        <span class="design-preview simulator" aria-hidden="true"><i></i><i></i><i></i></span>
        <strong>Design V2 <span class="design-beta">BETA</span></strong><small>${text('Simulator · Große Karte · Verwaltungsdock', 'Simulator · Large map · Management dock')}</small></label>
    </fieldset>
    <p class="dim small mt" data-design-status role="status">${text('Die Auswahl gilt für diesen Browser auf diesem Gerät. Dein Spielstand bleibt erhalten.', 'The choice applies to this browser on this device. Your save is preserved.')}</p>
    <div class="row end mt"><button class="btn primary" data-close="1">${text('Fertig', 'Done')}</button></div>`);
  m.el.addEventListener('change', (event) => {
    if (!event.target.matches('[name="game-design"]')) return;
    const value = event.target.value === 'v2' ? 'v2' : 'classic';
    document.documentElement.dataset.gameDesign = value;
    let saved = true;
    try { localStorage.setItem('tp-game-design', value); } catch (_) { saved = false; }
    m.el.querySelector('[data-design-status]').textContent = saved
      ? text('Design gespeichert. Du kannst jederzeit zurückwechseln.', 'Design saved. You can switch back at any time.')
      : text('Design für diese Sitzung aktiv. Der Browser erlaubt kein Speichern.', 'Design active for this session. Browser storage is unavailable.');
    onChange();
  });
}

export const DESIGN_GROUPS = [
  { label: ['Hauptquartier', 'Headquarters'], art: 'overview', ids: ['overview', 'character', 'housing', 'household', 'family', 'legacy'] },
  { label: ['Spielwelt', 'World'], art: 'map', ids: ['city', 'newspaper', 'map'] },
  { label: ['Wirtschaft', 'Economy'], art: 'work', ids: ['business', 'work', 'trade'] },
  { label: ['Gesellschaft', 'Community'], art: 'society', ids: ['society', 'social'] },
  { label: ['Geschäft', 'Shop'], art: 'shop', ids: ['shop'] },
];

export function decorateDesign(hud, side, route, ctx) {
  if (!isV2()) return;
  const links = [...side.querySelectorAll('[data-nav]')];
  const current = DESIGN_GROUPS.find((g) => g.ids.includes(route));
  ctx.ui.simLastRoute = ctx.ui.simLastRoute || {};
  if (current && route !== 'map') ctx.ui.simLastRoute[current.art] = route;
  const dock = document.createDocumentFragment();
  for (const group of DESIGN_GROUPS) {
    const target = ctx.ui.simLastRoute[group.art] || group.ids[0];
    const a = document.createElement('a'); a.href = `#/${target}`;
    a.className = `sim-dock-link${current === group ? ' on' : ''}`;
    a.dataset.simGroup = group.art;
    if (current === group) a.setAttribute('aria-current', 'true');
    a.innerHTML = `<svg class="sim-illustration" aria-hidden="true"><use href="/img/design-v2.svg#sim-${group.art}"/></svg><span>${text(...group.label)}</span>`;
    if (links.some((l) => group.ids.includes(l.dataset.nav) && l.querySelector('.dot'))) {
      const badge = document.createElement('i'); badge.className = 'sim-group-badge';
      badge.setAttribute('aria-label', text('Neue Hinweise', 'New notices')); a.append(badge);
    }
    dock.append(a);
  }
  side.replaceChildren(dock);
  const tabs = document.getElementById('sim-tabs');
  if (tabs) {
    tabs.replaceChildren(...(current ? current.ids.map((id) => links.find((l) => l.dataset.nav === id)).filter(Boolean) : links));
    tabs.querySelector('.nav.on')?.setAttribute('aria-current', 'page');
  }
  const title = document.getElementById('sim-window-title');
  if (title) title.textContent = current ? text(...current.label) : 'Turning Point';
  const crumb = document.getElementById('sim-breadcrumb');
  if (crumb) crumb.textContent = `TURNING POINT / ${links.find((a) => a.dataset.nav === route)?.textContent.trim() || route}`;
  const profile = document.getElementById('sim-profile');
  const v = ctx.view;
  if (profile && v) {
    mount(profile, html`<div class="sim-profile-name"><b>${v.person.name}</b><span>${icon('map-pin')} ${v.city.name}</span></div>
      <div class="sim-profile-art">${sceneFor(ctx, v.city.id)}</div>
      <div class="sim-profile-level"><span>${text('Generation', 'Generation')} ${v.generation}</span><b>${v.person.age} ${text('Jahre', 'years')}</b></div>
      <dl class="kv small"><dt>${text('Vermögen', 'Net worth')}</dt><dd>${money(v.worth, v.currency)}</dd><dt>${text('Bilanz / Tag', 'Balance / day')}</dt><dd class="${v.flows.net >= 0 ? 'pos' : 'neg'}">${signed(v.flows.net, v.currency)}</dd><dt>${text('Immobilien', 'Properties')}</dt><dd>${v.properties.length}</dd><dt>${text('Unternehmen', 'Businesses')}</dt><dd>${v.companies.length}</dd></dl>
      <div class="sim-profile-meters">${[['fridge', 'refrigerator'], ['health', 'heart-pulse'], ['rest', 'moon']].map(([key, ic]) => html`<span>${icon(ic)}<b>${Math.round(v.meters[key])}%</b></span>`)}</div>
      <a class="btn primary block" href="#/map">${icon('map')} ${text('Zur Spielwelt', 'Game world')}</a>`);
  }
  const utility = document.createElement('details'); utility.className = 'sim-utility';
  utility.innerHTML = `<summary aria-label="${text('Weitere Funktionen', 'More controls')}" title="${text('Weitere Funktionen', 'More controls')}">${icon('menu').__raw}</summary><div class="sim-utility-menu"></div>`;
  const tray = utility.lastElementChild;
  for (const selector of ['.efs', '[data-chat]', '[data-bell]', '[data-help]', 'a[href="/account"]', '[data-motion-toggle]', '[data-sound]', 'a[data-i18n-skip]', '[data-theme-toggle]', '.logout']) {
    const control = hud.querySelector(selector); if (!control) continue;
    const label = control.getAttribute('title') || control.getAttribute('aria-label') || text('Abmelden', 'Sign out');
    const target = control.matches('form') ? control.querySelector('button') : control;
    const span = document.createElement('span'); span.textContent = label; target.append(span); tray.append(control);
  }
  hud.append(utility);
}

document.addEventListener('click', (event) => {
  document.querySelectorAll('.sim-utility[open]').forEach((el) => {
    if (!el.contains(event.target) || event.target.closest('a, button')) el.open = false;
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || document.querySelector('.modal-backdrop')) return;
  document.querySelectorAll('.sim-utility[open]').forEach((el) => { event.preventDefault(); el.open = false; el.querySelector('summary').focus(); });
});

/* Existing sections become an in-window catalogue. Moving nodes retains every
   original action and listener; switching Classic simply unwraps them again. */
export function decoratePageDesign(root, ctx) {
  if (!root) return;
  const workspace = root.querySelector(':scope > .sim-workspace');
  if (!isV2()) {
    root.__restoreSimulator?.();
    delete root.__restoreSimulator;
    root.querySelectorAll('.sim-guide').forEach((guide) => guide.replaceWith(...guide.querySelectorAll('[data-intro]')));
    return;
  }
  const intro = root.querySelector(':scope > [data-intro]');
  if (intro) {
    const details = document.createElement('details'); details.className = 'sim-guide';
    const summary = document.createElement('summary'); summary.innerHTML = `${icon('lightbulb').__raw} ${text('Spielhilfe', 'Game help')} <span>⌄</span>`;
    intro.before(details); details.append(summary, intro);
  }
  if (root.dataset.route === 'city') { decorateCity(root, ctx); return; }
  if (workspace || ['map', 'newspaper', 'social'].includes(root.dataset.route)) return;
  // Flatten only top-level multi-section grids; never split a form or a card.
  const grids = [];
  root.querySelectorAll(':scope > .grid').forEach((grid) => {
    if (!grid.matches('[data-sim-metrics]') && [...grid.children].every((el) => el.matches('.card, section, article'))) {
      const placeholder = document.createComment('original grid'); const children = [...grid.children];
      grid.before(placeholder); grid.replaceWith(...children); grids.push({ grid, children, placeholder });
    }
  });
  const sections = [...root.children].filter((el) => !el.matches('.panel-head, .sim-guide, .alert, .ann, .soc-strip') && !el.hidden && el.textContent.trim());
  const restoreGrids = () => grids.forEach(({ grid, children, placeholder }) => { grid.append(...children.filter((el) => el.isConnected)); placeholder.replaceWith(grid); });
  if (sections.length < 2) { restoreGrids(); return; }
  const positions = sections.map((el) => { const marker = document.createComment('original section'); el.before(marker); return { el, marker }; });
  const wrap = document.createElement('div'); wrap.className = 'sim-workspace';
  const nav = document.createElement('nav'); nav.className = 'sim-section-nav'; nav.setAttribute('aria-label', text('Funktionen', 'Functions'));
  const content = document.createElement('div'); content.className = 'sim-workspace-content';
  sections[0].before(wrap); wrap.append(nav, content);
  const saved = ctx.ui.simSection?.[root.dataset.route] || 'all';
  const buttons = [];
  const choose = (id) => {
    ctx.ui.simSection = ctx.ui.simSection || {}; ctx.ui.simSection[root.dataset.route] = id;
    sections.forEach((el, i) => { el.classList.toggle('sim-section-hidden', id !== 'all' && id !== String(i)); });
    buttons.forEach((b) => { b.classList.toggle('on', b.dataset.section === id); b.setAttribute('aria-pressed', String(b.dataset.section === id)); });
    content.dataset.focused = String(id !== 'all');
    content.scrollTop = 0;
  };
  const add = (id, label, ic) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.section = id;
    b.innerHTML = `${icon(ic).__raw}<span></span>`; b.lastElementChild.textContent = label;
    b.onclick = () => choose(id); nav.append(b); buttons.push(b);
  };
  add('all', text('Gesamtübersicht', 'Overview'), 'layers');
  sections.forEach((el, i) => {
    const heading = el.querySelector('.card-title, h3, h2, h4, b');
    const cleanHeading = heading?.cloneNode(true); cleanHeading?.querySelectorAll('button:not(.term), .badge, svg, .i').forEach((x) => x.remove());
    let label = cleanHeading?.textContent.trim().replace(/\s+/g, ' ') || text('Weitere Funktionen', 'More functions');
    label = ({ polBox: 'Versorgungspolitik', civicBox: 'Vereine & Gemeinde', courtBox: 'Recht & Gericht', epiBanner: 'Gesundheitslage', seasonCard: 'Jahreszeit', civicMini: 'Gemeinwohl', econBox: 'Preisbarometer', honorCard: 'Ehrenbürgerwürde', trPol: 'Verkehrspolitik' })[el.id] || label;
    if (el.matches('[data-sim-metrics]')) label = text('Betriebsübersicht', 'Business overview');
    if (el.matches('.scene-card')) label = text('Wohnort & Lebensstand', 'Home & life');
    if (el.matches('.time-card')) label = text('Zeit & EFS', 'Time & EFS');
    if (label.length > 34) label = label.slice(0, 32) + '…';
    el.classList.add('sim-section'); el.dataset.simSection = String(i); content.append(el);
    add(String(i), label, el.querySelector('svg use')?.getAttribute('href')?.split('#i-')[1] || 'layers');
  });
  const observer = new MutationObserver(() => {
    sections.forEach((el, i) => { buttons[i + 1].hidden = !el.isConnected; });
  });
  observer.observe(content, { childList: true });
  const previousDispose = root.__dispose;
  root.__dispose = () => { observer.disconnect(); previousDispose?.(); };
  root.__restoreSimulator = () => {
    root.querySelectorAll('.sim-entity-focus').forEach((el) => { el.classList.remove('sim-entity-focus'); el.removeAttribute('tabindex'); });
    positions.forEach(({ el, marker }) => { el.classList.remove('sim-section', 'sim-section-hidden'); el.removeAttribute('data-sim-section'); if (el.isConnected) marker.replaceWith(el); else marker.remove(); });
    observer.disconnect(); wrap.remove(); restoreGrids();
  };
  choose(saved === 'all' || Number(saved) < sections.length ? saved : 'all');
  const focus = ctx.ui.simFocus;
  if (focus?.route === root.dataset.route) {
    delete ctx.ui.simFocus;
    const target = [...root.querySelectorAll('[data-sim-entity]')].find((el) => el.dataset.simEntity === focus.entity);
    const section = target?.closest('.sim-section');
    if (section) {
      choose(section.dataset.simSection);
      target.classList.add('sim-entity-focus');
      target.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => { if (target.isConnected) { target.scrollIntoView({ block: 'nearest' }); target.focus({ preventScroll: true }); } });
    }
  }
}

// City has its own spacious workspace; retain the original live nodes for Classic.
function decorateCity(root, ctx) {
  if (root.querySelector('.sim-city-nav')) return;
  const sections = [['city', '.city-layout', 'Stadt erkunden'], ['directory', '#dir', 'Stadtverzeichnis'], ['economy', '#econBox', 'Preisbarometer']].map(([id, selector, label]) => ({ id, el: root.querySelector(selector), label })).filter(x => x.el);
  const nav = document.createElement('nav'); nav.className = 'sim-city-nav'; nav.setAttribute('aria-label', 'Stadtbereiche');
  root.querySelector('.city-layout').before(nav);
  const choose = id => {
    ctx.ui.cityTab = id;
    sections.forEach(x => x.el.classList.toggle('sim-city-hidden', x.id !== id));
    nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cityTab === id)));
  };
  sections.forEach(x => { const b = document.createElement('button'); b.type = 'button'; b.dataset.cityTab = x.id; b.textContent = x.label; b.onclick = () => choose(x.id); nav.append(b); });
  root.__restoreSimulator = () => { sections.forEach(x => x.el.classList.remove('sim-city-hidden')); nav.remove(); root.querySelectorAll('.bl-item').forEach(x => { x.hidden = false; }); };
  choose(sections.some(x => x.id === ctx.ui.cityTab) ? ctx.ui.cityTab : 'city');
}
