'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {testWorld,input}=require('./helpers');
const {createCharacter,upgradeState}=require('../src/game/state');
const actions=require('../src/game/actions'),food=require('../src/game/provisions');
const {advance}=require('../src/game/engine'),{present}=require('../src/game/present');
const {consumption,satiety,effectiveHousing,propertyValue}=require('../src/game/core');
const {applyTownEvents,townEventsOn}=require('../src/game/events');
const biz=require('../src/game/business'),{edition}=require('../src/game/newspaper');
const w=testWorld(),u={meta:{},coins:50,efs_pool:0};
const mk=()=>{const s=createCharacter(w,input(w),u);s.money=900000000;return s;};
const act=(s,n,i={},world=w)=>actions.run(n,{world,state:s,input:i,user:u,now:Date.now()});

test('Vorrat: jeder Klick addiert 100 Einheiten, Qualität gewichtet, Preise und Tagesverbrauch stimmen',()=>{
 const s=mk();food.setStock(s,25);s.meters.fridgeQ=2;const money=s.money,cost=food.price(w,s,3,100);
 act(s,'buyFood',{tier:3});act(s,'buyFood',{tier:3});
 assert.equal(food.stockOf(s),225);assert.equal(s.money,money-cost*2);assert.equal(s.meters.fridge,100);assert.equal(s.foodReserve,125);
 assert.equal(s.meters.fridgeQ,(25*2+200*4)/225);
 const v=present(w,s,u,Date.now());assert.equal(v.food.stock,225);assert.equal(v.food.tiers[3].cost,cost);assert.equal(v.food.days,Math.floor(225/(consumption(s)*satiety(s.meters.fridgeQ))));
 const before=food.stockOf(s),daily=consumption(s)*satiety(s.meters.fridgeQ);advance(w,s,1);
 assert.ok(Math.abs(food.stockOf(s)-(before-daily))<1e-8);assert.equal(s.meters.fridge,100);
 for(const count of [0,-1,366,1.2,'x',Infinity]){const stock=food.stockOf(s),cash=s.money;assert.throws(()=>act(s,'buyFood',{tier:1,count}));assert.equal(food.stockOf(s),stock);assert.equal(s.money,cash);}
});

test('Einzelwaren: Bestand, bezahlter Einkauf, Gesundheit/Energie, Jahresfreigabe und Schlaflimit',()=>{
 const s=mk();s.meters.health=50;s.meters.rest=40;
 const fruit=food.catalogue(w,s).find(i=>i.key==='fruit'),cash=s.money;
 act(s,'buyProvision',{key:'fruit',count:2});assert.equal(s.provisions.fruit,2);assert.equal(s.money,cash-fruit.cost*2);
 act(s,'useProvision',{key:'fruit'});assert.equal(s.provisions.fruit,1);assert.equal(s.meters.health,58);
 assert.throws(()=>act(s,'useProvision',{key:'coffee'}));
 act(s,'buyProvision',{key:'coffee'});act(s,'useProvision',{key:'coffee'});assert.equal(s.meters.rest,55);
 assert.throws(()=>act(s,'buyProvision',{key:'energy'}),/nicht verfügbar/);
 s.day=(1987-s.startYear)*365;act(s,'buyProvision',{key:'energy'});act(s,'useProvision',{key:'energy'});assert.equal(s.meters.rest,80);
 s.housing={type:'street'};assert.throws(()=>act(s,'restNow'),/Schlafplatz/);
 s.housing={type:'pension',base:10};act(s,'restNow');assert.equal(s.meters.rest,100);s.meters.rest=40;assert.throws(()=>act(s,'restNow'),/heute/);
 s.day++;act(s,'restNow');assert.equal(s.meters.rest,75);
});

test('Butler: 365 Tage Haushaltsvorrat, faire Kosten und kein kostenloser Einkauf bei leerem Konto',()=>{
 const s=mk();s.partner={pkey:'helfer',cohabit:true};s.children=[{status:'home',born:s.day-5*365},{status:'home',born:s.day-8*365}];food.setStock(s,0);s.flags.foodTier=3;
 for(let d=0;d<365;d++){
  const before=food.stockOf(s),money=s.money;
  assert.equal(food.replenish(w,s),true);
  const bought=food.stockOf(s)-before;
  if(bought)assert.equal(money-s.money,food.price(w,s,3,bought));else assert.equal(s.money,money);
  food.setStock(s,food.stockOf(s)-consumption(s)*satiety(s.meters.fridgeQ));assert.ok(food.stockOf(s)>0);s.day++;
 }
 s.money=0;food.setStock(s,0);assert.equal(food.replenish(w,s),false);assert.equal(food.stockOf(s),0);
});

test('Versicherte Schäden: keine Unterbrechung, keine dauerhafte Zustandsminderung, Wohnbedarf gedeckt; Jahressperre gilt',()=>{
 for(const type of ['fire','storm']){
  const fw={...w,econ:{...w.econ,events:{...w.econ.events,town:{...w.econ.events.town,weights:{[type]:1},countWeights:[0,1],fireHitChance:1,stormHitChance:1}}}};
  const s=mk(),city=w.city(s.cityId);let day=100;
  while(!townEventsOn(city,day,s.startYear,fw.econ.events).length)day++;
  const run=insured=>{
   const st=mk();st.day=day;st.properties=[{id:1,cityId:st.cityId,name:'Haus',kind:'house_small',rooms:4,base:2000000,condition:90,closedUntil:0}];st.housing={type:'own',propertyId:1};st.insurance.gebaeude=insured;st.interrupts=[];
   const housing=effectiveHousing(st),cash=st.money;applyTownEvents({world:fw,state:st});return {st,housing,cash};
  };
  const {st,housing,cash}=run(true),p=st.properties[0];assert.ok(p.closedUntil>day);assert.equal(p.condition,90);assert.equal(st.money,cash);assert.equal(st.interrupts.length,0);assert.deepEqual(effectiveHousing(st),housing);
  const damageDay=p.lastDamageDay;
  st.day=day+35;while(!townEventsOn(city,st.day,st.startYear,fw.econ.events).length)st.day++;
  applyTownEvents({world:fw,state:st});assert.equal(p.lastDamageDay,damageDay);
  const un=run(false);assert.ok(un.st.money<un.cash);assert.ok(un.st.properties[0].condition<90);if(type==='fire')assert.ok(un.st.interrupts.length>0);
 }
});

test('Fernkauf und Gründung: Zielstadt bestimmt Bestand und Preis, Wohnort bleibt bestehen',()=>{
 const s=mk(),home=s.cityId,city=w.cityList.find(c=>c.id!==home),housing=structuredClone(s.housing);
 const f=biz.foundOptions(w,s,city.id),option=f.options.find(o=>o.pkey==='baecker').tiers[0],cash=s.money;
 act(s,'foundBiz',{pkey:'baecker',tier:0,cityId:city.id,name:'Bäckerei Fernblick'});
 assert.equal(s.companies[0].cityId,city.id);assert.equal(s.money,cash-option.price);assert.equal(s.cityId,home);assert.deepEqual(s.housing,housing);
 assert.throws(()=>act(s,'foundBiz',{pkey:'baecker',tier:0,cityId:-1,name:'Nicht kaufen'}),/Stadt/);
 const ed=edition(w,s,city.id);act(s,'buy',{listingId:ed.housing.sale[0].id});assert.equal(s.properties[0].cityId,city.id);assert.equal(s.cityId,home);
 const listing=ed.biz.find(l=>biz.qualification(w,s,l.pkey,l.tier).ok);assert.ok(listing);act(s,'buyBiz',{listingId:listing.id});assert.equal(s.companies[1].cityId,city.id);
 const v=present(w,s,u,Date.now());assert.equal(v.assetValue,s.properties.reduce((n,p)=>n+propertyValue(w,s,p,v.date.year),0)+biz.netBusinessValue(w,s,v.date.year));
});


test('Altstände und Migration: Vorräte bleiben erhalten, alte Standardrisiken sinken, individuelle Einstellungen bleiben',async()=>{
 const s=mk();delete s.foodReserve;delete s.provisions;s.meters.fridge=43;upgradeState(s);assert.equal(s.meters.fridge,43);assert.equal(s.foodReserve,0);assert.deepEqual(s.provisions,{});
 food.setStock(s,650);s.provisions.coffee=7;upgradeState(s);assert.equal(food.stockOf(s),650);assert.equal(s.provisions.coffee,7);
 const migration=require('../src/db/migrations').MIGRATIONS.find(m=>m.id==='036_household_damage');
 for(const custom of [false,true]){
  const old={events:{town:{stormHitChance:custom?0.003:0.02,fireHitChance:custom?0:0.005}},untouched:{yes:1}};let saved;
  await migration.up[0]({query:async(sql,args)=>sql.startsWith('SELECT')?[{value:JSON.stringify(old)}]:(saved=JSON.parse(args[0]),[])});
  assert.equal(saved.events.town.damageCooldownDays,365);assert.equal(saved.events.town.stormHitChance,custom?0.003:0.005);assert.equal(saved.events.town.fireHitChance,custom?0:0.001);assert.deepEqual(saved.untouched,old.untouched);
 }
});

test('Jahresvorsprung in einem Aufruf: Butler versorgt automatisch, ohne Hunger-Unterbrechung',()=>{
 const s=mk();s.seed=4242;s.housing={type:'own',cityId:s.cityId,propertyId:1};
 s.properties=[{id:1,kind:'villa',name:'Villa',cityId:s.cityId,rooms:15,base:5000000,condition:100,closedUntil:0,bought:0}];
 s.butler={perDay:600,since:0};s.insurance.gebaeude=true;s.flags.foodTier=3;s.life.baseYears=900;
 const before=s.day,money=s.money,result=advance(w,s,365);
 assert.equal(result.advanced,365);assert.equal(result.stopped,null);assert.equal(s.day,before+365);assert.equal(s.hunger,0);assert.ok(food.stockOf(s)>0);assert.ok(s.money<money);
});
