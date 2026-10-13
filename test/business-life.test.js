'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=()=>import('data:text/javascript;base64,'+fs.readFileSync(require('node:path').join(__dirname,'../public/js/game/business-life.js')).toString('base64'));
const {testWorld,input}=require('./helpers');
const {createCharacter}=require('../src/game/state');
const {present}=require('../src/game/present');
test('room state follows server outages/strikes, not efficiency alone; no save mutation',async()=>{
 const {businessLife}=await load(),w=testWorld(),u={meta:{},coins:0,efs_pool:0},s=createCharacter(w,input(w),u);
 const c={id:1,pkey:'baecker',tier:0,name:'Werkstatt',cityId:s.cityId,rooms:3,staff:2,manager:true,cash:100000,base:100000,since:s.day,abandoned:null,lastProfit:0};s.companies.push(c);
 let v=present(w,s,u,Date.now()).companies[0],before=JSON.stringify(v);
 assert.equal(businessLife(v).active,true);assert.equal(businessLife(v).workers,2);assert.equal(JSON.stringify(v),before);
 c.strikeUntil=s.day+4;v=present(w,s,u,Date.now()).companies[0];
 assert.equal(v.operation.strikeDays,4);assert.equal(v.flows.income,0);assert.equal(businessLife(v).active,false);assert.match(businessLife(v).status,/streikt/);
 c.strikeUntil=s.day;c.outageUntil=s.day+8;v=present(w,s,u,Date.now()).companies[0];
 assert.equal(businessLife(v).pace,0);assert.equal(businessLife(v).status,'Produktionsausfall');
 c.outageUntil=s.day;v=present(w,s,u,Date.now()).companies[0];assert.equal(businessLife(v).active,true);
 c.abandoned={day:s.day};v=present(w,s,u,Date.now()).companies[0];assert.equal(businessLife(v).active,false);
});
test('warehouse coverage overrides the raw purchase shortfall; disabling goods and player management remain valid',async()=>{
 const {businessLife}=await load();
 const c={staff:2,owner:true,operation:{managed:true,playerStaff:1},flows:{efficiency:1,lager:{factor:1}},supply:{on:true,factor:.25,needs:[{name:'Mehl',missing:8}],outputs:[]},ops:{stock:{window:'cover'}},profitAll:125};
 let m=businessLife(c);assert.equal(m.supplied,1);assert.equal(m.workers,3);assert.equal(m.pace,1);assert.match(m.status,/Lager/);
 c.flows.lager.factor=.25;c.ops.stock.window='none';m=businessLife(c);assert.equal(m.pace,.25);assert.match(m.why,/Mehl/);
 c.supply.on=false;assert.equal(businessLife(c).supplied,1);
 c.ops.fire={outage:3};assert.equal(businessLife(c).status,'Stillstand nach Brand');assert.equal(businessLife(c).pace,0);
 assert.equal(businessLife(null),null);
});
