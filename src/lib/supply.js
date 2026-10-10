'use strict';
/**
 * Lieferverträge zwischen Betrieben von Spielern (und Bots). Ein Vertrag verknüpft zwei Spielstände, die unabhängig laufen:
 *  - Der KÄUFER rechnet täglich in seiner eigenen Zeit ab (src/game/business.js settleContracts): Er zahlt aus der Firmenkasse und merkt die
 *    Gutschrift für den Verkäufer in „realem“ Wert (÷ eigener Preisindex) in state.pending.supply vor.
 *  - `flush` (vor dem Speichern des Käufers, in derselben Transaktion) schreibt diese Vormerkungen als pending_credits (reason 'supply', company_id =
 *    Firma des Verkäufers) und leert die Liste – so wird jede Zahlung genau einmal verbucht. Der Verkäufer erhält sie beim nächsten Laden
 *    seines Spielstands (bonds.reconcileCredits) in seiner Währung und Zeit.
 *  - Die Datenbank ist die Wahrheit über Bestand und Status der Verträge; `reconcile` spiegelt sie beim Laden in state.contracts,
 *    `flush` schreibt Laufzeit/Abnahme (Käufer) und Lieferfähigkeit (Verkäufer) zurück.
 * Angebote entstehen auf Wunsch einer Seite und werden von der anderen angenommen (Brief + Live-Meldung).
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const social = require('./social');
const live = require('./live');
const goods = require('../game/goods');
const { ActionError } = require('../game/actions');

const fail = (m) => { throw new ActionError(m); };
const cfg = () => settings.get('goods') || {};
const ccfg = () => cfg().contracts || {};
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const on = () => cfg().enabled !== false && ccfg().enabled !== false;
const worldP = () => require('../game/world').get();
const round3 = (x) => Math.round(x * 1000) / 1000;

/** Brief über die Transaktion des Aufrufers (kein zweiter Datenbankzugriff, der auf gesperrte Zeilen wartet). */
async function letterConn(conn, to, subject, body, from = null) {
  try {
    await conn.query("INSERT INTO messages (from_user, to_user, kind, subject, body) VALUES (?,?,?,?,?)", [from, to, 'system', subject, body]);
    live.publish('social', {}, to);
  } catch (e) { log.warn(`[supply] Brief: ${e.message}`); }
}

/* ============================================================================================
   Abgleich beim Laden und Zurückschreiben beim Speichern
   ============================================================================================ */
async function endRow(conn, r, byUserId, reason, textFor) {
  const res = await conn.query("UPDATE supply_contracts SET status = 'ended', end_reason = ?, ended_at = NOW() WHERE id = ? AND status = 'active'", [reason, r.id]);
  if (!res || !res.affectedRows) return;
  const other = r.buyer_id === byUserId ? r.seller_id : r.buyer_id;
  const g = goods.good(r.good);
  await letterConn(conn, other, 'Liefervertrag beendet', `Der Liefervertrag über ${g ? g.name : r.good} ist beendet: ${textFor}`);
  live.publish('business', {}, other);
}

const WHY = {
  firm_gone: 'Der Betrieb existiert nicht mehr oder gehört nicht mehr dem Vertragspartner.',
  partner_gone: 'Der Betrieb des Vertragspartners existiert nicht mehr.',
  expired: 'Die Laufzeit ist abgelaufen.',
  died: 'Der Charakter des Vertragspartners lebt nicht mehr.',
};

/** Spiegelt die aktiven Verträge des Spielers in den Spielstand (state.contracts) und beendet Verträge, deren Betrieb nicht mehr besteht. */
async function reconcile(conn, user, state, world) {
  if (!state) return;
  if (!state.contracts || typeof state.contracts !== 'object') state.contracts = { buys: [], sells: [] };
  if (state.status !== 'alive') return;
  if (!on()) { state.contracts = { buys: [], sells: [] }; return; }
  const rows = await conn.query("SELECT * FROM supply_contracts WHERE status = 'active' AND (buyer_id = ? OR seller_id = ?)", [user.id, user.id]);
  const buys = []; const sells = [];
  if (rows.length) {
    const keys = rows.map((r) => (r.buyer_id === user.id ? [r.seller_id, r.seller_company] : [r.buyer_id, r.buyer_company]));
    const pf = await conn.query(
      `SELECT f.user_id, f.company_id, f.abandoned, f.name firm, ps.status, ps.name owner, u.banned FROM player_firms f
       JOIN player_stats ps ON ps.user_id = f.user_id JOIN users u ON u.id = f.user_id
       WHERE (f.user_id, f.company_id) IN (${keys.map(() => '(?,?)').join(',')})`, keys.flat());
    const pmap = new Map(pf.map((r) => [`${r.user_id}|${r.company_id}`, r]));
    for (const r of rows) {
      const iBuy = r.buyer_id === user.id;
      const myFirm = iBuy ? r.buyer_company : r.seller_company;
      const other = pmap.get(iBuy ? `${r.seller_id}|${r.seller_company}` : `${r.buyer_id}|${r.buyer_company}`);
      const mine = (state.companies || []).find((x) => x.id === myFirm && !x.abandoned);
      let why = null;
      if (!mine) why = 'firm_gone'; else if (!other || other.abandoned || other.status !== 'alive' || other.banned) why = 'partner_gone';
      if (why) { await endRow(conn, r, user.id, why, WHY[why]); continue; }
      if (iBuy) buys.push({ id: r.id, firmId: myFirm, sellerId: r.seller_id, sellerFirm: r.seller_company, sellerName: other.owner, sellerFirmName: other.firm, good: r.good, qty: r.qty, price: r.price_real, daysLeft: r.days_left, term: r.term_days, auto: !!r.auto_renew, fill: r.fill, take: r.take, _dl: r.days_left, _take: r.take });
      else sells.push({ id: r.id, firmId: myFirm, buyerId: r.buyer_id, buyerFirm: r.buyer_company, buyerName: other.owner, buyerFirmName: other.firm, good: r.good, qty: r.qty, price: r.price_real, fill: r.fill, take: r.take, _fill: r.fill });
    }
  }
  state.contracts = { buys, sells };
}

/**
 * Vor dem Speichern: Gutschriften an Verkäufer verbuchen (genau einmal – die Liste wird geleert, bevor der Spielstand gespeichert wird),
 * Laufzeit/Abnahme/Lieferfähigkeit zurückschreiben, abgelaufene Verträge beenden. Beendet alle Verträge, wenn der Charakter nicht mehr lebt.
 */
async function flush(conn, user, state) {
  if (!state || !state.pending) return;
  const q = state.pending.supply;
  if (q && q.length) {
    state.pending.supply = [];
    const ids = [...new Set(q.map((x) => x.userId))];
    const alive = new Set((await conn.query(`SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map((r) => r.id));
    for (const e of q) {
      if (!alive.has(e.userId) || !(e.real > 0)) continue;
      await conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text, company_id) VALUES (?,?,'supply',?,?)", [e.userId, e.real, `Lieferung an ${String(e.what || '').slice(0, 80)}`, e.firm || null]);
      live.publish('business', {}, e.userId);
    }
  } else if (state.pending.supply) delete state.pending.supply;
  const K = state.contracts;
  if (state.status !== 'alive') {
    const rows = await conn.query("SELECT * FROM supply_contracts WHERE status IN ('active','offer') AND (buyer_id = ? OR seller_id = ?)", [user.id, user.id]);
    for (const r of rows) {
      if (r.status === 'offer') { await conn.query("UPDATE supply_contracts SET status = 'cancelled', end_reason = 'died', ended_at = NOW() WHERE id = ? AND status = 'offer'", [r.id]); continue; }
      await endRow(conn, r, user.id, 'died', WHY.died);
    }
    return;
  }
  if (!K) return;
  for (const b of K.buys || []) {
    if (b.ended) {
      await endRow(conn, { id: b.id, buyer_id: user.id, seller_id: b.sellerId, good: b.good }, user.id, 'expired', WHY.expired);
    } else if (b.daysLeft !== b._dl || b.take !== b._take) {
      await conn.query("UPDATE supply_contracts SET days_left = ?, take = ? WHERE id = ? AND buyer_id = ? AND status = 'active'", [Math.max(0, Math.round(b.daysLeft)), round3(b.take == null ? 1 : b.take), b.id, user.id]);
      b._dl = b.daysLeft; b._take = b.take;
    }
  }
  K.buys = (K.buys || []).filter((b) => !b.ended);
  for (const s of K.sells || []) {
    if (s.fill < 0.6 && !(s._fill < 0.6) && s.buyerId) { // Lieferausfall gegenüber dem Abnehmer: Spuren (höchstens eine Meldung je 3 Tage und Abnehmer)
      const seen = await conn.one("SELECT 1 x FROM court_evidence WHERE offender_id = ? AND victim_id = ? AND act = 'default' AND created_ms > ? LIMIT 1", [user.id, s.buyerId, Date.now() - 72 * 3600000]);
      if (!seen) await require('./court').trace(conn, { act: 'default', offenderId: user.id, victimId: s.buyerId, victimCompany: s.buyerFirm, subject: s.buyerFirmName, cityId: state.cityId, damageReal: Math.round(Number(s.qty || 0) * Number(s.price || 0) * 3 * 0.1), known: true });
    }
    if (s.fill !== s._fill) { await conn.query("UPDATE supply_contracts SET fill = ? WHERE id = ? AND seller_id = ? AND status = 'active'", [round3(s.fill == null ? 1 : s.fill), s.id, user.id]); s._fill = s.fill; }
  }
}

/* ============================================================================================
   Schätzungen aus den veröffentlichten Betrieben (player_firms + player_stats.year)
   ============================================================================================ */
function unitsOf(world, f, year, dir, good) {
  const tiers = (world.econ.companies || {}).tiers || []; const t = tiers[Math.max(0, Math.min(tiers.length - 1, f.tier || 0))]; const city = world.city(f.city_id);
  if (!t || !city) return 0;
  const ar = goods.activeRecipe(world, f.pkey, year, f.city_id);
  const rev = f.rooms * t.incomePerRoom * (0.7 + 0.15 * city.size_tier) * ar.mult; // Wert 1945 je Tag
  const g = goods.good(good); if (!g) return 0;
  const e = (dir === 'out' ? ar.out : ar.inputs).find((x) => x.good === good);
  return e ? (rev * e.share) / goods.priceReal(g, year) : 0;
}

/** Berufsschlüssel, die eine Ware herstellen (auch in der Zukunft) bzw. verbrauchen. */
function pkeysFor(world, good, dir) {
  const out = [];
  for (const p of world.professions.values()) {
    if (!p.unlocks) continue;
    const r = goods.recipeFor(world, p.pkey);
    if (dir === 'out' ? r.out.some(([g]) => g === good) : r.in.some(([g]) => g === good)) out.push(p.pkey);
  }
  return out;
}

async function self(userId) {
  const ps = await db.one('SELECT ps.*, u.banned, u.is_bot FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ps.user_id = ?', [userId]);
  if (!ps || ps.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  if (ps.banned) fail('Dein Konto ist gesperrt.');
  return ps;
}

/* ============================================================================================
   Suche: Lieferanten und Abnehmer
   ============================================================================================ */
async function partners(userId, companyId, goodKey, side) {
  if (!on()) fail('Lieferverträge sind gerade nicht möglich.');
  const world = await worldP();
  const g = goods.good(goodKey); if (!g || g.service) fail('Diese Ware kann nicht gehandelt werden.');
  const ps = await self(userId);
  const mine = await db.one('SELECT * FROM player_firms WHERE user_id = ? AND company_id = ?', [userId, int(companyId)]); if (!mine) fail('Diesen Betrieb besitzt du nicht.');
  const want = side === 'buyer' ? 'in' : 'out'; // Wen suche ich? Lieferanten stellen die Ware her, Abnehmer verbrauchen sie.
  const keys = pkeysFor(world, goodKey, want);
  if (!keys.length) return { good: g.name, unit: g.unit, list: [], note: want === 'out' ? 'Diese Ware wird von keiner Betriebsart hergestellt – du kaufst sie im Großhandel.' : 'Diese Ware verbraucht kein Betrieb.' };
  const city = world.city(mine.city_id);
  const sameRegion = ccfg().sameRegionOnly !== false;
  const cityIds = world.cityList.filter((c) => (sameRegion ? c.state === (city && city.state) : true)).map((c) => c.id);
  if (!cityIds.length) return { good: g.name, unit: g.unit, list: [] };
  const rows = await db.query(
    `SELECT f.user_id, f.company_id, f.city_id, f.name, f.pkey, f.tier, f.rooms, ps.name owner, ps.year, u.username
     FROM player_firms f JOIN users u ON u.id = f.user_id JOIN player_stats ps ON ps.user_id = f.user_id
     WHERE f.abandoned = 0 AND f.user_id <> ? AND ps.status = 'alive' AND u.banned = 0 AND u.social_public = 1
       AND f.pkey IN (${keys.map(() => '?').join(',')}) AND f.city_id IN (${cityIds.map(() => '?').join(',')})
     ORDER BY (f.city_id = ?) DESC, f.rooms DESC LIMIT 40`, [userId, ...keys, ...cityIds, mine.city_id]);
  const ids = rows.map((r) => r.user_id);
  const deals = ids.length ? await db.query(`SELECT seller_id, COUNT(*) n FROM supply_contracts WHERE status IN ('active','ended') AND seller_id IN (${ids.map(() => '?').join(',')}) GROUP BY seller_id`, ids) : [];
  const dmap = new Map(deals.map((d) => [d.seller_id, Number(d.n)]));
  const my = await db.query("SELECT buyer_id, buyer_company, seller_id, seller_company FROM supply_contracts WHERE good = ? AND status IN ('offer','active') AND (buyer_id = ? OR seller_id = ?)", [goodKey, userId, userId]);
  const list = rows.map((r) => ({
    userId: r.user_id, companyId: r.company_id, firm: r.name, owner: r.owner, cityId: r.city_id, city: (world.city(r.city_id) || {}).name, sameCity: r.city_id === mine.city_id,
    tier: r.tier, rooms: r.rooms, units: Math.round(unitsOf(world, r, r.year, want, goodKey) * 10) / 10,
    deals: dmap.get(r.user_id) || 0, linked: my.some((m) => (m.seller_id === r.user_id && m.seller_company === r.company_id) || (m.buyer_id === r.user_id && m.buyer_company === r.company_id)),
  })).filter((r) => r.units > 0);
  const price = goods.priceReal(g, ps.year); // Richtpreis (Wert 1945) – Spanne in Prozent legt der Spieler fest
  const band = await bandFor(userId); // Preisband: Das Ansehen weitet oder verengt den Rahmen
  return { good: g.name, unit: g.unit, key: g.key, baseReal: price, min: Math.ceil(band.lo), max: Math.floor(band.hi), band: { pad: band.pad, name: band.name, blocked: band.blocked }, list };
}

/* ============================================================================================
   Angebote, Annahme, Kündigung
   ============================================================================================ */
async function firmCount(userId, companyId, ignoreId = 0) {
  const r = await db.one("SELECT COUNT(*) n FROM supply_contracts WHERE status IN ('active','offer') AND id <> ? AND ((buyer_id = ? AND buyer_company = ?) OR (seller_id = ? AND seller_company = ?))", [ignoreId, userId, companyId, userId, companyId]);
  return Number(r.n);
}

async function loadFirm(userId, companyId) {
  return db.one('SELECT f.*, ps.year, ps.status pstatus, u.banned FROM player_firms f JOIN player_stats ps ON ps.user_id = f.user_id JOIN users u ON u.id = f.user_id WHERE f.user_id = ? AND f.company_id = ?', [userId, int(companyId)]);
}

/** Gemeinsame Prüfung eines Geschäfts zwischen Verkäufer- und Käuferbetrieb; wirft bei Verstößen. */
async function checkDeal(world, sellerFirm, buyerFirm, goodKey, ignoreId = 0) {
  const g = goods.good(goodKey); if (!g || g.service) fail('Diese Ware kann nicht gehandelt werden.');
  if (!sellerFirm || sellerFirm.abandoned || sellerFirm.pstatus !== 'alive' || sellerFirm.banned) fail('Der Betrieb des Lieferanten ist nicht verfügbar.');
  if (!buyerFirm || buyerFirm.abandoned || buyerFirm.pstatus !== 'alive' || buyerFirm.banned) fail('Der Betrieb des Abnehmers ist nicht verfügbar.');
  if (sellerFirm.user_id === buyerFirm.user_id) fail('Beide Betriebe gehören dir – dafür brauchst du keinen Vertrag.');
  if (!goods.activeRecipe(world, sellerFirm.pkey, sellerFirm.year, sellerFirm.city_id).out.some((o) => o.good === goodKey)) fail(`Der Lieferant stellt ${g.name} nicht her.`);
  if (!goods.activeRecipe(world, buyerFirm.pkey, buyerFirm.year, buyerFirm.city_id).inputs.some((o) => o.good === goodKey)) fail(`Der Abnehmer braucht ${g.name} gar nicht.`);
  if (ccfg().sameRegionOnly !== false) {
    const a = world.city(sellerFirm.city_id); const b = world.city(buyerFirm.city_id);
    if (!a || !b || a.state !== b.state) fail('Lieferverträge gibt es nur innerhalb eines Bundeslands.');
  }
  const max = int(ccfg().maxPerFirm, 4);
  if (await firmCount(sellerFirm.user_id, sellerFirm.company_id, ignoreId) >= max) fail(`Der Betrieb des Lieferanten hat schon ${max} Verträge/Angebote.`);
  if (await firmCount(buyerFirm.user_id, buyerFirm.company_id, ignoreId) >= max) fail(`Der Betrieb des Abnehmers hat schon ${max} Verträge/Angebote.`);
  const dup = await db.one("SELECT id FROM supply_contracts WHERE status IN ('active','offer') AND seller_id = ? AND seller_company = ? AND buyer_id = ? AND buyer_company = ? AND good = ? AND id <> ?", [sellerFirm.user_id, sellerFirm.company_id, buyerFirm.user_id, buyerFirm.company_id, goodKey, ignoreId]);
  if (dup) fail('Zwischen diesen Betrieben gibt es für diese Ware schon einen Vertrag oder ein Angebot.');
  return g;
}

/** Erlaubtes Preisband in % des Marktpreises: Das Ansehen des Anbietenden weitet den Rahmen (oder verengt ihn). */
async function bandFor(userId) {
  const c = ccfg(); const RP = require('../game/reputation');
  const base = { lo: num(c.minPricePct, 90, 50, 100), hi: num(c.maxPricePct, 115, 100, 300) };
  let lv = 0; try { lv = (await require('./reputation').get(userId)).level; } catch (_) { /* ohne Ruf */ }
  const pad = RP.contractBandPad(lv);
  return { lo: Math.max(50, Math.round((base.lo - pad) * 10) / 10), hi: Math.min(300, Math.round((base.hi + pad) * 10) / 10), pad, lv, name: RP.levelName(lv), blocked: RP.block(lv, RP.minFor('contract')) };
}

async function guard(userId, otherId) {
  const a = await social.accountAgeHours(userId);
  if (a.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.');
  if (a.h < num(ccfg().minAccountHours, 12, 0, 1e5)) fail(`Lieferverträge sind erst ${ccfg().minAccountHours} Stunden nach der Registrierung möglich.`);
  const rel = await social.relation(userId, otherId); if (rel === 'blocked' || rel === 'blocked_by') fail('Dieser Spieler ist nicht erreichbar.');
  if (ccfg().blockSameIp !== false && await social.sameIp(userId, otherId)) {
    try { await require('./anticheat').flag(userId, 'gift_ring', `Liefervertrag mit Konto gleicher IP (Nutzer ${otherId})`); } catch (_) { /* optional */ }
    fail('Zwischen Konten mit derselben Internetverbindung sind keine Lieferverträge erlaubt.');
  }
}

/**
 * Angebot machen. input: { role: 'buy'|'sell' (meine Rolle), myCompany, otherUser, otherCompany, good, qty, pricePct, termDays, auto }.
 * Der Preis wird als Prozent des Richtpreises der Ware (Wert 1945) festgeschrieben.
 */
async function offer(userId, input) {
  if (!on()) fail('Lieferverträge sind gerade nicht möglich.');
  await require('./court').assertFree(userId, 'trade'); // Haft und Gewerbeverbot
  const world = await worldP();
  const c = ccfg();
  const ps = await self(userId);
  const role = input.role === 'sell' ? 'sell' : 'buy';
  const otherId = int(input.otherUser);
  if (!otherId || otherId === userId) fail('Bitte einen Vertragspartner wählen.');
  await guard(userId, otherId);
  const mineFirm = await loadFirm(userId, input.myCompany); if (!mineFirm) fail('Diesen Betrieb besitzt du nicht.');
  const otherFirm = await loadFirm(otherId, input.otherCompany); if (!otherFirm) fail('Der Betrieb des Partners wurde nicht gefunden.');
  const other = await db.one('SELECT social_public, banned FROM users WHERE id = ?', [otherId]); if (!other || other.banned || !other.social_public) fail('Dieser Spieler ist nicht erreichbar.');
  const sellerFirm = role === 'sell' ? mineFirm : otherFirm; const buyerFirm = role === 'buy' ? mineFirm : otherFirm;
  const goodKey = String(input.good || '');
  const g = await checkDeal(world, sellerFirm, buyerFirm, goodKey);
  const qty = num(input.qty, 0, 0, 1e7);
  if (!(qty > 0)) fail('Bitte eine Menge pro Tag angeben.');
  const pct = num(input.pricePct, 100, 0, 1000);
  const band = await bandFor(userId);
  const lo = band.lo; const hi = band.hi;
  if (band.blocked) fail(`Lieferverträge sind dir so nicht möglich. ${band.blocked}`);
  if (pct < lo || pct > hi) fail(`Der Preis muss zwischen ${lo} % und ${hi} % des Marktpreises liegen.${band.pad ? ` (Dein Ansehen „${band.name}“ ${band.pad > 0 ? 'weitet' : 'verengt'} den Rahmen.)` : ''}`);
  const term = Math.round(num(input.termDays, 90, 1, 3650));
  const tmin = int(c.minTermDays, 30); const tmax = int(c.maxTermDays, 730);
  if (term < tmin || term > tmax) fail(`Die Laufzeit muss zwischen ${tmin} und ${tmax} Tagen liegen.`);
  const n = (await db.one("SELECT COUNT(*) n FROM supply_contracts WHERE proposer_id = ? AND created_at > NOW() - INTERVAL 1 DAY", [userId])).n;
  if (Number(n) >= int(c.offersPerDay, 12)) fail('Heute hast du schon genug Angebote verschickt.');
  const price = goods.priceReal(g, ps.year) * (pct / 100);
  const r = await db.query(
    "INSERT INTO supply_contracts (seller_id, seller_company, buyer_id, buyer_company, proposer_id, good, qty, price_real, term_days, days_left, auto_renew, status) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'offer')",
    [sellerFirm.user_id, sellerFirm.company_id, buyerFirm.user_id, buyerFirm.company_id, userId, goodKey, qty, price, term, term, input.auto ? 1 : 0]);
  const unit = g.unit;
  await social.sendSystemLetter(otherId, 'Lieferangebot', `${ps.name} bietet einen Liefervertrag an: ${role === 'sell' ? `${sellerFirm.name} liefert dir` : `${buyerFirm.name} möchte von dir`} ${g.name} (${Math.round(qty * 10) / 10} ${unit} pro Tag, ${term} Tage, ${Math.round(pct)} % des Marktpreises). Antworte unter „Unternehmen → Lieferverträge“.`, userId);
  live.publish('business', {}, otherId);
  return r.insertId;
}

async function respond(userId, id, accept) {
  if (!on()) fail('Lieferverträge sind gerade nicht möglich.');
  const world = await worldP();
  const row = await db.one("SELECT * FROM supply_contracts WHERE id = ? AND status = 'offer'", [int(id)]);
  if (!row) fail('Dieses Angebot gibt es nicht mehr.');
  if (row.proposer_id === userId) fail('Auf dein eigenes Angebot antwortet der andere.');
  if (row.buyer_id !== userId && row.seller_id !== userId) fail('Das ist nicht dein Angebot.');
  const proposer = row.proposer_id; const g = goods.good(row.good);
  if (!accept) {
    await db.query("UPDATE supply_contracts SET status = 'declined', ended_at = NOW() WHERE id = ? AND status = 'offer'", [row.id]);
    await social.sendSystemLetter(proposer, 'Lieferangebot abgelehnt', `Dein Lieferangebot über ${g ? g.name : row.good} wurde abgelehnt.`, userId);
    live.publish('business', {}, proposer);
    return { accepted: false };
  }
  await self(userId); await guard(userId, proposer); await require('./court').assertFree(userId, 'trade');
  const sellerFirm = await loadFirm(row.seller_id, row.seller_company); const buyerFirm = await loadFirm(row.buyer_id, row.buyer_company);
  await checkDeal(world, sellerFirm, buyerFirm, row.good, row.id);
  const ok = await db.query("UPDATE supply_contracts SET status = 'active', days_left = term_days, accepted_at = NOW(), fill = 1, take = 1 WHERE id = ? AND status = 'offer'", [row.id]);
  if (!ok.affectedRows) fail('Das Angebot ist nicht mehr gültig.');
  await social.sendSystemLetter(proposer, 'Lieferangebot angenommen', `Dein Lieferangebot über ${g ? g.name : row.good} wurde angenommen. Der Vertrag läuft ab dem nächsten Spieltag.`, userId);
  live.publish('business', {}, proposer); live.publish('business', {}, userId);
  return { accepted: true };
}

async function cancel(userId, id) {
  const row = await db.one("SELECT * FROM supply_contracts WHERE id = ? AND status IN ('offer','active') AND (buyer_id = ? OR seller_id = ?)", [int(id), userId, userId]);
  if (!row) fail('Diesen Vertrag gibt es nicht mehr.');
  const other = row.buyer_id === userId ? row.seller_id : row.buyer_id; const g = goods.good(row.good);
  if (row.status === 'offer') {
    await db.query("UPDATE supply_contracts SET status = ?, ended_at = NOW() WHERE id = ? AND status = 'offer'", [row.proposer_id === userId ? 'cancelled' : 'declined', row.id]);
    if (row.proposer_id !== userId) await social.sendSystemLetter(other, 'Lieferangebot abgelehnt', `Dein Lieferangebot über ${g ? g.name : row.good} wurde abgelehnt.`, userId);
  } else {
    await db.query("UPDATE supply_contracts SET status = 'cancelled', end_reason = 'cancel', ended_at = NOW() WHERE id = ? AND status = 'active'", [row.id]);
    // Wer einen laufenden Vertrag vorzeitig kündigt (mehr als 10 Tage Restlaufzeit), schadet seiner Zuverlässigkeit
    if (Number(row.days_left) > 10) {
      await require('./reputation').add(userId, 'rel', null, 'contract_cancel', `c${row.id}`, { other });
      // Gericht: Vertragsbruch hinterlässt Spuren; der Partner kennt den Täter
      const pf = await db.one('SELECT city_id, name FROM player_firms WHERE user_id = ? AND company_id = ?', [other, row.buyer_id === userId ? row.seller_company : row.buyer_company]);
      const g0 = goods.good(row.good);
      await require('./court').trace(null, { act: 'breach', offenderId: userId, victimId: other, victimCompany: row.buyer_id === userId ? row.seller_company : row.buyer_company, subject: pf ? pf.name : (g0 ? g0.name : null), cityId: pf ? pf.city_id : 0, damageReal: Math.round(Number(row.qty) * Number(row.price_real) * Math.min(30, Number(row.days_left)) * 0.1), known: true });
    }
    await social.sendSystemLetter(other, 'Liefervertrag gekündigt', `Der Liefervertrag über ${g ? g.name : row.good} wurde vom Vertragspartner gekündigt. Ab sofort kaufst du im Großhandel (wenn „Automatisch einkaufen“ an ist).`, userId);
  }
  live.publish('business', {}, other);
}

/** Eigene Angebote und Verträge (für die Oberfläche). Preise real (Wert 1945), der Browser rechnet mit dem Index des Spielers um. */
async function mine(userId) {
  const world = await worldP();
  const rows = await db.query(
    `SELECT c.*, bs.name buyer_name, ss.name seller_name, bf.name buyer_firm, sf.name seller_firm
     FROM supply_contracts c
     LEFT JOIN player_stats bs ON bs.user_id = c.buyer_id LEFT JOIN player_stats ss ON ss.user_id = c.seller_id
     LEFT JOIN player_firms bf ON bf.user_id = c.buyer_id AND bf.company_id = c.buyer_company
     LEFT JOIN player_firms sf ON sf.user_id = c.seller_id AND sf.company_id = c.seller_company
     WHERE (c.buyer_id = ? OR c.seller_id = ?) AND c.status IN ('offer','active') ORDER BY c.status, c.id DESC LIMIT 80`, [userId, userId]);
  const f = (r) => {
    const iBuy = r.buyer_id === userId; const g = goods.good(r.good);
    return {
      id: r.id, status: r.status, role: iBuy ? 'buy' : 'sell', incoming: r.proposer_id !== userId, good: r.good, goodName: g ? g.name : r.good, unit: g ? g.unit : '',
      myCompany: iBuy ? r.buyer_company : r.seller_company, myFirm: iBuy ? r.buyer_firm : r.seller_firm,
      otherUser: iBuy ? r.seller_id : r.buyer_id, otherName: iBuy ? r.seller_name : r.buyer_name, otherFirm: iBuy ? r.seller_firm : r.buyer_firm,
      qty: r.qty, priceReal: r.price_real, term: r.term_days, daysLeft: r.days_left, auto: !!r.auto_renew, fill: r.fill, take: r.take, since: r.accepted_at || r.created_at,
    };
  };
  const list = rows.map(f);
  const band = await bandFor(userId);
  return { enabled: on(), maxPerFirm: int(ccfg().maxPerFirm, 4), band: { lo: band.lo, hi: band.hi, pad: band.pad, name: band.name, blocked: band.blocked }, contracts: list.filter((x) => x.status === 'active'), offers: list.filter((x) => x.status === 'offer') };
}

/** Veraltete Angebote ablaufen lassen, alte beendete Verträge löschen. */
async function expire() {
  const ttl = Math.max(1, int(ccfg().offerTtlHours, 72));
  await db.query(`UPDATE supply_contracts SET status = 'expired', ended_at = NOW() WHERE status = 'offer' AND created_at < NOW() - INTERVAL ${ttl} HOUR`);
  await db.query("DELETE FROM supply_contracts WHERE status IN ('ended','declined','cancelled','expired') AND COALESCE(ended_at, created_at) < NOW() - INTERVAL 45 DAY");
}
function start() { setInterval(() => { expire().catch((e) => log.warn(`[supply] ${e.message}`)); }, 3600000).unref(); }

/* ============================================================================================
   Bots: sehen aus wie Spieler – verhandeln selten, aber ganz normal
   ============================================================================================ */
async function botRound(userId, rnd = Math.random) {
  if (!on()) return;
  const world = await worldP();
  const ps = await db.one("SELECT ps.* FROM player_stats ps WHERE ps.user_id = ? AND ps.status = 'alive'", [userId]); if (!ps) return;
  const lo = num(ccfg().minPricePct, 90, 50, 100); const hi = num(ccfg().maxPricePct, 115, 100, 300);
  // 1) Eingehende Angebote: überlegt annehmen oder ablehnen
  const inbox = await db.query("SELECT * FROM supply_contracts WHERE status = 'offer' AND proposer_id <> ? AND (buyer_id = ? OR seller_id = ?) ORDER BY id LIMIT 5", [userId, userId, userId]);
  for (const o of inbox) {
    if (rnd() > 0.5) continue; // nicht sofort: wie ein Mensch, der später antwortet
    const pct = (o.price_real / goods.priceReal(goods.good(o.good) || { base: 1, trend: null }, ps.year)) * 100;
    const iBuy = o.buyer_id === userId;
    // Bots schauen auch auf den Ruf des Anbietenden: Wer als unzuverlässig gilt, bekommt eine Absage; wer angesehen ist, eher eine Zusage
    let rl = 0; try { rl = (await require('./reputation').get(o.proposer_id)).level; } catch (_) { /* ohne Ruf */ }
    const fair = (iBuy ? pct <= 109 : pct >= 96) && rl >= 0;
    try { await respond(userId, o.id, fair && rnd() < (rl >= 2 ? 0.92 : 0.8)); } catch (_) { /* Partner/Ware nicht mehr passend */ }
  }
  // 2) Selten selbst ein Angebot machen (Einkauf der wichtigsten Zutat)
  if (rnd() > 0.2) return;
  const firms = await db.query('SELECT * FROM player_firms WHERE user_id = ? AND abandoned = 0 ORDER BY RAND() LIMIT 1', [userId]);
  const f = firms[0]; if (!f) return;
  const ar = goods.activeRecipe(world, f.pkey, ps.year, f.city_id);
  const inp = ar.inputs.filter((i) => !goods.good(i.good).service).sort((a, b) => b.share - a.share)[0]; if (!inp) return;
  const found = await partners(userId, f.company_id, inp.good, 'supplier').catch(() => null);
  const cands = ((found && found.list) || []).filter((p) => !p.linked && p.units > 0);
  if (!cands.length) return;
  const p = cands[Math.floor(rnd() * Math.min(3, cands.length))];
  const need = unitsOf(world, f, ps.year, 'in', inp.good);
  const qty = Math.max(0.5, Math.round(Math.min(need, p.units) * (0.4 + rnd() * 0.5) * 10) / 10);
  try {
    await offer(userId, { role: 'buy', myCompany: f.company_id, otherUser: p.userId, otherCompany: p.companyId, good: inp.good, qty, pricePct: Math.round(lo + (hi - lo) * (0.35 + rnd() * 0.3)), termDays: [60, 90, 180, 365][Math.floor(rnd() * 4)], auto: rnd() < 0.5 });
  } catch (_) { /* Grenzen erreicht */ }
}

module.exports = { reconcile, flush, partners, offer, respond, cancel, mine, expire, start, botRound, checkDeal, unitsOf, pkeysFor, on };
