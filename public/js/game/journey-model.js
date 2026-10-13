/* Read-only progression derived from the server's real quests and recommendations. */
const CHAPTERS = [
  { id:'life', title:'Leben sichern', icon:'house', why:'Essen, Unterkunft und Lohn tragen deinen Alltag.', ids:['paper','food','shelter','job','wage','home','fridge7'], tab:'household' },
  { id:'craft', title:'Betrieb aufbauen', icon:'hammer', why:'Beruf lernen, gründen, Mitarbeiter führen und Zutaten beschaffen.', ids:['skill2','business','hire','talent','module','lead','contract'], tab:'business' },
  { id:'trade', title:'Handel vernetzen', icon:'route', why:'Preise vergleichen, Rücklagen bilden und mit Lieferungen Geld verdienen.', ids:['prices','save','let','market','route'], tab:'trade' },
  { id:'dynasty', title:'Familie & Einfluss', icon:'users', why:'Beziehungen, Ansehen und Ämter stärken das Vermächtnis deiner Familie.', ids:['friend','standing','vote','winter','court','club','give'], tab:'family' },
];
const questAction = q => ({ id:q.id, title:q.title, why:q.why, icon:'flag', cta:{ kind:'go', label:'Zeig mir den nächsten Schritt', tab:q.tab, spot:q.spot } });
export function journeyOf(view) {
  const quests = view.onboarding?.quests || [];
  const chapters = CHAPTERS.map(chapter => {
    const steps = chapter.ids.map(id => quests.find(q => q.id === id)).filter(Boolean);
    const next = steps.find(q => !q.done);
    return { ...chapter, done:steps.filter(q=>q.done).length, total:steps.length, next:next ? questAction(next) : { title:chapter.title, cta:{kind:'go',label:'Öffnen',tab:chapter.tab} } };
  });
  const advice = view.onboarding?.advisor?.top;
  const quest = quests.find(q=>q.current && !q.done) || quests.find(q=>!q.done);
  const next = advice && advice.id !== 'calm' ? advice : quest ? questAction(quest) : {
    id:'explore', title:'Dein Lebenswerk wächst', why:'Entdecke deine Betriebe, kümmere dich um die Familie oder übernimm eine Aufgabe in der Stadt.', icon:'building-2',
    cta:{kind:'go',label:'Dein Lebenswerk ansehen',tab:'overview'},
  };
  return { next, chapters, done:quests.filter(q=>q.done).length, total:quests.length };
}
