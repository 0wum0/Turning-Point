'use strict';
/** Preisindex (1945 = 1.0) mit logarithmischer Interpolation zwischen den Stützjahren. */
function priceIndex(year, econ) {
  const t = econ.priceIndex;
  if (year <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (year <= t[i][0]) {
      const [y0, v0] = t[i - 1];
      const [y1, v1] = t[i];
      if (y1 === y0 + 1 && v1 < v0) return year === y1 ? v1 : v0; // Währungsschnitt (Euro)
      const f = (year - y0) / (y1 - y0);
      return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * f);
    }
  }
  return t[t.length - 1][1];
}

const currencyOf = (year, econ) => (year >= (econ.euroYear || 2002) ? 'EUR' : 'DM');

/** Betrag in Cent (ganzzahlig) */
const scale = (base, idx, factor = 1) => Math.max(0, Math.round(base * idx * factor));

function formatMoney(cents, currency = 'DM') {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '−' : ''}${grouped},${rest} ${currency === 'EUR' ? '€' : 'DM'}`;
}

function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x)) * 1.25; // 1,25 = Straßenumweg
}

module.exports = { priceIndex, currencyOf, scale, formatMoney, haversineKm };
