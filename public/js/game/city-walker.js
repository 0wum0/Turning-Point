import {streetPoint, streetRoute, routeLength, routePosition} from './city-path.js';

/** A visual city avatar. No travel, time, cash or residence mutations are made here. */
export function createCityWalker(T, scene, host, aerial, {start, onPosition = () => {}, reduced, invalidate, actor={id:'self',kind:'self',label:'Du',age:25}, actorPositions={}}) {
  const first = aerial.landmarks.find(b=>b.residence) || aerial.landmarks.find(b=>b.own) || aerial.landmarks[0];
  const positions={self:start,...actorPositions};
  let position = streetPoint(aerial.roads, positions[actor.id] || first), journey = null, disposed = false, phase = 0;
  const person = new T.Group(), figure = new T.Group(); person.add(figure); scene.add(person);
  const coat = new T.MeshStandardMaterial({color:0x367e97,roughness:.85});
  const skin = new T.MeshStandardMaterial({color:0xd5a77a,roughness:.9});
  const dark = new T.MeshStandardMaterial({color:0x25303a,roughness:.9});
  const box = (w,h,d,mat,x,y,z,parent=figure) => { const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat); mesh.position.set(x,y,z); mesh.castShadow=true; parent.add(mesh); return mesh; };
  box(.6,.82,.36,coat,0,1.22,0);
  const head=new T.Mesh(new T.SphereGeometry(.23,8,6),skin); head.position.y=1.93; head.castShadow=true; figure.add(head);
  box(.55,.12,.5,dark,0,2.13,0);
  const limbs=[];
  for(const side of [-1,1]) {
    const leg=new T.Group();leg.position.set(side*.17,.85,0);figure.add(leg);box(.22,.75,.25,dark,0,-.37,0,leg);limbs.push(leg);
    const arm=new T.Group();arm.position.set(side*.41,1.6,0);figure.add(arm);box(.19,.73,.24,coat,0,-.34,0,arm);limbs.push(arm);
  }
  const halo=new T.Mesh(new T.RingGeometry(.7,.94,28),new T.MeshBasicMaterial({color:0x8de8ff,side:T.DoubleSide,depthWrite:false}));
  halo.rotation.x=-Math.PI/2;halo.position.y=.12;person.add(halo);
  const line=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:0x99e9fb,transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide}));line.visible=false;scene.add(line);
  const bar=document.createElement('div');bar.className='city-walk-status';bar.hidden=true;
  const caption=document.createElement('span');caption.setAttribute('role','status');
  const progress=document.createElement('progress');progress.max=1;progress.setAttribute('aria-label','Weg zum Gebäude');
  const skip=document.createElement('button');skip.type='button';skip.textContent='Direkt hinein';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Abbrechen';
  bar.append(caption,progress,skip,cancel);host.append(bar);
  function place() { person.position.set((position.x-1000)*.1,0,(position.y-625)*.1); }
  function remember(){positions[actor.id]={x:position.x,y:position.y};onPosition({...positions[actor.id]},actor.id);}
  function appearance(){figure.scale.setScalar(actor.kind==='child'?Math.min(1,.6+actor.age/45):1);coat.color.setHex(actor.kind==='child'?0xa47638:actor.kind==='partner'?0x95669e:0x367e97);skip.textContent=actor.kind==='self'?'Direkt hinein':'Direkt zum Ziel';}
  function finish(ok) {
    if(!journey)return;
    const current=journey;journey=null;
    if(ok)position={...current.path.at(-1)};
    place();for(const limb of limbs)limb.rotation.x=0;figure.position.y=0;
    line.visible=false;bar.hidden=true;remember();current.resolve(ok);invalidate();
  }
  skip.onclick=()=>finish(true);cancel.onclick=()=>finish(false);place();appearance();
  bar.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}};
  return {
    element:bar,
    setActor(next){if(disposed || next.id===actor.id)return;finish(false);remember();actor=next;position=streetPoint(aerial.roads,positions[actor.id]||first);place();appearance();invalidate();},
    cancel(){finish(false);},
    walkTo(key) {
      if(disposed)return Promise.resolve(false);
      const b=aerial.landmarks.find(b=>b.key===key);if(!b)return Promise.resolve(false);
      finish(false);
      const path=streetRoute(aerial.roads,position,b),length=routeLength(path);
      if(reduced() || length<1){position={...path.at(-1)};place();remember();invalidate();return Promise.resolve(true);}
      const vertices=[];
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],l=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/l*.12,nz=(b.x-a.x)/l*.12;
        const point=(p,side)=>[(p.x-1000)*.1+side*nx,.17,(p.y-625)*.1+side*nz];
        vertices.push(...point(a,-1),...point(a,1),...point(b,1),...point(a,-1),...point(b,1),...point(b,-1));
      }
      line.geometry.dispose();line.geometry=new T.BufferGeometry();line.geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));line.visible=true;
      caption.textContent=`${actor.label} → ${b.name}`;progress.value=0;bar.hidden=false;
      return new Promise(resolve=>{journey={key,path,length,elapsed:0,duration:Math.min(4200,Math.max(1600,length*5)),resolve};invalidate();});
    },
    update(dt) {
      if(!journey)return false;
      if(reduced()){finish(true);return false;}
      journey.elapsed+=dt;const ratio=Math.min(1,journey.elapsed/journey.duration);
      position=routePosition(journey.path,journey.length*ratio);place();figure.rotation.y=position.angle;
      phase+=dt*.012;limbs.forEach((limb,i)=>{limb.rotation.x=Math.sin(phase+(i===0||i===3?0:Math.PI))*.48;});
      figure.position.y=Math.abs(Math.sin(phase))*.055;progress.value=ratio;
      if(ratio===1)finish(true);
      return !!journey;
    },
    snapshot(){return {x:position.x,y:position.y,actorId:actor.id,label:actor.label,kind:actor.kind,walking:!!journey,destination:journey?.key || null,path:journey?.path || []};},
    dispose(){disposed=true;finish(false);remember();bar.remove();},
  };
}
