'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {testWorld,input}=require('./helpers'),{createCharacter,parseState}=require('../src/game/state');
const {present}=require('../src/game/present'),actions=require('../src/game/actions'),build=require('../src/game/construction');
const {advance}=require('../src/game/engine'),biz=require('../src/game/business');
function setup(){
 const world={...testWorld()},user={coins:50,efs_pool:0,meta:{}},state=createCharacter(world,input(world),user);
 world.econ={...world.econ,companies:{...world.econ.companies,construction:{roomYears:[1,2,3],upgradeYears:5}}};
 state.money=1e9;state.skills.days.baecker=4000;state.life.baseYears=200;state.butler={quality:1};state.housing={type:'rent',rooms:4,base:70,cityId:state.cityId};
 state.companies=[{id:1,pkey:'baecker',name:'Bäckerei Beispiel',cityId:state.cityId,tier:0,rooms:3,staff:2,manager:true,base:100000,cash:0,since:0}];
 const ctx={world,state,user};return {...ctx,c:state.companies[0],act:(n,i)=>actions.run(n,{...ctx,input:i,now:Date.now()})};
}
function quote(x,kind='room'){
 const c=present(x.world,x.state,x.user).companies[0];
 return {id:1,constructionRevision:c.constructionRevision,expectedCost:kind==='room'?c.roomCost:c.next.cost,expectedDays:kind==='room'?c.constructionTimes.roomDays:c.constructionTimes.upgradeDays,expectedCoins:kind==='room'&&c.roomCoins>0?Math.max(1,Math.ceil(c.roomCoins/2**c.roomStep)):0};
}
test('paid room waits 365 actual game days; duplicate requests cannot debit twice; completion awards once',()=>{
 const x=setup(),q=quote(x),money=x.state.money,efs=x.state.fx.efs,base=x.c.base,flows=biz.companyFlows(x.world,x.state,x.c,1945);
 x.act('bizExpand',q);assert.equal(x.c.rooms,3);assert.equal(x.c.base,base);assert.equal(x.state.money,money-q.expectedCost);assert.equal(x.state.fx.efs,efs);assert.equal(x.c.construction.durationDays,365);assert.equal(biz.companyFlows(x.world,x.state,x.c,1945).profit,flows.profit,'construction alone does not increase operating costs');
 const snapshot=JSON.stringify(x.state);assert.throws(()=>x.act('bizExpand',q),/Bauplan/);assert.equal(JSON.stringify(x.state),snapshot);
 x.state.day=1;build.daily(x);build.daily(x);assert.equal(x.c.construction.elapsedDays,1,'one increment per engine day');
 for(let day=2;day<365;day++){x.state.day=day;build.daily(x);}assert.equal(x.c.rooms,3);
 x.state.day=365;build.daily(x);assert.equal(x.c.rooms,4);assert.equal(x.c.construction,undefined);assert.ok(x.c.base>base);assert.ok(x.state.fx.efs>efs);
 const after=x.state.fx.efs;build.daily(x);assert.equal(x.state.fx.efs,after);assert.equal(x.c.rooms,4);assert.equal(x.state.interrupts.length,0);
});
test('upgrade freezes accepted target and duration; loss of qualification or abandonment pauses safely',()=>{
 const x=setup();x.act('bizUpgrade',quote(x,'upgrade'));assert.equal(x.c.tier,0);assert.equal(x.c.construction.durationDays,1825);
 x.world.econ.companies.construction={roomYears:[3,3,3],upgradeYears:1};assert.equal(x.c.construction.durationDays,1825);
 x.state.skills.days.baecker=0;x.state.day++;build.daily(x);assert.equal(x.c.construction.elapsedDays,0);assert.match(build.view(x.world,x.state,x.c).paused,/qualifikation/i);
 x.state.skills.days.baecker=4000;x.c.abandoned={day:0};x.state.day++;build.daily(x);assert.equal(x.c.construction.elapsedDays,0);
 x.c.abandoned=null;for(let i=0;i<1825;i++){x.state.day++;build.daily(x);}assert.equal(x.c.tier,1);assert.ok(x.c.rooms>=3);assert.equal(x.state.press.filter(p=>p.type==='business_expand').length,1);
});
test('cancel returns only unused indexed money, never coins or EFS; stale cancellations do not affect a new order',()=>{
 const x=setup();x.act('bizExpand',quote(x));for(let i=0;i<100;i++){x.state.day++;build.daily(x);}
 const p=build.view(x.world,x.state,x.c),money=x.state.money,coins=x.state.fx.coins,efs=x.state.fx.efs;
 const cancel={id:1,constructionRevision:p.revision,expectedRefund:p.refund};x.act('bizCancelConstruction',cancel);
 assert.equal(x.state.money,money+p.refund);assert.equal(x.state.fx.coins,coins);assert.equal(x.state.fx.efs,efs);assert.equal(x.c.rooms,3);assert.equal(x.c.construction,undefined);
 x.act('bizExpand',quote(x));const snapshot=JSON.stringify(x.state);assert.throws(()=>x.act('bizCancelConstruction',cancel),/Bauplan/);assert.equal(JSON.stringify(x.state),snapshot);
});
test('ownership, funds, coins, price and timing validation do not partly mutate the state',()=>{
 for(const change of [q=>({...q,id:999}),q=>({...q,expectedCost:1}),q=>({...q,expectedCoins:-1}),q=>({...q,expectedDays:1}),q=>({...q,constructionRevision:-1})]){
  const x=setup(),q=change(quote(x)),snapshot=JSON.stringify(x.state);assert.throws(()=>x.act('bizExpand',q));assert.equal(JSON.stringify(x.state),snapshot);
 }
 for(const what of ['money','coins']){const x=setup(),q=quote(x);if(what==='money')x.state.money=0;else x.user.coins=0;const snapshot=JSON.stringify(x.state);assert.throws(()=>x.act('bizExpand',q));assert.equal(JSON.stringify(x.state),snapshot);}
});
test('old saves remain unmodified, active orders survive serialization, value switches without double counting',()=>{
 const x=setup(),original=JSON.stringify(x.c);assert.equal(build.view(x.world,x.state,x.c),null);assert.equal(JSON.stringify(x.c),original);
 x.act('bizExpand',quote(x));assert.deepEqual(parseState(JSON.stringify(x.state)).companies[0].construction,x.c.construction);
 const value=biz.companyValue(x.world,x.state,x.c,1945);x.c.construction.elapsedDays=364;x.state.day++;build.daily(x);assert.equal(biz.companyValue(x.world,x.state,x.c,1945),value);
});
test('online/EFS and offline engine paths complete on the same elapsed day',()=>{
 for(const mode of ['online','offline']){
  const x=setup();x.act('bizExpand',quote(x));x.c.construction.elapsedDays=364;
  const result=advance(x.world,x.state,1,{mode});assert.equal(result.advanced,1);assert.equal(x.c.rooms,4);assert.equal(x.c.construction,undefined);
 }
});
test('market transfer rebases only the clock, preserving paid construction, progress and cancellation value in new era',()=>{
 const x=setup();x.act('bizExpand',quote(x));x.state.day++;build.daily(x);
 const market=require('../src/lib/market'),snap=market.detach(x.world,x.state,'firm',1),buyer=setup();buyer.state.companies=[];buyer.state.day=57*365;buyer.state.nextCompanyId=2;
 const c=market.attach(buyer.world,buyer.state,'firm',snap);assert.equal(c.construction.elapsedDays,1);assert.equal(c.construction.lastDay,buyer.state.day);
 const p=build.view(buyer.world,buyer.state,c);assert.equal(p.refund,Math.floor(Math.round(c.construction.basePaid*buyer.world.idx(2002))*364/365));
 buyer.state.day++;build.daily(buyer);assert.equal(c.construction.elapsedDays,2);
});

test('inheritance preserves the construction contract and advancing the heir does not mutate the old life',()=>{
 const x=setup();x.act('bizExpand',quote(x));
 x.state.children.push({id:1,personId:'c0',name:'Erbe',gender:'m',born:x.state.day-22*365,cityId:x.state.cityId,status:'home',sat:80,path:'none',skills:['baecker']});x.state.tree.persons.push({id:'c0',jobs:[]});
 const old=JSON.stringify(x.c.construction),heir=require('../src/game/heir').createHeirState(x.world,x.state,1,['c:1']).state;
 assert.deepEqual(heir.companies[0].construction,x.c.construction);heir.day++;build.daily({world:x.world,state:heir});assert.equal(JSON.stringify(x.c.construction),old);
});
