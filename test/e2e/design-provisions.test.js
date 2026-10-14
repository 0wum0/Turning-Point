'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,view,state,world}=require('./design-fixture');
const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');
test('V2 header and supplies: responsive, four working meters, stacked purchases and remote founding',{timeout:120000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try {
  state.meters.rest=40;state.meters.health=50;state.housing={type:'pension',base:100};view.meters.rest=40;view.meters.health=50;view.food.canRest=true;
  view.date.doy=182;view.clock.perMs=0;
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],writes=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push({url:r.url(),body:r.postDataJSON()});});
  await page.addInitScript(()=>localStorage.setItem('tp-game-design','v2'));
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/map`);await page.waitForSelector('.sim-year-ring');
  assert.deepEqual(await page.locator('.hud [data-meter]').evaluateAll(es=>es.map(e=>e.dataset.meter)),['fridge','rest','wellbeing','health']);
  assert.equal(await page.locator('.sim-year-ring').getAttribute('aria-valuenow'),'50');assert.equal(await page.locator('[data-hud-season]').textContent(),'Sommer');
  for(const [width,height] of [[1440,900],[915,412],[690,1536],[412,915],[320,700]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no horizontal overflow at ${width}`);
   const boxes=await page.locator('.sim-capital,.sim-identity,.sim-assets,.hud-meters,.hud > [data-design-settings],.sim-utility').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {name:e.className,x:r.x,y:r.y,w:r.width,h:r.height};}));
   for(const b of boxes)assert.ok(b.x>=-1&&b.x+b.w<=width+1,`${width}: ${JSON.stringify(b)}`);
   for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const x=boxes[a],y=boxes[b];assert.ok(Math.min(x.x+x.w,y.x+y.w)-Math.max(x.x,y.x)<1 || Math.min(x.y+x.h,y.y+y.h)-Math.max(x.y,y.y)<1,`no overlap ${width}: ${x.name}/${y.name}`);}
   await page.screenshot({path:`/tmp/tp-header-${width}.png`});
  }
  await page.setViewportSize({width:412,height:915});await page.locator('[data-meter="fridge"]').click();
  assert.ok(await page.locator('.modal').getAttribute('aria-labelledby'));
  const stock=view.food.stock;await page.locator('[data-pack="1"]').click();await page.waitForFunction(()=>document.querySelector('[data-pack="1"]')?.disabled===false);
  await page.locator('[data-pack="1"]').click();await page.waitForFunction(()=>document.querySelector('[data-pack="1"]')?.disabled===false);assert.equal(view.food.stock,stock+200);
  await page.locator('[data-buy-item="fruit"]').click();await page.waitForFunction(()=>!document.querySelector('[data-use-item="fruit"]')?.disabled);
  await page.locator('[data-use-item="fruit"]').click();await page.waitForFunction(()=>document.querySelector('.modal')?.getAttribute('aria-busy')==='false');assert.equal(state.provisions.fruit,0);assert.equal(view.meters.health,58);
  await page.screenshot({path:'/tmp/tp-provisions-mobile.png'});await page.keyboard.press('Escape');
  await page.locator('[data-meter="rest"]').click();await page.locator('[data-buy-item="coffee"]').click();await page.waitForFunction(()=>!document.querySelector('[data-use-item="coffee"]')?.disabled);await page.locator('[data-use-item="coffee"]').click();await page.waitForFunction(()=>document.querySelector('.modal')?.getAttribute('aria-busy')==='false');assert.equal(view.meters.rest,55);
  await page.locator('[data-rest-now]').click();await page.waitForFunction(()=>document.querySelector('.modal')?.getAttribute('aria-busy')==='false');assert.equal(view.meters.rest,90);await page.keyboard.press('Escape');
  await page.locator('[data-meter="health"]').click();assert.equal(await page.locator('[data-buy-item="coffee"]').count(),0);assert.ok(await page.locator('[data-buy-item="fruit"]').isVisible());await page.keyboard.press('Escape');
  await page.goto(`http://127.0.0.1:${server.address().port}/play#/business`);await page.locator('[data-found]').click();await page.locator('#found-city').fill('Hamburg');await page.locator('#found-results button').first().click();
  await page.waitForSelector('[data-found-pick="baecker"]');await page.locator('[data-found-pick="baecker"]').click();await page.locator('#found-name').fill('Hansebrot');await page.locator('#found-go').click();await page.waitForSelector('#found-go',{state:'detached'});
  const city=world.cityRows.find(c=>c[1]==='Hamburg')[0],last=state.companies.at(-1);assert.equal(last.cityId,city);assert.notEqual(state.cityId,city);assert.equal(writes.find(r=>r.url.endsWith('/foundBiz')).body.cityId,city);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
