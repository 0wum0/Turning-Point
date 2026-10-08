'use strict';
/** Englische Texte des Tagesblatts (Weltereignisse). Paare [deutsch, englisch]. */
module.exports = [
  ['Insolvenz', 'Insolvency'], ['Todesfall', 'Death'], ['Neu in der Stadt', 'New in town'], ['Zwangsversteigerung', 'Forced auction'], ['Börsenbericht', 'Stock market report'], ['Ein Bürger', 'A citizen'], ['Ein neuer Bürger', 'A new citizen'], ['der Stadt', 'town'],
  ['${nm} ist zahlungsunfähig. Besitz kommt unter den Hammer.', '${nm} is insolvent. Assets go under the hammer.'],
  ['${state.person.first} ${state.person.last} ist verstorben.', '${state.person.first} ${state.person.last} has passed away.'],
  ['${user.social_public ? `${state.person.first} ${state.person.last}` : \'Ein neuer Bürger\'} beginnt ein neues Leben in ${(w.city(state.cityId) || {}).label || \'der Stadt\'}.', 'A new life begins for ${user.social_public ? `${state.person.first} ${state.person.last}` : \'a new citizen\'} in ${(w.city(state.cityId) || {}).label || \'town\'}.'],
  ['Aus einer Insolvenzmasse kommen ${state.properties.length} Immobilie(n) und ${(state.companies || []).length} Betrieb(e) unter den Hammer.', '${state.properties.length} propert(y/ies) and ${(state.companies || []).length} business(es) from an insolvent estate go under the hammer.'],
  ['Größter Gewinner: ${up.name} (${f(up)}). ${down !== up ? `Größter Verlierer: ${down.name} (${f(down)}).` : \'\'}', 'Biggest gainer: ${up.name} (${f(up)}). ${down !== up ? `Biggest loser: ${down.name} (${f(down)}).` : \'\'}'],
];
