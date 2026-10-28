'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=()=>import('data:text/javascript;base64,'+fs.readFileSync(require('node:path').join(__dirname,'../public/js/game/city-family.js')).toString('base64'));
test('city family uses actual residence/status and never controls linked players or missing children',async()=>{
 const {cityFamily}=await load();
 const view={person:{name:'Spieler',age:30},city:{id:1},partner:{name:'Eva',age:30,cohabit:true},children:[
  {id:1,name:'Anna',age:10,cityId:1,status:'home'}, {id:2,name:'Ben',age:3,cityId:1,status:'home'},
  {id:3,name:'Clara',age:13,cityId:1,status:'runaway'}, {id:4,name:'David',age:14,cityId:2,status:'home'},
  {id:5,name:'Ella',age:14,cityId:1,status:'withPartner'}, {id:6,name:'Fritz',age:9,status:'home'},
 ]};
 const before=JSON.stringify(view),roster=cityFamily(view,1);
 assert.deepEqual(roster.filter(a=>a.available).map(a=>a.id),['self','partner:Eva','child:1']);
 assert.equal(JSON.stringify(view),before,'visual selection does not change family state');
 view.partner.linked=true;assert.equal(cityFamily(view,1)[1].available,false);
 view.partner.linked=false;view.partner.cohabit=false;assert.equal(cityFamily(view,1)[1].available,false);
 assert.deepEqual(cityFamily(view,2).filter(a=>a.available).map(a=>a.id),['self','child:4']);
});
test('family routes expose family destinations without granting company or player actions',async()=>{
 const {familyDestination}=await load(),kid={kind:'child'},partner={kind:'partner'};
 for(const kind of ['biz','work','arzt','spielbank','pension'])assert.equal(familyDestination(kid,{type:kind}).allowed,false);
 assert.equal(familyDestination(kid,{type:'schule'}).allowed,true);
 assert.equal(familyDestination(partner,{type:'schule'}).allowed,false);
 assert.equal(familyDestination(kid,{type:'home',own:true}).allowed,false);
 assert.equal(familyDestination(kid,{type:'home',residence:true}).allowed,true);
 assert.equal(familyDestination(partner,{type:'markt'}).allowed,true);
 assert.equal(familyDestination({kind:'self'},{type:'biz'}).allowed,true);
});
test('presenter exposes child city IDs independently from the player residence',()=>{
 const {testWorld,input}=require('./helpers'),{createCharacter}=require('../src/game/state'),{present}=require('../src/game/present');
 const w=testWorld(),user={meta:{},coins:0,efs_pool:0},s=createCharacter(w,input(w),user),other=w.cityList.find(c=>c.id!==s.cityId).id;
 s.children.push({id:1,name:'Anna',gender:'f',born:s.day-10*365,cityId:other,status:'home',sat:70,school:'real'});
 const v=present(w,s,user,Date.now());assert.equal(v.children[0].cityId,other);assert.equal(s.children[0].cityId,other);assert.notEqual(v.children[0].cityId,v.city.id);
});
