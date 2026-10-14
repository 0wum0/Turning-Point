'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {app,state,view}=require('./design-fixture');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH||'playwright');
test('Walk-in interiors: doors, real room actions, bounded camera, responsive console, overview and Classic',{timeout:150000},async()=>{
 state.housing={type:'rent',cityId:state.cityId,base:70,rooms:4};
 state.companies[0].pkey='wirt';state.companies[0].name='Gasthaus am Markt';
 view.companies[0].pkey='wirt';view.companies[0].name='Gasthaus am Markt';
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('tp-game-design','v2'));await page.goto(`http://127.0.0.1:${server.address().port}/play#/city`);await page.waitForSelector('.bl-item');
  await page.locator('[data-focus="biz:1"]').click();await page.locator('#cityEnter').click();await page.waitForSelector('[data-enter-room="kitchen"]');
  const root=page.locator('.interior');assert.equal(await root.getAttribute('data-active-room'),'main');
  // The door's location comes from its model; the visible door and room tab lead to the same zone.
  const door=page.locator('[data-room-door="stock"]');await door.click();assert.equal(await root.getAttribute('data-active-room'),'stock');
  assert.equal(await page.locator('[data-enter-room="stock"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-room-door="main"]').click();await page.locator('[data-enter-room="kitchen"]').click();
  assert.equal(await root.getAttribute('data-active-room'),'kitchen');
  assert.ok((await page.locator('.int-breadcrumb').innerText()).endsWith('/ Küche'));
  if(process.env.TP_REVIEW_SCREENSHOTS)await page.screenshot({path:process.env.TP_REVIEW_SCREENSHOTS+'/room-kitchen-final.png'});
  const camera=()=>page.evaluate(()=>document.querySelector('.interior').__cameraPosition());
  const before=await camera();await page.locator('.interior canvas').focus();await page.keyboard.press('w');const after=await camera();assert.equal(after.y,1.65);assert.ok(after.z<before.z,'W walks through the actual room');
  await page.evaluate(()=>{const el=document.querySelector('.interior canvas');for(let i=0;i<100;i++)el.dispatchEvent(new KeyboardEvent('keydown',{key:'w',bubbles:true}));});
  const bounded=await camera();const depth=await page.evaluate(()=>document.querySelector('.interior').__room.dims.d);assert.ok(Math.abs(bounded.z)<depth/2,'walking never crosses an outside wall');
  await page.locator('[data-bar]').filter({hasText:'Betriebsklima'}).click();assert.equal(await root.getAttribute('data-active-room'),'office');assert.ok((await page.locator('.int-panel').innerText()).includes('Team loben'));
  await page.locator('[data-enter-room="overview"]').click();assert.equal(await root.getAttribute('data-active-room'),'overview');assert.equal(await page.locator('.int-walk').isVisible(),false);
  await page.locator('[data-enter-room="kitchen"]').click();
  const visible=await page.evaluate(()=>{const room=document.querySelector('.interior').__room;return room.activeHotspots().map(h=>({id:h.id,visible:(()=>{for(let o=h.obj;o;o=o.parent)if(!o.visible)return false;return true;})()}));});assert.ok(visible.every(h=>h.visible),'active hotspots all belong to the visible room');
  await page.setViewportSize({width:412,height:915});await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const stage=await page.locator('.int-stage').boundingBox(),sidebar=await page.locator('.int-sidebar').boundingBox();assert.ok(sidebar.y>=stage.y+stage.height-1,'console never covers the mobile scene');
  await page.locator('[data-enter-room="main"]').click();assert.equal(await root.getAttribute('data-active-room'),'main');
  if(process.env.TP_REVIEW_SCREENSHOTS)await page.screenshot({path:process.env.TP_REVIEW_SCREENSHOTS+'/room-mobile-final.png'});
  await page.locator('#intBack').click();
  // Existing home objects automatically reveal their own room and preserve the real purchase action.
  const key=await page.evaluate(async()=>(await(await fetch('/api/city')).json()).buildings.find(b=>b.type==='home').key);
  await page.locator(`[data-focus="${key}"]`).click();await page.locator('#cityEnter').click();await page.waitForSelector('[data-enter-room="bedroom"]');
  await page.locator('[data-object]').filter({hasText:'Kühlschrank'}).click();assert.equal(await root.getAttribute('data-active-room'),'kitchen');assert.ok((await page.locator('.int-panel').innerText()).includes('Vorrat auffüllen'));
  await page.locator('[data-room-tab="tasks"]').click();await page.locator('.int-task').filter({hasText:'Kochen'}).locator('[data-run-task]').click();
  await page.waitForSelector('#mx');assert.equal(await root.getAttribute('data-active-room'),'overview','collection tasks use the unobstructed overview');
  assert.ok((await page.evaluate(()=>document.querySelector('.interior')._tokenScreen())).length>=4);
  await page.locator('#mx').click();assert.equal(await root.getAttribute('data-active-room'),'kitchen','cancelling restores the previous room');
  await page.locator('#intBack').click();await page.locator('[data-design-settings]').click();await page.locator('input[name="game-design"][value="classic"]').check();await page.locator('.modal [data-close="1"]').click();
  await page.locator(`[data-focus="${key}"]`).click();await page.waitForSelector('.interior canvas');assert.equal(await page.locator('.int-room-nav').count(),0,'Classic keeps its original camera and layout');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
