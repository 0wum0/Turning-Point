'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./design-fixture');
const { chromium } = require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');

const contrast = (a, b) => {
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};

test('V2: legible light/dark forms and stable pins during mouse and touch panning', { timeout: 120000 }, async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.TP_CHROMIUM_PATH ? { executablePath: process.env.TP_CHROMIUM_PATH } : {}), args: ['--disable-gpu', '--disable-dev-shm-usage'] });
    const p = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true });
    p.setDefaultTimeout(10000);
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => { localStorage.setItem('tp-game-design', 'v2'); localStorage.setItem('tp-theme', 'light'); });
    await p.route('**/api/social/me', r => r.fulfill({ json: { ok: true, bio: 'Ich bin der Entwickler des Spiels', public: true, profile: { stats: null } } }));
    await p.goto(`http://127.0.0.1:${server.address().port}/play#/social`);
    await p.locator('[data-tab="me"]').click();
    await p.waitForSelector('#bio');
    await p.locator('#bio').fill('Ein gut lesbares Profil – auch im hellen Grundtheme.');
    for (const theme of ['light', 'dark']) {
      await p.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const colors = await p.locator('#bio').evaluate(el => { const c = getComputedStyle(el); return { text: c.color, background: c.backgroundColor, size: parseFloat(c.fontSize) }; });
      assert.ok(contrast(colors.text, colors.background) >= 7, `${theme}: profile contrast`);
      assert.ok(colors.size >= 14);
      // The same form rules must cover dialogs, selects, placeholders and disabled fields.
      await p.evaluate(async () => {
        const { modal, html } = await import('/js/game/ui.js');
        window.formProbe = modal(html`<h3>Formularprüfung</h3><input id="form-text" type="text" placeholder="Deine Nachricht"><input id="form-number" type="number" value="123"><select id="form-select"><option>Güterbahn</option></select><textarea id="form-disabled" disabled>Wird gespeichert</textarea>`);
      });
      const fields = await p.locator('.modal :is(input, select, textarea)').evaluateAll(els => els.map(el => ({ id: el.id, text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor, placeholder: getComputedStyle(el, '::placeholder').color })));
      for (const field of fields) assert.ok(contrast(field.text, field.background) >= 4.5, `${theme}: ${field.id}`);
      const field = fields.find(f => f.id === 'form-text');
      assert.ok(contrast(field.placeholder, field.background) >= 4.5);
      await p.locator('#form-text').fill('Lesbarer Dialog');
      await p.locator('#form-select').selectOption({ label: 'Güterbahn' });
      await p.evaluate(() => window.formProbe.close());
    }
    await p.evaluate(() => document.documentElement.dataset.theme = 'light');
    await p.screenshot({ path: '/tmp/tp-v2-profile-fixed.png' });
    const change = async value => {
      await p.locator('[data-design-settings]').click();
      await p.locator(`input[name="game-design"][value="${value}"]`).check();
      await p.locator('.modal [data-close="1"]').click();
    };
    await change('classic');
    const classic = await p.locator('#bio').evaluate(el => ({ text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
    assert.ok(contrast(classic.text, classic.background) >= 4.5, 'Classic light colors restored');
    await change('v2');
    assert.equal(await p.locator('#bio').inputValue(), 'Ein gut lesbares Profil – auch im hellen Grundtheme.');
    await p.locator('#sim-window [data-sim-close]').first().click();
    await p.waitForSelector('#sim-window', { state: 'hidden' });
    const touch = await p.context().newCDPSession(p);
    for (const size of [{ width: 412, height: 915 }, { width: 832, height: 384 }]) {
      await p.setViewportSize(size);
      await p.locator('#zreset').click();
      for (let zoom = 0; zoom < 3; zoom++) {
        await p.locator('#zin').click();
        await p.waitForTimeout(100);
        const bounds = await p.locator('#germany').boundingBox();
        const x = bounds.x + bounds.width * .4, y = bounds.y + bounds.height * .6;
        for (const mode of ['mouse', 'touch']) {
          await p.evaluate(() => {
            window.keptMarkers = new Map([...document.querySelectorAll('.sim-marker')].map(el => [el.dataset.cityId, { el, pin: el.querySelector('.sim-pin'), count: el.getAttribute('aria-label') }]));
            window.keptRoute = document.querySelector('[data-freight]');
            window.mapBefore = document.querySelector('#germany').getAttribute('viewBox');
          });
          if (mode === 'mouse') { await p.mouse.move(x, y); await p.mouse.down(); }
          else await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
          for (let step = 1; step <= 8; step++) {
            const px = x - step * 5, py = y - step * 3;
            if (mode === 'mouse') await p.mouse.move(px, py);
            else await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py, id: 1 }] });
            await p.evaluate(() => new Promise(requestAnimationFrame));
            const result = await p.evaluate(() => {
              const common = [...document.querySelectorAll('.sim-marker')].filter(el => window.keptMarkers.has(el.dataset.cityId));
              return { count: common.length, stable: common.every(el => { const old = window.keptMarkers.get(el.dataset.cityId); return el === old.el && el.querySelector('.sim-pin') === old.pin && el.getAttribute('aria-label') === old.count; }), route: window.keptRoute === document.querySelector('[data-freight]') };
            });
            assert.ok(result.count > 5);
            assert.ok(result.stable, `${mode} zoom ${zoom}: marker nodes, pins and counts survive every frame`);
            assert.ok(result.route, 'freight animation is not restarted by panning');
          }
          if (mode === 'mouse') await p.mouse.up();
          else await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          assert.ok(await p.evaluate(() => window.mapBefore !== document.querySelector('#germany').getAttribute('viewBox')), 'gesture actually pans');
        }
      }
    }
    // Retained markers still resolve the current cluster and all its selectable places.
    const pin = p.locator('.sim-marker:has(.sim-cluster-count)').first();
    const label = await pin.getAttribute('aria-label');
    await pin.focus(); await p.keyboard.press('Enter');
    await p.waitForSelector('.sim-cluster-list');
    assert.equal(await p.locator('[data-cluster-city]').count(), Number(label.split(' ')[0]));
    await p.locator('[data-cluster-city]').first().click();
    await p.waitForSelector('#city3dHost canvas');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(r => server.close(r));
  }
});
