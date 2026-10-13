import {html,icon,money,modal,mount,toast} from './ui.js';

export function openProvisions(ctx,kind='fridge') {
  const labels={fridge:'Kühlschrank & Vorrat',health:'Gesundheit',rest:'Energie & Erholung'};
  const dialog=modal('',{wide:true});let busy=false,feedback='';
  const headingId=`provision-title-${Date.now()}`;
  dialog.el.setAttribute('aria-labelledby',headingId);
  const draw=()=>{
    const v=ctx.view, items=(v.food.items || []).filter(i=>kind==='fridge' || (kind==='health'?i.health>0:i.rest>0));
    mount(dialog.el,html`<div class="row spread"><h3 id="${headingId}" tabindex="-1">${labels[kind]}</h3><button class="btn ghost" data-close="1" aria-label="Schließen">${icon('x')}</button></div>
      <p role="status" aria-live="polite" class="provision-feedback">${feedback}</p>
      <p>${kind==='fridge'?`Dein Vorrat reicht für ca. ${v.food.days ?? 0} Spieltage. Jeder Einkauf wird hinzugefügt.`:`Aktuell: ${v.meters[kind]} %. Wähle etwas aus deinem Vorrat oder kaufe nach.`}</p>
      ${kind==='fridge'?html`<div class="provision-packs">${v.food.tiers.map((t,i)=>html`<button class="btn" data-pack="${i}" ${v.money<t.cost?'disabled':''}><b>${t.name}</b><span>+100 Vorrat · ${money(t.cost,v.currency)}</span></button>`)}</div>`:''}
      <div class="provision-list">${items.map(i=>html`<article class="provision-item"><div><b>${icon(i.icon)} ${i.name}</b><small>Im Vorrat: ${i.count} · ${i.health?`+${i.health} Gesundheit `:''}${i.rest?`+${i.rest} Energie `:''}${i.food?`+${i.food} Vorrat`:''}</small></div><div class="row"><button class="btn sm" data-buy-item="${i.key}" ${v.money<i.cost?'disabled':''}>Kaufen · ${money(i.cost,v.currency)}</button><button class="btn sm primary" data-use-item="${i.key}" ${i.count<1?'disabled':''}>Verbrauchen</button></div></article>`)}</div>
      ${kind==='rest'?html`<button class="btn block mt" data-rest-now ${v.food.canRest?'':'disabled'}>${icon('bed')} Schlafen · +35 Energie</button><p class="small dim">Einmal pro Spieltag an deinem Schlafplatz.</p>`:''}
      ${kind==='health' && v.cards.available?html`<button class="btn block mt" data-health-card ${v.cards.health?'':'disabled'}>Gesundheitskarte einsetzen · ${v.cards.health} vorhanden</button>`:''}
      <p class="small dim">${v.butler?'Dein Butler kauft während des Vorspulens automatisch nach.':'Der tägliche Verbrauch berücksichtigt deinen Haushalt.'}</p>`);
  };
  dialog.el.addEventListener('click',async e=>{
    const b=e.target.closest('[data-pack],[data-buy-item],[data-use-item],[data-rest-now],[data-health-card]');if(!b||b.disabled||busy)return;
    const name=b.hasAttribute('data-pack')?'buyFood':b.hasAttribute('data-buy-item')?'buyProvision':b.hasAttribute('data-use-item')?'useProvision':b.hasAttribute('data-rest-now')?'restNow':'useCard';
    const input=name==='buyFood'?{tier:Number(b.dataset.pack)}:{key:b.dataset.buyItem || b.dataset.useItem};
    const attr=[...b.attributes].find(a=>a.name.startsWith('data-'));
    const focusSelector=`[${attr.name}="${attr.value}"]`;
    const scrollTop=dialog.el.scrollTop;
    busy=true;dialog.el.setAttribute('aria-busy','true');dialog.el.querySelectorAll('button').forEach(x=>{if(!x.hasAttribute('data-close'))x.disabled=true;});
    try {const result=await ctx.act(name,input,{noRender:true,silent:true});feedback=result.message || 'Erledigt.';}catch(e){if(!e.toasted)toast(e.message,'bad');}
    finally{busy=false;dialog.el.setAttribute('aria-busy','false');if(dialog.el.isConnected){draw();dialog.el.scrollTop=scrollTop;const next=dialog.el.querySelector(focusSelector);(next && !next.disabled?next:dialog.el.querySelector('h3')).focus({preventScroll:true});}}
  });
  draw();dialog.el.querySelector('h3').focus({preventScroll:true});
}
