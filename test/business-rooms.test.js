'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {testWorld,input}=require('./helpers'),{createCharacter,parseState}=require('../src/game/state');
const {present}=require('../src/game/present'),actions=require('../src/game/actions'),build=require('../src/game/construction'),furnishing=require('../src/game/furnishing');
function setup(pkey='baecker'){
 const world=testWorld(),user={coins:1000,efs_pool:0,meta:{}},state=createCharacter(world,input(world),user);
 state.money=1e10;state.skills.days[pkey]=10000;if(!state.skills.learned.includes(pkey))state.skills.learned.push(pkey);
 const c={id:1,pkey,name:'Betrieb Beispiel',cityId:state.cityId,tier:0,rooms:3,staff:2,manager:true,base:100000,cash:0,since:0};state.companies=[c];present(world,state,user);
 const ctx={world,state,user};return {...ctx,c,act:(name,input)=>actions.run(name,{...ctx,input,now:Date.now()})};
}
function quote(x,kind='room',roomKind='main'){const c=present(x.world,x.state,x.user).companies[0];return {id:1,roomKind,constructionRevision:c.constructionRevision,expectedDays:kind==='room'?c.constructionTimes.roomDays:c.constructionTimes.upgradeDays,expectedCost:kind==='room'?c.roomCost:c.next.cost,expectedCoins:kind==='room'?Math.max(1,Math.ceil(c.roomCoins/2**c.roomStep)):0};}
function finish(x){x.c.construction.elapsedDays=x.c.construction.durationDays-1;x.state.day++;build.daily(x);}
test('chosen business room unlocks only on completion, preserves old rooms and can be furnished',()=>{
 const x=setup(),old=furnishing.rooms('biz',x.c);x.act('bizExpand',quote(x,'room','office'));assert.deepEqual(furnishing.rooms('biz',x.c),old);assert.equal(x.c.construction.addedRooms[0].kind,'office');finish(x);
 assert.equal(x.c.rooms,4);assert.deepEqual(furnishing.rooms('biz',x.c).slice(0,3),old);assert.equal(x.c.extensions[0].id,'extension:1');
 const desk=furnishing.catalogue(x.world,x.state).find(i=>i.key==='desk');x.act('furnishingOrder',{building:'biz:1',revision:0,lines:[{key:'desk',room:'extension:1',count:1}],expectedCost:desk.cost});assert.equal(x.c.furnishing.items[0].room,'extension:1');
 assert.deepEqual(parseState(JSON.stringify(x.state)).companies[0].extensions,x.c.extensions);
});
test('wrong room type fails before charging; cuisine is available only for hospitality',()=>{
 for(const [pkey,kind]of [['baecker','kitchen'],['wirt','bedroom'],['wirt',null]]){const x=setup(pkey),q=quote(x,'room',kind),before=JSON.stringify(x.state);assert.throws(()=>x.act('bizExpand',q),/Raumtyp/);assert.equal(JSON.stringify(x.state),before);}
 const x=setup('wirt');x.act('bizExpand',quote(x,'room','kitchen'));finish(x);const fryer=furnishing.ITEMS.find(i=>i.key==='fryer');assert.ok(furnishing.objectView(x.world,x.state,'biz',x.c).rooms.some(r=>r.kind==='kitchen'));assert.ok(fryer.rooms.includes(x.c.extensions[0].kind));
});
test('upgrade creates only the added capacity, IDs and furnishings survive repeated work and cancellations',()=>{
 const x=setup();x.act('bizExpand',quote(x,'room','stock'));finish(x);x.act('bizUpgrade',quote(x,'upgrade'));assert.equal(x.c.construction.addedRooms.length,2);finish(x);assert.equal(x.c.rooms,6);assert.deepEqual(x.c.extensions.map(r=>r.id),['extension:1','extension:2','extension:3']);assert.equal(x.c.extensions[1].kind,'main');
 x.act('bizExpand',quote(x));const p=build.view(x.world,x.state,x.c);x.act('bizCancelConstruction',{id:1,constructionRevision:p.revision,expectedRefund:p.refund});assert.equal(x.c.extensions.length,3);
 x.act('bizExpand',quote(x,'room','office'));finish(x);assert.equal(x.c.extensions[3].id,'extension:4');assert.equal(x.c.extensions[3].kind,'office');
});
test('legacy orders finish with default workrooms; existing old saves gain no free rooms on read',()=>{
 const x=setup('schmied'),before=JSON.stringify(x.c);present(x.world,x.state,x.user);assert.equal(JSON.stringify(x.c),before);x.act('bizExpand',quote(x));delete x.c.construction.addedRooms;finish(x);assert.match(x.c.extensions[0].name,/Schmiedewerkstatt/);
});
test('market transfer and inheritance preserve room identity without mutating old nested state',()=>{
 const x=setup();x.act('bizExpand',quote(x));finish(x);x.act('bizExpand',quote(x,'room','office'));x.c.construction.elapsedDays=364;
 x.state.children.push({id:1,personId:'c0',name:'Erbe',gender:'m',born:x.state.day-22*365,cityId:x.state.cityId,status:'home',sat:80,path:'none',skills:['baecker']});x.state.tree.persons.push({id:'c0',jobs:[]});
 const before=JSON.stringify(x.c),heir=require('../src/game/heir').createHeirState(x.world,x.state,1,['c:1']).state;heir.skills.days.baecker=10000;heir.day++;build.daily({world:x.world,state:heir});assert.equal(heir.companies[0].extensions.length,2);assert.equal(JSON.stringify(x.c),before);
 const market=require('../src/lib/market'),snap=market.detach(x.world,x.state,'firm',1),buyer=setup();buyer.state.companies=[];buyer.state.nextCompanyId=2;buyer.state.day=10000;const c=market.attach(buyer.world,buyer.state,'firm',snap);assert.equal(c.extensions[0].id,'extension:1');assert.equal(c.construction.addedRooms[0].id,'extension:2');
});
