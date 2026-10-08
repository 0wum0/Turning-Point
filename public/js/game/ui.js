// UI-Helfer: sicheres HTML-Templating, Formatierung, Dialoge, Toasts, API
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
const toStr = (v) => {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(toStr).join('');
  if (typeof v === 'object' && '__raw' in v) return v.__raw;
  return esc(v);
};
export const raw = (s) => ({ __raw: String(s) });
/** Tagged Template: alle Interpolationen werden escaped, außer html`` / raw(). */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += toStr(vals[i]); });
  return { __raw: out };
}
export const mount = (el, h) => { el.innerHTML = toStr(h); return el; };

export const icon = (name, cls = '') => raw(`<svg class="i ${cls}" aria-hidden="true"><use href="/img/icons.svg#i-${esc(name)}"/></svg>`);

/* ---------- Formatierung ---------- */
/** Kurzform großer Zahlen: 999 · 1k · 12k · 999k · 1m · 5b · 2t (Dezimalzeichen je nach Sprache). */
const EN_LANG = () => document.documentElement.lang === 'en';
export function compact(v) {
  const neg = v < 0; const a = Math.abs(v);
  const dec = EN_LANG() ? '.' : ',';
  let out;
  if (a < 1000) out = String(Math.round(a));
  else {
    const S = ['k', 'm', 'b', 't', 'qa', 'qi']; let i = -1; let x = a;
    while (x >= 1000 && i < S.length - 1) { x /= 1000; i++; }
    if (Math.round(x * 10) / 10 >= 1000 && i < S.length - 1) { x /= 1000; i++; }
    const r = x < 10 ? Math.round(x * 10) / 10 : Math.round(x);
    out = String(r).replace('.', dec) + S[i];
  }
  return (neg ? '−' : '') + out;
}
export function money(cents, cur = 'DM') {
  const sym = cur === 'EUR' ? '€' : 'DM';
  const neg = cents < 0; const abs = Math.abs(Math.round(cents));
  if (abs >= 100000) return `${neg ? '−' : ''}${compact(abs / 100)} ${sym}`; // ab 1.000 verkürzt
  const e = Math.floor(abs / 100); const r = String(abs % 100).padStart(2, '0');
  return `${neg ? '−' : ''}${e},${r} ${sym}`.replace(',', EN_LANG() ? '.' : ',');
}
export const moneyShort = (cents, cur) => `${compact(cents / 100)} ${cur === 'EUR' ? '€' : 'DM'}`;
/** Kennzeichnung für Teammitglieder (Admin / Co-Admin / Moderator) als HTML-Text. */
const ROLE_NAMES = { admin: 'Admin', coadmin: 'Co-Admin', moderator: 'Moderator' };
export const roleBadgeStr = (role) => (ROLE_NAMES[role] ? `<span class="rbadge ${role}" title="Team">${ROLE_NAMES[role]}</span>` : '');
export const roleBadge = (role) => raw(roleBadgeStr(role));
export const num = (n) => compact(Math.round(n));
export const signed = (cents, cur) => `${cents >= 0 ? '+' : '−'}${money(Math.abs(cents), cur)}`;
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const yearsText = (days) => { const y = Math.floor(days / 365); const d = days % 365; return y ? `${y} J. ${d ? Math.round(d / 30.4) + ' Mon.' : ''}` : `${d} Tage`; };

/* ---------- API ---------- */
const csrf = () => (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  } catch (e) { const err = new Error('Keine Verbindung zum Server.'); err.api = true; throw err; }
  let data = null;
  try { data = await res.json(); } catch (_) { /* leer */ }
  if (res.status === 503 && data && data.retry && !api._retried) { api._retried = true; await new Promise((r) => setTimeout(r, 2500)); try { return await api(method, url, body); } finally { api._retried = false; } }
  if (res.status === 401) { location.href = '/login?next=/play'; throw new Error('Bitte anmelden.'); }
  if (!res.ok || !data || data.ok === false) { const err = new Error((data && data.error) || `Fehler ${res.status}`); err.api = true; throw err; }
  if (method === 'POST') seenHook(url);
  return data;
}
/* Einsteiger-Aufgaben, die nur außerhalb des Spielstands sichtbar sind (Markt, Wahl, Freunde): erfolgreiche Aufrufe der Oberfläche melden */
function seenHook(url) {
  const k = /\/api\/social\/market\//.test(url) ? 'marketOffer' : /\/api\/social\/elections\/(vote|run)/.test(url) ? 'vote' : /\/api\/social\/friends\/(request|respond)/.test(url) ? 'friend' : '';
  if (k) window.dispatchEvent(new CustomEvent('tp-seen', { detail: k }));
}

import { ping } from './audio.js';
/* ---------- Toasts ---------- */
let toastBox;
export function toast(msg, level = 'good') {
  if (!msg) return;
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'toasts'; toastBox.setAttribute('aria-live', 'polite'); document.body.appendChild(toastBox); }
  const t = document.createElement('div'); t.className = `toast ${level}`;
  const ic = level === 'bad' ? 'circle-alert' : level === 'warn' ? 'triangle-alert' : 'circle-check';
  t.innerHTML = `${toStr(icon(ic))}<div>${esc(msg)}</div>`;
  toastBox.appendChild(t); ping(level === 'good' ? 'good' : level);
  setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 320); }, level === 'bad' ? 6000 : 3800);
}

/* ---------- Modal ---------- */
let modalSeq = 0;
export function modal(content, { wide = false, dismissable = true, onClose } = {}) {
  const back = document.createElement('div'); back.className = 'modal-backdrop';
  const box = document.createElement('div'); box.className = `card modal${wide ? ' wide' : ''}`; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  box.innerHTML = toStr(content);
  back.appendChild(box); document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  const opener = document.activeElement; let closed = false;
  const h = box.querySelector('h1, h2, h3, h4'); if (h) { if (!h.id) h.id = `mh${++modalSeq}`; box.setAttribute('aria-labelledby', h.id); }
  const close = (v) => {
    if (closed) return; closed = true; back.remove(); if (!document.querySelector('.modal-backdrop')) document.body.style.overflow = ''; document.removeEventListener('keydown', onKey);
    if (opener && opener.isConnected && typeof opener.focus === 'function' && !document.querySelector('.modal-backdrop')) { try { opener.focus({ preventScroll: true }); } catch (_) { /* egal */ } }
    if (onClose) onClose(v);
  };
  const onKey = (e) => {
    const top = [...document.querySelectorAll('.modal-backdrop')].pop(); if (top !== back) return; // nur das oberste Fenster reagiert
    if (e.key === 'Escape' && dismissable) { close(); return; }
    if (e.key === 'Tab') { // Fokus bleibt im Dialog
      const f = [...box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0]; const last = f[f.length - 1];
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  if (dismissable) back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  box.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) close(c.dataset.close); });
  const f = box.querySelector('[autofocus], button.primary, button'); if (f) setTimeout(() => f.focus(), 30);
  return { el: box, close };
}
export function confirmBox({ title, text, ok = 'Bestätigen', cancel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    const m = modal(html`<h3>${title}</h3><p class="dim">${text}</p><div class="row end mt"><button class="btn ghost" data-close="no">${cancel}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-close="yes">${ok}</button></div>`, { onClose: (v) => resolve(v === 'yes') });
    return m;
  });
}

/* ---------- ⓘ Info: Problem → Bedeutung → Lösung ---------- */
const infos = new Map(); let infoSeq = 0;
export function infoBtn(info, title = '') {
  if (!info) return '';
  const id = ++infoSeq; infos.set(id, { info, title });
  if (infos.size > 400) infos.delete(infos.keys().next().value);
  return html`<button class="info-btn" type="button" data-info="${id}" aria-label="Erklärung anzeigen">${icon('info')}</button>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-info]'); if (!b) return;
  const d = infos.get(Number(b.dataset.info)); if (!d) return;
  const [what, why, todo] = Array.isArray(d.info) ? d.info : [d.info, '', ''];
  modal(html`<h3>${icon('info')} ${d.title || 'Erklärt'}</h3>
    <ol class="info-steps">
      <li><div><b>Was ist passiert?</b>${what}</div></li>
      ${why ? html`<li><div><b>Warum ist das wichtig?</b>${why}</div></li>` : ''}
      ${todo ? html`<li><div><b>Was kann ich tun?</b>${todo}</div></li>` : ''}
    </ol>
    <div class="row end mt"><button class="btn primary" data-close="1">Verstanden</button></div>`);
});

/* ---------- Bausteine ---------- */
export function ring(value, label, ic, { size = 46, tone } = {}) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone || (v < 25 ? 'bad' : v < 50 ? 'warn' : 'good');
  return html`<div class="ring ${t}" style="--v:${v};--s:${size}px" title="${label}: ${Math.round(v)} %"><span>${icon(ic)}</span></div>`;
}
export function bar(value, tone = '') { return html`<div class="bar ${tone}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>`; }

export function btnBusy(btn, fn) {
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  return Promise.resolve().then(fn).finally(() => { btn.disabled = false; btn.innerHTML = label; });
}
export function on(root, ev, sel, handler) {
  root.addEventListener(ev, (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) handler(e, t); });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
