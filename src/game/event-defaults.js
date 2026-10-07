'use strict';
/** Standardwerte aller Zufallsereignisse (im Admin unter Wirtschaft → Ereignisse änderbar). */
module.exports = {
  town: {
    // Gewichte je Stadtereignis-Typ; countWeights = Wahrscheinlichkeit für 0, 1, 2 Ereignisse pro Woche
    weights: { storm: 3, fire: 1.2, burglary: 2, festival: 2, lotto: 1.5, market: 2 },
    countWeights: [3, 4, 2],
    stormSummerFactor: 2, stormOtherFactor: 0.7,
    stormHitChance: 0.4, stormCostPct: 6, stormClosedDays: 14,
    fireHitChance: 0.12, fireCostPct: 25, fireClosedDays: 60,
    burglaryChance: 0.3, burglaryLossPct: 12, burglaryMax: 5000,
    festivalWellBoost: 10,
  },
  private: {
    rate: 26, poorRate: 12, poorLuck: 5, // 1 Ereignis pro `rate` Tage (bei Not pro `poorRate`)
    gold: 1500, gift: 600, heritage: 15000, bag: 4000, sick: 800, sickHealth: 15,
  },
  business: {
    chance: 0.12, strikeMinStaff: 3, strikeMinDays: 4, strikeMaxDays: 9,
    inspectionBonus: 150, finePerRoom: 40, fineBase: 400, praiseBase: 200, praisePerRoom: 30, theftLoss: 250,
  },
};
