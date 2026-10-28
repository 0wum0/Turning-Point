'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,state,view,user,gameWorld}=require('./design-fixture');
const {present}=require('../../src/game/present');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH||'playwright');
test('family city control: identity, school, real gifts, cancellation, positions, mobile and Classic',{timeout:180000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser,page;
 state.partner={personId:'p1',name:'Eva Müller',gender:'f',born:state.day-25*365,pkey:'baecker',profession:'Bäckerin',sat:60,cohabit:true,married:true};
 state.children=[{id:1,name:'Anna Müller',gender:'f',born:state.day-8*365,cityId:state.cityId,status:'home',sat:60,pendingSchool:true,school:null,path:null},
 {id:2,name:'Ben Müller',gender:'m',born:state.day-3*365,cityId:state.cityId,status:'home',sat:70,school:null,path:null},
 {id:3,name:'Clara Müller',gender:'f',born:state.day-12*365,cityId:state.cityId,status:'runaway',searchDeadline:state.day+20,sat:20,school:null,path:null}];
 const refresh=()=>{const onboarding=view.onboarding;Object.assign(view,present(gameWorld,state,user,Date.now()),{onboarding});};refresh();
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('tp-game-design','v2'));
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/city`);const ready=()=>page.waitForFunction(()=>document.querySelector('#city3dHost')?.__city3d);await ready();
  const control=()=>page.locator('.city-family-control select'),stats=()=>page.evaluate(()=>document.querySelector('#city3dHost').__city3d.stats());
  assert.equal(await control().locator('option[value="child:2"]').evaluate(el=>el.disabled),true);assert.equal(await control().locator('option[value="child:3"]').evaluate(el=>el.disabled),true);
  const self=(await stats()).player,day=state.day,city=state.cityId;
  await control().selectOption('child:1');assert.equal((await stats()).player.actorId,'child:1');
  await page.locator('[data-focus="biz:1"]').click();assert.equal(await page.locator('#cityEnter').isDisabled(),true,'child cannot operate the player company');
  await page.locator('[data-focus="schule"]').click();await page.locator('#cityEnter').click();await page.waitForSelector('.modal [data-school="1"]');
  assert.equal(await page.locator('.interior').count(),0,'family destination does not impersonate the player inside a business');
  await page.locator('.modal [data-school="1"][data-type="real"]').click();await page.waitForSelector('.modal',{state:'hidden'});await ready();
  assert.equal(state.children[0].school,'real');assert.equal(state.children[0].pendingSchool,false);
  const childAtSchool=(await stats()).player;
  await control().selectOption('self');assert.deepEqual([(await stats()).player.x,(await stats()).player.y],[self.x,self.y],'player position remains independent');
  await control().selectOption('child:1');assert.deepEqual([(await stats()).player.x,(await stats()).player.y],[childAtSchool.x,childAtSchool.y],'child position survives scene refresh');
  await page.locator('[data-focus="markt"]').click();await page.locator('#cityEnter').click();await page.waitForSelector('.modal [data-gift="1"]');
  const beforeMoney=state.money,beforeSat=state.children[0].sat;await page.locator('.modal [data-gift="1"]').click();await page.waitForSelector('.modal',{state:'hidden'});await ready();
  assert.ok(state.money<beforeMoney);assert.ok(state.children[0].sat>beforeSat);assert.equal(state.day,day);assert.equal(state.cityId,city);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-focus="schule"]').click();await page.locator('#cityEnter').click();await page.waitForSelector('.city-walk-status:not([hidden])');
  await control().selectOption('self');await page.waitForFunction(()=>!document.querySelector('#city3dHost').__city3d.stats().player.walking);await page.waitForTimeout(200);assert.equal(await page.locator('.modal').count(),0,'changing actor cancels the old destination');
  await page.emulateMedia({reducedMotion:'reduce'});await control().selectOption('partner:Eva Müller');await page.locator('[data-focus="markt"]').click();await page.locator('#cityEnter').click();await page.waitForSelector('.modal [data-p="together"]');
  await page.locator('.modal [data-p="together"]').click();await page.waitForSelector('.modal',{state:'hidden'});await ready();assert.equal(state.partner.lastTogether,day);
  await page.setViewportSize({width:412,height:915});await control().selectOption('child:1');await page.locator('#city3dHost').scrollIntoViewIfNeeded();
  if(await page.locator('.city-minimap-toggle').getAttribute('aria-expanded')==='false')await page.locator('.city-minimap-toggle').click();
  const box=await page.locator('#city3dHost').boundingBox(),mini=await page.locator('.city-minimap').boundingBox();assert.ok(mini.y>=box.y,'expanded family minimap stays in scene');assert.ok(mini.x+mini.width<=box.x+box.width+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const modes=await page.locator('.city-view-mode').boundingBox();assert.ok(mini.y>=modes.y+modes.height,'family controls leave the view toggle accessible');
  await page.screenshot({path:'/tmp/tp-city-family-mobile.png'});
  await page.locator('[data-city-view="2d"]').click();assert.equal(await page.locator('#cityEnter').innerText(),'Gebäude betreten','2D returns to player controls');
  await page.locator('[data-city-view="3d"]').click();await ready();assert.equal((await stats()).player.actorId,'self');
  await page.locator('[data-design-settings]').click();await page.locator('input[name="game-design"][value="classic"]').check();await page.locator('.modal [data-close="1"]').click();
  await page.waitForSelector('.city-family-control',{state:'detached'});assert.equal(await page.locator('#aerialHost').isVisible(),true);assert.deepEqual(errors,[]);
 }catch(e){await page?.screenshot({path:'/tmp/tp-city-family-failure.png'}).catch(()=>{});throw e;}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
