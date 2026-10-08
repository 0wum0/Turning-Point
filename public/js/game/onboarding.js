/* Einsteiger-Erlebnis (Oberfläche): Willkommensdialog, Hilfe-Menü, später Aufgabenreihe, „Was jetzt?“, Freischaltungen. */
import { html, icon, modal, money, num, bar, on, toast } from './ui.js';

/** Tempo der Spielzeit aus der Uhr der Ansicht (Standard: 24 Std. = 1 Jahr, ein Tag ≈ 4 Min.). */
export function pace(v) {
  const perMs = v.clock && v.clock.perMs ? v.clock.perMs : 365 / 86400000;
  const hoursPerYear = Math.round((365 / (perMs * 3600000)) * 10) / 10;
  const minPerDay = Math.max(1, Math.round((1 / perMs / 60000) * 10) / 10);
  return { hoursPerYear, minPerDay };
}

const dec = (x) => String(x).replace('.', ',');

function slides(v) {
  const p = pace(v);
  const cur = v.currency;
  return [
    { ic: 'hourglass', title: `Willkommen im Jahr ${v.date.year}`, body: html`
      <p>Du bist ${v.person.age} Jahre alt, auf dich allein gestellt und hast ${money(v.money, cur)}, einen erlernten Beruf – und kein Zuhause.</p>
      <p><b>Dein Ziel:</b> Baue Schritt für Schritt ein Leben auf – mit Arbeit, Wohnung, Familie und vielleicht einer eigenen Firma. Gib dein Lebenswerk an deine Kinder weiter. So wächst über Generationen ein Vermächtnis, bis ins Jahr ${v.legacy.target}.</p>` },
    { ic: 'clock', title: 'Die Uhr läuft von selbst', body: html`
      <p>Das Spiel läuft in Echtzeit: ${dec(p.hoursPerYear)} Stunden in der echten Welt sind ein Jahr im Spiel. Ein Spieltag dauert etwa ${dec(p.minPerDay)} Minuten.</p>
      <p>Du musst nichts abwarten oder drücken: Lohn, Miete und Alltag werden automatisch verrechnet – auch dann, wenn du das Spiel schließt.</p>
      <p><b>EFS</b> sind dein Vorrat an Spieltagen (1 EFS = 1 Tag). Du kannst sie einsetzen, um die Zeit zusätzlich vorzuspulen – aber nur, wenn du es willst.</p>
      <p class="dim">Du hast gerade ${num(v.efs.pool)} EFS.</p>` },
    { ic: 'heart-pulse', title: 'Vier Anzeigen halten dich am Leben', body: html`
      <ul class="wl-list">
        <li>${icon('refrigerator')}<div><b>Kühlschrank</b> – dein Essensvorrat. Ist er leer, hast du Hunger.</div></li>
        <li>${icon('smile')}<div><b>Wohlbefinden</b> – deine Stimmung. Gutes Essen, Arbeit und ein Zuhause heben sie.</div></li>
        <li>${icon('moon')}<div><b>Erholung</b> – wie ausgeruht du bist. Auf der Straße schläfst du schlecht, in einer Wohnung gut.</div></li>
        <li>${icon('heart-pulse')}<div><b>Gesundheit</b> – fällt sie auf null, stirbt dein Charakter. Alle anderen Anzeigen wirken auf sie.</div></li>
      </ul>
      <p class="dim small">Du findest sie oben im Kopfbereich. Ein Klick darauf erklärt sie genauer.</p>` },
    { ic: 'map-pin', title: 'Wo klicke ich?', body: html`
      <ul class="wl-list">
        <li>${icon('newspaper')}<div><b>Zeitung</b> – Hier stehen Arbeit, Wohnungen und Neuigkeiten. Dein erster Weg.</div></li>
        <li>${icon('shopping-basket')}<div><b>Haushalt</b> – Hier kaufst du Essen für den Kühlschrank.</div></li>
        <li>${icon('home')}<div><b>Übersicht</b> – Oben stehen „Was jetzt?“ und „Deine ersten Schritte“. Sie zeigen dir immer, was als Nächstes sinnvoll ist, und führen dich mit einem Klick dorthin.</div></li>
      </ul>
      <p class="dim small">Alles andere schaltet sich nach und nach frei. Über den Hilfe-Knopf „?“ oben rechts öffnest du diese Einführung jederzeit wieder.</p>` },
  ];
}

/** Willkommensdialog in 4 kurzen Folien. onDone wird beim Schließen aufgerufen (auch beim Überspringen). */
export function openWelcome(ctx, { first = false, onDone } = {}) {
  const v = ctx.view; const S = slides(v); let i = 0;
  const draw = () => {
    const s = S[i]; const last = i === S.length - 1;
    box.el.innerHTML = html`
      <div class="wl-top"><span class="wl-step">${i + 1} / ${S.length}</span><button class="btn ghost sm" data-close="skip">${first ? 'Überspringen' : 'Schließen'}</button></div>
      <div class="wl-ic">${icon(s.ic)}</div>
      <h3 class="wl-title">${s.title}</h3>
      <div class="wl-body">${s.body}</div>
      <div class="wl-dots" aria-hidden="true">${S.map((_, k) => html`<i class="${k === i ? 'on' : ''}"></i>`)}</div>
      <div class="row spread mt">${i > 0 ? html`<button class="btn ghost" data-wl="back">Zurück</button>` : html`<span></span>`}
        ${last ? html`<button class="btn primary" data-close="done">Los geht’s</button>` : html`<button class="btn primary" data-wl="next">Weiter</button>`}</div>`.__raw;
    const b = box.el.querySelector('.btn.primary'); if (b) b.focus();
  };
  const box = modal(html`<div></div>`, { onClose: () => { if (onDone) onDone(); } });
  box.el.classList.add('welcome'); box.el.setAttribute('aria-label', 'Willkommen');
  box.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wl]'); if (!b) return;
    i = Math.max(0, Math.min(S.length - 1, i + (b.dataset.wl === 'next' ? 1 : -1))); draw();
  });
  draw();
  return box;
}

/** Beim ersten Start automatisch zeigen und als gesehen melden. */
export function maybeWelcome(ctx) {
  const o = ctx.view && ctx.view.onboarding;
  if (!o || !o.welcome || ctx.__welcomed) return;
  ctx.__welcomed = true;
  const done = () => { ctx.act('seen', { key: 'welcome' }, { silent: true, noRender: true }).catch(() => {}); };
  openWelcome(ctx, { first: true, onDone: done });
}

/** Hilfe-Menü hinter dem „?“-Knopf im Kopfbereich. */
export function openHelp(ctx) {
  const m = modal(html`<h3>${icon('lightbulb')} Hilfe</h3>
    <div class="stack" style="--gap:.5rem">
      <button class="linkrow" data-help-do="welcome">${icon('play')}<span class="grow"><b>Einführung ansehen</b><div class="dim small">Die vier Folien zum Spielstart – in einer Minute gelesen.</div></span></button>
    </div>
    <div class="row end mt"><button class="btn primary" data-close="x">Schließen</button></div>`);
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-help-do]'); if (!b) return;
    const k = b.dataset.helpDo; m.close();
    if (k === 'welcome') openWelcome(ctx, {});
  });
  return m;
}

/* ---------- „Zeig mir’s“: Seite öffnen und die richtige Schaltfläche hervorheben ---------- */
const soc = (ctx, tab) => { ctx.ui.soc = Object.assign(ctx.ui.soc || { cat: 'wealth', scope: 'all', box: 'in', page: 1 }, { tab }); };
const news = (tabName) => (ctx) => { ctx.ui.newsTab = tabName; };
/* spot -> { sel: CSS-Auswahl der Schaltfläche(n), pre: Vorbereitung vor dem Öffnen, text: Hinweis im Hinweisfeld } */
export const SPOTS = {
  'nav:newspaper': { nav: 'newspaper', text: 'Tippe auf „Zeitung“.' },
  food: { sel: '[data-food]', text: 'Wähle eine Qualität und kaufe Essen.' },
  'listing:home': { pre: news('housing'), sel: '[data-act="rent"]:not([disabled]), [data-act="buy"]:not([disabled])', text: 'Such dir eine Unterkunft aus und tippe auf „Beziehen“.' },
  'listing:job': { pre: news('jobs'), sel: '[data-act="apply"]:not([disabled])', text: 'Such dir eine Stelle aus und bewirb dich.' },
  'listing:contact': { pre: news('partners'), sel: '[data-act="meet"]:not([disabled])', text: 'Triff jemanden – ob es funkt, hängt von deiner Lage ab.' },
  'listing:biz': { pre: news('biz'), sel: '[data-act="buyBiz"]:not([disabled])', text: 'Such dir einen Betrieb aus, der zu deinem Beruf passt.' },
  time: { sel: '.time-card', text: 'Hier läuft die Zeit. Der Lohn kommt automatisch, sobald ein Tag vergeht.' },
  money: { sel: '.big-money', text: 'Das ist dein Geld. Spare es auf!' },
  course: { sel: '[data-course]:not([disabled])', text: 'Hier kannst du einen weiteren Beruf lernen.' },
  hire: { sel: '[data-b="bizHire"]', text: 'Tippe auf „+“, um jemanden einzustellen.' },
  lease: { sel: '[data-lease="on"]', text: 'Tippe auf „Vermieten“.' },
  market: { pre: (ctx) => soc(ctx, 'market'), sel: '.soc-tabs [data-tab="market"]', text: 'Im Stadtverzeichnis kannst du Eigentümern ein Angebot machen.' },
  elections: { pre: (ctx) => soc(ctx, 'elections'), sel: '[data-evote], [data-erun]', text: 'Wähle jemanden oder kandidiere selbst.' },
};
let spotTimer = 0; let spotEls = [];
export function clearSpot() {
  clearInterval(spotTimer); spotEls.forEach((e) => e.classList.remove('spot')); spotEls = [];
  const t = document.getElementById('spotTip'); if (t) t.remove();
}
function spotOn(els, text) {
  clearSpot();
  spotEls = els; els.forEach((e) => e.classList.add('spot'));
  const first = els[0]; try { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { /* alt */ }
  if (text) toast(text, 'good');
  const off = () => { clearSpot(); document.removeEventListener('click', off, true); };
  setTimeout(() => document.addEventListener('click', off, true), 400);
  setTimeout(clearSpot, 20000);
}
/** Öffnet die Seite zu einer Aufgabe bzw. Empfehlung und lässt die passende Schaltfläche pulsieren. */
export function showMe(ctx, { tab, spot }) {
  clearSpot();
  const def = SPOTS[spot] || {};
  if (def.nav) { const el = document.querySelector(`#side [data-nav="${def.nav}"]`); if (el) spotOn([el], def.text); else ctx.go(tab); return; }
  if (def.pre) def.pre(ctx);
  if (tab && ctx.route !== tab) ctx.go(tab); else if (def.pre) ctx.rerender();
  if (!def.sel) return;
  let tries = 0;
  spotTimer = setInterval(() => {
    if (++tries > 30) { clearInterval(spotTimer); return; }
    if (ctx.route !== tab) return;
    const els = [...document.querySelectorAll(`#page ${def.sel.split(',').map((x) => x.trim()).join(', #page ')}`)];
    if (els.length) { clearInterval(spotTimer); spotOn(els.slice(0, 6), def.text); }
  }, 200);
}

/* ---------- Aufgabenkarte „Deine ersten Schritte“ ---------- */
const readMode = () => { try { return localStorage.getItem('tp-quests') || ''; } catch (_) { return ''; } };
const saveMode = (m) => { try { localStorage.setItem('tp-quests', m); } catch (_) { /* ohne Speicher */ } };
const rewardText = (r) => [r && r.efs ? `+${r.efs} EFS` : '', r && r.coins ? `+${r.coins} Coin` : ''].filter(Boolean).join(' ');

export function questCard(ctx) {
  const o = ctx.view.onboarding; if (!o || !o.quests) return '';
  const all = o.quests; const finished = o.doneCount >= o.total;
  const mode = readMode() || (finished ? 'min' : 'open');
  const cur = all.find((x) => x.current);
  const item = (x) => html`<li class="q ${x.done ? 'done' : ''} ${x.current ? 'cur' : ''}">
    <span class="qck">${x.done ? icon('check') : all.indexOf(x) + 1}</span>
    <div class="grow"><b>${x.title}</b>${x.done ? '' : html`<div class="dim small">${x.why}</div>`}</div>
    ${x.done ? '' : html`<div class="qside">${rewardText(x.reward) && !x.paid ? html`<span class="chip accent" title="Belohnung, einmalig">${rewardText(x.reward)}</span>` : ''}<button class="btn sm ${x.current ? 'primary' : ''}" data-quest-show="${x.id}">Zeig mir’s</button></div>`}</li>`;
  const shown = mode === 'all' ? all : mode === 'min' ? [] : all.filter((x) => x.current || (!x.done && all.indexOf(x) > all.indexOf(cur) && all.indexOf(x) <= all.indexOf(cur) + 2));
  return html`<section class="card quest-card" id="questCard">
    <div class="row spread wrap qhead"><div class="card-title" style="margin:0">${icon('flag')} Deine ersten Schritte <span class="chip ${finished ? 'good' : ''}">${o.doneCount} / ${o.total}</span></div>
      <div class="row nowrap">${mode === 'all' ? '' : html`<button class="btn sm ghost" data-qmode="all">Alle anzeigen</button>`}<button class="btn sm ghost" data-qmode="${mode === 'min' ? 'open' : 'min'}" aria-label="${mode === 'min' ? 'Aufklappen' : 'Einklappen'}" aria-expanded="${mode !== 'min'}">${icon(mode === 'min' ? 'chevron-down' : 'x')}</button></div></div>
    ${bar(o.doneCount / o.total * 100, 'good')}
    ${finished ? html`<div class="alert good mt">${icon('trophy')}<div>Alle Einstiegsschritte geschafft – du kennst jetzt die wichtigsten Bereiche. Der Rest ist dein Lebenswerk.</div></div>`
      : mode === 'min' && cur ? html`<div class="row spread nowrap mt"><span class="small"><b>Als Nächstes:</b> ${cur.title}</span><button class="btn sm primary" data-quest-show="${cur.id}">Zeig mir’s</button></div>` : ''}
    ${shown.length ? html`<ol class="quests mt">${shown.map(item)}</ol>` : ''}
  </section>`;
}

/* ---------- „Was jetzt?“ ---------- */
function advItem(a, big) {
  const cta = a.cta || {};
  return html`<div class="adv-main">
    <div class="adv-ic">${icon(a.icon || 'lightbulb')}</div>
    <div class="grow"><b class="adv-title">${a.title}</b><div class="dim">${a.why}</div></div>
    <button class="btn ${big ? 'primary' : ''}" data-adv="${big ? 'top' : 'more'}" data-adv-i="${a.__i == null ? '' : a.__i}">${cta.label || 'Los'}</button></div>`;
}
export function advisorCard(ctx) {
  const a = ctx.view.onboarding && ctx.view.onboarding.advisor; if (!a || !a.top) return '';
  const t = a.top; ctx.__adv = [t].concat(a.more || []);
  return html`<section class="card advisor lvl-${t.level}" id="advisor" aria-label="Was jetzt?">
    <div class="card-title">${icon('lightbulb')} Was jetzt?</div>
    ${advItem({ ...t, __i: 0 }, true)}
    ${(a.more || []).length ? html`<div class="adv-more"><span class="dim small">Danach:</span> ${a.more.map((m, i) => html`<button class="chip" data-adv="more" data-adv-i="${i + 1}">${icon(m.icon || 'lightbulb')} ${m.title}</button>`)}</div>` : ''}
  </section>`;
}

/** Führt die Handlung einer Empfehlung aus. */
export async function runCta(ctx, a) {
  const c = a && a.cta; if (!c) return;
  if (c.kind === 'act') { try { await ctx.act(c.name, c.input || {}); } catch (_) { /* Meldung kam bereits */ } return; }
  if (c.kind === 'bank') { const m = await import('./bank.js'); m.openBank(ctx); return; }
  if (c.kind === 'advance') { ctx.advance(c.days || 7); return; }
  showMe(ctx, { tab: c.tab, spot: c.spot });
}

export function bindGuide(root, ctx) {
  on(root, 'click', '[data-quest-show]', (e, t) => { const q = ctx.view.onboarding.quests.find((x) => x.id === t.dataset.questShow); if (q) showMe(ctx, q); });
  on(root, 'click', '[data-qmode]', (e, t) => { saveMode(t.dataset.qmode); ctx.rerender(); });
  on(root, 'click', '[data-adv]', (e, t) => { const a = (ctx.__adv || [])[Number(t.dataset.advI) || 0]; if (a) runCta(ctx, a); });
}

/** Meldet neu erledigte Aufgaben (Vergleich zweier Ansichten) mit kleiner Feier. */
export function celebrateQuests(prev, next) {
  const p = prev && prev.onboarding; const n = next && next.onboarding; if (!p || !n || !p.quests || !n.quests) return;
  const was = new Set(p.quests.filter((x) => x.done).map((x) => x.id));
  const fresh = n.quests.filter((x) => x.done && !was.has(x.id));
  if (!fresh.length) return;
  const x = fresh[fresh.length - 1];
  const gain = (next.efs.pool > prev.efs.pool || next.coins > prev.coins) ? rewardText(x.reward) : '';
  toast(`Schritt geschafft: ${x.title}${gain ? ' · ' + gain : ''}`, 'good');
  if (window.TPMotion) window.TPMotion.confetti();
}
