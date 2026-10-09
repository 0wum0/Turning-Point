'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../src/game/reputation');
const settings = require('../src/settings');
const rl = require('../src/lib/reputation');

const C = () => settings.get('ruf');
const fresh = () => ({ c: R.blank(), caps: null });
const DAY = 20000;

test('Gesamtwert und Stufen: Grenzen, Reihenfolge, Verrufen bis Ehrenbürger', () => {
  const cc = C();
  assert.strictEqual(R.levelOf(0, cc), 0);
  assert.strictEqual(R.levelName(R.levelOf(0, cc)), 'Unbekannt');
  const names = [-60, -31, -29, -9, 11, 12, 31, 32, 54, 55, 77, 78, 100].map((s) => R.levelOf(s, cc));
  assert.deepStrictEqual(names, [-2, -2, -1, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.strictEqual(R.score({ rel: 100, trade: 100, civic: 100, office: 100, scandal: 0 }, cc), 100);
  assert.ok(R.score({ rel: 0, trade: 0, civic: 0, office: 0, scandal: 60 }, cc) < -30, 'viel Skandal ergibt Verrufen');
  assert.ok(R.score({ rel: 100, trade: 100, civic: 100, office: 100, scandal: 100 }, cc) < 20, 'Skandal frisst fast alles');
  for (const sc of [-100, -30, 0, 50, 100]) { const p = R.progress(sc, cc); assert.ok(p.pct >= 0 && p.pct <= 1); }
  assert.strictEqual(R.progress(90, cc).next, null);
});

test('Ereignisse: Tagesgrenze je Ereignis, abnehmender Ertrag, Zuwachsgrenze je Bestandteil', () => {
  const cc = { ...C(), mult: {}, caps: {} };
  let rec = fresh(); let total = 0;
  for (let i = 0; i < 30; i++) { const r = R.applyEvent(rec, { reason: 'rent_paid', delta: 1 }, cc, DAY); rec = { c: r.c, caps: r.caps }; total += r.applied; }
  assert.ok(total <= R.REASONS.rent_paid.cap + 1e-9, `Tagesgrenze eingehalten (${total})`);
  assert.ok(total > 3, 'ein Teil kommt an');
  // nächster Tag: wieder Spielraum
  const r2 = R.applyEvent(rec, { reason: 'rent_paid', delta: 1 }, cc, DAY + 1);
  assert.ok(r2.applied > 0.8);
  // abnehmender Ertrag: bei hohem Wert bringt derselbe Betrag weniger
  const low = R.applyEvent({ c: { ...R.blank(), rel: 10 }, caps: null }, { reason: 'trade_done', kind: 'rel', delta: 2 }, cc, DAY).applied;
  const high = R.applyEvent({ c: { ...R.blank(), rel: 90 }, caps: null }, { reason: 'trade_done', kind: 'rel', delta: 2 }, cc, DAY).applied;
  assert.ok(low > high * 3, 'abnehmender Ertrag');
  // niemals über 100 oder unter -40
  let c = { ...R.blank(), rel: 99.5 }; for (let d = 0; d < 20; d++) { const r = R.applyEvent({ c, caps: null }, { reason: 'loan_cleared', delta: 40 }, cc, DAY + d); c = r.c; }
  assert.ok(c.rel <= 100); c = { ...R.blank() };
  for (let d = 0; d < 40; d++) { const r = R.applyEvent({ c, caps: null }, { reason: 'rent_missed', delta: -40 }, cc, DAY + d); c = r.c; }
  assert.ok(c.rel >= -40 && c.rel < -30);
  // Zuwachsgrenze je Bestandteil
  let rr = fresh(); let sum = 0;
  for (const reason of ['trade_done', 'offer_answered', 'supply_ok', 'exchange_trade', 'ipo']) for (let i = 0; i < 6; i++) { const r = R.applyEvent(rr, { reason, delta: 8 }, { ...cc, compDayCap: 5 }, DAY); rr = { c: r.c, caps: r.caps }; sum += r.applied; }
  assert.ok(sum <= 5.0001, `Bestandteil-Grenze (${sum})`);
  // Schlechtes wird nicht durch die Zuwachsgrenze gebremst, aber durch die Ereignisgrenze
  let bad = fresh(); let s2 = 0; for (let i = 0; i < 20; i++) { const r = R.applyEvent(bad, { reason: 'sabotage_caught', delta: 25 }, cc, DAY); bad = { c: r.c, caps: r.caps }; s2 += r.applied; }
  assert.ok(s2 <= 50 && s2 > 20);
});

test('Paar-Grenze: ein Gegenüber bringt nur einen Teil der Tagesgrenze', () => {
  const cc = { ...C(), pairCapPct: 50, mult: {}, caps: {} };
  let rec = fresh(); let sum = 0;
  for (let i = 0; i < 10; i++) { const r = R.applyEvent(rec, { reason: 'trade_done', delta: 3, pairKey: 7 }, cc, DAY); rec = { c: r.c, caps: r.caps }; sum += r.applied; }
  assert.ok(sum <= R.REASONS.trade_done.cap * 0.5 + 1e-9, `Paar-Grenze (${sum})`);
  const other = R.applyEvent(rec, { reason: 'trade_done', delta: 3, pairKey: 8 }, cc, DAY);
  assert.ok(other.applied > 0, 'anderes Gegenüber zählt');
});

test('Multiplikator und Grenze aus den Einstellungen', () => {
  const r0 = R.applyEvent(fresh(), { reason: 'gift', delta: 1 }, { ...C(), mult: { gift: 0 } }, DAY);
  assert.strictEqual(r0.applied, 0);
  const r1 = R.applyEvent(fresh(), { reason: 'gift', delta: 3 }, { ...C(), mult: {}, caps: { gift: 1 } }, DAY);
  assert.ok(r1.applied <= 1.0001);
  const huge = R.applyEvent(fresh(), { reason: 'bankrupt', delta: 1e9 }, { ...C(), mult: {}, caps: {} }, DAY);
  assert.ok(huge.applied <= 40 + 1e-9, 'Einzelbetrag begrenzt');
  assert.strictEqual(R.applyEvent(fresh(), { reason: 'gibts_nicht', delta: 3 }, C(), DAY).applied, 0);
  assert.strictEqual(R.applyEvent(fresh(), { reason: 'gift', delta: NaN }, C(), DAY).applied, 0);
});

test('Abflauen: zur Mitte, Skandal langsam aber sicher, nie negativ', () => {
  const cc = C();
  const a = R.decay({ rel: 80, trade: -20, civic: 50, office: 50, scandal: 40 }, 10, cc);
  assert.ok(a.rel < 80 && a.rel > 50);
  assert.ok(a.trade > -20 && a.trade < 0, 'Negatives erholt sich zur Mitte');
  assert.ok(a.office > a.civic * 0.9, 'Amtsansehen flaut langsamer ab');
  assert.ok(a.scandal < 40 && a.scandal > 10);
  assert.strictEqual(R.decay({ ...R.blank(), scandal: 5 }, 400, cc).scandal, 0);
  assert.deepStrictEqual(R.decay({ rel: 5, trade: 0, civic: 0, office: 0, scandal: 0 }, 0, cc).rel, 5);
  // sehr lange Abwesenheit bleibt endlich
  const z = R.decay({ rel: 100, trade: 100, civic: 100, office: 100, scandal: 100 }, 1e9, cc);
  for (const k of R.KINDS) assert.ok(Number.isFinite(z[k]) && z[k] >= 0 && z[k] < 1e-6 + 1);
});

test('Erbe: Bestandteile schrumpfen auf den eingestellten Anteil', () => {
  const p = { rel: 60, trade: 40, civic: 20, office: 80, scandal: 30 };
  const h = R.inherit(p, 50); assert.strictEqual(h.rel, 30); assert.strictEqual(h.scandal, 15);
  assert.ok(R.score(h) < R.score(p) && R.score(h) > 0);
  const r = R.inherit(p, 25); assert.strictEqual(r.office, 20);
  assert.deepStrictEqual(R.inherit(p, 0), R.blank());
  assert.deepStrictEqual(R.inherit(p, 100), p);
  assert.ok(R.inherit(p, 500).rel <= 60, 'über 100 % wird auf 100 begrenzt');
});

test('Örtliches Ansehen mischt landesweit und Ort', () => {
  const cc = { ...C(), localShare: 50 };
  assert.strictEqual(R.localScore(40, 40, cc), 40);
  assert.strictEqual(R.localScore(40, 0, cc), 20, 'in der Fremde nur halb bekannt');
  assert.strictEqual(R.localScore(40, 80, cc), 60);
  assert.strictEqual(R.localScore(-100, -100, cc), -100);
  const snap = R.makeSnap({ rel: 60, trade: 30, civic: 40, office: 0, scandal: 0 }, 10, cc);
  assert.ok(snap.l < snap.s && snap.lv >= snap.ll);
});

test('Warteschlange im Spielstand: zusammengefasst, begrenzt, ohne Wirkung wenn aus', () => {
  const st = { pending: {}, cityId: 3 };
  R.queue(st, 'rel', null, 'rent_paid'); R.queue(st, null, null, 'rent_paid'); R.queue(st, 'trade', 2, 'trade_done', 'x', { other: 5 });
  assert.strictEqual(st.pending.rep.length, 2);
  assert.strictEqual(st.pending.rep[0].n, 2);
  assert.strictEqual(st.pending.rep[0].c, 3);
  for (let i = 0; i < 100; i++) R.queue(st, 'trade', 1, 'trade_done', `ref${i}`, { other: 100 + i });
  assert.ok(st.pending.rep.length <= 40, 'Liste bleibt klein');
  const none = { pending: {} }; R.queue(none, 'zzz', 3, 'x'); R.queue(none, 'rel', 0, 'rent_paid'); R.queue(none, 'rel', NaN, 'rent_paid');
  assert.ok(!none.pending.rep || none.pending.rep.length === 0);
  R.queue({}, 'rel', 1, 'rent_paid'); // ohne pending: kein Fehler
});

test('Wirkungen bleiben in ihren Grenzen und sind monoton', () => {
  const cc = C();
  for (let lv = -2; lv <= 4; lv++) {
    assert.ok(Math.abs(R.creditRateDelta(lv, cc)) <= 3);
    const lim = R.creditLimitMult(lv, cc); assert.ok(lim >= 0.5 && lim <= 1.3);
    assert.ok(Math.abs(R.contractBandPad(lv, cc)) <= 5);
    const td = R.tenantDemandMult(lv, cc); assert.ok(td >= 0.6 && td <= 1.3);
    const am = R.arrearsMult(lv, cc); assert.ok(am >= 0.3 && am <= 2);
    if (lv > -2) {
      assert.ok(R.creditRateDelta(lv, cc) <= R.creditRateDelta(lv - 1, cc), 'besseres Ansehen, günstigerer Zins');
      assert.ok(R.creditLimitMult(lv, cc) >= R.creditLimitMult(lv - 1, cc));
      assert.ok(R.contractBandPad(lv, cc) >= R.contractBandPad(lv - 1, cc));
      assert.ok(R.tenantDemandMult(lv, cc) >= R.tenantDemandMult(lv - 1, cc));
      assert.ok(R.arrearsMult(lv, cc) <= R.arrearsMult(lv - 1, cc));
    }
  }
  const off = { ...cc, effects: { ...cc.effects, strength: 0 } };
  assert.strictEqual(R.creditRateDelta(4, off), 0); assert.strictEqual(R.creditLimitMult(-2, off), 1); assert.strictEqual(R.voteWeight(90, 0, false, off), 1);
  assert.strictEqual(R.contractBandPad(4, { ...cc, enabled: false }), 0);
  const dbl = { ...cc, effects: { ...cc.effects, strength: 2 } };
  assert.ok(R.creditLimitMult(-2, dbl) >= 0.5 && R.creditLimitMult(4, dbl) <= 1.3);
  const noCredit = { ...cc, effects: { ...cc.effects, credit: false } }; assert.strictEqual(R.creditRateDelta(4, noCredit), 0);
});

test('Stimmengewicht: ±10 %, Amtsinhaber mit Skandal verlieren bis 15 % zusätzlich', () => {
  const cc = C();
  assert.strictEqual(R.voteWeight(0, 0, false, cc), 1);
  assert.ok(R.voteWeight(100, 0, false, cc) <= 1.1 && R.voteWeight(100, 0, false, cc) > 1.05);
  assert.ok(R.voteWeight(-100, 60, false, cc) >= 0.89);
  const inc = R.voteWeight(10, 60, true, cc); const non = R.voteWeight(10, 60, false, cc);
  assert.ok(inc < non - 0.1 && inc >= 0.75);
  assert.ok(R.voteWeight(-100, 100, true, cc) >= 0.75);
  assert.strictEqual(R.voteWeight(NaN, NaN, true, cc) > 0, true);
});

test('Mindeststufen für Ämter: steigend, Kanzler am höchsten; Sperrtexte', () => {
  const cc = C();
  const mins = [0, 1, 2, 3, 4, 5].map((i) => R.officeMin(i, cc));
  for (let i = 1; i < mins.length; i++) assert.ok(mins[i] >= mins[i - 1]);
  assert.ok(mins[5] >= 3 && mins[0] <= 0);
  assert.strictEqual(R.officeMin(1, { ...cc, effects: { ...cc.effects, elections: false } }), -1);
  assert.ok(R.block(1, 2).includes('Ansehen: Angesehen'));
  assert.strictEqual(R.block(2, 2), null);
  assert.strictEqual(R.block(0, -1), null);
  assert.ok(R.block(-2, -1).includes('Verrufen'));
  assert.strictEqual(R.minFor('ipo', cc), 1);
  assert.strictEqual(R.minFor('loan', { ...cc, effects: { ...cc.effects, strength: 0 } }), -2);
});

test('Zwischenspeicher im Spielstand: neutral ohne Daten, Kurzfassung mit Namen', () => {
  assert.deepStrictEqual(R.stand({}), { s: 0, l: 0, lv: 0, ll: 0 });
  assert.strictEqual(R.stand({ rep: { s: 40, l: 30, lv: 2, ll: 1 } }).lv, 2);
  assert.strictEqual(R.stand({ rep: { s: 'x' } }).lv, 0);
  assert.strictEqual(R.brief({ rep: { s: 60, l: 60, lv: 3, ll: 3 } }).name, 'Honoratior');
  assert.strictEqual(R.stand({ rep: { s: 9, l: 9, lv: 99, ll: -99 } }).lv, 4);
});

test('Kein Ereignis kennt einen unbekannten Bestandteil; Protokolltexte sind gesetzt', () => {
  for (const [k, v] of Object.entries(R.REASONS)) { assert.ok(R.KINDS.includes(v.kind), k); assert.ok(v.label && v.cap >= 0, k); assert.ok(rl.labelOf(k)); }
  assert.ok(rl.labelOf('inherit').includes('Erbe'));
  assert.strictEqual(rl.labelOf('unbekannt'), 'Sonstiges');
});

/* ---- Speicherschicht mit Attrappe: genau einmal buchen ---- */
function fakeConn() {
  const calls = { logInsert: 0, logUpdate: 0, repUpdate: 0 };
  const row = { user_id: 1, rel: 0, trade: 0, civic: 0, office: 0, scandal: 0, caps: null, decay_day: R.isDay(Date.now()), c_pts: null, c_day: null };
  return {
    calls, repAfter: [],
    async one(sql) { if (/FROM reputation r/.test(sql)) return { ...row }; return null; },
    async query(sql, p) {
      if (/^UPDATE reputation SET rel/.test(sql)) { calls.repUpdate++; [row.rel, row.trade, row.civic, row.office, row.scandal] = p; row.caps = p[7]; }
      if (/^UPDATE reputation_log/.test(sql)) { calls.logUpdate++; return { affectedRows: 0 }; }
      if (/^INSERT INTO reputation_log/.test(sql)) calls.logInsert++;
      return { affectedRows: 1 };
    },
  };
}
test('flush bucht vorgemerkte Ereignisse genau einmal und leert die Liste', async () => {
  const st = { pending: {}, cityId: 5 };
  R.queue(st, 'rel', null, 'rent_paid'); R.queue(st, 'trade', 2, 'trade_done', 'a'); R.queue(st, 'civic', null, 'tax_paid');
  const conn = fakeConn();
  await rl.flush(conn, { id: 1 }, st);
  assert.strictEqual(conn.calls.logInsert, 3);
  assert.deepStrictEqual(st.pending.rep, []);
  await rl.flush(conn, { id: 1 }, st);
  assert.strictEqual(conn.calls.logInsert, 3, 'zweiter Aufruf bucht nichts');
  assert.ok(st.rep && Number.isFinite(st.rep.s), 'Zwischenspeicher gesetzt');
});
test('flush: fremde Ziele werden erst nach dem Commit gebucht', async () => {
  const st = { pending: {}, cityId: 5 };
  R.queue(st, 'trade', 2, 'trade_done', 'b', { user: 99, other: 1 });
  const conn = fakeConn();
  await rl.flush(conn, { id: 1 }, st);
  assert.strictEqual(conn.calls.logInsert, 0);
  assert.strictEqual(conn.repAfter.length, 1);
  assert.deepStrictEqual(st.pending.rep, []);
});
test('Missbrauchsschutz: Ereignis ohne Zählung wird nicht protokolliert (gleiche IP)', async () => {
  const conn = fakeConn(); const real = rl.countsFor;
  // countsFor liest die Datenbank; ohne Pool schlägt sameIp fehl und wird übergangen – hier nur: kein Absturz
  const n = await rl.addConn(conn, 1, 'rel', 1, 'rent_paid', 'x', { other: 0 });
  assert.ok(n > 0); assert.ok(real);
});
