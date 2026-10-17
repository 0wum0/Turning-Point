import {html,icon,mount,money} from './ui.js';
import {cityOf,cityLabel} from './places.js';
import {rememberCity} from './city-context.js';
import {project,VIEW} from './germany.js';
import {GEOGRAPHY} from './map-geography.js';

// One navigation component for country, city and interior. Only navigation:
// inspecting a remote property never moves the character or changes residence.
export function mountPossessions(host,ctx,{surface='city',cityId,building=null,beforeNavigate=()=>{}}={}){
 const nav=document.createElement('nav');nav.className='possession-nav';nav.dataset.surface=surface;nav.setAttribute('aria-label','Besitz und Spielwelt');
 nav.innerHTML='<details class="possession-menu"><summary>Besitz & Familie</summary><section class="possession-panel" aria-label="Dein Besitz"></section></details><button class="possession-location" data-pos-city></button><div class="possession-utilities"><button data-pos-map aria-label="Landkarte">'+icon('map').__raw+'</button><button data-pos-paper aria-label="Zeitung">'+icon('newspaper').__raw+'</button><button data-pos-shop aria-label="Shop">'+icon('coins').__raw+'</button></div>';
 host.prepend(nav);host.classList.add('has-possession-nav');
 const menu=nav.querySelector('details'),panel=nav.querySelector('.possession-panel');let query='',tab=ctx.ui.possessionTab||'business';
 const currentCity=()=>cityId??ctx.ui.mapCity??ctx.view.city.id;
 const go=(route,setup=()=>{})=>{menu.open=false;beforeNavigate();setup();ctx.go(route);};
 const visit=(id,key)=>go('city',()=>{rememberCity(ctx,id);ctx.ui.cityScene='3d';ctx.ui.cityTab='city';if(key){ctx.ui.enterBuilding=key;ctx.ui.cityBuilding=key;}else{delete ctx.ui.enterBuilding;ctx.ui.cityBuilding=null;}});
 const updateLocation=()=>{nav.querySelector('[data-pos-city]').textContent=cityLabel(ctx,currentCity());nav.querySelector('[data-pos-paper]').title=`Zeitung aus ${cityLabel(ctx,currentCity())}`;};
 function minimap(){
  const ids=new Set([ctx.view.city.id,currentCity(),...(ctx.view.properties||[]).map(x=>x.cityId),...(ctx.view.companies||[]).map(x=>x.cityId)]);
  return html`<button class="possession-minimap" data-pos-map aria-label="Landkarte öffnen, Ansicht ${cityLabel(ctx,currentCity())}"><svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" aria-hidden="true"><path d="${GEOGRAPHY.find(x=>x.id==='276')?.path||''}"/>${[...ids].map(id=>{const c=cityOf(ctx,id);if(!c)return '';const [x,y]=project(c.lon,c.lat);return html`<circle cx="${x}" cy="${y}" r="${id===currentCity()?10:5}" class="${id===currentCity()?'viewed':id===ctx.view.city.id?'home':''}"/>`;})}</svg><span>${icon('map-pin')} ${cityLabel(ctx,currentCity())}<small>Blau: Ansicht · Gold: Wohnort · Weiß: Besitz</small></span></button>`;
 }
 function drawList(){
  const v=ctx.view,items=tab==='business'?(v.companies||[]):(v.properties||[]);
  const list=panel.querySelector('.possession-list');
  if(tab==='family'){
   mount(list,html`<p>Deine Familie</p>${v.partner?html`<div class="possession-person"><b>${v.partner.name}</b><small>${v.partner.married?'Ehepartner':'Partner'} · ${v.partner.age} Jahre</small></div>`:''}${(v.children||[]).map(c=>html`<div class="possession-person"><b>${c.name}</b><small>${c.age} Jahre · ${c.city||'Wohnort nicht angegeben'}</small></div>`)}${!v.partner&&!v.children?.length?html`<p class="possession-empty">Noch keine eigene Familie. Beziehungen und Familienplanung findest du hier.</p>`:''}<button data-pos-route="family">Familie verwalten ${icon('arrow-right')}</button>`);
  }else if(tab==='household')mount(list,html`<p>Haushalt & Versorgung</p><p class="possession-empty">Lebensmittel, Getränke und Haushaltshilfen für dein tägliches Leben.</p><button data-pos-route="household">Haushalt öffnen ${icon('arrow-right')}</button><button data-pos-route="housing">Wohnen & Verträge ${icon('arrow-right')}</button>`);
  else{
   const filtered=items.filter(x=>`${x.name} ${x.city||cityLabel(ctx,x.cityId)}`.toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de')));
   mount(list,html`${filtered.map(x=>{const key=`${tab==='business'?'biz':'prop'}:${x.id}`;return html`<article class="possession-item ${key===building?'current':''}"><button data-pos-enter="${key}" data-pos-city-id="${x.cityId}" ${key===building?'aria-current="location"':''}>${icon(tab==='business'?'store':'house')}<span><b>${x.name}</b><small>${x.city||cityLabel(ctx,x.cityId)} · ${x.rooms} Räume</small><small>${x.abandoned?'Stillgelegt':x.closed?'Vorübergehend geschlossen':x.construction?`Baufortschritt: ${x.construction.percent} %`:money(x.value, v.currency)}</small></span>${icon('chevron-right')}</button><button class="possession-manage" data-pos-manage="${key}">Verwalten</button></article>`;})}${!filtered.length?html`<p class="possession-empty">${items.length?'Kein passender Besitz gefunden.':'Hier besitzt du noch keine Gebäude.'}</p>`:''}<button data-pos-route="${tab==='business'?'business':'housing'}">${tab==='business'?'Alle Betriebe':'Immobilienverwaltung'} ${icon('arrow-right')}</button>`);
  }
 }
 function draw(){
  const v=ctx.view,search=['business','homes'].includes(tab);
  mount(panel,html`<header><b>Dein Besitz</b><button data-pos-close aria-label="Besitzübersicht schließen">${icon('x')}</button></header><div class="possession-tabs" role="group" aria-label="Besitzkategorie">${[['business','Gewerbe',v.companies?.length||0],['homes','Wohngebäude',v.properties?.length||0],['family','Familie',(v.children?.length||0)+(v.partner?1:0)],['household','Haushalt',null]].map(([id,label,count])=>html`<button data-pos-tab="${id}" aria-pressed="${tab===id}">${label}${count===null?'':html`<small>${count}</small>`}</button>`)}</div>${search?html`<label class="possession-search">Name oder Stadt<input type="search" data-pos-search value="${query}" placeholder="Besitz suchen …"></label>`:''}<div class="possession-list"></div>${minimap()}`);drawList();
 }
 menu.addEventListener('toggle',()=>{if(menu.open){updateLocation();draw();}});
 nav.addEventListener('input',e=>{if(e.target.matches('[data-pos-search]')){query=e.target.value;drawList();}});
 nav.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-pos-close')){menu.open=false;nav.querySelector('summary').focus();}
  else if(b.dataset.posTab){tab=b.dataset.posTab;ctx.ui.possessionTab=tab;query='';draw();panel.querySelector(`[data-pos-tab="${tab}"]`).focus();}
  else if(b.dataset.posEnter)visit(Number(b.dataset.posCityId),b.dataset.posEnter);
  else if(b.dataset.posManage){const [kind,id]=b.dataset.posManage.split(':'),route=kind==='biz'?'business':'housing';go(route,()=>{ctx.ui.simFocus={route,entity:`${kind==='biz'?'firm':'property'}:${id}`};});}
  else if(b.dataset.posRoute)go(b.dataset.posRoute);
  else if(b.hasAttribute('data-pos-map'))go('map',()=>{ctx.ui.mapCity=currentCity();});
  else if(b.hasAttribute('data-pos-city'))visit(currentCity());
  else if(b.hasAttribute('data-pos-paper'))go('newspaper',()=>{ctx.ui.newsCity=currentCity();ctx.ui.newsTab='news';});
  else if(b.hasAttribute('data-pos-shop'))go('shop');
 });
 const outside=e=>{if(menu.open&&!nav.contains(e.target))menu.open=false;};
 const escape=e=>{if(e.key==='Escape'&&menu.open&&!document.querySelector('.modal-backdrop')){e.preventDefault();e.stopImmediatePropagation();menu.open=false;nav.querySelector('summary').focus();}};
 const refresh=()=>{updateLocation();if(menu.open&&!nav.contains(document.activeElement))draw();};
 document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);window.addEventListener('tp-view-change',refresh);window.addEventListener('tp-map-city',refresh);
 updateLocation();
 return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);window.removeEventListener('tp-view-change',refresh);window.removeEventListener('tp-map-city',refresh);nav.remove();host.classList.remove('has-possession-nav');};
}
