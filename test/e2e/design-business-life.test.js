'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,view}=require('./design-fixture');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');
test('V2 workshop: actual server state, moving workers, outage stops work, precise management link and readable mobile layout',{timeout:120000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.addInitScript(()=>localStorage.setItem('tp-game-design','v2'));
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/city`);await page.waitForSelector('#city3dHost canvas');
  await page.locator('[data-focus="biz:1"]').click();assert.ok(await page.locator('.city-business-status').isVisible());
  await page.locator('#cityEnter').click();await page.waitForSelector('.interior [data-object]');
  const stats=()=>page.evaluate(()=>document.querySelector('.interior').__room.businessStats());
  const a=await stats();assert.equal(a.workers,view.companies[0].staff);assert.equal(a.state.active,true);
  await page.waitForFunction(poses=>JSON.stringify(document.querySelector('.interior').__room.businessStats().poses)!==poses,JSON.stringify(a.poses));
  const brief=await page.locator('.int-business').innerText();for(const word of ['Zutaten','Auslastung','Gewinn / Tag'])assert.ok(brief.includes(word));
  await page.locator('.business-ledger summary').click();assert.ok((await page.locator('.business-ledger').innerText()).includes('Mitarbeiter'));
  await page.screenshot({path:'/tmp/tp-workshop-desktop.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
  const still=(await stats()).poses;await page.waitForTimeout(150);assert.deepEqual((await stats()).poses,still,'reduced motion stops the working animation');
  // The next server snapshot reports an interruption. The existing action still uses the right firm id.
  const changed=structuredClone(view);changed.companies[0].outage=3;changed.companies[0].cash=0;
  changed.companies[0].flows.income=0;changed.companies[0].supply.outputs.forEach(x=>x.units=0);
  changed.companies[0].profitAll=-(changed.companies[0].flows.wages+changed.companies[0].flows.upkeep);
  let action;await page.route('**/api/action/bizCollect',async route=>{action=route.request().postDataJSON();await route.fulfill({json:{ok:true,view:changed}});});
  await page.locator('[data-bar]').filter({hasText:'Einnahmen'}).click();await page.locator('.int-panel .act').filter({hasText:'Einnahmen im Büro abholen'}).click();
  await page.waitForFunction(()=>document.querySelector('.interior').__room.businessStats().state.active===false);
  assert.deepEqual(action,{id:1});assert.ok((await stats()).poses.every(p=>p.every(x=>x===0)),'workers stop in neutral poses after the server update');
  await page.locator('#pClose').click();assert.equal(await page.locator('.int-business').getAttribute('data-business-state'),'stopped');
  assert.ok((await page.locator('.int-business').innerText()).includes('Produktionsausfall'));
  assert.equal(await page.locator('.business-ledger').getAttribute('open'),'','expanded details survive refresh');
  await page.setViewportSize({width:412,height:915});await page.screenshot({path:'/tmp/tp-workshop-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const size=await page.locator('.int-business p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));assert.ok(size>=14);
  await page.locator('[data-business-manage]').click();await page.waitForSelector('[data-sim-entity="firm:1"].sim-entity-focus');assert.equal(await page.locator('.interior').count(),0);
  assert.deepEqual(errors,[]);
 } finally {await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
