// Local UI fixture only: real presenter/seed data; no database or live accounts.
const R=require('node:path').resolve(__dirname, '../..');
const {testWorld,input}=require(R+'/test/helpers');
const {createCharacter}=require(R+'/src/game/state');
const {present}=require(R+'/src/game/present');
const w=testWorld(),user={coins:25,efs_pool:30,meta:{}};
const state=createCharacter(w,input(w,{firstName:'Reinhard',lastName:'Müller'}),user);
state.money=13000000;
for(let i=0;i<5;i++)state.properties.push({id:i+1,kind:'house_small',name:'Wohnhaus '+(i+1),cityId:w.cityList[i].id,rooms:4,base:2000000,condition:90,closedUntil:0,bought:0});
state.companies.push({id:1,pkey:'baecker',tier:0,name:'Bäckerei Müller',cityId:state.cityId,rooms:3,staff:2,manager:false,cash:100000,base:100000,since:state.day,abandoned:null,lastProfit:0});
const view=present(w,state,user,Date.now());
view.onboarding.welcome=false;
Object.values(view.onboarding.unlocks).forEach(u=>u.open=true);
const states=[...new Set(w.cityList.map(c=>c.state))];
const world={ok:true,states,cityRows:w.cityList.map(c=>[c.id,c.name,states.indexOf(c.state),c.lat,c.lon,c.size_tier,c.price_factor,c.pop||100000,1945]),cityExtra:{},professions:[],academic:[],startProfessions:[],schools:{},adsEnabled:false};
// Merge the production place catalogue with the seeded IDs, as the real importer does.
const places=require(R+'/src/db/places-de.json');
const {tierOf}=require(R+'/src/db/places');
const norm=s=>s.toLowerCase().replace(/ß/g,'ss').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/[^a-z0-9]/g,'');
const existing=new Map(world.cityRows.map(r=>[norm(r[1])+'|'+states[r[2]],r]));
for(const [name,si,lat,lon,pop,since] of places.rows){
 const stateName=places.states[si];if(!states.includes(stateName))states.push(stateName);
 const old=existing.get(norm(name)+'|'+stateName);
 if(old){old[7]=pop;old[8]=since;continue;}
 world.cityRows.push([world.cityRows.length+1,name,states.indexOf(stateName),lat,lon,tierOf(pop),.95,pop,since]);
}
const {edition}=require(R+'/src/game/newspaper');
const placeGame=require(R+'/src/game/places');
const express=require(R+'/node_modules/express'),app=express();
app.use(express.json());
app.use(express.static(R+'/public'));
app.get('/play',(_,res)=>res.send(`<!doctype html><html lang="de" data-era="1"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf-token" content="fixture"><script src="/js/theme.js"></script><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/game.css"><link rel="stylesheet" href="/css/design-v2.css"><link rel="stylesheet" href="/css/motion.css"></head><body class="game"><div id="app"></div><div id="sim-splash" class="sim-splash" role="status">Deine Geschichte beginnt …</div><script type="module" src="/js/game/main.js"></script></body></html>`));
app.get('/api/world',(_,res)=>res.json(world));
app.get('/api/state',(_,res)=>res.json({ok:true,view,coins:25,efsPool:30}));
app.get('/api/map',(_,res)=>res.json({ok:true,properties:view.properties,pickups:[{key:"fixture-spark",cityId:state.cityId,amount:10}],here:view.city.id,birthCityId:view.city.id,activeEfs:{today:0,cap:30}}));
app.get('/api/move-quote',(_,res)=>res.json({ok:true,quote:{km:200,money:10000,coins:5,baseCoins:5}}));
app.get('/api/social/summary',(_,res)=>res.json({ok:true,total:0}));
app.get('/api/live',(_,res)=>{res.set('Content-Type','text/event-stream');res.write('event: hello\ndata: {}\n\n');});
app.post('/api/action/seen',(_,res)=>res.json({ok:true,view}));
app.get('/api/shop',(_,res)=>res.json({ok:true,mode:'off',packages:[],subscription:{enabled:false}}));
app.get('/api/supply/mine',(_,res)=>res.json({ok:true,contracts:[],offers:[]}));
const route = { id: 701, firm: 1, good: 'grain', goodName: 'Getreide', unit: 'kg', from: w.cityList[0].id, fromName: w.cityList[0].name, to: w.cityList[1].id, toName: w.cityList[1].name, qty: 100, interval: 10, mode: 'bahn', active: true, locked: false, status: 'underway', insured: true, smuggle: false, nextIn: 2, trip: { no: 1, modeName: 'Güterbahn', units: 100, days: 4, left: 2, events: [] }, made: { trips: 3, lost: 0, profit: 125000, last: { net: 42000 } } };
const transport = {ok:true,enabled:true,env:{},modes:[{key:'bahn',name:'Güterbahn',speed:220,capKg:20000}],view:{routes:[route],log:[],max:6},eligibleFirms:[{id:1,name:'Bäckerei Müller'}],goods:[],offers:{mine:[],market:[]},trade:{roiCapPct:24},contracts:{}};
app.get('/api/transport',(_,res)=>res.json(transport));
app.post('/api/transport/route/701/active',(req,res)=>{route.active=req.body.on;res.json({ok:true});});
app.get('/api/transport/policy',(_,res)=>res.json({ok:true,enabled:false}));
app.get('/api/archive',(_,res)=>res.json({ok:true,lives:[]}));
app.get('/api/newspaper',(req,res)=>{const id=Number(req.query.cityId)||state.cityId;res.json({ok:true,here:id===state.cityId,edition:edition(w,state,id)});});
app.get('/api/city',(req,res)=>{
 const cityId=Number(req.query.cityId)||state.cityId,row=world.cityRows.find(r=>r[0]===cityId);
 const c=w.city(cityId)||(row?{id:row[0],name:row[1],state:states[row[2]],size_tier:row[5]}:w.city(state.cityId));
 const cityWorld={...w,city:id=>id===c.id?c:w.city(id)};
 const buildings=placeGame.buildingsFor(cityWorld,state,c.id).map(b=>({...b,tasks:placeGame.tasksOf(w,b).map(t=>placeGame.taskStatus(w,state,b,t,Date.now()))}));
 res.json({ok:true,here:cityId===state.cityId,city:{id:c.id,name:c.name,state:c.state,tier:c.size_tier},buildings,playerFirms:[]});
});
app.get('/api/social/leaderboard',(_,res)=>res.json({ok:true,cats:[{key:'wealth',label:'Vermögen'}],cat:'wealth',scope:'all',rows:[],total:0,hint:'Testwelt',unit:'money'}));
app.get('/api/found-options',(req,res)=>res.json({ok:true,found:require(R+'/src/game/business').foundOptions(w,state,Number(req.query.cityId)||state.cityId)}));
for(const action of ['buyFood','buyProvision','useProvision','restNow','foundBiz','bizCollect','bizBank'])app.post('/api/action/'+action,(req,res)=>{
 try {
  const result=require(R+'/src/game/actions').run(action,{world:w,state,user,input:req.body,now:Date.now()});
  if(['bizCollect','bizBank'].includes(action)){user.coins+=state.fx.coins||0;user.efs_pool+=state.fx.efs||0;state.fx.coins=0;state.fx.efs=0;}
  const updated=present(w,state,user,Date.now());updated.onboarding=view.onboarding;Object.assign(view,updated);
  res.json({ok:true,view,coins:user.coins,efsPool:user.efs_pool,message:result.msg});
 } catch(e) {res.status(400).json({ok:false,error:e.message});}
});
app.post('/api/action/taskStart',(_,res)=>res.json({ok:true,view}));
app.post('/api/action/taskFinish',(_,res)=>res.json({ok:true,view,message:'Aufgabe abgeschlossen.',level:'good'}));
app.post('/api/action/collect',(_,res)=>res.json({ok:true,view,coins:25,efsPool:40,message:'+10 EFS'}));
app.get('/api/reputation',(_,res)=>res.json({ok:true,level:0,localLevel:0,score:0,top:[],ledger:[],progress:{next:10,pct:0}}));
app.use('/api',(_,res)=>res.json({ok:true,enabled:false,rows:[],items:[]}));
module.exports = { app, view, world, transport, state, user, gameWorld:w };
