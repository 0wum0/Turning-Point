'use strict';
/**
 * Standardwerte „Betrieb 2.0“ (Ausbaumodule, Betriebsklima, Betriebsbrand). Im Admin unter Einstellungen → Betrieb 2.0 änderbar (Einstellung `betrieb`).
 * Beträge sind Anteile (in Prozent) am Grundwert des Betriebs bzw. Vielfache des Tageslohns eines Mitarbeiters – nie feste Cent-Werte,
 * damit alles mit Preisindex, Stadtfaktor und Baupreisen der Stadt (cityecon.buildMult) mitwächst.
 * Zeiten sind Spieltage (ein Spieltag ≈ 4 Minuten echte Zeit, ein Spieljahr = 24 Stunden).
 */
module.exports = {
  enabled: true,
  // Gemeinsamer Regler aller Wirkungen: 0 = ohne Wirkung (Module und Klima sind dann reine Kulisse), 1 = normal, 2 = doppelt.
  effects: {
    strength: 1,
    climatePct: 6,                 // größte Wirkung des Betriebsklimas auf den Umsatz (±), eingerechnet in die Umsatzgrenze der Talente (kein Doppelzählen)
    extraHeadPct: [3, 2, 1],       // Zusatzstellen („Arbeitsplätze“): Umsatzplus der 1., 2., 3. Stelle über den Bedarf hinaus (sinkender Grenzertrag)
    priceWindowPct: 3,             // Lager: höchster Kosteneffekt des Einkaufs im günstigen Preisfenster (Prozent der Zutatenkosten)
  },
  modules: {
    lager: {
      name: 'Lager', icon: 'package', what: 'Ein Vorrat an Zutaten überbrückt Lieferausfälle und erlaubt den Einkauf, wenn die Preise günstig sind.',
      upkeepPct: 1,
      levels: [
        { name: 'Vorratsraum', days: 3, costPct: 1.6, from: 1945, text: 'Hält Zutaten für 3 Tage vor.' },
        { name: 'Lagerhalle', days: 7, costPct: 3.2, from: 1945, text: 'Hält Zutaten für 7 Tage vor.' },
        { name: 'Großlager mit Kühlung', days: 14, costPct: 5.5, from: 1965, text: 'Hält Zutaten für 14 Tage vor.' },
      ],
    },
    brand: {
      name: 'Brandschutz', icon: 'flame', what: 'Senkt Wahrscheinlichkeit und Schaden eines Betriebsbrands und macht die Betriebsversicherung günstiger.',
      upkeepPct: 1,
      levels: [
        { name: 'Feuerlöscher und Brandwand', pMult: 0.6, dmgMult: 0.75, outMult: 0.85, premDisc: 10, costPct: 0.8, from: 1945, text: 'Feuerlöscher, Sandeimer und eine Brandwand.' },
        { name: 'Brandmeldeanlage', pMult: 0.35, dmgMult: 0.55, outMult: 0.7, premDisc: 20, costPct: 2, from: 1970, text: 'Rauchmelder, die die Feuerwehr alarmieren.' },
        { name: 'Sprinkleranlage', pMult: 0.2, dmgMult: 0.4, outMult: 0.55, premDisc: 30, costPct: 3.5, from: 1985, text: 'Löscht ein Feuer, bevor es sich ausbreitet.' },
      ],
    },
    schutz: {
      name: 'Schutz', icon: 'shield', what: 'Wehrt Diebstahl und Einbruch ab, schützt das Lager und macht Anschläge im Wettbewerb schwerer.',
      upkeepPct: 0, upkeepRevPct: [0.15, 0.3, 0.5],     // Tagesunterhalt als Prozent der Raumerträge (Pförtner, Wartung, Wachdienst)
      levels: [
        { name: 'Schloss und Pförtner', repel: 45, rival: 1, premDisc: 5, costPct: 0.6, from: 1945, text: 'Gutes Schloss, abends ein Pförtner.' },
        { name: 'Alarmanlage', repel: 70, rival: 1.3, premDisc: 10, costPct: 1.3, from: 1970, text: 'Alarm bei Einbruch, Aufschaltung zur Polizei.' },
        { name: 'Videoüberwachung und Werkschutz', repel: 90, rival: 1.6, premDisc: 15, costPct: 2.5, from: 1990, text: 'Kameras und ein Wachdienst rund um die Uhr.' },
      ],
    },
    arbeit: {
      name: 'Arbeitsplätze', icon: 'users', what: 'Sozialräume und Arbeitsschutz: bessere Stimmung, weniger Krankenausfall und Platz für Zusatzstellen.',
      upkeepPct: 1,
      levels: [
        { name: 'Pausenraum', slots: 1, mood: 5, sickMult: 0.9, costPct: 1.2, from: 1945, text: 'Ein Raum zum Essen und Ausruhen, eine Zusatzstelle.' },
        { name: 'Kantine und Arbeitsschutz', slots: 2, mood: 10, sickMult: 0.8, costPct: 3, from: 1960, text: 'Warme Mahlzeiten, Arbeitsschutz, zwei Zusatzstellen.' },
        { name: 'Sozialräume und Betriebskita', slots: 3, mood: 15, sickMult: 0.7, costPct: 5, from: 1990, text: 'Sozialräume, Kinderbetreuung, drei Zusatzstellen.' },
      ],
    },
  },
  // Betriebsbrand: seltenes Wochenereignis je Betrieb (deterministisch aus Spielstand, Betrieb und Woche), nie offline und nicht im Anfängerschutz.
  fire: {
    weeklyChance: 0.0002,           // Grundchance je Woche (≈ 1 % im Jahr, bei durchschnittlichem Brandrisiko der Branche)
    risk: { gastronomie: 2, industrie: 2, handwerk: 1.8, landwirtschaft: 1.5, energie: 1.5, bau: 1.3, verkehr: 1, technik: 1, dienstleistung: 0.6, kreativ: 0.6, akademisch: 0.5 },
    winterPct: 25,                  // Heizperiode (Dezember bis Februar): Chance plus so viel Prozent
    damagePct: 5,                   // Schaden: Prozent vom Wert des Betriebs (vor Brandschutz)
    outage: [7, 18],               // Ausfall in Tagen (vor Brandschutz)
    stockLossPct: 50,               // Anteil des Lagerbestands, der verbrennt
    ownerCapPct: 50,                // Eigene Mittel: höchstens so viel Prozent des Privatgelds (neben der Firmenkasse) – ein Brand löst nie die Insolvenz aus
    moodHit: 6,                     // Schreck: Stimmung aller Mitarbeiter sinkt
  },
  insurance: {
    // Beitrag: Wirtschaftsdaten → Versicherungen → Betriebsversicherung (Prozent vom Wert aller Betriebe pro Jahr, vor Rabatt durch Brandschutz und Schutz)
    paidPct: 90,                    // übernommener Anteil des Schadens (Selbstbeteiligung 10 %)
    outageCutPct: 35,               // Ausfalltage kürzer durch schnelle Hilfe
    interruptionPct: 60,            // Betriebsunterbrechung: Prozent des letzten Tagesgewinns je Ausfalltag
  },
  theft: { stockLossPct: 10 },       // Diebstahl im Betrieb trifft zusätzlich Prozent des Lagerbestands (ohne Schutz)
  // Betriebsklima: Stimmung 0–100 je Mitarbeiter (50 = neutral). Sie strebt täglich einem Zielwert zu, der aus Lohn, Auslastung, Sozialräumen, Jahreszeit und Führung folgt.
  climate: {
    start: 50, relax: 0.03,         // Anpassung je Tag in Richtung Zielwert
    wageFair: 60,                   // Punkte je 100 % Lohnabstand zum Marktlohn (gedeckelt −15 … +8)
    understaffed: 8,                // Abzug bei Unterbesetzung (volle Unterbesetzung)
    sick: 4,                        // Abzug bei Krankenstand (Seuche)
    leadPts: 4,                     // Führung (Chef/Manager) hebt oder senkt den Zielwert um bis zu so viele Punkte
    fearPts: 6, fearDays: 45,       // Abmahnung: Zielwert sinkt je Abmahnung so viele Punkte, so viele Tage lang (höchstens dreifach)
    strikeAfter: 8,                 // nach einem Streik: Abzug, solange der Streik nicht länger als 14 Tage her ist
    quitBelow: 25,                  // darunter denken Mitarbeiter ans Kündigen (Lohnforderung mit Frist)
    quitWeekly: 0.25,               // Wahrscheinlichkeit je Woche bei Stimmung 0 (steigt linear von der Schwelle aus)
    strikeBelow: 40, strikeWeekly: 0.03, // darunter droht zusätzlich ein Streik (nur bei Mindestbelegschaft)
    askMarginPts: 0.04,             // Lohnforderung kommt früher/später (±) je nach Stimmung
    fairFrom: 65,                   // ab dieser Durchschnittsstimmung zählt der Betrieb als „fairer Arbeitgeber“ (Ansehen)
    pressureBelow: 30,              // darunter und nach Abmahnungen: „Druck auf Mitarbeiter“ (Ansehen)
  },
  // Führungsaktionen: Kosten in Tageslöhnen eines Mitarbeiters, Abkühlzeit in Spieltagen, Wirkung in Stimmungspunkten (kleiner bei guter Stimmung)
  lead: {
    praise: { gain: 3, cooldown: 8, fatigue: 0.7 },
    bonus: { gain: 10, costDays: 2, cooldown: 45 },
    party: { gain: 6, costDays: 1.5, baseDays: 6, cooldown: 90, christmas: 1.5 },
    gift: { gain: 4, costDays: 1, cooldown: 60 },
    warn: { loss: 14, others: 3, push: 1.5, pushDays: 14, cooldown: 30, repeatDays: 90 },
    fireMood: 4,                    // Entlassung verunsichert das Team (einmal, Punkte)
  },
  bots: { build: 0.04, lead: 0.12 },
};
