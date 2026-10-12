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
    const {markers,scale,groups}=layoutMarkers(points,{box,width,height,home:20,birth:100,owned:new Set([40,60])});
    assert.ok(markers.length < 160);
    const visible=points.filter(p=>{const x=(p.xy[0]-box.x)*scale,y=(p.xy[1]-box.y)*scale;return x>=10 && x<=width-10 && y>=18 && y<=height-10;});
    const drawn = new Set(markers.flatMap(p=>p.members.map(q=>q.c.id)));
    assert.ok(visible.every(p=>drawn.has(p.c.id)), 'overscanned groups cover every visible place');
    assert.deepEqual(groups.flatMap(p=>p.members.map(q=>q.c.id)).sort((a,b)=>a-b), points.map(p=>p.c.id).sort((a,b)=>a-b), 'every place belongs to exactly one stable group');
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

test('every label stays bound to its actual city coordinates across zoom and pan', async () => {
  const { layoutMarkers } = await load();
  for (const factor of [1, 2, 4, 8]) {
    const box = { x: 80 / factor, y: 30 / factor, w: 420 / factor, h: 600 / factor };
    const blocked = { x: 220, y: 0, w: 180, h: 200 };
    const layout = layoutMarkers(points, { box, width: 412, height: 800, excluded: [blocked], measure: s => s.length * 8 });
    for (const marker of layout.markers) {
      assert.deepEqual(marker.xy, points[marker.c.id].xy, 'no centroid or displaced marker');
      if (!marker.label) continue;
      const label = marker.label;
      assert.equal(label.cityId, marker.c.id);
      assert.equal(label.text, marker.c.name.length > 23 ? marker.c.name.slice(0, 21) + '…' : marker.c.name);
      assert.equal(label.rect.w, label.text.length * 8 + 12);
      assert.ok(Math.abs(label.edge - (label.rect.x > marker.sx ? 24 : -24)) < .001, 'leader touches the name plate');
      assert.ok(!(label.rect.x < blocked.x + blocked.w && label.rect.x + label.rect.w > blocked.x && label.rect.y < blocked.y + blocked.h && label.rect.y + label.rect.h > blocked.y));
    }
  }
});

test('freight advances with the game clock, clamps to destination and never loops a trip', async () => {
  const { freightProgress, freightPoint } = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../public/js/game/freight-motion.js')).toString('base64'));
  const trip = { days: 4, left: 2 };
  assert.equal(freightProgress(trip, { carry: 0, perMs: 1 / 1000 }, 0), .5);
  assert.equal(freightProgress(trip, { carry: .5, perMs: 1 / 1000 }, 500), .75);
  assert.equal(freightProgress(trip, { perMs: 1 / 1000 }, 99999), 1);
  assert.equal(freightProgress(null), 0);
  assert.equal(freightProgress({ days: 0, left: 0 }), 0);
  assert.deepEqual(freightPoint([0, 10], [40, 30], .5), [20, 20]);
});


test('panning never changes cluster leaders or membership, including viewport edges', async () => {
  const { layoutMarkers } = await load();
  for (const width of [320, 412, 1440]) for (const zoom of [1, 2, 4, 8, 16]) {
    const opts = { width, height: 800, box: { x: 50, y: 20, w: 420 / zoom, h: 600 / zoom }, home: 20, selected: 100, owned: new Set([40]) };
    const original = layoutMarkers(points, opts);
    const signature = groups => groups.map(p => [p.c.id, p.members.map(q => q.c.id)]);
    for (const [dx,dy] of [[1, 1], [57 / original.scale, 40 / original.scale], [-120, 150]]) {
      const shifted = { ...opts, box: { ...opts.box, x: opts.box.x + dx, y: opts.box.y + dy } };
      const result = layoutMarkers(points, shifted);
      assert.deepEqual(signature(result.groups), signature(original.groups));
      assert.deepEqual(layoutMarkers(points, { ...shifted, groups: original.groups }).markers, result.markers, 'cached and fresh layout agree');
    }
  }
});
