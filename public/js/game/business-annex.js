import {createBatches} from './mesh-batch.js';

// Group completed rooms by use: compact wings instead of dozens of overlapping boxes.
export function businessWings(b){
 const groups=new Map();
 for(const r of b.extensions||[]){if(!groups.has(r.kind))groups.set(r.kind,[]);groups.get(r.kind).push(r.id);}
 return [...groups].map(([kind,roomIds],i)=>({kind,roomIds,bay:i,count:roomIds.length,floors:Math.min(3,Math.ceil(roomIds.length/4))}));
}
export function buildBusinessAnnex(T,b,era,shared){
 const wings=businessWings(b),W=b.w*.1,D=b.d*.1,B=createBatches(T,['wall','roof','glass','trim']),group=new T.Group();
 const modern=era>=4,industrial=['schmied','tischler','installateur','journalist','online_haendler'].includes(b.pkey);
 let height=0;
 for(const wing of wings){
  const w=W*.78/wings.length,d=D*(.19+Math.min(wing.count,12)*.003),x=-W*.39+w*(wing.bay+.5),z=-D*.36,h=wing.floors*1.65;
  const wall=modern?0xc2c8c5:wing.kind==='stock'?0xa16c50:wing.kind==='office'?0xd7bf91:0xb7ab91;
  B.box('trim',w,.28,d,0x6c706b,x,0,z);B.box('wall',w-.06,h,d,wall,x,.28,z);
  const perFloor=Math.min(4,Math.max(1,Math.ceil(wing.count/wing.floors))),ww=Math.min(.7,w/(perFloor+1)*.58);
  for(let floor=0;floor<wing.floors;floor++)for(let k=0;k<perFloor;k++){
   const wx=x-w/2+w*(k+1)/(perFloor+1),wy=.8+floor*1.65,wh=wing.kind==='office'?.85:.58;
   B.box('trim',ww+.16,wh+.16,.08,0x4c4b43,wx,wy-.08,z-d/2-.03);
   B.box('glass',ww,wh,.09,0xffd88a,wx,wy,z-d/2-.06);
   B.box('trim',.045,wh,.1,0x515951,wx,wy,z-d/2-.08);
  }
  if(wing.kind==='stock'){B.box('trim',Math.min(w*.65,1.5),1.25,.10,modern?0x637584:0x66523e,x,.28,z-d/2-.05);for(let j=0;j<4;j++)B.box('wall',Math.min(w*.62,1.4),.035,.12,0x939d96,x,.4+j*.25,z-d/2-.08);}
  if(wing.kind==='kitchen'||(wing.kind==='main'&&['baecker','schmied'].includes(b.pkey))){B.box('trim',.38,1.1,.38,modern?0x7e8689:0x7e4e3b,x+w*.24,.28+h,z);}
  const roof=modern?(industrial&&wing.kind==='main'?'sawtooth':'flat'):'gable';
  if(roof==='gable')B.gable('roof',w+.1,.65,d+.12,industrial?0x535e63:0x994d36,x,.28+h,z);
  else if(roof==='sawtooth')for(let k=0;k<3;k++)B.gable('roof',(w+.1)/3,.45,d+.12,0x6b7c7f,x-w/2+(w/3)*(k+.5),.28+h,z);
  else{B.box('roof',w+.1,.18,d+.12,0x57676c,x,.28+h,z);B.box('trim',.4,.3,.5,0x899597,x,.46+h,z);}
  // Covered connection to the original building; stays inside its reserved plot.
  B.box('wall',Math.min(w*.4,1),1.35,D*.16,wall,x,.28,-D*.18);
  B.box('roof',Math.min(w*.4,1)+.1,.12,D*.17,0x62675b,x,1.63,-D*.18);
  Object.assign(wing,{x,y:.28,z,w,d,h,roof});height=Math.max(height,h+1.4);
 }
 const materials=[];
 for(const layer of ['wall','roof','glass','trim']){const geometry=B.build(layer);if(!geometry)continue;const tx=layer==='roof'?shared.architecture?.roof:layer==='wall'?shared.architecture?.masonry:null;
  if(tx){const P=geometry.attributes.position,N=geometry.attributes.normal,uv=[];for(let i=0;i<P.count;i++){const nx=Math.abs(N.getX(i)),ny=Math.abs(N.getY(i)),nz=Math.abs(N.getZ(i));if(ny>nx&&ny>nz)uv.push(P.getX(i)*.5,P.getZ(i)*.5);else if(nx>nz)uv.push(P.getZ(i)*.5,P.getY(i)*.5);else uv.push(P.getX(i)*.5,P.getY(i)*.5);}geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));}
  const material=layer==='glass'?shared.glassOn:new T.MeshStandardMaterial({vertexColors:true,roughness:.85,side:T.DoubleSide,...(tx?{map:tx.map,bumpMap:tx.bump,bumpScale:.025}:{})});const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);if(layer!=='glass')materials.push(material);}
 B.dispose();return {group,wings,height,materials};
}
