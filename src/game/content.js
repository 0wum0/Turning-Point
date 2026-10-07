'use strict';
const { rngFor, pick } = require('./rng');

/** Wohnformen: Erholung je Tag, Gesundheit, Komfort (Wohlbefinden-Ziel) */
const HOUSING = {
  street: { name: 'Straße', icon: 'tree-pine', rest: -30, health: -1, comfort: -25 },
  workplace: { name: 'Schlafplatz beim Arbeitgeber', icon: 'briefcase', rest: 8, health: 0, comfort: -8 },
  pension: { name: 'Pension', icon: 'hotel', rest: 22, health: 0, comfort: 1 },
  rent: { name: 'Mietwohnung', icon: 'house', rest: 35, health: 1, comfort: 8 },
  own: { name: 'Eigenes Zuhause', icon: 'castle', rest: 45, health: 2, comfort: 14 },
  damaged: { name: 'Beschädigtes Zuhause', icon: 'triangle-alert', rest: 10, health: 0, comfort: -12 },
};

const LEVELS = [
  { name: 'Anfänger', days: 0, mult: 1 },
  { name: 'Geselle', days: 730, mult: 1.15 },
  { name: 'Fachkraft', days: 1825, mult: 1.35 },
  { name: 'Meister', days: 3650, mult: 1.6 },
  { name: 'Altmeister', days: 7300, mult: 1.9 },
];

const SCHOOLS = {
  grund: { name: 'Grundschule', from: 6, to: 10 },
  haupt: { name: 'Hauptschule', to: 15, cost: 0 },
  real: { name: 'Realschule', to: 16, cost: 15 },
  gym: { name: 'Gymnasium', to: 18, cost: 30 },
};

const FIRST = {
  1965: { m: ['Hans', 'Peter', 'Klaus', 'Jürgen', 'Günter', 'Heinz', 'Horst', 'Wolfgang', 'Dieter', 'Manfred', 'Karl', 'Werner', 'Walter', 'Helmut', 'Gerhard'], f: ['Ursula', 'Ingrid', 'Renate', 'Helga', 'Gisela', 'Brigitte', 'Elke', 'Monika', 'Karin', 'Gerda', 'Hannelore', 'Erika', 'Christa', 'Inge', 'Margarete'] },
  1990: { m: ['Thomas', 'Michael', 'Andreas', 'Stefan', 'Frank', 'Uwe', 'Jörg', 'Ralf', 'Bernd', 'Holger', 'Jens', 'Olaf'], f: ['Sabine', 'Petra', 'Susanne', 'Andrea', 'Martina', 'Claudia', 'Anja', 'Birgit', 'Heike', 'Silke', 'Nicole', 'Kerstin'] },
  2010: { m: ['Christian', 'Daniel', 'Sebastian', 'Alexander', 'Tobias', 'Marcel', 'Dennis', 'Patrick', 'Kevin', 'Jan', 'Lukas', 'Tim'], f: ['Julia', 'Katharina', 'Jennifer', 'Sarah', 'Lisa', 'Anna', 'Melanie', 'Jessica', 'Laura', 'Vanessa', 'Lena', 'Nadine'] },
  2040: { m: ['Ben', 'Leon', 'Finn', 'Noah', 'Paul', 'Elias', 'Luca', 'Jonas', 'Felix', 'Max', 'Emil', 'Anton'], f: ['Emma', 'Mia', 'Hannah', 'Sofia', 'Lina', 'Emilia', 'Lea', 'Marie', 'Clara', 'Leni', 'Ida', 'Frieda'] },
  9999: { m: ['Milo', 'Theo', 'Kai', 'Lio', 'Jaro', 'Nils', 'Arvid', 'Ruben', 'Enno', 'Matti'], f: ['Nora', 'Jara', 'Alma', 'Vera', 'Mila', 'Ayla', 'Svea', 'Liv', 'Thea', 'Malia'] },
};
const LAST = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Herrmann', 'Peters', 'Lorenz', 'Voigt', 'Böhm', 'Brandt', 'Winter', 'Seidel', 'Kaiser'];

function firstNames(year, gender) {
  const key = Object.keys(FIRST).map(Number).sort((a, b) => a - b).find((k) => year < k);
  const set = FIRST[key];
  return gender === 'f' ? set.f : set.m;
}
function randomFirstName(r, year, gender) {
  const g = gender === 'd' ? (r() < 0.5 ? 'm' : 'f') : gender;
  return pick(r, firstNames(year, g));
}
const randomLastName = (r) => pick(r, LAST);

const DEMONYM = {
  'Bremen': 'Bremer', 'München': 'Münchner', 'Saarbrücken': 'Saarbrücker', 'Frankfurt am Main': 'Frankfurter', 'Freiburg im Breisgau': 'Freiburger',
  'Köln': 'Kölner', 'Berlin': 'Berliner', 'Hamburg': 'Hamburger',
};
function demonym(name) {
  if (DEMONYM[name]) return DEMONYM[name];
  const first = name.split(/[ -]/)[0];
  return /er$/.test(first) ? first : first.replace(/e$/, '') + 'er';
}

const TIERS = ['Günstig', 'Normal', 'Hochwertig', 'Gourmet'];

const ILLNESSES = ['Krebs', 'ein schweres Herzleiden', 'eine chronische Lungenerkrankung', 'ein Nierenleiden'];

module.exports = { HOUSING, LEVELS, SCHOOLS, TIERS, ILLNESSES, firstNames, randomFirstName, randomLastName, demonym, LAST };
