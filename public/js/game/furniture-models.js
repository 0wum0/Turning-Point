// Small, independently disposable models for purchased furniture. No external assets.
export function furnitureModel(T,item){
  const root=new T.Group();root.name=item.name;root.userData.furnishingItemId=item.id;root.userData.furnishingKey=item.key;
  const cv=document.createElement('canvas');cv.width=cv.height=128;const c=cv.getContext('2d');c.fillStyle='#927255';c.fillRect(0,0,128,128);
  for(let n=0;n<80;n++){c.strokeStyle=`rgba(52,28,12,${.04+(n%5)*.02})`;c.beginPath();c.moveTo(n*1.7,0);c.bezierCurveTo(n*1.7+8,35,n*1.7-7,85,n*1.7,128);c.stroke();}
  const grain=new T.CanvasTexture(cv);grain.colorSpace=T.SRGBColorSpace;
  const mat=(color,roughness=.75,metalness=0,map=null)=>new T.MeshStandardMaterial({color,roughness,metalness,map});
  const wood=mat(0x99704c,.78,0,grain),dark=mat(0x483324,.83,0,grain),cloth=mat(0xddd5bf,.95),green=mat(0x526d69,.9),metal=mat(0x657179,.32,.7),enamel=mat(0xe9e7d9,.28,.15),black=mat(0x172328,.6);
  const box=(w,h,d,m,x=0,y=0,z=0,parent=root)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y+h/2,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const cyl=(r,h,m,x,y,z,parent=root)=>{const o=new T.Mesh(new T.CylinderGeometry(r,r,h,20),m);o.position.set(x,y+h/2,z);o.castShadow=true;parent.add(o);return o;};
  const leg=(x,z,h=.75)=>box(.07,h,.07,dark,x,0,z);
  const knob=(x,y,z)=>{const o=new T.Mesh(new T.SphereGeometry(.035,10,8),metal);o.position.set(x,y,z);root.add(o);};
  if(item.key==='bed'){
    box(1.48,.24,2.12,wood,0,.22);for(const x of [-.67,.67])for(const z of [-.95,.95])leg(x,z,.4);
    box(1.42,.24,1.98,cloth,0,.45);box(1.45,.07,1.38,green,0,.68,.26);box(1.51,1.12,.11,wood,0,0,-1.06);box(1.51,.62,.1,wood,0,0,1.06);
    box(.96,.16,.42,cloth,0,.69,-.68);for(const x of [-.55,-.28,0,.28,.55])box(.035,.42,.03,dark,x,.65,-.99);
  }else if(item.key==='table'){
    box(1.6,.10,1.0,wood,0,.77);for(const x of [-.68,.68])for(const z of [-.38,.38])leg(x,z);
    for(const x of [-.5,.5]){
      box(.43,.09,.44,wood,x,.4,.85);for(const dx of [-.16,.16])for(const z of [.69,1.01])leg(x+dx,z,.4);
      box(.45,.38,.06,wood,x,.52,1.02);cyl(.16,.025,enamel,x,.88,0);cyl(.065,.12,enamel,x+.23,.88,-.16);
    }
  }else if(item.key==='cabinet'){
    box(1.36,1.82,.56,wood);for(const y of [.18,.68,1.18,1.72])box(1.27,.06,.61,dark,0,y,.02);
    for(const x of [-.31,.31]){box(.59,1.0,.05,wood,x,.18,.31);knob(x<0?-.08:.08,.7,.36);}
    for(const x of [-.42,0,.42])cyl(.095,.3,green,x,1.24,.12);
  }else if(item.key==='desk'){
    box(1.65,.11,.85,wood,0,.78);for(const x of [-.7,.7])for(const z of [-.31,.31])leg(x,z);
    box(.48,.5,.67,dark,-.48,.23,0);for(const y of [.27,.45,.63]){box(.42,.15,.04,wood,-.48,y,.36);knob(-.48,y+.08,.4);}
    box(.5,.025,.34,cloth,.22,.9,0);cyl(.04,.18,black,.58,.9,-.15);box(.13,.015,.04,dark,.2,.93,.08);
  }else if(item.key==='stove'){
    box(1.18,.88,.77,item.boughtYear>=1970?enamel:dark);box(1.24,.07,.83,metal,0,.88);box(.87,.44,.05,black,0,.24,.4);box(.65,.035,.07,metal,0,.72,.43);
    for(const x of [-.3,.3])for(const z of [-.21,.21]){cyl(.16,.015,black,x,.96,z);}
    for(const x of [-.42,-.15,.15,.42])knob(x,.83,.42);cyl(.19,.22,metal,-.3,.97,-.2);cyl(.20,.025,black,-.3,1.2,-.2);
  }else if(item.key==='fryer'){
    box(.92,.86,.76,metal);box(.99,.07,.82,metal,0,.86);box(.66,.025,.48,black,0,.94,-.04);
    for(const x of [-.18,.18]){box(.29,.14,.36,metal,x,.96,-.04);box(.22,.025,.29,dark,x,1.11,-.04);box(.04,.04,.4,black,x,1.12,.29);}
    box(.75,.22,.05,black,0,.67,.39);for(const x of [-.22,.22])knob(x,.78,.44);for(const x of [-.32,.32])leg(x,-.22,.08);
  }else if(item.key==='fridge'){
    box(.84,1.75,.73,enamel);box(.78,1.06,.05,enamel,0,.08,.39);box(.78,.48,.05,enamel,0,1.19,.39);
    box(.035,.37,.07,metal,-.27,.59,.45);box(.035,.24,.07,metal,-.27,1.3,.45);box(.69,.025,.02,metal,0,1.15,.43);
  }else if(item.key==='radio'){
    box(.92,.08,.55,wood,0,.68);for(const x of [-.36,.36])for(const z of [-.2,.2])leg(x,z,.68);
    box(.75,.44,.29,wood,0,.76);box(.38,.27,.025,dark,-.14,.84,.16);
    for(let n=0;n<7;n++)box(.012,.24,.012,metal,-.3+n*.045,.86,.18);
    box(.2,.1,.025,cloth,.23,1.0,.16);for(const x of [.15,.29])knob(x,.88,.19);
  }
  root.userData.dispose=()=>{const materials=new Set();root.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());grain.dispose();};
  return root;
}
