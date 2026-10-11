'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, world, view } = require('./design-fixture');
const { chromium } = require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');

test('Simulator: production place density, every module, interactions and reversible responsive layout', { timeout: 120000 }, async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.TP_CHROMIUM_PATH ? { executablePath: process.env.TP_CHROMIUM_PATH } : {}),
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(8000);
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.method() === 'POST') writes.push({ url: r.url(), data: r.postDataJSON() }); });
    await page.goto(`http://127.0.0.1:${server.address().port}/play#/overview`);
    await page.waitForSelector('#page .scene-card');
    const routes = await page.locator('#side [data-nav]').evaluateAll(els => els.map(e => e.dataset.nav).sort());
    const originalGrid = await page.locator('#page > .grid').count();
    const change = async value => {
      await page.locator('[data-design-settings]').click();
      await page.locator(`input[name="game-design"][value="${value}"]`).check();
      await page.locator('.modal [data-close="1"]').click();
    };
    const before = writes.length;
    await change('v2');
    assert.equal(writes.length, before, 'switching design never sends a game action');
    await page.waitForSelector('#sim-world #germany');
    assert.equal(await page.locator('#side .sim-dock-link').count(), 5);
    await change('classic');
    assert.equal(await page.locator('#page > .grid').count(), originalGrid, 'Classic section containers restored');
    assert.equal(await page.locator('#sim-world, #sim-window, .sim-workspace').count(), 0);
    await change('v2');
    const groups = [
      ['overview', ['overview', 'housing', 'household', 'family', 'legacy']],
      ['map', ['city', 'newspaper', 'map']],
      ['work', ['business', 'work', 'trade']],
      ['society', ['society', 'social']],
      ['shop', ['shop']],
    ];
    const visited = [];
    for (const [group, ids] of groups) {
      await page.locator(`[data-sim-group="${group}"]`).click();
      for (const id of ids) {
        await page.locator(`#sim-tabs [data-nav="${id}"]`).click();
        if (id === 'map') { await page.waitForSelector('#sim-window', { state: 'hidden' }); }
        else {
          await page.waitForSelector(`#page[data-route="${id}"]`);
          assert.ok((await page.locator('#page').innerText()).trim().length > 40, `${id} has content`);
          assert.equal(await page.locator('#sim-world').evaluate(e => e.inert), true);
          const firstSection = page.locator('.sim-section-nav button:not([data-section="all"]):visible').first();
          if (await firstSection.count()) {
            await firstSection.click();
            assert.equal(await page.locator('.sim-workspace-content > .sim-section:visible').count(), 1);
            await page.locator('[data-section="all"]').click();
          }
        }
        visited.push(id);
      }
    }
    assert.deepEqual(visited.sort(), routes, 'all fourteen original routes are reachable through dock/tabs');
    // Typed input and the actual original element survive both layout changes.
    await page.locator('[data-sim-group="map"]').click();
    await page.locator('[data-nav="city"]').click();
    await page.locator('[data-city-tab="directory"]').click();
    await page.locator('#dirq').fill('Becker');
    await page.evaluate(() => { window.keptInput = document.getElementById('dirq'); });
    await change('classic');
    assert.equal(await page.locator('#dirq').inputValue(), 'Becker');
    await change('v2');
    assert.equal(await page.evaluate(() => window.keptInput === document.getElementById('dirq')), true);
    assert.equal(await page.locator('#dirq').inputValue(), 'Becker');
    // Existing form handlers survive moving their nodes into the simulator workspace.
    await page.locator('[data-sim-group="overview"]').click();
    await page.locator('[data-nav="household"]').click();
    await page.waitForSelector('[data-food="0"]');
    await page.locator('[data-food="0"]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some(e => e.textContent.includes('Einkauf abgeschlossen')));
    assert.ok(writes.some(r => r.url.endsWith('/api/action/buyFood') && r.data.tier === 0));
    await page.locator('[data-nav="family"]').click();
    await page.waitForSelector('#page[data-route="family"]');
    await page.locator('#sim-window [data-sim-close]').first().click();
    await page.waitForSelector('#sim-window', { state: 'hidden' });
    // Operational map: actual ledger counts, direct entity navigation and live route controls.
    await page.waitForSelector('[data-ops-tab="firms"]');
    await page.locator('[data-ops-tab="firms"]').click();
    await page.locator('[data-sim-open="business"][data-entity="firm:1"]').click();
    await page.waitForSelector('[data-sim-entity="firm:1"].sim-entity-focus');
    assert.equal(await page.locator('.sim-workspace-content > .sim-section:visible').count(), 1);
    assert.ok(await page.locator('[data-b="bizCollect"][data-id="1"]').isVisible(), 'original company controls remain accessible');
    // V2 section navigation must never overwrite hidden flags owned by game modules.
    await page.locator('[data-section="all"]').click();
    await page.evaluate(() => { const el = document.querySelector('.sim-section'); el.hidden = true; window.hiddenByGame = el; });
    await page.locator('.sim-section-nav button:not([data-section="all"])').last().click();
    await page.locator('[data-section="all"]').click();
    assert.equal(await page.evaluate(() => window.hiddenByGame.hidden), true);
    await page.evaluate(() => { window.hiddenByGame.hidden = false; });
    await page.locator('#sim-window [data-sim-close]').first().click();
    await page.waitForSelector('[data-ops-tab="routes"]');
    await page.locator('[data-ops-tab="routes"]').click();
    await page.locator('[data-ops-route="701"]').click();
    assert.equal(await page.locator('.sim-trip-progress progress').getAttribute('value'), '50');
    await page.waitForSelector('.sim-route-line.selected');
    await page.locator('[data-map-routes]').uncheck();
    await page.waitForSelector('.sim-route-line', { state: 'detached' });
    await page.locator('[data-map-routes]').check();
    await page.waitForSelector('.sim-route-line');
    await page.locator('[data-sim-open="trade"]').click();
    await page.waitForSelector('[data-sim-entity="route:701"].sim-entity-focus');
    await page.locator('[data-rt-active="701"]').click();
    await page.waitForSelector('[data-rt-active="701"][data-on="1"]');
    assert.ok(writes.some(r => r.url.endsWith('/api/transport/route/701/active') && r.data.on === false));
    await page.locator('#sim-window [data-sim-close]').first().click();
    await page.waitForSelector('.sim-route-line:not(.active)');
    await page.locator('[data-ops-back]').click();
    await page.locator('[data-ops-tab="sites"]').click();
    await page.locator(`[data-location="${view.properties[0].cityId}"]`).click();
    await page.locator('[data-sim-open="housing"]').first().click();
    await page.waitForSelector('.property.sim-entity-focus');
    assert.equal(await page.locator('.sim-workspace-content > .sim-section:visible').count(), 1);
    await change('classic');
    assert.equal(await page.locator('.sim-entity-focus, .sim-section-hidden').count(), 0);
    await change('v2');
    await page.locator('#sim-window [data-sim-close]').first().click();
    await page.locator('#zreset').click();
    assert.ok(world.cityRows.length > 8900);
    assert.ok(await page.locator('.sim-marker').count() < 150, 'overview is clustered at realistic density');
    const marker = page.locator('.sim-marker').filter({ has: page.locator('.sim-cluster-count') }).first();
    await marker.locator('.sim-pin').click();
    await page.waitForSelector('.sim-cluster-list');
    assert.ok(await page.locator('[data-cluster-city]').count() > 1);
    await page.keyboard.press('Escape');
    // Search still reaches small places even when their overview markers are grouped.
    await page.locator('#mapq').fill('Mulfingen');
    await page.locator('#mapres [data-pick]').first().click();
    await page.waitForSelector('#enterCity');
    await page.waitForFunction(() => document.querySelector('#mapPanel h3')?.textContent.includes('Mulfingen'));
    assert.match(await page.locator('#mapPanel').innerText(), /Mulfingen/);
    const zoom = await page.locator('#germany').getAttribute('viewBox');
    await page.locator('#zin').click();
    assert.notEqual(await page.locator('#germany').getAttribute('viewBox'), zoom);
    const svgBounds = await page.locator('#germany').boundingBox();
    const panBefore = await page.locator('#germany').getAttribute('viewBox');
    await page.mouse.move(svgBounds.x + svgBounds.width * .6, svgBounds.y + svgBounds.height * .6);
    await page.mouse.down();
    await page.mouse.move(svgBounds.x + svgBounds.width * .6 + 45, svgBounds.y + svgBounds.height * .6 + 25, { steps: 4 });
    await page.mouse.up();
    assert.notEqual(await page.locator('#germany').getAttribute('viewBox'), panBefore, 'map can be dragged');
    await page.locator('#zreset').click();
    await page.locator('[data-map-owned]').check();
    await page.waitForFunction(() => document.querySelectorAll('.sim-marker').length <= 6);
    await page.locator('[data-map-owned]').uncheck();
    await page.waitForFunction(() => document.querySelectorAll('.sim-marker').length > 6);
    for (const size of [{width:1440,height:900},{width:832,height:384},{width:412,height:915},{width:320,height:640}]) {
      await page.setViewportSize(size); await page.waitForTimeout(100);
      assert.ok(await page.locator('#hud').evaluate(e => e.scrollWidth <= innerWidth + 1), 'HUD fits');
      assert.ok(await page.locator('#side').evaluate(e => e.getBoundingClientRect().right <= innerWidth + 1), 'dock fits');
      const labels = await page.locator('.sim-marker-label').evaluateAll(els => els.map(e => { const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}; }));
      for (let i=0;i<labels.length;i++) for(let j=i+1;j<labels.length;j++) {
        const a=labels[i],b=labels[j];
        assert.ok(!(a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y), 'city names do not overlap');
      }
      await page.locator('[data-sim-group="overview"]').click();
      await page.locator('[data-nav="household"]').click();
      await page.waitForSelector('#page[data-route="household"]');
      assert.ok(await page.locator('#page').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'management fits');
      const body = await page.locator('#page').boundingBox();
      assert.ok(body.height > 90 && body.width > 150);
      await page.locator('#sim-window [data-sim-close]').first().click();
    }
    await page.locator('[data-design-settings]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.modal-backdrop').count(), 0);
    await page.reload(); await page.waitForSelector('#germany');
    assert.equal(await page.locator('html').getAttribute('data-game-design'), 'v2');
    await change('classic');
    await page.waitForSelector('#page #germany');
    assert.equal(await page.locator('#side [data-nav]').count(), 14);
    assert.equal(await page.locator('.shell').evaluate(e => getComputedStyle(e).display), 'grid');
    await change('v2');
    await page.waitForSelector('#sim-world .pickup');
    view.status = 'gameover';
    const spark = await page.locator('.pickup circle').last().boundingBox();
    await page.mouse.click(spark.x + spark.width / 2, spark.y + spark.height / 2);
    await page.waitForSelector('#again');
    assert.equal(await page.locator('body').evaluate(e => e.classList.contains('sim-playing')), false, 'life transition releases fixed game viewport');
    await page.locator('#again').click();
    await page.waitForSelector('#fn');
    assert.ok(writes.some(r => r.url.endsWith('/api/action/collect')));
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    view.status = 'alive';
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
