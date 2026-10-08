'use strict';
const crypto = require('crypto');

/** Minimaler Stripe-Client ohne SDK (nur fetch + HMAC). */
async function api(secret, path, params) {
  const body = new URLSearchParams();
  const add = (k, v) => {
    if (v == null) return;
    if (typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => add(`${k}[${kk}]`, vv));
    else body.append(k, String(v));
  };
  Object.entries(params).forEach(([k, v]) => add(k, v));
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json();
  if (!res.ok) throw new Error((json.error && json.error.message) || `Stripe-Fehler ${res.status}`);
  return json;
}

function createCheckout(secret, { name, amountCents, currency = 'eur', successUrl, cancelUrl, metadata, email, subscriptionPriceId }) {
  const p = { success_url: successUrl, cancel_url: cancelUrl, metadata, client_reference_id: metadata.user_id, customer_email: email };
  if (subscriptionPriceId) {
    p.mode = 'subscription';
    p['line_items[0][price]'] = subscriptionPriceId; p['line_items[0][quantity]'] = 1;
    p.subscription_data = { metadata };
  } else {
    p.mode = 'payment';
    p['line_items[0][price_data][currency]'] = currency; p['line_items[0][price_data][unit_amount]'] = amountCents;
    p['line_items[0][price_data][product_data][name]'] = name; p['line_items[0][quantity]'] = 1;
  }
  return api(secret, 'checkout/sessions', p);
}

/**
 * Prüft den Stripe-Webhook (Header „Stripe-Signature“) gegen den ROHEN Body: HMAC-SHA256 über „t.body“, zeitkonstanter Vergleich,
 * Zeitstempel höchstens `toleranceSec` alt/neu (Replay-Schutz; Doppelbuchungen verhindert zusätzlich die Eindeutigkeit der Zahlungsreferenz).
 * Mehrere v1-Signaturen (Schlüsselwechsel bei Stripe) sind erlaubt – eine passende genügt.
 */
function verifyWebhook(raw, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret || !(Buffer.isBuffer(raw) || typeof raw === 'string')) return false;
  const items = String(header).split(',').map((kv) => kv.trim().split('=')).filter((a) => a.length === 2);
  const t = Number((items.find((a) => a[0] === 't') || [])[1]);
  const sigs = items.filter((a) => a[0] === 'v1').map((a) => a[1]);
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex'));
  return sigs.some((g) => { const b = Buffer.from(String(g)); return b.length === expected.length && crypto.timingSafeEqual(expected, b); });
}

module.exports = { createCheckout, verifyWebhook };
