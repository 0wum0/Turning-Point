'use strict';
const {yearOf}=require('./calendar');

// Base prices are provisional 1945 cents. Availability is a game balance rule.
const ITEMS=[
  {key:'bed',name:'Holzbett',icon:'bed',price:18000,fromYear:1945,rooms:['main','bedroom'],types:['prop'],action:'bed',description:'Ein eigener Schlafplatz. Nutzt die vorhandene Schlafaktion.'},
  {key:'table',name:'Esstisch mit Stühlen',icon:'utensils',price:14000,fromYear:1945,rooms:['main','kitchen'],types:['prop','biz'],action:'tables',description:'Ein gedeckter Tisch für Wohn- oder Gastraum.'},
  {key:'cabinet',name:'Vorratsschrank',icon:'package',price:12000,fromYear:1945,rooms:['main','kitchen','stock','office','bedroom'],types:['prop','biz'],action:'stock',description:'Stauraum und handgefertigte Einrichtung für dein Gebäude.'},
  {key:'desk',name:'Schreibtisch',icon:'briefcase',price:22000,fromYear:1945,rooms:['office','main'],types:['prop','biz'],action:'office',description:'Ein Arbeitsplatz für Haushalt oder Betriebsverwaltung.'},
  {key:'stove',name:'Küchenherd',icon:'flame',price:35000,fromYear:1945,rooms:['kitchen'],types:['prop','biz'],action:'stove',description:'Kochstelle mit Töpfen. Vorhandene Koch- und Betriebsaufgaben bleiben erreichbar.'},
  {key:'fryer',name:'Gewerbefritteuse',icon:'utensils',price:45000,fromYear:1955,rooms:['kitchen'],types:['biz'],professions:['wirt'],action:'preparation',description:'Küchengerät für die Gastronomie. Verfügbar ab 1955 als Spielregel.'},
  {key:'fridge',name:'Elektrischer Kühlschrank',icon:'refrigerator',price:80000,fromYear:1955,rooms:['kitchen'],types:['prop','biz'],action:'fridge',description:'Vorräte direkt öffnen. Haushaltsvorräte bleiben gemeinsam verwaltet.'},
  {key:'radio',name:'Radio mit Beistelltisch',icon:'volume-2',price:16000,fromYear:1945,rooms:['main','bedroom','office'],types:['prop','biz'],action:'leisure',description:'Zeittypisches Radio als Einrichtung. Keine zusätzliche automatische Belohnung.'},
];
const integer=(n,fallback,min,max)=>Number.isSafeInteger(n)?Math.max(min,Math.min(max,n)):fallback;
function config(world){const c=world.econ.furnishing||{};return {roomSlots:integer(c.roomSlots,6,1,6),maxItems:48,maxPerOrder:24,items:c.items||{}};}
function catalogue(world,state){
  const cfg=config(world),year=yearOf(state.day,state.startYear),idx=world.idx(year);
  return ITEMS.map(item=>{
    const custom=cfg.items[item.key]||{},basePrice=integer(custom.price,item.price,100,100000000),fromYear=integer(custom.fromYear,item.fromYear,1945,2400);
    return {...item,basePrice,fromYear,cost:Math.max(1,Math.round(basePrice*idx)),available:year>=fromYear};
  });
}
function rooms(type,obj){
  if(type==='prop')return [
    {id:'main',name:'Wohnzimmer',icon:'home',items:['leisure','family','shelf','mail','tidy']},
    {id:'kitchen',name:'Küche',icon:'utensils',items:['fridge','stove']},
    {id:'bedroom',name:'Schlafzimmer',icon:'bed',items:['bed','wardrobe']},
    {id:'office',name:'Arbeitszimmer',icon:'briefcase',items:['desk']},
  ].slice(0,Math.max(1,Math.min(4,(obj.rooms||1)-(obj.extensions||[]).length))).concat((obj.extensions||[]).map(r=>({...r,items:[]})));
  return [
    {id:'main',name:obj.pkey==='wirt'?'Gastraum':obj.pkey==='baecker'?'Backstube':'Werkstatt & Verkauf',icon:'store',items:['cash','tables','safety']},
    ...(obj.pkey==='wirt'?[{id:'kitchen',name:'Küche',icon:'utensils',items:[]}]:[]),
    {id:'stock',name:obj.pkey==='wirt'?'Vorratskeller':'Lager',icon:'package',items:['stock']},
    {id:'office',name:'Büro',icon:'briefcase',items:['office','board']},
  ];
}
function allowed(item,type,obj,room){return item.types.includes(type)&&item.rooms.includes(rooms(type,obj).find(r=>r.id===room)?.kind||room)&&(!item.professions||item.professions.includes(obj.pkey));}
function read(obj){return obj.furnishing||{revision:0,nextId:1,items:[]};}
function value(world,obj,year){
  return read(obj).items.reduce((sum,item)=>sum+Math.max(0,Math.round((item.baseValue||0)*world.idx(year)*.6*Math.max(.2,1-.04*Math.max(0,year-item.boughtYear)))),0);
}
function objectView(world,state,type,obj){
  const saved=read(obj),cfg=config(world),year=yearOf(state.day,state.startYear),cat=catalogue(world,state);
  return {building:`${type}:${obj.id}`,revision:saved.revision,rooms:rooms(type,obj).map(room=>({...room,capacity:cfg.roomSlots})),
    maxItems:cfg.maxItems,maxPerOrder:cfg.maxPerOrder,editable:!obj.abandoned,
    items:saved.items.map(item=>({...item,name:ITEMS.find(x=>x.key===item.key)?.name||item.name,moveRooms:rooms(type,obj).filter(r=>{const def=ITEMS.find(x=>x.key===item.key);return def&&allowed(def,type,obj,r.id);}).map(r=>r.id)})),
    catalogue:cat.filter(item=>item.types.includes(type)&&(!item.professions||item.professions.includes(obj.pkey))),value:value(world,obj,year)};
}
function target(state,key,fail){
  if(typeof key!=='string'||! /^(prop|biz):[1-9]\d*$/.test(key))fail('Wähle ein eigenes Wohngebäude oder einen eigenen Betrieb.');
  const [type,id]=key.split(':'),obj=(type==='prop'?state.properties:state.companies).find(x=>x.id===Number(id));
  if(!obj)fail('Dieses Gebäude gehört dir nicht mehr.');
  if(obj.abandoned)fail('Aktiviere den Betrieb zuerst wieder.');
  return {type,obj};
}
function revision(saved,input,fail){
  if(!Number.isSafeInteger(input.revision)||input.revision<0||input.revision!==saved.revision)fail('Die Einrichtung wurde bereits geändert. Aktualisiere die Ansicht vor einer neuen Bestellung.');
}
function freeSlot(items,room,capacity){for(let slot=0;slot<capacity;slot++)if(!items.some(x=>x.room===room&&x.slot===slot))return slot;return -1;}
function install(A,fail){
  A.furnishingOrder=({world,state,input})=>{
    const {type,obj}=target(state,input.building,fail),saved=read(obj);revision(saved,input,fail);
    const cfg=config(world),plan=rooms(type,obj),cat=catalogue(world,state);
    if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>cfg.maxPerOrder)fail('Wähle Gegenstände und die vorgesehenen Räume.');
    // Validate and plan the complete order before touching money, inventory or effects.
    const items=saved.items.map(x=>({...x}));let nextId=saved.nextId,total=0,quantity=0;
    for(const line of input.lines){
      if(!line||typeof line!=='object'||!Number.isSafeInteger(line.count)||line.count<1||line.count>cfg.maxPerOrder)fail('Die Stückzahl muss eine positive ganze Zahl sein.');
      const item=cat.find(x=>x.key===line.key);
      if(!item||!item.available)fail(item?`${item.name} ist ab ${item.fromYear} verfügbar.`:'Unbekannter Gegenstand.');
      if(!plan.some(r=>r.id===line.room)||!allowed(item,type,obj,line.room))fail('Dieser Gegenstand passt nicht in den ausgewählten Raum.');
      quantity+=line.count;total+=item.cost*line.count;
      if(quantity>cfg.maxPerOrder||items.length+line.count>cfg.maxItems)fail('Für diese Bestellung ist kein Platz mehr im Gebäude.');
      for(let n=0;n<line.count;n++){
        const slot=freeSlot(items,line.room,cfg.roomSlots);
        if(slot<0)fail('In diesem Raum sind alle Stellplätze belegt. Wähle einen anderen Raum oder lagere Einrichtung ein.');
        items.push({id:nextId++,key:item.key,name:item.name,room:line.room,slot,paid:item.cost,baseValue:item.cost/world.idx(yearOf(state.day,state.startYear)),boughtYear:yearOf(state.day,state.startYear)});
      }
    }
    if(!Number.isSafeInteger(input.expectedCost)||input.expectedCost!==total)fail('Der Preis hat sich geändert. Aktualisiere die Bestellung.');
    if(!Number.isSafeInteger(total)||state.money<total)fail('Für die gesamte Bestellung reicht dein Geld nicht.');
    obj.furnishing={revision:saved.revision+1,nextId,items};
    state.money-=total;state.stats.spent+=total;state.fx.efs+=quantity;
    return {msg:`${quantity} ${quantity===1?'Gegenstand':'Gegenstände'} geliefert und aufgestellt · +${quantity} EFS.`,efs:quantity};
  };
  A.furnishingMove=({world,state,input})=>{
    const {type,obj}=target(state,input.building,fail),saved=read(obj);revision(saved,input,fail);
    if(!Number.isSafeInteger(input.itemId))fail('Wähle einen Gegenstand.');
    const item=saved.items.find(x=>x.id===input.itemId),def=ITEMS.find(x=>x.key===item?.key);
    if(!item||!def)fail('Dieser Gegenstand ist nicht vorhanden.');
    if(item.room===input.room)fail('Der Gegenstand steht bereits dort.');
    if(input.room!=='reserve'&&(!rooms(type,obj).some(r=>r.id===input.room)||!allowed(def,type,obj,input.room)))fail('Dieser Gegenstand passt nicht in diesen Raum.');
    const slot=input.room==='reserve'?null:freeSlot(saved.items,input.room,config(world).roomSlots);
    if(slot===-1)fail('In diesem Raum sind alle Stellplätze belegt.');
    obj.furnishing={...saved,revision:saved.revision+1,items:saved.items.map(x=>x.id===item.id?{...x,room:input.room,slot}:x)};
    return {msg:input.room==='reserve'?'Gegenstand eingelagert. Umstellen erzeugt keine EFS.':'Gegenstand umgestellt. Umstellen erzeugt keine EFS.'};
  };
}
module.exports={ITEMS,config,catalogue,rooms,read,value,objectView,install};
