// The 3D city uses the exact same footprints and keys as the playable 2D city.
export async function createCity3D(host, aerial, { onSelect, selected, reduced }) {
  const T = await import('/vendor/three/three.min.js');
  if (!host.isConnected) return null;
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', '3D-Stadt. Ziehen zum Drehen, Mausrad zum Zoomen. Gebäude auch über die Ortsliste auswählen.');
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias:true, alpha:false }); } catch (_) { throw new Error('Die 3D-Stadt ist auf diesem Gerät nicht verfügbar. Die 2D-Ansicht bleibt vollständig spielbar.'); }
  host.append(canvas);
  const scene = new T.Scene(); scene.background = new T.Color(0x273c3c); scene.fog = new T.FogExp2(0x273c3c,.003);
  const camera = new T.PerspectiveCamera(43,1,.1,650), ray = new T.Raycaster(), pointer = new T.Vector2();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap; renderer.outputColorSpace=T.SRGBColorSpace; renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
  const night=aerial.hour<6 || aerial.hour>=21;
  const light = new T.DirectionalLight(night?0xa6bbec:0xffe2b0,night?1.2:2.4); light.position.set(-60,130,60);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-120,right:120,top:90,bottom:-90,near:1,far:300}); light.shadow.normalBias=.12;scene.add(light,new T.HemisphereLight(night?0x899dc1:0xc4e4e7,0x415132,night?1.2:2));
  const unit=.1, toWorld=(x,y)=>new T.Vector3((x-1000)*unit,0,(y-625)*unit);
  const ground=new T.Mesh(new T.PlaneGeometry(200,125),new T.MeshStandardMaterial({color:0x7c9261,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const plinth=new T.Mesh(new T.BoxGeometry(201,2,126),new T.MeshStandardMaterial({color:0x324637,roughness:.9}));plinth.position.y=-1.1;scene.add(plinth);
  let alive=true, raf=0, previous=0, drag=null, focusKey=selected, textureURL;
  // Rasterize the shared terrain once, without changing the underlying location data.
  textureURL=URL.createObjectURL(new Blob([aerial.terrain],{type:'image/svg+xml'}));
  const img=new Image();
  img.onload=()=>{ if(alive){const texture=new T.Texture(img);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;ground.material.map=texture;ground.material.color.set(0xffffff);ground.material.needsUpdate=true;invalidate();} URL.revokeObjectURL(textureURL);textureURL=null;};
  img.onerror=()=>{URL.revokeObjectURL(textureURL);textureURL=null;};img.src=textureURL;
  const instances=aerial.structures || [], transform=new T.Object3D();
  const walls=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0xc7bea0,roughness:.92}),instances.length);
  const roofs=new T.InstancedMesh(new T.ConeGeometry(1,1,4),new T.MeshStandardMaterial({roughness:.8}),instances.length);
  instances.forEach((b,i)=>{const p=toWorld(b.x,b.y), h=b.height*unit;transform.position.set(p.x,h/2,p.z);transform.rotation.set(0,0,0);transform.scale.set(b.w*unit,h,b.d*unit);transform.updateMatrix();walls.setMatrixAt(i,transform.matrix);transform.position.y=h+.6;transform.rotation.y=Math.PI/4;transform.scale.set(b.w*unit*.75,1.2,b.d*unit*.75);transform.updateMatrix();roofs.setMatrixAt(i,transform.matrix);roofs.setColorAt(i,new T.Color(b.roof));});
  walls.castShadow=walls.receiveShadow=roofs.castShadow=true;scene.add(walls,roofs);
  const trees=aerial.vegetation || [];
  const canopy=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:0x547c48,roughness:1}),trees.length);
  trees.forEach((tree,i)=>{const p=toWorld(tree.x,tree.y),r=tree.r*unit;transform.position.set(p.x,r*1.4,p.z);transform.rotation.set(0,i,0);transform.scale.set(r,r*1.4,r);transform.updateMatrix();canopy.setMatrixAt(i,transform.matrix);canopy.setColorAt(i,new T.Color().setHSL(.25+(i%4)*.008,.28,.35+(i%3)*.045));});canopy.castShadow=canopy.receiveShadow=true;scene.add(canopy);
  const buildings=[]; const mat=(c)=>new T.MeshStandardMaterial({color:c,roughness:.8});
  for(const b of aerial.landmarks || []) {
    const group=new T.Group();group.position.copy(toWorld(b.x,b.y));group.userData.key=b.key;const h=b.height*unit;
    const wall=new T.Mesh(new T.BoxGeometry(b.w*unit,h,b.d*unit),mat(0xd8caa6));wall.position.y=h/2;group.add(wall);
    const roof=new T.Mesh(new T.ConeGeometry(1,1,4),mat(b.roof));roof.rotation.y=Math.PI/4;roof.scale.set(b.w*unit*.76,2,b.d*unit*.76);roof.position.y=h+1;group.add(roof);
    const windows=new T.Mesh(new T.BoxGeometry(b.w*unit*.86,.55,.04),night?new T.MeshStandardMaterial({color:0xf6d594,emissive:0xe5ae5b,emissiveIntensity:.55}):mat(0x42666b));windows.position.set(0,h*.65,b.d*unit/2+.025);group.add(windows);
    for(let x=-b.w*unit*.4;x<b.w*unit*.45;x+=1.05){const mullion=new T.Mesh(new T.BoxGeometry(.15,.62,.08),mat(0xd8caa6));mullion.position.set(x,h*.65,b.d*unit/2+.045);group.add(mullion);}
    const door=new T.Mesh(new T.BoxGeometry(.65,1.15,.06),mat(0x495349));door.position.set(0,.575,b.d*unit/2+.04);group.add(door);
    if(b.type==='rathaus'){const tower=new T.Mesh(new T.BoxGeometry(1.8,3,1.8),mat(0xd6c49d));tower.position.y=h+2;group.add(tower);const cap=new T.Mesh(new T.ConeGeometry(1.4,2,4),mat(b.roof));cap.position.y=h+4.5;cap.rotation.y=Math.PI/4;group.add(cap);}
    group.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});scene.add(group);buildings.push(group);
  }
  const labels=document.createElement('div');labels.className='city3d-labels';host.append(labels);
  const pins=(aerial.landmarks || []).map(b=>{const button=document.createElement('button');button.className='city3d-pin';button.dataset.cityKey=b.key;button.dataset.own=String(b.own);button.type='button';button.title=b.name;button.setAttribute('aria-label',b.name);button.innerHTML='<span aria-hidden="true">◆</span><strong></strong>';button.querySelector('strong').textContent=b.name;button.onclick=()=>{focus(b.key);onSelect(b.key);};labels.append(button);const anchor=toWorld(b.x,b.y);anchor.y=b.height*unit+(b.type==='rathaus'?6:3.5);return{button,anchor,key:b.key};});
  const paintPins=()=>{const r=host.getBoundingClientRect();for(const pin of pins){const p=pin.anchor.clone().project(camera);pin.button.hidden=p.z>1 || p.z< -1 || Math.abs(p.x)>.94 || Math.abs(p.y)>.88;pin.button.style.left=`${(p.x+1)*.5*r.width}px`;pin.button.style.top=`${(1-p.y)*.5*r.height}px`;pin.button.setAttribute('aria-pressed',String(pin.key===focusKey));}};
  const ring=new T.Mesh(new T.RingGeometry(1,1.07,64),new T.MeshBasicMaterial({color:0xa6ffd3,side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);
  const traffic=new T.InstancedMesh(new T.BoxGeometry(1.3,.45,.6),new T.MeshStandardMaterial({roughness:.6}),12);
  for(let i=0;i<12;i++)traffic.setColorAt(i,new T.Color([0x526c72,0x7d4e40,0xc4b899,0x41443f][i%4]));scene.add(traffic);
  const paintTraffic=t=>{for(let i=0;i<12;i++){const horizontal=i%2===0, roads=horizontal?aerial.roads.ys:aerial.roads.xs, road=roads[(i*3)%roads.length], span=horizontal?2000:1250, distance=((t*.025+i*173)%span), lane=i%3===0?-4:4, position=lane>0?span-distance:distance, p=horizontal?toWorld(position,road+lane):toWorld(road+lane,position);transform.position.set(p.x,.26,p.z);transform.rotation.set(0,horizontal?0:Math.PI/2,0);transform.scale.set(1,1,1);transform.updateMatrix();traffic.setMatrixAt(i,transform.matrix);}traffic.instanceMatrix.needsUpdate=true;};
  let lastDraw=0; const app=host.closest('#app');
  const wake=()=>{if(document.hidden || app?.inert || !host.getClientRects().length){cancelAnimationFrame(raf);raf=0;previous=0;}else invalidate();};document.addEventListener('visibilitychange',wake);const overlayObserver=new MutationObserver(wake);if(app)overlayObserver.observe(app,{attributes:true,attributeFilter:['inert']});
  const motionMedia=matchMedia('(prefers-reduced-motion: reduce)');motionMedia.addEventListener('change',wake);const motionObserver=new MutationObserver(wake);motionObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
  const target={x:0,z:0,az:.2,el:1.05,dist:110}, shown={...target};
  function focus(key, immediate=false){const b=aerial.landmarks.find(x=>x.key===key);if(!b)return;focusKey=key;const p=toWorld(b.x,b.y);target.x=p.x;target.z=p.z;target.dist=65;ring.position.set(p.x,.12,p.z);ring.scale.set(Math.max(b.w,b.d)*unit*.78,Math.max(b.w,b.d)*unit*.78,1);ring.visible=true;if(immediate)Object.assign(shown,target);invalidate();}
  function invalidate(){if(alive&&!raf&&!document.hidden&&!app?.inert)raf=requestAnimationFrame(render);}
  function render(t){raf=0;if(!alive||!host.isConnected||!host.getClientRects().length||app?.inert)return;const animateTraffic=!reduced();if(animateTraffic && t-lastDraw<33){invalidate();return;}lastDraw=t;paintTraffic(animateTraffic?t:0);const dt=previous?t-previous:16;previous=t;let moving=false;for(const k of Object.keys(target)){const delta=target[k]-shown[k];shown[k]+=delta*(reduced()?1:1-Math.exp(-dt/110));if(Math.abs(delta)>.001)moving=true;else shown[k]=target[k];}const dist=shown.dist*Math.max(1,.85/camera.aspect);camera.position.set(shown.x+dist*Math.cos(shown.el)*Math.sin(shown.az),dist*Math.sin(shown.el),shown.z+dist*Math.cos(shown.el)*Math.cos(shown.az));camera.lookAt(shown.x,0,shown.z);renderer.render(scene,camera);paintPins();if(moving||animateTraffic)invalidate();else previous=0;}
  const resize=()=>{const r=host.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();invalidate();};const observer=new ResizeObserver(resize);observer.observe(host);
  const pts=new Map();let pinch=0;
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);if(pts.size===1)drag={x:e.clientX,y:e.clientY,az:target.az,el:target.el,moved:0};else if(drag)drag.moved=99;};
  canvas.onpointermove=e=>{if(!pts.has(e.pointerId)||!drag)return;pts.set(e.pointerId,[e.clientX,e.clientY]);if(pts.size===2){const[a,b]=[...pts.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch&&d>4)zoom(pinch/d);pinch=d;return;}const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=Math.max(drag.moved,Math.hypot(dx,dy));if(drag.moved>5){target.az=drag.az-dx*.005;target.el=Math.max(.35,Math.min(1.4,drag.el+dy*.004));invalidate();}};
  const end=e=>{if(!drag)return;const click=e.type==='pointerup'&&drag.moved<5;pts.delete(e.pointerId);pinch=0;if(pts.size){const p=[...pts.values()][0];drag={x:p[0],y:p[1],az:target.az,el:target.el,moved:99};return;}drag=null;if(click){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(buildings,true)[0];let obj=hit?.object;while(obj&&!obj.userData.key)obj=obj.parent;if(obj){focus(obj.userData.key);onSelect(obj.userData.key);}}};canvas.onpointerup=end;canvas.onpointercancel=end;
  function zoom(factor){target.dist=Math.max(28,Math.min(190,target.dist*factor));invalidate();}
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-120,Math.min(120,e.deltaY*(e.deltaMode===1?16:1)))*.002));},{passive:false});
  canvas.onkeydown=e=>{if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='-' )zoom(1.2);else if(e.key==='+'||e.key==='=')zoom(.8);else if(e.key==='Home')reset();else{target.az+=(e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0);target.el=Math.max(.35,Math.min(1.4,target.el+(e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0)));invalidate();}}};
  function reset(){Object.assign(target,{x:0,z:0,az:.2,el:1.05,dist:110});invalidate();}
  if(selected)focus(selected,true);resize();
  return {focus,zoom,reset,dispose(){alive=false;cancelAnimationFrame(raf);observer.disconnect();overlayObserver.disconnect();motionObserver.disconnect();motionMedia.removeEventListener('change',wake);document.removeEventListener('visibilitychange',wake);if(textureURL)URL.revokeObjectURL(textureURL);scene.traverse(m=>{m.geometry?.dispose();for(const material of Array.isArray(m.material)?m.material:[m.material]){if(!material)continue;for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}});renderer.dispose();renderer.forceContextLoss();canvas.remove();labels.remove();},get selected(){return focusKey;}};
}
