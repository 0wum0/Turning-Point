'use strict';
/** Admin: Dashboard, Finanzen, Werkzeuge, Backup/Import, Logs, Schnell-Editoren für Berufe und Städte. */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const settings = require('../settings');
const worldSvc = require('../game/world');
const log = require('../lib/log');
const { parseState } = require('../game/state');
const { notice } = require('../game/core');
const { audit } = require('../lib/audit');
const { townEventsForWeek, describeTownEvent } = require('../game/events');
const { formatDate } = require('../game/calendar');
const APP_VERSION = require('../../package.json').version;

const SECRETS = ['payments.stripe_secret', 'payments.stripe_webhook_secret', 'offerwall.secret'];

module.exports = function mount(router, H) {
  const { wrap, flash, int, num, clean } = H;
  const reload = async () => { worldSvc.invalidate(); await worldSvc.load(); };

  /* ============================ Finanzen ============================ */
  router.get('/finance', wrap(async (req, res) => {
    const st = clean(req.query.st, 20); const q = clean(req.query.q, 60);
    const conds = []; const params = [];
    if (st) { conds.push('p.status = ?'); params.push(st); }
    if (q) { conds.push('(u.username LIKE ? OR p.package_id LIKE ? OR p.provider_ref LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await db.query(`SELECT p.*, u.username FROM purchases p LEFT JOIN users u ON u.id = p.user_id ${where} ORDER BY p.id DESC LIMIT 200`, params);
    const sum = await db.one("SELECT COALESCE(SUM(CASE WHEN status='completed' THEN price_cents END),0) paid, COALESCE(SUM(CASE WHEN status='refunded' THEN price_cents END),0) refunded, COUNT(*) n FROM purchases");
    const offers = await db.query('SELECT o.*, u.username FROM offer_events o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 30');
    const subs = await db.query('SELECT id, username, sub_until, stripe_sub FROM users WHERE sub_until > ? ORDER BY sub_until', [Date.now()]);
    res.render('admin/finance', { title: 'Finanzen', active: 'finance', rows, sum, offers, subs, st, q, packages: settings.get('packages') });
  }));
  router.post('/finance/grant', wrap(async (req, res) => {
    const b = req.body; const key = clean(b.user, 80);
    const u = await db.one('SELECT id, username FROM users WHERE username = ? OR email = ? OR id = ?', [key, key, int(key, -1)]);
    if (!u) { flash(req, 'bad', 'Spieler nicht gefunden (Name, E-Mail oder ID).'); return res.redirect('/admin/finance'); }
    const coins = int(b.coins); const efs = int(b.efs); const money = Math.round(num(b.money) * 100);
    await db.query("INSERT INTO purchases (user_id, package_id, coins, efs, money, price_cents, provider, status) VALUES (?,?,?,?,?,0,'admin','completed')", [u.id, clean(b.note, 40) || 'admin-gutschrift', coins, efs, money]);
    await db.query('UPDATE users SET coins = GREATEST(0, coins + ?), efs_pool = GREATEST(0, efs_pool + ?) WHERE id = ?', [coins, efs, u.id]);
    if (money) { const row = await db.one('SELECT meta FROM users WHERE id = ?', [u.id]); let m = {}; try { m = JSON.parse(row.meta || '{}'); } catch (_) { /* leer */ } m.pendingMoney = (m.pendingMoney || 0) + money; await db.query('UPDATE users SET meta = ? WHERE id = ?', [JSON.stringify(m), u.id]); }
    await audit(req, 'admin_grant', { user: u.username, coins, efs, money });
    flash(req, 'good', `Gutschrift für ${u.username} gebucht (${coins} Coins, ${efs} EFS${money ? `, ${(money / 100).toFixed(2)} Geld beim nächsten Laden` : ''}).`);
    res.redirect('/admin/finance');
  }));
  router.post('/finance/:id(\\d+)/:act(refund|complete)', wrap(async (req, res) => {
    const p = await db.one('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
    if (!p) return res.redirect('/admin/finance');
    if (req.params.act === 'refund') {
      await db.query("UPDATE purchases SET status = 'refunded' WHERE id = ?", [p.id]);
      if (req.body.claw) await db.query('UPDATE users SET coins = GREATEST(0, coins - ?), efs_pool = GREATEST(0, efs_pool - ?) WHERE id = ?', [p.coins, p.efs, p.user_id]);
      flash(req, 'good', `Kauf #${p.id} als erstattet markiert${req.body.claw ? ' und Coins/EFS abgezogen' : ''}. (Die Rückzahlung selbst machst du im Zahlungsanbieter.)`);
    } else { await db.query("UPDATE purchases SET status = 'completed' WHERE id = ?", [p.id]); flash(req, 'good', 'Status: abgeschlossen.'); }
    await audit(req, `admin_purchase_${req.params.act}`, String(p.id));
    res.redirect('/admin/finance');
  }));

  /* ============================ Werkzeuge ============================ */
  router.get('/tools', wrap(async (req, res) => {
    const [a] = await db.query("SELECT COUNT(*) alive FROM characters WHERE status='alive'");
    const [u] = await db.query('SELECT COUNT(*) n, SUM(last_seen_at > NOW() - INTERVAL 7 DAY) active FROM users');
    const [au] = await db.query('SELECT COUNT(*) n FROM audit_log');
    const [ad] = await db.query('SELECT COUNT(*) n FROM ad_claims');
    res.render('admin/tools', { title: 'Werkzeuge', active: 'tools', counts: { alive: a.alive, users: u.n, active: u.active || 0, audit: au.n, ads: ad.n } });
  }));
  const target = (t) => {
    if (t === 'active7') return ['last_seen_at > NOW() - INTERVAL 7 DAY', []];
    if (t === 'subs') return ['sub_until > ?', [Date.now()]];
    if (t === 'players') return ["role = 'player'", []];
    return ['1 = 1', []];
  };
  router.post('/tools/grant', wrap(async (req, res) => {
    const coins = int(req.body.coins); const efs = int(req.body.efs);
    const [w, params] = target(req.body.target);
    const r = await db.query(`UPDATE users SET coins = GREATEST(0, coins + ?), efs_pool = GREATEST(0, efs_pool + ?) WHERE ${w}`, [coins, efs, ...params]);
    await audit(req, 'admin_grant_all', { target: req.body.target, coins, efs, n: r.affectedRows });
    flash(req, 'good', `${r.affectedRows} Spieler: ${coins >= 0 ? '+' : ''}${coins} Coins, ${efs >= 0 ? '+' : ''}${efs} EFS.`);
    res.redirect('/admin/tools');
  }));
  router.post('/tools/broadcast', wrap(async (req, res) => {
    const title = clean(req.body.title, 80); const text = clean(req.body.text, 500);
    if (!title && !text) { flash(req, 'bad', 'Titel oder Text fehlt.'); return res.redirect('/admin/tools'); }
    const level = ['info', 'good', 'warn', 'bad'].includes(req.body.level) ? req.body.level : 'info';
    const ids = (await db.query("SELECT id FROM characters WHERE status = 'alive'")).map((r) => r.id);
    let n = 0;
    for (const id of ids) {
      await db.tx(async (conn) => {
        const row = await conn.one('SELECT id, state FROM characters WHERE id = ? FOR UPDATE', [id]);
        if (!row) return;
        const state = parseState(row.state);
        notice(state, { level, title: title || 'Nachricht', text, interrupt: !!req.body.interrupt });
        await conn.query('UPDATE characters SET state = ? WHERE id = ?', [JSON.stringify(state), id]);
        n++;
      });
    }
    await audit(req, 'admin_broadcast', { title, n });
    flash(req, 'good', `Meldung an ${n} lebende Charaktere zugestellt.`);
    res.redirect('/admin/tools');
  }));
  router.post('/tools/cleanup', wrap(async (req, res) => {
    const what = clean(req.body.what, 20); const days = Math.max(1, int(req.body.days, 90)); let msg = '';
    if (what === 'audit') { const r = await db.query('DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL ? DAY', [days]); msg = `${r.affectedRows} Protokolleinträge gelöscht.`; }
    else if (what === 'ads') { const r = await db.query('DELETE FROM ad_claims WHERE started_at < ?', [Date.now() - days * 86400000]); msg = `${r.affectedRows} Werbe-Einträge gelöscht.`; }
    else if (what === 'sessions') { const r = await db.query('DELETE FROM sessions WHERE expires < ?', [Date.now()]); msg = `${r.affectedRows} abgelaufene Sitzungen gelöscht.`; }
    else if (what === 'unverified') { const r = await db.query("DELETE FROM users WHERE email_verified = 0 AND role = 'player' AND created_at < NOW() - INTERVAL ? DAY AND NOT EXISTS (SELECT 1 FROM characters c WHERE c.user_id = users.id)", [days]); msg = `${r.affectedRows} unbestätigte Konten ohne Charakter gelöscht.`; }
    else if (what === 'inactive') { const r = await db.query("DELETE FROM users WHERE role = 'player' AND COALESCE(last_seen_at, created_at) < NOW() - INTERVAL ? DAY AND coins = 0 AND (sub_until IS NULL OR sub_until < ?)", [days, Date.now()]); msg = `${r.affectedRows} inaktive Konten gelöscht.`; }
    else { flash(req, 'bad', 'Unbekannte Aktion.'); return res.redirect('/admin/tools'); }
    await audit(req, `admin_cleanup_${what}`, { days });
    flash(req, 'good', msg);
    res.redirect('/admin/tools');
  }));

  /* ============================ Zeitung & Eilmeldungen ============================ */
  router.get('/news', wrap(async (req, res) => {
    const w = await worldSvc.get();
    const cities = await db.query('SELECT id, name FROM cities ORDER BY name');
    const startYear = settings.get('game.start_year');
    const cityId = int(req.query.cityId, cities.length ? cities[0].id : 0);
    const year = Math.max(startYear, Math.min(startYear + 400, int(req.query.year, startYear)));
    const city = w.city(cityId) || cities.map((c) => ({ id: c.id, name: c.name, size_tier: 2 })).find((c) => c.id === cityId);
    const T = settings.get('texts');
    const events = [];
    if (city) {
      const first = (year - startYear) * 52;
      for (let wk = first; wk < first + 52; wk++) {
        for (const ev of townEventsForWeek(city, wk, startYear, w.econ.events)) {
          const day = wk * 7 + ev.offset;
          const d = describeTownEvent(ev, city, 'past', T.news);
          const f = ev.type === 'storm' ? describeTownEvent(ev, city, 'future', T.news) : null;
          events.push({ week: wk, day, date: formatDate(day, startYear), type: ev.type, title: d.title, text: d.text, forecast: f ? f.text : null });
        }
      }
    }
    res.render('admin/news', { title: 'Zeitung & Eilmeldungen', active: 'news', cities, cityId, year, startYear, events, custom: settings.get('news.custom') || [] });
  }));
  const saveNews = async (list) => { await settings.set('news.custom', list); };
  router.post('/news/add', wrap(async (req, res) => {
    const b = req.body; const title = clean(b.title, 120); const text = clean(String(b.text || '').replace(/\r\n?/g, '\n'), 30000);
    if (!title && !text) { flash(req, 'bad', 'Titel oder Text fehlt.'); return res.redirect('/admin/news'); }
    const list = (settings.get('news.custom') || []).slice();
    list.push({ active: true, flash: !!b.flash, title, text, cityId: int(b.cityId), fromYear: int(b.fromYear, 0) || settings.get('game.start_year'), toYear: int(b.toYear, 0) || 9999 });
    await saveNews(list); await audit(req, 'news_add', title);
    flash(req, 'good', b.flash ? 'Eilmeldung veröffentlicht – Spieler sehen sie in der Zeitung.' : 'Nachricht veröffentlicht.');
    res.redirect('/admin/news');
  }));
  router.post('/news/:i(\\d+)/edit', wrap(async (req, res) => {
    const list = (settings.get('news.custom') || []).slice(); const i = int(req.params.i); const b = req.body;
    if (!list[i]) return res.redirect('/admin/news');
    list[i] = { ...list[i], title: clean(b.title, 120), text: clean(String(b.text || '').replace(/\r\n?/g, '\n'), 30000), flash: !!b.flash, cityId: int(b.cityId), fromYear: int(b.fromYear, 0) || settings.get('game.start_year'), toYear: int(b.toYear, 0) || 9999 };
    await saveNews(list); await audit(req, 'news_edit', list[i].title);
    flash(req, 'good', 'Meldung gespeichert.');
    res.redirect('/admin/news');
  }));
  router.post('/news/:i(\\d+)/:act(toggle|delete|flash)', wrap(async (req, res) => {
    const list = (settings.get('news.custom') || []).slice(); const i = int(req.params.i);
    if (!list[i]) return res.redirect('/admin/news');
    if (req.params.act === 'delete') list.splice(i, 1);
    else if (req.params.act === 'toggle') list[i] = { ...list[i], active: list[i].active === false };
    else list[i] = { ...list[i], flash: !list[i].flash };
    await saveNews(list); await audit(req, `news_${req.params.act}`, String(i));
    res.redirect('/admin/news');
  }));

  /* ============================ Backup / Import ============================ */
  router.get('/backup', (req, res) => res.render('admin/backup', { title: 'Backup & Import', active: 'backup' }));
  router.get('/backup/download', wrap(async (req, res) => {
    const scope = req.query.scope === 'full' ? 'full' : 'config';
    const withSecrets = req.query.secrets === '1';
    const st = settings.all();
    if (!withSecrets) { for (const k of SECRETS) delete st[k]; if (st['mail.smtp']) st['mail.smtp'] = { ...st['mail.smtp'], pass: '' }; }
    const data = { kind: 'turning-point-backup', scope, exportedAt: new Date().toISOString(), version: APP_VERSION, settings: st, cities: await db.query('SELECT * FROM cities'), professions: await db.query('SELECT * FROM professions') };
    if (scope === 'full') {
      data.users = await db.query('SELECT * FROM users');
      data.characters = await db.query('SELECT * FROM characters');
      data.purchases = await db.query('SELECT * FROM purchases');
      data.media = await db.query('SELECT * FROM media');
    }
    await audit(req, 'admin_backup', { scope, withSecrets });
    res.setHeader('Content-Disposition', `attachment; filename="turning-point-${scope}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  }));
  const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } });
  router.post('/backup/import', (req, res, next) => importUpload.single('file')(req, res, (err) => { if (err) { flash(req, 'bad', err.message); return res.redirect('/admin/backup'); } next(); }), wrap(async (req, res) => {
    try {
      if (!req.file) throw new Error('Bitte eine JSON-Datei wählen.');
      let d; try { d = JSON.parse(req.file.buffer.toString('utf8')); } catch (e) { throw new Error(`Keine gültige JSON-Datei: ${e.message}`); }
      if (!d || d.kind !== 'turning-point-backup') throw new Error('Das ist keine Turning-Point-Sicherung.');
      const doS = !!req.body.settings; const doC = !!req.body.cities; const doP = !!req.body.professions; const doU = !!req.body.users;
      const counts = { settings: 0, cities: 0, professions: 0, users: 0, characters: 0 };
      if (doS && d.settings) for (const [k, v] of Object.entries(d.settings)) { if (!(k in settings.DEFAULTS)) continue; if (v === undefined || v === null) continue; if (SECRETS.includes(k) && !v) continue; await settings.set(k, v); counts.settings++; }
      if (doC && Array.isArray(d.cities)) for (const c of d.cities) {
        if (!c.slug || !c.name) continue;
        await db.query('INSERT INTO cities (slug, name, state, lat, lon, size_tier, price_factor, image, aerial, description, active) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), state=VALUES(state), lat=VALUES(lat), lon=VALUES(lon), size_tier=VALUES(size_tier), price_factor=VALUES(price_factor), description=VALUES(description), active=VALUES(active)',
          [c.slug, c.name, c.state || '', c.lat, c.lon, c.size_tier || 2, c.price_factor || 1, null, null, c.description || '', c.active ? 1 : 0]);
        counts.cities++;
      }
      if (doP && Array.isArray(d.professions)) for (const p of d.professions) {
        if (!p.pkey || !p.name) continue;
        await db.query('INSERT INTO professions (pkey, name, category, icon, era_from, era_to, base_wage, training_days, tuition_day, academic, replaces, lodging, unlocks, description, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), icon=VALUES(icon), era_from=VALUES(era_from), era_to=VALUES(era_to), base_wage=VALUES(base_wage), training_days=VALUES(training_days), tuition_day=VALUES(tuition_day), academic=VALUES(academic), replaces=VALUES(replaces), lodging=VALUES(lodging), unlocks=VALUES(unlocks), description=VALUES(description), active=VALUES(active)',
          [p.pkey, p.name, p.category || 'handwerk', p.icon || 'hammer', p.era_from, p.era_to, p.base_wage, p.training_days, p.tuition_day || 0, p.academic ? 1 : 0, p.replaces || null, p.lodging ? 1 : 0, p.unlocks || null, p.description || '', p.active ? 1 : 0]);
        counts.professions++;
      }
      if (doU && d.scope === 'full' && Array.isArray(d.users)) {
        // Nur NEUE Konten und deren Charaktere übernehmen (bestehende bleiben unangetastet)
        const idMap = new Map();
        for (const u of d.users) {
          const ex = await db.one('SELECT id FROM users WHERE username = ? OR email = ?', [u.username, u.email]);
          if (ex) { idMap.set(u.id, ex.id); continue; }
          const r = await db.query("INSERT INTO users (email, username, password_hash, role, email_verified, banned, ban_reason, coins, efs_pool, meta, efs_accrued_at, efs_carry, login_bonus_date, sub_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [u.email, u.username, u.password_hash, u.role === 'admin' ? 'admin' : 'player', u.email_verified ? 1 : 0, u.banned ? 1 : 0, u.ban_reason || null, u.coins || 0, u.efs_pool || 0, u.meta || null, u.efs_accrued_at || 0, u.efs_carry || 0, u.login_bonus_date || null, u.sub_until || null]);
          idMap.set(u.id, r.insertId); counts.users++;
          for (const c of (d.characters || []).filter((x) => x.user_id === u.id)) {
            await db.query('INSERT INTO characters (user_id, cycle, generation, status, name, state, game_day, money, end_reason) VALUES (?,?,?,?,?,?,?,?,?)', [r.insertId, c.cycle, c.generation, c.status, c.name, c.state, c.game_day, c.money, c.end_reason || null]);
            counts.characters++;
          }
        }
      }
      await settings.load(); await reload();
      await audit(req, 'admin_import', counts);
      flash(req, 'good', `Import abgeschlossen: ${counts.settings} Einstellungen, ${counts.cities} Städte, ${counts.professions} Berufe, ${counts.users} neue Konten (${counts.characters} Charaktere).`);
    } catch (e) { flash(req, 'bad', e.message); }
    res.redirect('/admin/backup');
  }));

  /* ============================ Logs ============================ */
  router.get('/logs', (req, res) => {
    const n = Math.min(5000, Math.max(50, int(req.query.n, 400))); const level = clean(req.query.level, 6); const q = clean(req.query.q, 80).toLowerCase();
    let lines = log.tail(n).split('\n').filter(Boolean);
    if (level) lines = lines.filter((l) => l.includes(`[${level}]`));
    if (q) lines = lines.filter((l) => l.toLowerCase().includes(q));
    res.render('admin/logs', { title: 'Server-Log', active: 'system', lines: lines.reverse(), n, level, q });
  });
  router.get('/logs/download', (req, res) => {
    const file = path.join(config.paths.logsDir, 'app.log');
    if (!fs.existsSync(file)) return res.status(404).send('Kein Log vorhanden.');
    res.download(file, 'turning-point-app.log');
  });

  /* ============================ Schnell-Editoren ============================ */
  router.get('/professions', wrap(async (req, res) => {
    const rows = await db.query('SELECT * FROM professions ORDER BY academic, era_from, name');
    res.render('admin/professions', { title: 'Berufe', active: 'professions', rows });
  }));
  router.post('/professions/bulk', wrap(async (req, res) => {
    const p = req.body.p || {}; let n = 0;
    for (const [id, f] of Object.entries(p)) {
      await db.query('UPDATE professions SET base_wage = ?, training_days = ?, tuition_day = ?, era_from = ?, era_to = ?, active = ? WHERE id = ?', [Math.max(0, int(f.base_wage)), Math.max(0, int(f.training_days)), Math.max(0, int(f.tuition_day)), int(f.era_from, 1945), int(f.era_to, 2999), f.active === '1' ? 1 : 0, int(id)]);
      n++;
    }
    if (req.body.factor && num(req.body.factor, 1) !== 1) {
      const fct = num(req.body.factor, 1);
      if (fct > 0.05 && fct < 20) await db.query('UPDATE professions SET base_wage = ROUND(base_wage * ?)', [fct]);
    }
    await reload(); await audit(req, 'professions_bulk', { n, factor: req.body.factor });
    flash(req, 'good', `${n} Berufe gespeichert${req.body.factor && num(req.body.factor, 1) !== 1 ? ` · Löhne × ${req.body.factor}` : ''}.`);
    res.redirect('/admin/professions');
  }));
  router.post('/professions/:id(\\d+)/duplicate', wrap(async (req, res) => {
    const p = await db.one('SELECT * FROM professions WHERE id = ?', [req.params.id]);
    if (!p) return res.redirect('/admin/professions');
    let key = `${p.pkey}_kopie`; let i = 2;
    while (await db.one('SELECT id FROM professions WHERE pkey = ?', [key])) key = `${p.pkey}_kopie${i++}`;
    const r = await db.query('INSERT INTO professions (pkey, name, category, icon, era_from, era_to, base_wage, training_days, tuition_day, academic, replaces, lodging, unlocks, description, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)', [key, `${p.name} (Kopie)`, p.category, p.icon, p.era_from, p.era_to, p.base_wage, p.training_days, p.tuition_day, p.academic, p.replaces, p.lodging, p.unlocks, p.description]);
    await reload(); flash(req, 'good', 'Beruf dupliziert (inaktiv).');
    res.redirect(`/admin/professions/${r.insertId}`);
  }));
  router.post('/professions/:id(\\d+)/delete', wrap(async (req, res) => {
    const p = await db.one('SELECT * FROM professions WHERE id = ?', [req.params.id]);
    if (!p) return res.redirect('/admin/professions');
    const used = await db.one('SELECT COUNT(*) n FROM characters WHERE state LIKE ?', [`%"${p.pkey}"%`]);
    if (used.n) { flash(req, 'bad', `Der Beruf wird in ${used.n} Spielständen verwendet. Setze ihn stattdessen auf „inaktiv“.`); return res.redirect('/admin/professions'); }
    await db.query('DELETE FROM professions WHERE id = ?', [p.id]); await reload(); await audit(req, 'profession_delete', p.name);
    flash(req, 'good', 'Beruf gelöscht.');
    res.redirect('/admin/professions');
  }));

  router.post('/cities/bulk', wrap(async (req, res) => {
    const c = req.body.c || {}; let n = 0;
    for (const [id, f] of Object.entries(c)) {
      await db.query('UPDATE cities SET size_tier = ?, price_factor = ?, active = ? WHERE id = ?', [Math.min(5, Math.max(1, int(f.size_tier, 2))), Math.min(3, Math.max(0.3, num(f.price_factor, 1))), f.active === '1' ? 1 : 0, int(id)]);
      n++;
    }
    await reload(); await audit(req, 'cities_bulk', { n });
    flash(req, 'good', `${n} Städte gespeichert.`);
    res.redirect('/admin/cities');
  }));
  router.post('/cities/:id(\\d+)/delete', wrap(async (req, res) => {
    const c = await db.one('SELECT * FROM cities WHERE id = ?', [req.params.id]);
    if (!c) return res.redirect('/admin/cities');
    const used = await db.one('SELECT COUNT(*) n FROM characters WHERE state REGEXP ?', [`"(cityId|birthCityId|homeCityId)":${c.id}[,}]`]);
    if (used.n) { flash(req, 'bad', `In ${used.n} Spielständen kommt diese Stadt vor. Löschen nicht möglich – setze sie auf „inaktiv“ oder passe die Spielstände an.`); return res.redirect('/admin/cities'); }
    await db.query('DELETE FROM cities WHERE id = ?', [c.id]); await reload(); await audit(req, 'city_delete', c.name);
    flash(req, 'good', 'Stadt gelöscht.');
    res.redirect('/admin/cities');
  }));
};
