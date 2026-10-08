'use strict';
/** Admin: Spieler, Konten und Charaktere – vollständig editierbar. */
const bcrypt = require('bcryptjs');
const db = require('../db');
const settings = require('../settings');
const worldSvc = require('../game/world');
const { parseState, upgradeState } = require('../game/state');
const { advance } = require('../game/engine');
const { endLife } = require('../game/family');
const { learn, notice, chronicle } = require('../game/core');
const { yearOf } = require('../game/calendar');
const { present } = require('../game/present');
const { audit } = require('../lib/audit');
const { randomToken } = require('../lib/security');

/** Skalare Felder des Charakters (Pfad im Spielstand → Eingabe). */
const FIELD_GROUPS = [
  { title: 'Person & Zeit', fields: [
    ['person.first', 'Vorname', 'text'], ['person.last', 'Nachname', 'text'], ['person.gender', 'Geschlecht', 'select', ['m', 'f', 'd']],
    ['person.birthCityId', 'Geburtsstadt', 'city'], ['cityId', 'Aktueller Wohnort', 'city'],
    ['day', 'Spieltag (0 = 1. Januar Startjahr)', 'int'], ['startYear', 'Startjahr dieses Spielstands', 'int'],
    ['status', 'Status', 'select', ['alive', 'dead', 'gameover']], ['cycle', 'Zyklus', 'int'], ['generation', 'Generation', 'int'],
  ] },
  { title: 'Geld & Statistik', fields: [
    ['money', 'Geld (Cent der aktuellen Währung)', 'int'],
    ['stats.earned', 'Gesamt verdient', 'int'], ['stats.spent', 'Gesamt ausgegeben', 'int'], ['stats.peakWorth', 'Höchstes Vermögen', 'int'], ['stats.daysWorked', 'Gearbeitete Tage', 'int'],
    ['cards.health', 'Gesundheitskarten', 'int'],
  ] },
  { title: 'Lebensmeter', fields: [
    ['meters.fridge', 'Kühlschrank (0–100)', 'float'], ['meters.fridgeQ', 'Kühlschrank-Qualität (0–3)', 'int'],
    ['meters.wellbeing', 'Wohlbefinden', 'float'], ['meters.rest', 'Erholung', 'float'], ['meters.health', 'Gesundheit', 'float'],
    ['hunger', 'Hungertage', 'int'], ['restZero', 'Tage ohne Erholung', 'int'],
  ] },
  { title: 'Lebensdauer & Familienplanung', fields: [
    ['life.baseYears', 'Basis-Lebensjahre', 'float'], ['life.extraDays', 'Zusatz-Lebenstage', 'int'], ['life.rare', 'Seltene Lebensdauer', 'bool'],
    ['plan.target', 'Kinderwunsch (Zielzahl)', 'int'], ['flags.autoMaintain', 'Automatische Instandhaltung', 'bool'], ['flags.tutorial', 'Tutorial aktiv', 'bool'], ['flags.foodTier', 'Essensstufe', 'int'],
    ['insurance.hausrat', 'Hausratversicherung', 'bool'], ['insurance.gebaeude', 'Gebäudeversicherung', 'bool'], ['insurance.gesundheit', 'Kranken-Zusatz', 'bool'],
  ] },
];
/** Verschachtelte Bereiche, die im Baum-Editor bearbeitet werden. */
const SECTIONS = [
  ['housing', 'Wohnen'], ['occupation', 'Beruf / Ausbildung'], ['skills', 'Qualifikationen'], ['properties', 'Immobilien'], ['companies', 'Betriebe'],
  ['politics', 'Politik'], ['butler', 'Butler'], ['partner', 'Partner(in)'], ['children', 'Kinder'], ['tree', 'Stammbaum'], ['life', 'Lebensdaten'],
  ['press', 'Zeitungsartikel über den Charakter'], ['discounts', 'Rabatte'], ['collected', 'Karten-Funde'], ['mods', 'Temporäre Effekte'], ['taskCd', 'Aufgaben-Abkühlzeiten'], ['pending', 'Merker (intern)'],
  ['fx', 'Offene Effekte (Coins/EFS/Einfluss)'], ['notices', 'Meldungen'], ['death', 'Todesdaten'],
];

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.'); let a = o;
  for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; }
  a[ks[ks.length - 1]] = v;
}

module.exports = function mount(router, H) {
  const { wrap, flash, int, clean } = H;
  const render = (res, view, data) => res.render(view, data);

  async function charRow(id) {
    const row = await db.one('SELECT c.*, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = ?', [id]);
    return row;
  }
  async function writeState(row, state, extraSql = '', extraArgs = []) {
    await db.query(
      `UPDATE characters SET state = ?, game_day = ?, money = ?, status = ?, name = ?, end_reason = ?, cycle = ?, generation = ?, ended_at = IF(? <> 'alive', COALESCE(ended_at, NOW()), NULL)${extraSql} WHERE id = ?`,
      [JSON.stringify(state), state.day, state.money, state.status, `${state.person.first} ${state.person.last}`, state.death ? (state.death.reason || null) : null, state.cycle || 1, state.generation || 1, state.status, ...extraArgs, row.id],
    );
    try {
      const u = await db.one('SELECT id, username, meta, social_public FROM users WHERE id = ?', [row.user_id]);
      if (u) { u.meta = JSON.parse(u.meta || '{}'); await require('../lib/social').upsertStats(db, u, row, state, await worldSvc.get()); }
    } catch (_) { /* Statistik ist nachrangig */ }
  }

  /* ============================ Spielerliste ============================ */
  router.get('/users', wrap(async (req, res) => {
    const q = clean(req.query.q, 60); const f = clean(req.query.f, 20); const sort = clean(req.query.sort, 20);
    const page = Math.max(1, int(req.query.page, 1)); const per = 30;
    const conds = []; const params = [];
    if (q) { conds.push('(u.username LIKE ? OR u.email LIKE ? OR u.id = ?)'); params.push(`%${q}%`, `%${q}%`, int(q, -1)); }
    if (f === 'admin') conds.push("u.role <> 'player'");
    if (f === 'banned') conds.push('u.banned = 1');
    if (f === 'sub') conds.push('u.sub_until > ' + Date.now());
    if (f === 'online') conds.push('u.last_seen_at > NOW() - INTERVAL 10 MINUTE');
    if (f === 'new') conds.push('u.created_at > NOW() - INTERVAL 7 DAY');
    if (f === 'unverified') conds.push('u.email_verified = 0');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const order = { coins: 'u.coins DESC', efs: 'u.efs_pool DESC', seen: 'u.last_seen_at DESC', name: 'u.username ASC', money: 'cm DESC' }[sort] || 'u.id DESC';
    const total = (await db.one(`SELECT COUNT(*) n FROM users u ${where}`, params)).n;
    const rows = await db.query(
      `SELECT u.id, u.username, u.email, u.role, u.is_bot, u.banned, u.coins, u.efs_pool, u.sub_until, u.created_at, u.last_seen_at, u.email_verified,
        (SELECT COUNT(*) FROM characters c WHERE c.user_id = u.id) chars,
        (SELECT c.money FROM characters c WHERE c.user_id = u.id ORDER BY (c.status = 'gameover'), c.id DESC LIMIT 1) cm,
        (SELECT c.name FROM characters c WHERE c.user_id = u.id ORDER BY (c.status = 'gameover'), c.id DESC LIMIT 1) cname,
        (SELECT c.status FROM characters c WHERE c.user_id = u.id ORDER BY (c.status = 'gameover'), c.id DESC LIMIT 1) cstatus
       FROM users u ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, per, (page - 1) * per]);
    render(res, 'admin/users', { title: 'Spieler', active: 'users', rows, q, f, sort, page, pages: Math.max(1, Math.ceil(total / per)), total, now: Date.now() });
  }));

  router.post('/users/bulk', wrap(async (req, res) => {
    let ids = req.body.ids; ids = (Array.isArray(ids) ? ids : ids ? [ids] : []).map((x) => int(x)).filter((x) => x && x !== req.user.id);
    const act = clean(req.body.bulk, 20); const amount = int(req.body.amount);
    if (!ids.length) { flash(req, 'bad', 'Keine Spieler ausgewählt (die eigene Person wird übersprungen).'); return res.redirect('/admin/users'); }
    const ph = ids.map(() => '?').join(',');
    if (act === 'coins') await db.query(`UPDATE users SET coins = GREATEST(0, coins + ?) WHERE id IN (${ph})`, [amount, ...ids]);
    else if (act === 'efs') await db.query(`UPDATE users SET efs_pool = GREATEST(0, efs_pool + ?) WHERE id IN (${ph})`, [amount, ...ids]);
    else if (act === 'ban') { await db.query(`UPDATE users SET banned = 1, ban_reason = ? WHERE id IN (${ph})`, [clean(req.body.reason, 200) || null, ...ids]); }
    else if (act === 'unban') await db.query(`UPDATE users SET banned = 0, ban_reason = NULL WHERE id IN (${ph})`, ids);
    else if (act === 'verify') await db.query(`UPDATE users SET email_verified = 1, verify_token = NULL WHERE id IN (${ph})`, ids);
    else { flash(req, 'bad', 'Unbekannte Sammelaktion.'); return res.redirect('/admin/users'); }
    await audit(req, `admin_bulk_${act}`, { ids, amount });
    flash(req, 'good', `Sammelaktion „${act}“ auf ${ids.length} Spieler angewendet.`);
    res.redirect('/admin/users');
  }));

  /* ============================ Spieler-Detail ============================ */
  router.get('/users/:id(\\d+)', wrap(async (req, res) => {
    const u = await db.one('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!u) return res.status(404).render('error', { code: 404, title: 'Spieler nicht gefunden', message: '' });
    const startYear = settings.get('game.start_year');
    const chars = await db.query('SELECT id, parent_id, cycle, generation, status, name, game_day, money, end_reason, created_at, updated_at FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 60', [u.id]);
    const audits = await db.query('SELECT action, detail, ip, created_at FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 25', [u.id]);
    const purchases = await db.query('SELECT * FROM purchases WHERE user_id = ? ORDER BY id DESC LIMIT 25', [u.id]);
    const ads = await db.query('SELECT * FROM ad_claims WHERE user_id = ? ORDER BY id DESC LIMIT 15', [u.id]);
    const sess = await db.one('SELECT COUNT(*) n FROM sessions WHERE data LIKE ?', [`%"userId":${u.id}%`]);
    let meta = {}; try { meta = u.meta ? JSON.parse(u.meta) : {}; } catch (_) { /* leer */ }
    const sub = u.sub_until ? new Date(Number(u.sub_until)) : null;
    render(res, 'admin/user', {
      title: u.username, active: 'users', u, meta,
      chars: chars.map((x) => ({ ...x, year: startYear + Math.floor(x.game_day / 365) })), audits, purchases, ads, sessions: sess.n,
      subLocal: sub ? new Date(sub.getTime() - sub.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
    });
  }));

  router.post('/users/:id(\\d+)/edit', wrap(async (req, res) => {
    const id = int(req.params.id); const b = req.body;
    const u = await db.one('SELECT * FROM users WHERE id = ?', [id]);
    if (!u) return res.redirect('/admin/users');
    const self = id === req.user.id;
    try {
      const username = clean(b.username, 40); const email = clean(b.email, 190).toLowerCase();
      if (!/^[\p{L}\p{N}_.\- ]{3,40}$/u.test(username)) throw new Error('Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . - Leerzeichen).');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Ungültige E-Mail-Adresse.');
      let meta; try { meta = JSON.parse(b.meta || '{}'); } catch (e) { throw new Error(`Meta-JSON ungültig: ${e.message}`); }
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('Meta muss ein Objekt sein.');
      const roleReq = require('../lib/roles').ROLES.includes(b.role) ? b.role : 'player';
      const role = (self || req.user.role !== 'admin') ? u.role : roleReq;
      const banned = self ? 0 : (b.banned ? 1 : 0);
      const sub = b.sub_until ? new Date(b.sub_until).getTime() : null;
      if (b.sub_until && !Number.isFinite(sub)) throw new Error('Abo-Ende: ungültiges Datum.');
      await db.query(
        'UPDATE users SET username=?, email=?, role=?, banned=?, ban_reason=?, email_verified=?, coins=?, efs_pool=?, sub_until=?, meta=?, login_bonus_date=? WHERE id=?',
        [username, email, role, banned, banned ? (clean(b.ban_reason, 200) || null) : null, b.email_verified ? 1 : 0, Math.max(0, int(b.coins)), Math.max(0, int(b.efs_pool)), sub, JSON.stringify(meta), b.reset_bonus ? null : u.login_bonus_date, id],
      );
      if (banned && !u.banned) await db.query('DELETE FROM sessions WHERE data LIKE ?', [`%"userId":${id}%`]);
      if (b.new_password) {
        if (String(b.new_password).length < 8) throw new Error('Neues Passwort: mindestens 8 Zeichen.');
        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(b.new_password), 11), id]);
      }
      await audit(req, 'admin_user_edit', `${u.username} → ${username}`);
      flash(req, 'good', 'Konto gespeichert.');
    } catch (e) { flash(req, 'bad', e.code === 'ER_DUP_ENTRY' ? 'Benutzername oder E-Mail ist schon vergeben.' : e.message); }
    res.redirect(`/admin/users/${id}`);
  }));

  router.post('/users/:id(\\d+)/impersonate', wrap(async (req, res) => {
    const id = int(req.params.id);
    const u = await db.one('SELECT id, username, banned FROM users WHERE id = ?', [id]);
    if (!u || id === req.user.id) { flash(req, 'bad', 'Das geht hier nicht.'); return res.redirect('/admin/users'); }
    await audit(req, 'admin_impersonate', u.username);
    req.session.impersonator = req.user.id;
    req.session.userId = id;
    res.redirect('/play');
  }));
  router.post('/users/:id(\\d+)/kick', wrap(async (req, res) => {
    const id = int(req.params.id);
    const r = await db.query('DELETE FROM sessions WHERE data LIKE ?', [`%"userId":${id}%`]);
    await audit(req, 'admin_user_kick', String(id));
    flash(req, 'good', `${r.affectedRows} Sitzung(en) beendet – der Spieler muss sich neu anmelden.`);
    res.redirect(`/admin/users/${id}`);
  }));

  /* ============================ Charaktere ============================ */
  router.get('/characters', wrap(async (req, res) => {
    const q = clean(req.query.q, 60); const st = clean(req.query.st, 12); const sort = clean(req.query.sort, 12);
    const page = Math.max(1, int(req.query.page, 1)); const per = 40;
    const conds = []; const params = [];
    if (q) { conds.push('(c.name LIKE ? OR u.username LIKE ? OR c.id = ?)'); params.push(`%${q}%`, `%${q}%`, int(q, -1)); }
    if (['alive', 'dead', 'gameover'].includes(st)) { conds.push('c.status = ?'); params.push(st); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const order = { money: 'c.money DESC', day: 'c.game_day DESC', gen: 'c.generation DESC', upd: 'c.updated_at DESC' }[sort] || 'c.id DESC';
    const total = (await db.one(`SELECT COUNT(*) n FROM characters c JOIN users u ON u.id = c.user_id ${where}`, params)).n;
    const rows = await db.query(`SELECT c.id, c.user_id, c.cycle, c.generation, c.status, c.name, c.game_day, c.money, c.end_reason, c.updated_at, u.username FROM characters c JOIN users u ON u.id = c.user_id ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, per, (page - 1) * per]);
    const startYear = settings.get('game.start_year');
    render(res, 'admin/characters', { title: 'Charaktere', active: 'characters', rows: rows.map((x) => ({ ...x, year: startYear + Math.floor(x.game_day / 365) })), q, st, sort, page, pages: Math.max(1, Math.ceil(total / per)), total });
  }));

  router.get('/characters/:id(\\d+)', wrap(async (req, res) => {
    const row = await charRow(req.params.id);
    if (!row) return res.status(404).render('error', { code: 404, title: 'Charakter nicht gefunden', message: '' });
    let state; try { state = parseState(row.state); } catch (e) { return res.render('admin/character', { title: `Charakter ${row.id}`, active: 'characters', row, broken: e.message, raw: row.state, groups: [], sections: [], values: {}, cities: [], profs: [], year: 0 }); }
    const cityRows = await db.query('SELECT id, name FROM cities ORDER BY name');
    const profRows = await db.query('SELECT pkey, name FROM professions ORDER BY name');
    const values = {};
    FIELD_GROUPS.forEach((g) => g.fields.forEach((f) => { values[f[0]] = getPath(state, f[0]); }));
    const secs = SECTIONS.map(([k, label]) => ({ key: k, label, json: JSON.stringify(state[k] === undefined ? null : state[k], null, 2) }));
    const known = new Set([...SECTIONS.map((x) => x[0]), ...FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f[0].split('.')[0])), 'v', 'seed', 'nextPropId', 'nextCompanyId', 'nextChildId', 'nextNoticeId', 'interrupts', 'person', 'plan', 'cards', 'flags', 'meters', 'stats', 'insurance', 'hunger', 'restZero']);
    const extra = Object.keys(state).filter((k) => !known.has(k)).map((k) => ({ key: k, label: k, json: JSON.stringify(state[k], null, 2) }));
    render(res, 'admin/character', {
      title: `${row.name || 'Charakter'} (#${row.id})`, active: 'characters', row, broken: null, groups: FIELD_GROUPS, sections: secs.concat(extra), values,
      cities: cityRows, profs: profRows.map((p) => ({ key: p.pkey, name: p.name })),
      rawState: state, year: yearOf(state.day, state.startYear), counters: ['nextPropId', 'nextCompanyId', 'nextChildId', 'nextNoticeId'].map((k) => [k, state[k]]),
    });
  }));

  function coerce(type, raw, opts) {
    if (type === 'bool') return raw === '1' || raw === 'on';
    if (type === 'int') { const n = parseInt(raw, 10); if (!Number.isFinite(n)) throw new Error('ganze Zahl erwartet'); return n; }
    if (type === 'float') { const n = parseFloat(String(raw).replace(',', '.')); if (!Number.isFinite(n)) throw new Error('Zahl erwartet'); return n; }
    if (type === 'city') { const n = parseInt(raw, 10); if (!Number.isFinite(n)) throw new Error('Stadt wählen'); return n; }
    if (type === 'select') { if (!opts.includes(raw)) throw new Error('ungültige Auswahl'); return raw; }
    return String(raw == null ? '' : raw).slice(0, 120);
  }

  router.post('/characters/:id(\\d+)/save', wrap(async (req, res) => {
    const row = await charRow(req.params.id);
    if (!row) return res.redirect('/admin/characters');
    try {
      const state = parseState(row.state); const b = req.body;
      for (const g of FIELD_GROUPS) for (const [path, label, type, opts] of g.fields) {
        if (type === 'bool') { setPath(state, path, b[path] === '1' || b[path] === 'on'); continue; }
        if (b[path] === undefined) continue;
        try { setPath(state, path, coerce(type, b[path], opts)); } catch (e) { throw new Error(`${label}: ${e.message}`); }
      }
      for (const k of ['nextPropId', 'nextCompanyId', 'nextChildId', 'nextNoticeId']) if (b[k] !== undefined && b[k] !== '') { const n = int(b[k], NaN); if (Number.isFinite(n) && n >= 1) state[k] = n; }
      for (const key of Object.keys(b).filter((k) => k.startsWith('sec_'))) {
        const k = key.slice(4); let v;
        try { v = JSON.parse(b[key]); } catch (e) { throw new Error(`Bereich „${k}“: ungültiges JSON (${e.message}).`); }
        if (v === null) delete state[k]; else state[k] = v;
      }
      if (!Array.isArray(state.properties)) state.properties = [];
      if (!Array.isArray(state.children)) state.children = [];
      if (!Array.isArray(state.companies)) state.companies = [];
      if (!Array.isArray(state.notices)) state.notices = [];
      state.person.id = state.person.id || null;
      if (state.status === 'alive') state.death = state.death && state.death.gameOver ? null : (state.death && state.death.heirIds ? null : state.death);
      upgradeState(state);
      await writeState(row, state);
      await audit(req, 'admin_character_save', `#${row.id} (${row.username})`);
      flash(req, 'good', 'Charakter gespeichert. Der Spieler sieht die Änderung beim nächsten Laden.');
    } catch (e) { flash(req, 'bad', e.message); }
    res.redirect(`/admin/characters/${req.params.id}`);
  }));

  router.post('/characters/:id(\\d+)/raw', wrap(async (req, res) => {
    const row = await charRow(req.params.id);
    if (!row) return res.redirect('/admin/characters');
    try {
      let state; try { state = JSON.parse(req.body.state); } catch (e) { throw new Error(`Ungültiges JSON: ${e.message}`); }
      for (const k of ['person', 'meters', 'housing', 'stats']) if (!state[k] || typeof state[k] !== 'object') throw new Error(`Pflichtbereich „${k}“ fehlt.`);
      if (!Number.isFinite(state.day) || !Number.isFinite(state.money)) throw new Error('„day“ und „money“ müssen Zahlen sein.');
      if (!['alive', 'dead', 'gameover'].includes(state.status)) throw new Error('„status“ muss alive, dead oder gameover sein.');
      upgradeState(state);
      await writeState(row, state);
      await audit(req, 'admin_character_raw', `#${row.id}`);
      flash(req, 'good', 'Spielstand ersetzt.');
    } catch (e) { flash(req, 'bad', e.message); }
    res.redirect(`/admin/characters/${req.params.id}`);
  }));

  router.post('/characters/:id(\\d+)/quick', wrap(async (req, res) => {
    const row = await charRow(req.params.id);
    if (!row) return res.redirect('/admin/characters');
    const w = await worldSvc.get(); const b = req.body; const doit = clean(b.do, 30);
    try {
      const state = parseState(row.state); const year = yearOf(state.day, state.startYear); let msg = 'Erledigt.';
      const ctx = { world: w, state, offline: true };
      if (doit === 'heal') { Object.assign(state.meters, { fridge: 100, wellbeing: 100, rest: 100, health: 100 }); state.life.illness = null; state.hunger = 0; state.restZero = 0; msg = 'Alle Meter auf 100 gesetzt, Krankheit geheilt.'; }
      else if (doit === 'fridge') { state.meters.fridge = 100; state.hunger = 0; msg = 'Kühlschrank gefüllt.'; }
      else if (doit === 'revive') {
        state.status = 'alive'; state.death = null; state.meters.health = Math.max(state.meters.health, 60); state.hunger = 0; state.restZero = 0; state.interrupts = [];
        const pr = state.tree.persons.find((x) => x.id === state.person.id); if (pr) { pr.status = 'alive'; delete pr.died; }
        chronicle(state, `${state.person.first} ${state.person.last} wird vom Schicksal zurückgeholt.`, 'event');
        await db.query('UPDATE characters SET ended_at = NULL, end_reason = NULL WHERE id = ?', [row.id]);
        msg = 'Charakter wiederbelebt (Status: lebt).';
      } else if (doit === 'kill') { endLife(ctx, clean(b.reason, 60) || 'Vom Admin beendet', 'admin'); msg = `Leben beendet → Status: ${state.status}.`; }
      else if (doit === 'money') { const n = Math.round(parseFloat(String(b.amount).replace(',', '.')) * 100); if (!Number.isFinite(n)) throw new Error('Betrag fehlt.'); state.money += n; msg = `${n >= 0 ? '+' : ''}${(n / 100).toFixed(2)} gebucht.`; }
      else if (doit === 'advance') { const n = Math.max(1, Math.min(3650, int(b.days, 1))); const r = advance(w, state, n, { mode: 'offline' }); msg = `${r.advanced} Tage vorgespult → ${yearOf(state.day, state.startYear)}.`; }
      else if (doit === 'setyear') { const y = int(b.year, NaN); if (!Number.isFinite(y) || y < state.startYear) throw new Error('Jahr ungültig.'); state.day = (y - state.startYear) * 365 + (state.day % 365); msg = `Spieldatum auf ${y} gesetzt.`; }
      else if (doit === 'cards') { state.cards.health = Math.max(0, state.cards.health + int(b.amount)); msg = 'Gesundheitskarten angepasst.'; }
      else if (doit === 'learn') { if (!w.prof(b.pkey)) throw new Error('Beruf unbekannt.'); learn(state, b.pkey); msg = `Beruf „${w.prof(b.pkey).name}“ als erlernt eingetragen.`; }
      else if (doit === 'unlearn') { state.skills.learned = state.skills.learned.filter((k) => k !== b.pkey); msg = 'Qualifikation entfernt.'; }
      else if (doit === 'unemploy') { state.occupation = null; msg = 'Beruf/Ausbildung beendet.'; }
      else if (doit === 'clear') { state.notices = []; state.interrupts = []; state.pending = {}; msg = 'Meldungen und Merker gelöscht.'; }
      else if (doit === 'cooldowns') { state.taskCd = {}; state.pending.taskStart = {}; msg = 'Aufgaben-Abkühlzeiten zurückgesetzt.'; }
      else if (doit === 'repair') { for (const p of state.properties) { p.condition = 100; delete p.closedUntil; } msg = 'Alle Immobilien repariert.'; }
      else if (doit === 'notice') { notice(state, { level: clean(b.level, 8) || 'info', title: clean(b.title, 80) || 'Nachricht', text: clean(b.text, 500), interrupt: !!b.interrupt }); msg = 'Meldung zugestellt.'; }
      else throw new Error('Unbekannte Aktion.');
      upgradeState(state);
      await writeState(row, state);
      await audit(req, `admin_char_${doit}`, `#${row.id} (${row.username})`);
      flash(req, 'good', msg);
    } catch (e) { flash(req, 'bad', e.message); }
    res.redirect(`/admin/characters/${req.params.id}`);
  }));

  router.post('/characters/:id(\\d+)/delete', wrap(async (req, res) => {
    const row = await charRow(req.params.id);
    if (!row) return res.redirect('/admin/characters');
    await db.query('UPDATE characters SET parent_id = NULL WHERE parent_id = ?', [row.id]);
    await db.query('DELETE FROM characters WHERE id = ?', [row.id]);
    await audit(req, 'admin_character_delete', `#${row.id} ${row.name} (${row.username})`);
    flash(req, 'good', 'Charakter gelöscht.');
    res.redirect(`/admin/users/${row.user_id}`);
  }));

  router.get('/characters/:id(\\d+)/preview', wrap(async (req, res) => {
    const row = await charRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'nicht gefunden' });
    const user = await db.one('SELECT * FROM users WHERE id = ?', [row.user_id]);
    try { user.meta = user.meta ? JSON.parse(user.meta) : {}; } catch (_) { user.meta = {}; }
    const w = await worldSvc.get();
    res.json(present(w, parseState(row.state), user, Date.now()));
  }));

  H.randomToken = randomToken;
};
