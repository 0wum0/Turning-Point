'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./design-fixture');
const { chromium } = require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');

test('V2 city: camera, building selection, spacious interiors, actions, fallback and Classic', { timeout:180000 }, async () => {
 const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:[...(process.env.TP_TEST_WEBGL ? ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] : ['--disable-gpu']), '--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(10000);
  const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/city`);await page.waitForSelector('.bl-item');
  const change=async value=>{await page.locator('[data-design-settings]').click();await page.locator(`input[name="game-design"][value="${value}"]`).check();await page.locator('.modal [data-close="1"]').click();};
  await change('v2');await page.waitForSelector('.sim-city-nav');await page.locator('[data-city-view="2d"]').click();
  await page.locator('#citySearch').fill('Rathaus');assert.equal(await page.locator('[data-focus]:visible').count(),1);await page.locator('#citySearch').fill('');
  await page.locator('[data-focus]').filter({hasText:'Rathaus'}).click();await page.waitForTimeout(700);
  const selected=page.locator('.bld.sel .pinbg');await selected.click();assert.equal(await page.locator('.interior').count(),0,'single scene click selects before entering');
  await page.locator('#cityEnter').click();await page.waitForSelector('[data-object]',{timeout:30000});
  const has3D=!(await page.locator('.int-no-3d').count());
  for(const [width,height] of [[1440,900],[832,384],[412,915],[360,800]]) {
   await page.setViewportSize({width,height});await page.waitForTimeout(120);
   const geometry=await page.evaluate(()=>{const a=document.querySelector('.int-stage').getBoundingClientRect(),b=document.querySelector('.int-sidebar').getBoundingClientRect();return {overlap:a.left<b.right&&a.right>b.left+.5&&a.top<b.bottom&&a.bottom>b.top+.5,overflow:document.documentElement.scrollWidth>innerWidth,stage:a.width,button:document.querySelector('[data-object]').getBoundingClientRect().height};});
   assert.equal(geometry.overlap,false,'scene and actions never cover each other');assert.equal(geometry.overflow,false);assert.ok(geometry.stage>200);assert.ok(geometry.button>=44);
  }
  await page.locator('[data-room-tab="tasks"]').click();assert.ok(await page.locator('[data-run-task]:visible').count());
  await page.locator('[data-room-tab="objects"]').click();await page.locator('[data-object]').first().click();assert.ok(await page.locator('.int-panel .act:visible').count());
  await page.keyboard.press('Escape');assert.equal(await page.locator('.interior').count(),1,'Escape backs out of object actions first');
  await page.keyboard.press('Escape');await page.waitForSelector('.interior',{state:'detached'});assert.ok(page.url().endsWith('#/city'));assert.equal(await page.locator('#app').evaluate(el=>el.inert),false);
  await page.setViewportSize({width:1440,height:900});await page.waitForSelector('svg.aerial');
  const initial=await page.locator('svg.aerial').getAttribute('viewBox');await page.locator('#azin').click();await page.waitForTimeout(600);const zoomed=await page.locator('svg.aerial').getAttribute('viewBox');assert.ok(Number(zoomed.split(' ')[2])<Number(initial.split(' ')[2]));
  const scene=await page.locator('svg.aerial').boundingBox();await page.mouse.move(scene.x+scene.width/2,scene.y+scene.height/2);await page.mouse.down();await page.mouse.move(scene.x+scene.width/2+110,scene.y+scene.height/2+40,{steps:8});await page.mouse.up();await page.waitForTimeout(450);assert.notEqual(await page.locator('svg.aerial').getAttribute('viewBox'),zoomed);assert.equal(await page.locator('.interior').count(),0,'dragging never enters a building');
  const touch = await page.context().newCDPSession(page); const cx=scene.x+scene.width/2, cy=scene.y+scene.height/2;
  const beforePinch=Number((await page.locator('svg.aerial').getAttribute('viewBox')).split(' ')[2]);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-30,y:cy,id:1},{x:cx+30,y:cy,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-75,y:cy,id:1},{x:cx+75,y:cy,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(Number((await page.locator('svg.aerial').getAttribute('viewBox')).split(' ')[2])<beforePinch,'two-finger pinch zooms the city');
  // All original building actions remain reachable even if WebGL is unavailable.
  await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};});
  await page.reload();await page.waitForSelector('.sim-city-nav');await page.locator('[data-focus]').filter({hasText:'Markt'}).first().click();await page.locator('#cityEnter').click();await page.waitForSelector('.int-no-3d');
  await page.locator('[data-object]').first().click();await page.locator('.int-panel .act').filter({hasText:'auffüllen'}).first().click();await page.waitForFunction(()=>[...document.querySelectorAll('.toast')].some(e=>e.textContent.includes('Einkauf abgeschlossen')));assert.ok(writes.some(x=>x.endsWith('/api/action/buyFood')));
  await page.locator('[data-room-tab="tasks"]').click();await page.locator('[data-run-task]:enabled').first().click();await page.waitForFunction(()=>[...document.querySelectorAll('.toast')].some(e=>e.textContent.includes('Aufgabe abgeschlossen')),{},{timeout:12000});assert.ok(writes.some(x=>x.endsWith('/api/action/taskStart')));assert.ok(writes.some(x=>x.endsWith('/api/action/taskFinish')));
  await page.locator('#intBack').click();await page.waitForSelector('.sim-city-nav');await page.locator('[data-city-tab="directory"]').click();await page.locator('#dirq').fill('Becker');await change('classic');assert.equal(await page.locator('#dirq').inputValue(),'Becker');assert.equal(await page.locator('.sim-city-nav').count(),0);
  await page.route('**/vendor/three/three.min.js',async route=>{await new Promise(r=>setTimeout(r,1200));await route.continue();});
  await page.reload();await page.waitForSelector('[data-focus]');await page.locator('[data-focus]').first().click();await page.waitForSelector('#intBack');await page.locator('#intBack').click();await page.waitForTimeout(1500);assert.equal(await page.locator('.interior').count(),0,'closing while the 3D module loads leaves no overlay');
  assert.deepEqual(errors,[]);console.log(`Interior WebGL available in this browser: ${has3D}`);
 } finally {await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
