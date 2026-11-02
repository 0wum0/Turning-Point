'use strict';
/**
 * Werben, Ehe und Familienunternehmen (rein, ohne Datenbank) – Schritt 11.
 *
 * Spielstand (alles optional; fehlt es, gilt der neutrale Zustand – Altspielstände brauchen keine Umstellung, `ensure` ist idempotent):
 *   state.fam = { woo, cool, contract, ring, dowry, dyn, hand }
 *     woo       Bekanntschaften in der Werbung (Verlauf mit Sympathie, Vorlieben, Wartezeiten)
 *     cool      Abkühlzeiten nach Abbruch (Name|Beruf → Spieltag)
 *     contract  Ehevertrag des aktuellen Paares { kind, day, startReal, pid, dowry } – fehlt bei Altständen (dann gilt die alte Trennungsregel)
 *     ring      Eheringe { lv, paid, day } (zählen als Schmuck im Charakterblatt, nicht verkäuflich, werden vererbt)
 *     dyn       Dynastie-Wertung { pts, lv, best, since, legacy, chk, div }
 *     hand      Übergaben zu Lebzeiten { last, n }
 *   child.groom   Einarbeitung eines Kindes im Familienbetrieb { cid, kind: 'lehre'|'nachfolge', since, exp, grown, ready }
 *   child.estate  { companies } übergebene Betriebe (laufen weiter, Gewinn sammelt sich dort; ein Teil geht als Altenteil an die Eltern)
 *   child.gift    [{ real, day, name }] Vorempfänge (werden im Pflichtanteil angerechnet)
 *   company.gen / company.since / company.trad   Generationen in Familienhand, Jahr der Übernahme, zuletzt gemeldete Traditionsstufe
 *
 * Alle Beträge im Spielstand der Spielfigur sind Cent heutiger Preise; Vorempfänge, Ehevertrag und Aussteuer werden als „Real“ (Cent Wert 1945) gemerkt
 * und beim Buchen mit dem Preisindex umgerechnet – so bleiben Zugewinn, Aussteuer und Schenkungen über die Epochen fair. Geld wird nur im Spielstand der
 * Spielfigur bewegt, genau einmal je Aktion (service.withCharacter); Spielerehen buchen über social.lockPair und die Warteschlangen (src/lib/bonds.js).
 * Ehe und Partnerschaft gibt es nur zwischen Mann und Frau; Wirkungen laufen unter `familie.effects.strength` (0 = aus).
 */
const settings = require('../settings');
const D = require('./dynasty-defaults');
const TL = require('./talents');
const { rngFor, weighted } = require('./rng');
const { yearOf } = require('./calendar');

const num = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (x) => Math.round(x * 10) / 10 + 0;
const r2 = (x) => Math.round(x * 100) / 100 + 0;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const C = () => settings.get('familie') || D;
const enabled = () => C().enabled !== false;
const strength = () => (enabled() ? clamp(num((C().effects || {}).strength, 1), 0, 2) : 0);
const sec = (name) => ({ ...D[name], ...(C()[name] || {}) });
const W = () => sec('woo');
const ACTS = () => { const a = (C().woo || {}).acts; return isObj(a) && Object.keys(a).length ? a : D.woo.acts; };
const LIKES = () => { const l = (C().woo || {}).likes; return isObj(l) && Object.keys(l).length ? l : D.woo.likes; };
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const KINDS = () => { const k = (C().contract || {}).kinds; return isObj(k) && k.zugewinn ? k : D.contract.kinds; };
const FAMILY = () => ({ ...D.family, ...(C().family || {}) });
const idxOf = (world, state) => Math.max(0.0001, world.idx(yearOf(state.day, state.startYear)));
const yr = (state) => yearOf(state.day, state.startYear);
const nameOf = (full) => String(full || '').split(' ')[0];
const ageYears = (state, born) => Math.floor((state.day - born) / 365);

/* ------------------------------------------------------------------ Spielstand ------------------------------------------------------------------ */
const newDyn = (day = 0) => ({ pts: 0, lv: 1, best: 1, since: day, legacy: 0, chk: 0, div: 0 });
const newFam = (day = 0) => ({ woo: {}, cool: {}, contract: null, ring: null, dowry: false, dyn: newDyn(day), hand: { last: -99999, n: 0 } });

function cleanEntry(e) {
  if (!isObj(e) || typeof e.id !== 'string' || !e.id) return null;
  const tags = Object.keys(LIKES());
  const likes = Array.isArray(e.likes) ? [...new Set(e.likes.filter((t) => tags.includes(t)))].slice(0, 2) : [];
  if (likes.length < 2) return null;
  const out = {
    id: e.id.slice(0, 40), name: String(e.name || '').slice(0, 60), gender: e.gender === 'f' ? 'f' : 'm', age: clamp(Math.floor(num(e.age, 25)), 16, 90), born: Math.floor(num(e.born, 0)),
    pkey: String(e.pkey || '').slice(0, 40), profession: String(e.profession || '').slice(0, 60), cityId: Math.max(0, Math.floor(num(e.cityId, 0))),
    sym: r1(clamp(num(e.sym, 20), 0, 100)), hits: Math.max(0, Math.floor(num(e.hits, 0))), miss: Math.max(0, Math.floor(num(e.miss, 0))), dates: Math.max(0, Math.floor(num(e.dates, 0))), n: Math.max(0, Math.floor(num(e.n, 0))),
    since: Math.floor(num(e.since, 0)), last: Math.floor(num(e.last, 0)), next: Math.floor(num(e.next, 0)), tries: Math.max(0, Math.floor(num(e.tries, 0))), askAt: Math.floor(num(e.askAt, 0)),
    cls: clamp(Math.floor(num(e.cls, 0)), 0, 3), likes, known: Array.isArray(e.known) ? [...new Set(e.known.filter((t) => likes.includes(t)))] : [], visited: !!e.visited,
    cd: {}, lastAct: typeof e.lastAct === 'string' ? e.lastAct.slice(0, 20) : '', hist: [], rivalAt: Math.floor(num(e.rivalAt, -9999)), jealAt: Math.floor(num(e.jealAt, -9999)),
  };
  if (isObj(e.cd)) for (const [k, v] of Object.entries(e.cd)) if (Number.isFinite(v)) out.cd[k.slice(0, 20)] = Math.floor(v);
  if (Array.isArray(e.hist)) out.hist = e.hist.filter((h) => Array.isArray(h) && h.length === 4 && h.every((x, i) => (i === 1 ? typeof x === 'string' : Number.isFinite(x)))).slice(-8).map((h) => [Math.floor(h[0]), h[1].slice(0, 20), r1(h[2]), Math.floor(h[3])]);
  return out;
}

/** Alles sicherstellen und bereinigen (idempotent). Fehlende Felder = neutraler Zustand; Unsinn wird auf gültige Werte gezogen. */
function ensure(state) {
  if (!state || typeof state !== 'object') return state;
  if (!isObj(state.fam)) state.fam = newFam(state.day || 0);
  const f = state.fam;
  if (!isObj(f.woo)) f.woo = {};
  for (const k of Object.keys(f.woo)) { const e = cleanEntry(f.woo[k]); if (e && e.id === k) f.woo[k] = e; else delete f.woo[k]; }
  if (!isObj(f.cool)) f.cool = {};
  for (const k of Object.keys(f.cool)) if (!Number.isFinite(f.cool[k])) delete f.cool[k];
  const c = f.contract;
  if (c != null) {
    if (isObj(c) && typeof c.kind === 'string' && hasOwn(KINDS(), c.kind) && Number.isFinite(c.startReal)) {
      f.contract = { kind: c.kind, day: Math.floor(num(c.day, 0)), startReal: Math.round(c.startReal), pid: typeof c.pid === 'string' ? c.pid.slice(0, 20) : '', dowry: null };
      const d = c.dowry;
      if (isObj(d)) f.contract.dowry = { cash: Math.max(0, Math.round(num(d.cash, 0))), firm: Number.isInteger(d.firm) ? d.firm : null, home: Number.isInteger(d.home) ? d.home : null, real: Math.max(0, Math.round(num(d.real, 0))), form: ['cash', 'home', 'firm'].includes(d.form) ? d.form : 'cash' };
    } else f.contract = null;
  } else f.contract = null;
  const r = f.ring;
  f.ring = isObj(r) && Number.isInteger(r.lv) && r.lv >= 1 && r.lv <= 3 ? { lv: r.lv, paid: Math.max(0, Math.round(num(r.paid, 0))), day: Math.floor(num(r.day, 0)) } : null;
  f.dowry = !!f.dowry;
  const d = isObj(f.dyn) ? f.dyn : newDyn(state.day || 0);
  f.dyn = { pts: r1(clamp(num(d.pts, 0), 0, 100)), lv: clamp(Math.floor(num(d.lv, 1)), 1, 5), best: clamp(Math.floor(num(d.best, d.lv || 1)), 1, 5), since: Math.floor(num(d.since, 0)), legacy: r1(clamp(num(d.legacy, 0), 0, 100)), chk: Math.floor(num(d.chk, 0)), div: Math.max(0, Math.floor(num(d.div, 0))) };
  f.dyn.best = Math.max(f.dyn.best, f.dyn.lv);
  const h = isObj(f.hand) ? f.hand : {};
  f.hand = { last: Math.floor(num(h.last, -99999)), n: Math.max(0, Math.floor(num(h.n, 0))) };
  for (const ch of state.children || []) {
    if (ch.groom != null) {
      const g = ch.groom;
      ch.groom = isObj(g) && Number.isInteger(g.cid) && ['lehre', 'nachfolge'].includes(g.kind) ? { cid: g.cid, kind: g.kind, since: Math.floor(num(g.since, 0)), exp: Math.max(0, Math.floor(num(g.exp, 0))), grown: Math.max(0, Math.floor(num(g.grown, 0))), ready: !!g.ready, last: Math.floor(num(g.last, 0)) } : undefined;
      if (!ch.groom) delete ch.groom;
    }
    if (ch.estate != null) {
      if (isObj(ch.estate) && Array.isArray(ch.estate.companies)) ch.estate.companies = ch.estate.companies.filter((x) => isObj(x) && Number.isInteger(x.id));
      else delete ch.estate;
      if (ch.estate && !ch.estate.companies.length) delete ch.estate;
    }
    if (ch.gift != null) { if (Array.isArray(ch.gift)) ch.gift = ch.gift.filter((g) => isObj(g) && Number.isFinite(g.real) && g.real >= 0).map((g) => ({ real: Math.round(g.real), day: Math.floor(num(g.day, 0)), name: String(g.name || '').slice(0, 80) })).slice(-10); else delete ch.gift; if (ch.gift && !ch.gift.length) delete ch.gift; }
  }
  for (const co of state.companies || []) { if (!Number.isInteger(co.gen) || co.gen < 1) co.gen = 1; if (!Number.isFinite(co.since)) co.since = 0; if (co.trad != null && !(Number.isInteger(co.trad) && co.trad >= 0 && co.trad <= 3)) co.trad = 0; }
  return state;
}

function queueLog(state, e) {
  if (!state || !state.pending) return;
  const q = state.pending.dyn || (state.pending.dyn = []);
  if (q.length >= 30) return;
  q.push(e);
}

/* ------------------------------------------------------------------ Hilfen: Vermögen, Familie des Partners ------------------------------------------------------------------ */
const netReal = (world, state) => require('./core').netWorth(world, state) / idxOf(world, state);
const firstName = (state) => nameOf(state.person.first);

/** Herkunftsfamilie (Klasse 0–3) – deterministisch aus Seed und Person; Unternehmerfamilien sind selten. */
function classOf(state, personId, pkey) {
  const cl = FAMILY().classes; const r = rngFor('fam-class', state.seed, personId, pkey || '');
  const w = weighted(r, cl.map((c, i) => ({ w: Math.max(0, num(c.weight, 1)), i })));
  return w.i;
}

/** Zwei Vorlieben je Person: deterministisch aus Beruf, Begabung und Alter. */
function likesOf(world, cityId, id, name, pkey, age) {
  const tags = Object.keys(LIKES()); const p = world && world.prof ? world.prof(pkey) : null; const cat = (p && p.category) || '';
  const w = Object.fromEntries(tags.map((t) => [t, 1]));
  const bias = { handwerk: ['natur', 'bewegung'], gastro: ['genuss'], handel: ['wort', 'genuss'], bildung: ['kultur', 'wort'], gesundheit: ['heim', 'natur'], verkehr: ['natur'], kunst: ['kultur'], bau: ['natur', 'bewegung'] }[cat] || [];
  for (const t of bias) if (w[t] != null) w[t] += 1.5;
  const tw = TL.weightsFor(world, pkey) || {};
  if ((tw.charme || 0) > 0.25 && w.wort != null) w.wort += 1; if ((tw.kondition || 0) > 0.25 && w.bewegung != null) w.bewegung += 1; if ((tw.bildung || 0) > 0.25 && w.kultur != null) w.kultur += 1;
  if (age < 28) { if (w.bewegung != null) w.bewegung += 1; if (w.kultur != null) w.kultur += 0.5; } else if (age >= 36) { if (w.heim != null) w.heim += 1.5; if (w.natur != null) w.natur += 1; }
  const r = rngFor('woo-likes', cityId, id, name);
  const first = weighted(r, tags.map((t) => ({ w: w[t], t }))).t;
  const rest = tags.filter((t) => t !== first);
  const second = weighted(r, rest.map((t) => ({ w: w[t], t }))).t;
  return [first, second];
}

/* ------------------------------------------------------------------ Familienmeinung ------------------------------------------------------------------ */
function opinion(world, state, e) {
  const O = sec('opinion'); const RP = require('./reputation'); const CH = require('./character');
  const rank = state.char && state.char.rank ? state.char.rank.lv : 1;
  const st = RP.stand(state).lv;
  const L = CH.look(state, yr(state));
  const nw = Math.max(1, netReal(world, state));
  const wealth = clamp((Math.log(nw) - Math.log(100000)) / (Math.log(1e9) - Math.log(100000)), 0, 1) * num(O.wealthMax, 10);
  const dyn = state.fam && state.fam.dyn ? state.fam.dyn.lv : 1;
  let v = num(O.base, 28) + (rank - 1) * num(O.rank, 5) + (st + 2) * num(O.standing, 3) + (state.occupation ? num(O.job, 8) : 0) + ((state.companies || []).some((c) => !c.abandoned) ? num(O.firm, 8) : 0)
    + L * num(O.look, 0.12) + (dyn - 1) * num(O.dynasty, 3) + (e && e.visited ? num(O.visit, 12) : 0) - (e ? num(e.cls, 0) : 0) * num(O.classPenalty, 3) + wealth;
  return Math.round(clamp(v, 0, 100));
}
const opinionBand = (v) => (v < 35 ? 'skeptisch' : v < 55 ? 'aufgeschlossen' : v < 75 ? 'angetan' : 'begeistert');

/* ------------------------------------------------------------------ Werben ------------------------------------------------------------------ */
const candKey = (l) => `${l.name}|${l.pkey}`;
const actName = (key, year) => {
  const a = ACTS()[key]; if (!a) return key;
  if (Array.isArray(a.names)) { let out = a.names[0][1]; for (const [from, nm] of a.names) if (year >= from) out = nm; return out; }
  return a.label;
};
const activeWoo = (state) => Object.values((state.fam && state.fam.woo) || {});

/** Anfangssympathie nach dem ersten Treffen (10–45): Auftreten, Rang, Laune, Beruf, Zuhause, Charme. */
function startSym(state) {
  const S = W().start; const CH = require('./character');
  const lookN = CH.lookNorm(CH.look(state, yr(state))); const rank = ((state.char && state.char.rank ? state.char.rank.lv : 1) - 1) / 6;
  const ch = state.talents ? clamp((TL.val(state.talents, 'charme') - 50) / 50, -1, 1) : 0;
  const v = num(S.base, 16) + lookN * num(S.look, 8) + rank * num(S.rank, 6) + clamp((state.meters.wellbeing - 50) / 50, -1, 1) * num(S.wellbeing, 6)
    + (state.occupation || (state.companies || []).length ? num(S.job, 4) : 0) + (state.housing.type === 'street' ? 0 : num(S.home, 4)) + ch * num(S.charme, 5) * Math.min(1, strength());
  return r1(clamp(v, 10, 45));
}

/** Prüfung vor dem ersten Treffen. Gibt null oder den Grund zurück. */
function meetBlock(state, l) {
  ensure(state); const f = state.fam;
  if (!enabled()) return 'Das Werben ist gerade ausgeschaltet.';
  if (state.partner) return 'Du hast bereits einen Partner.';
  if (l.gender === state.person.gender) return 'Eine Partnerschaft gibt es nur zwischen Mann und Frau.';
  if (f.woo[l.id]) return 'Ihr kennt euch schon.';
  if (activeWoo(state).some((e) => candKey(e) === candKey(l))) return 'Ihr kennt euch schon.';
  if (activeWoo(state).length >= num(W().maxActive, 3)) return `Du kannst höchstens ${num(W().maxActive, 3)} Bekanntschaften gleichzeitig pflegen.`;
  if ((f.cool[candKey(l)] || 0) > state.day) return `${nameOf(l.name)} möchte dich im Moment nicht sehen. Gib dem Ganzen Zeit.`;
  return null;
}

/** Erstes Kennenlernen: legt die Bekanntschaft an (die Kosten bucht die Aktion). */
function start(world, state, l) {
  ensure(state);
  const r = rngFor('meet', state.seed, l.id);
  const born = state.day - l.age * 365 - Math.floor(r() * 300);
  const e = cleanEntry({
    next: state.day, id: l.id, name: l.name, gender: l.gender, age: l.age, born, pkey: l.pkey, profession: l.profession, cityId: l.cityId, sym: startSym(state), hits: 0, miss: 0, dates: 0, n: 0, since: state.day, last: state.day, tries: 0, askAt: state.day + num(W().ask.minDays, 14),
    cls: classOf(state, `${l.name}|${l.pkey}`, l.pkey), likes: likesOf(world, l.cityId, l.id, l.name, l.pkey, l.age), known: [], visited: false, cd: {}, lastAct: '', hist: [], rivalAt: state.day, jealAt: -9999,
  });
  state.fam.woo[e.id] = e;
  queueLog(state, { k: 'woo', city: l.cityId });
  return e;
}

/** Güte einer Aktion (0–1 und mehr). Deterministisch je Person und Versuch; Begabung und Auftreten wirken unter `effects.strength`. */
function quality(world, state, e, actKey) {
  const A = ACTS()[actKey]; const Q = W().q; const CH = require('./character'); const s = Math.min(1, strength());
  const liked = e.likes.includes(A.tag);
  const tv = state.talents ? clamp((TL.val(state.talents, A.talent) - 50) / 50, -1, 1) : 0;
  const lookN = CH.lookNorm(CH.look(state, yr(state)));
  const rank = ((state.char && state.char.rank ? state.char.rank.lv : 1) - 1) / 6;
  const mood = clamp((state.meters.wellbeing - 50) / 50, -1, 1);
  const noise = (rngFor('woo-q', state.seed, e.id, e.n)() - 0.5) * num(Q.noise, 0.3);
  const q = num(Q.base, 0.3) + (liked ? num(Q.liked, 0.3) : 0) + tv * num(Q.talent, 0.18) * s + lookN * num(Q.look, 0.08) * s + rank * num(Q.rank, 0.05) + mood * num(Q.mood, 0.05) + noise - (e.lastAct === actKey ? num(Q.repeat, 0.15) : 0);
  return { q, liked };
}

function actCostCents(world, state, actKey) {
  const A = ACTS()[actKey]; if (!A) return 0;
  return Math.round(num(A.cost, 0) * world.econ.giftCost * idxOf(world, state));
}

function actBlock(world, state, e, actKey) {
  const A = ACTS()[actKey];
  if (!A) return 'Das kennt hier niemand.';
  if (!enabled()) return 'Das Werben ist gerade ausgeschaltet.';
  if (state.partner) return 'Du hast bereits einen Partner.';
  if (state.day < (e.next || 0)) return `Gib ${nameOf(e.name)} einen Moment – ihr habt euch gerade erst gesehen (noch ${e.next - state.day} Tage).`;
  const cd = e.cd[actKey] || 0;
  if (state.day < cd) return `Das hast du erst vor Kurzem getan – warte noch ${cd - state.day} Tage.`;
  if (state.money < actCostCents(world, state, actKey)) return 'Dafür reicht dein Geld nicht.';
  return null;
}

/** Eine Aktion ausführen (die Aktion bucht das Geld). Gibt { kind, liked, delta, text } zurück. */
function act(world, state, e, actKey) {
  const A = ACTS()[actKey]; const W_ = W(); const G = W_.gain; const Q = W_.q;
  const { q, liked } = quality(world, state, e, actKey);
  let kind = 'mid'; let delta = num(G.mid, 2);
  if (q >= num(Q.hitAt, 0.58)) { kind = 'hit'; delta = Math.round(num(G.hit, 7) + (num(G.hitMax, 12) - num(G.hit, 7)) * clamp((q - num(Q.hitAt, 0.58)) / 0.3, 0, 1)); e.hits++; }
  else if (q < num(Q.missAt, 0.38)) { kind = 'miss'; delta = num(G.miss, -4); e.miss++; }
  e.sym = r1(clamp(e.sym + delta, 0, 100));
  e.n++; e.last = state.day; e.next = state.day + Math.max(0, Math.floor(num(W_.gap, 2))); e.lastAct = actKey; e.cd[actKey] = state.day + Math.max(0, Math.floor(num(A.cd, 5)));
  if (num(A.cost, 0) >= 1 && kind !== 'miss') e.dates++;
  if (liked && !e.known.includes(A.tag)) e.known.push(A.tag);
  e.hist.push([state.day, actKey, delta, kind === 'hit' ? 2 : kind === 'mid' ? 1 : 0]); if (e.hist.length > 8) e.hist.shift();
  // Eifersucht nur mild: wer parallel um eine zweite Person wirbt, enttäuscht eine weit fortgeschrittene Bekanntschaft ein wenig
  const J = W_.jealous; const hurt = [];
  for (const o of activeWoo(state)) {
    if (o.id === e.id || o.sym < num(J.symFrom, 50) || state.day - o.last > num(J.withinDays, 7) * 3 || state.day - o.jealAt < num(J.everyDays, 30)) continue;
    if (state.day - o.last < 1) continue;
    o.sym = r1(Math.max(1, o.sym - num(J.loss, 2))); o.jealAt = state.day; hurt.push(o.name);
  }
  return { kind, liked, delta, hurt, q };
}

function visitBlock(world, state, e) {
  const V = W().visit;
  if (!enabled()) return 'Das Werben ist gerade ausgeschaltet.';
  if (e.visited) return 'Du hast die Familie schon besucht.';
  if (e.sym < num(V.minSym, 40)) return `Die Familie lädt erst ein, wenn ihr euch besser kennt (Sympathie ${num(V.minSym, 40)}).`;
  if (state.money < Math.round(num(V.cost, 2) * world.econ.giftCost * idxOf(world, state))) return 'Dafür reicht dein Geld nicht.';
  return null;
}

function askChance(world, state, e) {
  const A = W().ask;
  const ch = state.talents ? clamp((TL.val(state.talents, 'charme') - 50) / 50, -1, 1) * Math.min(1, strength()) : 0;
  const op = opinion(world, state, e);
  const p = num(A.base, 0.35) + (e.sym - num(A.minSym, 60)) * num(A.perSym, 0.0125) + (op - 50) * num(A.opinion, 0.004) + ch * num(A.charme, 0.05);
  return { p: r2(clamp(p, num(A.min, 0.25), num(A.max, 0.95))), op };
}

function askBlock(world, state, e) {
  const A = W().ask;
  if (!enabled()) return 'Das Werben ist gerade ausgeschaltet.';
  if (state.partner) return 'Du hast bereits einen Partner.';
  if (e.sym < num(A.minSym, 60)) return `Die Sympathie reicht noch nicht (${num(A.minSym, 60)} nötig).`;
  if (e.hits < num(A.minHits, 3)) return `Ihr kennt euch noch zu wenig – dazu braucht es mindestens ${num(A.minHits, 3)} gelungene Treffen.`;
  if (state.day < e.since + num(A.minDays, 14)) return `Lasst euch noch etwas Zeit (noch ${e.since + num(A.minDays, 14) - state.day} Tage).`;
  if (state.day < e.askAt) return `Gib ${nameOf(e.name)} noch etwas Zeit (noch ${e.askAt - state.day} Tage).`;
  if (opinion(world, state, e) < num(A.opinionMin, 20)) return 'Die Familie hat große Vorbehalte. Ein Antrittsbesuch könnte das ändern.';
  return null;
}

/** Hinweis „Beste Wahl“: bekannte Vorliebe, die gerade verfügbar und bezahlbar ist; sonst die günstigste noch nicht ausprobierte Art. */
function bestAct(world, state, e) {
  const A = ACTS(); const keys = Object.keys(A);
  const ok = (k) => !actBlock(world, state, e, k);
  const known = keys.filter((k) => e.known.includes(A[k].tag) && ok(k) && k !== e.lastAct);
  if (known.length) return known.sort((a, b) => num(A[b].cost, 0) - num(A[a].cost, 0))[0];
  const tried = new Set(e.hist.map((h) => h[1]));
  const fresh = keys.filter((k) => !tried.has(k) && ok(k)).sort((a, b) => num(A[a].cost, 0) - num(A[b].cost, 0));
  if (fresh.length) return fresh[0];
  const any = keys.filter((k) => ok(k) && k !== e.lastAct).sort((a, b) => num(A[a].cost, 0) - num(A[b].cost, 0));
  return any[0] || null;
}

function stageOf(e) {
  const Qk = W().quick; const A = W().ask;
  if (e.sym >= num(A.minSym, 60) && e.hits >= num(A.minHits, 3)) return 'nah';
  if (e.sym >= num(Qk.dateSym, 30) && e.hits >= num(Qk.hitsToDate, 2)) return 'verabredet';
  return 'bekannt';
}

/** Tägliche Pflege der Bekanntschaften: Wartezeit ohne Kontakt, milde Konkurrenz, Abbruch. */
function wooDaily(ctx) {
  const { world, state } = ctx; const f = state.fam; const Wc = W();
  const list = Object.values(f.woo);
  if (!list.length) return;
  if (state.partner) { f.woo = {}; return; }
  for (const e of list) {
    const idle = state.day - e.last; const cold = Wc.cold;
    if (idle > num(cold.afterDays, 45) && (state.day - e.last - num(cold.afterDays, 45)) % Math.max(1, num(cold.everyDays, 5)) === 0) e.sym = r1(Math.max(0, e.sym - num(cold.loss, 1)));
    // Konkurrenz nur mild: höchstens ein kleiner Rückschlag, nie das Ende allein
    const R = Wc.rival;
    if (state.day % 7 === 0 && idle >= num(R.idleDays, 25) && e.sym < num(R.maxSym, 75) && state.day - e.rivalAt >= num(R.everyDays, 30) && e.sym > 5) {
      const rr = rngFor('woo-rival', state.seed, e.id, Math.floor(state.day / 7))();
      if (rr < num(R.chance, 0.25)) {
        e.rivalAt = state.day; e.sym = r1(Math.max(2, e.sym - num(R.loss, 3)));
        if (!ctx.offline) require('./core').notice(state, { level: 'info', title: `${nameOf(e.name)} trifft sich auch mit anderen`, tab: 'family', text: `Jemand anderes zeigt Interesse an ${nameOf(e.name)}. Melde dich mal wieder – ein Treffen hilft.`, info: ['Bekanntschaften wollen gepflegt werden.', 'Wer sich lange nicht meldet, verliert an Sympathie. Eine Konkurrenz ist nur ein kleiner Rückschlag – aufgegeben wird niemand deswegen.', 'Triff dich bald wieder mit ihr oder ihm.'] });
      }
    }
    if (e.sym <= 0 || idle >= num(cold.endAfter, 150)) {
      delete f.woo[e.id];
      f.cool[candKey(e)] = state.day + num(cold.coolDays, 240);
      if (!ctx.offline) require('./core').notice(state, { level: 'warn', title: `${nameOf(e.name)} meldet sich nicht mehr`, tab: 'family', text: 'Die Bekanntschaft ist eingeschlafen. Nach einer Weile kannst du es noch einmal versuchen.' });
    }
  }
  // abgelaufene Abkühlzeiten aufräumen
  if (state.day % 30 === 0) for (const k of Object.keys(f.cool)) if (f.cool[k] <= state.day) delete f.cool[k];
}

/** Abbruch von Hand (kostenlos). */
function drop(state, id) {
  ensure(state); const e = state.fam.woo[id]; if (!e) return null;
  delete state.fam.woo[id]; state.fam.cool[candKey(e)] = state.day + Math.floor(num(W().cold.coolDays, 240) / 2);
  return e;
}

/** Werbung → Paar: erzeugt die Partnerdaten (wie bisher) und räumt die übrigen Bekanntschaften weg. */
function makePartner(world, state, e, op) {
  const { addPerson } = require('./state');
  ensure(state);
  const person = addPerson(state, { name: e.name, gender: e.gender, born: e.born, role: 'partner', jobs: [e.profession], parents: [] });
  const tilt = {}; for (const [k, x] of Object.entries(TL.weightsFor(world, e.pkey))) tilt[k] = Math.round(16 * x); // der Beruf des Partners färbt die Begabungen
  const SS = W().startSat;
  const sat = Math.round(clamp(num(SS.base, 55) + e.sym * num(SS.perSym, 0.25), num(SS.min, 60), num(SS.max, 85)));
  state.partner = { personId: person.id, name: e.name, gender: e.gender, born: e.born, pkey: e.pkey, profession: e.profession, sat, married: false, cohabit: false, giftBoost: 0, unhappyDays: 0, since: state.day,
    tal: TL.newProfile(rngFor('tal-partner', state.seed, person.id), tilt), fam: { cls: e.cls, likes: e.likes.slice(), opin: op, visited: !!e.visited, sym: Math.round(e.sym), courted: e.n } };
  const me = state.tree.persons.find((x) => x.id === state.person.id); if (me) me.partnerId = person.id;
  state.fam.woo = {};
  return state.partner;
}

/* ------------------------------------------------------------------ Aussteuer, Ehevertrag, Eheringe ------------------------------------------------------------------ */
const ringDef = (lv) => (C().ring && Array.isArray(C().ring.levels) && C().ring.levels.length === 3 ? C().ring : D.ring).levels[lv - 1];
function ringName(lv, year) {
  const L = ringDef(lv); if (!L) return '';
  let out = L.names[0][1]; for (const [from, nm] of L.names) if (year >= from) out = nm; return out;
}
function ringPrice(world, state, lv) {
  const L = ringDef(lv); if (!L) return 0;
  return Math.max(1, Math.round(num(L.costDays, 10) * require('./character').wageUnit(world, state, yr(state))));
}

function partnerFamily(world, state, p) {
  const cls = p.fam && Number.isInteger(p.fam.cls) ? p.fam.cls : classOf(state, p.personId, p.pkey);
  const visited = !!(p.fam && p.fam.visited);
  return { cls, visited, name: FAMILY().classes[clamp(cls, 0, 3)].name };
}

/** Plan der Aussteuer für einen Güterstand: Betrag (gedeckelt), Form (Geld, Wohnung, Familienbetrieb). Rein – bucht nichts. */
function dowryPlan(world, state, kind) {
  ensure(state);
  const p = state.partner; const K = KINDS()[kind]; const F = FAMILY();
  const out = { kind, cls: 0, className: '', cashReal: 0, form: 'cash', valueReal: 0, capReal: 0, limited: false, taken: !!state.fam.dowry, firm: null, home: null, why: null };
  if (!p || !K) return out;
  const pf = partnerFamily(world, state, p); out.cls = pf.cls; out.className = pf.name;
  const idx = idxOf(world, state); const year = yr(state);
  const op = opinion(world, state, { cls: pf.cls, visited: pf.visited });
  const span = F.opinionSpan || [0.8, 1.2];
  const amount = num(F.classes[pf.cls].dowryReal, 0) * num(K.dowryMult, 1) * (num(span[0], 0.8) + (num(span[1], 1.2) - num(span[0], 0.8)) * op / 100);
  out.capReal = Math.round(num(F.dowryCapPct, 40) / 100 * Math.max(netReal(world, state), num(F.dowryFloorReal, 204400)));
  let budget = Math.min(amount, out.capReal); out.limited = amount > out.capReal + 1;
  if (state.fam.dowry) { out.why = 'Eine Aussteuer gibt es nur einmal pro Leben.'; budget = 0; }
  if (budget < 1000) { out.cashReal = 0; return out; }
  const biz = require('./business');
  if (K.give && pf.cls === 3 && !state.fam.dowry) {
    const t0 = world.econ.companies.tiers[0]; const base = Math.round(t0.price * num(F.firmTierBasePct, 60) / 100);
    const can = (state.companies || []).length + heldCount(state) < world.econ.companies.maxCompanies && biz.qualification(world, state, p.pkey, 0).ok && !!world.prof(p.pkey);
    if (can && base <= budget) { out.form = 'firm'; out.valueReal = base; out.cashReal = 0; out.firm = { pkey: p.pkey, base }; return out; }
    if (!can) out.why = 'Der Familienbetrieb der Partnerfamilie würde nur zu Geld gemacht: Für ihn fehlen dir die Qualifikation oder ein freier Betriebsplatz.';
  }
  if (K.give && pf.cls >= 2 && !state.fam.dowry) {
    const city = world.city(state.cityId);
    for (const kind2 of F.homeKinds || ['flat']) {
      const def = world.econ.property[kind2]; if (!def || !city) continue;
      const base = Math.round(def.price * city.price_factor * 0.9);
      const home = { kind: kind2, base, rooms: def.rooms, rest: def.rest, name: def.name };
      const val = Math.round(base * 0.88 * require('./economy').realEstateFactor(year) * require('./cityecon').propertyMult(state.cityId, year));
      if (val <= budget) { out.form = 'home'; out.valueReal = val; out.home = home; return out; }
    }
  }
  out.cashReal = Math.round(budget); out.valueReal = out.cashReal; void idx;
  return out;
}

/** Aussteuer buchen (nur Spielstand, genau einmal je Hochzeit). Gibt den Eintrag für den Vertrag zurück. */
function applyDowry(world, state, plan) {
  const idx = idxOf(world, state); const year = yr(state);
  const d = { cash: 0, firm: null, home: null, real: 0, form: plan.form };
  if (plan.form === 'firm' && plan.firm) {
    const c = { id: state.nextCompanyId++, pkey: plan.firm.pkey, tier: 0, name: `${state.partner.name.split(' ').slice(-1)[0]} & Söhne`, cityId: state.cityId, rooms: world.econ.companies.tiers[0].rooms, staff: 0, manager: false, cash: 0, base: plan.firm.base, since: state.day, abandoned: null, lastProfit: 0, gen: 1, dowry: true };
    state.companies.push(c); d.firm = c.id; d.real = plan.valueReal;
  } else if (plan.form === 'home' && plan.home) {
    const pr = { id: state.nextPropId++, kind: plan.home.kind, name: `${plan.home.name} (Mitgift)`, cityId: state.cityId, rooms: plan.home.rooms, base: plan.home.base, condition: 88, closedUntil: 0, bought: state.day, rest: plan.home.rest };
    state.properties.push(pr); d.home = pr.id; d.real = plan.valueReal;
  } else if (plan.cashReal > 0) {
    const cents = Math.round(plan.cashReal * idx); state.money += cents; d.cash = plan.cashReal; d.real = plan.cashReal;
  }
  if (d.real > 0) state.fam.dowry = true;
  void year;
  return d;
}

/**
 * Hochzeit mit Ehevertrag und Eheringen (die Aktion prüft Geld und bucht Hochzeit, Notar und Ringe vorher). Setzt Ehevertrag, Aussteuer, Ring,
 * kleinen Ansehens- und Rangvorschuss der Herkunftsfamilie und merkt das Anfangsvermögen für den Zugewinn (nach Aussteuer und Kosten, inflationsbereinigt).
 */
function wed(world, state, kind, ringLv, ringPaidCents) {
  ensure(state); const f = state.fam; const p = state.partner; const F = FAMILY();
  const plan = dowryPlan(world, state, kind);
  const dow = applyDowry(world, state, plan);
  f.contract = { kind, day: state.day, startReal: 0, pid: p.personId, dowry: dow.real > 0 ? dow : null };
  if (ringLv > 0) f.ring = { lv: ringLv, paid: Math.round(ringPaidCents / idxOf(world, state)), day: state.day };
  f.contract.startReal = Math.round(netReal(world, state));
  const cls = plan.cls; const P = F.prestige || {};
  if (cls > 0) {
    require('./reputation').queue(state, 'civic', num(P.repPerClass, 0.6) * cls, 'fam_wedding', cls);
    const pts = Math.min(num(P.legacyMax, 6), num(P.legacyPerClass, 2) * cls);
    if (state.char) { const cur = state.char.legacy ? num(state.char.legacy.pts, 0) : 0; if (pts > cur) state.char.legacy = { pts: r1(pts), day: state.day }; }
  }
  p.contract = kind;
  queueLog(state, { k: 'wed', city: state.cityId, lv: kind === 'zugewinn' ? 1 : kind === 'trennung' ? 2 : 3, real: dow.real });
  return { plan, dow };
}

/* ------------------------------------------------------------------ Scheidung ------------------------------------------------------------------ */
/**
 * Regel der Scheidung nach Ehevertrag. null = kein Ehevertrag (Altstand oder unverheiratet): dann gilt die alte Regel (Hälfte des Vermögens).
 * Zugewinn: wer im Lauf der Ehe mehr dazugewonnen hat (Vermögen heute − Anfangsvermögen, beides inflationsbereinigt), gibt dem Partner die Hälfte des Zuwachses ab.
 * Gütertrennung: kein Ausgleich. Mitgift: kein Ausgleich, die Aussteuer fällt an die Herkunftsfamilie zurück.
 */
function divorceRule(world, state) {
  const f = state.fam; const p = state.partner;
  if (!f || !f.contract || !p || !p.married) return null;
  const K = f.contract; const idx = idxOf(world, state);
  const nw = netReal(world, state);
  const Z = Math.max(0, nw - K.startReal);
  const kind = K.kind; const def = KINDS()[kind];
  const owedReal = kind === 'zugewinn' ? Math.round(Z / 2) : 0;
  const give = !!(def && def.give) && K.dowry;
  return { kind, owed: Math.round(owedReal * idx), owedReal, Z: Math.round(Z), startReal: K.startReal, nwReal: Math.round(nw), restitute: give ? K.dowry : null };
}

/** Nach der Trennung: Rückfall der Mitgift, Ringe ablegen, Ehevertrag ruht, Chronik. Gibt Text für die Meldung zurück. */
function afterDivorce(world, state, rule, wasMarried) {
  ensure(state); const f = state.fam; const idx = idxOf(world, state); const back = [];
  if (rule && rule.restitute) {
    const d = rule.restitute;
    if (d.cash > 0) { const cents = Math.min(Math.max(0, state.money), Math.round(d.cash * idx)); state.money -= cents; back.push('Geld-Aussteuer'); }
    if (d.firm != null) { const c = (state.companies || []).find((x) => x.id === d.firm); if (c) { state.companies = state.companies.filter((x) => x.id !== c.id); if (state.occupation && state.occupation.ownCompanyId === c.id) state.occupation = null; back.push(c.name); } }
    if (d.home != null) { const pr = (state.properties || []).find((x) => x.id === d.home); if (pr) { state.properties = state.properties.filter((x) => x.id !== pr.id); if (state.housing.propertyId === pr.id) state.housing = { type: 'street', cityId: state.cityId }; back.push(pr.name); } }
  }
  f.contract = null; f.ring = null; if (wasMarried || rule) f.dyn.div = (f.dyn.div || 0) + 1;
  f.dowry = true; // eine Aussteuer gibt es nur einmal pro Leben – auch nach einer Scheidung nicht erneut
  delete state.pending.divorce;
  queueLog(state, { k: 'div', city: state.cityId });
  return back;
}

/** Anteil am Nachlass, den ein verheirateter Spieler-Ehepartner erbt: Faktor je Güterstand (Standard 1). */
function spouseFactor(p) {
  const k = p && typeof p.contract === 'string' && hasOwn(KINDS(), p.contract) ? KINDS()[p.contract] : null;
  return k ? num(k.spouseShare, 1) : 1;
}
/** Abfindung bei Scheidung zweier Spieler: Faktor je Güterstand (Gütertrennung: kein Ausgleich). */
function settlementFactor(p) {
  const k = p && p.contract ? p.contract : null;
  return k === 'zugewinn' || !k ? 1 : 0;
}

/* ------------------------------------------------------------------ Einarbeitung der Kinder ------------------------------------------------------------------ */
const GR = () => sec('groom');
const qualified = (c, pkey) => !!c && (c.pkey === pkey && c.path === 'done' || (c.skills || []).includes(pkey));
const growKey = (world, pkey) => TL.topKeys(TL.weightsFor(world, pkey))[0] || 'handwerk';

/** Prüfung vor der Einarbeitung. Gibt null oder den Grund zurück. */
function groomBlock(world, state, c, firm) {
  const G = GR(); const F = require('./family');
  if (!enabled() || G.enabled === false) return 'Die Einarbeitung ist gerade ausgeschaltet.';
  if (!c) return 'Kind nicht gefunden.';
  if (c.status !== 'home') return 'Das Kind lebt nicht bei dir.';
  if (c.groom) return 'Dein Kind wird schon eingearbeitet.';
  if (F.ageOfChild(state, c) < num(G.minAge, 15)) return `Zur Einarbeitung muss ein Kind mindestens ${num(G.minAge, 15)} Jahre alt sein.`;
  if (c.school || c.pendingSchool) return 'Erst die Schule beenden.';
  if (c.path === 'training' || c.path === 'study') return 'Dein Kind ist schon in Ausbildung oder Studium.';
  if (!firm || firm.abandoned) return 'Der Betrieb steht leer.';
  if (((state.children || []).filter((x) => x.groom && x.groom.cid === firm.id).length) >= num(G.maxPerFirm, 2)) return 'In diesem Betrieb werden schon genug Kinder eingearbeitet.';
  if (!qualified(c, firm.pkey)) {
    const p = world.prof(firm.pkey);
    if (!p) return 'Beruf nicht gefunden.';
    if (p.academic) return 'Für diesen Betrieb braucht dein Kind ein Studium (Gymnasium und Studium über die Familienseite).';
    if (!world.activeProfessions(yr(state)).includes(p)) return 'Diesen Beruf gibt es gerade nicht.';
  }
  return null;
}

function groomStart(world, state, c, firm) {
  const G = GR(); const qual = qualified(c, firm.pkey);
  c.groom = { cid: firm.id, kind: qual ? 'nachfolge' : 'lehre', since: state.day, exp: 0, grown: 0, ready: false, last: state.day };
  if (!qual) {
    const p = world.prof(firm.pkey);
    c.pendingPath = false; c.path = 'training'; c.pkey = firm.pkey;
    c.daysLeft = Math.max(30, Math.round((p.training_days || 365) * TL.studyMult(c.tal) * num(G.trainFactor, 0.9)));
  }
  return c.groom;
}

/** Beitrag eines eingearbeiteten Kindes zum Betrieb: Köpfe (Besetzung) und Vergütung (Cent je Tag). */
function groomFlow(world, state, firm, idx) {
  let units = 0; let wage = 0;
  if (!enabled()) return { units, wage };
  const G = GR(); const base = world.econ.companies.staffWage * idx;
  for (const c of state.children || []) {
    const g = c.groom; if (!g || g.cid !== firm.id || c.status !== 'home' || (c.estate && c.estate.companies.some((x) => x.id === firm.id))) continue;
    if (g.kind === 'lehre') { units += num(G.lehrUnits, 0.35); wage += base * num(G.lehrWagePct, 45) / 100; } else { units += num(G.nachfolgeUnits, 0.8); wage += base * num(G.nachfolgeWagePct, 80) / 100; }
  }
  return { units, wage: Math.round(wage) };
}

function groomDaily(ctx) {
  const { world, state } = ctx; const G = GR();
  for (const c of state.children || []) {
    const g = c.groom; if (!g) continue;
    const firm = (state.companies || []).find((x) => x.id === g.cid);
    const heldFirm = !firm && (c.estate && c.estate.companies.find((x) => x.id === g.cid));
    if (heldFirm && c.status === 'home') { g.exp++; continue; } // das Kind führt den übergebenen Betrieb selbst weiter: Berufserfahrung wächst weiter
    if (!firm || firm.abandoned || c.status !== 'home') { delete c.groom; continue; }
    g.exp++;
    if (g.kind === 'lehre' && c.path === 'done') g.kind = 'nachfolge'; // die Lehre ist geschafft: ab jetzt arbeitet das Kind als Fachkraft mit
    if (state.day - g.last >= num(G.growEvery, 90) && g.grown < num(G.growMax, 8) && c.tal) {
      g.last = state.day;
      const k = growKey(world, firm.pkey); const gain = TL.grow(c.tal, k, 1);
      if (gain > 0) g.grown += gain;
    }
    if (g.kind === 'nachfolge' && !g.ready && g.exp >= num(G.readyDays, 1095)) {
      g.ready = true;
      if (!ctx.offline) require('./core').notice(state, { level: 'good', title: `${nameOf(c.name)} ist bereit für die Nachfolge`, tab: 'family', text: `${nameOf(c.name)} kennt den Betrieb „${firm.name}“ jetzt von Grund auf. Beim Erben wird der Betrieb mit Abschlag auf den Pflichtanteil angerechnet, und mit einer Übergabe zu Lebzeiten kannst du ihn schon jetzt weitergeben.`, info: ['Dein Kind arbeitet seit Jahren im Familienbetrieb mit.', 'Ein bereiter Nachfolger behält den Betrieb leichter: Er wird im Pflichtanteil mit einem Abschlag angerechnet, und die Berufserfahrung bleibt dem Erben.', 'Du kannst den Betrieb schon zu Lebzeiten übergeben (Familie → Kind).'] });
      require('./core').chronicle(state, `${c.name} ist bereit, den Betrieb „${firm.name}“ zu übernehmen.`, 'family');
    }
  }
}

/* ------------------------------------------------------------------ Traditionsbetrieb ------------------------------------------------------------------ */
const TR = () => sec('tradition');
function tradLevel(state, c) {
  if (!c || c.abandoned) return 0;
  const years = (state.day - num(c.since, 0)) / 365; const gens = Math.max(1, Math.floor(num(c.gen, 1)));
  const L = TR().levels || D.tradition.levels; let lv = 0;
  L.forEach((x, i) => { if (years >= num(x.years, 999) && gens >= num(x.gens, 2)) lv = i + 1; });
  return lv;
}
const tradName = (lv) => ((TR().levels || D.tradition.levels)[lv - 1] || {}).name || '';
/** Faktor auf den Umsatz eines Betriebs (Kundenbindung über Generationen): 1 … 1,02, gedeckelt und unter `effects.strength`. */
function revMult(state, c) {
  const s = strength(); if (s <= 0 || !c) return 1;
  const lv = tradLevel(state, c); if (!lv) return 1;
  const L = (TR().levels || D.tradition.levels)[lv - 1];
  return 1 + clamp(num(L.revPct, 0), 0, num(TR().capPct, 2)) * Math.min(1, s) / 100;
}
function tradDaily(ctx) {
  const { state } = ctx; if (state.day % 7 !== 0) return;
  for (const c of state.companies || []) {
    const lv = tradLevel(state, c);
    if (lv > num(c.trad, 0)) {
      c.trad = lv;
      const nm = tradName(lv);
      require('./core').chronicle(state, `${c.name} wird zum „${nm}“.`, 'business');
      require('./core').notice(state, { level: 'good', title: `${c.name}: ${nm}`, tab: 'family', text: `Seit ${Math.floor((state.day - c.since) / 365)} Jahren gehört der Betrieb der Familie; ${c.gen} Generationen führen ihn. Kunden schätzen das: etwas mehr Umsatz und Ansehen.`, info: ['Ein Familienbetrieb über Generationen genießt Vertrauen.', 'Die Kundenbindung bringt einen kleinen, gedeckelten Umsatzzuwachs, dazu etwas Ansehen.', 'Führe den Betrieb in die nächste Generation, um die nächste Stufe zu erreichen.'] });
      queueLog(state, { k: 'trad', city: c.cityId, lv, note: c.name });
    }
    if (lv > 0 && state.day % 28 === 0) require('./reputation').queue(state, 'civic', num(((TR().levels || D.tradition.levels)[lv - 1] || {}).rep, 0.2), 'fam_trad', c.id);
  }
}
/** Höchste Traditionsstufe aller Betriebe (für den Titel „Traditionsbetrieb“). */
function tradFact(state) { let m = 0; for (const c of state.companies || []) m = Math.max(m, tradLevel(state, c)); return m; }

/* ------------------------------------------------------------------ Übergabe zu Lebzeiten ------------------------------------------------------------------ */
const HO = () => sec('handover');
function handoverCosts(world, state, valueCents, kind = 'company') {
  const H = HO(); const idx = idxOf(world, state);
  const valueReal = valueCents / idx;
  const relief = clamp(num((H.relief || {})[kind], 0), 0, 100) / 100;
  let taxable = Math.max(0, valueReal * (1 - relief) - num(H.freeReal, 400000));
  let taxReal = 0; let from = 0;
  for (const [upTo, rate] of H.rates || D.handover.rates) { const part = Math.min(taxable, upTo - from); if (part > 0) taxReal += part * num(rate, 0) / 100; from = upTo; if (taxable <= upTo) break; }
  const feeReal = Math.max(num(H.feeMinReal, 5000), valueReal * num(H.feePct, 1.2) / 100);
  return { valueReal: Math.round(valueReal), taxReal: Math.round(taxReal), feeReal: Math.round(feeReal), tax: Math.round(taxReal * idx), fee: Math.round(feeReal * idx), free: num(H.freeReal, 400000), relief: Math.round(relief * 100) };
}
/** Prüfung der Übergabe. Gibt null oder den Grund zurück. */
function handoverBlock(world, state, c, firm) {
  const H = HO(); const F = require('./family'); ensure(state);
  if (!enabled() || H.enabled === false) return 'Die Übergabe zu Lebzeiten ist gerade ausgeschaltet.';
  if (!c) return 'Kind nicht gefunden.';
  const age = Math.floor((state.day - state.person.birthDay) / 365);
  if (age < num(H.minAge, 55)) return `Eine Übergabe zu Lebzeiten ist ab ${num(H.minAge, 55)} Jahren möglich.`;
  if (c.status !== 'home') return 'Das Kind lebt nicht bei dir.';
  if (F.ageOfChild(state, c) < num(H.childMinAge, 18)) return `Das Kind muss mindestens ${num(H.childMinAge, 18)} Jahre alt sein.`;
  if (!firm) return 'Unternehmen nicht gefunden.';
  if (firm.abandoned) return 'Ein leerstehender Betrieb lässt sich nicht übergeben.';
  if (!qualified(c, firm.pkey)) return 'Das Kind braucht die Qualifikation für diesen Betrieb – arbeitet es ein, erlernt es den Beruf.';
  if (state.day - state.fam.hand.last < num(H.cooldownDays, 365)) return `Die nächste Übergabe ist erst in ${state.fam.hand.last + num(H.cooldownDays, 365) - state.day} Tagen möglich.`;
  if (((c.estate && c.estate.companies) || []).length >= num(H.maxPerChild, 2)) return 'Dieses Kind führt schon genug Betriebe.';
  if (firm.stock) return 'Ein börsennotierter Betrieb lässt sich nicht verschenken.';
  if (firm.construction) return 'Während des Umbaus lässt sich der Betrieb nicht übergeben.';
  if ((firm.playerStaff || []).length || firm.playerManager) return 'Im Betrieb arbeiten Mitspieler – beende erst deren Arbeitsverhältnisse.';
  const K = state.contracts || { buys: [], sells: [] };
  if ((K.buys || []).some((x) => x && x.firmId === firm.id && !x.ended) || (K.sells || []).some((x) => x && x.firmId === firm.id)) return 'Beende zuerst die Lieferverträge des Betriebs.';
  return null;
}
/** Betrieb an das Kind übergeben (Kosten bucht die Aktion vorher). Gibt Angaben für die Meldung zurück. */
function doHandover(world, state, c, firm, costs) {
  ensure(state);
  state.companies = state.companies.filter((x) => x.id !== firm.id);
  if (state.occupation && state.occupation.ownCompanyId === firm.id) state.occupation = null;
  const held = { ...firm, gen: Math.max(1, num(firm.gen, 1)), held: true };
  c.estate = c.estate || { companies: [] }; c.estate.companies.push(held);
  c.gift = c.gift || []; c.gift.push({ real: Math.round(costs.valueReal), day: state.day, name: firm.name });
  state.fam.hand.last = state.day; state.fam.hand.n++;
  if (c.groom && c.groom.cid === firm.id) c.groom = { ...c.groom, ready: true };
  queueLog(state, { k: 'hand', city: firm.cityId, real: costs.valueReal, note: firm.name });
  return held;
}
/** Betriebe, die Kinder für die Familie führen: sie zählen zur Höchstzahl der Unternehmen (die Übergabe schafft keinen Platz für weitere). */
const heldCount = (state) => (state.children || []).reduce((n, c) => n + (c.estate ? c.estate.companies.length : 0), 0);
function giftReal(c) { return (c.gift || []).reduce((s, g) => s + num(g.real, 0), 0); }
/** Vorempfänge aller Kinder in Cent heutiger Preise (zählen im Pflichtanteil mit, Wert zum Zeitpunkt der Schenkung inflationsbereinigt). */
function advances(world, state) { const idx = idxOf(world, state); return (state.children || []).reduce((s, c) => s + giftReal(c) * idx, 0); }

/** Übergebene Betriebe laufen weiter: Gewinn sammelt sich dort; ein Teil geht als Altenteil an die Eltern. */
function heldDaily(ctx) {
  const { world, state } = ctx; const biz = require('./business'); const year = yr(state); const idx = world.idx(year); const H = HO();
  const { isEuroDay } = require('./economy'); const euro = isEuroDay(state.day, state.startYear, world.econ);
  for (const ch of state.children || []) {
    if (!ch.estate) continue;
    for (const f of ch.estate.companies) {
      if (euro) f.cash = Math.round(f.cash / 2);
      if (f.abandoned) continue;
      let fl; try { fl = biz.companyFlows(world, state, f, year); } catch (_) { continue; }
      f.cash += fl.profit; f.lastProfit = fl.profit;
      if (f.cash < 0) f.cash = 0;
      const alt = fl.profit > 0 ? Math.min(f.cash, Math.floor(fl.profit * num(H.altenteilPct, 25) / 100)) : 0;
      if (alt > 0 && state.status === 'alive') { f.cash -= alt; state.money += alt; state.stats.earned += alt; f.altenteil = (f.altenteil || 0) + alt; }
    }
  }
  void idx;
}

/* ------------------------------------------------------------------ Dynastie-Wertung ------------------------------------------------------------------ */
const DY = () => sec('dynasty');
const dynLevels = () => { const l = DY().levels; return Array.isArray(l) && l.length === 5 ? l : D.dynasty.levels; };
const FAMILY_TITLES = ['stifter', 'maezen', 'tradition'];

function dynParts(world, state) {
  ensure(state); const Wt = { ...D.dynasty.weights, ...(DY().weights || {}) }; const Dy = DY(); const RP = require('./reputation');
  const parts = {};
  const gens = clamp((num(state.generation, 1) - 1) / Math.max(1, num(Dy.genFull, 5) - 1), 0, 1);
  parts.generations = gens * Wt.generations;
  const act = (state.companies || []).filter((c) => !c.abandoned); const held = (state.children || []).reduce((s, c) => s + ((c.estate && c.estate.companies) || []).length, 0);
  const tradSum = act.reduce((s, c) => s + tradLevel(state, c), 0);
  parts.firms = clamp(act.length * 0.2 + held * 0.2 + tradSum * 0.25, 0, 1) * Wt.firms;
  const idx = idxOf(world, state);
  const heldVal = (state.children || []).reduce((s, c) => s + ((c.estate && c.estate.companies) || []).reduce((a, f) => a + require('./business').companyValue(world, state, f, yr(state)) + (f.cash || 0), 0), 0);
  const nwReal = Math.max(1, (require('./core').netWorth(world, state) + heldVal) / idx / 100); // in DM von 1945
  const lo = Math.max(2, num(Dy.wealthMinDM, 1000)); const hi = Math.max(lo + 1, num(Dy.wealthMaxDM, 5000000));
  parts.wealth = clamp((Math.log(nwReal) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)), 0, 1) * Wt.wealth;
  const titles = state.civic && Array.isArray(state.civic.titles) ? state.civic.titles : [];
  const ft = new Set(titles.filter((t) => FAMILY_TITLES.includes(t.key)).map((t) => t.key)).size;
  parts.standing = clamp(((RP.stand(state).lv + 2) / 6) * 0.7 + Math.min(1, ft / 2) * 0.3, 0, 1) * Wt.standing;
  const kids = (state.children || []).filter((c) => ['home', 'withPartner'].includes(c.status));
  const edu = kids.reduce((s, c) => s + (c.path === 'done' || c.path === 'study' || c.path === 'training' ? 1 : 0.5), 0);
  parts.kids = clamp(edu / 3, 0, 1) * Wt.kids;
  const p = state.partner; const f = state.fam;
  const marriedYears = p && p.married && f.contract ? (state.day - f.contract.day) / 365 : p && p.married ? 5 : 0;
  parts.bond = clamp(clamp(marriedYears / 20, 0, 1) * 0.55 + (f.dyn.div > 0 ? 0 : 0.25) + (p && p.churchWed ? 0.2 : 0), 0, 1) * Wt.bond * (p && p.married ? 1 : 0.4); // die Hochzeit in der Gemeinde (Gesellschaft) festigt die Ehe
  parts.inherited = clamp(num(f.dyn.legacy, 0), 0, Wt.inherited);
  const total = r1(clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100));
  for (const k of Object.keys(parts)) parts[k] = r1(parts[k]);
  return { parts, total, weights: Wt };
}
function dynLevelFor(total, cur) {
  const L = dynLevels(); const hy = num(DY().hysteresis, 2);
  let lv = 1; L.forEach((x, i) => { if (total >= num(x.at, 0)) lv = i + 1; });
  if (lv < cur && total >= num(L[cur - 1].at, 0) - hy) lv = cur; // Trägheit beim Abstieg
  return lv;
}
function dynCheck(world, state, { silent = false } = {}) {
  ensure(state); const f = state.fam; const { total } = dynParts(world, state);
  f.dyn.pts = total; const from = f.dyn.lv; const lv = dynLevelFor(total, from);
  if (lv !== from) {
    f.dyn.lv = lv; if (lv > f.dyn.best) f.dyn.best = lv;
    if (lv > from && !silent) {
      const nm = dynLevels()[lv - 1].name;
      require('./core').chronicle(state, `Die Familie ${state.person.last} gilt jetzt als „${nm}“.`, 'dynasty');
      require('./core').notice(state, { level: 'good', title: `Familienrang: ${nm}`, tab: 'character', text: `Die Familie ${state.person.last} gilt jetzt als „${nm}“. Generationen, Familienbetriebe, Ansehen und Zusammenhalt zahlen sich aus.`, info: ['Die Dynastie-Wertung misst, wie fest die Familie über Generationen steht.', 'Sie wächst mit Generationen, Familienbetrieben und Traditionsbetrieben, Vermögen, Ansehen, gut ausgebildeten Kindern und einer beständigen Ehe.', 'Im Charakterblatt siehst du, was dir zur nächsten Stufe fehlt.'] });
      queueLog(state, { k: 'dyn', city: state.cityId, lv, from, note: nm });
    }
  }
  return lv;
}

/* ------------------------------------------------------------------ Tagesschritt, Erbe ------------------------------------------------------------------ */
/** Täglich (nach Familie, Betrieb, Charakterblatt): Werbung, Einarbeitung, Übergabe-Gewinne, Tradition, Dynastie. */
function daily(ctx) {
  const { world, state } = ctx;
  if (!state || state.status !== 'alive') return;
  if (!enabled()) return;
  if (!isObj(state.fam)) ensure(state);
  wooDaily(ctx); groomDaily(ctx); heldDaily(ctx); tradDaily(ctx);
  // Trennungsjahr abgelaufen: die Scheidung wird vollzogen
  const dv = state.pending && state.pending.divorce;
  if (dv && state.partner && state.day >= dv.day) require('./family').separate(ctx, { divorce: true });
  else if (dv && !state.partner) delete state.pending.divorce;
  if (state.day % Math.max(1, Math.floor(num(DY().checkDays, 7))) === 0) dynCheck(world, state);
}

/** Erbe: Dynastie-Wertung wird anteilig weitergegeben, Betriebe zählen eine Generation weiter, Einarbeitung wird zu Berufserfahrung. */
function inherit(world, old, state, child, plan) {
  ensure(old); ensure(state);
  const Dy = DY(); const Wt = { ...D.dynasty.weights, ...(Dy.weights || {}) };
  const oldTotal = old.fam && old.fam.dyn ? Math.max(old.fam.dyn.pts, dynParts(world, old).total) : 0;
  state.fam.dyn.legacy = r1(clamp(oldTotal * num(Dy.legacyPct, 12) / 100, 0, Math.min(Wt.inherited, num(Dy.legacyMax, 7))));
  state.fam.dyn.best = Math.max(1, old.fam ? old.fam.dyn.best : 1);
  for (const c of state.companies) { c.gen = Math.max(1, num(c.gen, 1)) + 1; c.trad = Math.min(num(c.trad, 0), tradLevel(state, c)); delete c.dowry; delete c.held; delete c.altenteil; }
  const g = child && child.groom;
  if (g) {
    const firm = state.companies.find((x) => x.id === g.cid);
    const cap = num(GR().heirExpCap, 3650);
    if (firm && child.skills && child.skills.includes(firm.pkey)) state.skills.days[firm.pkey] = Math.max(state.skills.days[firm.pkey] || 0, Math.min(cap, g.exp));
    if (firm && g.ready) {
      require('./core').notice(state, { level: 'good', title: 'Nachfolge geregelt', tab: 'business', text: `Du führst „${firm.name}“ weiter – eingearbeitet, qualifiziert und mit der Erfahrung aus den Jahren im Betrieb.`, info: ['Dein Elternteil hat dich im Familienbetrieb eingearbeitet.', 'Der Betrieb bleibt in der Familie und zählt jetzt eine Generation mehr: das bringt Kundenbindung und Ansehen.', 'Führe ihn weiter und gib ihn irgendwann an deine Kinder weiter.'] });
    }
  }
  queueLog(state, { k: 'gen', city: state.cityId, lv: state.generation, note: state.person.last });
  void plan;
  return state;
}

/** Pflichtanteil: Vorempfänge (Übergaben zu Lebzeiten) werden angerechnet. Rückgabe: Betrag in Cent, den das Kind schon erhalten hat. */
function givenTo(world, state, child) { return Math.round(giftReal(child) * idxOf(world, state)); }
function heldCompanies(child) { return child && child.estate ? child.estate.companies : []; }
/** Fortführungsprivileg: Wert eines Betriebs im Pflichtanteil des bereiten Nachfolgers (Cent). */
function successorValue(child, firmId, value) {
  const g = child && child.groom;
  if (!g || !g.ready || g.cid !== firmId) return value;
  return Math.round(value * (1 - clamp(num(GR().successorDiscPct, 25), 0, 60) / 100));
}

/* ------------------------------------------------------------------ Anzeige ------------------------------------------------------------------ */
function wooView(world, state) {
  const year = yr(state); const idx = idxOf(world, state); const A = ACTS();
  return Object.values(state.fam.woo).sort((a, b) => b.sym - a.sym).map((e) => {
    const best = bestAct(world, state, e); const askB = askBlock(world, state, e); const ac = askChance(world, state, e);
    const op = ac.op;
    return {
      id: e.id, name: e.name, first: nameOf(e.name), gender: e.gender, age: e.age, profession: e.profession, cityId: e.cityId, sym: Math.round(e.sym), hits: e.hits, miss: e.miss, dates: e.dates, stage: stageOf(e),
      likes: e.likes.map((t) => ({ tag: t, label: LIKES()[t], known: e.known.includes(t) || e.visited })), known: e.known.length, visited: e.visited,
      opinion: op, opinionBand: opinionBand(op), className: e.visited ? FAMILY().classes[e.cls].name : null, idleDays: state.day - e.last, since: state.day - e.since,
      best, askBlock: askB, askChance: Math.round(ac.p * 100), askAt: Math.max(0, e.askAt - state.day), tries: e.tries,
      visit: { ok: !visitBlock(world, state, e), why: visitBlock(world, state, e), cost: Math.round(num(W().visit.cost, 2) * world.econ.giftCost * idx), minSym: num(W().visit.minSym, 40) },
      acts: Object.keys(A).map((k) => ({ key: k, label: actName(k, year), icon: A[k].icon, tag: A[k].tag, tagLabel: LIKES()[A[k].tag], text: A[k].text, talent: A[k].talent, cost: actCostCents(world, state, k), wait: Math.max(0, (e.cd[k] || 0) - state.day), ok: !actBlock(world, state, e, k), why: actBlock(world, state, e, k), best: k === best })),
      hist: e.hist.slice().reverse().map((h) => ({ day: h[0], act: h[1], label: actName(h[1], year), delta: h[2], res: h[3] })),
    };
  });
}

function contractView(world, state) {
  ensure(state); const f = state.fam; const K = KINDS(); const p = state.partner;
  const wedCost = Math.round(world.econ.marriageCost * idxOf(world, state)); const year = yr(state);
  const kinds = Object.keys(K).map((key) => {
    const k = K[key]; const pl = p && !p.married && !p.linked ? dowryPlan(world, state, key) : null;
    return { key, name: k.name, short: k.short, text: k.text, notary: Math.round(num(k.notaryMult, 0) * wedCost), give: !!k.give, spouseShare: num(k.spouseShare, 1),
      dowry: pl ? { form: pl.form, cash: Math.round(pl.cashReal * idxOf(world, state)), value: Math.round(pl.valueReal * idxOf(world, state)), limited: pl.limited, cls: pl.cls, className: pl.className, taken: pl.taken, why: pl.why, firm: pl.firm ? { pkey: pl.firm.pkey, name: (world.prof(pl.firm.pkey) || {}).name || '' } : null, home: pl.home ? pl.home.name : null } : null };
  });
  const rings = [0, 1, 2, 3].map((lv) => ({ lv, name: lv ? ringName(lv, year) : 'Keine Ringe', text: lv ? ringDef(lv).text : 'Ihr verzichtet auf Ringe.', price: lv ? ringPrice(world, state, lv) : 0, look: lv ? num(require('./character').levelDef('schmuck', lv).look, 0) : 0 }));
  const cur = f.contract ? { kind: f.contract.kind, name: K[f.contract.kind].name, day: f.contract.day, dowry: f.contract.dowry, startReal: f.contract.startReal, rule: state.partner ? divorceRule(world, state) : null } : null;
  const dv = state.pending && state.pending.divorce;
  return { kinds, rings, wedCost, current: cur, ring: f.ring ? { lv: f.ring.lv, name: ringName(f.ring.lv, year), paid: Math.round(f.ring.paid * idxOf(world, state)) } : null,
    divorce: { pending: dv ? Math.max(0, dv.day - state.day) : null, cost: Math.round(num((C().contract || D.contract).divorce.costMult, 1.5) * wedCost), waitDays: num((C().contract || D.contract).divorce.waitDays, 365) } };
}

function kidView(world, state, c) {
  const F = require('./family'); const idx = idxOf(world, state); const age = F.ageOfChild(state, c);
  const firms = (state.companies || []).filter((x) => !x.abandoned);
  const g = c.groom; const firm = g ? firms.find((x) => x.id === g.cid) : null;
  const options = firms.map((x) => { const why = groomBlock(world, state, c, x); const hw = handoverBlock(world, state, c, x); const co = handoverCosts(world, state, require('./business').companyValue(world, state, x, yr(state)) + x.cash);
    return { id: x.id, name: x.name, pkey: x.pkey, profession: (world.prof(x.pkey) || {}).name || '', kind: qualified(c, x.pkey) ? 'nachfolge' : 'lehre', ok: !why, why, handover: { ok: !hw, why: hw, tax: co.tax, fee: co.fee, value: Math.round(co.valueReal * idx), relief: co.relief, free: Math.round(co.free * idx), taxReal: co.taxReal } }; });
  return {
    id: c.id, age, groom: g ? { cid: g.cid, firm: firm ? firm.name : '', kind: g.kind, days: g.exp, ready: !!g.ready, grown: g.grown, readyAt: num(GR().readyDays, 1095), key: firm ? growKey(world, firm.pkey) : null, daysLeft: c.path === 'training' ? c.daysLeft : 0 } : null,
    estate: heldCompanies(c).map((f) => ({ id: f.id, name: f.name, cash: f.cash, profit: f.lastProfit || 0, value: require('./business').companyValue(world, state, f, yr(state)), altenteil: f.altenteil || 0, gen: f.gen || 1, trad: tradLevel(state, f) })),
    gift: Math.round(giftReal(c) * idx), options, canGroom: !groomBlockBasic(state, c),
  };
}
function groomBlockBasic(state, c) { const F = require('./family'); if (c.status !== 'home' || c.groom || F.ageOfChild(state, c) < num(GR().minAge, 15) || c.school || c.pendingSchool || c.path === 'training' || c.path === 'study') return true; return false; }

function dynView(world, state) {
  ensure(state); const f = state.fam; const { parts, total, weights } = dynParts(world, state); const L = dynLevels(); const lv = f.dyn.lv;
  const next = lv < 5 ? { lv: lv + 1, name: L[lv].name, at: num(L[lv].at, 0), missing: r1(Math.max(0, num(L[lv].at, 0) - total)) } : null;
  const firms = (state.companies || []).filter((c) => !c.abandoned).map((c) => { const t = tradLevel(state, c); return { id: c.id, name: c.name, years: Math.floor((state.day - num(c.since, 0)) / 365), gen: c.gen || 1, trad: t, tradName: t ? tradName(t) : '', rev: r2((revMult(state, c) - 1) * 100) }; });
  const TL_ = TR().levels || D.tradition.levels;
  return {
    pts: total, lv, name: L[lv - 1].name, best: f.dyn.best, since: f.dyn.since, next, parts: Object.keys(weights).map((k) => ({ key: k, pts: parts[k] || 0, max: weights[k] })), levels: L.map((x, i) => ({ lv: i + 1, name: x.name, at: num(x.at, 0), done: i + 1 <= lv })),
    generation: state.generation, firms, tradLevels: TL_.map((x, i) => ({ lv: i + 1, name: x.name, years: x.years, gens: x.gens, rev: x.revPct })), legacy: f.dyn.legacy, div: f.dyn.div,
  };
}

function view(world, state) {
  if (!state) return null;
  ensure(state);
  const A = W().ask;
  return {
    on: enabled(), strength: strength(), maxActive: num(W().maxActive, 3), woo: wooView(world, state), contract: contractView(world, state),
    askMin: { sym: num(A.minSym, 60), hits: num(A.minHits, 3) }, likes: LIKES(), family: state.partner ? (() => { const pf = partnerFamily(world, state, state.partner); return { cls: pf.cls, name: pf.name, visited: pf.visited, opinion: opinion(world, state, { cls: pf.cls, visited: pf.visited }) }; })() : null,
    dyn: dynView(world, state), groomOn: GR().enabled !== false, handover: { on: HO().enabled !== false, minAge: num(HO().minAge, 55), childMinAge: num(HO().childMinAge, 18), altenteilPct: num(HO().altenteilPct, 25), n: state.fam.hand.n, wait: Math.max(0, state.fam.hand.last + num(HO().cooldownDays, 365) - state.day) },
    kids: (state.children || []).filter((c) => c.status === 'home' || c.estate || c.groom).map((c) => kidView(world, state, c)),
    tradition: { levels: (TR().levels || D.tradition.levels).map((x) => ({ name: x.name, years: x.years, gens: x.gens })), capPct: num(TR().capPct, 2) },
  };
}

module.exports = {
  C, enabled, strength, ensure, newFam, queueLog, cleanEntry, candKey, classOf, likesOf, opinion, opinionBand, startSym, meetBlock, start, quality, actCostCents, actBlock, act, visitBlock, askChance, askBlock, bestAct, stageOf, wooDaily, drop, makePartner,
  ringDef, ringName, ringPrice, partnerFamily, dowryPlan, applyDowry, wed, divorceRule, afterDivorce, spouseFactor, settlementFactor, KINDS, FAMILY, ACTS, LIKES, W,
  heldCount, qualified, groomBlock, groomStart, groomFlow, groomDaily, growKey, tradLevel, tradName, revMult, tradFact, handoverCosts, handoverBlock, doHandover, giftReal, advances, heldDaily, givenTo, heldCompanies, successorValue,
  dynParts, dynLevels, dynLevelFor, dynCheck, daily, inherit, wooView, contractView, kidView, dynView, view, activeWoo, nameOf, clamp, num, r1, r2, GR, HO, TR, FAMILY_TITLES,
};
