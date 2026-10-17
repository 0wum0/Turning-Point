'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,state,view,gameWorld,user}=require('./design-fixture');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH||'playwright');
test('shared possessions: remote buildings, rooms, paper context, mobile search, keyboard and Classic',{timeout:180000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser,page;const errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(18000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{if(!localStorage.getItem('tp-game-design'))localStorage.setItem('tp-game-design','v2');document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.cityHour='12';},{once:true});});
  const base=`http://127.0.0.1:${server.address().port}/play`;await page.goto(base+'#/map');await page.waitForSelector('#sim-world .possession-nav');
  const here=state.cityId,remote=state.properties.find(p=>p.cityId!==here),nav=()=>page.locator('.possession-nav:visible').filter({has:page.locator('summary')}).last();
  await nav().locator('summary').click();await nav().locator('[data-pos-tab="homes"]').click();assert.equal(await nav().locator('[data-pos-enter]').count(),5);await nav().locator('[data-pos-search]').fill(remote.name);assert.equal(await nav().locator('[data-pos-enter]').count(),1);await nav().locator(`[data-pos-enter="prop:${remote.id}"]`).click();await page.waitForSelector('.interior');await page.waitForSelector('.interior[data-active-room]');assert.equal(state.cityId,here);assert.match(await nav().locator('[data-pos-city]').innerText(),new RegExp(remote.cityId===1?'':gameWorld.city(remote.cityId).name));
  await nav().locator('summary').click();assert.equal(await nav().locator('[aria-pressed="true"]').innerText(),'Wohngebäude\n5');await page.keyboard.press('Escape');assert.equal(await page.locator('.interior').count(),1);assert.equal(await nav().locator('details').evaluate(el=>el.open),false);
  await nav().locator('[data-pos-paper]').click();await page.waitForSelector('#page[data-route="newspaper"]');assert.equal(await page.locator('.interior').count(),0);assert.ok((await page.locator('#page').innerText()).includes(gameWorld.city(remote.cityId).name));assert.equal(state.cityId,here);
  await page.goto(base+'#/city');await page.waitForSelector('#page > .possession-nav');await nav().locator('summary').click();await nav().locator('[data-pos-tab="business"]').click();await nav().locator('[data-pos-enter="biz:1"]').click();await page.waitForSelector('.interior[data-active-room]');await nav().locator('[data-pos-city]').click();await page.waitForSelector('#page > .possession-nav');assert.equal(await page.locator('.interior').count(),0);
  await page.setViewportSize({width:412,height:915});await nav().locator('summary').click();await nav().locator('[data-pos-tab="homes"]').click();await nav().locator('[data-pos-search]').fill('Wohnhaus');assert.equal(await nav().locator('[data-pos-enter]').count(),5);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok((await nav().locator('.possession-item').first().boundingBox()).height>100,'rows must not collapse in the scrolling list');await page.screenshot({path:'/tmp/tp-possessions-mobile.png'});
  const box=await nav().locator('.possession-panel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=412);await nav().locator('[data-pos-close]').click();await nav().locator('.possession-utilities [data-pos-map]').click();await page.waitForSelector('#sim-world:not([inert]) .possession-nav');await nav().locator('[data-pos-shop]').click();await page.waitForSelector('#page[data-route="shop"]');
  await page.goto(base+'#/map');await page.waitForSelector('#sim-world .possession-nav');await page.setViewportSize({width:915,height:412});await nav().locator('summary').click();await nav().locator('[data-pos-tab="homes"]').click();await nav().locator('.possession-item').last().scrollIntoViewIfNeeded();assert.ok(await nav().locator('.possession-item').last().isVisible());const landscapePanel=await nav().locator('.possession-panel').boundingBox(),dock=await page.locator('#side').boundingBox();assert.ok(landscapePanel.y+landscapePanel.height<=dock.y,'drawer stays above the dock');await page.screenshot({path:'/tmp/tp-possessions-landscape.png'});await page.setViewportSize({width:1440,height:1000});await nav().locator('[data-pos-search]').fill('');await page.screenshot({path:'/tmp/tp-possessions-desktop.png'});await nav().locator('[data-pos-tab="family"]').click();assert.ok((await nav().innerText()).includes('Familie verwalten'));await nav().locator('[data-pos-tab="household"]').click();await nav().locator('[data-pos-route="household"]').click();await page.waitForSelector('#page[data-route="household"]');
  await page.goto(base+'#/city');await page.waitForSelector('#page > .possession-nav');
  const design=async value=>{await page.locator('[data-design-settings]').click();await page.locator(`input[name="game-design"][value="${value}"]`).check();await page.locator('.modal [data-close="1"]').click();};
  await design('classic');assert.equal(await page.locator('.possession-nav').count(),0);await design('v2');await page.waitForSelector('#page > .possession-nav');assert.equal(await page.locator('#page > .possession-nav').count(),1);
  await design('classic');await page.reload();await page.waitForSelector('#page[data-route="city"]');assert.equal(await page.locator('.possession-nav').count(),0);assert.deepEqual(errors,[]);
 }catch(e){if(page)await page.screenshot({path:'/tmp/tp-possessions-failure.png'}).catch(()=>{});throw e;}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('business annexes: actual completed rooms, bounded wings, professions and eras',{timeout:90000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});const page=await browser.newPage({viewport:{width:1000,height:760}});await page.goto(`http://127.0.0.1:${server.address().port}/play`);
  const result=await page.evaluate(async()=>{
   const T=await import('/vendor/three/three.min.js'),{buildLandmark}=await import('/js/game/city-buildings.js');
   const shared={glassOn:new T.MeshStandardMaterial({color:0xffd88a}),glassOff:new T.MeshStandardMaterial({color:0x344855})};
   const rows=[];for(const era of [1,4])for(const pkey of ['baecker','wirt','schmied','online_haendler']){
    const b={key:'biz:1',name:'Betrieb mit Anbauten',type:'biz',pkey,w:120,d:100,tier:2,own:true,extensions:Array.from({length:47},(_,i)=>({id:`extension:${i+1}`,kind:['main','office','stock','kitchen'][i%4]}))};
    const built=buildLandmark(T,b,{era},shared),wings=built.group.userData.extensions;
    rows.push({era,pkey,count:wings.reduce((n,w)=>n+w.roomIds.length,0),unique:new Set(wings.flatMap(w=>w.roomIds)).size,floors:Math.max(...wings.map(w=>w.floors)),bounded:wings.every(w=>Math.abs(w.x)+w.w/2<=6&&Math.abs(w.z)+w.d/2<=5),roofs:wings.map(w=>w.roof)});
    if(era===1&&pkey==='baecker'){
     const scene=new T.Scene();scene.background=new T.Color('#b7d0da');scene.add(new T.HemisphereLight(0xffffff,0x78674e,2.4));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(-10,20,-10);scene.add(sun);scene.add(built.group);
     const camera=new T.PerspectiveCamera(38,1000/760,.1,200);camera.position.set(16,15,-22);camera.lookAt(0,2,0);const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1000,760);r.render(scene,camera);window.annexImage=r.domElement.toDataURL();r.dispose();
    }
   }
   const legacy=buildLandmark(T,{key:'biz:2',name:'Altbestand',type:'biz',pkey:'wirt',w:100,d:100,construction:{percent:50}},{era:1},shared);return {rows,legacy:legacy.group.userData.extensions};
  });
  for(const r of result.rows){assert.equal(r.count,47);assert.equal(r.unique,47);assert.ok(r.bounded);assert.ok(r.floors<=3);assert.ok(r.roofs.every(x=>r.era===1?x==='gable':x!=='gable'));}assert.deepEqual(result.legacy,[]);
  require('node:fs').writeFileSync('/tmp/tp-business-annex-preview.png',Buffer.from((await page.evaluate(()=>window.annexImage)).split(',')[1],'base64'));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
