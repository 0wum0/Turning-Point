'use strict';
/**
 * Ehrenbürgerwürde: Ein Bürgermeister darf in seiner Amtszeit EINEM Bürger der Stadt die Würde verleihen.
 * Wirkung (begrenzt, Einstellungen ruf.honor): Gemeinwohl +civic und örtliches Ansehen +localPts für den Geehrten; der Bürgermeister
 * gewinnt etwas Amtsansehen. Vorschau vor der Bestätigung. Geehrt werden kann nur, wer vor Ort bereits Ansehen hat
 * (minLevel), kein Konto mit gleicher IP ist und nicht gerade erst geehrt wurde.
 */
const db = require('../db');
const settings = require('../settings');
const service = require('../game/service');
const R = require('../game/reputation');
const rep = require('./reputation');
const social = require('./social');
const tagesblatt = require('./tagesblatt');
const { ActionError } = require('../game/actions');
const { notice, chronicle } = require('../game/core');

const fail = (m) => { throw new ActionError(m); };
const cfg = () => (settings.get('ruf') || {}).honor || {};
const MAYOR = 2; // Index „Bürgermeister“ in economy.politics.offices
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Darf dieser Spielstand die Würde verleihen? Gibt einen Hinweistext oder null zurück (rein). */
function mayorBlock(state) {
  const t = state && state.status === 'alive' && state.politics && state.politics.term;
  if (!settings.get('ruf').enabled) return 'Ansehen ist gerade abgeschaltet.';
  if (!t || t.idx !== MAYOR) return 'Nur ein amtierender Bürgermeister kann die Ehrenbürgerwürde verleihen.';
  if (t.cityId && t.cityId !== state.cityId) return 'Du bist nicht mehr in der Stadt, in der du gewählt wurdest.';
  if ((t.honors || 0) >= Math.max(1, num(cfg().perTerm, 1))) return 'In dieser Amtszeit hast du die Würde schon verliehen.';
  return null;
}

async function candidateCheck(mayorId, state, targetId, world) {
  if (targetId === mayorId) fail('Du kannst dich nicht selbst ehren.');
  const t = await db.one('SELECT u.id, u.banned, u.social_public, ps.name, ps.username, ps.city_id, ps.status FROM users u JOIN player_stats ps ON ps.user_id = u.id WHERE u.id = ?', [targetId]);
  if (!t || t.banned || t.status !== 'alive') fail('Diesen Bürger gibt es nicht (mehr).');
  if (t.city_id !== state.cityId) fail('Die Würde geht nur an Bürger deiner Stadt.');
  if (!(await rep.countsFor(mayorId, targetId))) fail('Zwischen diesen Konten ist das nicht möglich (gleiche Internetverbindung oder zu neues Konto).');
  const r = await rep.get(targetId, state.cityId);
  const min = Math.max(0, num(cfg().minLevel, 1));
  if (r.localLevel < min) fail(`${t.name} hat vor Ort noch zu wenig Ansehen (nötig: ${R.levelName(min)}).`);
  const recent = await db.one("SELECT 1 x FROM reputation_log WHERE user_id = ? AND reason = 'honor' AND created_at > NOW() - INTERVAL 30 DAY LIMIT 1", [targetId]);
  if (recent) fail(`${t.name} wurde erst kürzlich geehrt.`);
  return { t, r };
}

/** Liste möglicher Kandidaten (Bürger der Stadt mit genug Ansehen) und der Stand der Würde des Bürgermeisters. */
async function overview(userId) {
  const p = await service.peek(userId); if (!p || !p.state) return { available: false };
  const { state } = p; const block = mayorBlock(state);
  const out = { available: !block, why: block, used: !!(state.politics.term && (state.politics.term.honors || 0) >= Math.max(1, num(cfg().perTerm, 1))), effects: { civic: num(cfg().civic, 8), localPts: num(cfg().localPts, 15), mayor: R.REASONS.honor_given.d }, minName: R.levelName(Math.max(0, num(cfg().minLevel, 1))), candidates: [] };
  if (!state.politics.term || state.politics.term.idx !== MAYOR) return { ...out, available: false };
  const rows = await db.query("SELECT ps.user_id id, ps.name, ps.username FROM player_stats ps JOIN users u ON u.id = ps.user_id WHERE ps.city_id = ? AND ps.status = 'alive' AND u.banned = 0 AND u.social_public = 1 AND ps.user_id <> ? ORDER BY ps.wealth DESC LIMIT 80", [state.cityId, userId]);
  const m = await rep.many(rows.map((r) => r.id), state.cityId);
  const min = Math.max(0, num(cfg().minLevel, 1));
  out.candidates = rows.map((r) => ({ userId: r.id, name: r.name, username: r.username, lv: (m.get(r.id) || {}).ll || 0, score: (m.get(r.id) || {}).l || 0 })).filter((x) => x.lv >= min).sort((a, b) => b.score - a.score).slice(0, 12);
  return out;
}

/** Vorschau: was würde passieren? */
async function preview(mayorId, targetId) {
  const p = await service.peek(mayorId); if (!p || !p.state) fail('Du brauchst einen lebenden Charakter.');
  const block = mayorBlock(p.state); if (block) fail(block);
  const { t, r } = await candidateCheck(mayorId, p.state, targetId, p.w);
  const civic = num(cfg().civic, 8); const pts = num(cfg().localPts, 15);
  const after = R.levelOf(R.localScore(r.score + civic * 0.25, r.local + pts + civic * 0.25));
  return {
    target: { userId: t.id, name: t.name, username: t.username, level: r.localLevel, levelName: r.localName },
    gain: { civic, localPts: pts, afterLevel: Math.max(r.localLevel, Math.min(4, after)), afterName: R.levelName(Math.max(r.localLevel, Math.min(4, after))), mayor: R.REASONS.honor_given.d },
    text: `${t.name} wird Ehrenbürger von ${(p.w.city(p.state.cityId) || {}).name || 'deiner Stadt'}: Gemeinwohl +${civic}, örtliches Ansehen +${pts}. Du gewinnst selbst ein wenig Amtsansehen. Das geht nur einmal pro Amtszeit. Danach wäre ${t.name} vor Ort „${R.levelName(Math.max(r.localLevel, Math.min(4, after)))}“ (jetzt: ${r.localName}).`,
  };
}

/** Verleihen (bestätigt). */
async function grant(mayorId, targetId) {
  const world = await require('../game/world').get();
  let info = null;
  await service.withCharacter(mayorId, async (ctx) => {
    const { state, conn } = ctx;
    const block = mayorBlock(state); if (block) fail(block);
    const { t } = await candidateCheck(mayorId, state, targetId, world);
    const term = state.politics.term; term.honors = (term.honors || 0) + 1;
    R.queue(state, 'office', null, 'honor_given', `u${targetId}`);
    const city = (world.city(state.cityId) || {}).name || 'der Stadt';
    notice(state, { level: 'good', title: 'Ehrenbürgerwürde verliehen', text: `Neuer Ehrenbürger von ${city}: ${t.name}.`, tab: 'society' });
    chronicle(state, `${state.person.first} verleiht ${t.name} die Ehrenbürgerwürde von ${city}.`, 'politics');
    const nm = ctx.user.social_public ? `${state.person.first} ${state.person.last}` : 'Der Bürgermeister';
    info = { t, city, cityId: state.cityId, nm, conn: null };
    return { ok: true };
  }, { needAlive: true });
  // Wirkung beim Geehrten (eigene Transaktion, nach dem Commit des Bürgermeisters)
  const civic = num(cfg().civic, 8); const pts = num(cfg().localPts, 15);
  await rep.add(targetId, 'civic', civic, 'honor', `m${mayorId}`, { other: mayorId, cityId: info.cityId });
  await rep.bumpLocal(targetId, info.cityId, pts);
  await social.sendSystemLetter(targetId, 'Ehrenbürgerwürde', `${info.nm} verleiht dir die Ehrenbürgerwürde von ${info.city}. Dein Ansehen vor Ort ist gestiegen.`, mayorId);
  await tagesblatt.post('election', 'Ehrenbürgerwürde', `${info.nm} verleiht ${info.t.name} die Ehrenbürgerwürde von ${info.city}.`, info.cityId);
  return { name: info.t.name };
}

module.exports = { mayorBlock, overview, preview, grant, MAYOR };
