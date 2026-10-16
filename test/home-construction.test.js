'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {testWorld,input}=require('./helpers'),{createCharacter,parseState}=require('../src/game/state');
const {present}=require('../src/game/present'),actions=require('../src/game/actions'),build=require('../src/game/home-construction');
const core=require('../src/game/core'),furnishing=require('../src/game/furnishing'),{buildingsFor}=require('../src/game/places');
function setup(){
 const world={...testWorld()},user={id:2,coins:50,efs_pool:0,meta:{}},state=createCharacter(world,input(world),user);
 world.econ={...world.econ,homeConstruction:{maxExtensions:4,pricePct:50,years:{bedroom:1,office:2,main:3}}};
 state.money=1e9;state.life.baseYears=200;state.butler={quality:1};
 const p={id:1,kind:'house_small',name:'Unser Haus',cityId:state.cityId,rooms:4,base:2000000,condition:90,closedUntil:0,bought:0,rest:45};state.properties=[p];state.housing={type:'own',propertyId:1};state.insurance.gebaeude=true;
 const ctx={world,state,user};return {...ctx,p,act:(n,i)=>actions.run(n,{...ctx,input:i,now:Date.now()})};
}
function quote(x,kind='bedroom'){const p=present(x.world,x.state,x.user).properties[0],q=p.constructionOptions.find(q=>q.kind===kind);return {propertyId:1,constructionRevision:p.constructionRevision,roomKind:kind,expectedCost:q.cost,expectedDays:q.durationDays};}
function finish(x){x.p.construction.elapsedDays=x.p.construction.durationDays-1;x.state.day++;build.daily(x);}
test('residential construction defers capacity and running costs, counts each day once, and completes without duplicate value or EFS',()=>{
 const x=setup(),q=quote(x),money=x.state.money,efs=x.state.fx.efs,flow=core.dailyFlows(x.world,x.state);
 x.act('homeExpand',q);assert.equal(x.state.money,money-q.expectedCost);assert.equal(core.roomsAvailable(x.state),4);assert.deepEqual(core.dailyFlows(x.world,x.state),flow);assert.equal(furnishing.rooms('prop',x.p).length,4);
 const value=core.propertyValue(x.world,x.state,x.p,1945),snapshot=JSON.stringify(x.state);assert.throws(()=>x.act('homeExpand',q),/Bauplan/);assert.equal(JSON.stringify(x.state),snapshot);
 x.state.day++;build.daily(x);build.daily(x);assert.equal(x.p.construction.elapsedDays,1);
 for(let d=2;d<365;d++){x.state.day=d;build.daily(x);}assert.equal(x.p.rooms,4);
 x.state.day=365;build.daily(x);assert.equal(x.p.rooms,5);assert.equal(core.roomsAvailable(x.state),5);assert.equal(core.propertyValue(x.world,x.state,x.p,1945),value);assert.equal(x.state.fx.efs,efs);assert.equal(x.state.interrupts.length,0);
 assert.equal(x.p.extensions[0].id,'extension:1');assert.equal(x.p.construction,undefined);build.daily(x);assert.equal(x.p.extensions.length,1);
 const plan=furnishing.rooms('prop',x.p);assert.equal(plan.length,5);assert.deepEqual(plan,buildingsFor(x.world,x.state,x.state.cityId).find(b=>b.key==='prop:1').roomPlan);
});
test('quotes, ownership, kind, money, damage and limits reject atomically; paused days do not accumulate',()=>{
 for(const mutate of [q=>q.propertyId=99,q=>q.expectedCost++,q=>q.expectedDays=1,q=>q.constructionRevision=-1,q=>q.roomKind='kitchen']){const x=setup(),q=quote(x);mutate(q);const before=JSON.stringify(x.state);assert.throws(()=>x.act('homeExpand',q));assert.equal(JSON.stringify(x.state),before);}
 for(const mutate of [x=>x.state.money=0,x=>x.p.closedUntil=50,x=>x.p.condition=10,x=>x.p.extensions=Array(4).fill({kind:'bedroom'})]){const x=setup();mutate(x);const q=quote(x),before=JSON.stringify(x.state);assert.throws(()=>x.act('homeExpand',q));assert.equal(JSON.stringify(x.state),before);}
 const x=setup();x.act('homeExpand',quote(x,'office'));assert.equal(x.p.construction.durationDays,730);x.world.econ.homeConstruction.years.office=1;
 x.p.closedUntil=10;for(let d=1;d<10;d++){x.state.day=d;build.daily(x);}assert.equal(x.p.construction.elapsedDays,0);assert.match(build.view(x.world,x.state,x.p).paused,/beschädigt/);
 x.state.day=10;build.daily(x);assert.equal(x.p.construction.elapsedDays,1);assert.equal(x.p.construction.durationDays,730);x.p.condition=20;x.state.day++;build.daily(x);assert.equal(x.p.construction.elapsedDays,1);
});
test('cancellation uses indexed remaining work, preserves existing rooms and furniture, and rejects old requests',()=>{
 const x=setup();x.act('homeExpand',quote(x));finish(x);
 const room='extension:1',item=furnishing.catalogue(x.world,x.state).find(i=>i.key==='bed');x.act('furnishingOrder',{building:'prop:1',revision:0,lines:[{key:'bed',room,count:1}],expectedCost:item.cost});
 x.act('homeExpand',quote(x,'office'));x.p.construction.elapsedDays=365;x.state.day=57*365;
 const c=build.view(x.world,x.state,x.p),money=x.state.money,efs=x.state.fx.efs;
 assert.equal(c.refund,Math.floor(Math.round(x.p.construction.basePaid*x.world.idx(2002))/2));
 const cancel={propertyId:1,constructionRevision:c.revision,expectedRefund:c.refund};x.act('homeCancelConstruction',cancel);assert.equal(x.state.money,money+c.refund);assert.equal(x.state.fx.efs,efs);assert.equal(x.p.rooms,5);assert.equal(x.p.furnishing.items[0].room,room);
 x.act('homeExpand',quote(x));const before=JSON.stringify(x.state);assert.throws(()=>x.act('homeCancelConstruction',cancel),/Bauplan/);assert.equal(JSON.stringify(x.state),before);
});
test('unique completed rooms accept compatible furniture only and do not unlock legacy rooms on old small apartments',()=>{
 const x=setup();x.p.kind='flat';x.p.rooms=2;const old=furnishing.rooms('prop',x.p);
 x.act('homeExpand',quote(x));finish(x);x.act('homeExpand',quote(x,'office'));finish(x);
 assert.deepEqual(furnishing.rooms('prop',x.p).slice(0,2),old);assert.deepEqual(furnishing.rooms('prop',x.p).map(r=>r.id),['main','kitchen','extension:1','extension:2']);
 const desk=furnishing.catalogue(x.world,x.state).find(i=>i.key==='desk');
 assert.throws(()=>x.act('furnishingOrder',{building:'prop:1',revision:0,lines:[{key:'desk',room:'extension:1',count:1}],expectedCost:desk.cost}),/passt nicht/);
 x.act('furnishingOrder',{building:'prop:1',revision:0,lines:[{key:'desk',room:'extension:2',count:1}],expectedCost:desk.cost});
 const f=furnishing.objectView(x.world,x.state,'prop',x.p);assert.ok(f.items[0].moveRooms.includes('extension:2'));assert.ok(!f.items[0].moveRooms.includes('extension:1'));
 assert.throws(()=>x.act('furnishingMove',{building:'prop:1',revision:1,itemId:1,room:'hallway'}),/passt nicht/);
 assert.deepEqual(parseState(JSON.stringify(x.state)).properties[0],x.p);
});
test('old saves are read-only; online and offline engine complete extensions identically',()=>{
 for(const mode of ['online','offline']){const x=setup(),before=JSON.stringify(x.p);present(x.world,x.state,x.user);build.daily(x);assert.equal(JSON.stringify(x.p),before);x.act('homeExpand',quote(x));x.p.construction.elapsedDays=364;const r=require('../src/game/engine').advance(x.world,x.state,1,{mode});assert.equal(r.advanced,1);assert.equal(x.p.rooms,5);assert.equal(x.p.extensions.length,1);}
});
test('property transfers retain room IDs, furniture and construction, rebasing only the construction clock',()=>{
 const x=setup();x.act('homeExpand',quote(x));finish(x);x.act('homeExpand',quote(x,'office'));x.p.construction.elapsedDays=100;
 const market=require('../src/lib/market'),snap=market.detach(x.world,x.state,'prop',1),buyer=setup();buyer.state.properties=[];buyer.state.day=57*365;buyer.state.nextPropId=5;
 const p=market.attach(buyer.world,buyer.state,'prop',snap);assert.equal(p.construction.lastDay,buyer.state.day);assert.equal(p.construction.elapsedDays,100);assert.equal(p.extensions[0].id,'extension:1');buyer.state.day++;build.daily(buyer);assert.equal(p.construction.elapsedDays,101);
});
test('inheritance completes by replacing shared nested state, leaving the old life untouched',()=>{
 const x=setup();x.act('homeExpand',quote(x));finish(x);x.act('homeExpand',quote(x,'office'));x.p.construction.elapsedDays=729;
 x.state.children.push({id:1,personId:'c0',name:'Erbe',gender:'m',born:x.state.day-22*365,cityId:x.state.cityId,status:'home',sat:80,path:'none',skills:['baecker']});x.state.tree.persons.push({id:'c0',jobs:[]});
 const old=JSON.stringify(x.p),heir=require('../src/game/heir').createHeirState(x.world,x.state,1,['p:1']).state;
 assert.equal(heir.properties.length,1);heir.day++;build.daily({world:x.world,state:heir});assert.equal(heir.properties[0].extensions.length,2);assert.equal(JSON.stringify(x.p),old);
});
test('an active player tenant receives published additional capacity without changing contract rent',async()=>{
 const x=setup();x.state.properties=[];x.state.housing={type:'rent',rooms:4,base:123,cityId:x.state.cityId,lessor:{ownerId:8,propId:9}};
 const queries=[],conn={query:async()=>[],one:async(sql,args)=>{queries.push([sql,args]);return sql.includes('player_props')?{rooms:5}:{id:3};}};
 await require('../src/lib/leases').reconcile(conn,x.user,x.state,x.world);assert.equal(x.state.housing.rooms,5);assert.equal(x.state.housing.base,123);assert.deepEqual(queries.at(-1)[1],[8,9]);assert.equal(x.state.interrupts.length,0);
});

test('NPC rents rise only on completion, while player contract rents remain fixed',()=>{
 const landlord=require('../src/game/landlord'),x=setup();x.state.housing={type:'rent',rooms:4,base:70,cityId:x.state.cityId};x.p.lease={on:true,mult:1,tenant:{name:'Mieter',since:0}};
 const old=landlord.tenantRent(x.world,x.state,x.p,1945);x.act('homeExpand',quote(x));assert.equal(landlord.tenantRent(x.world,x.state,x.p,1945),old);finish(x);assert.ok(landlord.tenantRent(x.world,x.state,x.p,1945)>old);
 x.p.lease.tenant={userId:9,contractReal:123,name:'Spieler',since:0};x.act('homeExpand',quote(x));finish(x);assert.equal(landlord.tenantRent(x.world,x.state,x.p,1945),123);
});
