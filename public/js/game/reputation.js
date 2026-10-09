/* Ruf und Ansehen (Oberfläche): Karte in der Übersicht, Detailfenster, Plaketten in Listen, Ehrenbürgerwürde. Daten: /api/reputation */
import { html, raw, icon, api, on, modal, bar, term, toast, esc } from './ui.js';

/** Stufen (wie src/game/reputation.js). */
export const LEVELS = [
  { idx: -2, name: 'Verrufen', tone: 'bad', ic: 'ban' },
  { idx: -1, name: 'Zweifelhaft', tone: 'warn', ic: 'triangle-alert' },
  { idx: 0, name: 'Unbekannt', tone: 'dim', ic: 'user' },
  { idx: 1, name: 'Anständig', tone: 'good', ic: 'badge-check' },
  { idx: 2, name: 'Angesehen', tone: 'good', ic: 'star' },
  { idx: 3, name: 'Honoratior', tone: 'gold', ic: 'trophy' },
  { idx: 4, name: 'Ehrenbürger', tone: 'gold', ic: 'crown' },
];
export const lvInfo = (lv) => LEVELS[Math.max(-2, Math.min(4, Math.round(Number(lv) || 0))) + 2];
const num1 = (x) => (Math.round(x * 10) / 10).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 1 });
const sgn = (x) => `${x >= 0 ? '+' : '−'}${num1(Math.abs(x))}`;

/** Plakette mit Stufenname. */
export const repChip = (lv, { title = 'Ansehen' } = {}) => { const i = lvInfo(lv); return html`<span class="chip rep ${i.tone}" title="${title}: ${i.name}">${icon(i.ic)} <span>${i.name}</span></span>`; };
/** Platzhalter für die Plakette eines Spielers (wird automatisch gefüllt). */
export const repBadge = (uid, cityId = 0) => (uid ? raw(`<span class="rep-badge" data-repuid="${Number(uid)}"${cityId ? ` data-repcity="${Number(cityId)}"` : ''}></span>`) : '');

/* ---------- Plaketten automatisch füllen (eine Abfrage für alle sichtbaren Spieler) ---------- */
const BADGES = new Map(); // "uid|city" -> {lv, at}
let pending = false;
async function fillBadges() {
  pending = false;
  const els = [...document.querySelectorAll('.rep-badge[data-repuid]:not([data-done])')];
  if (!els.length) return;
  const groups = new Map();
  for (const el of els) {
    const key = `${el.dataset.repuid}|${el.dataset.repcity || 0}`; const hit = BADGES.get(key);
    if (hit && Date.now() - hit.at < 90000) { paint(el, hit.lv); continue; }
    const c = el.dataset.repcity || '0'; if (!groups.has(c)) groups.set(c, new Set()); groups.get(c).add(el.dataset.repuid);
  }
  for (const [city, ids] of groups) {
    const list = [...ids].slice(0, 100);
    try {
      const r = await api('GET', `/api/reputation/badges?ids=${list.join(',')}${city !== '0' ? `&cityId=${city}` : ''}`);
      for (const id of list) { const b = r.badges[id]; BADGES.set(`${id}|${city}`, { lv: b ? b.lv : 0, at: Date.now() }); }
    } catch (_) { /* ohne Plakette weiter */ }
  }
  for (const el of document.querySelectorAll('.rep-badge[data-repuid]:not([data-done])')) { const hit = BADGES.get(`${el.dataset.repuid}|${el.dataset.repcity || 0}`); if (hit) paint(el, hit.lv); }
}
function paint(el, lv) { el.dataset.done = '1'; el.innerHTML = repChip(lv).__raw; }
let started = false;
export function startBadges() {
  if (started) return; started = true;
  const kick = () => { if (!pending) { pending = true; setTimeout(fillBadges, 140); } };
  new MutationObserver((muts) => { for (const m of muts) { if (m.addedNodes.length) { kick(); return; } } }).observe(document.body, { childList: true, subtree: true });
  kick();
}

/* ---------- Karte in der Übersicht ---------- */
export function standingCard(ctx) {
  const r = ctx.view.rep || { lv: 0, ll: 0, name: 'Unbekannt', s: 0 };
  const i = lvInfo(r.lv);
  return html`<section class="card rep-card mt" id="repCard" data-spot="standing">
    <div class="row spread nowrap"><div class="card-title" style="margin:0">${icon('badge-check')} ${term('Ansehen', 'Ansehen & Ruf')}</div><button class="btn sm" data-rep-open="1">Alle Details</button></div>
    <div class="rep-level mt"><span class="chip rep ${i.tone}">${icon(i.ic)} <span>${i.name}</span></span><span class="dim small"><span>Vor Ort:</span> <span>${lvInfo(r.ll).name}</span></span></div>
    <div id="repBody"><div class="skel" style="height:56px;margin-top:.6rem"></div></div></section>`;
}

function whyDialog(e) {
  const kindHint = { rel: 'Rechnungen pünktlich zahlen und Verträge einhalten.', trade: 'Fair handeln, Angebote beantworten und zuverlässig liefern.', civic: 'Mitspielern helfen, Menschen beschäftigen und Steuern zahlen.', office: 'Wahlen gewinnen und Ämter ordentlich ausfüllen.', scandal: 'Skandale vermeiden – sie flauen nur langsam ab.' }[e.kind] || '';
  modal(html`<h3>${icon('info')} Warum hat sich mein Ruf geändert?</h3>
    <ol class="info-steps"><li><div><b>Was ist passiert?</b><span>${e.label}</span> <b>${sgn(e.delta)}</b> <span>Punkte</span>${e.n > 1 ? html` <span class="dim">(${e.n}×)</span>` : ''}</div></li>
      ${e.why ? html`<li><div><b>Warum ist das wichtig?</b>${e.why}</div></li>` : ''}
      <li><div><b>Was kann ich tun?</b><span>${e.delta < 0 ? 'Zahle Rechnungen pünktlich und halte dich an Verträge – dann erholt sich dein Ansehen mit der Zeit.' : kindHint}</span></div></li></ol>
    <div class="row end mt"><button class="btn primary" data-close="1">Verstanden</button></div>`);
}

const changeRow = (e, i) => html`<div class="rep-chg"><b class="${e.delta >= 0 ? 'pos' : 'neg'}">${sgn(e.delta)}</b><span class="grow">${e.label}${e.n > 1 ? html` <span class="dim">(${e.n}×)</span>` : ''}</span><button class="btn sm ghost" data-rep-why="${i}">Warum?</button></div>`;

export async function bindStanding(root, ctx) {
  const card = root.querySelector('#repCard'); if (!card) return;
  const body = card.querySelector('#repBody');
  on(card, 'click', '[data-rep-open]', () => openStanding(ctx));
  let d;
  try { d = await api('GET', '/api/reputation'); } catch (_) { body.innerHTML = ''; return; }
  if (!card.isConnected) return;
  ctx.__rep = d;
  const i = lvInfo(d.level); const p = d.progress;
  const head = card.querySelector('.rep-level');
  if (head) head.innerHTML = html`<span class="chip rep ${i.tone}">${icon(i.ic)} <span>${i.name}</span></span><span class="dim small"><span>Vor Ort:</span> <span>${lvInfo(d.localLevel).name}</span></span>`.__raw;
  const top = d.top.length ? d.top : [];
  body.innerHTML = html`
    ${p.next != null ? html`${bar(p.pct * 100, i.tone === 'bad' || i.tone === 'warn' ? 'bad' : '')}<div class="dim small"><span>Noch</span> <b>${num1(Math.max(0, p.next - d.score))}</b> <span>Punkte bis</span> <b>${d.nextName}</b> · <span>Punktestand</span> <b>${num1(d.score)}</b></div>` : html`<div class="dim small"><span>Höchste Stufe erreicht</span> · <span>Punktestand</span> <b>${num1(d.score)}</b></div>`}
    <div class="rep-top mt">${top.length ? html`<div class="small dim">Das hat sich zuletzt am meisten geändert:</div>${top.map((e) => changeRow(e, d.ledger.indexOf(e)))}` : html`<div class="dim small">Noch keine Veränderungen. Zahle Miete und Steuern pünktlich, handle fair und hilf anderen – so wächst dein Ansehen.</div>`}</div>`.__raw;
  on(card, 'click', '[data-rep-why]', (e, t) => { const en = d.ledger[Number(t.dataset.repWhy)]; if (en) whyDialog(en); });
}

/* ---------- Detailfenster ---------- */
export async function openStanding(ctx) {
  let d = ctx.__rep;
  try { d = await api('GET', '/api/reputation'); ctx.__rep = d; } catch (e) { if (!d) { toast(e.message, 'bad'); return; } }
  const i = lvInfo(d.level);
  const fx = d.effects;
  const effRows = [
    ['Kreditzins', fx.creditRate === 0 ? 'unverändert' : html`<b>${fx.creditRate < 0 ? '−' : '+'}${num1(Math.abs(fx.creditRate))}</b> <span>Prozentpunkte</span>`],
    ['Kreditrahmen', fx.creditLimit === 1 ? 'unverändert' : `${fx.creditLimit > 1 ? '+' : '−'}${Math.round(Math.abs(fx.creditLimit - 1) * 100)} %`],
    ['Preisrahmen bei Lieferverträgen', fx.contractBand === 0 ? 'unverändert' : html`<span>${fx.contractBand > 0 ? 'weiter um' : 'enger um'}</span> <b>${num1(Math.abs(fx.contractBand))}</b> <span>Punkte</span>`],
    ['Mieter-Nachfrage (örtlich)', fx.tenantDemand === 1 ? 'unverändert' : `${fx.tenantDemand > 1 ? '+' : '−'}${Math.round(Math.abs(fx.tenantDemand - 1) * 100)} %`],
    ['Mietausfälle (örtlich)', fx.arrears === 1 ? 'unverändert' : `${fx.arrears < 1 ? '−' : '+'}${Math.round(Math.abs(fx.arrears - 1) * 100)} %`],
  ];
  const m = modal(html`<div class="rep-modal">
    <div class="row spread nowrap"><h3 style="margin:0">${icon('badge-check')} Dein Ansehen</h3><button class="btn ghost sm" data-close="x" aria-label="Schließen">${icon('x')}</button></div>
    <p class="dim small">Wie die Leute über dich und deine Familie denken. Es wächst durch ordentliches Verhalten und sinkt durch Ärger.</p>
    <p class="dim small"><span>Erben übernehmen etwa die Hälfte davon:</span> ${term('Familienruf')}</p>
    <div class="rep-ladder">${d.levels.map((l) => html`<span class="chip rep ${lvInfo(l.idx).tone} ${l.idx === d.level ? 'now' : ''}" ${l.from == null ? '' : html`title="ab ${l.from} Punkten"`}>${icon(lvInfo(l.idx).ic)} <span>${l.name}</span></span>`)}</div>
    <div class="rep-two mt"><div><small class="dim">Landesweit</small><div><b>${i.name}</b> <span class="dim small">${num1(d.score)}</span></div></div>
      <div><small class="dim">Vor Ort</small><div><b>${lvInfo(d.localLevel).name}</b> <span class="dim small">${num1(d.local)}</span></div></div></div>
    <div class="dim small">Vor Ort bist du bekannter: Wer in einer Stadt wohnt und handelt, genießt dort mehr Ansehen als anderswo.</div>
    <div class="card-title mt">Fünf Bestandteile</div>
    <div class="stack" style="--gap:.55rem">${d.kinds.map((k) => html`<div><div class="row spread nowrap small"><b>${k.label}</b><span class="mono ${k.key === 'scandal' ? (k.value > 0 ? 'neg' : '') : k.value < 0 ? 'neg' : ''}">${num1(k.value)}</span></div>${bar(Math.max(0, Math.min(100, k.key === 'scandal' ? k.value : (k.value + 40) / 1.4)), k.key === 'scandal' || k.value < 0 ? 'bad' : '')}<div class="dim small">${k.hint}</div></div>`)}</div>
    <div class="card-title mt">Was dein Ansehen bewirkt</div>
    <dl class="kv small">${effRows.map((r) => html`<dt>${r[0]}</dt><dd>${r[1]}</dd>`)}</dl>
    <div class="card-title mt">Was dafür nötig ist</div>
    <div class="stack small" style="--gap:.3rem">${d.gates.map((g) => html`<div class="row spread nowrap"><span>${icon(g.ok ? 'check' : 'lock')} ${g.label}</span><span class="${g.ok ? 'dim' : 'warn'}">${g.minName}</span></div>`)}
      ${d.offices.map((o) => html`<div class="row spread nowrap"><span>${icon('landmark')} <span>Amt:</span> <span>${o.name}</span></span><span class="dim">${o.minName || 'kein Mindestansehen'}</span></div>`)}</div>
    <div class="card-title mt">So steigerst du dein Ansehen</div>
    <div class="stack small" style="--gap:.4rem">${d.tips.map((t) => html`<div class="row nowrap" style="align-items:flex-start;gap:.5rem">${icon(t.icon)}<div><b>${t.title}</b><div class="dim">${t.text}</div></div></div>`)}</div>
    <div class="card-title mt">Letzte Veränderungen</div>
    ${d.ledger.length ? html`<div class="rep-log">${d.ledger.slice(0, 20).map((e, k) => changeRow(e, k))}</div>` : html`<div class="dim small">Noch nichts verzeichnet.</div>`}
    <div class="row end mt"><button class="btn primary" data-close="x">Schließen</button></div></div>`, { wide: true });
  on(m.el, 'click', '[data-rep-why]', (e, t) => { const en = d.ledger[Number(t.dataset.repWhy)]; if (en) whyDialog(en); });
}

/* ---------- Ehrenbürgerwürde (Bürgermeister, Reiter „Gesellschaft“) ---------- */
export function honorSkeleton() {
  return html`<section class="card mt" id="honorCard" hidden><div class="card-title">${icon('crown')} Ehrenbürgerwürde ${term('Ehrenbürger')}</div><div id="honorBody"></div></section>`;
}
export async function bindHonor(root, ctx) {
  const card = root.querySelector('#honorCard'); if (!card) return;
  const t = ctx.view.politics && ctx.view.politics.term;
  if (!t || t.idx !== 2) return;
  let d; try { d = await api('GET', '/api/reputation/honor'); } catch (_) { return; }
  card.hidden = false; const body = card.querySelector('#honorBody');
  body.innerHTML = html`<p class="small dim">Als Bürgermeister darfst du in deiner Amtszeit einem Bürger der Stadt die Würde verleihen: ${d.effects.civic} Punkte Gemeinwohl und ${d.effects.localPts} Punkte örtliches Ansehen für ihn, ein wenig Amtsansehen für dich. Vorher siehst du eine Vorschau.</p>
    ${d.available ? (d.candidates.length ? html`<div class="stack" style="--gap:.4rem">${d.candidates.map((c) => html`<div class="row nowrap spread"><div class="grow"><b data-i18n-skip>${c.name}</b> <span class="dim small" data-i18n-skip>@${c.username}</span> ${repChip(c.lv)}</div><button class="btn sm" data-honor="${c.userId}">Vorschau</button></div>`)}</div>` : html`<div class="dim small"><span>Zurzeit gibt es in deiner Stadt niemanden mit genug Ansehen. Nötig:</span> <b>${d.minName}</b></div>`) : html`<div class="alert info small">${icon('info')}<div>${d.why || (d.used ? 'In dieser Amtszeit hast du die Würde schon verliehen.' : 'Zurzeit nicht möglich.')}</div></div>`}`.__raw;
  on(body, 'click', '[data-honor]', async (e, b) => {
    const userId = Number(b.dataset.honor);
    let pv; try { pv = await api('POST', '/api/reputation/honor/preview', { userId }); } catch (er) { toast(er.message, 'warn'); return; }
    const ok = await ctx.confirm({ title: `${pv.target.name} zum Ehrenbürger ernennen?`, text: pv.text, ok: 'Würde verleihen' });
    if (!ok) return;
    try { const r = await api('POST', '/api/reputation/honor/grant', { userId }); if (r.view) { ctx.setView(r.view); ctx.hud(); } toast(`${r.name} ist jetzt Ehrenbürger.`); if (window.TPMotion) window.TPMotion.confetti(); ctx.rerender(); } catch (er) { toast(er.message, 'warn'); }
  });
}
void esc;
