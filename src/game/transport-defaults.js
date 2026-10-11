'use strict';
/**
 * Standardwerte für Handelsrouten und Transport (Einstellung `transport`, im Admin änderbar).
 * Preise sind „Wert von 1945“ in Cent (Kosten je kg und km), Geschwindigkeit in km pro Spieltag, Tragfähigkeit in kg je Fahrzeug.
 * Zeitreihen sind Stützpunkte [Jahr, Wert] mit linearer Zwischenstufe (vor dem ersten und nach dem letzten Jahr konstant).
 */
const MODES = [
  { key: 'fuhrwerk', name: 'Pferdefuhrwerk', icon: 'truck', from: 1945, to: 1964, net: 'road', fuel: 'kraftstoff', energy: 0.03, handling: 0.6,
    speed: [[1945, 22], [1964, 28]], cost: [[1945, 0.0105], [1964, 0.0105]], cap: [[1945, 900], [1964, 1400]], road: 1.2, risk: 1.0,
    note: 'Langsam und klein, aber überall verfügbar – die Nachkriegszeit lebt davon.' },
  { key: 'lkw', name: 'Lastwagen', icon: 'truck', from: 1950, to: 2999, net: 'road', fuel: 'kraftstoff', energy: 0.45, handling: 0.5,
    speed: [[1950, 150], [1965, 210], [1990, 280], [2020, 320], [2100, 380]], cost: [[1950, 0.0068], [1975, 0.0052], [2020, 0.0047], [2100, 0.0042]], cap: [[1950, 3000], [1975, 12000], [2000, 22000]], road: 1.2, risk: 1.0, autobahn: true,
    note: 'Flexibel auf der Straße. Mit dem Autobahnnetz wird er schneller.' },
  { key: 'bahn', name: 'Bahnfracht', icon: 'train-front', from: 1945, to: 2999, net: 'rail', fuel: 'strom', energy: 0.25, handling: 1.5,
    speed: [[1945, 95], [1960, 130], [1990, 170], [2030, 220]], cost: [[1945, 0.0033], [1975, 0.0027], [2030, 0.0024]], cap: [[1945, 24000], [1975, 40000]], road: 1.12, risk: 0.6,
    note: 'Billig für schwere Güter, aber nur zwischen Orten mit Bahnanschluss.' },
  { key: 'container', name: 'Containerschiff', icon: 'ship', from: 1970, to: 2999, net: 'port', fuel: 'kraftstoff', energy: 0.3, handling: 3,
    speed: [[1970, 330], [2000, 450], [2060, 600]], cost: [[1970, 0.0019], [2000, 0.0014], [2060, 0.0012]], cap: [[1970, 60000], [2000, 120000]], road: 1.3, risk: 0.5,
    note: 'Seefracht und Binnenhäfen: sehr billig, aber langsam beim Umladen. Nur zwischen Häfen.' },
  { key: 'luft', name: 'Luftfracht', icon: 'plane', from: 1980, to: 2999, net: 'air', fuel: 'kraftstoff', energy: 0.5, handling: 0.8,
    speed: [[1980, 1200], [2020, 1800], [2100, 2400]], cost: [[1980, 0.052], [2020, 0.04], [2100, 0.03]], cap: [[1980, 9000], [2020, 20000]], road: 1.03, risk: 0.4,
    note: 'Teuer, aber über Nacht am Ziel – für wertvolle, leichte Waren. Nur zwischen großen Flughäfen.' },
  { key: 'drohne', name: 'Frachtdrohne', icon: 'plane', from: 2035, to: 2999, net: 'road', fuel: 'strom', energy: 0.5, handling: 0.2, maxUnitKg: 25,
    speed: [[2035, 600], [2100, 900]], cost: [[2035, 0.085], [2100, 0.06]], cap: [[2035, 400], [2100, 900]], road: 1.05, risk: 0.9,
    note: 'Autonome Drohnen für leichte Pakete – überall, aber teuer.' },
  { key: 'hyperloop', name: 'Röhrenfracht', icon: 'train-front', from: 2060, to: 2999, net: 'hyper', fuel: 'strom', energy: 0.4, handling: 0.6,
    speed: [[2060, 1500], [2100, 2600]], cost: [[2060, 0.0028], [2100, 0.0021]], cap: [[2060, 80000], [2100, 140000]], road: 1.0, risk: 0.3,
    note: 'Unterdruckröhren zwischen den größten Städten: schnell und günstig.' },
];

module.exports = {
  enabled: true,
  maxTravelDays: 60,
  modes: MODES,
  // Gewicht je Handelseinheit in kg (Standard 1). Strom kann nicht auf der Straße transportiert werden.
  weights: { milch: 1.03, kraftstoff: 0.85, bier: 1.05, moebel: 45, textil: 0.35, kleidung: 1.2, ersatzteile: 18, elektronik: 4, arznei: 0.2 },
  notShippable: ['strom'],
  fuel: { min: 0.7, max: 1.8 },
  hubs: { railPop: 10000, airPop: 150000 },
  // Jahreszeit, Seuchen, Hochwasser
  season: { winterSlow: 0.25, winterCost: 0.12, floodDays: 18, floodSlow: 0.8, floodFrom: 130, floodTo: 280 },
  epidemic: { slow: 0.12, cost: 0.05, quarantineChance: 0.08, quarantineDays: [3, 8] },
  tolls: { lkwFromYear: 2005, lkwPct: 8, portFeePct: 5, airFeePct: 4, maxCityPct: 6 },
  // Politik (Stufen und Wirkungen; Umlagen in Punkten Gewerbesteuer)
  policy: {
    enabled: true,
    cityTollOptions: [0, 2, 4, 6],            // Hafengebühr/Maut der Stadt in % der Fracht
    cityTollFrame: [0, 3, 6],                 // Rahmen des Bundestags: höchste erlaubte Stadtmaut
    hubLevy: [0.2, 0.4, 0.6],                 // Umlage Hafen-/Bahnhofsausbau (Stadt)
    hubHandling: 0.18,                        // weniger Umladezeit je Stufe (Anteil)
    roadSpeed: [4, 8, 12], roadCost: [3, 6, 9], roadLevy: [0.2, 0.4, 0.6],   // Straßenbauprogramm (Land)
    netSpeed: [5, 10, 15], netCost: [2, 4, 6], netLevy: [0.3, 0.6, 0.9],     // Autobahn-/Bahnnetz (Bund)
  },
  // Handelsrouten
  trade: {
    enabled: true, maxRoutesTotal: 6, extraRoutePerTier: 1, minInterval: 2, maxInterval: 60,
    buyPremiumPct: 2, sellDiscountPct: 10, roiCapPct: 24, roiMinDays: 7,
    overheadReal: 3,            // Cent (Wert 1945) pro Tag und Route (Bürokosten, Standgeld)
    insurancePct: 2.5, insureCoverPct: 70,
    ownFleetDiscountPct: 25,    // Eigener Fuhrpark (Speditionsbetrieb): Fracht so viel billiger
    carrierCostSharePct: 55,    // Anteil der Frachtzahlung, den ein Frachtführer für Treibstoff, Fahrer und Wartung selbst aufwendet
    absorbShare: 0.5, impact: 0.25, impactMax: 0.35,
    retryDays: 2, maxWaitDays: 12, minCargoReal: 150,
    roomsPerVehicleCarrier: 3, roomsPerVehicleOther: 6,
    historyMax: 40,
  },
  // Risiken und Ereignisse (alle begrenzt; Anfänger-Schutz: keine Verluste in den ersten Spieltagen)
  risk: {
    enabled: true, scale: 1, lossCapPct: 60,
    accident: { p: 0.02, lossMin: 8, lossMax: 30 },
    robbery: { fromYear: 1945, toYear: 1955, p: 0.14, lossMin: 25, lossMax: 60 },
    pothole: { toYear: 1975, p: 0.1, delayMax: 3 },
    weather: { p: 0.25, delayMax: 4 },
    customs: { p: 0.05, delay: 1, smuggleP: 0.16, fineMult: 2, seizePct: 25 },
    strike: { p: 0.02, delayMin: 2, delayMax: 6 },
  },
  contracts: { blockSameIp: true, crossRegion: true, maxKm: 450, maxFreightSharePct: 50, carrierMinPct: 70, carrierMaxPct: 100, offerLimit: 4 },
  bots: { enabled: true, routes: 2 },
  labels: { fracht: 'Fracht', spedition: 'Spedition', zoll: 'Zoll', maut: 'Maut' },
};
