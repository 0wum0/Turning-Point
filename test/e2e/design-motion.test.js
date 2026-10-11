'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, view, world, transport } = require('./design-fixture');
const { chromium } = require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');

test('V2: staged splash, failure/retry, anchored map labels and game-clock freight motion', { timeout: 120000 }, async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.TP_CHROMIUM_PATH ? { executablePath: process.env.TP_CHROMIUM_PATH } : {}), args: ['--disable-gpu', '--disable-dev-shm-usage'] });
    const p = await browser.newPage({ viewport: { width: 412, height: 915 } });
    p.setDefaultTimeout(10000);
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => localStorage.setItem('tp-game-design', 'v2'));
    let releaseWorld, releaseState;
    const worldGate = new Promise(r => { releaseWorld = r; }), stateGate = new Promise(r => { releaseState = r; });
    await p.route('**/api/world', async route => { await worldGate; await route.continue(); });
    await p.route('**/api/state', async route => { await stateGate; await route.continue(); });
    await p.goto(`http://127.0.0.1:${server.address().port}/play#/map`);
    await p.waitForSelector('#sim-splash progress');
    assert.equal(await p.locator('#sim-splash progress').getAttribute('value'), '0');
    assert.equal(await p.locator('#app').evaluate(el => el.inert), true);
    assert.ok(await p.locator('#sim-splash').evaluate(el => el.scrollWidth <= innerWidth));
    releaseWorld();
    await p.waitForSelector('[data-phase="world"].done');
    assert.equal(await p.locator('#sim-splash progress').evaluate(el => el.value), 1);
    releaseState();
    await p.waitForSelector('#sim-splash', { state: 'detached' });
    await p.waitForSelector('#germany');
    assert.equal(await p.locator('#app').evaluate(el => el.inert), false);
    assert.equal(await p.locator('.sim-map-toolbar').getAttribute('open'), null, 'mobile filters start compact');
    await p.unroute('**/api/world'); await p.unroute('**/api/state');
    const before = await p.locator('[data-freight]').getAttribute('transform');
    await p.waitForFunction(value => document.querySelector('[data-freight]')?.getAttribute('transform') !== value, before);
    await p.evaluate(() => document.documentElement.dataset.motion = 'off');
    const stopped = await p.locator('[data-freight]').getAttribute('transform');
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-freight]').getAttribute('transform'), stopped);
    assert.equal(await p.locator('.sim-route-flow').evaluate(el => getComputedStyle(el).animationName), 'none');
    await p.evaluate(() => delete document.documentElement.dataset.motion);
    await p.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await p.locator('[data-freight]').getAttribute('transform');
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-freight]').getAttribute('transform'), reduced);
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    for (const size of [{ width: 1440, height: 900 }, { width: 832, height: 384 }, { width: 412, height: 915 }, { width: 320, height: 640 }]) {
      await p.setViewportSize(size);
      await p.locator('#zreset').click();
      for (let zoom = 0; zoom < 3; zoom++) {
        await p.locator('#zin').click();
        await p.waitForTimeout(100);
        const markers = await p.locator('[data-city-id]').evaluateAll(els => els.map(el => {
          const t = el.transform.baseVal.getItem(0).matrix;
          return { id: Number(el.dataset.cityId), x: t.e, y: t.f, labelId: el.querySelector('[data-label-city]')?.dataset.labelCity, name: el.querySelector('.sim-marker-label')?.textContent, leader: el.querySelector('.sim-label-leader')?.getAttribute('d') };
        }));
        assert.ok(markers.length > 0);
        for (const marker of markers) {
          const c = world.cityRows.find(row => row[0] === marker.id);
          assert.ok(Math.abs(marker.x - (c[4] - 5.6) * Math.cos(51 * Math.PI / 180) * 62) < .001);
          assert.ok(Math.abs(marker.y - (55.3 - c[3]) * 62) < .001);
          if (marker.labelId) {
            assert.equal(Number(marker.labelId), marker.id);
            assert.equal(marker.name, c[1].length > 23 ? c[1].slice(0, 21) + '…' : c[1]);
            assert.ok(Math.abs(Math.abs(Number(marker.leader.slice(5))) - 24) < .001, 'leader starts at the actual city point');
          }
        }
      }
    }
    // A parked route must not acquire a decorative vehicle or flowing track.
    transport.view.routes[0].trip = null; transport.view.routes[0].status = 'idle';
    await p.reload(); await p.waitForSelector('#germany');
    assert.equal(await p.locator('[data-freight], .sim-route-flow').count(), 0);
    // Failed boot releases the app and retries the real requests.
    let fail = true;
    await p.route('**/api/state', route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Vorübergehend offline' }) }) : route.continue());
    await p.reload(); await p.waitForSelector('[data-boot-retry]');
    assert.equal(await p.locator('#sim-splash').count(), 0);
    assert.equal(await p.locator('#app').evaluate(el => el.inert), false);
    fail = false;
    await p.locator('[data-boot-retry]').click(); await p.waitForSelector('#germany');
    await p.waitForSelector('#sim-splash', { state: 'detached' });
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(r => server.close(r));
  }
});
