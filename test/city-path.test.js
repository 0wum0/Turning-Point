'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=()=>import('data:text/javascript;base64,'+fs.readFileSync(require('node:path').join(__dirname,'../public/js/game/city-path.js')).toString('base64'));
test('local routes stay on streets, connect snapped destinations and interpolate without cutting corners',async()=>{
 const {streetPoint,streetRoute,routeLength,routePosition}=await load();
 const roads={xs:[100,310,540,910],ys:[80,230,510,700]};
 for(const from of [{x:99,y:100},{x:300,y:110},{x:400,y:230},{x:540,y:440},{x:-50,y:-80}])for(const to of [{x:140,y:600},{x:340,y:240},{x:600,y:690},{x:1200,y:850},from]){
  const path=streetRoute(roads,from,to),start=streetPoint(roads,from),end=streetPoint(roads,to);
  assert.deepEqual(path[0],{x:start.x,y:start.y});assert.deepEqual(path.at(-1),{x:end.x,y:end.y});
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i];assert.ok((a.x===b.x&&roads.xs.includes(a.x))||(a.y===b.y&&roads.ys.includes(a.y)),'each segment is a street');
  }
  const length=routeLength(path);
  for(let d=0;d<length;d+=7){const p=routePosition(path,d);assert.ok(path.some((a,i)=>{const b=path[i+1];return b&&p.x>=Math.min(a.x,b.x)-1e-8&&p.x<=Math.max(a.x,b.x)+1e-8&&p.y>=Math.min(a.y,b.y)-1e-8&&p.y<=Math.max(a.y,b.y)+1e-8;}),'interpolation stays on route');}
  const finished=routePosition(path,length+100);assert.equal(finished.x,end.x);assert.equal(finished.y,end.y);
 }
});
test('same-street routes are direct; parallel streets choose the shortest connecting cross street',async()=>{
 const {streetRoute,routeLength}=await load(),roads={xs:[0,100,200],ys:[0,100,200]};
 assert.deepEqual(streetRoute(roads,{x:0,y:20},{x:0,y:180}),[{x:0,y:20},{x:0,y:180}]);
 assert.equal(routeLength(streetRoute(roads,{x:0,y:40},{x:200,y:60})),300);
 assert.equal(routeLength(streetRoute(roads,{x:40,y:0},{x:60,y:200})),300);
 assert.equal(routeLength(streetRoute(roads,{x:0,y:40},{x:160,y:200})),320);
});
