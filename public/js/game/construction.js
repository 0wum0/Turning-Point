import {html,icon,modal,mount,api} from './ui.js';
export function constructionSummary(c){
 const p=c.construction;if(!p)return '';
 return html`<section class="construction-status" aria-label="Baufortschritt"><div class="row spread"><b>${icon('hammer')} ${p.title}</b><strong>${p.percent} %</strong></div><progress max="100" value="${p.percent}" aria-label="Baufortschritt ${p.percent} Prozent"></progress>${p.addedRooms?.length?html`<p class="small">Neue Räume: ${p.addedRooms.length} · ${p.addedRooms.slice(0,3).map(r=>r.name).join(', ')}${p.addedRooms.length>3?' …':''}</p>`:''}<p>${p.paused?html`<span class="warn">Pausiert: ${p.paused}</span>`:html`Voraussichtlich fertig: <b>${p.finishDate}</b>`}</p><p class="small dim">Noch ${p.remainingDays} Spieltage · Ziel: ${p.targetRooms} ${p.kind==='homeRoom'?'Zimmer. Der neue Raum wird nach Fertigstellung betretbar und einrichtbar.':'Betriebsräume. Der bestehende Betrieb arbeitet weiter, sofern er betriebsbereit ist.'}</p></section>`;
}
export function openConstruction(ctx,id,{kind='room',onChange=()=>{},onClose=()=>{}}={}){
 let busy=false,changed=false,error='',cancelReview=false,roomKind='main';
 const overflow=document.body.style.overflow;
 const dialog=modal('',{wide:true,onClose:()=>{if(document.querySelector('.interior'))document.body.style.overflow=overflow;onClose(changed);}});
 dialog.el.classList.add('construction-dialog');dialog.el.setAttribute('aria-labelledby','construction-title');
 const exact=n=>`${(n/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} ${ctx.view.currency==='EUR'?'€':'DM'}`;
 const current=()=>ctx.view.companies.find(c=>c.id===id);
 const draw=()=>{
  const c=current();if(!c){dialog.close();return;}
  const p=c.construction,upgrade=kind==='upgrade',cost=upgrade?c.next?.cost:c.roomCost;
  const coins=upgrade?0:c.roomCoins>0?Math.max(1,Math.ceil(c.roomCoins/2**c.roomStep)):0;
  const days=upgrade?c.constructionTimes.upgradeDays:c.constructionTimes.roomDays;
  const roomTypes=c.constructionRoomTypes||[],selectedRoom=roomTypes.find(r=>r.kind===roomKind);
  const eligible=!c.abandoned&&(upgrade?c.next?.qualified:c.qualified&&c.rooms<c.maxRooms);
  mount(dialog.el,html`<header class="row spread"><div><span class="city-eyebrow">${c.name} · BÜRO</span><h3 id="construction-title" tabindex="-1">Bauplanung</h3></div><button class="btn ghost" data-close="1" aria-label="Schließen">${icon('x')}</button></header><p role="status" class="neg">${error}</p>
   ${p?html`${constructionSummary(c)}<dl class="kv"><dt>Auftragswert zu heutigen Preisen</dt><dd>${exact(p.paid)} + ${p.coins} Coins</dd><dt>Erstattung bei Abbruch heute</dt><dd>${exact(p.refund)}</dd></dl><p>Ein Abbruch entfernt den unfertigen Ausbau. Verbaute Leistungen und Coins werden nicht erstattet. Du erhältst keine EFS.</p>${cancelReview?html`<div class="alert warn">Du gibst diesen Ausbau endgültig auf. Die bisher vorhandenen Räume bleiben erhalten.</div><button class="btn danger" data-cancel-build ${busy?'disabled':''}>Bauauftrag verbindlich abbrechen</button>`:html`<button class="btn" data-review-cancel>Abbruch prüfen</button>`}`:html`
   <div class="row mt" aria-label="Ausbauart"><button class="btn ${!upgrade?'primary':''}" data-build-kind="room" aria-pressed="${!upgrade}">Zusätzlicher Raum</button><button class="btn ${upgrade?'primary':''}" data-build-kind="upgrade" aria-pressed="${upgrade}" ${c.next?'':'disabled'}>Gebäude umbauen</button></div>
   ${!upgrade?html`<p>Wie möchtest du den neuen Raum nutzen?</p><nav class="row" aria-label="Betriebsraum wählen">${roomTypes.map(r=>html`<button class="btn ${r.kind===roomKind?'primary':''}" data-business-room="${r.kind}" aria-pressed="${r.kind===roomKind}">${icon(r.icon)} ${r.name}</button>`)}</nav>`:''}
   <h4>${upgrade?`Umbau zu ${c.next?.name||'höchster Stufe'}`:selectedRoom?.name||'Ein zusätzlicher Betriebsraum'}</h4><dl class="kv"><dt>Bauzeit</dt><dd>${days/365} Spieljahre / ${days} Tage</dd><dt>Preis bei Beauftragung</dt><dd>${exact(cost||0)} + ${coins} Coins</dd><dt>Aktuell nutzbar</dt><dd>${c.rooms} Betriebsräume</dd></dl>
   <ol class="construction-steps"><li><b>Beauftragen</b><span>Preis jetzt bezahlen, Bauzeit und Ziel werden fest vereinbart.</span></li><li><b>Bauen</b><span>Normale Zeit, Offlinezeit und EFS-Vorspulen zählen gleich. Fehlende Qualifikation oder Stilllegung pausieren den Bau.</span></li><li><b>Fertigstellen</b><span>Neue Kapazität und bestehende Ausbaubelohnung werden erst bei Fertigstellung freigeschaltet. Zusätzliche Räume sind dann in V2 einzeln betretbar und einrichtbar.</span></li></ol>
   <p class="small dim">Der Raumtyp bestimmt Einrichtung und Ansicht; Produktionskapazität und Lager-Module folgen weiterhin den bestehenden Betriebsregeln. Beim Stufenumbau entstehen zusätzliche Arbeitsräume passend zum Gewerbe. Ein Auftrag je Betrieb. Bei Abbruch wird nur der noch ungenutzte Geldanteil erstattet; Coins werden nicht erstattet. Möbel und laufende Aufträge bleiben am Gebäude gespeichert.</p>
   ${!eligible?html`<p class="neg">${c.abandoned?'Betrieb zuerst reaktivieren.':upgrade?'Die nächste Stufe benötigt eine höhere Berufsqualifikation.':c.rooms>=c.maxRooms?'Alle Räume dieser Stufe sind ausgebaut.':'Die Berufsqualifikation fehlt.'}</p>`:''}
   <button class="btn primary block" data-start-build ${busy||!eligible||cost>ctx.view.money?'disabled':''}>${busy?'Wird gespeichert …':'Bauauftrag verbindlich erteilen'}</button>`}`);
  dialog.el.setAttribute('aria-busy',String(busy));
 };
 const submit=async(action,input)=>{
  busy=true;error='';draw();
  try{await ctx.act(action,input,{noRender:true,silent:true});changed=true;onChange();cancelReview=false;}
  catch(e){error=e.message;try{const r=await api('GET','/api/state');if(r.view){ctx.setView(r.view);ctx.hud();onChange();}}catch(_){} }
  finally{busy=false;if(dialog.el.isConnected){draw();dialog.el.querySelector('#construction-title')?.focus({preventScroll:true});}}
 };
 dialog.el.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled||busy)return;const c=current();if(!c)return;
  if(b.dataset.businessRoom){roomKind=b.dataset.businessRoom;draw();}
  if(b.dataset.buildKind){kind=b.dataset.buildKind;draw();}
  if(b.hasAttribute('data-review-cancel')){cancelReview=true;draw();}
  if(b.hasAttribute('data-cancel-build'))submit('bizCancelConstruction',{id,constructionRevision:c.constructionRevision,expectedRefund:c.construction.refund});
  if(b.hasAttribute('data-start-build'))submit(kind==='room'?'bizExpand':'bizUpgrade',{id,roomKind,constructionRevision:c.constructionRevision,expectedDays:kind==='room'?c.constructionTimes.roomDays:c.constructionTimes.upgradeDays,expectedCost:kind==='room'?c.roomCost:c.next.cost,expectedCoins:kind==='room'&&c.roomCoins>0?Math.max(1,Math.ceil(c.roomCoins/2**c.roomStep)):0});
 });
 draw();dialog.el.querySelector('#construction-title')?.focus();return dialog;
}
