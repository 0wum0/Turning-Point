import {html,icon,money,num,ring} from './ui.js';

export function simulatorHud(v) {
  return html`<div class="sim-capital"><button class="res coin" data-go="shop" title="Coins">${icon('coins')}<b>${num(v.coins)}</b></button><button class="res" data-go="overview" title="Verfügbares Geld">${icon('wallet')}<b>${money(v.money,v.currency)}</b></button></div>
    <button class="sim-identity" data-go="character" title="${v.person.name} – Charakter und laufendes Jahr"><span class="sim-year-ring" role="progressbar" aria-label="Fortschritt des Spieljahres" aria-valuemin="0" aria-valuemax="100"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="year-track"/><circle cx="20" cy="20" r="16" pathLength="100" class="year-fill"/></svg><span data-year-season>❄</span></span><span><b data-i18n-skip>${v.person.name}</b><small><span data-hud-year>${v.date.year}</span> · <span data-hud-season>${v.season?.name || ''}</span></small></span></button>
    <button class="res sim-assets" data-go="overview" title="Aktueller Gesamtwert deiner Unternehmen und Immobilien">${icon('trending-up')}<span><b>${money(v.assetValue ?? v.properties.reduce((n,p)=>n+p.value,0)+v.companies.reduce((n,c)=>n+c.value,0),v.currency)}</b><small>Unternehmen &amp; Immobilien</small></span></button>
    <div class="hud-meters">${[['fridge','Vorrat','refrigerator'],['rest','Energie','zap'],['health','Gesundheit','heart-pulse']].map(([key,label,ic])=>html`<button class="meter" data-meter="${key}" aria-label="${label}: ${v.meters[key]} %" title="${key==='fridge'?`Vorrat für ca. ${v.food.days ?? 0} Tage`:label+' auffüllen'}">${ring(v.meters[key],label,ic,{size:40})}</button>`)}</div>
    <button class="res efs" data-go="overview" title="EFS – Spieltage vorspulen">${icon('zap')}<b>${num(v.efs.pool)}</b><small>EFS</small></button>`;
}

export function updateYearRing(v,sampledAt,now=Date.now()) {
  const ring=document.querySelector('.sim-year-ring');if(!ring || !v)return;
  const days=v.date.doy+Math.max(0,Number(v.clock?.carry)||0)+Math.max(0,now-sampledAt)*(Number(v.clock?.perMs)||0);
  const doy=days%365, pct=doy/365*100;
  const season=doy<59 || doy>=334 ? ['Winter','❄','#a8ddec'] : doy<151 ? ['Frühling','✿','#91dba6'] : doy<243 ? ['Sommer','☀','#f5d079'] : ['Herbst','❧','#e1a16c'];
  ring.style.setProperty('--year-progress',pct);ring.style.setProperty('--season-color',season[2]);
  ring.setAttribute('aria-valuenow',String(Math.round(pct)));ring.setAttribute('aria-valuetext',`${Math.round(pct)} % · ${season[0]}`);
  ring.querySelector('[data-year-season]').textContent=season[1];
  document.querySelector('[data-hud-year]').textContent=v.date.year+Math.floor(days/365);
  document.querySelector('[data-hud-season]').textContent=season[0];
}
