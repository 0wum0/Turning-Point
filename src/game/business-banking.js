'use strict';
// An automation belongs to one business, never to an account or profession.
const { yearOf } = require('./calendar');
const { levelIndex, isLearned } = require('./core');
const { LEVELS } = require('./content');
const bounded=(n,fallback,min,max)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Math.floor(Number(n)))):fallback;
function config(world) {
  const c=world.econ.companies.bankAdministration||{};
  return {fromYear:bounded(c.fromYear,1990,1945,2400),coins:bounded(c.unlockCoins,10,1,10000)};
}
function view(world,state,c) {
  const cfg=config(world),year=yearOf(state.day,state.startYear),owned=c.bankAdministration?.unlocked===true;
  return {...cfg,available:year>=cfg.fromYear&&!c.abandoned,unlocked:owned,active:owned&&c.bankAdministration.active===true,
    last:c.bankAdministration?.last||null,manualEfs:1,automaticEfs:0};
}
function certificates(world,state,c) {
  if(!isLearned(state,c.pkey))return [];
  const level=levelIndex(state,c.pkey),profession=world.prof(c.pkey);
  return [{pkey:c.pkey,profession:profession?.name||c.pkey,level:LEVELS[level].name,title:level>=3?'Meisterbrief':'Berufsnachweis',holder:`${state.person.first} ${state.person.last}`}];
}
function automaticTransfers(ctx) {
  const {world,state}=ctx;
  for(const c of state.companies||[]) {
    const bank=view(world,state,c);
    if(!bank.available||!bank.active||!Number.isSafeInteger(c.cash)||c.cash<=0)continue;
    const amount=c.cash;c.cash=0;state.money+=amount;state.stats.earned+=amount;
    c.bankAdministration.last={day:state.day,amount};
    // Deliberately no EFS: automatic activity must never farm the time currency.
  }
}
module.exports={config,view,certificates,automaticTransfers};
