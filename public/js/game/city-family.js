// Scene selection is separate from the active heir and the registered family residence.
export function cityFamily(view, cityId) {
  const here=Number(view.city?.id)===Number(cityId);
  const actors=[{id:'self',kind:'self',name:view.person.name,label:'Du',age:view.person.age,available:true}];
  const p=view.partner;
  if(p)actors.push({id:`partner:${p.userId || p.name}`,kind:'partner',name:p.name,label:p.name,age:p.age,
    available:here && !!p.cohabit && !p.linked,
    reason:p.linked?'Eigener Mitspieler':!p.cohabit?'Wohnt nicht im Haushalt':!here?'Nicht in dieser Stadt':''});
  for(const c of view.children || []) {
    const local=Number(c.cityId)===Number(cityId);
    const reason=c.status!=='home'?({runaway:'Wird vermisst',care:'In Jugendhilfe',withPartner:'Beim anderen Elternteil'}[c.status] || 'Nicht im Haushalt')
      :!local?'Nicht in dieser Stadt':c.age<6?'Noch zu jung für eigene Wege':'';
    actors.push({id:`child:${c.id}`,kind:'child',childId:c.id,name:c.name,label:c.name,age:c.age,available:!reason,reason});
  }
  return actors;
}

export function familyDestination(actor, building) {
  if(actor.kind==='self')return {allowed:true,label:'Gebäude betreten'};
  if(actor.kind==='child' && building.type==='schule')return {allowed:true,label:'Zur Schule gehen'};
  if(['markt','rathaus'].includes(building.type) || (building.type==='home' && building.residence))
    return {allowed:true,label:building.type==='home'?'Nach Hause gehen':'Zum Treffpunkt gehen'};
  return {allowed:false,label:'Mit deiner Spielfigur betreten',reason:'Wähle deine Spielfigur für Betriebs-, Berufs- und Gebäudeaktionen.'};
}
