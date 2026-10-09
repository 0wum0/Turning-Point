'use strict';
/**
 * Spielerwahlen: Ämter (Ortsbeirat … Bundeskanzler) werden in Echtzeit-Zyklen vergeben.
 *  - Zyklus: alle `cycleDays` Tage endet eine Wahlrunde; in den letzten `voteHours` Stunden wird abgestimmt, davor kandidiert man.
 *  - Städtische Ämter (Index < firstNationalOffice) werden je Stadt gewählt (Wähler wohnen dort), höhere Ämter landesweit.
 *  - Eine Stimme je Wahl und Konto; Bots dürfen mitstimmen, ihr Gewicht ist gedeckelt. Gleichstand entscheidet der Einfluss.
 *  - Der Sieger erhält das Amt über state.politics.term (dieselbe Mechanik wie die Zufallskandidatur).
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const social = require('./social');
const tagesblatt = require('./tagesblatt');
const service = require('../game/service');
const press = require('../game/press');
const { ActionError } = require('../game/actions');
const { rngFor } = require('../game/rng');
const { scale } = require('../game/economy');
const { yearOf, ageYears } = require('../game/calendar');
const { notice, chronicle, award } = require('../game/core');
const RP = require('../game/reputation');

const cfg = () => settings.get('elections');
const fail = (m) => { throw new ActionError(m); };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const offices = (world) => world.econ.politics.offices;
const scopeCity = (c, idx, cityId) => (idx >= c.firstNationalOffice ? 0 : cityId);

/** Wahlzyklus zu einem Zeitpunkt: Nominierungsphase bis voteStart, danach Wahlfenster bis voteEnd. */
function windowAt(now, c) {
  const cyc = Math.max(1, c.cycleDays) * 86400000;
  const k = Math.floor(now / cyc);
  const end = (k + 1) * cyc;
  const start = Math.max(k * cyc, end - Math.min(c.voteHours, c.cycleDays * 24) * 3600000);
  return { cycle: k, voteStart: start, voteEnd: end, phase: now < start ? 'nomination' : 'voting' };
}

/**
 * Auszählung (rein). cands: [{userId, influence}], votes: {candidateId: n} (Spieler), bots: {candidateId: n}.
 * Sieger: meiste Stimmen, dann Einfluss, dann niedrigere Nutzer-ID. Ohne jede Stimme gewinnt nur ein einzelner Kandidat.
 */
function tally(cands, votes = {}, bots = {}) {
  // weight (optional, Standard 1): Gewicht aus dem Ansehen des Kandidaten (±10 %, Amtsinhaber mit Skandal bis −15 % zusätzlich) – siehe game/reputation.voteWeight
  const rows = cands.map((c) => ({ userId: c.userId, influence: c.influence || 0, human: votes[c.userId] || 0, bots: bots[c.userId] || 0, weight: Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 1 }));
  rows.forEach((r) => { r.votes = r.human + r.bots; r.score = r.votes * r.weight; });
  rows.sort((a, b) => b.score - a.score || b.votes - a.votes || b.influence - a.influence || a.userId - b.userId);
  const total = rows.reduce((s, r) => s + r.votes, 0);
  let winnerId = null; let tie = false;
  if (rows.length === 1) winnerId = rows[0].userId;
  else if (total > 0) { winnerId = rows[0].userId; tie = Math.abs(rows[0].score - rows[1].score) < 1e-9; }
  return { ranking: rows, winnerId, tie, total };
}

/** Stimmen der Bots: begrenzte Beteiligung, zufällig nach Einfluss gewichtet, höchstens botMaxPctOfHuman % der Spielerstimmen (mind. 1). */
function botVotesFor(electionId, cands, botCount, humanVotes, c) {
  const out = {};
  if (!c.botVotes || !cands.length || botCount <= 0) return out;
  const voters = Math.min(c.botVoteMax, botCount);
  const turnout = Math.round((voters * c.botTurnoutPct) / 100);
  const cap = Math.max(1, Math.ceil((Math.max(0, humanVotes) * c.botMaxPctOfHuman) / 100));
  const n = Math.min(turnout, cap);
  const r = rngFor('elbots', electionId);
  const wsum = cands.reduce((s, x) => s + 1 + Math.max(0, x.influence || 0), 0);
  for (let i = 0; i < n; i++) {
    let x = r() * wsum; let pick = cands[cands.length - 1];
    for (const cd of cands) { x -= 1 + Math.max(0, cd.influence || 0); if (x <= 0) { pick = cd; break; } }
    out[pick.userId] = (out[pick.userId] || 0) + 1;
  }
  return out;
}

/** Spielstand-Prüfung für eine Kandidatur (rein). Gibt einen Hinweistext zurück oder null. */
function runBlock(world, state, idx, c, accountHours) {
  const pc = world.econ.politics; const o = pc.offices[idx];
  if (!c.enabled) return 'Spielerwahlen sind gerade nicht möglich.';
  if (!o) return 'Unbekanntes Amt.';
  if (!state || state.status !== 'alive') return 'Du brauchst einen lebenden Charakter.';
  if (accountHours < c.minAccountHours) return `Kandidieren ist erst ${c.minAccountHours} Stunden nach der Registrierung möglich.`;
  if (state.politics.term) return 'Du bist bereits im Amt.';
  if (ageYears(state.person.birthDay, state.day) < pc.minAge) return `Mindestalter für Ämter: ${pc.minAge} Jahre.`;
  if (idx > 0 && !(state.politics.completed[idx - 1] > 0)) return `Zuerst musst du eine Amtszeit als ${pc.offices[idx - 1].name} absolvieren.`;
  return standingBlock(state, idx, c);
}

/** Ansehen für ein Amt: städtische Ämter brauchen örtliches, höhere landesweites Ansehen (rein; nutzt state.rep). */
function standingBlock(state, idx, c) {
  const st = RP.stand(state); const lv = idx >= c.firstNationalOffice ? st.lv : st.ll;
  return RP.block(lv, RP.officeMin(idx));
}

/** Wahlrecht (rein). ps = player_stats-Zeile des Wählers. */
function voteBlock(ps, accountHours, el, candidateId, c) {
  if (!c.enabled) return 'Spielerwahlen sind gerade nicht möglich.';
  if (!ps || ps.status !== 'alive') return 'Du brauchst einen lebenden Charakter.';
  if (accountHours < c.minAccountHours) return `Wählen ist erst ${c.minAccountHours} Stunden nach der Registrierung möglich.`;
  if (el.city_id && ps.city_id !== el.city_id) return 'Du darfst nur in der Stadt wählen, in der du wohnst.';
  if (ps.user_id === candidateId) return 'Für dich selbst darfst du nicht stimmen.';
  return null;
}

async function candidatesOf(electionId, conn = db) {
  return conn.query(
    `SELECT ec.user_id, ec.platform, COALESCE(ps.name, u.username) name, u.username, COALESCE(ps.influence, 0) influence, ps.city_id
     FROM election_candidates ec JOIN users u ON u.id = ec.user_id LEFT JOIN player_stats ps ON ps.user_id = ec.user_id WHERE ec.election_id = ? ORDER BY ec.created_at, ec.user_id`, [electionId]);
}

const cityName = (world, id) => { const x = id && world.city(id); return x ? x.name : 'Deutschland'; };

/* ---------------- Übersicht ---------------- */
async function overview(world, userId) {
  const c = cfg(); const now = Date.now();
  const p = await service.peek(userId); const state = p && p.state;
  const ps = await db.one('SELECT * FROM player_stats WHERE user_id = ?', [userId]);
  const cityId = ps ? ps.city_id : (state ? state.cityId : 0);
  const acc = await social.accountAgeHours(userId);
  const win = windowAt(now, c);
  const pc = world.econ.politics;
  const idxPrice = state ? world.idx(yearOf(state.day, state.startYear)) : 1;
  const mine = await db.one("SELECT e.id, e.office_idx FROM election_candidates ec JOIN elections e ON e.id = ec.election_id WHERE ec.user_id = ? AND e.status = 'open'", [userId]);
  const list = [];
  for (let idx = 0; idx < pc.offices.length; idx++) {
    const o = pc.offices[idx]; const sc = scopeCity(c, idx, cityId);
    const el = await db.one("SELECT * FROM elections WHERE office_idx = ? AND city_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", [idx, sc]);
    const cands = el ? await candidatesOf(el.id) : [];
    const cbadge = await require('./reputation').many(cands.map((x) => x.user_id), sc);
    const myVote = el ? await db.one('SELECT candidate_id FROM election_votes WHERE election_id = ? AND voter_id = ?', [el.id, userId]) : null;
    const voting = el ? now >= Number(el.vote_start) && now < Number(el.vote_end) : win.phase === 'voting';
    const block = state ? runBlock(world, state, idx, c, acc.h) : 'Du brauchst einen lebenden Charakter.';
    const fee = Math.round((scale(o.campaign, idxPrice) * c.feePct) / 100);
    let why = block;
    if (!why && sc && state && state.cityId !== sc) why = 'Du kandidierst in der Stadt, in der du wohnst.';
    if (!why && win.phase !== 'nomination') why = 'Die Kandidatur ist geschlossen – die Wahl läuft bereits.';
    if (!why && mine) why = 'Du kandidierst bereits in einer anderen Wahl.';
    if (!why && el && cands.length >= c.maxCandidates) why = 'Es gibt schon die maximale Zahl an Kandidaten.';
    if (!why && state && state.money < fee) why = 'Für die Kandidatur reicht dein Geld nicht.';
    list.push({
      idx, name: o.name, national: !sc, cityId: sc, city: cityName(world, sc), electionId: el ? el.id : null,
      voteStart: el ? Number(el.vote_start) : win.voteStart, voteEnd: el ? Number(el.vote_end) : win.voteEnd, voting, fee,
      minLevel: RP.officeMin(idx), minName: RP.officeMin(idx) >= 0 ? RP.levelName(RP.officeMin(idx)) : null,
      candidates: cands.map((x) => ({ userId: x.user_id, name: x.name, username: x.username, influence: x.influence, platform: x.platform, mine: x.user_id === userId, lv: (cbadge.get(x.user_id) || {})[sc ? 'll' : 'lv'] || 0 })),
      isCandidate: !!(el && cands.some((x) => x.user_id === userId)), myVote: myVote ? myVote.candidate_id : null,
      canRun: !why, whyNot: why || null,
      canVote: voting && !!el && !voteBlock(ps, acc.h, el, 0, c) && !myVote,
    });
  }
  const recent = await db.query("SELECT id, office_idx, city_id, vote_end, winner_id, result FROM elections WHERE status = 'done' AND (city_id = 0 OR city_id = ?) ORDER BY id DESC LIMIT 12", [cityId]);
  const results = recent.map((r) => {
    let res = null; try { res = JSON.parse(r.result); } catch (_) { /* leer */ }
    return { id: r.id, office: (pc.offices[r.office_idx] || {}).name, city: cityName(world, r.city_id), at: Number(r.vote_end), winner: res && res.winner, ranking: res ? res.ranking : [], total: res ? res.total : 0 };
  });
  return { enabled: !!c.enabled, now, phase: win.phase, voteStart: win.voteStart, voteEnd: win.voteEnd, cityId, city: cityName(world, cityId), offices: list, results, hasChance: !c.disableChance, minHours: c.minAccountHours };
}

/* ---------------- Kandidatur ---------------- */
async function run(userId, idx, platform) {
  const c = cfg(); idx = int(idx, -1);
  const acc = await social.accountAgeHours(userId);
  if (acc.mute > Date.now()) fail('Du bist vorübergehend stummgeschaltet.');
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx;
    const block = runBlock(world, state, idx, c, acc.h); if (block) fail(block);
    const sc = scopeCity(c, idx, state.cityId);
    const win = windowAt(Date.now(), c);
    if (win.phase !== 'nomination') fail('Die Kandidatur ist geschlossen – die Wahl läuft bereits. Die nächste Nominierung beginnt nach der Auszählung.');
    const busy = await conn.one("SELECT 1 x FROM election_candidates ec JOIN elections e ON e.id = ec.election_id WHERE ec.user_id = ? AND e.status = 'open' LIMIT 1", [userId]);
    if (busy) fail('Du kandidierst bereits in einer Wahl.');
    const o = offices(world)[idx];
    const fee = Math.round((scale(o.campaign, world.idx(yearOf(state.day, state.startYear))) * c.feePct) / 100);
    if (state.money < fee) fail('Für die Kandidatur reicht dein Geld nicht.');
    await conn.query('INSERT IGNORE INTO elections (office_idx, city_id, cycle, vote_start, vote_end) VALUES (?,?,?,?,?)', [idx, sc, win.cycle, win.voteStart, win.voteEnd]);
    const el = await conn.one('SELECT * FROM elections WHERE office_idx = ? AND city_id = ? AND cycle = ?', [idx, sc, win.cycle]);
    if (el.status !== 'open') fail('Diese Wahl ist bereits beendet.');
    const n = (await conn.one('SELECT COUNT(*) n FROM election_candidates WHERE election_id = ?', [el.id])).n;
    if (n >= c.maxCandidates) fail('Es gibt schon die maximale Zahl an Kandidaten.');
    await conn.query('INSERT INTO election_candidates (election_id, user_id, platform, fee) VALUES (?,?,?,?)', [el.id, userId, social.clean(platform || '', 200) || null, fee]);
    state.money -= fee; state.stats.spent += fee;
    chronicle(state, `${state.person.first} kandidiert für das Amt: ${o.name}.`, 'politics');
    return { msg: `Du kandidierst als ${o.name}. Gewählt wird ab ${new Date(Number(el.vote_start)).toLocaleString('de-DE')} (Wahlfenster ${c.voteHours} Stunden).`, level: 'good' };
  }, { needAlive: true });
}

async function withdraw(userId, electionId) {
  const el = await db.one("SELECT * FROM elections WHERE id = ? AND status = 'open'", [int(electionId)]);
  if (!el) fail('Diese Wahl gibt es nicht mehr.');
  if (Date.now() >= Number(el.vote_start)) fail('Nach Beginn der Wahl ist kein Rückzug mehr möglich.');
  const r = await db.query('DELETE FROM election_candidates WHERE election_id = ? AND user_id = ?', [el.id, userId]);
  if (!r.affectedRows) fail('Du kandidierst in dieser Wahl nicht.');
}

/* ---------------- Stimmabgabe ---------------- */
async function vote(userId, electionId, candidateId) {
  const c = cfg(); const now = Date.now();
  electionId = int(electionId); candidateId = int(candidateId);
  const el = await db.one("SELECT * FROM elections WHERE id = ? AND status = 'open'", [electionId]);
  if (!el) fail('Diese Wahl gibt es nicht mehr.');
  if (now < Number(el.vote_start)) fail('Das Wahlfenster ist noch nicht geöffnet.');
  if (now >= Number(el.vote_end)) fail('Das Wahlfenster ist geschlossen.');
  const cand = await db.one('SELECT user_id FROM election_candidates WHERE election_id = ? AND user_id = ?', [electionId, candidateId]);
  if (!cand) fail('Diesen Kandidaten gibt es nicht.');
  const ps = await db.one('SELECT ps.*, u.banned FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ps.user_id = ?', [userId]);
  if (ps && ps.banned) fail('Dein Konto ist gesperrt.');
  const acc = await social.accountAgeHours(userId);
  if (acc.mute > now) fail('Du bist vorübergehend stummgeschaltet.');
  const block = voteBlock(ps, acc.h, el, candidateId, c); if (block) fail(block);
  if (c.blockSameIp && await social.sameIp(userId, candidateId)) {
    try { await require('./anticheat').flag(userId, 'gift_ring', `Wahlstimme für ein Konto mit gleicher IP (Nutzer ${candidateId})`); } catch (_) { /* optional */ }
    fail('Für Konten, die dieselbe Internetverbindung nutzen, darfst du nicht stimmen.');
  }
  try { await db.query('INSERT INTO election_votes (election_id, voter_id, candidate_id) VALUES (?,?,?)', [electionId, userId, candidateId]); } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') fail('Du hast in dieser Wahl schon gewählt.');
    throw e;
  }
}

/* ---------------- Auszählung ---------------- */
async function finish(electionId) {
  const claim = await db.query("UPDATE elections SET status = 'done' WHERE id = ? AND status = 'open'", [electionId]);
  if (!claim.affectedRows) return null;
  const world = await require('../game/world').get(); const c = cfg();
  const el = await db.one('SELECT * FROM elections WHERE id = ?', [electionId]);
  const cands = await candidatesOf(electionId);
  const o = offices(world)[el.office_idx] || { name: 'Amt' };
  const place = cityName(world, el.city_id);
  const vrows = await db.query('SELECT candidate_id, COUNT(*) n FROM election_votes WHERE election_id = ? GROUP BY candidate_id', [electionId]);
  const human = {}; let humanTotal = 0; vrows.forEach((r) => { human[r.candidate_id] = Number(r.n); humanTotal += Number(r.n); });
  let botCount = 0;
  if (c.botVotes) botCount = Number((await db.one(`SELECT COUNT(*) n FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE u.is_bot = 1 AND u.banned = 0 AND ps.status = 'alive' ${el.city_id ? 'AND ps.city_id = ?' : ''}`, el.city_id ? [el.city_id] : [])).n);
  const bots = botVotesFor(electionId, cands.map((x) => ({ userId: x.user_id, influence: x.influence })), botCount, humanTotal, c);
  // Gewicht aus dem Ansehen: Wähler achten auf den Ruf (örtlich bei Stadtämtern); Amtsinhaber verlieren nach Skandalen zusätzlich
  const wmap = await require('./reputation').many(cands.map((x) => x.user_id), el.city_id);
  const incumbent = new Set();
  for (const x of cands) { try { const pk = await service.peek(x.user_id); const tm = pk && pk.state && pk.state.politics && pk.state.politics.term; if (tm && tm.idx === el.office_idx) incumbent.add(x.user_id); } catch (_) { /* ohne Amtsangabe */ } }
  const weightOf = (uid) => { const m = wmap.get(uid) || { s: 0, l: 0, scandal: 0 }; return RP.voteWeight(el.city_id ? m.l : m.s, m.scandal, incumbent.has(uid)); };
  const t = tally(cands.map((x) => ({ userId: x.user_id, influence: x.influence, weight: weightOf(x.user_id) })), human, bots);
  const nameOf = new Map(cands.map((x) => [x.user_id, x.name]));
  const ranking = t.ranking.map((r) => ({ userId: r.userId, name: nameOf.get(r.userId), votes: r.votes, human: r.human, bots: r.bots }));
  const winner = t.winnerId ? nameOf.get(t.winnerId) : null;
  await db.query('UPDATE elections SET winner_id = ?, result = ? WHERE id = ?', [t.winnerId, JSON.stringify({ winner, ranking, total: t.total, tie: t.tie }), electionId]);

  let seated = false;
  if (t.winnerId) {
    try {
      const r = await service.withCharacter(t.winnerId, async (ctx) => {
        const { state } = ctx;
        if (!state || state.status !== 'alive' || state.politics.term) return { seated: false };
        const pc = world.econ.politics;
        state.politics.term = { idx: el.office_idx, startDay: state.day, endDay: state.day + pc.termDays, cityId: el.city_id || 0 };
        state.fx.influence = (state.fx.influence || 0) + 2;
        RP.queue(state, 'office', 3 + el.office_idx, 'office_won', `e${electionId}`);
        award(state, 'partner');
        chronicle(state, `${state.person.first} wird zum ${o.name} gewählt.`, 'politics');
        press.story(world, state, 'elected', { office: o.name });
        notice(state, { level: 'good', title: `Wahl gewonnen: ${o.name}`, text: `Die Bürger haben dich zum ${o.name} gewählt (${ranking[0].votes} Stimmen).`, tab: 'society', interrupt: true, info: ['Du hast die Spielerwahl gewonnen.', 'Das Amt bringt Einkommen und Einfluss, kostet aber täglich Kraft.', 'Schau im Reiter „Gesellschaft“ nach deiner Amtszeit.'] });
        return { seated: true };
      });
      seated = !!r.seated;
    } catch (e) { log.warn(`[elections] Amtsantritt: ${e.message}`); }
  }
  const sum = ranking.length ? ranking.map((r) => `${r.name} ${r.votes}`).join(', ') : '';
  if (winner) {
    await tagesblatt.post('election', `Wahlergebnis: ${o.name}`, `Wahl zum ${o.name} in ${place}: ${winner} gewinnt mit ${ranking[0].votes} von ${t.total} Stimmen${t.tie ? ' (Gleichstand, der Einfluss entscheidet)' : ''}.${seated ? '' : ' Das Amt wird nicht angetreten.'}`, el.city_id);
  } else {
    await tagesblatt.post('election', `Wahlergebnis: ${o.name}`, `Wahl zum ${o.name} in ${place}: Es wurde niemand gewählt.`, el.city_id);
  }
  for (const x of cands) {
    const won = x.user_id === t.winnerId;
    if (!won) await require('./reputation').add(x.user_id, 'office', null, 'office_run', `e${electionId}`, { cityId: el.city_id });
    const subject = won ? `Wahl gewonnen: ${o.name}` : `Wahl verloren: ${o.name}`;
    const body = won ? `Glückwunsch! Du hast die Wahl zum ${o.name} in ${place} gewonnen.${seated ? '' : ' Das Amt konntest du nicht antreten.'}` : `Die Wahl zum ${o.name} in ${place} ist entschieden: ${winner ? `Es gewann ${winner}.` : 'Es wurde niemand gewählt.'} Ergebnis: ${sum}.`;
    try { await social.sendSystemLetter(x.user_id, subject, body); } catch (_) { /* Briefe sind optional */ }
  }
  return { winnerId: t.winnerId, ranking, seated };
}

async function tick() {
  if (!cfg().enabled) return;
  const due = await db.query("SELECT id FROM elections WHERE status = 'open' AND vote_end <= ?", [Date.now()]);
  for (const r of due) { try { await finish(r.id); } catch (e) { log.warn(`[elections] Auszählung ${r.id}: ${e.message}`); } }
  const keep = Math.max(7, int(cfg().keepDays, 60));
  const old = await db.query("SELECT id FROM elections WHERE status = 'done' AND created_at < NOW() - INTERVAL ? DAY", [keep]);
  for (const r of old) {
    await db.query('DELETE FROM election_votes WHERE election_id = ?', [r.id]);
    await db.query('DELETE FROM election_candidates WHERE election_id = ?', [r.id]);
    await db.query('DELETE FROM elections WHERE id = ?', [r.id]);
  }
}

function start() { setInterval(() => { tick().catch((e) => log.warn(`[elections] ${e.message}`)); }, 60000).unref(); }

module.exports = { standingBlock, windowAt, tally, botVotesFor, runBlock, voteBlock, scopeCity, overview, run, withdraw, vote, finish, tick, start };
