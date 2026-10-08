'use strict';
/**
 * Web-Push (VAPID) für die installierte PWA: ein Aufruf notify(userId, { title, body, tab, tag, cat })
 * schickt – falls der Spieler es erlaubt hat – eine Benachrichtigung ans Handy.
 * Leitplanken: Admin-Schalter, keine Pushes an gesperrte Konten, Ruhezeiten (Standard 22–7 Uhr in der
 * Zeitzone des Geräts), höchstens N Pushes je Spieler und Stunde, Zusammenfassen per Tag/Topic,
 * tote Abos (404/410) werden gelöscht. Die VAPID-Schlüssel entstehen beim ersten Bedarf und liegen in
 * der Tabelle `settings` (Schlüssel push.vapid) – nie im Repository.
 */
const crypto = require('crypto');
const db = require('../db');
const settings = require('../settings');
const log = require('./log');

let webpush = null;
try { webpush = require('web-push'); } catch (_) { webpush = null; }

/** Kategorien, die der Spieler einzeln ein-/ausschalten kann (users.meta.push.cats). */
const CATS = ['letters', 'chat', 'offers', 'auctions', 'couples', 'jobs'];
const TABS = { letters: 'letters', chat: 'plaza', offers: 'market', auctions: 'market', couples: 'love', jobs: 'jobs', friends: 'friends' };

const cfg = () => Object.assign({ enabled: true, perHour: 6, quietEnabled: true, quietFrom: 22, quietTo: 7 }, settings.get('push') || {});

/* ---------- Schlüssel ---------- */
let keys = null;
async function ensureKeys() {
  if (keys) return keys;
  if (!webpush) return null;
  let k = settings.get('push.vapid');
  if (!k || !k.publicKey || !k.privateKey) {
    k = webpush.generateVAPIDKeys();
    await settings.set('push.vapid', k);
  }
  keys = k;
  return keys;
}
async function publicKey() { const k = await ensureKeys(); return k ? k.publicKey : null; }
function subject() {
  const m = String(settings.get('site.contact_email') || '');
  return /^[^@\s]+@[^@\s]+$/.test(m) ? `mailto:${m}` : 'mailto:admin@example.org';
}

/* ---------- reine Hilfen (getestet) ---------- */
/** Liegt die Stunde im Ruhefenster? from > to bedeutet über Mitternacht (22–7). */
function inQuiet(hour, from, to) {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}
/** Lokale Stunde (0–23) in einer IANA-Zeitzone; unbekannte Zone → Europe/Berlin. */
function localHour(tz, now = new Date()) {
  for (const z of [tz, 'Europe/Berlin']) {
    try { return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: z }).format(now)); } catch (_) { /* nächste */ }
  }
  return now.getUTCHours();
}
/** Rate-Limit je Nutzer und Stunde (gleitendes Fenster, im Speicher). */
const sent = new Map();
function rateOk(userId, max, now = Date.now()) {
  const arr = (sent.get(userId) || []).filter((t) => now - t < 3600000);
  if (arr.length >= max) { sent.set(userId, arr); return false; }
  arr.push(now); sent.set(userId, arr);
  if (sent.size > 20000) sent.clear();
  return true;
}
function resetLimits() { sent.clear(); }
/** Kategorie aus dem Betreff eines Systembriefs ableiten. */
function categoryFor(subject) {
  const s = String(subject || '');
  if (/überboten|versteiger|zuschlag/i.test(s)) return 'auctions';
  if (/angebot|kauf/i.test(s) && !/jobangebot/i.test(s)) return 'offers';
  if (/bewerbung|jobangebot|team|mitarbeit|arbeitsverh/i.test(s)) return 'jobs';
  if (/heirat|beziehung|anbahnung|antrag|scheidung|trennung|anfrage abgelehnt/i.test(s)) return 'couples';
  return 'letters';
}
/** Vorgabe: alle Kategorien an, solange nichts ausdrücklich ausgeschaltet wurde. */
function catEnabled(prefs, cat) {
  if (!prefs || !prefs.on) return false;
  const c = prefs.cats || {};
  return c[cat] !== false;
}
const topicOf = (tag) => crypto.createHash('sha256').update(String(tag || 'tp')).digest('base64url').slice(0, 32);
const clip = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

function buildPayload({ title, body, tab, tag }) {
  const t = TABS[tab] || tab || 'letters';
  return JSON.stringify({ title: clip(title, 80), body: clip(body, 140), tag: clip(tag || 'tp', 40), url: `/play?stab=${encodeURIComponent(t)}#/social`, tab: t });
}

/* ---------- Versand ---------- */
let sender = null; // Test-Hook: (subscription, payload, options) => Promise
function setSender(fn) { sender = fn; }
async function sendOne(sub, payload, tag) {
  const opts = { TTL: 3600, urgency: 'normal', topic: topicOf(tag) };
  if (sender) return sender(sub, payload, opts);
  const k = await ensureKeys();
  return webpush.sendNotification(sub, payload, Object.assign({ vapidDetails: { subject: subject(), publicKey: k.publicKey, privateKey: k.privateKey } }, opts));
}

/**
 * Hauptfunktion. Wirft nie; Rückgabe { sent, reason }.
 * @param {number} userId
 * @param {{title:string, body?:string, tab?:string, tag?:string, cat?:string, lang?:string}} n
 */
async function notify(userId, n) {
  try {
    const c = cfg();
    if (!c.enabled || (!webpush && !sender)) return { sent: 0, reason: 'off' };
    const u = await db.one('SELECT id, banned, is_bot, meta, lang FROM users WHERE id = ?', [userId]);
    if (!u || u.banned || u.is_bot) return { sent: 0, reason: 'user' };
    let meta = u.meta; if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (_) { meta = {}; } }
    const prefs = (meta && meta.push) || {};
    const cat = n.cat || 'letters';
    if (!n.force && !catEnabled(prefs, cat)) return { sent: 0, reason: 'optout' };
    const subs = await db.query('SELECT id, endpoint, p256dh, auth, tz FROM push_subscriptions WHERE user_id = ?', [userId]);
    if (!subs.length) return { sent: 0, reason: 'nosub' };
    const q = prefs.quiet || {};
    const from = Number.isInteger(q.from) ? q.from : c.quietFrom; const to = Number.isInteger(q.to) ? q.to : c.quietTo;
    const quietOn = q.enabled === undefined ? c.quietEnabled : !!q.enabled;
    if (!n.force && quietOn && inQuiet(localHour(prefs.tz || subs[0].tz), from, to)) return { sent: 0, reason: 'quiet' };
    if (!rateOk(userId, c.perHour)) return { sent: 0, reason: 'rate' };
    let title = n.title; let body = n.body;
    if (u.lang === 'en') {
      if (n.en) { title = n.en.title; body = n.en.body; } else { const g = require('../i18n-game'); title = g.tr(title); if (n.translateBody !== false) body = g.tr(body || ''); }
    }
    const payload = buildPayload({ title, body, tab: n.tab || TABS[cat], tag: n.tag || cat });
    let ok = 0;
    for (const s of subs) {
      try {
        await sendOne({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, n.tag || cat);
        ok++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]).catch(() => {});
        else log.warn('Push fehlgeschlagen:', e && (e.statusCode || e.message));
      }
    }
    if (ok) db.query('UPDATE push_subscriptions SET last_ok_at = NOW() WHERE user_id = ?', [userId]).catch(() => {});
    return { sent: ok };
  } catch (e) {
    return { sent: 0, reason: 'error', error: e && e.message };
  }
}

/** Fire-and-forget für Hooks: nie warten, nie werfen. */
function fire(userId, n) { notify(userId, n).catch(() => {}); }

/* ---------- Abos & Einstellungen ---------- */
const hash = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');
/**
 * Der Server schickt Push-Nachrichten per HTTPS an die Adresse, die der Browser meldet. Ohne Prüfung könnte jeder Spieler
 * interne Adressen (127.0.0.1, 169.254.169.254, Router) anfunken lassen (SSRF). Erlaubt sind nur die Dienste der Browser-Hersteller.
 */
const PUSH_HOSTS = [/^(fcm|android)\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.microsoft\.com$/, /(^|\.)push\.samsung\.com$/, /(^|\.)push\.opera\.com$/];
function pushEndpointAllowed(endpoint) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const h = u.hostname.toLowerCase();
    if (/^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.')) return false; // IP-Adressen und Kurznamen nie
    return PUSH_HOSTS.some((re) => re.test(h));
  } catch (_) { return false; }
}
function validSub(s) {
  return s && typeof s.endpoint === 'string' && /^https:\/\/[^\s]{10,1000}$/.test(s.endpoint) && pushEndpointAllowed(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string'
    && s.keys.p256dh.length <= 200 && s.keys.auth.length <= 100;
}
async function subscribe(userId, sub, tz, ua) {
  if (!validSub(sub)) { const e = new Error('Ungültiges Push-Abo.'); e.status = 400; throw e; }
  const h = hash(sub.endpoint);
  const n = (await db.one('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ? AND endpoint_hash <> ?', [userId, h])).n;
  if (n >= 8) await db.query('DELETE FROM push_subscriptions WHERE user_id = ? ORDER BY id ASC LIMIT 1', [userId]);
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth, tz, ua) VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), endpoint = VALUES(endpoint), p256dh = VALUES(p256dh), auth = VALUES(auth), tz = VALUES(tz), ua = VALUES(ua)`,
    [userId, h, sub.endpoint, sub.keys.p256dh, sub.keys.auth, clip(tz, 60), clip(ua, 160)]);
  await setPrefs(userId, { on: true, tz: clip(tz, 60) });
}
async function unsubscribe(userId, endpoint) {
  if (endpoint) await db.query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [userId, hash(String(endpoint))]);
  else await db.query('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);
  const left = (await db.one('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?', [userId])).n;
  if (!left) await setPrefs(userId, { on: false });
}

function parseMeta(raw) {
  let m = raw; if (typeof m === 'string') { try { m = JSON.parse(m); } catch (_) { m = {}; } }
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
}
async function getMeta(userId) { const r = await db.one('SELECT meta FROM users WHERE id = ?', [userId]); return parseMeta(r && r.meta); }
async function getPrefs(userId) {
  const p = (await getMeta(userId)).push || {};
  const cats = {}; for (const k of CATS) cats[k] = (p.cats || {})[k] !== false;
  const c = cfg();
  const q = p.quiet || {};
  const subs = (await db.one('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?', [userId])).n;
  return { on: !!p.on && subs > 0, devices: subs, cats, quiet: { enabled: q.enabled === undefined ? !!c.quietEnabled : !!q.enabled, from: Number.isInteger(q.from) ? q.from : c.quietFrom, to: Number.isInteger(q.to) ? q.to : c.quietTo } };
}
/** Reine Funktion: wendet eine Änderung auf meta.push an (nur bekannte Felder, Stunden 0–23). */
function applyPatch(cur, patch) {
  const next = Object.assign({}, cur);
  if (patch.on !== undefined) next.on = !!patch.on;
  if (patch.tz) next.tz = String(patch.tz);
  if (patch.cats && typeof patch.cats === 'object') { next.cats = Object.assign({}, cur.cats); for (const k of CATS) if (k in patch.cats) next.cats[k] = !!patch.cats[k]; }
  if (patch.quiet && typeof patch.quiet === 'object') {
    const h = (v, d) => (v !== '' && v !== null && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 23 ? Number(v) : d);
    next.quiet = Object.assign({}, cur.quiet, { enabled: !!patch.quiet.enabled, from: h(patch.quiet.from, 22), to: h(patch.quiet.to, 7) });
  }
  return next;
}
async function setPrefs(userId, patch) { return writePush(userId, (cur) => applyPatch(cur, patch)); }
async function writePush(userId, build) {
  // Optimistisch: nur schreiben, wenn sich meta seit dem Lesen nicht geändert hat (Spielstand-Speichern schreibt meta ebenfalls)
  for (let i = 0; i < 4; i++) {
    const r = await db.one('SELECT meta FROM users WHERE id = ?', [userId]); if (!r) return null;
    const meta = parseMeta(r.meta); const next = build(meta.push || {}); meta.push = next;
    const res = await db.query('UPDATE users SET meta = ? WHERE id = ? AND meta <=> ?', [JSON.stringify(meta), userId, r.meta]);
    if (res && res.affectedRows !== 0) return next;
  }
  return null;
}

module.exports = { pushEndpointAllowed, notify, fire, publicKey, subscribe, unsubscribe, getPrefs, setPrefs, categoryFor, applyPatch, inQuiet, localHour, rateOk, resetLimits, buildPayload, catEnabled, setSender, topicOf, CATS, TABS };
