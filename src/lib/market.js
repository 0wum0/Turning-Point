'use strict';
/**
 * Spielermarkt: Kaufangebote (mit Gegenangebot), Sofortkauf zum Verkaufspreis, Versteigerungen (freiwillig und bei Insolvenz).
 * Preise werden in „Wert von 1945“ (real) gespeichert; jede Seite zahlt/erhält in ihrer eigenen Zeit und Währung
 * (real × Preisindex des eigenen Spieljahres). Gebühren (Grunderwerbsteuer o. Ä.) trägt der Käufer und fließen an den Staat.
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const service = require('../game/service');
const social = require('./social');
const anticheat = require('./anticheat');
const biz = require('../game/business');
const { yearOf } = require('../game/calendar');
const { notice, chronicle, propertyValue } = require('../game/core');
const { ActionError } = require('../game/actions');

const cfg = () => settings.get('market');
const fail = (m) => { throw new ActionError(m); };
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const idxOf = (world, s) => Math.max(0.0001, world.idx(yearOf(s.day, s.startYear)));
const curSym = (world, s) => (yearOf(s.day, s.startYear) >= (world.econ.euroYear || 2002) ? '€' : 'DM');
const fmt = (world, s, cents) => `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curSym(world, s)}`;
const worldP = () => require('../game/world').get();

/* ---------------------------- Gegenstände ---------------------------- */
const findItem = (state, kind, id) => (kind === 'prop' ? state.properties : state.companies || []).find((x) => x.id === id);

function valueReal(world, state, kind, item) {
  const year = yearOf(state.day, state.startYear); const idx = idxOf(world, state);
  return Math.round((kind === 'prop' ? propertyValue(world, state, item, year) : biz.companyValue(world, state, item, year)) / idx);
}

/** Entnimmt einen Gegenstand dem Spielstand und gibt eine zeitunabhängige Momentaufnahme zurück. */
function detach(world, state, kind, id) {
  const item = findItem(state, kind, id); if (!item) fail('Diesen Gegenstand besitzt du nicht (mehr).');
  if (kind === 'firm' && item.stock && !detach.allowListed) fail('Ein börsennotierter Betrieb kann nur über die Börse den Besitzer wechseln.');
  const snap = JSON.parse(JSON.stringify(item));
  snap.rel = {};
  if (kind === 'prop') {
    snap.rel.closed = Math.max(0, (item.closedUntil || 0) - state.day);
    if (state.housing.type === 'own' && state.housing.propertyId === item.id) state.housing = { type: 'street', cityId: state.cityId };
    state.properties = state.properties.filter((x) => x.id !== item.id);
    delete snap.lease;
  } else {
    state.money += item.cash || 0; snap.cash = 0;
    snap.rel.strike = Math.max(0, (item.strikeUntil || 0) - state.day);
    snap.rel.abandoned = item.abandoned ? state.day - item.abandoned.day : null;
    state.companies = state.companies.filter((x) => x.id !== item.id);
    if (state.occupation && state.occupation.ownCompanyId === item.id) state.occupation = null;
    delete snap.playerStaff; delete snap.playerManager;
  }
  return snap;
}

function attach(world, state, kind, snap, { force = false } = {}) {
  const it = JSON.parse(JSON.stringify(snap)); const rel = it.rel || {}; delete it.rel;
  if (kind === 'prop') {
    it.id = state.nextPropId++; it.closedUntil = state.day + (rel.closed || 0); it.bought = state.day; state.properties.push(it);
  } else {
    if (!force && (state.companies || []).length >= world.econ.companies.maxCompanies) fail('Der Käufer besitzt schon die maximale Anzahl an Unternehmen.');
    it.id = state.nextCompanyId++; it.since = state.day; it.cash = 0; it.manager = !!it.manager;
    if (rel.strike) it.strikeUntil = state.day + rel.strike; else delete it.strikeUntil;
    if (rel.abandoned != null) it.abandoned = { day: state.day - rel.abandoned };
    state.companies = state.companies || []; state.companies.push(it);
  }
  return it;
}

/** Regeln, die der Käufer erfüllen muss (Qualifikation für einen laufenden Betrieb). */
function checkBuyer(world, state, kind, snap) {
  if (kind === 'firm' && !snap.abandoned) {
    const q = biz.qualification(world, state, snap.pkey, snap.tier);
    if (!q.ok) fail('Dir fehlt die Qualifikation für diesen Betrieb (Beruf und Stufe).');
  }
}

/* ---------------------------- Verkauf ausführen ---------------------------- */
async function lockOne(conn, userId) {
  await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
  const row = await service.activeRow(conn, userId);
  if (!row || row.status !== 'alive') fail('Der Käufer hat keinen lebenden Charakter.');
  return { row, s: require('../game/state').parseState(row.state) };
}

/**
 * Überträgt einen Gegenstand vom Verkäufer (oder aus dem Treuhand-/Insolvenzbestand, seller=null, snap gegeben) an den Käufer.
 * Läuft in der Transaktion `conn`; wirft ActionError, wenn etwas nicht passt.
 */
async function executeSale(conn, world, { kind, sellerId, buyerId, itemId, snap, priceReal, via, escrow }) {
  const C = cfg();
  const two = sellerId ? await social.lockPair(conn, sellerId, buyerId) : null;
  let rowS = null; let sS = null; let rowB; let sB;
  if (two) { rowS = two.rowA; sS = two.sA; rowB = two.rowB; sB = two.sB; } else { const o = await lockOne(conn, buyerId); rowB = o.row; sB = o.s; }
  if (sB.day < C.minGameDays) fail(`Dein Charakter muss mindestens ${C.minGameDays} Spieltage alt sein.`);
  let item = snap;
  if (!item) { if (!findItem(sS, kind, itemId)) fail('Der Gegenstand gehört dem Verkäufer nicht mehr.'); }
  const valSnapState = sS || sB;
  const value = item ? Math.round((kind === 'prop' ? propertyValue(world, sB, item, yearOf(sB.day, sB.startYear)) : biz.companyValue(world, sB, item, yearOf(sB.day, sB.startYear))) / idxOf(world, sB)) : valueReal(world, sS, kind, findItem(sS, kind, itemId));
  const idxB = idxOf(world, sB);
  const cost = Math.round(priceReal * idxB); const fee = Math.round(cost * (kind === 'prop' ? C.propFeePct : C.firmFeePct) / 100);
  if (sB.money < cost + fee) fail(`Dir fehlt das Geld (Kaufpreis ${fmt(world, sB, cost)} plus ${fmt(world, sB, fee)} Gebühren).`);
  if (!item) item = detach(world, sS, kind, itemId);
  checkBuyer(world, sB, kind, item);
  const placed = attach(world, sB, kind, item);
  sB.money -= cost + fee; sB.stats.spent = (sB.stats.spent || 0) + cost + fee;
  let got = 0;
  if (sS) { got = Math.round(priceReal * idxOf(world, sS)); sS.money += got; sS.stats.earned = (sS.stats.earned || 0) + got; }
  const what = kind === 'prop' ? 'Immobilie' : 'Betrieb';
  const nameS = sS ? `${sS.person.first} ${sS.person.last}` : 'der Zwangsversteigerung';
  const nameB = `${sB.person.first} ${sB.person.last}`;
  notice(sB, { level: 'good', title: `${what} gekauft: ${placed.name}`, text: `Du hast ${placed.name} für ${fmt(world, sB, cost)} (plus ${fmt(world, sB, fee)} Gebühren) erworben.`, tab: kind === 'prop' ? 'housing' : 'business', interrupt: true });
  chronicle(sB, `${sB.person.first} erwirbt ${placed.name}${sS ? ` von ${nameS}` : ' bei der Zwangsversteigerung'}.`, 'property');
  if (sS) { notice(sS, { level: 'good', title: `${what} verkauft: ${placed.name}`, text: `${nameB} zahlt dir ${fmt(world, sS, got)}.`, tab: 'social', interrupt: true }); chronicle(sS, `${sS.person.first} verkauft ${placed.name} an ${nameB}.`, 'property'); }
  if (rowS) await service.saveCharacter(conn, rowS, sS);
  await service.saveCharacter(conn, rowB, sB);
  const uB = await service.loadUser(conn, buyerId); const w = world;
  await social.upsertStats(conn, uB, rowB, sB, w);
  if (sS) { const uS = await service.loadUser(conn, sellerId); await social.upsertStats(conn, uS, rowS, sS, w); }
  await conn.query("INSERT INTO social_log (kind, from_user, to_user, amount, ref) VALUES ('trade',?,?,?,?)", [buyerId, sellerId || 0, Math.round(priceReal), `${kind}:${placed.name}`.slice(0, 120)]);
  // Öffentliche Meldung in der Zeitung der Stadt
  try {
    const vis = await conn.query('SELECT id, social_public FROM users WHERE id IN (?, ?)', [buyerId, sellerId || buyerId]);
    if (vis.every((x) => x.social_public)) await conn.query('INSERT INTO public_news (city_id, user_id, section, title, text) VALUES (?,?,?,?,?)', [placed.cityId, buyerId, 'Wirtschaft', `${placed.name} hat einen neuen Besitzer`, `${nameB} übernimmt ${placed.name}${sS ? ` von ${nameS}` : ' bei der Zwangsversteigerung'}.`]);
  } catch (_) { /* nur Zugabe */ }
  // Verkaufsangebote und offene Angebote für diesen Gegenstand erledigen
  if (sellerId) {
    if (kind === 'prop') await conn.query("UPDATE player_leases SET status = 'ended', ended_by = 'owner' WHERE owner_id = ? AND prop_id = ? AND status = 'active'", [sellerId, itemId]); // Spieler-Mieter verliert die Wohnung
    await conn.query("UPDATE market_offers SET status = 'void' WHERE seller_id = ? AND kind = ? AND item_id = ? AND status = 'open'", [sellerId, kind, itemId]);
    await conn.query(kind === 'prop' ? 'DELETE FROM player_props WHERE user_id = ? AND prop_id = ?' : 'DELETE FROM player_firms WHERE user_id = ? AND company_id = ?', [sellerId, itemId]);
  }
  // Wertsprung/Missbrauch: auffällige Geschäfte unter Konten mit gleicher IP
  if (sellerId && await social.sameIp(sellerId, buyerId)) anticheat.flag(buyerId, 'gift_ring', `Handel (${kind}) mit Konto gleicher IP (Nutzer ${sellerId}) für ${Math.round(priceReal / 100)} (Wert 1945)`);
  return { placed, cost, fee, got, value, via };
}

async function guards(userId, otherId) {
  const C = cfg(); if (!C.enabled) fail('Der Spielermarkt ist gerade geschlossen.');
  if (userId === otherId) fail('Mit dir selbst kannst du nicht handeln.');
  const o = await db.one('SELECT id, banned, is_bot FROM users WHERE id = ?', [otherId]); if (!o || o.banned) fail('Dieser Spieler ist nicht erreichbar.');
  const rel = await social.relation(userId, otherId); if (rel === 'blocked' || rel === 'blocked_by') fail('Dieser Spieler ist nicht erreichbar.');
  const a = await social.accountAgeHours(userId); if (a.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.');
  if (C.blockSameIp && await social.sameIp(userId, otherId)) { anticheat.flag(userId, 'gift_ring', `Handelsversuch mit Konto gleicher IP (Nutzer ${otherId})`); fail('Zwischen Konten mit derselben Internetverbindung ist Handel nicht erlaubt.'); }
}

/* ---------------------------- Angebote ---------------------------- */
async function makeOffer(buyerId, { kind, ownerId, itemId, priceReal, message }) {
  const C = cfg(); await guards(buyerId, ownerId);
  if (!['prop', 'firm'].includes(kind)) fail('Unbekannte Art.');
  priceReal = int(priceReal); if (priceReal < 100) fail('Der Preis ist zu klein.');
  const world = await worldP();
  const row = await service.activeRow(db, ownerId); if (!row || row.status !== 'alive') fail('Der Eigentümer spielt gerade keinen lebenden Charakter.');
  const sO = require('../game/state').parseState(row.state); const item = findItem(sO, kind, itemId); if (!item) fail('Diesen Gegenstand gibt es nicht mehr.');
  const val = valueReal(world, sO, kind, item);
  if (priceReal < val * (C.offerMinPct / 100)) fail(`Das Angebot muss mindestens ${C.offerMinPct} % des Werts betragen.`);
  const me = await service.activeRow(db, buyerId); if (!me || me.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  const sM = require('../game/state').parseState(me.state);
  if (sM.day < C.minGameDays) fail(`Dein Charakter muss mindestens ${C.minGameDays} Spieltage alt sein.`);
  const open = (await db.one("SELECT COUNT(*) n FROM market_offers WHERE proposer = ? AND status = 'open'", [buyerId])).n; if (open >= C.maxOpenOffers) fail(`Du hast schon ${C.maxOpenOffers} offene Angebote.`);
  const today = (await db.one("SELECT COUNT(*) n FROM market_offers WHERE proposer = ? AND created_at > NOW() - INTERVAL 1 DAY", [buyerId])).n; if (today >= C.offersPerDay) fail('Für heute reicht es mit den Angeboten.');
  const dup = await db.one("SELECT id FROM market_offers WHERE buyer_id = ? AND seller_id = ? AND kind = ? AND item_id = ? AND status = 'open'", [buyerId, ownerId, kind, itemId]); if (dup) fail('Du hast für diesen Gegenstand schon ein offenes Angebot.');
  const r = await db.query("INSERT INTO market_offers (kind, buyer_id, seller_id, item_id, item_name, price_real, proposer, message, expires_at) VALUES (?,?,?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? DAY))", [kind, buyerId, ownerId, itemId, item.name, priceReal, buyerId, social.clean(message, 240), C.offerExpireDays]);
  const nm = (await db.one('SELECT name FROM player_stats WHERE user_id = ?', [buyerId])) || {};
  await social.sendSystemLetter(ownerId, 'Kaufangebot', `${nm.name || 'Ein Spieler'} möchte „${item.name}“ kaufen. Antworte unter „Spieler → Markt“.`, buyerId);
  return r.insertId;
}

async function respondOffer(userId, id, action, counterReal) {
  const world = await worldP();
  const o = await db.one('SELECT * FROM market_offers WHERE id = ?', [id]);
  if (!o || o.status !== 'open') fail('Dieses Angebot ist nicht mehr offen.');
  if (new Date(o.expires_at).getTime() < Date.now()) { await db.query("UPDATE market_offers SET status = 'expired' WHERE id = ?", [id]); fail('Dieses Angebot ist abgelaufen.'); }
  if (o.proposer === userId) fail('Auf dein eigenes Angebot kannst du nicht antworten.');
  if (userId !== o.buyer_id && userId !== o.seller_id) fail('Das darfst du nicht entscheiden.');
  const other = userId === o.buyer_id ? o.seller_id : o.buyer_id;
  const notify = (subject, body) => social.sendSystemLetter(other, subject, body, userId);
  if (action === 'decline') { await db.query("UPDATE market_offers SET status = 'declined' WHERE id = ?", [id]); await notify('Angebot abgelehnt', `Für „${o.item_name}“ hat es diesmal nicht geklappt.`); return { status: 'declined' }; }
  if (action === 'counter') {
    const p = int(counterReal); if (p < 100) fail('Der Preis ist zu klein.');
    await db.query("UPDATE market_offers SET status = 'countered' WHERE id = ?", [id]);
    const r = await db.query("INSERT INTO market_offers (kind, buyer_id, seller_id, item_id, item_name, price_real, proposer, status, parent_id, expires_at) VALUES (?,?,?,?,?,?,?, 'open', ?, DATE_ADD(NOW(), INTERVAL ? DAY))", [o.kind, o.buyer_id, o.seller_id, o.item_id, o.item_name, p, userId, id, cfg().offerExpireDays]);
    await notify('Gegenangebot', `Zu „${o.item_name}“ gibt es ein Gegenangebot. Antworte unter „Spieler → Markt“.`);
    return { status: 'countered', id: r.insertId };
  }
  if (action !== 'accept') fail('Unbekannte Antwort.');
  const res = await db.tx(async (conn) => {
    const r = await executeSale(conn, world, { kind: o.kind, sellerId: o.seller_id, buyerId: o.buyer_id, itemId: o.item_id, priceReal: Number(o.price_real), via: 'offer' });
    await conn.query("UPDATE market_offers SET status = 'accepted' WHERE id = ?", [id]);
    return r;
  });
  return { status: 'accepted', cost: res.cost };
}

async function withdrawOffer(userId, id) {
  const o = await db.one('SELECT * FROM market_offers WHERE id = ?', [id]);
  if (!o || o.status !== 'open' || o.proposer !== userId) fail('Dieses Angebot lässt sich nicht zurückziehen.');
  await db.query("UPDATE market_offers SET status = 'withdrawn' WHERE id = ?", [id]);
}

/* ---------------------------- Verkaufspreis / Sofortkauf ---------------------------- */
async function setAsk(userId, kind, itemId, askReal) {
  const t = kind === 'prop' ? ['player_props', 'prop_id'] : ['player_firms', 'company_id']; if (!['prop', 'firm'].includes(kind)) fail('Unbekannte Art.');
  const row = await db.one(`SELECT 1 x FROM ${t[0]} WHERE user_id = ? AND ${t[1]} = ?`, [userId, itemId]); if (!row) fail('Diesen Gegenstand besitzt du nicht (mehr).');
  const v = askReal == null ? null : int(askReal); if (v != null && v < 100) fail('Der Preis ist zu klein.');
  await db.query(`UPDATE ${t[0]} SET ask_real = ? WHERE user_id = ? AND ${t[1]} = ?`, [v, userId, itemId]);
}

async function buyNow(buyerId, sellerId, kind, itemId) {
  await guards(buyerId, sellerId); const world = await worldP();
  const t = kind === 'prop' ? ['player_props', 'prop_id'] : ['player_firms', 'company_id'];
  const row = await db.one(`SELECT ask_real FROM ${t[0]} WHERE user_id = ? AND ${t[1]} = ?`, [sellerId, itemId]);
  if (!row || row.ask_real == null) fail('Dieser Gegenstand steht nicht (mehr) zum Verkauf.');
  return db.tx((conn) => executeSale(conn, world, { kind, sellerId, buyerId, itemId, priceReal: Number(row.ask_real), via: 'ask' }));
}

/* ---------------------------- Versteigerungen ---------------------------- */
async function startAuction(userId, kind, itemId, minReal, hours) {
  const C = cfg(); if (!C.enabled) fail('Der Spielermarkt ist gerade geschlossen.');
  const world = await worldP(); const min = int(minReal); if (min < 100) fail('Das Mindestgebot ist zu klein.');
  const h = Math.max(1, Math.min(72, int(hours, C.auctionHours)));
  return service.withCharacter(userId, async (ctx) => {
    const it = findItem(ctx.state, kind, itemId); if (!it) fail('Diesen Gegenstand besitzt du nicht (mehr).');
    const val = valueReal(world, ctx.state, kind, it);
    const snap = detach(world, ctx.state, kind, itemId);
    const r = await ctx.conn.query("INSERT INTO market_auctions (kind, seller_id, city_id, item, name, reason, min_real, value_real, ends_at) VALUES (?,?,?,?,?,'owner',?,?, DATE_ADD(NOW(), INTERVAL ? HOUR))", [kind, userId, snap.cityId, JSON.stringify(snap), snap.name, min, val, h]);
    await ctx.conn.query(kind === 'prop' ? 'DELETE FROM player_props WHERE user_id = ? AND prop_id = ?' : 'DELETE FROM player_firms WHERE user_id = ? AND company_id = ?', [userId, itemId]);
    await ctx.conn.query("UPDATE market_offers SET status = 'void' WHERE seller_id = ? AND kind = ? AND item_id = ? AND status = 'open'", [userId, kind, itemId]);
    if (kind === 'prop') await ctx.conn.query("UPDATE player_leases SET status = 'ended', ended_by = 'owner' WHERE owner_id = ? AND prop_id = ? AND status = 'active'", [userId, itemId]);
    return { id: r.insertId };
  });
}

async function bid(userId, auctionId, priceReal) {
  const C = cfg(); if (!C.enabled) fail('Der Spielermarkt ist gerade geschlossen.');
  const a = await db.one("SELECT * FROM market_auctions WHERE id = ? AND status = 'open'", [auctionId]);
  if (!a || new Date(a.ends_at).getTime() < Date.now()) fail('Diese Versteigerung ist beendet.');
  if (a.seller_id === userId) fail('Auf die eigene Versteigerung kannst du nicht bieten.');
  if (a.seller_id) await guards(userId, a.seller_id); else { const acc = await social.accountAgeHours(userId); if (acc.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.'); }
  const p = int(priceReal); const floor = a.lead_real == null ? Number(a.min_real) : Math.ceil(Number(a.lead_real) * (1 + C.auctionIncrementPct / 100));
  if (p < floor) fail(`Das Gebot muss mindestens ${Math.round(floor / 100).toLocaleString('de-DE')} (Wert 1945) betragen.`);
  const world = await worldP(); const row = await service.activeRow(db, userId); if (!row || row.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  const s = require('../game/state').parseState(row.state); if (s.day < C.minGameDays) fail(`Dein Charakter muss mindestens ${C.minGameDays} Spieltage alt sein.`);
  const cost = Math.round(p * idxOf(world, s)); const fee = Math.round(cost * (a.kind === 'prop' ? C.propFeePct : C.firmFeePct) / 100);
  if (s.money < cost + fee) fail('Dafür reicht dein Geld nicht (Gebühren kommen hinzu).');
  checkBuyer(world, s, a.kind, JSON.parse(typeof a.item === 'string' ? a.item : JSON.stringify(a.item)));
  const prev = a.lead_user;
  // Gebote kurz vor Schluss verlängern die Versteigerung um 10 Minuten (wie bei echten Auktionen).
  // Bedingtes Update: Wer zeitgleich ein höheres Gebot abgegeben hat, wird nicht überschrieben (der Mindestschritt gilt gegen den aktuellen Stand).
  const upd = await db.query("UPDATE market_auctions SET lead_user = ?, lead_real = ?, ends_at = IF(ends_at < DATE_ADD(NOW(), INTERVAL 10 MINUTE), DATE_ADD(NOW(), INTERVAL 10 MINUTE), ends_at) WHERE id = ? AND status = 'open' AND (lead_real IS NULL OR lead_real * (1 + ? / 100) <= ?)", [userId, p, auctionId, C.auctionIncrementPct, p]);
  if (!upd || !upd.affectedRows) fail('In der Zwischenzeit hat jemand höher geboten. Bitte biete erneut.');
  await db.query('INSERT INTO market_bids (auction_id, user_id, price_real) VALUES (?,?,?)', [auctionId, userId, p]);
  if (prev && prev !== userId) await social.sendSystemLetter(prev, 'Überboten', `Bei der Versteigerung von „${a.name}“ hat jemand mehr geboten. Du kannst noch einmal bieten – unter „Spieler → Markt“.`);
}

async function settleAuctions() {
  const world = await worldP();
  const due = await db.query("SELECT * FROM market_auctions WHERE status = 'open' AND ends_at <= NOW() ORDER BY id LIMIT 20");
  for (const a of due) {
    try {
      const item = typeof a.item === 'string' ? JSON.parse(a.item) : a.item;
      const bids = await db.query('SELECT user_id, price_real FROM market_bids WHERE auction_id = ? ORDER BY price_real DESC, id ASC', [a.id]);
      let sold = false;
      for (const b of bids) {
        try {
          const claimed = await db.query("UPDATE market_auctions SET status = 'sold' WHERE id = ? AND status = 'open'", [a.id]); if (!claimed.affectedRows) { sold = true; break; }
          await db.tx((conn) => executeSale(conn, world, { kind: a.kind, sellerId: null, buyerId: b.user_id, snap: item, priceReal: Number(b.price_real), via: 'auction' }));
          if (a.seller_id) await returnProceeds(world, a.seller_id, Number(b.price_real), a.name);
          sold = true; break;
        } catch (e) {
          await db.query("UPDATE market_auctions SET status = 'open' WHERE id = ? AND status = 'sold'", [a.id]);
          if (e instanceof ActionError) await social.sendSystemLetter(b.user_id, 'Zuschlag verfallen', `Den Zuschlag für „${a.name}“ konntest du nicht annehmen: ${e.message}`); else throw e;
        }
      }
      if (sold) continue;
      // unverkauft: an den Verkäufer zurück oder (Insolvenzmasse) in die nächste Runde mit niedrigerem Mindestgebot
      if (a.seller_id) {
        const ok = await returnItem(world, a.seller_id, a.kind, item);
        await db.query("UPDATE market_auctions SET status = 'unsold' WHERE id = ?", [a.id]);
        await social.sendSystemLetter(a.seller_id, 'Versteigerung ohne Gebot', ok ? `„${a.name}“ fand keinen Käufer und ist wieder in deinem Besitz.` : `„${a.name}“ fand keinen Käufer.`);
      } else if (a.round < 3) await db.query("UPDATE market_auctions SET round = round + 1, min_real = GREATEST(100, ROUND(min_real * 0.6)), ends_at = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ?", [cfg().auctionHours, a.id]);
      else await db.query("UPDATE market_auctions SET status = 'unsold' WHERE id = ?", [a.id]);
    } catch (e) { log.warn(`[market] Auktion ${a.id}: ${e.message}`); }
  }
}

async function returnProceeds(world, sellerId, priceReal, name) {
  let paid = false;
  try {
    await service.withCharacter(sellerId, async (ctx) => {
      if (!ctx.state || ctx.state.status !== 'alive') return;
      const got = Math.round(priceReal * idxOf(world, ctx.state)); ctx.state.money += got; ctx.state.stats.earned = (ctx.state.stats.earned || 0) + got;
      notice(ctx.state, { level: 'good', title: `Versteigert: ${name}`, text: `Der Zuschlag brachte ${fmt(world, ctx.state, got)}.`, tab: 'social', interrupt: true });
      paid = true;
    });
  } catch (e) { log.warn(`[market] Erlös der Versteigerung „${name}“ für Nutzer ${sellerId}: ${e.message}`); }
  // Der Gegenstand ist bereits verkauft: Erlös nie verfallen lassen, sondern als Gutschrift bereithalten (wird beim nächsten lebenden Charakter gebucht)
  if (!paid) await db.query("INSERT INTO pending_credits (user_id, real_amount, reason, text) VALUES (?,?,'auction',?)", [sellerId, Math.round(priceReal), `Erlös der Versteigerung „${String(name).slice(0, 80)}“.`]);
}
async function returnItem(world, sellerId, kind, snap) {
  try {
    await service.withCharacter(sellerId, async (ctx) => {
      if (!ctx.state || ctx.state.status !== 'alive') throw new ActionError('tot');
      attach(world, ctx.state, kind, snap, { force: true }); // der Betrieb gehörte ihm schon: die Obergrenze darf die Rückgabe nicht verhindern
    });
    return true;
  } catch (_) { return false; }
}

/** Insolvenzmasse eines ausgeschiedenen Charakters zwangsversteigern (Spielstand wird dabei geleert). */
async function estate(conn, user, state, world) {
  if (!cfg().enabled || !cfg().estateAuctions) return;
  const make = async (kind, it) => {
    const snap = detach(world, state, kind, it.id); const val = valueReal(world, { ...state, properties: state.properties, companies: state.companies }, kind, { ...it });
    await conn.query("INSERT INTO market_auctions (kind, seller_id, city_id, item, name, reason, min_real, value_real, ends_at) VALUES (?,?,?,?,?,'estate',?,?, DATE_ADD(NOW(), INTERVAL ? HOUR))", [kind, null, snap.cityId, JSON.stringify(snap), snap.name, Math.max(100, Math.round(val * 0.5)), val, cfg().auctionHours]);
  };
  if (state.properties.length || (state.companies || []).length) await require('./tagesblatt').post('market', 'Zwangsversteigerung', `Aus einer Insolvenzmasse kommen ${state.properties.length} Immobilie(n) und ${(state.companies || []).length} Betrieb(e) unter den Hammer.`, state.cityId, conn);
  for (const p of state.properties.slice()) await make('prop', p);
  for (const c of (state.companies || []).slice()) {
    if (c.stock) { await require('./exchange').releaseOrders(conn, c.stock.id); await conn.query("UPDATE stocks SET status = 'delisted' WHERE id = ?", [c.stock.id]); delete c.stock; }
    await make('firm', c);
  }
}

/* ---------------------------- Übersicht für die Oberfläche ---------------------------- */
async function overview(userId) {
  const world = await worldP();
  const mine = (sql, p) => db.query(sql, p);
  const offers = await mine(`SELECT o.*, bs.name buyer_name, ss.name seller_name FROM market_offers o LEFT JOIN player_stats bs ON bs.user_id = o.buyer_id LEFT JOIN player_stats ss ON ss.user_id = o.seller_id WHERE (o.buyer_id = ? OR o.seller_id = ?) AND o.status = 'open' AND o.expires_at > NOW() ORDER BY o.id DESC LIMIT 40`, [userId, userId]);
  const done = await mine(`SELECT o.*, bs.name buyer_name, ss.name seller_name FROM market_offers o LEFT JOIN player_stats bs ON bs.user_id = o.buyer_id LEFT JOIN player_stats ss ON ss.user_id = o.seller_id WHERE (o.buyer_id = ? OR o.seller_id = ?) AND o.status IN ('accepted','declined','countered') ORDER BY o.id DESC LIMIT 8`, [userId, userId]);
  const items = await mine('SELECT 1', []);
  const props = await mine('SELECT prop_id id, name, value_real, ask_real, city_id FROM player_props WHERE user_id = ? ORDER BY value_real DESC', [userId]);
  const firms = await mine('SELECT company_id id, name, value_real, ask_real, city_id, abandoned FROM player_firms WHERE user_id = ? ORDER BY value_real DESC', [userId]);
  void items;
  const shape = (o) => ({ id: o.id, kind: o.kind, name: o.item_name, price: Number(o.price_real), message: o.message, buyerId: o.buyer_id, sellerId: o.seller_id, buyer: o.buyer_name || 'Spieler', seller: o.seller_name || 'Spieler', other: (o.buyer_id === userId ? o.seller_name : o.buyer_name) || 'Spieler', iAmBuyer: o.buyer_id === userId, mine: o.proposer === userId, incoming: o.proposer !== userId, status: o.status, expires: o.expires_at, parent: o.parent_id });
  void world;
  return { offers: offers.map(shape), recent: done.map(shape), props: props.map((p) => ({ id: p.id, name: p.name, value: Number(p.value_real), ask: p.ask_real == null ? null : Number(p.ask_real), cityId: p.city_id })), firms: firms.map((f) => ({ id: f.id, name: f.name, value: Number(f.value_real), ask: f.ask_real == null ? null : Number(f.ask_real), cityId: f.city_id, abandoned: !!f.abandoned })) };
}

async function auctions(userId, cityId) {
  const rows = await db.query(`SELECT a.*, ps.name seller_name FROM market_auctions a LEFT JOIN player_stats ps ON ps.user_id = a.seller_id WHERE a.status = 'open' ${cityId ? 'AND a.city_id = ?' : ''} ORDER BY a.ends_at ASC LIMIT 40`, cityId ? [cityId] : []);
  return rows.map((a) => ({ id: a.id, kind: a.kind, name: a.name, cityId: a.city_id, reason: a.reason, seller: a.seller_id ? (a.seller_name || 'Spieler') : 'Insolvenzmasse', mine: a.seller_id === userId, min: Number(a.min_real), value: Number(a.value_real), lead: a.lead_real == null ? null : Number(a.lead_real), leading: a.lead_user === userId, ends: a.ends_at, round: a.round }));
}

async function expire() {
  await db.query("UPDATE market_offers SET status = 'expired' WHERE status = 'open' AND expires_at <= NOW()");
  await db.query("DELETE FROM market_bids WHERE auction_id IN (SELECT id FROM market_auctions WHERE status <> 'open' AND ends_at < NOW() - INTERVAL 14 DAY)");
}

/** Konkurrenz: Angebot (Räume je Stadt und Betriebsart) aus den veröffentlichten Betrieben neu berechnen. */
async function refreshSupply() {
  const rows = await db.query('SELECT city_id, pkey, SUM(rooms) rooms, COUNT(*) firms FROM player_firms WHERE abandoned = 0 GROUP BY city_id, pkey');
  require('../game/competition').setSupply(rows);
  try { await require('./policies').refresh(); } catch (e) { log.warn(`[policies] ${e.message}`); }
  const world = await worldP(); const bau = world.professions.filter((p) => p.category === 'bau').map((p) => p.pkey);
  if (bau.length) require('../game/contractors').set(await db.query(`SELECT user_id, company_id, name, city_id FROM player_firms WHERE abandoned = 0 AND staff > 0 AND pkey IN (${bau.map(() => '?').join(',')})`, bau));
}

function start() {
  refreshSupply().catch(() => {});
  try { require('./supply').start(); } catch (_) { /* optional */ }
  setInterval(() => { refreshSupply().catch(() => {}); }, 120000).unref();
  setInterval(() => { settleAuctions().catch((e) => log.warn(`[market] ${e.message}`)); }, 60000).unref();
  setInterval(() => { expire().catch(() => {}); }, 3600000).unref();
}

const live = require('./live');
module.exports = live.announce({ refreshSupply, start, makeOffer, respondOffer, withdrawOffer, setAsk, buyNow, startAuction, bid, settleAuctions, estate, overview, auctions, executeSale, detach, attach, valueReal }, ['makeOffer', 'respondOffer', 'withdrawOffer', 'setAsk', 'buyNow', 'startAuction', 'bid', 'settleAuctions'], 'market');
