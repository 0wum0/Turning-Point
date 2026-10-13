'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = name => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, `../public/js/game/${name}.js`)).toString('base64'));

test('visited city, newspaper and residence are distinct; returning home is explicit', async () => {
  const { visitCity, rememberCity, newspaperCity } = await load('city-context');
  const initial = { ui:{cityBuilding:'rathaus'} }; rememberCity(initial,1);
  assert.equal(initial.ui.cityBuilding,'rathaus','initial context does not erase a live selection');
  const ctx = { view:{city:{id:1}}, ui:{cityId:1,newsCity:3,cityBox:{},cityBuilding:'biz:5'}, go:route=>ctx.route=route };
  visitCity(ctx, 2, true);
  assert.equal(ctx.route, 'city'); assert.equal(ctx.ui.cityScene, '3d');
  assert.equal(ctx.ui.cityBox, null); assert.equal(ctx.ui.cityBuilding, null);
  assert.equal(newspaperCity(ctx,true), 2); assert.equal(ctx.view.city.id, 1);
  ctx.ui.cityBuilding = 'rathaus'; rememberCity(ctx,2);
  assert.equal(ctx.ui.cityBuilding, 'rathaus', 'same-city refresh preserves building selection');
  ctx.ui.newsCity = 1; assert.equal(newspaperCity(ctx,true),1,'home edition overrides visited city');
  rememberCity(ctx,2); assert.equal(newspaperCity(ctx,true),2,'visiting again sets the local edition');
  delete ctx.ui.newsCity;
  assert.equal(newspaperCity(ctx,false),1,'Classic default is still home');
  assert.equal(newspaperCity(ctx,true),2,'V2 uses the visited city');
});

test('city journey uses real progress and prioritizes urgent server recommendations', async () => {
  const { journeyOf } = await load('journey-model');
  const quests=[{id:'food',done:true},{id:'shelter',done:false,current:true,title:'Unterkunft suchen',why:'Schlafplatz',tab:'newspaper',spot:'listing:home'},{id:'business',done:false,title:'Gründen',tab:'business',spot:'found'},{id:'route',done:true},{id:'friend',done:true}];
  const urgent={id:'health',title:'Gesundheit',cta:{kind:'go',tab:'household'}};
  const view={onboarding:{quests,advisor:{top:urgent}}};
  const before=JSON.stringify(view), journey=journeyOf(view);
  assert.deepEqual(journey.next,urgent);
  assert.equal(journey.done,3); assert.equal(journey.total,5);
  assert.deepEqual(journey.chapters.map(c=>[c.id,c.done,c.total]),[['life',1,2],['craft',0,1],['trade',1,1],['dynasty',1,1]]);
  assert.equal(journey.chapters[1].next.cta.spot,'found');
  assert.equal(JSON.stringify(view),before,'presentation never grants rewards or changes the save');
  view.onboarding.advisor.top={id:'calm'};
  assert.equal(journeyOf(view).next.cta.spot,'listing:home');
  quests.forEach(q=>q.done=true);
  assert.equal(journeyOf(view).next.id,'explore');
});

test('the life path includes every current server quest exactly once', async () => {
  const {journeyOf}=await load('journey-model');
  const {QUESTS}=require('../src/game/onboarding');
  const j=journeyOf({onboarding:{quests:QUESTS}});
  const ids=j.chapters.flatMap(c=>c.ids);
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual([...ids].sort(),QUESTS.map(q=>q.id).sort());
});
