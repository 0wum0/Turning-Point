'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { verifyWebhook } = require('../src/lib/stripe');

const sign = (raw, secret, t) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

test('Stripe-Webhook: gültige Signatur wird akzeptiert', () => {
  const raw = Buffer.from('{"id":"evt_1"}'); const now = Date.now(); const t = Math.floor(now / 1000);
  assert.ok(verifyWebhook(raw, sign(raw, 'whsec_x', t), 'whsec_x', 300, now));
});
test('Stripe-Webhook: falsches Secret, manipulierter Body und alte Zeitstempel werden abgelehnt', () => {
  const raw = Buffer.from('{"id":"evt_1"}'); const now = Date.now(); const t = Math.floor(now / 1000);
  assert.ok(!verifyWebhook(raw, sign(raw, 'whsec_x', t), 'anderes', 300, now));
  assert.ok(!verifyWebhook(Buffer.from('{"id":"evt_2"}'), sign(raw, 'whsec_x', t), 'whsec_x', 300, now));
  assert.ok(!verifyWebhook(raw, sign(raw, 'whsec_x', t - 4000), 'whsec_x', 300, now));
  assert.ok(!verifyWebhook(raw, '', 'whsec_x', 300, now));
});
