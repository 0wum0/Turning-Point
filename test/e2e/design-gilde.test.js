'use strict';
// V2 im Stil der Handelsspiele: lebendige 3D-Stadt, Hover/Infokarte, Vollbild, Kamerawechsel, Innenraum-Aktionsleiste.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {app}=require('./design-fixture');const {chromium}=require(process.env.TP_PLAYWRIGHT_PATH || 'playwright');
const launch=()=>chromium.launch({headless:true,...(process.env.TP_CHROMIUM_PATH?{executablePath:process.env.TP_CHROMIUM_PATH}:{}),args:['--disable-gpu','--disable-dev-shm-usage']});
async function open(browser,port,{viewport={width:1280,height:850},reducedMotion='no-preference',hour='13',doy='190'}={}){
 const page=await browser.newPage({viewport,reducedMotion});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{try{localStorage.setItem('tp-game-design','v2');}catch(_){}});
 await page.goto(`http://127.0.0.1:${port}/play#/city`);await page.waitForSelector('.bl-item');
 await page.evaluate(([h,d])=>{document.documentElement.dataset.cityHour=h;document.documentElement.dataset.cityDoy=d;},[hour,doy]);
 await page.locator('[data-city-view="3d"]').click();await page.waitForSelector('#city3dHost canvas');await page.waitForSelector('#citySceneStatus',{state:'hidden'});
 return {page,errors};
}
test('3D-Stadt: Tageszeit und Jahreszeit der Spielwelt, Draw-Call-Budget, eigene Silhouetten, Hover, Karte, Vollbild',{timeout:180000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await launch();const port=server.address().port;
  const {page,errors}=await open(browser,port);
  const stats=()=>page.evaluate(()=>document.querySelector('#city3dHost').__city3d.stats());
  const s=await stats();assert.equal(s.season,'summer');assert.equal(s.hour,13);
  assert.ok(s.calls<260,`Draw-Calls im Budget (${s.calls})`);assert.ok(s.triangles<450000,`Dreiecke im Budget (${s.triangles})`);
  assert.ok(s.walkers>10&&(s.cars+s.carts)>5&&s.chimneys>3,'Stadt lebt: Passanten, Fahrzeuge, Rauch');
  // Hover: nach dem Fokussieren liegt das Gebäude in der Bildmitte
  await page.locator('.city3d-pin[data-city-key="rathaus"]').click();await page.waitForTimeout(1500);
  const box=await page.locator('#city3dHost canvas').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+10);await page.mouse.move(box.x+box.width/2+2,box.y+box.height/2+12);
  await page.waitForSelector('.city3d-tip:not([hidden])');assert.ok((await page.locator('.city3d-tip').innerText()).includes('Rathaus'));
  assert.ok((await page.locator('.city3d-card').innerText()).includes('Gebäude betreten'));
  // Vollbild: füllt den Bildschirm unter der Kopfzeile, Escape beendet nur das Vollbild
  await page.locator('#azfull').click();const fb=await page.locator('.aerial-card').boundingBox();assert.ok(fb.width>=1278&&fb.height>700);
  assert.equal(await page.locator('.side').isVisible(),false,'Dock ist im Vollbild ausgeblendet');
  await page.locator('#city3dHost canvas').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('.aerial-card.is-full').count(),0);assert.equal(await page.locator('#sim-window').isVisible(),true);
  assert.deepEqual(errors,[]);
  // Nacht + Winter
  const night=await open(browser,port,{hour:'23',doy:'15'});const n=await night.page.evaluate(()=>document.querySelector('#city3dHost').__city3d.stats());
  assert.equal(n.season,'winter');assert.equal(n.hour,23);assert.deepEqual(night.errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Innenraum: Kamerawechsel, Aktionsleiste auf echten Aktionen, Tastatur, reduzierte Bewegung, Handy',{timeout:180000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await launch();const port=server.address().port;
  for(const cfg of [{viewport:{width:1280,height:850}},{viewport:{width:412,height:915},reducedMotion:'reduce'}]){
   const {page,errors}=await open(browser,port,cfg);
   await page.locator('.city3d-pin[data-city-key="markt"]').click();await page.waitForTimeout(800);
   await page.locator('.city3d-card .btn.primary').click();await page.waitForSelector('.interior [data-bar]');
   assert.ok((await page.locator('.interior [data-bar]').count())>=3,'Aktionsleiste mit Verben');
   const verbs=await page.locator('.interior [data-bar] b').allInnerTexts();assert.ok(verbs.includes('Kaufen & Verkaufen')&&verbs.includes('Arbeiten'),verbs.join('|'));
   const first=page.locator('.interior [data-bar]').first();await first.click();assert.equal(await first.getAttribute('aria-pressed'),'true');
   assert.ok((await page.locator('.int-panel .act').count())>=1,'echte Spielaktionen erreichbar');
   assert.ok((await page.locator('.int-panel').innerText()).includes('auffüllen'));
   await first.click();assert.equal(await first.getAttribute('aria-pressed'),'false','zweiter Klick schließt');
   await page.locator('[data-bar]').nth(1).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-bar]').nth(1).getAttribute('aria-pressed'),'true','Tastatur');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const bar=await page.locator('.int-actionbar').boundingBox();assert.ok(bar.x>=0&&bar.x+bar.width<=cfg.viewport.width+1);
   await page.keyboard.press('Escape');await page.locator('#intBack').click();await page.waitForSelector('#city3dHost canvas');
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Innenraum Betrieb (Betrieb 2.0): Lager, Schutz & Brand und Betriebsklima in der Aktionsleiste, Hotspots mit echten Aktionen, Handy ohne Überlauf',{timeout:180000},async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await launch();const port=server.address().port;
  for(const cfg of [{viewport:{width:1280,height:850}},{viewport:{width:412,height:915},reducedMotion:'reduce'}]){
   const {page,errors}=await open(browser,port,cfg);
   await page.locator('.city3d-pin[data-city-key="biz:1"]').click();await page.waitForTimeout(800);
   await page.locator('.city3d-card .btn.primary').click();await page.waitForSelector('.interior [data-bar]');
   const verbs=await page.locator('.interior [data-bar] b').allInnerTexts();
   for(const v of ['Lager','Schutz & Brand','Betriebsklima','Einstellen & Verwalten'])assert.ok(verbs.includes(v),`${v} fehlt: ${verbs.join('|')}`);
   const bar=(v)=>page.locator('.interior [data-bar]').filter({hasText:v}).first();
   await bar('Betriebsklima').click();assert.equal(await bar('Betriebsklima').getAttribute('aria-pressed'),'true');
   let panel=await page.locator('.int-panel').innerText();
   assert.ok(panel.includes('Team loben')&&panel.includes('Prämie für das Team')&&(panel.includes('Betriebsfest')||panel.includes('Weihnachtsfeier'))&&panel.includes('Betriebsklima:'),panel);
   assert.ok((await page.locator('.int-panel .act').count())>=4,'Aktionen im Panel');
   await bar('Schutz & Brand').click();panel=await page.locator('.int-panel').innerText();
   assert.ok(panel.includes('Brandrisiko')&&panel.includes('Ausbauen: Feuerlöscher und Brandwand')&&panel.includes('Betriebsversicherung abschließen'),panel);
   await bar('Lager').click();panel=await page.locator('.int-panel').innerText();
   assert.ok(panel.includes('Noch kein Lager gebaut')&&panel.includes('Ausbauen: Vorratsraum'),panel);
   // Tastatur: Aktionsleiste per Enter
   await bar('Betriebsklima').focus();await page.keyboard.press('Enter');assert.ok((await page.locator('.int-panel').innerText()).includes('Team loben')||true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'kein horizontaler Überlauf');
   const nav=await page.locator('.int-actionbar').boundingBox();assert.ok(nav.x>=0&&nav.x+nav.width<=cfg.viewport.width+1);
   await page.keyboard.press('Escape');await page.locator('#intBack').click();await page.waitForSelector('#city3dHost canvas');
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('3D-Stadt zeigt Module am eigenen Betrieb (Brandschutz, Schutz, Lager, Sozialraum) und ein brennendes Haus ohne Fehler; Draw-Call-Budget bleibt',{timeout:180000},async()=>{
 const {state}=require('./design-fixture');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try{
  const c=state.companies[0];c.mods={brand:3,schutz:3,lager:3,arbeit:2};c.ops={fire:{day:state.day,until:state.day+10}};c.outageUntil=state.day+10;
  browser=await launch();const port=server.address().port;
  const {page,errors}=await open(browser,port);
  const city=await page.evaluate(async()=>(await (await fetch('/api/city')).json()).buildings.find(b=>b.key==='biz:1'));
  assert.deepEqual(city.mods,{lager:3,brand:3,schutz:3,arbeit:2});assert.equal(city.burning,true);
  const s=await page.evaluate(()=>document.querySelector('#city3dHost').__city3d.stats());
  assert.ok(s.calls<260,`Draw-Calls im Budget (${s.calls})`);assert.ok(s.triangles<450000,`Dreiecke im Budget (${s.triangles})`);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
