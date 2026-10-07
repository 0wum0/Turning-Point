'use strict';
/**
 * Spielkalender: 1 Jahr = 365 Tage = 365 EFS. Kein Schaltjahr (bewusst einfach).
 * Tag 0 = 1. Januar des Startjahres.
 */
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CUM = DIM.reduce((a, d, i) => { a.push((a[i - 1] || 0) + (i ? DIM[i - 1] : 0)); return a; }, []).slice(0, 12);

function dateOf(day, startYear = 1945) {
  const y = Math.floor(day / 365);
  const doy = day - y * 365;
  let m = 11;
  for (let i = 0; i < 12; i++) { if (doy < (CUM[i + 1] === undefined ? 365 : CUM[i + 1])) { m = i; break; } }
  return { year: startYear + y, month: m, dom: doy - CUM[m] + 1, doy };
}
const yearOf = (day, startYear = 1945) => startYear + Math.floor(day / 365);
function formatDate(day, startYear = 1945) {
  const d = dateOf(day, startYear);
  return `${d.dom}. ${MONTHS[d.month]} ${d.year}`;
}
const ageYears = (birthDay, day) => Math.floor((day - birthDay) / 365);
/** Jahreszeit 0=Winter 1=Frühling 2=Sommer 3=Herbst */
function season(day, startYear = 1945) {
  const m = dateOf(day, startYear).month;
  if (m === 11 || m < 2) return 0;
  if (m < 5) return 1;
  if (m < 8) return 2;
  return 3;
}
/** Tag (seit Start) des 1. Januar eines Jahres */
const dayOfYearStart = (year, startYear = 1945) => (year - startYear) * 365;

module.exports = { dateOf, yearOf, formatDate, ageYears, season, dayOfYearStart, MONTHS };
