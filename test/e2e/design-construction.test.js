'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,view,state,user,gameWorld}=require('./design-fixture');
const {present}=require('../../src/game/present'),construction=require('../../src/game/construction');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH||'playwright');
test('Construction: reviewed order, office progress, physical scaffolding, completion, cancellation and mobile Classic',{timeout:150000},async()=>{
 state.skills.days.baecker=4000;state.money=1e9;
 const refresh=()=>{const onboarding=view.onboarding;Object.assign(view,present(gameWorld,state,user));view.onboarding=onboarding;};refresh();
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser,page;const errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('tp-game-design','v2');document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.cityHour='12';},{once:true});});
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/business`);
  const before=state.money,efs=user.efs_pool;
  await page.locator('[data-construction="1"]').click();await page.waitForSelector('[data-start-build]');assert.equal(state.money,before,'opening a plan does not purchase it');
  assert.match(await page.locator('.construction-dialog').innerText(),/365 Tage/);
  await page.locator('[data-start-build]').click();await page.waitForSelector('.construction-dialog progress');
  assert.equal(state.companies[0].rooms,3);assert.ok(state.money<before);assert.equal(user.efs_pool,efs);assert.equal(state.companies[0].construction.elapsedDays,0);
  await page.screenshot({path:'/tmp/tp-construction-desktop.png'});
  await page.locator('.construction-dialog [data-close]').click();await page.locator('[data-office="1"]').click();await page.waitForSelector('.interior .construction-status');
  await page.locator('[data-object]').filter({hasText:'Büro –'}).click();await page.locator('.int-panel .act').filter({hasText:'Bauauftrag & Fortschritt'}).click();await page.waitForSelector('.construction-dialog progress');
  for(const [width,height] of [[412,915],[915,412],[320,640]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.construction-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);assert.ok(await page.locator('.construction-dialog .kv').evaluate(el=>[...el.querySelectorAll('dt')].every(dt=>{const a=dt.getBoundingClientRect(),b=dt.nextElementSibling.getBoundingClientRect();return a.right<=b.left+1||a.bottom<=b.top+1;})),'cost labels and values never overlap');}
  await page.screenshot({path:'/tmp/tp-construction-mobile.png'});await page.locator('.construction-dialog [data-close]').click();await page.locator('#intBack').click();
  const scaffold=()=>page.evaluate(()=>document.querySelector('#city3dHost')?.__city3d?.stats().construction);
  await page.waitForFunction(()=>document.querySelector('#city3dHost')?.__city3d?.stats().construction?.some(c=>c.key==='biz:1'));
  assert.equal((await scaffold()).find(c=>c.key==='biz:1').stage,0);
  state.companies[0].construction.elapsedDays=200;state.day=200;refresh();await page.reload();await page.waitForFunction(()=>document.querySelector('#city3dHost')?.__city3d?.stats().construction?.some(c=>c.stage===2));
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.querySelector('#city3dHost').__city3d.flyTo('biz:1'));await page.screenshot({path:'/tmp/tp-construction-city.png'});
  state.companies[0].construction.elapsedDays=364;state.day++;construction.daily({world:gameWorld,state});refresh();await page.reload();await page.waitForFunction(()=>document.querySelector('#city3dHost')?.__city3d);assert.equal((await scaffold()).length,0);assert.equal(state.companies[0].rooms,4);
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/business`);await page.locator('[data-construction="1"]').click();await page.locator('[data-start-build]').click();await page.waitForSelector('[data-review-cancel]');
  const money=state.money,refund=view.companies[0].construction.refund;await page.locator('[data-review-cancel]').click();assert.equal(state.money,money);await page.locator('[data-cancel-build]').click();await page.waitForSelector('[data-start-build]');assert.equal(state.money,money+refund);assert.equal(state.companies[0].construction,undefined);
  await page.locator('.construction-dialog [data-close]').click();await page.locator('[data-design-settings]').click();await page.locator('input[name="game-design"][value="classic"]').check();await page.locator('.modal [data-close]').click();
  await page.locator('[data-build="upgrade"]').click();assert.match(await page.locator('.construction-dialog').innerText(),/1825 Tage/);assert.deepEqual(errors,[]);
 }catch(e){if(page){console.error(errors);await page.screenshot({path:'/tmp/tp-construction-failure.png'});}throw e;}
 finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
