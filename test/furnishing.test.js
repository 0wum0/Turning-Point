'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {testWorld,input}=require('./helpers'),{createCharacter,parseState}=require('../src/game/state');
const actions=require('../src/game/actions'),furn=require('../src/game/furnishing'),{present}=require('../src/game/present');
const {netWorth,propertyValue}=require('../src/game/core');
const {companyValue}=require('../src/game/business');
const {buildingsFor}=require('../src/game/places');
function setup(year=1945){const world=testWorld(),user={coins:20,efs_pool:0,meta:{}};const state=createCharacter(world,input(world),user);state.day=(year-1945)*365;state.money=1e8;state.properties=[{id:1,kind:'house_small',name:'Haus',rooms:4,cityId:state.cityId,base:2000000,condition:100,closedUntil:0,bought:0}];state.companies=[{id:1,pkey:'wirt',name:'Gasthaus',rooms:3,cityId:state.cityId,base:1000000,tier:0,cash:0,staff:2,manager:true,since:0}];const ctx={world,state,user,now:Date.now()};return {...ctx,act:(name,data)=>actions.run(name,{...ctx,input:data})};}
const price=(c,key)=>furn.catalogue(c.world,c.state).find(i=>i.key===key).cost;
function order(c,building,lines,revision=0){return c.act('furnishingOrder',{building,revision,lines,expectedCost:lines.reduce((n,l)=>n+price(c,l.key)*l.count,0)});}
test('one mixed-room bulk order: ten beds are ten persisted objects and exactly ten EFS',()=>{
 const c=setup(),{state}=c,before=state.money,fx=state.fx.efs,home=state.cityId;
 order(c,'prop:1',[{key:'bed',room:'main',count:5},{key:'bed',room:'bedroom',count:5}]);
 const f=state.properties[0].furnishing;assert.equal(f.items.length,10);assert.equal(new Set(f.items.map(x=>x.id)).size,10);assert.equal(state.money,before-10*price(c,'bed'));assert.equal(state.fx.efs,fx+10);assert.equal(state.cityId,home);
 for(const room of ['main','bedroom'])assert.equal(new Set(f.items.filter(x=>x.room===room).map(x=>x.slot)).size,5);
 const saved=parseState(JSON.stringify(state));assert.deepEqual(saved.properties[0].furnishing,f);
});
test('three fryers give three EFS, only in an eligible restaurant kitchen and available era',()=>{
 const c=setup();assert.throws(()=>order(c,'biz:1',[{key:'fryer',room:'kitchen',count:3}]),/1955/);assert.equal(c.state.companies[0].furnishing,undefined);
 c.state.day=10*365;const before=c.state.fx.efs;order(c,'biz:1',[{key:'fryer',room:'kitchen',count:3}]);assert.equal(c.state.fx.efs,before+3);assert.equal(c.state.companies[0].furnishing.items.length,3);
});
test('invalid lines, insufficient funds, wrong owner, room, era and price leave the entire state untouched',()=>{
 const cases=[
  {building:'prop:999',lines:[{key:'bed',room:'main',count:1}]},
  {building:'rathaus',lines:[{key:'bed',room:'main',count:1}]},
  {building:'home',lines:[{key:'bed',room:'main',count:1}]},
  {building:'prop:1',lines:[{key:'bed',room:'stock',count:1}]},
  {building:'biz:1',lines:[{key:'bed',room:'main',count:1}]},
  {building:'prop:1',lines:[{key:'bed',room:'main',count:0}]},
  {building:'prop:1',lines:[{key:'bed',room:'main',count:-1}]},
  {building:'prop:1',lines:[{key:'bed',room:'main',count:1.5}]},
  {building:'prop:1',lines:[{key:'bed',room:'main',count:'2'}]},
  {building:'prop:1',lines:[{key:'bed',room:'main',count:7}]},
  {building:'prop:1',lines:[{key:'bed',room:'main',count:1},{key:'fridge',room:'kitchen',count:1}]},
  {building:'prop:1',lines:[{key:'constructor',room:'main',count:1}]},
  {building:'prop:1',lines:[]},
 ];
 for(const data of cases){const c=setup(),before=JSON.stringify(c.state);assert.throws(()=>c.act('furnishingOrder',{revision:0,expectedCost:100,...data}));assert.equal(JSON.stringify(c.state),before);}
 const c=setup();c.state.money=0;const before=JSON.stringify(c.state);assert.throws(()=>order(c,'prop:1',[{key:'bed',room:'main',count:1}]),/Geld/);assert.equal(JSON.stringify(c.state),before);
 const d=setup();assert.throws(()=>d.act('furnishingOrder',{building:'prop:1',revision:0,lines:[{key:'bed',room:'main',count:1}],expectedCost:1}),/Preis/);assert.equal(d.state.properties[0].furnishing,undefined);
});
test('duplicate or stale order revisions cannot charge twice or award additional EFS',()=>{
 const c=setup(),lines=[{key:'desk',room:'office',count:1}];order(c,'prop:1',lines);const snapshot=JSON.stringify(c.state);
 assert.throws(()=>order(c,'prop:1',lines),/bereits geändert/);assert.equal(JSON.stringify(c.state),snapshot);
 order(c,'prop:1',lines,1);assert.equal(c.state.properties[0].furnishing.items.length,2);assert.equal(c.state.fx.efs,2);
});
test('moving and storing preserve ownership, money and EFS, enforce real rooms and free slots',()=>{
 const c=setup();order(c,'prop:1',[{key:'bed',room:'main',count:1}]);const money=c.state.money,efs=c.state.fx.efs;
 c.act('furnishingMove',{building:'prop:1',revision:1,itemId:1,room:'bedroom'});let f=c.state.properties[0].furnishing;assert.equal(f.items[0].room,'bedroom');
 assert.throws(()=>c.act('furnishingMove',{building:'prop:1',revision:2,itemId:1,room:'office'}),/passt nicht/);
 c.act('furnishingMove',{building:'prop:1',revision:2,itemId:1,room:'reserve'});assert.equal(c.state.properties[0].furnishing.items[0].slot,null);
 c.act('furnishingMove',{building:'prop:1',revision:3,itemId:1,room:'main'});assert.equal(c.state.money,money);assert.equal(c.state.fx.efs,efs);assert.equal(c.state.properties[0].furnishing.items.length,1);
});
test('existing saves stay empty, actual room plan is shared with the city, public and rented buildings stay fixed',()=>{
 const c=setup(),snapshot=JSON.stringify(c.state.properties);const v=present(c.world,c.state,c.user);assert.equal(v.properties[0].furnishing.items.length,0);assert.equal(JSON.stringify(c.state.properties),snapshot);
 const buildings=buildingsFor(c.world,c.state,c.state.cityId);assert.deepEqual(buildings.find(b=>b.key==='prop:1').roomPlan,v.properties[0].furnishing.rooms.map(({capacity,...r})=>r));assert.equal(buildings.find(b=>b.key==='rathaus').furnishable,undefined);
 c.state.properties[0].rooms=1;assert.throws(()=>order(c,'prop:1',[{key:'bed',room:'bedroom',count:1}]),/passt nicht/);
 c.state.companies[0].abandoned={day:0};assert.throws(()=>order(c,'biz:1',[{key:'desk',room:'office',count:1}]),/Aktiviere/);
});
test('furniture is valued once in the asset price and total wealth, is retained in an object copy, and ages without creating profit',()=>{
 const c=setup(),p=c.state.properties[0],initial=propertyValue(c.world,c.state,p,1945),worth=netWorth(c.world,c.state);
 order(c,'prop:1',[{key:'bed',room:'bedroom',count:1}]);const cost=price(c,'bed');assert.equal(propertyValue(c.world,c.state,p,1945),initial+Math.round(cost*.6));assert.equal(netWorth(c.world,c.state),worth-cost+Math.round(cost*.6));
 const transferred=JSON.parse(JSON.stringify(p));assert.deepEqual(transferred.furnishing,p.furnishing);assert.ok(furn.value(c.world,p,1945)>0);assert.ok(furn.value(c.world,p,1965)/c.world.idx(1965)<furn.value(c.world,p,1945));
 const biz=c.state.companies[0],base=companyValue(c.world,c.state,biz,1945);order(c,'biz:1',[{key:'desk',room:'office',count:1}]);assert.equal(companyValue(c.world,c.state,biz,1945),base+Math.round(price(c,'desk')*.6));
});
test('admin price overrides and slot limits are server enforced',()=>{
 const c=setup();c.world.econ.furnishing={roomSlots:2,items:{bed:{price:12300,fromYear:1950}}};assert.equal(price(c,'bed'),12300);assert.throws(()=>order(c,'prop:1',[{key:'bed',room:'main',count:1}]),/1950/);c.state.day=5*365;
 assert.throws(()=>order(c,'prop:1',[{key:'bed',room:'main',count:3}]),/Stellplätze/);order(c,'prop:1',[{key:'bed',room:'main',count:2}]);assert.equal(c.state.properties[0].furnishing.items.length,2);
});
