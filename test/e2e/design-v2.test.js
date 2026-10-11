'use strict';
// Run with TP_PLAYWRIGHT_PATH if Playwright is installed outside this project.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./design-fixture');
const { chromium } = require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');

test('Design V2: reversible, persistent, complete navigation and responsive map', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.TP_CHROMIUM_PATH ? { executablePath: process.env.TP_CHROMIUM_PATH } : {}),
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; const writes = [];
    page.on('pageerror', (e) => errors.push(e.stack));
    page.on('request', (r) => { if (r.method() === 'POST') writes.push(r.url()); });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/play#/map`);
    await page.waitForSelector('#germany');
    await page.waitForSelector('#enterCity');
    const routes = await page.locator('#side [data-nav]').evaluateAll((els) => els.map((e) => e.dataset.nav).sort());
    assert.equal(routes.length, 14);
    const classicGrid = await page.locator('.shell').evaluate((el) => getComputedStyle(el).display);
    const change = async (value) => {
      await page.locator('[data-design-settings]').click();
      await page.locator(`input[name="game-design"][value="${value}"]`).check();
      await page.locator('[data-close="1"]').click();
    };
    await page.locator('#zin').click();
    const zoom = await page.locator('#germany').getAttribute('viewBox');
    await page.evaluate(() => { window.originalMap = document.querySelector('#germany'); });
    const before = writes.length;
    await change('v2');
    assert.equal(writes.length, before, 'layout switching must not post game actions');
    assert.equal(await page.evaluate(() => window.originalMap === document.querySelector('#germany')), true);
    assert.equal(await page.locator('#germany').getAttribute('viewBox'), zoom);
    assert.equal(await page.locator('#side .sim-group').count(), 5);
    assert.deepEqual(await page.locator('#side [data-nav]').evaluateAll((els) => els.map((e) => e.dataset.nav).sort()), routes);
    for (const size of [{ width: 1440, height: 900 }, { width: 832, height: 384 }, { width: 412, height: 915 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(250); // finish the existing HUD resize transition
      assert.ok(await page.locator('.hud-id').evaluate((e) => e.getBoundingClientRect().width >= 100), 'player identity remains readable');
      assert.ok(await page.locator('#side').evaluate((e) => e.getBoundingClientRect().right <= innerWidth), 'dock fits viewport');
      assert.ok(await page.locator('#hud').evaluate((e) => e.scrollWidth <= innerWidth + 1), 'HUD fits viewport');
      for (let i = 0; i < 5; i++) {
        const group = page.locator('#side .sim-group').nth(i);
        await group.locator('summary').click();
        assert.equal(await group.getAttribute('open'), '');
        for (const link of await group.locator('[data-nav]').all()) assert.equal(await link.isVisible(), true);
        const menu = await group.locator('.sim-menu').boundingBox();
        assert.ok(menu.y >= 0 && menu.x >= 0 && menu.x + menu.width <= size.width + 1, 'menu stays on screen');
        await page.keyboard.press('Escape');
        assert.equal(await group.getAttribute('open'), null);
      }
    }
    await page.setViewportSize({ width: 832, height: 384 });
    await page.locator('.sim-map-toggle').click();
    assert.equal(await page.locator('#mapPanel').isVisible(), false);
    await change('classic');
    assert.equal(await page.locator('#mapPanel').isVisible(), true, 'classic panel restored even when collapsed in V2');
    assert.equal(await page.locator('.shell').evaluate((e) => getComputedStyle(e).display), classicGrid);
    assert.equal(await page.locator('#side .sim-group').count(), 0);
    assert.equal(await page.evaluate(() => window.originalMap === document.querySelector('#germany')), true);
    await change('v2');
    await page.reload(); await page.waitForSelector('#germany');
    assert.equal(await page.locator('html').getAttribute('data-game-design'), 'v2');
    await page.locator('#side .sim-group').first().locator('summary').click();
    await page.locator('[data-nav="overview"]').click();
    await page.waitForSelector('#page[data-route="overview"]');
    assert.equal(await page.locator('.scene-card .scene').isVisible(), true, 'original scene still renders');
    await change('classic'); await page.reload(); await page.waitForSelector('#page[data-route="overview"]');
    assert.equal(await page.locator('html').getAttribute('data-game-design'), 'classic');
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
