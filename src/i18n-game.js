'use strict';
/**
 * Übersetzt Spieltexte (Meldungen, Zeitung, Berufe, Städte, Fehler) für Spieler mit lang=en.
 * Der Spielstand speichert fertigen deutschen Text; hier wird er zur Anzeige zurückübersetzt:
 * exakte Treffer + Vorlagen (Platzhalter ${…} bzw. {name}) → englische Vorlage.
 * Texte, die nicht passen (z. B. im Admin geänderte Vorlagen, Spielereingaben), bleiben unverändert.
 */
const path = require('path');
const fs = require('fs');

const EXACT = new Map();
const BUCKETS = new Map(); // erste 6 Zeichen des festen Textanfangs → Vorlagen
const GENERAL = [];
const CACHE = new Map();
let LOADED = false;

const DEMONYMS = { 'Kölner': 'Cologne', 'Münchner': 'Munich', 'Berliner': 'Berlin', 'Hamburger': 'Hamburg', 'Bremer': 'Bremen', 'Saarbrücker': 'Saarbrücken', 'Frankfurter': 'Frankfurt', 'Freiburger': 'Freiburg' };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Zerlegt einen Text mit ${ausdruck} (auch mit verschachtelten Klammern) in feste und variable Teile. */
function tokenizeJs(s) {
  const out = []; let lit = ''; let i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let d = 1, j = i + 2;
      while (j < s.length && d > 0) { if (s[j] === '{') d++; else if (s[j] === '}') d--; j++; }
      if (d !== 0) { lit += s.slice(i); break; }
      out.push({ lit }); lit = '';
      out.push({ expr: s.slice(i + 2, j - 1) });
      i = j;
    } else { lit += s[i]; i++; }
  }
  out.push({ lit });
  return out;
}
const tokenizeNamed = (s) => {
  const out = []; let last = 0; const re = /\{(\w+)\}/g; let m;
  while ((m = re.exec(s))) { out.push({ lit: s.slice(last, m.index) }); out.push({ expr: m[1] }); last = m.index + m[0].length; }
  out.push({ lit: s.slice(last) });
  return out;
};

function addPair(de, en, tokenizer) {
  if (typeof de !== 'string' || typeof en !== 'string' || !de || de === en) return;
  const dt = tokenizer(de);
  const exprs = dt.filter((t) => t.expr !== undefined).map((t) => t.expr);
  if (!exprs.length) { if (!EXACT.has(de)) EXACT.set(de, en); return; }
  const et = tokenizer(en); const used = new Set(); const order = [];
  for (const t of et) {
    if (t.expr === undefined) { order.push({ lit: t.lit }); continue; }
    let idx = exprs.findIndex((x, k) => x === t.expr && !used.has(k));
    if (idx < 0) idx = exprs.findIndex((x) => x === t.expr);
    if (idx < 0) return; // unpassende Vorlage ignorieren
    used.add(idx); order.push({ g: idx });
  }
  let src = '^'; const first = dt[0].lit;
  for (const t of dt) src += t.expr !== undefined ? '(.+?)' : esc(t.lit);
  src += '$';
  const entry = { re: new RegExp(src, 's'), order };
  const key = first.length >= 6 ? first.slice(0, 6) : null;
  if (key) { if (!BUCKETS.has(key)) BUCKETS.set(key, []); BUCKETS.get(key).push(entry); } else GENERAL.push(entry);
}

function pairUp(de, en, out) {
  if (typeof de === 'string') { if (typeof en === 'string') out.push([de, en]); return; }
  if (Array.isArray(de) && Array.isArray(en)) de.forEach((x, i) => pairUp(x, en[i], out));
  else if (de && en && typeof de === 'object' && typeof en === 'object') for (const k of Object.keys(de)) pairUp(de[k], en[k], out);
}

function load() {
  if (LOADED) return; LOADED = true;
  const dir = path.join(__dirname, 'i18n-data');
  const tryReq = (f) => { try { return require(path.join(dir, f)); } catch (_) { return null; } };
  for (const f of ['messages-G', 'messages-E', 'messages-D', 'messages-A', 'messages-B', 'messages-C', 'messages-F', 'messages-I', 'messages-J', 'messages-K', 'messages-L']) (tryReq(f) || []).forEach(([de, en]) => addPair(de, en, tokenizeJs));
  (tryReq('extra') || []).forEach(([de, en]) => addPair(de, en, tokenizeJs));
  (tryReq('names-en') || []).forEach(([de, en]) => addPair(de, en, tokenizeJs));
  const en = tryReq('texts-en');
  if (en) {
    const de = require('./game/text-defaults');
    const pairs = [];
    for (const k of ['press', 'paper', 'news', 'guide']) if (en[k]) pairUp(de[k], en[k], pairs);
    pairs.forEach(([a, b]) => addPair(a, b, tokenizeNamed));
  }
}

function applyEntry(e, m) {
  return e.order.map((t) => (t.g !== undefined ? tr(m[t.g + 1]) : t.lit)).join('');
}

/**
 * Übersetzt einen Spieltext. Eigennamen (Betriebe, Personen, Städte, Chat, Briefe) werden nie nach dem
 * Kopfwort-Muster („Großbäckerei Koch“ → „Large bakery Koch“) verändert; das geschieht nur mit opts.head
 * (allgemeine Listen wie Anzeigen). Platzhalter-Teile in Vorlagen werden nur bei exaktem Treffer übersetzt.
 */
function tr(s, opts) {
  if (typeof s !== 'string' || s.length < 2) return s;
  const head = !!(opts && opts.head);
  const ck = head ? '\u0001' + s : s;
  if (CACHE.has(ck)) return CACHE.get(ck);
  load();
  let r = EXACT.get(s);
  if (r === undefined) {
    const lst = BUCKETS.get(s.slice(0, 6));
    if (lst) for (const e of lst) { const m = e.re.exec(s); if (m) { r = applyEntry(e, m); break; } }
    if (r === undefined) for (const e of GENERAL) { const m = e.re.exec(s); if (m) { r = applyEntry(e, m); break; } }
  }
  if (r === undefined && s.length <= 60) { // Kopfwort-Regel nur für allgemeine Listen; Kölner Tageblatt immer
    const sp = s.indexOf(' ');
    if (sp > 3) {
      const h0 = s.slice(0, sp); const tail = s.slice(sp + 1);
      const hw = head ? EXACT.get(h0) : undefined;
      if (head && hw) r = `${hw} ${tail}`;
      else if (/er$/.test(h0) && EXACT.has(tail) && /^(Tageblatt|Anzeiger|Kurier|Nachrichten|Zeitung)$/.test(tail)) { // „Kölner Tageblatt“
        const city = DEMONYMS[h0] || h0.replace(/er$/, '');
        r = `${city} ${EXACT.get(tail)}`;
      }
    }
  }
  if (r === undefined && s.length <= 140 && /(: |, )/.test(s)) { // „Sturmschaden: Großes Haus, Lindenallee 12“
    const parts = s.split(/(: |, )/); const out = parts.map((x) => (x === ': ' || x === ', ' ? x : tr(x, opts)));
    if (out.some((x, i) => x !== parts[i])) r = out.join('');
  }
  if (r === undefined) r = s;
  else if (/^[A-ZÄÖÜ]/.test(s) && /^[a-z]/.test(r)) r = r[0].toUpperCase() + r.slice(1);
  if (r !== s) r = r.replace(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?(?=\s?(?:DM|€|k|m|b|t)\b| \(1945 value\))/g, (x) => (/[.,]/.test(x) ? x.replace(/[.,]/g, (c) => (c === '.' ? ',' : '.')) : x)); // englische Zahlenschreibweise
  if (r !== s) r = r.replace(/(\d),(\d{1,2})(?= ?%)/g, '$1.$2');
  if (CACHE.size > 20000) CACHE.clear();
  CACHE.set(ck, r);
  return r;
}

/* Spielereingaben: nie übersetzen. Namen von Betrieben/Personen/Orten: nur exakte Treffer (z. B. „München“ → „Munich“). */
const SKIP_KEYS = new Set(['username', 'bio', 'sid']);
const NAME_KEYS = new Set(['name', 'firm', 'firmName', 'company', 'companyName', 'owner', 'ownerName', 'other', 'from', 'to', 'charName', 'char_name', 'proposerName', 'sellerName', 'buyerName', 'bidder', 'leader', 'employer', 'employee', 'partner', 'spouse']);
const SOCIAL_FREE = new Set(['text', 'body', 'message', 'msg', 'title']); // nur unter /social
const LETTER_KEYS = new Set(['subject', 'body', 'preview', 'text']);
function exactOnly(s) {
  if (typeof s !== 'string' || s.length < 2) return s;
  load();
  const r = EXACT.get(s);
  if (r === undefined) return s;
  return /^[A-ZÄÖÜ]/.test(s) && /^[a-z]/.test(r) ? r[0].toUpperCase() + r.slice(1) : r;
}
function deep(v, key, ctx) {
  if (typeof v === 'string') {
    if (SKIP_KEYS.has(key) || (ctx && ctx.verbatim && ctx.verbatim.has(key))) return v;
    if (NAME_KEYS.has(key)) return exactOnly(v);
    return tr(v);
  }
  if (Array.isArray(v)) return v.map((x) => deep(x, key, ctx));
  if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
    const o = {};
    // Briefe von Spielern: Betreff/Text sind Spielereingaben; Systembriefe sind Vorlagen und werden übersetzt
    const own = ctx && ctx.social && v.kind === 'letter' ? LETTER_KEYS : null;
    for (const k of Object.keys(v)) o[k] = own && own.has(k) ? v[k] : deep(v[k], k, ctx);
    return o;
  }
  return v;
}

/** Middleware: übersetzt JSON-Antworten der API für englische Spieler. */
function apiMiddleware(req, res, next) {
  if (req.lang === 'en') {
    const ctx = /^\/social\b/.test(req.path) ? { social: true, verbatim: SOCIAL_FREE } : {};
    const j = res.json.bind(res); res.json = (body) => j(deep(body, undefined, ctx));
  }
  next();
}

module.exports = { tr, deep, exactOnly, apiMiddleware, load, _stats: () => ({ exact: EXACT.size, buckets: BUCKETS.size, general: GENERAL.length }) };
