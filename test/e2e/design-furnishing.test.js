'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,view,state,user,gameWorld}=require('./design-fixture');
const {present}=require('../../src/game/present');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH||'playwright');
test('Furnishing: mixed-room order, exact EFS, live physical models, storage, responsive forms and Classic',{timeout:180000},async()=>{
 state.day=10*365;state.properties[0].cityId=state.cityId;state.housing={type:'own',propertyId:1};
 const onboarding=view.onboarding;Object.assign(view,present(gameWorld,state,user));view.onboarding=onboarding;
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser,page;const errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(18000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('tp-game-design','v2'));
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/housing`);await page.locator('[data-furnishing="prop:1"]').click();
  const add=async(room,key,count)=>{await page.locator(`[data-furnish-room="${room}"]`).click();await page.locator(`[data-furnish-count="${key}"]`).fill(String(count));await page.locator(`[data-furnish-add="${key}"]`).click();};
  await add('bedroom','bed',5);await add('office','desk',1);await add('main','radio',1);
  assert.equal(state.properties[0].furnishing,undefined,'cart does not mutate the game');
  const money=state.money,efs=user.efs_pool;
  await page.screenshot({path:'/tmp/tp-furnishing-order-desktop.png'});
  await page.locator('[data-furnish-order]').click();await page.waitForFunction(()=>document.querySelector('.furnish-feedback')?.textContent.includes('7 Gegenstände geliefert'));
  assert.equal(user.efs_pool,efs+7);assert.equal(state.properties[0].furnishing.items.length,7);assert.ok(state.money<money);
  const after=state.money;const replay=await page.evaluate(async()=>{const r=await fetch('/api/action/furnishingOrder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({building:'prop:1',revision:0,lines:[{key:'bed',room:'bedroom',count:5}],expectedCost:1})});return r.status;});assert.equal(replay,400);assert.equal(state.money,after);assert.equal(user.efs_pool,efs+7);
  await page.locator('[data-furnish-room="bedroom"]').click();await page.locator('[data-furnish-visit]').click();await page.waitForSelector('.interior[data-active-room="bedroom"]');
  const models=()=>page.evaluate(()=>document.querySelector('.interior').__room.activeHotspots().filter(h=>h.purchased).map(h=>({id:h.obj.userData.furnishingItemId,key:h.obj.userData.furnishingKey,room:h.roomId,children:h.obj.children.length})));
  assert.equal((await models()).length,5);assert.ok((await models()).every(m=>m.children>8&&m.key==='bed'));
  const bounds=await page.evaluate(async()=>{const T=await import('/vendor/three/three.min.js'),room=document.querySelector('.interior').__room,hs=room.activeHotspots().filter(h=>h.purchased);room.scene.updateMatrixWorld(true);const boxes=hs.map(h=>new T.Box3().setFromObject(h.obj));return boxes.every((box,i)=>boxes.every((other,j)=>i===j||!box.intersectsBox(other)));});assert.equal(bounds,true,'purchased beds never overlap each other');
  await page.screenshot({path:'/tmp/tp-furnishing-bedroom-desktop.png'});
  await page.locator('[data-object]').filter({hasText:'Holzbett'}).first().click();assert.ok((await page.locator('.int-panel').innerText()).includes('Aufgabe:'));
  await page.locator('#pClose').click();await page.setViewportSize({width:412,height:915});await page.locator('[data-interior-furnishing]').click();
  for(const [width,height] of [[412,915],[915,412],[320,700]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const bad=await page.locator('.furnish-dialog input,.furnish-dialog select,.furnish-dialog button').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width&& (r.x<0||r.right>innerWidth+1);}));assert.equal(bad.length,0);}
  await page.setViewportSize({width:412,height:915});await page.locator('.furnish-inventory summary').click();await page.locator('[data-furnish-destination="1"]').selectOption('reserve');await page.locator('[data-furnish-move="1"]').click();await page.waitForFunction(()=>document.querySelector('.furnish-feedback')?.textContent.includes('eingelagert'));
  assert.equal(user.efs_pool,efs+7);assert.equal((await models()).length,4);assert.equal(state.properties[0].furnishing.items.length,7);
  await page.screenshot({path:'/tmp/tp-furnishing-mobile.png'});
  await page.locator('[data-furnish-destination="1"]').selectOption('main');await page.locator('[data-furnish-move="1"]').click();await page.waitForFunction(()=>document.querySelector('.furnish-feedback')?.textContent.includes('umgestellt'));
  await page.locator('[data-furnish-room="main"]').click();await page.locator('[data-furnish-visit]').click();assert.equal((await models()).length,2);assert.equal(user.efs_pool,efs+7);
  await page.locator('#intBack').click();await page.waitForSelector('.interior',{state:'detached'});
  await page.locator('[data-design-settings]').click();await page.locator('input[name="game-design"][value="classic"]').check();await page.locator('.modal [data-close="1"]').click();
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/housing`);await page.locator('[data-furnishing="prop:1"]').click();await add('kitchen','cabinet',1);await page.locator('[data-furnish-order]').click();await page.waitForFunction(()=>document.querySelector('.furnish-feedback')?.textContent.includes('1 Gegenstand geliefert'));assert.equal(user.efs_pool,efs+8);
  assert.equal(state.properties[0].furnishing.items.length,8);assert.deepEqual(errors,[]);
 }catch(e){if(page){console.error('Furnishing diagnostics',errors);await page.screenshot({path:'/tmp/tp-furnishing-failure.png'}).catch(()=>{});}throw e;}
 finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
