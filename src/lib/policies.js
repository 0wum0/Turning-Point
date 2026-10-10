'use strict';
/**
 * Wirtschaftspolitik der Amtsinhaber. Wer ein Amt (Stadtrat … Bundeskanzler) hält, darf pro Amtszeit EINEN Beschluss fassen
 * (goods_policies, UNIQUE je Inhaber+Amtszeit). Der Beschluss gilt bis zum Ende der Amtszeit (in echter Zeit umgerechnet) und
 * erlischt vorher, wenn der Inhaber das Amt verliert oder zurücktritt (player_stats.office). Die Wirkung (Gewerbesteuer-Zuschlag,
 * Mehrwertsteuer, Zoll, Subventionen, Preisstützung) liest src/game/goods.js aus einem Zwischenspeicher, der hier alle zwei Minuten
 * und nach jedem Beschluss neu aufgebaut wird. Auch die Knappheit je Stadt und Ware entsteht hier aus den veröffentlichten Betrieben.
 */
const db = require('../db');
const settings = require('../settings');
const log = require('./log');
const service = require('../game/service');
const goods = require('../game/goods');
const tagesblatt = require('./tagesblatt');
const live = require('./live');
const { ActionError } = require('../game/actions');
const { yearOf } = require('../game/calendar');
const { notice, chronicle } = require('../game/core');

const fail = (m) => { throw new ActionError(m); };
const worldP = () => require('../game/world').get();
const msPerGameDay = () => 86400000 / Math.max(1, Number(settings.get('game.clock_days_per_day')) || 365);
const sign = (v) => (v > 0 ? `+${v}` : `${v}`);

let ACTIVE = []; // Beschlüsse, die gerade wirken (für die Anzeige)

/** Beschreibung eines Beschlusses in einem Satz (landet auch im Tagesblatt). */
function describe(world, r) {
  const g = r.good && goods.good(r.good);
  const city = r.scope_city ? world.city(r.scope_city) : null;
  switch (r.kind) {
    case 'surcharge': return `Gewerbesteuer-Zuschlag in ${city ? city.name : 'der Stadt'}: ${sign(r.val)} Punkte`;
    case 'subsidy': return `Stadt-Subvention in ${city ? city.name : 'der Stadt'}: ${r.val} % Zuschuss auf ${g ? g.name : r.good}`;
    case 'support': return `Preisstützung in ${r.region || 'der Region'}: +${r.val} % für ${g ? g.name : r.good}`;
    case 'frame': { const f = (settings.get('goods').policy || {}).frames || {}; const x = f[r.good] || {}; return `Rahmen für Zuschläge und Subventionen: ${x.name || r.good} (Zuschlag höchstens ${x.maxSurcharge} Punkte, Subvention höchstens ${x.maxSubsidy} %)`; }
    case 'vat': return `Mehrwertsteuer auf Waren: ${sign(r.val)} Punkte`;
    case 'tariff': return `Einfuhrzoll: ${sign(r.val)} %`;
    case 'rentcap': return `Mietpreisbremse in ${city ? city.name : 'der Stadt'}: Mietniveau steigt höchstens ${r.val} % pro Jahr`;
    case 'landzone': return `Baulandausweisung in ${city ? city.name : 'der Stadt'}: ${r.val} % mehr Wohnungsangebot`;
    case 'housing': return `Wohnungsbauprogramm in ${r.region || 'der Region'}: ${r.val} % mehr Wohnungsangebot`;
    case 'pricebrake': return `${r.val < 0 ? 'Preisbremse' : 'Inflationsziel'}: Preisniveau ${sign(r.val)} Punkte`;
    case 'natsubsidy': return `Branchen-Subvention im Land: ${r.val} % Zuschuss auf ${g ? g.name : r.good}`;
    default: return r.kind;
  }
}

/** Zwischenspeicher neu aufbauen: Knappheit je Stadt/Ware und wirksame Beschlüsse. */
async function refresh() {
  const world = await worldP();
  const firms = await db.query("SELECT f.city_id, f.pkey, f.tier, f.rooms, ps.year FROM player_firms f JOIN player_stats ps ON ps.user_id = f.user_id WHERE f.abandoned = 0 AND ps.status = 'alive'");
  goods.setScarcity(goods.computeScarcity(world, firms));
  const rows = await db.query(
    `SELECT p.*, ps.office, ps.status, ps.name holder, u.social_public FROM goods_policies p JOIN player_stats ps ON ps.user_id = p.user_id JOIN users u ON u.id = p.user_id
     WHERE p.expires_at > ? ORDER BY p.id`, [Date.now()]);
  const offices = world.econ.politics.offices;
  const valid = rows.filter((r) => r.status === 'alive' && r.office === (offices[r.office_idx] || {}).name);
  goods.setPolicies(goods.buildPolicies(valid));
  require('./court-policy').refresh().catch((e) => log.warn(`[gericht] ${e.message}`));
  ACTIVE = valid.map((r) => ({ id: r.id, kind: r.kind, good: r.good, val: r.val, cityId: r.scope_city, region: r.region, office: r.office, holder: r.social_public ? r.holder : null, until: Number(r.expires_at), text: describe(world, r) }));
}

/** Übersicht für „Dein Amt“ und „Warenkreislauf“. */
async function overview(userId) {
  const p = await service.peek(userId); if (!p || !p.state) return { enabled: false };
  const { w: world, state } = p; const year = yearOf(state.day, state.startYear);
  const t = state.politics && state.politics.term; const city = world.city(state.cityId);
  const idx = world.idx(year);
  const pc = world.econ.politics;
  const ef = goods.effectsFor(world, state.cityId);
  const fr = goods.frame();
  const out = {
    enabled: (settings.get('goods').policy || {}).enabled !== false && goods.enabled(), year, idx,
    frame: { name: fr.name, maxSurcharge: fr.maxSurcharge, maxSubsidy: fr.maxSubsidy },
    local: { city: city ? city.name : null, region: city ? city.state : null, surcharge: ef.surcharge, levy: Math.round(ef.levy * 10) / 10, vat: ef.vat, tariff: ef.tariff, subsidy: ef.subsidy, support: ef.support, zone: ef.zone, rentCap: ef.rentCap, brake: ef.brake },
    active: ACTIVE.filter((a) => (!a.cityId || a.cityId === state.cityId) && (!a.region || (city && a.region === city.state))).map((a) => ({ kind: a.kind, text: a.text, office: a.office, holder: a.holder, hours: Math.max(0, Math.round((a.until - Date.now()) / 3600000)) })),
    office: null,
  };
  if (t) {
    const o = pc.offices[t.idx] || {};
    const cityOk = !t.cityId || t.cityId === state.cityId;
    out.office = {
      idx: t.idx, name: o.name, daysLeft: Math.max(0, t.endDay - state.day), cityOk, cityName: t.cityId ? (world.city(t.cityId) || {}).name : null,
      powers: goods.powersOf(world, t.idx, year), used: t.policy ? { kind: t.policy.kind, text: t.policy.text || '' } : null,
    };
  }
  return out;
}

function rowFrom(world, state, input) {
  const t = state.politics && state.politics.term; if (!t) fail('Du hast kein Amt.');
  if ((settings.get('goods').policy || {}).enabled === false || !goods.enabled()) fail('Wirtschaftspolitik ist gerade nicht möglich.');
  const year = yearOf(state.day, state.startYear);
  if (t.cityId && t.cityId !== state.cityId) fail('Du bist nicht mehr in der Stadt, in der du gewählt wurdest.');
  try { return goods.normalizePolicy(world, t.idx, world.city(state.cityId), year, input || {}); } catch (e) { return fail(e.message); }
}

async function preview(userId, input) {
  const p = await service.peek(userId); if (!p || !p.state || p.state.status !== 'alive') fail('Du brauchst einen lebenden Charakter.');
  const row = rowFrom(p.w, p.state, input);
  return { preview: goods.previewPolicy(p.w, row, yearOf(p.state.day, p.state.startYear), p.state.cityId), text: describe(p.w, row) };
}

/** Beschluss fassen: einmal je Amtszeit. */
async function set(userId, input) {
  return service.withCharacter(userId, async (ctx) => {
    const { world, state, conn } = ctx;
    const t = state.politics.term;
    const row = rowFrom(world, state, input);
    if (t.policy) fail('In dieser Amtszeit hast du schon einen Beschluss gefasst. Mit der nächsten Wahl darfst du wieder entscheiden.');
    const key = `${state.person.id}:${t.startDay}`;
    const expires = Date.now() + Math.max(1, t.endDay - state.day) * msPerGameDay();
    try {
      await conn.query('INSERT INTO goods_policies (user_id, term_key, office_idx, kind, good, val, scope_city, region, expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [userId, key, row.office_idx, row.kind, row.good, row.val, row.scope_city, row.region, expires]);
    } catch (e) { if (e && e.code === 'ER_DUP_ENTRY') fail('In dieser Amtszeit hast du schon einen Beschluss gefasst.'); throw e; }
    const text = describe(world, row);
    { const RP = require('../game/reputation'); const mood = RP.policyMood(row.kind, row.val); if (mood) RP.queue(state, 'office', null, mood > 0 ? 'policy_popular' : 'policy_unpopular', row.kind); } // beliebte Beschlüsse mehren das Ansehen
    t.policy = { kind: row.kind, good: row.good, val: row.val, day: state.day, text };
    const office = world.econ.politics.offices[t.idx].name;
    chronicle(state, `${state.person.first} beschließt als ${office}: ${text}.`, 'politics');
    notice(state, { level: 'good', title: 'Beschluss gefasst', tab: 'society', text: `${text}. Er gilt bis zum Ende deiner Amtszeit.`, info: ['Als Amtsinhaber darfst du pro Amtszeit einen Beschluss fassen.', 'Er verändert Preise, Steuern oder Zuschüsse für alle Betriebe im Geltungsbereich – auch für dich.', 'Mit der nächsten Amtszeit darfst du neu entscheiden.'] });
    const nm = ctx.user.social_public ? `${state.person.first} ${state.person.last}` : 'Ein Amtsinhaber';
    await tagesblatt.post('election', `Beschluss: ${office}`, `Beschluss von ${nm} (${office}): ${text}.`, row.scope_city || 0, conn);
    return { msg: `Beschluss gefasst: ${text}.`, level: 'good' };
  }, { needAlive: true }).then(async (r) => { await refresh().catch((e) => log.warn(`[policies] ${e.message}`)); await require('./cityecon').refresh().catch((e) => log.warn(`[stadtwirtschaft] ${e.message}`)); live.publish('economy', {}); return r; });
}

module.exports = { refresh, overview, preview, set, describe };
