// Tageszeit und Jahreszeit der Spielwelt (reine Funktionen, ohne DOM oder WebGL).
// Die Spielzeit läuft laut Serverkonfiguration mit der Echtzeituhr (Standard: 365 Spieltage je 24 Stunden,
// also ein Spieltag ≈ 4 Minuten). Aus dem Bruchteil des laufenden Spieltags wird die Stunde 0–24 abgeleitet.

const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
export const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Stunde (0 ≤ h < 24) aus der Spieluhr: `clock` = view.clock, `sampledAt` = Zeitpunkt der Ansicht, `now` = jetzt (ms). */
export function gameHour(clock, sampledAt, now = Date.now()) {
  const perMs = Number(clock && clock.perMs) || 0;
  if (!perMs) return 12;
  const carry = Math.max(0, Number(clock.carry) || 0);
  const elapsed = Math.max(0, now - (sampledAt || now));
  const frac = (carry + elapsed * perMs) % 1;
  return (frac * 24 + 24) % 24;
}

export function monthOf(doy) {
  const d = Math.max(0, Math.min(364, Math.floor(Number(doy) || 0)));
  let m = 0; while (m < 11 && d >= CUM[m + 1]) m++;
  return m;
}

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const circ = (a, b) => { const d = Math.abs(a - b) % 365; return Math.min(d, 365 - d); };

/** Jahreszeit mit fließenden Übergängen. snow/autumn/blossom/leaf ∈ [0,1]. */
export function seasonAt(doy) {
  const d = Math.max(0, Math.min(364, Number(doy) || 0));
  const month = monthOf(d);
  const snow = smooth(1 - (circ(d, 15) - 28) / 34);
  const autumn = smooth(1 - (circ(d, 292) - 18) / 40) * (1 - snow);
  const blossom = smooth(1 - (circ(d, 112) - 8) / 30) * (1 - snow);
  const leaf = 1 - snow * 0.55; // Laub: im Winter lichter
  const key = snow > .5 ? 'winter' : autumn > .5 ? 'autumn' : blossom > .5 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : (month >= 2 && month <= 4) ? 'spring' : month >= 8 && month <= 10 ? 'autumn' : month === 11 || month <= 1 ? 'winter' : 'summer';
  // Sonnenhöhe: Sommer hoch, Winter flach.
  const sunHeight = .5 + .5 * Math.cos(((d - 172) / 365) * Math.PI * 2) * .9;
  return { key, month, monthName: MONTHS_DE[month], snow, autumn, blossom, leaf: Math.max(.25, leaf), sunHeight: Math.max(.38, Math.min(1, sunHeight)) };
}

const KEYS = [
  [0, 0x050b1c, 0x14223f, 0x9fb6ff, 0.85, 0x6f8cc0, 0x2a3a30, 1.55, 1, 1.25],
  [4.8, 0x101c3a, 0x4a4b6e, 0x9fb6ff, 0.7, 0x7a90bc, 0x303a32, 1.45, .95, 1.22],
  [6.3, 0x3d5f99, 0xf0a46e, 0xffb472, 1.6, 0xa4b6cc, 0x4d5535, 1.6, .45, 1.22],
  [8.5, 0x5a95d6, 0xd2e4ee, 0xffe3b8, 2.5, 0xc4dcea, 0x586a3c, 1.9, 0, 1.22],
  [12, 0x4a90dc, 0xc3dff2, 0xfff5de, 3.0, 0xcde4f2, 0x5e7440, 2.1, 0, 1.2],
  [16.5, 0x5890d0, 0xdbe3e8, 0xffe6bf, 2.7, 0xc9dcea, 0x5a6c3c, 1.95, 0, 1.2],
  [18.6, 0x45609c, 0xf2a468, 0xff9c5c, 1.9, 0xb7bccb, 0x5a5a3a, 1.75, .4, 1.22],
  [20.2, 0x1d2b57, 0x8c5c6c, 0x9fb6ff, 0.8, 0x7d90b8, 0x343a30, 1.55, .9, 1.22],
  [22, 0x070e22, 0x192846, 0x9fb6ff, 0.85, 0x6f8cc0, 0x2a3a30, 1.55, 1, 1.25],
  [24, 0x050b1c, 0x14223f, 0x9fb6ff, 0.85, 0x6f8cc0, 0x2a3a30, 1.55, 1, 1.25],
];
const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const mixRGB = (a, b, t) => { const A = rgb(a), B = rgb(b); return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t); };
const mixNum = (a, b, t) => a + (b - a) * t;

/**
 * Beleuchtung und Himmel für Stunde `hour` (0–24) und Jahreszeit `season` (aus seasonAt).
 * Liefert Farben als 0xRRGGBB und die Sonnen-/Mondrichtung (normalisiert, y > 0).
 */
export function atmosphereAt(hour, season = seasonAt(180)) {
  const h = ((Number(hour) % 24) + 24) % 24;
  let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smooth((h - a[0]) / (b[0] - a[0] || 1));
  const out = {
    hour: h,
    skyTop: mixRGB(a[1], b[1], t), skyHorizon: mixRGB(a[2], b[2], t),
    sunColor: mixRGB(a[3], b[3], t), sunIntensity: mixNum(a[4], b[4], t),
    hemiSky: mixRGB(a[5], b[5], t), hemiGround: mixRGB(a[6], b[6], t), hemiIntensity: mixNum(a[7], b[7], t),
    glow: mixNum(a[8], b[8], t), exposure: mixNum(a[9], b[9], t),
  };
  // Jahreszeit färbt Licht und Himmel leicht um.
  const cold = Math.max(season.snow, 0), warm = season.autumn;
  out.sunColor = mixRGB(mixRGB(out.sunColor, 0xdfe9ff, cold * .35), 0xffc98a, warm * .3);
  out.skyHorizon = mixRGB(out.skyHorizon, 0xc9d4dc, cold * .35 * (1 - out.glow));
  out.hemiSky = mixRGB(out.hemiSky, 0xdbe7f2, cold * .3 * (1 - out.glow));
  out.sunIntensity *= 1 - cold * .15;
  // Richtung: Sonne von 6 bis 19:30 Uhr, danach der Mond auf demselben Bogen.
  const day = h >= 6 && h < 19.5;
  const p = day ? (h - 6) / 13.5 : (((h - 19.5 + 24) % 24) / 10.5);
  const ang = Math.max(0, Math.min(1, p)) * Math.PI;
  const elev = Math.sin(ang) * (day ? season.sunHeight : .7);
  const dir = [Math.cos(ang) * .95, Math.max(.16, elev), .5];
  const len = Math.hypot(...dir); out.sunDir = dir.map((x) => x / len);
  out.isNight = !day;
  out.starAlpha = Math.max(0, Math.min(1, (out.glow - .55) / .45));
  out.lampAlpha = Math.max(0, Math.min(1, out.glow));
  return out;
}

/** Gebäudehöhen etc. hängen nicht von der Zeit ab; hier nur der Klartext für Tooltips. */
export function dayPhaseLabel(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  return h < 5 ? 'Nacht' : h < 8 ? 'Morgen' : h < 17 ? 'Tag' : h < 21 ? 'Abend' : 'Nacht';
}
