'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {app,view,world}=require('./design-fixture');const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');
test('V2 city flow: map choice opens 3D, newspaper follows city, home guide opens actionable local offers',{timeout:150000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
  const p=await browser.newPage({viewport:{width:412,height:915},reducedMotion:'reduce'});p.setDefaultTimeout(15000);
  const errors=[],editions=[],actions=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('/api/newspaper?'))editions.push(Number(new URL(r.url()).searchParams.get('cityId')));if(r.method()==='POST' && !r.url().endsWith('/seen'))actions.push(r.url());});
  await p.addInitScript(()=>localStorage.setItem('tp-game-design','v2'));
  await p.goto(`http://127.0.0.1:${server.address().port}/play#/map`);await p.waitForSelector('#mapq');
  const foreign=world.cityRows.find(c=>c[1]==='Hamburg'&&c[0]!==view.city.id);
  await p.locator('#mapq').fill('Hamburg');await p.locator(`#mapres [data-pick="${foreign[0]}"]`).click();
  await p.waitForSelector('#city3dHost canvas');await p.waitForSelector('#citySceneStatus',{state:'hidden'});
  assert.equal(await p.locator('[data-city-view="3d"]').getAttribute('aria-pressed'),'true');
  assert.equal(await p.locator('#page .panel-head h2').innerText(),'Hamburg');
  assert.ok((await p.locator('.city-journey').innerText()).includes('STADTBESUCH'));
  assert.equal(actions.length,0,'exploration never moves the character or spends resources');
  await p.locator('[data-focus="zeitung"]').click();await p.locator('#cityEnter').click();
  await p.waitForSelector('[data-object]');await p.locator('[data-object]').filter({hasText:'Zeitung lesen'}).click();
  const readPaper=p.locator('.int-panel .act').filter({hasText:'Die Zeitung lesen'});
  assert.equal(await readPaper.isEnabled(),true,'visitors can read the local newspaper from its building');
  await readPaper.click();await p.waitForSelector('.masthead');
  assert.equal(editions.at(-1),foreign[0]);assert.ok((await p.locator('.masthead').innerText()).includes('Hamburg'));
  await p.locator('.paper-tabs [data-tab="jobs"]').click();await p.waitForSelector('.masthead');
  assert.equal(editions.at(-1),foreign[0]);assert.equal(await p.locator('[data-act="apply"]:enabled').count(),0,'foreign job offers remain protected');
  await p.locator('#nHome').click();await p.waitForFunction(name=>document.querySelector('.masthead')?.textContent.includes(name),view.city.name);
  assert.equal(editions.at(-1),view.city.id);
  await p.locator('#sim-tabs [data-nav="city"]').click();await p.waitForSelector('#city3dHost canvas');
  await p.locator('[data-city-paper]').click();await p.waitForFunction(()=>document.querySelector('.masthead')?.textContent.includes('Hamburg'));
  assert.equal(editions.at(-1),foreign[0],'re-entering Hamburg replaces the home newspaper override');
  await p.locator('[data-news-city]').click();await p.waitForSelector('#city3dHost canvas');
  await p.locator('[data-journey-home]').click();await p.waitForFunction(name=>document.querySelector('#page .panel-head h2')?.textContent===name,view.city.name);
  await p.waitForSelector('#city3dHost canvas');assert.ok(await p.locator('.city-goal-shortcut').isVisible());
  assert.equal(await p.locator('.city-life-path').getAttribute('open'),null,'long-term objectives start collapsed');
  await p.locator('.city-life-path summary').click();assert.equal(await p.locator('[data-journey-chapter]').count(),4);
  await p.locator('.city-life-path summary').click();
  // The fixture starts without housing: the server's actual advice opens local housing offers.
  assert.ok((await p.locator('.city-journey').innerText()).includes(view.onboarding.advisor.top.title));
  await p.locator('.city-goal-shortcut').click();await p.waitForSelector('.paper-tabs [data-tab="housing"].on');
  assert.equal(editions.at(-1),view.city.id);assert.ok(await p.locator('[data-act="rent"]:enabled').count()>0);
  await p.locator('[data-news-city]').click();await p.waitForSelector('#city3dHost canvas');
  await p.screenshot({path:'/tmp/tp-city-guided.png'});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.locator('#page [data-go="map"]').click();await p.waitForSelector('#sim-window',{state:'hidden'});
  assert.equal(await p.locator('#city3dHost canvas').count(),0,'returning to the map releases the city renderer');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
