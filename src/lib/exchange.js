'use strict';
/**
 * Börse für Spielerbetriebe: Börsengang (1.000 Anteile), Orderbuch mit Limit-Orders, Marktteilnehmer („Börse“, Nutzer 0) für Grundliquidität,
 * Dividenden aus den Betriebsgewinnen, Übernahme durch den Mehrheitsaktionär. Kurse in „Wert von 1945“ (real); jeder zahlt/erhält in
 * seiner eigenen Währung. Gebote werden vorab reserviert, Erlöse Abwesender als Gutschrift (pending_credits) zugestellt.
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const service = require('../game/service');
const market = require('./market');
const biz = require('../game/business');
const { yearOf } = require('../game/calendar');
const { notice, chronicle } = require('../game/core');
const { ActionError } = require('../game/actions');

const cfg = () => settings.get('exchange');
const fail = (m) => { throw new ActionError(m); };
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const idxOf = (world, s) => Math.max(0.0001, world.idx(yearOf(s.day, s.startYear)));
const worldP = () => require('../game/world').get();
const MAKER = 0;

/** Fairer Wert je Anteil (real): Substanz- und Ertragswert (6 × Jahresgewinn) gemittelt, nie unter 40 % der Substanz. */
function fairPerShare(valueReal, profitRealPerDay, shares) {
  const total = Math.max(valueReal * 0.4, (valueReal + 6 * profitRealPerDay * 365) / 2);
  return Math.max(1, Math.round(total / shares));
}

/* ---- Marktteilnehmer-Grenzen (reine Funktionen, in test/exchange.test.js geprüft) ---- */

/** Spread (Prozent) des Marktteilnehmers: Grundspread plus Zuschlag je Geschäft, das dieser Nutzer heute schon mit ihm gemacht hat, gedeckelt. */
function makerSpreadPct(X, tradesToday) {
  const base = Number(X.makerSpreadPct) || 0; const step = Number(X.makerSpreadStepPct) || 0;
  const max = Math.max(base, Number(X.makerSpreadMaxPct) || base);
  return Math.min(max, base + step * Math.max(0, tradesToday | 0));
}
/** Wie viele Anteile zum Kurs `price` (real, Cent) passen noch in das Tageslimit des Nutzers beim Marktteilnehmer (Gesamtwert real, Cent)? */
function capShares(X, usedReal, price) {
  const cap = Number(X.makerUserDailyReal); if (!(cap > 0)) return Infinity; // 0 = kein Limit
  return Math.max(0, Math.floor((cap - Math.max(0, usedReal)) / Math.max(1, price)));
}
/** Anteile, die der Nutzer dem Marktteilnehmer anbieten darf: Frisch gekaufte (innerhalb der Haltefrist) sind gesperrt. */
function sellableToMaker(held, boughtRecently) { return Math.max(0, (held | 0) - Math.max(0, boughtRecently | 0)); }
/** Orders von Konten mit derselben Internetverbindung (Scheinhandel) fallen aus dem Abgleich. */
function dropWash(orders, blockedUserIds) { const b = blockedUserIds instanceof Set ? blockedUserIds : new Set(blockedUserIds); return orders.filter((o) => !b.has(o.user_id)); }

async function makerUsage(conn, userId) {
  const r = await conn.one('SELECT COUNT(*) n, COALESCE(SUM(shares * price_real), 0) v FROM stock_trades WHERE ((buyer = ? AND seller = 0) OR (seller = ? AND buyer = 0)) AND created_at > NOW() - INTERVAL 1 DAY', [userId, userId]);
  return { trades: Number(r.n) || 0, valueReal: Number(r.v) || 0 };
}
async function boughtRecently(conn, stockId, userId, minutes) {
  if (!(minutes > 0)) return 0;
  const r = await conn.one('SELECT COALESCE(SUM(shares), 0) n FROM stock_trades WHERE stock_id = ? AND buyer = ? AND created_at > NOW() - INTERVAL ? MINUTE', [stockId, userId, Math.round(minutes)]);
  return Number(r.n) || 0;
}
/** Konten mit gleicher IP wie `userId` unter den Gegenparteien (Orderbuch-Abgleich). */
async function washSet(userId, orders, X) {
  if (!X.blockSameIp) return new Set();
  const social = require('./social'); const out = new Set();
  for (const id of new Set(orders.map((o) => o.user_id))) if (id && id !== userId && await social.sameIp(userId, id)) out.add(id);
  if (out.size) { try { require('./anticheat').flag(userId, 'gift_ring', `Börsenorder gegen Konto gleicher IP (Nutzer ${[...out].join(', ')})`); } catch (_) { /* Zugabe */ } }
  return out;
}

async function holding(conn, stockId, userId) { return (await conn.one('SELECT shares, avg_real FROM stock_holdings WHERE stock_id = ? AND user_id = ?', [stockId, userId])) || { shares: 0, avg_real: 0 }; }
async function addHolding(conn, stockId, userId, n, price) {
  const h = await holding(conn, stockId, userId); const total = h.shares + n;
  const avg = n > 0 ? Math.round((Number(h.avg_real) * h.shares + price * n) / Math.max(1, total)) : Number(h.avg_real);
  await conn.query('INSERT INTO stock_holdings (stock_id, user_id, shares, avg_real) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE shares = VALUES(shares), avg_real = VALUES(avg_real)', [stockId, userId, total, avg]);
}
const credit = (conn, userId, real, text) => (userId && real > 0 ? conn.query("INSERT INTO pending_credits (user_id, real_amount, reason, text) VALUES (?,?,'stock',?)", [userId, Math.round(real), text]) : null);

/** Eine Teilausführung buchen: Anteile zum Käufer, Kurs fortschreiben. (Geld regelt der Aufrufer.) */
async function fill(conn, st, buyer, seller, n, p) {
  if (seller === MAKER) await addHolding(conn, st.id, MAKER, -n, p);
  await addHolding(conn, st.id, buyer, n, p);
  await conn.query('INSERT INTO stock_trades (stock_id, buyer, seller, shares, price_real) VALUES (?,?,?,?,?)', [st.id, buyer, seller, n, p]);
  await conn.query('UPDATE stocks SET price_real = ? WHERE id = ?', [p, st.id]); st.price_real = p;
}

async function makerCapLeft(conn, st) {
  const used = (await conn.one('SELECT COALESCE(SUM(shares),0) n FROM stock_trades WHERE stock_id = ? AND (buyer = 0 OR seller = 0) AND created_at > NOW() - INTERVAL 1 DAY', [st.id])).n;
  return Math.max(0, Math.floor(st.shares * cfg().makerDailyPct / 100) - Number(used));
}

/** Gebot/Verkauf einstellen und sofort abgleichen (in der Transaktion des Spielers). */
async function place(userId, stockId, side, shares, limitReal) {
  const X = cfg(); if (!X.enabled) fail('Die Börse ist geschlossen.');
  shares = int(shares); limitReal = int(limitReal);
  if (!['buy', 'sell'].includes(side)) fail('Unbekannte Order.');
  if (shares < 1 || shares > X.maxOrderShares) fail(`Eine Order umfasst 1 bis ${X.maxOrderShares} Anteile.`);
  if (limitReal < 1) fail('Der Preis ist ungültig.');
  const world = await worldP();
  return service.withCharacter(userId, async (ctx) => {
    const { conn, state: s } = ctx; if (!s || s.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
    const st = await conn.one("SELECT * FROM stocks WHERE id = ? AND status = 'active' FOR UPDATE", [stockId]); if (!st) fail('Diese Aktie gibt es nicht (mehr).');
    const open = (await conn.one("SELECT COUNT(*) n FROM stock_orders WHERE user_id = ? AND status = 'open'", [userId])).n; if (open >= X.openOrdersMax) fail(`Du hast schon ${X.openOrdersMax} offene Orders.`);
    const idx = idxOf(world, s); let left = shares; let moved = 0; let sumReal = 0; const limits = [];
    if (side === 'buy') {
      const cost = Math.round(limitReal * shares * idx); if (s.money < cost) fail('Dafür reicht dein Geld nicht (das Gebot wird vorab reserviert).');
      s.money -= cost; s.stats.spent = (s.stats.spent || 0) + cost;
      const ord = (await conn.query("INSERT INTO stock_orders (stock_id, user_id, side, shares, left_shares, limit_real) VALUES (?,?,'buy',?,?,?)", [stockId, userId, shares, shares, limitReal])).insertId;
      const asksAll = await conn.query("SELECT * FROM stock_orders WHERE stock_id = ? AND status = 'open' AND side = 'sell' AND limit_real <= ? AND user_id <> ? ORDER BY limit_real ASC, id ASC FOR UPDATE", [stockId, limitReal, userId]);
      const asks = dropWash(asksAll, await washSet(userId, asksAll, X));
      for (const a of asks) {
        if (!left) break; const n = Math.min(left, a.left_shares); const p = Number(a.limit_real);
        await fill(conn, st, userId, a.user_id, n, p);
        await credit(conn, a.user_id, p * n, `Verkauf von ${n} Anteilen „${st.name}“.`);
        await conn.query("UPDATE stock_orders SET left_shares = left_shares - ?, status = IF(left_shares - ? <= 0, 'filled', 'open') WHERE id = ?", [n, n, a.id]);
        left -= n; moved += n; sumReal += p * n; s.money += Math.round((limitReal - p) * n * idx);
      }
      if (left > 0) {
        const use = await makerUsage(conn, userId);
        const ask = Math.ceil(Number(st.price_real) * (1 + makerSpreadPct(X, use.trades) / 100));
        const n = Math.min(left, (await holding(conn, stockId, MAKER)).shares, await makerCapLeft(conn, st), capShares(X, use.valueReal, ask));
        if (capShares(X, use.valueReal, ask) === 0) limits.push('Dein Tageslimit beim Marktteilnehmer der Börse ist ausgeschöpft.');
        if (n > 0 && ask <= limitReal) { await fill(conn, st, userId, MAKER, n, ask); left -= n; moved += n; sumReal += ask * n; s.money += Math.round((limitReal - ask) * n * idx); }
      }
      await conn.query('UPDATE stock_orders SET left_shares = ?, status = ? WHERE id = ?', [left, left > 0 ? 'open' : 'filled', ord]);
      if (moved) notice(s, { level: 'good', title: `Aktien gekauft: ${st.name}`, text: `${moved} Anteile für durchschnittlich ${Math.round(sumReal / moved / 100)} (Wert 1945).`, tab: 'social' });
    } else {
      const h = await holding(conn, stockId, userId); if (h.shares < shares) fail(`Du besitzt nur ${h.shares} Anteile.`);
      await conn.query('UPDATE stock_holdings SET shares = shares - ? WHERE stock_id = ? AND user_id = ?', [shares, stockId, userId]);
      const ord = (await conn.query("INSERT INTO stock_orders (stock_id, user_id, side, shares, left_shares, limit_real) VALUES (?,?,'sell',?,?,?)", [stockId, userId, shares, shares, limitReal])).insertId;
      const bidsAll = await conn.query("SELECT * FROM stock_orders WHERE stock_id = ? AND status = 'open' AND side = 'buy' AND limit_real >= ? AND user_id <> ? ORDER BY limit_real DESC, id ASC FOR UPDATE", [stockId, limitReal, userId]);
      const bids = dropWash(bidsAll, await washSet(userId, bidsAll, X));
      for (const b of bids) {
        if (!left) break; const n = Math.min(left, b.left_shares); const p = Number(b.limit_real);
        await fill(conn, st, b.user_id, userId, n, p);
        await credit(conn, b.user_id, (Number(b.limit_real) - p) * n, `Preisvorteil beim Kauf von „${st.name}“.`);
        await conn.query("UPDATE stock_orders SET left_shares = left_shares - ?, status = IF(left_shares - ? <= 0, 'filled', 'open') WHERE id = ?", [n, n, b.id]);
        left -= n; moved += n; sumReal += p * n;
      }
      if (left > 0) {
        const use = await makerUsage(conn, userId);
        const bid = Math.floor(Number(st.price_real) * (1 - makerSpreadPct(X, use.trades) / 100));
        const sellable = sellableToMaker(h.shares, await boughtRecently(conn, stockId, userId, X.makerMinHoldMinutes));
        const room = capShares(X, use.valueReal, Math.max(1, bid));
        const n = Math.min(left, await makerCapLeft(conn, st), sellable, room);
        if (sellable < left && sellable < h.shares) limits.push(`Frisch gekaufte Anteile kann der Marktteilnehmer erst nach ${X.makerMinHoldMinutes} Minuten zurücknehmen.`);
        if (room === 0) limits.push('Dein Tageslimit beim Marktteilnehmer der Börse ist ausgeschöpft.');
        if (n > 0 && bid >= limitReal && bid >= 1) { await fill(conn, st, MAKER, userId, n, bid); left -= n; moved += n; sumReal += bid * n; }
      }
      if (moved) { const got = Math.round(sumReal * idx); s.money += got; s.stats.earned = (s.stats.earned || 0) + got; notice(s, { level: 'good', title: `Aktien verkauft: ${st.name}`, text: `${moved} Anteile für durchschnittlich ${Math.round(sumReal / moved / 100)} (Wert 1945).`, tab: 'social' }); }
      await conn.query('UPDATE stock_orders SET left_shares = ?, status = ? WHERE id = ?', [left, left > 0 ? 'open' : 'filled', ord]);
    }
    await syncOutside(conn, st, ctx);
    return { moved, left, limits };
  });
}

/** Offene Order zurücknehmen: reservierte Mittel/Anteile kommen zurück. */
async function cancel(userId, orderId) {
  const world = await worldP();
  return service.withCharacter(userId, async (ctx) => {
    const { conn, state: s } = ctx;
    const o = await conn.one("SELECT * FROM stock_orders WHERE id = ? AND user_id = ? AND status = 'open' FOR UPDATE", [orderId, userId]); if (!o) fail('Diese Order gibt es nicht mehr.');
    await conn.query("UPDATE stock_orders SET status = 'cancelled' WHERE id = ?", [o.id]);
    if (o.side === 'buy') { if (s && s.status === 'alive') s.money += Math.round(Number(o.limit_real) * o.left_shares * idxOf(world, s)); else await credit(conn, userId, Number(o.limit_real) * o.left_shares, 'Rückgabe reservierter Mittel.'); }
    else await addHolding(conn, o.stock_id, userId, o.left_shares, 0);
    return {};
  });
}

/** Anteile außerhalb des Eigentümers im Betrieb vermerken (für Anzeige). */
async function syncOutside(conn, st, ctx) {
  const mine = ctx && ctx.state && ctx.user && ctx.user.id === st.user_id ? ctx : null;
  if (!mine) return;
  const own = await holding(conn, st.id, st.user_id);
  const c = (mine.state.companies || []).find((x) => x.id === st.company_id); if (c && c.stock) c.stock.outside = st.shares - own.shares;
}

/** Börsengang: Eigentümer legt Streubesitz-Anteil zum fairen Kurs ins Orderbuch. */
async function ipo(userId, companyId, floatPct, divPct) {
  const X = cfg(); if (!X.enabled) fail('Die Börse ist geschlossen.');
  floatPct = int(floatPct); divPct = int(divPct, 30);
  if (floatPct < X.minFloatPct || floatPct > X.maxFloatPct) fail(`Der Streubesitz muss zwischen ${X.minFloatPct} und ${X.maxFloatPct} Prozent liegen.`);
  if (divPct < 0 || divPct > 80) fail('Die Ausschüttung liegt zwischen 0 und 80 Prozent.');
  const world = await worldP();
  return service.withCharacter(userId, async (ctx) => {
    const { conn, state: s } = ctx; if (!s || s.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
    if (s.day < X.minGameDays) fail(`Dein Charakter muss mindestens ${X.minGameDays} Spieltage alt sein.`);
    const c = (s.companies || []).find((x) => x.id === companyId); if (!c) fail('Diesen Betrieb besitzt du nicht.');
    if (c.abandoned) fail('Ein leerstehender Betrieb kann nicht an die Börse.'); if (c.stock) fail('Dieser Betrieb ist schon börsennotiert.');
    const valueReal = market.valueReal(world, s, 'firm', c); if (valueReal < X.minValueReal) fail(`Für den Börsengang muss der Betrieb mindestens ${Math.round(X.minValueReal / 100)} (Wert 1945) wert sein.`);
    const idx = idxOf(world, s); const price = fairPerShare(valueReal, (c.lastProfit || 0) / idx, X.shares);
    const st = (await conn.query('INSERT INTO stocks (user_id, company_id, name, city_id, pkey, shares, price_real, fair_real, div_pct) VALUES (?,?,?,?,?,?,?,?,?)', [userId, c.id, c.name, c.cityId, c.pkey, X.shares, price, price, divPct])).insertId;
    const floatN = Math.round(X.shares * floatPct / 100);
    await conn.query('INSERT INTO stock_holdings (stock_id, user_id, shares, avg_real) VALUES (?,?,?,?)', [st, userId, X.shares - floatN, price]);
    await conn.query("INSERT INTO stock_orders (stock_id, user_id, side, shares, left_shares, limit_real) VALUES (?,?,'sell',?,?,?)", [st, userId, floatN, floatN, price]);
    c.stock = { id: st, divPct, outside: floatN };
    chronicle(s, `${c.name} geht an die Börse.`, 'business');
    try { await conn.query('INSERT INTO public_news (city_id, user_id, section, title, text) VALUES (?,?,?,?,?)', [c.cityId, userId, 'Wirtschaft', `${c.name} geht an die Börse`, `${floatN} von ${X.shares} Anteilen kommen zum Kurs von ${Math.round(price / 100)} (Wert 1945) in den Handel.`]); } catch (_) { /* Zugabe */ }
    notice(s, { level: 'good', title: `Börsengang: ${c.name}`, text: `${floatN} Anteile stehen zum Verkauf. Du erhältst den Erlös bei jedem Verkauf.`, tab: 'business' });
    return { stockId: st };
  });
}

/** Rückzug von der Börse – nur, wenn der Eigentümer wieder alle Anteile hält. */
async function delist(userId, companyId) {
  return service.withCharacter(userId, async (ctx) => {
    const { conn, state: s } = ctx; const c = (s.companies || []).find((x) => x.id === companyId); if (!c || !c.stock) fail('Dieser Betrieb ist nicht börsennotiert.');
    const st = await conn.one('SELECT * FROM stocks WHERE id = ? FOR UPDATE', [c.stock.id]);
    const own = await holding(conn, st.id, userId);
    if (own.shares < st.shares) fail('Du musst zuerst alle Anteile zurückkaufen (auch die der Börse).');
    await conn.query("UPDATE stock_orders SET status = 'cancelled' WHERE stock_id = ? AND status = 'open'", [st.id]);
    await conn.query("UPDATE stocks SET status = 'delisted' WHERE id = ?", [st.id]); await conn.query('DELETE FROM stock_holdings WHERE stock_id = ?', [st.id]);
    delete c.stock; return {};
  });
}

/** Mehrheitsaktionär übernimmt den Betrieb; der bisherige Eigentümer bleibt mit seinen Anteilen Minderheitsaktionär. */
async function takeover(userId, stockId) {
  const X = cfg(); const world = await worldP();
  return db.tx(async (conn) => {
    const st = await conn.one("SELECT * FROM stocks WHERE id = ? AND status = 'active' FOR UPDATE", [stockId]); if (!st) fail('Diese Aktie gibt es nicht (mehr).');
    if (st.user_id === userId) fail('Du bist schon Eigentümer.');
    const mine = await holding(conn, st.id, userId); if (mine.shares * 100 < st.shares * X.takeoverPct) fail(`Für die Übernahme brauchst du mindestens ${X.takeoverPct} Prozent der Anteile.`);
    const { rowA, sA, rowB, sB } = await require('./social').lockPair(conn, st.user_id, userId);
    if (sA.status !== 'alive' || sB.status !== 'alive') fail('Beide Seiten brauchen einen lebenden Charakter.');
    market.detach.allowListed = true; let snap; try { snap = market.detach(world, sA, 'firm', st.company_id); } finally { market.detach.allowListed = false; }
     const stock = snap.stock; delete snap.stock;
    const placed = market.attach(world, sB, 'firm', snap); placed.stock = stock;
    await conn.query('UPDATE stocks SET user_id = ?, company_id = ? WHERE id = ?', [userId, placed.id, st.id]);
    await conn.query("UPDATE stock_orders SET status = 'cancelled' WHERE stock_id = ? AND user_id = ? AND status = 'open'", [st.id, userId]);
    await conn.query('DELETE FROM player_firms WHERE user_id = ? AND company_id = ?', [st.user_id, st.company_id]);
    const nameA = `${sA.person.first} ${sA.person.last}`; const nameB = `${sB.person.first} ${sB.person.last}`;
    notice(sA, { level: 'bad', title: `Übernahme: ${st.name}`, text: `${nameB} hält die Mehrheit und übernimmt ${st.name}. Du bleibst als Aktionär beteiligt.`, tab: 'business', interrupt: true });
    notice(sB, { level: 'good', title: `Übernahme: ${st.name}`, text: `Du führst ${st.name} jetzt als Mehrheitsaktionär.`, tab: 'business', interrupt: true });
    chronicle(sB, `${sB.person.first} übernimmt ${st.name} über die Börse.`, 'business');
    await service.saveCharacter(conn, rowA, sA); await service.saveCharacter(conn, rowB, sB);
    const social = require('./social');
    await social.upsertStats(conn, await service.loadUser(conn, st.user_id), rowA, sA, world); await social.upsertStats(conn, await service.loadUser(conn, userId), rowB, sB, world);
    try { await conn.query('INSERT INTO public_news (city_id, user_id, section, title, text) VALUES (?,?,?,?,?)', [st.city_id, userId, 'Wirtschaft', `Übernahme: ${st.name}`, `${nameB} übernimmt als Mehrheitsaktionär ${st.name} von ${nameA}.`]); } catch (_) { /* Zugabe */ }
    return { stockId: st.id };
  });
}

/** Nach dem Speichern: im Spiel angefallene Dividenden an alle Anteilseigner verteilen. */
async function flushDividends(conn, state) {
  const list = state.pending && state.pending.div; if (!list || !list.length) return;
  state.pending.div = [];
  const sum = new Map(); for (const d of list) sum.set(d.stockId, (sum.get(d.stockId) || 0) + d.real);
  for (const [stockId, real] of sum) {
    const d = { stockId, real };
    const st = await conn.one("SELECT id, name, shares FROM stocks WHERE id = ? AND status = 'active'", [d.stockId]); if (!st) continue;
    const hs = await conn.query('SELECT user_id, shares FROM stock_holdings WHERE stock_id = ? AND shares > 0', [st.id]);
    for (const h of hs) if (h.user_id !== MAKER) await credit(conn, h.user_id, d.real * h.shares / st.shares, `Dividende „${st.name}“ (${h.shares} Anteile).`);
  }
}

/** Tägliche Dividende eines börsennotierten Betriebs (aus businessDaily): zieht sie aus der Firmenkasse, merkt sie zur Verteilung vor. */
function dividend(ctx, c, profit) {
  if (!c.stock || profit <= 0 || !c.stock.divPct) return;
  const cents = Math.min(c.cash, Math.round(profit * c.stock.divPct / 100)); if (cents <= 0) return;
  c.cash -= cents; const idx = idxOf(ctx.world, ctx.state);
  ctx.state.pending.div = ctx.state.pending.div || []; ctx.state.pending.div.push({ stockId: c.stock.id, real: cents / idx });
}

/** Stündlich: Substanz-/Ertragswert aus den veröffentlichten Betrieben, Kurs driftet zum fairen Wert. Stirbt der Betrieb, wird die Aktie ausgebucht. */
async function refresh() {
  const sts = await db.query("SELECT * FROM stocks WHERE status = 'active'");
  for (const st of sts) {
    const f = await db.one('SELECT value_real, profit_real, abandoned FROM player_firms WHERE user_id = ? AND company_id = ?', [st.user_id, st.company_id]);
    if (!f) { await db.query("UPDATE stocks SET status = 'delisted' WHERE id = ?", [st.id]); await db.query("UPDATE stock_orders SET status = 'cancelled' WHERE stock_id = ? AND status = 'open'", [st.id]); continue; }
    const fair = fairPerShare(Number(f.value_real), Number(f.profit_real), st.shares);
    const last = await db.one('SELECT COUNT(*) n FROM stock_trades WHERE stock_id = ? AND created_at > NOW() - INTERVAL 1 DAY', [st.id]);
    const drift = last.n ? 0.03 : 0.12; const price = Math.max(1, Math.round(Number(st.price_real) + (fair - Number(st.price_real)) * drift));
    await db.query('UPDATE stocks SET fair_real = ?, price_real = ? WHERE id = ?', [fair, price, st.id]);
  }
}

/** Beim Laden: Notierungsmarke und Streubesitz im Spielstand mit der Börse abgleichen (Ausbuchung durch Admin, Insolvenz). */
async function reconcile(conn, user, state) {
  for (const c of state.companies || []) {
    if (!c.stock) continue;
    const st = await conn.one("SELECT id, user_id, shares FROM stocks WHERE id = ? AND status = 'active'", [c.stock.id]);
    if (!st || st.user_id !== user.id) { delete c.stock; continue; }
    const own = await holding(conn, st.id, user.id); c.stock.outside = st.shares - own.shares;
  }
}

/** Übersicht für die Oberfläche. */
async function overview(userId) {
  const X = cfg();
  const rows = await db.query(`SELECT s.*, ps.name owner_name, (SELECT shares FROM stock_holdings WHERE stock_id = s.id AND user_id = ?) mine, (SELECT COALESCE(SUM(shares),0) FROM stock_trades WHERE stock_id = s.id AND created_at > NOW() - INTERVAL 1 DAY) vol, (SELECT price_real FROM stock_trades WHERE stock_id = s.id AND created_at < NOW() - INTERVAL 1 DAY ORDER BY id DESC LIMIT 1) prev FROM stocks s LEFT JOIN player_stats ps ON ps.user_id = s.user_id WHERE s.status = 'active' ORDER BY s.price_real * s.shares DESC LIMIT 60`, [userId]);
  const orders = await db.query("SELECT o.*, s.name FROM stock_orders o JOIN stocks s ON s.id = o.stock_id WHERE o.user_id = ? AND o.status = 'open' ORDER BY o.id DESC", [userId]);
  const hold = await db.query("SELECT h.*, s.name, s.price_real, s.status, s.user_id owner FROM stock_holdings h JOIN stocks s ON s.id = h.stock_id WHERE h.user_id = ? AND h.shares > 0 AND s.status = 'active'", [userId]);
  const own = rows.filter((r) => r.user_id === userId).map((r) => r.id);
  const bookOf = async (id) => ({ asks: await db.query("SELECT limit_real p, SUM(left_shares) n FROM stock_orders WHERE stock_id = ? AND status = 'open' AND side = 'sell' GROUP BY limit_real ORDER BY limit_real ASC LIMIT 5", [id]), bids: await db.query("SELECT limit_real p, SUM(left_shares) n FROM stock_orders WHERE stock_id = ? AND status = 'open' AND side = 'buy' GROUP BY limit_real ORDER BY limit_real DESC LIMIT 5", [id]) });
  const books = {}; for (const r of rows.slice(0, 20)) { const b = await bookOf(r.id); books[r.id] = { asks: b.asks.map((x) => ({ p: Number(x.p), n: Number(x.n) })), bids: b.bids.map((x) => ({ p: Number(x.p), n: Number(x.n) })) }; }
  void own;
  return {
    enabled: X.enabled, config: { shares: X.shares, minValueReal: X.minValueReal, minFloatPct: X.minFloatPct, maxFloatPct: X.maxFloatPct, maxOrderShares: X.maxOrderShares, takeoverPct: X.takeoverPct, spread: X.makerSpreadPct },
    stocks: rows.map((r) => ({ id: r.id, name: r.name, cityId: r.city_id, pkey: r.pkey, owner: r.owner_name || 'Spieler', ownerId: r.user_id, mine: r.user_id === userId, price: Number(r.price_real), fair: Number(r.fair_real), shares: r.shares, held: Number(r.mine || 0), vol: Number(r.vol || 0), change: r.prev ? Math.round((Number(r.price_real) / Number(r.prev) - 1) * 1000) / 10 : null, div: r.div_pct, book: books[r.id] || null })),
    orders: orders.map((o) => ({ id: o.id, stockId: o.stock_id, name: o.name, side: o.side, left: o.left_shares, price: Number(o.limit_real) })),
    holdings: hold.map((h) => ({ stockId: h.stock_id, name: h.name, shares: h.shares, avg: Number(h.avg_real), price: Number(h.price_real), owner: h.owner === userId })),
  };
}

async function history(stockId) {
  const rows = await db.query('SELECT price_real p, created_at t FROM stock_trades WHERE stock_id = ? ORDER BY id DESC LIMIT 60', [stockId]);
  return rows.reverse().map((r) => ({ p: Number(r.p), t: r.t }));
}

function start() {
  setInterval(() => { refresh().catch((e) => log.warn(`[exchange] ${e.message}`)); }, 3600000).unref();
}

module.exports = { fairPerShare, makerSpreadPct, capShares, sellableToMaker, dropWash, place, cancel, ipo, delist, takeover, flushDividends, dividend, reconcile, refresh, overview, history, start };
