'use strict';
const ITEMS = [
  {key:'bread',name:'Brotzeit',icon:'sandwich',price:60,food:12,health:2,rest:0,from:1945},
  {key:'fruit',name:'Obst & Gemüse',icon:'apple',price:90,food:8,health:8,rest:0,from:1945},
  {key:'meal',name:'Warme Mahlzeit',icon:'utensils',price:180,food:20,health:6,rest:8,from:1945},
  {key:'water',name:'Wasser',icon:'glass-water',price:20,food:0,health:2,rest:3,from:1945},
  {key:'coffee',name:'Kaffee',icon:'coffee',price:75,food:0,health:0,rest:15,from:1945},
  {key:'energy',name:'Energy-Drink',icon:'zap',price:140,food:0,health:0,rest:25,from:1987},
];
const stockOf = s => Math.max(0, Number(s.meters.fridge)||0) + Math.max(0, Number(s.foodReserve)||0);
function setStock(s,n) { n=Math.max(0,n); s.meters.fridge=Math.min(100,n); s.foodReserve=Math.max(0,n-100); }
function addStock(s,units,quality) {
  const old=stockOf(s), total=old+units;
  s.meters.fridgeQ=total ? (old*s.meters.fridgeQ+units*quality)/total : quality;
  setStock(s,total); s.hunger=0;
}
function price(world,s,tier,units) {
  const year=require('./calendar').yearOf(s.day,s.startYear);
  return Math.max(1,Math.round(world.econ.food[tier].perPct*units*world.idx(year)*require('./core').foodFactor(world,s,year)));
}
function itemPrice(world,s,item) {
  const year=require('./calendar').yearOf(s.day,s.startYear);
  return Math.max(1,Math.round(item.price*world.idx(year)*require('./core').foodFactor(world,s,year)));
}
function catalogue(world,s) {
  const year=require('./calendar').yearOf(s.day,s.startYear);
  return ITEMS.filter(i=>i.from<=year).map(i=>({...i,cost:itemPrice(world,s,i),count:Math.max(0,Number(s.provisions?.[i.key])||0)}));
}
/** Daily replenishment works during manual fast-forward and offline progression. */
function replenish(world,s,days=30) {
  const {consumption,satiety}=require('./core');
  const rate=consumption(s)*satiety(s.meters.fridgeQ);
  if(stockOf(s)>=rate*7)return true;
  for(let tier=Math.min(3,s.flags.foodTier??1);tier>=0;tier--) {
    const target=Math.max(100,Math.ceil(consumption(s)*satiety(tier+1)*days));
    const units=Math.max(0,target-stockOf(s)), cost=price(world,s,tier,units);
    if(units>0 && s.money>=cost) { s.money-=cost;s.stats.spent+=cost;addStock(s,units,tier+1);return true; }
  }
  // A smaller purchase can keep a modest household supplied without requiring a month's cash in advance.
  if(stockOf(s)>=rate*2)return true;
  const units=Math.max(1,Math.ceil(consumption(s)*satiety(1)*2-stockOf(s))),cost=price(world,s,0,units);
  if(s.money>=cost) {s.money-=cost;s.stats.spent+=cost;addStock(s,units,1);return true;}
  return false;
}
module.exports={ITEMS,stockOf,setStock,addStock,price,itemPrice,catalogue,replenish};
