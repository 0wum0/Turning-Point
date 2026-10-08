'use strict';
/** Steuern: progressive Einkommensteuer auf Lohn, Mieteinnahmen und Amtsbezüge (Schwellen in „Wert von 1945“), Gewerbesteuer auf Betriebsgewinne. */
const settings = require('../settings');

const cfg = () => settings.get('tax');

/** Jahressteuer (reale Beträge in DM 1945, nicht Cent) nach Stufen [[bis, Satz], …]. */
function annual(realYear) {
  const B = cfg().brackets; let tax = 0; let from = 0;
  for (const [upTo, rate] of B) { const part = Math.min(realYear, upTo) - from; if (part > 0) tax += part * rate; from = upTo; if (realYear <= upTo) break; }
  if (B.length && realYear > from) tax += (realYear - from) * B[B.length - 1][1]; // Einkommen über der letzten Stufe (vom Admin geändert) wird mit dem Höchstsatz besteuert, nicht gar nicht
  return tax;
}

/** Tagessteuer in Cent (heutige Preise) auf das tägliche steuerpflichtige Einkommen. */
function incomeTaxPerDay(idx, taxableCentsPerDay) {
  if (!cfg().enabled || taxableCentsPerDay <= 0) return 0;
  const realYear = (taxableCentsPerDay / idx / 100) * 365;
  return Math.round((annual(realYear) * 100 * idx) / 365);
}
const corporateTax = (profit) => (cfg().enabled && profit > 0 ? Math.round((profit * cfg().corporatePct) / 100) : 0);

module.exports = { incomeTaxPerDay, corporateTax, annual };
