'use strict';
const {formatDate,yearOf}=require('./calendar');

// Provisional concept 1.4 timings, stored on acceptance so later balance edits
// cannot shorten or lengthen an already paid contract.
function config(world){
 const c=world.econ.companies.construction||{};
 const years=(n,f,min,max)=>Number.isInteger(n)?Math.max(min,Math.min(max,n)):f;
 return {roomYears:[0,1,2].map(i=>years(c.roomYears?.[i],i+1,1,3)),upgradeYears:years(c.upgradeYears,5,1,10)};
}
function duration(world,c,kind){const cfg=config(world);return 365*(kind==='room'?cfg.roomYears[Math.min(2,c.tier)]:cfg.upgradeYears);}
function paused(world,state,c){
 if(c.abandoned)return 'Betrieb stillgelegt – zuerst reaktivieren.';
 if(!require('./business').qualification(world,state,c.pkey,c.construction?.targetTier??c.tier).ok)return 'Die erforderliche Berufsqualifikation fehlt.';
 return null;
}
function view(world,state,c){
 const p=c.construction;if(!p)return null;
 const remaining=Math.max(0,p.durationDays-p.elapsedDays),reason=paused(world,state,c);
 const paid=Math.round(p.basePaid*world.idx(yearOf(state.day,state.startYear)));
 return {kind:p.kind,title:p.kind==='room'?'Zusätzlicher Betriebsraum':`Umbau zu ${require('./business').chainNames(world,c.pkey)[p.targetTier]}`,
  revision:c.constructionRevision||0,durationDays:p.durationDays,elapsedDays:p.elapsedDays,remainingDays:remaining,
  percent:Math.min(100,Math.floor(p.elapsedDays/p.durationDays*100)),paused:reason,
  finishDate:reason?null:formatDate(state.day+remaining,state.startYear),refund:Math.floor(paid*remaining/p.durationDays),paid,coins:p.coins,
  targetRooms:p.targetRooms,targetTier:p.targetTier};
}
function validate(c,input,fail){
 if(!Number.isSafeInteger(input.constructionRevision)||input.constructionRevision!==(c.constructionRevision||0))fail('Der Bauplan hat sich geändert. Öffne die Bauplanung erneut.');
 if(c.construction)fail('Für diesen Betrieb läuft bereits ein Bauauftrag.');
}
function start(world,state,c,kind,cost,coins){
 const tiers=require('./business').tiersOf(world),targetTier=c.tier+(kind==='upgrade'?1:0);
 c.constructionRevision=(c.constructionRevision||0)+1;
 c.construction={kind,durationDays:duration(world,c,kind),elapsedDays:0,lastDay:state.day,paid:cost,basePaid:cost/world.idx(yearOf(state.day,state.startYear)),coins,
  targetTier,targetRooms:kind==='room'?c.rooms+1:Math.max(c.rooms,tiers[targetTier].rooms),
  baseAdded:Math.round(cost/world.idx(require('./calendar').yearOf(state.day,state.startYear))*(kind==='room'?.8:1))};
 return {msg:`Bauauftrag erteilt: ${view(world,state,c).title}. Bauzeit ${c.construction.durationDays/365} Spieljahre. Der bestehende Betrieb arbeitet weiter.`};
}
function daily({world,state}){
 for(const c of state.companies||[]){
  const p=c.construction;if(!p||p.lastDay>=state.day)continue;
  // One engine day, irrespective of online, offline or EFS advancement.
  c.construction={...p,lastDay:state.day};
  if(paused(world,state,c))continue;
  c.construction.elapsedDays++;
  if(c.construction.elapsedDays<c.construction.durationDays)continue;
  const old=c.name;
  c.rooms=p.targetRooms;c.tier=p.targetTier;c.base+=p.baseAdded;
  if(p.kind==='upgrade')c.name=c.name.replace(/^\S+/,require('./business').chainNames(world,c.pkey)[c.tier].split(' ')[0]);
  delete c.construction;c.constructionRevision=(c.constructionRevision||0)+1;
  const {award,notice,chronicle}=require('./core');
  award(state,'buy_property',`${p.kind==='room'?'room':'tier'}:${c.id}:${p.kind==='room'?c.rooms:c.tier}`);
  chronicle(state,`${old}: ${p.kind==='room'?'zusätzlicher Raum fertiggestellt':`Umbau zu ${c.name} abgeschlossen`}.`,'business');
  notice(state,{level:'good',title:'Bauauftrag abgeschlossen',tab:'business',text:`${c.name}: ${c.rooms} Betriebsräume stehen jetzt zur Verfügung.`});
  if(p.kind==='upgrade')require('./press').story(world,state,'business_expand',{firm:c.name,from:old,cityId:c.cityId});
 }
}
function install(A,fail){
 A.bizCancelConstruction=({world,state,input})=>{
  const c=state.companies.find(c=>c.id===Number(input.id));if(!c?.construction)fail('Kein laufender Bauauftrag vorhanden.');
  if(!Number.isSafeInteger(input.constructionRevision)||input.constructionRevision!==c.constructionRevision)fail('Der Bauplan hat sich geändert. Öffne die Bauplanung erneut.');
  const p=view(world,state,c);
  if(input.expectedRefund!==p.refund)fail('Der Baufortschritt hat sich geändert. Prüfe die aktuelle Erstattung.');
  state.money+=p.refund;state.stats.earned+=p.refund;
  delete c.construction;c.constructionRevision++;
  return {msg:'Bauauftrag abgebrochen. Der ungenutzte Geldanteil wurde erstattet; Coins und verbrauchte Bauleistungen werden nicht erstattet. Es entstehen keine EFS.'};
 };
}
module.exports={config,duration,view,validate,start,daily,install};
