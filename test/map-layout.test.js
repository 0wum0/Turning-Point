'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = async () => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../public/js/game/map-layout.js')).toString('base64'));
const catalogue = require('../src/db/places-de.json');
const points = catalogue.rows.map(([name, , lat, lon, pop], i) => ({ c: { id: i, name, pop, tier: 1 }, xy: [(lon - 5.6) * Math.cos(51 * Math.PI / 180) * 62, (55.3 - lat) * 62] }));

test('dense map clusters retain every visible place and keep names and pins apart', async () => {
  const { layoutMarkers } = await load();
  for (const [width,height] of [[1440,860],[832,344],[412,840],[320,565]]) {
    const h=598,w=h*width/height,box={x:(375-w)/2,y:-45,w,h};
    const {markers,scale}=layoutMarkers(points,{box,width,height,home:20,birth:100,owned:new Set([40,60])});
    assert.ok(markers.length < 160);
    const visible=points.filter(p=>{const x=(p.xy[0]-box.x)*scale,y=(p.xy[1]-box.y)*scale;return x>=10 && x<=width-10 && y>=18 && y<=height-10;});
    assert.deepEqual(markers.flatMap(p=>p.members.map(q=>q.c.id)).sort((a,b)=>a-b),visible.map(p=>p.c.id).sort((a,b)=>a-b));
    const labels=markers.filter(p=>p.label).map(p=>p.label.rect);
    for(let i=0;i<markers.length;i++)for(let j=i+1;j<markers.length;j++)assert.ok(Math.hypot(markers[i].sx-markers[j].sx,markers[i].sy-markers[j].sy)>=34);
    for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y));}
  }
});
test('own locations and selected city have priority without losing cluster members', async () => {
  const {layoutMarkers}=await load();
  const data=[1,2,3].map(id=>({c:{id,name:'Ort '+id,pop:id*10000,tier:1},xy:[100,100]}));
  const opts={box:{x:0,y:0,w:300,h:300},width:600,height:600,home:1,owned:new Set([2])};
  assert.equal(layoutMarkers(data,opts).markers[0].c.id,1);
  assert.equal(layoutMarkers(data,{...opts,selected:3}).markers[0].c.id,3);
  assert.equal(layoutMarkers(data,{...opts,filter:'owned'}).markers[0].members.length,2);
});
