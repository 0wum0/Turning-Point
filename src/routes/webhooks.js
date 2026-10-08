'use strict';
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const settings = require('../settings');
const stripe = require('../lib/stripe');
const log = require('../lib/log');

const router = express.Router();

/** Schreibt ein Paket idempotent gut (Referenz = Stripe-Session). Geld landet beim nächsten Sync im Spielstand. */
async function fulfill(userId, pkg, ref, priceCents, provider = 'stripe') {
  await db.tx(async (c) => {
    const dup = await c.one('SELECT id FROM purchases WHERE provider_ref = ?', [ref]);
    if (dup) return;
    const u = await c.one('SELECT id, meta FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!u) return;
    const meta = u.meta ? JSON.parse(u.meta) : {};
    if (pkg.money) meta.pendingMoney = (meta.pendingMoney || 0) + pkg.money;
    await c.query('UPDATE users SET coins = coins + ?, efs_pool = efs_pool + ?, meta = ? WHERE id = ?', [pkg.coins || 0, pkg.efs || 0, JSON.stringify(meta), userId]);
    await c.query('INSERT INTO purchases (user_id, package_id, coins, efs, money, price_cents, provider, status, provider_ref) VALUES (?,?,?,?,?,?,?,?,?)', [userId, pkg.id, pkg.coins || 0, pkg.efs || 0, pkg.money || 0, priceCents || pkg.price_cents || 0, provider, 'completed', ref]);
  });
}

router.post('/stripe', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const secret = settings.get('payments.stripe_webhook_secret');
  if (!stripe.verifyWebhook(req.body, req.get('stripe-signature'), secret)) return res.status(400).send('invalid signature');
  let ev;
  try { ev = JSON.parse(req.body.toString('utf8')); } catch (_) { return res.status(400).send('bad json'); }
  try {
    const o = ev.data && ev.data.object;
    if (ev.type === 'checkout.session.completed' && o) {
      const uid = Number(o.metadata && o.metadata.user_id);
      if (o.mode === 'payment' && o.payment_status === 'paid') {
        const pkg = (settings.get('packages') || []).find((p) => p.id === (o.metadata && o.metadata.package_id));
        if (pkg && uid) await fulfill(uid, pkg, o.id, o.amount_total);
      } else if (o.mode === 'subscription' && uid) {
        await db.query('UPDATE users SET stripe_customer = ?, stripe_sub = ?, sub_until = ? WHERE id = ?', [o.customer || null, o.subscription || null, Date.now() + 35 * 86400000, uid]);
      }
    } else if (ev.type === 'invoice.paid' && o && o.subscription) {
      const end = (((o.lines || {}).data || [])[0] || {}).period;
      await db.query('UPDATE users SET sub_until = ? WHERE stripe_sub = ?', [((end && end.end) || Math.floor(Date.now() / 1000) + 30 * 86400) * 1000 + 2 * 86400000, o.subscription]);
    } else if (ev.type === 'customer.subscription.deleted' && o) {
      await db.query('UPDATE users SET sub_until = ? WHERE stripe_sub = ?', [Date.now(), o.id]);
    }
    res.json({ received: true });
  } catch (e) { log.error('stripe webhook', e); res.status(500).send('error'); }
});

/** Offerwall-Postback: GET ?uid=&coins=&txid=&sig=  (sig = HMAC-SHA256(secret, "uid|coins|txid")) */
router.get('/offerwall', async (req, res) => {
  const secret = settings.get('offerwall.secret');
  const { uid, coins, txid, sig } = req.query;
  // Nur einfache Texte (keine Listen/Objekte aus ?uid[]=… ), Zahlen als Ziffern, Signatur als Hex
  if (!secret || [uid, coins, txid, sig].some((x) => typeof x !== 'string' || !x || x.length > 200) || !/^\d{1,10}$/.test(uid) || !/^\d{1,6}$/.test(coins)) return res.status(400).send('bad request');
  const exp = crypto.createHmac('sha256', secret).update(`${uid}|${coins}|${txid}`).digest('hex');
  const a = Buffer.from(exp); const b = Buffer.from(sig.toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).send('bad signature');
  const n = Math.max(0, Math.min(1000, parseInt(coins, 10) || 0));
  try {
    await db.tx(async (c) => {
      const dup = await c.one('SELECT id FROM offer_events WHERE txid = ? FOR UPDATE', [String(txid).slice(0, 120)]);
      if (dup) return;
      const u = await c.one('SELECT id FROM users WHERE id = ?', [Number(uid)]);
      if (!u) return;
      await c.query('INSERT INTO offer_events (txid, user_id, coins) VALUES (?,?,?)', [String(txid).slice(0, 120), u.id, n]);
      await c.query('UPDATE users SET coins = coins + ? WHERE id = ?', [n, u.id]);
    });
    res.send('1');
  } catch (e) { if (e && e.code === 'ER_DUP_ENTRY') return res.send('1'); log.error('offerwall', e); res.status(500).send('error'); }
});

module.exports = router;
