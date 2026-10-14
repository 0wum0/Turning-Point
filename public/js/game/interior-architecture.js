/* Enclosed, navigable V2 interiors. Game actions and ownership remain in rooms.js.
 * Each door changes the visible spatial zone, never the player's simulation state. */
import {makeTextures} from './textures.js';
import {signTexture} from './signs.js';

export function roomPlan(b) {
  if(b.type==='home')return [
    {id:'main',name:'Wohnzimmer',icon:'home',items:['leisure','family','shelf','mail','tidy']},
    {id:'kitchen',name:'Küche',icon:'utensils',items:['fridge','stove']},
    {id:'bedroom',name:'Schlafzimmer',icon:'bed',items:['bed','wardrobe']},
    {id:'office',name:'Arbeitszimmer',icon:'briefcase',items:['desk']},
  ].slice(0,Math.max(1,Math.min(4,b.rooms||1)));
  if(b.type==='biz')return [
    {id:'main',name:b.pkey==='wirt'?'Gastraum':b.pkey==='baecker'?'Backstube':'Werkstatt & Verkauf',icon:'store',items:['cash','tables','safety']},
    ...(b.pkey==='wirt'?[{id:'kitchen',name:'Küche',icon:'utensils',items:[]}]:[]),
    {id:'stock',name:b.pkey==='wirt'?'Vorratskeller':'Lager',icon:'package',items:['stock']},
    {id:'office',name:'Büro',icon:'briefcase',items:['office','board']},
  ];
  return [{id:'main',name:({pension:'Gästezimmer',rathaus:'Bürgeramt',bahnhof:'Empfangshalle',markt:'Markthalle',arzt:'Praxis',schule:'Klassenraum',zeitung:'Redaktion',lotto:'Annahmestelle',spielbank:'Spielsaal',work:'Arbeitsplatz'})[b.type]||b.name,icon:'home',items:[]}];
}

export function encloseRoom(T,base,b,ctx,{hour=12}={}) {
  const scene=base.scene,plan=roomPlan(b),{w,d}=base.dims,H=4.25,early=ctx.view.date.eraKey<=2;
  const old=new T.Group();old.name='Classic room';for(const child of [...scene.children])old.add(child);scene.add(old);
  const props=base.props,original=props.children.map(obj=>({obj,pos:obj.position.clone(),rot:obj.rotation.clone(),scale:obj.scale.clone()}));
  props.traverse(m=>{if(m.material?.bumpMap)m.material.bumpScale=Math.min(.045,m.material.bumpScale);});
  const zones=new Map(),hotspots=base.hotspots,TX=makeTextures(T),lights=[],flames=[],solids=[];
  let active='main';
  const assigned=new Map(hotspots.map(h=>[h,plan.find(p=>p.items.includes(h.id))?.id||'main']));
  for(const h of hotspots)h.roomId=assigned.get(h);
  const material=(kind,color,repeat=[1,1])=>{const t=TX.get(kind==='wood'?'oak':kind==='plaster'?'limewash':kind==='tile'?'flagstone':kind,repeat);return new T.MeshStandardMaterial({color,map:t.map,bumpMap:t.bump,bumpScale:kind==='wood'?.012:kind==='brick'?.045:kind==='plaster'?.006:.016,roughness:kind==='metal'?.38:.84,metalness:kind==='metal'?.65:0});};
  const wood=material('wood',early?0x795b3c:0xa68965,[2,1]),trim=material('wood',0x443125),iron=material('metal',0x363b3d),brass=material('metal',0xa57c37),ceramic=material('plaster',0xd2c9b0),cloth=material('fabric',0xd5b17c);
  const box=(parent,wx,hy,dz,mat,x,y,z)=>{const m=new T.Mesh(new T.BoxGeometry(wx,hy,dz),mat);m.position.set(x,y+hy/2,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const cylinder=(p,rt,rb,h,m,x,y,z)=>{const mesh=new T.Mesh(new T.CylinderGeometry(rt,rb,h,24),m);mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;p.add(mesh);return mesh;};
  const sphere=(p,r,m,x,y,z)=>{const mesh=new T.Mesh(new T.SphereGeometry(r,16,12),m);mesh.position.set(x,y,z);mesh.castShadow=true;p.add(mesh);return mesh;};
  const group=(parent,x,y,z,rot=0)=>{const g=new T.Group();g.position.set(x,y,z);g.rotation.y=rot;parent.add(g);return g;};
  const contact=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,2,32,32,32);gr.addColorStop(0,'rgba(15,9,3,.65)');gr.addColorStop(1,'rgba(15,9,3,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new T.CanvasTexture(c);})();
  function grounding(p,x,z,sx,sz){const q=new T.Mesh(new T.PlaneGeometry(sx,sz),new T.MeshBasicMaterial({map:contact,transparent:true,depthWrite:false,opacity:.65}));q.rotation.x=-Math.PI/2;q.position.set(x,.012,z);p.add(q);}
  function bottle(p,x,y,z,col=0x405238){const m=new T.MeshStandardMaterial({color:col,roughness:.24,metalness:.1});cylinder(p,.095,.1,.32,m,x,y,z);cylinder(p,.037,.078,.13,m,x,y+.32,z);cylinder(p,.035,.035,.13,m,x,y+.45,z);box(p,.15,.13,.012,cloth,x,y+.12,z+.098);}
  function pot(p,x,y,z,r=.28){const m=early?brass:iron;const q=new T.Mesh(new T.CylinderGeometry(r,r*.83,.38,28,1,true),m);q.position.set(x,y+.20,z);q.castShadow=true;p.add(q);for(const s of [-1,1]){const h=new T.Mesh(new T.TorusGeometry(.11,.024,8,16),iron);h.position.set(x+s*(r+.045),y+.26,z);p.add(h);}cylinder(p,r*.84,r*.84,.018,new T.MeshStandardMaterial({color:0x402813,roughness:.27}),x,y+.26,z);}
  const flameMap=(()=>{const c=document.createElement('canvas');c.width=64;c.height=128;const g=c.getContext('2d'),grad=g.createLinearGradient(0,12,0,125);grad.addColorStop(0,'rgba(255,166,58,0)');grad.addColorStop(.3,'rgba(250,132,24,.75)');grad.addColorStop(.75,'rgba(255,211,113,.95)');grad.addColorStop(1,'rgba(255,238,180,0)');g.fillStyle=grad;g.beginPath();g.moveTo(30,4);g.bezierCurveTo(49,43,58,55,53,91);g.bezierCurveTo(48,132,11,137,10,97);g.bezierCurveTo(3,64,34,49,30,4);g.fill();return new T.CanvasTexture(c);})();
  function flame(p,x,y,z,size){const f=new T.Sprite(new T.SpriteMaterial({map:flameMap,transparent:true,depthWrite:false,color:0xffffff}));f.position.set(x,y,z);f.scale.set(size,size*2,1);f.userData.height=size*2;p.add(f);flames.push(f);return f;}
  function candle(p,x,y,z){cylinder(p,.12,.19,.06,brass,x,y,z);cylinder(p,.035,.035,.2,brass,x,y+.06,z);cylinder(p,.11,.07,.04,brass,x,y+.26,z);cylinder(p,.045,.052,.27,ceramic,x,y+.30,z);flame(p,x,y+.64,z,.12);}
  function shelf(p,x,z,rot=0,food=false){const g=group(p,x,0,z,rot);solids.push(g);for(const a of [-1,1])box(g,.12,2.7,.46,trim,a*1.25,0,0);for(let r=0;r<4;r++){box(g,2.6,.09,.48,wood,0,.38+r*.6,0);for(let k=0;k<7;k++){if(food&&k%2===0){pot(g,-1.05+k*.33,.47+r*.6,.02,.13);}else bottle(g,-1.05+k*.33,.47+r*.6,.03,[0x424c33,0x62442b,0x303b3b][(k+r)%3]);}}return g;}
  function table(p,x,z,meal=false){const g=group(p,x,0,z);solids.push(g);box(g,2.2,.12,1.25,wood,0,.85,0);for(const a of [-1,1])for(const s of [-1,1])box(g,.105,.85,.105,trim,a*.92,0,s*.47);box(g,1.9,.08,.09,wood,0,.2,0);for(const s of [-1,1]){const chair=group(g,s*.6,0,s*1.04,s<0?Math.PI:0);box(chair,.48,.09,.5,wood,0,.46,0);for(const a of [-1,1])for(const b of [-1,1])box(chair,.055,.47,.055,trim,a*.2,0,b*.2);box(chair,.045,.55,.055,trim,-.2,.46,.22);box(chair,.045,.55,.055,trim,.2,.46,.22);box(chair,.44,.16,.055,wood,0,.83,.22);}
    if(meal){for(const sx of [-.65,.65]){cylinder(g,.21,.18,.027,ceramic,sx,.976,0);pot(g,sx,.99,.35,.09);}candle(g,0,.97,0);bottle(g,.2,.97,-.2);}grounding(p,x,z,3.1,2.7);return g;}
  function fireplace(p,x,z){const g=group(p,x,0,z);solids.push(g);const stone=material('brick',0x756b59,[2,2]);box(g,2.2,.13,1.15,stone,0,0,0);for(const sx of [-.9,.9])box(g,.32,1.7,.85,stone,sx,.13,0);box(g,2.2,.28,.95,stone,0,1.62,0);box(g,1.8,2.35,.6,stone,0,1.9,-.11);box(g,1.4,1.35,.06,iron,0,.14,-.4);for(const sx of [-.34,0,.34]){const log=cylinder(g,.11,.13,.65,trim,sx,.17,0);log.rotation.x=Math.PI/2;flame(g,sx,.55,.13,.38);}const l=new T.PointLight(0xffad63,24,7,2);l.position.set(x,.8,z+.6);p.add(l);lights.push(l);return g;}
  function window(p,x,z,rot){const g=group(p,x,1.35,z,rot),night=hour<6||hour>20;
    box(g,1.95,1.72,.14,trim,0,-.1,-.035);const glass=new T.MeshStandardMaterial({color:night?0x314457:0x9caeb0,emissive:night?0x102b43:0x758d98,emissiveIntensity:night?.25:.65,roughness:.16,metalness:.08});
    box(g,1.69,1.46,.04,glass,0,.03,.05);box(g,.06,1.5,.12,wood,0,.015,.09);box(g,1.72,.065,.12,wood,0,.78,.09);box(g,2.1,.12,.38,wood,0,-.12,.10);
    for(const s of [-1,1]){const curtain=box(g,.27,1.85,.12,cloth,s*1.04,-.17,.18);curtain.rotation.z=s*.035;box(g,.05,.8,.18,trim,s*1.04,.15,.2);}
  }
  function door(p,target,x,z,rot){const g=group(p,x,0,z,rot);box(g,1.48,2.75,.19,trim,0,0,-.03);box(g,1.25,2.58,.15,wood,0,0,.08);for(const y of [.28,1.34]){box(g,1.0,.9,.05,trim,0,y,.17);box(g,.91,.81,.07,wood,0,y+.045,.2);}for(const s of [-1,1])box(g,.14,2.82,.3,trim,s*.75,0,.07);box(g,1.7,.16,.3,trim,0,2.7,.07);sphere(g,.055,brass,.43,1.15,.25);box(g,.2,.03,.08,brass,.36,1.15,.28);const sign=new T.Mesh(new T.PlaneGeometry(1.25,.21),new T.MeshStandardMaterial({map:signTexture(T,target.name,{bg:'#243139',fg:'#ecd9b0',border:'#a58a58'}),roughness:.8}));sign.position.set(0,2.99,.16);g.add(sign);return {obj:g,id:`door-${target.id}`,label:target.name,hint:'Raum betreten',roomId:target.id,door:true,actions:()=>[]};}
  for(const zone of plan){
    const shell=new T.Group();shell.name=zone.name;scene.add(shell);shell.visible=false;const furnishing=new T.Group();shell.add(furnishing);
    const wall=material(zone.id==='stock'?'brick':'plaster',early?0xb7a38a:0xd7d1be,[w/3,1.5]);
    const floor=material(zone.id==='kitchen'||zone.id==='stock'?'tile':'wood',zone.id==='kitchen'?0x827969:early?0x8d704e:0xb59b76,[w/2,d/2]);
    box(shell,w,.15,d,floor,0,-.15,0);box(shell,w+.3,H,.22,wall,0,0,-d/2);box(shell,w+.3,H,.22,wall,0,0,d/2);box(shell,.22,H,d,wall,-w/2,0,0);box(shell,.22,H,d,wall,w/2,0,0);
    box(shell,w,.16,d,material('plaster',early?0x6d5842:0xc7c2ad,[3,3]),0,H,0);
    for(const sx of [-1,1]){box(shell,.12,.32,d,wood,sx*(w/2-.14),0,0);box(shell,w,.32,.12,wood,0,0,sx*(d/2-.14));box(shell,.15,.16,d,trim,sx*(w/2-.15),H-.18,0);box(shell,w,.16,.15,trim,0,H-.18,sx*(d/2-.15));}
    if(early){for(let z=-d/2+.8;z<d/2;z+=1.65)box(shell,w,.22,.18,trim,0,H-.27,z);box(shell,.27,.32,d,trim,0,H-.38,0);}
    window(shell,-w/2+.15,-d*.16,Math.PI/2);window(shell,-w/2+.15,d*.24,Math.PI/2);
    const mainLight=new T.PointLight(early?0xffe2bc:0xffeee0,early?22:32,Math.max(w,d)*1.5,2);mainLight.position.set(0,3.48,0);mainLight.castShadow=false;mainLight.shadow.mapSize.set(512,512);mainLight.shadow.bias=-.0008;mainLight.shadow.normalBias=.025;shell.add(mainLight);
    shell.add(new T.HemisphereLight(hour<6||hour>20?0xc5cee1:0xe7eff3,0x69523b,.64));
    const fill=new T.DirectionalLight(0xd6e5ef,hour<6||hour>20?.3:1.25);fill.castShadow=true;fill.shadow.mapSize.set(1024,1024);fill.shadow.camera.left=-w/2;fill.shadow.camera.right=w/2;fill.shadow.camera.top=d/2;fill.shadow.camera.bottom=-d/2;fill.shadow.bias=-.0005;fill.shadow.normalBias=.025;fill.position.set(-w/2,3,d*.18);fill.target.position.set(0,0,-1);shell.add(fill,fill.target);
    cylinder(shell,.025,.025,.4,iron,0,H-.5,0);const shade=new T.Mesh(new T.ConeGeometry(.49,.33,28,1,true),new T.MeshStandardMaterial({color:0x8c7550,side:T.DoubleSide,roughness:.65}));shade.position.set(0,H-.6,0);shell.add(shade);sphere(shell,.13,new T.MeshBasicMaterial({color:0xffe2ad}),0,H-.75,0);
    const links=zone.id==='main'?plan.slice(1):[plan[0]],doors=links.map((link,i)=>door(shell,link,(i-(links.length-1)/2)*2.5,-d/2+.18,0));
    if(zone.id==='main'&&early&&['home','biz','pension'].includes(b.type))fireplace(shell,w/2-1.45,-d/2+1.05);
    if(zone.id==='kitchen'){
      shelf(shell,-w/2+1.5,-d/2+.55,0,true);shelf(shell,w/2-1.5,-d/2+.55,0,true);
      const cook=group(shell,w/2-1.5,0,-.65,-Math.PI/2);solids.push(cook);box(cook,3.1,.92,.85,iron,0,0,0);box(cook,3.25,.10,.95,iron,0,.92,0);for(const x of [-.95,0,.95]){cylinder(cook,.25,.25,.02,iron,x,1.03,0);pot(cook,x,1.05,0,.25);box(cook,.64,.48,.05,trim,x,.27,.46);box(cook,.45,.055,.085,brass,x,.73,.49);}box(cook,3.4,.18,1.1,iron,0,2.28,0);box(cook,2.8,.75,.8,iron,0,2.46,-.1);box(cook,.68,1.1,.6,iron,0,3.15,-.12);
      const prep=table(shell,-1,0,true);box(prep,.8,.035,.45,wood,0,1.0,0);for(let k=0;k<7;k++)sphere(prep,.09,new T.MeshStandardMaterial({color:k%2?0x929448:0x984738,roughness:.7}),-.34+k*.1,1.08,-.1+(k%3)*.08);
      if(b.type==='biz') {const task=hotspots.find(h=>h.id==='tables');if(task){const h={...task,obj:prep,id:'preparation',label:'Zubereitung',hint:'Betrieb betreuen',roomId:zone.id};hotspots.push(h);assigned.set(h,zone.id);}}
    }else if(zone.id==='stock'){
      shelf(shell,-w/2+1.6,-d/2+.5,0,true);shelf(shell,w/2-1.6,-d/2+.5);shelf(shell,-w/2+.55,0,Math.PI/2,true);
      for(let k=0;k<5;k++){const x=w/2-1.2-(k%2)*1.0,z=-.8+Math.floor(k/2)*1.0;const barrel=group(shell,x,0,z);solids.push(barrel);cylinder(barrel,.37,.4,.9,wood,0,0,0);for(const y of [.12,.68])cylinder(barrel,.405,.405,.055,iron,0,y,0);grounding(shell,x,z,1.2,1.2);}
    }else if(zone.id==='office'){
      shelf(shell,-w/2+1.55,-d/2+.5);const rug=box(shell,w*.55,.018,d*.5,material('carpet',0x634c39,[1,1]),0,.009,.3);rug.castShadow=false;
      const cabinet=group(shell,w/2-1.6,0,-d/2+.45);solids.push(cabinet);box(cabinet,2.5,1.6,.55,wood,0,0,0);for(let i=0;i<4;i++){box(cabinet,2.3,.31,.05,trim,0,.12+i*.36,.30);box(cabinet,.22,.035,.05,brass,0,.24+i*.36,.34);}
      const firm=b.type==='biz'?ctx.view.companies.find(c=>c.id===b.ref):null;
      for(const [i,cert] of (firm?.certificates||[]).entries()){
        const frame=group(shell,-w*.15-i*1.8,2.05,-d/2+.22);
        box(frame,1.5,1.18,.09,trim,0,0,0);box(frame,1.38,1.06,.04,brass,0,.06,.06);
        for(const [j,text]of [cert.title,cert.profession,cert.holder,cert.level].entries()){
          const sheet=new T.Mesh(new T.PlaneGeometry(1.26,.22),new T.MeshStandardMaterial({map:signTexture(T,text,{bg:'#eadfbd',fg:'#24313c',border:'#eadfbd'}),roughness:.9}));sheet.position.set(0,.95-j*.23,.092);frame.add(sheet);
        }
        const h={obj:frame,id:`certificate-${cert.pkey}`,label:`${cert.title} – ${cert.profession}`,hint:cert.holder,roomId:zone.id,
          actions:()=>[{label:`${cert.title}: ${cert.profession}`,sub:`${cert.holder} · ${cert.level}`,disabled:true},{label:'Berufliche Entwicklung ansehen',allowAway:true,run:({go})=>go('work')}]};
        hotspots.push(h);assigned.set(h,zone.id);
      }
    }else if(zone.id==='bedroom'){
      box(shell,w*.52,.018,d*.5,material('carpet',0x77775c),0,.009,0);const bedside=box(shell,.55,.62,.6,wood,-w*.25+1.6,0,-d*.15);candle(shell,bedside.position.x,.64,bedside.position.z);
    }
    zones.set(zone.id,{...zone,shell,furnishing,doors});
  }
  function restore(){for(const s of original){props.add(s.obj);s.obj.position.copy(s.pos);s.obj.rotation.copy(s.rot);s.obj.scale.copy(s.scale);}}
  function setRoom(id){
    if(id!=='overview'&&!zones.has(id))return false;restore();active=id;old.visible=id==='overview';for(const z of zones.values())z.shell.visible=z.id===id;
    if(id==='overview')return true;
    const zone=zones.get(id);
    if(id==='main'){
      for(const s of original){const h=hotspots.find(h=>h.obj===s.obj);if(h&&h.roomId!=='main')continue;zone.furnishing.add(s.obj);}
    }else{
      const items=hotspots.filter(h=>h.roomId===id&&original.some(s=>s.obj===h.obj));
      for(const [i,h]of items.entries()){
        zone.furnishing.add(h.obj);h.obj.rotation.set(0,0,0);
        const placements={bed:[-w*.23,0,-d*.14,Math.PI/2],wardrobe:[w*.25,0,-d*.24,0],fridge:[-w*.35,0,d*.14,Math.PI/2],stove:[w*.18,0,-d*.24,0],desk:[0,0,-d*.15,Math.PI],office:[0,0,-d*.15,Math.PI],stock:[-w*.26,0,0,Math.PI/2],board:[w*.22,1.7,-d/2+.26,0]};
        const a=placements[h.id]||[(i-.5)*2,0,-1,0];h.obj.position.set(a[0],a[1],a[2]);h.obj.rotation.y=a[3];
      }
    }
    scene.background=new T.Color(0x1b1511);return true;
  }
  const activeHotspots=()=>active==='overview'?hotspots.filter(h=>original.some(s=>s.obj===h.obj)):hotspots.filter(h=>h.roomId===active).concat(zones.get(active)?.doors||[]);
  const canMove=(x,z)=>{
    if(Math.abs(x)>w/2-.6||Math.abs(z)>d/2-.6)return false;
    scene.updateMatrixWorld(true);
    const visible=obj=>{for(let p=obj;p;p=p.parent)if(!p.visible)return false;return true;};
    for(const obj of [...original.map(s=>s.obj),...solids].filter(visible)) {
      const bounds=new T.Box3().setFromObject(obj);
      if(bounds.min.y>1.3||bounds.max.y<.15)continue;
      if(x>bounds.min.x-.24&&x<bounds.max.x+.24&&z>bounds.min.z-.24&&z<bounds.max.z+.24)return false;
    }
    return true;
  };
  const startPose=()=>({x:Math.min(w*(active==='main'?.28:.1),w/2-.7),z:d/2-.85,az:active==='main'?-.23:-.12,el:-.04});
  const update=time=>{base.update(time);for(const [i,f]of flames.entries())f.scale.y=f.userData.height*(1+Math.sin(time*.005+i)*.12);for(const [i,l]of lights.entries())l.intensity=24+Math.sin(time*.004+i)*2;};
  setRoom('main');
  return {...base,immersive:true,plan,setRoom,activeRoom:()=>active,activeHotspots,startPose,canMove,update,animated:true,dims:{w,d,ht:H}};
}
