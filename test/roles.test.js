'use strict';
const test = require('node:test');
const assert = require('node:assert');
const roles = require('../src/lib/roles');
const { compact, formatMoney } = require('../src/game/economy');

test('Rollen: Moderator darf moderieren, aber nicht an Einstellungen', () => {
  assert.ok(roles.can('moderator', 'GET', '/community'));
  assert.ok(roles.can('moderator', 'POST', '/users/5/ban'));
  assert.ok(!roles.can('moderator', 'POST', '/users/5/edit'));
  assert.ok(!roles.can('moderator', 'GET', '/settings/site'));
  assert.ok(!roles.can('moderator', 'GET', '/system'));
});
test('Rollen: Co-Admin fast alles, aber nicht System/Backup/Zahlungen/Rollen', () => {
  assert.ok(roles.can('coadmin', 'GET', '/settings/site'));
  assert.ok(roles.can('coadmin', 'POST', '/users/5/edit'));
  assert.ok(!roles.can('coadmin', 'GET', '/backup'));
  assert.ok(!roles.can('coadmin', 'GET', '/settings/payments'));
  assert.ok(!roles.can('coadmin', 'POST', '/users/5/role'));
  assert.ok(roles.can('admin', 'POST', '/users/5/role'));
  assert.ok(!roles.can('player', 'GET', '/'));
});
test('Zahlen werden verkürzt: 100 · 1k · 10k · 999k · 1m', () => {
  assert.strictEqual(compact(100), '100');
  assert.strictEqual(compact(1000), '1k');
  assert.strictEqual(compact(1234), '1,2k');
  assert.strictEqual(compact(10000), '10k');
  assert.strictEqual(compact(999000), '999k');
  assert.strictEqual(compact(999999), '1m');
  assert.strictEqual(compact(1000000), '1m');
  assert.strictEqual(compact(2500000000), '2,5b');
  assert.strictEqual(formatMoney(12345678, 'DM'), '123k DM');
  assert.strictEqual(formatMoney(5050, 'DM'), '50,50 DM');
});
