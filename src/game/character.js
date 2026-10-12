'use strict';
/**
 * Charakterblatt: Erfahrungspunkte (EP), Ausstattung und gesellschaftlicher Rang (rein, ohne Datenbank).
 *
 * Spielstand (alles optional; fehlt es, gilt der neutrale Zustand – Altspielstände brauchen keine Umstellung, `ensure` ist idempotent):
 *   state.talents.xp = { bal, tot, spent, auto, src, buys, last }   Erfahrungskonto an den Talenten der Spielfigur (src: Quellen im Fenster, buys: letzte Steigerungen)
 *   state.char = { gear, svc, heir, rank, legacy }                  gear: gekaufte Stücke je Platz, svc: laufende Dienstleistungen, heir: Erbstücke, rank: gespeicherter Rang, legacy: Herkunft
 *
 * EP entstehen aus Tätigkeiten (Berufspraxis, Verhandeln, Führen, Lernen, Begegnungen, Sport) mit einem Deckel je Quelle und Fenster und werden vom Spieler
 * auf die vorhandenen Talente verteilt (Obergrenze `talents.capAt`, Kosten steigen mit dem Wert, Wartezeit je Talent, Höchstzahl je Jahr) – die Talente selbst
 * ändert nur `talents.grow`. Ausstattung wirkt klein und gedeckelt (Auftreten 0–100) und ist vor allem Status; sie kostet laufend Geld, nutzt sich ab und
 * lässt sich mit Abschlag wieder verkaufen. Der Rang (1–7) wird aus Ansehen, Vermögen, Titeln, Auftreten und Herkunft berechnet und bringt nur weiche Vorteile.
 * Alle Wirkungen laufen unter `charakter.effects.strength` (0 = aus). Geld bewegt sich nur im Spielstand des Spielers (state.money), genau einmal je Aktion.
 */
const settings = require('../settings');
const D = require('./character-defaults');
const TL = require('./talents');
const { yearOf } = require('./calendar');

const SLOTS = ['kleidung', 'uhr', 'schmuck', 'fahrzeug', 'mittel', 'pflege', 'schutz'];
const num = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (x) => Math.round(x * 10) / 10 + 0;
const r2 = (x) => Math.round(x * 100) / 100 + 0;
const r3 = (x) => Math.round(x * 1000) / 1000 + 0;
const C = () => settings.get('charakter') || D;
const enabled = () => C().enabled !== false;
const E = () => ({ ...D.effects, ...(C().effects || {}) });
const strength = () => (enabled() ? clamp(num(E().strength, 1), 0, 2) : 0);
const XP = () => ({ ...D.xp, ...(C().xp || {}) });
const GEAR = () => ({ ...D.gear, ...(C().gear || {}) });
const RANK = () => ({ ...D.rank, ...(C().rank || {}) });
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/* ------------------------------------------------------------------ Spielstand ------------------------------------------------------------------ */
function newXp() { return { bal: 0, tot: 0, spent: 0, auto: false, src: {}, buys: [], last: [] }; }
function newChar() { return { gear: {}, svc: {}, heir: [], rank: { lv: 1, sc: 0, best: 1, since: 0 }, legacy: null }; }

/** Alles sicherstellen und bereinigen (idempotent). Fehlende Felder = neutraler Zustand; Unsinn wird auf gültige Werte gezogen. */
function ensure(state) {
  if (!state) return state;
  const p = state.talents;
  if (p && typeof p === 'object') {
    if (!isObj(p.xp)) p.xp = newXp();
    const x = p.xp;
    x.bal = r3(clamp(num(x.bal, 0), 0, num(XP().balMax, 60)));
    x.tot = r3(Math.max(0, num(x.tot, 0))); x.spent = Math.max(0, Math.floor(num(x.spent, 0)));
    x.auto = !!x.auto;
    if (!isObj(x.src)) x.src = {};
    for (const k of Object.keys(x.src)) { const e = x.src[k]; if (!Array.isArray(e) || e.length !== 2 || !Number.isFinite(e[0]) || !Number.isFinite(e[1])) delete x.src[k]; }
    if (!Array.isArray(x.buys)) x.buys = [];
    x.buys = x.buys.filter((b) => Array.isArray(b) && Number.isFinite(b[0]) && Number.isInteger(b[1]) && b[1] >= 0 && b[1] < TL.KEYS.length).slice(-40);
    if (!Array.isArray(x.last)) x.last = [];
    x.last = x.last.filter((e) => isObj(e) && typeof e.s === 'string' && Number.isFinite(e.p) && Number.isFinite(e.d)).slice(-8);
  }
  if (!isObj(state.char)) state.char = newChar();
  const c = state.char;
  if (!isObj(c.gear)) c.gear = {};
  for (const k of Object.keys(c.gear)) {
    const g = c.gear[k];
    if (!SLOTS.includes(k) || !isObj(g) || isService(k) || !Number.isInteger(g.lv) || g.lv < 1 || g.lv > 3) { delete c.gear[k]; continue; }
    g.paid = Math.max(0, Math.round(num(g.paid, 0))); g.cond = r3(clamp(num(g.cond, 100), 0, 100)); g.day = Math.floor(num(g.day, 0)); g.y = Math.floor(num(g.y, 1945));
  }
  if (!isObj(c.svc)) c.svc = {};
  for (const k of Object.keys(c.svc)) { if (!isService(k) || !Number.isInteger(c.svc[k]) || c.svc[k] < 1 || c.svc[k] > 2) delete c.svc[k]; }
  if (!Array.isArray(c.heir)) c.heir = [];
  c.heir = c.heir.filter((h) => isObj(h) && ['uhr', 'schmuck'].includes(h.slot) && Number.isInteger(h.lv) && h.lv >= 1 && h.lv <= 3).map((h) => ({ slot: h.slot, lv: h.lv, cond: r3(clamp(num(h.cond, 90), 0, 100)), gen: Math.max(1, Math.floor(num(h.gen, 1))) }));
  const seen = new Set(); c.heir = c.heir.filter((h) => (seen.has(h.slot) ? false : seen.add(h.slot)));
  if (!isObj(c.rank)) c.rank = { lv: 1, sc: 0, best: 1, since: 0 };
  c.rank.lv = clamp(Math.floor(num(c.rank.lv, 1)), 1, 7); c.rank.sc = r1(clamp(num(c.rank.sc, 0), 0, 100)); c.rank.best = clamp(Math.floor(num(c.rank.best, c.rank.lv)), c.rank.lv, 7); c.rank.since = Math.floor(num(c.rank.since, 0));
  if (c.legacy != null && !(isObj(c.legacy) && Number.isFinite(c.legacy.pts) && Number.isFinite(c.legacy.day))) c.legacy = null;
  if (c.legacy) c.legacy.pts = r1(clamp(c.legacy.pts, 0, 100));
  return state;
}
const isService = (slot) => ((GEAR().items || {})[slot] || D.gear.items[slot] || {}).kind === 'service';
const slotCfg = (slot) => {
  const d = D.gear.items[slot]; const c = (GEAR().items || {})[slot];
  return c && Array.isArray(c.levels) && c.levels.length === d.levels.length ? c : d;
};
const xpOf = (state) => (state && state.talents && isObj(state.talents.xp) ? state.talents.xp : null);

/* ------------------------------------------------------------------ Preise ------------------------------------------------------------------ */
/** Tageslohn eines Mitarbeiters in Cent heutiger Preise, mit den Dienstleistungspreisen der Stadt (Stadtwirtschaft). */
function wageUnit(world, state, year) {
  const idx = world.idx(year); const city = world.city(state.cityId);
  const ce = require('./cityecon');
  const f = ce.staticFactor(city, 'services') * ce.servicesMult(state.cityId, year);
  return world.econ.companies.staffWage * idx * f;
}
const levelDef = (slot, lv) => (lv >= 1 ? slotCfg(slot).levels[lv - 1] || null : null);
function levelName(slot, lv, year) {
  const L = levelDef(slot, lv); if (!L) return slot === 'kleidung' ? 'Alltagskleidung' : '';
  const names = Array.isArray(L.names) ? L.names : [[1945, String(L.name || '')]];
  let out = names[0][1];
  for (const [from, nm] of names) if (year >= from) out = nm;
  return out;
}
const eraOk = (slot, lv, year) => { const L = levelDef(slot, lv); return !!L && year >= num(L.from, 1945); };
/** Preis eines Stücks (Cent). */
function price(world, state, slot, lv, year) {
  const L = levelDef(slot, lv); if (!L || isService(slot)) return 0;
  return Math.max(1, Math.round(num(L.costDays, 1) * wageUnit(world, state, year)));
}
/** Laufende Kosten je Tag (Cent): Dienstleistung = Tagessatz, Stück = Anteil am heutigen Neupreis (Steuer, Versicherung, Sprit). */
function dayCost(world, state, slot, lv, year) {
  const L = levelDef(slot, lv); if (!L) return 0;
  if (isService(slot)) return Math.round(num(L.dayDays, 0) * wageUnit(world, state, year));
  return Math.round(price(world, state, slot, lv, year) * num(slotCfg(slot).upkeepYearPct, 0) / 100 / 365);
}
/** Eigenes Stück eines Platzes (ohne Erbstück) oder null. */
const own = (state, slot) => (state && state.char && state.char.gear ? state.char.gear[slot] || null : null);
const heirOf = (state, slot) => (state && state.char && Array.isArray(state.char.heir) ? state.char.heir.find((h) => h.slot === slot) || null : null);
/** Wirksames Stück eines Platzes: das bessere aus eigenem Stück und Erbstück. */
function piece(state, slot) {
  const o = own(state, slot); const h = heirOf(state, slot);
  if (o && (!h || o.lv >= h.lv)) return { lv: o.lv, cond: o.cond, y: o.y, own: true, item: o };
  if (h) return { lv: h.lv, cond: h.cond, y: null, own: false, heir: h };
  return null;
}
const wornFactor = (cond) => { const f = clamp(num(GEAR().wornFloorPct, 55), 0, 100) / 100; return f + (1 - f) * clamp(cond, 0, 100) / 100; };
const isDated = (slot, p, year) => !!p && p.y != null && year - p.y >= num(slotCfg(slot).modeYears, 12);
/** Beitrag eines Platzes zum Auftreten (Punkte). */
function slotLook(state, slot, year) {
  if (isService(slot)) { const lv = state.char.svc[slot] || 0; const L = levelDef(slot, lv); return L ? num(L.look, 0) : 0; }
  const p = piece(state, slot); if (!p) return slot === 'kleidung' ? 4 : 0;
  const L = levelDef(slot, p.lv); if (!L) return 0;
  return num(L.look, 0) * wornFactor(p.cond) * (isDated(slot, p, year) ? num(GEAR().datedMult, 0.85) : 1);
}
/** Auftreten 0–100: die Summe aller Plätze (Alltagskleidung zählt 4 Punkte). */
function look(state, year) {
  if (!state || !state.char) return 0;
  let s = 0; for (const k of SLOTS) s += slotLook(state, k, year);
  return r1(clamp(s, 0, 100));
}
/** 0…1: wie viel der gedeckelten Wirkungen das Auftreten freischaltet (unter „lookFrom“ nichts, ab „lookFull“ alles). */
function lookNorm(L) { const e = E(); return clamp((L - num(e.lookFrom, 10)) / Math.max(1, num(e.lookFull, 80) - num(e.lookFrom, 10)), 0, 1); }
const BANDS = ['schlicht', 'gepflegt', 'repräsentativ', 'glanzvoll'];
const lookBand = (L) => (L < 15 ? 0 : L < 40 ? 1 : L < 70 ? 2 : 3);

/* ------------------------------------------------------------------ Wirkungen (klein, gedeckelt) ------------------------------------------------------------------ */
const yr = (state) => yearOf(state.day, state.startYear);
const nrm = (state) => (strength() > 0 && state && state.char ? lookNorm(look(state, yr(state))) : 0);
/** Faktor auf positive Zuwächse an Ansehen (1 … 1,08). */
const repGain = (state) => r2(1 + (num(E().repGainPct, 8) / 100) * nrm(state) * strength());
/** Zuschlag auf die Chance im Gehaltsgespräch (Anteil 0–1). */
const raiseAdd = (state) => r3((num(E().raisePct, 4) / 100) * nrm(state) * strength());
/** Zuschlag auf die Bewerbungschance (Prozentpunkte): Auftreten plus Beziehungen des Rangs. */
const applyPts = (state) => r1(num(E().applyPts, 3) * nrm(state) * strength() + perk(state, 'contacts') * Math.min(1, strength()));
/** Stimmengewicht bei Wahlen (1 … 1,03); `ofLook` rechnet aus dem veröffentlichten Auftreten (0–100) eines anderen Kontos. */
const voteOfLook = (L) => r3(1 + (num(E().votePct, 3) / 100) * (strength() > 0 ? lookNorm(num(L, 0)) : 0) * strength());
const voteMult = (state) => r3(1 + (num(E().votePct, 3) / 100) * nrm(state) * strength());
/** Zuschlag auf die Chance der schnellen Kandidatur (Anteil 0–1). */
const chanceAdd = (state) => r3((num(E().chancePct, 3) / 100) * nrm(state) * strength());
/** Punkte in der Verteidigung/Anklage vor Gericht (auch aus dem veröffentlichten Auftreten eines anderen Kontos). */
const courtPts = (state) => r1(num(E().courtPts, 2) * nrm(state) * strength());
const courtOfLook = (L) => r1(num(E().courtPts, 2) * (strength() > 0 ? lookNorm(num(L, 0)) : 0) * strength());
/** Wohlbefinden-Zuschlag im Zielwert: Fahrzeug, Pflege und ein gutes Zuhause (nutzt die Plätze selbst, nicht das Auftreten). */
function comfort(state) {
  if (!state || !state.char || strength() <= 0) return 0;
  let c = 0;
  const v = piece(state, 'fahrzeug'); if (v) c += [0, 0.4, 0.7, 1][v.lv] || 0;
  const pl = state.char.svc.pflege; if (pl) c += num((levelDef('pflege', pl) || {}).comfort, 0);
  return r2(clamp(c, 0, 1.5) * num(E().comfortPts, 1) * Math.min(1, strength()));
}
/** Faktor auf die Einbruchswahrscheinlichkeit durch den Sicherheitsdienst (Dienstleistung). */
function burglaryMult(state) {
  const lv = state && state.char && state.char.svc ? state.char.svc.schutz || 0 : 0; const L = levelDef('schutz', lv);
  if (!L || strength() <= 0) return 1;
  return r2(clamp(1 + (num(L.burglaryMult, 1) - 1) * Math.min(1, strength()), 0.2, 1));
}
function wirkungen(state) {
  return { repGain: repGain(state), raise: raiseAdd(state), apply: applyPts(state), vote: voteMult(state), chance: chanceAdd(state), court: courtPts(state), comfort: comfort(state), burglary: burglaryMult(state) };
}

/* ------------------------------------------------------------------ Rang ------------------------------------------------------------------ */
const rankLevels = () => { const l = RANK().ranks; return Array.isArray(l) && l.length === 7 ? l : D.rank.ranks; };
/** Vorteil des aktuellen Rangs (Index = Rang − 1) aus der Liste perks[name]; ohne Charakterblatt 0. */
function perk(state, name) {
  if (!state || !state.char || !enabled()) return 0;
  const list = (RANK().perks || {})[name]; if (!Array.isArray(list)) return 0;
  return num(list[clamp(state.char.rank.lv, 1, 7) - 1], 0);
}
/** Punkte des Rangs aus den fünf Quellen (rein; world nur für Preisindex und Vermögen). */
function rankParts(world, state) {
  const R = RANK(); const W = { ...D.rank.weights, ...(R.weights || {}) };
  const rp = require('./reputation'); const st = rp.stand(state);
  const year = yr(state); const idx = Math.max(0.0001, world.idx(year));
  const rep = W.rep * clamp(st.s / Math.max(1, num(R.repFull, 80)), 0, 1);
  const worthDM = Math.max(0, require('./core').netWorth(world, state)) / idx / 100;
  const lo = Math.max(1, num(R.wealthMinDM, 300)); const hi = Math.max(lo * 2, num(R.wealthMaxDM, 3000000));
  const wealth = W.wealth * clamp(Math.log10(Math.max(1, worthDM) / lo) / Math.log10(hi / lo), 0, 1);
  const titles = state.civic && Array.isArray(state.civic.titles) ? state.civic.titles : [];
  const best = new Map(); for (const t of titles) if (t && t.key) best.set(t.key, Math.max(num(best.get(t.key), 0), clamp(Math.floor(num(t.rank, 1)), 1, 3)));
  let step = 0; const done = (state.politics && state.politics.completed) || {};
  for (const k of Object.keys(done)) if (num(done[k], 0) > 0) step = Math.max(step, Number(k) + 1);
  if (state.politics && state.politics.term) step = Math.max(step, num(state.politics.term.idx, 0) + 1);
  const title = clamp([...best.values()].reduce((a, b) => a + b, 0) * num(R.titlePerRank, 3) + step * num(R.officePerStep, 2), 0, W.title);
  const gear = W.gear * clamp(look(state, year) / 100, 0, 1);
  let legacy = 0;
  if (state.char && state.char.legacy) { const yrs = Math.max(0, (state.day - num(state.char.legacy.day, 0)) / 365); legacy = clamp(state.char.legacy.pts * Math.pow(1 - clamp(num(R.legacyDecayPct, 2), 0, 50) / 100, yrs), 0, W.origin); }
  const total = clamp(rep + wealth + title + gear + legacy, 0, 100);
  return { rep: r1(rep), wealth: r1(wealth), title: r1(title), gear: r1(gear), legacy: r1(legacy), total: r1(total), worthDM: Math.round(worthDM) };
}
/** Rang zu einer Punktzahl mit Trägheit: Aufstieg ab der Grenze, Abstieg erst „hysteresis“ Punkte darunter. */
function rankFor(score, prevLv) {
  const L = rankLevels(); const hy = num(RANK().hysteresis, 3);
  let up = 1; for (let i = 0; i < L.length; i++) if (score >= num(L[i].at, 0)) up = i + 1;
  if (prevLv && prevLv > up) { let keep = up; for (let lv = prevLv; lv > up; lv--) if (score >= num(L[lv - 1].at, 0) - hy) { keep = lv; break; } return keep; }
  return up;
}
/**
 * Rang neu berechnen und im Spielstand festhalten. Gibt { changed, from, to, parts } zurück. Aufstiege werden vermerkt
 * (Chronik, Meldung, Vormerkung fürs Protokoll); Abstiege geschehen still, damit nichts frustriert.
 */
function checkRank(world, state, { silent = false } = {}) {
  if (!state || !state.char) return null;
  const parts = rankParts(world, state); const c = state.char; const from = c.rank.lv;
  const to = enabled() ? rankFor(parts.total, from) : 1;
  c.rank.sc = parts.total;
  if (to === from) return { changed: false, from, to, parts };
  c.rank.lv = to; c.rank.since = state.day;
  if (to > from && to > c.rank.best) c.rank.best = to;
  if (to > from && !silent) {
    const core = require('./core'); const nm = rankLevels()[to - 1].name;
    core.chronicle(state, `${state.person.first} steigt zum Rang „${nm}“ auf.`, 'rank');
    core.notice(state, { level: 'good', title: `Neuer Rang: ${nm}`, tab: 'character', text: `Dein gesellschaftlicher Rang ist jetzt „${nm}“. ${rankLevels()[to - 1].text}`, info: ['Ansehen, Vermögen, Titel und ein gepflegtes Auftreten heben deinen Rang.', 'Ein höherer Rang bringt weiche Vorteile, etwa günstigere Immobilien und mehr Beziehungen – gesperrt wird dadurch nichts.', 'Im Charakterblatt siehst du, was dir noch zum nächsten Rang fehlt.'] });
    queueLog(state, { k: 'rank', lv: to, from, city: state.cityId, sc: parts.total });
  }
  return { changed: true, from, to, parts };
}

/* ------------------------------------------------------------------ Protokoll (Vormerkungen, die beim Speichern genau einmal in die Datenbank wandern) ------------------------------------------------------------------ */
function queueLog(state, e) {
  if (!state.pending) state.pending = {};
  const q = state.pending.char || (state.pending.char = []);
  if (q.length < 20) q.push(e);
}

/* ------------------------------------------------------------------ Erfahrungspunkte ------------------------------------------------------------------ */
const srcDefs = () => { const s = XP().sources; return isObj(s) ? s : D.xp.sources; };
const srcDef = (key) => srcDefs()[key] || null;
const windowOf = (day) => { const w = Math.max(30, Math.floor(num(XP().windowDays, 365))); return Math.floor(day / w) * w; };
/** Schon erhaltene EP einer Quelle im laufenden Fenster. */
function srcGot(state, key) { const x = xpOf(state); const e = x && x.src[key]; return e && e[0] === windowOf(state.day) ? e[1] : 0; }
/**
 * EP gutschreiben (höchstens bis zum Deckel der Quelle im Fenster und bis zum Höchstguthaben). Gibt die tatsächlich gutgeschriebenen EP zurück.
 * Aufrufer: Tätigkeiten (Aktionen, Tageslauf). Ohne Talente oder bei Stärke 0 passiert nichts.
 */
function award(state, key, pts) {
  const x = xpOf(state); const D0 = srcDef(key);
  if (!x || !D0 || !enabled() || !TL.enabled()) return 0;
  const want = Math.max(0, num(pts, 0)); if (want <= 0) return 0;
  const w0 = windowOf(state.day); const got = srcGot(state, key);
  let give = Math.min(want, Math.max(0, num(D0.capEp, 0) - got), Math.max(0, num(XP().balMax, 60) - x.bal));
  give = r3(give); if (give <= 0) return 0;
  x.src[key] = [w0, r3(got + give)];
  x.bal = r3(Math.min(num(XP().balMax, 60), x.bal + give)); x.tot = r3(x.tot + give);
  const last = x.last.slice().reverse().find((e) => e.s === key);
  if (last && state.day - last.d < 30) last.p = r3(last.p + give); else x.last.push({ s: key, p: r3(give), d: state.day });
  if (x.last.length > 8) x.last.splice(0, x.last.length - 8);
  return give;
}
/** Kosten eines Punktes bei Wert v. */
function stepCost(v) { const X = XP(); return Math.max(1, Math.round(num(X.costBase, 2) + num(X.costPerPoint, 0.12) * Math.max(0, v - num(X.costFrom, 35)))); }
/** Prüfung einer Steigerung: { ok, why, cost, v, cap, waitLeft }. */
function canTrain(state, key) {
  const x = xpOf(state); const i = TL.IDX[key];
  if (!x || i == null || !state.talents) return { ok: false, why: 'Dieses Talent gibt es nicht.' };
  if (!enabled() || !TL.enabled()) return { ok: false, why: 'Talente und Erfahrung sind gerade ausgeschaltet.' };
  const v = state.talents.v[i]; const cap = TL.capAt(state.talents, i); const cost = stepCost(v);
  const X = XP(); const wait = Math.max(0, Math.floor(num(X.waitDays, 14)));
  const mine = x.buys.filter((b) => b[1] === i).reduce((m, b) => Math.max(m, b[0]), -1e9);
  const waitLeft = Math.max(0, mine + wait - state.day);
  const yearBuys = x.buys.filter((b) => state.day - b[0] < Math.max(30, num(X.windowDays, 365))).length;
  const base = { cost, v, cap, waitLeft, yearLeft: Math.max(0, Math.floor(num(X.yearMax, 6)) - yearBuys) };
  if (v >= cap) return { ok: false, why: 'Mehr gibt die Anlage in diesem Talent nicht her.', ...base };
  if (waitLeft > 0) return { ok: false, why: `Das Talent braucht noch ${waitLeft} Tage Pause.`, ...base };
  if (base.yearLeft <= 0) return { ok: false, why: 'Mehr als eine begrenzte Zahl von Steigerungen pro Jahr ist nicht möglich.', ...base };
  if (x.bal + 1e-9 < cost) return { ok: false, why: 'Dafür fehlt Erfahrung.', ...base };
  return { ok: true, why: null, ...base };
}
/** Steigert ein Talent um einen Punkt und bucht die EP ab. Gibt { cost, v } zurück oder { err }. */
function train(state, key) {
  const c = canTrain(state, key); if (!c.ok) return { err: c.why };
  const x = xpOf(state); const i = TL.IDX[key];
  const gain = TL.grow(state.talents, key, 1);
  if (gain <= 0) return { err: 'Mehr gibt die Anlage in diesem Talent nicht her.' };
  x.bal = r3(Math.max(0, x.bal - c.cost)); x.spent += 1;
  x.buys.push([state.day, i]); if (x.buys.length > 40) x.buys.splice(0, x.buys.length - 40);
  return { cost: c.cost, v: state.talents.v[i], key };
}
/** Empfehlung: Talente der Tätigkeit zuerst (Beruf oder Betrieb), danach das niedrigste. */
function recommend(world, state) {
  const p = state.talents; if (!p) return [];
  const occ = state.occupation; let pk = occ && occ.kind === 'work' ? occ.pkey : null;
  if (!pk) { const c = (state.companies || []).find((x) => !x.abandoned); if (c) pk = c.pkey; }
  const pri = pk ? TL.topKeys(TL.weightsFor(world, pk)).slice(0, 2) : [];
  const score = (k) => { const i = TL.IDX[k]; const room = TL.capAt(p, i) - p.v[i]; return (pri.includes(k) ? 100 : 0) + (room > 0 ? 20 : -100) - p.v[i] * 0.2; };
  return TL.KEYS.slice().sort((a, b) => score(b) - score(a));
}
/** Verteilt, soweit erlaubt, je Talent einen Punkt in der Reihenfolge der Empfehlung. Gibt die Liste der gesteigerten Talente zurück. */
function trainAll(world, state, maxN = 6) {
  const out = [];
  for (const k of recommend(world, state)) { if (out.length >= maxN) break; const r = train(state, k); if (!r.err) out.push(r); }
  return out;
}
/** EP aus einer erfolgreichen Spielaktion (Verhandeln, Führen, Begegnungen …). */
function onAction(world, state, name, input, out) {
  if (!state || !state.talents || !enabled() || (out && (out.level === 'warn' || out.level === 'bad'))) return 0;
  let got = 0;
  for (const [key, d] of Object.entries(srcDefs())) { const a = d && d.act && Object.prototype.hasOwnProperty.call(d.act, name) ? num(d.act[name], 0) : 0; if (a > 0) got += award(state, key, a); }
  void world; void input;
  return got;
}
/** Tätigkeiten des Tages → EP (Tageslauf). */
function dailyXp(world, state) {
  const x = xpOf(state); if (!x || !enabled() || !TL.enabled()) return;
  const S = srcDefs(); const occ = state.occupation;
  const add = (key, mult) => { const d = S[key]; if (d && mult > 0) award(state, key, num(d.perDay, 0) * mult); };
  if (occ && occ.kind === 'work') add('arbeit', 1);
  const civ = state.civic && Array.isArray(state.civic.clubs) ? state.civic.clubs : [];
  const deals = state.contracts ? (state.contracts.buys || []).filter((b) => !b.ended).length + (state.contracts.sells || []).length : 0;
  const routes = state.trade && Array.isArray(state.trade.routes) ? state.trade.routes.length : 0;
  add('handel', Math.min(3, deals + routes));
  const teamed = (state.companies || []).some((c) => !c.abandoned && num(c.staff, 0) >= 2);
  add('fuehrung', (state.politics && state.politics.term ? 2 : 0) + (teamed ? 1 : 0));
  const career = state.career || {};
  if (occ && (occ.kind === 'study' || occ.kind === 'training') || career.course) add('lernen', 1);
  add('begegnung', Math.min(2, civ.filter((c) => ['kultur', 'wohltat', 'handwerk'].includes(c.kind)).length));
  add('sport', civ.some((c) => c.kind === 'sport') ? 1 : 0);
}

/* ------------------------------------------------------------------ Tageslauf ------------------------------------------------------------------ */
/** Laufende Kosten je Tag (Cent) für die Tagesrechnung (Anzeige) – Dienstleistungen und Unterhalt der Stücke. */
function upkeepDay(world, state) {
  if (!enabled() || !state || !state.char) return 0;
  const year = yr(state); let u = 0;
  for (const k of SLOTS) {
    if (isService(k)) { const lv = state.char.svc[k] || 0; if (lv) u += dayCost(world, state, k, lv, year); } else { const g = own(state, k); if (g) u += dayCost(world, state, k, g.lv, year); }
  }
  return u;
}
/** Täglich (nach Familie, Betrieb, Politik): Abnutzung, laufende Kosten, Erfahrung, Auto-Verteilung, Rang. */
function daily(ctx) {
  const { world, state } = ctx;
  if (!state || !state.char) return;
  if (!enabled()) return;
  const year = yr(state);
  // Abnutzung: ein Stück verliert über seine Lebensdauer von 100 auf 0
  for (const k of SLOTS) {
    const g = own(state, k); if (!g) continue;
    const life = Math.max(1, num(slotCfg(k).lifeYears, 10)) * 365;
    g.cond = r3(Math.max(0, g.cond - 100 / life));
  }
  const h = state.char.heir; for (const e of h) { const life = Math.max(1, num(slotCfg(e.slot).lifeYears, 40)) * 365; e.cond = r3(Math.max(0, e.cond - 50 / life)); }
  // Laufende Kosten: nie in die Insolvenz. Reicht das Geld nicht für drei Tage, enden die Dienstleistungen; der Rest wird nur bezahlt, soweit Geld da ist.
  let cost = upkeepDay(world, state);
  if (cost > 0) {
    if (state.money < cost * 3) {
      let ended = 0; for (const k of SLOTS) if (isService(k) && state.char.svc[k]) { delete state.char.svc[k]; ended++; }
      if (ended && !ctx.offline) require('./core').notice(state, { level: 'warn', title: 'Dienstleistungen beendet', tab: 'character', text: 'Dein Geld reichte nicht mehr für Pflege und Sicherheitsdienst. Die Verträge wurden beendet.', info: ['Dienstleistungen kosten jeden Tag etwas.', 'Wenn das Geld knapp wird, enden sie automatisch – du bekommst keine Schulden dadurch.', 'Du kannst sie im Charakterblatt jederzeit wieder buchen.'] });
      cost = upkeepDay(world, state);
    }
    const pay = Math.min(cost, Math.max(0, state.money));
    if (pay > 0) { state.money -= pay; state.stats.spent += pay; }
  }
  dailyXp(world, state);
  const x = xpOf(state);
  if (x && x.auto && state.day % 7 === 0) trainAll(world, state, 2);
  if (state.day % Math.max(1, Math.floor(num(RANK().checkDays, 5))) === 0) checkRank(world, state);
  void year;
}

/* ------------------------------------------------------------------ Kauf, Verkauf, Instandsetzung (reine Rechnung; die Aktionen prüfen Eingaben) ------------------------------------------------------------------ */
/** Verkaufswert (Cent) eines eigenen Stücks: inflationsbereinigter Kaufpreis × Anteil × Zustand. */
function resaleValue(world, state, slot, g) {
  if (!g || isService(slot)) return 0;
  const idx = world.idx(yr(state));
  return Math.max(0, Math.round(num(g.paid, 0) * idx * (num(slotCfg(slot).resalePct, 30) / 100) * (0.4 + 0.6 * clamp(g.cond, 0, 100) / 100)));
}
/** Kosten der Instandsetzung (Cent). */
function repairCost(world, state, slot, g) {
  if (!g) return 0;
  return Math.max(1, Math.round(price(world, state, slot, g.lv, yr(state)) * num(GEAR().refurbishPct, 25) / 100 * (1 - clamp(g.cond, 0, 100) / 100) * 1.3));
}

/* ------------------------------------------------------------------ Erbe ------------------------------------------------------------------ */
/**
 * Der Erbe beginnt mit einem kleinen Bildungsvorsprung (Prozent der gesammelten Erfahrung, höchstens `xp.inherit.max` Punkte; das Guthaben des Verstorbenen verfällt),
 * erbt Uhr und Schmuck als nicht verkäufliche Erbstücke (bei mehreren erbberechtigten Kindern eine Stufe weniger) und einen Teil des Rangs („Herkunft“).
 */
function inherit(world, old, state, nHeirs = 1) {
  ensure(old); ensure(state);
  const X = XP(); const inh = { ...D.xp.inherit, ...(X.inherit || {}) };
  const ox = xpOf(old); const nx = xpOf(state);
  if (ox && nx) nx.bal = r3(Math.min(num(inh.max, 5), Math.floor(ox.tot * num(inh.sharePct, 3) / 100)));
  const keep = []; const share = nHeirs > 1 ? 1 : 0;
  for (const slot of ['uhr', 'schmuck']) {
    const p = piece(old, slot); if (!p) continue;
    const lv = Math.max(1, p.lv - share);
    keep.push({ slot, lv, cond: r1(clamp(p.cond * 0.9, 20, 100)), gen: (p.heir ? p.heir.gen : 0) + 1 });
  }
  state.char.heir = keep;
  const R = RANK();
  const sc = old.char ? Math.max(num(old.char.rank.sc, 0), old.char.legacy ? num(old.char.legacy.pts, 0) : 0) : 0;
  const pts = r1(clamp(sc * num(R.legacyPct, 12) / 100, 0, num(R.legacyMax, 7)));
  state.char.legacy = pts > 0 ? { pts, day: state.day } : null;
  state.char.rank = { lv: 1, sc: 0, best: 1, since: state.day };
  void world;
  return state;
}

/* ------------------------------------------------------------------ Anzeige ------------------------------------------------------------------ */
const labelOf = (key) => (TL.C().labels || {})[key] || TL.META[key].label;
function xpView(world, state) {
  const x = xpOf(state); if (!x || !state.talents) return null;
  const X = XP(); const p = state.talents;
  const buys = TL.KEYS.map((k, i) => {
    const c = canTrain(state, k);
    return { key: k, label: labelOf(k), icon: TL.META[k].icon, v: p.v[i], cap: TL.capAt(p, i), b: p.b[i], cost: c.cost, ok: c.ok, why: c.why, waitLeft: c.waitLeft || 0 };
  });
  const rec = recommend(world, state).filter((k) => buys.find((b) => b.key === k).ok).slice(0, 1);
  const yearBuys = x.buys.filter((b) => state.day - b[0] < Math.max(30, num(X.windowDays, 365))).length;
  const sources = Object.entries(srcDefs()).map(([key, d]) => {
    const got = srcGot(state, key); const cap = num(d.capEp, 0);
    let tk = d.talent; if (tk === 'job') { const occ = state.occupation; tk = occ && occ.kind === 'work' ? TL.topKeys(TL.weightsFor(world, occ.pkey))[0] : null; }
    return { key, label: d.label, icon: d.icon, text: d.text, talent: tk && TL.META[tk] ? labelOf(tk) : null, got: r1(got), cap, pct: cap > 0 ? Math.round(clamp(got / cap, 0, 1) * 100) : 0 };
  });
  return {
    bal: r1(x.bal), tot: r1(x.tot), spent: x.spent, auto: !!x.auto, balMax: num(X.balMax, 60), buys, best: rec[0] || null,
    yearLeft: Math.max(0, Math.floor(num(X.yearMax, 6)) - yearBuys), yearMax: Math.floor(num(X.yearMax, 6)), waitDays: Math.floor(num(X.waitDays, 14)),
    sources, last: x.last.slice().reverse().map((e) => ({ s: e.s, label: (srcDef(e.s) || {}).label || e.s, p: r1(e.p), d: e.d })),
  };
}
function slotView(world, state, slot) {
  const year = yr(state); const S = slotCfg(slot); const svc = isService(slot);
  const g = svc ? null : own(state, slot); const hp = svc ? null : heirOf(state, slot); const lvSvc = svc ? state.char.svc[slot] || 0 : 0;
  const cur = svc ? lvSvc : (g ? g.lv : 0);
  const eff = svc ? lvSvc : (piece(state, slot) || { lv: 0 }).lv;
  const levels = S.levels.map((L, i) => {
    const lv = i + 1; const pr = svc ? 0 : price(world, state, slot, lv, year); const dc = dayCost(world, state, slot, lv, year);
    const resale = !svc && g ? resaleValue(world, state, slot, g) : 0;
    const era = eraOk(slot, lv, year);
    const net = svc ? 0 : pr - resale;
    let why = null;
    if (!enabled()) why = 'off'; else if (!era) why = 'era'; else if (svc ? false : (state.money < Math.max(0, net))) why = 'money'; else if (svc && lv !== lvSvc && state.money < dc * 30) why = 'money';
    return { lv, name: levelName(slot, lv, year), text: L.text, look: num(L.look, 0), price: pr, net, dayCost: dc, from: num(L.from, 1945), eraOk: era, current: lv === cur, ok: !why && lv !== cur, why, burglaryMult: L.burglaryMult != null ? num(L.burglaryMult, 1) : null, comfort: L.comfort != null ? num(L.comfort, 0) : null };
  });
  const dated = !svc && g ? isDated(slot, { y: g.y }, year) : false;
  return {
    key: slot, name: S.name, icon: S.icon, kind: S.kind, what: S.what, lv: cur, effLv: eff, name_cur: cur ? levelName(slot, cur, year) : (slot === 'kleidung' ? 'Alltagskleidung' : ''),
    cond: g ? Math.round(g.cond) : null, dated, since: g ? g.day : null, heir: hp ? { lv: hp.lv, name: levelName(slot, hp.lv, year), cond: Math.round(hp.cond), gen: hp.gen } : null,
    look: r1(slotLook(state, slot, year)), dayCost: svc ? (lvSvc ? dayCost(world, state, slot, lvSvc, year) : 0) : (g ? dayCost(world, state, slot, g.lv, year) : 0),
    resale: g ? resaleValue(world, state, slot, g) : 0, repair: g && g.cond < num(GEAR().repairBelow, 75) ? repairCost(world, state, slot, g) : 0, repairTo: num(GEAR().repairTo, 92), levels, max: S.levels.length,
  };
}
function rankView(world, state) {
  const parts = rankParts(world, state); const L = rankLevels(); const lv = state.char.rank.lv;
  const next = lv < 7 ? { lv: lv + 1, name: L[lv].name, at: num(L[lv].at, 0), missing: r1(Math.max(0, num(L[lv].at, 0) - parts.total)) } : null;
  const cur = L[lv - 1]; const P = RANK().perks || {};
  const at = (arr, i) => num((arr || [])[i], 0);
  const perks = [
    { key: 'home', text: 'Immobilien günstiger kaufen', value: at(P.homeDiscPct, lv - 1), unit: '%', on: at(P.homeDiscPct, lv - 1) > 0, from: ((P.homeDiscPct || []).findIndex((x) => x > 0) + 1) || null },
    { key: 'offer', text: 'Wöchentliches Vorab-Angebot einer Premium-Wohnlage', value: 0, unit: '', on: lv >= num(P.offerFrom, 4), from: num(P.offerFrom, 4) },
    { key: 'contacts', text: 'Beziehungen bei Bewerbungen', value: at(P.contacts, lv - 1), unit: 'Punkte', on: at(P.contacts, lv - 1) > 0, from: ((P.contacts || []).findIndex((x) => x > 0) + 1) || null },
    { key: 'fee', text: 'Günstigere Kandidatur', value: at(P.feeDiscPct, lv - 1), unit: '%', on: at(P.feeDiscPct, lv - 1) > 0, from: ((P.feeDiscPct || []).findIndex((x) => x > 0) + 1) || null },
    { key: 'clubs', text: 'Zusätzliche Vereinsplätze', value: at(P.clubSlots, lv - 1), unit: '', on: at(P.clubSlots, lv - 1) > 0, from: ((P.clubSlots || []).findIndex((x) => x > 0) + 1) || null },
  ];
  return {
    lv, name: cur.name, text: cur.text, score: parts.total, parts, next, best: state.char.rank.best, since: state.char.rank.since,
    levels: L.map((l, i) => ({ lv: i + 1, name: l.name, at: num(l.at, 0), text: l.text, done: i + 1 <= lv })), perks,
    weights: { ...D.rank.weights, ...(RANK().weights || {}) },
  };
}
/** Alles für die Charakterseite (rein; Beträge in Cent heutiger Preise). */
function view(world, state) {
  if (!state || !state.char) return null;
  const year = yr(state); const L = look(state, year); const fx = wirkungen(state);
  const slots = SLOTS.map((k) => slotView(world, state, k));
  const upkeep = upkeepDay(world, state);
  const chron = (state.tree && state.tree.events ? state.tree.events : []).filter((e) => e.type !== 'rank' || true).slice(-10).reverse().map((e) => ({ day: e.day, type: e.type, text: e.text }));
  const wage = wageUnit(world, state, year);
  return {
    on: enabled(), strength: strength(), look: L, lookBand: BANDS[lookBand(L)], lookPct: Math.round(L), norm: r2(lookNorm(L)), xp: xpView(world, state), rank: rankView(world, state),
    gear: slots, upkeepDay: upkeep, upkeepYear: upkeep * 365, wageDay: Math.round(wage), fx: {
      rep: Math.round((fx.repGain - 1) * 1000) / 10, raise: Math.round(fx.raise * 1000) / 10, apply: fx.apply, vote: Math.round((fx.vote - 1) * 1000) / 10, chance: Math.round(fx.chance * 1000) / 10,
      court: fx.court, comfort: fx.comfort, burglary: Math.round((1 - fx.burglary) * 100),
      max: { rep: num(E().repGainPct, 8) * strength(), raise: num(E().raisePct, 4) * strength(), apply: num(E().applyPts, 3) * strength(), vote: num(E().votePct, 3) * strength(), chance: num(E().chancePct, 3) * strength(), court: num(E().courtPts, 2) * strength() },
    },
    chron, titles: state.civic && Array.isArray(state.civic.titles) ? state.civic.titles.map((t) => ({ key: t.key, rank: t.rank, name: t.name })) : [],
    rep: require('./reputation').brief(state), talentsOn: TL.enabled(),
  };
}

module.exports = {
  SLOTS, D, C, enabled, strength, E, XP, GEAR, RANK, ensure, newXp, newChar, xpOf, isService, slotCfg, levelDef, levelName, eraOk, wageUnit, price, dayCost, own, heirOf, piece, wornFactor, isDated,
  slotLook, look, lookNorm, lookBand, BANDS, repGain, raiseAdd, applyPts, voteMult, voteOfLook, chanceAdd, courtPts, courtOfLook, comfort, burglaryMult, wirkungen, perk, rankLevels, rankParts, rankFor, checkRank,
  queueLog, srcDefs, srcGot, award, stepCost, canTrain, train, recommend, trainAll, onAction, dailyXp, upkeepDay, daily, resaleValue, repairCost, inherit, xpView, slotView, rankView, view,
  clamp, num, r1, r2,
};
