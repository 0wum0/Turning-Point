'use strict';
/**
 * Standardwerte „Charakterblatt“ (Erfahrungspunkte, Ausstattung, gesellschaftlicher Rang). Im Admin unter Einstellungen → Charakterblatt änderbar (Einstellung `charakter`).
 * Preise sind Vielfache des Tageslohns eines Mitarbeiters (Wert von 1945 × Preisindex × Dienstleistungspreise der Stadt) – nie feste Cent-Werte,
 * damit alles mit Inflation und Stadtwirtschaft mitwächst. Zeiten sind Spieltage (ein Spieltag ≈ 4 Minuten echte Zeit, ein Spieljahr = 24 Stunden).
 * Waffen gibt es nicht: Schutz ist eine Dienstleistung (Wachdienst, Personenschutz), nichts, das man trägt.
 */
// Namen nach Epoche: [[ab Jahr, Name], …] – es gilt der letzte Eintrag mit „ab Jahr“ ≤ heute.
module.exports = {
  enabled: true,
  // Gemeinsamer Regler aller Wirkungen: 0 = ohne Wirkung (nur Status und Anzeige), 1 = normal, 2 = doppelt. Wirkungen sind gedeckelt und bleiben kleine Vorteile.
  effects: {
    strength: 1,
    repGainPct: 8,         // positive Zuwächse an Ansehen um bis zu so viel Prozent größer (Auftreten)
    raisePct: 4,           // Gehaltsgespräch: Chance um bis zu so viele Prozentpunkte höher
    applyPts: 3,           // Bewerbung: Chance um bis zu so viele Prozentpunkte höher
    votePct: 3,            // Wahlen: Stimmengewicht um bis zu so viel Prozent höher
    chancePct: 3,          // schnelle Kandidatur: Chance um bis zu so viele Prozentpunkte höher
    courtPts: 2,           // Gericht: Punkte in der Verteidigung/Anklage durch ein gepflegtes Auftreten
    comfortPts: 1,         // Wohlbefinden: Zielwert um bis zu so viele Punkte höher (Fahrzeug, Pflege)
    lookFrom: 10,          // unter diesem Auftreten (0–100) wirkt nichts; bis „lookFull“ steigt die Wirkung gleichmäßig
    lookFull: 80,
  },
  xp: {
    costBase: 2, costPerPoint: 0.12, costFrom: 35,   // Kosten eines Punktes bei Wert v: base + perPoint × max(0, v − from), gerundet
    waitDays: 14,                                    // Mindestabstand zwischen zwei Steigerungen desselben Talents
    yearMax: 6,                                      // höchstens so viele Steigerungen je Spieljahr (365 Tage)
    windowDays: 365,                                 // Fenster der Quellendeckel
    balMax: 60,                                      // höchstes Guthaben: wer nie verteilt, verschenkt Erfahrung
    startBal: 4,                                     // Startguthaben eines neuen Charakters (zwei erste Steigerungen); Altspielstände und Erben beginnen ohne
    inherit: { sharePct: 3, max: 5 },                     // der Erbe beginnt mit so viel Prozent der gesammelten Erfahrung, höchstens so viele Punkte (kleiner Bildungsvorsprung)
    // Quellen: Tätigkeiten. perDay = Erfahrung je Spieltag der Tätigkeit, act = Erfahrung je Aktion, cap = Deckel je Fenster. talent: Anzeige „wofür gedacht“.
    sources: {
      arbeit: { label: 'Berufspraxis', icon: 'hammer', talent: 'job', perDay: 0.01, capEp: 3.6, act: {}, text: 'Wer arbeitet – im Beruf oder im eigenen Betrieb –, sammelt Erfahrung im Berufsfeld.' },
      handel: { label: 'Verhandeln und Handeln', icon: 'handshake', talent: 'handel', perDay: 0.004, capEp: 2.5, act: { askRaise: 1 }, text: 'Gehaltsgespräche, Lieferverträge und Handelsrouten schulen das Verhandeln.' },
      fuehrung: { label: 'Menschen führen', icon: 'crown', talent: 'fuehrung', perDay: 0.005, capEp: 3, act: { bizPraise: 0.25, bizBonus: 0.4, bizParty: 0.5, bizGift: 0.2, bizHireApplicant: 0.3, runOffice: 1 }, text: 'Ein Team leiten, loben und fördern – und ein politisches Amt ausüben.' },
      lernen: { label: 'Lernen', icon: 'graduation-cap', talent: 'bildung', perDay: 0.012, capEp: 3.5, act: {}, text: 'Studium, Ausbildung und Weiterbildung kosten Zeit und bringen Erfahrung.' },
      begegnung: { label: 'Begegnungen', icon: 'sparkles', talent: 'charme', perDay: 0.004, capEp: 2, act: { gift: 0.3, together: 0.3, meet: 0.5, giftChild: 0.2 }, text: 'Vereine, Feste, Verabredungen und Geschenke: Menschen für sich gewinnen.' },
      sport: { label: 'Sport', icon: 'activity', talent: 'kondition', perDay: 0.006, capEp: 1.8, act: {}, text: 'Wer im Sportverein aktiv ist, bleibt fit.' },
    },
  },
  gear: {
    // Reparatur/Aufarbeiten: stellt den Zustand wieder her (Anteil am Neupreis), Wiederverkauf: Anteil am Kaufpreis, vom Zustand abhängig (inflationsbereinigt)
    refurbishPct: 25, repairTo: 92, repairBelow: 75, wornFloorPct: 55, datedMult: 0.85,
    items: {
      kleidung: {
        name: 'Kleidung', icon: 'shirt', kind: 'item', lifeYears: 6, modeYears: 12, resalePct: 25, upkeepYearPct: 0,
        what: 'Gepflegte Kleidung macht Eindruck: bei Gehaltsgesprächen, Bewerbungen, vor Gericht und bei Wahlen.',
        levels: [
          { names: [[1945, 'Sonntagsanzug'], [1990, 'Business-Outfit']], costDays: 14, look: 12, from: 1945, text: 'Ordentlich und gepflegt – der erste gute Eindruck.' },
          { names: [[1945, 'Maßanzug vom Schneider'], [1990, 'Marken-Anzug']], costDays: 45, look: 22, from: 1945, text: 'Gut geschnitten und hochwertig verarbeitet.' },
          { names: [[1945, 'Feine Garderobe'], [1990, 'Designer-Garderobe']], costDays: 130, look: 32, from: 1945, text: 'Maßgefertigt und exklusiv – man sieht, dass du dazugehörst.' },
        ],
      },
      uhr: {
        name: 'Uhr', icon: 'watch', kind: 'item', lifeYears: 40, modeYears: 40, resalePct: 60, upkeepYearPct: 0, heirloom: true,
        what: 'Eine gute Uhr hält ein Leben lang und kann vererbt werden.',
        levels: [
          { names: [[1945, 'Armbanduhr']], costDays: 18, look: 5, from: 1945, text: 'Zuverlässig und schlicht.' },
          { names: [[1945, 'Markenuhr']], costDays: 60, look: 9, from: 1945, text: 'Ein bekannter Hersteller, feines Uhrwerk.' },
          { names: [[1945, 'Luxusuhr']], costDays: 220, look: 14, from: 1945, text: 'Ein Statussymbol, das seinen Wert behält.' },
        ],
      },
      schmuck: {
        name: 'Schmuck', icon: 'gem', kind: 'item', lifeYears: 100, modeYears: 100, resalePct: 65, upkeepYearPct: 0, heirloom: true,
        what: 'Ringe und Schmuck: ein Erbstück, das über Generationen weitergegeben wird. (Eheringe kommen mit der Partnerschaft.)',
        levels: [
          { names: [[1945, 'Silberschmuck']], costDays: 20, look: 5, from: 1945, text: 'Eine feine Kette oder ein Ring aus Silber.' },
          { names: [[1945, 'Goldschmuck']], costDays: 70, look: 9, from: 1945, text: 'Gold, das man gern trägt – und lange behält.' },
          { names: [[1945, 'Juwelen']], costDays: 260, look: 14, from: 1945, text: 'Edelsteine und Perlen von einem Juwelier.' },
        ],
      },
      fahrzeug: {
        name: 'Fahrzeug', icon: 'car', kind: 'item', lifeYears: 12, modeYears: 15, resalePct: 45, upkeepYearPct: 5,
        what: 'Ein eigenes Fahrzeug ist bequem und zeigt Wohlstand. Es ist rein privat (die Frachtfahrzeuge deiner Betriebe sind etwas anderes) und kostet laufend Steuer, Versicherung und Sprit.',
        levels: [
          { names: [[1945, 'Fahrrad'], [2020, 'E-Bike']], costDays: 8, look: 7, from: 1945, text: 'Günstig, gesund und überall dabei.' },
          { names: [[1945, 'Motorroller'], [1960, 'Kleinwagen'], [2020, 'Elektro-Kleinwagen']], costDays: 90, look: 15, from: 1950, text: 'Mobil in der ganzen Region.' },
          { names: [[1945, 'Limousine'], [2020, 'Elektro-Limousine']], costDays: 330, look: 22, from: 1955, text: 'Komfortabel, repräsentativ und schnell.' },
        ],
      },
      mittel: {
        name: 'Arbeitsmittel', icon: 'briefcase', kind: 'item', lifeYears: 10, modeYears: 10, resalePct: 30, upkeepYearPct: 0,
        what: 'Aktentasche, Schreibmaschine, Computer: gute Arbeitsmittel machen einen professionellen Eindruck.',
        levels: [
          { names: [[1945, 'Aktentasche']], costDays: 6, look: 4, from: 1945, text: 'Unterlagen immer griffbereit.' },
          { names: [[1945, 'Schreibmaschine'], [1985, 'Personal Computer'], [2010, 'Laptop']], costDays: 25, look: 7, from: 1945, text: 'Briefe, Angebote und Rechnungen in sauberer Form.' },
          { names: [[1945, 'Büroausstattung'], [1995, 'Mobiltelefon und Laptop'], [2010, 'Smartphone und Laptop']], costDays: 70, look: 10, from: 1945, text: 'Immer erreichbar und bestens organisiert.' },
        ],
      },
      pflege: {
        name: 'Pflege', icon: 'sparkles', kind: 'service',
        what: 'Friseur, Kosmetik und Wellness. Eine laufende Dienstleistung, die du jederzeit beenden kannst.',
        levels: [
          { names: [[1945, 'Friseur und Pflege']], dayDays: 0.04, look: 4, comfort: 0.5, from: 1945, text: 'Regelmäßig beim Friseur.' },
          { names: [[1945, 'Kosmetik und Wellness']], dayDays: 0.12, look: 8, comfort: 1, from: 1945, text: 'Regelmäßige Pflege und Entspannung.' },
        ],
      },
      schutz: {
        name: 'Sicherheitsdienst', icon: 'shield', kind: 'service',
        what: 'Eine Dienstleistung, kein Gegenstand: Ein Wachdienst achtet auf dein Zuhause, später begleitet dich Personenschutz. Beides senkt das Risiko von Einbrüchen. (Waffen gibt es im Spiel nicht.)',
        levels: [
          { names: [[1945, 'Wachdienst für das Zuhause'], [1990, 'Alarmanlage mit Wachdienst']], dayDays: 0.08, look: 0, burglaryMult: 0.6, from: 1945, text: 'Nachts schaut ein Wachdienst nach dem Rechten.' },
          { names: [[1945, 'Personenschutz'], [1990, 'Personenschutz und Hausüberwachung']], dayDays: 0.4, look: 4, burglaryMult: 0.35, from: 1960, text: 'Ein Sicherheitsunternehmen schützt dich und dein Zuhause.' },
        ],
      },
    },
  },
  rank: {
    // Punkte (0–100) aus Ansehen, Vermögen (inflationsbereinigt), Titeln und Ämtern, Auftreten und Herkunft. Der Rang sperrt nichts, er bringt nur weiche Vorteile.
    weights: { rep: 38, wealth: 30, title: 15, gear: 10, origin: 7 },
    repFull: 80,                                       // Ansehen (−100 … 100), ab dem der Anteil voll zählt
    wealthMinDM: 300, wealthMaxDM: 3000000,            // Vermögen in DM von 1945: darunter 0 Punkte, darüber alle Punkte (logarithmisch dazwischen)
    titlePerRank: 3, officePerStep: 2,                 // je Titelstufe, je höchstem Amt (Ortsbeirat = 1 … Bundeskanzler = 6)
    legacyPct: 12, legacyMax: 7, legacyDecayPct: 2,    // Herkunft: Anteil am Rang-Wert des Vorfahren, Höchstwert, Verfall je Spieljahr
    hysteresis: 3,                                     // ein Rang geht erst verloren, wenn die Punktzahl so viele Punkte unter der Grenze liegt
    checkDays: 5,
    ranks: [
      { name: 'Einwohner', at: 0, text: 'Du bist neu in der Stadt und baust dir etwas auf.' },
      { name: 'Bürger', at: 10, text: 'Du hast dich eingelebt und bist als verlässlicher Nachbar bekannt.' },
      { name: 'Etablierter Bürger', at: 24, text: 'Du hast einen guten Ruf und ein gesichertes Auskommen.' },
      { name: 'Stadtbekannte Persönlichkeit', at: 38, text: 'In deiner Stadt kennt man dich – und man hört auf dich.' },
      { name: 'Prominenz', at: 52, text: 'Ein Name mit Gewicht: Einladungen und Vorteile kommen von selbst.' },
      { name: 'Gesellschaftliche Größe', at: 66, text: 'Du gehörst zu den einflussreichen Familien des Landes.' },
      { name: 'Spitze der Gesellschaft', at: 80, text: 'Wenige erreichen diesen Rang: Du bist eine Institution.' },
    ],
    // Weiche Vorteile je Rang (Index 0 = Rang 1). Nichts davon sperrt etwas: Ämter, Kauf und Wahl bleiben für alle offen.
    perks: {
      homeDiscPct: [0, 0, 0.5, 1, 1.5, 2, 3],          // Immobilien-Kaufpreis: Nachlass in Prozent („Beziehungen“)
      offerFrom: 4,                                    // ab diesem Rang erscheint wöchentlich ein Vorab-Angebot einer Premium-Wohnlage
      contacts: [0, 0, 0, 1, 1.5, 2, 3],               // Bewerbung: Prozentpunkte durch Beziehungen
      feeDiscPct: [0, 0, 0, 0, 5, 10, 15],             // Kandidaturgebühr: Nachlass in Prozent (zusammen mit den Titeln höchstens der Deckel der Gesellschaft)
      clubSlots: [0, 0, 0, 0, 1, 1, 2],                // zusätzliche Vereinsplätze (zusammen mit den Titeln höchstens 2)
    },
    tagesblattFrom: 5,                                 // Aufstiege ab diesem Rang erscheinen im Tagesblatt (nur mit sichtbarem Profil)
  },
  bots: { buy: 0.03, spend: 0.25 },
};
