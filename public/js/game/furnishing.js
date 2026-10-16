import {html,icon,money,modal,mount,api} from './ui.js';
export function furnishingOf(ctx,building){
  const [type,id]=building.split(':');
  return (type==='prop'?ctx.view.properties:ctx.view.companies)?.find(x=>x.id===Number(id))?.furnishing;
}
export function openFurnishing(ctx,building,{room='main',onChange=()=>{},onClose=()=>{},onVisit=null}={}){
  if(!furnishingOf(ctx,building))return;
  const overflow=document.body.style.overflow;
  let cart=[],busy=false,changed=false,visiting=false,feedback='',error=false;
  const dialog=modal('',{wide:true,onClose:()=>{if(document.querySelector('.interior'))document.body.style.overflow=overflow;onClose(changed&&!visiting);}});
  dialog.el.classList.add('furnish-dialog');dialog.el.setAttribute('aria-labelledby','furnish-title');
  const roomName=(f,id)=>id==='reserve'?'Gebäudereserve':f.rooms.find(r=>r.id===id)?.name||id;
  const exact=cents=>`${(cents/100).toLocaleString(document.documentElement.lang==='en'?'en-US':'de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} ${ctx.view.currency==='EUR'?'€':'DM'}`;
  const draw=()=>{
    const inventoryOpen=!!dialog.el.querySelector('.furnish-inventory')?.open;
    const f=furnishingOf(ctx,building);if(!f){dialog.close();return;}
    if(!f.rooms.some(r=>r.id===room))room=f.rooms[0].id;
    const here=f.rooms.find(r=>r.id===room),count=f.items.filter(i=>i.room===room).length;
    const total=cart.reduce((sum,l)=>sum+(f.catalogue.find(i=>i.key===l.key)?.cost||0)*l.count,0),quantity=cart.reduce((sum,l)=>sum+l.count,0);
    mount(dialog.el,html`<header class="furnish-heading"><div><span class="city-eyebrow">DEIN GEBÄUDE · DEINE EINRICHTUNG</span><h3 id="furnish-title" tabindex="-1">Räume einrichten</h3><p>Möbel und Geräte wählen, Räume zuordnen, gemeinsam bestellen.</p></div><button class="btn ghost" data-close="1" aria-label="Schließen">${icon('x')}</button></header>
      <p class="furnish-feedback ${error?'bad':'good'}" role="status" aria-live="polite">${feedback}</p>
      <nav class="furnish-rooms" aria-label="Raum auswählen">${f.rooms.length>8?html`<label class="furnish-room-chooser">Raum auswählen<select data-furnish-select>${f.rooms.map(r=>html`<option value="${r.id}" ${r.id===room?'selected':''}>${r.name} · ${f.items.filter(i=>i.room===r.id).length}/${r.capacity} Stellplätze</option>`)}</select></label>`:f.rooms.map(r=>html`<button class="btn ${r.id===room?'primary':''}" data-furnish-room="${r.id}" aria-pressed="${r.id===room}">${icon(r.icon)} ${r.name}<small>${f.items.filter(i=>i.room===r.id).length}/${r.capacity}</small></button>`)}</nav>
      <p class="dim small">${here.name}: ${count} von ${here.capacity} zusätzlichen Stellplätzen belegt. Die Grundausstattung bleibt erhalten.</p><button class="btn" data-furnish-visit>${icon('arrow-right')} ${here.name} ansehen</button>
      <div class="furnish-layout"><section aria-label="Einrichtungskatalog"><div class="furnish-catalogue">${f.catalogue.filter(i=>i.rooms.includes(here.kind||room)).map(i=>html`<article class="furnish-card"><div class="furnish-item-title">${icon(i.icon,'lg')}<h4>${i.name}</h4></div><p>${i.description}</p><strong>${money(i.cost,ctx.view.currency)} <small>/ Stück · +1 EFS</small></strong>${!i.available?html`<span class="chip">Ab ${i.fromYear}</span>`:html`<div class="furnish-add"><label>Menge<input type="number" min="1" max="${here.capacity}" step="1" value="1" data-furnish-count="${i.key}" aria-label="Stückzahl ${i.name}"></label><button class="btn" data-furnish-add="${i.key}" ${busy||!f.editable?'disabled':''}>${icon('plus')} Vormerken</button></div>`}</article>`)}</div></section>
      <aside class="furnish-order" aria-label="Geplante Bestellung"><h4>Deine Bestellung</h4>${cart.length?cart.map((l,index)=>html`<div class="furnish-line"><span><b>${l.count} × ${f.catalogue.find(i=>i.key===l.key)?.name}</b><small>${roomName(f,l.room)}</small></span><button class="btn ghost sm" data-furnish-remove="${index}" aria-label="Position entfernen" ${busy?'disabled':''}>${icon('x')}</button></div>`):html`<p class="dim">Wähle links Gegenstände aus. Du kannst mehrere Räume gemeinsam ausstatten.</p>`}<dl class="kv"><dt>Stückzahl / EFS</dt><dd>${quantity} / +${quantity}</dd><dt>Gesamtpreis</dt><dd data-furnish-total>${exact(total)}</dd></dl><button class="btn primary block" data-furnish-order ${busy||!quantity||!f.editable||total>ctx.view.money?'disabled':''}>${busy?'Wird gespeichert …':`${quantity} Stück verbindlich bestellen`}</button>${total>ctx.view.money?html`<p class="neg">Es fehlen ${money(total-ctx.view.money,ctx.view.currency)}.</p>`:''}<p class="small dim">Sofortige Lieferung in die gewählten Räume. Nur erfolgreiche Käufe erzeugen EFS. Einrichtung ersetzt keinen Betriebsausbau.</p></aside></div>
      <details class="furnish-inventory" ${inventoryOpen?'open':''}><summary>Vorhandene Einrichtung · ${f.items.length} Gegenstände</summary><p class="small dim">Umstellen oder Einlagern ist kostenlos und erzeugt keine EFS. In der Gebäudereserve bleiben deine Gegenstände erhalten.</p>${f.items.length?f.items.map(i=>html`<div class="furnish-owned"><span><b>${i.name}</b><small>${roomName(f,i.room)}</small></span><label>Aufstellen in<select data-furnish-destination="${i.id}" aria-label="Zielraum ${i.name}">${i.moveRooms.map(id=>html`<option value="${id}" ${i.room===id?'selected':''}>${roomName(f,id)}</option>`)}<option value="reserve" ${i.room==='reserve'?'selected':''}>Gebäudereserve</option></select></label><button class="btn" data-furnish-move="${i.id}" ${busy||!f.editable?'disabled':''}>Umstellen</button></div>`):html`<p>Noch keine zusätzliche Einrichtung gekauft.</p>`}</details>`);
    dialog.el.setAttribute('aria-busy',String(busy));
  };
  const submit=async(name,input)=>{
    if(busy)return;busy=true;error=false;feedback='';const scroll=dialog.el.scrollTop;draw();
    try{const r=await ctx.act(name,input,{noRender:true,silent:true});feedback=r.message;changed=true;if(name==='furnishingOrder')cart=[];onChange();}
    catch(e){error=true;feedback=e.message||'Die Änderung konnte nicht gespeichert werden.';
      // Never resend a purchase after a lost response. Read the authoritative revision first.
      try{const r=await api('GET','/api/state');if(r.view){ctx.setView(r.view);ctx.hud();onChange();}}catch(_){}
    }finally{busy=false;if(dialog.el.isConnected){draw();dialog.el.scrollTop=scroll;dialog.el.querySelector('#furnish-title').focus({preventScroll:true});}}
  };
  dialog.el.addEventListener('change',e=>{if(!busy&&e.target.matches('[data-furnish-select]')){room=e.target.value;draw();}});
  dialog.el.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||button.disabled||busy)return;
    const f=furnishingOf(ctx,building);if(!f)return;
    if(button.hasAttribute('data-furnish-visit')){visiting=true;dialog.close();if(onVisit){onVisit(room);return;}const [type,id]=building.split(':');const obj=(type==='prop'?ctx.view.properties:ctx.view.companies).find(x=>x.id===Number(id));if(obj){ctx.ui.cityId=obj.cityId;ctx.ui.cityBuilding=building;ctx.ui.interiorRoom=room;ctx.ui.enterBuilding=building;ctx.go('city');}return;}
    if(button.hasAttribute('data-furnish-room')){room=button.dataset.furnishRoom;draw();return;}
    if(button.hasAttribute('data-furnish-remove')){cart.splice(Number(button.dataset.furnishRemove),1);draw();return;}
    if(button.hasAttribute('data-furnish-add')){
      const key=button.dataset.furnishAdd,count=Number(dialog.el.querySelector(`[data-furnish-count="${key}"]`).value),r=f.rooms.find(r=>r.id===room);
      const reserved=cart.filter(l=>l.room===room).reduce((n,l)=>n+l.count,0),used=f.items.filter(i=>i.room===room).length;
      if(!Number.isInteger(count)||count<1||used+reserved+count>r.capacity){feedback=`In ${r.name} sind noch ${Math.max(0,r.capacity-used-reserved)} Stellplätze frei.`;error=true;draw();return;}
      const line=cart.find(l=>l.key===key&&l.room===room);if(line)line.count+=count;else cart.push({key,room,count});feedback='Zur Bestellung hinzugefügt. Noch nicht gekauft.';error=false;draw();return;
    }
    if(button.hasAttribute('data-furnish-order'))submit('furnishingOrder',{building,revision:f.revision,expectedCost:cart.reduce((n,l)=>n+f.catalogue.find(i=>i.key===l.key).cost*l.count,0),lines:cart.map(l=>({...l}))});
    if(button.hasAttribute('data-furnish-move')){const itemId=Number(button.dataset.furnishMove),room=dialog.el.querySelector(`[data-furnish-destination="${itemId}"]`).value;submit('furnishingMove',{building,revision:f.revision,itemId,room});}
  });
  draw();dialog.el.querySelector('#furnish-title').focus({preventScroll:true});return dialog;
}
