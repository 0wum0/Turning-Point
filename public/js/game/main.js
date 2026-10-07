import { html, icon, mount, api, toast, modal, confirmBox, ring, money, num, infoBtn, on, sleep, esc, yearsText } from './ui.js';
import overview from './views/overview.js';
import newspaper from './views/newspaper.js';
import map from './views/map.js';
import work from './views/work.js';
import housing from './views/housing.js';
import household from './views/household.js';
import family from './views/family.js';
import legacy from './views/legacy.js';
import business from './views/business.js';
import society from './views/society.js';
import city from './views/city.js';
import shop from './views/shop.js';
import { renderCreate, renderHeir, renderGameOver } from './screens.js';
import * as audio from './audio.js';

const PAGES = [overview, newspaper, map, city, work, business, society, housing, household, family, legacy, shop];
const byId = Object.fromEntries(PAGES.map((p) => [p.id, p]));
const app = document.getElementById('app');

const ctx = {
  world: null, view: null, coins: 0, efsPool: 0, ui: {}, route: 'overview',
  setView, render, rerender, go, act, advance, watchAd, confirm: confirmBox, hud: renderHud,
};

function setView(view) {
  ctx.view = view;
  if (view) {
    ctx.coins = view.coins; ctx.efsPool = view.efs.pool;
    document.documentElement.dataset.era = String(view.date.eraKey); audio.setEra(view.date.eraKey);
  }
}

const routeFromHash = () => { const r = (location.hash || '').replace(/^#\/?/, ''); return byId[r] ? r : 'overview'; };
function go(route) {
  if (!shellActive()) { history.replaceState(null, '', `#/${route}`); render(); return; }
  if (location.hash === `#/${route}`) rerender(); else location.hash = `#/${route}`;
}
window.addEventListener('hashchange', () => { ctx.route = routeFromHash(); if (shellActive()) { renderHud(); renderPage(true); } });
const shellActive = () => !!document.getElementById('page');

/* ---------- Gesamtansicht ---------- */
function render() {
  const v = ctx.view;
  if (!v || ctx.ui.forceCreate) { renderCreate(app, ctx); return; }
  if (v.status === 'dead') { renderHeir(app, ctx); return; }
  if (v.status === 'gameover' && !ctx.ui.gameoverChron) { renderGameOver(app, ctx); return; }
  ctx.route = routeFromHash();
  if (!shellActive()) {
    mount(app, html`<div class="shell"><header class="hud" id="hud"></header><nav class="side" id="side" aria-label="Hauptmenü"></nav><main class="page" id="page" tabindex="-1"></main></div>`);
  }
  renderHud(); renderPage(true);
}

const METER_INFO = {
  fridge: ['Dein Kühlschrank zeigt, wie viel Essen im Haus ist.', 'Er muss unabhängig von deiner Wohnung gefüllt werden. Ist er leer, hast du Hunger – Wohlbefinden und Gesundheit sinken täglich.', 'Kaufe unter „Haushalt“ Lebensmittel. Bessere Qualität hebt Stimmung und Gesundheit.'],
  wellbeing: ['Das Wohlbefinden beschreibt deine Stimmung.', 'Es hängt von Ernährung, Arbeit, Wohnung, Beziehung, Finanzen und Erholung ab. Ein niedriges Wohlbefinden schadet auch der Gesundheit.', 'Sorge für Essen, ein Zuhause, Arbeit und Zeit mit der Familie.'],
  rest: ['Die Erholung zeigt, wie ausgeruht du bist.', 'Sie hängt vom Schlafplatz ab: Straße ist schlecht, Pension besser, Miete und Eigentum am besten. Arbeit und Kinder kosten Kraft.', 'Such dir eine richtige Unterkunft.'],
  health: ['Die Gesundheit entscheidet, wie lange du lebst.', 'Fällt sie auf null, stirbst du. Auf der Straße sinkt sie extrem schnell. Gutes Essen, Schlaf und Stimmung stärken sie.', 'Iss gut, schlafe in einer Wohnung, nutze ab 1960 Gesundheitskarten.'],
};

function renderHud() {
  const hud = document.getElementById('hud'); const side = document.getElementById('side');
  if (!hud || !ctx.view) return;
  const v = ctx.view; const m = v.meters;
  mount(hud, html`
    <a class="brand" href="/" title="Zur Startseite"><span class="mark">${icon('hourglass')}</span></a>
    <div class="hud-id"><b class="serif">${v.person.name}</b><small>${v.date.label} · ${v.person.age} Jahre · ${v.date.era}</small></div>
    <span class="grow"></span>
    <div class="hud-res">
      <button class="res" data-go="overview" title="Geld"><span>${icon('wallet')}</span><b class="mono ${v.money < 0 ? 'neg' : ''}">${money(v.money, v.currency)}</b></button>
      <button class="res efs" data-go="overview" title="EFS = Spieltage, die du vorspulen kannst"><span>${icon('zap')}</span><b class="mono">${num(v.efs.pool)}</b><small>EFS</small></button>
      <button class="res coin" data-go="shop" title="Coins"><span>${icon('coins')}</span><b class="mono">${num(v.coins)}</b></button>
    </div>
    <div class="hud-meters">
      ${[['fridge', 'Kühlschrank', 'refrigerator'], ['wellbeing', 'Wohlbefinden', 'smile'], ['rest', 'Erholung', 'moon'], ['health', 'Gesundheit', 'heart-pulse']].map((x) => html`<button class="meter" data-meter="${x[0]}" aria-label="${x[1]}: ${m[x[0]]} %">${ring(m[x[0]], x[1], x[2], { size: 44 })}<span class="mlabel">${x[1]}</span></button>`)}
    </div>
    <button class="btn ghost sm" data-motion-toggle aria-label="Animationen an/aus" title="Animationen an/aus">${icon('sparkles')}</button>
    <button class="btn ghost sm" data-sound aria-label="Ton an/aus" title="Musik & Töne">${icon(audio.isOn() ? 'volume-2' : 'volume-x')}</button>
    <button class="btn ghost sm" data-theme-toggle aria-label="Farbschema wechseln">${icon('sun-medium')}</button>
    <form method="post" action="/logout" class="logout"><input type="hidden" name="_csrf" value="${document.querySelector('meta[name=csrf-token]').content}"><button class="btn ghost sm" aria-label="Abmelden" title="Abmelden">${icon('log-out')}</button></form>`);
  const hintLevel = {};
  v.hints.forEach((h) => { if (hintLevel[h.target] !== 'bad') hintLevel[h.target] = h.level; });
  const unseen = v.notices.filter((n) => !n.seen).length;
  const label = (p) => (p.id === 'newspaper' && v.date.medium === 'web' ? 'Web' : p.label);
  mount(side, html`${PAGES.map((p) => html`<a href="#/${p.id}" class="nav ${ctx.route === p.id ? 'on' : ''} ${hintLevel[p.id] ? 'hint-' + hintLevel[p.id] : ''}" data-nav="${p.id}">${icon(p.icon)}<span>${label(p)}</span>${p.id === 'overview' && unseen ? html`<i class="dot">${unseen}</i>` : hintLevel[p.id] ? html`<i class="dot soft"></i>` : ''}</a>`)}`);
}

function showAnnouncement(root) {
  const a = ctx.view && ctx.view.announcement; if (!a) return;
  const key = `tp-ann-${a.id}`;
  try { if (localStorage.getItem(key)) return; } catch (_) { /* ohne Speicher: immer anzeigen */ }
  const lvl = ['good', 'warn', 'bad'].includes(a.level) ? a.level : 'info';
  root.insertAdjacentHTML('afterbegin', html`<div class="alert ${lvl} ann">${icon('bell')}<div>${a.title ? html`<b>${a.title}</b> ` : ''}${a.text}</div><button class="btn sm ghost" aria-label="Schließen">${icon('x')}</button></div>`.__raw);
  root.querySelector('.ann button').onclick = (e) => { e.currentTarget.closest('.ann').remove(); try { localStorage.setItem(key, '1'); } catch (_) { /* egal */ } };
}

let pageSeq = 0;
async function renderPage(animate) {
  let root = document.getElementById('page'); if (!root) return;
  // Frisches Element, damit Event-Listener früherer Renderings nicht kumulieren
  const fresh = root.cloneNode(false); root.replaceWith(fresh); root = fresh;
  const page = byId[ctx.route]; const my = ++pageSeq;
  const scroll = animate ? 0 : window.scrollY;
  let data = null;
  if (page.load) {
    if (animate) root.innerHTML = '<div class="skel" style="height:220px"></div><div class="skel" style="height:320px;margin-top:1rem"></div>';
    try { data = await page.load(ctx); } catch (e) { if (my !== pageSeq) return; mount(root, html`<div class="alert bad">${icon('circle-alert')}<div>${e.message}</div></div>`); return; }
    if (my !== pageSeq) return;
  }
  mount(root, page.render(ctx, data));
  root.classList.remove('enter'); void root.offsetWidth; if (animate) root.classList.add('enter');
  page.bind(root, ctx, data);
  showAnnouncement(root);
  window.scrollTo(0, scroll);
  if (ctx.route === 'legacy' && ctx.view.status === 'gameover') {
    root.insertAdjacentHTML('afterbegin', '<div class="alert warn"><div>Dieses Leben ist beendet. <button class="btn sm" id="backGO">Zurück</button></div></div>');
    document.getElementById('backGO').onclick = () => { ctx.ui.gameoverChron = false; render(); };
  }
  if (animate) document.title = `${page.label} · ${document.title.split(' · ').pop()}`;
}
function rerender() { renderHud(); return renderPage(false); }

/* ---------- Aktionen ---------- */
const CELEBRATE = new Set(['buyBiz', 'buy', 'marry', 'runOffice', 'bizExpand', 'bizRevive']);
async function act(name, input = {}, opts = {}) {
  try {
    const r = await api('POST', `/api/action/${name}`, input);
    setView(r.view);
    if (!opts.silent && r.message) toast(r.message, r.level);
    if (CELEBRATE.has(name) && r.level !== 'warn' && r.level !== 'bad' && window.TPMotion) window.TPMotion.confetti();
    if (r.view.status !== 'alive') { render(); return r; }
    if (opts.noRender) renderHud(); else await rerender();
    return r;
  } catch (e) { toast(e.message, 'bad'); throw e; }
}

async function advance(days, btn) {
  if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>'; }
  try {
    const r = await api('POST', '/api/advance', { days });
    setView(r.view);
    const fresh = r.newNotices || [];
    const important = fresh.filter((n) => n.interrupt || n.level === 'bad' || n.level === 'good');
    if (r.view.status !== 'alive') { render(); if (r.view.status === 'dead') toast('Dein Charakter ist gestorben.', 'bad'); return; }
    await rerender();
    const delta = r.moneyDelta;
    if (window.TPMotion && (r.yearFrom !== r.yearTo || fresh.some((n) => n.level === 'good' && /geboren|abgeschlossen|Lotto|Erbe|Gewinn/.test(n.title || '')))) setTimeout(() => window.TPMotion.confetti(), 250);
    const title = r.stopped === 'interrupt' ? 'Das Leben ruft dich' : 'Zeit vergeht';
    if (r.advanced > 0 && (r.stopped === 'interrupt' || important.length || r.yearFrom !== r.yearTo)) {
      const list = (r.stopped === 'interrupt' ? fresh : important).slice(0, 8).reverse();
      const m = modal(html`<h3>${icon('hourglass')} ${title}</h3>
        <p class="dim">${r.advanced} Tag${r.advanced === 1 ? '' : 'e'} vergangen${r.yearFrom !== r.yearTo ? html` · <b>${r.yearFrom} → ${r.yearTo}</b>` : ''} · Geld <b class="${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '+' : '−'}${money(Math.abs(delta), r.view.currency)}</b></p>
        ${r.stopped === 'interrupt' ? html`<div class="alert warn">${icon('triangle-alert')}<div>Die Zeit wurde angehalten, weil etwas deine Aufmerksamkeit braucht. ${r.view.efs.pool} EFS bleiben übrig.</div></div>` : ''}
        <ul class="notices">${list.map((n) => html`<li class="notice ${n.level}"><span class="nic">${icon(n.level === 'good' ? 'circle-check' : n.level === 'bad' ? 'circle-alert' : n.level === 'warn' ? 'triangle-alert' : 'info')}</span><div class="grow"><b>${n.title}</b><div class="dim small">${n.text}</div></div>${infoBtn(n.info, n.title)}</li>`)}</ul>
        <div class="row end mt"><button class="btn primary" data-close="1">Weiter</button></div>`, { onClose: () => { act('readNotices', {}, { silent: true, noRender: true }).then(() => rerender()).catch(() => {}); } });
      return m;
    }
    toast(`${r.advanced} Spieltag${r.advanced === 1 ? '' : 'e'} vergangen.`);
  } catch (e) { toast(e.message, 'bad'); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = btn.dataset.label; } }
}

/* ---------- Belohnungswerbung (freiwillig) ---------- */
async function watchAd(purpose) {
  let started;
  try { started = await api('POST', '/api/ads/start', { purpose }); } catch (e) { toast(e.message, 'bad'); return false; }
  const secs = started.seconds;
  return new Promise((resolve) => {
    let left = secs; let done = false; const cleanup = { fn: null };
    const m = modal(html`<h3>${icon('video')} Anzeige</h3>
      <div class="ad-box">${started.url ? html`<iframe class="ad-frame" src="${started.url}" title="Anzeige" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>` : html`<div class="ad-fake"><b>Hier läuft später die Belohnungsanzeige deines Werbenetzwerks.</b><span class="dim small">Platzhalter (simuliert)</span></div>`}
      <div class="ad-count" id="adCount">${left}</div></div>
      <div class="row spread mt"><button class="btn ghost" data-close="cancel">Abbrechen</button><button class="btn primary" id="adClaim" disabled>Belohnung abholen</button></div>`, { dismissable: false, onClose: () => { clearInterval(t); if (cleanup.fn) cleanup.fn(); if (!done) resolve(false); } });
    const cnt = m.el.querySelector('#adCount'); const btn = m.el.querySelector('#adClaim');
    let adDone = !started.url; let timeUp = false;
    const ready = () => { if (adDone && timeUp) { btn.disabled = false; cnt.textContent = '✓'; } };
    const t = setInterval(() => { left--; cnt.textContent = Math.max(0, left); if (left <= 0) { clearInterval(t); timeUp = true; ready(); } }, 1000);
    if (started.url) {
      const origin = new URL(started.url).origin;
      const onMsg = (ev) => { if (ev.origin === origin && ev.data && ev.data.type === 'tp-ad-complete') { adDone = true; ready(); } };
      window.addEventListener('message', onMsg);
      cleanup.fn = () => window.removeEventListener('message', onMsg);
    }
    btn.onclick = async () => {
      btn.disabled = true;
      try { const r = await api('POST', '/api/ads/claim', { token: started.token }); done = true; setView(r.view); toast(r.message); m.close(); resolve(true); renderHud(); }
      catch (e) { toast(e.message, 'bad'); btn.disabled = false; }
    };
  });
}

/* ---------- Ereignisse ---------- */
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]'); if (g && g.closest('#hud')) { e.preventDefault(); go(g.dataset.go); }
  const mt = e.target.closest('[data-meter]');
  if (mt) { const k = mt.dataset.meter; const lab = { fridge: 'Kühlschrank', wellbeing: 'Wohlbefinden', rest: 'Erholung', health: 'Gesundheit' }[k]; modal(html`<h3>${icon('info')} ${lab}: ${ctx.view.meters[k]} %</h3><ol class="info-steps">${['Was ist das?', 'Warum ist das wichtig?', 'Was kann ich tun?'].map((t, i) => html`<li><div><b>${t}</b>${METER_INFO[k][i]}</div></li>`)}</ol><div class="row end mt"><button class="btn primary" data-close="1">Verstanden</button></div>`); }
  if (e.target.closest('#hud [data-sound]')) { audio.toggle(); renderHud(); }
  const th = e.target.closest('#hud [data-theme-toggle]');
  if (th) { const c = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', c); try { localStorage.setItem('tp-theme', c); } catch (_) {} }
});

function showSync(sync) {
  if (!sync) return;
  if (sync.offline && sync.offline.days > 0) {
    const o = sync.offline;
    modal(html`<h3>${icon('moon')} Während du weg warst …</h3>
      <p class="dim">Seit deinem letzten Besuch sind <b>${o.days} Spieltage</b> vergangen (${o.fromYear} → ${o.toYear}). Gehalt, Miete und Alltag liefen automatisch weiter – offline kannst du weder verhungern noch insolvent werden.</p>
      <dl class="kv"><dt>Geldänderung</dt><dd class="${o.moneyDelta >= 0 ? 'pos' : 'neg'}">${o.moneyDelta >= 0 ? '+' : '−'}${money(Math.abs(o.moneyDelta), ctx.view ? ctx.view.currency : 'DM')}</dd></dl>
      ${o.status !== 'alive' ? html`<div class="alert bad">${icon('skull')}<div>Dein Charakter ist in der Zwischenzeit gestorben.</div></div>` : ''}
      <div class="row end mt"><button class="btn primary" data-close="1">Weiter</button></div>`);
  } else if (sync.bonus) {
    toast(`Tagesbonus: +${sync.bonus} EFS`);
  }
}

async function refresh() {
  try {
    const r = await api('GET', '/api/state');
    ctx.coins = r.coins; ctx.efsPool = r.efsPool;
    setView(r.view);
    return r;
  } catch (e) { toast(e.message, 'bad'); return null; }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !ctx.view || ctx.view.status !== 'alive' || document.querySelector('.modal-backdrop')) return;
  const before = ctx.view.date.day;
  const r = await refresh();
  if (r && r.view) { if (r.view.date.day !== before) { showSync(r.sync); render(); } else renderHud(); }
});
setInterval(async () => {
  if (document.visibilityState !== 'visible' || !ctx.view || ctx.view.status !== 'alive' || document.querySelector('.modal-backdrop')) return;
  const r = await refresh(); if (r && r.view) renderHud();
}, 120000);

/* ---------- Start ---------- */
audio.resumeOnGesture();
(async function boot() {
  try {
    const [world, st] = await Promise.all([api('GET', '/api/world'), api('GET', '/api/state')]);
    world.cities = world.cities || [];
    ctx.world = world; ctx.coins = st.coins; ctx.efsPool = st.efsPool;
    setView(st.view);
    render();
    showSync(st.sync);
  } catch (e) {
    app.innerHTML = `<div class="boot-error card"><h2>Das Spiel konnte nicht geladen werden</h2><p class="dim">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Neu laden</button></div>`;
  }
})();
