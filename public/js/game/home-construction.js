import {html,icon,modal,mount,api} from './ui.js';
import {constructionSummary} from './construction.js';
export function openHomeConstruction(ctx,id,{onChange=()=>{},onClose=()=>{}}={}){
 let kind='bedroom',busy=false,changed=false,error='',cancelReview=false;
 const overflow=document.body.style.overflow;
 const dialog=modal('',{wide:true,onClose:()=>{if(document.querySelector('.interior'))document.body.style.overflow=overflow;onClose(changed);}});
 dialog.el.classList.add('construction-dialog');dialog.el.setAttribute('aria-labelledby','home-construction-title');
 const current=()=>ctx.view.properties.find(p=>p.id===id);
 const exact=n=>`${(n/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} ${ctx.view.currency==='EUR'?'€':'DM'}`;
 const draw=()=>{
  const p=current();if(!p){dialog.close();return;}
  const c=p.construction,q=p.constructionOptions.find(q=>q.kind===kind);
  mount(dialog.el,html`<header class="row spread"><div><span class="city-eyebrow">${p.name} · ${p.city}</span><h3 id="home-construction-title" tabindex="-1">Wohnraum erweitern</h3></div><button class="btn ghost" data-close="1" aria-label="Schließen">${icon('x')}</button></header><p class="neg" role="status">${error}</p>
   ${c?html`${constructionSummary(p)}<dl class="kv"><dt>Auftragswert zu heutigen Preisen</dt><dd>${exact(c.paid)}</dd><dt>Erstattung bei Abbruch heute</dt><dd>${exact(c.refund)}</dd></dl><p>Ein Abbruch entfernt den unfertigen Anbau. Bereits verbaute Leistungen werden nicht erstattet.</p>${cancelReview?html`<div class="alert warn">Du gibst diesen Anbau endgültig auf. Bestehende Räume und Möbel bleiben erhalten.</div><button class="btn danger" data-home-cancel ${busy?'disabled':''}>Bauauftrag verbindlich abbrechen</button>`:html`<button class="btn" data-home-review-cancel>Abbruch prüfen</button>`}`:html`
    <p>Wähle einen zusätzlichen Raum. Nach Fertigstellung erreichst du ihn in Design V2 durch den Flur und kannst ihn individuell einrichten.</p>
    <nav class="row mt" aria-label="Raumtyp">${p.constructionOptions.map(o=>html`<button class="btn ${o.kind===kind?'primary':''}" data-home-kind="${o.kind}" aria-pressed="${o.kind===kind}">${icon(o.icon)} ${o.name}</button>`)}</nav>
    <dl class="kv mt"><dt>Bauzeit</dt><dd>${q.durationDays/365} Spieljahre / ${q.durationDays} Tage</dd><dt>Preis bei Beauftragung</dt><dd>${exact(q.cost)}</dd><dt>Nutzbare Zimmer</dt><dd>${p.rooms} → ${p.rooms+1} nach Fertigstellung</dd></dl>
    <ol class="construction-steps"><li><b>Beauftragen</b><span>Preis jetzt bezahlen. Bauzeit und Raumtyp werden fest vereinbart.</span></li><li><b>Bauen</b><span>Normale Zeit, Offlinezeit und EFS-Vorspulen zählen gleich. Schwere Gebäudeschäden pausieren den Bau.</span></li><li><b>Einrichten</b><span>Der fertige Raum bekommt eine eigene Tür und bis zu sechs Möbelstellplätze. Einrichtung kaufst du separat.</span></li></ol>
    <p class="small dim">Ein Bauauftrag je Immobilie. Bestehender Wohnraum bleibt nutzbar, soweit das Gebäude bewohnbar ist. Zusätzliche Kapazität und neue Unterhaltskosten gelten ab Fertigstellung. Bestehende Spieler-Mietverträge behalten ihre vereinbarte Miete. Für diesen Wohnraumausbau werden keine zusätzlichen EFS vergeben.</p>
    ${q.blocked?html`<p class="neg">${q.blocked}</p>`:''}
    <button class="btn primary block" data-home-start ${busy||q.blocked||ctx.view.money<q.cost?'disabled':''}>${busy?'Wird gespeichert …':'Bauauftrag verbindlich erteilen'}</button>${ctx.view.money<q.cost?html`<p class="neg">Es fehlen ${exact(q.cost-ctx.view.money)}.</p>`:''}`}`);
  dialog.el.setAttribute('aria-busy',String(busy));
 };
 const submit=async(action,input)=>{
  busy=true;error='';draw();
  try{await ctx.act(action,input,{noRender:true,silent:true});changed=true;onChange();cancelReview=false;}
  catch(e){error=e.message;try{const r=await api('GET','/api/state');if(r.view){ctx.setView(r.view);ctx.hud();onChange();}}catch(_){} }
  finally{busy=false;if(dialog.el.isConnected){draw();dialog.el.querySelector('#home-construction-title')?.focus({preventScroll:true});}}
 };
 dialog.el.addEventListener('click',e=>{
  const b=e.target.closest('button'),p=current();if(!b||b.disabled||busy||!p)return;
  if(b.dataset.homeKind){kind=b.dataset.homeKind;draw();}
  if(b.hasAttribute('data-home-review-cancel')){cancelReview=true;draw();}
  if(b.hasAttribute('data-home-cancel'))submit('homeCancelConstruction',{propertyId:id,constructionRevision:p.constructionRevision,expectedRefund:p.construction.refund});
  if(b.hasAttribute('data-home-start')){const q=p.constructionOptions.find(q=>q.kind===kind);submit('homeExpand',{propertyId:id,constructionRevision:p.constructionRevision,roomKind:kind,expectedCost:q.cost,expectedDays:q.durationDays});}
 });
 draw();dialog.el.querySelector('#home-construction-title')?.focus();return dialog;
}
