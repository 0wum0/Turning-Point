'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,view,state,user,gameWorld}=require('./design-fixture');
const {present}=require('../../src/game/present');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH||'playwright');
test('V1.4 office: shared working HUD, genuine certificate, manual EFS and per-business bank purchase',{timeout:120000},async()=>{
 state.day=45*365+1;state.skills.learned.push('baecker');state.skills.days.baecker=3650;
 const onboarding=view.onboarding;Object.assign(view,present(gameWorld,state,user));view.onboarding=onboarding;
 const residence=state.cityId,initialMoney=state.money,initialCash=state.companies[0].cash,initialEfs=user.efs_pool;
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.addInitScript(()=>localStorage.setItem('tp-game-design','v2'));
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/business`);
  await page.locator('[data-office="1"]').click();await page.waitForSelector('.interior [data-object]').catch(async e=>{console.error('Office diagnostics',errors,await page.locator('body').innerText());await page.screenshot({path:'/tmp/tp-office-failure.png'});throw e;});
  await page.waitForSelector('.int-object b:has-text("Meisterbrief")');
  assert.equal(await page.locator('#hud').count(),1);assert.ok(await page.locator('[data-hud-efs]').isVisible());assert.equal(await page.locator('.interior #hud [data-meter]').count(),4);
  await page.locator('.int-object').filter({hasText:'Meisterbrief'}).click();assert.ok((await page.locator('.int-panel').innerText()).includes('Reinhard Müller'));
  await page.locator('[data-bar]').filter({hasText:'Einnahmen'}).click();await page.locator('.int-panel .act').filter({hasText:'Einnahmen im Büro abholen'}).click();
  await page.waitForFunction(()=>document.querySelector('.int-panel .act')?.disabled);
  assert.equal(state.money,initialMoney+initialCash);assert.equal(user.efs_pool,initialEfs+1);assert.equal(state.cityId,residence);
  await page.locator('[data-bar]').filter({hasText:'Bankverwaltung'}).click();await page.locator('.int-panel .act').filter({hasText:'einrichten · 10 Coins'}).click();
  await page.waitForSelector('.int-panel .act:has-text("Bankautomatik pausieren")');assert.equal(user.coins,15);assert.equal(user.efs_pool,initialEfs+1);
  await page.locator('.int-panel .act').filter({hasText:'Bankautomatik pausieren'}).click();await page.waitForSelector('.int-panel .act:has-text("Bankautomatik aktivieren")');assert.equal(user.coins,15);
  await page.locator('#pClose').click();await page.screenshot({path:'/tmp/tp-concept-office-desktop.png'});
  for(const [width,height] of [[915,412],[412,915]]){
   await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('.interior [data-meter="fridge"]').click();await page.waitForSelector('.modal');
   const before=view.food.stock;await page.locator('[data-pack="1"]').click();await page.waitForFunction(()=>document.querySelector('.modal')?.getAttribute('aria-busy')==='false');assert.equal(view.food.stock,before+100);
   await page.keyboard.press('Escape');assert.equal(await page.locator('.interior').count(),1);
  }
  await page.locator('.interior [data-design-settings]').click();await page.waitForSelector('input[name="game-design"]');await page.locator('.modal [data-close="1"]').click();
  await page.screenshot({path:'/tmp/tp-concept-office-mobile.png'});
  await page.locator('#intBack').click();await page.waitForSelector('.interior',{state:'detached'});assert.equal(await page.locator('#app #hud').count(),1);assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
