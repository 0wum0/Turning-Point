'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {app}=require('./design-fixture');const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');
test('Shared 2D/3D city: real renderer, camera, building actions, return path and safe fallback',{timeout:150000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1200,height:850},reducedMotion:'reduce'});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/city`);await page.waitForSelector('.bl-item');
  const design=async value=>{await page.locator('[data-design-settings]').click();await page.locator(`input[name="game-design"][value="${value}"]`).check();await page.locator('.modal [data-close="1"]').click();};
  await design('v2');await page.locator('[data-focus]').first().click();
  await page.locator('[data-city-view="3d"]').click();await page.waitForSelector('#city3dHost canvas');await page.waitForSelector('#citySceneStatus',{state:'hidden'});
  assert.ok(await page.locator('.city3d-pin').count()>5);
  const canvas=page.locator('#city3dHost canvas');assert.ok((await canvas.boundingBox()).width>500);
  const before=await canvas.screenshot();await canvas.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);assert.notDeepEqual(await canvas.screenshot(),before,'camera rotation changes the actual rendered city');
  const other=page.locator('.city3d-pin:not([aria-pressed="true"]):visible').first(), key=await other.getAttribute('data-city-key'), name=await other.getAttribute('aria-label');await other.click();
  assert.equal(await page.locator('#citySelection h3').innerText(),name);assert.equal(await page.locator('.bld.sel').getAttribute('data-key'),key,'both projections select the same gameplay building');
  await page.locator('[data-city-view="2d"]').click();assert.equal(await page.locator('#city3dHost canvas').count(),0,'switching frees the 3D canvas');await page.waitForSelector('#aerialHost svg');
  await page.locator('[data-city-view="3d"]').click();await page.waitForSelector('#city3dHost canvas');await page.locator('#cityEnter').click();await page.waitForSelector('[data-object]');
  assert.ok((await page.locator('.int-title').innerText()).includes(name));await page.locator('[data-object]').first().click();assert.ok(await page.locator('.int-scene-selection:visible').count());assert.ok(await page.locator('.int-panel .act').count());
  await page.locator('#intBack').click();await page.waitForSelector('#city3dHost canvas');assert.equal(await page.locator('#citySelection h3').innerText(),name,'returning preserves the selected location');
  await page.setViewportSize({width:412,height:915});await page.locator('[data-city-view="3d"]').scrollIntoViewIfNeeded();assert.ok((await canvas.boundingBox()).height>=200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await design('classic');await page.waitForSelector('#city3dHost canvas',{state:'detached'});assert.equal(await page.locator('#aerialHost').isVisible(),true);
  await design('v2');await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
  await page.reload();await page.waitForSelector('[data-city-view="3d"]');await page.locator('[data-city-view="3d"]').click();await page.waitForFunction(()=>document.querySelector('#citySceneStatus')?.textContent.includes('nicht verfügbar'));
  assert.equal(await page.locator('#aerialHost').isVisible(),true);assert.equal(await page.locator('#city3dHost canvas').count(),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
