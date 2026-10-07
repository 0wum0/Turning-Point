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

const roles = require('../lib/roles');
const router = express.Router();

/* ---------- Zugriff ---------- */
router.use((req, res, next) => {
  if (!req.user) return res.redirect('/login?next=/admin');
  if (!roles.isStaff(req.user.role)) return res.status(403).render('error', { code: 403, title: 'Kein Zugriff', message: 'Dieser Bereich ist nur für das Team.' });
  if (!roles.can(req.user.role, req.method, req.path)) return res.status(403).render('error', { code: 403, title: 'Kein Zugriff', message: `Dafür fehlt deiner Rolle (${roles.label(req.user.role)}) die Berechtigung.` });
  res.locals.canSee = (p) => roles.can(req.user.role, 'GET', p.replace(/^\/admin/, '') || '/');
  res.locals.roleLabel = roles.label(req.user.role);
  res.locals.adminNav = true;
  res.locals.adminBadges = {};
  res.locals.era = 1;
  next();
});
/* Niemand bearbeitet gleich- oder höherrangige Konten (außer Admins) */
router.use(async (req, res, next) => {
  try {
    const m = /^\/users\/(\d+)\/[a-z]+$/.exec(req.path);
    if (m && req.method === 'POST' && req.user.role !== 'admin' && Number(m[1]) !== req.user.id) {
      const t = await db.one('SELECT role FROM users WHERE id = ?', [Number(m[1])]);
      if (t && roles.rank(t.role) >= roles.rank(req.user.role)) { flash(req, 'bad', 'Konten gleich- oder höherrangiger Teammitglieder kannst du nicht bearbeiten.'); return res.redirect(`/admin/users/${m[1]}`); }
    }
  } catch (_) { /* weiter */ }
  next();
});
router.use(async (req, res, next) => {
  try {
    if (!adminBadgeCache || Date.now() - adminBadgeCache.at > 20000) {
      const r = await db.one("SELECT COUNT(*) n FROM cheat_flags WHERE status = 'open'");
      const rp = await db.one("SELECT COUNT(*) n FROM reports WHERE status = 'open'");
      adminBadgeCache = { at: Date.now(), anticheat: r.n, community: rp.n };
    }
    res.locals.adminBadges = { anticheat: adminBadgeCache.anticheat, community: adminBadgeCache.community };
  } catch (_) { /* Badge ist optional */ }
  next();
});
let adminBadgeCache = null;
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };
const back = (req, res, fallback) => res.redirect(req.get('referer') && req.get('referer').includes('/admin') ? req.get('referer') : fallback);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

/* ---------- Spieler & Charaktere (admin-players.js) ---------- */
const H = { wrap, flash, back, int, num, clean };
require('./admin-players')(router, H);
require('./admin-tools')(router, H);
require('./admin-insights')(router, H);
require('./admin-community')(router, H);

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
  else if (act === 'role') { if (self) flash(req, 'bad', 'Die eigene Rolle kann nicht geändert werden.'); else { const r = roles.ROLES.includes(req.body.role) ? req.body.role : 'player'; await db.query('UPDATE users SET role = ? WHERE id = ?', [r, id]); flash(req, 'good', `Rolle: ${r}`); } }
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
  const q = String(req.query.q || '').trim(); const st = String(req.query.state || ''); const page = Math.max(1, int(req.query.page, 1)); const per = 100;
  const conds = []; const params = [];
  if (q) { conds.push('name LIKE ?'); params.push(`%${q}%`); }
  if (st) { conds.push('state = ?'); params.push(st); }
  if (req.query.since === '1') conds.push('since > 1945');
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) n FROM cities ${where}`, params)).n;
  const rows = await db.query(`SELECT * FROM cities ${where} ORDER BY pop DESC, name LIMIT ? OFFSET ?`, [...params, per, (page - 1) * per]);
  const states = (await db.query('SELECT DISTINCT state FROM cities ORDER BY state')).map((r) => r.state);
  res.render('admin/cities', { title: `Orte (${total})`, active: 'cities', rows, total, page, pages: Math.max(1, Math.ceil(total / per)), q, st, states, sinceOnly: req.query.since === '1' });
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
  const vals = [slug, name, clean(b.state, 60), num(b.lat), num(b.lon), Math.min(5, Math.max(1, int(b.size_tier, 2))), Math.min(3, Math.max(0.3, num(b.price_factor, 1))), clean(b.description, 500), b.active ? 1 : 0, Math.max(0, int(b.pop, 0)), Math.min(2999, Math.max(1500, int(b.since, 1945)))];
  let image = null;
  if (req.file) image = await saveImage(req.file, 'cities', req.user.id);
  let aerial = null;
  if (req.fileAerial) aerial = await saveImage(req.fileAerial, 'cities', req.user.id);
  try {
    if (id) {
      const old = await db.one('SELECT image FROM cities WHERE id = ?', [id]);
      await db.query('UPDATE cities SET slug=?, name=?, state=?, lat=?, lon=?, size_tier=?, price_factor=?, description=?, active=?, pop=?, since=? WHERE id=?', [...vals, id]);
      if (b.remove_image && old && old.image) { dropFile(old.image); await db.query('UPDATE cities SET image = NULL WHERE id = ?', [id]); }
      if (image) { if (old && old.image) dropFile(old.image); await db.query('UPDATE cities SET image = ? WHERE id = ?', [image, id]); }
      const oldA = await db.one('SELECT aerial FROM cities WHERE id = ?', [id]);
      if (b.remove_aerial && oldA && oldA.aerial) { dropFile(oldA.aerial); await db.query('UPDATE cities SET aerial = NULL WHERE id = ?', [id]); }
      if (aerial) { if (oldA && oldA.aerial) dropFile(oldA.aerial); await db.query('UPDATE cities SET aerial = ? WHERE id = ?', [aerial, id]); }
    } else {
      const r = await db.query('INSERT INTO cities (slug, name, state, lat, lon, size_tier, price_factor, description, active, pop, since, image, aerial) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [...vals, image, aerial]);
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
const LABELS = require('../admin-labels');
router.get('/labels.js', (req, res) => res.type('application/javascript').send('window.TP_LABELS=' + JSON.stringify(LABELS.TREE) + ';'));
const GROUPS = [
  { id: 'site', title: 'Allgemein', icon: 'settings', fields: [
    ['site.name', 'Name des Spiels', 'text'], ['site.tagline', 'Slogan', 'text'], ['site.registration_open', 'Registrierung geöffnet', 'bool'],
    ['site.require_email_verification', 'E-Mail-Bestätigung verlangen (benötigt SMTP)', 'bool'], ['site.maintenance', 'Wartungsmodus (nur Admins kommen rein)', 'bool'], ['site.maintenance_message', 'Wartungsmeldung', 'textarea'],
    ['site.contact_email', 'Kontakt-E-Mail', 'text'], ['site.legal_name', 'Betreiber (Name/Firma)', 'text'], ['site.legal_address', 'Betreiber-Anschrift', 'textarea'],
  ] },
  { id: 'efs', title: 'Spiel & EFS', icon: 'zap', fields: [
    ['efs.daily_auto', 'EFS pro realem Tag (automatisch)', 'int', 'Standard: 50. Ein EFS = ein Spieltag.'], ['efs.login_bonus', 'EFS-Bonus beim ersten Login des Tages', 'int', 'Standard: 50.'],
    ['efs.active_daily_cap', 'Max. Sammel-EFS (Karte) pro Tag', 'int'], ['efs.awards', 'EFS-Belohnungen für Lebensfortschritte (JSON)', 'json'],
    ['game.start_year', 'Startjahr der Simulation', 'int', 'Standard: 1945'], ['game.start_age', 'Startalter des Charakters', 'int', 'Standard: 20'],
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
  { id: 'economy', title: 'Preise & Löhne', icon: 'trending-up', fields: [['economy:priceIndex,euroYear,food,lodging,rentPerRoom,property,upkeepYearPct,insurance,moveBaseCost,moveCostPerKm,childCostPerDay,kindergeldPct,jugendhilfePerDay,marriageCost,giftCost', 'Preisindex (Jahr → Faktor), Essen, Unterkunft, Immobilien, Versicherungen, Familienkosten', 'econ', 'Alle Geldbeträge in Cent bei Preisindex 1 (1945).']] },
  { id: 'tasks', title: 'Gebäude-Aufgaben', icon: 'hammer', fields: [['economy:tasks', 'Aufgaben je Gebäudetyp (Minispiel, Dauer, Abkühlzeit, Belohnung)', 'econ', 'mini: collect · sequence · hunt (oder leer = ohne Minispiel). reward: efs, rest, wellbeing, health, money, influence, childSat, bizCash.']] },
  { id: 'companies', title: 'Betriebe & Politik', icon: 'store', fields: [['economy:companies,politics,gambling', 'Betriebe (Stufen, Löhne), politische Ämter, Glücksspiel', 'econ']] },
  { id: 'events', title: 'Ereignisse', icon: 'zap', fields: [['economy:events', 'Zufallsereignisse: Stadt (Unwetter, Feuer …), privat, Betriebe', 'econ', 'Wahrscheinlichkeiten 0–1, Kosten in % des Wertes, Beträge in Cent (Preisindex 1).']] },
  { id: 'social', title: 'Community', icon: 'users', fields: [['social', 'Spielergemeinschaft: Rangliste, Chat (Sperrwörter, Tempo), Briefe, Geschenke (Limits, Gebühr), Besuche, Zeitungsmeldungen', 'json', 'Alle Beträge in Cent bei Preisindex 1 (Kaufkraft 1945). enabled = false schaltet alle Gemeinschaftsfunktionen ab.']] },
  { id: 'anticheat', title: 'Anti-Cheat', icon: 'shield', fields: [['anticheat', 'Anti-Cheat-Regeln: Schwellen, Gewichte, automatische Maßnahmen (autoAction: flag · throttle · ban)', 'json', 'Jede Regel hat ein Gewicht; der Risiko-Score ergibt sich aus den Gewichten offener Verdachtsfälle (verfällt über decayDays).']] },
  { id: 'texts', title: 'Zeitung & Texte', icon: 'newspaper', fields: [['texts', 'Zeitungstexte: Nachrichten-Vorlagen, Straßen, Pensionen, Kontaktanzeigen, Beschriftungen, Ratgeber', 'json', 'Platzhalter in Nachrichten: {city} = Stadtname, {kind} = Unwetterart. Listen (Straßen, Pensionen, Kontakttexte …) lassen sich beliebig erweitern.']] },
  { id: 'newsflash', title: 'Eilmeldungen', icon: 'bell', fields: [['news.custom', 'Eilmeldungen & eigene Nachrichten (erscheinen in der Zeitung)', 'json', 'Felder: active, flash (true = rote EILMELDUNG), title, text, cityId (0 = alle Städte), fromYear, toYear. Schneller geht es unter Admin → Zeitung.']] },
  { id: 'landing', title: 'Startseite', icon: 'globe', fields: [['landing', 'Texte der Startseite – Deutsch (Titel, Features, Statistik, Zitat). Titel: \\n = Zeilenumbruch', 'json'], ['landing_en', 'Texte der Startseite – Englisch', 'json']] },
  { id: 'announce', title: 'Ankündigung', icon: 'bell', fields: [['site.announcement', 'Ankündigung an alle Spieler (JSON)', 'json', 'active: true/false · level: info/good/warn/bad · title · text · id (Zahl erhöhen, damit sie erneut erscheint)']] },
  { id: 'payments', title: 'Zahlungen', icon: 'credit-card', fields: [
    ['payments.mode', 'Zahlungsmodus', 'select', 'off = Shop gesperrt · test = Gutschrift ohne Zahlung (nur Test!) · stripe = Stripe Checkout', ['off', 'test', 'stripe']],
    ['payments.stripe_secret', 'Stripe Secret Key (sk_live_… / sk_test_…)', 'secret'], ['payments.stripe_webhook_secret', 'Stripe Webhook-Signing-Secret (whsec_…)', 'secret', 'Webhook-URL in Stripe: https://DEINE-DOMAIN/webhooks/stripe · Ereignisse: checkout.session.completed, invoice.paid, customer.subscription.deleted'],
    ['payments.stripe_sub_price', 'Stripe Preis-ID der Dauerkarte (price_…)', 'text'], ['payments.currency', 'Währung (ISO, z. B. eur)', 'text'],
    ['packages', 'Pakete (JSON)', 'json'], ['subscription', 'Dauerkarte (JSON)', 'json'],
  ] },
  { id: 'mail', title: 'E-Mail (SMTP)', icon: 'mail', fields: [['mail.smtp', 'SMTP', 'smtp']] },
  { id: 'legal', title: 'Rechtliches', icon: 'scale', fields: [['legal.impressum', 'Impressum', 'textarea', 'Pflicht in Deutschland (§ 5 DDG).'], ['legal.datenschutz', 'Datenschutzerklärung', 'textarea'], ['legal.agb', 'Nutzungsbedingungen (AGB)', 'textarea'], ['legal.widerruf', 'Widerrufsbelehrung (nur nötig, wenn Käufe aktiv sind)', 'textarea']] },
];

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
  } else if (key === 'anticheat') {
    if (!['flag', 'throttle', 'ban'].includes(v.autoAction)) throw new Error('anticheat.autoAction: flag, throttle oder ban erwartet.');
    if (!v.rules || typeof v.rules !== 'object') throw new Error('anticheat.rules fehlt.');
    for (const [k, r] of Object.entries(v.rules)) if (!r || typeof r.weight !== 'number') throw new Error(`anticheat.rules.${k}.weight: Zahl erwartet.`);
  } else if (key === 'packages') {
    if (!Array.isArray(v)) throw new Error('packages: Liste erwartet.');
    v.forEach((p) => { if (!p.id || !p.name || !Number.isFinite(p.price_cents)) throw new Error('Jedes Paket braucht id, name und price_cents.'); });
  } else if (key === 'efs.awards' && (typeof v !== 'object' || Array.isArray(v))) throw new Error('efs.awards: Objekt erwartet.');
}

const econKeys = (key) => key.slice(8).split(',');
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const isExpert = (g) => g.id === 'expert';
const SECRET_KEYS = new Set(['payments.stripe_secret', 'payments.stripe_webhook_secret', 'offerwall.secret', 'mail.smtp']);
function expertGroup() {
  const fields = Object.keys(settings.DEFAULTS).filter((k) => !SECRET_KEYS.has(k) && k !== 'economy').map((k) => {
    const d = settings.DEFAULTS[k];
    const t = typeof d === 'boolean' ? 'bool' : typeof d === 'number' ? 'num' : (d && typeof d === 'object') ? 'json' : (typeof d === 'string' && d.length > 80) ? 'textarea' : 'text';
    return [k, LABELS.SETTINGS[k] || k, t];
  });
  fields.push(['economy', LABELS.SETTINGS.economy, 'json']);
  return { id: 'expert', title: 'Experten (alle Werte)', icon: 'wrench', fields };
}
const allGroups = () => [...GROUPS, expertGroup()];
const findGroup = (id) => allGroups().find((x) => x.id === id);
function currentValue(key) {
  if (key.startsWith('economy:')) return pick(settings.get('economy'), econKeys(key));
  return settings.get(key);
}
router.get('/settings', (req, res) => res.redirect('/admin/settings/site'));
router.get('/settings/:group', (req, res, next) => {
  const g = findGroup(req.params.group);
  if (!g) return res.redirect('/admin/settings/site');
  const values = {};
  g.fields.forEach((f) => { values[f[0]] = currentValue(f[0]); });
  res.render('admin/settings', { title: `Einstellungen · ${g.title}`, active: 'settings', groups: allGroups(), g, values, smtpOk: mailer.smtpConfigured() });
});
router.post('/settings/mail/test', wrap(async (req, res) => {
  try { await mailer.send({ to: req.user.email, ...require('../lib/mail-templates').build('test', req.lang) }); flash(req, 'good', `Testmail an ${req.user.email} gesendet.`); } catch (e) { flash(req, 'bad', `Versand fehlgeschlagen: ${e.message}`); }
  res.redirect('/admin/settings/mail');
}));
router.post('/settings/:group/reset', wrap(async (req, res) => {
  const g = findGroup(req.params.group);
  const key = String(req.body.reset || '');
  if (g && g.fields.some((f) => f[0] === key)) {
    if (key.startsWith('economy:')) {
      const cur = { ...settings.get('economy') }; const d = settings.DEFAULTS.economy;
      for (const k of econKeys(key)) cur[k] = JSON.parse(JSON.stringify(d[k]));
      await settings.set('economy', cur);
    } else await settings.reset(key);
    await audit(req, 'settings_reset', key); flash(req, 'good', 'Auf Standardwert zurückgesetzt.');
  }
  res.redirect(`/admin/settings/${req.params.group}`);
}));
router.post('/settings/:group', wrap(async (req, res) => {
  const g = findGroup(req.params.group);
  if (!g) return res.redirect('/admin/settings/site');
  try {
    const pending = [];
    for (const f of g.fields) {
      const [key, , type] = f; const raw = req.body[key];
      let val;
      if (type === 'bool') val = raw === '1' || raw === 'on';
      else if (type === 'int') { val = parseInt(raw, 10); if (!Number.isFinite(val)) throw new Error(`${f[1]}: ganze Zahl erwartet.`); }
      else if (type === 'num') { val = parseFloat(String(raw).replace(',', '.')); if (!Number.isFinite(val)) throw new Error(`${f[1]}: Zahl erwartet.`); }
      else if (type === 'econ') {
        let sub; try { sub = JSON.parse(raw); } catch (e) { throw new Error(`${f[1]}: ungültiges JSON (${e.message}).`); }
        if (!sub || typeof sub !== 'object' || Array.isArray(sub)) throw new Error(`${f[1]}: Objekt erwartet.`);
        const merged = { ...(pending.find((p) => p[0] === 'economy') || [null, settings.get('economy')])[1] };
        for (const k of econKeys(key)) { if (!(k in sub)) throw new Error(`${f[1]}: Feld „${k}“ fehlt.`); merged[k] = sub[k]; }
        validateJson('economy', merged);
        const i = pending.findIndex((p) => p[0] === 'economy'); if (i >= 0) pending[i][1] = merged; else pending.push(['economy', merged]);
        continue;
      }
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
      envDb: !!config.envDb(), envDir: !!process.env.TP_DATA_DIR,
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
