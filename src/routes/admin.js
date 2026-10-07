'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db');
const settings = require('../settings');
const worldSvc = require('../game/world');
const mailer = require('../lib/mailer');
const log = require('../lib/log');
const { audit } = require('../lib/audit');
const { randomToken } = require('../lib/security');
const APP_VERSION = require('../../package.json').version;

const router = express.Router();

/* ---------- Zugriff ---------- */
router.use((req, res, next) => {
  if (!req.user) return res.redirect('/login?next=/admin');
  if (req.user.role !== 'admin') return res.status(403).render('error', { code: 403, title: 'Kein Zugriff', message: 'Dieser Bereich ist nur für Administratoren.' });
  res.locals.adminNav = true;
  res.locals.era = 1;
  next();
});
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };
const back = (req, res, fallback) => res.redirect(req.get('referer') && req.get('referer').includes('/admin') ? req.get('referer') : fallback);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

/* ---------- Dashboard ---------- */
router.get('/', wrap(async (req, res) => {
  const [u] = await db.query("SELECT COUNT(*) total, SUM(created_at > NOW() - INTERVAL 7 DAY) week, SUM(last_seen_at > NOW() - INTERVAL 1 DAY) active, COALESCE(SUM(coins),0) coins, COALESCE(SUM(efs_pool),0) efs, SUM(banned) banned FROM users");
  const [c] = await db.query("SELECT SUM(status='alive') alive, SUM(status='dead') dead, SUM(status='gameover') ended, COUNT(*) total, MAX(generation) maxgen FROM characters");
  const [a] = await db.query('SELECT COUNT(*) n, COALESCE(SUM(reward),0) coins FROM ad_claims WHERE claimed_at > ?', [Date.now() - 86400000]);
  const [p] = await db.query("SELECT COUNT(*) n, COALESCE(SUM(price_cents),0) cents FROM purchases WHERE status='completed'");
  const regs = await db.query("SELECT DATE(created_at) d, COUNT(*) n FROM users WHERE created_at > NOW() - INTERVAL 14 DAY GROUP BY DATE(created_at) ORDER BY d");
  const recent = await db.query('SELECT id, username, role, created_at, last_seen_at FROM users ORDER BY id DESC LIMIT 6');
  const alive = await db.query("SELECT c.id, c.name, c.game_day, c.money, c.generation, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.status='alive' ORDER BY c.updated_at DESC LIMIT 6");
  const startYear = settings.get('game.start_year');
  res.render('admin/dashboard', { title: 'Dashboard', active: 'dashboard', u, c, a, p, regs, recent, alive: alive.map((x) => ({ ...x, year: startYear + Math.floor(x.game_day / 365) })) });
}));

/* ---------- Spieler ---------- */
router.get('/users', wrap(async (req, res) => {
  const q = clean(req.query.q, 60);
  const page = Math.max(1, int(req.query.page, 1));
  const per = 25;
  const where = q ? 'WHERE username LIKE ? OR email LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`] : [];
  const total = (await db.one(`SELECT COUNT(*) n FROM users ${where}`, params)).n;
  const rows = await db.query(`SELECT id, username, email, role, banned, coins, efs_pool, created_at, last_seen_at FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, per, (page - 1) * per]);
  res.render('admin/users', { title: 'Spieler', active: 'users', rows, q, page, pages: Math.max(1, Math.ceil(total / per)), total });
}));

router.get('/users/:id', wrap(async (req, res) => {
  const u = await db.one('SELECT id, username, email, role, banned, ban_reason, email_verified, coins, efs_pool, meta, created_at, last_login_at, last_seen_at FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).render('error', { code: 404, title: 'Spieler nicht gefunden', message: '' });
  const chars = await db.query('SELECT id, cycle, generation, status, name, game_day, money, end_reason, created_at FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 30', [u.id]);
  const startYear = settings.get('game.start_year');
  const audits = await db.query('SELECT action, detail, ip, created_at FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 15', [u.id]);
  res.render('admin/user', { title: u.username, active: 'users', u, chars: chars.map((x) => ({ ...x, year: startYear + Math.floor(x.game_day / 365) })), audits });
}));

router.post('/users/:id/:action', wrap(async (req, res) => {
  const id = int(req.params.id);
  const u = await db.one('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) return res.redirect('/admin/users');
  const self = id === req.user.id;
  const act = req.params.action;
  if (act === 'coins') { const n = int(req.body.amount); await db.query('UPDATE users SET coins = GREATEST(0, coins + ?) WHERE id = ?', [n, id]); flash(req, 'good', `${n >= 0 ? '+' : ''}${n} Coins gebucht.`); }
  else if (act === 'efs') { const n = int(req.body.amount); await db.query('UPDATE users SET efs_pool = GREATEST(0, efs_pool + ?) WHERE id = ?', [n, id]); flash(req, 'good', `${n >= 0 ? '+' : ''}${n} EFS gebucht.`); }
  else if (act === 'ban') { if (self) { flash(req, 'bad', 'Du kannst dich nicht selbst sperren.'); } else { await db.query('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?', [clean(req.body.reason, 200) || null, id]); await db.query('DELETE FROM sessions WHERE data LIKE ?', [`%"userId":${id}%`]); flash(req, 'good', 'Spieler gesperrt.'); } }
  else if (act === 'unban') { await db.query('UPDATE users SET banned = 0, ban_reason = NULL WHERE id = ?', [id]); flash(req, 'good', 'Sperre aufgehoben.'); }
  else if (act === 'role') { if (self) flash(req, 'bad', 'Die eigene Rolle kann nicht geändert werden.'); else { const r = req.body.role === 'admin' ? 'admin' : 'player'; await db.query('UPDATE users SET role = ? WHERE id = ?', [r, id]); flash(req, 'good', `Rolle: ${r}`); } }
  else if (act === 'password') {
    const pw = randomToken(6);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(pw, 11), id]);
    flash(req, 'good', `Neues Passwort für ${u.username}: ${pw} (jetzt notieren – wird nicht erneut angezeigt).`);
  } else if (act === 'verify') { await db.query('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?', [id]); flash(req, 'good', 'E-Mail als bestätigt markiert.'); }
  else if (act === 'reset-character') { await db.query("UPDATE characters SET status = 'gameover', end_reason = 'Vom Admin zurückgesetzt' WHERE user_id = ? AND status IN ('alive','dead')", [id]); flash(req, 'good', 'Aktueller Charakter beendet – der Spieler kann ein neues Leben beginnen.'); }
  else if (act === 'delete') { if (self) flash(req, 'bad', 'Du kannst dich nicht selbst löschen.'); else { await db.query('DELETE FROM users WHERE id = ?', [id]); await audit(req, 'admin_delete_user', u.username); flash(req, 'good', 'Konto gelöscht.'); return res.redirect('/admin/users'); } }
  await audit(req, `admin_user_${act}`, `${u.username}`);
  res.redirect(`/admin/users/${id}`);
}));

/* ---------- Bilder-Upload (liegt AUSSERHALB des App-Ordners) ---------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 2 } });
function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ['png', 'image/png'];
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['jpg', 'image/jpeg'];
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return ['webp', 'image/webp'];
  if (buf.length > 6 && buf.toString('ascii', 0, 3) === 'GIF') return ['gif', 'image/gif'];
  return null;
}
async function saveImage(file, kind, userId) {
  const t = file && sniff(file.buffer);
  if (!t) throw new Error('Nur PNG, JPG, WEBP oder GIF (max. 4 MB) sind erlaubt.');
  const safeKind = ['cities', 'misc'].includes(kind) ? kind : 'misc';
  const name = `${crypto.randomBytes(12).toString('hex')}.${t[0]}`;
  const dir = path.join(config.paths.uploadsDir, safeKind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), file.buffer, { mode: 0o644 });
  await db.query('INSERT INTO media (filename, original, mime, size, kind, created_by) VALUES (?,?,?,?,?,?)', [`${safeKind}/${name}`, clean(file.originalname, 200), t[1], file.size, safeKind, userId]);
  return `${safeKind}/${name}`;
}
function dropFile(rel) {
  try { if (/^(cities|misc)\/[a-f0-9]{24}\.(png|jpg|webp|gif)$/.test(rel)) fs.unlinkSync(path.join(config.paths.uploadsDir, rel)); } catch (_) { /* ignorieren */ }
}
const handleUpload = (field) => (req, res, next) => upload.single(field)(req, res, (err) => {
  if (err) { flash(req, 'bad', err.code === 'LIMIT_FILE_SIZE' ? 'Die Datei ist größer als 4 MB.' : err.message); return back(req, res, '/admin'); }
  next();
});

/* ---------- Städte ---------- */
router.get('/cities', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM cities ORDER BY name');
  res.render('admin/cities', { title: 'Städte', active: 'cities', rows });
}));
router.get('/cities/new', (req, res) => res.render('admin/city', { title: 'Neue Stadt', active: 'cities', c: { id: 0, name: '', slug: '', state: '', lat: 51, lon: 10, size_tier: 2, price_factor: 1, description: '', image: null, active: 1 } }));
router.get('/cities/:id', wrap(async (req, res) => {
  const c = await db.one('SELECT * FROM cities WHERE id = ?', [req.params.id]);
  if (!c) return res.redirect('/admin/cities');
  res.render('admin/city', { title: c.name, active: 'cities', c });
}));
router.post('/cities/:id', (req, res, next) => upload.fields([{ name: 'image', maxCount: 1 }, { name: 'aerial', maxCount: 1 }])(req, res, (err) => { if (err) { flash(req, 'bad', err.code === 'LIMIT_FILE_SIZE' ? 'Eine Datei ist größer als 4 MB.' : err.message); return back(req, res, '/admin/cities'); } req.file = req.files && req.files.image && req.files.image[0]; req.fileAerial = req.files && req.files.aerial && req.files.aerial[0]; next(); }), wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const name = clean(b.name, 80);
  if (!name) { flash(req, 'bad', 'Der Name fehlt.'); return back(req, res, '/admin/cities'); }
  const slug = clean(b.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const vals = [slug, name, clean(b.state, 60), num(b.lat), num(b.lon), Math.min(5, Math.max(1, int(b.size_tier, 2))), Math.min(3, Math.max(0.3, num(b.price_factor, 1))), clean(b.description, 500), b.active ? 1 : 0];
  let image = null;
  if (req.file) image = await saveImage(req.file, 'cities', req.user.id);
  let aerial = null;
  if (req.fileAerial) aerial = await saveImage(req.fileAerial, 'cities', req.user.id);
  try {
    if (id) {
      const old = await db.one('SELECT image FROM cities WHERE id = ?', [id]);
      await db.query('UPDATE cities SET slug=?, name=?, state=?, lat=?, lon=?, size_tier=?, price_factor=?, description=?, active=? WHERE id=?', [...vals, id]);
      if (b.remove_image && old && old.image) { dropFile(old.image); await db.query('UPDATE cities SET image = NULL WHERE id = ?', [id]); }
      if (image) { if (old && old.image) dropFile(old.image); await db.query('UPDATE cities SET image = ? WHERE id = ?', [image, id]); }
      const oldA = await db.one('SELECT aerial FROM cities WHERE id = ?', [id]);
      if (b.remove_aerial && oldA && oldA.aerial) { dropFile(oldA.aerial); await db.query('UPDATE cities SET aerial = NULL WHERE id = ?', [id]); }
      if (aerial) { if (oldA && oldA.aerial) dropFile(oldA.aerial); await db.query('UPDATE cities SET aerial = ? WHERE id = ?', [aerial, id]); }
    } else {
      const r = await db.query('INSERT INTO cities (slug, name, state, lat, lon, size_tier, price_factor, description, active, image, aerial) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...vals, image, aerial]);
      await audit(req, 'city_create', name);
      worldSvc.invalidate(); await worldSvc.load();
      flash(req, 'good', 'Stadt angelegt.');
      return res.redirect(`/admin/cities/${r.insertId}`);
    }
    worldSvc.invalidate(); await worldSvc.load();
    await audit(req, 'city_update', name);
    flash(req, 'good', 'Stadt gespeichert.');
  } catch (e) { flash(req, 'bad', e.code === 'ER_DUP_ENTRY' ? 'Dieser Kurzname (Slug) existiert schon.' : e.message); }
  res.redirect(id ? `/admin/cities/${id}` : '/admin/cities');
}));

/* ---------- Berufe ---------- */
router.get('/professions', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM professions ORDER BY academic, era_from, name');
  res.render('admin/professions', { title: 'Berufe', active: 'professions', rows });
}));
const blankProf = { id: 0, pkey: '', name: '', category: 'handwerk', icon: 'hammer', era_from: 1945, era_to: 2999, base_wage: 600, training_days: 730, tuition_day: 0, academic: 0, replaces: '', lodging: 0, unlocks: '', description: '', active: 1 };
router.get('/professions/new', (req, res) => res.render('admin/profession', { title: 'Neuer Beruf', active: 'professions', p: blankProf, others: [] }));
router.get('/professions/:id', wrap(async (req, res) => {
  const p = await db.one('SELECT * FROM professions WHERE id = ?', [req.params.id]);
  if (!p) return res.redirect('/admin/professions');
  res.render('admin/profession', { title: p.name, active: 'professions', p });
}));
router.post('/professions/:id', wrap(async (req, res) => {
  const id = int(req.params.id); const b = req.body;
  const pkey = clean(b.pkey, 40).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const name = clean(b.name, 80);
  if (!pkey || !name) { flash(req, 'bad', 'Schlüssel und Name sind Pflicht.'); return back(req, res, '/admin/professions'); }
  const vals = [pkey, name, clean(b.category, 40) || 'handwerk', clean(b.icon, 40) || 'hammer', int(b.era_from, 1945), int(b.era_to, 2999), Math.max(0, int(b.base_wage, 500)), Math.max(0, int(b.training_days, 0)), Math.max(0, int(b.tuition_day, 0)), b.academic ? 1 : 0, clean(b.replaces, 40) || null, b.lodging ? 1 : 0, clean(b.unlocks, 120) || null, clean(b.description, 500), b.active ? 1 : 0];
  try {
    if (id) await db.query('UPDATE professions SET pkey=?, name=?, category=?, icon=?, era_from=?, era_to=?, base_wage=?, training_days=?, tuition_day=?, academic=?, replaces=?, lodging=?, unlocks=?, description=?, active=? WHERE id=?', [...vals, id]);
    else { const r = await db.query('INSERT INTO professions (pkey, name, category, icon, era_from, era_to, base_wage, training_days, tuition_day, academic, replaces, lodging, unlocks, description, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', vals); worldSvc.invalidate(); await worldSvc.load(); flash(req, 'good', 'Beruf angelegt.'); return res.redirect(`/admin/professions/${r.insertId}`); }
    worldSvc.invalidate(); await worldSvc.load();
    await audit(req, 'profession_update', name);
    flash(req, 'good', 'Beruf gespeichert.');
  } catch (e) { flash(req, 'bad', e.code === 'ER_DUP_ENTRY' ? 'Dieser Schlüssel existiert schon.' : e.message); }
  res.redirect(id ? `/admin/professions/${id}` : '/admin/professions');
}));

/* ---------- Medien ---------- */
router.get('/media', wrap(async (req, res) => {
  const rows = await db.query('SELECT m.*, u.username FROM media m LEFT JOIN users u ON u.id = m.created_by ORDER BY m.id DESC LIMIT 200');
  res.render('admin/media', { title: 'Medien', active: 'media', rows, dir: config.paths.uploadsDir });
}));
router.post('/media', handleUpload('file'), wrap(async (req, res) => {
  if (!req.file) { flash(req, 'bad', 'Bitte eine Datei wählen.'); return res.redirect('/admin/media'); }
  try { const rel = await saveImage(req.file, 'misc', req.user.id); flash(req, 'good', `Hochgeladen: /media/${rel}`); } catch (e) { flash(req, 'bad', e.message); }
  res.redirect('/admin/media');
}));
router.post('/media/:id/delete', wrap(async (req, res) => {
  const m = await db.one('SELECT * FROM media WHERE id = ?', [req.params.id]);
  if (m) {
    dropFile(m.filename);
    await db.query('DELETE FROM media WHERE id = ?', [m.id]);
    await db.query('UPDATE cities SET image = NULL WHERE image = ?', [m.filename]);
    worldSvc.invalidate(); await worldSvc.load();
  }
  flash(req, 'good', 'Datei gelöscht.');
  res.redirect('/admin/media');
}));

/* ---------- Einstellungen ---------- */
const GROUPS = [
  { id: 'site', title: 'Allgemein', icon: 'settings', fields: [
    ['site.name', 'Name des Spiels', 'text'], ['site.tagline', 'Slogan', 'text'], ['site.registration_open', 'Registrierung geöffnet', 'bool'],
    ['site.require_email_verification', 'E-Mail-Bestätigung verlangen (benötigt SMTP)', 'bool'], ['site.maintenance', 'Wartungsmodus (nur Admins kommen rein)', 'bool'], ['site.maintenance_message', 'Wartungsmeldung', 'textarea'],
  ] },
  { id: 'efs', title: 'Spiel & EFS', icon: 'zap', fields: [
    ['efs.daily_auto', 'EFS pro realem Tag (automatisch)', 'int', 'Standard: 50. Ein EFS = ein Spieltag.'], ['efs.login_bonus', 'EFS-Bonus beim ersten Login des Tages', 'int', 'Standard: 50.'],
    ['efs.active_daily_cap', 'Max. Sammel-EFS (Karte) pro Tag', 'int'], ['efs.awards', 'EFS-Belohnungen für Lebensfortschritte (JSON)', 'json'],
    ['game.start_money_cents', 'Startkapital in Cent', 'int', '4000 = 40,00 DM'], ['game.max_children', 'Maximale Kinderzahl', 'int'],
    ['game.offline_protection', 'Offline-Schutz aktiv', 'bool', 'Offline kann niemand verhungern oder insolvent gehen.'], ['game.offline_after_minutes', 'Abwesenheit ab (Minuten) = offline', 'int'],
    ['game.street_survival_days', 'Tage, die man auf der Straße überlebt', 'int'], ['game.legacy_year', 'Zieljahr (22. Jahrhundert)', 'int'],
  ] },
  { id: 'coins', title: 'Coins & Werbung', icon: 'coins', fields: [
    ['coins.start', 'Start-Coins neuer Spieler', 'int'], ['coins.per_child', 'Coins je Kind (einmalig)', 'int'], ['coins.legacy_bonus', 'Coin-Bonus bei Vollendung des Zyklus (22. Jh.)', 'int'], ['coins.ad_video', 'Coins je Belohnungsvideo', 'int'], ['coins.ad_base', 'Coins Grundbelohnung', 'int'],
    ['coins.move_per_100km', 'Coin-Preis Umzug je 100 km', 'int'], ['ads.enabled', 'Belohnungswerbung aktiv', 'bool'], ['ads.provider', 'Werbe-Anbieter', 'select', 'simulated = Platzhalter · custom = eigene Anzeigen-Seite (iframe) deines Werbenetzwerks', ['simulated', 'custom']],
    ['ads.custom_url', 'Anzeigen-URL (iframe, nur bei „custom“)', 'text', 'Die Seite muss nach Abschluss window.parent.postMessage({type:"tp-ad-complete"}, "*") senden. Der Parameter tp_token wird angehängt.'],
    ['offerwall.url', 'Offerwall-URL (iframe, {uid} = Spieler-ID)', 'text'], ['offerwall.secret', 'Offerwall-Postback-Geheimnis', 'secret', 'Postback: GET /webhooks/offerwall?uid=&coins=&txid=&sig= · sig = HMAC-SHA256(Geheimnis, "uid|coins|txid")'],
    ['ads.min_seconds', 'Mindest-Anzeigedauer (Sekunden)', 'int'], ['ads.daily_cap', 'Max. Videos je Spieler / 24 h', 'int'], ['ads.efs_reward', 'EFS je Video (Zeit-Bonus)', 'int'],
  ] },
  { id: 'economy', title: 'Wirtschaft', icon: 'trending-up', fields: [['economy', 'Wirtschaftsdaten (JSON): Preisindex, Essen, Unterkunft, Immobilien, Versicherungen …', 'json']] },
  { id: 'payments', title: 'Zahlungen', icon: 'credit-card', fields: [
    ['payments.mode', 'Zahlungsmodus', 'select', 'off = Shop gesperrt · test = Gutschrift ohne Zahlung (nur Test!) · stripe = Stripe Checkout', ['off', 'test', 'stripe']],
    ['payments.stripe_secret', 'Stripe Secret Key (sk_live_… / sk_test_…)', 'secret'], ['payments.stripe_webhook_secret', 'Stripe Webhook-Signing-Secret (whsec_…)', 'secret', 'Webhook-URL in Stripe: https://DEINE-DOMAIN/webhooks/stripe · Ereignisse: checkout.session.completed, invoice.paid, customer.subscription.deleted'],
    ['payments.stripe_sub_price', 'Stripe Preis-ID der Dauerkarte (price_…)', 'text'], ['payments.currency', 'Währung (ISO, z. B. eur)', 'text'],
    ['packages', 'Pakete (JSON)', 'json'], ['subscription', 'Dauerkarte (JSON)', 'json'],
  ] },
  { id: 'mail', title: 'E-Mail (SMTP)', icon: 'mail', fields: [['mail.smtp', 'SMTP', 'smtp']] },
  { id: 'legal', title: 'Rechtliches', icon: 'scale', fields: [['legal.impressum', 'Impressum', 'textarea', 'Pflicht in Deutschland (§ 5 DDG).'], ['legal.datenschutz', 'Datenschutzerklärung', 'textarea']] },
];
const fieldMap = new Map(GROUPS.flatMap((g) => g.fields.map((f) => [f[0], f])));

function validateJson(key, v) {
  const d = settings.DEFAULTS[key];
  if (key === 'economy') {
    const e = v;
    if (!Array.isArray(e.priceIndex) || e.priceIndex.length < 2 || !e.priceIndex.every((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > 0)) throw new Error('economy.priceIndex: Liste aus [Jahr, Faktor] erwartet.');
    if (!Array.isArray(e.food) || e.food.length !== 4) throw new Error('economy.food: genau 4 Qualitätsstufen erwartet.');
    for (const k of Object.keys(d)) if (!(k in e)) throw new Error(`economy.${k} fehlt.`);
    for (const k of ['workplace', 'pension']) if (!(e.lodging && Number.isFinite(e.lodging[k]))) throw new Error(`economy.lodging.${k} fehlt.`);
    if (!Array.isArray(e.rentPerRoom) || e.rentPerRoom.length !== 4) throw new Error('economy.rentPerRoom: 4 Werte erwartet.');
    for (const k of ['flat', 'house_small', 'house_large', 'villa']) if (!(e.property && e.property[k] && e.property[k].price > 0)) throw new Error(`economy.property.${k} fehlt.`);
    for (const k of ['hausrat', 'gebaeude', 'gesundheit']) if (!(e.insurance && e.insurance[k])) throw new Error(`economy.insurance.${k} fehlt.`);
  } else if (key === 'packages') {
    if (!Array.isArray(v)) throw new Error('packages: Liste erwartet.');
    v.forEach((p) => { if (!p.id || !p.name || !Number.isFinite(p.price_cents)) throw new Error('Jedes Paket braucht id, name und price_cents.'); });
  } else if (key === 'efs.awards' && (typeof v !== 'object' || Array.isArray(v))) throw new Error('efs.awards: Objekt erwartet.');
}

router.get('/settings', (req, res) => res.redirect('/admin/settings/site'));
router.get('/settings/:group', (req, res, next) => {
  const g = GROUPS.find((x) => x.id === req.params.group);
  if (!g) return res.redirect('/admin/settings/site');
  const values = {};
  g.fields.forEach((f) => { values[f[0]] = settings.get(f[0]); });
  res.render('admin/settings', { title: `Einstellungen · ${g.title}`, active: 'settings', groups: GROUPS, g, values, smtpOk: mailer.smtpConfigured() });
});
router.post('/settings/:group', wrap(async (req, res) => {
  const g = GROUPS.find((x) => x.id === req.params.group);
  if (!g) return res.redirect('/admin/settings/site');
  try {
    const pending = [];
    for (const f of g.fields) {
      const [key, , type] = f; const raw = req.body[key];
      let val;
      if (type === 'bool') val = raw === '1' || raw === 'on';
      else if (type === 'int') { val = parseInt(raw, 10); if (!Number.isFinite(val)) throw new Error(`${f[1]}: ganze Zahl erwartet.`); }
      else if (type === 'json') { try { val = JSON.parse(raw); } catch (e) { throw new Error(`${f[1]}: ungültiges JSON (${e.message}).`); } validateJson(key, val); }
      else if (type === 'smtp') {
        const old = settings.get('mail.smtp');
        val = { host: clean(req.body['smtp_host'], 200), port: int(req.body['smtp_port'], 587), secure: req.body['smtp_secure'] === '1', user: clean(req.body['smtp_user'], 200), pass: req.body['smtp_pass'] ? String(req.body['smtp_pass']).slice(0, 200) : (old.pass || ''), from: clean(req.body['smtp_from'], 200) };
      } else if (type === 'secret') { val = raw ? String(raw).slice(0, 300) : (settings.get(key) || '');
      } else if (type === 'select') { val = String(raw); if (!(f[4] || []).includes(val)) throw new Error(`${f[1]}: ungültiger Wert.`); }
      else val = String(raw == null ? '' : raw).slice(0, 20000);
      pending.push([key, val]);
    }
    for (const [k, v] of pending) await settings.set(k, v);
    await audit(req, 'settings_update', g.id);
    flash(req, 'good', 'Einstellungen gespeichert.');
  } catch (e) { flash(req, 'bad', e.message); }
  res.redirect(`/admin/settings/${g.id}`);
}));
router.post('/settings/mail/test', wrap(async (req, res) => {
  try { await mailer.send({ to: req.user.email, subject: 'Turning Point – Testmail', text: 'Der E-Mail-Versand funktioniert.' }); flash(req, 'good', `Testmail an ${req.user.email} gesendet.`); } catch (e) { flash(req, 'bad', `Versand fehlgeschlagen: ${e.message}`); }
  res.redirect('/admin/settings/mail');
}));

/* ---------- System ---------- */
router.get('/system', wrap(async (req, res) => {
  const dbv = await db.one('SELECT VERSION() v');
  const sizes = await db.query("SELECT table_name AS name, table_rows AS rows_, ROUND((data_length + index_length) / 1024) AS kb FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY (data_length + index_length) DESC");
  const migs = await db.query('SELECT id, applied_at FROM schema_migrations ORDER BY id');
  const dir = config.resolveDataDir();
  let upl = 0; try { for (const d of ['cities', 'misc']) for (const f of fs.readdirSync(path.join(config.paths.uploadsDir, d))) upl += fs.statSync(path.join(config.paths.uploadsDir, d, f)).size; } catch (_) {}
  res.render('admin/system', {
    title: 'System', active: 'system',
    info: {
      app: APP_VERSION, node: process.version, platform: `${os.type()} ${os.release()}`, uptime: Math.round(process.uptime()), mem: Math.round(process.memoryUsage().rss / 1048576),
      totalMem: Math.round(os.totalmem() / 1048576), db: dbv.v, appRoot: config.APP_ROOT, dataDir: dir.dir, dataWhy: dir.why, volatile: !!dir.volatile, uploadsDir: config.paths.uploadsDir, uploadsKb: Math.round(upl / 1024), configFile: config.paths.configFile,
      maintenance: settings.get('site.maintenance'),
    },
    sizes, migs, logs: log.tail(120),
  });
}));
router.post('/system/:action', wrap(async (req, res) => {
  const a = req.params.action;
  if (a === 'reload') { worldSvc.invalidate(); await settings.load(); await worldSvc.load(); flash(req, 'good', 'Einstellungen und Spielwelt neu geladen.'); }
  else if (a === 'sessions') { const r = await db.query('DELETE FROM sessions WHERE expires < ?', [Date.now()]); flash(req, 'good', `${r.affectedRows} abgelaufene Sitzungen entfernt.`); }
  else if (a === 'maintenance') { const on = !settings.get('site.maintenance'); await settings.set('site.maintenance', on); flash(req, 'good', on ? 'Wartungsmodus AN.' : 'Wartungsmodus aus.'); }
  await audit(req, `system_${a}`);
  res.redirect('/admin/system');
}));
router.get('/export', wrap(async (req, res) => {
  const data = {
    exportedAt: new Date().toISOString(), version: APP_VERSION,
    settings: (() => { const a = settings.all(); for (const k of ['payments.stripe_secret', 'payments.stripe_webhook_secret', 'offerwall.secret']) delete a[k]; if (a['mail.smtp']) a['mail.smtp'] = { ...a['mail.smtp'], pass: '' }; return a; })(), cities: await db.query('SELECT slug, name, state, lat, lon, size_tier, price_factor, description, active FROM cities'),
    professions: await db.query('SELECT * FROM professions'),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="turning-point-config.json"');
  res.json(data);
}));

/* ---------- Protokoll ---------- */
router.get('/audit', wrap(async (req, res) => {
  const rows = await db.query('SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 250');
  res.render('admin/audit', { title: 'Protokoll', active: 'audit', rows });
}));

module.exports = router;
