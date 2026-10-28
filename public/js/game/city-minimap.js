// Stable north-up local map: the same roads/buildings as the rendered city, not the Germany map.
export function createCityMinimap(T, host, aerial, {camera, pan, invalidate, player, actors=[], onActor=()=>{}}) {
  const ns='http://www.w3.org/2000/svg';
  const svgNode=(name,attrs,parent)=>{const el=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));parent?.append(el);return el;};
  const pane=document.createElement('section');pane.className='city-minimap';pane.setAttribute('aria-label','Lokale Stadtübersicht');
  let actorSelect;
  if(actors.length>1){
    pane.classList.add('city-minimap-family');
    const label=document.createElement('label');label.className='city-family-control';label.append('Aktive Person');
    actorSelect=document.createElement('select');actorSelect.setAttribute('aria-label','Person in der Stadt steuern');
    for(const actor of actors){const option=document.createElement('option');option.value=actor.id;option.textContent=`${actor.label}${actor.available?'':` · ${actor.reason}`}`;option.disabled=!actor.available;actorSelect.append(option);}
    actorSelect.value=player().actorId;actorSelect.onchange=()=>onActor(actorSelect.value);label.append(actorSelect);pane.append(label);
  }
  const toggle=document.createElement('button');toggle.type='button';toggle.className='city-minimap-toggle';toggle.textContent='Stadtübersicht';toggle.setAttribute('aria-expanded','true');
  const body=document.createElement('div');body.className='city-minimap-body';
  body.hidden=host.clientWidth<650 || host.clientHeight<320;toggle.setAttribute('aria-expanded',String(!body.hidden));
  const map=svgNode('svg',{viewBox:'0 0 2000 1250',role:'img',tabindex:0,'aria-label':'Stadtkarte. Klicken verschiebt die Kamera. Pfeiltasten verschieben den Ausschnitt, Pos1 zeigt die Spielfigur.'},body);
  svgNode('rect',{width:2000,height:1250,fill:'#203d42'},map);
  if(aerial.river?.length)svgNode('polyline',{points:aerial.river.map(p=>p.join(',')).join(' '),fill:'none',stroke:'#38768a','stroke-width':90},map);
  const roads=svgNode('g',{stroke:'#779397','stroke-width':14,opacity:.7},map);
  for(const x of aerial.roads.xs)svgNode('line',{x1:x,x2:x,y1:0,y2:1250},roads);
  for(const y of aerial.roads.ys)svgNode('line',{x1:0,x2:2000,y1:y,y2:y},roads);
  for(const b of aerial.landmarks)svgNode('rect',{x:b.x-b.w/2,y:b.y-b.d/2,width:b.w,height:b.d,rx:8,fill:b.own?'#d9bc75':'#b2c6c8'},map);
  const view=svgNode('polygon',{class:'city-minimap-view',fill:'#b0ecff','fill-opacity':.10,stroke:'#a9dff2','stroke-width':12,'pointer-events':'none'},map);
  const route=svgNode('polyline',{fill:'none',stroke:'#8ce7ff','stroke-width':17,'pointer-events':'none'},map);
  const dot=svgNode('circle',{class:'city-minimap-player',r:27,fill:'#a7f2ff',stroke:'#0a2534','stroke-width':12,'pointer-events':'none'},map);
  const center=svgNode('circle',{r:17,fill:'none',stroke:'white','stroke-width':10,'pointer-events':'none'},map);
  const footer=document.createElement('div');footer.className='city-minimap-footer';
  const legend=document.createElement('small');legend.innerHTML='<span style="color:#a7f2ff">● Du</span> · ■ Besitz';
  const locate=document.createElement('button');locate.type='button';locate.textContent='Zu mir';locate.setAttribute('aria-label','Kamera zur Spielfigur');footer.append(legend,locate);body.append(footer);pane.append(toggle,body);host.append(pane);
  const locatePlayer=()=>{const p=player();pan(p.x,p.y);};locate.onclick=locatePlayer;
  toggle.onclick=()=>{body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));invalidate();};
  map.onclick=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(map.getScreenCTM().inverse());pan(p.x,p.y);};
  let cx=1000,cy=625;
  map.onkeydown=e=>{const directions={ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]};if(e.key==='Home'){e.preventDefault();locatePlayer();}else if(directions[e.key]){e.preventDefault();const [x,y]=directions[e.key];pan(cx+x,cy+y);}};
  const ray=new T.Raycaster(),hit=new T.Vector3();
  let lastPath='',wasWalking=false;
  return {
    element:pane,
    update(shown) {
      cx=shown.x*10+1000;cy=shown.z*10+625;center.setAttribute('cx',cx);center.setAttribute('cy',cy);
      const p=player();dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y);
      if(actorSelect && p.walking && !wasWalking && host.clientWidth<650){body.hidden=true;toggle.setAttribute('aria-expanded','false');}
      wasWalking=p.walking;
      if(actorSelect){actorSelect.value=p.actorId;locate.textContent=p.kind==='self'?'Zu mir':'Zur Figur';legend.querySelector('span').textContent=p.kind==='self'?'● Du':'● Figur';}
      const points=p.path.map(v=>`${v.x},${v.y}`).join(' ');if(points!==lastPath){route.setAttribute('points',points);lastPath=points;}
      // Clip naturally at the SVG edges; corners above the horizon project to a distant point.
      const corners=[[-1,1],[1,1],[1,-1],[-1,-1]].map(([x,y])=>{
        ray.setFromCamera(new T.Vector2(x,y),camera);
        const t=-ray.ray.origin.y/ray.ray.direction.y;ray.ray.at(t>0?Math.min(t,600):600,hit);
        return `${hit.x*10+1000},${hit.z*10+625}`;
      });view.setAttribute('points',corners.join(' '));
    },
    dispose(){pane.remove();},
  };
}
