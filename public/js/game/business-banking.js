import {html,icon,money} from './ui.js';
export function bankSummary(c,v) {
  const b=c.bank;if(!b)return '';
  return html`<div class="business-bank small mt"><b>${icon('landmark')} Bankverwaltung</b><p>${b.active?'Automatische Überweisungen aktiv · 0 EFS':b.unlocked?'Bankautomatik pausiert':b.available?`Einmalig ${b.coins} Coins für diesen Betrieb`:`Verfügbar ab ${b.fromYear}`}</p><p class="dim">Manuell im Büro: +1 EFS je erfolgreicher Abholung. Eine Automatik gilt nur für dieses Objekt.</p><p class="dim">Die gesamte Firmenkasse wird täglich überwiesen. Bei benötigter Kassenreserve für Handelsrouten die Automatik pausieren.</p>${b.last?html`<small>Letzte Überweisung: ${money(b.last.amount,v.currency)}</small>`:''}</div>`;
}
export function officeActions(c,v) {
  if(!c)return [];
  const b=c.bank;
  return [{label:'Einnahmen im Büro abholen',sub:`${money(c.cash,v.currency)} in der Firmenkasse · +1 EFS`,disabled:c.cash<=0,allowAway:true,run:({act})=>act('bizCollect',{id:c.id})},
    ...(b?[{label:b.unlocked?(b.active?'Bankautomatik pausieren':'Bankautomatik aktivieren'):`Bankautomatik einrichten · ${b.coins} Coins`,
      sub:!b.available?`Ab ${b.fromYear} verfügbar`:b.unlocked?'Bereits für diesen Betrieb erworben · keine erneuten Coins':'Nur für diesen Betrieb · tägliche Überweisung der Firmenkasse · 0 EFS',
      disabled:!b.available||(!b.unlocked&&v.coins<b.coins),allowAway:true,run:({act})=>act('bizBank',{id:c.id,on:!b.active})}]:[])];
}
