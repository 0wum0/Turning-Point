import { html, icon, modal } from './ui.js';

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

const GROUPS = [
  { label: ['Mein Leben', 'My life'], icon: 'home', ids: ['overview', 'housing', 'household', 'family', 'legacy'] },
  { label: ['Spielwelt', 'World'], icon: 'map', ids: ['map', 'city', 'newspaper'] },
  { label: ['Wirtschaft', 'Economy'], icon: 'briefcase', ids: ['work', 'business', 'trade'] },
  { label: ['Gesellschaft', 'Community'], icon: 'users', ids: ['society', 'social'] },
  { label: ['Geschäft', 'Shop'], icon: 'coins', ids: ['shop'] },
];

// Move the existing links, including their locks, badges and destinations. No second router.
export function decorateDesign(hud, side, route) {
  if (!isV2()) return;
  const links = [...side.querySelectorAll('[data-nav]')];
  for (const group of GROUPS) {
    const items = links.filter((a) => group.ids.includes(a.dataset.nav));
    if (!items.length) continue;
    const active = group.ids.includes(route);
    const details = document.createElement('details');
    details.className = `sim-group${active ? ' active' : ''}`;
    const summary = document.createElement('summary');
    summary.innerHTML = `<svg class="sim-illustration" aria-hidden="true"><use href="/img/design-v2.svg#sim-${group.ids[0]}"/></svg><span>${text(...group.label)}</span><span class="sim-chevron" aria-hidden="true">⌃</span>`;
    if (active) summary.setAttribute('aria-current', 'true');
    if (items.some((a) => a.querySelector('.dot'))) {
      const badge = document.createElement('i'); badge.className = 'sim-group-badge';
      badge.setAttribute('aria-label', text('Neue Hinweise', 'New notices')); summary.append(badge);
    }
    const menu = document.createElement('div'); menu.className = 'sim-menu';
    const title = document.createElement('strong'); title.className = 'sim-menu-title'; title.textContent = text(...group.label);
    menu.append(title, ...items); details.append(summary, menu); side.append(details);
  }
  // Any future route remains accessible even if it has not yet been assigned to a group.
  const extra = links.filter((a) => a.parentElement === side);
  if (extra.length) {
    const details = document.createElement('details'); details.className = 'sim-group';
    details.innerHTML = `<summary>${icon('menu').__raw}<span>${text('Mehr', 'More')}</span></summary><div class="sim-menu"></div>`;
    details.lastElementChild.append(...extra); side.append(details);
  }
  const utility = document.createElement('details'); utility.className = 'sim-utility';
  utility.innerHTML = `<summary aria-label="${text('Weitere Funktionen', 'More controls')}" title="${text('Weitere Funktionen', 'More controls')}">${icon('menu').__raw}</summary><div class="sim-utility-menu"></div>`;
  const tray = utility.lastElementChild;
  const selectors = ['[data-help]', 'a[href="/account"]', '[data-motion-toggle]', '[data-sound]', 'a[data-i18n-skip]', '[data-theme-toggle]', '.logout'];
  for (const selector of selectors) {
    const control = hud.querySelector(selector); if (!control) continue;
    const label = control.getAttribute('title') || control.getAttribute('aria-label') || text('Abmelden', 'Sign out');
    const target = control.matches('form') ? control.querySelector('button') : control;
    const span = document.createElement('span'); span.textContent = label; target.append(span); tray.append(control);
  }
  hud.append(utility);
}

document.addEventListener('toggle', (event) => {
  const target = event.target;
  if (!target.matches?.('.sim-group, .sim-utility') || !target.open) return;
  document.querySelectorAll('.sim-group[open], .sim-utility[open]').forEach((el) => { if (el !== target) el.open = false; });
}, true);
document.addEventListener('click', (event) => {
  document.querySelectorAll('.sim-group[open], .sim-utility[open]').forEach((el) => {
    if (!el.contains(event.target) || event.target.closest('a, button')) el.open = false;
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || document.querySelector('.modal-backdrop')) return;
  document.querySelectorAll('.sim-group[open], .sim-utility[open]').forEach((el) => { el.open = false; el.querySelector('summary').focus(); });
});

// Keep the full tutorial available without covering the simulator map.
export function decoratePageDesign(root) {
  if (!root) return;
  const guide = root.querySelector('.sim-guide');
  if (!isV2()) { if (guide) guide.replaceWith(...guide.querySelectorAll('[data-intro]')); return; }
  const intro = root.querySelector(':scope > [data-intro]');
  if (!intro || root.dataset.route !== 'map') return;
  const details = document.createElement('details'); details.className = 'sim-guide';
  const summary = document.createElement('summary');
  summary.innerHTML = `${icon('lightbulb').__raw} ${text('Karte & Spielhilfe', 'Map & game help')} <span>⌄</span>`;
  intro.before(details); details.append(summary, intro);
}
