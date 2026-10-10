'use strict';
/**
 * Zeitungsmeldungen zu Jahreszeit, Wetter, Ernte, Festen und Seuchen – rein aus dem Spieldatum (keine Speicherung).
 * Die Ausgabe der Zeitung zeigt sie neben den Stadtereignissen.
 */
const SE = require('./seasons');
const HV = require('./harvest');
const EP = require('./epidemics');
const SFX = require('./seasonfx');

const item = (title, text, section, big = false) => ({ title, text, day: 0, ago: 0, type: 'press', section, big });

function seasonNews(world, state, city) {
  const out = [];
  if (!city) return out;
  const { year, doy } = SFX.when(state);
  const ef = SFX.effects(world, city.id);
  const place = city.name; const region = city.state;
  if (HV.C().on && doy >= 262 && doy <= 330) {
    const r = HV.report(year, region);
    const tail = r.yield < 0.9 ? 'Lebensmittel werden teurer, Landwirte verdienen weniger. Die Politik kann mit einer Ernte- und Dürrehilfe gegensteuern.' : r.yield >= 1.07 ? 'Lebensmittel bleiben günstig, Landwirte verdienen mehr.' : 'Die Preise bleiben stabil.';
    out.push(item(`Erntebericht ${year}: ${r.label}`, `Die Ernte in ${region} fällt ${r.label.replace(/^(\w)/, (m) => m.toLowerCase())} aus (${Math.round(r.yield * 100)} % eines Normaljahres). ${tail}`, 'Wirtschaft', r.yield < 0.8 || r.yield > 1.15));
    if (r.flood) out.push(item(`Hochwasser in ${region}`, `Die Flut hat in ${region} Felder und Keller überschwemmt. Die Ernte leidet, die Hilfe läuft an.`, 'Lokales', true));
  }
  const w = HV.weatherOf(year);
  if (doy < 90 && HV.winterSeverity(year, doy) >= 0.75) out.push(item('Strenger Winter', `Eis und Schnee halten ${place} fest. Heizen wird teurer, Bau und Ausflüge ruhen, Erkältungen häufen sich.`, 'Lokales', true));
  if (doy >= 151 && doy < 243 && w.heat >= 1.3) out.push(item('Hitze und Trockenheit', `Seit Wochen fällt kaum Regen. Die Bauern in ${region} bangen um ihre Ernte.`, 'Wirtschaft'));
  for (const f of SE.festivalsOn(city, doy)) out.push(item(`${f.name} in ${place}`, f.text, 'Lokales'));
  const sit = EP.situation(world, year, doy, city, ef);
  const wv = sit.waves.filter((x) => x.I > 0.02 || (x.daysToStart > 0 && x.daysToStart < 25)).sort((a, b) => b.Ieff - a.Ieff)[0];
  if (wv) {
    const lvl = wv.I >= 0.6 ? 'hoch' : wv.I >= 0.25 ? 'mittel' : wv.I > 0.02 ? 'gering' : null;
    if (!lvl) out.push(item(`${wv.name}: Welle naht`, `${wv.name} breitet sich aus und erreicht ${place} in etwa ${wv.daysToStart} Tagen. Hygienepaket, Impfung und Schutzkonzepte können helfen.`, 'Gesundheit', true));
    else out.push(item(`${wv.name} in ${place}`, `Die Lage in ${place} ist ${lvl}. ${sit.level > 0 ? `Es gilt: ${EP.MEASURE_NAME[sit.level]}.` : 'Es gelten keine besonderen Maßnahmen.'} Betriebe melden Krankenstand von ${Math.round(sit.sickShare * 1000) / 10} %.`, 'Gesundheit', wv.I >= 0.6));
  }
  return out.map((n) => ({ ...n, day: state.day }));
}

module.exports = { seasonNews };
