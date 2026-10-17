'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,state}=require('./design-fixture');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH||'playwright');

test('local minimap and avatar: street movement, arrival, cancellation, camera, mobile and reduced motion',{timeout:180000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser,page;
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);const errors=[],mutations=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&!r.url().endsWith('/seen'))mutations.push(r.url());});
  await page.addInitScript(()=>{localStorage.setItem('tp-game-design','v2');document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.cityHour='12';document.documentElement.dataset.cityDoy='190';},{once:true});});
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/city`);
  await page.waitForFunction(()=>document.querySelector('#city3dHost')?.__city3d);
  const stats=()=>page.evaluate(()=>document.querySelector('#city3dHost').__city3d.stats());
  const start=await stats(),city=state.cityId;
  if(await page.locator('.city-minimap-toggle').getAttribute('aria-expanded')==='false')await page.locator('.city-minimap-toggle').click();
  const map=page.locator('.city-minimap svg');await map.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(500);
  assert.ok((await stats()).camera.x>start.camera.x,'keyboard minimap pans the camera');
  const footprint=await page.locator('.city-minimap-view').getAttribute('points');
  await page.locator('#city3dHost canvas').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(500);
  assert.notEqual(await page.locator('.city-minimap-view').getAttribute('points'),footprint,'footprint rotates with camera');
  await page.locator('.city-minimap-footer button').click();await page.waitForFunction(()=>{const s=document.querySelector('#city3dHost').__city3d.stats();return Math.abs(s.camera.x-(s.player.x-1000)*.1)<1;});
  assert.ok(Math.abs((await stats()).camera.x-(start.player.x-1000)*.1)<1,'locate player');
  await page.locator('[data-focus="rathaus"]').click();await page.locator('#cityEnter').click();
  await page.waitForSelector('.city-walk-status:not([hidden])');const walking=await stats();assert.equal(walking.player.destination,'rathaus');assert.ok(walking.player.path.length>=2);
  assert.equal(await page.locator('.interior').count(),0,'interior waits for arrival');
  await page.waitForTimeout(450);const moved=await stats();assert.notDeepEqual([moved.player.x,moved.player.y],[walking.player.x,walking.player.y]);
  assert.equal(await page.locator('#city3dHost.city-entering').count(),0,'walking remains visible before the entrance fade');
  await page.screenshot({path:'/tmp/tp-city-navigation-desktop.png'});
  await page.locator('.city-walk-status button').filter({hasText:'Abbrechen'}).click();await page.waitForTimeout(200);
  assert.equal((await stats()).player.walking,false);assert.equal(await page.locator('.interior').count(),0);
  await page.locator('#cityEnter').click();await page.waitForSelector('.city-walk-status:not([hidden])');
  await page.locator('.city-walk-status button').filter({hasText:'Direkt hinein'}).click();await page.waitForSelector('.interior[data-active-room]');
  assert.match(await page.locator('.int-title').innerText(),/Rathaus/);await page.locator('#intBack').click();
  await page.waitForFunction(()=>document.querySelector('#city3dHost')?.__city3d);
  const arrived=(await stats()).player;assert.notDeepEqual([arrived.x,arrived.y],[start.player.x,start.player.y]);
  // Disposing a scene during a walk must settle the pending entrance and never open a stale interior.
  await page.locator('[data-focus="markt"]').click();await page.locator('#cityEnter').click();await page.waitForSelector('.city-walk-status:not([hidden])');
  await page.locator('[data-city-view="2d"]').click();await page.waitForTimeout(500);assert.equal(await page.locator('.interior').count(),0);assert.equal(await page.locator('.city-minimap').count(),0);
  await page.setViewportSize({width:412,height:915});await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('[data-city-view="3d"]').click();await page.waitForFunction(()=>document.querySelector('#city3dHost')?.__city3d);
  assert.equal(await page.locator('.city-minimap-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('.city-minimap-toggle').click();await page.locator('[data-focus="markt"]').click();
  await page.locator('#city3dHost').scrollIntoViewIfNeeded();
  const bounds=await page.locator('#city3dHost').boundingBox(),mini=await page.locator('.city-minimap').boundingBox(),card=await page.locator('.city3d-card').boundingBox();
  assert.ok(mini.x>=bounds.x&&mini.x+mini.width<=bounds.x+bounds.width+1);assert.ok(mini.y>=bounds.y,'expanded minimap stays inside the city');assert.ok(mini.y+mini.height<=card.y+1,'minimap and action card do not overlap');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/tp-city-navigation-mobile.png'});
  await page.locator('#cityEnter').click();await page.waitForSelector('.interior[data-active-room]');assert.match(await page.locator('.int-title').innerText(),/Markt/);
  assert.equal(state.cityId,city,'looking around does not change residence');assert.deepEqual(mutations,[],'visual walking never changes money, time or residence');assert.deepEqual(errors,[]);
 }catch(e){await page?.screenshot({path:'/tmp/tp-city-navigation-failure.png'}).catch(()=>{});throw e;}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
