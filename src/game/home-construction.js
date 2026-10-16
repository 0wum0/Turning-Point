'use strict';
const {yearOf,formatDate}=require('./calendar');
const TYPES=[{kind:'bedroom',name:'Schlafzimmer',icon:'bed'},{kind:'office',name:'Arbeitszimmer',icon:'briefcase'},{kind:'main',name:'Wohnzimmer',icon:'home'}];
const bounded=(n,f,min,max)=>Number.isSafeInteger(n)?Math.max(min,Math.min(max,n)):f;
function config(world){const c=world.econ.homeConstruction||{};return {maxExtensions:bounded(c.maxExtensions,4,1,4),pricePct:bounded(c.pricePct,50,10,200),years:Object.fromEntries(TYPES.map((t,i)=>[t.kind,bounded(c.years?.[t.kind],i+1,1,3)]))};}
function paused(state,p){return p.closedUntil>state.day||p.condition<30?'Gebäude beschädigt – zuerst instand setzen.':null;}
function options(world,state,p){
 const cfg=config(world),template=world.econ.property[p.kind],year=yearOf(state.day,state.startYear);
 const blocked=paused(state,p)||((p.extensions||[]).length>=cfg.maxExtensions?'Alle zusätzlichen Räume sind ausgebaut.':null);
 const cost=template?Math.max(1,Math.round(template.price/template.rooms*cfg.pricePct/100*world.idx(year)*(world.city(p.cityId)?.price_factor||1)*require('./cityecon').buildMult(p.cityId,year))):0;
 return TYPES.map(t=>({...t,cost,durationDays:cfg.years[t.kind]*365,blocked:blocked||(!template?'Gebäudetyp nicht ausbaubar.':null)}));
}
function view(world,state,p){
 const c=p.construction;if(!c)return null;
 const remaining=Math.max(0,c.durationDays-c.elapsedDays),reason=paused(state,p),paid=Math.round(c.basePaid*world.idx(yearOf(state.day,state.startYear)));
 return {kind:'homeRoom',title:`Anbau: ${c.room.name}`,revision:p.constructionRevision||0,durationDays:c.durationDays,elapsedDays:c.elapsedDays,remainingDays:remaining,percent:Math.min(100,Math.floor(c.elapsedDays/c.durationDays*100)),paused:reason,finishDate:reason?null:formatDate(state.day+remaining,state.startYear),refund:Math.floor(paid*remaining/c.durationDays),paid,coins:0,targetRooms:c.targetRooms};
}
function daily({world,state}){
 for(const p of state.properties||[]){
  const c=p.construction;if(!c||c.lastDay>=state.day)continue;
  p.construction={...c,lastDay:state.day};
  if(paused(state,p))continue;
  if(++p.construction.elapsedDays<c.durationDays)continue;
  // Replace nested containers: an inherited property may still share old-life arrays.
  p.extensions=[...(p.extensions||[]),{...c.room,items:[]}];p.rooms=c.targetRooms;p.base+=c.baseAdded;
  delete p.construction;p.constructionRevision=(p.constructionRevision||0)+1;
  const {notice,chronicle}=require('./core');
  chronicle(state,`${p.name}: ${c.room.name} fertiggestellt.`,'housing');
  notice(state,{level:'good',title:'Neuer Raum fertig',tab:'housing',text:`${p.name}: ${c.room.name} ist jetzt betretbar und einrichtbar. Insgesamt ${p.rooms} Zimmer.`});
 }
}
function install(A,fail){
 const target=(state,input)=>{const p=state.properties.find(x=>x.id===Number(input.propertyId));if(!p)fail('Diese Immobilie gehört dir nicht.');if(!Number.isSafeInteger(input.constructionRevision)||input.constructionRevision!==(p.constructionRevision||0))fail('Der Bauplan hat sich geändert. Öffne die Bauplanung erneut.');return p;};
 A.homeExpand=({world,state,input})=>{
  const p=target(state,input);if(p.construction)fail('Für diese Immobilie läuft bereits ein Bauauftrag.');
  const q=options(world,state,p).find(x=>x.kind===input.roomKind);if(!q)fail('Wähle einen gültigen Raumtyp.');if(q.blocked)fail(q.blocked);
  if(input.expectedCost!==q.cost||input.expectedDays!==q.durationDays)fail('Baupreis oder Bauzeit haben sich geändert. Öffne die Bauplanung erneut.');
  if(state.money<q.cost)fail('Für diesen Ausbau reicht dein Geld nicht.');
  const n=(p.extensions||[]).length+1,basePaid=q.cost/world.idx(yearOf(state.day,state.startYear));
  state.money-=q.cost;state.stats.spent+=q.cost;p.constructionRevision=(p.constructionRevision||0)+1;
  p.construction={durationDays:q.durationDays,elapsedDays:0,lastDay:state.day,basePaid,baseAdded:Math.round(basePaid*.8),targetRooms:p.rooms+1,room:{id:`extension:${n}`,kind:q.kind,name:`${q.name} · Anbau ${n}`,icon:q.icon}};
  return {msg:`Bauauftrag erteilt: ${q.name}. ${q.durationDays/365} Spieljahre Bauzeit. Der neue Raum wird bei Fertigstellung nutzbar.`};
 };
 A.homeCancelConstruction=({world,state,input})=>{
  const p=target(state,input);if(!p.construction)fail('Kein laufender Bauauftrag vorhanden.');const c=view(world,state,p);
  if(input.expectedRefund!==c.refund)fail('Der Baufortschritt hat sich geändert. Prüfe die aktuelle Erstattung.');
  state.money+=c.refund;state.stats.earned+=c.refund;delete p.construction;p.constructionRevision++;
  return {msg:'Bauauftrag abgebrochen. Der ungenutzte Geldanteil wurde erstattet. Vorhandene Räume und Möbel bleiben erhalten.'};
 };
}
module.exports={config,options,view,daily,install};
