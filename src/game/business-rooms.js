'use strict';
// Spatial use is independent from production balance: the existing room count
// remains the single source of economic capacity, staff needs and income.
const WORKROOMS={
 wirt:'Gastraum',baecker:'Backstube',konditor:'Konditorei',schmied:'Schmiedewerkstatt',tischler:'Holzwerkstatt',
 landwirt:'Wirtschaftsraum',maurer:'Planungsraum',friseur:'Salon',einzelhandelsverkaeufer:'Verkaufsraum',
 reisekaufmann:'Beratungsraum',online_haendler:'Versandraum',fitnesstrainer:'Trainingsraum',journalist:'Redaktion',
 fleischermeister:'Verarbeitungsraum',taxifahrer:'Disposition',installateur:'Montagewerkstatt',gaertner:'Pflanzraum',
};
function types(c){return [
 {kind:'main',name:WORKROOMS[c.pkey]||'Arbeitsraum',icon:'store'},
 {kind:'stock',name:'Lagerraum',icon:'package'},
 {kind:'office',name:'Büro',icon:'briefcase'},
 ...(c.pkey==='wirt'?[{kind:'kitchen',name:'Küche',icon:'utensils'}]:[]),
];}
function planned(c,targetRooms,kind='main'){
 const def=types(c).find(r=>r.kind===kind)||types(c)[0];
 const existing=c.extensions||[];
 const lastId=existing.reduce((n,r)=>Math.max(n,Number(r.id.split(':')[1])||0),0);
 return Array.from({length:Math.max(0,targetRooms-c.rooms)},(_,i)=>({...def,id:`extension:${lastId+i+1}`,name:`${def.name} · Ausbau ${lastId+i+1}`,items:[]}));
}
function complete(c,contract){
 const rooms=contract.addedRooms||planned(c,contract.targetRooms);
 if(rooms.length)c.extensions=[...(c.extensions||[]),...rooms.map(r=>({...r,items:[]}))];
}
module.exports={types,planned,complete};
